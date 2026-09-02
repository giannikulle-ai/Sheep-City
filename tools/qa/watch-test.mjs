#!/usr/bin/env node
// Sheepcliff watch test: load a build headless, leave it alone for N seconds,
// and count the distinct noticeable moments it produces. Fewer than --min
// (default 3) is a failed build for feel (docs/SHEEPCLIFF_PLAN.md section 10).
//
//   node tools/qa/watch-test.mjs [seconds] [--url <url> | --serve <dir>] [--min 3] [--adapter auto|prototype|app]
//                                [--day <seconds>] [--out <dir>] [--no-shots] [--headed]
//
// `--serve apps/web/dist` serves a built app on a local port and watches that
// instead of a URL; `npm run watch-test:app -w apps/web` does exactly this.
//
// Moments arrive as `moment` CustomEvents on window (contract: tools/qa/README.md).
// The prototype does not emit them, so the prototype adapter injects a probe
// that synthesises the same events from the sim's state and DOM. Switching to
// the real app is `--adapter app` (or automatic once the page stops looking
// like the prototype).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './lib/browser.mjs';
import { MOMENT_BRIDGE } from './lib/moment-listener.mjs';
import { PROTOTYPE_GLOBALS, PROTOTYPE_PROBE } from './lib/prototype-probe.mjs';
import { serveStatic } from './lib/static-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const PROTOTYPE_URL = pathToFileURL(path.join(repoRoot, 'prototype/luna-farm/build/farm_sim.html')).href;

// Kinds that count toward the gate. Anything else is logged as context only:
// clock phases are guaranteed by the clock, and small life is easy to miss.
export const COUNTED_KINDS = new Set(['bubble', 'npc-arrival', 'weather', 'dl-trick', 'lamb']);

export function parseArgs(argv) {
  const opts = {
    seconds: 300, url: process.env.SHEEPCLIFF_WATCH_URL ?? PROTOTYPE_URL, min: 3, adapter: 'auto',
    day: null, out: path.join(here, 'out', 'watch'), shots: true, headed: false, maxShots: 16, serve: null,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${a} needs a value`); return v; };
    if (a === '--url') opts.url = next();
    else if (a === '--serve') opts.serve = path.resolve(next());
    else if (a === '--min') opts.min = Number(next());
    else if (a === '--adapter') opts.adapter = next();
    else if (a === '--day') opts.day = Number(next());
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--no-shots') opts.shots = false;
    else if (a === '--headed') opts.headed = true;
    else if (a === '--help' || a === '-h') { opts.help = true; }
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else rest.push(a);
  }
  if (rest.length > 1) throw new Error(`unexpected arguments: ${rest.slice(1).join(' ')}`);
  if (rest.length === 1) opts.seconds = Number(rest[0]);
  if (!Number.isFinite(opts.seconds) || opts.seconds <= 0) throw new Error('seconds must be a positive number');
  if (!Number.isInteger(opts.min) || opts.min < 0) throw new Error('--min must be a non-negative integer');
  if (!['auto', 'prototype', 'app'].includes(opts.adapter)) throw new Error('--adapter must be auto, prototype, or app');
  if (opts.day !== null && !(opts.day > 0)) throw new Error('--day must be a positive number of seconds');
  if (opts.serve && argv.includes('--url')) throw new Error('--serve and --url are exclusive');
  return opts;
}

const USAGE = `usage: watch-test.mjs [seconds=300] [--url <url> | --serve <dir>] [--min 3] [--adapter auto|prototype|app] [--day <seconds>] [--out <dir>] [--no-shots] [--headed]`;

const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const momentKey = (m) => `${m.kind}:${m.detail ?? m.actor ?? '?'}`;
const safe = (s) => s.replace(/[^a-z0-9._-]+/gi, '_');

// Reads the world canvas so the runner can tell a live scene from a frozen one.
const CANVAS_HASH = `(() => {
  const c = document.querySelector('canvas#world, canvas#scene, canvas');
  if (!c) return null;
  const ctx = c.getContext('2d'); if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let h = 2166136261;
  for (let i = 0; i < data.length; i += 16) { h ^= data[i]; h = Math.imul(h, 16777619); }
  return h >>> 0;
})()`;

async function detectAdapter(page, wanted) {
  const looksLikePrototype = await page.evaluate(
    (globals) => !!document.querySelector('canvas#world') && globals.every((g) => { try { return eval(`typeof ${g}`) !== 'undefined'; } catch { return false; } }),
    PROTOTYPE_GLOBALS,
  );
  if (wanted === 'prototype' && !looksLikePrototype) throw new Error(`--adapter prototype but the page is missing #world or one of: ${PROTOTYPE_GLOBALS.join(', ')}`);
  if (wanted === 'app') return 'app';
  return looksLikePrototype ? 'prototype' : 'app';
}

async function waitReady(page, adapter) {
  if (adapter === 'prototype') {
    await page.waitForFunction(() => sheetImg.complete && Object.values(BG).every((i) => i.complete), null, { timeout: 15_000 });
    return;
  }
  // The app marks readiness on <body data-ready="1">; a page that never does is reported, not fatal.
  const ready = await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 15_000 }).then(() => true, () => false);
  if (!ready) console.warn('warn: body[data-ready="1"] never appeared; watching anyway');
}

async function setDayLength(page, adapter, seconds) {
  if (adapter === 'prototype') {
    await page.evaluate((s) => {
      clock.period = s;
      const sel = document.getElementById('period');
      if ([...sel.options].some((o) => +o.value === s)) sel.value = String(s);
    }, seconds);
    return;
  }
  const done = await page.evaluate((s) => { const qa = window.sheepcliff?.qa; if (qa?.setDayLength) { qa.setDayLength(s); return true; } return false; }, seconds);
  if (!done) console.warn('warn: --day ignored, the app exposes no window.sheepcliff.qa.setDayLength');
}

export async function run(opts) {
  mkdirSync(opts.out, { recursive: true });
  const server = opts.serve ? await serveStatic(opts.serve) : null;
  if (server) opts = { ...opts, url: server.url };
  const browser = await launch({ headed: opts.headed });
  const context = await browser.newContext({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const started = Date.now();
  const moments = [];
  const pageErrors = [];
  const seen = new Set();
  let shotChain = Promise.resolve();
  let shotCount = 0;

  page.on('pageerror', (e) => pageErrors.push(String(e)));
  // Resource failures are reported with their URL (the console line has none); a missing favicon is browser noise.
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) pageErrors.push(`console.error: ${msg.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !/\/favicon\.ico$/.test(r.url())) pageErrors.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => { if (!/\/favicon\.ico$/.test(r.url())) pageErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? '?'})`); });
  await page.exposeFunction('__sheepcliffMoment', (m) => {
    const at = Date.now() - started;
    const rec = { ...m, at, key: momentKey(m), counted: COUNTED_KINDS.has(m.kind) };
    moments.push(rec);
    const fresh = rec.counted && !seen.has(rec.key);
    if (rec.counted) seen.add(rec.key);
    const t = rec.t == null ? '' : ` (clock ${rec.t.toFixed(2)})`;
    console.log(`[${mmss(at)}] ${fresh ? '*' : ' '} ${rec.kind.padEnd(11)} ${(rec.actor ?? '').padEnd(12)} ${rec.detail ?? ''}${t}`);
    if (opts.shots && fresh && shotCount < opts.maxShots) {
      const n = ++shotCount;
      const file = path.join(opts.out, `moment-${String(n).padStart(2, '0')}-${safe(rec.key)}.png`);
      rec.shot = path.relative(repoRoot, file);
      shotChain = shotChain.then(() => page.screenshot({ path: file })).catch((e) => console.warn(`warn: screenshot failed: ${e}`));
    }
  });
  await page.addInitScript(MOMENT_BRIDGE);

  console.log(`watch-test: ${opts.url}`);
  await page.goto(opts.url, { waitUntil: 'load' });
  const adapter = await detectAdapter(page, opts.adapter);
  await waitReady(page, adapter);
  if (adapter === 'prototype') await page.evaluate(PROTOTYPE_PROBE);
  if (opts.day !== null) await setDayLength(page, adapter, opts.day);
  console.log(`watch-test: adapter=${adapter}, ${opts.seconds}s unattended, gate: at least ${opts.min} distinct of ${[...COUNTED_KINDS].join('/')}`);

  // Liveness: the canvas must keep changing. Sampled every 5 s; a frozen scene is a finding.
  const hashes = [];
  const deadline = started + opts.seconds * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.min(5000, deadline - Date.now()));
    hashes.push(await page.evaluate(CANVAS_HASH));
  }
  const alive = hashes.length < 2 || new Set(hashes).size > 1;
  const probe = adapter === 'prototype' ? await page.evaluate(() => window.__sheepcliffProbe) : null;
  if (probe?.errors?.length) pageErrors.push(...probe.errors.map((e) => `probe: ${e}`));
  await shotChain;
  const finalShot = path.join(opts.out, 'final.png');
  await page.screenshot({ path: finalShot });
  await browser.close();
  if (server) await server.close();

  const counted = moments.filter((m) => m.counted);
  const extras = moments.filter((m) => !m.counted);
  const distinct = [...seen];
  const failures = [];
  if (distinct.length < opts.min) failures.push(`only ${distinct.length} distinct moment(s), need ${opts.min}`);
  if (!alive) failures.push('the canvas did not change between samples; the scene is frozen');
  if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);

  const report = {
    url: opts.url, adapter, seconds: opts.seconds, min: opts.min, dayLength: opts.day, startedAt: new Date(started).toISOString(),
    pass: failures.length === 0, failures, distinct, countedMoments: counted.length, extraMoments: extras.length,
    kinds: Object.fromEntries([...COUNTED_KINDS].map((k) => [k, counted.filter((m) => m.kind === k).length])),
    moments, pageErrors, canvasSamples: hashes.length, canvasAlive: alive, finalShot: path.relative(repoRoot, finalShot),
  };
  writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(report, null, 2));

  console.log('');
  console.log(`watch-test summary: ${counted.length} counted moments (${extras.length} extra) in ${opts.seconds}s, ${distinct.length} distinct: ${distinct.join(', ') || 'none'}`);
  for (const [k, n] of Object.entries(report.kinds)) console.log(`  ${k.padEnd(11)} ${n}`);
  if (extras.length) console.log(`  extras     ${[...new Set(extras.map(momentKey))].join(', ')}`);
  console.log(`  canvas     ${alive ? 'alive' : 'FROZEN'} (${hashes.length} samples)`);
  for (const e of pageErrors) console.log(`  page error ${e}`);
  console.log(`  report     ${path.relative(repoRoot, path.join(opts.out, 'report.json'))}`);
  console.log(report.pass ? `watch-test: PASS (${distinct.length} >= ${opts.min})` : `watch-test: FAIL: ${failures.join('; ')}`);
  return report;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`watch-test: ${e.message}\n${USAGE}`); process.exit(2); }
  if (opts.help) { console.log(USAGE); process.exit(0); }
  run(opts).then((r) => process.exit(r.pass ? 0 : 1), (e) => { console.error(`watch-test: ${e?.stack ?? e}`); process.exit(2); });
}

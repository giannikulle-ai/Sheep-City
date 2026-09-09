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
import { eligibleBands, neverEligibleCards } from './lib/deck-coverage.mjs';
import { loadFarmDeck } from './lib/deck.mjs';
import { MOMENT_BRIDGE } from './lib/moment-listener.mjs';
import { PROTOTYPE_GLOBALS, PROTOTYPE_PROBE } from './lib/prototype-probe.mjs';
import { serveStatic } from './lib/static-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
export const PROTOTYPE_URL = pathToFileURL(path.join(repoRoot, 'prototype/luna-farm/build/farm_sim.html')).href;

// Kinds that count toward the gate. Anything else is logged as context only:
// clock phases are guaranteed by the clock, and small life is easy to miss.
// `deity` (issue #44): a player-driven weather or act power, counted so the log shows a deity
// reaction is distinct from the world's own moments, not folded into `weather` or `bubble`.
export const COUNTED_KINDS = new Set(['bubble', 'npc-arrival', 'weather', 'dl-trick', 'lamb', 'deity']);

// --- --events mode: card and authored-event coverage over a scripted span (issue #49) -----------
//
// Not the five-minute feel gate above: this drives the built app on its own QA clock (`qa.seed`,
// then only `qa.step` ever advances it — no wall-clock waiting) through every season × weather
// combination the deck's conditions read, long enough at each to give the engine's own pacing
// (`packages/sim/src/engine/pacing.ts`) several looks, then reports, per farm card and per
// authored event, whether it was ever seen starting and ending. Time of day is not forced — the
// clock runs its own day/night cycle inside each combo's dwell (a short day length so every band
// comes round many times) — since there is no client intent for it (`setClock` moves the day
// fraction once; it does not hold there against the clock's own advance).
//
// Coverage here is a report, not a gate: the world-time pace floors (a small thing most farm days,
// a big thing a few times a farm month) are #101's card-size ticket, decision 16
// (docs/SHEEPCLIFF_PLAN.md) — this mode does not assert a rate. The one thing it fails on is data,
// not luck: a card whose own `conditions` admit no season × time band at all could never fire in
// any run, at any seed, of any length (`neverEligibleCards`, lib/deck-coverage.mjs).
const EVENTS_DEFAULT_SEED = 7;
const EVENTS_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const EVENTS_WEATHERS = ['sun', 'rain', 'snow'];
/** Sim-days per season × weather combo's dwell, at the short day length below — long enough for
 * several of the engine's `evalEverySimMinutes: 2` looks and a few of its `minGapSimMinutes: 800`
 * (about 0.56 of a day) global gaps between draws. */
const EVENTS_DAY_SEC = 3;

function trackKindOf(entry) {
  return entry.kind === 'card' ? 'card' : 'authored';
}

/** Every id the deck carries, cards then authored, each with the fields the table and the fail
 * check need. Kept separate from the live page read so the static `eligible` read never depends on
 * what one run happened to draw. */
function deckRows(deck, momentKindOf) {
  const rows = [];
  for (const card of deck.cards) {
    rows.push({ kind: 'card', id: card.id, title: card.title, momentKind: momentKindOf(card.id), eligible: eligibleBands(card).eligible, note: '' });
  }
  for (const event of deck.authored) {
    const note = event.deferred ? `deferred (${event.trigger.kind}, ticket ${event.deferred.ticket})` : `trigger: ${event.trigger.kind}`;
    rows.push({ kind: 'authored', id: event.id, title: event.title, momentKind: momentKindOf(event.id), eligible: null, note });
  }
  return rows;
}

export async function runEvents(opts) {
  mkdirSync(opts.out, { recursive: true });
  const { FARM_DECK, momentKindOf } = await loadFarmDeck();
  const impossible = neverEligibleCards(FARM_DECK);

  const server = opts.serve ? await serveStatic(opts.serve) : null;
  if (server) opts = { ...opts, url: server.url };
  const browser = await launch({ headed: opts.headed });
  const context = await browser.newContext({ viewport: { width: 1000, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) pageErrors.push(`console.error: ${msg.text()}`); });

  console.log(`watch-test --events: ${opts.url}`);
  await page.goto(opts.url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 }).catch(() => {});
  const hasHooks = await page.evaluate(() => !!(window.sheepcliff?.qa?.seed && window.sheepcliff?.qa?.step && window.sheepcliff?.send && window.sheepcliff?.sim));
  if (!hasHooks) throw new Error('--events needs the app adapter: window.sheepcliff.qa/send/sim were not found on this page');

  const dayLenSec = opts.day ?? EVENTS_DAY_SEC;
  const combos = EVENTS_SEASONS.flatMap((season) => EVENTS_WEATHERS.map((weather) => ({ season, weather })));
  const totalFrames = Math.round(opts.seconds * 60);
  const framesPerCombo = Math.max(60, Math.floor(totalFrames / combos.length));

  await page.evaluate((seed) => window.sheepcliff.qa.seed(seed), opts.seed);
  await page.evaluate((s) => window.sheepcliff.send({ type: 'setPeriod', periodSec: s }), dayLenSec);
  console.log(`watch-test --events: seed=${opts.seed}, day=${dayLenSec}s, ${combos.length} season×weather combos, ${framesPerCombo} frames (${(framesPerCombo / 60).toFixed(1)} qa-clock s) each`);

  for (const { season, weather } of combos) {
    await page.evaluate(({ season, weather }) => {
      window.sheepcliff.send({ type: 'setSeason', season });
      window.sheepcliff.send({ type: 'setWeather', weather });
    }, { season, weather });
    await page.evaluate((frames) => window.sheepcliff.qa.step(frames), framesPerCombo);
  }

  const finalState = await page.evaluate(() => {
    const s = window.sheepcliff.sim();
    const sourceCounts = {};
    for (const e of s.chronicle.entries) sourceCounts[e.source] = (sourceCounts[e.source] ?? 0) + 1;
    return { starts: Object.keys(s.events.starts), cooldowns: Object.keys(s.events.cooldowns), chronicleCount: s.chronicle.entries.length, sourceCounts };
  });
  const finalShot = path.join(opts.out, 'events-final.png');
  await page.screenshot({ path: finalShot });
  await browser.close();
  if (server) await server.close();

  const started = new Set(finalState.starts);
  const ended = new Set(finalState.cooldowns);
  const rows = deckRows(FARM_DECK, momentKindOf).map((r) => ({ ...r, seenStart: started.has(r.id), seenEnd: ended.has(r.id) }));

  const failures = impossible.map((c) => `card "${c.id}": ${c.reason}`);
  if (pageErrors.length) failures.push(`${pageErrors.length} page error(s)`);

  const report = {
    url: opts.url, seed: opts.seed, dayLenSec, seconds: opts.seconds, combos: combos.length, framesPerCombo,
    pass: failures.length === 0, failures, rows, chronicleCount: finalState.chronicleCount, sourceCounts: finalState.sourceCounts,
    pageErrors, finalShot: path.relative(repoRoot, finalShot),
  };
  writeFileSync(path.join(opts.out, 'events-report.json'), JSON.stringify(report, null, 2));

  console.log('');
  console.log(`card/authored coverage over the scripted span (seed ${opts.seed}, ${combos.length} combos × ${(framesPerCombo / 60).toFixed(1)} qa-clock s):`);
  console.log(`  ${'id'.padEnd(21)} ${'kind'.padEnd(9)} ${'moment'.padEnd(11)} ${'start'.padEnd(5)} ${'end'.padEnd(5)}  note`);
  for (const r of rows) {
    console.log(`  ${r.id.padEnd(21)} ${r.kind.padEnd(9)} ${(r.momentKind ?? '?').padEnd(11)} ${(r.seenStart ? 'yes' : 'no').padEnd(5)} ${(r.seenEnd ? 'yes' : 'no').padEnd(5)}  ${r.note}`);
  }
  const cardSeenStart = rows.filter((r) => r.kind === 'card' && r.seenStart).length;
  const cardCount = rows.filter((r) => r.kind === 'card').length;
  const authoredSeenStart = rows.filter((r) => r.kind === 'authored' && r.seenStart).length;
  const authoredCount = rows.filter((r) => r.kind === 'authored').length;
  console.log('');
  console.log(`  cards started    ${cardSeenStart}/${cardCount}`);
  console.log(`  authored started ${authoredSeenStart}/${authoredCount}`);
  console.log(`  chronicle        ${finalState.chronicleCount} entries: ${Object.entries(finalState.sourceCounts).map(([k, n]) => `${k}=${n}`).join(', ') || 'none'}`);
  for (const e of pageErrors) console.log(`  page error ${e}`);
  console.log(`  report           ${path.relative(repoRoot, path.join(opts.out, 'events-report.json'))}`);
  console.log(
    report.pass
      ? 'watch-test --events: PASS (no card is statistically unfireable by its own data; coverage above is a report, not a gate — the pace floors are #101\'s)'
      : `watch-test --events: FAIL: ${failures.join('; ')}`,
  );
  return report;
}

export function parseArgs(argv) {
  const opts = {
    seconds: 300, url: process.env.SHEEPCLIFF_WATCH_URL ?? PROTOTYPE_URL, min: 3, adapter: 'auto',
    day: null, out: path.join(here, 'out', 'watch'), shots: true, headed: false, maxShots: 16, serve: null,
    events: false, seed: EVENTS_DEFAULT_SEED,
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
    else if (a === '--events') opts.events = true;
    else if (a === '--seed') opts.seed = Number(next());
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
  if (opts.events && opts.adapter === 'prototype') throw new Error('--events needs the app adapter: the prototype has no window.sheepcliff');
  if (!Number.isFinite(opts.seed) || !Number.isInteger(opts.seed)) throw new Error('--seed must be an integer');
  return opts;
}

const USAGE = `usage: watch-test.mjs [seconds=300] [--url <url> | --serve <dir>] [--min 3] [--adapter auto|prototype|app] [--day <seconds>] [--out <dir>] [--no-shots] [--headed]
       watch-test.mjs --events [seconds=300] [--url <url> | --serve <dir>] [--day <seconds>] [--seed <n>] [--out <dir>]`;

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
  const task = opts.events ? runEvents(opts) : run(opts);
  task.then((r) => process.exit(r.pass ? 0 : 1), (e) => { console.error(`watch-test: ${e?.stack ?? e}`); process.exit(2); });
}

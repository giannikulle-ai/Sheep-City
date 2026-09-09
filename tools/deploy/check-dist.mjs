// Serve a built site with the tile's own static server (tools/deploy/tile/server.js)
// and load it in headless Chromium, the way The Garage serves it (issue #29).
//
// Usage:  node tools/deploy/check-dist.mjs [dir=apps/web/dist] [--screenshot out.png]
//
// Fails (exit 1) when:
//   - any request the page makes is answered with a non-2xx status or fails,
//   - the page requests anything from another origin (the build must be self-contained),
//   - the page throws, logs a console error, or sets body[data-error],
//   - body[data-ready] never becomes "1" (the app never finished loading its art),
//   - no image under assets/ was fetched with a 2xx status (relative asset paths
//     did not resolve). Checked per-response as responses arrive, not by pattern-
//     matching the request log after the fact, so it doesn't care which response
//     happens to finish last (issue #91).
// The last two are the Vite `base: './'` contract: index.html and the JS bundle
// must reach their assets through relative URLs, whatever path the host mounts.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let dir = 'apps/web/dist';
let screenshot = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--screenshot') screenshot = path.resolve(args[++i]);
  else if (args[i] === '-h' || args[i] === '--help') {
    console.log('usage: node tools/deploy/check-dist.mjs [dir=apps/web/dist] [--screenshot out.png]');
    process.exit(0);
  } else dir = args[i];
}
dir = path.resolve(dir);
if (!existsSync(path.join(dir, 'index.html'))) {
  console.error(`check-dist: ${dir}/index.html does not exist; run npm run build first`);
  process.exit(2);
}

// Same fallback as apps/web/playwright.config.ts: the agent sandbox ships Chromium
// at a fixed path; CI installs its own through `npx playwright install chromium`.
const preinstalled = process.env.SHEEPCLIFF_CHROMIUM ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(here, 'tile', 'server.js')], {
  cwd: dir,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
const stop = () => {
  if (!server.killed) server.kill();
};
process.on('exit', stop);

// Wait for the server's health path rather than a log line.
const deadline = Date.now() + 10_000;
for (;;) {
  try {
    const r = await fetch(`${origin}/healthz`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) {
    console.error(`check-dist: tile server did not answer /healthz within 10 s\n${serverLog}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 100));
}

const IMAGE_ASSET_RE = /\/assets\/.*\.(png|gif|jpe?g|webp)$/;

const problems = [];
const requests = [];
let sawImageAsset = false;
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 520 }, deviceScaleFactor: 1 });
  page.on('request', (req) => {
    if (!req.url().startsWith(origin)) problems.push(`request to another origin: ${req.url()}`);
  });
  page.on('response', (res) => {
    const url = res.url();
    const rel = url.startsWith(origin) ? url.slice(origin.length) : url;
    requests.push(`${res.status()} ${rel}`);
    if (res.status() < 200 || res.status() >= 300) problems.push(`HTTP ${res.status()} for ${rel}`);
    // Checked per-response, not with a regex over the joined request log: the old
    // check anchored on the END of that joined string, so it only passed when an
    // image asset happened to be the LAST response to complete. Which response
    // finishes last is a network race between the parallel fetch()/Image() asset
    // loads and the server's connection limit -- not something the app or the
    // build controls -- and it shifted under a newer Chromium build (issue #91),
    // failing builds where every asset genuinely returned 2xx. Track hits directly
    // instead, regardless of arrival order.
    if (res.status() >= 200 && res.status() < 300 && IMAGE_ASSET_RE.test(rel)) sawImageAsset = true;
  });
  page.on('requestfailed', (req) => problems.push(`request failed: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`));
  page.on('pageerror', (e) => problems.push(`page error: ${String(e)}`));
  page.on('console', (m) => {
    // Chromium fetches /favicon.ico on its own, outside the page's request
    // events; the app ships none, so that one 404 is expected and harmless.
    if (m.type() === 'error' && !/\/favicon\.ico$/.test(m.location().url ?? '')) {
      problems.push(`console error: ${m.text()} (${m.location().url ?? 'no url'})`);
    }
  });

  await page.goto(`${origin}/`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => document.body.dataset.ready === '1' || document.body.dataset.error != null, null, {
      timeout: 20_000,
    });
  } catch {
    problems.push('body[data-ready] never became "1" within 20 s');
  }
  const err = await page.evaluate(() => document.body.dataset.error ?? null);
  if (err != null) problems.push(`the app reported an error: ${err}`);
  // Give the first animation frames a moment so lazy asset fetches show up.
  await page.waitForTimeout(500);
  const title = await page.title();
  if (!sawImageAsset) {
    problems.push('no image under assets/ was fetched; relative asset URLs did not resolve');
  }

  // Content-Encoding check (issue #108): the tile server should gzip (or brotli) text assets
  // when asked. Find the JS bundle from what the page actually requested, then re-request it
  // directly so we can inspect the raw response headers.
  const jsRel = requests
    .map((r) => r.slice(r.indexOf(' ') + 1))
    .find((rel) => /^\/assets\/.*\.m?js$/.test(rel));
  if (!jsRel) {
    problems.push('no JS asset under assets/ was requested; cannot check Content-Encoding');
  } else {
    const encoded = await fetch(`${origin}${jsRel}`, { headers: { 'Accept-Encoding': 'gzip' } });
    const encoding = encoded.headers.get('content-encoding');
    if (encoding !== 'gzip' && encoding !== 'br') {
      problems.push(
        `${jsRel} did not come back compressed when requested with Accept-Encoding: gzip (Content-Encoding: ${encoding ?? 'none'})`,
      );
    }
    // A client that sends no Accept-Encoding at all must still get the plain file (issue #108
    // done-means), not an error and not a silently-gzipped body it never asked for.
    const plain = await fetch(`${origin}${jsRel}`, { headers: { 'Accept-Encoding': 'identity' } });
    if (plain.headers.get('content-encoding') != null) {
      problems.push(`${jsRel} came back with Content-Encoding: ${plain.headers.get('content-encoding')} for an Accept-Encoding: identity request`);
    }
  }

  if (screenshot) {
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  console.log(`check-dist: served ${dir} at ${origin} with tools/deploy/tile/server.js`);
  console.log(`check-dist: page title "${title}", ${requests.length} request(s):`);
  for (const r of requests.sort()) console.log(`  ${r}`);
  if (screenshot) console.log(`check-dist: screenshot written to ${screenshot}`);
} finally {
  await browser.close();
  stop();
}

if (problems.length) {
  console.error(`check-dist: FAIL, ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('check-dist: OK, every request answered 2xx from the tile server and the app reported ready');

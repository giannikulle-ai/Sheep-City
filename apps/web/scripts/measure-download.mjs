// Measures what a phone actually downloads on first load: transferred (compressed) bytes,
// request count, and time to body[data-ready] under a throttled network profile.
// Not run in CI (issue #97) -- it is a manual/local measurement tool.
//
// Usage:  npm run build -w apps/web && npm run measure:download -w apps/web
//   node apps/web/scripts/measure-download.mjs [dir=apps/web/dist]
//
// Serves dist/ with tools/deploy/tile/server.js, the same static server the deploy check
// (tools/deploy/check-dist.mjs) and The Garage use -- it does not gzip, so the CDP-measured
// "transferred" bytes below are the on-disk (uncompressed) bytes, not what a gzip/brotli-serving
// host would actually send. To see what a real host would send, this script also gzip -9's every
// dist/ file on disk and reports that total next to the server's raw transfer, so both numbers
// are on record (issue #97 done-means: "the tile server may not gzip").
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const repoRoot = path.join(root, '..', '..');
const dir = path.resolve(process.argv[2] ?? path.join(root, 'dist'));

if (!existsSync(path.join(dir, 'index.html'))) {
  console.error(`measure-download: ${dir}/index.html does not exist; run "npm run build -w apps/web" first`);
  process.exit(2);
}

// Same fallback as apps/web/playwright.config.ts and tools/deploy/check-dist.mjs.
const preinstalled = process.env.SHEEPCLIFF_CHROMIUM ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

// Named throttle profiles (issue #97): a typical mobile 4G and a slow 3G floor. CDP
// Network.emulateNetworkConditions takes bytes/sec, so Mbps and kbps are divided by 8.
const PROFILES = [
  { name: '4G (9 Mbps / 170 ms RTT)', downloadThroughput: (9 * 1000 * 1000) / 8, uploadThroughput: (9 * 1000 * 1000) / 8, latency: 170 },
  { name: 'Slow 3G (400 kbps / 400 ms RTT)', downloadThroughput: (400 * 1000) / 8, uploadThroughput: (400 * 1000) / 8, latency: 400 },
];

function walk(d) {
  return readdirSync(d).flatMap((name) => {
    const p = path.join(d, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function onDiskGzipTotal() {
  const files = walk(dir);
  let raw = 0;
  let gz = 0;
  for (const f of files) {
    const buf = readFileSync(f);
    raw += buf.length;
    gz += zlib.gzipSync(buf, { level: 9 }).length;
  }
  return { fileCount: files.length, raw, gz };
}

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
const server = spawn(process.execPath, [path.join(repoRoot, 'tools', 'deploy', 'tile', 'server.js')], {
  cwd: dir,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stop = () => {
  if (!server.killed) server.kill();
};
process.on('exit', stop);

const deadline = Date.now() + 10_000;
for (;;) {
  try {
    const r = await fetch(`${origin}/healthz`);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  if (Date.now() > deadline) {
    console.error('measure-download: tile server did not answer /healthz within 10 s');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 100));
}

async function measure(profile) {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.latency,
      downloadThroughput: profile.downloadThroughput,
      uploadThroughput: profile.uploadThroughput,
    });

    let transferredBytes = 0;
    let requestCount = 0;
    let sawEncoding = false;
    cdp.on('Network.responseReceived', (e) => {
      requestCount += 1;
      if ((e.response.headers['content-encoding'] ?? e.response.headers['Content-Encoding']) != null) sawEncoding = true;
    });
    cdp.on('Network.loadingFinished', (e) => {
      transferredBytes += e.encodedDataLength ?? 0;
    });

    const start = Date.now();
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset.ready === '1' || document.body.dataset.error != null, null, {
      timeout: 30_000,
    });
    const timeToReadyMs = Date.now() - start;
    const err = await page.evaluate(() => document.body.dataset.error ?? null);

    return { profile: profile.name, requestCount, transferredBytes, timeToReadyMs, sawEncoding, error: err };
  } finally {
    await browser.close();
  }
}

try {
  const results = [];
  for (const profile of PROFILES) {
    results.push(await measure(profile));
  }
  const disk = onDiskGzipTotal();

  console.log('measure-download: served', dir, 'at', origin, 'with tools/deploy/tile/server.js\n');
  console.log('On-disk gzip -9 (what a gzip-serving host would send, all files summed):');
  console.log(`  ${disk.fileCount} files, ${disk.raw} B raw -> ${disk.gz} B gzip -9\n`);

  for (const r of results) {
    if (r.error) console.error(`  ${r.profile}: app reported an error: ${r.error}`);
    console.log(`${r.profile}`);
    console.log(`  requests: ${r.requestCount}`);
    console.log(`  transferred (CDP encodedDataLength, server compression=${r.sawEncoding ? 'on' : 'off'}): ${r.transferredBytes} B`);
    console.log(`  time to body[data-ready]: ${r.timeToReadyMs} ms`);
    console.log('');
  }
} finally {
  stop();
}

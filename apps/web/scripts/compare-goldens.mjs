#!/usr/bin/env node
// Compares the app goldens with the prototype goldens phase by phase at the QA lane's tolerance
// (any channel further than 20 counts a pixel; 0.2% of pixels is the golden gate), prints one
// line per phase, and writes side-by-side PNGs (app left, prototype right) for the PR under
// apps/web/screenshots/side-by-side-<phase>-<weather>.png.
//
//   node scripts/compare-goldens.mjs            (after golden:app:update)
//
// The two worlds share a seed number but not a random generator, so their flocks stand in
// different places: the numbers say how far apart the pictures are, not whether one is wrong.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const golden = join(root, 'e2e', 'golden');
const out = join(root, 'screenshots');
const preinstalled = process.env['SHEEPCLIFF_CHROMIUM'] ?? '/opt/pw-browsers/chromium';
const PHASES = ['dawn', 'noon', 'dusk', 'night'];
const WEATHERS = ['sun', 'snow'];
const THRESHOLD = 20;

const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const browser = await chromium.launch({ headless: true, ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}) });
const page = await browser.newPage({ viewport: { width: 1300, height: 440 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#2b1d17;color:#f6f2e8;font:13px ui-monospace,Menlo,monospace}
  #row{display:flex;gap:8px;padding:8px;width:max-content}
  figure{margin:0}img{display:block;width:640px;height:400px;image-rendering:pixelated}figcaption{padding:4px 0 0}
</style><div id="row"><figure><img id="a"><figcaption id="ca"></figcaption></figure><figure><img id="b"><figcaption id="cb"></figcaption></figure></div>`);

const rows = [];
for (const weather of WEATHERS) {
  for (const phase of PHASES) {
    const app = join(golden, 'app', `${phase}-${weather}.png`);
    const proto = join(golden, 'prototype', `${phase}-${weather}.png`);
    if (!existsSync(app) || !existsSync(proto)) {
      rows.push(`${phase}-${weather}: missing ${existsSync(app) ? 'prototype' : 'app'} golden`);
      continue;
    }
    const r = await page.evaluate(
      async ([a, b, th, label]) => {
        const load = (src, id) =>
          new Promise((resolve, reject) => {
            const img = document.getElementById(id);
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('png decode failed'));
            img.src = src;
          });
        const [ia, ib] = await Promise.all([load(a, 'a'), load(b, 'b')]);
        document.getElementById('ca').textContent = `app · ${label}`;
        document.getElementById('cb').textContent = `prototype v31 · ${label}`;
        const px = (img) => {
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, c.width, c.height).data;
        };
        const pa = px(ia);
        const pb = px(ib);
        let differing = 0;
        let maxDelta = 0;
        let sum = 0;
        for (let i = 0; i < pa.length; i += 4) {
          const d = Math.max(Math.abs(pa[i] - pb[i]), Math.abs(pa[i + 1] - pb[i + 1]), Math.abs(pa[i + 2] - pb[i + 2]));
          if (d > maxDelta) maxDelta = d;
          if (d > th) differing++;
          sum += d;
        }
        const total = pa.length / 4;
        return { total, differing, maxDelta, meanDelta: sum / total };
      },
      [dataUrl(app), dataUrl(proto), THRESHOLD, `${phase}, ${weather}`],
    );
    const file = join(out, `side-by-side-${phase}-${weather}.png`);
    await page.locator('#row').screenshot({ path: file });
    const pct = ((100 * r.differing) / r.total).toFixed(2);
    rows.push(`${phase.padEnd(5)} ${weather.padEnd(4)}  ${String(r.differing).padStart(6)} of ${r.total} px differ (${pct.padStart(5)}%), max channel delta ${String(r.maxDelta).padStart(3)}, mean ${r.meanDelta.toFixed(1)}  -> ${file.slice(root.length + 1)}`);
  }
}
await browser.close();
console.log(`golden compare (app vs prototype, channel threshold ${THRESHOLD}, golden gate 0.20%):`);
for (const r of rows) console.log(`  ${r}`);

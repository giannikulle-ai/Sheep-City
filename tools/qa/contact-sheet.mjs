#!/usr/bin/env node
// Lays the golden PNGs of one target out on a labelled grid so a reviewer can
// eyeball all eight at once. Output: <dir>/_contact-sheet.png (ignored by the
// golden spec, which only reads <phase>-<weather>.png).
//
//   node tools/qa/contact-sheet.mjs [apps/web/e2e/golden/prototype]
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './lib/browser.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const dir = path.resolve(process.argv[2] ?? path.join(repoRoot, 'apps/web/e2e/golden/prototype'));
const PHASES = ['dawn', 'noon', 'dusk', 'night'];
const WEATHERS = ['sun', 'snow'];

const files = readdirSync(dir).filter((f) => /^[a-z]+-[a-z]+\.png$/.test(f));
if (!files.length) { console.error(`contact-sheet: no goldens in ${dir}`); process.exit(2); }
const cells = [];
for (const w of WEATHERS) for (const p of PHASES) {
  const f = `${p}-${w}.png`;
  if (files.includes(f)) cells.push({ label: `${p} · ${w}`, src: `data:image/png;base64,${readFileSync(path.join(dir, f)).toString('base64')}` });
}
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#2b1d17;color:#f6f2e8;font:12px ui-monospace,Menlo,monospace}
  #grid{display:grid;grid-template-columns:repeat(4,320px);gap:8px;padding:8px;width:max-content}
  figure{margin:0}img{display:block;width:320px;height:200px;image-rendering:pixelated}figcaption{padding:3px 0 0}
</style><div id="grid">${cells.map((c) => `<figure><img src="${c.src}"><figcaption>${c.label}</figcaption></figure>`).join('')}</div>`;

const browser = await launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
const out = path.join(dir, '_contact-sheet.png');
await page.locator('#grid').screenshot({ path: out });
await browser.close();
console.log(`contact-sheet: ${cells.length} goldens -> ${path.relative(repoRoot, out)}`);

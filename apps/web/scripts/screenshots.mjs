// Page screenshots (world + UI layer) for PR review: four phases at 2x.
// Usage: npm run build && node scripts/screenshots.mjs   (writes apps/web/screenshots/)
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'screenshots');
const preinstalled = process.env['SHEEPCLIFF_CHROMIUM'] ?? '/opt/pw-browsers/chromium';

const SHOTS = [
  ['day', 't=0.18&weather=sun&season=spring'],
  ['dusk', 't=0.47&weather=sun&season=spring'],
  ['night', 't=0.7&weather=sun&season=spring'],
  ['dawn', 't=0.95&weather=sun&season=spring'],
  ['rain-day', 't=0.18&weather=rain&season=spring'],
  ['snow-night', 't=0.7&weather=snow&season=winter'],
];

const server = await preview({ root, preview: { port: 4174, host: '127.0.0.1', strictPort: true } });
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
});
const page = await browser.newPage({ viewport: { width: 640, height: 470 }, deviceScaleFactor: 2 });
for (const [name, query] of SHOTS) {
  await page.goto(`http://127.0.0.1:4174/?${query}&now=100000`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}
await browser.close();
await server.close();

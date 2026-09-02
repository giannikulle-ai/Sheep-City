// Page screenshots (world + UI layer) for PR review, of the real sim.
// Usage: npm run build && node scripts/screenshots.mjs   (writes apps/web/screenshots/)
//   four phases plus rain and snow at 2x on the desktop viewport, and three phone shots:
//   portrait, landscape with the tray open, and the pin overlay with two pins dropped.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'screenshots');
const preinstalled = process.env['SHEEPCLIFF_CHROMIUM'] ?? '/opt/pw-browsers/chromium';

// Six stills of the live sim: seed 9 like the goldens, the clock pinned and paused, the world
// left to settle for a second so DL and the flock have taken their first steps.
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
const base = 'http://127.0.0.1:4174/';
const ready = (page) => page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });

const page = await browser.newPage({ viewport: { width: 640, height: 470 }, deviceScaleFactor: 2 });
for (const [name, query] of SHOTS) {
  await page.goto(`${base}?seed=9&freeze=1&${query}`);
  await ready(page);
  await page.waitForTimeout(1000);
  const file = join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
}
await page.close();

// Phone shots on the live page: a fixed seed and clock, the sim paused so the picture holds.
const LIVE = '?seed=9&weather=sun&t=0.2&freeze=1';
const tapWorld = async (p, wx, wy) => {
  const box = await p.locator('#stage').boundingBox();
  await p.mouse.click(box.x + (wx * box.width) / 640, box.y + (wy * box.height) / 400);
};

const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await portrait.goto(base + LIVE);
await ready(portrait);
// pet Clover and Digital Luna wherever seed 9 put them once the first tick settled
await portrait.waitForTimeout(400);
const at = await portrait.evaluate(() => { const v = window.sheepcliff.view(); const s = v.sheep[0]; return { clover: { x: s.x + 16, y: s.y + 13 }, luna: { x: v.luna.x + 22, y: v.luna.y + 20 } }; });
await tapWorld(portrait, at.clover.x, at.clover.y);
await tapWorld(portrait, at.luna.x, at.luna.y);
await portrait.waitForTimeout(150);
await portrait.locator('#who button[data-who="sheep-1"]').click();
await portrait.screenshot({ path: join(out, 'phone-portrait.png'), fullPage: true });
console.log('wrote', join(out, 'phone-portrait.png'));

await portrait.locator('#cmode').click();
await tapWorld(portrait, 499, 276);
await portrait.locator('#notes textarea').last().fill('lantern glow looks flat');
await tapWorld(portrait, 318, 96);
await portrait.locator('#notes textarea').last().fill('barn door shadow');
await portrait.screenshot({ path: join(out, 'phone-pins.png'), fullPage: true });
console.log('wrote', join(out, 'phone-pins.png'));
await portrait.locator('#ctext').click();
await portrait.waitForSelector('#modal.show');
await portrait.screenshot({ path: join(out, 'phone-pins-text.png'), fullPage: false });
console.log('wrote', join(out, 'phone-pins-text.png'));
await portrait.close();

const landscape = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
await landscape.goto(base + LIVE);
await ready(landscape);
await landscape.locator('#trayToggle').click();
await landscape.waitForTimeout(300);
await landscape.screenshot({ path: join(out, 'phone-landscape.png'), fullPage: false });
console.log('wrote', join(out, 'phone-landscape.png'));
await landscape.close();

await browser.close();
await server.close();

// Deity-power screenshots for PR review (issue #44): each weather kind's sky ripple and each act
// verb's ring, captured live (not frozen) so the flourish is caught mid-animation, the way a
// player would actually see it — a fixed short wait after the tap, not a QA-stepped still.
// Usage: npm run build && node scripts/deity-screenshots.mjs   (writes apps/web/screenshots/deity/)
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(root, 'screenshots', 'deity');
mkdirSync(out, { recursive: true });
const preinstalled = process.env['SHEEPCLIFF_CHROMIUM'] ?? '/opt/pw-browsers/chromium';

const server = await preview({ root, preview: { port: 4175, host: '127.0.0.1', strictPort: true } });
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
});
const base = 'http://127.0.0.1:4175/';
// Portrait phone (the app's primary frame), tall enough that the tray's chips are on screen
// without opening the landscape drawer.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const ready = () => page.waitForSelector('body[data-ready="1"]', { timeout: 15000 });

/** One still: a fresh scratch world (seed 9, sun, spring) so every power starts from the same
 * picture, the tap, then a short wait that lands mid-fade of the ring/ripple (700-900 ms long). */
async function shot(name, tap) {
  await page.goto(`${base}?seed=9&weather=sun&t=0.21&season=spring`);
  await ready();
  await page.waitForTimeout(600); // let the flock and DL settle before the tap
  await tap();
  await page.waitForTimeout(180);
  const file = join(out, `${name}.png`);
  // The stage alone (world + UI layers, no tray below it): at 2x device scale this is a much
  // closer look at the flourish than a full-page shot would give.
  await page.locator('#stage').screenshot({ path: file });
  console.log('wrote', file);
}

const selectSky = () => page.locator('#who button[data-who="sky"]').click();
const selectLuna = () => page.locator('#who button[data-who="luna"]').click();
const selectSheep1 = () => page.locator('#who button[data-who="sheep-1"]').click();
const weatherTap = (kind) => async () => {
  await selectSky();
  await page.locator(`#verbs button[data-verb="${kind}"]`).click();
};
const actTap = (verb) => async () => {
  await selectLuna();
  await page.locator(`#verbs button[data-verb="${verb}"]`).click();
};

await shot('sky-sun', weatherTap('sun'));
await shot('sky-rain', weatherTap('rain'));
await shot('sky-snow', weatherTap('snow'));
await shot('sky-fog', weatherTap('fog'));
await shot('sky-clear', weatherTap('clear'));
// `calm` and `treat` on Digital Luna both run the sim's `petLuna` (fix round 1, PR #90's own
// finding 3): the two shots came out byte-identical. `calm` on a sheep is a genuinely different
// picture — the sim's `behaviours/sheep.ts` puts it down to rest, no bubble at all — so this one
// shoots the sheep instead of Luna, matching the Verifier's own suggested fix.
await shot('act-calm', async () => {
  await selectSheep1();
  await page.locator('#verbs button[data-verb="calm"]').click();
});
await shot('act-startle', actTap('startle'));
await shot('act-treat', actTap('treat'));
await shot('act-call', async () => {
  await selectLuna();
  await page.locator('#verbs button[data-verb="call"]').click();
  const box = await page.locator('#stage').boundingBox();
  await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.62);
});

await page.close();
await browser.close();
await server.close();

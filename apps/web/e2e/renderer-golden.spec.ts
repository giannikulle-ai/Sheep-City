import { expect, test, type Page } from '@playwright/test';
import { JUMP_T } from '../src/jump';

// Golden screenshots of the native 640x400 world canvas at the four clock
// phases, on grass and on snow, plus one rainy day for the weather layers.
// The fixture (`?fixture=1`, the still life the renderer was ported against) and
// render clock are fixed by the query string, so the picture is a pure function
// of the renderer. The clock values are the tray's "jump to" values (src/jump.ts),
// phase midpoints outside the crossfade band, so each golden is the picture a jump
// lands on (#20). Tags and HUD live on the UI canvas and
// are not part of the golden, which keeps font rendering out of the diff.
//
// Update goldens deliberately: `npx playwright test golden --update-snapshots`
// and include the before/after in the PR.

const PHASES: ReadonlyArray<readonly [name: string, t: number]> = [
  ['day', JUMP_T.noon],
  ['dusk', JUMP_T.dusk],
  ['night', JUMP_T.night],
  ['dawn', JUMP_T.dawn],
];

const NOW = 100000;

async function worldPng(page: Page, query: string): Promise<Buffer> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/?fixture=1&${query}&now=${NOW}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  expect(errors).toEqual([]);
  const dataUrl = await page.locator('canvas#world').evaluate((el) => (el as HTMLCanvasElement).toDataURL('image/png'));
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

for (const [name, t] of PHASES) {
  test(`golden ${name}`, async ({ page }) => {
    const png = await worldPng(page, `t=${t}&weather=sun&season=spring`);
    expect(png).toMatchSnapshot(`${name}.png`, { maxDiffPixelRatio: 0.01 });
  });

  test(`golden snow ${name}`, async ({ page }) => {
    const png = await worldPng(page, `t=${t}&weather=snow&season=winter`);
    expect(png).toMatchSnapshot(`snow_${name}.png`, { maxDiffPixelRatio: 0.01 });
  });
}

test('golden rain day', async ({ page }) => {
  const png = await worldPng(page, `t=${JUMP_T.noon}&weather=rain&season=spring`);
  expect(png).toMatchSnapshot('rain_day.png', { maxDiffPixelRatio: 0.01 });
});

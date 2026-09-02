import { test } from '@playwright/test';
import { appDriver } from './lib/app';
import { type Driver, PHASES, type Target, WEATHERS, expectGolden, goldenPath, goldenTarget, updatingGoldens } from './lib/golden';
import { prototypeDriver } from './lib/prototype';

// Golden screenshots: four clock phases in sun and snow, deterministic seed and
// clock, compared to the committed PNGs under e2e/golden/<target>/ with a small
// tolerance (see lib/golden.ts). SHEEPCLIFF_GOLDEN_TARGET picks the world:
// `prototype` (the frozen Luna Farm build) or `app` (apps/web via the
// window.sheepcliff.qa hooks); unset, both sets are compared, so `npm run e2e`
// guards the app's own goldens too. SHEEPCLIFF_GOLDEN_UPDATE=1 rewrites them.
const SEED = 9;
const SETTLE_FRAMES = 120;

const drivers: Record<Target, Driver> = { prototype: prototypeDriver, app: appDriver };
const targets: Target[] = process.env['SHEEPCLIFF_GOLDEN_TARGET'] ? [goldenTarget()] : ['prototype', 'app'];

for (const target of targets) {
  const driver = drivers[target];
  test.describe(`golden screenshots (${target})`, () => {
    for (const weather of WEATHERS) {
      for (const phase of PHASES) {
        test(`${phase} in ${weather}`, async ({ page }, testInfo) => {
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(String(e)));
          await driver.open(page, SEED);
          const actual = await driver.capture(page, phase, weather, SETTLE_FRAMES);
          if (errors.length) throw new Error(`page errors while capturing: ${errors.join('; ')}`);
          await expectGolden(page, testInfo, actual, goldenPath(target, phase, weather));
        });
      }
    }
  });
}

test('golden update mode is off in CI', () => {
  if (process.env['CI'] && updatingGoldens()) throw new Error('SHEEPCLIFF_GOLDEN_UPDATE=1 must not be set in CI');
});

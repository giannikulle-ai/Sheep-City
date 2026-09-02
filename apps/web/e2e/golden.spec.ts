import { test } from '@playwright/test';
import { appDriver } from './lib/app';
import { type Driver, PHASES, WEATHERS, expectGolden, goldenPath, goldenTarget, updatingGoldens } from './lib/golden';
import { prototypeDriver } from './lib/prototype';

// Golden screenshots: four clock phases in sun and snow, deterministic seed and
// clock, compared to the committed PNGs under e2e/golden/<target>/ with a small
// tolerance (see lib/golden.ts). SHEEPCLIFF_GOLDEN_TARGET picks the world:
// `prototype` (default, the frozen Luna Farm build) or `app` (apps/web via the
// window.sheepcliff.qa hooks). SHEEPCLIFF_GOLDEN_UPDATE=1 rewrites the goldens.
const SEED = 9;
const SETTLE_FRAMES = 120;

const target = goldenTarget();
const drivers: Record<typeof target, Driver> = { prototype: prototypeDriver, app: appDriver };
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

test('golden update mode is off in CI', () => {
  if (process.env['CI'] && updatingGoldens()) throw new Error('SHEEPCLIFF_GOLDEN_UPDATE=1 must not be set in CI');
});

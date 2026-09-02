// Golden driver for the Sheepcliff app (apps/web). Uses the QA hooks the client
// lane exposes on window.sheepcliff.qa (contract: tools/qa/README.md). Until
// those exist this driver fails with a message naming the missing hook, so a
// wrong SHEEPCLIFF_GOLDEN_TARGET is loud rather than silently green.
import type { Page } from '@playwright/test';
import type { Driver, Phase, Weather } from './golden';

export const PHASE_T: Record<Phase, number> = { dawn: 0.96, noon: 0.21, dusk: 0.47, night: 0.72 };

const HOOKS = ['seed', 'setWeather', 'setClock', 'pause', 'step', 'canvas'] as const;

async function requireHooks(page: Page): Promise<void> {
  const missing = await page.evaluate((hooks) => {
    const qa = (window as unknown as { sheepcliff?: { qa?: Record<string, unknown> } }).sheepcliff?.qa;
    return hooks.filter((h) => typeof qa?.[h] !== 'function');
  }, HOOKS);
  if (missing.length) throw new Error(`window.sheepcliff.qa is missing ${missing.join(', ')}; see tools/qa/README.md for the QA hook contract`);
}

export const appDriver: Driver = {
  async open(page, seed) {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
    await requireHooks(page);
    await page.evaluate((s) => window.sheepcliff.qa.seed(s), seed);
  },
  async capture(page, phase, weather, frames) {
    return page.evaluate(
      ([t, w, n]) => {
        const qa = window.sheepcliff.qa;
        qa.pause(true);
        qa.setWeather(w);
        qa.setClock(t);
        qa.step(n);
        return qa.canvas().toDataURL('image/png');
      },
      [PHASE_T[phase], weather, frames] as const,
    );
  },
};

declare global {
  interface Window {
    sheepcliff: {
      qa: {
        seed(seed: number): void;
        setWeather(weather: Weather | 'rain'): void;
        setClock(t: number): void;
        pause(paused: boolean): void;
        step(frames: number): void;
        setDayLength?(seconds: number): void;
        canvas(): HTMLCanvasElement;
      };
    };
  }
}

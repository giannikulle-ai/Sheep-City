// Golden driver for prototype/luna-farm/build/farm_sim.html.
//
// Determinism comes from an init script that (1) seeds Math.random, (2) makes
// performance.now a virtual clock, and (3) turns requestAnimationFrame into a
// queue drained only by window.__qaStep(frames). The sim then advances by a
// fixed 1/60 s per stepped frame and nothing depends on wall-clock timing.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { type Driver, type Phase, type Weather, repoRoot } from './golden';

export const PROTOTYPE_URL = pathToFileURL(path.join(repoRoot, 'prototype/luna-farm/build/farm_sim.html')).href;

// Midpoint of each clock phase (phaseOf in the prototype: day < .42, dusk < .52,
// night < .92, dawn otherwise), chosen so no golden sits inside a crossfade.
// The prototype's own "jump to" actions use .94/.2/.44/.7, and .94 and .44 land
// inside the 0.025 fade band around a phase edge.
export const PHASE_T: Record<Phase, number> = { dawn: 0.96, noon: 0.21, dusk: 0.47, night: 0.72 };

export const determinismScript = (seed: number): string => `
(() => {
  // mulberry32
  let s = ${seed >>> 0};
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clock = { now: 0 };
  performance.now = () => clock.now;
  const queue = [];
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__qaStep = (frames, dtMs = 1000 / 60) => {
    for (let f = 0; f < frames; f++) {
      clock.now += dtMs;
      const batch = queue.splice(0, queue.length);
      for (const cb of batch) cb(clock.now);
    }
    return clock.now;
  };
})();
`;

export const prototypeDriver: Driver = {
  async open(page, seed) {
    await page.addInitScript(determinismScript(seed));
    await page.goto(PROTOTYPE_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => sheetImg.complete && Object.values(BG).every((i) => i.complete), null, { timeout: 15_000 });
  },
  async capture(page, phase, weather, frames) {
    return page.evaluate(
      ([t, w, n]) => {
        wmodeEl.value = 'manual';
        wmodeChanged();
        seasonEl.value = 'spring';
        setWeather(w);
        clock.paused = true;
        clock.t = t;
        timeEl.value = String(Math.round(t * 1000));
        window.__qaStep(n);
        return world.toDataURL('image/png');
      },
      [PHASE_T[phase], weather, frames] as const,
    );
  },
};

// The prototype's page-level bindings the driver touches, typed loosely on purpose.
declare global {
  const sheetImg: HTMLImageElement;
  const BG: Record<string, HTMLImageElement>;
  const wmodeEl: HTMLSelectElement;
  const seasonEl: HTMLSelectElement;
  const timeEl: HTMLInputElement;
  const world: HTMLCanvasElement;
  const clock: { t: number; period: number; paused: boolean };
  function wmodeChanged(): void;
  function setWeather(w: Weather | 'rain'): void;
  interface Window {
    __qaStep(frames: number, dtMs?: number): number;
  }
}

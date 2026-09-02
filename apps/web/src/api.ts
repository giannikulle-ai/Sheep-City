// What the page hangs on `window.sheepcliff`: the QA hooks (contract: tools/qa/README.md), the
// intent log, the pins, the save, and the current view and state, for Playwright and the watch test.
import type { FarmView } from '@sheepcliff/render';
import type { SimState, WeatherKind } from '@sheepcliff/sim';
import type { IntentRecord } from './game';
import type { ClientIntent } from './intents';
import type { Pin } from './pins';

export interface QaHooks {
  /** reseed the world and switch to a virtual clock that only `step` advances; saving stops */
  seed(seed: number): void;
  /** day fraction 0..1 */
  setClock(t: number): void;
  setWeather(weather: WeatherKind): void;
  /** stop the sim clock advancing */
  pause(paused: boolean): void;
  /** run N frames of 1/60 s, sim and render, synchronously */
  step(frames: number): void;
  /** the world canvas at native resolution */
  canvas(): HTMLCanvasElement;
  /** seconds per sim day, used by the watch test's --day */
  setDayLength(seconds: number): void;
}

export interface SaveHooks {
  /** write the save now (no-op on a scratch world) */
  now(): boolean;
  /** the save as text, as the export modal shows it */
  text(): string;
  /** load a save text into the running world, catching up on the time since it was saved */
  load(text: string): void;
  /** true when the page is keeping a save (not a scratch world from URL parameters or a QA seed) */
  saving(): boolean;
}

export interface SheepcliffApi {
  qa: QaHooks;
  /** every intent sent this page load, oldest first */
  intents: readonly IntentRecord[];
  /** send an intent as a tap or tray button would */
  send(intent: ClientIntent): IntentRecord;
  pins: {
    list(): Pin[];
    markdown(): string;
    /** drop a pin at stage fractions 0..1, as a tap in pin mode would */
    drop(fx: number, fy: number): Pin;
  };
  save: SaveHooks;
  /** the view drawn by the last frame */
  view(): FarmView;
  /** the sim state behind it (read-only by convention) */
  sim(): SimState;
}

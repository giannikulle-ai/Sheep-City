// Clock phases, background choice, and the per-phase tint, ported from the
// prototype's `phaseOf`, `PHASES`, and the crossfade block at the top of `draw()`.
import type { Phase, Season, Weather } from './state';

export const PHASES: readonly Phase[] = ['day', 'dusk', 'night', 'dawn'];

/** Multiply tint applied to sprites per phase (the backgrounds are pre-tinted). */
export const PHASE_TINT: Record<Phase, readonly [number, number, number]> = {
  day: [1, 1, 1],
  dusk: [1.02, 0.78, 0.58],
  night: [0.4, 0.48, 0.8],
  dawn: [0.96, 0.8, 0.86],
};

/** `phaseOf` from the prototype: clock t 0..1 to phase. */
export function phaseOf(t: number): Phase {
  return t < 0.42 ? 'day' : t < 0.52 ? 'dusk' : t < 0.92 ? 'night' : 'dawn';
}

/** Phase boundaries as [t, before, after]. */
const EDGES: ReadonlyArray<readonly [number, Phase, Phase]> = [
  [0, 'dawn', 'day'],
  [0.42, 'day', 'dusk'],
  [0.52, 'dusk', 'night'],
  [0.92, 'night', 'dawn'],
];
const FADE = 0.025;

export interface PhaseMix {
  phase: Phase;
  /** the neighbouring phase to blend towards, or null away from a boundary */
  mixTo: Phase | null;
  /** 0..1 weight of `mixTo` */
  mix: number;
}

/**
 * Near each boundary the prototype blends the two backgrounds and tints.
 * Ported verbatim, including its quirks: the edge at t=0 fades dawn over the
 * first moments of day, and there is no edge at t=1.
 */
export function phaseMix(t: number): PhaseMix {
  const phase = phaseOf(t);
  let mixTo: Phase | null = null;
  let mix = 0;
  for (const [e, a, b] of EDGES) {
    const dd = t - e;
    if (Math.abs(dd) < FADE) {
      if (dd < 0) {
        mixTo = b;
        mix = (dd + FADE) / (2 * FADE);
      } else {
        mixTo = a;
        mix = 1 - (dd + FADE) / (2 * FADE);
      }
    }
  }
  return { phase, mixTo, mix };
}

/** Whether the ground shows snow: snowing, or winter unless live weather says otherwise. */
export function isSnowy(weather: Weather, season: Season, liveWeather: boolean): boolean {
  return weather === 'snow' || (season === 'winter' && !liveWeather);
}

export type BackgroundKey = `${'' | 'snow_'}${Phase}`;

export const BACKGROUND_KEYS: readonly BackgroundKey[] = [
  'day',
  'dusk',
  'night',
  'dawn',
  'snow_day',
  'snow_dusk',
  'snow_night',
  'snow_dawn',
];

/** Which of the eight pre-tinted backgrounds to draw. */
export function backgroundKey(phase: Phase, snowy: boolean): BackgroundKey {
  return `${snowy ? 'snow_' : ''}${phase}`;
}

export function lerp3(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The sprite tint at `t`, blended across a boundary like the prototype. */
export function tintAt(t: number): [number, number, number] {
  const m = phaseMix(t);
  const base = PHASE_TINT[m.phase];
  return m.mixTo ? lerp3(base, PHASE_TINT[m.mixTo], Math.min(1, m.mix)) : [base[0], base[1], base[2]];
}

/** `rgb(...)` fill for a tint triple, truncated like the prototype's `|0`. */
export function tintCss(f: readonly [number, number, number]): string {
  return `rgb(${(f[0] * 255) | 0},${(f[1] * 255) | 0},${(f[2] * 255) | 0})`;
}

/** HUD clock: the prototype shows the clock t as hh:mm with day starting at 06:00. */
export function clockLabel(t: number): string {
  const hrs = ((t + 0.25) * 24) % 24;
  const hh = String(Math.floor(hrs)).padStart(2, '0');
  const mm = String(Math.floor((hrs % 1) * 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

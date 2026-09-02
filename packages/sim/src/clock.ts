// World clock and seasons, ported from the prototype's "clock + weather" block.
//
// `t` runs from 0 to 1 over one sim-day. The prototype advanced it by real seconds over a
// 180-second period; here it advances by sim seconds, so the sim decides how fast time runs and
// the host decides how much sim time each real frame gets. Seasons follow elapsed sim time the
// way the prototype's followed elapsed real time since the first visit.

import { RULES, TICK_MS } from './rules';

export type Phase = 'day' | 'dusk' | 'night' | 'dawn';

export interface Clock {
  /** Fraction of the sim-day, 0 to 1. Starts at .18 like the prototype (mid-morning). */
  t: number;
  /** Sim seconds per sim-day. 180 when watching. */
  periodSec: number;
  /** A paused clock stops `t`; everything else keeps ticking, as in the prototype. */
  paused: boolean;
  /** Ticks since the world was created. */
  tick: number;
  /** Sim milliseconds since the world was created. Replaces the prototype's `performance.now()`. */
  nowMs: number;
  /** How many times `t` has wrapped past midnight. */
  dayCount: number;
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonName = (typeof SEASONS)[number];

export const SEASON_TEMP: Record<SeasonName, number> = { spring: 12, summer: 26, autumn: 10, winter: -3 };
export const SEASON_ODDS: Record<SeasonName, { rain: number; snow: number }> = {
  spring: { rain: 0.35, snow: 0.02 },
  summer: { rain: 0.18, snow: 0 },
  autumn: { rain: 0.42, snow: 0.05 },
  winter: { rain: 0.05, snow: 0.5 },
};

/** Length of one season in sim milliseconds: nine days, as the prototype's `RULES.season`. */
export const SEASON_MS = RULES.season.realDays * 86400e3;

export interface Season {
  /** Sim milliseconds counted towards the season cycle. Keeps running while the clock is paused. */
  elapsedMs: number;
  /** A fixed season, or null for the automatic nine-day cycle. */
  override: SeasonName | null;
}

export function createClock(): Clock {
  return { t: RULES.clock.startT, periodSec: RULES.clock.periodSec, paused: false, tick: 0, nowMs: 0, dayCount: 0 };
}

export function createSeason(): Season {
  return { elapsedMs: 0, override: null };
}

/** Phase boundaries exactly as the prototype: day < .42, dusk < .52, night < .92, then dawn. */
export function phaseOf(t: number): Phase {
  return t < 0.42 ? 'day' : t < 0.52 ? 'dusk' : t < 0.92 ? 'night' : 'dawn';
}

/** Advance the clock by one tick. Returns a new clock; the input is untouched. */
export function advanceClock(clock: Clock, dtMs: number = TICK_MS): Clock {
  const tick = clock.tick + 1;
  const nowMs = clock.nowMs + dtMs;
  if (clock.paused) return { ...clock, tick, nowMs };
  const t = (clock.t + dtMs / 1000 / clock.periodSec) % 1;
  const dayCount = t < clock.t ? clock.dayCount + 1 : clock.dayCount;
  return { ...clock, t, tick, nowMs, dayCount };
}

export function advanceSeason(season: Season, dtMs: number = TICK_MS): Season {
  return { ...season, elapsedMs: season.elapsedMs + dtMs };
}

/** The season the automatic cycle is in after `elapsedMs` of sim time. */
export function seasonAt(elapsedMs: number): SeasonName {
  return SEASONS[Math.floor(elapsedMs / SEASON_MS) % 4] as SeasonName;
}

export function currentSeason(season: Season): SeasonName {
  return season.override ?? seasonAt(season.elapsedMs);
}

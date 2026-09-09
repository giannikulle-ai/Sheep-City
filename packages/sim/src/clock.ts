// World clock and seasons, ported from the prototype's "clock + weather" block.
//
// `t` runs from 0 to 1 over one sim-day. The prototype advanced it by real seconds over a
// 180-second period; here it advances by sim seconds, so the sim decides how fast time runs and
// the host decides how much sim time each real frame gets.
//
// **Seasons changed shape in #84.** They used to be a fixed nine-real-day wheel (`SEASON_MS`,
// removed), cycled off the sim time elapsed since the world was made. They now follow the **real**
// year: `Season` carries the real instant the world was created at and the world's own seed, and
// `src/calendar.ts` turns those two numbers plus the elapsed sim time into a season, its start, and
// its end. Nothing here reads a clock: `realEpochMs` comes in from the host, and the host maps wall
// time to sim time one to one (`ledger/catch-up.ts`).

import { DEFAULT_REAL_EPOCH_MS, seasonFractionAtRealMs, seasonSpanAt, type SeasonName, type SeasonSpan } from './calendar';
import { RULES, TICK_MS } from './rules';

// The calendar's own vocabulary, re-exported here because `clock` is where the rest of the package
// (and the client) has always reached for a season name.
export { DEFAULT_REAL_EPOCH_MS, MS_PER_REAL_DAY, REAL_YEAR_MS, SEASONS, type CivilDate, type SeasonName, type SeasonSpan } from './calendar';

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

/** Nominal degrees C per season and the per-roll weather odds, read from balance/farm.json through RULES. */
export const SEASON_TEMP: Record<SeasonName, number> = RULES.seasons.temp;
export const SEASON_ODDS: Record<SeasonName, { rain: number; snow: number }> = RULES.seasons.odds;

export interface Season {
  /** Sim milliseconds counted towards the calendar. Keeps running while the clock is paused. */
  elapsedMs: number;
  /** A fixed season, or null to read the real-year calendar. */
  override: SeasonName | null;
  /**
   * The real instant (UTC milliseconds since 1970) this world was created at — the real date that
   * `elapsedMs === 0` stood on. Handed in by the host; `DEFAULT_REAL_EPOCH_MS` when nobody does.
   * Added in save v8 (#84).
   */
  realEpochMs: number;
  /**
   * The world's own seed, kept here so the calendar can be read from a `Season` alone — the client
   * calls `currentSeason(sim.season)`, the Ledger carries its own copy of this object with no
   * `SimState` behind it, and both must get the same answer. Always `SimState.seed` / `Ledger.seed`.
   * Added in save v8 (#84).
   */
  seed: number;
}

export function createClock(): Clock {
  return { t: RULES.clock.startT, periodSec: RULES.clock.periodSec, paused: false, tick: 0, nowMs: 0, dayCount: 0 };
}

/**
 * A fresh season slice. `seed` is the world's seed and `realEpochMs` the real instant the host says
 * the world is being created at; without one the world gets `DEFAULT_REAL_EPOCH_MS`, which lands in
 * spring on every seed (see calendar.ts for why that constant and not "today").
 */
export function createSeason(seed = 0, realEpochMs = DEFAULT_REAL_EPOCH_MS): Season {
  return { elapsedMs: 0, override: null, realEpochMs, seed: seed >>> 0 };
}

/** Phase boundaries exactly as the prototype: day < .42, dusk < .52, night < .92, then dawn. */
export function phaseOf(t: number): Phase {
  const p = RULES.clock.phases;
  return t < p.dusk ? 'day' : t < p.night ? 'dusk' : t < p.dawn ? 'night' : 'dawn';
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

/**
 * The real instant this world is at, `offsetMs` of sim time from where its season slice stands.
 * The host's mapping is one to one, so sim milliseconds are real milliseconds here.
 */
export function realMsOf(season: Season, offsetMs = 0): number {
  return season.realEpochMs + season.elapsedMs + offsetMs;
}

/**
 * The real instant a stored sim timestamp stands at — `state.clock.nowMs`, a cooldown, an event's
 * own `startedMs`. `Season.elapsedMs` and `Clock.nowMs` are the same count (both start at zero and
 * both advance by every step's `dtMs`, paused or not; see `advanceClock` and `advanceSeason`), so
 * the epoch plus one is the epoch plus the other.
 */
export function realMsAtSim(season: Season, simMs: number): number {
  return season.realEpochMs + simMs;
}

/** The real calendar season this world is in, with its start and end. Ignores `override`. */
export function seasonSpanOf(season: Season, offsetMs = 0): SeasonSpan {
  return seasonSpanAt(season.seed, realMsOf(season, offsetMs));
}

/** The season in force `offsetMs` of sim time from here: a deity override, else the calendar. */
export function seasonAtOffset(season: Season, offsetMs = 0): SeasonName {
  return season.override ?? seasonSpanOf(season, offsetMs).name;
}

export function currentSeason(season: Season): SeasonName {
  return seasonAtOffset(season, 0);
}

/**
 * How far through the current season the world is, 0 to just under 1. Reads the **calendar**, not
 * the override: a deity holding the world in winter does not move where the real year has got to,
 * and `simDate`'s season and its `dayOfSeason` were always read from those two different places
 * (`engine.ts`'s `triggerMet`). Unchanged from before #84 in that respect; what changed is that the
 * denominator is the season's own realized real length rather than a fixed nine days.
 */
export function seasonFractionOf(season: Season, offsetMs = 0): number {
  return seasonFractionAtRealMs(season.seed, realMsOf(season, offsetMs));
}

/** The current season's realized length in milliseconds (69 to 113 real days; see calendar.ts). */
export function seasonLengthOf(season: Season, offsetMs = 0): number {
  const span = seasonSpanOf(season, offsetMs);
  return span.endMs - span.startMs;
}

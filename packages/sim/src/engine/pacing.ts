// Pacing: every number that decides how often the world does something, in one place, as data
// with a comment (issue #40: "ship every pacing number as data with a comment"). Nothing here is
// a magic number buried in the draw.
//
// Time in the deck is in-world time. One sim-day is 1,440 sim-minutes and lasts the clock's own
// period (180 sim-seconds when watching), so one sim-minute is `periodSec * 1000 / 1440` sim
// milliseconds: 125 ms at the watching rate, one and a quarter ticks. Every conversion goes
// through `simMinuteMs` so a world running a different period keeps in-world pacing, not
// wall-clock pacing.

/** Sim-minutes in one sim-day, as both event files' `timeScale.simMinutesPerDay` says. */
export const SIM_MINUTES_PER_DAY = 1440;

/** One sim-minute in sim milliseconds, at this world's clock period. */
export function simMinuteMs(periodSec: number): number {
  return (periodSec * 1000) / SIM_MINUTES_PER_DAY;
}

/** In-world minutes as sim milliseconds. */
export function simMinutesToMs(minutes: number, periodSec: number): number {
  return minutes * simMinuteMs(periodSec);
}

/** In-world hours as sim milliseconds. */
export function simHoursToMs(hours: number, periodSec: number): number {
  return simMinutesToMs(hours * 60, periodSec);
}

/** In-world days as sim milliseconds: one sim-day is one clock period. */
export function simDaysToMs(days: number, periodSec: number): number {
  return days * periodSec * 1000;
}

/** Sim milliseconds as in-world minutes. */
export function msToSimMinutes(ms: number, periodSec: number): number {
  return ms / simMinuteMs(periodSec);
}

export const PACING = {
  /**
   * The engine looks at the world once per sim-minute (plan section 2, "Layer 3"). At the watching
   * period that is every 125 ms of sim time, so about four evaluations every five ticks.
   */
  evalEverySimMinutes: 1,

  /**
   * Global concurrency cap: never more than this many events running at once, cards and authored
   * together. Two lets a slow background card (a fog morning, a shearing day) overlap one short
   * beat without the field turning into a fairground.
   */
  concurrentCap: 2,

  /**
   * Global minimum gap between one card draw and the next, start to start, in sim-minutes. 240 is
   * four sim-hours, thirty real seconds when watching: long enough that two cards never crowd each
   * other, short enough that a five-real-minute watch (2,400 sim-minutes) can still hold a handful.
   */
  minGapSimMinutes: 240,

  /**
   * How a draw attempt turns the eligible cards' live weight into a chance. One attempt per
   * sim-minute succeeds with `totalWeight / weightForCertainDraw`, so a lone ordinary card (base
   * 10) fires on average once every 240 sim-minutes of eligible time, four sim-hours — the same
   * order as the global gap, so a busy field paces on the gap and a quiet one paces on the weight.
   */
  weightForCertainDraw: 2400,

  /**
   * Ceiling on one attempt's chance however fat the eligible set is: even with every card in the
   * deck eligible at once, a draw takes a few sim-minutes rather than landing on the first one.
   */
  maxDrawChance: 0.2,

  /**
   * The quiet stretch, in sim-minutes, after the last event *started* before the engine relaxes its
   * thresholds so the world never goes dead (plan section 2). 720 is half a sim-day, ninety real
   * seconds when watching: long enough that ordinary pacing is never bent, short enough that a
   * watching player never sits through three quiet minutes.
   */
  quietStretchSimMinutes: 720,

  /** While relaxed, the global gap is scaled by this: 240 sim-minutes becomes 60. */
  quietGapScale: 0.25,

  /** While relaxed, an attempt's chance is multiplied by this (still capped by `maxDrawChance`). */
  quietWeightBoost: 4,

  /**
   * Never start a card whose moment kind is the one that started last (issue #40's goal line:
   * "never two of the same kind back to back"). Applies to the card draw only: an authored event is
   * punctuation and is never held back by it, and the quiet relaxation lifts it too (see
   * `eligibleCards`) — after a long enough silence, two lambs in a row beats a dead world.
   */
  noRepeatMomentKind: true,

  /**
   * An end line's share of its start's notability hint. An event's end is a real fact and is always
   * told, but a storybook page should be built from the thing that happened, not from its closing
   * bracket, so an end sits at a quarter of the start's weight.
   */
  endHintShare: 0.25,

  /**
   * How long an authored event whose trigger is a date (`simDate`) is barred after it fires, as a
   * share of the full four-season cycle. Just under 1 so "the first day of spring" comes round once
   * a cycle and cannot fire twice in the same one.
   */
  simDateCooldownCycles: 0.95,
} as const;

/** What the pacing looks like right now: the gap and boost a draw attempt is working under. */
export interface Pacing {
  /** Sim-minutes since the last event of any kind started; `Infinity` when nothing ever has. */
  quietSimMinutes: number;
  /** True once the quiet stretch has passed: thresholds are relaxed until something starts. */
  relaxed: boolean;
  /** The gap a draw is held to right now, in sim-minutes. */
  gapSimMinutes: number;
  /** The multiplier on an attempt's chance right now. */
  weightBoost: number;
}

/**
 * The pacing in force at `nowMs`, given when the last event started (`-1` for "nothing yet"). Pure
 * and cheap, so tests can assert the relaxation boundary directly rather than inferring it from a
 * run: it fires after `quietStretchSimMinutes` and only then.
 */
export function pacingAt(lastStartMs: number, nowMs: number, periodSec: number): Pacing {
  const quietSimMinutes = lastStartMs < 0 ? Infinity : msToSimMinutes(nowMs - lastStartMs, periodSec);
  const relaxed = quietSimMinutes >= PACING.quietStretchSimMinutes;
  return {
    quietSimMinutes,
    relaxed,
    gapSimMinutes: relaxed ? PACING.minGapSimMinutes * PACING.quietGapScale : PACING.minGapSimMinutes,
    weightBoost: relaxed ? PACING.quietWeightBoost : 1,
  };
}

/** The chance one draw attempt lands, given the eligible set's total live weight. */
export function drawChance(totalWeight: number, boost: number): number {
  if (!(totalWeight > 0)) return 0;
  const raw = ((totalWeight * boost) / PACING.weightForCertainDraw) * PACING.evalEverySimMinutes;
  return raw > PACING.maxDrawChance ? PACING.maxDrawChance : raw;
}

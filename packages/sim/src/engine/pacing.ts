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
   * The engine looks at the world once every two sim-minutes (Round 1 verifier finding 2, #82).
   * History: the plan's "Layer 3" said every sim-minute (`evalEverySimMinutes: 1`); Round 1 moved
   * it to 2 after measuring trunk 897.3 ms vs. engine-on 964.1 ms at every minute (+66.8 ms,
   * three-of-three MET to one-of-three NOT MET against the catch-up budget) and 921.0 ms at every
   * two minutes on their own box. Round 2's verifier re-measured on a different box and found
   * every-two-minutes still NOT MET on 2 of 4 runs (mean 1014.4 ms vs. trunk 897.3 ms, +117.1 ms) —
   * the Round 1 lever had bought only about 18 ms of that, not the ~43 ms Round 1's own harness
   * predicted.
   *
   * Round 2 traced *where* the rest of the cost actually is, and it is not where either round
   * assumed. Profiling (`node --prof`, and direct per-phase timers wrapped around one tick) shows
   * `evaluate`'s own predicate-and-draw logic costs only a small share of the delta. The
   * `couldStartSomething` early-out below cuts that further, skipping the predicate view entirely
   * once no authored trigger is off cooldown and the 800-sim-minute card gap hasn't elapsed — most
   * evaluations become a handful of comparisons, and it is RNG-neutral (checked by toggling it
   * alone against a fixed seed set: identical draws, identical hashes either way). The rest of the
   * gap — well over half of it — is not the engine's *decision* logic at all: it is
   * `farmerMarketWalk` (`engine/category.ts`, also #40) — a real, wanted feature, not a bug —
   * putting the farmer on the field for one extra stretch every day. Disabling only that one
   * category action (nothing else) on an otherwise-unmodified branch build closed the branch/trunk
   * gap from about +150 ms to about +37 ms on the box this was measured on: an extra daily NPC
   * visit's own downstream cost in the (unrelated) sheep-tick hot path, not card-draw predicate
   * evaluation, is the dominant remaining share.
   *
   * With the early-out (this round's real lever) and `evalEverySimMinutes` kept at 2, four runs
   * each, same box, same install: trunk mean 872.4 ms (865.7, 845.2, 881.3, 897.2 — MET 4/4);
   * branch mean 981.6 ms (984.6, 963.9, 971.6, 1006.4 — MET 3/4, up from Round 1's 2/4); branch with
   * the engine forced off (same build) mean 929.8 ms (900.9, 952.9, 956.4, 908.9 — MET 4/4). Delta
   * branch-on vs. branch-off, the engine's own true share on this one build: +51.8 ms, down from
   * Round 1's measured ~117 ms and consistent with the `farmerMarketWalk` attribution above. Delta
   * branch-on vs. trunk: +109.2 ms, still over budget on 1 of 4 runs.
   *
   * Round 2 also tried the obvious next lever — `evalEverySimMinutes: 4` — and measured it: mean
   * 975.5 ms, MET on 3 of 4 runs, a real further improvement on the bench. But `farmerMarketWalk`'s
   * cost is fixed (once a day, however often the engine looks), so the only thing a coarser interval
   * actually buys here is fewer *card* draw attempts. With the warm-up correctly at 480 sim-minutes
   * (this round's own fix), the ticket's "about three per five minutes" was already down to a median
   * of **2** card/authored starts in five real minutes at `evalEverySimMinutes: 2` (seeds 1-30:
   * range 1 to 3, 2 of the 30 seeds draw no card at all in the whole watch) — the warm-up eating
   * closer to a third of every five-minute watch costs real density on its own, independent of this
   * constant. Moving to every-four-minutes measured the same median (2) and the same range (1 to 3),
   * but roughly doubled the quiet tail: 4 of the 30 seeds drew no card at all, against 2 at every-two-
   * minutes. That is a real, further cost — not the "median 3 to 2" this comment first claimed before
   * re-measuring against the corrected warm-up, which was wrong — spent to shave a budget line whose
   * real cost is a different feature entirely, so it was reverted; every number above and every seed
   * this round re-measures below is `evalEverySimMinutes: 2`. Between a catch-up bench not reliably
   * under budget on this box either way, and a quiet-seed rate that doubles for a marginal bench gain,
   * this round keeps the smaller number and says so plainly rather than trade more of the ticket's own
   * density for a mean that still isn't a guarantee. The way out from here is a lever aimed at the
   * NPC-presence cost itself, the deferred #78, or the Foreman/owner deciding the budget line is
   * advisory until one of those lands — not a further cut to how often the engine looks. See the PR's
   * Round 2 note for the full measurements.
   */
  evalEverySimMinutes: 2,

  /**
   * Global concurrency cap: never more than this many events running at once, cards and authored
   * together. Two lets a slow background card (a fog morning, a shearing day) overlap one short
   * beat without the field turning into a fairground.
   */
  concurrentCap: 2,

  /**
   * Global minimum gap between one card draw and the next, start to start, in sim-minutes. Retuned
   * in Round 1 (owner note on #82, after `evalEverySimMinutes: 2`): the ticket asked for "about
   * three" card/authored starts in a five-real-minute watch, and the shipped 240 (thirty real
   * seconds) measured a median of five, range four to six. 800 is one hundred real seconds when
   * watching: long enough that two cards never crowd each other, and that a five-real-minute watch
   * (2,400 sim-minutes) holds three or four rather than five or six. See the retune's measurements
   * on `warmupSimMinutes`'s neighbour below and in `test/engine-draw.test.ts`.
   */
  minGapSimMinutes: 800,

  /**
   * How a draw attempt turns the eligible cards' live weight into a chance. One attempt per
   * `evalEverySimMinutes` succeeds with roughly `totalWeight * evalEverySimMinutes /
   * weightForCertainDraw`, so a lone ordinary card (base 10) fires on average once every 1,200
   * sim-minutes of eligible time, 150 real seconds — the same order as the global gap below, so a
   * busy field paces on the gap and a quiet one paces on the weight. Retuned alongside
   * `minGapSimMinutes` in Round 1 (owner note on #82); was 2,400 (240 sim-minutes average, matching
   * the old gap).
   */
  weightForCertainDraw: 12000,

  /**
   * Ceiling on one attempt's chance however fat the eligible set is: even with every card in the
   * deck eligible at once, a draw takes a few sim-minutes rather than landing on the first one.
   */
  maxDrawChance: 0.2,

  /**
   * The quiet stretch, in sim-minutes, after the last event *started* before the engine relaxes its
   * thresholds so the world never goes dead (plan section 2). Retuned with the gap in Round 1 (owner
   * note on #82): must stay above `minGapSimMinutes` (the test on that invariant says so) so the
   * relaxation is a backstop past ordinary pacing, not a substitute for it, and close enough above it
   * that the backstop still has room to act inside a five-real-minute watch — pushed further out
   * (1,200, then 1,600) cost the ticket's own seed-9 bar of three distinct moment kinds in a five-
   * minute run, because the relaxation (which lifts the no-repeat-moment-kind rule) then had too
   * little of the watch left to reach. 820 is 102.5 real seconds when watching, just past the
   * retuned gap: long enough that ordinary pacing is never bent by it, and measured to keep the
   * seed-9 bar with room either side (empirically fine from 801 through about 830, breaking again by
   * 840 — see `test/engine-draw.test.ts`, which pins the exact bar this constant has to clear).
   */
  quietStretchSimMinutes: 820,

  /** While relaxed, the global gap is scaled by this: 800 sim-minutes becomes 200. */
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

  /**
   * No card draws in the world's first `warmupSimMinutes` of sim time (owner note, Round 1, #82,
   * plan line 11: "no card draws in a fresh world's first minute"): a fresh world's very first look
   * at the world was winning the merchant caravan card on 29 of 30 seeds, median 17.3 real seconds
   * in, sometimes under one second — a watching player usually met him before they had settled in.
   * Round 2 found the constant's own comment claimed "60 sim-minutes is one real minute" — it is
   * not: a sim-minute is `periodSec * 1000 / 1440` sim ms (125 ms at the watching rate, `periodSec`
   * 180), so 60 sim-minutes is 7,500 ms, 7.5 real seconds, eight times too short to be the owner's
   * "first minute." One real minute at the watching rate is 480 sim-minutes (480 * 125 ms =
   * 60,000 ms), which is what the owner actually asked for; the constant is fixed to match its own
   * comment. Authored events (the birthday, the storm, first snow) are punctuation on their own
   * trigger, and category actions (the farmer's dawn walk) are the world's scheduled rhythm —
   * neither is a draw, so neither is gated by this; only `attemptDraw`'s card draw checks it.
   * Measured from `state.clock.nowMs`, so it holds for a fresh world and has already passed for
   * anything loaded from a save or fast-forwarded past it.
   */
  warmupSimMinutes: 480,
} as const;

/**
 * Digital Luna's `fetchLamb` behaviour (`behaviours/luna.ts`, #40's `lostLamb` half) sits at this
 * priority in her `routine` chain, above `bedtime` (50): a lamb out at dusk is a job, not a night
 * in, so she fetches it even after bedtime would otherwise claim her. The alternative considered
 * (Round 1 verifier finding 1) was below 50, where bedtime wins outright and a stray lamb waits
 * until morning; the owner decided "fetch wins" on 2026-09-08. `test/luna.test.ts` pins this
 * constant, not the literal 55, so a future change of heart is still a one-number change here.
 */
export const FETCH_LAMB_PRIORITY = 55;

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

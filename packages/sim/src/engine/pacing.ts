// Pacing: every number that decides how often the world does something, in one place, as data
// with a comment (issue #40: "ship every pacing number as data with a comment"). Nothing here is
// a magic number buried in the draw.
//
// **Everything on `PACING` is stated in farm days or farm hours. There is no real-minute constant
// in this file** (the owner's decision, 2026-09-09, plan decision 16: "small thing most days, big
// thing a few a month"). A farm day is the clock's own period — three real minutes when watching,
// about a real day when away — so a pace written in farm days reads the same to a player whatever
// the world's period is, and the retired real-minute framing ("about three moments per five real
// minutes", decision 11) did not.
//
// The conversion from world time to sim time happens in exactly one place, `simMinuteMs`, and
// everything else is expressed through it: a farm day is `SIM_MINUTES_PER_DAY` sim-minutes, a farm
// hour is `SIM_MINUTES_PER_FARM_HOUR` of them, and one sim-minute is `periodSec * 1000 / 1440` sim
// milliseconds (125 ms at the watching rate, one and a quarter ticks).

/** Sim-minutes in one farm day, as both event files' `timeScale.simMinutesPerDay` says. */
export const SIM_MINUTES_PER_DAY = 1440;

/** Farm hours in one farm day, as both event files' `timeScale.simHoursPerDay` says. */
export const FARM_HOURS_PER_DAY = 24;

/** Sim-minutes in one farm hour: the day length over the hours in it, derived, never a literal. */
export const SIM_MINUTES_PER_FARM_HOUR = SIM_MINUTES_PER_DAY / FARM_HOURS_PER_DAY;

/** Farm hours as sim-minutes. Every `...FarmHours` constant below goes through this. */
export function farmHoursToSimMinutes(hours: number): number {
  return hours * SIM_MINUTES_PER_FARM_HOUR;
}

/** Farm days as sim-minutes. Every `...FarmDays` constant below goes through this. */
export function farmDaysToSimMinutes(days: number): number {
  return days * SIM_MINUTES_PER_DAY;
}

/** One sim-minute in sim milliseconds, at this world's clock period. The one conversion. */
export function simMinuteMs(periodSec: number): number {
  return (periodSec * 1000) / SIM_MINUTES_PER_DAY;
}

/** In-world minutes as sim milliseconds. */
export function simMinutesToMs(minutes: number, periodSec: number): number {
  return minutes * simMinuteMs(periodSec);
}

/** In-world hours as sim milliseconds. */
export function simHoursToMs(hours: number, periodSec: number): number {
  return simMinutesToMs(farmHoursToSimMinutes(hours), periodSec);
}

/** In-world days as sim milliseconds: one farm day is one clock period. */
export function simDaysToMs(days: number, periodSec: number): number {
  return days * periodSec * 1000;
}

/** Sim milliseconds as in-world minutes. */
export function msToSimMinutes(ms: number, periodSec: number): number {
  return ms / simMinuteMs(periodSec);
}

/**
 * **The two targets are the owner's, in the owner's own words** (2026-09-09, plan decision 16):
 * "small thing most days, big thing a few a month". They are stated here as *outcomes* — what a
 * month on the farm should feel like — and they are the two numbers to move if it feels too busy or
 * too empty. Nothing else in this file should be reached for first.
 *
 * The engine's own knob is a rate (`SIZE_PACING` below), not an outcome, because a draw is a chance
 * per look at the world. How much outcome a given rate buys depends on the deck: a card is only
 * eligible while its own conditions hold, and several of the farm's small cards want a season or a
 * time band that is a slice of the day. So the outcome is **measured**, in
 * `test/engine-pace.test.ts` (thirty seeds, thirty farm days, two independent rulers agreeing seed
 * for seed), and the measured figure sits beside each target here — including where it falls short.
 */
export const PACE_TARGETS = {
  /**
   * Small things: "a small thing most days" — the owner's own shape is **four farm days in five**.
   *
   * **Measured on this head** (seeds 1-30, thirty farm days each, watched throughout, two
   * independent rulers agreeing seed for seed — see `test/engine-pace.test.ts`): farm days with at
   * least one small start, **median 18 of 30, mean 17.93, range 15 to 21**. That is three days in
   * five, not four, and the shortfall is the deck's rather than the pacing's: pushing the rate does
   * not close it. Swept in-process at this head (mutating `SIZE_PACING.small.perFarmDay`, control
   * run reproduces the shipped row exactly), the same measurement reads **14.37 days at 3.2, 16.13
   * at 5, 17.93 at the shipped 8, 18.83 at 12, 20.00 at 20 and 20.77 at 100** — a ceiling of about
   * two days in three however hard the engine pushes, because on the other days no small card's
   * conditions hold at all. Twelve of the fifteen cards are small, but a thirty-farm-day month never
   * leaves one season (a season is 4,320 farm days), and by season condition alone the twelve split
   * unevenly — **spring 8, summer 11, autumn 10, winter 8** (counted card by card against
   * `farm.json`) — the fireflies are summer nights, the crows summer and autumn days, the well a
   * summer drought, several of them for one time band of four. A fresh world always starts in
   * spring (`createSeason()`), which is why this sweep, run from a fresh world every seed, sees the
   * lower figure of 8; a save already in summer has 11 to draw from over the same thirty days.
   *
   * **The lever is the deck, and it is the world lane's** — #102's own line, "the weights are
   * rebalanced by size for the world-time targets", plus PR #99's coverage work ("every season ×
   * time band has at least two small cards that can draw"). This PR deliberately does not touch a
   * weight or a condition in `farm.json` — it adds `size` and nothing else, so #99 merges cleanly
   * behind it. Until that lands, four days in five is not a number this deck can deliver, and
   * saying so is better than quietly re-pointing the target at what it can.
   */
  smallDaysInFive: 4,

  /**
   * Big things: "a big thing a few a month" — about **three in thirty farm days**.
   *
   * **Measured on this head**, same thirty seeds and thirty farm days, watched throughout: big
   * starts per thirty farm days, **median 2, mean 2.30, range 0 to 5**; between one and five on 28
   * of 30 seeds, and zero on two of them (seeds 8 and 14 — nothing is forced, and a quiet month is
   * allowed). This one lands about where the owner asked.
   *
   * Zero on an unwatched span, always, by construction and not by luck — see
   * `PACING.bigDrawsWhileWatchedOnly`.
   */
  bigPerThirtyFarmDays: 3,
} as const;

/**
 * The weight a rate is quoted at: an ordinary card's `weight.base`, 10, the scale the deck's own
 * schema calls ordinary. A lone ordinary card draws at exactly its size's rate per farm day *of
 * eligible time*; a fatter eligible set draws proportionally faster, which is what makes `weight`
 * "the live multiplier" the plan asks for rather than a second pacing knob.
 */
export const REFERENCE_WEIGHT = 10;

export const PACING = {
  /**
   * The engine looks at the world once every two sim-minutes (Round 1 verifier finding 2, #82).
   * Unchanged by the world-time rewrite: it is a resolution, not a pace — the chance of a draw at
   * each look scales with how much world time the look covers (`drawChance`), so looking half as
   * often does not halve how often things happen.
   *
   * History and the bench measurements behind it are unchanged from #82 and are not re-measured
   * here: the plan's "Layer 3" said every sim-minute; Round 1 moved it to 2 after measuring trunk
   * 897.3 ms against engine-on 964.1 ms at every minute on the charter's catch-up bench; Round 2
   * traced most of the remaining gap to `farmerMarketWalk` (`engine/category.ts`), a feature the
   * owner asked for, rather than to the engine's decision logic, and added the `couldStartSomething`
   * early-out in `engine.ts`; Round 3 re-measured across three interleaved matrices and found the
   * engine's own share +43.1 to +76.4 ms across the three (this file's own history, commit 08224da,
   * carries the matrix-by-matrix numbers that range is drawn from). The Foreman's round-3 ruling
   * stands: **the catch-up bench line is advisory until #78 lands**, the market walk is not traded
   * for the bench, and nothing here claims the branch is under or over it.
   */
  evalEverySimMinutes: 2,

  /**
   * Global concurrency cap: never more than this many events running at once, cards and authored
   * together. Two lets a slow background card (a fog morning, a shearing day) overlap one short
   * beat without the field turning into a fairground.
   */
  concurrentCap: 2,

  /**
   * The global gap between one **small** draw and the next, start to start, in farm hours. A few
   * farm hours: long enough that two small things never crowd each other inside one afternoon,
   * short enough that a farm day can hold two or three of them when the world is busy. Six farm
   * hours is 45 real seconds at the watching rate and a quarter of a farm day.
   */
  smallGapFarmHours: 6,

  /**
   * The global gap between one **big** draw and the next, start to start, in farm days. Several
   * farm days: a set piece is not a thing that happens twice in a week. Four farm days puts a
   * ceiling of seven big things on a thirty-day month whatever the weights say, well above the
   * target of three, so the gap shapes the spacing and the target sets the rate.
   */
  bigGapFarmDays: 4,

  /**
   * Ceiling on one look's chance however fat the eligible set is: even with every card in the deck
   * eligible at once, a draw takes a few looks rather than landing on the first one.
   */
  maxDrawChance: 0.2,

  /**
   * **Big things happen only while the farm is watched** (the owner: "the big ones should not
   * happen when I am not watching"). This is the flag that says the rule is on, so the rule is
   * data like every other pacing number rather than a hard-coded `if`; `test/engine-pace.test.ts`
   * asserts zero big starts across every unwatched span as an absolute, not a floor.
   *
   * How the engine knows it is watched is written down in `engine.ts`'s `evaluate`: the live `step`
   * path is watched, and `catchUp` is unwatched. Nothing asks the operating system.
   */
  bigDrawsWhileWatchedOnly: true,

  /**
   * Never start a card whose moment kind is the one that started last (issue #40's goal line:
   * "never two of the same kind back to back"). Applies to the card draw only: an authored event is
   * punctuation and is never held back by it.
   *
   * Nothing lifts this any more. The quiet relaxation that used to lift it after a long silence is
   * retired with the rest of the forcing (see the block below), so a small deck whose season has
   * one card in it simply draws nothing that night, which is allowed.
   */
  noRepeatMomentKind: true,

  /**
   * How long the no-repeat rule above holds, in farm hours. "Back to back" is a thing that happens
   * in time: half a farm day later is not back to back, and a rule with no clock on it is not a
   * pacing preference but a lockout.
   *
   * This bound is **new in #101 and is not the retired relaxation coming back in another coat**. The
   * relaxation keyed off silence and then forced the world (a quarter of the gap, four times the
   * weight, the no-repeat rule lifted); this keys off nothing but the clock, touches no gap and no
   * weight, and can only ever let a card back into the eligible set that its own gap and cooldown
   * already allow. It exists because retiring the relaxation without it would have made the lockout
   * *permanent*: `lastMomentKind` is never cleared, six of the twelve small cards are `dl-trick`,
   * and in a season where only `dl-trick` cards are eligible the first one to draw would have shut
   * the rest out for good. Measured at this head, the bound is worth about half a day of the thirty
   * (17.5 farm days with a small start without it, 17.9 with it): it is a correctness fix, not a
   * pacing lever, and it is reported as such.
   */
  noRepeatMomentKindFarmHours: 12,

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
   * No card draws in a fresh world's first `warmupFarmHours` of world time (owner note, Round 1,
   * #82, plan line 11: "no card draws in a fresh world's first minute"): a fresh world's very first
   * look at the world was winning the merchant caravan card on 29 of 30 seeds, sometimes under a
   * real second, and a watching player usually met him before they had settled in.
   *
   * Eight farm hours is the same stretch #82 shipped as `warmupSimMinutes: 480`, restated in the
   * unit the owner thinks in: a third of a farm day, one real minute at the watching rate. Authored
   * events (the birthday, the storm, first snow) are punctuation on their own trigger, and category
   * actions (the farmer's dawn walk) are the world's scheduled rhythm — neither is a draw, so
   * neither is gated by this; only the card draw checks it. Measured from `state.clock.nowMs`, so
   * it holds for a fresh world and has already passed for anything loaded from a save.
   */
  warmupFarmHours: 8,

  /**
   * How often the engine looks at the world **while nobody is watching**, in farm hours. During a
   * Ledger catch-up there are no actors and no ticks to hang a look on, so the unwatched draw walks
   * the gap itself: one look per farm hour, each covering a farm hour of world time, which
   * `drawChance` turns into a chance the same way it turns `evalEverySimMinutes` into one on the
   * live path.
   *
   * One farm hour, not one farm day, so the *time band* moves between looks: dawn, day, dusk and
   * night each get their share and a dawn-only card such as the fog morning can draw on an unwatched
   * day. Not finer than that, because of what a gap can be: the host maps wall time to sim time one
   * to one today (`catchUp`'s own doc comment), so **one real week away is 3,360 farm days**, and a
   * look per farm hour is already 80,640 looks for it. `ledger/unwatched.ts` keeps that affordable by
   * rolling before it reads anything (see `unwatchedCeiling`), so a look that cannot land costs one
   * number from the generator and no predicate reads at all.
   *
   * **The honest caveat.** A farm hour is a big enough slice that `maxDrawChance` binds: a lone
   * ordinary card would want 0.33 a look at the small rate and is held to 0.2, so the unwatched path
   * runs at about three fifths of its nominal rate when a card is eligible for a long stretch. The
   * measured outcome is still better than watched play manages — a small thing on 4.93 of 7 farm
   * days against 17.93 of 30 — because an unwatched look walks every band of every day while a
   * watched world's actors are elsewhere. Worth revisiting with the host's wall-to-sim mapping (the
   * plan's "about one real day when away", which is not what the client does today).
   */
  unwatchedLookFarmHours: 1,
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

/** The warm-up in sim-minutes: `warmupFarmHours` through the one conversion. */
export const WARMUP_SIM_MINUTES = farmHoursToSimMinutes(PACING.warmupFarmHours);

/** The small draw's global gap in sim-minutes: `smallGapFarmHours` through the one conversion. */
export const SMALL_GAP_SIM_MINUTES = farmHoursToSimMinutes(PACING.smallGapFarmHours);

/** The big draw's global gap in sim-minutes: `bigGapFarmDays` through the one conversion. */
export const BIG_GAP_SIM_MINUTES = farmDaysToSimMinutes(PACING.bigGapFarmDays);

/** The unwatched look interval in sim-minutes: `unwatchedLookFarmHours` through the one conversion. */
export const UNWATCHED_LOOK_SIM_MINUTES = farmHoursToSimMinutes(PACING.unwatchedLookFarmHours);

/** The no-repeat window in sim-minutes: `noRepeatMomentKindFarmHours` through the one conversion. */
export const NO_REPEAT_SIM_MINUTES = farmHoursToSimMinutes(PACING.noRepeatMomentKindFarmHours);

/**
 * The two sizes' pacing, side by side, so a caller asks the size for its numbers rather than
 * branching on it.
 *
 * `perFarmDay` is the engine's knob: how often a draw of this size lands per farm day **of eligible
 * time** at `REFERENCE_WEIGHT`. It is not the outcome — see `PACE_TARGETS` for the owner's targets
 * and what this deck actually delivers against them. `gapSimMinutes` is the global start-to-start
 * gap between two draws of this size, derived from the farm-day and farm-hour constants above.
 *
 * Why the small number is 8 and not 0.8. If a small card were eligible all day, 0.8 would be
 * exactly "a small thing on four days in five". No card in this deck is: the widest are eligible for
 * one time band of four, in one weather, in some seasons, and the six-farm-hour gap and each card's
 * own multi-day gap then hold what is left apart. 8 is the setting measured to put the delivered
 * outcome as near the owner's target as this deck can reach without stacking two and three small
 * things onto the days that do have one (at 8: 22.6 small starts spread over 17.9 days of 30; at 12
 * it is 24.3 over 18.8, at 100 it is 31.9 over 20.8 — more crowding on the same days, not more
 * days; re-measured with `PACE_TARGETS.smallDaysInFive`'s own sweep, same harness, same seeds).
 * The big number *is* the plain reading: 3 in 30 farm days is 0.1 a day, and the big cards'
 * conditions are wide enough that it lands.
 */
export const SIZE_PACING = {
  small: { perFarmDay: 8, gapSimMinutes: SMALL_GAP_SIM_MINUTES },
  big: { perFarmDay: PACE_TARGETS.bigPerThirtyFarmDays / 30, gapSimMinutes: BIG_GAP_SIM_MINUTES },
} as const;

/**
 * The chance one look at the world lands a draw of `size`, given the eligible set's total live
 * weight and how much world time this look covers (`evalEverySimMinutes` in live play,
 * `unwatchedLookFarmHours` worth of sim-minutes on the unwatched path).
 *
 * The formula is the target rate, scaled by how far the eligible weight sits from one ordinary
 * card, spread over the farm day: a lone base-10 card eligible all day draws at its size's target,
 * and the same card at half the weight draws half as often. Capped by `maxDrawChance` so a fat
 * eligible set does not land on the first look.
 *
 * There is no quiet boost and no relaxation: what this returns is what the pacing is, always.
 */
export function drawChance(totalWeight: number, size: keyof typeof SIZE_PACING, simMinutesCovered: number): number {
  if (!(totalWeight > 0)) return 0;
  const raw = ((totalWeight / REFERENCE_WEIGHT) * SIZE_PACING[size].perFarmDay * simMinutesCovered) / SIM_MINUTES_PER_DAY;
  return raw > PACING.maxDrawChance ? PACING.maxDrawChance : raw;
}

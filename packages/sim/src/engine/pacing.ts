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
 * Both targets now reach the draw: the big one as a plain rate, the small one through the measured
 * table under `SMALL_RATE_FOR_DAYS_IN_FIVE`. Neither is documentation any more.
 */
export const PACE_TARGETS = {
  /**
   * Small things: "a small thing most days" — the owner's own shape is **four farm days in five**,
   * which is 24 farm days of 30.
   *
   * **This number now sets the rate.** Until #86's deck merged it was read by nothing in the draw —
   * PR #99's round-2 Verifier measured that exactly: a pinned constant with no effect, while the
   * engine's real small knob (`SIZE_PACING.small.perFarmDay`) sat at a bare 8 and the outcome went
   * wherever the deck put it. With #86's widened conditions that was **30 farm days of 30, about
   * two small things a day** — past the owner's own target, with nothing in the repo that could
   * ever fail for being too busy. The rate is now looked up from this target
   * (`SMALL_RATE_FOR_DAYS_IN_FIVE` below), measured point by measured point, and
   * `test/engine-pace.test.ts` asserts the delivered outcome against it in **both** directions: too
   * busy fails as loudly as too quiet.
   *
   * **Measured on this head** (seeds 1-30, thirty farm days each, watched throughout, two
   * independent rulers agreeing seed for seed — see `test/engine-pace.test.ts`): farm days with at
   * least one small start, **median 24 of 30, mean 23.90, range 21 to 28**, over **31 small starts**
   * in the month (mean 31.47, range 28 to 35). Most farm days hold one thing, some hold two, and
   * **183 of the 900 seed-days hold nothing at all** — one day in five with nothing on it, which is
   * decision 16's "a quiet farm day is allowed" rather than a gap to close.
   *
   * The shape of the deck is still what decides how much rate that costs: a card is only eligible
   * while its own conditions hold, and the twelve small cards split unevenly by season (spring 8,
   * summer 11, autumn 10, winter 8, counted against `farm.json`), so the same rate reads busier in
   * summer than in spring. That is why the target is met by measurement and not by arithmetic.
   */
  smallDaysInFive: 4,

  /**
   * Big things: "a big thing a few a month" — about **three in thirty farm days**.
   *
   * **Measured on this head**, same thirty seeds and thirty farm days, watched throughout: big
   * starts per thirty farm days, **median 2, mean 1.77, range 0 to 3**; between one and five on 27
   * of 30 seeds, and zero on three of them (seeds 6, 8 and 14 — nothing is forced, and a quiet
   * month is allowed). This one lands about where the owner asked. It moved a little under #86
   * (which was median 2, mean 2.30, range 0 to 5 on #111 alone) because `merchantCaravan`, one of
   * the three big cards, narrowed from day-or-dusk to day-only; the small rate does not touch it.
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
   * the rest out for good. Measured when it landed — at the engine's then-rate of 8, on the deck as
   * it stood before #86 — the bound was worth about half a day of the thirty (17.5 farm days with a
   * small start without it, 17.9 with it). **That pair of numbers has not been re-measured at the
   * shipped rate and is left labelled rather than restated**, because the bound is a correctness
   * fix and not a pacing lever: what it buys is that a `dl-trick`-only season is not locked out
   * for good, and that does not change with the rate.
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
   * **The caveat that used to live here has gone.** A farm hour is a big enough slice that
   * `maxDrawChance` used to bind: at the engine's old rate of 8 a lone ordinary card wanted 0.33 a
   * look and was held to 0.2, so the unwatched path ran at about three fifths of its nominal rate
   * wherever a card was eligible for a long stretch. At the rate the owner's four-in-five target now
   * sets (1.25) the same card wants 0.052, a quarter of the cap, so the unwatched path runs at
   * exactly its nominal rate and only a fat eligible set is still clipped —
   * `test/engine-draw.test.ts` pins that arithmetic both ways round. The measured outcome is still
   * better than watched play manages — a small thing on 6.07 of 7 farm days against 23.90 of 30 —
   * because an unwatched look walks every band of every day while a watched world's actors are
   * elsewhere. Worth revisiting with the host's wall-to-sim mapping (the plan's "about one real day
   * when away", which is not what the client does today).
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
 * What the owner's small target costs in engine rate, on **this deck**, measured — not derived.
 *
 * `drawChance` is linear in the eligible weight, so the rate maps cleanly onto *how often a draw
 * lands while a small card is eligible*. It does not map cleanly onto **how many farm days hold
 * something**, which is what the owner asked for: that depends on how much of each day any small
 * card is eligible at all, which is the deck's shape and not a formula. So each target here carries
 * the rate that was measured to deliver it, with the measurement beside it (seeds 1-30, thirty farm
 * days each, watched throughout — the harness in `test/engine-pace.test.ts`, whose control run at
 * the shipped rate reproduces the shipped row exactly).
 *
 * Move `PACE_TARGETS.smallDaysInFive` and the rate moves with it. A target with no measured point
 * here will not compile, which is the honest failure: it needs somebody to measure the deck at that
 * rate, not an interpolation between two points that were.
 */
const SMALL_RATE_FOR_DAYS_IN_FIVE = {
  /**
   * Three days in five. Measured: median 18 of 30 days (mean 18.37, range 15 to 22), 22 small
   * starts a month (mean 21.67), 349 of 900 seed-days quiet. This is, near enough, the pace trunk
   * had before #86's conditions widened (18 of 30 days, 23 starts) — the deck got wider, so the
   * same feel now costs a lower rate.
   */
  3: 0.6,
  /**
   * Four days in five, the owner's own shape and what this deck ships at. Measured: **median 24 of
   * 30 days** (mean 23.90, range 21 to 28), **31 small starts** a month (mean 31.47, range 28 to
   * 35), 183 of 900 seed-days quiet.
   */
  4: 1.25,
  /**
   * Five days in five — something every single day. Measured: median 30 of 30 days (mean 29.57,
   * range 28 to 30), 57 small starts a month (mean 56.90), 13 of 900 seed-days quiet. This is what
   * the bare 8 the engine shipped with delivered once #86's conditions widened; it is kept here as
   * the measured point it is, so the cost of "every day" is visible rather than implied.
   */
  5: 8,
} as const;

/**
 * The two sizes' pacing, side by side, so a caller asks the size for its numbers rather than
 * branching on it.
 *
 * `perFarmDay` is the engine's knob: how often a draw of this size lands per farm day **of eligible
 * time** at `REFERENCE_WEIGHT`. Neither number is a free parameter any more — both come from
 * `PACE_TARGETS`, the small one through the measured table above and the big one through the plain
 * arithmetic its own conditions allow (3 in 30 farm days is 0.1 a day, and the big cards are
 * eligible widely enough that it lands). `gapSimMinutes` is the global start-to-start gap between
 * two draws of this size, derived from the farm-day and farm-hour constants above.
 *
 * **Why the rate and not the gap.** Both reach four days in five: the gap gets there at 28 farm
 * hours (measured by PR #99's round-2 Verifier), but a gap longer than a farm day means every seed
 * lands on exactly 24 days with exactly one thing on each — a metronome. The rate keeps the
 * unevenness: most days one, some days two, about one day in five with nothing. So the gap
 * constants above are left where they are and the rate is the lever.
 */
export const SIZE_PACING = {
  small: { perFarmDay: SMALL_RATE_FOR_DAYS_IN_FIVE[PACE_TARGETS.smallDaysInFive], gapSimMinutes: SMALL_GAP_SIM_MINUTES },
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

// RULES: every tunable in one place. The prototype's `RULES` object is read from
// packages/content/balance/farm.json (and the upgrade list it points at), so the world lane owns
// the numbers and the sim only names them. Tunables the prototype keeps as literals inside its
// code (the sheep needs weights, the NPC walk speed, ...) are not in farm.json; they live in the
// `sheep` and `npc` blocks below with a note saying so, and test/rules-parity.test.ts asserts every
// one of them against the prototype source. Times are in sim milliseconds unless the name says
// otherwise.

import farm from '../../content/balance/farm.json';
import upgrades from '../../content/farm/upgrades.json';

/** One fixed simulation step. The plan (section 2, "Time") fixes this at 100 ms. */
export const TICK_MS = 100;
/** The same step in seconds, for the per-second rates below. */
export const TICK_SEC = TICK_MS / 1000;

const b = farm.rules;
const o = farm.outsideRules;

function pair(v: readonly number[]): readonly [number, number] {
  if (v.length !== 2) throw new Error(`balance/farm.json: expected a [min, max] pair, got ${JSON.stringify(v)}`);
  return [v[0] as number, v[1] as number];
}

export const RULES = {
  flockCap: b.flockCap.value, // max sheep + lambs on the farm
  woolGrowSec: b.woolGrowSec.value, // seconds for a fleece to grow from shorn to full
  shearReadyAt: b.shearReadyAt.value, // wool level where a click shears instead of pets
  lambChancePerSec: b.lambChancePerSec.value, // per-sheep chance of a lamb each second (when settled)
  lambGrowMs: b.lambGrowMs.value, // lamb -> named sheep
  tuftRegrowPerSec: b.tuftRegrowPerSec.value, // grass regrowth
  tuftBitePerSec: b.tuftBitePerSec.value, // how fast a sheep eats a tuft
  rain: { rollEveryMs: pair(b.rain.rollEveryMs.value), chance: b.rain.chance.value, lengthMs: pair(b.rain.lengthMs.value) },
  /**
   * PARITY ONLY since #84. The prototype's `RULES.season = { realDays: 9 }`, kept here and in
   * balance/farm.json because test/rules-parity.test.ts asserts `rules` leaf for leaf against the
   * prototype's own literal and this is one of its leaves. **Nothing in the sim's behaviour reads
   * it any more**: seasons follow the real year now (`calendar` below, and src/calendar.ts). See
   * the field's own comment in balance/farm.json.
   */
  season: { realDays: b.season.realDays.value },
  speed: {
    sheepWander: b.speed.sheepWander.value,
    sheepWalk: b.speed.sheepWalk.value,
    lunaRun: b.speed.lunaRun.value,
    lunaFetchBack: b.speed.lunaFetchBack.value,
    lunaCarry: b.speed.lunaCarry.value,
  },
  rideMs: b.rideMs.value,
  rideManualMs: b.rideManualMs.value,
  farmer: { visitsAt: pair(b.farmer.visitsAt.value), shearAt: b.farmer.shearAt.value }, // clock.t fractions when he comes; shears sheep at this wool
  merchant: { everyMs: b.merchant.everyMs.value, stayMs: b.merchant.stayMs.value, woolPrice: b.merchant.woolPrice.value },
  /** The merchant auto-buys these in order: farm/upgrades.json, which balance/farm.json points at. */
  upgrades: upgrades.upgrades.map((u) => [u.id, u.cost] as const) as readonly (readonly [string, number])[],

  petTagMs: b.petTagMs.value,

  /**
   * hay2's disposition (issue #63, docs/content/FARM_BUILDS.md): the prototype's second hay bale
   * drew and changed nothing. New for #63, not in the prototype, so it lives in outsideRules
   * rather than rules (test/rules-parity.test.ts asserts `rules` against the prototype literal
   * exactly). See `hay2RegrowMult` below for where it applies.
   *
   * Fix round (2026-09-08, the owner's decision "make hay2 visible instead" on a Verifier finding
   * that the first cut's 15% bonus moved the field average about half a percent — invisible):
   * raised to a multiplier of 1 + 2.5 = 3.5x tuftRegrowPerSec while owned. Still under
   * tuftBitePerSec (0.018 * 3.5 = 0.063 < 0.07), so a grazing sheep still strips the tuft it is
   * standing on faster than it grows back — only the field's background recovery speeds up.
   *
   * Fix round 2 (2026-09-08): 3.5x turned out to (mostly) erase the other thing "growth you can
   * see" is about — a grazing sheep visibly winning the tuft it stands on. Measured over a sim-day
   * on the 40-sheep world, real grazing bouts (`eating` start to end): unowned, 45-86% of bouts
   * move the rendered grass frame (`packages/render/src/scene.ts`'s 4-frame quantisation) and
   * 27-51% strip a tuft bare; at 3.5x that fell to 0-16% frame-moved and 0% ever stripped — the
   * bare frame never drew. Lowered to a multiplier of 1 + 1.9 = 2.9x, the largest value at which
   * at least half the unowned frame-moving rate survives (46-51% vs the 39-43% half-line) and
   * tufts still strip sometimes (5-7%), while still clearing the +10pp field-average target with
   * margin (+13.2 to +17.4pp on the 40-sheep world; +2.1 to +3.3pp on the default 5-sheep flock).
   * Still comfortably under tuftBitePerSec (0.018 * 2.9 = 0.0522 < 0.07). See
   * docs/content/FARM_BUILDS.md and test/ledger.test.ts's grazing-visibility test for the numbers.
   */
  hay2: { tuftRegrowBonusFrac: o.hay2.tuftRegrowBonusFrac.value },

  /** The prototype's clock: `{ t: .18, period: 180 }` and the `phaseOf` boundaries. One sim-day is 180 sim-seconds. */
  clock: { startT: o.clock.startT.value, periodSec: o.clock.periodSec.value, phases: o.clock.phases.value },
  /** SEASON_TEMP and SEASON_ODDS from the prototype. The season order is `SEASONS` in calendar.ts. */
  seasons: { temp: o.seasons.temp.value, odds: o.seasons.odds.value },
  /**
   * The real-year season calendar (#83's data, #84's reader): where each season starts in the real
   * calendar before drift, and how far a world's seed may move that start. `nominalRealDays` and
   * `lengthDriftRealDays` in the data are documentation of a derived spread and are deliberately
   * **not** lifted here — a season's length is the gap to the next season's start and is never
   * sampled. See src/calendar.ts.
   */
  calendar: {
    anchors: o.seasons.calendar.anchors.value,
    startOffsetDriftRealDays: pair(o.seasons.calendar.startOffsetDriftRealDays.value),
  },
  /** Sheep on the field at reset. Grown lambs take names from this index on. */
  flock: { initial: o.flock.initial.value },

  /**
   * The prototype relaxes temperature by `temp = temp * .98 + target * .02` once per rendered
   * frame, so its speed depended on the frame rate (about 60 Hz). This is the same relaxation
   * expressed per 100 ms tick, assuming that 60 Hz: 1 - 0.98 ^ (TICK_MS / 16.67).
   */
  tempBlendPerTick: 1 - Math.pow(0.98, TICK_MS / (1000 / 60)),
  /** The prototype's first merchant visit: 45 s after reset. */
  merchantFirstAtMs: o.merchant.firstVisitMs.value,
  /**
   * The prototype moved actors once per rendered frame (about 60 Hz), and its arrival test
   * (`d < 1.2` px) assumed steps of that size: at 80 px/s a frame moves 0.47 px, a 100 ms tick
   * moves 2.8 px and would hop back and forth over the target forever. Movement therefore runs in
   * this many substeps per tick, each one a prototype frame.
   */
  moveSubsteps: 6,

  /**
   * Sheep needs, from the literals inside the prototype's sheep block. NOT in balance/farm.json:
   * the prototype keeps them in code, not in RULES. Copied exactly; the world lane may lift them
   * into farm.json later (propose on the issue, then read them from there).
   */
  sheep: {
    /** Chance per second that a settled sheep picks a new need. */
    needRollPerSec: 0.14,
    /** A tuft counts as "tall" for grazing at or above this level. */
    tuftMinLevel: 0.45,
    /** The one-roll pick, in the prototype's order: r < .5 graze, < .62 hay, < .72 drink, < .8 rest, else wander. */
    pick: { graze: 0.5, hay: 0.12, drink: 0.1, rest: 0.08, wander: 0.2 },
    /** Inside the rest band a second roll of `dt * restRollPerSec` decides between lying down and wandering. */
    restRollPerSec: 2,
    /** Chance per second a resting sheep gets up by day. */
    wakePerSec: 0.4,
    /** Chance per second an eating sheep stops on its own. */
    stopEatingPerSec: 0.05,
    /** A grazed tuft below this level is abandoned. */
    tuftEmptyAt: 0.08,
    /** Wool level of a sheep that was just shorn, and of a lamb that just grew up. */
    shornWool: 0.05,
    /** Lamb follow: `l.x += (px - l.x) * followRate * dt`. */
    lambFollowRate: 3,
  },

  /**
   * NPC numbers from the prototype's `npcStep`, `summonFarmer`, `summonMerchant`, and `tickNPCs`.
   * NOT in balance/farm.json. packages/content/farm/npcs.json carries a copy of the same numbers
   * (walkSpeed, jobDurationMs, boundary, per-job ms); the sim reads them from here until the
   * content package exports them.
   */
  npc: {
    /** px/s for every NPC. */
    walkSpeed: 26,
    /** Time spent on a job that sets no duration of its own. */
    jobMs: 2600,
    /** Measured at foot x: inside once below this after an `enter`, outside once above this after a `leave`. */
    insideBelowX: 540,
    outsideAboveX: 520,
    /** The farmer's shear: the shears bubble and the pending-shear delay, then the tag. */
    shearDelayMs: 1200,
    shearTagMs: 1500,
    troughHeartMs: 800,
    patHeartMs: 1600,
    coinBubbleMs: 2500,
  },
} as const;

export type Rules = typeof RULES;

/**
 * hay2's Ledger effect (issue #63): while owned, tuft regrow is eased up by `hay2.tuftRegrowBonusFrac`.
 * One function so `tick.ts` (actor resolution) and `ledger/advance.ts` (offline catch-up) apply the
 * same number the same way; test/ledger.test.ts pins both against each other.
 *
 * Always >= 1, so this only ever adds to the regrow rate, never subtracts from it: in the Ledger,
 * where the bite term never reads the current grass level (it is a function of the flock size,
 * the span, and the weather only, not of `L.grass`), that one fact is enough to prove a tuft owning
 * hay2 never ends a step below where the same tuft, unowned, would have — test/ledger.test.ts's
 * "never regrows the field less than an unowned one" case walks that proof with real numbers.
 */
export function hay2RegrowMult(owned: readonly string[]): number {
  return owned.includes('hay2') ? 1 + RULES.hay2.tuftRegrowBonusFrac : 1;
}

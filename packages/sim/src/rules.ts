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
  season: { realDays: b.season.realDays.value }, // one in-world season lasts ~9 real days (10% of a real season)
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

  /** The prototype's clock: `{ t: .18, period: 180 }` and the `phaseOf` boundaries. One sim-day is 180 sim-seconds. */
  clock: { startT: o.clock.startT.value, periodSec: o.clock.periodSec.value, phases: o.clock.phases.value },
  /** SEASON_TEMP and SEASON_ODDS from the prototype. The season order is `SEASONS` in clock.ts. */
  seasons: { temp: o.seasons.temp.value, odds: o.seasons.odds.value },
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

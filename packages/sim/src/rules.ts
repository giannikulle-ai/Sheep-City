// RULES: every tunable in one place, ported from prototype/luna-farm/src/sim_template.html.
// Change numbers here, not in the code. Times are in sim milliseconds unless the name says otherwise.

/** One fixed simulation step. The plan (section 2, "Time") fixes this at 100 ms. */
export const TICK_MS = 100;
/** The same step in seconds, for the per-second rates below. */
export const TICK_SEC = TICK_MS / 1000;

export const RULES = {
  flockCap: 9, // max sheep + lambs on the farm
  woolGrowSec: 150, // seconds for a fleece to grow from shorn to full
  shearReadyAt: 0.8, // wool level where a click shears instead of pets
  lambChancePerSec: 0.002, // per-sheep chance of a lamb each second (when settled)
  lambGrowMs: 90000, // lamb -> named sheep
  tuftRegrowPerSec: 0.018, // grass regrowth
  tuftBitePerSec: 0.07, // how fast a sheep eats a tuft
  rain: { rollEveryMs: [60000, 180000] as const, chance: 0.35, lengthMs: [20000, 45000] as const },
  season: { realDays: 9 }, // one in-world season lasts ~9 real days (10% of a real season)
  speed: { sheepWander: 9, sheepWalk: 16, lunaRun: 80, lunaFetchBack: 45, lunaCarry: 34 },
  rideMs: 6000,
  rideManualMs: 8000,
  farmer: { visitsAt: [0.06, 0.38] as const, shearAt: 0.6 }, // clock.t fractions when he comes; shears sheep at this wool
  merchant: { everyMs: 240000, stayMs: 30000, woolPrice: 3 },
  upgrades: [
    ['flowerbed', 12],
    ['hay2', 30],
    ['scarecrow', 60],
  ] as const, // auto-bought in order

  petTagMs: 1800,

  /** The prototype's clock: `{ t: .18, period: 180 }`. One sim-day is 180 sim-seconds. */
  clock: { startT: 0.18, periodSec: 180 },

  /**
   * The prototype relaxes temperature by `temp = temp * .98 + target * .02` once per rendered
   * frame, so its speed depended on the frame rate (about 60 Hz). This is the same relaxation
   * expressed per 100 ms tick, assuming that 60 Hz: 1 - 0.98 ^ (TICK_MS / 16.67).
   */
  tempBlendPerTick: 1 - Math.pow(0.98, TICK_MS / (1000 / 60)),
  /** The prototype's first merchant visit: 45 s after reset. */
  merchantFirstAtMs: 45000,
} as const;

export type Rules = typeof RULES;

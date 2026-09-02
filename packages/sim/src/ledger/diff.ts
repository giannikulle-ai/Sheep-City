// What changed between two ledgers, in the terms the client's "while you were gone" line and the
// storybook speak: births, deaths, wool, coins, weather, upgrades. Computed from the two ledgers
// alone, so it works across the actor path as well as the ledger path.

import { currentSeason, type SeasonName } from '../clock';
import type { WeatherKind } from '../weather';
import { ledgerFlock, meanOf, type Ledger } from './ledger';

export interface LedgerChange<T> {
  from: T;
  to: T;
  changed: boolean;
}

export interface LedgerDiff {
  before: Ledger;
  after: Ledger;
  /** Sim milliseconds between the two. */
  simMs: number;
  /** Days the clock wrapped between the two. */
  days: number;
  /** Grown sheep now minus then. Sheep only ever arrive by growing up, so this is also `grownUp`. */
  sheep: number;
  /** Lambs now minus then. */
  lambs: number;
  /** Lambs born: the flock's growth. */
  births: number;
  /** Nobody dies by default (plan, section 3), so this is 0 unless a hand-edited state lost sheep. */
  deaths: number;
  /** Lambs that became named sheep. */
  grownUp: number;
  /** Wool in the bank now minus then. Negative after a merchant visit sold it. */
  wool: number;
  /** Coins now minus then. Negative after the merchant's coins bought an upgrade. */
  coins: number;
  /** Upgrades owned now that were not then, in purchase order. */
  upgrades: string[];
  weather: LedgerChange<WeatherKind>;
  season: LedgerChange<SeasonName>;
  /** Mean grass level now minus then. */
  grass: number;
  /** Mean fleece on the flock now minus then. */
  fleece: number;
  /** Digital Luna's mood now minus then. */
  mood: number;
}

function change<T>(from: T, to: T): LedgerChange<T> {
  return { from, to, changed: from !== to };
}

export function diffLedger(before: Ledger, after: Ledger): LedgerDiff {
  const flockBefore = ledgerFlock(before);
  const flockAfter = ledgerFlock(after);
  return {
    before,
    after,
    simMs: after.clock.nowMs - before.clock.nowMs,
    days: after.clock.dayCount - before.clock.dayCount,
    sheep: after.wool.length - before.wool.length,
    lambs: after.lambs.length - before.lambs.length,
    births: Math.max(0, flockAfter - flockBefore),
    deaths: Math.max(0, flockBefore - flockAfter),
    grownUp: Math.max(0, after.wool.length - before.wool.length),
    wool: after.banks.wool - before.banks.wool,
    coins: after.banks.coins - before.banks.coins,
    upgrades: after.banks.owned.filter((u) => !before.banks.owned.includes(u)),
    weather: change(before.weather.kind, after.weather.kind),
    season: change(currentSeason(before.season), currentSeason(after.season)),
    grass: meanOf(after.grass) - meanOf(before.grass),
    fleece: meanOf(after.wool) - meanOf(before.wool),
    mood: after.mood - before.mood,
  };
}

// Turns one `LedgerDiff` (ledger/diff.ts) into chronicle entries: the Ledger's own account of what
// moved while nobody was watching the actors. One entry per kind of change that actually happened,
// with the mover's own number in `facts` so the trailing normal (chronicle/notability.ts) can judge
// it — the plan's example is wool: fourteen banked reads as routine most weeks and as a story the
// week it usually runs forty. Read by the catch-up policy (ledger/catch-up.ts), the only place in
// this build a `LedgerDiff` is computed against a state that can `tell`.

import type { LedgerDiff } from '../ledger/diff';
import type { SimState } from '../state';
import { tell } from './store';
import { FARM_DISTRICT, type ChronicleEntry } from './types';

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * `tell` one entry per number `diff` moved: births, deaths, grown-up lambs, wool banked, coins
 * (earned or spent), the weather turning, the season turning, and each upgrade bought — the eight
 * kinds of change `diffLedger` computes. A number that did not move gets no entry: a quiet week is
 * a quiet week, not a chronicle full of zeros. `atMs` is `diff.after`'s clock, the moment the gap
 * ends. Returns the entries `tell` created, in the order above.
 */
export function tellLedgerDiff(state: Pick<SimState, 'chronicle'>, diff: LedgerDiff, district: string = FARM_DISTRICT): ChronicleEntry[] {
  const atMs = diff.after.clock.nowMs;
  const out: ChronicleEntry[] = [];
  const say = (line: string, picture: string, facts: Record<string, number | string>): void => {
    out.push(tell(state, { atMs, district, line, picture, source: 'ledger', facts }));
  };

  if (diff.births > 0) say(`${plural(diff.births, 'lamb')} born`, 'lamb', { births: diff.births });
  if (diff.deaths > 0) say(`${plural(diff.deaths, 'sheep')} died`, 'grave', { deaths: diff.deaths });
  if (diff.grownUp > 0) say(`${plural(diff.grownUp, 'lamb')} grew up`, 'grown-lamb', { grownUp: diff.grownUp });
  if (diff.wool > 0) say(`${plural(diff.wool, 'wool')} banked`, 'wool', { wool: diff.wool });
  if (diff.coins > 0) say(`${diff.coins} coins earned`, 'coins', { coins: diff.coins });
  else if (diff.coins < 0) say(`${-diff.coins} coins spent`, 'coins', { coins: diff.coins });
  if (diff.weather.changed) say(`the weather turned ${diff.weather.to}`, `weather-${diff.weather.to}`, { weather: diff.weather.to });
  if (diff.season.changed) say(`the season turned ${diff.season.to}`, `season-${diff.season.to}`, { season: diff.season.to });
  for (const upgrade of diff.upgrades) say(`the farm bought the ${upgrade}`, 'upgrade', { upgrade });

  return out;
}

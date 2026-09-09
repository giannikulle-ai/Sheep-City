// v9 -> v10: the farm's three builds are on Luna Farm from the start; nothing buys them (#126,
// plan decision 19, 2026-09-09 22:50 UTC). The owner, asked whether the flowerbed, hay2, and the
// scarecrow should keep buying themselves from the settlement's purse or wait for the owner's
// hand: "Just leave them on Luna farm. Like keep them there from start." So: every world owns all
// three from its first day now (`FARM_BUILDS`, state.ts); nothing buys them, on the farm or from
// the settlement; `buyUpgrades` is retired.
//
// What an older document gets: any of the three it does not already own, appended after whatever
// it already has, in `FARM_BUILDS`' own order — so a save that had bought `flowerbed` by hand
// keeps it first and only gains `hay2` and `scarecrow`. The Ledger snapshot's own `banks.owned`
// gets the same fill, independently (it can differ from the world's, e.g. the fixture's v9
// document, whose world had bought `flowerbed` but whose snapshot — older than the world around
// it — never had). Nothing already owned moves, reorders, or duplicates.
//
// It never throws: a document with no world, or a world with no banks, is `validateWorld`'s to
// refuse with a real message, not this file's to blow up on.

import { FARM_BUILDS } from '../../state';
import type { Migration } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every farm build not already in `owned`, appended in `FARM_BUILDS`' own order. */
function fillOwned(owned: unknown): string[] {
  const existing = Array.isArray(owned) ? (owned as string[]) : [];
  const missing = FARM_BUILDS.filter((id) => !existing.includes(id));
  return [...existing, ...missing];
}

export const v10FarmBuilds: Migration = {
  from: 9,
  title: 'v9 to v10: every world owns the flowerbed, hay2, and the scarecrow from the start',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 10 };
    const next: Record<string, unknown> = { ...world };
    const banks = world['banks'];
    if (isRecord(banks)) next['banks'] = { ...banks, owned: fillOwned(banks['owned']) };
    const ledger = world['ledger'];
    if (isRecord(ledger)) {
      const ledgerBanks = ledger['banks'];
      if (isRecord(ledgerBanks)) next['ledger'] = { ...ledger, banks: { ...ledgerBanks, owned: fillOwned(ledgerBanks['owned']) } };
    }
    return { ...doc, version: 10, world: next };
  },
};

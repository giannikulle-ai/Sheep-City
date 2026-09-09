// v8 -> v9: the settlement's coin stand-in (#86, plan decision 12: "the economy is not the farm's").
//
// Wool used to be sold on the farm — the merchant walked up, bought the bank, and the coins landed
// in `banks.coins`. It is sold at the settlement's market now, carried out by the farmer's dawn
// walk, and the money lands in a new field the farm's ledger does not own: `settlement`, one
// number, on the world and on the Ledger snapshot the world carries (`world.ledger`).
//
// **What a v8 world gets: zero.** Unlike the calendar (v8), there is nothing in an older document
// to recover this number from and nothing to guess at. The coins a v8 world earned were the farm's,
// they are still sitting in `banks.coins` after this migration, and they stay there: they were
// earned under the old rule and moving them into the settlement's purse would rewrite the owner's
// own history to make the new rule look retrospective. So the settlement starts at nothing and
// fills from the world's next dawn — the first market walk after the load — while `banks.coins`
// keeps whatever it held, untouched, for the owner's own build table (plan section 3).
//
// The practical consequence, stated rather than hidden: a loaded v8 world stops buying farm builds
// until the settlement has earned enough for the next one, because `buyUpgrades` reads the
// settlement's purse now (npcs.ts). Nothing already owned is lost — `banks.owned` is untouched.
//
// **It never throws.** Every field is read defensively; a document with no world, or a world with
// no ledger, is `validateWorld`'s to refuse with a real message, not this file's to blow up on. A
// `settlement` a document somehow already carries is kept as it is.

import type { Migration } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The settlement a v8 world gets: no coins. See the header for why it is not read off `banks`. */
export function v9SettlementDefault(): { coins: number } {
  return { coins: 0 };
}

export const v9Settlement: Migration = {
  from: 8,
  title: 'v8 to v9: give the world (and its Ledger snapshot) an empty settlement purse',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 9 };
    const next: Record<string, unknown> = { ...world };
    if (next['settlement'] === undefined) next['settlement'] = v9SettlementDefault();
    const ledger = world['ledger'];
    if (isRecord(ledger) && ledger['settlement'] === undefined) next['ledger'] = { ...ledger, settlement: v9SettlementDefault() };
    return { ...doc, version: 9, world: next };
  },
};

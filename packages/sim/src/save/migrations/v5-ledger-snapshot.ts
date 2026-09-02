// v4 -> v5: the Ledger ticket (#39) gave the state a snapshot of the district's numbers, `ledger`,
// and the sim time it was taken, `lastLedgerAt`. A v4 world has the numbers in it already, so the
// snapshot is read off the world as it is (`summarise`), taken now; a world too broken to read is
// left without one for `validateWorld` to refuse with a real message. Fields already present are
// kept as is.

import { summarise } from '../../ledger/ledger';
import type { SimState } from '../../state';
import type { Migration } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Enough of a v4 world for `summarise` to read: the containers it walks, in the shapes it expects. */
function readable(world: Record<string, unknown>): world is Record<string, unknown> & SimState {
  const clock = world['clock'];
  const npcs = world['npcs'];
  const banks = world['banks'];
  return (
    isRecord(clock) &&
    typeof clock['nowMs'] === 'number' &&
    isRecord(world['season']) &&
    isRecord(world['weather']) &&
    Array.isArray(world['tufts']) &&
    world['tufts'].every(isRecord) &&
    Array.isArray(world['sheep']) &&
    world['sheep'].every((q) => isRecord(q) && Array.isArray(q['lambs']) && q['lambs'].every(isRecord)) &&
    isRecord(npcs) &&
    (npcs['merchant'] === null || (isRecord(npcs['merchant']) && Array.isArray(npcs['merchant']['plan']))) &&
    isRecord(banks) &&
    Array.isArray(banks['owned'])
  );
}

/** The snapshot a v4 world gets: its own numbers, read now. Null when the world cannot be read. */
export function v5LedgerDefault(world: Record<string, unknown>): Record<string, unknown> | null {
  if (!readable(world)) return null;
  return summarise(world) as unknown as Record<string, unknown>;
}

export const v5LedgerSnapshot: Migration = {
  from: 4,
  title: 'v4 to v5: take the ledger snapshot off the world and stamp lastLedgerAt with its clock',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 5 };
    const next: Record<string, unknown> = { ...world };
    if (next['ledger'] === undefined) {
      const ledger = v5LedgerDefault(world);
      if (ledger) next['ledger'] = ledger;
    }
    if (next['lastLedgerAt'] === undefined) {
      const clock = world['clock'];
      next['lastLedgerAt'] = isRecord(clock) && typeof clock['nowMs'] === 'number' ? clock['nowMs'] : 0;
    }
    return { ...doc, version: 5, world: next };
  },
};

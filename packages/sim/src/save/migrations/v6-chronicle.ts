// v5 -> v6: the chronicle ticket (#60) gave the world an append-only log, `chronicle` (the whole
// world's log; see chronicle/store.ts), that any system writes to through `tell`. A v5 world never
// kept one, so there is no history to recover it from: it gets a fresh, empty chronicle, the same
// one `createChronicle` gives a brand new world. A field already present is kept as is.

import { createChronicle } from '../../chronicle/store';
import type { Migration } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const v6Chronicle: Migration = {
  from: 5,
  title: 'v5 to v6: fill chronicle on the world with a fresh, empty log',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 6 };
    const next: Record<string, unknown> = { ...world };
    if (next['chronicle'] === undefined) next['chronicle'] = createChronicle();
    return { ...doc, version: 6, world: next };
  },
};

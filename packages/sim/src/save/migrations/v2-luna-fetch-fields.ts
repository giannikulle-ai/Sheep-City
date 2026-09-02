// v1 -> v2: the behaviour registry (#5 part a) gave Digital Luna five fields a v1 save never
// carried: the stick she is fetching, the bedtime circling timer, the last door re-face time, the
// name-tag timer, and the trundle timer. A v1 world is one where none of that was happening, so
// each missing field takes the value `createInitialState` gives a fresh DL. A field that is
// already present (a dev build that wrote it before the bump) is kept as is.

import type { Migration } from './index';

/** What a fresh `createInitialState` DL holds for each of the five fields, in state order. */
export const V2_LUNA_DEFAULTS = {
  stick: null,
  circleUntilMs: null,
  dirAtMs: 0,
  tagUntilMs: 0,
  forceBoundUntilMs: 0,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const v2LunaFetchFields: Migration = {
  from: 1,
  title: 'v1 to v2: fill the five behaviour-chain fields on world.luna with their fresh-state defaults',
  up(doc) {
    const world = doc['world'];
    // A document with no world or no luna is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world) || !isRecord(world['luna'])) return { ...doc, version: 2 };
    const luna: Record<string, unknown> = { ...world['luna'] };
    for (const [key, value] of Object.entries(V2_LUNA_DEFAULTS)) {
      if (luna[key] === undefined) luna[key] = value;
    }
    return { ...doc, version: 2, world: { ...world, luna } };
  },
};

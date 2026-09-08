// v6 -> v7: the event engine (#40) gave the world its own slice of state, `events` (what is
// running, what is on cooldown, the flags and visibility its hooks write, and the engine's own
// generator; see engine/events.ts). A v6 world never had one and carries no history of what it
// would have contained, so it gets a fresh one, seeded from the world's own seed and stamped with
// the world's own clock — the same `createEvents` a new world gets, so a loaded old save and a new
// world of the same seed draw the same events from the same point.
//
// The other half of v7, the optional `lost` flag on a `Lamb`, needs no filling: absent is exactly
// what it means for every lamb that has never been walked off by the `lostLamb` card.

import { createEvents } from '../../engine/events';
import type { Migration } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The `events` a v6 world gets: a fresh engine, on the world's seed, at the world's clock. */
export function v7EventsDefault(world: Record<string, unknown>): Record<string, unknown> {
  const seed = typeof world['seed'] === 'number' ? world['seed'] : 0;
  const clock = world['clock'];
  const nowMs = isRecord(clock) && typeof clock['nowMs'] === 'number' ? clock['nowMs'] : 0;
  return createEvents(seed, nowMs) as unknown as Record<string, unknown>;
}

export const v7Events: Migration = {
  from: 6,
  title: 'v6 to v7: fill events on the world with a fresh engine on the world’s own seed and clock',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 7 };
    const next: Record<string, unknown> = { ...world };
    if (next['events'] === undefined) next['events'] = v7EventsDefault(world);
    return { ...doc, version: 7, world: next };
  },
};

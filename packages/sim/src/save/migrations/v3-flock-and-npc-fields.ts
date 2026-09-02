// v2 -> v3: the sheep and NPC port (#5 part b) gave the state one field a v2 save never carried,
// `nameIdx` (the next name for a lamb that grows up), and gave each NPC eight: the way point, the
// inside/outside flag, the farmer's entering flag, the current job, the sheep being sheared, the
// merchant's cart, and the icon bubble with its timer. A v2 world had no lamb promotion and no NPC
// logic, so the missing fields take fresh-state values: `nameIdx` is the flock size, as
// `createInitialState` sets it, and an NPC gets what `makeNpc` gives a fresh one of its kind. A
// field already present is kept as is.

import type { Migration } from './index';

/** The eight NPC fields that `makeNpc` fills at spawn, by kind, in state order. */
export function v3NpcDefaults(kind: unknown): Record<string, unknown> {
  return {
    wp: null,
    outside: true,
    entering: kind === 'farmer',
    job: null,
    shearing: null,
    cart: kind === 'merchant',
    icon: null,
    iconUntilMs: 0,
  };
}

/** What `createInitialState` gives `nameIdx`: one past the last sheep, so grown lambs get fresh ids. */
export function v3NameIdxDefault(world: Record<string, unknown>): number {
  const sheep = world['sheep'];
  return Array.isArray(sheep) ? sheep.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fillNpc(npc: unknown): unknown {
  if (!isRecord(npc)) return npc;
  const out: Record<string, unknown> = { ...npc };
  for (const [key, value] of Object.entries(v3NpcDefaults(npc['kind']))) {
    if (out[key] === undefined) out[key] = value;
  }
  return out;
}

export const v3FlockAndNpcFields: Migration = {
  from: 2,
  title: 'v2 to v3: fill nameIdx on the world and the eight job-plan fields on each NPC with their fresh-state defaults',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 3 };
    const next: Record<string, unknown> = { ...world };
    if (next['nameIdx'] === undefined) next['nameIdx'] = v3NameIdxDefault(world);
    const npcs = world['npcs'];
    if (isRecord(npcs)) {
      next['npcs'] = { ...npcs, farmer: fillNpc(npcs['farmer']), merchant: fillNpc(npcs['merchant']) };
    }
    return { ...doc, version: 3, world: next };
  },
};

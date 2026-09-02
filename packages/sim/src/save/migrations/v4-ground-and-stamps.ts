// v3 -> v4: the small-life ticket (#33) gave the world the ground stamps a v3 save never carried,
// `ground` (the snow footprints, the mud patches, and whether the last tick was snowy), and gave
// each sheep and Digital Luna the two fields `stampGround` keeps per walker: where the last stamp
// landed and which side the next print goes on. A v3 world had no stamps, so the missing fields
// take fresh-state values: an empty ground and a walker that has never stamped. A field already
// present is kept as is.

import type { Migration } from './index';

/** What `createInitialState` gives `ground`: nothing on it yet. A fresh object per call, so no two worlds share an array. */
export function v4GroundDefault(): Record<string, unknown> {
  return { prints: [], mud: [], wasSnowy: false };
}

/** The two per-walker stamp fields `makeSheep` and `makeLuna` fill, in state order. */
export const V4_STAMP_DEFAULTS = {
  lastStamp: null,
  stampSide: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fillStamper(walker: unknown): unknown {
  if (!isRecord(walker)) return walker;
  const out: Record<string, unknown> = { ...walker };
  for (const [key, value] of Object.entries(V4_STAMP_DEFAULTS)) {
    if (out[key] === undefined) out[key] = value;
  }
  return out;
}

export const v4GroundAndStamps: Migration = {
  from: 3,
  title: 'v3 to v4: fill ground on the world and the two stamp fields on each sheep and on luna with their fresh-state defaults',
  up(doc) {
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 4 };
    const next: Record<string, unknown> = { ...world };
    if (next['ground'] === undefined) next['ground'] = v4GroundDefault();
    if (Array.isArray(world['sheep'])) next['sheep'] = world['sheep'].map(fillStamper);
    if (isRecord(world['luna'])) next['luna'] = fillStamper(world['luna']);
    return { ...doc, version: 4, world: next };
  },
};

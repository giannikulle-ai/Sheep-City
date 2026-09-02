import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashValue } from '../src/hash';
import { SAVE_FORMAT, SaveError, type UnknownSaveDoc } from '../src/save/doc';
import { assertMigrationChain, MIGRATIONS, migrateSave, readVersion, type Migration } from '../src/save/migrations/index';
import { V2_LUNA_DEFAULTS, v2LunaFetchFields } from '../src/save/migrations/v2-luna-fetch-fields';
import { v3FlockAndNpcFields, v3NameIdxDefault, v3NpcDefaults } from '../src/save/migrations/v3-flock-and-npc-fields';
import { V4_STAMP_DEFAULTS, v4GroundAndStamps, v4GroundDefault } from '../src/save/migrations/v4-ground-and-stamps';
import { applyIntent } from '../src/intents';
import { makeNpc } from '../src/npcs';
import { createRng } from '../src/rng';
import { fromSave, toSave } from '../src/save/serialize';
import { cloneState, createInitialState, makeLuna, makeSheep, SAVE_VERSION, type Npc } from '../src/state';
import { advance } from '../src/tick';

const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8'));

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveError) return error.code;
    throw error;
  }
  throw new Error('expected a SaveError');
}

describe('migration chain', () => {
  it('is ordered, contiguous, and ends at SAVE_VERSION', () => {
    expect(() => assertMigrationChain(MIGRATIONS)).not.toThrow();
    expect(MIGRATIONS.map((m) => m.from)).toEqual(Array.from({ length: SAVE_VERSION }, (_, i) => i));
    for (const m of MIGRATIONS) expect(m.title).toMatch(/\S/);
  });

  it('refuses a list with a gap, a duplicate, or the wrong length', () => {
    const m0: Migration = { from: 0, title: 'zero', up: (d) => ({ ...d, version: 1 }) };
    const m2: Migration = { from: 2, title: 'two', up: (d) => ({ ...d, version: 3 }) };
    expect(code(() => assertMigrationChain([m0, m2], 2))).toBe('missing-migration');
    expect(code(() => assertMigrationChain([m0, m0], 2))).toBe('missing-migration');
    expect(code(() => assertMigrationChain([m0], 2))).toBe('missing-migration');
    expect(code(() => migrateSave({ version: 0 }, [m0, m2], 3))).toBe('missing-migration');
  });

  it('reads the version off a document and rejects anything else', () => {
    expect(readVersion({ version: 0 })).toBe(0);
    expect(readVersion({ version: 3, x: 1 })).toBe(3);
    expect(code(() => readVersion(null))).toBe('not-a-save');
    expect(code(() => readVersion('{}'))).toBe('not-a-save');
    expect(code(() => readVersion([]))).toBe('not-a-save');
    expect(code(() => readVersion({}))).toBe('bad-version');
    expect(code(() => readVersion({ version: '1' }))).toBe('bad-version');
    expect(code(() => readVersion({ version: 1.5 }))).toBe('bad-version');
    expect(code(() => readVersion({ version: -1 }))).toBe('bad-version');
  });

  it('refuses a document from a newer build', () => {
    expect(code(() => migrateSave({ version: SAVE_VERSION + 1 }))).toBe('newer-than-supported');
    expect(code(() => fromSave({ format: SAVE_FORMAT, version: 99, world: {} }))).toBe('newer-than-supported');
  });

  it('returns a current document unchanged', () => {
    const doc = toSave(createInitialState(3));
    expect(migrateSave(doc)).toBe(doc);
  });

  it('catches a migration that writes the wrong version', () => {
    const broken: Migration = { from: 0, title: 'broken', up: (d) => ({ ...d, version: 5 }) };
    expect(code(() => migrateSave({ version: 0 }, [broken], 1))).toBe('bad-migration');
  });

  it('runs a chain of several steps in order, leaving the input untouched', () => {
    const chain: Migration[] = [0, 1, 2].map((from) => ({
      from,
      title: `step ${from}`,
      up: (d) => ({ ...d, version: from + 1, trail: [...(d['trail'] as number[]), from] }),
    }));
    const input: UnknownSaveDoc = { version: 0, trail: [] };
    const before = hashValue(input);
    const out = migrateSave(input, chain, 3);
    expect(out).toEqual({ version: 3, trail: [0, 1, 2] });
    expect(hashValue(input)).toBe(before);
    expect(migrateSave({ version: 2, trail: ['x'] }, chain, 3)).toEqual({ version: 3, trail: ['x', 2] });
  });
});

describe('v0 to v1', () => {
  it('wraps the bare state in the envelope and matches the committed v1 fixture exactly', () => {
    const v0 = fixture('save-v0.json') as UnknownSaveDoc;
    const v1 = fixture('save-v1.json');
    expect(v0.version).toBe(0);
    expect(v0).not.toHaveProperty('world');
    const before = hashValue(v0);
    const migrated = migrateSave(v0, MIGRATIONS.slice(0, 1), 1);
    expect(migrated).toEqual(v1);
    expect(hashValue(migrated)).toBe(hashValue(v1));
    expect(hashValue(v0)).toBe(before);
  });

  it('a v0 save built from a fresh state loads to the same state', () => {
    const state = createInitialState(11);
    const v0 = { ...state, version: 0 };
    const loaded = fromSave(v0);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(hashValue({ ...loaded, version: 0 })).toBe(hashValue(v0));
  });
});

describe('v1 to v2', () => {
  type Doc = { version: number; world: { luna: Record<string, unknown> } & Record<string, unknown> };

  it('fills the five behaviour-chain fields on luna with fresh-state defaults and touches nothing else', () => {
    const v1 = fixture('save-v1.json') as Doc;
    expect(v1.version).toBe(1);
    for (const key of Object.keys(V2_LUNA_DEFAULTS)) expect(v1.world.luna).not.toHaveProperty(key);
    const before = hashValue(v1);
    const migrated = migrateSave(v1, MIGRATIONS.slice(0, 2), 2) as unknown as Doc;
    expect(migrated.version).toBe(2);
    expect(hashValue(v1)).toBe(before);
    const { luna, ...rest } = v1.world;
    const { luna: lunaAfter, ...restAfter } = migrated.world;
    expect(restAfter).toEqual(rest);
    expect(lunaAfter).toEqual({ ...luna, ...V2_LUNA_DEFAULTS });
    // The defaults are the ones a fresh state holds.
    const fresh = createInitialState(1).luna;
    for (const [key, value] of Object.entries(V2_LUNA_DEFAULTS)) expect(fresh[key as keyof typeof fresh]).toBe(value);
  });

  it('keeps a field that is already present', () => {
    const v1 = fixture('save-v1.json') as Doc;
    const withTag = { ...v1, world: { ...v1.world, luna: { ...v1.world.luna, tagUntilMs: 1234 } } };
    const migrated = v2LunaFetchFields.up(withTag) as unknown as Doc;
    expect(migrated.world.luna['tagUntilMs']).toBe(1234);
    expect(migrated.world.luna['stick']).toBeNull();
  });

  it('bumps the version and leaves a malformed world for validation to refuse', () => {
    expect(v2LunaFetchFields.up({ version: 1, world: 'nope' })).toEqual({ version: 1 + 1, world: 'nope' });
    expect(v2LunaFetchFields.up({ version: 1, world: { luna: null } })).toEqual({ version: 2, world: { luna: null } });
    expect(code(() => fromSave({ format: SAVE_FORMAT, version: 1, world: { luna: null } }))).toBe('invalid-world');
  });

  it('a v0 save walks the whole chain to the current version', () => {
    const v0 = fixture('save-v0.json') as UnknownSaveDoc;
    const current = migrateSave(v0) as unknown as Doc;
    expect(current.version).toBe(SAVE_VERSION);
    expect(current.world.luna).toMatchObject(V2_LUNA_DEFAULTS);
    expect(current.world['nameIdx']).toBe(5);
    expect(current.world['ground']).toEqual(v4GroundDefault());
    const loaded = fromSave(v0);
    expect(loaded.luna.stick).toBeNull();
    expect(loaded.luna.forceBoundUntilMs).toBe(0);
    expect(loaded.nameIdx).toBe(5);
    expect(loaded.npcs.farmer).toMatchObject(v3NpcDefaults('farmer'));
    expect(loaded.ground).toEqual({ prints: [], mud: [], wasSnowy: false });
    expect(loaded.luna).toMatchObject(V4_STAMP_DEFAULTS);
  });
});

describe('v2 to v3', () => {
  type Doc = { version: number; world: { npcs: { farmer: Record<string, unknown> | null; merchant: Record<string, unknown> | null } } & Record<string, unknown> };
  const NPC_KEYS = Object.keys(v3NpcDefaults('farmer'));

  it('the defaults are what a fresh state and a fresh NPC hold', () => {
    const fresh = createInitialState(1);
    expect(v3NameIdxDefault(fresh as unknown as Record<string, unknown>)).toBe(fresh.nameIdx);
    expect(v3NameIdxDefault(createInitialState(1, { sheep: 9 }) as unknown as Record<string, unknown>)).toBe(9);
    for (const kind of ['farmer', 'merchant'] as const) {
      const npc = makeNpc(kind, []) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(v3NpcDefaults(kind))) expect(npc[key], `${kind}.${key}`).toEqual(value);
    }
  });

  it('fills nameIdx and the eight NPC fields with fresh-state defaults and touches nothing else', () => {
    const v2 = fixture('save-v2.json') as Doc;
    expect(v2.version).toBe(2);
    expect(v2.world).not.toHaveProperty('nameIdx');
    const farmer = v2.world.npcs.farmer!;
    for (const key of NPC_KEYS) expect(farmer).not.toHaveProperty(key);
    expect(v2.world.npcs.merchant).toBeNull();
    const before = hashValue(v2);
    const migrated = migrateSave(v2, MIGRATIONS.slice(0, 3), 3) as unknown as Doc;
    expect(migrated.version).toBe(3);
    expect(hashValue(v2)).toBe(before);
    const { npcs, ...rest } = v2.world;
    const { npcs: npcsAfter, nameIdx, ...restAfter } = migrated.world;
    expect(restAfter).toEqual(rest);
    expect(nameIdx).toBe((v2.world['sheep'] as unknown[]).length);
    expect(npcsAfter).toEqual({ ...npcs, farmer: { ...farmer, ...v3NpcDefaults('farmer') }, merchant: null });
  });

  it('gives a merchant the cart and a farmer the entering flag', () => {
    const v2 = fixture('save-v2.json') as Doc;
    const merchant = { ...v2.world.npcs.farmer!, kind: 'merchant' };
    const doc = { ...v2, world: { ...v2.world, npcs: { ...v2.world.npcs, merchant } } };
    const migrated = v3FlockAndNpcFields.up(doc) as unknown as Doc;
    expect(migrated.world.npcs.merchant).toMatchObject({ cart: true, entering: false, outside: true, job: null, shearing: null, wp: null, icon: null, iconUntilMs: 0 });
    expect(migrated.world.npcs.farmer).toMatchObject({ cart: false, entering: true });
    const loaded = fromSave(doc);
    expect(loaded.npcs.merchant?.cart).toBe(true);
    expect(loaded.npcs.farmer?.cart).toBe(false);
  });

  it('keeps a field that is already present', () => {
    const v2 = fixture('save-v2.json') as Doc;
    const farmer = { ...v2.world.npcs.farmer!, job: 'shear', icon: 'heart' };
    const doc = { ...v2, world: { ...v2.world, nameIdx: 7, npcs: { ...v2.world.npcs, farmer } } };
    const migrated = v3FlockAndNpcFields.up(doc) as unknown as Doc;
    expect(migrated.world['nameIdx']).toBe(7);
    expect(migrated.world.npcs.farmer).toMatchObject({ job: 'shear', icon: 'heart', shearing: null, cart: false });
  });

  it('bumps the version and leaves a malformed world for validation to refuse', () => {
    expect(v3FlockAndNpcFields.up({ version: 2, world: 'nope' })).toEqual({ version: 3, world: 'nope' });
    expect(v3FlockAndNpcFields.up({ version: 2, world: { npcs: null } })).toEqual({ version: 3, world: { npcs: null, nameIdx: 0 } });
    expect(v3FlockAndNpcFields.up({ version: 2, world: { npcs: { farmer: 'x', merchant: null } } })).toEqual({
      version: 3,
      world: { npcs: { farmer: 'x', merchant: null }, nameIdx: 0 },
    });
    expect(code(() => fromSave({ format: SAVE_FORMAT, version: 2, world: { npcs: null } }))).toBe('invalid-world');
  });

  it('a loaded v2 NPC is a complete Npc the sim can step', () => {
    const loaded = fromSave(fixture('save-v2.json'));
    const farmer = loaded.npcs.farmer as Npc;
    for (const key of NPC_KEYS) expect(farmer).toHaveProperty(key);
    expect(farmer.plan.map((j) => j.job)).toEqual(['shear', 'leave']);
    expect(loaded.nameIdx).toBe(loaded.sheep.length);
  });
});

describe('v3 to v4', () => {
  type Walker = Record<string, unknown>;
  type Doc = { version: number; world: { sheep: Walker[]; luna: Walker } & Record<string, unknown> };
  const STAMP_KEYS = Object.keys(V4_STAMP_DEFAULTS);

  it('the defaults are what a fresh state, a fresh sheep, and a fresh DL hold', () => {
    const fresh = createInitialState(1);
    expect(fresh.ground).toEqual(v4GroundDefault());
    expect(v4GroundDefault()).not.toBe(v4GroundDefault()); // a new object each call: no shared arrays between worlds
    const sheep = makeSheep(createRng(1), 0, { x: 300, y: 250 }) as unknown as Walker;
    const luna = makeLuna() as unknown as Walker;
    for (const [key, value] of Object.entries(V4_STAMP_DEFAULTS)) {
      expect(sheep[key], `sheep.${key}`).toEqual(value);
      expect(luna[key], `luna.${key}`).toEqual(value);
    }
  });

  it('fills ground and the two stamp fields on every sheep and on luna with fresh-state defaults and touches nothing else', () => {
    const v3 = fixture('save-v3.json') as Doc;
    expect(v3.version).toBe(3);
    expect(v3.world).not.toHaveProperty('ground');
    for (const key of STAMP_KEYS) {
      expect(v3.world.luna).not.toHaveProperty(key);
      for (const q of v3.world.sheep) expect(q).not.toHaveProperty(key);
    }
    const before = hashValue(v3);
    const migrated = migrateSave(v3) as unknown as Doc;
    expect(migrated.version).toBe(4);
    expect(hashValue(v3)).toBe(before);
    const { sheep, luna, ...rest } = v3.world;
    const { sheep: sheepAfter, luna: lunaAfter, ground, ...restAfter } = migrated.world;
    expect(restAfter).toEqual(rest);
    expect(ground).toEqual(v4GroundDefault());
    expect(lunaAfter).toEqual({ ...luna, ...V4_STAMP_DEFAULTS });
    expect(sheepAfter).toEqual(sheep.map((q) => ({ ...q, ...V4_STAMP_DEFAULTS })));
  });

  it('keeps a field that is already present', () => {
    const v3 = fixture('save-v3.json') as Doc;
    const luna = { ...v3.world.luna, lastStamp: { x: 1, y: 2 } };
    const sheep = v3.world.sheep.map((q, i) => (i === 0 ? { ...q, stampSide: true } : q));
    const ground = { prints: [{ x: 3, y: 4, tMs: 5 }], mud: [], wasSnowy: true };
    const doc = { ...v3, world: { ...v3.world, luna, sheep, ground } };
    const migrated = v4GroundAndStamps.up(doc) as unknown as Doc;
    expect(migrated.world['ground']).toEqual(ground);
    expect(migrated.world.luna).toMatchObject({ lastStamp: { x: 1, y: 2 }, stampSide: false });
    expect(migrated.world.sheep[0]).toMatchObject({ lastStamp: null, stampSide: true });
    expect(migrated.world.sheep[1]).toMatchObject(V4_STAMP_DEFAULTS);
  });

  it('bumps the version and leaves a malformed world for validation to refuse', () => {
    expect(v4GroundAndStamps.up({ version: 3, world: 'nope' })).toEqual({ version: 4, world: 'nope' });
    expect(v4GroundAndStamps.up({ version: 3, world: { luna: null, sheep: 'x' } })).toEqual({ version: 4, world: { luna: null, sheep: 'x', ground: v4GroundDefault() } });
    expect(code(() => fromSave({ format: SAVE_FORMAT, version: 3, world: { luna: null } }))).toBe('invalid-world');
  });

  it('a loaded v3 world is complete and steps: the walkers stamp once they are out on the field', () => {
    const loaded = fromSave(fixture('save-v3.json'));
    expect(loaded.ground).toEqual({ prints: [], mud: [], wasSnowy: false });
    for (const q of loaded.sheep) for (const key of STAMP_KEYS) expect(q).toHaveProperty(key);
    for (const key of STAMP_KEYS) expect(loaded.luna).toHaveProperty(key);
    // The fixture's shower has everyone in the barn, so the rain stamps nothing; when it clears,
    // the flock steps out and wanders, and the migrated walkers' stamp gates start moving.
    expect(loaded.weather.rain).toBe(true);
    expect(loaded.sheep.every((q) => q.inBarn)).toBe(true);
    const after = advance(loaded, 100);
    expect(after.ground.mud).toEqual([]);
    const out = advance(applyIntent(cloneState(after), { type: 'setWeather', weather: 'sun' }), 100);
    expect(out.sheep.some((q) => q.lastStamp !== null)).toBe(true);
    expect(out.ground.mud).toEqual([]); // dry ground: the gate moves, nothing is left behind
  });
});

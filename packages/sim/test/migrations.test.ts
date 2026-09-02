import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashValue } from '../src/hash';
import { SAVE_FORMAT, SaveError, type UnknownSaveDoc } from '../src/save/doc';
import { assertMigrationChain, MIGRATIONS, migrateSave, readVersion, type Migration } from '../src/save/migrations/index';
import { V2_LUNA_DEFAULTS, v2LunaFetchFields } from '../src/save/migrations/v2-luna-fetch-fields';
import { fromSave, toSave } from '../src/save/serialize';
import { createInitialState, SAVE_VERSION } from '../src/state';

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
    const migrated = migrateSave(v1) as unknown as Doc;
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

  it('a v0 save walks the whole chain to v2', () => {
    const v0 = fixture('save-v0.json') as UnknownSaveDoc;
    const v2 = migrateSave(v0) as unknown as Doc;
    expect(v2.version).toBe(SAVE_VERSION);
    expect(v2.world.luna).toMatchObject(V2_LUNA_DEFAULTS);
    const loaded = fromSave(v0);
    expect(loaded.luna.stick).toBeNull();
    expect(loaded.luna.forceBoundUntilMs).toBe(0);
  });
});

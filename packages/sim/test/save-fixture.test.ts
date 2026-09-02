// The committed fixtures under test/fixtures are frozen saves, one per schema version. Every one
// of them must still load through the migrations and step 100 ticks. Only the current version's
// fixture is generated here, and only when its file is missing; older fixtures are never rewritten.
// See test/fixtures/README.md for the rule on bumping the version.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/hash';
import { V2_LUNA_DEFAULTS } from '../src/save/migrations/v2-luna-fetch-fields';
import { v3NpcDefaults } from '../src/save/migrations/v3-flock-and-npc-fields';
import { V4_STAMP_DEFAULTS, v4GroundDefault } from '../src/save/migrations/v4-ground-and-stamps';
import { SAVE_FORMAT } from '../src/save/doc';
import { fromSave, toSave, toSaveText } from '../src/save/serialize';
import { createInitialState, SAVE_VERSION, type SimState } from '../src/state';
import { step } from '../src/step';
import { advance } from '../src/tick';

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
const currentFixture = join(fixturesDir, `save-v${SAVE_VERSION}.json`);

/** Seed of the fixture worlds. Fixed so a regenerated fixture is a function of the code alone. */
export const FIXTURE_SEED = 8;

/**
 * The world the current fixture is taken from: 1,200 ticks with a few intents, then the corners
 * of the schema the 1,200 ticks do not reach (lambs, a shear timer, an NPC with a plan, small
 * life, two snow prints, a queued intent) filled in by hand so the fixture covers every type in
 * the state. The mud is real: the shower's first 30 s walked the flock and DL to the barn door.
 */
export function buildFixtureState(): SimState {
  let s = createInitialState(FIXTURE_SEED);
  s = step(s, [{ type: 'setWeather', weather: 'rain' }], 30_000);
  s = step(s, [{ type: 'setWeatherMode', mode: 'season' }, { type: 'setClock', t: 0.5 }], 90_050);
  const now = s.clock.nowMs;
  const clover = s.sheep[0]!;
  clover.path = [
    { x: 300, y: 220 },
    { x: 320, y: 236 },
  ];
  clover.wp = { x: 300, y: 220 };
  clover.tx = 320;
  clover.ty = 236;
  clover.wander = 1;
  clover.tuft = 3;
  s.tufts[3]!.claimed = clover.id;
  clover.eating = true;
  s.sheep[1]!.lambs.push({ x: 250, y: 260, dir: -1, bornMs: now - 5_000, grown: false });
  s.sheep[2]!.shearAtMs = now + 2_500;
  s.sheep[3]!.icon = 'zz';
  s.sheep[3]!.iconUntilMs = now + 1_500;
  s.sheep[3]!.resting = true;
  s.luna = { ...s.luna, anim: 'run', dir: -1, t0Ms: now - 400, target: { x: 200, y: 240 }, tx: 200, ty: 240, routine: 'patrol', wet: 0.3 };
  s.npcs.farmer = {
    kind: 'farmer',
    x: 506,
    y: 262,
    dir: -1,
    anim: 'walk',
    t0Ms: now,
    tx: 240,
    ty: 146,
    wp: null,
    outside: false,
    entering: false,
    plan: [{ job: 'shear', at: { x: 240, y: 146 } }, { job: 'leave' }],
    job: null,
    jobUntilMs: now + 4_000,
    shearing: null,
    cart: false,
    icon: 'heart',
    iconUntilMs: now + 1_000,
    sold: 0,
  };
  s.life.rabbit = { x: 90, y: 300, t0Ms: now - 1_000 };
  s.life.bird = { x: 168, y: 108, tx: 168, ty: 108, state: 'sit', t0Ms: now - 2_000 };
  s.banks = { wool: 2, coins: 6, owned: ['flowerbed'] };
  s.ground.prints.push({ x: 300, y: 250, tMs: now - 20_000 }, { x: 306, y: 248, tMs: now - 19_300 });
  s.pendingIntents.push({ type: 'setSeason', season: 'winter', at: s.clock.tick + 500 });
  return s;
}

function ensureCurrentFixture(): void {
  if (existsSync(currentFixture)) return;
  writeFileSync(currentFixture, toSaveText(buildFixtureState()));
  console.log(`wrote ${currentFixture}; commit it and never regenerate it`);
}

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as unknown;
}

describe('save fixtures', () => {
  ensureCurrentFixture();
  const names = readdirSync(fixturesDir)
    .filter((n) => /^save-v\d+\.json$/.test(n))
    .sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]));

  it('has one fixture per schema version up to the current one', () => {
    expect(names).toEqual(Array.from({ length: SAVE_VERSION + 1 }, (_, v) => `save-v${v}.json`));
  });

  it(`save-v${SAVE_VERSION}.json is a current-version document`, () => {
    const doc = readFixture(`save-v${SAVE_VERSION}.json`) as { format: unknown; version: unknown; world: unknown };
    expect(doc.format).toBe(SAVE_FORMAT);
    expect(doc.version).toBe(SAVE_VERSION);
    expect(doc.world).toBeTypeOf('object');
  });

  it('the v1 fixture loads and steps 100 ticks', () => {
    const doc = readFixture('save-v1.json');
    const loaded = fromSave(doc);
    expect(loaded.version).toBe(SAVE_VERSION);
    expect(loaded.seed).toBe(FIXTURE_SEED);
    expect(loaded.clock.tick).toBe(1200);
    expect(loaded.accumulatorMs).toBe(50);
    expect(loaded.pendingIntents).toHaveLength(1);
    expect(loaded.sheep[1]!.lambs).toHaveLength(1);
    expect(loaded.npcs.farmer?.kind).toBe('farmer');
    // The v2 migration filled the behaviour-chain fields a v1 save never had.
    expect(loaded.luna.stick).toBeNull();
    expect(loaded.luna.circleUntilMs).toBeNull();
    expect(loaded.luna.dirAtMs).toBe(0);
    expect(loaded.luna.tagUntilMs).toBe(0);
    expect(loaded.luna.forceBoundUntilMs).toBe(0);
    // The v3 migration filled the flock counter and the farmer's job-plan fields.
    expect(loaded.nameIdx).toBe(5);
    expect(loaded.npcs.farmer).toMatchObject(v3NpcDefaults('farmer'));
    // The v4 migration filled the ground and the stamp fields on every walker.
    expect(loaded.ground).toEqual({ prints: [], mud: [], wasSnowy: false });
    expect(loaded.luna).toMatchObject(V4_STAMP_DEFAULTS);
    for (const q of loaded.sheep) expect(q).toMatchObject(V4_STAMP_DEFAULTS);

    const after = advance(loaded, 100);
    expect(after.clock.tick).toBe(1300);
    expect(after.clock.nowMs).toBe(loaded.clock.nowMs + 10_000);
    expect(after.rng.s).toBeGreaterThanOrEqual(0);
    expect(after.rng.s).toBeLessThanOrEqual(0xffffffff);
    // The queued intent sits 500 ticks out, so it is still queued.
    expect(after.pendingIntents).toEqual(loaded.pendingIntents);
    // Loading twice and stepping gives the same world.
    expect(hashState(advance(fromSave(doc), 100))).toBe(hashState(after));
    // The loop moved the world: this is not a frozen state being handed back.
    expect(hashState(after)).not.toBe(hashState(loaded));
  });

  it(`the current fixture round-trips: toSave(fromSave(save-v${SAVE_VERSION}.json)) equals it byte for byte`, () => {
    const name = `save-v${SAVE_VERSION}.json`;
    const doc = readFixture(name);
    const again = toSave(fromSave(doc));
    expect(again).toEqual(doc);
    expect(JSON.stringify(again, null, 2) + '\n').toBe(readFileSync(join(fixturesDir, name), 'utf8'));
  });

  type OldDoc = { version: number; world: { luna: Record<string, unknown>; npcs: { farmer: Record<string, unknown> | null; merchant: Record<string, unknown> | null } } & Record<string, unknown> };

  /** `world` as the migrations from `from` should leave it: the old fields, plus each later version's defaults. */
  function migratedWorld(from: number, world: OldDoc['world']): Record<string, unknown> {
    let out: Record<string, unknown> = world;
    if (from < 2) out = { ...out, luna: { ...world.luna, ...V2_LUNA_DEFAULTS } };
    if (from < 3) {
      const fill = (n: Record<string, unknown> | null): Record<string, unknown> | null => (n ? { ...n, ...v3NpcDefaults(n['kind']) } : null);
      out = { ...out, nameIdx: (world['sheep'] as unknown[]).length, npcs: { ...world.npcs, farmer: fill(world.npcs.farmer), merchant: fill(world.npcs.merchant) } };
    }
    if (from < 4) {
      const sheep = (out['sheep'] as Record<string, unknown>[]).map((q) => ({ ...q, ...V4_STAMP_DEFAULTS }));
      out = { ...out, ground: v4GroundDefault(), sheep, luna: { ...(out['luna'] as Record<string, unknown>), ...V4_STAMP_DEFAULTS } };
    }
    return out;
  }

  for (const from of [1, 2, 3]) {
    it(`save-v${from}.json comes back as a current-version document with the same world plus exactly the migrated fields`, () => {
      const old = readFixture(`save-v${from}.json`) as OldDoc;
      const again = toSave(fromSave(old));
      expect(old.version).toBe(from);
      expect(again.version).toBe(SAVE_VERSION);
      expect(again.world).toEqual(migratedWorld(from, old.world));
      expect(old.world).not.toHaveProperty('ground');
      if (from < 3) expect(old.world).not.toHaveProperty('nameIdx');
    });
  }

  for (const name of names) {
    it(`${name} loads through the migrations and steps 100 ticks`, () => {
      const loaded = fromSave(readFixture(name));
      expect(loaded.version).toBe(SAVE_VERSION);
      const after = advance(loaded, 100);
      expect(after.clock.tick).toBe(loaded.clock.tick + 100);
      expect(hashState(advance(fromSave(readFixture(name)), 100))).toBe(hashState(after));
    });
  }
});

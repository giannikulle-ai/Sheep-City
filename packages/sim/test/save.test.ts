import { describe, expect, it } from 'vitest';
import { canonicalJson, hashState, hashValue } from '../src/hash';
import { SAVE_FORMAT, SaveError, type SaveDoc } from '../src/save/doc';
import { findUnserializable, fromSave, fromSaveText, toSave, toSaveText, validateWorld } from '../src/save/serialize';
import { cloneState, createInitialState, SAVE_VERSION } from '../src/state';
import { step } from '../src/step';
import { advance, tick } from '../src/tick';

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof SaveError) return error.code;
    throw error;
  }
  throw new Error('expected a SaveError');
}

/** A JSON round trip, as localStorage or an export-as-text box would do it. */
const throughJson = (doc: SaveDoc): unknown => JSON.parse(JSON.stringify(doc));

describe('toSave', () => {
  it('writes a versioned, tagged document with the whole world in it, RNG included', () => {
    const state = advance(createInitialState(7), 300);
    const doc = toSave(state);
    expect(doc.format).toBe(SAVE_FORMAT);
    expect(doc.version).toBe(SAVE_VERSION);
    expect(doc.world).not.toHaveProperty('version');
    expect(doc.world.rng).toEqual({ s: state.rng.s });
    expect(doc.world.seed).toBe(7);
    expect(doc.world.clock.tick).toBe(300);
    expect(doc.world.sheep.map((s) => s.name)).toEqual(state.sheep.map((s) => s.name));
    // Everything in the state except `version` is in the world, byte for byte in canonical form.
    const { version: _v, ...rest } = state;
    expect(canonicalJson(doc.world)).toBe(canonicalJson(rest));
  });

  it('does not share objects with the state it was taken from', () => {
    const state = createInitialState(7);
    const before = hashState(state);
    const doc = toSave(state);
    doc.world.rng.s = 1;
    doc.world.sheep[0]!.wool = 1;
    doc.world.tufts[0]!.level = 0;
    doc.world.banks.owned.push('hay2');
    doc.world.pendingIntents.push({ type: 'pauseClock', paused: true });
    expect(hashState(state)).toBe(before);
  });

  it('refuses a state JSON could not carry back', () => {
    const state = createInitialState(7);
    state.sheep[0]!.wool = NaN;
    expect(code(() => toSave(state))).toBe('not-serializable');
    const bad = createInitialState(7);
    bad.weather.temp = Infinity;
    expect(() => toSave(bad)).toThrow(/world\.weather\.temp is Infinity/);
  });
});

describe('fromSave', () => {
  it('gives back a state with the same hash as the one saved', () => {
    const state = advance(createInitialState(7), 250);
    expect(hashState(fromSave(toSave(state)))).toBe(hashState(state));
    expect(hashState(fromSave(throughJson(toSave(state))))).toBe(hashState(state));
  });

  it('does not share objects with the document', () => {
    const doc = toSave(createInitialState(7));
    const before = hashValue(doc);
    const state = fromSave(doc);
    state.sheep[0]!.wool = 1;
    state.rng.s = 0;
    state.luna.target = { x: 1, y: 1 };
    state.banks.owned.push('x');
    expect(hashValue(doc)).toBe(before);
  });

  it('keeps the accumulator and queued intents, so a mid-frame save resumes exactly', () => {
    let state = createInitialState(7);
    state = step(state, [{ type: 'setSeason', season: 'winter', at: 40 }], 1_030);
    expect(state.accumulatorMs).toBe(30);
    expect(state.pendingIntents).toHaveLength(1);
    const loaded = fromSave(throughJson(toSave(state)));
    expect(loaded.accumulatorMs).toBe(30);
    expect(loaded.pendingIntents).toEqual(state.pendingIntents);
    const a = step(state, [], 3_000);
    const b = step(loaded, [], 3_000);
    expect(a.season.override).toBe('winter');
    expect(hashState(a)).toBe(hashState(b));
  });

  it('rejects foreign or broken documents with a SaveError code', () => {
    const good = toSave(createInitialState(7));
    expect(code(() => fromSave(undefined))).toBe('not-a-save');
    expect(code(() => fromSave(42))).toBe('not-a-save');
    expect(code(() => fromSave({ version: SAVE_VERSION, world: good.world }))).toBe('bad-format');
    expect(code(() => fromSave({ ...good, format: 'luna-farm' }))).toBe('bad-format');
    expect(code(() => fromSave({ ...good, world: null }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: {} }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, rng: { s: -1 } } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, rng: { s: 2 ** 32 } } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, weather: { ...good.world.weather, kind: 'hail' } } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, weather: { ...good.world.weather, rain: true } } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, clock: { ...good.world.clock, t: 1 } } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, sheep: [good.world.sheep[0], good.world.sheep[0]] } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, sheep: [{ ...good.world.sheep[0], tuft: 999 }] } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, pendingIntents: [{ type: 'smite' }] } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, pendingIntents: [{ type: 'pauseClock', paused: true, at: 1.5 }] } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, accumulatorMs: -5 } }))).toBe('invalid-world');
    expect(code(() => fromSave({ ...good, world: { ...good.world, life: { ...good.world.life, bird: { x: 0, y: 0, state: 'fly' } } } }))).toBe('invalid-world');
    expect(() => fromSave({ ...good, world: { ...good.world, tufts: [{ x: 1, y: 2, level: 3, claimed: null }] } })).toThrow(/world\.tufts\[0\]\.level/);
  });

  it('accepts every world the sim produces', () => {
    for (const seed of [0, 1, 2, 3, 4]) {
      const state = step(createInitialState(seed, { sheep: 9 }), [{ type: 'setWeather', weather: 'snow' }], 20_000);
      expect(() => validateWorld(toSave(state).world)).not.toThrow();
    }
  });
});

describe('round trip', () => {
  it('toSave(fromSave(doc)) equals doc', () => {
    const state = step(createInitialState(9), [{ type: 'setClock', t: 0.7 }, { type: 'setSeason', season: 'autumn', at: 5000 }], 12_345);
    const doc = throughJson(toSave(state)) as SaveDoc;
    const again = toSave(fromSave(doc));
    expect(again).toEqual(doc);
    expect(canonicalJson(again)).toBe(canonicalJson(doc));
    expect(JSON.stringify(again)).toBe(JSON.stringify(doc));
  });

  it('a state saved then loaded steps identically to the original for 1,000 ticks', () => {
    const original = advance(createInitialState(7), 500);
    const loaded = fromSave(throughJson(toSave(original)));
    expect(hashState(loaded)).toBe(hashState(original));
    let a = original;
    let b = loaded;
    for (let i = 0; i < 1000; i++) {
      a = tick(a);
      b = tick(b);
      expect(hashState(b), `tick ${i + 1}`).toBe(hashState(a));
    }
    expect(a.clock.tick).toBe(1500);
    expect(hashState(a)).not.toBe(hashState(original));
  });

  it('the same holds through step() with uneven frames and intents', () => {
    const original = step(createInitialState(5), [], 777);
    const loaded = fromSave(throughJson(toSave(original)));
    let a = original;
    let b = loaded;
    for (let i = 0; i < 300; i++) {
      const intents = i === 20 ? [{ type: 'setWeather', weather: 'rain' } as const] : i === 150 ? [{ type: 'setWeatherMode', mode: 'season' } as const] : [];
      const dt = i % 3 === 0 ? 1_000 : 116;
      a = step(a, intents, dt);
      b = step(b, intents, dt);
      expect(hashState(b)).toBe(hashState(a));
    }
    expect(a.clock.tick).toBeGreaterThan(1000);
  });

  it('the RNG state in the save is what keeps the futures aligned', () => {
    const original = advance(createInitialState(7), 500);
    const doc = throughJson(toSave(original)) as SaveDoc;
    const tampered = cloneState(fromSave(doc));
    tampered.rng.s = (tampered.rng.s + 1) >>> 0;
    // Same world, different generator state: the next weather roll draws different numbers.
    expect(hashState({ ...tampered, rng: doc.world.rng })).toBe(hashState(original));
    expect(hashState(advance(tampered, 200))).not.toBe(hashState(advance(original, 200)));
  });
});

describe('text helpers', () => {
  it('toSaveText and fromSaveText round-trip through a string', () => {
    const state = advance(createInitialState(4), 90);
    const text = toSaveText(state);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(toSave(state));
    expect(hashState(fromSaveText(text))).toBe(hashState(state));
    expect(toSaveText(fromSaveText(text))).toBe(text);
  });

  it('turns bad JSON into a SaveError', () => {
    expect(code(() => fromSaveText('{not json'))).toBe('not-a-save');
    expect(code(() => fromSaveText(''))).toBe('not-a-save');
    expect(code(() => fromSaveText('"a string"'))).toBe('not-a-save');
  });
});

describe('findUnserializable', () => {
  it('names the first value JSON would not carry back', () => {
    expect(findUnserializable({ a: 1, b: [1, 'x', null, { c: true }] }, '$')).toBeNull();
    expect(findUnserializable({ a: { b: NaN } }, '$')).toBe('$.a.b is NaN');
    expect(findUnserializable([1, -Infinity], '$')).toBe('$[1] is -Infinity');
    expect(findUnserializable([1, undefined], '$')).toBe('$[1] is undefined');
    expect(findUnserializable({ a: undefined }, '$')).toBeNull();
    expect(findUnserializable({ f: () => 1 }, '$')).toBe('$.f is a function');
  });
});

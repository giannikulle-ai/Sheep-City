import { describe, expect, it } from 'vitest';
import { MIGRATIONS, SAVE_FORMAT, SAVE_VERSION, SIM_PACKAGE, TICK_MS, createInitialState, fromSave, hashState, step, toSave } from './index';

describe('@sheepcliff/sim public surface', () => {
  it('exports a save version, package name, and the fixed tick', () => {
    expect(SAVE_VERSION).toBe(1);
    expect(SIM_PACKAGE).toBe('@sheepcliff/sim');
    expect(TICK_MS).toBe(100);
  });

  it('builds a world and steps it through the index exports', () => {
    const a = createInitialState(1);
    const b = step(a, [], 1000);
    expect(b.clock.tick).toBe(10);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('saves and loads through the index exports', () => {
    const a = step(createInitialState(1), [], 1000);
    const doc = toSave(a);
    expect(doc.format).toBe(SAVE_FORMAT);
    expect(doc.version).toBe(SAVE_VERSION);
    expect(MIGRATIONS).toHaveLength(SAVE_VERSION);
    expect(hashState(fromSave(doc))).toBe(hashState(a));
  });
});

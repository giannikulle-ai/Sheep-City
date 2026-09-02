import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, SIM_PACKAGE, TICK_MS, createInitialState, hashState, step } from './index';

describe('@sheepcliff/sim public surface', () => {
  it('exports a save version, package name, and the fixed tick', () => {
    expect(SAVE_VERSION).toBe(0);
    expect(SIM_PACKAGE).toBe('@sheepcliff/sim');
    expect(TICK_MS).toBe(100);
  });

  it('builds a world and steps it through the index exports', () => {
    const a = createInitialState(1);
    const b = step(a, [], 1000);
    expect(b.clock.tick).toBe(10);
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

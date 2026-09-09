import { describe, expect, it } from 'vitest';
import { inBarn, insideField, SFOOT } from '../src/geometry';
import { hashState } from '../src/hash';
import { cloneState, createInitialState, FARM_BUILDS } from '../src/state';

describe('createInitialState', () => {
  it('spawns the prototype world: five named sheep, DL at (120, 280), grass, banks at zero, the three farm builds owned (#126)', () => {
    const s = createInitialState(7);
    expect(s.sheep.map((x) => x.name)).toEqual(['Clover', 'Daisy', 'Biscuit', 'Pepper', 'Maple']);
    expect(s.luna.x).toBe(120);
    expect(s.luna.y).toBe(280);
    expect(s.luna.anim).toBe('sit');
    expect(s.tufts.length).toBeGreaterThan(20);
    // Was `owned: []` before #126 (plan decision 19): the flowerbed, hay2, and the scarecrow are
    // on the farm from a world's first day now; nothing buys them.
    expect(s.banks).toEqual({ wool: 0, coins: 0, owned: ['flowerbed', 'hay2', 'scarecrow'] });
    expect(s.banks.owned).toEqual([...FARM_BUILDS]);
    expect(s.npcs.merchantAtMs).toBe(45000);
    expect(s.life.bflies).toHaveLength(2);
    expect(s.life.flies).toHaveLength(14);
    expect(s.seed).toBe(7);
    expect(s.accumulatorMs).toBe(0);
  });

  it('puts every sheep and tuft on standable ground', () => {
    const s = createInitialState(123);
    for (const sh of s.sheep) {
      const fx = sh.x + SFOOT[0];
      const fy = sh.y + SFOOT[1];
      expect(insideField(fx, fy, 0.79)).toBe(true);
      expect(sh.wool).toBeGreaterThanOrEqual(0);
      expect(sh.wool).toBeLessThan(0.6);
    }
    for (const t of s.tufts) {
      expect(inBarn(t.x, t.y)).toBe(false);
      expect(t.level).toBeGreaterThanOrEqual(0);
      expect(t.level).toBeLessThanOrEqual(1);
    }
  });

  it('is a function of the seed alone', () => {
    expect(hashState(createInitialState(7))).toBe(hashState(createInitialState(7)));
    expect(hashState(createInitialState(7))).not.toBe(hashState(createInitialState(8)));
  });

  it('can spawn a bigger flock for the bench', () => {
    expect(createInitialState(1, { sheep: 40 }).sheep).toHaveLength(40);
  });

  it('clones deeply enough that mutating the clone leaves the original alone', () => {
    const a = createInitialState(2);
    const b = cloneState(a);
    b.sheep[0]!.wool = 1;
    b.tufts[0]!.level = 0;
    b.rng.s = 0;
    b.luna.anim = 'run';
    b.banks.owned.push('silo'); // 'hay2' is already owned from the start (#126); push a novel id instead
    expect(a.sheep[0]!.wool).not.toBe(1);
    expect(a.tufts[0]!.level).not.toBe(0);
    expect(a.rng.s).not.toBe(0);
    expect(a.luna.anim).toBe('sit');
    expect(a.banks.owned).toEqual([...FARM_BUILDS]);
    expect(hashState(a)).toBe(hashState(createInitialState(2)));
  });
});

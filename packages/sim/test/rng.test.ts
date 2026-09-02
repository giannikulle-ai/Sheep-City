import { describe, expect, it } from 'vitest';
import { chance, cloneRng, createRng, nextFloat, nextInt, nextRange, nextU32, pick } from '../src/rng';

describe('seeded rng', () => {
  it('is reproducible from a seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    const seqA = Array.from({ length: 50 }, () => nextU32(a));
    const seqB = Array.from({ length: 50 }, () => nextU32(b));
    expect(seqA).toEqual(seqB);
  });

  it('matches the reference mulberry32 stream for seed 7', () => {
    // First three draws of the canonical mulberry32 (bryc's reference JavaScript) for seed 7,
    // computed with that implementation, not this one.
    const r = createRng(7);
    const first = [nextU32(r), nextU32(r), nextU32(r)];
    expect(first).toEqual([50271532, 266108690, 4195786334]);
  });

  it('gives different streams for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 8 }, () => nextU32(a))).not.toEqual(Array.from({ length: 8 }, () => nextU32(b)));
  });

  it('reduces seeds to 32 bits and rejects non-finite seeds', () => {
    expect(createRng(2 ** 32 + 5).s).toBe(5);
    expect(createRng(-1).s).toBe(0xffffffff);
    expect(() => createRng(NaN)).toThrow();
    expect(() => createRng(Infinity)).toThrow();
  });

  it('keeps floats in [0, 1) and ranges and ints inside their bounds', () => {
    const r = createRng(42);
    for (let i = 0; i < 10000; i++) {
      const f = nextFloat(r);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const x = nextRange(r, -3, 3);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThan(3);
      const n = nextInt(r, 4);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it('is roughly uniform', () => {
    const r = createRng(99);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100000;
    for (let i = 0; i < draws; i++) buckets[nextInt(r, 10)]!++;
    for (const b of buckets) expect(Math.abs(b / draws - 0.1)).toBeLessThan(0.01);
  });

  it('chance and pick draw from the same stream', () => {
    const a = createRng(5);
    const b = createRng(5);
    expect(chance(a, 0.5)).toBe(nextFloat(b) < 0.5);
    expect(pick(a, ['x', 'y', 'z'])).toBe(['x', 'y', 'z'][nextInt(b, 3)]);
    expect(() => pick(a, [])).toThrow();
  });

  it('clones without sharing state', () => {
    const a = createRng(3);
    nextU32(a);
    const b = cloneRng(a);
    expect(nextU32(a)).toBe(nextU32(b));
    nextU32(a);
    expect(a.s).not.toBe(b.s);
  });
});

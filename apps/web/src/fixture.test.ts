import { describe, expect, it } from 'vitest';
import { buildFixture, fixtureTufts } from './fixture';
import { parseSceneParams } from './query';

const NOW = 100000;

describe('buildFixture', () => {
  it('is deterministic for the same params and clock', () => {
    const a = buildFixture(parseSceneParams('?weather=rain'), NOW);
    const b = buildFixture(parseSceneParams('?weather=rain'), NOW);
    expect(a).toEqual(b);
  });

  it('keeps every actor on the field, off the barn footprint', () => {
    const v = buildFixture(parseSceneParams(''), NOW);
    for (const s of v.sheep) {
      const fx = s.x + 16;
      const fy = s.y + 25;
      expect(Math.abs(fx - 320) / 304 + Math.abs(fy - 208) / 164).toBeLessThan(0.9);
      expect(fy).toBeGreaterThan(76);
    }
    expect(v.sheep).toHaveLength(5);
    expect(v.sheep.some((s) => s.lambs.length > 0)).toBe(true);
  });

  it('sends two sheep into the barn and DL to the door in rain', () => {
    const v = buildFixture(parseSceneParams('?weather=rain'), NOW);
    expect(v.sheep.filter((s) => s.inBarn)).toHaveLength(2);
    expect(v.luna.y + 38).toBeLessThan(120);
    expect(v.mud.length).toBeGreaterThan(0);
    expect(v.prints).toHaveLength(0);
    expect(v.sheep.every((s) => s.wet > 0.5)).toBe(true);
  });

  it('caps sheep with snow and lays footprints when snowing', () => {
    const v = buildFixture(parseSceneParams('?weather=snow'), NOW);
    expect(v.sheep.every((s) => s.snow > 0.4)).toBe(true);
    expect(v.prints.length).toBeGreaterThan(0);
    expect(v.prints.every((p) => p.t <= NOW)).toBe(true);
    expect(v.mud).toHaveLength(0);
  });
});

describe('fixtureTufts', () => {
  it('rings the field and leaves the barn and gate clear', () => {
    const tufts = fixtureTufts();
    expect(tufts.length).toBeGreaterThan(24);
    for (const t of tufts) {
      expect(t.level).toBeGreaterThanOrEqual(0.3);
      expect(t.level).toBeLessThanOrEqual(1);
      expect(t.x > 268 && t.x < 388 && t.y < 76).toBe(false);
    }
  });
});

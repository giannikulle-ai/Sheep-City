import { describe, expect, it } from 'vitest';
import { SFOOT, insideField } from '../src/geometry';
import { clampMoverTarget, clampTarget, stepToward, type Mover } from '../src/movement';

function mover(tx: number | null, ty: number | null): Mover {
  return { x: 100, y: 100, dir: 1, tx, ty, wp: null };
}

describe('clampMoverTarget', () => {
  it('lands a walker on the same pixel as clampTarget would, over the whole field and beyond it', () => {
    let clamped = 0;
    for (let x = -200; x <= 840; x += 13) {
      for (let y = -100; y <= 500; y += 11) {
        const viaPoint = clampTarget({ x, y });
        const m = mover(x, y);
        clampMoverTarget(m);
        expect(m.tx).toBe(viaPoint.x);
        expect(m.ty).toBe(viaPoint.y);
        if (m.tx !== x || m.ty !== y) clamped++;
      }
    }
    // The grid reaches well outside the diamond, so the clamp actually moved plenty of targets.
    expect(clamped).toBeGreaterThan(1000);
  });

  it('honours the margin argument as clampTarget does', () => {
    const viaPoint = clampTarget({ x: 600, y: 208 }, 0.5);
    const m = mover(600, 208);
    clampMoverTarget(m, 0.5);
    expect([m.tx, m.ty]).toEqual([viaPoint.x, viaPoint.y]);
    expect(insideField(m.tx as number, m.ty as number, 0.5)).toBe(true);
  });

  it('leaves a walker without a target alone', () => {
    const m = mover(null, null);
    clampMoverTarget(m);
    expect([m.tx, m.ty]).toEqual([null, null]);
  });

  it('does not share state between calls', () => {
    const a = mover(-50, -50);
    clampMoverTarget(a);
    const b = mover(320, 230);
    clampMoverTarget(b);
    expect([b.tx, b.ty]).toEqual([320, 230]);
    expect(a.tx).not.toBe(-50);
  });
});

describe('stepToward', () => {
  it('reports arrival at once for a walker without a target, moving nothing', () => {
    const m = mover(null, null);
    expect(stepToward(m, SFOOT, 80, 0.1)).toBe(true);
    expect([m.x, m.y]).toEqual([100, 100]);
  });
});

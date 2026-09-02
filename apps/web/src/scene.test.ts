import { describe, expect, it } from 'vitest';
import { SCENE, standOnGround } from './scene';

describe('standOnGround', () => {
  it('puts the sprite bottom exactly on the ground line', () => {
    const p = standOnGround(32, 27);
    expect(p.y + 27).toBe(SCENE.groundY);
  });

  it('centres horizontally on integer pixels', () => {
    const p = standOnGround(32, 27);
    expect(p.x).toBe(32);
    expect(Number.isInteger(p.x)).toBe(true);
  });
});

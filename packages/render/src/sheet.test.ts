import { describe, expect, it } from 'vitest';
import { frameAt, frameRect, type SheetMeta } from './sheet';

const meta: SheetMeta = {
  palette: [],
  sprites: {
    sheep: {
      w: 32,
      h: 27,
      anims: {
        graze: { y: 0, frames: 4, fps: 3 },
        think: { y: 27, frames: 4, fps: 3 },
      },
    },
  },
};

describe('frameRect', () => {
  it('lays frames out left to right on the animation row', () => {
    expect(frameRect(meta, 'sheep', 'graze', 0)).toEqual({ sx: 0, sy: 0, w: 32, h: 27 });
    expect(frameRect(meta, 'sheep', 'graze', 3)).toEqual({ sx: 96, sy: 0, w: 32, h: 27 });
    expect(frameRect(meta, 'sheep', 'think', 1)).toEqual({ sx: 32, sy: 27, w: 32, h: 27 });
  });

  it('wraps frame indices like the prototype', () => {
    expect(frameRect(meta, 'sheep', 'graze', 5).sx).toBe(32);
  });

  it('throws on unknown sprite or animation', () => {
    expect(() => frameRect(meta, 'crow', 'graze', 0)).toThrow(/unknown sprite/);
    expect(() => frameRect(meta, 'sheep', 'fly', 0)).toThrow(/no animation/);
  });
});

describe('frameAt', () => {
  it('advances at the animation fps and wraps', () => {
    expect(frameAt(meta, 'sheep', 'graze', 0)).toBe(0);
    expect(frameAt(meta, 'sheep', 'graze', 334)).toBe(1);
    expect(frameAt(meta, 'sheep', 'graze', 1334)).toBe(0);
  });
});

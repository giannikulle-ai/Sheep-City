import { describe, expect, it } from 'vitest';
import { buildFixture } from './fixture';
import { hitTest, tapIntent, type SpriteSizes } from './hit';
import { parseSceneParams } from './query';

const SIZES: SpriteSizes = { sheep: { w: 32, h: 27 }, luna: { w: 44, h: 40 } };
const view = () => buildFixture(parseSceneParams(''), 1000);

describe('hitTest', () => {
  it('finds Digital Luna inside her sprite box', () => {
    // fixture DL is at (120, 280), 44 by 40
    expect(hitTest(view(), 142, 300, SIZES)).toEqual({ kind: 'luna' });
  });

  it('finds a sheep by index', () => {
    // Clover's feet are at (150, 250): sprite x 134..166, y 225..252
    expect(hitTest(view(), 150, 238, SIZES)).toEqual({ kind: 'sheep', index: 0 });
  });

  it('treats open field as grass and the edge of the world as nothing', () => {
    expect(hitTest(view(), 320, 250, SIZES)).toEqual({ kind: 'grass', x: 320, y: 250 });
    expect(hitTest(view(), 5, 5, SIZES)).toEqual({ kind: 'none' });
  });

  it('ignores a sheep that is in the barn', () => {
    const v = view();
    const s = v.sheep[0];
    if (!s) throw new Error('no sheep');
    s.inBarn = true;
    expect(hitTest(v, 150, 238, SIZES).kind).not.toBe('sheep');
  });
});

describe('tapIntent', () => {
  it('pets a sheep, or shears one drawn with the overgrown fleece', () => {
    const v = view();
    const s = v.sheep[1];
    if (!s) throw new Error('no sheep');
    s.wool = 0.5;
    expect(tapIntent(v, { kind: 'sheep', index: 1 })).toEqual({ type: 'pet', target: 'sheep-1' });
    s.wool = 0.85;
    expect(tapIntent(v, { kind: 'sheep', index: 1 })).toEqual({ type: 'shear', target: 'sheep-1' });
  });

  it('pets DL, throws a stick on grass, does nothing off the field', () => {
    const v = view();
    expect(tapIntent(v, { kind: 'luna' })).toEqual({ type: 'pet', target: 'luna' });
    expect(tapIntent(v, { kind: 'grass', x: 300, y: 200 })).toEqual({ type: 'throwStick', x: 300, y: 200 });
    expect(tapIntent(v, { kind: 'none' })).toBeNull();
  });
});

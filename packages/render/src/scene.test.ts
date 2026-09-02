import { describe, expect, it } from 'vitest';
import { lunaAnim, peekSlots, sheepAnim } from './scene';
import { fixtureSheep } from './test-fixture';
import { woolLevel } from './state';
import { puff, seasonWash } from './weather';

describe('sheepAnim', () => {
  it('rests when resting, or at night / in rain while idle', () => {
    expect(sheepAnim(fixtureSheep({ resting: true }), false, false, 0).anim).toBe('rest');
    expect(sheepAnim(fixtureSheep(), true, false, 0).anim).toBe('rest');
    expect(sheepAnim(fixtureSheep(), false, true, 0).anim).toBe('rest');
    expect(sheepAnim(fixtureSheep({ moving: true }), true, false, 0).anim).toBe('trot');
    expect(sheepAnim(fixtureSheep({ eating: true }), true, false, 0).anim).toBe('graze');
  });

  it('trots when moving, grazes when eating', () => {
    expect(sheepAnim(fixtureSheep({ moving: true }), false, false, 1000).anim).toBe('trot');
    expect(sheepAnim(fixtureSheep({ eating: true }), false, false, 1000).anim).toBe('graze');
  });

  it('otherwise shows the wool frame, with a periodic graze every third 9 s slot', () => {
    // now/9000 + t0 floors to 1 => wool
    const idle = sheepAnim(fixtureSheep({ wool: 0.9, t0: 0 }), false, false, 9000);
    expect(idle).toEqual({ anim: 'wool', frame: 2 });
    // floors to 0 => graze
    expect(sheepAnim(fixtureSheep({ t0: 0 }), false, false, 100).anim).toBe('graze');
  });
});

describe('woolLevel', () => {
  it('maps fleece to the three wool frames', () => {
    expect(woolLevel(0)).toBe(0);
    expect(woolLevel(0.33)).toBe(1);
    expect(woolLevel(0.8)).toBe(2);
  });
});

describe('lunaAnim', () => {
  it('swaps run for bound in summer and trundle in snow', () => {
    expect(lunaAnim('run', false, false, false)).toBe('run');
    expect(lunaAnim('run', false, true, false)).toBe('bound');
    expect(lunaAnim('run', true, true, false)).toBe('trundle');
    expect(lunaAnim('run', false, false, true)).toBe('bound');
    expect(lunaAnim('sit', true, true, true)).toBe('sit');
  });
});

describe('peekSlots', () => {
  it('has three slots normally and two beside DL', () => {
    expect(peekSlots(false)).toHaveLength(3);
    expect(peekSlots(true)).toHaveLength(2);
  });
});

describe('weather helpers', () => {
  it('breath puffs for the first 45% of a 2.6 s cycle', () => {
    expect(puff(0, 0)).toBe(0);
    expect(puff(1300, 0)).toBeNull();
    expect(puff(2600, 0)).toBe(0);
  });
  it('warm wash only in summer and autumn without snow', () => {
    expect(seasonWash('spring', false)).toBeNull();
    expect(seasonWash('summer', false)).not.toBeNull();
    expect(seasonWash('autumn', true)).toBeNull();
  });
});

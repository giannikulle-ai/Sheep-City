// Small life: the butterflies' drift, the bird's visit, and the fireflies that only move while
// Digital Luna fetches, ported from the prototype's `tickLife` and its fetch branch.
import { describe, expect, it } from 'vitest';
import { FLOWERS, POSTS } from '../src/geometry';
import { applyIntent } from '../src/intents';
import { landBird, tickBird, tickButterflies } from '../src/life';
import { createRng, nextFloat } from '../src/rng';
import { RULES, TICK_MS, TICK_SEC } from '../src/rules';
import { createInitialState, type SimState } from '../src/state';
import { step } from '../src/step';
import { tickInPlace } from '../src/tick';
import { rain, run, runUntil, world } from './luna-helpers';
import { atLeast, below, between, rngWhereFloats, settle } from './sheep-helpers';

/** DL parked in the barn and the flock parked and ridden: the small life's draws are the tick's only draws. */
function still(options: Parameters<typeof world>[0] = {}): SimState {
  const s = settle(world(options));
  s.luna.inBarn = true;
  for (const q of s.sheep) q.ridden = true;
  return s;
}

describe('butterflies', () => {
  it('start at their flower and drift around it: `p += dt`, two sines across, a cosine up', () => {
    const s = createInitialState(7);
    expect(s.life.bflies.map((b) => b.home)).toEqual([FLOWERS[0], FLOWERS[1]]);
    expect(s.life.bflies.map((b) => [b.x, b.y])).toEqual([[FLOWERS[0]![0], FLOWERS[0]![1]], [FLOWERS[1]![0], FLOWERS[1]![1]]]);
    const p0 = s.life.bflies.map((b) => b.p);
    for (let i = 0; i < 25; i++) tickInPlace(s);
    s.life.bflies.forEach((b, i) => {
      let p = p0[i]!;
      for (let k = 0; k < 25; k++) p += TICK_SEC;
      expect(b.p).toBe(p);
      expect(b.x).toBe(b.home[0] + Math.sin(p * 0.9) * 14 + Math.sin(p * 2.3) * 4);
      expect(b.y).toBe(b.home[1] - 14 + Math.cos(p * 1.4) * 8);
    });
  });

  it('draw nothing from the generator', () => {
    const s = createInitialState(7);
    const before = s.rng.s;
    tickButterflies(s);
    expect(s.rng.s).toBe(before);
  });
});

describe('the bird', () => {
  it('rolls dt * .03 each tick it is away and not raining; the post is one draw more', () => {
    const s = still();
    s.rng = rngWhereFloats([atLeast(TICK_SEC * 0.03)]);
    tickBird(s);
    expect(s.life.bird).toBeNull();
    // Passes, then POSTS[floor(r * 4)] with r in [.5, .75): the third post.
    s.rng = rngWhereFloats([below(TICK_SEC * 0.03), between(0.5, 0.75)]);
    const now = s.clock.nowMs;
    tickBird(s);
    const b = s.life.bird!;
    expect([b.tx, b.ty]).toEqual([POSTS[2]![0] - 4, POSTS[2]![1] - 6]);
    expect(b.state).toBe('in');
    expect(b.t0Ms).toBe(now);
    // Started at (660, 20) and already 9 px (90 px/s over the tick) down the line in the same tick.
    const d0 = Math.hypot(b.tx - 660, b.ty - 20);
    expect(Math.hypot(b.tx - b.x, b.ty - b.y)).toBeCloseTo(d0 - 90 * TICK_SEC, 6);
  });

  it('never sets off in the rain', () => {
    const s = still({ weather: 'rain' });
    s.rng = rngWhereFloats([below(TICK_SEC * 0.03)]);
    const before = s.rng.s;
    tickBird(s);
    expect(s.life.bird).toBeNull();
    expect(s.rng.s).toBe(before); // no roll either
  });

  it('flies in at 90 px/s in prototype-sized frames and lands within 2 px of the post', () => {
    const s = still();
    landBird(s);
    const b = s.life.bird!;
    let d = Math.hypot(b.tx - b.x, b.ty - b.y);
    let ticks = 0;
    while (b.state === 'in') {
      tickInPlace(s);
      ticks++;
      const nd = Math.hypot(b.tx - b.x, b.ty - b.y);
      if (b.state === 'in') expect(d - nd).toBeCloseTo(90 * TICK_SEC, 6);
      d = nd;
      expect(ticks).toBeLessThan(200);
    }
    expect(b.state).toBe('sit');
    expect(d).toBeLessThan(2);
    // The last step was frames of dt / moveSubsteps, so it stopped short of the post, not on top of it.
    expect(d).toBeGreaterThan(0);
    expect(b.t0Ms).toBe(s.clock.nowMs);
    expect(ticks).toBe(Math.ceil((Math.hypot(b.tx - 660, b.ty - 20) - 2) / (90 * TICK_SEC / RULES.moveSubsteps) / RULES.moveSubsteps));
  });

  it('sits at least 4 s and at most 7 s: one roll per tick against a fresh stay', () => {
    const s = still();
    landBird(s);
    runUntil(s, (w) => w.life.bird!.state === 'sit', 200);
    const landed = s.clock.nowMs;
    // `tickBird` alone, with the clock moved by hand, so the rolls are the only thing that varies.
    const later = (w: SimState) => (w.clock = { ...w.clock, nowMs: w.clock.nowMs + TICK_MS });
    // Every roll high: still there 4 s in, because 4000 + r * 3000 is above the time sat.
    for (let i = 0; i < 40; i++) {
      later(s);
      s.rng = rngWhereFloats([atLeast(0.99)]);
      tickBird(s);
      expect(s.life.bird!.state).toBe('sit');
    }
    expect(s.clock.nowMs - landed).toBe(4000);
    // A roll low enough and it goes, but not at 4.0 s: 4000 > 4000 + .0003 is false.
    s.rng = rngWhereFloats([below(0.0001)]);
    tickBird(s);
    expect(s.life.bird!.state).toBe('sit');
    later(s);
    s.rng = rngWhereFloats([below(0.0001)]);
    tickBird(s);
    expect(s.life.bird!.state).toBe('out');

    // Whatever the rolls, 7 s is the most it sits.
    const t = still();
    landBird(t);
    runUntil(t, (w) => w.life.bird!.state === 'sit', 200);
    const at = t.clock.nowMs;
    for (let i = 0; i < 69; i++) {
      later(t);
      t.rng = rngWhereFloats([atLeast(0.999)]);
      tickBird(t);
      expect(t.life.bird!.state).toBe('sit');
    }
    later(t);
    expect(t.clock.nowMs - at).toBe(7000);
    t.rng = rngWhereFloats([atLeast(0.999)]); // a stay of 6997 ms or more, always under 7000
    tickBird(t);
    expect(t.life.bird!.state).toBe('out');
  });

  it('rain sends a sitting bird off at once (the stay is still rolled first, as the prototype evaluates it)', () => {
    const s = still();
    landBird(s);
    runUntil(s, (w) => w.life.bird!.state === 'sit', 200);
    rain(s, true);
    const before = s.rng.s;
    tickBird(s);
    expect(s.life.bird!.state).toBe('out');
    expect(s.rng.s).toBe(nextFloatState(before));
  });

  it('flies out up and to the right at 80 by 60 px/s and is cleared past y = -10', () => {
    const s = still();
    s.life.bird = { x: 200, y: 50, tx: 200, ty: 50, state: 'out', t0Ms: 0 };
    tickInPlace(s);
    expect(s.life.bird).toMatchObject({ x: 208, y: 44, state: 'out' });
    const ticks = runUntil(s, (w) => w.life.bird === null, 100);
    // y goes 44, 38, ... the first tick below -10 is the eleventh: 50 - 6 * 11 = -16.
    expect(ticks).toBe(10);
  });

  it('the "a bird lands" action starts one, and replaces a bird already there', () => {
    const s = still();
    applyIntent(s, { type: 'farmAction', action: 'bird' });
    const first = s.life.bird!;
    expect(first).toMatchObject({ x: 660, y: 20, state: 'in', t0Ms: s.clock.nowMs });
    expect(POSTS.some((p) => p[0] - 4 === first.tx && p[1] - 6 === first.ty)).toBe(true);
    runUntil(s, (w) => w.life.bird!.state === 'sit', 200);
    applyIntent(s, { type: 'farmAction', action: 'bird' });
    expect(s.life.bird).not.toBe(first);
    expect(s.life.bird).toMatchObject({ x: 660, y: 20, state: 'in' });
  });

  it('over a long sunny spell a bird comes and goes, and never in the rain', () => {
    const s = still();
    s.clock = { ...s.clock, paused: false };
    let visits = 0;
    let was: string | null = null;
    for (let i = 0; i < 6000; i++) {
      tickInPlace(s);
      const now = s.life.bird?.state ?? null;
      if (now === 'sit' && was !== 'sit') visits++;
      was = now;
    }
    expect(visits).toBeGreaterThan(3);
    const r = still({ weather: 'rain' });
    for (let i = 0; i < 3000; i++) {
      tickInPlace(r);
      expect(r.life.bird).toBeNull();
    }
  });
});

describe('fireflies', () => {
  it('stand still until DL fetches; only the fetch branch wobbles them, as in the prototype', () => {
    const s = world();
    const before = s.life.flies.map((f) => ({ ...f }));
    run(s, 50);
    expect(s.life.flies).toEqual(before);
    applyIntent(s, { type: 'throwStick', x: 450, y: 250 });
    tickInPlace(s);
    expect(s.luna.stick).not.toBeNull();
    s.life.flies.forEach((f, i) => {
      const b = before[i]!;
      const p = b.p + TICK_SEC * b.s;
      expect(f.p).toBe(p);
      expect(f.x).toBe(b.x + Math.sin(p * 1.3) * 6 * TICK_SEC);
      expect(f.y).toBe(b.y + Math.cos(p * 0.9) * 4 * TICK_SEC);
    });
    // And they stop again the tick the stick is dropped.
    let t = s;
    for (let i = 0; i < 200 && t.luna.stick; i++) t = step(t, [], TICK_MS);
    expect(t.luna.stick).toBeNull();
    const after = t.life.flies.map((f) => ({ ...f }));
    expect(step(t, [], 5000).life.flies).toEqual(after);
  });
});

/** The generator state after one float from `state`. */
function nextFloatState(state: number): number {
  const r = createRng(state);
  nextFloat(r);
  return r.s;
}

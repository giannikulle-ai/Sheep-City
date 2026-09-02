// Lambs: birth odds when settled, following the mother, growing into a named sheep, the flock cap.
import { describe, expect, it } from 'vitest';
import { SFOOT } from '../src/geometry';
import { applyIntent } from '../src/intents';
import { RULES, TICK_MS, TICK_SEC } from '../src/rules';
import { NAMES, createInitialState } from '../src/state';
import { tickInPlace } from '../src/tick';
import { rain, run, runUntil, world } from './luna-helpers';
import { atLeast, below, flockOf, rngWhereFloats, settle } from './sheep-helpers';

const BIRTH = below(RULES.lambChancePerSec * TICK_SEC);

/**
 * One sheep, ridden, so the needs gate and the eat roll are skipped and its first draw each tick
 * is the birth roll. The other four are taken off the field (the name index stays at 5).
 */
function quiet() {
  const s = settle(world());
  s.luna.x = 40;
  s.luna.y = 320;
  s.sheep = [s.sheep[0]!];
  s.sheep[0]!.ridden = true;
  return s;
}

/** Five settled, ridden sheep. */
function flock() {
  const s = settle(world());
  s.luna.x = 40;
  s.luna.y = 320;
  for (const q of s.sheep) q.ridden = true;
  return s;
}

describe('birth', () => {
  it('a settled sheep with no lamb rolls dt * .002 each tick; the lamb appears behind it', () => {
    const s = quiet();
    const q = s.sheep[0]!;
    s.rng = rngWhereFloats([atLeast(RULES.lambChancePerSec * TICK_SEC)]);
    run(s, 1);
    expect(q.lambs).toEqual([]);
    s.rng = rngWhereFloats([BIRTH]);
    run(s, 1);
    expect(q.lambs).toHaveLength(1);
    const l = q.lambs[0]!;
    expect(l.bornMs).toBe(s.clock.nowMs);
    expect(l.grown).toBe(false);
    expect(l.dir).toBe(q.dir);
    // Born at (x - 18, y + 8) and already eased one tick towards its trailing spot.
    expect(Math.abs(l.x - (q.x - 18))).toBeLessThan(1);
    expect(Math.abs(l.y - (q.y + 8))).toBeLessThan(1);
  });

  it('one lamb per sheep: no roll while a lamb is in tow', () => {
    const s = quiet();
    s.sheep[0]!.lambs.push({ x: 0, y: 0, dir: 1, bornMs: 0, grown: false });
    s.rng = rngWhereFloats([BIRTH]);
    const before = s.rng.s;
    run(s, 1);
    expect(s.sheep[0]!.lambs).toHaveLength(1);
    expect(s.rng.s).toBe(before);
  });

  it('the flock caps at flockCap sheep plus lambs: at the cap no roll is made', () => {
    const s = settle(world({ sheep: RULES.flockCap }));
    for (const q of s.sheep) q.ridden = true;
    s.rng = rngWhereFloats([BIRTH]);
    const before = s.rng.s;
    run(s, 1);
    expect(s.sheep.every((q) => q.lambs.length === 0)).toBe(true);
    expect(s.rng.s).toBe(before);
    // Five sheep and four lambs is nine too: the fifth, lamb-less sheep makes no roll either.
    const t = flock();
    for (let i = 0; i < 4; i++) applyIntent(t, { type: 'farmAction', action: 'lamb' });
    expect(flockOf(t)).toBe(RULES.flockCap);
    expect(t.sheep[4]!.lambs).toEqual([]);
    t.rng = rngWhereFloats([BIRTH]);
    const state = t.rng.s;
    run(t, 1);
    expect(flockOf(t)).toBe(RULES.flockCap);
    expect(t.rng.s).toBe(state);
  });

  it('no births in rain (the lamb section is inside the fair-weather branch)', () => {
    const s = quiet();
    rain(s, true);
    s.rng = rngWhereFloats([atLeast(0.5), BIRTH]); // the shelter path's x jitter, then what would be the birth roll
    run(s, 1);
    expect(s.sheep[0]!.lambs).toEqual([]);
  });

  it('over a long spell the flock fills to the cap and never passes it', () => {
    const s = settle(world({ seed: 3 }));
    s.clock = { ...s.clock, paused: false };
    let max = 0;
    for (let i = 0; i < 30000; i++) {
      tickInPlace(s);
      max = Math.max(max, flockOf(s));
      expect(flockOf(s)).toBeLessThanOrEqual(RULES.flockCap);
    }
    expect(max).toBe(RULES.flockCap);
    expect(s.sheep.length).toBeGreaterThan(5);
  });
});

describe('following and growing up', () => {
  it('a lamb eases towards the spot 18 px behind its mother at rate 3/s; a second lamb would trail the first', () => {
    const s = quiet();
    const q = s.sheep[0]!;
    q.dir = 1;
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    const l = q.lambs[0]!;
    l.x = q.x - 60;
    l.y = q.y + 40;
    const dx0 = l.x - (q.x - 18);
    run(s, 1);
    expect(l.x - (q.x - 18)).toBeCloseTo(dx0 * (1 - 3 * TICK_SEC), 9);
    expect(l.dir).toBe(q.dir);
    run(s, 40);
    expect(Math.abs(l.x - (q.x - 18))).toBeLessThan(0.05);
    expect(Math.abs(l.y - (q.y + 8))).toBeLessThan(0.05);
    // The mother turns: the lamb's spot flips to the other side.
    q.dir = -1;
    run(s, 40);
    expect(Math.abs(l.x - (q.x + 18))).toBeLessThan(0.05);
  });

  it('after lambGrowMs the lamb becomes the next named sheep, shorn, standing where the lamb was', () => {
    const s = quiet();
    const q = s.sheep[0]!;
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    const born = s.clock.nowMs;
    expect(s.nameIdx).toBe(5);
    run(s, RULES.lambGrowMs / TICK_MS);
    expect(q.lambs).toHaveLength(1);
    expect(s.sheep).toHaveLength(1);
    const at = { x: q.lambs[0]!.x, y: q.lambs[0]!.y };
    run(s, 1);
    expect(s.clock.nowMs - born).toBe(RULES.lambGrowMs + TICK_MS);
    expect(q.lambs).toEqual([]);
    expect(s.sheep).toHaveLength(2);
    const ns = s.sheep[1]!;
    expect(ns.id).toBe('sheep-5');
    expect(ns.name).toBe(NAMES[5]);
    expect(ns.name).toBe('Willow');
    expect(ns.wool).toBeCloseTo(RULES.sheep.shornWool + TICK_SEC / RULES.woolGrowSec, 9); // it grew one tick's fleece already
    expect(ns.x + SFOOT[0]).toBeCloseTo(at.x + 10, 6);
    expect(ns.y + SFOOT[1]).toBeCloseTo(at.y + 12, 6);
    expect(s.nameIdx).toBe(6);
    // The next one is Poppy.
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    run(s, RULES.lambGrowMs / TICK_MS + 1);
    expect(s.sheep[2]!.name).toBe('Poppy');
    expect(s.sheep[2]!.id).toBe('sheep-6');
  });

  it('the new sheep is ticked in the same step it is born, as the prototype’s for-of did', () => {
    const s = quiet();
    const q = s.sheep[0]!;
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    run(s, RULES.lambGrowMs / TICK_MS);
    const at = { x: q.lambs[0]!.x, y: q.lambs[0]!.y };
    // Rain: the new sheep's own shelter chain runs this tick, so it is already walking to the door.
    rain(s, true);
    run(s, 1);
    // Rain also blocks growing up; it grows the tick after the rain stops.
    expect(q.lambs).toHaveLength(1);
    rain(s, false);
    run(s, 1);
    expect(s.sheep).toHaveLength(2);
    const ns = s.sheep[1]!;
    expect(ns.x + SFOOT[0]).not.toBe(at.x + 10); // it took its first step at once
    expect(ns.wool).toBeCloseTo(RULES.sheep.shornWool + TICK_SEC / RULES.woolGrowSec, 9); // and grew its first tick's fleece
  });

  it('growing up waits for fair weather (the lamb section is inside the fair-weather branch)', () => {
    const s = quiet();
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    rain(s, true);
    run(s, RULES.lambGrowMs / TICK_MS + 50);
    expect(s.sheep[0]!.lambs).toHaveLength(1);
    expect(s.sheep[0]!.lambs[0]!.grown).toBe(false);
    rain(s, false);
    run(s, 1);
    expect(s.sheep[0]!.lambs).toEqual([]);
    expect(s.sheep).toHaveLength(2);
  });

  it('a fresh world names lambs from the flock size on, so ids stay unique for the bench flock', () => {
    expect(createInitialState(1).nameIdx).toBe(5);
    expect(createInitialState(1, { sheep: 40 }).nameIdx).toBe(40);
  });
});

describe('the lamb action', () => {
  it('gives the first lamb-less sheep on the field a lamb, cap or no cap (as the prototype’s action)', () => {
    const s = settle(world());
    s.sheep[0]!.inBarn = true;
    applyIntent(s, { type: 'farmAction', action: 'lamb' });
    expect(s.sheep[0]!.lambs).toEqual([]);
    expect(s.sheep[1]!.lambs).toHaveLength(1);
    const cap = settle(world({ sheep: RULES.flockCap }));
    applyIntent(cap, { type: 'farmAction', action: 'lamb' });
    expect(flockOf(cap)).toBe(RULES.flockCap + 1);
    expect(runUntil(cap, () => true, 1)).toBe(1);
  });
});

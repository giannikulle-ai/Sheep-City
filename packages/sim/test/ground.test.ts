// Ground stamps: footprints in snow and mud in rain under every walker, the melt, the fades and
// the caps, ported from the prototype's `stampGround` and `tickGround`.
import { describe, expect, it } from 'vitest';
import { setPath } from '../src/behaviours/sheep';
import { LFOOT, SFOOT } from '../src/geometry';
import { groundSnowy, MELT_MUD_CAP, MUD_CAP, MUD_FADE_MS, MUD_FADE_RAIN_MS, PRINT_CAP, stampGround, tickGround } from '../src/ground';
import { applyIntent } from '../src/intents';
import { createRng } from '../src/rng';
import { type Sheep, type SimState } from '../src/state';
import { tick, tickInPlace } from '../src/tick';
import { run, runUntil, world } from './luna-helpers';
import { atLeast, below, rngWhereFloats, settle } from './sheep-helpers';

/** One parked sheep on an empty field, DL in the barn, the clock stopped: nothing else leaves a mark. */
function lone(options: Parameters<typeof world>[0] = {}): { s: SimState; q: Sheep } {
  const s = settle(world(options));
  s.sheep = [s.sheep[0]!];
  const q = s.sheep[0]!;
  q.x = 200 - SFOOT[0];
  q.y = 250 - SFOOT[1];
  s.luna.inBarn = true;
  return { s, q };
}

describe('snowy ground', () => {
  it('is snow, or winter whatever the weather; never a spring shower', () => {
    expect(groundSnowy(world({ weather: 'snow' }))).toBe(true);
    expect(groundSnowy(world({ weather: 'sun', season: 'spring' }))).toBe(false);
    expect(groundSnowy(world({ weather: 'rain', season: 'spring' }))).toBe(false);
    expect(groundSnowy(world({ weather: 'sun', season: 'winter' }))).toBe(true);
    expect(groundSnowy(world({ weather: 'rain', season: 'winter' }))).toBe(true);
  });
});

describe('stampGround', () => {
  const foot = [10, 20] as const;
  const walker = (x: number, y: number) => ({ x, y, lastStamp: null as { x: number; y: number } | null, stampSide: false });

  it('prints in snow every 7 px of foot travel, on alternating sides, one pixel above the foot', () => {
    const s = world({ weather: 'snow' });
    const o = walker(100, 100);
    stampGround(s, o, foot, 1000, true);
    expect(o.lastStamp).toEqual({ x: 110, y: 120 });
    expect(o.stampSide).toBe(true);
    expect(s.ground.prints).toEqual([{ x: 107, y: 119, tMs: 1000 }]);
    o.x += 6.9;
    stampGround(s, o, foot, 1100, true);
    expect(s.ground.prints).toHaveLength(1); // not 7 px yet
    o.x += 0.1;
    stampGround(s, o, foot, 1200, true);
    expect(o.stampSide).toBe(false);
    expect(s.ground.prints[1]).toEqual({ x: 117 + 3, y: 119, tMs: 1200 });
  });

  it('mud in rain, radius 3 to 6 from one draw; nothing when dry, though the gate and the side still move', () => {
    const s = world({ weather: 'rain' });
    s.rng = rngWhereFloats([atLeast(0.5)]);
    const o = walker(100, 100);
    stampGround(s, o, foot, 1000, false);
    expect(s.ground.mud).toHaveLength(1);
    expect(s.ground.mud[0]).toMatchObject({ x: 110, y: 119, tMs: 1000 });
    expect(s.ground.mud[0]!.r).toBeGreaterThanOrEqual(4.5);
    expect(s.ground.mud[0]!.r).toBeLessThan(6);
    expect(s.ground.prints).toEqual([]);

    const d = world({ weather: 'sun' });
    const before = d.rng.s;
    const p = walker(100, 100);
    stampGround(d, p, foot, 1000, false);
    expect(d.ground.mud).toEqual([]);
    expect(d.ground.prints).toEqual([]);
    expect(d.rng.s).toBe(before);
    expect(p.lastStamp).toEqual({ x: 110, y: 120 });
    expect(p.stampSide).toBe(true);
  });

  it('in a winter shower the ground is snowy, so a walker leaves prints, not mud', () => {
    const s = world({ weather: 'rain', season: 'winter' });
    const o = walker(100, 100);
    stampGround(s, o, foot, 1000, groundSnowy(s));
    expect(s.ground.prints).toHaveLength(1);
    expect(s.ground.mud).toEqual([]);
  });

  it('keeps the newest 600 prints and the newest 220 mud patches', () => {
    const s = world({ weather: 'snow' });
    const o = walker(0, 0);
    for (let i = 0; i <= PRINT_CAP; i++) {
      o.x = i * 8;
      stampGround(s, o, foot, i, true);
    }
    expect(s.ground.prints).toHaveLength(PRINT_CAP);
    expect(s.ground.prints[0]!.tMs).toBe(1);
    const r = world({ weather: 'rain' });
    const p = walker(0, 0);
    for (let i = 0; i <= MUD_CAP; i++) {
      p.x = i * 8;
      stampGround(r, p, foot, i, false);
    }
    expect(r.ground.mud).toHaveLength(MUD_CAP);
    expect(r.ground.mud[0]!.tMs).toBe(1);
  });
});

describe('tickGround', () => {
  it('on the tick the snow goes, 35% of the prints melt into mud of radius 4 to 8 and the rest vanish', () => {
    const s = world({ weather: 'sun' });
    s.ground.wasSnowy = true;
    s.ground.prints = [
      { x: 1, y: 2, tMs: 0 },
      { x: 3, y: 4, tMs: 0 },
      { x: 5, y: 6, tMs: 0 },
    ];
    // Three rolls: the first melts (radius from the next float), the second does not, the third melts.
    s.rng = rngWhereFloats([below(0.35), atLeast(0.5), atLeast(0.35), below(0.35), below(0.25)]);
    s.clock = { ...s.clock, nowMs: 5000 };
    tickGround(s, false);
    expect(s.ground.prints).toEqual([]);
    expect(s.ground.mud).toHaveLength(2);
    expect(s.ground.mud[0]).toMatchObject({ x: 1, y: 2, tMs: 5000 });
    expect(s.ground.mud[0]!.r).toBeGreaterThanOrEqual(6);
    expect(s.ground.mud[1]).toMatchObject({ x: 5, y: 6, tMs: 5000 });
    expect(s.ground.mud[1]!.r).toBeLessThan(5);
    expect(s.ground.wasSnowy).toBe(false);
  });

  it('no melt without a change: prints simply clear when the ground is not snowy, and stay when it is', () => {
    const s = world({ weather: 'sun' });
    s.ground.prints = [{ x: 1, y: 2, tMs: 0 }];
    const before = s.rng.s;
    tickGround(s, false);
    expect(s.ground.prints).toEqual([]);
    expect(s.ground.mud).toEqual([]);
    expect(s.rng.s).toBe(before);
    const w = world({ weather: 'snow' });
    w.ground.prints = [{ x: 1, y: 2, tMs: 0 }];
    tickGround(w, true);
    expect(w.ground.prints).toHaveLength(1);
    expect(w.ground.wasSnowy).toBe(true);
  });

  it('a melt keeps at most the newest 260 mud patches', () => {
    const s = world({ weather: 'sun' });
    s.ground.wasSnowy = true;
    for (let i = 0; i < 250; i++) s.ground.mud.push({ x: i, y: 0, tMs: 0, r: 5 });
    for (let i = 0; i < PRINT_CAP; i++) s.ground.prints.push({ x: 1000 + i, y: 0, tMs: 0 });
    s.rng = createRng(7);
    s.clock = { ...s.clock, nowMs: 5000 };
    tickGround(s, false);
    expect(s.ground.mud).toHaveLength(MELT_MUD_CAP);
    expect(s.ground.mud[MELT_MUD_CAP - 1]!.tMs).toBe(5000);
    expect(s.ground.mud.every((m) => m.tMs === 5000 || m.x >= 250 - MELT_MUD_CAP)).toBe(true);
  });

  it('mud fades after 240 s dry and 600 s in the rain, oldest first, order kept', () => {
    const s = world({ weather: 'sun' });
    s.clock = { ...s.clock, nowMs: 1_000_000 };
    const now = s.clock.nowMs;
    s.ground.mud = [
      { x: 1, y: 0, tMs: now - MUD_FADE_MS, r: 5 },
      { x: 2, y: 0, tMs: now - MUD_FADE_MS + 100, r: 5 },
      { x: 3, y: 0, tMs: now, r: 5 },
    ];
    tickGround(s, false);
    expect(s.ground.mud.map((m) => m.x)).toEqual([2, 3]);
    const r = world({ weather: 'rain' });
    r.clock = { ...r.clock, nowMs: 1_000_000 };
    r.ground.mud = [
      { x: 1, y: 0, tMs: now - MUD_FADE_RAIN_MS, r: 5 },
      { x: 2, y: 0, tMs: now - MUD_FADE_MS, r: 5 },
    ];
    tickGround(r, false);
    expect(r.ground.mud.map((m) => m.x)).toEqual([2]);
  });
});

describe('through the tick', () => {
  it('a sheep walking in rain leaves mud along its path, none while it stands or once in the barn', () => {
    const { s, q } = lone({ weather: 'rain' });
    q.shelter = true; // already sheltering, so the rain does not re-route it to the door
    setPath(q, [{ x: 400, y: 250 }]);
    run(s, 20);
    const n = s.ground.mud.length;
    expect(n).toBeGreaterThan(3);
    for (const m of s.ground.mud) expect(m.y).toBeCloseTo(249, 6);
    for (let i = 1; i < n; i++) expect(s.ground.mud[i]!.x - s.ground.mud[i - 1]!.x).toBeGreaterThanOrEqual(7);
    expect(q.lastStamp).not.toBeNull();
    runUntil(s, (w) => w.sheep[0]!.tx === null, 200);
    const arrived = s.ground.mud.length;
    run(s, 20);
    expect(s.ground.mud).toHaveLength(arrived);
    q.inBarn = true;
    setPath(q, [{ x: 200, y: 250 }]);
    run(s, 20);
    expect(s.ground.mud).toHaveLength(arrived);
  });

  it('a sheep walking in snow leaves prints that alternate sides and clear the moment the snow goes', () => {
    const { s, q } = lone({ weather: 'snow' });
    setPath(q, [{ x: 400, y: 250 }]);
    run(s, 20);
    const prints = s.ground.prints;
    expect(prints.length).toBeGreaterThan(3);
    for (let i = 1; i < prints.length; i++) {
      const gap = prints[i]!.x - prints[i - 1]!.x;
      // Feet 7 px apart or more, the print 3 px to one side then 3 px to the other.
      expect(Math.abs(gap - 7) < 6.5 || gap >= 7).toBe(true);
    }
    expect(prints.every((p) => p.y === 249)).toBe(true);
    expect(s.ground.wasSnowy).toBe(true);
    applyIntent(s, { type: 'setWeather', weather: 'sun' });
    tickInPlace(s);
    expect(s.ground.prints).toEqual([]);
    expect(s.ground.wasSnowy).toBe(false);
  });

  it('a winter field prints under a walker even with the sun out', () => {
    const { s, q } = lone({ weather: 'sun', season: 'winter' });
    setPath(q, [{ x: 400, y: 250 }]);
    run(s, 20);
    expect(s.ground.prints.length).toBeGreaterThan(3);
    expect(s.ground.mud).toEqual([]);
  });

  it('Digital Luna prints while she walks to a target, not from the barn or a sheep’s back', () => {
    const s = settle(world({ weather: 'snow' }));
    for (const q of s.sheep) q.ridden = true;
    s.luna.x = 300;
    s.luna.y = 250;
    applyIntent(s, { type: 'lunaAction', action: 'come' });
    run(s, 10);
    expect(s.ground.prints.length).toBeGreaterThan(0);
    expect(s.luna.lastStamp).not.toBeNull();
    // The first print is under her first 7 px of the walk from (300, 250): foot at (322, 288).
    expect(Math.abs(s.ground.prints[0]!.x - (300 + LFOOT[0]))).toBeLessThan(12);
    expect(Math.abs(s.ground.prints[0]!.y - (250 + LFOOT[1] - 1))).toBeLessThan(10);

    // In the barn she stays only while it rains (snow sends her back out), so the barn case is a rainy one.
    const b = settle(world({ weather: 'rain' }));
    for (const q of b.sheep) q.inBarn = true;
    b.luna.inBarn = true;
    b.luna.target = { x: 300, y: 250 };
    run(b, 10);
    expect(b.luna.inBarn).toBe(true);
    expect(b.ground.mud).toEqual([]);
    expect(b.luna.lastStamp).toBeNull();

    const r = settle(world({ weather: 'snow' }));
    r.sheep.forEach((q, i) => (q.ridden = i !== 0));
    r.luna.x = r.sheep[0]!.x;
    r.luna.y = r.sheep[0]!.y;
    applyIntent(r, { type: 'lunaAction', action: 'ride' });
    runUntil(r, (w) => w.luna.riding !== null, 200);
    r.luna.rideUntilMs = 1e9; // the button's ride would end inside the 100 ticks below
    const mounted = JSON.stringify(r.luna.lastStamp);
    // The mount wanders under her and prints; her own stamp gate does not move while she rides.
    run(r, 100);
    expect(r.luna.riding).not.toBeNull();
    expect(JSON.stringify(r.luna.lastStamp)).toBe(mounted);
    expect(r.sheep[0]!.lastStamp).not.toBeNull();
  });

  it('a fetch tick moves the bird and the butterflies but leaves the ground alone, as the prototype returns before tickGround', () => {
    const s = settle(world({ weather: 'snow' }));
    for (const q of s.sheep) q.ridden = true;
    s.luna.x = 100;
    s.luna.y = 300;
    s.ground.prints.push({ x: 1, y: 2, tMs: 0 });
    tickInPlace(s);
    expect(s.ground.wasSnowy).toBe(true);
    const bfly = s.life.bflies[0]!.p;
    applyIntent(s, { type: 'throwStick', x: 560, y: 220 });
    applyIntent(s, { type: 'setWeather', weather: 'sun' });
    tickInPlace(s);
    expect(s.luna.stick).not.toBeNull();
    expect(s.life.bflies[0]!.p).toBeGreaterThan(bfly);
    // No tickGround: the print survives un-snowy ground and wasSnowy is stale, until the stick is dropped.
    expect(s.ground.prints).toHaveLength(1);
    expect(s.ground.wasSnowy).toBe(true);
    run(s, 5);
    expect(s.luna.stick).not.toBeNull();
    expect(s.ground.prints).toHaveLength(1);
    runUntil(s, (w) => w.luna.stick === null, 400);
    // The tick that drops the stick is still a fetch tick: the ground catches up on the next one.
    expect(s.ground.prints).toHaveLength(1);
    expect(s.ground.wasSnowy).toBe(true);
    tickInPlace(s);
    expect(s.ground.prints).toEqual([]);
    expect(s.ground.wasSnowy).toBe(false);
  });

  it('a tick never touches its input, stamps included', () => {
    const { s, q } = lone({ weather: 'rain' });
    q.shelter = true;
    setPath(q, [{ x: 400, y: 250 }]);
    run(s, 10);
    const frozen = JSON.stringify(s.ground);
    const stampBefore = JSON.stringify(q.lastStamp);
    let next = s;
    for (let i = 0; i < 10; i++) next = tick(next);
    expect(JSON.stringify(s.ground)).toBe(frozen);
    expect(JSON.stringify(q.lastStamp)).toBe(stampBefore);
    expect(next.ground.mud.length).toBeGreaterThan(s.ground.mud.length);
    expect(next.ground.mud[0]).not.toBe(s.ground.mud[0]); // copied, not shared
    expect(next.clock.tick).toBe(s.clock.tick + 10);
  });
});

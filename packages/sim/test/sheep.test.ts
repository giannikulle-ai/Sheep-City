// The sheep needs loop, one test per rule, ported from the prototype's sheep block. Where the
// prototype is odd the test says so and pins the odd behaviour.
import { describe, expect, it } from 'vitest';
import { NEEDS, SHEEP_BEHAVIOURS, pickNeed, sheepContext } from '../src/behaviours/sheep';
import { SFOOT, SPOT, insideField, randomFoot } from '../src/geometry';
import { applyIntent } from '../src/intents';
import { cloneRng, nextFloat } from '../src/rng';
import { RULES, TICK_MS, TICK_SEC } from '../src/rules';
import type { SimState } from '../src/state';
import { tickInPlace } from '../src/tick';
import { rain, run, runUntil, world } from './luna-helpers';
import { atLeast, below, between, describeSheep, rngWhereFloats, settle } from './sheep-helpers';

const S = RULES.sheep;
const GATE = below(S.needRollPerSec * TICK_SEC);
const { graze, hay, drink, rest } = S.pick;

/** A calm world with every sheep parked and DL out of the way. */
function calm(options: Parameters<typeof world>[0] = {}): SimState {
  const s = settle(world(options));
  s.luna.x = 40;
  s.luna.y = 320;
  return s;
}

/** Load the dice so the first sheep passes the gate and its pick lands in [lo, hi). */
function armPick(s: SimState, lo: number, hi: number, ...more: ((r: number) => boolean)[]): SimState {
  s.rng = rngWhereFloats([GATE, between(lo, hi), ...more]);
  return s;
}

function first(s: SimState) {
  return s.sheep[0]!;
}

describe('the registry holds the sheep block in the prototype’s order', () => {
  it('shelter, rest, needs, eat, lambs, then the movement pass', () => {
    expect(SHEEP_BEHAVIOURS.chains()).toEqual(['shelter', 'rest', 'needs', 'eat', 'lambs', 'move']);
    expect(SHEEP_BEHAVIOURS.behaviours('shelter').map((b) => b.id)).toEqual(['rainShelter', 'leaveShelter']);
    expect(SHEEP_BEHAVIOURS.behaviours('rest').map((b) => b.id)).toEqual(['nightRest', 'wake']);
    expect(SHEEP_BEHAVIOURS.behaviours('needs').map((b) => b.id)).toEqual(['pickNeed']);
    expect(SHEEP_BEHAVIOURS.behaviours('eat').map((b) => b.id)).toEqual(['eat']);
    expect(SHEEP_BEHAVIOURS.behaviours('lambs').map((b) => b.id)).toEqual(['lambs']);
    expect(SHEEP_BEHAVIOURS.behaviours('move').map((b) => b.id)).toEqual(['walk']);
  });

  it('the needs pick is one weighted roll: graze .5, hay .12, drink .10, rest .08, wander .20', () => {
    expect(NEEDS.behaviours().map((b) => [b.id, b.weight])).toEqual([
      ['graze', 0.5],
      ['hay', 0.12],
      ['drink', 0.1],
      ['rest', 0.08],
      ['wander', 0.2],
    ]);
  });
});

describe('the needs gate', () => {
  it('a settled, awake, unridden sheep by day rolls dt * .14; the roll is in the condition', () => {
    const s = calm();
    const q = first(s);
    s.rng = rngWhereFloats([GATE]);
    expect(pickNeed.condition(sheepContext(s), q)).toBe(true);
    s.rng = rngWhereFloats([atLeast(S.needRollPerSec * TICK_SEC)]);
    expect(pickNeed.condition(sheepContext(s), q)).toBe(false);
    // Each blocker stops the roll before it is made.
    for (const block of [
      (w: SimState) => (w.sheep[0]!.resting = true),
      (w: SimState) => (w.sheep[0]!.eating = true),
      (w: SimState) => (w.sheep[0]!.ridden = true),
      (w: SimState) => (w.sheep[0]!.tx = 100),
    ]) {
      const w = calm();
      block(w);
      w.rng = rngWhereFloats([GATE]);
      const before = w.rng.s;
      expect(pickNeed.condition(sheepContext(w), w.sheep[0]!)).toBe(false);
      expect(w.rng.s).toBe(before);
    }
    const night = calm({ t: 0.7 });
    night.rng = rngWhereFloats([GATE]);
    expect(pickNeed.condition(sheepContext(night), night.sheep[0]!)).toBe(false);
    const wet = calm({ weather: 'rain' });
    wet.rng = rngWhereFloats([GATE]);
    expect(pickNeed.condition(sheepContext(wet), wet.sheep[0]!)).toBe(false);
  });

  it('over a long calm day the pick rate is about .14 per second', () => {
    const s = calm({ seed: 3 });
    let picks = 0;
    for (let i = 0; i < 20000; i++) {
      settle(s);
      tickInPlace(s);
      if (first(s).tx !== null || first(s).resting) picks++;
    }
    // 20,000 ticks is 2,000 s: expect about 280 picks. Seeded, so the count is fixed.
    expect(picks).toBeGreaterThan(230);
    expect(picks).toBeLessThan(330);
  });
});

describe('the pick', () => {
  it('graze: claims the nearest tall tuft and walks to stand beside it, facing side out', () => {
    const s = calm();
    const q = first(s);
    armPick(s, 0, graze);
    run(s, 1);
    expect(q.tuft).not.toBeNull();
    const t = s.tufts[q.tuft!]!;
    expect(t.claimed).toBe(q.id);
    expect(t.level).toBeGreaterThanOrEqual(S.tuftMinLevel);
    expect(q.hayTrip).toBe(false);
    expect(q.wander).toBe(1);
    expect(q.path).toEqual([]);
    // One leg: the target was set to (t.x -/+ 16, t.y + 2) and then walked one tick.
    expect(describeSheep(q)).toBe('toTuft');
    const foot = { x: q.x + SFOOT[0], y: q.y + SFOOT[1] };
    for (const o of s.tufts) {
      if (o.level < S.tuftMinLevel || o === t) continue;
      expect(Math.hypot(o.x - foot.x, o.y - foot.y) + 3).toBeGreaterThanOrEqual(Math.hypot(t.x - foot.x, t.y - foot.y));
    }
  });

  it('a claimed tuft is exclusive: the next sheep skips it', () => {
    const s = calm();
    const a = first(s);
    const b = s.sheep[1]!;
    b.x = a.x;
    b.y = a.y;
    armPick(s, 0, graze);
    run(s, 1);
    const mine = a.tuft!;
    // Park b next to a with the same dice: it must pick a different tuft.
    settle(s);
    s.tufts[mine]!.claimed = a.id;
    a.tuft = mine;
    a.eating = true;
    // a draws its eat roll and its birth roll first, then b draws its gate and its pick.
    s.rng = rngWhereFloats([atLeast(0.9), atLeast(0.9), GATE, between(0, graze)]);
    run(s, 1);
    expect(b.tuft).not.toBeNull();
    expect(b.tuft).not.toBe(mine);
    expect(s.tufts[b.tuft!]!.claimed).toBe(b.id);
  });

  it('graze with no tall tuft free falls through to the hay trip, as the prototype’s ladder does', () => {
    const s = calm();
    for (const t of s.tufts) t.level = 0.2;
    armPick(s, 0, graze);
    run(s, 1);
    const q = first(s);
    expect(q.tuft).toBeNull();
    expect(q.hayTrip).toBe(true);
    expect(describeSheep(q)).toBe('toHay');
  });

  it('hay: a spot in front of the bale; drink: the trough’s side', () => {
    const h = calm();
    armPick(h, graze, graze + hay);
    const dice = cloneRng(h.rng);
    nextFloat(dice);
    nextFloat(dice);
    const jitter = nextFloat(dice);
    run(h, 1);
    expect(first(h).hayTrip).toBe(true);
    expect(first(h).wander).toBe(1);
    expect(first(h).ty).toBe(SPOT.hay.y + 10);
    expect(first(h).tx).toBeCloseTo(SPOT.hay.x - 20 + jitter * 12, 9);

    const d = calm();
    armPick(d, graze + hay, graze + hay + drink);
    run(d, 1);
    expect(first(d).drinkTrip).toBe(true);
    expect(first(d).tx).toBe(SPOT.trough.x + 16);
    expect(first(d).ty).toBe(SPOT.trough.y + 4);
    expect(describeSheep(first(d))).toBe('toTrough');
  });

  it('rest: the .08 band then a second roll of dt * 2; a failed second roll wanders instead (odd but kept)', () => {
    const lie = calm();
    armPick(lie, graze + hay + drink, graze + hay + drink + rest, below(S.restRollPerSec * TICK_SEC));
    run(lie, 1);
    expect(first(lie).resting).toBe(true);
    expect(first(lie).tx).toBeNull();

    const up = calm();
    armPick(up, graze + hay + drink, graze + hay + drink + rest, atLeast(S.restRollPerSec * TICK_SEC));
    run(up, 1);
    expect(first(up).resting).toBe(false);
    expect(describeSheep(first(up))).toBe('wander');
  });

  it('wander: a random standable foot point at the wander speed', () => {
    const s = calm();
    armPick(s, graze + hay + drink + rest, 1);
    const dice = cloneRng(s.rng);
    nextFloat(dice);
    nextFloat(dice);
    const f = randomFoot(dice);
    const q = first(s);
    const start = { x: q.x, y: q.y };
    run(s, 1);
    expect(q.wander).toBe(1);
    expect(describeSheep(q)).toBe('wander');
    // The target is clamped into the field first; a random foot already is.
    const walked = Math.hypot(q.x - start.x, q.y - start.y);
    expect(walked).toBeLessThanOrEqual(RULES.speed.sheepWander * TICK_SEC + 1e-9);
    const foot = { x: q.x + SFOOT[0], y: q.y + SFOOT[1] };
    const dist = Math.hypot(f.x - foot.x, f.y - foot.y);
    const startDist = Math.hypot(f.x - (start.x + SFOOT[0]), f.y - (start.y + SFOOT[1]));
    expect(dist).toBeLessThan(startDist);
  });

  it('snow huddle: the wander point is pulled two thirds of the way to the flock’s centre', () => {
    const s = calm({ weather: 'snow' });
    armPick(s, graze + hay + drink + rest, 1);
    const dice = cloneRng(s.rng);
    nextFloat(dice);
    nextFloat(dice);
    const f = randomFoot(dice);
    const cx = s.sheep.reduce((a, q) => a + q.x, 0) / s.sheep.length + SFOOT[0];
    const cy = s.sheep.reduce((a, q) => a + q.y, 0) / s.sheep.length + SFOOT[1];
    const q = first(s);
    // Read the target off the sheep before the walk moves it: run the shelter, rest, and needs chains by hand.
    const ctx = sheepContext(s);
    ctx.fx = q.x + SFOOT[0];
    ctx.fy = q.y + SFOOT[1];
    SHEEP_BEHAVIOURS.select(ctx, q, 'needs')!.tick(ctx, q);
    expect(q.tx).toBeCloseTo((f.x + cx * 2) / 3, 9);
    expect(q.ty).toBeCloseTo((f.y + cy * 2) / 3, 9);
    expect(q.wander).toBe(1);
  });
});

describe('walking, arriving, eating', () => {
  it('walks at 16 px/s to a need and 9 px/s when wandering, routed and clamped like DL', () => {
    const s = calm();
    const q = first(s);
    q.x = 100;
    q.y = 200;
    q.tx = 400;
    q.ty = 260;
    q.wander = 0;
    const before = q.x;
    run(s, 10);
    expect(q.x - before).toBeCloseTo(RULES.speed.sheepWalk * Math.cos(Math.atan2(260 - (200 + SFOOT[1]), 400 - (100 + SFOOT[0]))), 0);
    expect(q.dir).toBe(1);
    q.wander = 1;
    const mid = q.x;
    run(s, 10);
    expect(q.x - mid).toBeLessThan(RULES.speed.sheepWander + 0.5);
    expect(q.x - mid).toBeGreaterThan(RULES.speed.sheepWander * 0.6);
    expect(insideField(q.x + SFOOT[0], q.y + SFOOT[1], 0.98)).toBe(true);
  });

  it('arriving at a tuft turns the sheep to face it and starts eating; the bite is .07/s; the claim is released after', () => {
    const s = calm();
    const q = first(s);
    armPick(s, 0, graze);
    run(s, 1);
    const i = q.tuft!;
    const t = s.tufts[i]!;
    t.level = 1;
    runUntil(s, (w) => w.sheep[0]!.eating, 400);
    expect(q.tx).toBeNull();
    expect(q.wander).toBe(0);
    expect(q.dir).toBe(t.x > q.x + SFOOT[0] ? 1 : -1);
    expect(describeSheep(q)).toBe('graze');
    t.level = 0.9;
    const level = t.level;
    s.rng = rngWhereFloats([atLeast(0.5), atLeast(0.5), atLeast(0.5), atLeast(0.5), atLeast(0.5)]);
    run(s, 1);
    expect(t.level).toBeCloseTo(level - TICK_SEC * RULES.tuftBitePerSec + TICK_SEC * RULES.tuftRegrowPerSec, 9);
    // Eaten down: below .08 the sheep stops, releases the tuft, and its animation clock resets.
    t.level = S.tuftEmptyAt - 0.001;
    run(s, 1);
    expect(q.eating).toBe(false);
    expect(q.tuft).toBeNull();
    expect(t.claimed).toBeNull();
    expect(q.t0Ms).toBe(s.clock.nowMs);
  });

  it('a hay or trough trip ends in eating with no tuft, and stops on the .05/s roll', () => {
    const s = calm();
    const q = first(s);
    armPick(s, graze + hay, graze + hay + drink);
    run(s, 1);
    runUntil(s, (w) => w.sheep[0]!.eating, 600);
    expect(describeSheep(q)).toBe('drink');
    s.rng = rngWhereFloats([below(S.stopEatingPerSec * TICK_SEC)]);
    run(s, 1);
    expect(q.eating).toBe(false);
    expect(q.drinkTrip).toBe(false);
    expect(describeSheep(q)).toBe('idle');
  });
});

describe('rest', () => {
  it('night forces rest for a sheep standing still and not eating; nobody picks a need at night', () => {
    const s = calm({ t: 0.7 });
    run(s, 1);
    expect(s.sheep.every((q) => q.resting)).toBe(true);
    run(s, 300);
    expect(s.sheep.every((q) => q.resting && q.tx === null)).toBe(true);
    // A sheep mid-walk finishes its walk first, then lies down.
    const w = calm({ t: 0.7 });
    const q = first(w);
    q.tx = q.x + SFOOT[0] + 30;
    q.ty = q.y + SFOOT[1];
    run(w, 1);
    expect(q.resting).toBe(false);
    runUntil(w, (x) => x.sheep[0]!.tx === null, 100);
    run(w, 1);
    expect(q.resting).toBe(true);
  });

  it('by day a resting sheep gets up on a .4/s roll, resetting its animation clock', () => {
    const s = calm();
    const q = first(s);
    q.resting = true;
    s.rng = rngWhereFloats([atLeast(S.wakePerSec * TICK_SEC)]);
    run(s, 1);
    expect(q.resting).toBe(true);
    s.rng = rngWhereFloats([below(S.wakePerSec * TICK_SEC)]);
    run(s, 1);
    expect(q.resting).toBe(false);
    expect(q.t0Ms).toBe(s.clock.nowMs);
  });

  it('a ridden sheep still lies down at night and still walks in the sheep loop (double step, odd but kept)', () => {
    const night = calm({ t: 0.7 });
    night.sheep[0]!.ridden = true;
    run(night, 1);
    expect(night.sheep[0]!.resting).toBe(true);

    const s = calm();
    s.luna.x = s.sheep[0]!.x;
    s.luna.y = s.sheep[0]!.y;
    applyIntent(s, { type: 'lunaAction', action: 'ride' });
    runUntil(s, (w) => w.luna.riding !== null, 200);
    const mount = s.sheep.find((q) => q.id === s.luna.riding)!;
    const moved: number[] = [];
    for (let i = 0; i < 40; i++) {
      const at = { x: mount.x, y: mount.y };
      run(s, 1);
      moved.push(Math.hypot(mount.x - at.x, mount.y - at.y));
    }
    // DL's ride block moves it at 22 px/s and the sheep loop again at 16: some ticks exceed 22 px/s alone.
    expect(Math.max(...moved)).toBeGreaterThan(22 * TICK_SEC + 0.5);
  });
});

describe('wool', () => {
  it('grows from shorn to full in woolGrowSec, and a click shears at .8 or pets below', () => {
    const s = calm();
    const q = first(s);
    q.wool = S.shornWool;
    run(s, (RULES.woolGrowSec * 1000) / TICK_MS);
    expect(q.wool).toBe(1);
    applyIntent(s, { type: 'click', x: q.x + 5, y: q.y + 5 });
    expect(q.shearAtMs).toBe(s.clock.nowMs + 1200);
    expect(q.icon).toBe('shears');
    run(s, 12);
    expect(q.shearAtMs).not.toBeNull();
    run(s, 1);
    expect(q.shearAtMs).toBeNull();
    expect(q.wool).toBe(S.shornWool); // the shear lands after that tick's growth, as in the prototype
    expect(s.banks.wool).toBe(1);
    run(s, 1);
    expect(q.wool).toBeCloseTo(S.shornWool + TICK_SEC / RULES.woolGrowSec, 9);
    applyIntent(s, { type: 'click', x: q.x + 5, y: q.y + 5 });
    expect(q.icon).toBe('heart');
    expect(s.banks.wool).toBe(1);
  });
});

describe('rain shelter', () => {
  it('every sheep standing still walks to the barn door once; in the doorway it is in the barn', () => {
    const s = calm();
    rain(s, true);
    run(s, 1);
    for (const q of s.sheep) {
      expect(q.shelter).toBe(true);
      expect(q.toBarn).toBe(true);
      expect(q.resting).toBe(false);
      expect(q.ty).toBe(SPOT.barnDoor.y);
      expect(Math.abs(q.tx! - SPOT.barnDoor.x)).toBeLessThanOrEqual(5);
      expect(describeSheep(q)).toBe('toBarn');
    }
    runUntil(s, (w) => w.sheep.every((q) => q.inBarn), 2000);
    for (const q of s.sheep) {
      expect(q.tx).toBeNull();
      expect(q.toBarn).toBe(false);
      expect(Math.hypot(q.x + SFOOT[0] - SPOT.barnDoor.x, q.y + SFOOT[1] - SPOT.barnDoor.y)).toBeLessThan(7);
    }
  });

  it('a sheep already walking finishes its walk and then goes; a resting sheep gets up and goes', () => {
    const s = calm();
    const walker = first(s);
    walker.tx = walker.x + SFOOT[0] + 20;
    walker.ty = walker.y + SFOOT[1];
    const sleeper = s.sheep[1]!;
    sleeper.resting = true;
    rain(s, true);
    run(s, 1);
    expect(walker.shelter).toBe(false);
    expect(sleeper.shelter).toBe(true);
    expect(sleeper.resting).toBe(false);
    runUntil(s, (w) => w.sheep[0]!.shelter, 100);
    expect(walker.toBarn).toBe(true);
  });

  it('DL waits at the door until every sheep is in, then enters last; when it clears everyone steps out', () => {
    const s = calm();
    s.luna.x = 300;
    s.luna.y = 250;
    rain(s, true);
    let lastSheepIn = 0;
    let lunaIn = 0;
    for (let i = 1; i <= 2000 && !lunaIn; i++) {
      run(s, 1);
      if (s.sheep.every((q) => q.inBarn) && !lastSheepIn) lastSheepIn = i;
      if (s.luna.inBarn) lunaIn = i;
    }
    expect(lastSheepIn).toBeGreaterThan(0);
    expect(lunaIn).toBeGreaterThan(lastSheepIn);
    expect(s.luna.routine).toBeNull();
    rain(s, false);
    run(s, 1);
    for (const q of s.sheep) {
      expect(q.inBarn).toBe(false);
      expect(q.shelter).toBe(false);
      expect(q.wander).toBe(1);
      expect(q.tx).not.toBeNull();
      expect(Math.abs(q.x + SFOOT[0] - SPOT.barnDoor.x)).toBeLessThanOrEqual(7 + RULES.speed.sheepWander * TICK_SEC);
    }
    expect(s.luna.inBarn).toBe(false);
  });

  it('odd but kept: a sheep caught grazing keeps its tuft and its eating flag through the barn stay', () => {
    const s = calm();
    const q = first(s);
    armPick(s, 0, graze);
    run(s, 1);
    runUntil(s, (w) => w.sheep[0]!.eating, 400);
    const tuft = q.tuft!;
    rain(s, true);
    runUntil(s, (w) => w.sheep[0]!.inBarn, 2000);
    expect(q.eating).toBe(true);
    expect(q.tuft).toBe(tuft);
    expect(s.tufts[tuft]!.claimed).toBe(q.id);
  });

  it('wet in rain, snow on the back while standing in snow, both fading after', () => {
    const s = calm({ weather: 'rain' });
    run(s, 1);
    expect(first(s).wet).toBeCloseTo(TICK_SEC / 6, 9);
    const w = calm({ weather: 'snow' });
    run(w, 1);
    expect(first(w).snow).toBeCloseTo(TICK_SEC / 10, 9);
    first(w).tx = 300;
    first(w).ty = 250;
    run(w, 1);
    expect(first(w).snow).toBeCloseTo(TICK_SEC / 10 - TICK_SEC / 25, 9);
  });
});

describe('farm actions', () => {
  it('shearAll shears at .5 (lower than a click), petAll hearts everyone, wool fills every fleece', () => {
    const s = calm();
    s.sheep[0]!.wool = 0.55;
    s.sheep[1]!.wool = 0.4;
    applyIntent(s, { type: 'farmAction', action: 'shearAll' });
    expect(s.sheep[0]!.shearAtMs).toBe(s.clock.nowMs + 1200);
    expect(s.sheep[1]!.shearAtMs).toBeNull();
    applyIntent(s, { type: 'farmAction', action: 'petAll' });
    expect(s.sheep.every((q) => q.icon === 'heart' && q.tagUntilMs === s.clock.nowMs + 1800)).toBe(true);
    applyIntent(s, { type: 'farmAction', action: 'wool' });
    expect(s.sheep.every((q) => q.wool === 1)).toBe(true);
  });

  it('graze sends everyone to a tuft, rest lies everyone down, scatter walks everyone off at need speed', () => {
    const s = calm();
    applyIntent(s, { type: 'farmAction', action: 'graze' });
    expect(s.sheep.filter((q) => q.tuft !== null).length).toBeGreaterThan(0);
    for (const q of s.sheep) if (q.tuft !== null) expect(s.tufts[q.tuft]!.claimed).toBe(q.id);
    applyIntent(s, { type: 'farmAction', action: 'rest' });
    expect(s.sheep.every((q) => q.resting && q.tx === null && !q.eating)).toBe(true);
    applyIntent(s, { type: 'farmAction', action: 'scatter' });
    expect(s.sheep.every((q) => !q.resting && q.tx !== null && q.wander === 0)).toBe(true);
    applyIntent(s, { type: 'farmAction', action: 'rabbitOnly' });
    expect(s.life.rabbit).not.toBeNull();
    expect(s.luna.chasing).toBe(false);
  });
});

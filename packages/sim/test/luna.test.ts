// Digital Luna's priority chain and its interruption rules, one test per rule, ported from the
// prototype's DL section. Where the prototype is odd the test says so and pins the odd behaviour.
import { describe, expect, it } from 'vitest';
import { IDLE_PLAYS, LUNA_BEHAVIOURS, lunaContext } from '../src/behaviours/luna';
import { LUNA_ID } from '../src/actors';
import { SPOT } from '../src/geometry';
import { hashState } from '../src/hash';
import { applyIntent, type Intent } from '../src/intents';
import { RULES, TICK_MS } from '../src/rules';
import { createInitialState, type SimState } from '../src/state';
import { step } from '../src/step';
import { tickInPlace } from '../src/tick';
import { armIdlePlay, lunaFootOf, press, probeBeforeLuna, rain, run, runUntil, world } from './luna-helpers';

/** The door-wait spot after `clampTarget` pulled it inside the field, where DL actually stands. */
const DOOR_WAIT_FOOT = { x: 285.04, y: 93.92 };

function throwStick(s: SimState, x = 400, y = 250): SimState {
  return applyIntent(s, { type: 'throwStick', x, y });
}

function centreLuna(s: SimState): SimState {
  s.luna.x = 300;
  s.luna.y = 200;
  return s;
}

describe('the registry holds DL in the owner’s order', () => {
  it('the riding pre-pass, then fetch > manual > ride, then the routine chain, then the movement pass', () => {
    expect(LUNA_BEHAVIOURS.chains()).toEqual(['riding', 'fetch', 'command', 'routine', 'move']);
    expect(LUNA_BEHAVIOURS.behaviours('riding').map((b) => b.id)).toEqual(['riding']);
    expect(LUNA_BEHAVIOURS.get('riding')?.exclusive).toBeFalsy();
    expect(LUNA_BEHAVIOURS.behaviours('fetch').map((b) => b.id)).toEqual(['fetch']);
    expect(LUNA_BEHAVIOURS.get('fetch')?.exclusive).toBe(true);
    expect(LUNA_BEHAVIOURS.behaviours('command').map((b) => b.id)).toEqual(['manual', 'ride']);
    expect(LUNA_BEHAVIOURS.behaviours('routine').map((b) => b.id)).toEqual([
      'tiltRecover',
      'pantRest',
      'rainShepherd',
      'bedtime',
      'hotPant',
      'idlePlay',
      'flopUp',
      'nibble',
      'sleepFix',
    ]);
    expect(LUNA_BEHAVIOURS.behaviours('move').map((b) => b.id)).toEqual(['walk']);
    const priorities = LUNA_BEHAVIOURS.behaviours('routine').map((b) => b.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });

  it('idle play is one weighted roll: flop .22, stick .22, ride .12, nibble .22, rabbit .22', () => {
    expect(IDLE_PLAYS.behaviours().map((b) => [b.id, b.weight])).toEqual([
      ['flop', 0.22],
      ['stick', 0.22],
      ['rideSheep', 0.12],
      ['nibbleGrass', 0.22],
      ['rabbit', 0.22],
    ]);
  });
});

describe('fetch', () => {
  it('a thrown stick interrupts idle play: the tuft is dropped, she runs out fast and carries back slow', () => {
    const s = centreLuna(world());
    armIdlePlay(s, 0.56, 0.78);
    run(s, 1);
    expect(s.luna.tuft).not.toBeNull();
    const tuft = s.tufts[s.luna.tuft as number]!;
    expect(tuft.claimed).toBe(LUNA_ID);
    throwStick(s);
    expect(s.luna.tuft).toBeNull();
    expect(tuft.claimed).toBeNull();
    expect(s.luna.stick).toMatchObject({ x: 400, y: 250, phase: 'out' });
    expect(LUNA_BEHAVIOURS.select(lunaContext(s), s.luna, 'fetch')?.id).toBe('fetch');
    const out = runUntil(s, (w) => w.luna.stick?.phase === 'back');
    expect(s.luna.anim).toBe('stick');
    const back = runUntil(s, (w) => w.luna.stick === null);
    expect(s.luna.anim).toBe('pant');
    expect(s.luna.icon).toBe('heart');
    // Same distance each way; the carry back at 45 px/s takes longer than the run out at 80.
    expect(back).toBeGreaterThan(out * 1.4);
    // The prototype sets the heart with no timer, so it lasts one frame.
    run(s, 1);
    expect(s.luna.icon).toBeNull();
    runUntil(s, (w) => w.luna.anim === 'sit', 30);
  });

  it('a throw cancels a button hold and a mount', () => {
    const s = centreLuna(world());
    press(s, 'sit');
    expect(s.luna.manual).toBe('sit');
    throwStick(s);
    expect(s.luna.manual).toBeNull();
    run(s, 1);
    expect(s.luna.anim).toBe('run');
    expect(s.luna.stick?.phase).toBe('out');

    const m = centreLuna(world());
    armIdlePlay(m, 0.44, 0.56);
    run(m, 1);
    expect(m.luna.mounting).not.toBeNull();
    throwStick(m);
    expect(m.luna.mounting).toBeNull();
  });

  it('is refused while riding, in the barn, in bed or asleep, in rain, and off the field', () => {
    const riding = world();
    riding.luna.riding = riding.sheep[0]!.id;
    expect(throwStick(riding).luna.stick).toBeNull();

    const barn = world();
    barn.luna.inBarn = true;
    expect(throwStick(barn).luna.stick).toBeNull();

    for (const routine of ['bed', 'asleep']) {
      const w = world();
      w.luna.routine = routine;
      expect(throwStick(w).luna.stick).toBeNull();
    }

    expect(throwStick(world({ weather: 'rain' })).luna.stick).toBeNull();
    expect(throwStick(world(), 5, 5).luna.stick).toBeNull();
    // Waiting at the door in rain is not a refusal at throw time, but fetch will not run.
    const wait = world();
    wait.luna.routine = 'shelterWait';
    throwStick(wait);
    expect(wait.luna.stick).not.toBeNull();
    expect(LUNA_BEHAVIOURS.select(lunaContext(wait), wait.luna, 'fetch')).toBeNull();
  });

  it('odd but kept: the ride button does not drop the stick, so fetch resumes after the ride', () => {
    const s = centreLuna(world());
    throwStick(s);
    press(s, 'ride');
    expect(s.luna.stick).not.toBeNull();
    expect(s.luna.manual).toBe('ride');
    runUntil(s, (w) => w.luna.riding !== null);
    expect(s.luna.stick).not.toBeNull();
    runUntil(s, (w) => w.luna.riding === null);
    // The riding pre-pass dismounts before the fetch check, so the fetch starts on the dismount
    // tick: she is already running for the stick, with no pant in between.
    expect(s.luna).toMatchObject({ anim: 'run', manual: null });
    expect(s.luna.stick?.phase).toBe('out');
    expect(s.luna.target).toEqual({ x: 400, y: 254 });
  });
});

describe('manual buttons', () => {
  it('a button interrupts idle play: the rabbit vanishes and the hold lasts its time', () => {
    const s = centreLuna(world());
    armIdlePlay(s, 0.78, 1);
    run(s, 1);
    expect(s.life.rabbit).not.toBeNull();
    expect(s.luna.chasing).toBe(true);
    press(s, 'sit');
    expect(s.life.rabbit).toBeNull();
    expect(s.luna.chasing).toBe(false);
    expect(s.luna.target).toBeNull();
    expect(s.luna).toMatchObject({ manual: 'sit', anim: 'sit', idle: 0 });
    run(s, 59);
    expect(s.luna.manual).toBe('sit');
    const rest = runUntil(s, (w) => w.luna.manual === null, 5);
    expect(rest).toBe(2);
    expect(s.luna.anim).toBe('sit');
  });

  it('zoomies walk to a random spot and end in a pant; come here walks to the front', () => {
    const s = centreLuna(world());
    press(s, 'run');
    expect(s.luna).toMatchObject({ manual: 'walk', anim: 'run' });
    expect(s.luna.target).not.toBeNull();
    runUntil(s, (w) => w.luna.manual === null);
    expect(s.luna.anim).toBe('pant');

    const c = centreLuna(world());
    press(c, 'come');
    runUntil(c, (w) => w.luna.manual === null);
    const foot = lunaFootOf(c);
    expect(Math.hypot(foot.x - SPOT.front.x, foot.y - SPOT.front.y)).toBeLessThan(2);
  });

  it('nibble walks to the nearest tuft and eats for four seconds (both chains bite, as in the prototype)', () => {
    const s = centreLuna(world());
    press(s, 'nibble');
    expect(s.luna.manual).toBe('nibble');
    const index = s.luna.tuft as number;
    expect(index).not.toBeNull();
    const tuft = s.tufts[index]!;
    expect(tuft.claimed).toBe(LUNA_ID);
    runUntil(s, (w) => w.luna.anim === 'nibble');
    const level = tuft.level;
    const ate = runUntil(s, (w) => w.luna.manual === null);
    expect(ate).toBeGreaterThanOrEqual(40);
    expect(ate).toBeLessThanOrEqual(42);
    expect(s.luna.anim).toBe('sit');
    expect(s.luna.tuft).toBeNull();
    expect(tuft.claimed).toBeNull();
    // Two bites per tick (manual chain and routine chain), each .05/s, minus regrowth .018/s.
    const expected = level - 4 * (0.1 - RULES.tuftRegrowPerSec);
    expect(tuft.level).toBeGreaterThan(expected - 0.03);
    expect(tuft.level).toBeLessThan(expected + 0.03);
  });

  it('nibble with no free tuft mimes for four seconds instead of throwing, as the prototype did', () => {
    const s = centreLuna(world());
    for (const t of s.tufts) t.claimed = 'sheep-0';
    press(s, 'nibble');
    expect(s.luna).toMatchObject({ manual: 'nibble', anim: 'nibble', tuft: null });
    expect(() => run(s, 39)).not.toThrow();
    expect(s.luna.manual).toBe('nibble');
    runUntil(s, (w) => w.luna.manual === null, 3);
    expect(s.luna.anim).toBe('sit');
  });

  it('odd but kept: head tilt and nap fall through to pant and sit on the next tick', () => {
    const s = centreLuna(world());
    press(s, 'tilt');
    expect(s.luna.anim).toBe('tilt');
    run(s, 1);
    expect(s.luna).toMatchObject({ anim: 'pant', manual: 'tilt' });
    runUntil(s, (w) => w.luna.manual === null, 60);

    const n = centreLuna(world());
    press(n, 'sleep');
    expect(n.luna.anim).toBe('sleep');
    run(n, 1);
    expect(n.luna).toMatchObject({ anim: 'sit', manual: 'sleep' });
    // And because the routine chain keeps running under a hold, idle play fires inside the nap.
    const played = runUntil(n, (w) => w.luna.anim !== 'sit' || w.luna.mounting !== null, 80);
    expect(played).toBeGreaterThan(65);
    expect(n.luna.manual).toBe('sleep');
  });

  it('the bed button puts her to bed by day, and daylight wakes her at once', () => {
    const s = centreLuna(world());
    press(s, 'bed');
    expect(s.luna).toMatchObject({ routine: 'bed', manual: null, anim: 'run' });
    runUntil(s, (w) => w.luna.routine === 'asleep');
    expect(s.luna.anim).toBe('sleep');
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: null, anim: 'stretch' });
  });

  it('trundle is zoomies with a bound flag; pet is a heart and a name tag', () => {
    const s = centreLuna(world());
    press(s, 'trundle');
    expect(s.luna).toMatchObject({ manual: 'walk', anim: 'run', forceBoundUntilMs: s.clock.nowMs + 6000 });
    press(s, 'pet');
    expect(s.luna.icon).toBe('heart');
    expect(s.luna.tagUntilMs).toBe(s.clock.nowMs + 1800);
    expect(s.luna.manual).toBe('walk');
  });
});

describe('riding', () => {
  it('idle play can pick a sheep to ride: mount, ride for rideMs, dismount into a pant', () => {
    const s = centreLuna(world());
    armIdlePlay(s, 0.44, 0.56);
    run(s, 1);
    const id = s.luna.mounting as string;
    expect(id).toMatch(/^sheep-/);
    const sheep = s.sheep.find((q) => q.id === id)!;
    runUntil(s, (w) => w.luna.riding !== null);
    expect(s.luna.riding).toBe(id);
    expect(sheep.ridden).toBe(true);
    expect(s.luna.rideUntilMs).toBe(s.clock.nowMs + RULES.rideMs);
    const before = { x: sheep.x, y: sheep.y };
    const rode = runUntil(s, (w) => w.luna.riding === null);
    expect(rode).toBe(RULES.rideMs / TICK_MS + 1);
    expect(sheep.ridden).toBe(false);
    expect(s.luna.anim).toBe('pant');
    // The mount wandered, and she got off beside it.
    expect(Math.hypot(sheep.x - before.x, sheep.y - before.y)).toBeGreaterThan(5);
    expect(s.luna.x).toBeCloseTo(sheep.x + 16 - 22 - 20, 6);
    expect(s.luna.y).toBeCloseTo(sheep.y + 25 - 38 + 2, 6);
  });

  it('the ride button mounts the nearest sheep and rides for the longer rideManualMs', () => {
    const s = centreLuna(world());
    press(s, 'ride');
    expect(s.luna.manual).toBe('ride');
    const l = s.luna;
    const nearest = [...s.sheep].sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y))[0]!;
    expect(l.mounting).toBe(nearest.id);
    runUntil(s, (w) => w.luna.riding !== null);
    expect(s.luna.manual).toBeNull();
    expect(s.luna.rideUntilMs).toBe(s.clock.nowMs + RULES.rideManualMs);
  });

  it('rain dismounts her at once and sends her to the barn door', () => {
    const s = centreLuna(world());
    press(s, 'ride');
    runUntil(s, (w) => w.luna.riding !== null);
    rain(s, true);
    run(s, 1);
    expect(s.luna.riding).toBeNull();
    expect(s.sheep.every((q) => !q.ridden)).toBe(true);
    expect(s.luna.routine).toBe('shelterWait');
  });

  it('a mount is abandoned if the sheep lies down or it starts to rain', () => {
    const s = centreLuna(world());
    press(s, 'ride');
    const sheep = s.sheep.find((q) => q.id === s.luna.mounting)!;
    run(s, 2);
    sheep.resting = true;
    run(s, 1);
    expect(s.luna).toMatchObject({ mounting: null, riding: null, anim: 'sit' });

    const r = centreLuna(world());
    press(r, 'ride');
    run(r, 2);
    rain(r, true);
    run(r, 1);
    expect(r.luna.mounting).toBeNull();
    expect(r.luna.riding).toBeNull();
  });

  it('odd but kept: a button pressed mid-ride does not dismount; the ride runs its course', () => {
    const s = centreLuna(world());
    press(s, 'ride');
    runUntil(s, (w) => w.luna.riding !== null);
    const id = s.luna.riding;
    // Two seconds into the ride: the routine chain keeps counting idle time under a sit hold, so
    // a press at the mount would let idle play roll a second mount before this ride ends.
    run(s, 20);
    press(s, 'sit');
    expect(s.luna.manual).toBe('sit');
    run(s, 40);
    expect(s.luna.riding).toBe(id);
    runUntil(s, (w) => w.luna.riding === null);
    // The 6 s hold expired under the 8 s ride. Chain one sees `riding` null on the dismount tick,
    // so the expired hold becomes a sit at once.
    expect(s.clock.nowMs).toBeGreaterThan(s.luna.manualUntilMs);
    expect(s.luna).toMatchObject({ manual: null, anim: 'sit' });
  });

  it('a rain dismount with a stick out fetches first and shelters after, as the prototype', () => {
    const s = centreLuna(world());
    throwStick(s);
    press(s, 'ride');
    runUntil(s, (w) => w.luna.riding !== null);
    expect(s.luna.stick).not.toBeNull();
    rain(s, true);
    run(s, 1);
    // The fetch check never looks at the rain, and it pre-empts the routine chain every tick.
    expect(s.luna.riding).toBeNull();
    expect(s.luna).toMatchObject({ anim: 'run', routine: null });
    expect(s.luna.stick?.phase).toBe('out');
    run(s, 10);
    expect(s.luna).toMatchObject({ routine: null, anim: 'run' });
    expect(s.luna.stick?.phase).toBe('out');
    const home = runUntil(s, (w) => w.luna.stick === null);
    expect(home).toBeGreaterThan(10);
    expect(s.luna).toMatchObject({ anim: 'pant', routine: null, icon: 'heart' });
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: 'shelterWait', anim: 'run' });
  });
});

describe('rain shepherd', () => {
  function flockOnTheRight(): SimState {
    const s = world({ sheep: 3 });
    s.luna.x = 200;
    s.luna.y = 140;
    s.sheep.forEach((q, i) => {
      q.x = 400 + i * 30;
      q.y = 200;
    });
    return s;
  }

  it('runs to the door, waits facing the sheep still out, enters last, and comes out when it clears', () => {
    const s = flockOnTheRight();
    rain(s, true);
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: 'shelterWait', anim: 'run' });
    runUntil(s, (w) => w.luna.target === null);
    const foot = lunaFootOf(s);
    // Arrival is `d < 1.2` px, as in the prototype.
    expect(Math.hypot(foot.x - DOOR_WAIT_FOOT.x, foot.y - DOOR_WAIT_FOOT.y)).toBeLessThan(1.2);
    expect(['sit', 'tilt']).toContain(s.luna.anim);
    expect(s.luna.dir).toBe(1);
    run(s, 30);
    expect(s.luna.routine === 'shelterWait' || s.luna.anim === 'pant').toBe(true);
    expect(s.luna.inBarn).toBe(false);
    s.sheep.forEach((q) => {
      q.inBarn = true;
    });
    runUntil(s, (w) => w.luna.routine === 'shelterEnter', 3);
    expect(s.luna.target).toEqual({ x: SPOT.barnDoor.x, y: SPOT.barnDoor.y });
    runUntil(s, (w) => w.luna.inBarn);
    expect(s.luna.routine).toBeNull();
    run(s, 20);
    expect(s.luna.inBarn).toBe(true);
    rain(s, false);
    run(s, 1);
    expect(s.luna).toMatchObject({ inBarn: false, anim: 'sit' });
    expect(lunaFootOf(s)).toEqual({ x: SPOT.barnDoor.x, y: SPOT.barnDoor.y + 2 });
  });

  it('a sheep that is offstage does not hold her at the door', () => {
    const s = flockOnTheRight();
    s.sheep.forEach((q) => {
      q.outside = true;
    });
    rain(s, true);
    runUntil(s, (w) => w.luna.inBarn);
  });

  it('rain interrupts a rabbit chase and a walk to a tuft', () => {
    const s = centreLuna(world());
    armIdlePlay(s, 0.78, 1);
    run(s, 1);
    expect(s.life.rabbit).not.toBeNull();
    rain(s, true);
    run(s, 1);
    expect(s.life.rabbit).toBeNull();
    expect(s.luna.chasing).toBe(false);
    expect(s.luna.routine).toBe('shelterWait');
  });

  it('rain stopping mid-wait releases her to sit where she is', () => {
    const s = flockOnTheRight();
    rain(s, true);
    run(s, 5);
    rain(s, false);
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: null, anim: 'sit', inBarn: false });
  });

  it('odd but kept: the head tilt at the door flickers tilt, pant, run at 10 Hz for 1.4 s in every 6', () => {
    const s = flockOnTheRight();
    rain(s, true);
    runUntil(s, (w) => w.luna.target === null);
    const seen: string[] = [];
    runUntil(s, (w) => w.clock.nowMs % 6000 === 5900);
    for (let i = 0; i < 14; i++) {
      run(s, 1);
      seen.push(`${s.luna.anim}/${s.luna.routine}`);
    }
    expect(seen.slice(0, 6)).toEqual(['tilt/shelterWait', 'pant/null', 'run/shelterWait', 'tilt/shelterWait', 'pant/null', 'run/shelterWait']);
    // Past the 1.4 s window the cycle finishes (pant, run) and she settles into a sit until the next one.
    run(s, 2);
    expect(s.luna).toMatchObject({ anim: 'sit', routine: 'shelterWait' });
    // She does not actually move during the flicker.
    expect(Math.hypot(lunaFootOf(s).x - DOOR_WAIT_FOOT.x, lunaFootOf(s).y - DOOR_WAIT_FOOT.y)).toBeLessThan(1.2);
  });
});

describe('dusk bed and dawn stretch', () => {
  it('at dusk she trots to the doorway, circles for 1.8 s, sleeps until dawn, then stretches and sits', () => {
    const s = centreLuna(world({ t: 0.43 }));
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: 'bed', anim: 'run' });
    expect(s.luna.target).toEqual({ x: SPOT.barnDoor.x + 24, y: SPOT.barnDoor.y + 2 });
    const arrived = runUntil(s, (w) => w.luna.circleUntilMs !== null);
    const slept = runUntil(s, (w) => w.luna.routine === 'asleep');
    expect(slept).toBe(19);
    expect(arrived).toBeGreaterThan(5);
    expect(s.luna).toMatchObject({ anim: 'sleep', dir: 1, circleUntilMs: null });
    const foot = lunaFootOf(s);
    expect(Math.abs(foot.y - (SPOT.barnDoor.y + 2))).toBeLessThan(2);
    expect(Math.abs(foot.x - (SPOT.barnDoor.x + 24))).toBeLessThan(20);

    s.clock = { ...s.clock, t: 0.7 };
    run(s, 300);
    expect(s.luna).toMatchObject({ routine: 'asleep', anim: 'sleep', idle: 0 });

    s.clock = { ...s.clock, t: 0.93 };
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: null, anim: 'stretch' });
    expect(runUntil(s, (w) => w.luna.anim === 'sit')).toBe(28);
    // Idle play is back once she sits.
    expect(runUntil(s, (w) => w.luna.anim !== 'sit' || w.luna.mounting !== null, 80)).toBeGreaterThan(65);
  });

  it('night rain wakes her for shepherd duty; she goes back to bed when it clears', () => {
    const s = centreLuna(world({ t: 0.6 }));
    runUntil(s, (w) => w.luna.routine === 'asleep');
    rain(s, true);
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: 'shelterWait', anim: 'run' });
    run(s, 50);
    rain(s, false);
    run(s, 1);
    expect(s.luna).toMatchObject({ routine: null, anim: 'sit' });
    run(s, 1);
    expect(s.luna.routine).toBe('bed');
    runUntil(s, (w) => w.luna.routine === 'asleep');
  });

  it('a stick is not thrown at a sleeping dog, and a pet does not wake her', () => {
    const s = centreLuna(world({ t: 0.6 }));
    runUntil(s, (w) => w.luna.routine === 'asleep');
    throwStick(s);
    expect(s.luna.stick).toBeNull();
    applyIntent(s, { type: 'click', x: s.luna.x + 10, y: s.luna.y + 10 });
    expect(s.luna.icon).toBe('heart');
    expect(s.luna.anim).toBe('sleep');
  });
});

describe('idle play', () => {
  it('fires after seven calm seconds of sitting, and each roll band does what the prototype did', () => {
    const fresh = centreLuna(world());
    // `idle` adds 0.1 per tick in floating point: seventy adds give 6.999…, so the roll lands on
    // the 71st tick, 7.1 s in. The prototype's `> 7` with real frame times behaved the same way.
    expect(runUntil(fresh, (w) => w.luna.anim !== 'sit' || w.luna.mounting !== null)).toBe(71);

    const flop = centreLuna(world());
    armIdlePlay(flop, 0, 0.22);
    run(flop, 1);
    expect(flop.luna).toMatchObject({ anim: 'flop', idle: 0 });
    // `now - t0 > 5000` is strict, so the flop ends on the 51st tick after it began.
    expect(runUntil(flop, (w) => w.luna.anim === 'sit')).toBe(51);

    const stick = centreLuna(world());
    armIdlePlay(stick, 0.22, 0.44);
    run(stick, 1);
    expect(stick.luna.anim).toBe('stick');
    expect(stick.luna.target).not.toBeNull();
    runUntil(stick, (w) => w.luna.target === null);
    expect(stick.luna.anim).toBe('sit');

    const ride = centreLuna(world());
    armIdlePlay(ride, 0.44, 0.56);
    run(ride, 1);
    expect(ride.luna.mounting).toMatch(/^sheep-/);

    const nibble = centreLuna(world());
    armIdlePlay(nibble, 0.56, 0.78);
    run(nibble, 1);
    expect(nibble.luna.anim).toBe('run');
    expect(nibble.tufts[nibble.luna.tuft as number]?.claimed).toBe(LUNA_ID);
    runUntil(nibble, (w) => w.luna.anim === 'nibble');
    expect(nibble.luna.dir).toBe(1);
    expect(runUntil(nibble, (w) => w.luna.anim === 'sit')).toBeLessThanOrEqual(41);
    expect(nibble.luna.tuft).toBeNull();

    const rabbit = centreLuna(world());
    armIdlePlay(rabbit, 0.78, 1);
    run(rabbit, 1);
    // Released at x = 30 and hopped 6 px in the same tick: small life ticks after DL, as in the prototype.
    expect(rabbit.life.rabbit?.x).toBe(36);
    expect(rabbit.luna).toMatchObject({ chasing: true, anim: 'run' });
    // The rabbit hops right at 60 px/s and is gone past 600: (600 - 30) / 60 = 9.5 s, 96 ticks in all.
    expect(runUntil(rabbit, (w) => w.life.rabbit === null)).toBe(95);
    expect(rabbit.luna).toMatchObject({ chasing: false, anim: 'sit', target: null });
  });

  it('a ride pick with no free sheep, or a nibble pick with no tall tuft, does nothing', () => {
    const s = centreLuna(world());
    s.sheep.forEach((q) => {
      q.resting = true;
    });
    armIdlePlay(s, 0.44, 0.56);
    run(s, 1);
    expect(s.luna).toMatchObject({ mounting: null, anim: 'sit', idle: 0 });

    const n = centreLuna(world());
    n.tufts.forEach((t) => {
      t.level = 0.2;
    });
    armIdlePlay(n, 0.56, 0.78);
    run(n, 1);
    expect(n.luna).toMatchObject({ tuft: null, anim: 'sit' });
  });

  it('a pet breaks the sit into a pant, then she settles and the idle count carries on', () => {
    const s = centreLuna(world());
    run(s, 30);
    const idle = s.luna.idle;
    applyIntent(s, { type: 'click', x: s.luna.x + 10, y: s.luna.y + 10 });
    expect(s.luna).toMatchObject({ anim: 'pant', icon: 'heart' });
    expect(runUntil(s, (w) => w.luna.anim === 'sit')).toBe(26);
    expect(s.luna.idle).toBeCloseTo(idle, 9);
  });

  it('on a hot day a sitting dog sometimes pants (the roll lives in the condition)', () => {
    const s = centreLuna(world({ season: 'summer', t: 0.3 }));
    s.weather = { ...s.weather, temp: 35 };
    let seen = 0;
    for (let i = 0; i < 400 && seen < 2; i++) {
      // Predict the routine chain's pick on a probe that has taken the sheep's draws, then tick for real.
      const probe = probeBeforeLuna(s);
      const predicted = LUNA_BEHAVIOURS.select(lunaContext(probe), probe.luna, 'routine')?.id;
      const wasSitting = s.luna.anim === 'sit';
      tickInPlace(s);
      if (predicted === 'hotPant') {
        expect(wasSitting).toBe(true);
        expect(s.luna.anim).toBe('pant');
        seen++;
      }
    }
    expect(seen).toBe(2);
  });
});

describe('clicks', () => {
  it('hit DL first, then a sheep (pet or shear), else throw a stick', () => {
    const s = centreLuna(world());
    applyIntent(s, { type: 'click', x: s.luna.x + 5, y: s.luna.y + 5 });
    expect(s.luna).toMatchObject({ anim: 'pant', icon: 'heart', target: null, tagUntilMs: s.clock.nowMs + 1800 });
    expect(s.luna.stick).toBeNull();

    const woolly = s.sheep[0]!;
    woolly.x = 100;
    woolly.y = 100;
    woolly.wool = 0.9;
    applyIntent(s, { type: 'click', x: 110, y: 110 });
    expect(woolly.shearAtMs).toBe(s.clock.nowMs + 1200);
    expect(woolly.icon).toBe('shears');
    expect(woolly.tagUntilMs).toBe(s.clock.nowMs + RULES.petTagMs);

    const shorn = s.sheep[1]!;
    shorn.x = 500;
    shorn.y = 250;
    shorn.wool = 0.3;
    applyIntent(s, { type: 'click', x: 510, y: 260 });
    expect(shorn.shearAtMs).toBeNull();
    expect(shorn.icon).toBe('heart');

    applyIntent(s, { type: 'click', x: 400, y: 250 });
    expect(s.luna.stick).toMatchObject({ x: 400, y: 250 });
  });
});

describe('determinism', () => {
  it('the same luna intents replay to the same hash', () => {
    const play = () => {
      let s = createInitialState(11);
      const script: Record<number, Intent[]> = {
        20: [{ type: 'throwStick', x: 400, y: 250 }],
        200: [{ type: 'lunaAction', action: 'ride' }],
        400: [{ type: 'lunaAction', action: 'rabbit' }],
        450: [{ type: 'click', x: 320, y: 250 }],
        600: [{ type: 'setWeather', weather: 'rain' }],
        900: [{ type: 'setWeather', weather: 'sun' }],
      };
      for (let i = 0; i < 1200; i++) s = step(s, script[i] ?? [], TICK_MS);
      return s;
    };
    const a = play();
    const b = play();
    expect(a.clock.tick).toBe(1200);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(step(createInitialState(11), [], 1200 * TICK_MS)));
  });
});

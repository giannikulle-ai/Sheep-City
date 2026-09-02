// Digital Luna's behaviours, ported at parity from the "Digital Luna" section of
// prototype/luna-farm/src/sim_template.html (the `tick`, `manualLuna`, `dismount`, and `walkLuna`
// functions). The prototype runs, every frame:
//
//   1. the riding pre-pass (move the mount, or dismount on the timer or rain);
//   2. the fetch pre-empt (which `return`s out of tick);
//   3. chain one: riding (handled above) | mounting | manual;
//   4. chain two: tilt | pant | rain shepherd | bed and dawn | hot pant | idle play | timers;
//   5. the movement pass, then clamp, wet, and snow.
//
// Chains one and two are not one if/else: both run each frame, so a manual hold and the bed
// routine, or riding and the bed routine, can be active at once. That is kept here as five
// registry chains (`riding`, `fetch`, `command`, `routine`, `move`) so the port is faithful and
// the oddities are visible in one place. Priorities inside a chain follow the prototype's
// `else if` order. The riding pre-pass has its own chain ahead of `fetch` because the prototype
// dismounts before the fetch check runs: on the dismount frame a stick still out is fetched at
// once (even in rain), and an expired button hold becomes a sit at once.
//
// Owner-facing order (issue #5): fetch > manual > riding > rain shepherd > dusk bed and dawn
// stretch > idle play (flop, stick, ride, nibble, rabbit). Everything else is a posture timer.

import { LUNA_ID, bubble, findSheep, nearestTuft } from '../actors';
import { type Phase, phaseOf } from '../clock';
import { LFOOT, SFOOT, SPOT, randomFoot, type Point } from '../geometry';
import { clampField, clampTarget, stepToward } from '../movement';
import { chance, nextFloat, pick, type Rng } from '../rng';
import { RULES, TICK_SEC } from '../rules';
import type { Luna, SimState, Tuft } from '../state';
import { type Behaviour, createRegistry } from './registry';

/** What one DL tick sees: the world, and the frame values the prototype computed up front. */
export interface LunaContext {
  state: SimState;
  rng: Rng;
  /** Sim milliseconds; the prototype's `now`. */
  now: number;
  /** Seconds in this tick; the prototype's `dt`. */
  dt: number;
  phase: Phase;
  night: boolean;
  rain: boolean;
  temp: number;
  /** Always true: the prototype's `calm` was a constant left over from the agent days. */
  calm: true;
}

export type LunaBehaviour = Behaviour<LunaContext, Luna>;

/** Routines during which a stick is ignored and the movement pass does not walk. */
const BUSY_ROUTINES: readonly (string | null)[] = ['bed', 'asleep', 'shelterWait', 'shelterEnter'];
const SHELTER_ROUTINES: readonly (string | null)[] = ['shelterWait', 'shelterEnter'];

const DOOR_WAIT: Point = { x: SPOT.barnDoor.x - 34, y: SPOT.barnDoor.y + 4 };
const BED: Point = { x: SPOT.barnDoor.x + 24, y: SPOT.barnDoor.y + 2 };

/** Foot point of DL's sprite. */
function foot(l: Luna): Point {
  return { x: l.x + LFOOT[0], y: l.y + LFOOT[1] };
}

/** The prototype's `walkLuna`: walk towards `target` at `sp` px/s. True when there or no target. */
export function walkLuna(l: Luna, dt: number, sp: number): boolean {
  if (!l.target) return true;
  const t = clampTarget(l.target);
  l.tx = t.x;
  l.ty = t.y;
  if (stepToward(l, LFOOT, sp, dt)) {
    l.target = null;
    l.wp = null;
    return true;
  }
  return false;
}

/** The prototype's `dismount`. */
export function dismount(s: SimState, now: number): void {
  const l = s.luna;
  const sheep = findSheep(s, l.riding);
  if (!sheep) return;
  sheep.ridden = false;
  l.riding = null;
  l.x = sheep.x + SFOOT[0] - LFOOT[0] - 20;
  l.y = sheep.y + SFOOT[1] - LFOOT[1] + 2;
  l.anim = 'pant';
  l.t0Ms = now;
  sheep.t0Ms = now;
}

function releaseTuft(s: SimState, l: Luna): void {
  if (l.tuft === null) return;
  const t = s.tufts[l.tuft];
  if (t && t.claimed === LUNA_ID) t.claimed = null;
  l.tuft = null;
}

/** Point DL at a tuft and claim it: the shared tail of the idle and manual nibble picks. */
function claimTuft(s: SimState, l: Luna, index: number): void {
  const t = s.tufts[index] as Tuft;
  t.claimed = LUNA_ID;
  l.tuft = index;
  l.anim = 'run';
  l.target = { x: t.x - 18, y: t.y + 2 };
}

/** Put DL at the barn door, facing out: where the prototype drops her when she leaves the barn. */
export function leaveBarn(l: Luna): void {
  l.inBarn = false;
  l.x = SPOT.barnDoor.x - LFOOT[0];
  l.y = SPOT.barnDoor.y - LFOOT[1] + 2;
}

// ---------------------------------------------------------------------------------------------
// Chain `riding`: the prototype's pre-pass, before the fetch check and before chain one.
// ---------------------------------------------------------------------------------------------

/** Riding a sheep: the mount wanders on its own until the timer runs out or it rains. */
export const riding: LunaBehaviour = {
  id: 'riding',
  chain: 'riding',
  priority: 110,
  condition: (_, l) => l.riding !== null,
  tick: ({ state, rng, now, dt, rain }, l) => {
    const sheep = findSheep(state, l.riding);
    if (!sheep) {
      l.riding = null;
      return;
    }
    if (now > l.rideUntilMs || rain) {
      dismount(state, now);
      return;
    }
    if (sheep.tx === null && chance(rng, dt * 0.9)) {
      const f = randomFoot(rng);
      sheep.tx = f.x;
      sheep.ty = f.y;
    }
    if (sheep.tx !== null && stepToward(sheep, SFOOT, 22, dt)) sheep.tx = sheep.ty = null;
    clampField(sheep, SFOOT);
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `fetch`: a thrown stick overrides everything but a hold, a ride, the barn, and bed.
// ---------------------------------------------------------------------------------------------

export const fetch: LunaBehaviour = {
  id: 'fetch',
  chain: 'fetch',
  priority: 100,
  exclusive: true,
  condition: (_, l) => l.stick !== null && !l.manual && !l.riding && !l.inBarn && !BUSY_ROUTINES.includes(l.routine),
  tick: ({ state, now, dt }, l) => {
    const st = l.stick;
    if (!st) return;
    if (st.phase === 'out') {
      l.anim = 'run';
      l.target = { x: st.x, y: st.y + 4 };
      if (walkLuna(l, dt, RULES.speed.lunaRun)) {
        st.phase = 'back';
        l.anim = 'stick';
        l.target = { x: st.fromX, y: st.fromY };
      }
    } else {
      l.anim = 'stick';
      l.target = l.target ?? { x: st.fromX, y: st.fromY };
      if (walkLuna(l, dt, RULES.speed.lunaFetchBack)) {
        l.stick = null;
        l.anim = 'pant';
        l.t0Ms = now;
        // The prototype sets the icon without a timer, so the heart shows for one frame only.
        l.icon = 'heart';
      }
    }
    clampField(l, LFOOT);
    // The prototype only wobbles the fireflies inside this branch; kept as it is.
    for (const f of state.life.flies) {
      f.p += dt * f.s;
      f.x += Math.sin(f.p * 1.3) * 6 * dt;
      f.y += Math.cos(f.p * 0.9) * 4 * dt;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `command`: the prototype's first chain, riding | mounting | manual.
// ---------------------------------------------------------------------------------------------

/** The prototype's `manualLuna`: a button hold, a walk, a manual nibble. */
export const manual: LunaBehaviour = {
  id: 'manual',
  chain: 'command',
  priority: 90,
  condition: (_, l) => l.manual !== null && !l.riding && !l.mounting,
  tick: ({ state, now, dt }, l) => {
    if (l.manual === 'rabbit') {
      // Unreachable in the prototype: no button sets `manual = "rabbit"`. Ported as written.
      const rabbit = state.life.rabbit;
      if (rabbit) {
        rabbit.x += 60 * dt;
        l.target = { x: rabbit.x - 30, y: rabbit.y + 22 };
        l.anim = 'run';
        walkLuna(l, dt, 80);
        if (rabbit.x > 600) {
          state.life.rabbit = null;
          l.manual = null;
          l.anim = 'sit';
        }
      } else l.manual = null;
    } else if (l.manual === 'walk') {
      if (l.target) {
        if (walkLuna(l, dt, l.anim === 'stick' ? 34 : 80)) {
          l.manual = null;
          l.anim = 'pant';
          l.t0Ms = now;
        }
      } else {
        l.manual = null;
        l.anim = 'sit';
      }
    } else if (l.manual === 'nibble') {
      if (l.target) {
        if (walkLuna(l, dt, 80)) {
          l.anim = 'nibble';
          l.t0Ms = now;
          l.dir = 1;
        }
      } else if (l.anim === 'nibble') {
        const t = l.tuft === null ? null : state.tufts[l.tuft];
        if (t) t.level = Math.max(0, t.level - dt * 0.05);
        if (now - l.t0Ms > 4000) {
          releaseTuft(state, l);
          l.manual = null;
          l.anim = 'sit';
        }
      }
    } else if (now > l.manualUntilMs) {
      l.manual = null;
      l.anim = 'sit';
      l.t0Ms = now;
    }
  },
};

/**
 * Mounting a sheep: run to it, climb on, and hand over to the `riding` chain. The prototype's
 * chain one is `if (riding) {} else if (mounting) … else if (manual) …`, so nothing here runs
 * while she is on a sheep; `manual` and `ride` are mutually exclusive by condition, and their
 * priorities never decide between them.
 */
export const ride: LunaBehaviour = {
  id: 'ride',
  chain: 'command',
  priority: 80,
  condition: (_, l) => l.mounting !== null && !l.riding,
  tick: ({ state, now, dt, rain }, l) => {
    const sheep = findSheep(state, l.mounting);
    if (!sheep || sheep.resting || rain) {
      l.mounting = null;
      l.anim = 'sit';
      return;
    }
    l.target = { x: sheep.x + SFOOT[0] - 14, y: sheep.y + SFOOT[1] + 2 };
    l.anim = 'run';
    if (walkLuna(l, dt, 80)) {
      l.riding = sheep.id;
      l.mounting = null;
      sheep.ridden = true;
      sheep.tx = sheep.ty = null;
      sheep.path = [];
      sheep.resting = false;
      l.rideUntilMs = now + (l.manual === 'ride' ? RULES.rideManualMs : RULES.rideMs);
      l.manual = null;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `routine`: the prototype's second chain, in its `else if` order.
// ---------------------------------------------------------------------------------------------

/** A head tilt (or the never-set "bark" routine) drops into a pant. */
export const tiltRecover: LunaBehaviour = {
  id: 'tiltRecover',
  chain: 'routine',
  priority: 70,
  condition: (_, l) => l.routine === 'bark' || l.anim === 'tilt',
  tick: ({ now }, l) => {
    l.routine = null;
    l.anim = 'pant';
    l.t0Ms = now;
    l.target = null;
  },
};

/** Panting settles into a sit after 2.5 s. */
export const pantRest: LunaBehaviour = {
  id: 'pantRest',
  chain: 'routine',
  priority: 65,
  condition: ({ now }, l) => l.anim === 'pant' && now - l.t0Ms > 2500,
  tick: ({ now }, l) => {
    l.anim = 'sit';
    l.t0Ms = now;
  },
};

/**
 * Rain shepherd: run to the door, wait there facing the nearest sheep still out until every sheep
 * is in, enter last, and come back out to sit at the door when the rain stops.
 */
export const rainShepherd: LunaBehaviour = {
  id: 'rainShepherd',
  chain: 'routine',
  priority: 60,
  condition: ({ rain }, l) => (rain && !l.inBarn && !SHELTER_ROUTINES.includes(l.routine)) || SHELTER_ROUTINES.includes(l.routine) || l.inBarn,
  tick: ({ state, now, dt, rain }, l) => {
    if (rain && !l.inBarn && !SHELTER_ROUTINES.includes(l.routine)) {
      l.routine = 'shelterWait';
      l.chasing = false;
      state.life.rabbit = null;
      l.target = { ...DOOR_WAIT };
      l.anim = 'run';
    } else if (l.routine === 'shelterWait') {
      if (!rain) {
        l.routine = null;
        l.anim = 'sit';
      } else if (walkLuna(l, dt, 80)) {
        const pending = state.sheep.filter((s) => !s.inBarn && !s.outside);
        if (pending.length) {
          l.anim = now % 6000 < 1400 ? 'tilt' : 'sit'; // an occasional head-tilt, not a twitch
          if (!l.dirAtMs || now - l.dirAtMs > 700) {
            // re-face at most about once a second, and only if the sheep is clearly to one side
            let nearest = pending[0]!;
            let bd = Math.hypot(nearest.x - l.x, nearest.y - l.y);
            for (const s of pending) {
              const d = Math.hypot(s.x - l.x, s.y - l.y);
              if (d < bd) {
                bd = d;
                nearest = s;
              }
            }
            const dx = nearest.x + SFOOT[0] - (l.x + LFOOT[0]);
            if (Math.abs(dx) > 12) l.dir = dx > 0 ? 1 : -1;
            l.dirAtMs = now;
          }
        } else {
          l.routine = 'shelterEnter';
          l.target = { x: SPOT.barnDoor.x, y: SPOT.barnDoor.y };
          l.anim = 'run';
        }
      }
    } else if (l.routine === 'shelterEnter') {
      if (!rain) {
        l.routine = null;
        l.anim = 'sit';
      } else if (walkLuna(l, dt, 80)) {
        l.inBarn = true;
        l.routine = null;
      }
    } else if (l.inBarn) {
      if (!rain) {
        leaveBarn(l);
        l.anim = 'sit';
        l.t0Ms = now;
      }
    }
  },
};

/** Dusk: trot to the doorway, circle, sleep. Dawn: wake, stretch, sit. */
export const bedtime: LunaBehaviour = {
  id: 'bedtime',
  chain: 'routine',
  priority: 50,
  condition: ({ phase, night, calm }, l) =>
    ((phase === 'dusk' || night) && calm && l.routine !== 'bed' && l.routine !== 'asleep') ||
    l.routine === 'bed' ||
    l.routine === 'asleep' ||
    l.anim === 'stretch',
  tick: ({ now, dt, phase, night, calm }, l) => {
    if ((phase === 'dusk' || night) && calm && l.routine !== 'bed' && l.routine !== 'asleep') {
      l.routine = 'bed';
      l.target = { ...BED };
      l.anim = 'run';
    } else if (l.routine === 'bed') {
      if (walkLuna(l, dt, 70)) {
        if (l.circleUntilMs === null) l.circleUntilMs = now + 1800;
        l.anim = 'run';
        l.dir = Math.floor(now / 450) % 2 ? 1 : -1;
        l.x += Math.sin(now / 140) * 14 * dt;
        if (now > l.circleUntilMs) {
          l.circleUntilMs = null;
          l.routine = 'asleep';
          l.anim = 'sleep';
          l.dir = 1;
        }
      }
    } else if (l.routine === 'asleep') {
      if (phase === 'dawn' || phase === 'day') {
        l.routine = null;
        l.anim = 'stretch';
        l.t0Ms = now;
      }
    } else if (l.anim === 'stretch') {
      if (now - l.t0Ms > 2700) {
        l.anim = 'sit';
        l.t0Ms = now;
      }
    }
  },
};

/** On a hot day a sitting dog sometimes pants. The roll is in the condition, as the prototype's. */
export const hotPant: LunaBehaviour = {
  id: 'hotPant',
  chain: 'routine',
  priority: 40,
  condition: ({ rng, dt, night, temp }, l) => l.anim === 'sit' && temp > 27 && !night && chance(rng, dt * 0.15),
  tick: ({ now }, l) => {
    l.anim = 'pant';
    l.t0Ms = now;
  },
};

// Idle play: after seven calm seconds of sitting, one roll picks a play. The weights are the
// prototype's thresholds (r < .22 flop, < .44 stick, < .56 ride, < .78 nibble, else rabbit).

export const IDLE_PLAYS = createRegistry<LunaContext, Luna>();

export const flop: LunaBehaviour = IDLE_PLAYS.register({
  id: 'flop',
  priority: 0,
  weight: 0.22,
  condition: () => true,
  tick: ({ now }, l) => {
    l.anim = 'flop';
    l.t0Ms = now;
  },
});

export const stickZoomies: LunaBehaviour = IDLE_PLAYS.register({
  id: 'stick',
  priority: 0,
  weight: 0.22,
  condition: () => true,
  tick: ({ rng }, l) => {
    l.anim = 'stick';
    l.target = randomFoot(rng);
  },
});

export const rideASheep: LunaBehaviour = IDLE_PLAYS.register({
  id: 'rideSheep',
  priority: 0,
  weight: 0.12,
  condition: () => true,
  tick: ({ state, rng }, l) => {
    const cand = state.sheep.filter((s) => !s.inBarn && !s.ridden && !s.resting);
    if (cand.length) l.mounting = pick(rng, cand).id;
  },
});

export const nibbleGrass: LunaBehaviour = IDLE_PLAYS.register({
  id: 'nibbleGrass',
  priority: 0,
  weight: 0.22,
  condition: () => true,
  tick: ({ state }, l) => {
    const t = nearestTuft(state.tufts, foot(l), 0.5);
    if (t !== null) claimTuft(state, l, t);
  },
});

export const chaseRabbit: LunaBehaviour = IDLE_PLAYS.register({
  id: 'rabbit',
  priority: 0,
  weight: 0.22,
  condition: () => true,
  tick: ({ state, rng, now }, l) => {
    state.life.rabbit = { x: 30, y: 150 + nextFloat(rng) * 120, t0Ms: now };
    l.chasing = true;
    l.anim = 'run';
  },
});

export const idlePlay: LunaBehaviour = {
  id: 'idlePlay',
  chain: 'routine',
  priority: 30,
  condition: ({ night, calm }, l) => l.anim === 'sit' && calm && !night,
  tick: (ctx, l) => {
    l.idle += ctx.dt;
    if (l.idle > 7) {
      l.idle = 0;
      IDLE_PLAYS.run(ctx, l);
    }
  },
};

/** A belly flop lasts five seconds. */
export const flopUp: LunaBehaviour = {
  id: 'flopUp',
  chain: 'routine',
  priority: 20,
  condition: ({ now }, l) => l.anim === 'flop' && now - l.t0Ms > 5000,
  tick: (_, l) => {
    l.anim = 'sit';
  },
};

/** Nibbling eats the claimed tuft for four seconds or until it is nearly gone. */
export const nibble: LunaBehaviour = {
  id: 'nibble',
  chain: 'routine',
  priority: 15,
  // The prototype dereferences `luna.tuft` here without a check and throws when the manual nibble
  // found no tuft; the `tuft !== null` guard is the one deliberate departure.
  condition: (_, l) => l.anim === 'nibble' && l.tuft !== null,
  tick: ({ state, now, dt }, l) => {
    const t = state.tufts[l.tuft as number] as Tuft;
    t.level -= dt * 0.05;
    if (now - l.t0Ms > 4000 || t.level < 0.1) {
      releaseTuft(state, l);
      l.anim = 'sit';
      l.t0Ms = now;
    }
  },
};

/** A sleep pose outside the asleep routine (the nap button) becomes a sit on the next tick. */
export const sleepFix: LunaBehaviour = {
  id: 'sleepFix',
  chain: 'routine',
  priority: 10,
  condition: (_, l) => l.anim === 'sleep' && l.routine !== 'asleep',
  tick: (_, l) => {
    l.anim = 'sit';
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `move`: the prototype's movement pass after both chains.
// ---------------------------------------------------------------------------------------------

export const walk: LunaBehaviour = {
  id: 'walk',
  chain: 'move',
  priority: 0,
  condition: (_, l) => !l.manual && !l.riding && !l.mounting && !l.inBarn,
  tick: ({ state, now, dt }, l) => {
    const rabbit = state.life.rabbit;
    if (rabbit && l.chasing) {
      l.target = { x: rabbit.x - 30, y: rabbit.y + 22 };
      l.anim = 'run';
    }
    if (l.target && (l.chasing || l.anim === 'run' || l.anim === 'stick') && !BUSY_ROUTINES.includes(l.routine)) {
      if (walkLuna(l, dt, l.anim === 'stick' ? RULES.speed.lunaCarry : RULES.speed.lunaRun)) {
        if (l.chasing) {
          /* caught up; the rabbit keeps hopping */
        } else if (l.anim === 'stick') l.anim = 'sit';
        else if (l.tuft !== null) {
          l.anim = 'nibble';
          l.t0Ms = now;
          l.dir = 1;
        } else {
          l.anim = 'sit';
          l.t0Ms = now;
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The registry, in the owner's order.
// ---------------------------------------------------------------------------------------------

export const LUNA_BEHAVIOURS = createRegistry<LunaContext, Luna>();
for (const b of [riding, fetch, manual, ride, tiltRecover, pantRest, rainShepherd, bedtime, hotPant, idlePlay, flopUp, nibble, sleepFix, walk]) {
  LUNA_BEHAVIOURS.register(b);
}

/** Build the per-tick context the prototype computed at the top of `tick`. */
export function lunaContext(s: SimState): LunaContext {
  const phase = phaseOf(s.clock.t);
  return {
    state: s,
    rng: s.rng,
    now: s.clock.nowMs,
    dt: TICK_SEC,
    phase,
    night: phase === 'night',
    rain: s.weather.rain,
    temp: s.weather.temp,
    calm: true,
  };
}

/**
 * One tick of Digital Luna. Mutates `s`, which must be a private copy. Returns the ids of the
 * behaviours that ran, so tests and a debug overlay can see why she did what she did.
 */
export function tickLuna(s: SimState): string[] {
  const ctx = lunaContext(s);
  const l = s.luna;
  if (!(l.iconUntilMs && ctx.now < l.iconUntilMs)) l.icon = null;
  const ran = LUNA_BEHAVIOURS.run(ctx, l);
  if (ran.includes(fetch.id)) return ran; // the prototype returns out of tick from the fetch branch
  clampField(l, LFOOT);
  const { dt, rain } = ctx;
  l.wet = Math.max(0, Math.min(1, l.wet + (rain && !l.inBarn ? dt / 6 : -dt / 45)));
  const snowing = s.weather.kind === 'snow' && !l.inBarn && !l.target;
  l.snow = Math.max(0, Math.min(1, l.snow + (snowing ? dt / 10 : -(rain ? dt / 2 : dt / 25))));
  return ran;
}

/** The prototype's `bubble(luna, "heart", 1600); luna.tagUntil = now + 1800` from a pet. */
export function petLuna(l: Luna, now: number): void {
  bubble(l, 'heart', 1600, now);
  l.tagUntilMs = now + 1800;
}

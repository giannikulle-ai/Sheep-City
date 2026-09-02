// Sheep behaviours, ported at parity from the "sheep (just sheep now)" block of
// prototype/luna-farm/src/sim_template.html. For every sheep, every frame, the prototype runs:
//
//   1. fleece growth and a pending shear;
//   2. in rain: walk to the barn door once; otherwise: leave the barn if inside, night rest or a
//      daytime wake-up roll, the needs pick, eating, and lambs;
//   3. the movement pass, then clamp, wet, snow, and the lambs trailing behind.
//
// Those are independent sections rather than one if/else, so they are registry chains that all
// run each tick in the prototype's order: `shelter`, `rest`, `needs`, `eat`, `lambs`, `move`.
// Priorities inside a chain follow the prototype's `if / else if` order. The needs pick is one
// weighted roll with the prototype's thresholds (.5 / .62 / .72 / .8), drawn by the registry.

import { nearestTuft } from '../actors';
import { phaseOf } from '../clock';
import { SFOOT, SPOT, randomFoot, type Point } from '../geometry';
import { clampField, clampMoverTarget, stepToward } from '../movement';
import { chance, nextFloat, type Rng } from '../rng';
import { RULES, TICK_SEC } from '../rules';
import { makeSheep, type Sheep, type SimState, type Tuft } from '../state';
import { type Behaviour, createRegistry } from './registry';

/** What one sheep tick sees: the world, and the frame values the prototype computed up front. */
export interface SheepContext {
  state: SimState;
  rng: Rng;
  /** Sim milliseconds; the prototype's `now`. */
  now: number;
  /** Seconds in this tick; the prototype's `dt`. */
  dt: number;
  night: boolean;
  rain: boolean;
  snow: boolean;
  /** This sheep's foot at the top of its tick: the prototype's `fx, fy`, taken before anything moved. */
  fx: number;
  fy: number;
  /** Sheep plus lambs on the farm, kept current as lambs are born within the tick. */
  flock: number;
}

export type SheepBehaviour = Behaviour<SheepContext, Sheep>;

const S = RULES.sheep;

/** The prototype's `setPath`: queue foot points and start on the first leg. */
export function setPath(s: Sheep, pts: readonly Point[]): void {
  s.path = pts.map((p) => ({ x: p.x, y: p.y }));
  s.tx = s.ty = null;
  s.wp = null;
  nextLeg(s);
}

/** The prototype's `nextLeg`: pop the next foot point into `tx, ty`. False when the path is done. */
export function nextLeg(s: Sheep): boolean {
  const p = s.path.shift();
  if (!p) return false;
  s.tx = p.x;
  s.ty = p.y;
  return true;
}

/** Sheep plus lambs on the farm: what `flockCap` counts. */
export function flockCount(state: SimState): number {
  let n = state.sheep.length;
  for (const q of state.sheep) n += q.lambs.length;
  return n;
}

function tuftOf(state: SimState, s: Sheep): Tuft | null {
  return s.tuft === null ? null : (state.tufts[s.tuft] ?? null);
}

// ---------------------------------------------------------------------------------------------
// Chain `shelter`: `if (rain) { ... } else { leave the barn; ... }`.
// ---------------------------------------------------------------------------------------------

/** Rain: a sheep that is standing still and not yet sheltering walks to the barn door once. */
export const rainShelter: SheepBehaviour = {
  id: 'rainShelter',
  contextOnly: true,
  chain: 'shelter',
  priority: 100,
  condition: ({ rain }) => rain,
  tick: ({ rng }, s) => {
    if (s.tx === null && !s.shelter && !s.inBarn) {
      s.shelter = true;
      s.resting = false;
      setPath(s, [{ x: SPOT.barnDoor.x + (nextFloat(rng) * 10 - 5), y: SPOT.barnDoor.y }]);
      s.toBarn = true;
    }
  },
};

/** No rain: a sheep in the barn steps out of the doorway and wanders off; `shelter` clears. */
export const leaveShelter: SheepBehaviour = {
  id: 'leaveShelter',
  contextOnly: true,
  chain: 'shelter',
  priority: 0,
  condition: ({ rain }) => !rain,
  tick: ({ rng }, s) => {
    if (s.inBarn) {
      s.inBarn = false;
      s.shelter = false;
      s.x = SPOT.barnDoor.x - SFOOT[0] + (nextFloat(rng) * 14 - 7);
      s.y = SPOT.barnDoor.y - SFOOT[1] + 2;
      setPath(s, [randomFoot(rng)]);
      s.wander = 1;
    }
    s.shelter = false;
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `rest`: night forces rest; by day a resting sheep gets up on a roll.
// ---------------------------------------------------------------------------------------------

export const nightRest: SheepBehaviour = {
  id: 'nightRest',
  chain: 'rest',
  priority: 10,
  condition: ({ rain, night }, s) => !rain && night && s.tx === null && !s.eating,
  tick: (_, s) => {
    s.resting = true;
  },
};

/** The roll is in the condition, as the prototype's `else if (s.resting && Math.random() < dt * .4)`. */
export const wake: SheepBehaviour = {
  id: 'wake',
  chain: 'rest',
  priority: 0,
  condition: ({ rain, night, rng, dt }, s) => !rain && !night && s.resting && chance(rng, dt * S.wakePerSec),
  tick: ({ now }, s) => {
    s.resting = false;
    s.t0Ms = now;
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `needs`: once the gate roll passes, one weighted roll picks graze / hay / drink / rest /
// wander. The prototype computes `r` and the nearest tall tuft first, then walks its ladder.
// ---------------------------------------------------------------------------------------------

export const NEEDS = createRegistry<SheepContext, Sheep>();

function hayTrip(rng: Rng, s: Sheep): void {
  setPath(s, [{ x: SPOT.hay.x - 20 + nextFloat(rng) * 12, y: SPOT.hay.y + 10 }]);
  s.wander = 1;
  s.hayTrip = true;
}

/** A random foot point, pulled two thirds of the way to the flock's centre when it snows. */
function wanderOrHuddle({ state, rng, snow }: SheepContext, s: Sheep): void {
  if (snow) {
    let sx = 0;
    let sy = 0;
    for (const q of state.sheep) {
      sx += q.x;
      sy += q.y;
    }
    const cx = sx / state.sheep.length + SFOOT[0];
    const cy = sy / state.sheep.length + SFOOT[1];
    const f = randomFoot(rng);
    setPath(s, [{ x: (f.x + cx * 2) / 3, y: (f.y + cy * 2) / 3 }]);
  } else {
    setPath(s, [randomFoot(rng)]);
  }
  s.wander = 1;
}

/**
 * Graze the nearest tall tuft. The prototype's test is `t && r < .5`: when no tall tuft is free
 * the same roll falls through to `r < .62`, the hay trip, so that fallback lives here and hay
 * effectively gets 62% of picks on a bare field.
 */
export const graze: SheepBehaviour = NEEDS.register({
  id: 'graze',
  priority: 0,
  weight: S.pick.graze,
  condition: () => true,
  tick: ({ state, rng, fx, fy }, s) => {
    const i = nearestTuft(state.tufts, { x: fx, y: fy }, S.tuftMinLevel);
    if (i === null) {
      hayTrip(rng, s);
      return;
    }
    const t = state.tufts[i] as Tuft;
    t.claimed = s.id;
    s.tuft = i;
    setPath(s, [{ x: t.x - (s.dir > 0 ? 16 : -16), y: t.y + 2 }]);
    s.wander = 1;
  },
});

export const hay: SheepBehaviour = NEEDS.register({
  id: 'hay',
  priority: 0,
  weight: S.pick.hay,
  condition: () => true,
  tick: ({ rng }, s) => hayTrip(rng, s),
});

export const drink: SheepBehaviour = NEEDS.register({
  id: 'drink',
  priority: 0,
  weight: S.pick.drink,
  condition: () => true,
  tick: (_, s) => {
    setPath(s, [{ x: SPOT.trough.x + 16, y: SPOT.trough.y + 4 }]);
    s.wander = 1;
    s.drinkTrip = true;
  },
});

/**
 * The rest band: `else if (r < .8 && Math.random() < dt * 2)`. The second roll almost always
 * fails at 100 ms (dt * 2 = .2), and a failed roll falls through to the wander branch, as in the
 * prototype. Odd but kept.
 */
export const rest: SheepBehaviour = NEEDS.register({
  id: 'rest',
  priority: 0,
  weight: S.pick.rest,
  condition: () => true,
  tick: (ctx, s) => {
    if (chance(ctx.rng, ctx.dt * S.restRollPerSec)) s.resting = true;
    else wanderOrHuddle(ctx, s);
  },
});

export const wander: SheepBehaviour = NEEDS.register({
  id: 'wander',
  priority: 0,
  weight: S.pick.wander,
  condition: () => true,
  tick: wanderOrHuddle,
});

/** The gate: a settled, awake, unridden sheep by day rolls `dt * .14` for a new need. */
export const pickNeed: SheepBehaviour = {
  id: 'pickNeed',
  chain: 'needs',
  priority: 0,
  condition: ({ rain, night, rng, dt }, s) => !rain && !night && !s.resting && s.tx === null && !s.eating && !s.ridden && chance(rng, dt * S.needRollPerSec),
  tick: (ctx, s) => {
    NEEDS.step(ctx, s);
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `eat`: bite the claimed tuft; stop when it is bare or on a roll.
// ---------------------------------------------------------------------------------------------

export const eat: SheepBehaviour = {
  id: 'eat',
  chain: 'eat',
  priority: 0,
  condition: ({ rain }, s) => !rain && s.eating,
  tick: ({ state, rng, now, dt }, s) => {
    const t = tuftOf(state, s);
    if (t) t.level -= dt * RULES.tuftBitePerSec;
    if ((t && t.level < S.tuftEmptyAt) || chance(rng, dt * S.stopEatingPerSec)) {
      if (t) t.claimed = null;
      s.eating = false;
      s.tuft = null;
      s.hayTrip = false;
      s.drinkTrip = false;
      s.t0Ms = now;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `lambs`: a rare birth when settled, growing up, and the promotion to a named sheep.
// ---------------------------------------------------------------------------------------------

/** Where a newborn lamb appears, relative to its mother's sprite: the prototype's `(x - 18, y + 8)`. */
export function newLamb(s: Sheep, now: number): Sheep['lambs'][number] {
  return { x: s.x - 18, y: s.y + 8, dir: s.dir, bornMs: now, grown: false };
}

export const lambs: SheepBehaviour = {
  id: 'lambs',
  contextOnly: true,
  chain: 'lambs',
  priority: 0,
  condition: ({ rain }) => !rain,
  tick: (ctx, s) => {
    const { state, rng, now, dt } = ctx;
    if (!s.lambs.length && ctx.flock < RULES.flockCap && chance(rng, dt * RULES.lambChancePerSec)) {
      s.lambs.push(newLamb(s, now));
      ctx.flock++;
    }
    for (const l of s.lambs) if (now - l.bornMs > RULES.lambGrowMs) l.grown = true;
    const l = s.lambs.find((x) => x.grown);
    if (l) {
      s.lambs = s.lambs.filter((x) => x !== l);
      const ns = makeSheep(rng, state.nameIdx++, { x: l.x + 10, y: l.y + 12 });
      ns.wool = S.shornWool;
      // Pushed mid-loop: the prototype's `for (const s of sheep)` visits the new sheep this same frame.
      state.sheep.push(ns);
    }
  },
};

// ---------------------------------------------------------------------------------------------
// Chain `move`: the movement pass. Arrival ends the leg, the trip, or the walk into the barn.
// ---------------------------------------------------------------------------------------------

export const walk: SheepBehaviour = {
  id: 'walk',
  chain: 'move',
  priority: 0,
  condition: (_, s) => s.tx !== null,
  tick: ({ state, dt, fx }, s) => {
    if (!s.entering) clampMoverTarget(s);
    const arrived = stepToward(s, SFOOT, s.wander ? RULES.speed.sheepWander : RULES.speed.sheepWalk, dt);
    if (!arrived) return;
    s.tx = s.ty = null;
    if (nextLeg(s)) return;
    s.wander = 0;
    if (s.toBarn) {
      s.toBarn = false;
      s.inBarn = true;
    }
    if (s.tuft !== null || s.hayTrip || s.drinkTrip) {
      s.eating = true;
      const t = tuftOf(state, s);
      // Faces the tuft from where the frame started, as the prototype's `fx` was computed up top.
      if (t) s.dir = t.x > fx ? 1 : -1;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// The registry, in the prototype's order.
// ---------------------------------------------------------------------------------------------

export const SHEEP_BEHAVIOURS = createRegistry<SheepContext, Sheep>();
for (const b of [rainShelter, leaveShelter, nightRest, wake, pickNeed, eat, lambs, walk]) SHEEP_BEHAVIOURS.register(b);

/** Build the per-tick context the prototype computed at the top of `tick`. `foot` is per sheep. */
export function sheepContext(s: SimState): SheepContext {
  return {
    state: s,
    rng: s.rng,
    now: s.clock.nowMs,
    dt: TICK_SEC,
    night: phaseOf(s.clock.t) === 'night',
    rain: s.weather.rain,
    snow: s.weather.kind === 'snow',
    fx: 0,
    fy: 0,
    flock: flockCount(s),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** One tick of every sheep. Mutates `s`, which must be a private copy. */
export function tickSheep(s: SimState): void {
  const ctx = sheepContext(s);
  const { dt, rain, snow } = ctx;
  // An index loop on purpose: a lamb that grows up this tick is pushed onto `sheep`, and the
  // prototype's `for (const s of sheep)` reached it in the same frame.
  for (let i = 0; i < s.sheep.length; i++) {
    const sheep = s.sheep[i] as Sheep;
    // Fleece grows over woolGrowSec; a pending shear completes and banks the wool.
    sheep.wool = Math.min(1, sheep.wool + dt / RULES.woolGrowSec);
    if (sheep.shearAtMs !== null && ctx.now > sheep.shearAtMs) {
      sheep.shearAtMs = null;
      sheep.wool = S.shornWool;
      s.banks.wool++;
    }
    ctx.fx = sheep.x + SFOOT[0];
    ctx.fy = sheep.y + SFOOT[1];
    SHEEP_BEHAVIOURS.step(ctx, sheep);
    clampField(sheep, SFOOT);
    // Weather looks: wet in rain, snow settling on the back while standing still.
    const outside = !sheep.inBarn;
    sheep.wet = clamp01(sheep.wet + (rain && outside ? dt / 6 : -dt / 45));
    sheep.snow = clamp01(sheep.snow + (snow && outside && sheep.tx === null ? dt / 10 : -(rain ? dt / 2 : dt / 25)));
    // Lambs trail the mother in a line, each easing towards the one before.
    let px = sheep.x - sheep.dir * 18;
    let py = sheep.y + 8;
    for (const l of sheep.lambs) {
      l.x += (px - l.x) * S.lambFollowRate * dt;
      l.y += (py - l.y) * S.lambFollowRate * dt;
      l.dir = sheep.dir;
      px = l.x - sheep.dir * 14;
      py = l.y + 2;
    }
  }
}

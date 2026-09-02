// Shared scaffolding for the sheep, lamb, and NPC tests.
import { createRng, nextFloat, type Rng } from '../src/rng';
import type { Sheep, SimState } from '../src/state';

/**
 * One word for what a sheep is doing, from its flags: where it is, what it is walking to, what
 * it is eating. `*` marks a ridden sheep; a trailing `+n` counts its lambs.
 */
export function describeSheep(q: Sheep): string {
  let what: string;
  if (q.inBarn) what = 'barn';
  else if (q.resting) what = 'rest';
  else if (q.eating) what = q.tuft !== null ? 'graze' : q.hayTrip ? 'hay' : q.drinkTrip ? 'drink' : 'chew';
  else if (q.tx !== null) what = q.toBarn ? 'toBarn' : q.tuft !== null ? 'toTuft' : q.hayTrip ? 'toHay' : q.drinkTrip ? 'toTrough' : q.wander ? 'wander' : 'walk';
  else what = 'idle';
  return `${what}${q.ridden ? '*' : ''}${q.lambs.length ? `+${q.lambs.length}` : ''}`;
}

/** Sheep plus lambs. */
export function flockOf(s: SimState): number {
  return s.sheep.length + s.sheep.reduce((n, q) => n + q.lambs.length, 0);
}

/** Find a generator state whose successive floats satisfy `preds` in order. */
export function rngWhereFloats(preds: readonly ((r: number) => boolean)[], maxSeed = 3000000): Rng {
  for (let seed = 0; seed < maxSeed; seed++) {
    const r = createRng(seed);
    let ok = true;
    for (const p of preds) {
      if (!p(nextFloat(r))) {
        ok = false;
        break;
      }
    }
    if (ok) return createRng(seed);
  }
  throw new Error('no seed satisfies the float sequence');
}

export const below = (p: number) => (r: number) => r < p;
export const between = (lo: number, hi: number) => (r: number) => r >= lo && r < hi;
export const atLeast = (p: number) => (r: number) => r >= p;

/** Park every sheep: standing still, awake, not eating, no path, no lamb. */
export function settle(s: SimState): SimState {
  for (const q of s.sheep) {
    q.tx = q.ty = null;
    q.path = [];
    q.wp = null;
    q.resting = false;
    q.eating = false;
    q.tuft = null;
    q.hayTrip = false;
    q.drinkTrip = false;
    q.wander = 0;
    q.inBarn = false;
    q.shelter = false;
    q.toBarn = false;
  }
  for (const t of s.tufts) t.claimed = null;
  return s;
}

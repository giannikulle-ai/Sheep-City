// Small shared helpers for actors: ids, lookups, icon bubbles, tuft search.

import type { Point } from './geometry';
import type { ActorId, Sheep, SimState, Tuft } from './state';

/** Digital Luna's actor id, used when she claims a tuft. */
export const LUNA_ID: ActorId = 'luna';

export function findSheep(state: SimState, id: ActorId | null): Sheep | null {
  if (id === null) return null;
  for (const s of state.sheep) if (s.id === id) return s;
  return null;
}

/** The prototype's `bubble`: show an icon over an actor for `ms` sim-milliseconds. */
export function bubble(actor: { icon: string | null; iconUntilMs: number }, icon: string, ms: number, now: number): void {
  actor.icon = icon;
  actor.iconUntilMs = now + ms;
}

/**
 * The prototype's `nearestTuft`: index of the closest unclaimed tuft at or above `minLevel`, or
 * null. Ties keep the lowest index, as the prototype's strict `<` did.
 */
export function nearestTuft(tufts: readonly Tuft[], foot: Point, minLevel: number): number | null {
  let best: number | null = null;
  let bd = 1e9;
  for (let i = 0; i < tufts.length; i++) {
    const t = tufts[i] as Tuft;
    if (t.claimed !== null || t.level < minLevel) continue;
    const dd = Math.hypot(t.x - foot.x, t.y - foot.y);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}

// What an event actually does: the generic hook vocabulary every card and authored event shares,
// and the code effects of the four reference cards (#40) whose data alone cannot describe them.
//
// Digital Luna is never written from here. The one reference card that involves her — `lostLamb`,
// "a lamb wanders off, DL fetches it" — sets a lamb loose and leaves a marker on `state.events`;
// her own `fetchLamb` behaviour, registered in her chain in behaviours/luna.ts, is what reads it
// and walks her out. No hook in this file names `state.luna`, and a test asserts it
// (test/engine-events.test.ts, "no engine hook writes to Digital Luna").

import { SFOOT, SPOT } from '../geometry';
import { summonFarmer, summonMerchant } from '../npcs';
import { nextInt } from '../rng';
import { TICK_SEC } from '../rules';
import type { Lamb, Sheep, SimState } from '../state';
import type { EventHook } from './deck';
import { MOOD_RANGE } from './events';

/** The numbers the reference cards run on, as data. */
export const REFERENCE_RULES = {
  /**
   * `shearingDay` tops every fleece up to this before the farmer walks in: the deck's "every sheep
   * goes fluffy at once". 1 is a full fleece, well above the farmer's own `farmer.shearAt` (0.6),
   * so nobody is skipped when he works down the field.
   */
  shearingDayFleece: 1,
  /**
   * Where a lost lamb wanders to, as a foot point: the fence corner by the gate (`SPOT.web`).
   * Inside the field diamond that `clampTarget` pulls Digital Luna's targets into (0.81 of it), so
   * she can actually reach the lamb — a point past the outer gate would clamp away from it and she
   * would walk to a spot near the lamb and stand there for the rest of the card.
   */
  lostLambSpot: { ...SPOT.web },
  /** How fast a lost lamb dawdles off, px/s. Under a sheep's wander speed: it is not running away. */
  lostLambSpeedPxPerSec: 18,
} as const;

/** One reference card's code, against its own v2 data. Every field is optional. */
export interface ReferenceEffects {
  /** Runs after the card's data hooks, when it starts. */
  start?: (state: SimState) => void;
  /** Runs before the card's data hooks, when it ends. */
  end?: (state: SimState) => void;
  /** Runs every tick while the card is running. */
  tick?: (state: SimState) => void;
  /** True when the world has already finished this card, so it ends early rather than on its clock. */
  done?: (state: SimState) => boolean;
}

/** The mother and index of the lamb the `lostLamb` card walked off, or null. */
export function findLostLamb(state: SimState): { mother: Sheep; index: number; lamb: Lamb } | null {
  const lost = state.events.lostLamb;
  if (!lost) return null;
  for (const s of state.sheep) {
    if (s.id !== lost.sheep) continue;
    for (let i = 0; i < s.lambs.length; i++) {
      const lamb = s.lambs[i] as Lamb;
      if (lamb.bornMs === lost.bornMs) return { mother: s, index: i, lamb };
    }
  }
  return null;
}

/** Put the lamb back on its mother's trail and forget it. Called when it is fetched, or at the end. */
export function releaseLostLamb(state: SimState): void {
  const found = findLostLamb(state);
  if (found) delete found.lamb.lost;
  state.events.lostLamb = null;
}

function startLostLamb(state: SimState): void {
  // Every lamb out on the field is a candidate; the engine's own generator picks one, so which lamb
  // wanders is part of the determinism hash like the draw that started the card.
  const candidates: { sheep: Sheep; index: number }[] = [];
  for (const s of state.sheep) {
    if (s.inBarn) continue;
    for (let i = 0; i < s.lambs.length; i++) if (!(s.lambs[i] as Lamb).lost) candidates.push({ sheep: s, index: i });
  }
  if (candidates.length === 0) return;
  const pick = candidates[nextInt(state.events.rng, candidates.length)] as { sheep: Sheep; index: number };
  const lamb = pick.sheep.lambs[pick.index] as Lamb;
  lamb.lost = true;
  state.events.lostLamb = { sheep: pick.sheep.id, bornMs: lamb.bornMs };
}

function tickLostLamb(state: SimState): void {
  const found = findLostLamb(state);
  // The lamb grew up, or its mother left the flock, between one tick and the next.
  if (!found) {
    state.events.lostLamb = null;
    return;
  }
  const lamb = found.lamb;
  // In foot coordinates, like every other walk in the package: a lamb's `x, y` is its sprite's
  // top-left, and `SFOOT` is the offset to the feet it stands on (a lamb is drawn smaller than its
  // mother, and the sim only needs a point to walk to).
  const to = REFERENCE_RULES.lostLambSpot;
  const dx = to.x - (lamb.x + SFOOT[0]);
  const dy = to.y - (lamb.y + SFOOT[1]);
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  const step = Math.min(d, REFERENCE_RULES.lostLambSpeedPxPerSec * TICK_SEC);
  lamb.x += (dx / d) * step;
  lamb.y += (dy / d) * step;
  lamb.dir = dx < 0 ? -1 : 1;
}

/**
 * The four reference cards, in code, against their v2 data (issue #40). Everything else in the
 * deck runs on its data hooks alone.
 */
export const REFERENCE_EFFECTS: Readonly<Record<string, ReferenceEffects>> = {
  /** Fog morning: the visibility flag is the data hook's; the sky's own fog flag is this. */
  fogMorning: {
    start: (state) => {
      // The same flag the deity `weather` power's `fog` kind sets (PR #43), reused rather than
      // duplicated: fog sits over whatever `kind` is and never touches the season's own shower.
      state.weather.foggy = true;
    },
    end: (state) => {
      delete state.weather.foggy;
    },
  },
  /** Lost lamb: one lamb off the trail and out towards the gate; her chain brings it home. */
  lostLamb: {
    start: startLostLamb,
    tick: tickLostLamb,
    // Her chain clears the marker the moment she reaches the lamb, and that is the card's end: it
    // is over when the lamb is home, not when a timer says so. The duration is the backstop.
    done: (state) => state.events.lostLamb === null,
    end: releaseLostLamb,
  },
  /** Merchant caravan: the cart, on a draw instead of on `npcs.merchantAtMs`. */
  merchantCaravan: { start: (state) => summonMerchant(state) },
  /** Shearing day: every fleece ready at once, and a farmer's visit outside his two. */
  shearingDay: {
    start: (state) => {
      for (const s of state.sheep) s.wool = Math.max(s.wool, REFERENCE_RULES.shearingDayFleece);
      summonFarmer(state);
    },
  },
};

/**
 * Run one data hook. `spawn` places the two NPCs the sim has actors for; the deck's crows, cats and
 * fireflies have no actor yet (their art and behaviour are their own tickets), so those spawns are
 * a no-op — the event still runs, still writes its chronicle line, and still holds its slot, it
 * simply puts nothing on the field. `mood` moves one district-wide number: mood is not a Ledger
 * stock yet (`moodOf` in ledger/ledger.ts is a reading of the other numbers), so the per-target
 * split the hook carries is recorded in the data and not yet modelled.
 */
export function runHook(state: SimState, hook: EventHook): void {
  switch (hook.op) {
    case 'setVisibility':
      state.events.visibility = Math.max(0, Math.min(1, hook.value));
      return;
    case 'flag':
      state.events.flags[hook.name] = hook.value;
      return;
    case 'mood':
      state.events.mood = Math.max(MOOD_RANGE.min, Math.min(MOOD_RANGE.max, state.events.mood + hook.delta));
      return;
    case 'coins':
      state.banks.coins = Math.max(0, state.banks.coins + hook.delta);
      return;
    case 'spawn':
      if (hook.what === 'merchant') summonMerchant(state);
      else if (hook.what === 'farmer') summonFarmer(state);
      return;
    default: {
      const never: never = hook;
      throw new Error(`event hook: unknown op ${JSON.stringify(never)}`);
    }
  }
}

export function runHooks(state: SimState, hooks: readonly EventHook[]): void {
  for (const hook of hooks) runHook(state, hook);
}

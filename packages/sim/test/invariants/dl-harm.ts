// Digital Luna cannot be harmed (CLAUDE.md, non-negotiable: "No event, inhabitant, weather, or
// power hurts her, on screen or off. Any PR that could is wrong by definition."). This file is the
// one place that says what "harmed" means, as data, so every DL-invariant test checks the same
// thing: the fuzz and the static write-guard in dl-invariant.test.ts today, and whatever the event
// engine (#40) adds later.
//
// Issue #61 names four kinds of harm:
//
//   1. A need or health-like field of hers dropping below its floor. She has no hunger or health
//      stat (the design keeps her needs-free on purpose); the only fields shaped like one are
//      `wet` and `snow`, both meant to stay in [0, 1] (her own tick clamps them there every tick,
//      see `tickLuna` in behaviours/luna.ts). A value outside that range is the clamp having
//      failed, not a state she could reach by playing normally. Checked here, in HARM_CHECKS.
//   2. A forced state she did not choose through her own chain. Checked by the static guard in
//      dl-invariant.test.ts, which runs a real day's sheep phase and every intent handler with her
//      object under a write-tracking Proxy: nothing outside her own chain and her player-facing
//      command surface (a click that lands on her, a pet, a thrown stick, a Luna-button intent)
//      may write to her at all, and even that surface may only ever move her within the bounds
//      below — reusing `harmIn` so "her own chain" and "never harmed" are the same promise.
//   3. Removal. `state.luna` must always exist; `harmIn` checks this first; every other check
//      needs a `luna` object to look at.
//   4. A position outside the world, or an `anim` outside her set. Both checked here.
//
// `LUNA_ANIMS` (src/behaviours/luna.ts) is the one export this file needed from `src` and didn't
// already have: the list of `anim` strings her own chain ever assigns. See its doc comment there.

import { LUNA_ANIMS } from '../../src/behaviours/luna';
import { H, LFOOT, W } from '../../src/geometry';
import type { Luna, SimState } from '../../src/state';

const LUNA_ANIM_SET: ReadonlySet<string> = new Set(LUNA_ANIMS);

/**
 * How far outside the 640x400 field a foot may stray and still just be "on the world": the barn
 * roof overhang, the doorway threshold, a clamp's own one-tick overshoot before it pulls her back.
 * Generous on purpose — this check is a burglar alarm for a teleport or a corrupted position, not
 * a physics check, and the fuzz below is what proves she never needs the margin in the first place.
 */
export const WORLD_MARGIN = 80;

export interface HarmCheck {
  readonly name: string;
  /** Null when the field is fine; a human-readable reason when it is not. */
  detect(l: Luna): string | null;
}

/** Every per-tick way Digital Luna's own fields can show harm, as data. */
export const HARM_CHECKS: readonly HarmCheck[] = [
  { name: 'wet-floor', detect: (l) => (Number.isFinite(l.wet) && l.wet >= 0 ? null : `wet is ${l.wet}, its floor is 0`) },
  { name: 'wet-ceiling', detect: (l) => (l.wet <= 1 ? null : `wet is ${l.wet}, its ceiling is 1`) },
  { name: 'snow-floor', detect: (l) => (Number.isFinite(l.snow) && l.snow >= 0 ? null : `snow is ${l.snow}, its floor is 0`) },
  { name: 'snow-ceiling', detect: (l) => (l.snow <= 1 ? null : `snow is ${l.snow}, its ceiling is 1`) },
  {
    name: 'anim-known',
    detect: (l) => (LUNA_ANIM_SET.has(l.anim) ? null : `anim "${l.anim}" is outside her set (${LUNA_ANIMS.join(', ')})`),
  },
  {
    name: 'position-in-world',
    detect: (l) => {
      const x = l.x + LFOOT[0];
      const y = l.y + LFOOT[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return `foot (${l.x}, ${l.y}) is not a finite position`;
      if (x < -WORLD_MARGIN || x > W + WORLD_MARGIN || y < -WORLD_MARGIN || y > H + WORLD_MARGIN) {
        return `foot (${x}, ${y}) is outside the ${W}x${H} world, past its ±${WORLD_MARGIN} margin`;
      }
      return null;
    },
  },
];

/**
 * Every reason `state` harms Digital Luna right now, or `[]` when she is fine. The one predicate
 * every DL-invariant test shares: the fuzz asserts this is always `[]`; the static guard asserts
 * her sanctioned command surface never makes it anything else.
 */
export function harmIn(state: SimState): string[] {
  if (!state.luna) return ['state.luna is missing: she has been removed'];
  const reasons: string[] = [];
  for (const check of HARM_CHECKS) {
    const reason = check.detect(state.luna);
    if (reason) reasons.push(`${check.name}: ${reason}`);
  }
  return reasons;
}

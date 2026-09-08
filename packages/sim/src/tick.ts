// One fixed step of the world, in the prototype's order: clock, weather, grass and fleece
// bookkeeping, sheep, Digital Luna, the ground stamps, then `tickLife` (the NPCs, the rabbit, the
// butterflies, the bird). The event engine (#40) is one call between the weather and the sheep;
// with the engine off it returns at once and the tick is bitwise the prototype's port.

import { fetch as fetchStick, tickLuna } from './behaviours/luna';
import { tickSheep } from './behaviours/sheep';
import { advanceClock, advanceSeason } from './clock';
import { tickEngine } from './engine/engine';
import { groundSnowy, tickGround } from './ground';
import { applyDueIntents } from './intents';
import { tickBird, tickButterflies, tickRabbit } from './life';
import { tickNpcs } from './npcs';
import { hay2RegrowMult, RULES, TICK_MS, TICK_SEC } from './rules';
import { cloneState, type SimState } from './state';
import { tickWeather } from './weather';

/** Advance a state by exactly one tick. Returns a new state; the input is not modified. */
export function tick(state: SimState): SimState {
  return tickInPlace(cloneState(state));
}

/**
 * One tick, mutating `s`. Only for callers that already hold a private copy (the step loop clones
 * once per call, not once per tick). Everything else uses `tick`.
 */
export function tickInPlace(s: SimState): SimState {
  applyDueIntents(s);

  s.clock = advanceClock(s.clock, TICK_MS);
  s.season = advanceSeason(s.season, TICK_MS);
  s.weather = tickWeather(s.weather, s.clock, s.season, s.rng);
  // hay2 (#63): a small regrow bonus while owned, the same multiplier advanceLedger applies.
  const regrowPerSec = RULES.tuftRegrowPerSec * hay2RegrowMult(s.banks.owned);
  for (const t of s.tufts) t.level = Math.min(1, t.level + TICK_SEC * regrowPerSec);

  // The event engine looks at the world after the weather and before the actors, so a card that
  // starts this tick is already true for the sheep and for Digital Luna this tick. It never writes
  // to her: what it sets is a flag or a marker her own chain reads (see engine/hooks.ts).
  tickEngine(s);

  // Fleece growth and pending shears are the first lines of the prototype's per-sheep loop and
  // live in `tickSheep`, so a lamb that grows up mid-loop gets its first frame like every other.
  tickSheep(s);
  const ran = tickLuna(s);
  // The prototype's fetch branch `return`s before `tickGround` but after `tickLife`, so a fetch
  // tick moves the NPCs and the small life but leaves the ground alone.
  if (!ran.includes(fetchStick.id)) tickGround(s, groundSnowy(s));
  // The prototype's `tickLife`: the NPCs first, then the rabbit, the butterflies, the bird.
  tickNpcs(s);
  tickRabbit(s);
  tickButterflies(s);
  tickBird(s);

  return s;
}

/** Run `n` ticks. Handy for tests and the bench. */
export function advance(state: SimState, n: number): SimState {
  if (n <= 0) return state;
  const s = cloneState(state);
  for (let i = 0; i < n; i++) tickInPlace(s);
  return s;
}

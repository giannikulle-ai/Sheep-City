// One fixed step of the world, in the prototype's order: clock, weather, grass and fleece
// bookkeeping, sheep, Digital Luna, then `tickLife` (the NPCs, then the rabbit).

import { tickLuna } from './behaviours/luna';
import { tickSheep } from './behaviours/sheep';
import { advanceClock, advanceSeason } from './clock';
import { applyDueIntents } from './intents';
import { tickRabbit } from './life';
import { tickNpcs } from './npcs';
import { RULES, TICK_MS, TICK_SEC } from './rules';
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
  for (const t of s.tufts) t.level = Math.min(1, t.level + TICK_SEC * RULES.tuftRegrowPerSec);

  // Fleece growth and pending shears are the first lines of the prototype's per-sheep loop and
  // live in `tickSheep`, so a lamb that grows up mid-loop gets its first frame like every other.
  tickSheep(s);
  tickLuna(s);
  // The prototype's `tickLife` runs the NPCs first, then the rabbit.
  tickNpcs(s);
  tickRabbit(s);

  return s;
}

/** Run `n` ticks. Handy for tests and the bench. */
export function advance(state: SimState, n: number): SimState {
  if (n <= 0) return state;
  const s = cloneState(state);
  for (let i = 0; i < n; i++) tickInPlace(s);
  return s;
}

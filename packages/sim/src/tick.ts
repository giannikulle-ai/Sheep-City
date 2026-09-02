// One fixed step of the world. This ticket ports the parts of the prototype's `tick` that are
// pure bookkeeping: clock, seasons, weather, grass regrowth, fleece growth, shearing timers, lamb
// growth. Movement, needs, DL's priority chain, and the NPC job plans are the behaviour registry's
// job (issue #5) and plug in where the comment marks the seam.

import { advanceClock, advanceSeason } from './clock';
import { applyDueIntents } from './intents';
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
  const now = s.clock.nowMs;

  for (const t of s.tufts) t.level = Math.min(1, t.level + TICK_SEC * RULES.tuftRegrowPerSec);

  for (const sheep of s.sheep) {
    sheep.wool = Math.min(1, sheep.wool + TICK_SEC / RULES.woolGrowSec);
    if (sheep.shearAtMs !== null && now > sheep.shearAtMs) {
      sheep.shearAtMs = null;
      sheep.wool = 0.05;
      s.banks.wool++;
    }
    for (const lamb of sheep.lambs) if (!lamb.grown && now - lamb.bornMs > RULES.lambGrowMs) lamb.grown = true;
  }

  // Behaviour registry seam (issue #5): actors choose and run a behaviour here.

  return s;
}

/** Run `n` ticks. Handy for tests and the bench. */
export function advance(state: SimState, n: number): SimState {
  if (n <= 0) return state;
  const s = cloneState(state);
  for (let i = 0; i < n; i++) tickInPlace(s);
  return s;
}

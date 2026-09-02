// Fixed-step loop. The host calls `step` with however much time passed (a 16 ms frame, a 3 s
// tab switch, a week away) and the sim runs whole 100 ms ticks, carrying the remainder in the
// state's accumulator. Intents queue at the next boundary, so nothing is lost when a call runs
// zero ticks.

import type { Intent } from './intents';
import { TICK_MS } from './rules';
import { cloneState, type SimState } from './state';
import { tickInPlace } from './tick';

export interface StepOptions {
  /**
   * Upper bound on ticks per call. Time beyond it stays in the accumulator for the next call, so a
   * host that wants to spread a long catch-up over several frames can. Default: no bound.
   */
  maxTicks?: number;
}

/**
 * `step(state, intents, dtMs)` returns the world `dtMs` sim-milliseconds later. Pure: the input
 * state is never modified. `dtMs` must be finite and non-negative.
 */
export function step(state: SimState, intents: readonly Intent[] = [], dtMs = 0, options: StepOptions = {}): SimState {
  if (!Number.isFinite(dtMs) || dtMs < 0) throw new Error(`step: dtMs must be a finite non-negative number, got ${dtMs}`);
  let acc = state.accumulatorMs + dtMs;
  const limit = options.maxTicks ?? Infinity;
  if (acc < TICK_MS || limit <= 0) {
    if (!intents.length && acc === state.accumulatorMs) return state;
    return { ...state, pendingIntents: [...state.pendingIntents, ...intents], accumulatorMs: acc };
  }
  // One private copy for the whole call; ticks then run in place on it.
  const s = cloneState(state);
  s.pendingIntents.push(...intents);
  let ran = 0;
  while (acc >= TICK_MS && ran < limit) {
    acc -= TICK_MS;
    tickInPlace(s);
    ran++;
  }
  s.accumulatorMs = acc;
  return s;
}

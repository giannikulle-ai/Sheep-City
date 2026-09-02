// Intents: the only way the outside world touches the sim. Plain objects, applied at a tick
// boundary in the order given. Deity powers, UI buttons, and a future server queue all arrive
// this way. See docs/SHEEPCLIFF_PLAN.md section 2, "Deity powers as inputs".

import type { SeasonName } from './clock';
import type { SimState } from './state';
import { setWeather, type WeatherKind, type WeatherMode } from './weather';

interface IntentBase {
  /**
   * Tick to apply at: the intent is applied at the boundary that begins that tick, so the state
   * for tick `at` already reflects it. Omit for the next tick boundary. Late intents apply at once.
   */
  at?: number;
}

export type Intent =
  /** The prototype's weather buttons: sets the weather and switches to manual mode. */
  | (IntentBase & { type: 'setWeather'; weather: WeatherKind })
  | (IntentBase & { type: 'setWeatherMode'; mode: WeatherMode })
  /** The prototype's time slider. */
  | (IntentBase & { type: 'setClock'; t: number })
  /** The prototype's period select (180 s, or a real day for hosts that pass wall time in). */
  | (IntentBase & { type: 'setPeriod'; periodSec: number })
  | (IntentBase & { type: 'pauseClock'; paused: boolean })
  /** The prototype's season select; null means the automatic nine-day cycle. */
  | (IntentBase & { type: 'setSeason'; season: SeasonName | null });

export type IntentType = Intent['type'];

/** Apply one intent to a state that is already a private copy. Mutates and returns it. */
export function applyIntent(state: SimState, intent: Intent): SimState {
  switch (intent.type) {
    case 'setWeather':
      state.weather = setWeather({ ...state.weather, mode: 'manual' }, intent.weather);
      return state;
    case 'setWeatherMode':
      state.weather = { ...state.weather, mode: intent.mode };
      return state;
    case 'setClock':
      state.clock = { ...state.clock, t: ((intent.t % 1) + 1) % 1 };
      return state;
    case 'setPeriod':
      if (!(intent.periodSec > 0)) throw new Error(`setPeriod: periodSec must be positive, got ${intent.periodSec}`);
      state.clock = { ...state.clock, periodSec: intent.periodSec };
      return state;
    case 'pauseClock':
      state.clock = { ...state.clock, paused: intent.paused };
      return state;
    case 'setSeason':
      state.season = { ...state.season, override: intent.season };
      return state;
    default: {
      const never: never = intent;
      throw new Error(`unknown intent ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Apply every pending intent whose time has come, in order, and keep the rest. Called by `tick`
 * before anything else moves so intents land on a clean boundary.
 */
export function applyDueIntents(state: SimState): SimState {
  if (state.pendingIntents.length === 0) return state;
  const keep: Intent[] = [];
  for (const intent of state.pendingIntents) {
    if (intent.at !== undefined && intent.at > state.clock.tick + 1) keep.push(intent);
    else applyIntent(state, intent);
  }
  state.pendingIntents = keep;
  return state;
}

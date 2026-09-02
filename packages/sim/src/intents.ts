// Intents: the only way the outside world touches the sim. Plain objects, applied at a tick
// boundary in the order given. Deity powers, UI buttons, and a future server queue all arrive
// this way. See docs/SHEEPCLIFF_PLAN.md section 2, "Deity powers as inputs".

import { LUNA_ID, bubble, nearestTuft } from './actors';
import { leaveBarn, petLuna } from './behaviours/luna';
import { newLamb, setPath } from './behaviours/sheep';
import type { SeasonName } from './clock';
import { LFOOT, LUNA_SIZE, SFOOT, SHEEP_SIZE, SPOT, insideField, randomFoot } from './geometry';
import { nextFloat } from './rng';
import { RULES } from './rules';
import { buyUpgrades, summonFarmer, summonMerchant } from './npcs';
import type { Luna, SimState } from './state';
import { setWeather, type WeatherKind, type WeatherMode } from './weather';

interface IntentBase {
  /**
   * Tick to apply at: the intent is applied at the boundary that begins that tick, so the state
   * for tick `at` already reflects it. Omit for the next tick boundary. Late intents apply at once.
   */
  at?: number;
}

/** The prototype's Digital Luna buttons (`dlAction` and the `ACTIONS` table). */
export const LUNA_ACTIONS = [
  'sit',
  'tilt',
  'pant',
  'flop',
  'sleep',
  'stretch',
  'run',
  'stick',
  'come',
  'nibble',
  'rabbit',
  'ride',
  'trundle',
  'pet',
  'bed',
] as const;
export type LunaAction = (typeof LUNA_ACTIONS)[number];

/**
 * The prototype's "Sheep" and "Farm" entries in its `ACTIONS` table. `bird` is not here because
 * the bird is not ported yet; `reset` is a new state, not an intent.
 */
export const FARM_ACTIONS = ['shearAll', 'petAll', 'lamb', 'graze', 'rest', 'scatter', 'wool', 'farmer', 'merchant', 'rabbitOnly', 'coins'] as const;
export type FarmAction = (typeof FARM_ACTIONS)[number];

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
  | (IntentBase & { type: 'setSeason'; season: SeasonName | null })
  /**
   * A click on the field at world coordinates: DL first (a pet), then a sheep (a pet, or a shear
   * when the fleece is ready), else empty grass (a stick for DL). The prototype's click handler.
   */
  | (IntentBase & { type: 'click'; x: number; y: number })
  /** Throw a stick to (x, y) for DL, if she is free to fetch. */
  | (IntentBase & { type: 'throwStick'; x: number; y: number })
  /** One of the Digital Luna buttons. */
  | (IntentBase & { type: 'lunaAction'; action: LunaAction })
  /** One of the sheep or farm actions. */
  | (IntentBase & { type: 'farmAction'; action: FarmAction });

export type IntentType = Intent['type'];

/** Every intent type, for validating documents that come in from outside (saves, a future server). */
export const INTENT_TYPES = ['setWeather', 'setWeatherMode', 'setClock', 'setPeriod', 'pauseClock', 'setSeason', 'click', 'throwStick', 'lunaAction', 'farmAction'] as const satisfies readonly IntentType[];

// Compile-time guard: the list above must name every member of the union.
type MissingIntentType = Exclude<IntentType, (typeof INTENT_TYPES)[number]>;
const _everyIntentTypeListed: MissingIntentType extends never ? true : never = true;
void _everyIntentTypeListed;

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
    case 'click':
      click(state, intent.x, intent.y);
      return state;
    case 'throwStick':
      throwStick(state, intent.x, intent.y);
      return state;
    case 'lunaAction':
      lunaAction(state, intent.action);
      return state;
    case 'farmAction':
      farmAction(state, intent.action);
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

const HOLD_MS: Partial<Record<LunaAction, number>> = { sit: 6000, tilt: 5000, pant: 4000, flop: 7000, sleep: 12000, stretch: 4000 };
const NO_PET_POSE: readonly (string | null)[] = ['bed', 'asleep', 'shelterWait', 'shelterEnter'];

function click(state: SimState, mx: number, my: number): void {
  const now = state.clock.nowMs;
  const l = state.luna;
  // Digital Luna first
  if (!l.inBarn && !l.riding && mx > l.x && mx < l.x + LUNA_SIZE.w && my > l.y && my < l.y + LUNA_SIZE.h) {
    petLuna(l, now);
    if (!l.manual && !NO_PET_POSE.includes(l.routine)) {
      l.anim = 'pant';
      l.t0Ms = now;
      l.target = null;
    }
    return;
  }
  for (const s of state.sheep) {
    if (s.inBarn) continue;
    if (mx > s.x && mx < s.x + SHEEP_SIZE.w && my > s.y && my < s.y + SHEEP_SIZE.h) {
      s.tagUntilMs = now + RULES.petTagMs;
      if (s.wool >= RULES.shearReadyAt && s.shearAtMs === null) {
        s.shearAtMs = now + 1200;
        bubble(s, 'shears', 1200, now);
      } else bubble(s, 'heart', 1600, now);
      return;
    }
  }
  throwStick(state, mx, my);
}

function throwStick(state: SimState, x: number, y: number): void {
  const l = state.luna;
  if (!insideField(x, y, 0.95) || state.weather.rain || l.inBarn || l.riding || l.routine === 'bed' || l.routine === 'asleep') return;
  l.stick = { x, y, fromX: l.x + LFOOT[0], fromY: l.y + LFOOT[1], phase: 'out' };
  l.chasing = false;
  l.manual = null;
  l.mounting = null;
  releaseTuft(state, l);
}

function releaseTuft(state: SimState, l: Luna): void {
  if (l.tuft === null) return;
  const t = state.tufts[l.tuft];
  if (t && t.claimed === LUNA_ID) t.claimed = null;
  l.tuft = null;
}

/** The prototype's `dlAction`, plus the three `ACTIONS` entries that wrap it. */
function lunaAction(state: SimState, act: LunaAction): void {
  const now = state.clock.nowMs;
  const l = state.luna;
  if (act === 'pet') {
    petLuna(l, now);
    return;
  }
  if (act === 'trundle') {
    lunaAction(state, 'run');
    l.forceBoundUntilMs = now + 6000;
    return;
  }
  if (act === 'bed') {
    lunaAction(state, 'sit');
    l.manual = null;
    l.routine = 'bed';
    l.target = { x: SPOT.barnDoor.x + 24, y: SPOT.barnDoor.y + 2 };
    l.anim = 'run';
    return;
  }
  // dlAction proper. Note what it does not clear: `manual`, `riding`, `mounting`, and `stick`.
  l.target = null;
  l.wp = null;
  state.life.rabbit = null;
  l.idle = 0;
  l.routine = null;
  l.circleUntilMs = null;
  l.chasing = false;
  if (l.inBarn) leaveBarn(l);
  releaseTuft(state, l);
  const hold = HOLD_MS[act];
  if (hold !== undefined) {
    l.manual = act;
    l.manualUntilMs = now + hold;
    l.anim = act;
    l.t0Ms = now;
  } else if (act === 'run' || act === 'stick') {
    l.manual = 'walk';
    l.anim = act;
    l.target = randomFoot(state.rng);
  } else if (act === 'come') {
    l.manual = 'walk';
    l.anim = 'run';
    l.target = { ...SPOT.front };
  } else if (act === 'nibble') {
    const t = nearestTuft(state.tufts, { x: l.x + LFOOT[0], y: l.y + LFOOT[1] }, 0.3);
    l.manual = 'nibble';
    if (t !== null) {
      const tuft = state.tufts[t]!;
      tuft.claimed = LUNA_ID;
      l.tuft = t;
      l.anim = 'run';
      l.target = { x: tuft.x - 18, y: tuft.y + 2 };
    } else {
      l.anim = 'nibble';
      l.t0Ms = now;
    }
  } else if (act === 'rabbit') {
    state.life.rabbit = { x: 30, y: 150 + nextFloat(state.rng) * 120, t0Ms: now };
    l.chasing = true;
    l.anim = 'run';
  } else if (act === 'ride') {
    // Nearest sheep by sprite top-left, as the prototype measured it.
    let best = null as (typeof state.sheep)[number] | null;
    let bd = Infinity;
    for (const s of state.sheep) {
      if (s.inBarn || s.ridden) continue;
      const d = Math.hypot(s.x - l.x, s.y - l.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best) {
      l.manual = 'ride';
      l.mounting = best.id;
    }
  }
}

/** The prototype's sheep and farm actions, each one as its `ACTIONS` entry wrote it. */
function farmAction(state: SimState, act: FarmAction): void {
  const now = state.clock.nowMs;
  switch (act) {
    case 'shearAll':
      // Note the .5 threshold: lower than a click's shearReadyAt, as the prototype has it.
      for (const s of state.sheep) {
        if (s.wool >= 0.5 && s.shearAtMs === null) {
          s.shearAtMs = now + 1200;
          bubble(s, 'shears', 1200, now);
        }
      }
      return;
    case 'petAll':
      for (const s of state.sheep) {
        bubble(s, 'heart', 1600, now);
        s.tagUntilMs = now + 1800;
      }
      return;
    case 'lamb': {
      // No flock cap check here, as in the prototype's action.
      const s = state.sheep.find((q) => !q.lambs.length && !q.inBarn);
      if (s) s.lambs.push(newLamb(s, now));
      return;
    }
    case 'graze':
      // Always stands 16 px to the left of the tuft and never releases a tuft already held; kept.
      for (const s of state.sheep) {
        s.resting = false;
        const i = nearestTuft(state.tufts, { x: s.x + SFOOT[0], y: s.y + SFOOT[1] }, 0.3);
        if (i === null) continue;
        const t = state.tufts[i]!;
        t.claimed = s.id;
        s.tuft = i;
        setPath(s, [{ x: t.x - 16, y: t.y + 2 }]);
        s.wander = 1;
      }
      return;
    case 'rest':
      for (const s of state.sheep) {
        s.tx = s.ty = null;
        s.path = [];
        s.eating = false;
        s.resting = true;
      }
      return;
    case 'scatter':
      for (const s of state.sheep) {
        s.resting = false;
        setPath(s, [randomFoot(state.rng)]);
        s.wander = 0;
      }
      return;
    case 'wool':
      for (const s of state.sheep) s.wool = 1;
      return;
    case 'farmer':
      summonFarmer(state);
      return;
    case 'merchant':
      summonMerchant(state);
      return;
    case 'rabbitOnly':
      state.life.rabbit = { x: 30, y: 150 + nextFloat(state.rng) * 120, t0Ms: now };
      return;
    case 'coins':
      state.banks.coins += 50;
      buyUpgrades(state);
      return;
    default: {
      const never: never = act;
      throw new Error(`unknown farm action ${String(never)}`);
    }
  }
}

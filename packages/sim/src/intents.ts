// Intents: the only way the outside world touches the sim. Plain objects, applied at a tick
// boundary in the order given. Deity powers, UI buttons, and a future server queue all arrive
// this way. See docs/SHEEPCLIFF_PLAN.md section 2, "Deity powers as inputs".

import { LUNA_ID, bubble, findSheep, nearestTuft } from './actors';
import { leaveBarn, petLuna } from './behaviours/luna';
import { newLamb, setPath } from './behaviours/sheep';
import type { SeasonName } from './clock';
import { LFOOT, LUNA_SIZE, SFOOT, SHEEP_SIZE, SPOT, insideField, randomFoot } from './geometry';
import { nextFloat } from './rng';
import { RULES } from './rules';
import { buyUpgrades, summonFarmer, summonMerchant } from './npcs';
import type { ActorId, Luna, Sheep, SimState } from './state';
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
 * the bird is not ported yet; `reset` is a new state, not an intent. `rabbit` is the client's name
 * for `rabbitOnly` (the Farm group's "release a rabbit, no chase") and does the same thing.
 */
export const FARM_ACTIONS = ['shearAll', 'petAll', 'lamb', 'graze', 'rest', 'scatter', 'wool', 'farmer', 'merchant', 'rabbitOnly', 'rabbit', 'coins'] as const;
export type FarmAction = (typeof FARM_ACTIONS)[number];

/** The prototype's "Sheep" actions that make sense for one sheep as well as the flock. */
export const SHEEP_ACTIONS = ['graze', 'rest', 'scatter', 'wool', 'lamb'] as const;
export type SheepAction = (typeof SHEEP_ACTIONS)[number];

/** A sheep id (`sheep-<n>`), or the whole flock. */
export type SheepTarget = ActorId | 'flock';
/** Who a pet is for: Digital Luna, one sheep, or every sheep. */
export type PetTarget = 'luna' | SheepTarget;

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
  /**
   * A tap that the client has already resolved to someone: the heart bubble and the name tag.
   * `luna` is the click handler's DL branch (heart, tag, and the pant reaction); a sheep is its
   * sheep branch without the shear; `flock` is the "pet everyone" action.
   */
  | (IntentBase & { type: 'pet'; target: PetTarget })
  /**
   * A tap on a sheep that the client wants shorn: the click handler's sheep branch. At or above
   * `shearReadyAt` the shears bubble shows and the fleece is banked when the timer runs out;
   * below it the tap is a pet. `flock` is the "shear every woolly sheep" action (its own
   * threshold, see `farmAction`).
   */
  | (IntentBase & { type: 'shear'; target: SheepTarget })
  /** Throw a stick to (x, y) for DL, if she is free to fetch. Her fetch behaviour does the rest. */
  | (IntentBase & { type: 'throwStick'; x: number; y: number })
  /** One of the Digital Luna buttons. */
  | (IntentBase & { type: 'lunaAction'; action: LunaAction })
  /** The client's name for `lunaAction`; same fields, same effect. */
  | (IntentBase & { type: 'dlAction'; action: LunaAction })
  /** One of the sheep actions for one sheep, or for every sheep (`flock`, the tray button). */
  | (IntentBase & { type: 'sheepAction'; action: SheepAction; target: SheepTarget })
  /** One of the sheep or farm actions. */
  | (IntentBase & { type: 'farmAction'; action: FarmAction });

export type IntentType = Intent['type'];

/** Every intent type, for validating documents that come in from outside (saves, a future server). */
export const INTENT_TYPES = [
  'setWeather',
  'setWeatherMode',
  'setClock',
  'setPeriod',
  'pauseClock',
  'setSeason',
  'click',
  'pet',
  'shear',
  'throwStick',
  'lunaAction',
  'dlAction',
  'sheepAction',
  'farmAction',
] as const satisfies readonly IntentType[];

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
    case 'pet':
      pet(state, intent.target);
      return state;
    case 'shear':
      shear(state, intent.target);
      return state;
    case 'throwStick':
      throwStick(state, intent.x, intent.y);
      return state;
    case 'lunaAction':
    case 'dlAction':
      lunaAction(state, intent.action);
      return state;
    case 'sheepAction':
      sheepAction(state, intent.action, intent.target);
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
  const l = state.luna;
  // Digital Luna first
  if (!l.inBarn && !l.riding && mx > l.x && mx < l.x + LUNA_SIZE.w && my > l.y && my < l.y + LUNA_SIZE.h) {
    petLunaWithReaction(state);
    return;
  }
  for (const s of state.sheep) {
    if (s.inBarn) continue;
    if (mx > s.x && mx < s.x + SHEEP_SIZE.w && my > s.y && my < s.y + SHEEP_SIZE.h) {
      shearOrPetSheep(state, s);
      return;
    }
  }
  throwStick(state, mx, my);
}

/**
 * The click handler's DL branch: the pet, then the pant reaction unless a button holds her or she
 * is in bed or sheltering. The click could not reach her in the barn or on a sheep, so the reaction
 * is skipped there too; the heart and tag still show, as the "pet her" action gives them anywhere.
 */
function petLunaWithReaction(state: SimState): void {
  const now = state.clock.nowMs;
  const l = state.luna;
  petLuna(l, now);
  if (l.inBarn || l.riding) return;
  if (!l.manual && !NO_PET_POSE.includes(l.routine)) {
    l.anim = 'pant';
    l.t0Ms = now;
    l.target = null;
  }
}

/** The click handler's sheep branch: the tag, then a shear when the fleece is ready, else a heart. */
function shearOrPetSheep(state: SimState, s: Sheep): void {
  const now = state.clock.nowMs;
  s.tagUntilMs = now + RULES.petTagMs;
  if (s.wool >= RULES.shearReadyAt && s.shearAtMs === null) {
    s.shearAtMs = now + 1200;
    bubble(s, 'shears', 1200, now);
  } else bubble(s, 'heart', 1600, now);
}

/**
 * The heart and the name tag on one sheep. A tap (the click handler's sheep branch) shows the tag
 * for `petTagMs`; the "pet everyone" action wrote 1800 ms in the prototype, so it passes that.
 */
function petSheep(s: Sheep, now: number, tagMs: number): void {
  bubble(s, 'heart', 1600, now);
  s.tagUntilMs = now + tagMs;
}

/** A pet the client has already aimed. An unknown sheep id does nothing. */
function pet(state: SimState, target: PetTarget): void {
  if (target === 'luna') {
    petLunaWithReaction(state);
    return;
  }
  if (target === 'flock') {
    farmAction(state, 'petAll');
    return;
  }
  const s = findSheep(state, target);
  if (s) petSheep(s, state.clock.nowMs, RULES.petTagMs);
}

/** A shear the client has already aimed. An unknown sheep id does nothing. */
function shear(state: SimState, target: SheepTarget): void {
  if (target === 'flock') {
    farmAction(state, 'shearAll');
    return;
  }
  const s = findSheep(state, target);
  if (s) shearOrPetSheep(state, s);
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
      for (const s of state.sheep) petSheep(s, now, 1800);
      return;
    case 'lamb': {
      // No flock cap check here, as in the prototype's action.
      const s = state.sheep.find((q) => !q.lambs.length && !q.inBarn);
      if (s) lambFor(s, now);
      return;
    }
    case 'graze':
      for (const s of state.sheep) grazeSheep(state, s);
      return;
    case 'rest':
      for (const s of state.sheep) restSheep(s);
      return;
    case 'scatter':
      for (const s of state.sheep) scatterSheep(state, s);
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
    case 'rabbit':
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

// The "Sheep" actions, one sheep at a time. `farmAction` runs them over the flock in order, so a
// flock-wide `sheepAction` and the tray button draw the same numbers in the same order.

/** The "everyone graze" action for one sheep. Always stands 16 px to the left of the tuft and never releases a tuft already held; kept. */
function grazeSheep(state: SimState, s: Sheep): void {
  s.resting = false;
  const i = nearestTuft(state.tufts, { x: s.x + SFOOT[0], y: s.y + SFOOT[1] }, 0.3);
  if (i === null) return;
  const t = state.tufts[i]!;
  t.claimed = s.id;
  s.tuft = i;
  setPath(s, [{ x: t.x - 16, y: t.y + 2 }]);
  s.wander = 1;
}

/** The "everyone lie down" action for one sheep. */
function restSheep(s: Sheep): void {
  s.tx = s.ty = null;
  s.path = [];
  s.eating = false;
  s.resting = true;
}

/** The "scatter" action for one sheep: one draw from the generator for its new foot point. */
function scatterSheep(state: SimState, s: Sheep): void {
  s.resting = false;
  setPath(s, [randomFoot(state.rng)]);
  s.wander = 0;
}

/** The "a lamb is born" action for one sheep: only if it has no lamb and is out on the field. */
function lambFor(s: Sheep, now: number): void {
  if (s.lambs.length || s.inBarn) return;
  s.lambs.push(newLamb(s, now));
}

/** A sheep action aimed at one sheep, or at the flock (then it is the tray button, see `farmAction`). */
function sheepAction(state: SimState, act: SheepAction, target: SheepTarget): void {
  if (target === 'flock') {
    farmAction(state, act);
    return;
  }
  const s = findSheep(state, target);
  if (!s) return;
  switch (act) {
    case 'graze':
      grazeSheep(state, s);
      return;
    case 'rest':
      restSheep(s);
      return;
    case 'scatter':
      scatterSheep(state, s);
      return;
    case 'wool':
      s.wool = 1;
      return;
    case 'lamb':
      lambFor(s, state.clock.nowMs);
      return;
    default: {
      const never: never = act;
      throw new Error(`unknown sheep action ${String(never)}`);
    }
  }
}

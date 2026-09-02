// Client intents: everything a tap or a tray button can ask of the world. The client never
// changes the world itself; it sends one of these, and the sim decides what happens.
//
// Since #25 the sim's `Intent` union carries these under the client's own names (`pet`, `shear`,
// `throwStick`, `dlAction`, `sheepAction`, `farmAction`), so `toSimIntents` passes them straight
// through; the client only resolves its `sheep-<index>` chip ids to the sim's actor ids. Two verbs
// still have no sim rule: the bird (not ported yet, #33) and reset (a new world, which the client
// makes itself). Those return no sim intent and the status line says "waiting for the sim".
import type { Intent, SeasonName, SimState, WeatherKind } from '@sheepcliff/sim';

export type SheepId = `sheep-${number}`;
/** Who a verb is for: Digital Luna, one sheep, or the whole flock. */
export type Target = 'luna' | SheepId | 'flock';

/** The prototype's `dlAction` ids plus the two ACTIONS-only entries (`trundle`, `bed`). */
export const DL_ACTIONS = ['sit', 'tilt', 'pant', 'run', 'stick', 'nibble', 'flop', 'sleep', 'stretch', 'ride', 'rabbit', 'come', 'trundle', 'bed'] as const;
export type DlAction = (typeof DL_ACTIONS)[number];

/** The prototype's Sheep group, minus pet and shear which are verbs of their own. */
export const SHEEP_ACTIONS = ['graze', 'rest', 'scatter', 'wool', 'lamb'] as const;
export type SheepAction = (typeof SHEEP_ACTIONS)[number];

/** The prototype's Farm group. */
export const FARM_ACTIONS = ['farmer', 'merchant', 'bird', 'rabbit', 'coins', 'reset'] as const;
export type FarmAction = (typeof FARM_ACTIONS)[number];

export type ClientIntent =
  | { type: 'pet'; target: Target }
  | { type: 'shear'; target: SheepId | 'flock' }
  | { type: 'throwStick'; x: number; y: number }
  | { type: 'dlAction'; action: DlAction }
  | { type: 'sheepAction'; action: SheepAction; target: SheepId | 'flock' }
  | { type: 'farmAction'; action: FarmAction }
  | { type: 'setWeather'; weather: WeatherKind }
  | { type: 'setSeason'; season: SeasonName | null }
  | { type: 'setClock'; t: number }
  | { type: 'pauseClock'; paused: boolean }
  | { type: 'setPeriod'; periodSec: number };

export type ClientIntentType = ClientIntent['type'];

export function sheepId(index: number): SheepId {
  return `sheep-${index}`;
}

/** The sheep index in a `sheep-<n>` id, or null for any other target. */
export function sheepIndex(target: string): number | null {
  const m = /^sheep-(\d+)$/.exec(target);
  return m ? Number(m[1]) : null;
}

/**
 * The sim's actor id for a client target. Chips are numbered by position in the flock and the
 * sim numbers sheep by birth order; the two agree today, but the sim's id is the truth, so it is
 * read from the state when there is one. A chip with no sheep behind it keeps its name and the
 * sim ignores it.
 */
function simTarget<T extends string>(sim: SimState | null, target: T): T | string {
  const i = sheepIndex(target);
  if (i === null || !sim) return target;
  return sim.sheep[i]?.id ?? target;
}

/**
 * The sim intents a client intent becomes today. Empty means the sim has no rule for it yet;
 * the client keeps it in its log and shows a cue instead.
 */
export function toSimIntents(intent: ClientIntent, sim: SimState | null = null): Intent[] {
  switch (intent.type) {
    case 'setWeather':
      return [{ type: 'setWeather', weather: intent.weather }];
    case 'setSeason':
      return [{ type: 'setSeason', season: intent.season }];
    case 'setClock':
      return [{ type: 'setClock', t: intent.t }];
    case 'pauseClock':
      return [{ type: 'pauseClock', paused: intent.paused }];
    case 'setPeriod':
      return [{ type: 'setPeriod', periodSec: intent.periodSec }];
    case 'pet':
      return [{ type: 'pet', target: simTarget(sim, intent.target) }];
    case 'shear':
      return [{ type: 'shear', target: simTarget(sim, intent.target) }];
    case 'throwStick':
      return [{ type: 'throwStick', x: intent.x, y: intent.y }];
    case 'dlAction':
      return [{ type: 'dlAction', action: intent.action }];
    case 'sheepAction':
      return [{ type: 'sheepAction', action: intent.action, target: simTarget(sim, intent.target) }];
    case 'farmAction':
      // no bird in the sim yet (#33); reset is a new world, which the client makes itself
      if (intent.action === 'bird' || intent.action === 'reset') return [];
      return [{ type: 'farmAction', action: intent.action }];
    default: {
      const never: never = intent;
      throw new Error(`unknown intent ${JSON.stringify(never)}`);
    }
  }
}

export const simUnderstands = (intent: ClientIntent, sim: SimState | null = null): boolean => toSimIntents(intent, sim).length > 0;

/** Display name for a target: the sheep's name, or the two collective nouns. */
export function targetName(target: string, names: readonly string[]): string {
  if (target === 'luna') return 'Digital Luna';
  if (target === 'flock') return 'the flock';
  const i = sheepIndex(target);
  return i !== null ? (names[i] ?? target) : target;
}

/** One line for the status strip: who, and what was asked. */
export function describeIntent(intent: ClientIntent, names: readonly string[]): string {
  switch (intent.type) {
    case 'pet':
      return `pet ${targetName(intent.target, names)}`;
    case 'shear':
      return `shear ${targetName(intent.target, names)}`;
    case 'throwStick':
      return `stick thrown to (${Math.round(intent.x)}, ${Math.round(intent.y)})`;
    case 'dlAction':
      return `Digital Luna: ${intent.action}`;
    case 'sheepAction':
      return `${targetName(intent.target, names)}: ${intent.action}`;
    case 'farmAction':
      return `farm: ${intent.action}`;
    case 'setWeather':
      return `weather: ${intent.weather}`;
    case 'setSeason':
      return `season: ${intent.season ?? 'auto'}`;
    case 'setClock':
      return `clock: ${intent.t.toFixed(2)}`;
    case 'pauseClock':
      return intent.paused ? 'clock paused' : 'clock running';
    case 'setPeriod':
      return `day length: ${intent.periodSec} s`;
    default: {
      const never: never = intent;
      throw new Error(`unknown intent ${JSON.stringify(never)}`);
    }
  }
}

// The prototype's ACTIONS list, regrouped per creature so the owner can tell one creature to do
// one thing. Every prototype id is here (actions.test.ts checks), as an intent rather than a
// function: the sim runs it, the client only asks.
import { ACT_VERBS, DEITY_WEATHER_KINDS, RULES, type ActVerb, type DeityWeatherKind } from '@sheepcliff/sim';
import { DL_ACTIONS, sheepId, type ClientIntent, type SheepId, type Target } from './intents';
import { JUMP_T } from './jump';

/** The "jump to" clock values (see jump.ts): phase midpoints, the same values the goldens use (#20). */
export { JUMP_T };

export type WhoId = 'luna' | SheepId | 'flock' | 'farm' | 'sky' | 'clock';

export interface Who {
  id: WhoId;
  label: string;
  /** name tag swatch colour, for creatures */
  color: string | null;
}

export interface Verb {
  /** the prototype's ACTIONS id (`pet`, `shearAll`, `dawn`, ...) */
  id: string;
  label: string;
  intent: ClientIntent;
}

const DL_LABELS: Record<(typeof DL_ACTIONS)[number], string> = {
  sit: 'sit',
  tilt: 'head tilt',
  pant: 'pant',
  run: 'zoomies',
  stick: 'carry a stick',
  nibble: 'nibble grass',
  flop: 'belly flop',
  sleep: 'nap',
  stretch: 'stretch',
  ride: 'ride a sheep',
  rabbit: 'chase a rabbit',
  come: 'come here',
  trundle: 'trundle',
  bed: 'go to bed',
};

/** The sky tray's deity weather chips (issue #44), in the sim's own order. */
const WEATHER_LABELS: Record<DeityWeatherKind, string> = {
  sun: '☀ sun',
  rain: '☂ rain',
  snow: '❄ snow',
  fog: '🌫 fog',
  clear: '✕ clear',
};

/**
 * The sky tray's default hold, in **world-hours** — owner decision, 2026-09-08, fix round 1 on
 * issue #44: three hours of the farm's own day, not three minutes of the player's clock.
 *
 * `applyWeather` (`packages/sim/src/intents.ts`) treats its `holdSimMinutes` field as minutes of
 * real, unpaused time on `clock.nowMs` — never scaled by day length (the Verifier's finding on
 * PR #90). A fixed number of those minutes therefore meant a different fraction of the world's day
 * depending on which day-length chip was last pressed: the old `DEITY_WEATHER_HOLD_MIN = 3` was a
 * full in-world day at the 3-minute default, three days at the 1-minute length, and a third of one
 * at the 10-minute length. Converting from world-hours to the field's real-minute unit at send
 * time (`deityWeatherHoldMinutes` below) keeps the tap's *meaning* — "the sky stays this way for
 * three hours of farm-watching" — the same across every day length instead.
 */
export const DEITY_WEATHER_HOLD_WORLD_HOURS = 3;

/**
 * `holdSimMinutes` for a `weather` intent sent at the given day length (`periodSec`, sim-real
 * seconds per full day-night cycle): `periodSec` real seconds is one world-day, so
 * `periodSec * (hours / 24)` real seconds is that many world-hours, and `applyWeather` wants the
 * field in real minutes. See `DEITY_WEATHER_HOLD_WORLD_HOURS`'s comment for why. E.g. at the
 * default 180-second day this is 22.5 real seconds (0.375 min); 7.5 s at the 1-minute day; 75 s at
 * the 10-minute day.
 */
export function deityWeatherHoldMinutes(periodSec: number): number {
  return (periodSec * (DEITY_WEATHER_HOLD_WORLD_HOURS / 24)) / 60;
}

/** Labels for the deity `act` verbs (issue #44), `call` excluded: it needs a point, so it is built
 * separately in `actVerbs` below as a `callTarget` verb, not an `act` one. */
const ACT_LABELS: Record<Exclude<ActVerb, 'call'>, string> = {
  calm: 'calm',
  startle: 'startle (gently)',
  treat: 'give a treat',
};

/**
 * The deity `act` verbs for one creature (issue #44), appended under a chip's own verbs: `call`
 * asks the stage for a point next (the tray has none yet), the rest send straight through. Luna
 * and one sheep both get these; `flock` does not, since `act` targets one named creature.
 */
function actVerbs(target: Target): Verb[] {
  return ACT_VERBS.map((verb): Verb =>
    verb === 'call'
      ? { id: 'call', label: 'call here', intent: { type: 'callTarget', target } }
      : { id: verb, label: ACT_LABELS[verb], intent: { type: 'act', target, verb } },
  );
}

/** The chips along the top of the tray: DL, each sheep, then the collective targets. */
export function whoList(names: readonly string[], colors: readonly string[]): Who[] {
  const out: Who[] = [{ id: 'luna', label: 'Digital Luna', color: '#d33a2f' }];
  names.forEach((name, i) => out.push({ id: sheepId(i), label: name, color: colors[i] ?? '#ffffff' }));
  out.push({ id: 'flock', label: 'flock', color: null }, { id: 'farm', label: 'farm', color: null }, { id: 'sky', label: 'sky', color: null }, { id: 'clock', label: 'clock', color: null });
  return out;
}

/**
 * The verbs one chip offers. `periodSec` (the sim's current day length) only matters for `sky`'s
 * weather chips, whose hold is computed from it (see `deityWeatherHoldMinutes`); it defaults to
 * the sim's own default day length so every other caller (tests included) can omit it.
 */
export function verbsFor(who: WhoId, periodSec: number = RULES.clock.periodSec): Verb[] {
  if (who === 'luna') {
    return [
      { id: 'pet', label: 'pet her', intent: { type: 'pet', target: 'luna' } },
      ...DL_ACTIONS.map((action): Verb => ({ id: action, label: DL_LABELS[action], intent: { type: 'dlAction', action } })),
      ...actVerbs('luna'),
    ];
  }
  if (who === 'flock') {
    return [
      { id: 'petAll', label: 'pet everyone', intent: { type: 'pet', target: 'flock' } },
      { id: 'shearAll', label: 'shear every woolly sheep', intent: { type: 'shear', target: 'flock' } },
      { id: 'graze', label: 'everyone graze', intent: { type: 'sheepAction', action: 'graze', target: 'flock' } },
      { id: 'rest', label: 'everyone lie down', intent: { type: 'sheepAction', action: 'rest', target: 'flock' } },
      { id: 'scatter', label: 'scatter', intent: { type: 'sheepAction', action: 'scatter', target: 'flock' } },
      { id: 'wool', label: 'grow all wool', intent: { type: 'sheepAction', action: 'wool', target: 'flock' } },
      { id: 'lamb', label: 'a lamb is born', intent: { type: 'sheepAction', action: 'lamb', target: 'flock' } },
    ];
  }
  if (who === 'farm') {
    return [
      { id: 'farmer', label: 'farmer visits now', intent: { type: 'farmAction', action: 'farmer' } },
      { id: 'merchant', label: 'merchant arrives now', intent: { type: 'farmAction', action: 'merchant' } },
      { id: 'bird', label: 'a bird lands', intent: { type: 'farmAction', action: 'bird' } },
      { id: 'rabbitOnly', label: 'release a rabbit', intent: { type: 'farmAction', action: 'rabbit' } },
      { id: 'coins', label: '+50 coins (test)', intent: { type: 'farmAction', action: 'coins' } },
      { id: 'reset', label: 'reset farm', intent: { type: 'farmAction', action: 'reset' } },
    ];
  }
  if (who === 'sky') {
    return [
      // The deity weather power (issue #44): a tap sends the sim's `weather` intent with the
      // tray's default hold. A second tap on the same chip is handled by the tray (tray.ts), which
      // sends this list's `clear` entry instead of tapping it a second time itself.
      ...DEITY_WEATHER_KINDS.map(
        (kind): Verb => ({ id: kind, label: WEATHER_LABELS[kind], intent: { type: 'weather', kind, holdSimMinutes: deityWeatherHoldMinutes(periodSec) } }),
      ),
      { id: 'spring', label: 'spring', intent: { type: 'setSeason', season: 'spring' } },
      { id: 'summer', label: 'summer', intent: { type: 'setSeason', season: 'summer' } },
      { id: 'autumn', label: 'autumn', intent: { type: 'setSeason', season: 'autumn' } },
      { id: 'winter', label: 'winter', intent: { type: 'setSeason', season: 'winter' } },
      { id: 'autoSeason', label: 'season: auto', intent: { type: 'setSeason', season: null } },
    ];
  }
  if (who === 'clock') {
    return [
      { id: 'dawn', label: 'jump to dawn', intent: { type: 'setClock', t: JUMP_T.dawn } },
      { id: 'noon', label: 'jump to noon', intent: { type: 'setClock', t: JUMP_T.noon } },
      { id: 'dusk', label: 'jump to dusk', intent: { type: 'setClock', t: JUMP_T.dusk } },
      { id: 'night', label: 'jump to night', intent: { type: 'setClock', t: JUMP_T.night } },
      { id: 'day1', label: '1 min day', intent: { type: 'setPeriod', periodSec: 60 } },
      { id: 'day3', label: '3 min day', intent: { type: 'setPeriod', periodSec: 180 } },
      { id: 'day10', label: '10 min day', intent: { type: 'setPeriod', periodSec: 600 } },
    ];
  }
  // one sheep
  return [
    { id: 'pet', label: 'pet', intent: { type: 'pet', target: who } },
    { id: 'shear', label: 'shear', intent: { type: 'shear', target: who } },
    { id: 'graze', label: 'graze', intent: { type: 'sheepAction', action: 'graze', target: who } },
    { id: 'rest', label: 'lie down', intent: { type: 'sheepAction', action: 'rest', target: who } },
    { id: 'scatter', label: 'wander off', intent: { type: 'sheepAction', action: 'scatter', target: who } },
    { id: 'wool', label: 'grow wool', intent: { type: 'sheepAction', action: 'wool', target: who } },
    { id: 'lamb', label: 'have a lamb', intent: { type: 'sheepAction', action: 'lamb', target: who } },
    ...actVerbs(who),
  ];
}

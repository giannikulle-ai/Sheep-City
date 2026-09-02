// Shared scaffolding for the Digital Luna tests: a controllable world and a few drivers.
import { tickSheep } from '../src/behaviours/sheep';
import { advanceClock, advanceSeason, type SeasonName } from '../src/clock';
import { applyIntent, type LunaAction } from '../src/intents';
import { createRng, nextFloat, type Rng } from '../src/rng';
import { TICK_MS } from '../src/rules';
import { cloneState, createInitialState, type SimState } from '../src/state';
import { tickInPlace } from '../src/tick';
import { setWeather, tickWeather, type WeatherKind } from '../src/weather';

export interface WorldOptions {
  seed?: number;
  /** Clock fraction. Day < .42, dusk < .52, night < .92, dawn after. */
  t?: number;
  weather?: WeatherKind;
  season?: SeasonName;
  /** Freeze `t` so the phase stays put. Default true. */
  pauseClock?: boolean;
  sheep?: number;
}

/**
 * A private world with the dice out of the weather: manual weather mode (no random rain), a
 * paused clock (the phase you asked for stays), and the season you name.
 */
export function world(options: WorldOptions = {}): SimState {
  const s = cloneState(createInitialState(options.seed ?? 7, options.sheep === undefined ? {} : { sheep: options.sheep }));
  s.weather = { ...s.weather, mode: 'manual' };
  if (options.weather) s.weather = setWeather(s.weather, options.weather);
  if (options.t !== undefined) s.clock = { ...s.clock, t: options.t };
  s.clock = { ...s.clock, paused: options.pauseClock ?? true };
  if (options.season) s.season = { ...s.season, override: options.season };
  return s;
}

export function run(s: SimState, ticks: number): SimState {
  for (let i = 0; i < ticks; i++) tickInPlace(s);
  return s;
}

/** Tick until `pred` holds; returns the number of ticks it took. Throws past `max`. */
export function runUntil(s: SimState, pred: (s: SimState) => boolean, max = 5000): number {
  for (let i = 1; i <= max; i++) {
    tickInPlace(s);
    if (pred(s)) return i;
  }
  throw new Error(`condition not reached within ${max} ticks (luna: ${s.luna.anim}/${s.luna.routine}/${s.luna.manual})`);
}

export function press(s: SimState, action: LunaAction): SimState {
  return applyIntent(s, { type: 'lunaAction', action });
}

export function rain(s: SimState, on: boolean): SimState {
  return applyIntent(s, { type: 'setWeather', weather: on ? 'rain' : 'sun' });
}

/** Find a generator state whose next float lands in [lo, hi). */
export function rngWhereNextFloatIn(lo: number, hi: number): Rng {
  for (let seed = 0; seed < 100000; seed++) {
    const r = nextFloat(createRng(seed));
    if (r >= lo && r < hi) return createRng(seed);
  }
  throw new Error(`no seed found for [${lo}, ${hi})`);
}

/**
 * A copy of `s` advanced through the head of `tickInPlace` up to Digital Luna: clock, season,
 * weather, then the sheep, who draw from the generator before she does. Tick the copy's DL, or
 * draw from its generator, to see what the real tick will give her.
 */
export function probeBeforeLuna(s: SimState, rng?: Rng): SimState {
  const probe = cloneState(s);
  if (rng) probe.rng = rng;
  probe.clock = advanceClock(probe.clock, TICK_MS);
  probe.season = advanceSeason(probe.season, TICK_MS);
  probe.weather = tickWeather(probe.weather, probe.clock, probe.season, probe.rng);
  tickSheep(probe);
  return probe;
}

/**
 * Find a generator state whose next float, after the sheep have taken their draws for the coming
 * tick, lands in [lo, hi). The sheep tick before DL, so this is the float DL's next roll sees.
 */
export function rngWhereLunaRollIn(s: SimState, lo: number, hi: number): Rng {
  for (let seed = 0; seed < 100000; seed++) {
    const r = nextFloat(probeBeforeLuna(s, createRng(seed)).rng);
    if (r >= lo && r < hi) return createRng(seed);
  }
  throw new Error(`no seed found for [${lo}, ${hi}) after the sheep's draws`);
}

/** Put DL one tick short of an idle play and load the dice so the pick lands in [lo, hi). */
export function armIdlePlay(s: SimState, lo: number, hi: number): SimState {
  s.luna.anim = 'sit';
  s.luna.idle = 6.95;
  s.rng = rngWhereLunaRollIn(s, lo, hi);
  return s;
}

/** DL's foot point. */
export function lunaFootOf(s: SimState): { x: number; y: number } {
  return { x: s.luna.x + 22, y: s.luna.y + 38 };
}

// Weather, ported from the prototype's `autoWeather` and `setWeather`. Live open-meteo mode is a
// host concern: the host feeds observations in as intents and the sim never fetches anything.

import { currentSeason, SEASON_ODDS, SEASON_TEMP, type Clock, type Season, type SeasonName } from './clock';
import { nextFloat, type Rng } from './rng';
import { RULES } from './rules';

export type WeatherKind = 'sun' | 'rain' | 'snow';
/** `season`: the sim rolls its own weather. `manual`: only intents change it. */
export type WeatherMode = 'season' | 'manual';

export interface Weather {
  kind: WeatherKind;
  /** Convenience mirror of `kind === 'rain'`, as the prototype's `rain` flag. */
  rain: boolean;
  /** Degrees C, relaxing towards season, time of day, and weather. */
  temp: number;
  mode: WeatherMode;
  /** Sim time of the next weather roll while sunny. */
  rollAtMs: number;
  /** Sim time when rain or snow clears, or 0 while sunny. */
  untilMs: number;
}

export function createWeather(): Weather {
  return { kind: 'sun', rain: false, temp: 14, mode: 'season', rollAtMs: 0, untilMs: 0 };
}

/** The prototype's `setWeather`: switch kind, keep temperature, clear the end timer. */
export function setWeather(weather: Weather, kind: WeatherKind): Weather {
  return { ...weather, kind, rain: kind === 'rain', untilMs: 0 };
}

/**
 * The temperature the world relaxes towards: the season's nominal degrees, the time of day
 * (coldest before dawn, warmest mid-afternoon), and a penalty for rain or snow. The Ledger sets
 * its temperature straight to this at the end of each step.
 */
export function tempTarget(name: SeasonName, t: number, kind: WeatherKind): number {
  const base = SEASON_TEMP[name];
  const diurnal = Math.sin((t - 0.05) * Math.PI * 2 - Math.PI / 2) * 6 + 3;
  const wx = kind === 'rain' ? -4 : kind === 'snow' ? -2 : 0;
  return base + diurnal + wx;
}

/**
 * One tick of the prototype's `autoWeather`. Temperature tracks season plus time of day whatever
 * the mode; rolls for rain and snow happen only in `season` mode. Returns a new weather object.
 */
export function tickWeather(weather: Weather, clock: Clock, season: Season, rng: Rng): Weather {
  const name = currentSeason(season);
  const k = RULES.tempBlendPerTick;
  let next: Weather = { ...weather, temp: weather.temp * (1 - k) + tempTarget(name, clock.t, weather.kind) * k };
  if (next.mode !== 'season') return next;

  const now = clock.nowMs;
  if (next.kind === 'sun' && now > next.rollAtMs) {
    const [rollLo, rollHi] = RULES.rain.rollEveryMs;
    const [lenLo, lenHi] = RULES.rain.lengthMs;
    next.rollAtMs = now + rollLo + nextFloat(rng) * (rollHi - rollLo);
    const odds = SEASON_ODDS[name];
    const r = nextFloat(rng);
    if (r < odds.snow) {
      next = setWeather(next, 'snow');
      next.untilMs = now + lenLo + nextFloat(rng) * (lenHi - lenLo) * 1.5;
    } else if (r < odds.snow + odds.rain) {
      next = setWeather(next, 'rain');
      next.untilMs = now + lenLo + nextFloat(rng) * (lenHi - lenLo);
    }
  }
  if (next.kind !== 'sun' && next.untilMs && now > next.untilMs) next = setWeather(next, 'sun');
  return next;
}

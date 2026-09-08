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
  /**
   * Sim time (`clock.nowMs`) a deity `weather` intent's hold ends and control hands back to the
   * season. Undefined outside a hold. Optional (PR #43) so a save from before it needs no
   * migration: absent means "no hold", the same as it meant before this field existed.
   */
  holdUntilMs?: number;
  /**
   * A visibility flag set by the deity `weather` intent's `fog` kind; independent of `kind`, so
   * fog can sit over sun, rain, or snow. The engine ticket reads this to dim the scene. Optional
   * (PR #43) for the same reason as `holdUntilMs`: absent means "no fog".
   */
  foggy?: boolean;
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

  const now = clock.nowMs;
  // A deity `weather` intent's hold (PR #43): overrides while it lasts, then hands back to the
  // season with a clean slate, exactly as if the sky had cleared on its own, so the season's own
  // roll schedule is never left stuck mid-override. A later `weather` intent fully replaces an
  // earlier hold in progress (`applyWeather`, intents.ts, overwrites `holdUntilMs` and `foggy`
  // outright) — a short second hold (say a 1-minute fog) cuts an earlier, longer one (a 10-minute
  // rain) short, handing back at the *second* intent's time, not the first's. Round 2 note.
  if (next.mode === 'manual' && next.holdUntilMs !== undefined && now >= next.holdUntilMs) {
    next = setWeather(next, 'sun');
    next.mode = 'season';
    delete next.foggy;
    delete next.holdUntilMs;
  }

  // A season-rolled shower keeps its own clock even under a manual hold, so a deity `fog` tap
  // never freezes one already running: `fog` never calls `setWeather` (Round 2 fix for a Verifier
  // finding), so `kind` and `untilMs` are exactly what the season left them, and this still ends
  // the shower on schedule. A full override (`sun`/`rain`/`snow`/`clear`) already resets `untilMs`
  // to 0 in `setWeather`, so this is a no-op for those — the override itself is the honest "the
  // shower is over" the deity asked for; only a hold that leaves `kind` untouched reaches here.
  if (next.kind !== 'sun' && next.untilMs && now > next.untilMs) next = setWeather(next, 'sun');

  if (next.mode !== 'season') return next;

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
  return next;
}

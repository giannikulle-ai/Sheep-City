// URL parameters that pick a scene. Pure, so it is unit tested.
// ?seed=9&t=0.7&weather=snow&season=winter&freeze=1&live=1     a fresh world, not saved
// ?fixture=1&t=0.7&weather=snow&now=100000                     the frozen fixture still, for goldens
// ?fresh=1                                                     forget the save and start a new farm
import type { Season, Weather } from '@sheepcliff/render';

export interface SceneParams {
  /** clock 0..1 */
  t: number;
  weather: Weather;
  season: Season;
  temp: number;
  /** fixed render clock in ms, or null to use performance.now() */
  now: number | null;
  /** stop the clock (and, with `now`, animation) for screenshots */
  freeze: boolean;
  liveWeather: boolean;
  /** sim seed; the same seed always gives the same world */
  seed: number;
  /** draw the frozen fixture instead of running the sim (goldens only) */
  fixture: boolean;
  /** true when the URL pins any scene parameter: the world starts fresh and is not saved */
  scratch: boolean;
  /** forget the saved farm and start again, saving as usual */
  fresh: boolean;
}

const WEATHERS: readonly Weather[] = ['sun', 'rain', 'snow'];
const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SCENE_KEYS = ['seed', 't', 'weather', 'season', 'temp', 'now', 'freeze', 'live', 'fixture'] as const;

function pick<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function num(v: string | null, fallback: number): number {
  if (v === null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const DEFAULT_TEMP: Record<Season, number> = { spring: 12, summer: 26, autumn: 10, winter: -3 };

export function parseSceneParams(search: string): SceneParams {
  const q = new URLSearchParams(search);
  const weather = pick(q.get('weather'), WEATHERS, 'sun');
  const season = pick(q.get('season'), SEASONS, weather === 'snow' ? 'winter' : 'spring');
  const nowRaw = q.get('now');
  const now = nowRaw === null ? null : num(nowRaw, 0);
  const t = Math.min(0.9999, Math.max(0, num(q.get('t'), 0.18)));
  return {
    t,
    weather,
    season,
    temp: num(q.get('temp'), weather === 'snow' ? -3 : DEFAULT_TEMP[season]),
    now,
    freeze: q.get('freeze') === '1' || now !== null,
    liveWeather: q.get('live') === '1',
    seed: Math.max(0, Math.floor(num(q.get('seed'), 1))) >>> 0,
    fixture: q.get('fixture') === '1',
    scratch: SCENE_KEYS.some((k) => q.has(k)),
    fresh: q.get('fresh') === '1',
  };
}

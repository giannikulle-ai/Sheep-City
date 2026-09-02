// URL parameters that pick a fixture scene. Pure, so it is unit tested.
// ?t=0.7&weather=snow&season=winter&temp=-3&now=100000&freeze=1&live=1&seed=9
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
}

const WEATHERS: readonly Weather[] = ['sun', 'rain', 'snow'];
const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

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
  };
}

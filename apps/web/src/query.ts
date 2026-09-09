// URL parameters that pick a scene. Pure, so it is unit tested.
// ?seed=9&t=0.7&weather=snow&season=winter&freeze=1&live=1     a fresh world, not saved
// ?fixture=1&t=0.7&weather=snow&now=100000                     the frozen fixture still, for goldens
// ?fresh=1                                                     forget the save and start a new farm
// ?gap=10080                                                   QA: force a storybook page on a scratch world
//                                                               (real minutes away; 10080 = a week — the
//                                                               same unit the real load/wake path's awayMs
//                                                               is in, never the gate's day-scaled minutes)
// ?realNow=1797292800000                                       QA: the real instant the sim takes as "now"
//                                                               for its real-year season calendar (UTC ms;
//                                                               this one is 2026-12-15, DL's birthday).
//                                                               Pins the calendar on a scratch world, which
//                                                               would otherwise use the sim's own
//                                                               DEFAULT_REAL_EPOCH_MS. See `worldRealNowMs`.
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
  /** QA: force a storybook page on the fresh scratch world, this many real (wall-clock) minutes
   * away (?gap=), or null when absent — the same unit `awayMs` is in on the real load/wake path. */
  gapMinutes: number | null;
  /**
   * QA: the real instant (UTC ms since 1970) the sim should take as "now" for its real-year season
   * calendar (?realNow=), or null when absent. Only a URL says this; the page never invents one for
   * a pinned world. See `worldRealNowMs` below for what it is for.
   */
  realNow: number | null;
}

const WEATHERS: readonly Weather[] = ['sun', 'rain', 'snow'];
const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
const SCENE_KEYS = ['seed', 't', 'weather', 'season', 'temp', 'now', 'freeze', 'live', 'fixture', 'gap', 'realNow'] as const;

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
    gapMinutes: q.has('gap') ? num(q.get('gap'), 0) : null,
    realNow: q.has('realNow') ? num(q.get('realNow'), 0) : null,
  };
}

/**
 * The real instant the sim should take as "now" — the epoch a fresh world's season calendar is
 * anchored to (`createInitialState(seed, { realEpochMs })`) and the real time a pre-v8 save is
 * migrated against (`fromSave(doc, { realNowMs })`). `undefined` means "do not tell the sim what
 * time it is", and the sim falls back to its own fixed `DEFAULT_REAL_EPOCH_MS`.
 *
 * The rule, and the reason for each half (#84):
 *
 *   * **A real player's farm gets the wall clock.** That is the whole point of the ticket — the
 *     owner's world should be in the season the world outside the window is in, and Digital Luna's
 *     birthday should be her birthday. The sim itself never reads a clock (its charter forbids it);
 *     this is the one place the host tells it.
 *   * **A world the URL pins, or one a QA hook reseeded, does not.** A scratch world (`?seed=`,
 *     `?t=`, `?gap=`, the fixture, …) and a `window.sheepcliff.qa.seed()` world exist to be
 *     identical every time they are opened — the e2e goldens and the storybook goldens are exactly
 *     that. Handing them `Date.now()` would make the season, and so the temperature, the snowy
 *     ground and every card with a `season` condition, depend on the real date the suite happened
 *     to run on. So they get the sim's fixed default instead.
 *   * **`?realNow=` overrides both**, so a pinned world can still be put on a chosen real date —
 *     December 15, say — and stay reproducible. It is a chosen UTC instant, unadjusted: no offset
 *     is applied to it, so a test or a golden that pins it keeps meaning exactly what it says.
 *
 * **The real player's half is local civil time, not the UTC instant** (decision 18, 2026-09-09 —
 * the owner: "my day, not the world's day"). `calendar.ts` reads a civil date in UTC by
 * construction (Hinnant's arithmetic, no `Date`, no time zone anywhere in the sim), so without an
 * adjustment "December 15" would be the UTC day — for the owner in US Central that day runs
 * 18:00 the 14th to 18:00 the 15th, local. The fix is entirely here, one line: shift `wallNow()` by
 * the local offset before it ever reaches the sim, so the instant the sim reads *as* UTC carries the
 * owner's own wall-clock fields. `tzOffsetMinutes` defaults to the real `Date.prototype.getTimezoneOffset`
 * (positive west of UTC — Central Standard Time is `+360`), passed in the same way `wallNow` is, so
 * a test can pin it without depending on the runner's own time zone.
 *
 * `wallNow` is passed in rather than called here so a test can prove the pinned path never reaches
 * for the clock at all, which is the property that keeps the goldens byte-identical.
 */
export function worldRealNowMs(
  params: Pick<SceneParams, 'realNow' | 'scratch'>,
  qaDriven: boolean,
  wallNow: () => number,
  tzOffsetMinutes: () => number = () => new Date().getTimezoneOffset(),
): number | undefined {
  if (params.realNow !== null) return params.realNow;
  if (params.scratch || qaDriven) return undefined;
  return wallNow() - tzOffsetMinutes() * 60_000;
}

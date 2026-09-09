// The real calendar: what real date a world is on, and where its four seasons start in the real
// year. Pure functions of two numbers — a real instant in milliseconds and the world's seed —
// with no state and no clock of their own.
//
// **Why the sim has a real calendar at all** (the owner's decision, 2026-09-08, plan section 2
// "Time" and section 11 decision 10): seasons no longer cycle on a fixed nine-real-day wheel.
// They follow the real year, four across it, roughly a quarter each, and a world's own seed
// nudges each season's start a few days either way so two worlds on the same real day are not
// necessarily in the same season. Digital Luna's birthday is December 15, a real date, so a world
// started in June waits for it.
//
// **Where the real date comes from.** The sim never reads a wall clock (charter: "Time comes in as
// a parameter"). A world stores the real instant it was created at — `Season.realEpochMs` in
// clock.ts, handed in by the host — and the host maps wall time to sim time one to one
// (`ledger/catch-up.ts`), so the real instant at any sim moment is `realEpochMs + clock.nowMs`.
// Everything below takes that number; nothing below asks anyone what time it is.
//
// **Everything is UTC.** A real date here is a civil year/month/day in UTC, computed by Howard
// Hinnant's `days_from_civil` / `civil_from_days` (public domain, the same pair every C++20
// `<chrono>` implementation uses) rather than by `Date`, which the package's no-wall-clock guard
// bans and which would drag a local time zone into a deterministic sim. A world in Berlin and a
// world in Auckland created at the same instant get the same calendar; the day boundary is UTC
// midnight for both.

import { mix32 } from './hash';
import { createRng, nextFloat } from './rng';
import { RULES } from './rules';

/** The four seasons, in order, northern hemisphere. `outsideRules.seasons.order` in farm.json. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type SeasonName = (typeof SEASONS)[number];

/** One real day. The unit every number in `outsideRules.seasons.calendar` is written in. */
export const MS_PER_REAL_DAY = 86_400_000;

/**
 * One real year, for the code that needs "about a year" as a number: the Gregorian mean year,
 * 365.2425 days. Only the authored-date cooldown uses it (`engine.ts`), and only as a bar that has
 * to sit under the shortest real year and over the longest season; a real year's own length is
 * never assumed anywhere the calendar itself is read.
 */
export const REAL_YEAR_MS = 365.2425 * MS_PER_REAL_DAY;

/**
 * The real instant a world gets when nobody hands it one: 2026-04-01T00:00:00Z.
 *
 * The host is meant to pass the real time (`createInitialState(seed, { realEpochMs })`, and
 * `fromSave(doc, { realNowMs })` for a save that predates the calendar). This constant is what a
 * caller that does not — every test in this package, and the client until its own lane wires the
 * clock through — gets instead, so a world is still a function of its seed alone.
 *
 * April 1 rather than "today": spring starts between March 10 and March 30 for every possible
 * seed (the March 20 anchor plus at most ten days of drift) and summer between June 11 and July 1,
 * so April 1 falls in **spring on every seed**. A world created without a real time therefore
 * starts in spring exactly as every world did before this change, which is what keeps the fresh-
 * world pins in this package measuring the thing they were written to measure.
 */
export const DEFAULT_REAL_EPOCH_MS = 1_775_001_600_000;

/** A civil date in UTC: a real year, a month 1-12, and a day of that month. */
export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** `outsideRules.seasons.calendar` as the world lane wrote it (#83), through RULES. */
export const CALENDAR = RULES.calendar;

/**
 * Days since 1970-01-01 for a civil date, Hinnant's `days_from_civil`. Exact for every date this
 * sim can reach; no floating point beyond integer arithmetic.
 */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/** The inverse: the civil date of a day count since 1970-01-01, Hinnant's `civil_from_days`. */
export function civilFromDays(days: number): CivilDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** The UTC civil date a real instant falls on. */
export function realDateAt(realMs: number): CivilDate {
  return civilFromDays(Math.floor(realMs / MS_PER_REAL_DAY));
}

/** The real instant a UTC civil date begins at (its midnight). */
export function realMsOfCivil(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) * MS_PER_REAL_DAY;
}

/**
 * This world's drift for one season of one real year, in milliseconds, uniform over
 * `startOffsetDriftRealDays` (today [-10, +10] real days).
 *
 * Drawn from a generator of its own, seeded by hashing (world seed, real year, season) — **never**
 * from the world's tick stream (`state.rng`) or the engine's (`state.events.rng`). Reading the
 * calendar is a lookup, not an event: it must be answerable at any moment, any number of times,
 * from the Ledger as well as from the actors, without moving a single other roll. Each season is
 * drawn independently of the others, as `outsideRules.seasons.calendar` says.
 */
export function seasonStartDriftMs(seed: number, year: number, season: SeasonName): number {
  const [lo, hi] = CALENDAR.startOffsetDriftRealDays;
  const rng = createRng(mix32(`sheepcliff/season-start|${seed >>> 0}|${year}|${season}`));
  return Math.round((lo + nextFloat(rng) * (hi - lo)) * MS_PER_REAL_DAY);
}

/** The real instant `season` begins in real year `year`, for this world: anchor plus its drift. */
export function seasonStartRealMs(seed: number, year: number, season: SeasonName): number {
  const anchor = CALENDAR.anchors[season];
  return realMsOfCivil(year, anchor.month, anchor.day) + seasonStartDriftMs(seed, year, season);
}

/**
 * One season as this world lives it: which one, when it started, and when the next one starts.
 *
 * A season's **length is never sampled**. It is the gap from its own start to the next season's
 * start, exactly as `outsideRules.seasons.calendar` requires, which is what makes overlapping or
 * inverted seasons impossible however the drift falls: the anchors are 89 to 93 real days apart
 * and each start moves by at most 10 days, so the smallest possible gap is 89 - 20 = 69 days and
 * the largest 93 + 20 = 113. `nominalRealDays` (91) and `lengthDriftRealDays` ([-22, +22]) in the
 * data describe that spread; neither is read here, and neither should be.
 */
export interface SeasonSpan {
  readonly name: SeasonName;
  /** Real instant this season began. */
  readonly startMs: number;
  /** Real instant the next season begins; this season's last moment is one ms before it. */
  readonly endMs: number;
}

/** Every season start in one real year, this world's own. */
function startsInYear(seed: number, year: number): { name: SeasonName; at: number }[] {
  return SEASONS.map((name) => ({ name, at: seasonStartRealMs(seed, year, name) }));
}

/**
 * The last span each seed was asked for. A **memo of a pure function**, not state: every entry is
 * something `seasonSpanAt` would recompute identically, so clearing it at any moment changes no
 * answer, and nothing outside this file can read it or tell it is there.
 *
 * It is here because the calendar is read on hot paths — once per weather roll in the Ledger's
 * catch-up (`ledger/advance.ts`), once per unwatched look (`ledger/unwatched.ts`, about 80,000 of
 * them in a real week away), once per authored trigger on every live evaluation — and a cold read
 * hashes and draws twelve season starts and sorts them. A world sits in one season for 69 to 113
 * real days, so the one-entry-per-seed cache answers essentially every one of those reads. The cap
 * is a plain size check rather than an LRU: worlds are counted in ones, not thousands.
 */
const spanCache = new Map<number, SeasonSpan>();
const SPAN_CACHE_CAP = 64;

/**
 * The season a real instant falls in for this world, with its start and end.
 *
 * Three years of starts are laid out (the one before, the one containing `realMs`, and the one
 * after) so a winter that runs from December into the next March, and a January instant that
 * belongs to the previous December's winter, both land in the right span. Twelve starts is enough
 * by a wide margin: the earliest is the previous March and the latest the next December, and the
 * drift can move neither past `realMs`'s own year.
 */
export function seasonSpanAt(seed: number, realMs: number): SeasonSpan {
  const key = seed >>> 0;
  const cached = spanCache.get(key);
  if (cached && realMs >= cached.startMs && realMs < cached.endMs) return cached;
  const span = computeSeasonSpanAt(key, realMs);
  if (spanCache.size >= SPAN_CACHE_CAP) spanCache.clear();
  spanCache.set(key, span);
  return span;
}

function computeSeasonSpanAt(seed: number, realMs: number): SeasonSpan {
  const year = realDateAt(realMs).year;
  const starts = [...startsInYear(seed, year - 1), ...startsInYear(seed, year), ...startsInYear(seed, year + 1)].sort((a, b) => a.at - b.at);
  let i = 0;
  while (i + 1 < starts.length && (starts[i + 1] as { at: number }).at <= realMs) i++;
  const here = starts[i] as { name: SeasonName; at: number };
  const next = starts[i + 1];
  // `next` is always there for any instant in `year` (the last start is the following December),
  // and `here.at <= realMs` for the same reason at the other end. Both fallbacks are for a caller
  // that hands in something absurd rather than for anything the sim can reach: a span still comes
  // back, so no reader of the calendar can be made to throw.
  return { name: here.name, startMs: here.at, endMs: next ? next.at : here.at + REAL_YEAR_MS / 4 };
}

/** The season a real instant falls in for this world. */
export function seasonAtRealMs(seed: number, realMs: number): SeasonName {
  return seasonSpanAt(seed, realMs).name;
}

/**
 * How far through its season a real instant is: 0 at the season's first moment, approaching but
 * never reaching 1 at its end. A fraction of the season's **own realized length**, so "halfway
 * through summer" means the same thing in a 69-day summer and a 113-day one.
 */
export function seasonFractionAtRealMs(seed: number, realMs: number): number {
  const span = seasonSpanAt(seed, realMs);
  const length = span.endMs - span.startMs;
  return length > 0 ? (realMs - span.startMs) / length : 0;
}

/**
 * Is `realMs` on the real calendar date (`month`, `day`)?
 *
 * With no `windowMs` the whole real day counts, UTC midnight to UTC midnight. With one, only the
 * first `windowMs` of it — an authored event that wants a narrower door than a full real day (a
 * `realDate` trigger's optional `windowSimMinutes`, converted to sim ms by the caller, which is
 * the same as real ms under the host's one-to-one mapping).
 *
 * A date that does not exist in a given year simply never matches in that year: February 29 is
 * true in a leap year and false otherwise, and nothing here invents a March 1 for it.
 */
export function realDateMatches(realMs: number, month: number, day: number, windowMs?: number): boolean {
  const date = realDateAt(realMs);
  if (date.month !== month || date.day !== day) return false;
  if (windowMs === undefined) return true;
  return realMs - realMsOfCivil(date.year, month, day) < windowMs;
}

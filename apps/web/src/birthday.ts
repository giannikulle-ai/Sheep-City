// A quiet reminder that Digital Luna's birthday is coming, and that it is today (#117).
//
// The birthday itself — the event that starts the party — is the sim's, held on December 15 in a
// world's own real calendar until the first watched step (`realDateDue`, packages/sim/src/engine
// /engine.ts, #84). This module only tells the player it is coming and that it is here; it never
// starts anything and it is not the storybook line for a held birthday that finally runs (that
// line comes from the chronicle — "the storybook only tells", CLAUDE.md's non-negotiable, and
// issue #117's own "done means": "the client adds no line of its own").
//
// No wall clock is read here, directly or otherwise: every function below takes the world's own
// real "now" (`realMsOf(sim.season)`, @sheepcliff/sim — the same number the sim's own calendar is
// read from) or a plain real-day key derived from it. A scratch world pinned by the URL with no
// `?realNow=` sits at the sim's fixed default epoch (spring, `DEFAULT_REAL_EPOCH_MS`) and never
// enters the reminder's window; one pinned near December with `?realNow=` does, on purpose — see
// `apps/web/src/query.ts`'s `worldRealNowMs`.

import { daysFromCivil, realDateAt } from '@sheepcliff/sim';

/** Digital Luna's birthday, the real calendar date (#84, plan section 11 decision 10). */
const BIRTHDAY_MONTH = 12;
const BIRTHDAY_DAY = 15;

/** How many days out the countdown starts — a client constant, issue #117's "done means". */
export const REMINDER_DAYS_BEFORE = 3;

/** The line shown on December 15 itself. The client's own words; the chronicle's line is separate. */
export const BIRTHDAY_TODAY_LINE = "It's Digital Luna's birthday today!";

/** The line shown in the days before — issue #117's own wording, singular on the one-day case. */
export function beforeBirthdayLine(daysUntil: number): string {
  return `Digital Luna's birthday is in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`;
}

/**
 * Real days from `realMs` to the next December 15 — 0 on the day itself, counting up to the next
 * occurrence otherwise (never backward: once the 15th has passed this year, the count is to next
 * year's).
 */
export function daysUntilBirthday(realMs: number): number {
  const today = realDateAt(realMs);
  const todayCount = daysFromCivil(today.year, today.month, today.day);
  const thisYear = daysFromCivil(today.year, BIRTHDAY_MONTH, BIRTHDAY_DAY);
  const nextOccurrence = thisYear >= todayCount ? thisYear : daysFromCivil(today.year + 1, BIRTHDAY_MONTH, BIRTHDAY_DAY);
  return nextOccurrence - todayCount;
}

/** The real-day key (`YYYY-MM-DD`, UTC civil date) `realMs` falls on — what "once per real day" counts by. */
export function realDayKey(realMs: number): string {
  const d = realDateAt(realMs);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** The reminder line for a given countdown, or `null` outside the window (more than {@link REMINDER_DAYS_BEFORE} days out). */
export function birthdayReminderLine(daysUntil: number): string | null {
  if (daysUntil === 0) return BIRTHDAY_TODAY_LINE;
  if (daysUntil > 0 && daysUntil <= REMINDER_DAYS_BEFORE) return beforeBirthdayLine(daysUntil);
  return null;
}

export interface BirthdayReminder {
  /** The line to show, or `null` when there is nothing to say right now. */
  line: string | null;
  /** The real-day key this call happened on — persist it (only when `line` is non-null) as the next call's `lastShownDayKey`. */
  dayKey: string;
}

/**
 * The tray's quiet birthday line, at most once per real day (issue #117's "done means"): `null`
 * when today has already been shown (`dayKey === lastShownDayKey`), and `null` outside the three
 * days before December 15 and the day itself. Pure — no clock, no storage; the caller (main.ts)
 * reads `realMsOf(sim.season)` for `realMs` and owns persisting `dayKey` across a real day.
 */
export function birthdayReminder(realMs: number, lastShownDayKey: string | null): BirthdayReminder {
  const dayKey = realDayKey(realMs);
  if (dayKey === lastShownDayKey) return { line: null, dayKey };
  return { line: birthdayReminderLine(daysUntilBirthday(realMs)), dayKey };
}

/**
 * The tray lines this open should show, in the order they must appear. A load-time message (e.g.
 * "restored: back after …", already on the tray the moment the world is adopted) always comes
 * first — the birthday reminder is quiet by design and must never overwrite it, so main.ts shows
 * this array in order rather than calling `tray.say` for the birthday line at the same instant.
 * Either half may be absent; `[]` when there is nothing to say at all.
 */
export function traySequence(loadMessage: string | null, birthdayLine: string | null): string[] {
  const seq: string[] = [];
  if (loadMessage !== null) seq.push(loadMessage);
  if (birthdayLine !== null) seq.push(birthdayLine);
  return seq;
}

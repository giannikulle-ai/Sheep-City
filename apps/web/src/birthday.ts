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

/**
 * What main.ts reads off the tray (and the deity `call` prompt) before a deferred birthday line is
 * allowed to write to it — round 2 on #117, Opus verifier blocker B1. Every field independently
 * blocks the write; none is inferred from another, so a gap in one signal does not fall through the
 * others.
 */
export interface TrayFreeState {
  /** Something other than the load message this reminder is trailing has been said since — the
   * player's own feedback (a tap, a weather chip, a verb) or another `adopt`. That message is live
   * and must not be silently replaced. */
  liveMessage: boolean;
  /** A deity `call` verb is still waiting on a stage tap (`awaitingCall`, main.ts). */
  awaitingCall: boolean;
  /** The tray's own "waiting" cue is lit (`tray.say(text, true)` — a dispatched intent whose sim
   * reaction has not landed yet). Kept as its own check alongside `liveMessage`, which already
   * implies it, so a caller wiring only this one still gets the protection. */
  waitingCue: boolean;
  /** The storybook card is covering the tray (#117 round 2 finding F3): the player cannot see the
   * tray to read anything written to it right now. */
  storybookVisible: boolean;
}

/**
 * Whether the tray is free for the birthday reminder to write to right now: nothing live on it,
 * no pending deity prompt, no waiting cue, and no storybook card in the way. Pure, so main.ts polls
 * it every animation frame instead of writing unconditionally after a fixed delay — the fixed
 * 4-second timer the round-1 guard used could and did land on top of a player's own tap feedback,
 * or on a still-open "tap the stage for Digital Luna to walk to" prompt, silently.
 */
export function trayIsFree(state: TrayFreeState): boolean {
  return !state.liveMessage && !state.awaitingCall && !state.waitingCue && !state.storybookVisible;
}

/**
 * How long the tray's current message must have been readable before the deferred birthday line is
 * allowed to replace it — Opus verifier round 3, blocker B4.
 *
 * Round 2 waited for the tray to be *free*, which is necessary and not sufficient: `trayIsFree`
 * deliberately does not count the load message the reminder is trailing as `liveMessage`, so the
 * very first polled frame was already free. Measured on the built app: "the saved farm could not be
 * read (bad-version); starting a new one" at 24 ms, the birthday line at 47 ms. Twenty-three
 * milliseconds is not a read, and that line is the only notice the player's farm was replaced.
 * Dismissing a storybook card was no better — the card hides the tray, so the restored message
 * underneath it was swapped out in the same frame the card went away, never having been visible.
 *
 * Four seconds of *visible* tray is the floor. It is the same read round 1's fixed timer allowed,
 * kept as a floor under the round-2 wait rather than as the whole rule, so the line still never
 * lands on a player's own feedback or an open deity prompt.
 */
export const TRAY_READ_DWELL_MS = 4_000;

/** What one poll of {@link trayDwell} decides: keep waiting, write the line now, or give up on this
 * open entirely (something else owns the tray and never gives it back). */
export type TrayDwellStep = 'wait' | 'show' | 'abandon';

export interface TrayDwellPoll {
  /**
   * One animation frame's decision. `nowMs` is the client's own monotonic clock
   * (`performance.now()` in main.ts): the dwell is real time on the player's screen, and no clock
   * read here reaches the sim — the reminder's *content* still comes from the world's own real now
   * (`realMsOf(sim.season)`), never from this.
   */
  step(nowMs: number, state: TrayFreeState): TrayDwellStep;
}

/**
 * The deferred birthday line's own state between frames: the tray must be free (`trayIsFree`) *and*
 * the message currently on it must have been readable for {@link TRAY_READ_DWELL_MS}.
 *
 * `shownAtMs` is when that message went onto the tray. Card time is not reading time: while the
 * storybook card covers the tray the dwell keeps restarting, so dismissing a card gives the message
 * underneath it the same four seconds a message that was never covered gets.
 *
 * A message from anywhere else (`liveMessage` — the player's own tap feedback, a weather chip, a
 * second `adopt`) abandons the reminder rather than waiting: that signal never clears again for the
 * rest of the open, so waiting on it would poll every frame until the tab closes and still never
 * write. Abandoning is also why main.ts must not spend the once-per-real-day key until the line is
 * really written (round 2 finding).
 */
export function trayDwell(shownAtMs: number): TrayDwellPoll {
  // When the message now on the tray became readable: when it was said, or when the card that was
  // covering it went away, whichever is later.
  let readableSinceMs = shownAtMs;
  return {
    step(nowMs, state) {
      if (state.liveMessage) return 'abandon';
      if (state.storybookVisible) {
        readableSinceMs = nowMs;
        return 'wait';
      }
      if (!trayIsFree(state)) return 'wait';
      return nowMs - readableSinceMs >= TRAY_READ_DWELL_MS ? 'show' : 'wait';
    },
  };
}

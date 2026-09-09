import { describe, expect, it } from 'vitest';
import { createInitialState, realMsOf, realMsOfCivil } from '@sheepcliff/sim';
import {
  BIRTHDAY_TODAY_LINE,
  beforeBirthdayLine,
  birthdayReminder,
  daysUntilBirthday,
  realDayKey,
  REMINDER_DAYS_BEFORE,
  TRAY_READ_DWELL_MS,
  trayDwell,
  trayIsFree,
  traySequence,
  type TrayFreeState,
} from './birthday';

describe('daysUntilBirthday', () => {
  it('counts down to December 15 and wraps to next year the day after', () => {
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 12))).toBe(3);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 14))).toBe(1);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 15))).toBe(0);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 16))).toBe(364); // next Dec 15 is 2027's, not a leap year in between
  });
});

describe('beforeBirthdayLine', () => {
  it('is singular on the one-day case and plural otherwise', () => {
    expect(beforeBirthdayLine(1)).toBe("Digital Luna's birthday is in 1 day");
    expect(beforeBirthdayLine(2)).toBe("Digital Luna's birthday is in 2 days");
    expect(beforeBirthdayLine(3)).toBe("Digital Luna's birthday is in 3 days");
  });
});

describe('birthdayReminder', () => {
  it('shows the countdown line once per real day, three days before', () => {
    const dec12 = realMsOfCivil(2026, 12, 12) + 1_000; // a moment into the day
    const first = birthdayReminder(dec12, null);
    expect(first.line).toBe(beforeBirthdayLine(REMINDER_DAYS_BEFORE));
    expect(first.line).toBe("Digital Luna's birthday is in 3 days");
    expect(first.dayKey).toBe(realDayKey(dec12));

    // opened again later the same real day: nothing more to say
    const second = birthdayReminder(dec12 + 60_000, first.dayKey);
    expect(second.line).toBeNull();

    // a new real day, still inside the window: shown again
    const dec13 = realMsOfCivil(2026, 12, 13) + 1_000;
    const third = birthdayReminder(dec13, first.dayKey);
    expect(third.line).toBe(beforeBirthdayLine(2));

    // one day out: singular
    const dec14 = realMsOfCivil(2026, 12, 14) + 1_000;
    const fourth = birthdayReminder(dec14, third.dayKey);
    expect(fourth.line).toBe("Digital Luna's birthday is in 1 day");
  });

  it('shows the birthday line on December 15 itself, while watched', () => {
    const dec15 = realMsOfCivil(2026, 12, 15) + 5_000;
    const r = birthdayReminder(dec15, null);
    expect(r.line).toBe(BIRTHDAY_TODAY_LINE);

    // and nothing more that same real day once it has been shown
    expect(birthdayReminder(dec15 + 30_000, r.dayKey).line).toBeNull();

    // a fresh open the next real day (the held birthday itself may still be owed; that is the
    // sim's business, not this reminder's) says nothing — outside the window
    const dec16 = realMsOfCivil(2026, 12, 16) + 1_000;
    expect(birthdayReminder(dec16, r.dayKey).line).toBeNull();
  });

  it('says nothing more than three days out, and nothing once the day has passed', () => {
    expect(birthdayReminder(realMsOfCivil(2026, 12, 11), null).line).toBeNull();
    expect(birthdayReminder(realMsOfCivil(2026, 12, 16), null).line).toBeNull();
    expect(birthdayReminder(realMsOfCivil(2026, 6, 1), null).line).toBeNull();
  });

  it('a scratch world pinned by the URL with no ?realNow= shows nothing; one pinned onto the window does', () => {
    // No realEpochMs handed in: the sim's own DEFAULT_REAL_EPOCH_MS, which lands in spring —
    // exactly what a `?seed=` scratch world (no `?realNow=`) gets from `worldRealNowMs` (query.ts).
    const scratch = createInitialState(9);
    expect(birthdayReminder(realMsOf(scratch.season), null).line).toBeNull();

    // The same seed, pinned onto December 15 the way `?seed=9&realNow=<dec-15-ms>` would be.
    const pinned = createInitialState(9, { realEpochMs: realMsOfCivil(2026, 12, 15) });
    expect(birthdayReminder(realMsOf(pinned.season), null).line).toBe(BIRTHDAY_TODAY_LINE);

    // Pinned three days out instead.
    const pinnedBefore = createInitialState(9, { realEpochMs: realMsOfCivil(2026, 12, 12) });
    expect(birthdayReminder(realMsOf(pinnedBefore.season), null).line).toBe(beforeBirthdayLine(3));
  });
});

describe('traySequence', () => {
  it('a restored world three days out gets both lines, the restored message first', () => {
    const dec12 = realMsOfCivil(2026, 12, 12) + 1_000;
    const restoredMessage = 'restored: back after 3 days';
    const r = birthdayReminder(dec12, null);
    expect(r.line).toBe(beforeBirthdayLine(3));

    expect(traySequence(restoredMessage, r.line)).toEqual([restoredMessage, beforeBirthdayLine(3)]);
  });

  it('either half may be absent, and both may be', () => {
    expect(traySequence(null, "Digital Luna's birthday is in 1 day")).toEqual(["Digital Luna's birthday is in 1 day"]);
    expect(traySequence('restored: the farm continues where it was', null)).toEqual(['restored: the farm continues where it was']);
    expect(traySequence(null, null)).toEqual([]);
  });
});

describe('trayIsFree', () => {
  // A tray with nothing live on it, no pending prompt, no waiting cue, and no storybook card in
  // the way: the one state the deferred birthday line is allowed to write in.
  const free: TrayFreeState = { liveMessage: false, awaitingCall: false, waitingCue: false, storybookVisible: false };

  it('is free when the tray holds nothing live, pending, waiting, or covered', () => {
    expect(trayIsFree(free)).toBe(true);
  });

  // Opus verifier round 2, blocker B1, the deity `call` verb: tapped from the tray, "call" asks the
  // stage for a point and leaves `awaitingCall` set and the tray reading "tap the stage for Digital
  // Luna to walk to" with its waiting cue lit until a stage tap resolves it. The round-1 fixed
  // 4-second timer wiped both silently; this state must never say the birthday line is safe to write.
  it('does not overwrite a still-open deity call prompt (awaiting a stage tap)', () => {
    expect(trayIsFree({ ...free, awaitingCall: true, waitingCue: true })).toBe(false);
    // even if only one of the two signals for it is set — each blocks independently
    expect(trayIsFree({ ...free, awaitingCall: true })).toBe(false);
    expect(trayIsFree({ ...free, waitingCue: true })).toBe(false);
  });

  // The other half of B1: a player's own feedback from tapping the stage (petting a sheep, say) —
  // live, but with no waiting cue at all (the sim already answered). The round-1 timer overwrote
  // this one too, four seconds after the tap, wiping feedback the player had just read.
  it('does not overwrite a live message from the player\'s own stage tap', () => {
    expect(trayIsFree({ ...free, liveMessage: true })).toBe(false);
  });

  // Round 2 finding F3: the storybook card sits on top of the tray, so a line written under it
  // cannot be read until the card is dismissed.
  it('does not write while the storybook card covers the tray', () => {
    expect(trayIsFree({ ...free, storybookVisible: true })).toBe(false);
  });
});

// Opus verifier round 3, blocker B4. `trayIsFree` alone is true on the very first frame of a load —
// it deliberately does not count the load message the reminder is trailing as a live one — so round
// 2's "wait for the tray" replaced "restored: back after …" (or "the saved farm could not be read
// …") 23 ms after it was written, on the built app. The load message needs time on screen, not just
// an empty queue behind it. This suite drives the load sequence a frame at a time against a fake
// tray, exactly as main.ts's `requestAnimationFrame` chain does, on a clock the test owns.
describe('trayDwell', () => {
  const free: TrayFreeState = { liveMessage: false, awaitingCall: false, waitingCue: false, storybookVisible: false };
  const LOAD_MESSAGE = 'restored: back after 2 h 05 min';
  const REMINDER = beforeBirthdayLine(3);

  /** A tray already holding the load message at t = 0, and main.ts's own per-frame poll over it. */
  function loadSequence() {
    let text = LOAD_MESSAGE;
    let settled = false;
    const dwell = trayDwell(0);
    return {
      /** what the player reads right now */
      say: () => text,
      abandoned: () => settled && text === LOAD_MESSAGE,
      frame(nowMs: number, state: Partial<TrayFreeState> = {}): void {
        if (settled) return; // main.ts stops polling on 'show' and on 'abandon'
        const step = dwell.step(nowMs, { ...free, ...state });
        if (step === 'abandon') settled = true;
        if (step === 'show') {
          text = REMINDER;
          settled = true;
        }
      },
    };
  }

  it('a reminder due at load leaves the load message up for the whole dwell, then takes the tray', () => {
    const seq = loadSequence();

    // the frames of the first four seconds: the load message is never replaced early
    for (const t of [0, 16, 100, 1_000, 2_500, TRAY_READ_DWELL_MS - 1]) {
      seq.frame(t);
      expect(seq.say()).toBe(LOAD_MESSAGE);
    }

    seq.frame(TRAY_READ_DWELL_MS);
    expect(seq.say()).toBe(REMINDER);
  });

  it('counts the dwell from when the message was shown, not from the first poll', () => {
    // main.ts hands `trayDwell` the instant the load message went onto the tray, and the poll only
    // starts a frame or two later; the read the player already had must count.
    const dwell = trayDwell(1_000);
    expect(dwell.step(1_000 + TRAY_READ_DWELL_MS - 1, free)).toBe('wait');
    expect(dwell.step(1_000 + TRAY_READ_DWELL_MS, free)).toBe('show');
  });

  it('gives the message under a dismissed storybook card the same dwell, card time not counted', () => {
    const seq = loadSequence();

    // the card is up from the first frame (a gap that crossed the storybook's gate opens one during
    // `adopt`), long past the dwell: nothing is written under it
    for (let t = 0; t <= 20_000; t += 500) {
      seq.frame(t, { storybookVisible: true });
      expect(seq.say()).toBe(LOAD_MESSAGE);
    }

    // dismissed just after 20 s — the restored message becomes readable only now, so the four
    // seconds start here rather than having quietly run out while it was hidden (without the reset
    // the line would have landed at 4 s, under the card, and been read by nobody)
    const dismissedAt = 20_000; // the last frame the card was up
    seq.frame(dismissedAt + 16);
    expect(seq.say()).toBe(LOAD_MESSAGE);
    seq.frame(dismissedAt + TRAY_READ_DWELL_MS - 1);
    expect(seq.say()).toBe(LOAD_MESSAGE);

    seq.frame(dismissedAt + TRAY_READ_DWELL_MS);
    expect(seq.say()).toBe(REMINDER);
  });

  it('still never lands on an open deity prompt or a waiting cue, however long the dwell has run', () => {
    const dwell = trayDwell(0);
    const late = TRAY_READ_DWELL_MS * 3;
    expect(dwell.step(late, { ...free, awaitingCall: true })).toBe('wait');
    expect(dwell.step(late, { ...free, waitingCue: true })).toBe('wait');
    // and once the prompt is answered and the tray is free again, the dwell is already satisfied
    expect(dwell.step(late, free)).toBe('show');
  });

  it('abandons the reminder when the player says something else, rather than polling forever', () => {
    const seq = loadSequence();
    seq.frame(500, { liveMessage: true }); // a stage tap: the player's own feedback owns the tray
    expect(seq.abandoned()).toBe(true);

    // `liveMessage` never clears again for the rest of the open, so a later frame must not revive it
    seq.frame(TRAY_READ_DWELL_MS * 2);
    expect(seq.say()).toBe(LOAD_MESSAGE);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialState, realMsOf, realMsOfCivil } from '@sheepcliff/sim';
import { BIRTHDAY_TODAY_LINE, beforeBirthdayLine, birthdayReminder, daysUntilBirthday, realDayKey, REMINDER_DAYS_BEFORE } from './birthday';

describe('daysUntilBirthday', () => {
  it('counts down to December 15 and wraps to next year the day after', () => {
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 12))).toBe(3);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 14))).toBe(1);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 15))).toBe(0);
    expect(daysUntilBirthday(realMsOfCivil(2026, 12, 16))).toBe(364); // next Dec 15 is 2027's, not a leap year in between
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

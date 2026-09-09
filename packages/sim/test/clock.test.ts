import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  advanceSeason,
  createClock,
  createSeason,
  currentSeason,
  DEFAULT_REAL_EPOCH_MS,
  MS_PER_REAL_DAY,
  phaseOf,
  realMsOf,
  seasonAtOffset,
  seasonFractionOf,
  seasonLengthOf,
  seasonSpanOf,
} from '../src/clock';
import { realDateAt, realMsOfCivil } from '../src/calendar';
import { TICK_MS } from '../src/rules';

describe('clock', () => {
  it('starts where the prototype starts', () => {
    const c = createClock();
    expect(c.t).toBe(0.18);
    expect(c.periodSec).toBe(180);
    expect(c.paused).toBe(false);
    expect(c.tick).toBe(0);
    expect(c.nowMs).toBe(0);
  });

  it('has the prototype phase boundaries: day < .42, dusk < .52, night < .92, dawn after', () => {
    expect(phaseOf(0)).toBe('day');
    expect(phaseOf(0.4199)).toBe('day');
    expect(phaseOf(0.42)).toBe('dusk');
    expect(phaseOf(0.5199)).toBe('dusk');
    expect(phaseOf(0.52)).toBe('night');
    expect(phaseOf(0.9199)).toBe('night');
    expect(phaseOf(0.92)).toBe('dawn');
    expect(phaseOf(0.9999)).toBe('dawn');
  });

  it('advances t by dt / period and wraps at 1, counting days', () => {
    let c = createClock();
    c = advanceClock(c, TICK_MS);
    expect(c.t).toBeCloseTo(0.18 + 0.1 / 180, 12);
    expect(c.tick).toBe(1);
    expect(c.nowMs).toBe(100);
    // A whole sim-day is 1800 ticks; after one more the clock has wrapped once.
    for (let i = 0; i < 1800; i++) c = advanceClock(c, TICK_MS);
    expect(c.dayCount).toBe(1);
    expect(c.t).toBeCloseTo(0.18 + 0.1 / 180, 6);
    expect(c.tick).toBe(1801);
  });

  it('does not mutate its input', () => {
    const c = createClock();
    advanceClock(c);
    expect(c.tick).toBe(0);
    expect(c.t).toBe(0.18);
  });

  it('pausing freezes t but time and ticks still pass', () => {
    let c = { ...createClock(), paused: true };
    for (let i = 0; i < 100; i++) c = advanceClock(c);
    expect(c.t).toBe(0.18);
    expect(c.tick).toBe(100);
    expect(c.nowMs).toBe(10000);
    expect(c.dayCount).toBe(0);
  });

  it('a 180 s period gives dusk about 43 sim-seconds after the .18 start', () => {
    let c = createClock();
    let ticks = 0;
    while (phaseOf(c.t) === 'day') {
      c = advanceClock(c);
      ticks++;
    }
    // (.42 - .18) * 180 s = 43.2 s = 432 ticks, give or take one for float drift at the boundary.
    expect(ticks).toBeGreaterThanOrEqual(432);
    expect(ticks).toBeLessThanOrEqual(433);
  });
});

describe('season', () => {
  // PIN MOVED (#84). This describe used to read:
  //
  //   it('cycles spring, summer, autumn, winter every nine sim-days of the real-day kind', ...)
  //     expect(SEASON_MS).toBe(9 * 86400e3);
  //     expect(seasonAt(0)).toBe('spring');           expect(seasonAt(SEASON_MS - 1)).toBe('spring');
  //     expect(seasonAt(SEASON_MS)).toBe('summer');   expect(seasonAt(2 * SEASON_MS)).toBe('autumn');
  //     expect(seasonAt(3 * SEASON_MS)).toBe('winter'); expect(seasonAt(4 * SEASON_MS)).toBe('spring');
  //
  // and reached summer in the override case with `advanceSeason({ ...s, override: null }, SEASON_MS)`.
  // The reason is the ticket: there is no nine-day wheel to cycle, no `SEASON_MS`, and no
  // `seasonAt(elapsedMs)`. A season now comes from the real calendar (`src/calendar.ts`), and the
  // sequence over a real year is pinned in `calendar.test.ts`. What is kept here is the part that
  // is still about the clock's own season slice: where a fresh one starts, and that an override
  // beats the calendar.
  it('a fresh season slice starts at the default real epoch, in spring, on the world’s own seed', () => {
    const s = createSeason(7);
    expect(s.elapsedMs).toBe(0);
    expect(s.override).toBeNull();
    expect(s.seed).toBe(7);
    expect(s.realEpochMs).toBe(DEFAULT_REAL_EPOCH_MS);
    expect(realMsOf(s)).toBe(DEFAULT_REAL_EPOCH_MS);
    expect(realDateAt(realMsOf(s))).toEqual({ year: 2026, month: 4, day: 1 });
    expect(currentSeason(s)).toBe('spring');
  });

  it('the world’s real date is its epoch plus its elapsed sim time, one to one', () => {
    const start = realMsOfCivil(2026, 6, 1);
    let s = createSeason(3, start);
    expect(realMsOf(s)).toBe(start);
    s = advanceSeason(s, 5 * MS_PER_REAL_DAY);
    expect(realDateAt(realMsOf(s))).toEqual({ year: 2026, month: 6, day: 6 });
    // And the offset argument reads ahead or behind without moving the slice.
    expect(realDateAt(realMsOf(s, MS_PER_REAL_DAY))).toEqual({ year: 2026, month: 6, day: 7 });
    expect(realDateAt(realMsOf(s, -MS_PER_REAL_DAY))).toEqual({ year: 2026, month: 6, day: 5 });
    expect(s.elapsedMs).toBe(5 * MS_PER_REAL_DAY);
  });

  it('a fraction is of the season’s own realized length, and its length is start to next start', () => {
    const s = createSeason(1, realMsOfCivil(2026, 7, 15));
    const span = seasonSpanOf(s);
    expect(span.name).toBe('summer');
    expect(seasonLengthOf(s)).toBe(span.endMs - span.startMs);
    // 69 to 113 real days: the anchor gaps (89 to 93) either narrowed or widened by two drifts of
    // at most ten days each. See calendar.ts.
    expect(seasonLengthOf(s) / MS_PER_REAL_DAY).toBeGreaterThanOrEqual(69);
    expect(seasonLengthOf(s) / MS_PER_REAL_DAY).toBeLessThanOrEqual(113);
    expect(seasonFractionOf(s)).toBeCloseTo((realMsOf(s) - span.startMs) / seasonLengthOf(s), 12);
    expect(seasonFractionOf(s)).toBeGreaterThanOrEqual(0);
    expect(seasonFractionOf(s)).toBeLessThan(1);
  });

  it('an override wins over the calendar, and the calendar is still what the fraction reads', () => {
    const s = createSeason(1);
    expect(currentSeason(s)).toBe('spring');
    const held = { ...s, override: 'winter' as const };
    expect(currentSeason(held)).toBe('winter');
    expect(seasonAtOffset(held, 200 * MS_PER_REAL_DAY)).toBe('winter'); // held whatever the date
    // The override is a deity hold on what the sky does, not a claim about the real year: the
    // fraction and the span underneath it are unmoved (`engine.ts`'s `triggerMet` reads the two
    // separately, and always did).
    expect(seasonSpanOf(held)).toEqual(seasonSpanOf(s));
    expect(seasonFractionOf(held)).toBe(seasonFractionOf(s));
    // Off the hold, the calendar answers again — and half a real year on it is not spring.
    const later = advanceSeason(s, 183 * MS_PER_REAL_DAY);
    expect(currentSeason(later)).not.toBe('spring');
  });
});

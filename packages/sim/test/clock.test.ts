import { describe, expect, it } from 'vitest';
import {
  advanceClock,
  advanceSeason,
  createClock,
  createSeason,
  currentSeason,
  phaseOf,
  SEASON_MS,
  seasonAt,
} from '../src/clock';
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
  it('cycles spring, summer, autumn, winter every nine sim-days of the real-day kind', () => {
    expect(SEASON_MS).toBe(9 * 86400e3);
    expect(seasonAt(0)).toBe('spring');
    expect(seasonAt(SEASON_MS - 1)).toBe('spring');
    expect(seasonAt(SEASON_MS)).toBe('summer');
    expect(seasonAt(2 * SEASON_MS)).toBe('autumn');
    expect(seasonAt(3 * SEASON_MS)).toBe('winter');
    expect(seasonAt(4 * SEASON_MS)).toBe('spring');
  });

  it('an override wins over the cycle', () => {
    let s = createSeason();
    expect(currentSeason(s)).toBe('spring');
    s = { ...s, override: 'winter' };
    expect(currentSeason(s)).toBe('winter');
    s = advanceSeason({ ...s, override: null }, SEASON_MS);
    expect(currentSeason(s)).toBe('summer');
  });
});

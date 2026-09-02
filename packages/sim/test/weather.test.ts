import { describe, expect, it } from 'vitest';
import { createClock, createSeason, SEASON_MS } from '../src/clock';
import { createRng } from '../src/rng';
import { RULES } from '../src/rules';
import { createWeather, setWeather, tickWeather, type Weather } from '../src/weather';

describe('weather', () => {
  it('starts sunny at 14 degrees in season mode', () => {
    const w = createWeather();
    expect(w).toEqual({ kind: 'sun', rain: false, temp: 14, mode: 'season', rollAtMs: 0, untilMs: 0 });
  });

  it('setWeather mirrors the rain flag and clears the end timer', () => {
    const w = setWeather({ ...createWeather(), untilMs: 500 }, 'rain');
    expect(w.rain).toBe(true);
    expect(w.untilMs).toBe(0);
    expect(setWeather(w, 'snow').rain).toBe(false);
  });

  it('relaxes temperature towards the season in every mode', () => {
    const clock = { ...createClock(), nowMs: 100 };
    const season = { ...createSeason(), override: 'summer' as const };
    const rng = createRng(1);
    let w: Weather = { ...createWeather(), mode: 'manual' };
    for (let i = 0; i < 3000; i++) w = tickWeather(w, clock, season, rng);
    // Summer base 26 plus the diurnal term at t = .18.
    const diurnal = Math.sin((0.18 - 0.05) * Math.PI * 2 - Math.PI / 2) * 6 + 3;
    expect(w.temp).toBeCloseTo(26 + diurnal, 3);
    expect(w.kind).toBe('sun');
    expect(rng.s).toBe(createRng(1).s);
  });

  it('rolls for rain in season mode and clears it after its length', () => {
    const rng = createRng(11);
    let clock = createClock();
    const season = { ...createSeason(), override: 'autumn' as const };
    let w = createWeather();
    let sawRain = false;
    let rainStarted = 0;
    for (let i = 0; i < 20000; i++) {
      clock = { ...clock, nowMs: clock.nowMs + 100, tick: clock.tick + 1 };
      const before = w.kind;
      w = tickWeather(w, clock, season, rng);
      if (before === 'sun' && w.kind === 'rain') {
        sawRain = true;
        rainStarted = clock.nowMs;
        expect(w.untilMs).toBeGreaterThanOrEqual(clock.nowMs + RULES.rain.lengthMs[0]);
        expect(w.untilMs).toBeLessThanOrEqual(clock.nowMs + RULES.rain.lengthMs[1]);
      }
      if (before === 'rain' && w.kind === 'sun') {
        expect(clock.nowMs - rainStarted).toBeGreaterThan(RULES.rain.lengthMs[0]);
        expect(clock.nowMs - rainStarted).toBeLessThanOrEqual(RULES.rain.lengthMs[1] + 100);
      }
      if (w.kind === 'sun') expect(w.rollAtMs).toBeGreaterThanOrEqual(clock.nowMs);
    }
    expect(sawRain).toBe(true);
  });

  it('never rolls snow in summer', () => {
    const rng = createRng(3);
    let clock = createClock();
    const season = { ...createSeason(), elapsedMs: SEASON_MS };
    let w = createWeather();
    for (let i = 0; i < 40000; i++) {
      clock = { ...clock, nowMs: clock.nowMs + 100 };
      w = tickWeather(w, clock, season, rng);
      expect(w.kind).not.toBe('snow');
    }
  });
});

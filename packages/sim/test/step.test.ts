import { describe, expect, it } from 'vitest';
import { hashState } from '../src/hash';
import { RULES, TICK_MS } from '../src/rules';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import { advance, tick } from '../src/tick';

describe('fixed-step loop', () => {
  it('runs whole ticks and carries the remainder', () => {
    const a = createInitialState(7);
    const b = step(a, [], 250);
    expect(b.clock.tick).toBe(2);
    expect(b.accumulatorMs).toBe(50);
    const c = step(b, [], 50);
    expect(c.clock.tick).toBe(3);
    expect(c.accumulatorMs).toBe(0);
  });

  it('a 16 ms frame runs zero ticks but keeps the time owed', () => {
    const a = createInitialState(7);
    const b = step(a, [], 16);
    expect(b.clock.tick).toBe(0);
    expect(b.accumulatorMs).toBe(16);
    // The world itself is untouched by a zero-tick step.
    expect(hashState({ ...b, accumulatorMs: 0 })).toBe(hashState(a));
  });

  it('gives the same world whether time comes in one lump or many small frames', () => {
    const start = createInitialState(7);
    const lump = step(start, [], 60000);
    let frames = start;
    for (let i = 0; i < 60000 / 16; i++) frames = step(frames, [], 16);
    frames = step(frames, [], 60000 - Math.floor(60000 / 16) * 16);
    expect(frames.clock.tick).toBe(lump.clock.tick);
    expect(hashState({ ...frames, accumulatorMs: 0 })).toBe(hashState({ ...lump, accumulatorMs: 0 }));
  });

  it('never modifies the input state', () => {
    const a = createInitialState(7);
    const before = hashState(a);
    step(a, [{ type: 'setWeather', weather: 'rain' }], 5000);
    tick(a);
    expect(hashState(a)).toBe(before);
  });

  it('maxTicks caps the work per call and leaves the rest in the accumulator', () => {
    const a = createInitialState(7);
    const b = step(a, [], 10000, { maxTicks: 10 });
    expect(b.clock.tick).toBe(10);
    expect(b.accumulatorMs).toBe(9000);
    const c = step(b, [], 0);
    expect(c.clock.tick).toBe(100);
  });

  it('rejects negative or non-finite dt', () => {
    const a = createInitialState(7);
    expect(() => step(a, [], -1)).toThrow();
    expect(() => step(a, [], NaN)).toThrow();
  });

  it('ticks the pure bookkeeping ported from the prototype', () => {
    const a = createInitialState(7);
    const b = advance(a, 10);
    for (let i = 0; i < a.sheep.length; i++) {
      expect(b.sheep[i]!.wool).toBeCloseTo(Math.min(1, a.sheep[i]!.wool + 1 / RULES.woolGrowSec), 9);
    }
    for (let i = 0; i < a.tufts.length; i++) {
      expect(b.tufts[i]!.level).toBeCloseTo(Math.min(1, a.tufts[i]!.level + RULES.tuftRegrowPerSec), 9);
    }
    expect(b.clock.nowMs).toBe(10 * TICK_MS);
  });

  it('completes a shear when its timer passes and banks the wool', () => {
    const a = createInitialState(7);
    a.sheep[0]!.shearAtMs = 250;
    const b = advance(a, 2);
    expect(b.sheep[0]!.shearAtMs).toBe(250);
    const c = tick(b);
    expect(c.sheep[0]!.shearAtMs).toBeNull();
    expect(c.sheep[0]!.wool).toBe(0.05);
    expect(c.banks.wool).toBe(1);
  });

  it('grows a lamb after lambGrowMs', () => {
    const a = createInitialState(7);
    a.sheep[1]!.lambs.push({ x: 0, y: 0, dir: 1, bornMs: 0, grown: false });
    const b = advance(a, RULES.lambGrowMs / TICK_MS);
    expect(b.sheep[1]!.lambs[0]!.grown).toBe(false);
    expect(tick(b).sheep[1]!.lambs[0]!.grown).toBe(true);
  });
});

describe('intents', () => {
  it('apply at the next tick boundary, in order', () => {
    const a = createInitialState(7);
    const b = step(a, [{ type: 'setWeather', weather: 'snow' }, { type: 'setWeather', weather: 'rain' }], 100);
    expect(b.weather.kind).toBe('rain');
    expect(b.weather.rain).toBe(true);
    expect(b.weather.mode).toBe('manual');
    expect(b.pendingIntents).toEqual([]);
  });

  it('queue when a call runs zero ticks and land on the tick after', () => {
    const a = createInitialState(7);
    const b = step(a, [{ type: 'pauseClock', paused: true }], 10);
    expect(b.clock.paused).toBe(false);
    expect(b.pendingIntents).toHaveLength(1);
    const c = step(b, [], 90);
    expect(c.clock.paused).toBe(true);
    expect(c.clock.t).toBe(a.clock.t);
    expect(c.pendingIntents).toEqual([]);
  });

  it('wait for their `at` tick', () => {
    const a = createInitialState(7);
    const b = step(a, [{ type: 'setSeason', season: 'winter', at: 5 }], 300);
    expect(b.season.override).toBeNull();
    expect(b.pendingIntents).toHaveLength(1);
    const c = step(b, [], 200);
    expect(c.clock.tick).toBe(5);
    expect(c.season.override).toBe('winter');
    expect(c.pendingIntents).toEqual([]);
  });

  it('cover the prototype controls: clock slider, period, pause, season, weather mode', () => {
    const a = createInitialState(7);
    const b = step(
      a,
      [
        { type: 'setClock', t: 0.5 },
        { type: 'setPeriod', periodSec: 360 },
        { type: 'setWeatherMode', mode: 'manual' },
      ],
      100,
    );
    expect(b.clock.t).toBeCloseTo(0.5 + 0.1 / 360, 12);
    expect(b.clock.periodSec).toBe(360);
    expect(b.weather.mode).toBe('manual');
    expect(() => step(a, [{ type: 'setPeriod', periodSec: 0 }], 100)).toThrow();
  });

  it('are part of the deterministic record: same intents, same hash', () => {
    const run = () => {
      let s = createInitialState(7);
      s = step(s, [{ type: 'setWeather', weather: 'rain' }], 3000);
      s = step(s, [{ type: 'setWeatherMode', mode: 'season' }], 30000);
      return hashState(s);
    };
    expect(run()).toBe(run());
  });
});

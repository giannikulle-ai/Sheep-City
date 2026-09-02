import { describe, expect, it } from 'vitest';
import { advance, createInitialState, hashState, SaveError } from '@sheepcliff/sim';
import { awayLabel, awaySummary, catchUp, dayMs, ENVELOPE_FORMAT, restore, saveText } from './save';
import { simView } from './view';

describe('save text', () => {
  it('round-trips the world and the wall clock', () => {
    const sim = advance(createInitialState(9), 37);
    const text = saveText(sim, 1_700_000_000_000);
    const doc = JSON.parse(text) as { format: string; savedAt: number; save: { format: string; version: number } };
    expect(doc.format).toBe(ENVELOPE_FORMAT);
    expect(doc.savedAt).toBe(1_700_000_000_000);
    expect(doc.save.format).toBe('sheepcliff-save');
    const r = restore(text);
    expect(r.savedAt).toBe(1_700_000_000_000);
    expect(hashState(r.sim)).toBe(hashState(sim));
    expect(r.sim.clock.tick).toBe(37);
  });

  it("accepts the sim's bare document, with no time to catch up", () => {
    const sim = createInitialState(3);
    const bare = JSON.stringify(JSON.parse(saveText(sim, 5)).save);
    const r = restore(bare);
    expect(r.savedAt).toBe(0);
    expect(hashState(r.sim)).toBe(hashState(sim));
  });

  it('refuses junk with a SaveError code', () => {
    expect(() => restore('not json')).toThrowError(SaveError);
    expect(() => restore('{"format":"sheepcliff-web-save","savedAt":1,"save":{"format":"x","version":3,"world":{}}}')).toThrowError(SaveError);
    try {
      restore('[]');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveError);
    }
  });
});

describe('catchUp', () => {
  it('runs the time away at actor resolution, capped at one sim-day', () => {
    const sim = advance(createInitialState(9), 10);
    expect(dayMs(sim)).toBe(180_000);
    const short = catchUp(sim, 30_000);
    expect(short.ranMs).toBe(30_000);
    expect(short.capped).toBe(false);
    expect(short.sim.clock.tick).toBe(10 + 300);
    expect(hashState(short.sim)).toBe(hashState(advance(sim, 300)));
    const long = catchUp(sim, 36 * 3600_000);
    expect(long.ranMs).toBe(180_000);
    expect(long.capped).toBe(true);
    expect(long.sim.clock.tick).toBe(10 + 1800);
    expect(long.sim.clock.dayCount).toBe(1);
  });

  it('treats a reload (under a second) as no absence', () => {
    const sim = createInitialState(9);
    for (const gap of [0, 500, -5, NaN]) {
      const c = catchUp(sim, gap);
      expect(c.sim).toBe(sim);
      expect(c.ranMs).toBe(0);
    }
  });
});

describe('awaySummary', () => {
  it('says how long, what changed, and the HUD line', () => {
    const before = advance(createInitialState(9), 10);
    const c = catchUp(before, 2 * 3600_000);
    const line = awaySummary(simView(null, before, 0, false), simView(null, c.sim, 0, false), c);
    expect(line).toMatch(/^while you were gone \(2 h 00 min, the farm ran one day of it\): /);
    expect(line).toMatch(/ · [☀☂❄☾] \d\d:\d\d  \d+ sheep  \d+ wool  \d+ coins  -?\d+°$/);
  });

  it('labels spans the way a person would say them', () => {
    expect(awayLabel(45_000)).toBe('45 s');
    expect(awayLabel(7 * 60_000)).toBe('7 min');
    expect(awayLabel(3 * 3600_000 + 5 * 60_000)).toBe('3 h 05 min');
    expect(awayLabel(50 * 3600_000)).toBe('2 d 2 h');
  });
});

import { describe, expect, it } from 'vitest';
import { advance, createInitialState, currentSeason, DEFAULT_REAL_EPOCH_MS, hashState, realDateAt, realMsOf, SaveError, type SimState } from '@sheepcliff/sim';
import { parseSceneParams } from './query';
import { awayLabel, ENVELOPE_FORMAT, restore, restoreForLoad, saveText } from './save';
import { addPage, EMPTY_PAGE_STORE, type StorybookPage } from './storybook';

/**
 * A v7 envelope: the shape the owner's live world is in today. Built by taking a current document
 * apart rather than by hand, so it is a real save minus exactly what v8 added — the two calendar
 * fields on `season` and on the Ledger snapshot's copy of it — and stamped v7.
 */
function v7Envelope(sim: SimState, savedAt: number): string {
  const doc = JSON.parse(saveText(sim, savedAt)) as {
    save: { version: number; world: { season: Record<string, unknown>; ledger: { season: Record<string, unknown> } } };
  };
  const strip = (season: Record<string, unknown>): Record<string, unknown> => {
    const { realEpochMs: _epoch, seed: _seed, ...rest } = season;
    return rest;
  };
  doc.save.version = 7;
  doc.save.world.season = strip(doc.save.world.season);
  doc.save.world.ledger.season = strip(doc.save.world.ledger.season);
  return JSON.stringify(doc);
}

const somePage: StorybookPage = {
  id: 'c0',
  title: 'a night',
  createdAt: 123,
  awayMs: 4000,
  fromMs: 0,
  toMs: 4000,
  worldDays: 40,
  lines: [{ entryId: 'c0', line: '3 wool banked', picture: 'wool' }],
  more: [{ entryId: 'c1', line: 'the weather turned rain', picture: 'weather-rain' }],
};

describe('save text', () => {
  it('round-trips the world, the wall clock, and the page store', () => {
    const sim = advance(createInitialState(9), 37);
    const pages = addPage(EMPTY_PAGE_STORE, somePage);
    const text = saveText(sim, 1_700_000_000_000, pages);
    const doc = JSON.parse(text) as { format: string; savedAt: number; save: { format: string; version: number } };
    expect(doc.format).toBe(ENVELOPE_FORMAT);
    expect(doc.savedAt).toBe(1_700_000_000_000);
    expect(doc.save.format).toBe('sheepcliff-save');
    const r = restore(text);
    expect(r.savedAt).toBe(1_700_000_000_000);
    expect(hashState(r.sim)).toBe(hashState(sim));
    expect(r.sim.clock.tick).toBe(37);
    expect(r.pages).toEqual(pages);
  });

  it("accepts the sim's bare document, with no time to catch up and an empty page store", () => {
    const sim = createInitialState(3);
    const bare = JSON.stringify(JSON.parse(saveText(sim, 5)).save);
    const r = restore(bare);
    expect(r.savedAt).toBe(0);
    expect(hashState(r.sim)).toBe(hashState(sim));
    expect(r.pages).toEqual({});
  });

  it('accepts a pre-#42 envelope with no pages field: an empty page store, not a throw', () => {
    const sim = createInitialState(4);
    const doc = JSON.parse(saveText(sim, 9)) as { pages?: unknown };
    delete doc.pages;
    const r = restore(JSON.stringify(doc));
    expect(r.pages).toEqual({});
    expect(hashState(r.sim)).toBe(hashState(sim));
  });

  it('drops a malformed pages field rather than throwing', () => {
    const sim = createInitialState(4);
    const doc = JSON.parse(saveText(sim, 9)) as { pages?: unknown };
    doc.pages = 'not an object';
    const r = restore(JSON.stringify(doc));
    expect(r.pages).toEqual({});
  });

  describe('the real-year calendar epoch on load (#84)', () => {
    const DECEMBER_15 = 1_797_292_800_000; // 2026-12-15T00:00:00Z

    it('a v7 save loaded with a real time lands on that real date', () => {
      const text = v7Envelope(advance(createInitialState(5), 200), 1_700_000_000_000);
      const r = restore(text, { realNowMs: DECEMBER_15 });
      expect(r.sim.version).toBe(8);
      // The world's own real date is the time the host passed: the migration anchors the epoch so
      // that `realEpochMs + elapsedMs` comes out at exactly `realNowMs` on this first load.
      expect(realMsOf(r.sim.season)).toBe(DECEMBER_15);
      expect(realDateAt(realMsOf(r.sim.season))).toEqual({ year: 2026, month: 12, day: 15 });
      expect(r.sim.season.seed).toBe(5);
      // The Ledger snapshot is the same world at an earlier moment, so it shares the epoch rather
      // than getting one of its own.
      expect(r.sim.ledger.season.realEpochMs).toBe(r.sim.season.realEpochMs);
      // Deterministic from here: the same document loaded again at the same instant is the same
      // world, and the calendar is a function of the stored epoch, not of when it is asked.
      expect(hashState(restore(text, { realNowMs: DECEMBER_15 }).sim)).toBe(hashState(r.sim));
    });

    it('a v7 save loaded with no real time falls back to the sim’s own default epoch', () => {
      // The pinned path (a scratch or QA world): reproducible whatever the real day.
      const text = v7Envelope(createInitialState(6), 1);
      const r = restore(text);
      expect(r.sim.season.realEpochMs).toBe(DEFAULT_REAL_EPOCH_MS);
      expect(currentSeason(r.sim.season)).toBe('spring');
      expect(hashState(r.sim)).toBe(hashState(restore(text, { realNowMs: undefined }).sim));
    });

    it('a save that already carries its own epoch ignores the real time it is loaded at', () => {
      // Everything from v8 on. The calendar is the world's, set once when it was made.
      const sim = createInitialState(7, { realEpochMs: DECEMBER_15 });
      const text = saveText(sim, 2);
      const r = restore(text, { realNowMs: 0 });
      expect(r.sim.season.realEpochMs).toBe(DECEMBER_15);
      expect(hashState(r.sim)).toBe(hashState(sim));
    });
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

describe('restoreForLoad: the composition main.ts’s load path actually calls (#84 round 3, finding 3)', () => {
  // The Verifier found `apps/web/src/main.ts:278`'s `restore(text, { realNowMs: realNow() })` caught
  // by nothing — `restore`'s own pass-through is pinned above (M12), and `worldRealNowMs`'s rule is
  // pinned in query.test.ts, but the wiring between them inside main.ts was not. `restoreForLoad`
  // (save.ts) is that exact composition, pulled out of main.ts's DOM-bound `adopt` so it is this
  // file's to test. Dropping the options object it builds (mutation M14's shape) is what this proves.
  const DECEMBER_15 = 1_797_292_800_000; // 2026-12-15T00:00:00Z

  function spy(value = DECEMBER_15): { now: () => number; calls: number } {
    const s = { calls: 0, now: (): number => { s.calls++; return value; } };
    return s;
  }

  it('a real player’s v7 save lands on the wall-clock date main.ts hands it', () => {
    const text = v7Envelope(advance(createInitialState(5), 200), 1_700_000_000_000);
    const clock = spy();
    // Zone pinned to UTC (offset 0), as in query.test.ts, so the date below is the same on every box.
    const r = restoreForLoad(text, parseSceneParams(''), false, clock.now, () => 0);
    expect(clock.calls, 'a real player’s load reads the wall clock').toBe(1);
    expect(realMsOf(r.sim.season)).toBe(DECEMBER_15);
    expect(realDateAt(realMsOf(r.sim.season))).toEqual({ year: 2026, month: 12, day: 15 });
    // The same composition `restore(text, { realNowMs })` gives directly, so nothing about the
    // extraction changed the outcome — only where the wiring lives.
    expect(hashState(r.sim)).toBe(hashState(restore(text, { realNowMs: DECEMBER_15 }).sim));
  });

  it('a pinned or QA-driven load never reads the wall clock, and the save keeps its default epoch', () => {
    const text = v7Envelope(createInitialState(6), 1);
    const clock = spy();
    const pinned = restoreForLoad(text, parseSceneParams('?seed=9'), false, clock.now);
    const qa = restoreForLoad(text, parseSceneParams(''), true, clock.now);
    expect(clock.calls, 'a pinned or QA-driven load read the wall clock').toBe(0);
    expect(pinned.sim.season.realEpochMs).toBe(DEFAULT_REAL_EPOCH_MS);
    expect(currentSeason(pinned.sim.season)).toBe('spring');
    expect(hashState(qa.sim)).toBe(hashState(pinned.sim));
  });

  it('?realNow= on the URL wins even over a real player’s load', () => {
    const text = v7Envelope(createInitialState(8), 1);
    const clock = spy(999); // must not be read at all
    const r = restoreForLoad(text, parseSceneParams(`?realNow=${DECEMBER_15}`), false, clock.now);
    expect(clock.calls).toBe(0);
    expect(realMsOf(r.sim.season)).toBe(DECEMBER_15);
  });
});

describe('awayLabel', () => {
  it('labels spans the way a person would say them', () => {
    expect(awayLabel(45_000)).toBe('45 s');
    expect(awayLabel(7 * 60_000)).toBe('7 min');
    expect(awayLabel(3 * 3600_000 + 5 * 60_000)).toBe('3 h 05 min');
    expect(awayLabel(50 * 3600_000)).toBe('2 d 2 h');
  });
});

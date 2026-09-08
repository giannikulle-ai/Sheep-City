import { describe, expect, it } from 'vitest';
import { RULES, phaseOf, type ChronicleEntry } from '@sheepcliff/sim';
import {
  addPage,
  awayTitle,
  buildStorybookPage,
  EMPTY_PAGE_STORE,
  gapSpansNight,
  pagedEntryIds,
  pageId,
  pagesNewestFirst,
  parsePageStore,
  selectLines,
  simMinutesToMs,
  storybookGateMs,
  STORYBOOK_GATE_SIM_MINUTES,
  unseenEntries,
  type PageStore,
  type StorybookPage,
} from './storybook';

function entry(over: Partial<ChronicleEntry>): ChronicleEntry {
  return {
    id: 'c0',
    atMs: 0,
    district: 'farm',
    line: 'a thing happened',
    picture: 'wool',
    actors: [],
    source: 'ledger',
    notability: 0.5,
    first: false,
    facts: {},
    ...over,
  };
}

describe('simMinutesToMs / storybookGateMs', () => {
  it('converts sim-minutes against the world day length (24h = periodSec*1000)', () => {
    expect(simMinutesToMs(180, 1440)).toBe(180_000);
    expect(simMinutesToMs(180, 10)).toBeCloseTo(1250, 5);
    expect(storybookGateMs(180)).toBe(simMinutesToMs(180, STORYBOOK_GATE_SIM_MINUTES));
  });
});

describe('gapSpansNight', () => {
  const DAY = 86_400_000; // periodSec 86400: a world day exactly as long as a real day
  // The clock starts at t = RULES.clock.startT (mid-morning), not t = 0 (fix round 2 on #42, R2-2)
  // — `nowMs = 0` is already `startT` of the way into the day, so the first real crossing of each
  // phase boundary after `nowMs = 0` sits `(boundary - startT)` of a day in, not `boundary` itself.
  const START_T = RULES.clock.startT;
  const NIGHT_START = (RULES.clock.phases.night - START_T) * DAY;
  const DAWN = (RULES.clock.phases.dawn - START_T) * DAY;

  it('is false for a span that stays inside one day phase', () => {
    expect(gapSpansNight(0, 2 * 3600_000, 86400)).toBe(false); // 2h, well before dusk
  });

  it('is true for a span that overlaps the night window', () => {
    expect(gapSpansNight(NIGHT_START - 1_000_000, NIGHT_START + 5_000_000, 86400)).toBe(true);
  });

  it('is false right up to the night boundary, true from it', () => {
    expect(gapSpansNight(0, NIGHT_START, 86400)).toBe(false); // ends exactly at night's first instant
    expect(gapSpansNight(0, NIGHT_START + 1, 86400)).toBe(true);
    expect(gapSpansNight(DAWN, DAY, 86400)).toBe(false); // dawn to midnight: day/dusk only
  });

  it('is true for any span a full day or longer, regardless of alignment', () => {
    expect(gapSpansNight(0, DAY, 86400)).toBe(true);
    expect(gapSpansNight(1_000, DAY + 500, 86400)).toBe(true);
  });

  it('is true across a day boundary even when neither half alone would cross it', () => {
    // last 100ms of day 0 (day phase) into the first 100ms of day 1 (day phase) — no night in
    // between unless the window is wide enough to reach the *next* day's night, which it is not
    expect(gapSpansNight(DAY - 100, DAY + 100, 86400)).toBe(false);
    // but a window spanning from before day 0's night into day 1's own night is still caught
    expect(gapSpansNight(NIGHT_START - 1, DAY + NIGHT_START + 1, 86400)).toBe(true);
  });

  // Fix round 2 on #42, R2-2: `gapSpansNight` used to compute the night window as if the clock's
  // `t` were `nowMs / dayLenMs`, dropping `RULES.clock.startT` — the sim's own `phaseOf` disagreed
  // for 9 of every 24 hour-windows at a real-time (86400 s) day. This checks `gapSpansNight` against
  // `phaseOf` itself (the same function the clock's phase display uses), at both the shipped day
  // length (180 s) and the real-time day length `farm.json` names (86400 s), across every hour-long
  // window in a full day — not against a hand-derived constant that could encode the same mistake.
  describe('agrees with phaseOf across every hour-window of a day', () => {
    // The clock's own `t` at `nowMs`: `createClock` starts at `startT` and `advanceClock` only ever
    // adds `dtMs / periodSec / 1000` to it, so `t(nowMs) = frac(startT + nowMs / dayLenMs)` — the
    // same mapping `gapSpansNight` now has to invert. Sampled densely (every simulated second) so
    // the check is a real trace through `phaseOf`, not another copy of `gapSpansNight`'s own math.
    function tOf(nowMs: number, dayLenMs: number): number {
      const t = (START_T + nowMs / dayLenMs) % 1;
      return t < 0 ? t + 1 : t;
    }
    function windowTouchesNightByPhaseOf(fromMs: number, toMs: number, dayLenMs: number): boolean {
      const stepMs = 1000; // one simulated second: coarser than any phase window at either day length
      for (let m = fromMs; m < toMs; m += stepMs) {
        if (phaseOf(tOf(m, dayLenMs)) === 'night') return true;
      }
      return false;
    }

    for (const periodSec of [180, 86400]) {
      it(`periodSec ${periodSec}`, () => {
        const dayLenMs = periodSec * 1000;
        for (let h = 0; h < 24; h++) {
          const fromMs = h * 3600_000;
          const toMs = (h + 1) * 3600_000;
          const expected = windowTouchesNightByPhaseOf(fromMs, toMs, dayLenMs);
          expect(gapSpansNight(fromMs, toMs, periodSec), `hour ${h}`).toBe(expected);
        }
      });
    }
  });
});

describe('awayTitle', () => {
  // periodSec chosen so a real span of a few hours never brushes a night window on its own —
  // isolates the minute/hour/day wording from the night override, which gapSpansNight covers above.
  const NO_NIGHT_PERIOD_SEC = 1_000_000_000;

  it('under a minute, never "a minute" the gap does not support (fix round 2 on #42, R2-3)', () => {
    expect(awayTitle(0, 0, 0, 180)).toBe('a moment'); // clamped to the smallest word, never "zero"
    expect(awayTitle(5_000, 0, 5_000, 180)).toBe('a moment'); // 5 s
    expect(awayTitle(10_000, 0, 10_000, 180)).toBe('a moment'); // 10 s: the R2-3 reproduction
    expect(awayTitle(59_999, 0, 59_999, 180)).toBe('a moment'); // just short of a full minute
  });

  it('minutes from exactly one, under an hour, spelled out', () => {
    expect(awayTitle(60_000, 0, 60_000, 180)).toBe('a minute'); // exactly one full minute
    expect(awayTitle(6 * 60_000, 0, 6 * 60_000, 180)).toBe('six minutes');
    expect(awayTitle(59 * 60_000, 0, 59 * 60_000, 180)).toBe('59 minutes');
  });

  it('hours under a day, when the gap does not span the world night', () => {
    const ms = 2 * 3600_000;
    expect(awayTitle(ms, 0, ms, NO_NIGHT_PERIOD_SEC)).toBe('two hours');
    const ms23 = 23 * 3600_000; // just under a day: never rounds up to "a day"
    expect(awayTitle(ms23, 0, ms23, NO_NIGHT_PERIOD_SEC)).toBe('23 hours');
  });

  it('"a night" when the gap actually spans the world\'s own night, not any gap under a day', () => {
    const day = 86400; // periodSec: a world day as long as a real day
    const startT = RULES.clock.startT;
    const nightStart = (RULES.clock.phases.night - startT) * day * 1000;
    const from = nightStart - 1_000_000;
    const to = nightStart + 5_000_000;
    expect(gapSpansNight(from, to, day)).toBe(true);
    expect(awayTitle(to - from, from, to, day)).toBe('a night');
    // the same length of time, positioned entirely in daytime, is never called "a night"
    expect(awayTitle(to - from, 0, to - from, NO_NIGHT_PERIOD_SEC)).not.toBe('a night');
  });

  it('at the world\'s default (fast) day length, any hour-plus gap always spans a night', () => {
    // periodSec 180 (the default): a farm day is 3 minutes, so any real gap over an hour is
    // hundreds of farm days — always at least one night. Matches the real app's own behaviour.
    expect(awayTitle(2 * 3600_000, 0, 2 * 3600_000, 180)).toBe('a night');
  });

  it('23 hours reads "a night" only because it genuinely spans one (fix round 2 on #42, R2-4)', () => {
    // At the default (fast) day length a 23-hour gap really does cross hundreds of nights, so "a
    // night" is true here — unlike the 23-hour case above, which is pinned to NO_NIGHT_PERIOD_SEC
    // and reads "23 hours" instead. Both must hold: the word always has to match the actual span.
    const ms23 = 23 * 3600_000;
    expect(gapSpansNight(0, ms23, 180)).toBe(true);
    expect(awayTitle(ms23, 0, ms23, 180)).toBe('a night');
  });

  it('days, spelled out, and "a week" at exactly seven', () => {
    expect(awayTitle(2 * 24 * 3600_000, 0, 0, 180)).toBe('two days');
    expect(awayTitle(3 * 24 * 3600_000, 0, 0, 180)).toBe('three days');
    expect(awayTitle(6 * 24 * 3600_000, 0, 0, 180)).toBe('six days');
    expect(awayTitle(7 * 24 * 3600_000, 0, 0, 180)).toBe('a week');
    expect(awayTitle(9 * 24 * 3600_000, 0, 0, 180)).toBe('over a week');
    expect(awayTitle(20 * 24 * 3600_000, 0, 0, 180)).toBe('3 weeks');
  });

  it('never overstates a day count by rounding: 6.9 days is still "six days"', () => {
    expect(awayTitle(6.9 * 24 * 3600_000, 0, 0, 180)).toBe('six days');
  });

  it('clamps a non-finite or negative gap to the smallest true word', () => {
    expect(awayTitle(NaN, 0, 0, 180)).toBe('a moment');
    expect(awayTitle(-100, 0, 0, 180)).toBe('a moment');
  });
});

describe('selectLines', () => {
  it('takes at most `max`, in the order given (already most-notable-first)', () => {
    const entries = [entry({ id: 'a', notability: 0.9 }), entry({ id: 'b', notability: 0.5 }), entry({ id: 'c', notability: 0.1 })];
    expect(selectLines(entries, 2).map((e) => e.id)).toEqual(['a', 'b']);
    expect(selectLines(entries, 5).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(selectLines([])).toEqual([]);
  });

  it('leaves a mixed-source top five untouched', () => {
    const entries = [entry({ id: 'a', source: 'card', notability: 0.9 }), entry({ id: 'b', source: 'ledger', notability: 0.4 })];
    expect(selectLines(entries).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('swaps in a non-card line when the top five are all cards and one exists further down', () => {
    const entries = [
      entry({ id: 'a', source: 'card', notability: 0.95 }),
      entry({ id: 'b', source: 'card', notability: 0.8 }),
      entry({ id: 'c', source: 'card', notability: 0.6 }),
      entry({ id: 'd', source: 'ledger', notability: 0.3 }),
    ];
    const chosen = selectLines(entries, 3);
    expect(chosen.map((e) => e.id).sort()).toEqual(['a', 'b', 'd']);
    // the lowest-notability card ('c', 0.6) is the one swapped out, not 'a' or 'b'
    expect(chosen.some((e) => e.id === 'c')).toBe(false);
  });

  it('leaves an all-card selection alone when no non-card entry exists anywhere', () => {
    const entries = [entry({ id: 'a', source: 'card' }), entry({ id: 'b', source: 'card' })];
    expect(selectLines(entries).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('pageId', () => {
  it('is order-independent and stable for the same set of entry ids', () => {
    expect(pageId(['b', 'a'])).toBe(pageId(['a', 'b']));
    expect(pageId(['a'])).not.toBe(pageId(['a', 'b']));
  });
});

describe('buildStorybookPage', () => {
  it('builds a page from the selected lines, titled by the time away', () => {
    const entries = [entry({ id: 'c1', line: '3 wool banked', picture: 'wool', notability: 0.9 })];
    const page = buildStorybookPage(entries, 2 * 24 * 3600_000, 0, 1000, 5000, 180);
    expect(page).toEqual({
      id: pageId(['c1']),
      title: 'two days',
      createdAt: 5000,
      awayMs: 2 * 24 * 3600_000,
      fromMs: 0,
      toMs: 1000,
      lines: [{ entryId: 'c1', line: '3 wool banked', picture: 'wool' }],
    });
  });

  it('returns null for an empty range: no invented "nothing happened" line', () => {
    expect(buildStorybookPage([], 5000, 0, 1000, 5000, 180)).toBeNull();
  });
});

describe('pagedEntryIds / unseenEntries', () => {
  const page = (id: string, entryIds: string[]): StorybookPage => ({
    id,
    title: 'a night',
    createdAt: 0,
    awayMs: 1000,
    fromMs: 0,
    toMs: 1000,
    lines: entryIds.map((entryId) => ({ entryId, line: entryId, picture: 'wool' })),
  });

  it('collects every entry id told across every stored page', () => {
    const store: PageStore = { p1: page('p1', ['c0', 'c1']), p2: page('p2', ['c2']) };
    expect(pagedEntryIds(store)).toEqual(new Set(['c0', 'c1', 'c2']));
    expect(pagedEntryIds(EMPTY_PAGE_STORE)).toEqual(new Set());
  });

  it('filters out entries already told on a stored page (fix round 1, #42: F1)', () => {
    const store: PageStore = { p1: page('p1', ['c0', 'c1']) };
    const entries = [entry({ id: 'c0' }), entry({ id: 'c1' }), entry({ id: 'c8' })];
    expect(unseenEntries(entries, store).map((e) => e.id)).toEqual(['c8']);
  });

  it('is the identity when nothing has been shown yet', () => {
    const entries = [entry({ id: 'c0' }), entry({ id: 'c1' })];
    expect(unseenEntries(entries, EMPTY_PAGE_STORE)).toEqual(entries);
  });
});

describe('page store', () => {
  const page = (id: string, createdAt: number): StorybookPage => ({
    id,
    title: 'a night',
    createdAt,
    awayMs: 1000,
    fromMs: 0,
    toMs: 1000,
    lines: [{ entryId: 'c0', line: 'x', picture: 'wool' }],
  });

  it('never drops or overwrites a stored page', () => {
    let store = addPage(EMPTY_PAGE_STORE, page('p1', 10));
    store = addPage(store, page('p1', 999)); // same id, later attempt: ignored
    expect(store['p1']?.createdAt).toBe(10);
    store = addPage(store, page('p2', 20));
    expect(Object.keys(store).sort()).toEqual(['p1', 'p2']);
  });

  it('lists pages newest first', () => {
    const store = addPage(addPage(EMPTY_PAGE_STORE, page('old', 1)), page('new', 2));
    expect(pagesNewestFirst(store).map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('round-trips through parsePageStore', () => {
    const store = addPage(EMPTY_PAGE_STORE, page('p1', 10));
    const parsed = parsePageStore(JSON.parse(JSON.stringify(store)));
    expect(parsed).toEqual(store);
  });

  it('drops malformed entries rather than throwing', () => {
    expect(parsePageStore(null)).toEqual({});
    expect(parsePageStore('nope')).toEqual({});
    expect(parsePageStore({ bad: { id: 'bad' } })).toEqual({});
    expect(parsePageStore({ bad: 5, good: page('good', 1) })).toEqual({ good: page('good', 1) });
  });
});

import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '@sheepcliff/sim';
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
  const NIGHT_START = 0.52 * DAY; // RULES.clock.phases.night
  const DAWN = 0.92 * DAY; // RULES.clock.phases.dawn

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
});

describe('awayTitle', () => {
  // periodSec chosen so a real span of a few hours never brushes a night window on its own —
  // isolates the minute/hour/day wording from the night override, which gapSpansNight covers above.
  const NO_NIGHT_PERIOD_SEC = 1_000_000_000;

  it('minutes under an hour, spelled out', () => {
    expect(awayTitle(0, 0, 0, 180)).toBe('a minute'); // clamped to the smallest word, never "zero"
    expect(awayTitle(5_000, 0, 5_000, 180)).toBe('a minute');
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
    const nightStart = 0.52 * day * 1000;
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
    expect(awayTitle(NaN, 0, 0, 180)).toBe('a minute');
    expect(awayTitle(-100, 0, 0, 180)).toBe('a minute');
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

import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '@sheepcliff/sim';
import {
  addPage,
  awayTitle,
  buildStorybookPage,
  EMPTY_PAGE_STORE,
  pageId,
  pagesNewestFirst,
  parsePageStore,
  selectLines,
  simMinutesToMs,
  storybookGateMs,
  STORYBOOK_GATE_SIM_MINUTES,
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

describe('awayTitle', () => {
  it('says the time away in plain words, never units', () => {
    expect(awayTitle(0)).toBe('a night');
    expect(awayTitle(5_000)).toBe('a night');
    expect(awayTitle(20 * 3600_000)).toBe('a night');
    expect(awayTitle(2 * 24 * 3600_000)).toBe('two days');
    expect(awayTitle(3 * 24 * 3600_000)).toBe('three days');
    expect(awayTitle(6 * 24 * 3600_000)).toBe('six days');
    expect(awayTitle(7 * 24 * 3600_000)).toBe('a week');
    expect(awayTitle(9 * 24 * 3600_000)).toBe('over a week');
    expect(awayTitle(20 * 24 * 3600_000)).toBe('3 weeks');
    expect(awayTitle(NaN)).toBe('a night');
    expect(awayTitle(-100)).toBe('a night');
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
    const page = buildStorybookPage(entries, 2 * 24 * 3600_000, 0, 1000, 5000);
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
    expect(buildStorybookPage([], 5000, 0, 1000, 5000)).toBeNull();
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

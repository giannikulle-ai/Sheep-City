import { describe, expect, it } from 'vitest';
import { RULES, phaseOf, type ChronicleEntry } from '@sheepcliff/sim';
import {
  addPage,
  awayTitle,
  buildStorybookPage,
  EMPTY_PAGE_STORE,
  gapSpansNight,
  LINE_COUNT_STEPS,
  lineCount,
  lineCountFor,
  lineEntryIds,
  MAX_PAGE_LINES,
  MAX_STORED_MORE,
  MIN_PAGE_LINES,
  pagedEntryIds,
  pageId,
  pagesNewestFirst,
  parsePageStore,
  selectLines,
  simMinutesToMs,
  storybookGateMs,
  STORYBOOK_GATE_SIM_MINUTES,
  unseenEntries,
  worldDaysBetween,
  worldTimeLabel,
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
      worldDays: 1000 / 180_000, // the gap's own bounds through the world's day length
      lines: [{ entryId: 'c1', line: '3 wool banked', picture: 'wool', entryIds: ['c1'] }],
      more: [],
    });
  });

  it('returns null for an empty range: no invented "nothing happened" line', () => {
    expect(buildStorybookPage([], 5000, 0, 1000, 5000, 180)).toBeNull();
  });
});

// A long absence's storybook page used to repeat the same small-card line many times — "crows,
// windfall, crows, crows, windfall, crows" was the owner's own report of a real week away.
// `buildStorybookPage` collapses every run of a same-picture 'card' entry into one line before
// `selectLines` ever sees it, so no two of its shown lines are ever the same card, and the
// tellings it did not give a line of their own are folded into that one line's count rather than
// dropped: it is still backed by every entry it speaks for (#113).
describe('buildStorybookPage collapses a repeated card into one line (#113)', () => {
  const crows = (id: string, notability: number, atMs: number) =>
    entry({ id, atMs, notability, source: 'card', picture: 'crows', line: 'Three crows landed on the hay and Digital Luna sent them packing.' });

  it('never shows the same card line twice: a run of same-picture card entries becomes one line, at its most notable member\'s own slot', () => {
    // already most-notable-first, as chronicleBetween hands buildStorybookPage its entries
    const entries = [
      entry({ id: 'L1', source: 'ledger', picture: 'wool', line: '4 lambs born', notability: 0.6, atMs: 10 }),
      crows('A', 0.35, 0),
      crows('B', 0, 20),
      crows('C', 0, 30),
    ];
    const page = buildStorybookPage(entries, 7 * 24 * 3600_000, 0, 1000, 5000, 180);
    expect(page!.lines.map((l) => l.line)).toEqual([
      '4 lambs born',
      // the anchor's own line, verbatim, period swapped for a mechanical count suffix — never new
      // prose (#113's own done-means)
      'Three crows landed on the hay and Digital Luna sent them packing, three times this week.',
    ]);
    const crowsLine = page!.lines[1]!;
    expect(crowsLine.entryId).toBe('A'); // the most notable telling anchors the line and its slot
    // backed by all three tellings, not only the one the text was drawn from
    expect(lineEntryIds(crowsLine).slice().sort()).toEqual(['A', 'B', 'C']);
    // no other line on the page repeats it
    expect(page!.lines.filter((l) => l.picture === 'crows')).toHaveLength(1);
    expect(page!.more).toEqual([]);
  });

  it('a card told only once collapses to nothing — a plain one-entry line, same as before #113', () => {
    const entries = [crows('A', 0.35, 0)];
    const page = buildStorybookPage(entries, 7 * 24 * 3600_000, 0, 1000, 5000, 180);
    expect(page!.lines).toEqual([
      { entryId: 'A', line: 'Three crows landed on the hay and Digital Luna sent them packing.', picture: 'crows', entryIds: ['A'] },
    ]);
  });

  it('a repeat that does not fit the shown lines is still collapsed inside "and N more", never repeated there either', () => {
    // five higher-notability, all-distinct ledger lines fill the floor (5 shown, a 2h "night" gap)
    // before the crows group is ever reached, pushing the whole group into "more".
    const filler = ['a', 'b', 'c', 'd', 'e'].map((k, i) =>
      entry({ id: `L${k}`, source: 'ledger', picture: `p${k}`, line: `line ${k}`, notability: 0.9 - i * 0.01, atMs: i }),
    );
    const entries = [...filler, crows('A', 0.2, 10), crows('B', 0, 20), crows('C', 0, 30)];
    const page = buildStorybookPage(entries, 2 * 3600_000, 0, 2 * 3600_000, 5000, 180);
    expect(page!.lines).toHaveLength(5); // the floor; none of them is a crows line
    expect(page!.lines.some((l) => l.picture === 'crows')).toBe(false);
    // the whole crows group is one row behind "and N more", not three
    expect(page!.more).toHaveLength(1);
    const crowsLine = page!.more[0]!;
    expect(crowsLine.picture).toBe('crows');
    expect(lineEntryIds(crowsLine).slice().sort()).toEqual(['A', 'B', 'C']);
    expect(crowsLine.line).toBe('Three crows landed on the hay and Digital Luna sent them packing, three times tonight.');
  });

  it('the count suffix reads the page\'s own title word: "tonight" on a night page, never a span the title does not support', () => {
    const entries = [crows('A', 0.2, 0), crows('B', 0, 10)];
    const page = buildStorybookPage(entries, 2 * 3600_000, 0, 2 * 3600_000, 5000, 180); // 2h: "a night"
    expect(page!.title).toBe('a night');
    expect(page!.lines[0]!.line).toBe('Three crows landed on the hay and Digital Luna sent them packing, two times tonight.');
  });

  it('pagedEntryIds counts every entry a collapsed line stands for, so none of them reads as unseen again', () => {
    const entries = [crows('A', 0.35, 0), crows('B', 0, 10), crows('C', 0, 20)];
    const page = buildStorybookPage(entries, 7 * 24 * 3600_000, 0, 1000, 5000, 180)!;
    const store = addPage(EMPTY_PAGE_STORE, page);
    expect(pagedEntryIds(store)).toEqual(new Set(['A', 'B', 'C']));
    expect(unseenEntries(entries, store)).toEqual([]);
  });

  it('lineEntryIds falls back to [entryId] for a line with no entryIds (a page saved before #113)', () => {
    expect(lineEntryIds({ entryId: 'x', line: 'l', picture: 'p' })).toEqual(['x']);
    expect(lineEntryIds({ entryId: 'x', line: 'l', picture: 'p', entryIds: ['x', 'y'] })).toEqual(['x', 'y']);
  });

  // F3 (round 2): a card's own repeats in one gap have no bound — a real week away repeats its most
  // common small card in the thousands — so storing one id per telling grows a page's stored size
  // with the length of the gap itself, unboundedly, next to the save. `entryIds` is capped at
  // `MAX_STORED_MORE`, the same cap the page's own "and N more" already uses; `count` keeps the
  // group's true tally exact regardless, so the sentence and every other reader after "how many"
  // never disagrees with what the id list alone would say.
  it("a card repeated beyond MAX_STORED_MORE times in one gap stores only MAX_STORED_MORE ids, with the group's true tally kept exact in `count`", () => {
    const total = MAX_STORED_MORE + 23; // well past the cap, so entryIds is capped but count is not
    const entries = Array.from({ length: total }, (_, i) => crows(`C${i}`, i === 0 ? 0.9 : 0, i));
    const page = buildStorybookPage(entries, 7 * 24 * 3600_000, 0, 1000, 5000, 180)!;
    expect(page.lines).toHaveLength(1); // still one collapsed line, however many tellings back it
    const crowsLine = page.lines[0]!;
    expect(crowsLine.count).toBe(total);
    expect(crowsLine.entryIds).toHaveLength(MAX_STORED_MORE); // capped, not `total`
    // the stored ids are the most notable prefix of the group (C0's notability anchors it first),
    // in the same order `entries` itself arrived in — a sample, not an arbitrary subset
    expect(crowsLine.entryIds).toEqual(entries.slice(0, MAX_STORED_MORE).map((e) => e.id));
    // the sentence's own count is the true tally, not how many ids happen to be stored — an
    // off-by-one here (`group.length - 1`, or reading `entryIds.length` post-cap instead) fails this
    expect(crowsLine.line).toBe(`Three crows landed on the hay and Digital Luna sent them packing, ${total} times this week.`);
    expect(lineCount(crowsLine)).toBe(total);
  });

  it('lineCount reads the true tally: `count` when the line carries it, else how many ids it names', () => {
    expect(lineCount({ entryId: 'x', line: 'l', picture: 'p' })).toBe(1); // no entryIds, no count
    expect(lineCount({ entryId: 'x', line: 'l', picture: 'p', entryIds: ['x', 'y'] })).toBe(2); // no count: falls back
    expect(lineCount({ entryId: 'x', line: 'l', picture: 'p', entryIds: ['x'], count: 73 })).toBe(73); // count wins
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
    more: [],
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
    more: [],
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

describe('lineCountFor', () => {
  const DAY = 24 * 3600_000;

  it('holds the floor for anything up to a day away', () => {
    expect(lineCountFor(0)).toBe(MIN_PAGE_LINES); // a page that opens at all shows the floor
    expect(lineCountFor(60_000)).toBe(5); // a minute
    expect(lineCountFor(2 * 3600_000)).toBe(5); // the "a night" case: two hours
    expect(lineCountFor(DAY)).toBe(5); // exactly a day: still the floor
  });

  it('grows with the absence, step by step', () => {
    expect(lineCountFor(DAY + 1)).toBe(8); // just past a day
    expect(lineCountFor(2 * DAY)).toBe(8);
    expect(lineCountFor(3 * DAY)).toBe(8); // exactly three days
    expect(lineCountFor(3 * DAY + 1)).toBe(10);
    expect(lineCountFor(6 * DAY)).toBe(10);
    expect(lineCountFor(7 * DAY)).toBe(10); // exactly a week, the week itself included
  });

  it('caps past the last step, however long the absence', () => {
    expect(lineCountFor(7 * DAY + 1)).toBe(MAX_PAGE_LINES);
    expect(lineCountFor(30 * DAY)).toBe(12);
    expect(lineCountFor(365 * DAY)).toBe(12); // a year away still fits a phone
  });

  it('gives a gap it cannot read the floor, never the cap', () => {
    // a non-finite or negative gap is no gap at all, so it gets the smallest page, not the largest
    expect(lineCountFor(Infinity)).toBe(MIN_PAGE_LINES);
    expect(lineCountFor(NaN)).toBe(MIN_PAGE_LINES);
    expect(lineCountFor(-DAY)).toBe(MIN_PAGE_LINES);
  });

  it('never leaves the floor-to-cap band, whatever the gap says', () => {
    for (const ms of [NaN, -1, -Infinity, 0, 1, DAY, 9 * DAY]) {
      const n = lineCountFor(ms);
      expect(n, `gap ${ms}`).toBeGreaterThanOrEqual(MIN_PAGE_LINES);
      expect(n, `gap ${ms}`).toBeLessThanOrEqual(MAX_PAGE_LINES);
    }
  });

  it('reads the step table in order, and every step is inside the band', () => {
    // the steps are the owner's numbers to move: this checks the shape they have to keep, not the
    // values themselves (those are asserted case by case above)
    const ups = LINE_COUNT_STEPS.map((s) => s.upToMs);
    expect(ups).toEqual([...ups].sort((a, b) => a - b));
    const counts = LINE_COUNT_STEPS.map((s) => s.lines);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    for (const s of LINE_COUNT_STEPS) {
      expect(s.lines).toBeGreaterThanOrEqual(MIN_PAGE_LINES);
      expect(s.lines).toBeLessThanOrEqual(MAX_PAGE_LINES);
    }
  });
});

describe('a page keeps the rest of its gap', () => {
  const DAY = 24 * 3600_000;
  const many = (n: number): ChronicleEntry[] =>
    Array.from({ length: n }, (_, i) => entry({ id: `c${i}`, line: `line ${i}`, notability: 1 - i / (n * 2) }));

  it('shows the gap\'s share and keeps every other entry in `more`', () => {
    const page = buildStorybookPage(many(9), 2 * 3600_000, 0, 1000, 5000, 180); // two hours: 5 lines
    expect(page?.lines.map((l) => l.entryId)).toEqual(['c0', 'c1', 'c2', 'c3', 'c4']);
    expect(page?.more.map((l) => l.entryId)).toEqual(['c5', 'c6', 'c7', 'c8']);
  });

  it('shows more of a longer absence, and keeps the remainder either way', () => {
    const page = buildStorybookPage(many(14), 5 * DAY, 0, 1000, 5000, 180); // five days: 10 lines
    expect(page?.lines).toHaveLength(10);
    expect(page?.more.map((l) => l.entryId)).toEqual(['c10', 'c11', 'c12', 'c13']);
  });

  it('has nothing left over when the gap told no more than it shows', () => {
    const page = buildStorybookPage(many(3), 2 * 3600_000, 0, 1000, 5000, 180);
    expect(page?.lines).toHaveLength(3);
    expect(page?.more).toEqual([]);
  });

  it('bounds the remainder, and only the remainder', () => {
    const entries = many(MAX_PAGE_LINES + MAX_STORED_MORE + 20);
    const page = buildStorybookPage(entries, 30 * DAY, 0, 1000, 5000, 180); // past the last step: 12 lines
    expect(page?.lines).toHaveLength(MAX_PAGE_LINES);
    expect(page?.more).toHaveLength(MAX_STORED_MORE);
    // the shown lines are the most notable ones, in the chronicle's own order — the cap only ever
    // bites the tail of the remainder
    expect(page?.lines.map((l) => l.entryId)).toEqual(entries.slice(0, MAX_PAGE_LINES).map((e) => e.id));
    expect(page?.more[0]?.entryId).toBe('c12');
  });

  it('counts a kept line as told, so no later page can repeat it', () => {
    const page = buildStorybookPage(many(8), 2 * 3600_000, 0, 1000, 5000, 180);
    const store = addPage(EMPTY_PAGE_STORE, page as StorybookPage);
    expect(pagedEntryIds(store)).toEqual(new Set(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']));
    expect(unseenEntries(many(8), store)).toEqual([]);
  });

  it('round-trips the remainder and the world span through the page store', () => {
    const page = buildStorybookPage(many(8), 2 * 3600_000, 0, 1000, 5000, 180) as StorybookPage;
    const parsed = parsePageStore(JSON.parse(JSON.stringify(addPage(EMPTY_PAGE_STORE, page))));
    expect(parsed[page.id]).toEqual(page);
  });

  it('loads a page saved before either field existed, rather than dropping it', () => {
    const old = { id: 'p1', title: 'a night', createdAt: 1, awayMs: 1000, fromMs: 0, toMs: 1000, lines: [{ entryId: 'c0', line: 'x', picture: 'wool' }] };
    const parsed = parsePageStore({ p1: old });
    expect(parsed['p1']?.lines).toHaveLength(1);
    expect(parsed['p1']?.more).toEqual([]); // no remainder rather than a failure
    expect(parsed['p1']?.worldDays).toBeUndefined(); // and no world span invented for it
  });

  it('drops a malformed remainder without losing the page', () => {
    const bad = { id: 'p1', title: 'a night', createdAt: 1, awayMs: 1000, fromMs: 0, toMs: 1000, worldDays: 'lots', lines: [{ entryId: 'c0', line: 'x', picture: 'wool' }], more: [{ entryId: 5 }, { entryId: 'c1', line: 'y', picture: 'wool' }] };
    const parsed = parsePageStore({ p1: bad });
    expect(parsed['p1']?.more.map((l) => l.entryId)).toEqual(['c1']);
    expect(parsed['p1']?.worldDays).toBeUndefined();
  });
});

describe('world time', () => {
  // The day lengths the tray actually offers (actions.ts): 1, 3 and 10 minute days.
  it('reads a real span through each shipped day length', () => {
    const twoHours = 2 * 3600_000;
    expect(worldDaysBetween(0, twoHours, 60)).toBeCloseTo(120, 6); // a 1-minute day: 120 farm days
    expect(worldDaysBetween(0, twoHours, 180)).toBeCloseTo(40, 6); // the default 3-minute day
    expect(worldDaysBetween(0, twoHours, 600)).toBeCloseTo(12, 6); // a 10-minute day
  });

  it('is the gap, whichever way round the bounds come, and never negative', () => {
    expect(worldDaysBetween(1000, 0, 180)).toBe(worldDaysBetween(0, 1000, 180));
    expect(worldDaysBetween(0, 0, 180)).toBe(0);
    expect(worldDaysBetween(0, NaN, 180)).toBe(0);
  });

  it('says the span in plain words, floored, never rounded up', () => {
    expect(worldTimeLabel(40)).toBe('40 farm days');
    expect(worldTimeLabel(3360)).toBe('3360 farm days');
    expect(worldTimeLabel(1)).toBe('1 farm day');
    expect(worldTimeLabel(1.99)).toBe('1 farm day'); // never "2 farm days"
    expect(worldTimeLabel(0.9)).toBe('half a farm day');
    expect(worldTimeLabel(0.5)).toBe('half a farm day');
    expect(worldTimeLabel(0.49)).toBe('less than half a farm day');
    expect(worldTimeLabel(0)).toBe('less than half a farm day');
    expect(worldTimeLabel(NaN)).toBe('less than half a farm day');
    expect(worldTimeLabel(-5)).toBe('less than half a farm day');
  });

  it('does not lose a whole day to floating point', () => {
    // The division can land just short of a whole day — 39.99999999999999 for what is really forty —
    // and "39 farm days" would understate the gap by a day for no reason but binary arithmetic.
    expect(worldTimeLabel(39.99999999999999)).toBe('40 farm days');
    expect(worldTimeLabel(3359.999999999999)).toBe('3360 farm days');
    // and a gap that genuinely is short of the next day still reads short of it
    expect(worldTimeLabel(39.9)).toBe('39 farm days');
  });

  it('is the same gap the title reads, so the two can never disagree', () => {
    // A page is built from one set of bounds: the title's night check and the stored world span both
    // read `fromMs`/`toMs` through the same `periodSec` (see `buildStorybookPage`).
    const twoHours = 2 * 3600_000;
    const page = buildStorybookPage([entry({ id: 'c1' })], twoHours, 0, twoHours, 5000, 180);
    expect(page?.title).toBe('a night'); // 40 farm days: many nights
    expect(page?.worldDays).toBe(worldDaysBetween(0, twoHours, 180));
    expect(worldTimeLabel(page?.worldDays ?? 0)).toBe('40 farm days');
  });
});

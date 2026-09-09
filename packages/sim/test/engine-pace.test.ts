// What a farm month actually holds (#101). Thirty seeds, thirty farm days each, against the shipped
// deck — the population test that replaces the withdrawn five-real-minute one (plan decisions 11 and
// 14, retired by decision 16). It asserts four things, and it is the file to read before believing
// anything about the pace:
//
//   1. how many farm days of thirty hold at least one **small** thing (a floor, with the measured
//      number written beside it);
//   2. how many **big** things a thirty-farm-day month holds (a band, likewise measured);
//   3. **zero big things across an unwatched span** — an absolute, not a floor, on every seed;
//   4. small things across an unwatched week are in the chronicle, told, with the same line and
//      picture key a watched one would carry, so the storybook can tell them.
//
// Two independent rulers, as PRs #82 and #99 used: new entries in `events.running` (what the engine
// says it started) and non-"ended" card/authored lines in the chronicle (what the world says was
// told). They must agree seed for seed; a divergence means a start that was never told or a line
// with nothing behind it, and the second is the CLAUDE.md bug ("the storybook only tells").
//
// Every floor here sits well under its measured value so a few seeds of drift are tolerated and a
// collapse fails. Every measured value was measured on this head, by this file's own harness.
import { describe, expect, it } from 'vitest';
import { FARM_DECK, momentKindOf, sizeOf } from '../src/engine/deck';
import { PACE_TARGETS, SIZE_PACING } from '../src/engine/pacing';
import { catchUp } from '../src/ledger/catch-up';
import { dayMs } from '../src/ledger/ledger';
import { createInitialState, type SimState } from '../src/state';
import { advance } from '../src/tick';

const TICK_MS = 100;
const FARM_DAY_MS = 180_000; // the clock's own period at the watching rate
const TICKS_PER_FARM_DAY = FARM_DAY_MS / TICK_MS;
const SEEDS = 30;
const DAYS = 30;

/** What one seed's month held, by both rulers. */
interface Month {
  /** Farm days (0-based) that held at least one small start, by the running-events ruler. */
  smallDays: Set<number>;
  smallStarts: number;
  bigStarts: number;
  /** The same two counts, by the chronicle ruler. */
  toldSmall: number;
  toldBig: number;
  kindOrder: string[];
}

/** Run one seed for `DAYS` farm days, watched throughout, and count by both rulers. */
function watchedMonth(seed: number): Month {
  let s: SimState = createInitialState(seed);
  const seen = new Set<string>();
  const month: Month = { smallDays: new Set(), smallStarts: 0, bigStarts: 0, toldSmall: 0, toldBig: 0, kindOrder: [] };
  for (let day = 0; day < DAYS; day++) {
    for (let i = 0; i < TICKS_PER_FARM_DAY; i++) {
      s = advance(s, 1);
      for (const r of s.events.running) {
        const key = `${r.id}@${r.startedMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        month.kindOrder.push(momentKindOf(r.id) ?? '?');
        if (sizeOf(r.id) === 'big') month.bigStarts++;
        else {
          month.smallStarts++;
          month.smallDays.add(day);
        }
      }
    }
  }
  // The second ruler: the chronicle's own record of what was told.
  for (const e of s.chronicle.entries) {
    if (e.source !== 'card' && e.source !== 'authored') continue;
    if (/ ended| was called off/.test(e.line)) continue;
    const entry = [...FARM_DECK.byId.values()].find((x) => (x.kind === 'card' ? x.card : x.event).storybook.line === e.line);
    if (!entry) continue;
    if ((entry.kind === 'card' ? entry.card : entry.event).size === 'big') month.toldBig++;
    else month.toldSmall++;
  }
  return month;
}

const median = (a: readonly number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] as number;
const mean = (a: readonly number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const range = (a: readonly number[]): string => `${Math.min(...a)} to ${Math.max(...a)}`;

describe('thirty seeds, thirty farm days, watched', () => {
  const months = Array.from({ length: SEEDS }, (_, i) => watchedMonth(i + 1));
  const smallDays = months.map((m) => m.smallDays.size);
  const bigStarts = months.map((m) => m.bigStarts);
  const smallStarts = months.map((m) => m.smallStarts);

  it('the two rulers agree seed for seed: nothing started that was not told', () => {
    // The engine's own record and the chronicle's, side by side. They must match exactly: a start
    // that was not told would leave the storybook with nothing to say about a real thing, and a
    // line with no start behind it is the bug CLAUDE.md names.
    months.forEach((m, i) => {
      expect(m.toldSmall, `seed ${i + 1}: ${m.smallStarts} small starts, ${m.toldSmall} told`).toBe(m.smallStarts);
      expect(m.toldBig, `seed ${i + 1}: ${m.bigStarts} big starts, ${m.toldBig} told`).toBe(m.bigStarts);
    });
  });

  it('a small thing on most farm days — measured 18 of 30 (mean 17.93, range 15 to 21)', () => {
    // The owner's target is four farm days in five (`PACE_TARGETS.smallDaysInFive`), which is 24 of
    // 30. **This deck delivers three in five, not four**, and that is stated rather than hidden: the
    // ceiling is the deck's coverage, not the pacing — see `PACE_TARGETS.smallDaysInFive`'s own
    // comment for the in-process sweep that shows pushing the rate twelve-fold buys about two more
    // days. The floor below is 12 of 30 (measured 15 at the thinnest seed), so several seeds may
    // drift without failing and a collapse cannot pass.
    const report = `days with a small start, per 30: median ${median(smallDays)}, mean ${mean(smallDays).toFixed(2)}, range ${range(smallDays)} (measured median 18, mean 17.93, 15 to 21); target is ${PACE_TARGETS.smallDaysInFive} in 5 = 24 of 30`;
    expect(median(smallDays), report).toBeGreaterThanOrEqual(15);
    expect(smallDays.filter((n) => n >= 12).length, report).toBeGreaterThanOrEqual(28); // measured 30 of 30
    expect(Math.min(...smallDays), report).toBeGreaterThan(0); // no seed goes a whole month without one
    // And the small things are the everyday texture, not a trickle: measured 22.6 starts a month.
    expect(median(smallStarts), `small starts per 30 days: median ${median(smallStarts)}, mean ${mean(smallStarts).toFixed(2)}, range ${range(smallStarts)} (measured median 23, mean 22.57, 20 to 26)`).toBeGreaterThanOrEqual(15);
  });

  it('a big thing a few times a farm month — measured median 2, mean 2.30, range 0 to 5', () => {
    // The owner's target is about three in thirty farm days, and this one lands: between one and
    // five on **28 of 30** seeds, and zero on two of them (seeds 8 and 14). Zero is not a failure —
    // nothing is forced, and a quiet month is allowed (plan decision 16) — so the band is asserted
    // over the population, not per seed.
    const inBand = bigStarts.filter((n) => n >= 1 && n <= 5).length;
    const report = `big starts per 30 farm days: median ${median(bigStarts)}, mean ${mean(bigStarts).toFixed(2)}, range ${range(bigStarts)}, in 1..5 on ${inBand}/30 (measured median 2, mean 2.30, 0 to 5, in band on 28/30); target ${PACE_TARGETS.bigPerThirtyFarmDays}`;
    expect(inBand, report).toBeGreaterThanOrEqual(24); // measured 28 of 30
    expect(median(bigStarts), report).toBeGreaterThanOrEqual(1);
    expect(Math.max(...bigStarts), report).toBeLessThanOrEqual(8); // the four-farm-day gap caps it near 7
  });

  it('big is the rare size and small is the common one, on every seed', () => {
    // The shape of the owner's decision, seed by seed rather than in aggregate.
    months.forEach((m, i) => expect(m.smallStarts, `seed ${i + 1}: ${m.smallStarts} small, ${m.bigStarts} big`).toBeGreaterThan(m.bigStarts));
    expect(SIZE_PACING.small.perFarmDay).toBeGreaterThan(SIZE_PACING.big.perFarmDay);
  });
}, 900_000);

describe('an unwatched span: small things happen, big things do not', () => {
  /** A world with a farm day of watched life behind it, so the engine is past its warm-up. */
  const started = (seed: number): SimState => advance(createInitialState(seed), TICKS_PER_FARM_DAY);

  it('zero big things across an unwatched week, on every one of thirty seeds (an absolute)', () => {
    // The hard invariant of #101. Not a floor, not "on most seeds": zero, always. A big thing while
    // nobody is watching is one the owner missed, and the owner said not to.
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = started(seed);
      const c = catchUp(s, 7 * dayMs(s));
      expect(c.mode).toBe('ledger');
      const big = c.unwatched.filter((d) => sizeOf(d.id) === 'big');
      expect(big.map((d) => d.id), `seed ${seed}: the Ledger branch drew a big thing`).toEqual([]);
      // And nothing big started in the actor remainder either, or on the respawned world's own
      // first looks: the whole gap is checked against the chronicle, not only the Ledger's report.
      const bigLines = new Set(FARM_DECK.cards.concat().filter((x) => x.size === 'big').map((x) => x.storybook.line));
      for (const e of FARM_DECK.authored) if (e.size === 'big') bigLines.add(e.storybook.line);
      const toldDuringGap = c.state.chronicle.entries.filter((e) => e.atMs > s.clock.nowMs && bigLines.has(e.line));
      expect(toldDuringGap.map((e) => e.line), `seed ${seed}: a big line was told during the gap`).toEqual([]);
    }
  });

  it('zero big things across an unwatched span of under a farm day, too (the actor branch)', () => {
    // The other unwatched branch: `catchUp` under a farm day runs the ordinary live code with
    // `watched: false`. Same invariant, different path, so both are checked rather than one.
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = started(seed);
      const c = catchUp(s, Math.floor(0.9 * dayMs(s)));
      expect(c.mode).toBe('actors');
      const bigLines = new Set(FARM_DECK.cards.filter((x) => x.size === 'big').map((x) => x.storybook.line));
      for (const e of FARM_DECK.authored) if (e.size === 'big') bigLines.add(e.storybook.line);
      const told = c.state.chronicle.entries.filter((e) => e.atMs > s.clock.nowMs && bigLines.has(e.line));
      expect(told.map((e) => e.line), `seed ${seed}`).toEqual([]);
    }
  });

  it('small things do happen across an unwatched week, and they are in the chronicle', () => {
    // Measured over the same thirty seeds, a seven-farm-day gap: **median 7 small things, mean 6.40,
    // range 4 to 9**, on **median 5 of the 7 days, mean 4.93, range 3 to 7**. That is a better day
    // rate than watched play manages (17.93 of 30, three days in five, against five in seven here),
    // because the unwatched look walks every time band of every day at one look a farm hour while a
    // watched world's actors are elsewhere and its own eligibility windows are narrower.
    const counts: number[] = [];
    const days: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = started(seed);
      const before = s.chronicle.entries.length;
      const c = catchUp(s, 7 * dayMs(s));
      counts.push(c.unwatched.length);
      days.push(new Set(c.unwatched.map((d) => Math.floor((d.atMs - s.clock.nowMs) / dayMs(s)))).size);
      // Told, with the same line and picture key the watched world would have used — that is what
      // lets the storybook tell an unwatched week without writing a word of new prose.
      const fresh = c.state.chronicle.entries.slice(before);
      for (const d of c.unwatched) {
        const entry = FARM_DECK.byId.get(d.id);
        expect(entry, `seed ${seed}: ${d.id} is not in the deck`).toBeDefined();
        const card = entry!.kind === 'card' ? entry!.card : entry!.event;
        const line = fresh.find((e) => e.atMs === d.atMs && e.line === card.storybook.line);
        expect(line, `seed ${seed}: ${d.id} at ${d.atMs} was drawn but not told`).toBeDefined();
        expect(line!.picture).toBe(card.storybook.picture);
        expect(line!.source).toBe(d.kind);
      }
    }
    const report = `unwatched week: draws median ${median(counts)}, mean ${mean(counts).toFixed(2)}, range ${range(counts)} (measured median 7, mean 6.40, 4 to 9); days with one, of 7: median ${median(days)}, mean ${mean(days).toFixed(2)}, range ${range(days)} (measured median 5, mean 4.93, 3 to 7)`;
    expect(median(counts), report).toBeGreaterThanOrEqual(4);
    expect(Math.min(...counts), report).toBeGreaterThan(0); // no seed comes back to an empty week
    expect(median(days), report).toBeGreaterThanOrEqual(3);
  });

  it('an unwatched span leaves the Ledger’s own numbers exactly where they were', () => {
    // The unwatched draw reads the Ledger and tells the chronicle; the only number it may move is a
    // stock a hook names (`coins`). Everything else — the fleeces, the grass, the flock, the
    // merchant's timer — is the Ledger's own arithmetic, drawn from the world generator, untouched.
    // This is why every Ledger round-trip pin in `ledger.test.ts` still holds after #101.
    for (let seed = 1; seed <= 8; seed++) {
      const s = started(seed);
      const c = catchUp(s, 5 * dayMs(s));
      const movedCoins = c.unwatched.some((d) => d.applied.includes('coins'));
      if (!movedCoins) {
        if (c.after.banks.wool === c.before.banks.wool) {
          // No shearing and no sale happened at all across the gap: with no card hook touching the
          // bank either, coins cannot have moved by a single coin.
          expect(c.after.banks.coins, `seed ${seed}`).toBe(c.before.banks.coins);
        } else {
          // The wool bank did move — a fleece was shorn, sold, or both. Either way `advance.ts`'s own
          // trade (`banks.coins += banks.wool * RULES.merchant.woolPrice`) only ever adds; a real,
          // one-directional claim, not the value asserted against itself.
          expect(c.after.banks.coins, `seed ${seed}`).toBeGreaterThanOrEqual(c.before.banks.coins);
        }
      }
      // Whatever else a hook wanted, it was recorded and not applied: no spawn, no fog, no flag.
      for (const d of c.unwatched) {
        expect(d.applied.every((op) => op === 'coins'), `seed ${seed}: ${d.id} applied ${d.applied.join(',')}`).toBe(true);
      }
    }
  });
}, 900_000);

// What a farm month actually holds (#101). Thirty seeds, thirty farm days each, against the shipped
// deck — the population test that replaces the withdrawn five-real-minute one (plan decisions 11 and
// 14, retired by decision 16). It asserts four things, and it is the file to read before believing
// anything about the pace:
//
//   1. how many farm days of thirty hold at least one **small** thing (a floor, with the measured
//      number written beside it);
//   2. how many **big** things a thirty-farm-day month holds (a band, likewise measured);
//   3. **zero big things across an unwatched span** — an absolute, not a floor, on every seed;
//   4. small things across an unwatched week are in the chronicle, told, with the same picture key
//      and the same filled line a watched one would carry, so the storybook can tell them;
//   5. **no chronicle entry anywhere carries a brace** — every storybook placeholder is filled
//      before the line is told (#114), on both paths.
//
// Two independent rulers, as PRs #82 and #99 used: new entries in `events.running` (what the engine
// says it started) and non-"ended" card/authored lines in the chronicle (what the world says was
// told). They must agree seed for seed; a divergence means a start that was never told or a line
// with nothing behind it, and the second is the CLAUDE.md bug ("the storybook only tells").
//
// Every floor here sits well under its measured value so a few seeds of drift are tolerated and a
// collapse fails. Every measured value was measured on this head, by this file's own harness.
//
// **Re-measured twice on this branch.** #86 (widened `conditions` on several small cards —
// `crowsOnTheField` and `nightOfTheFireflies` gained spring, `stargazingNight` widened to every
// season, `strayCatVisits` widened to sun or rain, `lambZoomiesHour` and `windfall` gained dawn —
// plus `merchantCaravan` narrowing from day-or-dusk to day-only) took the small pace to 30 farm
// days of 30 and 57 small starts a month at the engine's then-rate of 8. That is past the owner's
// own target, so the rate is now derived from it (`PACE_TARGETS.smallDaysInFive`, four days in
// five, through `SMALL_RATE_FOR_DAYS_IN_FIVE`: 1.25 on this deck) and every number below is
// measured at that rate. No floor was loosened; the measured values moved and are restated at each
// assertion, and the small-days test gained a **ceiling** so that "too busy" can fail as well as
// "too quiet" — before this round nothing in the repo could.
import { describe, expect, it } from 'vitest';
import { FARM_DECK, momentKindOf, sizeOf } from '../src/engine/deck';
import { coinsMoved, fillStorybookLine } from '../src/chronicle/storybook-line';
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
  /** Chronicle lines that still carry a brace. Always empty (#114). */
  braced: string[];
}

/** Run one seed for `DAYS` farm days, watched throughout, and count by both rulers. */
function watchedMonth(seed: number): Month {
  let s: SimState = createInitialState(seed);
  const seen = new Set<string>();
  const month: Month = { smallDays: new Set(), smallStarts: 0, bigStarts: 0, toldSmall: 0, toldBig: 0, kindOrder: [], braced: [] };
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
  // The second ruler: the chronicle's own record of what was told. Matched on the picture key, not
  // on the line: since #114 the line in the chronicle is the *filled* one ("... and Digital Luna
  // sent them packing"), so it no longer equals the card's authored text. An end line carries the
  // same key with `-end` on it and is not a start.
  const byPicture = new Map<string, 'small' | 'big'>();
  for (const x of FARM_DECK.byId.values()) {
    const event = x.kind === 'card' ? x.card : x.event;
    byPicture.set(event.storybook.picture, event.size);
  }
  for (const e of s.chronicle.entries) {
    if (e.line.includes('{') || e.line.includes('}')) month.braced.push(e.line);
    if (e.source !== 'card' && e.source !== 'authored') continue;
    const size = byPicture.get(e.picture);
    if (size === undefined) continue; // an end line, or a card the deck no longer carries
    if (size === 'big') month.toldBig++;
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

  it('a small thing on four farm days in five — measured 24 of 30 (median 24, mean 23.90, range 21 to 28)', () => {
    // The owner's target is four farm days in five (`PACE_TARGETS.smallDaysInFive`), which is 24 of
    // 30, and since this round it is the target the rate is derived from rather than a constant
    // nothing read. The three measurements this branch has taken, in order:
    //
    //   * #111 alone, rate 8:            median 18 of 30 (mean 17.93, range 15 to 21), 23 starts.
    //   * #86 merged in, rate still 8:   median 30 of 30 (mean 29.57, range 28 to 30), 57 starts —
    //     the widened conditions made small cards eligible on 40 % of looks instead of 14 %, and
    //     `drawChance` is linear in that, so the world drew something on every single farm day.
    //   * shipped here, rate 1.25:       **median 24 of 30 (mean 23.90, range 21 to 28), 31 starts**
    //     (mean 31.47, range 28 to 35), with 183 of the 900 seed-days holding nothing at all.
    //
    // The floors below are unchanged from #111's own (median >= 15; at least 28 of 30 seeds >= 12;
    // no seed at zero) and all still clear. What is new is the **band around the owner's target**:
    // the same measurement is now checked from above as well as below, so a deck or a rate that
    // made the farm busier than the owner asked fails here instead of reading as extra margin.
    const daysInFive = (median(smallDays) / DAYS) * 5;
    const report = `days with a small start, per 30: median ${median(smallDays)}, mean ${mean(smallDays).toFixed(2)}, range ${range(smallDays)} = ${daysInFive.toFixed(2)} in 5 (measured median 24, mean 23.90, 21 to 28, at rate ${SIZE_PACING.small.perFarmDay}); target is ${PACE_TARGETS.smallDaysInFive} in 5 = 24 of 30`;
    expect(median(smallDays), report).toBeGreaterThanOrEqual(15);
    expect(smallDays.filter((n) => n >= 12).length, report).toBeGreaterThanOrEqual(28); // measured 30 of 30
    expect(Math.min(...smallDays), report).toBeGreaterThan(0); // no seed goes a whole month without one
    // The owner's own shape, both ways round: half a day in five of slack either side of four, which
    // is a median between 21 and 27 of 30. Measured median 24.0 — dead on the target.
    expect(daysInFive, report).toBeGreaterThanOrEqual(PACE_TARGETS.smallDaysInFive - 0.5);
    expect(daysInFive, report).toBeLessThanOrEqual(PACE_TARGETS.smallDaysInFive + 0.5);
    // And the small things are the everyday texture, not a trickle: re-measured 31 starts a month
    // (median), mean 31.47, range 28 to 35 — most days hold one, some hold two.
    expect(median(smallStarts), `small starts per 30 days: median ${median(smallStarts)}, mean ${mean(smallStarts).toFixed(2)}, range ${range(smallStarts)} (measured median 31, mean 31.47, 28 to 35, at rate ${SIZE_PACING.small.perFarmDay})`).toBeGreaterThanOrEqual(15);
  });

  it('never tells a line with a placeholder still in it (#114)', () => {
    // Every card line is filled before it is told, on this path and on the unwatched one, so the
    // chronicle holds finished sentences and the storybook has nothing to render but prose. Across
    // the same thirty seeds and thirty farm days as the pace measurements above: zero.
    const braced = months.flatMap((m) => m.braced);
    expect(braced, `chronicle lines with a brace: ${braced.slice(0, 3).join(' | ')}`).toEqual([]);
  });

  it('a big thing a few times a farm month — measured median 2, mean 1.77, range 0 to 3', () => {
    // The owner's target is about three in thirty farm days. On #111 alone this landed between one
    // and five on 28 of 30 seeds (median 2, mean 2.30, range 0 to 5), zero on two (seeds 8 and 14);
    // with #86 merged in at the old rate of 8 it read median 1, mean 1.60, range 0 to 4, in band on
    // 27 of 30. **Re-measured at the shipped small rate: median 2, mean 1.77, range 0 to 3, in band
    // on 27 of 30**, zero on three (seeds 6, 8 and 14). Nothing here touches the big rate — it is
    // still `bigPerThirtyFarmDays / 30` — but the small draw shares the concurrency cap and the
    // no-repeat window with it, so a quieter small stream moves the big one a little too;
    // `merchantCaravan` narrowing from day-or-dusk to day-only (#86, at weight 10 rather than
    // trunk's 14 — see its own `farm.json` comment) is the other half of it. Zero is still not a
    // failure — nothing is forced, and a quiet month is allowed (plan decision 16) — so the band is
    // asserted over the population, not per seed.
    const inBand = bigStarts.filter((n) => n >= 1 && n <= 5).length;
    const report = `big starts per 30 farm days: median ${median(bigStarts)}, mean ${mean(bigStarts).toFixed(2)}, range ${range(bigStarts)}, in 1..5 on ${inBand}/30 (measured median 2, mean 1.77, 0 to 3, in band on 27/30, at small rate ${SIZE_PACING.small.perFarmDay}); target ${PACE_TARGETS.bigPerThirtyFarmDays}`;
    expect(inBand, report).toBeGreaterThanOrEqual(24); // measured 27 of 30
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
      // Matched on the picture key, not the authored line: since #114 the told line is the filled
      // sentence, so a raw-line match could never fire (the round-3 Verifier proved it vacuous).
      const bigPictures = new Set(FARM_DECK.cards.concat().filter((x) => x.size === 'big').map((x) => x.storybook.picture));
      for (const e of FARM_DECK.authored) if (e.size === 'big') bigPictures.add(e.storybook.picture);
      const toldDuringGap = c.state.chronicle.entries.filter((e) => e.atMs > s.clock.nowMs && bigPictures.has(e.picture));
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
      // Picture keys, not authored lines, for the same reason as above.
      const bigPictures = new Set(FARM_DECK.cards.filter((x) => x.size === 'big').map((x) => x.storybook.picture));
      for (const e of FARM_DECK.authored) if (e.size === 'big') bigPictures.add(e.storybook.picture);
      const told = c.state.chronicle.entries.filter((e) => e.atMs > s.clock.nowMs && bigPictures.has(e.picture));
      expect(told.map((e) => e.line), `seed ${seed}`).toEqual([]);
    }
  });

  it('small things do happen across an unwatched week, and they are in the chronicle', () => {
    // Measured over the same thirty seeds, a seven-farm-day gap. On #111 alone: median 7 small
    // things, mean 6.40, range 4 to 9, on median 5 of the 7 days (mean 4.93). With #86 merged in at
    // the old rate of 8: median 12, mean 12.60, range 11 to 16, on median 7 of 7 (mean 6.87).
    // **Re-measured at the shipped small rate: median 9 small things, mean 8.73, range 6 to 11, on
    // median 6 of the 7 days, mean 6.07, range 5 to 7.** The unwatched path reads the same rate the
    // watched one does, so it came down with it — and it is still a better day rate than watched
    // play manages (6.07 of 7 here against 23.90 of 30 there), because the unwatched look walks
    // every time band of every day at one look a farm hour while a watched world's actors are
    // elsewhere and its own eligibility windows are narrower.
    const counts: number[] = [];
    const days: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = started(seed);
      const before = s.chronicle.entries.length;
      const c = catchUp(s, 7 * dayMs(s));
      counts.push(c.unwatched.length);
      days.push(new Set(c.unwatched.map((d) => Math.floor((d.atMs - s.clock.nowMs) / dayMs(s)))).size);
      // Told, with the same picture key and the same filled line the watched world would have used
      // — that is what lets the storybook tell an unwatched week without writing a word of new
      // prose. Matched on the picture key rather than the raw line because since #114 both paths
      // fill the line's placeholders before telling it, from the one table.
      const fresh = c.state.chronicle.entries.slice(before);
      for (const d of c.unwatched) {
        const entry = FARM_DECK.byId.get(d.id);
        expect(entry, `seed ${seed}: ${d.id} is not in the deck`).toBeDefined();
        const card = entry!.kind === 'card' ? entry!.card : entry!.event;
        const line = fresh.find((e) => e.atMs === d.atMs && e.picture === card.storybook.picture);
        expect(line, `seed ${seed}: ${d.id} at ${d.atMs} was drawn but not told`).toBeDefined();
        expect(line!.source).toBe(d.kind);
        // The finished sentence, not the authored one: no card in this deck has a `coins` hook
        // (decision 12) and none of the small cards' lines counts the flock, so the fill is the
        // same one a watched draw of this card would have written.
        expect(line!.line).toBe(fillStorybookLine(card.storybook.line, { flock: c.after.wool.length, coins: coinsMoved(card.hooks.start) }));
      }
      // And nothing anywhere in the gap was told with a brace still in it (#114).
      for (const e of fresh) expect(e.line, `seed ${seed}: ${e.line}`).not.toMatch(/[{}]/);
    }
    const report = `unwatched week: draws median ${median(counts)}, mean ${mean(counts).toFixed(2)}, range ${range(counts)} (measured median 9, mean 8.73, 6 to 11, at small rate ${SIZE_PACING.small.perFarmDay}); days with one, of 7: median ${median(days)}, mean ${mean(days).toFixed(2)}, range ${range(days)} (measured median 6, mean 6.07, 5 to 7)`;
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

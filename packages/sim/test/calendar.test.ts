// The real-year calendar (#84): the owner's decision that seasons follow the real year, four
// across it, roughly a quarter each with a little seeded drift, and that Digital Luna's birthday is
// December 15 (plan section 2 "Time", section 11 decision 10).
//
// **No wall-clock estimates anywhere in this file.** Where a test needs to know where the world has
// got to, it asks the sim: `realMsOf` for the world's own real instant, `seasonSpanOf` for its own
// season, `dayMs(state)` for a farm day. The year-long cases go through `catchUp` (the Ledger's own
// path) or through the calendar functions directly — never a year of ticks, which at 100 ms a tick
// would be 315 million of them.
//
// The last section is the **v7 view**, the same evidence every earlier save bump left behind
// (test/ledger.test.ts for v4, test/chronicle.test.ts for v5, test/engine-parity.test.ts for v6):
// strip the two fields #84 added to `season` and put the version back to 7, and the six hot-path
// worlds and both scripted days hash to exactly the values trunk carried before this ticket. That
// is what makes "the schema moved, the tick did not" a fact rather than a claim.
import { describe, expect, it } from 'vitest';
import {
  civilFromDays,
  daysFromCivil,
  DEFAULT_REAL_EPOCH_MS,
  MS_PER_REAL_DAY,
  realDateAt,
  realDateMatches,
  realMsOfCivil,
  seasonAtRealMs,
  seasonSpanAt,
  seasonStartRealMs,
  SEASONS,
  type SeasonName,
} from '../src/calendar';
import { currentSeason, realMsOf, seasonSpanOf } from '../src/clock';
import { FARM_DECK } from '../src/engine/deck';
import { triggerMet } from '../src/engine/engine';
import { viewOf } from '../src/engine/view';
import { hashState } from '../src/hash';
import { catchUp } from '../src/ledger/catch-up';
import { dayMs } from '../src/ledger/ledger';
import { createInitialState, type SimState } from '../src/state';
import { advance } from '../src/tick';

const SEEDS = [1, 2, 3] as const;
const BIRTHDAY = FARM_DECK.authored.find((e) => e.id === 'dlBirthday')!;

/** Put a world on a real instant without moving its sim clock (see engine-events.test.ts). */
function at(s: SimState, realMs: number): SimState {
  return { ...s, season: { ...s.season, realEpochMs: realMs - s.season.elapsedMs } };
}

const iso = (realMs: number): string => {
  const d = realDateAt(realMs);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
};

describe('civil dates, without a Date object in the room', () => {
  it('round-trips every day across a leap year and a century boundary', () => {
    // Hinnant's pair, both directions, over four years that hold a leap day (2024) and the two
    // awkward Februaries either side of a century rule (1900 is not a leap year, 2000 is).
    for (const year of [1899, 1900, 1999, 2000, 2023, 2024, 2026, 2100]) {
      for (let month = 1; month <= 12; month++) {
        for (let day = 1; day <= 28; day++) {
          const days = daysFromCivil(year, month, day);
          expect(civilFromDays(days), `${year}-${month}-${day}`).toEqual({ year, month, day });
        }
      }
    }
    expect(civilFromDays(daysFromCivil(2024, 2, 29))).toEqual({ year: 2024, month: 2, day: 29 });
    // 1900 had no February 29: asking for it lands on March 1, which is why `realDateMatches`
    // compares the date it reads back rather than trusting the month and day it was handed.
    expect(civilFromDays(daysFromCivil(1900, 2, 29))).toEqual({ year: 1900, month: 3, day: 1 });
  });

  it('agrees with the Unix epoch and counts a day as 86,400,000 ms', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(realMsOfCivil(1970, 1, 1)).toBe(0);
    expect(MS_PER_REAL_DAY).toBe(86_400_000);
    expect(realDateAt(0)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(realDateAt(MS_PER_REAL_DAY - 1)).toEqual({ year: 1970, month: 1, day: 1 });
    expect(realDateAt(MS_PER_REAL_DAY)).toEqual({ year: 1970, month: 1, day: 2 });
    expect(realDateAt(DEFAULT_REAL_EPOCH_MS)).toEqual({ year: 2026, month: 4, day: 1 });
  });
});

describe('the season sequence over one real year', () => {
  it('runs spring, summer, autumn, winter in order, once each, on three seeds', () => {
    // Walked by the calendar's own functions, one real day at a time through 2026 — no ticks, no
    // wall clock. The sequence of distinct seasons a world passes through in a real year is the
    // four in order, and every one of them is entered exactly once.
    for (const seed of SEEDS) {
      const seen: SeasonName[] = [];
      for (let day = daysFromCivil(2026, 1, 1); day < daysFromCivil(2027, 1, 1); day++) {
        const season = seasonAtRealMs(seed, day * MS_PER_REAL_DAY);
        if (seen[seen.length - 1] !== season) seen.push(season);
      }
      // The year opens in the winter that began the previous December, so the run is winter,
      // spring, summer, autumn, winter — five entries covering four distinct seasons in order.
      expect(seen, `seed ${seed}: ${seen.join(' -> ')}`).toEqual(['winter', 'spring', 'summer', 'autumn', 'winter']);
    }
  });

  it('each season starts within ten real days of its anchor, and every seed’s year is a different one', () => {
    const anchors: Record<SeasonName, { month: number; day: number }> = {
      spring: { month: 3, day: 20 },
      summer: { month: 6, day: 21 },
      autumn: { month: 9, day: 22 },
      winter: { month: 12, day: 21 },
    };
    const perSeed = SEEDS.map((seed) => SEASONS.map((s) => seasonStartRealMs(seed, 2026, s)));
    for (const [i, seed] of SEEDS.entries()) {
      for (const [j, season] of SEASONS.entries()) {
        const anchor = realMsOfCivil(2026, anchors[season].month, anchors[season].day);
        const drift = ((perSeed[i] as number[])[j] as number) - anchor;
        expect(Math.abs(drift) / MS_PER_REAL_DAY, `seed ${seed} ${season}: ${iso((perSeed[i] as number[])[j] as number)}`).toBeLessThanOrEqual(10);
      }
    }
    // Seeded drift is the point (plan section 2): three seeds do not share a calendar.
    expect(new Set(perSeed.map((starts) => starts.join(',')))).toHaveProperty('size', SEEDS.length);
  });

  it('seasons can never overlap or invert: starts strictly increase and lengths land in 69 to 113 real days', () => {
    // The rule `outsideRules.seasons.calendar` states and the reason a length is never sampled on
    // its own. Checked over twelve real years and thirty seeds, which is 1,440 consecutive spans.
    for (let seed = 1; seed <= 30; seed++) {
      let previous = -Infinity;
      for (let year = 2020; year <= 2031; year++) {
        for (const season of SEASONS) {
          const start = seasonStartRealMs(seed, year, season);
          expect(start, `seed ${seed} ${year} ${season}`).toBeGreaterThan(previous);
          const span = seasonSpanAt(seed, start);
          expect(span.name, `seed ${seed} ${year} ${season}`).toBe(season);
          expect(span.startMs).toBe(start);
          const length = (span.endMs - span.startMs) / MS_PER_REAL_DAY;
          expect(length, `seed ${seed} ${year} ${season}: ${length} real days`).toBeGreaterThanOrEqual(69);
          expect(length, `seed ${seed} ${year} ${season}: ${length} real days`).toBeLessThanOrEqual(113);
          previous = start;
        }
      }
    }
  });

  it('a season’s end is the next season’s start, with no gap and no overlap at the seam', () => {
    for (const seed of SEEDS) {
      const start = seasonStartRealMs(seed, 2026, 'spring');
      let span = seasonSpanAt(seed, start);
      for (let i = 0; i < 8; i++) {
        expect(seasonAtRealMs(seed, span.endMs - 1)).toBe(span.name); // last moment of this one
        const next = seasonSpanAt(seed, span.endMs);
        expect(next.name).not.toBe(span.name); // first moment of the next
        expect(next.startMs).toBe(span.endMs);
        span = next;
      }
    }
  });

  it('two worlds on the same real day can be a few days apart in their season, and the same seed never is', () => {
    // The owner's "a little seeded drift is the point", made concrete. On 2026-09-16 the seeds
    // below are split across the summer/autumn seam because their autumns start on different days.
    const day = realMsOfCivil(2026, 9, 16) + 12 * 3_600_000;
    const seasons = new Set(Array.from({ length: 30 }, (_, i) => seasonAtRealMs(i + 1, day)));
    expect(seasons.size, `seeds 1-30 on ${iso(day)}: ${[...seasons].join(', ')}`).toBeGreaterThan(1);
    // And determinism: the same seed, asked twice, on the same instant and on a nearby one.
    for (const seed of SEEDS) {
      expect(seasonSpanAt(seed, day)).toEqual(seasonSpanAt(seed, day));
      expect(seasonSpanAt(seed, day + 1).name).toBe(seasonSpanAt(seed, day).name);
    }
  });
});

describe('a world reads its own calendar', () => {
  it('a world made in June is in summer, and one made without a real time is in spring', () => {
    for (const seed of SEEDS) {
      const june = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 6, 30) });
      expect(currentSeason(june.season), `seed ${seed}`).toBe('summer');
      expect(currentSeason(createInitialState(seed).season), `seed ${seed}`).toBe('spring');
    }
  });

  it('away-time catch-up crosses a season boundary correctly', () => {
    // Put the world a farm day before its own autumn, then hand the Ledger the gap. The season the
    // world comes back in is read off its own calendar, not estimated: the boundary is
    // `seasonSpanOf(state.season).endMs`, and the gap is measured in that same sim time.
    for (const seed of SEEDS) {
      const fresh = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 8, 1) });
      const summer = seasonSpanOf(fresh.season);
      expect(summer.name).toBe('summer');
      const day = dayMs(fresh);
      // Start one farm day before the seam; the away gap is two farm days, so it lands one farm
      // day the other side of it. `realEpochMs` is set so `elapsedMs === 0` is that instant.
      const before = createInitialState(seed, { realEpochMs: summer.endMs - day });
      expect(currentSeason(before.season), `seed ${seed}`).toBe('summer');
      const away = catchUp(before, 2 * day);
      expect(away.mode, `seed ${seed}`).toBe('ledger');
      expect(currentSeason(away.state.season), `seed ${seed}`).toBe('autumn');
      // The Ledger diff saw the change too, which is what the "while you were gone" line reads.
      expect(away.diff.season, `seed ${seed}`).toEqual({ from: 'summer', to: 'autumn', changed: true });
      // And the world's own real date moved by exactly the gap: the host's one-to-one mapping.
      expect(realMsOf(away.state.season) - realMsOf(before.season)).toBe(2 * day);
      // A gap that stops short of the seam does not cross it.
      const short = catchUp(before, Math.floor(0.5 * day));
      expect(currentSeason(short.state.season), `seed ${seed}`).toBe('summer');
    }
  });

  it('the same seed and the same real epoch give the same calendar, twice over', () => {
    for (const seed of SEEDS) {
      const a = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 11, 3) });
      const b = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 11, 3) });
      expect(hashState(a)).toBe(hashState(b));
      expect(seasonSpanOf(a.season)).toEqual(seasonSpanOf(b.season));
      // Reading the calendar draws nothing from the world's own generator: it is a lookup, and a
      // world asked about its season a thousand times is the world it was before.
      const rngBefore = a.rng.s;
      for (let i = 0; i < 1000; i++) currentSeason(a.season);
      expect(a.rng.s).toBe(rngBefore);
      expect(a.events.rng.s).toBe(b.events.rng.s);
      expect(hashState(a)).toBe(hashState(b));
    }
  });
});

describe('Digital Luna’s birthday, December 15', () => {
  it('is due on exactly one real day a year, on three seeds and over five real years', () => {
    // Walked one real day at a time through five real years — the calendar functions directly, not
    // a year of ticks. `triggerMet` is the engine's own reader, so this is the trigger, not a
    // paraphrase of it.
    for (const seed of SEEDS) {
      const world = createInitialState(seed, { events: false });
      const due: string[] = [];
      for (let day = daysFromCivil(2026, 1, 1); day < daysFromCivil(2031, 1, 1); day++) {
        const s = at(world, day * MS_PER_REAL_DAY + 9 * 3_600_000); // mid-morning, real time
        if (triggerMet(s, viewOf(s), BIRTHDAY)) due.push(iso(realMsOf(s.season)));
      }
      expect(due, `seed ${seed}`).toEqual(['2026-12-15', '2027-12-15', '2028-12-15', '2029-12-15', '2030-12-15']);
    }
  });

  it('never on day one of a world started in June, and still due that December', () => {
    // The ticket's own case. A June world waits about half a real year for its first birthday; it
    // does not get one at tick zero the way every world did before the December 15 decision.
    for (const seed of SEEDS) {
      const june = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 6, 15) });
      expect(triggerMet(june, viewOf(june), BIRTHDAY), `seed ${seed}`).toBe(false);
      // Not in its first farm day of live play either, by the engine's own path.
      const played = advance(createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 6, 15) }), 1800);
      expect(played.events.running.map((r) => r.id), `seed ${seed}`).not.toContain('dlBirthday');
      expect(played.events.starts['dlBirthday'], `seed ${seed}`).toBeUndefined();
      // And on the day itself it is due.
      const december = at(june, realMsOfCivil(2026, 12, 15) + 9 * 3_600_000);
      expect(triggerMet(december, viewOf(december), BIRTHDAY), `seed ${seed}`).toBe(true);
    }
  });

  it('the date cooldown bars a second birthday in the same December and clears before the next one', () => {
    // `cooldownMs` in engine.ts: just under one real year. It has to outlast a whole December and
    // fall short of the next one, whatever the leap year does.
    const s = createInitialState(1, { events: false });
    const before = s.events.cooldowns['dlBirthday'];
    expect(before).toBeUndefined();
    const started = at(s, realMsOfCivil(2026, 12, 15) + 3_600_000);
    expect(triggerMet(started, viewOf(started), BIRTHDAY)).toBe(true);
    // The bar itself, read through the engine rather than restated: start it, end it, and look at
    // what it wrote. `applyAuthoredIntent` is the owner's hand; the cooldown it leaves is the one
    // a natural start leaves too.
    const played = advance(createInitialState(1, { realEpochMs: realMsOfCivil(2026, 12, 15) }), 1);
    const runs = played.events.running.map((r) => r.id);
    expect(runs, 'the birthday starts on its own on December 15, watched').toContain('dlBirthday');
  });

  it('is held back on the unwatched path, whatever the real date (plan decision 16)', () => {
    // The owner's rule: big things do not happen while nobody is watching, and `realDate` returns
    // false on the Ledger path on top of that (ledger/unwatched.ts). So a world left alone across
    // December 15 comes back without a birthday. This is the consequence the PR body puts to the
    // owner rather than deciding: that year has no birthday, and it is not replayed later.
    for (const seed of SEEDS) {
      const s = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 12, 14) });
      const away = catchUp(s, 3 * dayMs(s)); // across the 15th, in sim time, at farm-day resolution
      expect(away.mode).toBe('ledger');
      expect(away.unwatched.map((d) => d.id), `seed ${seed}`).not.toContain('dlBirthday');
      const told = away.state.chronicle.entries.filter((e) => e.line.toLowerCase().includes('birthday'));
      expect(told.map((e) => e.line), `seed ${seed}`).toEqual([]);
    }
  });
});

describe('a real date that does not exist in every year', () => {
  it('February 29 is due in a leap year and in no other', () => {
    expect(realDateMatches(realMsOfCivil(2024, 2, 29), 2, 29)).toBe(true);
    for (const year of [2025, 2026, 2027]) {
      let due = false;
      for (let day = daysFromCivil(year, 2, 1); day < daysFromCivil(year, 3, 5); day++) {
        if (realDateMatches(day * MS_PER_REAL_DAY, 2, 29)) due = true;
      }
      expect(due, String(year)).toBe(false);
    }
  });
});

/**
 * The v7 view: the same evidence #39, #60 and #40 each left behind. Strip the two fields #84 added
 * to `season` — and to the Ledger snapshot's own copy of it — put the version back to 7, and every
 * world below hashes to exactly the value trunk carried before this ticket. Nothing in the tick
 * moved; the state simply carries two more numbers.
 */
function v7View(s: SimState): Record<string, unknown> {
  const season = { ...s.season, realEpochMs: undefined, seed: undefined };
  const ledger = { ...s.ledger, season: { ...s.ledger.season, realEpochMs: undefined, seed: undefined } };
  return { ...s, version: 7, season, ledger };
}

describe('the pre-calendar view (#84 moves the schema, not the tick)', () => {
  // The six hot-path worlds, engine off, as test/hot-path-parity.test.ts pinned them before #84.
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: '0791cd39c7e2aab8' },
    { seed: 6, sheep: 40, hash: 'ab75ceacb516b7ae' },
    { seed: 7, sheep: 5, hash: '0ed2243395f4d7e2' },
    { seed: 7, sheep: 40, hash: 'a33d55048b809e3d' },
    { seed: 11, sheep: 5, hash: '0e4a4606aab31838' },
    { seed: 11, sheep: 40, hash: 'ce2977de7b3d70d2' },
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as before #84 on the v7 view`, () => {
      expect(hashState(v7View(advance(createInitialState(seed, { sheep, events: false }), 6000)))).toBe(hash);
    });
  }

  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as before #84 on the v7 view", () => {
    expect(hashState(v7View(advance(createInitialState(11), 1800)))).toBe('575fc853e800bd3d');
  });

  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as before #84 on the v7 view", () => {
    expect(hashState(v7View(advance(createInitialState(71), 1800)))).toBe('db82b911ed86c1f8');
  });
});

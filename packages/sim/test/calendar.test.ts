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
  lastRealDateOccurrence,
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
import { createChronicle } from '../src/chronicle/store';
import { FARM_DECK } from '../src/engine/deck';
import { createEvents } from '../src/engine/events';
import { triggerMet } from '../src/engine/engine';
import { viewOf } from '../src/engine/view';
import { hashState } from '../src/hash';
import { catchUp } from '../src/ledger/catch-up';
import { dayMs, summarise } from '../src/ledger/ledger';
import { advanceUnwatched } from '../src/ledger/unwatched';
import { cloneRng } from '../src/rng';
import { fromSave, toSave } from '../src/save/serialize';
import { createInitialState, type SimState } from '../src/state';
import { advance } from '../src/tick';
import { stubDeck } from './engine-helpers';

const SEEDS = [1, 2, 3] as const;
/**
 * One real day of sim time. The host maps wall time to sim time one to one (`catchUp`'s own doc
 * comment), so a real day away is this many sim ms whatever the farm's day length — not a wall-clock
 * estimate, the mapping the sim itself uses.
 */
const REAL_DAY_IN_SIM_MS = MS_PER_REAL_DAY;
const BIRTHDAY = FARM_DECK.authored.find((e) => e.id === 'dlBirthday')!;

/** Put a world on a real instant without moving its sim clock (see engine-events.test.ts). */
function at(s: SimState, realMs: number): SimState {
  return { ...s, season: { ...s.season, realEpochMs: realMs - s.season.elapsedMs } };
}

/**
 * The same world, later in its own life: its sim clock moves and its epoch does not, so it is the
 * world it was, older. Time is moved without running the sim because these cases are about the
 * *trigger*, not about what a year of ticks does; the step is one to one with real time, the same
 * mapping `catchUp` uses. The cases that need real days actually to pass go through `catchUp`.
 */
function later(s: SimState, realMs: number): SimState {
  const dt = realMs - realMsOf(s.season);
  return { ...s, season: { ...s.season, elapsedMs: s.season.elapsedMs + dt }, clock: { ...s.clock, nowMs: s.clock.nowMs + dt } };
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
  it('comes round on exactly one real day a year, on three seeds and over five real years', () => {
    // Walked one real day at a time through five real years — the calendar functions directly, not
    // a year of ticks. `triggerMet` is the engine's own reader, so this is the trigger, not a
    // paraphrase of it.
    //
    // `at()` re-anchors the world's epoch at every probe, so each of these 1,827 readings is a farm
    // **made that morning** — which is exactly what isolates the date from the hold. A farm made on
    // the morning of the 16th was not alive on the 15th and is owed nothing; a farm made on the
    // morning of the 15th is owed that day. The holding cases are the three below.
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

  it('a world watched on the day has its birthday that day', () => {
    const played = advance(createInitialState(1, { realEpochMs: realMsOfCivil(2026, 12, 15) }), 1);
    expect(played.events.running.map((r) => r.id), 'the birthday starts on its own on December 15, watched').toContain('dlBirthday');
    expect(played.chronicle.entries.some((e) => e.line.includes('birthday'))).toBe(true);
  });

  it('never on the unwatched path, whatever the real date (plan decision 16)', () => {
    // Big things do not happen while nobody is watching, and `realDate` answers false on the Ledger
    // path on top of that (ledger/unwatched.ts), so the debt can never be quietly settled by a
    // catch-up. A world left alone across December 15 comes back with the birthday still owed.
    for (const seed of SEEDS) {
      const s = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 12, 14) });
      const away = catchUp(s, 3 * REAL_DAY_IN_SIM_MS); // across the 15th and out the far side
      expect(away.mode).toBe('ledger');
      expect(away.unwatched.map((d) => d.id), `seed ${seed}`).not.toContain('dlBirthday');
      const told = away.state.chronicle.entries.filter((e) => e.line.toLowerCase().includes('birthday'));
      expect(told.map((e) => e.line), `seed ${seed}`).toEqual([]);
      expect(away.state.events.starts['dlBirthday'], `seed ${seed}`).toBeUndefined();
      // Still owed on the far side of the 17th: this is the hold.
      expect(triggerMet(away.state, viewOf(away.state), BIRTHDAY), `seed ${seed}`).toBe(true);
    }
  });

  it('a SMALL realDate event never starts on the unwatched path either, so the guard is real and not just the size filter', () => {
    // `dlBirthday` is `big`, so `look`'s own size filter (`ledger/unwatched.ts`) already holds it
    // back before `ledgerTriggerMet` is ever asked about it — the test above proves the outcome for
    // the shipped deck, but it cannot tell the size filter and the `case 'realDate': return false`
    // guard apart. This one can: a stub deck's `realDate` event is `small`, so the size filter lets
    // it through to `ledgerTriggerMet`, and the guard is the only thing left holding it. Flip
    // `unwatched.ts`'s `case 'realDate': return false` to `return true` and this is the test that
    // fails (see the PR body for the mutation and its result — nothing else in the suite moves).
    for (const seed of SEEDS) {
      const deck = stubDeck([], [{ id: 'smallRealDate', size: 'small', trigger: { kind: 'realDate', month: 12, day: 15 } }]);
      const state = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 12, 14) });
      const ledger = summarise(state);
      const events = createEvents(seed, ledger.clock.nowMs);
      const log = { chronicle: createChronicle() };
      const run = advanceUnwatched(ledger, 3 * REAL_DAY_IN_SIM_MS, cloneRng(state.rng), events, log, deck); // across the 15th
      expect(run.drawn.map((d) => d.id), `seed ${seed}`).not.toContain('smallRealDate');
      expect(events.starts['smallRealDate'], `seed ${seed}`).toBeUndefined();
      expect(log.chronicle.entries.some((e) => e.line.includes('smallRealDate')), `seed ${seed}`).toBe(false);
    }
  });

  it('a world with no watched step on December 15 has its birthday on its first watched step in January', () => {
    // The owner's decision, 2026-09-09: "a year where nobody watches on that day gets no birthday —
    // that is not good. Maybe it should hold until I am viewing." Twenty real days away, crossing
    // December 15 with nobody watching, and the birthday is waiting on the other side.
    for (const seed of SEEDS) {
      const s = createInitialState(seed, { realEpochMs: realMsOfCivil(2026, 12, 14) });
      const away = catchUp(s, 20 * REAL_DAY_IN_SIM_MS);
      expect(away.mode).toBe('ledger');
      expect(iso(realMsOf(away.state.season))).toBe('2027-01-03'); // the calendar really did cross
      expect(away.state.events.starts['dlBirthday'], `seed ${seed}: it fired while nobody watched`).toBeUndefined();
      // The first watched step pays it, three real weeks late and not lost.
      const back = advance(away.state, 1);
      expect(back.events.running.map((r) => r.id), `seed ${seed}`).toContain('dlBirthday');
      expect(back.chronicle.entries.some((e) => e.line.includes('birthday')), `seed ${seed}`).toBe(true);
    }
  });

  it('a held birthday survives a save and a reload, because what holds it is what is saved', () => {
    // Nothing new is stored for the hold: it is `season.realEpochMs` and `events.starts`, both of
    // them already in the v8 document. So a player who closes the tab in December and opens it in
    // January still gets the birthday.
    const s = createInitialState(2, { realEpochMs: realMsOfCivil(2026, 12, 14) });
    const away = catchUp(s, 20 * REAL_DAY_IN_SIM_MS);
    expect(triggerMet(away.state, viewOf(away.state), BIRTHDAY)).toBe(true);
    const reloaded = fromSave(toSave(away.state));
    expect(triggerMet(reloaded, viewOf(reloaded), BIRTHDAY), 'the debt did not survive the save').toBe(true);
    expect(advance(reloaded, 1).events.running.map((r) => r.id)).toContain('dlBirthday');
  });

  it('once per real year even when held: a birthday still owed on the next December 15 fires once, not twice', () => {
    // The owner's own qualifier. A world that goes a whole year unwatched is owed one birthday when
    // it comes back, not two — the debt is for the *current* occurrence, and one start settles it.
    const december2026 = at(createInitialState(3, { events: false }), realMsOfCivil(2026, 12, 20));
    expect(triggerMet(december2026, viewOf(december2026), BIRTHDAY)).toBe(false); // born on the 20th, owed nothing

    // Born on December 14 2026 and not looked at again until December 20 **2027**: two December
    // 15ths went by unwatched, and it is owed one birthday, not two.
    const world = createInitialState(3, { events: false, realEpochMs: realMsOfCivil(2026, 12, 14) });
    const late = later(world, realMsOfCivil(2027, 12, 20));
    expect(triggerMet(late, viewOf(late), BIRTHDAY)).toBe(true);
    // One start settles it, and no second one is owed — that is the "once, not twice".
    const paid = { ...late, events: { ...late.events, starts: { ...late.events.starts, dlBirthday: late.clock.nowMs } } };
    expect(triggerMet(paid, viewOf(paid), BIRTHDAY)).toBe(false);
    // And the next December is owed again on its own day, not before it.
    const nextNovember = later(paid, realMsOfCivil(2028, 11, 30));
    expect(triggerMet(nextNovember, viewOf(nextNovember), BIRTHDAY)).toBe(false);
    const next = later(paid, realMsOfCivil(2028, 12, 15) + 3_600_000);
    expect(triggerMet(next, viewOf(next), BIRTHDAY)).toBe(true);
  });

  it('the realDate cooldown is one farm day, not a real year: a held-and-paid birthday still starts on its own next December 15', () => {
    // The Verifier's own scenario (verdict finding 3, mutation M8): born 2026-12-14, unwatched over
    // the 15th so the birthday holds, paid on the first watched step on 2027-01-03. If the `realDate`
    // cooldown were still the real-year bar `simDate` keeps (`REAL_YEAR_MS * PACING.simDateCooldownCycles`,
    // the value engine.ts carried before #84's round 2), that bar would still be up on 2027-12-15 —
    // it lifts only late that day — and the next birthday would not start when the owner opens the
    // tab that morning. With the one-farm-day cooldown this branch actually ships, the only thing
    // barring the next birthday is the occurrence itself (`realDateDue`), and it starts the moment a
    // watched step sees December 15 next year, not some hours or a day into it.
    let world = createInitialState(4, { realEpochMs: realMsOfCivil(2026, 12, 14) });
    const away = catchUp(world, 20 * REAL_DAY_IN_SIM_MS); // crosses the 15th, unwatched
    expect(iso(realMsOf(away.state.season))).toBe('2027-01-03');
    expect(away.state.events.starts['dlBirthday']).toBeUndefined(); // still held, not paid yet

    let paid = advance(away.state, 1); // the first watched step pays it
    expect(paid.events.running.map((r) => r.id)).toContain('dlBirthday');
    // Let it run to completion so its own cooldown is actually stamped (endEvent, not startEvent) —
    // the same real path a live world takes, not a shortcut that could hide the bug being pinned.
    for (let i = 0; i < 20_000 && paid.events.running.some((r) => r.id === 'dlBirthday'); i++) paid = advance(paid, 1);
    expect(paid.events.running.map((r) => r.id)).not.toContain('dlBirthday');

    // Jump straight to next December 15, mid-morning, the same way the file's other year-long cases
    // do — moving the clock and the real epoch together (`later`), not ticking a year through.
    const nextDec15 = later(paid, realMsOfCivil(2027, 12, 15) + 9 * 3_600_000);
    expect(triggerMet(nextDec15, viewOf(nextDec15), BIRTHDAY)).toBe(true); // owed again, a year on

    // And a watched step right there starts it — this is the line the real-year cooldown would fail:
    // reverted, the cooldown stamped when the previous birthday ended in January would still be up,
    // and this assertion is the one that breaks.
    const back = advance(nextDec15, 1);
    expect(back.events.running.map((r) => r.id)).toContain('dlBirthday');
  });

  it('a window opts an event out of holding: it is due inside its window and never after it', () => {
    // `windowSimMinutes` is the "narrow door on the day, or not at all" reading, kept for an event
    // that wants it. Nothing in the shipped deck sets one; the birthday holds.
    const windowed = stubDeck([{ id: 'c' }], [{ id: 'noonish', trigger: { kind: 'realDate', month: 12, day: 15, windowSimMinutes: 90 } }]).authored[0]!;
    const world = createInitialState(1, { events: false, realEpochMs: realMsOfCivil(2026, 12, 15) });
    // 90 sim-minutes is 11.25 seconds of sim time at the 180-second farm day (`simMinuteMs`), so
    // "inside the window" is a second in, not a minute.
    const inside = later(world, realMsOfCivil(2026, 12, 15) + 1_000);
    expect(triggerMet(inside, viewOf(inside), windowed)).toBe(true);
    const past = later(world, realMsOfCivil(2026, 12, 15) + 60_000);
    expect(triggerMet(past, viewOf(past), windowed), 'still on the day, but past the window').toBe(false);
    const afterwards = later(world, realMsOfCivil(2026, 12, 20));
    expect(triggerMet(afterwards, viewOf(afterwards), windowed), 'a window does not hold').toBe(false);
    // The birthday, on the same instant of the same world, does hold.
    expect(triggerMet(afterwards, viewOf(afterwards), BIRTHDAY)).toBe(true);
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

  it('lastRealDateOccurrence walks February 29 back to the previous leap year, not quietly to March 1', () => {
    // The body's own claim under "What the new tests actually prove" — round-tripped directly here,
    // since `realDateMatches` above (and the birthday's own trigger, which is December 15 and never
    // exercises the leap-year branch) cannot stand in for it.
    for (const nonLeapYear of [2025, 2026, 2027]) {
      // Anywhere in the non-leap year, after its own February: the walk-back skips this year (no
      // February 29 to round-trip) and lands on the most recent leap year's own February 29 — never
      // invents March 1 in a year that has none.
      const at = realMsOfCivil(nonLeapYear, 6, 1);
      const occurrence = lastRealDateOccurrence(at, 2, 29);
      expect(occurrence, String(nonLeapYear)).toBeDefined();
      const found = realDateAt(occurrence!);
      expect(found, String(nonLeapYear)).toEqual({ year: 2024, month: 2, day: 29 });
      expect(found.year, String(nonLeapYear)).toBeLessThan(nonLeapYear);
    }
    // Asked from inside the leap year itself, on or after the day: this year's own February 29.
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2024, 3, 1), 2, 29)!)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2028, 12, 31), 2, 29)!)).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it('lastRealDateOccurrence, an ordinary date: this year on or after it, last year before it', () => {
    // The plain case the leap-year test above cannot exercise on its own: a date that exists every
    // year still has to walk back to the *previous* year when asked before it has happened this year.
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2026, 12, 15), 12, 15)!)).toEqual({ year: 2026, month: 12, day: 15 });
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2026, 12, 31), 12, 15)!)).toEqual({ year: 2026, month: 12, day: 15 });
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2027, 1, 3), 12, 15)!)).toEqual({ year: 2026, month: 12, day: 15 });
    expect(realDateAt(lastRealDateOccurrence(realMsOfCivil(2026, 12, 14), 12, 15)!)).toEqual({ year: 2025, month: 12, day: 15 });
    // The occurrence itself is that day's UTC midnight, not the instant asked at.
    expect(lastRealDateOccurrence(realMsOfCivil(2026, 12, 15) + 9 * 3_600_000, 12, 15)).toBe(realMsOfCivil(2026, 12, 15));
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
  // `settlement` (#86, save v9) goes too, on the world and on the Ledger snapshot: a v7 build never
  // stored one. That strip alone does not bring the pre-#86 hashes back — #86 moved the tick as
  // well as the schema — so the values below moved with it; each says what it was and why.
  const ledger = { ...s.ledger, season: { ...s.ledger.season, realEpochMs: undefined, seed: undefined }, settlement: undefined };
  return { ...s, version: 7, season, ledger, settlement: undefined };
}

describe('the pre-calendar view (#84 moves the schema, not the tick)', () => {
  // The six hot-path worlds, engine off, as test/hot-path-parity.test.ts pinned them before #84.
  // **Moved a second time in #86** (the sim half of "no transaction on the farm", plan decision 12),
  // for all six: the merchant stopped buying the wool bank when he stops at the gate. These worlds
  // run with the engine off, where the only thing that ever sold the bank was his 45-second timer
  // and there is no dawn market walk to replace it, so the wool simply banks up and no coin is ever
  // earned. Each line carries its own pre-#86 value. The two scripted days below moved too, for a
  // different reason: they run with the engine **on**, so they hold a dawn market walk, and the
  // walk sells.
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: 'c5cef5a67dc03fd9' /* PIN MOVED (#126): was '3edc3971f6216013' */ }, // moved in #86: the caravan stopped buying the wool bank; was 0791cd39c7e2aab8
    { seed: 6, sheep: 40, hash: '29999c2dd713b55d' /* PIN MOVED (#126): was 'a190c22f091395e9' */ }, // moved in #86: the caravan stopped buying the wool bank; was ab75ceacb516b7ae
    { seed: 7, sheep: 5, hash: '7039353aac6d627c' /* PIN MOVED (#126): was 'c7b2da6b50368791' */ }, // moved in #86: the caravan stopped buying the wool bank; was 0ed2243395f4d7e2
    { seed: 7, sheep: 40, hash: 'be78095de6bf72e1' /* PIN MOVED (#126): was '111b2f494e1c9263' */ }, // moved in #86: the caravan stopped buying the wool bank; was a33d55048b809e3d
    { seed: 11, sheep: 5, hash: 'aab5d0e99d09151e' /* PIN MOVED (#126): was 'b90a2901c0c39673' */ }, // moved in #86: the caravan stopped buying the wool bank; was 0e4a4606aab31838
    { seed: 11, sheep: 40, hash: '1153dcc906066034' /* PIN MOVED (#126): was '240c15df101430ac' */ }, // moved in #86: the caravan stopped buying the wool bank; was ce2977de7b3d70d2
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as pinned on the v7 view`, () => {
      expect(hashState(v7View(advance(createInitialState(seed, { sheep, events: false }), 6000)))).toBe(hash);
    });
  }

  // PINS MOVED (#86). Both scripted days run with the engine on, so both hold a dawn market walk,
  // and the walk now carries the wool bank out and pays the settlement for it. That is a change to
  // the world, not to its shape, so the v7 strip cannot bring these back and they are re-pinned.
  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as pinned on the v7 view", () => {
    expect(hashState(v7View(advance(createInitialState(11), 1800)))).toBe('f0a924319ea7542c' /* PIN MOVED (#126): was 'b1b26b76c94b3f0d' */); // moved in #86: the dawn market walk sells the bank; was 575fc853e800bd3d
  });

  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as pinned on the v7 view", () => {
    expect(hashState(v7View(advance(createInitialState(71), 1800)))).toBe('f2055dd80ac6aa7c' /* PIN MOVED (#126): was '278dd8ac81253279' */); // moved in #86: the dawn market walk sells the bank; was db82b911ed86c1f8
  });
});

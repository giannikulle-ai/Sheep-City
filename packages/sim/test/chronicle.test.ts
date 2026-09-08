// The chronicle (#60): the whole world's log, and `tell`, the one way any system writes to it.
//
// The parity block proves the actor tick did not move: the pre-#60 hashes still hold on the state
// with `chronicle` (always empty on these six worlds and two scripted days — nothing here calls
// `tell`) and the version taken off, the same way test/ledger.test.ts's `v4View` proved #39 didn't
// move the tick. The rest covers `tell`, notability, the read API, `tellLedgerDiff`, and a rough
// size for a year of entries.
import { hrtime } from 'node:process';
import { describe, expect, it } from 'vitest';
import { chronicleBetween, cloneChronicle, createChronicle, deviationNotability, notabilityScale, tell, tellLedgerDiff } from '../src/chronicle/index';
import { diffLedger } from '../src/ledger/diff';
import { catchUp } from '../src/ledger/catch-up';
import { summarise } from '../src/ledger/ledger';
import { respawn } from '../src/ledger/respawn';
import { hashState } from '../src/hash';
import { createInitialState, type SimState } from '../src/state';
import { advance } from '../src/tick';

const DAY = 180_000; // RULES.clock.periodSec (180s) in ms, the default day length these worlds use

/** The state as a v5 build would hash it: the ledger snapshot present, no chronicle, no events, version 5. */
function v5View(s: SimState): Record<string, unknown> {
  return { ...s, version: 5, chronicle: undefined, events: undefined };
}

/** A v5-comparable world: the engine off (#40), so the actors run exactly the tick a v5 build ran. */
function preEngine(seed: number, sheep?: number): SimState {
  return createInitialState(seed, sheep === undefined ? { events: false } : { sheep, events: false });
}

describe('the actor tick is untouched (#60 is a new path)', () => {
  // The pins the trunk carried before #60, from test/hot-path-parity.test.ts, test/luna-day.test.ts,
  // and test/sheep-day.test.ts, before `chronicle` was added and the version moved to 6. On the v5
  // view of the same six worlds and two scripted days they hold as they were. (`v5View` also strips
  // `events`, added in #40, and the worlds are built with the engine off: a v5 build had no engine,
  // and with one directing these are different worlds, not differently-shaped ones —
  // test/engine-parity.test.ts pins that.)
  // Moved again in #63 for the three 40-sheep worlds only: hay2's disposition eases grass regrow
  // once bought, and those worlds bank enough coins in 6,000 ticks to buy it. See
  // test/hot-path-parity.test.ts's header for the detail; the three 5-sheep worlds never reach it.
  // Moved a third time in #63's fix round (2026-09-08): hay2's bonus raised 0.15 -> 2.5 (same
  // header, same worlds — see test/hot-path-parity.test.ts's sixth-move note).
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: 'c983956cb0872c74' },
    { seed: 6, sheep: 40, hash: '3e9712b2fe7e6094' },
    { seed: 7, sheep: 5, hash: '69db4e4556aa8ea2' },
    { seed: 7, sheep: 40, hash: '482b58d4a7404576' },
    { seed: 11, sheep: 5, hash: '9c86b689cdc67c8b' },
    { seed: 11, sheep: 40, hash: 'aa2d319e2ec55634' },
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as before #60 on the v5 view`, () => {
      expect(hashState(v5View(advance(preEngine(seed, sheep), 6000)))).toBe(hash);
    });
  }
  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as before #60 on the v5 view", () => {
    expect(hashState(v5View(advance(preEngine(11), 1800)))).toBe('067877d6ea96f42c');
  });
  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as before #60 on the v5 view", () => {
    expect(hashState(v5View(advance(preEngine(71), 1800)))).toBe('779eafbf4da9aa0d');
  });
});

describe('the store is append-only', () => {
  it('tell only ever grows entries, never edits or drops one', () => {
    const s = createInitialState(1);
    expect(s.chronicle.entries).toEqual([]);
    const first = tell(s, { atMs: 0, district: 'farm', line: 'the flock settled in', picture: 'sit', source: 'authored', hint: 0.1 });
    expect(s.chronicle.entries).toEqual([first]);
    const second = tell(s, { atMs: 1000, district: 'farm', line: '2 wool banked', picture: 'wool', source: 'ledger', facts: { wool: 2 } });
    expect(s.chronicle.entries).toEqual([first, second]);
    // The first entry, by reference and by value, is exactly as it was written.
    expect(s.chronicle.entries[0]).toBe(first);
    expect(s.chronicle.entries[0]).toEqual({ id: 'c0', atMs: 0, district: 'farm', line: 'the flock settled in', picture: 'sit', actors: [], source: 'authored', notability: notabilityScale(0.1), first: false, facts: {} });
    for (let i = 0; i < 50; i++) tell(s, { atMs: 2000 + i, district: 'farm', line: 'a quiet moment', picture: 'sit', source: 'authored' });
    expect(s.chronicle.entries).toHaveLength(52);
    expect(s.chronicle.entries.slice(0, 2)).toEqual([first, second]);
  });

  it('ids are unique and stable, never reused, even across a clone', () => {
    const s = createInitialState(2);
    tell(s, { atMs: 0, district: 'farm', line: 'a', picture: 'p', source: 'authored' });
    tell(s, { atMs: 0, district: 'farm', line: 'b', picture: 'p', source: 'authored' });
    const clone = cloneChronicle(s.chronicle);
    tell({ chronicle: clone }, { atMs: 0, district: 'farm', line: 'c (on the clone only)', picture: 'p', source: 'authored' });
    expect(s.chronicle.entries.map((e) => e.id)).toEqual(['c0', 'c1']);
    expect(clone.entries.map((e) => e.id)).toEqual(['c0', 'c1', 'c2']);
    // The clone is independent: telling on it never touched the original.
    expect(s.chronicle.entries).toHaveLength(2);
  });

  it('cloneState carries the chronicle forward as a new array of the same, frozen entries: a tick never touches the input', () => {
    // The engine off, so the only entry in this world is the one told below: with it on, a tick
    // may tell one of its own (#40) and the counts below would be about the engine, not the clone.
    const s = preEngine(3);
    tell(s, { atMs: 0, district: 'farm', line: 'a', picture: 'p', source: 'authored', actors: ['sheep-0'], facts: { wool: 1 } });
    const before = s.chronicle.entries.length;
    const after = advance(s, 10);
    expect(s.chronicle.entries).toHaveLength(before);
    expect(after.chronicle.entries).toHaveLength(before);
    // The entries array itself is a new one (appending on either side never touches the other)...
    expect(after.chronicle.entries).not.toBe(s.chronicle.entries);
    // ...but since an entry is never edited once told, the clone shares the entry by reference
    // rather than copying it: cloning is O(distinct chronicle-holding states), not O(entries).
    expect(after.chronicle.entries[0]).toBe(s.chronicle.entries[0]);
    // An entry, and its actors and facts, are frozen the moment `tell` writes it, so nothing
    // downstream — a tick, a clone, a reader — can mutate a telling after the fact.
    const entry = s.chronicle.entries[0]!;
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.actors)).toBe(true);
    expect(Object.isFrozen(entry.facts)).toBe(true);
    expect(() => {
      'use strict';
      (entry as { line: string }).line = 'tampered';
    }).toThrow(TypeError);
    expect(entry.line).toBe('a');
  });

  it('cloning stays a small constant per entry: a tick with 40,000 entries costs a small multiple of an empty one, well inside the 2 ms budget', () => {
    // Both districts tick with 40 sheep, the charter's bench line, so the rest of a tick's own cost
    // (behaviours, ground, small life) is the same on both sides and only the chronicle differs.
    // The median, not the mean, of many single-tick timings: this suite runs its files in
    // parallel, so a stray GC pause or a neighbour's turn on the CPU can spike one iteration by a
    // lot without the underlying cost having changed; a mean carries that spike, a median shrugs
    // off a handful of outliers either side.
    const medianTickMs = (build: () => SimState): number => {
      const warm = build();
      advance(warm, 1); // let the JIT settle before timing, as the ledger speed tests do
      const iterations = 25;
      const timings: number[] = [];
      for (let i = 0; i < iterations; i++) {
        const s = build();
        const t0 = hrtime.bigint();
        advance(s, 1);
        timings.push(Number(hrtime.bigint() - t0) / 1e6);
      }
      timings.sort((a, b) => a - b);
      return timings[Math.floor(timings.length / 2)]!;
    };

    // Both worlds have the engine off (#40): this measures what cloning a chronicle costs a tick,
    // and an event firing inside a timed tick is noise on both sides of the comparison.
    const emptyMs = medianTickMs(() => preEngine(15, 40));

    const withHistory = (): SimState => {
      const s = preEngine(16, 40);
      for (let i = 0; i < 40_000; i++) {
        tell(s, { atMs: i, district: 'farm', line: 'x', picture: 'p', source: 'ledger', facts: { wool: 40 + (i % 5) } });
      }
      return s;
    };
    expect(withHistory().chronicle.entries).toHaveLength(40_000);
    const bigMs = medianTickMs(withHistory);

    console.log(`chronicle: one tick costs ${emptyMs.toFixed(4)} ms (median) with an empty chronicle, ${bigMs.toFixed(4)} ms with 40,000 entries`);
    // Generous, not tight: this bound only has to catch a real O(entries) regression, not chase a
    // tight constant on a shared, parallel box. Before the fix (cloneChronicle deep-copying every
    // entry) this was measured at 7.5 ms for 40,000 entries against an empty-chronicle tick of
    // about 0.1 ms — tens of times the cost, not a handful.
    expect(bigMs).toBeLessThan(emptyMs * 8 + 2);
  });
});

describe('notability', () => {
  it('a routine number reads low and a deviant one reads high, once there is a normal to deviate from', () => {
    const s = createInitialState(4);
    // The very first telling of a key is a first: notability 1, regardless of the number.
    const opening = tell(s, { atMs: 0, district: 'farm', line: 'first', picture: 'p', source: 'ledger', facts: { wool: 40 } });
    expect(opening.notability).toBe(1);
    // Warm the trailing mean and variance up on a run of ordinary weeks around 40, wool banked
    // most weeks, before judging anything as routine or deviant against it.
    for (const wool of [41, 39, 42, 38, 40, 41, 39, 42, 38, 40, 41, 39]) {
      tell(s, { atMs: 1, district: 'farm', line: 'warm-up', picture: 'p', source: 'ledger', facts: { wool } });
    }
    // Right on the trailing mean: unremarkable.
    const routine = tell(s, { atMs: 2, district: 'farm', line: 'routine', picture: 'p', source: 'ledger', facts: { wool: 40 } });
    expect(routine.notability).toBeLessThan(0.1);
    // "fourteen wool when you usually get forty" (the plan's own example): a number far from that
    // trailing mean reads as a story, not a fact.
    const deviant = tell(s, { atMs: 3, district: 'farm', line: 'deviant', picture: 'p', source: 'ledger', facts: { wool: 14 } });
    expect(deviant.notability).toBeGreaterThan(0.9);
    expect(deviant.notability).toBeGreaterThan(routine.notability);
  });

  it('a routine number close to, but not exactly, the trailing mean still reads low once the trailing normal has real history behind it', () => {
    const s = createInitialState(20);
    tell(s, { atMs: 0, district: 'farm', line: 'first', picture: 'p', source: 'ledger', facts: { warm: 40 } });
    // Six full cycles of 38..42 (30 tellings): a real spread around 40, unlike the "right on the
    // trailing mean" case above, which warms on the same run of values it is later judged exactly
    // against. This is `MIN_DEVIATION_SAMPLES` worth of history and then some, so the trailing
    // normal is trustworthy by the time the routine value below is judged.
    for (let i = 0; i < 30; i++) {
      const warm = [38, 39, 40, 41, 42][i % 5]!;
      tell(s, { atMs: i + 1, district: 'farm', line: 'warm-up', picture: 'p', source: 'ledger', facts: { warm } });
    }
    // 41 sits well inside the range this key has always shown — a day above the mean, not a story.
    // Before the fix (deviation judged from as few as 2 priors), the still-settling early variance
    // read values like this as 0.39-0.85; the fix requires MIN_DEVIATION_SAMPLES priors first.
    const routine = tell(s, { atMs: 100, district: 'farm', line: 'a bit above the mean', picture: 'p', source: 'ledger', facts: { warm: 41 } });
    expect(routine.notability).toBeLessThan(0.25);
  });

  it('the first flag tells a genuine first apart from a saturated deviation or a hint-1 card, even though all three can read notability 1', () => {
    const s = createInitialState(21);
    const firstBirth = tell(s, { atMs: 0, district: 'farm', line: 'a lamb is born', picture: 'lamb', source: 'ledger', facts: { births: 1 } });
    expect(firstBirth.notability).toBe(1);
    expect(firstBirth.first).toBe(true);

    // Warm 'wool' up on a run around 40, then tell a wildly deviant one: it saturates near 1
    // without being a first, since 'wool' has been told many times before.
    for (const wool of [41, 39, 42, 38, 40, 41, 39, 42, 38, 40, 41, 39]) {
      tell(s, { atMs: 1, district: 'farm', line: 'warm-up', picture: 'p', source: 'ledger', facts: { wool } });
    }
    const deviant = tell(s, { atMs: 2, district: 'farm', line: 'a wild week', picture: 'wool', source: 'ledger', facts: { wool: 14 } });
    expect(deviant.notability).toBeGreaterThan(0.9);
    expect(deviant.first).toBe(false);

    // A card with a maxed-out hint reads notability 1 too, but carries no fact at all to be a
    // first of: a storybook page cannot tell "the world's first X" from "a card author said 1"
    // without this flag.
    const card = tell(s, { atMs: 3, district: 'farm', line: 'a huge card fired', picture: 'p', source: 'card', hint: 1 });
    expect(card.notability).toBe(1);
    expect(card.first).toBe(false);
  });

  it('deviationNotability is 0 at or below no deviation and approaches, but never reaches, 1', () => {
    expect(deviationNotability(0)).toBe(0);
    expect(deviationNotability(-1)).toBe(0);
    expect(deviationNotability(NaN)).toBe(0);
    expect(deviationNotability(1)).toBeGreaterThan(0);
    expect(deviationNotability(1)).toBeLessThan(deviationNotability(3));
    expect(deviationNotability(3)).toBeLessThan(deviationNotability(8));
    // Approaches but never exceeds 1; double precision saturates to exactly 1 well before z gets
    // this large (exp(-z/2) underflows the gap to 1), so this checks the ceiling, not the approach.
    expect(deviationNotability(1000)).toBe(1);
  });

  it('firsts are flagged once: a fact key, and a (fact key, actor) pair, each only the first time', () => {
    const s = createInitialState(5);
    const a = tell(s, { atMs: 0, district: 'farm', line: 'a', picture: 'p', source: 'ledger', facts: { births: 1 } });
    expect(a.notability).toBe(1); // first ever telling of 'births'
    const b = tell(s, { atMs: 1, district: 'farm', line: 'b', picture: 'p', source: 'ledger', facts: { births: 1 } });
    expect(b.notability).toBe(0); // same key again, not a first, and only one prior sample to judge against
    // A new actor's first lamb is a first even though 'births' itself is not new.
    const c = tell(s, { atMs: 2, district: 'farm', line: 'c', picture: 'p', source: 'social', actors: ['sheep-0'], facts: { lambsOf: 1 } });
    expect(c.notability).toBe(1);
    const d = tell(s, { atMs: 3, district: 'farm', line: 'd', picture: 'p', source: 'social', actors: ['sheep-0'], facts: { lambsOf: 1 } });
    expect(d.notability).toBe(0);
    const e = tell(s, { atMs: 4, district: 'farm', line: 'e', picture: 'p', source: 'social', actors: ['sheep-1'], facts: { lambsOf: 1 } });
    expect(e.notability).toBe(1); // a different actor's first, even though 'lambsOf' has been told
  });

  it("card and authored lines pass their hint through notabilityScale, and their own facts can still beat it", () => {
    const s = createInitialState(6);
    const routine = tell(s, { atMs: 0, district: 'farm', line: 'a card fired', picture: 'p', source: 'card', hint: 0.15 });
    expect(routine.notability).toBe(notabilityScale(0.15));
    const clamped = tell(s, { atMs: 1, district: 'farm', line: 'over the top', picture: 'p', source: 'card', hint: 5 });
    expect(clamped.notability).toBe(1);
    const noHint = tell(s, { atMs: 2, district: 'farm', line: 'no hint given', picture: 'p', source: 'authored' });
    expect(noHint.notability).toBe(0);
    // A low-hint authored line whose own fact is a first still reads as notable.
    const firstFact = tell(s, { atMs: 3, district: 'farm', line: 'a first, gently authored', picture: 'p', source: 'authored', hint: 0.05, facts: { rareEvent: 1 } });
    expect(firstFact.notability).toBe(1);
  });

  it('a string fact only ever contributes a first-occurrence check, never a deviation', () => {
    const s = createInitialState(7);
    const first = tell(s, { atMs: 0, district: 'farm', line: 'the weather turned rain', picture: 'p', source: 'ledger', facts: { weather: 'rain' } });
    expect(first.notability).toBe(1);
    const again = tell(s, { atMs: 1, district: 'farm', line: 'the weather turned rain', picture: 'p', source: 'ledger', facts: { weather: 'rain' } });
    expect(again.notability).toBe(0);
    const snow = tell(s, { atMs: 2, district: 'farm', line: 'the weather turned snow', picture: 'p', source: 'ledger', facts: { weather: 'snow' } });
    expect(snow.notability).toBe(0); // 'weather' the key was already seen; only the key, not the value, is tracked
  });
});

describe('chronicleBetween: the read API', () => {
  it('filters by time (either order), sorts by notability, and honours limit', () => {
    const s = createInitialState(8);
    const low = tell(s, { atMs: 100, district: 'farm', line: 'low', picture: 'p', source: 'card', hint: 0.1 });
    const high = tell(s, { atMs: 200, district: 'farm', line: 'high', picture: 'p', source: 'card', hint: 0.9 });
    const mid = tell(s, { atMs: 300, district: 'farm', line: 'mid', picture: 'p', source: 'card', hint: 0.5 });
    tell(s, { atMs: 9999, district: 'farm', line: 'out of range', picture: 'p', source: 'card', hint: 1 });

    expect(chronicleBetween(s, 100, 300)).toEqual([high, mid, low]);
    expect(chronicleBetween(s, 300, 100)).toEqual([high, mid, low]); // order of the two times does not matter
    expect(chronicleBetween(s, 100, 300, 2)).toEqual([high, mid]);
    expect(chronicleBetween(s, 100, 300, 0)).toEqual([]);
    expect(chronicleBetween(s, 150, 250)).toEqual([high]);
    expect(chronicleBetween(s, 0, 0)).toEqual([]);

    // A read never mutates the store.
    const before = s.chronicle.entries.length;
    chronicleBetween(s, 0, 100_000);
    expect(s.chronicle.entries).toHaveLength(before);
  });

  it('ties on notability break by time, then by id', () => {
    const s = createInitialState(9);
    const a = tell(s, { atMs: 50, district: 'farm', line: 'a', picture: 'p', source: 'card', hint: 0.5 });
    const b = tell(s, { atMs: 10, district: 'farm', line: 'b', picture: 'p', source: 'card', hint: 0.5 });
    const c = tell(s, { atMs: 10, district: 'farm', line: 'c', picture: 'p', source: 'card', hint: 0.5 });
    expect(chronicleBetween(s, 0, 100)).toEqual([b, c, a]);
  });
});

describe('tellLedgerDiff', () => {
  it('tells one entry per number the diff moved, with that number in facts, and nothing for a quiet span', () => {
    const before = summarise(createInitialState(10));
    const after = { ...before, banks: { wool: 3, coins: -7, owned: [...before.banks.owned, 'flowerbed'] }, wool: [...before.wool, 0.05], lambs: [{ mother: 1, ageMs: 100 }], weather: { ...before.weather, kind: 'snow' as const, rain: false }, season: { ...before.season, override: 'winter' as const } };
    const diff = diffLedger(before, after);
    const s = createInitialState(10);
    const entries = tellLedgerDiff(s, diff);
    expect(entries.map((e) => e.picture)).toEqual(['lamb', 'grown-lamb', 'wool', 'coins', 'weather-snow', 'season-winter', 'upgrade']);
    expect(entries.every((e) => e.source === 'ledger')).toBe(true);
    expect(entries.every((e) => e.district === 'farm')).toBe(true);
    expect(entries.find((e) => e.picture === 'wool')?.facts).toEqual({ wool: diff.wool });
    expect(entries.find((e) => e.picture === 'coins')?.facts).toEqual({ coins: diff.coins });
    expect(entries.find((e) => e.picture === 'coins')?.line).toBe('7 coins spent');
    expect(entries.find((e) => e.picture === 'upgrade')?.facts).toEqual({ upgrade: 'flowerbed' });
    expect(s.chronicle.entries).toEqual(entries);

    const quiet = diffLedger(before, before);
    expect(tellLedgerDiff(createInitialState(10), quiet)).toEqual([]);
  });

  it('catchUp tells its diff onto the carried-over chronicle for a ledger-resolution gap, and not for a same-day one', () => {
    // The engine off: this is about what `catchUp` tells, and a card firing during the actor
    // remainder of the gap would add entries of its own to both sides of the comparison.
    const s = preEngine(11);
    tell(s, { atMs: 0, district: 'farm', line: 'the world began', picture: 'p', source: 'authored', hint: 0.5 });
    const short = catchUp(s, DAY - 1000);
    expect(short.mode).toBe('actors');
    expect(short.state.chronicle.entries).toEqual(s.chronicle.entries); // no ledger diff was told

    const long = catchUp(s, 10 * DAY);
    expect(long.mode).toBe('ledger');
    expect(long.state.chronicle.entries.length).toBeGreaterThan(s.chronicle.entries.length);
    expect(long.state.chronicle.entries.slice(0, s.chronicle.entries.length)).toEqual(s.chronicle.entries); // carried over, not dropped
    const told = long.state.chronicle.entries.slice(s.chronicle.entries.length);
    expect(told.length).toBeGreaterThan(0);
    for (const e of told) expect(e.atMs).toBe(long.after.clock.nowMs);
  });
});

describe('respawn: the chronicle survives a district leave and return', () => {
  it('summarise, then respawn on the outgoing chronicle, carries the log forward rather than dropping it', () => {
    const s = createInitialState(17);
    tell(s, { atMs: 0, district: 'farm', line: 'the world began', picture: 'p', source: 'authored', hint: 0.5 });
    tell(s, { atMs: 1, district: 'farm', line: '2 wool banked', picture: 'wool', source: 'ledger', facts: { wool: 2 } });
    expect(s.chronicle.entries).toHaveLength(2);

    // The plan's Layer-2 flow: a district is summarised to numbers when nobody is watching, and
    // respawned onto its own field when someone returns — not only the offline catch-up path.
    const L = summarise(s);
    const back = respawn(L, s.chronicle);
    expect(back.chronicle.entries).toEqual(s.chronicle.entries);
    // A real deep copy: telling on the respawned world never touches the state it came from.
    tell(back, { atMs: 2, district: 'farm', line: 'settled back in', picture: 'p', source: 'authored', hint: 0.1 });
    expect(back.chronicle.entries).toHaveLength(3);
    expect(s.chronicle.entries).toHaveLength(2);
  });

  it('a fresh, empty chronicle is still a choice a caller has to make, not a silent default', () => {
    const s = createInitialState(18);
    tell(s, { atMs: 0, district: 'farm', line: 'a', picture: 'p', source: 'authored' });
    const L = summarise(s);
    const fresh = respawn(L, createChronicle());
    expect(fresh.chronicle.entries).toEqual([]);
  });
});

describe('determinism', () => {
  it('the same sequence of tells, from the same starting state, gives the same entries and the same hash', () => {
    const run = (): SimState => {
      const s0 = createInitialState(12);
      tell(s0, { atMs: 0, district: 'farm', line: 'a', picture: 'p', source: 'ledger', facts: { wool: 5 } });
      const s = advance(s0, 50);
      tell(s, { atMs: s.clock.nowMs, district: 'farm', line: 'b', picture: 'p', source: 'social', actors: ['sheep-0', 'sheep-1'], facts: { bondStrength: 0.4 } });
      return s;
    };
    const a = run();
    const b = run();
    expect(a.chronicle.entries).toEqual(b.chronicle.entries);
    expect(hashState(a)).toBe(hashState(b));
  });

  it("catchUp's told entries are a function of the state and the gap alone", () => {
    const s = advance(createInitialState(13), 50);
    const gap = 6 * DAY + 4_000;
    const a = catchUp(s, gap);
    const b = catchUp(s, gap);
    expect(a.state.chronicle.entries).toEqual(b.state.chronicle.entries);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});

describe('the size of a year of entries', () => {
  it('a year of ledger-only history (five sheep, daily catch-ups) stays a reasonable size', () => {
    let s = createInitialState(14);
    for (let day = 0; day < 365; day++) {
      s = catchUp(s, DAY).state;
    }
    const bytes = JSON.stringify(s.chronicle.entries).length;
    const perEntry = bytes / Math.max(1, s.chronicle.entries.length);
    console.log(`chronicle: a year of daily catch-ups on a 5-sheep farm told ${s.chronicle.entries.length} entries, ${bytes} bytes (${perEntry.toFixed(0)} bytes/entry)`);
    // Generous, not tight: a year of a single small district's ledger history should stay well
    // under a megabyte of JSON. The event engine and social graph tickets will add far more
    // tellings per day than the Ledger alone does; this bound is for this ticket's own path.
    expect(bytes).toBeLessThan(1_000_000);
  });
});

// The unwatched draw, rule by rule (#101): what `ledger/unwatched.ts` does with no actors in the
// room. `engine-pace.test.ts` measures the population; this pins the mechanism against stub decks,
// where one card with known conditions says exactly what the engine decided and why.
import { describe, expect, it } from 'vitest';
import { createChronicle } from '../src/chronicle/store';
import { loadDeck, type Deck } from '../src/engine/deck';
import { createEvents } from '../src/engine/events';
import { PACING, SIZE_PACING, UNWATCHED_LOOK_SIM_MINUTES, WARMUP_SIM_MINUTES } from '../src/engine/pacing';
import { advanceLedger } from '../src/ledger/advance';
import { catchUp } from '../src/ledger/catch-up';
import { dayMs, summarise, type Ledger } from '../src/ledger/ledger';
import { advanceUnwatched, unwatchedCeiling } from '../src/ledger/unwatched';
import { cloneRng } from '../src/rng';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';
import { stubDeck, type StubCard } from './engine-helpers';

const DAY = 180_000;

/** A ledger from a world that has already run a farm day, so the warm-up is behind it. */
function ledgerOf(seed: number, days = 1): Ledger {
  return summarise(advance(createInitialState(seed), (days * DAY) / 100));
}

/** Run one unwatched span against a stub deck, from a fresh engine slice. */
function run(ledger: Ledger, spanMs: number, deck: Deck, seed = 1) {
  const events = createEvents(seed, ledger.clock.nowMs);
  const log = { chronicle: createChronicle() };
  const out = advanceUnwatched(ledger, spanMs, cloneRng({ s: 1 } as never), events, log, deck);
  return { ...out, events, log };
}

describe('the unwatched span moves the Ledger exactly as advanceLedger would', () => {
  it('the numbers are bit-for-bit the ones the Ledger alone produces, with or without a draw', () => {
    // This is the load-bearing claim of the whole file: the unwatched draw *reads* the Ledger and
    // *tells* the chronicle, and the only Ledger number it may move is one a `coins` hook names. So
    // every Ledger round-trip pin in `ledger.test.ts` still stands after #101, and a catch-up's
    // wool, grass, flock and merchant timer are what they always were.
    for (const seed of [3, 7, 11, 19]) {
      const before = ledgerOf(seed);
      const plain = advanceLedger(before, 5 * DAY, cloneRng(createInitialState(seed).rng));
      // A deck of one card that changes nothing but its own chronicle line.
      const deck = stubDeck([{ id: 'quiet', size: 'small' }]);
      const events = createEvents(seed, before.clock.nowMs);
      const log = { chronicle: createChronicle() };
      const drawn = advanceUnwatched(before, 5 * DAY, cloneRng(createInitialState(seed).rng), events, log, deck);
      expect(drawn.ledger.wool, `seed ${seed}`).toEqual(plain.wool);
      expect(drawn.ledger.grass, `seed ${seed}`).toEqual(plain.grass);
      expect(drawn.ledger.lambs, `seed ${seed}`).toEqual(plain.lambs);
      expect(drawn.ledger.banks, `seed ${seed}`).toEqual(plain.banks);
      expect(drawn.ledger.clock, `seed ${seed}`).toEqual(plain.clock);
      expect(drawn.ledger.weather, `seed ${seed}`).toEqual(plain.weather);
      expect(drawn.ledger.merchantAtMs, `seed ${seed}`).toBe(plain.merchantAtMs);
    }
  });

  it('a span of zero runs nothing, and a bad span throws rather than looping', () => {
    const before = ledgerOf(5);
    const out = run(before, 0, stubDeck([{ id: 'a' }]));
    expect(out.drawn).toEqual([]);
    expect(out.looks).toBe(0);
    expect(() => run(before, NaN, stubDeck([{ id: 'a' }]))).toThrow(/finite non-negative/);
    expect(() => run(before, -1, stubDeck([{ id: 'a' }]))).toThrow(/finite non-negative/);
  });

  it('the engine off draws nothing at all: the pre-engine world, across a gap too', () => {
    const before = ledgerOf(5);
    const events = createEvents(5, before.clock.nowMs, false);
    const log = { chronicle: createChronicle() };
    const out = advanceUnwatched(before, 10 * DAY, cloneRng(createInitialState(5).rng), events, log, stubDeck([{ id: 'a', size: 'small', base: 100 }]));
    expect(out.drawn).toEqual([]);
    expect(out.looks).toBe(0);
    expect(log.chronicle.entries).toEqual([]);
  });
});

describe('big things never draw while nobody is watching', () => {
  it('a deck of nothing but big cards draws nothing across a month away', () => {
    // The hard invariant, at its plainest: a card that would be certain to draw if it were small
    // draws not once in thirty farm days because it is big.
    const deck = stubDeck([{ id: 'huge', size: 'big', base: 100, minGapSimMinutes: 0, cooldownSimHours: 0 }]);
    const out = run(ledgerOf(2), 30 * DAY, deck);
    expect(out.drawn).toEqual([]);
    expect(out.looks).toBeGreaterThan(500);
  });

  it('a big authored event whose trigger is always met never starts either', () => {
    const deck = stubDeck([], [{ id: 'always', size: 'big', trigger: { kind: 'predicates', all: [], cooldownSimDays: 0 } }]);
    const out = run(ledgerOf(2), 10 * DAY, deck);
    expect(out.drawn).toEqual([]);
  });

  it('but a small authored event on the same trigger does, at Ledger level', () => {
    // The other half of the same rule, and the reason the authored loop is implemented here rather
    // than skipped: a small authored event is not a set piece and there is no reason a week away
    // should not hold one. Nothing in the shipped deck is small-and-authored today, so this is the
    // only thing exercising that path — without it, adding one would be a silent never-fires.
    const deck = stubDeck([], [{ id: 'always', size: 'small', trigger: { kind: 'predicates', all: [], cooldownSimDays: 1 } }]);
    const out = run(ledgerOf(2), 10 * DAY, deck);
    expect(out.drawn.length).toBeGreaterThan(0);
    expect(out.drawn.every((d) => d.id === 'always' && d.kind === 'authored')).toBe(true);
    // Its own cooldown holds it apart: one a farm day at `cooldownSimDays: 1`, not one a look.
    expect(out.drawn.length).toBeLessThanOrEqual(10);
  });
});

describe('what an unwatched look reads, and what it does not', () => {
  it('the actor predicates read false: no flock to scatter, no NPC in the field', () => {
    for (const on of ['flockScattered', 'dlFarFromFlock', 'lambFarFromMother', 'merchantPresent', 'farmerPresent']) {
      const deck = stubDeck([{ id: 'needsIt', size: 'small', base: 100, conditions: [{ on, op: 'eq', value: true }], minGapSimMinutes: 0, cooldownSimHours: 0 }]);
      const out = run(ledgerOf(4), 20 * DAY, deck);
      expect(out.drawn, `${on} should never hold with no actors in the room`).toEqual([]);
    }
  });

  it('the Ledger readings do hold, and a card conditioned on one draws', () => {
    const deck = stubDeck([
      { id: 'anyFlock', size: 'small', base: 100, conditions: [{ on: 'ledger.flock', op: 'gte', value: 1 }], minGapSimMinutes: 0, cooldownSimHours: 0 },
    ]);
    const out = run(ledgerOf(4), 20 * DAY, deck);
    expect(out.drawn.length).toBeGreaterThan(0);
  });

  it('the time band moves between looks, so all four get their turn across a span', () => {
    // One card per band, each impossible outside it. A span of several farm days must draw all four,
    // which is what one look a farm hour buys over one look a farm day.
    const bands: StubCard[] = ['dawn', 'day', 'dusk', 'night'].map((band) => ({
      id: `at-${band}`,
      size: 'small' as const,
      base: 100,
      conditions: [{ on: 'timeOfDay', op: 'eq', value: band }],
      momentKind: `k-${band}`,
      minGapSimMinutes: 0,
      cooldownSimHours: 0,
    }));
    const out = run(ledgerOf(6), 20 * DAY, stubDeck(bands));
    expect(new Set(out.drawn.map((d) => d.id))).toEqual(new Set(['at-dawn', 'at-day', 'at-dusk', 'at-night']));
  });

  it('the warm-up and the small gap hold here exactly as they do live', () => {
    // A fresh world's Ledger, at clock zero: nothing draws until the warm-up is behind it.
    const fresh = summarise(createInitialState(8));
    expect(fresh.clock.nowMs).toBe(0);
    const deck = stubDeck([{ id: 'a', size: 'small', base: 100, minGapSimMinutes: 0, cooldownSimHours: 0 }]);
    const early = run(fresh, (WARMUP_SIM_MINUTES * DAY) / 1440 - 1, deck);
    expect(early.drawn).toEqual([]);
    // And over a long span, two draws are never closer than the small gap.
    const out = run(ledgerOf(8), 20 * DAY, deck);
    expect(out.drawn.length).toBeGreaterThan(2);
    for (let i = 1; i < out.drawn.length; i++) {
      const gapSimMinutes = ((out.drawn[i]!.atMs - out.drawn[i - 1]!.atMs) / DAY) * 1440;
      expect(gapSimMinutes).toBeGreaterThanOrEqual(SIZE_PACING.small.gapSimMinutes);
    }
  });

  it('the roll-first shortcut is exact: its ceiling is never beaten by a real look', () => {
    // `look` rolls one number against `unwatchedCeiling(deck)` before it reads a condition, and only
    // a roll under the ceiling costs a real evaluation. That is only sound if no actual draw chance
    // can exceed the ceiling — checked here against the whole shipped deck eligible at once, which
    // is more than any real look can find.
    const ceiling = unwatchedCeiling();
    expect(ceiling).toBeGreaterThan(0);
    expect(ceiling).toBeLessThanOrEqual(PACING.maxDrawChance);
    // A stub deck of one enormous card: its own ceiling still bounds its own chance.
    const deck = stubDeck([{ id: 'big', size: 'small', base: 100, multipliers: [{ when: { on: 'ledger.flock', op: 'gte', value: 0 }, times: 5 }] }]);
    expect(unwatchedCeiling(deck)).toBeGreaterThanOrEqual(
      Math.min(PACING.maxDrawChance, (500 / 10) * SIZE_PACING.small.perFarmDay * (UNWATCHED_LOOK_SIM_MINUTES / 1440)),
    );
  });
});

describe('hooks at Ledger level: a stock moves, an actor does not', () => {
  it('a coins hook moves the bank; spawn, flag, visibility and mood are recorded and nothing else', () => {
    const deck = stubDeck([
      {
        id: 'rich',
        size: 'small',
        base: 100,
        minGapSimMinutes: 0,
        cooldownSimHours: 0,
        start: [
          { op: 'coins', delta: 7 },
          { op: 'spawn', what: 'cat', at: 'fence' },
          { op: 'flag', name: 'fog', value: true },
          { op: 'setVisibility', value: 0.4 },
          { op: 'mood', target: 'flock', delta: 1 },
        ],
        end: [{ op: 'flag', name: 'fog', value: false }],
      },
    ]);
    const before = ledgerOf(13);
    // The Ledger's own arithmetic pays the farm too (the merchant buys the wool as the days pass),
    // so the comparison is against the same span with no cards in it, not against the starting bank.
    const plain = advanceLedger(before, 10 * DAY, cloneRng({ s: 1 } as never));
    const out = run(before, 10 * DAY, deck);
    expect(out.drawn.length).toBeGreaterThan(0);
    for (const d of out.drawn) {
      expect(d.applied).toEqual(['coins']);
      expect([...d.recorded].sort()).toEqual(['flag', 'flag', 'mood', 'setVisibility', 'spawn']);
    }
    expect(out.ledger.banks.coins).toBe(plain.banks.coins + 7 * out.drawn.length);
    // Nothing the engine slice carries about the *scene* moved: no flag, no visibility, no mood.
    expect(out.events.flags).toEqual({});
    expect(out.events.visibility).toBe(1);
    expect(out.events.mood).toBe(0);
  });

  it('an unwatched moment leaves nothing running for the respawned world to trip over', () => {
    const deck = stubDeck([{ id: 'a', size: 'small', base: 100, durationSimMinutes: 600, minGapSimMinutes: 0, cooldownSimHours: 4 }]);
    const out = run(ledgerOf(14), 10 * DAY, deck);
    expect(out.drawn.length).toBeGreaterThan(0);
    expect(out.events.running).toEqual([]);
    // But its cooldown is set from the end its duration would have had, so it cannot repeat at once.
    expect(out.events.cooldowns['a']).toBeGreaterThan(out.drawn[out.drawn.length - 1]!.atMs);
  });
});

describe('catchUp carries the unwatched span into the world that comes back', () => {
  it('the drawn moments are on the returned state’s chronicle, in time order, before the ledger diff', () => {
    const s = advance(createInitialState(21), 1800);
    const before = s.chronicle.entries.length;
    const c = catchUp(s, 6 * dayMs(s));
    expect(c.mode).toBe('ledger');
    expect(c.unwatched.length).toBeGreaterThan(0);
    const fresh = c.state.chronicle.entries.slice(before);
    // Everything the outgoing world had told is carried forward untouched.
    expect(c.state.chronicle.entries.slice(0, before)).toEqual(s.chronicle.entries);
    // The unwatched moments are told in time order, and each `atMs` sits inside the gap.
    const drawnTimes = c.unwatched.map((d) => d.atMs);
    expect([...drawnTimes].sort((a, b) => a - b)).toEqual(drawnTimes);
    for (const t of drawnTimes) {
      expect(t).toBeGreaterThan(s.clock.nowMs);
      expect(t).toBeLessThanOrEqual(c.state.clock.nowMs);
    }
    expect(fresh.length).toBeGreaterThanOrEqual(c.unwatched.length);
  });

  it('the same state and the same gap give the same unwatched span, twice', () => {
    const s = advance(createInitialState(22), 1800);
    const a = catchUp(s, 9 * dayMs(s));
    const b = catchUp(s, 9 * dayMs(s));
    expect(a.unwatched).toEqual(b.unwatched);
    expect(a.state.chronicle.entries).toEqual(b.state.chronicle.entries);
  });

  it('a longer gap holds at least as much as a shorter one, and never fewer things', () => {
    const s = advance(createInitialState(23), 1800);
    const short = catchUp(s, 3 * dayMs(s));
    const long = catchUp(s, 12 * dayMs(s));
    expect(long.unwatched.length).toBeGreaterThan(short.unwatched.length);
  });

  it('the returned world picks the engine up where the unwatched days left it', () => {
    // Cooldowns and gaps set while nobody was watching are on the respawned world's engine slice,
    // so the first thing to happen after the player comes back is not a repeat of the last thing
    // that happened while they were away.
    const s = advance(createInitialState(24), 1800);
    const c = catchUp(s, 5 * dayMs(s));
    const last = c.unwatched[c.unwatched.length - 1];
    expect(last).toBeDefined();
    expect(c.state.events.starts[last!.id]).toBe(last!.atMs);
    expect(c.state.events.lastMomentKind).not.toBeNull();
  });
});

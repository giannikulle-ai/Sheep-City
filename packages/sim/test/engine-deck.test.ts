// The deck loader (#40): the world lane's JSON is the contract, and anything this engine could not
// evaluate has to fail at load, not quietly never fire.
import { describe, expect, it } from 'vitest';
import { EVENT_HOOK_OPS, FARM_DECK, loadDeck, momentKindOf, PREDICATE_ON, PREDICATE_OPS } from '../src/engine/deck';
import { readPredicate, viewOf } from '../src/engine/view';
import { createInitialState } from '../src/state';
import { stubDeck } from './engine-helpers';

describe('the farm deck loads from the world lane’s data', () => {
  it('is the fifteen cards and the three authored events, with disjoint ids', () => {
    expect(FARM_DECK.district).toBe('farm');
    expect(FARM_DECK.cards).toHaveLength(15);
    expect(FARM_DECK.authored).toHaveLength(3);
    expect(FARM_DECK.byId.size).toBe(18);
    expect(FARM_DECK.authored.map((e) => e.id)).toEqual(['dlBirthday', 'cliffStorm', 'firstSnowOfSeason']);
  });

  it('every card the engine will draw is one it can evaluate: known predicates, operators and hook ops', () => {
    for (const card of FARM_DECK.cards) {
      for (const c of [...card.conditions, ...card.weight.multipliers.map((m) => m.when)]) {
        expect(PREDICATE_ON, card.id).toContain(c.on);
        expect(PREDICATE_OPS, card.id).toContain(c.op);
      }
      for (const hook of [...card.hooks.start, ...card.hooks.end]) expect(EVENT_HOOK_OPS, card.id).toContain(hook.op);
      expect(card.durationSimMinutes, card.id).toBeGreaterThan(0);
      expect(card.weight.base, card.id).toBeGreaterThan(0);
    }
  });

  it('the four reference cards and the three reference authored events are the ones the ticket names', () => {
    for (const id of ['fogMorning', 'lostLamb', 'merchantCaravan', 'shearingDay']) expect(FARM_DECK.byId.get(id)?.kind).toBe('card');
    for (const id of ['dlBirthday', 'cliffStorm', 'firstSnowOfSeason']) expect(FARM_DECK.byId.get(id)?.kind).toBe('authored');
  });

  it('the shipped deck loads with dlBirthday parked: a known trigger kind this engine defers to #84', () => {
    // Trunk's #83 moved Digital Luna's birthday onto a `realDate` trigger (December 15, the owner's
    // calendar decision). This engine cannot answer "is it December 15?" without the real-year
    // calendar model, which is #84's — so the deck loads it *deferred* rather than throwing, and
    // `triggerMet` is false for it until #84 lands. Three separate facts, pinned here and in
    // `engine-events.test.ts`: the deck loads, the event is marked, and an unknown kind still
    // throws (below).
    const birthday = FARM_DECK.byId.get('dlBirthday');
    expect(birthday?.kind).toBe('authored');
    const event = birthday!.kind === 'authored' ? birthday!.event : null;
    expect(event!.trigger).toEqual({ kind: 'realDate', month: 12, day: 15 });
    expect(event!.deferred).toEqual({ kind: 'realDate', ticket: '#84' });
    // Nothing else in the shipped deck is parked: the storm and the first snow are evaluated today.
    const parked = FARM_DECK.authored.filter((e) => e.deferred).map((e) => e.id);
    expect(parked).toEqual(['dlBirthday']);
  });

  it('momentKindOf reads a moment kind off either half of the deck, and null for a stranger', () => {
    expect(momentKindOf('lostLamb')).toBe('lamb');
    expect(momentKindOf('cliffStorm')).toBe('weather');
    expect(momentKindOf('nothingLikeThis')).toBeNull();
  });

  it('every predicate this engine names is one `readPredicate` answers', () => {
    // Not a tautology: `PREDICATE_ON` is this package's list and the loader checks the data against
    // it, but nothing above proves the reader has a branch for each name. This does — a missing one
    // throws out of `readPredicate`'s exhaustive default.
    const view = viewOf(createInitialState(1));
    for (const on of PREDICATE_ON) {
      expect(['string', 'number', 'boolean'], on).toContain(typeof readPredicate(view, on));
    }
  });
});

describe('the loader refuses what the engine could not evaluate', () => {
  const ok = { district: 'farm', timeScale: { simMinutesPerDay: 1440, simHoursPerDay: 24, realSecondsPerSimDayWatching: 180 }, events: [] };

  it('an unknown predicate, operator, hook op or trigger kind', () => {
    expect(() => stubDeck([{ id: 'a', conditions: [{ on: 'moonPhase', op: 'eq', value: 1 }] }])).toThrow(/not a predicate/);
    expect(() => stubDeck([{ id: 'a', conditions: [{ on: 'season', op: 'about', value: 1 }] }])).toThrow(/not an operator/);
    expect(() => stubDeck([{ id: 'a', start: [{ op: 'smite', target: 'dl' }] }])).toThrow(/not a hook op/);
    expect(() => stubDeck([], [{ id: 'x', trigger: { kind: 'vibes' } }])).toThrow(/not a trigger kind/);
  });

  it('a deferred kind is loaded, but a malformed one of the same kind still throws', () => {
    // Deferring `realDate` (#84) is not the same as not reading it: the shape is still checked at
    // load, so a typo in the world lane's data is caught here rather than at whatever future tick
    // #84's calendar first looks at it.
    const parked = stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 12, day: 15 } }]);
    expect(parked.authored[0]!.deferred).toEqual({ kind: 'realDate', ticket: '#84' });
    expect(() => stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 13, day: 15 } }])).toThrow(/month 1-12/);
    expect(() => stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 12, day: 0 } }])).toThrow(/day 1-31/);
    expect(() => stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 'December', day: 15 } }])).toThrow(/finite number/);
    // And a `simDate` fraction outside [0, 1) — the shape the world lane's #83 schema now uses.
    expect(() => stubDeck([], [{ id: 'x', trigger: { kind: 'simDate', season: 'spring', dayOfSeason: 1 } }])).toThrow(/fraction of the season/);
  });

  it('a value of the wrong shape for its operator, and a weight or duration that is not positive', () => {
    expect(() => stubDeck([{ id: 'a', conditions: [{ on: 'season', op: 'in', value: 'spring' }] }])).toThrow(/needs an array/);
    expect(() => stubDeck([{ id: 'a', conditions: [{ on: 'ledger.wool', op: 'gte', value: 'lots' }] }])).toThrow(/needs a number/);
    expect(() => stubDeck([{ id: 'a', base: 0 }])).toThrow(/positive number/);
    expect(() => stubDeck([{ id: 'a', durationSimMinutes: 0 }])).toThrow(/positive number/);
  });

  it('a duplicate id, or an authored id that is already a card id', () => {
    expect(() => stubDeck([{ id: 'a' }, { id: 'a' }])).toThrow(/duplicate id/);
    expect(() => stubDeck([{ id: 'a' }], [{ id: 'a', trigger: { kind: 'simDate', season: 'spring', dayOfSeason: 0 } }])).toThrow(/already a card id/);
  });

  it('two files for different districts', () => {
    expect(() => loadDeck(ok, { ...ok, district: 'wildwood' })).toThrow(/authored events are for/);
  });
});

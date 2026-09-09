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

  it('the shipped deck loads dlBirthday with a live realDate trigger, and nothing is parked (#84)', () => {
    // Trunk's #83 moved Digital Luna's birthday onto a `realDate` trigger (December 15, the owner's
    // calendar decision). Between #40 and #84 this engine could not answer "is it December 15?" —
    // it had no real calendar — so the deck loaded the event *deferred* and `triggerMet` was false
    // for it every time. #84 gave the sim a real calendar (src/calendar.ts) and a real epoch on
    // every world, so the deferral is gone along with the `deferred` field itself.
    //
    // PIN MOVED (#84). Before: `expect(event!.deferred).toEqual({ kind: 'realDate', ticket: '#84' })`
    // and `expect(FARM_DECK.authored.filter((e) => e.deferred).map((e) => e.id)).toEqual(['dlBirthday'])`.
    // The reason is the ticket: nothing is parked any more, and there is no `deferred` field to
    // read. The trigger itself is pinned unchanged.
    const birthday = FARM_DECK.byId.get('dlBirthday');
    expect(birthday?.kind).toBe('authored');
    const event = birthday!.kind === 'authored' ? birthday!.event : null;
    expect(event!.trigger).toEqual({ kind: 'realDate', month: 12, day: 15 });
    // Every authored event in the shipped deck now carries a trigger kind this engine evaluates.
    expect(FARM_DECK.authored.map((e) => e.trigger.kind).sort()).toEqual(['predicates', 'realDate', 'stockThreshold']);
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

  it('a realDate trigger loads with its shape checked, and a malformed one still throws', () => {
    // PIN MOVED (#84). Before: this case was called "a deferred kind is loaded ..." and asserted
    // `loaded.authored[0]!.deferred` equalled `{ kind: 'realDate', ticket: '#84' }`. The reason is
    // the ticket: `realDate` is evaluated now, so nothing is deferred and the field is gone. What
    // it was really guarding — that the shape is still checked at load, so a typo in the world
    // lane's data is caught here rather than at whatever tick the calendar first looks at it —
    // is unchanged and is everything below.
    const loaded = stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 12, day: 15 } }]);
    expect(loaded.authored[0]!.trigger).toEqual({ kind: 'realDate', month: 12, day: 15 });
    expect(stubDeck([], [{ id: 'x', trigger: { kind: 'realDate', month: 12, day: 15, windowSimMinutes: 90 } }]).authored[0]!.trigger).toEqual({
      kind: 'realDate',
      month: 12,
      day: 15,
      windowSimMinutes: 90,
    });
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

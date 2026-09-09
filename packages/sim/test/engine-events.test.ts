// Authored events, hooks, the four reference cards, and what all of them write to the chronicle
// (#40). The authored half is the plan's punctuation: it fires on its own trigger, it outranks the
// cards it names while it runs, and the owner can start and reset it by intent.
import { describe, expect, it } from 'vitest';
import { MS_PER_REAL_DAY, realMsOfCivil } from '../src/calendar';
import { seasonSpanOf } from '../src/clock';
import { fillStorybookLine } from '../src/chronicle/storybook-line';
import { FARM_DECK } from '../src/engine/deck';
import { applyAuthoredIntent, dayOfSeason, eligibleCards, endEvent, evaluate, preemptedByAuthored, readyAuthored, seasonDayOfFraction, seasonFraction, startEvent, triggerMet } from '../src/engine/engine';
import { MOOD_RANGE } from '../src/engine/events';
import { findLostLamb, REFERENCE_RULES, runHook } from '../src/engine/hooks';
import { PACING, simMinutesToMs } from '../src/engine/pacing';
import { lambDistance, PREDICATE_RULES, readPredicate, viewOf } from '../src/engine/view';
import { tickSheep } from '../src/behaviours/sheep';
import { applyIntent } from '../src/intents';
import { createInitialState, type Lamb, type SimState } from '../src/state';
import { step } from '../src/step';
import { advance, tickInPlace } from '../src/tick';
import { atMs, stubDeck } from './engine-helpers';
import { world } from './luna-helpers';

const PERIOD = 180;
const minutes = (n: number): number => simMinutesToMs(n, PERIOD);

/**
 * Put a world on a real instant without moving its sim clock. The calendar reads
 * `realEpochMs + elapsedMs` (clock.ts), so moving the epoch moves the world's real date and
 * nothing else: the engine's own gaps and cooldowns live on `clock.nowMs` and stay where they were.
 */
function at(s: SimState, realMs: number): void {
  s.season = { ...s.season, realEpochMs: realMs - s.season.elapsedMs };
}

function card(id: string) {
  const entry = FARM_DECK.byId.get(id);
  if (!entry || entry.kind !== 'card') throw new Error(`no card ${id}`);
  return entry.card;
}

describe('authored triggers', () => {
  it('a real date (DL’s birthday, December 15) is met on that real day and on no other', () => {
    // The owner's calendar decision (plan section 2 and decision 10): Digital Luna's birthday is
    // December 15, a real calendar date, not a point in the sim's own season wheel. The world lane
    // put the event on a `realDate` trigger in #83; #84 gave the sim the real calendar to read it
    // against (src/calendar.ts) and a real epoch on every world (`Season.realEpochMs`).
    //
    // PIN MOVED (#84). Before, this case was called "... is loaded, marked deferred to #84, and
    // never fires" and asserted `birthday.deferred` equalled `{ kind: 'realDate', ticket: '#84' }`
    // and that `triggerMet(...)` was **false** at every point of the four-season wheel. The reason
    // is the ticket: the trigger is evaluated now, so "never fires" is the thing that had to stop
    // being true.
    const birthday = FARM_DECK.authored.find((e) => e.id === 'dlBirthday')!;
    expect(birthday.trigger.kind).toBe('realDate');
    const s = createInitialState(1, { events: false });
    // Off the date: the default epoch is April 1, and a handful of other real days.
    expect(triggerMet(s, viewOf(s), birthday)).toBe(false);
    for (const [month, day] of [
      [12, 14],
      [12, 16],
      [11, 15],
      [1, 15],
      [6, 21],
    ] as const) {
      at(s, realMsOfCivil(2026, month, day) + 3 * 3_600_000);
      expect(triggerMet(s, viewOf(s), birthday), `${month}/${day}`).toBe(false);
    }
    // On it: the whole real day counts, midnight to a millisecond before the next midnight.
    for (const intoDay of [0, 1, 12 * 3_600_000, MS_PER_REAL_DAY - 1]) {
      at(s, realMsOfCivil(2026, 12, 15) + intoDay);
      expect(triggerMet(s, viewOf(s), birthday), `+${intoDay} ms`).toBe(true);
    }
    // And in a different real year, on the same date.
    at(s, realMsOfCivil(2031, 12, 15));
    expect(triggerMet(s, viewOf(s), birthday)).toBe(true);
    // The owner's own hand still starts it whatever the date — `applyAuthoredIntent` ignores the
    // trigger by design — which is how the birthday is exercised out of season.
    const owned = createInitialState(1, { events: false });
    applyAuthoredIntent(owned, 'dlBirthday', 'trigger', FARM_DECK);
    expect(owned.events.running.map((r) => r.id)).toContain('dlBirthday');
  });

  it('a realDate window narrows the door from the whole real day to windowSimMinutes', () => {
    // Optional on the trigger and unused by the shipped deck, so this is where it is pinned. The
    // window is measured in sim minutes from UTC midnight, which is the same count of real
    // milliseconds under the host's one-to-one mapping.
    const deck = stubDeck([{ id: 'c' }], [{ id: 'noonish', trigger: { kind: 'realDate', month: 12, day: 15, windowSimMinutes: 90 } }]);
    const event = deck.authored[0]!;
    const s = createInitialState(1, { events: false });
    const windowMs = minutes(90);
    at(s, realMsOfCivil(2026, 12, 15));
    expect(triggerMet(s, viewOf(s), event)).toBe(true);
    at(s, realMsOfCivil(2026, 12, 15) + windowMs - 1);
    expect(triggerMet(s, viewOf(s), event)).toBe(true);
    at(s, realMsOfCivil(2026, 12, 15) + windowMs);
    expect(triggerMet(s, viewOf(s), event)).toBe(false);
  });

  it('the birthday never starts by itself on a world whose real date is not December 15', () => {
    // The other half of the same fact, from the outside: five real minutes of a world that is
    // otherwise free to do what it likes, and the birthday is not in it. `dlBirthday` used to be
    // the first start on every seed, at 0.1 real seconds; the real calendar is what removed that
    // (before #84 it was the deferral). These worlds run at the default April 1 epoch.
    for (const seed of [1, 9, 25]) {
      const s = advance(createInitialState(seed), 3000);
      const told = s.chronicle.entries.filter((e) => e.line.includes('birthday'));
      expect(told, `seed ${seed}`).toEqual([]);
      expect(s.events.running.map((r) => r.id), `seed ${seed}`).not.toContain('dlBirthday');
      expect(s.events.cooldowns['dlBirthday'], `seed ${seed}`).toBeUndefined();
    }
  });

  it('a sim date is a fraction of the season, and is due for the sim-day it falls in', () => {
    // The world lane's #83 redefined `simDate.dayOfSeason` as a fraction in [0, 1) rather than the
    // 1-based day index 1-9 it used to be, because a season under the real-year calendar no longer
    // has a fixed day count to point at. No shipped authored event uses `simDate` today; this pins
    // the engine's reader against the schema's new meaning. See `seasonFraction` (engine.ts).
    //
    // PIN MOVED (#84). Before, this case reached its seasons by setting `elapsedMs` to multiples of
    // `SEASON_MS` (the nine-real-day wheel). The reason is the ticket: there is no wheel and no
    // `SEASON_MS` any more, so a season is reached by putting the world on a real date inside it
    // and asking the world's own calendar where that season starts and ends. Every assertion below
    // is the same assertion it was.
    const s = createInitialState(1, { events: false });
    const mid = stubDeck([{ id: 'c' }], [{ id: 'midSummer', trigger: { kind: 'simDate', season: 'summer', dayOfSeason: 0.5 } }]);
    const event = mid.authored[0]!;
    // Seed 1's own summer, drift and all: its start, and its own realized length.
    at(s, realMsOfCivil(2026, 7, 15)); // inside summer on every seed (it starts July 1 at the latest)
    const summer = seasonSpanOf(s.season);
    const midSummer = summer.startMs + (summer.endMs - summer.startMs) * 0.5;
    at(s, midSummer);
    expect(seasonFraction(s)).toBeCloseTo(0.5, 9);
    expect(triggerMet(s, viewOf(s), event)).toBe(true);
    // Still true anywhere inside that one sim-day (three real minutes), and false the next one.
    // Measured from the start of the season-day the midpoint falls in, not from the midpoint
    // itself: the season's own length is not a whole number of sim-days, so the midpoint sits
    // somewhere inside its day rather than at its edge.
    const dayMs = PERIOD * 1000;
    const midDayStart = summer.startMs + Math.floor((midSummer - summer.startMs) / dayMs) * dayMs;
    at(s, midDayStart);
    expect(triggerMet(s, viewOf(s), event)).toBe(true);
    at(s, midDayStart + dayMs * 0.9);
    expect(triggerMet(s, viewOf(s), event)).toBe(true);
    at(s, midDayStart + dayMs * 1.1);
    expect(triggerMet(s, viewOf(s), event)).toBe(false);
    // The right season, too: the same fraction of spring is not the same fraction of summer.
    at(s, realMsOfCivil(2026, 4, 15));
    const spring = seasonSpanOf(s.season);
    at(s, spring.startMs + (spring.endMs - spring.startMs) * 0.5);
    expect(triggerMet(s, viewOf(s), event)).toBe(false);
    // And the season fraction is a fraction: 0 at the season's first moment, never 1.
    at(s, spring.startMs);
    expect(seasonFraction(s)).toBe(0);
    expect(seasonDayOfFraction(s, 0)).toBe(1);
    const half = spring.startMs + (spring.endMs - spring.startMs) * 0.5;
    expect(seasonDayOfFraction(s, 0.5)).toBe(dayOfSeason({ ...s, season: { ...s.season, realEpochMs: half - s.season.elapsedMs } }));
  });

  it('a stock threshold: the cliff storm waits for a real drought', () => {
    const storm = FARM_DECK.authored.find((e) => e.id === 'cliffStorm')!;
    const s = createInitialState(2, { events: false });
    for (const t of s.tufts) t.level = 0.5;
    expect(triggerMet(s, viewOf(s), storm)).toBe(false);
    for (const t of s.tufts) t.level = 0.1;
    expect(triggerMet(s, viewOf(s), storm)).toBe(true);
  });

  it('predicates: the first snow needs winter and snow together', () => {
    const snow = FARM_DECK.authored.find((e) => e.id === 'firstSnowOfSeason')!;
    const s = createInitialState(3, { events: false });
    s.season = { ...s.season, override: 'winter' };
    expect(triggerMet(s, viewOf(s), snow)).toBe(false);
    s.weather = { ...s.weather, kind: 'snow' };
    expect(triggerMet(s, viewOf(s), snow)).toBe(true);
    s.season = { ...s.season, override: 'summer' };
    expect(triggerMet(s, viewOf(s), snow)).toBe(false);
  });

  it('a cooldown keeps an authored event from firing twice on the same weather', () => {
    const s = createInitialState(4);
    s.season = { ...s.season, override: 'winter' };
    s.weather = { ...s.weather, kind: 'snow', mode: 'manual' };
    startEvent(s, FARM_DECK, 'firstSnowOfSeason', 'authored');
    atMs(s, minutes(FARM_DECK.authored[2]!.durationSimMinutes) + 1);
    evaluate(s, FARM_DECK); // it ends here, and its cooldown starts
    expect(s.events.running.map((r) => r.id)).not.toContain('firstSnowOfSeason');
    expect(readyAuthored(s, FARM_DECK).map((e) => e.id)).not.toContain('firstSnowOfSeason');
    // Well past the cooldown it is ready again: this is the first snow of a season, not of the
    // world. The world lane rescaled that cooldown from 30 sim-days to 60,000 in #83 (a sim-day is
    // the clock's 180-second period, not a real day, so 30 sim-days was about 90 real minutes and
    // let the snow re-arm several times a winter); this steps past the number the data now carries
    // rather than a hard-coded one, so a further rescale moves the test with it.
    const snowCooldown = FARM_DECK.authored[2]!.trigger;
    if (snowCooldown.kind !== 'predicates') throw new Error('firstSnowOfSeason is not a predicate trigger any more');
    atMs(s, s.clock.nowMs + (snowCooldown.cooldownSimDays + 1) * PERIOD * 1000);
    expect(readyAuthored(s, FARM_DECK).map((e) => e.id)).toContain('firstSnowOfSeason');
  });
});

describe('an authored event pre-empts a card sharing its parameters', () => {
  it('by card id, and by the bare parameter names its data names', () => {
    const s = createInitialState(5, { events: false });
    startEvent(s, FARM_DECK, 'cliffStorm', 'authored');
    // `cliffStorm.priorityOver` is ["fogMorning", "stargazingNight", "nightOfTheFireflies", "weather"].
    expect(preemptedByAuthored(s, FARM_DECK, card('fogMorning'))).toBe(true); // by id
    expect(preemptedByAuthored(s, FARM_DECK, card('stargazingNight'))).toBe(true); // by id
    expect(preemptedByAuthored(s, FARM_DECK, card('rainbowAfterRain'))).toBe(true); // by parameter: a weather moment
    expect(preemptedByAuthored(s, FARM_DECK, card('windfall'))).toBe(false); // shares nothing with a storm
  });

  it('the birthday outranks every card with a mood hook while the party runs', () => {
    const s = createInitialState(6, { events: false });
    startEvent(s, FARM_DECK, 'dlBirthday', 'authored');
    const moody = FARM_DECK.cards.filter((c) => [...c.hooks.start, ...c.hooks.end].some((h) => h.op === 'mood'));
    expect(moody.length).toBeGreaterThan(5);
    for (const c of moody) expect(preemptedByAuthored(s, FARM_DECK, c), c.id).toBe(true);
    // And once it is over, they are back in the running.
    endEvent(s, FARM_DECK, 'dlBirthday');
    for (const c of moody) expect(preemptedByAuthored(s, FARM_DECK, c), c.id).toBe(false);
  });

  it('a card an authored event outranks is skipped even when its own conditions hold', () => {
    // fogMorning's conditions: a sunny spring dawn. Met here, so only the storm can be the reason.
    const s = createInitialState(7, { events: false });
    s.clock = { ...s.clock, t: 0.95 };
    s.weather = { ...s.weather, kind: 'sun', mode: 'manual' };
    expect(eligibleCards(s, FARM_DECK).map((e) => e.card.id)).toContain('fogMorning');
    startEvent(s, FARM_DECK, 'cliffStorm', 'authored');
    expect(eligibleCards(s, FARM_DECK).map((e) => e.card.id)).not.toContain('fogMorning');
  });

  it('the authored event takes its slot before the draw does, in the same look at the world', () => {
    // The order inside `evaluate`: ends, category actions, authored, then the card draw. So a card
    // the authored event outranks cannot slip in first on the minute the trigger fires.
    const s = createInitialState(8);
    s.season = { ...s.season, override: 'winter' };
    s.weather = { ...s.weather, kind: 'snow', mode: 'manual' };
    s.events.lastMomentKind = null;
    evaluate(s, FARM_DECK);
    expect(s.events.running.map((r) => r.id)).toContain('firstSnowOfSeason');
  });
});

describe('the owner’s authored intent', () => {
  it('trigger starts it whatever its own trigger says, and reset ends it and clears the cooldown', () => {
    const s = createInitialState(9, { events: false });
    // Nothing about this world says "storm": the grass is full.
    for (const t of s.tufts) t.level = 1;
    expect(triggerMet(s, viewOf(s), FARM_DECK.authored[1]!)).toBe(false);

    applyIntent(s, { type: 'authored', id: 'cliffStorm', action: 'trigger' });
    expect(s.events.running.map((r) => r.id)).toEqual(['cliffStorm']);
    expect(s.events.flags['storm']).toBe(true);
    expect(s.events.visibility).toBe(0.5);
    const started = s.chronicle.entries.at(-1)!;
    expect(started.source).toBe('authored');
    expect(started.line).toMatch(/storm broke over the cliff/);

    // Triggering again while it runs is a no-op, not a second copy.
    applyIntent(s, { type: 'authored', id: 'cliffStorm', action: 'trigger' });
    expect(s.events.running).toHaveLength(1);

    applyIntent(s, { type: 'authored', id: 'cliffStorm', action: 'reset' });
    expect(s.events.running).toEqual([]);
    expect(s.events.flags['storm']).toBe(false);
    expect(s.events.visibility).toBe(1);
    expect(s.events.cooldowns['cliffStorm']).toBeUndefined(); // reset clears it: it can happen again
    expect(s.chronicle.entries.at(-1)!.line).toMatch(/was called off/);
  });

  it('an id the deck does not carry, or a card id, is a no-op', () => {
    const s = createInitialState(10, { events: false });
    applyIntent(s, { type: 'authored', id: 'nothingLikeThis', action: 'trigger' });
    applyIntent(s, { type: 'authored', id: 'fogMorning', action: 'trigger' }); // a card, not authored
    expect(s.events.running).toEqual([]);
    expect(s.chronicle.entries).toEqual([]);
  });

  it('rides in through `step` like every other intent, at a tick boundary', () => {
    const s = step(createInitialState(11, { events: false }), [{ type: 'authored', id: 'dlBirthday', action: 'trigger' }], 100);
    expect(s.events.running.map((r) => r.id)).toEqual(['dlBirthday']);
    expect(s.events.flags['party']).toBe(true);
  });

  // Round 1 verifier finding 3 (#82): `trigger` must not be a way around `PACING.concurrentCap`.
  it('a trigger that would exceed the cap evicts the oldest running card, tells its end, and keeps the cap', () => {
    const s = createInitialState(13, { events: false });
    expect(PACING.concurrentCap).toBe(2);
    startEvent(s, FARM_DECK, 'windfall', 'card');
    atMs(s, s.clock.nowMs + 1000); // stagger startedMs so "oldest" is unambiguous
    startEvent(s, FARM_DECK, 'strayCatVisits', 'card');
    expect(s.events.running.map((r) => r.id)).toEqual(['windfall', 'strayCatVisits']);

    applyIntent(s, { type: 'authored', id: 'cliffStorm', action: 'trigger' });

    // The cap held: still two running, and it is the new authored event plus the *other* card —
    // windfall, the older of the two, is the one that gave up its slot.
    expect(s.events.running).toHaveLength(PACING.concurrentCap);
    expect(s.events.running.map((r) => r.id)).toEqual(['strayCatVisits', 'cliffStorm']);
    // The evicted card's end is told, with its own reason, and its cooldown is still set (an
    // eviction is an early end, not a free pass on the deck's own pacing).
    const evicted = s.chronicle.entries.find((e) => e.line.includes('A windfall'));
    expect(evicted?.line).toBe("A windfall ended early to make room for the owner's own hand.");
    expect(evicted?.source).toBe('card');
    expect(s.events.cooldowns['windfall']).toBeDefined();
  });

  it('with no running card to give up, a trigger evicts the oldest running event of any kind', () => {
    const s = createInitialState(14, { events: false });
    startEvent(s, FARM_DECK, 'cliffStorm', 'authored');
    atMs(s, s.clock.nowMs + 1000);
    startEvent(s, FARM_DECK, 'firstSnowOfSeason', 'authored');
    expect(s.events.running.map((r) => r.id)).toEqual(['cliffStorm', 'firstSnowOfSeason']);

    applyIntent(s, { type: 'authored', id: 'dlBirthday', action: 'trigger' });

    expect(s.events.running).toHaveLength(PACING.concurrentCap);
    expect(s.events.running.map((r) => r.id)).toEqual(['firstSnowOfSeason', 'dlBirthday']);
    expect(s.chronicle.entries.some((e) => e.line.startsWith('A storm off the cliff') && e.line.includes('to make room'))).toBe(true);
  });
});

// Round 1 verifier finding 5 (#82): a save from a build whose deck has since dropped a card is a
// world `validateWorld` deliberately allows (save/serialize.ts: "the keys are not [checked]: an id
// the deck no longer carries is stale data, not an invalid world"). Its end must still be told.
describe('a running id the deck no longer carries', () => {
  it('is ended with its own chronicle line and no cooldown, whether ended by hand or by the clock', () => {
    const deck = stubDeck([{ id: 'a', durationSimMinutes: 10 }]);
    const s = createInitialState(15, { events: false });
    s.events = { ...s.events, enabled: true };
    startEvent(s, deck, 'a', 'card');
    expect(s.events.running.map((r) => r.id)).toEqual(['a']);

    // The world this save now loads into has a deck that no longer carries 'a' (a card dropped from
    // the content since the save was written).
    const shrunkDeck = stubDeck([]);
    endEvent(s, shrunkDeck, 'a', 'due');
    expect(s.events.running).toEqual([]);
    expect(s.events.cooldowns['a']).toBeUndefined(); // no entry left to look one up on
    const told = s.chronicle.entries.at(-1)!;
    expect(told.line).toBe('a ended; the deck no longer carries it.');
    expect(told.source).toBe('card');
  });

  it('the same, reached the ordinary way: the clock ends it inside `evaluate`, not a hand-written call', () => {
    const deck = stubDeck([{ id: 'b', durationSimMinutes: 10 }]);
    const s = createInitialState(16, { events: false });
    s.events = { ...s.events, enabled: true };
    startEvent(s, deck, 'b', 'card');
    atMs(s, s.clock.nowMs + simMinutesToMs(11, s.clock.periodSec)); // past its duration

    const shrunkDeck = stubDeck([]);
    evaluate(s, shrunkDeck);

    expect(s.events.running).toEqual([]);
    expect(s.events.cooldowns['b']).toBeUndefined();
    expect(s.chronicle.entries.some((e) => e.line === 'b ended; the deck no longer carries it.')).toBe(true);
  });
});

describe('hooks', () => {
  it('the five ops write where they say they write', () => {
    const s = createInitialState(12, { events: false });
    runHook(s, { op: 'flag', name: 'fog', value: true });
    expect(s.events.flags['fog']).toBe(true);
    runHook(s, { op: 'setVisibility', value: 0.35 });
    expect(s.events.visibility).toBe(0.35);
    runHook(s, { op: 'mood', target: 'all', delta: 3 });
    expect(s.events.mood).toBe(3);
    const coins = s.banks.coins;
    runHook(s, { op: 'coins', delta: 12 });
    expect(s.banks.coins).toBe(coins + 12);
    runHook(s, { op: 'spawn', what: 'merchant', at: 'offstage' });
    expect(s.npcs.merchant).not.toBeNull();
  });

  it('mood is clamped, and a spawn the sim has no actor for is a no-op rather than a throw', () => {
    const s = createInitialState(13, { events: false });
    for (let i = 0; i < 20; i++) runHook(s, { op: 'mood', target: 'flock', delta: 3 });
    expect(s.events.mood).toBe(MOOD_RANGE.max);
    for (let i = 0; i < 40; i++) runHook(s, { op: 'mood', target: 'flock', delta: -3 });
    expect(s.events.mood).toBe(MOOD_RANGE.min);
    expect(() => runHook(s, { op: 'spawn', what: 'crow', at: 'hay', count: 3, untilEnd: true })).not.toThrow();
    expect(s.npcs.farmer).toBeNull();
    expect(s.npcs.merchant).toBeNull();
  });

  it('an event’s start hooks run at its start and its end hooks at its end', () => {
    const s = createInitialState(14, { events: false });
    startEvent(s, FARM_DECK, 'fogMorning', 'card');
    expect(s.events.flags['fog']).toBe(true);
    expect(s.events.visibility).toBe(0.35);
    endEvent(s, FARM_DECK, 'fogMorning');
    expect(s.events.flags['fog']).toBe(false);
    expect(s.events.visibility).toBe(1);
  });
});

describe('the four reference cards, in code, against their v2 data', () => {
  it('fog morning reuses the deity power’s own fog flag, and puts it back at the end', () => {
    const s = createInitialState(15, { events: false });
    expect(s.weather.foggy).toBeUndefined();
    startEvent(s, FARM_DECK, 'fogMorning', 'card');
    expect(s.weather.foggy).toBe(true);
    expect(s.weather.kind).toBe('sun'); // fog sits over the weather, it does not replace it
    endEvent(s, FARM_DECK, 'fogMorning');
    expect(s.weather.foggy).toBeUndefined();
  });

  it('the merchant caravan brings the cart, and the fixed timer does not double-book him', () => {
    const s = createInitialState(16);
    expect(s.npcs.merchant).toBeNull();
    startEvent(s, FARM_DECK, 'merchantCaravan', 'card');
    expect(s.npcs.merchant?.kind).toBe('merchant');
    // The prototype's 45-second timer is long past on this world, and it never fires again while
    // the engine is directing: the card owns his arrival.
    const t = advance(s, 600);
    expect(t.clock.nowMs).toBeGreaterThan(45_000);
    const merchants = t.chronicle.entries.filter((e) => e.picture === 'merchant');
    expect(merchants).toHaveLength(1);
  });

  it('shearing day tops every fleece and brings the farmer in outside his two visits', () => {
    const s = createInitialState(17, { events: false });
    expect(s.sheep.every((q) => q.wool < 1)).toBe(true);
    startEvent(s, FARM_DECK, 'shearingDay', 'card');
    expect(s.sheep.every((q) => q.wool === REFERENCE_RULES.shearingDayFleece)).toBe(true);
    expect(s.npcs.farmer?.kind).toBe('farmer');
    expect(s.events.flags['shearingDay']).toBe(true);
    // And the farmer gets through the flock: the wool bank fills over the visit.
    const after = advance(s, 1500);
    expect(after.banks.wool).toBeGreaterThan(0);
  });

  it('the lost lamb wanders off, Digital Luna fetches it, and the card ends when she does', () => {
    const s = world({ seed: 18, t: 0.3, weather: 'sun', events: true });
    // One lamb, on the field, out of the barn.
    const mother = s.sheep[0]!;
    mother.lambs.push({ x: mother.x - 18, y: mother.y + 8, dir: mother.dir, bornMs: s.clock.nowMs, grown: false });
    startEvent(s, FARM_DECK, 'lostLamb', 'card');

    const lamb = findLostLamb(s)!.lamb;
    expect(lamb.lost).toBe(true);
    expect(s.events.flags['lambLost']).toBe(true);
    const startDistance = Math.hypot(lamb.x - REFERENCE_RULES.lostLambSpot.x, lamb.y - REFERENCE_RULES.lostLambSpot.y);

    let fetching = 0;
    let ticks = 0;
    for (; ticks < 900 && s.events.lostLamb !== null; ticks++) {
      tickInPlace(s);
      if (s.luna.routine === 'fetchLamb') fetching++;
    }
    // She went out and got it: her own behaviour ran, the marker is clear, and the lamb is back on
    // its mother's trail rather than still walking away.
    expect(fetching).toBeGreaterThan(0);
    expect(s.events.lostLamb).toBeNull();
    expect(lamb.lost).toBeUndefined();
    expect(Math.hypot(lamb.x - REFERENCE_RULES.lostLambSpot.x, lamb.y - REFERENCE_RULES.lostLambSpot.y)).toBeLessThan(startDistance);
    // The card is over because the thing it was about happened, well inside its 120-minute
    // duration: the marker clears the moment she reaches the lamb, and the engine's next look at
    // the world (a sim-minute at most) ends the card on it.
    expect(s.clock.nowMs).toBeLessThan(minutes(120));
    for (let i = 0; i < 20; i++) tickInPlace(s);
    expect(s.events.running.map((r) => r.id)).not.toContain('lostLamb');
    const ended = s.chronicle.entries.filter((e) => e.picture === 'lostLamb-end');
    expect(ended).toHaveLength(1);
  });

  it('the sheep tick leaves a lost lamb where it is, and the line behind it closes up', () => {
    // The sheep side of the `lostLamb` card, on its own: no engine, no Digital Luna, just the
    // lamb-trailing loop in behaviours/sheep.ts with one lamb flagged `lost`.
    const s = world({ seed: 19, t: 0.3, weather: 'sun' });
    const mother = s.sheep[0]!;
    mother.lambs.push({ x: 40, y: 40, dir: mother.dir, bornMs: 0, grown: false });
    mother.lambs.push({ x: mother.x - 32, y: mother.y + 10, dir: mother.dir, bornMs: 1, grown: false });
    const lost = mother.lambs[0] as Lamb;
    const behind = mother.lambs[1] as Lamb;
    lost.lost = true;
    const where = { x: lost.x, y: lost.y };
    for (let i = 0; i < 20; i++) tickSheep(s);
    // Not sprung back to the trail, not moved at all by the sheep tick...
    expect(lost).toMatchObject(where);
    // ...and the lamb behind it trails the mother rather than following it off, so a runaway never
    // takes the rest of the line with it.
    expect(lambDistance(mother, 1)).toBeLessThan(2);
    expect(Math.hypot(behind.x - mother.x, behind.y - mother.y)).toBeLessThan(40);
    // The lost one is exactly what `lambFarFromMother` is for.
    expect(lambDistance(mother, 0)).toBeGreaterThan(PREDICATE_RULES.lambFarPx);
    expect(readPredicate(viewOf(s), 'lambFarFromMother')).toBe(true);
  });
});

describe('what the engine tells the chronicle', () => {
  function told(s: SimState) {
    return s.chronicle.entries.filter((e) => e.source === 'card' || e.source === 'authored');
  }

  it('every start and every end is one entry, start with the author’s hint and end with a quarter of it', () => {
    const s = createInitialState(20, { events: false });
    startEvent(s, FARM_DECK, 'shearingDay', 'card');
    endEvent(s, FARM_DECK, 'shearingDay');
    const lines = told(s);
    expect(lines).toHaveLength(2);
    // The **filled** line, not the authored one (#114): the chronicle stores a finished sentence,
    // so `{flock}` here has become the flock's own count. The authored text is
    // "Shearing day. The farmer clipped {flock} fleeces and the sheep felt the breeze."
    expect(lines[0]!.line).toBe(fillStorybookLine(card('shearingDay').storybook.line, { flock: s.sheep.length, coins: 0 }));
    expect(lines[0]!.line).toBe(`Shearing day. The farmer clipped ${s.sheep.length} fleeces and the sheep felt the breeze.`);
    expect(lines[0]!.line).not.toMatch(/[{}]/);
    expect(lines[0]!.picture).toBe('shearing');
    expect(lines[0]!.notability).toBeCloseTo(0.7, 9);
    expect(lines[1]!.picture).toBe('shearing-end');
    expect(lines[1]!.notability).toBeCloseTo(0.7 * 0.25, 9);
  });

  it('no engine line carries an event id in its facts, and only card and authored lines carry a hint', () => {
    let s = createInitialState(21);
    s = advance(s, 3000);
    const ids = new Set([...FARM_DECK.cards.map((c) => c.id), ...FARM_DECK.authored.map((e) => e.id)]);
    for (const entry of s.chronicle.entries) {
      for (const key of Object.keys(entry.facts)) expect(ids.has(key), `${entry.line}: ${key}`).toBe(false);
      // A `category` line's notability comes from its facts alone: `tell` ignores a hint from it,
      // so a routine market walk can only read as notable by being a first.
      if (entry.source === 'category') expect(entry.notability === 0 || entry.first).toBe(true);
    }
    expect(s.chronicle.entries.some((e) => e.source === 'card')).toBe(true);
  });

  it('a lost lamb’s line names the ewe it belongs to', () => {
    const s = world({ seed: 22, t: 0.3, weather: 'sun', events: true });
    const mother = s.sheep[0]!;
    mother.lambs.push({ x: mother.x - 18, y: mother.y + 8, dir: mother.dir, bornMs: s.clock.nowMs, grown: false });
    startEvent(s, FARM_DECK, 'lostLamb', 'card');
    expect(s.chronicle.entries.at(-1)!.actors).toEqual([mother.id]);
  });
});

describe('no engine hook writes to Digital Luna', () => {
  it('starting and ending every card and authored event in the deck never touches her', () => {
    // The engine sets flags and markers; her own chain is the only thing that moves her (the
    // `fetchLamb` behaviour in behaviours/luna.ts). Same shape of guard as the DL invariant's
    // static write-guard: a Proxy on her object, and a deep snapshot for a nested write.
    for (const id of [...FARM_DECK.cards.map((c) => c.id), ...FARM_DECK.authored.map((e) => e.id)]) {
      const s = createInitialState(23, { events: false });
      const mother = s.sheep[0]!;
      mother.lambs.push({ x: mother.x - 18, y: mother.y + 8, dir: mother.dir, bornMs: 0, grown: false });
      const writes: string[] = [];
      const before = JSON.stringify(s.luna);
      s.luna = new Proxy(s.luna, {
        set(t, prop, value) {
          writes.push(String(prop));
          return Reflect.set(t, prop, value);
        },
      });
      const kind = FARM_DECK.byId.get(id)!.kind;
      startEvent(s, FARM_DECK, id, kind);
      endEvent(s, FARM_DECK, id);
      expect(writes, id).toEqual([]);
      expect(JSON.stringify(s.luna), id).toBe(before);
    }
  });
});

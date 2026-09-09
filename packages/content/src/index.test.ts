import { describe, expect, it } from 'vitest';
import {
  CONTENT_PACKAGE, DISTRICT_IDS, EVENT_HOOK_OPS, FARM_EVENT_DECK, FARM_AUTHORED_EVENTS, STORYBOOK_PLACEHOLDERS,
  authoredEvent, eventCard, simHoursToMs, simMinutesToMs, storybookPlaceholders,
} from './index';
// The sim's substitution table is the other half of the placeholder vocabulary (#114): a
// placeholder is allowed exactly when the sim can fill it. Imported by relative path rather than
// from `@sheepcliff/sim`'s root, because that package's export list is the sim lane's own file and
// this round's grant does not include it; the dev-only content -> sim edge is the same one
// `deck-coverage.test.ts` explains at its head.
import { STORYBOOK_PLACEHOLDERS as SIM_PLACEHOLDERS, fillStorybookLine } from '../../sim/src/chronicle/storybook-line';

describe('@sheepcliff/content', () => {
  it('lists the four planned districts with the farm first', () => {
    expect(CONTENT_PACKAGE).toBe('@sheepcliff/content');
    expect(DISTRICT_IDS).toHaveLength(4);
    expect(DISTRICT_IDS[0]).toBe('farm');
  });
});

describe('the farm event deck (v2)', () => {
  it('has fifteen cards with unique ids', () => {
    expect(FARM_EVENT_DECK.district).toBe('farm');
    expect(FARM_EVENT_DECK.events).toHaveLength(15);
    expect(new Set(FARM_EVENT_DECK.events.map((e) => e.id)).size).toBe(15);
  });

  it('uses only the hook ops the engine implements', () => {
    const ops = new Set<string>(EVENT_HOOK_OPS);
    for (const card of FARM_EVENT_DECK.events) {
      for (const hook of [...card.hooks.start, ...card.hooks.end]) expect(ops.has(hook.op)).toBe(true);
    }
  });

  it('keeps every storybook line under 90 characters with known placeholders and a notability', () => {
    const known = new Set<string>(STORYBOOK_PLACEHOLDERS);
    // Authored events as well as cards: their lines are told by the same `tell` and carry `{dl}`
    // too, and before #114 nothing checked them at all.
    for (const card of [...FARM_EVENT_DECK.events, ...FARM_AUTHORED_EVENTS.events]) {
      expect(card.storybook.line.length).toBeLessThan(90);
      expect(card.storybook.notability).toBeGreaterThanOrEqual(0);
      expect(card.storybook.notability).toBeLessThanOrEqual(1);
      for (const p of storybookPlaceholders(card.storybook.line)) expect(known.has(p)).toBe(true);
    }
    // Decision 12 (2026-09-08, plan section 11): no transaction happens on the farm, so windfall no
    // longer pays coins and its line no longer carries the {coins} placeholder.
    expect(storybookPlaceholders(eventCard('windfall').storybook.line)).toEqual(['dl']);
  });

  it('uses only placeholders the sim can fill, and every shipped line fills to a finished sentence (#114)', () => {
    // The allowed set is the sim's substitution table's own keys. The two declarations sit in two
    // packages because the sim reads this package's JSON and never imports its TypeScript, so this
    // is the pin that keeps them one vocabulary; if the sim learns a new placeholder or forgets
    // one, this fails rather than a brace reaching the chronicle.
    expect([...STORYBOOK_PLACEHOLDERS].sort()).toEqual([...SIM_PLACEHOLDERS].sort());
    // And every line this deck actually ships fills without a brace left in it. `fillStorybookLine`
    // throws on a key it cannot fill, so a card added with `{purse}` fails here as well as at load.
    for (const event of [...FARM_EVENT_DECK.events, ...FARM_AUTHORED_EVENTS.events]) {
      const told = fillStorybookLine(event.storybook.line, { flock: 5, coins: 0 });
      expect(told, event.id).not.toContain('{');
      expect(told, event.id).not.toContain('}');
    }
    // The two substitutions the shipped lines lean on, spelled out rather than left implied.
    expect(fillStorybookLine(eventCard('crowsOnTheField').storybook.line, { flock: 5, coins: 0 }))
      .toBe('Three crows landed on the hay and Digital Luna sent them packing.');
    expect(fillStorybookLine(eventCard('shearingDay').storybook.line, { flock: 5, coins: 0 }))
      .toBe('Shearing day. The farmer clipped 5 fleeces and the sheep felt the breeze.');
    // A placeholder at the very start of a line is capitalised where it lands.
    expect(fillStorybookLine(eventCard('lambZoomiesHour').storybook.line, { flock: 5, coins: 0 }))
      .toBe('A lamb got the zoomies and ran rings round the trough.');
    // `{coins}` reads the amount the hook moved, and the word "no" when nothing moves — which is
    // every card in this deck since decision 12 retired the farm's one transaction.
    expect(fillStorybookLine('{dl} found {coins} coins.', { flock: 5, coins: 12 })).toBe('Digital Luna found 12 coins.');
    expect(fillStorybookLine('{dl} found {coins} coins.', { flock: 5, coins: 0 })).toBe('Digital Luna found no coins.');
    expect(() => fillStorybookLine('{dl} dug up a {purse}.', { flock: 5, coins: 0 })).toThrow(/no substitution for \{purse\}/);
  });

  it('looks cards up by id and throws on a typo', () => {
    expect(eventCard('fogMorning').hooks.start[0]).toEqual(expect.objectContaining({ op: 'setVisibility', value: 0.35 }));
    expect(() => eventCard('fogMorrning')).toThrow(/no event card/);
  });

  it('converts in-world time at the watching rate: a 180-second day', () => {
    expect(simMinutesToMs(1440)).toBe(180_000);
    expect(simMinutesToMs(8)).toBe(1000);
    expect(simHoursToMs(24)).toBe(180_000);
    expect(simHoursToMs(eventCard('merchantCaravan').limits.cooldownSimHours)).toBe(240_000);
    expect(simMinutesToMs(eventCard('merchantCaravan').durationSimMinutes)).toBe(30_000);
  });

  it('gives lostLamb the multipliers the issue asks for by name', () => {
    const card = eventCard('lostLamb');
    const on = card.weight.multipliers.map((m) => m.when.on);
    expect(on).toEqual(expect.arrayContaining(['lambFarFromMother', 'flockScattered', 'dlFarFromFlock']));
  });
});

describe('the farm authored events (v2)', () => {
  it('has three events with ids disjoint from the card deck', () => {
    expect(FARM_AUTHORED_EVENTS.district).toBe('farm');
    expect(FARM_AUTHORED_EVENTS.events).toHaveLength(3);
    const cardIds = new Set(FARM_EVENT_DECK.events.map((e) => e.id));
    for (const event of FARM_AUTHORED_EVENTS.events) expect(cardIds.has(event.id)).toBe(false);
  });

  it('covers three of the four trigger kinds the schema supports (dlBirthday now uses realDate, #83)', () => {
    const kinds = FARM_AUTHORED_EVENTS.events.map((e) => e.trigger.kind).sort();
    expect(kinds).toEqual(['predicates', 'realDate', 'stockThreshold']);
  });

  it('looks events up by id and throws on a typo', () => {
    expect(authoredEvent('dlBirthday').trigger.kind).toBe('realDate');
    expect(() => authoredEvent('dlBirthdya')).toThrow(/no authored event/);
  });

  it("gives dlBirthday a real December 15, regardless of the sim's season cycle", () => {
    const trigger = authoredEvent('dlBirthday').trigger;
    expect(trigger).toEqual(expect.objectContaining({ kind: 'realDate', month: 12, day: 15 }));
  });

  it('gives every event at least one real variable (not just a comment) and one priorityOver entry', () => {
    for (const event of FARM_AUTHORED_EVENTS.events) {
      expect(event.variables).not.toHaveProperty('comment');
      expect(Object.keys(event.variables).length).toBeGreaterThan(0);
      expect(event.variablesComment.length).toBeGreaterThan(0);
      expect(event.priorityOver.length).toBeGreaterThan(0);
    }
  });
});

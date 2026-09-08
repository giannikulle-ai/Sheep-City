// The deck: the world lane's card and authored-event data (packages/content/events/*.json), read
// into the shapes this package evaluates. The sim reads the JSON, not the content package's
// TypeScript, the same way rules.ts reads balance/farm.json — the data is the contract, and a
// mismatch between it and this file must fail loudly at load rather than quietly at a draw.
//
// `loadDeck` therefore validates: every `on` and `op` is one this engine implements, every hook op
// is one hooks.ts runs, ids are unique across both files, and every number is finite. A card the
// engine cannot evaluate is a bug in one lane or the other, not a card that silently never fires.

import farmCards from '../../../content/events/farm.json';
import farmAuthored from '../../../content/events/authored.json';
import type { Phase, SeasonName } from '../clock';

/** What a predicate reads. Mirrors `conditionOn` in packages/content/schema/events.schema.json. */
export const PREDICATE_ON = [
  'season',
  'weather',
  'timeOfDay',
  'simMinutesSinceRain',
  'ledger.wool',
  'ledger.coins',
  'ledger.grass',
  'ledger.flock',
  'lambFarFromMother',
  'dlFarFromFlock',
  'flockScattered',
  'merchantPresent',
  'lambPresent',
  'farmerPresent',
] as const;
export type PredicateOn = (typeof PREDICATE_ON)[number];

export const PREDICATE_OPS = ['eq', 'ne', 'in', 'not-in', 'gte', 'lte', 'gt', 'lt'] as const;
export type PredicateOp = (typeof PREDICATE_OPS)[number];

/** One predicate over world state: `{ on, op, value }`. */
export interface Predicate {
  readonly on: PredicateOn;
  readonly op: PredicateOp;
  readonly value: unknown;
}

/** `base` times every multiplier whose `when` holds at the moment of the draw. */
export interface CardWeight {
  readonly base: number;
  readonly multipliers: readonly { readonly when: Predicate; readonly times: number }[];
}

export interface CardLimits {
  /** How many copies of this card may run at once. */
  readonly concurrent: number;
  /** Sim-minutes between one draw of this card and the next, start to start. */
  readonly minGapSimMinutes: number;
  /** Sim-hours after this card ends before it may be drawn again. */
  readonly cooldownSimHours: number;
}

/** The hook vocabulary. Keep in step with `EVENT_HOOK_OPS` in packages/content/src/index.ts. */
export const EVENT_HOOK_OPS = ['setVisibility', 'spawn', 'mood', 'coins', 'flag'] as const;
export type EventHookOp = (typeof EVENT_HOOK_OPS)[number];

export type EventHook =
  | { readonly op: 'setVisibility'; readonly value: number }
  | { readonly op: 'spawn'; readonly what: string; readonly at: string; readonly count?: number; readonly untilEnd?: boolean }
  | { readonly op: 'mood'; readonly target: 'flock' | 'dl' | 'all'; readonly delta: number }
  | { readonly op: 'coins'; readonly delta: number }
  | { readonly op: 'flag'; readonly name: string; readonly value: boolean };

export interface EventHooks {
  readonly start: readonly EventHook[];
  readonly end: readonly EventHook[];
}

export interface EventStorybook {
  readonly line: string;
  readonly picture: string;
  /** The author's own 0..1 read of how big this is; passed to `tell` as its `hint`. */
  readonly notability: number;
}

export interface EventMoment {
  readonly kind: string;
  readonly detail: string;
}

export interface Card {
  readonly id: string;
  readonly title: string;
  readonly conditions: readonly Predicate[];
  readonly weight: CardWeight;
  readonly limits: CardLimits;
  readonly durationSimMinutes: number;
  readonly hooks: EventHooks;
  readonly storybook: EventStorybook;
  readonly moment: EventMoment;
}

export type AuthoredTrigger =
  | { readonly kind: 'predicates'; readonly all: readonly Predicate[]; readonly cooldownSimDays: number }
  | { readonly kind: 'simDate'; readonly season: SeasonName; readonly dayOfSeason: number }
  | { readonly kind: 'stockThreshold'; readonly on: PredicateOn; readonly op: PredicateOp; readonly value: number; readonly cooldownSimDays: number }
  | { readonly kind: 'realDate'; readonly month: number; readonly day: number; readonly windowSimMinutes?: number };

/**
 * A trigger kind this engine knows the shape of but cannot yet evaluate, and the ticket that will
 * make it evaluable. Loading records it here rather than throwing, so the deck still loads and the
 * event is visibly parked instead of quietly never firing for an unknown reason. See `triggerMet`.
 */
export type DeferredTrigger = { readonly kind: 'realDate'; readonly ticket: '#84' };

export interface AuthoredEvent {
  readonly id: string;
  readonly title: string;
  readonly trigger: AuthoredTrigger;
  /**
   * Set when this event's trigger is a *known but not yet implemented* kind (today: `realDate`,
   * deferred to #84). The deck loads, the event is in `byId` and `deck.authored`, and `triggerMet`
   * returns false for it every time — so it never starts on its own until #84 lands. Undefined for
   * every event the engine can actually evaluate.
   */
  readonly deferred?: DeferredTrigger;
  /** Authored parameters a card does not get. Open by design; the engine only reads what it knows. */
  readonly variables: Readonly<Record<string, unknown>>;
  /** Card ids, or bare parameter names (`mood`, `weather`, ...), this event outranks while it runs. */
  readonly priorityOver: readonly string[];
  readonly durationSimMinutes: number;
  readonly hooks: EventHooks;
  readonly storybook: EventStorybook;
  readonly moment: EventMoment;
}

/** What an id names in a deck: a card or an authored event. */
export type DeckEntry = { readonly kind: 'card'; readonly card: Card } | { readonly kind: 'authored'; readonly event: AuthoredEvent };

/** One district's deck: its cards, its authored events, and an id index over both. */
export interface Deck {
  readonly district: string;
  readonly cards: readonly Card[];
  readonly authored: readonly AuthoredEvent[];
  /** Every id in the deck, card or authored, for the lookups the engine does by id. */
  readonly byId: ReadonlyMap<string, DeckEntry>;
}

/** A time band, as `timeOfDay` reads it: the four the clock's `phaseOf` returns. */
export type TimeOfDay = Phase;

function fail(where: string, message: string): never {
  throw new Error(`event deck: ${where}: ${message}`);
}

function num(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(where, `expected a finite number, got ${JSON.stringify(value)}`);
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string') fail(where, `expected a string, got ${JSON.stringify(value)}`);
  return value;
}

function rec(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(where, `expected an object, got ${JSON.stringify(value)}`);
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(where, `expected an array, got ${JSON.stringify(value)}`);
  return value;
}

function predicate(raw: unknown, where: string): Predicate {
  const p = rec(raw, where);
  const on = str(p['on'], `${where}.on`);
  if (!(PREDICATE_ON as readonly string[]).includes(on)) fail(`${where}.on`, `"${on}" is not a predicate this engine implements (${PREDICATE_ON.join(', ')})`);
  const op = str(p['op'], `${where}.op`);
  if (!(PREDICATE_OPS as readonly string[]).includes(op)) fail(`${where}.op`, `"${op}" is not an operator (${PREDICATE_OPS.join(', ')})`);
  if ((op === 'in' || op === 'not-in') && !Array.isArray(p['value'])) fail(`${where}.value`, `op "${op}" needs an array`);
  if ((op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') && typeof p['value'] !== 'number') fail(`${where}.value`, `op "${op}" needs a number`);
  return { on: on as PredicateOn, op: op as PredicateOp, value: p['value'] };
}

function hook(raw: unknown, where: string): EventHook {
  const h = rec(raw, where);
  const op = str(h['op'], `${where}.op`);
  switch (op) {
    case 'setVisibility':
      return { op, value: num(h['value'], `${where}.value`) };
    case 'spawn': {
      const count = h['count'] === undefined ? undefined : num(h['count'], `${where}.count`);
      return {
        op,
        what: str(h['what'], `${where}.what`),
        at: str(h['at'], `${where}.at`),
        ...(count === undefined ? {} : { count }),
        ...(h['untilEnd'] === undefined ? {} : { untilEnd: h['untilEnd'] === true }),
      };
    }
    case 'mood': {
      const target = str(h['target'], `${where}.target`);
      if (target !== 'flock' && target !== 'dl' && target !== 'all') fail(`${where}.target`, `"${target}" is not a mood target`);
      return { op, target, delta: num(h['delta'], `${where}.delta`) };
    }
    case 'coins':
      return { op, delta: num(h['delta'], `${where}.delta`) };
    case 'flag':
      return { op, name: str(h['name'], `${where}.name`), value: h['value'] === true };
    default:
      return fail(`${where}.op`, `"${op}" is not a hook op this engine runs (${EVENT_HOOK_OPS.join(', ')})`);
  }
}

function hooks(raw: unknown, where: string): EventHooks {
  const h = rec(raw, where);
  return {
    start: list(h['start'], `${where}.start`).map((x, i) => hook(x, `${where}.start[${i}]`)),
    end: list(h['end'], `${where}.end`).map((x, i) => hook(x, `${where}.end[${i}]`)),
  };
}

function storybook(raw: unknown, where: string): EventStorybook {
  const s = rec(raw, where);
  const notability = num(s['notability'], `${where}.notability`);
  if (notability < 0 || notability > 1) fail(`${where}.notability`, `expected 0..1, got ${notability}`);
  return { line: str(s['line'], `${where}.line`), picture: str(s['picture'], `${where}.picture`), notability };
}

function moment(raw: unknown, where: string): EventMoment {
  const m = rec(raw, where);
  return { kind: str(m['kind'], `${where}.kind`), detail: str(m['detail'], `${where}.detail`) };
}

function card(raw: unknown, where: string): Card {
  const c = rec(raw, where);
  const weight = rec(c['weight'], `${where}.weight`);
  const limits = rec(c['limits'], `${where}.limits`);
  const base = num(weight['base'], `${where}.weight.base`);
  if (base <= 0) fail(`${where}.weight.base`, `expected a positive number, got ${base}`);
  const concurrent = num(limits['concurrent'], `${where}.limits.concurrent`);
  if (!Number.isInteger(concurrent) || concurrent < 1) fail(`${where}.limits.concurrent`, `expected a positive integer, got ${concurrent}`);
  const duration = num(c['durationSimMinutes'], `${where}.durationSimMinutes`);
  if (duration <= 0) fail(`${where}.durationSimMinutes`, `expected a positive number, got ${duration}`);
  return {
    id: str(c['id'], `${where}.id`),
    title: str(c['title'], `${where}.title`),
    conditions: list(c['conditions'], `${where}.conditions`).map((x, i) => predicate(x, `${where}.conditions[${i}]`)),
    weight: {
      base,
      multipliers: list(weight['multipliers'], `${where}.weight.multipliers`).map((x, i) => {
        const m = rec(x, `${where}.weight.multipliers[${i}]`);
        const times = num(m['times'], `${where}.weight.multipliers[${i}].times`);
        if (times <= 0) fail(`${where}.weight.multipliers[${i}].times`, `expected a positive number, got ${times}`);
        return { when: predicate(m['when'], `${where}.weight.multipliers[${i}].when`), times };
      }),
    },
    limits: {
      concurrent,
      minGapSimMinutes: num(limits['minGapSimMinutes'], `${where}.limits.minGapSimMinutes`),
      cooldownSimHours: num(limits['cooldownSimHours'], `${where}.limits.cooldownSimHours`),
    },
    durationSimMinutes: duration,
    hooks: hooks(c['hooks'], `${where}.hooks`),
    storybook: storybook(c['storybook'], `${where}.storybook`),
    moment: moment(c['moment'], `${where}.moment`),
  };
}

function trigger(raw: unknown, where: string): AuthoredTrigger {
  const t = rec(raw, where);
  const kind = str(t['kind'], `${where}.kind`);
  switch (kind) {
    case 'predicates':
      return {
        kind,
        all: list(t['all'], `${where}.all`).map((x, i) => predicate(x, `${where}.all[${i}]`)),
        cooldownSimDays: num(t['cooldownSimDays'], `${where}.cooldownSimDays`),
      };
    case 'simDate': {
      const season = str(t['season'], `${where}.season`);
      if (!['spring', 'summer', 'autumn', 'winter'].includes(season)) fail(`${where}.season`, `"${season}" is not a season`);
      // A fraction of the season, in [0, 1), since the world lane's #83 — not the 1-based day index
      // 1-9 it used to be. See `seasonFraction` in engine.ts.
      const day = num(t['dayOfSeason'], `${where}.dayOfSeason`);
      if (day < 0 || day >= 1) fail(`${where}.dayOfSeason`, `expected a fraction of the season in [0, 1), got ${day}`);
      return { kind, season: season as SeasonName, dayOfSeason: day };
    }
    case 'stockThreshold': {
      const p = predicate({ on: t['on'], op: t['op'], value: t['value'] }, where);
      return { kind, on: p.on, op: p.op, value: num(t['value'], `${where}.value`), cooldownSimDays: num(t['cooldownSimDays'], `${where}.cooldownSimDays`) };
    }
    // `realDate` is a real calendar date — "December 15, every real year" (the owner's calendar
    // decision, plan section 2; the world lane put Digital Luna's birthday on it in #83). This
    // engine cannot evaluate it yet, because deciding whether *now* is December 15 needs the
    // real-year calendar model — `outsideRules.seasons.calendar` in `packages/content/balance/
    // farm.json` — wired into the sim as an input, and that is ticket **#84**, not this one (#40).
    // So the kind is known, its shape is checked here, and the event loads *deferred*: it sits in
    // the deck, `authoredEvent` marks it `deferred: { kind: 'realDate', ticket: '#84' }`, and
    // `triggerMet` (engine.ts) returns false for it on every look at the world, so the birthday
    // never fires by itself until #84 gives the sim a real date to compare against. Parked in the
    // open beats either of the two silent failures: throwing here would take the whole deck — and
    // with it every test that imports the sim — down over data the world lane owns and the owner
    // asked for, and quietly accepting it as "never true" would leave no trace of why the birthday
    // stopped happening. A kind this engine has never heard of still fails loudly, below.
    case 'realDate': {
      const month = num(t['month'], `${where}.month`);
      const day = num(t['day'], `${where}.day`);
      if (!Number.isInteger(month) || month < 1 || month > 12) fail(`${where}.month`, `expected a month 1-12, got ${JSON.stringify(t['month'])}`);
      if (!Number.isInteger(day) || day < 1 || day > 31) fail(`${where}.day`, `expected a day 1-31, got ${JSON.stringify(t['day'])}`);
      const window = t['windowSimMinutes'];
      if (window === undefined) return { kind, month, day };
      return { kind, month, day, windowSimMinutes: num(window, `${where}.windowSimMinutes`) };
    }
    default:
      return fail(`${where}.kind`, `"${kind}" is not a trigger kind this engine implements (predicates, simDate, stockThreshold, realDate)`);
  }
}

/** The deferral note for a trigger kind the engine loads but cannot yet evaluate, or undefined. */
function deferralOf(t: AuthoredTrigger): DeferredTrigger | undefined {
  return t.kind === 'realDate' ? { kind: 'realDate', ticket: '#84' } : undefined;
}

function authoredEvent(raw: unknown, where: string): AuthoredEvent {
  const e = rec(raw, where);
  const duration = num(e['durationSimMinutes'], `${where}.durationSimMinutes`);
  if (duration <= 0) fail(`${where}.durationSimMinutes`, `expected a positive number, got ${duration}`);
  const trig = trigger(e['trigger'], `${where}.trigger`);
  const deferred = deferralOf(trig);
  return {
    id: str(e['id'], `${where}.id`),
    title: str(e['title'], `${where}.title`),
    trigger: trig,
    ...(deferred ? { deferred } : {}),
    variables: rec(e['variables'], `${where}.variables`),
    priorityOver: list(e['priorityOver'], `${where}.priorityOver`).map((x, i) => str(x, `${where}.priorityOver[${i}]`)),
    durationSimMinutes: duration,
    hooks: hooks(e['hooks'], `${where}.hooks`),
    storybook: storybook(e['storybook'], `${where}.storybook`),
    moment: moment(e['moment'], `${where}.moment`),
  };
}

/**
 * Read a card file and an authored file into a `Deck`. Throws on anything this engine could not
 * evaluate: an unknown predicate, operator, hook op, or trigger kind, a bad number, a duplicate id.
 * The one exception is a trigger kind this engine knows of but has not implemented yet (`realDate`,
 * deferred to #84): that loads, carries a `deferred` note on the event, and never fires. See
 * `trigger()` above for why.
 */
export function loadDeck(cardsDoc: unknown, authoredDoc: unknown): Deck {
  const cardsRaw = rec(cardsDoc, 'cards');
  const authoredRaw = rec(authoredDoc, 'authored');
  const district = str(cardsRaw['district'], 'cards.district');
  if (str(authoredRaw['district'], 'authored.district') !== district) {
    fail('authored.district', `authored events are for "${String(authoredRaw['district'])}", the cards for "${district}"`);
  }
  const cards = list(cardsRaw['events'], 'cards.events').map((x, i) => card(x, `cards.events[${i}]`));
  const events = list(authoredRaw['events'], 'authored.events').map((x, i) => authoredEvent(x, `authored.events[${i}]`));
  const byId = new Map<string, DeckEntry>();
  for (const c of cards) {
    if (byId.has(c.id)) fail('cards.events', `duplicate id "${c.id}"`);
    byId.set(c.id, { kind: 'card', card: c });
  }
  for (const e of events) {
    if (byId.has(e.id)) fail('authored.events', `id "${e.id}" is already a card id`);
    byId.set(e.id, { kind: 'authored', event: e });
  }
  return { district, cards, authored: events, byId };
}

/** The farm's deck: fifteen cards and three authored events, straight from the world lane's data. */
export const FARM_DECK: Deck = loadDeck(farmCards, farmAuthored);

/** The moment kind an id fires, or null for an id the deck does not carry. */
export function momentKindOf(id: string, deck: Deck = FARM_DECK): string | null {
  const entry = deck.byId.get(id);
  if (!entry) return null;
  return entry.kind === 'card' ? entry.card.moment.kind : entry.event.moment.kind;
}

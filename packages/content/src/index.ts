// @sheepcliff/content — data files (creatures, buildings, districts, events, balance, names).
// The JSON is the source of truth; this module gives the sim and the client typed handles on it.

import farmEvents from '../events/farm.json';
import authoredEvents from '../events/authored.json';

export const CONTENT_PACKAGE = '@sheepcliff/content';

/** District ids the plan names. Data for each arrives in later tickets. */
export const DISTRICT_IDS = ['farm', 'village-green', 'cliff-harbour', 'wildwood'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

// ---- Event deck v2 (events/farm.json, events/authored.json, schema/events.schema.json, #59) ----

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherName = 'sun' | 'rain' | 'snow';
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

/** The hook vocabulary the engine implements (#40). Keep in step with the schema's `hook` oneOf. */
export const EVENT_HOOK_OPS = ['setVisibility', 'spawn', 'mood', 'coins', 'flag'] as const;
export type EventHookOp = (typeof EVENT_HOOK_OPS)[number];

export type SpawnWhat = 'crow' | 'cat' | 'firefly' | 'farmer' | 'merchant';
export type MoodTarget = 'flock' | 'dl' | 'all';

export type EventHook =
  | { op: 'setVisibility'; value: number; comment?: string }
  | { op: 'spawn'; what: SpawnWhat; at: string; count?: number; untilEnd?: boolean; comment?: string }
  | { op: 'mood'; target: MoodTarget; delta: number; comment?: string }
  | { op: 'coins'; delta: number; comment?: string }
  | { op: 'flag'; name: string; value: boolean; comment?: string };

/** What a v2 predicate reads. See schema/events.schema.json's `conditionOn` for the plain-word source. */
export const CONDITION_ON = [
  'season', 'weather', 'timeOfDay', 'simMinutesSinceRain',
  'ledger.wool', 'ledger.coins', 'ledger.grass', 'ledger.flock',
  'lambFarFromMother', 'dlFarFromFlock', 'flockScattered',
  'merchantPresent', 'lambPresent', 'farmerPresent',
] as const;
export type ConditionOn = (typeof CONDITION_ON)[number];

export const CONDITION_OPS = ['eq', 'ne', 'in', 'not-in', 'gte', 'lte', 'gt', 'lt'] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

/** One predicate over world state, `{ on, op, value }` (v2 replaces v1's fixed `preconditions` allow-list). */
export type EventCondition = {
  on: ConditionOn;
  op: ConditionOp;
  value: unknown;
  comment?: string;
};

/** A live multiplier: `base` times every `multipliers` entry whose `when` holds at the draw. */
export type EventWeight = {
  base: number;
  multipliers: Array<{ when: EventCondition; times: number; comment?: string }>;
  comment?: string;
};

/** How often and how much of a card the engine allows (v2; v1 had a bare card-level `cooldownSimHours`). */
export type EventLimits = {
  concurrent: number;
  minGapSimMinutes: number;
  cooldownSimHours: number;
  comment?: string;
};

/** Watch-test moment kinds (tools/qa/README.md). `bird`/`rabbit` are reserved for small life, not cards. */
export type MomentKind = 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit';

/**
 * Placeholders a storybook line may carry. **The set is the sim's substitution table's own keys**
 * (`packages/sim/src/chronicle/storybook-line.ts`): a placeholder is allowed exactly when the sim
 * can fill it before the line reaches the chronicle (#114). It is written out a second time here
 * because the sim reads this package's JSON and never imports its TypeScript (see that package's
 * `engine/deck.ts` header), so there is no import to share the array through; `index.test.ts` pins
 * the two equal, and `assertPlaceholdersAreKnown` below fails the deck's load if a shipped line
 * uses anything else. The deck schema's own `line` pattern carries the same list for
 * `validate.mjs`.
 */
export const STORYBOOK_PLACEHOLDERS = ['dl', 'lamb', 'sheep', 'farmer', 'merchant', 'coins', 'flock'] as const;
export type StorybookPlaceholder = (typeof STORYBOOK_PLACEHOLDERS)[number];

export type EventStorybook = { line: string; picture: string; notability: number };
export type EventMoment = { kind: MomentKind; detail: string };
export type EventBeat = { start: string; end: string };
export type EventHooks = { start: EventHook[]; end: EventHook[] };

export type EventCard = {
  id: string;
  title: string;
  comment: string;
  conditions: EventCondition[];
  weight: EventWeight;
  limits: EventLimits;
  /** In-world minutes; 1440 per day, 0.125 real seconds each when watching. */
  durationSimMinutes: number;
  hooks: EventHooks;
  storybook: EventStorybook;
  moment: EventMoment;
  beat: EventBeat;
};

export type EventDeck = {
  district: DistrictId;
  timeScale: { simMinutesPerDay: number; simHoursPerDay: number; realSecondsPerSimDayWatching: number };
  events: EventCard[];
};

/** The farm's fifteen v2 cards, straight from the JSON. The JSON's own `$schema`, `source`, `comment` keys are dropped. */
export const FARM_EVENT_DECK: EventDeck = {
  district: farmEvents.district as DistrictId,
  timeScale: farmEvents.timeScale,
  events: farmEvents.events as unknown as EventCard[],
};

/**
 * How an authored event becomes eligible: a predicate list, a fixed point in the sim's own season
 * cycle (`dayOfSeason` a fraction 0..1 of however long the current season turns out to be, since
 * #83's calendar gives seasons a seeded, varying real length), a Ledger stock crossing a
 * threshold, or a fixed real calendar date independent of the sim's season (`realDate`, #83 —
 * Digital Luna's birthday is December 15 regardless of which sim season that date falls in).
 */
export type AuthoredTrigger =
  | { kind: 'predicates'; all: EventCondition[]; cooldownSimDays: number; comment?: string }
  | { kind: 'simDate'; season: SeasonName; dayOfSeason: number; comment?: string }
  | { kind: 'stockThreshold'; on: ConditionOn; op: ConditionOp; value: number; cooldownSimDays: number; comment?: string }
  | { kind: 'realDate'; month: number; day: number; windowSimMinutes?: number; comment?: string };

/** Authored parameters a card does not get. Deliberately open: every authored event carries a different bag.
 *  Never put a `comment` key in here — an engine reading `Object.keys(variables)` would see it as a phantom
 *  parameter. Use the sibling `variablesComment` on `AuthoredEvent` instead. */
export type AuthoredVariables = Record<string, unknown>;

export type AuthoredEvent = {
  id: string;
  title: string;
  comment: string;
  trigger: AuthoredTrigger;
  variables: AuthoredVariables;
  /** What the `variables` bag holds and why, for humans. Declared as its own property, not a key inside the
   *  open `variables` bag, so the bag never carries a phantom parameter. */
  variablesComment: string;
  /** Card ids, or bare parameter names (e.g. `mood`, `weather`), this event outranks while it runs. */
  priorityOver: string[];
  durationSimMinutes: number;
  hooks: EventHooks;
  storybook: EventStorybook;
  moment: EventMoment;
  beat: EventBeat;
};

export type AuthoredDeck = {
  district: DistrictId;
  timeScale: { simMinutesPerDay: number; simHoursPerDay: number; realSecondsPerSimDayWatching: number };
  events: AuthoredEvent[];
};

/** The farm's three reference authored events, straight from the JSON. */
export const FARM_AUTHORED_EVENTS: AuthoredDeck = {
  district: authoredEvents.district as DistrictId,
  timeScale: authoredEvents.timeScale,
  events: authoredEvents.events as unknown as AuthoredEvent[],
};

/** Look a card up by id, or throw: a misspelt id is a bug, not a missing feature. */
export function eventCard(id: string, deck: EventDeck = FARM_EVENT_DECK): EventCard {
  const card = deck.events.find((e) => e.id === id);
  if (!card) throw new Error(`no event card "${id}" in the ${deck.district} deck`);
  return card;
}

/** Look an authored event up by id, or throw. */
export function authoredEvent(id: string, deck: AuthoredDeck = FARM_AUTHORED_EVENTS): AuthoredEvent {
  const event = deck.events.find((e) => e.id === id);
  if (!event) throw new Error(`no authored event "${id}" in the ${deck.district} deck`);
  return event;
}

/** In-world minutes to sim milliseconds at the watching rate (the clock's 180-second day). */
export function simMinutesToMs(minutes: number, deck: EventDeck = FARM_EVENT_DECK): number {
  return (minutes / deck.timeScale.simMinutesPerDay) * deck.timeScale.realSecondsPerSimDayWatching * 1000;
}

/** In-world hours to sim milliseconds at the watching rate. */
export function simHoursToMs(hours: number, deck: EventDeck = FARM_EVENT_DECK): number {
  return simMinutesToMs(hours * 60, deck);
}

/** The placeholders a storybook line uses, in order of appearance. */
export function storybookPlaceholders(line: string): StorybookPlaceholder[] {
  return [...line.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1] as StorybookPlaceholder);
}

/**
 * Every shipped line's placeholders are ones the sim can fill — checked **at deck load**, when this
 * module is first imported, not at the draw. A card whose line carries `{purse}` would otherwise
 * reach the chronicle with the brace still in it, which is the bug #114 was filed for; the sim's
 * `fillStorybookLine` throws on the same key from the other side.
 */
function assertPlaceholdersAreKnown(): void {
  const known = new Set<string>(STORYBOOK_PLACEHOLDERS);
  for (const event of [...FARM_EVENT_DECK.events, ...FARM_AUTHORED_EVENTS.events]) {
    for (const placeholder of storybookPlaceholders(event.storybook.line)) {
      if (!known.has(placeholder)) {
        throw new Error(`${event.id}: storybook line uses unknown placeholder {${placeholder}} (known: ${STORYBOOK_PLACEHOLDERS.join(', ')})`);
      }
    }
    // A brace the placeholder pattern cannot even read (`{DL}`, `{ dl }`) never reaches the sim's
    // substitution as a key, so it is caught here by shape rather than by name.
    const filled = event.storybook.line.replace(/\{[a-z]+\}/g, '');
    if (filled.includes('{') || filled.includes('}')) throw new Error(`${event.id}: storybook line has a brace that is not a placeholder`);
  }
}

assertPlaceholdersAreKnown();

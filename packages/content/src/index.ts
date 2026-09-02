// @sheepcliff/content — data files (creatures, buildings, districts, events, balance, names).
// The JSON is the source of truth; this module gives the sim and the client typed handles on it.

import farmEvents from '../events/farm.json';

export const CONTENT_PACKAGE = '@sheepcliff/content';

/** District ids the plan names. Data for each arrives in later tickets. */
export const DISTRICT_IDS = ['farm', 'village-green', 'cliff-harbour', 'wildwood'] as const;
export type DistrictId = (typeof DISTRICT_IDS)[number];

// ---- Event deck (events/farm.json, schema/events.schema.json, #41) ----

export type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherName = 'sun' | 'rain' | 'snow';
export type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';

/** The hook vocabulary the Director implements (#40). Keep in step with the schema's `hook` oneOf. */
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

export type EventPreconditions = {
  season?: SeasonName[];
  weather?: WeatherName[];
  timeOfDay?: PhaseName[];
  flockSize?: { min?: number; max?: number };
  merchantPresent?: boolean;
  lambPresent?: boolean;
  /** Proposed in #41: `kind` was the weather at some point in the last `withinSimMinutes`. */
  recentWeather?: { kind: WeatherName; withinSimMinutes: number };
};

/** Watch-test moment kinds (tools/qa/README.md). */
export type MomentKind = 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit';

/** Placeholders a storybook line may carry; the client fills them from the event log. */
export const STORYBOOK_PLACEHOLDERS = ['dl', 'lamb', 'sheep', 'farmer', 'merchant', 'coins', 'flock'] as const;
export type StorybookPlaceholder = (typeof STORYBOOK_PLACEHOLDERS)[number];

export type EventCard = {
  id: string;
  title: string;
  comment?: string;
  /** Relative draw weight among cards whose preconditions hold. 10 is ordinary. */
  weight: number;
  /** In-world hours after the card ends before it may fire again. */
  cooldownSimHours: number;
  preconditions: EventPreconditions;
  /** In-world minutes; 1440 per day, 0.125 real seconds each when watching. */
  durationSimMinutes: number;
  hooks: { start: EventHook[]; end: EventHook[] };
  storybook: { line: string; picture: string };
  moment: { kind: MomentKind; detail: string };
  beat: { start: string; end: string };
};

export type EventDeck = {
  district: DistrictId;
  timeScale: { simMinutesPerDay: number; simHoursPerDay: number; realSecondsPerSimDayWatching: number };
  events: EventCard[];
};

/** The farm's fifteen cards, straight from the JSON. The JSON's own `$schema`, `source`, `comment` keys are dropped. */
export const FARM_EVENT_DECK: EventDeck = {
  district: farmEvents.district as DistrictId,
  timeScale: farmEvents.timeScale,
  events: farmEvents.events as EventCard[],
};

/** Look a card up by id, or throw: a misspelt id is a bug, not a missing feature. */
export function eventCard(id: string, deck: EventDeck = FARM_EVENT_DECK): EventCard {
  const card = deck.events.find((e) => e.id === id);
  if (!card) throw new Error(`no event card "${id}" in the ${deck.district} deck`);
  return card;
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

// Scaffolding for the engine tests: a stub deck, built the way the world lane's JSON is built and
// read through the same `loadDeck`, so a test can pin one rule at a time without leaning on the
// fifteen shipped cards. The shipped deck is still what the run-level tests use; this is for the
// pacing rules, where a card with no conditions and a known weight is the only way to say exactly
// what the engine decided and why.

import { loadDeck, type Deck } from '../src/engine/deck';
import type { SimState } from '../src/state';

/** The shape of one stub card, with everything the schema requires filled in from defaults. */
export interface StubCard {
  id: string;
  /** Small unless said otherwise: most pacing rules are asserted on the everyday size. */
  size?: 'small' | 'big';
  conditions?: unknown[];
  base?: number;
  multipliers?: unknown[];
  concurrent?: number;
  minGapSimMinutes?: number;
  cooldownSimHours?: number;
  durationSimMinutes?: number;
  start?: unknown[];
  end?: unknown[];
  momentKind?: string;
  notability?: number;
}

export interface StubAuthored {
  id: string;
  /** Big unless said otherwise: the three shipped authored events are the punctuation, and big. */
  size?: 'small' | 'big';
  trigger: Record<string, unknown>;
  variables?: Record<string, unknown>;
  priorityOver?: string[];
  durationSimMinutes?: number;
  start?: unknown[];
  end?: unknown[];
  momentKind?: string;
  notability?: number;
}

function cardDoc(card: StubCard): Record<string, unknown> {
  return {
    id: card.id,
    title: card.id,
    size: card.size ?? 'small',
    comment: 'stub',
    conditions: card.conditions ?? [],
    weight: { base: card.base ?? 10, multipliers: card.multipliers ?? [] },
    limits: {
      concurrent: card.concurrent ?? 1,
      minGapSimMinutes: card.minGapSimMinutes ?? 0,
      cooldownSimHours: card.cooldownSimHours ?? 0,
    },
    durationSimMinutes: card.durationSimMinutes ?? 60,
    hooks: { start: card.start ?? [], end: card.end ?? [] },
    storybook: { line: `${card.id} happened`, picture: card.id, notability: card.notability ?? 0.3 },
    moment: { kind: card.momentKind ?? 'bubble', detail: card.id },
    beat: { start: 'a', end: 'b' },
  };
}

function authoredDoc(event: StubAuthored): Record<string, unknown> {
  return {
    id: event.id,
    title: event.id,
    size: event.size ?? 'big',
    comment: 'stub',
    trigger: event.trigger,
    variables: event.variables ?? { stub: 1 },
    variablesComment: 'stub',
    priorityOver: event.priorityOver ?? [],
    durationSimMinutes: event.durationSimMinutes ?? 60,
    hooks: { start: event.start ?? [], end: event.end ?? [] },
    storybook: { line: `${event.id} happened`, picture: event.id, notability: event.notability ?? 0.5 },
    moment: { kind: event.momentKind ?? 'phase', detail: event.id },
    beat: { start: 'a', end: 'b' },
  };
}

/** A deck of stub cards and stub authored events, through the real loader. */
export function stubDeck(cards: StubCard[], authored: StubAuthored[] = []): Deck {
  const timeScale = { simMinutesPerDay: 1440, simHoursPerDay: 24, realSecondsPerSimDayWatching: 180 };
  return loadDeck(
    { district: 'farm', timeScale, events: cards.map(cardDoc) },
    { district: 'farm', timeScale, events: authored.map(authoredDoc) },
  );
}

/** Move the world's clock to `nowMs` without ticking anything: for driving `evaluate` by hand. */
export function atMs(state: SimState, nowMs: number): SimState {
  state.clock = { ...state.clock, nowMs };
  return state;
}

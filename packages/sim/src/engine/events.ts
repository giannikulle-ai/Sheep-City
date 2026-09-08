// The engine's own slice of the world state: what is running, what is on cooldown, what the last
// draw was, and the flags, visibility, and mood its hooks write. Plain data, like everything else
// in state.ts, so it clones, hashes, saves, and migrates with the rest of the world.
//
// The generator is the engine's own stream, seeded from the world's seed. Two reasons, both worth
// the extra field: a draw is part of the determinism hash (the same seed and the same inputs give
// the same events), and the engine's draws do not shift the actors' draws — so an engine-off world
// is bitwise the world this package ran before the engine existed, which is what the parity pins in
// test/engine-parity.test.ts stand on.

import { cloneRng, createRng, type Rng } from '../rng';

/** One event currently running: which id, from which source, when it started, when it is due to end. */
export interface RunningEvent {
  id: string;
  kind: 'card' | 'authored';
  startedMs: number;
  /** Sim time this event is due to end. An event may also end early (the lost lamb, once fetched). */
  endsMs: number;
}

/** The lamb the `lostLamb` card walked off the field: its mother's id and its own birth time. */
export interface LostLamb {
  sheep: string;
  /** A lamb's `bornMs`: stable while an index into `mother.lambs` is not. */
  bornMs: number;
}

export interface EventsState {
  /**
   * Whether the engine directs: card draws, authored triggers, and scheduled category actions. Off
   * gives the pre-engine world exactly (the merchant falls back to his fixed timer in `tickNpcs`),
   * which is what the parity pins measure and what a host wants for a district with no deck. The
   * per-actor category actions (the fleece growing) are the actors' own tick and always run.
   */
  enabled: boolean;
  /** The engine's own generator: the draw, and every pick a hook makes. */
  rng: Rng;
  /** Sim time of the next look at the world. */
  nextEvalMs: number;
  running: RunningEvent[];
  /** Event id to the sim time its cooldown ends. Cards and authored events share the map; ids are disjoint. */
  cooldowns: Record<string, number>;
  /** Event id to the sim time it last started: what a card's own `minGapSimMinutes` is measured from. */
  starts: Record<string, number>;
  /** Sim time the last event of any kind started, or -1. The quiet stretch is measured from this. */
  lastStartMs: number;
  /** Sim time the last card was drawn, or -1. The global gap is measured from this. */
  lastDrawMs: number;
  /** Moment kind of the last event that started, for the no-repeat rule. */
  lastMomentKind: string | null;
  /** The `flag` hook's flags: what the renderer and the actors read while an event runs. */
  flags: Record<string, boolean>;
  /** The `setVisibility` hook: 1 is a clear field, lower is fog or driving rain. */
  visibility: number;
  /** Where the `mood` hooks have left the district. See MOOD_RANGE. */
  mood: number;
  /** Sim time it was last raining, or -1 if it never has. `simMinutesSinceRain` reads this. */
  lastRainMs: number;
  /** The lamb currently off the field, or null. */
  lostLamb: LostLamb | null;
}

/**
 * Mixed into the world's seed for the engine's stream, so a world's events are its own and are not
 * the same sequence its actors draw. Any odd constant does; this is the golden-ratio word the hash
 * in hash.ts already uses.
 */
export const ENGINE_SEED_SALT = 0x9e3779b9;

/** How far the mood hooks may push the district either way before they stop counting. */
export const MOOD_RANGE = { min: -10, max: 10 } as const;

export function createEvents(seed: number, nowMs = 0, enabled = true): EventsState {
  return {
    enabled,
    rng: createRng((seed ^ ENGINE_SEED_SALT) >>> 0),
    nextEvalMs: nowMs,
    running: [],
    cooldowns: {},
    starts: {},
    lastStartMs: -1,
    lastDrawMs: -1,
    lastMomentKind: null,
    flags: {},
    visibility: 1,
    mood: 0,
    lastRainMs: -1,
    lostLamb: null,
  };
}

/** A copy safe to mutate: new arrays, new records, a new generator. */
export function cloneEvents(events: EventsState): EventsState {
  return {
    ...events,
    rng: cloneRng(events.rng),
    running: events.running.map((r) => ({ ...r })),
    cooldowns: { ...events.cooldowns },
    starts: { ...events.starts },
    flags: { ...events.flags },
    lostLamb: events.lostLamb ? { ...events.lostLamb } : null,
  };
}

/** Is this id running right now? */
export function isRunning(events: EventsState, id: string): boolean {
  return events.running.some((r) => r.id === id);
}

/** How many copies of this id are running. */
export function runningCount(events: EventsState, id: string): number {
  let n = 0;
  for (const r of events.running) if (r.id === id) n++;
  return n;
}

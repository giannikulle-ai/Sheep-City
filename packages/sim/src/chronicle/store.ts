// The append-only store: every `tell` call adds one entry and never edits or removes one. Lives on
// `SimState.chronicle`; `cloneChronicle` gives the tick loop's clone-per-tick pattern (state.ts) a
// deep copy so a tick can append to its own private copy without touching the input. `tell` is the
// package's only way to add to it.

import type { ActorId, SimState } from '../state';
import { cloneChronicleStats, createChronicleStats, noteFact, notabilityScale, type ChronicleStats } from './notability';
import type { ChronicleEntry, FactValue, TellInput } from './types';

export interface Chronicle {
  /** In write order, which is also `atMs` order for any one state: nothing is ever inserted out of
   * turn, edited, or removed. */
  entries: ChronicleEntry[];
  /** The next `tell` call's entry id, then incremented. Never reused, even across a save and load. */
  nextId: number;
  stats: ChronicleStats;
}

export function createChronicle(): Chronicle {
  return { entries: [], nextId: 0, stats: createChronicleStats() };
}

/** A deep copy: the entries array, every entry's own `actors` and `facts`, and the stats are all
 * new, so appending to the copy never touches the original. */
export function cloneChronicle(chronicle: Chronicle): Chronicle {
  return {
    entries: chronicle.entries.map((e) => ({ ...e, actors: e.actors.slice(), facts: { ...e.facts } })),
    nextId: chronicle.nextId,
    stats: cloneChronicleStats(chronicle.stats),
  };
}

/** `noteFact` every fact in `facts` and return the highest notability any of them turned up (0 if
 * `facts` is empty). Always runs, regardless of source, so a card's or an authored line's numbers
 * feed the same trailing normals a ledger number is later judged against. */
function recordFacts(stats: ChronicleStats, facts: Record<string, FactValue>, actors: readonly ActorId[]): number {
  let best = 0;
  for (const [key, value] of Object.entries(facts)) {
    const { notability } = noteFact(stats, key, value, actors);
    if (notability > best) best = notability;
  }
  return best;
}

/**
 * Record one fact in the world's log. This is the chronicle's only way in: any system that wants
 * to be remembered — a card, an authored beat, the Ledger diff, the social graph, the economy, a
 * category action, a deity intent — calls `tell` and never touches `state.chronicle` directly.
 * Appends a new `ChronicleEntry` (nothing already written is ever edited or dropped) and returns it
 * with `id` and `notability` filled in.
 *
 * `notability`: for `source: 'card'` or `'authored'`, `input.hint` (default 0) through
 * `notabilityScale`, maxed with whatever `facts` turns up on its own; every other source's
 * notability comes from `facts` alone (chronicle/notability.ts has the one formula, including the
 * first-occurrence flag that can push it to 1). An entry with no numeric facts and no first among
 * them, from a source that gets no hint, is notability 0 — routine, not absent: it is still told.
 */
export function tell(state: Pick<SimState, 'chronicle'>, input: TellInput): ChronicleEntry {
  const actors = input.actors ? [...input.actors] : [];
  const facts = input.facts ? { ...input.facts } : {};
  const factNotability = recordFacts(state.chronicle.stats, facts, actors);
  const notability = input.source === 'card' || input.source === 'authored' ? Math.max(notabilityScale(input.hint ?? 0), factNotability) : factNotability;
  const entry: ChronicleEntry = {
    id: `c${state.chronicle.nextId}`,
    atMs: input.atMs,
    district: input.district,
    line: input.line,
    picture: input.picture,
    actors,
    source: input.source,
    notability,
    facts,
  };
  state.chronicle.nextId++;
  state.chronicle.entries.push(entry);
  return entry;
}

/**
 * Entries with `atMs` in `[fromMs, toMs]` (either order), most notable first, ties broken by time
 * then id so the order is total and stable. `limit` caps how many come back; omit it for
 * everything in range. The read API a client selects a storybook page from — a new array every
 * call, and never mutates the store or an entry in it.
 */
export function chronicleBetween(state: Pick<SimState, 'chronicle'>, fromMs: number, toMs: number, limit?: number): ChronicleEntry[] {
  const lo = Math.min(fromMs, toMs);
  const hi = Math.max(fromMs, toMs);
  const out = state.chronicle.entries.filter((e) => e.atMs >= lo && e.atMs <= hi);
  out.sort((a, b) => b.notability - a.notability || a.atMs - b.atMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return limit === undefined ? out : out.slice(0, Math.max(0, limit));
}

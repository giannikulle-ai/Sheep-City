// The append-only store: every `tell` call adds one entry and never edits or removes one. Lives on
// `SimState.chronicle`; `cloneChronicle` gives the tick loop's clone-per-tick pattern (state.ts) a
// copy so a tick can append to its own private copy without touching the input. An entry, once
// told, is never edited — `tell` freezes it (and its `actors` and `facts`) before it is pushed —
// so `cloneChronicle` only needs a new *array*, not a new copy of every entry: `entries.slice()`
// instead of the old per-entry deep copy. That is a constant-factor fix, not a change of order:
// cloning is still O(entries), just at a few nanoseconds each instead of a full copy, so a tick's
// cost still grows with how much history the world has told — only slowly enough now to stay
// inside the 2 ms live budget out to several hundred thousand entries, far past what a year of
// history reaches today (see chronicle.test.ts, "cloning stays a small constant per entry" for the
// measured numbers). `tell` is the package's only way to add to the store.

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

/** A new store, safe to append to without touching the original: a new `entries` array and new
 * stats maps. Entries themselves are never copied — `tell` freezes every one it writes and never
 * edits or replaces one already in `entries`, so the clone can share them by reference: a plain
 * `entries.slice()` rather than a per-entry deep copy. Still O(entries), not O(1) or O(distinct fact
 * keys) — the array itself is copied — but at a small constant per entry instead of a full clone of
 * each one; see chronicle.test.ts for the measured cost. */
export function cloneChronicle(chronicle: Chronicle): Chronicle {
  return {
    entries: chronicle.entries.slice(),
    nextId: chronicle.nextId,
    stats: cloneChronicleStats(chronicle.stats),
  };
}

/** Freeze one entry into the same detached, immutable shape the store's only writer (`tell`)
 * produces: a fresh `actors` array, a fresh `facts` object, then the entry itself, all frozen. Used
 * by `tell` for a freshly told entry, and by the save/load path (`save/serialize.ts`) for one that
 * came off disk — so a loaded world's entries are just as immune to outside mutation as a told one,
 * including mutation of the parsed document `fromSave` read them from. */
export function freezeChronicleEntry(entry: ChronicleEntry): ChronicleEntry {
  const actors = Object.freeze([...entry.actors]) as ActorId[];
  const facts = Object.freeze({ ...entry.facts }) as Record<string, FactValue>;
  return Object.freeze({ ...entry, actors, facts }) as ChronicleEntry;
}

/** `noteFact` every fact in `facts`, and return the highest notability any of them turned up (0 if
 * `facts` is empty) and whether any of them was a first. Always runs, regardless of source, so a
 * card's or an authored line's numbers feed the same trailing normals a ledger number is later
 * judged against. */
function recordFacts(stats: ChronicleStats, facts: Record<string, FactValue>, actors: readonly ActorId[]): { notability: number; first: boolean } {
  let best = 0;
  let first = false;
  for (const [key, value] of Object.entries(facts)) {
    const result = noteFact(stats, key, value, actors);
    if (result.notability > best) best = result.notability;
    if (result.first) first = true;
  }
  return { notability: best, first };
}

/**
 * Record one fact in the world's log. This is the chronicle's only way in: any system that wants
 * to be remembered — a card, an authored beat, the Ledger diff, the social graph, the economy, a
 * category action, a deity intent — calls `tell` and never touches `state.chronicle` directly.
 * Appends a new `ChronicleEntry` (nothing already written is ever edited or dropped) and returns it
 * with `id`, `notability`, and `first` filled in. The returned entry, and its `actors` and `facts`,
 * are frozen: this is the one place the chronicle is written, so nothing downstream can mutate a
 * telling after the fact, and `cloneChronicle` can trust every entry it shares by reference is
 * exactly as it was told.
 *
 * `notability`: for `source: 'card'` or `'authored'`, `input.hint` (default 0) through
 * `notabilityScale`, maxed with whatever `facts` turns up on its own; every other source's
 * notability comes from `facts` alone (chronicle/notability.ts has the one formula, including the
 * first-occurrence flag that can push it to 1). An entry with no numeric facts and no first among
 * them, from a source that gets no hint, is notability 0 — routine, not absent: it is still told.
 * `input.repeats` (`card`/`authored` only, #113) then runs through the very same `noteFact` EMA a
 * second time, folded in the opposite direction from `facts`: a first-ever telling of it leaves
 * `notability` exactly as `hint`/`facts` set it, and a later telling — no deviation from that
 * world's own normal, its value never varying telling to telling — floors `notability` at 0. Meant
 * for a card or authored event's own id (`TellInput.repeats`'s own doc comment, types.ts), so the
 * tenth telling of the same small card in a long gap reads below its own first.
 *
 * `first`: true if telling this entry was the first-ever telling of one of its fact keys, the
 * first telling of a (fact key, actor) pair among its `actors`, or the first-ever telling of
 * `input.repeats` (`noteFact`, notability.ts). Always false for an entry with no `facts` and no
 * `repeats`, regardless of its `hint`.
 */
export function tell(state: Pick<SimState, 'chronicle'>, input: TellInput): ChronicleEntry {
  const actors = input.actors ? [...input.actors] : [];
  const facts = input.facts ? { ...input.facts } : {};
  const { notability: factNotability, first: factsFirst } = recordFacts(state.chronicle.stats, facts, actors);
  const isCardOrAuthored = input.source === 'card' || input.source === 'authored';
  let notability = isCardOrAuthored ? Math.max(notabilityScale(input.hint ?? 0), factNotability) : factNotability;
  let first = factsFirst;
  if (isCardOrAuthored && input.repeats !== undefined) {
    const repeat = noteFact(state.chronicle.stats, input.repeats, 1, actors);
    if (repeat.first) first = true;
    // Not a first: the same reading `repeats` itself computed can only ever pull this entry's
    // notability down from here, never up — `Math.min`, never `Math.max` — so it never fights
    // `facts`'s own first-beats-a-low-hint contract (chronicle.test.ts) over the same entry.
    else notability = Math.min(notability, repeat.notability);
  }
  // `freezeChronicleEntry` does the actual freezing (readonly here is just what TS can express for
  // an array/object literal); ChronicleEntry's own fields stay plainly typed since nothing outside
  // this function is meant to know or care that its instances happen to be frozen.
  const entry = freezeChronicleEntry({
    id: `c${state.chronicle.nextId}`,
    atMs: input.atMs,
    district: input.district,
    line: input.line,
    picture: input.picture,
    actors,
    source: input.source,
    notability,
    first,
    facts,
  } as ChronicleEntry);
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

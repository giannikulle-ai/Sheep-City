// Notability, defined in one place. A number is notable by how far it sits from its own fact
// key's trailing normal — the plan's example is "fourteen wool in a week is a fact; fourteen when
// you usually get forty is a story" — and by firsts: the first time a fact key is ever told at
// all, or the first time it is told of a particular actor (a new ewe's first lamb reads as a first
// even though "births" itself has been told many times). Card and authored lines carry no number
// to deviate from anything; they pass a hint through `notabilityScale`, the same 0..1 range every
// computed notability lands on, so every source sorts and compares on the same terms.
//
// The trailing normal is an exponential rolling mean and variance (Welford's online update, decayed
// each step) rather than a literal window of past values: cheap to keep per key, and it still
// forgets an old normal in favour of a new one over roughly NOTABILITY_WINDOW tellings, which is
// what "trailing" is after.

import type { ActorId } from '../state';
import type { FactValue } from './types';

/** Roughly how many past tellings of a fact key the trailing mean and variance remember. A key
 * told less often than this keeps responding to every new value for a while before it settles
 * into a "normal" a later value can deviate from. */
export const NOTABILITY_WINDOW = 12;
const ALPHA = 2 / (NOTABILITY_WINDOW + 1);

/** A key's deviation is not judged until at least this many prior tellings have shaped its
 * trailing mean and variance. Below it, the mean is still settling toward its real value and the
 * variance is still small from having too few points to have spread across, so an ordinary number
 * reads as a wild outlier: measured, tellings 3-10 of a routine key (a variance built from 1-9
 * priors) read notability 0.39-0.85 with no floor at all, worse than the untold-yet 0 a key with
 * no history reads. Deliberately the same span the trailing normal itself covers
 * (`NOTABILITY_WINDOW`): by the time a deviation is judged, the mean and variance have had a real
 * window's worth of history behind them, not just a couple of samples. Below the floor, a telling
 * that is not a first reads notability 0, same as a key that has never been told before. */
const MIN_DEVIATION_SAMPLES = NOTABILITY_WINDOW;

/** One fact key's trailing normal. */
export interface FactStat {
  /** Tellings so far. Deviation is not judged until there have been at least
   * `MIN_DEVIATION_SAMPLES` before this one. */
  n: number;
  mean: number;
  variance: number;
}

export interface ChronicleStats {
  facts: Record<string, FactStat>;
  /** Fact keys ever told, regardless of actor. */
  seenFacts: Record<string, true>;
  /** `(fact key, actor)` pairs ever told, keyed by `factActorKey`. */
  seenFactActors: Record<string, true>;
}

export function createChronicleStats(): ChronicleStats {
  return { facts: {}, seenFacts: {}, seenFactActors: {} };
}

export function cloneChronicleStats(stats: ChronicleStats): ChronicleStats {
  const facts: Record<string, FactStat> = {};
  for (const [key, stat] of Object.entries(stats.facts)) facts[key] = { ...stat };
  return { facts, seenFacts: { ...stats.seenFacts }, seenFactActors: { ...stats.seenFactActors } };
}

/**
 * Clamp onto the chronicle's shared 0..1 notability scale. Every notability value that reaches an
 * entry — a computed deviation, a first occurrence, or a card/authored hint — passes through this,
 * so they sort and compare the same way no matter which source wrote them.
 */
export function notabilityScale(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  return raw < 0 ? 0 : raw > 1 ? 1 : raw;
}

/**
 * A deviation, in standard deviations from the trailing mean, onto the 0..1 scale: 0 or below
 * reads as unremarkable (a routine number), and larger deviations approach but never reach 1 (a
 * deviant one).
 */
export function deviationNotability(z: number): number {
  if (!Number.isFinite(z) || z <= 0) return 0;
  return notabilityScale(1 - Math.exp(-z / 2));
}

function updateFactStat(prev: FactStat | undefined, value: number): FactStat {
  if (!prev) return { n: 1, mean: value, variance: 0 };
  const diff = value - prev.mean;
  const incr = ALPHA * diff;
  const mean = prev.mean + incr;
  const variance = (1 - ALPHA) * (prev.variance + diff * incr);
  return { n: prev.n + 1, mean, variance };
}

function factActorKey(key: string, actor: ActorId): string {
  return `${key}\u0000${actor}`;
}

/**
 * Record one fact against the chronicle's rolling stats for its key, and return this telling's
 * notability and whether it is a first. Mutates `stats`: the key's trailing mean and variance move
 * to include `value` (numeric facts only — a string fact only ever updates the seen-sets), and the
 * key, plus every `(key, actor)` pair in `actors`, is marked seen. Call it once per fact.
 *
 * A string fact, or a numeric one with fewer than `MIN_DEVIATION_SAMPLES` prior tellings of its
 * key, has no normal trustworthy enough yet to deviate from: its notability is 1 if this is a
 * first, 0 otherwise — a genuinely routine value in that early span reads the same as if the key
 * had no history at all, rather than as an overstated deviation from a normal that has not settled.
 */
export function noteFact(stats: ChronicleStats, key: string, value: FactValue, actors: readonly ActorId[]): { notability: number; first: boolean } {
  let first = !stats.seenFacts[key];
  stats.seenFacts[key] = true;
  for (const actor of actors) {
    const pairKey = factActorKey(key, actor);
    if (!stats.seenFactActors[pairKey]) {
      first = true;
      stats.seenFactActors[pairKey] = true;
    }
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) return { notability: first ? 1 : 0, first };

  const prev = stats.facts[key];
  let notability = first ? 1 : 0;
  if (prev && prev.n >= MIN_DEVIATION_SAMPLES) {
    const sd = Math.sqrt(prev.variance);
    // A trailing normal with no spread yet (every prior telling was the same number) reads any
    // change as a real, if unscaled, deviation rather than an infinite one.
    const z = sd > 1e-9 ? Math.abs(value - prev.mean) / sd : value === prev.mean ? 0 : 4;
    notability = Math.max(notability, deviationNotability(z));
  }
  stats.facts[key] = updateFactStat(prev, value);
  return { notability, first };
}

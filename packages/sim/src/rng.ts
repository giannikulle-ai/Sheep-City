// Seeded random generator. The whole package draws from this and never from Math.random.
//
// mulberry32: 32 bits of state, one multiply-xorshift round per draw. Small, fast, and its
// state is a single number, so it lives inside the world state and survives save, clone, and hash.

/** Generator state. Mutated in place by every `next*` call; copy with `cloneRng` when forking. */
export interface Rng {
  /** Current 32-bit state, kept as an unsigned integer. */
  s: number;
}

/** Make a generator from any finite number. Seeds are reduced to 32 bits; 0 is a valid seed. */
export function createRng(seed: number): Rng {
  if (!Number.isFinite(seed)) throw new Error(`rng seed must be a finite number, got ${seed}`);
  return { s: seed >>> 0 };
}

export function cloneRng(rng: Rng): Rng {
  return { s: rng.s };
}

/** Next raw draw as an unsigned 32-bit integer. */
export function nextU32(rng: Rng): number {
  let t = (rng.s = (rng.s + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Drop-in for `Math.random()`: a float in [0, 1). */
export function nextFloat(rng: Rng): number {
  return nextU32(rng) / 4294967296;
}

/** A float in [lo, hi). Replaces the prototype's `lo + Math.random() * (hi - lo)`. */
export function nextRange(rng: Rng, lo: number, hi: number): number {
  return lo + nextFloat(rng) * (hi - lo);
}

/** An integer in [0, n). Replaces `Math.floor(Math.random() * n)`. */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}

/** True with probability p. Replaces `Math.random() < p`. */
export function chance(rng: Rng, p: number): boolean {
  return nextFloat(rng) < p;
}

/** One element of a non-empty array, uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty array');
  return items[nextInt(rng, items.length)] as T;
}

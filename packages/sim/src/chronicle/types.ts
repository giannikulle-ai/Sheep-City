// The chronicle's data shapes: what an entry is, and what a caller hands `tell` to make one. See
// notability.ts for how `notability` is computed and store.ts for the append-only store and `tell`
// itself (its doc comment there is the canonical one; also re-exported from the package index).

import type { ActorId } from '../state';

/** The only district Phase 1 ever writes to. Later districts join `DISTRICT_IDS` in
 * packages/content; the sim does not import that package's types (see rules.ts: it reads the JSON
 * data, not the TS), so this is a plain string, not that package's `DistrictId`. */
export const FARM_DISTRICT = 'farm';

/** Which system called `tell`. A card or an authored beat carries its own sense of how big it is
 * (`TellInput.hint`); every other source's notability comes from its own facts. */
export const CHRONICLE_SOURCES = ['card', 'authored', 'ledger', 'social', 'economy', 'category', 'deity'] as const;
export type ChronicleSource = (typeof CHRONICLE_SOURCES)[number];

/** A fact's value: a number (fed into that key's rolling normal, see notability.ts) or a string
 * (a state such as a weather kind), which only ever contributes a first-occurrence check. */
export type FactValue = number | string;

/**
 * One recorded fact: the whole world's log is a flat, append-only list of these (plan, section 2,
 * "The chronicle and the storybook"). `id` is unique and stable once written and never reused;
 * `atMs` is the sim time it happened; `notability` is the chronicle's own 0..1 read of how big a
 * deal it is, filled in by `tell` (notability.ts has the one formula).
 */
export interface ChronicleEntry {
  id: string;
  atMs: number;
  district: string;
  /** A sentence in the past tense: what happened. */
  line: string;
  /** A picture key a storybook renderer looks up; this package does not own the art. */
  picture: string;
  actors: ActorId[];
  source: ChronicleSource;
  notability: number;
  facts: Record<string, FactValue>;
}

/**
 * What a caller hands `tell`: everything on `ChronicleEntry` except `id` and `notability`, which
 * the chronicle fills in itself.
 */
export interface TellInput {
  atMs: number;
  district: string;
  line: string;
  picture: string;
  actors?: readonly ActorId[];
  source: ChronicleSource;
  facts?: Record<string, FactValue>;
  /**
   * For 'card' and 'authored' lines only: the author's own sense of how big this is, on the same
   * 0..1 scale `notabilityScale` produces (0 routine, 1 huge) — see notability.ts. Every other
   * source's notability comes from its facts alone, and this is ignored for it.
   */
  hint?: number;
}

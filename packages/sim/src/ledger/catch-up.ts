// The catch-up policy: how a world left alone for `awayMs` of sim time is brought up to date.
// Under one sim-day the actors tick through it (the cap PR #34 set in the client). A day or more
// runs the whole days on the Ledger, respawns the actors from the numbers, and ticks the actors
// through the remainder. Deterministic for a given state and gap: the ledger draws from the
// state's generator, and the respawn seed is its next draw.

import { cloneRng, nextU32 } from '../rng';
import type { SimState } from '../state';
import { step } from '../step';
import { advanceLedger } from './advance';
import { diffLedger, type LedgerDiff } from './diff';
import { dayMs, summarise, type Ledger } from './ledger';
import { respawn } from './respawn';

/** Which path a catch-up took. */
export type CatchUpMode = 'none' | 'actors' | 'ledger';

export interface CatchUpOptions {
  /** A gap below this is a reload, not an absence, and runs nothing. Default 1,000 ms. */
  minMs?: number;
}

export interface CatchUp {
  /** The world after the gap. The input state is never modified. */
  state: SimState;
  mode: CatchUpMode;
  /** The gap as given, made finite and non-negative. */
  awayMs: number;
  /** Sim ms actually advanced: `ledgerMs + actorMs`. */
  ranMs: number;
  /** Whole days run on the Ledger, and their length in sim ms. */
  ledgerDays: number;
  ledgerMs: number;
  /** Sim ms ticked at actor resolution (the remainder, or the whole gap under a day). */
  actorMs: number;
  /** The ledger before and after, and what changed, for the "while you were gone" line. */
  before: Ledger;
  after: Ledger;
  diff: LedgerDiff;
}

/**
 * Advance `state` by `awayMs` of sim time. The host maps wall time to sim time (today one to
 * one) and decides the period; the policy reads the world's own `periodSec` for the day length,
 * so a farm left on a one-minute day counts days of one minute.
 *
 * - `awayMs < minMs`: nothing runs, the state comes back as is.
 * - `awayMs < dayMs(state)`: `step(state, [], awayMs)`, actors all the way.
 * - otherwise: `summarise`, `advanceLedger` for the whole days, `respawn` from the result, then
 *   `step` for the remainder. Queued intents carry over to the respawned world and land on its
 *   first tick. The result's `ledger` snapshot and `lastLedgerAt` are taken at the end.
 *
 * Pure: `state` is never modified.
 */
export function catchUp(state: SimState, awayMs: number, options: CatchUpOptions = {}): CatchUp {
  const minMs = options.minMs ?? 1000;
  const gap = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  const before = summarise(state);
  const day = dayMs(state);
  const result = (s: SimState, mode: CatchUpMode, ledgerDays: number, ledgerMs: number, actorMs: number): CatchUp => {
    const after = mode === 'none' ? before : summarise(s);
    return { state: s, mode, awayMs: gap, ranMs: ledgerMs + actorMs, ledgerDays, ledgerMs, actorMs, before, after, diff: diffLedger(before, after) };
  };
  if (gap < minMs) return result(state, 'none', 0, 0, 0);
  if (gap < day) return result(step(state, [], gap), 'actors', 0, 0, gap);

  const ledgerDays = Math.floor(gap / day);
  const ledgerMs = ledgerDays * day;
  const actorMs = gap - ledgerMs;
  const rng = cloneRng(state.rng);
  const ledger = advanceLedger(before, ledgerMs, rng);
  let s = respawn(ledger, nextU32(rng));
  s.pendingIntents = state.pendingIntents.slice();
  s = step(s, [], actorMs);
  s = { ...s, ledger: summarise(s), lastLedgerAt: s.clock.nowMs };
  return result(s, 'ledger', ledgerDays, ledgerMs, actorMs);
}

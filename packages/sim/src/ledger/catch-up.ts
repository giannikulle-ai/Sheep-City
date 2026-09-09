// The catch-up policy: how a world left alone for `awayMs` of sim time is brought up to date.
// Under one sim-day the actors tick through it (the cap PR #34 set in the client). A day or more
// runs the whole days on the Ledger, respawns the actors from the numbers, and ticks the actors
// through the remainder. Deterministic for a given state and gap: the ledger draws from the
// state's generator, and the respawn seed is its next draw.
//
// **This is the unwatched path, and it is the only one** (the owner's decision, 2026-09-09, plan
// decision 16: "the big ones should not happen when I am not watching"). The client calls `catchUp`
// on load and again whenever the tab comes back, with the real time away; everything else in the
// package is the live, watched path. So both branches here run with big things switched off:
//
//   * the **actor branch** (under a farm day away) steps the ordinary live code with
//     `{ watched: false }` — the same engine, the same actors, no big card and no big authored event;
//   * the **Ledger branch** (a farm day or more) hands the whole days to `advanceUnwatched`
//     (`ledger/unwatched.ts`), which moves the Ledger exactly as `advanceLedger` did and draws
//     **small** cards at farm-day resolution against the Ledger's own numbers, telling each one to
//     the chronicle so the storybook can tell it, then steps the remainder with `{ watched: false }`.
//
// Zero big things across any gap, of any length, on any seed. `test/engine-pace.test.ts` asserts it
// as an absolute rather than a floor.

import { tellLedgerDiff } from '../chronicle/ledger-diff';
import { cloneChronicle } from '../chronicle/store';
import { cloneEvents } from '../engine/events';
import { cloneRng, nextU32 } from '../rng';
import type { SimState } from '../state';
import { step } from '../step';
import { diffLedger, type LedgerDiff } from './diff';
import { dayMs, summarise, type Ledger } from './ledger';
import { respawn } from './respawn';
import { advanceUnwatched, type UnwatchedDraw } from './unwatched';

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
  /**
   * The small things the Ledger branch drew while nobody was watching, in time order — each already
   * told to the chronicle, so this is a report, not the record. Empty on the other two branches
   * (`none`, and `actors`, where a draw is an ordinary live start on the respawned world's own
   * chronicle). **Never anything big**, whatever the gap: see the file header.
   */
  unwatched: readonly UnwatchedDraw[];
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
 *   first tick. The result's `ledger` snapshot and `lastLedgerAt` are taken at the end. `respawn` is
 *   handed `state`'s own chronicle, so the respawned world carries it forward rather than starting
 *   fresh, and `tellLedgerDiff` (chronicle/ledger-diff.ts) tells this gap's diff onto it — the one
 *   span the Ledger runs with no actors in the room to tell it themselves.
 *
 * Pure: `state` is never modified.
 */
export function catchUp(state: SimState, awayMs: number, options: CatchUpOptions = {}): CatchUp {
  const minMs = options.minMs ?? 1000;
  const gap = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  const before = summarise(state);
  const day = dayMs(state);
  if (gap < minMs) {
    return { state, mode: 'none', awayMs: gap, ranMs: 0, ledgerDays: 0, ledgerMs: 0, actorMs: 0, before, after: before, diff: diffLedger(before, before), unwatched: [] };
  }
  if (gap < day) {
    // Unwatched: the same live engine on the same actors, with every big thing held back.
    const s = step(state, [], gap, { watched: false });
    const after = summarise(s);
    return { state: s, mode: 'actors', awayMs: gap, ranMs: gap, ledgerDays: 0, ledgerMs: 0, actorMs: gap, before, after, diff: diffLedger(before, after), unwatched: [] };
  }

  const ledgerDays = Math.floor(gap / day);
  const ledgerMs = ledgerDays * day;
  const actorMs = gap - ledgerMs;
  const rng = cloneRng(state.rng);
  // The engine slice and the chronicle cross the gap together, and now they cross it *doing
  // something*: `advanceUnwatched` moves the Ledger exactly as `advanceLedger` did (same pieces,
  // same draws from `rng`, same numbers out) and draws small cards against it from the engine's own
  // generator, telling each one. The respawned world then picks the engine up where the unwatched
  // days left it — cooldowns and gaps intact, anything that was still running ended by its first
  // look at the world.
  const events = cloneEvents(state.events);
  const log = { chronicle: cloneChronicle(state.chronicle) };
  const run = advanceUnwatched(before, ledgerMs, rng, events, log);
  const ledger = run.ledger;
  let s = respawn(ledger, log.chronicle, nextU32(rng), events);
  s.pendingIntents = state.pendingIntents.slice();
  s = step(s, [], actorMs, { watched: false });
  s = { ...s, ledger: summarise(s), lastLedgerAt: s.clock.nowMs };
  const after = summarise(s);
  const diff = diffLedger(before, after);
  tellLedgerDiff(s, diff);
  return { state: s, mode: 'ledger', awayMs: gap, ranMs: ledgerMs + actorMs, ledgerDays, ledgerMs, actorMs, before, after, diff, unwatched: run.drawn };
}

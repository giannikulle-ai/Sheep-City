// The Ledger: the farm district as numbers (plan, section 2, layer 1). `summarise` reads them off
// a `SimState`; `advanceLedger` (advance.ts) moves them a sim-minute at a time with no actors in
// the room; `respawn` (respawn.ts) builds actors back from them. Everything here is plain data,
// so a ledger can be cloned, hashed, saved, and diffed like the state it came from.
//
// What is a number and what is not: the clock, season, and weather are copied whole (they are
// numbers already). The flock is one fleece level per grown sheep plus one age per lamb, so the
// farmer's shearing rule and the lamb's growing-up rule keep working at ledger resolution and the
// round trip through `respawn` is exact. Grass is one level per tuft for the same reason. Nothing
// about positions, paths, poses, icons, or the small life survives: those are the actors' own.

import type { Clock, Season } from '../clock';
import { RULES } from '../rules';
import type { Banks, SimState } from '../state';
import type { Weather } from '../weather';

/** A lamb in the ledger: which grown sheep it trails (an index into `wool`) and how old it is. */
export interface LedgerLamb {
  mother: number;
  /** Sim milliseconds since birth. */
  ageMs: number;
}

export interface Ledger {
  /** The district's seed, as `SimState.seed`; `respawn` draws positions from it by default. */
  seed: number;
  clock: Clock;
  season: Season;
  weather: Weather;
  /** Grass level of each tuft, 0 to 1, in tuft order. */
  grass: number[];
  /** Fleece of each grown sheep, 0 to 1, in flock order. Its length is the flock's sheep count. */
  wool: number[];
  /** Every lamb on the farm, mothers in flock order. */
  lambs: LedgerLamb[];
  /** Wool banked, coins, upgrades owned: the state's `banks`. */
  banks: Banks;
  /** Sim time of the merchant's next visit. */
  merchantAtMs: number;
  /** The farmer's last-visit guard, as `Npcs.lastVisitKey`. */
  lastVisitKey: number;
  /** Next name index for a lamb that grows up, as `SimState.nameIdx`. */
  nameIdx: number;
  /** Digital Luna's mood, 0 to 1. A reading of the other numbers, see `moodOf`. */
  mood: number;
}

/** One ledger step: the plan's "ticks once per sim-minute". Catch-up runs whole days of these. */
export const LEDGER_STEP_MS = 60_000;

/** One sim-day in sim milliseconds at the world's current period: the catch-up policy's unit. */
export function dayMs(world: { clock: { periodSec: number } }): number {
  return world.clock.periodSec * 1000;
}

export function meanOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Digital Luna's mood as the ledger reads it: the equal-weight mean of fair weather (sun or not),
 * grass (the mean tuft level), and company (the flock against its cap). The actors carry no mood
 * of their own yet, so this is a reading, not a stock: it follows the other numbers and needs
 * nothing of its own to round-trip. The Director ticket can turn it into a stock the events move.
 */
export function moodOf(ledger: Pick<Ledger, 'weather' | 'grass' | 'wool' | 'lambs'>): number {
  const fair = ledger.weather.kind === 'sun' ? 1 : 0;
  const grass = meanOf(ledger.grass);
  const company = Math.min(1, (ledger.wool.length + ledger.lambs.length) / RULES.flockCap);
  return (fair + grass + company) / 3;
}

/**
 * The ledger of a state. Reads the numbers and drops the actors. A merchant mid-visit is folded
 * into `merchantAtMs`: still walking in, his trade is due now; already trading or leaving, the
 * next visit is one interval from now. A farmer mid-visit is simply gone; his visit key stays,
 * so the ledger does not run that visit a second time. Draws nothing from the generator.
 */
export function summarise(state: SimState): Ledger {
  const now = state.clock.nowMs;
  const merchant = state.npcs.merchant;
  let merchantAtMs = state.npcs.merchantAtMs;
  if (merchant) {
    const pending = merchant.job === 'enter' || (merchant.job === null && merchant.plan.some((j) => j.job === 'trade'));
    merchantAtMs = pending ? now : now + RULES.merchant.everyMs;
  }
  const lambs: LedgerLamb[] = [];
  state.sheep.forEach((s, mother) => {
    for (const l of s.lambs) lambs.push({ mother, ageMs: now - l.bornMs });
  });
  const ledger: Ledger = {
    seed: state.seed,
    clock: { ...state.clock },
    season: { ...state.season },
    weather: { ...state.weather },
    grass: state.tufts.map((t) => t.level),
    wool: state.sheep.map((s) => s.wool),
    lambs,
    banks: { wool: state.banks.wool, coins: state.banks.coins, owned: state.banks.owned.slice() },
    merchantAtMs,
    lastVisitKey: state.npcs.lastVisitKey,
    nameIdx: state.nameIdx,
    mood: 0,
  };
  ledger.mood = moodOf(ledger);
  return ledger;
}

/** A deep copy: every array and nested object is new. */
export function cloneLedger(ledger: Ledger): Ledger {
  return {
    ...ledger,
    clock: { ...ledger.clock },
    season: { ...ledger.season },
    weather: { ...ledger.weather },
    grass: ledger.grass.slice(),
    wool: ledger.wool.slice(),
    lambs: ledger.lambs.map((l) => ({ ...l })),
    banks: { ...ledger.banks, owned: ledger.banks.owned.slice() },
  };
}

/** Sheep plus lambs, what `RULES.flockCap` counts. */
export function ledgerFlock(ledger: Pick<Ledger, 'wool' | 'lambs'>): number {
  return ledger.wool.length + ledger.lambs.length;
}

// What a predicate reads. One `EventView` stands for one look at the world: the clock, weather and
// season fields are read straight off the state, and the four aggregates that cost something (the
// mean fleece, the mean grass, the flock's spread, the lamb distances) are computed on first ask
// and cached, so an evaluation that only needs the season never walks forty sheep.
//
// The three actor predicates the deck's own page (docs/content/EVENT_DECK.md) marks PROPOSED are
// implemented here for real, not stubbed: `lambFarFromMother` measures the lamb against the point
// its mother's trail springs it to, `flockScattered` measures the flock against its own centre,
// `dlFarFromFlock` measures Digital Luna against the same centre. Their thresholds are data below,
// with what each one is measuring against. `simMinutesSinceRain` is the fourth PROPOSED reading,
// and needs one stored number (`events.lastRainMs`) because nothing else in the world remembers
// when it last rained.

import { currentSeason, phaseOf, type Phase, type SeasonName } from '../clock';
import { LFOOT, SFOOT } from '../geometry';
import type { Lamb, Sheep, SimState } from '../state';
import type { WeatherKind } from '../weather';
import type { Predicate, PredicateOn, PredicateOp } from './deck';
import { msToSimMinutes } from './pacing';

/**
 * Every distance the actor predicates measure, in world pixels on the 640 by 400 field, with what
 * it is measured against. A first guess like the deck's own weights: the qa lane's event coverage
 * ticket is what tunes them.
 */
export const PREDICATE_RULES = {
  /**
   * A lamb is "far from its mother" past this many px from the point her trail springs it to
   * (`RULES.sheep.lambFollowRate` closes that gap every tick, so an ordinary lamb sits within a
   * pixel or two of it). 40 px is more than a sheep is wide: a lamb that far behind is one that
   * something held up, not one trailing normally.
   */
  lambFarPx: 40,
  /**
   * Digital Luna is "far from the flock" past this many px from the flock's centre. 150 px is
   * about a quarter of the field's width: she is across the field, not merely off to one side.
   */
  dlFarFromFlockPx: 150,
  /**
   * The flock is "scattered" when the mean distance from its own centre to each sheep is over
   * this. A flock grazing together sits inside 60 px of its centre; 110 px is spread across most
   * of the field.
   */
  flockScatterPx: 110,
} as const;

/**
 * What `simMinutesSinceRain` reads before it has ever rained. Large enough that every `lte`
 * comparison in the deck is false, finite so it survives a save (the state stores `lastRainMs`,
 * not this).
 */
export const NEVER_RAINED_SIM_MINUTES = 1e9;

/** One look at the world. Build with `viewOf`; it caches, so do not keep one across ticks. */
export interface EventView {
  readonly state: SimState;
  readonly now: number;
  readonly season: SeasonName;
  readonly weather: WeatherKind;
  readonly timeOfDay: Phase;
  /** Cache slots, filled on first ask. */
  wool: number | null;
  grass: number | null;
  flockCentre: { x: number; y: number; count: number } | null;
  scattered: boolean | null;
  lambFar: boolean | null;
}

export function viewOf(state: SimState): EventView {
  return {
    state,
    now: state.clock.nowMs,
    season: currentSeason(state.season),
    weather: state.weather.kind,
    timeOfDay: phaseOf(state.clock.t),
    wool: null,
    grass: null,
    flockCentre: null,
    scattered: null,
    lambFar: null,
  };
}

function meanWool(state: SimState): number {
  if (state.sheep.length === 0) return 0;
  let sum = 0;
  for (const s of state.sheep) sum += s.wool;
  return sum / state.sheep.length;
}

function meanGrass(state: SimState): number {
  if (state.tufts.length === 0) return 0;
  let sum = 0;
  for (const t of state.tufts) sum += t.level;
  return sum / state.tufts.length;
}

/** Sheep plus lambs, what `RULES.flockCap` counts. */
function flockSize(state: SimState): number {
  let n = state.sheep.length;
  for (const s of state.sheep) n += s.lambs.length;
  return n;
}

function lambPresent(state: SimState): boolean {
  for (const s of state.sheep) if (s.lambs.length) return true;
  return false;
}

/** The flock's centre in foot coordinates, and how many sheep it is the centre of. */
function flockCentre(view: EventView): { x: number; y: number; count: number } {
  if (view.flockCentre) return view.flockCentre;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const s of view.state.sheep) {
    if (s.inBarn) continue;
    x += s.x + SFOOT[0];
    y += s.y + SFOOT[1];
    count++;
  }
  const centre = count === 0 ? { x: 0, y: 0, count: 0 } : { x: x / count, y: y / count, count };
  view.flockCentre = centre;
  return centre;
}

function scattered(view: EventView): boolean {
  if (view.scattered !== null) return view.scattered;
  const centre = flockCentre(view);
  // One sheep, or none, is not a flock and cannot be scattered.
  if (centre.count < 2) return (view.scattered = false);
  let spread = 0;
  for (const s of view.state.sheep) {
    if (s.inBarn) continue;
    spread += Math.hypot(s.x + SFOOT[0] - centre.x, s.y + SFOOT[1] - centre.y);
  }
  return (view.scattered = spread / centre.count > PREDICATE_RULES.flockScatterPx);
}

function dlFarFromFlock(view: EventView): boolean {
  const centre = flockCentre(view);
  if (centre.count === 0) return false;
  const l = view.state.luna;
  return Math.hypot(l.x + LFOOT[0] - centre.x, l.y + LFOOT[1] - centre.y) > PREDICATE_RULES.dlFarFromFlockPx;
}

/**
 * Where a mother's trail springs her first lamb to, in sprite top-left coordinates: the same
 * `px, py` the lamb-trailing loop in behaviours/sheep.ts eases each lamb towards. A lamb that is
 * not the first in the line trails the one before it, so its anchor is that lamb's own position.
 */
export function lambAnchor(mother: Sheep, index: number): { x: number; y: number } {
  let px = mother.x - mother.dir * 18;
  let py = mother.y + 8;
  for (let i = 0; i < index; i++) {
    const before = mother.lambs[i] as Lamb;
    // A lost lamb is skipped by the trail, so it is not the anchor for the ones behind it either.
    if (before.lost) continue;
    px = before.x - mother.dir * 14;
    py = before.y + 2;
  }
  return { x: px, y: py };
}

/** How far this lamb is from the point its mother's trail would spring it to. */
export function lambDistance(mother: Sheep, index: number): number {
  const lamb = mother.lambs[index];
  if (!lamb) return 0;
  const anchor = lambAnchor(mother, index);
  return Math.hypot(lamb.x - anchor.x, lamb.y - anchor.y);
}

function lambFarFromMother(view: EventView): boolean {
  if (view.lambFar !== null) return view.lambFar;
  for (const s of view.state.sheep) {
    for (let i = 0; i < s.lambs.length; i++) {
      if (lambDistance(s, i) > PREDICATE_RULES.lambFarPx) return (view.lambFar = true);
    }
  }
  return (view.lambFar = false);
}

/** What one predicate's `on` reads right now. */
export function readPredicate(view: EventView, on: PredicateOn): string | number | boolean {
  const state = view.state;
  switch (on) {
    case 'season':
      return view.season;
    case 'weather':
      return view.weather;
    case 'timeOfDay':
      return view.timeOfDay;
    case 'simMinutesSinceRain': {
      const last = state.events.lastRainMs;
      return last < 0 ? NEVER_RAINED_SIM_MINUTES : msToSimMinutes(view.now - last, state.clock.periodSec);
    }
    case 'ledger.wool':
      return (view.wool ??= meanWool(state));
    case 'ledger.grass':
      return (view.grass ??= meanGrass(state));
    case 'ledger.coins':
      return state.banks.coins;
    case 'ledger.flock':
      return flockSize(state);
    case 'lambFarFromMother':
      return lambFarFromMother(view);
    case 'dlFarFromFlock':
      return dlFarFromFlock(view);
    case 'flockScattered':
      return scattered(view);
    case 'merchantPresent':
      return state.npcs.merchant !== null;
    case 'lambPresent':
      return lambPresent(state);
    case 'farmerPresent':
      return state.npcs.farmer !== null;
    default: {
      const never: never = on;
      throw new Error(`event predicate: unknown reading ${String(never)}`);
    }
  }
}

/** Compare a reading against a predicate's value. A type mismatch is false, never a throw. */
export function compare(actual: string | number | boolean, op: PredicateOp, value: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === value;
    case 'ne':
      return actual !== value;
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'not-in':
      return Array.isArray(value) && !value.includes(actual);
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    default: {
      const never: never = op;
      throw new Error(`event predicate: unknown operator ${String(never)}`);
    }
  }
}

/** Does this predicate hold right now? */
export function holds(view: EventView, predicate: Predicate): boolean {
  return compare(readPredicate(view, predicate.on), predicate.op, predicate.value);
}

/** Do all of them hold? An empty list holds (nothing is asked of the world). */
export function allHold(view: EventView, predicates: readonly Predicate[]): boolean {
  for (const p of predicates) if (!holds(view, p)) return false;
  return true;
}

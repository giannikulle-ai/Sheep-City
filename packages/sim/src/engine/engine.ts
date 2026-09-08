// The engine. It looks at the world once a sim-minute and decides what happens, from three
// sources (plan section 2, "Layer 3: the event engine" — nothing in the code is named for the
// role the plan retired; the engine directs, and events happen in the world):
//
//   1. authored events, which become eligible on their own trigger and outrank cards while they run;
//   2. scheduled category actions, the world's type-wide rhythm (engine/category.ts);
//   3. cards, drawn under a pacing target from the eligible set, weighted live.
//
// Order inside one look at the world: end what is due, run the category actions, then authored
// events, then the card draw. Authored before cards is the plan's "when an authored event and a
// card share parameters the authored event wins, so a small random card never steps on something
// with a more interesting result" — the authored event takes its slot first, and every card it
// outranks is out of the running for the same minute.
//
// Every start and every end writes to the chronicle through `tell`. Only `card` and `authored`
// lines carry a `hint`; no line carries an event id in its `facts` (a fact key is a thing the
// world measures, not a name of a card).

import { tell } from '../chronicle/store';
import { FARM_DISTRICT } from '../chronicle/types';
import { currentSeason, SEASON_MS } from '../clock';
import { nextFloat } from '../rng';
import type { SimState } from '../state';
import { runScheduledCategoryActions } from './category';
import { FARM_DECK, momentKindOf, type AuthoredEvent, type Card, type Deck, type EventHookOp } from './deck';
import { isRunning, runningCount, type RunningEvent } from './events';
import { REFERENCE_EFFECTS, runHooks } from './hooks';
import { drawChance, msToSimMinutes, PACING, pacingAt, simDaysToMs, simHoursToMs, simMinutesToMs, simMinuteMs } from './pacing';
import { allHold, holds, viewOf, type EventView } from './view';

/**
 * What a bare parameter name in an authored event's `priorityOver` covers. A card is pre-empted by
 * a running authored event when that event names the card's own id, or names a parameter this card
 * writes (a hook op) or is (a moment kind). Data, so the mapping is readable rather than a chain
 * of special cases: `mood` is every card with a mood hook, `weather` is every card that dims the
 * field or whose moment is a weather one.
 */
export const PARAMETER_COVERAGE: Readonly<Record<string, { hooks: readonly EventHookOp[]; moments: readonly string[] }>> = {
  mood: { hooks: ['mood'], moments: [] },
  weather: { hooks: ['setVisibility'], moments: ['weather'] },
  visibility: { hooks: ['setVisibility'], moments: [] },
  coins: { hooks: ['coins'], moments: [] },
  spawn: { hooks: ['spawn'], moments: [] },
};

/**
 * Which day of its season the world is on, counting from 1: the sim time elapsed inside the current
 * season, divided by one sim-day (the clock's own period).
 *
 * Worth knowing what that means in this world, because the content's own page reads it differently
 * (docs/content/EVENT_DECK.md: "the sim has a running `dayCount` and a season cycle but no explicit
 * day-within-the-season concept yet; `simDate` assumes `clock.dayCount mod 9`"). A season here is
 * `SEASON_MS`, nine *real* days of sim time (clock.ts), while a sim-day is the clock's 180-second
 * period — so a season is 4,320 sim-days, not 9, and "the first day of spring" is a three-real-
 * minute window that comes round about once every nine real days of watching. `dayCount mod 9`
 * would instead make the birthday a thing that happens every nine sim-days, about every 27 real
 * minutes, which is not a birthday. This reads the calendar the sim actually keeps; the mismatch
 * is a schema question for the world lane, raised on the issue.
 */
export function dayOfSeason(state: SimState): number {
  const dayMs = state.clock.periodSec * 1000;
  const intoSeason = ((state.season.elapsedMs % SEASON_MS) + SEASON_MS) % SEASON_MS;
  return Math.floor(intoSeason / dayMs) + 1;
}

/** Does this card write, or is it, a parameter the name covers? */
function cardTouchesParameter(card: Card, name: string): boolean {
  const coverage = PARAMETER_COVERAGE[name];
  if (!coverage) return false;
  if (coverage.moments.includes(card.moment.kind)) return true;
  for (const hook of card.hooks.start) if (coverage.hooks.includes(hook.op)) return true;
  for (const hook of card.hooks.end) if (coverage.hooks.includes(hook.op)) return true;
  return false;
}

/** Is this card outranked by an authored event running right now? */
export function preemptedByAuthored(state: SimState, deck: Deck, card: Card): boolean {
  for (const running of state.events.running) {
    if (running.kind !== 'authored') continue;
    const entry = deck.byId.get(running.id);
    if (!entry || entry.kind !== 'authored') continue;
    for (const name of entry.event.priorityOver) {
      if (name === card.id || cardTouchesParameter(card, name)) return true;
    }
  }
  return false;
}

/** This card's live weight: its base times every multiplier whose `when` holds right now. */
export function liveWeight(view: EventView, card: Card): number {
  let weight = card.weight.base;
  for (const m of card.weight.multipliers) if (holds(view, m.when)) weight *= m.times;
  return weight;
}

/** A card that could be drawn right now, with the weight it would be drawn at. */
export interface EligibleCard {
  card: Card;
  weight: number;
}

/**
 * Every card the engine could draw at this moment, with its live weight. A card is eligible when
 * every one of its conditions holds, it is under its own concurrency limit, its cooldown and its
 * own minimum gap have passed, no running authored event outranks it, and it is not the same
 * moment kind as the last event that started (PACING.noRepeatMomentKind).
 *
 * That last one is a pacing preference rather than a limit, and it is the one rule the quiet
 * relaxation lifts: once the world has been quiet for the stretch, two lambs in a row is a better
 * answer than nothing at all, and on a small deck (or a season whose nights have only one card in
 * them) the no-repeat rule is otherwise a lockout.
 */
export function eligibleCards(state: SimState, deck: Deck = FARM_DECK, view: EventView = viewOf(state)): EligibleCard[] {
  const e = state.events;
  const now = view.now;
  const periodSec = state.clock.periodSec;
  const relaxed = pacingAt(e.lastStartMs, now, periodSec).relaxed;
  const out: EligibleCard[] = [];
  for (const card of deck.cards) {
    if (runningCount(e, card.id) >= card.limits.concurrent) continue;
    const cooldownUntil = e.cooldowns[card.id];
    if (cooldownUntil !== undefined && now < cooldownUntil) continue;
    // The card's own minimum gap, start to start, on top of the cooldown from its end. In this
    // deck the two always agree by construction (`minGapSimMinutes` is the duration plus the
    // cooldown, see docs/content/EVENT_DECK.md); both are enforced so a deck where they disagree
    // is held to whichever is longer rather than to whichever the engine happened to check.
    const lastStart = e.starts[card.id];
    if (lastStart !== undefined && msToSimMinutes(now - lastStart, periodSec) < card.limits.minGapSimMinutes) continue;
    if (PACING.noRepeatMomentKind && !relaxed && e.lastMomentKind === card.moment.kind) continue;
    if (preemptedByAuthored(state, deck, card)) continue;
    if (!allHold(view, card.conditions)) continue;
    out.push({ card, weight: liveWeight(view, card) });
  }
  return out;
}

/** Start an event by id, whatever its trigger or conditions say. Returns what is now running, or null. */
export function startEvent(state: SimState, deck: Deck, id: string, kind: 'card' | 'authored'): RunningEvent | null {
  const entry = deck.byId.get(id);
  if (!entry || entry.kind !== kind) return null;
  const e = state.events;
  const now = state.clock.nowMs;
  const event: Card | AuthoredEvent = entry.kind === 'card' ? entry.card : entry.event;
  const running: RunningEvent = {
    id,
    kind,
    startedMs: now,
    endsMs: now + simMinutesToMs(event.durationSimMinutes, state.clock.periodSec),
  };
  e.running.push(running);
  e.starts[id] = now;
  e.lastStartMs = now;
  e.lastMomentKind = event.moment.kind;
  if (kind === 'card') e.lastDrawMs = now;
  runHooks(state, event.hooks.start);
  REFERENCE_EFFECTS[id]?.start?.(state);
  tell(state, {
    atMs: now,
    district: FARM_DISTRICT,
    line: event.storybook.line,
    picture: event.storybook.picture,
    source: kind,
    actors: actorsOf(state, id),
    hint: event.storybook.notability,
  });
  return running;
}

/** The actors an event's line is about, where the engine knows one. */
function actorsOf(state: SimState, id: string): string[] {
  const lost = state.events.lostLamb;
  if (id === 'lostLamb' && lost) return [lost.sheep];
  return [];
}

/**
 * End a running event: its own code effect first (so it can put the world back), then its data end
 * hooks, then the cooldown, then the chronicle line. `reason` is for the line: `'due'` when its
 * duration ran out, `'early'` when the world finished it (a fetched lamb), `'reset'` when the owner
 * reset it.
 */
export function endEvent(state: SimState, deck: Deck, id: string, reason: 'due' | 'early' | 'reset' = 'due'): void {
  const e = state.events;
  const index = e.running.findIndex((r) => r.id === id);
  if (index < 0) return;
  const running = e.running[index] as RunningEvent;
  e.running.splice(index, 1);
  const entry = deck.byId.get(id);
  const now = state.clock.nowMs;
  REFERENCE_EFFECTS[id]?.end?.(state);
  if (!entry) return;
  const event: Card | AuthoredEvent = entry.kind === 'card' ? entry.card : entry.event;
  runHooks(state, event.hooks.end);
  e.cooldowns[id] = now + cooldownMs(state, entry.kind === 'card' ? entry.card : entry.event, entry.kind);
  const ranSimMinutes = Math.round(msToSimMinutes(now - running.startedMs, state.clock.periodSec));
  tell(state, {
    atMs: now,
    district: FARM_DISTRICT,
    line: reason === 'reset' ? `${event.title} was called off.` : `${event.title} ended after ${ranSimMinutes} sim-minutes.`,
    picture: `${event.storybook.picture}-end`,
    source: entry.kind,
    // An end is a real fact and is always told, but a storybook page is built from the thing that
    // happened, not from its closing bracket: PACING.endHintShare of the start's own hint.
    hint: event.storybook.notability * PACING.endHintShare,
  });
}

/** How long this event is barred after it ends. */
function cooldownMs(state: SimState, event: Card | AuthoredEvent, kind: 'card' | 'authored'): number {
  const periodSec = state.clock.periodSec;
  if (kind === 'card') return simHoursToMs((event as Card).limits.cooldownSimHours, periodSec);
  const trigger = (event as AuthoredEvent).trigger;
  // A date has no cooldown of its own: it is barred for just under one four-season cycle, so "the
  // first day of spring" comes round once a year and cannot fire twice in the same spring.
  if (trigger.kind === 'simDate') return SEASON_MS * 4 * PACING.simDateCooldownCycles;
  return simDaysToMs(trigger.cooldownSimDays, periodSec);
}

/** Is this authored event's trigger met right now? Cooldown and "already running" are checked outside. */
export function triggerMet(state: SimState, view: EventView, event: AuthoredEvent): boolean {
  const trigger = event.trigger;
  switch (trigger.kind) {
    case 'predicates':
      return allHold(view, trigger.all);
    case 'simDate':
      return currentSeason(state.season) === trigger.season && dayOfSeason(state) === trigger.dayOfSeason;
    case 'stockThreshold':
      return holds(view, { on: trigger.on, op: trigger.op, value: trigger.value });
    default: {
      const never: never = trigger;
      throw new Error(`authored trigger: unknown kind ${JSON.stringify(never)}`);
    }
  }
}

/** Every authored event whose trigger is met and whose cooldown has passed, in deck order. */
export function readyAuthored(state: SimState, deck: Deck = FARM_DECK, view: EventView = viewOf(state)): AuthoredEvent[] {
  const e = state.events;
  const out: AuthoredEvent[] = [];
  for (const event of deck.authored) {
    if (isRunning(e, event.id)) continue;
    const until = e.cooldowns[event.id];
    if (until !== undefined && view.now < until) continue;
    if (!triggerMet(state, view, event)) continue;
    out.push(event);
  }
  return out;
}

/**
 * End every running event whose time is up, or which the world has already finished. Nothing is
 * allocated on the common path (nothing is due): the copy the splice inside `endEvent` needs is
 * only taken once something actually has to end.
 */
function endDue(state: SimState, deck: Deck): void {
  const e = state.events;
  const now = state.clock.nowMs;
  let due = false;
  for (const running of e.running) {
    if (now >= running.endsMs || REFERENCE_EFFECTS[running.id]?.done?.(state) === true) {
      due = true;
      break;
    }
  }
  if (!due) return;
  for (const running of e.running.slice()) {
    if (now >= running.endsMs) endEvent(state, deck, running.id, 'due');
    else if (REFERENCE_EFFECTS[running.id]?.done?.(state) === true) endEvent(state, deck, running.id, 'early');
  }
}

/**
 * Is a draw allowed at all right now — under the global concurrency cap, and far enough past the
 * last draw for the gap the pacing is in force with? Exported because it is exactly what the
 * relaxation test asserts: the same predicate the draw itself uses, not a re-derivation of it.
 */
export function drawAllowed(state: SimState): boolean {
  const e = state.events;
  const now = state.clock.nowMs;
  if (e.running.length >= PACING.concurrentCap) return false;
  if (e.lastDrawMs < 0) return true;
  const pacing = pacingAt(e.lastStartMs, now, state.clock.periodSec);
  return msToSimMinutes(now - e.lastDrawMs, state.clock.periodSec) >= pacing.gapSimMinutes;
}

/** One card draw attempt under the pacing target. Returns the card that started, or null. */
function attemptDraw(state: SimState, deck: Deck, view: EventView): RunningEvent | null {
  const e = state.events;
  if (!drawAllowed(state)) return null;
  const pacing = pacingAt(e.lastStartMs, state.clock.nowMs, state.clock.periodSec);
  const eligible = eligibleCards(state, deck, view);
  if (eligible.length === 0) return null;
  // Each card's own gap, start to start, on top of the global one.
  let total = 0;
  for (const item of eligible) total += item.weight;
  const chance = drawChance(total, pacing.weightBoost);
  // No eligible weight, no roll: a quiet field never burns a draw from the generator, so the
  // engine's stream depends only on the attempts it actually made.
  if (chance <= 0) return null;
  if (nextFloat(e.rng) >= chance) return null;
  let pick = nextFloat(e.rng) * total;
  for (const item of eligible) {
    pick -= item.weight;
    if (pick < 0) return startEvent(state, deck, item.card.id, 'card');
  }
  return startEvent(state, deck, (eligible[eligible.length - 1] as EligibleCard).card.id, 'card');
}

/** One look at the world: ends, category actions, authored triggers, then a card draw. */
export function evaluate(state: SimState, deck: Deck = FARM_DECK): void {
  endDue(state, deck);
  runScheduledCategoryActions(state);
  // One view for the whole look at the world: its aggregates (the mean fleece, the mean grass, the
  // flock's spread) are computed at most once even though the triggers and every card read them.
  const view = viewOf(state);
  for (const event of readyAuthored(state, deck, view)) {
    if (state.events.running.length >= PACING.concurrentCap) break;
    startEvent(state, deck, event.id, 'authored');
  }
  attemptDraw(state, deck, view);
}

/**
 * One tick of the engine, called from `tickInPlace` after the weather and before the actors, so a
 * card that starts this tick is already true for the actors this tick. Cheap on most ticks: the
 * running events' own per-tick effects, and a look at the world only when a sim-minute has passed.
 */
export function tickEngine(state: SimState, deck: Deck = FARM_DECK): void {
  const e = state.events;
  if (!e.enabled) return;
  const now = state.clock.nowMs;
  if (state.weather.rain) e.lastRainMs = now;
  for (const running of e.running) REFERENCE_EFFECTS[running.id]?.tick?.(state);
  if (now < e.nextEvalMs) return;
  const minute = simMinuteMs(state.clock.periodSec) * PACING.evalEverySimMinutes;
  e.nextEvalMs += minute;
  // A jump in time (a loaded save, a respawn, a long step) resumes from now rather than catching
  // up every sim-minute it missed: the engine looks at the world it is in, not the one it left.
  if (e.nextEvalMs <= now) e.nextEvalMs = now + minute;
  evaluate(state, deck);
}

/**
 * The owner's `authored` intent: `trigger` starts an authored event whatever its own trigger says
 * (the plan's "the owner can trigger and reset world-impacting events from the interface"), and
 * `reset` ends one that is running and clears its cooldown so it can happen again. Both are no-ops
 * for an id the deck does not carry, or for `trigger` on one already running.
 */
export function applyAuthoredIntent(state: SimState, id: string, action: 'trigger' | 'reset', deck: Deck = FARM_DECK): void {
  const entry = deck.byId.get(id);
  if (!entry || entry.kind !== 'authored') return;
  const e = state.events;
  if (action === 'trigger') {
    if (isRunning(e, id)) return;
    startEvent(state, deck, id, 'authored');
    return;
  }
  if (isRunning(e, id)) endEvent(state, deck, id, 'reset');
  delete e.cooldowns[id];
}

/** The pacing in force right now: what a draw attempt is being held to, and whether it is relaxed. */
export function pacingNow(state: SimState): ReturnType<typeof pacingAt> {
  return pacingAt(state.events.lastStartMs, state.clock.nowMs, state.clock.periodSec);
}

/** The moment kinds running right now, for the watch test and a debug overlay. */
export function runningMoments(state: SimState, deck: Deck = FARM_DECK): string[] {
  const out: string[] = [];
  for (const running of state.events.running) {
    const kind = momentKindOf(running.id, deck);
    if (kind) out.push(kind);
  }
  return out;
}


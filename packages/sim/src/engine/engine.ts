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
 * A season here is `SEASON_MS`, nine *real* days of sim time (clock.ts), while a sim-day is the
 * clock's 180-second period — so a season is 4,320 sim-days, not nine, and one season-day is a
 * three-real-minute window. This reads the calendar the sim actually keeps.
 */
export function dayOfSeason(state: SimState): number {
  const dayMs = state.clock.periodSec * 1000;
  const intoSeason = ((state.season.elapsedMs % SEASON_MS) + SEASON_MS) % SEASON_MS;
  return Math.floor(intoSeason / dayMs) + 1;
}

/**
 * How far through the current season the world is, as a fraction: 0 at the season's first moment,
 * 0.5 at its midpoint, approaching but never reaching 1 at its end.
 *
 * This is the shape a `simDate` trigger's `dayOfSeason` is written in as of the world lane's #83
 * (`packages/content/schema/authored-events.schema.json`: "0 is the first moment of the season, up
 * to (not including) 1 at the season's end; e.g. 0.5 is the season's midpoint whether that season
 * ran 81 real days or 101"). It used to be a 1-based integer day index 1-9, and this engine read it
 * as one — a mismatch the round-3 verifier caught. A fraction is the reading that survives #84:
 * once seasons take their length from `outsideRules.seasons.calendar` and stop being nine real days
 * each, "halfway through summer" still means something and "day 5 of 9" does not. Nothing about the
 * fraction needs the real-year calendar, only a season's own start and length, which the sim has
 * today — so this is implemented now rather than deferred with `realDate`.
 *
 * `seasonDayOfFraction` below turns such a fraction back into the season-day that contains it, so a
 * `simDate` trigger still fires for exactly one sim-day (three real minutes) and not for a single
 * floating-point instant no clock would ever land on.
 */
export function seasonFraction(state: SimState): number {
  const intoSeason = ((state.season.elapsedMs % SEASON_MS) + SEASON_MS) % SEASON_MS;
  return intoSeason / SEASON_MS;
}

/** The season-day (1-based, same basis as `dayOfSeason`) that a [0, 1) season fraction falls in. */
export function seasonDayOfFraction(state: SimState, fraction: number): number {
  const dayMs = state.clock.periodSec * 1000;
  return Math.floor((fraction * SEASON_MS) / dayMs) + 1;
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
 * reset it, `'evicted'` when the owner's own trigger needed the room (see `applyAuthoredIntent`).
 * Whatever `reason` says, if the deck no longer carries this id — a save from a build whose deck has
 * since dropped a card (finding 5, Round 1, #82) — there are no hooks and no cooldown to set, only a
 * chronicle line saying so; see the `entry` check below.
 */
export function endEvent(
  state: SimState,
  deck: Deck,
  id: string,
  reason: 'due' | 'early' | 'reset' | 'evicted' = 'due',
): void {
  const e = state.events;
  const index = e.running.findIndex((r) => r.id === id);
  if (index < 0) return;
  const running = e.running[index] as RunningEvent;
  e.running.splice(index, 1);
  const entry = deck.byId.get(id);
  const now = state.clock.nowMs;
  REFERENCE_EFFECTS[id]?.end?.(state);
  if (!entry) {
    // The deck this save (or this build) carries no longer has this id (finding 5, Round 1, #82):
    // no hooks to run, no cooldown to set — there is nothing left to look one up on — but it ran,
    // and its end is a fact, so it still gets a chronicle line.
    tell(state, {
      atMs: now,
      district: FARM_DISTRICT,
      line: `${id} ended; the deck no longer carries it.`,
      picture: 'event-end',
      source: 'card',
      hint: 0,
    });
    return;
  }
  const event: Card | AuthoredEvent = entry.kind === 'card' ? entry.card : entry.event;
  runHooks(state, event.hooks.end);
  e.cooldowns[id] = now + cooldownMs(state, entry.kind === 'card' ? entry.card : entry.event, entry.kind);
  const ranSimMinutes = Math.round(msToSimMinutes(now - running.startedMs, state.clock.periodSec));
  const line =
    reason === 'reset'
      ? `${event.title} was called off.`
      : reason === 'evicted'
        ? `${event.title} ended early to make room for the owner's own hand.`
        : `${event.title} ended after ${ranSimMinutes} sim-minutes.`;
  tell(state, {
    atMs: now,
    district: FARM_DISTRICT,
    line,
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
  // first day of spring" comes round once a year and cannot fire twice in the same spring. The
  // same bar covers `realDate`, which is deferred to #84 and so can only ever be started by the
  // owner's own hand (`applyAuthoredIntent`) — the number just has to be finite and sane until
  // #84 replaces it with a real year.
  if (trigger.kind === 'simDate' || trigger.kind === 'realDate') return SEASON_MS * 4 * PACING.simDateCooldownCycles;
  return simDaysToMs(trigger.cooldownSimDays, periodSec);
}

/** Is this authored event's trigger met right now? Cooldown and "already running" are checked outside. */
export function triggerMet(state: SimState, view: EventView, event: AuthoredEvent): boolean {
  const trigger = event.trigger;
  switch (trigger.kind) {
    case 'predicates':
      return allHold(view, trigger.all);
    // `dayOfSeason` on the trigger is a fraction of the season, not a day number (#83's schema; see
    // `seasonFraction`). The event is due for the whole sim-day that fraction falls in.
    case 'simDate':
      return currentSeason(state.season) === trigger.season && dayOfSeason(state) === seasonDayOfFraction(state, trigger.dayOfSeason);
    case 'stockThreshold':
      return holds(view, { on: trigger.on, op: trigger.op, value: trigger.value });
    // Deferred to #84, and false every single time until then. `realDate` means a date in the real
    // calendar — Digital Luna's birthday is December 15 (the owner's calendar decision, plan
    // section 2; put on this trigger by the world lane in #83). Answering "is it December 15 now?"
    // needs the real-year calendar — `outsideRules.seasons.calendar` in
    // `packages/content/balance/farm.json` — wired into the sim as an input, and that wiring is
    // ticket #84's, not this engine's (#40). This engine has no real date to compare against, so
    // there is no honest answer but "not yet": the deck loads the event (marked `deferred`, see
    // `deck.ts`), it sits in `deck.authored` where #84 will find it, and it never starts by
    // itself. The owner's own hand can still start it (`applyAuthoredIntent(..., 'trigger')`
    // deliberately ignores the trigger), which is how the birthday is exercised today.
    case 'realDate':
      return false;
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
  // The warm-up (PACING.warmupSimMinutes): no card draws in a fresh world's first stretch, so the
  // very first look at the world does not win a card before the player has settled in. Authored
  // events and category actions are not gated by this — they run earlier in `evaluate`, before this
  // function is even called.
  if (msToSimMinutes(state.clock.nowMs, state.clock.periodSec) < PACING.warmupSimMinutes) return null;
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

/**
 * A cheap-only pass: could this look at the world possibly start anything at all? No predicate
 * view is built here and nothing is allocated — just `running.length`, cooldowns already on
 * `state.events`, and the same pacing gap `drawAllowed` itself checks, none of which needs a card
 * or a trigger's own conditions read. It only has to rule out the common case where nothing at all
 * can start; saying "yes" for an authored event that has never fired (so has no cooldown yet) even
 * though its own predicate rarely holds is fine — the goal is to skip the object allocation and
 * the predicate reads on the evaluations where the answer is already a plain "no" from data the
 * engine has in hand (Round 2 verifier finding B, #82: the catch-up budget).
 */
function couldStartSomething(state: SimState, deck: Deck): boolean {
  const e = state.events;
  if (e.running.length >= PACING.concurrentCap) return false; // every start path checks this first
  const now = state.clock.nowMs;
  for (const event of deck.authored) {
    if (event.deferred) continue; // a deferred trigger (`realDate`, #84) can never be met: never worth a look
    if (isRunning(e, event.id)) continue;
    const until = e.cooldowns[event.id];
    if (until === undefined || now >= until) return true; // off cooldown: worth a real look
  }
  return msToSimMinutes(now, state.clock.periodSec) >= PACING.warmupSimMinutes && drawAllowed(state);
}

/**
 * One look at the world: ends, category actions, authored triggers, then a card draw. The
 * predicate view — and everything it can cost to build (the mean fleece, the mean grass, the
 * flock's spread, each an O(actors) walk cached on first ask) — is built only when
 * `couldStartSomething` says a start is actually possible (Round 2 verifier finding B, #82: the
 * catch-up budget). With the global gap at 800 sim-minutes and every authored trigger usually on
 * cooldown, most evaluations are a "no" the engine already knows without reading a single card's
 * conditions; those cost a handful of comparisons and nothing more.
 */
export function evaluate(state: SimState, deck: Deck = FARM_DECK): void {
  endDue(state, deck);
  runScheduledCategoryActions(state);
  if (!couldStartSomething(state, deck)) return;
  // One view for the whole look at the world: its aggregates are computed at most once even
  // though the triggers and every card read them.
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
 * The running event to give up when the owner's hand needs the room: the oldest-started `card`, so
 * an authored event never gets bumped for another authored event while an ordinary card is running
 * next to it; the oldest-started running event of any kind if every slot happens to be authored
 * (Round 1 verifier finding 3, #82 — undecided by the plan, so the tie-break is "oldest wins", the
 * same rule `runningMoments` and the draw already read `running` in).
 */
function oldestToEvict(state: SimState): RunningEvent | null {
  const running = state.events.running;
  if (running.length === 0) return null;
  let oldestCard: RunningEvent | null = null;
  let oldestAny: RunningEvent = running[0] as RunningEvent;
  for (const r of running) {
    if (r.startedMs < oldestAny.startedMs) oldestAny = r;
    if (r.kind === 'card' && (oldestCard === null || r.startedMs < oldestCard.startedMs)) oldestCard = r;
  }
  return oldestCard ?? oldestAny;
}

/**
 * The owner's `authored` intent: `trigger` starts an authored event whatever its own trigger says
 * (the plan's "the owner can trigger and reset world-impacting events from the interface"), and
 * `reset` ends one that is running and clears its cooldown so it can happen again. Both are no-ops
 * for an id the deck does not carry, or for `trigger` on one already running.
 *
 * `trigger` respects `PACING.concurrentCap` the way `evaluate`'s own authored and card draws do
 * (Round 1 verifier finding 3, #82): the owner's hand is not a way around the cap. When the cap is
 * already full it evicts the oldest running event to make room — see `oldestToEvict` — rather than
 * silently doing nothing, so the owner's hand always works and the cap still holds at every tick.
 */
export function applyAuthoredIntent(state: SimState, id: string, action: 'trigger' | 'reset', deck: Deck = FARM_DECK): void {
  const entry = deck.byId.get(id);
  if (!entry || entry.kind !== 'authored') return;
  const e = state.events;
  if (action === 'trigger') {
    if (isRunning(e, id)) return;
    if (e.running.length >= PACING.concurrentCap) {
      const evicted = oldestToEvict(state);
      if (evicted) endEvent(state, deck, evicted.id, 'evicted');
    }
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


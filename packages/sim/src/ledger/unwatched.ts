// The unwatched draw: what happens on the farm while nobody is looking.
//
// The owner's decision (2026-09-09, plan decision 16): "small thing most days, big thing a few a
// month; the big ones should not happen when I am not watching". So a week away is not a week of
// nothing — the small things keep happening, at the same per-farm-day rate they do in live play, and
// they are told to the chronicle so the storybook has something true to say about the week. The big
// things do not happen at all, and that is an absolute, not a floor.
//
// This is the Ledger branch's half of that (a farm day or more away). The actor branch — under a
// farm day — needs none of this: it runs the ordinary live code with `watched: false`, which is the
// same engine with the big draws switched off. See `catch-up.ts` for the two branches and
// `engine/engine.ts`'s header for how the sim knows which one it is in.
//
// What a look at the world sees here, and what it does not. There are no actors in the room, so the
// three actor predicates (`lambFarFromMother`, `dlFarFromFlock`, `flockScattered`) and the two
// presence ones (`merchantPresent`, `farmerPresent`) read false: a card that needs the flock
// scattered or the farmer standing in the field cannot draw on an unwatched day, and that is honest
// rather than a gap — nothing was scattered, because nothing was there to scatter. Everything else
// is read straight off the Ledger, which is the same arithmetic `viewOf` reads off the actors:
// season and weather as the Ledger rolls them, the mean fleece and the mean tuft level, the coins,
// the flock count, whether there is a lamb. The time band moves with the look's own instant, so all
// four bands get their turn across a day and a dawn-only card can still draw.
//
// Determinism: every draw comes from the engine's own generator (`events.rng`, the state's engine
// slice), never from the world generator the Ledger's own arithmetic draws on. So a given save and
// a given gap give one answer, and — the reason it matters — the Ledger's numbers after a catch-up
// are bit-for-bit what they were before this file existed. The stocks did not move; only what was
// told about them did.

import { tell, type Chronicle } from '../chronicle/store';
import { FARM_DISTRICT } from '../chronicle/types';
import { phaseOf, seasonAt, SEASON_MS, type Phase, type SeasonName } from '../clock';
import { FARM_DECK, type AuthoredEvent, type Card, type Deck, type EventHook, type EventHooks, type Predicate, type PredicateOn } from '../engine/deck';
import type { EventsState } from '../engine/events';
import { drawChance, msToSimMinutes, NO_REPEAT_SIM_MINUTES, PACING, simHoursToMs, simMinutesToMs, SIZE_PACING, UNWATCHED_LOOK_SIM_MINUTES, WARMUP_SIM_MINUTES } from '../engine/pacing';
import { compare } from '../engine/view';
import { lastDrawOfSizeIn } from '../engine/engine';
import { nextFloat, type Rng } from '../rng';
import { advanceLedger } from './advance';
import { LEDGER_STEP_MS, ledgerFlock, meanOf, type Ledger } from './ledger';

/** One thing the unwatched span drew, for the caller's report and for the tests to count. */
export interface UnwatchedDraw {
  readonly id: string;
  readonly kind: 'card' | 'authored';
  /** Sim time it happened. */
  readonly atMs: number;
  /** Which hook ops actually moved a Ledger number, and which were recorded only. */
  readonly applied: readonly string[];
  readonly recorded: readonly string[];
}

export interface UnwatchedRun {
  /** The Ledger at the end of the span. */
  readonly ledger: Ledger;
  /** Everything that started, in time order. Never anything big — see `drawUnwatched`. */
  readonly drawn: readonly UnwatchedDraw[];
  /** How many looks at the world the span held, for the bench and the tests. */
  readonly looks: number;
}

/**
 * One look at the world with no actors in it: the Ledger's numbers as of the step this look falls
 * in, and the clock at the look's own instant.
 */
interface LedgerView {
  readonly ledger: Ledger;
  readonly nowMs: number;
  readonly season: SeasonName;
  readonly timeOfDay: Phase;
  /** Sim time it last rained, carried on the engine slice, or -1. */
  readonly lastRainMs: number;
  readonly periodSec: number;
}

/**
 * What `simMinutesSinceRain` reads before it has ever rained. The same number `view.ts` uses, and
 * for the same reason: large enough that every `lte` in the deck is false, and finite.
 */
const NEVER_RAINED_SIM_MINUTES = 1e9;

/** What one predicate's `on` reads off the Ledger. The actor-only readings are false; see the header. */
function readLedgerPredicate(view: LedgerView, on: PredicateOn): string | number | boolean {
  const L = view.ledger;
  switch (on) {
    case 'season':
      return view.season;
    case 'weather':
      return L.weather.kind;
    case 'timeOfDay':
      return view.timeOfDay;
    case 'simMinutesSinceRain':
      return view.lastRainMs < 0 ? NEVER_RAINED_SIM_MINUTES : msToSimMinutes(view.nowMs - view.lastRainMs, view.periodSec);
    case 'ledger.wool':
      return meanOf(L.wool);
    case 'ledger.grass':
      return meanOf(L.grass);
    case 'ledger.coins':
      return L.banks.coins;
    case 'ledger.flock':
      return ledgerFlock(L);
    case 'lambPresent':
      return L.lambs.length > 0;
    // No actors, so no lamb off its mother's trail, no Digital Luna across the field, no flock to
    // be scattered, and neither NPC standing in it. False, not unknown.
    case 'lambFarFromMother':
    case 'dlFarFromFlock':
    case 'flockScattered':
    case 'merchantPresent':
    case 'farmerPresent':
      return false;
    default: {
      const never: never = on;
      throw new Error(`unwatched predicate: unknown reading ${String(never)}`);
    }
  }
}

function ledgerHolds(view: LedgerView, predicate: Predicate): boolean {
  return compare(readLedgerPredicate(view, predicate.on), predicate.op, predicate.value);
}

function ledgerAllHold(view: LedgerView, predicates: readonly Predicate[]): boolean {
  for (const p of predicates) if (!ledgerHolds(view, p)) return false;
  return true;
}

/** This card's live weight against the Ledger: base times every multiplier whose `when` holds. */
function ledgerWeight(view: LedgerView, card: Card): number {
  let weight = card.weight.base;
  for (const m of card.weight.multipliers) if (ledgerHolds(view, m.when)) weight *= m.times;
  return weight;
}

/**
 * How many events carried in from the watched world are still running at `atMs`. A card that was on
 * screen when the tab hid but was due to end an hour into the gap is over: the gap ran past it. This
 * is what the concurrency cap and each card's own `concurrent` are counted against here, so a
 * fortnight away is not silenced by two cards that happened to be running when the player left.
 * Nothing is *ended* here — `catchUp` respawns with the same `running` list it was handed, and the
 * respawned world's first look at the world ends them properly, hooks, cooldowns and all.
 */
function stillRunning(events: EventsState, atMs: number, id?: string): number {
  let n = 0;
  for (const r of events.running) {
    if (atMs >= r.endsMs) continue;
    if (id !== undefined && r.id !== id) continue;
    n++;
  }
  return n;
}

/** Is this card outranked by an authored event that is still running at `atMs`? */
function preempted(events: EventsState, deck: Deck, card: Card, atMs: number): boolean {
  for (const r of events.running) {
    if (atMs >= r.endsMs || r.kind !== 'authored') continue;
    const entry = deck.byId.get(r.id);
    if (!entry || entry.kind !== 'authored') continue;
    for (const name of entry.event.priorityOver) if (name === card.id) return true;
  }
  return false;
}

/**
 * Run one event's hooks at Ledger level. **A hook that moves a Ledger number is applied; a hook that
 * needs an actor is recorded and nothing else happens** (the ticket's own rule). Today that means
 * `coins` is applied — it is a real stock the Ledger carries and `advanceLedger` moves — and
 * `spawn`, `setVisibility`, `flag` and `mood` are recorded: there is nobody to spawn, no scene to
 * fade, no behaviour to read a flag, and mood is not a Ledger stock (`moodOf` reads it off the other
 * numbers; the engine's own `events.mood` offset is a watched-world thing, see ledger.ts).
 *
 * Returns what was applied and what was only recorded, so the caller can say so and a test can
 * check it rather than take it on trust.
 */
function runLedgerHooks(ledger: Ledger, hooks: EventHooks): { applied: string[]; recorded: string[] } {
  const applied: string[] = [];
  const recorded: string[] = [];
  const one = (hook: EventHook): void => {
    if (hook.op === 'coins') {
      ledger.banks.coins = Math.max(0, ledger.banks.coins + hook.delta);
      applied.push(hook.op);
      return;
    }
    recorded.push(hook.op);
  };
  // Start and end both run: an unwatched moment is over inside the day it happened in, so its end
  // hooks are as due as its start hooks by the time the next look comes round.
  for (const hook of hooks.start) one(hook);
  for (const hook of hooks.end) one(hook);
  return { applied, recorded };
}

/** Which day of its season a Ledger is on, counting from 1. The same reading `engine.ts` does. */
function ledgerDayOfSeason(ledger: Ledger, atOffsetMs: number): number {
  const dayMs = ledger.clock.periodSec * 1000;
  const elapsed = ledger.season.elapsedMs + atOffsetMs;
  const intoSeason = ((elapsed % SEASON_MS) + SEASON_MS) % SEASON_MS;
  return Math.floor(intoSeason / dayMs) + 1;
}

/** The season-day a [0, 1) season fraction falls in. The same reading `engine.ts` does. */
function ledgerSeasonDayOfFraction(ledger: Ledger, fraction: number): number {
  const dayMs = ledger.clock.periodSec * 1000;
  return Math.floor((fraction * SEASON_MS) / dayMs) + 1;
}

/** Is this authored event's trigger met at this look? `realDate` is deferred to #84, as it is live. */
function ledgerTriggerMet(view: LedgerView, event: AuthoredEvent, atOffsetMs: number): boolean {
  const t = event.trigger;
  switch (t.kind) {
    case 'predicates':
      return ledgerAllHold(view, t.all);
    case 'stockThreshold':
      return ledgerHolds(view, { on: t.on, op: t.op, value: t.value });
    case 'simDate':
      return view.season === t.season && ledgerDayOfSeason(view.ledger, atOffsetMs) === ledgerSeasonDayOfFraction(view.ledger, t.dayOfSeason);
    case 'realDate':
      return false;
    default: {
      const never: never = t;
      throw new Error(`unwatched authored trigger: unknown kind ${JSON.stringify(never)}`);
    }
  }
}

/** How long this event is barred after it ends, at Ledger level. Mirrors `cooldownMs` in engine.ts. */
function cooldownMsOf(view: LedgerView, entry: Card | AuthoredEvent, kind: 'card' | 'authored'): number {
  if (kind === 'card') return simHoursToMs((entry as Card).limits.cooldownSimHours, view.periodSec);
  const t = (entry as AuthoredEvent).trigger;
  if (t.kind === 'simDate' || t.kind === 'realDate') return SEASON_MS * 4 * PACING.simDateCooldownCycles;
  return t.cooldownSimDays * view.periodSec * 1000;
}

/**
 * Start one event on an unwatched day. It is a **moment**, not a running event: it starts and is
 * over inside the day it happened in, because there is no field to run it on and no player to watch
 * it run. So it is told, its Ledger-level hooks fire, its own gap and cooldown are set from the end
 * its duration would have had, and nothing is left in `events.running` for the respawned world to
 * trip over.
 */
function startUnwatched(
  view: LedgerView,
  events: EventsState,
  chronicle: { chronicle: Chronicle },
  entry: Card | AuthoredEvent,
  kind: 'card' | 'authored',
): UnwatchedDraw {
  const at = view.nowMs;
  const { applied, recorded } = runLedgerHooks(view.ledger, entry.hooks);
  events.starts[entry.id] = at;
  events.lastStartMs = at;
  events.lastMomentKind = entry.moment.kind;
  if (kind === 'card') events.lastDrawMs = at;
  const endsAt = at + simMinutesToMs(entry.durationSimMinutes, view.periodSec);
  events.cooldowns[entry.id] = endsAt + cooldownMsOf(view, entry, kind);
  // The same line and the same picture key the watched world would have told, so a storybook page
  // built over an unwatched week reads exactly as one built over a watched night does. Only the
  // start is told: an unwatched moment has no closing bracket worth a line of its own.
  tell(chronicle, {
    atMs: at,
    district: FARM_DISTRICT,
    line: entry.storybook.line,
    picture: entry.storybook.picture,
    source: kind,
    hint: entry.storybook.notability,
  });
  return { id: entry.id, kind, atMs: at, applied, recorded };
}

/**
 * One unwatched look at the world: a small authored event if one is due, then a small card draw.
 * **Never anything big**, at any weight, on any seed, for any length of gap — `deck.cardsBySize` is
 * asked for the small cards by name and the big ones are never looked at, and the authored loop
 * skips every big event. That is the hard invariant of this file.
 */
function look(
  view: LedgerView,
  events: EventsState,
  chronicle: { chronicle: Chronicle },
  deck: Deck,
  atOffsetMs: number,
  ceiling: number,
  drawn: UnwatchedDraw[],
): void {
  const at = view.nowMs;
  if (stillRunning(events, at) >= PACING.concurrentCap) return;

  // Authored first, as `evaluate` does: punctuation takes its slot before a drawn card does. One
  // per look at most, and a look that started one draws no card - a moment at a time, unwatched.
  // Nothing here rolls, so an authored trigger is checked on every look exactly as it is live; the
  // shipped deck's three authored events are all big, so this loop is empty work on it.
  for (const event of deck.authored) {
    if (event.size === 'big') continue; // the whole point: never while nobody is watching
    if (event.deferred) continue;
    if (stillRunning(events, at, event.id) > 0) continue;
    const until = events.cooldowns[event.id];
    if (until !== undefined && at < until) continue;
    if (!ledgerTriggerMet(view, event, atOffsetMs)) continue;
    drawn.push(startUnwatched(view, events, chronicle, event, 'authored'));
    return;
  }

  // The warm-up, and the small draw's own global gap, exactly as the live path holds them.
  if (msToSimMinutes(at, view.periodSec) < WARMUP_SIM_MINUTES) return;
  const lastSmall = lastDrawOfSizeIn(events, 'small', deck);
  if (lastSmall >= 0 && msToSimMinutes(at - lastSmall, view.periodSec) < SIZE_PACING.small.gapSimMinutes) return;

  // **Roll first, read second.** One real week away is 3,360 farm days and so 80,640 looks, and
  // reading the deck's conditions at every one of them is the difference between a catch-up that
  // costs tens of milliseconds and one that costs hundreds. `ceiling` is the largest chance this
  // look could possibly land at - every small card eligible at once, at every multiplier - so a
  // roll at or above it cannot land whatever the conditions say, and the look ends here having
  // touched nothing. A roll below it is a *candidate*: the conditions are read for real and the
  // same number is compared against the actual chance. That is exactly the distribution the direct
  // method gives (the roll is uniform, and the actual chance can never exceed the ceiling), it
  // costs one number from the generator either way, and `advanceUnwatched`'s own `ceilingOverride`
  // lets `test/engine-unwatched.test.ts` run the same seed past this early exit and down the same
  // read-the-conditions path unconditionally, then assert the two runs' draws come out identical —
  // the direct-method comparison, not just the ceiling's own bound.
  const roll = nextFloat(events.rng);
  if (roll >= ceiling) return;

  const eligible: { card: Card; weight: number }[] = [];
  for (const card of deck.cardsBySize.small) {
    if (stillRunning(events, at, card.id) >= card.limits.concurrent) continue;
    const cooldownUntil = events.cooldowns[card.id];
    if (cooldownUntil !== undefined && at < cooldownUntil) continue;
    const lastStart = events.starts[card.id];
    if (lastStart !== undefined && msToSimMinutes(at - lastStart, view.periodSec) < card.limits.minGapSimMinutes) continue;
    if (PACING.noRepeatMomentKind && events.lastMomentKind === card.moment.kind && msToSimMinutes(at - events.lastStartMs, view.periodSec) < NO_REPEAT_SIM_MINUTES) continue;
    if (preempted(events, deck, card, at)) continue;
    if (!ledgerAllHold(view, card.conditions)) continue;
    eligible.push({ card, weight: ledgerWeight(view, card) });
  }
  if (eligible.length === 0) return;
  let total = 0;
  for (const item of eligible) total += item.weight;
  if (roll >= drawChance(total, 'small', UNWATCHED_LOOK_SIM_MINUTES)) return;

  let pick = nextFloat(events.rng) * total;
  let chosen = eligible[eligible.length - 1] as { card: Card; weight: number };
  for (const item of eligible) {
    pick -= item.weight;
    if (pick < 0) {
      chosen = item;
      break;
    }
  }
  drawn.push(startUnwatched(view, events, chronicle, chosen.card, 'card'));
}

/**
 * The largest chance one unwatched look could land at on this deck: every small card eligible at
 * once, each at its base times every multiplier that could raise it. Nothing a look actually finds
 * can beat it, which is what makes the roll-first shortcut in `look` exact rather than approximate.
 * Computed once per span, not per look.
 */
export function unwatchedCeiling(deck: Deck = FARM_DECK): number {
  let total = 0;
  for (const card of deck.cardsBySize.small) {
    let weight = card.weight.base;
    for (const m of card.weight.multipliers) if (m.times > 1) weight *= m.times;
    total += weight;
  }
  return drawChance(total, 'small', UNWATCHED_LOOK_SIM_MINUTES);
}

/**
 * Advance `ledger` by `spanMs` with nobody watching, drawing small things as it goes.
 *
 * The Ledger is advanced in the same `LEDGER_STEP_MS` pieces `advanceLedger` would have used for the
 * whole span in one call, drawing on `worldRng` in the same order — so the numbers that come out are
 * exactly the numbers this catch-up produced before there was an unwatched draw at all, and every
 * Ledger round-trip pin still holds. Between the pieces the engine takes its looks, one every
 * `PACING.unwatchedLookFarmHours` of world time, each covering that much world time, so a small card
 * draws at the same per-farm-day rate it does in live play.
 *
 * `events` and `chronicle` are **mutated**: the engine slice records what was drawn (its own
 * generator, the starts, the cooldowns) and the chronicle is told each one. The caller passes the
 * copies it is going to hand on to `respawn`; `catchUp` does exactly that.
 *
 * `ceilingOverride` is test-only (`test/engine-unwatched.test.ts`, "the roll-first shortcut is
 * exact"): passing a ceiling of `Infinity` disables the early exit in `look` without changing
 * anything else about it, so every look falls through to the same read-the-conditions comparison
 * the shortcut makes when a roll gets past it. Run the same seed once with the real ceiling and
 * once with this override and the two `drawn` lists come out identical if and only if the real
 * ceiling never sat below a real look's chance — which is the whole of what "exact" claims. Never
 * passed on the live path.
 */
export function advanceUnwatched(
  ledger: Ledger,
  spanMs: number,
  worldRng: Rng,
  events: EventsState,
  chronicle: { chronicle: Chronicle },
  deck: Deck = FARM_DECK,
  ceilingOverride?: number,
): UnwatchedRun {
  if (!Number.isFinite(spanMs) || spanMs < 0) throw new Error(`advanceUnwatched: spanMs must be a finite non-negative number, got ${spanMs}`);
  // The engine off is the pre-engine world exactly (`EventsState.enabled`, engine/events.ts), and
  // that has to hold on this path too, or a district with no deck — or a parity test — would find
  // cards drawn at it across a gap. The Ledger still runs; only the looks are skipped.
  if (!events.enabled) return { ledger: advanceLedger(ledger, spanMs, worldRng), drawn: [], looks: 0 };
  const periodSec = ledger.clock.periodSec;
  const startMs = ledger.clock.nowMs;
  const lookMs = simMinutesToMs(UNWATCHED_LOOK_SIM_MINUTES, periodSec);
  const drawn: UnwatchedDraw[] = [];
  const ceiling = ceilingOverride ?? unwatchedCeiling(deck);
  let L = ledger;
  let done = 0;
  let looks = 0;
  let nextLook = startMs + lookMs;
  while (done < spanMs) {
    const piece = Math.min(spanMs - done, LEDGER_STEP_MS);
    const clockBefore = L.clock;
    L = advanceLedger(L, piece, worldRng);
    done += piece;
    const pieceEnd = startMs + done;
    // The Ledger rolled this piece's weather; a look inside the piece reads the piece's numbers and
    // its own instant's clock. `lastRainMs` follows the same rule: if it rained across this piece,
    // the rain is as recent as the piece's end.
    if (L.weather.rain) events.lastRainMs = pieceEnd;
    while (nextLook <= pieceEnd && lookMs > 0) {
      const intoPiece = nextLook - (pieceEnd - piece);
      const t = clockBefore.paused ? clockBefore.t : (((clockBefore.t + intoPiece / (periodSec * 1000)) % 1) + 1) % 1;
      const view: LedgerView = {
        ledger: L,
        nowMs: nextLook,
        season: L.season.override ?? seasonAt(L.season.elapsedMs - (pieceEnd - nextLook)),
        timeOfDay: phaseOf(t),
        lastRainMs: events.lastRainMs,
        periodSec,
      };
      look(view, events, chronicle, deck, nextLook - startMs, ceiling, drawn);
      looks++;
      nextLook += lookMs;
    }
  }
  return { ledger: L, drawn, looks };
}

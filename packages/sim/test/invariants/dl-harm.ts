// Digital Luna cannot be harmed (CLAUDE.md, non-negotiable: "No event, inhabitant, weather, or
// power hurts her, on screen or off. Any PR that could is wrong by definition."). This file is the
// one place that says what "harmed" means, as data, so every DL-invariant test checks the same
// thing: the fuzz and the static write-guard in dl-invariant.test.ts today, and whatever the event
// engine (#40) adds later.
//
// Issue #61 names four kinds of harm:
//
//   1. A need or health-like field of hers dropping below its floor. She has no hunger or health
//      stat (the design keeps her needs-free on purpose); the only fields shaped like one are
//      `wet` and `snow`, both meant to stay in [0, 1] (her own tick clamps them there every tick,
//      see `tickLuna` in behaviours/luna.ts). A value outside that range is the clamp having
//      failed, not a state she could reach by playing normally. Checked here, in HARM_CHECKS.
//   2. A forced state she did not choose through her own chain. The static guard in
//      dl-invariant.test.ts covers the write itself (nothing outside her own chain and her
//      player-facing command surface may write to her at all); this file covers the *shape* such a
//      write would leave behind, so a forced or stuck hold shows up even if it arrives by some
//      path the write-guard does not walk (npcs.ts, life.ts, the future event engine). A forced
//      ride or pose looks the same from here regardless of how it got set: `riding`/`mounting`
//      pointing at a sheep that does not exist, or `manualUntilMs`/`rideUntilMs`/`circleUntilMs`
//      pinned open (not finite, or too far past the longest any of them legitimately runs) — see
//      the hold checks below, added for review finding #2 on the #61 PR: the five-line probe there
//      (`riding` forced onto a sheep with `rideUntilMs = Infinity`, `manual = 'sleep'` with
//      `manualUntilMs = Infinity`) passed as `harmIn(s) === []` before these checks existed.
//   3. Removal. `state.luna` must always exist; `harmIn` checks this first; every other check
//      needs a `luna` object to look at.
//   4. A position outside the world, or an `anim` outside her set. Both checked here.
//
// `LUNA_ANIMS` (src/behaviours/luna.ts) is the one export this file needed from `src` and didn't
// already have: the list of `anim` strings her own chain ever assigns. See its doc comment there.
//
// One shape of kind 2 needs memory across ticks that a per-state `HarmCheck` cannot carry — a
// `manual` value that never changes is indistinguishable, one tick at a time, from a value that is
// legitimately about to change. `StuckManualGuard` below covers that (Round 3, review finding R2-6;
// generalised past `'ride'` alone in Round 4, review finding F1 — see the class's own doc comment);
// everything else in `HARM_CHECKS` stays a pure function of a single state, as the fuzz's per-tick
// `harmIn` call expects.
//
// Round 3 also closed two checks that were narrower than their own doc comments or conditions
// claimed: `riding-sheep-exists` now reads `mounting` as well as `riding` (R2-5), and
// `manual-hold-bounded`'s upper bound is no longer masked by `riding`/`mounting` being set (R2-4).

import { findSheep } from '../../src/actors';
import { LUNA_ANIMS } from '../../src/behaviours/luna';
import { H, LFOOT, W } from '../../src/geometry';
import { TICK_MS } from '../../src/rules';
import type { Luna, SimState } from '../../src/state';

const LUNA_ANIM_SET: ReadonlySet<string> = new Set(LUNA_ANIMS);

/**
 * How far outside the 640x400 field a foot may stray and still just be "on the world": the barn
 * roof overhang, the doorway threshold, a clamp's own one-tick overshoot before it pulls her back.
 * Generous on purpose — this check is a burglar alarm for a teleport or a corrupted position, not
 * a physics check, and the fuzz below is what proves she never needs the margin in the first place.
 */
export const WORLD_MARGIN = 80;

/**
 * Generous upper bound, in sim ms, for every timed hold on Luna. The longest any of them
 * legitimately runs is the 12 s `sleep` pose (`HOLD_MS.sleep` in intents.ts); `RULES.rideManualMs`
 * (8 s) and `forceBoundUntilMs`'s 6 s trundle window are the next longest; the icon/tag bubbles are
 * all under 3 s. This is comfortably above all of them, with margin, and nowhere near "forever" —
 * it is what catches a hold pinned to `Infinity` (or any other runaway value) the same way
 * `WORLD_MARGIN` catches a teleport rather than proving normal play.
 */
export const MAX_HOLD_MS = 20_000;

/**
 * The `manual` values a button hold actually sets (`HOLD_MS` in intents.ts) and that the `manual`
 * behaviour's final `else if (now > l.manualUntilMs)` fallback times out *by* `manualUntilMs`. Every
 * other truthy value — `walk`, `nibble`, `rabbit` (end some other way, checked in their own branch
 * above the fallback) and `ride` (only ever seen for at most one tick, between a failed mount
 * clearing `mounting` and the fallback branch clearing `manual` right after, with `manualUntilMs`
 * left at its default) — can legitimately sit on a stale `manualUntilMs` without being stuck, so the
 * "not already stale" half of the bound is only meaningful for this set.
 */
const TIMED_MANUAL: ReadonlySet<string> = new Set(['sit', 'tilt', 'pant', 'flop', 'sleep', 'stretch']);

/**
 * A timer is "sane" when it is finite and lands within `MAX_HOLD_MS` of `nowMs`. No lower bound:
 * a timer already in the past just means "not currently held or showing", the normal steady state
 * for a field that starts at 0 and only ever gets bumped a short way past `now`.
 */
function boundedTimer(name: string, untilMs: number, nowMs: number): string | null {
  if (!Number.isFinite(untilMs)) return `${name} is ${untilMs}, not a finite time`;
  const remaining = untilMs - nowMs;
  if (remaining > MAX_HOLD_MS) return `${name} is ${remaining}ms from now — past the ${MAX_HOLD_MS}ms sane window, she is pinned`;
  return null;
}

/**
 * Same as `boundedTimer`, plus: while the hold is reported active (the caller only calls this when
 * it is), it must not already be stale. The behaviour that owns each of these fields clears its
 * "active" flag (`manual`, `riding`, `circleUntilMs`) the same tick `now` passes `untilMs` — see
 * `riding`, `manual`, and `bedtime` in behaviours/luna.ts — so if the flag is still set, that tick
 * has not come yet; if `untilMs` is already behind `nowMs` regardless, the clear did not happen.
 */
function boundedActiveHold(name: string, untilMs: number, nowMs: number): string | null {
  return (
    boundedTimer(name, untilMs, nowMs) ??
    (untilMs >= nowMs ? null : `${name} (${untilMs}) is already past nowMs (${nowMs}) but the hold is still marked active — it should have cleared`)
  );
}

export interface HarmCheck {
  readonly name: string;
  /**
   * Null when the field is fine; a human-readable reason when it is not. `state` rides along
   * beside her own fields for the checks that need `clock.nowMs` or another actor's existence.
   */
  detect(l: Luna, state: SimState): string | null;
}

/** Every per-tick way Digital Luna's own fields can show harm, as data. */
export const HARM_CHECKS: readonly HarmCheck[] = [
  { name: 'wet-floor', detect: (l) => (Number.isFinite(l.wet) && l.wet >= 0 ? null : `wet is ${l.wet}, its floor is 0`) },
  { name: 'wet-ceiling', detect: (l) => (l.wet <= 1 ? null : `wet is ${l.wet}, its ceiling is 1`) },
  { name: 'snow-floor', detect: (l) => (Number.isFinite(l.snow) && l.snow >= 0 ? null : `snow is ${l.snow}, its floor is 0`) },
  { name: 'snow-ceiling', detect: (l) => (l.snow <= 1 ? null : `snow is ${l.snow}, its ceiling is 1`) },
  {
    name: 'anim-known',
    detect: (l) => (LUNA_ANIM_SET.has(l.anim) ? null : `anim "${l.anim}" is outside her set (${LUNA_ANIMS.join(', ')})`),
  },
  {
    name: 'position-in-world',
    detect: (l) => {
      const x = l.x + LFOOT[0];
      const y = l.y + LFOOT[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return `foot (${l.x}, ${l.y}) is not a finite position`;
      if (x < -WORLD_MARGIN || x > W + WORLD_MARGIN || y < -WORLD_MARGIN || y > H + WORLD_MARGIN) {
        return `foot (${x}, ${y}) is outside the ${W}x${H} world, past its ±${WORLD_MARGIN} margin`;
      }
      return null;
    },
  },
  // --- Round 2 (#61 review finding 2): a forced or stuck hold, not just an out-of-range field. ---
  {
    // Round 3, review finding R2-5: the doc comment above (harm kind 2) claims this checks
    // "riding/mounting pointing at a sheep that does not exist", but the check itself only ever
    // read `riding`. Harmless so far — `ride`'s own tick clears a bogus `mounting` the very next
    // tick — but the doc said mounting was covered and it was not, so it now is.
    name: 'riding-sheep-exists',
    detect: (l, state) => {
      if (l.riding !== null && !findSheep(state, l.riding)) return `riding "${l.riding}" names no sheep in state.sheep — she is forced onto a mount that isn't there`;
      if (l.mounting !== null && !findSheep(state, l.mounting)) return `mounting "${l.mounting}" names no sheep in state.sheep — she is forced onto a mount that isn't there`;
      return null;
    },
  },
  {
    name: 'riding-hold-bounded',
    detect: (l, state) => (l.riding === null ? null : boundedActiveHold('rideUntilMs', l.rideUntilMs, state.clock.nowMs)),
  },
  {
    name: 'manual-hold-bounded',
    detect: (l, state) => {
      if (l.manual === null) return null;
      // The upper bound is enforced whenever `manual` is set at all, regardless of `riding` or
      // `mounting` — Round 3, review finding R2-4: the old condition mirrored the `manual`
      // behaviour's own read-gate (`!l.riding && !l.mounting`) exactly, which meant a writer that
      // kept either flag set alongside an unbounded `manualUntilMs` hid completely from this check.
      // Nothing legitimate ever pushes `manualUntilMs` far into the future no matter what `riding`
      // or `mounting` read, so this half has no reason to be masked by them.
      const upper = boundedTimer('manualUntilMs', l.manualUntilMs, state.clock.nowMs);
      if (upper) return upper;
      // The "not already stale" half only means something once the `manual` behaviour would
      // actually read `manualUntilMs` for this tick (its own condition: `!l.riding && !l.mounting`)
      // and only for the values it actually governs — see TIMED_MANUAL's doc comment.
      if (l.riding !== null || l.mounting !== null) return null;
      if (!TIMED_MANUAL.has(l.manual)) return null;
      return l.manualUntilMs >= state.clock.nowMs
        ? null
        : `manual is "${l.manual}" but manualUntilMs (${l.manualUntilMs}) is already past nowMs (${state.clock.nowMs}) — the hold should have cleared`;
    },
  },
  {
    name: 'circle-hold-bounded',
    detect: (l, state) => {
      // The bedtime chain only reads circleUntilMs once she has arrived at the bed spot and is
      // actually circling (`l.target === null`, after `walkLuna` clears it) — reached either
      // fresh (dusk, walk in, arrive) or after a rain interruption sends her back to the doorway
      // and then back to bed again, `l.target` non-null the whole trip back regardless. Mid-trip,
      // `l.routine` can already read 'bed' again while `circleUntilMs` still holds whatever it was
      // the last time she actually circled (rain can force `routine` away to 'shelterWait' without
      // going through bedtime's own clear) — stale, but inert until she arrives, at which point the
      // very same tick either finds it already null (fresh 1800 ms set) or, if it is still the old
      // stale value, immediately re-triggers the "expired" branch and clears it right then, before
      // any check outside this tick could ever observe the staleness. So the bound only means
      // anything once she is both in 'bed' and actually there (`target === null`).
      if (l.circleUntilMs === null || l.routine !== 'bed' || l.target !== null) return null;
      return boundedActiveHold('circleUntilMs', l.circleUntilMs, state.clock.nowMs);
    },
  },
  // The three cosmetic timers (the icon bubble, the name tag, the trundle's forced-bound render
  // flag) never gate her behaviour, but they are still a hold on her in the same shape: a value
  // that only ever moves a short way past `now`. Checked unconditionally, with no "active" flag to
  // gate on — each starts at 0 (already in the past) and only ever gets bumped forward a little.
  { name: 'icon-hold-bounded', detect: (l, state) => boundedTimer('iconUntilMs', l.iconUntilMs, state.clock.nowMs) },
  { name: 'tag-hold-bounded', detect: (l, state) => boundedTimer('tagUntilMs', l.tagUntilMs, state.clock.nowMs) },
  { name: 'force-bound-hold-bounded', detect: (l, state) => boundedTimer('forceBoundUntilMs', l.forceBoundUntilMs, state.clock.nowMs) },
];

/**
 * Every reason `state` harms Digital Luna right now, or `[]` when she is fine. The one predicate
 * every DL-invariant test shares: the fuzz asserts this is always `[]`; the static guard asserts
 * her sanctioned command surface never makes it anything else.
 */
/**
 * Longest, in ticks, any `manual` value may legitimately stay set: `MAX_HOLD_MS` above (already
 * derived, with margin, from `HOLD_MS.sleep` — 12 s, the longest entry in the `HOLD_MS` table in
 * intents.ts — the longest real button-hold the sim has) divided by `TICK_MS`, i.e. 200 ticks (20 s)
 * at the sim's 100 ms tick. Round 4, review finding F1: the previous guard watched only
 * `manual === 'ride'`, so a writer that kept a *different* `TIMED_MANUAL` value set (e.g. `'sleep'`)
 * by re-bumping `manualUntilMs` a few seconds into the future every tick sat under `boundedTimer`'s
 * per-tick ceiling on every single tick it ran — always well inside `MAX_HOLD_MS` of `nowMs` — while
 * never actually letting go, for a whole scripted day (1,800 ticks). A per-tick check cannot see
 * that; only counting how many ticks in a row the same value has sat there can. A real `sleep` hold
 * never runs past `HOLD_MS.sleep` (120 ticks); this threshold is comfortably above that, with the
 * same margin `MAX_HOLD_MS` already carries, and nowhere near "a whole day".
 */
const MAX_LEGIT_MANUAL_HOLD_TICKS = Math.ceil(MAX_HOLD_MS / TICK_MS);

/**
 * `'ride'` gets its own, much shorter threshold: it is the one `TIMED_MANUAL`-adjacent value with no
 * timed hold behind it at all (see `TIMED_MANUAL`'s doc comment) — the only legitimate way it is
 * ever seen is the single tick between a failed mount and the `manual` behaviour's own fallback
 * clearing it. Measured, not guessed: a full 50-seed fuzz (a scripted day each, `ride` exercised by
 * every seed via `LUNA_ACTIONS`) never saw this run past 1 tick.
 *
 * Round 4, review finding F4: a plain consecutive-run counter resets to 0 on any gap tick, so a
 * writer that ticks `manual = 'ride'` on only every other (or every third) tick holds her exactly as
 * stuck and was never seen. Counted instead over a sliding window — more than `RIDE_STUCK_WINDOW_LIMIT`
 * `'ride'` ticks anywhere in the last `RIDE_STUCK_WINDOW_TICKS` — so a duty cycle is caught the same
 * as a solid run, and a single legitimate transient tick (well under the limit) still passes clean.
 */
export const RIDE_STUCK_WINDOW_TICKS = 8;
export const RIDE_STUCK_WINDOW_LIMIT = 3;

/**
 * Round 3, review finding R2-6 (the `TIMED_MANUAL` exemption): `manual-hold-bounded`'s "not already
 * stale" half exempts `'ride'` on purpose (see `TIMED_MANUAL`'s doc comment) because a failed mount
 * can legitimately leave it sitting on the default, already-stale `manualUntilMs` for one tick. That
 * makes a writer that pins `manual = 'ride'` for many ticks — with neither `mounting` nor `riding`
 * ever set — invisible to every check above: nothing about a *single* tick's state tells the
 * legitimate one-tick transient apart from a stuck one, only how many ticks in a row it has held.
 * Round 4, review finding F1 widened the same blind spot: `manualUntilMs`'s upper-bound check is
 * also only ever a single tick's snapshot, so a writer that keeps re-bumping it forward with any
 * *other* `TIMED_MANUAL` value passes it every tick while never letting go. Both need memory across
 * ticks, which the rest of `HARM_CHECKS` deliberately does not carry (each entry is a pure function
 * of one state) — so this is a small stateful tracker instead of a `HarmCheck` entry, kept here so
 * "what harm looks like" still lives in one file. It is keyed to elapsed ticks, not to which value
 * `manual` holds — `'ride'` is a special case only in how short its threshold is, being the one
 * value with no timed hold behind it at all. Instantiate one per run and feed it a tick at a time;
 * the fuzz (the only test that drives `manual` tick by tick) does this alongside `harmIn`. The
 * static guard and the off-screen block never set `manual`, so they have no need of it.
 */
export class StuckManualGuard {
  private rideWindow: boolean[] = [];
  private value: string | null = null;
  private run = 0;

  /** Feed one tick's Luna in; returns a reason once a stuck hold passes its threshold, else null. */
  next(l: Luna): string | null {
    const rideTick = l.manual === 'ride' && l.riding === null && l.mounting === null;
    this.rideWindow.push(rideTick);
    if (this.rideWindow.length > RIDE_STUCK_WINDOW_TICKS) this.rideWindow.shift();
    const rideCount = this.rideWindow.filter(Boolean).length;
    if (rideCount > RIDE_STUCK_WINDOW_LIMIT) {
      return `manual has been "ride" for ${rideCount} of the last ${this.rideWindow.length} ticks with neither mounting nor riding set — a stuck hold, not a failed-mount transient`;
    }

    if (l.manual !== null && l.manual === this.value) this.run++;
    else {
      this.value = l.manual;
      this.run = l.manual === null ? 0 : 1;
    }
    if (l.manual !== null && l.manual !== 'ride' && this.run > MAX_LEGIT_MANUAL_HOLD_TICKS) {
      return `manual has been "${l.manual}" for ${this.run} consecutive ticks — past the ${MAX_LEGIT_MANUAL_HOLD_TICKS}-tick sane window (margin over the longest real hold), regardless of what manualUntilMs claims — a rolling timer that never lets go, not a real hold`;
    }
    return null;
  }
}

export function harmIn(state: SimState): string[] {
  if (!state.luna) return ['state.luna is missing: she has been removed'];
  const reasons: string[] = [];
  for (const check of HARM_CHECKS) {
    const reason = check.detect(state.luna, state);
    if (reason) reasons.push(`${check.name}: ${reason}`);
  }
  return reasons;
}

// The draw (#101, was #40): what the engine is allowed to start, how often, and — new in #101 —
// which size of thing may start while nobody is watching. The rules are pinned against a stub deck,
// where one card with no conditions and a known weight says exactly what the engine decided; the
// run-level measurements over the shipped deck live in `engine-pace.test.ts`.
//
// Everything the engine is held to is now stated in farm days and farm hours (the owner's decision,
// 2026-09-09, plan decision 16). The real-minute framing this file used to carry — "about three
// moments per five real minutes", the five-real-minute population bar — is withdrawn with decision
// 11 and decision 14, and the block that measured it is gone rather than quietly rescaled; see the
// note at the bottom of this file and `engine-pace.test.ts` for what replaced it.
import { describe, expect, it } from 'vitest';
import { drawAllowed, eligibleCards, endEvent, evaluate, lastDrawOfSize, liveWeight, pacingNow, runningMoments, startEvent } from '../src/engine/engine';
import { FARM_DECK, momentKindOf } from '../src/engine/deck';
import {
  BIG_GAP_SIM_MINUTES,
  drawChance,
  farmDaysToSimMinutes,
  farmHoursToSimMinutes,
  msToSimMinutes,
  PACE_TARGETS,
  PACING,
  REFERENCE_WEIGHT,
  SIM_MINUTES_PER_DAY,
  SIM_MINUTES_PER_FARM_HOUR,
  UNWATCHED_LOOK_SIM_MINUTES,
  simHoursToMs,
  simMinutesToMs,
  SIZE_PACING,
  NO_REPEAT_SIM_MINUTES,
  SMALL_GAP_SIM_MINUTES,
  WARMUP_SIM_MINUTES,
} from '../src/engine/pacing';
import { viewOf } from '../src/engine/view';
import { hashState } from '../src/hash';
import { createInitialState, type SimState } from '../src/state';
import { advance } from '../src/tick';
import { atMs, stubDeck } from './engine-helpers';

const PERIOD = 180; // the clock's own period in sim seconds; every conversion below uses it
const minutes = (n: number): number => simMinutesToMs(n, PERIOD);

/** A world with a clock we drive by hand, for pinning one pacing rule at a time. */
function bench(seed = 1): SimState {
  const s = createInitialState(seed);
  s.weather = { ...s.weather, mode: 'manual' }; // no random showers moving the conditions under us
  return s;
}

describe('the pacing numbers are data, and every one of them is in world time', () => {
  it('no constant on PACING is a real-minute one: they are farm days, farm hours, or a resolution', () => {
    // The whole point of #101's rewrite. A pace written in farm days reads the same to a player
    // whatever the world's period is; the retired real-minute framing did not, and the owner's
    // decision 16 withdrew it. So: every *pace* constant here is named for farm days or farm hours,
    // and the two that are not (`evalEverySimMinutes`, `concurrentCap`) are a resolution and a cap,
    // not a pace — looking half as often does not halve how often things happen, because
    // `drawChance` scales with the world time a look covers.
    const paceKeys = Object.keys(PACING).filter((k) => /Gap|warmup|Look|noRepeatMomentKindF/.test(k));
    expect(paceKeys.sort()).toEqual(['bigGapFarmDays', 'noRepeatMomentKindFarmHours', 'smallGapFarmHours', 'unwatchedLookFarmHours', 'warmupFarmHours']);
    for (const key of paceKeys) expect(key, `${key} must name a farm day or a farm hour`).toMatch(/Farm(Days|Hours)$/);
    // `evalEverySimMinutes` is the one sim-minute name left, and it is the resolution, not a pace.
    const simMinuteKeys = Object.keys(PACING).filter((k) => /RealMinutes|realSeconds|SimMinutes|SimHours|SimDays/.test(k));
    expect(simMinuteKeys, Object.keys(PACING).join(', ')).toEqual(['evalEverySimMinutes']);
    // And the retired ones are gone, not renamed: nothing forces the world any more.
    for (const gone of ['quietStretchSimMinutes', 'quietGapScale', 'quietWeightBoost', 'minGapSimMinutes', 'weightForCertainDraw']) {
      expect(PACING, gone).not.toHaveProperty(gone);
    }
    expect(PACING.evalEverySimMinutes).toBe(2);
    expect(PACING.concurrentCap).toBe(2);
    expect(PACING.bigDrawsWhileWatchedOnly).toBe(true);
    expect(PACING.noRepeatMomentKind).toBe(true);
  });

  it('the conversion from world time to sim time happens in one place, off the day length', () => {
    // A farm hour is the day length over the hours in a day; a farm day is the day length. Both are
    // derived, not written down twice, and the sim-millisecond conversion is `simMinuteMs` alone.
    expect(SIM_MINUTES_PER_FARM_HOUR).toBe(SIM_MINUTES_PER_DAY / 24);
    expect(farmHoursToSimMinutes(1)).toBe(60);
    expect(farmHoursToSimMinutes(24)).toBe(SIM_MINUTES_PER_DAY);
    expect(farmDaysToSimMinutes(30)).toBe(30 * SIM_MINUTES_PER_DAY);
    // A sim-minute follows the world's own period rather than wall time: 125 ms at the watching
    // rate, 250 ms on a world whose day is twice as long.
    expect(minutes(1)).toBeCloseTo(125, 9);
    expect(simMinutesToMs(1, 360)).toBeCloseTo(250, 9);
    expect(simHoursToMs(1, PERIOD)).toBeCloseTo(7500, 9);
    expect(msToSimMinutes(minutes(240), PERIOD)).toBeCloseTo(240, 9);
    // The three derived constants the engine actually holds draws to.
    expect(WARMUP_SIM_MINUTES).toBe(farmHoursToSimMinutes(PACING.warmupFarmHours));
    expect(SMALL_GAP_SIM_MINUTES).toBe(farmHoursToSimMinutes(PACING.smallGapFarmHours));
    expect(BIG_GAP_SIM_MINUTES).toBe(farmDaysToSimMinutes(PACING.bigGapFarmDays));
  });

  it('the owner’s two targets are the numbers, and each size’s gap comes off them', () => {
    // These two are the owner's own, in the owner's own words, stated as outcomes: they are what a
    // retune moves. `SIZE_PACING`'s rates are the engine's knob under them; `engine-pace.test.ts`
    // measures how much outcome the rates actually buy on this deck, shortfall and all.
    expect(PACE_TARGETS.smallDaysInFive).toBe(4); // "a small thing most days"
    expect(PACE_TARGETS.bigPerThirtyFarmDays).toBe(3); // "a big thing a few a month"
    expect(SIZE_PACING.big.perFarmDay).toBe(PACE_TARGETS.bigPerThirtyFarmDays / 30);
    expect(SIZE_PACING.small.perFarmDay).toBeGreaterThan(SIZE_PACING.big.perFarmDay);
    // A small gap of a few farm hours, a big gap of several farm days: separate decisions.
    expect(PACING.smallGapFarmHours).toBeGreaterThanOrEqual(1);
    expect(PACING.smallGapFarmHours).toBeLessThan(24);
    expect(PACING.bigGapFarmDays).toBeGreaterThanOrEqual(2);
    expect(SIZE_PACING.big.gapSimMinutes).toBeGreaterThan(SIZE_PACING.small.gapSimMinutes);
  });

  it('a draw chance is the size’s target rate, scaled by weight and by the world time a look covers', () => {
    // A lone ordinary card (base 10 = REFERENCE_WEIGHT), eligible all day, draws at exactly its
    // size's target rate per farm day: sum the per-look chance over a day's worth of looks and the
    // target comes back out. That is the whole formula, and it is why the same constants pace live
    // play (a look every `evalEverySimMinutes`) and the unwatched path (a look every farm hour).
    const perEval = PACING.evalEverySimMinutes;
    expect(drawChance(0, 'small', perEval)).toBe(0);
    expect(drawChance(REFERENCE_WEIGHT, 'small', perEval)).toBeCloseTo((SIZE_PACING.small.perFarmDay * perEval) / SIM_MINUTES_PER_DAY, 12);
    expect(drawChance(REFERENCE_WEIGHT, 'big', perEval)).toBeCloseTo((SIZE_PACING.big.perFarmDay * perEval) / SIM_MINUTES_PER_DAY, 12);
    expect(drawChance(2 * REFERENCE_WEIGHT, 'small', perEval)).toBeCloseTo(2 * drawChance(REFERENCE_WEIGHT, 'small', perEval), 12);
    // The same weight, drawn as a big thing, is far rarer: the two rates are the whole difference.
    expect(drawChance(REFERENCE_WEIGHT, 'big', perEval)).toBeLessThan(drawChance(REFERENCE_WEIGHT, 'small', perEval) / 10);
    // Looks that cover more world time land proportionally more often, so the per-farm-day rate is
    // the same whatever resolution the caller looks at — that is what lets the unwatched path
    // (a look a farm hour) pace a small card exactly as live play (a look every two sim-minutes)
    // does. Shown here at a tenth of the reference weight, where the cap does not come into it.
    const unwatchedLook = farmHoursToSimMinutes(PACING.unwatchedLookFarmHours);
    expect(UNWATCHED_LOOK_SIM_MINUTES).toBe(unwatchedLook);
    const thin = REFERENCE_WEIGHT / 10;
    const perDayLive = drawChance(thin, 'small', perEval) * (SIM_MINUTES_PER_DAY / perEval);
    const perDayUnwatched = drawChance(thin, 'small', unwatchedLook) * (SIM_MINUTES_PER_DAY / unwatchedLook);
    expect(perDayLive).toBeCloseTo(SIZE_PACING.small.perFarmDay / 10, 12);
    expect(perDayUnwatched).toBeCloseTo(perDayLive, 12);
    // **The caveat that used to sit here has gone away, and that is worth pinning too.** At the
    // rate the engine shipped with (8 a farm day) an ordinary card wanted 0.33 of an unwatched look
    // and was held to `maxDrawChance`, so the unwatched world ran at about three fifths of nominal
    // wherever a card was eligible for a long stretch — the caveat written into
    // `PACING.unwatchedLookFarmHours`. At the rate the owner's four-in-five target now sets it
    // wants 0.052, a quarter of the cap, so the unwatched path runs at exactly its nominal rate for
    // an ordinary card. The cap still exists and still binds a fat eligible set, which is the line
    // under this one.
    expect(drawChance(REFERENCE_WEIGHT, 'small', unwatchedLook)).toBeLessThan(PACING.maxDrawChance);
    const perDayCapFree = drawChance(REFERENCE_WEIGHT, 'small', unwatchedLook) * (SIM_MINUTES_PER_DAY / unwatchedLook);
    expect(perDayCapFree).toBeCloseTo(SIZE_PACING.small.perFarmDay, 12);
    expect(drawChance(1e9, 'small', perEval)).toBe(PACING.maxDrawChance);
  });
});

describe('the warm-up holds card draws back at the start of a fresh world (owner note, Round 1, #82)', () => {
  it('no card draws inside the warm-up, however certain the draw would otherwise be', () => {
    // A card that is always eligible, at a weight the cap on `maxDrawChance` still lets through
    // comfortably every look: if the warm-up did not hold it back, this would draw almost at once.
    const deck = stubDeck([{ id: 'a', base: 1e9 }]);
    const s = bench(30);
    for (let i = 0; i * PACING.evalEverySimMinutes < WARMUP_SIM_MINUTES; i++) {
      atMs(s, minutes(i * PACING.evalEverySimMinutes));
      evaluate(s, deck);
    }
    expect(s.clock.nowMs).toBeLessThan(minutes(WARMUP_SIM_MINUTES));
    expect(s.events.running).toEqual([]);
    expect(s.events.lastDrawMs).toBe(-1); // no attempt was even burned from the generator

    // Past the warm-up, the same certain-draw card lands within a handful of looks (the draw itself
    // is still a capped-chance roll per look, `PACING.maxDrawChance`, not a guarantee on the first).
    for (let i = 0; i < 50 && s.events.running.length === 0; i++) {
      atMs(s, minutes(WARMUP_SIM_MINUTES + i * PACING.evalEverySimMinutes));
      evaluate(s, deck);
    }
    expect(s.events.running.map((r) => r.id)).toEqual(['a']);
  });

  it('the warm-up is eight farm hours: the owner’s "first minute" at the watching rate', () => {
    // The number did not move in #101, only its unit did. Eight farm hours is a third of a farm day
    // — 480 sim-minutes, one real minute at the 180-second period #82 measured it at.
    expect(PACING.warmupFarmHours).toBe(8);
    expect(WARMUP_SIM_MINUTES).toBe(480);
    expect(simMinutesToMs(WARMUP_SIM_MINUTES, PERIOD)).toBe(60_000);
  });

  it('does not gate authored triggers or category actions, only the card draw', () => {
    // An authored event with an always-true predicate trigger and no cooldown: nothing about it is
    // held back by the card warm-up, because `attemptDraw` is the only place that checks it.
    const deck = stubDeck([], [{ id: 'always', trigger: { kind: 'predicates', all: [], cooldownSimDays: 0 } }]);
    const s = bench(31);
    atMs(s, 0); // well inside the warm-up
    evaluate(s, deck);
    expect(s.events.running.map((r) => r.id)).toEqual(['always']);

    // The farmer's dawn market walk (a scheduled category action, not a draw) also runs unaffected —
    // `runScheduledCategoryActions` is called before the warm-up check even exists in `attemptDraw`.
    const s2 = createInitialState(32);
    s2.clock = { ...s2.clock, t: 0.95 }; // dawn (`RULES.clock.phases.dawn` is .92)
    expect(msToSimMinutes(s2.clock.nowMs, s2.clock.periodSec)).toBeLessThan(WARMUP_SIM_MINUTES);
    evaluate(s2, FARM_DECK);
    expect(s2.npcs.farmer).not.toBeNull();
  });
});

describe('a card with unmet conditions never fires', () => {
  it('an impossible condition keeps a card out of the eligible set however long the engine runs', () => {
    const deck = stubDeck([
      { id: 'never', conditions: [{ on: 'ledger.flock', op: 'gte', value: 999 }] },
      { id: 'always', momentKind: 'lamb' },
    ]);
    const s = bench(3);
    expect(eligibleCards(s, deck).map((e) => e.card.id)).toEqual(['always']);
    for (let i = 0; i < 4000; i++) {
      atMs(s, i * 1000);
      evaluate(s, deck);
    }
    expect(s.chronicle.entries.every((e) => !e.line.startsWith('never'))).toBe(true);
    expect(s.events.starts['never']).toBeUndefined();
    expect(s.events.starts['always']).toBeDefined();
  });

  it('the shipped deck: nothing that needs a lamb is eligible on a flock with none', () => {
    const s = bench(4);
    expect(s.sheep.some((q) => q.lambs.length)).toBe(false);
    const eligible = eligibleCards(s, FARM_DECK).map((e) => e.card.id);
    expect(eligible).not.toContain('lostLamb');
    expect(eligible).not.toContain('lambZoomiesHour');
  });

  it('weights are live: a multiplier whose `when` holds scales the base, and one that does not is left out', () => {
    const card = FARM_DECK.cards.find((c) => c.id === 'crowsOnTheField')!;
    const s = bench(5);
    for (const t of s.tufts) t.level = 1; // ledger.grass well over the multiplier's 0.6
    expect(liveWeight(viewOf(s), card)).toBe(card.weight.base * 2);
    for (const t of s.tufts) t.level = 0.1;
    expect(liveWeight(viewOf(s), card)).toBe(card.weight.base);
  });
});

describe('limits: concurrency, the two gaps, and the cooldown', () => {
  it('never more than the global cap runs at once', () => {
    const deck = stubDeck([
      { id: 'a', momentKind: 'bubble', durationSimMinutes: 10_000 },
      { id: 'b', momentKind: 'lamb', durationSimMinutes: 10_000 },
      { id: 'c', momentKind: 'weather', durationSimMinutes: 10_000 },
      { id: 'd', momentKind: 'phase', durationSimMinutes: 10_000 },
    ]);
    const s = bench(6);
    for (const id of ['a', 'b', 'c', 'd']) startEvent(s, deck, id, 'card');
    // `startEvent` is the owner's-hand path and does not check the cap; the draw does.
    expect(s.events.running).toHaveLength(4);
    expect(drawAllowed(s, 'small', deck)).toBe(false);
    expect(drawAllowed(s, 'big', deck)).toBe(false);

    const t = bench(7);
    for (let i = 0; i < 20_000; i++) {
      atMs(t, i * 500);
      evaluate(t, deck);
      expect(t.events.running.length).toBeLessThanOrEqual(PACING.concurrentCap);
    }
    expect(Object.keys(t.events.starts).length).toBeGreaterThan(1); // it did draw, repeatedly
  });

  it('a small draw and a big draw are separate decisions with separate gaps', () => {
    // Two cards, one of each size, both always eligible. The small one is held to six farm hours
    // and the big one to four farm days, measured from the last draw *of that size* — so a big
    // start does not lock the afternoon's small texture out, and a busy afternoon of small things
    // does not push the set piece off.
    const deck = stubDeck([
      { id: 'sm', size: 'small', momentKind: 'bubble', durationSimMinutes: 30 },
      { id: 'bg', size: 'big', momentKind: 'lamb', durationSimMinutes: 30 },
    ]);
    const s = bench(8);
    const small: number[] = [];
    const big: number[] = [];
    for (let i = 0; i < 60_000; i++) {
      atMs(s, i * 500);
      const before = new Set(s.events.running.map((r) => `${r.id}@${r.startedMs}`));
      evaluate(s, deck);
      for (const r of s.events.running) {
        if (before.has(`${r.id}@${r.startedMs}`)) continue;
        (r.id === 'sm' ? small : big).push(r.startedMs);
      }
    }
    expect(small.length).toBeGreaterThan(3);
    expect(big.length).toBeGreaterThan(1);
    for (let i = 1; i < small.length; i++) {
      expect(msToSimMinutes(small[i]! - small[i - 1]!, PERIOD)).toBeGreaterThanOrEqual(SMALL_GAP_SIM_MINUTES);
    }
    for (let i = 1; i < big.length; i++) {
      expect(msToSimMinutes(big[i]! - big[i - 1]!, PERIOD)).toBeGreaterThanOrEqual(BIG_GAP_SIM_MINUTES);
    }
    // And the small draws are the busier stream, which is the owner's whole point.
    expect(small.length).toBeGreaterThan(big.length);
  });

  it('each size’s gap is measured from the last draw of that size, and only that size', () => {
    const deck = stubDeck([
      { id: 'sm', size: 'small', momentKind: 'bubble', durationSimMinutes: 30 },
      { id: 'bg', size: 'big', momentKind: 'lamb', durationSimMinutes: 30 },
    ]);
    const s = bench(33);
    atMs(s, minutes(100_000));
    startEvent(s, deck, 'bg', 'card');
    endEvent(s, deck, 'bg');
    expect(lastDrawOfSize(s, 'big', deck)).toBe(minutes(100_000));
    expect(lastDrawOfSize(s, 'small', deck)).toBe(-1); // a big start is not a small draw
    // Just past the small gap, a small draw is allowed and a big one is not.
    atMs(s, minutes(100_000) + minutes(SMALL_GAP_SIM_MINUTES));
    expect(drawAllowed(s, 'small', deck)).toBe(true);
    expect(drawAllowed(s, 'big', deck)).toBe(false);
    atMs(s, minutes(100_000) + minutes(BIG_GAP_SIM_MINUTES));
    expect(drawAllowed(s, 'big', deck)).toBe(true);
    // `pacingNow` reports the same two answers rather than re-deriving them.
    const now = pacingNow(s, deck);
    expect(now.big.allowed).toBe(true);
    expect(now.big.gapSimMinutes).toBe(BIG_GAP_SIM_MINUTES);
    expect(now.small.sinceSimMinutes).toBe(Infinity);
  });

  it('a card is out of the running for its own cooldown and its own gap after it ends', () => {
    const deck = stubDeck([{ id: 'a', cooldownSimHours: 10, minGapSimMinutes: 5000, durationSimMinutes: 60 }]);
    const s = bench(9);
    startEvent(s, deck, 'a', 'card');
    atMs(s, minutes(60));
    evaluate(s, deck); // the duration is up: it ends here
    expect(s.events.running).toEqual([]);
    expect(s.events.cooldowns['a']).toBe(minutes(60) + simHoursToMs(10, PERIOD));

    // Inside the cooldown: not eligible.
    atMs(s, minutes(60) + simHoursToMs(9, PERIOD));
    expect(eligibleCards(s, deck)).toEqual([]);
    // Past the cooldown but inside its own start-to-start gap: still not eligible.
    atMs(s, minutes(4999));
    expect(eligibleCards(s, deck)).toEqual([]);
    atMs(s, minutes(5001));
    expect(eligibleCards(s, deck).map((e) => e.card.id)).toEqual(['a']);
  });

  it('two events of the same moment kind never start back to back', () => {
    const deck = stubDeck([
      { id: 'a', momentKind: 'bubble' },
      { id: 'b', momentKind: 'bubble' },
    ]);
    const s = bench(10);
    startEvent(s, deck, 'a', 'card');
    endEvent(s, deck, 'a');
    expect(s.events.lastMomentKind).toBe('bubble');
    expect(eligibleCards(s, deck)).toEqual([]); // both cards are that kind, and it just happened
  });
});

describe('nothing is forced: the quiet relaxation is retired (owner’s decision, plan 16)', () => {
  // Through #82 the engine relaxed its thresholds after `quietStretchSimMinutes` of silence — a
  // quarter of the gap, four times the weight, and the no-repeat-kind rule lifted — "so the world
  // never goes dead" (the plan's old line). The owner retired all of it: "a quiet farm day is
  // allowed". These two say the relaxation is gone rather than merely re-tuned.
  it('the same conditions give the same answer however long the world has been silent', () => {
    const deck = stubDeck([{ id: 'a', momentKind: 'bubble' }]);
    const s = bench(11);
    const allowedAfter = (silentSimMinutes: number): boolean => {
      atMs(s, minutes(100_000));
      s.events.starts['a'] = s.clock.nowMs - minutes(300); // inside the small gap, either way
      s.events.lastStartMs = s.clock.nowMs - minutes(silentSimMinutes);
      return drawAllowed(s, 'small', deck);
    };
    // 300 sim-minutes back is inside the six-farm-hour small gap. Nothing about how long the world
    // has been quiet changes that — not a day of silence, not a fortnight of it.
    expect(allowedAfter(300)).toBe(false);
    expect(allowedAfter(farmDaysToSimMinutes(1))).toBe(false);
    expect(allowedAfter(farmDaysToSimMinutes(14))).toBe(false);
    // And past the gap it is allowed, again regardless of the silence.
    atMs(s, minutes(100_000));
    s.events.starts['a'] = s.clock.nowMs - minutes(SMALL_GAP_SIM_MINUTES);
    expect(drawAllowed(s, 'small', deck)).toBe(true);
  });

  it('the no-repeat rule holds for its own window and then expires, and a long silence changes neither', () => {
    // The one rule the relaxation used to lift. A quiet stretch no longer lifts it — what lifts it
    // is its own clock, `noRepeatMomentKindFarmHours`, because "back to back" is a thing that
    // happens in time. Inside the window this world's only card stays out of the running however
    // long the silence; past it, it is eligible again, at exactly the ordinary chance and gap.
    const deck = stubDeck([{ id: 'a', momentKind: 'bubble', durationSimMinutes: 30, minGapSimMinutes: 0, cooldownSimHours: 0 }]);
    const s = bench(12);
    atMs(s, minutes(100_000));
    startEvent(s, deck, 'a', 'card');
    endEvent(s, deck, 'a');
    const startedAt = minutes(100_000);
    // Just inside the window: nothing draws, over hundreds of looks.
    let started = 0;
    for (let i = 1; i * PACING.evalEverySimMinutes < NO_REPEAT_SIM_MINUTES; i++) {
      atMs(s, startedAt + minutes(i * PACING.evalEverySimMinutes));
      s.events.starts['a'] = startedAt - minutes(SMALL_GAP_SIM_MINUTES); // the small gap is clear
      const before = s.events.running.length;
      evaluate(s, deck);
      if (s.events.running.length > before) started++;
      s.events.running = [];
    }
    expect(started).toBe(0);
    expect(msToSimMinutes(s.clock.nowMs - startedAt, PERIOD)).toBeLessThan(NO_REPEAT_SIM_MINUTES);
    // Past it: eligible again, and it does draw within a reasonable stretch.
    atMs(s, startedAt + minutes(NO_REPEAT_SIM_MINUTES));
    s.events.starts['a'] = startedAt - minutes(SMALL_GAP_SIM_MINUTES);
    expect(eligibleCards(s, deck, undefined, 'small').map((e) => e.card.id)).toEqual(['a']);
  });
});

describe('the draw is deterministic and part of the hash', () => {
  it('the same seed draws the same events at the same ticks, twice', () => {
    const a = advance(createInitialState(9), 3000);
    const b = advance(createInitialState(9), 3000);
    expect(a.chronicle.entries).toEqual(b.chronicle.entries);
    expect(a.events).toEqual(b.events);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('a different seed draws a different sequence', () => {
    const a = advance(createInitialState(9), 3000);
    const b = advance(createInitialState(10), 3000);
    expect(a.events.rng).not.toEqual(b.events.rng);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('the engine draws from its own stream, so the actors draw exactly what they drew without it', () => {
    // The whole basis of the pre-engine view (test/engine-parity.test.ts): `events.rng` moves and
    // `rng` does not, on the same world, for the same ticks, up to what the events then did.
    const off = advance(createInitialState(11, { events: false }), 600);
    const on = advance(createInitialState(11), 600);
    expect(on.rng).toEqual(off.rng);
    expect(on.events.rng).not.toEqual(off.events.rng);
  });

  it('a world that ran with events, saved and reloaded, keeps drawing the same sequence', () => {
    const a = advance(createInitialState(9), 1500);
    const b = advance(structuredClone(a), 1500);
    const c = advance(a, 1500);
    expect(hashState(b)).toBe(hashState(c));
  });
});

describe('seed 9, the plan’s own seed: the readable demonstration of a watched stretch', () => {
  // This used to be the bottom half of a block called "five unattended minutes", whose population
  // test asserted "two distinct moment kinds in five real minutes". **That bar is withdrawn**, not
  // failed: the owner's decision 16 retires the real-minute framing entirely ("about three moments
  // per five real minutes", decision 11) and decision 14's three-kind bar with it. Measuring a pace
  // in real minutes says nothing about a world whose day length changes with whether you are
  // watching, which is exactly the world this is. The population test that replaced it measures
  // farm days over thirty seeds and thirty farm days: `test/engine-pace.test.ts`.
  //
  // What survives is this: the plan's own seed, run for a fixed stretch, as a readable
  // demonstration that a watched world is not one thing happening once. The ids and kinds below
  // have been re-pinned twice on this branch and this is the third: #86's widened `conditions` put
  // three `dl-trick` cards in this stretch's eligible set and the seed drew all three; at the small
  // rate the owner's four-in-five target now sets (1.25, `SMALL_RATE_FOR_DAYS_IN_FIVE`) the same
  // stretch draws **two** things instead — a firefly night, then a stargazing night — and they are
  // two different kinds again. The pins in order: pre-#101 `strayCatVisits` (dl-trick) then
  // `merchantCaravan` (npc-arrival); #101 alone `strayCatVisits` then `windfall` (bubble); #86 at
  // rate 8 `nightOfTheFireflies`, `crowsOnTheField`, `strayCatVisits` (all dl-trick); here
  // `nightOfTheFireflies` (dl-trick) then `stargazingNight` (weather).
  //
  // **Read this as a demonstration, not as the guard on the no-repeat rule** (round-2 verifier's
  // note N2 on PR #99). At this pin the stretch holds no two starts of the same kind at all, so the
  // gap check below has nothing to check on this seed. The rule itself is defended by two other
  // tests in this file — "two events of the same moment kind never start back to back" over the
  // population, and "the no-repeat rule holds for its own window and then expires" — and both fail
  // if the rule is switched off. Neither is touched by this PR.
  it('a fixed stretch draws a sequence, and no two starts of the same kind are closer than the no-repeat window, all of it told', () => {
    let s = createInitialState(9);
    const kinds = new Set<string>();
    const order: string[] = [];
    const kindOrder: string[] = [];
    const startedAt: number[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      s = advance(s, 1);
      for (const kind of runningMoments(s)) kinds.add(kind);
      for (const r of s.events.running) {
        const key = `${r.id}@${r.startedMs}`;
        if (seen.has(key)) continue;
        seen.add(key);
        order.push(key);
        kindOrder.push(momentKindOf(r.id) ?? '?');
        startedAt.push(r.startedMs);
      }
    }
    expect(order.map((k) => k.split('@')[0])).toEqual(SEED_9_IDS);
    expect(kindOrder).toEqual(SEED_9_KINDS);
    // Two distinct kinds this stretch (`dl-trick`, then `weather`) — SEED_9_IDS above already pins
    // the exact sequence; this restates it as the kind-count. It was 2 pre-#86 (`dl-trick` then
    // `bubble`), 1 at rate 8 with #86's conditions, and is 2 again here; the coverage-vs-variety
    // measurement that matters is over the population in `engine-pace.test.ts`, not on one seed.
    expect(kinds.size).toBe(2);
    // `PACING.noRepeatMomentKind`: never two of the same kind back to back, "back to back" meaning
    // inside `NO_REPEAT_SIM_MINUTES` (12 farm hours) of each other — not "never again", which is
    // what a plain not-equal check on adjacent kinds would demand. At this pin the two starts are
    // different kinds and 206,500 ms apart (1,652 sim-minutes), so this loop has no pair to check
    // and passes vacuously on this seed: it is here so that a future re-pin that does draw the same
    // kind twice is held to the real rule rather than to a not-equal check that would have to be
    // loosened. The tests that actually defend the rule are named in the block comment above.
    for (let i = 1; i < kindOrder.length; i++) {
      if (kindOrder[i] !== kindOrder[i - 1]) continue;
      const gapSimMinutes = msToSimMinutes(startedAt[i]! - startedAt[i - 1]!, s.clock.periodSec);
      expect(gapSimMinutes, `${SEED_9_IDS[i - 1]} then ${SEED_9_IDS[i]}, both ${kindOrder[i]}`).toBeGreaterThanOrEqual(NO_REPEAT_SIM_MINUTES);
    }
    // Every start is in the chronicle, told, not just held on the state.
    const told = s.chronicle.entries.filter((e) => e.source === 'card' || e.source === 'authored');
    expect(told.length).toBeGreaterThanOrEqual(order.length);
  });
});

/**
 * Seed 9's draw over 3,000 ticks (one and two-thirds farm days), re-pinned at the small rate the
 * owner's four-in-five target sets: a firefly night at 63,300 ms, then a stargazing night at
 * 269,800 ms. The pin it replaces (#86's conditions at the engine's old rate of 8) was
 * `nightOfTheFireflies`, `crowsOnTheField`, `strayCatVisits`; the one before that (#101 alone) was
 * `strayCatVisits` then `windfall`.
 */
const SEED_9_IDS = ['nightOfTheFireflies', 'stargazingNight'];
/** The moment kinds of `SEED_9_IDS`, in the same order. */
const SEED_9_KINDS = ['dl-trick', 'weather'];

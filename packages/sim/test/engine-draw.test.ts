// The draw (#40): what the engine is allowed to start, how often, and how the pacing relaxes when
// the world has been quiet. The rules are pinned against a stub deck, where one card with no
// conditions and a known weight says exactly what the engine decided; the run-level tests at the
// bottom use the shipped fifteen.
import { describe, expect, it } from 'vitest';
import { drawAllowed, eligibleCards, endEvent, evaluate, liveWeight, runningMoments, startEvent } from '../src/engine/engine';
import { FARM_DECK, momentKindOf } from '../src/engine/deck';
import { drawChance, msToSimMinutes, PACING, pacingAt, simHoursToMs, simMinutesToMs } from '../src/engine/pacing';
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

describe('the pacing numbers are data', () => {
  it('every one of them is on PACING, with the sim-minute conversion the deck files declare', () => {
    // Round 1 moved this off the plan's every-sim-minute after measuring +66.8 ms on the charter's
    // catch-up bench. Round 2's verifier re-measured on another box and found every-two-minutes
    // still NOT MET on 2 of 4 runs; tracing the cost found most of it was not predicate evaluation
    // at all but `farmerMarketWalk`'s own downstream cost (`engine/category.ts`) — a real feature
    // the owner asked for, not a bug. `evaluate`'s own share is cut by the `couldStartSomething`
    // early-out in `engine/engine.ts` (RNG-neutral, checked directly).
    //
    // Round 3's bench, four runs each on one box and one install, is in `engine/pacing.ts`'s own
    // comment and the PR note; the short version is that this box cannot resolve the charter's
    // 1,000 ms line for either build — trunk's own worst run is inside 1 % of it — and the Foreman
    // has ruled the line **advisory until #78 lands**. The engine's own share is about +69 ms, of
    // which about +57 ms is the farmer's market walk. Nothing here claims the branch is under
    // budget, and nothing here claims it broke one.
    //
    // The density figures this comment used to carry (a median of 2 starts with 2 of 30 seeds
    // drawing no card) did not reproduce and are gone; what the current head actually measures is
    // in the "five unattended minutes" block at the bottom of this file, and every number there was
    // measured on this head with two independent rulers.
    expect(PACING.evalEverySimMinutes).toBe(2);
    expect(PACING.concurrentCap).toBeGreaterThan(0);
    expect(PACING.minGapSimMinutes).toBeGreaterThan(0);
    expect(PACING.quietStretchSimMinutes).toBeGreaterThan(PACING.minGapSimMinutes);
    // A sim-minute is the clock's period over 1,440: 125 ms at the watching rate, and it follows
    // the world's own period rather than wall time.
    expect(minutes(1)).toBeCloseTo(125, 9);
    expect(simMinutesToMs(1, 360)).toBeCloseTo(250, 9);
    expect(simHoursToMs(1, PERIOD)).toBeCloseTo(7500, 9);
    expect(msToSimMinutes(minutes(240), PERIOD)).toBeCloseTo(240, 9);
  });

  it('a draw chance is the eligible weight over the certainty weight, capped', () => {
    // Each attempt now covers `evalEverySimMinutes` sim-minutes at once (finding 2), so the raw
    // chance scales by that too — see `drawChance`'s own formula in `engine/pacing.ts`.
    const perEval = PACING.evalEverySimMinutes;
    expect(drawChance(0, 1)).toBe(0);
    expect(drawChance(10, 1)).toBeCloseTo((10 * perEval) / PACING.weightForCertainDraw, 12);
    expect(drawChance(10, PACING.quietWeightBoost)).toBeCloseTo(
      (10 * PACING.quietWeightBoost * perEval) / PACING.weightForCertainDraw,
      12,
    );
    expect(drawChance(1e9, 1)).toBe(PACING.maxDrawChance);
  });
});

describe('the warm-up holds card draws back at the start of a fresh world (owner note, Round 1, #82)', () => {
  it('no card draws inside warmupSimMinutes, however certain the draw would otherwise be', () => {
    // A card that is always eligible, at a weight the cap on `maxDrawChance` still lets through
    // comfortably every attempt: if the warm-up did not hold it back, this would draw almost at once.
    const deck = stubDeck([{ id: 'a', base: 1e9 }]);
    const s = bench(30);
    for (let i = 0; i * PACING.evalEverySimMinutes < PACING.warmupSimMinutes; i++) {
      atMs(s, minutes(i * PACING.evalEverySimMinutes));
      evaluate(s, deck);
    }
    expect(s.clock.nowMs).toBeLessThan(minutes(PACING.warmupSimMinutes));
    expect(s.events.running).toEqual([]);
    expect(s.events.lastDrawMs).toBe(-1); // no attempt was even burned from the generator

    // Past the warm-up, the same certain-draw card lands within a handful of attempts (the draw
    // itself is still a capped-chance roll per attempt, `PACING.maxDrawChance`, not a guarantee on
    // the very first one).
    for (let i = 0; i < 50 && s.events.running.length === 0; i++) {
      atMs(s, minutes(PACING.warmupSimMinutes + i * PACING.evalEverySimMinutes));
      evaluate(s, deck);
    }
    expect(s.events.running.map((r) => r.id)).toEqual(['a']);
  });

  it('does not gate authored triggers or category actions, only the card draw', () => {
    // An authored event with an always-true predicate trigger and no cooldown: nothing about it is
    // held back by the card warm-up, because `attemptDraw` is the only place that checks it.
    const deck = stubDeck([], [{ id: 'always', trigger: { kind: 'predicates', all: [], cooldownSimDays: 0 } }]);
    const s = bench(31);
    atMs(s, 0); // well inside warmupSimMinutes
    evaluate(s, deck);
    expect(s.events.running.map((r) => r.id)).toEqual(['always']);

    // The farmer's dawn market walk (a scheduled category action, not a draw) also runs unaffected —
    // `runScheduledCategoryActions` is called before the warm-up check even exists in `attemptDraw`.
    const s2 = createInitialState(32);
    s2.clock = { ...s2.clock, t: 0.95 }; // dawn (`RULES.clock.phases.dawn` is .92)
    expect(msToSimMinutes(s2.clock.nowMs, s2.clock.periodSec)).toBeLessThan(PACING.warmupSimMinutes);
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

describe('limits: concurrency, the gap, and the cooldown', () => {
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
    expect(drawAllowed(s)).toBe(false);

    const t = bench(7);
    for (let i = 0; i < 20_000; i++) {
      atMs(t, i * 500);
      evaluate(t, deck);
      expect(t.events.running.length).toBeLessThanOrEqual(PACING.concurrentCap);
    }
    expect(Object.keys(t.events.starts).length).toBeGreaterThan(1); // it did draw, repeatedly
  });

  it('two draws are never closer than the global gap', () => {
    const deck = stubDeck([
      { id: 'a', momentKind: 'bubble', durationSimMinutes: 30 },
      { id: 'b', momentKind: 'lamb', durationSimMinutes: 30 },
    ]);
    const s = bench(8);
    const draws: number[] = [];
    for (let i = 0; i < 30_000; i++) {
      atMs(s, i * 200);
      const before = s.events.lastDrawMs;
      evaluate(s, deck);
      if (s.events.lastDrawMs !== before) draws.push(s.events.lastDrawMs);
    }
    expect(draws.length).toBeGreaterThan(3);
    for (let i = 1; i < draws.length; i++) {
      const gap = msToSimMinutes(draws[i]! - draws[i - 1]!, PERIOD);
      // Either the ordinary gap, or the relaxed one after a quiet stretch — never less than that.
      expect(gap).toBeGreaterThanOrEqual(PACING.minGapSimMinutes * PACING.quietGapScale);
    }
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

describe('the quiet relaxation fires after the configured stretch and only then', () => {
  it('pacingAt flips exactly at the stretch, not before', () => {
    const justUnder = pacingAt(0, minutes(PACING.quietStretchSimMinutes) - 1, PERIOD);
    const exactly = pacingAt(0, minutes(PACING.quietStretchSimMinutes), PERIOD);
    expect(justUnder.relaxed).toBe(false);
    expect(justUnder.gapSimMinutes).toBe(PACING.minGapSimMinutes);
    expect(justUnder.weightBoost).toBe(1);
    expect(exactly.relaxed).toBe(true);
    expect(exactly.gapSimMinutes).toBe(PACING.minGapSimMinutes * PACING.quietGapScale);
    expect(exactly.weightBoost).toBe(PACING.quietWeightBoost);
    // A world where nothing has ever started is quiet by definition, and starts relaxed.
    expect(pacingAt(-1, 0, PERIOD).relaxed).toBe(true);
  });

  it('a draw held back by the ordinary gap is let through once the stretch has passed, and not one minute earlier', () => {
    // The last draw is 300 sim-minutes back — inside the ordinary gap (`PACING.minGapSimMinutes`,
    // 800 sim-minutes after Round 1's retune), outside the relaxed one (a quarter of that, 200). So
    // the only thing that can change the answer is the quiet stretch.
    const deck = stubDeck([{ id: 'a', momentKind: 'bubble' }]);
    const s = bench(11);
    const quietFor = (simMinutes: number): boolean => {
      atMs(s, minutes(100_000));
      s.events.lastDrawMs = s.clock.nowMs - minutes(300);
      s.events.lastStartMs = s.clock.nowMs - minutes(simMinutes);
      return drawAllowed(s);
    };
    expect(quietFor(PACING.quietStretchSimMinutes - 1)).toBe(false);
    expect(quietFor(PACING.quietStretchSimMinutes)).toBe(true);

    // And it is the draw itself, not only the predicate: 500 attempts inside the stretch start
    // nothing, and the same 500 with the stretch passed start something.
    const attempts = (simMinutes: number): number => {
      const w = bench(12);
      let started = 0;
      for (let i = 0; i < 500; i++) {
        atMs(w, minutes(100_000 + i));
        w.events.lastDrawMs = w.clock.nowMs - minutes(300);
        w.events.lastStartMs = w.clock.nowMs - minutes(simMinutes);
        const before = w.events.running.length;
        evaluate(w, deck);
        if (w.events.running.length > before) started++;
        w.events.running = [];
      }
      return started;
    };
    expect(attempts(PACING.quietStretchSimMinutes - 1)).toBe(0);
    expect(attempts(PACING.quietStretchSimMinutes + 1)).toBeGreaterThan(0);
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

describe('five unattended minutes', () => {
  // The ticket's own bar (docs/SHEEPCLIFF_PLAN.md, Phase 1 exit): "five unattended sim-minutes at
  // seed 9 show three distinct moment kinds". Five real minutes of watching is 3,000 ticks, one and
  // two thirds sim-days.
  //
  // READ THIS BEFORE TRUSTING THE NUMBER BELOW. On this head that bar is met by **no seed at all**,
  // and the reason is a decision, not a regression:
  //
  //   * Through rounds 1 and 2, `dlBirthday` fired in the first 0.1 real seconds of every world,
  //     because its trigger was "the first day of spring" and a fresh world starts on it. It was a
  //     free start and a free `bubble` kind on all 30 seeds, and it is the whole reason 18 of 30
  //     seeds used to clear three kinds.
  //   * The owner then decided the birthday is **December 15, a real calendar date** (plan decision
  //     10). The world lane put it on a `realDate` trigger in #83, and this engine defers that kind
  //     to #84 (`engine/deck.ts`) because answering "is it December 15?" needs a real-year calendar
  //     the sim does not have. So the birthday no longer opens every world — which is what the
  //     owner asked for — and the free kind is gone with it.
  //
  // What is left is the card deck alone, drawing under the owner's own pacing: a real minute of
  // warm-up out of a five-minute watch, then a 100-real-second gap between starts. That allows at
  // most three starts in a watch and in practice gives two. Measured on this head, seeds 1-30,
  // 3,000 ticks, two independent rulers agreeing seed for seed (new entries in `events.running`,
  // and non-"ended" card/authored chronicle lines): **median 2 starts, range 1 to 2, mean 1.90**;
  // **26 of 30** seeds show two distinct moment kinds; **0 of 30** show three; **0 of 30** go
  // without a card. Sweeping the levers does not rescue three kinds either — `minGapSimMinutes`
  // 800 -> 600 gives 1 of 30, -> 300 gives 6 of 30, `weightForCertainDraw` 12000 -> 4000 gives 3 of
  // 30, and gap 600 with weight 9000 together gives 9 of 30 while pushing the mean to 2.37, past
  // the owner's "about three moments per five minutes". Three kinds in five minutes and the owner's
  // pacing are in genuine tension once the birthday is not free, and which one gives is the owner's
  // call, not this lane's: see the PR's "Owner decision needed?".
  //
  // So the population test below pins what is true — that a five-minute watch is not one thing
  // happening once — at a floor with margin, and the seed-9 test is the readable demonstration on
  // the plan's own seed. Neither of them is the plan's three-kind bar, and neither pretends to be.
  it('seed 9, the plan’s own seed: two distinct moment kinds, and never the same kind twice running', () => {
    // Seed 9 was the plan's pinned seed; round 2 moved it to 25 after the warm-up fix, which the
    // round-3 verifier rightly called a seed chosen because it passed. Moving back to the plan's own
    // seed removes that choice: seed 9 is not picked, it is the one the document names. What it
    // shows on this head is a stray cat (`dl-trick`) and the merchant (`npc-arrival`) — two starts,
    // two kinds, no repeat.
    let s = createInitialState(9);
    const kinds = new Set<string>();
    const order: string[] = [];
    const kindOrder: string[] = [];
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
      }
    }
    expect(order.map((k) => k.split('@')[0])).toEqual(['strayCatVisits', 'merchantCaravan']);
    expect(kindOrder).toEqual(['dl-trick', 'npc-arrival']);
    expect(kinds.size).toBeGreaterThanOrEqual(2);
    expect(order.length).toBeGreaterThanOrEqual(2);
    // `PACING.noRepeatMomentKind`: never two of the same kind back to back. The quiet relaxation
    // deliberately lifts it after a long enough silence (see `eligibleCards`), so this is asserted
    // on this seed, where the relaxation never bit, and measured over the population below.
    for (let i = 1; i < kindOrder.length; i++) expect(kindOrder[i], `${kindOrder[i - 1]} then ${kindOrder[i]}`).not.toBe(kindOrder[i - 1]);
    // Every start is in the chronicle, told, not just held on the state.
    const told = s.chronicle.entries.filter((e) => e.source === 'card' || e.source === 'authored');
    expect(told.length).toBeGreaterThanOrEqual(order.length);
  });

  it('the population, seeds 1-30: a five-minute watch is never empty, and usually holds two kinds', () => {
    // A population bar, not a seed one — the round-3 verifier's finding C: a single seed can be
    // chosen to pass, and the seed-25 pin it replaced went on passing in worlds where five seeds in
    // thirty cleared the bar. This one cannot be satisfied by any single seed's luck.
    //
    // Measured at this head: two or more distinct kinds on **26 of 30**; two or more starts on
    // **27 of 30**; a card drawn on **30 of 30**; three or more distinct kinds on **0 of 30** (see
    // the block comment above — that is the plan's own bar, and it is the owner's decision to make,
    // not a number to quietly lower). The floors are set well under the measured values so a loss
    // of several seeds is tolerated and a collapse fails: 20 of 30 for the two-kind bar (measured
    // 26), 22 of 30 for the two-start bar (measured 27), and no seed at all silent.
    const kindCounts: number[] = [];
    const startCounts: number[] = [];
    const silent: number[] = [];
    const oneKind: number[] = [];
    const repeated: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      let s = createInitialState(seed);
      const kinds = new Set<string>();
      const seen = new Set<string>();
      const kindOrder: string[] = [];
      for (let i = 0; i < 3000; i++) {
        s = advance(s, 1);
        for (const r of s.events.running) {
          const key = `${r.id}@${r.startedMs}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const k = momentKindOf(r.id) ?? '?';
          kinds.add(k);
          kindOrder.push(k);
        }
      }
      kindCounts.push(kinds.size);
      startCounts.push(seen.size);
      if (seen.size === 0) silent.push(seed);
      if (kinds.size < 2) oneKind.push(seed);
      if (kindOrder.some((k, i) => i > 0 && k === kindOrder[i - 1])) repeated.push(seed);
    }
    const twoKinds = kindCounts.filter((n) => n >= 2).length;
    const threeKinds = kindCounts.filter((n) => n >= 3).length;
    const twoStarts = startCounts.filter((n) => n >= 2).length;
    const report = `kinds>=2 on ${twoKinds}/30 (measured 26), kinds>=3 on ${threeKinds}/30 (measured 0 — the plan's bar, see this block's comment), starts>=2 on ${twoStarts}/30 (measured 27), silent seeds ${silent.join(',') || 'none'}, one-kind seeds ${oneKind.join(',') || 'none'} (measured 1, 12, 25, 26)`;
    expect(twoKinds, report).toBeGreaterThanOrEqual(20);
    expect(twoStarts, report).toBeGreaterThanOrEqual(22);
    expect(silent, report).toEqual([]);
    // The no-repeat rule holds everywhere except where the quiet relaxation lifts it on purpose:
    // measured, exactly one seed of thirty shows two starts of the same kind running (seed 25,
    // `lostLamb` then `lambZoomiesHour`, both `lamb`, after a long silence).
    expect(repeated.length, `seeds with a back-to-back repeat kind: ${repeated.join(',') || 'none'} (measured 25)`).toBeLessThanOrEqual(3);
  });
});

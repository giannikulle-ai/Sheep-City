// The pre-engine view (#40), the way test/ledger.test.ts pinned #39's v4 view and
// test/chronicle.test.ts pinned #60's v5 view: with the engine off, the world this package runs is
// bitwise the world it ran before the engine existed. Strip `events` and put the version back to 6
// and the six hot-path worlds and both scripted days hash to exactly the values the trunk carried
// before this ticket.
//
// That is the whole claim, and it is worth being precise about what it does and does not cover.
// The engine's draws come from its own generator (`events.rng`, seeded from the world's seed), not
// from `state.rng`, so they never shift an actor's draw — but the engine's *effects* do change the
// world when it is directing: the merchant arrives on a card, shearing day tops every fleece, the
// farmer walks to the market at dawn. So this file's pins are the honest "the tick did not move"
// evidence; the engine-on pins in test/luna-day.test.ts and test/sheep-day.test.ts are where the
// world with events is pinned, and their comments say which lines moved and why.
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/hash';
import { createInitialState, SAVE_VERSION, type SimState } from '../src/state';
import { advance } from '../src/tick';

/** The state as a v6 build would hash it: no engine slice, version 6. */
function v6View(s: SimState): Record<string, unknown> {
  return { ...s, version: 6, events: undefined, season: preCalendarSeason(s.season), ledger: preSettlement(preCalendarLedger(s.ledger)), settlement: undefined };
}

/**
 * The settlement's purse (#86, save v9): a build before it never stored one, on the world or on the
 * Ledger snapshot, so every earlier view strips it. Stripping it is not enough to bring the old
 * hashes back on its own — #86 also moved the tick (the caravan stopped buying, the dawn market
 * walk started selling) — so the pinned values below moved with it and each says so.
 */
function preSettlement<T>(value: T): Record<string, unknown> {
  return { ...(value as Record<string, unknown>), settlement: undefined };
}

/**
 * A `season` as a build before #84 stored it: without `realEpochMs` and `seed`, the two numbers the
 * real-year calendar reads. `canonicalJson` (src/hash.ts) drops an undefined value, so this is the
 * same trick the version strips above use. The Ledger snapshot carries a `season` of its own and
 * needs the same treatment. See test/calendar.test.ts for the v7 view and the reason.
 */
function preCalendarSeason(season: SimState['season']): Record<string, unknown> {
  return { ...season, realEpochMs: undefined, seed: undefined };
}

function preCalendarLedger(ledger: SimState['ledger']): Record<string, unknown> {
  return { ...ledger, season: preCalendarSeason(ledger.season) };
}

/** A world with the engine off: no draws, no authored triggers, no scheduled category actions. */
function preEngine(seed: number, sheep?: number): SimState {
  return createInitialState(seed, sheep === undefined ? { events: false } : { sheep, events: false });
}

describe('the pre-engine view (#40 is a new path when the engine is off)', () => {
  // The pins the trunk carried before #40: test/hot-path-parity.test.ts's six worlds at 6,000
  // ticks, and the two scripted days' end-of-day hashes from test/luna-day.test.ts and
  // test/sheep-day.test.ts.
  // Moved again in #63 for the three 40-sheep worlds only: hay2's disposition eases grass regrow
  // once bought, and those worlds bank enough coins in 6,000 ticks to buy it. See
  // test/hot-path-parity.test.ts's header for the detail; the three 5-sheep worlds never reach it.
  // Moved a third time in #63's fix round (2026-09-08): hay2's bonus raised 0.15 -> 2.5 (same
  // header, same worlds — see test/hot-path-parity.test.ts's sixth-move note).
  // Moved a fourth time in #63's fix round 2 (2026-09-08, same day): hay2's bonus lowered
  // 2.5 -> 1.9 to keep grazing visible (same worlds — see test/hot-path-parity.test.ts's
  // seventh-move note).
  // **Moved a fifth time in #86** (the sim half of "no transaction on the farm", plan decision 12),
  // for all six: the merchant stopped buying the wool bank when he stops at the gate. These worlds
  // run with the engine off, where the only thing that ever sold the bank was his 45-second timer
  // and there is no dawn market walk to replace it, so the wool simply banks up and no coin is ever
  // earned. Each line carries its own pre-#86 value. The 1,800-tick worlds below are unaffected —
  // at 45 s the bank is still empty — which is why they still carry their old hashes.
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: '1f48612efdcb108a' /* PIN MOVED (#126): was 'be75b0c13d02eea4' */ }, // moved in #86: the caravan stopped buying the wool bank; was ec16cd89f0d97235
    { seed: 6, sheep: 40, hash: '81c4a33b959272d5' /* PIN MOVED (#126): was '1b9b37c787864bd0' */ }, // moved again in fix round 2: hay2's bonus lowered 2.5 -> 1.9; moved in #86: the caravan stopped buying the wool bank; was 146212a4ade8cea1
    { seed: 7, sheep: 5, hash: 'd478fdc5545d749a' /* PIN MOVED (#126): was 'd7050870cac90835' */ }, // moved in #86: the caravan stopped buying the wool bank; was 092b1cb807636e88
    { seed: 7, sheep: 40, hash: '4be14116acc3eaa1' /* PIN MOVED (#126): was '31b59b5e6cf779dd' */ }, // moved again in fix round 2: hay2's bonus lowered 2.5 -> 1.9; moved in #86: the caravan stopped buying the wool bank; was cf5dc67f12ea0812
    { seed: 11, sheep: 5, hash: '118ba9350ef5fd3d' /* PIN MOVED (#126): was '464f9db5052efdf5' */ }, // moved in #86: the caravan stopped buying the wool bank; was a70633600f30f95c
    { seed: 11, sheep: 40, hash: '10c65355d05a4305' /* PIN MOVED (#126): was '7a95966d0397195f' */ }, // moved again in fix round 2: hay2's bonus lowered 2.5 -> 1.9; moved in #86: the caravan stopped buying the wool bank; was 0a8c9f7ce39d4b7f
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as pinned on the v6 view`, () => {
      expect(hashState(v6View(advance(preEngine(seed, sheep), 6000)))).toBe(hash);
    });
  }

  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as before #40 on the v6 view", () => {
    expect(hashState(v6View(advance(preEngine(11), 1800)))).toBe('d153203a23e1f2e2' /* PIN MOVED (#126): was 'c69b538ba6cd2e56' */);
  });

  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as before #40 on the v6 view", () => {
    expect(hashState(v6View(advance(preEngine(71), 1800)))).toBe('4085e0e9e92b18e6' /* PIN MOVED (#126): was 'd0588aba21596281' */);
  });

  it('the engine-off world carries the slice but never writes to it, and tells nothing', () => {
    const s = advance(preEngine(11), 1800);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.events.enabled).toBe(false);
    expect(s.events.running).toEqual([]);
    expect(s.events.cooldowns).toEqual({});
    expect(s.events.starts).toEqual({});
    expect(s.events.lastStartMs).toBe(-1);
    expect(s.events.flags).toEqual({});
    expect(s.events.rng).toEqual(createInitialState(11, { events: false }).events.rng); // not one draw taken
    expect(s.chronicle.entries).toEqual([]);
  });

  it('the engine on is a different world, not a differently-shaped one', () => {
    const off = advance(preEngine(11), 1800);
    const on = advance(createInitialState(11), 1800);
    expect(hashState(v6View(on))).not.toBe(hashState(v6View(off)));
    expect(on.chronicle.entries.length).toBeGreaterThan(0);
  });
});

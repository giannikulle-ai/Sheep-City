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
  return { ...s, version: 6, events: undefined };
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
  // test/hot-path-parity.test.ts's header for the detail; the two 5-sheep worlds never reach it.
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: 'ec16cd89f0d97235' },
    { seed: 6, sheep: 40, hash: '766ca39d4dd8f66b' },
    { seed: 7, sheep: 5, hash: '092b1cb807636e88' },
    { seed: 7, sheep: 40, hash: '66bef1fdef89b24b' },
    { seed: 11, sheep: 5, hash: 'a70633600f30f95c' },
    { seed: 11, sheep: 40, hash: '9b68cb64b6d37d43' },
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as before #40 on the v6 view`, () => {
      expect(hashState(v6View(advance(preEngine(seed, sheep), 6000)))).toBe(hash);
    });
  }

  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as before #40 on the v6 view", () => {
    expect(hashState(v6View(advance(preEngine(11), 1800)))).toBe('c69b538ba6cd2e56');
  });

  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as before #40 on the v6 view", () => {
    expect(hashState(v6View(advance(preEngine(71), 1800)))).toBe('d0588aba21596281');
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

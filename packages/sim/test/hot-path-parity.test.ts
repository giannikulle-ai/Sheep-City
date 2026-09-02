// The registry and movement hot paths were made leaner in #27. The bar for that work is that no
// state hash moves: these hashes were taken on the trunk before the change (the merge of #26,
// 78fa585) and must hold after it. Three seeds, both the default flock and the 40-sheep bench
// district, 6,000 ticks (10 sim-minutes) each.
//
// If a hash here moves, some sheep, DL, or NPC took a different path or drew a different die.
// That is a parity break, not a number to update: find the behaviour change first.
import { describe, expect, it } from 'vitest';
import { LUNA_BEHAVIOURS, lunaContext } from '../src/behaviours/luna';
import { SHEEP_BEHAVIOURS, sheepContext } from '../src/behaviours/sheep';
import { hashState } from '../src/hash';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';

const TICKS = 6000;

const BEFORE: readonly { seed: number; sheep: number; hash: string }[] = [
  { seed: 6, sheep: 5, hash: '16b719c3a6bd440f' },
  { seed: 6, sheep: 40, hash: 'b92064dc37b91d1f' },
  { seed: 7, sheep: 5, hash: '385b513bb90971de' },
  { seed: 7, sheep: 40, hash: '7dbe55df7a926bb4' },
  { seed: 11, sheep: 5, hash: 'e66d5e8da809acba' },
  { seed: 11, sheep: 40, hash: '19ce2f87e5d69adb' },
];

describe('hot path parity (#27)', () => {
  for (const { seed, sheep, hash } of BEFORE) {
    it(`seed ${seed}, ${sheep} sheep, ${TICKS} ticks hashes as it did before the leaner registry`, () => {
      const s = advance(createInitialState(seed, { sheep }), TICKS);
      expect(s.clock.tick).toBe(TICKS);
      expect(hashState(s)).toBe(hash);
    });
  }
});

/**
 * A `contextOnly` behaviour promises its condition never reads the actor or the generator. Hold
 * every flagged behaviour to it: the actor is a trap that throws on any read, and so is the
 * generator's state. Rain on and off, since the flagged conditions branch on it.
 */
describe('contextOnly behaviours keep their promise', () => {
  const trap = <T extends object>(what: string): T =>
    new Proxy({} as T, {
      get: (_t, key) => {
        throw new Error(`${what} read (${String(key)}) inside a contextOnly condition`);
      },
    });

  it('every flagged sheep and DL behaviour reads only the context', () => {
    let flagged = 0;
    for (const [reg, context] of [
      [SHEEP_BEHAVIOURS, sheepContext] as const,
      [LUNA_BEHAVIOURS, lunaContext] as const,
    ]) {
      for (const chain of reg.chains()) {
        for (const b of reg.behaviours(chain)) {
          if (!b.contextOnly) continue;
          flagged++;
          for (const rain of [false, true]) {
            const s = createInitialState(7);
            s.weather = { ...s.weather, rain };
            const ctx = { ...context(s), rng: trap<typeof s.rng>('generator') };
            expect(() => b.condition(ctx as never, trap('actor'))).not.toThrow();
          }
        }
      }
    }
    // The sheep's shelter pair and the lambs chain; DL has none.
    expect(flagged).toBe(3);
    expect(SHEEP_BEHAVIOURS.behaviours('shelter').every((b) => b.contextOnly)).toBe(true);
    expect(SHEEP_BEHAVIOURS.behaviours('lambs').every((b) => b.contextOnly)).toBe(true);
  });
});

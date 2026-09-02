// The registry and movement hot paths were made leaner in #27. The bar for that work is that no
// state hash moves: these hashes pin the world after three seeds, both the default flock and the
// 40-sheep bench district, 6,000 ticks (10 sim-minutes) each.
//
// The pins were taken on the trunk before #27 (the merge of #26, 78fa585) and held through it.
// They moved once since, in #33: the bird rolls for a landing every tick it is away, the way the
// prototype's `tickLife` did, and that one new draw per tick shifts every later one; the ground
// stamps also draw in rain (a mud radius) and on a melt. These are the hashes after that change.
//
// If a hash here moves, some sheep, DL, or NPC took a different path or drew a different die.
// That is a parity break, not a number to update: find the behaviour change first, and if it is a
// deliberate new draw, say so in the PR.
import { describe, expect, it } from 'vitest';
import { LUNA_BEHAVIOURS, lunaContext } from '../src/behaviours/luna';
import { SHEEP_BEHAVIOURS, sheepContext, type SheepBehaviour, type SheepContext } from '../src/behaviours/sheep';
import { hashState } from '../src/hash';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';

const TICKS = 6000;

const BEFORE: readonly { seed: number; sheep: number; hash: string }[] = [
  { seed: 6, sheep: 5, hash: 'e85cbb53bef79387' },
  { seed: 6, sheep: 40, hash: '681d0cbae2eace49' },
  { seed: 7, sheep: 5, hash: 'bf1769cf3184be53' },
  { seed: 7, sheep: 40, hash: '1591607e60b10a89' },
  { seed: 11, sheep: 5, hash: 'a5735abd6b19878b' },
  { seed: 11, sheep: 40, hash: '71769756e8746076' },
];

describe('hot path parity (#27)', () => {
  for (const { seed, sheep, hash } of BEFORE) {
    it(`seed ${seed}, ${sheep} sheep, ${TICKS} ticks hashes as pinned`, () => {
      const s = advance(createInitialState(seed, { sheep }), TICKS);
      expect(s.clock.tick).toBe(TICKS);
      expect(hashState(s)).toBe(hash);
    });
  }
});

/**
 * A `contextOnly` behaviour promises its condition reads only the tick-invariant fields of the
 * context: never the actor, the generator, the world state, or a field written per actor (for
 * sheep, `fx`, `fy`, `flock`). Hold every flagged behaviour to it with traps: the actor throws on
 * any read, and the context exposes only the invariant scalars and throws on everything else,
 * `state`, `rng`, `fx`, `fy`, `flock` included. Rain on and off, since the flagged conditions
 * branch on it.
 */
describe('contextOnly behaviours keep their promise', () => {
  /** The context fields set once at the top of a tick, per actor kind. Nothing else is readable. */
  const INVARIANT = {
    sheep: ['now', 'dt', 'night', 'rain', 'snow'],
    luna: ['now', 'dt', 'phase', 'night', 'rain', 'temp', 'calm'],
  } as const;

  const trapActor = (): never =>
    new Proxy(
      {},
      {
        get: (_t, key) => {
          throw new Error(`actor read (${String(key)}) inside a contextOnly condition`);
        },
      },
    ) as never;

  /** A context that answers only the invariant fields from `real` and throws on any other read. */
  const trapContext = (real: object, allowed: readonly string[]): never =>
    new Proxy(
      {},
      {
        get: (_t, key) => {
          if (typeof key === 'string' && allowed.includes(key)) return (real as Record<string, unknown>)[key];
          throw new Error(`context.${String(key)} read inside a contextOnly condition; only ${allowed.join(', ')} are tick-invariant`);
        },
        has: (_t, key) => typeof key === 'string' && allowed.includes(key),
      },
    ) as never;

  it('every flagged sheep and DL behaviour reads only the tick-invariant context fields', () => {
    let flagged = 0;
    for (const [reg, context, allowed] of [
      [SHEEP_BEHAVIOURS, sheepContext, INVARIANT.sheep] as const,
      [LUNA_BEHAVIOURS, lunaContext, INVARIANT.luna] as const,
    ]) {
      for (const chain of reg.chains()) {
        for (const b of reg.behaviours(chain)) {
          if (!b.contextOnly) continue;
          flagged++;
          for (const rain of [false, true]) {
            const s = createInitialState(7);
            s.weather = { ...s.weather, rain };
            const real = context(s);
            expect(() => b.condition(trapContext(real, allowed), trapActor()), `${b.id}, rain ${rain}`).not.toThrow();
            // And the trap answers as the real context would, so the promise test tests the real condition.
            expect(b.condition(trapContext(real, allowed), trapActor())).toBe(b.condition(real as never, s.sheep[0] as never));
          }
        }
      }
    }
    // The sheep's shelter pair and the lambs chain; DL has none.
    expect(flagged).toBe(3);
    expect(SHEEP_BEHAVIOURS.behaviours('shelter').every((b) => b.contextOnly)).toBe(true);
    expect(SHEEP_BEHAVIOURS.behaviours('lambs').every((b) => b.contextOnly)).toBe(true);
  });

  it('the trap context catches a condition that reads a per-sheep field', () => {
    const s = createInitialState(7);
    const ctx = trapContext(sheepContext(s), INVARIANT.sheep) as SheepContext;
    expect(() => ctx.rain).not.toThrow();
    expect(() => ctx.fx).toThrow(/context\.fx/);
    expect(() => ctx.flock).toThrow(/context\.flock/);
    expect(() => ctx.state).toThrow(/context\.state/);
    expect(() => ctx.rng).toThrow(/context\.rng/);
    const lookAtFlock: SheepBehaviour['condition'] = ({ flock }) => flock < 9;
    expect(() => lookAtFlock(ctx, trapActor())).toThrow(/context\.flock/);
  });
});

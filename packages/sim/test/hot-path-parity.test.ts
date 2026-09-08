// The registry and movement hot paths were made leaner in #27. The bar for that work is that no
// state hash moves: these hashes pin the world after three seeds, both the default flock and the
// 40-sheep bench district, 6,000 ticks (10 sim-minutes) each.
//
// The pins were taken on the trunk before #27 (the merge of #26, 78fa585) and held through it.
// They moved once since, in #33: the bird rolls for a landing every tick it is away, the way the
// prototype's `tickLife` did, and that one new draw per tick shifts every later one; the ground
// stamps also draw in rain (a mud radius) and on a melt. These are the hashes after that change.
//
// They moved again in #39, for the schema only: the state now carries `ledger` and `lastLedgerAt`
// and is v5, and the hash covers the whole state. test/ledger.test.ts pins the same six worlds on
// their v4 view (those two fields and the version taken off) to the hashes from before #39.
//
// They moved a third time in #60, for the schema only again: the state now carries `chronicle`
// (empty on every one of these worlds; nothing here calls `tell`) and is v6. test/chronicle.test.ts
// pins the same six worlds on their v5 view (`chronicle` taken off, version put back to 5) to the
// hashes from before #60.
//
// They moved a fourth time in #40: the state now carries `events` and is v7. These six worlds are
// built with the engine off (`events: false`) so this file keeps meaning what it says — with the
// engine directing, a card can move a sheep or bring the farmer in, and a hash here would move for
// that rather than for a parity break. So the values below are the same worlds as before with one
// more (inert) field on them and a new version number; test/engine-parity.test.ts hashes their v6
// view — `events` stripped, version back to 6 — to the values this file carried before #40, which
// is what proves the tick itself did not move. The engine-on worlds are pinned there too.
//
// They moved a fifth time in #63: hay2's disposition eases `tuftRegrowPerSec` up by a fraction
// once owned (rules.ts's `hay2RegrowMult`), and the 40-sheep worlds bank enough coins inside 6,000
// ticks to buy it (flowerbed at 12, hay2 at 30 more), so grass — and everything downstream of it —
// runs differently for them from the moment it is bought. The two 5-sheep worlds never reach 42
// coins in this window and are untouched; only the three 40-sheep hashes below moved.
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
  { seed: 6, sheep: 5, hash: '0791cd39c7e2aab8' },
  { seed: 6, sheep: 40, hash: '4d4282b7e4bc683c' }, // moved in #63: hay2 bought, grass regrow eased up
  { seed: 7, sheep: 5, hash: '0ed2243395f4d7e2' },
  { seed: 7, sheep: 40, hash: '4e8d44807f5111f9' }, // moved in #63: hay2 bought, grass regrow eased up
  { seed: 11, sheep: 5, hash: '0e4a4606aab31838' },
  { seed: 11, sheep: 40, hash: 'eb6b8440b3803fd8' }, // moved in #63: hay2 bought, grass regrow eased up
];

describe('hot path parity (#27)', () => {
  for (const { seed, sheep, hash } of BEFORE) {
    it(`seed ${seed}, ${sheep} sheep, ${TICKS} ticks hashes as pinned`, () => {
      const s = advance(createInitialState(seed, { sheep, events: false }), TICKS);
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

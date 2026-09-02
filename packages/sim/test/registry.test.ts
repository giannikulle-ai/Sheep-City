import { describe, expect, it } from 'vitest';
import { createRegistry, type Behaviour } from '../src/behaviours/registry';
import { createRng, nextFloat, type Rng } from '../src/rng';
import { rngWhereNextFloatIn } from './luna-helpers';

interface Ctx {
  rng: Rng;
  log: string[];
}

interface Actor {
  name: string;
  hungry: boolean;
  tired: boolean;
}

/** The generator state after one draw from `s`. */
function nextState(s: number): number {
  const r = { s };
  nextFloat(r);
  return r.s;
}

function ctx(seed = 1): Ctx {
  return { rng: createRng(seed), log: [] };
}

function make(id: string, priority: number, holds: (a: Actor) => boolean, extra: Partial<Behaviour<Ctx, Actor>> = {}): Behaviour<Ctx, Actor> {
  return {
    id,
    priority,
    ...extra,
    condition: (c, a) => {
      c.log.push(`?${id}`);
      return holds(a);
    },
    tick: (c) => {
      c.log.push(`!${id}`);
    },
  };
}

describe('behaviour registry', () => {
  it('runs the highest-priority behaviour whose condition holds, and nothing below it', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('wander', 1, () => true));
    reg.register(make('eat', 10, (a) => a.hungry));
    reg.register(make('sleep', 20, (a) => a.tired));
    const c = ctx();
    expect(reg.run(c, { name: 'a', hungry: true, tired: false })).toEqual(['eat']);
    expect(c.log).toEqual(['?sleep', '?eat', '!eat']);
    expect(reg.run(ctx(), { name: 'a', hungry: false, tired: false })).toEqual(['wander']);
    expect(reg.run(ctx(), { name: 'a', hungry: true, tired: true })).toEqual(['sleep']);
    expect(reg.behaviours().map((b) => b.id)).toEqual(['sleep', 'eat', 'wander']);
  });

  it('selects per actor: the same registry gives different actors different behaviours', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('eat', 10, (a) => a.hungry));
    reg.register(make('rest', 5, (a) => a.tired));
    const c = ctx();
    expect(reg.select(c, { name: 'a', hungry: true, tired: true })?.id).toBe('eat');
    expect(reg.select(c, { name: 'b', hungry: false, tired: true })?.id).toBe('rest');
    expect(reg.select(c, { name: 'c', hungry: false, tired: false })).toBeNull();
  });

  it('breaks priority ties by registration order and evaluates each condition at most once', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('second', 5, () => true));
    reg.register(make('first', 7, () => true));
    reg.register(make('alsoSecond', 5, () => true));
    reg.register(make('afterFirst', 7, () => true));
    const c = ctx();
    expect(reg.run(c, { name: 'a', hungry: false, tired: false })).toEqual(['first']);
    // Both 7s were checked (a weighted group needs to know who is eligible); the 5s were not.
    expect(c.log).toEqual(['?first', '?afterFirst', '!first']);
  });

  it('draws one weighted pick among equal-priority behaviours, thresholds in registration order', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('flop', 0, () => true, { weight: 0.22 }));
    reg.register(make('stick', 0, () => true, { weight: 0.22 }));
    reg.register(make('ride', 0, () => true, { weight: 0.12 }));
    reg.register(make('nibble', 0, () => true, { weight: 0.22 }));
    reg.register(make('rabbit', 0, () => true, { weight: 0.22 }));
    const actor = { name: 'dl', hungry: false, tired: false };
    const at = (lo: number, hi: number) => {
      const c = { rng: rngWhereNextFloatIn(lo, hi), log: [] };
      const before = c.rng.s;
      const id = reg.select(c, actor)?.id;
      expect(c.rng.s).not.toBe(before); // a draw happened
      expect(c.rng.s).toBe(nextState(before)); // exactly one
      return id;
    };
    expect(at(0, 0.22)).toBe('flop');
    expect(at(0.22, 0.44)).toBe('stick');
    expect(at(0.44, 0.56)).toBe('ride');
    expect(at(0.56, 0.78)).toBe('nibble');
    expect(at(0.78, 1)).toBe('rabbit');
    expect(at(0.2199, 0.22)).toBe('flop');
    expect(at(0.22, 0.2201)).toBe('stick');
  });

  it('only draws among the eligible members of a weighted group', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('a', 0, () => false, { weight: 0.5 }));
    reg.register(make('b', 0, () => true, { weight: 0.5 }));
    reg.register(make('c', 0, () => true, { weight: 0.5 }));
    const c = { rng: rngWhereNextFloatIn(0, 0.49), log: [] };
    expect(reg.select(c, { name: 'x', hungry: false, tired: false })?.id).toBe('b');
    const d = { rng: rngWhereNextFloatIn(0.51, 1), log: [] };
    expect(reg.select(d, { name: 'x', hungry: false, tired: false })?.id).toBe('c');
  });

  it('falls back to registration order, without a draw, when a tied behaviour has no weight', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('a', 0, () => true, { weight: 1 }));
    reg.register(make('b', 0, () => true));
    const c = ctx(3);
    const before = c.rng.s;
    expect(reg.select(c, { name: 'x', hungry: false, tired: false })?.id).toBe('a');
    expect(c.rng.s).toBe(before);
  });

  it('runs one winner per chain, chains in registration order, until an exclusive behaviour runs', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('walk', 0, () => true, { chain: 'move' }));
    reg.register(make('fetch', 100, (a) => a.hungry, { chain: 'fetch', exclusive: true }));
    reg.register(make('routine', 1, () => true, { chain: 'routine' }));
    reg.register(make('command', 1, (a) => a.tired, { chain: 'command' }));
    expect(reg.chains()).toEqual(['move', 'fetch', 'routine', 'command']);
    expect(reg.run(ctx(), { name: 'a', hungry: false, tired: true })).toEqual(['walk', 'routine', 'command']);
    // `fetch` is exclusive: chains after it are skipped, chains before it still ran.
    expect(reg.run(ctx(), { name: 'a', hungry: true, tired: true })).toEqual(['walk', 'fetch']);
    expect(reg.behaviours('nope')).toEqual([]);
    expect(reg.select(ctx(), { name: 'a', hungry: false, tired: false }, 'command')).toBeNull();
    expect(reg.get('fetch')?.exclusive).toBe(true);
    expect(reg.get('missing')).toBeUndefined();
  });

  it('step runs what run runs, in the same order with the same draws, and returns the exclusive cut-off', () => {
    const build = () => {
      const reg = createRegistry<Ctx, Actor>();
      reg.register(make('walk', 0, () => true, { chain: 'move' }));
      reg.register(make('fetch', 100, (a) => a.hungry, { chain: 'fetch', exclusive: true }));
      reg.register(make('flop', 1, () => true, { chain: 'routine', weight: 0.5 }));
      reg.register(make('stick', 1, (a) => !a.tired, { chain: 'routine', weight: 0.5 }));
      reg.register(make('command', 1, (a) => a.tired, { chain: 'command' }));
      return reg;
    };
    for (const actor of [
      { name: 'a', hungry: false, tired: false },
      { name: 'b', hungry: false, tired: true },
      { name: 'c', hungry: true, tired: false },
    ]) {
      const traced = ctx(9);
      const ran = build().run(traced, actor);
      const lean = ctx(9);
      const cut = build().step(lean, actor);
      expect(lean.log, actor.name).toEqual(traced.log);
      expect(lean.rng.s, actor.name).toBe(traced.rng.s);
      expect(cut?.id ?? null, actor.name).toBe(actor.hungry ? 'fetch' : null);
      expect(ran, actor.name).toEqual(actor.hungry ? ['walk', 'fetch'] : actor.tired ? ['walk', 'flop', 'command'] : ['walk', 'flop']);
    }
    // The untied actor drew once (flop and stick both held); the tired one did not (only flop held).
    expect(ctx(9).rng.s).toBe(createRng(9).s);
    const a = ctx(9);
    build().step(a, { name: 'a', hungry: false, tired: false });
    expect(a.rng.s).toBe(nextState(createRng(9).s));
    const b = ctx(9);
    build().step(b, { name: 'b', hungry: false, tired: true });
    expect(b.rng.s).toBe(createRng(9).s);
  });

  it('evaluates every condition of a tied run exactly once, whichever member wins the draw', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('top', 5, () => false));
    reg.register(make('a', 0, () => true, { weight: 1 }));
    reg.register(make('b', 0, () => true, { weight: 1 }));
    reg.register(make('c', 0, () => false, { weight: 1 }));
    reg.register(make('d', 0, () => true, { weight: 1 }));
    for (const [lo, hi, want] of [
      [0, 0.33, 'a'],
      [0.34, 0.66, 'b'],
      [0.67, 1, 'd'],
    ] as const) {
      const c = { rng: rngWhereNextFloatIn(lo, hi), log: [] as string[] };
      expect(reg.step(c, { name: 'x', hungry: false, tired: false })?.id ?? null).toBeNull();
      expect(c.log).toEqual(['?top', '?a', '?b', '?c', '?d', `!${want}`]);
    }
  });

  it('keeps a longer tied run intact when a later registration lengthens it', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('a', 0, () => true, { weight: 1 }));
    reg.register(make('hi', 9, () => false));
    for (let i = 0; i < 40; i++) reg.register(make(`b${i}`, 0, () => true, { weight: 1 }));
    // Registered last; belongs at the front of the run, so the run is now 42 long.
    reg.register(make('z', 0, () => true, { weight: 1 }));
    const c = { rng: rngWhereNextFloatIn(0.99, 1), log: [] as string[] };
    expect(reg.select(c, { name: 'x', hungry: false, tired: false })?.id).toBe('z');
    expect(c.log.length).toBe(43);
  });

  describe('contextOnly chains', () => {
    const build = () => {
      const reg = createRegistry<Ctx, Actor>();
      reg.register(make('rain', 10, () => false, { chain: 'shelter', contextOnly: true }));
      reg.register(make('dry', 0, () => true, { chain: 'shelter', contextOnly: true }));
      // A mixed chain: one member reads the actor, so nothing here may be reused.
      reg.register(make('night', 10, () => false, { chain: 'rest', contextOnly: true }));
      reg.register(make('wake', 0, (a) => a.tired, { chain: 'rest' }));
      return reg;
    };
    const a = { name: 'a', hungry: false, tired: true };
    const b = { name: 'b', hungry: false, tired: true };

    it('selects a context-only chain once per context and reuses the winner for later actors', () => {
      const reg = build();
      const c = ctx();
      expect(reg.run(c, a)).toEqual(['dry', 'wake']);
      expect(reg.run(c, b)).toEqual(['dry', 'wake']);
      // The shelter conditions ran once; the rest chain's ran for both actors.
      expect(c.log).toEqual(['?rain', '?dry', '!dry', '?night', '?wake', '!wake', '!dry', '?night', '?wake', '!wake']);
    });

    it('selects again under a new context object', () => {
      const reg = build();
      const c1 = ctx();
      reg.step(c1, a);
      const c2 = ctx();
      reg.step(c2, a);
      expect(c2.log).toEqual(['?rain', '?dry', '!dry', '?night', '?wake', '!wake']);
    });

    it('memoises a null winner too', () => {
      const reg = createRegistry<Ctx, Actor>();
      reg.register(make('never', 0, () => false, { chain: 'x', contextOnly: true }));
      reg.register(make('always', 0, () => true, { chain: 'y' }));
      const c = ctx();
      expect(reg.run(c, a)).toEqual(['always']);
      expect(reg.run(c, b)).toEqual(['always']);
      expect(c.log.filter((l) => l === '?never')).toHaveLength(1);
    });

    it('does not memoise a chain once a member without the flag joins it', () => {
      const reg = build();
      const c = ctx();
      reg.step(c, a);
      reg.register(make('lateActor', 5, (x) => x.hungry, { chain: 'shelter' }));
      reg.step(c, b);
      reg.step(c, a);
      expect(c.log.filter((l) => l === '?dry')).toHaveLength(3);
    });

    it('a registration invalidates the memo even when the chain stays context-only', () => {
      const reg = build();
      const c = ctx();
      expect(reg.select(c, a, 'shelter')?.id).toBe('dry');
      reg.register(make('storm', 20, () => true, { chain: 'shelter', contextOnly: true }));
      expect(reg.select(c, a, 'shelter')?.id).toBe('storm');
    });

    it('refuses a weighted context-only behaviour: a draw reads the generator', () => {
      const reg = createRegistry<Ctx, Actor>();
      expect(() => reg.register(make('w', 0, () => true, { weight: 1, contextOnly: true }))).toThrow(/contextOnly/);
    });
  });

  it('rejects duplicate ids and bad weights or priorities', () => {
    const reg = createRegistry<Ctx, Actor>();
    reg.register(make('a', 0, () => true));
    expect(() => reg.register(make('a', 1, () => true))).toThrow(/already registered/);
    expect(() => reg.register(make('w', 0, () => true, { weight: 0 }))).toThrow(/weight/);
    expect(() => reg.register(make('p', NaN, () => true))).toThrow(/priority/);
  });
});

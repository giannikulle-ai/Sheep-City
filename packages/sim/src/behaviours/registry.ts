// Behaviour registry: the prototype's if/else chains as data.
//
// A behaviour is `(id, priority, condition, tick)`. Each tick an actor runs the highest-priority
// behaviour whose condition holds. Two extras cover what the prototype actually does:
//
// - `weight`: behaviours at the same priority whose conditions all hold form a weighted group and
//   one is drawn with a single roll of the seeded generator. This is how DL's idle play picks
//   flop / stick / ride / nibble / rabbit with the prototype's thresholds.
// - `chain`: the prototype's DL section runs two if/else chains one after the other every frame
//   (commands, then routines), plus a fetch pre-empt and a movement pass. A registry may hold
//   several chains; each tick every chain runs its own winner, chains in registration order. A
//   behaviour marked `exclusive` stops the later chains for that tick, as the prototype's fetch
//   branch `return`s out of `tick`. A registry with one chain is the plain "highest priority wins".
//
// Conditions run in priority order and at most once per actor per tick, and may draw from the
// generator (the prototype rolls dice inside some of its `else if` tests). Ties in priority go to
// the behaviour registered first.

import { nextFloat, type Rng } from '../rng';

export interface Behaviour<C, A> {
  /** Unique within a registry. */
  readonly id: string;
  /** Higher runs first. */
  readonly priority: number;
  /** Which chain this belongs to. Default `'main'`. */
  readonly chain?: string;
  /** Weight for a draw among equal-priority behaviours whose conditions hold. */
  readonly weight?: number;
  /** When this behaviour runs, later chains are skipped for the tick. */
  readonly exclusive?: boolean;
  condition(ctx: C, actor: A): boolean;
  tick(ctx: C, actor: A): void;
}

export const DEFAULT_CHAIN = 'main';

export interface Registry<C extends { rng: Rng }, A> {
  /** Add a behaviour. Throws on a duplicate id. Returns the behaviour for chaining. */
  register(behaviour: Behaviour<C, A>): Behaviour<C, A>;
  /** Behaviours of one chain, highest priority first, registration order for ties. */
  behaviours(chain?: string): readonly Behaviour<C, A>[];
  /** Chain names in the order they first appeared. */
  chains(): readonly string[];
  /** Look one behaviour up by id. */
  get(id: string): Behaviour<C, A> | undefined;
  /**
   * The behaviour this actor would run in one chain: the highest priority whose condition holds,
   * with one weighted roll if several at that priority hold and all carry weights. Null if none.
   */
  select(ctx: C, actor: A, chain?: string): Behaviour<C, A> | null;
  /**
   * Run one tick for an actor: every chain in order runs its selected behaviour, until an
   * exclusive behaviour runs. Returns the ids run, in order.
   */
  run(ctx: C, actor: A): string[];
}

export function createRegistry<C extends { rng: Rng }, A>(): Registry<C, A> {
  const byChain = new Map<string, Behaviour<C, A>[]>();
  const byId = new Map<string, Behaviour<C, A>>();

  function register(behaviour: Behaviour<C, A>): Behaviour<C, A> {
    if (byId.has(behaviour.id)) throw new Error(`behaviour "${behaviour.id}" is already registered`);
    if (!Number.isFinite(behaviour.priority)) throw new Error(`behaviour "${behaviour.id}": priority must be finite`);
    if (behaviour.weight !== undefined && !(behaviour.weight > 0)) {
      throw new Error(`behaviour "${behaviour.id}": weight must be positive`);
    }
    const chain = behaviour.chain ?? DEFAULT_CHAIN;
    let list = byChain.get(chain);
    if (!list) {
      list = [];
      byChain.set(chain, list);
    }
    // Insert after every behaviour of equal or higher priority: sorted descending, stable.
    let i = list.length;
    while (i > 0 && (list[i - 1] as Behaviour<C, A>).priority < behaviour.priority) i--;
    list.splice(i, 0, behaviour);
    byId.set(behaviour.id, behaviour);
    return behaviour;
  }

  function select(ctx: C, actor: A, chain = DEFAULT_CHAIN): Behaviour<C, A> | null {
    const list = byChain.get(chain);
    if (!list) return null;
    let first = -1;
    for (let i = 0; i < list.length; i++) {
      if ((list[i] as Behaviour<C, A>).condition(ctx, actor)) {
        first = i;
        break;
      }
    }
    if (first < 0) return null;
    const winner = list[first] as Behaviour<C, A>;
    // Gather the rest of the same priority whose conditions hold.
    const group: Behaviour<C, A>[] = [winner];
    for (let i = first + 1; i < list.length; i++) {
      const b = list[i] as Behaviour<C, A>;
      if (b.priority !== winner.priority) break;
      if (b.condition(ctx, actor)) group.push(b);
    }
    if (group.length === 1 || group.some((b) => b.weight === undefined)) return winner;
    let total = 0;
    for (const b of group) total += b.weight as number;
    const r = nextFloat(ctx.rng) * total;
    let acc = 0;
    for (const b of group) {
      acc += b.weight as number;
      if (r < acc) return b;
    }
    return group[group.length - 1] as Behaviour<C, A>;
  }

  function run(ctx: C, actor: A): string[] {
    const ran: string[] = [];
    for (const chain of byChain.keys()) {
      const b = select(ctx, actor, chain);
      if (!b) continue;
      b.tick(ctx, actor);
      ran.push(b.id);
      if (b.exclusive) break;
    }
    return ran;
  }

  return {
    register,
    behaviours: (chain = DEFAULT_CHAIN) => byChain.get(chain) ?? [],
    chains: () => [...byChain.keys()],
    get: (id) => byId.get(id),
    select,
    run,
  };
}

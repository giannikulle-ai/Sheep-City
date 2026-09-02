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
//
// The hot path (`step`, and `select` under it) allocates nothing: forty sheep walk six chains
// each every 100 ms tick, so the per-call work is a few array reads and the condition calls the
// prototype made anyway. `run` is the traced form for tests and a debug overlay; it returns the
// ids that ran and so allocates one small array per call.
//
// - `contextOnly`: a condition that reads the context alone (never the actor, never the
//   generator) cannot change between one actor and the next within a tick. When every behaviour
//   of a chain says so, the registry evaluates that chain once per context object and reuses the
//   winner for every actor stepped under it: the sheep's `shelter` and `lambs` chains, which
//   only ask whether it is raining. A context object therefore stands for one tick. Build a
//   fresh one per tick, as `sheepContext` and `lunaContext` do, and never mutate one between
//   runs. The registry keeps a reference to the last such context until the next tick replaces it.

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
  /**
   * The condition reads the context alone: not the actor, not the generator. A chain of such
   * behaviours is selected once per context object (see the note at the top). Not allowed with
   * `weight`, since a draw reads the generator.
   */
  readonly contextOnly?: boolean;
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
   * exclusive behaviour runs. Returns the ids run, in order. Allocates that array; the sim's
   * per-actor loops use `step`.
   */
  run(ctx: C, actor: A): string[];
  /**
   * `run` without the trace: the same behaviours run in the same order with the same draws, and
   * nothing is allocated. Returns the exclusive behaviour that cut the walk short, or null when
   * every chain had its turn.
   */
  step(ctx: C, actor: A): Behaviour<C, A> | null;
}

/** One chain: its behaviours sorted, and for each index where its run of equal priority ends. */
interface Chain<C, A> {
  readonly list: Behaviour<C, A>[];
  /** `runEnd[i]` is one past the last index whose priority equals `list[i].priority`. */
  runEnd: number[];
  /** Every member is `contextOnly`, so one selection per context serves every actor. */
  contextOnly: boolean;
  /** The context the memoised winner was selected under, and that winner. */
  memoCtx: C | null;
  memoWinner: Behaviour<C, A> | null;
}

export function createRegistry<C extends { rng: Rng }, A>(): Registry<C, A> {
  const byChain = new Map<string, Chain<C, A>>();
  const byId = new Map<string, Behaviour<C, A>>();
  /** The chains in first-appearance order, for `step` to walk without a Map iterator. */
  const chainList: Chain<C, A>[] = [];
  /**
   * Which members of an equal-priority run hold this call, by offset from the run's first member.
   * Sized to the longest run at registration time, so a draw never allocates.
   */
  let holds = new Uint8Array(0);

  function register(behaviour: Behaviour<C, A>): Behaviour<C, A> {
    if (byId.has(behaviour.id)) throw new Error(`behaviour "${behaviour.id}" is already registered`);
    if (!Number.isFinite(behaviour.priority)) throw new Error(`behaviour "${behaviour.id}": priority must be finite`);
    if (behaviour.weight !== undefined && !(behaviour.weight > 0)) {
      throw new Error(`behaviour "${behaviour.id}": weight must be positive`);
    }
    if (behaviour.contextOnly && behaviour.weight !== undefined) {
      throw new Error(`behaviour "${behaviour.id}": a weighted draw reads the generator, so it cannot be contextOnly`);
    }
    const name = behaviour.chain ?? DEFAULT_CHAIN;
    let chain = byChain.get(name);
    if (!chain) {
      chain = { list: [], runEnd: [], contextOnly: false, memoCtx: null, memoWinner: null };
      byChain.set(name, chain);
      chainList.push(chain);
    }
    chain.contextOnly = behaviour.contextOnly === true && (chain.list.length === 0 || chain.contextOnly);
    chain.memoCtx = null;
    chain.memoWinner = null;
    const list = chain.list;
    // Insert after every behaviour of equal or higher priority: sorted descending, stable.
    let i = list.length;
    while (i > 0 && (list[i - 1] as Behaviour<C, A>).priority < behaviour.priority) i--;
    list.splice(i, 0, behaviour);
    byId.set(behaviour.id, behaviour);
    // Recompute the run ends for this chain, back to front, and grow the scratch if a run got longer.
    const runEnd: number[] = new Array<number>(list.length);
    let end = list.length;
    for (let j = list.length - 1; j >= 0; j--) {
      if (j + 1 < list.length && (list[j] as Behaviour<C, A>).priority !== (list[j + 1] as Behaviour<C, A>).priority) end = j + 1;
      runEnd[j] = end;
      if (end - j > holds.length) holds = new Uint8Array(end - j);
    }
    chain.runEnd = runEnd;
    return behaviour;
  }

  function select(ctx: C, actor: A, chain = DEFAULT_CHAIN): Behaviour<C, A> | null {
    const c = byChain.get(chain);
    return c ? selectIn(c, ctx, actor) : null;
  }

  function selectIn(chain: Chain<C, A>, ctx: C, actor: A): Behaviour<C, A> | null {
    if (chain.contextOnly) {
      if (chain.memoCtx === ctx) return chain.memoWinner;
      const winner = walk(chain, ctx, actor);
      chain.memoCtx = ctx;
      chain.memoWinner = winner;
      return winner;
    }
    return walk(chain, ctx, actor);
  }

  function walk(chain: Chain<C, A>, ctx: C, actor: A): Behaviour<C, A> | null {
    const list = chain.list;
    const n = list.length;
    let first = 0;
    for (; first < n; first++) if ((list[first] as Behaviour<C, A>).condition(ctx, actor)) break;
    if (first === n) return null;
    const winner = list[first] as Behaviour<C, A>;
    const end = chain.runEnd[first] as number;
    // Alone at its priority: nothing to draw among, and no other condition to run.
    if (end === first + 1) return winner;
    // The rest of the run: every condition runs once (some roll dice), in registration order, as
    // the prototype's `else if` tests would. Remember who holds, and sum the weights in that order
    // so the total is bitwise the prototype's.
    let count = 1;
    let unweighted = winner.weight === undefined;
    let total = winner.weight ?? 0;
    for (let i = first + 1; i < end; i++) {
      const b = list[i] as Behaviour<C, A>;
      const h = b.condition(ctx, actor);
      holds[i - first] = h ? 1 : 0;
      if (!h) continue;
      count++;
      if (b.weight === undefined) unweighted = true;
      else total += b.weight;
    }
    // A lone holder, or a holder without a weight: first registered wins and no die is rolled.
    if (count === 1 || unweighted) return winner;
    const r = nextFloat(ctx.rng) * total;
    let acc = winner.weight as number;
    if (r < acc) return winner;
    let last = winner;
    for (let i = first + 1; i < end; i++) {
      if (!holds[i - first]) continue;
      last = list[i] as Behaviour<C, A>;
      acc += last.weight as number;
      if (r < acc) return last;
    }
    return last;
  }

  function step(ctx: C, actor: A): Behaviour<C, A> | null {
    for (let c = 0; c < chainList.length; c++) {
      const b = selectIn(chainList[c] as Chain<C, A>, ctx, actor);
      if (!b) continue;
      b.tick(ctx, actor);
      if (b.exclusive) return b;
    }
    return null;
  }

  function run(ctx: C, actor: A): string[] {
    const ran: string[] = [];
    for (let c = 0; c < chainList.length; c++) {
      const b = selectIn(chainList[c] as Chain<C, A>, ctx, actor);
      if (!b) continue;
      b.tick(ctx, actor);
      ran.push(b.id);
      if (b.exclusive) break;
    }
    return ran;
  }

  return {
    register,
    behaviours: (chain = DEFAULT_CHAIN) => byChain.get(chain)?.list ?? [],
    chains: () => [...byChain.keys()],
    get: (id) => byId.get(id),
    select,
    run,
    step,
  };
}

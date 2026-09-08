// Category actions: habits that belong to a *type* of inhabitant rather than to one of them (plan
// section 2, "Two kinds of habit sit above the individual"). Every sheep grows wool; every farmer
// walks to the market at dawn. They are declared here, against their type, in one list.
//
// Two bindings, because two kinds of habit tick differently:
//
// - `per-actor` runs inside that type's own tick, once per actor per tick. `sheepGrowWool` is the
//   fleece growth and the pending shear, moved here from the top of the per-sheep loop in
//   behaviours/sheep.ts with the arithmetic untouched, so the move is hash-identical (test/
//   engine-category.test.ts pins the scripted sheep day's fleece and wool bank against it, and the
//   parity pins in test/engine-parity.test.ts cover the whole world). The sheep loop calls the
//   exported function directly rather than walking this list: forty sheep on 36,000 catch-up ticks
//   is 1.4 million calls, and the hot path allocates nothing and walks no registry (the same rule
//   behaviours/registry.ts works under). The list is the declaration, and a test asserts the
//   entry's `apply` is the very function the loop calls.
// - `scheduled` runs from the engine's own look at the world, once whenever `due` says so. This is
//   the plan's "the market walk at dawn, shearing when the fleeces are ready" — world rhythm, not
//   one inhabitant's choice — so it sits with the events rather than inside an actor's tick.
//
// A scheduled action with a visible effect writes to the chronicle through `tell`, source
// `category`. `sheepGrowWool` writes nothing: a fleece growing by a thousandth is not a moment,
// and the shear it completes is already the farmer's line to tell.

import { tell } from '../chronicle/store';
import { FARM_DISTRICT } from '../chronicle/types';
import { phaseOf } from '../clock';
import { summonFarmerToMarket } from '../npcs';
import { RULES } from '../rules';
import type { Sheep, SimState } from '../state';

interface CategoryActionBase {
  /** Unique among category actions. */
  readonly id: string;
  /** The type of inhabitant this binds to. Not an actor id: every one of them runs it. */
  readonly type: 'sheep' | 'farmer';
}

export interface PerActorCategoryAction extends CategoryActionBase {
  readonly binding: 'per-actor';
  /** Called once per actor per tick, from that type's own tick loop. */
  readonly apply: (state: SimState, actor: Sheep, dt: number, now: number) => void;
}

export interface ScheduledCategoryAction extends CategoryActionBase {
  readonly binding: 'scheduled';
  /** Is it time? Read-only: it must not change the world. */
  readonly due: (state: SimState) => boolean;
  /** Do it, and tell the chronicle if anything visible happened. */
  readonly run: (state: SimState) => void;
}

export type CategoryAction = PerActorCategoryAction | ScheduledCategoryAction;

const S = RULES.sheep;

/**
 * Every sheep grows wool, and a pending shear completes into the wool bank. Moved verbatim from
 * the first two statements of the per-sheep loop in `tickSheep`, which now calls this in the same
 * place with the same arguments — same arithmetic, same order, no generator draw, so the world
 * hashes exactly as it did before the move.
 */
export function growWool(state: SimState, sheep: Sheep, dt: number, now: number): void {
  sheep.wool = Math.min(1, sheep.wool + dt / RULES.woolGrowSec);
  if (sheep.shearAtMs !== null && now > sheep.shearAtMs) {
    sheep.shearAtMs = null;
    sheep.wool = S.shornWool;
    state.banks.wool++;
  }
}

export const sheepGrowWool: PerActorCategoryAction = {
  id: 'sheepGrowWool',
  type: 'sheep',
  binding: 'per-actor',
  apply: growWool,
};

/**
 * The clock fraction the market walk books itself under, as `tickNpcs` books the farmer's own two
 * visits: `Math.floor(t * 100)`, keyed with the day so it can happen once a day. Dawn is
 * `RULES.clock.phases.dawn` (0.92), and his two scheduled visits are at 0.06 and 0.38, so the three
 * keys never collide and a market walk never eats one of his visits.
 */
export const MARKET_VISIT_K = Math.floor(RULES.clock.phases.dawn * 100);

/** The market walk's entry in the same visit ledger `Npcs.lastVisitKey` already holds. */
export function marketVisitKey(state: SimState): number {
  return MARKET_VISIT_K * 1000 + state.clock.dayCount;
}

/**
 * Every farmer walks to the market at dawn: he comes up the lane, stops at the outer gate long
 * enough to look the flock over, and carries on. Nothing on the field changes — this is the world
 * having a rhythm, not an event — so it writes one chronicle line and no hooks.
 */
export const farmerMarketWalk: ScheduledCategoryAction = {
  id: 'farmerMarketWalk',
  type: 'farmer',
  binding: 'scheduled',
  due: (state) => phaseOf(state.clock.t) === 'dawn' && state.npcs.farmer === null && state.npcs.lastVisitKey !== marketVisitKey(state),
  run: (state) => {
    state.npcs.lastVisitKey = marketVisitKey(state);
    summonFarmerToMarket(state);
    tell(state, {
      atMs: state.clock.nowMs,
      district: FARM_DISTRICT,
      line: 'The farmer went past on his way to the market and looked the flock over.',
      picture: 'farmerMarket',
      source: 'category',
      // One constant-valued fact: the first market walk a world ever tells reads as a first, and
      // every one after it as the routine it is (a trailing normal with no spread, see
      // chronicle/notability.ts). No `hint`: only `card` and `authored` lines carry one.
      facts: { marketWalk: 1 },
    });
  },
};

/** Every category action in the world, against the type it binds to. */
export const CATEGORY_ACTIONS: readonly CategoryAction[] = [sheepGrowWool, farmerMarketWalk];

/** The scheduled ones, in registration order: what the engine's look at the world runs. */
export const SCHEDULED_CATEGORY_ACTIONS: readonly ScheduledCategoryAction[] = CATEGORY_ACTIONS.filter(
  (a): a is ScheduledCategoryAction => a.binding === 'scheduled',
);

/** Run every scheduled category action whose time has come. */
export function runScheduledCategoryActions(state: SimState): void {
  for (const action of SCHEDULED_CATEGORY_ACTIONS) if (action.due(state)) action.run(state);
}

// The farmer and the merchant, ported at parity from the "NPCs" section of
// prototype/luna-farm/src/sim_template.html: `summonFarmer`, `summonMerchant`, `npcStep`, and
// `tickNPCs`. The prototype's `buyUpgrades` is retired (#126, plan decision 19): the farm's three
// builds are on Luna Farm from a world's first day now, nothing buys them, on the farm or from the
// settlement. An NPC walks a job plan: each step is a job name plus an optional foot point; steps
// without a point run in place. `npcStep` is one frame of that plan and calls back at the start and
// end of each job.

import { bubble, findSheep } from './actors';
import { tell } from './chronicle/store';
import { FARM_DISTRICT } from './chronicle/types';
import { NPC_SIZE, SFOOT, SPOT, type Point } from './geometry';
import { stepToward } from './movement';
import { RULES, TICK_SEC } from './rules';
import type { Npc, NpcJob, Settlement, SimState } from './state';

/** NPC foot offset: `[NPC_W / 2, NPC_H - 1]`. One pixel lower than the sheep's and DL's. */
export const NPC_FOOT: readonly [number, number] = [NPC_SIZE.w / 2, NPC_SIZE.h - 1];

const N = RULES.npc;

/** `'skip'` drops the job, a point walks there first, anything else starts the job in place. */
export type JobResult = 'skip' | Point | null | undefined;
export type JobHook = (job: string, when: 'start' | 'end') => JobResult;

/** An NPC just off the right edge, facing left, with a plan. */
export function makeNpc(kind: Npc['kind'], plan: NpcJob[]): Npc {
  return {
    kind,
    x: SPOT.offstage.x - 8,
    y: SPOT.offstage.y - NPC_SIZE.h + 2,
    dir: -1,
    anim: 'walk',
    t0Ms: 0,
    tx: null,
    ty: null,
    wp: null,
    outside: true,
    entering: kind === 'farmer',
    plan,
    job: null,
    jobUntilMs: 0,
    shearing: null,
    cart: kind === 'merchant',
    icon: null,
    iconUntilMs: 0,
    sold: 0,
  };
}

/** The farmer: in at the gate, trough, hay, shear whoever is woolly, pat DL, out. */
export function summonFarmer(s: SimState): void {
  if (s.npcs.farmer) return;
  const todo: NpcJob[] = [
    { job: 'trough', at: { x: SPOT.trough.x + 18, y: SPOT.trough.y + 6 } },
    { job: 'hay', at: { x: SPOT.hay.x + 22, y: SPOT.hay.y + 12 } },
  ];
  s.npcs.farmer = makeNpc('farmer', [
    { job: 'enter', at: { ...SPOT.gateOut } },
    { job: 'enter', at: { ...SPOT.gate } },
    ...todo,
    { job: 'shear' },
    { job: 'pat' },
    { job: 'leave', at: { ...SPOT.gate } },
    { job: 'leave', at: { ...SPOT.gateOut } },
    { job: 'gone', at: { ...SPOT.offstage } },
  ]);
}

/**
 * The farmer's market walk (#40's category action): up the lane at dawn, a stop at the outer gate
 * to look the flock over, and on he goes. He never comes through the gate, so nothing on the field
 * changes; `npcStep`'s inside/outside flip never fires for him either, the same way it never does
 * for the merchant, who stops ten pixels past the same gate.
 */
export function summonFarmerToMarket(s: SimState): void {
  if (s.npcs.farmer) return;
  s.npcs.farmer = makeNpc('farmer', [
    { job: 'market', at: { x: SPOT.gateOut.x - 6, y: SPOT.gateOut.y } },
    { job: 'gone', at: { ...SPOT.offstage } },
  ]);
}

/**
 * The merchant: to just outside the gate, a pause with the cart, gone. **He buys nothing** (#86,
 * plan decision 12: "the economy is not the farm's"). The plan step is still called `trade`, and
 * the stay is still `RULES.merchant.stayMs`, so the beat on screen is the one the prototype had —
 * a cart on the lane, standing there a while — with no coins and no wool changing hands.
 */
export function summonMerchant(s: SimState): void {
  if (s.npcs.merchant) return;
  s.npcs.merchant = makeNpc('merchant', [
    { job: 'enter', at: { x: SPOT.gateOut.x + 10, y: SPOT.gateOut.y } },
    { job: 'trade' },
    { job: 'gone', at: { ...SPOT.offstage } },
  ]);
}

/**
 * One frame of an NPC's plan. Returns `'done'` when the plan is finished. Ported line for line;
 * the inside/outside flip is measured at foot x after an `enter` or `leave` step, so the merchant,
 * who stops 10 px past the outer gate, never counts as inside (odd but kept).
 */
export function npcStep(n: Npc, dt: number, now: number, onJob: JobHook): 'done' | undefined {
  if (!n.job) {
    const next = n.plan.shift();
    if (!next) return 'done';
    n.job = next.job;
    if (next.at) {
      n.tx = next.at.x;
      n.ty = next.at.y;
      n.anim = 'walk';
    } else n.jobUntilMs = 0;
  }
  if (n.tx !== null) {
    const arrived = stepToward(n, NPC_FOOT, N.walkSpeed, dt);
    if (arrived) {
      n.tx = n.ty = null;
      if (n.job === 'enter' && n.x + 8 < N.insideBelowX) n.outside = false;
      if (n.job === 'leave' && n.x + 8 > N.outsideAboveX) n.outside = true;
      if (n.job === 'enter' || n.job === 'leave') {
        n.job = null;
        return;
      }
      if (n.job === 'gone') return 'done';
      n.jobUntilMs = now + N.jobMs;
      n.anim = 'work';
    }
    return;
  }
  if (!n.jobUntilMs) {
    const r = onJob(n.job, 'start');
    if (r === 'skip') {
      n.job = null;
      return;
    }
    if (r) {
      n.tx = r.x;
      n.ty = r.y;
      n.anim = 'walk';
      return;
    }
    if (!n.jobUntilMs) n.jobUntilMs = now + N.jobMs;
    n.anim = 'work';
  }
  if (now > n.jobUntilMs) {
    onJob(n.job, 'end');
    n.job = null;
    n.jobUntilMs = 0;
  }
}

/**
 * The market sale (#86): the wool the farmer walked out at dawn, paid for in the settlement's
 * ledger. Zeroes the farm's wool bank, adds `wool * RULES.merchant.woolPrice` to the settlement's
 * coins, and tells the chronicle one line.
 *
 * Retired since #126 (plan decision 19): this used to spend the newly-earned coins on whatever the
 * farm's build list could now afford (`buyUpgrades`, removed). The flowerbed, hay2, and the
 * scarecrow are on the farm from a world's first day now — `state.banks.owned` starts with all
 * three (`FARM_BUILDS`, state.ts) and nothing ever adds to it — so the sale only ever earns; the
 * settlement's purse keeps accruing here and buys nothing yet, waiting on the owner's own build
 * table (plan section 3).
 *
 * Nothing is told and nothing moves when the bank is empty: a walk with no wool on it is just the
 * farmer walking past, which the market walk's own category-action line already tells.
 *
 * One function so the watched path (`tickNpcs`'s `market` job, below) and the offline catch-up
 * (`ledger/advance.ts`'s `MARKET` case) sell at the same price and in the same order. The Ledger
 * has no chronicle to tell into, so it passes none and the gap's diff tells the total instead
 * (`chronicle/ledger-diff.ts`); see that file for why one line a gap and not one a dawn.
 */
export function sellWoolAtMarket(world: { banks: { wool: number; owned: string[] }; settlement: Settlement }, log?: { state: SimState; atMs: number }): number {
  const wool = world.banks.wool;
  if (wool <= 0) return 0;
  const earned = wool * RULES.merchant.woolPrice;
  world.banks.wool = 0;
  world.settlement.coins += earned;
  if (log) {
    tell(log.state, {
      atMs: log.atMs,
      district: FARM_DISTRICT,
      line: `The farmer sold ${wool} wool at the market.`,
      picture: 'coins',
      source: 'category',
      // The mover's own number, so the trailing normal can judge it the way it judges wool banked
      // (chronicle/notability.ts): a big load reads as a story, an ordinary one as the routine.
      facts: { marketWool: wool },
    });
  }
  return earned;
}

/** A sheep the farmer would shear: on the field, woolly enough, not already being shorn. */
function shearable(s: SimState, except: string | null): SimState['sheep'] {
  return s.sheep.filter((q) => !q.inBarn && q.wool >= RULES.farmer.shearAt && q.shearAtMs === null && q.id !== except);
}

/** One tick of both NPCs: the farmer's twice-daily schedule, the merchant's timer, and their jobs. */
export function tickNpcs(s: SimState): void {
  const now = s.clock.nowMs;
  const dt = TICK_SEC;
  // Schedule: the farmer at two clock fractions once per day; the merchant on a timer.
  const day = Math.floor(s.clock.t * 100);
  for (const at of RULES.farmer.visitsAt) {
    const k = Math.floor(at * 100);
    const key = k * 1000 + s.clock.dayCount;
    if (day === k && s.npcs.lastVisitKey !== key) {
      // Round 1 verifier finding 7 (#82): with the engine directing, a card can summon him
      // off-schedule (`shearingDay`'s "a visit outside his two", `engine/hooks.ts`), and
      // `summonFarmer` itself no-ops while he is already on the field. Booking the key regardless
      // would read a slot he slept through — already busy on the card's business — as visited, and
      // he would never get his own farmer for it. So with the engine on, only book the key when he
      // is actually free to be summoned for it; the key stays open and is retried on a later tick
      // still inside the same window, once he is.
      //
      // With the engine off there is no card in the room, so this always takes the summon branch —
      // including the prototype's own two-visit collision (`test/npcs.test.ts`'s "is consumed
      // unseen... odd but kept"), which this leaves exactly as it was.
      if (!s.events.enabled || !s.npcs.farmer) {
        s.npcs.lastVisitKey = key;
        summonFarmer(s);
      }
    }
  }
  // The merchant's fixed timer is the engine-off path. While the engine directs, the
  // `merchantCaravan` card owns his arrival (#40) and this would double-book him; `merchantAtMs`
  // is still kept up to date below, because the Ledger runs his visits off it while the district is
  // off screen (ledger/advance.ts).
  if (!s.events.enabled && !s.npcs.merchant && now > s.npcs.merchantAtMs) summonMerchant(s);

  const farmer = s.npcs.farmer;
  if (farmer) {
    const r = npcStep(farmer, dt, now, (job, when) => {
      // The dawn market walk's sale (#86). It hangs off `end`, not `start`: `npcStep` never calls
      // `start` for a plan step that carries an `at` - it sets the job timer the moment he arrives
      // - so `market`'s only hook is the one that fires when he has stood at the gate his
      // `N.jobMs` and moves on. That reads right too: he stops, looks the flock over, and the wool
      // goes with him.
      if (job === 'market' && when === 'end') sellWoolAtMarket(s, { state: s, atMs: now });
      if (job === 'trough' && when === 'end') bubble(farmer, 'heart', N.troughHeartMs, now);
      if (job === 'hay' && when === 'end') for (const q of s.sheep) if (q.hayTrip) q.eating = true;
      if (job === 'shear') {
        if (when === 'start') {
          const t = shearable(s, null).sort((a, b) => b.wool - a.wool)[0];
          if (!t) return 'skip';
          farmer.shearing = t.id;
          return { x: t.x + SFOOT[0] + (t.dir > 0 ? -22 : 22), y: t.y + SFOOT[1] + 2 };
        }
        const t = findSheep(s, farmer.shearing);
        if (t) {
          t.shearAtMs = now + N.shearDelayMs;
          bubble(t, 'shears', N.shearDelayMs, now);
          t.tagUntilMs = now + N.shearTagMs;
        }
        farmer.shearing = null;
        if (shearable(s, t ? t.id : null).length) farmer.plan.unshift({ job: 'shear' });
      }
      if (job === 'pat') {
        const l = s.luna;
        if (when === 'start') {
          if (l.inBarn || l.riding) return 'skip';
          l.manual = null;
          l.chasing = false;
          l.mounting = null;
          l.routine = null;
          l.target = { x: farmer.x + 8 - 14, y: farmer.y + NPC_SIZE.h + 2 };
          l.anim = 'run';
          return null;
        }
        bubble(l, 'heart', N.patHeartMs, now);
        l.anim = 'pant';
        l.t0Ms = now;
        l.target = null;
      }
      return undefined;
    });
    if (r === 'done') s.npcs.farmer = null;
  }

  const merchant = s.npcs.merchant;
  if (merchant) {
    const r = npcStep(merchant, dt, now, (job, when) => {
      // The caravan sells nothing (#86, plan decision 12). He stops where he always stopped, for
      // as long as he always stopped, in the `work` pose - which reads as a man looking the place
      // over - and then he goes. No coin bubble, no wool out of the bank, no upgrade bought;
      // `sold` stays 0 for every merchant this sim will ever make.
      if (job === 'trade' && when === 'start') {
        merchant.jobUntilMs = now + RULES.merchant.stayMs;
        merchant.anim = 'work';
        return null;
      }
      return undefined;
    });
    if (r === 'done') {
      s.npcs.merchant = null;
      s.npcs.merchantAtMs = now + RULES.merchant.everyMs;
    }
  }
}

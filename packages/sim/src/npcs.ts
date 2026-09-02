// The farmer and the merchant, ported at parity from the "NPCs" section of
// prototype/luna-farm/src/sim_template.html: `summonFarmer`, `summonMerchant`, `npcStep`,
// `tickNPCs`, and `buyUpgrades`. An NPC walks a job plan: each step is a job name plus an
// optional foot point; steps without a point run in place. `npcStep` is one frame of that plan
// and calls back at the start and end of each job.

import { bubble, findSheep } from './actors';
import { NPC_SIZE, SFOOT, SPOT, type Point } from './geometry';
import { stepToward } from './movement';
import { RULES, TICK_SEC } from './rules';
import type { Banks, Npc, NpcJob, SimState } from './state';

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

/** The merchant: to just outside the gate, trade, gone. */
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

/** The prototype's `buyUpgrades`: walk the list in order and buy whatever the coins cover. Takes anything with banks: the state, or the Ledger. */
export function buyUpgrades(s: { banks: Banks }): void {
  for (const [name, cost] of RULES.upgrades) {
    if (!s.banks.owned.includes(name) && s.banks.coins >= cost) {
      s.banks.coins -= cost;
      s.banks.owned.push(name);
    }
  }
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
      s.npcs.lastVisitKey = key;
      summonFarmer(s);
    }
  }
  if (!s.npcs.merchant && now > s.npcs.merchantAtMs) summonMerchant(s);

  const farmer = s.npcs.farmer;
  if (farmer) {
    const r = npcStep(farmer, dt, now, (job, when) => {
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
      if (job === 'trade' && when === 'start') {
        merchant.jobUntilMs = now + RULES.merchant.stayMs;
        merchant.anim = 'work';
        if (s.banks.wool > 0) {
          const earned = s.banks.wool * RULES.merchant.woolPrice;
          s.banks.coins += earned;
          s.banks.wool = 0;
          bubble(merchant, 'coin', N.coinBubbleMs, now);
          merchant.sold = earned;
        }
        buyUpgrades(s);
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

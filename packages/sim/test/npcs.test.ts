// The farmer and the merchant: schedules, job plans, shearing, the pat, the wool sale, coins, and
// the auto-upgrades, ported from the prototype's NPC section.
import { describe, expect, it } from 'vitest';
import { NPC_SIZE, SFOOT, SPOT } from '../src/geometry';
import { applyIntent } from '../src/intents';
import { NPC_FOOT, buyUpgrades, makeNpc, npcStep, summonFarmer, summonMerchant } from '../src/npcs';
import { RULES, TICK_MS, TICK_SEC } from '../src/rules';
import { createInitialState, type Npc, type SimState } from '../src/state';
import { tickInPlace } from '../src/tick';
import { run, runUntil, world } from './luna-helpers';
import { settle } from './sheep-helpers';

const N = RULES.npc;

function calm(options: Parameters<typeof world>[0] = {}): SimState {
  const s = settle(world(options));
  s.luna.x = 300;
  s.luna.y = 250;
  return s;
}

function footOf(n: Npc) {
  return { x: n.x + NPC_FOOT[0], y: n.y + NPC_FOOT[1] };
}

describe('schedules', () => {
  it('the farmer comes at clock .06 and .38, once each per day; the merchant 45 s after reset', () => {
    const s = createInitialState(7);
    s.weather = { ...s.weather, mode: 'manual' };
    const farmerAt: number[] = [];
    const merchantAt: number[] = [];
    let farmer = false;
    let merchant = false;
    for (let i = 0; i < 1800 * 2; i++) {
      tickInPlace(s);
      if (!!s.npcs.farmer !== farmer) {
        farmer = !!s.npcs.farmer;
        if (farmer) farmerAt.push(s.clock.tick);
      }
      if (!!s.npcs.merchant !== merchant) {
        merchant = !!s.npcs.merchant;
        if (merchant) merchantAt.push(s.clock.tick);
      }
    }
    // t starts at .18: .38 is 36 s in (tick 360), .06 is 1.06 - .18 days in (tick 1584). The next
    // .38 (tick 2160) finds him still on the farm from the .06 visit (five sheep to shear takes him
    // about 95 s) and is consumed unseen, as the prototype's `lastVisitDay` guard does. Odd but kept.
    expect(farmerAt).toEqual([361, 1585, 3385]);
    expect(merchantAt[0]).toBe(RULES.merchantFirstAtMs / TICK_MS + 1);
    // Leaves after stayMs plus the walk, and is summoned again everyMs later.
    expect(merchantAt.length).toBeGreaterThanOrEqual(2);
    expect(s.npcs.lastVisitKey).toBe(6 * 1000 + 2); // the .06 visit on day 2
  });

  it('the farmer is not summoned twice for the same visit even if the clock lingers', () => {
    const s = calm({ t: 0.38 });
    run(s, 1);
    expect(s.npcs.farmer).not.toBeNull();
    s.npcs.farmer = null;
    run(s, 50);
    expect(s.npcs.farmer).toBeNull();
  });
});

describe('npcStep', () => {
  it('walks each step with a point, works in place for jobs without one, skips on "skip", ends with "done"', () => {
    const n = makeNpc('farmer', [{ job: 'enter', at: { x: 600, y: 300 } }, { job: 'shear' }, { job: 'pat' }, { job: 'gone', at: { x: 690, y: 330 } }]);
    const log: string[] = [];
    const hook = (job: string, when: 'start' | 'end') => {
      log.push(`${job}:${when}`);
      if (job === 'shear' && when === 'start') return 'skip' as const;
      return null;
    };
    let now = 0;
    const step = () => {
      now += TICK_MS;
      return npcStep(n, TICK_SEC, now, hook);
    };
    expect(n.outside).toBe(true);
    expect(n.entering).toBe(true);
    expect(n.cart).toBe(false);
    // Spawn just off the right edge, facing left.
    expect(n.x).toBe(SPOT.offstage.x - 8);
    expect(n.y).toBe(SPOT.offstage.y - NPC_SIZE.h + 2);
    expect(n.dir).toBe(-1);
    while (log.length === 0) step(); // walks in, then the shear step starts and is skipped in the same frame
    expect(log).toEqual(['shear:start']);
    expect(n.job).toBeNull();
    expect(Math.hypot(footOf(n).x - 600, footOf(n).y - 300)).toBeLessThan(1.2);
    step(); // pat: starts in place
    expect(n.job).toBe('pat');
    expect(n.anim).toBe('work');
    expect(n.jobUntilMs).toBe(now + N.jobMs);
    for (let i = 0; i < N.jobMs / TICK_MS; i++) step();
    expect(log).toEqual(['shear:start', 'pat:start']);
    step();
    expect(log).toEqual(['shear:start', 'pat:start', 'pat:end']);
    let r: 'done' | undefined;
    for (let i = 0; i < 200 && r !== 'done'; i++) r = step();
    expect(r).toBe('done');
    expect(Math.hypot(footOf(n).x - 690, footOf(n).y - 330)).toBeLessThan(1.2);
  });

  it('walks at 26 px/s', () => {
    const n = makeNpc('merchant', [{ job: 'enter', at: { x: 500, y: SPOT.offstage.y + 1 } }]);
    const x0 = n.x;
    npcStep(n, TICK_SEC, 100, () => null);
    npcStep(n, TICK_SEC, 200, () => null);
    expect(x0 - n.x).toBeCloseTo(2 * N.walkSpeed * TICK_SEC, 6);
    expect(n.dir).toBe(-1);
  });
});

describe('the farmer’s visit', () => {
  it('walks the plan: in at the gates, trough (heart), hay (hay-trip sheep eat), shear, pat, out, gone', () => {
    const s = calm();
    s.sheep[1]!.hayTrip = true; // parked and waiting by the bale
    // Every sheep ridden: none picks a need, and DL's idle play cannot mount one mid-visit (a
    // ride when the farmer reaches her skips the pat, and the plan is what this test is about).
    for (const q of s.sheep) q.ridden = true;
    for (const q of s.sheep) q.wool = 0.3; // nobody to shear this visit
    applyIntent(s, { type: 'farmAction', action: 'farmer' });
    const f = s.npcs.farmer!;
    expect(f.plan.map((j) => j.job)).toEqual(['enter', 'enter', 'trough', 'hay', 'shear', 'pat', 'leave', 'leave', 'gone']);
    expect(f.plan[2]!.at).toEqual({ x: SPOT.trough.x + 18, y: SPOT.trough.y + 6 });
    expect(f.plan[3]!.at).toEqual({ x: SPOT.hay.x + 22, y: SPOT.hay.y + 12 });
    runUntil(s, (w) => w.npcs.farmer!.job === 'enter' && w.npcs.farmer!.tx === SPOT.gate.x, 200);
    expect(f.outside).toBe(true); // the outer gate is not past x 540 yet
    runUntil(s, (w) => w.npcs.farmer!.job === 'trough', 200);
    expect(f.outside).toBe(false);
    runUntil(s, (w) => w.npcs.farmer!.job === 'hay', 600);
    expect(f.icon).toBe('heart');
    expect(f.iconUntilMs).toBe(s.clock.nowMs - TICK_MS + N.troughHeartMs); // set the tick the trough job ended
    expect(s.sheep[1]!.eating).toBe(false);
    // No woolly sheep: the shear step is skipped in the frame it starts, and the pat comes next.
    runUntil(s, (w) => w.npcs.farmer!.job === 'pat', 600);
    expect(s.sheep[1]!.eating).toBe(true);
    expect(s.sheep.every((q) => q.shearAtMs === null)).toBe(true);
    runUntil(s, (w) => w.npcs.farmer!.job === 'leave', 100);
    runUntil(s, (w) => w.npcs.farmer!.job === 'gone', 600);
    expect(f.outside).toBe(true);
    runUntil(s, (w) => w.npcs.farmer === null, 600);
  });

  it('shears the woolliest sheep at or above .6 first, then the next, each 1.2 s after 2.6 s beside it', () => {
    const s = calm();
    const [a, b, c] = s.sheep as [Sheep, Sheep, Sheep];
    a.wool = 0.7;
    b.wool = 0.9;
    c.wool = 0.65;
    c.shearAtMs = 1e9; // already being shorn (a click): skipped, as a sheep in the barn is
    for (const q of s.sheep.slice(3)) q.wool = 0; // will not reach .6 during the visit
    s.npcs.merchantAtMs = 1e9; // the merchant's 45 s visit would sell the bank mid-count
    applyIntent(s, { type: 'farmAction', action: 'farmer' });
    const f = s.npcs.farmer!;
    runUntil(s, (w) => w.npcs.farmer!.shearing !== null, 1500);
    expect(f.shearing).toBe(b.id);
    expect(f.tx).toBe(b.x + SFOOT[0] + (b.dir > 0 ? -22 : 22));
    expect(f.ty).toBe(b.y + SFOOT[1] + 2);
    runUntil(s, (w) => w.sheep[1]!.shearAtMs !== null, 1500);
    expect(b.shearAtMs).toBe(s.clock.nowMs + N.shearDelayMs);
    expect(b.icon).toBe('shears');
    expect(b.tagUntilMs).toBe(s.clock.nowMs + N.shearTagMs);
    expect(f.shearing).toBeNull();
    expect(f.plan[0]!.job).toBe('shear'); // re-queued for a
    runUntil(s, (w) => w.sheep[0]!.shearAtMs !== null, 1500);
    expect(f.plan[0]!.job).toBe('pat');
    expect(c.shearAtMs).toBe(1e9); // untouched
    run(s, 13);
    expect(s.banks.wool).toBe(2);
    expect(a.wool).toBeLessThan(0.1);
    // b was shorn to .05 while the farmer walked over to a, and has been regrowing at 1/150 per second since.
    expect(b.wool).toBeLessThan(0.3);
  });

  it('the pat calls DL over, drops whatever she was doing, and ends in a heart and a pant; skipped in the barn or riding', () => {
    const s = calm();
    for (const q of s.sheep) q.wool = 0.2;
    s.luna.x = 100;
    s.luna.y = 300;
    applyIntent(s, { type: 'lunaAction', action: 'sit' });
    applyIntent(s, { type: 'farmAction', action: 'farmer' });
    const f = s.npcs.farmer!;
    runUntil(s, (w) => w.npcs.farmer!.job === 'pat' && w.npcs.farmer!.anim === 'work', 2000);
    expect(s.luna.manual).toBeNull();
    expect(s.luna.routine).toBeNull();
    expect(s.luna.anim).toBe('run');
    expect(s.luna.target).toEqual({ x: f.x + 8 - 14, y: f.y + NPC_SIZE.h + 2 });
    runUntil(s, (w) => w.luna.anim === 'pant' && w.luna.icon === 'heart', 40);
    expect(s.luna.iconUntilMs).toBe(s.clock.nowMs + N.patHeartMs);
    expect(s.luna.target).toBeNull();

    const b = calm();
    for (const q of b.sheep) q.wool = 0.2;
    b.luna.inBarn = true;
    b.weather = { ...b.weather, kind: 'rain', rain: true };
    b.sheep.forEach((q) => (q.inBarn = true));
    applyIntent(b, { type: 'farmAction', action: 'farmer' });
    runUntil(b, (w) => w.npcs.farmer!.job === 'leave', 2000);
    expect(b.luna.inBarn).toBe(true);
    expect(b.luna.icon).toBeNull();
  });
});

describe('the merchant’s visit', () => {
  it('ends with coins and the first upgrade: 5 wool sells for 15, the flowerbed costs 12', () => {
    const s = calm();
    s.banks.wool = 5;
    summonMerchant(s);
    const m = s.npcs.merchant!;
    expect(m.cart).toBe(true);
    expect(m.plan.map((j) => j.job)).toEqual(['enter', 'trade', 'gone']);
    expect(m.plan[0]!.at).toEqual({ x: SPOT.gateOut.x + 10, y: SPOT.gateOut.y });
    runUntil(s, (w) => w.npcs.merchant!.job === 'trade' && w.npcs.merchant!.anim === 'work', 200);
    // Odd but kept: he stops 10 px past the outer gate, so he never counts as inside.
    expect(Math.hypot(footOf(m).x - (SPOT.gateOut.x + 10), footOf(m).y - SPOT.gateOut.y)).toBeLessThan(1.2);
    expect(m.outside).toBe(true);
    expect(s.banks).toEqual({ wool: 0, coins: 15 - 12, owned: ['flowerbed'] });
    expect(m.sold).toBe(15);
    expect(m.icon).toBe('coin');
    expect(m.iconUntilMs).toBe(s.clock.nowMs + N.coinBubbleMs);
    expect(m.jobUntilMs).toBe(s.clock.nowMs + RULES.merchant.stayMs);
    const stayed = runUntil(s, (w) => w.npcs.merchant!.job === 'gone', 400);
    expect(stayed).toBe(RULES.merchant.stayMs / TICK_MS + 2);
    runUntil(s, (w) => w.npcs.merchant === null, 200);
    expect(s.npcs.merchantAtMs).toBe(s.clock.nowMs + RULES.merchant.everyMs);
    // Nothing to sell next time: no coin bubble, and no purchase.
    s.npcs.merchantAtMs = 0;
    run(s, 1);
    runUntil(s, (w) => w.npcs.merchant!.job === 'trade' && w.npcs.merchant!.anim === 'work', 200);
    expect(s.npcs.merchant!.icon).toBeNull();
    expect(s.banks).toEqual({ wool: 0, coins: 3, owned: ['flowerbed'] });
  });

  it('auto-upgrades buy in list order whenever coins cover the cost, never twice', () => {
    const s = calm();
    s.banks.coins = 100;
    buyUpgrades(s);
    expect(s.banks.owned).toEqual(['flowerbed', 'hay2']);
    expect(s.banks.coins).toBe(100 - 12 - 30);
    s.banks.coins += 2;
    buyUpgrades(s);
    expect(s.banks.owned).toEqual(['flowerbed', 'hay2', 'scarecrow']);
    expect(s.banks.coins).toBe(0);
    s.banks.coins = 500;
    buyUpgrades(s);
    expect(s.banks.owned).toEqual(['flowerbed', 'hay2', 'scarecrow']);
    expect(s.banks.coins).toBe(500);
    expect(RULES.upgrades).toEqual([
      ['flowerbed', 12],
      ['hay2', 30],
      ['scarecrow', 60],
    ]);
  });

  it('the coins action adds 50 and buys at once; summoning twice does nothing', () => {
    const s = calm();
    applyIntent(s, { type: 'farmAction', action: 'coins' });
    expect(s.banks).toEqual({ wool: 0, coins: 50 - 12 - 30, owned: ['flowerbed', 'hay2'] });
    summonMerchant(s);
    const m = s.npcs.merchant;
    summonMerchant(s);
    expect(s.npcs.merchant).toBe(m);
    summonFarmer(s);
    const f = s.npcs.farmer;
    summonFarmer(s);
    expect(s.npcs.farmer).toBe(f);
  });
});

type Sheep = SimState['sheep'][number];

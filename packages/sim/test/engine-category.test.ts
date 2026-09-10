// Category actions (#40): habits that belong to a type of inhabitant, not to one of them. Two so
// far — every sheep grows wool, every farmer walks to the market at dawn.
import { describe, expect, it } from 'vitest';
import { tickSheep } from '../src/behaviours/sheep';
import {
  CATEGORY_ACTIONS,
  farmerMarketWalk,
  growWool,
  MARKET_VISIT_K,
  marketVisitKey,
  runScheduledCategoryActions,
  SCHEDULED_CATEGORY_ACTIONS,
  sheepGrowWool,
} from '../src/engine/category';
import { hashState } from '../src/hash';
import { RULES, TICK_SEC } from '../src/rules';
import { createInitialState, type SimState } from '../src/state';
import { advance, tickInPlace } from '../src/tick';
import { world } from './luna-helpers';

describe('the list is the declaration', () => {
  it('every action names the type it binds to, and the per-actor one the sheep loop calls is this one', () => {
    expect(CATEGORY_ACTIONS.map((a) => [a.id, a.type, a.binding])).toEqual([
      ['sheepGrowWool', 'sheep', 'per-actor'],
      ['farmerMarketWalk', 'farmer', 'scheduled'],
    ]);
    // The sheep loop calls the exported function directly rather than walking the list (forty sheep
    // times 36,000 catch-up ticks is 1.4 million calls, and the hot path allocates nothing), so the
    // list would be a lie if its entry were some other function. It is not.
    expect(sheepGrowWool.apply).toBe(growWool);
    expect(SCHEDULED_CATEGORY_ACTIONS).toEqual([farmerMarketWalk]);
  });
});

describe('sheep grow wool: moved, not changed', () => {
  it('the arithmetic is the prototype’s, and the pending shear still banks the fleece', () => {
    const s = createInitialState(1, { events: false });
    const sheep = s.sheep[0]!;
    const before = sheep.wool;
    growWool(s, sheep, TICK_SEC, 0);
    expect(sheep.wool).toBe(Math.min(1, before + TICK_SEC / RULES.woolGrowSec));

    sheep.shearAtMs = 500;
    const wool = s.banks.wool;
    growWool(s, sheep, TICK_SEC, 400); // not yet
    expect(sheep.shearAtMs).toBe(500);
    expect(s.banks.wool).toBe(wool);
    growWool(s, sheep, TICK_SEC, 600); // now
    expect(sheep.shearAtMs).toBeNull();
    expect(sheep.wool).toBe(RULES.sheep.shornWool);
    expect(s.banks.wool).toBe(wool + 1);
  });

  it('a fleece grows at exactly the same rate through the sheep tick as before the move', () => {
    // The move is only hash-identical if it happens at the same point in the loop with the same
    // arguments. This walks a real day and compares the whole flock's fleece against the closed
    // form the prototype's two lines give.
    const s = createInitialState(2, { events: false });
    const start = s.sheep.map((q) => q.wool);
    for (let i = 0; i < 300; i++) tickSheep(s);
    s.sheep.forEach((q, i) => {
      expect(q.wool).toBeCloseTo(Math.min(1, (start[i] as number) + (300 * TICK_SEC) / RULES.woolGrowSec), 9);
    });
  });

  it('the whole world hashes as it did before the move (the parity pins, in one line)', () => {
    // test/engine-parity.test.ts is the full set; this is the fleece-shaped one, kept here so a
    // change to `growWool` fails in the file that owns it too.
    //
    // The v6 view needs one more strip since #84: `season` carries `realEpochMs` and `seed` now
    // (and so does the Ledger snapshot's copy of it), which a v6 build never stored. The hash is
    // unchanged — `c69b538ba6cd2e56` before and after — which is the whole point of the strip.
    //
    // And one more since #86: `settlement`, on the world and on the Ledger snapshot. **The hash is
    // still `c69b538ba6cd2e56`**, and on this world that is a real result rather than a formality:
    // it is a whole sim-day with the engine off, and the merchant's 45-second visit falls inside it.
    // He used to buy the bank there and buys nothing now — but at 45 s the bank is still empty (the
    // farmer's afternoon shearing has not finished a single fleece yet), so his visit moved no
    // number before this ticket either, and stripping the new field is enough to bring the pin back
    // exactly. The 6,000-tick worlds in test/hot-path-parity.test.ts run long enough to reach a sale
    // and those pins did move; see that file.
    const s = advance(createInitialState(11, { events: false }), 1800);
    const season = { ...s.season, realEpochMs: undefined, seed: undefined };
    const ledger = { ...s.ledger, season: { ...s.ledger.season, realEpochMs: undefined, seed: undefined }, settlement: undefined };
    expect(hashState({ ...s, version: 6, events: undefined, season, ledger, settlement: undefined })).toBe('d153203a23e1f2e2' /* PIN MOVED (#126): was 'c69b538ba6cd2e56' */);
  });
});

describe('the farmer walks to the market at dawn', () => {
  function atDawn(seed: number): SimState {
    const s = world({ seed, t: 0.95, events: true }); // dawn is t >= .92
    s.npcs.lastVisitKey = -1;
    return s;
  }

  it('is due at dawn, once, on the same visit key the farmer’s own two visits use', () => {
    const s = atDawn(3);
    expect(MARKET_VISIT_K).toBe(Math.floor(RULES.clock.phases.dawn * 100));
    expect(farmerMarketWalk.due(s)).toBe(true);
    runScheduledCategoryActions(s);
    expect(s.npcs.farmer?.kind).toBe('farmer');
    expect(s.npcs.lastVisitKey).toBe(marketVisitKey(s));
    // Not due again the same day, and not while he is on the field.
    expect(farmerMarketWalk.due(s)).toBe(false);
    s.npcs.farmer = null;
    expect(farmerMarketWalk.due(s)).toBe(false);
  });

  it('is not due at any other time of day', () => {
    for (const t of [0.1, 0.45, 0.6, 0.9]) {
      const s = world({ seed: 4, t, events: true });
      s.npcs.lastVisitKey = -1;
      expect(farmerMarketWalk.due(s), `t=${t}`).toBe(false);
    }
  });

  it('does not eat one of his two scheduled visits: the three keys never collide', () => {
    const s = atDawn(5);
    runScheduledCategoryActions(s);
    for (const at of RULES.farmer.visitsAt) {
      expect(Math.floor(at * 100) * 1000 + s.clock.dayCount).not.toBe(s.npcs.lastVisitKey);
    }
  });

  it('he walks the lane and goes: never through the gate, and nothing on the field moves', () => {
    const s = atDawn(6);
    runScheduledCategoryActions(s);
    const farmer = s.npcs.farmer!;
    // Two steps: stop at the outer gate and look the flock over, then off down the lane. No
    // `enter`, so `npcStep` never flips him inside and the barn router never sees him.
    expect(farmer.plan.map((j) => j.job)).toEqual(['market', 'gone']);
    expect(farmer.outside).toBe(true);
    let ticks = 0;
    let cameInside = false;
    for (; ticks < 2000 && s.npcs.farmer !== null; ticks++) {
      tickInPlace(s);
      if (s.npcs.farmer && !s.npcs.farmer.outside) cameInside = true;
    }
    expect(cameInside).toBe(false);
    expect(s.npcs.farmer).toBeNull(); // he left again on his own
    expect(ticks).toBeLessThan(2000);
  });

  it('tells the chronicle once, and the first one a world ever tells reads as a first', () => {
    const s = atDawn(7);
    runScheduledCategoryActions(s);
    const line = s.chronicle.entries.at(-1)!;
    expect(line.source).toBe('category');
    expect(line.line).toMatch(/market/);
    expect(line.first).toBe(true);
    expect(line.notability).toBe(1);
    // The second one, a day later, is the routine it is.
    s.npcs.farmer = null;
    s.clock = { ...s.clock, dayCount: s.clock.dayCount + 1 };
    runScheduledCategoryActions(s);
    const second = s.chronicle.entries.at(-1)!;
    expect(second.first).toBe(false);
    expect(second.notability).toBe(0);
  });

  it('runs in a real day, at dawn, without the engine drawing it, and the wool goes with him', () => {
    // The scheduled category actions are the engine's, not a card's: nothing about this is a draw.
    const s = advance(createInitialState(71), 1800);
    // Two `category` lines a day now (#86): the walk itself, and the sale it carried. They are
    // separated by picture, because the walk is told whether or not there was anything to sell.
    const walks = s.chronicle.entries.filter((e) => e.source === 'category' && e.picture === 'farmerMarket');
    expect(walks).toHaveLength(1);
    // Dawn on the first day is tick 1,332 onwards (t >= .92 from a .18 start).
    expect(walks[0]!.atMs).toBeGreaterThanOrEqual(1332 * 100);
    // The sale (#86): the bank the farmer's afternoon shearing filled goes out at dawn, told once,
    // and the settlement pays for it at `woolPrice`. Nothing lands on the farm's own coins.
    const sales = s.chronicle.entries.filter((e) => e.source === 'category' && e.picture === 'coins');
    expect(sales).toHaveLength(1);
    expect(sales[0]!.line).toBe('The farmer sold 5 wool at the market.');
    expect(sales[0]!.atMs).toBeGreaterThan(walks[0]!.atMs); // he stops, looks the flock over, then goes
    expect(s.banks.wool).toBe(0);
    expect(s.banks.coins).toBe(0); // the farm's own coins never move any more
    // PIN MOVED (#126): was `5 * RULES.merchant.woolPrice - 12` (the flower bed bought straight
    // back out of the same purse). `buyUpgrades` is retired — the farm's three builds are on the
    // farm from the start now — so the sale only ever earns: 5 x woolPrice = 15 into the
    // settlement's purse, and nothing spent back out of it.
    expect(s.settlement.coins).toBe(5 * RULES.merchant.woolPrice);
    expect(s.banks.owned).toEqual(['flowerbed', 'hay2', 'scarecrow']); // owned from the start, unmoved by the sale
  });
});

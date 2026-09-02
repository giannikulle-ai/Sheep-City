// The Ledger (#39): the district as numbers, advanced without actors, and the catch-up policy.
//
// Four guards are the point of this file. The parity block proves the actor tick did not move:
// the pre-#39 hashes still hold on the state with the two new fields and the version taken off.
// The round-trip block proves `summarise(respawn(ledger))` is exact. The soak keeps thirty days
// of ledger inside the balance file's bounds. The speed and determinism blocks cover the policy.
// The speed tests read the process clock (`hrtime`) to time a call; the sim itself never does.
import { hrtime } from 'node:process';
import { describe, expect, it } from 'vitest';
import { currentSeason, phaseOf } from '../src/clock';
import { hashState } from '../src/hash';
import { advanceLedger, GRAZE_SHARE, WALK_IN_MS, WALK_OUT_MS } from '../src/ledger/advance';
import { catchUp } from '../src/ledger/catch-up';
import { diffLedger } from '../src/ledger/diff';
import { cloneLedger, dayMs, LEDGER_STEP_MS, ledgerFlock, meanOf, moodOf, summarise, type Ledger } from '../src/ledger/ledger';
import { respawn } from '../src/ledger/respawn';
import { createRng } from '../src/rng';
import { RULES, TICK_MS } from '../src/rules';
import { fromSave, toSave } from '../src/save/serialize';
import { createInitialState, type SimState } from '../src/state';
import { step } from '../src/step';
import { advance } from '../src/tick';
import { buildFixtureState } from './save-fixture.test';

const DAY = RULES.clock.periodSec * 1000;

/** The state as a v4 build would hash it: no snapshot, no stamp, version 4. */
function v4View(s: SimState): Record<string, unknown> {
  return { ...s, version: 4, ledger: undefined, lastLedgerAt: undefined };
}

/** A fresh ledger with the weather pinned (manual mode never rolls), so a rule can be read alone. */
function pinned(seed: number, kind: 'sun' | 'rain' = 'sun', sheep?: number): Ledger {
  const s = createInitialState(seed, sheep === undefined ? {} : { sheep });
  const L = summarise(s);
  L.weather = { ...L.weather, kind, rain: kind === 'rain', mode: 'manual', untilMs: 0 };
  return L;
}

describe('the actor tick is untouched (#39 is a new path)', () => {
  // The pins the trunk carried before #39, from test/hot-path-parity.test.ts, test/luna-day.test.ts,
  // and test/sheep-day.test.ts. They moved there only because the state now carries `ledger` and
  // `lastLedgerAt` and the version is 5; on the v4 view of the same worlds they hold as they were.
  const HOT_PATH: readonly { seed: number; sheep: number; hash: string }[] = [
    { seed: 6, sheep: 5, hash: 'e85cbb53bef79387' },
    { seed: 6, sheep: 40, hash: '681d0cbae2eace49' },
    { seed: 7, sheep: 5, hash: 'bf1769cf3184be53' },
    { seed: 7, sheep: 40, hash: '1591607e60b10a89' },
    { seed: 11, sheep: 5, hash: 'a5735abd6b19878b' },
    { seed: 11, sheep: 40, hash: '71769756e8746076' },
  ];
  for (const { seed, sheep, hash } of HOT_PATH) {
    it(`hot path: seed ${seed}, ${sheep} sheep, 6,000 ticks hash as before #39 on the v4 view`, () => {
      expect(hashState(v4View(advance(createInitialState(seed, { sheep }), 6000)))).toBe(hash);
    });
  }
  it("Digital Luna's scripted day (seed 11, 1,800 ticks) hashes as before #39 on the v4 view", () => {
    expect(hashState(v4View(advance(createInitialState(11), 1800)))).toBe('22fec366499b4508');
  });
  it("the sheep's scripted day (seed 71, 1,800 ticks) hashes as before #39 on the v4 view", () => {
    expect(hashState(v4View(advance(createInitialState(71), 1800)))).toBe('14d17f24e11a589a');
  });
  it('the snapshot on the state is the one the Ledger path wrote; the tick leaves it alone', () => {
    const a = createInitialState(7);
    expect(a.ledger).toEqual(summarise(a));
    const b = advance(a, 600);
    expect(b.ledger).toEqual(a.ledger);
    expect(b.lastLedgerAt).toBe(0);
    expect(summarise(b)).not.toEqual(b.ledger);
  });
});

describe('summarise', () => {
  it('reads the numbers off the state and nothing else', () => {
    const s = advance(createInitialState(7), 3000);
    const L = summarise(s);
    expect(L.seed).toBe(7);
    expect(L.clock).toEqual(s.clock);
    expect(L.season).toEqual(s.season);
    expect(L.weather).toEqual(s.weather);
    expect(L.grass).toEqual(s.tufts.map((t) => t.level));
    expect(L.wool).toEqual(s.sheep.map((q) => q.wool));
    expect(L.banks).toEqual(s.banks);
    expect(L.banks).not.toBe(s.banks);
    expect(L.merchantAtMs).toBe(s.npcs.merchantAtMs);
    expect(L.lastVisitKey).toBe(s.npcs.lastVisitKey);
    expect(L.nameIdx).toBe(s.nameIdx);
    expect(L.mood).toBe(moodOf(L));
    expect(L.mood).toBeGreaterThanOrEqual(0);
    expect(L.mood).toBeLessThanOrEqual(1);
    expect(L).not.toHaveProperty('sheep');
    expect(L).not.toHaveProperty('luna');
  });

  it('lists lambs by mother, in flock order, with their age', () => {
    const s = createInitialState(7);
    s.clock = { ...s.clock, nowMs: 10_000 };
    s.sheep[3]!.lambs.push({ x: 0, y: 0, dir: 1, bornMs: 4_000, grown: false });
    s.sheep[1]!.lambs.push({ x: 0, y: 0, dir: 1, bornMs: 9_000, grown: false });
    expect(summarise(s).lambs).toEqual([
      { mother: 1, ageMs: 1_000 },
      { mother: 3, ageMs: 6_000 },
    ]);
  });

  it('folds a merchant mid-visit into his next trade time', () => {
    const s = advance(createInitialState(7), 470); // 47 s: the merchant is on his way in
    expect(s.npcs.merchant?.job).toBe('enter');
    expect(summarise(s).merchantAtMs).toBe(s.clock.nowMs);
    const t = advance(s, 100); // 57 s: trading
    expect(t.npcs.merchant?.job).toBe('trade');
    expect(summarise(t).merchantAtMs).toBe(t.clock.nowMs + RULES.merchant.everyMs);
  });

  it('mood is a reading of fair weather, grass, and company', () => {
    const L = summarise(createInitialState(7));
    const sunny = moodOf(L);
    expect(moodOf({ ...L, weather: { ...L.weather, kind: 'rain', rain: true } })).toBeCloseTo(sunny - 1 / 3, 12);
    expect(moodOf({ ...L, grass: L.grass.map(() => 1) })).toBeGreaterThan(sunny);
    expect(moodOf({ ...L, wool: [], lambs: [] })).toBeLessThan(sunny);
    expect(moodOf({ ...L, weather: { ...L.weather, kind: 'sun', rain: false }, grass: [1], wool: new Array(RULES.flockCap).fill(1) as number[] })).toBe(1);
  });
});

describe('respawn: the round trip is exact', () => {
  const worlds: [string, () => SimState][] = [
    ['a fresh world', () => createInitialState(7)],
    ['the bench district ten minutes in', () => advance(createInitialState(7, { sheep: 40 }), 6000)],
    ['the fixture world (lambs, a shear pending, a farmer, small life)', () => buildFixtureState()],
    ['a world with the merchant trading', () => advance(createInitialState(7), 570)],
    ['a world at night in the rain', () => step(createInitialState(3), [{ type: 'setWeather', weather: 'rain' }, { type: 'setClock', t: 0.7 }], 20_000)],
  ];
  for (const [name, build] of worlds) {
    it(`summarise(respawn(summarise(s))) equals summarise(s): ${name}`, () => {
      const L = summarise(build());
      const again = summarise(respawn(L));
      expect(again).toEqual(L);
      expect(hashState(again)).toBe(hashState(L));
    });
  }

  it('holds after the ledger has run, and with a seed that is not the district\'s', () => {
    const L = advanceLedger(summarise(createInitialState(7)), 30 * DAY, createRng(1));
    expect(summarise(respawn(L))).toEqual(L);
    expect(summarise(respawn(L, 99))).toEqual(L);
    expect(summarise(respawn(L, 0))).toEqual(L);
  });

  it('holds for a ledger with more or fewer tufts than the seed lays out', () => {
    const L = summarise(createInitialState(7));
    const more = { ...L, grass: [...L.grass, 0.25, 0.5] };
    more.mood = moodOf(more);
    expect(summarise(respawn(more))).toEqual(more);
    const fewer = { ...L, grass: L.grass.slice(0, 3) };
    fewer.mood = moodOf(fewer);
    expect(summarise(respawn(fewer))).toEqual(fewer);
  });

  it('builds a world that saves, loads, and ticks; the same ledger and seed give the same world', () => {
    const L = advanceLedger(summarise(buildFixtureState()), 3 * DAY, createRng(2));
    const a = respawn(L, 5);
    const b = respawn(L, 5);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(respawn(L, 6))).not.toBe(hashState(a));
    expect(a.ledger).toEqual(L);
    expect(a.lastLedgerAt).toBe(L.clock.nowMs);
    expect(a.npcs.farmer).toBeNull();
    expect(a.npcs.merchant).toBeNull();
    expect(a.pendingIntents).toEqual([]);
    expect(fromSave(toSave(a))).toEqual(a);
    const after = advance(a, 300);
    expect(after.clock.tick).toBe(a.clock.tick + 300);
  });

  it('is plausible at the seam: resting flock and a sleeping DL at night, the flock in the barn in rain', () => {
    const base = summarise(createInitialState(7));
    const night = { ...base, clock: { ...base.clock, t: 0.7 } };
    expect(phaseOf(night.clock.t)).toBe('night');
    const n = respawn(night);
    expect(n.sheep.every((q) => q.resting)).toBe(true);
    expect(n.luna.routine).toBe('asleep');
    expect(n.luna.anim).toBe('sleep');
    const rain = { ...base, weather: { ...base.weather, kind: 'rain' as const, rain: true, mode: 'manual' as const } };
    const r = respawn(rain);
    expect(r.sheep.every((q) => q.inBarn && q.shelter)).toBe(true);
    const day = respawn(base);
    expect(day.sheep.some((q) => q.resting || q.inBarn)).toBe(false);
    expect(day.luna.anim).toBe('sit');
  });
});

describe('advanceLedger: the rules', () => {
  it('moves the clock, the season, and the tick count by the span, and the mood is a fresh reading', () => {
    const L = summarise(createInitialState(7));
    const M = advanceLedger(L, DAY, createRng(1));
    expect(M.clock.nowMs).toBe(L.clock.nowMs + DAY);
    expect(M.clock.tick).toBe(L.clock.tick + DAY / TICK_MS);
    expect(M.clock.dayCount).toBe(L.clock.dayCount + 1);
    expect(M.clock.t).toBeCloseTo(L.clock.t, 9);
    expect(M.season.elapsedMs).toBe(L.season.elapsedMs + DAY);
    expect(M.mood).toBe(moodOf(M));
    expect(Number.isFinite(M.weather.temp)).toBe(true);
    // Pure: the input is untouched.
    expect(L).toEqual(summarise(createInitialState(7)));
    expect(() => advanceLedger(L, -1, createRng(1))).toThrow();
    expect(() => advanceLedger(L, NaN, createRng(1))).toThrow();
  });

  it('a span is the sum of its steps: one day in one call equals a day in sim-minutes', () => {
    const L = summarise(createInitialState(7));
    const whole = advanceLedger(L, DAY, createRng(1));
    let steps = L;
    const rng = createRng(1);
    for (let i = 0; i < DAY / LEDGER_STEP_MS; i++) steps = advanceLedger(steps, LEDGER_STEP_MS, rng);
    expect(steps).toEqual(whole);
  });

  it('fleece grows at 1 / woolGrowSec per second and the farmer shears at shearAt on his two visits', () => {
    const L = pinned(7, 'sun', RULES.flockCap); // at the cap: no lamb is born to muddy the count
    L.wool = L.wool.map(() => 0.1);
    // From t = .18 the first visit is at .38: 36 s later, fleece .34, nobody shorn.
    const first = advanceLedger(L, 0.2 * DAY + 1000, createRng(1));
    expect(first.banks.wool).toBe(0);
    for (const w of first.wool) expect(w).toBeCloseTo(0.1 + (0.2 * DAY + 1000) / 1000 / RULES.woolGrowSec, 9);
    expect(first.lastVisitKey).toBe(38 * 1000 + 0);
    // The next visit is at .06 the day after: fleece has grown past shearAt, so all five are shorn,
    // and the span ends one second after it (.18 + .2 + 1 s + .68 = 1.06 + 1 s).
    const second = advanceLedger(first, 0.68 * DAY, createRng(1));
    expect(second.banks.wool).toBe(RULES.flockCap);
    for (const w of second.wool) expect(w).toBeCloseTo(RULES.sheep.shornWool + 1 / RULES.woolGrowSec, 6);
    expect(second.lastVisitKey).toBe(6 * 1000 + 1);
    expect(second.clock.dayCount).toBe(1);
  });

  it('the farmer shears nobody while it rains, and a paused clock never brings him', () => {
    const rain = pinned(7, 'rain');
    rain.wool = [1, 1, 1, 1, 1];
    const wet = advanceLedger(rain, 3 * DAY, createRng(1));
    expect(wet.banks.wool).toBe(0);
    expect(wet.wool).toEqual([1, 1, 1, 1, 1]);
    const paused = pinned(7);
    paused.wool = [1, 1, 1, 1, 1];
    paused.clock = { ...paused.clock, paused: true };
    const still = advanceLedger(paused, 3 * DAY, createRng(1));
    expect(still.banks.wool).toBe(0);
    expect(still.clock.t).toBe(paused.clock.t);
    expect(still.clock.dayCount).toBe(0);
    expect(still.clock.nowMs).toBe(3 * DAY);
  });

  it('the merchant buys the wool at woolPrice, spends coins on upgrades in order, and is due again everyMs after leaving', () => {
    const L = pinned(7, 'rain'); // rain: the farmer shears nobody, so the bank is the merchant's alone
    L.banks = { wool: 4, coins: 0, owned: [] };
    L.merchantAtMs = 0;
    const before = advanceLedger(L, Math.floor(WALK_IN_MS) - 500, createRng(1));
    expect(before.banks).toEqual({ wool: 4, coins: 0, owned: [] });
    const after = advanceLedger(L, Math.ceil(WALK_IN_MS) + 500, createRng(1));
    expect(after.banks).toEqual({ wool: 0, coins: 0, owned: ['flowerbed'] }); // 4 * 3 = 12 coins, the flower bed costs 12
    expect(after.merchantAtMs).toBeCloseTo(WALK_IN_MS + RULES.merchant.stayMs + WALK_OUT_MS + RULES.merchant.everyMs, 6);
    // The next visit sells the next lot of wool.
    const rich = { ...after, banks: { ...after.banks, wool: 20 } };
    const next = advanceLedger(rich, rich.merchantAtMs + WALK_IN_MS + 1000 - rich.clock.nowMs, createRng(1));
    expect(next.banks).toEqual({ wool: 0, coins: 30, owned: ['flowerbed', 'hay2'] }); // 60 coins: hay2 (30), the scarecrow (60) not yet
  });

  it('the walks are the actor merchant\'s: about five seconds each at the NPC walk speed', () => {
    expect(WALK_IN_MS).toBeGreaterThan(4000);
    expect(WALK_IN_MS).toBeLessThan(6000);
    expect(WALK_OUT_MS).toBeGreaterThan(4000);
    expect(WALK_OUT_MS).toBeLessThan(6000);
    expect(GRAZE_SHARE).toBeGreaterThan(0.3);
    expect(GRAZE_SHARE).toBeLessThan(0.45);
  });

  it('a lamb grows up at lambGrowMs into a shorn sheep at the end of the flock with the next name', () => {
    // Eight sheep and one lamb: the flock is at its cap, so no other birth muddies the count.
    const n = RULES.flockCap - 1;
    const L = pinned(7, 'sun', n);
    L.lambs = [{ mother: 2, ageMs: 0 }];
    const young = advanceLedger(L, RULES.lambGrowMs - 1000, createRng(1));
    expect(young.lambs).toEqual([{ mother: 2, ageMs: RULES.lambGrowMs - 1000 }]);
    expect(young.wool).toHaveLength(n);
    const grown = advanceLedger(L, RULES.lambGrowMs + 1000, createRng(1));
    expect(grown.lambs).toEqual([]);
    expect(grown.wool).toHaveLength(n + 1);
    expect(grown.wool[n]).toBeCloseTo(RULES.sheep.shornWool + 1 / RULES.woolGrowSec, 9);
    expect(grown.nameIdx).toBe(n + 1);
    expect(summarise(respawn(grown)).nameIdx).toBe(n + 1);
    expect(respawn(grown).sheep[n]!.name).toBe('Juniper');
  });

  it('a lamb waits for the rain to stop before it grows up, as the actors\' lambs chain does', () => {
    const L = pinned(7, 'rain');
    L.lambs = [{ mother: 0, ageMs: RULES.lambGrowMs }];
    const wet = advanceLedger(L, DAY, createRng(1));
    expect(wet.lambs).toEqual([{ mother: 0, ageMs: RULES.lambGrowMs + DAY }]);
  });

  it('births come only in fair weather and never past flockCap', () => {
    const rainy = pinned(7, 'rain');
    const wet = advanceLedger(rainy, 30 * DAY, createRng(1));
    expect(wet.lambs).toEqual([]);
    expect(wet.wool).toHaveLength(5);
    const full = pinned(7, 'sun', RULES.flockCap);
    const still = advanceLedger(full, 30 * DAY, createRng(1));
    expect(ledgerFlock(still)).toBe(RULES.flockCap);
    const sunny = advanceLedger(pinned(7), 30 * DAY, createRng(1));
    expect(ledgerFlock(sunny)).toBeGreaterThan(5);
  });

  it('grass stays inside [0, 1] and is regrown by the end of every day', () => {
    const L = pinned(7);
    L.grass = L.grass.map(() => 0);
    const M = advanceLedger(L, DAY, createRng(1));
    for (const g of M.grass) {
      expect(g).toBeGreaterThan(0.9);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('weather rolls in season mode with the season\'s odds and clears again; manual weather never moves', () => {
    const L = summarise(createInitialState(7));
    expect(L.weather.mode).toBe('season');
    let rainDays = 0;
    let cur = L;
    const rng = createRng(3);
    for (let d = 0; d < 60; d++) {
      cur = advanceLedger(cur, DAY, rng);
      if (cur.weather.kind !== 'sun') rainDays++;
      if (cur.weather.kind !== 'sun') expect(cur.weather.untilMs).toBeGreaterThan(cur.clock.nowMs - 1);
    }
    expect(rainDays).toBeGreaterThan(0);
    expect(rainDays).toBeLessThan(60);
    const manual = pinned(7, 'rain');
    const M = advanceLedger(manual, 10 * DAY, createRng(1));
    expect(M.weather.kind).toBe('rain');
    expect(M.weather.rain).toBe(true);
  });
});

describe('soak: 30 sim-days at ledger resolution stay inside the balance bounds', () => {
  const UPGRADE_IDS = RULES.upgrades.map(([id]) => id);
  const [, lenHi] = RULES.rain.lengthMs;

  function check(L: Ledger, label: string): void {
    expect(ledgerFlock(L), `${label}: flock`).toBeLessThanOrEqual(RULES.flockCap);
    for (const w of L.wool) {
      expect(w, `${label}: wool`).toBeGreaterThanOrEqual(0);
      expect(w, `${label}: wool`).toBeLessThanOrEqual(1);
    }
    for (const g of L.grass) {
      expect(g, `${label}: grass`).toBeGreaterThanOrEqual(0);
      expect(g, `${label}: grass`).toBeLessThanOrEqual(1);
    }
    let lastMother = -1;
    for (const l of L.lambs) {
      expect(Number.isInteger(l.mother) && l.mother >= 0 && l.mother < L.wool.length, `${label}: lamb mother`).toBe(true);
      expect(l.mother, `${label}: lambs sorted, one per mother`).toBeGreaterThan(lastMother);
      lastMother = l.mother;
      expect(Number.isInteger(l.ageMs), `${label}: lamb age is whole ms`).toBe(true);
      expect(l.ageMs, `${label}: lamb age`).toBeGreaterThanOrEqual(0);
      // A lamb due in the rain waits for it to clear: at most a snow-length of extra age.
      expect(l.ageMs, `${label}: lamb age`).toBeLessThanOrEqual(RULES.lambGrowMs + lenHi * 1.5 + LEDGER_STEP_MS);
    }
    expect(Number.isInteger(L.banks.wool) && L.banks.wool >= 0, `${label}: wool bank`).toBe(true);
    expect(L.banks.coins, `${label}: coins`).toBeGreaterThanOrEqual(0);
    expect(L.banks.owned, `${label}: upgrades in list order`).toEqual(UPGRADE_IDS.filter((id) => L.banks.owned.includes(id)));
    expect(L.nameIdx, `${label}: nameIdx`).toBeGreaterThanOrEqual(L.wool.length);
    expect(L.mood, `${label}: mood`).toBeGreaterThanOrEqual(0);
    expect(L.mood, `${label}: mood`).toBeLessThanOrEqual(1);
    expect(L.clock.t, `${label}: clock.t`).toBeGreaterThanOrEqual(0);
    expect(L.clock.t, `${label}: clock.t`).toBeLessThan(1);
    expect(Number.isInteger(L.clock.tick), `${label}: tick`).toBe(true);
    expect(L.weather.rain, `${label}: rain mirror`).toBe(L.weather.kind === 'rain');
    expect(L.weather.temp, `${label}: temp`).toBeGreaterThan(-20);
    expect(L.weather.temp, `${label}: temp`).toBeLessThan(40);
    expect(L.merchantAtMs + WALK_IN_MS, `${label}: merchant due`).toBeGreaterThanOrEqual(L.clock.nowMs);
    // The snapshot round-trips through a save.
    expect(fromSave(toSave(respawn(L))).ledger).toEqual(L);
  }

  for (const seed of [1, 7, 42]) {
    it(`seed ${seed}, five sheep, 180 s days: every day of thirty checks out`, () => {
      let L = summarise(createInitialState(seed));
      const rng = createRng(seed);
      for (let d = 1; d <= 30; d++) {
        L = advanceLedger(L, DAY, rng);
        check(L, `seed ${seed} day ${d}`);
      }
      expect(L.clock.dayCount).toBe(30);
      // Thirty days of shearing and selling: the farm earned something and grew.
      const earned = L.banks.coins + L.banks.owned.reduce((n, id) => n + (RULES.upgrades.find(([u]) => u === id)?.[1] ?? 0), 0);
      expect(earned).toBeGreaterThan(0);
    });
  }

  it('the bench district (40 sheep, already over the cap) never grows and still checks out', () => {
    let L = summarise(advance(createInitialState(7, { sheep: 40 }), 6000));
    const rng = createRng(7);
    for (let d = 1; d <= 30; d++) {
      L = advanceLedger(L, DAY, rng);
      expect(L.wool.length + L.lambs.length).toBe(40);
      for (const w of L.wool) expect(w).toBeLessThanOrEqual(1);
      expect(L.banks.coins).toBeGreaterThanOrEqual(0);
    }
  });

  for (const periodSec of [60, 600]) {
    it(`${periodSec} s days: the day length follows the clock's period`, () => {
      let s = createInitialState(7);
      s = step(s, [{ type: 'setPeriod', periodSec }], 100);
      let L = summarise(s);
      const day = dayMs(L);
      expect(day).toBe(periodSec * 1000);
      const rng = createRng(1);
      for (let d = 1; d <= 30; d++) {
        L = advanceLedger(L, day, rng);
        check(L, `${periodSec} s day ${d}`);
      }
      expect(L.clock.dayCount).toBe(30);
    });
  }

  it('drift guard: ten ledger days and ten actor days from the same world bank wool within a factor of two', () => {
    const start = createInitialState(7);
    const ledger = advanceLedger(summarise(start), 10 * DAY, createRng(1));
    const actors = summarise(advance(start, (10 * DAY) / TICK_MS));
    const banked = (L: Ledger): number => L.banks.wool + L.banks.coins / RULES.merchant.woolPrice + L.banks.owned.reduce((n, id) => n + (RULES.upgrades.find(([u]) => u === id)?.[1] ?? 0), 0) / RULES.merchant.woolPrice;
    const a = banked(actors);
    const l = banked(ledger);
    expect(l).toBeGreaterThan(a / 2);
    expect(l).toBeLessThan(a * 2);
    expect(Math.abs(meanOf(ledger.grass) - meanOf(actors.grass))).toBeLessThan(0.5);
  });
});

describe('the catch-up policy', () => {
  it('a gap under a second is a reload: nothing runs and the state comes back as is', () => {
    const s = advance(createInitialState(7), 50);
    const c = catchUp(s, 999);
    expect(c.mode).toBe('none');
    expect(c.state).toBe(s);
    expect(c.ranMs).toBe(0);
    expect(c.diff.simMs).toBe(0);
    expect(catchUp(s, -5).mode).toBe('none');
    expect(catchUp(s, NaN).mode).toBe('none');
    expect(catchUp(s, 500, { minMs: 100 }).mode).toBe('actors');
  });

  it('a gap under a day ticks the actors through it, as step() would', () => {
    const s = advance(createInitialState(7), 50);
    const c = catchUp(s, DAY - 100);
    expect(c.mode).toBe('actors');
    expect(c.actorMs).toBe(DAY - 100);
    expect(c.ledgerDays).toBe(0);
    expect(hashState(c.state)).toBe(hashState(step(s, [], DAY - 100)));
    expect(c.after).toEqual(summarise(c.state));
    expect(c.diff.days).toBe(1);
    // The snapshot on the state is untouched: the Ledger did not run.
    expect(c.state.ledger).toEqual(s.ledger);
  });

  it('a day or more runs the whole days on the Ledger, respawns, and ticks the remainder', () => {
    const s = advance(createInitialState(7), 50);
    const gap = 3 * DAY + 30_000;
    const c = catchUp(s, gap);
    expect(c.mode).toBe('ledger');
    expect(c.ledgerDays).toBe(3);
    expect(c.ledgerMs).toBe(3 * DAY);
    expect(c.actorMs).toBe(30_000);
    expect(c.ranMs).toBe(gap);
    expect(c.state.clock.nowMs).toBe(s.clock.nowMs + gap);
    expect(c.state.clock.dayCount).toBe(3);
    expect(c.state.clock.tick).toBe(s.clock.tick + gap / TICK_MS);
    expect(c.state.seed).toBe(7);
    expect(c.state.ledger).toEqual(summarise(c.state));
    expect(c.state.lastLedgerAt).toBe(c.state.clock.nowMs);
    expect(c.before).toEqual(summarise(s));
    expect(c.after).toEqual(c.state.ledger);
    expect(c.diff.days).toBe(3);
    // The input is never modified.
    expect(hashState(s)).toBe(hashState(advance(createInitialState(7), 50)));
    // The world ticks on and saves.
    expect(advance(c.state, 10).clock.tick).toBe(c.state.clock.tick + 10);
    expect(fromSave(toSave(c.state))).toEqual(c.state);
  });

  it('follows the world\'s own period for the day length', () => {
    const s = step(createInitialState(7), [{ type: 'setPeriod', periodSec: 60 }], 100);
    expect(dayMs(s)).toBe(60_000);
    expect(catchUp(s, 59_000).mode).toBe('actors');
    const c = catchUp(s, 61_000);
    expect(c.mode).toBe('ledger');
    expect(c.ledgerDays).toBe(1);
    expect(c.actorMs).toBe(1_000);
  });

  it('queued intents ride over the gap and land on the respawned world\'s first tick', () => {
    const s = step(createInitialState(7), [{ type: 'setSeason', season: 'winter', at: 10 ** 9 }], 100);
    expect(s.pendingIntents).toHaveLength(1);
    const c = catchUp(s, DAY);
    expect(c.state.pendingIntents).toEqual(s.pendingIntents);
    const d = catchUp(s, DAY + 100);
    expect(d.state.pendingIntents).toEqual(s.pendingIntents); // not due yet: still queued
    const due = step(createInitialState(7), [{ type: 'setSeason', season: 'winter', at: 2 }], 100);
    expect(catchUp(due, DAY + 100).state.season.override).toBe('winter');
  });

  it('the diff says what changed for the "while you were gone" line', () => {
    const s = createInitialState(7);
    const c = catchUp(s, 10 * DAY);
    const d = c.diff;
    expect(d.before).toEqual(c.before);
    expect(d.after).toEqual(c.after);
    expect(d.simMs).toBe(10 * DAY);
    expect(d.days).toBe(10);
    expect(d.births).toBe(ledgerFlock(c.after) - ledgerFlock(c.before));
    expect(d.deaths).toBe(0);
    expect(d.grownUp).toBe(c.after.wool.length - 5);
    expect(d.sheep).toBe(d.grownUp);
    expect(d.lambs).toBe(c.after.lambs.length);
    expect(d.wool).toBe(c.after.banks.wool);
    expect(d.coins).toBe(c.after.banks.coins);
    expect(d.upgrades).toEqual(c.after.banks.owned);
    expect(d.weather.from).toBe('sun');
    expect(d.weather.changed).toBe(d.weather.to !== 'sun');
    expect(d.season).toEqual({ from: 'spring', to: 'spring', changed: false });
    expect(d.mood).toBeCloseTo(c.after.mood - c.before.mood, 12);
  });

  it('diffLedger on hand-made ledgers: births, deaths, wool, coins, weather, season, upgrades', () => {
    const a = summarise(createInitialState(7));
    const b = cloneLedger(a);
    b.clock = { ...b.clock, nowMs: 5 * DAY, dayCount: 5 };
    b.wool = [...a.wool, 0.05];
    b.lambs = [{ mother: 0, ageMs: 100 }];
    b.banks = { wool: 3, coins: 7, owned: ['flowerbed'] };
    b.weather = { ...b.weather, kind: 'snow', rain: false };
    b.season = { ...b.season, override: 'winter' };
    const d = diffLedger(a, b);
    expect(d).toMatchObject({ simMs: 5 * DAY, days: 5, sheep: 1, lambs: 1, births: 2, deaths: 0, grownUp: 1, wool: 3, coins: 7, upgrades: ['flowerbed'] });
    expect(d.weather).toEqual({ from: 'sun', to: 'snow', changed: true });
    expect(d.season).toEqual({ from: 'spring', to: 'winter', changed: true });
    expect(currentSeason(b.season)).toBe('winter');
    const back = diffLedger(b, a);
    expect(back).toMatchObject({ births: 0, deaths: 2, grownUp: 0, sheep: -1, lambs: -1, wool: -3, coins: -7, upgrades: [] });
  });
});

describe('determinism and speed', () => {
  it('the mixed path: the same state and gap give the same world, twice; another gap or seed does not', () => {
    const s = advance(createInitialState(7), 50);
    const gap = 5 * DAY + 12_345;
    const a = catchUp(s, gap);
    const b = catchUp(s, gap);
    expect(a.mode).toBe('ledger');
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.after)).toBe(hashState(b.after));
    expect(a.diff).toEqual(b.diff);
    expect(hashState(catchUp(s, gap + 100).state)).not.toBe(hashState(a.state));
    expect(hashState(catchUp(advance(createInitialState(8), 50), gap).state)).not.toBe(hashState(a.state));
    // Through a save and back, the same again.
    expect(hashState(catchUp(fromSave(toSave(s)), gap).state)).toBe(hashState(a.state));
  });

  it('the ledger alone: the same ledger, span, and generator state give the same ledger', () => {
    const L = summarise(buildFixtureState());
    const a = advanceLedger(L, 30 * DAY + 4_321, createRng(9));
    const b = advanceLedger(L, 30 * DAY + 4_321, createRng(9));
    expect(a).toEqual(b);
    // (The fixture world was switched to season mode mid-shower, so it rains for ever, as the
    // prototype's does: nothing there draws. A sunny world draws for weather and births.)
    const S = summarise(createInitialState(7));
    expect(advanceLedger(S, 30 * DAY + 4_321, createRng(9))).toEqual(advanceLedger(S, 30 * DAY + 4_321, createRng(9)));
    expect(advanceLedger(S, 30 * DAY + 4_321, createRng(10))).not.toEqual(advanceLedger(S, 30 * DAY + 4_321, createRng(9)));
  });

  it('a 7-day gap resolves under 50 ms', () => {
    const s = advance(createInitialState(7), 50);
    catchUp(s, 7 * DAY); // warm up the JIT once, as the client's first call would
    const t0 = hrtime.bigint();
    const c = catchUp(s, 7 * DAY);
    const ms = Number(hrtime.bigint() - t0) / 1e6;
    expect(c.mode).toBe('ledger');
    expect(c.ledgerDays).toBe(7);
    expect(ms).toBeLessThan(50);
  });

  // Measured at about 60 ms on the build machine: 28 ms of ledger, the rest the 450 actor ticks
  // of the remainder. The bound is loose so a slow CI runner does not fail it; the ticket's bound
  // is the 7-day one above.
  it('a real week away (3,360 sim-days of 180 s, plus a remainder) resolves under 200 ms', () => {
    const s = advance(createInitialState(7), 50);
    const week = 7 * 24 * 3600 * 1000 + 45_000;
    catchUp(s, week);
    const t0 = hrtime.bigint();
    const c = catchUp(s, week);
    const ms = Number(hrtime.bigint() - t0) / 1e6;
    expect(c.ledgerDays).toBe(3360);
    expect(c.actorMs).toBe(45_000);
    expect(c.state.clock.dayCount).toBe(3360);
    expect(currentSeason(c.state.season)).toBe('spring'); // seven of the season's nine days
    expect(ms).toBeLessThan(200);
  });
});

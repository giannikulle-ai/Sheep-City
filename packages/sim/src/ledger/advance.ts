// Advancing the Ledger with no actors in the room. One step is a sim-minute (the plan's ledger
// tick); inside it the day's events are run in time order, and the continuous stocks (fleece,
// grass, lamb ages) flow between them. Every rate and threshold is the actors' own, read from
// RULES (packages/content/balance/farm.json and the prototype literals rules.ts carries); the two
// derived figures below (the merchant's walk, the grazing share) say what they are derived from.
//
// The rules, per event, and how they compare with the actor tick they stand in for:
//
// - Fleece grows `1 / woolGrowSec` per second, capped at 1, as in `tickSheep`.
// - The farmer visits at the two `farmer.visitsAt` fractions of the day, once each per day, with
//   the same `lastVisitKey` guard as `tickNpcs`. He shears every sheep at or above
//   `farmer.shearAt`, banking one wool each, unless it is raining, when the flock is in the barn
//   and he shears nobody. The actor visit takes a minute of walking and the flock keeps growing
//   fleece under his hands, so a sheep just under the line at his arrival can still be shorn
//   there; here the line is read at the instant of the visit.
// - The merchant comes `WALK_IN_MS` after `merchantAtMs`, **buys nothing** (#86, plan decision 12:
//   "the economy is not the farm's"), stays `stayMs`, walks out, and is due again `everyMs` later,
//   as the actor's job plan runs. The event is kept because his timer is a Ledger number the
//   watched world reads back through `summarise` and `respawn`; it simply moves no stock.
// - The farmer walks to market at dawn, once a day, on the same `lastVisitKey` slot his two
//   shearing visits book (#86; the watched world's own `farmerMarketWalk` category action, see
//   engine/category.ts). The whole wool bank goes with him: `banks.wool` to 0, the settlement's
//   coins up by `wool * merchant.woolPrice` — the same `sellWoolAtMarket` the actor path calls, so
//   a week away sells at the same price a watched week does. It buys nothing any more (#126): the
//   farm's three builds are on the farm from the start now, not something the settlement's purse
//   affords as it fills.
// - A lamb-less sheep rolls for a lamb: the actor rolls `lambChancePerSec * TICK_SEC` every fair
//   tick, so a step rolls once per sheep with the same odds over the step's ticks, and a birth
//   that lands in rain or over `flockCap` does not happen, as the actor's would not.
// - A lamb grows up at `lambGrowMs`, in fair weather, into a shorn sheep at the end of the flock
//   with the next name index, as the `lambs` chain does.
// - Grass regrows `tuftRegrowPerSec` on every tuft all day (eased up by `hay2RegrowMult` while hay2
//   is owned, #63); by day and in fair weather the flock bites `GRAZE_SHARE` of its sheep-seconds
//   at `tuftBitePerSec`, spread over the tufts. The actors eat one tuft at a time; the ledger eats
//   the lawn evenly.
// - Weather rolls as `tickWeather` does, in season mode only: at `rollAtMs` draw the next roll and
//   the season's snow and rain odds, then a length; rain or snow clears at `untilMs`. Temperature
//   is set to its target at the end of the step, where the actor relaxes towards it within
//   seconds.
//
// Determinism: every draw comes from the `rng` handed in, in a fixed order (births at the top of
// the step, weather at its rolls), so a ledger, a span, and a generator state give one result.

import { phaseOf, seasonAtOffset, SEASON_ODDS, type SeasonName } from '../clock';
import { MARKET_VISIT_K } from '../engine/category';
import { NPC_SIZE, SPOT, type Point } from '../geometry';
import { NPC_FOOT, sellWoolAtMarket } from '../npcs';
import { chance, nextFloat, type Rng } from '../rng';
import { hay2RegrowMult, RULES, TICK_MS } from '../rules';
import { setWeather, tempTarget } from '../weather';
import { cloneLedger, LEDGER_STEP_MS, ledgerFlock, moodOf, type Ledger, type LedgerLamb } from './ledger';

/** The merchant's foot when `makeNpc` puts him offstage, and where `summonMerchant` walks him to trade. */
const MERCHANT_SPAWN: Point = { x: SPOT.offstage.x - 8 + NPC_FOOT[0], y: SPOT.offstage.y - NPC_SIZE.h + 2 + NPC_FOOT[1] };
const MERCHANT_STAND: Point = { x: SPOT.gateOut.x + 10, y: SPOT.gateOut.y };

function walkMs(from: Point, to: Point): number {
  return (Math.hypot(to.x - from.x, to.y - from.y) / RULES.npc.walkSpeed) * 1000;
}

/** The merchant's walk in from offstage and back out, at the NPC walk speed: about five seconds each. */
export const WALK_IN_MS = walkMs(MERCHANT_SPAWN, MERCHANT_STAND);
export const WALK_OUT_MS = walkMs(MERCHANT_STAND, SPOT.offstage);

/**
 * The share of a fair-weather day a sheep spends biting grass, from the needs numbers: `graze`
 * is `pick.graze` of every need picked; an eating spell ends on a `stopEatingPerSec` roll, so it
 * lasts `1 / stopEatingPerSec` seconds on average; a settled sheep waits `1 / needRollPerSec`
 * seconds on average for its next pick. The walk to the tuft is not counted, so this leans high.
 */
export const GRAZE_SHARE = (RULES.sheep.pick.graze * (1 / RULES.sheep.stopEatingPerSec)) / (1 / RULES.sheep.stopEatingPerSec + 1 / RULES.sheep.needRollPerSec);

/** The actor's per-tick lamb roll. */
const BIRTH_PER_TICK = RULES.lambChancePerSec * (TICK_MS / 1000);

/**
 * Every daily crossing the farmer keeps, as a clock bucket `k` (hundredths of a day, the unit
 * `Npcs.lastVisitKey` is written in) plus how wide the watched world's own window on it is.
 *
 * His two shearing visits fire from `tickNpcs`, which compares `Math.floor(t * 100)` against the
 * bucket, so their window is one hundredth of a day. The market walk fires from the
 * `farmerMarketWalk` category action, whose `due` reads `phaseOf(t) === 'dawn'` — the whole of
 * dawn, from `RULES.clock.phases.dawn` to midnight — so its window is that much wider, and this
 * carries the width rather than assuming a hundredth for all three. Without it a catch-up that
 * began after the first hundredth of dawn would skip that day's sale where a watched world would
 * have made it.
 */
const VISITS: readonly { k: number; window: number; market: boolean }[] = [
  ...RULES.farmer.visitsAt.map((v) => ({ k: Math.floor(v * 100), window: 0.01, market: false })),
  { k: MARKET_VISIT_K, window: 1 - RULES.clock.phases.dawn, market: true },
];

const NONE = 0;
const ROLL = 1;
const CLEAR = 2;
const GROW = 3;
const BIRTH = 4;
const FARMER = 5;
const MERCHANT = 6;

interface Birth {
  mother: number;
  at: number;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * The ledger `simMs` later. Pure: returns a new ledger and leaves the input untouched; draws from
 * `rng` in place, as the rest of the package does. `simMs` must be finite and non-negative.
 */
export function advanceLedger(ledger: Ledger, simMs: number, rng: Rng): Ledger {
  if (!Number.isFinite(simMs) || simMs < 0) throw new Error(`advanceLedger: simMs must be a finite non-negative number, got ${simMs}`);
  const L = cloneLedger(ledger);
  let left = simMs;
  while (left > 0) {
    const span = Math.min(left, LEDGER_STEP_MS);
    stepLedger(L, span, rng);
    left -= span;
  }
  L.mood = moodOf(L);
  return L;
}

/** One ledger step of `span` ms, mutating `L`. */
function stepLedger(L: Ledger, span: number, rng: Rng): void {
  const clock0 = L.clock;
  const t0 = clock0.nowMs;
  const t1 = t0 + span;
  const periodMs = clock0.periodSec * 1000;
  /** The clock fraction at `ms`, not wrapped: whole numbers are days passed since the step began. */
  const unwrapped = (ms: number): number => (clock0.paused ? clock0.t : clock0.t + (ms - t0) / periodMs);
  const fracAt = (ms: number): number => {
    const u = unwrapped(ms);
    return u - Math.floor(u);
  };
  // The season in force at sim instant `ms`, read off the world's real-year calendar (#84; it was
  // the nine-real-day wheel before). Reads `L.season` live, exactly as the old expression did, so
  // an override set mid-step is seen the moment it lands.
  const seasonAtMs = (ms: number): SeasonName => seasonAtOffset(L.season, ms - t0);

  // Births are drawn up front, one roll per lamb-less sheep with the actor's odds over the step.
  const births: Birth[] = [];
  const pBirth = 1 - Math.pow(1 - BIRTH_PER_TICK, span / TICK_MS);
  const mothers = new Set(L.lambs.map((l) => l.mother));
  for (let i = 0; i < L.wool.length; i++) {
    if (mothers.has(i)) continue;
    if (chance(rng, pBirth)) births.push({ mother: i, at: Math.round(t0 + nextFloat(rng) * span) });
  }
  births.sort((a, b) => a.at - b.at || a.mother - b.mother);
  let birthIdx = 0;

  /** Let the continuous stocks flow from `from` to `to`. */
  const flow = (from: number, to: number): void => {
    const ms = to - from;
    if (ms <= 0) return;
    const dt = ms / 1000;
    for (let i = 0; i < L.wool.length; i++) L.wool[i] = Math.min(1, (L.wool[i] as number) + dt / RULES.woolGrowSec);
    for (const l of L.lambs) l.ageMs += ms;
    const grazing = !L.weather.rain && phaseOf(fracAt(from)) !== 'night';
    const bites = grazing && L.grass.length ? (L.wool.length * GRAZE_SHARE * dt * RULES.tuftBitePerSec) / L.grass.length : 0;
    // hay2 (#63): the same regrow bonus tick.ts applies, so a catch-up week agrees with a watched one.
    const regrow = dt * RULES.tuftRegrowPerSec * hay2RegrowMult(L.banks.owned);
    for (let i = 0; i < L.grass.length; i++) L.grass[i] = clamp01((L.grass[i] as number) - bites + regrow);
  };

  /**
   * The farmer's next appointment at or after `cursor`: the bucket crossing the watched world fires
   * on, with its key and whether it is the market walk (#86) or one of his two shearing visits.
   * All three share the one `lastVisitKey` slot, exactly as they do on the watched path, and their
   * buckets never collide (6, 38, 92).
   */
  const nextVisit = (cursor: number): { at: number; key: number; market: boolean } | null => {
    if (clock0.paused) return null;
    let best: { at: number; key: number; market: boolean } | null = null;
    const u = unwrapped(cursor);
    for (const { k, window, market } of VISITS) {
      const c = k / 100;
      const crossing = (n: number): { at: number; key: number; market: boolean } => ({ at: t0 + (n + c - clock0.t) * periodMs, key: k * 1000 + clock0.dayCount + n, market });
      let n = Math.floor(u - c);
      let next = u - (n + c) < window ? { at: cursor, key: k * 1000 + clock0.dayCount + n, market } : crossing(++n);
      if (next.key === L.lastVisitKey) next = crossing(n + 1);
      if (!best || next.at < best.at) best = next;
    }
    return best;
  };

  let cursor = t0;
  // The farmer's next visit depends on the cursor only through "inside the bucket now", so it is
  // computed once per step and again after each visit, not on every pass of the loop.
  let visit = nextVisit(cursor);
  for (;;) {
    let at = t1;
    let kind = NONE;
    let lamb = -1;
    const w = L.weather;
    // Ties go to the earlier check: weather first, so a visit at the same instant sees it.
    if (w.mode === 'season') {
      if (w.kind === 'sun') {
        const c = Math.max(cursor, w.rollAtMs);
        if (c < at) {
          at = c;
          kind = ROLL;
        }
      } else if (w.untilMs) {
        const c = Math.max(cursor, w.untilMs);
        if (c < at) {
          at = c;
          kind = CLEAR;
        }
      }
    }
    if (w.kind !== 'rain') {
      for (let i = 0; i < L.lambs.length; i++) {
        const c = Math.max(cursor, cursor + (RULES.lambGrowMs - (L.lambs[i] as LedgerLamb).ageMs));
        if (c < at) {
          at = c;
          kind = GROW;
          lamb = i;
        }
      }
    }
    if (birthIdx < births.length) {
      const c = Math.max(cursor, (births[birthIdx] as Birth).at);
      if (c < at) {
        at = c;
        kind = BIRTH;
      }
    }
    if (visit && visit.at < at) {
      at = visit.at;
      kind = FARMER;
    }
    {
      const c = Math.max(cursor, L.merchantAtMs + WALK_IN_MS);
      if (c < at) {
        at = c;
        kind = MERCHANT;
      }
    }
    if (kind === NONE) break;
    flow(cursor, at);
    cursor = at;

    switch (kind) {
      case ROLL: {
        const [rollLo, rollHi] = RULES.rain.rollEveryMs;
        const [lenLo, lenHi] = RULES.rain.lengthMs;
        let next = { ...L.weather, rollAtMs: at + rollLo + nextFloat(rng) * (rollHi - rollLo) };
        const odds = SEASON_ODDS[seasonAtMs(at)];
        const r = nextFloat(rng);
        if (r < odds.snow) {
          next = setWeather(next, 'snow');
          next.untilMs = at + lenLo + nextFloat(rng) * (lenHi - lenLo) * 1.5;
        } else if (r < odds.snow + odds.rain) {
          next = setWeather(next, 'rain');
          next.untilMs = at + lenLo + nextFloat(rng) * (lenHi - lenLo);
        }
        L.weather = next;
        break;
      }
      case CLEAR:
        L.weather = setWeather(L.weather, 'sun');
        break;
      case GROW:
        L.lambs.splice(lamb, 1);
        L.wool.push(RULES.sheep.shornWool);
        L.nameIdx++;
        break;
      case BIRTH: {
        const b = births[birthIdx++] as Birth;
        if (!L.weather.rain && ledgerFlock(L) < RULES.flockCap && b.mother < L.wool.length && !L.lambs.some((l) => l.mother === b.mother)) {
          L.lambs.push({ mother: b.mother, ageMs: 0 });
          L.lambs.sort((p, q) => p.mother - q.mother);
        }
        break;
      }
      case FARMER: {
        const v = visit as { at: number; key: number; market: boolean };
        L.lastVisitKey = v.key;
        if (v.market) {
          // The market walk (#86): the whole bank goes out and the settlement pays for it. The same
          // function the watched `market` job calls, with no chronicle to tell into — the gap's own
          // diff tells the total once instead (chronicle/ledger-diff.ts).
          sellWoolAtMarket(L);
        } else if (!L.weather.rain) {
          for (let i = 0; i < L.wool.length; i++) {
            if ((L.wool[i] as number) >= RULES.farmer.shearAt) {
              L.wool[i] = RULES.sheep.shornWool;
              L.banks.wool++;
            }
          }
        }
        visit = nextVisit(cursor);
        break;
      }
      case MERCHANT: {
        // Nothing changes hands (#86). He is still scheduled, because `merchantAtMs` is a Ledger
        // number the watched world reads back through `summarise` and `respawn` and because the
        // loop needs the event to keep the timer moving; he simply moves no stock while he is here.
        L.merchantAtMs = at + RULES.merchant.stayMs + WALK_OUT_MS + RULES.merchant.everyMs;
        break;
      }
    }
  }
  flow(cursor, t1);

  // Ages stay whole milliseconds, as the actors' birth ticks are, so a save round-trips exactly.
  for (const l of L.lambs) l.ageMs = Math.round(l.ageMs);
  const u = unwrapped(t1);
  const whole = Math.floor(u);
  L.clock = {
    ...clock0,
    t: clock0.paused ? clock0.t : u - whole,
    tick: clock0.tick + Math.round(span / TICK_MS),
    nowMs: t1,
    dayCount: clock0.dayCount + (clock0.paused ? 0 : whole),
  };
  L.season = { ...L.season, elapsedMs: L.season.elapsedMs + span };
  L.weather = { ...L.weather, temp: tempTarget(seasonAtMs(t1), L.clock.t, L.weather.kind) };
}

// Actors from numbers: the reverse of `summarise`. The layout (tufts, sheep, the small life) is
// drawn from `seed` in `createInitialState`'s order, so the same ledger and seed always give the
// same field; the numbers (grass, fleece, lamb ages, banks, timers) are copied straight in, so
// `summarise(respawn(ledger))` gives `ledger` back exactly for any ledger `summarise` or
// `advanceLedger` produced. A few states are set so the seam is plausible: at night the flock is
// resting and Digital Luna is asleep in the barn; in rain the flock is in the barn already.

import { phaseOf } from '../clock';
import { FLOWERS, LFOOT, randomFoot, SFOOT, SPOT } from '../geometry';
import { groundSnowy } from '../ground';
import { createRng, nextFloat } from '../rng';
import { RULES } from '../rules';
import { makeLuna, makeSheep, makeTufts, SAVE_VERSION, type Butterfly, type Fly, type Sheep, type SimState, type Tuft } from '../state';
import { cloneLedger, type Ledger } from './ledger';

/**
 * A state whose numbers are `ledger`'s, with positions from `seed` (the ledger's own seed by
 * default, so a district respawns onto its own field). The returned state carries the ledger as
 * its snapshot, taken now. No NPC is on the field; the merchant's timer and the farmer's visit
 * key carry over so their schedules continue.
 */
export function respawn(ledger: Ledger, seed: number = ledger.seed): SimState {
  const rng = createRng(seed);
  const now = ledger.clock.nowMs;
  const phase = phaseOf(ledger.clock.t);
  const night = phase === 'night';
  const rain = ledger.weather.rain;

  // The tufts: the seed's layout, one per grass level. A ledger with more levels than the layout
  // has tufts gets extra ones at random feet; one with fewer keeps the first tufts only.
  const tufts: Tuft[] = makeTufts(rng);
  while (tufts.length < ledger.grass.length) {
    const f = randomFoot(rng);
    tufts.push({ x: f.x, y: f.y, level: 0, claimed: null });
  }
  tufts.length = ledger.grass.length;
  ledger.grass.forEach((level, i) => {
    (tufts[i] as Tuft).level = level;
  });

  const sheep: Sheep[] = ledger.wool.map((wool, i) => {
    const s = makeSheep(rng, i, randomFoot(rng));
    s.wool = wool;
    if (night) s.resting = true;
    if (rain) {
      s.inBarn = true;
      s.shelter = true;
      s.x = SPOT.barnDoor.x - SFOOT[0];
      s.y = SPOT.barnDoor.y - SFOOT[1] + 2;
    }
    return s;
  });
  for (const l of ledger.lambs) {
    const m = sheep[Math.min(l.mother, sheep.length - 1)];
    if (!m) continue;
    m.lambs.push({ x: m.x - 18, y: m.y + 8, dir: m.dir, bornMs: now - l.ageMs, grown: l.ageMs > RULES.lambGrowMs });
  }

  const luna = makeLuna();
  if (night) {
    // Asleep on the bed spot the bedtime routine walks her to; dawn wakes her as usual.
    luna.routine = 'asleep';
    luna.anim = 'sleep';
    luna.x = SPOT.barnDoor.x + 24 - LFOOT[0];
    luna.y = SPOT.barnDoor.y + 2 - LFOOT[1];
  }

  const bflies: Butterfly[] = [0, 1].map((i) => {
    const home = FLOWERS[i] as readonly [number, number];
    return { x: home[0], y: home[1], p: nextFloat(rng) * 6, home };
  });
  const flies: Fly[] = [];
  for (let i = 0; i < 14; i++) flies.push({ ...randomFoot(rng), p: nextFloat(rng) * 6, s: 0.5 + nextFloat(rng) });

  const state: SimState = {
    version: SAVE_VERSION,
    seed: ledger.seed,
    rng,
    clock: { ...ledger.clock },
    season: { ...ledger.season },
    weather: { ...ledger.weather },
    tufts,
    sheep,
    luna,
    npcs: { farmer: null, merchant: null, merchantAtMs: ledger.merchantAtMs, lastVisitKey: ledger.lastVisitKey },
    banks: { wool: ledger.banks.wool, coins: ledger.banks.coins, owned: ledger.banks.owned.slice() },
    life: { rabbit: null, bird: null, bflies, flies },
    ground: { prints: [], mud: [], wasSnowy: false },
    nameIdx: Math.max(ledger.nameIdx, sheep.length),
    accumulatorMs: 0,
    pendingIntents: [],
    ledger: cloneLedger(ledger),
    lastLedgerAt: now,
  };
  state.ground.wasSnowy = groundSnowy(state);
  return state;
}

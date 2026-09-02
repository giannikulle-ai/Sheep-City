// Typed world state, shaped after the globals in prototype/luna-farm/src/sim_template.html.
// Everything here is plain data: no class instances, no object references between actors (tufts
// are claimed by actor id, not by pointer), so the state can be cloned, hashed, saved, and diffed.

import { createClock, createSeason, type Clock, type Season } from './clock';
import { FLOWERS, inBarn, LFOOT, randomDir, randomFoot, SFOOT, type Point } from './geometry';
import type { Intent } from './intents';
import { cloneLedger, summarise, type Ledger } from './ledger/ledger';
import { createRng, nextFloat, type Rng } from './rng';
import { RULES } from './rules';
import { createWeather, type Weather } from './weather';

/**
 * Bumped by the sim lane whenever the save schema changes. Every bump ships a migration in
 * `save/migrations` and a fixture in `test/fixtures/save-v<n>.json`. v0 was the bare state from
 * the clock ticket (#4); v1 (#8) wraps it in a `{ format, version, world }` envelope; v2 (#5a) adds
 * Digital Luna's stick, bedtime circling, door re-face, name tag, and trundle timers; v3 (#5b) adds
 * `nameIdx` and the NPC job-plan fields (`wp`, `outside`, `entering`, `job`, `shearing`, `cart`,
 * `icon`, `iconUntilMs`); v4 (#33) adds `ground` (snow footprints, mud patches, `wasSnowy`) and the
 * per-walker stamp fields `lastStamp` and `stampSide` on each sheep and on Digital Luna; v5 (#39)
 * adds `ledger` (the district's numbers as the Ledger path last wrote them) and `lastLedgerAt`.
 */
export const SAVE_VERSION = 5;

/** Stable actor ids. Sheep are `sheep-<n>`; Digital Luna is `luna`. */
export type ActorId = string;

export type Dir = 1 | -1;

export interface Tuft extends Point {
  /** Grass height, 0 to 1. */
  level: number;
  /** Actor eating this tuft, or null. */
  claimed: ActorId | null;
}

export interface Lamb extends Point {
  dir: Dir;
  bornMs: number;
  grown: boolean;
}

/** What `stampGround` keeps on a walker: the foot point of its last stamp and which side the next print goes on. */
export interface Stamper {
  lastStamp: Point | null;
  stampSide: boolean;
}

/** One sheep; field names follow the prototype's `makeSheep`. Positions are sprite top-left. */
export interface Sheep extends Point, Stamper {
  id: ActorId;
  name: string;
  color: string;
  dir: Dir;
  /** Sim time this animation started (the prototype's `t0`). */
  t0Ms: number;
  tx: number | null;
  ty: number | null;
  wp: Point | null;
  path: Point[];
  lambs: Lamb[];
  wool: number;
  wander: 0 | 1;
  outside: boolean;
  entering: boolean;
  resting: boolean;
  eating: boolean;
  /** Index into `tufts`, or null. */
  tuft: number | null;
  hayTrip: boolean;
  drinkTrip: boolean;
  shelter: boolean;
  inBarn: boolean;
  toBarn: boolean;
  /** Sim time a pending shear completes, or null. */
  shearAtMs: number | null;
  ridden: boolean;
  icon: string | null;
  iconUntilMs: number;
  tagUntilMs: number;
  wet: number;
  snow: number;
}

/** A thrown stick: where it landed, where DL was when it was thrown, and which leg she is on. */
export interface StickThrow extends Point {
  fromX: number;
  fromY: number;
  phase: 'out' | 'back';
}

export interface Luna extends Point, Stamper {
  dir: Dir;
  anim: string;
  t0Ms: number;
  target: Point | null;
  tx: number | null;
  ty: number | null;
  wp: Point | null;
  idle: number;
  manual: string | null;
  manualUntilMs: number;
  routine: string | null;
  icon: string | null;
  iconUntilMs: number;
  riding: ActorId | null;
  mounting: ActorId | null;
  rideUntilMs: number;
  inBarn: boolean;
  tuft: number | null;
  chasing: boolean;
  wet: number;
  snow: number;
  /** The prototype's global `stickThrow`; DL's fetch behaviour owns it. */
  stick: StickThrow | null;
  /** Sim time the bedtime circling ends, or null when not circling. */
  circleUntilMs: number | null;
  /** Sim time DL last re-faced a sheep while waiting at the barn door. */
  dirAtMs: number;
  /** Sim time until which her name tag shows after a pet. */
  tagUntilMs: number;
  /** The trundle button: sim time until which a run is drawn as a bound. */
  forceBoundUntilMs: number;
}

export type NpcJob = { job: string; at?: Point };

/** A visiting NPC; field names follow the prototype's `summonFarmer` / `summonMerchant`. */
export interface Npc extends Point {
  kind: 'farmer' | 'merchant';
  dir: Dir;
  anim: string;
  t0Ms: number;
  tx: number | null;
  ty: number | null;
  wp: Point | null;
  /** Off the field: skips the barn router. Flips at the gate, see `npcStep`. */
  outside: boolean;
  /** Set on the farmer at spawn, as the prototype does; nothing reads it there either. */
  entering: boolean;
  /** Remaining steps of the job plan; the current one is `job`. */
  plan: NpcJob[];
  job: string | null;
  jobUntilMs: number;
  /** The sheep the farmer is walking to shear, or null. */
  shearing: ActorId | null;
  /** The merchant pulls a cart (a renderer hint the prototype keeps on the NPC). */
  cart: boolean;
  icon: string | null;
  iconUntilMs: number;
  /** Coins the merchant paid on this visit, for the HUD. */
  sold: number;
}

/** The wool and coin economy: the prototype's `woolBank`, `coins`, `owned`. */
export interface Banks {
  wool: number;
  coins: number;
  owned: string[];
}

export interface Npcs {
  farmer: Npc | null;
  merchant: Npc | null;
  /** Sim time of the merchant's next visit. */
  merchantAtMs: number;
  /** The prototype's `lastVisitDay` guard for the farmer's two daily visits. */
  lastVisitKey: number;
}

export interface Rabbit extends Point {
  t0Ms: number;
}

export interface Bird extends Point {
  tx: number;
  ty: number;
  state: 'in' | 'sit' | 'out';
  t0Ms: number;
}

export interface Butterfly extends Point {
  p: number;
  home: readonly [number, number];
}

export interface Fly extends Point {
  p: number;
  s: number;
}

/** Small life: rabbit, bird, butterflies, flies. */
export interface Life {
  rabbit: Rabbit | null;
  bird: Bird | null;
  bflies: Butterfly[];
  flies: Fly[];
}

/** A footprint in snow: where, and the sim time it was stamped. Cleared as soon as the ground is not snowy. */
export interface SnowPrint extends Point {
  tMs: number;
}

/** A mud patch stamped by a foot in rain (or a melted print): where, when, and its radius in px. */
export interface MudPatch extends Point {
  tMs: number;
  r: number;
}

/** The ground stamps: the prototype's `prints`, `mud`, and `wasSnowy` globals. */
export interface Ground {
  prints: SnowPrint[];
  mud: MudPatch[];
  /** Whether the last `tickGround` saw snowy ground; the flip to not-snowy is the melt. */
  wasSnowy: boolean;
}

export interface SimState {
  version: number;
  seed: number;
  rng: Rng;
  clock: Clock;
  season: Season;
  weather: Weather;
  tufts: Tuft[];
  sheep: Sheep[];
  luna: Luna;
  npcs: Npcs;
  banks: Banks;
  life: Life;
  ground: Ground;
  /** Next index into `NAMES` / `COLORS` for a lamb that grows up: the prototype's `nameIdx`. */
  nameIdx: number;
  /** Sim milliseconds owed to the next tick by the fixed-step loop. */
  accumulatorMs: number;
  /** Intents waiting for their tick boundary. */
  pendingIntents: Intent[];
  /**
   * The district's numbers as the Ledger path last wrote them: at creation, on `respawn`, and at
   * the end of a ledger catch-up. The actor tick does not keep it current; `summarise(state)` is
   * the live reading, and the client diffs the two for "since you last looked".
   */
  ledger: Ledger;
  /** Sim time (`clock.nowMs`) `ledger` was taken. */
  lastLedgerAt: number;
}

export const NAMES = ['Clover', 'Daisy', 'Biscuit', 'Pepper', 'Maple', 'Willow', 'Poppy', 'Hazel', 'Juniper'] as const;
export const COLORS = ['#3a7bd5', '#e0a52c', '#2fa07a', '#7c4dbf', '#e0602c', '#d33a2f', '#2aa0b8', '#a04ad0', '#8b8b2a'] as const;

export interface InitialStateOptions {
  /** How many sheep to spawn. Default `RULES.flock.initial` (the prototype's 5). */
  sheep?: number;
}

/** The prototype's `makeTufts`, drawing from `rng` where it drew from Math.random. */
export function makeTufts(rng: Rng): Tuft[] {
  const out: Tuft[] = [];
  const inset = 0.78;
  const corners = (
    [
      [320, 44],
      [624, 208],
      [320, 372],
      [16, 208],
    ] as const
  ).map(([x, y]) => [320 + (x - 320) * inset, 208 + (y - 208) * inset] as const);
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e] as readonly [number, number];
    const [bx, by] = corners[(e + 1) % 4] as readonly [number, number];
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const x = ax + (bx - ax) * t + (nextFloat(rng) - 0.5) * 10;
      const y = ay + (by - ay) * t + (nextFloat(rng) - 0.5) * 6;
      // No tuft on the barn or just under it: the prototype checks `inBarn(x, y) || inBarn(x, y - 10)`.
      if (inBarn(x, y) || inBarn(x, y - 10) || (e === 1 && t > 0.15 && t < 0.55)) continue;
      out.push({ x, y, level: 0.4 + nextFloat(rng) * 0.6, claimed: null });
    }
  }
  for (let i = 0; i < 6; i++) {
    const f = randomFoot(rng);
    out.push({ x: f.x, y: f.y, level: nextFloat(rng), claimed: null });
  }
  return out;
}

/** The prototype's `makeSheep`. `t0` was `performance.now() - random * 4000`; here it is `-random * 4000`. */
export function makeSheep(rng: Rng, i: number, foot: Point, outside = false): Sheep {
  return {
    id: `sheep-${i}`,
    name: NAMES[i % NAMES.length] as string,
    color: COLORS[i % COLORS.length] as string,
    x: foot.x - SFOOT[0],
    y: foot.y - SFOOT[1],
    dir: randomDir(rng),
    t0Ms: -nextFloat(rng) * 4000,
    tx: null,
    ty: null,
    wp: null,
    path: [],
    lambs: [],
    wool: nextFloat(rng) * 0.6,
    wander: 0,
    outside,
    entering: outside,
    resting: false,
    eating: false,
    tuft: null,
    hayTrip: false,
    drinkTrip: false,
    shelter: false,
    inBarn: false,
    toBarn: false,
    shearAtMs: null,
    ridden: false,
    icon: null,
    iconUntilMs: 0,
    tagUntilMs: 0,
    wet: 0,
    snow: 0,
    lastStamp: null,
    stampSide: false,
  };
}

export function makeLuna(): Luna {
  return {
    x: 120,
    y: 280,
    dir: 1,
    anim: 'sit',
    t0Ms: 0,
    target: null,
    tx: null,
    ty: null,
    wp: null,
    idle: 0,
    manual: null,
    manualUntilMs: 0,
    routine: null,
    icon: null,
    iconUntilMs: 0,
    riding: null,
    mounting: null,
    rideUntilMs: 0,
    inBarn: false,
    tuft: null,
    chasing: false,
    wet: 0,
    snow: 0,
    stick: null,
    circleUntilMs: null,
    dirAtMs: 0,
    tagUntilMs: 0,
    forceBoundUntilMs: 0,
    lastStamp: null,
    stampSide: false,
  };
}

/**
 * A fresh world from a seed: the prototype's `reset()`, with every random draw taken from the
 * seeded generator in the same order. The same seed always gives the same world.
 */
export function createInitialState(seed: number, options: InitialStateOptions = {}): SimState {
  const rng = createRng(seed);
  const count = options.sheep ?? RULES.flock.initial;
  const tufts = makeTufts(rng);
  const sheep: Sheep[] = [];
  for (let i = 0; i < count; i++) sheep.push(makeSheep(rng, i, randomFoot(rng)));
  const luna = makeLuna();
  const bflies: Butterfly[] = [0, 1].map((i) => {
    const home = FLOWERS[i] as readonly [number, number];
    return { x: home[0], y: home[1], p: nextFloat(rng) * 6, home };
  });
  const flies: Fly[] = [];
  for (let i = 0; i < 14; i++) flies.push({ ...randomFoot(rng), p: nextFloat(rng) * 6, s: 0.5 + nextFloat(rng) });
  const state: SimState = {
    version: SAVE_VERSION,
    seed: seed >>> 0,
    rng,
    clock: createClock(),
    season: createSeason(),
    weather: createWeather(),
    tufts,
    sheep,
    luna,
    npcs: { farmer: null, merchant: null, merchantAtMs: RULES.merchantFirstAtMs, lastVisitKey: -1 },
    banks: { wool: 0, coins: 0, owned: [] },
    life: { rabbit: null, bird: null, bflies, flies },
    ground: { prints: [], mud: [], wasSnowy: false },
    // The prototype resets `nameIdx` to 5 whatever the flock; a bigger flock here continues from its own size so ids stay unique.
    nameIdx: count,
    accumulatorMs: 0,
    pendingIntents: [],
    ledger: null as unknown as Ledger,
    lastLedgerAt: 0,
  };
  state.ledger = summarise(state);
  return state;
}

/**
 * A structural copy one level deeper than a spread: every actor, tuft, and small creature is a
 * new object, so a tick can mutate the copy without touching its input. Hand-written rather than
 * `structuredClone` because it runs once per tick.
 */
export function cloneState(state: SimState): SimState {
  return {
    ...state,
    rng: { s: state.rng.s },
    clock: { ...state.clock },
    season: { ...state.season },
    weather: { ...state.weather },
    tufts: state.tufts.map((t) => ({ ...t })),
    sheep: state.sheep.map(cloneSheep),
    luna: {
      ...state.luna,
      target: state.luna.target ? { ...state.luna.target } : null,
      wp: state.luna.wp ? { ...state.luna.wp } : null,
      stick: state.luna.stick ? { ...state.luna.stick } : null,
      lastStamp: state.luna.lastStamp ? { ...state.luna.lastStamp } : null,
    },
    npcs: {
      ...state.npcs,
      farmer: state.npcs.farmer ? cloneNpc(state.npcs.farmer) : null,
      merchant: state.npcs.merchant ? cloneNpc(state.npcs.merchant) : null,
    },
    banks: { ...state.banks, owned: state.banks.owned.slice() },
    life: {
      rabbit: state.life.rabbit ? { ...state.life.rabbit } : null,
      bird: state.life.bird ? { ...state.life.bird } : null,
      bflies: state.life.bflies.map((b) => ({ ...b })),
      flies: state.life.flies.map((f) => ({ ...f })),
    },
    ground: {
      prints: state.ground.prints.map((p) => ({ ...p })),
      mud: state.ground.mud.map((m) => ({ ...m })),
      wasSnowy: state.ground.wasSnowy,
    },
    pendingIntents: state.pendingIntents.slice(),
    ledger: cloneLedger(state.ledger),
  };
}

function cloneSheep(s: Sheep): Sheep {
  return {
    ...s,
    wp: s.wp ? { ...s.wp } : null,
    path: s.path.map((p) => ({ ...p })),
    lambs: s.lambs.map((l) => ({ ...l })),
    lastStamp: s.lastStamp ? { ...s.lastStamp } : null,
  };
}

function cloneNpc(n: Npc): Npc {
  return { ...n, wp: n.wp ? { ...n.wp } : null, plan: n.plan.map((j) => ({ ...j })) };
}

/** Where a sheep's feet are, for callers that think in foot coordinates. */
export function sheepFoot(s: Point): Point {
  return { x: s.x + SFOOT[0], y: s.y + SFOOT[1] };
}

export function lunaFoot(l: Point): Point {
  return { x: l.x + LFOOT[0], y: l.y + LFOOT[1] };
}

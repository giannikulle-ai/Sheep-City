// The frame's view, built from the sim's state: what the prototype's `draw()` read, field for
// field, taken from `SimState` instead of page globals. The client adds one presentation step the
// prototype did not need: the sim moves actors once per 100 ms tick, so feet are interpolated
// between the last two ticks by how far the accumulator is into the next one. Nothing here
// decides what the world does; it only says where things are drawn.
import type {
  ButterflyView,
  FarmView,
  FireflyView,
  IconName,
  LambView,
  LunaView,
  NpcView,
  Season,
  SheepView,
  Weather,
} from '@sheepcliff/render';
import { currentSeason, TICK_MS, type Npc, type Point, type Sheep, type SimState } from '@sheepcliff/sim';

export interface SimScalars {
  t: number;
  weather: Weather;
  season: Season;
  temp: number;
}

export function simScalars(sim: SimState): SimScalars {
  return { t: sim.clock.t, weather: sim.weather.kind, season: currentSeason(sim.season), temp: sim.weather.temp };
}

/** The render clock: sim time plus the part of the next tick already owed. Continuous across frames. */
export function renderClock(sim: SimState): number {
  return sim.clock.nowMs + sim.accumulatorMs;
}

/** How far into the next tick the accumulator is, 0..1. */
export function tickAlpha(sim: SimState): number {
  return Math.max(0, Math.min(1, sim.accumulatorMs / TICK_MS));
}

/** A step longer than this between two ticks is a teleport (leaving the barn, a dismount), not a walk. */
const SNAP_PX = 40;

function lerpPoint(prev: Point | null | undefined, next: Point, alpha: number): Point {
  if (!prev || alpha <= 0) return { x: next.x, y: next.y };
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (Math.abs(dx) > SNAP_PX || Math.abs(dy) > SNAP_PX) return { x: next.x, y: next.y };
  return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
}

const ICONS: readonly IconName[] = ['shears', 'bang', 'heart', 'coin'];
const iconName = (icon: string | null): IconName | null => (icon && (ICONS as readonly string[]).includes(icon) ? (icon as IconName) : null);

function sheepView(s: Sheep, prev: Sheep | undefined, alpha: number): SheepView {
  const p = prev && prev.inBarn === s.inBarn ? lerpPoint(prev, s, alpha) : { x: s.x, y: s.y };
  const lambs: LambView[] = s.lambs.map((l, i) => {
    const pl = prev?.lambs[i];
    const lp = lerpPoint(pl && pl.bornMs === l.bornMs ? pl : null, l, alpha);
    return { x: lp.x, y: lp.y, dir: l.dir, t0: l.bornMs };
  });
  return {
    name: s.name,
    color: s.color,
    x: p.x,
    y: p.y,
    dir: s.dir,
    t0: s.t0Ms,
    wool: s.wool,
    resting: s.resting,
    moving: s.tx !== null,
    eating: s.eating,
    inBarn: s.inBarn,
    wet: s.wet,
    snow: s.snow,
    icon: iconName(s.icon),
    iconUntil: s.iconUntilMs,
    tagUntil: s.tagUntilMs,
    lambs,
    ridden: s.ridden,
  };
}

function npcView(n: Npc | null, prev: Npc | null | undefined, alpha: number): NpcView | null {
  if (!n) return null;
  const p = lerpPoint(prev && prev.kind === n.kind ? prev : null, n, alpha);
  return {
    x: p.x,
    y: p.y,
    dir: n.dir,
    anim: n.anim === 'work' ? 'work' : 'walk',
    icon: iconName(n.icon),
    iconUntil: n.iconUntilMs,
    cart: n.cart,
    // the sim's `sold` is HUD-only in the prototype too; the coin bubble carries the beat
  };
}

/**
 * Build the view for one frame. `prev` is the state one tick earlier (or null on the first frame
 * and after a teleport), `alpha` how far the accumulator is into the next tick.
 */
export function simView(prev: SimState | null, sim: SimState, alpha: number, liveWeather: boolean): FarmView {
  const s = simScalars(sim);
  const prevSheep = new Map<string, Sheep>();
  if (prev) for (const q of prev.sheep) prevSheep.set(q.id, q);
  const sheep = sim.sheep.map((q) => sheepView(q, prevSheep.get(q.id), alpha));

  const l = sim.luna;
  const pl = prev?.luna;
  const lp = pl && pl.inBarn === l.inBarn && (pl.riding === null) === (l.riding === null) ? lerpPoint(pl, l, alpha) : { x: l.x, y: l.y };
  const luna: LunaView = {
    x: lp.x,
    y: lp.y,
    dir: l.dir,
    anim: l.anim,
    inBarn: l.inBarn,
    riding: l.riding !== null,
    wet: l.wet,
    snow: l.snow,
    icon: iconName(l.icon),
    tagUntil: l.tagUntilMs,
    forceBound: l.forceBoundUntilMs,
  };

  const rabbit = sim.life.rabbit ? lerpPoint(prev?.life.rabbit, sim.life.rabbit, alpha) : null;
  const bird = sim.life.bird ? { x: sim.life.bird.x, y: sim.life.bird.y, state: sim.life.bird.state } : null;
  const butterflies: ButterflyView[] = sim.life.bflies.map((b) => ({ x: b.x, y: b.y, p: b.p }));
  const fireflies: FireflyView[] = sim.life.flies.map((f) => ({ x: f.x, y: f.y, p: f.p }));

  return {
    clockT: s.t,
    weather: s.weather,
    temp: s.temp,
    season: s.season,
    liveWeather,
    sheep,
    luna,
    rabbit,
    bird,
    butterflies,
    fireflies,
    tufts: sim.tufts.map((t) => ({ x: t.x, y: t.y, level: Math.max(0, Math.min(1, t.level)) })),
    // The sim has no ground stamps yet (mud in rain, footprints in snow): see the sim ticket in the PR.
    mud: [],
    prints: [],
    farmer: npcView(sim.npcs.farmer, prev?.npcs.farmer, alpha),
    merchant: npcView(sim.npcs.merchant, prev?.npcs.merchant, alpha),
    // the prototype draws the stick only while it lies on the grass, on DL's way out
    stick: l.stick && l.stick.phase === 'out' ? { x: l.stick.x, y: l.stick.y } : null,
    owned: sim.banks.owned.slice(),
    woolBank: sim.banks.wool,
    coins: sim.banks.coins,
  };
}

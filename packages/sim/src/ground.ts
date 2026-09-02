// Ground stamps, ported from the prototype's `stampGround` and `tickGround` (the "prints, mud,
// wasSnowy" globals in prototype/luna-farm/src/sim_template.html). A walker leaves a footprint in
// snow or a mud patch in rain every 7 px of foot travel, on alternating sides; the prints clear as
// soon as the ground is not snowy (35% of them melting into mud) and the mud fades with age.
//
// "Snowy" is the prototype's `weather === "snow" || (season === "winter" && mode !== "live")`.
// The sim has no live mode (a host feeding real weather does so through intents in manual mode),
// so the live clause is dropped: snow, or winter, is snowy. The client draws the prints only on a
// snowy background, as the prototype's `draw` did, so a host in live mode still shows none.

import { currentSeason } from './clock';
import type { Point } from './geometry';
import { chance, nextFloat } from './rng';
import type { SimState, Stamper } from './state';

/** Footprints stay this many, oldest dropped first; mud patches this many (260 right after a melt). */
export const PRINT_CAP = 600;
export const MUD_CAP = 220;
export const MELT_MUD_CAP = 260;
/** A stamp lands every 7 px of foot travel. */
export const STAMP_EVERY_PX = 7;
/** Mud fades after four minutes dry, ten in the rain. */
export const MUD_FADE_MS = 240_000;
export const MUD_FADE_RAIN_MS = 600_000;

/** The prototype's `snowy`: snow, or winter (its live-weather exception is a host concern, see above). */
export function groundSnowy(s: SimState): boolean {
  return s.weather.kind === 'snow' || currentSeason(s.season) === 'winter';
}

/**
 * The prototype's `stampGround`: one stamp under `o`'s foot if it has moved 7 px since the last.
 * The stamp gate and the side flip move whatever the weather; only snow (a print) and rain (a mud
 * patch, one draw for its radius) leave anything behind.
 */
export function stampGround(s: SimState, o: Stamper & Point, foot: readonly [number, number], now: number, snowy: boolean): void {
  const fx = o.x + foot[0];
  const fy = o.y + foot[1];
  if (o.lastStamp && Math.hypot(fx - o.lastStamp.x, fy - o.lastStamp.y) < STAMP_EVERY_PX) return;
  o.lastStamp = { x: fx, y: fy };
  o.stampSide = !o.stampSide;
  const g = s.ground;
  if (snowy) {
    g.prints.push({ x: fx + (o.stampSide ? -3 : 3), y: fy - 1, tMs: now });
    if (g.prints.length > PRINT_CAP) g.prints.shift();
  } else if (s.weather.rain) {
    g.mud.push({ x: fx, y: fy - 1, tMs: now, r: 3 + nextFloat(s.rng) * 3 });
    if (g.mud.length > MUD_CAP) g.mud.shift();
  }
}

/**
 * The prototype's `tickGround`: on the tick the ground stops being snowy, 35% of the prints melt
 * into mud (two draws each: the roll, then the radius); prints never survive un-snowy ground; mud
 * older than its fade is dropped. The prototype's `return` out of its fetch branch skips this, so
 * `tick` calls it only when Digital Luna is not fetching.
 */
export function tickGround(s: SimState, snowy: boolean): void {
  const g = s.ground;
  const now = s.clock.nowMs;
  if (g.wasSnowy && !snowy) {
    for (const p of g.prints) {
      if (chance(s.rng, 0.35)) g.mud.push({ x: p.x, y: p.y, tMs: now, r: 4 + nextFloat(s.rng) * 4 });
    }
    g.prints.length = 0;
    if (g.mud.length > MELT_MUD_CAP) g.mud = g.mud.slice(-MELT_MUD_CAP);
  }
  g.wasSnowy = snowy;
  if (!snowy) g.prints.length = 0;
  // `mud.filter(m => now - m.t < limit)`, compacted in place so a dry tick allocates nothing.
  const limit = s.weather.rain ? MUD_FADE_RAIN_MS : MUD_FADE_MS;
  const mud = g.mud;
  let w = 0;
  for (let i = 0; i < mud.length; i++) {
    const m = mud[i]!;
    if (now - m.tMs < limit) mud[w++] = m;
  }
  mud.length = w;
}

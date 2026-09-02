// Movement helpers, ported from the prototype's `stepToward`, `clampField`, `clampTarget`,
// `segHitsBarn`, and `waypointAround`. Anything with feet uses these; they route around the barn.

import { BARN, C, inBarn, insideField, type Point } from './geometry';
import { RULES } from './rules';

/** The fields a walker needs: sprite top-left, facing, a foot target, and a waypoint. */
export interface Mover extends Point {
  dir: 1 | -1;
  tx: number | null;
  ty: number | null;
  wp: Point | null;
  /** Off the field (an NPC walking in from offstage). Skips barn routing and clamping. */
  outside?: boolean;
  entering?: boolean;
  leaving?: boolean;
}

export function segHitsBarn(x0: number, y0: number, x1: number, y1: number): boolean {
  // Every sample lies inside the box spanned by the endpoints, so a box that misses the barn's
  // open rectangle cannot hit it. Same answer as sampling, without the thirteen `inBarn` calls.
  if (
    (x0 <= BARN.x0 && x1 <= BARN.x0) ||
    (x0 >= BARN.x1 && x1 >= BARN.x1) ||
    (y0 <= BARN.y0 && y1 <= BARN.y0) ||
    (y0 >= BARN.y1 && y1 >= BARN.y1)
  ) {
    return false;
  }
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    if (inBarn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}

/** The corner below the barn that makes the shortest detour from (x0,y0) to (x1,y1). */
export function waypointAround(x0: number, y0: number, x1: number, y1: number): Point {
  const below = BARN.y1 + 10;
  const c: [number, number][] = [
    [BARN.x0 - 12, below],
    [BARN.x1 + 12, below],
  ];
  c.sort(
    (a, b) =>
      Math.hypot(a[0] - x0, a[1] - y0) + Math.hypot(a[0] - x1, a[1] - y1) - (Math.hypot(b[0] - x0, b[1] - y0) + Math.hypot(b[0] - x1, b[1] - y1)),
  );
  const best = c[0] as [number, number];
  return { x: best[0], y: best[1] };
}

/**
 * Move `o` (sprite top-left) so its foot reaches (o.tx, o.ty). Returns true on arrival.
 * `dt` is split into `RULES.moveSubsteps` prototype-sized frames; see the note on that rule.
 */
export function stepToward(o: Mover, foot: readonly [number, number], sp: number, dt: number): boolean {
  const n = RULES.moveSubsteps;
  for (let i = 0; i < n; i++) if (stepFrame(o, foot, sp, dt / n)) return true;
  return false;
}

/** One prototype frame of `stepToward`. */
function stepFrame(o: Mover, foot: readonly [number, number], sp: number, dt: number): boolean {
  if (o.tx === null || o.ty === null) return true;
  const fx = o.x + foot[0];
  const fy = o.y + foot[1];
  let gx = o.tx;
  let gy = o.ty;
  if (o.wp) {
    gx = o.wp.x;
    gy = o.wp.y;
  } else if (!o.outside && segHitsBarn(fx, fy, gx, gy)) {
    o.wp = waypointAround(fx, fy, gx, gy);
    gx = o.wp.x;
    gy = o.wp.y;
  }
  const dx = gx - fx;
  const dy = gy - fy;
  const d = Math.hypot(dx, dy);
  if (d < 1.2) {
    if (o.wp) {
      o.wp = null;
      return false;
    }
    return true;
  }
  const v = Math.min(sp, sp * (0.35 + d / 12));
  o.x += (dx / d) * v * dt;
  o.y += (dy / d) * v * dt;
  if (Math.abs(dx) > 2) o.dir = dx < 0 ? -1 : 1;
  return false;
}

/**
 * Nudge a walker back inside the field diamond and out of the barn footprint. The prototype's
 * nudges were per frame, so this repeats `RULES.moveSubsteps` times per tick. A frame's nudge
 * depends on the position alone, so once a frame moves nothing the rest would not either and
 * the loop stops early with the same result.
 */
export function clampField(o: Mover, foot: readonly [number, number]): void {
  if (o.outside || o.leaving || o.entering) return;
  for (let i = 0; i < RULES.moveSubsteps; i++) if (!clampFrame(o, foot)) return;
}

/** One frame of the clamp. True if it moved anything. */
function clampFrame(o: Mover, foot: readonly [number, number]): boolean {
  const fx = o.x + foot[0];
  const fy = o.y + foot[1];
  if (inBarn(fx, fy)) {
    o.y += 1.5;
    return true;
  }
  if (!insideField(fx, fy, 0.97)) {
    o.x += (C[0] - fx) * 0.04;
    o.y += (C[1] - fy) * 0.04;
    if (o.tx !== null && o.ty !== null && !insideField(o.tx, o.ty, 0.9)) {
      o.tx = C[0] + (o.tx - C[0]) * 0.85;
      o.ty = C[1] + (o.ty - C[1]) * 0.85;
    }
    return true;
  }
  return false;
}

/** Pull a target point inside the field, stepping it towards the centre and off the barn. */
export function clampTarget(t: Point, m = 0.86): Point {
  let n = 0;
  const o = { x: t.x, y: t.y };
  while (!insideField(o.x, o.y, m) && n++ < 40) {
    o.x += (C[0] - o.x) * 0.08;
    o.y += (C[1] - o.y) * 0.08;
    if (inBarn(o.x, o.y)) o.y += 3;
  }
  return o;
}

// World geometry, ported from the prototype's "world geometry" block and landmark table.
// Foot coordinates are in world pixels on the 640 by 400 field.

import { chance, nextRange, type Rng } from './rng';

export interface Point {
  x: number;
  y: number;
}

export const W = 640;
export const H = 400;

/** Field centre and the half-diagonals of the diamond that bounds it. */
export const C: readonly [number, number] = [320, 208];
export const RX = 304;
export const RY = 164;

export const BARN = { x0: 268, x1: 388, y0: 0, y1: 76 } as const;

/** Landmarks (foot coords in world px). */
export const SPOT = {
  trough: { x: 150, y: 216 },
  hay: { x: 240, y: 146 },
  gate: { x: 506, y: 262 },
  web: { x: 488, y: 250 },
  gateOut: { x: 560, y: 290 },
  offstage: { x: 690, y: 330 },
  barnDoor: { x: 316, y: 80 },
  tree: { x: 78, y: 200 },
  front: { x: 320, y: 300 },
} as const;

/** Fence post tops for the bird. */
export const POSTS: readonly (readonly [number, number])[] = [
  [168, 108],
  [222, 82],
  [452, 104],
  [516, 136],
];
export const FLOWERS: readonly (readonly [number, number])[] = [
  [120, 240],
  [400, 312],
  [500, 224],
  [280, 184],
];

// Sprite sizes from prototype/luna-farm/build/spritesheet.json. The sim only needs them to turn a
// sprite's top-left into its foot point; the renderer reads the real sheet.
export const SHEEP_SIZE = { w: 32, h: 27 } as const;
export const LUNA_SIZE = { w: 44, h: 40 } as const;
export const NPC_SIZE = { w: 16, h: 21 } as const;

/** Foot offset from a sprite's top-left: `[w * .5, h - 2]` in the prototype. */
export const SFOOT: readonly [number, number] = [SHEEP_SIZE.w * 0.5, SHEEP_SIZE.h - 2];
export const LFOOT: readonly [number, number] = [LUNA_SIZE.w * 0.5, LUNA_SIZE.h - 2];

export function inBarn(x: number, y: number): boolean {
  return x > BARN.x0 && x < BARN.x1 && y > BARN.y0 && y < BARN.y1;
}

export function insideField(x: number, y: number, m = 0.9): boolean {
  return Math.abs(x - C[0]) / RX + Math.abs(y - C[1]) / RY < m && !inBarn(x, y);
}

/** A random standable foot point on the field. Same search as the prototype, drawn from `rng`. */
export function randomFoot(rng: Rng): Point {
  for (let i = 0; i < 60; i++) {
    const x = 40 + nextFloat01(rng) * 560;
    const y = 60 + nextFloat01(rng) * 290;
    if (Math.abs(x - 320) / RX + Math.abs(y - 208) / RY < 0.78 && !inBarn(x, y) && !inBarn(x, y - 8)) return { x, y };
  }
  return { x: 320, y: 230 };
}

function nextFloat01(rng: Rng): number {
  return nextRange(rng, 0, 1);
}

/** Random direction, `Math.random() < .5 ? 1 : -1` in the prototype. */
export function randomDir(rng: Rng): 1 | -1 {
  return chance(rng, 0.5) ? 1 : -1;
}

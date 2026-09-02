// Pin comments, the pure part: what a pin is, what it is near, and the text export. The DOM
// overlay is in pin-overlay.ts. Format follows the prototype so the owner's paste-back habit holds:
//   1. [lantern] looks unrealistic  (499, 276)
import { clockLabel, phaseOf, type FarmView } from '@sheepcliff/render';
import { WORLD_H, WORLD_W } from '@sheepcliff/render';
import type { SpriteSizes } from './hit';

export interface Pin {
  /** fraction of the stage width, 0..1 */
  x: number;
  /** fraction of the stage height, 0..1 */
  y: number;
  text: string;
  near: string | null;
  time: string;
}

/** Fixed landmarks the prototype names, at their centres. */
const LANDMARKS: ReadonlyArray<readonly [string, number, number]> = [
  ['barn', 350, 80],
  ['gate', 506, 262],
  ['trough', 150, 216],
  ['hay', 240, 146],
  ['lantern', 500, 290],
];

/** The nearest named thing within 40 world px, or null. */
export function describeAt(view: FarmView, wx: number, wy: number, sizes: SpriteSizes): string | null {
  let best: string | null = null;
  let bd = 40;
  const cands: (readonly [string, number, number])[] = [
    ['Digital Luna', view.luna.x + sizes.luna.w / 2, view.luna.y + sizes.luna.h / 2],
    ...view.sheep.map((s) => [s.name, s.x + sizes.sheep.w / 2, s.y + sizes.sheep.h / 2] as const),
    ...LANDMARKS,
  ];
  for (const [name, cx, cy] of cands) {
    const d = Math.hypot(cx - wx, cy - wy);
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

export function pinWorld(p: Pin): { x: number; y: number } {
  return { x: Math.round(p.x * WORLD_W), y: Math.round(p.y * WORLD_H) };
}

export function pinLine(p: Pin, i: number): string {
  const { x, y } = pinWorld(p);
  return `${i + 1}. ${p.near ? `[${p.near}] ` : ''}${p.text || '(no text)'}  (${x}, ${y})`;
}

export function pinsMarkdown(pins: readonly Pin[], clockT: number, weather: string): string {
  const head = `## Sheepcliff pins — ${clockLabel(clockT)} ${phaseOf(clockT)}${weather === 'sun' ? '' : `, ${weather}`}`;
  return [head, '', ...pins.map(pinLine)].join('\n');
}

export const PINS_KEY = 'sheepcliff-pins';

export function parsePins(raw: string | null): Pin[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((p): p is Pin => typeof p === 'object' && p !== null && typeof (p as Pin).x === 'number' && typeof (p as Pin).y === 'number')
      .map((p) => ({ x: p.x, y: p.y, text: typeof p.text === 'string' ? p.text : '', near: typeof p.near === 'string' ? p.near : null, time: typeof p.time === 'string' ? p.time : '' }));
  } catch {
    return [];
  }
}

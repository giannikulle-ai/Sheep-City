// Weather and atmosphere layers drawn over the composited scene, ported from
// the tail of the prototype's `draw()`: rain streaks, snowflakes, cold breath,
// the warm season wash, and fireflies. All are functions of `now`, no randomness.
import type { FarmView, Season } from './state';

export const RAIN_WASH = 'rgba(60,80,110,.28)';

/** Rain streaks. Same 90 diagonal lines the prototype draws, scrolled by `now`. */
export function drawRain(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  ctx.strokeStyle = 'rgba(220,235,255,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const off = (now / 6) % 40;
  for (let i = 0; i < 90; i++) {
    const x = ((i * 71 + off * 2) % (W + 40)) - 20;
    const y = ((i * 53 + off * 4) % (H + 40)) - 20;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3, y + 9);
  }
  ctx.stroke();
}

/** Falling snow: 70 flakes at five speeds. */
export function drawSnow(ctx: CanvasRenderingContext2D, W: number, H: number, now: number): void {
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 70; i++) {
    const sp = 12 + (i % 5) * 4;
    const x = ((i * 97 + Math.sin(now / 900 + i) * 18 + now / 90) % (W + 20)) - 10;
    const y = ((i * 61 + now / (1000 / sp)) % (H + 10)) - 5;
    const size = i % 3 ? 1 : 2;
    ctx.fillRect(Math.round(x), Math.round(y), size, size);
  }
}

/** 0..1 progress of a breath puff for a phase offset, or null between puffs. */
export function puff(now: number, t0: number): number | null {
  const ph = ((now + t0) % 2600) / 2600;
  return ph < 0.45 ? ph / 0.45 : null;
}

/** Visible breath below 3 degrees: a 2px puff drifting from each muzzle. */
export function drawBreath(
  ctx: CanvasRenderingContext2D,
  view: FarmView,
  now: number,
  SW: number,
  LW: number,
): void {
  ctx.fillStyle = 'rgba(240,246,255,.5)';
  for (const s of view.sheep) {
    if (s.inBarn || s.resting) continue;
    const p = puff(now, s.t0);
    if (p !== null) {
      ctx.fillRect(
        Math.round(s.x + (s.dir > 0 ? SW - 2 : 0) + s.dir * p * 5),
        Math.round(s.y + 10 - p * 4),
        2,
        2,
      );
    }
  }
  const l = view.luna;
  if (!l.inBarn && !l.riding && l.anim !== 'sleep') {
    const p = puff(now, 777);
    if (p !== null) {
      ctx.fillRect(
        Math.round(l.x + (l.dir > 0 ? LW - 4 : 2) + l.dir * p * 5),
        Math.round(l.y + 14 - p * 4),
        2,
        2,
      );
    }
  }
}

/** Warm multiply wash for summer and autumn when there is no snow on the ground. */
export function seasonWash(season: Season, snowy: boolean): string | null {
  if (snowy) return null;
  if (season === 'summer') return 'rgba(255,248,225,1)';
  if (season === 'autumn') return 'rgba(255,236,205,1)';
  return null;
}

export function drawSeasonWash(ctx: CanvasRenderingContext2D, W: number, H: number, colour: string): void {
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

/** Fireflies at dusk (faint) and night (full), never in rain. */
export function drawFireflies(ctx: CanvasRenderingContext2D, view: FarmView, night: boolean): void {
  const a = night ? 1 : 0.35;
  for (const fl of view.fireflies) {
    const on = (Math.sin(fl.p * 3) + 1) / 2;
    if (on > 0.55) {
      ctx.fillStyle = `rgba(255,230,120,${(on - 0.5) * 2 * a})`;
      ctx.fillRect(Math.round(fl.x), Math.round(fl.y), 2, 2);
    }
  }
}

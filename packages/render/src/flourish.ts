// Deity-power reaction flourishes (issue #44): a small ring at the target for an `act`, a ripple
// in the sky for a `weather` tap. Both are plain canvas strokes, timed off the render clock the
// same way the rest of the package's overlays are (drawRain, drawSnow, drawBreath), and both reuse
// the accent colour the HUD and tags already use (`drawHud`'s `#ffd75e`) — no new sprite, no new
// colour. The client (apps/web/src/reactions.ts) decides when a flourish starts; this module only
// knows how to paint one given its deadline.

/** How long a ring or ripple takes to grow and fade, in ms. Both land well inside the charter's
 * one-second reaction budget. */
export const RING_MS = 700;
export const SKY_RIPPLE_MS = 900;

/** The one new colour this file draws with: not new at all, the HUD/tag accent already on screen. */
const ACCENT = '#ffd75e';

/** 0 at the moment it started, 1 as it finishes fading; null once it is entirely over or hasn't started. */
function progress(now: number, until: number, durationMs: number): number | null {
  const remain = until - now;
  if (remain <= 0 || remain > durationMs) return null;
  return 1 - remain / durationMs;
}

/** A small expanding, fading ring at a world point: the flourish for a deity `act` on one creature. */
export function drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number, until: number): void {
  const p = progress(now, until, RING_MS);
  if (p === null) return;
  const r = 4 + p * 9;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 1 - p;
  ctx.beginPath();
  ctx.ellipse(Math.round(cx), Math.round(cy), r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A soft ring rippling out from the top of the sky: the flourish for a deity `weather` tap. */
export function drawSkyRipple(ctx: CanvasRenderingContext2D, worldW: number, now: number, until: number): void {
  const p = progress(now, until, SKY_RIPPLE_MS);
  if (p === null) return;
  const r = 16 + p * 70;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.globalAlpha = (1 - p) * 0.65;
  ctx.beginPath();
  ctx.ellipse(worldW / 2, 8, r, r * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

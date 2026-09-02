// @sheepcliff/render — Canvas 2D sprite drawing.
// Scaffold: only the sprite-sheet frame lookup, ported 1:1 from
// prototype/luna-farm/build/farm.js. The client lane ports the rest.

/** One animation row in the sheet: frames laid out left to right at `y`. */
export interface AnimMeta {
  y: number;
  frames: number;
  fps: number;
  meaning?: string;
}

export interface SpriteMeta {
  w: number;
  h: number;
  anims: Record<string, AnimMeta>;
}

/** Shape of spritesheet.json as the Python pipeline writes it. */
export interface SheetMeta {
  palette: string[];
  sprites: Record<string, SpriteMeta>;
}

export interface FrameRect {
  sx: number;
  sy: number;
  w: number;
  h: number;
}

function anim(meta: SheetMeta, sprite: string, name: string): { s: SpriteMeta; a: AnimMeta } {
  const s = meta.sprites[sprite];
  if (!s) throw new Error(`render: unknown sprite "${sprite}"`);
  const a = s.anims[name];
  if (!a) throw new Error(`render: sprite "${sprite}" has no animation "${name}"`);
  return { s, a };
}

/** Source rectangle in the sheet for one frame. Frames wrap modulo the animation length. */
export function frameRect(meta: SheetMeta, sprite: string, name: string, frame: number): FrameRect {
  const { s, a } = anim(meta, sprite, name);
  const f = ((frame % a.frames) + a.frames) % a.frames;
  return { sx: f * s.w, sy: a.y, w: s.w, h: s.h };
}

/** Which frame plays at `elapsedMs`, using the animation's own fps. */
export function frameAt(meta: SheetMeta, sprite: string, name: string, elapsedMs: number): number {
  const { a } = anim(meta, sprite, name);
  return Math.floor(elapsedMs / (1000 / a.fps)) % a.frames;
}

/**
 * Draw one frame at integer pixel coords, 1:1 from the sheet. Never scales or rotates;
 * `flip` mirrors horizontally, which the prototype allows for facing direction.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  sheet: CanvasImageSource,
  meta: SheetMeta,
  sprite: string,
  name: string,
  frame: number,
  x: number,
  y: number,
  flip = false,
): void {
  const r = frameRect(meta, sprite, name, frame);
  const dx = Math.round(x);
  const dy = Math.round(y);
  ctx.imageSmoothingEnabled = false;
  if (flip) {
    ctx.save();
    ctx.translate(dx + r.w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(sheet, r.sx, r.sy, r.w, r.h, 0, 0, r.w, r.h);
    ctx.restore();
  } else {
    ctx.drawImage(sheet, r.sx, r.sy, r.w, r.h, dx, dy, r.w, r.h);
  }
}

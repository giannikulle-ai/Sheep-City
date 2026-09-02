// Sprite sheet: frame lookup and one-frame draw, ported 1:1 from
// prototype/luna-farm/build/farm.js (`Farm.draw`) and the `drawSprite` /
// `shadow` helpers in the prototype's sim. Never scales or rotates a frame;
// `flip` mirrors horizontally, which the prototype allows for facing direction.

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

/** Sprite size in sheet pixels. */
export function spriteSize(meta: SheetMeta, sprite: string): { w: number; h: number } {
  const s = meta.sprites[sprite];
  if (!s) throw new Error(`render: unknown sprite "${sprite}"`);
  return { w: s.w, h: s.h };
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

/** The soft ground shadow the prototype paints under every standing sprite. */
export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  ctx.fillStyle = 'rgba(43,29,23,.22)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), w * 0.38, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A loaded sheet: the image plus its JSON, with the prototype's `Farm` methods. */
export class Sheet {
  constructor(
    public readonly meta: SheetMeta,
    public readonly image: CanvasImageSource,
  ) {}

  size(sprite: string): { w: number; h: number } {
    return spriteSize(this.meta, sprite);
  }

  frameAt(sprite: string, name: string, elapsedMs: number): number {
    return frameAt(this.meta, sprite, name, elapsedMs);
  }

  /** `Farm.draw` from farm.js: one frame at integer coords, flip faces left. */
  draw(
    ctx: CanvasRenderingContext2D,
    sprite: string,
    name: string,
    frame: number,
    x: number,
    y: number,
    flip = false,
  ): void {
    drawFrame(ctx, this.image, this.meta, sprite, name, frame, x, y, flip);
  }

  /** The sim's `drawSprite`: shadow first (unless disabled), then the frame. */
  drawSprite(
    ctx: CanvasRenderingContext2D,
    sprite: string,
    name: string,
    frame: number,
    x: number,
    y: number,
    flip = false,
    withShadow = true,
  ): void {
    if (withShadow) {
      const s = this.size(sprite);
      shadow(ctx, x + s.w / 2, y + s.h - 1, s.w);
    }
    this.draw(ctx, sprite, name, frame, x, y, flip);
  }
}

/** Decode an image URL into an element the canvas can draw. Browser only. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`render: failed to load ${url}`));
    img.src = url;
  });
}

/** `loadFarm` from farm.js: fetch the sheet image and its JSON together. */
export async function loadSheet(sheetUrl: string, meta: SheetMeta | string): Promise<Sheet> {
  const [m, img] = await Promise.all([
    typeof meta === 'string' ? fetch(meta).then((r) => r.json() as Promise<SheetMeta>) : Promise.resolve(meta),
    loadImage(sheetUrl),
  ]);
  return new Sheet(m, img);
}

// Agent Farm pixel runtime. Pair with spritesheet.png + spritesheet.json.
// Draw at native pixel scale into a small canvas and let CSS upscale it with
// image-rendering: pixelated; draw name tags on a separate full-res canvas.

export async function loadFarm(sheetUrl = "spritesheet.png", metaUrl = "spritesheet.json") {
  const [meta, img] = await Promise.all([
    fetch(metaUrl).then(r => r.json()),
    new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = sheetUrl; }),
  ]);
  return new Farm(meta, img);
}

export const SHEEP_STATE = { idle: "graze", thinking: "think", tool: "trot", waiting: "bleat", done: "rest", error: "cast", stuck: "bucket" };
export const woolLevel = contextFraction => contextFraction < 0.33 ? 0 : contextFraction < 0.8 ? 1 : 2;

export class Farm {
  constructor(meta, sheet) { this.meta = meta; this.sheet = sheet; }
  size(sprite) { const s = this.meta.sprites[sprite]; return { w: s.w, h: s.h }; }
  frameAt(sprite, anim, elapsedMs) { const a = this.meta.sprites[sprite].anims[anim]; return Math.floor(elapsedMs / (1000 / a.fps)) % a.frames; }
  /** Draw one frame at integer pixel coords. flip=true faces left. */
  draw(ctx, sprite, anim, frame, x, y, flip = false) {
    const s = this.meta.sprites[sprite], a = s.anims[anim];
    const sx = (frame % a.frames) * s.w, sy = a.y;
    x = Math.round(x); y = Math.round(y);
    if (flip) { ctx.save(); ctx.translate(x + s.w, y); ctx.scale(-1, 1); ctx.drawImage(this.sheet, sx, sy, s.w, s.h, 0, 0, s.w, s.h); ctx.restore(); }
    else ctx.drawImage(this.sheet, sx, sy, s.w, s.h, x, y, s.w, s.h);
  }
  /** Convenience: draw a sheep by agent status + context usage. */
  drawSheep(ctx, status, contextFraction, elapsedMs, x, y, flip = false) {
    if (status === "idle" && contextFraction !== undefined) return this.draw(ctx, "sheep", "wool", woolLevel(contextFraction), x, y, flip);
    const anim = SHEEP_STATE[status] || "graze";
    this.draw(ctx, "sheep", anim, this.frameAt("sheep", anim, elapsedMs), x, y, flip);
  }
}

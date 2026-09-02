// The full-resolution UI layer: name tags and the HUD line. The prototype draws
// these on a second canvas sized to the CSS box times devicePixelRatio so text
// stays sharp while the world canvas stays at native pixels.
import { clockLabel } from './phase';
import type { FarmView, Phase } from './state';

/** A tag request from the scene pass: text, world x centre, world top y, swatch colour. */
export type Tag = readonly [text: string, cx: number, top: number, color: string];

export const TAG_FONT = 'ui-monospace, Menlo, monospace';

/** `drawTag`: a dark pill with a colour swatch and the name, at UI scale `k`. */
export function drawTag(
  uc: CanvasRenderingContext2D,
  text: string,
  cx: number,
  top: number,
  color: string,
  k: number,
): void {
  uc.font = `${8.5 * k}px ${TAG_FONT}`;
  uc.textBaseline = 'middle';
  const tw = uc.measureText(text).width;
  const h = 12 * k;
  const w = tw + 18 * k;
  const x = Math.round(cx * k - w / 2);
  const y = Math.round(top * k - h - 3 * k);
  uc.fillStyle = 'rgba(43,29,23,.85)';
  uc.fillRect(x, y, w, h);
  uc.fillStyle = color;
  uc.fillRect(x + 4 * k, y + h / 2 - 2.5 * k, 5 * k, 5 * k);
  uc.fillStyle = '#f8f5ee';
  uc.fillText(text, x + 12 * k, y + h / 2 + k * 0.5);
}

export interface PlacedTag {
  text: string;
  cx: number;
  top: number;
  color: string;
  w: number;
}

/**
 * Tag layout: sort by x, then push a tag up by 14 px while it overlaps one already
 * placed (at most six nudges). Pure, so it can be unit tested.
 */
export function placeTags(tags: readonly Tag[]): PlacedTag[] {
  const placed: PlacedTag[] = [];
  for (const t of [...tags].sort((a, b) => a[1] - b[1])) {
    const [text, cx, color] = [t[0], t[1], t[3]];
    let top = t[2];
    const w = text.length * 5.2 + 18;
    for (let n = 0; n < 6; n++) {
      const hit = placed.find((p) => Math.abs(p.cx - cx) < (p.w + w) / 2 && Math.abs(p.top - top) < 14);
      if (!hit) break;
      top = hit.top - 14;
    }
    placed.push({ text, cx, top, color, w });
  }
  return placed;
}

export function drawTags(uc: CanvasRenderingContext2D, tags: readonly Tag[], k: number): void {
  for (const p of placeTags(tags)) drawTag(uc, p.text, p.cx, p.top, p.color, k);
}

/** The HUD text exactly as the prototype composes it. */
export function hudText(view: FarmView, phase: Phase): string {
  const night = phase === 'night';
  const rain = view.weather === 'rain';
  const glyph = rain ? '☂' : view.weather === 'snow' ? '❄' : night ? '☾' : '☀';
  const flock = view.sheep.length + view.sheep.reduce((n, s) => n + s.lambs.length, 0);
  return `${glyph} ${clockLabel(view.clockT)}  ${flock} sheep  ${view.woolBank} wool  ${view.coins} coins  ${Math.round(view.temp)}°`;
}

export function drawHud(uc: CanvasRenderingContext2D, view: FarmView, phase: Phase, k: number): void {
  const text = hudText(view, phase);
  uc.font = `${9 * k}px ${TAG_FONT}`;
  uc.textBaseline = 'top';
  uc.fillStyle = 'rgba(43,29,23,.85)';
  // the prototype's bar is a fixed 196 px; widen it when the fallback font runs long
  const w = Math.max(196 * k, uc.measureText(text).width + 8 * k);
  uc.fillRect(6 * k, 6 * k, w, 14 * k);
  uc.fillStyle = phase === 'night' ? '#dfe8ff' : '#ffd75e';
  uc.fillText(text, 10 * k, 9 * k);
}

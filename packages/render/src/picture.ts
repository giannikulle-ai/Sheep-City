// Chronicle picture keys → renderable pictures for the storybook (client lane, apps/web). The
// chronicle (packages/sim/src/chronicle) writes a plain string picture key on every entry and does
// not own any art ("this package does not own the art" — chronicle/types.ts). This module is the
// one place that maps those keys onto the existing sprite sheet and backgrounds — no new sprites,
// no new colours, nothing scaled or rotated. An unrecognised key returns null so the caller can
// show a plain card with no picture instead of guessing or crashing.
//
// The keys shipped today (packages/sim/src/chronicle/ledger-diff.ts): 'lamb', 'grown-lamb', 'wool',
// 'coins', `weather-${WeatherKind}`, `season-${SeasonName}`, 'upgrade', 'grave'. The event engine
// (#82) and the social graph will add more later; this file is meant to grow with them, not to be
// exhaustive now.
import type { BackgroundKey } from './phase';
import type { Sheet } from './sheet';
import { ICON } from './state';

export type Picture =
  /** A sprite frame drawn over a background crop. */
  | { kind: 'sprite'; sprite: string; anim: string; frame: number; bg: BackgroundKey }
  /** A background crop alone — for a change with no actor to draw (weather, season). */
  | { kind: 'background'; bg: BackgroundKey };

/** Only 'winter' has its own background today (the snow set); the other three seasons render on
 * the plain day background, same as the renderer's own `isSnowy` rule for the ground. */
const SEASON_BG: Record<string, BackgroundKey> = {
  spring: 'day',
  summer: 'day',
  autumn: 'day',
  winter: 'snow_day',
};

/**
 * Map one chronicle `picture` key to an existing sprite or background crop, or null when nothing
 * in the sheet fits — the caller renders a plain card with no picture rather than guess. `null` is
 * also today's honest answer for 'grave': nothing dies while the player is away in Phase 1, and no
 * sprite in the pipeline reads as a death yet.
 */
export function pictureFor(key: string): Picture | null {
  switch (key) {
    case 'lamb':
      return { kind: 'sprite', sprite: 'lamb', anim: 'walk', frame: 0, bg: 'day' };
    case 'grown-lamb':
      return { kind: 'sprite', sprite: 'sheep', anim: 'trot', frame: 0, bg: 'day' };
    case 'wool':
      return { kind: 'sprite', sprite: 'sheep', anim: 'wool', frame: 0, bg: 'day' };
    case 'coins':
      return { kind: 'sprite', sprite: 'icon', anim: 'all', frame: ICON.coin, bg: 'day' };
    case 'upgrade':
      return { kind: 'sprite', sprite: 'upgrade', anim: 'flowerbed', frame: 0, bg: 'day' };
    default:
      break;
  }
  if (key === 'weather-snow') return { kind: 'background', bg: 'snow_day' };
  if (key === 'weather-sun' || key === 'weather-rain') return { kind: 'background', bg: 'day' };
  if (key.startsWith('season-')) return { kind: 'background', bg: SEASON_BG[key.slice('season-'.length)] ?? 'day' };
  return null;
}

/**
 * Draw one picture into a `w`×`h` canvas: a background crop (centred on the scene, unscaled — the
 * source rect is exactly `w`×`h`, never stretched) with a sprite frame stood on it, shadow
 * included, exactly as `Sheet.drawSprite` draws it on the world canvas. Never touches `ctx.scale`.
 */
export function drawPicture(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  backgrounds: Record<BackgroundKey, CanvasImageSource>,
  picture: Picture,
  w: number,
  h: number,
): void {
  ctx.imageSmoothingEnabled = false;
  const bg = backgrounds[picture.bg];
  const sx = Math.max(0, Math.round(320 - w / 2));
  const sy = Math.max(0, Math.round(180 - h / 2));
  ctx.drawImage(bg, sx, sy, w, h, 0, 0, w, h);
  if (picture.kind === 'sprite') {
    const size = sheet.size(picture.sprite);
    const x = Math.round((w - size.w) / 2);
    const y = Math.round(h - size.h - 6);
    sheet.drawSprite(ctx, picture.sprite, picture.anim, picture.frame, x, y, false, true);
  }
}

import { describe, expect, it, vi } from 'vitest';
import { drawPicture, pictureFor } from './picture';
import { ICON } from './state';

describe('pictureFor', () => {
  it('maps the chronicle picture keys shipped today to a sprite over a background', () => {
    expect(pictureFor('lamb')).toEqual({ kind: 'sprite', sprite: 'lamb', anim: 'walk', frame: 0, bg: 'day' });
    expect(pictureFor('grown-lamb')).toEqual({ kind: 'sprite', sprite: 'sheep', anim: 'trot', frame: 0, bg: 'day' });
    expect(pictureFor('wool')).toEqual({ kind: 'sprite', sprite: 'sheep', anim: 'wool', frame: 0, bg: 'day' });
    expect(pictureFor('coins')).toEqual({ kind: 'sprite', sprite: 'icon', anim: 'all', frame: ICON.coin, bg: 'day' });
    expect(pictureFor('upgrade')).toEqual({ kind: 'sprite', sprite: 'upgrade', anim: 'flowerbed', frame: 0, bg: 'day' });
  });

  it('maps weather and season keys to a background crop, snow only for winter', () => {
    expect(pictureFor('weather-sun')).toEqual({ kind: 'background', bg: 'day' });
    expect(pictureFor('weather-rain')).toEqual({ kind: 'background', bg: 'day' });
    expect(pictureFor('weather-snow')).toEqual({ kind: 'background', bg: 'snow_day' });
    expect(pictureFor('season-spring')).toEqual({ kind: 'background', bg: 'day' });
    expect(pictureFor('season-summer')).toEqual({ kind: 'background', bg: 'day' });
    expect(pictureFor('season-autumn')).toEqual({ kind: 'background', bg: 'day' });
    expect(pictureFor('season-winter')).toEqual({ kind: 'background', bg: 'snow_day' });
  });

  it('returns null for a key with no sprite that fits, including grave, rather than guessing', () => {
    expect(pictureFor('grave')).toBeNull();
    expect(pictureFor('some-future-card-key')).toBeNull();
    expect(pictureFor('')).toBeNull();
  });
});

describe('drawPicture', () => {
  function fakeCtx() {
    return {
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }
  function fakeSheet() {
    return {
      size: vi.fn(() => ({ w: 10, h: 8 })),
      drawSprite: vi.fn(),
    } as unknown as import('./sheet').Sheet;
  }
  const backgrounds = { day: 'day-img', snow_day: 'snow-img' } as unknown as Record<
    import('./phase').BackgroundKey,
    CanvasImageSource
  >;

  it('draws the background crop unscaled, never calling ctx.scale, and turns off smoothing', () => {
    const ctx = fakeCtx();
    drawPicture(ctx, fakeSheet(), backgrounds, { kind: 'background', bg: 'day' }, 48, 36);
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.drawImage).toHaveBeenCalledWith('day-img', expect.any(Number), expect.any(Number), 48, 36, 0, 0, 48, 36);
    expect('scale' in ctx).toBe(false);
  });

  it('draws a sprite frame centred over the background, with a shadow, for a sprite picture', () => {
    const ctx = fakeCtx();
    const sheet = fakeSheet();
    drawPicture(ctx, sheet, backgrounds, { kind: 'sprite', sprite: 'lamb', anim: 'walk', frame: 0, bg: 'day' }, 48, 36);
    expect(sheet.drawSprite).toHaveBeenCalledWith(ctx, 'lamb', 'walk', 0, expect.any(Number), expect.any(Number), false, true);
  });
});

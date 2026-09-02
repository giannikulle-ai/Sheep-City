import { expect, test } from '@playwright/test';

// Smoke: the built page loads headless and the canvas is not blank.
// "Not blank" means pixels that differ from the flat sky and grass fills,
// so a page that only paints the background still fails.
test('hello canvas draws a sheep on the ground', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 10_000 });
  expect(errors).toEqual([]);

  const canvas = page.locator('canvas#scene');
  await expect(canvas).toBeVisible();

  const stats = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return { total: 0, spriteish: 0, colours: 0 };
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const sky = [0x6f, 0x8f, 0xa6];
    const grass = [0x6f, 0xb3, 0x5c];
    const seen = new Set<number>();
    let spriteish = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      seen.add((r << 16) | (g << 8) | b);
      const isSky = r === sky[0] && g === sky[1] && b === sky[2];
      const isGrass = r === grass[0] && g === grass[1] && b === grass[2];
      if (!isSky && !isGrass) spriteish++;
    }
    return { total: data.length / 4, spriteish, colours: seen.size };
  });

  expect(stats.total).toBe(96 * 64);
  // A 32x27 sheep frame is a few hundred opaque pixels.
  expect(stats.spriteish).toBeGreaterThan(200);
  expect(stats.spriteish).toBeLessThan(32 * 27);
  // Sky, grass, plus the sheep's own colours.
  expect(stats.colours).toBeGreaterThan(4);
});

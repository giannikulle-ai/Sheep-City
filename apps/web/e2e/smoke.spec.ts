import { expect, test } from '@playwright/test';

// Smoke: the built page loads headless, draws the farm at native 640x400, and
// the animation loop is running (the world changes between two frames).
test('farm renders at 640x400 and animates', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  expect(errors).toEqual([]);

  const world = page.locator('canvas#world');
  await expect(world).toBeVisible();
  const ui = page.locator('canvas#ui');
  await expect(ui).toBeVisible();

  const stats = async () =>
    world.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (!ctx) return { w: 0, h: 0, colours: 0, hash: 0 };
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const seen = new Set<number>();
      let hash = 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
        seen.add(v);
        hash = (hash * 31 + v) | 0;
      }
      return { w: c.width, h: c.height, colours: seen.size, hash };
    });

  const a = await stats();
  expect(a.w).toBe(640);
  expect(a.h).toBe(400);
  // background plus sheep, DL, grass, NPCs: far more than a flat fill
  expect(a.colours).toBeGreaterThan(40);

  // the UI canvas is sized to the stage, not to the world
  const uiSize = await ui.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(uiSize.w).toBeGreaterThan(0);
  expect(uiSize.h).toBeGreaterThan(0);

  // the sim ticks every 100 ms and sheep graze at 3 fps, so a moment later differs
  await page.waitForTimeout(700);
  const b = await stats();
  expect(b.hash).not.toBe(a.hash);
});

test('the fixture still, behind ?fixture=1, renders one deterministic frame', async ({ page }) => {
  await page.goto('/?fixture=1&t=0.7&weather=snow&now=5000');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  const once = await page.locator('canvas#world').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(300);
  const again = await page.locator('canvas#world').evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  expect(again).toBe(once);
});

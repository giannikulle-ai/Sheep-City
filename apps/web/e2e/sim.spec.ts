import { expect, test, type Page } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

// The real sim in the app (#28): the world runs from packages/sim on the fixed accumulator, the
// fixture only appears behind ?fixture=1, the farm saves itself and comes back after a reload
// on the same day, and a long absence is caught up at actor resolution, capped at one sim-day.
type WithApp = { sheepcliff: SheepcliffApi };
const api = (page: Page) => page.evaluate(() => (window as unknown as WithApp).sheepcliff);

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  return errors;
}

const snapshot = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as WithApp).sheepcliff.sim();
    return { seed: s.seed, tick: s.clock.tick, t: s.clock.t, day: s.clock.dayCount, sheep: s.sheep.map((q) => [q.id, Math.round(q.x), Math.round(q.y)]), luna: [Math.round(s.luna.x), Math.round(s.luna.y)] };
  });

test('the sim runs: ticks advance on the 100 ms accumulator and the flock moves', async ({ page }) => {
  const errors = await open(page, '?seed=1&weather=sun');
  const a = await snapshot(page);
  expect(a.seed).toBe(1);
  await page.waitForTimeout(1200);
  const b = await snapshot(page);
  // about ten ticks a second, never more than the wall clock allows
  expect(b.tick - a.tick).toBeGreaterThanOrEqual(8);
  expect(b.tick - a.tick).toBeLessThanOrEqual(16);
  expect(b.t).toBeGreaterThan(a.t);
  // it is the seeded sim, not the fixture: seed 2 places the flock elsewhere
  await open(page, '?seed=2&weather=sun');
  const c = await snapshot(page);
  expect(c.sheep).not.toEqual(a.sheep);
  expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.save.saving())).toBe(false);
  expect(errors).toEqual([]);
});

test('the fixture still only behind ?fixture=1', async ({ page }) => {
  await open(page, '?fixture=1&t=0.18&weather=sun&now=100000');
  const still = await page.evaluate(() => {
    const v = (window as unknown as WithApp).sheepcliff.view();
    return { sheep: v.sheep.map((s) => [s.x + 16, s.y + 25]), farmer: !!v.farmer, merchant: !!v.merchant };
  });
  // the fixture's flock, by its fixed foot points, with both NPCs on the field
  expect(still.sheep[0]).toEqual([150, 250]);
  expect(still.farmer && still.merchant).toBe(true);
  await open(page, '?seed=1&weather=sun&t=0.18');
  const live = await page.evaluate(() => {
    const v = (window as unknown as WithApp).sheepcliff.view();
    return { sheep: v.sheep.map((s) => [s.x + 16, s.y + 25]), farmer: !!v.farmer };
  });
  expect(live.sheep[0]).not.toEqual([150, 250]);
  expect(live.farmer).toBe(false);
});

test('the farm saves every sim-minute and on visibilitychange, and a reload continues the same day', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.save.saving())).toBe(true);
  // a visible save on load, then move the clock so the day is recognisable
  expect(await page.evaluate(() => localStorage.getItem('sheepcliff-save') !== null)).toBe(true);
  await page.evaluate(() => (window as unknown as WithApp).sheepcliff.send({ type: 'setClock', t: 0.6 }));
  await page.waitForTimeout(400);
  const before = await snapshot(page);
  expect(before.t).toBeGreaterThan(0.59);

  // hide the tab: that is a save
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sheepcliff-save') ?? 'null') as { format: string; savedAt: number; save: { version: number; world: { clock: { t: number } } } });
  expect(stored.format).toBe('sheepcliff-web-save');
  // the sim's current schema version (`SAVE_VERSION`, stamped on every state), never a literal;
  // read off the page because the sim's balance JSON cannot be imported by the Playwright runner
  expect(stored.save.version).toBe(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().version));
  expect(stored.save.world.clock.t).toBeGreaterThan(0.59);
  await expect(page.locator('#status')).toContainText('saved (tab hidden)');

  // reload: the same seed, the same day, ticks continue, positions carry over
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  const after = await snapshot(page);
  expect(after.seed).toBe(before.seed);
  expect(after.day).toBe(before.day);
  expect(after.tick).toBeGreaterThanOrEqual(before.tick);
  expect(after.tick - before.tick).toBeLessThan(60);
  expect(after.t).toBeGreaterThanOrEqual(before.t);
  expect(after.sheep.map((s) => s[0])).toEqual(before.sheep.map((s) => s[0]));
  await expect(page.locator('#say')).toContainText('the farm continues where it was');

  // a sim-minute later the save is fresh again
  await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.setDayLength(180));
  const stampBefore = stored.savedAt;
  await expect
    .poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('sheepcliff-save') ?? '{}') as { savedAt?: number }).savedAt ?? 0), { timeout: 90_000, intervals: [2000] })
    .toBeGreaterThan(stampBefore);
  await expect(page.locator('#status')).toContainText(/saved \((sim-minute|load)\)/);
  expect(errors).toEqual([]);
});

test('offline catch-up runs the time away, capped at one sim-day, and says so', async ({ page }) => {
  await open(page);
  // two hours away, written into the save as if by an earlier visit
  const text = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.save.text());
  const env = JSON.parse(text) as { savedAt: number; save: { world: { clock: { tick: number; dayCount: number } } } };
  const tickBefore = env.save.world.clock.tick;
  env.savedAt = Date.now() - 2 * 3600_000;
  // a QA seed stops the page saving, so the unload does not overwrite the planted save
  await page.evaluate((t) => {
    (window as unknown as WithApp).sheepcliff.qa.seed(1);
    localStorage.setItem('sheepcliff-save', t);
  }, JSON.stringify(env));
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  const after = await snapshot(page);
  // one sim-day is 180 s, 1800 ticks: the cap
  expect(after.tick - tickBefore).toBeGreaterThanOrEqual(1800);
  expect(after.tick - tickBefore).toBeLessThan(1900);
  expect(after.day).toBe(env.save.world.clock.dayCount + 1);
  await expect(page.locator('#say')).toContainText(/^while you were gone \(2 h 00 min, the farm ran one day of it\): .* · [☀☂❄☾] \d\d:\d\d  \d+ sheep  \d+ wool  \d+ coins  -?\d+°$/);

  // a shorter absence runs exactly that long
  const text2 = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.save.text());
  const env2 = JSON.parse(text2) as { savedAt: number; save: { world: { clock: { tick: number } } } };
  env2.savedAt = Date.now() - 30_000;
  await page.evaluate((t) => {
    (window as unknown as WithApp).sheepcliff.qa.seed(1);
    localStorage.setItem('sheepcliff-save', t);
  }, JSON.stringify(env2));
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  const after2 = await snapshot(page);
  expect(after2.tick - env2.save.world.clock.tick).toBeGreaterThanOrEqual(300);
  expect(after2.tick - env2.save.world.clock.tick).toBeLessThan(330);
  await expect(page.locator('#say')).toContainText('while you were gone (30 s)');
});

test('the save exports as text in the page and loads back from it', async ({ page }) => {
  // portrait: the tray, with its farm bar, sits under the scene instead of in the landscape drawer
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.locator('#saveText').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);
  const text = await page.locator('#saveTextArea').inputValue();
  expect((JSON.parse(text) as { format: string }).format).toBe('sheepcliff-web-save');
  // a broken paste is refused with the sim's error code, the farm keeps running
  await page.locator('#saveTextArea').fill('{"format":"sheepcliff-web-save","savedAt":1,"save":{"format":"nope","version":3,"world":{}}}');
  await page.locator('#modalBox button', { hasText: 'load this text' }).click();
  await expect(page.locator('#saveLoadMsg')).toContainText('not loaded: bad-format');
  // the real text loads
  await page.locator('#saveTextArea').fill(text);
  await page.locator('#modalBox button', { hasText: 'load this text' }).click();
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
  // the text was taken a moment ago: a load under a second continues, over a second is a short absence
  await expect(page.locator('#say')).toContainText(/loaded: the farm continues where it was|while you were gone \(\d s\)/);
  // an unreadable stored save is set aside, and a new farm starts
  await page.evaluate(() => {
    (window as unknown as WithApp).sheepcliff.qa.seed(1); // stop the page saving over the planted text on unload
    localStorage.setItem('sheepcliff-save', 'garbage');
  });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  await expect(page.locator('#say')).toContainText('could not be read (not-a-save)');
  expect(await page.evaluate(() => localStorage.getItem('sheepcliff-save.unreadable'))).toBe('garbage');
  expect(await page.evaluate(() => localStorage.getItem('sheepcliff-save') !== 'garbage')).toBe(true);
});

test('the tray grows with the flock', async ({ page }) => {
  await open(page, '?seed=1&weather=sun');
  await expect(page.locator('#who .chip')).toHaveCount(5 + 5);
  const before = await api(page).then(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep.length));
  expect(before).toBe(5);
  // a lamb, then fast time until it grows up (lambGrowMs from the balance file)
  await page.evaluate(() => (window as unknown as WithApp).sheepcliff.send({ type: 'sheepAction', action: 'lamb', target: 'flock' }));
  // `send` queues the intent for the next tick boundary, so wait for the lamb to be in the world
  // before taking the save: a save taken in the same breath does not hold it, and the day below
  // would then only ever grow whatever lamb the seed happens to bear on its own.
  await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep.reduce((n, q) => n + q.lambs.length, 0))).toBe(1);
  const grown = await page.evaluate(() => {
    const w = window as unknown as WithApp;
    const day = w.sheepcliff.sim().clock.periodSec;
    // the same catch-up path a long absence takes: one sim-day at actor resolution
    const text = w.sheepcliff.save.text();
    const env = JSON.parse(text) as { savedAt: number };
    env.savedAt = Date.now() - day * 1000;
    w.sheepcliff.save.load(JSON.stringify(env));
    return w.sheepcliff.sim().sheep.length;
  });
  // the planted lamb grew up (90 s into a 180 s day); any lamb the flock had on its own is extra
  expect(grown).toBeGreaterThanOrEqual(6);
  await expect(page.locator('#who .chip')).toHaveCount(grown + 5);
  await expect(page.locator('#who button[data-who="sheep-5"]')).toContainText('Willow');
});

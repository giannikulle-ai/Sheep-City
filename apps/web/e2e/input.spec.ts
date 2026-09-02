import { expect, test, type Page } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

// Input and the pin overlay (#7): three taps send intents, a pin lists with world coordinates
// and exports as text in a modal. Runs at a phone-sized portrait viewport, where the scene is
// full width on top and the tray sits below.
const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

type WithMoments = { __moments: { kind: string; actor?: string; detail?: string }[] };
// page-side: the API the app hangs on window (typed in src/api.ts)
type WithApp = { sheepcliff: SheepcliffApi };

// explicit sun: in season mode the sim may roll rain on its first tick, which moves DL to the barn door
async function open(page: Page, query = '?seed=1&weather=sun'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    const w = window as unknown as WithMoments;
    w.__moments = [];
    // the contract says window; the app dispatches on document with bubbling, so both hear it
    window.addEventListener('moment', (e) => w.__moments.push((e as CustomEvent).detail));
  });
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  return errors;
}

/** Click the stage at a world pixel. */
async function tapWorld(page: Page, wx: number, wy: number): Promise<void> {
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('no stage');
  await page.mouse.click(box.x + (wx * box.width) / 640, box.y + (wy * box.height) / 400);
}

const worldHash = (page: Page) =>
  page.locator('canvas#world').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let h = 0;
    for (let i = 0; i < data.length; i += 4) h = (h * 31 + ((data[i] ?? 0) << 16) + ((data[i + 1] ?? 0) << 8) + (data[i + 2] ?? 0)) | 0;
    return h;
  });

test.describe('portrait phone', () => {
  test.use({ viewport: PORTRAIT, deviceScaleFactor: 1 });

  test('scene full width on top, tray below; the world canvas stays 640 by 400', async ({ page }) => {
    const errors = await open(page);
    const stage = await page.locator('#stage').boundingBox();
    const tray = await page.locator('#tray').boundingBox();
    if (!stage || !tray) throw new Error('layout missing');
    expect(stage.x).toBe(0);
    expect(stage.width).toBe(PORTRAIT.width);
    expect(Math.round(stage.height)).toBe(Math.round(PORTRAIT.width / 1.6));
    expect(tray.y).toBeGreaterThanOrEqual(stage.y + stage.height);
    expect(tray.width).toBe(PORTRAIT.width);
    const size = await page.locator('canvas#world').evaluate((el) => [(el as HTMLCanvasElement).width, (el as HTMLCanvasElement).height]);
    expect(size).toEqual([640, 400]);
    expect(errors).toEqual([]);
  });

  test('three taps: pet a sheep, pet Digital Luna, throw a stick', async ({ page }) => {
    const errors = await open(page);
    // the flock is wherever seed 1 put it, and DL's first tick pulls her onto the field: let the
    // sim settle, then read Clover's and DL's sprite centres from the view
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => {
      const v = (window as unknown as WithApp).sheepcliff.view();
      const s = v.sheep[0];
      if (!s) throw new Error('no sheep');
      return { clover: { x: s.x + 16, y: s.y + 13 }, luna: { x: v.luna.x + 22, y: v.luna.y + 20 } };
    });
    await tapWorld(page, at.clover.x, at.clover.y);
    await tapWorld(page, at.luna.x, at.luna.y);
    await tapWorld(page, 320, 250); // open grass

    const intents = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents.map((r) => ({ ...r.intent, sim: r.sim })));
    expect(intents).toHaveLength(3);
    expect(intents[0]).toMatchObject({ type: 'pet', target: 'sheep-0', sim: true });
    expect(intents[1]).toMatchObject({ type: 'pet', target: 'luna', sim: true });
    expect(intents[2]).toMatchObject({ type: 'throwStick', sim: true });
    const stick = intents[2] as { x: number; y: number };
    expect(Math.abs(stick.x - 320)).toBeLessThan(2);
    expect(Math.abs(stick.y - 250)).toBeLessThan(2);

    // the sim answers at its next tick: heart bubbles, DL's tag, the stick on the grass and DL running for it
    await expect
      .poll(() =>
        page.evaluate(() => {
          const v = (window as unknown as WithApp).sheepcliff.view();
          const sim = (window as unknown as WithApp).sheepcliff.sim();
          return { clover: v.sheep[0]?.icon, luna: sim.luna.icon, lunaTag: sim.luna.tagUntilMs > 0, stick: !!sim.luna.stick, anim: v.luna.anim };
        }),
      )
      .toEqual({ clover: 'heart', luna: 'heart', lunaTag: true, stick: true, anim: 'run' });

    // the tray follows the tap: DL's chip is selected and her verbs are listed
    await expect(page.locator('#who .chip.on')).toHaveAttribute('data-who', 'luna');
    await expect(page.locator('#verbs button[data-verb="flop"]')).toBeVisible();
    await expect(page.locator('#say')).toContainText('stick thrown');

    // moments reached window listeners, per the QA contract
    await expect
      .poll(() => page.evaluate(() => (window as unknown as WithMoments).__moments.map((m) => `${m.kind}:${m.actor}:${m.detail}`)))
      .toEqual(expect.arrayContaining(['bubble:Clover:heart', 'bubble:Digital Luna:heart', 'dl-trick:Digital Luna:fetch']));
    expect(errors).toEqual([]);
  });

  test('tray verbs: one sheep, one task; the sky reaches the sim', async ({ page }) => {
    await open(page);
    await page.locator('#who button[data-who="sheep-2"]').click();
    await page.locator('#verbs button[data-verb="rest"]').click();
    await expect(page.locator('#say')).toHaveClass(/waiting/);
    await page.locator('#who button[data-who="flock"]').click();
    await page.locator('#verbs button[data-verb="rest"]').click();
    await page.locator('#who button[data-who="luna"]').click();
    await page.locator('#verbs button[data-verb="flop"]').click();
    await page.locator('#who button[data-who="sky"]').click();
    await page.locator('#verbs button[data-verb="rain"]').click();
    const intents = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents.map((r) => ({ ...r.intent, sim: r.sim })));
    expect(intents).toEqual([
      { type: 'sheepAction', action: 'rest', target: 'sheep-2', sim: false },
      { type: 'sheepAction', action: 'rest', target: 'flock', sim: true },
      { type: 'dlAction', action: 'flop', sim: true },
      { type: 'setWeather', weather: 'rain', sim: true },
    ]);
    // the flock lay down (by day a resting sheep gets up again on a roll, so any still down proves it) and DL flopped, in the sim
    await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep.some((s) => s.resting))).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna.anim)).toBe('flop');
    await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().weather)).toBe('rain');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as WithMoments).__moments.some((m) => m.kind === 'weather' && m.detail === 'rain')))
      .toBe(true);
  });

  test('one pin: freeze, number, coordinates, and the text modal', async ({ page }) => {
    const errors = await open(page);
    await page.locator('#cmode').click();
    await expect(page.locator('#stage')).toHaveClass(/commenting/);
    await expect(page.locator('#frozen')).toBeVisible();

    await tapWorld(page, 499, 276); // by the lantern
    const pin = page.locator('#pins .pin');
    await expect(pin).toHaveCount(1);
    await expect(pin).toHaveText('1');
    const note = page.locator('#notes .note');
    await expect(note).toHaveCount(1);
    await expect(note.locator('textarea')).toHaveAttribute('placeholder', /near lantern/);
    await expect(note.locator('.where')).toHaveText('(499, 276)');
    await note.locator('textarea').fill('looks unrealistic');

    // a pin, not a tap: no intent was sent
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents.length)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.pins.list())).toMatchObject([{ near: 'lantern', text: 'looks unrealistic' }]);

    // frozen: the world does not move
    const a = await worldHash(page);
    await page.waitForTimeout(400);
    expect(await worldHash(page)).toBe(a);

    // the export is in the page, whatever the clipboard does
    await page.locator('#ctext').click();
    await expect(page.locator('#modal')).toHaveClass(/show/);
    const text = await page.locator('#pinText').inputValue();
    expect(text.split('\n')[0]).toMatch(/^## Sheepcliff pins — \d\d:\d\d (day|dusk|night|dawn)/);
    expect(text).toContain('1. [lantern] looks unrealistic  (499, 276)');
    expect(text).toBe(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.pins.markdown()));
    await page.locator('#modalBox button', { hasText: 'close' }).click();
    await expect(page.locator('#modal')).not.toHaveClass(/show/);

    // done pinning and unfreeze: the world moves again
    await page.locator('#cmode').click();
    await page.locator('#cfreeze').click();
    await expect(page.locator('#frozen')).toBeHidden();
    await page.waitForTimeout(400);
    expect(await worldHash(page)).not.toBe(a);
    expect(errors).toEqual([]);
  });
});

test.describe('landscape phone', () => {
  test.use({ viewport: LANDSCAPE, deviceScaleFactor: 1 });

  test('the scene fills the height and the tray slides over it', async ({ page }) => {
    await open(page);
    const stage = await page.locator('#stage').boundingBox();
    if (!stage) throw new Error('no stage');
    expect(Math.round(stage.height)).toBe(LANDSCAPE.height);
    expect(Math.round(stage.width)).toBe(Math.round(LANDSCAPE.height * 1.6));
    // closed: the tray is off screen to the right
    const closed = await page.locator('#tray').boundingBox();
    expect(closed && closed.x >= LANDSCAPE.width).toBe(true);
    await page.locator('#trayToggle').click();
    await expect(page.locator('#who button[data-who="luna"]')).toBeVisible();
    // the drawer slides in over 0.2 s; wait for it to settle inside the viewport
    const right = async () => {
      const b = await page.locator('#tray').boundingBox();
      return b ? b.x + b.width : Infinity;
    };
    await expect.poll(right).toBeLessThanOrEqual(LANDSCAPE.width);
    const open_ = await page.locator('#tray').boundingBox();
    if (!open_) throw new Error('no tray');
    expect(open_.x).toBeGreaterThan(LANDSCAPE.width / 3);
    expect(open_.width).toBeLessThanOrEqual(400);
    // taps still land on the scene beside the tray: pet DL wherever she sits
    const luna = await page.evaluate(() => {
      const l = (window as unknown as WithApp).sheepcliff.view().luna;
      return { x: l.x + 22, y: l.y + 20 };
    });
    await tapWorld(page, luna.x, luna.y);
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents[0]?.intent)).toMatchObject({ type: 'pet', target: 'luna' });
  });
});

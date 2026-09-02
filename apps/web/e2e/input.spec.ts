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
    // Fix the world before asking anything of it (#37). The sim refuses `throwStick` in rain, in
    // the barn, on a sheep's back, in bed, and off the field, so the test pins every one of those:
    // seed 1 on the QA virtual clock (only `step` moves time from here), sun in manual weather (no
    // rain roll), mid-morning (bed is a dusk routine), and five ticks so DL's first tick has
    // pulled her onto the field. Each tap then lands on a tick the test runs itself, and the
    // assertions read the sim's state on that tick, not whatever a wall clock allowed.
    await page.evaluate(() => {
      const a = (window as unknown as WithApp).sheepcliff;
      a.qa.seed(1);
      a.qa.setWeather('sun');
      a.qa.setClock(0.18);
      a.qa.step(30);
    });
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));

    // Clover and DL are wherever seed 1 put them: read each sprite's centre from the view just
    // before its tap, and run one tick after it so the sim's hit test sees the same positions
    const clover = await page.evaluate(() => {
      const s = (window as unknown as WithApp).sheepcliff.view().sheep[0];
      if (!s) throw new Error('no sheep');
      return { x: s.x + 16, y: s.y + 13 };
    });
    await tapWorld(page, clover.x, clover.y);
    await tick();
    const luna = await page.evaluate(() => {
      const l = (window as unknown as WithApp).sheepcliff.view().luna;
      return { x: l.x + 22, y: l.y + 20 };
    });
    await tapWorld(page, luna.x, luna.y);
    await tick();

    // the throw is legal here, and the test says so before it throws: a failure names the refusal
    // that fired instead of a null stick. (320, 250) is open grass well inside the field ellipse.
    const before = await page.evaluate(() => {
      const s = (window as unknown as WithApp).sheepcliff.sim();
      return { rain: s.weather.rain, inBarn: s.luna.inBarn, riding: s.luna.riding, routine: s.luna.routine, stick: s.luna.stick };
    });
    expect(before).toEqual({ rain: false, inBarn: false, riding: null, routine: null, stick: null });
    await tapWorld(page, 320, 250);
    await tick();

    // every tap became the sim's click at the tapped world point; the sim did the hit-testing
    // (the QA hooks above sent their weather and clock through the same log, so read the taps)
    const intents = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents.map((r) => ({ ...r.intent, sim: r.sim })));
    expect(intents.filter((r) => r.type === 'tap')).toHaveLength(3);
    expect(intents).toHaveLength(5);
    const taps = intents.slice(2);
    for (const [i, want] of [clover, luna, { x: 320, y: 250 }].entries()) {
      expect(taps[i]).toMatchObject({ type: 'tap', sim: true });
      const tap = taps[i] as { x: number; y: number };
      expect(Math.abs(tap.x - want.x)).toBeLessThan(2);
      expect(Math.abs(tap.y - want.y)).toBeLessThan(2);
    }
    // and the sim's own hit test read them as a pet, a pet, and a stick: heart bubbles (1600 ms,
    // two ticks ago at most), DL's tag, the stick on the grass with DL running for it
    const after = await page.evaluate(() => {
      const v = (window as unknown as WithApp).sheepcliff.view();
      const s = (window as unknown as WithApp).sheepcliff.sim();
      return {
        clover: v.sheep[0]?.icon,
        luna: s.luna.icon,
        lunaTag: s.luna.tagUntilMs > s.clock.nowMs,
        stick: s.luna.stick,
        anim: s.luna.anim,
        drawn: v.stick,
      };
    });
    expect(after).toMatchObject({ clover: 'heart', luna: 'heart', lunaTag: true, anim: 'run', stick: { phase: 'out' } });
    expect(Math.abs((after.stick?.x ?? 0) - 320)).toBeLessThan(2);
    expect(Math.abs((after.stick?.y ?? 0) - 250)).toBeLessThan(2);
    expect(after.drawn).not.toBeNull();

    // the tray follows the tap: DL's chip is selected and her verbs are listed
    await expect(page.locator('#who .chip.on')).toHaveAttribute('data-who', 'luna');
    await expect(page.locator('#verbs button[data-verb="flop"]')).toBeVisible();
    await expect(page.locator('#say')).toContainText(/tap at \(320, 2(49|50)\)/);

    // moments reached window listeners, per the QA contract
    const moments = await page.evaluate(() => (window as unknown as WithMoments).__moments.map((m) => `${m.kind}:${m.actor}:${m.detail}`));
    expect(moments).toEqual(expect.arrayContaining(['bubble:Clover:heart', 'bubble:Digital Luna:heart', 'dl-trick:Digital Luna:fetch']));
    expect(errors).toEqual([]);
  });

  test('a tap on the grass in rain is the sim refusing the throw, not a lost stick', async ({ page }) => {
    // the other side of the rule above: same seed, same clock, rain instead of sun. DL is running
    // for the barn door, and the sim keeps the click (the intent went in) but throws nothing.
    await open(page);
    await page.evaluate(() => {
      const a = (window as unknown as WithApp).sheepcliff;
      a.qa.seed(1);
      a.qa.setWeather('rain');
      a.qa.setClock(0.18);
      a.qa.step(30);
    });
    await tapWorld(page, 320, 250);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));
    const after = await page.evaluate(() => {
      const a = (window as unknown as WithApp).sheepcliff;
      const s = a.sim();
      return { tap: a.intents.at(-1)?.intent, sim: a.intents.at(-1)?.sim, rain: s.weather.rain, routine: s.luna.routine, stick: s.luna.stick, drawn: a.view().stick };
    });
    expect(after).toMatchObject({ tap: { type: 'tap' }, sim: true, rain: true, routine: 'shelterWait', stick: null, drawn: null });
    await expect(page.locator('#say')).toContainText(/tap at \(320, 2(49|50)\)/);
    const moments = await page.evaluate(() => (window as unknown as WithMoments).__moments.map((m) => `${m.kind}:${m.detail}`));
    expect(moments).not.toContain('dl-trick:fetch');
  });

  test('tray verbs: one sheep, one task; the sky reaches the sim', async ({ page }) => {
    await open(page);
    await page.locator('#who button[data-who="sheep-2"]').click();
    await page.locator('#verbs button[data-verb="rest"]').click();
    await expect(page.locator('#say')).not.toHaveClass(/waiting/);
    // Biscuit lay down in the sim (by day a resting sheep gets up again on a roll, so look at once)
    await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep[2]?.resting)).toBe(true);
    await page.locator('#who button[data-who="luna"]').click();
    await page.locator('#verbs button[data-verb="flop"]').click();
    await page.locator('#who button[data-who="farm"]').click();
    await page.locator('#verbs button[data-verb="bird"]').click();
    await expect(page.locator('#say')).toHaveClass(/waiting/);
    await page.locator('#who button[data-who="sky"]').click();
    await page.locator('#verbs button[data-verb="rain"]').click();
    const intents = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents.map((r) => ({ ...r.intent, sim: r.sim })));
    expect(intents).toEqual([
      { type: 'sheepAction', action: 'rest', target: 'sheep-2', sim: true },
      { type: 'dlAction', action: 'flop', sim: true },
      { type: 'farmAction', action: 'bird', sim: false },
      { type: 'setWeather', weather: 'rain', sim: true },
    ]);
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
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.intents[0]?.intent)).toMatchObject({ type: 'tap' });
    await expect.poll(() => page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna.icon)).toBe('heart');
  });
});

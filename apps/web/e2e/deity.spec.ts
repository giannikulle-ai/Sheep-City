import { expect, test, type Page } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

// Deity powers in the tray (#44): the sky's weather chips and each selected creature's act verbs.
// Every assertion reads a tick this test itself ran with `qa.step` (the rule input.spec.ts already
// follows, #55), never a wall-clock poll, so "within one second" is asserted the same way the rest
// of the client's e2e suite does: one QA tick (`qa.step(6)`, ~100 ms of render clock) is already
// the sim's own reaction time, and the flourish (checked separately below) draws before that, on
// the very frame the tap is sent.
const PORTRAIT = { width: 390, height: 844 };

type WithApp = { sheepcliff: SheepcliffApi };
type WithMoments = { __moments: { kind: string; actor?: string; detail?: string }[] };

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as WithMoments;
    w.__moments = [];
    window.addEventListener('moment', (e) => w.__moments.push((e as CustomEvent).detail));
  });
  await page.goto('/?seed=1&weather=sun');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
}

/** Click the stage at a world pixel. */
async function tapWorld(page: Page, wx: number, wy: number): Promise<void> {
  const box = await page.locator('#stage').boundingBox();
  if (!box) throw new Error('no stage');
  await page.mouse.click(box.x + (wx * box.width) / 640, box.y + (wy * box.height) / 400);
}

test.describe('deity powers', () => {
  test.use({ viewport: PORTRAIT, deviceScaleFactor: 1 });

  test('the sky\'s five weather chips each reach the sim within a tick, and a second tap clears the hold', async ({ page }) => {
    await open(page);
    // `qa.seed` replays the page's own boot intents (seed 1, sun, manual weather) onto a fresh
    // state, the same reset-to-a-known-point `input.spec.ts` relies on.
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));

    await page.locator('#who button[data-who="sky"]').click();

    await page.locator('#verbs button[data-verb="rain"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.kind)).toBe('rain');

    await page.locator('#verbs button[data-verb="snow"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.kind)).toBe('snow');

    await page.locator('#verbs button[data-verb="fog"]').click();
    await tick();
    // fog is a flag over whatever kind is already there: the snow above is untouched
    const fogged = await page.evaluate(() => {
      const w = (window as unknown as WithApp).sheepcliff.sim().weather;
      return { kind: w.kind, foggy: w.foggy };
    });
    expect(fogged).toEqual({ kind: 'snow', foggy: true });
    // the client renders the dim from the same flag (packages/render's drawFogDim)
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().foggy)).toBe(true);

    await page.locator('#verbs button[data-verb="sun"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.kind)).toBe('sun');

    await page.locator('#verbs button[data-verb="clear"]').click();
    await tick();
    const cleared = await page.evaluate(() => {
      const w = (window as unknown as WithApp).sheepcliff.sim().weather;
      return { kind: w.kind, foggy: w.foggy };
    });
    expect(cleared).toEqual({ kind: 'sun', foggy: false });

    // a second tap on the same, still-active chip clears the override instead of asking for it again
    await page.locator('#verbs button[data-verb="rain"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.kind)).toBe('rain');
    await expect(page.locator('#verbs button[data-verb="rain"]')).toHaveClass(/\bon\b/);
    await page.locator('#verbs button[data-verb="rain"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.kind)).toBe('sun');
    await expect(page.locator('#verbs button[data-verb="rain"]')).not.toHaveClass(/\bon\b/);

    const moments = await page.evaluate(() => (window as unknown as WithMoments).__moments.map((m) => `${m.kind}:${m.detail}`));
    expect(moments).toEqual(expect.arrayContaining(['deity:rain', 'deity:snow', 'deity:fog', 'deity:sun', 'deity:clear']));
  });

  test('a sky tap draws its ripple flourish at once, on the frame the tap lands', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    await page.locator('#who button[data-who="sky"]').click();
    const before = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().skyRippleUntil ?? 0);
    await page.locator('#verbs button[data-verb="rain"]').click();
    // one QA frame, not a whole tick: the flourish is a client-side reaction, not the sim's
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(1));
    const after = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().skyRippleUntil ?? 0);
    expect(after).toBeGreaterThan(before);
  });

  test('every act verb on a sheep produces the sim\'s own reaction within a tick, plus a ring flourish', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));

    await page.locator('#who button[data-who="sheep-1"]').click();

    await page.locator('#verbs button[data-verb="treat"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep[1]?.icon)).toBe('heart');
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().sheep[1]?.ringUntil ?? 0)).toBeGreaterThan(0);

    await page.locator('#verbs button[data-verb="startle"]').click();
    await tick();
    // the sim's own icon for startle has no renderer frame yet (PR #73's own weak spot); the ring
    // flourish is this verb's visible reaction on screen today
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep[1]?.icon)).toBe('startle');

    await page.locator('#verbs button[data-verb="calm"]').click();
    await tick();
    // calm shows no bubble on a sheep at all (behaviours/sheep.ts); the ring is the only reaction
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().sheep[1]?.resting)).toBe(true);

    // call: the verb asks the stage for a point instead of sending anything itself
    await page.locator('#verbs button[data-verb="call"]').click();
    await expect(page.locator('#say')).toHaveClass(/waiting/);
    await expect(page.locator('#stage')).toHaveClass(/awaiting-call/);
    await tapWorld(page, 300, 260);
    await expect(page.locator('#stage')).not.toHaveClass(/awaiting-call/);
    await tick();
    const target = await page.evaluate(() => {
      const s = (window as unknown as WithApp).sheepcliff.sim().sheep[1];
      return s ? { tx: s.tx, ty: s.ty } : null;
    });
    expect(Math.abs((target?.tx ?? -1000) - 300)).toBeLessThan(2);
    expect(Math.abs((target?.ty ?? -1000) - 260)).toBeLessThan(2);

    const moments = await page.evaluate(() => (window as unknown as WithMoments).__moments.map((m) => `${m.kind}:${m.detail}`));
    expect(moments).toEqual(expect.arrayContaining(['deity:treat', 'deity:startle', 'deity:calm', 'deity:call']));
  });

  test('treat, calm and startle on Digital Luna are a friendly no-op, never harm; call walks her to the point', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6)); // let her settle out of any boot routine

    // the tray already has Digital Luna selected by default. treat, calm and startle first, while
    // she is free — `call` (below) sends her walking, and the `act` chain waits for her to be free
    // again before it will run a later verb, the same as any other command queues behind a walk.
    await page.locator('#verbs button[data-verb="treat"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna.icon)).toBe('heart');

    await page.locator('#verbs button[data-verb="calm"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna.icon)).toBe('heart');

    await page.locator('#verbs button[data-verb="startle"]').click();
    await tick();
    // startle on Digital Luna is a head-tilt, never a scatter or a forced position (CLAUDE.md: she
    // cannot be harmed)
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna.anim)).toBe('tilt');

    await page.locator('#verbs button[data-verb="call"]').click();
    await tapWorld(page, 420, 300);
    await tick();
    const luna = await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().luna);
    expect(Math.abs((luna.target?.x ?? -1000) - 420)).toBeLessThan(2);
    expect(Math.abs((luna.target?.y ?? -1000) - 300)).toBeLessThan(2);
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.view().luna.ringUntil ?? 0)).toBeGreaterThan(0);
  });

  // --- fix round 1 (after the Verifier's review of PR #90) --------------------------------------
  // The chip's `.on` state now reads `sim().weather` fresh every frame (tray.ts's `syncWeather`)
  // instead of remembering the last tap, so it can never fall out of step with a hold that expired
  // on its own or a `foggy` flag the tray didn't set itself. Both tests below run the QA clock far
  // enough to prove it — no `waitForTimeout`, per the ticket (#55).

  test("a hold that hands back on its own un-lights its chip, so the next tap asks for the kind again instead of clearing it (Verifier's blocker; also the owner's 3-world-hour hand-back, 2026-09-08)", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));

    await page.locator('#who button[data-who="sky"]').click();
    await page.locator('#verbs button[data-verb="rain"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.mode)).toBe('manual');
    await expect(page.locator('#verbs button[data-verb="rain"]')).toHaveClass(/\bon\b/);

    // Run well past the hold — 3 world-hours at the default 180 s day is 22.5 real seconds
    // (`deityWeatherHoldMinutes`, actions.ts) — purely on the QA clock (qa.step), never a wall wait.
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(1500));
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.mode)).toBe('season');
    // The Verifier's blocker: the old `activeWeather` memory kept the chip lit here, so the next tap
    // on it sent `clear` instead of `rain` and the player saw nothing happen. It must read unlit now.
    await expect(page.locator('#verbs button[data-verb="rain"]')).not.toHaveClass(/\bon\b/);

    await page.locator('#verbs button[data-verb="rain"]').click();
    await tick();
    const rained = await page.evaluate(() => {
      const w = (window as unknown as WithApp).sheepcliff.sim().weather;
      return { kind: w.kind, mode: w.mode };
    });
    expect(rained).toEqual({ kind: 'rain', mode: 'manual' }); // a fresh hold, not a no-op `clear`
    await expect(page.locator('#verbs button[data-verb="rain"]')).toHaveClass(/\bon\b/);
  });

  test("fog is its own lit chip, independent of the kind chip underneath it, and the status line says so too (Verifier's other blocker)", async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));
    const tick = () => page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.step(6));

    await page.locator('#who button[data-who="sky"]').click();

    await page.locator('#verbs button[data-verb="fog"]').click();
    await tick();
    expect(await page.evaluate(() => (window as unknown as WithApp).sheepcliff.sim().weather.foggy)).toBe(true);
    await expect(page.locator('#verbs button[data-verb="fog"]')).toHaveClass(/\bon\b/);
    // fog leaves `kind` untouched (still the boot's `sun`), and that also puts `sun` in the same
    // deity hold as `fog` — the sim has no field that tells the two taps apart (`applyWeather`,
    // packages/sim/intents.ts), so, per the ticket's own rule, the tray correctly reads both as lit.
    await expect(page.locator('#verbs button[data-verb="sun"]')).toHaveClass(/\bon\b/);

    // `snow` never touches `foggy` (packages/sim's `applyWeather`): the world is still fogged, and
    // now the tray must show both — not five mutually-exclusive chips, a kind plus an independent flag.
    await page.locator('#verbs button[data-verb="snow"]').click();
    await tick();
    const afterSnow = await page.evaluate(() => {
      const w = (window as unknown as WithApp).sheepcliff.sim().weather;
      return { kind: w.kind, foggy: w.foggy };
    });
    expect(afterSnow).toEqual({ kind: 'snow', foggy: true });
    await expect(page.locator('#verbs button[data-verb="fog"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#verbs button[data-verb="snow"]')).toHaveClass(/\bon\b/);
    await expect(page.locator('#verbs button[data-verb="sun"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#status')).toContainText('foggy');

    // Tapping the lit fog chip must un-fog. The sim has no fog-only "off" yet (issue #43 sim ask,
    // see the PR note), so this falls back to the same full `clear` any other lit chip sends — which
    // also drops the sun hold, a known and documented trade-off, not a silent surprise.
    await page.locator('#verbs button[data-verb="fog"]').click();
    await tick();
    const afterClear = await page.evaluate(() => {
      const w = (window as unknown as WithApp).sheepcliff.sim().weather;
      return { kind: w.kind, foggy: w.foggy };
    });
    expect(afterClear).toEqual({ kind: 'sun', foggy: false });
    await expect(page.locator('#verbs button[data-verb="fog"]')).not.toHaveClass(/\bon\b/);
    await expect(page.locator('#status')).not.toContainText('foggy');
  });

  test('a pending `call` clears when the tray selection changes, instead of resolving on the newly-selected creature (fix round 1 on #44)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));

    await page.locator('#who button[data-who="sheep-1"]').click();
    await page.locator('#verbs button[data-verb="call"]').click();
    await expect(page.locator('#stage')).toHaveClass(/awaiting-call/);
    await expect(page.locator('#say')).toHaveClass(/waiting/);

    await page.locator('#who button[data-who="luna"]').click();
    await expect(page.locator('#stage')).not.toHaveClass(/awaiting-call/);
    await expect(page.locator('#say')).not.toHaveClass(/waiting/);

    // the same chip re-selecting itself (a lamb growing up rebuilds the flock chips, tray.ts's
    // `setWhos`) must not interrupt a call still pending on it
    await page.locator('#verbs button[data-verb="call"]').click();
    await expect(page.locator('#stage')).toHaveClass(/awaiting-call/);
    await page.locator('#who button[data-who="luna"]').click();
    await expect(page.locator('#stage')).toHaveClass(/awaiting-call/);
  });
});

test.describe('deity powers, landscape', () => {
  const LANDSCAPE = { width: 844, height: 390 };
  test.use({ viewport: LANDSCAPE, deviceScaleFactor: 1 });

  test('a pending `call` clears when the tray closes (fix round 1 on #44)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as unknown as WithApp).sheepcliff.qa.seed(1));

    await page.locator('#trayToggle').click(); // open the landscape drawer
    await page.locator('#who button[data-who="sheep-1"]').click();
    await page.locator('#verbs button[data-verb="call"]').click();
    await expect(page.locator('#stage')).toHaveClass(/awaiting-call/);

    await page.locator('#trayToggle').click(); // close it
    await expect(page.locator('#stage')).not.toHaveClass(/awaiting-call/);
  });
});

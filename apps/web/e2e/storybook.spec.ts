import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';
import { e2eDir, expectGolden } from './lib/golden';

// The storybook page (issue #42). ?gap=<minutes> (query.ts) forces a catch-up on a fresh scratch
// world of that many real (wall-clock) minutes, deterministically — the same unit the real load/wake
// path's awayMs is in (fix round 1: F2 — `?gap=` used to feed a day-length-scaled "sim minutes" unit
// into a title that reads wall-clock ms, so a golden picked to read "a week" was really 3,360 sim-days
// mislabelled; now the query and the real path agree, so a real week away really is `?gap=10080`).
// These two cases stand in for "a night" and "a week": every number here (seed, gap) was picked by
// running the app and reading back window.sheepcliff.storybook until a case with more than one
// picture kind turned up, so the golden shows the renderer handling more than one chronicle picture
// key. The current chronicle only ever writes 'ledger' entries (births, growth, weather, season,
// wool, coins, upgrades — see packages/sim/src/chronicle/ledger-diff.ts), so that is what both pages
// are made of today.
//
// The golden cases carry `freeze=1`, which boots the world with its clock paused so the capture is
// still. A paused clock stops the Ledger's day crossings too, so those worlds tell three lines each
// — fewer than a running farm tells over the same gap. The line-count and "and N more" cases below
// therefore run without `freeze`, where the same seeds tell eight.
type WithApp = { sheepcliff: SheepcliffApi };

interface Case {
  name: string;
  seed: number;
  gapMinutes: number;
  title: string;
  /** the card's subtitle: the real span, then the same gap in the world's own time (#42, the
   * owner's change round — "real and world time") */
  subtitle: string;
}

// 2 real hours, at the default (fast) day length, is hundreds of farm days — always spans the
// world's own night many times over, so `awayTitle` reads it as "a night" (storybook.ts). Two hours
// at a 3-minute day is 40 farm days.
const NIGHT: Case = { name: 'night', seed: 17, gapMinutes: 120, title: 'a night', subtitle: '2 h 00 min · 40 farm days' };
// exactly 7 real days: `awayTitle` reads day counts, and 7 is the one number that reads "a week".
// Seven real days at a 3-minute day is 3,360 farm days.
const WEEK: Case = { name: 'week', seed: 17, gapMinutes: 10_080, title: 'a week', subtitle: '7 d 0 h · 3360 farm days' };

function goldenPath(name: string): string {
  return path.join(e2eDir, 'golden', 'app', `storybook-${name}.png`);
}

for (const c of [NIGHT, WEEK]) {
  test(`storybook page: ${c.name}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`/?seed=${c.seed}&gap=${c.gapMinutes}&freeze=1&t=0.2`);
    await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);

    const card = page.locator('#storybookCard');
    await expect(card).toBeVisible();

    // Every line the page shows must trace to a real chronicle entry id — the storybook only
    // tells; a line without a chronicle entry behind it is a bug (CLAUDE.md). And every entry the
    // gap told must be on the page, shown or kept behind "and N more": nothing a gap told is
    // dropped (issue #42, the owner's change round). This world is fresh and caught up once, so
    // its whole chronicle is exactly this gap's.
    const result = await page.evaluate(() => {
      const app = (window as unknown as WithApp).sheepcliff;
      const sb = app.storybook.current();
      if (!sb) return { ok: false, reason: 'no page shown', title: '', lineCount: 0, moreCount: 0 };
      const told = app.sim().chronicle.entries;
      const ids = new Set(told.map((e) => e.id));
      const bad = [...sb.lines, ...sb.more].filter((l) => !ids.has(l.entryId));
      const kept = sb.lines.length + sb.more.length;
      const reason = bad.length
        ? `unknown entry ids: ${bad.map((l) => l.entryId).join(',')}`
        : kept !== told.length
          ? `page keeps ${kept} of the gap's ${told.length} entries`
          : sb.lines.length < 1
            ? 'no lines shown'
            : '';
      return { ok: reason === '', reason, title: sb.title, lineCount: sb.lines.length, moreCount: sb.more.length };
    });
    expect(result.ok, result.reason).toBe(true);
    // the title and subtitle are the only words the client composes itself (fix round 1, #42: F2) —
    // they must read exactly what this case's real gap supports, not a word or a number the gap does
    // not. The subtitle says the same gap twice: real time, then the world's own time.
    expect(result.title).toBe(c.title);
    await expect(page.locator('#storySubtitle')).toHaveText(c.subtitle);
    testInfo.annotations.push({ type: 'storybook', description: `${result.title}, ${result.lineCount} line(s), ${result.moreCount} more` });

    const buf = await card.screenshot();
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    await expectGolden(page, testInfo, dataUrl, goldenPath(c.name));
  });
}

test('the storybook overlay never appears on a fresh farm', async ({ page }) => {
  await page.goto('/?fresh=1');
  await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
  await page.waitForTimeout(300);
  await expect(page.locator('#storybook')).toBeHidden();
});

test('one tap dismisses the page', async ({ page }) => {
  await page.goto(`/?seed=${NIGHT.seed}&gap=${NIGHT.gapMinutes}&freeze=1`);
  await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
  await expect(page.locator('#storybook')).toBeVisible();
  await page.locator('#storybookCard').click();
  await expect(page.locator('#storybook')).toBeHidden();
});

// The owner's change round on #42: "I want more than 5 … it should be based on how long away, with
// a minimum", and nothing a gap told is dropped. Both run on a *running* world (no `freeze`), where
// seed 17 tells eight lines over either gap — enough for the floor to leave a remainder and for the
// longer absence to show more of it.
test('a longer absence shows more of its gap, and a short one keeps the rest behind "and N more"', async ({ page }) => {
  const read = async (gapMinutes: number): Promise<{ shown: number; more: number; rows: number; moreLabel: string | null }> => {
    await page.goto(`/?seed=17&gap=${gapMinutes}`);
    await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
    await expect(page.locator('#storybookCard')).toBeVisible();
    const counts = await page.evaluate(() => {
      const sb = (window as unknown as WithApp).sheepcliff.storybook.current();
      return { shown: sb?.lines.length ?? 0, more: sb?.more.length ?? 0 };
    });
    const moreEl = page.locator('#storyMore');
    return {
      ...counts,
      rows: await page.locator('#storyLines .storyline').count(),
      moreLabel: (await moreEl.count()) ? await moreEl.innerText() : null,
    };
  };

  // two hours away: the floor, five lines, with the other three kept
  const night = await read(120);
  expect(night.shown).toBe(5);
  expect(night.rows).toBe(5);
  expect(night.more).toBe(3);
  expect(night.moreLabel).toBe('and 3 more');

  // a week away, same seed and the same eight lines: the page grows to hold all of them
  const week = await read(10_080);
  expect(week.shown).toBe(8);
  expect(week.rows).toBe(8);
  expect(week.more).toBe(0);
  expect(week.moreLabel).toBeNull(); // nothing left over, so no row offering it
});

test('"and N more" opens the rest of the gap in place, and never dismisses the page', async ({ page }) => {
  await page.goto('/?seed=17&gap=120');
  await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
  await expect(page.locator('#storybookCard')).toBeVisible();

  const kept = await page.evaluate(() => {
    const app = (window as unknown as WithApp).sheepcliff;
    const sb = app.storybook.current();
    const ids = new Set(app.sim().chronicle.entries.map((e) => e.id));
    return {
      lines: sb?.more.map((l) => l.line) ?? [],
      // every kept line is a real chronicle entry too, not something composed for the expansion
      allTold: (sb?.more ?? []).every((l) => ids.has(l.entryId)),
    };
  });
  expect(kept.allTold).toBe(true);
  expect(kept.lines.length).toBe(3);

  await expect(page.locator('#storyLines .storyline')).toHaveCount(5);
  await page.locator('#storyMore').click();

  // the page is still open — the row that opens the rest must not be the tap that closes the card
  await expect(page.locator('#storybook')).toBeVisible();
  await expect(page.locator('#storyMore')).toHaveCount(0);
  await expect(page.locator('#storyLines .storyline')).toHaveCount(8);

  // and the revealed rows are the kept lines themselves, verbatim, in order
  const revealed = await page.locator('#storyLines .storyline span').allInnerTexts();
  expect(revealed.slice(5)).toEqual(kept.lines);

  // a tap anywhere else still dismisses, expanded or not
  await page.locator('#storybookCard').click();
  await expect(page.locator('#storybook')).toBeHidden();
});

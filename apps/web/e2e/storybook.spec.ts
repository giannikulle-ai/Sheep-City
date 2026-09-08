import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';
import { e2eDir, expectGolden } from './lib/golden';

// The storybook page (issue #42). ?gap=<sim-minutes> (query.ts) forces a catch-up on a fresh
// scratch world, deterministically, so these two cases stand in for "a night" and "a week": every
// number here (seed, gap) was picked by running the app and reading back window.sheepcliff.storybook
// until a case with more than one picture kind turned up, so the golden shows the renderer handling
// more than one chronicle picture key. See storybook.ts for the sim-minutes-to-ms conversion; the
// current chronicle only ever writes 'ledger' entries (births, growth, weather, season — see
// packages/sim/src/chronicle/ledger-diff.ts), so that is what both pages are made of today.
type WithApp = { sheepcliff: SheepcliffApi };

interface Case {
  name: string;
  seed: number;
  gapMinutes: number;
}

const NIGHT: Case = { name: 'night', seed: 42, gapMinutes: 2880 }; // 2 sim-days ≈ 6 real minutes: "a night"
const WEEK: Case = { name: 'week', seed: 17, gapMinutes: 4_838_400 }; // exactly 7 real days: "a week"

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
    // tells; a line without a chronicle entry behind it is a bug (CLAUDE.md).
    const result = await page.evaluate(() => {
      const app = (window as unknown as WithApp).sheepcliff;
      const sb = app.storybook.current();
      if (!sb) return { ok: false, reason: 'no page shown', title: '', lineCount: 0 };
      if (sb.lines.length < 1 || sb.lines.length > 5) return { ok: false, reason: `line count ${sb.lines.length}`, title: sb.title, lineCount: sb.lines.length };
      const ids = new Set(app.sim().chronicle.entries.map((e) => e.id));
      const bad = sb.lines.filter((l) => !ids.has(l.entryId));
      return { ok: bad.length === 0, reason: bad.length ? `unknown entry ids: ${bad.map((l) => l.entryId).join(',')}` : '', title: sb.title, lineCount: sb.lines.length };
    });
    expect(result.ok, result.reason).toBe(true);
    testInfo.annotations.push({ type: 'storybook', description: `${result.title}, ${result.lineCount} line(s)` });

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

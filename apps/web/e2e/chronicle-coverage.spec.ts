import { expect, test, type Page } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

// Issue #49: "the storybook only tells" (CLAUDE.md), proven at the DOM layer, not just the API's
// own objects. `storybook.spec.ts` already checks that every `StorybookLine.entryId` the page's JS
// state carries names a real `sim().chronicle` entry; this file goes one layer further — the actual
// rendered `<span>` text on screen, in order, must equal that entry's own `line`, every id anywhere
// on the card (including behind "and N more" and on a reopened earlier page) must exist in the
// chronicle, and nothing else on the card is client-composed text except the title, the subtitle,
// and the "and N more" row's own label.
type WithApp = { sheepcliff: SheepcliffApi };

/** The two golden cases (`storybook.spec.ts`'s `NIGHT`/`WEEK`): seed 17, the same `?freeze=1&t=0.2`
 * so this reproduces deterministically without touching the goldens themselves (no screenshot is
 * taken here). Picked because they are already the pair pinned to show more than one chronicle
 * picture key — see that file's header comment for how. */
const CASES = [
  { name: 'a night', seed: 17, gapMinutes: 120 },
  { name: 'a week', seed: 17, gapMinutes: 10_080 },
] as const;

interface CardCoverage {
  hasPage: boolean;
  title: string | null;
  subtitle: string | null;
  /** every `{entryId, line}` the page's JS state carries, lines then "more", in the order shown */
  apiLines: { entryId: string; line: string }[];
  shownCount: number;
  /** the rendered `<span>` text of every currently-visible `.storyline` row, in DOM order */
  domRows: (string | null)[];
  moreLabel: string | null;
  /** chronicle entry id -> its own `line` text */
  chronicleById: [string, string][];
  /** any text-bearing element under `#storybookCard` that is none of: `#storyTitle`,
   * `#storySubtitle`, a `.storyline span`, or `#storyMore` — should always be empty */
  strayText: { id: string; tag: string; text: string }[];
}

/** Reads the storybook card at both layers — the page's own JS state and the DOM it painted from
 * it — plus the whole chronicle, so the caller can check the two agree and both trace to real
 * entries. Pure read; no assertions here, so failures show at the call site with a clear message. */
function readCardCoverage(page: Page): Promise<CardCoverage> {
  return page.evaluate(() => {
    const app = (window as unknown as WithApp).sheepcliff;
    const sb = app.storybook.current();
    const entries = app.sim().chronicle.entries;
    const chronicleById = entries.map((e): [string, string] => [e.id, e.line]);

    const knownIds = new Set(['storyTitle', 'storySubtitle', 'storyMore']);
    const strayText: CardCoverage['strayText'] = [];
    document.querySelectorAll('#storybookCard *').forEach((el) => {
      if (el.tagName === 'CANVAS' || el.children.length > 0) return; // leaves only; canvases carry no text anyway
      if (el.tagName === 'SPAN' && el.closest('.storyline')) return; // a chronicle line's own text, checked separately
      if (knownIds.has(el.id)) return;
      const text = (el.textContent ?? '').trim();
      if (text) strayText.push({ id: el.id, tag: el.tagName, text });
    });

    return {
      hasPage: !!sb,
      title: document.querySelector('#storyTitle')?.textContent ?? null,
      subtitle: document.querySelector('#storySubtitle')?.textContent ?? null,
      apiLines: sb ? [...sb.lines, ...sb.more].map((l) => ({ entryId: l.entryId, line: l.line })) : [],
      shownCount: sb ? sb.lines.length : 0,
      domRows: [...document.querySelectorAll('#storyLines .storyline span')].map((s) => s.textContent),
      moreLabel: document.querySelector('#storyMore')?.textContent ?? null,
      chronicleById,
      strayText,
    };
  });
}

/**
 * Every invariant issue #49 asks for, against one already-open card: every id on the card (shown
 * or behind "and N more") is a real chronicle entry, every rendered line's text is exactly that
 * entry's own `line` — not just the API object's, the DOM's — the DOM shows exactly the API's shown
 * lines in order, and nothing on the card is client-written text except the title, the subtitle,
 * and the "and N more" label.
 */
function expectCardTracesToChronicle(c: CardCoverage): void {
  expect(c.hasPage, 'no storybook page is open').toBe(true);
  expect(c.apiLines.length, 'a page with no lines').toBeGreaterThan(0);

  const chronicleIds = new Set(c.chronicleById.map(([id]) => id));
  const chronicleLine = new Map(c.chronicleById);
  for (const l of c.apiLines) {
    expect(chronicleIds.has(l.entryId), `entry id "${l.entryId}" on the page is not in sim().chronicle`).toBe(true);
    expect(l.line, `entry "${l.entryId}"'s rendered line does not match its chronicle text`).toBe(chronicleLine.get(l.entryId));
  }

  // the DOM's own rows are exactly the api's *currently visible* lines' text, in the same order —
  // the renderer paints `l.line` verbatim (storybook-overlay.ts). While the "and N more" button is
  // still on the card, that is `sb.lines` alone: `sb.more`'s lines are real chronicle entries too
  // (checked above, by id) but are not painted until the tap reveals them, at which point the
  // button is gone and every line — shown and more — is on the DOM.
  const visible = c.moreLabel !== null ? c.apiLines.slice(0, c.shownCount) : c.apiLines;
  expect(c.domRows).toEqual(visible.map((l) => l.line));

  // nothing on the card is composed text except the title, the subtitle, and "and N more"
  expect(c.strayText, `unexpected text on the card: ${JSON.stringify(c.strayText)}`).toEqual([]);
}

for (const c of CASES) {
  test(`chronicle coverage: ${c.name} (?gap=${c.gapMinutes})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`/?seed=${c.seed}&gap=${c.gapMinutes}&freeze=1&t=0.2`);
    await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
    if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);

    const before = await readCardCoverage(page);
    expectCardTracesToChronicle(before);

    // if this world's gap left anything behind "and N more", open it and check the same
    // invariants hold for the expanded card too — a line revealed by the tap must trace exactly
    // as one shown from the start
    if (await page.locator('#storyMore').count()) {
      await page.locator('#storyMore').click();
      const expanded = await readCardCoverage(page);
      expectCardTracesToChronicle(expanded);
      expect(expanded.domRows.length).toBe(expanded.apiLines.length);
    }
  });
}

// The "earlier pages" reopen (issue #49): dismiss the page a real gap opened, reopen it from the
// farm bar's list, and check every invariant above holds again — a page read back off the store
// must trace to the chronicle exactly as freshly-shown one does. Uses a *running* world (no
// `freeze`), the same seed 17 / gap 120 pair `storybook.spec.ts`'s "and N more" test measures at
// 5 shown + 50 more = 55 lines — the `MAX_STORED_MORE` cap, not the gap's own total (re-measured
// merging #86 into #101: this gap's real chronicle is 79 entries, up from 34 at #111 alone and 8
// before that; the cap started binding with this merge, since 79 exceeds 5 + 50), so the reopened
// card is exercised with something behind "and N more".
test('reopening a page from "earlier pages" traces to the chronicle exactly as the first showing did', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?seed=17&gap=120');
  await page.waitForFunction(() => document.body.dataset['ready'] === '1', null, { timeout: 15_000 });
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  await expect(page.locator('#storybookCard')).toBeVisible();

  const firstShowing = await readCardCoverage(page);
  expectCardTracesToChronicle(firstShowing);

  // dismiss (one tap anywhere on the card), then reopen the tray and the "earlier pages" list
  await page.locator('#storybookCard').click();
  await expect(page.locator('#storybook')).toBeHidden();
  await page.locator('#trayToggle').click();
  await page.locator('#earlierPages').click();
  await expect(page.locator('#modal')).toHaveClass(/show/);

  const entries = page.locator('.pagelist button');
  await expect(entries).toHaveCount(1); // this world caught up exactly once, so exactly one stored page
  await entries.first().click();

  // the modal closes and the storybook shows again, collapsed to its original shown/more split
  await expect(page.locator('#modal')).not.toHaveClass(/show/);
  await expect(page.locator('#storybook')).toBeVisible();
  const reopened = await readCardCoverage(page);
  expectCardTracesToChronicle(reopened);

  // and it is the very same page, not a fresh selection over the (unchanged) chronicle
  expect(reopened.apiLines).toEqual(firstShowing.apiLines);
  expect(reopened.title).toBe(firstShowing.title);
  expect(reopened.subtitle).toBe(firstShowing.subtitle);
  expect(reopened.shownCount).toBe(5);
  // Re-measured merging #86 into #101: 55 (5 shown + the 50-line `MAX_STORED_MORE` cap — this gap's
  // own chronicle is 79 entries, which the cap now clips). Was 34 at #111 alone (its own real total,
  // uncapped), 8 before that landed.
  expect(reopened.apiLines.length).toBe(55);

  // and the same holds once "and N more" is opened on the reopened card too
  await expect(page.locator('#storyMore')).toHaveCount(1);
  await page.locator('#storyMore').click();
  const reopenedExpanded = await readCardCoverage(page);
  expectCardTracesToChronicle(reopenedExpanded);
  expect(reopenedExpanded.domRows.length).toBe(55); // 5 shown + 50 kept behind the cap
});

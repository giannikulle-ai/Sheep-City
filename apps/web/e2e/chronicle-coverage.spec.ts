import { expect, test, type Page } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

// Issue #49: "the storybook only tells" (CLAUDE.md), proven at the DOM layer, not just the API's
// own objects. `storybook.spec.ts` already checks that every `StorybookLine.entryId` the page's JS
// state carries names a real `sim().chronicle` entry; this file goes one layer further — the actual
// rendered `<span>` text on screen, in order, must equal that entry's own `line`, every id anywhere
// on the card (including behind "and N more" and on a reopened earlier page) must exist in the
// chronicle, and nothing else on the card is client-composed text except the title, the subtitle,
// and the "and N more" row's own label.
//
// #113: a line can now collapse a card told more than once in the gap into one row plus a count
// ("Three crows landed on the hay and Digital Luna sent them packing, four times this week.") —
// `entryIds` (`storybook.ts`'s `lineEntryIds`), not `entryId` alone, is its whole backing set, and
// the rendered text is no longer expected to equal any one entry's own `line` verbatim; it is
// expected to equal every backing entry's own (shared) line, with its trailing period swapped for a
// mechanical count. `expectCardTracesToChronicle` checks that directly rather than relaxing the
// "only tells" invariant: every backing id must be real, every backing entry must carry the exact
// same text a collapsed line claims to summarise, and the count in the suffix must equal how many.
//
// F3 (round 2): `entryIds` is now capped at `MAX_STORED_MORE` (a card's own repeats in one gap have
// no bound, so storing one id per telling forever grows a page's stored size with the length of the
// gap itself) — `count` carries the group's true tally alongside it, always exact regardless of the
// cap. `expectCardTracesToChronicle` traces a collapsed line through *both*: every stored id must be
// real (as before), the suffix's own number must equal `count` — not `entryIds.length`, which can
// now be smaller — and `entryIds.length` itself must equal `Math.min(count, MAX_STORED_MORE)`, never
// more (the cap held) and never less (nothing was dropped ahead of the cap).
const MAX_STORED_MORE = 50;

type WithApp = { sheepcliff: SheepcliffApi };

/** The two golden cases (`storybook.spec.ts`'s `NIGHT`/`WEEK`): seed 17, the same `?freeze=1&t=0.2`
 * so this reproduces deterministically without touching the goldens themselves (no screenshot is
 * taken here). Picked because they are already the pair pinned to show more than one chronicle
 * picture key — see that file's header comment for how. */
const CASES = [
  { name: 'a night', seed: 17, gapMinutes: 120 },
  { name: 'a week', seed: 17, gapMinutes: 10_080 },
] as const;

/** Small counts spelled out, mirroring `storybook.ts`'s own private `SMALL_WORDS` (zero..twenty) —
 * duplicated here only to read a collapsed line's count back out of its rendered text; not a
 * second source of truth the app itself reads from. */
const SMALL_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

interface CardCoverage {
  hasPage: boolean;
  title: string | null;
  subtitle: string | null;
  /** every `{entryId, line, entryIds, count}` the page's JS state carries, lines then "more", in
   * the order shown — `entryIds` is `lineEntryIds(l)` (#113), `count` is `lineCount(l)` (F3, round
   * 2): `l.entryIds`/`l.count` when the line carries them, else `[l.entryId]`/`l.entryIds.length`,
   * computed inline since this runs in the page and cannot import from `storybook.ts`. */
  apiLines: { entryId: string; line: string; entryIds: string[]; count: number }[];
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
      apiLines: sb
        ? [...sb.lines, ...sb.more].map((l) => {
            const entryIds = l.entryIds ?? [l.entryId];
            return { entryId: l.entryId, line: l.line, entryIds, count: l.count ?? entryIds.length };
          })
        : [],
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
    for (const id of l.entryIds) expect(chronicleIds.has(id), `backing entry id "${id}" on the page is not in sim().chronicle`).toBe(true);

    if (l.entryIds.length <= 1) {
      // the plain, pre-#113 case: the rendered text is exactly this one entry's own line, and its
      // true count (F3, round 2) is exactly one — it names no more entries than it stores.
      expect(l.line, `entry "${l.entryId}"'s rendered line does not match its chronicle text`).toBe(chronicleLine.get(l.entryId));
      expect(l.count, `plain line "${l.line}" claims a count other than 1`).toBe(1);
      continue;
    }

    // #113: a collapsed line. Every entry it claims to back must carry the exact same text (a
    // "backing set" spanning different sentences would be inventing a summary, not reporting one),
    // and the rendered line must be that shared text with its trailing period swapped for a
    // mechanical "N times ..." suffix — never new prose, and never a count that disagrees with how
    // many entries actually back it.
    //
    // F3 (round 2): the stored `entryIds` can now be a capped sample of a much larger group (a card
    // repeated beyond `MAX_STORED_MORE` times in one gap), so the count the suffix must name is
    // `l.count` — the group's true tally — not `l.entryIds.length`, which is what is checked next.
    const backingTexts = new Set(l.entryIds.map((id) => chronicleLine.get(id)));
    expect(backingTexts.size, `collapsed line "${l.line}" backs entries with different chronicle text`).toBe(1);
    const base = [...backingTexts][0]!.replace(/\.+$/, '');
    expect(l.line.startsWith(`${base}, `), `collapsed line "${l.line}" does not start with its backing entries' own text`).toBe(true);
    expect(l.line.endsWith('.'), `collapsed line "${l.line}" is not a finished sentence`).toBe(true);
    const countWord = SMALL_WORDS[l.count] ?? String(l.count);
    expect(l.line, `collapsed line "${l.line}" does not name its own true count (${l.count})`).toContain(`${countWord} times`);
    // the stored backing set is exactly the true count, capped at MAX_STORED_MORE — never more
    // (the cap held) and never fewer (nothing was dropped ahead of the cap).
    expect(
      l.entryIds.length,
      `collapsed line "${l.line}" stores ${l.entryIds.length} backing ids for a true count of ${l.count} (expected ${Math.min(l.count, MAX_STORED_MORE)})`,
    ).toBe(Math.min(l.count, MAX_STORED_MORE));
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
// `freeze`), the same seed 17 / gap 120 pair `storybook.spec.ts`'s "and N more" test measures.
// PIN MOVED (#126): was 5 shown + 10 more = 15 rows (this gap's raw chronicle was 52 entries).
// The farm's three builds are owned from the start now (plan decision 19), so hay2's grass regrow
// bonus applies from tick zero and shifts this gap's whole catch-up draw stream — see
// `storybook.spec.ts`'s own comment on the same case for the mechanism. Measured on this head: 5
// shown + 7 more = 12 rows (this gap's raw chronicle is 49 entries; #113 collapses every repeated
// card into one row before the page is built, so "and N more" is 7 rows, not 44).
// Either way the reopened card is exercised with plenty behind "and N more".
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
  // PIN MOVED (#126): was 15 (5 shown + 10 more), see the header comment above. Measured on this
  // head: 12 rows (5 shown + 7 more) — #113 collapses this gap's 49 raw entries
  // (`app.sim().chronicle.entries.length`) into 12 distinct lines, several of them a collapsed "N
  // times" row; `expectCardTracesToChronicle` above already checked every raw entry is accounted
  // for by exactly one row's backing set.
  expect(reopened.apiLines.length).toBe(12);

  // and the same holds once "and N more" is opened on the reopened card too
  await expect(page.locator('#storyMore')).toHaveCount(1);
  await page.locator('#storyMore').click();
  const reopenedExpanded = await readCardCoverage(page);
  expectCardTracesToChronicle(reopenedExpanded);
  expect(reopenedExpanded.domRows.length).toBe(12); // PIN MOVED (#126): was 15; 5 shown + the gap's own 7 collapsed rows
});

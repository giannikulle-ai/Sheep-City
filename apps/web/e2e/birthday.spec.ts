import { expect, test } from '@playwright/test';

// The birthday reminder (#117), round 2 e2e coverage — Opus verifier B2/B3: main.ts's own wiring
// (`traySequence`'s return value, and `realMsOf(game.sim.season)` rather than the browser clock)
// was unit-testable but untouched by any browser test, so a mutation to either survived every check
// the PR ran. These three cases enter the real seam: a page load, through the query string, with no
// QA hook standing in for it.
//
// `?seed=9&realNow=<ms>` pins a fresh scratch world onto a chosen real instant (query.ts's
// `worldRealNowMs`) without the client ever reading the browser's own clock — the ms literals below
// are UTC midnight for the dates named, not wherever the runner's wall clock happens to be, which is
// exactly the property B3 exists to protect. Computed the same way `@sheepcliff/sim`'s
// `realMsOfCivil` does (Hinnant's `days_from_civil`); not imported directly, since Playwright's own
// Node loader does not handle the package's import attribute (see storybook.spec.ts's own note on
// `MAX_STORED_MORE` for the same reason).
const DEC_12_2026 = 1_797_033_600_000; // three real days before Digital Luna's birthday
const DEC_15_2026 = 1_797_292_800_000; // Digital Luna's birthday itself

// A `?seed=`/`?realNow=` scratch world is never saved (query.ts's `scratch`), so there is no
// load-time tray message ahead of it here — `traySequence` is length 1, and the reminder is said at
// once rather than waiting on `trayIsFree` (birthday.ts). The waiting half of B1 is covered at the
// unit level (birthday.test.ts's `trayIsFree` suite): the awaiting-call state and a live message
// from a stage tap, and proof neither is overwritten, do not need a browser.
test('three days before December 15, a pinned world counts down', async ({ page }) => {
  await page.goto(`/?seed=9&realNow=${DEC_12_2026}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  await expect(page.locator('#say')).toHaveText("Digital Luna's birthday is in 3 days");
});

test('on December 15 itself, a pinned world says so', async ({ page }) => {
  await page.goto(`/?seed=9&realNow=${DEC_15_2026}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  await expect(page.locator('#say')).toHaveText("It's Digital Luna's birthday today!");
});

// No `?realNow=`: the scratch world sits on the sim's fixed `DEFAULT_REAL_EPOCH_MS` (spring), well
// outside the reminder's window — the client adds no line of its own here (issue #117's "done
// means"), so the tray keeps its ordinary default text.
test('a plain pinned scene says nothing about the birthday', async ({ page }) => {
  await page.goto('/?seed=9');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });
  await expect(page.locator('#say')).not.toContainText('birthday');
  await expect(page.locator('#say')).not.toContainText('Birthday');
});

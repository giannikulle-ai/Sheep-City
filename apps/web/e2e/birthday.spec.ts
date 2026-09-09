import { expect, test } from '@playwright/test';
import type { SheepcliffApi } from '../src/api';

type WithApp = { sheepcliff: SheepcliffApi };

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

// The other half of `traySequence` (B2: main.ts must actually use its return value, not just
// compute it) needs a *restored* world — never reachable through `?realNow=`, which is always a
// scratch world (query.ts's `scratch`) and so never carries a load-time message. Built by hand: a
// bare load saves a real farm, then its save is rewritten directly (the technique sim.spec.ts's own
// "offline catch-up" test uses) so the world's calendar sits three real days out and its last save
// was two real hours ago — comfortably over the storybook's ten-sim-minute gate (~1.25 s at the
// default 3-minute day) — so the reload both restores (a load-time message) and opens a storybook
// page (round 2 finding F3: the card covers the tray).
//
// `seq.length === 1` mutated to `>= 1` (main.ts) makes exactly this case fail: the birthday line
// would land at once, in the same synchronous turn as the restored message and the storybook
// card's own opening, before the card is ever dismissed.
test('a storybook card over a restored, birthday-window world holds the reminder back until dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });

  const AWAY_MS = 120 * 60_000; // two real hours — storybook.spec.ts's own "a night" gap
  const TARGET_MS = DEC_12_2026 + 12 * 3_600_000; // noon, three real days out: wide of both midnights

  const env = (await page.evaluate(() => JSON.parse((window as unknown as WithApp).sheepcliff.save.text()))) as {
    savedAt: number;
    save: { world: { season: { elapsedMs: number; realEpochMs: number }; ledger: { season: { realEpochMs: number } } } };
  };
  const pinnedEpoch = TARGET_MS - env.save.world.season.elapsedMs - AWAY_MS;
  env.save.world.season.realEpochMs = pinnedEpoch;
  env.save.world.ledger.season.realEpochMs = pinnedEpoch;
  env.savedAt = Date.now() - AWAY_MS;
  // Not a plain `localStorage.setItem` here and then `reload`: the still-live first page saves
  // itself again (`pagehide`, main.ts) as the reload tears it down, overwriting this write with the
  // farm exactly as it stood a moment ago. An init script runs at the very start of the *next*
  // document instead — after that teardown save, before the reloaded page's own boot reads the key.
  await page.addInitScript((doc: unknown) => localStorage.setItem('sheepcliff-save', JSON.stringify(doc)), env);

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 15_000 });

  // the gap crossed the storybook's gate: its card is up, covering the tray
  const card = page.locator('#storybookCard');
  await expect(card).toBeVisible();
  // the restored message is what the tray reads while the card is up — never the birthday line
  await expect(page.locator('#say')).toContainText('restored');
  await expect(page.locator('#say')).not.toContainText('birthday');

  // dismissing the card frees the tray, and only then does the reminder land
  await card.click();
  await expect(card).toBeHidden();
  await expect(page.locator('#say')).toHaveText("Digital Luna's birthday is in 3 days");
});

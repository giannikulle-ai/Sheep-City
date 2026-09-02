// Shared Chromium launch for the QA runners. Mirrors apps/web/playwright.config.ts:
// the agent sandbox ships Chromium at /opt/pw-browsers/chromium and forbids
// `playwright install`; CI installs its own browser, so fall back to the
// Playwright-managed one when the pre-installed path is absent.
import { existsSync } from 'node:fs';
import { chromium } from '@playwright/test';

export function chromiumExecutable() {
  const preinstalled = process.env.SHEEPCLIFF_CHROMIUM ?? '/opt/pw-browsers/chromium';
  return existsSync(preinstalled) ? preinstalled : undefined;
}

export async function launch({ headed = false } = {}) {
  const executablePath = chromiumExecutable();
  return chromium.launch({
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
  });
}

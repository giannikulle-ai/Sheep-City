import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The agent sandbox ships Chromium at /opt/pw-browsers/chromium and forbids
// `playwright install`. CI installs its own browser, so fall back to the
// Playwright-managed one when the pre-installed path is absent.
const preinstalled = process.env['SHEEPCLIFF_CHROMIUM'] ?? '/opt/pw-browsers/chromium';
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

const port = 4173;

export default defineConfig({
  testDir: 'e2e',
  // Golden PNGs live beside the specs, named by the argument to toMatchSnapshot.
  snapshotPathTemplate: '{testDir}/golden/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    viewport: { width: 640, height: 520 },
    deviceScaleFactor: 1,
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    // Serves dist/, so `npm run build` must run first (CI does).
    command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  // Relative asset paths so the static build works from any tile path on the host.
  base: './',
  build: {
    // Keep the sprite sheet as a file, never a data URI, so it stays inspectable.
    assetsInlineLimit: 0,
  },
  server: {
    // The hello page imports the sheet straight from prototype/luna-farm/build.
    fs: { allow: [repoRoot] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});

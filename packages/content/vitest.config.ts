import { defineConfig } from 'vitest/config';

// Vitest runs the TypeScript tests under src/. The JSON drift tests under test/
// use node:test and run via the second half of the package's test script.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });

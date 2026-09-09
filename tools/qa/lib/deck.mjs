// Loads @sheepcliff/sim's event deck for Node-side QA tooling (issue #49, `--events` mode).
//
// The sim package ships as raw TypeScript — its `package.json` "exports" points straight at
// `src/index.ts`, with no build step and no compiled `dist/` — so a plain `node --import` cannot
// resolve it (no extension-less specifier resolution, and its files import each other and the
// content package's JSON without extensions). esbuild is already a transitive devDependency (via
// vite) and its JS API is on the path, so this bundles the one module the watch test needs —
// `engine/deck.ts`, which itself imports and validates `packages/content/events/*.json` through
// the real `loadDeck()` — into a single in-memory ESM module and evaluates it via a `data:` import.
// That is "reading the deck through @sheepcliff/sim's exports" (the ticket's words): the real
// `FARM_DECK` and `momentKindOf`, not a second, divergent parse of the JSON.
import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const DECK_ENTRY = path.join(repoRoot, 'packages/sim/src/engine/deck.ts');

let cached = null;

/** `{ FARM_DECK, momentKindOf }`, straight from packages/sim/src/engine/deck.ts. Cached per process. */
export async function loadFarmDeck() {
  if (cached) return cached;
  const result = await esbuild.build({
    entryPoints: [DECK_ENTRY],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    target: 'node22',
  });
  const code = result.outputFiles[0].text;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
  cached = { FARM_DECK: mod.FARM_DECK, momentKindOf: mod.momentKindOf };
  return cached;
}

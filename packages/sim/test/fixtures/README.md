# Save fixtures

One frozen save per schema version. `save-v<n>.json` is what `toSave` wrote at version `n`.

- `save-v0.json`: the bare state from the clock ticket (#4), `version: 0`, no envelope. Derived from `save-v1.json` by hand: the same world, unwrapped.
- `save-v1.json`: `{ format, version: 1, world }` (#8). Seed 8, 1,200 ticks, plus hand-filled lambs, a shear timer, a farmer with a plan, small life, and a queued intent.

Rules:

- Never edit or regenerate an existing fixture. It is the frozen input the migration chain must keep loading.
- When `SAVE_VERSION` bumps: add the migration under `src/save/migrations`, list it in `MIGRATIONS`, run `npm run test -w packages/sim`. `test/save-fixture.test.ts` writes the missing `save-v<new>.json` from `buildFixtureState()`; commit it.
- Every fixture in this folder is loaded and stepped 100 ticks on every test run.

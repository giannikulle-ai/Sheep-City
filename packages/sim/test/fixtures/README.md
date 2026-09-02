# Save fixtures

One frozen save per schema version. `save-v<n>.json` is what `toSave` wrote at version `n`.

- `save-v0.json`: the bare state from the clock ticket (#4), `version: 0`, no envelope. Derived from `save-v1.json` by hand: the same world, unwrapped.
- `save-v1.json`: `{ format, version: 1, world }` (#8). Seed 8, 1,200 ticks, plus hand-filled lambs, a shear timer, a farmer with a plan, small life, and a queued intent.
- `save-v2.json`: same envelope, `version: 2` (#5 part a). Same seed and build recipe as v1, so the world also has DL's five behaviour-chain fields (`stick`, `circleUntilMs`, `dirAtMs`, `tagUntilMs`, `forceBoundUntilMs`); v1 saves get them filled with fresh-state defaults by the v2 migration.
- `save-v3.json`: same envelope, `version: 3` (#5 part b). Same seed and build recipe again; the world has `nameIdx` and the farmer has the eight NPC job-plan fields (`wp`, `outside`, `entering`, `job`, `shearing`, `cart`, `icon`, `iconUntilMs`). The sheep, DL, and the NPCs now move during the 1,200 ticks, so the world is not v2 plus those fields. v1 and v2 saves get `nameIdx` (the flock size) and the NPC fields (`makeNpc`'s spawn values) filled by the v3 migration.

Rules:

- Never edit or regenerate an existing fixture. It is the frozen input the migration chain must keep loading.
- When `SAVE_VERSION` bumps: add the migration under `src/save/migrations`, list it in `MIGRATIONS`, run `npm run test -w packages/sim`. `test/save-fixture.test.ts` writes the missing `save-v<new>.json` from `buildFixtureState()`; commit it.
- Every fixture in this folder is loaded and stepped 100 ticks on every test run.

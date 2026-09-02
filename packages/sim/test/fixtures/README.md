# Save fixtures

One frozen save per schema version. `save-v<n>.json` is what `toSave` wrote at version `n`.

- `save-v0.json`: the bare state from the clock ticket (#4), `version: 0`, no envelope. Derived from `save-v1.json` by hand: the same world, unwrapped.
- `save-v1.json`: `{ format, version: 1, world }` (#8). Seed 8, 1,200 ticks, plus hand-filled lambs, a shear timer, a farmer with a plan, small life, and a queued intent.
- `save-v2.json`: same envelope, `version: 2` (#5 part a). Same seed and build recipe as v1, so the world also has DL's five behaviour-chain fields (`stick`, `circleUntilMs`, `dirAtMs`, `tagUntilMs`, `forceBoundUntilMs`); v1 saves get them filled with fresh-state defaults by the v2 migration.
- `save-v3.json`: same envelope, `version: 3` (#5 part b). Same seed and build recipe again; the world has `nameIdx` and the farmer has the eight NPC job-plan fields (`wp`, `outside`, `entering`, `job`, `shearing`, `cart`, `icon`, `iconUntilMs`). The sheep, DL, and the NPCs now move during the 1,200 ticks, so the world is not v2 plus those fields. v1 and v2 saves get `nameIdx` (the flock size) and the NPC fields (`makeNpc`'s spawn values) filled by the v3 migration.
- `save-v4.json`: same envelope, `version: 4` (#33). Same seed and build recipe, plus two hand-placed snow prints; the world has `ground` (`prints`, `mud`, `wasSnowy`), and each sheep and DL have `lastStamp` and `stampSide`. The mud is real: the shower's walk to the barn stamped it. The bird now rolls every tick and the butterflies drift, so the 1,200 ticks are a different 1,200 ticks than v3's. Older saves get an empty ground and unstamped walkers filled by the v4 migration.
- `save-v5.json`: same envelope, `version: 5` (#39). Same seed and build recipe; the world has `ledger` (the district's numbers as the Ledger path last wrote them: here the snapshot `createInitialState` took, older than the world around it) and `lastLedgerAt` (0, its clock then). The 1,200 ticks are the same 1,200 ticks as v4's: the Ledger is a new path, not a change to the tick. A v4 save gets its snapshot read off its own world by the v5 migration, stamped with the world's clock.

Rules:

- Never edit or regenerate an existing fixture. It is the frozen input the migration chain must keep loading.
- When `SAVE_VERSION` bumps: add the migration under `src/save/migrations`, list it in `MIGRATIONS`, run `npm run test -w packages/sim`. `test/save-fixture.test.ts` writes the missing `save-v<new>.json` from `buildFixtureState()`; commit it.
- Every fixture in this folder is loaded and stepped 100 ticks on every test run.

# Lane charter: sim

## Mission
A deterministic, testable simulation core that makes Sheepcliff feel alive without a renderer in the room.

## Owns (paths)
- `packages/sim/**`
- `packages/sim/test/**`

## Never touches
- `tools/art/**`, sprite grids, palette — art is the art lane's.
- `apps/web/**` — the client consumes the sim through its public API only.
- `packages/content/**` data files — propose schema changes on the issue; the world lane edits data.

## Checks before every PR
```
npm run test -w packages/sim      # expected: all tests pass, including seeded determinism test
npm run typecheck                 # expected: 0 errors
npm run bench -w packages/sim     # expected: 10 sim-minutes of a 40-actor district under 50 ms
```

## Gate
Medium. High if a PR changes DL's priority order, sheep needs weights, or the tick rate.

## Working notes
- Fixed timestep, seeded RNG, no `Date.now()` or `Math.random()` inside the sim. Time comes in as a parameter.
- Behaviours are registered `(id, priority, condition, tick)` objects. The if/else chain from the prototype is the reference for parity, not the pattern to copy.
- Three layers: Ledger (district numbers), Actors (on-screen individuals), Director (events). Keep them separable; the Ledger must run alone for offline catch-up.
- Parity with `prototype/luna-farm/src/sim_template.html` is the first milestone. Read its `RULES` block and the `tick` function before designing.

## Handoff log

# Lane charter: economy

## Mission
A ledger that makes growth feel earned and visible, with numbers you can tune from one file.

## Owns (paths)
- `packages/sim/src/ledger/**`
- `packages/content/balance/**`
- `packages/sim/test/balance/**`

## Never touches
- Actor behaviour code, rendering, art.

## Checks before every PR
```
npm run test -w packages/sim -- --grep ledger     # expected: pass
npm run sim:soak -- --days 30 --seed 7             # expected: no resource pins at zero or runaway; report attached
```

## Gate
Medium.

## Working notes
- Every number lives in `packages/content/balance/*.json` with a comment field. No magic numbers in code.
- The soak report (30 sim days) is attached to every PR as a small table: population, wool, coins, food, mood, buildings.
- Growth is a step function the player can see: a surplus becomes a building, a building becomes a new inhabitant.

## Handoff log

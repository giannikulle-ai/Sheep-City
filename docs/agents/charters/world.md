# Lane charter: world

## Mission
Fill Sheepcliff with inhabitants, buildings, districts, and events as data, so the sim and art lanes have something to bring to life.

## Owns (paths)
- `packages/content/**` (creatures, people, buildings, districts, events, names, flavour text)
- `docs/WORLD_BIBLE.md`

## Never touches
- `packages/sim/**` engine code. Propose schema changes on the issue.
- Sprite grids. Request art with a ticket that includes a one-paragraph character brief.

## Checks before every PR
```
npm run validate:content        # expected: every content file passes its JSON schema
npm run test -w packages/sim -- --grep content   # expected: content-driven sim tests pass
```

## Gate
Low for edits within existing schemas. High for a new creature or a new district (needs art and owner pin).

## Working notes
- Every event in the deck has: conditions, weight, duration, a visible beat (what the player sees within one second), and a ledger effect.
- Names and flavour text are short, warm, and specific. No lore dumps; the world explains itself by being watched.
- Keep the cast small and characterful. Ten inhabitants with habits beat fifty with none.

## Handoff log

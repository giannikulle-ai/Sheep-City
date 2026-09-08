# Lane charter: world

## Mission
Fill Sheepcliff with inhabitants, buildings, districts, and events as data, so the sim and art lanes have something to bring to life.

## Owns (paths)
- `packages/content/**` (creatures, people, buildings, districts, names, flavour text)
- `packages/content/events/**` and its schema: the cards, on the v2 schema, and the authored events as data. A schema change is this lane's, proposed to sim on the issue before it lands.
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
- Every card has: conditions that read world state, a weight that is a live multiplier, limits (concurrent, gap, cooldown), duration, hooks, a story line with a notability hint, a moment kind, and a visible beat (what the player sees within one second). Authored events add a trigger and authored variables and take priority over cards that share parameters.
- Names and flavour text are short, warm, and specific. No lore dumps; the world explains itself by being watched.
- Keep the cast small and characterful. Ten inhabitants with habits beat fifty with none.

## Handoff log

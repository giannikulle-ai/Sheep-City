# @sheepcliff/content

Everything in the world that is data rather than logic: landmarks, grass, upgrades, NPC job plans, name lists, balance numbers, and the event deck. Plain JSON, one schema per file, no dependencies. The sim lane reads these; the world lane edits them.

```
packages/content/
  farm/spots.json      landmark foot coordinates, field and barn geometry, fence posts, flowers
  farm/tufts.json      the grass tuft generator's numbers plus the un-jittered ring anchors it makes
  farm/upgrades.json   the merchant's auto-buy list, in order
  farm/npcs.json       the farmer's and merchant's job plans and per-job numbers
  farm/names.json      sheep names and name-tag colours
  balance/farm.json    every RULES number from the prototype, one comment each
  events/farm.json     the farm's event deck (v2 schema): fifteen cards the engine draws from (docs/content/EVENT_DECK.md)
  events/authored.json the farm's authored events (v2 schema): the three the engine triggers on its own
  schema/               one JSON Schema (draft 2020-12) per file, shared bits in _defs.schema.json
  scripts/validate.mjs checks every file against its schema
  src/index.ts         typed handles on the JSON for the sim and the client (the event deck today)
  test/                asserts the JSON still matches prototype/luna-farm/src/sim_template.html, and the deck's cross-checks
```

## Run the checks

```
cd packages/content
npm run validate:content   # every content file passes its schema
npm test                   # values still match the prototype source
```

Both need only Node 20 or newer. The validator is a small draft 2020-12 subset in `scripts/lib/schema.mjs`; it throws on any keyword it does not know, so a schema cannot pass by being ignored. When the workspace root gets a lockfile, swap it for ajv and delete the file; the schemas are standard.

Until the root `package.json` exists, the charter's `npm run validate:content` runs from this directory. The infra lane should wire the root script to `npm run validate:content -w packages/content`.

## Conventions

- Every file carries a `source` line naming where its values came from and a top `comment`.
- A number the sim tunes is `{ "value": n, "comment": "one line" }`. A number that is structure (a coordinate, a sprite size) is bare.
- `comment` fields are for people. The sim never reads them.
- Ids are `lowerCamel` and match `_defs.schema.json#/$defs/id`.
- Values copied from the prototype are copied exactly, decimal for decimal. The test in `test/` compares them with the source file; if the prototype changes, change the JSON in the same PR or the test fails.
- Schemas set `additionalProperties: false` almost everywhere on purpose. A typo in a key is a failure, not a silent no-op.

## How to add a landmark

1. Draw it in `farm_v3.background()` (art lane) and note its foot coordinate in world px.
2. Add a key to `spots` in `farm/spots.json`: `"well": { "x": 410, "y": 250, "comment": "The well. Villagers draw water here." }`. Keys must match the id pattern.
3. If something walks around it, ask the sim lane to extend the obstacle check; if it is a rectangle like the barn, propose a `solids` array on the issue rather than adding ad-hoc keys.
4. Run `npm run validate:content`. Nothing else needs to change; the schema accepts any number of spots.

## How to add an upgrade

1. Append to `upgrades` in `farm/upgrades.json`: `{ "id": "well", "cost": 90, "comment": "A well; art not yet drawn." }`. Order matters: the merchant buys top to bottom whenever coins allow.
2. Costs are whole coins. Keep the list ascending unless you mean the merchant to skip ahead.
3. Run `npm run validate:content`. The drift test compares the list with the prototype's `RULES.upgrades`, so a new upgrade that the prototype does not have will fail it until the prototype is retired; say so in the PR and update the test's expectation there.

## How to add a name list

1. Add a top-level key to `farm/names.json`, for example `"villagers": ["Mabel", "Otto", "Wren"]`.
2. Add the key to `schema/names.schema.json` under `properties`, pointing at `#/$defs/nameList` (names are `Capitalised`, 2 to 12 letters, unique).
3. Run `npm run validate:content`. Names are short, warm, and specific; no lore dumps.

## How to add a balance number

Add it to `RULES` in the prototype or to the sim's config, then add a `{ value, comment }` leaf in `balance/farm.json` and a matching property in `schema/balance-farm.schema.json` (`rules` allows no extra keys, so the schema must know about it). Constants that live outside `RULES` in the prototype go under `outsideRules`.

## How to add an event card (v2 schema)

1. Append a card to `events` in `events/farm.json`. Copy a neighbour: `id` (lowerCamel), `title`, `comment` (say what changed and why, causally, if this is a migration), `conditions` (a list of `{ on, op, value }` predicates that must all hold — see `docs/content/EVENT_DECK.md` for the full `on` vocabulary: clock/weather fields, `ledger.wool`/`ledger.coins`/`ledger.grass`/`ledger.flock`, and the actor predicates), `weight` (`{ base, multipliers }` — 10 is an ordinary `base`; each multiplier is `{ when, times }`, a further predicate that scales the odds when true), `limits` (`{ concurrent, minGapSimMinutes, cooldownSimHours }` — `minGapSimMinutes` is always `durationSimMinutes + cooldownSimHours * 60`), `durationSimMinutes`, `hooks` with `start` and `end` lists, `storybook` (one past-tense line under 90 characters, placeholders from `{dl}`, `{lamb}`, `{sheep}`, `{farmer}`, `{merchant}`, `{coins}`, `{flock}`, plus `notability` 0 to 1), `moment` (a watch-test `kind` and a `detail` no other card or ordinary moment uses — `bird`/`rabbit` are reserved for small life, not cards), and `beat` (what the player sees within one second at start, and what marks the end).
2. Reach for a `weight.multiplier` before a hard `conditions` gate when a real cause only makes a thing *likelier*, not strictly possible or impossible — that is the whole point of v2 over v1's flat weight.
3. Times are in-world: 1440 sim minutes to the day, and a day is 180 real seconds when watching, so 240 sim minutes is 30 real seconds. Keep durations between 3 and 90 real seconds; the test checks.
4. Hooks come only from the vocabulary the sim's engine implements: `setVisibility`, `spawn`, `mood`, `coins`, `flag`. A flag set at start must be cleared at end. Need another effect, or a new `on` predicate? Propose it on the issue and flag it clearly in the schema's description and comments (the way `simMinutesSinceRain` is flagged); do not add one silently.
5. Write the card's page in `docs/content/EVENT_DECK.md` in the game's voice, then run `npm run validate` and `npm test` here.

## How to add an authored event

1. Append to `events` in `events/authored.json`. It shares `hooks`, `storybook`, `moment`, `beat` with a card, but trades `conditions`/`weight`/`limits` for `trigger` (one of three shapes: `predicates` — a list like a card's `conditions`, plus its own `cooldownSimDays`; `simDate` — a `season` and a `dayOfSeason` 1 to 9; `stockThreshold` — a Ledger `on`/`op`/`value` plus `cooldownSimDays`), `variables` (an open bag of named parameters only this event's own hooks and storybook read — never put a `comment` key in here; it would look like a phantom parameter), a required sibling `variablesComment` explaining what the bag holds and why, and `priorityOver` (card ids, or bare parameter names like `mood`/`weather`, this event outranks while it runs).
2. Pick the trigger shape that actually fits: a fixed point in the calendar is `simDate`; a real state to react to (a drought, a surplus) is `stockThreshold`; anything else that reads like a card's conditions but should not be drawn randomly is `predicates`.
3. Ids must not collide with `events/farm.json`'s card ids; the test checks across both files.
4. Write the event's paragraph in `docs/content/EVENT_DECK.md`, then run `npm run validate` and `npm test` here.

## How to add a whole new file

Create `farm/<thing>.json` with `source` and `comment`, write `schema/<thing>.schema.json`, and add one line to `FILES` in `scripts/validate.mjs`. Add a drift test if the values are copied from somewhere.

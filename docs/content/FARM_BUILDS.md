# Farm builds

The owner's table for what the merchant auto-buys on the farm (`packages/content/farm/upgrades.json`,
`RULES.upgrades`). This is not the world's growth table (plan section 2, "the Ledger"): a settlement's builds
raise a cap, open a trade, or let a new inhabitant arrive, drawn from that settlement's own stocks over time.
The farm has none of that. Luna Farm is a space between spaces — its wool and coins enter the settlement economy
as one input among several, not as its source — and its builds are the owner's, aesthetic or small, bought in a
fixed order whenever the merchant's coins cover the cost. A build here never opens a settlement unlock, raises
`flockCap`, or grows anything the world's growth table would count. If a build changes no number and draws no
pixel, it does not belong on this list; issue #63 made that rule bite, after three farm upgrades shipped as
no-ops (or partial no-ops — see below) for a season.

## The table

| id | cost | disposition | what it does |
|---|---|---|---|
| `flowerbed` | 12 coins | draws a pixel | A hand-pixelled flower bed (`tools/art/hand_sprites.py`, `FLOWERBED`), drawn at a fixed spot once owned (`packages/render/src/scene.ts`). Changes no number. Already true before #63 — the balance file's old comment ("art not yet drawn") was stale; the art and the draw call were already in the prototype and carried through the render port. |
| `hay2` | 30 coins | changes a number | The prototype's second hay bale drew and changed nothing (`sim_template.html` line 576, an empty stub). #63's disposition: while owned, tuft regrowth (`RULES.tuftRegrowPerSec`) eases up by `RULES.hay2.tuftRegrowBonusFrac` (15%, `packages/content/balance/farm.json`) — a second bale eases pressure off the grazed field. Applied the same way on the actor tick (`tick.ts`) and in `advanceLedger` (offline catch-up). No new art, no renderer change. |
| `scarecrow` | 60 coins | draws a pixel | A hand-pixelled scarecrow (`tools/art/hand_sprites.py`, `SCARECROW`), drawn once owned (`packages/render/src/scene.ts`). Changes no number. Same story as the flowerbed: already implemented, only the balance comment was stale. |

## The rule

Farm builds are aesthetic or small, and never part of the world's growth table. Concretely:

- **A build's effect is small and farm-only.** It may move a farm-local rate (like `hay2`'s regrow bonus) or
  place a decoration; it never touches a settlement's caps, unlocks, or stocks, and never changes what the farm
  exports to the settlement economy beyond what the flock already produces on its own.
- **A build that changes no number and draws no pixel does not get a row.** Prefer removing an upgrade to
  inventing a purpose for it. Every row above earns its place: a number that moves, or a pixel not on screen
  before.
- **"Change a number" lands in the Ledger.** The Ledger (`packages/sim/src/ledger/`) runs whether the farm is on
  screen or not, so a build's numeric effect belongs in `RULES` and in `advanceLedger`, applied the same way the
  actor tick applies it — never only in one place, or a watched farm and a caught-up one would disagree.
- **"Draw a pixel" reuses what is already in the sheet.** No new art ships for a build's own sake; a new sprite
  or creature is a pin-reviewed decision on its own ticket, not a side effect of an upgrade purchase.
- **New builds are proposed on an issue first**, the way #63 was: a disposition table naming the Ledger stock or
  the sprite before any code lands, so the owner can correct course early.

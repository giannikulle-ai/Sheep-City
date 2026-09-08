# Farm builds

The owner's table for what the merchant auto-buys on the farm (`packages/content/farm/upgrades.json`,
`RULES.upgrades`). This is not the world's growth table (plan section 2, "the Ledger"): a settlement's builds
raise a cap, open a trade, or let a new inhabitant arrive, drawn from that settlement's own stocks over time.
The farm has none of that — its wool and coins enter the settlement economy as one input among several, not as
its source — and its builds are the owner's, aesthetic or small, bought in a fixed order whenever the farm's
bank (`banks.coins`) covers the cost. A build here never opens a settlement unlock, raises `flockCap`, or grows
anything the world's growth table would count. If a build changes no number and draws no pixel, it does not
belong here; issue #63 made that rule bite, after three farm upgrades shipped as no-ops (or partial ones — see
below) for a season.

## The table

| id | cost | disposition | what it does |
|---|---|---|---|
| `flowerbed` | 12 coins | draws a pixel | A hand-pixelled flower bed (`tools/art/hand_sprites.py`, `FLOWERBED`), drawn at a fixed spot once owned (`packages/render/src/scene.ts`). Changes no number. Already true before #63 — `packages/content/farm/upgrades.json`'s old comment ("art not yet drawn") was stale; the art and the draw call were already in the prototype. |
| `hay2` | 30 coins | changes a number, visibly | The prototype's second hay bale drew and changed nothing. #63's first cut eased tuft regrowth up 15% — real, but under half a percent field-average, invisible. The owner's call (2026-09-08, "make hay2 visible instead"): `RULES.hay2.tuftRegrowBonusFrac` raised to 2.5, a 3.5x multiplier while owned, still under `tuftBitePerSec` so a grazing sheep still wins the tuft it stands on. Over one sim-day, 40-sheep world: field average fullness goes 0.73–0.79 to 0.95–0.96, +16 to +23 points; a hay2 farm's Ledger never regrows less grass than an unowned one, tuft for tuft (proved, not just measured, `test/ledger.test.ts`). Same rule on the tick and in `advanceLedger`. |
| `scarecrow` | 60 coins | draws a pixel | A hand-pixelled scarecrow (`tools/art/hand_sprites.py`, `SCARECROW`), drawn once owned (`packages/render/src/scene.ts`). Changes no number. Same story as the flowerbed: already implemented, only `upgrades.json`'s comment was stale. |

## The rule

Farm builds are aesthetic or small, and never part of the world's growth table. Concretely:

- **A build's effect is small and farm-only.** It may move a farm-local rate (like `hay2`'s regrow bonus) or
  place a decoration; it never touches a settlement's caps, unlocks, or stocks, or what the farm exports beyond
  what the flock already produces on its own.
- **A build that changes no number and draws no pixel does not get a row**, and a number that moves but cannot
  be seen does not count either — growth you cannot see did not happen. Prefer removing an upgrade to inventing
  a purpose for it.
- **"Change a number" lands in the Ledger**, which runs whether the farm is on screen or not, so a build's
  numeric effect belongs in `RULES` and in `advanceLedger`, applied the same way the actor tick applies it —
  never only in one place, or a watched farm and a caught-up one would disagree.
- **"Draw a pixel" reuses what is already in the sheet.** No new art ships for a build's own sake; a new sprite
  is a pin-reviewed decision on its own ticket, not a side effect of a purchase.
- **New builds are proposed on an issue first**, the way #63 was: a disposition naming the Ledger stock or the
  sprite before any code lands, so the owner can correct course early.

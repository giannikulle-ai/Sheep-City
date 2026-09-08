# Region map — how districts connect

For the owner's pin. Issue #62: design moving between districts as a system before any Village Green
content is built, so the village is not built against the assumption that there are only two places.

The three images below are **sketches, not sprites** — plain shapes at 1x snapped to the palette in
`tools/art/pixel_grids.py` / `hand_sprites.py`, scaled 4x by `docs/design/scripts/make_region_sketches.py`.
No hand-pixelled grid, no new colour, and no claim to be final art.

## 1. The map, as the player sees it

![The region map: a hand-drawn hill, a dashed lane linking the farm, the village green and the harbour, a compass rose](img/map_sketch.png)

One hand-drawn region, not a grid of tiles: a single cliff-top landmass shaped like the plan describes it
(section 3) — the farm in the lee of the cliff, a lane climbing to the village green, the cliff edge over
the harbour, the wildwood behind. It opens from the tray's map button (plan section 4, "one tray, one
map"). Each district is a tappable hotspot on the hill, drawn as a small landmark (the barn, a cluster of
cottage roofs, a mast) rather than a labelled pin, so the map reads as a place before it reads as a menu.
Tapping a district that is not the current one starts a transition; tapping the current one closes the
map. A small mark (Digital Luna, in the sketch) shows which district the player is standing in.

The map itself is a fixed background plus the same district hotspots, cheap to render and safe to leave
open while the world keeps ticking underneath — nothing about opening it pauses the sim.

## 2. The district model

A district is three things, and only three:

- **A scene.** The same 640×400 world-pixel space the farm already is (HANDOFF.md), with its own
  background set (four clock phases by two weathers, the farm's pattern), camera, and layer stack.
- **A Ledger.** The district's numbers — stocks, flows, clock, weather, season — the same shape
  `packages/sim/src/ledger/ledger.ts` already gives the farm (`Ledger`, `summarise`, `advanceLedger`,
  `respawn`, `diffLedger`). Every district gets one; the harbour's and the wildwood's differ from the
  farm's only in which stocks they hold.
- **A cast.** The inhabitants who belong there — traits, homes, jobs, social-graph edges — summarised
  into the Ledger off screen and respawned on entry (plan section 2, layer 2).

A district is not a level, a room, or a save slot. It is addressable state (its Ledger) plus a place to
render it (its scene) plus who lives there (its cast); the region map is the thing that decides which
district's scene is currently drawn and which districts' Ledgers keep ticking regardless.

## 3. Travel

Three things travel between districts, at three different resolutions:

| What moves | Carries | Sim-time cost | Visible as |
|---|---|---|---|
| **Goods** (wool, bread, fish, honey) | one Ledger stock into another | a fixed lag per link (farm→village same-day; village↔harbour about half a day; anything to the wildwood about a day), inside `advanceLedger` | a cart/boat glyph riding the lane/water on the map, a stock tick at the receiving gauge |
| **Caravans** (the merchant, a fisher's catch run) | an NPC visit, same shape as the farm's `merchantAtMs` today | one trip = one `merchantAtMs`-style timer per link | the NPC leaving one district's edge and arriving at the next on schedule, as the merchant already does |
| **DL herself** | the player's point of view | a short, fixed transition (below), not simulated sim-time — no walking for an hour to get there | the transition animation; she reappears in the new district's cast near the lane's end |

Goods and caravans travel whether or not the player is watching — Ledger-resolution, the policy that lets
a week away build a barn. DL travelling is really "loading a different scene": a UI beat, not a sim
event, costing no sim-time and never stalled by the sim.

What you see of a trip **from the map**: a small glyph advances along the lane at a rate matching its
timer, so a glance shows whether a delivery is close or just setting out. **From either end**: the
sender's scene shows the cart/NPC leaving; the receiver's shows it arriving, and a chronicle line records
it ("a cart of wool reached the village green"). A delivery is never invisible, only not always on screen.

## 4. A transition

![A transition: a dithered wipe between two district scenes, a cart on the lane between them, a sun icon marking sim-time passing](img/transition_sketch.png)

Tapping a district hotspot does not cut. It plays a short (under one second) pixel-dissolve wipe in the
palette's own dither style — the sketch shows the seam as a stippled band, the way the farm's snow overlay
already stipples pixels rather than fading them. A cart or footprint trail on the lane sells the idea that
this is a place walked to, not a menu opened. Because DL's crossing costs no sim-time, the wipe is a
camera cut with a costume on; underneath it, the outgoing district's actors are summarised into its Ledger
(plan section 2: "the player never sees the seam") and the incoming district is respawned from its own.

## 5. Off-screen districts, and how a gauge reads from the map

![An off-screen district as seen from the map: masts, a lit lighthouse window and a smoke plume over the cliff edge, next to an honestly low harbour gauge](img/offscreen_gauge_sketch.png)

A district you are not standing in is never fully invisible. From an adjacent scene or from the map you
get a small, cheap peek: a smoke plume over the ridge, a lit window at dusk, the harbour's masts poking
above the cliff line. These are two or three extra sprites drawn into the current scene's background
layer, keyed off the neighbouring district's Ledger (a lit window only if it is dusk there and someone is
home; a smoke plume only if its hearth stock is above zero) — cheap because they read one or two numbers,
not because they run the district's actors.

A **gauge** is the same idea abstracted one step further: a small bar or icon on the map itself that
reads one or two Ledger numbers straight, with no interpretation layered on. The harbour gauge (plan
section 3, "the harbour is both a gauge of the settlement economy and a set piece, and it is not the only
gauge") reads the settlement's trade stock directly — it says "poor" when that stock is low and says so
plainly, because plan section 3 is explicit that it "reads poor honestly until the economy earns better."
The sketch shows this as a bar mostly empty. Every district gets a gauge in this sense once it has a
Ledger: a village gauge could read its granary, a wildwood gauge its honey. The gauge and the peek-view
are drawn from the same Ledger read; nothing about them requires the district's scene to be loaded.

## 6. Saves, catch-up, and the chronicle per district

Each district's Ledger is its own entry in the save (versioned, same migration harness as the farm's).
Loading the game runs one `catchUp` per district against wall-clock elapsed time, as the farm does today —
a district you never visit still grows, because `advanceLedger` does not care whether a scene is mounted.
Only the on-screen district carries live actors; every other one exists purely as its Ledger between
visits, so catch-up for a whole region costs about what one farm catch-up costs today, run once per
district.

The chronicle stays one log for the whole world, not one per district — an entry already carries its
district (plan section 2), so a "while you were gone" storybook page can pull entries across every
district at once, in the order they happened. A gauge crossing a threshold ("the harbour gauge crossed
into fair") is exactly the kind of Ledger-diff line the chronicle already knows how to write.

## 7. What the Village Green ticket must not assume

- That there are only two districts. The map, the Ledger-per-district shape, and the travel model above
  are sized for four (plan section 3) from the start; Village Green is the second entry, not a special
  case.
- That the farm's Ledger shape (flock, wool, coins, grass) is the settlement Ledger shape. A settlement
  has stocks the farm does not (granary, market, a mood the farm's `moodOf` mean does not cover) and a
  growth table the farm has none of (plan section 2: the farm's builds are the owner's; a settlement's
  surplus rule runs inside `advanceLedger`).
- That travel is instant or free. Every good that crosses a district edge has a lag and a visible carrier;
  Village Green must not spawn goods from the farm with no cart and no delay.
- That the district it is not standing in goes dark. Off-screen districts still tick their Ledger and may
  still be glimpsed (section 5); Village Green's content must produce a legible gauge and, once the
  harbour exists, a legible peek from across the cliff.
- That the map is a menu. It is a place with hotspots, drawn in the pixel style, not a list of buttons;
  Village Green's hotspot needs a landmark glyph, not only a label.
- That "growth" means a shop. Plan section 2 is explicit: unlocks arrive from a settlement's own stocks
  over time, nobody shops.

## 8. The settlement data shape the sim lane will need

Following the farm's `Ledger` in `packages/sim/src/ledger/ledger.ts` as the pattern to extend, not
replace:

```ts
interface SettlementLedger {
  seed: number;
  clock: Clock;           // shared world clock, as today
  season: Season;
  weather: Weather;
  stocks: Record<string, number>;   // e.g. { grain: 12, bread: 3, mood: 0.6 } — open-ended per district
  cast: SettlementCastMember[];     // id, role, home, traits — enough for `respawn` to place them
  edges: SocialEdge[];              // bond/family/rivalry, summarised same as the flock's would be
  growth: {
    table: GrowthRule[];            // { stock, threshold, sustainedForMs, unlocks: BuildId[] }
    built: BuildId[];               // what has already resolved, so a rule fires once
  };
  gauge: Record<string, number>;    // 0..1 readings the map draws directly (e.g. { trade: 0.15 })
  edgesToOtherDistricts: TravelLink[]; // { to: DistrictId, kind: 'cart' | 'caravan', etaMs, cargo }
}
```

`GrowthRule` and `TravelLink` are new; everything else is the farm's own fields renamed and generalised
(`wool`/`grass` become `stocks`, flock/lambs become `cast`). The map reads `gauge` and nothing else, so a
UI change to gauges never touches settlement logic. `edgesToOtherDistricts` is what cart/caravan glyphs
animate against, letting a village and a harbour Ledger reference each other without either owning the
link.

## 9. Weak spots, named honestly

- **The transition wipe is a guess.** It has never been seen moving; a static dither sketch cannot prove
  it reads as "a place," not "a loading screen." First build should get a fast owner pin before content
  work assumes it is right.
- **Travel timing numbers are placeholders.** "Same-day," "half a day" are round numbers chosen to feel
  right, not derived from any playtest; the economy lane should own tuning them once the village exists.
- **The peek-view is unbuilt and unbudgeted.** Cheap in theory — a couple of sprites keyed to a
  neighbour's Ledger — but never measured against the render lane's frame budget with more than one
  peek stacked into a scene.
- **Only the farm exists in code.** Every travel and gauge idea here is designed on paper against a
  settlement Ledger shape that has not been ported and has not passed a parity test.
- **The map's landmark hotspots are untested for touch.** A small barn icon may be too small to tap
  reliably on a phone; needs an interaction pass, not just an art pass.
- **DL's zero-sim-time crossing leaves a question open:** does a sheep she is riding cross instantly with
  her, or is that disallowed. Left for whoever designs direct actions in a settlement.

# Sheepcliff — Project Brief and Plan

A cozy, watchable, pixel-art digital civilization that grows out of Luna Farm. You watch it live, poke it with deity powers, and come back to find it changed.

---

## 1. Brief

### The one-liner
Sheepcliff is a little world on a cliff above the farm. Sheep, dogs, birds, villagers, and stranger creatures live there with their own needs, jobs, and moods. It runs by itself, grows by itself, has its own weather and incidents, and you are the sky above it: you can bless, curse, rain, drop things, move creatures, and summon events. It is meant to be watched the way you watch a fish tank, poked the way you poke Pocket God, and missed the way you miss a Tamagotchi.

### Pillars (in priority order)
1. **Watchable.** Five unattended minutes always show three things worth noticing. Nothing is static for long. Small life everywhere.
2. **Endearing.** Chibi proportions, hand-placed pixels, characters with habits. Charm over feature count. Digital Luna stays the heart.
3. **Alive.** Inhabitants act from needs, not scripts. Events emerge from state. Growth is visible: a surplus becomes a building, a building becomes a neighbour.
4. **Touchable.** Every tap does something visible within one second. Deity powers have reactions, not just effects.
5. **Refined.** Crisp pixels at every scale, no jank on a phone, saves that never break, a fixed palette, a sim you can test.

### Reference mapping
| Reference | What we take | What we leave |
|---|---|---|
| SimCity | Districts, growth from surplus, unlock tree, watching a place fill in | Grid zoning, taxes, menus of menus |
| Pocket God | Deity verbs with instant, funny reactions; picking creatures up; weather on demand | Cruelty as the main loop; Sheepcliff is cozy |
| Tamagotchi | Attachment through absence; "while you were gone"; needs you can neglect | Permadeath, guilt mechanics, alarms |
| Luna Farm v31 | Everything: art, sim priorities, pin overlay, weather, seasons, NPC job plans | The single-file structure and the if/else behaviour chain |

### What exists today
Luna Farm v31: a 640 by 400 isometric field in one self-contained HTML file. Hand-pixelled sheep and Digital Luna with about 30 animations, a vector barn and fences snapped to the palette, eight tinted backgrounds (four clock phases by normal and snow), needs-driven sheep, a priority-ordered dog, a farmer and a merchant with job plans, wool and coin economy with auto upgrades, weather with a live open-meteo mode, seasons, lambs, small life (bird, butterflies, rabbit), and a pin comment overlay for feedback. Built by a Python pipeline that compiles text grids into a sprite sheet and JSON. No persistence, no server, no tests beyond a frame build check and a headless smoke.

It is a very good seed. The taste is settled; the structure is what needs to grow.

### Assumptions this plan makes
The owner said go before answering the open questions, so the plan proceeds on these. Each is cheap to reverse now and expensive later; correct any that are wrong.

| # | Assumption | If wrong |
|---|---|---|
| A1 | Sheepcliff is the civilization that grows around Luna Farm. The farm is district one. DL is the mascot. | If it is a separate world, the art pipeline still carries over; the sim port is the same; only content changes. |
| A2 | A web app at a URL on your website, working on phone and desktop, installable as a PWA. | If it must stay a single local HTML file, drop the server phase and keep the one-file build target alongside. |
| A3 | Client-side simulation with offline catch-up first; server-side always-on world in Phase 3 as an option. | If always-on is required from day one, Phase 0 includes the Node worker and the timeline lengthens by about two weeks. |
| A4 | The code moves to a modular TypeScript project with a bundler. The Python art pipeline stays exactly as it is. | If you want to stay framework-free, the same structure works with plain ES modules and no types; testing gets weaker. |
| A5 | Agents may draw new grids in the established style, and every new sprite waits for your pin review. | If you draw everything yourself, art becomes the schedule's critical path and the cast grows slower. |
| A6 | Dozens of inhabitants per district at v1, hundreds later through the ledger layer. | If hundreds are required at v1, the Actor layer needs pooling and culling in Phase 1 instead of Phase 3. |
| A7 | Agent team runs as Claude Code remote sessions coordinated through GitHub, at the Standard budget tier (about four lanes at a time). Set to Standard 2026-09-02 after first choosing Lean. | Lean halves the parallel lanes and stretches each phase by about half. |
| A8 | Product name is Sheepcliff; the repo stays Sheep-City. | Rename is a one-line change in the plan and the app title. |

---

## 2. How to map a civilization without 1:1 physics

The trick is to simulate at three resolutions and let the camera decide which one you see. What is written here is checked against the tree, not remembered: the Ledger exists (`packages/sim/src/ledger/`, exported from `packages/sim/src/index.ts`, save version 5); the event engine, the chronicle, and the social graph are the next things built, in that order.

### Layer 1: the Ledger (numbers)
Every district has a small set of stocks and flows: food, wool, coins, wood, mood, population, shelter, and a few district-specific ones (fish for the harbour, honey for the wildwood). The Ledger ticks once per sim-minute, is pure arithmetic, and runs identically whether the district is on screen or not. It is also what runs during offline catch-up, so a week away costs milliseconds to simulate. The farm's Ledger shipped in PR #57: `summarise` reads the numbers off a running district, `advanceLedger` moves them without actors, `respawn` builds actors back from them with an exact round trip, `diffLedger` says what changed, and `catchUp` is the one policy that decides which resolution a gap runs at.

Growth is a settlement's. A settlement (Village Green first, then the harbour and the wood) keeps its own stocks; when a stock stays in surplus long enough the settlement builds something, and a build raises a cap, opens a trade, or lets a new kind of inhabitant arrive. Unlocks arrive the way research does, from the settlement's own stocks over time; nobody shops. The surplus rule runs inside `advanceLedger`, so a week away can build things. A build that changes no number and draws no pixel does not get a row; growth you cannot see did not happen.

The farm is different. Luna Farm is a space between spaces: it has a small Ledger of its own (flock, wool, coins, grass, the farmer's and the merchant's visits) and little growth. Its wool and coins enter the settlement economy as one input among several, not as its source. Farm builds are the owner's, may be purely aesthetic, and live in a separate table from the world's growth table; the three that ship today as no-ops (flowerbed, hay2, scarecrow) each get a disposition: change a number, draw a pixel, or go.

### Layer 2: the Actors (individuals)
Only the district on screen runs individuals. Each inhabitant has needs (hunger, rest, warmth, company, play, work), traits as data (timid, greedy, curious, loyal, and more as the cast grows), a job or role, a home, one habit you can predict and one secret you can discover. A behaviour registry replaces the prototype's if/else chain: every behaviour is an object with an id, a priority, a condition, and a tick. Each sim-second an actor picks the highest-priority behaviour whose condition holds, with a little weighted randomness so it never looks like a spreadsheet. DL keeps her exact priority order from the prototype (fetch, manual, riding, rain shepherd, dusk and dawn routine, idle play); she is just the first entry in the registry.

Inhabitants are connected. A social graph holds edges between them (family, bond, rivalry, and later apprenticeship and trade), formed by proximity, shared events, and time together, and fading without contact. The graph is what makes a week away mean something no card authored: two lambs that grew up side by side are bonded; a village that went short on grain remembers who shared. Edges are summarised into the Ledger with the actors and respawned with them.

Two kinds of habit sit above the individual. Category actions apply to every inhabitant of a type: sheep grow wool, farmers rise early and walk to the market, sailors toss a coin into the harbour before a voyage. Individual habits and secrets are the inhabitant's own. Both live in the registry; the difference is who they bind to.

Digital Luna cannot be harmed. Not by weather, an event, another inhabitant, or a power, on screen or off. This is an invariant of the sim with a test that never leaves the suite, not a phase rule.

Actors read and write the Ledger: a sheep grazing lowers a tuft and later raises wool; a villager working the market converts wool to coins. When a district leaves the screen, its actors and their edges are summarised into the Ledger and thrown away. When it returns, they are re-spawned with plausible positions and states. The player never sees the seam because the transition happens behind a district change.

### Layer 3: the event engine (events)
There is no Director as a thing in the code (the word is retired); the engine directs, and events happen in the world. It looks at the world every sim-minute and draws from three sources.

Cards are data, one row each, so adding an event is adding a row. A card (v2, the schema the fifteen farm cards migrate to now, not at fifty) has: `conditions` that read world state, not only the clock and the weather (season, weather, time band, any Ledger stock, any actor predicate such as "a lamb is far from its mother", "DL is far from the flock", "the flock is scattered"); a `weight` that is a live multiplier, a base times factors from those same predicates, so a lost lamb is not "needs a lamb, weight 3" but "needs a lamb, and far likelier when the flock is scattered, DL is far from the lamb, and it is near dusk"; `limits` (never more than N of this card at once, a minimum gap between draws, a cooldown); a duration; hooks (named effects the sim implements); a story line with a notability hint; and a moment kind the watch test counts. Every card is small or big (decision 16). The engine draws in world time: a small thing on most farm days, a big thing a few times a farm month; never more than N cards concurrently; a minimum gap per size; big things only while the farm is watched, small things also while it is unwatched (drawn at farm-day resolution during catch-up and told to the chronicle); and nothing is forced, so a quiet farm day is allowed.

Authored events are the punctuation: a seasonal festival, a storm, a wolf sighting, DL's birthday. Each has a trigger (parameters, a time, a threshold reached in a stock, a number of inhabitants or coins) and authored variables that a card does not get. When an authored event and a card share parameters, the authored event wins, so a small random card never steps on something with a more interesting result. The owner can trigger and reset world-impacting events from the interface, and can set the pieces for a larger event without dictating its outcome.

Category actions run here too, as scheduled type-wide behaviours (the market walk at dawn, shearing when the fleeces are ready), because they are world rhythm rather than one inhabitant's choice.

### The chronicle and the storybook
The chronicle is the whole world's log. Every entry is a recorded fact: a sentence in the past tense, a picture key, the inhabitants involved, the district, the sim time, and a notability score. Any system writes to it through one interface, `tell`: cards and authored events, the Ledger diff, the social graph ("Moss and Pip bonded over the winter"), the economy ("the quarry village went short on grain", "a ship of the line was launched at the harbour"). Nothing is ever dropped; the chronicle is the history of a world that ran, not a list of events that were dealt.

The storybook is what you read when you come back. It is a selection over the chronicle for the time away, never new prose: the storybook only tells, and a line without a chronicle entry behind it is a bug. Selection is by notability, not size or recency. A number is notable by deviation from that world's own normal (fourteen wool in a week is a fact; fourteen when you usually get forty is a story) and by firsts (the first lamb of a new ewe, the first snow of the season, the first tall ship). A night is a list of moments; a week is a shape, what changed over it, which is exactly the kind of line the graph and the economy produce and a card cannot. Every page is stored and can be reopened. In Phase 1 nothing dies while you are away; DL's protection is not phase-scoped.

### Places and moving between them
Each district is a scene the size of the farm, but the region is a system, not a set of scenes: which districts exist, how the camera moves between them, what travels between them and how long it takes, what the player can see of a district they are not standing in, and how a gauge such as the harbour reads from the map. That system is designed before any Village Green content is built, so the village is not built against the assumption that there are two places. The harbour is both a gauge of the settlement economy and a set piece, and it is not the only gauge; it reads "poor" honestly until the economy earns better. The foundation is the interconnectedness, the spontaneity, the charm and the small habits, not any one place as the centre.

### Time
Sim time is decoupled from wall time. One sim-day is about three real minutes when watching (the prototype's 180-second clock period), and about one real day when away. Seasons follow the real year (owner's decision, 2026-09-08): four seasons across one real year, northern hemisphere, each roughly a quarter of it but not exactly, and not starting on the same date every year; a little seeded drift is the point. Digital Luna's birthday is December 15, a real date, so a world that starts in June waits for it. The sim advances in fixed 100-millisecond steps with a seeded random generator, so the same seed and inputs give the same world. That determinism is what makes it testable and what makes a future server trivial: the server runs the same package.

### Deity powers as inputs
Every power is an intent object (`{type: "bless", target: id, at: tick}`) applied at a tick boundary. Powers are the only way the outside world touches the sim. That keeps the sim pure and makes the server path a queue of intents rather than a rewrite.

### Scale in numbers
| Thing | v1 target | Later |
|---|---|---|
| Districts | 2 | 4 to 6 |
| Actors on screen | 20 to 40 | 60 with pooling |
| Inhabitants in the Ledger | 100s | 1,000s |
| Cards (v2 schema) | 15 | 50 plus |
| Authored events | 3 | 12 plus |
| Chronicle entries | unbounded, kept forever | the same |
| Behaviours | 30 | 80 plus |
| Frame rate on a mid phone | 60 | 60 |

---

## 3. The world

Sheepcliff is a cliff-top settlement. The farm sits in the lee of the cliff; a lane climbs to a village green; the cliff edge looks over a small harbour; behind it all is a wildwood. Each district is a scene the size of the current farm (640 by 400 world pixels), reached from a hand-drawn world map, so the prototype's scene model stays intact and each new district is one background plus content.

| District | Phase | Inhabitants | Buildings | Signature moments |
|---|---|---|---|---|
| Luna Farm | exists | DL, sheep, lambs, farmer, merchant, rabbit, birds | barn, trough, hay, gate, upgrades | rain shepherding, ride a sheep, shearing day |
| Village Green | 2 | villagers (baker, weaver, kids, an old shepherd), cats, chickens, a goat | cottages, well, market stall, bakery, bench | market day, kids chasing chickens, lantern lighting at dusk |
| Cliff Harbour | 3 | fisher, gulls, a seal, a lighthouse keeper | jetty, boats, lighthouse, crab pots | boats out at dawn, storm watch, seal on the rocks |
| Wildwood | 3 | deer, foxes, owls, bees, a hermit | hives, a shrine, a fallen log | fox raid on chickens, DL versus the crows, autumn leaf fall |

Growth links districts: wool from the farm feeds the weaver; bread from the bakery raises farm mood; fish feeds the village in winter; honey unlocks the festival. A player who only ever watches sees the links as caravans and carts moving on the map. The farm itself is a space between spaces: it grows little, its builds are the owner's, and the world's growth happens in the settlements.

### Inhabitant design rules
- Every inhabitant has one habit you can predict (the baker hums at dawn, the goat climbs the trough) and one secret you discover (the old shepherd was DL's first owner).
- Nobody dies by default. Neglect makes things grumpy, mossy, and quiet, never tragic. A hardcore toggle can come later.
- Digital Luna cannot be harmed. Not by weather, events, other inhabitants, or a power. Ever.
- Ten inhabitants with habits beat fifty with none. The cast grows by phase, not by sprint.

### Deity powers (v1, in build order)
| Power | Input | Reaction within 1 s | Ledger effect |
|---|---|---|---|
| Weather | tap the sky icon, choose | clouds roll, sheep look up | mood, grass growth |
| Bless | long-press an inhabitant | sparkles, heart bubble, a little dance | mood up, need met |
| Drop | drag from tray (hay, coins, seeds, a stick) | item lands with a bounce, nearest actor reacts | stock up |
| Direct action | tap an inhabitant, pick a trick or task from its list | it does the thing, with a bubble | depends on the action |
| Summon | tap the bell, choose (merchant, festival, storm, wolf) | an arrival beat | event enters deck immediately |
| Nudge time | hold the clock | fast forward with a whoosh | ticks advance |

Owner's direction (2026-09-02): weather first, and the ability to trigger individual actions on individual inhabitants (the prototype's action list, made per-creature) is a must. No picking up and moving creatures. Pocket God is a reference for reaction quality, not for the verbs. Curse, if it comes at all, comes late and stays mild.

---

## 4. Player experience

- **Frame.** Portrait phone first: the scene fills the width, a tray below holds powers and the district map. Landscape shows the scene bigger with the tray as an overlay. Desktop is a large phone.
- **Session shape.** Open, see a "while you were gone" storybook of three beats, watch for a minute, poke twice, leave. The app is designed for two-minute visits and thirty-minute stares.
- **Feedback stays in.** The pin overlay is a first-class feature; it is how the owner reviews every build, and it keeps working with clipboard and downloads blocked.
- **No menus of menus.** One tray, one map, one settings sheet.
- **Sound** arrives in Phase 3, off by default, small and warm.

---

## 5. Technical architecture

```
sheep-city/
  apps/web/            Vite PWA. Renderer, input, tray, deity UX, pin overlay.
  packages/sim/        Pure TypeScript. Clock, RNG, Ledger, Actors, event engine, chronicle, social graph, save/migrations.
  packages/render/     Canvas 2D sprite drawing, layers, camera. Ports build/farm.js.
  packages/content/    JSON: creatures, people, buildings, districts, events, balance, names.
  tools/art/           The Python pipeline, moved verbatim from prototype/luna-farm/src.
  tools/qa/            Watch test, soak runner, golden screenshots.
  prototype/luna-farm/ Frozen v31 reference. Never edited; only read.
  docs/                This plan, the framework, charters, style guide, world bible.
```

**Sim core.** No DOM, no timers, no `Math.random`. `step(state, intents, dt)` returns a new state. Tests run thousands of sim-days in seconds. A determinism test replays a seed and asserts equal state hashes.

**Renderer.** Native-pixel canvas scaled with `image-rendering: pixelated`, UI on a full-resolution layer, exactly as the prototype does. Sprite sheet and JSON come straight from the Python pipeline. Layers: background, ground stamps, actors sorted by foot y, bubbles, weather, lights.

**Content.** Data files with JSON schemas. A new event or building is a data PR with a Low gate. A new creature is data plus art, High gate.

**Deploy target.** The Garage (lab.sheepcliff.com), tile `sheep-city`, served at sheep-city.sheepcliff.com. Deploys authenticate with a bearer token read from the `GARAGE_TOKEN` environment variable. The exact upload API is documented in `docs/DEPLOY.md` once observed.

**Persistence.** Versioned save in localStorage plus an export-as-text fallback (downloads may be blocked). Every schema change ships a migration and a fixture test. Phase 3 adds an optional server: a Node worker runs the same sim package, the client sends intents and receives state deltas over WebSocket, and the world stays alive while everyone is away.

**Quality bar in CI.** Typecheck, unit tests, determinism test, art frame build, palette diff (zero new colours unless declared), lane ownership check, bundle size budget, Playwright smoke, golden screenshots at four phases by two weathers, and the watch test.

**Art pipeline.** Unchanged. `pixel_grids.py` and `hand_sprites.py` stay the source of truth; `render_v3.py` gains a per-district background list and outputs into `apps/web/public/sheets/`. A `STYLE_GUIDE.md` captures the rules from the handoff so agents can draw in style, and every new sprite waits for pin review.

---

## 6. Phases

Each phase has exit criteria you can check at the live URL. There are no calendar estimates: the owner's pins set the pace, and the budget page tracks cost.

### Phase 0 — Foundation
Goal: the farm plays identically at a URL on your phone, from a codebase agents can work in.
- Repo scaffold, CI, deploy to the dev URL on merge (infra).
- Port the sim to `packages/sim` with the behaviour registry, fixed timestep, seeded RNG; parity tests against the prototype's `RULES` and observed behaviour (sim).
- Port the renderer and input; portrait frame; pin overlay carried over (client).
- Move the art pipeline to `tools/art`, add frame-build and palette checks to CI (art, infra).
- Save and load v1 with migration harness (sim, infra).
- Watch test and first golden screenshots (qa).

Exit: v31 parity at the live URL, saves survive reload, CI green, watch test passes, you have pinned it once. Owner's rule (2026-09-02): nothing new merges to the live build before this pin, but Phase 1 content work runs in parallel and queues behind it.

### Phase 1 — Alive
Goal: the farm surprises you, and the world starts writing its own history.
- Cards v2 schema and the fifteen farm cards migrated to it (world).
- The chronicle with the open `tell` interface; the Ledger diff and every card start and end write to it (sim).
- The event engine: cards v2 runtime, concurrency and gap limits per size in world time (the quiet relaxation retired by decision 16), authored events with priority, category actions for sheep and the farmer, the four reference events (sim).
- The DL invariant test: nothing can harm her, fuzzed and kept in the suite (sim).
- Social graph v1: traits, edges, and the first three edge-forming behaviours (grooming, headbutts, lamb zoomies), with their frames (sim, then art for the owner's pin).
- Deity powers: weather first, then direct actions on one inhabitant (sim, then client for the owner's pin).
- The storybook: whole world, selected by notability, every page kept and reopenable (client, owner's pin).
- Crows moved by the engine; DL chases them off (sim; the frames are already pinned).
- Region map navigation designed as a document before any village content (client and sim, owner's pin on the design).
- Disposition of flowerbed, hay2, scarecrow: change a number, draw a pixel, or go (sim).

Exit: a farm day holds a small thing on most days and a big thing a few times a farm month, in world time, measured over thirty seeds and thirty farm days; big things happen only while watched; small things keep happening while away and reach the storybook; nothing is forced (decision 16); a scripted week away yields a storybook page whose every line traces to a chronicle entry, at least one written by the social graph; three powers react within ten ticks; the map design is pinned.

### Phase 2 — Village
Goal: Sheepcliff is a place, not a field.
- The region map built to the pinned design, before any Village Green content (client, sim).
- Village Green as a settlement: its own Ledger, its growth table, five villagers with traits and edges on the graph, cats and chickens, cottages, well, market (world, art, sim).
- The harbour as an economy gauge, reading "poor" first and honestly (economy, world).
- The farmer rework, shear readability, and DL's animation set (sim, art, client; owner's pins on frames).
- Bless, drop, summon (client, sim).
- Category actions for villagers; households, jobs, and a daily schedule per villager (sim, world).
- Sound sketch: four ambient loops, off by default (client).

Exit: two districts on the map with visible travel between them; a settlement build appears from surplus with nobody shopping; every villager has a habit you can predict and at least one edge on the graph; the harbour gauge moves when the economy moves.

### Phase 3 — Civilization
Goal: growth you can come back to.
- Cliff Harbour and Wildwood (art, world).
- Cards to 50 on the v2 schema with seasonal and cross-district events; the festival and the wolf as authored events (world, sim).
- Optional server: always-on world worker, intent queue, state deltas (infra, sim).
- Actor pooling and culling for 60 on screen (sim, client).
- Curse, nudge time, and a settings sheet (client).
- Onboarding: the first minute explains itself without text (client, qa).

Exit: four districts, thirty inhabitants with habits, a week away yields a visibly grown town, 60 frames per second on a mid phone.

### Phase 4 — Refine (ongoing)
Polish passes driven by pins, performance, sharing a read-only view of your world, seasonal content drops. This is the steady state the framework is built for.

---

## 7. Work breakdown by lane

| Lane | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| sim | port, registry, RNG, save v1 | chronicle, event engine, DL invariant, social graph v1, deity intents | settlement Ledger, map system, category actions for villagers, households, schedules | pooling, server worker, wolf logic |
| world | schemas, farm content extracted | cards v2 schema, fifteen cards migrated, first authored events | village content, growth table data, harbour gauge data | harbour and wildwood content, cards to 50 |
| art | pipeline move, style guide | crow (done), social frames, art direction document | village background, five villagers, cats, chickens, farmer rework, DL animation set | two backgrounds, harbour and wood cast |
| economy | balance file for farm | ledger soak, disposition of farm builds | settlement growth thresholds, harbour gauge | seasonal tuning |
| client | renderer port, portrait frame, pin overlay | storybook, powers in the tray, map design document | map built, shear readability, two powers, sound sketch | curse, time, settings, onboarding |
| infra | scaffold, CI, deploy, migrations | palette and ownership checks | preview builds | server deploy |
| qa | watch test, goldens | event coverage against the chronicle | district switch tests | phone performance suite |

Suggested lane activation under Standard: Phase 0 runs infra, sim, client, and art on the port. In parallel, and from day one, world and art may start Phase 1 content that does not touch the port: the farm event deck as data, the crow brief and crow frames, the style guide. That work waits in reviewed pull requests and merges only after the port is pinned. Phase 1 adds qa; Phase 2 adds economy.

---

## 8. The first ten tickets

These seed the backlog so the team can start the morning after you say which assumptions to change.

1. infra: repo scaffold (npm workspaces, Vite app, TypeScript, Vitest, Playwright) with a hello-canvas page deployed to the dev URL.
2. art: move `prototype/luna-farm/src` to `tools/art`, output to `apps/web/public/sheets`, CI job that builds every frame.
3. sim: clock, seeded RNG, fixed-step loop, state type, determinism test.
4. sim: behaviour registry with DL's priority chain and sheep needs ported at parity.
5. client: renderer port of `farm.js` plus background phases and weather layers.
6. client: input, tap verbs (pet, shear, stick), portrait frame, pin overlay.
7. sim: save v1 with migration harness and fixture test.
8. qa: watch test runner and four-phase golden screenshots.
9. world: extract farm content (tufts, spots, upgrades, NPC job plans) into `packages/content` with schemas.
10. infra: palette diff and lane ownership checks in CI.

---

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Port loses the feel of v31 | Medium | Parity tests on `RULES`, side-by-side golden screenshots, owner pins the port before anything new lands |
| Art becomes the bottleneck | High | Agents draw within the style guide; every sprite is pin-reviewed but never blocks sim work; placeholders are the existing sheep with a tint, never a new style |
| The if/else chain gets copied instead of replaced | Medium | Registry is ticket 4 and a Phase 0 exit criterion |
| Owner review overload | Medium | Three-pin cap, digest, Low gate for data |
| Save corruption on upgrades | Medium | Versioned saves, fixture tests, export-as-text |
| Server phase drags | Medium | It is optional and last; the sim is pure from day one so it stays cheap |
| Cozy turns into a spreadsheet | Medium | Watch test, pillars order, every feature ticket names its visible beat |

---

## 10. How we know it is working

- Watch test: thirty farm days at thirty seeds on every build: a small thing on most days, a big thing a few times a month, none while unwatched; the counts written beside the floors (decision 16).
- Reaction latency: every deity power shows a beat within one second.
- Absence: a day away yields a storybook with three true events.
- Growth: a week away yields a visible new building without input.
- Refinement: 60 frames per second on a mid phone, zero new colours without approval, zero sprite transforms, saves survive every upgrade.
- Endearment: you keep coming back. The digest tracks how often the dev URL was opened by you; the number should go up.

---

## 11. Open decisions for the owner

Answer in one comment whenever convenient; the defaults are the assumptions in section 1.

1. Confirm A1 to A8 or correct them.
2. Budget tier: Standard, set 2026-09-02 after first choosing Lean.
3. The live dev environment: answered 2026-09-02. Builds deploy to the owner's private lab, The Garage, at lab.sheepcliff.com, tile `sheep-city`, live at sheep-city.sheepcliff.com. The Garage token lives only in the environment configuration, never in the repo. Agent sessions need lab.sheepcliff.com and sheep-city.sheepcliff.com on the environment's network allowlist.
4. Whether you want the two missing Sheepcliff artifacts folded in (attach them like the zip).
5. Deity powers: weather first, then direct per-inhabitant actions. No pick-up-and-move. Confirmed 2026-09-02.
6. Daily status note: an artifact page, updated daily, chosen 2026-09-02. A pinned GitHub issue keeps the record.
7. Phase 0 started 2026-09-02 on the owner's go. Tickets #2 to #11; first three workers spawned. Passed the same day: the owner merged the real sim (PR #34) and flipped the live tile (PR #50).
8. Event layer and world model, 2026-09-02 23:15 UTC: an engine, not a Director; cards v2 now at fifteen cards; a chronicle any system writes to; a whole-world storybook that keeps every page and only tells; settlements grow and the farm does not; DL unharmable as an invariant. Recorded in section 2; the Phase 1 and 2 lists follow it.
9. The owner's operating rules (check-in cadence, model choice while a usage window is spent) live in `docs/agents/ROSTER.md`, not here.
19. The farm's builds are there from the start, 2026-09-09 22:50 UTC: the owner, asked whether the flowerbed, hay2 and the scarecrow should keep buying themselves from the settlement's purse or wait for their hand: "Just leave them on Luna farm. Like keep them there from start." So: all three are part of Luna Farm from a world's first day; nothing buys them; `buyUpgrades` is retired; existing saves get them on first load (save v10). The settlement's purse keeps accruing at the market and buys nothing yet. Section 3's "farm builds are the owner's" stands: these three are the farm's furniture, not growth. Sim ticket.
20. AP style for the storybook's counts, 2026-09-09 22:50 UTC: the owner, asked whether "1577 times this week" should read as a number or as shape words: "Follow AP style rules." So: one through nine spelled out (and "twice"), 10 and above numerals with a comma from 1,000 ("1,577 times this week"). Client ticket.
18. The player's day, 2026-09-09 15:45 UTC: the owner, asked whether Sheepcliff's calendar day is the UTC day or their own: "my day, not the world's day". So: the client hands the sim local civil time as the world's real epoch; December 15 and every season start fall on the player's own calendar day; the sim itself stays time-zone-free. A pinned `?realNow=` is a world's own date with no offset. Built in #84 (PR #118); the question was filed as #119.
17. The birthday is never lost, 2026-09-09 14:40 UTC: the owner, on hearing that a real-date birthday which is a big thing would be skipped in a year nobody watches on December 15: "that is not good. Maybe it should hold until I am viewing or we need like a reminder?" So: on December 15 in the world's real calendar the birthday becomes due and stays due until the first watched step, whenever that is; it still never starts on the unwatched path (decision 16 holds); once a real year at most. Built in #84. A reminder in the client (the tray, in the days before and on the day) is a separate client ticket. A held event is the pattern for any future dated big thing.
16. Pace in world time; small and big, 2026-09-09 00:00 UTC: the owner: "small thing most days, big thing a few a month; the big ones should not happen when I am not watching; the weight is for what is big or small." So: every card carries a size, small or big. Small things draw on most farm days and keep drawing while the farm is unwatched (at farm-day resolution during catch-up, told to the chronicle and so to the storybook). Big things draw a few times a farm month and only while the farm is watched (a live, visible tab). Nothing is forced: the quiet-stretch relaxation is retired; a quiet farm day is allowed. Pace is described in world time only; "about three moments per five real minutes" (decision 11) and the three-kind bar (decision 14) are withdrawn. Sim ticket for the engine; world ticket for the sizes; the deck PR (#99) keeps its coverage work and drops its pace retune.
15. Bundle budget, 2026-09-08 21:40 UTC: the web bundle's JavaScript budget rises from 128 to 192 kB (total 400 to 464 kB) because the event engine ships in the bundle (164 kB of JavaScript, 58 kB gzipped, at the merge). Raised rather than trimmed first so trunk goes green now; a client-lane ticket measures the gzipped download on a real phone and trims the card data if it matters.
14. The engine's pin, 2026-09-08 20:55 UTC: merged as it stands (PR #82). The Phase 1 exit line is restated as "about three moments per five minutes, none silent"; three distinct kinds in a majority of seeds moves to the deck ticket (#86); no pacing number moves. The earlier three-kind numbers were propped up by the birthday firing at world start, which the December 15 decision removed.
13. Deity weather hold, 2026-09-08 19:00 UTC: a sky power holds for three hours of world time by default, whatever the day length (22.5 real seconds at the three-minute day), then hands back to the season. Recorded on PR #90.
12. The economy is not the farm's, 2026-09-08 17:40 UTC: no transaction happens on the farm. The merchant's caravan is a passer-by on the road between places (a moment: sheep stare, Digital Luna trots the fence); wool leaves with the farmer's dawn market walk and is sold in the settlement's ledger, off screen until Village Green exists; coins become a settlement stock and the farm's ledger keeps wool, grass, and the flock. Cards that hand the farm coins (the windfall, the dug-up purse) are reviewed under the same rule. Also: a seed is a world; the farm belongs to the owner's world and a world may be created without it (districts as a per-world list), to be built after the engine lands.
11. Digital Luna's dusk order, 2026-09-08 17:30 UTC: "fetch wins". Fetching a lost lamb sits above bedtime in her chain (below rain shelter, riding, and the stick), so a lamb out at dusk is a job, not a night in. Pacing target for the event engine: about three moments per five real minutes, not five; a warm-up with no card draws in a fresh world's first minute; the merchant comes when there is wool to sell.
10. Calendar, 2026-09-08 15:45 UTC: Digital Luna's birthday is December 15. Seasons are no longer nine real days; they follow the real year, four across it, roughly a quarter each with seeded variation in length and start. Recorded in section 2 (Time); tickets in the world and sim lanes carry it.

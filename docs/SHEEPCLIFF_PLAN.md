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

The trick is to simulate at three resolutions and let the camera decide which one you see.

### Layer 1: the Ledger (numbers)
Every district has a small set of stocks and flows: food, wool, coins, wood, mood, population, shelter, and a few district-specific ones (fish for the harbour, honey for the wildwood). The Ledger ticks once per sim-minute, is pure arithmetic, and runs identically whether the district is on screen or not. It is also what runs during offline catch-up, so a week away costs milliseconds to simulate.

Growth lives here. A sustained surplus in a stock crosses a threshold and triggers a build (a new cottage, a second trough), and a build raises a cap (population, flock size). This is the SimCity part, reduced to a dozen numbers per district.

### Layer 2: the Actors (individuals)
Only the district on screen runs individuals. Each inhabitant has needs (hunger, rest, warmth, company, play, work), a small set of traits (timid, greedy, curious, loyal), a job or role, and a home. A behaviour registry replaces the prototype's if/else chain: every behaviour is an object with an id, a priority, a condition, and a tick. Each sim-second an actor picks the highest-priority behaviour whose condition holds, with a little weighted randomness so it never looks like a spreadsheet. DL keeps her exact priority order from the prototype (fetch, manual, riding, rain shepherd, dusk and dawn routine, idle play); she is just the first entry in the registry.

Actors read and write the Ledger: a sheep grazing lowers a tuft and later raises wool; a villager working the market converts wool to coins. When a district leaves the screen, its actors are summarised into the Ledger (how many, how fed, how happy) and thrown away. When it returns, actors are re-spawned from the Ledger with plausible positions and states. The player never sees the seam because the transition happens behind a district change.

### Layer 3: the Director (events)
A Director looks at the world every sim-minute and decides whether something should happen. It keeps a pacing curve (quiet, rising, incident, resolution) like a film editor, and draws from an event deck. Each event has conditions (season, weather, stocks, time of day, recent history), a weight, a duration, a visible beat that shows within one second, and a Ledger effect. Examples: a merchant caravan when coins are low, crows when grain is high, a festival after a good harvest, a fog morning in autumn, a lost lamb at dusk, a wolf sighting in winter that DL and the villagers handle together. The Director also runs "while you were gone" by replaying the offline period at Ledger resolution and picking three events to tell you about as a storybook.

### Time
Sim time is decoupled from wall time. One sim-day is about three real minutes when watching (the prototype's 180-second clock period), and about one real day when away, with seasons of nine real days as today. The sim advances in fixed 100-millisecond steps with a seeded random generator, so the same seed and inputs give the same world. That determinism is what makes it testable and what makes a future server trivial: the server runs the same package.

### Deity powers as inputs
Every power is an intent object (`{type: "bless", target: id, at: tick}`) applied at a tick boundary. Powers are the only way the outside world touches the sim. That keeps the sim pure and makes the server path a queue of intents rather than a rewrite.

### Scale in numbers
| Thing | v1 target | Later |
|---|---|---|
| Districts | 2 | 4 to 6 |
| Actors on screen | 20 to 40 | 60 with pooling |
| Inhabitants in the Ledger | 100s | 1,000s |
| Event deck | 25 events | 80 plus |
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

Growth links districts: wool from the farm feeds the weaver; bread from the bakery raises farm mood; fish feeds the village in winter; honey unlocks the festival. A player who only ever watches sees the links as caravans and carts moving on the map.

### Inhabitant design rules
- Every inhabitant has one habit you can predict (the baker hums at dawn, the goat climbs the trough) and one secret you discover (the old shepherd was DL's first owner).
- Nobody dies by default. Neglect makes things grumpy, mossy, and quiet, never tragic. A hardcore toggle can come later.
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
  packages/sim/        Pure TypeScript. Clock, RNG, Ledger, Actors, Director, save/migrations.
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

Weeks assume the Standard tier (about four lanes active). Each phase has exit criteria you can check at the live URL.

### Phase 0 — Foundation (weeks 1 to 2)
Goal: the farm plays identically at a URL on your phone, from a codebase agents can work in.
- Repo scaffold, CI, deploy to the dev URL on merge (infra).
- Port the sim to `packages/sim` with the behaviour registry, fixed timestep, seeded RNG; parity tests against the prototype's `RULES` and observed behaviour (sim).
- Port the renderer and input; portrait frame; pin overlay carried over (client).
- Move the art pipeline to `tools/art`, add frame-build and palette checks to CI (art, infra).
- Save and load v1 with migration harness (sim, infra).
- Watch test and first golden screenshots (qa).

Exit: v31 parity at the live URL, saves survive reload, CI green, watch test passes, you have pinned it once. Owner's rule (2026-09-02): nothing new merges to the live build before this pin, but Phase 1 content work runs in parallel and queues behind it.

### Phase 1 — Alive (weeks 3 to 4)
Goal: the farm surprises you.
- Ledger for the farm district; offline catch-up; "while you were gone" storybook (sim, client).
- Director with a pacing curve and a 15-event farm deck: fog morning, crows, lost lamb, merchant caravan, shearing day, DL's birthday (sim, world).
- First deity powers: weather, then direct actions on individual inhabitants (client, sim).
- Flock social behaviours from the backlog: grooming, headbutts, lamb zoomies (sim, art for two new frames each).
- Crows as the first new creature, DL chases them off (art, world, sim).

Exit: five unattended minutes show three moments; a day away produces a storybook; three powers react within one second; crows pinned and approved.

### Phase 2 — Village (weeks 5 to 8)
Goal: Sheepcliff is a place, not a field.
- World map and district switching; Ledger summarise and re-spawn (sim, client).
- Village Green: background, five villagers, cats and chickens, cottages, well, market (art, world).
- Economy loop across districts: wool to weaver, bread to farm, coins to buildings; unlock tree with six visible builds (economy).
- Bless, drop, summon (client, sim).
- Households, jobs, and a daily schedule per villager (sim, world).
- Sound sketch: four ambient loops, off by default (client).

Exit: two districts linked by visible carts; a build appears from surplus without your help; every villager has a habit you can predict.

### Phase 3 — Civilization (weeks 9 to 14)
Goal: growth you can come back to.
- Cliff Harbour and Wildwood (art, world).
- Full event deck to 50 with seasonal and cross-district events; festival; wolf incident (world, sim).
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
| sim | port, registry, RNG, save v1 | Ledger, Director, catch-up, social behaviours | district summarise/respawn, households, schedules | pooling, server worker, wolf logic |
| world | schemas, farm content extracted | farm event deck, crow brief | village content, unlock tree data | harbour and wildwood content, deck to 50 |
| art | pipeline move, style guide | crow, social frames, bless sparkles | village background, five villagers, cats, chickens | two backgrounds, harbour and wood cast |
| economy | balance file for farm | ledger numbers, soak test | cross-district loop, unlock thresholds | seasonal tuning |
| client | renderer port, portrait frame, pin overlay | storybook, three powers | map, two powers, sound sketch | curse, time, settings, onboarding |
| infra | scaffold, CI, deploy, migrations | palette and ownership checks | preview builds | server deploy |
| qa | watch test, goldens | event coverage | district switch tests | phone performance suite |

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

- Watch test: five unattended minutes, three distinct moments, on every build.
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
7. Phase 0 started 2026-09-02 on the owner's go. Tickets #2 to #11; first three workers spawned.

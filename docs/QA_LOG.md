# QA log

Runs of the watch test and golden screenshots, newest first. Tooling lives in
`tools/qa/` (usage and the client-lane contracts in `tools/qa/README.md`) and
`apps/web/e2e/`. Charter: `docs/agents/charters/qa.md`.

## 2026-09-09 — chronicle coverage and moment-kind update (#49)

Retargeted mid-flight: plan decision 16 (2026-09-09) withdrew the five-minute,
three-distinct-kind bar as the Phase 1 exit line; pace is now described in
world time only (a small thing most farm days, a big thing a few a farm
month, big only while watched), and that bar's own coverage is issue #101's
card-size ticket, not landed tonight. So this run does: (1) an e2e that walks
the storybook card's *rendered DOM text*, not just its JS objects, against
`sim().chronicle`, for both golden cases and for "earlier pages" reopened from
the farm bar; (2) a new `--events` mode for the watch test that reports, per
farm card and per authored event, whether it was ever seen starting and
ending over a scripted season × weather span, and fails only a card that is
statically unfireable; (3) the moment-kind table update, marking the
five-minute bar withdrawn and documenting the engine's own kinds, the
chronicle's sources, and one real gap those turned up (filed, not fixed).

### Landed

- `apps/web/e2e/chronicle-coverage.spec.ts`: three tests. Two open the golden
  cases' own `?seed=17&gap=120|10080&freeze=1&t=0.2` and check, at the DOM
  layer: every `.storyline span`'s text is exactly its chronicle entry's own
  `line` (not just the `StorybookPage` object's copy of it), every entry id
  anywhere on the card — shown or behind "and N more" — exists in
  `sim().chronicle`, and nothing else on the card is client-composed text
  except `#storyTitle`, `#storySubtitle`, and the "and N more" label itself
  (walks every leaf element under `#storybookCard` and fails on any stray
  text). The third test reproduces "earlier pages": opens a *running* world
  (seed 17, gap 120 — the same pair `sim.spec.ts`'s "and N more" test already
  measured at 5 shown + 3 more = 8 lines), dismisses the page, reopens it from
  the farm bar's "earlier pages" list, and checks every one of the same
  invariants holds on the reopened card, including after tapping "and N more"
  again — and that it is the very same page (same lines, same title, same
  subtitle), not a fresh selection over an unchanged chronicle.
- `tools/qa/watch-test.mjs --events` (plus `tools/qa/lib/deck.mjs`,
  `tools/qa/lib/deck-coverage.mjs`): seeds the app on its own QA clock, holds
  each of 4 seasons × 3 weathers in turn (`send({type:'setSeason'/'setWeather'})`,
  both of which lock, unlike `setClock`) for a few short simulated days each,
  then reads `sim().events.starts`/`.cooldowns` (set once and never cleared,
  so a single read at the end sees the whole span) against every id in
  `FARM_DECK` (`@sheepcliff/sim`'s own export, via `deck.mjs` — esbuild
  bundles `engine/deck.ts` in-memory since the package ships as raw
  TypeScript with no build step, so this is the real `loadDeck()`, not a
  second parse of the JSON). Fails only on `neverEligibleCards`: a card whose
  own `season`/`timeOfDay` conditions admit no combination at all — none
  found in `farm.json` today (checked by hand against all 15, and the tool
  agrees). Everything else is a report, not a gate.
- `tools/qa/README.md`: the five-minute bar marked withdrawn, pointing at
  decision 16 and the farm-day bar following #101; a `--events` usage section;
  a new subsection distinguishing the client's `moment` DOM kinds from the
  engine's own `card.moment.kind` vocabulary (same five words, not wired to
  `diffMoments`, which is why `--events` reads the chronicle directly instead
  of listening for `moment`) and from `CHRONICLE_SOURCES` (`card`, `authored`,
  `ledger`, `social`, `economy`, `category`, `deity`), naming `event:start`/
  `event:end` as a doc-only convention for the chronicle's own two moments per
  running event id.

### `--events` mode, built app, seed 7, 3 s days, 300 s budget (12 combos × 25 s each)

```
$ node tools/qa/watch-test.mjs 300 --events --serve apps/web/dist

card/authored coverage over the scripted span (seed 7, 12 combos × 25.0 qa-clock s):
  id                    kind      moment      start end    note
  fogMorning            card      weather     no    no
  crowsOnTheField       card      dl-trick    yes   yes
  lostLamb              card      lamb        no    no
  merchantCaravan       card      npc-arrival yes   yes
  shearingDay           card      bubble      yes   yes
  rainbowAfterRain      card      weather     no    no
  strayCatVisits        card      dl-trick    no    no
  farmersDayOff         card      dl-trick    no    no
  nightOfTheFireflies   card      dl-trick    no    no
  lambZoomiesHour       card      lamb        no    no
  wellRunsLow           card      bubble      no    no
  windfall              card      bubble      yes   yes
  stargazingNight       card      dl-trick    no    no
  flockHuddle           card      dl-trick    no    no
  farmerMeetsMerchant   card      npc-arrival yes   yes
  dlBirthday            authored  bubble      no    no     deferred (realDate, ticket #84)
  cliffStorm            authored  weather     no    no     trigger: stockThreshold
  firstSnowOfSeason     authored  dl-trick    yes   yes    trigger: predicates

  cards started    5/15
  authored started 1/3
  chronicle        56 entries: category=20, card=34, authored=2
watch-test --events: PASS (no card is statistically unfireable by its own data; coverage above is a report, not a gate — the pace floors are #101's)
```

Result: PASS as designed — no card is data-unfireable. `dlBirthday` is
expected `no`/`no` (deferred to #84, never fires on its own). The other nine
`no` cards are the default budget's own limit, not the tool's: the engine
draws at most one card roughly every 800 sim-minutes
(`PACING.minGapSimMinutes`, `engine/pacing.ts`), and 25 qa-clock seconds at a
3-second day is only about 8.3 farm days (≈12,000 sim-minutes) per combo, so a
low-weight card competing with thirteen others for the same slot can easily
go unseen in one pass — `cliffStorm` additionally needs the mean grass level
to actually cross a drought line, which this span never forced. Widening
`--day` or the budget would raise coverage; the ticket's own instructions say
that rate is not this run's job to chase.

### Watch test, default mode (feel gate, now informational only), prototype, 300 s

```
$ npm run watch-test -w apps/web -- 300

watch-test: adapter=prototype, 300s unattended, gate: at least 3 distinct of bubble/npc-arrival/weather/dl-trick/lamb/deity
watch-test summary: 31 counted moments (10 extra) in 300s, 13 distinct: dl-trick:flop, dl-trick:rabbit-chase, npc-arrival:farmer, npc-arrival:merchant, bubble:heart, bubble:shears, dl-trick:stretch, dl-trick:stick, lamb:born, weather:rain, weather:sun, dl-trick:ride, lamb:grown
  bubble      14
  npc-arrival 4
  weather     4
  dl-trick    7
  lamb        2
  deity       0
  extras     bird:land, phase:dusk, phase:night, phase:dawn, phase:day
  canvas     alive (60 samples)
watch-test: PASS (13 >= 3)
```

Result: PASS, 13 distinct of the 6 counted kinds (old gate was 3; the gate
itself still runs, just no longer decides a PR). `deity` is 0 as always for
the prototype (nothing sends a deity intent unattended). Unchanged behaviour
from prior runs — pasted for the record, per this ticket's instructions, not
because anything about the tool moved tonight.

### Charter checks

```
npm run typecheck                     clean (web, content, render, sim)
npm run test -w apps/web              125 passed (13 files)
npm run e2e                           59 passed, twice in a row; goldens untouched
npm run watch-test -w apps/web -- 300 PASS (13 >= 3), prototype — pasted above
npm run watch-test.mjs --events       PASS (0 statically-unfireable cards) — pasted above; not a
                                       charter check yet, added tonight
node tools/ci/ownership.mjs           ok, all changed paths inside lane qa
```

### Bugs found (filed, not fixed)

- **#109** (lane:sim, gate:medium): `CHRONICLE_SOURCES` declares `'deity'` and
  `chronicle/store.ts`'s own doc comment says a deity intent calls `tell`, but
  nothing does. A deity `weather` intent's change is told secondhand by the
  Ledger diff as an ordinary `source: 'ledger'` line — indistinguishable from
  the season's own roll — and a deity `act` intent (pet, calm, startle, treat,
  ride-request, fetch-call) writes no chronicle line at all. Found reading
  `packages/sim/src/intents.ts` and `chronicle/*.ts` for this ticket's #3
  (the moment-kind table); not the deity mechanism itself misbehaving, just
  invisible to anything reading the chronicle afterward — a storybook page
  can never say "the owner reached in."

### Weak spots and notes

- `--events` mode's coverage (5/15 cards, 1/3 authored at the default 300 s
  budget) is honestly partial — see the table's own note above for why, and
  the README's warning that this is expected, not a failure. A future PR
  could widen the default budget or add a `--seed` sweep if the owner wants
  higher coverage out of the box; not done here since the ticket's own
  instructions say the rate is #101's to set.
- `--events` mode does not attempt every season × time-of-day cell on
  purpose: `setClock` sets the day fraction once and the clock immediately
  carries past it, so holding a specific time band needs re-asserting it
  every frame (untried tonight, and risks confusing a running event's own
  duration math, which is measured from absolute sim time) — instead each
  combo just runs its own short day/night cycle and lets every band come
  round on its own. Good enough for the static-eligibility check (which does
  not need the runtime at all) and honest reporting; not a guarantee every
  card that *needs* a specific time band got a fair shot in this budget.
- `neverEligibleCards` only reads `season` and `timeOfDay` predicates. A card
  could still be practically unfireable through some other combination (an
  `in`/`not-in` on `weather` crossed with a `ledger.*` threshold that never
  holds together, say) — the ticket's own wording ("no eligible season × time
  band") scopes the hard failure to those two axes, and the coverage table
  reports everything else rather than trying to prove it statically.
- Did not re-run or touch any golden — `storybook-night.png`/`storybook-week.png`
  (PR #89) and the phase/weather set are untouched; this ticket's new spec
  takes its own screenshots nowhere, only DOM/JS assertions.
- The chronicle-coverage e2e leans on `apps/web/src/pin-overlay.ts`'s modal
  (`#modal`/`#modalBox`) for the "earlier pages" flow rather than a
  storybook-owned one — that is the existing app structure (`main.ts`'s
  `earlierPagesBtn` handler), not something this PR added, but worth naming
  since a future pin-overlay change could silently break the reopen path this
  test now covers.

## CI wiring for the infra lane (paste into `.github/workflows/ci.yml`)

Golden screenshots need no new job: `golden.spec.ts` sits in `apps/web/e2e`, so
the existing `build-and-smoke` job's `npm run e2e` already runs it (8 goldens
plus a guard that update mode is off under `CI`). The watch test is a separate
job because it holds a browser for five minutes:

```yaml
  watch-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Install Playwright Chromium
        run: npx playwright install --with-deps chromium
      - name: Watch test (five unattended minutes, at least three distinct moments)
        run: npm run watch-test -w apps/web -- 300
      - name: Upload watch-test report and moment screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: watch-test
          path: tools/qa/out/watch
          retention-days: 7
```

Today the default target is the prototype (`prototype/luna-farm/build/farm_sim.html`).
When the client lane emits `moment` events (contract in `tools/qa/README.md`),
the switch is one line: `run: npm run watch-test:app -w apps/web -- 300`, which
serves `apps/web/dist` and watches it. Optional root aliases infra may want in
the root `package.json`: `"watch-test": "npm run watch-test -w apps/web --"` and
`"golden:update": "npm run golden:update -w apps/web"`; QA does not own that file.

## 2026-09-02 — first run (#9)

Landed: `tools/qa/watch-test.mjs`, `apps/web/e2e/golden.spec.ts` with drivers for
the prototype and (against the contract, untested) the app, eight prototype
goldens under `apps/web/e2e/golden/prototype/`, npm scripts in `apps/web`.

### Watch test, prototype, 300 s, default three-minute day

`npm run watch-test -w apps/web -- 300`, Chromium headless, seasonal weather mode
(the prototype's default). `*` marks the first occurrence of a distinct moment.

```
[00:07] * dl-trick    Digital Luna nibble (clock 0.22)
[00:18] * dl-trick    Digital Luna flop (clock 0.28)
[00:21]   bird        bird         land (clock 0.30)
[00:30] * dl-trick    Digital Luna rabbit-chase (clock 0.35)
[00:36] * npc-arrival farmer       farmer (clock 0.38)
[00:41]   bird        bird         land (clock 0.41)
[00:43]   phase       sky          dusk (clock 0.42)
[00:45] * npc-arrival merchant     merchant (clock 0.43)
[00:53]   bird        bird         land (clock 0.48)
[00:59] * bubble      farmer       heart (clock 0.51)
[01:01]   phase       sky          night (clock 0.52)
[01:12] * bubble      Pepper       shears (clock 0.58)
[01:18]   bubble      Daisy        shears (clock 0.61)
[01:21]   bird        bird         land (clock 0.63)
[01:24]   bubble      Biscuit      shears (clock 0.65)
[01:31]   bubble      Clover       shears (clock 0.69)
[01:38]   bubble      Maple        shears (clock 0.73)
[01:41]   bubble      Digital Luna heart (clock 0.74)
[02:13]   phase       sky          dawn (clock 0.92)
[02:13] * dl-trick    Digital Luna stretch (clock 0.92)
[02:19]   dl-trick    Digital Luna flop (clock 0.96)
[02:27]   phase       sky          day (clock 0.00)
[02:31]   dl-trick    Digital Luna rabbit-chase (clock 0.02)
[02:38]   npc-arrival farmer       farmer (clock 0.06)
[02:48]   dl-trick    Digital Luna rabbit-chase (clock 0.11)
[03:02]   bubble      farmer       heart (clock 0.19)
[03:05]   dl-trick    Digital Luna rabbit-chase (clock 0.21)
[03:14]   bubble      Pepper       shears (clock 0.26)
[03:21]   bubble      Daisy        shears (clock 0.30)
[03:22]   dl-trick    Digital Luna nibble (clock 0.30)
[03:23]   bird        bird         land (clock 0.31)
[03:29]   bubble      Biscuit      shears (clock 0.34)
[03:33]   dl-trick    Digital Luna rabbit-chase (clock 0.36)
[03:38]   bubble      Clover       shears (clock 0.39)
[03:43]   phase       sky          dusk (clock 0.42)
[03:46]   bubble      Maple        shears (clock 0.44)
[03:49]   bubble      Digital Luna heart (clock 0.45)
[04:01]   phase       sky          night (clock 0.52)
[04:06]   bird        bird         land (clock 0.55)
[04:19]   bird        bird         land (clock 0.62)
[04:32] * lamb        flock        born (clock 0.69)
[04:54]   lamb        flock        born (clock 0.82)

watch-test summary: 29 counted moments (13 extra) in 300s, 9 distinct: dl-trick:nibble, dl-trick:flop, dl-trick:rabbit-chase, npc-arrival:farmer, npc-arrival:merchant, bubble:heart, bubble:shears, dl-trick:stretch, lamb:born
  bubble      14
  npc-arrival 3
  weather     0
  dl-trick    10
  lamb        2
  extras     bird:land, phase:dusk, phase:night, phase:dawn, phase:day
  canvas     alive (60 samples)
  report     tools/qa/out/run-300/report.json
watch-test: PASS (9 >= 3)
```

Result: PASS, 9 distinct of the 5 counted kinds (gate is 3). Weather did not
change in these five minutes: in spring the prototype rolls rain every one to
three minutes at 35% odds, so a run without a weather change is normal and the
gate does not depend on it. All 13 extras were bird landings and clock phases.
The moment screenshots (`tools/qa/out/run-300/moment-*.png`, not committed)
were eyeballed: the lamb, the merchant at the gate with his cart, and DL with
her stick are all really on screen when reported.

A second, 25 s run failed as designed with 2 distinct moments (`dl-trick:nibble`,
`dl-trick:stick`), exit code 1.

### Watch test, built app (`npm run watch-test:app -w apps/web -- 12`)

FAIL, as expected before #6 and #7 land: 0 moments, canvas frozen (the hello
canvas is a single static frame), exit code 1. No page errors once the missing
favicon is ignored. This is the run that should turn green when the client emits `moment`.

### Golden screenshots, prototype

`npm run golden:update -w apps/web` wrote 8 PNGs (world canvas, 640×400, no HUD
text) and `_contact-sheet.png`. Seed 9, spring, manual weather, 120 settle
frames at 1/60 s, clock at dawn 0.96, noon 0.21, dusk 0.47, night 0.72.

- Determinism: three further compare runs (`npm run golden`, then the full
  `npm run e2e`) matched with 0 differing pixels each.
- Sensitivity: swapping `dawn-sun.png` for `noon-sun.png` fails with 93.457% of
  pixels differing (max channel delta 189), and the report attaches actual,
  expected, and a red diff. Tolerance is 0.2% of pixels at channel threshold 20.
- `SHEEPCLIFF_GOLDEN_TARGET=app` fails today with
  `window.sheepcliff.qa is missing seed, setWeather, setClock, pause, step, canvas`,
  which is the intended message until the client adds the hooks.

### Charter checks

```
npm run e2e                          10 passed (smoke, 8 goldens, CI guard)
npm run watch-test -w apps/web -- 300   PASS (9 >= 3), 29 counted moments, canvas alive
npm run typecheck                    clean (e2e is in apps/web/tsconfig.json)
```

### Weak spots and notes

- The prototype adapter reads the sim's page-level bindings by name; a rename in
  the prototype fails loudly (the runner checks the names before injecting) but
  it is not a DOM-only observer. The DOM is used for the weather label, the
  canvas for liveness. The kickoff mentioned DL trick buttons; this build has an
  action dropdown instead, so tricks are detected from DL's animation state.
- The app driver and adapter are written to the contract but have never run
  against a page that implements it.
- Goldens are Chromium-encoded PNGs (about 80 KB each, 800 KB for the set with the
  contact sheet). No optimiser is available in the sandbox; worth a pass later.
- A five-minute watch run in CI is five minutes of wall clock per PR. The `--day`
  option can shorten the day, but the charter asks for real time, so the snippet
  above keeps 300 s.
- The prototype's own "jump to dawn" (0.94) and "jump to dusk" (0.44) land inside
  its 0.025 crossfade band, so they show a blend of two backgrounds; the goldens
  use phase midpoints instead. Filed as #20 for the port of the time actions.
- `golden:update` sets the env var inline (`VAR=1 cmd`), which is fine on Linux
  and macOS and not on cmd.exe.

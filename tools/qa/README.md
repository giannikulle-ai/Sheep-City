# tools/qa — watch test, golden screenshots

QA lane tooling (charter: `docs/agents/charters/qa.md`). Run log and CI wiring: `docs/QA_LOG.md`.

## Watch test

Five unattended minutes must produce at least three distinct noticeable moments
(`docs/SHEEPCLIFF_PLAN.md` section 10). Fewer is a failed build for feel.

**The five-minute, three-kind bar is withdrawn as the Phase 1 exit line** (plan
decision 16, 2026-09-09; decisions 11 and 14 before it). Pace is now described
in world time only: a small thing on most farm days, a big thing a few times a
farm month, big only while the farm is a live, visible tab, nothing forced. The
tool below still runs and still reports its old count (useful for feel while
watching), but nothing gates a PR on it any more; the real bar is a farm-day
watch mode that reads card *sizes* (issue #101, not yet landed) and is tracked
as a follow-up on issue #49. See `--events` below for what *is* checked today:
not a rate, but that every card in the deck can fire at all.

```
npm run watch-test -w apps/web -- 300              # the prototype (default URL), five minutes
npm run watch-test -w apps/web -- 60 --day 60      # one minute with a one-minute day
npm run watch-test -w apps/web -- 300 --url http://127.0.0.1:4173/   # any URL
npm run build && npm run watch-test:app -w apps/web -- 300           # the built app, served locally
```

Options: positional `seconds` (default 300), `--url <url>` or `--serve <dir>`,
`--min <n>` (default 3), `--adapter auto|prototype|app`, `--day <seconds>` (day
length), `--out <dir>` (default `tools/qa/out/watch`), `--no-shots`, `--headed`.
Exit code 0 pass, 1 fail (too few moments, a frozen canvas, or page errors), 2 usage or launch error.

Output: one line per moment as it happens (`*` marks a new distinct one), a
summary by kind, `report.json`, `final.png`, and a screenshot at the first
occurrence of every distinct moment (`moment-NN-<kind>_<detail>.png`, capped at 16).

What counts. A moment is `kind:detail`; the gate counts distinct keys among the
six kinds from the charter: `bubble`, `npc-arrival`, `weather`, `dl-trick`,
`lamb`, `deity` (issue #44: a player-driven weather or act power). Other kinds
(`phase`, `bird`, `rabbit`) are logged for context only: clock phases are
guaranteed by the clock and small life is easy to miss.

Liveness. The world canvas is hashed every five seconds; a hash that never
changes fails the run even when moments were reported.

### Adapters

The runner core only listens for `moment` events (below). The adapter is the
only thing that differs per target, picked by `--adapter` or by inspection:

- `prototype`: `prototype/luna-farm/build/farm_sim.html` emits nothing, so
  `lib/prototype-probe.mjs` is injected after load and polls the sim's
  page-level state (`sheep`, `luna`, `weather`, `farmer`, `merchant`, `rabbit`,
  `bird`, `stickThrow`, `clock`) and the DOM (`button[data-w].on` for the
  weather label) ten times a second, dispatching the same `moment` events the
  app will. A DOM/state disagreement on weather is reported as an error.
- `app`: nothing is injected; the page must emit `moment` itself. The switch is
  the `--adapter app` flag (or `--serve apps/web/dist`), nothing in the runner.

### `--events`: card and authored-event coverage (issue #49)

A different mode entirely, not the five-minute feel gate above:

```
npm run build && node tools/qa/watch-test.mjs 300 --events --serve apps/web/dist
node tools/qa/watch-test.mjs 300 --events --url http://127.0.0.1:4173/ --seed 7 --day 3
```

Drives the built app (`--adapter app` only; the prototype has no `window.sheepcliff`)
at a fixed seed (`--seed`, default 7) on its own **QA clock** — `qa.seed` once,
then only `qa.step` ever advances it, never wall time — through every season ×
weather combination the deck's `season`/`timeOfDay`/`weather` conditions read
(`send({type:'setSeason'})`/`setWeather`, both of which lock and hold, unlike
`setClock`, which the clock's own day/night cycle immediately carries past —
so time of day is covered by running each combo across several short days,
`--day` seconds each, not by holding it). It reads the deck itself through
`@sheepcliff/sim`'s exports (`FARM_DECK`, `momentKindOf` — `tools/qa/lib/deck.mjs`
bundles `engine/deck.ts` with esbuild since the package ships as raw TypeScript
with no build step, rather than re-parsing `packages/content/events/*.json`),
then reports, per card and per authored event, whether `sim().events.starts`
and `.cooldowns` ever carried its id (set once, on the real start/end, and
never cleared — so one read at the end of the run sees the whole span).

**It reports; it does not gate a rate.** The world-time pace floors (decision
16 above) are issue #101's card-size ticket, not asserted here. The one thing
that fails the run is data, not luck: `neverEligibleCards` (`lib/deck-coverage.mjs`)
statically narrows each card's own `season`/`timeOfDay` conditions against the
four of each and fails on a card left with an empty set of either — a card no
seed, weather, or span could ever draw, as against one this run simply did not
happen to see. Coverage below 100% at the default budget is expected and not a
failure; a card the pacing (`minGapSimMinutes: 800`, `engine/pacing.ts`) or the
weighted draw did not reach in this run's dwell is reported `no`, not failed.

Options beyond the shared `--url`/`--serve`/`--out`/`--headed`: positional
`seconds` (default 300) is the total QA-clock budget, split evenly across the
twelve season × weather combos; `--day <seconds>` is each combo's day length
(default 3); `--seed <n>` (default 7) is the fixed seed. `--min`, `--adapter
prototype`, and `--no-shots` do not apply. Output: a table (id, kind, moment
kind, seen start, seen end, a note — an authored event's trigger kind, or
`deferred` for `dlBirthday`, parked for #84) plus `events-report.json`.

## Event contract for the client lane

Dispatch on `window`, once per noticeable moment, as soon as it becomes visible:

```ts
window.dispatchEvent(new CustomEvent('moment', {
  detail: {
    kind: 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit' | 'deity',
    actor?: string,   // who: 'Digital Luna', a sheep name, 'farmer', 'merchant', 'sky', 'flock', or a target id for 'deity'
    detail?: string,  // what: bubble icon ('heart' | 'shears' | 'coin'), trick name, weather ('sun' | 'rain' | 'snow'), 'born' | 'grown', or a deity weather kind / act verb
    t?: number,       // clock fraction 0..1 at the moment, for the log
  },
}));
```

Guidance on what qualifies (the prototype probe follows this):

| kind | emit when | detail |
|---|---|---|
| `bubble` | an icon bubble appears over a sheep, DL, or an NPC | the icon name |
| `npc-arrival` | the farmer or merchant enters the scene | `farmer` / `merchant` |
| `weather` | the weather changes | new weather |
| `dl-trick` | DL starts an idle play or a command: `flop`, `stick`, `nibble`, `stretch`, `ride`, `rabbit-chase`, `fetch` | the trick |
| `lamb` | a lamb is born, or grows into a sheep | `born` / `grown` |
| `deity` | the player sends a deity `weather` or `act` intent (issue #44) | the weather kind, or the act verb |
| `phase` | the clock crosses into dawn, day, dusk, night (logged, not counted) | the phase |
| `bird`, `rabbit` | small life arrives (logged, not counted) | `land` / `cross` |

Emit on transitions only (a bubble once when it appears, not every frame).
Distinctness is `kind:detail`, so a second heart bubble is not a new moment.

### The engine's own kinds, and the chronicle's (issue #49)

The table above is the client's `moment` DOM event, read by the watch test
above. Two more vocabularies exist, both older or newer than that table, and
neither is the same channel:

- **A card or authored event's own `moment.kind`** (`packages/content/events/farm.json`
  and `authored.json`, read through `momentKindOf` in `@sheepcliff/sim`) is drawn
  from the *same five words* as the client table above — `bubble`, `npc-arrival`,
  `weather`, `dl-trick`, `lamb` — by data convention, not by any code that
  cross-checks the two. **It is not wired into `diffMoments`** (`apps/web/src/
  moments.ts`), which finds moments from state diffs the engine's own hooks
  (`setVisibility`, `spawn`, `mood`, `coins`, `flag`) do not always touch — so an
  engine-drawn card can start and end with a chronicle line and no `moment` DOM
  event at all, and the five-minute watch test above can under-count what the
  engine actually did. This is exactly why `--events` mode (above) reads
  `sim().events`/the chronicle directly instead of listening for `moment`.
- **A chronicle entry's `source`** (`CHRONICLE_SOURCES`, `packages/sim/src/
  chronicle/types.ts`): `card`, `authored`, `ledger`, `social`, `economy`,
  `category`, `deity` — what wrote the storybook line, not what it is about. A
  card or authored event's start and end are each one `tell` call tagged `source:
  'card'`/`'authored'` — call these **`event:start`**/**`event:end`** if you need
  a name for "the chronicle's own two moments per running event id" (a naming
  convention for this doc, not a field the code carries: nothing disambiguates
  a start entry from an end one except which one records the *later* `atMs` for
  the same id, or the line's own wording). `social`, `economy`, and `deity` are
  declared but not all wired up yet: the social graph (`social`) has not landed
  in this build, and neither has a per-actor `economy` line; **`deity` is a
  finding, not a gap in this doc** — filed as #109: a deity `weather` intent's
  change lands as an ordinary `source: 'ledger'` line (indistinguishable from
  the season's own roll) and a deity `act` intent writes nothing at all, though
  `CHRONICLE_SOURCES` and `chronicle/store.ts`'s own doc comment both say a
  deity intent calls `tell`.
- The `deity` **client** kind (table above) is unaffected by any of that: it is
  the player's own tap, counted the instant it is sent (issue #44), regardless
  of whether the sim's own chronicle later tells a line for it. Its weather
  hold's default duration (three world-hours) shipped in PR #90.

## QA hooks for the client lane (golden screenshots)

`apps/web/e2e/golden.spec.ts` captures dawn, noon, dusk, night in sun and snow.
For the prototype it injects a determinism shim (seeded `Math.random`, virtual
`performance.now`, `requestAnimationFrame` drained by `window.__qaStep(frames)`).
The app should expose the equivalent directly, so the spec needs no shim:

```ts
window.sheepcliff = {
  qa: {
    seed(seed: number): void;                      // reseed the sim RNG (#4 makes it seedable)
    setClock(t: number): void;                     // day fraction 0..1
    setWeather(w: 'sun' | 'rain' | 'snow'): void;
    pause(paused: boolean): void;                  // stop the clock advancing on step
    step(frames: number): void;                    // run N fixed-dt frames, sim and render, synchronously
    canvas(): HTMLCanvasElement;                   // the world canvas at native resolution (no HUD text)
    setDayLength?(seconds: number): void;          // optional, used by watch-test --day
  },
};
```

plus `<body data-ready="1">` once the first frame is painted (the smoke test
already relies on it). Then `SHEEPCLIFF_GOLDEN_TARGET=app npm run golden:update -w apps/web`
writes `apps/web/e2e/golden/app/*.png` beside the prototype set, and the client
lane's PR commits them with a sentence on what they show.

## Golden screenshots

```
npm run golden -w apps/web                          # compare (also part of `npm run e2e`)
npm run golden:update -w apps/web                   # rewrite goldens and the contact sheet; say why in the PR
SHEEPCLIFF_GOLDEN_TARGET=app npm run golden -w apps/web
```

- Files: `apps/web/e2e/golden/<target>/<phase>-<weather>.png`, world canvas at
  640×400 (prototype). `_contact-sheet.png` is a labelled 4×2 overview for review.
- Phase clock values: dawn 0.96, noon 0.21, dusk 0.47, night 0.72 (phase
  midpoints, outside the prototype's crossfade bands). Season is pinned to
  spring, weather mode to manual, seed 9, 120 settle frames.
- Tolerance (`e2e/lib/golden.ts`): a pixel differs when any channel moves more
  than 20; the test fails above 0.2% of pixels (512 of 256,000). A missing
  sheep is about 0.34%, so it is caught; a tint change touches every pixel.
- On failure the report attaches `actual`, `expected`, and `diff` (differences in red).
- `SHEEPCLIFF_GOLDEN_UPDATE=1` is refused under `CI=1`.

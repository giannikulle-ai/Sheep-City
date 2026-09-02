# QA log

Runs of the watch test and golden screenshots, newest first. Tooling lives in
`tools/qa/` (usage and the client-lane contracts in `tools/qa/README.md`) and
`apps/web/e2e/`. Charter: `docs/agents/charters/qa.md`.

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

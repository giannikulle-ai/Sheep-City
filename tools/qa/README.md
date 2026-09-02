# tools/qa — watch test, golden screenshots

QA lane tooling (charter: `docs/agents/charters/qa.md`). Run log and CI wiring: `docs/QA_LOG.md`.

## Watch test

Five unattended minutes must produce at least three distinct noticeable moments
(`docs/SHEEPCLIFF_PLAN.md` section 10). Fewer is a failed build for feel.

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
five kinds from the charter: `bubble`, `npc-arrival`, `weather`, `dl-trick`,
`lamb`. Other kinds (`phase`, `bird`, `rabbit`) are logged for context only:
clock phases are guaranteed by the clock and small life is easy to miss.

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

## Event contract for the client lane

Dispatch on `window`, once per noticeable moment, as soon as it becomes visible:

```ts
window.dispatchEvent(new CustomEvent('moment', {
  detail: {
    kind: 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit',
    actor?: string,   // who: 'Digital Luna', a sheep name, 'farmer', 'merchant', 'sky', 'flock'
    detail?: string,  // what: bubble icon ('heart' | 'shears' | 'coin'), trick name, weather ('sun' | 'rain' | 'snow'), 'born' | 'grown'
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
| `phase` | the clock crosses into dawn, day, dusk, night (logged, not counted) | the phase |
| `bird`, `rabbit` | small life arrives (logged, not counted) | `land` / `cross` |

Emit on transitions only (a bubble once when it appears, not every frame).
Distinctness is `kind:detail`, so a second heart bubble is not a new moment.

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

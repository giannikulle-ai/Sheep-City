# Web bundle download budget

The size budget the build enforces lives in `apps/web/budget.json` (checked by
`apps/web/scripts/check-budget.mjs` after every `vite build`); its `comment` field is the
running history of why it moved. This doc is the download-side measurement that budget
history refers to: what a phone actually transfers on first load, and whether the event
engine's card data (packages/content/events/*.json, shipped in the bundle since PR #82,
plan decision 15) is worth trimming.

## Measurement: issue #97, 2026-09-09, commit 3777ad7

Tool: `apps/web/scripts/measure-download.mjs` (`npm run measure:download -w apps/web`, not run
in CI). Method: `npm run build -w apps/web`, then served `apps/web/dist` with the same static
file server the deploy check and The Garage use (`tools/deploy/tile/server.js`), loaded in
Playwright's bundled Chromium under two throttle profiles via CDP `Network.emulateNetworkConditions`.
"Transferred" is CDP `Network.loadingFinished`'s `encodedDataLength`, summed across every request.

| Profile | Requests | Transferred (server) | Time to `body[data-ready]` |
|---|---|---|---|
| 4G (9 Mbps / 170 ms RTT) | 12 | 450,448 B | ~1.1-1.2 s |
| Slow 3G (400 kbps / 400 ms RTT) | 12 | 450,448 B | ~10.3-10.4 s |

Transferred bytes are identical across profiles because they are the same 12 responses over
the same server; throttling changes only how long the transfer takes, not its size.

**The tile server does not gzip** (`tools/deploy/tile/server.js` sets no `Content-Encoding`;
`sawEncoding` came back `off` in both runs), so the CDP-measured "transferred" figure above is
the on-disk, uncompressed size of every asset (448,278 B raw, matching within ~0.5% — the CDP
figure includes response headers). That is a fair proxy for The Garage's own tile hosting today,
but not for a CDN-fronted deploy, which would gzip or brotli in flight. To have that number too,
this measurement also gzips every dist/ file on disk at `-9`:

| | Files | Raw | gzip -9 |
|---|---|---|---|
| Whole first load | 12 | 448,278 B | 317,779 B |

Per-file, from `vite build`'s own report at this commit (the JS bundle is the only file whose
gzip differs meaningfully from its raw size; the eight background PNGs and the spritesheet PNG
are already compressed and gzip barely touches them):

| File | Raw | gzip -9 |
|---|---|---|
| `assets/index-*.js` (app + sim + render + content) | 168.7 kB | 58.2 kB |
| 8 background PNGs + spritesheet PNG | 262.9 kB | 255.3 kB |
| `assets/spritesheet-*.json` | 5.4 kB | 1.3 kB |
| `index.html` | 11.4 kB | 3.0 kB |

So on a real gzip-serving host, first load is **~318 kB compressed**, and the JS is a fifth of
that; the rest is the eight time-of-day/weather background PNGs and the spritesheet PNG, which
gzip does almost nothing for because PNG is already compressed.

## Measurement: issue #108, 2026-09-09, commit c02030f — gzip turned on

`tools/deploy/tile/server.js` (the static server the deploy check and The Garage tile run) now
gzips `.html`, `.js`/`.mjs`, `.css`, `.json`, `.svg`, `.webmanifest`, `.txt` and `.map` responses
when the request sends `Accept-Encoding: gzip`, at level 9, compressed once per file and cached
in memory for the life of the process; a request with no matching `Accept-Encoding` still gets
the plain file, and PNGs are never touched. Same tool and method as the #97 measurement above,
re-run against this commit:

| Profile | Requests | Transferred (server) | Time to `body[data-ready]` |
|---|---|---|---|
| 4G (9 Mbps / 170 ms RTT) | 12 | 329,496 B | ~1.04-1.05 s |
| Slow 3G (400 kbps / 400 ms RTT) | 12 | 329,496 B | ~8.02-8.05 s |

`sawEncoding` (the script's own detector, "did any response carry a `Content-Encoding` header")
now comes back `on` in both runs, where #97 recorded `off`. On-disk gzip -9 of the same 12 files
at this commit: 453,811 B raw → 319,708 B gzip (per-file, from `vite build`'s own report: the JS
bundle 174.24 kB → gzip 60.19 kB; the eight backgrounds + spritesheet PNG together, 262.7 kB →
255.3 kB, barely move; `index.html` 11.4 kB → 3.0 kB; `spritesheet-*.json` 5.4 kB → 1.3 kB — the
per-file shape matches #97's table almost exactly). The CDP-measured 329,496 B sits about 3.1%
above the 319,708 B on-disk gzip total, which is response/request header overhead across 12
requests plus the gzip framing CDP counts as transferred; #97 saw a tighter ~0.5% gap between its
raw CDP figure and on-disk raw bytes because there was no compression or extra header (`Vary`,
`Content-Encoding`) in play yet.

Before vs. after, same tool, same throttle profiles:

| Profile | Transferred, #97 (no gzip) | Transferred, #108 (gzip on) | Change |
|---|---|---|---|
| 4G | 450,448 B | 329,496 B | −121 kB (−26.9%) |
| Slow 3G | 450,448 B | 329,496 B | −121 kB (−26.9%) |
| Time to ready, 4G | ~1.1-1.2 s | ~1.04-1.05 s | modestly faster |
| Time to ready, Slow 3G | ~10.3-10.4 s | ~8.02-8.05 s | ~2.3 s faster |

Landed within about 11 kB of the ~318 kB gzip figure #97 projected (329.5 kB measured, including
header overhead the on-disk-only figure doesn't count, against 317.8 kB projected at #97's
commit / 319.7 kB at this one) — the "done means" bar ("near the gzip figure") is met. The raw
(uncompressed) on-disk total also grew a little between #97 and this commit (448,278 B → 453,811
B, mostly the JS bundle) from unrelated commits that landed on trunk in between; none of that
growth is from this ticket, which touches only `tools/deploy/tile/server.js` and
`tools/deploy/check-dist.mjs`.

Not verified here, and the ticket says so plainly: this is all measured against
`tools/deploy/tile/server.js` directly, the same way `check-dist.mjs` and The Garage's tile do.
Whether Caddy/Cloudflare in front of the live tile (`docs/DEPLOY.md`) strips, replaces, or leaves
this `Content-Encoding` alone has not been checked against the live URL — see the deploy body
for the verification command.

## Verdict: the event engine's card data (issue #97 step 2)

`packages/content/events/farm.json` (15 cards) and `events/authored.json` (3 cards) are
imported as plain ES modules and Vite inlines their full contents — including the dev-only
`$schema`, `source`, and per-field `comment` strings — into the JS bundle as object literals; no
part of either file is tree-shaken away. Measured directly in `dist/assets/index-*.js` at this
commit (locating the exact span of inlined declarations for both files, from the first `$schema`
constant to the closing brace of the reassembled event-deck object):

- **Raw**: 29,744 B of the bundle's 168,704 B JS = **17.6% of the JS**.
- **Gzip (standalone, same span)**: 9,335 B vs. the JS bundle's whole-file gzip of 58,222 B =
  **~16.0% of the gzipped JS**. (Compressing the span on its own isn't exactly additive with the
  rest of the bundle's shared dictionary, but it lines up with the 29,965 B / 9,086 B a plain
  `JSON.stringify` + `gzip -9` of the two source files gives, so it's a solid estimate either way.)
- **Share of the whole first load**: 9.3 kB of 317.8 kB gzipped = **~2.9%** — small, because the
  backgrounds dominate the download, not the code.

Read against the issue's ">10% of the gzipped download" bar: **over the line for the JS bundle
itself (~16%), under it for the page as a whole (~2.9%)**. The JS bundle is also the one thing
that blocks the first paint on every load (the backgrounds are `<img>`s the renderer can start
drawing progressively; the JS has to finish parsing and running before `body[data-ready]` fires
at all), and it's also the piece plan decision 15 raised the budget for. Called against the
letter of the ticket, the card data is worth trimming — a comment proposing how, without
touching `packages/sim` or `packages/content` here, went on issue #97.

Notably, most of that 17.6%/16% is `comment` strings and the `$schema` pointer, not gameplay
data: they read as ~2,500 dev-authoring characters per file just from the top-level fields, plus
a per-card `comment` on most of the 18 cards. None of it does anything at runtime — the engine's
own validator (`packages/content/src/index.ts`) never reads `comment` or `$schema` — so it is the
first thing to go before any lazy-loading complexity.

## Budget

`apps/web/budget.json` is unchanged by this ticket (still `maxJsKb: 192`, `maxCssKb: 8`,
`maxTotalKb: 464`; the build measures 164.8 kB JS / 437.8 kB total at this commit, both under
budget). This ticket only measures and records; it does not change `packages/content` or
`packages/sim`, so the bundle's contents are unchanged from PR #82's merge.

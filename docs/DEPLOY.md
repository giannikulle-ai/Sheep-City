# Deploying to The Garage

The dev builds of Sheepcliff live on The Garage, the owner's private lab at
`https://lab.sheepcliff.com`, in two tiles. Deploys run from GitHub Actions only.
Agent sessions never talk to the lab; the environment's network policy blocks it.

| Tile | Live URL | Serves | Why |
|---|---|---|---|
| `sheep-city` | **https://sheep-city.sheepcliff.com** | `prototype/luna-farm/build/farm_sim.html` (Luna Farm v31) | Phase 0 guardrail: the owner's pinned look stays up until the port is pinned |
| `sheep-city-next` | **https://sheep-city-next.sheepcliff.com** | `apps/web/dist` (the ported app, rebuilt every trunk push) | Where the port is watched and reviewed |

Both tiles get the same push, the same `server.js` and `lab.yml`, and the same
kick, verify, and screenshot steps; only the source differs.

### The swap, after the owner pins the port

One line in `.github/workflows/deploy.yml`: in the `deploy` job's matrix, change
the `sheep-city` entry's `source` from `prototype/luna-farm/build/farm_sim.html`
to `apps/web/dist`. The next trunk push then serves the ported app on both
tiles; `sheep-city-next` can be released afterwards (`DELETE /api/tiles/sheep-city-next`)
or kept as a preview tile.

## The secret

| Name | Where | Used by |
|---|---|---|
| `GARAGE_TOKEN` | Repository secret: Settings → Secrets and variables → Actions | `garage-discover.yml`, `deploy.yml`, `tools/deploy/deploy.sh` |

The token is a bearer token; The Garage wants `Authorization: Bearer <token>`
on every `/api/*` request. It never enters the repo. Every workflow that reads
it calls `::add-mask::` as well as relying on GitHub's own secret masking, the
deploy script sends it through a header file and the environment (never on a
command line), and the discovery script replaces the token value with
`[REDACTED]` before printing any response.

If the secret is missing, `deploy.yml` fails at its first step with a message
saying so, and `garage-discover.yml` runs an unauthenticated pass and then fails.

## How a deploy happens

1. A push lands on the trunk branch (`claude/sheepcliff-civilization-framework-bkgla5`
   until `main` exists) that changes something other than `docs/**` or `*.md`
   (`paths-ignore` on the push trigger; roster and digest commits do not
   redeploy), or someone runs the `deploy` workflow by hand.
2. The `build` job waits for every other check on that commit to finish and pass
   (it polls the commit's check runs, so it does not depend on the CI workflow's
   name; if no other check appears within 90 s it warns and continues).
3. It builds the web app (`npm ci && npm run build`), then runs
   `tools/deploy/check-dist.mjs`: `apps/web/dist` is served with the tile's own
   static server (`tools/deploy/tile/server.js`) and loaded in headless
   Chromium; every request must answer 2xx from that server, nothing may be
   fetched from another origin, and the app must set `body[data-ready]`. This
   is the guard for Vite's `base: './'` and relative asset URLs. The build is
   uploaded as the `web-dist` artifact.
4. The `deploy` job runs once per tile from a matrix (`sheep-city` with the
   prototype source, `sheep-city-next` with `apps/web/dist`), in parallel, each
   with `GARAGE_TILE`, `DEPLOY_SOURCE`, and `LIVE_URL` set for its tile. Each
   downloads the build and runs `tools/deploy/deploy.sh`.
5. `deploy.sh` stages the site (`DEPLOY_SOURCE`, else `apps/web/dist/` when it
   exists, else `prototype/luna-farm/build/farm_sim.html` as `index.html`), adds
   `server.js` and `lab.yml` from `tools/deploy/tile/`, checks the tile with
   `GET /api/tiles/<tile>` (claiming it with `POST /api/tiles` on 404), and
   pushes the staged files as one commit to the tile's git remote
   `https://lab.sheepcliff.com/git/<tile>.git`. The Garage's spec says of that
   endpoint: "Push triggers deploy."
6. The workflow calls `POST .../deploy`, `POST .../restart`, and
   `PUT .../open-paths` with `{"open_paths": ["/"]}` on the tile, then fetches
   the tile's live URL (up to 12 tries, 5 s apart) and fails unless it returns
   200. Each tile writes a `Live (<tile>, source <source>): <url>` line to the
   job summary.
7. Best effort: it asks the Garage for a screenshot of the tile
   (`GET /api/tiles/<tile>/screenshot?full=true`), falling back to Playwright,
   and uploads `live-<tile>.png` as the workflow artifact `live-<tile>-<sha>`.

### Manual deploy

Actions → **deploy** → *Run workflow* → pick the branch. The `wait_for_ci`
input (default on) controls step 2. A manual run from a non-trunk branch
deploys that branch's checkout to both tiles, so use it deliberately.

Locally, with the token exported in your shell and nothing else:

```
GARAGE_TOKEN=... tools/deploy/deploy.sh --dry-run   # stage and list files, no network
GARAGE_TOKEN=... GARAGE_TILE=sheep-city-next DEPLOY_SOURCE=apps/web/dist tools/deploy/deploy.sh
node tools/deploy/check-dist.mjs apps/web/dist --screenshot dist.png   # the step-3 check, no token needed
```

`deploy.sh` knobs (all optional): `GARAGE_URL`, `GARAGE_TILE`,
`GARAGE_UPLOAD=git|files`, `GARAGE_BRANCH`, `GARAGE_AFTER=deploy,restart`,
`DEPLOY_SOURCE=<dir or .html file>`. `files` mode writes each staged file with
`PUT /api/tiles/<tile>/files` instead of pushing git; it can only carry
UTF-8 text because that API takes the content as a JSON string.

## The Garage API, as observed

Observed by `garage-discover.yml` runs 3 and 4 on 2026-09-02
(https://github.com/giannikulle-ai/Sheep-City/actions/runs/33649874165,
https://github.com/giannikulle-ai/Sheep-City/actions/runs/33650621929),
**without a token** because the secret was not set yet. The lab is a FastAPI
app ("The Garage" 0.1.0, OpenAPI 3.1.0) behind Caddy and Cloudflare.

Auth behaviour seen:

| Path | Without token |
|---|---|
| `/`, `/docs`, `/tiles`, `/tiles/sheep-city`, `/openapi.json`, `/redoc`, `/healthz`, `/version` | 401 `{"detail":"Login or token required"}` |
| `/api/tiles`, `/api/tiles/sheep-city` | 401 `{"detail":"Missing or invalid token"}` |
| `/health` | 200 `ok` |
| `/api/docs` | 200, Swagger UI titled "The Garage - Swagger UI", loads `/api/openapi.json` |
| `/api/openapi.json` | 200, the full spec (22 057 bytes; the run uploads it as the `garage-openapi` artifact) |
| `/robots.txt` | 200, Cloudflare managed content signals |
| `https://sheep-city.sheepcliff.com/` (the live URL) | 401 `{"detail":"Login or token required"}`, same Caddy + Cloudflare front |

Every operation takes an optional `authorization` header and an optional
`garage_session` cookie; the workflows use the header.

Endpoints in the spec (method, path, request body, query parameters, summary):

| Method | Path | Body | Query | Summary |
|---|---|---|---|---|
| GET | `/auth/check` | | | Auth Check |
| GET, POST | `/login` | form `user`, `password`, `next` | `next` | Login |
| GET | `/logout` | | | Logout |
| GET | `/health` | | | Health |
| GET | `/api/status` | | | Api Status |
| GET | `/api/tiles` | | | Api List |
| POST | `/api/tiles` | `ClaimBody` | | Api Claim (201) |
| GET | `/api/tiles/{name}` | | | Api Get |
| DELETE | `/api/tiles/{name}` | | `purge` | Api Release |
| POST | `/api/tiles/{name}/stop` | | | Api Stop |
| POST | `/api/tiles/{name}/exec` | `ExecBody` | | Api Exec |
| GET | `/api/tiles/{name}/files` | | `path` (required) | Api Read, returns `text/plain` |
| PUT | `/api/tiles/{name}/files` | `WriteBody` | | Api Write |
| GET | `/api/tiles/{name}/logs` | | `lines` | Api Logs |
| POST | `/api/tiles/{name}/restart` | | | Api Restart |
| POST | `/api/tiles/{name}/deploy` | | | Api Deploy |
| POST | `/internal/deploy/{name}` | | | Internal Deploy |
| POST | `/api/tiles/{name}/test` | | | Api Test |
| GET | `/api/tiles/{name}/tests` | | | Api Tests |
| PUT | `/api/tiles/{name}/open-paths` | `OpenPathsBody` | | Api Open Paths |
| GET | `/api/tiles/{name}/screenshot` | | `path`=/ `width`=1280 `height`=800 `full`=false | "Render the tile's live app through the runner's headless Chromium. Returns PNG." |
| GET | `/api/tokens` | | | Api Tokens |
| POST | `/api/tokens` | `TokenBody` | | Api Token Create |
| DELETE | `/api/tokens/{resident}` | | | Api Token Revoke |
| GET, POST | `/git/{name}.git/{rest}` | | | "Serve the tile's bare repo via `git http-backend`. Push triggers deploy." |
| GET | `/` | | | Floor (HTML) |
| GET | `/terminal` | | | Terminal |
| GET | `/tile/{name}` | | | Tile Page |
| GET | `/static/{fn}` | | | Static |

Schemas:

```
ClaimBody      { name?: string, resident?: string, note?: string, git?: string }
WriteBody      { path: string, content: string }            # both required
ExecBody       { cmd: string, cwd: string = "/work", timeout: int = 120 }
OpenPathsBody  { open_paths: string[] }
TokenBody      { resident: string }
```

Observed with the token (deploy run 25, 2026-09-02): a tile's JSON from
`GET /api/tiles/{name}` and `GET /api/status` (`tiles[]`) has this shape:

```
{ name, status: "running", resident, note, claimed_at, open_paths: ["/"],
  last_test: null | {id, started_at, finished_at, trigger, exit_code, passed, failed},
  plugs: { url, editor, git, api, tests, hooks: [] },
  git_head: "<short sha> <commit subject>" }
```

`/api/status` also carries `max_tiles` (20), `counts`, `host` load, and an
`events` list (`deploy`, `restart`, `open_paths` per tile). A git push shows up
as two `deploy` events, `push:` and `manual:`, with the pushed commit subject.
The tile repo's default branch is `main`. Before `open_paths` is set the live
URL answers 401 to an anonymous visitor (the lab login); after
`PUT .../open-paths {"open_paths": ["/"]}` it is public.

### Claiming the tile

`deploy.sh` claims the tile itself when `GET /api/tiles/<tile>` answers 404
(`POST /api/tiles` with `{"name","note"}`, expecting 201), then re-reads it;
this is how `sheep-city-next` came to exist. Set `GARAGE_CLAIM=no` to disable
that. The same call by hand, with the token exported:

```
curl -sS -X POST -H "Authorization: Bearer $GARAGE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"sheep-city","note":"Sheepcliff dev build"}' https://lab.sheepcliff.com/api/tiles
```

## What a tile runs (observed 2026-09-02)

The tile page at `/tile/sheep-city` says: "ports app on 3000 · editor on 8080",
"runs as dev in /work", and "Add a lab.yml to build/start/test on push"
(`build: npm ci && npm run build`, `start: npm start`, `test: npx playwright
test --base-url $TILE_URL`, `open_paths: [...]`). A push that carries only
static files deploys fine but nothing listens, so the live URL answers 502.
`deploy.sh` therefore adds `tools/deploy/tile/server.js` (a dependency-free
static server on port 3000) and `tools/deploy/tile/lab.yml` to every payload
that does not already contain them. `open_paths` is also set through
`PUT /api/tiles/sheep-city/open-paths` by the deploy workflow.

Observed with the token: `POST /api/tiles` (claim) answers 201 with the tile
JSON; `POST .../deploy` answers `{"deployed":true,"head":...,"build_output":""}`;
`POST .../restart` answers `{"restarted":true}`; `GET .../logs` answers
`(no app log yet)` until something starts; `GET .../files?path=.` is a `cat`
and 404s on a directory.

## Discovery workflow

`garage-discover.yml` runs on manual trigger (once it exists on the trunk) and
on any push that changes the workflow file itself. It probes the paths the
ticket lists plus every read-only endpoint from the spec, prints status,
headers and the first 4 KB of each body with the token redacted, dumps the full
OpenAPI spec, uploads it as an artifact, and writes a status table to the job
summary. Inputs: `extra_paths` (comma-separated) and `base_url`. Re-run it
after the secret is added and replace the "not yet observed" list above with
what it shows.

## First real deploy, what worked

1. The owner added `GARAGE_TOKEN`; `deploy.sh` claimed the tile on the first run.
2. A push of static files alone deployed but nothing listened (502), hence
   `server.js` and `lab.yml` in every payload.
3. `POST .../deploy`, `POST .../restart`, and `PUT .../open-paths` after the
   push made the live URL answer 200 anonymously; the workflow does all three
   on every deploy. Which of the three is strictly needed has not been isolated.

## Known rough edges

- `ci.yml` cancels in-progress CI when the trunk moves again within a minute
  (`cancel-in-progress: true`). The deploy for the superseded commit then sees
  `typecheck: cancelled` and fails at the wait step. The newer commit deploys,
  so nothing is lost, but the older deploy run shows red.

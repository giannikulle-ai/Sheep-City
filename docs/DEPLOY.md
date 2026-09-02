# Deploying to The Garage

The dev build of Sheepcliff lives on The Garage, the owner's private lab at
`https://lab.sheepcliff.com`, in the tile `sheep-city`, served at
**https://sheep-city.sheepcliff.com**. Deploys run from GitHub Actions only.
Agent sessions never talk to the lab; the environment's network policy blocks it.

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
   until `main` exists), or someone runs the `deploy` workflow by hand.
2. `deploy.yml` waits for every other check on that commit to finish and pass
   (it polls the commit's check runs, so it does not depend on the CI workflow's
   name; if no other check appears within 90 s it warns and continues).
3. It builds the web app if a root `package.json` exists, then runs
   `tools/deploy/deploy.sh`.
4. `deploy.sh` stages the site (`apps/web/dist/` when it exists, otherwise
   `prototype/luna-farm/build/farm_sim.html` as `index.html`), checks the tile
   with `GET /api/tiles/sheep-city`, and pushes the staged files as one commit to
   the tile's git remote `https://lab.sheepcliff.com/git/sheep-city.git`. The
   Garage's spec says of that endpoint: "Push triggers deploy."
5. The workflow fetches `https://sheep-city.sheepcliff.com/` (up to 12 tries,
   5 s apart) and fails unless it returns 200.
6. Best effort: it asks the Garage for a screenshot of the tile
   (`GET /api/tiles/sheep-city/screenshot?full=true`), falling back to
   Playwright, and uploads `live-sheep-city.png` as a workflow artifact.

### Manual deploy

Actions → **deploy** → *Run workflow* → pick the branch. The `wait_for_ci`
input (default on) controls step 2. A manual run from a non-trunk branch
deploys that branch's checkout to the same single tile, so use it deliberately.

Locally, with the token exported in your shell and nothing else:

```
GARAGE_TOKEN=... tools/deploy/deploy.sh --dry-run   # stage and list files, no network
GARAGE_TOKEN=... tools/deploy/deploy.sh             # real deploy
```

`deploy.sh` knobs (all optional): `GARAGE_URL`, `GARAGE_TILE`,
`GARAGE_UPLOAD=git|files`, `GARAGE_BRANCH`, `GARAGE_AFTER=deploy,restart`,
`DEPLOY_SOURCE=<dir or .html file>`. `files` mode writes each staged file with
`PUT /api/tiles/sheep-city/files` instead of pushing git; it can only carry
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

Not yet observed, because no run has had a token: the JSON shape of a tile
(`GET /api/tiles/{name}`), what "deploy" does after a git push (is a static
`index.html` at the repo root served as-is, or does the tile expect a build
step or a Dockerfile?), and which branch the tile repo uses (`deploy.sh` reads
the remote HEAD and falls back to `main`). One thing is known: today the live
URL answers 401 to an anonymous visitor, so either the tile is not serving
anything yet or the tile subdomain sits behind the lab login. `open-paths`
looks like the switch for the latter. The deploy workflow's verify step
reports both the anonymous status and the status with the token so the two
cases can be told apart.

### Claiming the tile

`deploy.sh` claims the tile itself when `GET /api/tiles/sheep-city` answers 404
(`POST /api/tiles` with `{"name","note"}`, expecting 201), then re-reads it.
Set `GARAGE_CLAIM=no` to disable that. The same call by hand, with the token
exported:

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

## First real deploy checklist

1. Owner adds `GARAGE_TOKEN` and, if needed, claims the tile.
2. Re-run `garage-discover` and update this file from the authenticated output.
3. Run `deploy` by hand on the trunk. If the push is accepted but the live URL
   is not 200, the candidates in order are: `GARAGE_AFTER=deploy`,
   `GARAGE_AFTER=restart`, and `PUT /api/tiles/sheep-city/open-paths` with
   `{"open_paths": ["/"]}`. Record what worked here.

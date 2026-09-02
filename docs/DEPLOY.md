# Deploy

Stub. Filled in once the upload API is observed (see `docs/SHEEPCLIFF_PLAN.md` section 5).

## Target
- Host: The Garage (`lab.sheepcliff.com`).
- Tile: `sheep-city`, served at `sheep-city.sheepcliff.com`.
- Artifact: the static build in `apps/web/dist/` (Vite, `base: './'` so it works from any tile path).

## Auth
- A bearer token read from the `GARAGE_TOKEN` environment variable. It never enters the repo.
- In GitHub Actions it will be a repository secret exposed to the deploy job only.

## Script
`tools/deploy/deploy.sh` (also `npm run deploy`):
1. Exits 1 with a clear message if `GARAGE_TOKEN` is unset.
2. Exits 1 if `apps/web/dist/index.html` is missing (run `npm run build` first).
3. Prints the tile and build size, then exits 2 because the upload itself is not implemented yet.

`GARAGE_TILE` overrides the tile name for preview builds.

## Still to do
- Observe and document the Garage upload API (endpoint, method, payload, response).
- Wire the upload into `deploy.sh` and add a `deploy` job to `.github/workflows/ci.yml` on merge to `main`.
- Preview builds per PR if the host supports it.
- Add the host to the environment network allowlist before the first real deploy.

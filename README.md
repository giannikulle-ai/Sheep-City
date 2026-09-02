# Sheepcliff

A cozy, watchable, pixel-art digital civilization. Started life as **Luna Farm**, an idle farm sim starring Digital Luna (a chibi chocolate Havanese) herding a small flock of sheep.

- `docs/SHEEPCLIFF_PLAN.md` — project brief, simulation model, architecture, phased plan.
- `docs/AGENT_FRAMEWORK.md` — how the agent team is organised, monitored, grown, and shrunk.
- `docs/agents/` — roster and lane charters.
- `docs/DEPLOY.md` — deploy target and script.
- `prototype/luna-farm/` — the v31 prototype: Python art pipeline (`src/`), built game (`build/farm_sim.html`), handoff docs.

Open `prototype/luna-farm/build/farm_sim.html` in a browser to play the current farm.

## Working on the code

Node 22 and npm. The repo is an npm workspace: `apps/web` (Vite app), `packages/sim`, `packages/render`, `packages/content`.

```
npm ci            # install
npm run build     # typecheck-free production build of apps/web into apps/web/dist
npm run test      # unit tests (Vitest) in every workspace
```

Also useful:

```
npm run typecheck # tsc in every workspace
npm run e2e       # Playwright smoke against the built page (run build first)
npm run dev       # Vite dev server for apps/web
```

The Playwright config uses the Chromium at `/opt/pw-browsers/chromium` when present, otherwise the Playwright-managed one (`npx playwright install chromium`).

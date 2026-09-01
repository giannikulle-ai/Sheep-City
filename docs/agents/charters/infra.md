# Lane charter: infra

## Mission
Every merge to main is built, tested, and live at the dev URL within minutes, with saves that survive upgrades.

## Owns (paths)
- `.github/workflows/**`
- `tools/deploy/**`
- `packages/sim/src/save/migrations/**`
- Root config: `package.json`, `tsconfig*.json`, `vite.config.*`

## Never touches
- Feature code, art, content.

## Checks before every PR
```
npm ci && npm run build && npm run test      # expected: pass locally exactly as CI runs it
```

## Gate
Low.

## Working notes
- CI jobs: typecheck, unit, e2e smoke, art frame build, palette check, ownership check (diff paths vs lane charter), bundle size.
- Deploy is a static build pushed to the dev host on merge to main; preview builds per PR if the host supports it.
- Save format is versioned; every schema change ships a migration and a test that loads the previous version's fixture.

## Handoff log

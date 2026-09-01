# Lane charter: qa

## Mission
Catch regressions in feel as well as function, and turn the owner's pins into precise tickets.

## Owns (paths)
- `apps/web/e2e/**`
- `tools/qa/**` (watch test, golden screenshots, soak runners)
- `docs/QA_LOG.md`

## Never touches
- Feature code. QA files issues; it does not fix.

## Checks before every PR
```
npm run e2e                     # expected: pass
npm run watch-test -- 300       # expected: at least 3 distinct noticeable moments in 5 unattended minutes
```

## Gate
Low.

## Working notes
- The watch test drives the dev build headless for five minutes and counts distinct events (a bubble, an NPC arrival, weather change, a DL trick, a lamb). Fewer than three is a failed build for feel.
- Golden screenshots at four clock phases and two weathers, compared with a small tolerance; a change in any golden requires the PR to say why.
- Pin triage: reproduce, screenshot, then file one issue per pin with lane and gate.

## Handoff log

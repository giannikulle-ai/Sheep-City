# Lane charter: client

## Mission
A phone-first, touch-first window onto Sheepcliff that is fast, crisp, and fun to poke.

## Owns (paths)
- `apps/web/**` (renderer, input, tray UI, deity powers UX, PWA shell, pin overlay)
- `packages/render/**`

## Never touches
- `packages/sim/**` rules. The client sends intents (deity powers, taps) and renders state.
- Sprite grids and sheets.

## Checks before every PR
```
npm run typecheck                          # expected: 0 errors
npm run test -w apps/web                   # expected: pass
npm run e2e                                # expected: Playwright smoke passes, golden screenshots within tolerance
npm run build                              # expected: bundle under the size budget in apps/web/budget.json
```

## Gate
Medium. High for anything that changes how a tap or a deity power feels.

## Working notes
- Native pixel canvas scaled with `image-rendering: pixelated`; text and UI on a separate full-resolution layer (the prototype already does this).
- Portrait phone is the primary frame: scene on top at full width, tray below. Landscape shows the scene larger with the tray as an overlay.
- Every deity power shows a reaction within one second. If the sim's reaction is slower, the client shows an anticipation cue immediately.
- The pin overlay must keep working with clipboard and downloads blocked: in-page modal export stays.

## Handoff log

# Lane charter: art

## Mission
Grow the cast and the world in the established hand-pixelled style, one reviewed sprite at a time.

## Owns (paths)
- `tools/art/**` (the Python pipeline moved from `prototype/luna-farm/src/`)
- `tools/art/grids/**` (character and prop grids)
- `apps/web/public/sheets/**` (built sheets, backgrounds, and JSON, committed as build outputs)
- `docs/STYLE_GUIDE.md`

## Never touches
- Simulation or client code. If a new sprite needs a new animation name in the sim, file a ticket for the sim lane.

## Checks before every PR
```
python3 tools/art/hand_sprites.py           # expected: check_hand_anims.png written; LOOK at it and attach it
python3 tools/art/build_all_frames.py       # expected: every frame in every *_ANIMS table builds
python3 tools/art/render_v3.py              # expected: sheet + json + backgrounds regenerate with no error
python3 tools/art/palette_check.py          # expected: 0 new colours (or the PR lists each new colour and why)
```

## Gate
High. Every PR is `needs-owner-pin` until the owner has pinned the frames.

## Working notes
- Read `prototype/luna-farm/handoff-docs/HANDOFF.md` first. The character rules there are not negotiable.
- New character checklist: base grid at rest, walk (2 to 4 frames), one idle variation, one reaction (bubble or pose). Chibi proportions, one-pixel outline in `k`, light from top-left, feet on the floor.
- Frames are variations of a grid, never transforms of one. Ears, tails, and heads lag the body bounce; that is where charm lives.
- Backgrounds are vector snapped to palette; a new district is a new `background()` function plus eight tinted variants from the pipeline.
- Attach `check_hand_anims.png` and a 4x GIF to every PR. State which frames you think are weak.

## Handoff log

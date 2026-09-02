# tools/art — the Sheepcliff art pipeline

The Python pipeline that compiles the hand-pixelled text grids into a sprite sheet, its JSON, and the
tinted backgrounds. Copied from `prototype/luna-farm/src/` (which stays frozen) with only the
hard-coded `/home/claude/...` paths replaced by paths relative to this directory. No grid or frame
changed in the move.

Read `docs/STYLE_GUIDE.md` and `prototype/luna-farm/handoff-docs/HANDOFF.md` before drawing anything.

## Files
| file | what |
|---|---|
| `pixel_grids.py` | base `SHEEP` and `LUNA` grids + the `PAL` palette (char -> RGB). Start here for any character change. |
| `hand_sprites.py` | every animation frame as an edit of a grid (`paste/clear/shift/crop/flip_v/rot90/outline`), icons, people, props; the `*_ANIMS` tables `(frames, fps, note)`; palette extras. |
| `farm_v3.py` | `ANIMS` registry (what goes on the sheet) + `background()` vector scenery + lights layer. |
| `farm_vectors.py` | vector helpers for scenery (barn, fence, gate, trough, trees). Scenery only; characters are never vector. |
| `render_v3.py` | builds `spritesheet.png` / `.json` / `_4x.png`, eight backgrounds (day, dusk, night, dawn × normal, snow), per-animation GIFs and a showcase GIF. Writes the HTML demos only if a `*_template.html` sits next to it (they live with the client, not here). |
| `render.py` | palette-snap helper used by `render_v3.py` (`to_palette`, `PAL`, `hex2rgb`); its `__main__` is the old v2 smooth-vs-pixel comparison and is not part of the build. |
| `build_all_frames.py` | check: builds every frame of every `*_ANIMS` table, exits 1 on any failure. |
| `palette_check.py` | check: every opaque colour on the built sheet must be in `PAL` (+ extras); exits 1 on an undeclared colour or soft alpha. |
| `build/` | outputs. Only `spritesheet.png`, `spritesheet.json` and `check_hand_anims.png` are committed; the rest is regenerated. |

## Setup
```
pip install -r tools/art/requirements.txt
```
Pillow is enough for the grid tools and both checks. `render_v3.py` also needs Playwright plus a Chromium
for the vector scenery. It uses, in order: `$SHEEPCLIFF_CHROMIUM` if set, then `/opt/pw-browsers/chromium`
if it exists, then Playwright's own download (`python3 -m playwright install chromium`).

## Build and verify (every time, in this order, from the repo root)
```
python3 tools/art/hand_sprites.py        # writes build/check_hand_anims.png — LOOK at it and attach it to the PR
python3 tools/art/build_all_frames.py    # every frame of every *_ANIMS table builds; fails loudly on a missing grid
python3 tools/art/render_v3.py           # sheet + json + 4x + eight backgrounds + gifs into build/
python3 tools/art/palette_check.py       # 0 undeclared colours, or the PR lists each new colour and why
```
Each script prints one summary line at the end; paste those lines into the PR body.

## Rules that the tooling enforces or expects
- Frames are variations of a grid, never transforms. `hand_sprites.py` only offers exact 90° turns and flips.
- Every frame touches the ground: `render_v3.py` bottom-trims each animation to its lowest opaque row. Do not defeat it.
- The palette is fixed. `palette_check.py` treats any colour not in `PAL` after `hand_sprites` import as a failure;
  a new colour is added on purpose, in `PAL`, and named in the PR under `needs-owner-pin`.
- Patch scripts: `str.replace` hits every occurrence (a substring match once nuked `DL_PEEK_ANIMS`). Prefer
  slice edits and assert the anchor exists exactly once.

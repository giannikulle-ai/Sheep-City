# Sheepcliff style guide

How the characters are drawn, so that a new sprite lands in the same world as Digital Luna and the sheep.
Distilled from `prototype/luna-farm/handoff-docs/HANDOFF.md`, `docs/agents/charters/art.md` and the source
in `tools/art/`. The rules in section 1 are the owner's and are not up for debate; the rest is working
guidance from the frames that were accepted.

## 1. Non-negotiables
- **Characters are hand-pixelled text grids.** A character is a block of characters in `pixel_grids.py` or
  `hand_sprites.py`; each character maps to one palette colour, `.` is transparent. Every pixel is placed on
  purpose. Rasterising vectors into characters was tried for about twelve versions and rejected every time
  ("10–15% cute"). Scenery only (barn, fences, trees, ground) is still vector, snapped to the palette.
- **Never scale or rotate a sprite,** except an exact 90° turn (`rot90`) or a flip. Frames are variations of a
  grid, not transforms of one. If a pose needs a bigger or smaller character, redraw it.
- **Every frame touches the ground.** The sheet builder trims each animation to its lowest opaque row so
  feet sit on the cell floor. Do not pad below the feet and do not defeat the trim.
- **The palette is fixed.** `PAL` in `pixel_grids.py` plus the extras `hand_sprites.py` declares. A new colour
  is added deliberately, named in the PR, and waits for the owner's pin (`needs-owner-pin`).
- **Digital Luna (DL, never "DG") and the sheep look are settled.** Do not redesign them.
- **New characters, props and colours ship only after the owner's pin review.**

## 2. The look
- **Chibi proportions.** Big round head, small body, short legs. The head reads first at 1x.
- **One-pixel outline in `k`** (43, 29, 23) around the whole silhouette. No double outlines, no anti-aliasing.
- **Light from the top-left.** Highlights on upper-left surfaces, the darker shade on lower-right; the coat
  uses a highlight, a base and a shadow colour, and the shadow doubles as sel-out against the outline.
- **Hard alpha.** Pixels are fully opaque or fully transparent; no soft edges.
- **Eyes are dark with a white glint.** DL's eyes are the chosen head-bake-off option "F": five-pixel eyes,
  fringe just brushing the top.
- **3/4 view facing screen-right** is the default pose; the client flips for the other direction.

### Digital Luna
Chocolate Havanese. Big round head, long drop ears, dark eyes with a white glint, cream beard and chest, tan
muzzle, white haunch with a brown patch, white plume tail, **no collar**. When she runs her ears flap through
three flap heights and her head lags the body bounce. Keep that.

### Sheep
Round cloud of wool with three levels (trim / normal / overgrown). Upright dark face at the front with a wool
tuft on top, wide white eyes with a low pupil, pink nose and smile, pink ears. Four two-pixel legs joined to a
flat underside. Lambs are the same language, smaller.

## 3. How frames are made
Animations are deliberate edits of a base grid using the helpers in `hand_sprites.py`: `paste`, `clear`,
`shift`, `crop`, `flip_v`, `rot90`, `outline`. A walk cycle moves the body up a pixel and the legs into a new
pose; the ears, tail and head move a frame *behind* the body. Reactions add a small extra grid (a bubble, a
"z", stars, a grass bite) at a fixed offset rather than redrawing the character.

Each animation is an entry in a `*_ANIMS` table: `name: ([frame builders], fps, note)`. Register a new table
in `farm_v3.ANIMS` as `{"pil": True, "anims": as_pil(TABLE)}` and it lands on the sheet and in the JSON.

## 4. New-character checklist
Before opening the PR a new character has, at minimum:
1. A base grid at rest, in `pixel_grids.py` style (chars from `PAL`, `.` transparent, outline in `k`).
2. A walk cycle of two to four frames.
3. One idle variation (a blink, a look-around, an ear twitch).
4. One reaction (a bubble or a pose).
5. Chibi proportions, one-pixel outline, light from top-left, feet on the floor in every frame.
6. Colours only from `PAL`; any addition named in the PR and labelled `needs-owner-pin`.
7. The four checks in `docs/agents/charters/art.md` green, `check_hand_anims.png` and a 4x GIF attached,
   and a sentence per frame you think is weak.

## 5. What makes a frame weak
Say so in the PR when you see any of these; the owner notices them anyway.
- **A transform where a variation was needed.** A shifted, stretched or rotated copy of the rest frame reads
  as slid, not moved. Bounce comes from redrawing the legs and letting the head, ears and tail lag by a frame.
- **Everything moving at once.** If the whole grid shifts one pixel, there is no weight. Something should stay
  planted while something else moves.
- **Feet off the floor.** A frame whose lowest row is above the others makes the character hover after the
  bottom-trim.
- **A broken outline.** A gap in the `k` line, a two-pixel-thick edge, or an interior colour touching the
  transparent background.
- **Off-palette or soft pixels.** A colour not in `PAL` or an alpha that is neither 0 nor 255. Both fail
  `palette_check.py`.
- **Wrong light.** Highlights on the lower-right, or shading that flips between frames.
- **Lost identity.** DL's ears shorter than the rest pose, a collar, orange eyes, a sheep face that is not
  upright at the front, a tuft missing.
- **A reaction that hides the face.** Bubbles and props sit beside or above the head, not over the eyes.
- **Too many frames.** Two good frames at 3 fps beat six near-duplicates at 12. The tables carry fps per
  animation for this reason.

## 6. Before you draw
Read the handoff, open `tools/art/build/check_hand_anims.png` at 100% and look at the frames that were
accepted, then draw the new grid beside an existing one at the same scale. Show, don't tell; admit the weak
frames in the PR.

# Sheepcliff art direction

One page for what Sheepcliff looks like, so a new district or creature is drawn to it rather than to the
artist's guess. Distilled from `docs/STYLE_GUIDE.md`, the HANDOFF, and measurements taken directly off
`tools/art/pixel_grids.py`, `hand_sprites.py`, `farm_v3.py` and the built `spritesheet.json` — where a number
below isn't in the source, it's marked **proposed**. This is the owner's taste; nothing here overrides
`CLAUDE.md`.

## Palette

Every character pixel is one of the 15 entries in `PAL` (`pixel_grids.py`). Pixel counts are from
`palette_check.py`'s scan of the built sheet, so "what it's for" is measured, not guessed.

| char | rgb | pixels on sheet | used for |
|---|---|---|---|
| `k` | 43,29,23 | 17,532 | the one-pixel outline, on every character |
| `d` | 94,64,48 | 15,559 | DL coat base |
| `w`/`e` | 250,246,238 | 8,962 | sheep/lamb wool base; doubles as eye-white |
| `c` | 236,226,206 | 4,362 | DL cream chest, beard, paws |
| `f` | 58,52,62 | 3,745 | sheep/lamb/crow face and leg base |
| `s` | 220,212,198 | 1,993 | wool shadow (lower-left of the cloud) |
| `h` | 255,255,255 | 1,974 | wool highlight; DL's and the sheep's eye glint |
| `b` | 68,44,32 | 1,195 | DL coat "sel-out" — see Outline, below |
| `t` | 206,176,138 | 912 | DL tan muzzle |
| `m` | 124,90,68 | 765 | DL coat highlight (crown, back) |
| `u` | 216,206,186 | 699 | DL cream shadow |
| `p` | 236,160,176 | 619 | pink: nose, inner ear, tongue |
| `n` | 28,18,14 | 461 | DL nose/pupil; the crow's pupil and belly shadow |
| `g` | 86,79,92 | 336 | face highlight; the crow's bill and back highlight |

`hand_sprites.py` adds ~20 more single-purpose extras (icon, clothing, prop colours) not reproduced here.

Scenery is vector, not this palette — `farm_vectors.py` declares its own ~19 hex constants (`GRASS_A/B`,
`BARN_R` family, `FENCE`, …) for gradients and SVG fills. The one deliberate seam: vector `INK` (`#2b1d17`)
is exactly `PAL["k"]`, so scenery and character outlines read as the same ink, though nothing else in the two
palettes has to match.

## Outline

One pixel of `k`, added by `hand_sprites.outline()`: any transparent pixel touching a listed colour becomes
`k`. No double lines, no anti-aliasing, uniform on every character. Scenery's vector outline
(`stroke-width="3"` in the 1600-unit SVG space, `farm_vectors.STROKE`) renders to about 1.2px after the
0.4×-downsample to the 640px background — close to the character's 1px line but not identical; the two
outline systems are visually consistent, not literally the same weight.

Where it breaks, on purpose or not:
- **Deliberate:** DL's running/bounding poses erase the outline at each ear's root (`dl_run`, `dl_trundle`:
  four pixels set to plain coat colour `d`, no `k`) so the ear reads as fused to the skull instead of stuck on.
- **A seam, not a break:** parts are hard-pasted (head over body, etc.), so an underlying part's outline is
  overwritten wherever a new part is opaque above it — clean when the silhouettes still meet, visible when
  they don't. `sheep.graze` frame 2 (`head_dxy=(0,8)`) is the measured case: the head drops below its socket
  and a one-pixel notch opens in the neck line, closing again on the frames either side.
- **Unshaded legs:** every character's legs are flat `f` (or `c`/`u` on DL) plus the outline — no
  highlight/shadow split the way bodies get. Not a broken outline, but a real gap in shading effort.

## Light

Top-left, everywhere, but shown two different ways:
- **Sheep:** directional falloff inside the wool — `h` (highlight) clusters in the upper-left rows of the
  cloud, `s` (shadow) in the lower-left rows, `w` (base) fills the rest. Classic top-left key light.
- **Digital Luna:** `m` (highlight) sits on the crown and the back of the ears/coat; `b` isn't a lower-right
  shadow so much as a sel-out line run along the *whole* silhouette edge (both flanks) to separate her coat
  from whatever's behind it. She reads as lit from the top-left (see the crown), but her "shadow" colour does
  edge-definition more than directional falloff — a looser rule than the sheep's.
- **Barn:** `barnFront`'s gradient runs light-at-top to dark-at-bottom (`#d84034` → `BARN_R`) on the front
  wall, and the receding side wall is flat `BARN_RD`, darker than the front — the wall facing the light is
  brighter, the wall turning away is darker, the same top-left key expressed as front-vs-side.

## Scale per class

Two numbers per class: **canvas**, the fixed working grid its frames share (from the built
`spritesheet.json`), and **content**, the non-transparent bounding box of one standing/idle frame (measured
straight off the grid functions — see method below). Canvas and content differ because a canvas has to fit
every pose a character strikes, not just the reference one.

| class | canvas (px) | content, reference frame (px) | status |
|---|---|---|---|
| Digital Luna | 44 × 40 | 27 × 39 sitting, 35 × 30 running | measured |
| sheep | 32 × 27 | 29 × 27 standing | measured |
| lamb | 21 × 16 | 18 × 16 mid-stride | measured |
| crow | 22 × 16 | 17 × 13 standing | measured — matches `CROW_BRIEF.md`'s own numbers exactly |
| villager (farmer/merchant) | 16 × 21 | 12 × 21 / 11 × 21 walking | measured, but **not owner-pinned as the "villager" class** — treat as a scale anchor, not settled canon |
| cat | ~20 × 14 | ~16 × 11 standing | **proposed** |

Method: `PIL.Image.getbbox()` on `to_img()` of the frame-builder function (`sheep_frame()`, `dl_sit()`,
`LAMB_ANIMS["walk"][0][1]()`, `CROW_STAND`). Canvas is each sprite's `w`/`h` in `spritesheet.json`.

The **cat is proposed**, from the rules rather than a grid: smaller than a lamb, in the rabbit/crow size band
(rabbit 14×13, crow content 17×13), chibi head at ~40–45% of standing body height the way DL's and the
sheep's heads read first, one-pixel `k` outline, feet flat on the canvas's bottom row. FARM_RULES' backlog
("more animals") and CROW_BRIEF's precedent — measure against a sheep or lamb, propose, wait for the pin —
are the basis; no grid exists yet.

A **4x contact sheet of the existing cast at these scales** is at `tools/art/build/review/cast_contact_4x.png`
(below), built by a small script reading only the committed `spritesheet.png`/`.json` — no grid, palette, or
sheet touched.

![Existing cast, side by side at native scale, 4x](../../tools/art/build/review/cast_contact_4x.png)

## Ground rule

Every frame touches the ground. `render_v3.py` bottom-trims each animation to its lowest opaque row, so a
sprite's cell floor *is* its ground contact point in every pose. The contact sheet above relies on exactly
this: every character's cell bottom lands on the same baseline with no per-character offset math.

## Animation rules

Frames are variations of a grid — `paste`/`clear`/`shift`/`crop`/`flip_v`/`outline`, and `rot90` only for an
exact 90° turn — never a scale or an arbitrary rotation of the rest pose. A walk cycle redraws the legs and
moves the body up a pixel; ears, tails and heads lag the body by a frame, where the charm lives (`dl_run`'s
three ear-flap heights trailing the bounce is the clearest example).

Frame count and fps by role, read off every `*_ANIMS` table:

| role | example | frames | fps |
|---|---|---|---|
| idle / status, many frames | DL `sit` | 8 | 4 |
| idle / status | sheep `graze`/`think`/`bleat` | 4 | 3 |
| walk/trot | sheep `trot`, lamb/farmer/merchant `walk` | 2–4 | 6 |
| fast locomotion | DL `run`/`stick`/`trundle`/`bound` | 4 | 9–12 |
| wingbeat | crow `fly`, butterfly `flap` | 2 | 6–8 |
| one-shot transition | crow `land`/`hop`/`takeoff`, sheep `cast` | 2 | 4–6 |
| slow ambient | DL `sleep`, sheep `wool` | 2–3 | 1–1.5 |

The rule underneath the numbers: idle/status states get more frames at a slow fps; locomotion gets few frames
at a high fps; nothing sits at six-plus near-duplicate frames the way `STYLE_GUIDE.md` warns against.

## New district backgrounds

`background()` builds an SVG at a 1600×1000 viewBox and `render_v3.py` rasterises it to a 640×400 PNG — a
0.4px-per-unit downsample. That 640×400 is also the game's own world canvas (`const W = 640, H = 400` in
`sim_template.html`): hand-pixel sprites draw onto it at native 1:1, then the whole thing scales ×2 for
display. A new district must go through the same viewBox → 640px pipeline (or justify a different ratio) so
its ground and buildings sit at the same pixel density as the cast standing on them.

- **Horizon / ground plane.** The field diamond's corners on the 640×400 canvas: top (320, 44) — 11% down —
  right (624, 208), bottom (320, 372) — 93% down — left (16, 208). A new district's ground plane should meet
  this horizon (top ~11% down) unless the ticket deliberately changes it, so districts sit edge-to-edge in
  one shot.
- **Tile scale.** `grassP` repeats every 22×22 SVG units (skewed −30°, y-scaled ×0.6) → 8.8×8.8 render px per
  tile at the standard downsample. A new ground texture should repeat at the same grain unless it's
  deliberately a different material.
- **Sky per phase**, from `render_v3.py`'s `PHASES` table and its `glow`/`sky` calls:

  | phase | tint (r,g,b mult) | window glow | sky depth outside the field | stars | moon |
  |---|---|---|---|---|---|
  | day | none | none | none | 0 | no |
  | dusk | 1.02, .78, .58 | ×0.6 | ~90–92% | 60 | no |
  | night | .40, .48, .80 | ×1.0 | ~45–53% | 260 | yes, crescent |
  | dawn | .96, .80, .86 | ×0.4 | ~95–96% | 40 | no |

  Each phase also has a snow variant (`snowify()`: greens desaturate toward white/blue). Sky/star/moon only
  applies *outside* the fenced diamond (a 9px-dilated mask of the field polygon) — a new district needs the
  same inside/outside mask so its dusk-to-night read matches the farm's.

## Weak spots (measured)

- **The neck seam on `sheep.graze`.** Frame 2 (`head_dxy=(0,8)`) opens a one-pixel gap in the outline
  between the wool cap and the head when the head drops for grazing; the frames on either side close it.
  Visible at 5x in `check_hand_anims.png`, row `sheep.graze`.
- **Legs are the least-finished part of every character.** Flat single-tone fill plus outline, no
  highlight/shadow split, on sheep, lambs, DL and the crow alike — the shading budget goes to bodies and
  faces, not legs.
- **Dead vector-character code sits next to the live vector-scenery code.** `farm_v3.py` still defines
  `sheep()`, `lamb()`, `digital_luna_sit/run/flop/sleep/stretch/nibble()` and `rabbit()`, and
  `farm_vectors.py` separately defines `sheep()`, `lamb()`, `rabbit()` plus a `SCENES` dict pointing at them.
  Grepping every call site in `tools/art` confirms none of it is ever invoked — `ANIMS` builds every
  character from `hand_sprites.py`'s pixel grids, and `background()` only calls scenery helpers
  (`barn_front`, `fence_rail`, `tree`, `trough`, `hay`, …). It's the exact vector-rasterised-character
  approach the HANDOFF says was tried and rejected, left in the files with nothing marking it dead. Grepping
  `def sheep(` finds three unrelated definitions and no signal for which one (none) is canon.
- **DL's "shadow" colour isn't a shadow** in the sheep's sense — see Light, above. Not wrong, since the owner
  has pinned every DL frame that uses it, but "light from top-left" reads differently on her than on the
  sheep; copying DL's *b*-as-selout convention onto a new character won't automatically give correct
  top-left shading elsewhere.
- **Villager and cat scale are both proposed, not pinned.** Farmer/merchant exist as grids but were never
  called out as "the villager class"; treat the numbers above as a pin-review starting point, not settled fact.
- **The crow's own admitted weak frames** (`CROW_BRIEF.md`): the head-down peck, where the bill is two pixels
  and the far leg hides behind the head, and `hop`, which reads close to a shifted `stand` at 1x. Carried
  over here rather than re-litigated.

## Checks run for this ticket

```
python3 tools/art/hand_sprites.py        # ok — check_hand_anims.png byte-identical to committed
python3 tools/art/build_all_frames.py    # ok — 16 tables, 41 animations, 134 frames, 0 failures
python3 tools/art/render_v3.py           # ok — full rebuild byte-identical to committed spritesheet.png/.json
python3 tools/art/palette_check.py       # ok — 0 undeclared colours, 0 soft-alpha, 24 declared-but-unused extras
```

No grid, palette, or sheet changed. `git status` was clean after every rebuild.

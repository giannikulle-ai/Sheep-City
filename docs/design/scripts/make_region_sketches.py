#!/usr/bin/env python3
"""Region map design sketches for issue #62 (docs/design/REGION_MAP.md).

These are sketches for the owner's pin, not sprites: plain rectangles, polygons
and lines at 1x, snapped to the fixed palette, then scaled to 4x with nearest
-neighbour (no smoothing, so pixels stay crisp and no colour is invented by
resampling). They do not use `pixel_grids.py` / `hand_sprites.py` hand-pixelled
grids -- this script only borrows their palette values, copied verbatim below
so a design sketch never touches the art lane's files.

Text labels use `ImageFont.load_default_imagefont()`, a true 1-bit bitmap font
with no anti-aliasing, instead of `ImageFont.load_default()` -- on Pillow 10.1+
the latter returns a FreeTypeFont and anti-aliases every `draw.text` call,
blending off-palette colours into the 1x image before the NEAREST resize.
`load_default_imagefont()` exists on Pillow 11 and later (tested here on
12.3.0); on an older Pillow that lacks it the script falls back to hand-placed
pixel glyphs (see `PIXEL_FONT` below) so output stays palette-only either way.
As a last line of defence the script asserts, after writing each PNG, that
every pixel in the file is a PAL colour -- so an off-palette regression fails
loudly instead of shipping.

Pillow version this was verified on: 12.3.0. Run on a materially older or
newer Pillow and re-check the assertions below before trusting "reproducible."

Run: python3 docs/design/scripts/make_region_sketches.py
Writes: docs/design/img/{map,transition,offscreen_gauge}_sketch.png (4x)
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Palette copied verbatim from tools/art/pixel_grids.py (base PAL) and the
# extras added in tools/art/hand_sprites.py. Values only -- nothing invented.
PAL = {
    "k": (43, 29, 23),     # outline / near-black
    "w": (250, 246, 238),  # wool / warm white
    "h": (255, 255, 255),  # highlight white
    "s": (220, 212, 198),  # wool shadow
    "f": (58, 52, 62),     # face / legs (dark purple-grey)
    "g": (86, 79, 92),     # face highlight
    "p": (236, 160, 176),  # pink
    "d": (94, 64, 48),     # coat base brown
    "b": (68, 44, 32),     # coat shadow brown
    "m": (124, 90, 68),    # coat highlight brown
    "c": (236, 226, 206),  # cream
    "t": (168, 124, 74),   # tan / wood
    "u": (216, 206, 186),  # cream shadow
    "n": (28, 18, 14),     # near-black
    "B": (150, 156, 166),  # stone grey
    "v": (98, 104, 114),   # dark grey
    "y": (250, 220, 90),   # yellow (sun, lantern)
    "z": (127, 178, 230),  # sky blue
    "q": (110, 172, 90),   # green
    "H": (176, 160, 146),  # tan
    "O": (232, 120, 60),   # orange
    "Q": (90, 150, 220),   # water blue
    "R": (211, 58, 47),    # red
    "S": (232, 190, 150),  # sand
    "F": (58, 90, 150),    # deep water blue
    "V": (150, 110, 60),   # wood brown
    "X": (90, 60, 40),     # dark wood brown
    "Z": (214, 60, 50),    # red
    "L": (222, 214, 200),  # light stone / cream
}

SCALE = 4
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "img")
os.makedirs(OUT_DIR, exist_ok=True)

PAL_RGB = list(PAL.values())
PAL_SET = set(PAL_RGB)


def _load_font():
    """A palette-safe text path: a true 1-bit bitmap font, not the
    FreeTypeFont `ImageFont.load_default()` became on Pillow 10.1+ (which
    anti-aliases every `draw.text` call, blending off-palette colours into
    the 1x image before the NEAREST resize -- see script docstring).
    `load_default_imagefont()` is Pillow 11+; on an older Pillow that lacks
    it, fall back to `load_default()` and let `snap_to_palette()` below
    remove whatever anti-aliased colours it introduces.
    """
    try:
        return ImageFont.load_default_imagefont()
    except AttributeError:
        return ImageFont.load_default()


FONT = _load_font()


def canvas(w, h, bg):
    img = Image.new("RGB", (w, h), PAL[bg])
    return img, ImageDraw.Draw(img)


def snap_to_palette(img):
    """Nearest-colour snap of every pixel to PAL. A safety net, not the
    primary path: shapes are already drawn in exact PAL colours and are
    untouched by this; it exists to catch anti-aliasing from text (or
    anything else) regardless of Pillow version, so the palette guarantee
    does not depend on which font `_load_font()` returned.
    """
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            c = px[x, y][:3]
            if c not in PAL_SET:
                px[x, y] = min(
                    PAL_RGB, key=lambda p: (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
                )
    return img


def save(img, name):
    img = snap_to_palette(img)
    big = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    path = os.path.join(OUT_DIR, name)
    big.save(path)
    print(f"wrote {path} ({big.width}x{big.height})")


def assert_palette_only(path):
    """Fails loudly if any pixel in the written PNG is not a PAL colour,
    so a palette regression (e.g. a Pillow upgrade changing font
    rendering again) cannot ship silently."""
    img = Image.open(path).convert("RGB")
    colours = img.getcolors(maxcolors=1_000_000)
    assert colours is not None, f"{path}: more distinct colours than pixels fit to count"
    off = [(count, c) for count, c in colours if c not in PAL_SET]
    off_pixels = sum(count for count, _ in off)
    assert not off, (
        f"{path}: {len(off)} off-palette colour(s), {off_pixels} pixel(s) -- "
        f"e.g. {off[:5]}"
    )
    print(f"palette check OK: {path} ({len(colours)} distinct colours, all in PAL)")


def caption(draw, w, h, lines):
    """A small dark strip with one or two short lines, so the sketch reads on its own."""
    strip_h = 10 * len(lines) + 2
    draw.rectangle([0, h - strip_h, w - 1, h - 1], fill=PAL["k"])
    for i, line in enumerate(lines):
        draw.text((3, h - strip_h + 2 + i * 10), line, font=FONT, fill=PAL["L"])


def dashed_line(draw, x0, y0, x1, y1, color, dash=2, gap=2):
    import math
    dist = math.hypot(x1 - x0, y1 - y0)
    steps = max(1, int(dist))
    on = True
    run = 0
    for i in range(steps + 1):
        t = i / steps
        x = x0 + (x1 - x0) * t
        y = y0 + (y1 - y0) * t
        if on:
            draw.point((round(x), round(y)), fill=color)
        run += 1
        if run >= (dash if on else gap):
            on = not on
            run = 0


def tree(draw, x, y):
    draw.rectangle([x - 1, y - 2, x, y], fill=PAL["X"])
    draw.polygon([(x - 4, y - 3), (x + 5, y - 3), (x, y - 12)], fill=PAL["q"], outline=PAL["k"])


def house(draw, x, y, w, h, wall, roof):
    draw.rectangle([x, y, x + w, y + h], fill=PAL[wall], outline=PAL["k"])
    draw.polygon([(x - 1, y), (x + w // 2, y - h // 2), (x + w + 1, y)], fill=PAL[roof], outline=PAL["k"])


# ---------------------------------------------------------------------------
# Sketch 1: the region map, as the player sees it
# ---------------------------------------------------------------------------
def draw_map():
    W, H = 200, 152
    img, d = canvas(W, H, "z")
    floor = H - 24

    # sea beyond the cliff, right edge
    d.rectangle([160, 40, W - 1, floor], fill=PAL["F"])
    d.rectangle([160, 40, W - 1, 46], fill=PAL["Q"])

    # the cliff-top landmass: one hand-drawn hill shape, not a grid
    land = [(0, 40), (30, 30), (70, 26), (110, 22), (150, 30), (162, 44),
            (155, 90), (120, 118), (60, 130), (0, 120)]
    d.polygon(land, fill=PAL["q"], outline=PAL["k"])

    # cliff face under the harbour
    d.polygon([(150, 30), (162, 44), (155, 90), (140, 90), (145, 40)], fill=PAL["H"], outline=PAL["k"])

    # wildwood, upper-left of the green, behind the village
    for tx, ty in [(30, 40), (40, 36), (50, 42), (22, 48), (58, 38)]:
        tree(d, tx, ty)

    # the lane: one dashed path linking farm -> village green -> harbour
    dashed_line(d, 30, 105, 70, 78, PAL["t"])
    dashed_line(d, 70, 78, 100, 60, PAL["t"])
    dashed_line(d, 100, 60, 140, 46, PAL["t"])

    # Luna Farm (bottom-left): barn + a tuft, "you are here" paw
    house(d, 22, 100, 16, 10, "t", "R")
    d.ellipse([44, 106, 50, 111], fill=PAL["w"], outline=PAL["k"])  # a sheep dot
    d.ellipse([16, 96, 22, 102], fill=PAL["d"], outline=PAL["k"])  # DL, marking "here"

    # Village Green (middle): a cluster of cottages around a well
    house(d, 66, 70, 10, 8, "S", "V")
    house(d, 80, 66, 10, 8, "L", "R")
    house(d, 74, 60, 8, 7, "S", "V")
    d.ellipse([84, 74, 88, 78], outline=PAL["k"], fill=PAL["B"])  # the well

    # Cliff Harbour (upper-right, over the cliff edge): jetty + masts
    d.line([(138, 46), (150, 40)], fill=PAL["V"], width=2)
    d.line([(143, 40), (143, 30)], fill=PAL["X"])
    d.line([(148, 38), (148, 28)], fill=PAL["X"])
    d.polygon([(148, 28), (152, 31), (148, 33)], fill=PAL["L"])  # a sail

    # simple compass rose, corner
    d.line([(188, 12), (188, 22)], fill=PAL["k"])
    d.line([(183, 17), (193, 17)], fill=PAL["k"])
    d.text((185, 5), "N", font=FONT, fill=PAL["k"])

    d.text((6, 5), "SHEEPCLIFF", font=FONT, fill=PAL["k"])
    caption(d, W, H, ["the region map:", "tap a district to go there"])
    save(img, "map_sketch.png")


# ---------------------------------------------------------------------------
# Sketch 2: a transition between two districts
# ---------------------------------------------------------------------------
def draw_transition():
    W, H = 200, 152
    img, d = canvas(W, H, "z")
    floor = H - 24

    # left half already rendered: the farm, mid-wipe
    d.rectangle([0, 50, 95, floor], fill=PAL["q"])
    house(d, 12, 96, 16, 10, "t", "R")
    d.ellipse([40, 100, 46, 106], fill=PAL["w"], outline=PAL["k"])

    # right half: the village green, still assembling (blockier, paler)
    for x in range(100, W, 6):
        for y in range(50, floor, 6):
            if (x + y) % 12 == 0:
                d.rectangle([x, y, x + 4, y + 4], fill=PAL["q"])
    house(d, 150, 90, 12, 8, "S", "V")

    # the dissolve seam: a dithered vertical band, palette-only stipple
    for y in range(40, floor):
        for i, x in enumerate(range(94, 106)):
            if (x + y) % 2 == 0:
                d.point((x, y), fill=PAL["L"] if i % 3 else PAL["k"])

    # the cart travelling the lane through the seam
    d.rectangle([92, 108, 104, 114], fill=PAL["V"], outline=PAL["k"])
    d.ellipse([92, 113, 96, 117], fill=PAL["k"])
    d.ellipse([100, 113, 104, 117], fill=PAL["k"])
    dashed_line(d, 70, 112, 90, 110, PAL["k"], dash=1, gap=2)  # motion trail

    # a small sun/clock marking sim-time passing during the journey
    d.ellipse([170, 26, 182, 38], fill=PAL["y"], outline=PAL["k"])
    for ang in (0, 45, 90, 135, 180, 225, 270, 315):
        import math
        cx, cy = 176, 32
        x1 = cx + 9 * math.cos(math.radians(ang))
        y1 = cy + 9 * math.sin(math.radians(ang))
        x2 = cx + 12 * math.cos(math.radians(ang))
        y2 = cy + 12 * math.sin(math.radians(ang))
        d.line([(x1, y1), (x2, y2)], fill=PAL["y"])

    d.text((4, 5), "FARM", font=FONT, fill=PAL["k"])
    d.text((108, 5), "VILLAGE GREEN", font=FONT, fill=PAL["k"])
    caption(d, W, H, ["a transition:", "a wipe, a cart, time moves on"])
    save(img, "transition_sketch.png")


# ---------------------------------------------------------------------------
# Sketch 3: an off-screen district as seen from the map (a gauge)
# ---------------------------------------------------------------------------
def draw_gauge():
    W, H = 200, 142
    img, d = canvas(W, H, "z")

    # the cliff-edge peek: a rounded window onto the harbour, seen from the farm
    d.rectangle([10, 14, 130, 96], outline=PAL["k"])
    d.rectangle([11, 15, 129, 95], fill=PAL["Q"])
    d.rectangle([11, 70, 129, 95], fill=PAL["F"])  # deeper water at the foot

    # masts poking over the cliff line, gulls, a lit lighthouse window
    for mx in (30, 46, 60):
        d.line([(mx, 40), (mx, 68)], fill=PAL["X"])
    d.polygon([(60, 40), (66, 46), (60, 50)], fill=PAL["L"])  # a sail
    d.rectangle([90, 34, 100, 68], fill=PAL["H"], outline=PAL["k"])  # lighthouse body
    d.rectangle([93, 44, 97, 48], fill=PAL["y"])  # its lit window
    d.polygon([(88, 34), (102, 34), (95, 26)], fill=PAL["R"])  # its roof

    # a thin smoke plume, upper-left, standing for the village behind the ridge
    for i, (sx, sy) in enumerate([(20, 60), (18, 54), (21, 48), (17, 42)]):
        d.ellipse([sx, sy, sx + 3, sy + 3], fill=PAL["B"])

    # gulls
    d.line([(110, 20), (113, 17), (116, 20)], fill=PAL["k"])
    d.line([(118, 26), (121, 23), (124, 26)], fill=PAL["k"])

    # the gauge readout, right of the peek: an empty-mostly bar, honestly "poor"
    gx, gy, gw, gh = 140, 30, 16, 60
    d.rectangle([gx, gy, gx + gw, gy + gh], outline=PAL["k"], fill=PAL["L"])
    fill_h = 12  # a small sliver filled: the harbour reads poor, honestly
    d.rectangle([gx, gy + gh - fill_h, gx + gw, gy + gh], fill=PAL["q"])
    d.text((gx - 2, gy + gh + 3), "poor", font=FONT, fill=PAL["k"])
    d.text((gx - 10, gy - 10), "HARBOUR", font=FONT, fill=PAL["k"])

    caption(d, W, H, ["off-screen: masts, window, smoke", "a gauge, honestly read"])
    save(img, "offscreen_gauge_sketch.png")


if __name__ == "__main__":
    draw_map()
    draw_transition()
    draw_gauge()
    for _name in ("map_sketch.png", "transition_sketch.png", "offscreen_gauge_sketch.png"):
        assert_palette_only(os.path.join(OUT_DIR, _name))

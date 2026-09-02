"""Hand-pixel sprites for Agent Farm. Grids are the source; animations are deliberate edits of those grids."""
from PIL import Image
from pixel_grids import PAL, SHEEP, LUNA

# ------------------------------------------------------------------ grid helpers
def G(s):
    rows = [r for r in s.strip("\n").split("\n")]
    w = max(len(r) for r in rows)
    return [list(r.ljust(w, ".")) for r in rows]

def blank(w, h): return [["."] * w for _ in range(h)]
def copy(g): return [r[:] for r in g]
def W(g): return len(g[0])
def H(g): return len(g)

def crop(g, x0, y0, x1, y1):
    return [r[x0:x1] for r in g[y0:y1]]

def paste(dst, src, x, y, transparent="."):
    out = copy(dst)
    for j, r in enumerate(src):
        for i, ch in enumerate(r):
            if ch != transparent and 0 <= y + j < H(out) and 0 <= x + i < W(out):
                out[y + j][x + i] = ch
    return out

def clear(g, x0, y0, x1, y1):
    out = copy(g)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 <= y < H(out) and 0 <= x < W(out): out[y][x] = "."
    return out

def fill(g, x0, y0, x1, y1, ch):
    out = copy(g)
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 <= y < H(out) and 0 <= x < W(out): out[y][x] = ch
    return out

def shift(g, dx, dy):
    out = blank(W(g), H(g))
    for y in range(H(g)):
        for x in range(W(g)):
            if g[y][x] != "." and 0 <= y + dy < H(g) and 0 <= x + dx < W(g): out[y + dy][x + dx] = g[y][x]
    return out

def flip_v(g): return g[::-1]
def flip_h(g): return [r[::-1] for r in g]
def rot90(g):  # clockwise, exact
    return [list(col) for col in zip(*g[::-1])]

def outline(g, chars, ok="k"):
    """Add a 1px outline of `ok` around any pixel whose char is in `chars`, where currently transparent."""
    out = copy(g)
    for y in range(H(g)):
        for x in range(W(g)):
            if g[y][x] == ".":
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H(g) and 0 <= xx < W(g) and g[yy][xx] in chars: out[y][x] = ok; break
    return out

def grow(g, chars, with_ch):
    """Dilate: any transparent/outline pixel touching `chars` becomes with_ch (then re-outline)."""
    out = copy(g)
    for y in range(H(g)):
        for x in range(W(g)):
            if g[y][x] in (".", "k"):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H(g) and 0 <= xx < W(g) and g[yy][xx] in chars: out[y][x] = with_ch; break
    return outline(out, chars + with_ch)

def shrink(g, chars, keep_outline=True):
    """Erode: outline pixels vanish and the wool touching them becomes the new outline."""
    out = copy(g)
    for y in range(H(g)):
        for x in range(W(g)):
            if g[y][x] == "k":
                out[y][x] = "."
    return outline(out, chars) if keep_outline else out

def to_img(g):
    im = Image.new("RGBA", (W(g), H(g)), (0, 0, 0, 0))
    for y, r in enumerate(g):
        for x, ch in enumerate(r):
            c = PAL[ch]
            if c: im.putpixel((x, y), c + (255,))
    return im

def canvas_paste(w, h, parts):
    """parts: list of (grid, x, y) pasted in order onto a w x h canvas."""
    g = blank(w, h)
    for p, x, y in parts: g = paste(g, p, x, y)
    return g

# ------------------------------------------------------------------ SHEEP parts
_S = G(SHEEP)
SHEEP_HEAD = crop(_S, 19, 0, 32, 16)                      # tuft + face + ears, 13x16
SHEEP_BODY = clear(_S, 19, 0, 32, 16)                      # cloud + legs without head
# rebuild the cloud's top-right where the head used to sit
_fix = G("""
kkkk.
hhhkk
wwwwk
wwwwk
wwwwk
""")
SHEEP_BODY = paste(SHEEP_BODY, G("...........kkkkkkkk"), 0, 2)
SHEEP_BODY = paste(SHEEP_BODY, G(".........kkhhhhhhhhkk"), 0, 3)
SHEEP_BODY = paste(SHEEP_BODY, G(".......kkhhhhhhhhhwwwkk"), 0, 4)
for y in range(5, 18):
    for x in range(19, 24):
        SHEEP_BODY[y][x] = "w" if x < 23 else "k"
SHEEP_BODY[5][22] = "w"; SHEEP_BODY[5][23] = "k"
SHEEP_BODY[4][22] = "k"
SHEEP_LEGS_ROWS = (21, 27)

def sheep_legs(g, lifted=()):
    """Lift legs by index (0..3, left→right): shorten by one row at the bottom and raise 1px."""
    out = copy(g)
    xs = [(8, 12), (12, 16), (18, 22), (22, 26)]
    for i in lifted:
        x0, x1 = xs[i]
        col = crop(out, x0, 21, x1, 27)
        out = clear(out, x0, 21, x1, 27)
        out = paste(out, col[:-1], x0, 21)
        # re-close the bottom
        for x in range(x0, x1):
            if out[25][x] == "f": out[25][x] = "f"
        for x in range(x0, x1):
            if out[25][x] != ".": out[26][x] = "."
        for x in range(x0 + 1, x1 - 1): out[25][x] = "k"
    return out

def sheep_eyes_closed(head):
    h = copy(head)
    for y, r in enumerate(h):
        for x, ch in enumerate(r):
            if ch == "e": h[y][x] = "f"
    # lash line
    for x in (3, 4, 7, 8): h[9][x] = "k"
    return h

def sheep_mouth_open(head):
    h = copy(head)
    h = paste(h, G("kppk\nkppk"), 3, 12)
    return h

BUCKET = G("""
..kkkkkkkkkkk..
.kBBBBBBBBBBBk.
kvBBBBBBBBBBBvk
kvBBBBBBBBBBBvk
.kBBBBBBBBBBBk.
.kvBBBBBBBBBvk.
.kvBBBBBBBBBvk.
.kvBBBBBBBBBvk.
..kvBBBBBBBvk..
..kvBBBBBBBvk..
...kkkkkkkkk...
""")
PAL.setdefault("b", (68, 44, 32))
PAL["B"] = (150, 156, 166); PAL["v"] = (98, 104, 114); PAL["y"] = (250, 220, 90); PAL["z"] = (127, 178, 230); PAL["q"] = (110, 172, 90)
STAR = G(".y.\nyyy\n.y.")
ZZ = G("zzz\n..z\n.z.\nzzz")
GRASSBITE = G("q.q\nqqq")

def sheep_frame(body_lift=(), head_dxy=(0, 0), head=None, body_dy=0, extras=(), w=32, h=27, nolegs=False):
    body = copy(SHEEP_BODY)
    if nolegs: body = clear(body, 0, 21, 32, 27)
    body = sheep_legs(body, body_lift)
    head = head if head is not None else SHEEP_HEAD
    g = canvas_paste(w, h, [(body, 0, body_dy), (head, 19 + head_dxy[0], head_dxy[1])] + [(e, x, y) for e, x, y in extras])
    return g

def sheep_x_eyes(head):
    h = copy(head)
    for y in range(8, 11):
        for x in range(2, 11):
            if h[y][x] in "ek": h[y][x] = "f"
    for bx in (3, 7):
        for (x, y) in ((0, 0), (2, 0), (1, 1), (0, 2), (2, 2)): h[8 + y][bx + x] = "k"
    return h

def sheep_cast(kick=0):
    body = flip_v(SHEEP_BODY)                         # legs up
    if kick:                                          # alternate legs kick out by a pixel
        for x0, x1 in ((8, 12), (18, 22)):
            col = crop(body, x0, 0, x1, 6); body = clear(body, x0, 0, x1, 6); body = paste(body, col, x0 - 1, 0)
    head = sheep_x_eyes(sheep_mouth_open(SHEEP_HEAD))
    head = paste(head, G("pp"), 5, 14)                # tongue out
    g = canvas_paste(32, 27, [(body, 0, 0), (head, 19, 11)])
    return g

def sheep_rest(blink=False):
    body = clear(SHEEP_BODY, 0, 21, 32, 27)
    body = paste(body, G(".......kkkkkkkkkkkkkkk"), 0, 21)
    head = sheep_eyes_closed(SHEEP_HEAD) if not blink else SHEEP_HEAD
    return canvas_paste(32, 27, [(body, 0, 5), (head, 19, 6)])

def sheep_wool(level):
    body = SHEEP_BODY
    cloud_chars = "whs"
    if level == 0:
        body = shrink(body, cloud_chars)
        # legs got their outline eaten; redraw legs from the original
        body = paste(body, crop(SHEEP_BODY, 0, 21, 32, 27), 0, 21)
        for x in range(32):
            if SHEEP_BODY[21][x] == "k" and body[21][x] == ".": body[21][x] = "k"
    elif level == 2:
        top = clear(body, 0, 21, 32, 27)
        top = grow(top, cloud_chars, "w")
        body = paste(top, crop(SHEEP_BODY, 0, 21, 32, 27), 0, 21)
    return canvas_paste(32, 27, [(body, 0, 0), (SHEEP_HEAD, 19, 0)])

SHEEP_ANIMS = {
    "graze":  ([lambda: sheep_frame(head_dxy=(0, 8), extras=[(GRASSBITE, 29, 24)]),
                lambda: sheep_frame(head_dxy=(0, 9), head=sheep_mouth_open(SHEEP_HEAD), extras=[(GRASSBITE, 29, 24)]),
                lambda: sheep_frame(head_dxy=(0, 8)),
                lambda: sheep_frame(head_dxy=(0, 3))], 3, "idle"),
    "think":  ([lambda: sheep_frame(), lambda: sheep_frame(head=sheep_mouth_open(SHEEP_HEAD)), lambda: sheep_frame(), lambda: sheep_frame(head_dxy=(0, 1))], 3, "reasoning"),
    "trot":   ([lambda: sheep_frame(body_lift=(0, 2)), lambda: sheep_frame(body_dy=-1, head_dxy=(0, -1)),
                lambda: sheep_frame(body_lift=(1, 3)), lambda: sheep_frame(body_dy=-1, head_dxy=(0, -1))], 6, "tool call / walking"),
    "bleat":  ([lambda: sheep_frame(head=sheep_mouth_open(SHEEP_HEAD), head_dxy=(0, -1), extras=[(G("z\n.z\nz"), 31, 6)]), lambda: sheep_frame(),
                lambda: sheep_frame(head=sheep_mouth_open(SHEEP_HEAD), head_dxy=(0, -1), extras=[(G("z\n.z\nz"), 31, 6)]), lambda: sheep_frame()], 3, "waiting on user"),
    "rest":   ([lambda: sheep_rest(), lambda: sheep_rest(), lambda: sheep_rest(), lambda: paste(sheep_rest(), ZZ, 28, 0)], 1.5, "done"),
    "cast":   ([lambda: sheep_cast(0), lambda: sheep_cast(1)], 4, "hard failure"),
    "bucket": ([lambda: sheep_frame(head=BUCKET, head_dxy=(-1, 3)), lambda: sheep_frame(head=BUCKET, head_dxy=(0, 3), extras=[(STAR, 29, 0), (STAR, 25, 1)]),
                lambda: sheep_frame(head=BUCKET, head_dxy=(-1, 3)), lambda: sheep_frame(head=BUCKET, head_dxy=(-2, 3))], 4, "soft failure"),
    "wool":   ([lambda: sheep_wool(0), lambda: sheep_wool(1), lambda: sheep_wool(2)], 1, "context usage 0/1/2"),
}

# ------------------------------------------------------------------ LAMB (20x17)
LAMB = G("""
..............kkk....
.......kkkkk.khhhk...
.....kkhhhhhkkhwwhk..
....khhhhwwwwkkkkkkk.
...khhhwwwwwwkggfffk.
...khhwwwwwwwkgfeefkp
...khwwwwwwwwkkfekfkk
...kwwwwwwwwwwkfpppk.
...kswwwwwwwwwwkfffk.
...ksswwwwwwwwwwkkk..
....kssswwwwwwwwk....
.....kkssssswwwwk....
.......kkkkkkkkk.....
......kffk.kffk......
......kffk.kffk......
......kkkk.kkkk......
""")
def lamb_frame(lift=(), dy=0):
    g = copy(LAMB)
    xs = [(6, 10), (11, 15)]
    for i in lift:
        x0, x1 = xs[i]
        g = clear(g, x0, 15, x1, 16); 
        for x in range(x0, x1): g[14][x] = "k"
    return shift(g, 0, dy)
LAMB_ANIMS = {"walk": ([lambda: lamb_frame((0,)), lambda: lamb_frame((), -1), lambda: lamb_frame((1,)), lambda: lamb_frame((), -1)], 6, "sub-agent")}

# ------------------------------------------------------------------ DIGITAL LUNA parts
_L = G(LUNA)
DL_HEAD = crop(_L, 0, 0, 32, 24)          # head incl. ears + neck top, 32x24
DL_BODY = crop(_L, 0, 24, 32, 39)         # sitting body, 32x15
DL_W, DL_H = 44, 40

def dl_eyes_closed(head):
    h = copy(head)
    for y in range(9, 14):
        for x in range(8, 14):
            if h[y][x] in "whn": h[y][x] = "d"
        for x in range(18, 24):
            if h[y][x] in "whn": h[y][x] = "d"
    for x in (9, 10, 11, 12, 19, 20, 21, 22): h[11][x] = "k"
    return h

def dl_no_tongue(head):
    h = copy(head)
    for y in range(20, 24):
        for x in range(12, 22):
            if h[y][x] == "p": h[y][x] = "."
    # close the chin: the k pixels that framed the tongue become chin outline
    return h

def dl_long_tongue(head, extra=2):
    h = copy(head)
    for y in range(22, 22 + extra):
        for x in (16, 17):
            if y < H(h): h[y][x] = "p"
    return h

def dl_ear(head, side, lift):
    """Lift one ear: shorten it by `lift` rows from the bottom (ears are cols 3-7 / 24-28, rows 5-19)."""
    h = copy(head)
    xs = range(3, 8) if side == 0 else range(24, 29)
    for y in range(20 - lift, 21):
        for x in xs:
            if h[y][x] != "." and h[y][x] not in "wc":
                h[y][x] = "."
    for x in xs: 
        y = 19 - lift
        if h[y][x] in "dbm": h[y][x] = "k"
    return h

def dl_sit(head_dx=0, head_dy=0, head=None, wag=0):
    body = copy(DL_BODY)
    if wag:   # plume lifts: re-paste the tail crop higher over the original (no hole)
        tail = crop(body, 2, 3, 9, 8); body = paste(body, tail, 2, 3 - wag)
    head = head if head is not None else DL_HEAD
    return canvas_paste(DL_W, DL_H, [(body, 4, 24), (head, 4 + head_dx, head_dy)])

# run body (horizontal, facing right) 40x26 with 4 leg variants
DL_RUN_BODY = G("""
........................................
........................................
........................................
........................................
........................................
........................................
....kkk.................................
...kwwwkkkkkkkkkkkkkk...................
..kwwwkmmddddddddddddkk.................
..khwkmddddddddddddddddkk...............
...kkkddddddddddddddddddk...............
....kbdddddddddddddddddddk..............
....kbbddddddddddddddddddk..............
....kkbbddddddddddddddddkk..............
.....kkccccccccccccccccck...............
......kccccccccccccccccck...............
......kcccccccccccccccck................
.......kkcccccccccccckk.................
""")
# ears streaming behind at three flap heights (they lag the body's bounce)
EARS_HI = G("""
.kkk..........
kdddkk........
kmddddkk......
.kkddddddk....
...kkddddk....
.....kkkkk....
......kkkk....
....kkdddk....
...kdddddk....
....kkkkk.....
""")
EARS_MID = G("""
..............
.kkkkkkk......
kmddddddkk....
kdddddddddk...
.kkkkkkkkk....
......kkkkk...
....kkddddk...
....kdddddk...
.....kkkkk....
""")
EARS_LO = G("""
..............
..............
.kkkkk........
kmddddkk......
kdddddddkk....
.kkkdddddk....
....kkkkdk....
....kkddk.....
...kddddk.....
....kkkk......
""")
EARS_BACK = [EARS_HI, EARS_MID, EARS_LO]

def dl_run_legs(phase):
    # near legs as (top, knee, foot); far legs are the same shifted back/up and shaded
    legs = [
        [((8, 12), (5, 17), (3, 21)), ((21, 12), (24, 17), (26, 21))],   # flight: hind back, front forward
        [((9, 12), (9, 17), (9, 21)), ((21, 12), (21, 17), (21, 21))],   # contact: straight under
        [((9, 12), (11, 16), (11, 20)), ((21, 12), (19, 16), (19, 20))], # gather: tucked, no crossing
        [((8, 12), (6, 17), (5, 21)), ((21, 12), (23, 17), (25, 21))],   # push
    ][phase]
    g = blank(44, 28)
    def seg(ax, ay, bx, by, col):
        n = max(abs(by - ay), 1)
        for i in range(n + 1):
            y = ay + i; x = round(ax + (bx - ax) * i / n)
            if y >= 28: break
            for dx, ch in ((-1, "k"), (0, col), (1, col), (2, "k")):
                xx = x + dx
                if 0 <= xx < 44 and (g[y][xx] == "." or ch != "k"): g[y][xx] = ch
    for (x0, y0), (x1, y1), (x2, y2) in legs:
        seg(x0, y0, x1, y1, "c"); seg(x1, y1, x2, y2, "c")
        for dx, ch in ((-1, "k"), (0, "u"), (1, "u"), (2, "k")):
            if 0 <= x2 + dx < 44 and y2 + 1 < 28: g[y2 + 1][x2 + dx] = ch
        for dx in (0, 1):
            if y2 + 2 < 28: g[y2 + 2][x2 + dx] = "k"
    return g

def dl_run(phase, stick=False):
    dy = [-2, 0, -1, -1][phase]
    bob = [0, -1, 0, -1][phase]
    ear = [1, 0, 2, 0][phase]                    # mid, hi, lo, hi — flopping against the bounce
    head_dy = -bob                               # head + fur lag the body by a pixel
    legs = dl_run_legs(phase)
    far = shift(legs, 3, -1)
    far = [[("u" if ch == "c" else ch) for ch in r] for r in far]
    g = canvas_paste(DL_W, DL_H, [(far, 0, 8 + dy), (DL_RUN_BODY, 0, 8 + dy), (legs, 0, 8 + dy)])
    hd = clear(clear(copy(DL_HEAD), 0, 5, 8, 22), 24, 5, 32, 22)   # drop the hanging ears entirely
    hd = outline(hd, "dbm")                                          # re-close the dome where they were cut
    hd = dl_long_tongue(hd, 2)
    g = paste(g, hd, 12, 2 + dy + head_dy)
    # ears drawn AFTER the head so their roots sit on the dome's edge (attached, not floating)
    ears = EARS_BACK[ear]
    g = paste(g, ears, 11, 5 + dy + head_dy)
    for (ex, ey) in [(21, 8), (21, 9), (22, 8), (22, 9)]:            # blend the root into the coat
        g[ey + dy + head_dy][ex] = "d"
    if stick:
        g = paste(g, G("kkkkkkkkkkkkkk\nkttttttttttttk\nkkkkkkkkkkkkkk"), 28, 20 + dy)
    return g

DL_FLOP_BODY = G("""
...kkk...kkk...kkk...kkk........
...kcck..kcck..kcck..kcck.......
...kcck..kcck..kcck..kcck.......
...kcck..kcck..kcck..kcck.......
..kkcckkkkcckkkkcckkkkcckk......
.kwwcccccccccccccccccccccwk.....
kdwwwccccccccccccccccccwwwdk....
kddwwwwccccccccccccccwwwwddk....
kddwwwwwwwwwwwwwwwwwwwwwwddk....
.kdddwwwwwwwwwwwwwwwwwwwddk.....
..kkddddwwwwwwwwwwwwwddddkk.....
....kkkkkkkkkkkkkkkkkkkkkk......
""")
def dl_trundle(phase, spray="A"):
    """Bounding through deep snow or grass: crouch, launch, apex, land. `spray` char is what gets kicked up."""
    dy = [2, -6, -7, -1][phase]
    hind, front = [((6, 4), (-5, -2)), ((-8, -10), (7, 9)), ((2, -1), (3, 0)), ((-3, -6), (1, 7))][phase]
    ear = [1, 0, 2, 1][phase]
    head_dy = [2, -1, 0, 1][phase]
    # reuse the run leg builder with these poses
    legs = blank(44, 28)
    def seg(ax, ay, bx, by, col):
        n = max(abs(by - ay), 1)
        for i in range(n + 1):
            y = ay + i; x = round(ax + (bx - ax) * i / n)
            if y >= 28: break
            for ddx, ch in ((-1, "k"), (0, col), (1, col), (2, "k")):
                xx = x + ddx
                if 0 <= xx < 44 and (legs[y][xx] == "." or ch != "k"): legs[y][xx] = ch
    for (x0, y0), (a1, a2) in (((8, 12), hind), ((21, 12), front)):
        seg(x0, y0, x0 + a1, y0 + 5, "c"); seg(x0 + a1, y0 + 5, x0 + a1 + a2, y0 + 9, "c")
        for ddx, ch in ((-1, "k"), (0, "u"), (1, "u"), (2, "k")):
            if 0 <= x0 + a1 + a2 + ddx < 44: legs[y0 + 10][x0 + a1 + a2 + ddx] = ch
    far = [[("u" if ch == "c" else ch) for ch in r] for r in shift(legs, 3, -1)]
    g = canvas_paste(DL_W, DL_H, [(far, 0, 8 + dy), (DL_RUN_BODY, 0, 8 + dy), (legs, 0, 8 + dy)])
    hd = outline(clear(clear(copy(DL_HEAD), 0, 5, 8, 22), 24, 5, 32, 22), "dbm")
    hd = dl_long_tongue(hd, 2) if phase in (1, 2) else hd
    g = paste(g, hd, 12, 2 + dy + head_dy)
    g = paste(g, EARS_BACK[ear], 11, 5 + dy + head_dy)
    for (ex, ey) in [(21, 8), (21, 9), (22, 8), (22, 9)]: g[ey + dy + head_dy][ex] = "d"
    # spray: behind on launch, in front on landing
    pts = {0: [], 1: [(2, 34), (4, 31), (6, 35), (1, 37), (8, 33)], 2: [(0, 36), (3, 38)], 3: [(30, 36), (34, 34), (37, 37), (32, 38), (40, 35), (28, 38)]}[phase]
    for (px, py) in pts:
        if 0 <= px < DL_W and 0 <= py < DL_H: g[py][px] = spray
    return g

def dl_flop(phase):
    body = copy(DL_FLOP_BODY)
    if phase:   # paws twitch: raise the 2nd and 4th paw by one
        for x0 in (9, 21):
            body = clear(body, x0, 3, x0 + 4, 4); body = paste(body, crop(DL_FLOP_BODY, x0, 0, x0 + 4, 1), x0, -1)
    head = dl_long_tongue(DL_HEAD, 2) if not phase else dl_eyes_closed(DL_HEAD)
    head = dl_ear(head, 1, 4)
    return canvas_paste(DL_W, DL_H, [(body, 0, 22), (head, 14, 8)])

DL_SLEEP_BODY = G("""
........kkkkkkkkkkkkkk..........
......kkdddddddddddddkkk........
.....kdddddddddddddddddkk.......
....kddddddddddddddddddddk......
...kwddddddddddddddddddddk......
..khwwdddddddddddddddddddk......
..kwwwwwddddddddddddddddk.......
...kwwwwwwwwwwwwwwwwwwwwk.......
....kkwwwwwwwwwwwwwwwwkk........
......kkkkkkkkkkkkkkkk..........
""")
def dl_sleep(phase):
    head = dl_no_tongue(dl_eyes_closed(DL_HEAD))
    g = canvas_paste(DL_W, DL_H, [(DL_SLEEP_BODY, 2, 26), (head, 6, 8)])
    g = paste(g, ZZ, 32, 6 - phase * 3)
    return g

DL_STRETCH_BODY = G("""
.......kkk..................................
......kwwwk.................................
.....khwwwk.................................
.....kkwwkk.................................
....kkddddkk................................
...kddddddddkk..............................
..kddddddddddddkk...........................
..kbdddddddddddddkk.........................
..kbddddddddddddddddkk......................
..kbdddddddddddddddddddkk...................
..kbddddddddddddddddddddddkk................
..kkbddddddddddddddddddddddddk..............
...kkbdddddddddddddddddddddddk..............
....kkbbdddddddddddddddddddddk..............
.....kkkkddddddddddddddddddddk..............
........kbbdddddddddddddddddk...............
.........kkbbddddddddddddddkk...............
...........kkkkkkkkkkkkkkkkk................
""")
DL_STRETCH_LEGS = G("""
..........kkkkkkkkk.....kkkkkkkkk...........
.........kcccccccck....kcccccccccck.........
.........kcccccccccck..kcccccccccck.........
.........kuuuuuuuuuuk..kuuuuuuuuuuk.........
..........kkkkkkkkkk....kkkkkkkkkk..........
""")

def dl_yawn(head):
    h = dl_no_tongue(dl_eyes_closed(head))
    h = paste(h, G("..kkkkkk..\n.kppppppk.\n.kppppppk.\n..kppppk..\n...kkkk..."), 11, 18)
    return h

def dl_stretch(phase):
    if phase == 0:   # downward dog: rump up behind, head low at the front, forelegs flat on the ground
        head = dl_no_tongue(dl_eyes_closed(DL_HEAD))
        return canvas_paste(DL_W, DL_H, [(DL_STRETCH_BODY, 0, 2), (head, 10, 12), (DL_STRETCH_LEGS, 0, 35)])
    return dl_sit(head=dl_yawn(DL_HEAD), head_dy=-1)

def dl_nibble(phase):
    head = dl_no_tongue(dl_eyes_closed(DL_HEAD))
    return dl_sit(head=head, head_dy=8 + phase, wag=phase)

DL_ANIMS = {
    "sit":     ([lambda: dl_sit(), lambda: dl_sit(head_dy=1), lambda: dl_sit(head_dy=1, head=dl_eyes_closed(DL_HEAD)), lambda: dl_sit(head_dy=1),
                 lambda: dl_sit(), lambda: dl_sit(wag=1), lambda: dl_sit(wag=2, head_dy=1), lambda: dl_sit(wag=1)], 4, "default idle"),
    "tilt":    ([lambda: dl_sit(head=dl_ear(DL_HEAD, 0, 3), head_dx=-1), lambda: dl_sit(head=dl_ear(DL_HEAD, 0, 3), head_dx=-1),
                 lambda: dl_sit(head=dl_ear(DL_HEAD, 1, 3), head_dx=1), lambda: dl_sit(head=dl_ear(dl_eyes_closed(DL_HEAD), 1, 3), head_dx=1)], 2, "waiting for orders"),
    "pant":    ([lambda: dl_sit(head=dl_long_tongue(DL_HEAD, 1)), lambda: dl_sit(head=dl_long_tongue(DL_HEAD, 2), head_dy=1, wag=2),
                 lambda: dl_sit(head=dl_long_tongue(DL_HEAD, 1), wag=1), lambda: dl_sit(head=dl_long_tongue(DL_HEAD, 2), head_dy=1)], 8, "happy"),
    "run":     ([(lambda i: (lambda: dl_run(i)))(i) for i in range(4)], 12, "herding"),
    "stick":   ([(lambda i: (lambda: dl_run(i, stick=True)))(i) for i in range(4)], 9, "rare idle"),
    "nibble":  ([lambda: dl_nibble(0), lambda: dl_nibble(1), lambda: dl_nibble(0), lambda: dl_sit(head=dl_eyes_closed(DL_HEAD), head_dy=4)], 3, "eating grass"),
    "flop":    ([lambda: dl_flop(0), lambda: dl_flop(0), lambda: dl_flop(1)], 2, "rare idle, all is well"),
    "sleep":   ([lambda: dl_sleep(0), lambda: dl_sleep(1)], 1, "no agents"),
    "stretch": ([lambda: dl_stretch(0), lambda: dl_stretch(0), lambda: dl_stretch(1), lambda: dl_stretch(1)], 1.5, "sunrise stretch"),
    "trundle": ([(lambda i: (lambda: dl_trundle(i, "A")))(i) for i in range(4)], 9, "bounding through snow"),
    "bound":   ([(lambda i: (lambda: dl_trundle(i, "q")))(i) for i in range(4)], 9, "bounding through deep grass"),
}

RABBIT_A = G("""
...kk...kk....
..kHHk.kHHk...
..kHpHkHpHk...
..kHpHkHpHk...
...kHHkHHk....
..kkHHHHHHkk..
.kHHHHHHHHHHk.
.kHkHHHHHkHHk.
kwHHHHHHHHHHHk
kwHHHHpHHHHHHk
.kHHHHHHHHHHk.
..kkHHHkHHHkk.
....kkk.kkk...
""")
RABBIT_B = G("""
..............
...kk...kk....
..kHHk.kHHk...
..kHpHkHpHk...
...kHHkHHk....
..kkHHHHHHkk..
.kHHHHHHHHHHk.
.kHkHHHHHkHHk.
kwHHHHHHHHHHHk
kwHHHHpHHHHHHk
.kkHHHHHHHHkk.
..kkkkkkkkkk..
..............
""")
PAL["H"] = (176, 160, 146)
RABBIT_ANIMS = {"hop": ([lambda: RABBIT_A, lambda: RABBIT_B, lambda: RABBIT_B, lambda: RABBIT_A], 8, "farm is calm")}

# ------------------------------------------------------------------ ICONS (bubbles over a sheep / DL) + small life
PAL["I"] = (43, 29, 23); PAL["W"] = (250, 246, 238); PAL["A"] = (255, 255, 255); PAL["O"] = (232, 120, 60)
PAL["Q"] = (90, 150, 220); PAL["G"] = (110, 172, 90); PAL["Y"] = (250, 220, 90); PAL["R"] = (211, 58, 47); PAL["J"] = (150, 156, 166)
ICON_FILE = G("""
.kkkkkkk..
.kWWWWWkk.
.kWkkkWWk.
.kWWWWWWk.
.kWkkkkWk.
.kWWWWWWk.
.kWkkkkWk.
.kWWWWWWk.
.kkkkkkkk.
""")
ICON_SHELL = G("""
kkkkkkkkkk
kIIIIIIIIk
kIGIIIIIIk
kIIGIIIIIk
kIGIGGGIIk
kIIIIIIIIk
kkkkkkkkkk
""")
ICON_WEB = G("""
...kkkk...
..kQQQQk..
.kQkQQkQk.
kQQkQQkQQk
kkkkkkkkkk
kQQkQQkQQk
.kQkQQkQk.
..kQQQQk..
...kkkk...
""")
ICON_DB = G("""
.kkkkkkkk.
kJJJJJJJJk
kkkkkkkkkk
kJJJJJJJJk
kkkkkkkkkk
kJJJJJJJJk
.kkkkkkkk.
""")
ICON_SHEARS = G("""
kk......kk
kJk....kJk
.kJk..kJk.
..kJkkJk..
...kJJk...
...kkkk...
..kRkkRk..
.kRk..kRk.
.kk....kk.
""")
ICON_BANG = G("""
..kkkk..
.kRRRRk.
.kRRRRk.
.kRRRRk.
..kRRk..
..kRRk..
..kkkk..
..kRRk..
..kkkk..
""")
ICON_ARROW = G("""
......kk..
......kYk.
kkkkkkkYYk
kYYYYYYYYYk
kkkkkkkYYk
......kYk.
......kk..
""")
ICON_QUESTION = G("""
..kkkk..
.kYYYYk.
.kkkkYk.
....kYk.
...kYk..
...kkk..
...kYk..
...kkk..
""")
ICON_HEART = G("""
.kk..kk.
kRRkkRRk
kRRRRRRk
kRRRRRRk
.kRRRRk.
..kRRk..
...kk...
""")
ICONS = [ICON_FILE, ICON_SHELL, ICON_WEB, ICON_DB, ICON_SHEARS, ICON_BANG, ICON_ARROW, ICON_QUESTION, ICON_HEART]  # coin appended below
ICON_ANIMS = {"all": ([(lambda g: (lambda: g))(g) for g in ICONS], 1, "0 file,1 shell,2 web,3 db,4 shears,5 bang,6 arrow,7 question,8 heart")}

BIRD_A = G("""
...kk...
..kOOk..
.kOOkOk.
kOOOOOOk
.kkkkkkk
...kk...
""")
BIRD_B = G("""
kk....kk
.kOkkOk.
..kOOk..
.kOOOOk.
kOOOOOOk
.kkkkkk.
""")
BIRD_ANIMS = {"sit": ([lambda: BIRD_A, lambda: BIRD_A, lambda: BIRD_A, lambda: BIRD_B], 2, "on a post"), "fly": ([lambda: BIRD_B, lambda: BIRD_A], 8, "flying")}
BFLY_A = G("""
kk...kk
kYYkYYk
.kYYYk.
kYYkYYk
kk...kk
""")
BFLY_B = G("""
.......
.kk.kk.
kYYkYYk
.kk.kk.
.......
""")
BFLY_ANIMS = {"flap": ([lambda: BFLY_A, lambda: BFLY_B], 8, "butterfly")}
GROUND_STICK = G("""
kkkkkkkkkkkkk
kyyyyyyyyyyyk
kkkkkkkkkkkkk
""")
GROUND_STICK = [[("t" if ch == "y" else ch) for ch in r] for r in GROUND_STICK]
PAL["t"] = (168, 124, 74)
STICK_ANIMS = {"lay": ([lambda: GROUND_STICK], 1, "thrown stick on the ground")}
PEEK_ANIMS = {"look": ([lambda: SHEEP_HEAD, lambda: SHEEP_HEAD, lambda: SHEEP_HEAD, lambda: sheep_eyes_closed(SHEEP_HEAD)], 2, "peeking from the barn")}
DL_PEEK = crop(DL_HEAD, 5, 3, 28, 24)
DL_PEEK_BLINK = crop(dl_eyes_closed(DL_HEAD), 5, 3, 28, 24)
DL_PEEK = crop(DL_HEAD, 5, 3, 28, 24)
DL_PEEK_BLINK = crop(dl_eyes_closed(DL_HEAD), 5, 3, 28, 24)
DL_PEEK_ANIMS = {"look": ([lambda: DL_PEEK, lambda: DL_PEEK, lambda: DL_PEEK, lambda: DL_PEEK_BLINK], 2, "DL peeking from the barn")}

# ------------------------------------------------------------------ DL RIDES A SHEEP (rare emote)
def dl_ride(phase):
    """DL perched on a trotting sheep: head high over the rump, paws gripping the wool, sheep's face clear in front."""
    legs = ["trotA", "trotM", "trotB", "trotM"][phase]
    bob = [0, -1, 0, -1][phase]
    g = blank(38, 48)
    sheep_g = sheep_frame(body_lift={"trotA": (0, 2), "trotB": (1, 3), "trotM": ()}[legs], head_dxy=(0, 2), body_dy=(0 if legs != "trotM" else -1))
    g = paste(g, sheep_g, 4, 21)
    # her chest against the wool
    g = paste(g, G(".kkkkkkkk.\nkdddddddbk\nkdddddddbk\nkbdddddbk.\n.kkkkkkk.."), 7, 20 + bob)
    # gripping paws
    g = paste(g, G(".kkk.\nkccck\nkuuck\n.kkk."), 5, 24 + bob)
    g = paste(g, G(".kkk.\nkccck\nkuuck\n.kkk."), 17, 24 + bob)
    # head high over the rump, ears flapping with the bounce
    hd = dl_ear(DL_HEAD, phase % 2, 2) if phase % 2 == 0 else DL_HEAD
    hd = dl_long_tongue(hd, 2)
    g = paste(g, hd, -3, 1 + bob)
    return g

def sheep_frame_or(legs=None, **kw):
    return sheep_frame(**kw)

RIDE_ANIMS = {"go": ([(lambda i: (lambda: dl_ride(i)))(i) for i in range(4)], 9, "DL riding a sheep")}

# ------------------------------------------------------------------ PEOPLE (farmer, merchant) + cart + upgrades
PAL["S"] = (232, 190, 150); PAL["F"] = (58, 90, 150); PAL["V"] = (150, 110, 60); PAL["X"] = (90, 60, 40); PAL["Z"] = (214, 60, 50); PAL["L"] = (222, 214, 200)
def person(hat="straw", shirt="Z", frame=0):
    """16x28 farmhand, facing viewer. hat: straw | cap. frame: 0/1 walk, 2 working (arm up)."""
    hatrow = {"straw": ["....kkkkkk......", "...kyyyyyyk.....", "..kkyyyyyykk....", ".kyyyyyyyyyyk...", ".kkkkkkkkkkkk..."],
              "cap":   ["....kkkkkk......", "...kQQQQQQk.....", "...kQQQQQQk.....", "..kkQQQQQQkkk...", "...kkkkkkkkkk..."]}[hat]
    body = ["....kSSSSSSk....", "....kSkSSkSk....", "....kSSSSSSk....", ".....kSSSSk.....", "......kkkk......",
            f"....kk{shirt*4}kk....", f"...kS{shirt*6}Sk...", f"...kS{shirt*6}Sk...", f"....k{shirt*6}k....", "....kFFFFFFk....",
            "....kFFFFFFk....", "....kFFkkFFk....", "....kFFk.kFFk...", "....kFFk.kFFk...", "....kXXk.kXXk...", "....kkkk.kkkk..."]
    if frame == 1: body[12] = "....kFFkkFFk...."; body[13] = "...kFFk..kFFk..."; body[14] = "...kXXk..kXXk..."; body[15] = "...kkkk..kkkk..."
    if frame == 2: body[6] = f"...kS{shirt*6}Sk..k"; body[5] = f"....kk{shirt*4}kkkSk"; body[4] = "......kkkk...kSk"; body[3] = ".....kSSSSk..kkk"
    rows = hatrow + body
    rows = [r[:16].ljust(16, ".") for r in rows]
    return G("\n".join(rows))
FARMER_ANIMS = {"walk": ([lambda: person("straw", "Z", 0), lambda: person("straw", "Z", 1)], 6, "farmer walking"),
                "work": ([lambda: person("straw", "Z", 2), lambda: person("straw", "Z", 0)], 3, "farmer working")}
MERCHANT_ANIMS = {"walk": ([lambda: person("cap", "V", 0), lambda: person("cap", "V", 1)], 6, "merchant walking"),
                  "work": ([lambda: person("cap", "V", 2), lambda: person("cap", "V", 0)], 3, "merchant trading")}
CART = G("""
..........kkkkkkkkkkkkkk....
.........kVVVVVVVVVVVVVVk...
........kVLLLLLLLLLLLLVVk...
.......kVVLLLLLLLLLLLLVVk...
......kVVVVVVVVVVVVVVVVVk...
.....kkkkkkkkkkkkkkkkkkkk...
kkkkkkk.kkk..........kkk....
.......kXXXk........kXXXk...
.......kXkXk........kXkXk...
........kkk..........kkk....
""")
CART_ANIMS = {"lay": ([lambda: CART], 1, "merchant's cart")}
ICON_COIN = G("""
..kkkk..
.kYYYYk.
kYYkkYYk
kYYkYYYk
kYYkkYYk
.kYYYYk.
..kkkk..
""")
FLOWERBED = G("""
..p.y..w..p...
.kpkkykkwkkpk.
.kGGGGGGGGGGk.
kXXXXXXXXXXXXk
kkkkkkkkkkkkkk
""")
SCARECROW = G("""
.....kkkk.....
....kyyyyk....
...kkyyyykk...
....kkkkkk....
.....kSSk.....
kkkkkkZZkkkkkk
kZZZZZZZZZZZZk
kkkkkZZZZkkkkk
.....kZZk.....
.....kZZk.....
.....kVVk.....
.....kVVk.....
.....kVVk.....
.....kkkk.....
""")
UPGRADE_ANIMS = {"flowerbed": ([lambda: FLOWERBED], 1, "upgrade 1"), "scarecrow": ([lambda: SCARECROW], 1, "upgrade 3")}

ICONS.append(ICON_COIN)
ICON_ANIMS["all"] = ([(lambda g: (lambda: g))(g) for g in ICONS], 1, "0 file,1 shell,2 web,3 db,4 shears,5 bang,6 arrow,7 question,8 heart,9 coin")

# ------------------------------------------------------------------ CROW (issue #47): the first new creature
# Seven hand-pixelled frames on one shared 22x16 canvas, facing screen-right, ground line = row 15.
# Colours are the existing blacks: k outline, f body, g top-left highlight (and the bill), n lower-right shadow,
# h the eye glint. The landed frames put their feet on row 15; fly B's downstroke wingtip reaches row 15 too,
# so every animation trims to the same 16 rows and the crow's ground point is the same in every state.
CROW_W, CROW_H = 22, 16
CROW_STAND = G("""
......................
......................
......................
..........kkkk........
.........kggffk.......
........kgfhnffkkk....
........kgffffgggk....
.......kkgffffffkk....
....kkkkgfffffffk.....
..kkgffffffffffffk....
.kgffffffffffffffk....
.kkknnfffffffffnnk....
...kkkfffffffnnnk.....
......kkkkkkkkkk......
.........k..k.........
.........kk.kk........
""")
CROW_PECK = G("""
......................
......................
......................
......................
...kk.................
..kgfk................
..kgffkkkkk...........
...kgffffffkkk........
....kfffffffffkkkkk...
....kkffffffffggfffk..
......kkffffffgfhnffk.
........kkffffgfffffk.
.........kkkkkkffffgk.
.........k..k.kkkkgnk.
.........k..k....kgk..
.........kk.kk....kk..
""")
CROW_FLY_A = G("""
....kk.kk.............
...kgfkgfk............
...kgffffk............
....kgffffk...........
....kgfffffk..........
.....kgffffk.kkkk.....
.....kgffffkkggffk....
......kffffkgfhnffkkk.
.kkkkkkffffkgffffgggk.
kgffffffffffffffffkk..
kgffffffffffffffnk....
kkkkffffffffnnnnk.....
....kkkkkkkkkkkk......
......................
......................
......................
""")
CROW_FLY_B = G("""
......................
......................
......................
..............kkkk....
.............kggffk...
.kkkkkkkkkkkkgfhnffkkk
kgffffffffffffffffgggk
kgffffffffffffffffffkk
kgffffffffffffffffnk..
kkkkffffffffffnnnnk...
....kkkkfffffffnkkk...
........kfffffnk......
.......kfffffnk.......
.......kffffnk........
......kfnkfnk.........
......kkk.kkk.........
""")
CROW_LAND = G("""
....kk.kk.............
...kgfkgfk............
...kgffffk............
....kgffffk...........
....kgfffffk..kkkk....
.....kgffffk.kggffk...
.....kgffffkkgfhnffkkk
......kffffkkgffffgggk
....kkkfffffffffffffkk
...kgfffffffffffffkk..
..kgfffffffffffffnk...
..kkkkkfffffffnnnk....
.......kkkfffnnkk.....
..........kkkkk.......
...........k.k........
..........kk.kk.......
""")
CROW_TAKEOFF = G("""
......................
......................
...kk.kk..............
..kgfkgfk.............
..kgffffk.....kkkk....
...kgffffk...kggffk...
...kgfffffk.kgfhnffkkk
....kgfffffkkgffffgggk
..kkkkffffffffffffffkk
.kgfffffffffffffffkk..
.kgffffffffffffffnk...
.kkkkffffffffffnnnk...
....kkkkkkkfffnnkk....
.......kkkkkkkkk......
........k..k..........
.......kk.kk..........
""")
CROW_HOP = G("""
......................
...........kkkk.......
..........kggffk......
.........kgfhnffkkk...
.........kgffffgggk...
........kkgffffffkk...
....kkkkkgfffffffk....
..kkgfffffffffffffk...
.kgfffffffffffffffk...
.kkknnfffffffffnnnk...
...kkkfffffffnnnnk....
......kkkkkkkkkkk.....
........kk.kk.........
......................
......................
......................
""")
for _g in (CROW_STAND, CROW_PECK, CROW_FLY_A, CROW_FLY_B, CROW_LAND, CROW_TAKEOFF, CROW_HOP):
    assert W(_g) == CROW_W and H(_g) == CROW_H, "crow frames share one canvas"
# Each transition carries its own resting state so the per-animation bottom-trim keeps the crow's
# ground point: hop's air frame sits three rows up because stand is in the same animation.
CROW_ANIMS = {
    "fly":     ([lambda: CROW_FLY_A, lambda: CROW_FLY_B], 6, "wingbeat, three a second"),
    "land":    ([lambda: CROW_LAND, lambda: CROW_STAND], 4, "touchdown then settle, play once"),
    "peck":    ([lambda: CROW_STAND, lambda: CROW_PECK], 4, "pecking at a tuft, loop two to four times"),
    "hop":     ([lambda: CROW_HOP, lambda: CROW_STAND], 6, "one hop sideways, play once"),
    "takeoff": ([lambda: CROW_TAKEOFF, lambda: CROW_FLY_A], 6, "spring then first upstroke, play once, then fly"),
}

def as_pil(anims):
    return {k: ([(lambda fn: (lambda: to_img(fn())))(fn) for fn in v[0]], v[1], v[2]) for k, v in anims.items()}

if __name__ == "__main__":
    import os
    from PIL import ImageDraw, ImageFont
    BUILD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "build"); os.makedirs(BUILD, exist_ok=True)
    S = 5
    try: f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    except OSError: f = ImageFont.load_default()   # labels only; never touches a sprite
    rows = [("sheep." + k, v) for k, v in SHEEP_ANIMS.items()] + [("lamb." + k, v) for k, v in LAMB_ANIMS.items()] + [("digital_luna." + k, v) for k, v in DL_ANIMS.items()] + [("crow." + k, v) for k, v in CROW_ANIMS.items()]
    cw, ch = 44, 44
    sheet = Image.new("RGB", (8 * cw * S, len(rows) * (ch + 4) * S), (106, 170, 90)); d = ImageDraw.Draw(sheet)
    for r, (name, (fr, fps, _)) in enumerate(rows):
        for i, fn in enumerate(fr):
            im = to_img(fn()); big = im.resize((im.width * S, im.height * S), Image.NEAREST)
            sheet.paste(big, (i * cw * S, r * (ch + 4) * S + (ch - im.height) * S), big)
        d.text((4, r * (ch + 4) * S + 2), name, fill=(30, 40, 25), font=f)
    sheet.save(os.path.join(BUILD, "check_hand_anims.png")); print("ok", sheet.size, "->", os.path.join(BUILD, "check_hand_anims.png"))

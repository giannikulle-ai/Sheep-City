#!/usr/bin/env python3
"""Compare every colour in the built sprite sheet against the declared palette.

Declared = PAL from pixel_grids.py plus the extras hand_sprites.py adds (and overrides) at import time
(the hand-pixelled characters), plus render.FIXED, the vector scenery palette that palette-snapped sheet
entries such as the grass tuft are quantised to (it is also the "palette" list in spritesheet.json).
Usage:  python3 tools/art/palette_check.py [path/to/spritesheet.png]
Default sheet: tools/art/build/spritesheet.png (run render_v3.py first).
Exit 0 = every opaque pixel is a declared colour and alpha is hard (0 or 255).
Exit 1 = an undeclared colour or a soft-alpha pixel was found; each is listed with a count.
Exit 2 = the sheet is missing.

Needs only Pillow.
"""
import os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image                 # noqa: E402
import hand_sprites as H              # noqa: E402  applies the PAL extras
from pixel_grids import PAL           # noqa: E402  same dict object H mutated
import render                         # noqa: E402  FIXED / hex2rgb, no disk access at import


def declared_palette():
    """rgb -> label: the grid characters that map to it, and/or "vector" for the scenery palette."""
    out = {}
    for ch, rgb in PAL.items():
        if rgb is not None:
            out.setdefault(tuple(rgb), []).append(ch)
    for hx in render.FIXED:
        lst = out.setdefault(render.hex2rgb(hx), [])
        if "vector" not in lst: lst.append("vector")
    return out


def main():
    sheet_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "build", "spritesheet.png")
    if not os.path.exists(sheet_path):
        print(f"palette_check: no sheet at {sheet_path}; run render_v3.py first"); sys.exit(2)
    declared = declared_palette()
    im = Image.open(sheet_path).convert("RGBA")
    opaque, soft = Counter(), Counter()
    data = im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()
    for r, g, b, a in data:
        if a == 255:
            opaque[(r, g, b)] += 1
        elif a != 0:
            soft[(r, g, b, a)] += 1

    undeclared = {c: n for c, n in opaque.items() if c not in declared}
    used = [c for c in opaque if c in declared]
    unused = [c for c in declared if c not in opaque]

    def hx(c): return "#%02x%02x%02x" % c[:3]
    n_hand = sum(1 for v in declared.values() if any(k != "vector" for k in v)); n_vec = sum(1 for v in declared.values() if "vector" in v)
    print(f"sheet {os.path.relpath(sheet_path)} {im.size[0]}x{im.size[1]}: {len(opaque)} opaque colours; declared {len(declared)} ({n_hand} hand PAL, {n_vec} vector, overlapping)")
    for c in sorted(used, key=lambda c: -opaque[c]):
        print(f"  ok   {hx(c)} {str(c):<16} {opaque[c]:>6} px  {' '.join(declared[c])}")
    for c in unused:
        print(f"  --   {hx(c)} {str(c):<16}      0 px  {' '.join(declared[c])}  (declared, not on sheet)")
    for c, n in sorted(undeclared.items(), key=lambda kv: -kv[1]):
        print(f"  NEW  {hx(c)} {str(c):<16} {n:>6} px  UNDECLARED")
    for c, n in sorted(soft.items(), key=lambda kv: -kv[1])[:20]:
        print(f"  SOFT {hx(c)} alpha={c[3]:<3} {n:>6} px  (sprites must have hard alpha)")

    bad = len(undeclared) + len(soft)
    print(f"palette_check: {'FAIL' if bad else 'ok'} — {len(undeclared)} undeclared colours, {len(soft)} soft-alpha colours, {len(unused)} declared colours unused")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

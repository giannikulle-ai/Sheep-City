#!/usr/bin/env python3
"""Build every frame of every *_ANIMS table in hand_sprites and fail loudly if any frame cannot be built.

Run from anywhere:  python3 tools/art/build_all_frames.py
Exit code 0 = every frame built; 1 = at least one frame failed (each failure is printed with its table, animation, index and error).

Needs only Pillow. It does not touch the disk except to import the pipeline; nothing is written.
"""
import os, sys, traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import hand_sprites as H           # noqa: E402  (sys.path first)
from pixel_grids import PAL        # noqa: E402
to_img = H.to_img                  # the grid-aware to_img that as_pil() uses (pixel_grids.to_img takes a string)


def anim_tables(mod):
    """Every module-level dict whose name ends in _ANIMS, in definition order."""
    return [(name, getattr(mod, name)) for name in vars(mod) if name.endswith("_ANIMS") and isinstance(getattr(mod, name), dict)]


def check_grid(g):
    """A frame is a list of equal-length rows of single palette characters."""
    if not isinstance(g, list) or not g or not all(isinstance(r, list) for r in g):
        raise TypeError(f"frame is not a grid (got {type(g).__name__})")
    widths = {len(r) for r in g}
    if len(widths) != 1:
        raise ValueError(f"ragged grid, row widths {sorted(widths)}")
    unknown = sorted({ch for r in g for ch in r if ch not in PAL})
    if unknown:
        raise KeyError(f"characters not in PAL: {unknown}")
    if not any(ch != "." for r in g for ch in r):
        raise ValueError("frame is empty")


def main():
    tables = anim_tables(H)
    registered = set()
    try:
        import farm_v3 as V
        for spec in V.ANIMS.values():
            registered.add(id(spec))
    except Exception as e:                     # farm_v3 only needs farm_vectors; report but do not fail on it
        print(f"note: could not import farm_v3 to cross-check registration: {e!r}")

    failures, n_anims, n_frames = [], 0, 0
    for tname, table in tables:
        for aname, entry in table.items():
            try:
                frames, fps, note = entry
            except Exception as e:
                failures.append((tname, aname, None, f"entry is not (frames, fps, note): {e!r}")); continue
            n_anims += 1
            if not frames:
                failures.append((tname, aname, None, "no frames")); continue
            for i, fn in enumerate(frames):
                try:
                    g = fn()
                    check_grid(g)
                    im = to_img(g)                       # the same call render_v3 makes via as_pil()
                    assert im.getbbox() is not None, "rendered frame has no opaque pixels"
                    n_frames += 1
                except Exception as e:
                    failures.append((tname, aname, i, f"{type(e).__name__}: {e}"))
            if fps <= 0:
                failures.append((tname, aname, None, f"fps must be > 0, got {fps!r}"))
        print(f"  {tname:<16} {len(table):>3} anims")

    print()
    for tname, aname, i, err in failures:
        where = f"{tname}[{aname!r}]" + (f" frame {i}" if i is not None else "")
        print(f"FAIL {where}: {err}")
    status = "FAIL" if failures else "ok"
    print(f"build_all_frames: {status} — {len(tables)} tables, {n_anims} animations, {n_frames} frames built, {len(failures)} failures")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()

import os, json, base64, io, re
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
import farm_v3 as V
from render import to_palette, PAL, hex2rgb

OUT = "/home/claude/v3out"
for d in ["", "/gifs", "/frames"]:
    os.makedirs(OUT + d, exist_ok=True)

def render(pg, svg, css_w, crisp=True):
    w = float(re.search(r'width="([\d.]+)"', svg).group(1)); h = float(re.search(r'height="([\d.]+)"', svg).group(1))
    svg = re.sub(r'width="[\d.]+" height="[\d.]+"', f'width="{css_w}" height="{round(h*css_w/w)}"', svg, count=1)
    style = "shape-rendering:crispEdges;text-rendering:optimizeSpeed;" if crisp else ""
    pg.set_content(f'<html><body style="margin:0;background:transparent"><style>svg *{{{style}}}</style>{svg}</body></html>')
    el = pg.query_selector("svg"); box = el.bounding_box()
    pg.set_viewport_size({"width": max(1, int(box["width"])), "height": max(1, int(box["height"]))})
    return Image.open(io.BytesIO(el.screenshot(omit_background=True))).convert("RGBA")

GRASS = [hex2rgb(V.GRASS_A), hex2rgb(V.GRASS_B)]
def grass(w, h, up):
    im = Image.new("RGBA", (w * up, h * up), (*GRASS[0], 255)); px = im.load()
    for y in range(h):
        for x in range(w):
            if (x // 3 + y // 3) % 2:
                for j in range(up):
                    for i in range(up):
                        px[x * up + i, y * up + j] = (*GRASS[1], 255)
    return im

if __name__ == "__main__":
    UP = 1
    sheet_rows = []   # (sprite, anim, frames(list of small RGBA), fps, meaning)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(device_scale_factor=1)
        for sName, spec in V.ANIMS.items():
            for aName, (builders, fps, meaning) in spec["anims"].items():
                if spec.get("pil"):
                    frames = [fn() for fn in builders]                 # hand-pixelled, already clean
                    # trim empty rows below the animation's lowest content so feet sit on the cell floor
                    def content_bottom(im):
                        alpha = im.split()[3]
                        bbox = alpha.getbbox()
                        return bbox[3] if bbox else im.height
                    bot = max(content_bottom(f) for f in frames)
                    frames = [f.crop((0, 0, f.width, bot)) for f in frames]
                else:
                    frames = [to_palette(render(pg, V.frame_svg(fn(), spec["vb"]), spec["px"]), 1) for fn in builders]
                sheet_rows.append((sName, aName, frames, fps, meaning))
                print("rendered", sName, aName, frames[0].size)
        BGW = 640
        bg_day = to_palette(render(pg, V.background(), BGW), 1)
        lights = render(pg, V.background(lights_only=True), BGW)
        b.close()

    # ---- day / dusk / night / dawn variants (palette-snapped tints + window glow) ----
    from PIL import ImageFilter
    def tint(im, f, colors=48):
        r, g, b_, a = im.split()
        r = r.point(lambda v: min(255, int(v * f[0]))); g = g.point(lambda v: min(255, int(v * f[1]))); b_ = b_.point(lambda v: min(255, int(v * f[2])))
        rgb = Image.merge("RGB", (r, g, b_)).quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        return Image.merge("RGBA", (*rgb.split(), a))
    def glow(im, strength):
        base = im.copy()
        la = lights.split()[3]
        halo = la.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(3)).point(lambda v: int(v * .45 * strength))
        halo_img = Image.new("RGBA", im.size, (255, 200, 90, 0)); halo_img.putalpha(halo)
        base.alpha_composite(halo_img)
        lit = lights.copy(); lit.putalpha(la.point(lambda v: int(v * strength)))
        base.alpha_composite(lit)
        return base
    PHASES = {"day": (1, 1, 1), "dusk": (1.02, .78, .58), "night": (.40, .48, .80), "dawn": (.96, .80, .86)}
    def snowify(im):
        """Greens become snow; everything else lightens a touch. Quantized to keep it pixel-clean."""
        px = im.convert("RGB").load(); out = im.copy(); po = out.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r_, g_, b_ = px[x, y]
                a = out.getpixel((x, y))[3] if out.mode == "RGBA" else 255
                if g_ > r_ + 8 and g_ > b_ + 8:                       # grass / canopy
                    lum = (r_ + g_ + b_) / 765
                    t = .82
                    nr = int(r_ * (1 - t) + (232 + lum * 20) * t)
                    ng = int(g_ * (1 - t) + (238 + lum * 14) * t)
                    nb = int(b_ * (1 - t) + (246 + lum * 8) * t)
                    po[x, y] = (min(nr, 250), min(ng, 252), min(nb, 255), a)
                else:
                    po[x, y] = (min(255, int(r_ * 1.04)), min(255, int(g_ * 1.04)), min(255, int(b_ * 1.05)), a)
        rgb = out.convert("RGB").quantize(colors=40, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        return Image.merge("RGBA", (*rgb.split(), out.split()[3]))
    # mask of "outside the field" pixels: becomes sky at night (deeper blue, stars, moon)
    import random
    from PIL import ImageDraw as IDraw
    fw, fh = bg_day.size; F = V.FIELD; k = fw / F["width"]
    diamond = [(F["top"][0]*k, F["top"][1]*k), (F["right"][0]*k, (F["right"][1]+20)*k), (F["bottom"][0]*k, (F["bottom"][1]+20)*k), (F["left"][0]*k, (F["left"][1]+20)*k)]
    inside = Image.new("L", bg_day.size, 0); IDraw.Draw(inside).polygon(diamond, fill=255)
    inside = inside.filter(ImageFilter.MaxFilter(9))  # keep fences/trees near the edge un-skied
    def sky(im, depth, n_stars, moon):
        rnd = random.Random(7)
        r, g, b_, a = im.split()
        sk = Image.merge("RGBA", (r.point(lambda v: int(v * depth[0])), g.point(lambda v: int(v * depth[1])), b_.point(lambda v: int(v * depth[2])), a))
        out = Image.composite(im, sk, inside)
        px = out.load(); ins = inside.load()
        for _ in range(n_stars):
            x, y = rnd.randrange(fw), rnd.randrange(fh)
            if ins[x, y] == 0 and rnd.random() < .85:
                c = (235, 240, 255, 255) if rnd.random() < .7 else (255, 230, 160, 255)
                px[x, y] = c
                if rnd.random() < .25 and x+1 < fw and y+1 < fh: px[x+1, y] = c; px[x, y+1] = c; px[x-1, y] = c; px[x, y-1] = c
        if moon:
            d = IDraw.Draw(out); mx, my = 58, 40
            d.ellipse([mx-13, my-13, mx+13, my+13], fill=(246, 240, 200, 255))
            d.ellipse([mx-6, my-17, mx+18, my+7], fill=(30, 34, 70, 255)) if False else None
            d.ellipse([mx+2, my-15, mx+20, my+3], fill=px[mx+24, my-24][:3] + (255,))  # crescent bite in sky colour
            d.point([(mx-6, my+2), (mx-3, my-6)], fill=(226, 218, 170, 255))
        return out
    bgs = {}
    bases = {"": bg_day, "snow_": snowify(bg_day)}
    for prefix, base in bases.items():
        for name, f in PHASES.items():
            im = tint(base, f) if name != "day" else base
            if name in ("dusk", "night", "dawn"): im = glow(im, {"dusk": .6, "night": 1.0, "dawn": .4}[name])
            if name == "night": im = sky(im, (.5, .53, .9) if prefix else (.45, .5, .9), 260, True)
            elif name == "dusk": im = sky(im, (.92, .85, .97) if prefix else (.9, .8, .95), 60, False)
            elif name == "dawn": im = sky(im, (.96, .93, 1.0) if prefix else (.95, .9, 1.0), 40, False)
            bgs[prefix + name] = im; im.save(f"{OUT}/background_{prefix}{name}.png")
    bg_small = bg_day

    # ---- sprite sheet: one row per animation, frames left->right, uniform cell per sprite ----
    meta = {"palette": [f"#{r:02x}{g:02x}{b_:02x}" for r, g, b_ in PAL], "sprites": {}}
    cell = {s: max(max(f.width for _, _, fr, _, _ in sheet_rows for f in fr if _ == s) if False else 0, 0) for s in V.ANIMS}
    for s in V.ANIMS:
        fs = [f for sn, _, fr, _, _ in sheet_rows if sn == s for f in fr]
        cell[s] = (max(f.width for f in fs), max(f.height for f in fs))
    W = max(cell[s][0] * max(len(fr) for sn, _, fr, _, _ in sheet_rows if sn == s) for s in V.ANIMS)
    H = sum(cell[sn][1] for sn, _, _, _, _ in sheet_rows)
    sheet = Image.new("RGBA", (W, H), (0, 0, 0, 0)); y = 0
    for sName, aName, frames, fps, meaning in sheet_rows:
        cw, ch = cell[sName]
        meta["sprites"].setdefault(sName, {"w": cw, "h": ch, "anims": {}})
        meta["sprites"][sName]["anims"][aName] = {"y": y, "frames": len(frames), "fps": fps, "meaning": meaning}
        for i, f in enumerate(frames):
            sheet.alpha_composite(f, (i * cw + (cw - f.width) // 2, y + (ch - f.height)))
        y += ch
    sheet.save(f"{OUT}/spritesheet.png")
    sheet.resize((W * 4, H * 4), Image.NEAREST).save(f"{OUT}/spritesheet_4x.png")
    json.dump(meta, open(f"{OUT}/spritesheet.json", "w"), indent=1)

    # ---- GIFs (4x on grass) + a showcase ----
    for sName, aName, frames, fps, meaning in sheet_rows:
        cw, ch = cell[sName]; imgs = []
        for f in frames:
            g = grass(cw + 6, ch + 6, 4); g.alpha_composite(f.resize((f.width * 4, f.height * 4), Image.NEAREST), (3 * 4 + (cw - f.width) * 2, 3 * 4 + (ch - f.height) * 4))
            imgs.append(g.convert("P", palette=Image.ADAPTIVE, colors=64))
        imgs[0].save(f"{OUT}/gifs/{sName}_{aName}.gif", save_all=True, append_images=imgs[1:], duration=int(1000 / fps), loop=0, disposal=2)

    cols = 4; cw_s, ch_s = 76, 86; rows = (len(sheet_rows) + cols - 1) // cols; ticks = 24; SC = 3
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    show = []
    for t in range(ticks):
        g = grass(cols * cw_s, rows * ch_s, SC); d = ImageDraw.Draw(g)
        for idx, (sName, aName, frames, fps, meaning) in enumerate(sheet_rows):
            f = frames[int(t * fps / 12) % len(frames)]
            cx = (idx % cols) * cw_s * SC; cy = (idx // cols) * ch_s * SC
            g.alpha_composite(f.resize((f.width * SC, f.height * SC), Image.NEAREST), (cx + (cw_s * SC - f.width * SC) // 2, cy + (ch_s - 14) * SC - f.height * SC))
            d.text((cx + 6, cy + (ch_s - 13) * SC), f"{sName}.{aName}", fill=(30, 40, 25), font=font)
        show.append(g.convert("P", palette=Image.ADAPTIVE, colors=64))
    show[0].save(f"{OUT}/showcase.gif", save_all=True, append_images=show[1:], duration=int(1000 / 12), loop=0, disposal=2)

    # ---- background + demo ----
    bg_small.save(f"{OUT}/background.png")
    def b64(im):
        buf = io.BytesIO(); im.save(buf, "PNG"); return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    for tname, oname in [("demo_template.html", "demo.html"), ("sim_template.html", "farm_sim.html")]:
        import os.path
        if not os.path.exists(f"/home/claude/v2/{tname}"): continue
        demo = open(f"/home/claude/v2/{tname}").read()
        demo = demo.replace("__META__", json.dumps(meta)).replace("__SHEET__", b64(sheet))
        for name, im in bgs.items(): demo = demo.replace(f"__BG_{name.upper()}__", b64(im))
        demo = demo.replace("__PHASES__", json.dumps(PHASES))
        open(f"{OUT}/{oname}", "w").write(demo)
    demo = open("/home/claude/v2/demo_template.html").read()
    demo = demo.replace("__META__", json.dumps(meta)).replace("__SHEET__", b64(sheet))
    for name, im in bgs.items(): demo = demo.replace(f"__BG_{name.upper()}__", b64(im))
    demo = demo.replace("__PHASES__", json.dumps(PHASES))
    open(f"{OUT}/demo.html", "w").write(demo)
    print("sheet", sheet.size, "bg", bg_small.size)

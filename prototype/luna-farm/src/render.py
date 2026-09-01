import os, sys
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

SVG = "/home/claude/v2/svg"
OUT = "/home/claude/v2/out"
os.makedirs(f"{OUT}/smooth", exist_ok=True)
os.makedirs(f"{OUT}/pixel", exist_ok=True)

def render_svg(pg, path, out_png, css_width=None, crisp=False):
    """Render an SVG. css_width overrides the display width (for low-res pixel passes)."""
    svg = open(path).read()
    style = "shape-rendering:crispEdges;text-rendering:optimizeSpeed;" if crisp else ""
    if css_width:
        import re
        w = float(re.search(r'width="([\d.]+)"', svg).group(1)); h = float(re.search(r'height="([\d.]+)"', svg).group(1))
        svg = re.sub(r'width="[\d.]+" height="[\d.]+"', f'width="{css_width}" height="{round(h*css_width/w)}"', svg, count=1)
    pg.set_content(f'<html><body style="margin:0;background:transparent"><style>svg *{{{style}}}</style>{svg}</body></html>')
    el = pg.query_selector("svg")
    box = el.bounding_box()
    pg.set_viewport_size({"width": max(1,int(box["width"])), "height": max(1,int(box["height"]))})
    el.screenshot(path=out_png, omit_background=True)
    return out_png

# fixed palette built from the vector source colours + a few tints
import farm_vectors as V
FIXED = [V.INK, V.WOOL, V.WOOL_SH, V.WOOL_HI, V.FACE, V.FACE_HI, V.PINK, V.LUNA_D, V.LUNA_M, V.LUNA_T, V.LUNA_W, V.LUNA_C,
         V.AMBER, V.RED, V.BUCKET, V.BUCKET_D, V.BUCKET_L, V.BARN_R, V.BARN_RD, V.BARN_ROOF, V.BARN_ROOF_D, V.BARN_TRIM,
         V.FENCE, V.FENCE_SH, V.GRASS_A, V.GRASS_B, V.GRASS_EDGE, V.RABBIT, V.RABBIT_D, "#ffffff", "#d84034", "#e2b04a", "#6f8fa6",
         "#5e9a4d", "#7d5230", "#3a7bd5", "#e0a52c", "#7c4dbf", "#2fa07a", "#e0602c", "#c2b0a0", "#8a7565", "#3f2a20", "#5a7a48"]
def hex2rgb(h): return tuple(int(h[i:i+2],16) for i in (1,3,5))
PAL = [hex2rgb(h) for h in FIXED]

def to_palette(img, upscale):
    """Snap every opaque pixel to the nearest fixed-palette colour, then nearest-upscale."""
    img = img.convert("RGBA")
    pimg = Image.new("P", (1,1)); flat = sum(PAL, ())
    pimg.putpalette(flat + (0,0,0)*(256-len(PAL)))
    alpha = img.split()[3].point(lambda a: 255 if a > 120 else 0)
    rgb = img.convert("RGB").quantize(palette=pimg, dither=Image.NONE).convert("RGB")
    out = Image.merge("RGBA", (*rgb.split(), alpha))
    return out.resize((out.width*upscale, out.height*upscale), Image.NEAREST)

def pixelate(src_png, out_png, target_w, colors=40, upscale=4):
    """Downscale with box filter, quantize, nearest-upscale. Preserves alpha."""
    im = Image.open(src_png).convert("RGBA")
    w, h = im.size
    tw = target_w
    th = round(h * tw / w)
    small = im.resize((tw, th), Image.BOX)
    # quantize RGB only, keep alpha as hard mask
    alpha = small.split()[3].point(lambda a: 255 if a > 110 else 0)
    rgb = small.convert("RGB").quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
    px = Image.merge("RGBA", (*rgb.split(), alpha))
    big = px.resize((tw * upscale, th * upscale), Image.NEAREST)
    big.save(out_png)
    return big

def label(im, text):
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
    except Exception:
        f = ImageFont.load_default()
    d.rectangle([0, 0, im.width, 44], fill=(43, 29, 23, 255))
    d.text((16, 8), text, fill=(248, 245, 238, 255), font=f)
    return im

if __name__ == "__main__":
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(device_scale_factor=2)
        for name in os.listdir(SVG):
            if name.endswith(".svg"):
                render_svg(pg, f"{SVG}/{name}", f"{OUT}/smooth/{name[:-4]}.png")
        # pixel pass: crisp low-res render (scene 440px wide ≈ sheep 45px, Luna 60px), then palette snap
        pg = b.new_page(device_scale_factor=1)
        os.makedirs(f"{OUT}/pixel_raw", exist_ok=True)
        for name in os.listdir(SVG):
            if name.endswith(".svg"):
                w = 440 if name == "scene.svg" else (88 if name == "barn.svg" else 44)
                render_svg(pg, f"{SVG}/{name}", f"{OUT}/pixel_raw/{name[:-4]}.png", css_width=w, crisp=True)
        b.close()

    for name in os.listdir(f"{OUT}/pixel_raw"):
        up = 3 if name == "scene.png" else 6
        to_palette(Image.open(f"{OUT}/pixel_raw/{name}"), up).save(f"{OUT}/pixel/{name}")
    scene_px = Image.open(f"{OUT}/pixel/scene.png")

    # side-by-side comparison (stacked for phone)
    smooth = Image.open(f"{OUT}/smooth/scene.png").convert("RGBA")
    smooth = smooth.resize((1320, round(smooth.height * 1320 / smooth.width)), Image.LANCZOS)
    px = scene_px.resize((1320, round(scene_px.height * 1320 / scene_px.width)), Image.NEAREST)
    bg = (94, 154, 77, 255)
    a = Image.new("RGBA", smooth.size, bg); a.alpha_composite(smooth); a = label(a, "A  smooth cartoon")
    c = Image.new("RGBA", px.size, bg); c.alpha_composite(px); c = label(c, "B  chunky pixel (same source)")
    comp = Image.new("RGBA", (1320, a.height + c.height + 12), (43, 29, 23, 255))
    comp.paste(a, (0, 0)); comp.paste(c, (0, a.height + 12))
    comp.convert("RGB").save(f"{OUT}/comparison.png", quality=92)
    print("done")

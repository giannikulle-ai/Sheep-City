"""
Agent Farm v2 — vector source. Each asset is an SVG <g> in a 100x100-ish local
space, 3/4 top-down view, facing screen-right. Scene composes them on an
isometric grass diamond. render.py turns this into smooth and pixel finishes.
"""

# ---------- palette ----------
INK = "#2b1d17"
WOOL, WOOL_SH, WOOL_HI = "#f6f2e8", "#d9d2c3", "#ffffff"
FACE, FACE_HI = "#3a3a40", "#5c5c64"
PINK = "#e9a2b3"
LUNA_D, LUNA_M, LUNA_T, LUNA_W, LUNA_C = "#4e3428", "#6e4b3a", "#b39473", "#f8f5ee", "#dcd3c2"
AMBER = "#d68a2e"
RED = "#d33a2f"
BUCKET, BUCKET_D, BUCKET_L = "#8f949c", "#5f636b", "#b9bec6"
BARN_R, BARN_RD, BARN_ROOF, BARN_ROOF_D, BARN_TRIM = "#c8352a", "#9c2820", "#5a3126", "#40221a", "#f4efe6"
FENCE, FENCE_SH = "#f4efe6", "#c9c1b0"
GRASS_A, GRASS_B, GRASS_EDGE = "#6fb35c", "#65a854", "#4f8a42"
RABBIT, RABBIT_D = "#a89484", "#7c6a5b"

STROKE = f'stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'

def defs():
    return f"""
<defs>
  <radialGradient id="woolG" cx="40%" cy="30%" r="75%">
    <stop offset="0" stop-color="{WOOL_HI}"/><stop offset=".55" stop-color="{WOOL}"/><stop offset="1" stop-color="{WOOL_SH}"/>
  </radialGradient>
  <radialGradient id="faceG" cx="40%" cy="30%" r="80%">
    <stop offset="0" stop-color="{FACE_HI}"/><stop offset="1" stop-color="{FACE}"/>
  </radialGradient>
  <radialGradient id="lunaW" cx="40%" cy="30%" r="80%">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="{LUNA_W}"/><stop offset="1" stop-color="{LUNA_C}"/>
  </radialGradient>
  <radialGradient id="lunaD" cx="35%" cy="25%" r="85%">
    <stop offset="0" stop-color="{LUNA_M}"/><stop offset="1" stop-color="{LUNA_D}"/>
  </radialGradient>
  <linearGradient id="bucketG" x1="0" x2="1">
    <stop offset="0" stop-color="{BUCKET_L}"/><stop offset=".5" stop-color="{BUCKET}"/><stop offset="1" stop-color="{BUCKET_D}"/>
  </linearGradient>
  <linearGradient id="barnFront" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#d84034"/><stop offset="1" stop-color="{BARN_R}"/>
  </linearGradient>
  <radialGradient id="rabbitG" cx="40%" cy="30%" r="80%">
    <stop offset="0" stop-color="#c2b0a0"/><stop offset="1" stop-color="{RABBIT}"/>
  </radialGradient>
  <pattern id="grassP" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="skewX(-30) scale(1,.6)">
    <rect width="22" height="22" fill="{GRASS_A}"/>
    <rect width="11" height="11" fill="{GRASS_B}"/><rect x="11" y="11" width="11" height="11" fill="{GRASS_B}"/>
  </pattern>
</defs>"""

# ---------- characters ----------

def sheep(variant="stand", scale=1.0, id_=None):
    """3/4 view sheep facing screen-right. variants: stand, graze, rest, cast, bucket."""
    legs_back = f'<rect x="30" y="66" width="9" height="16" rx="4" fill="{FACE}" {STROKE}/><rect x="58" y="66" width="9" height="16" rx="4" fill="{FACE}" {STROKE}/>'
    legs_front = f'<rect x="24" y="72" width="9" height="16" rx="4" fill="url(#faceG)" {STROKE}/><rect x="52" y="72" width="9" height="16" rx="4" fill="url(#faceG)" {STROKE}/>'
    body = f"""
    <g id="wool">
      <ellipse cx="46" cy="55" rx="32" ry="24" fill="url(#woolG)" {STROKE}/>
      <circle cx="20" cy="50" r="10" fill="url(#woolG)" {STROKE}/>
      <circle cx="28" cy="36" r="10" fill="url(#woolG)" {STROKE}/>
      <circle cx="46" cy="30" r="11" fill="url(#woolG)" {STROKE}/>
      <circle cx="64" cy="36" r="10" fill="url(#woolG)" {STROKE}/>
      <circle cx="74" cy="52" r="9" fill="url(#woolG)" {STROKE}/>
      <ellipse cx="46" cy="56" rx="29" ry="20" fill="url(#woolG)"/>
      <circle cx="21" cy="50" r="8" fill="url(#woolG)"/><circle cx="28" cy="37" r="8" fill="url(#woolG)"/>
      <circle cx="46" cy="31" r="9" fill="url(#woolG)"/><circle cx="64" cy="37" r="8" fill="url(#woolG)"/>
      <circle cx="73" cy="52" r="7" fill="url(#woolG)"/>
    </g>"""
    def head(dx=0, dy=0, rot=0, eyes=True, mouth_open=False, down=False):
        m = "M77 78 q6 3 12 0" if not mouth_open else "M80 76 a5 4 0 1 0 8 0z"
        return f"""
    <g transform="translate({dx},{dy}) rotate({rot} 82 62)">
      <ellipse cx="67" cy="54" rx="7" ry="4" transform="rotate(-25 67 54)" fill="{FACE}" {STROKE}/>
      <ellipse cx="66" cy="54" rx="4" ry="2" transform="rotate(-25 66 54)" fill="{PINK}"/>
      <ellipse cx="98" cy="58" rx="7" ry="4" transform="rotate(20 98 58)" fill="{FACE}" {STROKE}/>
      <ellipse cx="98" cy="58" rx="4" ry="2" transform="rotate(20 98 58)" fill="{PINK}"/>
      <ellipse cx="82" cy="64" rx="20" ry="18" fill="url(#faceG)" {STROKE}/>
      <ellipse cx="82" cy="72" rx="12" ry="9" fill="{FACE_HI}" opacity=".35"/>
      <circle cx="82" cy="46" r="10" fill="url(#woolG)" {STROKE}/>
      {"" if not eyes else f'<ellipse cx="74" cy="62" rx="5.5" ry="6" fill="#fff" {STROKE}/><ellipse cx="90" cy="62" rx="5.5" ry="6" fill="#fff" {STROKE}/><circle cx="75" cy="63" r="2.6" fill="{INK}"/><circle cx="91" cy="63" r="2.6" fill="{INK}"/>'}
      {"" if eyes else f'<path d="M71 62 q4 3 8 0 M86 62 q4 3 8 0" fill="none" {STROKE}/>'}
      <path d="{m}" fill="{PINK if mouth_open else 'none'}" {STROKE}/>
    </g>"""
    if variant == "stand":
        inner = legs_back + body + legs_front + head()
    elif variant == "graze":
        inner = legs_back + body + legs_front + head(dx=-4, dy=18, rot=25)
    elif variant == "rest":
        inner = f'<g transform="translate(0,14)">{body}</g>' + f'<ellipse cx="46" cy="86" rx="34" ry="6" fill="{WOOL_SH}" {STROKE}/>' + head(dy=10, eyes=False)
    elif variant == "cast":
        legs_up = "".join(f'<rect x="{x}" y="{y}" width="9" height="18" rx="4" fill="url(#faceG)" {STROKE} transform="rotate({r} {x+4} {y+18})"/>' for x, y, r in [(30, 22, -15), (40, 18, -5), (52, 18, 8), (62, 22, 18)])
        inner = legs_up + f'<g transform="translate(0,14)">{body}</g>' + f'<ellipse cx="46" cy="70" rx="22" ry="13" fill="{WOOL_SH}" opacity=".7"/>' + head(dx=-6, dy=18, rot=70)
    elif variant == "bucket":
        bucket = f"""
    <g transform="translate(64,42)">
      <path d="M2 4 L34 4 L29 42 L7 42 Z" fill="url(#bucketG)" {STROKE}/>
      <ellipse cx="18" cy="4" rx="16" ry="5" fill="{BUCKET_L}" {STROKE}/>
      <path d="M4 12 L32 12" fill="none" stroke="{BUCKET_D}" stroke-width="2"/>
      <path d="M2 6 q16 -20 32 0" fill="none" {STROKE}/>
    </g>"""
        inner = legs_back + body + legs_front + head(eyes=False).replace(f'<circle cx="82" cy="46" r="10" fill="url(#woolG)" {STROKE}/>', "") + bucket
    else:
        raise ValueError(variant)
    return f'<g transform="scale({scale})">{inner}</g>'

def lamb():
    return f'<g transform="scale(.55)">{sheep("stand")}</g>'

def luna():
    """Luna sitting, 3/4 view, facing screen-right, looking at camera."""
    return f"""
    <g>
      <!-- tail -->
      <path d="M14 78 q-12 -14 2 -24 q6 8 4 20z" fill="url(#lunaW)" {STROKE}/>
      <!-- haunch + body -->
      <ellipse cx="42" cy="78" rx="30" ry="18" fill="url(#lunaW)" {STROKE}/>
      <path d="M18 74 q6 -34 40 -38 q14 0 20 10 l-4 34 q-30 6 -56 -6z" fill="url(#lunaD)" {STROKE}/>
      <!-- chest -->
      <ellipse cx="66" cy="70" rx="16" ry="22" fill="url(#lunaW)" {STROKE}/>
      <!-- front legs -->
      <rect x="54" y="74" width="11" height="24" rx="5" fill="url(#lunaW)" {STROKE}/>
      <rect x="70" y="74" width="11" height="24" rx="5" fill="url(#lunaW)" {STROKE}/>
      <!-- collar -->
      <path d="M50 52 q20 10 36 -2" fill="none" stroke="{RED}" stroke-width="5"/>
      <path d="M50 52 q20 10 36 -2" fill="none" stroke="{INK}" stroke-width="1.5" opacity=".5"/>
      <!-- head -->
      <g transform="translate(0,-4)">
        <!-- ears -->
        <path d="M44 34 q-16 4 -14 30 q8 4 16 -2z" fill="url(#lunaD)" {STROKE}/>
        <path d="M100 36 q14 8 8 30 q-8 2 -14 -4z" fill="url(#lunaD)" {STROKE}/>
        <!-- head mass -->
        <ellipse cx="72" cy="40" rx="30" ry="26" fill="url(#lunaD)" {STROKE}/>
        <!-- muzzle -->
        <ellipse cx="76" cy="54" rx="15" ry="11" fill="{LUNA_T}" {STROKE}/>
        <ellipse cx="76" cy="58" rx="5" ry="3.5" fill="{INK}"/>
        <!-- tongue -->
        <path d="M74 64 q2 8 6 0z" fill="{PINK}" {STROKE}/>
        <!-- eyes under fringe -->
        <ellipse cx="60" cy="44" rx="5" ry="5.5" fill="#fff" {STROKE}/>
        <ellipse cx="86" cy="44" rx="5" ry="5.5" fill="#fff" {STROKE}/>
        <circle cx="61" cy="45" r="3" fill="{AMBER}"/><circle cx="87" cy="45" r="3" fill="{AMBER}"/>
        <circle cx="61" cy="45" r="1.6" fill="{INK}"/><circle cx="87" cy="45" r="1.6" fill="{INK}"/>
        <!-- fringe -->
        <path d="M44 34 q10 -18 30 -14 q18 -2 28 12 q-6 -4 -12 2 q-6 -8 -14 -2 q-8 -6 -14 2 q-8 -8 -18 0z" fill="{LUNA_M}" {STROKE}/>
      </g>
    </g>"""

def rabbit():
    return f"""
    <g transform="scale(.6)">
      <ellipse cx="30" cy="40" rx="7" ry="20" transform="rotate(-15 30 40)" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="30" cy="42" rx="3.5" ry="14" transform="rotate(-15 30 42)" fill="{PINK}"/>
      <ellipse cx="50" cy="40" rx="7" ry="20" transform="rotate(10 50 40)" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="50" cy="42" rx="3.5" ry="14" transform="rotate(10 50 42)" fill="{PINK}"/>
      <ellipse cx="44" cy="78" rx="30" ry="20" fill="url(#rabbitG)" {STROKE}/>
      <circle cx="14" cy="76" r="8" fill="#fff" {STROKE}/>
      <circle cx="42" cy="66" r="18" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="36" cy="66" rx="3.5" ry="4" fill="#fff" {STROKE}/><ellipse cx="50" cy="66" rx="3.5" ry="4" fill="#fff" {STROKE}/>
      <circle cx="37" cy="67" r="1.8" fill="{INK}"/><circle cx="51" cy="67" r="1.8" fill="{INK}"/>
      <ellipse cx="43" cy="75" rx="3" ry="2" fill="{PINK}" {STROKE}/>
      <rect x="30" y="90" width="12" height="9" rx="4" fill="url(#rabbitG)" {STROKE}/><rect x="50" y="90" width="12" height="9" rx="4" fill="url(#rabbitG)" {STROKE}/>
    </g>"""

# ---------- set pieces ----------

def barn():
    """Isometric red barn, ~220 wide."""
    return f"""
    <g>
      <!-- side wall (right) -->
      <path d="M120 60 L200 100 L200 200 L120 240 Z" fill="{BARN_RD}" {STROKE}/>
      <!-- front wall (left) -->
      <path d="M0 100 L120 60 L120 240 L0 200 Z" fill="url(#barnFront)" {STROKE}/>
      <!-- gambrel roof, front slab -->
      <path d="M-10 104 L60 0 L130 56 L120 60 L0 100 Z" fill="{BARN_ROOF}" {STROKE}/>
      <path d="M60 0 L130 56 L210 96 L140 40 Z" fill="{BARN_ROOF_D}" {STROKE}/>
      <path d="M-10 104 L60 0" fill="none" stroke="{BARN_TRIM}" stroke-width="4"/>
      <path d="M-10 104 L60 0 L130 56" fill="none" {STROKE}/>
      <!-- loft window with hay -->
      <path d="M46 62 L74 50 L74 76 L46 88 Z" fill="{INK}"/>
      <path d="M50 70 q10 -8 20 -4 l0 10 q-10 -2 -20 4z" fill="#e2b04a"/>
      <!-- big door with X -->
      <path d="M36 130 L84 114 L84 200 L36 212 Z" fill="{BARN_TRIM}" {STROKE}/>
      <path d="M40 134 L80 118 L80 196 L40 208 Z" fill="{BARN_R}"/>
      <path d="M40 134 L80 196 M80 118 L40 208 M40 171 L80 157" fill="none" stroke="{BARN_TRIM}" stroke-width="4"/>
      <!-- side door -->
      <path d="M140 116 L172 132 L172 192 L140 180 Z" fill="{BARN_TRIM}" {STROKE}/>
      <path d="M144 122 L168 134 L168 186 L144 176 Z" fill="{BARN_RD}"/>
      <!-- cupola -->
      <path d="M92 16 L108 8 L124 16 L108 28 Z" fill="{BARN_ROOF_D}" {STROKE}/>
      <path d="M96 20 L96 34 L108 40 L120 32 L120 20" fill="{BARN_R}" {STROKE}/>
      <!-- trim lines -->
      <path d="M0 100 L120 60 M120 60 L200 100" fill="none" stroke="{BARN_TRIM}" stroke-width="3"/>
    </g>"""

def fence_rail(x1, y1, x2, y2, posts=6):
    """Two crisp outlined rails, then capped posts on top."""
    out = []
    for dy in (-24, -11):
        out.append(f'<path d="M{x1} {y1+dy} L{x2} {y2+dy}" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>')
        out.append(f'<path d="M{x1} {y1+dy} L{x2} {y2+dy}" stroke="{FENCE}" stroke-width="3.6" stroke-linecap="round"/>')
    for i in range(posts + 1):
        t = i / posts
        x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        out.append(f'<rect x="{x-3.5}" y="{y-36}" width="7" height="36" fill="{FENCE}" {STROKE}/>')
        out.append(f'<rect x="{x-4.5}" y="{y-39}" width="9" height="5" fill="{FENCE}" {STROKE}/>')
        out.append(f'<rect x="{x+1}" y="{y-34}" width="1.5" height="32" fill="{FENCE_SH}"/>')
    return "".join(out)

def gate(x, y):
    """A gate that hinges on a taller post at (x,y), swung open."""
    return f"""
    <g transform="translate({x},{y})">
      <rect x="-5" y="-52" width="10" height="52" rx="3" fill="{FENCE}" {STROKE}/>
      <rect x="-6" y="-56" width="12" height="7" rx="2" fill="{FENCE}" {STROKE}/>
      <g transform="skewY(-30)">
        <rect x="6" y="-40" width="44" height="6" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="6" y="-22" width="44" height="6" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="6" y="-42" width="6" height="30" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="44" y="-42" width="6" height="30" rx="2" fill="{FENCE}" {STROKE}/>
        <path d="M10 -14 L46 -40" stroke="{FENCE}" stroke-width="4"/>
      </g>
    </g>"""

def name_tag(x, y, text, color=RED):
    w = len(text) * 8.4 + 26
    return f"""
    <g transform="translate({x - w/2},{y})">
      <rect x="0" y="0" width="{w}" height="22" rx="5" fill="{INK}" opacity=".85"/>
      <rect x="7" y="7" width="8" height="8" rx="2" fill="{color}"/>
      <text x="20" y="15.5" font-family="ui-monospace, Menlo, monospace" font-size="13" fill="#f8f5ee">{text}</text>
    </g>"""

# ---------- scene ----------

def scene(width=1200, height=820):
    """Isometric grass diamond with fence, barn, gate, and every character state."""
    top, right, bottom, left = (600, 130), (1150, 430), (600, 730), (50, 430)
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">', defs()]
    parts.append(f'<rect width="{width}" height="{height}" fill="#5e9a4d"/>')
    parts.append(f'<polygon points="{top[0]},{top[1]+14} {right[0]},{right[1]+14} {bottom[0]},{bottom[1]+14} {left[0]},{left[1]+14}" fill="{GRASS_EDGE}"/>')
    parts.append(f'<polygon points="{top[0]},{top[1]} {right[0]},{right[1]} {bottom[0]},{bottom[1]} {left[0]},{left[1]}" fill="url(#grassP)" stroke="{INK}" stroke-width="3"/>')
    # back fences (top-left and top-right edges), leaving a gap for the barn on the right
    parts.append(fence_rail(left[0]+20, left[1]-10, top[0]-20, top[1]+12, posts=9))
    parts.append(fence_rail(top[0]+330, top[1]+180, right[0]-20, right[1]-10, posts=4))
    parts.append(f'<g transform="translate(560,60) scale(1.15)">{barn()}</g>')
    # front-right fence with gate, front-left fence
    parts.append(fence_rail(right[0]-20, right[1]+10, right[0]-240, right[1]+130, posts=4))
    parts.append(gate(right[0]-262, right[1]+142))
    parts.append(fence_rail(right[0]-330, right[1]+180, bottom[0]+20, bottom[1]-12, posts=4))
    parts.append(fence_rail(left[0]+20, left[1]+10, bottom[0]-20, bottom[1]-12, posts=9))

    # characters: (asset, x, y, scale, tag)
    placements = [
        (sheep("graze"), 300, 380, 1.15, ("indexer", "#3a7bd5")),
        (sheep("stand"), 470, 300, 1.15, ("refactor", "#e0a52c")),
        (sheep("bucket"), 700, 420, 1.15, ("scraper", "#7c4dbf")),
        (sheep("cast"), 520, 500, 1.15, ("test-runner", "#2fa07a")),
        (sheep("rest"), 860, 500, 1.15, ("summarizer", "#e0602c")),
        (lamb(), 560, 340, 1.15, None),
        (lamb(), 600, 365, 1.15, None),
        (luna(), 240, 520, 1.3, ("Luna", RED)),
        (rabbit(), 760, 540, 1.1, None),
    ]
    placements.sort(key=lambda p: p[2])
    for asset, x, y, s, tag in placements:
        parts.append(f'<ellipse cx="{x+50*s}" cy="{y+96*s}" rx="{44*s}" ry="{10*s}" fill="{INK}" opacity=".18"/>')
        parts.append(f'<g transform="translate({x},{y}) scale({s})">{asset}</g>')
        if tag:
            parts.append(name_tag(x + 50 * s, y - 24, tag[0], tag[1]))
    parts.append("</svg>")
    return "\n".join(parts)

def asset_svg(inner, size=100, pad=10):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {size+2*pad} {size+2*pad}" width="{size+2*pad}" height="{size+2*pad}">{defs()}{inner}</svg>'

ASSETS = {
    "luna_sit": luna,
    "sheep_stand": lambda: sheep("stand"),
    "sheep_graze": lambda: sheep("graze"),
    "sheep_rest": lambda: sheep("rest"),
    "sheep_cast": lambda: sheep("cast"),
    "sheep_bucket": lambda: sheep("bucket"),
    "lamb": lamb,
    "rabbit": rabbit,
}

if __name__ == "__main__":
    import os
    os.makedirs("/home/claude/v2/svg", exist_ok=True)
    open("/home/claude/v2/svg/scene.svg", "w").write(scene())
    for k, fn in ASSETS.items():
        open(f"/home/claude/v2/svg/{k}.svg", "w").write(asset_svg(fn()))
    open("/home/claude/v2/svg/barn.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">{defs()}{barn()}</svg>')
    print("svgs written")

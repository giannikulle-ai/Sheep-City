"""
Agent Farm v3 — pixel finish. Vector source with pose parameters.
Every animation frame is a parameter set -> SVG -> crisp low-res render -> palette snap.
"""
from farm_vectors import (INK, WOOL, WOOL_SH, WOOL_HI, FACE, FACE_HI, PINK, LUNA_D, LUNA_M, LUNA_T, LUNA_W, LUNA_C,
                          AMBER, RED, BUCKET, BUCKET_D, BUCKET_L, FENCE, FENCE_SH, GRASS_A, GRASS_B, GRASS_EDGE,
                          RABBIT, RABBIT_D, STROKE, defs, barn, fence_rail,
                          BARN_R, BARN_RD, BARN_ROOF, BARN_ROOF_D, BARN_TRIM)

ZZ = "#7fb2e6"
EYE = "#7d5230"   # warm brown iris (her actual eye colour, not orange)
STAR = "#f2d15c"

# ------------------------------------------------------------------ SHEEP
def sheep(body_dy=0, head_dx=0, head_dy=0, head_rot=0, eyes=True, mouth="closed", jaw=0,
          legs="stand", lying=False, cast=False, kick=0, bucket=False, wool="normal",
          marks=None, grass=False, sound=False, stars=False):
    """3/4-view sheep facing screen-right. Local space ~0..110 x 0..100."""
    wool_scale = {"trim": .88, "normal": 1.0, "over": 1.14}[wool]
    ws = wool_scale
    def wool_group(dy=0):
        cx, cy = 46, 55 + dy
        pts = [(20, 50), (28, 36), (46, 30), (64, 36), (74, 52)]
        g = [f'<g transform="translate({cx},{cy}) scale({ws}) translate({-cx},{-cy})">',
             f'<ellipse cx="46" cy="{55+dy}" rx="32" ry="24" fill="url(#woolG)" {STROKE}/>']
        g += [f'<circle cx="{x}" cy="{y+dy}" r="{10 if x!=74 else 9}" fill="url(#woolG)" {STROKE}/>' for x, y in pts]
        g += [f'<ellipse cx="46" cy="{56+dy}" rx="29" ry="20" fill="url(#woolG)"/>']
        g += [f'<circle cx="{x}" cy="{y+dy}" r="{8 if x!=74 else 7}" fill="url(#woolG)"/>' for x, y in pts]
        # curl texture: short arcs in the shade colour
        for cx_, cy_ in [(30, 52), (44, 44), (58, 54), (38, 64), (54, 68), (66, 44)]:
            g.append(f'<path d="M{cx_-4} {cy_+dy} a4 4 0 0 1 8 0" fill="none" stroke="{WOOL_SH}" stroke-width="2.5" stroke-linecap="round"/>')
        g += ["</g>"]
        return "".join(g)

    def leg(x, y, front=True, rot=0, h=16):
        fill = "url(#faceG)" if front else FACE
        return f'<rect x="{x}" y="{y}" width="9" height="{h}" rx="4" fill="{fill}" {STROKE} transform="rotate({rot} {x+4.5} {y})"/>'

    # sheep trot: diagonal pairs swing together, small stiff swing, almost no knee bend
    GAIT = {"stand": (0, 0), "trotA": (14, -14), "trotM": (0, 0), "trotB": (-14, 14)}
    if legs in GAIT:
        a, b_ = GAIT[legs]   # a: near-hind & far-front, b_: near-front & far-hind
        back = limb(35, 70, 12, b_, 12, b_ * .6, FACE, 6, paw=False) + limb(63, 70, 12, a, 12, a * .6, FACE, 6, paw=False)
        front = limb(28, 72, 12, a, 12, a * .6, "url(#faceG)", 7, paw=False) + limb(56, 72, 12, b_, 12, b_ * .6, "url(#faceG)", 7, paw=False)
    else:
        back = front = ""

    def head(dx=0, dy=0, rot=0):
        if mouth == "open":
            m = f'<ellipse cx="84" cy="77" rx="4.5" ry="4" fill="{PINK}" {STROKE}/>'
        else:
            m = f'<path d="M77 {78+jaw} q6 3 12 0" fill="none" {STROKE}/>'
        eye = (f'<ellipse cx="74" cy="61" rx="6" ry="6.5" fill="#fff" {STROKE}/><ellipse cx="91" cy="61" rx="6" ry="6.5" fill="#fff" {STROKE}/>'
               f'<circle cx="75.5" cy="62.5" r="2.8" fill="{INK}"/><circle cx="92.5" cy="62.5" r="2.8" fill="{INK}"/>'
               f'<circle cx="74" cy="60" r="1" fill="#fff"/><circle cx="91" cy="60" r="1" fill="#fff"/>') if eyes else \
              f'<path d="M69 62 q5 3 10 0 M86 62 q5 3 10 0" fill="none" {STROKE}/>'
        tuft = "" if bucket else f'<circle cx="82" cy="45" r="10" fill="url(#woolG)" {STROKE}/>'
        return f"""
        <g transform="translate({dx},{dy}) rotate({rot} 82 62)">
          <ellipse cx="66" cy="54" rx="8" ry="4.5" transform="rotate(-25 66 54)" fill="{FACE}" {STROKE}/>
          <ellipse cx="65" cy="54" rx="4.5" ry="2" transform="rotate(-25 65 54)" fill="{PINK}"/>
          <ellipse cx="99" cy="58" rx="8" ry="4.5" transform="rotate(20 99 58)" fill="{FACE}" {STROKE}/>
          <ellipse cx="99" cy="58" rx="4.5" ry="2" transform="rotate(20 99 58)" fill="{PINK}"/>
          <ellipse cx="82" cy="64" rx="21" ry="19" fill="url(#faceG)" {STROKE}/>
          <ellipse cx="83" cy="74" rx="12" ry="8" fill="{FACE_HI}" opacity=".5"/>
          <circle cx="80" cy="72" r="1.2" fill="{INK}"/><circle cx="86" cy="72" r="1.2" fill="{INK}"/>
          {tuft}{eye}{m}
        </g>"""

    out = []
    if cast:
        kicks = [(-15, -6), (-5, 6), (8, -6), (18, 6)]
        for i, (x, y, r) in enumerate([(30, 22, -15), (40, 18, -5), (52, 18, 8), (62, 22, 18)]):
            rr = r + (kicks[i][kick % 2] if True else 0)
            out.append(f'<rect x="{x}" y="{y}" width="9" height="18" rx="4" fill="url(#faceG)" {STROKE} transform="rotate({rr} {x+4} {y+18})"/>')
        out.append(f'<g transform="translate(0,14)">{wool_group()}</g>')
        out.append(f'<ellipse cx="46" cy="70" rx="22" ry="13" fill="{WOOL_SH}" opacity=".7"/>')
        out.append(head(-6 + head_dx, 18 + head_dy, 70 + head_rot))
    elif lying:
        out.append(f'<g transform="translate(0,{14+body_dy})">{wool_group()}</g>')
        out.append(f'<ellipse cx="46" cy="86" rx="34" ry="6" fill="{WOOL_SH}" {STROKE}/>')
        out.append(head(head_dx, 10 + head_dy, head_rot))
    else:
        out.append(back)
        out.append(f'<g transform="translate(0,{body_dy})">{wool_group()}</g>')
        out.append(front)
        out.append(head(head_dx, head_dy + body_dy, head_rot))
    if bucket:
        out.append(f"""
        <g transform="translate({64+head_dx},{40+head_dy+body_dy})">
          <path d="M2 4 L36 4 L30 44 L8 44 Z" fill="url(#bucketG)" {STROKE}/>
          <ellipse cx="19" cy="4" rx="17" ry="5" fill="{BUCKET_L}" {STROKE}/>
          <path d="M5 13 L33 13" fill="none" stroke="{BUCKET_D}" stroke-width="2.5"/>
          <path d="M2 6 q17 -22 34 0" fill="none" {STROKE}/>
        </g>""")
    if grass:
        out.append(f'<path d="M96 92 l3 -8 l3 8 M103 92 l2 -6 l3 6" fill="none" stroke="{GRASS_EDGE}" stroke-width="2.5"/>')
    if sound:
        out.append(f'<path d="M108 48 q6 8 0 16 M114 42 q10 14 0 28" fill="none" stroke="{ZZ}" stroke-width="3" stroke-linecap="round"/>')
    if stars:
        for x, y in [(100, 22), (112, 34), (94, 12)]:
            out.append(f'<path d="M{x} {y-5} L{x+1.5} {y-1.5} L{x+5} {y} L{x+1.5} {y+1.5} L{x} {y+5} L{x-1.5} {y+1.5} L{x-5} {y} L{x-1.5} {y-1.5} Z" fill="{STAR}" {STROKE}/>')
    if marks == "zzz":
        out.append(f'<text x="100" y="30" font-family="monospace" font-weight="bold" font-size="16" fill="{ZZ}">z</text>')
    return "".join(out)

def lamb(phase=0):
    return f'<g transform="scale(.55)">{sheep(legs=["trotA","trotM","trotB","trotM"][phase], body_dy=[0,-2,0,-2][phase])}</g>'


import math
def limb(x, y, L1, a1, L2, a2, col="url(#lunaW)", thick=10, paw=True):
    """Jointed leg: thigh from (x,y) at angle a1 (deg from straight down, +forward) then shin at a2. Drawn as outlined strokes."""
    r1, r2 = math.radians(a1), math.radians(a2)
    p1 = (x + L1 * math.sin(r1), y + L1 * math.cos(r1)); p2 = (p1[0] + L2 * math.sin(r2), p1[1] + L2 * math.cos(r2))
    d = f"M{x} {y} L{p1[0]:.1f} {p1[1]:.1f} L{p2[0]:.1f} {p2[1]:.1f}"
    out = [f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{thick+4}" stroke-linecap="round" stroke-linejoin="round"/>',
           f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{thick}" stroke-linecap="round" stroke-linejoin="round"/>']
    if paw:
        out.append(f'<ellipse cx="{p2[0]:.1f}" cy="{p2[1]+1:.1f}" rx="{thick*.72:.1f}" ry="{thick*.5:.1f}" fill="{col}" {STROKE}/>')
    return "".join(out)

# ------------------------------------------------------------------ DIGITAL LUNA
def digital_luna_head(cx=68, cy=40, s=1.0, rot=0, blink=False, ear_lift=0, tongue=True):
    """Chibi Digital Luna head: tousled dark crown, wavy fringe over big warm-brown eyes, cream beard, tiny nose, smile."""
    if blink:
        eyes = f'<path d="M50 57 q6 4 12 0 M78 57 q6 4 12 0" fill="none" {STROKE}/>'
    else:
        eyes = (f'<ellipse cx="55.5" cy="56" rx="7.5" ry="8.5" fill="#fff"/><ellipse cx="84.5" cy="56" rx="7.5" ry="8.5" fill="#fff"/>'
                f'<ellipse cx="56" cy="57.5" rx="6" ry="7" fill="{EYE}"/><ellipse cx="85" cy="57.5" rx="6" ry="7" fill="{EYE}"/>'
                f'<ellipse cx="56.5" cy="58.5" rx="4" ry="4.8" fill="{INK}"/><ellipse cx="85.5" cy="58.5" rx="4" ry="4.8" fill="{INK}"/>'
                f'<circle cx="53.5" cy="54" r="2" fill="#fff"/><circle cx="82.5" cy="54" r="2" fill="#fff"/>')
    tg = f'<path d="M66 75 q4 8 8 0z" fill="{PINK}" {STROKE}/>' if tongue else ""
    el = ear_lift
    return f"""
    <g transform="translate({cx},{cy}) scale({s}) rotate({rot}) translate(-70,-44)">
      <!-- ears -->
      <ellipse cx="36" cy="{56-el}" rx="13" ry="20" transform="rotate(12 36 {56-el})" fill="url(#lunaD)" {STROKE}/>
      <ellipse cx="104" cy="{56-el}" rx="13" ry="20" transform="rotate(-12 104 {56-el})" fill="url(#lunaD)" {STROKE}/>
      <path d="M32 {46-el} q-3 8 0 16 M40 {50-el} q-3 8 0 16" fill="none" stroke="{LUNA_M}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M100 {50-el} q3 8 0 16 M108 {46-el} q3 8 0 16" fill="none" stroke="{LUNA_M}" stroke-width="2.2" stroke-linecap="round"/>
      <!-- head + tousled crown (bumps), seams hidden by a fill-only disc -->
      <circle cx="70" cy="44" r="32" fill="url(#lunaD)" {STROKE}/>
      <circle cx="46" cy="24" r="10" fill="url(#lunaD)" {STROKE}/>
      <circle cx="60" cy="14" r="11" fill="url(#lunaD)" {STROKE}/>
      <circle cx="78" cy="13" r="11" fill="url(#lunaD)" {STROKE}/>
      <circle cx="93" cy="23" r="9" fill="url(#lunaD)" {STROKE}/>
      <circle cx="70" cy="44" r="30.5" fill="url(#lunaD)"/>
      <path d="M54 12 q6 -3 12 -1 M46 26 q2 -6 7 -8" fill="none" stroke="{LUNA_M}" stroke-width="2.4" stroke-linecap="round"/>
      <!-- face -->
      <ellipse cx="70" cy="70" rx="18" ry="9" fill="{LUNA_C}" {STROKE}/>
      <ellipse cx="70" cy="68" rx="8" ry="5" fill="{LUNA_T}"/>
      <ellipse cx="70" cy="67" rx="4.5" ry="3" fill="{INK}"/>
      <path d="M64 73 q6 4 12 0" fill="none" {STROKE}/>
      {tg}{eyes}
      <!-- fringe: wavy dark edge just onto the top of the eyes -->
      <path d="M42 44 q7 10 14 0 q7 10 14 0 q7 10 14 0 q7 10 14 0 L98 38 L42 38 Z" fill="url(#lunaD)"/>
      <path d="M42 44 q7 10 14 0 q7 10 14 0 q7 10 14 0 q7 10 14 0" fill="none" {STROKE}/>
    </g>"""

def digital_luna_sit(blink=False, ear_lift=0, tongue=False, head_rot=0, head_dy=0, tail_wag=0):
    return f"""
    <g>
      <path d="M{22+tail_wag} 84 q-22 -4 -18 -26 l4 4 l2 -6 l4 5 l3 -5 q6 6 5 16 q2 8 0 12z" fill="url(#lunaW)" {STROKE}/>
      <ellipse cx="40" cy="86" rx="26" ry="16" fill="url(#lunaW)" {STROKE}/>
      <path d="M26 90 q4 -3 8 0 M36 96 q4 -3 8 0" fill="none" stroke="{LUNA_C}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M18 80 q6 -40 46 -42 q22 0 26 20 l-2 24 q-36 -12 -70 -2z" fill="url(#lunaD)" {STROKE}/>
      <ellipse cx="66" cy="80" rx="17" ry="20" fill="url(#lunaW)" {STROKE}/>
      <path d="M56 70 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4" fill="none" stroke="{LUNA_C}" stroke-width="2.2" stroke-linecap="round"/>
      <ellipse cx="34" cy="101" rx="9" ry="4.5" fill="{LUNA_C}" {STROKE}/>
      {limb(57, 78, 12, -4, 12, 2, "url(#lunaW)", 10)}
      {limb(76, 78, 12, 4, 12, -2, "url(#lunaW)", 10)}
      {digital_luna_head(66, 34 + head_dy, 1.12, head_rot, blink, ear_lift, tongue)}
    </g>"""

def digital_luna_run(phase=0, stick=False):
    """Side-view gallop, facing right. 4 phases: flight/extend, front contact, gather, push-off."""
    P = [((-30, -46), (36, 50), -5, 16, 0),
         ((14, -6),  (18, -4), 0, 17, 0),
         ((44, 24),  (-34, -14), -2, 15, 4),
         ((-14, -34), (6, 44), -3, 16, 0)][phase % 4]
    (h1, h2), (f1, f2), dy, ry, arch = P
    FAR = LUNA_C
    st = f'<rect x="88" y="60" width="44" height="6" rx="3" fill="#a87c4a" {STROKE} transform="rotate(-8 88 60)"/>' if stick else ""
    return f"""
    <g transform="translate(0,{dy})">
      <path d="M14 52 q-18 -12 -6 -26 l4 5 l3 -6 l4 6 q4 10 -5 21z" fill="url(#lunaW)" {STROKE}/>
      {limb(26, 62, 12, h1 + 10, 14, h2 + 10, FAR, 9)}
      {limb(70, 62, 12, f1 - 10, 14, f2 - 10, FAR, 9)}
      <ellipse cx="48" cy="{60 - arch}" rx="34" ry="{ry}" fill="url(#lunaW)" {STROKE}/>
      <path d="M16 56 q8 -26 40 -24 q26 2 32 18 q-34 -6 -72 6z" fill="url(#lunaD)" {STROKE}/>
      <path d="M40 40 q6 -4 12 0 M56 38 q6 -4 12 0" fill="none" stroke="{LUNA_M}" stroke-width="2.2" stroke-linecap="round"/>
      {limb(30, 66, 12, h1, 14, h2, "url(#lunaW)", 10)}
      {limb(74, 66, 12, f1, 14, f2, "url(#lunaW)", 10)}
      {st}
      {digital_luna_head(88, 42, .82, 8, False, 26, True)}
    </g>"""

def digital_luna_flop(phase=0):
    """Belly up, four paws in the air, head lolled to the right."""
    t = [0, 8][phase]
    return f"""
    <g>
      <ellipse cx="50" cy="74" rx="40" ry="20" fill="url(#lunaW)" {STROKE}/>
      <path d="M12 74 q4 -12 20 -14 q-4 10 0 22 q-14 2 -20 -8z" fill="url(#lunaD)" {STROKE}/>
      <rect x="24" y="36" width="11" height="26" rx="5" fill="url(#lunaW)" {STROKE} transform="rotate({-12+t} 29 62)"/>
      <rect x="40" y="30" width="11" height="30" rx="5" fill="url(#lunaW)" {STROKE} transform="rotate({-4-t} 45 60)"/>
      <rect x="56" y="30" width="11" height="30" rx="5" fill="url(#lunaW)" {STROKE} transform="rotate({6+t} 61 60)"/>
      <rect x="70" y="38" width="11" height="24" rx="5" fill="url(#lunaW)" {STROKE} transform="rotate({16-t} 75 62)"/>
      <ellipse cx="52" cy="76" rx="26" ry="12" fill="{LUNA_C}" opacity=".5"/>
      {digital_luna_head(100, 76, .9, 75, phase == 1, 0, True)}
    </g>"""

def digital_luna_sleep(phase=0):
    z = f'<text x="86" y="{40 - phase*6}" font-family="monospace" font-weight="bold" font-size="{14 + phase*4}" fill="{ZZ}">z</text>'
    return f"""
    <g>
      <ellipse cx="50" cy="80" rx="42" ry="22" fill="url(#lunaW)" {STROKE}/>
      <path d="M10 78 q8 -34 46 -34 q34 0 36 30 q-40 -10 -82 4z" fill="url(#lunaD)" {STROKE}/>
      <path d="M10 82 q-10 -8 4 -20 q6 8 4 18z" fill="url(#lunaW)" {STROKE}/>
      {digital_luna_head(68, 62, .95, 20, True, 0, False)}
      {z}
    </g>"""


def digital_luna_stretch(phase=0):
    """Wake-up stretch: 0 = downward dog (front legs forward, rear up), 1 = rear sits, head up, big yawn."""
    if phase == 0:
        return f"""
        <g>
          <path d="M26 40 q-16 -10 -6 -26 l4 5 l3 -6 l4 6 q4 10 -1 20z" fill="url(#lunaW)" {STROKE}/>
          <ellipse cx="34" cy="56" rx="24" ry="19" fill="url(#lunaW)" {STROKE}/>
          <rect x="18" y="66" width="11" height="26" rx="5" fill="url(#lunaW)" {STROKE}/>
          <rect x="34" y="70" width="11" height="24" rx="5" fill="url(#lunaW)" {STROKE}/>
          <path d="M14 54 q4 -30 40 -24 q26 6 36 46 q-30 8 -70 -6z" fill="url(#lunaD)" {STROKE}/>
          <ellipse cx="74" cy="80" rx="16" ry="14" fill="url(#lunaW)" {STROKE}/>
          <rect x="70" y="88" width="34" height="10" rx="5" fill="url(#lunaW)" {STROKE}/>
          <rect x="62" y="94" width="34" height="10" rx="5" fill="url(#lunaW)" {STROKE}/>
          {digital_luna_head(96, 62, .95, 14, True, 8, False)}
        </g>"""
    return f"""
        <g>
          <path d="M18 84 q-22 -4 -18 -26 l4 4 l2 -6 l4 5 l3 -5 q6 6 5 16 q2 8 0 12z" fill="url(#lunaW)" {STROKE}/>
          <ellipse cx="40" cy="86" rx="26" ry="16" fill="url(#lunaW)" {STROKE}/>
          <path d="M18 80 q6 -40 46 -42 q22 0 26 20 l-2 24 q-36 -12 -70 -2z" fill="url(#lunaD)" {STROKE}/>
          <ellipse cx="66" cy="80" rx="17" ry="20" fill="url(#lunaW)" {STROKE}/>
          {limb(55, 78, 12, -14, 12, -6, "url(#lunaW)", 10)}
          {limb(78, 78, 12, 14, 12, 6, "url(#lunaW)", 10)}
          {digital_luna_head(66, 28, 1.12, -6, True, 10, False)}
          <ellipse cx="70" cy="58" rx="7" ry="6" fill="{PINK}" {STROKE}/>
        </g>"""

def digital_luna_nibble(phase=0):
    return digital_luna_sit(head_dy=[14, 16][phase], head_rot=[22, 26][phase], blink=True, tail_wag=[0, 4][phase])

# ------------------------------------------------------------------ RABBIT
def rabbit(phase=0):
    dy = [0, -8][phase]; er = [0, -14][phase]
    return f"""
    <g transform="translate(0,{dy}) scale(.6)">
      <ellipse cx="30" cy="40" rx="7" ry="20" transform="rotate({-15+er} 30 40)" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="30" cy="42" rx="3.5" ry="14" transform="rotate({-15+er} 30 42)" fill="{PINK}"/>
      <ellipse cx="50" cy="40" rx="7" ry="20" transform="rotate({10+er} 50 40)" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="50" cy="42" rx="3.5" ry="14" transform="rotate({10+er} 50 42)" fill="{PINK}"/>
      <ellipse cx="44" cy="78" rx="30" ry="{20 - phase*4}" fill="url(#rabbitG)" {STROKE}/>
      <circle cx="14" cy="76" r="8" fill="#fff" {STROKE}/>
      <circle cx="42" cy="66" r="18" fill="url(#rabbitG)" {STROKE}/>
      <ellipse cx="36" cy="66" rx="3.5" ry="4" fill="#fff" {STROKE}/><ellipse cx="50" cy="66" rx="3.5" ry="4" fill="#fff" {STROKE}/>
      <circle cx="37" cy="67" r="1.8" fill="{INK}"/><circle cx="51" cy="67" r="1.8" fill="{INK}"/>
      <ellipse cx="43" cy="75" rx="3" ry="2" fill="{PINK}" {STROKE}/>
      <rect x="{26 - phase*6}" y="90" width="12" height="9" rx="4" fill="url(#rabbitG)" {STROKE}/><rect x="{52 + phase*6}" y="90" width="12" height="9" rx="4" fill="url(#rabbitG)" {STROKE}/>
    </g>"""

# ------------------------------------------------------------------ GRASS TUFT
def tuft(level=3):
    """Edible grass tuft. level 0 = nibbled-down dirt patch .. 3 = tall with a flower."""
    OUT, FILL, HI = "#2f5f2a", "#7fd06a", "#cdf3a3"
    if level == 0:
        return f'''<g transform="translate(55,96)">
          <ellipse cx="0" cy="0" rx="16" ry="6" fill="#a98b5a" stroke="#7a5f36" stroke-width="2"/>
          <path d="M-8 -1 l-2 -7 M0 -2 l1 -8 M8 -1 l3 -6" fill="none" stroke="{OUT}" stroke-width="3" stroke-linecap="round"/>
        </g>'''
    h = [0, 22, 38, 54][level]
    blades = [(-20, -1.0), (-11, -.45), (-2, .05), (7, .5), (16, 1.0), (2, -.7)] if level >= 2 else [(-12, -.7), (0, .1), (12, .8)]
    out = [f'<ellipse cx="0" cy="0" rx="18" ry="5" fill="{GRASS_EDGE}" opacity=".7"/>']
    for x, lean in blades:
        tip = (x + lean * h * .4, -h - (1 - abs(lean)) * 6)
        out.append(f'<path d="M{x-5} 0 Q{x+lean*5} {-h*.5} {tip[0]} {tip[1]} Q{x+lean*4+3} {-h*.5} {x+5} 0 Z" fill="{FILL}" stroke="{OUT}" stroke-width="2.4" stroke-linejoin="round"/>')
        out.append(f'<path d="M{x-1} -2 Q{x+lean*5} {-h*.5} {tip[0]+1} {tip[1]+3}" fill="none" stroke="{HI}" stroke-width="2" stroke-linecap="round"/>')
    if level == 3:
        for ox, oy in [(-4, 0), (4, 0), (0, -4), (0, 4)]: out.append(f'<circle cx="{-2+ox}" cy="{-h*.92+oy}" r="3" fill="#f6e05e"/>')
        out.append(f'<circle cx="-2" cy="{-h*.92}" r="2" fill="#c9862e"/>')
    return f'<g transform="translate(55,96)">{"".join(out)}</g>'

# ------------------------------------------------------------------ SET PIECES
def gate(x, y, open_=True):
    sk = -30 if open_ else 30
    return f"""
    <g transform="translate({x},{y}) scale(1.5)">
      <rect x="-5" y="-52" width="10" height="52" rx="3" fill="{FENCE}" {STROKE}/>
      <rect x="-6" y="-56" width="12" height="7" rx="2" fill="{FENCE}" {STROKE}/>
      <g transform="skewY({sk})">
        <rect x="6" y="-40" width="44" height="6" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="6" y="-22" width="44" height="6" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="6" y="-42" width="6" height="30" rx="2" fill="{FENCE}" {STROKE}/>
        <rect x="44" y="-42" width="6" height="30" rx="2" fill="{FENCE}" {STROKE}/>
        <path d="M10 -14 L46 -40" stroke="{FENCE}" stroke-width="4"/>
      </g>
    </g>"""

def trough(x, y):
    return f"""
    <g transform="translate({x},{y})">
      <path d="M0 0 L60 0 L54 22 L6 22 Z" fill="#8a6a3a" {STROKE}/>
      <path d="M-2 -4 L62 -4 L62 2 L-2 2 Z" fill="#a87c4a" {STROKE}/>
      <path d="M6 4 L54 4 L50 16 L10 16 Z" fill="#6f8fa6"/>
    </g>"""

def tree(x, y, s=1.0, shade=0):
    c1, c2 = ("#4f9a3e", "#3d7a30") if shade == 0 else ("#5aa848", "#457f36")
    return f"""
    <g transform="translate({x},{y}) scale({s})">
      <rect x="-7" y="-4" width="14" height="26" rx="4" fill="#7a5233" {STROKE}/>
      <ellipse cx="0" cy="-30" rx="34" ry="30" fill="{c2}" {STROKE}/>
      <circle cx="-16" cy="-40" r="18" fill="{c1}" {STROKE}/><circle cx="14" cy="-46" r="20" fill="{c1}" {STROKE}/>
      <circle cx="-4" cy="-56" r="16" fill="{c1}" {STROKE}/><circle cx="22" cy="-26" r="16" fill="{c1}" {STROKE}/>
      <circle cx="-16" cy="-40" r="16" fill="{c1}"/><circle cx="14" cy="-46" r="18" fill="{c1}"/><circle cx="-4" cy="-56" r="14" fill="{c1}"/>
      <circle cx="-22" cy="-48" r="4" fill="#8fd47a"/><circle cx="10" cy="-62" r="4" fill="#8fd47a"/>
    </g>"""

def hay(x, y):
    """Square bale, unmistakably hay."""
    return f"""
    <g transform="translate({x},{y})">
      <polygon points="0,0 64,0 84,-14 84,-46 64,-32 0,-32" fill="#caa24a" {STROKE}/>
      <rect x="0" y="-32" width="64" height="32" fill="#e6bd5c" {STROKE}/>
      <polygon points="64,-32 84,-46 84,-14 64,0" fill="#b08a3c" {STROKE}/>
      <path d="M18 -32 L18 0 M46 -32 L46 0" stroke="#7a5a26" stroke-width="4"/>
      <path d="M70 -36 L70 -6" stroke="#7a5a26" stroke-width="4"/>
      <path d="M5 -26 l10 0 M28 -20 l12 0 M8 -10 l9 0 M34 -8 l14 0 M52 -24 l8 0" stroke="#b08a3c" stroke-width="2.5"/>
      <path d="M-6 4 l8 -3 M14 6 l7 -2 M52 5 l9 -3 M70 2 l8 -2" stroke="#caa24a" stroke-width="3" stroke-linecap="round"/>
    </g>"""

def hills():
    """Rolling fields outside the paddock."""
    p = []
    p.append(f'<path d="M0 260 q300 -120 700 -60 q500 70 900 -40 L1600 0 L0 0 Z" fill="#578f46"/>')
    p.append(f'<path d="M0 150 q400 -90 820 -40 q460 50 780 -30 L1600 0 L0 0 Z" fill="#4f8340"/>')
    p.append(f'<path d="M0 1000 L0 860 q380 90 800 40 q420 -50 800 30 L1600 1000 Z" fill="#578f46"/>')
    # distant tree clusters
    for x, y, s in [(180, 70, .5), (240, 86, .4), (1330, 120, .5), (1420, 96, .45), (1490, 860, .5), (120, 900, .45)]:
        p.append(f'<g transform="translate({x},{y}) scale({s})"><ellipse cx="0" cy="-24" rx="30" ry="26" fill="#3d7a30" stroke="{INK}" stroke-width="4"/><rect x="-5" y="-4" width="10" height="16" fill="#7a5233" stroke="{INK}" stroke-width="4"/></g>')
    return "".join(p)

def flowers(x, y):
    out = []
    for dx, dy, c in [(0, 0, "#f6e05e"), (16, 6, "#ffffff"), (30, -2, "#e88aa0"), (46, 8, "#f6e05e")]:
        out.append(f'<path d="M{x+dx} {y+dy+10} l0 -8" stroke="{GRASS_EDGE}" stroke-width="3"/>')
        for ox, oy in [(-4, 0), (4, 0), (0, -4), (0, 4)]:
            out.append(f'<circle cx="{x+dx+ox}" cy="{y+dy+oy}" r="3.2" fill="{c}"/>')
        out.append(f'<circle cx="{x+dx}" cy="{y+dy}" r="2.2" fill="#c9862e"/>')
    return "".join(out)

def rock(x, y):
    return f'<ellipse cx="{x}" cy="{y}" rx="16" ry="9" fill="#9aa0a6" {STROKE}/><ellipse cx="{x-4}" cy="{y-3}" rx="8" ry="4" fill="#b8bec4"/>'


def lantern(x, y, lit=False):
    glass = "#ffd75e" if lit else "#dbe6ee"
    return f"""
    <g transform="translate({x},{y})">
      <rect x="-4" y="-84" width="8" height="84" rx="2" fill="#5a3c22" {STROKE}/>
      <path d="M0 -84 q16 0 22 8" fill="none" {STROKE} stroke-width="5"/>
      <path d="M22 -76 l0 5" stroke="{INK}" stroke-width="3"/>
      <path d="M14 -71 L30 -71 L27 -49 L17 -49 Z" fill="{INK}"/>
      <rect x="17" y="-68" width="10" height="16" fill="{glass}"/>
      <path d="M22 -68 l0 16 M17 -61 l10 0" stroke="{INK}" stroke-width="2"/>
      <path d="M13 -73 L31 -73 L29 -69 L15 -69 Z" fill="{INK}"/>
      <rect x="19" y="-49" width="6" height="4" fill="{INK}"/>
    </g>"""

def lantern_light(x, y):
    return f'<rect x="{x+17}" y="{y-68}" width="10" height="16" fill="#ffd75e"/><circle cx="{x+22}" cy="{y-60}" r="22" fill="#ffd75e" opacity=".18"/>'

def barn_front():
    """Front-facing gambrel barn with a dark doorway (a real shelter), side receding up-right."""
    DX, DY = 64, -32   # depth offset along the iso edge
    prof = [(0, 90), (30, 45), (88, 18), (146, 45), (176, 90)]
    pts = lambda *ps: " ".join(f"{x},{y}" for x, y in ps)
    off = lambda p: (p[0] + DX, p[1] + DY)
    return f"""
    <g>
      <!-- side wall -->
      <polygon points="{pts((176,190),(176,90),off((176,90)),off((176,190)))}" fill="{BARN_RD}" {STROKE}/>
      <!-- roof back surfaces (right slabs recede) -->
      <polygon points="{pts((88,18),(146,45),off((146,45)),off((88,18)))}" fill="{BARN_ROOF_D}" {STROKE}/>
      <polygon points="{pts((146,45),(176,90),off((176,90)),off((146,45)))}" fill="{BARN_ROOF}" {STROKE}/>
      <!-- front wall + gambrel gable -->
      <rect x="0" y="90" width="176" height="100" fill="url(#barnFront)" {STROKE}/>
      <polygon points="{pts(*prof)}" fill="url(#barnFront)" {STROKE}/>
      <!-- fascia along the profile -->
      <polyline points="{pts(*prof)}" fill="none" stroke="{BARN_ROOF_D}" stroke-width="10" stroke-linejoin="round"/>
      <polyline points="{pts(*prof)}" fill="none" stroke="{BARN_TRIM}" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="{pts(*prof)}" fill="none" {STROKE}/>
      <!-- loft window with hay -->
      <rect x="72" y="38" width="32" height="26" fill="{INK}" {STROKE}/>
      <path d="M75 52 q13 -10 26 -4 l0 12 l-26 0z" fill="#e2b04a"/>
      <path d="M72 51 l32 0 M88 38 l0 26" stroke="{BARN_TRIM}" stroke-width="3"/>
      <!-- doorway: white frame, dark interior, doors swung open -->
      <rect x="54" y="118" width="68" height="72" fill="{BARN_TRIM}" {STROKE}/>
      <rect x="60" y="124" width="56" height="66" fill="#241813"/>
      <rect x="60" y="124" width="56" height="8" fill="#180f0c"/>
      <polygon points="40,118 60,124 60,190 40,190" fill="{BARN_R}" {STROKE}/>
      <path d="M44 132 L56 136 M44 176 L56 178" stroke="{BARN_TRIM}" stroke-width="3"/>
      <polygon points="136,118 116,124 116,190 136,190" fill="{BARN_R}" {STROKE}/>
      <path d="M132 132 L120 136 M132 176 L120 178" stroke="{BARN_TRIM}" stroke-width="3"/>
      <!-- front trim + side window -->
      <path d="M0 90 L176 90" stroke="{BARN_TRIM}" stroke-width="3"/>
      <polygon points="{pts((196,108),(224,94),(224,124),(196,138))}" fill="{BARN_TRIM}" {STROKE}/>
      <polygon points="{pts((200,110),(220,100),(220,120),(200,130))}" fill="#6f8fa6"/>
      <!-- cupola on the ridge -->
      <g transform="translate({88 + DX // 2},{18 + DY // 2 - 4})">
        <rect x="-9" y="-4" width="18" height="16" fill="{BARN_R}" {STROKE}/>
        <rect x="-4" y="0" width="8" height="8" fill="{INK}"/>
        <polygon points="-14,-4 0,-14 14,-4" fill="{BARN_ROOF_D}" {STROKE}/>
      </g>
    </g>"""

def barn_lights():
    """Warm glow layer: loft window, side window, doorway interior."""
    Y = "#ffd75e"
    return f"""
    <g>
      <rect x="75" y="41" width="26" height="20" fill="{Y}"/>
      <polygon points="200,110 220,100 220,120 200,130" fill="{Y}"/>
      <rect x="62" y="128" width="52" height="60" fill="#b8863a" opacity=".8"/>
    </g>"""

FIELD = dict(width=1600, height=1000, top=(800, 110), right=(1560, 520), bottom=(800, 930), left=(40, 520))

def background(lights_only=False):
    """Wide field diorama. Front-facing barn top-centre, fences meeting every corner, hills outside."""
    f = FIELD; top, right, bottom, left = f["top"], f["right"], f["bottom"], f["left"]
    width, height = f["width"], f["height"]
    barn_t = "translate(688,-46) scale(1.15)"
    lant = (right[0]-352, right[1]+236)
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}">', defs()]
    if lights_only:
        p.append(f'<g transform="{barn_t}">{barn_lights()}</g>')
        p.append(lantern_light(*lant))
        p.append("</svg>")
        return "\n".join(p)
    p.append(f'<rect width="{width}" height="{height}" fill="#5e9a4d"/>')
    p.append(hills())
    p.append(f'<polygon points="{top[0]},{top[1]+16} {right[0]},{right[1]+16} {bottom[0]},{bottom[1]+16} {left[0]},{left[1]+16}" fill="{GRASS_EDGE}"/>')
    p.append(f'<polygon points="{top[0]},{top[1]} {right[0]},{right[1]} {bottom[0]},{bottom[1]} {left[0]},{left[1]}" fill="url(#grassP)" stroke="{INK}" stroke-width="3"/>')
    p.append(f'<path d="M1300 660 q-180 -80 -420 -400" fill="none" stroke="#8a6a3a" stroke-width="34" stroke-linecap="round"/>')
    p.append(f'<path d="M1300 660 q-180 -80 -420 -400" fill="none" stroke="#b8925a" stroke-width="24" stroke-linecap="round"/>')
    p.append(f'<path d="M1300 660 q-180 -80 -420 -400" fill="none" stroke="#c9a56b" stroke-width="10" stroke-linecap="round" stroke-dasharray="14 22"/>')
    p.append(f'<path d="M1300 660 q120 40 260 60" fill="none" stroke="#8a6a3a" stroke-width="30" stroke-linecap="round" opacity=".8"/>')
    for x, y, s, sh in [(210, 360, 1.0, 0), (250, 240, .85, 1), (1480, 700, 1.0, 0), (1380, 830, .85, 1), (470, 160, .8, 1)]:
        p.append(tree(x, y, s, sh))
    # back fences: meet the left corner and run from the barn's right side to the right corner
    p.append(fence_rail(left[0]+8, left[1]-4, top[0]-160, top[1]+92, posts=11))
    p.append(fence_rail(top[0]+156, top[1]+86, right[0]-8, right[1]-4, posts=9))
    p.append(f'<g transform="{barn_t}">{barn_front()}</g>')
    p.append(trough(330, 520)); p.append(hay(548, 336))
    p.append(rock(1180, 420)); p.append(rock(480, 700))
    for x, y in [(300, 600), (1000, 780), (1250, 560), (700, 460)]:
        p.append(flowers(x, y))
    # front fences with the gate, meeting the bottom corner
    p.append(fence_rail(right[0]-8, right[1]+4, right[0]-250, right[1]+132, posts=6))
    p.append(gate(right[0]-262, right[1]+146))
    p.append(fence_rail(right[0]-380, right[1]+204, bottom[0]+8, bottom[1]-4, posts=8))
    p.append(fence_rail(left[0]+8, left[1]+4, bottom[0]-8, bottom[1]-4, posts=13))
    p.append(lantern(*lant, lit=False))
    p.append("</svg>")
    return "\n".join(p)

# ------------------------------------------------------------------ ANIMATION TABLE
# name -> (frame builders, fps, px_width, viewBox, meaning)
VB = "-14 -8 140 120"
ANIMS = {
    "sheep":        {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").SHEEP_ANIMS)},
    "digital_luna": {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").DL_ANIMS)},
    "lamb":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").LAMB_ANIMS)},
    "rabbit":       {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").RABBIT_ANIMS)},
    "icon":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").ICON_ANIMS)},
    "bird":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").BIRD_ANIMS)},
    "butterfly":    {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").BFLY_ANIMS)},
    "peek":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").PEEK_ANIMS)},
    "dl_peek":      {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").DL_PEEK_ANIMS)},
    "stick":        {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").STICK_ANIMS)},
    "ride":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").RIDE_ANIMS)},
    "farmer":       {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").FARMER_ANIMS)},
    "merchant":     {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").MERCHANT_ANIMS)},
    "cart":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").CART_ANIMS)},
    "upgrade":      {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").UPGRADE_ANIMS)},
    "grass":  {"px": 34, "vb": "-14 -8 140 120", "anims": {"grow": ([(lambda i: (lambda: tuft(i)))(i) for i in range(4)], 1, "edible tuft: 0 nub .. 3 tall")}},    "crow":         {"pil": True, "anims": __import__("hand_sprites").as_pil(__import__("hand_sprites").CROW_ANIMS)},   # after grass so no existing row moves
}

def frame_svg(inner, vb):
    x, y, w, h = map(float, vb.split())
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}">{defs()}{inner}</svg>'

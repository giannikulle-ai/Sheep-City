// The prototype's `draw()`, ported layer by layer. Order, as in the prototype:
//   1. background by phase and snow, crossfaded near a phase boundary   (world)
//   2. ground stamps: mud patches, snow footprints                        (world)
//   3. actors into an offscreen sprite canvas, sorted by foot y:
//      tufts, barn peekers, sheep and lambs, DL, rabbit, upgrades, NPCs,
//      stick, butterflies, bird                                           (sprites)
//   4. name tags                                                          (ui)
//   5. phase / rain tint multiplied onto the sprites, rain wash on the world
//   6. sprites composited onto the world
//   7. weather: rain streaks, snowflakes, cold breath, season wash, fireflies
//   8. HUD                                                                (ui)
import { backgroundKey, isSnowy, phaseMix, tintAt, type BackgroundKey } from './phase';
import type { Sheet } from './sheet';
import { ICON, woolLevel, type FarmView, type SheepView } from './state';
import type { Tag } from './ui';
import { drawHud, drawTags } from './ui';
import {
  RAIN_WASH,
  drawBreath,
  drawFireflies,
  drawRain,
  drawSeasonWash,
  drawSnow,
  seasonWash,
} from './weather';

export const WORLD_W = 640;
export const WORLD_H = 400;

export type Backgrounds = Record<BackgroundKey, CanvasImageSource>;

interface Layer {
  z: number;
  f: () => void;
}

/** Snow cap pixel offsets on a sheep's back and on DL's back, from the prototype. */
const SHEEP_CAP: ReadonlyArray<readonly [number, number]> = [[9, 2], [12, 1], [15, 1], [18, 2], [11, 3], [16, 3]];
const LUNA_CAP: ReadonlyArray<readonly [number, number]> = [[15, 1], [19, 0], [23, 1], [17, 2], [21, 2]];

/** Which sheep animation plays, from the flags draw() looks at. `frame` null means animate. */
export function sheepAnim(
  s: SheepView,
  night: boolean,
  rain: boolean,
  now: number,
): { anim: string; frame: number | null } {
  if (s.resting || ((night || rain) && !s.moving && !s.eating)) return { anim: 'rest', frame: null };
  if (s.moving) return { anim: 'trot', frame: null };
  if (s.eating) return { anim: 'graze', frame: null };
  if (Math.floor(now / 9000 + s.t0) % 3 === 0) return { anim: 'graze', frame: null };
  return { anim: 'wool', frame: woolLevel(s.wool) };
}

/** DL's drawn animation: `run` becomes `bound` in deep summer grass, `trundle` in snow. */
export function lunaAnim(anim: string, snowy: boolean, summer: boolean, forced: boolean): string {
  const deep = snowy || (summer && !snowy);
  if ((deep || forced) && anim === 'run') return snowy ? 'trundle' : 'bound';
  return anim;
}

/** Barn doorway peek slots: three sheep heads, or two beside DL. */
export function peekSlots(lunaInBarn: boolean): ReadonlyArray<readonly [number, number]> {
  return lunaInBarn
    ? [
        [300, 44],
        [318, 43],
      ]
    : [
        [301, 52],
        [313, 55],
        [324, 52],
      ];
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class FarmRenderer {
  private readonly spr: HTMLCanvasElement;
  private readonly sc: CanvasRenderingContext2D;
  private readonly mask: HTMLCanvasElement;
  private readonly mc: CanvasRenderingContext2D;

  constructor(
    public readonly sheet: Sheet,
    public readonly backgrounds: Backgrounds,
    public readonly W = WORLD_W,
    public readonly H = WORLD_H,
  ) {
    this.spr = makeCanvas(W, H);
    this.mask = makeCanvas(W, H);
    const sc = this.spr.getContext('2d');
    const mc = this.mask.getContext('2d');
    if (!sc || !mc) throw new Error('render: no 2d context for offscreen canvases');
    sc.imageSmoothingEnabled = false;
    this.sc = sc;
    this.mc = mc;
  }

  /**
   * Draw one frame. `wc` is the native-pixel world canvas; `uc` the full-resolution
   * UI canvas (or null to skip tags and HUD). `now` is the render clock in ms.
   */
  render(
    wc: CanvasRenderingContext2D,
    uc: CanvasRenderingContext2D | null,
    view: FarmView,
    now: number,
  ): void {
    const { W, H, sc, sheet } = this;
    const meta = sheet.meta;
    const { phase, mixTo, mix } = phaseMix(view.clockT);
    const night = phase === 'night';
    const rain = view.weather === 'rain';
    const snowy = isSnowy(view.weather, view.season, view.liveWeather);

    // 1. background, crossfaded near a boundary
    wc.imageSmoothingEnabled = false;
    wc.clearRect(0, 0, W, H);
    wc.drawImage(this.backgrounds[backgroundKey(phase, snowy)], 0, 0);
    if (mixTo && mix > 0) {
      wc.globalAlpha = Math.min(1, mix);
      wc.drawImage(this.backgrounds[backgroundKey(mixTo, snowy)], 0, 0);
      wc.globalAlpha = 1;
    }

    // 2. ground stamps
    for (const m of view.mud) {
      const age = (now - m.t) / (rain ? 600000 : 240000);
      wc.fillStyle = `rgba(112,82,50,${(0.55 * (1 - age)).toFixed(2)})`;
      wc.beginPath();
      wc.ellipse(Math.round(m.x), Math.round(m.y), m.r, m.r * 0.55, 0, 0, Math.PI * 2);
      wc.fill();
    }
    if (snowy) {
      wc.fillStyle = 'rgb(128,146,178)';
      for (const p of view.prints) {
        const a = 1 - (now - p.t) / 150000;
        if (a <= 0) continue;
        wc.globalAlpha = a;
        wc.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      wc.globalAlpha = 1;
    }

    const tintNow = tintAt(view.clockT);
    sc.clearRect(0, 0, W, H);
    let k = 1;
    if (uc) {
      k = uc.canvas.width / W;
      uc.clearRect(0, 0, uc.canvas.width, uc.canvas.height);
    }

    // 3. actors, sorted by foot y
    const list: Layer[] = [];
    const tags: Tag[] = [];
    const draw = sheet.drawSprite.bind(sheet, sc);
    const frameAt = sheet.frameAt.bind(sheet);
    const SW = meta.sprites['sheep']?.w ?? 32;
    const SH = meta.sprites['sheep']?.h ?? 27;
    const LW = meta.sprites['digital_luna']?.w ?? 44;
    const LH = meta.sprites['digital_luna']?.h ?? 40;
    const GW = meta.sprites['grass']?.w ?? 34;
    const GH = meta.sprites['grass']?.h ?? 29;
    const NPC_H = meta.sprites['farmer']?.h ?? 21;
    const LAMB_H = meta.sprites['lamb']?.h ?? 16;
    const RH = meta.sprites['ride']?.h ?? 48;
    const iconMeta = meta.sprites['icon'];
    const drawIcon = (name: keyof typeof ICON, cx: number, top: number): void => {
      if (!iconMeta) return;
      const bob = Math.floor(now / 400) % 2;
      draw('icon', 'all', ICON[name], cx - iconMeta.w / 2, top - iconMeta.h - 4 - bob, false, false);
    };

    const wind = rain ? 1.6 : 0.7;
    for (const t of view.tufts) {
      const fr = Math.min(3, Math.floor(t.level * 3.99));
      const sway = Math.round(Math.sin(now / 700 + t.x * 0.05) * wind);
      list.push({ z: t.y, f: () => draw('grass', 'grow', fr, t.x - GW / 2 + sway, t.y - GH + 4, false, false) });
    }

    const luna = view.luna;
    const inBarnSheep = view.sheep.filter((s) => s.inBarn);
    const slots = peekSlots(luna.inBarn);
    inBarnSheep.slice(0, slots.length).forEach((s, i) => {
      const slot = slots[i];
      if (!slot) return;
      const [px, py] = slot;
      list.push({
        z: 60 + i,
        f: () => draw('peek', 'look', frameAt('peek', 'look', now + s.t0), px, py, i === slots.length - 1, false),
      });
      if (now < s.tagUntil) tags.push([s.name, 316, 30 - i * 2, s.color]);
    });
    if (luna.inBarn) {
      list.push({ z: 66, f: () => draw('dl_peek', 'look', frameAt('dl_peek', 'look', now), 304, 48, false, false) });
    }

    for (const s of view.sheep) {
      if (s.inBarn) continue;
      if (s.ridden && luna.riding) {
        list.push({
          z: s.y + SH,
          f: () => draw('ride', 'go', frameAt('ride', 'go', now), s.x - 4, s.y + SH - RH, s.dir < 0),
        });
        if (now < s.tagUntil) tags.push([s.name, s.x + SW / 2, s.y + SH - RH + 22, s.color]);
        continue;
      }
      const { anim, frame } = sheepAnim(s, night, rain, now);
      const showIcon = s.icon && now < s.iconUntil ? s.icon : null;
      list.push({
        z: s.y + SH,
        f: () => {
          if (s.wet > 0.3) sc.filter = `brightness(${(1 - 0.28 * s.wet).toFixed(2)}) saturate(.85)`;
          draw('sheep', anim, frame ?? frameAt('sheep', anim, now + s.t0), s.x, s.y, s.dir < 0);
          sc.filter = 'none';
          if (s.wet > 0.5 && Math.floor((now + s.t0) / 700) % 3 === 0) {
            sc.fillStyle = '#9fc4ea';
            sc.fillRect(
              Math.round(s.x + 10 + ((now + s.t0) % 700) / 100),
              Math.round(s.y + SH - 6 + ((now + s.t0) % 700) / 140),
              1,
              2,
            );
          }
          if (s.snow > 0.4 && anim !== 'rest') {
            sc.fillStyle = '#d9e6f6';
            for (const [ox, oy] of SHEEP_CAP) {
              sc.fillRect(Math.round(s.x + (s.dir < 0 ? SW - ox : ox)), Math.round(s.y + oy), 2, 1);
            }
          }
          if (showIcon) drawIcon(showIcon, s.x + SW / 2, s.y - 2);
        },
      });
      if (now < s.tagUntil) tags.push([s.name, s.x + SW / 2, s.y + 4 - (showIcon ? 14 : 0), s.color]);
      for (const l of s.lambs) {
        list.push({
          z: l.y + LAMB_H,
          f: () => draw('lamb', 'walk', frameAt('lamb', 'walk', now + l.t0), l.x, l.y, l.dir < 0),
        });
      }
    }

    if (!luna.inBarn && !luna.riding) {
      const lanim = lunaAnim(luna.anim, snowy, view.season === 'summer', now < luna.forceBound);
      list.push({
        z: luna.y + LH,
        f: () => {
          if (luna.wet > 0.3) sc.filter = `brightness(${(1 - 0.25 * luna.wet).toFixed(2)})`;
          draw('digital_luna', lanim, frameAt('digital_luna', lanim, now), luna.x, luna.y, luna.dir < 0);
          sc.filter = 'none';
          if (luna.snow > 0.4 && luna.anim !== 'sleep' && luna.anim !== 'flop') {
            sc.fillStyle = '#f4f7fb';
            for (const [ox, oy] of LUNA_CAP) {
              sc.fillRect(Math.round(luna.x + (luna.dir < 0 ? LW - ox : ox)), Math.round(luna.y + oy), 2, 1);
            }
          }
          if (luna.icon) drawIcon(luna.icon, luna.x + LW / 2, luna.y - 2);
        },
      });
      if (now < luna.tagUntil) tags.push(['Digital Luna', luna.x + LW / 2, luna.y + 2 - (luna.icon ? 14 : 0), '#d33a2f']);
    }

    const rabbit = view.rabbit;
    if (rabbit) list.push({ z: rabbit.y + 30, f: () => draw('rabbit', 'hop', frameAt('rabbit', 'hop', now), rabbit.x, rabbit.y) });
    if (view.owned.includes('flowerbed')) list.push({ z: 236, f: () => draw('upgrade', 'flowerbed', 0, 176, 231, false, false) });
    // hay2 has no art in the sheet yet; the prototype's draw for it is an empty stub.
    if (view.owned.includes('scarecrow')) list.push({ z: 300, f: () => draw('upgrade', 'scarecrow', 0, 420, 286, false, false) });

    for (const [spr, n] of [['farmer', view.farmer], ['merchant', view.merchant]] as const) {
      if (!n) continue;
      list.push({
        z: n.y + NPC_H,
        f: () => {
          draw(spr, n.anim, frameAt(spr, n.anim, now), n.x, n.y, n.dir < 0);
          if (n.icon && now < n.iconUntil) drawIcon(n.icon, n.x + 8, n.y - 2);
        },
      });
      if (n.cart) {
        list.push({
          z: n.y + NPC_H - 1,
          f: () => draw('cart', 'lay', 0, n.x + (n.dir < 0 ? 14 : -26), n.y + 6, n.dir > 0, false),
        });
      }
    }

    const stick = view.stick;
    if (stick) list.push({ z: stick.y, f: () => draw('stick', 'lay', 0, stick.x - 6, stick.y - 2, false, false) });
    for (const b of view.butterflies) {
      list.push({ z: 9999, f: () => draw('butterfly', 'flap', frameAt('butterfly', 'flap', now + b.p * 1000), b.x, b.y, false, false) });
    }
    const bird = view.bird;
    if (bird) {
      const banim = bird.state === 'sit' ? 'sit' : 'fly';
      list.push({ z: 9998, f: () => draw('bird', banim, frameAt('bird', banim, now), bird.x, bird.y, bird.state === 'in', false) });
    }

    list.sort((a, b) => a.z - b.z).forEach((o) => o.f());

    // 4. name tags on the UI layer
    if (uc) drawTags(uc, tags, k);

    // 5. tint the sprites by phase (and rain), keeping their alpha via the mask
    if (phase !== 'day' || rain || mixTo) {
      const f: [number, number, number] = rain
        ? [tintNow[0] * 0.78, tintNow[1] * 0.82, tintNow[2] * 0.92]
        : tintNow;
      this.mc.clearRect(0, 0, W, H);
      this.mc.drawImage(this.spr, 0, 0);
      sc.globalCompositeOperation = 'multiply';
      sc.fillStyle = `rgb(${(f[0] * 255) | 0},${(f[1] * 255) | 0},${(f[2] * 255) | 0})`;
      sc.fillRect(0, 0, W, H);
      sc.globalCompositeOperation = 'destination-in';
      sc.drawImage(this.mask, 0, 0);
      sc.globalCompositeOperation = 'source-over';
      if (rain) {
        wc.fillStyle = RAIN_WASH;
        wc.fillRect(0, 0, W, H);
      }
    }

    // 6. composite
    wc.drawImage(this.spr, 0, 0);

    // 7. weather and atmosphere
    if (rain) drawRain(wc, W, H, now);
    if (view.weather === 'snow') drawSnow(wc, W, H, now);
    if (view.temp < 3) drawBreath(wc, view, now, SW, LW);
    const wash = seasonWash(view.season, snowy);
    if (wash) drawSeasonWash(wc, W, H, wash);
    if ((night || phase === 'dusk') && !rain) drawFireflies(wc, view, night);

    // 8. HUD
    if (uc) drawHud(uc, view, phase, k);
  }
}

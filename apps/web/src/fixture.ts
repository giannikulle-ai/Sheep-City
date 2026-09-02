// A frozen farm: the state the renderer draws until the sim lane lands.
// Every position is a literal or a fixed formula, so a given (params, now)
// always produces the same picture. No behaviour lives here.
import type {
  ButterflyView,
  FarmView,
  FireflyView,
  LunaView,
  MudPatch,
  SheepView,
  SnowPrint,
  Tuft,
} from '@sheepcliff/render';
import type { SceneParams } from './query';

/** Sheep sprite size and foot offset, as the prototype's SW/SH/SFOOT. */
const SW = 32;
const SH = 27;
const SFOOT = [SW * 0.5, SH - 2] as const;
const LW = 44;
const LH = 40;
const LFOOT = [LW * 0.5, LH - 2] as const;

const BARN = { x0: 268, x1: 388, y0: 0, y1: 76 };
function inBarn(x: number, y: number): boolean {
  return x > BARN.x0 && x < BARN.x1 && y > BARN.y0 && y < BARN.y1;
}

/** The prototype's NAMES and COLORS, in order. */
export const NAMES = ['Clover', 'Daisy', 'Biscuit', 'Pepper', 'Maple'] as const;
export const COLORS = ['#3a7bd5', '#e0a52c', '#2fa07a', '#7c4dbf', '#e0602c'] as const;

/** Fence post tops and flower spots the prototype's small life uses. */
const POSTS = [[168, 108], [222, 82], [452, 104], [516, 136]] as const;
const FLOWERS = [[120, 240], [400, 312], [500, 224], [280, 184]] as const;

interface SheepSpec {
  foot: readonly [number, number];
  dir: 1 | -1;
  wool: number;
  t0: number;
  resting?: boolean;
  moving?: boolean;
  eating?: boolean;
  lamb?: readonly [number, number];
}

const SHEEP: readonly SheepSpec[] = [
  { foot: [150, 250], dir: 1, wool: 0.9, t0: 0 },
  { foot: [250, 300], dir: -1, wool: 0.55, t0: 1300, eating: true },
  { foot: [420, 180], dir: -1, wool: 0.2, t0: 2600, moving: true },
  { foot: [470, 270], dir: 1, wool: 0.7, t0: 700, resting: true },
  { foot: [330, 332], dir: 1, wool: 0.45, t0: 3100, lamb: [362, 336] },
];

/** The prototype's tuft ring, with the random jitter replaced by a fixed pattern. */
export function fixtureTufts(): Tuft[] {
  const inset = 0.78;
  const corners = (
    [
      [320, 44],
      [624, 208],
      [320, 372],
      [16, 208],
    ] as const
  ).map(([x, y]) => [320 + (x - 320) * inset, 208 + (y - 208) * inset] as const);
  const out: Tuft[] = [];
  for (let e = 0; e < 4; e++) {
    const a = corners[e];
    const b = corners[(e + 1) % 4];
    if (!a || !b) continue;
    for (let i = 1; i < 9; i++) {
      const t = i / 9;
      const x = a[0] + (b[0] - a[0]) * t + (((i * 3 + e) % 5) - 2) * 2;
      const y = a[1] + (b[1] - a[1]) * t + (((i * 2 + e) % 3) - 1) * 2;
      if (inBarn(x, y) || inBarn(x, y - 10) || (e === 1 && t > 0.15 && t < 0.55)) continue;
      out.push({ x, y, level: 0.4 + (((i * 7 + e * 3) % 10) / 10) * 0.6 });
    }
  }
  const free: ReadonlyArray<readonly [number, number, number]> = [
    [200, 190, 0.9],
    [380, 250, 0.3],
    [300, 260, 0.65],
    [440, 230, 1],
    [180, 300, 0.5],
    [540, 270, 0.8],
  ];
  for (const [x, y, level] of free) out.push({ x, y, level });
  return out;
}

function fixtureFireflies(): FireflyView[] {
  const pts: ReadonlyArray<readonly [number, number]> = [
    [140, 220], [210, 260], [260, 190], [330, 240], [390, 300], [450, 210], [520, 260],
    [180, 330], [300, 320], [420, 340], [560, 300], [110, 270], [240, 350], [480, 170],
  ];
  return pts.map(([x, y], i) => ({ x, y, p: (i * 1.7) % 6 }));
}

function fixtureButterflies(): ButterflyView[] {
  return [
    { x: FLOWERS[0][0], y: FLOWERS[0][1], p: 1 },
    { x: FLOWERS[1][0] + 4, y: FLOWERS[1][1] - 6, p: 3.5 },
  ];
}

/** Snow footprints: a trail from the gate to the trough, freshest last. */
function fixturePrints(now: number): SnowPrint[] {
  const out: SnowPrint[] = [];
  for (let i = 0; i < 40; i++) {
    const t = i / 39;
    out.push({
      x: 500 - 340 * t + (i % 2 ? -3 : 3),
      y: 262 - 46 * t,
      t: now - 120000 + i * 2800,
    });
  }
  return out;
}

/** Mud patches in the rain: a ring of steps near the trough. */
function fixtureMud(now: number): MudPatch[] {
  const out: MudPatch[] = [];
  for (let i = 0; i < 18; i++) {
    out.push({
      x: 170 + i * 9,
      y: 230 + Math.sin(i * 0.8) * 10,
      t: now - 200000 + i * 8000,
      r: 3 + (i % 4),
    });
  }
  return out;
}

export function buildFixture(p: SceneParams, now: number): FarmView {
  const rain = p.weather === 'rain';
  const snow = p.weather === 'snow';
  const sheep: SheepView[] = SHEEP.map((s, i) => {
    // in rain the two flock members nearest the barn have already gone in
    const inBarn = rain && (i === 2 || i === 3);
    return {
      name: NAMES[i] ?? `Sheep ${i}`,
      color: COLORS[i] ?? '#ffffff',
      x: s.foot[0] - SFOOT[0],
      y: s.foot[1] - SFOOT[1],
      dir: s.dir,
      t0: s.t0,
      wool: s.wool,
      resting: s.resting ?? false,
      moving: s.moving ?? false,
      eating: s.eating ?? false,
      inBarn,
      wet: rain ? 0.8 : 0,
      snow: snow ? 0.7 : 0,
      icon: i === 0 ? 'heart' : null,
      iconUntil: now + 1e9,
      // the first sheep keeps its tag up so the UI layer is visible
      tagUntil: i === 0 || inBarn ? now + 1e9 : 0,
      lambs: s.lamb ? [{ x: s.lamb[0] - 10, y: s.lamb[1] - 14, dir: -1, t0: 900 }] : [],
      ridden: false,
    };
  });

  const luna: LunaView = rain
    ? // waiting by the barn door for the flock, as the rain shepherd does
      { x: 318 - LFOOT[0], y: 96 - LFOOT[1], dir: -1, anim: 'sit', inBarn: false, riding: false, wet: 0.6, snow: 0, icon: null, tagUntil: now + 1e9, forceBound: 0 }
    : { x: 120, y: 280, dir: 1, anim: 'sit', inBarn: false, riding: false, wet: 0, snow: snow ? 0.7 : 0, icon: null, tagUntil: now + 1e9, forceBound: 0 };

  return {
    clockT: p.t,
    weather: p.weather,
    temp: p.temp,
    season: p.season,
    liveWeather: p.liveWeather,
    sheep,
    luna,
    rabbit: rain ? null : { x: 560, y: 250 },
    bird: rain ? null : { x: POSTS[0][0] - 4, y: POSTS[0][1] - 6, state: 'sit' },
    butterflies: rain || snow ? [] : fixtureButterflies(),
    fireflies: fixtureFireflies(),
    tufts: fixtureTufts(),
    mud: rain ? fixtureMud(now) : [],
    prints: snow ? fixturePrints(now) : [],
    farmer: { x: 240 - 8, y: 146 - 20, dir: -1, anim: 'work', icon: null, iconUntil: 0, cart: false },
    merchant: { x: 506 - 8 + 20, y: 262 - 20, dir: -1, anim: 'walk', icon: 'coin', iconUntil: now + 1e9, cart: true },
    stick: null,
    owned: ['flowerbed', 'scarecrow'],
    woolBank: 3,
    coins: 12,
  };
}

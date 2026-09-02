// The slice of world state the renderer reads. This is a *view*: the sim lane
// owns the real state type and maps to this shape (or the client adapts it).
// Field names follow the prototype's entities so `draw()` ports line for line.
// Nothing in here is sim logic; it is only what the prototype's draw() looked at.

export type Phase = 'day' | 'dusk' | 'night' | 'dawn';
export type Weather = 'sun' | 'rain' | 'snow';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Bubble icons: frame index into the `icon` sprite's `all` row, as the prototype's ICON map. */
export const ICON = { shears: 4, bang: 5, heart: 8, coin: 9 } as const;
export type IconName = keyof typeof ICON;

export interface Tuft {
  x: number;
  y: number;
  /** 0..1 how tall the tuft is; picks one of the four `grass.grow` frames. */
  level: number;
}

/** A mud patch stamped by a foot in rain; fades over minutes. */
export interface MudPatch {
  x: number;
  y: number;
  /** ms timestamp on the render clock when it was stamped. */
  t: number;
  r: number;
}

/** A footprint in snow; fades over 150 s. */
export interface SnowPrint {
  x: number;
  y: number;
  t: number;
}

export interface LambView {
  x: number;
  y: number;
  dir: 1 | -1;
  /** per-entity animation phase offset in ms */
  t0: number;
}

export interface SheepView {
  name: string;
  /** name tag swatch colour */
  color: string;
  /** sprite top-left in world px */
  x: number;
  y: number;
  dir: 1 | -1;
  t0: number;
  /** wool 0..1; picks `wool` frame 0/1/2 via woolLevel */
  wool: number;
  resting: boolean;
  /** true when the sheep has a walk target (prototype: `s.tx !== null`) */
  moving: boolean;
  eating: boolean;
  inBarn: boolean;
  /** 0..1 wetness from rain; darkens the sprite and drips above .5 */
  wet: number;
  /** 0..1 snow cap; draws flakes on the back above .4 */
  snow: number;
  icon: IconName | null;
  iconUntil: number;
  tagUntil: number;
  lambs: LambView[];
  /** true when DL is riding this sheep; draws the `ride` sprite instead */
  ridden: boolean;
}

export interface LunaView {
  x: number;
  y: number;
  dir: 1 | -1;
  /** animation name in the `digital_luna` sprite */
  anim: string;
  inBarn: boolean;
  /** true while riding a sheep: the sheep draws the pair */
  riding: boolean;
  wet: number;
  snow: number;
  icon: IconName | null;
  tagUntil: number;
  /** until this render-clock ms, `run` draws as `bound` */
  forceBound: number;
}

export interface NpcView {
  x: number;
  y: number;
  dir: 1 | -1;
  anim: 'walk' | 'work';
  icon: IconName | null;
  iconUntil: number;
  /** merchant pulls a cart */
  cart: boolean;
}

export interface SmallLife {
  x: number;
  y: number;
}

export interface BirdView extends SmallLife {
  state: 'sit' | 'in' | 'out';
}

export interface ButterflyView extends SmallLife {
  /** animation phase offset in seconds */
  p: number;
}

export interface FireflyView extends SmallLife {
  /** flicker phase */
  p: number;
}

export interface StickView {
  x: number;
  y: number;
}

/** Everything `draw()` reads, at one instant. */
export interface FarmView {
  /** clock position 0..1: day, dusk, night, dawn (see phaseOf) */
  clockT: number;
  weather: Weather;
  /** degrees C; below 3 shows breath puffs */
  temp: number;
  season: Season;
  /** live-location weather mode: winter no longer forces snow on the ground */
  liveWeather: boolean;
  sheep: SheepView[];
  luna: LunaView;
  rabbit: SmallLife | null;
  bird: BirdView | null;
  butterflies: ButterflyView[];
  fireflies: FireflyView[];
  tufts: Tuft[];
  mud: MudPatch[];
  prints: SnowPrint[];
  farmer: NpcView | null;
  merchant: NpcView | null;
  /** a thrown stick lying on the grass while DL runs out for it */
  stick: StickView | null;
  /** bought upgrades: flowerbed, hay2, scarecrow */
  owned: string[];
  woolBank: number;
  coins: number;
}

/** `woolLevel` from farm.js: which of the three wool frames a fleece shows. */
export function woolLevel(wool: number): 0 | 1 | 2 {
  return wool < 0.33 ? 0 : wool < 0.8 ? 1 : 2;
}

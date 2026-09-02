// Tap hit testing, in the prototype's order: Digital Luna first, then sheep, then grass. The
// client only decides *what was tapped*; whether DL fetches or a sheep gets shorn is the sim's.
// The one presentation fact used here: a fleece drawn with the overgrown frame is tapped to
// shear, otherwise to pet (the prototype's `wool >= shearReadyAt` is the same threshold as the
// renderer's third wool frame).
import { insideField } from '@sheepcliff/sim';
import { woolLevel, type FarmView } from '@sheepcliff/render';
import { sheepId, type ClientIntent } from './intents';

export interface Size {
  w: number;
  h: number;
}

export interface SpriteSizes {
  sheep: Size;
  luna: Size;
}

export type Hit =
  | { kind: 'luna' }
  | { kind: 'sheep'; index: number }
  | { kind: 'grass'; x: number; y: number }
  | { kind: 'none' };

const inRect = (px: number, py: number, x: number, y: number, s: Size): boolean =>
  px > x && px < x + s.w && py > y && py < y + s.h;

export function hitTest(view: FarmView, wx: number, wy: number, sizes: SpriteSizes): Hit {
  const l = view.luna;
  if (!l.inBarn && !l.riding && inRect(wx, wy, l.x, l.y, sizes.luna)) return { kind: 'luna' };
  for (let i = 0; i < view.sheep.length; i++) {
    const s = view.sheep[i];
    if (!s || s.inBarn) continue;
    if (inRect(wx, wy, s.x, s.y, sizes.sheep)) return { kind: 'sheep', index: i };
  }
  if (insideField(wx, wy, 0.95)) return { kind: 'grass', x: wx, y: wy };
  return { kind: 'none' };
}

/** The verb a tap means, or null when it landed on nothing. */
export function tapIntent(view: FarmView, hit: Hit): ClientIntent | null {
  switch (hit.kind) {
    case 'luna':
      return { type: 'pet', target: 'luna' };
    case 'sheep': {
      const s = view.sheep[hit.index];
      const overgrown = s !== undefined && woolLevel(s.wool) === 2;
      return overgrown ? { type: 'shear', target: sheepId(hit.index) } : { type: 'pet', target: sheepId(hit.index) };
    }
    case 'grass':
      return { type: 'throwStick', x: hit.x, y: hit.y };
    case 'none':
      return null;
  }
}

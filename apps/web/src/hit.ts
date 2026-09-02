// Which chip a tap should highlight in the tray, in the prototype's order: Digital Luna first,
// then sheep. The tap itself goes to the sim as a `click` at the world point, and the sim decides
// what was hit and whether a sheep is petted or shorn (its `shearReadyAt` rule); this hit test
// only follows the tap in the tray and never decides the verb.
import { insideField } from '@sheepcliff/sim';
import type { FarmView } from '@sheepcliff/render';

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

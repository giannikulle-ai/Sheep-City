// Layout for the throwaway hello-canvas page. Pure so it can be unit tested.

export const SCENE = {
  /** Native canvas size in sheet pixels. CSS scales it up 4x. */
  width: 96,
  height: 64,
  /** Row the sheep's feet stand on. Every frame is bottom-trimmed to touch it. */
  groundY: 56,
  /** Colours are palette entries from the prototype sheet; nothing new. */
  sky: '#6f8fa6',
  grass: '#6fb35c',
} as const;

/** Top-left to draw a sprite of `w`x`h` so its feet sit on the ground line, centred. */
export function standOnGround(w: number, h: number): { x: number; y: number } {
  return {
    x: Math.floor((SCENE.width - w) / 2),
    y: SCENE.groundY - h,
  };
}

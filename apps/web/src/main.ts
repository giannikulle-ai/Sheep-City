// Hello canvas: draw one frame of the sheep "graze" animation from the frozen
// v31 prototype sheet at native pixel scale. Throwaway page; proves the pipeline.
import { drawFrame, type SheetMeta } from '@sheepcliff/render';
import sheetUrl from '../../../prototype/luna-farm/build/spritesheet.png';
import sheetMeta from '../../../prototype/luna-farm/build/spritesheet.json';
import { SCENE, standOnGround } from './scene';

const meta = sheetMeta as SheetMeta;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

async function main(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const status = document.getElementById('status');
  if (!canvas) throw new Error('no #scene canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  const sheet = await loadImage(sheetUrl);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = SCENE.sky;
  ctx.fillRect(0, 0, SCENE.width, SCENE.height);
  ctx.fillStyle = SCENE.grass;
  ctx.fillRect(0, SCENE.groundY, SCENE.width, SCENE.height - SCENE.groundY);

  const sheep = meta.sprites['sheep'];
  if (!sheep) throw new Error('sheet has no sheep sprite');
  const at = standOnGround(sheep.w, sheep.h);
  drawFrame(ctx, sheet, meta, 'sheep', 'graze', 0, at.x, at.y);

  if (status) status.textContent = 'sheep · graze · frame 0 · native 96×64, CSS 4×';
  document.body.dataset['ready'] = '1';
}

main().catch((err: unknown) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `error: ${String(err)}`;
  document.body.dataset['error'] = String(err);
  console.error(err);
});

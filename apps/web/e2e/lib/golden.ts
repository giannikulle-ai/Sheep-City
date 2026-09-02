// Golden-screenshot plumbing shared by the prototype and app drivers.
//
// Goldens are PNGs of the world canvas at native resolution, taken with a
// deterministic clock and RNG, and compared pixel by pixel inside the browser
// (Chromium decodes the PNG; no extra dependency). A pixel differs when any
// channel is further than CHANNEL_THRESHOLD from the golden; the test fails
// when more than MAX_DIFF_RATIO of pixels differ. That is tight enough to catch
// a missing sheep (a 32x27 frame is about 0.3% of the 640x400 canvas) and a
// wrong tint (every pixel), loose enough to forgive antialiasing drift.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';

export const PHASES = ['dawn', 'noon', 'dusk', 'night'] as const;
export const WEATHERS = ['sun', 'snow'] as const;
export type Phase = (typeof PHASES)[number];
export type Weather = (typeof WEATHERS)[number];
export type Target = 'prototype' | 'app';

export const CHANNEL_THRESHOLD = 20;
export const MAX_DIFF_RATIO = 0.002;

export const e2eDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const repoRoot = path.resolve(e2eDir, '..', '..', '..');

export function goldenTarget(): Target {
  const t = process.env['SHEEPCLIFF_GOLDEN_TARGET'] ?? 'prototype';
  if (t !== 'prototype' && t !== 'app') throw new Error(`SHEEPCLIFF_GOLDEN_TARGET must be prototype or app, got ${t}`);
  return t;
}

export const updatingGoldens = (): boolean => process.env['SHEEPCLIFF_GOLDEN_UPDATE'] === '1';

export function goldenPath(target: Target, phase: Phase, weather: Weather): string {
  return path.join(e2eDir, 'golden', target, `${phase}-${weather}.png`);
}

export interface Driver {
  /** Load the page with a fixed seed and a virtual clock; nothing runs until stepped. */
  open(page: Page, seed: number): Promise<void>;
  /** Put the world at the phase and weather, run `frames` deterministic frames, and return the world canvas as a PNG data URL. */
  capture(page: Page, phase: Phase, weather: Weather, frames: number): Promise<string>;
}

export interface CompareResult {
  width: number;
  height: number;
  total: number;
  differing: number;
  maxDelta: number;
  diffPng: string;
}

const dataUrlToBuffer = (url: string): Buffer => Buffer.from(url.replace(/^data:image\/png;base64,/, ''), 'base64');
const bufferToDataUrl = (buf: Buffer): string => `data:image/png;base64,${buf.toString('base64')}`;

/** Compare two PNG data URLs in the page. Produces a diff image with differing pixels in red. */
export async function comparePng(page: Page, actual: string, golden: string, threshold: number): Promise<CompareResult> {
  return page.evaluate(
    async ([a, g, th]) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('png decode failed'));
          img.src = src;
        });
      const [ia, ig] = await Promise.all([load(a), load(g)]);
      const w = Math.max(ia.width, ig.width);
      const h = Math.max(ia.height, ig.height);
      const pixels = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, w, h).data;
      };
      const pa = pixels(ia);
      const pg = pixels(ig);
      const diff = document.createElement('canvas');
      diff.width = w;
      diff.height = h;
      const dctx = diff.getContext('2d');
      if (!dctx) throw new Error('no 2d context');
      const out = dctx.createImageData(w, h);
      let differing = 0;
      let maxDelta = 0;
      const sizeMismatch = ia.width !== ig.width || ia.height !== ig.height;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.max(
          Math.abs((pa[i] ?? 0) - (pg[i] ?? 0)),
          Math.abs((pa[i + 1] ?? 0) - (pg[i + 1] ?? 0)),
          Math.abs((pa[i + 2] ?? 0) - (pg[i + 2] ?? 0)),
          Math.abs((pa[i + 3] ?? 0) - (pg[i + 3] ?? 0)),
        );
        if (d > maxDelta) maxDelta = d;
        const bad = d > th;
        if (bad) differing++;
        // faded actual underneath, red where it differs
        const lum = Math.round(((pa[i] ?? 0) + (pa[i + 1] ?? 0) + (pa[i + 2] ?? 0)) / 3);
        out.data[i] = bad ? 255 : lum;
        out.data[i + 1] = bad ? 0 : lum;
        out.data[i + 2] = bad ? 0 : lum;
        out.data[i + 3] = 255;
      }
      dctx.putImageData(out, 0, 0);
      return { width: w, height: h, total: w * h, differing: sizeMismatch ? w * h : differing, maxDelta, diffPng: diff.toDataURL('image/png') };
    },
    [actual, golden, threshold] as const,
  );
}

/**
 * Check one capture against its committed golden. In update mode the golden
 * is (re)written and the check passes; a changed golden must be explained in
 * the PR. Without update mode a missing golden fails with instructions.
 */
export async function expectGolden(page: Page, testInfo: TestInfo, actualDataUrl: string, file: string): Promise<void> {
  const rel = path.relative(repoRoot, file);
  if (updatingGoldens()) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, dataUrlToBuffer(actualDataUrl));
    testInfo.annotations.push({ type: 'golden', description: `wrote ${rel}` });
    return;
  }
  if (!existsSync(file)) {
    await testInfo.attach('actual', { body: dataUrlToBuffer(actualDataUrl), contentType: 'image/png' });
    throw new Error(`missing golden ${rel}; run \`npm run golden:update -w apps/web\` and commit the PNG (say why in the PR)`);
  }
  const golden = bufferToDataUrl(readFileSync(file));
  const r = await comparePng(page, actualDataUrl, golden, CHANNEL_THRESHOLD);
  const ratio = r.differing / r.total;
  if (ratio > MAX_DIFF_RATIO) {
    await testInfo.attach('actual', { body: dataUrlToBuffer(actualDataUrl), contentType: 'image/png' });
    await testInfo.attach('expected', { body: dataUrlToBuffer(golden), contentType: 'image/png' });
    await testInfo.attach('diff', { body: dataUrlToBuffer(r.diffPng), contentType: 'image/png' });
    throw new Error(
      `${rel}: ${r.differing} of ${r.total} pixels differ (${(ratio * 100).toFixed(3)}%, max channel delta ${r.maxDelta}); ` +
        `tolerance is ${(MAX_DIFF_RATIO * 100).toFixed(2)}% at channel threshold ${CHANNEL_THRESHOLD}. ` +
        `If the change is intended, run \`npm run golden:update -w apps/web\` and say why in the PR.`,
    );
  }
  testInfo.annotations.push({ type: 'golden', description: `${rel}: ${r.differing} px differ (max delta ${r.maxDelta})` });
}

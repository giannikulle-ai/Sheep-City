// Persistence and offline catch-up, the pure part. The sim's save document (packages/sim/src/save)
// is wrapped in a small client envelope that also records the wall clock at the time of saving,
// so the next load knows how long the farm was left alone. The DOM side (localStorage, the
// visibilitychange hook, the export modal) is in main.ts.
import { hudText, phaseOf as renderPhase, type FarmView } from '@sheepcliff/render';
import { fromSave, SaveError, step, toSave, type SaveDoc, type SimState } from '@sheepcliff/sim';

export const SAVE_KEY = 'sheepcliff-save';
export const ENVELOPE_FORMAT = 'sheepcliff-web-save';

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  /** wall clock (Date.now()) when the world was saved */
  savedAt: number;
  save: SaveDoc;
}

export function envelope(sim: SimState, savedAt: number): Envelope {
  return { format: ENVELOPE_FORMAT, savedAt, save: toSave(sim) };
}

/** The save as text, for localStorage and the export modal. Two-space indent, trailing newline. */
export function saveText(sim: SimState, savedAt: number): string {
  return JSON.stringify(envelope(sim, savedAt), null, 2) + '\n';
}

export interface Restored {
  sim: SimState;
  savedAt: number;
}

/**
 * The world in a save text. Accepts the client envelope, or a bare sim document (an export from
 * the sim's own tools) with no wall clock, in which case no time is caught up. Throws a
 * `SaveError` for anything else, so the caller can say why in one line.
 */
export function restore(text: string): Restored {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    throw new SaveError('not-a-save', `save text is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof doc === 'object' && doc !== null && (doc as { format?: unknown }).format === ENVELOPE_FORMAT) {
    const env = doc as Partial<Envelope>;
    const savedAt = typeof env.savedAt === 'number' && Number.isFinite(env.savedAt) ? env.savedAt : 0;
    return { sim: fromSave(env.save), savedAt };
  }
  return { sim: fromSave(doc), savedAt: 0 };
}

/**
 * One sim-day of sim time in ms: the cap on catch-up. It follows the world's current `periodSec`
 * (180 s by default, 60 s or 600 s after the tray's day-length buttons), so a farm left on a
 * one-minute day catches up 60 s, and on a ten-minute day 600 s.
 */
export function dayMs(sim: SimState): number {
  return sim.clock.periodSec * 1000;
}

export interface CatchUp {
  sim: SimState;
  /** wall-clock ms the farm was left alone */
  awayMs: number;
  /** sim ms actually run, after the cap */
  ranMs: number;
  capped: boolean;
}

/**
 * Advance a restored world by the time it was away, at actor resolution, up to one sim-day. A
 * gap below one second is a reload, not an absence, and runs nothing. Pure.
 */
export function catchUp(sim: SimState, awayMs: number): CatchUp {
  const cap = dayMs(sim);
  const gap = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  if (gap < 1000) return { sim, awayMs: gap, ranMs: 0, capped: false };
  const ranMs = Math.min(gap, cap);
  return { sim: step(sim, [], ranMs), awayMs: gap, ranMs, capped: gap > cap };
}

/** "2 h 05 min", "3 d 4 h", "45 s". */
export function awayLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/**
 * The "while you were gone" line: how long, what changed in the flock and the banks, and the HUD
 * line the prototype shows for the world as it is now. A fuller storybook is Phase 1.
 */
export function awaySummary(before: FarmView, after: FarmView, c: CatchUp): string {
  const flock = (v: FarmView): number => v.sheep.length + v.sheep.reduce((n, s) => n + s.lambs.length, 0);
  const deltas: string[] = [];
  const d = (label: string, a: number, b: number): void => {
    const n = b - a;
    if (n !== 0) deltas.push(`${n > 0 ? '+' : ''}${n} ${label}`);
  };
  d('sheep', flock(before), flock(after));
  d('wool', before.woolBank, after.woolBank);
  d('coins', before.coins, after.coins);
  const news = after.owned.filter((u) => !before.owned.includes(u));
  if (news.length) deltas.push(`bought ${news.join(', ')}`);
  if (before.weather !== after.weather) deltas.push(`now ${after.weather}`);
  const span = c.capped ? `${awayLabel(c.awayMs)}, the farm ran one day of it` : awayLabel(c.awayMs);
  const changes = deltas.length ? deltas.join(', ') : 'nothing much changed';
  return `while you were gone (${span}): ${changes} · ${hudText(after, renderPhase(after.clockT))}`;
}

// Persistence, the pure part. The sim's save document (packages/sim/src/save) is wrapped in a
// small client envelope that also records the wall clock at the time of saving (so the next load
// knows how long the farm was left alone) and the client's own storybook page store (issue #42;
// pages are the client's, not the sim's — see storybook.ts). Offline catch-up itself is the sim's
// own `catchUp` (packages/sim/src/ledger/catch-up.ts) now, called from main.ts; this file no longer
// has its own copy. The DOM side (localStorage, the visibilitychange hook, the export modal) is in
// main.ts.
import { fromSave, SaveError, toSave, type SaveDoc, type SimState } from '@sheepcliff/sim';
import { EMPTY_PAGE_STORE, parsePageStore, type PageStore } from './storybook';

export const SAVE_KEY = 'sheepcliff-save';
export const ENVELOPE_FORMAT = 'sheepcliff-web-save';

export interface Envelope {
  format: typeof ENVELOPE_FORMAT;
  /** wall clock (Date.now()) when the world was saved */
  savedAt: number;
  save: SaveDoc;
  /** every storybook page ever shown, kept and reopenable — see storybook.ts */
  pages: PageStore;
}

export function envelope(sim: SimState, savedAt: number, pages: PageStore = EMPTY_PAGE_STORE): Envelope {
  return { format: ENVELOPE_FORMAT, savedAt, save: toSave(sim), pages };
}

/** The save as text, for localStorage and the export modal. Two-space indent, trailing newline. */
export function saveText(sim: SimState, savedAt: number, pages: PageStore = EMPTY_PAGE_STORE): string {
  return JSON.stringify(envelope(sim, savedAt, pages), null, 2) + '\n';
}

export interface Restored {
  sim: SimState;
  savedAt: number;
  pages: PageStore;
}

/**
 * The world in a save text. Accepts the client envelope, or a bare sim document (an export from
 * the sim's own tools) with no wall clock and no page store, in which case no time is caught up and
 * the page store starts empty. Throws a `SaveError` for anything else, so the caller can say why in
 * one line. A pre-#42 envelope (no `pages` field) restores with an empty page store rather than
 * failing — old saves keep loading.
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
    return { sim: fromSave(env.save), savedAt, pages: parsePageStore(env.pages) };
  }
  return { sim: fromSave(doc), savedAt: 0, pages: EMPTY_PAGE_STORE };
}

/** "2 h 05 min", "3 d 4 h", "45 s" — the finer-grained span, used as a subtitle beside the
 * storybook's plain-word title (`awayTitle`, storybook.ts). */
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

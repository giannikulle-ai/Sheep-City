// Persistence, the pure part. The sim's save document (packages/sim/src/save) is wrapped in a
// small client envelope that also records the wall clock at the time of saving (so the next load
// knows how long the farm was left alone) and the client's own storybook page store (issue #42;
// pages are the client's, not the sim's — see storybook.ts). Offline catch-up itself is the sim's
// own `catchUp` (packages/sim/src/ledger/catch-up.ts) now, called from main.ts; this file no longer
// has its own copy. The DOM side (localStorage, the visibilitychange hook, the export modal) is in
// main.ts.
import { fromSave, SaveError, toSave, type SaveDoc, type SimState } from '@sheepcliff/sim';
import { worldRealNowMs, type SceneParams } from './query';
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

export interface RestoreOptions {
  /**
   * The real instant (UTC ms) this load is happening at, handed to the sim as `fromSave`'s own
   * `realNowMs` (#84). It matters for exactly one thing: a save from before the real-year calendar
   * (v7 or older) has no calendar epoch and no record of what one would have been, so the v8
   * migration anchors it to the real present — this number — once, on its first load, and the
   * world is deterministic from then on. A save that already carries an epoch ignores it.
   *
   * Omitted, the sim uses its own fixed `DEFAULT_REAL_EPOCH_MS`, which is what keeps a pinned or QA
   * world reproducible. See `worldRealNowMs` in query.ts, whose answer is passed straight through
   * here — hence `number | undefined` rather than a bare optional.
   */
  realNowMs?: number | undefined;
}

/**
 * The world in a save text. Accepts the client envelope, or a bare sim document (an export from
 * the sim's own tools) with no wall clock and no page store, in which case no time is caught up and
 * the page store starts empty. Throws a `SaveError` for anything else, so the caller can say why in
 * one line. A pre-#42 envelope (no `pages` field) restores with an empty page store rather than
 * failing — old saves keep loading.
 */
export function restore(text: string, options: RestoreOptions = {}): Restored {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    throw new SaveError('not-a-save', `save text is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  // `options` is `fromSave`'s own `LoadOptions` shape, undefined and all: an absent or undefined
  // `realNowMs` means "use the sim's own default epoch", which is the pinned-world behaviour.
  if (typeof doc === 'object' && doc !== null && (doc as { format?: unknown }).format === ENVELOPE_FORMAT) {
    const env = doc as Partial<Envelope>;
    const savedAt = typeof env.savedAt === 'number' && Number.isFinite(env.savedAt) ? env.savedAt : 0;
    return { sim: fromSave(env.save, options), savedAt, pages: parsePageStore(env.pages) };
  }
  return { sim: fromSave(doc, options), savedAt: 0, pages: EMPTY_PAGE_STORE };
}

/**
 * `restore`, with the one line that decides whether the sim is told the real time (#84, round 3 —
 * the Verifier's finding 3: `main.ts`'s own `restore(text, { realNowMs: realNow() })` had no test on
 * either side, only `restore`'s own pass-through and `worldRealNowMs`'s own rule did). This is the
 * whole of that composition, pulled out of `main.ts`'s DOM-bound `adopt` so it is pure and
 * unit-testable: `main.ts` now calls this with its own `params`, `qaDriven` and `Date.now`, and the
 * seam a test can no longer reach — main.ts passing the right three things to this call — is a
 * one-line, eyeballable pass-through rather than the composition itself.
 */
export function restoreForLoad(
  text: string,
  params: Pick<SceneParams, 'realNow' | 'scratch'>,
  qaDriven: boolean,
  wallNow: () => number,
  // Same seam `worldRealNowMs` has (decision 18): a test pins a zone instead of inheriting the
  // runner's, so the suite reads the same on the owner's box (US Central) as on CI (UTC).
  tzOffsetMinutes?: () => number,
): Restored {
  return restore(text, { realNowMs: worldRealNowMs(params, qaDriven, wallNow, tzOffsetMinutes) });
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

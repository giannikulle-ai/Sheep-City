// The save document: what `toSave` writes and `fromSave` reads. Plain JSON, one envelope around
// the world so the version and format tag live outside the state they describe.
//
// v0 (clock ticket, #4): the bare `SimState` with `version: 0` on it, no envelope.
// v1 (#8):               `{ format, version: 1, world }`, where `world` is the state minus `version`.
// v2 (#5a):              same envelope; `world.luna` gains `stick`, `circleUntilMs`, `dirAtMs`,
//                        `tagUntilMs`, `forceBoundUntilMs` for the behaviour chain.

import type { SimState } from '../state';

/** Tag on every document so a stranger's JSON is refused before anything reads into it. */
export const SAVE_FORMAT = 'sheepcliff-save';

/** The world as stored: every `SimState` field except `version`, which the envelope carries. */
export type SaveWorld = Omit<SimState, 'version'>;

/** A current-version document. Older documents are `UnknownSaveDoc` until the migrations run. */
export interface SaveDoc {
  format: typeof SAVE_FORMAT;
  version: number;
  world: SaveWorld;
}

/** Any document with a version on it. Migrations read and write this; nothing else trusts it. */
export type UnknownSaveDoc = { readonly version: number } & Readonly<Record<string, unknown>>;

export type SaveErrorCode =
  | 'not-a-save'
  | 'bad-format'
  | 'bad-version'
  | 'newer-than-supported'
  | 'missing-migration'
  | 'bad-migration'
  | 'not-serializable'
  | 'invalid-world';

/** Every failure in the save layer is one of these, so a host can show one message per code. */
export class SaveError extends Error {
  override readonly name = 'SaveError';
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

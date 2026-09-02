// Migration harness. Every schema bump adds one entry here, one file beside this one, and one
// fixture under test/fixtures. The runner walks a document from its own version up to
// SAVE_VERSION one migration at a time; a gap in the chain is an error, not a silent skip.

import { SAVE_VERSION } from '../../state';
import { isPlainObject, SaveError, type UnknownSaveDoc } from '../doc';
import { v1WrapWorld } from './v1-wrap-world';
import { v2LunaFetchFields } from './v2-luna-fetch-fields';
import { v3FlockAndNpcFields } from './v3-flock-and-npc-fields';
import { v4GroundAndStamps } from './v4-ground-and-stamps';

export interface Migration {
  /** The document version this migration reads. It must write `from + 1`. */
  readonly from: number;
  /** One line, for error messages and the PR body. */
  readonly title: string;
  /** Pure: returns a new document and leaves `doc` untouched. */
  readonly up: (doc: UnknownSaveDoc) => UnknownSaveDoc;
}

/** In order. `MIGRATIONS[i].from === i`, and the last one writes `SAVE_VERSION`. */
export const MIGRATIONS: readonly Migration[] = [v1WrapWorld, v2LunaFetchFields, v3FlockAndNpcFields, v4GroundAndStamps];

/**
 * Check that a migration list is a complete, ordered chain from 0 to `target`. Throws
 * `SaveError('missing-migration')` otherwise. Cheap, so the runner calls it every time.
 */
export function assertMigrationChain(migrations: readonly Migration[], target: number = SAVE_VERSION): void {
  if (migrations.length !== target) {
    throw new SaveError('missing-migration', `expected ${target} migrations to reach save v${target}, found ${migrations.length}`);
  }
  migrations.forEach((m, i) => {
    if (m.from !== i) throw new SaveError('missing-migration', `migration ${i} reads v${m.from}, expected v${i} ("${m.title}")`);
  });
}

/** The version stamped on a document, or a `SaveError` explaining why there is none. */
export function readVersion(doc: unknown): number {
  if (!isPlainObject(doc)) throw new SaveError('not-a-save', `expected a save document object, got ${doc === null ? 'null' : typeof doc}`);
  const version = doc['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new SaveError('bad-version', `save version must be a non-negative integer, got ${JSON.stringify(version)}`);
  }
  return version;
}

/**
 * Bring a document of any known version up to `target`. The input is never modified. A document
 * already at `target` is returned as is; one from a newer build is refused rather than guessed at.
 */
export function migrateSave(doc: unknown, migrations: readonly Migration[] = MIGRATIONS, target: number = SAVE_VERSION): UnknownSaveDoc {
  const version = readVersion(doc);
  if (version > target) {
    throw new SaveError('newer-than-supported', `save is v${version} but this build reads up to v${target}; update the app to load it`);
  }
  assertMigrationChain(migrations, target);
  let current = doc as UnknownSaveDoc;
  while (current.version < target) {
    const migration = migrations[current.version] as Migration;
    const next = migration.up(current);
    if (!isPlainObject(next) || next.version !== migration.from + 1) {
      throw new SaveError('bad-migration', `"${migration.title}" wrote version ${JSON.stringify(next?.version)}, expected ${migration.from + 1}`);
    }
    current = next;
  }
  return current;
}

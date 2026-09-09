// Migration harness. Every schema bump adds one entry here, one file beside this one, and one
// fixture under test/fixtures. The runner walks a document from its own version up to
// SAVE_VERSION one migration at a time; a gap in the chain is an error, not a silent skip.

import { DEFAULT_REAL_EPOCH_MS } from '../../calendar';
import { SAVE_VERSION } from '../../state';
import { isPlainObject, SaveError, type UnknownSaveDoc } from '../doc';
import { v1WrapWorld } from './v1-wrap-world';
import { v2LunaFetchFields } from './v2-luna-fetch-fields';
import { v3FlockAndNpcFields } from './v3-flock-and-npc-fields';
import { v4GroundAndStamps } from './v4-ground-and-stamps';
import { v5LedgerSnapshot } from './v5-ledger-snapshot';
import { v6Chronicle } from './v6-chronicle';
import { v7Events } from './v7-events';
import { v8Calendar } from './v8-calendar';
import { v9Settlement } from './v9-settlement';
import { v10FarmBuilds } from './v10-farm-builds';

/**
 * What a migration is allowed to know about the world outside the document it is given.
 *
 * Today that is one number: the real instant the load is happening at. The v8 calendar migration
 * (#84) needs it — a v7 world has no real-calendar epoch and no record of one, so the only honest
 * epoch to give it is "the real present at its first load", after which the world's calendar is a
 * deterministic function of that stored number and its seed. The sim reads no clock of its own
 * (charter: "Time comes in as a parameter"), so the host passes it to `fromSave`; a caller that
 * does not gets `DEFAULT_REAL_EPOCH_MS`, which is what keeps the fixtures byte-stable.
 */
export interface MigrationContext {
  /** Real milliseconds since 1970 (UTC) at the moment of this load. */
  readonly realNowMs: number;
}

/** The context a caller that passes none gets. Fixed, so a migration is a pure function again. */
export const DEFAULT_MIGRATION_CONTEXT: MigrationContext = { realNowMs: DEFAULT_REAL_EPOCH_MS };

export interface Migration {
  /** The document version this migration reads. It must write `from + 1`. */
  readonly from: number;
  /** One line, for error messages and the PR body. */
  readonly title: string;
  /**
   * Pure: returns a new document and leaves `doc` untouched. `context` is optional so a migration
   * stays callable on its own (the migration tests call each `up` directly); one that needs it
   * falls back to `DEFAULT_MIGRATION_CONTEXT`.
   */
  readonly up: (doc: UnknownSaveDoc, context?: MigrationContext) => UnknownSaveDoc;
}

/** In order. `MIGRATIONS[i].from === i`, and the last one writes `SAVE_VERSION`. */
export const MIGRATIONS: readonly Migration[] = [v1WrapWorld, v2LunaFetchFields, v3FlockAndNpcFields, v4GroundAndStamps, v5LedgerSnapshot, v6Chronicle, v7Events, v8Calendar, v9Settlement, v10FarmBuilds];

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
export function migrateSave(
  doc: unknown,
  migrations: readonly Migration[] = MIGRATIONS,
  target: number = SAVE_VERSION,
  context: MigrationContext = DEFAULT_MIGRATION_CONTEXT,
): UnknownSaveDoc {
  const version = readVersion(doc);
  if (version > target) {
    throw new SaveError('newer-than-supported', `save is v${version} but this build reads up to v${target}; update the app to load it`);
  }
  assertMigrationChain(migrations, target);
  let current = doc as UnknownSaveDoc;
  while (current.version < target) {
    const migration = migrations[current.version] as Migration;
    const next = migration.up(current, context);
    if (!isPlainObject(next) || next.version !== migration.from + 1) {
      throw new SaveError('bad-migration', `"${migration.title}" wrote version ${JSON.stringify(next?.version)}, expected ${migration.from + 1}`);
    }
    current = next;
  }
  return current;
}

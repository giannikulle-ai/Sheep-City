// v7 -> v8: the real-year calendar (#84). Seasons no longer cycle on a fixed nine-real-day wheel;
// they follow the real year, and reading them needs two numbers a v7 world never stored:
//
//   * `season.realEpochMs` — the real instant (UTC ms) the world's `season.elapsedMs === 0` stood
//     on, i.e. when the world was made in the real world;
//   * `season.seed` — the world's own seed, so a `Season` can be read on its own (the client calls
//     `currentSeason(sim.season)`, and the Ledger carries a copy of the object with no state
//     behind it).
//
// **What a v7 world gets.** It has no record of when it was made, and inventing one would be a
// guess dressed up as data. So it is anchored to the real present at its first load instead: the
// host passes `realNowMs` to `fromSave`, and the epoch is `realNowMs - season.elapsedMs`, which
// makes the world's real date come out as exactly `realNowMs` on that first load. From then on the
// number is stored and the calendar is a deterministic function of it and the seed — the owner's
// live world picks up the real calendar where it actually is, once, and never drifts again. A
// caller that passes no real time gets `DEFAULT_REAL_EPOCH_MS` (calendar.ts), which is what keeps
// the fixtures byte-stable and every test a function of its seed.
//
// **It never throws.** Every field is read defensively and falls back to something sane (epoch
// `realNowMs`, seed 0) rather than raising: a save the owner is holding must load, and a document
// malformed enough to have no clock is `validateWorld`'s to refuse with a real message, not this
// file's to blow up on.
//
// The Ledger snapshot (`world.ledger.season`, present since v5) gets the **same** epoch and seed —
// it is the same world seen at an earlier moment, and its own `elapsedMs` already carries that
// difference, so a second epoch would double-count it.

import { DEFAULT_REAL_EPOCH_MS } from '../../calendar';
import type { Migration, MigrationContext } from './index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The two calendar fields a v7 world's `season` is missing, given the real time of this load. */
export function v8CalendarDefault(world: Record<string, unknown>, realNowMs: number): { realEpochMs: number; seed: number } {
  const season = world['season'];
  const elapsedMs = isRecord(season) ? numberOr(season['elapsedMs'], 0) : 0;
  return { realEpochMs: realNowMs - elapsedMs, seed: numberOr(world['seed'], 0) >>> 0 };
}

/** `season` with the calendar fields filled in, keeping any a document already carries. */
function withCalendar(season: unknown, fill: { realEpochMs: number; seed: number }): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(season) ? { ...season } : {};
  if (next['realEpochMs'] === undefined) next['realEpochMs'] = fill.realEpochMs;
  if (next['seed'] === undefined) next['seed'] = fill.seed;
  return next;
}

export const v8Calendar: Migration = {
  from: 7,
  title: 'v7 to v8: anchor the world’s season calendar to the real present, and give it the world’s seed',
  up(doc, context?: MigrationContext) {
    const realNowMs = context?.realNowMs ?? DEFAULT_REAL_EPOCH_MS;
    const world = doc['world'];
    // A document with no world is left for `validateWorld` to refuse with a real message.
    if (!isRecord(world)) return { ...doc, version: 8 };
    const fill = v8CalendarDefault(world, realNowMs);
    const next: Record<string, unknown> = { ...world, season: withCalendar(world['season'], fill) };
    const ledger = world['ledger'];
    if (isRecord(ledger)) next['ledger'] = { ...ledger, season: withCalendar(ledger['season'], fill) };
    return { ...doc, version: 8, world: next };
  },
};

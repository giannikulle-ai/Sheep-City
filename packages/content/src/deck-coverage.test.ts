// Deck coverage (#86, world half). Two things this ticket's done-means asks for, that a JSON
// schema alone cannot check: that every season × time-band has a way in for at least two cards
// (docs/content/EVENT_DECK.md's coverage table), and a plain measurement of the deck over thirty
// farm days — decision 16 (plan section 11, 2026-09-09) describes pace in world time only, not
// real minutes, and this deck has no `size` field yet (that is #102, after the sim ticket #101
// teaches the engine what a size means), so the only thing this test can honestly assert without
// sizes is the bar decision 16 states in plain language regardless of size: nothing is forced,
// so no seed goes fully silent over a month of farm days. The three-kind-in-five-minutes bar
// (plan decision 14) and the "about three moments per five minutes" line (decision 11) are both
// withdrawn by decision 16 and are not asserted or measured here.
//
// This package CAN import @sheepcliff/sim without a real circular dependency: the sim's own deck
// loader (packages/sim/src/engine/deck.ts) reads this package's event JSON by a relative file path,
// not by importing '@sheepcliff/content' as a package, so a content -> sim import edge here does
// not close a cycle in the module graph. `@sheepcliff/sim` is a devDependency of this package for
// exactly this file. That is what lets the population measurement live in a content test rather
// than a script under scripts/, as the ticket allows for when a script is unavoidable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FARM_DECK, cloneState, createInitialState, momentKindOf, tickInPlace } from '@sheepcliff/sim';
import farmEvents from '../events/farm.json';

type SeasonName = 'spring' | 'summer' | 'autumn' | 'winter';
type PhaseName = 'dawn' | 'day' | 'dusk' | 'night';
const SEASONS: readonly SeasonName[] = ['spring', 'summer', 'autumn', 'winter'];
const PHASES: readonly PhaseName[] = ['dawn', 'day', 'dusk', 'night'];

type Card = (typeof farmEvents.events)[number];

/**
 * The season(s) and time band(s) a card's own `conditions` allow, reading only the three clock/
 * weather predicates the coverage table is about (`season`, `timeOfDay`) — the same split
 * docs/content/EVENT_DECK.md's own two condition tables draw between clock/weather predicates and
 * Ledger/actor ones. A condition absent from a card means "no constraint", i.e. every value; `eq`
 * and `in` both narrow to their value(s), read the same way `holds()` (packages/sim/src/engine/
 * view.ts) reads them at runtime. No card here uses `ne`/`not-in` on season or timeOfDay, so those
 * are not needed to read the shipped deck; a future card that did would need this widened too.
 */
function allowedSeasons(card: Card): readonly SeasonName[] {
  const cond = card.conditions.find((c) => c.on === 'season');
  if (!cond) return SEASONS;
  const value = Array.isArray(cond.value) ? cond.value : [cond.value];
  return SEASONS.filter((s) => value.includes(s));
}
function allowedPhases(card: Card): readonly PhaseName[] {
  const cond = card.conditions.find((c) => c.on === 'timeOfDay');
  if (!cond) return PHASES;
  const value = Array.isArray(cond.value) ? cond.value : [cond.value];
  return PHASES.filter((p) => value.includes(p));
}

/** Card ids structurally eligible in one season × time band, by season/weather/timeOfDay alone. */
function cardsFor(season: SeasonName, phase: PhaseName): string[] {
  return farmEvents.events.filter((c) => allowedSeasons(c).includes(season) && allowedPhases(c).includes(phase)).map((c) => c.id);
}

/** The full 4×4 table: season -> phase -> card ids. Exported so the doc test below and a human can both read it. */
export const COVERAGE_TABLE: Record<SeasonName, Record<PhaseName, string[]>> = Object.fromEntries(
  SEASONS.map((season) => [season, Object.fromEntries(PHASES.map((phase) => [phase, cardsFor(season, phase)]))]),
) as Record<SeasonName, Record<PhaseName, string[]>>;

const DOC_PATH = fileURLToPath(new URL('../../../docs/content/EVENT_DECK.md', import.meta.url));

/**
 * Parses the "Deck coverage" table straight out of `docs/content/EVENT_DECK.md`, so the test below
 * reads the doc, not a second hard-coded copy of it. The table's own shape (fixed by the doc's
 * author, not this file): a header row `| Season | dawn | day | dusk | night |`, a separator row,
 * then one row per season in `SEASONS` order, each cell either `id1, id2, ... (N)` or `none (0)`.
 * A cell's card list is compared as a set (the doc's own prose order is for a human, not a promise
 * this test should enforce) alongside its own parenthesised count, so a doc edit that drops a name
 * but forgets to update the count — or the other way round — fails here too.
 */
function parseCoverageTableFromDoc(): Record<SeasonName, Record<PhaseName, string[]>> {
  const doc = readFileSync(DOC_PATH, 'utf8');
  const lines = doc.split('\n');
  const headerIndex = lines.findIndex((l) => l.trim() === '| Season | dawn | day | dusk | night |');
  if (headerIndex < 0) throw new Error(`could not find the coverage table header in ${DOC_PATH}`);
  const dataLines = lines.slice(headerIndex + 2, headerIndex + 2 + SEASONS.length);
  const result = {} as Record<SeasonName, Record<PhaseName, string[]>>;
  dataLines.forEach((line, seasonIndex) => {
    const season = SEASONS[seasonIndex] as SeasonName;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    // cells[0] is the season name; cells[1..4] are dawn/day/dusk/night in that order.
    if (cells[0] !== season) throw new Error(`coverage table row ${seasonIndex}: expected season "${season}", doc says "${cells[0]}"`);
    result[season] = {} as Record<PhaseName, string[]>;
    PHASES.forEach((phase, phaseIndex) => {
      const cell = cells[phaseIndex + 1] ?? '';
      const match = cell.match(/^(.*?)\s*\((\d+)\)$/);
      if (!match) throw new Error(`coverage table cell ${season}/${phase} does not match "names (N)": "${cell}"`);
      const [, names, countStr] = match;
      const ids = names === 'none' ? [] : (names ?? '').split(',').map((n) => n.trim());
      if (ids.length !== Number(countStr)) {
        throw new Error(`coverage table cell ${season}/${phase}: ${ids.length} names listed but the doc says (${countStr})`);
      }
      result[season][phase] = ids;
    });
  });
  return result;
}

describe('deck coverage: every season × time band has a way in (#86)', () => {
  it('at least two cards can structurally draw in every one of the sixteen season × time-band cells', () => {
    const short: string[] = [];
    for (const season of SEASONS) {
      for (const phase of PHASES) {
        const ids = COVERAGE_TABLE[season][phase];
        if (ids.length < 2) short.push(`${season}/${phase}: ${ids.length} (${ids.join(', ') || 'none'})`);
      }
    }
    expect(short, `cells with fewer than two eligible cards:\n${short.join('\n')}`).toEqual([]);
  });

  it('matches the table published in docs/content/EVENT_DECK.md, cell for cell', () => {
    // Parses the doc's own Markdown table (see parseCoverageTableFromDoc above) rather than a
    // second hard-coded copy of its sixteen numbers, so an edit to the doc that is not also an
    // edit to the data (or the other way round) fails here — both the counts and the card names.
    const fromDoc = parseCoverageTableFromDoc();
    for (const season of SEASONS) {
      for (const phase of PHASES) {
        const dataIds = new Set(COVERAGE_TABLE[season][phase]);
        const docIds = new Set(fromDoc[season][phase]);
        expect(docIds, `${season}/${phase}: doc names vs data`).toEqual(dataIds);
      }
    }
  });
});

describe('thirty farm days: nothing forced (#86, decision 16)', () => {
  // Decision 16 (plan section 11, 2026-09-09): "a farm day holds a small thing on most days and a
  // big thing a few times a farm month ... nothing is forced ... measured over thirty seeds and
  // thirty farm days." This deck has no `size` field yet — #102 adds it once the sim ticket #101
  // teaches the engine to read one — so this test cannot yet split "small" from "big" or assert
  // either floor. What it CAN honestly assert today is the one clause decision 16 states in plain
  // language regardless of size: nothing is forced, so a seed does not go fully silent across a
  // month of farm days. Everything else below (starts per day, no-card days, distinct kinds) is
  // recorded as a measurement, not a floor, so #102's own rebalance has real numbers to move from.
  //
  // A farm day is 1,800 ticks: `RULES.clock.periodSec` (180 sim-seconds/day) at the engine's fixed
  // `TICK_MS` (100 sim-ms/tick) is 1,800 ticks/day; thirty farm days is 54,000 ticks, which is also
  // 43,200 sim-minutes at farm.json's own `timeScale.simMinutesPerDay` (1,440/day × 30). Stepped
  // with `tickInPlace` directly (the engine's own per-tick function, `packages/sim/src/tick.ts`) on
  // one cloned state per seed, the same stepping `advance()` wraps, just without re-cloning on every
  // one of the 54,000 ticks (`advance(s, 1)` in a loop is what packages/sim's own population test
  // uses at 3,000 ticks; at eighteen times that tick count here, cloning once per seed instead of
  // once per tick is what keeps this test's runtime reasonable without changing what either version
  // measures).
  const DAY_TICKS = 1800;
  const TOTAL_DAYS = 30;
  const TOTAL_TICKS = DAY_TICKS * TOTAL_DAYS;

  function median(nums: readonly number[]): number {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  }

  it('measures card starts, silence, and distinct kinds over thirty farm days, seeds 1-30', () => {
    // Two independent rulers on every start, agreed seed for seed below: (A) new entries in
    // `s.events.running`, the engine's own live state, checked every tick so a card that starts
    // and ends inside one farm day is never missed; (B) the chronicle's own `card`/`authored`
    // lines whose `picture` does not end `-end` (a start's own picture key; `endEvent` in
    // `packages/sim/src/engine/engine.ts` always suffixes an end line's picture with `-end`, so
    // this excludes every end line and nothing else). Reads `@sheepcliff/sim`'s own FARM_DECK,
    // which is this package's farm.json/authored.json as the engine actually loads them.
    const rulerDisagreements: string[] = [];
    const seedStartsPerDay: number[] = [];
    const seedSilentDays: number[] = [];
    const seedDistinctKinds: number[] = [];
    const seedTotals: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const s = cloneState(createInitialState(seed));
      const kinds = new Set<string>();
      const seen = new Set<string>();
      const dailyStarts = new Array<number>(TOTAL_DAYS).fill(0);
      for (let i = 0; i < TOTAL_TICKS; i++) {
        tickInPlace(s);
        const day = Math.floor(i / DAY_TICKS);
        for (const r of s.events.running) {
          const key = `${r.id}@${r.startedMs}`;
          if (seen.has(key)) continue;
          seen.add(key);
          kinds.add(momentKindOf(r.id, FARM_DECK) ?? '?');
          dailyStarts[day]! += 1;
        }
      }
      const chronicleStarts = s.chronicle.entries.filter(
        (e) => (e.source === 'card' || e.source === 'authored') && !e.picture.endsWith('-end'),
      );
      if (chronicleStarts.length !== seen.size) {
        rulerDisagreements.push(`seed ${seed}: running=${seen.size} chronicle=${chronicleStarts.length}`);
      }
      const total = dailyStarts.reduce((a, b) => a + b, 0);
      seedTotals.push(total);
      seedStartsPerDay.push(total / TOTAL_DAYS);
      seedSilentDays.push(dailyStarts.filter((n) => n === 0).length);
      seedDistinctKinds.push(kinds.size);
    }
    expect(rulerDisagreements, `starts counted differently by the two rulers:\n${rulerDisagreements.join('\n')}`).toEqual([]);

    // Measured at this head, this deck (weights back at trunk's own values, per decision 16 —
    // see docs/content/EVENT_DECK.md's "Deck coverage" section for the full numbers), seeds 1-30,
    // 30 farm days (54,000 ticks) each, 2026-09-09 (world lane, #86, fix round 2):
    //   - card starts per farm day, median across seeds: 1.43 (per-seed mean starts/day range
    //     1.37-1.53; per-seed values: 1.47,1.40,1.50,1.47,1.47,1.47,1.40,1.43,1.50,1.47,1.53,1.40,
    //     1.43,1.40,1.47,1.43,1.53,1.43,1.43,1.37,1.40,1.50,1.47,1.40,1.40,1.47,1.47,1.43,1.43,1.43)
    //   - days with no card: 7 of 900 seed-days (silent days per seed, seeds 1-30 in order:
    //     0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,1,0,1,0,2,0,0,0,1,0,0,0,0,0,0)
    //   - distinct moment kinds over the thirty days, seeds 1-30: 5,5,5,4,5,4,5,5,5,5,4,4,4,4,4,4,
    //     4,5,4,5,4,4,4,4,5,5,5,5,4,5 (median 4.5, range 4-5)
    //   - no seed goes fully silent (zero starts across all thirty days): 0 of 30
    // The exact numbers move with #102's own weight rebalance (small/big) and are not pinned here
    // as a floor beyond the one decision 16 actually asks for below.
    const fullySilentSeeds = seedTotals.filter((n) => n === 0).length;
    expect(
      fullySilentSeeds,
      `seeds with zero card starts across all thirty farm days: ${fullySilentSeeds}/30 (decision 16: nothing is forced, but nothing should be silent for a month either)`,
    ).toBe(0);

    // Recorded, not asserted (see the comment above and docs/content/EVENT_DECK.md): the median
    // starts/day, the no-card-day count, and the distinct-kind spread, so a human or a future test
    // can see the shape of the measurement, not just the pass/fail.
    console.info('thirty farm days, seeds 1-30 — median starts/day:', median(seedStartsPerDay));
    console.info('thirty farm days, seeds 1-30 — no-card days:', seedSilentDays.reduce((a, b) => a + b, 0), 'of', 30 * TOTAL_DAYS);
    console.info('thirty farm days, seeds 1-30 — median distinct kinds:', median(seedDistinctKinds));
  }, 60000);
});

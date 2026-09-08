// Deck coverage (#86, world half). Two things the issue's own done-means asks for, that a JSON
// schema alone cannot check: that every season × time-band has a way in for at least two cards
// (docs/content/EVENT_DECK.md's coverage table), and that a five-minute unattended watch shows
// three distinct moment kinds on at least half of thirty seeds (the Foreman's pin on PR #82,
// restated on issue #86 as this ticket's own done-means after the birthday's realDate deferral
// took the free kind away).
//
// This package CAN import @sheepcliff/sim without a real circular dependency: the sim's own deck
// loader (packages/sim/src/engine/deck.ts) reads this package's event JSON by a relative file path,
// not by importing '@sheepcliff/content' as a package, so a content -> sim import edge here does
// not close a cycle in the module graph. `@sheepcliff/sim` is a devDependency of this package for
// exactly this file. That is what lets the three-kind population measurement live in a content
// test rather than a script under scripts/, as the ticket allows for when a script is unavoidable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { advance, createInitialState, FARM_DECK, momentKindOf } from '@sheepcliff/sim';
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

describe('five unattended minutes: three distinct moment kinds (#86, the Foreman\'s pin on PR #82)', () => {
  // Every fresh world starts in the same season (spring: `SEASONS[0]` at `elapsedMs: 0`) at the
  // same clock position (`RULES.clock.startT`, mid-morning), so a 3,000-tick, five-real-minute
  // watch from seed 1 through 30 is thirty spring runs that differ only in their RNG stream (flock
  // composition, weather rolls, and the draw itself) — not thirty different seasons. That is
  // exactly why "spring nights go quiet" (the issue's own words) was the bar this ticket had to
  // clear: every seed in this population lives entirely inside spring, cycling day -> dusk -> night
  // -> dawn -> day -> dusk within the watch (periodSec 180, so 300 real seconds is 2,400 sim-minutes,
  // about one and two-thirds sim-days).
  it('at least 15 of seeds 1-30 show three distinct moment kinds in 3,000 ticks, on the shipped pacing', () => {
    // Two independent rulers on every start, agreed seed for seed below: (A) new entries in
    // `s.events.running`, the engine's own live state; (B) the chronicle's own `card`/`authored`
    // lines whose `picture` does not end `-end` (a start's own picture key; `endEvent` in
    // `packages/sim/src/engine/engine.ts` always suffixes an end line's picture with `-end`, so
    // this excludes every end line and nothing else). Mirrors test/engine-draw.test.ts's own "the
    // population, seeds 1-30" block in packages/sim (same tick count, same seeds), reading
    // `@sheepcliff/sim`'s own FARM_DECK, which is this package's farm.json/authored.json as the
    // engine actually loads them.
    const kindCounts: number[] = [];
    const rulerDisagreements: string[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      let s = createInitialState(seed);
      const kinds = new Set<string>();
      const seen = new Set<string>();
      for (let i = 0; i < 3000; i++) {
        s = advance(s, 1);
        for (const r of s.events.running) {
          const key = `${r.id}@${r.startedMs}`;
          if (seen.has(key)) continue;
          seen.add(key);
          kinds.add(momentKindOf(r.id, FARM_DECK) ?? '?');
        }
      }
      const chronicleStarts = s.chronicle.entries.filter(
        (e) => (e.source === 'card' || e.source === 'authored') && !e.picture.endsWith('-end'),
      );
      if (chronicleStarts.length !== seen.size) {
        rulerDisagreements.push(`seed ${seed}: running=${seen.size} chronicle=${chronicleStarts.length}`);
      }
      kindCounts.push(kinds.size);
    }
    expect(rulerDisagreements, `starts counted differently by the two rulers:\n${rulerDisagreements.join('\n')}`).toEqual([]);
    const threeKinds = kindCounts.filter((n) => n >= 3).length;
    // Measured at this head, this deck, seeds 1-30, 2026-09-08 (world lane, #86, fix round 1): 15
    // of 30 seeds show three or more distinct moment kinds (per-seed kind counts:
    // 3,3,3,3,2,3,3,2,2,3,3,3,2,3,3,2,3,2,1,2,2,2,2,2,3,2,3,2,3,1 — seeds 1-30 in order), up from 0
    // of 30 at the branch this ticket started from. That is exactly the 15-of-30 floor the issue's
    // comment set (a majority of seeds) — no margin, on purpose: round 1 shrank every card's
    // `weight.base` from the deck's first pass (which cleared 17 of 30 at a total weight of 216,
    // +77% over trunk's 122) to the smallest total weight, scaled uniformly at trunk's own
    // proportions, that still clears the floor — total 162 (trunk 122, first pass 216) — because
    // the floor and the owner's pinned pacing target (about three moments per five minutes, plan
    // decision 11) pull against each other once the free birthday kind is gone, and 162 is the
    // least pace given up for the floor. See docs/content/EVENT_DECK.md's "Deck coverage" section
    // and the PR body for the full pace measurement (starts per watch, silence, both totals
    // compared) — the owner's call, not this test's, if the trade is wrong.
    const floor = 15;
    expect(threeKinds, `three-or-more-kind seeds: ${threeKinds}/30 (floor ${floor}/30)`).toBeGreaterThanOrEqual(floor);
  });
});

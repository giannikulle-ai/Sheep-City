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
    // The doc is prose for a human; this is the same sixteen cells as data, so the doc cannot rot
    // silently out of step with the deck. Counts only (the doc also names the cards, for a human
    // to check against `COVERAGE_TABLE` above if a count ever looks wrong).
    const counts = SEASONS.map((season) => PHASES.map((phase) => COVERAGE_TABLE[season][phase].length));
    expect(counts).toEqual([
      // spring:      dawn day dusk night
      [6, 8, 6, 5],
      // summer:      dawn day dusk night
      [5, 9, 6, 5],
      // autumn:      dawn day dusk night
      [6, 7, 6, 5],
      // winter:      dawn day dusk night
      [6, 6, 6, 4],
    ]);
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
    // Mirrors test/engine-draw.test.ts's own "the population, seeds 1-30" block in packages/sim
    // exactly (same tick count, same two ways of reading a start — new `events.running` entries —
    // so a change here is checkable against that file), reading `@sheepcliff/sim`'s own FARM_DECK,
    // which is this package's farm.json/authored.json as the engine actually loads them.
    const kindCounts: number[] = [];
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
      kindCounts.push(kinds.size);
    }
    const threeKinds = kindCounts.filter((n) => n >= 3).length;
    // Measured at this head, this deck, seeds 1-30, 2026-09-08 (world lane, #86): 17 of 30 seeds
    // show three or more distinct moment kinds (per-seed kind counts:
    // 3,2,3,2,3,3,3,2,2,3,3,3,3,3,3,2,3,2,1,3,2,2,3,2,3,2,3,2,3,1 — seeds 1-30 in order), up from 0
    // of 30 at the branch this ticket started from. That is past the 15-of-30 floor the issue's
    // comment set (a majority of seeds) with a five-seed margin, without moving any PACING constant
    // in packages/sim: every lever here is a card's own `weight.base`, `conditions`, or `moment.kind`
    // in packages/content/events/farm.json. The single biggest lever, measured by reverting one
    // change at a time against this same test: widening stargazingNight to every season and raising
    // its and nightOfTheFireflies' base weight to 26 each, so a clear spring or winter night has two
    // competing kinds (weather, dl-trick) instead of the one (strayCatVisits' dl-trick) it had
    // before. The floor stays comfortably short of what the deck can reach at all — pushing several
    // weights further (a swept comparison, not shipped) found combinations up to the high teens, but
    // also found the relationship is not monotonic: over-weighting one broad card (e.g. strayCatVisits
    // or lambZoomiesHour much past their shipped values) can *cost* three-kind seeds by crowding out
    // the very variety it was meant to add, which is why lambZoomiesHour's own bump here (12 -> 16)
    // is smaller than the others'.
    const floor = 15;
    expect(threeKinds, `three-or-more-kind seeds: ${threeKinds}/30 (floor ${floor}/30)`).toBeGreaterThanOrEqual(floor);
  });
});

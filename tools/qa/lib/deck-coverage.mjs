// Pure helpers for `--events` mode's coverage table and its one hard failure: a card whose own
// `conditions` admit no season × time-of-day band at all — data no seed or span could ever draw,
// as against a card that is merely unlucky in one run. Kept apart from watch-test.mjs so this is
// unit-testable without a browser.

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const TIME_BANDS = ['dawn', 'day', 'dusk', 'night'];

/** Narrow `set` by one predicate over it. `gt`/`lt`/`gte`/`lte` never apply to `season` or
 * `timeOfDay` in this deck (deck.ts's `predicate()` only allows them with a numeric value) but are
 * handled as a no-op rather than assumed unreachable, so a future data shape fails open, not by
 * silently mis-scoring a card as eligible when it is not (or the reverse). */
function narrow(set, cond) {
  const v = cond.value;
  switch (cond.op) {
    case 'eq':
      return set.filter((x) => x === v);
    case 'ne':
      return set.filter((x) => x !== v);
    case 'in':
      return Array.isArray(v) ? set.filter((x) => v.includes(x)) : [];
    case 'not-in':
      return Array.isArray(v) ? set.filter((x) => !v.includes(x)) : set;
    default:
      return set;
  }
}

/**
 * The seasons and time-of-day bands a card's own `conditions` leave open, narrowing the full four
 * of each by every `season`/`timeOfDay` predicate on the card in turn (order does not matter: it is
 * a sequence of set intersections and removals). `eligible` is false exactly when a card can never
 * be drawn by its own data — an empty season set, an empty time-band set, or both — whatever the
 * world's seed, weather, or the span a run gives it.
 */
export function eligibleBands(card) {
  let seasons = SEASONS.slice();
  let times = TIME_BANDS.slice();
  for (const cond of card.conditions) {
    if (cond.on === 'season') seasons = narrow(seasons, cond);
    if (cond.on === 'timeOfDay') times = narrow(times, cond);
  }
  return { seasons, times, eligible: seasons.length > 0 && times.length > 0 };
}

/** Cards (only cards — see the ticket: authored events are reported, never failed on this) whose
 * own conditions admit no season × time band, with why. */
export function neverEligibleCards(deck) {
  const bad = [];
  for (const card of deck.cards) {
    const bands = eligibleBands(card);
    if (!bands.eligible) {
      bad.push({
        id: card.id,
        seasons: bands.seasons,
        times: bands.times,
        reason: `no eligible season × time band (season={${bands.seasons.join(',') || 'none'}}, time={${bands.times.join(',') || 'none'}})`,
      });
    }
  }
  return bad;
}

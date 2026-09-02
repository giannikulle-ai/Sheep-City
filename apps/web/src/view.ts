// The frame's view: what the sim owns today (clock, weather, season, temperature, banks, each
// fleece) laid over the fixture's still life for everything the sim does not move yet (#5).
// When behaviours land, this is the seam: replace the fixture actors with the sim's.
import type { FarmView, Season, Weather } from '@sheepcliff/render';
import { currentSeason, type SimState } from '@sheepcliff/sim';
import { buildFixture } from './fixture';

export interface SimScalars {
  t: number;
  weather: Weather;
  season: Season;
  temp: number;
}

export function simScalars(sim: SimState): SimScalars {
  return { t: sim.clock.t, weather: sim.weather.kind, season: currentSeason(sim.season), temp: sim.weather.temp };
}

/**
 * Build the live view. The fixture's demo bubbles and pinned tags are cleared (they exist so
 * the UI layer shows in a still); reactions add the real ones. Wool and banks come from the sim.
 */
export function liveView(sim: SimState, now: number, liveWeather: boolean): FarmView {
  const s = simScalars(sim);
  const view = buildFixture({ t: s.t, weather: s.weather, season: s.season, temp: s.temp, now: null, freeze: false, liveWeather }, now);
  view.sheep.forEach((sheep, i) => {
    const simSheep = sim.sheep[i];
    if (simSheep) sheep.wool = simSheep.wool;
    sheep.icon = null;
    sheep.iconUntil = 0;
    sheep.tagUntil = 0;
  });
  view.luna.icon = null;
  view.luna.tagUntil = 0;
  for (const n of [view.farmer, view.merchant]) {
    if (n) {
      n.icon = null;
      n.iconUntil = 0;
    }
  }
  view.woolBank = sim.banks.wool;
  view.coins = sim.banks.coins;
  view.owned = sim.banks.owned.slice();
  return view;
}

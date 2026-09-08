// The event engine's probe for the DL invariant fuzz (#40, registered in `EVENT_ENGINE_HOOKS` in
// dl-invariant.test.ts). The fuzz calls it once per tick with the live state, right before it
// asserts that nothing has harmed Digital Luna, so everything in here is a deliberate attempt to
// reach her through the engine on every one of the fifty seeds:
//
// - `lostLamb`, the one reference card that involves her: a lamb is walked off its mother's trail
//   and her own `fetchLamb` behaviour walks her out to it. This is the card most likely to move
//   her, so the fuzz forces it rather than waiting for a draw that needs dusk and a lamb.
// - `shearingDay`, which tops every fleece and summons the farmer, whose `pat` job is one of the
//   two non-intent places in the package that write to her at all.
// - `fogMorning`, which reaches into `state.weather` while she is out in it.
// - the `authored` intent, both actions, so the owner's hand on an authored event is fuzzed the
//   same way every other intent type is.
//
// The engine is also directing these worlds on its own (`createInitialState` leaves it on), so what
// this adds is pressure, not the only coverage. Nothing here asserts: the fuzz's own `harmIn` call
// is the assertion.

import { FARM_DECK } from '../../src/engine/deck';
import { endEvent, startEvent } from '../../src/engine/engine';
import { isRunning } from '../../src/engine/events';
import { applyIntent } from '../../src/intents';
import type { SimState } from '../../src/state';

/** Force a card to start, unless it already is. */
function force(state: SimState, id: string): void {
  if (!isRunning(state.events, id)) startEvent(state, FARM_DECK, id, 'card');
}

/**
 * One tick of engine pressure. The cycle is 300 ticks (30 sim-seconds), so a 1,800-tick fuzz day
 * runs it six times over, at every phase of the clock and in whatever weather the day has reached.
 */
export function probeEngine(state: SimState): void {
  const beat = state.clock.tick % 300;
  switch (beat) {
    case 0:
      // Somebody to lose: the flock action, so there is a lamb even on a seed that has not had one.
      applyIntent(state, { type: 'farmAction', action: 'lamb' });
      return;
    case 60:
      force(state, 'lostLamb');
      return;
    case 120:
      force(state, 'fogMorning');
      return;
    case 150:
      endEvent(state, FARM_DECK, 'fogMorning');
      return;
    case 180:
      force(state, 'shearingDay');
      return;
    case 200:
      applyIntent(state, { type: 'authored', id: 'cliffStorm', action: 'trigger' });
      return;
    case 260:
      applyIntent(state, { type: 'authored', id: 'cliffStorm', action: 'reset' });
      return;
    case 280:
      endEvent(state, FARM_DECK, 'lostLamb');
      endEvent(state, FARM_DECK, 'shearingDay');
      return;
    default:
      return;
  }
}

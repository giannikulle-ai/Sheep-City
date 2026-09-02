// Small life. This ticket ports only the rabbit, because Digital Luna's chase ends when it leaves
// the field. The bird, butterflies, and flies wait for a later ticket.

import { TICK_SEC } from './rules';
import type { SimState } from './state';

/**
 * The rabbit's hop from the prototype's `tickLife`: 60 px/s to the right, gone past x = 600. When
 * it leaves mid-chase DL gives up; if no command is holding her she sits.
 */
export function tickRabbit(s: SimState): void {
  const rabbit = s.life.rabbit;
  if (!rabbit) return;
  rabbit.x += 60 * TICK_SEC;
  if (rabbit.x > 600) {
    s.life.rabbit = null;
    const l = s.luna;
    if (l.chasing) {
      l.chasing = false;
      l.target = null;
      l.wp = null;
      if (!l.manual) {
        l.anim = 'sit';
        l.t0Ms = s.clock.nowMs;
      }
    }
  }
}

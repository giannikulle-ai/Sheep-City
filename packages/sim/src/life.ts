// Small life, ported from the prototype's `tickLife`: the rabbit, the butterflies, and the bird,
// in that order after the NPCs. The fireflies are not here: the prototype only wobbles them
// inside Digital Luna's fetch branch, and so does the sim (see `fetch` in behaviours/luna.ts).

import { POSTS } from './geometry';
import { chance, nextFloat, pick } from './rng';
import { RULES, TICK_SEC } from './rules';
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

/** The butterflies drift around their flower: two sines across, a cosine up and down, no draws. */
export function tickButterflies(s: SimState): void {
  const dt = TICK_SEC;
  for (const b of s.life.bflies) {
    b.p += dt;
    b.x = b.home[0] + Math.sin(b.p * 0.9) * 14 + Math.sin(b.p * 2.3) * 4;
    b.y = b.home[1] - 14 + Math.cos(b.p * 1.4) * 8;
  }
}

/**
 * A bird sets off from the top right corner for one of the fence posts, drawn from the generator:
 * the prototype's spawn line and its "a bird lands" action, which replaces a bird already there.
 */
export function landBird(s: SimState): void {
  const p = pick(s.rng, POSTS);
  s.life.bird = { x: 660, y: 20, tx: p[0] - 4, ty: p[1] - 6, state: 'in', t0Ms: s.clock.nowMs };
}

/**
 * The bird from the prototype's `tickLife`. With no bird and no rain, one roll per tick
 * (`dt * .03`) starts one; it flies in at 90 px/s, sits four to seven seconds (one roll per tick
 * against a fresh stay, as the prototype rolled per frame) or until rain, then flies out up and
 * to the right and is cleared past the top edge.
 *
 * The prototype tested arrival (`d < 2`) once per frame between 1.5 px moves; a 9 px tick would
 * hop over the post for ever, so the flight in runs in `RULES.moveSubsteps` prototype-sized frames,
 * as `stepToward` does for everything with feet.
 */
export function tickBird(s: SimState): void {
  const dt = TICK_SEC;
  const now = s.clock.nowMs;
  const rain = s.weather.rain;
  if (!s.life.bird && !rain && chance(s.rng, dt * 0.03)) landBird(s);
  const bird = s.life.bird;
  if (!bird) return;
  if (bird.state === 'in') {
    const n = RULES.moveSubsteps;
    const frame = dt / n;
    for (let i = 0; i < n; i++) {
      const dx = bird.tx - bird.x;
      const dy = bird.ty - bird.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) {
        bird.state = 'sit';
        bird.t0Ms = now;
        break;
      }
      bird.x += (dx / d) * 90 * frame;
      bird.y += (dy / d) * 90 * frame;
    }
  } else if (bird.state === 'sit') {
    // The stay is drawn before the rain test, as the prototype's `a > b || rain` evaluates.
    const stayMs = 4000 + nextFloat(s.rng) * 3000;
    if (now - bird.t0Ms > stayMs || rain) bird.state = 'out';
  } else if (bird.state === 'out') {
    bird.x += 80 * dt;
    bird.y -= 60 * dt;
    if (bird.y < -10) s.life.bird = null;
  }
}

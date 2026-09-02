// Bench: how fast does the world tick? Run with `npm run bench -w packages/sim`.
// The charter's bar: 10 sim-minutes (6,000 ticks) of a 40-actor district under 50 ms.
// Timings use vitest's own timer; the sim itself never reads a clock.
import { bench, describe } from 'vitest';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';

const TICKS_PER_1000 = 1000;
const TEN_SIM_MINUTES = (10 * 60 * 1000) / 100;

describe('tick throughput', () => {
  const small = createInitialState(7);
  const district = createInitialState(7, { sheep: 40 });

  bench('1,000 ticks, 5 sheep (mean = ms per 1,000 ticks)', () => {
    advance(small, TICKS_PER_1000);
  });

  bench('1,000 ticks, 40 sheep (mean = ms per 1,000 ticks)', () => {
    advance(district, TICKS_PER_1000);
  });

  bench('10 sim-minutes, 40 sheep: 6,000 ticks (mean must stay under 50 ms)', () => {
    advance(district, TEN_SIM_MINUTES);
  });
});

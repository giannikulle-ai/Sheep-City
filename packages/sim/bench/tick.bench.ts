// Bench: how fast does the world tick? Run with `npm run bench -w packages/sim`.
//
// Two budgets, both for a 40-actor district on the bench machine (the charter's bench line):
//
// - live: one tick under 2 ms. Live play runs ten ticks a second, so a tick that costs more than
//   a fifth of a 60 Hz frame on a build machine will not leave a mid phone room to draw.
// - catch-up: one sim-hour (36,000 ticks) at actor resolution under 1 s. A short absence is
//   replayed actor by actor before the Ledger takes over for long ones (plan, section 2).
//
// The ledger line (#39) is a reference too: a real week away (3,360 sim-days of 180 s at ledger
// resolution, then 45 s of actors) for the 40-actor district. The ticket's bound, a 7-day gap
// under 50 ms in Node, is asserted in test/ledger.test.ts.
//
// The two 1,000-tick lines are throughput references for comparing runs, not budgets. The
// per-tick line ticks a district ten sim-minutes in (sheep out grazing, not the fresh field) and
// clones the state each call, as `step` does once per host call; a live frame pays that clone
// too. Timings use vitest's own timer; the sim itself never reads a clock.
import { bench, describe, type BenchTask } from 'vitest';
import { catchUp } from '../src/ledger/catch-up';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';

const TICKS_PER_1000 = 1000;
const ONE_SIM_HOUR = (60 * 60 * 1000) / 100;

const LIVE_BUDGET_MS = 2;
const CATCH_UP_BUDGET_MS = 1000;

/**
 * A budget line: after the measured run, print the task's own mean (the one in the table) against
 * the limit, as MET or NOT MET. tinybench sets the result after the teardown hook and then fires
 * `complete`, so the setup hook listens for that. The bench file reads no clock of its own.
 */
function budget(label: string, limitMs: number) {
  return (task: BenchTask, mode: 'run' | 'warmup') => {
    if (mode !== 'run') return;
    task.addEventListener(
      'complete',
      () => {
        const mean = task.result?.mean;
        if (mean === undefined) return;
        const verdict = mean < limitMs ? 'MET' : 'NOT MET';
        console.log(`budget ${label}: mean ${mean.toFixed(3)} ms, limit ${limitMs} ms: ${verdict}`);
      },
      { once: true },
    );
  };
}

describe('tick throughput', () => {
  const small = createInitialState(7);
  const district = createInitialState(7, { sheep: 40 });
  const busy = advance(district, 6000);

  bench('1,000 ticks, 5 sheep (mean = ms per 1,000 ticks)', () => {
    advance(small, TICKS_PER_1000);
  });

  bench('1,000 ticks, 40 sheep (mean = ms per 1,000 ticks)', () => {
    advance(district, TICKS_PER_1000);
  });

  bench(
    'live budget: one tick, 40 sheep (mean must stay under 2 ms)',
    () => {
      advance(busy, 1);
    },
    { setup: budget('live, one tick of 40 actors', LIVE_BUDGET_MS) },
  );

  bench('ledger catch-up: a real week away, 40 sheep: 3,360 ledger days then 450 actor ticks (mean = ms per week)', () => {
    catchUp(busy, 7 * 24 * 3600 * 1000 + 45_000);
  });

  bench(
    'catch-up budget: one sim-hour, 40 sheep: 36,000 ticks (mean must stay under 1 s)',
    () => {
      advance(district, ONE_SIM_HOUR);
    },
    { iterations: 5, setup: budget('catch-up, one sim-hour of 40 actors', CATCH_UP_BUDGET_MS) },
  );
});

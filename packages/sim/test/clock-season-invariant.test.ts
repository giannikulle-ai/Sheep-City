// `Clock.nowMs === Season.elapsedMs` (finding 5, round 3 of #84's Verifier round). It is
// load-bearing — `clock.ts`'s `realMsAtSim` rests on the two counts being the same number, and
// condition 3 of the birthday's hold (`realDateDue`, `engine.ts`) rests on `realMsAtSim` — and until
// this file it was argued only in a comment (`advanceClock`/`advanceSeason`), with nothing asserting
// it. One line, twice: after an ordinary watched day, and after a long, respawn-crossing `catchUp`.
//
// Deliberately its own file, not inside `test/invariants/**` — that directory keeps a zero diff
// against trunk in this PR (it is the DL-harm invariant's own home, and nothing else is meant to
// move alongside it) — and not inside `test/no-skips.test.ts`, which is the modifier scanner, not a
// place for a new assertion.
import { describe, expect, it } from 'vitest';
import { MS_PER_REAL_DAY } from '../src/calendar';
import { catchUp } from '../src/ledger/catch-up';
import { createInitialState } from '../src/state';
import { advance } from '../src/tick';

describe('Clock.nowMs === Season.elapsedMs, the identity the real-date hold rests on', () => {
  it('holds after an ordinary watched farm day', () => {
    for (const seed of [1, 2, 3]) {
      const oneFarmDayOfTicks = 1800; // 1,800 ticks × 100 ms = 180,000 ms, one farm day at the default period
      const played = advance(createInitialState(seed), oneFarmDayOfTicks);
      expect(played.clock.nowMs, `seed ${seed}, watched`).toBe(played.season.elapsedMs);
    }
  });

  it('holds after a long catch-up that crosses the Ledger branch and respawns the world', () => {
    for (const seed of [1, 2, 3]) {
      const away = catchUp(createInitialState(seed), 30 * MS_PER_REAL_DAY);
      expect(away.mode, `seed ${seed}`).toBe('ledger'); // the branch this identity has to survive
      expect(away.state.clock.nowMs, `seed ${seed}, catch-up`).toBe(away.state.season.elapsedMs);
    }
  });
});

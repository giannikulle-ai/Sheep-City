import { describe, expect, it } from 'vitest';
import { hashState } from '../src/hash';
import { createInitialState } from '../src/state';
import { step } from '../src/step';
import { advance } from '../src/tick';

describe('determinism', () => {
  it('10,000 ticks from seed 7, twice, give equal hashes', () => {
    const a = advance(createInitialState(7), 10000);
    const b = advance(createInitialState(7), 10000);
    expect(a.clock.tick).toBe(10000);
    expect(hashState(a)).toBe(hashState(b));
    // And the hash is not trivially constant.
    expect(hashState(a)).not.toBe(hashState(createInitialState(7)));
    expect(hashState(a)).not.toBe(hashState(advance(createInitialState(8), 10000)));
  });

  it('the same seed and the same intents through step() replay to the same hash', () => {
    const play = () => {
      let s = createInitialState(7);
      for (let i = 0; i < 400; i++) {
        const intents = i === 50 ? [{ type: 'setWeather', weather: 'rain' } as const] : i === 200 ? [{ type: 'setWeatherMode', mode: 'season' } as const] : [];
        s = step(s, intents, i % 7 === 0 ? 1000 : 116);
      }
      return s;
    };
    const a = play();
    const b = play();
    // 58 steps of 1000 ms and 342 of 116 ms: 97,672 ms, so 976 whole ticks.
    expect(a.clock.tick).toBe(976);
    expect(hashState(a)).toBe(hashState(b));
  });

  it('hashing is independent of key order', () => {
    expect(hashState({ a: 1, b: [1, 2, { c: 3, d: null }] })).toBe(hashState({ b: [1, 2, { d: null, c: 3 }], a: 1 }));
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });
});

import { describe, expect, it } from 'vitest';
import { parseSceneParams, worldRealNowMs } from './query';

describe('parseSceneParams', () => {
  it('defaults to a spring morning in the sun, clock running', () => {
    const p = parseSceneParams('');
    expect(p).toEqual({
      t: 0.18,
      weather: 'sun',
      season: 'spring',
      temp: 12,
      now: null,
      freeze: false,
      liveWeather: false,
      seed: 1,
      fixture: false,
      scratch: false,
      fresh: false,
      gapMinutes: null,
      realNow: null,
    });
  });

  it('marks any pinned scene as scratch, the fixture as the fixture, and fresh as fresh', () => {
    expect(parseSceneParams('?seed=9')).toMatchObject({ scratch: true, fixture: false });
    expect(parseSceneParams('?weather=rain')).toMatchObject({ scratch: true });
    expect(parseSceneParams('?fixture=1&now=5')).toMatchObject({ scratch: true, fixture: true, freeze: true });
    expect(parseSceneParams('?fresh=1')).toMatchObject({ scratch: false, fresh: true });
  });

  it('reads ?gap= as sim-minutes and marks the world scratch', () => {
    expect(parseSceneParams('?gap=10080')).toMatchObject({ gapMinutes: 10080, scratch: true });
    expect(parseSceneParams('?gap=0')).toMatchObject({ gapMinutes: 0, scratch: true });
    expect(parseSceneParams('?gap=abc')).toMatchObject({ gapMinutes: 0 });
    expect(parseSceneParams('').gapMinutes).toBeNull();
  });

  it('reads the sim seed as a non-negative integer, defaulting to 1', () => {
    expect(parseSceneParams('?seed=9').seed).toBe(9);
    expect(parseSceneParams('?seed=2.7').seed).toBe(2);
    expect(parseSceneParams('?seed=-4').seed).toBe(0);
    expect(parseSceneParams('?seed=abc').seed).toBe(1);
  });

  it('reads phase, weather, season and a fixed clock', () => {
    const p = parseSceneParams('?t=0.7&weather=rain&season=autumn&now=100000');
    expect(p.t).toBe(0.7);
    expect(p.weather).toBe('rain');
    expect(p.season).toBe('autumn');
    expect(p.temp).toBe(10);
    expect(p.now).toBe(100000);
    expect(p.freeze).toBe(true);
  });

  it('snow implies winter and a cold temperature unless overridden', () => {
    expect(parseSceneParams('?weather=snow')).toMatchObject({ season: 'winter', temp: -3 });
    expect(parseSceneParams('?weather=snow&season=spring&temp=1')).toMatchObject({ season: 'spring', temp: 1 });
  });

  it('ignores junk', () => {
    const p = parseSceneParams('?t=abc&weather=hail&season=monsoon&now=x');
    expect(p.t).toBe(0.18);
    expect(p.weather).toBe('sun');
    expect(p.season).toBe('spring');
    expect(p.now).toBe(0);
  });

  it('clamps t into the clock', () => {
    expect(parseSceneParams('?t=7').t).toBeLessThan(1);
    expect(parseSceneParams('?t=-1').t).toBe(0);
  });

  it('reads ?realNow= as a real instant in ms and marks the world scratch', () => {
    const p = parseSceneParams('?realNow=1797292800000');
    expect(p.realNow).toBe(1_797_292_800_000);
    expect(p.scratch).toBe(true); // pinning the calendar pins the world, like every other scene key
    expect(parseSceneParams('?realNow=nonsense').realNow).toBe(0);
  });
});

describe('worldRealNowMs: who gets the wall clock (#84)', () => {
  // The clock is a spy, so "never reads the wall clock" is a fact about the call and not a guess
  // from the value that came back.
  function spy(value = 1_788_912_000_000): { now: () => number; calls: number } {
    const s = {
      calls: 0,
      now: (): number => {
        s.calls++;
        return value;
      },
    };
    return s;
  }

  it('a real player’s farm gets the wall clock', () => {
    const clock = spy();
    expect(worldRealNowMs(parseSceneParams(''), false, clock.now)).toBe(1_788_912_000_000);
    expect(worldRealNowMs(parseSceneParams('?fresh=1'), false, clock.now)).toBe(1_788_912_000_000);
    expect(clock.calls).toBe(2);
  });

  it('a world the URL pins never reads the wall clock at all', () => {
    // The property the e2e goldens rest on: a pinned scene is the same world whatever real day the
    // suite runs on. `undefined` means "do not tell the sim what time it is", so it stays on its
    // own fixed `DEFAULT_REAL_EPOCH_MS`.
    const clock = spy();
    for (const search of ['?seed=9', '?t=0.7', '?weather=snow', '?fixture=1', '?seed=17&gap=10080&freeze=1&t=0.2']) {
      expect(worldRealNowMs(parseSceneParams(search), false, clock.now), search).toBeUndefined();
    }
    expect(clock.calls, 'the wall clock was read for a pinned world').toBe(0);
  });

  it('a QA-driven world never reads the wall clock either, pinned URL or not', () => {
    // `window.sheepcliff.qa.seed()` takes the page over for the golden driver, which opens a plain
    // `/` first — so the flag, not the URL, is what keeps that world reproducible.
    const clock = spy();
    expect(worldRealNowMs(parseSceneParams(''), true, clock.now)).toBeUndefined();
    expect(worldRealNowMs(parseSceneParams('?seed=9'), true, clock.now)).toBeUndefined();
    expect(clock.calls).toBe(0);
  });

  it('?realNow= wins over both, so a pinned world can sit on a chosen real date', () => {
    const clock = spy();
    const december = parseSceneParams('?seed=9&realNow=1797292800000');
    expect(worldRealNowMs(december, false, clock.now)).toBe(1_797_292_800_000);
    expect(worldRealNowMs(december, true, clock.now)).toBe(1_797_292_800_000);
    expect(worldRealNowMs(parseSceneParams('?realNow=0'), false, clock.now)).toBe(0); // 1970, and meant
    expect(clock.calls).toBe(0);
  });
});

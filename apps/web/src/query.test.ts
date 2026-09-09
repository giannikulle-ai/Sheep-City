import { describe, expect, it } from 'vitest';
import { createInitialState, FARM_DECK, realDateAt, realMsOf, realMsOfCivil, triggerMet, viewOf, type SimState } from '@sheepcliff/sim';
import { parseSceneParams, worldRealNowMs } from './query';

/** A counting spy, so "never read" is a fact about the call, not a guess from the value returned. */
function spy(value: number): { now: () => number; calls: number } {
  const s = {
    calls: 0,
    now: (): number => {
      s.calls++;
      return value;
    },
  };
  return s;
}

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
  it('a real player’s farm gets the wall clock', () => {
    // The zone is pinned to UTC (offset 0) so the case reads the same on the owner's box as on CI;
    // the decision-18 cases below are the ones that exercise a real offset.
    const clock = spy(1_788_912_000_000);
    expect(worldRealNowMs(parseSceneParams(''), false, clock.now, () => 0)).toBe(1_788_912_000_000);
    expect(worldRealNowMs(parseSceneParams('?fresh=1'), false, clock.now, () => 0)).toBe(1_788_912_000_000);
    expect(clock.calls).toBe(2);
  });

  it('a world the URL pins never reads the wall clock at all', () => {
    // The property the e2e goldens rest on: a pinned scene is the same world whatever real day the
    // suite runs on. `undefined` means "do not tell the sim what time it is", so it stays on its
    // own fixed `DEFAULT_REAL_EPOCH_MS`.
    const clock = spy(1_788_912_000_000);
    for (const search of ['?seed=9', '?t=0.7', '?weather=snow', '?fixture=1', '?seed=17&gap=10080&freeze=1&t=0.2']) {
      expect(worldRealNowMs(parseSceneParams(search), false, clock.now), search).toBeUndefined();
    }
    expect(clock.calls, 'the wall clock was read for a pinned world').toBe(0);
  });

  it('a QA-driven world never reads the wall clock either, pinned URL or not', () => {
    // `window.sheepcliff.qa.seed()` takes the page over for the golden driver, which opens a plain
    // `/` first — so the flag, not the URL, is what keeps that world reproducible.
    const clock = spy(1_788_912_000_000);
    expect(worldRealNowMs(parseSceneParams(''), true, clock.now)).toBeUndefined();
    expect(worldRealNowMs(parseSceneParams('?seed=9'), true, clock.now)).toBeUndefined();
    expect(clock.calls).toBe(0);
  });

  it('?realNow= wins over both, so a pinned world can sit on a chosen real date', () => {
    const clock = spy(1_788_912_000_000);
    const december = parseSceneParams('?seed=9&realNow=1797292800000');
    expect(worldRealNowMs(december, false, clock.now)).toBe(1_797_292_800_000);
    expect(worldRealNowMs(december, true, clock.now)).toBe(1_797_292_800_000);
    expect(worldRealNowMs(parseSceneParams('?realNow=0'), false, clock.now)).toBe(0); // 1970, and meant
    expect(clock.calls).toBe(0);
  });
});

describe('worldRealNowMs: the real player’s day is their own, not the UTC day (decision 18)', () => {
  // The owner, 2026-09-09, decision 18: "my day, not the world's day." `calendar.ts` reads a civil
  // date in UTC by construction (no `Date`, no time zone anywhere in the sim), so without this the
  // birthday's "December 15" would be the UTC day — for the owner in US Central that day runs from
  // 18:00 on the 14th local to 18:00 on the 15th. `worldRealNowMs` shifts the wall clock by the
  // local offset before it ever reaches the sim, so the instant the sim reads *as* UTC carries the
  // owner's own wall-clock fields instead.
  //
  // US Central Standard Time (UTC−6, no daylight saving in December) is `+360` minutes under
  // `Date.prototype.getTimezoneOffset`'s own sign — positive west of UTC — which is the contract
  // the injected `tzOffsetMinutes` replicates from the real function.
  const CENTRAL_STANDARD_TIME = () => 360;

  /** A world alive well before any December in play, moved (without ticking) onto `realMs`. */
  function worldAt(realMs: number): SimState {
    const born = createInitialState(3, { realEpochMs: realMsOfCivil(2026, 6, 1) });
    const dt = realMs - realMsOf(born.season);
    return { ...born, season: { ...born.season, elapsedMs: born.season.elapsedMs + dt }, clock: { ...born.clock, nowMs: born.clock.nowMs + dt } };
  }
  const BIRTHDAY = FARM_DECK.authored.find((e) => e.id === 'dlBirthday')!;

  it('2026-12-15T02:00Z — 20:00 on the 14th, Central — is not yet the owner’s December 15', () => {
    const now = worldRealNowMs(parseSceneParams(''), false, () => Date.parse('2026-12-15T02:00:00.000Z'), CENTRAL_STANDARD_TIME);
    expect(realDateAt(now!)).toEqual({ year: 2026, month: 12, day: 14 });
    const world = worldAt(now!);
    expect(triggerMet(world, viewOf(world), BIRTHDAY), 'not owed yet, local time').toBe(false);
  });

  it('2026-12-15T06:30Z — 00:30 on the 15th, Central — is the owner’s December 15, and the birthday is due', () => {
    const now = worldRealNowMs(parseSceneParams(''), false, () => Date.parse('2026-12-15T06:30:00.000Z'), CENTRAL_STANDARD_TIME);
    expect(realDateAt(now!)).toEqual({ year: 2026, month: 12, day: 15 });
    const world = worldAt(now!);
    expect(triggerMet(world, viewOf(world), BIRTHDAY), 'owed, local time, even though the UTC calendar has not turned 18:00 yet').toBe(true);
  });

  it('?realNow= keeps meaning exactly what it says: no offset applied to a pinned real date', () => {
    const tz = spy(360);
    const december = parseSceneParams('?seed=9&realNow=1797292800000'); // 2026-12-15T00:00:00Z, exactly
    expect(worldRealNowMs(december, false, () => 0, tz.now)).toBe(1_797_292_800_000);
    expect(tz.calls, 'a pinned real date is never shifted').toBe(0);
  });

  it('the pinned and QA-driven paths still make zero calls, offset function included', () => {
    const wall = spy(0);
    const tz = spy(360);
    expect(worldRealNowMs(parseSceneParams('?seed=9'), false, wall.now, tz.now)).toBeUndefined();
    expect(worldRealNowMs(parseSceneParams(''), true, wall.now, tz.now)).toBeUndefined();
    expect(wall.calls).toBe(0);
    expect(tz.calls).toBe(0);
  });

  it('a zero offset (UTC) changes nothing: the default the whole file above already exercises', () => {
    const now = Date.parse('2026-12-15T00:00:01.000Z');
    expect(worldRealNowMs(parseSceneParams(''), false, () => now, () => 0)).toBe(now);
  });
});

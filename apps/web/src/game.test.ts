import { describe, expect, it } from 'vitest';
import { currentSeason, DEFAULT_REAL_EPOCH_MS, hashState, realDateAt, realMsOf, TICK_MS } from '@sheepcliff/sim';
import { Game } from './game';
import type { Moment } from './moments';

const FRAME = 1000 / 60;

describe('Game', () => {
  it('applies boot intents before the first frame', () => {
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setClock', t: 0.7 }, { type: 'setWeather', weather: 'snow' }] });
    const v = g.frame(FRAME);
    expect(v.clockT).toBe(0.7);
    expect(v.weather).toBe('snow');
  });

  it('logs every intent and says whether the sim took it', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    g.frame(0);
    expect(g.dispatch({ type: 'setWeather', weather: 'rain' }).sim).toBe(true);
    expect(g.dispatch({ type: 'pet', target: 'luna' }).sim).toBe(true);
    expect(g.dispatch({ type: 'farmAction', action: 'coins' }).sim).toBe(true);
    expect(g.dispatch({ type: 'farmAction', action: 'bird' }).sim).toBe(false);
    expect(g.log.map((r) => r.intent.type)).toEqual(['setWeather', 'pet', 'farmAction', 'farmAction']);
    // the weather lands at the next tick boundary (100 ms of sim time)
    expect(g.frame(50).weather).toBe('sun');
    expect(g.frame(100).weather).toBe('rain');
    // DL got her heart, and the settlement its coins, in the sim, not from a cue
    expect(g.current().luna.icon).toBe('heart');
    // #120 (Foreman grant): the tray's coins action now pays the settlement, not the farm; before it
    // was g.sim.banks.coins === 50 - 12 - 30.
    // PIN MOVED (#126, Foreman grant): was `50 - 12 - 30` (the auto-buy took the flowerbed and hay2
    // at once). The farm's three builds are on the farm from the start now, and `buyUpgrades` is
    // retired, so the button only ever earns: plain 50.
    expect(g.sim.settlement.coins).toBe(50);
    expect(g.sim.banks.coins).toBe(0);
    expect(g.reactions.cues).toEqual([]);
  });

  it('steps the sim on the fixed 100 ms accumulator, one tick per boundary', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    for (let i = 0; i < 5; i++) g.frame(FRAME); // 83 ms: no tick yet
    expect(g.sim.clock.tick).toBe(0);
    g.frame(FRAME); // 100 ms
    expect(g.sim.clock.tick).toBe(1);
    expect(g.sim.accumulatorMs).toBeLessThan(TICK_MS);
    g.frame(250); // a slow frame runs every tick it owes
    expect(g.sim.clock.tick).toBe(3);
    expect(g.renderNow).toBeCloseTo(g.sim.clock.nowMs + g.sim.accumulatorMs);
  });

  it('holds a verb the sim cannot do yet: logged, not queued, the world untouched', () => {
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setWeather', weather: 'sun' }] });
    g.frame(1000);
    const before = g.sim;
    expect(g.dispatch({ type: 'farmAction', action: 'bird' }).sim).toBe(false);
    g.frame(FRAME);
    expect(g.sim.pendingIntents).toEqual([]);
    expect(g.sim.life.bird).toBe(before.life.bird);
    expect(g.log.at(-1)?.intent).toEqual({ type: 'farmAction', action: 'bird' });
  });

  it('reports moments on transitions only, from the sim', () => {
    const seen: Moment[] = [];
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setWeather', weather: 'sun' }], onMoment: (m) => seen.push(m) });
    g.frame(0);
    g.dispatch({ type: 'pet', target: 'luna' });
    g.frame(100);
    g.frame(100);
    expect(seen.filter((m) => m.kind === 'bubble')).toEqual([{ kind: 'bubble', actor: 'Digital Luna', detail: 'heart', t: expect.any(Number) }]);
  });

  it('calls onMinute once per sim-minute', () => {
    let minutes = 0;
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setWeather', weather: 'sun' }], onMinute: () => minutes++ });
    g.frame(59_950);
    expect(minutes).toBe(0);
    g.frame(100);
    expect(minutes).toBe(1);
    g.frame(60_000);
    expect(minutes).toBe(2);
  });

  it('frozen stops the sim and holds the render clock; intents wait', () => {
    // manual sun: in season mode seed 1 rolls rain on its first tick
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setWeather', weather: 'sun' }] });
    const before = g.frame(1000);
    const held = g.renderNow;
    g.frozen = true;
    g.dispatch({ type: 'setWeather', weather: 'snow' });
    const still = g.frame(9000);
    expect(g.renderNow).toBe(held);
    expect(still.clockT).toBe(before.clockT);
    expect(still.weather).toBe('sun');
    g.frozen = false;
    expect(g.frame(100).weather).toBe('snow');
    expect(g.renderNow).toBeGreaterThan(held);
  });

  it('reset gives the same world for the same seed', () => {
    const a = new Game({ seed: 9, liveWeather: false });
    const b = new Game({ seed: 9, liveWeather: false });
    for (let i = 1; i <= 120; i++) {
      a.frame(FRAME);
      b.frame(FRAME);
    }
    expect(hashState(a.sim)).toBe(hashState(b.sim));
    expect(a.sim.clock.tick).toBe(20);
    a.reset(9);
    expect(a.sim.clock.tick).toBe(0);
  });
});

describe('the real-year calendar epoch (#84)', () => {
  // 2026-12-15T00:00:00Z and 2026-04-01T00:00:00Z, spelled out rather than computed, so the numbers
  // in this file are the ones a URL would carry.
  const DECEMBER_15 = 1_797_292_800_000;

  it('the created world’s epoch is the time the host passed', () => {
    const g = new Game({ seed: 1, liveWeather: false, realEpochMs: () => DECEMBER_15 });
    expect(g.sim.season.realEpochMs).toBe(DECEMBER_15);
    expect(realMsOf(g.sim.season)).toBe(DECEMBER_15);
    expect(realDateAt(realMsOf(g.sim.season))).toEqual({ year: 2026, month: 12, day: 15 });
    // And the world's own seed rides along, so its calendar can be read from the season alone.
    expect(g.sim.season.seed).toBe(1);
  });

  it('the epoch is asked for again on reset, so a farm started later starts later', () => {
    // A real player's new farm should begin on the real date it is begun on, not on the date the
    // tab was opened — which is why `realEpochMs` is a function and not a number.
    const stamps = [DECEMBER_15, DECEMBER_15 + 5 * 86_400_000];
    let i = 0;
    const g = new Game({ seed: 4, liveWeather: false, realEpochMs: () => stamps[i++] as number });
    expect(realDateAt(realMsOf(g.sim.season))).toEqual({ year: 2026, month: 12, day: 15 });
    g.reset(4);
    expect(realDateAt(realMsOf(g.sim.season))).toEqual({ year: 2026, month: 12, day: 20 });
    expect(i).toBe(2);
  });

  it('no epoch, or an undefined one, leaves the world on the sim’s own default', () => {
    // The pinned path (`worldRealNowMs` returns undefined for a scratch or QA world): the sim's
    // fixed epoch, so the world is the same one on any real day — what the goldens rest on.
    expect(new Game({ seed: 1, liveWeather: false }).sim.season.realEpochMs).toBe(DEFAULT_REAL_EPOCH_MS);
    const pinned = new Game({ seed: 1, liveWeather: false, realEpochMs: () => undefined });
    expect(pinned.sim.season.realEpochMs).toBe(DEFAULT_REAL_EPOCH_MS);
    expect(currentSeason(pinned.sim.season)).toBe('spring');
    // Same seed, same world, whether the host says nothing or says "I have no time for you".
    expect(hashState(pinned.sim)).toBe(hashState(new Game({ seed: 1, liveWeather: false }).sim));
  });

  it('a world on December 15 really is in Digital Luna’s birthday, and one in June is not', () => {
    // End to end through the client's own driver rather than through the sim's API: the calendar
    // the page hands the sim is the calendar the sim reads.
    // June 30: seed 2's own summer began on June 16, so this farm is in its summer. (A date closer
    // to the solstice would not do — the drift is the point, and a seed whose summer starts on
    // July 1 would still be in spring on the 16th.)
    const june = new Game({ seed: 2, liveWeather: false, realEpochMs: () => 1_782_777_600_000 }); // 2026-06-30
    expect(realDateAt(realMsOf(june.sim.season))).toEqual({ year: 2026, month: 6, day: 30 });
    expect(currentSeason(june.sim.season)).toBe('summer');
    expect(june.sim.events.running.map((r) => r.id)).not.toContain('dlBirthday');

    const december = new Game({ seed: 2, liveWeather: false, realEpochMs: () => DECEMBER_15 });
    for (let i = 0; i < 30; i++) december.frame(FRAME);
    expect(december.sim.events.starts['dlBirthday'], 'the birthday started on her birthday').toBeDefined();
  });
});

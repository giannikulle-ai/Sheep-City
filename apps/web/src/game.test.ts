import { describe, expect, it } from 'vitest';
import { hashState, TICK_MS } from '@sheepcliff/sim';
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
    expect(g.dispatch({ type: 'sheepAction', action: 'rest', target: 'sheep-1' }).sim).toBe(false);
    expect(g.log.map((r) => r.intent.type)).toEqual(['setWeather', 'pet', 'sheepAction']);
    // the weather lands at the next tick boundary (100 ms of sim time)
    expect(g.frame(50).weather).toBe('sun');
    expect(g.frame(100).weather).toBe('rain');
    // and DL got her heart from the sim, not from a cue
    expect(g.current().luna.icon).toBe('heart');
    expect(g.reactions.cues.map((c) => c.target)).toEqual(['sheep-1']);
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

  it('shows a cue at once for a verb the sim cannot do yet', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    g.frame(1000);
    g.dispatch({ type: 'sheepAction', action: 'graze', target: 'sheep-1' });
    const v = g.frame(FRAME);
    expect(v.sheep[1]?.icon).toBe('bang');
    expect(v.sheep[1]?.tagUntil).toBeGreaterThan(g.renderNow);
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

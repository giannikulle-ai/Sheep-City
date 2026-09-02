import { describe, expect, it } from 'vitest';
import { Game } from './game';
import type { Moment } from './moments';

describe('Game', () => {
  it('applies boot intents before the first frame', () => {
    const g = new Game({ seed: 1, liveWeather: false, boot: [{ type: 'setClock', t: 0.7 }, { type: 'setWeather', weather: 'snow' }] });
    const v = g.frame(16, 16);
    expect(v.clockT).toBe(0.7);
    expect(v.weather).toBe('snow');
  });

  it('logs every intent and says whether the sim took it', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    g.frame(0, 0);
    expect(g.dispatch({ type: 'setWeather', weather: 'rain' }).sim).toBe(true);
    expect(g.dispatch({ type: 'pet', target: 'luna' }).sim).toBe(false);
    expect(g.log.map((r) => r.intent.type)).toEqual(['setWeather', 'pet']);
    // the weather lands at the next tick boundary (100 ms of sim time)
    expect(g.frame(50, 50).weather).toBe('sun');
    expect(g.frame(150, 100).weather).toBe('rain');
  });

  it('shows a cue at once for a verb the sim cannot do yet', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    g.frame(1000, 16);
    g.dispatch({ type: 'pet', target: 'sheep-1' });
    const v = g.frame(1016, 16);
    expect(v.sheep[1]?.icon).toBe('heart');
    expect(v.sheep[1]?.tagUntil).toBeGreaterThan(1016);
  });

  it('reports moments on transitions only', () => {
    const seen: Moment[] = [];
    const g = new Game({ seed: 1, liveWeather: false, onMoment: (m) => seen.push(m) });
    g.frame(0, 16);
    g.dispatch({ type: 'pet', target: 'luna' });
    g.frame(16, 16);
    g.frame(32, 16);
    expect(seen).toEqual([{ kind: 'bubble', actor: 'Digital Luna', detail: 'heart', t: expect.any(Number) }]);
  });

  it('frozen stops the sim clock and holds the render clock; intents wait', () => {
    const g = new Game({ seed: 1, liveWeather: false });
    const before = g.frame(1000, 16);
    g.frozen = true;
    g.dispatch({ type: 'setWeather', weather: 'snow' });
    const held = g.frame(9000, 50);
    expect(g.renderNow).toBe(1000);
    expect(held.clockT).toBe(before.clockT);
    expect(held.weather).toBe('sun');
    g.frozen = false;
    expect(g.frame(9100, 100).weather).toBe('snow');
    expect(g.renderNow).toBe(9100);
  });

  it('reset gives the same world for the same seed', () => {
    const a = new Game({ seed: 9, liveWeather: false });
    const b = new Game({ seed: 9, liveWeather: false });
    for (let i = 1; i <= 30; i++) {
      a.frame(i * 16, 16);
      b.frame(i * 16, 16);
    }
    expect(a.sim).toEqual(b.sim);
    a.reset(9);
    expect(a.sim.clock.tick).toBe(0);
    expect(a.log).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { applyIntent, cloneState, createInitialState } from '@sheepcliff/sim';
import { liveView, simScalars } from './view';

describe('liveView', () => {
  it('takes clock, weather, season, temperature, banks and each fleece from the sim', () => {
    const sim = cloneState(createInitialState(1));
    applyIntent(sim, { type: 'setClock', t: 0.7 });
    applyIntent(sim, { type: 'setWeather', weather: 'snow' });
    applyIntent(sim, { type: 'setSeason', season: 'winter' });
    sim.banks = { wool: 4, coins: 12, owned: ['flowerbed'] };
    expect(simScalars(sim)).toEqual({ t: 0.7, weather: 'snow', season: 'winter', temp: sim.weather.temp });
    const v = liveView(sim, 5000, false);
    expect(v.clockT).toBe(0.7);
    expect(v.weather).toBe('snow');
    expect(v.season).toBe('winter');
    expect(v.temp).toBe(sim.weather.temp);
    expect(v.woolBank).toBe(4);
    expect(v.coins).toBe(12);
    expect(v.owned).toEqual(['flowerbed']);
    expect(v.sheep.map((s) => s.wool)).toEqual(sim.sheep.map((s) => s.wool));
  });

  it('keeps the fixture still life for what the sim does not move yet', () => {
    const v = liveView(createInitialState(1), 0, false);
    expect(v.sheep).toHaveLength(5);
    expect(v.sheep[0]?.name).toBe('Clover');
    expect(v.luna).toMatchObject({ x: 120, y: 280, anim: 'sit' });
    expect(v.farmer).not.toBeNull();
  });
});

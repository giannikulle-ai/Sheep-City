import { describe, expect, it } from 'vitest';
import { parseSceneParams } from './query';

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
    });
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
});

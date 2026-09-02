import { describe, expect, it } from 'vitest';
import {
  backgroundKey,
  clockLabel,
  isSnowy,
  phaseMix,
  phaseOf,
  tintAt,
  tintCss,
  PHASE_TINT,
} from './phase';

describe('phaseOf', () => {
  it('splits the clock like the prototype', () => {
    expect(phaseOf(0)).toBe('day');
    expect(phaseOf(0.419)).toBe('day');
    expect(phaseOf(0.42)).toBe('dusk');
    expect(phaseOf(0.52)).toBe('night');
    expect(phaseOf(0.919)).toBe('night');
    expect(phaseOf(0.92)).toBe('dawn');
    expect(phaseOf(0.999)).toBe('dawn');
  });
});

describe('phaseMix', () => {
  it('has no blend away from a boundary', () => {
    expect(phaseMix(0.2)).toEqual({ phase: 'day', mixTo: null, mix: 0 });
    expect(phaseMix(0.7)).toEqual({ phase: 'night', mixTo: null, mix: 0 });
  });

  it('fades the next phase in just before a boundary', () => {
    const m = phaseMix(0.42 - 0.0125);
    expect(m.phase).toBe('day');
    expect(m.mixTo).toBe('dusk');
    expect(m.mix).toBeCloseTo(0.25);
  });

  it('fades the previous phase out just after a boundary', () => {
    const m = phaseMix(0.52 + 0.0125);
    expect(m.phase).toBe('night');
    expect(m.mixTo).toBe('dusk');
    expect(m.mix).toBeCloseTo(0.25);
  });

  it('keeps the prototype quirk: dawn lingers over the first moments of day', () => {
    const m = phaseMix(0);
    expect(m.phase).toBe('day');
    expect(m.mixTo).toBe('dawn');
    expect(m.mix).toBeCloseTo(0.5);
  });
});

describe('tintAt', () => {
  it('is the phase tint away from a boundary', () => {
    expect(tintAt(0.7)).toEqual([...PHASE_TINT.night]);
  });
  it('blends across a boundary', () => {
    const t = tintAt(0.42 + 0.0125);
    const [r] = t;
    expect(r).toBeGreaterThan(1);
    expect(r).toBeLessThan(1.02);
  });
  it('formats with truncation like the prototype', () => {
    expect(tintCss([1.02, 0.78, 0.58])).toBe('rgb(260,198,147)');
    expect(tintCss([0.4, 0.48, 0.8])).toBe('rgb(102,122,204)');
  });
});

describe('backgrounds', () => {
  it('picks snow variants for snow weather or winter without live weather', () => {
    expect(isSnowy('sun', 'spring', false)).toBe(false);
    expect(isSnowy('snow', 'summer', false)).toBe(true);
    expect(isSnowy('sun', 'winter', false)).toBe(true);
    expect(isSnowy('sun', 'winter', true)).toBe(false);
    expect(backgroundKey('dusk', true)).toBe('snow_dusk');
    expect(backgroundKey('dawn', false)).toBe('dawn');
  });
});

describe('clockLabel', () => {
  it('starts the day at 06:00 and wraps', () => {
    expect(clockLabel(0)).toBe('06:00');
    expect(clockLabel(0.5)).toBe('18:00');
    expect(clockLabel(0.75)).toBe('00:00');
  });
});

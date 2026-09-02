import { describe, expect, it } from 'vitest';
import { createInitialState } from '@sheepcliff/sim';
import type { SpriteSizes } from './hit';
import { describeAt, parsePins, pinLine, pinsMarkdown, pinWorld, type Pin } from './pins';
import { liveView } from './view';

const SIZES: SpriteSizes = { sheep: { w: 32, h: 27 }, luna: { w: 44, h: 40 } };
const view = () => liveView(createInitialState(1), 0, false);

describe('describeAt', () => {
  it('names the nearest creature or landmark within 40 px', () => {
    expect(describeAt(view(), 142, 300, SIZES)).toBe('Digital Luna');
    expect(describeAt(view(), 150, 238, SIZES)).toBe('Clover');
    expect(describeAt(view(), 499, 276, SIZES)).toBe('lantern');
    expect(describeAt(view(), 350, 80, SIZES)).toBe('barn');
    expect(describeAt(view(), 600, 40, SIZES)).toBeNull();
  });
});

describe('pin text', () => {
  const pins: Pin[] = [
    { x: 499 / 640, y: 276 / 400, text: 'looks unrealistic', near: 'lantern', time: '' },
    { x: 0.5, y: 0.5, text: '', near: null, time: '' },
  ];

  it('rounds to world pixels', () => {
    expect(pinWorld(pins[0] as Pin)).toEqual({ x: 499, y: 276 });
  });

  it("writes the prototype's line format", () => {
    expect(pinLine(pins[0] as Pin, 0)).toBe('1. [lantern] looks unrealistic  (499, 276)');
    expect(pinLine(pins[1] as Pin, 1)).toBe('2. (no text)  (320, 200)');
  });

  it('heads the list with the clock and the weather', () => {
    expect(pinsMarkdown(pins, 0.47, 'rain').split('\n')).toEqual([
      '## Sheepcliff pins — 17:16 dusk, rain',
      '',
      '1. [lantern] looks unrealistic  (499, 276)',
      '2. (no text)  (320, 200)',
    ]);
    expect(pinsMarkdown([], 0.18, 'sun')).toBe('## Sheepcliff pins — 10:19 day\n');
  });

  it('reads stored pins back and drops junk', () => {
    expect(parsePins(null)).toEqual([]);
    expect(parsePins('not json')).toEqual([]);
    expect(parsePins('{"x":1}')).toEqual([]);
    expect(parsePins(JSON.stringify([{ x: 0.1, y: 0.2, text: 'hi', near: 'barn', time: 't' }, { y: 1 }, 'x']))).toEqual([
      { x: 0.1, y: 0.2, text: 'hi', near: 'barn', time: 't' },
    ]);
  });
});

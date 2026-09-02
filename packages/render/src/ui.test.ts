import { describe, expect, it } from 'vitest';
import { hudText, placeTags, type Tag } from './ui';
import { fixtureView } from './test-fixture';

describe('placeTags', () => {
  it('leaves separated tags where they are', () => {
    const tags: Tag[] = [
      ['Clover', 100, 50, '#000'],
      ['Daisy', 300, 50, '#000'],
    ];
    const p = placeTags(tags);
    expect(p.map((t) => t.top)).toEqual([50, 50]);
  });

  it('pushes an overlapping tag up by 14 and sorts by x', () => {
    const tags: Tag[] = [
      ['Daisy', 110, 52, '#000'],
      ['Clover', 100, 50, '#000'],
    ];
    const p = placeTags(tags);
    expect(p.map((t) => t.text)).toEqual(['Clover', 'Daisy']);
    expect(p[1]?.top).toBe(36);
  });

  it('gives up after six nudges', () => {
    const tags: Tag[] = Array.from({ length: 9 }, (_, i) => [`S${i}`, 100 + i, 50, '#000'] as const);
    const p = placeTags(tags);
    expect(Math.min(...p.map((t) => t.top))).toBe(50 - 14 * 6);
  });
});

describe('hudText', () => {
  it('composes the prototype HUD line', () => {
    const v = fixtureView();
    v.clockT = 0.25;
    v.woolBank = 2;
    v.coins = 7;
    v.temp = 13.6;
    expect(hudText(v, 'day')).toBe('☀ 12:00  3 sheep  2 wool  7 coins  14°');
    v.weather = 'rain';
    expect(hudText(v, 'night')).toMatch(/^☂ /);
    v.weather = 'snow';
    expect(hudText(v, 'night')).toMatch(/^❄ /);
    v.weather = 'sun';
    expect(hudText(v, 'night')).toMatch(/^☾ /);
  });
});

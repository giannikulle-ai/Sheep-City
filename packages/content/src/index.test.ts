import { describe, expect, it } from 'vitest';
import {
  CONTENT_PACKAGE, DISTRICT_IDS, EVENT_HOOK_OPS, FARM_EVENT_DECK, STORYBOOK_PLACEHOLDERS,
  eventCard, simHoursToMs, simMinutesToMs, storybookPlaceholders,
} from './index';

describe('@sheepcliff/content', () => {
  it('lists the four planned districts with the farm first', () => {
    expect(CONTENT_PACKAGE).toBe('@sheepcliff/content');
    expect(DISTRICT_IDS).toHaveLength(4);
    expect(DISTRICT_IDS[0]).toBe('farm');
  });
});

describe('the farm event deck', () => {
  it('has fifteen cards with unique ids', () => {
    expect(FARM_EVENT_DECK.district).toBe('farm');
    expect(FARM_EVENT_DECK.events).toHaveLength(15);
    expect(new Set(FARM_EVENT_DECK.events.map((e) => e.id)).size).toBe(15);
  });

  it('uses only the hook ops the Director implements', () => {
    const ops = new Set<string>(EVENT_HOOK_OPS);
    for (const card of FARM_EVENT_DECK.events) {
      for (const hook of [...card.hooks.start, ...card.hooks.end]) expect(ops.has(hook.op)).toBe(true);
    }
  });

  it('keeps every storybook line under 90 characters with known placeholders', () => {
    const known = new Set<string>(STORYBOOK_PLACEHOLDERS);
    for (const card of FARM_EVENT_DECK.events) {
      expect(card.storybook.line.length).toBeLessThan(90);
      for (const p of storybookPlaceholders(card.storybook.line)) expect(known.has(p)).toBe(true);
    }
    expect(storybookPlaceholders(eventCard('windfall').storybook.line)).toEqual(['dl', 'coins']);
  });

  it('looks cards up by id and throws on a typo', () => {
    expect(eventCard('fogMorning').hooks.start[0]).toEqual(expect.objectContaining({ op: 'setVisibility', value: 0.35 }));
    expect(() => eventCard('fogMorrning')).toThrow(/no event card/);
  });

  it('converts in-world time at the watching rate: a 180-second day', () => {
    expect(simMinutesToMs(1440)).toBe(180_000);
    expect(simMinutesToMs(8)).toBe(1000);
    expect(simHoursToMs(24)).toBe(180_000);
    expect(simHoursToMs(eventCard('merchantCaravan').cooldownSimHours)).toBe(240_000);
    expect(simMinutesToMs(eventCard('merchantCaravan').durationSimMinutes)).toBe(30_000);
  });
});

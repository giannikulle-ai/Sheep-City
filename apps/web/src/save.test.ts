import { describe, expect, it } from 'vitest';
import { advance, createInitialState, hashState, SaveError } from '@sheepcliff/sim';
import { awayLabel, ENVELOPE_FORMAT, restore, saveText } from './save';
import { addPage, EMPTY_PAGE_STORE, type StorybookPage } from './storybook';

const somePage: StorybookPage = {
  id: 'c0',
  title: 'a night',
  createdAt: 123,
  awayMs: 4000,
  fromMs: 0,
  toMs: 4000,
  lines: [{ entryId: 'c0', line: '3 wool banked', picture: 'wool' }],
};

describe('save text', () => {
  it('round-trips the world, the wall clock, and the page store', () => {
    const sim = advance(createInitialState(9), 37);
    const pages = addPage(EMPTY_PAGE_STORE, somePage);
    const text = saveText(sim, 1_700_000_000_000, pages);
    const doc = JSON.parse(text) as { format: string; savedAt: number; save: { format: string; version: number } };
    expect(doc.format).toBe(ENVELOPE_FORMAT);
    expect(doc.savedAt).toBe(1_700_000_000_000);
    expect(doc.save.format).toBe('sheepcliff-save');
    const r = restore(text);
    expect(r.savedAt).toBe(1_700_000_000_000);
    expect(hashState(r.sim)).toBe(hashState(sim));
    expect(r.sim.clock.tick).toBe(37);
    expect(r.pages).toEqual(pages);
  });

  it("accepts the sim's bare document, with no time to catch up and an empty page store", () => {
    const sim = createInitialState(3);
    const bare = JSON.stringify(JSON.parse(saveText(sim, 5)).save);
    const r = restore(bare);
    expect(r.savedAt).toBe(0);
    expect(hashState(r.sim)).toBe(hashState(sim));
    expect(r.pages).toEqual({});
  });

  it('accepts a pre-#42 envelope with no pages field: an empty page store, not a throw', () => {
    const sim = createInitialState(4);
    const doc = JSON.parse(saveText(sim, 9)) as { pages?: unknown };
    delete doc.pages;
    const r = restore(JSON.stringify(doc));
    expect(r.pages).toEqual({});
    expect(hashState(r.sim)).toBe(hashState(sim));
  });

  it('drops a malformed pages field rather than throwing', () => {
    const sim = createInitialState(4);
    const doc = JSON.parse(saveText(sim, 9)) as { pages?: unknown };
    doc.pages = 'not an object';
    const r = restore(JSON.stringify(doc));
    expect(r.pages).toEqual({});
  });

  it('refuses junk with a SaveError code', () => {
    expect(() => restore('not json')).toThrowError(SaveError);
    expect(() => restore('{"format":"sheepcliff-web-save","savedAt":1,"save":{"format":"x","version":3,"world":{}}}')).toThrowError(SaveError);
    try {
      restore('[]');
    } catch (e) {
      expect(e).toBeInstanceOf(SaveError);
    }
  });
});

describe('awayLabel', () => {
  it('labels spans the way a person would say them', () => {
    expect(awayLabel(45_000)).toBe('45 s');
    expect(awayLabel(7 * 60_000)).toBe('7 min');
    expect(awayLabel(3 * 3600_000 + 5 * 60_000)).toBe('3 h 05 min');
    expect(awayLabel(50 * 3600_000)).toBe('2 d 2 h');
  });
});

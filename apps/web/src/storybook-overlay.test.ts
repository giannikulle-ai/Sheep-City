import { describe, expect, it } from 'vitest';
import type { ChronicleEntry } from '@sheepcliff/sim';
import { buildStorybookPage, type StorybookPage } from './storybook';
import { subtitleFor } from './storybook-overlay';

// The card's subtitle says one absence twice: the real time away and the world time it turned
// (issue #42, the owner's change round — "real and world time"). Both are measurements of the same
// gap, read from the same bounds the title reads, so they cannot contradict each other. The DOM
// side of the overlay is covered by the e2e (storybook.spec.ts); this is the wording alone.

const entry = (over: Partial<ChronicleEntry>): ChronicleEntry => ({
  id: 'c0',
  atMs: 0,
  district: 'farm',
  line: '4 lambs born',
  picture: 'lamb',
  actors: [],
  source: 'ledger',
  notability: 1,
  first: false,
  facts: {},
  ...over,
});

/** A page for a real gap of `awayMs`, exactly as `tellGap` builds one: the same milliseconds in the
 * bounds and in the away time (the sim's ms are the host's ms, one to one). */
function pageFor(awayMs: number, periodSec: number): StorybookPage {
  const page = buildStorybookPage([entry({})], awayMs, 0, awayMs, 5000, periodSec);
  if (!page) throw new Error('no page');
  return page;
}

describe('subtitleFor', () => {
  const TWO_HOURS = 2 * 3600_000;

  it('says the real span and the world span, at each day length the tray offers', () => {
    // 1-minute day (actions.ts `day1`): two real hours is 120 farm days
    expect(subtitleFor(pageFor(TWO_HOURS, 60))).toBe('2 h 00 min · 120 farm days');
    // the default 3-minute day (`day3`)
    expect(subtitleFor(pageFor(TWO_HOURS, 180))).toBe('2 h 00 min · 40 farm days');
    // 10-minute day (`day10`)
    expect(subtitleFor(pageFor(TWO_HOURS, 600))).toBe('2 h 00 min · 12 farm days');
  });

  it('says a week away in both clocks', () => {
    const week = 7 * 24 * 3600_000;
    expect(subtitleFor(pageFor(week, 180))).toBe('7 d 0 h · 3360 farm days');
  });

  it('reads a gap shorter than a farm day without overstating it', () => {
    // a minute away on a 10-minute day: a tenth of a farm day, and the words say no more than that
    expect(subtitleFor(pageFor(60_000, 600))).toBe('1 min · less than half a farm day');
    // five minutes on a 10-minute day: half of one, and never "1 farm day"
    expect(subtitleFor(pageFor(5 * 60_000, 600))).toBe('5 min · half a farm day');
  });

  it('shows the real span alone for a page stored before world time existed', () => {
    const old: StorybookPage = { id: 'p1', title: 'a night', createdAt: 1, awayMs: TWO_HOURS, fromMs: 0, toMs: TWO_HOURS, lines: [], more: [] };
    expect(subtitleFor(old)).toBe('2 h 00 min'); // no world span invented for it after the fact
  });
});

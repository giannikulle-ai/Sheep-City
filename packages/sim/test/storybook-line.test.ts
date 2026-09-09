// Filling a storybook line (#114). The unit half of the fix; the population half — no chronicle
// entry anywhere carries a brace, across thirty seeds and thirty farm days watched and a week
// unwatched — is asserted in `engine-pace.test.ts`, where the world is already being run.
//
// The bug this pins: before this, `tell` stored the card's authored text, braces and all, and the
// player read "Three crows landed on the hay and {dl} sent them packing." on the storybook page.
import { describe, expect, it } from 'vitest';
import { STORYBOOK_PLACEHOLDERS, coinsMoved, fillStorybookLine } from '../src/chronicle/storybook-line';
import { FARM_DECK } from '../src/engine/deck';
import { startEvent } from '../src/engine/engine';
import { createInitialState } from '../src/state';

const FACTS = { flock: 5, coins: 0 };

describe('filling a storybook line', () => {
  it('names Digital Luna the way the client names her', () => {
    expect(fillStorybookLine('A fog came down at dawn and {dl} counted the flock by their bleats.', FACTS)).toBe(
      'A fog came down at dawn and Digital Luna counted the flock by their bleats.',
    );
  });

  it('capitalises a substitution that lands at the start of the line', () => {
    expect(fillStorybookLine('{lamb} got the zoomies and ran rings round the trough.', FACTS)).toBe(
      'A lamb got the zoomies and ran rings round the trough.',
    );
    expect(fillStorybookLine('The farmer found {lamb} by the gate.', FACTS)).toBe('The farmer found a lamb by the gate.');
  });

  it('reads {coins} as the amount the hook moved, and "no" when nothing moves', () => {
    // Decision 12 retired the farm's one transaction, so every card in the shipped deck is the
    // second case; the first is what a settlement card would get when one arrives.
    expect(fillStorybookLine('{dl} dug up a purse. {coins} coins.', { flock: 5, coins: 12 })).toBe('Digital Luna dug up a purse. 12 coins.');
    expect(fillStorybookLine('{dl} dug up a purse. {coins} coins.', FACTS)).toBe('Digital Luna dug up a purse. no coins.');
    expect(coinsMoved([{ op: 'coins', delta: 12 }])).toBe(12);
    expect(coinsMoved([{ op: 'mood', target: 'dl', delta: 0.1 }])).toBe(0);
    // And the shipped windfall, whose purse decision 12 took away, moves nothing.
    expect(coinsMoved(FARM_DECK.cards.find((c) => c.id === 'windfall')!.hooks.start)).toBe(0);
  });

  it('counts the flock for {flock}', () => {
    expect(fillStorybookLine('The farmer clipped {flock} fleeces.', { flock: 7, coins: 0 })).toBe('The farmer clipped 7 fleeces.');
  });

  it('throws on a placeholder it cannot fill, and on a brace that is not one', () => {
    expect(() => fillStorybookLine('{dl} dug up a {purse}.', FACTS)).toThrow(/no substitution for \{purse\}/);
    expect(() => fillStorybookLine('{DL} dug up a purse.', FACTS)).toThrow(/a brace the substitution cannot read/);
    // The allowed set is the table's own keys: allowed means fillable, and nothing else is allowed.
    expect([...STORYBOOK_PLACEHOLDERS].sort()).toEqual(['coins', 'dl', 'farmer', 'flock', 'lamb', 'merchant', 'sheep']);
  });

  it('fills every line the shipped deck carries', () => {
    for (const entry of FARM_DECK.byId.values()) {
      const event = entry.kind === 'card' ? entry.card : entry.event;
      const told = fillStorybookLine(event.storybook.line, FACTS);
      expect(told, event.id).not.toMatch(/[{}]/);
      expect(told.length, event.id).toBeGreaterThan(0);
    }
  });

  it('is what the watched path actually tells (`startEvent`), not a function nobody calls', () => {
    const state = createInitialState(3);
    const started = startEvent(state, FARM_DECK, 'crowsOnTheField', 'card');
    expect(started).not.toBeNull();
    const told = state.chronicle.entries.filter((e) => e.picture === 'crows');
    expect(told).toHaveLength(1);
    expect(told[0]!.line).toBe('Three crows landed on the hay and Digital Luna sent them packing.');
  });
});

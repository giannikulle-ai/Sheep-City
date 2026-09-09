// Filling a card's storybook line (#114). A line is authored with placeholders in braces — "Three
// crows landed on the hay and {dl} sent them packing." — and until this file existed nothing filled
// them: `tell` stored the brace and the client showed it to the player, on the page and in the
// goldens. CLAUDE.md's rule is that the storybook only tells, so the chronicle stores the finished
// sentence and the client never sees a brace.
//
// **One substitution point**, shared by the two places a card's line becomes a chronicle entry: the
// watched draw (`engine/engine.ts`'s `startEvent`) and the unwatched one (`ledger/unwatched.ts`'s
// `startUnwatched`). A week away has to read exactly as a watched night does, so both fill from
// this table and neither has a table of its own.
//
// The table is also **the allowed set**: a placeholder is allowed exactly when this file can fill
// it. `packages/content/src/index.ts` declares the same vocabulary for the deck's schema side and
// `packages/content/src/index.test.ts` pins the two equal, because the sim reads the deck's JSON and
// never imports the content package (see `engine/deck.ts`'s header). An unknown key is a bug in one
// lane or the other and is caught three times over: the deck schema's own `line` pattern rejects it
// in `validate.mjs`, the content package throws on it at deck load, and `fillStorybookLine` throws
// the first time such a line is told rather than quietly writing a brace into the chronicle.

import type { EventHook } from '../engine/deck';

/**
 * What the world knows at the moment a line is told, for the placeholders that are not a fixed
 * word. Both paths fill this from what they have: the watched one from the actors, the unwatched
 * one from the Ledger.
 */
export interface StorybookFacts {
  /** Sheep in the flock — what `{flock}` counts (fleeces, so grown sheep, not lambs). */
  flock: number;
  /** Coins this event's own hooks move, 0 when none do; `{coins}` reads "no" at 0. */
  coins: number;
}

/**
 * How each placeholder is filled.
 *
 * `{dl}` is **"Digital Luna"** — her name as the client already shows it everywhere the player can
 * read one: the action tray's own label (`apps/web/src/actions.ts`), the pin under the cursor
 * (`pins.ts`) and the intent line (`intents.ts`). The chronicle is a third place she is named and it
 * says the same thing.
 *
 * `{lamb}` and `{sheep}` are the indefinite "a lamb" / "a sheep" rather than a name: lambs carry no
 * name in this sim at all (`state.ts`'s `Lamb`), and the unwatched path has no actors to name, so a
 * named line would read differently depending on whether the player happened to be watching. The
 * two NPCs are "the farmer" and "the merchant", which is how every line in the deck already refers
 * to them.
 *
 * A substitution that lands at the very start of a line is capitalised, so "{lamb} got the zoomies"
 * tells as "A lamb got the zoomies".
 */
export const STORYBOOK_SUBSTITUTIONS = {
  dl: () => 'Digital Luna',
  lamb: () => 'a lamb',
  sheep: () => 'a sheep',
  farmer: () => 'the farmer',
  merchant: () => 'the merchant',
  coins: (facts: StorybookFacts) => (facts.coins === 0 ? 'no' : String(facts.coins)),
  flock: (facts: StorybookFacts) => String(facts.flock),
} as const satisfies Record<string, (facts: StorybookFacts) => string>;

export type StorybookPlaceholder = keyof typeof STORYBOOK_SUBSTITUTIONS;

/** The allowed set, which is the table's own keys: allowed means fillable. */
export const STORYBOOK_PLACEHOLDERS = Object.keys(STORYBOOK_SUBSTITUTIONS) as StorybookPlaceholder[];

/** The coins an event's start hooks move, the number `{coins}` says. 0 when no hook touches them. */
export function coinsMoved(hooks: readonly EventHook[]): number {
  let coins = 0;
  for (const hook of hooks) if (hook.op === 'coins') coins += hook.delta;
  return coins;
}

const PLACEHOLDER = /\{([a-z]+)\}/g;

/**
 * The authored line with every placeholder filled. Throws on a key this file cannot fill, and on a
 * brace left over from one it could not even read (`{DL}`, `{ dl }`): a line the chronicle cannot
 * finish is a bug in the deck, and a brace on the player's page is the bug #114 was filed for.
 */
export function fillStorybookLine(line: string, facts: StorybookFacts): string {
  if (!line.includes('{') && !line.includes('}')) return line;
  const filled = line.replace(PLACEHOLDER, (_whole, key: string, at: number) => {
    const fill = (STORYBOOK_SUBSTITUTIONS as Record<string, ((facts: StorybookFacts) => string) | undefined>)[key];
    if (!fill) {
      throw new Error(`storybook line "${line}": no substitution for {${key}} (known: ${STORYBOOK_PLACEHOLDERS.join(', ')})`);
    }
    const word = fill(facts);
    return at === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
  });
  if (filled.includes('{') || filled.includes('}')) {
    throw new Error(`storybook line "${line}": a brace the substitution cannot read (known: ${STORYBOOK_PLACEHOLDERS.join(', ')})`);
  }
  return filled;
}

// Scripted day: every sheep's state over one sim day (1,800 ticks of 100 ms) from seed 71.
//
// Each entry is the tick a change first shows, the sheep's name, and one word for what it is
// doing (see `describeSheep`): idle, toTuft / graze, toHay / hay, toTrough / drink, wander, rest,
// toBarn / barn; `*` ridden by DL, `+n` lambs in tow. Seed 71 was chosen because its day has the
// whole loop in it: grazing, a hay trip and a trough trip by day, Clover's lamb born at tick 32
// and growing up as Willow at 933, Digital Luna riding Daisy at 197, rest forced at night, and a
// daytime shower at 1539 that walks all six into the barn (Daisy first at 1588, Pepper last at
// 1776, and DL in after her at 1781) with the farmer's second visit arriving into it at 1585. The
// bird lands three times, and the shower leaves mud under the walk to the door.
//
// Seed 6 was the pinned day until #33: the bird's per-tick landing roll moves every later draw,
// so seed 6's day is a different day (no shower). Seed 71 was picked for having the whole loop.
//
// If the sheep needs weights, timers, or the tick order change on purpose, regenerate this list
// and say so in the PR: the owner pins the needs weights (gate high in the charter).
import { describe, expect, it } from 'vitest';
import { hashState } from '../src/hash';
import { createInitialState, type SimState } from '../src/state';
import { tick } from '../src/tick';
import { describeSheep } from './sheep-helpers';

const TICKS_PER_DAY = 1800;

const EXPECTED = [
  '1 Clover idle',
  '1 Daisy idle',
  '1 Biscuit idle',
  '1 Pepper idle',
  '1 Maple idle',
  '8 Pepper toTuft',
  '10 Maple toTuft',
  '32 Clover idle+1',
  '37 Biscuit toTuft',
  '45 Clover toTuft+1',
  '48 Daisy toTuft',
  '60 Pepper graze',
  '63 Clover graze+1',
  '79 Maple graze',
  '87 Daisy graze',
  '106 Biscuit graze',
  '139 Maple idle',
  '141 Daisy idle',
  '144 Daisy graze',
  '145 Maple toTrough',
  '168 Pepper idle',
  '191 Maple drink',
  '197 Daisy graze*',
  '201 Maple idle',
  '212 Biscuit idle',
  '231 Daisy walk*',
  '231 Maple toTuft',
  '234 Pepper toTuft',
  '236 Clover idle+1',
  '253 Daisy idle*',
  '258 Daisy idle',
  '267 Pepper graze',
  '275 Maple graze',
  '299 Clover toHay+1',
  '301 Daisy toTuft',
  '329 Maple idle',
  '348 Biscuit toTuft',
  '359 Maple wander',
  '379 Daisy graze',
  '383 Biscuit graze',
  '395 Biscuit idle',
  '406 Maple idle',
  '408 Maple wander',
  '444 Pepper idle',
  '464 Pepper toTuft',
  '496 Biscuit graze',
  '500 Pepper graze',
  '528 Pepper idle',
  '538 Clover hay+1',
  '556 Daisy idle',
  '579 Maple idle',
  '588 Daisy wander',
  '589 Maple toTuft',
  '613 Pepper rest',
  '643 Maple graze',
  '644 Biscuit idle',
  '645 Biscuit rest',
  '679 Maple idle',
  '680 Maple rest',
  '773 Daisy idle',
  '774 Daisy rest',
  '896 Daisy rest+1',
  '933 Clover hay',
  '933 Willow rest',
  '1126 Clover idle',
  '1127 Clover rest',
  '1336 Maple idle',
  '1348 Clover idle',
  '1349 Maple graze',
  '1359 Pepper idle',
  '1365 Willow idle',
  '1367 Daisy idle+1',
  '1391 Clover toTrough',
  '1408 Pepper toTrough',
  '1460 Daisy toTuft+1',
  '1493 Clover drink',
  '1501 Biscuit idle',
  '1509 Willow wander',
  '1515 Biscuit graze',
  '1525 Daisy graze+1',
  '1526 Maple idle',
  '1539 Maple toBarn',
  '1588 Daisy barn+1',
  '1609 Biscuit barn',
  '1610 Willow idle',
  '1611 Willow toBarn',
  '1645 Pepper drink',
  '1668 Clover barn',
  '1684 Maple barn',
  '1730 Willow barn',
  '1776 Pepper barn',
];

/** Weather, visitors, DL's barn entry, and the bird on the same day, for the shape of the story. */
const EVENTS = [
  '165 bird lands',
  '225 bird leaves',
  '361 farmer true',
  '451 merchant true',
  '596 bird lands',
  '666 bird leaves',
  '852 merchant false',
  '1103 bird lands',
  '1170 bird leaves',
  '1226 farmer false',
  '1539 rain true',
  '1585 farmer true',
  '1781 luna in',
];

function scriptedDay(seed: number): { transitions: string[]; events: string[]; state: SimState } {
  let s = createInitialState(seed);
  const transitions: string[] = [];
  const events: string[] = [];
  const last: string[] = [];
  let rain = false;
  let farmer = false;
  let merchant = false;
  let lunaIn = false;
  let bird = 'none';
  for (let i = 0; i < TICKS_PER_DAY; i++) {
    s = tick(s);
    s.sheep.forEach((q, j) => {
      const key = describeSheep(q);
      if (last[j] !== key) {
        transitions.push(`${s.clock.tick} ${q.name} ${key}`);
        last[j] = key;
      }
    });
    if (s.weather.rain !== rain) {
      rain = s.weather.rain;
      events.push(`${s.clock.tick} rain ${rain}`);
    }
    if (!!s.npcs.farmer !== farmer) {
      farmer = !!s.npcs.farmer;
      events.push(`${s.clock.tick} farmer ${farmer}`);
    }
    if (!!s.npcs.merchant !== merchant) {
      merchant = !!s.npcs.merchant;
      events.push(`${s.clock.tick} merchant ${merchant}`);
    }
    if (s.luna.inBarn && !lunaIn) {
      lunaIn = true;
      events.push(`${s.clock.tick} luna in`);
    }
    const now = s.life.bird ? s.life.bird.state : 'none';
    if (now !== bird) {
      if (now === 'sit') events.push(`${s.clock.tick} bird lands`);
      if (now === 'none') events.push(`${s.clock.tick} bird leaves`);
      bird = now;
    }
  }
  return { transitions, events, state: s };
}

describe('scripted sheep day', () => {
  it('seed 71: the sequence of every sheep state over one sim day', () => {
    const { transitions, events, state } = scriptedDay(71);
    expect(state.clock.tick).toBe(TICKS_PER_DAY);
    expect(events).toEqual(EVENTS);
    expect(transitions).toEqual(EXPECTED);
    expect(state.sheep.map((q) => q.name)).toEqual(['Clover', 'Daisy', 'Biscuit', 'Pepper', 'Maple', 'Willow']);
    expect(state.banks.wool).toBe(5); // the farmer's afternoon shearing, sold on the merchant's next visit
    expect(state.banks.coins).toBe(0);
    // The shower is still on at midnight: the walk to the barn left mud, and there is no snow to print.
    expect(state.ground.prints).toEqual([]);
    expect(state.ground.mud.length).toBe(MUD_AT_DAY_END);
  });

  // The hash covers the whole end-of-day state, so it moved in #39 for the schema only (save v5:
  // `ledger`, `lastLedgerAt`); the lists above did not, and test/ledger.test.ts pins this day on
  // its v4 view to the hash from before.
  it('seed 71 twice gives the same day and the same hash', () => {
    const a = scriptedDay(71);
    const b = scriptedDay(71);
    expect(a.transitions).toEqual(b.transitions);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.state)).toBe('779eafbf4da9aa0d');
  });

  it('the shape of the day holds for other seeds: needs by day, rest by night, in the barn in rain', () => {
    for (const seed of [1, 2, 3, 4, 8, 10]) {
      const { transitions, events, state } = scriptedDay(seed);
      const text = transitions.join('\n');
      expect(text, `seed ${seed}`).toMatch(/^\d+ \w+ (toTuft|toHay|toTrough)$/m);
      expect(text, `seed ${seed}`).toMatch(/^\d+ \w+ graze/m);
      // Night begins at .52, tick 612: nobody picks a need after that until dawn at .92, tick 1332.
      // (A wander at night is a sheep stepping out of the barn when a shower ends.)
      for (const line of transitions) {
        const [tickText, , what] = line.split(' ') as [string, string, string];
        const t = Number(tickText);
        if (t > 620 && t < 1332) expect(what, `seed ${seed}: ${line}`).not.toMatch(/^(toTuft|toHay|toTrough)/);
      }
      if (events.some((e) => /rain true/.test(e))) expect(text, `seed ${seed}`).toMatch(/^\d+ \w+ toBarn/m);
      expect(events, `seed ${seed}`).toContain('361 farmer true');
      expect(events, `seed ${seed}`).toContain('451 merchant true');
      // Prints only ever lie on snowy ground, and the flock walking in from a shower leaves mud.
      if (state.weather.kind !== 'snow') expect(state.ground.prints, `seed ${seed}`).toEqual([]);
    }
  });
});

/** Mud patches on the ground at the end of seed 71's day: the shower's walk to the barn, none faded yet. */
const MUD_AT_DAY_END = 157;

// Scripted day: every sheep's state over one sim day (1,800 ticks of 100 ms) from seed 6.
//
// Each entry is the tick a change first shows, the sheep's name, and one word for what it is
// doing (see `describeSheep`): idle, toTuft / graze, toHay / hay, toTrough / drink, wander, rest,
// toBarn / barn; `*` ridden by DL, `+n` lambs in tow. Seed 6 was chosen because its day has the
// whole loop in it: grazing and a trough trip by day, rest forced at night, Maple's lamb born at
// tick 179 and growing up as Willow at 1080, a night shower at 1138 that walks all six into the
// barn (Biscuit first at 1193, Daisy last at 1265, and Digital Luna in after her at 1271), the
// flock wandering back out when it clears at 1489, and DL riding Daisy and Maple in the morning.
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
  '29 Pepper toTuft',
  '64 Pepper graze',
  '81 Clover toTuft',
  '92 Maple toTuft',
  '99 Biscuit toTuft',
  '104 Daisy toTuft',
  '130 Biscuit graze',
  '135 Maple graze',
  '139 Maple idle',
  '143 Maple graze',
  '149 Daisy graze',
  '170 Clover graze',
  '175 Pepper idle',
  '179 Maple graze+1',
  '199 Maple idle+1',
  '224 Daisy idle',
  '232 Maple wander+1',
  '263 Biscuit idle',
  '329 Biscuit rest',
  '335 Pepper toTuft',
  '339 Clover idle',
  '364 Pepper graze',
  '365 Biscuit idle',
  '430 Clover toTuft',
  '430 Daisy toTrough',
  '455 Clover graze',
  '504 Maple idle+1',
  '531 Maple toTuft+1',
  '541 Pepper idle',
  '552 Clover idle',
  '561 Daisy drink',
  '561 Maple graze+1',
  '577 Clover wander',
  '613 Biscuit rest',
  '613 Pepper rest',
  '738 Maple idle+1',
  '739 Maple rest+1',
  '758 Daisy idle',
  '759 Daisy rest',
  '834 Clover idle',
  '835 Clover rest',
  '919 Pepper rest+1',
  '1080 Maple rest',
  '1080 Willow rest',
  '1138 Clover toBarn',
  '1138 Daisy toBarn',
  '1138 Biscuit toBarn',
  '1138 Pepper toBarn+1',
  '1138 Maple toBarn',
  '1138 Willow toBarn',
  '1193 Biscuit barn',
  '1238 Clover barn',
  '1251 Willow barn',
  '1259 Pepper barn+1',
  '1260 Maple barn',
  '1265 Daisy barn',
  '1489 Clover wander',
  '1489 Daisy wander',
  '1489 Biscuit wander',
  '1489 Pepper wander+1',
  '1489 Maple wander',
  '1489 Willow wander',
  '1569 Daisy idle*',
  '1570 Biscuit idle',
  '1574 Daisy wander*',
  '1600 Biscuit toTrough',
  '1605 Pepper idle+1',
  '1608 Pepper wander+1',
  '1630 Daisy wander',
  '1669 Maple idle',
  '1682 Daisy idle',
  '1696 Maple wander',
  '1698 Pepper idle+1',
  '1719 Willow idle',
  '1734 Clover idle',
  '1740 Clover toTuft',
  '1746 Maple idle*',
  '1749 Daisy toTuft',
  '1750 Maple wander*',
  '1778 Daisy graze',
  '1787 Clover graze',
  '1792 Clover graze+1',
  '1794 Willow toTuft',
  '1800 Biscuit drink',
];

/** Weather, visitors, and DL's barn entry on the same day, for the shape of the story. */
const EVENTS = [
  '361 farmer true',
  '451 merchant true',
  '852 merchant false',
  '1138 rain true',
  '1271 luna in',
  '1312 farmer false',
  '1489 rain false',
  '1585 farmer true',
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
  }
  return { transitions, events, state: s };
}

describe('scripted sheep day', () => {
  it('seed 6: the sequence of every sheep state over one sim day', () => {
    const { transitions, events, state } = scriptedDay(6);
    expect(state.clock.tick).toBe(TICKS_PER_DAY);
    expect(events).toEqual(EVENTS);
    expect(transitions).toEqual(EXPECTED);
    expect(state.sheep.map((q) => q.name)).toEqual(['Clover', 'Daisy', 'Biscuit', 'Pepper', 'Maple', 'Willow']);
    expect(state.banks.wool).toBe(5); // the farmer's afternoon shearing, sold on the merchant's next visit
    expect(state.banks.coins).toBe(0);
  });

  it('seed 6 twice gives the same day and the same hash', () => {
    const a = scriptedDay(6);
    const b = scriptedDay(6);
    expect(a.transitions).toEqual(b.transitions);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.state)).toBe('e5b39612b8ea0929');
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
    }
  });
});

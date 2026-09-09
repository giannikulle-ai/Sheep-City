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
import { advance, tick } from '../src/tick';
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
  // The farmer's two dawn lines are the event engine's own category action (#40), not the sheep's:
  // he walks past to the market at dawn (tick 1333 to 1470). This day's card draw has moved once per
  // round as the pacing was tuned: 15/416 when #40 first landed, 30/431 in Round 1's finding 2
  // (`evalEverySimMinutes` 1 -> 2), 483/884 after Round 1's density retune, then no merchant at all
  // in Round 2, where the corrected 480-sim-minute warm-up ate past most of his `timeOfDay in
  // [day, dusk]` window and `windfall` drew instead at tick 1558.
  //
  // Round 3 moved it once more, and not because a pacing number changed: trunk's #83 put Digital
  // Luna's birthday on a real calendar date (December 15) and this engine defers that trigger to
  // #84, so `dlBirthday` no longer starts in the first tenth of a second of every world, every
  // seed's draw stream shifted, and the merchant came back for one visit at tick 600 to 1001.
  //
  // **#101 takes him out again, and this time it is the owner's own decision rather than a pacing
  // number.** `merchantCaravan` is a **big** card now (plan decision 16: the caravan is one of the
  // set pieces), so it is drawn at about three a farm *month* and held to a four-farm-day gap — a
  // single farm day is not where a big thing usually lands. Measured over the same thirty seeds and
  // thirty farm days, the merchant still comes: **27 of 30 seeds see at least one visit a farm
  // month, median 1, range 0 to 3** (the block at the bottom of this file pins that). What is gone
  // is his showing up on day one, and nothing else on this day moved: every sheep transition above,
  // and every other line here, is exactly what this day was before the engine existed.
  '165 bird lands',
  '225 bird leaves',
  '361 farmer true',
  '596 bird lands',
  '666 bird leaves',
  '1103 bird lands',
  '1170 bird leaves',
  '1226 farmer false',
  '1333 farmer true',
  '1470 farmer false',
  '1539 rain true',
  '1585 farmer true',
  '1781 luna in',
];

function scriptedDay(seed: number, options: { events?: boolean } = {}): { transitions: string[]; events: string[]; state: SimState } {
  let s = createInitialState(seed, options);
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
    expect(state.banks.wool).toBe(5); // the farmer's afternoon shearing; nothing sells it this day
    // Zero coins, and no merchant involved: with `merchantCaravan` a **big** card as of #101, the
    // draw this day lands on is still `windfall` (a small one, same as the #101-alone pin), but
    // **re-pinned again for #86's merge**: decision 12 ("no transaction on the farm") drops
    // `windfall`'s `coins` hook entirely — the card still fires on this exact day, DL still digs by
    // the tree, but the find is a `mood` bump now, not twelve coins in the bank. Before #86 merged
    // this line read 12; before #101 it read 0 for a different reason (the merchant came at tick
    // 600, hours before the farmer's afternoon shearing put five fleeces in the bank, so he found
    // nothing to buy and left empty-handed) — this round it is 0 again, and honestly this time: no
    // card on the shipped deck moves a coin any more (see `farm.json`'s own comment on `windfall`).
    expect(state.banks.coins).toBe(0);
    // The shower is still on at midnight: the walk to the barn left mud, and there is no snow to print.
    expect(state.ground.prints).toEqual([]);
    expect(state.ground.mud.length).toBe(MUD_AT_DAY_END);
  });

  // The hash covers the whole end-of-day state, so it moved in #39 for the schema only (save v5:
  // `ledger`, `lastLedgerAt`); the lists above did not, and test/ledger.test.ts pins this day on
  // its v4 view to the hash from before. It moved again in #60 for the schema only (save v6:
  // `chronicle`, empty since nothing here calls `tell`); the lists above still did not, and
  // test/chronicle.test.ts pins this day on its v5 view to the hash from before. It moved a third
  // time in #40, and this one is not schema-only: the engine draws cards on this day and its own
  // slice is on the state. It moved a fourth time in Round 2 (#82), for the warm-up fix, and a
  // fifth in Round 3, because deferring `dlBirthday`'s new `realDate` trigger to #84 takes the
  // birthday out of the first tenth of a second of every world and shifts every seed's draw stream
  // with it (see `EVENTS`'s own comment above). It moved a sixth time in **#101**, where the draw
  // became two decisions a look instead of one (a small one and a big one, each with its own gap
  // and its own chance), so the engine's generator is consumed differently from the first look
  // onwards and every seed's card draws shift with it: `24517bbf7e9a89d5` → `550c55dafd2ae243`. The
  // *sheep* list above did not move by a single line on any of the six; test/engine-parity.test.ts
  // pins this day with the engine off, on its v6 view, to the hash from before #40.
  //
  // It moved a seventh time merging **#86 into #101**: `550c55dafd2ae243` → `b88ada428b712422`.
  // `EVENTS` above and every sheep transition were byte-for-byte the same as the #101-alone pin —
  // the world lane's widened `conditions` do not touch this scripted day's own card draw or NPC
  // timing — the only thing that moved was the state itself, because `windfall`'s dropped `coins`
  // hook (decision 12, see the coins assertion above) leaves `state.banks.coins` at 0 instead of 12.  //
  // It moved an eighth time in the same branch's round 3: `b88ada428b712422` →
  // `db82b911ed86c1f8`, for two reasons at once and neither of them the sheep. The small draw rate
  // is now derived from the owner's own target (four farm days in five, `PACE_TARGETS`'
  // `smallDaysInFive` through `SMALL_RATE_FOR_DAYS_IN_FIVE`: 1.25 rather than the bare 8), which
  // shifts this day's card draws; and every storybook line is filled before it is told (#114), so
  // the chronicle entries inside the hashed state now read "Digital Luna" where they read "{dl}".
  // `EVENTS` above and every sheep transition are byte-for-byte the same as the #86-merge pin.
  //
  // It moved a ninth time in **#84**, schema-only: `db82b911ed86c1f8` → `7cbfaceab05ef214`.
  // `season` now carries `realEpochMs` and `seed` (and so does the Ledger snapshot's copy of it),
  // the two numbers the real-year calendar is read from, and the state is v8. A world made without
  // a real time starts on April 1 (`DEFAULT_REAL_EPOCH_MS`), which is spring on every seed — the
  // same season the old nine-day wheel started every world in — so not one draw, card or NPC
  // timing moved: `EVENTS` above and every sheep transition are byte-for-byte the same again, and
  // test/calendar.test.ts pins this day's **v7 view** to `db82b911ed86c1f8`, the value above.
  it('seed 71 twice gives the same day and the same hash', () => {
    const a = scriptedDay(71);
    const b = scriptedDay(71);
    expect(a.transitions).toEqual(b.transitions);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.state)).toBe('7cbfaceab05ef214');
  });

  // Round 1 verifier finding 4 (#82): the PR claims "the sheep's 91 transitions at seed 71 are
  // unchanged with the engine directing". `scriptedDay` above already runs with the engine ON by
  // default (`createInitialState`'s own default), so `EXPECTED` is already that engine-on list; this
  // pins the claim itself as an equality, not just each side separately matching a hand-written
  // list. The *events* list is not part of the claim — the merchant's draw and the dawn walk are the
  // engine's own lines, and are expected to differ (see EVENTS's own comment above).
  it('the engine directing changes nothing about the sheep: seed 71’s transitions are identical on and off', () => {
    const off = scriptedDay(71, { events: false }).transitions;
    const on = scriptedDay(71, { events: true }).transitions;
    expect(on).toEqual(EXPECTED);
    expect(off).toEqual(on);
  });

  it('the shape of the day holds for other seeds: needs by day, rest by night, in the barn in rain', () => {
    const seeds = [1, 2, 3, 4, 8, 10];
    for (const seed of seeds) {
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
      // Prints only ever lie on snowy ground, and the flock walking in from a shower leaves mud.
      if (state.weather.kind !== 'snow') expect(state.ground.prints, `seed ${seed}`).toEqual([]);
    }
  });

  // How often the merchant comes at all, measured rather than assumed. This used to be a
  // single-sim-day count (6 of 30 seeds at the last head) and **#101 restates it over a farm
  // month**, because a day is no longer the right window to ask the question in: the owner made
  // `merchantCaravan` a **big** card (plan decision 16), and big things are drawn at about three a
  // thirty-farm-day month behind a four-farm-day gap. Asking "did he come today" of a card paced a
  // few times a month measures luck, not the pace.
  //
  // Re-measured twice on this branch, `advance()`-driven, thirty farm days each, no scripting.
  // Merging #86 into #101 took it from the #101-alone 27 of 30 to **20 of 30**: the world lane's
  // own #86 narrowed `merchantCaravan`'s window from day or dusk to day-only (decision 12: a road
  // event has no reason to keep the old trade window) — half the eligible clock the card competes
  // for its share of the generator against every other `big` card in. **Re-measured again at the
  // small draw rate the owner's four-in-five target sets (1.25 rather than the bare 8): 19 of 30
  // seeds see at least one visit, median 1, range 0 to 2**, the eleven that see none being seeds 2,
  // 6, 8, 10, 14, 15, 20, 24, 25, 29 and 30. Both moves are the same story — a rarer merchant is
  // the narrowed window and the quieter draw doing what their own comments say they do, not a
  // regression.
  //
  // The floor is 18 of 30 and the measurement is 19, which is **one seed of margin** — the
  // thinnest it has been. It is deliberately not lowered (a floor that follows the measurement down
  // is not a floor), and it is called out in PR #99's own weak spots: the next thing that narrows
  // this card, or the next rate change, should re-measure here first. The failure message names the
  // seeds that survived so the next reader can see which ones went rather than just that a count
  // moved. Nothing yet implements plan
  // line 11's "the merchant comes when there is wool to sell" — his card's only conditions are "he
  // isn't here already" and "it's day" (`packages/content/events/farm.json`, the world lane's, day
  // and no longer dusk as of #86) — so which day he comes is still a coin flip, only a rarer one.
  it('the merchant still shows up over a farm month, just rarely, seeds 1-30', () => {
    const seen: number[] = [];
    const misses: number[] = [];
    const visits: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      let s = createInitialState(seed);
      let n = 0;
      let had = s.npcs.merchant !== null;
      for (let i = 0; i < TICKS_PER_DAY * 30; i++) {
        s = advance(s, 1);
        const now = s.npcs.merchant !== null;
        if (now && !had) n++;
        had = now;
      }
      visits.push(n);
      if (n > 0) seen.push(seed);
      else misses.push(seed);
    }
    expect(
      seen.length,
      `the merchant came on ${seen.length} of seeds 1-30 over a farm month (measured 19 at this head, at the small rate the four-in-five target sets; missed 2, 6, 8, 10, 14, 15, 20, 24, 25, 29, 30). Seen on: ${seen.join(', ')}. Missed: ${misses.join(', ')}. Visits: ${visits.join(',')}`,
    ).toBeGreaterThanOrEqual(18);
    expect(Math.max(...visits), `visits per farm month: ${visits.join(',')} (measured max 2)`).toBeLessThanOrEqual(8);
  }, 900_000);
});

/** Mud patches on the ground at the end of seed 71's day: the shower's walk to the barn, none faded yet. */
const MUD_AT_DAY_END = 157;

// Scripted day: Digital Luna's states over one sim day (1,800 ticks of 100 ms) from seed 11.
//
// Each entry is the tick a change first shows, then `anim/routine[/flags] weather phase`. Flags:
// R riding, M mounting, C chasing the rabbit, B in the barn, S a stick is out. Seed 11's day has
// the whole chain in it: a rabbit chase, a ride, a nibble, bed at dusk, the farmer's afternoon
// visit running into the night (five sheep to shear) so that his pat at tick 1054 gets her out of
// bed and back (the "pant/asleep" and "sit/asleep" entries are that pat landing on a dog already
// back asleep, as the prototype has it), the dawn stretch, stick zoomies, three flops. No shower
// this day; rain shelter is pinned in luna.test.ts and sheep.test.ts instead.
//
// Seed 5 was the pinned day until #33: the bird now rolls for a landing every tick it is away (the
// prototype's `Math.random() < dt * .03`), and that draw moves every later one, so seed 5's day is
// a different day (no ride, no stick). Seed 11 was picked for having the whole chain again.
//
// If DL's priority order or any of her timers change on purpose, regenerate this list and say so
// in the PR: the owner pins the behaviour order.
// The hash below covers the whole end-of-day state, `SAVE_VERSION` included, so it also moves on a
// save-schema bump even when this list does not; say which of the two moved in the PR. It moved
// in #39 for the schema only (save v5: `ledger`, `lastLedgerAt`); the list did not, and
// test/ledger.test.ts pins this day on its v4 view to the hash from before. It moved again in #60
// for the schema only (save v6: `chronicle`, empty since nothing here calls `tell`); the list
// still did not, and test/chronicle.test.ts pins this day on its v5 view to the hash from before.
// It moved a third time in #40, and that one is not schema-only: the engine directs this day. Round
// 1 shipped drawing six events on it (DL's birthday, the merchant's cart, lamb zoomies, a stray
// cat, a fog morning, and shearing day). It moved a fourth time in Round 2 (#82): fixing
// `warmupSimMinutes` to the owner's actual "no draws in a fresh world's first minute" (480
// sim-minutes, not the 60 Round 1's own comment miscounted by 8x — see `engine/pacing.ts`) leaves
// this day only three: DL's birthday (an authored punctuation, not gated by the warm-up), a stray
// cat (tick 833 to 1023), and the farmer's dawn market walk (a category action, also ungated) —
// read them off `state.chronicle`. Her list below did not move by a single line either time: none
// of those writes to her, and `fetchLamb`, the one behaviour #40 added to her chain, never runs on
// this day because `lostLamb` is not among them. test/engine-parity.test.ts pins this same day
// with the engine off, on its v6 view, to the hash from before #40.
import { describe, expect, it } from 'vitest';
import { phaseOf } from '../src/clock';
import { hashState } from '../src/hash';
import { createInitialState, type SimState } from '../src/state';
import { tick } from '../src/tick';

const TICKS_PER_DAY = 1800;

const EXPECTED = [
  '1 sit/- sun day',
  '71 run/-/C sun day',
  '166 sit/- sun day',
  '237 sit/-/M sun day',
  '238 run/-/M sun day',
  '255 run/-/R sun day',
  '316 pant/- sun day',
  '342 sit/- sun day',
  '413 run/- sun day',
  '422 nibble/- sun day',
  '433 run/bed sun dusk',
  '488 sleep/asleep sun dusk',
  '613 sleep/asleep sun night',
  '1054 run/- sun night',
  '1055 run/bed sun night',
  '1075 sleep/asleep sun night',
  '1081 pant/asleep sun night',
  '1107 sit/asleep sun night',
  '1333 stretch/- sun dawn',
  '1361 sit/- sun dawn',
  '1432 stick/- sun dawn',
  '1461 sit/- sun dawn',
  '1477 sit/- sun day',
  '1532 flop/- sun day',
  '1583 sit/- sun day',
  '1654 flop/- sun day',
  '1705 sit/- sun day',
  '1776 flop/- sun day',
];

function describeLuna(s: SimState): string {
  const l = s.luna;
  const flags = `${l.riding ? 'R' : ''}${l.mounting ? 'M' : ''}${l.chasing ? 'C' : ''}${l.inBarn ? 'B' : ''}${l.stick ? 'S' : ''}`;
  return `${l.anim}/${l.routine ?? '-'}${flags ? '/' + flags : ''} ${s.weather.kind} ${phaseOf(s.clock.t)}`;
}

function scriptedDay(seed: number, options: { events?: boolean } = {}): { transitions: string[]; state: SimState } {
  let s = createInitialState(seed, options);
  const transitions: string[] = [];
  let last = '';
  for (let i = 0; i < TICKS_PER_DAY; i++) {
    s = tick(s);
    const key = describeLuna(s);
    if (key !== last) {
      transitions.push(`${s.clock.tick} ${key}`);
      last = key;
    }
  }
  return { transitions, state: s };
}

describe('scripted day', () => {
  it('seed 11: the sequence of DL states over one sim day', () => {
    const { transitions, state } = scriptedDay(11);
    expect(state.clock.tick).toBe(TICKS_PER_DAY);
    expect(state.clock.dayCount).toBe(1);
    expect(transitions).toEqual(EXPECTED);
  });

  // The hash covers the whole end-of-day state. It moved in Round 2 (#82) for the `warmupSimMinutes`
  // fix; again in Round 3, when trunk's #83 put Digital Luna's birthday on a real calendar date and
  // this engine deferred that trigger to #84 so `dlBirthday` no longer started at tick 0 of every
  // world; and now in **#101**, where the draw is two decisions a look instead of one (a small one
  // and a big one, each with its own gap and its own chance), so the engine's generator is consumed
  // differently from the first look at the world onwards and every seed's card draws shift with it:
  // `b3da5ab0c4e981ed` → `7c413f504c6d5a57`.
  // Her transitions above did not move by a line on any of the three — the test below pins that as
  // an equality, not by eye, and it is the point of re-pinning the hash rather than loosening it.
  it('seed 11 twice gives the same day and the same hash', () => {
    const a = scriptedDay(11);
    const b = scriptedDay(11);
    expect(a.transitions).toEqual(b.transitions);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.state)).toBe('7c413f504c6d5a57');
  });

  // Round 1 verifier finding 4 (#82): the PR claims "her 28 transitions at seed 11 are unchanged
  // with the engine directing" — `scriptedDay` above already runs with the engine ON by default
  // (`createInitialState`'s own default), so `EXPECTED` above is already that engine-on list. This
  // pins the claim itself, not just its result: engine off and engine on produce the exact same
  // transition list on this seed, so the equality — not just each side separately matching a
  // hand-written list — is what a future change to either side would have to break.
  it('the engine directing changes nothing about her: seed 11’s transitions are identical on and off', () => {
    const off = scriptedDay(11, { events: false }).transitions;
    const on = scriptedDay(11, { events: true }).transitions;
    expect(on).toEqual(EXPECTED);
    expect(off).toEqual(on);
  });

  it('the shape of the day holds for other seeds: bed at dusk, asleep by night, up by day', () => {
    for (const seed of [1, 2, 5, 42]) {
      const { transitions } = scriptedDay(seed);
      const text = transitions.join('\n');
      expect(text, `seed ${seed}`).toMatch(/^433 run\/bed sun dusk$/m);
      expect(text, `seed ${seed}`).toMatch(/^\d+ sleep\/asleep sun dusk$/m);
      // Either the dawn stretch at .92 (tick 1333), or a shower had her up at the door already.
      expect(text, `seed ${seed}`).toMatch(/^1333 stretch\/- sun dawn$|^\d+ \S+\/shelterWait rain (night|dawn)$/m);
      expect(text, `seed ${seed}`).toMatch(/^1477 \S+ sun day$/m);
    }
  });
});

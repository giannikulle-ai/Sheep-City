// Scripted day: Digital Luna's states over one sim day (1,800 ticks of 100 ms) from seed 5.
//
// Each entry is the tick a change first shows, then `anim/routine[/flags] weather phase`. Flags:
// R riding, M mounting, C chasing the rabbit, B in the barn, S a stick is out. Seed 5's day has
// most of the chain in it: two nibbles, a ride, bed at dusk, the farmer's afternoon visit running
// into the night (five sheep to shear) so that his pat at tick 1074 gets her out of bed and back
// (the "pant/asleep" and "sit/asleep" entries are that pat landing on a dog already back asleep,
// as the prototype has it), the dawn stretch, stick zoomies, a rabbit chase. No shower this day:
// the sheep now draw from the generator before the weather roll, so the seed-5 day from part (a)
// (which had a night shower) is not the same day. Rain shelter is pinned in luna.test.ts and
// sheep.test.ts instead.
//
// If DL's priority order or any of her timers change on purpose, regenerate this list and say so
// in the PR: the owner pins the behaviour order.
import { describe, expect, it } from 'vitest';
import { phaseOf } from '../src/clock';
import { hashState } from '../src/hash';
import { createInitialState, type SimState } from '../src/state';
import { tick } from '../src/tick';

const TICKS_PER_DAY = 1800;

const EXPECTED = [
  '1 sit/- sun day',
  '71 run/- sun day',
  '74 nibble/- sun day',
  '115 sit/- sun day',
  '186 nibble/- sun day',
  '227 sit/- sun day',
  '298 sit/-/M sun day',
  '299 run/-/M sun day',
  '309 run/-/R sun day',
  '370 pant/- sun day',
  '396 sit/- sun day',
  '433 run/bed sun dusk',
  '474 sleep/asleep sun dusk',
  '613 sleep/asleep sun night',
  '1074 run/- sun night',
  '1075 run/bed sun night',
  '1095 sleep/asleep sun night',
  '1101 pant/asleep sun night',
  '1127 sit/asleep sun night',
  '1333 stretch/- sun dawn',
  '1361 sit/- sun dawn',
  '1396 stick/- sun dawn',
  '1437 sit/- sun dawn',
  '1477 sit/- sun day',
  '1508 stick/- sun day',
  '1539 sit/- sun day',
  '1610 run/-/C sun day',
  '1705 sit/- sun day',
  '1776 run/- sun day',
  '1783 nibble/- sun day',
];

function describeLuna(s: SimState): string {
  const l = s.luna;
  const flags = `${l.riding ? 'R' : ''}${l.mounting ? 'M' : ''}${l.chasing ? 'C' : ''}${l.inBarn ? 'B' : ''}${l.stick ? 'S' : ''}`;
  return `${l.anim}/${l.routine ?? '-'}${flags ? '/' + flags : ''} ${s.weather.kind} ${phaseOf(s.clock.t)}`;
}

function scriptedDay(seed: number): { transitions: string[]; state: SimState } {
  let s = createInitialState(seed);
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
  it('seed 5: the sequence of DL states over one sim day', () => {
    const { transitions, state } = scriptedDay(5);
    expect(state.clock.tick).toBe(TICKS_PER_DAY);
    expect(state.clock.dayCount).toBe(1);
    expect(transitions).toEqual(EXPECTED);
  });

  it('seed 5 twice gives the same day and the same hash', () => {
    const a = scriptedDay(5);
    const b = scriptedDay(5);
    expect(a.transitions).toEqual(b.transitions);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(hashState(a.state)).toBe('7d746c370e52a9a7');
  });

  it('the shape of the day holds for other seeds: bed at dusk, asleep by night, up by day', () => {
    for (const seed of [1, 7, 11, 42]) {
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

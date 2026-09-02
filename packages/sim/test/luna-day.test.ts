// Scripted day: Digital Luna's states over one sim day (1,800 ticks of 100 ms) from seed 5.
//
// Each entry is the tick a change first shows, then `anim/routine[/flags] weather phase`. Flags:
// R riding, M mounting, C chasing the rabbit, B in the barn, S a stick is out. Seed 5 was chosen
// because its day has most of the chain in it: a ride, stick zoomies, a nibble, bed at dusk, a
// night shower that pulls her out of bed to the door (the sheep never come in, because their
// shelter walk is issue #5 part (b)), back to bed when it clears, the dawn stretch, a rabbit
// chase, and another shower at the end. The blocks of tilt / pant / run at the door are the
// prototype's head-tilt flicker, kept at parity and listed as a weak spot in the PR.
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
  '71 sit/-/M sun day',
  '72 run/-/M sun day',
  '91 run/-/R sun day',
  '152 pant/- sun day',
  '178 sit/- sun day',
  '249 stick/- sun day',
  '298 sit/- sun day',
  '369 run/- sun day',
  '371 nibble/- sun day',
  '412 sit/- sun day',
  '433 run/bed sun dusk',
  '470 sleep/asleep sun dusk',
  '613 sleep/asleep sun night',
  '773 run/shelterWait rain night',
  '781 tilt/shelterWait rain night',
  '782 pant/- rain night',
  '783 run/shelterWait rain night',
  '784 tilt/shelterWait rain night',
  '785 pant/- rain night',
  '786 run/shelterWait rain night',
  '787 tilt/shelterWait rain night',
  '788 pant/- rain night',
  '789 run/shelterWait rain night',
  '790 tilt/shelterWait rain night',
  '791 pant/- rain night',
  '792 run/shelterWait rain night',
  '793 tilt/shelterWait rain night',
  '794 pant/- rain night',
  '795 run/shelterWait rain night',
  '796 sit/shelterWait rain night',
  '840 tilt/shelterWait rain night',
  '841 pant/- rain night',
  '842 run/shelterWait rain night',
  '843 tilt/shelterWait rain night',
  '844 pant/- rain night',
  '845 run/shelterWait rain night',
  '846 tilt/shelterWait rain night',
  '847 pant/- rain night',
  '848 run/shelterWait rain night',
  '849 tilt/shelterWait rain night',
  '850 pant/- rain night',
  '851 run/shelterWait rain night',
  '852 tilt/shelterWait rain night',
  '853 pant/- rain night',
  '854 run/shelterWait rain night',
  '855 sit/shelterWait rain night',
  '900 tilt/shelterWait rain night',
  '901 pant/- rain night',
  '902 run/shelterWait rain night',
  '903 tilt/shelterWait rain night',
  '904 pant/- rain night',
  '905 run/shelterWait rain night',
  '906 tilt/shelterWait rain night',
  '907 pant/- rain night',
  '908 run/shelterWait rain night',
  '909 tilt/shelterWait rain night',
  '910 pant/- rain night',
  '911 run/shelterWait rain night',
  '912 tilt/shelterWait rain night',
  '913 pant/- rain night',
  '914 run/shelterWait rain night',
  '915 sit/shelterWait rain night',
  '960 tilt/shelterWait rain night',
  '961 pant/- rain night',
  '962 run/shelterWait rain night',
  '963 tilt/shelterWait rain night',
  '964 pant/- rain night',
  '965 run/shelterWait rain night',
  '966 tilt/shelterWait rain night',
  '967 pant/- rain night',
  '968 run/shelterWait rain night',
  '969 tilt/shelterWait rain night',
  '970 pant/- rain night',
  '971 run/shelterWait rain night',
  '972 tilt/shelterWait rain night',
  '973 pant/- rain night',
  '974 run/shelterWait rain night',
  '975 sit/shelterWait rain night',
  '1020 tilt/shelterWait rain night',
  '1021 pant/- rain night',
  '1022 run/shelterWait rain night',
  '1023 tilt/shelterWait rain night',
  '1024 pant/- rain night',
  '1025 run/shelterWait rain night',
  '1026 tilt/shelterWait rain night',
  '1027 pant/- rain night',
  '1028 run/shelterWait rain night',
  '1029 tilt/shelterWait rain night',
  '1030 pant/- rain night',
  '1031 run/shelterWait rain night',
  '1032 tilt/shelterWait rain night',
  '1033 pant/- rain night',
  '1034 run/shelterWait rain night',
  '1035 sit/- sun night',
  '1036 run/bed sun night',
  '1064 sleep/asleep sun night',
  '1333 stretch/- sun dawn',
  '1361 sit/- sun dawn',
  '1412 stick/- sun dawn',
  '1461 sit/- sun dawn',
  '1477 sit/- sun day',
  '1532 run/-/C sun day',
  '1627 sit/- sun day',
  '1698 stick/- sun day',
  '1775 run/shelterWait rain day',
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
    expect(hashState(a.state)).toBe('873f4917ab27dc72');
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

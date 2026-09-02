import { describe, expect, it } from 'vitest';
import { cloneState, createInitialState } from '@sheepcliff/sim';
import { describeIntent, sheepId, sheepIndex, simUnderstands, targetName, toSimIntents, type ClientIntent } from './intents';

const NAMES = ['Clover', 'Daisy'];

describe('toSimIntents', () => {
  it('passes weather, season, clock, pause and period straight to the sim', () => {
    expect(toSimIntents({ type: 'setWeather', weather: 'rain' })).toEqual([{ type: 'setWeather', weather: 'rain' }]);
    expect(toSimIntents({ type: 'setSeason', season: null })).toEqual([{ type: 'setSeason', season: null }]);
    expect(toSimIntents({ type: 'setClock', t: 0.47 })).toEqual([{ type: 'setClock', t: 0.47 }]);
    expect(toSimIntents({ type: 'pauseClock', paused: true })).toEqual([{ type: 'pauseClock', paused: true }]);
    expect(toSimIntents({ type: 'setPeriod', periodSec: 60 })).toEqual([{ type: 'setPeriod', periodSec: 60 }]);
  });

  it("passes the tap and tray verbs through under the sim's own names", () => {
    expect(toSimIntents({ type: 'pet', target: 'luna' })).toEqual([{ type: 'pet', target: 'luna' }]);
    expect(toSimIntents({ type: 'pet', target: 'flock' })).toEqual([{ type: 'pet', target: 'flock' }]);
    expect(toSimIntents({ type: 'shear', target: 'flock' })).toEqual([{ type: 'shear', target: 'flock' }]);
    expect(toSimIntents({ type: 'throwStick', x: 300, y: 250 })).toEqual([{ type: 'throwStick', x: 300, y: 250 }]);
    expect(toSimIntents({ type: 'dlAction', action: 'flop' })).toEqual([{ type: 'dlAction', action: 'flop' }]);
    expect(toSimIntents({ type: 'dlAction', action: 'bed' })).toEqual([{ type: 'dlAction', action: 'bed' }]);
    expect(toSimIntents({ type: 'sheepAction', action: 'lamb', target: 'flock' })).toEqual([{ type: 'sheepAction', action: 'lamb', target: 'flock' }]);
    expect(toSimIntents({ type: 'farmAction', action: 'merchant' })).toEqual([{ type: 'farmAction', action: 'merchant' }]);
    expect(toSimIntents({ type: 'farmAction', action: 'rabbit' })).toEqual([{ type: 'farmAction', action: 'rabbit' }]);
    expect(toSimIntents({ type: 'farmAction', action: 'coins' })).toEqual([{ type: 'farmAction', action: 'coins' }]);
  });

  it("resolves a chip's sheep-<index> to the sim's actor id, and keeps it when there is no state", () => {
    const sim = cloneState(createInitialState(1));
    const s = sim.sheep[2];
    if (!s) throw new Error('no sheep');
    s.id = 'sheep-7'; // the sim numbers by birth, chips by position; the sim's id wins
    expect(toSimIntents({ type: 'pet', target: 'sheep-2' }, sim)).toEqual([{ type: 'pet', target: 'sheep-7' }]);
    expect(toSimIntents({ type: 'shear', target: 'sheep-2' }, sim)).toEqual([{ type: 'shear', target: 'sheep-7' }]);
    expect(toSimIntents({ type: 'sheepAction', action: 'rest', target: 'sheep-2' }, sim)).toEqual([{ type: 'sheepAction', action: 'rest', target: 'sheep-7' }]);
    expect(toSimIntents({ type: 'pet', target: 'sheep-2' })).toEqual([{ type: 'pet', target: 'sheep-2' }]);
    expect(toSimIntents({ type: 'pet', target: 'sheep-9' }, sim)).toEqual([{ type: 'pet', target: 'sheep-9' }]);
  });

  it('holds the verbs the sim has no rule for yet', () => {
    const held: ClientIntent[] = [
      { type: 'farmAction', action: 'bird' },
      { type: 'farmAction', action: 'reset' },
    ];
    for (const i of held) {
      expect(toSimIntents(i, createInitialState(1))).toEqual([]);
      expect(simUnderstands(i)).toBe(false);
    }
  });
});

describe('ids and names', () => {
  it('round-trips sheep ids', () => {
    expect(sheepId(3)).toBe('sheep-3');
    expect(sheepIndex('sheep-3')).toBe(3);
    expect(sheepIndex('luna')).toBeNull();
    expect(sheepIndex('sheep-x')).toBeNull();
  });

  it('names targets for people', () => {
    expect(targetName('luna', NAMES)).toBe('Digital Luna');
    expect(targetName('sheep-1', NAMES)).toBe('Daisy');
    expect(targetName('sheep-9', NAMES)).toBe('sheep-9');
    expect(targetName('flock', NAMES)).toBe('the flock');
  });

  it('describes every intent in one line', () => {
    expect(describeIntent({ type: 'pet', target: 'sheep-0' }, NAMES)).toBe('pet Clover');
    expect(describeIntent({ type: 'shear', target: 'flock' }, NAMES)).toBe('shear the flock');
    expect(describeIntent({ type: 'throwStick', x: 320.4, y: 250 }, NAMES)).toBe('stick thrown to (320, 250)');
    expect(describeIntent({ type: 'dlAction', action: 'run' }, NAMES)).toBe('Digital Luna: run');
    expect(describeIntent({ type: 'sheepAction', action: 'rest', target: 'sheep-1' }, NAMES)).toBe('Daisy: rest');
    expect(describeIntent({ type: 'farmAction', action: 'merchant' }, NAMES)).toBe('farm: merchant');
    expect(describeIntent({ type: 'setWeather', weather: 'snow' }, NAMES)).toBe('weather: snow');
    expect(describeIntent({ type: 'setSeason', season: null }, NAMES)).toBe('season: auto');
    expect(describeIntent({ type: 'setClock', t: 0.5 }, NAMES)).toBe('clock: 0.50');
    expect(describeIntent({ type: 'pauseClock', paused: true }, NAMES)).toBe('clock paused');
    expect(describeIntent({ type: 'setPeriod', periodSec: 60 }, NAMES)).toBe('day length: 60 s');
  });
});

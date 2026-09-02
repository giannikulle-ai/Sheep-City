import { phaseMix, phaseOf } from '@sheepcliff/render';
import { describe, expect, it } from 'vitest';
import { PHASE_T } from '../e2e/lib/app';
import { JUMP_T, verbsFor, whoList, type WhoId } from './actions';

/** Every id in the prototype's ACTIONS table (build/farm_sim.html), by group. */
const PROTOTYPE_ACTIONS: Record<string, string[]> = {
  'Digital Luna': ['sit', 'tilt', 'pant', 'run', 'stick', 'nibble', 'flop', 'sleep', 'stretch', 'ride', 'rabbit', 'come', 'trundle', 'pet', 'bed'],
  Sheep: ['shearAll', 'petAll', 'lamb', 'graze', 'rest', 'scatter', 'wool'],
  Farm: ['farmer', 'merchant', 'bird', 'rabbitOnly', 'coins', 'reset'],
  Weather: ['sun', 'rain', 'snow', 'spring', 'summer', 'autumn', 'winter'],
  Time: ['dawn', 'noon', 'dusk', 'night'],
};

const GROUP_WHO: Record<string, WhoId> = { 'Digital Luna': 'luna', Sheep: 'flock', Farm: 'farm', Weather: 'sky', Time: 'clock' };

describe('the action catalogue', () => {
  it("carries every id from the prototype's ACTIONS list", () => {
    for (const [group, ids] of Object.entries(PROTOTYPE_ACTIONS)) {
      const have = verbsFor(GROUP_WHO[group] as WhoId).map((v) => v.id);
      for (const id of ids) expect(have, `${group}: ${id}`).toContain(id);
    }
  });

  it('gives one sheep its own pet, shear and tasks', () => {
    const verbs = verbsFor('sheep-2');
    expect(verbs.map((v) => v.id)).toEqual(['pet', 'shear', 'graze', 'rest', 'scatter', 'wool', 'lamb']);
    expect(verbs[0]?.intent).toEqual({ type: 'pet', target: 'sheep-2' });
    expect(verbs[1]?.intent).toEqual({ type: 'shear', target: 'sheep-2' });
    expect(verbs[2]?.intent).toEqual({ type: 'sheepAction', action: 'graze', target: 'sheep-2' });
  });

  it('maps the Sheep group to the flock, and pet/shear to their own verbs', () => {
    const byId = new Map(verbsFor('flock').map((v) => [v.id, v.intent]));
    expect(byId.get('petAll')).toEqual({ type: 'pet', target: 'flock' });
    expect(byId.get('shearAll')).toEqual({ type: 'shear', target: 'flock' });
    expect(byId.get('lamb')).toEqual({ type: 'sheepAction', action: 'lamb', target: 'flock' });
  });

  it('sends DL actions as dlAction and her pet as pet', () => {
    const byId = new Map(verbsFor('luna').map((v) => [v.id, v.intent]));
    expect(byId.get('pet')).toEqual({ type: 'pet', target: 'luna' });
    expect(byId.get('flop')).toEqual({ type: 'dlAction', action: 'flop' });
    expect(byId.get('bed')).toEqual({ type: 'dlAction', action: 'bed' });
  });

  it('jumps to phase midpoints, outside the crossfade bands (#20)', () => {
    const byId = new Map(verbsFor('clock').map((v) => [v.id, v.intent]));
    expect(byId.get('dawn')).toEqual({ type: 'setClock', t: JUMP_T.dawn });
    expect(byId.get('noon')).toEqual({ type: 'setClock', t: JUMP_T.noon });
    expect(byId.get('dusk')).toEqual({ type: 'setClock', t: JUMP_T.dusk });
    expect(byId.get('night')).toEqual({ type: 'setClock', t: JUMP_T.night });
    for (const t of Object.values(JUMP_T)) for (const edge of [0, 0.42, 0.52, 0.92]) expect(Math.abs(t - edge)).toBeGreaterThan(0.025);
    // the renderer agrees: no blend towards a neighbouring phase at any jump, and each lands in its own phase
    for (const [name, t] of Object.entries(JUMP_T)) {
      expect(phaseMix(t), name).toEqual({ phase: phaseOf(t), mixTo: null, mix: 0 });
      expect(phaseOf(t), name).toBe(name === 'noon' ? 'day' : name);
    }
    // the prototype's own jumps (dawn .94, dusk .44) are the bug: inside the band, blended with the phase before
    expect(phaseMix(0.94).mixTo).toBe('night');
    expect(phaseMix(0.44).mixTo).toBe('day');
  });

  it('jumps to the same clock values the app goldens capture (#20)', () => {
    expect(PHASE_T).toEqual(JUMP_T);
  });

  it('lists DL, each sheep by name, then the collective chips', () => {
    const ids = whoList(['Clover', 'Daisy'], ['#111', '#222']).map((w) => w.id);
    expect(ids).toEqual(['luna', 'sheep-0', 'sheep-1', 'flock', 'farm', 'sky', 'clock']);
  });
});

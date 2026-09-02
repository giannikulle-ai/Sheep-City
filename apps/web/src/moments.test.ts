import { describe, expect, it } from 'vitest';
import { applyIntent, cloneState, createInitialState, type SimState } from '@sheepcliff/sim';
import { diffMoments } from './moments';

const world = (seed = 1): SimState => cloneState(createInitialState(seed));
const keys = (ms: ReturnType<typeof diffMoments>) => ms.map((m) => `${m.kind}:${m.detail}`);

describe('diffMoments', () => {
  it('reports nothing for the first frame or an unchanged one', () => {
    const a = world();
    expect(diffMoments(null, a)).toEqual([]);
    expect(diffMoments(a, cloneState(a))).toEqual([]);
  });

  it('sees a weather change and a phase crossing', () => {
    const a = world();
    const b = cloneState(a);
    applyIntent(b, { type: 'setWeather', weather: 'rain' });
    applyIntent(b, { type: 'setClock', t: 0.45 });
    expect(diffMoments(a, b)).toEqual([
      { kind: 'weather', actor: 'sky', detail: 'rain', t: expect.closeTo(0.45) },
      { kind: 'phase', actor: 'sky', detail: 'dusk', t: expect.closeTo(0.45) },
    ]);
  });

  it('sees a bubble appear once per timer, not while it stays', () => {
    const a = world();
    const b = cloneState(a);
    applyIntent(b, { type: 'farmAction', action: 'petAll' });
    expect(keys(diffMoments(a, b))).toEqual(a.sheep.map(() => 'bubble:heart'));
    expect(diffMoments(a, b).map((m) => m.actor)).toEqual(a.sheep.map((s) => s.name));
    const c = cloneState(b);
    c.clock = { ...c.clock, nowMs: 100 };
    expect(diffMoments(b, c)).toEqual([]);
    // a faded bubble does not count as visible
    const d = cloneState(b);
    d.clock = { ...d.clock, nowMs: 3000 };
    expect(diffMoments(a, d)).toEqual([]);
  });

  it('sees DL tricks, a fetch, arrivals, a lamb and a rabbit', () => {
    const a = world();
    const b = cloneState(a);
    b.luna.anim = 'flop';
    applyIntent(b, { type: 'farmAction', action: 'farmer' });
    applyIntent(b, { type: 'farmAction', action: 'lamb' });
    applyIntent(b, { type: 'farmAction', action: 'rabbitOnly' });
    applyIntent(b, { type: 'throwStick', x: 320, y: 250 });
    const k = keys(diffMoments(a, b));
    expect(k).toEqual(expect.arrayContaining(['dl-trick:flop', 'dl-trick:fetch', 'npc-arrival:farmer', 'lamb:born', 'rabbit:cross']));
    expect(k).not.toContain('npc-arrival:merchant');
    const c = cloneState(b);
    c.luna.riding = 'sheep-0';
    c.luna.chasing = true;
    expect(keys(diffMoments(b, c))).toEqual(['dl-trick:ride', 'dl-trick:rabbit-chase']);
  });

  it('does not call a walk a trick, nor a trick in the barn', () => {
    const a = world();
    const b = cloneState(a);
    b.luna.anim = 'run';
    expect(diffMoments(a, b)).toEqual([]);
    const c = cloneState(a);
    c.luna.anim = 'flop';
    c.luna.inBarn = true;
    expect(diffMoments(a, c)).toEqual([]);
  });

  it('sees a lamb grow into a sheep', () => {
    const a = world();
    const b = cloneState(a);
    b.sheep.push({ ...(a.sheep[0] as SimState['sheep'][number]), id: 'sheep-9', name: 'Willow' });
    expect(keys(diffMoments(a, b))).toEqual(['lamb:grown']);
  });
});

import { describe, expect, it } from 'vitest';
import { createInitialState } from '@sheepcliff/sim';
import { diffMoments } from './moments';
import { liveView } from './view';

const view = (now = 0) => liveView(createInitialState(1), now, false);

describe('diffMoments', () => {
  it('reports nothing for the first frame or an unchanged one', () => {
    expect(diffMoments(null, view(), 0)).toEqual([]);
    expect(diffMoments(view(), view(), 0)).toEqual([]);
  });

  it('sees a weather change and a phase crossing', () => {
    const a = view();
    const b = view();
    b.weather = 'rain';
    b.clockT = 0.45;
    expect(diffMoments(a, b, 0)).toEqual([
      { kind: 'weather', actor: 'sky', detail: 'rain', t: 0.45 },
      { kind: 'phase', actor: 'sky', detail: 'dusk', t: 0.45 },
    ]);
  });

  it('sees a bubble appear once, not while it stays', () => {
    const a = view();
    const b = view();
    const s = b.sheep[0];
    if (!s) throw new Error('no sheep');
    s.icon = 'heart';
    s.iconUntil = 2000;
    expect(diffMoments(a, b, 100)).toEqual([{ kind: 'bubble', actor: 'Clover', detail: 'heart', t: b.clockT }]);
    expect(diffMoments(b, b, 200)).toEqual([]);
    // faded bubbles do not count as visible
    expect(diffMoments(a, b, 3000)).toEqual([]);
  });

  it('sees DL tricks, arrivals, lambs and small life', () => {
    const a = view();
    a.farmer = null;
    a.bird = null;
    a.rabbit = null;
    a.sheep.forEach((s) => (s.lambs = []));
    const b = view();
    b.luna.anim = 'flop';
    const kinds = diffMoments(a, b, 0).map((m) => `${m.kind}:${m.detail}`);
    expect(kinds).toEqual(expect.arrayContaining(['dl-trick:flop', 'npc-arrival:farmer', 'lamb:born', 'bird:land', 'rabbit:cross']));
    expect(kinds).not.toContain('npc-arrival:merchant');
  });

  it('does not call a walk a trick', () => {
    const a = view();
    const b = view();
    b.luna.anim = 'run';
    expect(diffMoments(a, b, 0)).toEqual([]);
  });
});

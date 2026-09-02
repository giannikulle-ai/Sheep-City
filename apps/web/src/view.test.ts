import { describe, expect, it } from 'vitest';
import { advance, applyIntent, cloneState, createInitialState, TICK_MS } from '@sheepcliff/sim';
import { renderClock, simScalars, simView, tickAlpha } from './view';

describe('simView', () => {
  it('takes clock, weather, season, temperature, banks and every actor from the sim', () => {
    const sim = cloneState(createInitialState(1));
    applyIntent(sim, { type: 'setClock', t: 0.7 });
    applyIntent(sim, { type: 'setWeather', weather: 'snow' });
    applyIntent(sim, { type: 'setSeason', season: 'winter' });
    sim.banks = { wool: 4, coins: 12, owned: ['flowerbed'] };
    expect(simScalars(sim)).toEqual({ t: 0.7, weather: 'snow', season: 'winter', temp: sim.weather.temp });
    const v = simView(null, sim, 0, false);
    expect(v.clockT).toBe(0.7);
    expect(v.weather).toBe('snow');
    expect(v.season).toBe('winter');
    expect(v.temp).toBe(sim.weather.temp);
    expect(v.woolBank).toBe(4);
    expect(v.coins).toBe(12);
    expect(v.owned).toEqual(['flowerbed']);
    expect(v.sheep.map((s) => [s.name, s.x, s.y, s.wool, s.t0])).toEqual(sim.sheep.map((s) => [s.name, s.x, s.y, s.wool, s.t0Ms]));
    expect(v.luna).toMatchObject({ x: 120, y: 280, anim: 'sit', riding: false, inBarn: false });
    expect(v.tufts).toHaveLength(sim.tufts.length);
    expect(v.fireflies).toHaveLength(14);
    expect(v.butterflies).toHaveLength(2);
    expect(v.farmer).toBeNull();
    expect(v.bird).toBeNull();
    expect(v.stick).toBeNull();
  });

  it('shows the farmer, his cart-less walk, and a bubble only while its timer runs', () => {
    const sim = cloneState(createInitialState(2));
    applyIntent(sim, { type: 'farmAction', action: 'farmer' });
    applyIntent(sim, { type: 'farmAction', action: 'merchant' });
    applyIntent(sim, { type: 'farmAction', action: 'petAll' });
    const v = simView(null, sim, 0, false);
    expect(v.farmer).toMatchObject({ anim: 'walk', cart: false, dir: -1 });
    expect(v.merchant).toMatchObject({ cart: true });
    expect(v.sheep.every((s) => s.icon === 'heart' && s.iconUntil === 1600 && s.tagUntil === 1800)).toBe(true);
  });

  it('shows the stick on the grass only on the way out', () => {
    const sim = cloneState(createInitialState(3));
    applyIntent(sim, { type: 'throwStick', x: 300, y: 250 });
    expect(simView(null, sim, 0, false).stick).toEqual({ x: 300, y: 250 });
    if (sim.luna.stick) sim.luna.stick.phase = 'back';
    expect(simView(null, sim, 0, false).stick).toBeNull();
  });

  it('interpolates walking feet between two ticks and snaps a teleport', () => {
    let sim = cloneState(createInitialState(4));
    applyIntent(sim, { type: 'farmAction', action: 'scatter' });
    const a = advance(sim, 1);
    const b = advance(a, 1);
    const walker = b.sheep.findIndex((s, i) => s.x !== a.sheep[i]?.x);
    expect(walker).toBeGreaterThanOrEqual(0);
    const ax = a.sheep[walker]?.x ?? 0;
    const bx = b.sheep[walker]?.x ?? 0;
    const half = simView(a, b, 0.5, false).sheep[walker]?.x ?? NaN;
    expect(half).toBeCloseTo((ax + bx) / 2, 6);
    expect(simView(a, b, 0, false).sheep[walker]?.x).toBe(bx);
    // a jump of more than a stride (leaving the barn, a dismount) is drawn where it landed
    const far = cloneState(b);
    const s = far.sheep[walker];
    if (s) s.x += 200;
    expect(simView(a, far, 0.5, false).sheep[walker]?.x).toBe(bx + 200);
    sim = far;
    expect(sim).toBeDefined();
  });

  it('render clock and alpha follow the accumulator', () => {
    const sim = cloneState(createInitialState(1));
    sim.clock = { ...sim.clock, nowMs: 5000 };
    sim.accumulatorMs = 40;
    expect(renderClock(sim)).toBe(5040);
    expect(tickAlpha(sim)).toBeCloseTo(40 / TICK_MS);
  });
});

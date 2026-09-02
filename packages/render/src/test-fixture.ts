// A tiny FarmView for unit tests. The real fixture lives in apps/web.
import type { FarmView, SheepView } from './state';

export function fixtureSheep(over: Partial<SheepView> = {}): SheepView {
  return {
    name: 'Clover',
    color: '#3a7bd5',
    x: 100,
    y: 200,
    dir: 1,
    t0: 0,
    wool: 0.5,
    resting: false,
    moving: false,
    eating: false,
    inBarn: false,
    wet: 0,
    snow: 0,
    icon: null,
    iconUntil: 0,
    tagUntil: 0,
    lambs: [],
    ridden: false,
    ...over,
  };
}

export function fixtureView(): FarmView {
  return {
    clockT: 0.2,
    weather: 'sun',
    temp: 14,
    season: 'spring',
    liveWeather: false,
    sheep: [
      fixtureSheep(),
      fixtureSheep({ name: 'Daisy', x: 200, lambs: [{ x: 210, y: 215, dir: -1, t0: 0 }] }),
    ],
    luna: {
      x: 120,
      y: 280,
      dir: 1,
      anim: 'sit',
      inBarn: false,
      riding: false,
      wet: 0,
      snow: 0,
      icon: null,
      tagUntil: 0,
      forceBound: 0,
    },
    rabbit: null,
    bird: null,
    butterflies: [],
    fireflies: [],
    tufts: [],
    mud: [],
    prints: [],
    farmer: null,
    merchant: null,
    stick: null,
    owned: [],
    woolBank: 0,
    coins: 0,
  };
}

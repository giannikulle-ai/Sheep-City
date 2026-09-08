// Deity intents (issue #43): weather on demand and one direct action on one named creature.
// Owner's direction, section 3 of the plan: weather first, then direct actions on one creature, no
// pick-up-and-move. Digital Luna cannot be harmed: a `startle` or `calm` on her is a no-op or a
// friendly reaction, never a forced state (asserted below).
import { describe, expect, it } from 'vitest';
import { LUNA_ID } from '../src/actors';
import { hashState } from '../src/hash';
import { ACT_VERBS, DEITY_WEATHER_KINDS, INTENT_TYPES, type DeityWeatherKind, type Intent } from '../src/intents';
import { RULES, TICK_MS } from '../src/rules';
import { SaveError } from '../src/save/doc';
import { fromSave, toSave } from '../src/save/serialize';
import { createInitialState, type SimState } from '../src/state';
import { step } from '../src/step';
import { tick } from '../src/tick';
import { world } from './luna-helpers';
import { settle } from './sheep-helpers';

/** Apply `intents` at the next boundary and run that one tick, as `intents.test.ts` does. */
function tickWith(s: SimState, ...intents: Intent[]): SimState {
  return step(s, intents, 100);
}

describe('weather intent', () => {
  it('every kind is a known intent type', () => {
    expect(INTENT_TYPES).toContain('weather');
    expect(DEITY_WEATHER_KINDS).toEqual(['sun', 'rain', 'snow', 'fog', 'clear']);
  });

  it('sun, rain, and snow set kind at once, in manual mode, same as the tray button', () => {
    for (const kind of ['sun', 'rain', 'snow'] as const) {
      const a = tickWith(world({ weather: kind === 'rain' ? 'sun' : 'rain' }), { type: 'weather', kind, holdSimMinutes: 5 });
      expect(a.weather.kind).toBe(kind);
      expect(a.weather.rain).toBe(kind === 'rain');
      expect(a.weather.mode).toBe('manual');
    }
  });

  it('rain and snow start their layers on the next tick through the existing chains, no new behaviour code', () => {
    // A settled sheep out on the field starts its walk to the barn door the moment rain lands, the
    // same `rainShelter` chain a `setWeather` intent already drives (weather.ts is untouched here).
    const s = settle(world({ weather: 'sun' }));
    const before = s.sheep[0]!;
    expect(before.shelter).toBe(false);
    const a = tickWith(s, { type: 'weather', kind: 'rain', holdSimMinutes: 3 });
    expect(a.weather.rain).toBe(true);
    expect(a.sheep[0]!.shelter).toBe(true);
    expect(a.sheep[0]!.tx).not.toBeNull();
  });

  it('fog sets the visibility flag without touching kind; clear is sun with fog off', () => {
    const rainy = world({ weather: 'rain' });
    const fogged = tickWith(rainy, { type: 'weather', kind: 'fog', holdSimMinutes: 2 });
    expect(fogged.weather.foggy).toBe(true);
    expect(fogged.weather.kind).toBe('rain'); // fog layers over whatever the sky already is
    const cleared = tickWith(fogged, { type: 'weather', kind: 'clear', holdSimMinutes: 2 });
    expect(cleared.weather.kind).toBe('sun');
    expect(cleared.weather.foggy).toBe(false);
  });

  it('a fresh world has no fog and no hold: the fields stay absent, not defaulted to false', () => {
    const s = createInitialState(7);
    expect(s.weather.foggy).toBeUndefined();
    expect(s.weather.holdUntilMs).toBeUndefined();
    expect(JSON.stringify(s.weather)).not.toMatch(/foggy|holdUntilMs/);
  });

  it('overrides the season for holdSimMinutes, then hands back to it', () => {
    // The intent lands on tick 1 (nowMs 100) and computes its hold from the pre-tick clock (nowMs
    // 0), so `holdUntilMs` is 60_000: 1 sim-minute. Tick 600 (nowMs 60_000) is the first where the
    // advanced clock reaches it, so tick 599 (one short) is still under the hold.
    let s = tickWith(world(), { type: 'weather', kind: 'rain', holdSimMinutes: 1 });
    expect(s.weather.kind).toBe('rain');
    expect(s.weather.mode).toBe('manual');
    s = step(s, [], 598 * 100); // tick 599: still rain
    expect(s.weather.kind).toBe('rain');
    expect(s.weather.mode).toBe('manual');
    s = step(s, [], 100); // tick 600: the hold ends, back to the season, sun, fog off
    expect(s.weather.kind).toBe('sun');
    expect(s.weather.mode).toBe('season');
    expect(s.weather.foggy).toBeFalsy();
    expect(s.weather.holdUntilMs).toBeUndefined();
  });

  it('a fog hold also hands back cleanly: foggy clears when the hold ends', () => {
    let s = tickWith(world(), { type: 'weather', kind: 'fog', holdSimMinutes: 0.5 });
    expect(s.weather.foggy).toBe(true);
    s = step(s, [], 300 * 100); // 0.5 sim-minute = 300 ticks
    expect(s.weather.foggy).toBe(false);
    expect(s.weather.mode).toBe('season');
  });

  it('rejects a queued weather intent with the wrong fields', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
        return 'ok';
      } catch (e) {
        return e instanceof SaveError ? e.code : 'other';
      }
    };
    const withIntent = (intent: unknown) => {
      const doc = toSave(createInitialState(7));
      (doc.world.pendingIntents as unknown[]).push(intent);
      return doc;
    };
    expect(code(() => fromSave(withIntent({ type: 'weather', kind: 'fog', holdSimMinutes: 5 })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'weather', kind: 'hail', holdSimMinutes: 5 })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'weather', kind: 'rain' })))).toBe('invalid-world');
  });
});

describe('act intent: a sheep', () => {
  const point = { x: 200, y: 220 };

  it('call makes the target walk to the point given, gradually: no pick-up-and-move', () => {
    const s = settle(world());
    const before = { ...s.sheep[0]! };
    const a = tickWith(s, { type: 'act', target: 'sheep-0', verb: 'call', x: point.x, y: point.y });
    const q = a.sheep[0]!;
    expect(q.tx).toBeCloseTo(point.x, 0);
    expect(q.ty).toBeCloseTo(point.y, 0);
    // She has started towards it, not teleported: one tick moves her a few px, not the whole gap.
    const moved = Math.hypot(q.x - before.x, q.y - before.y);
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThan(Math.hypot(point.x - before.x, point.y - before.y));
    // Given enough ticks she arrives.
    let w = a;
    for (let i = 0; i < 400 && w.sheep[0]!.tx !== null; i++) w = tick(w);
    expect(w.sheep[0]!.tx).toBeNull();
    expect(Math.hypot(w.sheep[0]!.x - before.x, w.sheep[0]!.y - before.y)).toBeGreaterThan(moved);
  });

  it('calm ends a run or a zoomie and lies the sheep down', () => {
    const s = settle(world());
    const q = s.sheep[0]!;
    q.tx = 400;
    q.ty = 250;
    q.wander = 1;
    const a = tickWith(s, { type: 'act', target: 'sheep-0', verb: 'calm' });
    expect(a.sheep[0]!.tx).toBeNull();
    expect(a.sheep[0]!.wander).toBe(0);
    expect(a.sheep[0]!.resting).toBe(true);
  });

  it('startle is a short scatter with a bubble', () => {
    const s = settle(world());
    const a = tickWith(s, { type: 'act', target: 'sheep-0', verb: 'startle' });
    const q = a.sheep[0]!;
    expect(q.icon).toBe('startle');
    // The behaviour runs inside the tick, after the clock has already advanced by one tick.
    expect(q.iconUntilMs).toBe(TICK_MS + 900);
    expect(q.tx).not.toBeNull();
    expect(q.resting).toBe(false);
  });

  it('treat is the heart-and-tag with a small mood bump: the nearest tuft grows', () => {
    const s = settle(world());
    const q = s.sheep[0]!;
    const nearest = s.tufts.reduce((best, t, i) => (Math.hypot(t.x - q.x, t.y - q.y) < Math.hypot(s.tufts[best]!.x - q.x, s.tufts[best]!.y - q.y) ? i : best), 0);
    s.tufts[nearest]!.level = 0.3;
    const a = tickWith(s, { type: 'act', target: 'sheep-0', verb: 'treat' });
    expect(a.sheep[0]!.icon).toBe('heart');
    expect(a.sheep[0]!.tagUntilMs).toBe(TICK_MS + RULES.petTagMs);
    expect(a.tufts[nearest]!.level).toBeGreaterThan(0.3);
  });

  it('a stale target is a no-op, as every other targeted intent treats one', () => {
    const s = settle(world());
    const a = tickWith(s, { type: 'act', target: 'sheep-99', verb: 'startle' });
    expect(hashState(a)).toBe(hashState(tickWith(s)));
  });

  it('every verb reacts within ten ticks', () => {
    for (const verb of ACT_VERBS) {
      const s = settle(world());
      const intent: Intent = verb === 'call' ? { type: 'act', target: 'sheep-0', verb: 'call', x: point.x, y: point.y } : { type: 'act', target: 'sheep-0', verb };
      let w = tickWith(s, intent);
      let reacted = w.sheep[0]!.actCmd == null; // the command was consumed: the behaviour ran
      for (let i = 0; i < 9 && !reacted; i++) {
        w = tick(w);
        reacted = w.sheep[0]!.actCmd == null;
      }
      expect(reacted, verb).toBe(true);
    }
  });
});

/** Centre Digital Luna, as luna.test.ts does: her spawn point sits outside the clamp radius and
 * `clampField` nudges it inward every tick regardless of any deity intent, which would swamp the
 * small movements these tests look for. */
function centreLuna(s: SimState): SimState {
  s.luna.x = 300;
  s.luna.y = 200;
  return s;
}

describe('act intent: Digital Luna', () => {
  it('call makes her walk to the point given, no pick-up-and-move', () => {
    const s = centreLuna(world());
    const before = { x: s.luna.x, y: s.luna.y };
    let a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'call', x: 200, y: 220 });
    expect(a.luna.manual).toBe('walk');
    expect(a.luna.target).toEqual({ x: 200, y: 220 });
    expect(a.luna.x).toBe(before.x); // the command chain already had its turn this tick
    a = step(a, [], 3000);
    expect(Math.hypot(a.luna.x - before.x, a.luna.y - before.y)).toBeGreaterThan(0);
  });

  it('treat is the heart-and-tag with a small mood bump on the nearest tuft', () => {
    const s = centreLuna(world());
    const nearest = s.tufts.reduce((best, t, i) => (Math.hypot(t.x - s.luna.x, t.y - s.luna.y) < Math.hypot(s.tufts[best]!.x - s.luna.x, s.tufts[best]!.y - s.luna.y) ? i : best), 0);
    s.tufts[nearest]!.level = 0.3;
    const a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'treat' });
    expect(a.luna.icon).toBe('heart');
    expect(a.luna.tagUntilMs).toBe(TICK_MS + 1800);
    expect(a.tufts[nearest]!.level).toBeGreaterThan(0.3);
  });

  it('DL invariant: calm on her is a no-op beyond a friendly acknowledgement, never a forced state', () => {
    // She is mid-stride when the calm lands. Compare against the same world ticked with no intent
    // at all: if calm changed nothing about her trajectory, the two must match exactly bar the icon.
    const midStride = () => {
      const s = centreLuna(world());
      s.luna.anim = 'run';
      s.luna.target = { x: 500, y: 300 };
      return s;
    };
    const plain = tick(midStride());
    const calmed = tickWith(midStride(), { type: 'act', target: LUNA_ID, verb: 'calm' });
    expect(calmed.luna.anim).toBe(plain.luna.anim);
    expect(calmed.luna.target).toEqual(plain.luna.target);
    expect(calmed.luna.x).toBeCloseTo(plain.luna.x, 9);
    expect(calmed.luna.y).toBeCloseTo(plain.luna.y, 9);
    expect(calmed.luna.riding).toBe(plain.luna.riding);
    expect(calmed.luna.inBarn).toBe(plain.luna.inBarn);
    // Only the friendly acknowledgement: the same heart a pet gives.
    expect(calmed.luna.icon).toBe('heart');
  });

  it('DL invariant: startle on her is a friendly head-tilt, never a scatter or a forced move', () => {
    const s = centreLuna(world());
    const before = { x: s.luna.x, y: s.luna.y };
    const a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'startle' });
    expect(a.luna.anim).toBe('tilt');
    expect(a.luna.icon).toBe('startle');
    // No movement: a startle never relocates her.
    expect(a.luna.x).toBe(before.x);
    expect(a.luna.y).toBe(before.y);
    expect(a.luna.target).toBeNull();
    // And she settles back to a pant on her own, the same recovery tiltRecover already gives.
    const settled = step(a, [], 200);
    expect(settled.luna.anim).toBe('pant');
  });

  it('a queued command waits, unconsumed, while she is busy (riding, a button hold, asleep) and never forces its way in', () => {
    const riding = world();
    riding.luna.riding = riding.sheep[0]!.id;
    riding.luna.rideUntilMs = 999_999;
    const a = tickWith(riding, { type: 'act', target: LUNA_ID, verb: 'call', x: 10, y: 10 });
    expect(a.luna.riding).not.toBeNull(); // the call did not interrupt the ride
    expect(a.luna.actCmd).not.toBeNull(); // and the command is still waiting, not dropped

    // Night, so the bedtime chain's own dawn/day check does not immediately wake her back up.
    const asleep = world({ t: 0.7 });
    asleep.luna.routine = 'asleep';
    asleep.luna.anim = 'sleep';
    const b = tickWith(asleep, { type: 'act', target: LUNA_ID, verb: 'treat' });
    expect(b.luna.routine).toBe('asleep');
    expect(b.luna.icon).not.toBe('heart'); // the treat has not landed yet
    expect(b.luna.actCmd).not.toBeNull();
  });

  it('rejects a queued act intent with the wrong fields', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
        return 'ok';
      } catch (e) {
        return e instanceof SaveError ? e.code : 'other';
      }
    };
    const withIntent = (intent: unknown) => {
      const doc = toSave(createInitialState(7));
      (doc.world.pendingIntents as unknown[]).push(intent);
      return doc;
    };
    expect(code(() => fromSave(withIntent({ type: 'act', target: 'luna', verb: 'calm' })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'act', target: 'luna', verb: 'call', x: 1, y: 2 })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'act', target: 'luna', verb: 'call' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'act', target: 'luna', verb: 'pounce' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'act', verb: 'calm' })))).toBe('invalid-world');
  });
});

describe('determinism with weather and act intents interleaved', () => {
  const kinds: readonly DeityWeatherKind[] = DEITY_WEATHER_KINDS;

  function scripted(i: number): Intent[] {
    switch (i) {
      case 20:
        return [{ type: 'weather', kind: kinds[i % kinds.length]!, holdSimMinutes: 2 }];
      case 90:
        return [{ type: 'act', target: 'sheep-1', verb: 'call', x: 260, y: 240 }];
      case 150:
        return [{ type: 'act', target: LUNA_ID, verb: 'startle' }];
      case 260:
        return [{ type: 'weather', kind: 'clear', holdSimMinutes: 1 }];
      case 300:
        return [{ type: 'act', target: 'sheep-2', verb: 'treat' }];
      default:
        return [];
    }
  }

  it('the same seed and the same intents through step() replay to the same hash', () => {
    const play = () => {
      let s = createInitialState(9);
      for (let i = 0; i < 500; i++) s = step(s, scripted(i), i % 5 === 0 ? 400 : 100);
      return s;
    };
    const a = play();
    const b = play();
    expect(hashState(a)).toBe(hashState(b));
    // And the intents did something.
    const bare = (() => {
      let s = createInitialState(9);
      for (let i = 0; i < 500; i++) s = step(s, [], i % 5 === 0 ? 400 : 100);
      return s;
    })();
    expect(hashState(a)).not.toBe(hashState(bare));
  });
});

describe('parity: no deity intent moves the pin', () => {
  // The same two scripted days pinned in luna-day.test.ts (seed 11) and sheep-day.test.ts (seed
  // 71), replayed here with the deity feature in the tree and zero deity intents sent. `weather`
  // and `act` add only optional fields (`actCmd`, `weather.foggy`, `weather.holdUntilMs`); none of
  // them is ever set unless an intent lands, and the hash's canonical JSON drops an undefined key
  // the same as an absent one, so a day with no deity intent hashes exactly as it did before #43.
  it('luna-day.test.ts, seed 11: the end-of-day hash is unchanged', () => {
    let s = createInitialState(11);
    for (let i = 0; i < 1800; i++) s = tick(s);
    expect(hashState(s)).toBe('067877d6ea96f42c');
  });

  it('sheep-day.test.ts, seed 71: the end-of-day hash is unchanged', () => {
    let s = createInitialState(71);
    for (let i = 0; i < 1800; i++) s = tick(s);
    expect(hashState(s)).toBe('779eafbf4da9aa0d');
  });
});

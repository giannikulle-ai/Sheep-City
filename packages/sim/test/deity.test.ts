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
import { runUntil, world } from './luna-helpers';
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
    // The hand-back deletes `foggy` rather than writing `false` (Round 2 fix): absent means "no
    // fog", the same as it did before any deity intent ever ran (see the fresh-world test above).
    expect(s.weather.foggy).toBeUndefined();
    expect(JSON.stringify(s.weather)).not.toMatch(/foggy/);
    expect(s.weather.mode).toBe('season');
  });

  it('holdSimMinutes <= 0 still lands the override for one tick, rather than never landing at all', () => {
    // Round 2 fix for a Verifier blocker: `holdUntilMs` used to equal the pre-tick clock exactly,
    // so `tickWeather`'s `now >= holdUntilMs` was already true on the very tick the override
    // landed, and it never took effect. Now it holds for one tick, then hands back on the next.
    // (Kind is not asserted past hand-back: the season may re-roll new weather — even back to
    // rain — the instant control returns to it; `mode` is the honest signal that hand-back ran.)
    for (const holdSimMinutes of [0, -5]) {
      let s = tickWith(world({ weather: 'sun' }), { type: 'weather', kind: 'rain', holdSimMinutes });
      expect(s.weather.kind, `holdSimMinutes=${holdSimMinutes}`).toBe('rain');
      expect(s.weather.mode, `holdSimMinutes=${holdSimMinutes}`).toBe('manual');
      s = step(s, [], TICK_MS); // one more tick: the hold ends
      expect(s.weather.mode, `holdSimMinutes=${holdSimMinutes}`).toBe('season');
      expect(s.weather.holdUntilMs, `holdSimMinutes=${holdSimMinutes}`).toBeUndefined();
    }
  });

  it('a non-finite holdSimMinutes does not lock the weather forever or brick the save', () => {
    for (const holdSimMinutes of [NaN, Infinity, -Infinity]) {
      let s = tickWith(world({ weather: 'sun' }), { type: 'weather', kind: 'rain', holdSimMinutes });
      expect(s.weather.kind, String(holdSimMinutes)).toBe('rain');
      expect(Number.isFinite(s.weather.holdUntilMs), String(holdSimMinutes)).toBe(true);
      expect(() => toSave(s), String(holdSimMinutes)).not.toThrow();
      s = step(s, [], TICK_MS); // treated as zero: hands back on the very next tick
      expect(s.weather.mode, String(holdSimMinutes)).toBe('season');
      expect(s.weather.holdUntilMs, String(holdSimMinutes)).toBeUndefined();
      expect(() => toSave(s), String(holdSimMinutes)).not.toThrow();
    }
  });

  it('a fog hold does not freeze a season-rolled shower: it still ends on its own untilMs', () => {
    // A rain the *season* rolled, with its own end time, running when the fog tap lands.
    let s = world({ sheep: 0 });
    s.weather = { ...s.weather, mode: 'season', kind: 'rain', rain: true, untilMs: 500 };
    s = tickWith(s, { type: 'weather', kind: 'fog', holdSimMinutes: 10 });
    expect(s.weather.kind).toBe('rain'); // fog only layers on; the shower is untouched when it lands
    expect(s.weather.foggy).toBe(true);
    expect(s.weather.mode).toBe('manual');
    s = step(s, [], 900); // past the shower's own untilMs (500), nowhere near the fog hold's end
    expect(s.weather.kind).toBe('sun'); // the shower ended on its own schedule, fog notwithstanding
    expect(s.weather.mode).toBe('manual'); // still under the fog hold itself
    expect(s.weather.foggy).toBe(true); // fog persists until its own hold ends
  });

  it('a tray setWeather during a deity hold wins: it is not reverted when the hold expires', () => {
    let s = tickWith(world({ sheep: 0 }), { type: 'weather', kind: 'rain', holdSimMinutes: 10 });
    expect(s.weather.kind).toBe('rain');
    expect(s.weather.holdUntilMs).toBeDefined();
    s = tickWith(s, { type: 'setWeather', weather: 'snow' });
    expect(s.weather.kind).toBe('snow');
    expect(s.weather.holdUntilMs).toBeUndefined(); // the tray tap clears the hold outright
    s = step(s, [], 10 * 60_000); // long past the deity hold's original 10 minutes
    expect(s.weather.kind).toBe('snow'); // still what the tray set, never reverted to season/sun
    expect(s.weather.mode).toBe('manual');
  });

  it('a later hold fully replaces an earlier one: a short second hold cuts a longer first one short', () => {
    // Documented in weather.ts and intents.ts: `applyWeather` overwrites `holdUntilMs` (and
    // `foggy`) outright, so a 1-minute fog over a 10-minute deity rain hands back at 1 minute, not
    // 10. (Kind is not asserted past hand-back: the season may re-roll new weather the instant
    // control returns to it, same as the plain hold hand-back test above.)
    let s = tickWith(world({ sheep: 0 }), { type: 'weather', kind: 'rain', holdSimMinutes: 10 });
    s = tickWith(s, { type: 'weather', kind: 'fog', holdSimMinutes: 1 });
    expect(s.weather.kind).toBe('rain'); // fog does not touch kind
    expect(s.weather.foggy).toBe(true);
    s = step(s, [], 61_000); // well past the fog hold's 1 minute, nowhere near the rain hold's 10
    expect(s.weather.mode).toBe('season'); // handed back already: the second, shorter hold won
    expect(s.weather.foggy).toBeUndefined();
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

  it('treat is the heart-and-tag only: no tuft write (owner Round 2 call, see luna.ts act chain)', () => {
    const s = settle(world());
    const before = s.tufts.map((t) => t.level);
    const a = tickWith(s, { type: 'act', target: 'sheep-0', verb: 'treat' });
    expect(a.sheep[0]!.icon).toBe('heart');
    expect(a.sheep[0]!.tagUntilMs).toBe(TICK_MS + RULES.petTagMs);
    // No tuft level moved beyond the ordinary regrowth every tuft gets every tick (tick.ts),
    // treat or no treat: the old per-tap bump is gone.
    const grown = before.map((lvl) => Math.min(1, lvl + (TICK_MS / 1000) * RULES.tuftRegrowPerSec));
    a.tufts.forEach((t, i) => expect(t.level).toBeCloseTo(grown[i]!, 9));
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

  it('treat is the heart-and-tag only: no tuft write (owner Round 2 call)', () => {
    const s = centreLuna(world());
    const before = s.tufts.map((t) => t.level);
    const a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'treat' });
    expect(a.luna.icon).toBe('heart');
    expect(a.luna.tagUntilMs).toBe(TICK_MS + 1800);
    // No tuft level moved beyond the ordinary regrowth every tuft gets every tick (tick.ts).
    const grown = before.map((lvl) => Math.min(1, lvl + (TICK_MS / 1000) * RULES.tuftRegrowPerSec));
    a.tufts.forEach((t, i) => expect(t.level).toBeCloseTo(grown[i]!, 9));
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

  it('a queued call waits while she shelters from the rain, and never drags her out (Verifier blocker #1)', () => {
    // No sheep: `rainShepherd`'s "every sheep is in" gate (luna.ts) is then vacuously true, so she
    // reaches the barn on her own in a bounded number of ticks.
    const s = world({ weather: 'rain', sheep: 0 });
    runUntil(s, (w) => w.luna.inBarn);
    expect(s.luna.inBarn).toBe(true);
    const atDoor = { x: s.luna.x, y: s.luna.y };

    const a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'call', x: 120, y: 300 });
    expect(a.luna.actCmd).not.toBeNull(); // queued, not consumed: `act`'s condition sees `inBarn`

    const b = step(a, [], 3000 * TICK_MS); // 300 s of continued rain
    expect(b.luna.inBarn).toBe(true); // never dragged out into the rain
    expect(b.luna.x).toBe(atDoor.x); // inBarn consistent with her position: she never moved
    expect(b.luna.y).toBe(atDoor.y);
    expect(b.luna.routine).toBeNull(); // rainShepherd's "already inside" branch, alive and well
    expect(b.luna.wet).toBe(0); // her rain-shepherd guards (`!l.inBarn`) were never bypassed
    expect(b.luna.actCmd).not.toBeNull(); // the call is still waiting at the door

    // The rain ends: she leaves the barn the normal way, from right where she already was — not a
    // teleport from some point out on the field the buggy `call` would have dragged her to.
    const c = tickWith(b, { type: 'setWeather', weather: 'sun' });
    expect(c.luna.inBarn).toBe(false);
    const jump = Math.hypot(c.luna.x - atDoor.x, c.luna.y - atDoor.y);
    expect(jump).toBeLessThan(40); // `leaveBarn`'s own small reposition, not a field-crossing jump
  });

  it('call and startle never leak a claimed tuft, even mid-walk to it (Verifier blocker #2)', () => {
    for (const verb of ['call', 'startle'] as const) {
      const s = centreLuna(world());
      s.luna.tuft = 0;
      s.tufts[0]!.claimed = LUNA_ID;
      const intent: Intent = verb === 'call' ? { type: 'act', target: LUNA_ID, verb: 'call', x: 50, y: 50 } : { type: 'act', target: LUNA_ID, verb };
      let w = tickWith(s, intent);
      for (let i = 0; i < 40; i++) w = tick(w);
      expect(w.luna.tuft, verb).toBeNull();
      expect(w.tufts.some((t) => t.claimed === LUNA_ID), verb).toBe(false);
    }
  });

  it('a call with a non-finite point is rejected outright, not queued', () => {
    const s = centreLuna(world());
    const before = { x: s.luna.x, y: s.luna.y };
    const a = tickWith(s, { type: 'act', target: LUNA_ID, verb: 'call', x: NaN, y: 10 });
    expect(a.luna.actCmd).toBeUndefined();
    expect(a.luna.x).toBe(before.x);
    expect(a.luna.y).toBe(before.y);
    expect(() => toSave(a)).not.toThrow();
  });

  it('every verb reacts within ten ticks', () => {
    for (const verb of ACT_VERBS) {
      const s = centreLuna(world());
      const intent: Intent = verb === 'call' ? { type: 'act', target: LUNA_ID, verb: 'call', x: 200, y: 220 } : { type: 'act', target: LUNA_ID, verb };
      let w = tickWith(s, intent);
      let reacted = w.luna.actCmd == null; // the command was consumed: the behaviour ran
      for (let i = 0; i < 9 && !reacted; i++) {
        w = tick(w);
        reacted = w.luna.actCmd == null;
      }
      expect(reacted, verb).toBe(true);
    }
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

describe('every weather kind reaches an actor within ten ticks', () => {
  // Issue #43's own bar. `fog` and `clear` have no gameplay effect yet beyond the flag itself (the
  // PR's own Weak spots section: "the engine ticket reuses it for a visibility effect"), so their
  // "reaction" here is honestly the weather field, not a creature's behaviour — everything else is
  // a sheep actually doing something different because of the sky.
  it('rain: a settled sheep starts walking to the barn door', () => {
    const s = settle(world({ weather: 'sun', sheep: 1 }));
    let w = tickWith(s, { type: 'weather', kind: 'rain', holdSimMinutes: 5 });
    let reacted = w.sheep[0]!.shelter;
    for (let i = 0; i < 9 && !reacted; i++) {
      w = tick(w);
      reacted = w.sheep[0]!.shelter;
    }
    expect(reacted).toBe(true);
  });

  it('snow: a settled, standing sheep starts collecting snow on its back', () => {
    const s = settle(world({ weather: 'sun', sheep: 1 }));
    let w = tickWith(s, { type: 'weather', kind: 'snow', holdSimMinutes: 5 });
    let reacted = w.sheep[0]!.snow > 0;
    for (let i = 0; i < 9 && !reacted; i++) {
      w = tick(w);
      reacted = w.sheep[0]!.snow > 0;
    }
    expect(reacted).toBe(true);
  });

  it('sun: a sheep the rain left wet starts drying off once it stops', () => {
    const s = settle(world({ weather: 'rain', sheep: 1 }));
    s.sheep[0]!.wet = 0.5;
    let w = tickWith(s, { type: 'weather', kind: 'sun', holdSimMinutes: 5 });
    for (let i = 0; i < 9; i++) w = tick(w);
    expect(w.sheep[0]!.wet).toBeLessThan(0.5);
  });

  it('fog: the visibility flag itself lands and stays set', () => {
    const s = settle(world({ weather: 'sun', sheep: 1 }));
    let w = tickWith(s, { type: 'weather', kind: 'fog', holdSimMinutes: 5 });
    for (let i = 0; i < 9; i++) w = tick(w);
    expect(w.weather.foggy).toBe(true);
  });

  it('clear: the sky is sun and the fog flag is off', () => {
    const s = settle(world({ weather: 'rain', sheep: 1 }));
    s.weather = { ...s.weather, foggy: true };
    let w = tickWith(s, { type: 'weather', kind: 'clear', holdSimMinutes: 5 });
    for (let i = 0; i < 9; i++) w = tick(w);
    expect(w.weather.kind).toBe('sun');
    expect(w.weather.foggy).toBeFalsy();
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
  // The pins below are the current (v7, events-included — #40) full-state hashes, the same ones
  // luna-day.test.ts and sheep-day.test.ts carry for this exact seed and script: they moved three
  // times since, for the chronicle schema bump, then for the event engine, then again in Round 2
  // (#82) when the `warmupSimMinutes` fix changed which cards these two days draw; a fourth time in
  // Round 3, when deferring `dlBirthday`'s `realDate` trigger to #84 took the birthday out of the
  // start of every world; and a fifth in **#101**, where the card draw became two decisions a look
  // (a small one and a big one, each with its own gap and chance) and the engine's generator is
  // consumed differently from the first look onwards — see each file's own comment. Not one of the
  // five was anything deity-shaped, which is what this block exists to keep saying. The engine runs
  // on both days here, as it does in those two files.
  it('luna-day.test.ts, seed 11: the end-of-day hash is unchanged', () => {
    let s = createInitialState(11);
    for (let i = 0; i < 1800; i++) s = tick(s);
    expect(hashState(s)).toBe('7c413f504c6d5a57');
  });

  it('sheep-day.test.ts, seed 71: the end-of-day hash is unchanged', () => {
    let s = createInitialState(71);
    for (let i = 0; i < 1800; i++) s = tick(s);
    expect(hashState(s)).toBe('550c55dafd2ae243');
  });
});

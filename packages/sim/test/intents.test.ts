// The player's intents (#25): the client's tap verbs and tray actions, each applied at a tick
// boundary through `step()` and checked against what the prototype's click handler, `dlAction`,
// and `ACTIONS` table do (prototype/luna-farm/src/sim_template.html, "input" section).
import { describe, expect, it } from 'vitest';
import { LUNA_BEHAVIOURS, lunaContext } from '../src/behaviours/luna';
import { hashState } from '../src/hash';
import { INTENT_TYPES, type Intent } from '../src/intents';
import { RULES } from '../src/rules';
import { fromSave, toSave } from '../src/save/serialize';
import { SaveError } from '../src/save/doc';
import { createInitialState, type SimState } from '../src/state';
import { step } from '../src/step';
import { world } from './luna-helpers';

/** Apply `intents` at the next boundary and run that one tick. */
function tickWith(s: SimState, ...intents: Intent[]): SimState {
  return step(s, intents, 100);
}

describe('pet', () => {
  it('Digital Luna: the heart, her name tag for 1800 ms, and the pant reaction of the click handler', () => {
    const a = world();
    const b = tickWith(a, { type: 'pet', target: 'luna' });
    expect(b.luna.icon).toBe('heart');
    expect(b.luna.iconUntilMs).toBe(1600);
    expect(b.luna.tagUntilMs).toBe(1800);
    expect(b.luna.anim).toBe('pant');
    expect(b.luna.t0Ms).toBe(0);
    expect(b.luna.target).toBeNull();
  });

  it('Digital Luna in bed, or under a button hold: the heart and tag, but no pant', () => {
    const bed = world();
    bed.luna.routine = 'bed';
    bed.luna.anim = 'run';
    const b = tickWith(bed, { type: 'pet', target: 'luna' });
    expect(b.luna.icon).toBe('heart');
    expect(b.luna.tagUntilMs).toBe(1800);
    expect(b.luna.anim).toBe('run');
    const held = tickWith(world(), { type: 'lunaAction', action: 'sit' });
    const c = tickWith(held, { type: 'pet', target: 'luna' });
    expect(c.luna.anim).toBe('sit');
    expect(c.luna.manual).toBe('sit');
    expect(c.luna.tagUntilMs).toBe(100 + 1800);
  });

  it('one sheep: the heart and its tag for petTagMs; nothing is shorn even with a full fleece', () => {
    const a = world();
    a.sheep[2]!.wool = 1;
    const b = tickWith(a, { type: 'pet', target: 'sheep-2' });
    const s = b.sheep[2]!;
    expect(s.icon).toBe('heart');
    expect(s.iconUntilMs).toBe(1600);
    expect(s.tagUntilMs).toBe(RULES.petTagMs);
    expect(s.shearAtMs).toBeNull();
    expect(b.banks.wool).toBe(0);
    expect(b.sheep[0]!.icon).toBeNull();
    expect(b.sheep[0]!.tagUntilMs).toBe(0);
  });

  it('the flock: the "pet everyone" action', () => {
    const b = tickWith(world(), { type: 'pet', target: 'flock' });
    for (const s of b.sheep) {
      expect(s.icon).toBe('heart');
      expect(s.tagUntilMs).toBe(1800);
    }
    expect(hashState(b)).toBe(hashState(tickWith(world(), { type: 'farmAction', action: 'petAll' })));
  });

  it('a sheep that is not there is a no-op', () => {
    const a = world();
    const b = tickWith(a, { type: 'pet', target: 'sheep-99' });
    expect(hashState(b)).toBe(hashState(tickWith(a)));
  });
});

describe('shear', () => {
  it('a fleece at or above shearReadyAt: the shears bubble, then 1200 ms later the wool is cleared and one is banked', () => {
    const a = world();
    a.sheep[0]!.wool = RULES.shearReadyAt;
    const b = tickWith(a, { type: 'shear', target: 'sheep-0' });
    const s = b.sheep[0]!;
    expect(s.shearAtMs).toBe(1200);
    expect(s.icon).toBe('shears');
    expect(s.iconUntilMs).toBe(1200);
    expect(s.tagUntilMs).toBe(RULES.petTagMs);
    expect(b.banks.wool).toBe(0);
    // The prototype completes the shear on the first frame past the timer.
    const notYet = step(b, [], 1100);
    expect(notYet.sheep[0]!.shearAtMs).toBe(1200);
    expect(notYet.banks.wool).toBe(0);
    const done = step(notYet, [], 100);
    expect(done.sheep[0]!.shearAtMs).toBeNull();
    expect(done.sheep[0]!.wool).toBe(0.05);
    expect(done.banks.wool).toBe(1);
  });

  it('a fleece below shearReadyAt: the tap is a pet', () => {
    const a = world();
    a.sheep[0]!.wool = RULES.shearReadyAt - 0.01;
    const b = tickWith(a, { type: 'shear', target: 'sheep-0' });
    const s = b.sheep[0]!;
    expect(s.shearAtMs).toBeNull();
    expect(s.icon).toBe('heart');
    expect(s.tagUntilMs).toBe(RULES.petTagMs);
    expect(step(b, [], 2000).banks.wool).toBe(0);
  });

  it('a sheep already being shorn is petted, not shorn twice', () => {
    const a = world();
    a.sheep[0]!.wool = 1;
    a.sheep[0]!.shearAtMs = 500;
    const b = tickWith(a, { type: 'shear', target: 'sheep-0' });
    expect(b.sheep[0]!.shearAtMs).toBe(500);
    expect(b.sheep[0]!.icon).toBe('heart');
    expect(step(b, [], 3000).banks.wool).toBe(1);
  });

  it('the flock: the "shear every woolly sheep" action, with its own .5 threshold', () => {
    const a = world();
    a.sheep.forEach((s, i) => (s.wool = [0.3, 0.5, 0.79, 0.8, 1][i]!));
    const b = tickWith(a, { type: 'shear', target: 'flock' });
    expect(b.sheep.map((s) => s.shearAtMs)).toEqual([null, 1200, 1200, 1200, 1200]);
    expect(b.sheep.map((s) => s.icon)).toEqual([null, 'shears', 'shears', 'shears', 'shears']);
    expect(hashState(b)).toBe(hashState(tickWith(a, { type: 'farmAction', action: 'shearAll' })));
    expect(step(b, [], 1200).banks.wool).toBe(4);
  });
});

describe('click', () => {
  it('on a sheep is the shear-or-pet of the tap; on Digital Luna it is her pet', () => {
    const a = world();
    const s = a.sheep[1]!;
    s.wool = 1;
    const viaClick = tickWith(a, { type: 'click', x: s.x + 5, y: s.y + 5 });
    const viaShear = tickWith(a, { type: 'shear', target: 'sheep-1' });
    expect(viaClick.sheep[1]!.shearAtMs).toBe(1200);
    expect(hashState(viaClick)).toBe(hashState(viaShear));
    const l = a.luna;
    const lunaClick = tickWith(a, { type: 'click', x: l.x + 5, y: l.y + 5 });
    expect(hashState(lunaClick)).toBe(hashState(tickWith(a, { type: 'pet', target: 'luna' })));
  });
});

describe('throwStick', () => {
  it('puts the stick out; the fetch behaviour picks it up on that same tick through the registry', () => {
    const a = world();
    const b = tickWith(a, { type: 'throwStick', x: 400, y: 250 });
    expect(b.luna.stick).toMatchObject({ x: 400, y: 250, fromX: a.luna.x + 22, fromY: a.luna.y + 38, phase: 'out' });
    // The registry's own selection, not a special case in the intent: `fetch` is the behaviour it picks.
    expect(LUNA_BEHAVIOURS.select(lunaContext(b), b.luna, 'fetch')?.id).toBe('fetch');
    expect(b.luna.anim).toBe('run');
    expect(b.luna.target).toEqual({ x: 400, y: 254 });
    expect(b.luna.x).toBeGreaterThan(a.luna.x); // she is already running for it
    // Out and back at the fetch speeds takes well under 20 s; the tick the stick is dropped she pants.
    let back = b;
    for (let i = 0; i < 200 && back.luna.stick; i++) back = step(back, [], 100);
    expect(back.luna.stick).toBeNull();
    expect(back.luna.anim).toBe('pant');
    expect(back.luna.icon).toBe('heart');
  });

  it('is refused in rain, in the barn, in bed, or off the field, as the prototype', () => {
    const rainy = world({ weather: 'rain' });
    expect(tickWith(rainy, { type: 'throwStick', x: 400, y: 250 }).luna.stick).toBeNull();
    const bed = world();
    bed.luna.routine = 'asleep';
    expect(tickWith(bed, { type: 'throwStick', x: 400, y: 250 }).luna.stick).toBeNull();
    expect(tickWith(world(), { type: 'throwStick', x: 2, y: 2 }).luna.stick).toBeNull();
  });
});

describe('dlAction', () => {
  it('is lunaAction under the client name: a sit is a 6 s hold', () => {
    const a = world();
    const b = tickWith(a, { type: 'dlAction', action: 'sit' });
    expect(b.luna.manual).toBe('sit');
    expect(b.luna.manualUntilMs).toBe(6000);
    expect(b.luna.anim).toBe('sit');
    expect(hashState(b)).toBe(hashState(tickWith(a, { type: 'lunaAction', action: 'sit' })));
  });

  it('come sends her to the front, trundle sets the bound timer, bed starts the bedtime routine', () => {
    const a = world();
    const come = tickWith(a, { type: 'dlAction', action: 'come' });
    expect(come.luna.manual).toBe('walk');
    expect(come.luna.anim).toBe('run');
    const trundle = tickWith(a, { type: 'dlAction', action: 'trundle' });
    expect(trundle.luna.forceBoundUntilMs).toBe(6000);
    const bed = tickWith(a, { type: 'dlAction', action: 'bed' });
    expect(bed.luna.routine).toBe('bed');
    expect(bed.luna.manual).toBeNull();
  });
});

describe('sheepAction', () => {
  it('rest, for one sheep: only that sheep lies down', () => {
    const a = world();
    const b = tickWith(a, { type: 'sheepAction', action: 'rest', target: 'sheep-1' });
    expect(b.sheep[1]!.resting).toBe(true);
    expect(b.sheep[1]!.path).toEqual([]);
    expect(b.sheep.filter((s) => s.resting).map((s) => s.id)).toEqual(['sheep-1']);
  });

  it('wool, for one sheep: a full fleece at once', () => {
    const a = world();
    const b = tickWith(a, { type: 'sheepAction', action: 'wool', target: 'sheep-3' });
    expect(b.sheep[3]!.wool).toBe(1);
    expect(b.sheep[0]!.wool).toBeLessThan(1);
  });

  it('lamb, for one sheep: a lamb at her side unless she has one or is in the barn', () => {
    const a = world();
    const b = tickWith(a, { type: 'sheepAction', action: 'lamb', target: 'sheep-4' });
    expect(b.sheep[4]!.lambs).toHaveLength(1);
    expect(b.sheep[4]!.lambs[0]).toMatchObject({ bornMs: 0, grown: false });
    expect(b.sheep.slice(0, 4).every((s) => s.lambs.length === 0)).toBe(true);
    const again = tickWith(b, { type: 'sheepAction', action: 'lamb', target: 'sheep-4' });
    expect(again.sheep[4]!.lambs).toHaveLength(1);
    const barn = world();
    barn.sheep[0]!.inBarn = true;
    expect(tickWith(barn, { type: 'sheepAction', action: 'lamb', target: 'sheep-0' }).sheep[0]!.lambs).toEqual([]);
  });

  it('graze, for one sheep: claims the nearest tuft and walks to it', () => {
    const a = world();
    const b = tickWith(a, { type: 'sheepAction', action: 'graze', target: 'sheep-0' });
    const s = b.sheep[0]!;
    expect(s.tuft).not.toBeNull();
    expect(b.tufts[s.tuft!]!.claimed).toBe('sheep-0');
    expect(s.wander).toBe(1);
    expect(s.resting).toBe(false);
  });

  it('scatter, for one sheep: one new foot point from the generator, so the flock version and the tray button agree', () => {
    const a = world();
    const one = tickWith(a, { type: 'sheepAction', action: 'scatter', target: 'sheep-2' });
    expect(one.sheep[2]!.wander).toBe(0);
    expect(one.sheep[2]!.tx).not.toBeNull();
    const flock = tickWith(a, { type: 'sheepAction', action: 'scatter', target: 'flock' });
    expect(hashState(flock)).toBe(hashState(tickWith(a, { type: 'farmAction', action: 'scatter' })));
    expect(hashState(flock)).not.toBe(hashState(one));
  });
});

describe('farmAction', () => {
  it('rabbit is the client name for rabbitOnly: a rabbit with no chase', () => {
    const a = world();
    const b = tickWith(a, { type: 'farmAction', action: 'rabbit' });
    expect(b.life.rabbit).not.toBeNull();
    expect(b.luna.chasing).toBe(false);
    expect(hashState(b)).toBe(hashState(tickWith(a, { type: 'farmAction', action: 'rabbitOnly' })));
  });

  it('farmer and coins still do what they did', () => {
    const a = world();
    expect(tickWith(a, { type: 'farmAction', action: 'farmer' }).npcs.farmer).not.toBeNull();
    expect(tickWith(a, { type: 'farmAction', action: 'coins' }).banks.coins).toBeGreaterThanOrEqual(0);
  });
});

/** Every player intent, in a fixed script keyed by step index. */
function scripted(i: number): Intent[] {
  switch (i) {
    case 10:
      return [{ type: 'pet', target: 'luna' }];
    case 30:
      return [{ type: 'sheepAction', action: 'wool', target: 'sheep-1' }, { type: 'shear', target: 'sheep-1' }];
    case 60:
      return [{ type: 'throwStick', x: 420, y: 230 }];
    case 120:
      return [{ type: 'dlAction', action: 'come' }, { type: 'pet', target: 'sheep-3' }];
    case 180:
      return [{ type: 'sheepAction', action: 'scatter', target: 'flock' }];
    case 240:
      return [{ type: 'farmAction', action: 'rabbit' }, { type: 'shear', target: 'flock' }];
    case 300:
      return [{ type: 'sheepAction', action: 'lamb', target: 'sheep-0' }, { type: 'dlAction', action: 'ride' }];
    default:
      return [];
  }
}

describe('determinism with player intents interleaved', () => {
  it('the same seed and the same intents through step() replay to the same hash', () => {
    const play = (script: (i: number) => Intent[]) => {
      let s = createInitialState(7);
      for (let i = 0; i < 400; i++) s = step(s, script(i), i % 7 === 0 ? 1000 : 116);
      return s;
    };
    const a = play(scripted);
    const b = play(scripted);
    expect(a.clock.tick).toBe(976);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.banks.wool).toBeGreaterThan(0);
    // And the intents did something: the same seed with none of them is a different world.
    expect(hashState(a)).not.toBe(hashState(play(() => [])));
  });
});

describe('saved intents', () => {
  it('every intent type is listed, and each player intent rides through a save', () => {
    expect(INTENT_TYPES).toEqual(expect.arrayContaining(['pet', 'shear', 'throwStick', 'dlAction', 'sheepAction', 'farmAction']));
    const queued: Intent[] = [
      { type: 'pet', target: 'luna', at: 20 },
      { type: 'shear', target: 'sheep-0', at: 20 },
      { type: 'throwStick', x: 400, y: 250, at: 20 },
      { type: 'dlAction', action: 'tilt', at: 20 },
      { type: 'sheepAction', action: 'rest', target: 'flock', at: 20 },
      { type: 'farmAction', action: 'rabbit', at: 20 },
    ];
    const s = step(createInitialState(7), queued, 100);
    expect(s.pendingIntents).toEqual(queued);
    const loaded = fromSave(JSON.parse(JSON.stringify(toSave(s))));
    expect(loaded.pendingIntents).toEqual(queued);
    expect(hashState(step(loaded, [], 3000))).toBe(hashState(step(s, [], 3000)));
  });

  it('rejects a queued intent with the wrong fields', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof SaveError ? e.code : 'other';
      }
      return 'ok';
    };
    const withIntent = (intent: unknown) => {
      const doc = toSave(createInitialState(7));
      (doc.world.pendingIntents as unknown[]).push(intent);
      return doc;
    };
    expect(code(() => fromSave(withIntent({ type: 'pet', target: 'luna' })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'pet', target: 'cow' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'shear', target: 'luna' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'throwStick', x: 1 })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'dlAction', action: 'moonwalk' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'sheepAction', action: 'graze', target: 'flock' })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'sheepAction', action: 'fly', target: 'flock' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'farmAction', action: 'bird' })))).toBe('ok');
    expect(code(() => fromSave(withIntent({ type: 'farmAction', action: 'circus' })))).toBe('invalid-world');
    expect(code(() => fromSave(withIntent({ type: 'setWeather', weather: 'hail' })))).toBe('invalid-world');
  });
});

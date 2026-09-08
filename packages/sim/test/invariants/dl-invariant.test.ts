// The DL invariant (#61): nothing in the sim can harm Digital Luna. This test runs in the sim
// suite forever and is never skipped, loosened, or moved (docs/agents/charters/sim.md). "Harm" is
// defined once, as data, in dl-harm.ts; every check below shares that one predicate.
//
// Three parts:
//   1. A fuzz: seeds 1 to 50, a scripted day each (1,800 ticks, the luna-day.test.ts convention),
//      every intent type the sim accepts, weather cycling, and both NPCs the sim can place — and
//      the harm predicate never holds on any tick.
//   2. A static guard: nothing outside her own chain writes to her state. TypeScript gives no
//      supported way to walk arbitrary closures' write targets from a test, so this is done
//      dynamically instead, as the issue allows: her object runs a real day under a write-tracking
//      Proxy, once through the sheep phase alone (which, read in full, never names `luna`) and once
//      per intent handler (where her player-facing command surface may write to her, but only
//      within the same harm predicate the fuzz uses).
//   3. This file exists and carries no skip or only modifier, so the suite above can never be
//      narrowed or dropped without the change showing up here too.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { advanceClock, advanceSeason, SEASONS } from '../../src/clock';
import { tickSheep } from '../../src/behaviours/sheep';
import { applyIntent, FARM_ACTIONS, INTENT_TYPES, LUNA_ACTIONS, SHEEP_ACTIONS, type Intent } from '../../src/intents';
import { RULES, TICK_MS, TICK_SEC } from '../../src/rules';
import { cloneState, createInitialState, type Luna, type SimState } from '../../src/state';
import { step } from '../../src/step';
import { tickWeather } from '../../src/weather';
import { harmIn } from './dl-harm';

const TICKS_PER_DAY = 1800;

/**
 * Cards and the event engine (#40) do not exist yet, and neither does a crow in the sim: the crow
 * brief (docs/content/CROW_BRIEF.md) is art only so far, and "behaviour is the sim lane's ticket"
 * per that doc, still open. This is the plug point for both: each entry is called once per tick
 * with the live state, so a new event or a landed crow that can touch Digital Luna gets fuzzed here
 * the moment it exists, with no other change to this file. Empty today, on purpose.
 */
const EVENT_ENGINE_HOOKS: ReadonlyArray<(s: SimState) => void> = [];

/**
 * Every intent type the sim accepts (src/intents.ts), with enough variety in the enum-shaped ones
 * (every Luna action, every farm action, every sheep action, both weather and season options) that
 * running this list once is a real exercise of every intent handler, not just its type switch. The
 * dynamic bits (sheep ids, DL's own position for a click that might land on her) come from `state`
 * so this works for whatever tick it is called on.
 */
function scriptedIntents(state: SimState): Intent[] {
  const ids = state.sheep.map((s) => s.id);
  const a = ids[0] ?? 'sheep-0';
  const b = ids[1] ?? a;
  const list: Intent[] = [];
  for (const weather of ['sun', 'rain', 'snow'] as const) list.push({ type: 'setWeather', weather });
  for (const mode of ['season', 'manual'] as const) list.push({ type: 'setWeatherMode', mode });
  for (const t of [0.05, 0.4, 0.5, 0.7, 0.95]) list.push({ type: 'setClock', t });
  for (const periodSec of [90, 180, 240]) list.push({ type: 'setPeriod', periodSec });
  for (const paused of [true, false]) list.push({ type: 'pauseClock', paused });
  for (const season of [...SEASONS, null]) list.push({ type: 'setSeason', season });
  list.push(
    { type: 'click', x: state.luna.x + 10, y: state.luna.y + 10 }, // may land on her
    { type: 'click', x: 200, y: 260 }, // likely grass: a stick
    { type: 'click', x: 450, y: 220 },
  );
  for (const target of ['luna', 'flock', a] as const) list.push({ type: 'pet', target });
  for (const target of ['flock', a, b] as const) list.push({ type: 'shear', target });
  list.push({ type: 'throwStick', x: 180, y: 140 }, { type: 'throwStick', x: 420, y: 280 });
  for (const action of LUNA_ACTIONS) list.push({ type: 'lunaAction', action });
  list.push({ type: 'dlAction', action: 'sit' }, { type: 'dlAction', action: 'run' });
  for (const action of SHEEP_ACTIONS) for (const target of ['flock', a] as const) list.push({ type: 'sheepAction', action, target });
  for (const action of FARM_ACTIONS) list.push({ type: 'farmAction', action });
  return list;
}

/** Her sanctioned command surface: the only intent shapes allowed to write to `state.luna` at all. */
function mayTouchLuna(intent: Intent): boolean {
  switch (intent.type) {
    case 'click': // may resolve to a pet on her, a sheep, or a thrown stick
    case 'throwStick':
    case 'lunaAction':
    case 'dlAction':
      return true;
    case 'pet':
      return intent.target === 'luna';
    default:
      return false;
  }
}

/** Wrap an object so every property set is recorded, then still happens. Reads pass straight through. */
function writeTrackingProxy<T extends object>(target: T, writes: string[]): T {
  return new Proxy(target, {
    set(t, prop, value) {
      writes.push(String(prop));
      return Reflect.set(t, prop, value);
    },
  });
}

describe('the intent list below covers every intent type the sim accepts', () => {
  it('src/intents.ts and this file name the same set', () => {
    const types = new Set(scriptedIntents(createInitialState(1)).map((i) => i.type));
    expect([...types].sort()).toEqual([...INTENT_TYPES].sort());
  });
});

describe('fuzz: nothing in the sim can harm Digital Luna (#61)', () => {
  function fuzzDay(seed: number): void {
    let s: SimState = createInitialState(seed);
    // Guarantee both NPCs the sim can place turn up at least once, on top of their own schedule
    // (the farmer's two daily visits, the merchant's timer): every seed sees the farmer and the
    // merchant, not just whichever seeds happen to reach their schedule inside one day.
    s = step(s, [{ type: 'farmAction', action: 'farmer' }, { type: 'farmAction', action: 'merchant' }], TICK_MS);
    let reasons = harmIn(s);
    expect(reasons, `seed ${seed} tick ${s.clock.tick}: ${reasons.join('; ')}`).toEqual([]);

    const intents = scriptedIntents(s);
    const everyTicks = 20; // 2 sim-seconds: the 1,800-tick day cycles the whole intent list more than once
    for (let i = 1; i < TICKS_PER_DAY; i++) {
      const due: Intent[] = i % everyTicks === 0 ? [intents[Math.floor(i / everyTicks + seed) % intents.length] as Intent] : [];
      s = step(s, due, TICK_MS);
      for (const hook of EVENT_ENGINE_HOOKS) hook(s);
      reasons = harmIn(s);
      expect(reasons, `seed ${seed} tick ${s.clock.tick}: ${reasons.join('; ')}`).toEqual([]);
    }
    expect(s.clock.tick, `seed ${seed}`).toBe(TICKS_PER_DAY);
  }

  for (let seed = 1; seed <= 50; seed++) {
    it(`seed ${seed}: a scripted day of every intent, weather cycling, the farmer and the merchant`, () => {
      fuzzDay(seed);
    });
  }
});

describe('static guard: nothing outside her own chain writes to Digital Luna', () => {
  it('no sheep behaviour ever writes to her: a real day of the sheep phase alone, with her fields under watch', () => {
    // Confirmed by reading src/behaviours/sheep.ts: no sheep behaviour, in a condition or a tick,
    // names `luna` at all (the file's only match for the word is this fact, in a comment). This
    // proves the same thing dynamically, so a later change that breaks it fails a test and not just
    // a reading of the source: replace her object with a Proxy that records every property set, run
    // the real tick pipeline up to and including `tickSheep` — clock, season, weather, tuft growth,
    // every sheep chain — for a full day on a few seeds, and show the record stays empty.
    // `tickLuna`, `tickNpcs`, and the life tick are deliberately not called here: this isolates the
    // one phase that must never touch her from the ones that legitimately do (see the next test).
    for (const seed of [3, 11, 23]) {
      const s = createInitialState(seed);
      const writes: string[] = [];
      s.luna = writeTrackingProxy(s.luna, writes);
      for (let i = 0; i < TICKS_PER_DAY; i++) {
        s.clock = advanceClock(s.clock, TICK_MS);
        s.season = advanceSeason(s.season, TICK_MS);
        s.weather = tickWeather(s.weather, s.clock, s.season, s.rng);
        for (const t of s.tufts) t.level = Math.min(1, t.level + TICK_SEC * RULES.tuftRegrowPerSec);
        tickSheep(s);
      }
      expect(writes, `seed ${seed}`).toEqual([]);
    }
  });

  it('every intent handler either leaves her alone, or only ever moves her within the harm predicate’s safe bounds', () => {
    // The other two known touchpoints outside behaviours/luna.ts and intents.ts — the farmer's pat
    // job (npcs.ts) and the rabbit giving up the chase (life.ts) — are not intents, so they are not
    // walked here; the fuzz above runs both for real, every seed, with the same harm predicate.
    for (const seed of [1, 4, 9]) {
      const base = createInitialState(seed);
      for (const intent of scriptedIntents(base)) {
        const s = cloneState(base);
        const writes: string[] = [];
        s.luna = writeTrackingProxy(s.luna, writes) as Luna;
        applyIntent(s, intent);
        if (!mayTouchLuna(intent)) {
          expect(writes, `seed ${seed} ${JSON.stringify(intent)}`).toEqual([]);
        } else if (writes.length) {
          const reasons = harmIn(s);
          expect(reasons, `seed ${seed} ${JSON.stringify(intent)}: ${reasons.join('; ')}`).toEqual([]);
        }
      }
    }
  });
});

describe('this file is the DL invariant: it exists and is never skipped or narrowed', () => {
  const self = fileURLToPath(import.meta.url);
  const harmFile = fileURLToPath(new URL('./dl-harm.ts', import.meta.url));

  it('the invariant test file and its harm definition exist on disk', () => {
    expect(existsSync(self)).toBe(true);
    expect(existsSync(harmFile)).toBe(true);
  });

  it('carries no skip or only modifier', () => {
    // The two patterns are built from parts so this assertion, and this comment, do not themselves
    // contain the literal text they are checking for — the same trick no-random.test.ts uses so the
    // guard cannot trip over its own source.
    const skip = new RegExp('\\.' + 'skip' + '\\b');
    const only = new RegExp('\\.' + 'only' + '\\b');
    const text = readFileSync(self, 'utf8');
    expect(skip.test(text)).toBe(false);
    expect(only.test(text)).toBe(false);
  });
});

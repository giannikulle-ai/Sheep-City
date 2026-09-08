// The DL invariant (#61): nothing in the sim can harm Digital Luna. This test runs in the sim
// suite forever and is never skipped, loosened, or moved (docs/agents/charters/sim.md). "Harm" is
// defined once, as data, in dl-harm.ts; every check below shares that one predicate.
//
// Six parts:
//   1. A fuzz: seeds 1 to 50, a scripted day each (1,800 ticks, the luna-day.test.ts convention),
//      every intent type the sim accepts, weather cycling, and both NPCs the sim can place — and
//      the harm predicate never holds on any tick.
//   2. A static guard: nothing outside her own chain writes to her state. TypeScript gives no
//      supported way to walk arbitrary closures' write targets from a test, so this is done
//      dynamically instead, as the issue allows: her object runs a real day under a write-tracking
//      Proxy, once through the sheep phase alone (which, read in full, never names `luna`) and once
//      per intent handler (where her player-facing command surface may write to her, but only
//      within the same harm predicate the fuzz uses). Two Proxies, not one: `state` itself is
//      wrapped too, so replacing `state.luna` wholesale is caught, and a before/after deep
//      snapshot of her fields catches a write through a nested field (`s.luna.target.x = …`) that
//      neither Proxy's `set` trap can see (Round 2, review finding 1 — see the guard's own doc
//      comment below for the reproduction that motivated this).
//   3. Off-screen: `harmIn(respawn(ledger))` over a district stepped away from and back, so the "on
//      screen or off" half of the non-negotiable is covered too (Round 2, review finding 5) — the
//      Ledger runs the world with no actors while a district is off-screen
//      (docs/agents/charters/sim.md), and `respawn` is the only other place that writes her `anim`
//      and position. The away-times are chosen, and checked, to actually reach a night ledger and a
//      rain ledger — Round 3, review finding R2-1 caught the previous away-times never doing either,
//      so `respawn`'s night branch ran zero times and the whole block was inert.
//   4. A stuck-hold check on `manual === 'ride'`: the one `manual` value the bounded-hold check in
//      part 5 exempts from its "not already stale" half, because a failed mount legitimately leaves
//      it sitting on a stale `manualUntilMs` for one tick. Round 3, review finding R2-6 showed that
//      exemption is not narrow enough — a writer that holds `manual = 'ride'` for many ticks with
//      neither `mounting` nor `riding` ever set is stuck, and nothing catches it. This check is
//      keyed to elapsed ticks, not to `manual`'s value, so it does not share the same hole.
//   5. The harm predicate itself: one crafted state per `HARM_CHECKS` entry, each built to trip that
//      one check, asserting `harmIn` names it — plus the exact list of names `HARM_CHECKS` must
//      carry. Round 3, review finding R2-2: replacing `HARM_CHECKS`'s body with `[]` (the export
//      line intact, so no-skips.test.ts's substring check still passed) left the whole package
//      green, because every other use of `harmIn` in this file only ever asserts the *empty* result.
//   6. This file exists and carries no skip or only modifier, so the suite above can never be
//      narrowed or dropped without the change showing up here too. That claim used to be checked
//      by this file alone — Round 2, review finding 3 moved the actual scan to a separate,
//      suite-wide file (no-skips.test.ts) that this file cannot defeat by being skipped itself; this
//      file returns the favour and checks no-skips.test.ts by the same two properties (Round 3,
//      review finding R2-3), so neither file can be skipped or deleted without the other catching it.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LUNA_ID } from '../../src/actors';
import { advanceClock, advanceSeason, phaseOf, SEASONS } from '../../src/clock';
import { tickSheep } from '../../src/behaviours/sheep';
import { ACT_VERBS, applyIntent, DEITY_WEATHER_KINDS, FARM_ACTIONS, INTENT_TYPES, LUNA_ACTIONS, SHEEP_ACTIONS, type Intent } from '../../src/intents';
import { createChronicle } from '../../src/chronicle/store';
import { advanceLedger } from '../../src/ledger/advance';
import { summarise } from '../../src/ledger/ledger';
import { respawn } from '../../src/ledger/respawn';
import { createRng } from '../../src/rng';
import { RULES, TICK_MS, TICK_SEC } from '../../src/rules';
import { cloneState, createInitialState, type Luna, type SimState } from '../../src/state';
import { step } from '../../src/step';
import { tickWeather } from '../../src/weather';
import { HARM_CHECKS, RideStuckGuard, harmIn } from './dl-harm';

const TICKS_PER_DAY = 1800;
const DAY_MS = RULES.clock.periodSec * 1000;

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
  // The deity powers (#43, merged onto trunk since Round 2): `weather` never touches an actor, only
  // `state.weather`; `act` stages a command on one named actor — Digital Luna included, by her own
  // id — for every verb, `call` (the only one that carries a point) aimed both at her and a sheep.
  for (const kind of DEITY_WEATHER_KINDS) list.push({ type: 'weather', kind, holdSimMinutes: 5 });
  for (const verb of ACT_VERBS) {
    if (verb === 'call') {
      list.push({ type: 'act', target: LUNA_ID, verb: 'call', x: state.luna.x + 20, y: state.luna.y + 10 });
      list.push({ type: 'act', target: a, verb: 'call', x: 200, y: 200 });
    } else {
      list.push({ type: 'act', target: LUNA_ID, verb }, { type: 'act', target: a, verb });
    }
  }
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
    case 'act':
      // The deity `act` intent (#43) writes `state.luna.actCmd` directly when aimed at her — see
      // `applyAct` in src/intents.ts — and only when aimed at her; a sheep target never reaches
      // `state.luna` at all.
      return intent.target === LUNA_ID;
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

/**
 * Wrap `state` itself so replacing `state.luna` wholesale — not a set on her own object, a set on
 * `state` — is recorded too, under the reserved key `'luna (replaced)'`.
 *
 * Round 2, review finding 1: without this, `writeTrackingProxy` alone is defeated by one line
 * inside `tickSheep` — reproduced against the pre-fix guard and confirmed to slip through clean:
 *
 *   s.luna = { ...s.luna, riding: s.sheep[0]!.id, rideUntilMs: Infinity, anim: 'sleep',
 *              manual: 'sleep', manualUntilMs: Infinity };
 *
 * That is a *set on `state`*, not a set on the tracked `luna` object, so the old guard's trap never
 * fired — and once `state.luna` is replaced, the tracked proxy is gone from the state entirely, so
 * every later write goes unrecorded too. This proxy closes that hole: the replacement itself is
 * now a recorded write, on the object the write-guard tests actually assign into (`state`/`s`), so
 * the assertion below catches it directly.
 */
function stateReplaceGuard(state: SimState, writes: string[]): SimState {
  return new Proxy(state, {
    set(t, prop, value) {
      if (prop === 'luna') writes.push('luna (replaced)');
      return Reflect.set(t, prop, value);
    },
  });
}

/**
 * A plain-data deep clone of every field on Luna, for a before/after diff that catches what no
 * `set` trap can see: a nested write (`s.luna.target.x = …`, `s.luna.stick.x = …`) is a *get* of
 * `target`/`stick` — passed straight through by `writeTrackingProxy`, untouched — followed by a set
 * on that inner object. That is not a set on Luna and not a set on `state`, so neither
 * `writeTrackingProxy` nor `stateReplaceGuard` traps it; a before/after deep-equality check does,
 * because whatever path the write took, her final fields no longer match the snapshot. Luna is
 * plain JSON-safe data (points, strings, numbers, nulls); a JSON round-trip is a faithful, fully
 * independent snapshot, and — unlike `structuredClone` — reads straight through a Proxy instead of
 * throwing on one, which matters here since `l` may itself be `writeTrackingProxy`'s Proxy.
 */
function snapshotLuna(l: Luna): unknown {
  return JSON.parse(JSON.stringify(l));
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
    // Round 3, review finding R2-6: a stateful companion to harmIn for the one harm shape a pure
    // per-tick predicate cannot see — see RideStuckGuard's doc comment in dl-harm.ts.
    const rideGuard = new RideStuckGuard();
    let stuck = rideGuard.next(s.luna);
    expect(stuck, `seed ${seed} tick ${s.clock.tick}`).toBeNull();

    const intents = scriptedIntents(s);
    const everyTicks = 20; // 2 sim-seconds: the 1,800-tick day cycles the whole intent list more than once
    for (let i = 1; i < TICKS_PER_DAY; i++) {
      const due: Intent[] = i % everyTicks === 0 ? [intents[Math.floor(i / everyTicks + seed) % intents.length] as Intent] : [];
      s = step(s, due, TICK_MS);
      for (const hook of EVENT_ENGINE_HOOKS) hook(s);
      reasons = harmIn(s);
      expect(reasons, `seed ${seed} tick ${s.clock.tick}: ${reasons.join('; ')}`).toEqual([]);
      stuck = rideGuard.next(s.luna);
      expect(stuck, `seed ${seed} tick ${s.clock.tick}`).toBeNull();
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
    // a reading of the source: replace her object with a Proxy that records every property set
    // (and `state` with one that records a wholesale replacement of `state.luna`), run the real
    // tick pipeline up to and including `tickSheep` — clock, season, weather, tuft growth, every
    // sheep chain — for a full day on a few seeds, and show both the write record and a before/after
    // deep snapshot of her fields stay empty/unchanged. `tickLuna`, `tickNpcs`, and the life tick
    // are deliberately not called here: this isolates the one phase that must never touch her from
    // the ones that legitimately do (see the next test).
    //
    // Round 3, review finding R2-6: neither Proxy traps `defineProperty`, so a mutation made that
    // way and restored before the loop ends was invisible to a single before/after diff taken once
    // at the very end — reproduced with `Object.defineProperty(s.luna, 'anim'|'riding', …)` inside
    // `tickSheep`, alternating on tick parity so it self-restored every other tick; the old
    // once-at-the-end check passed clean. The snapshot below now runs every tick instead, at a
    // measured cost well inside the 60 s budget (see the round's checks output) — this catches that
    // reproduction the tick it happens, not only a change that survives to the end of the day.
    for (const seed of [3, 11, 23]) {
      const s0: SimState = createInitialState(seed);
      const before = snapshotLuna(s0.luna);
      const writes: string[] = [];
      // Wrap her object directly on s0 first (not through the state proxy below, or the setup
      // assignment itself would be recorded as a "replacement").
      s0.luna = writeTrackingProxy(s0.luna, writes);
      const s = stateReplaceGuard(s0, writes);
      for (let i = 0; i < TICKS_PER_DAY; i++) {
        s.clock = advanceClock(s.clock, TICK_MS);
        s.season = advanceSeason(s.season, TICK_MS);
        s.weather = tickWeather(s.weather, s.clock, s.season, s.rng);
        for (const t of s.tufts) t.level = Math.min(1, t.level + TICK_SEC * RULES.tuftRegrowPerSec);
        tickSheep(s);
        expect(snapshotLuna(s0.luna), `seed ${seed} tick ${i}: her fields changed with no write recorded`).toEqual(before);
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
        const s0 = cloneState(base);
        const before = snapshotLuna(s0.luna);
        const writes: string[] = [];
        s0.luna = writeTrackingProxy(s0.luna, writes) as Luna;
        const s = stateReplaceGuard(s0, writes);
        applyIntent(s, intent);
        const nestedWrite = JSON.stringify(snapshotLuna(s0.luna)) !== JSON.stringify(before);
        if (!mayTouchLuna(intent)) {
          expect(writes, `seed ${seed} ${JSON.stringify(intent)}`).toEqual([]);
          expect(nestedWrite, `seed ${seed} ${JSON.stringify(intent)}: her fields changed with no write recorded`).toBe(false);
        } else if (writes.length || nestedWrite) {
          const reasons = harmIn(s0);
          expect(reasons, `seed ${seed} ${JSON.stringify(intent)}: ${reasons.join('; ')}`).toEqual([]);
        }
      }
    }
  });
});

describe('off-screen: a respawned state never harms Digital Luna either (CLAUDE.md: "on screen or off")', () => {
  // respawn() (src/ledger/respawn.ts) is the only other place that writes her `anim` and position:
  // the Ledger runs a district with no actors while it is off-screen (docs/agents/charters/sim.md),
  // and respawn is how it hands a world back to the actor tick. It special-cases night (asleep in
  // the barn) and reads the ledger's own weather for the flock, so this has to actually land on a
  // night ledger and a rain ledger to mean anything — Round 2, review finding 5 caught this block
  // checking only day/dusk, sun-only ledgers (the five away-times below it used, 0/0.3/0.7/3/9.05
  // days, happened to land there on all three seeds): `respawn`'s `if (night)` branch never ran, so
  // every assertion checked the same freshly-made `makeLuna()`, and the block stayed green even
  // when a probe planted `luna.manual = 'sleep'; luna.manualUntilMs = Infinity;` inside that branch
  // unconditionally (every night respawn pins her asleep forever off-screen) — 28/529 tests still
  // passed. AWAY_STEP_MS (0.137 of a day) and 40 steps are not tuned for speed, they're measured:
  // stepping seeds 2, 5, and 13 by that amount 40 times each reaches `night` by step 2 and `rain` by
  // step 23 (seed 2), step 5 (seed 5), step 0 (seed 13) — every seed passes through day, dusk,
  // night, and dawn, and through both sun and rain. `sawNight`/`sawRain` assert that coverage
  // directly, so a future change to the step size or the seed list that loses either phase fails
  // here instead of leaving the block quietly checking only daylight again.
  const AWAY_STEP_MS = Math.floor(DAY_MS * 0.137);
  const AWAY_STEPS = 40;

  it('harmIn(respawn(ledger)) is [] at every step, and the away-times actually reach night and rain', () => {
    for (const seed of [2, 5, 13]) {
      const rng = createRng(seed + 500);
      let ledger = summarise(createInitialState(seed));
      let sawNight = false;
      let sawRain = false;
      for (let i = 0; i < AWAY_STEPS; i++) {
        ledger = advanceLedger(ledger, AWAY_STEP_MS, rng);
        const respawned = respawn(ledger, createChronicle());
        const reasons = harmIn(respawned);
        expect(reasons, `seed ${seed} step ${i} (away ${(i + 1) * AWAY_STEP_MS}ms): ${reasons.join('; ')}`).toEqual([]);
        if (phaseOf(ledger.clock.t) === 'night') sawNight = true;
        if (ledger.weather.rain) sawRain = true;
      }
      expect(sawNight, `seed ${seed}: never reached a night ledger across ${AWAY_STEPS} away-steps — this block would be inert`).toBe(true);
      expect(sawRain, `seed ${seed}: never reached a rain ledger across ${AWAY_STEPS} away-steps — this block would be inert`).toBe(true);
    }
  });
});

describe('harm predicate: every HARM_CHECKS entry actually fires, and the set cannot shrink silently', () => {
  // Round 3, review finding R2-2: replacing HARM_CHECKS's body with `export const HARM_CHECKS:
  // readonly HarmCheck[] = [];` — the export line intact, so no-skips.test.ts's substring check
  // still passed — left the entire package green, 27 files / 526 tests. Every use of `harmIn`
  // elsewhere in this file only ever asserts the *empty* result, so nothing anywhere proved any
  // check ever actually fires. This closes it two ways: one crafted state per check below, each
  // built to trip that one check and asserting `harmIn` names it (so an empty or gutted
  // `HARM_CHECKS` fails immediately, and so does a check whose `detect` silently stopped firing);
  // and the exact list of names `HARM_CHECKS` is supposed to carry, so deleting or renaming one
  // entry — not just emptying the whole array — fails here too even if every remaining check still
  // works.
  //
  // A probe only has to make `harmIn` report the target check by name; it does not have to avoid
  // tripping any other check too; harmIn collects every reason, not just the first.
  const PROBES: Record<string, (state: SimState) => void> = {
    'wet-floor': (state) => {
      state.luna.wet = -0.5;
    },
    'wet-ceiling': (state) => {
      state.luna.wet = 1.5;
    },
    'snow-floor': (state) => {
      state.luna.snow = -0.5;
    },
    'snow-ceiling': (state) => {
      state.luna.snow = 1.5;
    },
    'anim-known': (state) => {
      state.luna.anim = 'definitely-not-a-real-anim';
    },
    'position-in-world': (state) => {
      state.luna.x = 1e9;
    },
    'riding-sheep-exists': (state) => {
      state.luna.riding = 'ghost-sheep';
    },
    'riding-hold-bounded': (state) => {
      state.luna.riding = state.sheep[0]!.id;
      state.luna.rideUntilMs = Infinity;
    },
    'manual-hold-bounded': (state) => {
      state.luna.manual = 'sleep';
      state.luna.manualUntilMs = Infinity;
    },
    'circle-hold-bounded': (state) => {
      state.luna.routine = 'bed';
      state.luna.target = null;
      state.luna.circleUntilMs = Infinity;
    },
    'icon-hold-bounded': (state) => {
      state.luna.iconUntilMs = Infinity;
    },
    'tag-hold-bounded': (state) => {
      state.luna.tagUntilMs = Infinity;
    },
    'force-bound-hold-bounded': (state) => {
      state.luna.forceBoundUntilMs = Infinity;
    },
  };

  it('this file has a probe for every HARM_CHECKS entry, and no probe for a check that no longer exists', () => {
    expect(Object.keys(PROBES).sort()).toEqual(HARM_CHECKS.map((c) => c.name).sort());
  });

  it('HARM_CHECKS carries exactly this list of names', () => {
    expect(HARM_CHECKS.map((c) => c.name)).toEqual([
      'wet-floor',
      'wet-ceiling',
      'snow-floor',
      'snow-ceiling',
      'anim-known',
      'position-in-world',
      'riding-sheep-exists',
      'riding-hold-bounded',
      'manual-hold-bounded',
      'circle-hold-bounded',
      'icon-hold-bounded',
      'tag-hold-bounded',
      'force-bound-hold-bounded',
    ]);
  });

  for (const [name, breakIt] of Object.entries(PROBES)) {
    it(`${name} fires on a state crafted to trip it`, () => {
      const state = createInitialState(1);
      breakIt(state);
      const reasons = harmIn(state);
      expect(reasons.some((r) => r.startsWith(`${name}:`)), `harmIn(state) = ${JSON.stringify(reasons)}`).toBe(true);
    });
  }
});

describe('this file is the DL invariant: it exists and is never skipped or narrowed', () => {
  const self = fileURLToPath(import.meta.url);
  const harmFile = fileURLToPath(new URL('./dl-harm.ts', import.meta.url));
  const noSkipsFile = fileURLToPath(new URL('../no-skips.test.ts', import.meta.url));

  it('the invariant test file and its harm definition exist on disk', () => {
    expect(existsSync(self)).toBe(true);
    expect(existsSync(harmFile)).toBe(true);
  });

  it('carries no skip or only modifier', () => {
    // The two patterns are built from parts so this assertion, and this comment, do not themselves
    // contain the literal text they are checking for — the same trick no-random.test.ts uses so the
    // guard cannot trip over its own source. This is also checked, on this file by name, from
    // outside this file: no-skips.test.ts (Round 2, review finding 3) — a self-check inside the
    // file it guards can only run if the file already ran, so it cannot catch every describe above
    // being skipped at once. Kept here too as a fast, specific first check.
    const skip = new RegExp('\\.' + 'skip' + '\\b');
    const only = new RegExp('\\.' + 'only' + '\\b');
    const text = readFileSync(self, 'utf8');
    expect(skip.test(text)).toBe(false);
    expect(only.test(text)).toBe(false);
  });

  it('no-skips.test.ts exists, applies no skip/only/todo modifier, and still contains its scan (Round 3, review finding R2-3)', () => {
    // Round 2 made no-skips.test.ts the guard that catches every describe in *this* file being
    // skipped at once — a self-check inside the thing it guards cannot do that, only a second file
    // can. But the same gap sits one level out: skip no-skips.test.ts's own describe too (or delete
    // it), and nothing outside it said so. Reproduced, Round 3: applying the modifier neither this
    // comment nor the pattern below can spell out (word-boundary reasons, same as above) to both
    // files' top-level describes gave `npx vitest run` in packages/sim a clean `25 passed | 2
    // skipped (27)`, exit 0 — the whole DL invariant gone, silently; deleting both files outright
    // gave an equally clean `25 passed (25)`. This check and no-skips.test.ts's matching check on
    // *this* file (its "still carries its five describes" test) close the loop.
    //
    // The check below has to be more than a substring search: no-skips.test.ts's own source
    // legitimately spells the word it hunts for — in its header comment, and in its own pattern
    // table (a real regex literal, allowed there because that file exempts its own source from its
    // own scan) — so a naive substring search would fail on every clean run of this test. What
    // actually distinguishes a modifier *applied* from the word merely *mentioned* is shape:
    // `describe`/`it`/`test` immediately followed by the dot, the word, and an opening paren, the
    // way a real call reads — a bare mention in prose or inside another regex's own source does not
    // look like that. Built from parts, as the self-check above builds its own patterns, so this
    // file's own source — itself scanned by no-skips.test.ts — never contains the literal pattern.
    expect(existsSync(noSkipsFile)).toBe(true);
    const text = readFileSync(noSkipsFile, 'utf8');
    const dot = '\\' + '.';
    for (const word of ['skip', 'only', 'todo']) {
      const appliedModifier = new RegExp('\\b(describe|it|test)\\s*' + dot + '\\s*' + word + '\\s*\\(');
      expect(appliedModifier.test(text), `no-skips.test.ts applies a ${word} modifier`).toBe(false);
    }
    expect(text, 'no-skips.test.ts no longer builds its skip/only/todo pattern table').toContain('MODIFIERS');
    expect(text, 'no-skips.test.ts no longer walks the package test files').toContain('function walk');
    expect(text, 'no-skips.test.ts is missing its scan describe').toContain('no test file in this package skips, narrows to');
  });
});

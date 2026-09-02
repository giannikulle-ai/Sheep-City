// Save and load. `toSave` turns a state into a plain JSON document; `fromSave` turns any known
// version of that document back into a state, migrating first. Both copy: the state a host holds
// and the document it stores never share objects.
//
// The RNG state (`world.rng.s`) is part of the document, so a loaded world draws the same numbers
// the saved one would have. The fixed-step accumulator and queued intents ride along too, so a
// save taken mid-frame resumes exactly where it stopped.

import { SEASONS } from '../clock';
import { INTENT_TYPES } from '../intents';
import { cloneState, SAVE_VERSION, type SimState } from '../state';
import { isPlainObject, SAVE_FORMAT, SaveError, type SaveDoc, type SaveWorld } from './doc';
import { migrateSave } from './migrations/index';

/** A current-version document for `state`. Throws if the state holds something JSON cannot carry. */
export function toSave(state: SimState): SaveDoc {
  const { version: _version, ...world } = cloneState(state);
  const problem = findUnserializable(world, 'world');
  if (problem) throw new SaveError('not-serializable', problem);
  return { format: SAVE_FORMAT, version: SAVE_VERSION, world };
}

/**
 * The state a document describes. Accepts any version this build knows and migrates it up. Throws
 * a `SaveError` for anything else: foreign JSON, a newer version, a world that fails validation.
 */
export function fromSave(doc: unknown): SimState {
  const current = migrateSave(doc);
  if (current['format'] !== SAVE_FORMAT) {
    throw new SaveError('bad-format', `expected format "${SAVE_FORMAT}", got ${JSON.stringify(current['format'])}`);
  }
  const world = current['world'];
  validateWorld(world);
  return cloneState({ ...world, version: SAVE_VERSION });
}

/** `toSave` as text, for localStorage and the export-as-text fallback. Two-space indent, trailing newline. */
export function toSaveText(state: SimState): string {
  return JSON.stringify(toSave(state), null, 2) + '\n';
}

/** `fromSave` from text. Malformed JSON is a `SaveError('not-a-save')`, not a bare SyntaxError. */
export function fromSaveText(text: string): SimState {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (error) {
    throw new SaveError('not-a-save', `save text is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return fromSave(doc);
}

/**
 * The first value under `value` that JSON would not carry back unchanged (NaN, Infinity, an
 * undefined array slot, a function), as a path string, or null when everything is plain data.
 * Undefined object properties are allowed: JSON drops them, and the sim never reads them.
 */
export function findUnserializable(value: unknown, path: string): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : `${path} is ${value}`;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item: unknown = value[i];
      if (item === undefined) return `${path}[${i}] is undefined`;
      const problem = findUnserializable(item, `${path}[${i}]`);
      if (problem) return problem;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      const problem = findUnserializable(item, `${path}.${key}`);
      if (problem) return problem;
    }
    return null;
  }
  return `${path} is a ${typeof value}`;
}

// ---- validation ----------------------------------------------------------------------------
// Shape checks on the world before it becomes a state. Top-level structure and the few numbers
// the loop itself depends on are checked exactly; per-actor fields are checked by presence and
// type where a wrong type would derail a tick. Anything the checks miss fails loudly in `tick`.

const WEATHER_KINDS = ['sun', 'rain', 'snow'] as const;
const WEATHER_MODES = ['season', 'manual'] as const;

function fail(path: string, expected: string, got: unknown): never {
  throw new SaveError('invalid-world', `${path}: expected ${expected}, got ${describe(got)}`);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'object') return 'an object';
  return JSON.stringify(value) ?? typeof value;
}

function obj(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'an object', value);
  return value;
}

function arr(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array', value);
  return value;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a finite number', value);
  return value;
}

function nonNegative(value: unknown, path: string): number {
  const n = num(value, path);
  if (n < 0) fail(path, 'a number >= 0', value);
  return n;
}

function uint32(value: unknown, path: string): number {
  const n = num(value, path);
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) fail(path, 'an unsigned 32-bit integer', value);
  return n;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'a boolean', value);
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'a string', value);
  return value;
}

function nullOr<T>(value: unknown, path: string, check: (v: unknown, p: string) => T): T | null {
  return value === null ? null : check(value, path);
}

function oneOf<T extends string>(value: unknown, path: string, options: readonly T[]): T {
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) fail(path, `one of ${options.join(', ')}`, value);
  return value as T;
}

function point(value: unknown, path: string): Record<string, unknown> {
  const p = obj(value, path);
  num(p['x'], `${path}.x`);
  num(p['y'], `${path}.y`);
  return p;
}

function dir(value: unknown, path: string): void {
  if (value !== 1 && value !== -1) fail(path, '1 or -1', value);
}

function npc(value: unknown, path: string): void {
  const n = point(value, path);
  oneOf(n['kind'], `${path}.kind`, ['farmer', 'merchant']);
  dir(n['dir'], `${path}.dir`);
  str(n['anim'], `${path}.anim`);
  num(n['t0Ms'], `${path}.t0Ms`);
  arr(n['plan'], `${path}.plan`).forEach((job, i) => str(obj(job, `${path}.plan[${i}]`)['job'], `${path}.plan[${i}].job`));
  num(n['jobUntilMs'], `${path}.jobUntilMs`);
  num(n['sold'], `${path}.sold`);
}

/** Throw `SaveError('invalid-world')` unless `world` has the shape of a `SaveWorld`. */
export function validateWorld(world: unknown): asserts world is SaveWorld {
  const w = obj(world, 'world');
  const problem = findUnserializable(w, 'world');
  if (problem) throw new SaveError('invalid-world', problem);

  uint32(w['seed'], 'world.seed');
  uint32(obj(w['rng'], 'world.rng')['s'], 'world.rng.s');

  const clock = obj(w['clock'], 'world.clock');
  const t = num(clock['t'], 'world.clock.t');
  if (t < 0 || t >= 1) fail('world.clock.t', 'a number in [0, 1)', t);
  if (!(num(clock['periodSec'], 'world.clock.periodSec') > 0)) fail('world.clock.periodSec', 'a positive number', clock['periodSec']);
  bool(clock['paused'], 'world.clock.paused');
  const tick = nonNegative(clock['tick'], 'world.clock.tick');
  if (!Number.isInteger(tick)) fail('world.clock.tick', 'an integer', tick);
  nonNegative(clock['nowMs'], 'world.clock.nowMs');
  nonNegative(clock['dayCount'], 'world.clock.dayCount');

  const season = obj(w['season'], 'world.season');
  nonNegative(season['elapsedMs'], 'world.season.elapsedMs');
  nullOr(season['override'], 'world.season.override', (v, p) => oneOf(v, p, SEASONS));

  const weather = obj(w['weather'], 'world.weather');
  const kind = oneOf(weather['kind'], 'world.weather.kind', WEATHER_KINDS);
  if (bool(weather['rain'], 'world.weather.rain') !== (kind === 'rain')) fail('world.weather.rain', `${kind === 'rain'} to mirror kind "${kind}"`, weather['rain']);
  num(weather['temp'], 'world.weather.temp');
  oneOf(weather['mode'], 'world.weather.mode', WEATHER_MODES);
  num(weather['rollAtMs'], 'world.weather.rollAtMs');
  num(weather['untilMs'], 'world.weather.untilMs');

  const tufts = arr(w['tufts'], 'world.tufts');
  tufts.forEach((tuft, i) => {
    const p = `world.tufts[${i}]`;
    const tf = point(tuft, p);
    const level = num(tf['level'], `${p}.level`);
    if (level < 0 || level > 1) fail(`${p}.level`, 'a number in [0, 1]', level);
    nullOr(tf['claimed'], `${p}.claimed`, str);
  });

  const ids = new Set<string>();
  arr(w['sheep'], 'world.sheep').forEach((sheep, i) => {
    const p = `world.sheep[${i}]`;
    const s = point(sheep, p);
    const id = str(s['id'], `${p}.id`);
    if (ids.has(id)) fail(`${p}.id`, 'a unique actor id', id);
    ids.add(id);
    str(s['name'], `${p}.name`);
    str(s['color'], `${p}.color`);
    dir(s['dir'], `${p}.dir`);
    num(s['t0Ms'], `${p}.t0Ms`);
    num(s['wool'], `${p}.wool`);
    arr(s['path'], `${p}.path`).forEach((pt, j) => point(pt, `${p}.path[${j}]`));
    arr(s['lambs'], `${p}.lambs`).forEach((lamb, j) => {
      const l = point(lamb, `${p}.lambs[${j}]`);
      dir(l['dir'], `${p}.lambs[${j}].dir`);
      num(l['bornMs'], `${p}.lambs[${j}].bornMs`);
      bool(l['grown'], `${p}.lambs[${j}].grown`);
    });
    const tuft = nullOr(s['tuft'], `${p}.tuft`, num);
    if (tuft !== null && (!Number.isInteger(tuft) || tuft < 0 || tuft >= tufts.length)) fail(`${p}.tuft`, `a tuft index below ${tufts.length}`, tuft);
    nullOr(s['shearAtMs'], `${p}.shearAtMs`, num);
    for (const flag of ['outside', 'entering', 'resting', 'eating', 'hayTrip', 'drinkTrip', 'shelter', 'inBarn', 'toBarn', 'ridden']) {
      bool(s[flag], `${p}.${flag}`);
    }
  });

  const luna = point(w['luna'], 'world.luna');
  dir(luna['dir'], 'world.luna.dir');
  str(luna['anim'], 'world.luna.anim');
  num(luna['t0Ms'], 'world.luna.t0Ms');
  nullOr(luna['target'], 'world.luna.target', point);
  nullOr(luna['riding'], 'world.luna.riding', str);
  nullOr(luna['mounting'], 'world.luna.mounting', str);
  bool(luna['inBarn'], 'world.luna.inBarn');
  bool(luna['chasing'], 'world.luna.chasing');
  nullOr(luna['stick'], 'world.luna.stick', (v, p) => {
    const st = point(v, p);
    num(st['fromX'], `${p}.fromX`);
    num(st['fromY'], `${p}.fromY`);
    oneOf(st['phase'], `${p}.phase`, ['out', 'back']);
  });
  nullOr(luna['circleUntilMs'], 'world.luna.circleUntilMs', num);
  num(luna['dirAtMs'], 'world.luna.dirAtMs');
  num(luna['tagUntilMs'], 'world.luna.tagUntilMs');
  num(luna['forceBoundUntilMs'], 'world.luna.forceBoundUntilMs');

  const npcs = obj(w['npcs'], 'world.npcs');
  nullOr(npcs['farmer'], 'world.npcs.farmer', npc);
  nullOr(npcs['merchant'], 'world.npcs.merchant', npc);
  num(npcs['merchantAtMs'], 'world.npcs.merchantAtMs');
  num(npcs['lastVisitKey'], 'world.npcs.lastVisitKey');

  const banks = obj(w['banks'], 'world.banks');
  nonNegative(banks['wool'], 'world.banks.wool');
  nonNegative(banks['coins'], 'world.banks.coins');
  arr(banks['owned'], 'world.banks.owned').forEach((item, i) => str(item, `world.banks.owned[${i}]`));

  const life = obj(w['life'], 'world.life');
  nullOr(life['rabbit'], 'world.life.rabbit', point);
  nullOr(life['bird'], 'world.life.bird', (v, p) => oneOf(point(v, p)['state'], `${p}.state`, ['in', 'sit', 'out']));
  arr(life['bflies'], 'world.life.bflies').forEach((b, i) => point(b, `world.life.bflies[${i}]`));
  arr(life['flies'], 'world.life.flies').forEach((f, i) => point(f, `world.life.flies[${i}]`));

  nonNegative(w['accumulatorMs'], 'world.accumulatorMs');

  arr(w['pendingIntents'], 'world.pendingIntents').forEach((intent, i) => {
    const p = `world.pendingIntents[${i}]`;
    const it = obj(intent, p);
    oneOf(it['type'], `${p}.type`, INTENT_TYPES);
    if (it['at'] !== undefined) {
      const at = nonNegative(it['at'], `${p}.at`);
      if (!Number.isInteger(at)) fail(`${p}.at`, 'a tick number', at);
    }
  });
}

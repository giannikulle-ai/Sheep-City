// Parity of every tunable with prototype/luna-farm/src/sim_template.html.
//
// The prototype's `RULES` literal is read out of the source and evaluated, then every leaf is
// asserted against the sim's `RULES` (which comes from packages/content/balance/farm.json) one
// test per number. The numbers the prototype keeps as literals inside its code (the sheep needs
// weights, the NPC walk speed, ...) are asserted by looking for the exact expression in the
// source with the sim's number spliced in, so a change on either side fails here.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SEASONS, SEASON_ODDS, SEASON_TEMP, phaseOf } from '../src/clock';
import { NAMES, COLORS, createInitialState } from '../src/state';
import { RULES } from '../src/rules';

const repo = fileURLToPath(new URL('../../..', import.meta.url));
const src = readFileSync(`${repo}/prototype/luna-farm/src/sim_template.html`, 'utf8');
const farmJson = JSON.parse(readFileSync(`${repo}/packages/content/balance/farm.json`, 'utf8'));

/** `const NAME = <literal>;` from the source, evaluated. */
function literal(name: string, multiline = false): unknown {
  const re = multiline ? new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`) : new RegExp(`const ${name} = (.*?);\\s*(?://.*)?$`, 'm');
  const m = re.exec(src);
  if (!m) throw new Error(`could not find const ${name} in sim_template.html`);
  return new Function(`return (${m[1]});`)();
}

/** A number the way the prototype writes it: `.14`, not `0.14`. Sums are rounded to two places first. */
function lit(n: number): string {
  return String(Math.round(n * 1e6) / 1e6).replace(/^0\./, '.');
}

/** Spelled in two halves so the no-random guard does not trip on this file. */
const RANDOM = 'Math.' + 'random()';
const PERF_NOW = 'performance.' + 'now()';

function expectInSource(text: string): void {
  expect(src.includes(text), `prototype source should contain: ${text}`).toBe(true);
}

/** Flatten `{ a: { b: 1 } }` into `[['a.b', 1]]`; arrays are leaves. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  }
  return [[path, value]];
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
}

const PROTO_RULES = literal('RULES', true) as Record<string, unknown>;

describe('RULES: every number in the prototype literal, one test each', () => {
  const all = leaves(PROTO_RULES);
  it('the prototype literal has the expected shape', () => {
    expect(all.length).toBe(25);
  });
  for (const [path, value] of all) {
    it(`RULES.${path} = ${JSON.stringify(value)}`, () => {
      expect(get(RULES, path)).toEqual(value);
    });
  }
  it('balance/farm.json is where the sim reads them from, and it says the same', () => {
    const plain = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(plain);
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if ('value' in o && 'comment' in o) return o.value;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) if (k !== 'comment') out[k] = plain(v);
        return out;
      }
      return node;
    };
    const rules = plain(farmJson.rules) as Record<string, unknown>;
    delete rules.upgrades; // lives in farm/upgrades.json, pointed at from farm.json
    const proto = { ...PROTO_RULES };
    delete proto.upgrades;
    expect(rules).toEqual(proto);
  });
});

describe('constants the prototype keeps outside RULES', () => {
  it('clock: t .18, period 180, and the phaseOf boundaries', () => {
    const clock = literal('clock') as { t: number; period: number };
    expect(RULES.clock.startT).toBe(clock.t);
    expect(RULES.clock.periodSec).toBe(clock.period);
    const m = /function phaseOf\(t\) \{ return t < ([.\d]+) \? "day" : t < ([.\d]+) \? "dusk" : t < ([.\d]+) \? "night" : "dawn"; \}/.exec(src);
    expect(m).not.toBeNull();
    expect([RULES.clock.phases.dusk, RULES.clock.phases.night, RULES.clock.phases.dawn]).toEqual([Number(m![1]), Number(m![2]), Number(m![3])]);
    expect(RULES.clock.phases.day).toBe(0);
    expect(phaseOf(RULES.clock.phases.dusk - 1e-9)).toBe('day');
    expect(phaseOf(RULES.clock.phases.dusk)).toBe('dusk');
    expect(phaseOf(RULES.clock.phases.night)).toBe('night');
    expect(phaseOf(RULES.clock.phases.dawn)).toBe('dawn');
  });

  it('seasons: order, temperature, and weather odds', () => {
    expect([...SEASONS]).toEqual(literal('SEASONS'));
    expect(SEASON_TEMP).toEqual(literal('SEASON_TEMP'));
    expect(SEASON_ODDS).toEqual(literal('SEASON_ODDS'));
  });

  it('the first merchant visit, the starting flock, and the name and colour lists', () => {
    expectInSource(`merchantAt = ${PERF_NOW} + ${RULES.merchantFirstAtMs}`);
    expect(createInitialState(1).npcs.merchantAtMs).toBe(RULES.merchantFirstAtMs);
    expectInSource(`sheep = [${Array.from({ length: RULES.flock.initial }, (_, i) => i).join(', ')}].map(i => makeSheep(i, randomFoot()))`);
    expectInSource(`nameIdx = ${RULES.flock.initial};`);
    expect([...NAMES]).toEqual(literal('NAMES'));
    expect([...COLORS]).toEqual(literal('COLORS'));
  });
});

describe('sheep literals inside the prototype code (not in farm.json)', () => {
  const S = RULES.sheep;
  it(`the needs gate rolls dt * ${lit(S.needRollPerSec)}`, () => {
    expectInSource(`!s.ridden && ${RANDOM} < dt * ${lit(S.needRollPerSec)}`);
  });
  it(`a tall tuft is level >= ${lit(S.tuftMinLevel)}`, () => {
    expectInSource(`nearestTuft(fx, fy, ${lit(S.tuftMinLevel)})`);
  });
  it('the pick ladder: graze .5, hay .62, drink .72, rest .8, else wander', () => {
    const { graze, hay, drink, rest, wander } = S.pick;
    expectInSource(`if (t && r < ${lit(graze)})`);
    expectInSource(`else if (r < ${lit(graze + hay)})`);
    expectInSource(`else if (r < ${lit(graze + hay + drink)})`);
    expectInSource(`else if (r < ${lit(graze + hay + drink + rest)} && ${RANDOM} < dt * ${lit(S.restRollPerSec)})`);
    expect(graze + hay + drink + rest + wander).toBeCloseTo(1, 12);
  });
  it(`a resting sheep wakes at dt * ${lit(S.wakePerSec)}`, () => {
    expectInSource(`else if (s.resting && ${RANDOM} < dt * ${lit(S.wakePerSec)})`);
  });
  it(`eating stops at dt * ${lit(S.stopEatingPerSec)} or below tuft level ${lit(S.tuftEmptyAt)}`, () => {
    expectInSource(`if ((s.tuft && s.tuft.level < ${lit(S.tuftEmptyAt)}) || ${RANDOM} < dt * ${lit(S.stopEatingPerSec)})`);
  });
  it(`shorn and newborn wool is ${lit(S.shornWool)}`, () => {
    expectInSource(`s.wool = ${lit(S.shornWool)}; woolBank++;`);
    expectInSource(`ns.wool = ${lit(S.shornWool)}; sheep.push(ns);`);
  });
  it(`lambs follow at rate ${S.lambFollowRate}`, () => {
    expectInSource(`l.x += (px - l.x) * ${S.lambFollowRate} * dt; l.y += (py - l.y) * ${S.lambFollowRate} * dt;`);
  });
  it('night forces rest; rain sends every sheep to the door', () => {
    expectInSource('if (night) { if (s.tx === null && !s.eating) s.resting = true; }');
    expectInSource(`if (s.tx === null && !s.shelter && !s.inBarn) { s.shelter = true; s.resting = false; setPath(s, [{ x: SPOT.barnDoor.x + (${RANDOM} * 10 - 5), y: SPOT.barnDoor.y }]); s.toBarn = true; }`);
  });
});

describe('NPC literals inside the prototype code (not in farm.json; farm/npcs.json carries a copy)', () => {
  const N = RULES.npc;
  it(`NPCs walk at ${N.walkSpeed} px/s and a job takes ${N.jobMs} ms`, () => {
    expectInSource(`stepToward(n, [NPC_W / 2, NPC_H - 1], ${N.walkSpeed}, dt)`);
    expectInSource(`n.jobUntil = now + ${N.jobMs}; n.anim = "work"; }`);
    expectInSource(`if (!n.jobUntil) n.jobUntil = now + ${N.jobMs};`);
  });
  it(`inside below x ${N.insideBelowX}, outside above x ${N.outsideAboveX}`, () => {
    expectInSource(`if (n.job === "enter" && n.x + 8 < ${N.insideBelowX}) n.outside = false;`);
    expectInSource(`if (n.job === "leave" && n.x + 8 > ${N.outsideAboveX}) n.outside = true;`);
  });
  it('the farmer: shear delay and tag, trough heart, pat heart', () => {
    expectInSource(`t.shear = now + ${N.shearDelayMs}; bubble(t, "shears", ${N.shearDelayMs}); t.tagUntil = now + ${N.shearTagMs};`);
    expectInSource(`bubble(farmer, "heart", ${N.troughHeartMs})`);
    expectInSource(`bubble(luna, "heart", ${N.patHeartMs}); luna.anim = "pant";`);
  });
  it('the merchant: coin bubble, and the sale is woolBank * woolPrice', () => {
    expectInSource(`bubble(merchant, "coin", ${N.coinBubbleMs})`);
    expectInSource('const earned = woolBank * RULES.merchant.woolPrice; coins += earned; woolBank = 0;');
  });
  it('farm/npcs.json agrees with these', () => {
    const npcs = JSON.parse(readFileSync(`${repo}/packages/content/farm/npcs.json`, 'utf8'));
    expect(npcs.walkSpeed.value).toBe(N.walkSpeed);
    expect(npcs.jobDurationMs.value).toBe(N.jobMs);
    expect(npcs.boundary.insideBelowX).toBe(N.insideBelowX);
    expect(npcs.boundary.outsideAboveX).toBe(N.outsideAboveX);
    expect(npcs.npcs.farmer.jobs.shear.shearDelayMs).toBe(N.shearDelayMs);
    expect(npcs.npcs.farmer.jobs.shear.tagMs).toBe(N.shearTagMs);
    expect(npcs.npcs.farmer.jobs.trough.heartMs).toBe(N.troughHeartMs);
    expect(npcs.npcs.farmer.jobs.pat.heartMs).toBe(N.patHeartMs);
    expect(npcs.npcs.merchant.jobs.trade.coinMs).toBe(N.coinBubbleMs);
  });
});

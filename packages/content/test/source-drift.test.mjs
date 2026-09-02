// Guards against drift between the content JSON and the prototype it was copied
// from. Reads prototype/luna-farm/src/sim_template.html, evaluates the data
// literals it finds there, and compares them with the JSON files.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../..");
const src = readFileSync(resolve(repo, "prototype/luna-farm/src/sim_template.html"), "utf8");
const json = (rel) => JSON.parse(readFileSync(resolve(here, "..", rel), "utf8"));

// Pull `const NAME = <literal>;` out of the source and evaluate the literal.
function literal(name, { multiline = false, scope = {} } = {}) {
  const re = multiline
    ? new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`)
    : new RegExp(`const ${name} = (.*?);\\s*(?://.*)?$`, "m");
  const m = src.match(re);
  assert.ok(m, `could not find const ${name} in sim_template.html`);
  return evalIn(m[1], scope);
}
function evalIn(expr, scope) {
  const keys = Object.keys(scope);
  return new Function(...keys, `return (${expr});`)(...keys.map((k) => scope[k]));
}
// Strip {value, comment} leaves back to plain values.
function plain(node) {
  if (Array.isArray(node)) return node.map(plain);
  if (node && typeof node === "object") {
    if ("value" in node && "comment" in node) return node.value;
    const out = {};
    for (const [k, v] of Object.entries(node)) if (k !== "comment") out[k] = plain(v);
    return out;
  }
  return node;
}

const RULES = literal("RULES", { multiline: true });
const SPOT = literal("SPOT", { multiline: true });

test("balance/farm.json rules mirror RULES exactly, key for key", () => {
  const balance = json("balance/farm.json");
  const upgrades = json("farm/upgrades.json");
  const rebuilt = plain(balance.rules);
  rebuilt.upgrades = upgrades.upgrades.map((u) => [u.id, u.cost]);
  assert.deepEqual(rebuilt, RULES);
  assert.deepEqual(Object.keys(rebuilt), Object.keys(RULES), "key order should match RULES for easy diffing");
});

test("balance/farm.json outsideRules match the clock and season constants", () => {
  const o = plain(json("balance/farm.json").outsideRules);
  assert.deepEqual(o.seasons.order, literal("SEASONS"));
  assert.deepEqual(o.seasons.temp, literal("SEASON_TEMP"));
  assert.deepEqual(o.seasons.odds, literal("SEASON_ODDS"));
  const clock = literal("clock");
  assert.equal(o.clock.startT, clock.t);
  assert.equal(o.clock.periodSec, clock.period);
  const phase = src.match(/function phaseOf\(t\) \{ return t < ([.\d]+) \? "day" : t < ([.\d]+) \? "dusk" : t < ([.\d]+) \? "night" : "dawn"; \}/);
  assert.ok(phase, "phaseOf not found");
  assert.deepEqual(o.clock.phases, { day: 0, dusk: +phase[1], night: +phase[2], dawn: +phase[3] });
  assert.match(src, new RegExp(`merchantAt = performance\\.now\\(\\) \\+ ${o.merchant.firstVisitMs};`));
  const flock = src.match(/sheep = \[([\d, ]+)\]\.map\(i => makeSheep/);
  assert.equal(o.flock.initial, flock[1].split(",").length);
});

test("farm/upgrades.json is RULES.upgrades in order", () => {
  const u = json("farm/upgrades.json");
  assert.deepEqual(u.upgrades.map((x) => [x.id, x.cost]), RULES.upgrades);
  assert.equal(u.autoBuyInOrder, true);
});

test("farm/spots.json copies SPOT, TOOLS, POSTS, FLOWERS and the geometry", () => {
  const s = json("farm/spots.json");
  const spots = Object.fromEntries(Object.entries(s.spots).map(([k, v]) => [k, { x: v.x, y: v.y }]));
  assert.deepEqual(spots, SPOT);
  assert.deepEqual(Object.keys(spots), Object.keys(SPOT));
  const TOOLS = literal("TOOLS", { scope: { SPOT } });
  const { comment, ...aliases } = s.aliases;
  assert.deepEqual(Object.fromEntries(Object.entries(aliases).map(([k, v]) => [k, SPOT[v]])), TOOLS);
  assert.deepEqual(s.posts.points, literal("POSTS"));
  assert.deepEqual(s.flowers.points, literal("FLOWERS"));
  const [W, H] = src.match(/const W = (\d+), H = (\d+);/).slice(1, 3).map(Number);
  assert.deepEqual(s.world, { w: W, h: H });
  const g = src.match(/const C = \[(\d+), (\d+)\], RX = (\d+), RY = (\d+);/).slice(1, 5).map(Number);
  assert.deepEqual([s.field.center.x, s.field.center.y, s.field.rx, s.field.ry], g);
  assert.deepEqual({ x0: s.barn.x0, x1: s.barn.x1, y0: s.barn.y0, y1: s.barn.y1 }, literal("BARN"));
});

test("farm/names.json copies NAMES and COLORS", () => {
  const n = json("farm/names.json");
  assert.deepEqual(n.sheep, literal("NAMES"));
  assert.deepEqual(n.tagColours.hex, literal("COLORS"));
  assert.match(src, new RegExp(`nameIdx = ${n.lambNamesStartAt};`));
});

test("farm/npcs.json plans resolve to the same coordinates as the source plans", () => {
  const n = json("farm/npcs.json");
  const resolveStep = (st) => st.at ? { job: st.job, at: { x: SPOT[st.at.spot].x + (st.at.dx ?? 0), y: SPOT[st.at.spot].y + (st.at.dy ?? 0) } } : { job: st.job };

  const todo = literal("todo", { scope: { SPOT } });
  const planSrc = src.match(/farmer\.plan = (\[.*\]);/)[1];
  const farmerPlan = evalIn(planSrc, { SPOT, todo });
  assert.deepEqual(n.npcs.farmer.plan.map(resolveStep), farmerPlan);

  const merchantSrc = src.match(/merchant = \{.*plan: (\[.*?\]), job: null/)[1];
  assert.deepEqual(n.npcs.merchant.plan.map(resolveStep), evalIn(merchantSrc, { SPOT }));
  assert.match(src, /cart: true \};/);
  assert.equal(n.npcs.merchant.cart, true);

  const [NPC_W, NPC_H] = src.match(/const NPC_W = (\d+), NPC_H = (\d+);/).slice(1, 3).map(Number);
  assert.deepEqual({ w: n.sprite.w, h: n.sprite.h }, { w: NPC_W, h: NPC_H });
  assert.match(src, /x: SPOT\.offstage\.x - 8, y: SPOT\.offstage\.y - NPC_H \+ 2, dir: -1/);
  assert.deepEqual([n.spawn.dx, n.spawn.dy, n.spawn.dir], [-8, -NPC_H + 2, -1]);
  assert.match(src, new RegExp(`stepToward\\(n, \\[NPC_W / 2, NPC_H - 1\\], ${n.walkSpeed.value}, dt\\)`));
  assert.match(src, new RegExp(`n\\.jobUntil = now \\+ ${n.jobDurationMs.value}; n\\.anim = "work"`));
  assert.match(src, new RegExp(`n\\.job === "enter" && n\\.x \\+ ${n.boundary.measureDx} < ${n.boundary.insideBelowX}`));
  assert.match(src, new RegExp(`n\\.job === "leave" && n\\.x \\+ ${n.boundary.measureDx} > ${n.boundary.outsideAboveX}`));
  assert.equal(RULES.farmer.visitsAt !== undefined && n.npcs.farmer.schedule.balanceKey, "farmer.visitsAt");
  assert.equal(RULES.merchant.everyMs !== undefined && n.npcs.merchant.schedule.balanceKey, "merchant.everyMs");
});

test("farm/tufts.json generator numbers match makeTufts and randomFoot", () => {
  const t = json("farm/tufts.json");
  const fn = src.match(/function makeTufts\(\) \{[\s\S]*?\n\}/)[0];
  const head = fn.match(/inset = ([.\d]+), corners = (\[\[.*?\]\])\.map\(\(\[x, y\]\) => \[(\d+) \+ \(x - \3\) \* inset, (\d+) \+ \(y - \4\) \* inset\]\)/);
  assert.ok(head, "makeTufts corners not found");
  assert.equal(t.ring.inset, +head[1]);
  assert.deepEqual(t.ring.corners, evalIn(head[2], {}));
  assert.deepEqual(t.ring.center, { x: +head[3], y: +head[4] });
  const loop = fn.match(/for \(let i = 1; i < (\d+); i\+\+\) \{ const t = i \/ \1, x = ax \+ \(bx - ax\) \* t \+ \(Math\.random\(\) - \.5\) \* (\d+), y = ay \+ \(by - ay\) \* t \+ \(Math\.random\(\) - \.5\) \* (\d+);/);
  assert.ok(loop, "makeTufts loop not found");
  assert.equal(t.ring.subdivisions, +loop[1]);
  assert.deepEqual(t.ring.jitter, { ...t.ring.jitter, x: +loop[2], y: +loop[3] });
  const skip = fn.match(/if \(inBarn\(x, y\) \|\| inBarn\(x, y - (\d+)\) \|\| \(e === (\d) && t > ([.\d]+) && t < ([.\d]+)\)\) continue; out\.push\(\{ x, y, level: ([.\d]+) \+ Math\.random\(\) \* ([.\d]+)/);
  assert.ok(skip, "makeTufts skip rule not found");
  assert.deepEqual(t.ring.skip.barnCheckYOffsets, [0, -skip[1]]);
  assert.deepEqual([t.ring.skip.edge, t.ring.skip.tFrom, t.ring.skip.tTo], [+skip[2], +skip[3], +skip[4]]);
  assert.deepEqual([t.ring.initialLevel.min, t.ring.initialLevel.spread], [+skip[5], +skip[6]]);
  const scatter = fn.match(/for \(let i = 0; i < (\d+); i\+\+\) \{ const f = randomFoot\(\);/);
  assert.equal(t.scatter.count, +scatter[1]);
  const rf = src.match(/function randomFoot\(\) \{ for \(let i = 0; i < (\d+); i\+\+\) \{ const x = (\d+) \+ Math\.random\(\) \* (\d+), y = (\d+) \+ Math\.random\(\) \* (\d+); if \(Math\.abs\(x - 320\) \/ RX \+ Math\.abs\(y - 208\) \/ RY < ([.\d]+) && !inBarn\(x, y\) && !inBarn\(x, y - (\d+)\)\) return \{ x, y \}; \} return \{ x: (\d+), y: (\d+) \}; \}/);
  assert.ok(rf, "randomFoot not found");
  const r = t.scatter.randomFoot;
  assert.deepEqual([r.tries, r.xMin, r.xRange, r.yMin, r.yRange, r.fieldMetric, r.barnCheckYOffsets, r.fallback],
    [+rf[1], +rf[2], +rf[3], +rf[4], +rf[5], +rf[6], [0, -rf[7]], { x: +rf[8], y: +rf[9] }]);

  // The derived anchors must be what the ring numbers produce (to 2 dp).
  const c = t.ring.corners.map(([x, y]) => [t.ring.center.x + (x - t.ring.center.x) * t.ring.inset, t.ring.center.y + (y - t.ring.center.y) * t.ring.inset]);
  const BARN = literal("BARN");
  const inBarn = (x, y) => x > BARN.x0 && x < BARN.x1 && y > BARN.y0 && y < BARN.y1;
  const expect = [];
  for (let e = 0; e < c.length; e++) {
    const [ax, ay] = c[e], [bx, by] = c[(e + 1) % c.length];
    for (let i = 1; i < t.ring.subdivisions; i++) {
      const tt = i / t.ring.subdivisions, x = ax + (bx - ax) * tt, y = ay + (by - ay) * tt;
      const skipped = t.ring.skip.barnCheckYOffsets.some((dy) => inBarn(x, y + dy)) || (e === t.ring.skip.edge && tt > t.ring.skip.tFrom && tt < t.ring.skip.tTo);
      expect.push({ edge: e, i, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, skipped });
    }
  }
  assert.deepEqual(t.anchors.points, expect);
  assert.equal(expect.filter((a) => !a.skipped).length, 29);
});

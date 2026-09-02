// The farm event deck (#41): the checks the issue asks for, plus the cross-file ones a schema
// cannot express (spawn landmarks exist, flags set at start are cleared at end, placeholders
// match preconditions). The schema itself runs in scripts/validate.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../scripts/lib/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const json = (rel) => JSON.parse(readFileSync(resolve(here, "..", rel), "utf8"));
const deck = json("events/farm.json");
const spots = json("farm/spots.json");
const balance = json("balance/farm.json");
const cards = deck.events;

// The vocabulary the sim's Director implements first (#40). Add here and in the schema together.
export const ALLOWED_HOOKS = ["setVisibility", "spawn", "mood", "coins", "flag"];
export const REQUIRED_IDS = [
  "fogMorning", "crowsOnTheField", "lostLamb", "merchantCaravan", "shearingDay", "dlBirthday",
  "firstSnow", "rainbowAfterRain", "strayCatVisits", "farmersDayOff", "nightOfTheFireflies",
  "lambZoomiesHour", "wellRunsLow", "windfall", "stargazingNight",
];
const PLACEHOLDERS = ["dl", "lamb", "sheep", "farmer", "merchant", "coins", "flock"];
const WATCH_KINDS = ["bubble", "npc-arrival", "weather", "dl-trick", "lamb", "phase", "bird", "rabbit"];
const COUNTED_KINDS = ["bubble", "npc-arrival", "weather", "dl-trick", "lamb"];

const allHooks = (c) => [...c.hooks.start, ...c.hooks.end];

test("the deck passes its schema", () => {
  assert.deepEqual(validate(resolve(here, "../schema/events.schema.json"), deck), []);
});

test("fifteen cards, ids unique, the required set present and nothing missing", () => {
  assert.equal(cards.length, 15);
  const ids = cards.map((c) => c.id);
  assert.equal(new Set(ids).size, 15, "ids must be unique");
  assert.deepEqual([...ids].sort(), [...REQUIRED_IDS].sort());
});

test("every hook is from the allowed list", () => {
  for (const c of cards) for (const h of allHooks(c)) assert.ok(ALLOWED_HOOKS.includes(h.op), `${c.id}: hook ${h.op}`);
  const used = new Set(cards.flatMap((c) => allHooks(c).map((h) => h.op)));
  assert.deepEqual([...used].sort(), [...ALLOWED_HOOKS].sort(), "every allowed hook is exercised by at least one card");
});

test("every storybook line is under 90 characters, past tense, and uses only known placeholders", () => {
  for (const c of cards) {
    const line = c.storybook.line;
    assert.ok(line.length < 90, `${c.id}: ${line.length} chars`);
    assert.ok(/[.!]$/.test(line), `${c.id}: ends with a full stop`);
    for (const m of line.matchAll(/\{([^}]*)\}/g)) assert.ok(PLACEHOLDERS.includes(m[1]), `${c.id}: placeholder {${m[1]}}`);
    assert.ok(!/\b(is|are|comes|come|goes|go)\b/.test(line), `${c.id}: present tense in "${line}"`);
  }
});

test("placeholders only appear where the world can fill them", () => {
  for (const c of cards) {
    const line = c.storybook.line;
    if (line.includes("{lamb}")) assert.equal(c.preconditions.lambPresent, true, `${c.id}: {lamb} needs lambPresent`);
    if (line.includes("{coins}")) {
      const pays = allHooks(c).some((h) => h.op === "coins" && h.delta > 0) || allHooks(c).some((h) => h.op === "spawn" && h.what === "merchant");
      assert.ok(pays, `${c.id}: {coins} needs a coins hook or the merchant`);
    }
    if (line.includes("{farmer}")) assert.ok(allHooks(c).some((h) => h.op === "spawn" && h.what === "farmer"), `${c.id}: {farmer} needs the farmer`);
  }
});

test("spawn hooks name landmarks from farm/spots.json", () => {
  for (const c of cards) for (const h of allHooks(c)) if (h.op === "spawn") assert.ok(h.at in spots.spots, `${c.id}: no spot "${h.at}"`);
});

test("a flag set at start is cleared at end, and nothing else touches flags", () => {
  for (const c of cards) {
    const setAt = (list) => list.filter((h) => h.op === "flag").map((h) => `${h.name}=${h.value}`);
    const started = setAt(c.hooks.start), ended = setAt(c.hooks.end);
    for (const s of started) {
      assert.ok(s.endsWith("=true"), `${c.id}: start hooks only set flags (${s})`);
      assert.ok(ended.includes(s.replace("=true", "=false")), `${c.id}: flag ${s} is never cleared`);
    }
    for (const e of ended) assert.ok(e.endsWith("=false"), `${c.id}: end hooks only clear flags (${e})`);
    assert.equal(started.length, ended.length, `${c.id}: end clears exactly the flags start set`);
  }
});

test("visibility set at start is restored at end", () => {
  for (const c of cards) {
    const vis = (list) => list.filter((h) => h.op === "setVisibility");
    if (vis(c.hooks.start).length) assert.deepEqual(vis(c.hooks.end).map((h) => h.value), [1], `${c.id}: visibility must return to 1`);
  }
});

test("moments are watch-test kinds, counted ones, and distinct from each other", () => {
  const keys = cards.map((c) => `${c.moment.kind}:${c.moment.detail}`);
  for (const c of cards) {
    assert.ok(WATCH_KINDS.includes(c.moment.kind), `${c.id}: kind ${c.moment.kind}`);
    assert.ok(COUNTED_KINDS.includes(c.moment.kind), `${c.id}: ${c.moment.kind} is logged but not counted by the watch test`);
  }
  assert.equal(new Set(keys).size, keys.length, "two cards must not share a moment key");
});

test("preconditions use the sim's vocabulary and are satisfiable", () => {
  const seasons = balance.outsideRules.seasons.order.value;
  const phases = Object.keys(balance.outsideRules.clock.phases.value);
  const cap = balance.rules.flockCap.value;
  for (const c of cards) {
    const p = c.preconditions;
    for (const s of p.season ?? []) assert.ok(seasons.includes(s), `${c.id}: season ${s}`);
    for (const t of p.timeOfDay ?? []) assert.ok(phases.includes(t), `${c.id}: phase ${t}`);
    if (p.flockSize) {
      const { min = 0, max = cap } = p.flockSize;
      assert.ok(min <= max && max <= cap, `${c.id}: flockSize ${min}..${max} within the cap ${cap}`);
    }
    if (p.weather?.includes("snow")) assert.ok(!p.season || p.season.some((s) => balance.outsideRules.seasons.odds.value[s].snow > 0), `${c.id}: snow never falls in ${p.season}`);
    if (p.recentWeather) assert.ok(!p.weather?.includes(p.recentWeather.kind), `${c.id}: recentWeather should name a weather that is over`);
  }
});

test("timings are in-world and sane for a three-minute day", () => {
  assert.equal(deck.timeScale.realSecondsPerSimDayWatching, balance.outsideRules.clock.periodSec.value);
  for (const c of cards) {
    const realSec = c.durationSimMinutes / deck.timeScale.simMinutesPerDay * deck.timeScale.realSecondsPerSimDayWatching;
    assert.ok(realSec >= 3 && realSec <= 90, `${c.id}: ${realSec}s real is outside 3..90 s`);
    assert.ok(c.cooldownSimHours * 60 >= c.durationSimMinutes, `${c.id}: cooldown shorter than the card itself`);
  }
  const merchant = cards.find((c) => c.id === "merchantCaravan");
  const everyHours = balance.rules.merchant.everyMs.value / 1000 / balance.outsideRules.clock.periodSec.value * 24;
  assert.equal(merchant.cooldownSimHours, everyHours, "the caravan keeps the prototype's merchant cadence");
  const stayMinutes = balance.rules.merchant.stayMs.value / 1000 / balance.outsideRules.clock.periodSec.value * 1440;
  assert.equal(merchant.durationSimMinutes, stayMinutes, "the caravan stays as long as the prototype's merchant");
});

test("every card names a beat the player sees at start and at end", () => {
  for (const c of cards) {
    assert.ok(c.beat.start.length > 10 && c.beat.end.length > 10, `${c.id}: beat too short`);
    assert.ok(c.hooks.start.length > 0, `${c.id}: a card with no start hook has no visible beat for the sim to make`);
  }
});

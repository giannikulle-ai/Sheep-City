// The farm event deck (#41, migrated to v2 for #59): the checks the issue asks for, plus the
// cross-file ones a schema cannot express (spawn landmarks exist, flags set at start are cleared
// at end, placeholders match conditions, every predicate name is a known one, ids are unique
// across events/farm.json and events/authored.json). The schemas themselves run in scripts/validate.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "../scripts/lib/schema.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const json = (rel) => JSON.parse(readFileSync(resolve(here, "..", rel), "utf8"));
const deck = json("events/farm.json");
const authored = json("events/authored.json");
const spots = json("farm/spots.json");
const balance = json("balance/farm.json");
const cards = deck.events;
const authoredEvents = authored.events;

// The vocabulary the sim's engine implements first (#40). Add here and in the schema together.
export const ALLOWED_HOOKS = ["setVisibility", "spawn", "mood", "coins", "flag"];
export const REQUIRED_CARD_IDS = [
  "fogMorning", "crowsOnTheField", "lostLamb", "merchantCaravan", "shearingDay", "rainbowAfterRain",
  "strayCatVisits", "farmersDayOff", "nightOfTheFireflies", "lambZoomiesHour", "wellRunsLow",
  "windfall", "stargazingNight", "flockHuddle", "farmerMeetsMerchant",
];
export const REQUIRED_AUTHORED_IDS = ["dlBirthday", "cliffStorm", "firstSnowOfSeason"];
const PLACEHOLDERS = ["dl", "lamb", "sheep", "farmer", "merchant", "coins", "flock"];
const WATCH_KINDS = ["bubble", "npc-arrival", "weather", "dl-trick", "lamb", "phase", "bird", "rabbit"];
const COUNTED_KINDS = ["bubble", "npc-arrival", "weather", "dl-trick", "lamb"];
const CONDITION_ON = [
  "season", "weather", "timeOfDay", "simMinutesSinceRain",
  "ledger.wool", "ledger.coins", "ledger.grass", "ledger.flock",
  "lambFarFromMother", "dlFarFromFlock", "flockScattered",
  "merchantPresent", "lambPresent", "farmerPresent",
];
const CONDITION_OPS = ["eq", "ne", "in", "not-in", "gte", "lte", "gt", "lt"];

const allHooks = (c) => [...c.hooks.start, ...c.hooks.end];
const allConditions = (c) => [...c.conditions, ...c.weight.multipliers.map((m) => m.when)];

test("the deck passes its schema", () => {
  assert.deepEqual(validate(resolve(here, "../schema/events.schema.json"), deck), []);
});

test("the authored events pass their schema", () => {
  assert.deepEqual(validate(resolve(here, "../schema/authored-events.schema.json"), authored), []);
});

test("fifteen cards, ids unique, the required set present and nothing missing", () => {
  assert.equal(cards.length, 15);
  const ids = cards.map((c) => c.id);
  assert.equal(new Set(ids).size, 15, "ids must be unique");
  assert.deepEqual([...ids].sort(), [...REQUIRED_CARD_IDS].sort());
});

test("three authored events, ids unique, the required set present and nothing missing", () => {
  assert.equal(authoredEvents.length, 3);
  const ids = authoredEvents.map((e) => e.id);
  assert.equal(new Set(ids).size, 3, "ids must be unique");
  assert.deepEqual([...ids].sort(), [...REQUIRED_AUTHORED_IDS].sort());
});

test("ids are unique across both files", () => {
  const cardIds = cards.map((c) => c.id);
  const authoredIds = authoredEvents.map((e) => e.id);
  const all = [...cardIds, ...authoredIds];
  assert.equal(new Set(all).size, all.length, "a card and an authored event must never share an id");
});

test("every hook is from the allowed list, in both files", () => {
  for (const c of [...cards, ...authoredEvents]) for (const h of allHooks(c)) assert.ok(ALLOWED_HOOKS.includes(h.op), `${c.id}: hook ${h.op}`);
  const used = new Set(cards.flatMap((c) => allHooks(c).map((h) => h.op)));
  assert.deepEqual([...used].sort(), [...ALLOWED_HOOKS].sort(), "every allowed hook is exercised by at least one card");
});

test("every predicate name, in a card's conditions and every weight multiplier's `when`, is in the allowed list", () => {
  for (const c of cards) {
    for (const cond of allConditions(c)) {
      assert.ok(CONDITION_ON.includes(cond.on), `${c.id}: unknown predicate "${cond.on}"`);
      assert.ok(CONDITION_OPS.includes(cond.op), `${c.id}: unknown op "${cond.op}"`);
    }
  }
});

test("every authored trigger's predicates, and any stockThreshold's `on`, are in the allowed list", () => {
  for (const e of authoredEvents) {
    if (e.trigger.kind === "predicates") {
      for (const cond of e.trigger.all) {
        assert.ok(CONDITION_ON.includes(cond.on), `${e.id}: unknown predicate "${cond.on}"`);
        assert.ok(CONDITION_OPS.includes(cond.op), `${e.id}: unknown op "${cond.op}"`);
      }
    }
    if (e.trigger.kind === "stockThreshold") {
      assert.ok(CONDITION_ON.includes(e.trigger.on), `${e.id}: unknown predicate "${e.trigger.on}"`);
      assert.ok(CONDITION_OPS.includes(e.trigger.op), `${e.id}: unknown op "${e.trigger.op}"`);
    }
  }
});

test("every storybook line is under 90 characters, past tense, and uses only known placeholders", () => {
  for (const c of [...cards, ...authoredEvents]) {
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
    const on = (name) => c.conditions.some((cd) => cd.on === name && cd.value === true);
    if (line.includes("{lamb}")) assert.ok(on("lambPresent"), `${c.id}: {lamb} needs a lambPresent condition`);
    if (line.includes("{coins}")) {
      const pays = allHooks(c).some((h) => h.op === "coins" && h.delta > 0) || allHooks(c).some((h) => h.op === "spawn" && h.what === "merchant");
      assert.ok(pays, `${c.id}: {coins} needs a coins hook or the merchant`);
    }
    if (line.includes("{farmer}")) assert.ok(allHooks(c).some((h) => h.op === "spawn" && h.what === "farmer"), `${c.id}: {farmer} needs the farmer`);
  }
  for (const e of authoredEvents) {
    const line = e.storybook.line;
    for (const p of ["lamb", "coins", "farmer"]) assert.ok(!line.includes(`{${p}}`), `${e.id}: {${p}} has no trigger-side guarantee to check against`);
  }
});

test("spawn hooks name landmarks from farm/spots.json", () => {
  for (const c of [...cards, ...authoredEvents]) for (const h of allHooks(c)) if (h.op === "spawn") assert.ok(h.at in spots.spots, `${c.id}: no spot "${h.at}"`);
});

test("a flag set at start is cleared at end, and nothing else touches flags", () => {
  for (const c of [...cards, ...authoredEvents]) {
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
  for (const c of [...cards, ...authoredEvents]) {
    const vis = (list) => list.filter((h) => h.op === "setVisibility");
    if (vis(c.hooks.start).length) assert.deepEqual(vis(c.hooks.end).map((h) => h.value), [1], `${c.id}: visibility must return to 1`);
  }
});

test("moments are watch-test kinds, counted for cards, and distinct across both files", () => {
  const keys = [...cards, ...authoredEvents].map((c) => `${c.moment.kind}:${c.moment.detail}`);
  for (const c of cards) {
    assert.ok(WATCH_KINDS.includes(c.moment.kind), `${c.id}: kind ${c.moment.kind}`);
    assert.ok(COUNTED_KINDS.includes(c.moment.kind), `${c.id}: ${c.moment.kind} is logged but not counted by the watch test`);
  }
  for (const e of authoredEvents) assert.ok(WATCH_KINDS.includes(e.moment.kind), `${e.id}: kind ${e.moment.kind}`);
  assert.equal(new Set(keys).size, keys.length, "two cards or events must not share a moment key");
});

test("card conditions use the sim's vocabulary and are satisfiable", () => {
  const seasons = balance.outsideRules.seasons.order.value;
  const phases = Object.keys(balance.outsideRules.clock.phases.value);
  for (const c of cards) {
    for (const cond of c.conditions) {
      if (cond.on === "season") for (const s of cond.value) assert.ok(seasons.includes(s), `${c.id}: season ${s}`);
      if (cond.on === "timeOfDay") for (const t of cond.value) assert.ok(phases.includes(t), `${c.id}: phase ${t}`);
      if (cond.on === "weather" && cond.op === "in") {
        if (cond.value.includes("snow")) {
          const seasonCond = c.conditions.find((x) => x.on === "season");
          assert.ok(!seasonCond || seasonCond.value.some((s) => balance.outsideRules.seasons.odds.value[s].snow > 0), `${c.id}: snow never falls in this card's season`);
        }
      }
    }
    const flockMin = c.conditions.find((cd) => cd.on === "ledger.flock" && (cd.op === "gte" || cd.op === "gt"));
    if (flockMin) assert.ok(flockMin.value <= balance.rules.flockCap.value, `${c.id}: ledger.flock floor ${flockMin.value} exceeds the flock cap`);
  }
});

test("weather condition values, in both files, are from the sim's vocabulary", () => {
  const weathers = ["sun", "rain", "snow"];
  const valuesFor = (cond) => (Array.isArray(cond.value) ? cond.value : [cond.value]);
  for (const c of cards) {
    for (const cond of allConditions(c)) if (cond.on === "weather") for (const w of valuesFor(cond)) assert.ok(weathers.includes(w), `${c.id}: weather value "${w}"`);
  }
  for (const e of authoredEvents) {
    if (e.trigger.kind !== "predicates") continue;
    for (const cond of e.trigger.all) if (cond.on === "weather") for (const w of valuesFor(cond)) assert.ok(weathers.includes(w), `${e.id}: weather value "${w}"`);
  }
});

test("the schema rejects a season/weather/timeOfDay value outside its enum, in a card condition and in an authored trigger.all predicate", () => {
  const badCard = { ...deck, events: [{ ...cards[0], conditions: [{ on: "timeOfDay", op: "in", value: ["duskk"] }] }] };
  const cardErrors = validate(resolve(here, "../schema/events.schema.json"), badCard);
  assert.ok(cardErrors.length > 0, "a mistyped timeOfDay value (\"duskk\") must fail schema validation");

  const predicateEvent = authoredEvents.find((e) => e.trigger.kind === "predicates");
  const badAuthored = {
    ...authored,
    events: [{ ...predicateEvent, trigger: { ...predicateEvent.trigger, all: [{ on: "weather", op: "eq", value: "snoww" }] } }],
  };
  const authoredErrors = validate(resolve(here, "../schema/authored-events.schema.json"), badAuthored);
  assert.ok(authoredErrors.length > 0, "a mistyped weather value (\"snoww\") in an authored trigger predicate must fail schema validation");
});

test("timings are in-world and sane for a three-minute day; limits are internally consistent", () => {
  assert.equal(deck.timeScale.realSecondsPerSimDayWatching, balance.outsideRules.clock.periodSec.value);
  assert.equal(authored.timeScale.realSecondsPerSimDayWatching, balance.outsideRules.clock.periodSec.value);
  for (const c of cards) {
    const realSec = c.durationSimMinutes / deck.timeScale.simMinutesPerDay * deck.timeScale.realSecondsPerSimDayWatching;
    assert.ok(realSec >= 3 && realSec <= 90, `${c.id}: ${realSec}s real is outside 3..90 s`);
    assert.ok(c.limits.minGapSimMinutes >= c.durationSimMinutes, `${c.id}: minGapSimMinutes shorter than the card's own duration`);
    assert.equal(c.limits.minGapSimMinutes, c.durationSimMinutes + c.limits.cooldownSimHours * 60, `${c.id}: minGapSimMinutes should be duration + cooldown, start to start`);
  }
  const merchant = cards.find((c) => c.id === "merchantCaravan");
  const everyHours = balance.rules.merchant.everyMs.value / 1000 / balance.outsideRules.clock.periodSec.value * 24;
  assert.equal(merchant.limits.cooldownSimHours, everyHours, "the caravan keeps the prototype's merchant cadence");
  const stayMinutes = balance.rules.merchant.stayMs.value / 1000 / balance.outsideRules.clock.periodSec.value * 1440;
  assert.equal(merchant.durationSimMinutes, stayMinutes, "the caravan stays as long as the prototype's merchant");
});

test("every card and authored event names a beat the player sees at start and at end", () => {
  for (const c of [...cards, ...authoredEvents]) {
    assert.ok(c.beat.start.length > 10 && c.beat.end.length > 10, `${c.id}: beat too short`);
    assert.ok(c.hooks.start.length > 0, `${c.id}: an event with no start hook has no visible beat for the sim to make`);
  }
});

test("every card has a weight object with a positive base and every multiplier a positive `times`", () => {
  for (const c of cards) {
    assert.ok(c.weight.base > 0 && c.weight.base <= 100, `${c.id}: weight.base out of range`);
    for (const m of c.weight.multipliers) assert.ok(m.times > 0, `${c.id}: multiplier times must be positive`);
  }
});

test("dlBirthday and firstSnow moved out of the card deck and into authored.json, id-for-id renamed", () => {
  const cardIds = new Set(cards.map((c) => c.id));
  assert.ok(!cardIds.has("dlBirthday"), "dlBirthday is authored now, not a card");
  assert.ok(!cardIds.has("firstSnow"), "firstSnow is authored now, not a card (as firstSnowOfSeason)");
});

test("every authored event's priorityOver entries are known card ids or look like bare parameter names", () => {
  const cardIds = new Set(cards.map((c) => c.id));
  const knownParams = ["mood", "coins", "weather", "visibility"];
  for (const e of authoredEvents) {
    for (const target of e.priorityOver) assert.ok(cardIds.has(target) || knownParams.includes(target), `${e.id}: priorityOver "${target}" is neither a card id nor a known parameter name`);
  }
});

test("authored triggers use one of the three kinds the issue asks for, each shaped correctly", () => {
  for (const e of authoredEvents) {
    assert.ok(["predicates", "simDate", "stockThreshold"].includes(e.trigger.kind), `${e.id}: trigger kind ${e.trigger.kind}`);
    if (e.trigger.kind === "predicates") assert.ok(e.trigger.all.length > 0 && e.trigger.cooldownSimDays > 0);
    if (e.trigger.kind === "simDate") {
      assert.ok(balance.outsideRules.seasons.order.value.includes(e.trigger.season));
      assert.ok(e.trigger.dayOfSeason >= 1 && e.trigger.dayOfSeason <= 9);
    }
    if (e.trigger.kind === "stockThreshold") assert.ok(e.trigger.cooldownSimDays > 0);
  }
});

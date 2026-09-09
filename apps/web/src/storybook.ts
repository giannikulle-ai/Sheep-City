// The storybook: what the app shows when the farm was left alone. Plan, section 2, "The chronicle
// and the storybook" — "The storybook is a selection over the chronicle for the time away, never
// new prose: the storybook only tells." Everything here is pure: reads `chronicleBetween`'s output
// and the catch-up's own numbers, and never invents a line of its own. The DOM side (the overlay,
// drawing each line's picture) is storybook-overlay.ts; persistence (the page store's place in the
// save envelope) is save.ts.
import { RULES, type ChronicleEntry } from '@sheepcliff/sim';

/** Sim ms in one virtual day, the same unit `dayMs(sim)` (packages/sim) is in: `periodSec * 1000`
 * of the clock's own `nowMs`, one full dawn-to-dawn cycle. */
const SIM_MINUTES_PER_DAY = 24 * 60;

/** Only the gate (`storybookGateMs`) uses this: "ten sim-minutes" is a fraction of the world's own
 * day (`periodSec`), so a fast day and a slow day feel the same wait before a page can open. The
 * title (`awayTitle`) and the catch-up amount are never in this unit — see fix round 1 on #42: they
 * are real (wall-clock) milliseconds, one to one with sim ms (the host's own mapping, `catchUp`'s
 * doc comment, packages/sim/src/ledger/catch-up.ts), so `?gap=` must feed those, not this. */
export function simMinutesToMs(periodSec: number, minutes: number): number {
  return (periodSec * 1000 * minutes) / SIM_MINUTES_PER_DAY;
}

/** The done-means gate: "on load with a gap over ten sim-minutes". */
export const STORYBOOK_GATE_SIM_MINUTES = 10;

export function storybookGateMs(periodSec: number): number {
  return simMinutesToMs(periodSec, STORYBOOK_GATE_SIM_MINUTES);
}

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * 3600_000;

/** Small counts spelled out ("six"), the way a person would say them; a numeral past that stays
 * true without needing a word for every number. */
const SMALL_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];
function spellSmall(n: number): string {
  return SMALL_WORDS[n] ?? String(n);
}

const SINGULAR: Record<'minute' | 'hour' | 'day', string> = { minute: 'a minute', hour: 'an hour', day: 'a day' };
function countWord(n: number, unit: 'minute' | 'hour' | 'day'): string {
  return n === 1 ? SINGULAR[unit] : `${spellSmall(n)} ${unit}s`;
}

/**
 * True if the real (sim, one-to-one) millisecond span `[fromMs, toMs)` crosses the world's own
 * night phase (`phaseOf`, whose boundaries are content data, `RULES.clock.phases`) at least once.
 * `periodSec` is the world's own day length (`Clock.periodSec`) — a farm can run a fast day, so
 * whether "a night" happened is checked against the real phase the clock passed through, never
 * guessed from a fixed real-time span. A gap of a full day or more always contains a night.
 *
 * The clock's own `t` at a given `nowMs` is `frac(startT + nowMs / dayLenMs)` (`createClock` starts
 * at `RULES.clock.startT`, mid-morning, and `advanceClock` only ever adds `dtMs / periodSec / 1000`
 * to it) — never `frac(nowMs / dayLenMs)` alone. So the night window's boundaries in `nowMs` terms
 * have to subtract that same `startT` (fix round 2 on #42, R2-2: without it, this disagreed with
 * `phaseOf` for 9 of every 24 hour-windows at a real-time day length).
 *
 * That inversion assumes a clock that was never paused and whose `periodSec` never changed, both of
 * which a player can do (verdict round 3, S2). It is unreachable on a shipped farm — the tray offers
 * 60/180/600 s days, so any gap that reaches the title's hour bucket is already a full farm day or
 * more and the early return above answers first — and reading the clock's own `t` instead would not
 * be the improvement it looks like: the Ledger ages the farm by elapsed milliseconds even while the
 * clock is paused (see "the gap in the world's own time" below), so a `t`-derived answer would call
 * a gap no time at all while the page under it shows that gap's own lambs and wool. Left as it is,
 * deliberately, until something makes a long day length reachable in play.
 */
export function gapSpansNight(fromMs: number, toMs: number, periodSec: number): boolean {
  const dayLenMs = Math.max(1, periodSec) * 1000;
  const lo = Math.min(fromMs, toMs);
  const hi = Math.max(fromMs, toMs);
  if (hi <= lo) return false;
  if (hi - lo >= dayLenMs) return true;
  const startT = RULES.clock.startT;
  const nightStart = RULES.clock.phases.night - startT;
  const nightEnd = RULES.clock.phases.dawn - startT;
  const k0 = Math.floor(lo / dayLenMs) - 1;
  const k1 = Math.floor(hi / dayLenMs) + 1;
  for (let k = k0; k <= k1; k++) {
    const start = (k + nightStart) * dayLenMs;
    const end = (k + nightEnd) * dayLenMs;
    if (lo < end && hi > start) return true;
  }
  return false;
}

// --- the gap in the world's own time ----------------------------------------------------------
//
// The storybook says one absence twice: how long the player was away (real time, `awayLabel`) and
// how much of the farm's own life ran while they were (world time). Both are read off the same gap
// — `fromMs`, `toMs`, and the world's own day length — so they can never disagree with each other
// or with the title.
//
// Why the millisecond span, and not the clock's own `t`/`dayCount`, which the catch-up does hand
// back on both bounds (verdict round 3, S2): the Ledger ages the farm by elapsed milliseconds
// whether or not the clock is paused. `stepLedger` (packages/sim/src/ledger/advance.ts) draws
// births, grass, wool and the season from `span` alone and consults `paused` only for `t`,
// `dayCount` and the phase — so a paused farm still tells lambs born and wool banked over a gap its
// clock counts as no time at all. Measured, not assumed: the goldens' own world is paused (`?freeze=1`
// boots `pauseClock`) and a seven-day `?gap=` there tells three chronicle lines with `dayCount`
// unmoved. The span is the number that matches the lines the page actually shows; the clock's `t` is
// the day/night display, which is what the title's night check reads it for (`gapSpansNight`).

/** Farm days the gap covers: its own millisecond span through the world's own day length
 * (`Clock.periodSec`, the same unit `dayMs(sim)` is in). Never negative. */
export function worldDaysBetween(fromMs: number, toMs: number, periodSec: number): number {
  const dayLenMs = Math.max(1, periodSec) * 1000;
  const days = Math.abs(toMs - fromMs) / dayLenMs;
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** Floating-point slack when flooring a day count: forty farm days can come back from the division
 * as 39.99999999999999, and calling that "39 farm days" would understate the gap by a whole day for
 * no reason but binary arithmetic. Far too small to round a genuine 39.9 up. */
const DAY_EPSILON = 1e-9;

/** The world span in plain words, floored, never rounded up: "3360 farm days", "1 farm day", "half
 * a farm day", "less than half a farm day". A measurement of the gap, like the real-time span it
 * sits beside — not a line about what happened, which only the chronicle may say. */
export function worldTimeLabel(days: number): string {
  const d = Number.isFinite(days) && days > 0 ? days : 0;
  const whole = Math.floor(d + DAY_EPSILON);
  if (whole >= 1) return `${whole} farm ${whole === 1 ? 'day' : 'days'}`;
  if (d >= 0.5) return 'half a farm day';
  return 'less than half a farm day';
}

/**
 * The time away in plain words, true to the real gap `[fromMs, toMs)` (sim ms, one to one with
 * wall-clock ms — see `gapSpansNight`): "a moment" under a minute (never "a minute" for a gap the
 * clock itself would round to zero of them — fix round 2 on #42, R2-3), minutes under an hour ("six
 * minutes"), hours under a day ("two hours") — unless the gap actually spans the world's own night,
 * in which case "a night" — then days ("three days"), "a week" at exactly seven, "over a week" short
 * of two, and a rounded week count beyond that. Never a word the gap does not support: nothing here
 * rounds up across a bucket boundary (a 23-hour gap never becomes "a day", and a 59-second gap never
 * becomes "a minute").
 */
export function awayTitle(awayMs: number, fromMs: number, toMs: number, periodSec: number): string {
  const ms = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  if (ms < MIN_MS) return 'a moment';
  if (ms < HOUR_MS) return countWord(Math.floor(ms / MIN_MS), 'minute');
  if (ms < DAY_MS) {
    if (gapSpansNight(fromMs, toMs, periodSec)) return 'a night';
    // Reachable only on a farm whose day is an hour or longer: at every day length the tray offers
    // (60/180/600 s) a gap of an hour or more has already turned dozens of farm days, so the night
    // check above answers first and the title reads "a night" (verdict round 3, S1 — the hour count
    // is unreachable at the shipped day lengths). It is kept rather than dropped because it is the
    // true reading for a farm on a long day (the QA `setDayLength` hook, or the real-time day length
    // balance/farm.json names), and because whether the title should speak in world time throughout
    // is the owner's call, not this function's.
    return countWord(Math.floor(ms / HOUR_MS), 'hour');
  }
  const days = Math.floor(ms / DAY_MS);
  if (days === 7) return 'a week';
  if (days > 7 && days < 14) return 'over a week';
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return countWord(days, 'day');
}

export interface StorybookLine {
  entryId: string;
  line: string;
  picture: string;
  /** #113: every chronicle entry this line accounts for, most notable first (the order `entries`
   * itself arrives in — `chronicleBetween`'s own order), `entryId` included as its first element —
   * length 1 for a plain line, up to `MAX_STORED_MORE` for one that collapses a repeated card
   * ("Three crows landed on the hay and Digital Luna sent them packing, four times this week.").
   * F3 (round 2): a card's own repeats in one gap have no bound, so this is capped at
   * `MAX_STORED_MORE` — the same cap the page's own "and N more" already uses — rather than one id
   * per telling; `count` carries the group's true tally, always exact regardless of the cap. A
   * reader after the whole (capped) backing set reads `lineEntryIds`; one after the true count
   * reads `lineCount`. Optional only so a page stored before this shipped still loads
   * (`parsePageStore`) without inventing a set it never had; every line this file itself builds
   * sets it, plain or collapsed alike, so nothing downstream has to special-case "was this
   * collapsed" — read `lineEntryIds`/`lineCount` instead of `entryId` wherever the whole backing
   * set, or its true size, is what matters. */
  entryIds?: string[];
  /** #113/F3: the true number of chronicle entries this line stands for, set alongside `entryIds`
   * for a collapsed line (`collapsedLine`) so the "N times ..." suffix and every reader after the
   * real tally stay exact even once `entryIds` itself is capped. Undefined for a plain,
   * uncollapsed line (and for a page saved before this existed) — such a line is always exactly
   * one entry; read `lineCount`, never this field directly. */
  count?: number;
}

/** Every chronicle entry id `line` is backed by (#113): `line.entryIds` when the line carries it —
 * every line `buildStorybookPage` builds does — or `[line.entryId]` for one read off a page saved
 * before this shipped, where a line was always exactly one entry. For a heavily-repeated card this
 * is a capped sample (`MAX_STORED_MORE`, F3 round 2), most-notable-first — not necessarily the
 * line's *whole* backing set; `lineCount` is the true tally. The one place to read a line's stored
 * backing ids; `pagedEntryIds` and the qa coverage tests use this rather than `entryId` alone. */
export function lineEntryIds(line: StorybookLine): string[] {
  return line.entryIds ?? [line.entryId];
}

/** The true number of chronicle entries `line` stands for (F3, round 2): `line.count` when the
 * line carries it — a collapsed line whose real tally can exceed its own capped `entryIds` — else
 * `lineEntryIds(line).length` (a plain line, or one read off a page saved before `count` existed,
 * is exactly as many entries as it names). The count suffix in a collapsed line's own text
 * (`spellSmall(group.length)`, `collapsedLine`) is always built from this same number. */
export function lineCount(line: StorybookLine): number {
  return line.count ?? lineEntryIds(line).length;
}

export interface StorybookPage {
  /** Stable, derived from the entry ids it shows — see `pageId`. */
  id: string;
  title: string;
  /** wall-clock ms when the page was made */
  createdAt: number;
  /** wall-clock ms the farm was left alone */
  awayMs: number;
  fromMs: number;
  toMs: number;
  /** Farm days the gap covered: its real span through the world's own day length
   * (`worldDaysBetween`). The subtitle's world time, stored so a reopened page still says what its
   * own gap was worth. Pages stored before this existed have none, and show their real span alone. */
  worldDays?: number;
  /** The lines the card shows at once, most notable first. */
  lines: StorybookLine[];
  /** The rest of the gap's lines, in the same order, behind the card's "and N more" row: nothing a
   * gap told is dropped from its page (verdict round 3, S3). Capped at `MAX_STORED_MORE`. */
  more: StorybookLine[];
}

// --- how many lines a page shows ---------------------------------------------------------------
//
// These numbers are the owner's, and the owner's to move. A page shows more lines the longer the
// farm was left alone ("it should be based on how long away, with a minimum"), with a floor so a
// short absence still reads as a page and a cap so a long one still fits a phone. `LINE_COUNT_STEPS`
// is read in order: the first step whose `upToMs` the gap does not exceed wins, and a gap past the
// last step gets `MAX_PAGE_LINES`. Selection itself is unchanged — notability-first, with the
// non-card swap rule (`selectLines`); only how many of them the card shows moves with the gap.

/** The floor: any absence, however short, that earns a page at all gets this many lines. */
export const MIN_PAGE_LINES = 5;

/** The cap: the longest absence still shows no more than this, so the card stays readable on a
 * phone. Everything past the shown lines is kept behind "and N more" (`StorybookPage.more`). */
export const MAX_PAGE_LINES = 12;

export const LINE_COUNT_STEPS: readonly { readonly upToMs: number; readonly lines: number }[] = [
  { upToMs: DAY_MS, lines: 5 }, // up to a day away (a night)
  { upToMs: 3 * DAY_MS, lines: 8 }, // up to three days
  { upToMs: 7 * DAY_MS, lines: 10 }, // up to a week, the week itself included
];

/** How many lines a page shows for a gap of `awayMs` real milliseconds: the step table above,
 * clamped between the floor and the cap. Pure, and total: a non-finite or negative gap reads as
 * zero and gets the floor. */
export function lineCountFor(awayMs: number): number {
  const ms = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  const step = LINE_COUNT_STEPS.find((s) => ms <= s.upToMs);
  return Math.min(MAX_PAGE_LINES, Math.max(MIN_PAGE_LINES, step ? step.lines : MAX_PAGE_LINES));
}

/** How many of a gap's remaining lines a page keeps behind "and N more". A ledger gap tells at most
 * a handful today (one per kind of change, plus one per upgrade bought), but a future source could
 * tell far more in one gap, and a page store lives in the save — so the remainder is bounded while
 * the shown lines never are. A gap that told more than `MAX_PAGE_LINES + MAX_STORED_MORE` lines
 * loses its least notable ones; nothing shipped today comes close.
 *
 * F3 (round 2): also the cap on one collapsed line's own stored `entryIds` (`collapsedLine`) — a
 * card repeated beyond this many times in a single gap (measured: a real week away repeats its
 * most common small card in the thousands) keeps only its first `MAX_STORED_MORE` tellings by id,
 * most notable first; `StorybookLine.count` keeps the "N times ..." suffix, and every other reader
 * of the true tally, exact regardless. Without this a page store's size grows with the length of
 * the gap itself, unbounded, next to the save. */
export const MAX_STORED_MORE = 50;

/**
 * Up to `max` entries (`lineCountFor` decides how many for a given gap), most notable first (the
 * order `chronicleBetween` already returns), with one adjustment: if every one of them came from a
 * 'card' source and a non-card entry exists anywhere in `entries`, the lowest-notability card entry
 * is swapped for the highest-notability non-card one
 * not already picked — "a week reads as a shape... with at least one line from a non-card source
 * when one exists" (issue #42). Every source in the chronicle today is 'ledger', so this is a no-op
 * until the event engine (#82) starts telling cards; it is still exercised in the unit tests below
 * with a hand-built entry list, so the rule is proven ahead of that landing.
 *
 * Unchanged by #113: `buildStorybookPage` runs this over an already-collapsed list (one entry per
 * repeated card, not one per telling — `collapseCardRepeats`), so "no two identical card lines"
 * lives entirely in the collapsing step below, not in this rule. Called directly, as the unit tests
 * below still do, this sees exactly the entries it is given, repeats and all.
 */
export function selectLines(entries: readonly ChronicleEntry[], max = MIN_PAGE_LINES): ChronicleEntry[] {
  const picked = entries.slice(0, max);
  if (picked.length === 0 || picked.some((e) => e.source !== 'card')) return picked;
  const pickedIds = new Set(picked.map((e) => e.id));
  const nonCard = entries.find((e) => !pickedIds.has(e.id) && e.source !== 'card');
  if (!nonCard) return picked;
  const worstIdx = picked.reduce((worst, e, i) => (e.notability < (picked[worst]?.notability ?? Infinity) ? i : worst), 0);
  return picked.map((e, i) => (i === worstIdx ? nonCard : e));
}

/** A stable id for a page, from the entry ids it tells — pages that tell the same entries collide
 * on purpose, so re-running a catch-up over the same gap never duplicates a stored page. */
export function pageId(entryIds: readonly string[]): string {
  return entryIds.slice().sort().join('+');
}

// --- collapsing a repeated card into one line (#113) --------------------------------------------
//
// A long absence's storybook page used to repeat the same small-card line many times — "crows,
// windfall, crows, crows, windfall, crows" was the owner's own report of a week away. The sim half
// (chronicle notability) makes a card's own repeats score no higher than a routine telling, but
// selection still needs its own rule: a page must never show the same card line twice, and the
// tellings it does not show on their own are not simply dropped — they are still true, and the
// storybook only tells, so they are folded into one line that says how many times, backed by every
// entry it speaks for.

/** The trailing phrase a collapsed line's count suffix reads against — the page's own title word
 * (`awayTitle`), so a collapsed line never claims a span its own title does not: "four times this
 * week" only on a page titled "a week". Every other title shape gets a plain, honest phrase rather
 * than a guess at new prose the title itself does not support. */
function collapseSpanPhrase(title: string): string {
  if (title === 'a week') return 'this week';
  if (title === 'a night') return 'tonight';
  if (title === 'a moment') return 'just now';
  return 'this visit';
}

/** A collapsed line's own count word, AP style (plan section 11, decision 20, 2026-09-09: "Follow
 * AP style rules"): two reads as the idiom "twice" — never "two times" — so it carries no trailing
 * "times" of its own; three through nine are spelled out, the same small-number words
 * (`spellSmall`) a plain count elsewhere in this file already uses, each followed by "times"; ten
 * and up stays a numeral, "times" after it, with a comma separator once the count itself reaches
 * 1,000 (the classic thousands-grouping regex, not `toLocaleString`, so the output never depends on
 * a runtime's own ICU data). Never called for a count of one — a card told only once in the gap
 * never collapses (`buildStorybookPage`'s `toLine`), so it stays the plain, unsuffixed line and this
 * helper never has an opinion on it. */
export function apCountPhrase(n: number): string {
  if (n === 2) return 'twice';
  if (n >= 3 && n <= 9) return `${spellSmall(n)} times`;
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} times`;
}

/**
 * One collapsed line for a run of same-picture `card` entries, all told the same thing (#113):
 * `anchor`'s own line, verbatim, its trailing period swapped for a mechanical count suffix — never
 * new prose, AP-style numbers (`apCountPhrase`, plan decision 20). "Three crows landed on the hay
 * and Digital Luna sent them packing." + four tellings + "a week" -> "Three crows landed on the hay
 * and Digital Luna sent them packing, four times this week." Backed by every entry in `group`,
 * `anchor` included — `entryIds`, read through `lineEntryIds` — not only the one line's text was
 * drawn from.
 *
 * F3 (round 2): `group` itself has no bound (a real week away can repeat one small card in the
 * thousands), so the *stored* `entryIds` is `group` capped at `MAX_STORED_MORE` — `anchor` is
 * always `group[0]` (`collapseCardRepeats` builds `group` in `entries`' own most-notable-first
 * order), so it always survives the cap. `count` carries `group`'s real length regardless, which
 * is what the count suffix above is built from — never `entryIds.length`, so the sentence stays
 * exact even once the id list itself is truncated.
 */
function collapsedLine(anchor: ChronicleEntry, group: readonly ChronicleEntry[], spanPhrase: string): StorybookLine {
  const base = anchor.line.replace(/\.+$/, '');
  return {
    entryId: anchor.id,
    line: `${base}, ${apCountPhrase(group.length)} ${spanPhrase}.`,
    picture: anchor.picture,
    count: group.length,
    entryIds: group.slice(0, MAX_STORED_MORE).map((e) => e.id),
  };
}

/** One logical line: either a single entry (a non-card line, or a card told only once in the gap)
 * or a repeated card's whole run, `anchor` its most notable telling. */
interface LogicalLine {
  anchor: ChronicleEntry;
  group: ChronicleEntry[];
}

/**
 * `entries` (already most-notable-first), with every run of same-`picture` `source: 'card'` entries
 * folded into one logical line at its most notable member's own position (`entries` is sorted, so
 * that member is simply the first of its picture the loop meets) — so a card told N times in the
 * gap occupies exactly the one slot its best telling earned, "placed where the first telling would
 * have been" (#113), never N slots. A non-card entry, or a card told only once, passes through as
 * its own one-entry group, unmoved — collapsing a picture never told twice is a no-op, not a
 * special case a reader has to allow for. Grouped by `picture`, not a card id: `facts`/`repeats`
 * (`packages/sim/src/chronicle`) deliberately keep a card's own id out of the chronicle entry
 * itself, and `picture` is already the one field every card's line carries that is unique to it
 * (`packages/content/events/farm.json`'s `storybook.picture`) — an end's picture is its own card's
 * picture plus `-end` (`engine/engine.ts`'s `endEvent`), so it is never grouped with that card's own
 * starts.
 */
function collapseCardRepeats(entries: readonly ChronicleEntry[]): LogicalLine[] {
  const out: LogicalLine[] = [];
  const byPicture = new Map<string, LogicalLine>();
  for (const e of entries) {
    if (e.source === 'card') {
      const existing = byPicture.get(e.picture);
      if (existing) {
        existing.group.push(e);
        continue;
      }
      const line: LogicalLine = { anchor: e, group: [e] };
      byPicture.set(e.picture, line);
      out.push(line);
      continue;
    }
    out.push({ anchor: e, group: [e] });
  }
  return out;
}

/**
 * One storybook page for a gap, or null when the chronicle has nothing to tell for it — the
 * storybook only tells, so a quiet gap gets no page rather than an invented "nothing happened"
 * line. The page shows `lineCountFor(awayMs)` lines and keeps the rest of the gap's entries in
 * `more`, so a page tells everything its gap told. `periodSec` is the world's own day length, which
 * both the title's night check and the stored world span (`worldDaysBetween`) read the gap through.
 *
 * `entries` should be `unseenEntries(chronicleBetween(state, fromMs, toMs), pageStore)` —
 * the gap's own chronicle window, with anything a stored page already told filtered out (fix round
 * 1 on #42: the sim's `tellLedgerDiff` stamps every entry of a gap at the instant the gap ends, the
 * same clock instant the next load's window starts from, so the raw window can repeat a previous
 * page's entries — the page store, not the timestamps, is what says what has already been shown).
 *
 * #113: `entries` is first collapsed (`collapseCardRepeats`) so a repeated card is one logical line
 * before `selectLines` ever runs — "and N more" is collapsed the same way, so a page never repeats
 * a card line anywhere on it, shown or revealed.
 */
export function buildStorybookPage(
  entries: readonly ChronicleEntry[],
  awayMs: number,
  fromMs: number,
  toMs: number,
  createdAt: number,
  periodSec: number,
): StorybookPage | null {
  const logical = collapseCardRepeats(entries);
  const anchors = logical.map((l) => l.anchor);
  const groupByAnchorId = new Map(logical.map((l) => [l.anchor.id, l.group]));
  const chosen = selectLines(anchors, lineCountFor(awayMs));
  if (chosen.length === 0) return null;
  const title = awayTitle(awayMs, fromMs, toMs, periodSec);
  const spanPhrase = collapseSpanPhrase(title);
  const toLine = (e: ChronicleEntry): StorybookLine => {
    const group = groupByAnchorId.get(e.id) ?? [e];
    return group.length > 1
      ? collapsedLine(e, group, spanPhrase)
      : { entryId: e.id, line: e.line, picture: e.picture, entryIds: [e.id] };
  };
  const lines = chosen.map(toLine);
  const shown = new Set(lines.flatMap(lineEntryIds));
  // Everything this gap told that the card has no room for, kept in the chronicle's own order:
  // the card offers it as "and N more" rather than dropping it, since no later window can ever
  // reach these entries again (verdict round 3, S3). Also collapsed (`anchors` is the collapsed
  // list, not raw `entries`), so opening "and N more" never reveals the same card line twice either.
  const more = anchors.filter((e) => !shown.has(e.id)).slice(0, MAX_STORED_MORE).map(toLine);
  return {
    id: pageId(lines.map((l) => l.entryId)),
    title,
    createdAt,
    awayMs,
    fromMs,
    toMs,
    worldDays: worldDaysBetween(fromMs, toMs, periodSec),
    lines,
    more,
  };
}

/** The page store: every page ever shown, kept and reopenable, keyed by `pageId` (issue #42's
 * "list of pages already generated", the read API the chronicle ticket #60/#71 deferred here). */
export type PageStore = Record<string, StorybookPage>;

export const EMPTY_PAGE_STORE: PageStore = {};

/** Add a page if its id is new; pages are never dropped or overwritten once stored. */
export function addPage(store: PageStore, page: StorybookPage): PageStore {
  if (store[page.id]) return store;
  return { ...store, [page.id]: page };
}

/** Every chronicle entry id already told on some stored page. The store, not the chronicle's own
 * timestamps, is the record of what the player has already been shown (fix round 1 on #42).
 *
 * F3 (round 2): for a card repeated beyond `MAX_STORED_MORE` times in one gap, `lineEntryIds`
 * itself only names that many of them — the same accepted loss the page's own "and N more" cap
 * already carries for a gap that tells more lines than it keeps (this function's own header
 * comment, one paragraph up, on the pre-#113 cap). A telling this leaves out of every stored page
 * could in principle be told again as "new" by a later gap; nothing shipped comes close to the cap
 * on either axis today. */
export function pagedEntryIds(store: PageStore): Set<string> {
  const ids = new Set<string>();
  for (const page of Object.values(store)) {
    // both what the page shows and what it keeps behind "and N more": a page tells all of it.
    // `lineEntryIds` (#113), not `entryId` alone — a collapsed line's whole (capped) backing set
    // has to count as told, or a later gap would show a card's own earlier repeats as new again.
    for (const line of page.lines) for (const id of lineEntryIds(line)) ids.add(id);
    for (const line of page.more) for (const id of lineEntryIds(line)) ids.add(id);
  }
  return ids;
}

/** `entries` with anything already told on a stored page removed, so a new gap's page is built only
 * from entries no page has shown before — never a repeat of an earlier page, and never missing an
 * entry that truly is new to this gap. */
export function unseenEntries(entries: readonly ChronicleEntry[], store: PageStore): ChronicleEntry[] {
  const seen = pagedEntryIds(store);
  return entries.filter((e) => !seen.has(e.id));
}

/** Every stored page, newest first — the farm bar's "earlier pages" list. */
export function pagesNewestFirst(store: PageStore): StorybookPage[] {
  return Object.values(store).sort((a, b) => b.createdAt - a.createdAt);
}

function isLine(l: unknown): l is StorybookLine {
  const line = l as StorybookLine | null;
  if (!line || typeof line.entryId !== 'string' || typeof line.line !== 'string' || typeof line.picture !== 'string') return false;
  // #113: `entryIds` is optional (a page saved before it existed has none), but if it is there it
  // has to be a real, non-empty backing set — a malformed one is dropped like any other bad field,
  // rather than trusted into `lineEntryIds` as though this file had written it.
  if (line.entryIds !== undefined && !(Array.isArray(line.entryIds) && line.entryIds.length > 0 && line.entryIds.every((x) => typeof x === 'string'))) {
    return false;
  }
  // F3 (round 2): `count` is optional the same way, but when present it has to be a real, whole,
  // positive tally that is at least as large as the (possibly capped) `entryIds` it stands beside
  // — never smaller, which would claim fewer entries than are even named — rather than trusted
  // into `lineCount` as though this file had written it.
  if (
    line.count !== undefined &&
    !(typeof line.count === 'number' && Number.isInteger(line.count) && line.count >= 1 && line.count >= (line.entryIds?.length ?? 1))
  ) {
    return false;
  }
  return true;
}

/** Defensive parse for a page store coming off disk (localStorage, an imported save text): any
 * malformed entry is dropped rather than thrown on, so a hand-edited or older save still loads. */
export function parsePageStore(raw: unknown): PageStore {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: PageStore = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const p = v as Partial<StorybookPage> | null;
    if (
      p &&
      typeof p.id === 'string' &&
      typeof p.title === 'string' &&
      typeof p.createdAt === 'number' &&
      typeof p.awayMs === 'number' &&
      typeof p.fromMs === 'number' &&
      typeof p.toMs === 'number' &&
      Array.isArray(p.lines) &&
      p.lines.every(isLine)
    ) {
      // `more` and `worldDays` postdate the first pages: a page saved without them (or with a
      // malformed one) loads with no remainder and no world span rather than failing, and still
      // shows every line it did store. Built field by field, so nothing else off disk rides along.
      const more = Array.isArray(p.more) ? (p.more as unknown[]).filter(isLine) : [];
      const worldDays = typeof p.worldDays === 'number' && Number.isFinite(p.worldDays) ? { worldDays: p.worldDays } : {};
      out[id] = {
        id: p.id,
        title: p.title,
        createdAt: p.createdAt,
        awayMs: p.awayMs,
        fromMs: p.fromMs,
        toMs: p.toMs,
        ...worldDays,
        lines: p.lines,
        more,
      };
    }
  }
  return out;
}

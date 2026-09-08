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
}

export interface StorybookPage {
  /** Stable, derived from the entry ids it tells — see `pageId`. */
  id: string;
  title: string;
  /** wall-clock ms when the page was made */
  createdAt: number;
  /** wall-clock ms the farm was left alone */
  awayMs: number;
  fromMs: number;
  toMs: number;
  lines: StorybookLine[];
}

export const MAX_LINES = 5;

/**
 * Up to `max` entries, most notable first (the order `chronicleBetween` already returns), with one
 * adjustment: if every one of them came from a 'card' source and a non-card entry exists anywhere
 * in `entries`, the lowest-notability card entry is swapped for the highest-notability non-card one
 * not already picked — "a week reads as a shape... with at least one line from a non-card source
 * when one exists" (issue #42). Every source in the chronicle today is 'ledger', so this is a no-op
 * until the event engine (#82) starts telling cards; it is still exercised in the unit tests below
 * with a hand-built entry list, so the rule is proven ahead of that landing.
 */
export function selectLines(entries: readonly ChronicleEntry[], max = MAX_LINES): ChronicleEntry[] {
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

/**
 * One storybook page for a gap, or null when the chronicle has nothing to tell for it — the
 * storybook only tells, so a quiet gap gets no page rather than an invented "nothing happened"
 * line. `entries` should be `unseenEntries(chronicleBetween(state, fromMs, toMs), pageStore)` —
 * the gap's own chronicle window, with anything a stored page already told filtered out (fix round
 * 1 on #42: the sim's `tellLedgerDiff` stamps every entry of a gap at the instant the gap ends, the
 * same clock instant the next load's window starts from, so the raw window can repeat a previous
 * page's entries — the page store, not the timestamps, is what says what has already been shown).
 */
export function buildStorybookPage(
  entries: readonly ChronicleEntry[],
  awayMs: number,
  fromMs: number,
  toMs: number,
  createdAt: number,
  periodSec: number,
): StorybookPage | null {
  const chosen = selectLines(entries);
  if (chosen.length === 0) return null;
  const lines: StorybookLine[] = chosen.map((e) => ({ entryId: e.id, line: e.line, picture: e.picture }));
  return { id: pageId(lines.map((l) => l.entryId)), title: awayTitle(awayMs, fromMs, toMs, periodSec), createdAt, awayMs, fromMs, toMs, lines };
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
 * timestamps, is the record of what the player has already been shown (fix round 1 on #42). */
export function pagedEntryIds(store: PageStore): Set<string> {
  const ids = new Set<string>();
  for (const page of Object.values(store)) {
    for (const line of page.lines) ids.add(line.entryId);
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
      p.lines.every((l) => l && typeof l.entryId === 'string' && typeof l.line === 'string' && typeof l.picture === 'string')
    ) {
      out[id] = p as StorybookPage;
    }
  }
  return out;
}

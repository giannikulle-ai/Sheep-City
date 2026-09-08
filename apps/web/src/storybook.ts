// The storybook: what the app shows when the farm was left alone. Plan, section 2, "The chronicle
// and the storybook" — "The storybook is a selection over the chronicle for the time away, never
// new prose: the storybook only tells." Everything here is pure: reads `chronicleBetween`'s output
// and the catch-up's own numbers, and never invents a line of its own. The DOM side (the overlay,
// drawing each line's picture) is storybook-overlay.ts; persistence (the page store's place in the
// save envelope) is save.ts.
import type { ChronicleEntry } from '@sheepcliff/sim';

/** Sim ms in one virtual day, the same unit `dayMs(sim)` (packages/sim) is in: `periodSec * 1000`
 * of the clock's own `nowMs`, one full dawn-to-dawn cycle. */
const SIM_MINUTES_PER_DAY = 24 * 60;

/** `?gap=` (sim-minutes) and the "gap over ten sim-minutes" gate both need the same conversion: a
 * world's own day length turned into a sim-ms-per-sim-minute rate. */
export function simMinutesToMs(periodSec: number, minutes: number): number {
  return (periodSec * 1000 * minutes) / SIM_MINUTES_PER_DAY;
}

/** The done-means gate: "on load with a gap over ten sim-minutes". */
export const STORYBOOK_GATE_SIM_MINUTES = 10;

export function storybookGateMs(periodSec: number): number {
  return simMinutesToMs(periodSec, STORYBOOK_GATE_SIM_MINUTES);
}

const DAY_MS = 24 * 3600_000;
const DAY_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

/**
 * The time away in plain words, from real (wall-clock) milliseconds: "a night" under a day, small
 * counts spelled out ("three days"), "a week" at exactly seven, "over a week" short of two, and a
 * rounded week count beyond that. Never a number of hours or minutes — that is `awayLabel`'s job
 * (save.ts) for the finer-grained line, not the title.
 */
export function awayTitle(awayMs: number): string {
  const ms = Number.isFinite(awayMs) && awayMs > 0 ? awayMs : 0;
  if (ms < DAY_MS) return 'a night';
  const days = Math.round(ms / DAY_MS);
  if (days <= 1) return 'a night';
  if (days === 7) return 'a week';
  if (days > 7 && days < 14) return 'over a week';
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${DAY_WORDS[days] ?? days} days`;
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
 * line. `entries` should be `chronicleBetween(state, fromMs, toMs)`'s result (most notable first,
 * unlimited so `selectLines` can look past the top five for a non-card line).
 */
export function buildStorybookPage(
  entries: readonly ChronicleEntry[],
  awayMs: number,
  fromMs: number,
  toMs: number,
  createdAt: number,
): StorybookPage | null {
  const chosen = selectLines(entries);
  if (chosen.length === 0) return null;
  const lines: StorybookLine[] = chosen.map((e) => ({ entryId: e.id, line: e.line, picture: e.picture }));
  return { id: pageId(lines.map((l) => l.entryId)), title: awayTitle(awayMs), createdAt, awayMs, fromMs, toMs, lines };
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

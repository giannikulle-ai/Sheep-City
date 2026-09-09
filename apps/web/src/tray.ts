// The tray: a row of creature chips, the verbs the chosen one offers, and a status line.
// Portrait puts it under the scene; landscape slides it over the scene (CSS in index.html).
import { DEITY_WEATHER_KINDS, type Weather } from '@sheepcliff/sim';
import { verbsFor, whoList, type Verb, type Who, type WhoId } from './actions';

const WEATHER_IDS: readonly string[] = DEITY_WEATHER_KINDS;

export interface TrayEls {
  who: HTMLElement;
  verbs: HTMLElement;
  say: HTMLElement;
}

export interface Tray {
  select(id: WhoId): void;
  selected(): WhoId;
  /** the status line under the verbs */
  say(text: string, waiting?: boolean): void;
  /** Bumped on every `say` call. main.ts's deferred birthday line (#117 round 2) compares this
   * against the count it captured when it started waiting, to tell "nothing else has been said"
   * without keeping its own copy of the tray's text. */
  sayCount(): number;
  /** Whether the status line currently shows the "waiting" cue (a dispatched intent whose sim
   * reaction, or a `call` verb's stage tap, has not landed yet). */
  isWaiting(): boolean;
  /** rebuild the chips for a changed flock (a lamb grew up); keeps the selection when it still exists */
  setWhos(names: readonly string[], colors: readonly string[]): void;
  /**
   * Fix round 1 on issue #44 (the Verifier's blockers 1 and 2): read the sim's own weather every
   * frame instead of remembering the last tap, so a hold that expired on its own, or a fog flag set
   * while some other kind chip was showing, is never stale. Call once per frame, wherever the rest
   * of the tray is kept in sync with the sim (`syncControls`, main.ts).
   */
  syncWeather(weather: Weather, nowMs: number): void;
  whos: Who[];
}

export function buildTray(
  els: TrayEls,
  names: readonly string[],
  colors: readonly string[],
  onVerb: (verb: Verb) => void,
  onSelect: (id: WhoId) => void,
  dayLengthSec: () => number,
): Tray {
  let current: WhoId = 'luna';
  let chips: HTMLButtonElement[] = [];
  // The sim's own weather, refreshed every frame by `syncWeather` — the single source of truth for
  // which sky chip is lit. Never written from a click; a tap only ever sends an intent and waits
  // for the next frame's read to light the chip back up.
  let weather: Weather | null = null;
  let nowMs = 0;
  // Refreshed by renderVerbs whenever the sky's verbs are the ones on screen; empty otherwise, so
  // syncWeather has nothing to touch (and nothing to look up) while another chip is selected.
  let weatherButtons = new Map<string, HTMLButtonElement>();
  // #117 round 2: how many times `say` has written the status line, and whether the cue it wrote
  // last is "waiting" — read by main.ts's deferred birthday line via `sayCount`/`isWaiting` instead
  // of the tray keeping any state of its own about who is allowed to write next.
  let sayCalls = 0;

  /**
   * Whether a sky chip should read as lit right now: a kind chip (`sun`/`rain`/`snow`) only while a
   * deity hold on that exact kind is still running; `fog` is its own flag, independent of `kind`;
   * `clear` is an action, never lit — see the ticket and `applyWeather` (packages/sim/intents.ts).
   */
  function isLit(id: string): boolean {
    if (!weather) return false;
    if (id === 'clear') return false;
    if (id === 'fog') return weather.foggy === true;
    return weather.mode === 'manual' && weather.kind === id && weather.holdUntilMs !== undefined && weather.holdUntilMs > nowMs;
  }

  const tray: Tray = {
    select,
    selected: () => current,
    say(text, waiting = false) {
      sayCalls++;
      els.say.textContent = text;
      els.say.classList.toggle('waiting', waiting);
    },
    sayCount: () => sayCalls,
    isWaiting: () => els.say.classList.contains('waiting'),
    setWhos,
    syncWeather(w, now) {
      weather = w;
      nowMs = now;
      for (const [id, btn] of weatherButtons) btn.classList.toggle('on', isLit(id));
    },
    whos: [],
  };

  const renderVerbs = (): void => {
    const verbs = verbsFor(current, dayLengthSec());
    weatherButtons = new Map();
    els.verbs.replaceChildren(
      ...verbs.map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset['verb'] = v.id;
        b.textContent = v.label;
        const isWeatherChip = current === 'sky' && WEATHER_IDS.includes(v.id);
        if (isWeatherChip) {
          b.classList.toggle('on', isLit(v.id));
          weatherButtons.set(v.id, b);
        }
        b.addEventListener('click', () => {
          // A lit kind or a lit fog both mean "a deity hold is already doing this" (read fresh from
          // the sim, not from what the last click happened to be), so the tap clears it instead of
          // asking for it again. `fog` has no hold of its own to clear without touching `kind` (the
          // sim has no fog-only "off" — issue #43 sim ask, see the PR note), so it falls back to the
          // same full `clear` a lit kind chip sends, same as every other lit chip here.
          onVerb(isWeatherChip && isLit(v.id) ? (verbs.find((x) => x.id === 'clear') ?? v) : v);
        });
        return b;
      }),
    );
  };

  function setWhos(n: readonly string[], c: readonly string[]): void {
    tray.whos = whoList(n, c);
    chips = tray.whos.map((w) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset['who'] = w.id;
      if (w.color) {
        const swatch = document.createElement('i');
        swatch.style.background = w.color;
        b.append(swatch);
      }
      b.append(w.label);
      b.addEventListener('click', () => select(w.id));
      return b;
    });
    els.who.replaceChildren(...chips);
    select(tray.whos.some((w) => w.id === current) ? current : 'luna');
  }

  function select(id: WhoId): void {
    const changed = id !== current;
    current = id;
    for (const c of chips) c.classList.toggle('on', c.dataset['who'] === id);
    renderVerbs();
    // Only a real change closes an in-progress `call` (issue #44 fix round 1): `setWhos` reselects
    // the same id on every flock change (a lamb growing up), which must not interrupt one.
    if (changed) onSelect(id);
  }

  setWhos(names, colors);
  return tray;
}

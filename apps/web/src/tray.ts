// The tray: a row of creature chips, the verbs the chosen one offers, and a status line.
// Portrait puts it under the scene; landscape slides it over the scene (CSS in index.html).
import { DEITY_WEATHER_KINDS } from '@sheepcliff/sim';
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
  /** rebuild the chips for a changed flock (a lamb grew up); keeps the selection when it still exists */
  setWhos(names: readonly string[], colors: readonly string[]): void;
  whos: Who[];
}

export function buildTray(els: TrayEls, names: readonly string[], colors: readonly string[], onVerb: (verb: Verb) => void): Tray {
  let current: WhoId = 'luna';
  let chips: HTMLButtonElement[] = [];
  // Which sky weather chip the tray last tapped on, so a second tap on it clears the deity hold
  // instead of tapping it again (issue #44). Client-side only: it does not resync with a hold that
  // expired on its own or a weather change from elsewhere in the tray (see the PR's weak spots).
  let activeWeather: string | null = null;
  const tray: Tray = {
    select,
    selected: () => current,
    say(text, waiting = false) {
      els.say.textContent = text;
      els.say.classList.toggle('waiting', waiting);
    },
    setWhos,
    whos: [],
  };

  const renderVerbs = (): void => {
    const verbs = verbsFor(current);
    els.verbs.replaceChildren(
      ...verbs.map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset['verb'] = v.id;
        b.textContent = v.label;
        const isWeatherChip = current === 'sky' && WEATHER_IDS.includes(v.id);
        if (isWeatherChip) b.classList.toggle('on', v.id === activeWeather);
        b.addEventListener('click', () => {
          if (isWeatherChip) {
            if (v.id === activeWeather) {
              // second tap on the same chip: clear the deity hold instead of asking for it again
              activeWeather = null;
              const clear = verbs.find((x) => x.id === 'clear');
              onVerb(clear ?? v);
            } else {
              activeWeather = v.id === 'clear' ? null : v.id;
              onVerb(v);
            }
            renderVerbs();
            return;
          }
          onVerb(v);
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
    current = id;
    for (const c of chips) c.classList.toggle('on', c.dataset['who'] === id);
    renderVerbs();
  }

  setWhos(names, colors);
  return tray;
}

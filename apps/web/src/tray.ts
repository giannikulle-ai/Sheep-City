// The tray: a row of creature chips, the verbs the chosen one offers, and a status line.
// Portrait puts it under the scene; landscape slides it over the scene (CSS in index.html).
import { verbsFor, whoList, type Verb, type Who, type WhoId } from './actions';

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
  whos: Who[];
}

export function buildTray(els: TrayEls, names: readonly string[], colors: readonly string[], onVerb: (verb: Verb) => void): Tray {
  const whos = whoList(names, colors);
  let current: WhoId = 'luna';

  const renderVerbs = (): void => {
    els.verbs.replaceChildren(
      ...verbsFor(current).map((v) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset['verb'] = v.id;
        b.textContent = v.label;
        b.addEventListener('click', () => onVerb(v));
        return b;
      }),
    );
  };

  const chips = whos.map((w) => {
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

  function select(id: WhoId): void {
    current = id;
    for (const c of chips) c.classList.toggle('on', c.dataset['who'] === id);
    renderVerbs();
  }

  select(current);
  return {
    select,
    selected: () => current,
    say(text, waiting = false) {
      els.say.textContent = text;
      els.say.classList.toggle('waiting', waiting);
    },
    whos,
  };
}

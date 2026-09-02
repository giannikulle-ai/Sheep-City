// The pin comment overlay, carried over from the prototype: "add comments" freezes the farm,
// a tap drops a numbered pin, the list below holds one note per pin with its coordinates, and
// "show as text" opens an in-page modal with the markdown. Clipboard and downloads are blocked
// in the owner's viewer, so the modal is the export, not a fallback.
import { WORLD_H, WORLD_W, type FarmView } from '@sheepcliff/render';
import type { SpriteSizes } from './hit';
import { describeAt, parsePins, PINS_KEY, pinLine, pinsMarkdown, pinWorld, type Pin } from './pins';

export interface PinOverlayEls {
  stage: HTMLElement;
  pins: HTMLElement;
  notes: HTMLElement;
  mode: HTMLButtonElement;
  freeze: HTMLButtonElement;
  text: HTMLButtonElement;
  png: HTMLButtonElement;
  clear: HTMLButtonElement;
  modal: HTMLElement;
  modalBox: HTMLElement;
  frozen: HTMLElement;
  world: HTMLCanvasElement;
  ui: HTMLCanvasElement;
}

export interface PinOverlayDeps {
  view(): FarmView;
  sizes(): SpriteSizes;
  setFrozen(frozen: boolean): void;
  isFrozen(): boolean;
}

export class PinOverlay {
  pins: Pin[] = [];
  commenting = false;

  constructor(
    private readonly els: PinOverlayEls,
    private readonly deps: PinOverlayDeps,
  ) {
    try {
      this.pins = parsePins(localStorage.getItem(PINS_KEY));
    } catch {
      this.pins = [];
    }
    els.mode.addEventListener('click', () => this.setCommenting(!this.commenting));
    els.freeze.addEventListener('click', () => this.setFrozen(!deps.isFrozen()));
    els.pins.addEventListener('click', (e) => this.onStageClick(e));
    els.text.addEventListener('click', () => void this.showText());
    els.png.addEventListener('click', () => this.showPng());
    els.clear.addEventListener('click', () => {
      if (this.pins.length && confirm('Clear all pins?')) {
        this.pins = [];
        this.save();
        this.render();
      }
    });
    els.modal.addEventListener('click', (e) => {
      if (e.target === els.modal) this.closeModal();
    });
    this.syncFrozen();
    this.render();
  }

  list(): Pin[] {
    return this.pins.map((p) => ({ ...p }));
  }

  markdown(): string {
    const v = this.deps.view();
    return pinsMarkdown(this.pins, v.clockT, v.weather);
  }

  setCommenting(on: boolean): void {
    this.commenting = on;
    this.els.mode.classList.toggle('on', on);
    this.els.mode.textContent = on ? 'done pinning' : 'add pins';
    this.els.stage.classList.toggle('commenting', on);
    if (on) this.setFrozen(true);
    this.render();
  }

  setFrozen(frozen: boolean): void {
    this.deps.setFrozen(frozen);
    this.syncFrozen();
  }

  /** Reflect the game's frozen flag in the button and the corner label. */
  syncFrozen(): void {
    const f = this.deps.isFrozen();
    this.els.freeze.classList.toggle('on', f);
    this.els.freeze.textContent = f ? 'unfreeze' : 'freeze';
    this.els.frozen.hidden = !f;
  }

  /** Drop a pin at a stage-relative point (fractions 0..1). */
  drop(fx: number, fy: number): Pin {
    const x = Math.min(1, Math.max(0, fx));
    const y = Math.min(1, Math.max(0, fy));
    const near = describeAt(this.deps.view(), x * WORLD_W, y * WORLD_H, this.deps.sizes());
    const pin: Pin = { x, y, text: '', near, time: new Date().toISOString() };
    this.pins.push(pin);
    this.save();
    this.render(true);
    return pin;
  }

  private onStageClick(e: MouseEvent): void {
    if (!this.commenting || (e.target instanceof HTMLElement && e.target.classList.contains('pin'))) return;
    const r = this.els.pins.getBoundingClientRect();
    this.drop((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }

  private save(): void {
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(this.pins));
    } catch {
      // storage blocked: pins live for the page only
    }
  }

  render(focusLast = false): void {
    const { pins, notes } = this.els;
    pins.replaceChildren();
    notes.replaceChildren();
    this.pins.forEach((c, i) => {
      const p = document.createElement('div');
      p.className = 'pin';
      p.textContent = String(i + 1);
      p.style.left = `${c.x * 100}%`;
      p.style.top = `${c.y * 100}%`;
      p.title = c.text || '(empty)';
      p.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const ta = notes.querySelectorAll('textarea')[i];
        if (ta) {
          ta.focus();
          ta.scrollIntoView({ block: 'nearest' });
        }
      });
      pins.appendChild(p);

      const { x, y } = pinWorld(c);
      const n = document.createElement('div');
      n.className = 'note';
      const num = document.createElement('b');
      num.textContent = String(i + 1);
      const ta = document.createElement('textarea');
      ta.placeholder = `${c.near ? `near ${c.near} — ` : ''}what's wrong here?`;
      ta.value = c.text;
      ta.addEventListener('input', () => {
        c.text = ta.value;
        p.title = c.text;
        this.save();
      });
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = `(${x}, ${y})`;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'remove this pin';
      del.addEventListener('click', () => {
        this.pins.splice(i, 1);
        this.save();
        this.render();
      });
      n.append(num, ta, where, del);
      notes.appendChild(n);
    });
    notes.classList.toggle('show', this.commenting || this.pins.length > 0);
    if (focusLast) {
      const tas = notes.querySelectorAll('textarea');
      tas[tas.length - 1]?.focus();
    }
  }

  private openModal(children: HTMLElement[]): void {
    const { modalBox, modal } = this.els;
    modalBox.replaceChildren(...children);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'close';
    close.addEventListener('click', () => this.closeModal());
    modalBox.appendChild(close);
    modal.classList.add('show');
  }

  closeModal(): void {
    this.els.modal.classList.remove('show');
  }

  /** The markdown in a modal textarea; a clipboard copy is attempted but never relied on. */
  async showText(): Promise<void> {
    const md = this.markdown();
    let copied = false;
    try {
      await navigator.clipboard.writeText(md);
      copied = true;
    } catch {
      copied = false;
    }
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = copied
      ? 'Copied to the clipboard. It is also here if you need it:'
      : 'The clipboard is blocked in this viewer: select the text below and copy it.';
    const ta = document.createElement('textarea');
    ta.id = 'pinText';
    ta.readOnly = true;
    ta.value = md;
    this.openModal([hint, ta]);
    ta.focus();
    ta.select();
  }

  /** The annotated frame as an in-page image (long-press to save), plus a download link for viewers that allow it. */
  showPng(): void {
    const S = 2;
    const rows = this.pins.length ? 16 * S * (this.pins.length + 1) : 0;
    const out = document.createElement('canvas');
    out.width = WORLD_W * S;
    out.height = WORLD_H * S + rows;
    const c = out.getContext('2d');
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#2b1d17';
    c.fillRect(0, 0, out.width, out.height);
    c.drawImage(this.els.world, 0, 0, WORLD_W * S, WORLD_H * S);
    c.drawImage(this.els.ui, 0, 0, WORLD_W * S, WORLD_H * S);
    c.font = `bold ${7 * S}px ui-monospace, Menlo, monospace`;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    this.pins.forEach((p, i) => {
      const x = p.x * WORLD_W * S;
      const y = p.y * WORLD_H * S;
      c.fillStyle = '#2b1d17';
      c.beginPath();
      c.arc(x, y - 7 * S, 6.5 * S, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffd75e';
      c.beginPath();
      c.arc(x, y - 7 * S, 5.5 * S, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2b1d17';
      c.fillText(String(i + 1), x, y - 7 * S);
    });
    c.textAlign = 'left';
    c.font = `${6 * S}px ui-monospace, Menlo, monospace`;
    c.fillStyle = '#f6f2e8';
    this.pins.forEach((p, i) => c.fillText(pinLine(p, i).slice(0, 110), 8 * S, WORLD_H * S + 16 * S * (i + 1)));
    let url: string;
    try {
      url = out.toDataURL('image/png');
    } catch {
      const msg = document.createElement('div');
      msg.className = 'hint';
      msg.textContent = 'Could not render the PNG in this viewer.';
      this.openModal([msg]);
      return;
    }
    const img = new Image();
    img.src = url;
    img.alt = 'annotated farm';
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Long-press (or right-click) the image to save it. The download link works outside sandboxed viewers.';
    const dl = document.createElement('a');
    dl.href = url;
    dl.download = 'sheepcliff-pins.png';
    dl.textContent = 'download PNG';
    this.openModal([hint, img, dl]);
  }
}

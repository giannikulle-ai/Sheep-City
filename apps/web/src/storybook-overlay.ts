// The storybook page: a card of past-tense lines with a small picture each, shown when the farm
// catches up on a real gap. One tap anywhere, or a swipe, dismisses it — except on the "and N more"
// row, which opens the rest of the gap's lines in the same card. Portrait and landscape both use
// the same markup: a fixed, full-viewport backdrop above the pin modal, with a centred card sized
// by the same CSS that already makes the stage responsive in both orientations (index.html).
import { drawPicture, pictureFor, type Backgrounds, type Sheet } from '@sheepcliff/render';
import { awayLabel } from './save';
import { worldTimeLabel, type StorybookLine, type StorybookPage } from './storybook';

export interface StorybookOverlayEls {
  root: HTMLElement;
  title: HTMLElement;
  subtitle: HTMLElement;
  lines: HTMLElement;
}

export interface StorybookOverlayDeps {
  sheet: Sheet;
  backgrounds: Backgrounds;
}

/** Native pixel size of each line's picture; CSS may scale the canvas up (`image-rendering:
 * pixelated`), the draw itself never does. */
export const PICTURE_W = 56;
export const PICTURE_H = 40;

export class StorybookOverlay {
  private page: StorybookPage | null = null;

  constructor(
    private readonly els: StorybookOverlayEls,
    private readonly deps: StorybookOverlayDeps,
  ) {
    // One tap or swipe dismisses the page, anywhere on it: a pointerdown that was followed by a
    // pointerup over the page covers both a tap and a swipe (touch or mouse) without needing to
    // measure the gesture — there is nothing else on the page to interact with.
    els.root.addEventListener('pointerdown', () => this.hide());
  }

  /** The page on screen, or the last one shown after it is dismissed — for QA and e2e. */
  current(): StorybookPage | null {
    return this.page;
  }

  get visible(): boolean {
    return !this.els.root.hidden;
  }

  show(page: StorybookPage): void {
    this.page = page;
    const { root, title, subtitle, lines } = this.els;
    title.textContent = `while you were gone: ${page.title}`;
    subtitle.textContent = subtitleFor(page);
    const rows = page.lines.map((l) => this.lineEl(l));
    if (page.more.length > 0) rows.push(this.moreEl(page.more));
    lines.replaceChildren(...rows);
    root.hidden = false;
  }

  hide(): void {
    this.els.root.hidden = true;
  }

  /** The one row that is not a chronicle line: how many of this gap's lines the card has not shown,
   * and a tap to open them in place. It says a number and nothing else — the lines it reveals are
   * the chronicle's own, rendered exactly as the ones above them. */
  private moreEl(more: readonly StorybookLine[]): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'storyMore';
    btn.className = 'storymore';
    btn.textContent = `and ${more.length} more`;
    // The overlay dismisses on any pointerdown (the handler on #storybook itself); this row is the
    // one exception, since its whole job is to open the rest of the page rather than close it.
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.replaceWith(...more.map((l) => this.lineEl(l)));
    });
    return btn;
  }

  private lineEl(l: StorybookLine): HTMLElement {
    const row = document.createElement('div');
    row.className = 'storyline';
    const canvas = document.createElement('canvas');
    canvas.width = PICTURE_W;
    canvas.height = PICTURE_H;
    canvas.className = 'storypic';
    const ctx = canvas.getContext('2d');
    const picture = pictureFor(l.picture);
    if (ctx) {
      if (picture) {
        drawPicture(ctx, this.deps.sheet, this.deps.backgrounds, picture, PICTURE_W, PICTURE_H);
      } else {
        ctx.fillStyle = '#1b2c18';
        ctx.fillRect(0, 0, PICTURE_W, PICTURE_H);
      }
    }
    const text = document.createElement('span');
    text.textContent = l.line;
    row.append(canvas, text);
    return row;
  }
}

/** The card's subtitle: the same absence measured twice — the real time away, as the save's own
 * wall clock recorded it, and the world time, the same gap through the farm's own day length
 * (`worldDaysBetween`, stored on the page as `worldDays` from the bounds the title reads). Two
 * measurements of one gap, so they cannot disagree; neither says anything about what happened,
 * which only the chronicle's own lines may say. A page stored before the world span existed shows
 * the real span alone rather than a number made up for it now. */
export function subtitleFor(page: StorybookPage): string {
  const real = awayLabel(page.awayMs);
  return page.worldDays === undefined ? real : `${real} · ${worldTimeLabel(page.worldDays)}`;
}

/** The farm bar's "earlier pages" list: newest first, each opening the overlay on that page.
 * Shares the pin overlay's in-page modal (main.ts) rather than a second one. */
export function earlierPagesList(pages: readonly StorybookPage[], onOpen: (page: StorybookPage) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'pagelist';
  if (pages.length === 0) {
    const p = document.createElement('div');
    p.className = 'hint';
    p.textContent = 'no earlier pages yet';
    wrap.append(p);
    return wrap;
  }
  for (const page of pages) {
    const b = document.createElement('button');
    b.type = 'button';
    const when = new Date(page.createdAt);
    b.textContent = `${page.title} — ${Number.isNaN(when.getTime()) ? '' : when.toLocaleString()}`;
    b.addEventListener('click', () => onOpen(page));
    wrap.append(b);
  }
  return wrap;
}

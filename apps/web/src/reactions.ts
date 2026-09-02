// Anticipation cues. Every deity power shows something within a second (charter); when the sim's
// own reaction is slower, or the sim has no rule yet, the client shows a bubble, a name tag, or
// the stick on the grass. These are overlays on the view, never changes to the world.
import { woolLevel, type FarmView, type IconName } from '@sheepcliff/render';
import { sheepId, sheepIndex, type ClientIntent } from './intents';

export interface Cue {
  /** 'luna', a sheep id, 'farmer', or 'merchant' */
  target: string;
  icon: IconName | null;
  iconUntil: number;
  tagUntil: number;
}

export interface Reactions {
  cues: Cue[];
  stick: { x: number; y: number; until: number } | null;
}

export const emptyReactions = (): Reactions => ({ cues: [], stick: null });

/** The prototype's bubble and tag timings. */
const HEART_MS = 1600;
const SHEARS_MS = 1200;
const BANG_MS = 1200;
const TAG_MS = 1800;
const STICK_MS = 2500;

function cue(target: string, icon: IconName | null, now: number, iconMs: number): Cue {
  return { target, icon, iconUntil: now + iconMs, tagUntil: now + TAG_MS };
}

/** The cues one intent adds. Pure: returns a new Reactions. */
export function react(r: Reactions, intent: ClientIntent, view: FarmView, now: number): Reactions {
  const cues = [...r.cues];
  let stick = r.stick;
  const everySheep = view.sheep.map((_, i) => sheepId(i));
  switch (intent.type) {
    case 'pet':
      for (const t of intent.target === 'flock' ? everySheep : [intent.target]) cues.push(cue(t, 'heart', now, HEART_MS));
      break;
    case 'shear': {
      const targets =
        intent.target === 'flock'
          ? everySheep.filter((_, i) => woolLevel(view.sheep[i]?.wool ?? 0) === 2)
          : [intent.target];
      for (const t of targets) cues.push(cue(t, 'shears', now, SHEARS_MS));
      break;
    }
    case 'throwStick':
      stick = { x: intent.x, y: intent.y, until: now + STICK_MS };
      cues.push(cue('luna', null, now, 0));
      break;
    case 'dlAction':
      cues.push(cue('luna', 'bang', now, BANG_MS));
      break;
    case 'sheepAction':
      if (intent.target === 'flock') for (const t of everySheep) cues.push(cue(t, null, now, 0));
      else cues.push(cue(intent.target, 'bang', now, BANG_MS));
      break;
    case 'farmAction':
      if (intent.action === 'farmer' && view.farmer) cues.push(cue('farmer', 'bang', now, BANG_MS));
      if (intent.action === 'merchant' && view.merchant) cues.push(cue('merchant', 'bang', now, BANG_MS));
      break;
    case 'setWeather':
    case 'setSeason':
    case 'setClock':
    case 'pauseClock':
    case 'setPeriod':
      // the sim answers these on its next tick, well inside a second
      break;
  }
  return { cues, stick };
}

/** Drop cues nobody can see any more. */
export function prune(r: Reactions, now: number): Reactions {
  const cues = r.cues.filter((c) => now < c.iconUntil || now < c.tagUntil);
  const stick = r.stick && now < r.stick.until ? r.stick : null;
  return cues.length === r.cues.length && stick === r.stick ? r : { cues, stick };
}

/** Paint the cues onto a view (in place; the view is this frame's private copy). */
export function applyReactions(view: FarmView, r: Reactions, now: number): FarmView {
  for (const c of r.cues) {
    const showIcon = c.icon && now < c.iconUntil ? c.icon : null;
    if (c.target === 'luna') {
      if (showIcon) view.luna.icon = showIcon;
      view.luna.tagUntil = Math.max(view.luna.tagUntil, c.tagUntil);
      continue;
    }
    if (c.target === 'farmer' || c.target === 'merchant') {
      const n = view[c.target];
      if (n && showIcon) {
        n.icon = showIcon;
        n.iconUntil = Math.max(n.iconUntil, c.iconUntil);
      }
      continue;
    }
    const i = sheepIndex(c.target);
    const s = i === null ? undefined : view.sheep[i];
    if (!s) continue;
    if (showIcon) {
      s.icon = showIcon;
      s.iconUntil = Math.max(s.iconUntil, c.iconUntil);
    }
    s.tagUntil = Math.max(s.tagUntil, c.tagUntil);
  }
  if (r.stick && now < r.stick.until) view.stick = { x: r.stick.x, y: r.stick.y };
  return view;
}

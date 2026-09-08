// Anticipation cues. Every deity power shows something within a second (charter); when the sim's
// own reaction is slower, or the sim has no rule yet, the client shows a bubble, a name tag, or
// the stick on the grass. These are overlays on the view, never changes to the world.
import { RING_MS, SKY_RIPPLE_MS, woolLevel, type FarmView, type IconName } from '@sheepcliff/render';
import { sheepId, sheepIndex, type ClientIntent } from './intents';

export interface Cue {
  /** 'luna', a sheep id, 'farmer', or 'merchant' */
  target: string;
  icon: IconName | null;
  iconUntil: number;
  tagUntil: number;
}

/** A deity `act` flourish (issue #44): a ring at `target` ('luna' or a sheep id) until `until`. */
export interface Ring {
  target: string;
  until: number;
}

export interface Reactions {
  cues: Cue[];
  stick: { x: number; y: number; until: number } | null;
  /** deity `act` flourishes in flight, one per tap (a second tap on the same creature adds another) */
  rings: Ring[];
  /** deity `weather` flourish: the sky ripple's render-clock deadline, or 0 when none is showing */
  rippleUntil: number;
}

export const emptyReactions = (): Reactions => ({ cues: [], stick: null, rings: [], rippleUntil: 0 });

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
    case 'tap':
    case 'setWeather':
    case 'setSeason':
    case 'setClock':
    case 'pauseClock':
    case 'setPeriod':
    case 'weather':
    case 'act':
    case 'callTarget':
      // the sim answers these on its next tick, well inside a second; the deity ones (`weather`,
      // `act`) get their own flourish below instead of a cue, since a cue only ever draws an
      // existing icon and `callTarget` sends nothing to the sim at all
      break;
  }
  return { cues, stick, rings: r.rings, rippleUntil: r.rippleUntil };
}

/**
 * The flourish one intent adds (issue #44): a sky ripple for a deity `weather` tap, a ring at the
 * target for a deity `act`. Unlike `react` above, this runs for every dispatch regardless of
 * whether the sim already understands the intent — the flourish is the power's own feel, not a
 * stand-in for a cue the sim will supersede.
 */
export function flourish(r: Reactions, intent: ClientIntent, now: number): Reactions {
  if (intent.type === 'weather') return { ...r, rippleUntil: now + SKY_RIPPLE_MS };
  if (intent.type === 'act') return { ...r, rings: [...r.rings, { target: intent.target, until: now + RING_MS }] };
  return r;
}

/** Drop cues, rings, and the ripple nobody can see any more. */
export function prune(r: Reactions, now: number): Reactions {
  const cues = r.cues.filter((c) => now < c.iconUntil || now < c.tagUntil);
  const stick = r.stick && now < r.stick.until ? r.stick : null;
  const rings = r.rings.filter((g) => now < g.until);
  const rippleUntil = now < r.rippleUntil ? r.rippleUntil : 0;
  if (cues.length === r.cues.length && stick === r.stick && rings.length === r.rings.length && rippleUntil === r.rippleUntil) return r;
  return { cues, stick, rings, rippleUntil };
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
  for (const g of r.rings) {
    if (now >= g.until) continue;
    if (g.target === 'luna') {
      view.luna.ringUntil = Math.max(view.luna.ringUntil ?? 0, g.until);
      continue;
    }
    const i = sheepIndex(g.target);
    const s = i === null ? undefined : view.sheep[i];
    if (s) s.ringUntil = Math.max(s.ringUntil ?? 0, g.until);
  }
  if (r.rippleUntil > now) view.skyRippleUntil = Math.max(view.skyRippleUntil ?? 0, r.rippleUntil);
  return view;
}

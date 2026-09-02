// Noticeable moments, found by comparing two sim states (the state before and after a tick). The
// QA watch test counts these (contract: tools/qa/README.md); the client emits them on transitions
// only, and detects the same things the QA lane's prototype probe does, from the same fields.
import { phaseOf, type SimState } from '@sheepcliff/sim';

export type MomentKind = 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit';

export interface Moment {
  kind: MomentKind;
  actor?: string;
  detail?: string;
  t?: number;
}

/** DL animations that read as a trick when they start (the probe's DL_TRICKS). */
const TRICKS: Record<string, string> = { flop: 'flop', stick: 'stick', nibble: 'nibble', stretch: 'stretch' };

interface Carrier {
  icon: string | null;
  iconUntilMs: number;
}

/** A bubble is showing when it has an icon with a live timer (DL's untimed fetch heart counts too). */
const bubbleOf = (c: Carrier | null | undefined, now: number): string | null =>
  c && c.icon && (c.iconUntilMs === 0 || now < c.iconUntilMs) ? c.icon : null;

/** The same icon with the same deadline is the same bubble; a fresh timer is a new one. */
const bubbleKey = (c: Carrier | null | undefined, now: number): string | null => {
  const icon = bubbleOf(c, now);
  return icon ? `${icon}@${c?.iconUntilMs ?? 0}` : null;
};

const lambCount = (s: SimState): number => s.sheep.reduce((n, q) => n + q.lambs.length, 0);

export function diffMoments(prev: SimState | null, next: SimState): Moment[] {
  const out: Moment[] = [];
  if (!prev) return out;
  const t = next.clock.t;
  const now = next.clock.nowMs;
  if (prev.weather.kind !== next.weather.kind) out.push({ kind: 'weather', actor: 'sky', detail: next.weather.kind, t });
  const phase = phaseOf(next.clock.t);
  if (phaseOf(prev.clock.t) !== phase) out.push({ kind: 'phase', actor: 'sky', detail: phase, t });

  // NPC arrivals
  if (next.npcs.farmer && !prev.npcs.farmer) out.push({ kind: 'npc-arrival', actor: 'farmer', detail: 'farmer', t });
  if (next.npcs.merchant && !prev.npcs.merchant) out.push({ kind: 'npc-arrival', actor: 'merchant', detail: 'merchant', t });

  // lambs: born, and grown into a named sheep
  if (lambCount(next) > lambCount(prev)) out.push({ kind: 'lamb', actor: 'flock', detail: 'born', t });
  if (next.sheep.length > prev.sheep.length) out.push({ kind: 'lamb', actor: 'flock', detail: 'grown', t });

  // Digital Luna tricks: idle play, riding, rabbit chase, fetch
  const l = next.luna;
  const pl = prev.luna;
  if (l.anim !== pl.anim && TRICKS[l.anim] && !l.inBarn) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: TRICKS[l.anim] as string, t });
  if (l.riding && !pl.riding) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: 'ride', t });
  if (l.chasing && !pl.chasing) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: 'rabbit-chase', t });
  if (l.stick && !pl.stick) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: 'fetch', t });

  // bubbles: an icon with a live timer on a sheep, DL, or an NPC, once per timer
  const prevSheep = new Map(prev.sheep.map((s) => [s.id, s]));
  const carriers: [string, Carrier | null, Carrier | null | undefined][] = [
    ['Digital Luna', l, pl],
    ...next.sheep.map((s): [string, Carrier, Carrier | undefined] => [s.name, s, prevSheep.get(s.id)]),
    ['farmer', next.npcs.farmer, prev.npcs.farmer],
    ['merchant', next.npcs.merchant, prev.npcs.merchant],
  ];
  for (const [name, c, p] of carriers) {
    const key = bubbleKey(c, now);
    if (key && key !== bubbleKey(p, prev.clock.nowMs)) out.push({ kind: 'bubble', actor: name, detail: bubbleOf(c, now) as string, t });
  }

  // small life (logged, not counted): a bird landing, a rabbit crossing without a chase
  const birdSit = next.life.bird?.state === 'sit';
  if (birdSit && prev.life.bird?.state !== 'sit') out.push({ kind: 'bird', actor: 'bird', detail: 'land', t });
  if (next.life.rabbit && !prev.life.rabbit && !l.chasing) out.push({ kind: 'rabbit', actor: 'rabbit', detail: 'cross', t });
  return out;
}

/** Dispatch on document with bubbling, so listeners on document and on window both hear it. */
export function emitMoment(m: Moment): void {
  document.dispatchEvent(new CustomEvent('moment', { bubbles: true, detail: m }));
}

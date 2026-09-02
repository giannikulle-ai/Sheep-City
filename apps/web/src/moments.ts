// Noticeable moments, found by comparing two frames' views. The QA watch test counts these
// (contract: tools/qa/README.md); the client emits them on transitions only.
import { phaseOf, type FarmView } from '@sheepcliff/render';

export type MomentKind = 'bubble' | 'npc-arrival' | 'weather' | 'dl-trick' | 'lamb' | 'phase' | 'bird' | 'rabbit';

export interface Moment {
  kind: MomentKind;
  actor?: string;
  detail?: string;
  t?: number;
}

/** DL animations that read as a trick when they start. */
const TRICKS = new Set(['flop', 'stick', 'nibble', 'stretch', 'sleep', 'pant', 'tilt', 'bound', 'trundle', 'fetch']);

const iconAt = (icon: string | null, until: number, now: number): string | null => (icon && now < until ? icon : null);

export function diffMoments(prev: FarmView | null, next: FarmView, now: number): Moment[] {
  const out: Moment[] = [];
  const t = next.clockT;
  if (!prev) return out;
  if (prev.weather !== next.weather) out.push({ kind: 'weather', actor: 'sky', detail: next.weather, t });
  const phase = phaseOf(next.clockT);
  if (phaseOf(prev.clockT) !== phase) out.push({ kind: 'phase', actor: 'sky', detail: phase, t });

  const prevSheep = new Map(prev.sheep.map((s) => [s.name, s]));
  let lambsBefore = 0;
  for (const s of prev.sheep) lambsBefore += s.lambs.length;
  let lambsNow = 0;
  for (const s of next.sheep) {
    lambsNow += s.lambs.length;
    const was = prevSheep.get(s.name);
    const icon = iconAt(s.icon, s.iconUntil, now);
    if (icon && icon !== (was ? iconAt(was.icon, was.iconUntil, now) : null)) out.push({ kind: 'bubble', actor: s.name, detail: icon, t });
  }
  if (lambsNow > lambsBefore) out.push({ kind: 'lamb', actor: 'flock', detail: 'born', t });
  if (next.sheep.length > prev.sheep.length) out.push({ kind: 'lamb', actor: 'flock', detail: 'grown', t });

  if (next.luna.icon && next.luna.icon !== prev.luna.icon) out.push({ kind: 'bubble', actor: 'Digital Luna', detail: next.luna.icon, t });
  if (next.luna.anim !== prev.luna.anim && TRICKS.has(next.luna.anim)) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: next.luna.anim, t });
  if (next.luna.riding && !prev.luna.riding) out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: 'ride', t });
  if (next.rabbit && !prev.rabbit && next.luna.anim === 'run') out.push({ kind: 'dl-trick', actor: 'Digital Luna', detail: 'rabbit-chase', t });

  for (const who of ['farmer', 'merchant'] as const) {
    const n = next[who];
    const p = prev[who];
    if (n && !p) out.push({ kind: 'npc-arrival', actor: who, detail: who, t });
    if (n) {
      const icon = iconAt(n.icon, n.iconUntil, now);
      if (icon && icon !== (p ? iconAt(p.icon, p.iconUntil, now) : null)) out.push({ kind: 'bubble', actor: who, detail: icon, t });
    }
  }
  if (next.bird && !prev.bird) out.push({ kind: 'bird', actor: 'bird', detail: 'land', t });
  if (next.rabbit && !prev.rabbit) out.push({ kind: 'rabbit', actor: 'rabbit', detail: 'cross', t });
  return out;
}

/** Dispatch on document with bubbling, so listeners on document and on window both hear it. */
export function emitMoment(m: Moment): void {
  document.dispatchEvent(new CustomEvent('moment', { bubbles: true, detail: m }));
}

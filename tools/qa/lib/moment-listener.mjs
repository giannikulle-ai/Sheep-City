// The one piece of the watch test that talks to the page.
//
// Contract (see tools/qa/README.md): the client dispatches
//   window.dispatchEvent(new CustomEvent('moment', { detail: { kind, actor?, detail?, t? } }))
// for every noticeable moment. This init script forwards each event to Node.
// It runs before any page script, so no moment is missed.
export const MOMENT_BRIDGE = String.raw`
  window.addEventListener('moment', (e) => {
    const d = (e && e.detail) || {};
    if (typeof window.__sheepcliffMoment === 'function') {
      window.__sheepcliffMoment({
        kind: String(d.kind ?? 'unknown'),
        actor: d.actor == null ? null : String(d.actor),
        detail: d.detail == null ? null : String(d.detail),
        t: typeof d.t === 'number' ? d.t : null,
      });
    }
  });
`;

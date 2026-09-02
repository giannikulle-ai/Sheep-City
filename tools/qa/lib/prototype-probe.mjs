// Prototype adapter: prototype/luna-farm/build/farm_sim.html does not emit
// `moment` events, so this script is injected after load and synthesises them
// by watching the sim's page-level state and DOM. Every detection below maps
// to something a person watching the canvas would actually notice.
//
// Kinds are the same ones the client will emit (tools/qa/README.md), so the
// watch-test core does not know which adapter produced a moment.
//
// The prototype is a classic <script>, so its top-level `let`/`const` bindings
// (sheep, luna, weather, farmer, merchant, rabbit, bird, stickThrow, clock) are
// reachable from an injected script by name. Weather is also read from the DOM
// (`button[data-w].on`) so a state/DOM disagreement shows up as a failure.
export const PROTOTYPE_PROBE = String.raw`
(() => {
  if (window.__sheepcliffProbe) return;
  const emit = (kind, actor, detail) => {
    window.dispatchEvent(new CustomEvent('moment', { detail: { kind, actor, detail, t: clock.t } }));
  };
  const domWeather = () => {
    const on = document.querySelector('button[data-w].on');
    return on ? on.dataset.w : null;
  };
  const DL_TRICKS = { flop: 'flop', stick: 'stick', nibble: 'nibble', stretch: 'stretch' };
  const lambCount = () => sheep.reduce((n, s) => n + s.lambs.length, 0);
  const prev = {
    weather, domWeather: domWeather(), phase: phaseOf(clock.t),
    farmer: !!farmer, merchant: !!merchant, rabbit: !!rabbit, birdSit: !!(bird && bird.state === 'sit'),
    lambs: lambCount(), sheepCount: sheep.length, riding: !!luna.riding, chasing: !!luna.chasing,
    fetch: !!stickThrow, anim: luna.anim, inBarn: !!luna.inBarn,
    bubbles: new Map(), // key -> iconUntil
    shears: new Set(),
  };
  const state = { ticks: 0, errors: [] };
  window.__sheepcliffProbe = state;
  const poll = () => {
    try {
      const now = performance.now();
      // weather change (state + DOM must agree; the DOM is what a viewer sees)
      const dw = domWeather();
      if (weather !== prev.weather) { emit('weather', 'sky', weather); prev.weather = weather; }
      if (dw !== prev.domWeather) { prev.domWeather = dw; if (dw !== weather) state.errors.push('weather DOM/state mismatch: ' + dw + ' vs ' + weather); }
      // clock phase (logged, not counted: the clock guarantees it)
      const ph = phaseOf(clock.t);
      if (ph !== prev.phase) { emit('phase', 'sky', ph); prev.phase = ph; }
      // NPC arrivals
      if (!!farmer !== prev.farmer) { prev.farmer = !!farmer; if (farmer) emit('npc-arrival', 'farmer', 'farmer'); }
      if (!!merchant !== prev.merchant) { prev.merchant = !!merchant; if (merchant) emit('npc-arrival', 'merchant', 'merchant'); }
      // lambs: born, and grown into a named sheep
      const lambs = lambCount();
      if (lambs > prev.lambs) emit('lamb', 'flock', 'born');
      if (sheep.length > prev.sheepCount) emit('lamb', 'flock', 'grown');
      prev.lambs = lambs; prev.sheepCount = sheep.length;
      // Digital Luna tricks: idle play, riding, rabbit chase, fetch
      if (luna.anim !== prev.anim) { if (DL_TRICKS[luna.anim] && !luna.inBarn) emit('dl-trick', 'Digital Luna', DL_TRICKS[luna.anim]); prev.anim = luna.anim; }
      if (!!luna.riding !== prev.riding) { prev.riding = !!luna.riding; if (luna.riding) emit('dl-trick', 'Digital Luna', 'ride'); }
      if (!!luna.chasing !== prev.chasing) { prev.chasing = !!luna.chasing; if (luna.chasing) emit('dl-trick', 'Digital Luna', 'rabbit-chase'); }
      if (!!stickThrow !== prev.fetch) { prev.fetch = !!stickThrow; if (stickThrow) emit('dl-trick', 'Digital Luna', 'fetch'); }
      // bubbles: any icon with a live timer on a sheep, DL, or an NPC
      const carriers = [['Digital Luna', luna], ...sheep.map((s) => [s.name, s]), ['farmer', farmer], ['merchant', merchant]];
      for (const [name, c] of carriers) {
        if (!c || !c.icon || !(c.iconUntil > now)) continue;
        const key = name + ':' + c.icon;
        if (prev.bubbles.get(key) !== c.iconUntil) { prev.bubbles.set(key, c.iconUntil); emit('bubble', name, c.icon); }
      }
      // small life (logged, not counted): a bird landing, a rabbit crossing without a chase
      const birdSit = !!(bird && bird.state === 'sit');
      if (birdSit !== prev.birdSit) { prev.birdSit = birdSit; if (birdSit) emit('bird', 'bird', 'land'); }
      if (!!rabbit !== prev.rabbit) { prev.rabbit = !!rabbit; if (rabbit && !luna.chasing) emit('rabbit', 'rabbit', 'cross'); }
      state.ticks++;
    } catch (e) { state.errors.push(String(e)); }
  };
  setInterval(poll, 100);
})();
`;

// Everything the probe needs must exist as a page-level binding. Checked
// before injection so a renamed prototype fails loudly instead of silently
// reporting zero moments.
export const PROTOTYPE_GLOBALS = ['sheep', 'luna', 'weather', 'farmer', 'merchant', 'rabbit', 'bird', 'stickThrow', 'clock', 'phaseOf'];

// Luna Farm on a phone: the world canvas at native 640 by 400 scaled by CSS, tags and HUD on a
// full-resolution layer, a tray of creature verbs below (or over the scene in landscape), and
// the pin overlay for the owner's review. Time and intents go through the sim's step(); what
// the sim cannot do yet is drawn from the fixture, with a cue so every tap answers at once.
import {
  FarmRenderer,
  loadImage,
  loadSheet,
  phaseOf,
  WORLD_H,
  WORLD_W,
  type Backgrounds,
  type BackgroundKey,
  type FarmView,
} from '@sheepcliff/render';
import type { SheepcliffApi } from './api';
import { BACKGROUND_URLS, SHEET_META_URL, SHEET_URL } from './assets';
import { buildFixture, COLORS, NAMES } from './fixture';
import { Game } from './game';
import { hitTest, tapIntent, type SpriteSizes } from './hit';
import { describeIntent, sheepId, type ClientIntent } from './intents';
import { emitMoment } from './moments';
import { PinOverlay } from './pin-overlay';
import { parseSceneParams } from './query';
import { buildTray } from './tray';

/** Frame length under the QA virtual clock. */
const QA_FRAME_MS = 1000 / 60;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`no #${id}`);
  return el as T;
}

async function loadBackgrounds(): Promise<Backgrounds> {
  const entries = await Promise.all(
    (Object.entries(BACKGROUND_URLS) as [BackgroundKey, string][]).map(
      async ([k, url]) => [k, await loadImage(url)] as const,
    ),
  );
  return Object.fromEntries(entries) as Backgrounds;
}

/** URL scene parameters the page was opened with, as intents for the fresh world. */
function bootIntents(search: string): ClientIntent[] {
  const q = new URLSearchParams(search);
  const p = parseSceneParams(search);
  const out: ClientIntent[] = [];
  if (q.has('t')) out.push({ type: 'setClock', t: p.t });
  if (q.has('weather')) out.push({ type: 'setWeather', weather: p.weather });
  // Only an explicit ?season= pins the season; ?weather= alone leaves the sim's seasonal mode as is.
  if (q.has('season')) out.push({ type: 'setSeason', season: p.season });
  if (p.freeze) out.push({ type: 'pauseClock', paused: true });
  return out;
}

async function main(): Promise<void> {
  const world = byId<HTMLCanvasElement>('world');
  const ui = byId<HTMLCanvasElement>('ui');
  const stage = byId<HTMLDivElement>('stage');
  const status = byId<HTMLParagraphElement>('status');
  const timeEl = byId<HTMLInputElement>('time');
  const pauseBtn = byId<HTMLButtonElement>('pause');
  const trayToggle = byId<HTMLButtonElement>('trayToggle');

  const wcMaybe = world.getContext('2d');
  const ucMaybe = ui.getContext('2d');
  if (!wcMaybe || !ucMaybe) throw new Error('no 2d context');
  const wc: CanvasRenderingContext2D = wcMaybe;
  const uc: CanvasRenderingContext2D = ucMaybe;

  const params = parseSceneParams(location.search);
  const [sheet, backgrounds] = await Promise.all([loadSheet(SHEET_URL, SHEET_META_URL), loadBackgrounds()]);
  const renderer = new FarmRenderer(sheet, backgrounds);
  const sizes: SpriteSizes = { sheep: sheet.size('sheep'), luna: sheet.size('digital_luna') };

  const fixed = params.now !== null;
  const game = new Game({ seed: params.seed, liveWeather: params.liveWeather, boot: bootIntents(location.search), onMoment: emitMoment });
  // A fixed render clock is a still for goldens: the fixture exactly as the URL says, no sim.
  // A still never runs a frame, so it is not "frozen for pins" unless pins are switched on.
  let still: FarmView | null = null;
  if (params.now !== null) {
    game.renderNow = params.now;
    still = buildFixture(params, params.now);
  }
  const currentView = (): FarmView => still ?? game.current();

  // --- tray -------------------------------------------------------------------------------
  const tray = buildTray({ who: byId('who'), verbs: byId('verbs'), say: byId('say') }, NAMES, COLORS, (v) => send(v.intent));
  trayToggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('tray-open');
    trayToggle.textContent = open ? 'close' : 'tray';
  });

  function send(intent: ClientIntent) {
    const rec = game.dispatch(intent);
    tray.say(describeIntent(intent, NAMES) + (rec.sim ? '' : ' · waiting for the sim'), !rec.sim);
    return rec;
  }

  // --- pins -------------------------------------------------------------------------------
  const pins = new PinOverlay(
    {
      stage,
      pins: byId('pins'),
      notes: byId('notes'),
      mode: byId('cmode'),
      freeze: byId('cfreeze'),
      text: byId('ctext'),
      png: byId('cpng'),
      clear: byId('cclear'),
      modal: byId('modal'),
      modalBox: byId('modalBox'),
      frozen: byId('frozen'),
      world,
      ui,
    },
    {
      view: currentView,
      sizes: () => sizes,
      setFrozen: (f) => {
        game.frozen = f;
      },
      isFrozen: () => game.frozen,
    },
  );

  // --- taps -------------------------------------------------------------------------------
  stage.addEventListener('click', (e) => {
    if (pins.commenting) return;
    const r = stage.getBoundingClientRect();
    const wx = ((e.clientX - r.left) * WORLD_W) / r.width;
    const wy = ((e.clientY - r.top) * WORLD_H) / r.height;
    const view = currentView();
    const hit = hitTest(view, wx, wy, sizes);
    const intent = tapIntent(view, hit);
    if (!intent) return;
    send(intent);
    if (hit.kind === 'luna') tray.select('luna');
    if (hit.kind === 'sheep') tray.select(sheepId(hit.index));
  });

  // --- clock controls ---------------------------------------------------------------------
  let scrubbing = false;
  timeEl.addEventListener('pointerdown', () => (scrubbing = true));
  timeEl.addEventListener('pointerup', () => (scrubbing = false));
  timeEl.addEventListener('pointercancel', () => (scrubbing = false));
  timeEl.addEventListener('input', () => send({ type: 'setClock', t: Number(timeEl.value) / 999 }));
  pauseBtn.addEventListener('click', () => send({ type: 'pauseClock', paused: !game.sim.clock.paused }));

  function syncControls(view: FarmView): void {
    if (!scrubbing) timeEl.value = String(Math.round(view.clockT * 999));
    const paused = fixed || game.sim.clock.paused;
    pauseBtn.textContent = paused ? 'resume' : 'pause';
    pauseBtn.classList.toggle('on', paused);
    pins.syncFrozen();
    status.textContent = `${phaseOf(view.clockT)} · ${view.weather} · ${view.season} · seed ${game.seed} · ${WORLD_W}×${WORLD_H} native, UI at ${devicePixelRatio}×`;
  }

  // --- frames -----------------------------------------------------------------------------
  function drawStill(): void {
    if (!still) return;
    renderer.render(wc, uc, still, game.renderNow);
    syncControls(still);
  }
  function draw(now: number, dtMs: number): void {
    const view = game.frame(now, dtMs);
    renderer.render(wc, uc, view, game.renderNow);
    syncControls(view);
  }

  function resize(): void {
    const r = stage.getBoundingClientRect();
    // setting the size clears the UI canvas, so a still must redraw here
    ui.width = Math.round(r.width * devicePixelRatio);
    ui.height = Math.round(r.height * devicePixelRatio);
    if (still) drawStill();
  }
  addEventListener('resize', resize);
  resize();

  // --- QA hooks and the page API ----------------------------------------------------------
  let qaDriven = false;
  let virtualNow = 0;
  const api: SheepcliffApi = {
    qa: {
      seed(seed) {
        qaDriven = true;
        virtualNow = 0;
        still = null;
        game.reset(seed);
        game.frozen = false;
        game.renderNow = 0;
      },
      setClock: (t) => void send({ type: 'setClock', t }),
      setWeather: (weather) => void send({ type: 'setWeather', weather }),
      pause: (paused) => void send({ type: 'pauseClock', paused }),
      step(frames) {
        for (let i = 0; i < frames; i++) {
          virtualNow += QA_FRAME_MS;
          draw(virtualNow, QA_FRAME_MS);
        }
      },
      canvas: () => world,
      setDayLength: (seconds) => void send({ type: 'setPeriod', periodSec: seconds }),
    },
    intents: game.log,
    send,
    pins: { list: () => pins.list(), markdown: () => pins.markdown(), drop: (fx, fy) => pins.drop(fx, fy) },
    view: currentView,
  };
  (window as unknown as { sheepcliff: SheepcliffApi }).sheepcliff = api;

  if (still) {
    // one deterministic frame for golden screenshots
    drawStill();
    document.body.dataset['ready'] = '1';
    return;
  }

  let last = performance.now();
  let firstFrame = true;
  const loop = (now: number): void => {
    if (!qaDriven) {
      const dt = Math.min(50, Math.max(0, now - last));
      last = now;
      draw(now, dt);
      if (firstFrame) {
        firstFrame = false;
        document.body.dataset['ready'] = '1';
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main().catch((err: unknown) => {
  const status = document.getElementById('status');
  if (status) status.textContent = `error: ${String(err)}`;
  document.body.dataset['error'] = String(err);
  console.error(err);
});

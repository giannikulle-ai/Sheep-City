// Luna Farm on a phone: the world canvas at native 640 by 400 scaled by CSS, tags and HUD on a
// full-resolution layer, a tray of creature verbs below (or over the scene in landscape), and
// the pin overlay for the owner's review. The sim (packages/sim) runs on a fixed 100 ms
// accumulator fed from requestAnimationFrame; every frame renders its state through
// packages/render. The world saves itself every sim-minute and when the tab hides, restores on
// load, and catches up on the time it was left alone. The fixture still exists only behind
// `?fixture=1`, for the renderer's goldens.
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
import { SaveError } from '@sheepcliff/sim';
import type { SheepcliffApi } from './api';
import { BACKGROUND_URLS, SHEET_META_URL, SHEET_URL } from './assets';
import { buildFixture } from './fixture';
import { Game, MAX_FRAME_MS } from './game';
import { hitTest, tapIntent, type SpriteSizes } from './hit';
import { describeIntent, type ClientIntent } from './intents';
import { emitMoment } from './moments';
import { PinOverlay } from './pin-overlay';
import { parseSceneParams } from './query';
import { awaySummary, catchUp, restore, SAVE_KEY, saveText } from './save';
import { buildTray } from './tray';
import { simView } from './view';

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

/** localStorage behind try/catch: the owner's viewer may block it, and the farm must still run. */
const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing to forget
    }
  },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

async function main(): Promise<void> {
  const world = byId<HTMLCanvasElement>('world');
  const ui = byId<HTMLCanvasElement>('ui');
  const stage = byId<HTMLDivElement>('stage');
  const status = byId<HTMLParagraphElement>('status');
  const timeEl = byId<HTMLInputElement>('time');
  const pauseBtn = byId<HTMLButtonElement>('pause');
  const trayToggle = byId<HTMLButtonElement>('trayToggle');
  const saveBtn = byId<HTMLButtonElement>('saveNow');
  const exportBtn = byId<HTMLButtonElement>('saveText');
  const newFarmBtn = byId<HTMLButtonElement>('newFarm');
  const saveNote = byId<HTMLSpanElement>('saveNote');

  const wcMaybe = world.getContext('2d');
  const ucMaybe = ui.getContext('2d');
  if (!wcMaybe || !ucMaybe) throw new Error('no 2d context');
  const wc: CanvasRenderingContext2D = wcMaybe;
  const uc: CanvasRenderingContext2D = ucMaybe;

  const params = parseSceneParams(location.search);
  const [sheet, backgrounds] = await Promise.all([loadSheet(SHEET_URL, SHEET_META_URL), loadBackgrounds()]);
  const renderer = new FarmRenderer(sheet, backgrounds);
  const sizes: SpriteSizes = { sheep: sheet.size('sheep'), luna: sheet.size('digital_luna') };

  // --- persistence ------------------------------------------------------------------------
  // A URL that pins a scene (a seed, a clock, a weather, the fixture) is a scratch world: it never
  // touches the saved farm. Everything else loads the save, keeps it, and writes it back.
  let saving = !params.scratch;
  let lastSaveNote = '';
  const noteSave = (text: string): void => {
    lastSaveNote = text;
    saveNote.textContent = text;
  };

  const game = new Game({
    seed: params.seed,
    liveWeather: params.liveWeather,
    boot: bootIntents(location.search),
    onMoment: emitMoment,
    onMinute: () => save('sim-minute'),
  });

  function save(why: string): boolean {
    if (!saving) return false;
    const ok = storage.set(SAVE_KEY, saveText(game.sim, Date.now()));
    noteSave(ok ? `saved (${why})` : 'saving blocked in this viewer: use "save as text"');
    return ok;
  }

  // The fixture still, for the renderer's goldens: the picture exactly as the URL says, no sim.
  // A still never runs a frame, so it is not "frozen for pins" unless pins are switched on.
  let still: FarmView | null = null;
  if (params.fixture) {
    game.renderNow = params.now ?? 0;
    still = buildFixture(params, game.renderNow);
  }
  const currentView = (): FarmView => still ?? game.current();

  // --- tray -------------------------------------------------------------------------------
  const flockNames = (): string[] => game.sim.sheep.map((s) => s.name);
  const flockColors = (): string[] => game.sim.sheep.map((s) => s.color);
  const tray = buildTray({ who: byId('who'), verbs: byId('verbs'), say: byId('say') }, flockNames(), flockColors(), (v) => send(v.intent));
  let trayFlock = game.sim.sheep.length;
  trayToggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('tray-open');
    trayToggle.textContent = open ? 'close' : 'tray';
  });

  function send(intent: ClientIntent) {
    if (intent.type === 'farmAction' && intent.action === 'reset') {
      const rec = game.dispatch(intent);
      if (confirm('Start a new farm? The saved one is replaced.')) {
        game.reset(params.seed);
        save('new farm');
        tray.say('a new farm');
      } else tray.say('kept the farm');
      return rec;
    }
    const rec = game.dispatch(intent);
    tray.say(describeIntent(intent, flockNames()) + (rec.sim ? '' : ' · waiting for the sim'), !rec.sim);
    return rec;
  }

  /** Take a restored world over, catch it up on the time away, and say what happened. */
  function adopt(text: string, why: string): void {
    const r = restore(text);
    const c = catchUp(r.sim, r.savedAt ? Date.now() - r.savedAt : 0);
    const before = simView(null, r.sim, 0, params.liveWeather);
    game.load(c.sim);
    if (c.ranMs > 0) tray.say(awaySummary(before, simView(null, c.sim, 0, params.liveWeather), c));
    else tray.say(`${why}: the farm continues where it was`);
  }

  if (saving) {
    if (params.fresh) storage.remove(SAVE_KEY);
    const text = params.fresh ? null : storage.get(SAVE_KEY);
    if (text) {
      try {
        adopt(text, 'restored');
      } catch (err) {
        // keep the unreadable save for the owner, start again, and say so in one line
        storage.set(`${SAVE_KEY}.unreadable`, text);
        const code = err instanceof SaveError ? err.code : 'error';
        tray.say(`the saved farm could not be read (${code}); starting a new one`);
        console.error(err);
      }
    }
    save('load');
  } else noteSave(params.fixture ? 'fixture still (not saved)' : 'scratch world from the URL (not saved)');

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

  // --- save buttons -----------------------------------------------------------------------
  saveBtn.addEventListener('click', () => {
    if (!save('button')) tray.say(saving ? 'saving is blocked here; "save as text" still works' : 'this is a scratch world; open the page without parameters to keep a farm');
  });
  exportBtn.addEventListener('click', () => {
    // Downloads and the clipboard may be blocked in the owner's viewer: the text stays in the page.
    const hint = el('div', { className: 'hint', textContent: 'The farm as text. Copy it somewhere safe, or paste a saved farm here and load it.' });
    const ta = el('textarea', { id: 'saveTextArea', value: saveText(game.sim, Date.now()) });
    const load = el('button', { type: 'button', textContent: 'load this text' });
    const msg = el('div', { className: 'hint', id: 'saveLoadMsg' });
    load.addEventListener('click', () => {
      try {
        adopt(ta.value, 'loaded');
        save('import');
        msg.textContent = 'loaded';
        pins.closeModal();
      } catch (err) {
        msg.textContent = `not loaded: ${err instanceof SaveError ? `${err.code}, ${err.message}` : String(err)}`;
      }
    });
    pins.openModal([hint, ta, load, msg]);
  });
  newFarmBtn.addEventListener('click', () => send({ type: 'farmAction', action: 'reset' }));

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
    // the tap point goes with the verb, so the sim hit-tests exactly where the finger landed
    if (intent.type === 'pet' || intent.type === 'shear') intent.at = { x: wx, y: wy };
    send(intent);
    if (hit.kind === 'luna') tray.select('luna');
    if (hit.kind === 'sheep') tray.select(`sheep-${hit.index}`);
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
    const paused = still !== null || game.sim.clock.paused;
    pauseBtn.textContent = paused ? 'resume' : 'pause';
    pauseBtn.classList.toggle('on', paused);
    pins.syncFrozen();
    if (game.sim.sheep.length !== trayFlock) {
      trayFlock = game.sim.sheep.length;
      tray.setWhos(flockNames(), flockColors());
    }
    status.textContent = `${phaseOf(view.clockT)} · ${view.weather} · ${view.season} · seed ${game.seed} · day ${game.sim.clock.dayCount + 1} · ${WORLD_W}×${WORLD_H} native, UI at ${devicePixelRatio}× · ${lastSaveNote}`;
  }

  // --- frames -----------------------------------------------------------------------------
  function drawStill(): void {
    if (!still) return;
    renderer.render(wc, uc, still, game.renderNow);
    syncControls(still);
  }
  function draw(dtMs: number): void {
    const view = game.frame(dtMs);
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
  const api: SheepcliffApi = {
    qa: {
      seed(seed) {
        qaDriven = true;
        saving = false;
        noteSave('QA world (not saved)');
        still = null;
        game.reset(seed);
        game.frozen = false;
      },
      setClock: (t) => void send({ type: 'setClock', t }),
      setWeather: (weather) => void send({ type: 'setWeather', weather }),
      pause: (paused) => void send({ type: 'pauseClock', paused }),
      step(frames) {
        for (let i = 0; i < frames; i++) draw(QA_FRAME_MS);
      },
      canvas: () => world,
      setDayLength: (seconds) => void send({ type: 'setPeriod', periodSec: seconds }),
    },
    intents: game.log,
    send,
    pins: { list: () => pins.list(), markdown: () => pins.markdown(), drop: (fx, fy) => pins.drop(fx, fy) },
    save: {
      now: () => save('api'),
      text: () => saveText(game.sim, Date.now()),
      load: (text) => {
        adopt(text, 'loaded');
        save('api load');
      },
      saving: () => saving,
    },
    view: currentView,
    sim: () => game.sim,
  };
  (window as unknown as { sheepcliff: SheepcliffApi }).sheepcliff = api;

  if (still) {
    // one deterministic frame for golden screenshots
    drawStill();
    document.body.dataset['ready'] = '1';
    return;
  }

  // --- absence: save when the tab hides, catch up when it comes back ------------------------
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      save('tab hidden');
      return;
    }
    if (hiddenAt === null || qaDriven) return;
    const away = Date.now() - hiddenAt;
    hiddenAt = null;
    last = performance.now();
    const before = game.current();
    const c = catchUp(game.sim, away);
    if (c.ranMs > 0) {
      game.load(c.sim);
      tray.say(awaySummary(before, game.current(), c));
      save('back');
    }
  });
  addEventListener('pagehide', () => save('page hidden'));

  let last = performance.now();
  let firstFrame = true;
  const loop = (now: number): void => {
    if (!qaDriven) {
      // a long gap (a background tab) is an absence for visibilitychange to catch up, not a frame
      const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - last));
      last = now;
      draw(dt);
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

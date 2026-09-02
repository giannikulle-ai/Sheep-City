// Luna Farm at 640 by 400 from a frozen fixture state, drawn by @sheepcliff/render.
// The world canvas is native pixels scaled by CSS; tags and HUD go on the full-
// resolution UI canvas. The tray below is a dev harness for phases and weather
// until the input ticket lands.
import {
  FarmRenderer,
  loadImage,
  loadSheet,
  phaseOf,
  type Backgrounds,
  type BackgroundKey,
  type Season,
  type Weather,
} from '@sheepcliff/render';
import { BACKGROUND_URLS, SHEET_META_URL, SHEET_URL } from './assets';
import { buildFixture } from './fixture';
import { DEFAULT_TEMP, parseSceneParams } from './query';

/** One sim day in seconds while watching, as the prototype's default clock period. */
const DAY_SECONDS = 180;

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

async function main(): Promise<void> {
  const world = byId<HTMLCanvasElement>('world');
  const ui = byId<HTMLCanvasElement>('ui');
  const stage = byId<HTMLDivElement>('stage');
  const status = byId<HTMLParagraphElement>('status');
  const timeEl = byId<HTMLInputElement>('time');
  const freezeBtn = byId<HTMLButtonElement>('freeze');
  const seasonEl = byId<HTMLSelectElement>('season');
  const weatherBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-w]'));

  const wc = world.getContext('2d');
  const uc = ui.getContext('2d');
  if (!wc || !uc) throw new Error('no 2d context');

  const params = parseSceneParams(location.search);
  const [sheet, backgrounds] = await Promise.all([loadSheet(SHEET_URL, SHEET_META_URL), loadBackgrounds()]);
  const renderer = new FarmRenderer(sheet, backgrounds);

  // controls mirror the query params; the fixture is rebuilt when they change
  let clockT = params.t;
  let weather: Weather = params.weather;
  let season: Season = params.season;
  let temp = params.temp;
  let frozen = params.freeze;
  timeEl.value = String(Math.round(clockT * 999));
  seasonEl.value = season;

  function syncControls(): void {
    freezeBtn.textContent = frozen ? 'resume' : 'pause';
    for (const b of weatherBtns) b.classList.toggle('on', b.dataset['w'] === weather);
  }
  timeEl.addEventListener('input', () => {
    clockT = Number(timeEl.value) / 999;
  });
  freezeBtn.addEventListener('click', () => {
    frozen = !frozen;
    syncControls();
  });
  for (const b of weatherBtns) {
    b.addEventListener('click', () => {
      weather = (b.dataset['w'] ?? 'sun') as Weather;
      temp = weather === 'snow' ? -3 : DEFAULT_TEMP[season];
      syncControls();
    });
  }
  seasonEl.addEventListener('change', () => {
    season = seasonEl.value as Season;
    temp = weather === 'snow' ? -3 : DEFAULT_TEMP[season];
  });
  syncControls();

  const frame = (now: number): void => {
    const view = buildFixture(
      { t: clockT, weather, season, temp, now: params.now, freeze: frozen, liveWeather: params.liveWeather },
      now,
    );
    renderer.render(wc, uc, view, now);
    status.textContent = `${phaseOf(clockT)} · ${weather} · ${season} · 640×400 native, UI at ${devicePixelRatio}×`;
  };

  function resize(): void {
    const r = stage.getBoundingClientRect();
    // setting the size clears the UI canvas, so a fixed clock must redraw here
    ui.width = Math.round(r.width * devicePixelRatio);
    ui.height = Math.round(r.height * devicePixelRatio);
    if (params.now !== null) frame(params.now);
  }
  addEventListener('resize', resize);
  resize();

  if (params.now !== null) {
    // fixed render clock: one deterministic frame for golden screenshots
    document.body.dataset['ready'] = '1';
    return;
  }

  let last = performance.now();
  let firstFrame = true;
  const loop = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!frozen) {
      clockT = (clockT + dt / DAY_SECONDS) % 1;
      timeEl.value = String(Math.round(clockT * 999));
    }
    frame(now);
    if (firstFrame) {
      firstFrame = false;
      document.body.dataset['ready'] = '1';
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

// The world driver: owns the sim state, feeds it intents and time through `step()`, and builds
// each frame's view (the sim's actors, interpolated between ticks, plus the client's anticipation
// cues for verbs the sim has no rule for yet). No DOM.
import type { FarmView } from '@sheepcliff/render';
import { applyIntent, cloneState, createInitialState, step, TICK_MS, type Intent, type SimState } from '@sheepcliff/sim';
import { toSimIntents, type ClientIntent } from './intents';
import { diffMoments, type Moment } from './moments';
import { applyReactions, emptyReactions, prune, react, type Reactions } from './reactions';
import { renderClock, simView, tickAlpha } from './view';

export interface IntentRecord {
  intent: ClientIntent;
  /** render-clock ms when it was sent */
  at: number;
  /** true when the sim has a rule for it today and it went into `step()` */
  sim: boolean;
}

export interface GameOptions {
  seed: number;
  liveWeather: boolean;
  /** applied to the fresh world before the first frame (URL scene parameters) */
  boot?: ClientIntent[];
  onMoment?: (m: Moment) => void;
  /** called after every tick that crossed a sim-minute boundary */
  onMinute?: (sim: SimState) => void;
}

/** How many intents the log keeps for QA and the tray. */
const LOG_CAP = 200;

/** A frame longer than this (a tab in the background, a debugger) is absorbed as an absence, not a step. */
export const MAX_FRAME_MS = 250;

export class Game {
  sim: SimState;
  reactions: Reactions = emptyReactions();
  readonly log: IntentRecord[] = [];
  /** frozen for pins: time stops, the last frame is redrawn */
  frozen = false;
  /** the render clock in ms: the sim's own time plus the part of the next tick already owed */
  renderNow = 0;
  private queue: Intent[] = [];
  /** the state one tick before `sim`, for interpolation; null after a reset or a teleport in time */
  private prevTick: SimState | null = null;
  private view: FarmView | null = null;

  constructor(private readonly opts: GameOptions) {
    this.sim = this.fresh(opts.seed);
    this.renderNow = renderClock(this.sim);
  }

  private fresh(seed: number): SimState {
    const s = cloneState(createInitialState(seed));
    for (const intent of this.opts.boot ?? []) for (const si of toSimIntents(intent, s)) applyIntent(s, si);
    return s;
  }

  get seed(): number {
    return this.sim.seed;
  }

  /** A new world from `seed`, forgetting cues, queued intents, and the moment baseline. */
  reset(seed: number): void {
    this.load(this.fresh(seed));
  }

  /** Take over a world (a restored save, a caught-up one). Cues and queued intents are dropped. */
  load(sim: SimState): void {
    this.sim = sim;
    this.reactions = emptyReactions();
    this.queue = [];
    this.prevTick = null;
    this.view = null;
    this.renderNow = renderClock(sim);
  }

  /** The view on screen: the last frame's, or a fresh one at the current render clock. */
  current(): FarmView {
    return this.view ?? this.build();
  }

  /** Send one intent: log it, hand the sim what it understands, else show a cue at once. */
  dispatch(intent: ClientIntent): IntentRecord {
    const simIntents = toSimIntents(intent, this.sim);
    this.queue.push(...simIntents);
    const rec: IntentRecord = { intent, at: this.renderNow, sim: simIntents.length > 0 };
    this.log.push(rec);
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
    // the sim answers its own intents at the next tick boundary, within 100 ms; the rest get a cue
    if (!rec.sim) this.reactions = react(this.reactions, intent, this.current(), this.renderNow);
    return rec;
  }

  /**
   * Advance the sim by `dtMs`, one tick at a time so the last two tick states are known for
   * interpolation. Intents queued since the last call go in first. Reports moments per tick.
   */
  advance(dtMs: number): void {
    let cur = this.sim;
    let first = true;
    for (;;) {
      const before = cur;
      cur = step(cur, first ? this.queue : [], first ? dtMs : 0, { maxTicks: 1 });
      if (first) this.queue = [];
      first = false;
      if (cur.clock.tick === before.clock.tick) break; // no tick ran; time (and intents) wait in the state
      this.prevTick = before;
      if (this.opts.onMoment) for (const m of diffMoments(before, cur)) this.opts.onMoment(m);
      if (this.opts.onMinute && Math.floor(cur.clock.nowMs / 60000) !== Math.floor(before.clock.nowMs / 60000)) this.opts.onMinute(cur);
      if (cur.accumulatorMs < TICK_MS) break;
    }
    this.sim = cur;
    this.renderNow = renderClock(cur);
  }

  /** One frame: advance the sim by `dtMs` (unless frozen), build the view. */
  frame(dtMs: number): FarmView {
    if (!this.frozen) {
      this.advance(Math.max(0, dtMs));
    } else if (this.queue.length) {
      // frozen: intents wait at the sim's next tick boundary, nothing moves
      this.sim = step(this.sim, this.queue, 0);
      this.queue = [];
    }
    this.reactions = prune(this.reactions, this.renderNow);
    const view = this.build();
    this.view = view;
    return view;
  }

  private build(): FarmView {
    const view = simView(this.prevTick, this.sim, tickAlpha(this.sim), this.opts.liveWeather);
    return applyReactions(view, this.reactions, this.renderNow);
  }
}

// The world driver: owns the sim state, feeds it intents and time through `step()`, and builds
// each frame's view (sim scalars over the fixture, plus the client's anticipation cues). No DOM.
import type { FarmView } from '@sheepcliff/render';
import { applyIntent, cloneState, createInitialState, step, type Intent, type SimState } from '@sheepcliff/sim';
import { toSimIntents, type ClientIntent } from './intents';
import { diffMoments, type Moment } from './moments';
import { applyReactions, emptyReactions, prune, react, type Reactions } from './reactions';
import { liveView } from './view';

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
}

/** How many intents the log keeps for QA and the tray. */
const LOG_CAP = 200;

export class Game {
  sim: SimState;
  reactions: Reactions = emptyReactions();
  readonly log: IntentRecord[] = [];
  /** frozen for pins: time stops, the last frame is redrawn */
  frozen = false;
  /** the render clock in ms: real time, or held while frozen, or virtual under QA */
  renderNow = 0;
  private queue: Intent[] = [];
  private prev: FarmView | null = null;
  private view: FarmView | null = null;

  constructor(private readonly opts: GameOptions) {
    this.sim = this.fresh(opts.seed);
  }

  private fresh(seed: number): SimState {
    const s = cloneState(createInitialState(seed));
    for (const intent of this.opts.boot ?? []) for (const si of toSimIntents(intent)) applyIntent(s, si);
    return s;
  }

  get seed(): number {
    return this.sim.seed;
  }

  /** A new world from `seed`, forgetting cues, queued intents, and the moment baseline. */
  reset(seed: number): void {
    this.sim = this.fresh(seed);
    this.reactions = emptyReactions();
    this.queue = [];
    this.prev = null;
    this.view = null;
  }

  /** The view on screen: the last frame's, or a fresh one at the current render clock. */
  current(): FarmView {
    return this.view ?? this.build();
  }

  /** Send one intent: log it, hand the sim what it understands, and show a cue at once. */
  dispatch(intent: ClientIntent): IntentRecord {
    const simIntents = toSimIntents(intent);
    this.queue.push(...simIntents);
    const rec: IntentRecord = { intent, at: this.renderNow, sim: simIntents.length > 0 };
    this.log.push(rec);
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
    this.reactions = react(this.reactions, intent, this.current(), this.renderNow);
    return rec;
  }

  /** One frame: advance the sim by `dtMs` (unless frozen), build the view, report moments. */
  frame(now: number, dtMs: number): FarmView {
    if (!this.frozen) {
      this.renderNow = now;
      this.sim = step(this.sim, this.queue, dtMs);
      this.queue = [];
    } else if (this.queue.length) {
      // frozen: intents wait at the sim's next tick boundary, nothing moves
      this.sim = step(this.sim, this.queue, 0);
      this.queue = [];
    }
    this.reactions = prune(this.reactions, this.renderNow);
    const view = this.build();
    if (this.opts.onMoment) for (const m of diffMoments(this.prev, view, this.renderNow)) this.opts.onMoment(m);
    this.prev = view;
    this.view = view;
    return view;
  }

  private build(): FarmView {
    return applyReactions(liveView(this.sim, this.renderNow, this.opts.liveWeather), this.reactions, this.renderNow);
  }
}

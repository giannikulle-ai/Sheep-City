import { describe, expect, it } from 'vitest';
import { buildFixture } from './fixture';
import { parseSceneParams } from './query';
import { applyReactions, emptyReactions, prune, react } from './reactions';
import { liveView } from './view';
import { createInitialState } from '@sheepcliff/sim';

const clean = (now = 1000) => liveView(createInitialState(1), now, false);

describe('react', () => {
  it('a pet shows a heart and the name tag at once', () => {
    const now = 1000;
    const r = react(emptyReactions(), { type: 'pet', target: 'sheep-0' }, clean(now), now);
    const v = applyReactions(clean(now), r, now);
    expect(v.sheep[0]?.icon).toBe('heart');
    expect(v.sheep[0]?.iconUntil).toBe(now + 1600);
    expect(v.sheep[0]?.tagUntil).toBe(now + 1800);
    expect(v.sheep[1]?.icon).toBeNull();
  });

  it('petting the flock hearts everyone; shearing it only the woolly', () => {
    const now = 0;
    const base = clean(now);
    base.sheep.forEach((s, i) => (s.wool = i === 2 ? 0.9 : 0.4));
    let r = react(emptyReactions(), { type: 'pet', target: 'flock' }, base, now);
    let v = applyReactions(clean(now), r, now);
    expect(v.sheep.every((s) => s.icon === 'heart')).toBe(true);
    r = react(emptyReactions(), { type: 'shear', target: 'flock' }, base, now);
    v = applyReactions(clean(now), r, now);
    expect(v.sheep.map((s) => s.icon)).toEqual([null, null, 'shears', null, null]);
  });

  it('a stick lies where it was thrown for a moment, and DL is tagged', () => {
    const r = react(emptyReactions(), { type: 'throwStick', x: 300, y: 250 }, clean(), 0);
    expect(applyReactions(clean(), r, 100).stick).toEqual({ x: 300, y: 250 });
    expect(applyReactions(clean(), r, 100).luna.tagUntil).toBe(1800);
    expect(applyReactions(clean(), r, 2600).stick).toBeNull();
  });

  it('a DL action or a sheep task shows the bang bubble as an anticipation cue', () => {
    const r1 = react(emptyReactions(), { type: 'dlAction', action: 'flop' }, clean(), 0);
    expect(applyReactions(clean(), r1, 10).luna.icon).toBe('bang');
    const r2 = react(emptyReactions(), { type: 'sheepAction', action: 'rest', target: 'sheep-3' }, clean(), 0);
    expect(applyReactions(clean(), r2, 10).sheep[3]?.icon).toBe('bang');
  });

  it('weather and clock intents add no cue: the sim answers within a tick', () => {
    const r = react(emptyReactions(), { type: 'setWeather', weather: 'rain' }, clean(), 0);
    expect(r).toEqual(emptyReactions());
  });

  it('prune forgets cues once both bubble and tag have faded', () => {
    let r = react(emptyReactions(), { type: 'pet', target: 'luna' }, clean(), 0);
    r = react(r, { type: 'throwStick', x: 1, y: 1 }, clean(), 0);
    expect(prune(r, 1700).cues).toHaveLength(2);
    expect(prune(r, 1900).cues).toHaveLength(0);
    expect(prune(r, 1900).stick).not.toBeNull();
    expect(prune(r, 2600).stick).toBeNull();
  });

  it('the fixture still keeps its demo bubbles; the live view starts clean', () => {
    const still = buildFixture(parseSceneParams(''), 1000);
    expect(still.sheep[0]?.icon).toBe('heart');
    const live = clean();
    expect(live.sheep.every((s) => s.icon === null && s.tagUntil === 0)).toBe(true);
    expect(live.luna.icon).toBeNull();
    expect(live.merchant?.icon).toBeNull();
  });
});

// Composited visibility checks (owner: INTEGRATION stream): what the viewer can
// actually see of a presenter's performance once every layer is on top. Used by
// the integration lab (public/lab/v2-stage.html) and test/v2-integ.test.js; it
// never runs on the frame path of the channel.
//
//   gestureVisibility({ ep, slot, framing, gesture })
//     → { hands, handsSeen, handTop, changed, visible, share }
//   Renders the real Stage at the gesture's apex and reads the hand pixels from
//   the PartBuffer's groups (character.js GROUPS: hands 13-18 and 22-27 of each
//   actor): `hands` on screen, `handsSeen` of them outside the graphics a story
//   carries (caption line over the strap, strap, ticker: graphics/layout.js),
//   `handTop` the highest hand row. A second render without the gesture gives
//   `changed` (every pixel the gesture moves: arms, hands, the body with them)
//   and `visible` / `share` of those outside the graphics.
// The owner (20:40, 22:50): more gestures, never overused, and seen. A gesture
// played under the strap or the ticker is a gesture nobody sees.
import { Stage } from './stage.js';
import { frame, parts } from '../scene.js';
import { GROUPS_PER_ACTOR } from '../character.js';
import { GESTURES } from '../gestures/index.js';

/** Graphics over a studio shot during a story (graphics/layout.js): x0, y0, x1, y1 (exclusive). */
export const STORY_BANDS = Object.freeze([
  Object.freeze({ name: 'caption', x0: 60, y0: 148, x1: 324, y1: 160 }), // one caption line above the strap
  Object.freeze({ name: 'strap', x0: 19, y0: 166, x1: 365, y1: 194 }),
  Object.freeze({ name: 'ticker', x0: 0, y0: 202, x1: 384, y1: 216 }),
]);

/** Is pixel (x, y) under one of the bands? */
export function covered(x, y, bands = STORY_BANDS) {
  for (const b of bands) if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) return true;
  return false;
}

const quietAudio = () => ({
  speechFrame(ms, slot, out = {}) {
    out.slot = slot;
    out.speaking = false;
    out.level = 0;
    out.viseme = 'rest';
    out.next = 'rest';
    out.mix = 0;
    out.wordIndex = -1;
    out.charIndex = -1;
    out.sentenceIndex = -1;
    out.accent = 0;
    out.pause = false;
    return out;
  },
});
const fakeCtx = () => ({ putImageData() {}, drawImage() {}, fillRect() {}, fillStyle: '' });

function renderAt(ep, slot, framing, shot, t, gesture) {
  const st = new Stage({ audio: quietAudio(), channel: { presenters: {} }, idle: null, log: () => {} });
  const scene = { episode: ep, program: ep.program, cast: ep.cast, shot, framing, focus: slot, shotSince: 1, anchors: {}, images: new Map(), wall: { mode: 'logo' }, segPlan: null, cameraMove: null };
  st.frame(null, 1, scene, false); // builds the actors (epoch = 1)
  if (gesture) {
    const a = st.actors.find((x) => x.slot === slot);
    const g = { name: gesture.name, t0: gesture.t0 - st.epoch };
    if (gesture.variant) g.variant = gesture.variant;
    if (gesture.n > 0) g.n = gesture.n;
    if (gesture.amp > 0) g.amp = gesture.amp;
    if (gesture.speed > 0) g.speed = gesture.speed;
    a?.perf.gestures.push(g);
  }
  st.frame(fakeCtx(), t, scene, true);
  // hand pixels of the focus actor (its group base: its place among the actors drawn this frame)
  const gb = Math.max(0, st.vis.findIndex((x) => x.slot === slot)) * GROUPS_PER_ACTOR;
  const hand = new Uint8Array(frame.px.length);
  for (let i = 0; i < hand.length; i++) {
    const g = parts.grp[i] - gb;
    if (parts.mat[i] !== 0 && ((g >= 13 && g <= 18) || (g >= 22 && g <= 27))) hand[i] = 1;
  }
  return { px: Uint32Array.from(frame.px), hand };
}

/**
 * How much of a gesture the viewer sees in a framing, at its apex.
 * opts: { ep (episode: program + cast), slot, framing, shot ('close'), gesture: { name, variant?, n?, amp?, speed? }, bands }
 */
export function gestureVisibility({ ep, slot = 'A', framing = 'single', shot = 'close', gesture, bands = STORY_BANDS, t = 20 }) {
  const def = GESTURES[gesture?.name];
  if (!def) return { changed: 0, visible: 0, share: 0, top: null };
  const speed = gesture.speed > 0 ? gesture.speed : 1;
  const apex = (def.dur * (Number.isFinite(def.apex) ? def.apex : 0.5)) / speed;
  const t0 = t - apex;
  const base = renderAt(ep, slot, framing, shot, t, null).px;
  const hit = renderAt(ep, slot, framing, shot, t, { ...gesture, t0 });
  const W = frame.w || 384;
  let changed = 0, visible = 0, hands = 0, handsSeen = 0, handTop = null;
  for (let i = 0; i < base.length; i++) {
    const x = i % W, y = (i / W) | 0;
    if (hit.hand[i]) {
      hands++;
      if (handTop === null || y < handTop) handTop = y;
      if (!covered(x, y, bands)) handsSeen++;
    }
    if (base[i] === hit.px[i]) continue;
    changed++;
    if (!covered(x, y, bands)) visible++;
  }
  return { hands, handsSeen, handTop, changed, visible, share: changed ? visible / changed : 0 };
}

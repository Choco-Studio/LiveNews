// The three deliverable demos of the canvas25d prototype, each a pure
// function of time t (seconds) so contact sheets are deterministic.
//   rig     Paco at the desk (medium single) performing the 7 gestures in
//           sequence with overlaps that show blending; or one gesture.
//   talk    medium close-up of Paco or Lola speaking a line (visemes).
//   camera  wide two-shot → slow eased push-in to the two-shot → cut to a
//           single on Lola.
import { C } from './pixbuf.js';
import { frame, parts, actor, drawActors } from './scene.js';
import { makeCamera, drawBackground, drawDesk, placeActor, SET, kAt } from './studio25d.js';
import { GESTURES, DEMO_SEQUENCE } from './gestures.js';
import { buildSpeech } from './visemes.js';

const clipRows = new Int16Array(384);
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp = (a, b, u) => a + (b - a) * u;

/** Optional section timings (ms, accumulated) for the lab's profile() helper. */
export const PROFILE = { on: false, bg: 0, desk: 0, actors: 0, n: 0 };

function shot(cam, t, cast) {
  const p = PROFILE.on;
  let t0 = p ? performance.now() : 0;
  drawBackground(frame, cam, t);
  if (p) {
    const t1 = performance.now();
    PROFILE.bg += t1 - t0;
    t0 = t1;
  }
  drawDesk(frame, cam, clipRows, C.red);
  if (p) {
    const t1 = performance.now();
    PROFILE.desk += t1 - t0;
    t0 = t1;
  }
  const list = cast.map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
  const heads = drawActors(t, list, clipRows);
  if (p) {
    PROFILE.actors += performance.now() - t0;
    PROFILE.n++;
  }
  return heads;
}

// ---------------------------------------------------------------------------
// rig

export const LINE = "Good evening. Here are tonight's top stories from around the world.";

const RIG_SEQ = (() => {
  const out = [];
  let t = 0.5;
  for (const name of DEMO_SEQUENCE) {
    out.push({ name, t0: t });
    t += GESTURES[name].dur - 0.32; // the next gesture starts while this one settles
  }
  return out;
})();
export const RIG_TIMES = RIG_SEQ.map((g) => ({ ...g, t1: g.t0 + GESTURES[g.name].dur }));

const pacoRig = actor('paco', { side: 1, seed: 11 });
// medium single: k = 2.15 at the desk, Paco in the left third, the screen he points at on the right
const RIG_K = 2.15;
const rigCam = makeCamera({ x: -74 + 82 / RIG_K, y: -60, z: 300, zoom: (RIG_K * 700) / 1000, hy: 34 + 23.6 * RIG_K - 30 * RIG_K });

export function rig(t, opts) {
  const g = opts.gesture && opts.gesture !== 'sequence' ? [{ name: opts.gesture, t0: 0.3 }] : RIG_SEQ;
  pacoRig.perf.gestures = g;
  pacoRig.look = pacoRig.look; // (same look object)
  shot(rigCam, t, [{ a: pacoRig, X: SET.seatX.A }]);
}

// ---------------------------------------------------------------------------
// talk

const talkers = {
  paco: actor('paco', { side: 1, seed: 11, speech: buildSpeech(LINE, { t0: 0.4 }) }),
  lola: actor('lola', { side: -1, seed: 23, speech: buildSpeech(LINE, { t0: 0.4, rate: 1.06 }), emotions: [{ t0: 0, name: 'happy' }] }),
};

/** Single camera on a seat, composed so the screen's edge never sits next to the head. */
export function singleCam(slot, k = 3.0) {
  const cz = 460;
  const zoom = (k * (SET.presenterZ - cz)) / 1000;
  const kw = k * (SET.presenterZ - cz) / (SET.wallZ - cz);
  const side = slot === 'B' ? 1 : -1;
  // largest |cam.x| that keeps the bezel clear of the head (≥ 14 u of head + hair + margin)
  const clear = 10.5 * k;
  const cx = side * ((74 * k - 73 * kw - clear) / (k - kw));
  const neck = 26 + 23.6 * k; // head top 26 px below the frame top
  return makeCamera({ x: cx, y: -60, z: cz, zoom, hy: neck - (SET.neckY + 60) * k, soft: 1 });
}

export function talk(t, opts) {
  const who = opts.presenter === 'lola' ? 'lola' : 'paco';
  const cam = singleCam(who === 'lola' ? 'B' : 'A', opts.k || 4.0);
  shot(cam, t, [{ a: talkers[who], X: who === 'lola' ? SET.seatX.B : SET.seatX.A }]);
}

// ---------------------------------------------------------------------------
// camera

export const CAMERA_CUT = 4.6;
const castCam = {
  paco: actor('paco', {
    side: 1,
    seed: 11,
    speech: buildSpeech('Good evening, and welcome. I am Paco Pixel.', { t0: 0.35 }),
    gestures: [{ name: 'nod', t0: 3.0 }],
  }),
  lola: actor('lola', {
    side: -1,
    seed: 23,
    emotions: [{ t0: 0, name: 'happy' }],
    look: [{ t0: 0.6, t1: 4.3 }],
    listen: true,
    speech: buildSpeech("And I'm Lola Byte. Here are tonight's top stories.", { t0: CAMERA_CUT + 0.25, rate: 1.06 }),
  }),
};

const WIDE = makeCamera({ x: 0, y: -60, z: 0, zoom: 1, hy: 52 });
const TWO = makeCamera({ x: 0, y: -60, z: 370, zoom: 1, hy: 42 });
const camTmp = makeCamera();

export function cameraAt(t) {
  if (t >= CAMERA_CUT) return singleCam('B', 3.4);
  // hold the wide, then a slow 3 s eased dolly-in with a touch of tilt to keep the heads in the upper third
  const u = ease((t - 0.6) / 3.0);
  camTmp.x = 0;
  camTmp.y = WIDE.y;
  camTmp.z = lerp(WIDE.z, TWO.z, u);
  camTmp.zoom = 1;
  camTmp.hy = lerp(WIDE.hy, TWO.hy, u);
  camTmp.soft = 0;
  return camTmp;
}

export function camera(t) {
  const cam = cameraAt(t);
  const cast = [
    { a: castCam.paco, X: SET.seatX.A },
    { a: castCam.lola, X: SET.seatX.B },
  ];
  shot(cam, t, cast);
}

export const DEMOS = { rig, talk, camera };
export { kAt, parts };

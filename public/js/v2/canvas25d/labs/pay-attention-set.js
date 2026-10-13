// Lab driver for PAY ATTENTION's quiz studio (docs/programmes/pay-attention.md §6, build step 5; studio/quiz.js): the
// set with its three seated people (the host at the centre seat, contestant A at the left desk, B at the right), in the
// framings proposed for the director (quiz.js quizCamera) and the network's own. Works in node too (tests, measuring):
// text and the desk's logo need a DOM, so they are absent there.
//
//   render(t)          draw the instant t into frame; returns { cam, heads, clipRows }
//   set({ framing, wall, image, presenters, cast, question, lamps, scores, cache, move })
//   measure(t)         faces, head zones, the set's census (presenters and the board's content excluded)
//   profile(n)         ms a frame: background uncached (a slow push), cached, desk
//   FRAMINGS, CAST     the lab's framings and stand-in cast (the host's own look is step 6's: a stand-in until then)
import { C, Frame } from '../pixbuf.js';
import { drawBackground, drawDesk, setCacheEnabled, invalidateSet, wallRect, setQuizState } from '../studio/set.js';
import { styleFor } from '../studio/styles.js';
import { resetWall } from '../studio/wall.js';
import { SET } from '../studio/geometry.js';
import { QUIZ, quizCamera, resetQuizState } from '../studio/quiz.js';
import { lstarOf, nameOf, SKIN } from '../studio/color.js';

let SCENE = null, CAM = null;
try {
  SCENE = await import('../scene.js');
} catch (err) {
  console.warn('[quiz lab] presenters unavailable:', err.message);
}
try {
  CAM = await import('../camera.js');
} catch (err) {
  console.warn('[quiz lab] camera.js unavailable:', err.message);
}
export const frame = SCENE ? SCENE.frame : new Frame();
export const hasPresenters = () => !!SCENE;

/** The stand-in cast (the bible's example pairing: MONEY MINUTE's Penny on seat A, COSMOS's Nova on seat B; the host's
 * face is step 6's, so a stand-in until then). */
export const CAST = Object.freeze({ host: 'sam', A: 'penny', B: 'nova' });
export const PROGRAMME = 'pay-attention';
/** The proposed framings (quiz.js) and the network's own ones the director may reuse (solo-wide is 'wide'). */
export const FRAMINGS = ['wide', 'host', 'player-a', 'player-b'];
export const WALLS = ['idle', 'picture'];

export const LAB = {
  framing: 'wide',
  wall: 'idle',
  image: 'port',
  presenters: true,
  cast: { ...CAST },
  move: null,
  shotSince: 0,
};

const IMAGES = new Map();
export function setImage(name, img) {
  IMAGES.set(name, img);
}

const ACTORS = new Map();
function actors() {
  const key = `${LAB.cast.host}|${LAB.cast.A}|${LAB.cast.B}`;
  let list = ACTORS.get(key);
  if (list) return list;
  const S = QUIZ.seats;
  list = [
    { slot: 'A', X: S.A.X, a: SCENE.actor(LAB.cast.A, { side: S.A.side, seed: 11 }) },
    { slot: 'B', X: S.B.X, a: SCENE.actor(LAB.cast.B, { side: S.B.side, seed: 23 }) },
    { slot: 'host', X: S.host.X, a: SCENE.actor(LAB.cast.host, { side: 0, seed: 17 }) },
  ];
  ACTORS.set(key, list);
  return list;
}

/** The camera of a lab framing (the singles composed on the seated person's own look). */
export function cameraFor(name = LAB.framing) {
  const id = name === 'player-a' ? LAB.cast.A : name === 'player-b' ? LAB.cast.B : LAB.cast.host;
  let M = null;
  try {
    if (CAM && SCENE) M = CAM.lookMetrics(SCENE.actor(id, { side: 0, seed: 1 }).look);
  } catch {
    M = null;
  }
  return quizCamera(name, M);
}

function placeActor(cam, X) {
  if (CAM) return CAM.placeActor(cam, X);
  const k = (1000 * cam.zoom) / (SET.presenterZ - cam.z);
  return { x: 192 + (X - cam.x) * k, y: cam.hy + (SET.neckY - cam.y) * k, s: Math.max(0.5, Math.round(22 * k) / 22), k };
}

function wallReq() {
  if (LAB.wall === 'picture') return { mode: 'picture', image: IMAGES.get(LAB.image) || null, solo: true, story: true };
  return { mode: 'idle', phase: 'intro', solo: true };
}

const clipRows = new Int16Array(384);
const OPTS = { style: null, wall: null, shotSince: 0, lod: 0 };

/** The camera at time t: the framing, pushed by the lab's move (a dolly at the people's depth, as camera.js does). */
function camAt(t) {
  const base = cameraFor();
  const mv = LAB.move;
  if (!mv) return base;
  const e = Math.max(0, Math.min(1, (t - (mv.delay || 0)) / mv.dur));
  const f = 1 + mv.amount * (0.5 - 0.5 * Math.cos(Math.PI * e));
  return { ...base, z: SET.presenterZ - (SET.presenterZ - base.z) / f };
}

export function render(t = 0) {
  const style = styleFor(PROGRAMME);
  const cam = camAt(t);
  OPTS.style = style;
  OPTS.wall = wallReq();
  OPTS.shotSince = LAB.shotSince;
  drawBackground(frame, cam, t, OPTS);
  drawDesk(frame, cam, clipRows);
  let heads = [];
  if (LAB.presenters && SCENE) {
    const list = actors().map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
    heads = SCENE.drawActors(t, list, clipRows);
  }
  return { cam, heads, clipRows };
}

export function set(o = {}) {
  const before = `${LAB.framing}|${LAB.wall}|${LAB.image}`;
  if (o.cast) {
    LAB.cast = { ...LAB.cast, ...o.cast };
    delete o.cast;
  }
  Object.assign(LAB, o);
  if ('cache' in o) setCacheEnabled(o.cache);
  if ('question' in o || o.lamps || o.scores) setQuizState({ question: o.question, lamps: o.lamps, scores: o.scores }, o.at ?? NaN);
  if (`${LAB.framing}|${LAB.wall}|${LAB.image}` !== before) LAB.shotSince = (LAB.shotSince || 0) + 1;
  return { ...LAB };
}

/** Re-render from scratch: no cached frame, no wall history, the quiz state back to its start. */
export function reset() {
  invalidateSet();
  resetWall();
  resetQuizState();
}

const W = 384, H = 216;
const MASK = new Uint8Array(W * H);
function presenterMask() {
  MASK.fill(0);
  if (!SCENE || !LAB.presenters) return MASK;
  const m = SCENE.parts.mat;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (m[i] || m[i - 1] || m[i + 1] || m[i - W] || m[i + W]) MASK[i] = 1;
  }
  return MASK;
}

/**
 * Render at t and measure: each face's mean L* (its skin pixels), the 12 px ring round each head (presenters and the
 * board's content excluded: the head zone), the board's mean, the 4x4 studio patches brighter than the darkest face
 * (the red plate excluded, a brand block), and the set's census.
 */
export function measure(t = 10) {
  const { cam, heads } = render(t);
  const px = frame.px;
  const mask = presenterMask();
  const r = wallRect(cam);
  const inWall = (i) => {
    const x = i % W, y = (i / W) | 0;
    return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
  };
  const faces = [], boxes = [];
  for (const h of heads) {
    const s = h.s;
    let n = 0, sum = 0;
    for (let y = Math.floor(h.cy - 9 * s); y <= Math.ceil(h.cy + 10 * s); y++) for (let x = Math.floor(h.cx - 8 * s); x <= Math.ceil(h.cx + 8 * s); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const dx = (x + 0.5 - h.cx) / (7.5 * s), dy = (y + 0.5 - h.cy - 0.5 * s) / (9.5 * s);
      if (dx * dx + dy * dy > 1) continue;
      const nm = nameOf(px[y * W + x]);
      if (!nm || !SKIN.has(nm)) continue;
      n++;
      sum += lstarOf(px[y * W + x]);
    }
    faces.push(n > 6 * s * s ? sum / n : null);
    boxes.push({ x0: Math.floor(h.cx - 12 * s), y0: Math.floor(h.cy - 16 * s), x1: Math.ceil(h.cx + 12 * s), y1: Math.ceil(h.cy + 12 * s) });
  }
  const zones = boxes.map((b) => {
    let n = 0, sum = 0, max = 0;
    for (let y = Math.max(0, b.y0 - 12); y < Math.min(H, b.y1 + 12); y++) for (let x = Math.max(0, b.x0 - 12); x < Math.min(W, b.x1 + 12); x++) {
      const i = y * W + x;
      if (mask[i] || inWall(i)) continue;
      const L = lstarOf(px[i]);
      n++;
      sum += L;
      if (L > max) max = L;
    }
    return { mean: n ? sum / n : 0, max, n };
  });
  const by = {};
  let off = 0, setN = 0, wallSum = 0, wallN = 0;
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) continue;
    if (inWall(i)) {
      wallSum += lstarOf(px[i]);
      wallN++;
      continue;
    }
    const nm = nameOf(px[i]);
    setN++;
    if (!nm) off++;
    else by[nm] = (by[nm] || 0) + 1;
  }
  const faceMin = Math.min(...faces.filter((f) => f != null), 100);
  let patches = 0;
  for (let y = 0; y + 4 <= H; y += 2) for (let x = 0; x + 4 <= W; x += 2) {
    let ok = true;
    for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 4 && ok; i++) {
      const q = (y + j) * W + x + i;
      if (mask[q] || px[q] === C.red || px[q] === C.darkRed || lstarOf(px[q]) <= faceMin) ok = false;
    }
    if (ok) patches++;
  }
  return { framing: LAB.framing, cam, heads, faces, zones, wall: { mean: wallN ? wallSum / wallN : 0, n: wallN }, patches, set: { n: setN, off, by } };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** ms a frame for the current framing: the background uncached under a 4 % push, cached, and the desks. */
export function profile(n = 120) {
  const style = styleFor(PROGRAMME);
  const run = (fn) => {
    for (let i = 0; i < 8; i++) fn(i);
    const a = now();
    for (let i = 0; i < n; i++) fn(i);
    return (now() - a) / n;
  };
  const saved = LAB.move;
  setCacheEnabled(false);
  LAB.move = { amount: 0.04, delay: 0, dur: n / 60 + 1 };
  const out = {};
  out.bgUncached = run((i) => {
    OPTS.style = style;
    OPTS.wall = wallReq();
    drawBackground(frame, camAt(i / 60), 100 + i / 60, OPTS);
  });
  out.desk = run((i) => drawDesk(frame, camAt(i / 60), clipRows, style));
  LAB.move = saved;
  setCacheEnabled(true);
  const cam = cameraFor();
  out.bgCached = run(() => {
    OPTS.style = style;
    OPTS.wall = wallReq();
    drawBackground(frame, cam, 50, OPTS);
  });
  return out;
}

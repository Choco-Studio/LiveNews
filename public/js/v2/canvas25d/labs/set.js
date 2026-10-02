// Lab driver for the studio set, light and video wall (owner: STUDIO SET).
// Renders exact instants (deterministic contact sheets) and works in node too
// (tests and the measuring scripts import it; text and the logo need a DOM).
//
//   render(t)                 draw the instant t into scene.frame; returns { cam, heads }
//   set({ programme, framing, wall, presenters, cache, phase, image, place, lat, lon,
//         figure, label, sub, since, move, lod })
//   profile(n)                ms per frame: bg uncached worst case (moving camera, animating
//                             wall), bg cached, desk, actors — per the current programme/framing
//   FRAMINGS, WALLS, CASTS    the lab's vocabularies
//   setImage(name, img)       register a picture (a canvas / ImageData / { width, height, data })
import { C } from '../pixbuf.js';
import { frame, actor, drawActors } from '../scene.js';
import { drawBackground, drawDesk, setCacheEnabled, invalidateSet, wallRect, bgStats } from '../studio/set.js';
import { styleFor, STYLE_IDS } from '../studio/styles.js';
import { resetWall } from '../studio/wall.js';
import { framing as camFraming, cameraAt as camAt, makeCamera, placeActor } from '../camera.js';
import { SET } from '../studio/geometry.js';

export const CASTS = {
  'world-now': { A: 'paco', B: 'lola' },
  'tech-bytes': { A: 'max', B: 'ada' },
  cosmos: { A: 'nova', B: 'unit8' },
  'money-minute': { A: 'penny' },
  'news-60': { A: 'sam' },
  generic: { A: 'paco', B: 'lola' },
};
export const PROGRAMMES = [...STYLE_IDS, 'generic'];
export const FRAMINGS = ['wide', 'two', 'single-a', 'single-b', 'solo', 'mcu-l', 'mcu-r', 'ots'];
export const WALLS = ['idle', 'picture', 'map', 'figure', 'plate'];

export const LAB = {
  programme: 'world-now',
  framing: 'wide',
  wall: 'idle',
  presenters: true,
  cache: true,
  phase: 'intro',
  image: 'port',
  place: 'NAIROBI, KENYA',
  lat: -1.29,
  lon: 36.82,
  figure: { value: '$82.40', label: 'BRENT CRUDE' },
  label: 'OIL MARKETS',
  sub: 'REUTERS',
  since: 0,
  move: null,
  lod: 0,
  shotSince: 0,
};

const IMAGES = new Map();
export function setImage(name, img) {
  IMAGES.set(name, img);
}

const ACTORS = new Map();
function actorsFor(prog) {
  let list = ACTORS.get(prog);
  if (list) return list;
  const cast = CASTS[prog] || CASTS.generic;
  list = [];
  if (cast.B) {
    list.push({ slot: 'A', X: SET.seatX.A, a: actor(cast.A, { side: 1, seed: 11 }) });
    list.push({ slot: 'B', X: SET.seatX.B, a: actor(cast.B, { side: -1, seed: 23 }) });
  } else list.push({ slot: 'A', X: SET.seatX.solo ?? 0, a: actor(cast.A, { side: 0, seed: 17 }) });
  ACTORS.set(prog, list);
  return list;
}

/** The camera of a lab framing for the current programme (CAMERA's framing(), with fallbacks). */
export function cameraFor(name, prog = LAB.programme) {
  const cast = CASTS[prog] || CASTS.generic;
  const solo = !cast.B;
  const programId = prog === 'generic' ? 'weekend-review' : prog;
  const o = { cast, solo, programId, focus: 'A' };
  try {
    switch (name) {
      case 'wide':
        return camFraming('wide', o);
      case 'two':
        return camFraming('two', o);
      case 'single-a':
        return camFraming(solo ? 'mcu' : 'single', o);
      case 'single-b':
        return camFraming(solo ? 'mcu' : 'single', { ...o, focus: 'B' });
      case 'solo':
        return camFraming(solo ? 'solo-mcu' : 'mcu-l', o);
      case 'mcu-l':
      case 'mcu-r':
      case 'ots':
        return camFraming(name, o);
      default:
        return camFraming('wide', o);
    }
  } catch {
    return makeCamera();
  }
}

function wallReq() {
  const L = LAB;
  const prog = L.programme;
  const cast = CASTS[prog] || CASTS.generic;
  const solo = !cast.B;
  switch (L.wall) {
    case 'picture':
      return { mode: 'picture', image: IMAGES.get(L.image) || null, label: L.label, sub: L.sub, solo };
    case 'map':
      return { mode: 'map', location: { place: L.place, lat: L.lat, lon: L.lon }, since: L.since, solo };
    case 'figure':
      return { mode: 'figure', figure: L.figure, solo };
    case 'plate':
      return { mode: 'plate', label: L.label, sub: L.sub, solo };
    default:
      return { mode: 'idle', phase: L.phase, solo };
  }
}

const clipRows = new Int16Array(384);
const OPTS = { style: null, wall: null, shotSince: 0, lod: 0 };
const SPEC = { framing: 'wide', cast: null, focus: 'A', solo: false, programId: '', move: null };

/** Camera at time t: the framing, or the framing with the lab's move (dt from 0). */
function camAtTime(t) {
  const L = LAB;
  const base = cameraFor(L.framing);
  if (!L.move) return base;
  const prog = L.programme;
  const cast = CASTS[prog] || CASTS.generic;
  // a move is a dolly from the framing: reuse CAMERA's cameraAt on the equivalent spec
  try {
    SPEC.framing = L.framing === 'single-a' || L.framing === 'single-b' ? (cast.B ? 'single' : 'mcu') : L.framing === 'solo' ? (cast.B ? 'mcu-l' : 'solo-mcu') : L.framing;
    SPEC.cast = cast;
    SPEC.focus = L.framing === 'single-b' ? 'B' : 'A';
    SPEC.solo = !cast.B;
    SPEC.programId = prog;
    SPEC.move = L.move;
    return camAt(SPEC, t);
  } catch {
    return base;
  }
}

export function render(t = 0) {
  const L = LAB;
  const prog = L.programme;
  const style = styleFor(prog === 'generic' ? 'weekend-review' : prog);
  const cam = camAtTime(t);
  OPTS.style = style;
  OPTS.wall = wallReq();
  OPTS.shotSince = L.shotSince;
  OPTS.lod = L.lod;
  drawBackground(frame, cam, t, OPTS);
  drawDesk(frame, cam, clipRows);
  let heads = [];
  if (L.presenters) {
    const list = actorsFor(prog).map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
    heads = drawActors(t, list, clipRows);
  }
  return { cam, heads };
}

export function set(o = {}) {
  const before = `${LAB.programme}|${LAB.framing}|${LAB.wall}|${LAB.image}|${LAB.place}`;
  Object.assign(LAB, o);
  if ('cache' in o) setCacheEnabled(o.cache);
  const after = `${LAB.programme}|${LAB.framing}|${LAB.wall}|${LAB.image}|${LAB.place}`;
  // a lab change is a cut: the wall shows the new state at once
  if (before !== after || 'figure' in o || 'phase' in o) LAB.shotSince = (LAB.shotSince || 0) + 1;
  return { ...LAB };
}

/** Re-render the same state from scratch (tests: no cached frame, no wall history). */
export function reset() {
  invalidateSet();
  resetWall();
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Timings (ms per frame) for the current programme and framing:
 *   bgUncached  cache off, the camera pushing 4 % and the wall animating (map fly-in or the idle clock)
 *   bgCached    cache on, still camera, settled wall
 *   desk        cache off (the desk is cached with the background on a hit)
 */
export function profile(n = 120) {
  const L = LAB;
  const saved = { ...L };
  const prog = L.programme;
  const style = styleFor(prog === 'generic' ? 'weekend-review' : prog);
  const out = {};
  const run = (fn) => {
    for (let i = 0; i < 8; i++) fn(i);
    const a = now();
    for (let i = 0; i < n; i++) fn(i);
    return (now() - a) / n;
  };
  // uncached worst case: a slow push with the wall animating
  setCacheEnabled(false);
  L.move = { type: 'push', amount: 0.04, delay: 0, dur: n / 60 + 1 };
  const animWall = L.wall === 'map' ? wallReq() : wallReq();
  out.bgUncached = run((i) => {
    const t = 100 + i / 60;
    OPTS.style = style;
    OPTS.wall = animWall;
    if (animWall.mode === 'map') animWall.since = 100;
    OPTS.lod = 0;
    drawBackground(frame, camAtTime(i / 60), t, OPTS);
  });
  out.desk = run((i) => drawDesk(frame, camAtTime(i / 60), clipRows, style));
  L.move = null;
  // cached: still camera, settled content
  setCacheEnabled(true);
  const cam = cameraFor(L.framing);
  const still = wallReq();
  if (still.mode === 'map') still.since = -100;
  out.bgCached = run(() => {
    OPTS.style = style;
    OPTS.wall = still;
    drawBackground(frame, cam, 50, OPTS);
  });
  out.deskCached = run(() => {
    OPTS.wall = still;
    drawBackground(frame, cam, 50, OPTS);
    drawDesk(frame, cam, clipRows);
  }) - out.bgCached;
  if (L.presenters) {
    const list = actorsFor(prog).map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
    out.actors = run((i) => drawActors(10 + i / 60, list, clipRows));
  }
  Object.assign(L, saved);
  setCacheEnabled(L.cache);
  out.stats = bgStats();
  return out;
}

export { frame, wallRect, C };

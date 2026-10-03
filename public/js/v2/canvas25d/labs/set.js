// Lab driver for the studio set, light and video wall (owner: STUDIO SET).
// Renders exact instants (deterministic contact sheets) and works in node too
// (tests and the measuring scripts import it; text and the logo need a DOM).
//
//   render(t)                 draw the instant t into scene.frame; returns { cam, heads }
//   set({ programme, framing, wall, presenters, cache, phase, image, place, lat, lon,
//         figure, label, sub, since, move, lod, wipe })   (wipe/noCut: the change wipes, no cut)
//   profile(n)                ms per frame: bg uncached worst case (moving camera, animating
//                             wall), bg cached, desk, actors — per the current programme/framing
//   FRAMINGS, WALLS, CASTS    the lab's vocabularies
//   setImage(name, img)       register a picture (a canvas / ImageData / { width, height, data })
import { C, Frame } from '../pixbuf.js';
import { drawBackground, drawDesk, setCacheEnabled, invalidateSet, wallRect, bgStats } from '../studio/set.js';
import { styleFor, STYLE_IDS } from '../studio/styles.js';
import { resetWall } from '../studio/wall.js';
import { SET, kAt, sxOf, syOf } from '../studio/geometry.js';
import { lstarOf, nameOf, SATURATED, SKIN } from '../studio/color.js';

// The presenters and CAMERA's framings come from other streams' files, which may be mid-edit:
// load them dynamically so the set lab keeps working (set only, our own camera presets) if not.
let SCENE = null, CAM = null;
try {
  SCENE = await import('../scene.js');
} catch (err) {
  console.warn('[set lab] presenters unavailable:', err.message);
}
try {
  CAM = await import('../camera.js');
} catch (err) {
  console.warn('[set lab] camera.js unavailable, using the set lab presets:', err.message);
}
const frame = SCENE ? SCENE.frame : new Frame();
const makeCamera = (o = {}) => ({ x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0, ...o });
function placeActor(cam, X, Z = SET.presenterZ) {
  if (CAM) return CAM.placeActor(cam, X, Z);
  const k = kAt(cam, Z);
  return { x: sxOf(cam, k, X), y: syOf(cam, k, SET.neckY), s: Math.max(0.5, Math.round(22 * k) / 22), k };
}
const PRESETS = {
  wide: makeCamera(),
  'solo-wide': makeCamera({ x: 0, y: -36, z: 80, hy: 76 }),
  two: makeCamera({ z: 420, hy: 59 }),
};

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
  sub: 'LAGOS, NIGERIA', // a story plate carries the place under the kicker (the strap shows the source)
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
  const actor = SCENE.actor;
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
  if (!CAM) return name === 'two' ? PRESETS.two : solo ? PRESETS['solo-wide'] : PRESETS.wide;
  const camFraming = CAM.framing;
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
    // (story: true, as wallFromScene marks every story's wall: its plate is set in body 1x)
    case 'picture':
      return { mode: 'picture', image: IMAGES.get(L.image) || null, label: L.label, sub: L.sub, solo, story: true };
    case 'map':
      return { mode: 'map', location: { place: L.place, lat: L.lat, lon: L.lon }, since: L.since, solo, story: true };
    case 'figure':
      return { mode: 'figure', figure: L.figure, solo, story: true };
    case 'plate':
      return { mode: 'plate', label: L.label, sub: L.sub, solo, story: L.story ?? true };
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
  if (!CAM) return base;
  try {
    SPEC.framing = L.framing === 'single-a' || L.framing === 'single-b' ? (cast.B ? 'single' : 'mcu') : L.framing === 'solo' ? (cast.B ? 'mcu-l' : 'solo-mcu') : L.framing;
    SPEC.cast = cast;
    SPEC.focus = L.framing === 'single-b' ? 'B' : 'A';
    SPEC.solo = !cast.B;
    SPEC.programId = prog;
    SPEC.move = L.move;
    return CAM.cameraAt(SPEC, t);
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
  if (L.presenters && SCENE) {
    const list = actorsFor(prog).map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
    heads = SCENE.drawActors(t, list, clipRows);
  }
  return { cam, heads };
}

export function set(o = {}) {
  const before = `${LAB.programme}|${LAB.framing}|${LAB.wall}|${LAB.image}|${LAB.place}`;
  Object.assign(LAB, o);
  if ('cache' in o) setCacheEnabled(o.cache);
  const after = `${LAB.programme}|${LAB.framing}|${LAB.wall}|${LAB.image}|${LAB.place}`;
  // a lab change is a cut: the wall shows the new state at once
  // (noCut: true, or wipe: true, changes the wall in the same shot, as a director update without a
  // cut: it wipes over 0.3 s, so a contact sheet can show the wipe)
  if (!o.noCut && !o.wipe && (before !== after || 'figure' in o || 'phase' in o)) LAB.shotSince = (LAB.shotSince || 0) + 1;
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
 *   bgPatch     cache on, still camera, the wall animating (patched into the cached frame)
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
  // cache on, still camera, the wall animating (the globe / planet clock, a map flying in): the
  // wall is patched into the cached frame
  const anim2 = wallReq();
  out.bgPatch = run((i) => {
    OPTS.style = style;
    OPTS.wall = anim2;
    if (anim2.mode === 'map') anim2.since = 200;
    drawBackground(frame, cam, 200 + i / 60, OPTS);
  });
  out.deskCached = run(() => {
    OPTS.wall = still;
    drawBackground(frame, cam, 50, OPTS);
    drawDesk(frame, cam, clipRows);
  }) - out.bgCached;
  if (L.presenters && SCENE) {
    const list = actorsFor(prog).map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
    out.actors = run((i) => SCENE.drawActors(10 + i / 60, list, clipRows));
  }
  Object.assign(L, saved);
  setCacheEnabled(L.cache);
  out.stats = bgStats();
  return out;
}


// ---------------------------------------------------------------------------
// Measuring (the bibles' value and colour checks; node tests and the lab use it)

const W = 384, H = 216;
const MASK = new Uint8Array(W * H);

/** Presenter pixels (materials plus their 1 px outline) of the last drawActors. */
function presenterMask() {
  MASK.fill(0);
  if (!SCENE || !LAB.presenters) return MASK;
  const m = SCENE.parts.mat;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (m[i] || m[i - 1] || m[i + 1] || m[i - W] || m[i + W]) MASK[i] = 1;
    }
  }
  return MASK;
}

function stats(px, test) {
  let n = 0, sum = 0, max = 0;
  const by = {};
  for (let i = 0; i < W * H; i++) {
    if (!test(i)) continue;
    const L = lstarOf(px[i]);
    n++;
    sum += L;
    if (L > max) max = L;
    const nm = nameOf(px[i]) || 'off';
    by[nm] = (by[nm] || 0) + 1;
  }
  return { n, mean: n ? sum / n : 0, max, by };
}
const shareOf = (st, names) => (st.n ? names.reduce((a, k) => a + (st.by[k] || 0), 0) / st.n : 0);

/**
 * Render the current lab state at t and measure it:
 *   faces [mean L* of each human face], headZone (duo: the art-direction head-zone rectangles in
 *   the wide; solo: the 12 px ring around the head) mean / max, wall mean, ring patches brighter
 *   than the face, and the set census (presenters and wall content excluded): saturated share,
 *   accent and tint shares, off-palette count.
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
  const style = styleFor(LAB.programme === 'generic' ? 'weekend-review' : LAB.programme);
  const faces = [];
  const boxes = [];
  for (const h of heads) {
    const s = h.s;
    let n = 0, sum = 0;
    for (let y = Math.floor(h.cy - 9 * s); y <= Math.ceil(h.cy + 10 * s); y++) {
      for (let x = Math.floor(h.cx - 8 * s); x <= Math.ceil(h.cx + 8 * s); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dx = (x + 0.5 - h.cx) / (7.5 * s), dy = (y + 0.5 - h.cy - 0.5 * s) / (9.5 * s);
        if (dx * dx + dy * dy > 1) continue;
        const nm = nameOf(px[y * W + x]);
        if (!nm || !SKIN.has(nm)) continue;
        n++;
        sum += lstarOf(px[y * W + x]);
      }
    }
    if (n > 6 * s * s) faces.push(sum / n);
    boxes.push({ x0: Math.floor(h.cx - 12 * s), y0: Math.floor(h.cy - 16 * s), x1: Math.ceil(h.cx + 12 * s), y1: Math.ceil(h.cy + 12 * s) });
  }
  const cast = CASTS[LAB.programme] || CASTS.generic;
  let zone;
  if (cast.B && LAB.framing === 'wide') {
    const inRect = (i, x0, y0, x1, y1) => {
      const x = i % W, y = (i / W) | 0;
      return x >= x0 && x < x1 && y >= y0 && y < y1;
    };
    zone = stats(px, (i) => !mask[i] && !inWall(i) && (inRect(i, 80, 40, 140, 110) || inRect(i, 244, 40, 304, 110)));
  } else {
    // a 12 px ring around each head box (news-60.md "head zone")
    zone = stats(px, (i) => {
      if (mask[i]) return false;
      const x = i % W, y = (i / W) | 0;
      for (const b of boxes) if (x >= b.x0 - 12 && x < b.x1 + 12 && y >= b.y0 - 12 && y < b.y1 + 12) return true;
      return false;
    });
  }
  const wall = stats(px, (i) => !mask[i] && inWall(i));
  const set = stats(px, (i) => !mask[i] && !inWall(i));
  // studio 4x4 patches brighter than the face mean (presenters excluded, and the desk's red logo
  // plate: a network brand block, like the bug, not studio light)
  const faceMean = faces.length ? Math.min(...faces) : 100;
  let patches = 0;
  for (let y = 0; y + 4 <= H; y += 2) {
    for (let x = 0; x + 4 <= W; x += 2) {
      let ok = true;
      for (let j = 0; j < 4 && ok; j++) for (let i = 0; i < 4 && ok; i++) {
        const q = (y + j) * W + x + i;
        if (mask[q] || px[q] === C.red || px[q] === C.darkRed || lstarOf(px[q]) <= faceMean) ok = false;
      }
      if (ok) patches++;
    }
  }
  return {
    programme: LAB.programme,
    framing: LAB.framing,
    wallMode: LAB.wall,
    faces,
    headZone: { mean: zone.mean, max: zone.max, n: zone.n },
    wall: { mean: wall.mean, max: wall.max, n: wall.n },
    patches,
    set: {
      n: set.n,
      saturated: shareOf(set, [...SATURATED]),
      accent: shareOf(set, [style.accentName]),
      cyan: shareOf(set, ['cyan']),
      yellow: shareOf(set, ['yellow']),
      cosmosColours: shareOf(set, ['magenta', 'purple']),
      tint: shareOf(set, style.tintNames || []),
      navy: shareOf(set, ['navy']),
      off: set.by.off || 0,
      by: set.by,
    },
  };
}

export { frame, wallRect, C };
export const hasPresenters = () => !!SCENE;
export const hasCamera = () => !!CAM;

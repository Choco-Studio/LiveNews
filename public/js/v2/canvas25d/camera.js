// Virtual studio camera for canvas25d (owner: CAMERA stream).
//
// A camera is a pedestal that trucks (x), pedestals (y / hy), dollies (z) and
// zooms; it never pans or rolls, so planes facing the lens stay 2D layers and
// a slow push-in re-rasterises every layer at its exact scale (pixel-clean,
// no bitmap scaling). See studio/geometry.js for the projection.
//   makeCamera(o)              a camera object { x, y, z, zoom, hy, soft }
//   placeActor(cam, X, Z)      screen position + scale of a seated presenter's neck base
//   singleCam(slot, k)         the approved single on seat A or B, k = presenter scale
//   framing(name, opts)        a named framing (the shot grammar's vocabulary, below)
//   cameraAt(spec, dt, out?)   the camera of a shot at dt s after its move event
//                              (framing + the programme's allowed move, eased)
//   framingInfo(cam, cast)     screen boxes of heads, wall bezel and wall content
//                              (tests, labs, and SET's wall layout)
//
// FRAMINGS (opts = { cast, focus, solo, side, programId }):
//   'wide'       the wide two-shot (solo casts get 'solo-wide')
//   'two'        the tighter two-shot (the end of the owner-approved push)
//   'single'     the approved single of the focus seat (camera demo, k 3.4)
//   'close'      a tighter single (THE CATCH)
//   'mcu-l'      MCU with the speaker on the left third and the wall content in
//   'mcu-r'      the right third (mirrored for -r; a duo speaker always keeps
//                their own seat's side, the wall being between the seats); the programme decides the
//                numbers (WORLD NOW: speaker in the third nearer their desk
//                position; MONEY MINUTE MCU-R: head centre x 248-264, eye line
//                y 64-76; NEWS IN 60: MCU-L)
//   'mcu'        centred MCU (solo, no picture)
//   'ots'        over-the-shoulder wall framing: the speaker in the near third,
//                the whole video wall beside the head (replaces the inset box)
//   'solo-wide' / 'solo-mcu'   the solo-desk versions (SET.seatX.solo)
// Every studio framing keeps the head inside the frame, below the bug and the
// top graphics row (y 8-21), the chin above the caption band (y 136) in
// singles, eye lines on the thirds, and no bezel edge within 4 px of a head
// (6 px targeted). Scales are quantised by placeActor.
//
// MOVES (cameraAt): a move is a dolly along z with the framing's x, y, hy and
// zoom fixed, so every static point moves monotonically on screen (sx and sy
// are monotone in k) and each layer edge, rounded to whole pixels, steps at
// most once per frame at the slow rates the bibles allow. move = { type:
// 'push' | 'pull', amount (scale fraction at the presenters' depth, ≤ 0.06
// hard ceiling), delay (s after the event), dur (s), from? (start scale, 1) };
// eased sine in-out, no overshoot. A pull widens from the framing by `amount`.
import { F, SET, kAt, sxOf, syOf } from './studio/geometry.js';
import { lookFor } from './cast/index.js';
import { PartBuffer } from './pixbuf.js';
import { drawCharacter, GROUPS } from './character.js';
import { poseAt } from './rig.js';

export { kAt };

/** Hard ceiling for any move (the bibles' own numbers are lower). */
export const MOVE_CEILING = 0.06;

export function makeCamera(o = {}) {
  return { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0, ...o };
}

/** Presenter scale quantised so the head (22 u) is a whole number of pixels: fewer re-samples while zooming. */
export const quantScale = (k) => Math.max(0.5, Math.round(22 * k) / 22);

/** Screen position and scale of a seated presenter's neck base. */
export function placeActor(cam, X, Z = SET.presenterZ) {
  const k = kAt(cam, Z);
  const s = quantScale(k);
  return { x: sxOf(cam, k, X), y: syOf(cam, k, SET.neckY), s, k };
}

/** Single camera on a seat, composed so the screen's edge never sits next to the head (approved demo). */
export function singleCam(slot, k = 3.0) {
  const cz = 460;
  const zoom = (k * (SET.presenterZ - cz)) / F;
  const kw = (k * (SET.presenterZ - cz)) / (SET.wallZ - cz);
  const side = slot === 'B' ? 1 : -1;
  const seat = Math.abs(SET.seatX[slot === 'B' ? 'B' : 'A']);
  const edge = Math.abs(slot === 'B' ? SET.screen.x1 : SET.screen.x0);
  // largest |cam.x| that keeps the bezel clear of the head (≥ 14 u of head + hair + margin)
  const clear = 10.5 * k;
  const cx = side * ((seat * k - edge * kw - clear) / (k - kw));
  const neck = 26 + 23.6 * k; // head top 26 px below the frame top
  return makeCamera({ x: cx, y: -60, z: cz, zoom, hy: neck - (SET.neckY + 60) * k, soft: 1 });
}

// ---------------------------------------------------------------------------
// Look metrics: where a presenter's head sits relative to the neck base (rig
// units, y down). Hair volume and ears are included with a small margin for
// the idle sway and nods; gestures that lean (lean_in) stay inside the
// clearance margins below.

const METRICS = new WeakMap();
// Hair volume beyond the skull per hair style (head-local units: extra height above
// head.top, extra half width beyond the cheeks / cranium). Looks with more volume may
// publish their own `L.bounds = { top, hw }` (head-local, from the head centre).
const HAIR = {
  bob: [2.2, 2.6],
  coily: [3.9, 4.1], // CAST-B: curls reach ~13.8 u above and ~11.3 u beside the head centre
  textured: [2.4, 2.0],
  chignon: [2.0, 2.2],
  none: [5.2, 1.2], // UNIT-8: the antenna tip ~15 u above the head centre
};
export function lookMetrics(L) {
  if (L && METRICS.has(L)) return METRICS.get(L);
  const H = L?.head || { top: -10.2, R: 7.6, cheekHW: 7.15, chinY: 9.4 };
  const at = L?.headAt || [0, -13.4];
  const [up, side] = HAIR[L?.hair?.style] || [1.7, 1.9];
  let top = at[1] + (Number.isFinite(L?.bounds?.top) ? L.bounds.top : H.top - up);
  let hw = Number.isFinite(L?.bounds?.hw) ? L.bounds.hw : Math.max(H.R, H.cheekHW) + side;
  // the drawn head (hair, ears, glasses, antenna) measured once per look, with a margin for sway and nods
  const m = L && !L.bounds ? measureHead(L, at[1] + H.chinY) : null;
  if (m) {
    top = m.top - 1.4; // margin: sway, nods and the 1.5x sampling
    hw = m.hw + 1.4;
  }
  const out = {
    cx: at[0],
    cy: at[1],
    top, // crown of the hair (or antenna), relative to the neck base
    chin: at[1] + H.chinY,
    eye: at[1] + (L?.eyes?.y ?? -0.7),
    hw, // half width with ears / hair
  };
  if (L) METRICS.set(L, out);
  return out;
}

/** Measure the cast's looks ahead of the first cut (INTEGRATION: call it when an episode arrives, idle time). */
export function warmFraming(cast = {}) {
  for (const id of Object.values(cast)) if (id) lookMetrics(lookFor(id));
}

let MEASURE_BUF = null;
/**
 * Extent of the head groups above the chin (rig units from the neck base), from
 * the look drawn at s = 3 in a few idle poses. null if the rig cannot draw it.
 */
function measureHead(L, chin) {
  try {
    MEASURE_BUF ??= new PartBuffer();
    const buf = MEASURE_BUF;
    const s = 1.5, X = 192, Y = 100; // small: a few ms per look, once (warmFraming() at episode arrival)
    const head = new Set([GROUPS.hairBack, GROUPS.ears, GROUPS.head, GROUPS.hair, GROUPS.over]);
    for (let g = GROUPS.look; g <= GROUPS.glassesEnd; g++) head.add(g);
    const a = { id: L.id, look: L, perf: { side: 1, seed: 11, gestures: [], emotions: [], look: [] } };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
    const yc = Math.floor(Y + chin * s);
    for (const t of [0, 2.6]) {
      buf.clear();
      drawCharacter(buf, L, poseAt(a, t), { x: X, y: Y, s, gb: 0, clip: false });
      for (let y = Math.max(0, buf.by0); y < Math.min(yc, buf.by1); y++) {
        for (let x = buf.bx0; x < buf.bx1; x++) {
          const i = y * buf.w + x;
          if (!buf.mat[i] || !head.has(buf.grp[i])) continue;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
        }
      }
    }
    if (!Number.isFinite(y0)) return null;
    return { top: (y0 - Y) / s, hw: Math.max(X - x0, x1 + 1 - X) / s };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Composition: a single is specified by the presenter's scale k, where the head
// centre and the eye line land on screen, and the camera's distance cz (cz sets
// the parallax between presenter and wall: near camera = more wall beside the
// head, far camera with a long lens = a bigger wall). cy is the camera height.

function compose({ X, k, headX, eyeY, cz = 460, cy = -60, soft = 1, look }) {
  const zoom = (k * (SET.presenterZ - cz)) / F;
  const s = quantScale(k);
  const M = lookMetrics(look);
  const x = X + (M.cx * s) / k - (headX - 192) / k;
  const hy = eyeY - (SET.neckY - cy) * k - M.eye * s;
  return makeCamera({ x, y: cy, z: cz, zoom, hy, soft });
}

/** Screen boxes for a camera: heads (rest pose), the wall bezel (outer edge) and the wall content. */
export function framingInfo(cam, actors = []) {
  const kw = kAt(cam, SET.wallZ);
  const S = SET.screen;
  const x0 = Math.round(sxOf(cam, kw, S.x0)), x1 = Math.round(sxOf(cam, kw, S.x1));
  const y0 = Math.round(syOf(cam, kw, S.y0)), y1 = Math.round(syOf(cam, kw, S.y1));
  const b = Math.max(1, Math.round(2 * kw)) + 1; // studio/set.js drawScreen: bezel + 1 px black edge
  const heads = actors.map(({ slot, X, look }) => {
    const p = placeActor(cam, X);
    const M = lookMetrics(look);
    const ox = Math.round(p.x), oy = Math.round(p.y);
    const cx = ox + M.cx * p.s;
    return {
      slot,
      s: p.s,
      cx,
      x0: Math.floor(cx - M.hw * p.s),
      x1: Math.ceil(cx + M.hw * p.s),
      y0: Math.floor(oy + M.top * p.s),
      y1: Math.ceil(oy + M.chin * p.s),
      eye: oy + M.eye * p.s,
      neck: oy,
    };
  });
  return { heads, kw, wall: { x0, y0, x1, y1 }, bezel: { x0: x0 - b, y0: y0 - b, x1: x1 + b, y1: y1 + b } };
}

/** Smallest distance in px between a head box and the bezel's four edges (Infinity if none is near). */
export function bezelClearance(head, bezel) {
  const edges = [
    [bezel.x0, bezel.y0, bezel.x0, bezel.y1],
    [bezel.x1, bezel.y0, bezel.x1, bezel.y1],
    [bezel.x0, bezel.y0, bezel.x1, bezel.y0],
    [bezel.x0, bezel.y1, bezel.x1, bezel.y1],
  ];
  let best = Infinity;
  for (const [ax, ay, bx, by] of edges) {
    // distance between an axis-aligned segment and the head box
    const dx = Math.max(head.x0 - Math.max(ax, bx), Math.min(ax, bx) - head.x1, 0);
    const dy = Math.max(head.y0 - Math.max(ay, by), Math.min(ay, by) - head.y1, 0);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

// ---------------------------------------------------------------------------
// Framing table. Numbers are screen targets (head centre x, eye line y) and
// the presenter scale; studio/geometry.js supplies every set position, so a
// SET change re-composes the shots instead of breaking them.

const WIDE = { x: 0, y: -60, z: 0, zoom: 1, hy: 52, soft: 0 };
// the tighter two-shot (the closing exchange, shots.js closingRun): ~1.86x the wide, eye lines at
// y ≈ 84, the camera raised a little so the desk front and its red plate drop behind the ticker
// band (y ≥ 202) instead of sitting under the captions; the wall's lower half stays between the heads
const TWO = { x: 0, y: -80, z: 460, zoom: 1, hy: 17.3, soft: 0 };
// solo desk: a touch tighter than the duo wide, camera lowered so the wall's bottom
// edge passes behind the shoulders (not across the chin) and the plate stays above the strap
const SOLO_WIDE = { x: 0, y: -36, z: 80, zoom: 1, hy: 76, soft: 0 };

// Singles per programme: k (presenter scale), headX for the LEFT version (the
// right version mirrors around x 192), eyeY, cz, cy. MONEY MINUTE's MCU-R is
// given as its own right-hand numbers (bible: head centre x 248-264, eye 64-76).
const SINGLES = {
  default: {
    mcu: { k: 3.2, headX: 120, eyeY: 70, cz: 520, cy: -36 },
    close: { k: 3.8, headX: 136, eyeY: 72, cz: 520, cy: -38 },
    centre: { k: 3.2, headX: 192, eyeY: 70, cz: 420, cy: -36 },
    ots: { k: 2.4, headX: 100, eyeY: 74, cz: 640, cy: -24, soft: 0 },
  },
  'money-minute': { mcuR: { k: 3.4, headX: 256, eyeY: 70, cz: 0, cy: -48 } },
  'news-60': { mcu: { k: 2.75, headX: 116, eyeY: 72, cz: 380, cy: -36 }, centre: { k: 3.3, headX: 192, eyeY: 70, cz: 420, cy: -36 } },
};

const CLEAR = 10; // px kept between a head and a bezel edge (ART_DIRECTION: none within 6 px; tests: 4)
const CROWN_MIN = 24; // the crown stays below the top graphics row (bug, tag, clock: y 8-21)
const EYE_MAX = 78; // eye lines stay on the upper third (y 60-80)
const EDGE_MIN = 20; // px of air kept between a head (with its hair) and the frame's side

/** The bezel edge nearest a head box: { gap, vertical, edge } (edge = its screen x or y). */
function nearestEdge(h, bz) {
  const edges = [
    { vertical: true, edge: bz.x0, a: bz.y0, b: bz.y1 },
    { vertical: true, edge: bz.x1, a: bz.y0, b: bz.y1 },
    { vertical: false, edge: bz.y0, a: bz.x0, b: bz.x1 },
    { vertical: false, edge: bz.y1, a: bz.x0, b: bz.x1 },
  ];
  let best = null;
  for (const e of edges) {
    const along = e.vertical ? Math.max(h.y0 - e.b, e.a - h.y1, 0) : Math.max(h.x0 - e.b, e.a - h.x1, 0);
    const across = e.vertical ? Math.max(h.x0 - e.edge, e.edge - h.x1, 0) : Math.max(h.y0 - e.edge, e.edge - h.y1, 0);
    const gap = Math.hypot(along, across);
    if (!best || gap < best.gap) best = { ...e, gap };
  }
  return best;
}

/**
 * Compose a single, then walk it clear of the bezel: a vertical edge next to the
 * head moves the head away from it (the wall shifts less than the presenter, so
 * the gap opens); the bottom edge near the chin lowers the camera (the wall drops
 * behind the shoulders); a top edge near the crown raises it.
 */
function fitSingle(spec, slot) {
  let cam = compose(spec);
  for (let i = 0; i < 40; i++) {
    const info = framingInfo(cam, [{ slot, X: spec.X, look: spec.look }]);
    const h = info.heads[0];
    if (h.y0 < CROWN_MIN) {
      // big hair (or an antenna): keep the crown below the top graphics row; past the
      // lower third of the eye-line band the shot loosens instead
      const eyeY = spec.eyeY + (CROWN_MIN - h.y0);
      spec = eyeY <= EYE_MAX ? { ...spec, eyeY } : { ...spec, k: spec.k * 0.94 };
      cam = compose(spec);
      continue;
    }
    const e = nearestEdge(h, info.bezel);
    if (e.gap >= CLEAR) break;
    if (e.vertical) {
      const kp = kAt(cam, SET.presenterZ), kw = info.kw;
      const dir = h.cx < e.edge ? -1 : 1;
      const step = dir * Math.max(1, (CLEAR - e.gap + 1) / Math.max(0.2, 1 - kw / kp));
      // the frame edge wins over the bezel: a head that would crowd the frame edge gets a looser shot instead
      if (h.x0 + step < EDGE_MIN || h.x1 + step > 384 - EDGE_MIN) spec = { ...spec, k: spec.k * 0.95 };
      else spec = { ...spec, headX: spec.headX + step };
    } else {
      const below = e.edge >= (h.y0 + h.y1) / 2;
      spec = { ...spec, cy: (spec.cy ?? -60) + (below ? 3 : -3) };
    }
    cam = compose(spec);
  }
  return cam;
}

const mirror = (x) => 384 - x;

function seatOf(slot, solo) {
  if (solo) return SET.seatX.solo ?? 0;
  return slot === 'B' ? SET.seatX.B : SET.seatX.A;
}

function lookOf(cast, slot) {
  const id = cast?.[slot] ?? cast?.A ?? 'paco';
  return lookFor(id);
}

const CACHE = new Map();

/**
 * A named framing as a camera (cached; treat the result as read-only).
 * @param name  see the header (unknown names fall back to the wide or the single)
 * @param opts  { cast: { A: id, B?: id }, focus: 'A'|'B', solo?: bool, side?: +1|-1, programId }
 */
export function framing(name, opts = {}) {
  const cast = opts.cast || { A: 'paco', B: 'lola' };
  const solo = opts.solo ?? !cast.B;
  const focus = opts.focus === 'B' && !solo ? 'B' : 'A';
  const programId = opts.programId || 'world-now';
  const key = `${name}|${programId}|${focus}|${solo ? 1 : 0}|${opts.side ?? ''}|${cast.A}|${cast.B ?? ''}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const cam = build(name, { cast, solo, focus, programId, side: opts.side });
  if (CACHE.size > 256) CACHE.clear();
  CACHE.set(key, cam);
  return cam;
}

function build(name, { cast, solo, focus, programId, side }) {
  const look = lookOf(cast, focus);
  const X = seatOf(focus, solo);
  const P = { ...SINGLES.default, ...(SINGLES[programId] || {}) };
  // which side of the frame the speaker takes: their own seat side for duos,
  // or as the name / opts say
  const leftSeat = solo ? side !== -1 : focus === 'A';
  switch (name) {
    case 'wide':
      return makeCamera(solo ? SOLO_WIDE : WIDE);
    case 'solo-wide':
      return makeCamera(SOLO_WIDE);
    case 'two':
      return makeCamera(solo ? SOLO_WIDE : TWO);
    case 'single': {
      // the approved single's composition (camera demo, k 3.4), walked clear of the bezel
      if (solo) return build('mcu', { cast, solo, focus, programId, side });
      const ref = singleCam(focus, 3.4);
      const h = framingInfo(ref, [{ slot: focus, X, look }]).heads[0];
      // keep the crown below the top graphics row (y 8-21) whatever the hair
      const eyeY = h.eye + Math.max(0, 24 - h.y0);
      return fitSingle({ k: 3.4, headX: h.cx, eyeY, cz: ref.z, cy: ref.y, X, look }, focus);
    }
    case 'close': {
      const c = P.close;
      const left = leftSeat;
      return fitSingle({ ...c, X, look, headX: left ? c.headX : mirror(c.headX) }, focus);
    }
    case 'mcu-l':
    case 'mcu-r': {
      // a duo speaker keeps their own seat's side (the wall is between the seats)
      const left = solo ? name === 'mcu-l' : focus === 'A';
      if (!left && P.mcuR) return fitSingle({ ...P.mcuR, X, look }, focus);
      const c = P.mcu;
      return fitSingle({ ...c, X, look, headX: left ? c.headX : mirror(c.headX) }, focus);
    }
    case 'mcu':
    case 'solo-mcu': {
      if (!solo) return build(leftSeat ? 'mcu-l' : 'mcu-r', { cast, solo, focus, programId, side });
      return fitSingle({ ...P.centre, X, look }, focus);
    }
    case 'ots': {
      const c = P.ots;
      const left = leftSeat;
      return fitSingle({ ...c, X, look, headX: left ? c.headX : mirror(c.headX) }, focus);
    }
    default:
      return solo || name === 'full' || name === 'map' || name === 'fact' ? makeCamera(solo ? SOLO_WIDE : WIDE) : singleCam(focus, 3.4);
  }
}

/** The framing names this module composes. */
export const FRAMINGS = ['wide', 'two', 'single', 'close', 'mcu-l', 'mcu-r', 'mcu', 'ots', 'solo-wide', 'solo-mcu'];

// ---------------------------------------------------------------------------
// Moves

/** Sine in-out: zero speed at both ends, no overshoot. */
export const easeMove = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * u));

/**
 * Scale factor of a move at dt s after its event (1 = the framing itself).
 * A push goes from `from` (default 1) to from·(1 + amount); a pull from `from`
 * to from / (1 + amount), wider than the framing, so a move never starts with a
 * jump whether or not its event was a cut.
 */
export function moveScale(move, dt) {
  if (!move || !(move.amount > 0) || !(move.dur > 0)) return move?.from > 0 ? move.from : 1;
  const a = Math.min(MOVE_CEILING, move.amount);
  const from = move.from > 0 ? move.from : 1;
  const e = easeMove((dt - (move.delay || 0)) / move.dur);
  return move.type === 'pull' ? from / (1 + a * e) : from * (1 + a * e);
}

const SCRATCH = makeCamera();
const SPECS = new WeakMap(); // spec object → { fields, cam }: per-frame calls allocate nothing

function baseOf(spec) {
  if (!spec || typeof spec !== 'object') return framing('wide', {});
  const name = spec.framing || 'wide';
  const cast = spec.cast;
  const e = SPECS.get(spec);
  if (e && e.name === name && e.programId === spec.programId && e.focus === spec.focus && e.solo === spec.solo && e.side === spec.side && e.A === cast?.A && e.B === cast?.B) return e.cam;
  const cam = framing(name, spec);
  if (e) Object.assign(e, { name, programId: spec.programId, focus: spec.focus, solo: spec.solo, side: spec.side, A: cast?.A, B: cast?.B, cam });
  else SPECS.set(spec, { name, programId: spec.programId, focus: spec.focus, solo: spec.solo, side: spec.side, A: cast?.A, B: cast?.B, cam });
  return cam;
}

/**
 * The camera of a shot at dt s after the event that started its move.
 * @param spec  { framing, cast, focus, solo, side, programId, move } (reuse the same
 *              object across frames: its framing camera is cached on it)
 * @param out   optional camera to write into (default: a shared scratch object,
 *              valid until the next call; framing cameras are never mutated)
 */
export function cameraAt(spec, dt = 0, out = SCRATCH) {
  const base = baseOf(spec);
  const f = moveScale(spec?.move, dt);
  if (f === 1) return base;
  // dolly: the presenters' depth gets k·f; x, y, hy and zoom stay, so the move is monotone
  const Zs = SET.presenterZ;
  out.x = base.x;
  out.y = base.y;
  out.zoom = base.zoom;
  out.hy = base.hy;
  out.soft = base.soft;
  out.z = Zs - (Zs - base.z) / f;
  return out;
}

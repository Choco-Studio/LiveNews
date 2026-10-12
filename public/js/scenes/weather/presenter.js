// The weather presenter's movement (owner 3 Oct, round 2: "quiero que el hombre se mueva... el movimiento por
// el plató tiene que ser natural y señalar correctamente las cosas, con movimientos naturales cuando señala").
//
//   walk      side-steps along the wall, facing the camera (as weather presenters move): the lead foot steps
//             out, the weight goes over it, the other foot closes; the feet stay PLANTED on the floor between
//             steps (the legs pivot over them), the body dips a little as the feet open and sways over the
//             foot that carries it; the head turns toward where he is going and comes back to the lens
//   stand     the weight moves from one foot to the other now and then, never a statue
//   point     an aimed point: the hand goes where the city is on the wall, not to a fixed spot. The rig's
//             point_screen (eyes lead, the head follows, the arm rises with a little overshoot, holds, the
//             look comes back to the lens while the hand stays, the hand returns) with its apex replaced by a
//             wrist on the line from the shoulder to the target; the arm nearer the target does it
//   present   an open hand offered to the map (the rig's point_screen 'open'), for a zone as a whole
//   step to   a step or two toward the part of the map being spoken about, within his side of the frame
//
//
// The close-up's gestures (round 4: the seated beats read as small hand movements at the waist), a weather
// presenter's own, each on the word the writer marks (seg.gestures, delivered as the voice reaches them):
//   place     an open hand toward the place on the wall behind him (aimedOpen: the palm up and to the lens, the
//             fingers toward it, the eyes there first and back to the lens while the hand stays)
//   world     both palms open and out to the sides for the big picture ("round the world", "wherever you are")
//   sweep     the open hand drawn along a direction for movement ("moving north-east"), the eyes with it
//   count     the fingers counting what is coming up (the rig's count)
//   p.gesture(kind, t, o)   plans one (never two arm gestures closer than o.gap; the variants rotate)
//
//   const p = new Presenter(standing, { scale, neckY })   p.place(x) / p.walkTo(x, t) / p.pointAt(x, y, t)
//   p.present(t, side) / p.stepToward(x, t, range) / p.update(t) / p.draw(ctx, t, post) / p.render(t, post)
import { GESTURES, registerGestures, mirrorDef } from '../../v2/canvas25d/gestures/index.js';
import { LIBRARY } from '../../v2/canvas25d/gestures/library.js';
import { BEATS } from '../../v2/canvas25d/gestures/beats.js';
import { FLAT } from '../../v2/canvas25d/gestures/shapes.js';

const STANCE = 9.4; // cm from the centre line to each foot when standing (a little wider than the hips)
const STEP = { stride: 34, half: 0.24, lift: 3.2, minSteps: 1 }; // cm per side-step, s per foot move
const GESTURE_GAP = 2.3; // s between two arm gestures (the point is 2.1 s)

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, k) => a + (b - a) * k;

// ------------------------------------------------------------------------------------------- aimed points
const AIMED = new Map();
/**
 * The rig's point_screen aimed at a direction (partner space: x toward the target side, y down, unit vector
 * from the shoulder), as a named gesture definition (cached per tenth of a radian).
 */
export function aimedPoint(dx, dy, reach = 31) {
  const a = Math.atan2(dy, Math.max(0.05, dx));
  const q = Math.round(a * 10);
  const name = `point_at_${q}_${Math.round(reach)}`;
  if (AIMED.has(name)) return name;
  const ang = q / 10;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const z = -0.2; // a touch back toward the wall behind him
  const n = Math.hypot(ux, uy, z);
  const d = [ux / n, uy / n, z / n];
  const apex = [d[0] * reach, d[1] * reach, d[2] * reach + 2];
  const base = LIBRARY.point_screen;
  const tracks = JSON.parse(JSON.stringify(base.tracks));
  // the wrist: rises toward the target with an overshoot of a few centimetres, settles, holds, returns
  const over = [apex[0] * 1.04, apex[1] * 1.04 - 1.2, apex[2]];
  const mid = [lerp(-6, apex[0], 0.45), lerp(18, apex[1], 0.45) - 3, lerp(10, apex[2], 0.45)];
  tracks.wrist = [[0, 'R'], [0.22, mid], [0.56, over], [0.66, apex], [0.84, apex, 's'], [1.36, apex, 's'], [1.78, [lerp(apex[0], -6, 0.6), lerp(apex[1], 21, 0.6), 11]], [2.1, 'R', 's']];
  // the hand along the arm, the index out
  tracks.dir = [[0, 'R'], [0.3, [-0.4, 0.4, 0.6]], [0.5, [d[0] * 0.7, d[1] * 0.7 - 0.2, 0.5]], [0.66, d], [0.94, d, 's'], [1.46, d, 's'], [1.77, [-0.57, -0.12, 0.81]], [2.1, 'R']];
  // the eyes find the target first, the head follows; the look comes back to the lens while the hand stays
  const lookY = Math.max(-0.7, Math.min(0.6, uy * 1.1));
  tracks.lookX = [[0, 0], [0.14, 0.92], [0.5, 0.8], [0.95, 0.74], [1.05, 0.05], [1.3, 0], [2.1, 0]];
  tracks.lookY = [[0, 0], [0.18, lookY], [0.95, lookY * 0.85], [1.08, 0], [2.1, 0]];
  tracks.pitch = [[0, 0], [0.5, uy * 0.06], [0.95, uy * 0.05], [1.25, 0.01], [2.1, 0]];
  // more of the head and the body toward a target that is further round
  const turn = 0.3 + 0.12 * Math.min(1, Math.abs(ux));
  tracks.yaw = [[0, 0], [0.18, -0.02], [0.5, turn], [0.6, turn * 1.12], [0.76, turn, 's'], [0.98, turn * 0.98], [1.24, 0.06], [1.36, 0.04, 's'], [2.1, 0]];
  tracks.bx = [[0, 0], [0.6, 1.1], [1.45, 1.0], [2.1, 0]];
  const def = { ...base, tracks };
  delete def.transport; // the apex is aimed: no baked transport arc over it
  delete def.variants;
  delete def._ch; // the library definition is already prepared: this one is prepared afresh from its own tracks
  delete def.name;
  registerGestures({ [name]: def });
  // the aim holds exactly (the desk press of seated presenters does not apply to a standing one)
  const g = GESTURES[name];
  g.tracks.wrist[2][1] = over;
  g.tracks.wrist[3][1] = apex;
  g.tracks.wrist[4][1] = apex;
  g.tracks.wrist[5][1] = apex;
  AIMED.set(name, def);
  return name;
}

// ------------------------------------------------------------------------------------------- the close-up's gestures
const copyTracks = (tr) => JSON.parse(JSON.stringify(tr));
const OPENED = new Map();
/**
 * An open hand offered toward a place on the wall (partner space: x toward the wall's side, y down, from the near
 * shoulder): the rig's point_screen 'open' with its apex aimed, the arm well out from the body (a weather presenter
 * shows the map with the whole arm, not a hand at the waist), a little overshoot, a hold through the place's
 * name and what is said of it, the look to the place and back to the lens while the hand stays. Cached per tenth
 * of a radian and per reach.
 */
export function aimedOpen(dx, dy, reach = 25) {
  const a = Math.max(-0.75, Math.min(0.55, Math.atan2(dy, Math.max(0.05, dx))));
  const q = Math.round(a * 10);
  const name = `wx_open_${q}_${Math.round(reach)}`;
  if (OPENED.has(name)) return name;
  const ang = q / 10;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const z = -0.22; // back toward the wall behind him
  const n = Math.hypot(ux, uy, z);
  const apex = [(ux / n) * reach, (uy / n) * reach, (z / n) * reach + 3];
  const over = [apex[0] * 1.05, apex[1] * 1.05 - 1.4, apex[2]];
  const mid = [lerp(-4, apex[0], 0.45), lerp(14, apex[1], 0.45) - 2.5, lerp(14, apex[2], 0.45)];
  const base = BEATS.point_screen.open;
  const tracks = copyTracks(base.tracks);
  tracks.wrist = [[0, 'R'], [0.18, [-7.4, 20.0, 12.2]], [0.46, mid], [0.62, over], [0.78, apex, 's'], [1.5, [apex[0] * 0.98, apex[1] + 0.6, apex[2]], 's'], [1.9, [lerp(apex[0], -5, 0.62), lerp(apex[1], 19, 0.62), 12]], [2.25, 'R', 's']];
  // the fingers toward the place and a little up, the palm up and to the lens (the base's palm, held longer)
  const d = [ux * 0.85, uy * 0.85 - 0.22, 0.42];
  const dl = Math.hypot(...d);
  const dir = d.map((v) => v / dl);
  tracks.dir = [[0, 'R'], [0.26, [-0.6, 0.4, 0.5]], [0.56, [dir[0] * 0.8, dir[1] * 0.8 - 0.1, 0.5]], [0.7, dir], [0.86, dir, 's'], [1.56, dir, 's'], [1.96, [-0.7, 0.25, 0.55]], [2.25, 'R']];
  tracks.curl = [[0, 'R'], [0.4, [0.3, 0.3, 0.34, 0.4, 0.46]], [0.66, FLAT, 's'], [1.58, FLAT, 's'], [1.98, 'R']];
  tracks.spread = [[0, 'R'], [0.64, 0.34], [1.56, 0.3], [1.98, 'R']];
  tracks.facing = [[0, 'R'], [0.3, 0.9], [0.52, 0.5, 's'], [1.58, 0.5, 's'], [1.76, 0.9], [1.98, 'R']];
  tracks.sup = [[0, 0], [0.28, 0, 's'], [0.44, 1, 's'], [1.64, 1, 's'], [1.8, 0, 's'], [2.25, 0]];
  tracks.palm = [[0, 'R'], [0.54, [-0.2, -0.6, 0.78]], [1.58, [-0.2, -0.6, 0.78]], [2.25, 'R']];
  tracks.palmW = [[0, 0], [0.06, 1, 's'], [2.19, 1, 's'], [2.25, 0]];
  tracks.pole = [[0, 'R'], [0.5, [0.8, 0.9, -0.5]], [1.58, [0.8, 0.9, -0.5]], [2.25, 'R']];
  tracks.shN = [[0, 0], [0.2, 0.2], [0.6, -0.6], [1.5, -0.45], [1.94, 0.06], [2.25, 0]];
  // the eyes to the place first, the head after them; back to the lens while the hand stays
  const lookY = Math.max(-0.7, Math.min(0.5, uy * 1.1));
  tracks.lookX = [[0, 0], [0.14, 0.9], [0.5, 0.78], [1.0, 0.72], [1.12, 0.05], [1.36, 0], [2.25, 0]];
  tracks.lookY = [[0, 0], [0.18, lookY], [1.0, lookY * 0.85], [1.14, 0], [2.25, 0]];
  tracks.yaw = [[0, 0], [0.18, -0.02], [0.5, 0.3], [0.62, 0.34], [0.8, 0.31, 's'], [1.02, 0.3], [1.28, 0.05], [1.4, 0.03, 's'], [2.25, 0]];
  tracks.pitch = [[0, 0], [0.5, uy * 0.06], [1.0, uy * 0.05], [1.3, 0.01], [2.25, 0]];
  tracks.lean = [[0, 0], [0.22, -0.01], [0.62, 0.022], [1.5, 0.02], [2.25, 0]];
  tracks.bx = [[0, 0], [0.62, 0.7], [1.5, 0.6], [2.25, 0]];
  tracks.brow = [[0, 0], [0.5, 0.3], [1.2, 0.22], [2.0, 0]];
  const def = { dur: 2.25, stroke: 0.26, apex: 0.62, hold: 1.5, focus: 'near', tracks };
  registerGestures({ [name]: def });
  OPENED.set(name, def);
  return name;
}

/**
 * Both palms open for the big picture: the hands come up from the waist and out to the sides, palms up and a little
 * to the lens, and widen slowly through the hold, "the whole world"; a small lift of the chin and the brows. 'wide'
 * sits higher and opens further (the planet), 'near' lower and closer (the viewers wherever they are).
 */
// (the rig's oblique camera sees depth as height: forward is up the frame, so chest height is a little forward)
const WORLD = {
  wide: { out: 12.5, y: 1.2, z: 15.6, spread: 1.8 },
  near: { out: 9.4, y: 4.6, z: 17.0, spread: 1.0 },
};
export function bothPalms(variant = 'wide') {
  const name = `wx_world_${variant}`;
  if (GESTURES[name]) return name;
  const v = WORLD[variant] || WORLD.wide;
  const side = (sx, lag) => {
    const k = (x) => x * sx;
    const at = (t) => +(t + lag).toFixed(3);
    return {
      // (the hands rise forward and up first, the elbows in, then open out: out from the hips with the elbows wide
      // they read as hands on the hips)
      wrist: [[0, 'R'], [at(0.3), [k(-2.2), 8.6, 18.2]], [at(0.5), [k(v.out - 2.2), v.y + 0.6, v.z + 1.0]], [at(0.68), [k(v.out), v.y, v.z], 's'], [at(1.3), [k(v.out + v.spread), v.y + 0.3, v.z - 0.4], 's'], [at(1.66), [k(-1.6), 14.6, 14.6]], [2.0, 'R', 's']],
      dir: [[0, 'R'], [at(0.26), [k(-0.3), -0.25, 0.9]], [at(0.56), [k(0.6), -0.06, 0.8]], [at(0.72), [k(0.7), -0.1, 0.7], 's'], [at(1.34), [k(0.74), -0.1, 0.66], 's'], [at(1.72), [k(-0.7), 0.2, 0.6]], [2.0, 'R']],
      curl: [[0, 'R'], [at(0.34), [0.3, 0.3, 0.34, 0.4, 0.46]], [at(0.6), FLAT, 's'], [at(1.34), FLAT, 's'], [at(1.72), 'R']],
      spread: [[0, 'R'], [at(0.6), 0.36], [at(1.34), 0.34], [at(1.72), 'R']],
      facing: [[0, 'R'], [at(0.3), 0.9], [at(0.52), 0.35, 's'], [at(1.36), 0.35, 's'], [at(1.54), 0.9], [at(1.74), 'R']],
      sup: [[0, 0], [at(0.26), 0, 's'], [at(0.42), 1, 's'], [at(1.42), 1, 's'], [at(1.58), 0, 's'], [2.0, 0]],
      palm: [[0, 'R'], [at(0.56), [k(0.18), -0.84, 0.5]], [at(1.36), [k(0.18), -0.84, 0.5]], [2.0, 'R']],
      palmW: [[0, 0], [0.06, 1, 's'], [1.94, 1, 's'], [2.0, 0]],
      pole: [[0, 'R'], [at(0.32), [k(0.55), 0.95, -0.6]], [at(0.62), [k(0.95), 0.85, -0.35]], [at(1.36), [k(0.95), 0.85, -0.35]], [2.0, 'R']],
    };
  };
  const N = side(1, 0), F = side(-1, 0.03);
  const tracks = {
    wrist: N.wrist, dir: N.dir, curl: N.curl, spread: N.spread, facing: N.facing, sup: N.sup, palm: N.palm, palmW: N.palmW, pole: N.pole,
    wristF: F.wrist, dirF: F.dir, curlF: F.curl, spreadF: F.spread, facingF: F.facing, supF: F.sup, palmF: F.palm, palmWF: F.palmW, poleF: F.pole,
    shN: [[0, 0], [0.18, 0.2], [0.6, -0.5], [1.3, -0.4], [1.7, 0.05], [2.0, 0]],
    shF: [[0, 0], [0.2, 0.2], [0.62, -0.5], [1.32, -0.4], [1.72, 0.05], [2.0, 0]],
    pitch: [[0, 0], [0.3, 0.02], [0.66, -0.035], [1.3, -0.02], [1.8, 0]],
    brow: [[0, 0], [0.4, 0.3], [0.7, 0.4], [1.3, 0.3], [1.8, 0]],
    smile: [[0, 0], [0.5, 0.14], [1.4, 0.12], [2.0, 0]],
    lean: [[0, 0], [0.6, 0.012], [1.4, 0.01], [2.0, 0]],
  };
  registerGestures({ [name]: { dur: 2.0, stroke: 0.22, apex: 0.66, hold: 1.32, focus: 'both', tracks } });
  return name;
}

const SWEPT = new Map();
/**
 * The open hand drawn along a direction for movement (partner space: sx toward the wall's side, sy down; unit):
 * it sets at the start of the path, then sweeps along it on a shallow arc, a touch past the end and back, holds, and
 * returns; the fingers lead, the palm to the lens, the eyes go with the hand. A movement away from the wall's side
 * is the far hand sweeping out on its own side (mirrored). Cached per tenth of a radian. -> { name, far }
 */
export function sweepAlong(sx, sy) {
  const far = sx < -0.15;
  if (far) sx = -sx;
  const a = Math.atan2(sy, Math.max(0.05, sx));
  const q = Math.round(Math.max(-1.2, Math.min(1.2, a)) * 10);
  const name = `wx_sweep_${q}${far ? '_far' : ''}`;
  if (SWEPT.has(name)) return { name, far };
  const ang = q / 10;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  // the path: from in front of the body, across and well out (28 cm, about 53 px in the close-up), its middle at chest
  // height (forward reads as up: the oblique camera), a shallow arc
  const M = [4.0, 3.4, 15.0];
  const at = (k, lift = 0) => [M[0] + dx * k, M[1] + dy * k - lift, M[2] - Math.abs(k) * 0.16];
  const S = at(-13), P1 = at(-5, 1.8), P2 = at(5, 2.0), E = at(15), O = at(16.3, -0.2);
  const lead = (k) => {
    const v = [dx * 0.8 + 0.12, dy * 0.8 - 0.3, 0.42 - k * 0.1];
    const l = Math.hypot(...v);
    return v.map((x) => x / l);
  };
  const tracks = {
    wrist: [[0, 'R'], [0.16, [-6.8, 20.2, 13.0]], [0.42, S], [0.54, S, 's'], [0.76, P1], [0.98, P2], [1.18, E], [1.28, O], [1.42, E, 's'], [1.8, E, 's'], [2.12, [lerp(E[0], -5, 0.6), lerp(E[1], 19, 0.6), 12.4]], [2.4, 'R', 's']],
    dir: [[0, 'R'], [0.3, [-0.5, 0.2, 0.8]], [0.5, lead(0)], [0.98, lead(0.5)], [1.3, lead(1)], [1.84, lead(1), 's'], [2.16, [-0.7, 0.25, 0.55]], [2.4, 'R']],
    curl: [[0, 'R'], [0.36, [0.3, 0.3, 0.34, 0.4, 0.46]], [0.56, FLAT, 's'], [1.84, FLAT, 's'], [2.16, 'R']],
    spread: [[0, 'R'], [0.56, 0.26], [1.84, 0.24], [2.16, 'R']],
    facing: [[0, 'R'], [0.3, 0.9], [0.5, 0.75, 's'], [1.84, 0.75, 's'], [2.0, 0.9], [2.2, 'R']],
    palm: [[0, 'R'], [0.5, [0.1, -0.25, 0.96]], [1.84, [0.1, -0.25, 0.96]], [2.4, 'R']],
    palmW: [[0, 0], [0.06, 1, 's'], [2.34, 1, 's'], [2.4, 0]],
    pole: [[0, 'R'], [0.5, [0.8, 0.95, -0.4]], [1.84, [0.8, 0.95, -0.4]], [2.4, 'R']],
    shN: [[0, 0], [0.2, 0.15], [0.5, -0.35], [1.2, -0.45], [1.8, -0.35], [2.2, 0.04], [2.4, 0]],
    // the eyes follow the hand along the path, then come back to the lens
    lookX: [[0, 0], [0.3, 0.2], [0.6, 0.35], [1.2, 0.75], [1.6, 0.7], [1.86, 0.05], [2.4, 0]],
    lookY: [[0, 0], [0.5, Math.max(-0.6, Math.min(0.5, -0.1 + dy * 0.3))], [1.2, Math.max(-0.7, Math.min(0.6, -0.2 + dy * 0.9))], [1.86, 0], [2.4, 0]],
    yaw: [[0, 0], [0.5, 0.06], [1.2, 0.24], [1.6, 0.22], [1.92, 0.03], [2.4, 0]],
    lean: [[0, 0], [0.5, 0.008], [1.2, 0.02], [1.8, 0.016], [2.4, 0]],
    brow: [[0, 0], [0.6, 0.2], [1.2, 0.3], [1.9, 0]],
  };
  let def = { dur: 2.4, stroke: 0.54, apex: 1.18, hold: 1.8, focus: 'near', tracks };
  if (far) def = { ...mirrorDef(def), focus: 'far' };
  registerGestures({ [name]: def });
  SWEPT.set(name, def);
  return { name, far };
}

// ------------------------------------------------------------------------------------------- presenter
export class Presenter {
  /**
   * @param standing  runtime/standing.js Standing (its actor's perf is driven from here)
   * @param o.scale   px per cm; o.neckY: the neck base's screen row
   */
  constructor(standing, { scale = 1.2, neckY = 60, seed = 1 } = {}) {
    this.st = standing;
    this.s = scale;
    this.neckY = neckY;
    this.x = 66; // body centre (screen px, the feet's midpoint plus the weight shift)
    this.feet = [{ x: 66 - STANCE * scale, lift: 0 }, { x: 66 + STANCE * scale, lift: 0 }];
    this.plan = null; // the walk: [{ foot, from, to, t0, t1 }]
    this.weight = 0; // cm of torso over the right (+) or left (-) foot
    this.nextShift = 0;
    this.shiftFrom = 0;
    this.shiftTo = 0;
    this.shiftAt = -1e9;
    this.lastGesture = -1e9;
    this.walkEnd = -1e9;
    this.seed = seed;
    this.rand = (() => {
      let a = seed >>> 0 || 1;
      return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
  }

  get perf() {
    return this.st.actor.perf;
  }

  /** Put him on a mark at once (a new programme). */
  place(x) {
    this.x = x;
    this.feet[0].x = x - STANCE * this.s;
    this.feet[1].x = x + STANCE * this.s;
    this.feet[0].lift = this.feet[1].lift = 0;
    this.plan = null;
  }

  get walking() {
    return !!this.plan;
  }

  /**
   * Walk to x starting at t (rig seconds): side-steps of up to STEP.stride, the lead foot first. Returns the
   * walk's duration (the camera moves with him over the same time).
   */
  walkTo(x, t) {
    const s = this.s;
    if (this.plan) {
      this.update(t);
      for (const f of this.feet) f.lift = 0;
      this.plan = null;
    }
    const from = (this.feet[0].x + this.feet[1].x) / 2;
    const dist = x - from;
    if (Math.abs(dist) < 4) {
      this.plan = null;
      return 0;
    }
    const dir = Math.sign(dist);
    const n = Math.max(STEP.minSteps, Math.ceil(Math.abs(dist) / (STEP.stride * s)));
    const lead = dir > 0 ? 1 : 0, trail = 1 - lead;
    // each foot ends at its place in the stance around the mark, whatever the feet were doing (a walk that
    // starts before the last one ended never keeps them apart)
    let fl = this.feet[lead].x, ftr = this.feet[trail].x;
    const stepL = (x + dir * STANCE * s - fl) / n, stepT = (x - dir * STANCE * s - ftr) / n;
    const plan = [];
    let tt = t + 0.12; // a beat to shift the weight before the first step
    for (let i = 0; i < n; i++) {
      // the first and last steps are a little slower (setting off, arriving)
      const pace = i === 0 || i === n - 1 ? 1.18 : 1;
      plan.push({ foot: lead, from: fl, to: fl + stepL, t0: tt, t1: tt + STEP.half * pace });
      fl += stepL;
      tt += STEP.half * pace;
      plan.push({ foot: trail, from: ftr, to: ftr + stepT, t0: tt, t1: tt + STEP.half * pace });
      ftr += stepT;
      tt += STEP.half * pace;
    }
    this.plan = plan;
    this.walkDir = dir;
    this.walkEnd = tt;
    // the head turns toward where he is going (the 'partner' look on that side), then back to the lens
    this.perf.side = dir;
    this.perf.look = [{ t0: t, t1: Math.max(t + 0.6, tt - 0.35), target: 'partner', amt: 0.7 }];
    return tt - t;
  }

  /** A step or two toward screen x (within [lo, hi]); false when there is no room or a step is under way. */
  stepToward(x, t, lo, hi) {
    if (this.plan || t - this.walkEnd < 1.2) return false;
    const want = Math.max(lo, Math.min(hi, this.x + Math.sign(x - this.x) * STEP.stride * this.s));
    if (Math.abs(want - this.x) < STEP.stride * this.s * 0.6) return false;
    this.walkTo(want, t);
    return true;
  }

  /** Point at screen (tx, ty) from t: the arm nearer the target, aimed. False when an arm gesture is running. */
  pointAt(tx, ty, t) {
    if (t - this.lastGesture < GESTURE_GAP) return false;
    const L = this.st.actor.look;
    const sj = L.torso?.shoulderJoint || [17.5, 6.8];
    const side = tx >= this.x ? 1 : -1;
    // the target in partner space relative to the near shoulder (cm)
    const bx = (Math.abs(tx - this.x) / this.s) - sj[0];
    const by = (ty - this.neckY) / this.s - sj[1];
    const name = aimedPoint(bx, by, Math.hypot(bx, by) < 40 ? 26 : 31);
    this.perf.side = side;
    this.perf.gestures = [...(this.perf.gestures || []).filter((g) => t - g.t0 < 3).slice(-2), { name, t0: t }];
    this.lastGesture = t;
    return true;
  }

  /** An open hand offered toward the map (side +1 right, -1 left). */
  present(t, side) {
    if (t - this.lastGesture < GESTURE_GAP) return false;
    this.perf.side = side;
    this.perf.gestures = [...(this.perf.gestures || []).filter((g) => t - g.t0 < 3).slice(-2), { name: 'point_screen', variant: 'open', t0: t }];
    this.lastGesture = t;
    return true;
  }

  /**
   * A close-up gesture on a word (the module's header): kind 'place' { tx, ty } the place on screen, 'world'
   * { variant }, 'sweep' { dx, dy } the movement's direction on screen (north up), 'count' { n }. o.gap: seconds
   * since the last arm gesture it needs (default 1.7). Each is played a touch faster or slower than the last
   * (0.92-1.08), so two of a kind never run like clockwork. False when the last one is too fresh.
   */
  gesture(kind, t, o = {}) {
    if (t - this.lastGesture < (o.gap ?? 1.7)) return false;
    const side = this.perf.side || 1;
    const speed = 0.92 + this.rand() * 0.16;
    let ev = null;
    if (kind === 'place' && Number.isFinite(o.tx) && Number.isFinite(o.ty)) {
      // aimed from the near shoulder at the place (on the open side of the frame, the side he faces into)
      const sj = this.st.actor.look.torso?.shoulderJoint || [17.5, 6.8];
      const bx = Math.max(8, (side * (o.tx - this.x)) / this.s - sj[0]);
      const by = (o.ty - this.neckY) / this.s - sj[1];
      ev = { name: aimedOpen(bx, by, 23 + this.rand() * 4), t0: t, speed };
    } else if (kind === 'world') ev = { name: bothPalms(o.variant === 'near' ? 'near' : 'wide'), t0: t, speed };
    else if (kind === 'sweep') {
      const l = Math.hypot(o.dx || 0, o.dy || 0) || 1;
      ev = { name: sweepAlong(((o.dx ?? 1) / l) * side, (o.dy ?? 0) / l).name, t0: t, speed };
    } else if (kind === 'count') ev = { name: 'count', n: Math.max(1, Math.min(5, o.n || 3)), t0: t };
    if (!ev) return false;
    this.perf.gestures = [...(this.perf.gestures || []).filter((g) => t - g.t0 < 3).slice(-2), ev];
    this.lastGesture = t;
    this.lastKind = kind;
    return true;
  }

  /** Advance the feet and the weight to rig time t. */
  update(t) {
    const s = this.s;
    let swing = -1;
    if (this.plan) {
      for (const st of this.plan) {
        const f = this.feet[st.foot];
        if (t <= st.t0) continue;
        const u = Math.min(1, (t - st.t0) / (st.t1 - st.t0));
        f.x = lerp(st.from, st.to, smooth(u));
        f.lift = u < 1 ? Math.sin(Math.PI * u) * STEP.lift : 0;
        if (u < 1) swing = st.foot;
      }
      if (t >= this.walkEnd) {
        for (const f of this.feet) f.lift = 0;
        this.plan = null;
      }
    }
    // the weight: over the foot that carries him while the other swings; otherwise slow shifts now and then
    let target;
    if (swing >= 0) target = (swing === 1 ? -1 : 1) * 2.6;
    else {
      if (t > this.nextShift) {
        this.shiftFrom = this.weight;
        this.shiftTo = (this.rand() < 0.5 ? -1 : 1) * (1 + this.rand() * 1.6);
        this.shiftAt = t;
        this.nextShift = t + 3.5 + this.rand() * 4;
      }
      target = lerp(this.shiftFrom, this.shiftTo, smooth((t - this.shiftAt) / 0.9));
    }
    this.weight += (target - this.weight) * 0.18;
    const mid = (this.feet[0].x + this.feet[1].x) / 2;
    this.x = mid + this.weight * s;
    return this;
  }

  /** His pixels this frame (the standing rig's frame, Uint32, 0 clear) after post(px), without drawing them. */
  render(t, post = null) {
    const mid = (this.feet[0].x + this.feet[1].x) / 2;
    this.st.render(t, { x: mid, y: this.neckY, s: this.s, feet: this.feet, shift: this.weight });
    return post ? post(this.st.frame.px) : null;
  }

  /** Draw him; post(px) relights his pixels first (the wall's light, studio.js lightFigure). */
  draw(ctx, t, post = null) {
    const mid = (this.feet[0].x + this.feet[1].x) / 2;
    return this.st.draw(ctx, t, { x: mid, y: this.neckY, s: this.s, feet: this.feet, shift: this.weight, post });
  }
}

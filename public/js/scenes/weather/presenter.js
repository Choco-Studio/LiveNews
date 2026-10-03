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
//   const p = new Presenter(standing, { scale, neckY })   p.place(x) / p.walkTo(x, t) / p.pointAt(x, y, t)
//   p.present(t, side) / p.stepToward(x, t, range) / p.update(t) / p.draw(ctx, t)
import { GESTURES, registerGestures } from '../../v2/canvas25d/gestures/index.js';
import { LIBRARY } from '../../v2/canvas25d/gestures/library.js';

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

  draw(ctx, t) {
    const mid = (this.feet[0].x + this.feet[1].x) / 2;
    return this.st.draw(ctx, t, { x: mid, y: this.neckY, s: this.s, feet: this.feet, shift: this.weight });
  }
}

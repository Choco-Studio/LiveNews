// A presenter standing and walking (WORLD WEATHER, owner 3 Oct: "que el hombre se moviera por el plato y la
// cámara junto a él mientras va señalando"). The rig draws presenters from the waist up, seated behind a desk;
// standing in front of the map wall he needs the rest of the suit: the jacket's skirt down to the hips (in the
// jacket's own group, so it joins the torso without a seam), two trouser legs and shoes, drawn first so the
// torso and the arms paint over their tops. Walking sideways along the wall, the legs open and close in a
// side-step (the way weather presenters move while facing the camera), the body bobs a little on each step.
//
//   const st = new Standing(id, info)         st.actor (scene.js actor: perf.speech / gestures / side)
//   st.draw(ctx, t, { x, y, s, walk })        x, y: neck base on screen; s: px per cm; walk: phase (radians)
//                                             or null when standing still
// The figure is resolved into its own transparent frame and drawn over whatever is on the canvas.
import { Frame, PartBuffer, material } from '../pixbuf.js';
import { drawCharacter, GROUPS } from '../character.js';
import { poseAt } from '../rig.js';
import { actor as makeActor } from '../scene.js';
import { matsOf } from '../cast/base.js';
import { P } from '../../../palette.js';

const LEG = {
  hipX: 7.8, // cm from the centre line
  hipY: 58,
  kneeY: 103,
  ankleY: 145,
  thigh: 6.7, // half widths of a trouser leg
  knee: 5.1,
  ankle: 4.4,
  skirtTop: 38,
  skirtBottom: 66, // a suit jacket ends at the seat
  skirtW: [19, 18.4], // half widths at the top and the hem
  vent: [57.5, 5.2], // the fronts part below the button: from this height, this wide at the hem
  stride: 6.0, // how far a foot opens on a side-step
  bob: 1.2, // body rise at mid-step (cm)
};
// the actor's reserved groups (character.js: 60-63 INTEGRATION)
const G_LEG_L = 60, G_LEG_R = 61, G_SHOE = 62;

export class Standing {
  constructor(id, info = null, { seed } = {}) {
    this.actor = makeActor(id, { side: 1, ...(seed != null ? { seed } : {}) }, info);
    this.buf = new PartBuffer();
    this.frame = new Frame();
    this.canvas = null;
    this.ctx2 = null;
    this.mats = null;
  }

  materials() {
    if (this.mats) return this.mats;
    const L = this.actor.look;
    const m = matsOf(L);
    const ramp = L.jacket.ramp;
    this.mats = {
      jacket: m.jacket,
      // the trousers: the suit's cloth one step darker, so the jacket's hem reads over them
      trousers: material(`${L.id}:trousers`, { ramp: [ramp[1], ramp[2], ramp[3], ramp[3]], line: L.jacket.line, th: [0.85, 0.1, -0.45] }),
      gap: material(`${L.id}:trouserGap`, { ramp: [ramp[3], ramp[3], ramp[3], ramp[3]], line: L.jacket.line, decal: true }),
      shoe: material('standing:shoe', { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black, th: [0.7, 0.2, -0.3] }),
    };
    return this.mats;
  }

  /** Draw the figure over the canvas (see render). */
  draw(ctx, t, opts) {
    const head = this.render(t, opts);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.frame.w;
      this.canvas.height = this.frame.h;
      this.ctx2 = this.canvas.getContext('2d');
    }
    this.ctx2.putImageData(this.frame.image, 0, 0);
    ctx.drawImage(this.canvas, 0, 0);
    return head;
  }

  /**
   * Resolve the figure into this.frame (clear elsewhere). walk: the step phase in radians (null = standing,
   * feet together under the hips). Returns the head frame (head.js) for eyelines.
   */
  render(t, { x, y, s, walk = null, feet = null, shift = 0 }) {
    const buf = this.buf;
    const m = this.materials();
    const sk = poseAt(this.actor, t);
    const bx = sk.body.x, by = sk.body.y;
    // the legs: planted feet (feet: [{ x, lift }, { x, lift }], screen px, left then right foot) or the old
    // phase-driven side-step (walk); the torso sits `shift` cm over one foot (weight)
    const tx = x + shift * s; // the torso's screen x
    let legs;
    let drop = 0;
    if (feet) {
      const L = LEG.ankleY - LEG.hipY; // hip to ankle, straight
      // the body comes down as the feet open (a leg is only so long): the more open leg sets the hip height
      let minV = L;
      const raw = feet.map((f, i) => {
        const side = i === 0 ? -1 : 1;
        const fx = (f.x - tx) / s - bx; // body units
        const dx = fx - side * LEG.hipX;
        minV = Math.min(minV, Math.sqrt(Math.max(1, L * L - dx * dx)));
        return { side, fx, lift: Math.max(0, f.lift || 0) };
      });
      drop = L - minV;
      legs = raw.map((r, i) => ({ side: r.side, g: i === 0 ? G_LEG_L : G_LEG_R, foot: r.fx, up: r.lift }));
    } else {
      const stepping = walk != null && Number.isFinite(walk);
      drop = stepping ? -LEG.bob * Math.abs(Math.sin(walk)) : 0;
      // legs: a side-step (one foot opens while the other stays, then they swap)
      const open = stepping ? Math.sin(walk) * LEG.stride : 0;
      const lift = stepping ? Math.max(0, Math.cos(walk)) * 1.6 : 0;
      legs = [
        { side: -1, g: G_LEG_L, foot: -LEG.hipX - 0.3 + Math.min(0, open), up: open < 0 ? lift : 0 },
        { side: 1, g: G_LEG_R, foot: LEG.hipX + 0.3 + Math.max(0, open), up: open > 0 ? lift : 0 },
      ];
    }
    const ox = Math.round(tx), oy = Math.round(y + drop * s);
    const X = (u) => ox + (u + bx) * s;
    const Y = (v) => oy + (v + by) * s;
    buf.clear();
    for (const leg of legs) {
      const hx = leg.side * LEG.hipX;
      const ay = LEG.ankleY - (feet ? drop : 0) - leg.up;
      // a leg shorter than its length bends at the knee: the knee comes out a little and up
      const reachY = ay - LEG.hipY, reachX = leg.foot - hx;
      const bend = feet ? Math.sqrt(Math.max(0, (LEG.ankleY - LEG.hipY) ** 2 - reachX * reachX - reachY * reachY)) : 0;
      const kxb = (hx + leg.foot) / 2 + leg.side * (0.3 + bend * 0.18);
      const ky = LEG.hipY + reachY * 0.52 - leg.up * 0.3;
      buf.part(leg.g, 1, false);
      // one tapered trouser leg: lit edge toward camera-left, the far edge in shade, a pressed crease
      const kx = kxb;
      const pts = [X(hx - LEG.thigh), Y(LEG.hipY), X(hx + LEG.thigh), Y(LEG.hipY), X(kx + LEG.knee), Y(ky), X(leg.foot + LEG.ankle), Y(ay), X(leg.foot - LEG.ankle), Y(ay), X(kx - LEG.knee), Y(ky)];
      const crease = s >= 2;
      buf.poly(pts, m.trousers, (px, py) => {
        const v = ((py + 0.5 - oy) / s - by);
        const upper = v < ky - by * 0;
        const k = upper ? (v - LEG.hipY) / (ky - LEG.hipY) : (v - ky) / (ay - ky);
        const cx = upper ? hx + (kx - hx) * k : kx + (leg.foot - kx) * k;
        const hw = upper ? LEG.thigh + (LEG.knee - LEG.thigh) * k : LEG.knee + (LEG.ankle - LEG.knee) * k;
        const u = ((px + 0.5 - ox) / s - bx - cx) / hw;
        if (crease && Math.abs(u + 0.12) < 0.5 / (hw * s) + 0.04) return 0;
        // the inner thigh in the crotch's shadow
        if (upper && k < 0.22 && u * leg.side < -0.6) return 3;
        return u < -0.6 ? 0 : u > 0.42 ? 2 : 1;
      });
      buf.part(G_SHOE, 1, false);
      buf.ellipse(X(leg.foot + leg.side * 1.0), Y(ay + 2.8), 6.0 * s, 2.7 * s, m.shoe, 0, 0);
    }
    // the jacket's skirt, in the jacket's group (joins the torso without an inner line); the fronts part below
    // the button and round off at the hem
    const gj = GROUPS.jacket;
    buf.part(gj, 8, false);
    const [w0, w1] = LEG.skirtW;
    const [vy, vw] = LEG.vent;
    const hem = LEG.skirtBottom;
    const skirt = [X(-w0), Y(LEG.skirtTop), X(w0), Y(LEG.skirtTop), X(w1), Y(hem - 1), X(w1 - 1.5), Y(hem), X(vw + 1.6), Y(hem), X(vw), Y(hem - 1.2), X(0.7), Y(vy), X(-0.7), Y(vy), X(-vw), Y(hem - 1.2), X(-vw - 1.6), Y(hem), X(-w1 + 1.5), Y(hem), X(-w1), Y(hem - 1)];
    buf.poly(skirt, m.jacket, (px) => {
      // lit from camera-left like the torso's planes: the key edge, the body, the shaded side plane
      const u = (px + 0.5 - ox) / s - bx;
      return u < -w0 + 2.6 ? 0 : u > w0 - 6.5 ? 2 : 1;
    });
    // the trousers seen between the fronts
    buf.part(G_LEG_L, 2, false);
    buf.poly([X(-0.7), Y(vy + 0.4), X(0.7), Y(vy + 0.4), X(vw), Y(hem - 0.6), X(-vw), Y(hem - 0.6)], m.trousers, 2);
    // the upper body on top (the rig's own drawing)
    const head = drawCharacter(buf, this.actor.look, sk, { x: ox, y: oy, s, gb: 0, clip: false });
    // resolve into a clear frame
    const f = this.frame;
    f.px.fill(0);
    buf.resolve(f);
    return head;
  }
}

export const STANDING_LEG = LEG;

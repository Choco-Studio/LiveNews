// The experts' own hair (owner 12 Oct: "el pelo de algunos es muy parecido con los de otros presentadores").
// Each expert used to borrow a presenter's drawer in another colour and read as that presenter's twin; here every
// one gets a silhouette of their own, apart at 1x from the eight presenters, the three correspondents and each
// other (cast/experts.js picks them):
//   drawReceding    Omar    a receding hairline: high forehead, temples swept back, a thin salt-and-pepper top
//                           cropped very short, short grey sides
//   drawPixie       Clara   a short silver pixie: tapered close at the nape and over the ears, a soft side-swept
//                           fringe of a few wisps; nothing below the ear line
//   drawHighTop     Dev     a high-top of short twists standing on top, tight faded sides, a crisp line-up
//   drawRing        Tomas   the professor's ring: a bald crown with a light highlight, wild white tufts above and
//                           behind the ears
//   drawUndercut    June    an asymmetric undercut: one side shaved to a dark stubble, the long top swept over to
//                           the other side down to the jaw
//   drawBraids      Amara   shoulder-length box braids from a neat parted hairline, tucked behind the ears
//   (drawBraidsBack)        (the braids that fall behind the ears, the neck and the shoulders)
//   drawMop         Leo     a ginger curly mop: loose curls over the forehead and the tops of the ears
//   drawWaves       Ines    long chestnut waves from a centre parting, full below the jaw and over the shoulders
//   (drawWavesBack)         (the hair behind the neck, between the two curtains)
// The drawers follow the presenters' (cast/paco.js drawShortHair, lola.js drawBob, ada.js drawStraight): head-local
// units through LocalXY / localBox, yaw and pitch (features ride the turn, the outline stays on the skull), the LOD
// tiers (s < 1.35 the silhouette and two tones, < 2.2 broad clumps, ≥ 2.2 strands, separations and specks), a
// clean outer edge for the rim, hairLag follow-through on whatever hangs. Materials (cast/experts.js mats):
//   m.hx    the hair without the resolve rim (each drawer paints its own hair light as continuous runs)
//   m.hxD   the same ramp as a decal: 1 px strokes that resolve's speckle clean-up must keep
//   m.hxE   the same ramp with a softer local line where the hair meets the skin (sel-out)
// Colours are the channel palette only (the looks' ramps); the face stays the warmest, brightest thing.
import { P } from '../../../palette.js';
import { toneN, material } from '../pixbuf.js';
import { GROUPS } from '../character.js';
import { LocalXY, localBox, clumpTone, selOutEdge, hairLight, rimMat, HeadWidthLUT, dec } from './kit-a.js';
import { tier, hashInt, fastAtan2, rimRuns } from './wardrobe-b.js';

const LXY = new LocalXY();
const HWL = new HeadWidthLUT();
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// a painted hair light whose outline stays the hair's own (kit-a rimMat's is black: on pale hair outlined in steel a
// black run along the top read as a dent)
const RIM_ON_PALE = material('experts:rim:pale', { ramp: [P.white], line: P.steel, decal: true });

// ---------------------------------------------------------------------------
// Omar: a receding crop

/**
 * A close crop on a receding hairline. The hair stands ~0.4 u off the skull (no volume: the silhouette is the head's
 * own), the forehead runs high with the temples swept back into a soft M round a short central tuft, the sides are
 * clipped short down to the ear's top with a short sideburn. Salt and pepper: on the steel base, short 1 px dashes
 * of silver and slate combed back (close-ups), a few silver ones on the lit side (mediums); the wide keeps the
 * silhouette and two tones. The hairline is a sel-out steel line, and its edge breaks into thin tips at close-ups.
 */
export function drawReceding(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const cyc = H.craniumY - 0.2;
  const RV = H.R + 0.4;
  const yawX = Math.sin(head.yaw) * H.R * 0.85;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const sideTop = H.craniumY - 2.3; // the clipped sides start at the temple
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, H.top - 1.2, RV + 0.6, E.y + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  const salt = dec(P.silver);
  const px1 = 1 / s;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > E.y - 0.3) return -1;
    const ax0 = Math.abs(x);
    const hw = HW.at(y);
    const dy = y - cyc;
    if (y < cyc) {
      if (x * x + dy * dy > RV * RV) return -1;
    } else if (ax0 > hw + 0.3) return -1;
    const fx = x - yawX;
    const ax = Math.abs(fx);
    // the hairline: a short tuft at the centre, the temples receded far back, then down the sides to the ear
    const rec = Math.exp(-((ax - 3.9) * (ax - 3.9)) / 2.4);
    let hl = H.top + 2.9 + pitchShift - 1.5 * rec + Math.max(0, ax - 5.1) ** 2 * 0.95;
    // close-ups: the thin front breaks into tips (a column here and there ends a pixel short)
    const col = Math.floor(fx * s + 256);
    const ch = hashInt(col, 5);
    if (tr === 2 && ch < 0.4) hl -= px1;
    // the clipped sides: a band along the skull from the temple to the ear, widening a little toward the ear
    const side = y > sideTop && ax0 > hw - 1.0 - 0.35 * clamp01((y - sideTop) / 2.5);
    const sideburn = ax0 > hw - 0.7 && y < E.y - 0.3 && y > earTop - 0.4;
    if (y > hl && !side) return -1;
    if (side && y > earTop + 0.15 && !sideburn) return -1;
    // ---- tone: the thin top lit from the key, the clipped sides a step down (the far side two)
    const nx = x / RV, ny = dy / RV;
    let t = toneN(mt, nx * 0.95, ny * 0.95);
    const onSide = y > hl || y > sideTop + 1.2;
    if (onSide) {
      // grey clipped sides: the lit side fog over steel, the far side steel; the sideburn's end a step down
      if (tr === 0) return x > 0 ? 1 : 0;
      t = x > 0 ? 1 : 0;
      if (tr === 2 && ((y * 2.1 + x * 0.4) % 1.5 + 1.5) % 1.5 < 0.4) t++; // short comb lines
      if (sideburn && y > earTop) t = x > 0 ? 2 : 1;
      return t;
    }
    if (tr === 0) return t === 0 ? 0 : t >= 2 ? 2 : 1;
    // the outermost pixel stays clean for the outline and the rim
    if (x * x + dy * dy > (RV - px1) * (RV - px1) && y < cyc) return t;
    // the hairline's own row: in shade where the hair lies thin on the skin
    if (y > hl - px1 * 1.2) return Math.max(t, 2);
    // salt and pepper: 1 px dashes combed back (2-3 px long), riding the turn
    const len = tr === 2 ? 2 + ((ch * 2) | 0) : 3;
    const row = Math.floor((y * s + ch * 7) / len);
    const h = hashInt(col * 131 + row, 19);
    if (tr === 1) {
      if (h > 0.86 && t <= 1 && x < 1) return (salt << 4) | 0;
      return t;
    }
    if (h > 0.78 && t <= 2) return (salt << 4) | 0;
    if (h < 0.24) return (md << 4) | Math.min(3, t + 1);
    return t;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.05, RV + 1, H.top - 1.5, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// ---------------------------------------------------------------------------
// Tomas: the professor's ring

// Each side's tuft, in outward units round the tuft's centre (x away from the face, y down), a different set per
// side so the ring looks wild, never mirrored. Puffs [x, y, radius], back to front: a white cloud hugging the skull
// above and behind the ear. Flyaways [root x, root y, angle (0 out, < 0 up), length, root half-width, bend (× length,
// > 0 bends down)]: thin strands escaping the cloud.
const PUFFS = [
  [[0.9, 1.5, 1.45], [2.3, -1.9, 1.1], [1.4, -0.5, 1.75], [0.3, -2.3, 1.5], [-0.3, -3.4, 1.0], [0.2, 0.6, 1.3]],
  [[0.8, 1.6, 1.35], [2.0, -2.1, 1.15], [1.5, -0.3, 1.6], [0.4, -2.0, 1.45], [-0.2, -3.3, 1.05], [0.3, 0.8, 1.25]],
];
const FLYAWAYS = [
  [[2.3, -2.6, -0.95, 1.3, 0.4, 0.5], [2.8, 0.0, -0.1, 1.2, 0.38, -0.55]],
  [[2.1, -2.8, -1.15, 1.3, 0.4, 0.5], [1.6, 2.4, 0.85, 1.1, 0.36, -0.45]],
];
// each flyaway as two segments (root → the curve's midpoint → tip), built once: [ax, ay, mx, my, bx, by, w]
const FLY_SEG = FLYAWAYS.map((set) => set.map(([rx, ry, a, len, w, bend]) => {
  const bx = rx + Math.cos(a) * len, by = ry + Math.sin(a) * len;
  const cx = (rx + bx) / 2 - Math.sin(a) * bend * len, cy = (ry + by) / 2 + Math.cos(a) * bend * len;
  return [rx, ry, 0.25 * rx + 0.5 * cx + 0.25 * bx, 0.25 * ry + 0.5 * cy + 0.25 * by, bx, by, w];
}));
const FS = { d: 0, u: 0, ex: 0, ey: 0, r: 1 }; // scratch: the nearest point of the flyaway last tested

/** (distance / radius)² from (x, y) to a flyaway (two tapered segments); its nearest point's along / across in FS. */
function flyD(seg, x, y) {
  let best = 9;
  for (let k = 0; k < 2; k++) {
    const sx = k ? seg[2] : seg[0], sy = k ? seg[3] : seg[1];
    const dx = (k ? seg[4] : seg[2]) - sx, dy = (k ? seg[5] : seg[3]) - sy;
    let t = ((x - sx) * dx + (y - sy) * dy) / (dx * dx + dy * dy);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - sx - dx * t, ey = y - sy - dy * t;
    const u = (k + t) * 0.5;
    const r = seg[6] * Math.pow(1 - u, 0.75) + 0.2; // a rounded root, a soft point
    const d = (ex * ex + ey * ey) / (r * r);
    if (d < best) {
      best = d;
      FS.u = u;
      FS.ex = ex;
      FS.ey = ey;
      FS.r = r;
    }
  }
  FS.d = best;
  return best;
}

/**
 * The bald crown and the ring. The crown is the skin FACES drew, with a soft highlight where the dome faces the key.
 * The ring: on each side a white cloud hugging the skull above and behind the ear, reaching out ~3 u past the
 * silhouette: overlapping puffs, each with a lit crescent toward the key and a crease where it tucks under the next,
 * and a few thin flyaways escaping it (a different set per side). It covers the top of the ear but never its bowl or
 * the face; the outer puffs and the flyaways swing after the head.
 */
export function drawRing(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const gHead = head.gb + GROUPS.head, gEars = head.gb + GROUPS.ears;
  const W = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  // ---- the crown's highlight (a repaint of the skin's lit tones only)
  if (tr > 0) {
    // a small oval along the dome's curve (tilted down toward the key side), never a flat patch
    const hx = -2.3 - yawX * 0.35, hy = H.top + 2.1 + Math.sin(head.pitch) * 1.2;
    const rx = 1.55, ry = 0.62, ca = Math.cos(0.32), sa = Math.sin(0.32);
    const [bx0, by0, bx1, by1] = localBox(head, hx - rx, hy - rx, hx + rx, hy + rx);
    for (let py = Math.max(1, by0 | 0); py < Math.min(buf.h - 1, by1); py++) {
      for (let px = Math.max(1, bx0 | 0); px < Math.min(W - 1, bx1); px++) {
        const i = py * W + px;
        if (M8[i] !== m.skin || G8[i] !== gHead || T8[i] > 1) continue;
        q.at(px + 0.5, py + 0.5);
        const dx = q.x - hx, dy = q.y - hy;
        const u = (dx * ca - dy * sa) / rx, v = (dx * sa + dy * ca) / ry;
        if (u * u + v * v < 1) T8[i] = 0;
      }
    }
  }
  // ---- the tufts
  const earTop = E.y - E.h * 0.5;
  const yc = earTop - 1.1; // the tuft's centre: above the ear's top
  const hwc = HW.at(yc);
  const [x0, y0, x1, y1] = localBox(head, -hwc - 6, yc - 5, hwc + 6, yc + 4.5);
  const mt = m.hx, md = m.hxD;
  const px1 = 1 / s;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop + 0.45) {
      const i = (py | 0) * W + (px | 0);
      if (M8[i] && G8[i] === gEars) return -1; // the ear's bowl and lobe stay in front
    }
    const side = x < 0 ? 0 : 1, sg = side ? 1 : -1;
    const hw = HW.at(y);
    // the face and the crown stay bare (the tufts overlap the head's side by ~1 u)
    if (Math.abs(x) < hw - 1.0 && y < H.chinY) return -1;
    // outward coordinates round the tuft's centre; the far side's ring shows a little more on a turn
    const ox = (x + yawX * 0.25) * sg - (hwc + 0.1), oy = y - yc - 0.4;
    if (ox < -2.5 || ox > 5 || oy < -5 || oy > 4.2) return -1;
    const sw = lag * 0.3 * clamp01((ox - 0.5) / 3); // the outer hair swings after the head
    // the puffs, back to front: the frontmost one holding the pixel, and whether another lies under it
    const pf = PUFFS[side];
    let top = -1, under = false, nx = 0, ny = 0, d2 = 0;
    for (let k = 0; k < pf.length; k++) {
      const p = pf[k];
      const dx = (ox - sw * clamp01(p[0] / 2.5) - p[0]) / p[2], dy = (oy - p[1]) / p[2];
      const dd = dx * dx + dy * dy;
      if (dd < 1) {
        if (top >= 0) under = true;
        top = k;
        nx = dx * sg; // back to screen x
        ny = dy;
        d2 = dd;
      }
    }
    // the flyaways (over the cloud)
    const segs = FLY_SEG[side];
    let fly = false;
    for (let k = 0; k < segs.length; k++) {
      if (flyD(segs[k], ox - sw, oy) < 1) {
        fly = true;
        nx = (FS.ex * sg) / FS.r;
        ny = FS.ey / FS.r;
        d2 = FS.d;
      }
    }
    if (top < 0 && !fly) return -1;
    // ---- tone: white where a puff turns to the key, silver body, a fog crease where it tucks under the next one
    // (steel only at its deepest at close-ups); the far side keeps less of the white
    const l = -0.6 * nx - 0.8 * ny;
    let t = l > (side ? 0.6 : 0.38) && (d2 > 0.3 || fly) ? 0 : l > -0.45 ? 1 : 2;
    if (tr === 0) return t === 0 ? 0 : 1;
    const far = nx * 0.6 + ny * 0.8;
    let stroke = fly; // 1 px strokes go in the decal hair (resolve's clean-up would erase their diagonal steps)
    if (!fly && far > 0.25 && d2 > 0.62 - far * 0.22) t = tr === 2 && under && far > 0.6 && d2 > 0.8 ? 3 : 2;
    else if (tr === 2 && !fly && t <= 1 && ox > 0.6) {
      // close-ups: a few strands combed out from the root, broken 1 px streaks a step down (hair, never cloud)
      const sa = fastAtan2(oy + 0.6, ox + 1.2) * 4.2 + 9;
      const ks = Math.floor(sa);
      if (sa - ks < 0.55 * px1 + 0.06 && hashInt(ks + side * 17, 61) < 0.6 && ((ox * 1.3 + hashInt(ks, 67) * 3) % 2.4) < 1.5) {
        t++;
        stroke = true;
      }
    }
    // in the skull's shadow where the cloud sits against the head
    if (Math.abs(x) < hw + 0.15 && y < H.cheekY && t < 2) t = side ? 2 : 1;
    return stroke || t === 3 ? (md << 4) | t : t;
  });
}

// ---------------------------------------------------------------------------
// Clara: a silver pixie

// the fringe's wisps: one soft point per period (feature-space units), leaning toward the far temple: rises slowly
// from the part's side, drops steeply at the tip's outer edge; 0 at both ends so neighbours meet in a notch
const WISP_N = 128;
const WISP_TIP = new Float32Array(WISP_N);
for (let i = 0; i < WISP_N; i++) {
  const f = i / WISP_N;
  WISP_TIP[i] = f < 0.7 ? Math.sin((f / 0.7) * Math.PI * 0.5) ** 1.3 : Math.cos(((f - 0.7) / 0.3) * Math.PI * 0.5) ** 0.8;
}
// the sheen window is a band at a fixed latitude of the dome (never round the whorl: strokes converging there read as
// a starburst)
const CO_PIXIE = { cw: 1.6, s: 1, seed: 61, sep: true, hiLo: 4.4, hiHi: 7.2, hiW: 0.4, gap: 4.2 };

/**
 * A short pixie. The crown carries a little lift (more on the big side of the part, screen-right of centre), the
 * sides are tapered close to the skull below the temples and end over the ear in a short point in front of it
 * (nothing below the ear line: the ears and the studs show). The fringe sweeps from the part across the forehead to
 * the far temple as a few soft wisps, each a pointed piece with its own lit edge, never lower than just above the
 * brow. Piecey clumps fall from the crown toward the face with short broken separations; white strokes only where
 * the crown faces the key.
 */
export function drawPixie(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.95;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const PART = 2.5;
  const earTop = E.y - E.h * 0.5;
  const sideTop = H.craniumY - 1.2;
  const browY = L.brows.y - 0.55;
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.8, H.top - 2.0, RV + 0.8, E.y + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  CO_PIXIE.s = s;
  CO_PIXIE.sep = tr === 2;
  CO_PIXIE.cw = tr === 2 ? (s >= 3 ? 1.6 : 1.75) : 2.2;
  const crownX = 1.2, crownY = H.top + 0.4; // the whorl the clumps fall from
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x0l = q.x, y = q.y;
    if (y > E.y - 0.1) return -1;
    // the fringe's tips swing a moment after the head
    const x = x0l - (y > H.top + 3 ? lag * 0.25 : 0);
    const ax0 = Math.abs(x);
    const hw = HW.at(y);
    const dy = y - cyc;
    const fx = x - yawX;
    // ---- the outline: the crown with lift on the big side of the part, tapered close at the sides
    if (y < sideTop) {
      const r2 = x * x + dy * dy;
      const a = fastAtan2(fx, -dy); // 0 at the top, + toward screen-right (the big side)
      const big = Math.exp(-((a - 0.55) * (a - 0.55)) / 0.5);
      let R = RV + 0.4 * big - (a < -0.6 ? 0.35 * Math.min(1, -a - 0.6) : 0);
      // mediums and close-ups: the outline breaks into short pieces (a cut, never a helmet)
      if (tr > 0) {
        const pp = (a + 6) / 0.34, kp = Math.floor(pp);
        R += (0.34 * WISP_TIP[((pp - kp) * WISP_N) | 0] - 0.22) * (0.6 + 0.4 * hashInt(kp, 11));
      }
      if (r2 > R * R) return -1;
    } else {
      // below the temple the hair hugs the skull, thinning toward the ear; over the ear a short point
      const k = clamp01((y - sideTop) / (earTop - sideTop));
      const lim = hw + 0.55 - 0.3 * k;
      if (ax0 > lim) return -1;
      if (y > earTop + 0.1) {
        // the point in front of the ear: a narrowing tab down to just above the ear's middle
        const kk = (y - earTop) / (E.y - earTop);
        if (ax0 < hw - 0.75 + 0.45 * kk || ax0 > hw + 0.1 - 0.2 * kk) return -1;
      }
    }
    // ---- the face window: the forehead open on the part's small side, the wisps sweeping across to the far temple
    let hl;
    let notch = 1; // units to the nearest notch between two wisps (their separation runs up from it)
    if (fx > PART) hl = H.top + 3.75 + pitchShift + (fx - PART) * 0.1;
    else {
      // the sweep drops quickly from the part, then runs on just above the brow to the far temple
      const sw = PART - fx;
      const base = H.top + 3.2 + pitchShift + 2.9 * (1 - Math.exp(-sw / 3.0));
      const per = tr === 0 ? 2.8 : 2.45;
      const ph = (sw + 0.9) / per;
      const kw = Math.floor(ph), fw = ph - kw;
      const amp = (tr === 0 ? 0.7 : 1.3) * (0.75 + 0.25 * hashInt(kw, 7)) * clamp01(sw / 1.2);
      hl = Math.min(browY + pitchShift, base + amp * WISP_TIP[(fw * WISP_N) | 0]);
      notch = Math.min(fw, 1 - fw) * per; // units to the nearest notch
    }
    const inner = hw - 0.7;
    if (y > hl && ax0 < inner && y < H.chinY) return -1;
    // ---- tone: lit from the key, the sides a step down, the far side two
    const nx = x / RV, ny = dy / (RV * 1.1);
    let t = toneN(mt, nx * 0.92, ny * 0.92);
    const onSide = y > sideTop + 0.6 && ax0 > hw - 0.8;
    if (onSide) t = Math.max(t, x > 0 ? 2 : 1);
    const nearFace = y > hl - 0.35 && ax0 < hw + 0.2;
    if (tr === 0) {
      if (nearFace && fx < PART) return Math.max(t, 1);
      return t === 0 && y < cyc - 2 ? 0 : t >= 2 ? 2 : 1;
    }
    // the wisps: in the fringe a step down where they lie on the forehead, a separation up from each notch,
    // the lit edge of each wisp beside it
    if (nearFace && fx < PART) t = Math.max(t, 1);
    if (y > hl - px1 * 1.1 && ax0 < hw) t = Math.max(t, 2);
    if (fx < PART - 0.6 && y > hl - 2.2 && ax0 < hw - 0.4) {
      if (notch < 0.5 * px1 + 0.08) return (md << 4) | 2;
      if (notch < 1.5 * px1 + 0.1 && t >= 1 && y < hl - px1) return (md << 4) | 0;
    }
    // the outermost pixel stays clean for the outline and the rim
    if (y < sideTop && x * x + dy * dy > (RV - px1) * (RV - px1) && t >= 1) return t;
    // the part: a short dark line back from the hairline
    if (y < hl + 0.1 && y > H.top + 0.8 && Math.abs(fx - PART - (y - hl) * 0.12) < (tr === 2 ? 0.5 * px1 + 0.1 : 0.35)) return 2;
    // piecey clumps falling from the whorl (fanning out so none gets thinner than a clump)
    const dxc = fx - crownX, dyc = y - crownY;
    const u = Math.sqrt(dxc * dxc + dyc * dyc);
    const v = fastAtan2(dxc, Math.max(0.3, dyc)) * Math.max(4.6, u) + 30;
    if (onSide) {
      if (tr === 2 && ((y * 2.3 + x * 0.3) % 1.4 + 1.4) % 1.4 < 0.36) return (md << 4) | Math.min(3, t + 1); // short comb lines
      return t;
    }
    const ct = clumpTone(t, v, Math.sqrt(x * x + dy * dy), CO_PIXIE);
    return ct === t ? t : (md << 4) | ct;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, RIM_ON_PALE, H.R * 0.1, RV + 1, H.top - 2, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// ---------------------------------------------------------------------------
// Dev: a high-top of twists

/**
 * A high-top of short twists. The block stands on the crown from a crisp line-up (straight across, square at the
 * temples) about 3.5 u above the skull, a touch wider at the top, its top a row of rounded twist ends; the twists
 * are ropes: a lit edge on the side toward the key, a black separation, a diagonal groove every few px (the twist),
 * the lit end on top. Around it the sides are faded close to the skull and the sideburns cut square; the fade's
 * lowest band breaks into the skin at close-ups. The block rides the turn half-way (its front face toward the
 * lens), the twists' ends follow through a little.
 */
export function drawHighTop(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const hl = H.top + 3.5 + pitchShift; // the line-up
  const lineX = 4.7; // half-width of the line-up across the forehead
  const topY = H.top - 3.4; // the block's top (before the twist ends)
  const tw = tr === 2 ? (s >= 3 ? 1.2 : 1.35) : tr === 1 ? 1.6 : 2.0; // twist width (units)
  const px1 = 1 / s;
  const RS = H.R + 0.18; // the faded sides over the skull
  const [x0, y0, x1, y1] = localBox(head, -RS - 0.8, topY - 1.4, RS + 0.8, E.y + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  const fade = dec(P.maroon);
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > E.y - 0.2) return -1;
    const ax0 = Math.abs(x);
    const hw = HW.at(y);
    const fx = x - yawX;
    const dy = y - cyc;
    // ---- the block: in feature space half-way (it turns with the face), its top a row of twist ends
    const kTop = clamp01((hl - y) / (hl - topY));
    const xb = x - yawX * 0.55 - lag * 0.35 * kTop * kTop;
    const BW = 4.85 + 0.55 * kTop;
    let inBlock = false, tk = 0, tw0 = 0;
    if (y < hl + 0.05 && Math.abs(xb) < BW) {
      const fq = (xb + 30) / tw;
      tk = Math.floor(fq);
      tw0 = fq - tk; // 0..1 across the twist
      // each twist's end is rounded and stands at its own height
      const cap = 1 - Math.sqrt(Math.max(0, 1 - (2 * tw0 - 1) * (2 * tw0 - 1)));
      const yt = topY + (hashInt(tk, 13) - 0.5) * (tr === 0 ? 0.5 : 0.7) + cap * (tr === 0 ? 0.35 : 0.6) * tw;
      // the block's top corners round off
      const corner = Math.max(0, Math.abs(xb) - (BW - 1.3));
      if (y > yt + corner * corner * 0.75) inBlock = true;
    }
    if (!inBlock) {
      // ---- the faded sides: close to the skull, from the block down to the ear; square sideburns
      if (y < cyc) {
        if (x * x + dy * dy > RS * RS) return -1;
      } else if (ax0 > hw + 0.18) return -1;
      const sideburn = ax0 > hw - 0.7 && y < E.y - 0.4;
      if (y > earTop + 0.2 && !sideburn) return -1;
      // the forehead under the line-up (square at the temples, then straight down the side)
      if (y > hl && ax0 < hw - 0.75 && !sideburn) return -1;
      if (y > hl - 0.1 && Math.abs(fx) < lineX && ax0 < hw - 0.75) return -1;
      // tone: the close crop under the block black (ink on the lit side); lower down the fade shows the scalp
      // through it, maroon on the deep skin, and at close-ups its lowest band breaks into the skin
      if (tr === 0) return y > hl ? (fade << 4) | 0 : 2;
      if (y < hl + 0.6 && !(y > hl && sideburn && y > earTop - 1.6)) return x > 0 ? 2 : 1;
      if (tr === 2 && y > earTop - 0.9) {
        // (the pattern rides the head's snapped origin: fixed to the screen it would boil as the head moves)
        const bx = ((px | 0) - head.cx) & 1, by = ((py | 0) - head.cy) & 1;
        if (y > earTop - 0.35 ? bx !== by || (bx === 0 && by === 0) : bx === 0 && by === 0) return -1;
      }
      return (fade << 4) | 0;
    }
    // ---- the twists: lit edge toward the key, black separation, a diagonal groove per turn, lit ends
    const litSide = xb < 1.5; // the columns that face the key
    const edgeW = Math.min(0.34, 1.05 / (tw * s));
    if (tr === 0) return tw0 > 0.5 ? 2 : litSide ? 0 : 1;
    let t = 1;
    if (tw0 > 1 - edgeW) t = 3; // separation
    else if (tw0 < edgeW * 1.1) t = litSide ? 0 : 1;
    else if (tw0 > 0.62) t = 2; // the twist's shaded half
    if (tr === 2 && t !== 3) {
      // the rope: a groove slanting across the twist every turn
      const turn = tw * 0.95;
      const ph = (y + tw0 * tw * 0.9 + hashInt(tk, 29) * turn) / turn;
      if (ph - Math.floor(ph) < 0.26) t = Math.min(3, t + 1);
    }
    // the ends on top catch the light; the block's base sits in shade against the line-up
    if (kTop > 0.9 && t <= 1 && litSide) t = 0;
    if (y > hl - px1 * 1.2) t = Math.max(t, 2);
    if (!litSide && t === 0) t = 1;
    return t === 1 ? t : (md << 4) | t;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  // the hair light: short arcs along the twist ends on the top right
  rimRuns(buf, g, g, head.cx + 0.5 * s, x1, y0, y1, rimMat(P.silver), 2, (px, py) => py < head.cy + (topY + 1.6) * s);
}

// ---------------------------------------------------------------------------
// Leo: a ginger curly mop

const CURL_SEED = 71;
const CQ = { d1: 0, d2: 0, dx: 0, dy: 0, k: 0 }; // scratch: the nearest curl to the pixel being shaded
// each lattice cell's curl centre as a fraction of the pitch (independent of it), tabulated once for cells -32..31
const CURL_N = 64, CURL_OFF = new Float32Array(CURL_N * CURL_N * 2);
for (let j = 0; j < CURL_N; j++) {
  for (let i = 0; i < CURL_N; i++) {
    const k = (i - 32) * 7919 + (j - 32) * 104729;
    CURL_OFF[(j * CURL_N + i) * 2] = 0.2 + 0.6 * hashInt(k, CURL_SEED);
    CURL_OFF[(j * CURL_N + i) * 2 + 1] = 0.2 + 0.6 * hashInt(k, CURL_SEED + 1);
  }
}

/** The nearest two curl centres on a jittered grid of pitch d (Worley): their distances and the offset to the first. */
function curlAt(x, y, d) {
  const gx = Math.floor(x / d), gy = Math.floor(y / d);
  let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, bk = 0;
  for (let j = gy - 1; j <= gy + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      const k = i * 7919 + j * 104729;
      const o = ((((j + 32) & 63) * CURL_N) + ((i + 32) & 63)) * 2;
      const cx = (i + CURL_OFF[o]) * d, cy = (j + CURL_OFF[o + 1]) * d;
      const dx = x - cx, dy = y - cy;
      const dd = dx * dx + dy * dy;
      if (dd < d1) {
        d2 = d1;
        d1 = dd;
        bx = dx;
        by = dy;
        bk = k;
      } else if (dd < d2) d2 = dd;
    }
  }
  CQ.d1 = Math.sqrt(d1);
  CQ.d2 = Math.sqrt(d2);
  CQ.dx = bx;
  CQ.dy = by;
  CQ.k = bk;
}

/**
 * A curly mop, medium length. The outline is a crown of loose curls (a lobe per curl over the top and the sides), it
 * comes down over the tops of the ears in curl ends, and the forehead's edge is a row of curls hanging over it (never
 * near the brows). Inside, curls on a jittered lattice: each a rounded lock lit on its upper left, a C-shaped groove
 * where it turns (close-ups), a crease where it tucks under its neighbours; the mop as a whole darker on the far side
 * and underneath. The hair light: short arcs on the curls' tops on the upper right.
 */
export function drawMop(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 1.45;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const bottom = earTop + 1.0; // the curls' ends over the ears
  const px1 = 1 / s;
  const d = tr === 2 ? (s >= 3 ? 2.15 : 2.35) : 2.7; // the curl pitch (units)
  const [x0, y0, x1, y1] = localBox(head, -RV - 1.4, cyc - RV - 1.2, RV + 1.4, bottom + 1.2);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x0l = q.x, y = q.y;
    if (y > bottom + 0.9) return -1;
    const dy = y - cyc;
    // the curls bounce a moment after the head (the outer ones the most)
    const x = x0l - lag * 0.3 * clamp01(Math.abs(x0l) / RV);
    const ax0 = Math.abs(x);
    const hw = HW.at(y);
    const fx = x - yawX;
    // ---- the face window first (the cheapest test): a row of curls hanging over the forehead, down the temples
    const fp = (fx + 20.6) / (tr === 0 ? 2.6 : 2.2);
    const kf = Math.floor(fp), wf = fp - kf;
    const hang = (tr === 0 ? 0.6 : 0.85) * (0.6 + 0.4 * hashInt(kf, 5)) * Math.sqrt(Math.max(0, 1 - (2 * wf - 1) * (2 * wf - 1)));
    const hl = H.top + 3.55 + pitchShift + hang + Math.abs(fx) * Math.abs(fx) * 0.012;
    if (y > hl && ax0 < hw - 0.65 && y < H.chinY) return -1;
    // ---- the outline: a lobe per curl round the crown, the sides down over the ears in curl ends
    const a = fastAtan2(x, -dy);
    const per = tr === 0 ? 0.5 : 0.36; // rad per curl
    const ph = (a + 7) / per;
    const ka = Math.floor(ph), fa = ph - ka;
    const lobe = (tr === 0 ? 0.55 : 0.7) * (0.65 + 0.35 * hashInt(ka, 3)) * Math.sqrt(Math.max(0, 1 - (2 * fa - 1) * (2 * fa - 1)));
    let outer;
    if (y < cyc) outer = RV - 0.55 + lobe;
    else {
      const k = clamp01((y - cyc) / (bottom - cyc));
      outer = RV - 0.55 + lobe - 0.25 * k;
    }
    const r = y < cyc ? Math.sqrt(x * x + dy * dy) : ax0 + (y - cyc) * 0.12;
    if (r > outer) return -1;
    // the curl ends along the bottom over the ears: a rounded end per curl
    const fb = (ax0 + 1.3) / 1.6;
    const kb = Math.floor(fb), wb = fb - kb;
    const endY = bottom - 0.65 * (1 - Math.sqrt(Math.max(0, 1 - (2 * wb - 1) * (2 * wb - 1)))) + (hashInt(kb, 9) - 0.5) * 0.5;
    if (y > endY) return -1;
    // ---- tone: the mop's form (lit upper left, darker on the far side and underneath)
    // (rust body, orange only where a lock turns to the key: a ginger mass lit flat in orange would outshine the face)
    const nx = x / RV, ny = dy / RV;
    const lf = -0.55 * nx - 0.7 * ny;
    let form = lf > -0.25 ? 1 : 2;
    if (y > earTop - 0.4) form = Math.max(form, x > 0 ? 2 : 1);
    if (tr === 0) {
      // the wide: two tones and a few lit curl tops on the upper left
      if (form === 1 && lf > 0.3) {
        curlAt(fx, y, d);
        return CQ.dx < 0 && CQ.dy < 0 && CQ.d1 > d * 0.18 ? 0 : 1;
      }
      return form;
    }
    // ---- the curls
    curlAt(fx * 0.92 + x * 0.08, y, d);
    const cr = d * 0.55; // a curl's radius
    const u = CQ.dx / cr, v = CQ.dy / cr;
    const lc = -0.6 * u - 0.8 * v;
    let t = form;
    // the lock's lit side (orange only on the half of the mop toward the key)
    if (lc > 0.25 && CQ.d1 > cr * 0.28) t = form === 1 && lf > -0.05 ? 0 : form === 2 ? 1 : form;
    else if (lc < -0.35) t = Math.min(3, form + 1); // its shaded side
    // the crease between locks
    const crease = CQ.d2 - CQ.d1 < (tr === 2 ? 1.25 : 1.0) * px1 + 0.08;
    if (crease) t = Math.min(3, Math.max(t, form) + 1);
    // close-ups: a C-shaped groove inside each lock (it turns over), opening toward the lower left
    if (tr === 2 && !crease) {
      const rr = CQ.d1 / cr;
      const ang = fastAtan2(CQ.dy, CQ.dx) + hashInt(CQ.k, 23) * 1.2;
      if (Math.abs(rr - 0.52) < (0.55 * px1) / cr + 0.05 && ang > -1.4 && ang < 2.2) t = Math.min(3, Math.max(t, form) + 1);
    }
    // the outermost pixel keeps the form (a clean outline for the rim and the outline)
    if (r > outer - px1) t = Math.max(form, 1);
    return t === form ? t : (md << 4) | t;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) {
    const yLimit = head.cy + (cyc - RV * 0.35) * s;
    rimRuns(buf, g, g, head.cx + 0.2 * s, x1, y0, y1, rimMat(P.silver), tr === 2 ? 3 : 2, (px, py) => py < yLimit);
  }
}

// ---------------------------------------------------------------------------
// June: an asymmetric undercut

const CO_SWEEP = { cw: 1.0, s: 1, seed: 83, sep: true, hiLo: 1.2, hiHi: 6.4, hiW: 0.5, gap: 5.5, keepLit: true };

/**
 * An asymmetric undercut. Left of the part (feature space, screen-left) the head is shaved to a dark stubble that
 * hugs the skull, with a clean high edge on the forehead, a square temple and the ear in full view; from the part the
 * long top swoops up over the crown (its fullest over the top right, so the silhouette steps up at the part) and
 * falls down the far side past the cheek to an angled cut at the jaw, longer at the front. Its fringe sweeps from the
 * part across the forehead to the far temple, never over the brow. Glossy contour strands follow the swoop, the sheen
 * a band of pink strokes over the top where it faces the key; the far curtain in shade. The ends swing after the head.
 */
export function drawUndercut(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const PART = -2.1; // where the long top starts (feature space)
  const RS = H.R + 0.14; // the stubble over the skull
  const RV = H.R + 1.45; // the long top's volume
  const earTop = E.y - E.h * 0.5;
  const END = H.chinY - 0.4; // the long side's cut, at the jaw
  const browY = L.brows.y - 0.5;
  const px1 = 1 / s;
  const aPart = Math.atan2(PART, H.R); // the part's angle on the crown (0 at the top, + toward screen-right)
  const [x0, y0, x1, y1] = localBox(head, -RS - 0.7, cyc - RV - 1.0, RV + 1.4, END + 1.2);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  CO_SWEEP.s = s;
  CO_SWEEP.sep = tr === 2;
  CO_SWEEP.cw = tr === 2 ? 1.5 : 2.0;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const k = y > 1 ? clamp01((y - 1) / (END - 1)) : 0;
    const x = q.x - lag * k * k; // the long side's ends swing after the head
    const fx = x - yawX;
    const dy = y - cyc;
    const hw = HW.at(Math.min(y, H.chinY - 0.2));
    // ---- which hair: the long top (from the part over the crown), the long side (screen-right), else stubble
    let zone = 0, depth = 0, along = 0;
    if (dy < 0) {
      const r = Math.sqrt(x * x + dy * dy);
      const a = fastAtan2(fx, -dy);
      if (a > aPart - 0.04) {
        // the swoop rises from the part to its fullest over the top right
        const rise = clamp01((a - aPart) / 0.45);
        const R = RS + (RV + 0.35 * Math.exp(-((a - 0.3) * (a - 0.3)) / 0.5) - RS) * Math.sqrt(rise);
        if (r <= R) {
          zone = 1;
          depth = R - r;
          along = (a - aPart) * RV;
        }
      }
      if (!zone && r > RS) return -1;
    } else if (x > 0) {
      // the long side: hugs the cheek, flares a little toward the ends, cut at an angle (longer by the face)
      const outer = H.R + 1.25 + 0.35 * k - 0.3 * Math.exp(-((y - H.chinY + 1.5) * (y - H.chinY + 1.5)) / 3);
      const inner = y < H.chinY - 1.4 ? hw - 1.0 : Math.max(2.6, hw - 1.0 - (y - H.chinY + 1.4) * 0.4);
      const tip = tr === 2 ? 0.3 * Math.abs((((x * 1.5) % 2) + 2) % 2 - 1) : 0; // the cut breaks into strand tips
      const endY = END + 0.5 - (x - inner) * 0.32 - tip;
      if (x <= outer && x >= inner && y <= endY) {
        zone = 2;
        depth = outer - x;
        along = (Math.PI / 2 - aPart) * RV + dy;
      } else return -1;
    }
    if (!zone) {
      // ---- the stubble: over the skull left of the part, down to the ear; a clean edge high on the forehead
      if (dy >= 0 && Math.abs(x) > hw + 0.14) return -1;
      const sideburn = Math.abs(x) > hw - 0.6 && y < E.y - 0.5;
      if (y > earTop + 0.1 && !sideburn) return -1;
      const hlS = H.top + 3.6 + pitchShift;
      if (y > hlS && Math.abs(x) < hw - 0.6) return -1;
      // a stubble's tone: purple, specks of maroon (and of magenta where the key falls) at close-ups, hashed on the
      // head's snapped origin so they ride with it
      if (tr < 2) return 2;
      const h = hashInt((((px | 0) - head.cx) * 73856093) ^ (((py | 0) - head.cy) * 19349663), 7);
      if (h < 0.22) return (md << 4) | 3;
      if (h > 0.9 && x < -2) return (md << 4) | 1;
      return 2;
    }
    // ---- the face window under the fringe: the sweep from the part down to the far temple
    if (zone === 1 && fx < PART + 0.4 && y > H.top + 3.0 + pitchShift && Math.abs(x) < hw - 0.6) return -1;
    const sw = Math.max(0, fx - PART);
    const tipF = tr === 2 ? 0.22 * Math.abs(((sw * 1.3) % 2) - 1) : 0;
    const sweep = Math.min(browY + pitchShift, H.top + 2.9 + pitchShift + sw * 0.66 - 0.4 * Math.sin(Math.min(1, sw / 7) * Math.PI) + tipF);
    if (y > sweep && Math.abs(x) < hw - 1.0 && y < H.chinY + 1.5) return -1;
    // ---- tone: the swoop's form lit from the key; the long side in shade, its face side deeper
    let t;
    if (zone === 1) {
      const nx = x / RV, ny = dy / RV;
      t = toneN(mt, nx * 0.9, ny * 0.9);
    } else {
      const q2 = depth / Math.max(0.8, H.R + 1.25 - hw + 1.0);
      t = q2 > 0.7 ? 3 : 2;
    }
    const nearFace = y > sweep - 0.3 && Math.abs(x) < hw + 0.3;
    if (nearFace) t = Math.max(t, 2);
    if (tr === 0) {
      if (t === 0) return y < cyc - 3 ? 0 : 1;
      return t >= 3 ? 2 : t;
    }
    if (depth < px1) return t; // the outermost pixel: a clean edge for the outline and the hair light
    if (y > sweep - 1.2 * px1 && Math.abs(x) < hw) return Math.max(t, 2); // the fringe turns under at its edge
    const ct = clumpTone(t, depth + 0.3 * Math.sin(along * 0.8) + 20, along, CO_SWEEP);
    return ct === t ? t : (md << 4) | ct;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.05, RV + 1.4, cyc - RV - 1, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

// ---------------------------------------------------------------------------
// Amara: box braids

const BRAID_PART = 2.0; // the parting (feature space, screen-right of centre)
let BW_NOW = 1; // the braid width of the frame being drawn (units)

/**
 * One braid's tone at (wl, along): wl 0..1 across it from its screen-left edge, along in units down the braid. A dark
 * braid reads by its plaits: a small lit dash on the upper left of each bump (a herringbone down the braid), a black
 * separation at its right edge. `lit` 1 on the side toward the key.
 */
function braidTone(wl, along, h, lit, tr, s) {
  const sepW = Math.min(0.34, 1.0 / (BW_NOW * s));
  if (wl > 1 - sepW) return 3;
  if (tr === 0) return lit ? 1 : 2;
  const body = lit ? 1 : 2;
  const pb = tr === 2 ? 0.8 : 1.1; // a plait's length
  const f = (((along + Math.abs(wl - 0.45) * pb * 0.9 + h * pb) / pb) % 1 + 1) % 1;
  if (f < 0.3 && wl < 0.62) return body - 1;
  if (tr === 2 && f > 0.82 && wl > 0.3) return Math.min(3, body + 1);
  return body;
}

/**
 * The scalp: braids lying back from a neat hairline (rounded at the temples) and a side parting that shows the skin,
 * close to the skull, down the sides to the top of the ear, where they turn behind it (drawBraidsBack hangs them).
 * Each row a braid with its plaits lit toward the key and a dark parting beside it, fanning back from the hairline.
 */
export function drawBraids(buf, L, m, head, s) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.7;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const earTop = E.y - E.h * 0.5;
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 0.6, cyc - RV - 0.6, RV + 0.6, earTop + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  const scalp = dec(L.skin[2]);
  BW_NOW = tr === 2 ? (s >= 3 ? 1.0 : 1.15) : 1.5;
  const ay = cyc + 4.5; // the rows fan from a point below the crown's centre
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const x = q.x, y = q.y;
    if (y > earTop) return -1;
    const ax0 = Math.abs(x);
    const hw = HW.at(y);
    const dy = y - cyc;
    if (dy < 0) {
      if (x * x + dy * dy > RV * RV) return -1;
    } else if (ax0 > hw + 0.7 - 0.25 * clamp01(dy / (earTop - cyc))) return -1;
    const fx = x - yawX;
    const afx = Math.abs(fx);
    // a neat hairline, rounded down at the temples to the side
    const hl = H.top + 3.85 + pitchShift + fx * fx * 0.018 + Math.max(0, afx - 4.9) ** 2 * 0.9;
    if (y > hl && ax0 < hw - 0.55) return -1;
    // the rows: an angle round the fan's point (vertical at the hairline's centre, slanting out at the sides)
    const rx = fx - BRAID_PART * 0.25, ry = ay - y;
    const along = Math.sqrt(rx * rx + ry * ry);
    const v = fastAtan2(rx, ry) * 6.2 + 40;
    const kq = v / BW_NOW;
    const kk = Math.floor(kq);
    const w = kq - kk;
    const lit = x < 1.5 ? 1 : 0;
    // form: the far side and the sides a step down
    if (tr === 0) return x > 1 ? 2 : 1;
    // the parting: the skin in a 1 px line back from the hairline
    if (y < hl + 0.1 && Math.abs(fx - BRAID_PART - (hl - y) * 0.08) < 0.5 * px1 + (tr === 2 ? 0.05 : 0.2) && y > H.top + 0.4) return (scalp << 4) | 0;
    // the outermost pixel and the hairline's row stay quiet
    if (dy < 0 && x * x + dy * dy > (RV - px1) * (RV - px1)) return lit ? 1 : 2;
    if (y > hl - px1 * 1.1 && ax0 < hw) return 2;
    const t = braidTone(w, along, hashInt(kk, 37), lit, tr, s);
    return t === 1 ? t : (md << 4) | t;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.1, RV + 1, cyc - RV - 1, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

/**
 * The hanging braids, behind the head, the ears and the neck (only what is outside them shows): from under the scalp
 * they spread over and behind the ears into a bell and fall straight to the shoulders, each braid its own column (the
 * columns fan out as the bell widens), ending at its own length in a tapered tip; a couple wear a small gold cuff
 * near the end. The far side one step down; the ends swing after the head.
 */
export function drawBraidsBack(buf, L, m, head, s, sk) {
  const H = L.head, E = L.ears;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.7;
  const earTop = E.y - E.h * 0.5;
  const END = H.chinY + 4.4; // to the shoulders
  const px1 = 1 / s;
  const wTop = RV, wEar = H.R + 2.3;
  // (above cyc - 1.5 the scalp in front covers the bell: the box starts there)
  const yTop = cyc - 1.5;
  const [x0, y0, x1, y1] = localBox(head, -wEar - 1.8, yTop, wEar + 1.8, END + 1.2);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const neckIn = L.neck.hw - 0.8; // (just under the chin: lower down the neck may lean off the head's axis)
  const mt = m.hairBack, md = m.hxD;
  const gold = dec(L.hoops ? L.hoops[0] : P.yellow), goldShade = dec(L.hoops ? L.hoops[1] : P.orange);
  BW_NOW = tr === 2 ? (s >= 3 ? 1.05 : 1.2) : tr === 1 ? 1.5 : 2.0;
  const nSide = Math.round((wEar + 1.2) / BW_NOW); // braids per side at the shoulders
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const y = q.y;
    if (y < yTop) return -1;
    // (behind the head and the neck, drawn over it: nothing there can show)
    const ar = Math.abs(q.x);
    if (y < H.chinY - 0.5 ? ar < HW.at(y) - 0.6 : y < H.chinY + 3.5 && ar < neckIn) return -1;
    const k = y > 2 ? clamp01((y - 2) / (END - 2)) : 0;
    const x = q.x - lag * k * k;
    const ax = Math.abs(x);
    // the bell: from the scalp's width, spreading over the ears, then straight down with a slight flare
    let half;
    if (y < earTop) half = wTop + (wEar - wTop) * Math.sqrt(clamp01((y - (cyc - 1)) / (earTop - cyc + 1)));
    else half = wEar + 0.07 * (y - earTop);
    if (ax > half) return -1;
    if (y < cyc && x * x + (y - cyc) * (y - cyc) > (RV + 0.2) * (RV + 0.2)) return -1;
    // the columns: a fraction of the bell's width, so they fan out as it widens
    const side = x < 0 ? 0 : 1;
    const u = (ax / half) * nSide;
    const kb = Math.floor(u);
    const w = u - kb;
    const wl = side ? w : 1 - w; // 0 at the braid's screen-left edge
    const id = kb + side * 50;
    const h = hashInt(id, 3);
    // each braid ends at its own length, in a tapered tip
    const endK = END + (h - 0.5) * 1.6 - (kb < 2 ? 1.2 : 0);
    if (y > endK) return -1;
    const taper = y - (endK - 0.7);
    if (taper > 0 && Math.abs(wl - 0.45) > 0.5 * Math.sqrt(Math.max(0, 1 - (taper / 0.7) * (taper / 0.7)))) return -1;
    const lit = side === 0 ? 1 : 0;
    // a gold cuff near the end of a couple of braids (those that hang clear of the neck)
    if (tr > 0 && kb >= 3 && hashInt(id, 41) < 0.2) {
      const c0 = endK - 2.2, c1 = c0 + Math.max(px1 * (tr === 2 ? 2 : 1), 0.45);
      if (y >= c0 && y < c1 && wl < 1 - Math.min(0.34, 1.0 / (BW_NOW * s))) return wl < 0.5 ? (gold << 4) | 0 : (goldShade << 4) | 0;
    }
    // over the ears the braids run down and out from the scalp; in the wide two tones only
    const t = braidTone(wl, y, h, lit, tr, s);
    if (tr === 0) return t >= 3 ? 2 : t;
    return t === 1 || t === 2 ? t : (md << 4) | t;
  });
}

// ---------------------------------------------------------------------------
// Ines: long waves

const CO_WAVE = { cw: 1.1, s: 1, seed: 97, sep: true, hiLo: 2.2, hiHi: 7.2, hiW: 0.42, gap: 4.4 };

/** The waves' sideways shift at height y (units) on a side (0 left, 1 right): growing toward the ends. */
function waveShift(y, side) {
  const A = 0.22 + 0.4 * clamp01(y / 11);
  return A * Math.sin((y - 1) * 1.85 + (side ? 1.9 : 0));
}

/**
 * Long waves from a centre parting. The crown lies smooth from the part, the hair falls each side past the temples
 * (covering the face's outer edge and the ears) and fills out below the jaw into a soft A over the shoulders; both
 * outlines wave, the inner one clear of the neck. Strands follow the waves in clumps; the sheen is a run of short
 * strokes across each wave where it turns to the key (it zigzags down the hair), the shade in its troughs; the far
 * curtain a step down; the ends are clumps of their own lengths and swing after the head.
 */
export function drawWaves(buf, L, m, head, s, sk) {
  const H = L.head;
  const tr = tier(s);
  const lag = sk.hairLag || 0;
  const cyc = H.craniumY - 0.3;
  const RV = H.R + 0.95;
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const END = H.chinY + 6.4;
  const px1 = 1 / s;
  const [x0, y0, x1, y1] = localBox(head, -RV - 4.4, cyc - RV - 0.6, RV + 4.4, END + 1.2);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const mt = m.hx, md = m.hxD;
  CO_WAVE.s = s;
  CO_WAVE.sep = tr === 2;
  const cw = tr === 2 ? (s >= 3 ? 1.1 : 1.25) : 1.7;
  CO_WAVE.cw = tr === 2 ? 1.5 : 2.0; // the crown's clumps (the curtains band by cw)
  const chinHW = HW.at(H.chinY - 1.2);
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    q.at(px, py);
    const y = q.y;
    const k = y > 2 ? clamp01((y - 2) / (END - 2)) : 0;
    const x = q.x - lag * k * k;
    const side = x < 0 ? 0 : 1;
    const ax = Math.abs(x);
    const fx = x - yawX;
    const dy = y - cyc;
    const hw = HW.at(Math.min(y, H.chinY - 0.2));
    // ---- the face window first (a large share of the box, and the cheapest test): the hairline curving down from
    // the part to the temples, the face's edge covered; then the neck between the curtains
    const hl = H.top + 3.6 + pitchShift + Math.abs(fx) * 0.36 + fx * fx * 0.028;
    if (y > hl && ax < hw - 0.85 && y < H.chinY + 1.5) return -1;
    if (y > H.chinY - 1.2 && ax < 2.4) return -1;
    const ws = dy > 0 ? waveShift(y, side) : 0;
    // ---- the outline: the crown (a dip at the part), then the curtains with a wavy outer and inner edge
    let zone = 0, depth = 0, along = 0;
    if (dy < 0) {
      const r = Math.sqrt(x * x + dy * dy);
      const R = RV - 0.3 * Math.exp(-(fx * fx) / 1.4) + 0.25 * Math.min(1, Math.abs(fx) / RV);
      if (r > R) return -1;
      zone = 1;
      depth = R - r;
      along = Math.abs(fastAtan2(fx, -dy)) * RV;
    } else {
      const full = clamp01((y - (H.chinY - 3)) / (END - 1 - (H.chinY - 3)));
      const outer = H.R + 0.95 + 0.25 * Math.exp(-((y - 1) * (y - 1)) / 6) + 2.9 * full * full * (3 - 2 * full) + ws;
      const inner = y < H.chinY - 1.2 ? hw - 0.85 : Math.max(3.0, chinHW - 0.85 - (y - H.chinY + 1.2) * 0.35) + ws * 0.8;
      if (ax > outer) return -1;
      // the ends: a clump per band across the curtain, each at its own length with a rounded end
      const qq = (outer - ax) / cw;
      const kc = Math.floor(qq), wc = qq - kc;
      const endY = END + (hashInt(kc + side * 20, 5) - 0.5) * (tr === 0 ? 0.6 : 1.3) - (2 * wc - 1) * (2 * wc - 1) * (tr === 0 ? 0.3 : 0.6) - (ax < inner + 1.5 ? 0.8 : 0);
      if (y > endY) return -1;
      if (ax < inner && y > H.chinY - 1.2) return -1; // the neck and the chest between the curtains
      zone = 2;
      depth = outer - ax;
      along = Math.PI * 0.5 * RV + dy;
    }
    // ---- tone: the form lit from the key (the far curtain a step down), shade by the face
    let t;
    if (zone === 1) t = toneN(mt, (x / RV) * 0.9, (dy / RV) * 0.9);
    else t = side ? 2 : 1;
    const nearFace = y > hl - 0.3 && ax < hw + 0.5 && y < H.chinY + 0.5;
    if (nearFace) t = Math.max(t, 2);
    // the waves: a lit run where each wave turns to the key, shade in its trough (zigzagging across the clumps)
    const ph = (y - 1) * 1.85 + (side ? 1.9 : 0) - 0.65 - depth * 0.22;
    const wv = zone === 2 ? Math.sin(ph) : 0;
    if (tr === 0) {
      if (zone === 1) return t === 0 ? 0 : t >= 2 ? 2 : 1;
      return wv > 0.55 && !side && !nearFace ? 0 : t;
    }
    // the part: a dark line back from the hairline
    if (zone === 1 && y < hl + 0.1 && y > hl - 2.6 && Math.abs(fx) < (tr === 2 ? 0.5 * px1 + 0.08 : 0.35)) return 2;
    if (depth < px1) return t; // the outermost pixel: a clean edge for the outline and the hair light
    if (zone === 1) {
      if (y > hl - 1.2 * px1 && ax < hw) return Math.max(t, 2);
      const ct = clumpTone(t, depth + 0.3 * Math.sin(along * 0.9) + 30, along, CO_WAVE);
      return ct === t ? t : (md << 4) | ct;
    }
    // the curtain's strands follow the waves: clumps across (from the outer edge), the sheen runs across them
    const v = depth + 40;
    const kk = Math.floor(v / cw), w = v / cw - kk;
    const hk = hashInt(kk + side * 20, 11);
    let tt = t;
    if (!nearFace) {
      if (wv > 0.62 - hk * 0.2 && w > 0.12 && w < 0.82) tt = t - 1;
      else if (wv < -0.7) tt = Math.min(3, t + 1);
    }
    // close-ups: a broken separation at the far edge of most clumps
    if (tr === 2 && hk < 0.7 && w > 1 - Math.min(0.4, 1.0 / (cw * s)) && ((y + hk * 3) % 2.6) < 1.9) tt = Math.min(3, Math.max(tt, t) + 1);
    return tt === t ? t : (md << 4) | tt;
  });
  const g = head.gb + GROUPS.hair;
  selOutEdge(buf, x0, y0, x1, y1, g, head.gb + GROUPS.head, mt, m.hxE);
  if (s >= 1.35) hairLight(buf, head, g, rimMat(P.silver), H.R * 0.1, RV + 1, cyc - RV - 1, cyc + 1, Math.max(2, Math.round(s * 1.2)));
}

/** The hair behind the neck, between the two curtains (in shade). */
export function drawWavesBack(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const END = H.chinY + 5.6;
  const [x0, y0, x1, y1] = localBox(head, -H.R - 3.4, H.cheekY, H.R + 3.4, END + 0.6);
  const q = LXY.set(head);
  const HW = HWL.set(H, 0);
  const neckIn = L.neck.hw - 0.8; // (just under the chin: lower down the neck may lean off the head's axis)
  buf.shape(x0, y0, x1, y1, m.hairBack, (px, py) => {
    q.at(px, py);
    const y = q.y;
    if (y < H.cheekY || y > END) return -1;
    // (behind the head and the neck, drawn over it: nothing there can show)
    const ar = Math.abs(q.x);
    if (y < H.chinY - 0.5 ? ar < HW.at(y) - 0.6 : y < H.chinY + 3.5 && ar < neckIn) return -1;
    const k = clamp01((y - 2) / (END - 2));
    const x = q.x - lag * k * k;
    const half = H.R + 0.6 + 2.4 * clamp01((y - H.chinY + 2) / 6);
    if (Math.abs(x) > half) return -1;
    return 3;
  });
}

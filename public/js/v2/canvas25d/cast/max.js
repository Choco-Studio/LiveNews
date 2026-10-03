// Max Circuit (owner: PRESENTERS B stream). Technology correspondent of TECH
// BYTES: quick and interested first, dry one-liners, never silly. Younger than
// the anchors but clearly a grown-up: an unstructured tobacco-brown blazer worn
// open over a charcoal crew-neck knit (cast/wardrobe-b.js 'knitBlazer'),
// short espresso hair with a soft, swept quiff and a close-trimmed beard.
//
// Hair craft (owner, 17:50: nothing "made of triangles and circles"; 22:50: one
// identity at every framing): ONE outline, a polar profile round the crown
// with the quiff's volume lifted front-right and a row of rounded clump ends
// combed toward camera-right (never spikes: each lobe rises slowly and drops
// steeply, a few px high at most); strands rise from the hairline and lean
// right as they climb; highlight strokes only on the upper-left face of the
// quiff; faded sides clipped close with a sideburn; a maroon sel-out line
// where the hair meets the forehead; the rim only along the top-right.
// The beard (parts.over): close-trimmed, following the jaw, cheek line clean,
// the moustache joined at the mouth corners; it follows the open jaw and
// never covers the lips. LOD: the wide keeps the silhouette and two tones, the
// medium adds the clump ends and broad sheen, the close-up adds separations.
//
// Proportions stay adult (head ≈ 19 u on shoulders ≈ 40 u); the face is
// narrower and squarer-jawed than Paco's, with no eye bags. No cyan anywhere:
// TECH BYTES' accent belongs to the graphics.
import { P } from '../../../palette.js';
import { material } from '../pixbuf.js';
import { clamp } from '../space.js';
import { defineLook, SKIN_TAN } from './base.js';
import { selOutEdge } from './kit-a.js';
import { local, tier, hwAt, fastAtan2, hashInt, rimRuns } from './wardrobe-b.js';

export const max = defineLook({
  id: 'max',
  name: 'Max Circuit',
  head: { top: -10.0, craniumY: -2.5, R: 7.0, cheekY: 1.4, cheekHW: 6.7, chinY: 9.3, chinHW: 3.3, jawPow: 2.9 },
  headAt: [0, -12.55], // a shorter neck and a lower seat than the anchors: he leans in
  neck: { hw: 2.85 },
  eyes: { y: -0.6, x: 2.8, w: 2.65, h: 1.62, iris: [P.brown, P.maroon], lash: P.black, lashes: false, bags: false },
  brows: { y: -2.75, len: 3.35, thick: 0.56, color: P.maroon, arch: 0.18 },
  nose: { y0: -0.3, y1: 3.45, w: 1.45, big: false },
  mouth: { y: 6.0, w: 3.7, lip: P.brown, lipHi: P.tanShade, upper: P.tanShade, inner: P.maroon, teeth: P.silver, tongue: P.darkRed },
  ears: { y: -0.1, h: 2.8, w: 1.0 },
  skin: SKIN_TAN,
  skinLine: P.brown,
  hair: { style: 'textured', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  beard: { ramp: [P.tanShade, P.brown, P.maroon, P.black] },
  torso: { neckHW: 3.3, shoulderTop: 2.6, shoulderHW: 19.8, sideHW: 18.6, bottom: 46, vDepth: 21, shoulderJoint: [17.0, 6.9] },
  outfit: 'knitBlazer',
  jacket: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black }, // tobacco wool, darker than his face
  shirt: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black }, // charcoal knit
  cuff: P.ink,
  arm: { upper: 22.6, fore: 20.6, rUpper: 3.4, rElbow: 2.95, rWrist: 2.3, hand: 10.9 },
  persona: { sway: 1.0, headMotion: 1.15, blinkMin: 2.0, blinkMax: 4.6, energy: 1.2, smile: 0.2 },
  mats: {
    lapel: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.maroon, rim: P.silver },
    rib: { ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
    // the hair without the resolve rim (it would dot every clump end); drawTextured paints the rim
    // as continuous arcs along the top-right of the quiff
    tex: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.black, th: [0.62, 0.08, -0.42] },
    // the same hair where it lies on the forehead: a maroon line instead of the black outline (sel-out)
    texEdge: { ramp: [P.brown, P.maroon, P.black, P.black], line: P.maroon, th: [0.62, 0.08, -0.42] },
    // 1 px strokes (separations, highlights) that resolve's speckle clean-up must keep
    texD: { ramp: [P.brown, P.maroon, P.black, P.black], decal: true },
    // the beard (a repaint inside the head group: no line against the skin it grows from; its line shows
    // only where the chin sits over the neck, and as the jaw's outer outline)
    beard: { ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
    beardD: { ramp: [P.tanShade, P.brown, P.maroon, P.black], decal: true },
  },
  parts: { hair: drawTextured, over: drawBeard },
});

// ---------------------------------------------------------------------------
// Hair

// The quiff (head-local units / radians from the top of the crown, + toward screen-right):
// `lift` its height over the crown at `peak`, falling off over `wl` toward the left and `wr` toward
// the right; clump ends every `period` rad, `lobe` u high.
export const QUIFF = { lift: 3.8, peak: 0.4, wl: 1.05, wr: 0.52, lobe: 0.55, period: 0.36 };

// One rounded clump end per period, as a table over its phase: rises slowly, rolls over, drops steeply
// (combed toward camera-right). 0 at both ends so neighbouring lobes meet in a notch.
const LOBE_N = 256;
const LOBE = new Float32Array(LOBE_N);
for (let i = 0; i < LOBE_N; i++) {
  const f = i / LOBE_N;
  LOBE[i] = f < 0.72 ? Math.sin((f / 0.72) * Math.PI * 0.5) ** 0.8 : Math.cos(((f - 0.72) / 0.28) * Math.PI * 0.5) ** 1.4;
}
const LC = [0, 0];
const HS = { form: 0, u: 0, v: 0 }; // scratch for the strand coordinates of the pixel being shaded
// exp(-q) for q in [0, 8) (the quiff's falloff), tabulated: the outline is evaluated for most pixels of the box
const EXP_N = 1024, EXP_MAX = 8;
const EXPQ = new Float32Array(EXP_N + 1);
for (let i = 0; i <= EXP_N; i++) EXPQ[i] = Math.exp(-(i / EXP_N) * EXP_MAX);
const expNeg = (q) => (q >= EXP_MAX ? 0 : EXPQ[(q * (EXP_N / EXP_MAX)) | 0]);
// the front hairline per 0.05 u of feature-space x (rebuilt per frame: it depends on the pitch and the tier)
const HL_X0 = -14, HL_STEP = 0.05, HL_N = Math.ceil(28 / HL_STEP) + 1;
const HLT = new Float32Array(HL_N);

/** Outer radius of the hair at angle a (feature space), lobes included (units over the dome centre). */
function outerR(a, RV, tr, keepLobes) {
  const Q = QUIFF;
  const d = a - Q.peak;
  const w = d < 0 ? Q.wl : Q.wr;
  let r = RV + Q.lift * expNeg((d * d) / (w * w));
  if (keepLobes && a > -1.25 && a < 1.45) {
    const ph = (a + 6) / Q.period;
    const k = Math.floor(ph);
    const f = ph - k;
    const env = Math.min(1, (a + 1.25) / 0.45, (1.45 - a) / 0.4);
    const amp = Q.lobe * env * (0.55 + 0.75 * hashInt(k, 17)) * (tr === 0 ? 0.55 : 1);
    r += amp * LOBE[(f * LOBE_N) | 0];
  }
  return r;
}

// Short textured crop: close faded sides with a sideburn, the quiff's volume on top.
function drawTextured(buf, L, m, head, s, sk) {
  const H = L.head;
  const lag = sk.hairLag || 0;
  const tr = tier(s);
  const yawX = Math.sin(head.yaw) * H.R * 0.8;
  const pitchShift = Math.sin(head.pitch) * 2.0;
  const cyc = H.craniumY - 0.45; // the crown's centre
  const RV = H.R + 0.5; // the crown over the skull: short, the volume is the quiff's
  const sideTop = H.craniumY - 1.6; // above this the hair has volume; below, the sides are clipped
  const px1 = 1 / s;
  const lift = QUIFF.lift;
  // the front hairline: a soft M (temples slightly receded), broken into short tips at close-ups
  for (let i = 0; i < HL_N; i++) {
    const fx = HL_X0 + i * HL_STEP;
    HLT[i] = H.top + 4.1 + pitchShift + fx * fx * 0.034 - Math.exp(-((Math.abs(fx) - 4.6) ** 2) / 1.6) * 0.85 +
      (tr === 2 ? 0.1 * Math.sin(fx * 1.7 + 0.4) : 0);
  }
  const hairline = (fx) => {
    const i = Math.round((fx - HL_X0) / HL_STEP);
    return HLT[i < 0 ? 0 : i >= HL_N ? HL_N - 1 : i];
  };
  const rMax = RV + lift + QUIFF.lobe * 1.3 + 0.1; // nothing of the crown reaches past this radius
  const E = L.ears, earTop = E.y - E.h * 0.5, earBot = E.y + E.h * 0.5, earBack = E.w + 0.3;
  const x0 = head.cx - (RV + lift + 1.2) * s, x1 = head.cx + (RV + lift + 1.2) * s;
  const y0 = head.cy + (cyc - RV - lift - 1.4) * s, y1 = head.cy + 0.8 * s;
  const sheenLo = 1.3, sheenHi = 5.0; // along-strand window of the highlight strokes (units above the hairline)
  const cw = tr === 2 ? 1.25 : 1.9; // clump width (units)
  const mt = m.tex, md = m.texD;
  buf.shape(x0, y0, x1, y1, mt, (px, py) => {
    local(head, px, py, LC);
    const y = LC[1];
    if (y > 0.6) return -1;
    const dy = y - cyc;
    // the upper hair follows through after the head (the quiff's ends lag the most)
    const k = dy < -3 ? clamp((-dy - 3) / 7, 0, 1) : 0;
    const x = LC[0] - lag * 0.4 * k;
    const fx = x - yawX;
    const hw = hwAt(L, y);
    const hl = hairline(fx);
    // ---- outline: the crown and quiff above sideTop (polar profile), clipped sides below
    let zone;
    let a = 0;
    if (y < sideTop) {
      // the outline is centred on the skull (a turned head keeps its hair over the far side of the
      // cranium); only the quiff's profile (its angle) turns with the features
      const r2 = x * x + dy * dy;
      if (r2 > rMax * rMax) return -1;
      const r = Math.sqrt(r2);
      a = fastAtan2(fx, -dy);
      const R = outerR(a, RV, tr, true);
      if (r > R) return -1;
      zone = 1;
      HS.v = R - r; // depth under the outline
    } else {
      // clipped close: a sliver over the skull down to the sideburn, nothing past the ear's top
      if (Math.abs(x) > hw + 0.35) return -1;
      const sideburn = Math.abs(x) > hw - 0.5 && y < -0.9;
      // a turned head shows the back of the skull on the far side: short hair down to the ear's top
      // there (and behind the ear), never bare skin
      const back = yawX !== 0 && fx * yawX < 0 && (Math.abs(fx) > hw - 0.35 && y < earTop || Math.abs(fx) > hw + earBack && y < earBot);
      if (!sideburn && !back && Math.abs(x) < hw - 0.05 && y > hl) return -1;
      if (y > H.craniumY + 0.5 && !sideburn && !back) return -1;
      zone = 2;
    }
    // the face window: forehead open under the hairline
    if (zone === 1 && y > hl && Math.abs(x) < hw - 0.05) return -1;
    if (zone === 2) {
      // faded sides: short, flat; the lit side one step up where it thins toward the skin
      if (tr === 0) return x > 0 ? 2 : 1;
      const thin = y > H.craniumY - 0.8;
      let t = x > 0 ? (thin ? 1 : 2) : thin ? 0 : 1;
      if (tr === 2 && Math.abs(x) > hw - 0.5 && y > H.craniumY && x < 0) t = 1; // the sideburn's edge
      if (tr === 2 && !thin && x < 0 && ((y * 2.2 + x * 0.5) % 1.5 + 1.5) % 1.5 < 0.38) t = 2; // comb lines
      return t;
    }
    // ---- form: the crown lit from the key, the quiff's front face toward the lens
    const R0 = RV + lift * 0.5;
    const nx = fx / R0, ny = dy / R0;
    const l = -0.55 * nx - 0.78 * ny;
    const depth = HS.v;
    let form = l > 0.58 ? 0 : l > -0.05 ? 1 : l > -0.5 ? 2 : 3;
    // the quiff turns away on its right flank and its underside rolls into shadow at the hairline
    if (a > QUIFF.peak + 0.55 && depth < 1.2) form = Math.max(form, 2);
    if (y > hl - 0.9 * px1 && Math.abs(x) < hw) form = Math.max(form, 2);
    if (tr === 0) {
      // wide: two tones and the silhouette; one lit area on the upper left of the quiff
      return form === 0 ? 0 : form <= 2 ? (form === 1 ? 1 : 2) : 2;
    }
    if (form === 0) form = 1; // lit areas carry strokes, never a flat light patch
    // ---- strands: rise from the hairline and lean right as they climb; a clump end every lobe
    const u = hl - y; // height above the hairline
    const v = fx - 0.05 * u * u - 0.2 * u + 20;
    // the outermost px stays clean for the outline and the rim
    if (depth < px1 * 0.9) return form;
    // a clump's shaded underside just inside each notch of the outline (reads as separate ends)
    if (tr >= 1 && depth < 1.6 * px1 + 0.25 && a > -1.1 && a < 1.4) {
      const ph = (a + 6) / QUIFF.period;
      const f = ph - Math.floor(ph);
      if (f > 0.84 || f < 0.06) return Math.min(3, form + 1);
    }
    const t = strand(form, v, u, l, cw, s, tr, sheenLo, sheenHi);
    return t === form ? t : (md << 4) | t;
  });
  // the hairline against the forehead: a maroon sel-out line instead of the black outline
  if (tr >= 1) selOutEdge(buf, x0, y0, x1, y1, buf.g, head.gb + 7, mt, m.texEdge);
  // ---- rim: continuous silver arcs along the top-right of the quiff only (a rim on every clump end, or
  // over the whole crown, would read as a sparkle or a helmet)
  const g = buf.g;
  const xFrom = head.cx + 1.2 * s;
  const yLimit = head.cy + (cyc - RV + 0.5) * s;
  rimRuns(buf, g, g, xFrom, x1, y0, y1, rimDecal(), tr === 2 ? 3 : 2, (x, y) => y < yLimit);
}

/**
 * Strand shading inside the hair: one staggered highlight stroke per clump in the sheen window where
 * the quiff faces the key (upper left), broken 1 px separations at each clump's far edge at close-ups.
 */
function strand(form, v, u, l, cw, s, tr, lo, hi) {
  const vw = v + 0.55 * cw * Math.sin(v * 0.83) + 0.3 * u; // uneven clump widths that fan a little as they climb
  const kk = Math.floor(vw / cw);
  const w = vw / cw - kk; // 0..1 across the clump
  const h = hashInt(kk, 41);
  if (tr === 2 && form <= 2 && h < 0.5) {
    // separations: short broken dashes along the strand, a different rhythm per clump (never stripes)
    const sepW = Math.min(0.45, 1.05 / (cw * s));
    const per = 2.2 + h * 2.4;
    if (w > 1 - sepW && ((u + h * 7.3) % per) < per * 0.45) return form >= 2 ? 3 : 2;
  }
  if (tr === 2 && form === 1 && l > 0.12) {
    const a0 = lo + (h - 0.5) * 1.4, a1 = hi + (hashInt(kk, 43) - 0.5) * 1.6;
    if (u > a0 && u < a1) {
      const e = (u - a0) / (a1 - a0);
      const width = (tr === 2 ? 0.42 : 0.34) * Math.sqrt(Math.sin(Math.PI * e));
      const c0 = 0.15 + h * 0.2;
      if (w > c0 && w < c0 + width && h > 0.18) return 0;
    }
  }
  return form;
}

const rimDecal = () => material('cast-b:rim', { ramp: [P.silver], line: P.ink, decal: true });

// ---------------------------------------------------------------------------
// Beard: close-trimmed, on the jaw and chin, a clean cheek line, the moustache joined at the corners.
// A repaint of the face's own skin pixels (no new pixels: the silhouette, the mouth, the nose and the
// eyes are untouched, and the open jaw is already in the skin FACES drew), lit by the skin's own tone
// under it, so the beard turns with the head and follows every mouth shape for free.

function drawBeard(buf, L, m, head, s) {
  if (!L.beard) return;
  const H = L.head, M = L.mouth, N = L.nose;
  const tr = tier(s);
  const jaw = head.jaw || 0;
  const yaw = Math.abs(head.yaw || 0) < 1e-4 ? 0 : head.yaw;
  const yawShift = Math.sin(yaw);
  const pitchShift = Math.sin(head.pitch || 0) * 2.0;
  const jawY0 = M.y - 0.4; // as head.js: the open jaw moves the face below this row
  const jawK = 1 / Math.max(0.5, H.chinY - jawY0);
  const jyK = 1 / (H.chinY - H.cheekY);
  const mHW = M.w * 0.5;
  const px1 = 1 / s;
  const lipTop = M.y - 1.5 * px1; // the upper lip's top row (face.js draws it one row above the mouth)
  const mTop = lipTop - (tr === 2 ? 0.95 : 1.15); // the moustache's top
  const sideX0 = mHW + 0.35, sideX1 = H.cheekHW - 0.2;
  const g = head.gb + 7; // GROUPS.head: the skin FACES drew
  const skin = m.skin, mb = m.beard, md = m.beardD;
  const x0 = Math.max(1, Math.floor(head.cx - (H.cheekHW + 1.5) * s)), x1 = Math.min(buf.w - 2, Math.ceil(head.cx + (H.cheekHW + 1.5) * s));
  const y0 = Math.max(1, Math.floor(head.cy + (N.y1 - 1.2) * s)), y1 = Math.min(buf.h - 2, Math.ceil(head.cy + (H.chinY + jaw + 1) * s));
  const w = buf.w, M8 = buf.mat, T8 = buf.tone, G8 = buf.grp;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      if (M8[i] !== skin || G8[i] !== g) continue;
      local(head, px + 0.5, py + 0.5, LC);
      let y = LC[1] - pitchShift;
      if (jaw && y > jawY0) y -= jaw * Math.min(1, (y - jawY0) * jawK);
      // back to feature space (head.js skinTone's inverse of the turn)
      const jy = clamp((LC[1] - H.cheekY) * jyK, 0, 1);
      const xs = LC[0] - yawShift * 1.3 * jy;
      const hw = Math.max(1, hwAt(L, clamp(LC[1], H.top + 0.5, H.chinY - 0.2)));
      let fx = xs;
      if (yaw) fx = hw * Math.sin(clamp(Math.asin(clamp(xs / hw, -1, 1)) - yaw, -1.5707, 1.5707));
      const ax = Math.abs(fx);
      // strand cells in feature space (1 px columns, dashes 2-4 px long) so the texture rides the turn
      const col = Math.floor(fx * s + 64);
      const ch = hashInt(col, 23);
      // the cheek line: from the sideburn under the cheekbone, a straight-ish diagonal down to just above
      // the mouth corner; at close-ups each strand column ends at its own height (a soft, broken edge)
      const e = clamp((ax - sideX0) / (sideX1 - sideX0), 0, 1);
      let cheekLine = M.y - 1.45 - (M.y - 1.45 - 1.75) * Math.pow(e, 0.85);
      if (tr === 2) cheekLine += (ch < 0.34 ? -1 : ch > 0.72 ? 1 : 0) * px1;
      const inMoustache = y > mTop && y < lipTop + 0.25 * px1 && ax < mHW + 0.45 - (y < mTop + 0.5 ? 0.9 : 0);
      const inCheek = ax >= sideX0 - 0.1 && y > cheekLine;
      const inChin = y > M.y + 0.2 && ax < sideX0 + 0.2;
      if (!inMoustache && !inCheek && !inChin) continue;
      if (tr === 0 && inMoustache && !inCheek) continue; // the wide: a 1 px moustache would blot the mouth
      // a short beard: one step down from the skin it grows on (lit side tanShade, base brown where the
      // jaw turns away, maroon under the chin), so the skin's own planes still read through it and it
      // never becomes a flat dark mask
      const st = T8[i];
      let t = st - 1;
      if (inChin && y > H.chinY - 0.8) t += 1; // the chin's underside
      if (inCheek && !inChin && ax > hw - 1.2 && fx > 0) t += 1; // the jaw's far side turns away from the key
      if (inMoustache && !inCheek) t = ax > mHW * 0.6 || y > lipTop - 0.5 * px1 ? 2 : 1;
      if (tr === 2) {
        // strands: short vertical dashes a step darker (combed down), a few lit ones on the key side; a
        // different rhythm per column, never single specks
        const len = 2 + ((ch * 3) | 0);
        const row = Math.floor((y * s + ch * 7) / len);
        const h = hashInt(col * 131 + row, 29);
        if (h < 0.24) t += 1;
        else if (h > 0.9 && fx < -0.4 && st <= 1) t -= 1;
        // the top edge of the cheek: the last px of each column one step lighter (it thins into the skin)
        if (inCheek && !inChin && y < cheekLine + px1) t = Math.min(t, st);
      } else if (tr === 1 && inCheek && !inChin && y < cheekLine + px1) {
        t = Math.min(t, st); // the medium: a 1 px soft edge
      }
      t = t < 0 ? 0 : t > 3 ? 3 : t;
      if (tr === 0) {
        // the wide: two tones of the beard ramp (tanShade lit, brown shade), the identity is the jaw line
        buf.paint(px, py, mb, st >= 2 || (inChin && y > H.chinY - 0.8) ? 1 : 0);
        continue;
      }
      buf.paint(px, py, mb, t);
    }
  }
  // ---- the beard's own volume: it stands ~0.6 u off the jaw and the chin (the jaw line squares off a
  // little, which is also what keeps Max's silhouette apart from the anchors' at 1x)
  buf.part(g, 10, false);
  const Z8 = buf.z;
  const vol = (L.beard.vol ?? 0.6) * (tr === 0 ? 1.6 : 1); // a full px in the wide, where the jaw line carries the identity
  const jawTop = M.y - 1.2;
  for (let py = y0; py < y1 + Math.ceil(vol * s); py++) {
    for (let px = x0; px < x1; px++) {
      const i = py * w + px;
      if (M8[i] && Z8[i] >= 10) continue;
      local(head, px + 0.5, py + 0.5, LC);
      let y = LC[1] - pitchShift;
      if (jaw && y > jawY0) y -= jaw * Math.min(1, (y - jawY0) * jawK);
      if (y < jawTop) continue;
      const jy = clamp((LC[1] - H.cheekY) * jyK, 0, 1);
      const xs = LC[0] - yawShift * 1.3 * jy;
      let ext;
      if (y <= H.chinY) ext = Math.max(0, hwAt(L, y)) + vol * clamp((y - jawTop) / 1.5, 0, 1);
      else ext = y < H.chinY + vol ? H.chinHW * 0.95 * Math.sqrt(1 - (y - H.chinY) / vol) : -1;
      if (Math.abs(xs) > ext) continue;
      const t = y > H.chinY - 0.3 ? 3 : xs > 0 ? 2 : 1;
      buf.plot(px, py, mb, tr === 0 ? (t >= 2 ? 1 : 0) : t);
    }
  }
}

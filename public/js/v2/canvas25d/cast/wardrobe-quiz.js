// PAY ATTENTION's wardrobe (docs/programmes/pay-attention.md §2): the host's two garments no one else on air wears,
// built on the shared tailoring (cast/outfit.js) like FULL TIME's zip tops (cast/wardrobe-sport.js).
//
//   'bowTieSuit'   the tailored suit with a band collar and a bow tie at the throat instead of a tie, and a pocket
//                  square in the bow tie's cloth (host B's dinner jacket). Look fields: bow { w, h } (half-width and
//                  height, body units); materials m.bow (the tie's cloth), m.square (the pocket square).
//   'hijabJacket'  a tailored jacket under a hijab's drape: the cloth round the neck below the jaw and over the
//                  shoulders, ending in a soft curve on the chest (host C). It shares the hijab's group
//                  (hair-quiz.js SCARF_GROUP), so the head part and the drape are one piece of cloth. m.scarf, m.scarfD.
//
// Detail by tier (wardrobe-b.js tier): the wide keeps the bow as a dark bar on the white V and the drape as one
// shape in two tones; mediums the knot, the wings' shading and the drape's lit side; close-ups the wings' folds,
// the knot's crease and the drape's folds.
import { OUTFITS, registerOutfit, torsoFrame } from './outfit.js';
import { tier } from './wardrobe-b.js';
import { P } from '../../../palette.js';
import { paintLine, dec } from './kit-a.js';
import { SCARF_GROUP, scarfFar } from './hair-quiz.js';

const PTS = [[], [], []];
function polyOf(o, F, list, k) {
  const out = PTS[k];
  out.length = 0;
  for (const [x, y] of list) {
    const p = o.toS(x, F.lift(x < 0 ? -1 : 1, y));
    out.push(p[0], p[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The bow tie and its pocket square

function bowTieSuit(o) {
  OUTFITS.suit(o);
  const { buf, L, m, s, gb, G, clip } = o;
  const F = torsoFrame(o);
  const t = tier(s);
  const B = L.bow || {};
  const w = B.w ?? 3.1, h = B.h ?? 1.25, cy = B.y ?? 1.0;
  const v = o.inv;
  if (t === 0) {
    // the wide: a part 2 px tall loses its colour to its own outline (the resolve rims it black), so the bow is
    // painted on the shirt in exact colours: a purple bar at the throat, the near wing lit in magenta, the knot dark
    const ramp = L.bowRamp || [P.magenta, P.purple, P.maroon];
    const lit = dec(ramp[0]), base = dec(ramp[1]), knot = dec(ramp[2]);
    const c = o.toS(0, F.lift(1, cy));
    const cx = Math.round(c[0] - 0.5);
    // at the top of the shirt's V (in the wide the neck's skin comes down to it)
    let cyp = Math.round(c[1] - 0.5);
    for (let k = -2; k < 8; k++) {
      const i = (cyp + k) * buf.w + cx;
      if (buf.mat[i] && buf.grp[i] === gb + G.shirt) {
        cyp += k;
        break;
      }
    }
    const hw = Math.max(2, Math.round(w * s));
    for (let dx = -hw; dx <= hw; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        const px = cx + dx, py = cyp + dy;
        const i = py * buf.w + px;
        const gi = buf.grp[i] - gb;
        if (!buf.mat[i] || (gi !== G.shirt && gi !== G.collar && gi !== G.neck && gi !== G.jacket)) continue; // the bow lies over all of them
        buf.paint(px, py, dx === 0 ? knot : dx < 0 && dy === 0 ? lit : base, 0);
      }
    }
    return;
  }
  // ---- the wings: each flares from the knot to a squared end, pinched a little at its middle (a butterfly bow)
  buf.part(gb + G.tie, 9, clip);
  for (const side of [-1, 1]) {
    const pts = polyOf(o, F, [
      [side * 0.6, cy - h * 0.5],
      [side * w * 0.55, cy - h * 0.62],
      [side * w, cy - h * 1.02],
      [side * (w + 0.25), cy],
      [side * w, cy + h * 1.02],
      [side * w * 0.55, cy + h * 0.62],
      [side * 0.6, cy + h * 0.5],
    ], 0);
    const tone = t === 0 || !v
      ? side < 0 ? 1 : 2
      : (px, py) => {
        v.at(px + 0.5, py + 0.5);
        const ax = Math.abs(v.x), y = F.unlift(v.x, v.y) - cy;
        // the far wing turns away; the near one catches the key along its upper edge
        if (side > 0) return ax > w * 0.7 ? 2 : 1;
        if (y < -h * 0.38 && ax > 1.0) return 0;
        // close-ups: the fold where the wing gathers into the knot
        if (t === 2 && ax < 1.25 && Math.abs(y) < h * 0.22) return 2;
        return 1;
      };
    buf.poly(pts, m.bow, tone);
  }
  // ---- the knot: a small upright band in front of the wings
  const knot = polyOf(o, F, [[-0.72, cy - h * 0.62], [0.72, cy - h * 0.62], [0.62, cy + h * 0.62], [-0.62, cy + h * 0.62]], 1);
  buf.part(gb + G.tie, 10, clip);
  buf.poly(knot, m.bow, t === 0 || !v ? 1 : (px, py) => {
    v.at(px + 0.5, py + 0.5);
    return v.x > 0.4 ? 2 : 1;
  });
  if (t === 2) {
    // a crease across the knot
    const a = o.toS(-0.45, F.lift(-1, cy + 0.1)), b = o.toS(0.45, F.lift(1, cy - 0.1));
    paintLine(buf, a[0], a[1], b[0], b[1], m.bow, 3, gb + G.tie);
  }
  // ---- the pocket square in the bow's cloth (mediums and closer: in the wide it would be a stray dot)
  if (t >= 1 && m.square) {
    const T = F.T;
    const x0 = T.shoulderHW * 0.5 - 1.2, y0 = 13.2;
    buf.part(gb + G.jacket, 8, clip);
    const sq = polyOf(o, F, [[x0, y0 + 0.95], [x0 + 0.25, y0 - 0.2], [x0 + 0.95, y0 - 1.05], [x0 + 1.45, y0 - 0.15], [x0 + 2.0, y0 - 0.75], [x0 + 2.75, y0 + 0.55], [x0 + 2.75, y0 + 1.0], [x0, y0 + 1.15]], 2);
    buf.poly(sq, m.square, !v ? 1 : (px, py) => {
      v.at(px + 0.5, py + 0.5);
      const lx = v.x - x0;
      return (lx > 0.95 && lx < 1.45) || lx > 2.2 ? 2 : 1;
    });
  }
}

// ---------------------------------------------------------------------------
// The hijab's drape over a tailored jacket

// the drape's right half (body units, y down from the neck base), from behind the jaw round the shoulder to the hem
const DRAPE = [[7.6, -9.6], [8.2, -5.0], [9.15, -1.3], [10.8, 1.2], [12.4, 3.2], [13.0, 4.9], [11.6, 6.3], [8.4, 7.2], [4.4, 7.6], [0, 7.7]];

function hijabJacket(o) {
  (OUTFITS[o.L.under] || OUTFITS.tailored)(o);
  const { buf, L, m, s, gb, clip } = o;
  const F = torsoFrame(o);
  const t = tier(s);
  const v = o.inv;
  const list = [...DRAPE.map(([x, y]) => [-x, y]), ...DRAPE.slice().reverse().map(([x, y]) => [x, y])];
  const pts = polyOf(o, F, list, 0);
  const cx0 = o.toS(0, 0)[0];
  // (z 9: in front of the jacket and its collar, behind the head, so the chin's line falls on the cloth)
  buf.part(gb + SCARF_GROUP, 9, clip);
  buf.poly(pts, m.scarf, t === 0 || !v ? (px, py) => {
    if (!v) return px + 0.5 < cx0 + 3.4 * s ? 1 : 2;
    v.at(px + 0.5, py + 0.5);
    return scarfFar(v.x, F.unlift(v.x, v.y)) ? 2 : 1;
  } : (px, py) => {
    v.at(px + 0.5, py + 0.5);
    const x = v.x, y = F.unlift(v.x, v.y);
    // folds from the neck toward the hem (close-ups): soft shade lines, a lit line beside the key-side one
    if (t === 2) {
      for (const fx0 of [-3.6, 3.2]) {
        const fx = fx0 + Math.sign(fx0) * Math.max(0, y) * 0.42;
        const dd = x - fx;
        if (y > 0.4 && y < 7.4 && Math.abs(dd) < 0.55 / s + 0.04) return 2;
        if (fx0 < 0 && y > 1.0 && y < 7.0 && dd > 0.6 / s && dd < 1.3 / s + 0.1) return 0;
      }
    }
    // the cloth over the shoulders: the base, a crest of light along the key-side shoulder's round (a band inside
    // the drape's outer edge), the far side turning away (matte: no broad lit plane)
    if (x < 0 && t >= 1 && y > -1.0 && y < 5.2 && -x > drapeX(y) - 1.15) return 0;
    if (!scarfFar(x, y)) return 1;
    return x > 9.8 && t === 2 ? 3 : 2;
  });
  void L;
}

/** The drape's outer edge (half-width, body units) at height y, along DRAPE's shoulder run. */
function drapeX(y) {
  for (let i = 0; i + 1 < 6; i++) {
    const [ax, ay] = DRAPE[i], [bx, by] = DRAPE[i + 1];
    if (y >= ay && y <= by) return ax + ((bx - ax) * (y - ay)) / (by - ay);
  }
  return y < DRAPE[0][1] ? DRAPE[0][0] : DRAPE[5][0];
}

registerOutfit('bowTieSuit', bowTieSuit);
registerOutfit('hijabJacket', hijabJacket);

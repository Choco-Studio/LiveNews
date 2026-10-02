// MONEY MINUTE open: "the bottom line" (money-minute.md 3.7). A cream ledger
// card unrolls at centre stage, lit from the upper left like a real sheet of
// paper (white top edge, tan thickness on the shaded sides, a folded corner, a
// 1 px drop shadow), and is ruled live: three steel lines draw across it one
// after another. Then one green line draws on the dark field, 2 px under the
// card: the bottom line. In the reveal the card glides to its slot and the line
// extends from under it to underline the title (the plate's accent bar, 1 px).
// No numbers, bars, trend lines or arrows: a chart that rises every evening
// would contradict the market. Accent: green, never touching the cream.
import { P } from '../../palette.js';
import { seg, easeOutQuint, Pix, memo } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, PLATE_X, ZOOM } from './kit.js';

const cached = memo(48);
const CW = 30; // card size in the lock-up (x ZOOM at centre stage)
const CH = 38;
const PAD = 2; // the sheet under it shows 2 px above and to the right (a pad of paper)
const EXTENT = (CW >> 1) + PAD + 1; // right half-width incl. the sheet below and the drop shadow
const SLOT_X = PLATE_X - 4 - EXTENT;

/** Card geometry at size factor k: the green line sits 2 px under the card, on the plate's bar row at k = 1. */
function geom(k) {
  return cached(Math.round(k * 100), () => {
    const w = Math.round(CW * k);
    const h = Math.round(CH * k);
    const bottom = Math.round(11 * k); // relative to the emblem centre
    const m = Math.max(3, Math.round(4 * k)); // inner margin
    const rows = [0.5, 0.67, 0.84].map((f) => bottom - h + Math.round(h * f));
    return { w, h, bottom, top: bottom - h, left: -(w >> 1), m, rows, fold: Math.max(4, Math.round(6 * k)) };
  });
}

/** The card itself (baked per size): paper on a pad, edges, folded corner, title block and margin rule. */
function cardSprite(g) {
  return cached(`card|${g.w}x${g.h}`, () => {
    const { w, h, fold, m } = g;
    const p = new Pix(w + PAD + 1, h + PAD + 1); // the pad's sheet above/right, the drop shadow below
    const o = PAD; // the top sheet starts PAD px down
    // the sheet below: cream with a tan edge, showing above and to the right of the top sheet
    p.rect(PAD, 0, w, h, P.cream);
    p.rect(PAD, 0, w, 1, P.tan);
    p.rect(PAD + w - 1, 0, 1, h, P.tanShade);
    p.rect(PAD + w, 1, 1, h, P.black); // its shadow
    // drop shadow of the top sheet (the field is dark: palette black, 1 px, offset down-right)
    p.rect(1, o + h, w + PAD - 1, 1, P.black);
    // the top sheet, drawn in its own frame shifted down by PAD
    const top = new Pix(w, h);
    top.rect(0, 0, w, h, P.cream);
    // key light from the upper left: lit top and left edges, thickness on the shaded sides
    top.rect(0, 0, w, 1, P.white);
    top.rect(0, 1, 1, h - 1, P.white);
    top.rect(w - 1, 1, 1, h - 1, P.tan);
    top.rect(1, h - 1, w - 1, 1, P.tanShade);
    // folded top-right corner: the corner is cut away (the sheet below shows) and folded down
    const CUT = 1;
    for (let y = 0; y < fold; y++) {
      for (let x = w - fold + y; x < w; x++) top.px(x, y, CUT);
      for (let x = w - fold; x < w - fold + y; x++) top.px(x, y, x === w - fold ? P.tanShade : P.tan);
      top.px(w - fold + y, y, P.tanShade); // crease
    }
    // a printed title block and a short sub-line (no figures), and a warm margin rule
    const tw = Math.round(w * 0.42);
    top.rect(m, m + 1, tw, Math.max(1, Math.round(h / 18)), P.ink);
    top.rect(m, m + 1 + Math.max(2, Math.round(h / 12)), Math.round(tw * 0.6), 1, P.steel);
    top.rect(m - 2, Math.round(h * 0.34), 1, h - Math.round(h * 0.34) - 2, P.tan);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = top.d[y * w + x];
        if (c !== CUT) p.d[(o + y) * p.w + x] = c;
      }
    }
    return { cv: p.canvas() };
  });
}

function emblem(ctx, dt, x, y, k = 1) {
  const g = geom(k);
  const left = x + g.left;
  const top = y + g.top; // the top sheet; the sprite starts PAD px higher (the pad's sheet)
  // the card unrolls from its top edge (a clip that grows downwards, eased out)
  const u = easeOutQuint(seg(dt, 0.1, 0.32));
  if (u <= 0) return;
  const C = cardSprite(g);
  const vis = Math.max(1, Math.round((g.h + PAD + 1) * u));
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(left, top - PAD, g.w + PAD + 1, vis);
    ctx.clip();
    ctx.drawImage(C.cv, left, top - PAD);
  } finally {
    ctx.restore();
  }
  // ruled live: three steel lines across the sheet, one after another, ease-out
  const x0 = left + g.m;
  const span = g.w - 2 * g.m;
  for (let i = 0; i < 3; i++) {
    const p = easeOutQuint(seg(dt, 0.36 + i * 0.2, 0.18));
    const len = Math.round(span * p);
    if (len <= 0 || y + g.rows[i] >= top - PAD + vis) continue;
    ctx.fillStyle = P.steel;
    ctx.fillRect(x0, y + g.rows[i], len, 1);
  }
  // the bottom line: green, on the dark field 2 px under the card (never on the cream)
  const lp = easeOutQuint(seg(dt, 1.0, 0.35));
  const lw = Math.round((g.w + 4) * lp);
  if (lw > 0) {
    ctx.fillStyle = P.green;
    ctx.fillRect(left - 2, y + g.bottom + 2, lw, 1);
  }
}

const background = lazyBackdrop({ key: 'money', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const MONEY = {
  accent: P.green,
  // the plate's accent bar is the bottom line itself: 1 px, starting under the card
  style: { accent: P.green, plate: P.black, ink: 'light', bar: P.green, barH: 1, barX0: SLOT_X - (CW >> 1) - 2 },
  background,
  emblem,
  extent: EXTENT,
  absorb: 0.2,
  shoulder: 20,
  warmJobs: () => {
    const jobs = [];
    for (let k = 1; k <= ZOOM + 0.001; k += 0.1) jobs.push(() => cardSprite(geom(k)));
    return jobs;
  },
};

export function drawMoneyMinute(ctx, dt, info) {
  playOpen(ctx, dt, info, MONEY);
}

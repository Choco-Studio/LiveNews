// MONEY MINUTE open: "the bottom line" (money-minute.md 3.7). A ledger pad, lit
// from the upper left like a real object: a slate binding strip with two steel
// rivets, a cream top sheet with printed ledger rules and a margin line, the
// sheet underneath peeking out by a pixel, a 1 px cast shadow on the field. The
// top sheet unrolls from the binding (0.45 s, eased in and out, its rolled
// leading edge catching the light), then entries are written across it one
// after another (staggered strokes whose nib carries a 1 px highlight), the
// total is ruled off with a double line, and a green line draws on the dark
// field under the pad: the bottom line, which the pad and the title plate both
// stand on in the lock-up (it is the plate's 1 px accent rule). Something moves
// all the way to the glide at 1.55 s. No figures, bars, trend lines or arrows:
// a chart that rises every evening would contradict the market. Accent: green,
// never on the cream.
import { P } from '../../palette.js';
import { seg, easeOutQuint, easeInOut, Pix, memoFn } from '../../gfx/index.js';
import { lazyBackdrop, playOpen, CENTRE, ZOOM, TITLE_X } from './kit.js';

const CW = 40; // pad size in the lock-up (x ZOOM at centre stage: 64 x 74)
const CH = 46;
const EXTENT = (CW >> 1) + 2; // right half-width incl. the sheet below and the cast shadow
const SLOT_X = TITLE_X - 12 - 4 - EXTENT; // the plate starts at x 140 for shows without a globe
const BOTTOM = 11; // the pad's last row, relative to the emblem centre: the green line sits 2 px under it

/** Pad geometry at size factor k (cached per 1/100 of k). */
const geomQ = memoFn(64, (q) => {
  const k = q / 100;
  const w = Math.round(CW * k);
  const h = Math.round(CH * k);
  const bottom = Math.round(BOTTOM * k);
  const bind = Math.max(4, Math.round(6 * k)); // binding strip
  const m = Math.max(4, Math.round(5 * k)); // inner margin of the sheet
  const pitch = Math.max(4, Math.round(5 * k)); // printed ledger rule spacing
  const top = bottom - h; // relative to the emblem centre
  const first = bind + Math.max(5, Math.round(7 * k)); // first ledger rule (sheet rows from the pad's top)
  const rules = [];
  for (let r = first; r < h - 4; r += pitch) rules.push(r);
  return { w, h, bottom, top, left: -(w >> 1), bind, m, pitch, rules };
});
const geom = (k) => geomQ(Math.round(k * 100));

/** The pad (baked per size): binding, sheets, printed rules and margin, cast shadow. */
const padSpriteK = memoFn(64, (key, g) => {
  const { w, h, bind, m, rules } = g;
  const p = new Pix(w + 2, h + 2); // +1 the sheet underneath, +1 the cast shadow
  // cast shadow on the field (down and right), then the sheet underneath peeking out by 1 px
  p.rect(2, h + 1, w, 1, P.black);
  p.rect(w + 1, 2, 1, h, P.black);
  p.rect(1, bind, w, h - bind + 1, P.tanShade);
  p.rect(1, bind, w, 1, P.tan);
  // the top sheet: cream, its lit left edge white, the shaded right edge and foot in tan
  p.rect(0, bind, w, h - bind, P.cream);
  p.rect(0, bind, 1, h - bind, P.white);
  p.rect(w - 1, bind, 1, h - bind, P.tan);
  p.rect(1, h - 1, w - 1, 1, P.tan);
  // printed ledger: faint rules and a margin line (tan on cream), a printed header block in ink
  for (const r of rules) p.rect(m - 1, r, w - 2 * m + 2, 1, P.tan);
  p.rect(m + 2, bind + 1, 1, h - bind - 3, P.tan);
  p.rect(m + 5, bind + 2, Math.round(w * 0.3), 1, P.ink);
  // binding strip: slate, lit top edge, a darker underside where it clamps the sheets, two rivets
  p.rect(0, 0, w, bind, P.slate);
  p.rect(0, 0, w, 1, P.steel);
  p.rect(0, 0, 1, bind, P.steel);
  p.rect(0, bind - 1, w, 1, P.ink);
  p.rect(w - 1, 1, 1, bind - 1, P.ink);
  const ry = bind >> 1;
  for (const rx of [Math.round(w * 0.25), Math.round(w * 0.75) - 1]) {
    p.rect(rx - 1, ry - 1, 2, 2, P.fog);
    p.px(rx - 1, ry - 1, P.white);
    p.px(rx, ry, P.steel);
  }
  return { cv: p.canvas() };
});
const padSprite = (g) => padSpriteK(g.w * 1000 + g.h, g);

// the written entries: which printed rule, and how far across the sheet (no figures: only strokes)
const ENTRIES = [
  { row: 1, len: 0.72, at: 0.68 },
  { row: 2, len: 0.5, at: 0.84 },
  { row: 3, len: 0.84, at: 1.0 },
];
const BIND_AT = 0.08; // the binding opens out from the centre as the seed bit is absorbed
const UNROLL_AT = 0.2;
const UNROLL = 0.45;

/** One stroke written left to right along a row, its nib a 1 px white highlight while it moves. */
function stroke(ctx, x0, y, len, p, color) {
  const n = Math.round(len * p);
  if (n <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(x0, y, n, 1);
  if (p < 1) {
    ctx.fillStyle = P.white;
    ctx.fillRect(x0 + n - 1, y, 1, 1);
  }
}

function emblem(ctx, dt, x, y, k = 1) {
  const g = geom(k);
  const left = x + g.left;
  const top = y + g.top;
  // the binding opens out from its centre as the seed is absorbed; the sheet unrolls down from it
  const bp = easeOutQuint(seg(dt, BIND_AT, 0.16));
  if (bp <= 0) return;
  const bw = Math.max(2, Math.round((g.w + 2) * bp));
  const u = easeInOut(seg(dt, UNROLL_AT, UNROLL));
  const sheetH = g.h - g.bind;
  const vis = g.bind + Math.round((sheetH + 2) * u);
  const C = padSprite(g);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(left + ((g.w + 2 - bw) >> 1), top, bw, vis);
    ctx.clip();
    ctx.drawImage(C.cv, left, top);
  } finally {
    ctx.restore();
  }
  if (u < 1) {
    // the rolled leading edge: a lit lip (white) over its shaded curl (tan)
    const ey = top + vis;
    if (vis > g.bind && bp >= 1) {
      ctx.fillStyle = P.white;
      ctx.fillRect(left, ey - 1, g.w, 1);
      ctx.fillStyle = P.tan;
      ctx.fillRect(left, ey, g.w, 1);
    }
    return;
  }
  // entries written one after another on the printed rules, then the total ruled off twice
  const x0 = left + g.m + 5;
  const span = g.w - g.m - 5 - g.m;
  for (let i = 0; i < ENTRIES.length; i++) {
    const e = ENTRIES[i];
    const r = g.rules[Math.min(e.row, g.rules.length - 1)];
    stroke(ctx, x0, top + r - 2, Math.round(span * e.len), easeInOut(seg(dt, e.at, 0.2)), P.steel);
  }
  const last = g.rules[g.rules.length - 1];
  stroke(ctx, x0, top + last - 2, span, easeInOut(seg(dt, 1.16, 0.22)), P.ink);
  stroke(ctx, x0, top + last, span, easeInOut(seg(dt, 1.24, 0.22)), P.ink);
  // the bottom line: green, on the dark field 2 px under the pad (never on the cream); it keeps
  // drawing right up to the glide, which carries it on under the title
  const lp = easeInOut(seg(dt, 1.1, 0.45));
  const lw = Math.round((g.w + 4) * lp);
  if (lw > 0) {
    ctx.fillStyle = P.green;
    ctx.fillRect(left - 2, y + g.bottom + 2, lw, 1);
  }
}

const background = lazyBackdrop({ key: 'money', colors: [P.black, P.ink], cx: CENTRE.x, cy: CENTRE.y, reach: 230 });

export const MONEY = {
  accent: P.green,
  // the plate's accent bar is the bottom line itself: 1 px, starting under the pad
  style: { accent: P.green, plate: P.black, ink: 'light', bar: P.green, barH: 1, barX0: SLOT_X - (CW >> 1) - 2 },
  background,
  emblem,
  extent: EXTENT,
  absorb: 0.12,
  shoulder: 22,
  warmJobs: () => {
    const jobs = [];
    for (let k = 1; k <= ZOOM + 0.001; k += 0.05) jobs.push(() => padSprite(geom(k)));
    return jobs;
  },
};

export function drawMoneyMinute(ctx, dt, info) {
  playOpen(ctx, dt, info, MONEY);
}

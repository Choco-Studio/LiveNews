// Full-screen broadcast cards: cold-open headline montage, key-fact card,
// breaking-news card, end card, standby test card, start screen, up-next
// promo, channel ident and the 0.8 s channel stinger.
//
// The cards share the programme opens' package (graded black-to-ink field,
// black plates with an accent bar, 5x7 type at 2x for display and 1x for
// body) and its motion rules: one eased move at a time, nothing pops, and every
// card settles and holds still. No particles, beams, scrolling words, sirens,
// flashes or blinking lights (docs/ART_DIRECTION.md).
//
// Cards shown under the 'news' graphics keep y 0-24 free for the top row and
// y >= 140 free for captions, strap and ticker (the montage owns the bottom:
// its captions move to the top). Static layers are baked once.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { drawLogo, measureLogo } from '../logo.js';
import {
  mk, memo, rgba, u32, clamp, lerp, seg, easeOutQuint, easeInOut, slab, clipRect, disc,
  ellipsis, wrapLines, clockIn,
} from '../gfx/index.js';
import { backdrop } from './opens/kit.js';
import { drawEarth, globeTexture } from './opens/world.js';
import { drawOpen } from './opens.js';

export const STINGER_DURATION = 0.8; // seconds

const W = 384;
const H = 216;
const X0 = 19; // graphics-safe left edge
const cached = memo(200);

// ---------------------------------------------------------------------------
// Shared pieces

// Light accents carry black text, dark ones white (same rule as the graphics package).
const DARK_INK = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.pink]);
const inkOn = (c) => (DARK_INK.has(c) ? P.black : P.white);

/** Text that rises `dist` px into place inside a mask at its own rows (p: 0..1). */
function rise(ctx, text, x, y, p, { color = P.white, scale = 1, align = 'left', shadow = null, dist = null } = {}) {
  if (p <= 0 || !text) return 0;
  const h = 7 * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (dist ?? h + 3));
  ctx.save();
  clipRect(ctx, 0, y - 3 * scale, W, h + 3 * scale + (shadow ? scale : 0) + 1);
  const w = drawText(ctx, text, x, y + off, { color, scale, align, shadow });
  ctx.restore();
  return w;
}

/** Horizontal wipe of a flat plate from the left (p: 0..1, eased by the caller). */
function plate(ctx, x, y, w, h, color, p = 1) {
  const vis = Math.round(w * p);
  if (vis <= 0) return 0;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), vis, Math.round(h));
  return vis;
}

/** Best headline layout: 2x in up to `big` lines, else 1x in up to `small` lines. */
function layout(text, maxW, big = 3, small = 4) {
  return cached(`lay|${maxW}|${big}|${small}|${text}`, () => {
    const two = wrapLines(text, maxW, 2, 99);
    if (two.length <= big && two.every((l) => !l.endsWith('...'))) return { scale: 2, lines: two, lh: 18 };
    return { scale: 1, lines: wrapLines(text, maxW, 1, small), lh: 11 };
  });
}

/** A stepped bottom shade so text reads over photos (palette black, quantised alpha). */
function shade(y0, y1, maxA) {
  return cached(`shade|${y0}|${y1}|${maxA}`, () => {
    const c = mk(W, H);
    const cx = c.getContext('2d');
    for (let y = y0; y < H; y += 2) {
      const k = clamp((y - y0) / (y1 - y0), 0, 1);
      const a = Math.round(maxA * k ** 1.3 * 16) / 16;
      if (a <= 0) continue;
      cx.fillStyle = rgba(P.black, a);
      cx.fillRect(0, y, W, 2);
    }
    return c;
  });
}

/** Static dot-matrix world map baked into a backdrop: dots one palette step above the field. */
function worldDots(d, level, steps = [P.ink, P.slate, P.steel]) {
  const tex = globeTexture();
  const cols = steps.map((c) => u32(c));
  for (let y = 4; y < H; y += 4) {
    const lat = 78 - (y / H) * 140;
    const row = clamp(Math.floor(((90 - lat) / 180) * 256), 0, 255) * 512;
    for (let x = 2; x < W; x += 4) {
      const lon = (x / W) * 360 - 180;
      const col = (Math.floor(((lon + 180) / 360) * 512) + 512) % 512;
      if (!(tex[row + col] & 1)) continue;
      const lv = level(x, y);
      d[y * W + x] = cols[lv < 0.5 ? 0 : lv < 1.5 ? 1 : 2];
    }
  }
}

// ---------------------------------------------------------------------------
// HEADLINE MONTAGE FRAME (cold open). One frame per headline with hard cuts
// between them: the picture holds still, the category chip wipes in and the
// headline rises in at 2x. The TOP STORIES tag stays put across the cuts.

const CATEGORIES = {
  world: { a: P.navy, b: P.blue, label: 'WORLD' },
  politics: { a: P.purple, b: P.magenta, label: 'POLITICS' },
  business: { a: P.darkGreen, b: P.green, label: 'BUSINESS' },
  tech: { a: P.navy, b: P.cyan, label: 'TECH' },
  science: { a: P.purple, b: P.magenta, label: 'SCIENCE' },
  health: { a: P.darkGreen, b: P.green, label: 'HEALTH' },
  climate: { a: P.darkGreen, b: P.green, label: 'CLIMATE' },
  sport: { a: P.navy, b: P.orange, label: 'SPORT' },
  culture: { a: P.maroon, b: P.pink, label: 'CULTURE' },
  general: { a: P.ink, b: P.steel, label: 'NEWS' },
};
const CATEGORY_ALIASES = {
  mundo: 'world', international: 'world', internacional: 'world', europe: 'world',
  politica: 'politics', política: 'politics',
  economy: 'business', economia: 'business', economía: 'business', markets: 'business', finance: 'business', money: 'business',
  technology: 'tech', tecnologia: 'tech', tecnología: 'tech',
  ciencia: 'science', space: 'science', environment: 'climate',
  salud: 'health',
  sports: 'sport', deportes: 'sport',
  entertainment: 'culture', cultura: 'culture', arts: 'culture',
};
function category(name) {
  const k = String(name || 'general').toLowerCase().trim();
  return CATEGORIES[k] || CATEGORIES[CATEGORY_ALIASES[k]] || CATEGORIES.general;
}

const catField = (cat) => backdrop({
  key: `cat|${cat.label}`,
  colors: [P.black, P.ink],
  cx: 290,
  cy: 60,
  reach: 280,
  // the world in dots, tinted with the category's dark tone where the field is lit
  texture: (d, level) => worldDots(d, (x, y) => level(x, y) * 2, [P.ink, cat.a === P.ink ? P.slate : cat.a, cat.a === P.ink ? P.steel : cat.a]),
});

export function drawHeadlineFrame(ctx, t, dt, { index = 0, total = 1, headline = '', source = '', category: catName = 'general', image = null } = {}) {
  const cat = category(catName);
  if (image) ctx.drawImage(image, 0, 0);
  else ctx.drawImage(catField(cat), 0, 0);
  ctx.drawImage(shade(96, 200, image ? 0.85 : 0.6), 0, 0);

  // TOP STORIES tag and pips under the bug: animate in on the first frame only
  const tagP = index === 0 ? easeOutQuint(seg(dt, 0.1, 0.35)) : 1;
  const tagW = measureText('TOP STORIES') + 10;
  const n = clamp(Math.floor(total) || 1, 1, 12);
  const pipsW = n * 11 + 4;
  ctx.save();
  clipRect(ctx, 13, 25, Math.round((tagW + pipsW) * tagP), 12);
  plate(ctx, 13, 25, tagW, 11, P.red);
  drawText(ctx, 'TOP STORIES', 18, 27, { color: P.white });
  plate(ctx, 13 + tagW, 25, pipsW, 11, P.black);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === index ? P.white : i < index ? P.fog : P.slate;
    ctx.fillRect(13 + tagW + 4 + i * 11, 29, 9, 3);
  }
  ctx.restore();

  // headline block anchored above the ticker (captions sit at the top in this shot)
  const maxW = W - 2 * X0;
  const lay = layout(headline, maxW, 3, 4);
  const blockH = lay.lines.length * lay.lh - (lay.lh - 7 * lay.scale);
  const top = 194 - blockH;
  const chipY = top - 17;
  // chip: category bar + source
  const label = cat.label;
  const cw = measureText(label) + 10;
  const src = source ? ellipsis(source, 200) : '';
  const sw = src ? measureText(src) + 10 : 0;
  const cp = easeOutQuint(seg(dt, 0.12, 0.32));
  if (cp > 0) {
    ctx.save();
    clipRect(ctx, X0, chipY, Math.round((cw + sw) * cp), 11);
    plate(ctx, X0, chipY, cw, 11, cat.b);
    drawText(ctx, label, X0 + 5, chipY + 2, { color: inkOn(cat.b) });
    if (src) {
      plate(ctx, X0 + cw, chipY, sw, 11, P.black);
      drawText(ctx, src, X0 + cw + 5, chipY + 2, { color: P.silver });
    }
    ctx.restore();
  }
  // accent bar grows down beside the headline
  const bar = Math.round((blockH + 4) * easeOutQuint(seg(dt, 0.18, 0.4)));
  if (bar > 0) {
    ctx.fillStyle = cat.b;
    ctx.fillRect(13, top - 2, 2, bar);
  }
  lay.lines.forEach((ln, i) => {
    rise(ctx, ln, X0, top + i * lay.lh, seg(dt, 0.24 + i * 0.07, 0.34), { color: P.white, scale: lay.scale, shadow: P.black });
  });
}

// ---------------------------------------------------------------------------
// KEY FACT card: the story picture pushed back, a panel that unfolds, the
// figure counting up at 2x with a meter, then still. Lives in y 26-138.

const MAGNITUDES = new Set(['THOUSAND', 'MILLION', 'BILLION', 'TRILLION', 'MN', 'BN', 'TN', 'PERCENT', 'PER CENT']);
function parseFact(fact) {
  return cached(`fact|${fact}`, () => {
    const s = String(fact || '').toUpperCase().replace(/\s+/g, ' ').trim();
    const m = s.match(/^([$€£]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(%|[KMB]N?\b|BN\b|TN\b)?\s*(.*)$/);
    if (!m) return { big: null, rest: s };
    const [, pre, int, dec = '', suf = '', tail] = m;
    let rest = tail;
    let big = `${pre}${int}${dec}${suf}`;
    const nextWord = rest.split(/\s+/)[0] || '';
    if (!suf && MAGNITUDES.has(nextWord)) {
      big += ` ${nextWord}`;
      rest = rest.slice(nextWord.length).trim();
    }
    const value = Number(`${int.replace(/,/g, '')}${dec}`);
    const isYear = !pre && !suf && !dec && /^(1[89]|20|21)\d\d$/.test(int);
    return { big, rest, value, decimals: dec ? dec.length - 1 : 0, commas: int.includes(','), pre, after: big.slice(pre.length + int.length + dec.length), count: !isYear && value > 0 };
  });
}
function formatCount(f, k) {
  let s = (f.value * k).toFixed(f.decimals);
  if (f.commas) {
    const [a, b] = s.split('.');
    s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? `.${b}` : '');
  }
  return `${f.pre}${s}${f.after}`;
}

const factField = () => backdrop({ key: 'fact', colors: [P.black, P.ink], cx: 192, cy: 82, reach: 230, texture: (d, level) => worldDots(d, level) });

function factLayout(fact, source) {
  return cached(`factlay|${fact}|${source}`, () => {
    const f = parseFact(fact);
    const PW = 300;
    const inner = PW - 36;
    const big = f.big ? ellipsis(f.big, inner, 2) : null;
    const rest = f.rest ? (big ? { scale: 1, lines: wrapLines(f.rest, inner, 1, 3), lh: 11 } : layout(f.rest, inner, 3, 5)) : null;
    const restH = rest ? (rest.lines.length - 1) * rest.lh + 7 * rest.scale : 0;
    let h = 14; // top padding (under the label tab)
    if (big) h += 14 + 6 + 3;
    if (rest) h += (big ? 9 : 0) + restH;
    const src = source ? ellipsis(`SOURCE: ${source}`, inner) : '';
    if (src) h += 12 + 7;
    h += 12;
    const PH = h;
    const PY = clamp(Math.round(84 - PH / 2), 34, 138 - PH);
    return { f, big, rest, restH, src, PW, PH, PX: (W - PW) >> 1, PY, inner };
  });
}

export function drawFactCard(ctx, t, dt, { fact = '', label = 'KEY FACT', source = '', image = null } = {}) {
  if (image) {
    ctx.drawImage(image, 0, 0);
    // the picture is pushed back: darkened over 0.4 s, then still
    const v = easeOutQuint(seg(dt, 0, 0.4));
    ctx.fillStyle = rgba(P.black, 0.66 * v);
    ctx.fillRect(0, 0, W, H);
  } else ctx.drawImage(factField(), 0, 0);

  const L = factLayout(fact, source);
  const { PX, PY, PW, PH } = L;
  const mid = PX + (PW >> 1);
  const cy = PY + (PH >> 1);
  // a hairline draws out from the centre, then the panel opens from it
  const lineP = easeOutQuint(seg(dt, 0.05, 0.28));
  const openP = easeOutQuint(seg(dt, 0.26, 0.32));
  if (openP <= 0) {
    const lw = Math.round(PW * lineP);
    if (lw > 0) {
      ctx.fillStyle = P.silver;
      ctx.fillRect(mid - (lw >> 1), cy, lw, 1);
    }
    return;
  }
  const ph = Math.max(2, Math.round(PH * openP));
  const py = cy - (ph >> 1);
  ctx.fillStyle = P.black;
  ctx.fillRect(PX, py, PW, ph);
  ctx.fillStyle = P.slate;
  ctx.fillRect(PX, py, PW, 1);
  ctx.fillStyle = P.red;
  ctx.fillRect(PX, py, PW, 2);
  if (openP < 1) return;

  // label tab fused to the top edge
  const lab = ellipsis(label || 'KEY FACT', PW - 80);
  const lw = measureText(lab) + 12;
  const lp = easeOutQuint(seg(dt, 0.5, 0.3));
  ctx.save();
  clipRect(ctx, PX, PY - 11, Math.round(lw * lp), 11);
  plate(ctx, PX, PY - 11, lw, 11, P.red);
  drawText(ctx, lab, PX + 6, PY - 9, { color: P.white });
  ctx.restore();

  let y = PY + 14;
  const f = L.f;
  if (L.big) {
    // the figure counts up (right-aligned, so its unit stays put) and the meter fills with it
    const k = easeOutQuint(seg(dt, 0.55, 1.1));
    const shown = f.count && k < 1 ? formatCount(f, k) : L.big;
    const bw = measureText(L.big, 2);
    const right = mid + (bw >> 1);
    rise(ctx, shown, right, y, seg(dt, 0.5, 0.3), { color: P.yellow, scale: 2, align: 'right' });
    y += 14 + 6;
    const segs = clamp(Math.floor((L.inner + 2) / 10), 8, 26);
    const mx = mid - ((segs * 10 - 2) >> 1);
    const lit = Math.round(segs * k);
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i < lit ? (i === lit - 1 && k < 1 ? P.white : P.yellow) : P.slate;
      ctx.fillRect(mx + i * 10, y, 8, 3);
    }
    y += 3;
    if (L.rest) y += 9;
  }
  if (L.rest) {
    L.rest.lines.forEach((ln, i) => {
      rise(ctx, ln, mid, y + i * L.rest.lh, seg(dt, (L.big ? 1.0 : 0.55) + i * 0.08, 0.34), { color: P.white, scale: L.rest.scale, align: 'center' });
    });
    y += L.restH;
  }
  if (L.src) {
    const sp = easeOutQuint(seg(dt, L.big ? 1.3 : 0.9, 0.36));
    y += 12;
    ctx.fillStyle = P.ink;
    ctx.fillRect(PX + 18, y - 6, Math.round((PW - 36) * sp), 1);
    rise(ctx, L.src, PX + 18, y, sp, { color: P.fog });
  }
}

// ---------------------------------------------------------------------------
// BREAKING NEWS card: a calm colour change, done in about a second and held
// (the card lasts at most 3 s). No flash, no siren, no flashing borders.

const breakingField = () => backdrop({ key: 'breaking', colors: [P.black, P.ink], cx: 192, cy: 112, reach: 230 });

export function drawBreakingCard(ctx, t, dt, { headline = '', source = '' } = {}) {
  ctx.drawImage(breakingField(), 0, 0);
  // the red band wipes in from the left
  const BY = 52;
  const BH = 28;
  const bp = easeOutQuint(seg(dt, 0, 0.36));
  plate(ctx, 0, BY, W, BH, P.red, bp);
  plate(ctx, 0, BY + BH, W, 2, P.darkRed, bp);
  ctx.save();
  clipRect(ctx, 0, BY, Math.round(W * bp), BH);
  rise(ctx, 'BREAKING NEWS', X0, BY + 7, seg(dt, 0.2, 0.32), { color: P.white, scale: 2, dist: 16 });
  ctx.restore();
  // headline on the calm field below
  const lay = layout(headline, W - 2 * X0, 3, 5);
  const top = BY + BH + 16;
  lay.lines.forEach((ln, i) => rise(ctx, ln, X0, top + i * lay.lh, seg(dt, 0.42 + i * 0.08, 0.34), { color: P.white, scale: lay.scale }));
  // source tag
  if (source) {
    const sy = top + lay.lines.length * lay.lh + 6;
    const s = ellipsis(source, 220);
    const tw = measureText('SOURCE') + 10;
    const sp = easeOutQuint(seg(dt, 0.75, 0.3));
    ctx.save();
    clipRect(ctx, X0, sy, Math.round((tw + measureText(s) + 10) * sp), 11);
    plate(ctx, X0, sy, tw, 11, P.yellow);
    drawText(ctx, 'SOURCE', X0 + 5, sy + 2, { color: P.black });
    drawText(ctx, s, X0 + tw + 6, sy + 2, { color: P.silver });
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// END CARD (show close): the channel logo, the programme plate, the sign-off
// lines and an outro rail with the studio clock. Everything settles by 1.2 s.

export function drawEndCard(ctx, t, dt, { channel = 'GLOBIT 24', line1 = 'STAY WITH US', line2 = 'NEXT BULLETIN SHORTLY', accent = P.red } = {}) {
  ctx.drawImage(backdrop({ key: 'end', colors: [P.black, P.ink], cx: 192, cy: 80, reach: 230 }), 0, 0);
  // logo rises into place (its glint plays once, during the first 0.9 s)
  const LS = 2;
  const ls = measureLogo({ variant: 'full', scale: LS });
  const ly = 30;
  const lp = seg(dt, 0.1, 0.45);
  if (lp > 0) {
    const off = Math.round((1 - easeOutQuint(lp)) * 18);
    ctx.save();
    clipRect(ctx, 0, ly - 2, W, ls.h + 4);
    drawLogo(ctx, W / 2, ly + off, { variant: 'full', scale: LS, align: 'center', t: dt - 0.1 < 0.9 ? Math.max(0, dt - 0.1) : null });
    ctx.restore();
  }
  // programme plate: title at 2x on black with the accent bar
  const title = ellipsis(channel || '', W - 80, 2);
  const tw = measureText(title, 2);
  const pw = tw + 24;
  const px = (W - pw) >> 1;
  const py = ly + ls.h + 14;
  const pp = easeOutQuint(seg(dt, 0.35, 0.4));
  if (pp > 0) {
    const vis = plate(ctx, px, py, pw, 26, P.black, pp);
    ctx.fillStyle = P.slate;
    ctx.fillRect(px, py, vis, 1);
    ctx.fillStyle = accent;
    ctx.fillRect(px, py + 26, Math.round(pw * easeOutQuint(seg(dt, 0.5, 0.36))), 2);
    ctx.save();
    clipRect(ctx, px, py + 1, vis, 25);
    rise(ctx, title, px + 12, py + 6, seg(dt, 0.48, 0.3), { color: P.white, scale: 2 });
    ctx.restore();
  }
  // sign-off lines
  const l1 = ellipsis(line1 || '', W - 60);
  const l2 = line2 ? ellipsis(line2, W - 60) : '';
  rise(ctx, l1, W / 2, py + 40, seg(dt, 0.65, 0.3), { color: P.white, align: 'center' });
  if (l2) rise(ctx, l2, W / 2, py + 52, seg(dt, 0.78, 0.3), { color: P.silver, align: 'center' });
  // outro rail and clock
  const RY = 188;
  const rp = easeInOut(seg(dt, 0.6, 2.2));
  ctx.fillStyle = P.slate;
  ctx.fillRect(28, RY + 1, W - 56, 1);
  if (rp > 0) {
    ctx.fillStyle = P.red;
    ctx.fillRect(28, RY, Math.round((W - 56) * rp), 3);
  }
  const ck = `LONDON ${clockIn().time}`;
  rise(ctx, ck, W - 28, RY - 12, seg(dt, 0.9, 0.3), { color: P.fog, align: 'right' });
}

// ---------------------------------------------------------------------------
// STANDBY (test card): a still test card with the message; only the clock moves.

const TC = { cx: 192, cy: 108, R: 100 };

function testCardLayer(channel) {
  return cached(`testcard|${channel}`, () => {
    const c = mk(W, H);
    const x = c.getContext('2d');
    // background grid
    x.fillStyle = P.slate;
    x.fillRect(0, 0, W, H);
    x.fillStyle = P.steel;
    for (let gx = 0; gx <= W; gx += 24) x.fillRect(gx, 0, 1, H);
    for (let gy = 12; gy < H; gy += 24) x.fillRect(0, gy, W, 1);
    // castellated border
    for (let i = 0; i * 12 < W; i++) {
      x.fillStyle = i % 2 ? P.black : P.silver;
      x.fillRect(i * 12, 0, 12, 4);
      x.fillStyle = i % 2 ? P.silver : P.black;
      x.fillRect(i * 12, H - 4, 12, 4);
    }
    for (let i = 0; i * 12 < H; i++) {
      x.fillStyle = i % 2 ? P.silver : P.black;
      x.fillRect(0, i * 12, 4, 12);
      x.fillStyle = i % 2 ? P.black : P.silver;
      x.fillRect(W - 4, i * 12, 4, 12);
    }
    [P.red, P.yellow, P.green, P.blue].forEach((col, i) => {
      x.fillStyle = col;
      x.fillRect(24, 61 + i * 24, 24, 23);
      x.fillStyle = [P.white, P.fog, P.steel, P.black][i];
      x.fillRect(W - 48, 61 + i * 24, 24, 23);
    });
    // circle contents
    const { cx, cy, R } = TC;
    const inner = mk(W, H);
    const ix = inner.getContext('2d');
    ix.fillStyle = P.ink;
    ix.fillRect(0, 0, W, H);
    const bars = [P.silver, P.yellow, P.cyan, P.green, P.magenta, P.red, P.blue];
    const bx0 = cx - R;
    const bw = Math.ceil((2 * R + 1) / bars.length);
    bars.forEach((col, i) => {
      ix.fillStyle = col;
      ix.fillRect(bx0 + i * bw, 36, bw, 24);
    });
    [P.black, P.ink, P.slate, P.steel, P.fog, P.silver, P.white].forEach((col, i) => {
      ix.fillStyle = col;
      ix.fillRect(bx0 + i * bw, 118, bw, 14);
    });
    const periods = [8, 6, 4, 3, 2];
    const gw = Math.ceil((2 * R + 1) / periods.length);
    periods.forEach((pp, i) => {
      const gx0 = bx0 + i * gw;
      ix.fillStyle = P.black;
      ix.fillRect(gx0, 132, gw, 20);
      ix.fillStyle = P.white;
      for (let xx = 0; xx < gw; xx++) if (Math.floor(xx / (pp / 2)) % 2 === 0) ix.fillRect(gx0 + xx, 132, 1, 20);
    });
    ix.fillStyle = P.ink;
    ix.fillRect(0, 152, W, 26);
    ix.fillStyle = P.darkRed;
    ix.fillRect(0, 178, W, 40);
    ix.fillStyle = P.red;
    ix.fillRect(cx - 30, 178, 60, 40);
    drawText(ix, 'STANDBY', cx, 186, { color: P.white, align: 'center' });
    ix.fillStyle = P.fog;
    ix.fillRect(cx, 60, 1, 58);
    ix.fillRect(bx0, cy, 2 * R + 1, 1);
    const mask = mk(W, H);
    disc(mask.getContext('2d'), cx, cy, R, '#fff');
    ix.globalCompositeOperation = 'destination-in';
    ix.drawImage(mask, 0, 0);
    disc(x, cx, cy, R + 2, P.black);
    disc(x, cx, cy, R + 1, P.white);
    x.drawImage(inner, 0, 0);
    // station name plate over the top of the circle
    const nm = ellipsis(channel || 'GLOBIT 24', 170, 2);
    const nw = measureText(nm, 2) + 14;
    x.fillStyle = P.black;
    x.fillRect(cx - (nw >> 1), 15, nw, 22);
    x.fillStyle = P.red;
    x.fillRect(cx - (nw >> 1), 37, nw, 1);
    drawText(x, nm, cx, 19, { color: P.white, scale: 2, align: 'center' });
    return c;
  });
}

export function drawStandby(ctx, t, { channel = 'GLOBIT 24', message = '' } = {}) {
  ctx.drawImage(testCardLayer(channel), 0, 0);
  const { cx } = TC;
  const bx = 64;
  const bw = W - 128;
  const by = 62;
  const lines = wrapLines(message || 'PREPARING THE NEXT BULLETIN', bw - 24, 1, 2);
  const bh = 36 + lines.length * 11;
  ctx.fillStyle = P.black;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = P.red;
  ctx.fillRect(bx, by, bw, 2);
  ctx.fillRect(bx + 8, by + 10, 4, 4); // a steady standby lamp
  ctx.fillStyle = P.darkRed;
  ctx.fillRect(bx, by + bh, bw, 1);
  drawText(ctx, "WE'LL BE RIGHT BACK", cx, by + 9, { color: P.white, scale: 2, align: 'center' });
  lines.forEach((ln, i) => drawText(ctx, ln, cx, by + 30 + i * 11, { color: P.yellow, align: 'center' }));
  // the studio clock is the only thing that moves
  const clk = clockIn();
  const clock = `${clk.time}:${clk.sec}`;
  const cw = measureText(clock, 2) + 14;
  ctx.fillStyle = P.black;
  ctx.fillRect(cx - (cw >> 1), 155, cw, 22);
  ctx.fillStyle = P.steel;
  ctx.fillRect(cx - (cw >> 1), 177, cw, 1);
  drawText(ctx, clock, cx, 159, { color: P.white, scale: 2, align: 'center' });
}

// ---------------------------------------------------------------------------
// START SCREEN (before the viewer clicks): the logo, a slowly turning earth
// (the one moving thing), a steady prompt and the studio date and time.

export function drawStartScreen(ctx, t, { channel = 'GLOBIT 24', prompt = 'CLICK TO TUNE IN' } = {}) {
  ctx.drawImage(backdrop({ key: 'start', colors: [P.black, P.ink], cx: 300, cy: 96, reach: 220 }), 0, 0);
  drawEarth(ctx, 300, 96, 58, -10 + ((t * 4) % 360));
  const LX = 20;
  // live tag with a steady red square
  const live = 'LIVE • 24 HOURS';
  const lw = measureText(live) + 18;
  plate(ctx, LX, 44, lw, 11, P.black);
  ctx.fillStyle = P.red;
  ctx.fillRect(LX + 4, 47, 5, 5);
  drawText(ctx, live, LX + 13, 46, { color: P.white });
  const ls = measureLogo({ variant: 'full', scale: 2 });
  const sc = ls.w <= 230 ? 2 : 1;
  drawLogo(ctx, LX, 62, { variant: 'full', scale: sc });
  const lh = measureLogo({ variant: 'full', scale: sc }).h;
  drawText(ctx, 'THE WORLD, PIXEL BY PIXEL', LX, 62 + lh + 8, { color: P.cream });
  if (channel && channel.toUpperCase() !== 'GLOBIT 24') drawText(ctx, ellipsis(channel, 200), LX, 62 + lh + 20, { color: P.fog });
  // prompt: white pill with a red play key, steady
  const pr = ellipsis(prompt || '', 200);
  const pw = measureText(pr) + 32;
  const py = 146;
  ctx.fillStyle = P.white;
  ctx.fillRect(LX, py, pw, 17);
  ctx.fillStyle = P.red;
  ctx.fillRect(LX, py, 17, 17);
  ctx.fillStyle = P.white;
  for (let i = 0; i < 4; i++) ctx.fillRect(LX + 7 + i, py + 5 + i, 1, 7 - 2 * i);
  ctx.fillStyle = P.silver;
  ctx.fillRect(LX, py + 17, pw, 1);
  drawText(ctx, pr, LX + 24, py + 5, { color: P.black });
  // date and studio time
  const clk = clockIn();
  ctx.fillStyle = P.slate;
  ctx.fillRect(0, 196, W, 1);
  drawText(ctx, ellipsis(`${clk.date}  •  LONDON ${clk.time}`, W - 40), LX, 202, { color: P.fog });
}

// ---------------------------------------------------------------------------
// UP NEXT promo (end of a break): a trailer of the next programme's open. Its
// reveal plays from the glide onwards, with an UP NEXT tag over the plate.

const PROMO_INFO = new WeakMap();
/**
 * card = { next: { id, title, tagline, presenters }, label, footer }; nameOf maps
 * a presenter id to the on-air name (the info is built once per card).
 */
export function drawPromoCard(ctx, t, dt, card = {}, nameOf = (id) => String(id || '').toUpperCase()) {
  const { next = null, label = 'UP NEXT', footer = 'AFTER THE BREAK' } = card || {};
  let info = next ? PROMO_INFO.get(next) : null;
  if (!info) {
    info = {
      title: next?.title || 'GLOBIT 24',
      tagline: next?.tagline || '',
      presenters: (next?.presenters || []).map((p) => nameOf(p)),
      channel: 'GLOBIT 24',
    };
    if (next) PROMO_INFO.set(next, info);
  }
  drawOpen(ctx, t, 1.6 + Math.max(0, dt), next?.id || '', info);
  const tag = ellipsis(label || 'UP NEXT', 160);
  const tw = measureText(tag) + 10;
  const tp = easeOutQuint(seg(dt, 0.55, 0.3));
  ctx.save();
  clipRect(ctx, 152, 70, Math.round(tw * tp), 11);
  plate(ctx, 152, 70, tw, 11, P.yellow);
  drawText(ctx, tag, 157, 72, { color: P.black });
  ctx.restore();
  if (footer) rise(ctx, ellipsis(footer, 200), 152, 152, seg(dt, 1.2, 0.3), { color: P.fog });
}

// ---------------------------------------------------------------------------
// IDENT (between programmes and breaks): the GLOBIT 24 logo rises in with its
// slogan, glints once and holds.

export function drawIdentCard(ctx, t, dt) {
  ctx.drawImage(backdrop({ key: 'ident', colors: [P.black, P.ink], cx: 192, cy: 100, reach: 230 }), 0, 0);
  const sc = measureLogo({ variant: 'full', scale: 3, slogan: true }).w <= W - 40 ? 3 : 2;
  const size = measureLogo({ variant: 'full', scale: sc, slogan: true });
  const y = Math.round((H - size.h) / 2) - 4;
  const p = seg(dt, 0.15, 0.55);
  if (p <= 0) return;
  const off = Math.round((1 - easeOutQuint(p)) * 26);
  ctx.save();
  clipRect(ctx, 0, y - 2, W, size.h + 4);
  const g = dt - 0.6;
  drawLogo(ctx, W / 2, y + off, { variant: 'full', scale: sc, slogan: true, align: 'center', t: g >= 0 && g < 0.9 ? g : null });
  ctx.restore();
  // a red rule draws out under it
  const rp = easeOutQuint(seg(dt, 0.55, 0.45));
  const rw = Math.round(size.w * 0.6 * rp);
  if (rw > 0) {
    ctx.fillStyle = P.red;
    ctx.fillRect(Math.round(W / 2 - rw / 2), y + size.h + 10, rw, 2);
  }
}

// ---------------------------------------------------------------------------
// TITLE CARD (kept for compatibility: a plain programme title card)

export function drawTitleCard(ctx, t, dt, { channel = 'GLOBIT 24', subtitle = '', date = '' } = {}) {
  drawEndCard(ctx, t, dt, { channel, line1: subtitle || '', line2: date || clockIn().date });
}

// ---------------------------------------------------------------------------
// STINGER (0.8 s transition overlay for opens, breaks and breaking news):
// three slanted panels sweep across and the logo passes while the frame is
// covered, so the shot can change underneath at the midpoint.

const STINGER_LAYERS = [
  { c: P.yellow, a: 0.0, b: 0.32, e: 0.68, f: 1.0 },
  { c: P.darkRed, a: 0.03, b: 0.37, e: 0.63, f: 0.97 },
  { c: P.red, a: 0.06, b: 0.42, e: 0.58, f: 0.94 },
];

export function drawStinger(ctx, t, p) {
  if (!(p > 0 && p < 1)) return;
  const SL = 0.5;
  const SH = H * SL;
  let red = null;
  for (const L of STINGER_LAYERS) {
    const lead = lerp(0, W + SH, easeInOut(seg(p, L.a, L.b - L.a)));
    const tail = lerp(0, W + SH, easeInOut(seg(p, L.e, L.f - L.e)));
    if (lead - tail < 1) continue;
    slab(ctx, tail, 0, lead - tail, H, -SL, L.c);
    if (L.c === P.red) red = { lead, tail };
  }
  if (!red) return;
  // the logo glides through while the red panel covers the frame
  const lp = seg(p, 0.26, 0.48);
  if (lp <= 0 || lp >= 1) return;
  const size = measureLogo({ variant: 'full', scale: 2 });
  const drift = Math.round(lerp(14, -14, easeInOut(lp)));
  ctx.save();
  ctx.beginPath();
  // clip to the red panel so the logo never spills onto the picture
  const top = 0;
  for (let y = top; y < H; y += 2) {
    const off = Math.floor(y * -SL);
    ctx.rect(Math.round(red.tail + off), y, Math.round(red.lead - red.tail), 2);
  }
  ctx.clip();
  drawLogo(ctx, W / 2 + drift, Math.round(H / 2 - size.h / 2), { variant: 'full', scale: 2, align: 'center' });
  ctx.restore();
}


// Full-screen broadcast cards: cold-open headline montage, fact cards (one look
// per programme, from its style bible), BY THE NUMBERS rows, quote card,
// breaking-news card, end card, standby test card, start screen, up-next promo,
// channel ident and the 0.8 s channel stinger.
//
// The cards share the programme opens' package (graded black-to-ink field,
// black or ink plates, one programme accent as a thin rule or bar, 5x7 type at
// 2x for display, 1x for body, 3x5 micro for labels and sources) and its motion
// rules: one eased move at a time, nothing pops, nothing counts up or types on
// (a figure is absent, then whole: in-between values were never stated), and
// every card settles and holds still. No particles, beams, scrolling words,
// sirens, flashes or blinking lights (docs/ART_DIRECTION.md).
//
// Cards shown under the 'news' graphics keep y 0-24 free for the top row and
// y >= 136 free for captions, strap and ticker (the montage owns the bottom:
// its captions move to the top, y 46-72). Static layers are baked once.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { drawLogo, measureLogo } from '../logo.js';
import {
  mk, rgba, u32, clamp, lerp, seg, easeOutQuint, easeInOut, slab, clipRect, disc,
  ellipsis, wrapLines, balanceLines, textW, clockIn, textCacheFn, stepDown,
} from '../gfx/index.js';
import { backdrop, lazyBackdrop } from './opens/kit.js';
import { drawEarth, globeTexture } from './opens/world.js';
import { drawProgrammeLockup } from './opens.js';
import { drawIdentScene, IDENT_WARM } from './opens/ident.js';

export const STINGER_DURATION = 0.8; // seconds

const W = 384;
const H = 216;
const X0 = 19; // graphics-safe left edge
const SAFE_BOTTOM = 134; // last row a card under 'news' graphics may use (captions start at 136)

// ---------------------------------------------------------------------------
// Shared pieces

/** Text that rises `dist` px into place inside a mask at its own rows (p: 0..1). */
function rise(ctx, text, x, y, p, style, dist = null) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (dist ?? h + 3));
  ctx.save();
  try {
    clipRect(ctx, 0, y - 3 * scale, W, h + 3 * scale + (style.shadow ? scale : 0) + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

/** Horizontal wipe of a flat plate from the left (p: 0..1, eased by the caller). */
function plate(ctx, x, y, w, h, color, p = 1) {
  const vis = Math.round(w * p);
  if (vis <= 0) return 0;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), vis, Math.round(h));
  return vis;
}

// text styles, allocated once (drawText takes an options object every call)
const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  white2Shadow: { color: P.white, scale: 2, shadow: P.black },
  whiteShadow: { color: P.white, shadow: P.black },
  silver: { color: P.silver },
  silverC: { color: P.silver, align: 'center' },
  whiteC: { color: P.white, align: 'center' },
  fog: { color: P.fog },
  microFog: { color: P.fog, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
  microSlate: { color: P.slate, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  ink: { color: P.ink },
  ink2: { color: P.ink, scale: 2 },
  ink3: { color: P.ink, scale: 3 },
  white2Right: { color: P.white, scale: 2, align: 'right' },
  black: { color: P.black },
};

const LAYOUTS = textCacheFn(200, (text, num, maxW, big, small) => {
  const two = balanceLines(text, maxW, 2, 99);
  if (two.length <= big && two.every((l) => !l.endsWith('...'))) return { scale: 2, lines: two, lh: 18 };
  return { scale: 1, lines: balanceLines(text, maxW, 1, small), lh: 11 };
});
/** Best headline layout: 2x in up to `big` lines, else 1x in up to `small` lines; balanced (cached). */
function layout(text, maxW, big = 3, small = 4) {
  return LAYOUTS(typeof text === 'string' ? text : String(text ?? ''), maxW * 100 + big * 10 + small, maxW, big, small);
}

const SOURCES = textCacheFn(200, (source, maxW) => ellipsis(`SOURCE: ${source.toUpperCase()}`, maxW, 1));
/** "SOURCE: OUTLET" in caps, shortened to maxW (cached: no string is built per frame). */
const sourceLine = (source, maxW) => (source ? SOURCES(typeof source === 'string' ? source : String(source), maxW, maxW) : '');

/** A stepped bottom shade so text reads over photos (palette black, quantised alpha). */
const SHADES = new Map();
function shade(y0, y1, maxA) {
  const k = (y0 * 1000 + y1) * 100 + Math.round(maxA * 100);
  let c = SHADES.get(k);
  if (c) return c;
  c = mk(W, H);
  const cx = c.getContext('2d');
  for (let y = y0; y < H; y += 2) {
    const q = clamp((y - y0) / (y1 - y0), 0, 1);
    const a = Math.round(maxA * q ** 1.3 * 16) / 16;
    if (a <= 0) continue;
    cx.fillStyle = rgba(P.black, a);
    cx.fillRect(0, y, W, 2);
  }
  SHADES.set(k, c);
  return c;
}

/** Static dot-matrix world map baked into a backdrop: neutral dots one palette step above the field. */
function worldDots(d, level, steps = [P.ink, P.slate, P.slate]) {
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

/**
 * A layout cache keyed by one string, whose value also records the other inputs it was built
 * from: a hit with different inputs rebuilds (rare), so no key strings are built per frame.
 */
function layoutCache(limit = 120) {
  const m = new Map();
  return (key, a, b, c, build) => {
    let v = m.get(key);
    if (v && v.$a === a && v.$b === b && v.$c === c) return v;
    v = build();
    v.$a = a;
    v.$b = b;
    v.$c = c;
    if (m.size >= limit) m.delete(m.keys().next().value);
    m.set(key, v);
    return v;
  };
}

/** Programme accents (THEME_ACCENT values); anything else falls back to brand red. */
const ACCENTS = new Set([P.red, P.cyan, P.magenta, P.green, P.yellow]);
const PROGRAM_ACCENT = { 'world-now': P.red, 'tech-bytes': P.cyan, cosmos: P.magenta, 'money-minute': P.green, 'news-60': P.yellow };
const accentFor = (programId, accent) => (ACCENTS.has(accent) ? accent : (typeof programId === 'string' && Object.hasOwn(PROGRAM_ACCENT, programId) && PROGRAM_ACCENT[programId]) || P.red);

// ---------------------------------------------------------------------------
// HEADLINE MONTAGE FRAME (cold open). One frame per headline with hard cuts
// between them: the picture holds still, the category chip wipes in and the
// headline rises in at 2x. The TOP STORIES tag stays put across the cuts. One
// accent per programme: the chip's bar and the rule beside the headline carry
// the programme accent; the category is only the chip's words.

const CATEGORIES = {
  world: 'WORLD', politics: 'POLITICS', business: 'BUSINESS', tech: 'TECH', science: 'SCIENCE', health: 'HEALTH',
  climate: 'CLIMATE', sport: 'SPORT', culture: 'CULTURE', general: 'NEWS',
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
function categoryLabel(name) {
  const k = String(name || 'general').toLowerCase().trim();
  return CATEGORIES[k] || CATEGORIES[CATEGORY_ALIASES[k]] || CATEGORIES.general;
}

// one neutral field for every headline without a picture: the world in slate dots on ink
const MONTAGE_FIELD = lazyBackdrop({ key: 'montage', colors: [P.black, P.ink], cx: 290, cy: 60, reach: 280, texture: (d, level) => worldDots(d, (x, y) => level(x, y) * 2) });

let TOP_STORIES_W = 0;
export function drawHeadlineFrame(ctx, t, dt, { index = 0, total = 1, headline = '', source = '', category = 'general', image = null, accent = null, programId = '' } = {}) {
  const acc = accentFor(programId, accent);
  if (!TOP_STORIES_W) TOP_STORIES_W = measureText('TOP STORIES', 1, 'micro');
  if (image) {
    ctx.drawImage(image, 0, 0);
    ctx.drawImage(shade(96, 200, 0.85), 0, 0); // photos get a stepped shade; the field is already dark there
  } else ctx.drawImage(MONTAGE_FIELD(), 0, 0);

  // TOP STORIES tag and pips under the bug, micro white on ink (brand red stays with the bug, LIVE
  // and BREAKING): it wipes in on the first frame only and stays put across the cuts
  const tagP = index === 0 ? easeOutQuint(seg(dt, 0.05, 0.35)) : 1;
  const tagW = TOP_STORIES_W + 10;
  const n = clamp(Math.floor(total) || 1, 1, 12);
  const pipsW = n * 11 + 4;
  ctx.save();
  try {
    clipRect(ctx, 13, 25, Math.round((tagW + pipsW) * tagP), 12);
    plate(ctx, 13, 25, tagW + pipsW, 11, P.ink);
    plate(ctx, 13, 25, 1, 11, P.slate);
    drawText(ctx, 'TOP STORIES', 18, 28, S.microWhite);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i === index ? P.white : i < index ? P.fog : P.slate;
      ctx.fillRect(13 + tagW + 4 + i * 11, 29, 9, 3);
    }
  } finally {
    ctx.restore();
  }

  // headline block anchored above the ticker (captions sit at the top in this shot)
  const maxW = W - 2 * X0;
  const lay = layout(headline, maxW, 3, 4);
  const blockH = lay.lines.length * lay.lh - (lay.lh - 7 * lay.scale);
  const top = 194 - blockH;
  const chipY = top - 17;
  // chip: an ink tab with the programme accent bar, the category in white, then the source
  const label = categoryLabel(category);
  const cw = textW(label) + 13;
  const src = source ? ellipsis(source, 200) : '';
  const sw = src ? textW(src) + 10 : 0;
  // the first frame comes straight out of the open's lock-up on the theme's last hit: its chip and
  // bar start at once (the cut never lands on an empty field), the words 0.1 s after the bar
  const t0 = index === 0 ? 0 : 0.12;
  const cp = easeOutQuint(seg(dt, t0, 0.32));
  if (cp > 0) {
    ctx.save();
    try {
      clipRect(ctx, X0, chipY, Math.round((cw + sw) * cp), 11);
      plate(ctx, X0, chipY, cw, 11, P.ink);
      plate(ctx, X0, chipY, 2, 11, acc);
      drawText(ctx, label, X0 + 7, chipY + 2, S.white);
      if (src) {
        plate(ctx, X0 + cw, chipY, sw, 11, P.black);
        drawText(ctx, src, X0 + cw + 5, chipY + 2, S.silver);
      }
    } finally {
      ctx.restore();
    }
  }
  // accent rule grows down beside the headline
  const bar = Math.round((blockH + 4) * easeOutQuint(seg(dt, index === 0 ? 0 : 0.18, 0.4)));
  if (bar > 0) {
    ctx.fillStyle = acc;
    ctx.fillRect(13, top - 2, 2, bar);
  }
  for (let i = 0; i < lay.lines.length; i++) {
    rise(ctx, lay.lines[i], X0, top + i * lay.lh, seg(dt, (index === 0 ? 0.1 : 0.24) + i * 0.07, 0.34), lay.scale === 2 ? S.white2Shadow : S.whiteShadow);
  }
}

// ---------------------------------------------------------------------------
// FIGURES: parsing a stated value exactly as written (never rounded or recounted)

const MAGNITUDES = { THOUSAND: 1e3, K: 1e3, MILLION: 1e6, M: 1e6, MN: 1e6, BILLION: 1e9, BN: 1e9, B: 1e9, TRILLION: 1e12, TN: 1e12 };
// A leading qualifier is part of the stated figure ("ABOUT 1,500", "MORE THAN 62%"): it is kept and
// drawn with the figure (micro type above it), never dropped, so the card never overstates.
const QUALIFIER = /^(AN ESTIMATED|MORE THAN|LESS THAN|FEWER THAN|AT LEAST|AT MOST|UP TO|JUST OVER|JUST UNDER|CLOSE TO|APPROXIMATELY|ALMOST|NEARLY|ABOUT|AROUND|ROUGHLY|SOME|OVER|UNDER|ESTIMATED)\s+(?=[$€£]?\d)/;
const FIG_CACHE = new Map();
/**
 * { text, rest, value, pct, year, range, qual } for a fact string or a numbers[] value: `text` is the
 * figure as written ("2,400", "$2.5BN", "3.5%", "1.2 MILLION"), `value` its scale (2.5e9), `qual`
 * a leading qualifier ("ABOUT", "MORE THAN") or ''.
 */
export function parseFigure(raw) {
  const key = String(raw ?? '');
  let f = FIG_CACHE.get(key);
  if (f) return f;
  let s = key.toUpperCase().replace(/\s+/g, ' ').trim();
  const q = s.match(QUALIFIER);
  const qual = q ? q[1] : '';
  if (q) s = s.slice(q[0].length);
  const m = s.match(/^([$€£]?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|PER ?CENT\b|[KMB]\b|MN\b|BN\b|TN\b)?(\s?(?:-|TO)\s?\d[\d,.]*)?\s*(.*)$/);
  if (!m) f = { text: null, rest: key.toUpperCase().replace(/\s+/g, ' ').trim(), value: NaN, pct: false, year: false, range: false, qual: '' };
  else {
    const [, pre, int, dec = '', suf = '', range = '', tail0] = m;
    let tail = tail0;
    let text = `${pre}${int}${dec}${suf}${range}`;
    let mult = suf && MAGNITUDES[suf.trim()] ? MAGNITUDES[suf.trim()] : 1;
    const nextWord = tail.split(/\s+/)[0] || '';
    if (!suf && MAGNITUDES[nextWord] && nextWord.length > 2) {
      text += ` ${nextWord}`;
      mult = MAGNITUDES[nextWord];
      tail = tail.slice(nextWord.length).trim();
    }
    const value = Number(`${int.replace(/,/g, '')}${dec}`) * mult;
    const pct = suf.startsWith('%') || suf.startsWith('PER');
    const year = !pre && !suf && !dec && !int.includes(',') && /^(1[89]|20|21)\d\d$/.test(int);
    f = { text, rest: tail, value, pct, year, range: !!range, qual };
  }
  if (FIG_CACHE.size > 300) FIG_CACHE.delete(FIG_CACHE.keys().next().value);
  FIG_CACHE.set(key, f);
  return f;
}

/** Rows to show: numbers[] (value + label + qualifier) when given, else the fact split into figure + words. */
const ROWS = new WeakMap();
const FACT_ROWS = textCacheFn(120, (fact) => {
  const f = parseFigure(fact);
  return f.text ? [{ figure: f.text, label: f.rest, f, qual: f.qual }] : [];
});
function rowsFor(fact, numbers) {
  if (Array.isArray(numbers) && numbers.length) {
    let r = ROWS.get(numbers);
    if (!r) {
      r = [];
      for (let i = 0; i < numbers.length && r.length < 3; i++) {
        const v = String(numbers[i]?.value ?? '').trim();
        if (!v) continue;
        const f = parseFigure(v);
        const qual = String(numbers[i]?.qualifier ?? '').toUpperCase().replace(/\s+/g, ' ').trim() || f.qual;
        r.push({ figure: (f.text ? (f.rest ? `${f.text} ${f.rest}` : f.text) : v).toUpperCase(), label: String(numbers[i]?.label ?? '').toUpperCase().trim(), f, qual });
      }
      ROWS.set(numbers, r);
    }
    if (r.length) return r;
  }
  return FACT_ROWS(typeof fact === 'string' ? fact : String(fact ?? ''), 0);
}

// ---------------------------------------------------------------------------
// FACT CARD: one look per programme (docs/programmes/*.md), all inside y 26-134.
//   WORLD NOW / NEWS IN 60 / new shows: a black panel wipes in, a 1 px accent rule draws under
//     the figure's slot, then the figure cuts in at 2x white with its words under it. Two or
//     three figures stack in the same grammar (figure, accent underline, words beside it).
//   TECH BYTES: ledger rows (label left in micro fog, slate leader, figure right at 2x white),
//     a rule draws under each row, the figure cuts in 0.1 s after it. A fact without a figure
//     is set as ledger text rows (2x white lines on slate rules, the last rule cyan).
//   COSMOS DESK: "the Reading": the figure, its label and a powers-of-ten ruler with a magenta
//     measurement line growing to the figure's magnitude (no figure: the words at 2x on the
//     Reading's column, no ruler).
//   MONEY MINUTE: a cream "paper" panel on ink: the headline states the point, a dark-green
//     rule, then one figure at 3x in ink, two comparable values as proportional bars, or the
//     fact itself in ink.
// A qualifier stated with a figure (ABOUT, MORE THAN, UP TO...) is always drawn with it, in
// micro type. No count-ups, no meters, no rolling digits.

const factField = lazyBackdrop({ key: 'fact', colors: [P.black, P.ink], cx: 192, cy: 82, reach: 300, texture: (d, level) => worldDots(d, level) });
const inkField = lazyBackdrop({ key: 'fact-ink', colors: [P.black, P.ink], cx: 192, cy: 82, reach: 520 });

/** The picture pushed back (darkened over 0.3 s, then still), or the card field. */
function cardGround(ctx, dt, image, field) {
  if (image) {
    ctx.drawImage(image, 0, 0);
    const v = easeOutQuint(seg(dt, 0, 0.3));
    ctx.fillStyle = rgba(P.black, 0.72 * v);
    ctx.fillRect(0, 0, W, H);
  } else ctx.drawImage(field(), 0, 0);
}

const srcText = (source, maxW) => (source ? ellipsis(`SOURCE: ${String(source).toUpperCase()}`, maxW, 1) : '');

// WORLD NOW / NEWS IN 60 / new shows: one figure (or the words) on a black panel
const RULE_LAYOUTS = layoutCache(120);
function ruleLayout(fact, label, source, rows) {
  return RULE_LAYOUTS(String(fact ?? ''), label, source, rows, () => {
    const PX = 40;
    const PW = W - 2 * PX;
    const inner = PW - 24;
    const r = rows[0] || null;
    const kicker = ellipsis(label || (r ? 'BY THE NUMBERS' : 'KEY FACT'), inner, 1);
    const qual = r && r.qual ? ellipsis(r.qual, inner, 1) : '';
    const big = r ? ellipsis(r.figure, inner, 2) : null;
    const words = r ? (r.label ? balanceLines(r.label, inner, 1, 3) : []) : null;
    const text = r ? null : layout(fact, inner, 3, 4);
    const src = srcText(source, inner);
    let h = 10 + 5 + 7; // top pad, micro kicker, gap
    if (big) h += (qual ? 7 : 0) + 14 + 5 + 1 + 6 + (words.length ? words.length * 11 - 4 : 0);
    else h += text.lines.length * text.lh - (text.lh - 7 * text.scale) + 5 + 1;
    if (src) h += 10 + 5;
    h += 10;
    const PY = clamp(Math.round(80 - h / 2), 28, SAFE_BOTTOM - h);
    return { PX, PW, PH: h, PY, inner, kicker, qual, big, words, text, src };
  });
}

function drawRuleCard(ctx, dt, o, rows, acc, wipeDur) {
  const L = ruleLayout(o.fact, o.label, o.source, rows);
  const wipe = easeOutQuint(seg(dt, 0, wipeDur));
  const vis = Math.round(L.PW * wipe);
  if (vis <= 0) return;
  const tx = L.PX + 12;
  ctx.save();
  try {
    clipRect(ctx, L.PX, L.PY, vis, L.PH);
    ctx.fillStyle = P.black;
    ctx.fillRect(L.PX, L.PY, L.PW, L.PH);
    ctx.fillStyle = P.slate;
    ctx.fillRect(L.PX, L.PY, L.PW, 1);
    let y = L.PY + 10;
    drawText(ctx, L.kicker, tx, y, S.microFog);
    y += 12;
    // the panel's words are revealed by the wipe itself (no empty box); the figure waits for its rule
    const ruleAt = wipeDur * 0.6;
    if (L.big) {
      if (L.qual) {
        // the qualifier belongs to the figure: it is on the panel before the figure cuts in
        drawText(ctx, L.qual, tx, y, S.microFog);
        y += 7;
      }
      const ruleY = y + 14 + 5;
      const rw = Math.round(L.inner * easeOutQuint(seg(dt, ruleAt, 0.3)));
      if (rw > 0) {
        ctx.fillStyle = acc;
        ctx.fillRect(tx, ruleY, rw, 1);
      }
      if (dt >= ruleAt + 0.4) drawText(ctx, L.big, tx, y, S.white2);
      y = ruleY + 7;
      for (let i = 0; i < L.words.length; i++) drawText(ctx, L.words[i], tx, y + i * 11, S.white);
      y += L.words.length ? L.words.length * 11 - 4 : 0;
    } else {
      const T = L.text;
      for (let i = 0; i < T.lines.length; i++) drawText(ctx, T.lines[i], tx, y + i * T.lh, T.scale === 2 ? S.white2 : S.white);
      y += T.lines.length * T.lh - (T.lh - 7 * T.scale) + 5;
      const rw = Math.round(L.inner * easeOutQuint(seg(dt, ruleAt, 0.3)));
      if (rw > 0) {
        ctx.fillStyle = acc;
        ctx.fillRect(tx, y, rw, 1);
      }
      y += 1;
    }
    if (L.src) drawText(ctx, L.src, tx, y + 10, S.microFog);
  } finally {
    ctx.restore();
  }
}

// WORLD NOW / NEWS IN 60 / new shows: two or three figures stacked in the fact card's grammar
const STACK_PITCH = 24;
const STACK_LAYOUTS = layoutCache(60);
function stackLayout(label, source, rows) {
  return STACK_LAYOUTS(String(label ?? ''), source, rows, null, () => {
    const PX = 40;
    const PW = W - 2 * PX;
    const figs = rows.map((r) => ellipsis(r.figure, 150, 2));
    let fw = 0;
    for (const f of figs) fw = Math.max(fw, textW(f, 2));
    const lx = 12 + fw + 12; // the words' column, from the panel's left edge
    const lw = PW - lx - 12;
    const items = rows.map((r, i) => ({
      fig: figs[i],
      figW: textW(figs[i], 2),
      lines: r.label ? balanceLines(r.label, lw, 1, 2) : [],
      qual: r.qual ? ellipsis(r.qual, fw + 8, 1) : '',
    }));
    const kicker = ellipsis(label || 'BY THE NUMBERS', PW - 24, 1);
    const src = srcText(source, PW - 24);
    const top = 10 + 5 + 9; // kicker, then room for a qualifier above the first figure
    const h = top + items.length * STACK_PITCH - 6 + (src ? 13 : 0) + 9;
    const PY = clamp(Math.round(80 - h / 2), 28, SAFE_BOTTOM - h);
    return { PX, PW, PH: h, PY, lx, items, kicker, src, y0: PY + top };
  });
}

function drawStack(ctx, dt, o, rows, acc) {
  const L = stackLayout(o.label, o.source, rows);
  const vis = Math.round(L.PW * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return;
  const tx = L.PX + 12;
  ctx.save();
  try {
    clipRect(ctx, L.PX, L.PY, vis, L.PH);
    ctx.fillStyle = P.black;
    ctx.fillRect(L.PX, L.PY, L.PW, L.PH);
    ctx.fillStyle = P.slate;
    ctx.fillRect(L.PX, L.PY, L.PW, 1);
    drawText(ctx, L.kicker, tx, L.PY + 10, S.microFog);
    for (let i = 0; i < L.items.length; i++) {
      const it = L.items[i];
      const y = L.y0 + i * STACK_PITCH;
      if (it.qual) drawText(ctx, it.qual, tx, y - 7, S.microFog);
      // the words beside the figure's slot, centred on it
      const ly = it.lines.length > 1 ? y - 2 : y + 4;
      for (let k = 0; k < it.lines.length; k++) drawText(ctx, it.lines[k], L.PX + L.lx, ly + k * 11, S.white);
      // each figure gets its accent underline, then cuts in (rows one after another)
      const at = 0.25 + i * 0.3;
      const rw = Math.round(it.figW * easeOutQuint(seg(dt, at, 0.25)));
      if (rw > 0) {
        ctx.fillStyle = acc;
        ctx.fillRect(tx, y + 16, rw, 1);
      }
      if (dt >= at + 0.35) drawText(ctx, it.fig, tx, y, S.white2);
    }
    if (L.src) drawText(ctx, L.src, tx, L.y0 + L.items.length * STACK_PITCH - 6 + 6, S.microFog);
  } finally {
    ctx.restore();
  }
}

// TECH BYTES ledger
const LEDGER_PITCH = 24;
const LEDGER_LAYOUTS = new WeakMap();
function ledgerLayout(rows, label, source) {
  let L = LEDGER_LAYOUTS.get(rows);
  if (L && L.label === label && L.source === source) return L;
  const n = rows.length;
  const blockH = 12 + n * LEDGER_PITCH - 4 + (source ? 12 : 0);
  const top = clamp(Math.round(82 - blockH / 2), 30, SAFE_BOTTOM - blockH);
  const items = rows.map((r, i) => {
    const fig = ellipsis(r.figure, 170, 2);
    const fw = textW(fig, 2);
    const qual = r.qual ? ellipsis(r.qual, 80, 1) : '';
    const qualW = qual ? measureText(qual, 1, 'micro') + 4 : 0;
    const lab = ellipsis(r.label || '', W - 2 * X0 - fw - qualW - 24, 1);
    return { fig, fw, qual, qualW, lab, labW: measureText(lab, 1, 'micro'), y: top + 12 + i * LEDGER_PITCH };
  });
  L = { label, source, top, items, kicker: ellipsis(label || (n > 1 ? 'BY THE NUMBERS' : 'NUMBER OF THE DAY'), 200, 1), src: srcText(source, 300) };
  LEDGER_LAYOUTS.set(rows, L);
  return L;
}

function drawLedger(ctx, dt, o, rows, acc) {
  const L = ledgerLayout(rows, o.label, o.source);
  const enter = easeOutQuint(seg(dt, 0, 0.3));
  if (enter <= 0) return;
  const n = L.items.length;
  const RW = W - 2 * X0;
  // the kicker and labels come in with a short eased reveal; each row then gets its rule, and its
  // figure cuts in 0.1 s after the rule has finished (TECH BYTES: no count-up, ever)
  ctx.save();
  try {
    clipRect(ctx, X0, L.top - 2, Math.round(RW * enter), SAFE_BOTTOM - L.top + 2);
    drawText(ctx, L.kicker, X0, L.top, S.microFog);
    for (let i = 0; i < n; i++) {
      const it = L.items[i];
      const at = 0.15 + i * 0.3;
      // label in micro on the figure's baseline, a dotted slate leader, then the qualifier (micro)
      // right before the figure
      drawText(ctx, it.lab, X0, it.y + 9, S.microFog);
      ctx.fillStyle = P.slate;
      const lx = X0 + it.labW + 4;
      const rx = W - X0 - it.fw - 4 - it.qualW;
      for (let x = lx + ((lx & 1) ^ 1); x < rx; x += 2) ctx.fillRect(x, it.y + 13, 1, 1);
      if (it.qual) drawText(ctx, it.qual, rx + 2, it.y + 9, S.microFog);
      // the rule under the row: slate between rows, the accent under the last one
      const rw = Math.round(RW * easeOutQuint(seg(dt, at, 0.3)));
      if (rw > 0) {
        ctx.fillStyle = i === n - 1 ? acc : P.slate;
        ctx.fillRect(X0, it.y + 17, rw, 1);
      }
      if (dt >= at + 0.4) drawText(ctx, it.fig, W - X0, it.y, S.white2Right);
    }
    if (L.src) drawText(ctx, L.src, X0, L.items[n - 1].y + 24, S.microFog);
  } finally {
    ctx.restore();
  }
}

// TECH BYTES, a fact without a figure: the words as ledger rows (each line on its rule)
const LEDGER_TEXT = layoutCache(60);
function ledgerTextLayout(fact, label, source) {
  return LEDGER_TEXT(String(fact ?? ''), label, source, null, () => {
    const T = layout(fact, W - 2 * X0, 3, 4);
    const lh = T.scale === 2 ? 22 : 15;
    const blockH = 12 + T.lines.length * lh - 3 + (source ? 12 : 0);
    const top = clamp(Math.round(82 - blockH / 2), 30, SAFE_BOTTOM - blockH);
    return { T, lh, top, kicker: ellipsis(label || 'KEY FACT', 200, 1), src: srcText(source, 300) };
  });
}

function drawLedgerText(ctx, dt, o, acc) {
  const L = ledgerTextLayout(o.fact, o.label, o.source);
  const enter = easeOutQuint(seg(dt, 0, 0.3));
  if (enter <= 0) return;
  const RW = W - 2 * X0;
  const T = L.T;
  const n = T.lines.length;
  ctx.save();
  try {
    clipRect(ctx, X0, L.top - 2, Math.round(RW * enter), SAFE_BOTTOM - L.top + 2);
    drawText(ctx, L.kicker, X0, L.top, S.microFog);
    for (let i = 0; i < n; i++) {
      const y = L.top + 12 + i * L.lh;
      drawText(ctx, T.lines[i], X0, y, T.scale === 2 ? S.white2 : S.white);
      const rw = Math.round(RW * easeOutQuint(seg(dt, 0.15 + i * 0.2, 0.3)));
      if (rw > 0) {
        ctx.fillStyle = i === n - 1 ? acc : P.slate;
        ctx.fillRect(X0, y + 7 * T.scale + 3, rw, 1);
      }
    }
    if (L.src) drawText(ctx, L.src, X0, L.top + 12 + n * L.lh + 2, S.microFog);
  } finally {
    ctx.restore();
  }
}

// COSMOS DESK: the Reading
const RULER_LABELS = [[0, '1'], [3, '1K'], [6, '1M'], [9, '1BN'], [12, '1TN']];
function drawReading(ctx, dt, o, rows) {
  const r = rows[0];
  const enter = easeOutQuint(seg(dt, 0, 0.4));
  if (enter <= 0) return;
  const x0 = 64;
  ctx.save();
  try {
    clipRect(ctx, 0, 26, Math.round(x0 + (W - x0) * enter), SAFE_BOTTOM - 26 + 1);
    if (!r) {
      // no figure: the fact itself at 2x, left-aligned on the Reading's column
      const T = layout(o.fact, W - x0 - 40, 3, 4);
      for (let i = 0; i < T.lines.length; i++) drawText(ctx, T.lines[i], x0, 56 + i * T.lh, T.scale === 2 ? S.white2 : S.white);
      if (o.source) drawText(ctx, sourceLine(o.source, 260), x0, 128, S.microFog);
      return;
    }
    const f = r.f;
    const ruler = Number.isFinite(f.value) && f.value >= 1 && f.value <= 1e12 && !f.pct && !f.year && !f.range;
    if (r.qual) drawText(ctx, ellipsis(r.qual, 200, 1), x0, 48, S.microSilver);
    // the figure wipes on (absent, then whole: no count-up, no typing)
    const fp = easeOutQuint(seg(dt, 0.3, 0.25));
    if (fp > 0) {
      const fig = ellipsis(r.figure, W - x0 - 30, 2);
      const fw = textW(fig, 2);
      ctx.save();
      try {
        clipRect(ctx, x0, 55, Math.round((fw + 2) * fp), 17);
        drawText(ctx, fig, x0, 56, S.white2);
      } finally {
        ctx.restore();
      }
    }
    if (r.label) drawText(ctx, ellipsis(r.label, W - x0 - 30, 1), x0, 80, S.silver);
    if (ruler) {
      ctx.fillStyle = P.steel;
      ctx.fillRect(x0, 104, 241, 1);
      for (let p = 0; p <= 12; p++) {
        const tx = x0 + p * 20;
        if (p % 3 === 0) {
          ctx.fillStyle = P.silver;
          ctx.fillRect(tx, 101, 1, 3);
        } else {
          ctx.fillStyle = P.steel;
          ctx.fillRect(tx, 103, 1, 1);
        }
      }
      for (let i = 0; i < RULER_LABELS.length; i++) {
        const [p, lab] = RULER_LABELS[i];
        drawText(ctx, lab, x0 + p * 20, 108, MICRO_FOG_C);
      }
      // the measurement grows to the figure's magnitude (0.6 s, eased out), then holds
      const end = Math.round(20 * Math.log10(f.value));
      const mp = easeOutQuint(seg(dt, 0.55, 0.6));
      const len = Math.round(end * mp);
      if (len > 0 || mp > 0) {
        ctx.fillStyle = P.magenta;
        ctx.fillRect(x0, 104, Math.max(1, len + 1), 1);
        ctx.fillRect(x0 + len - 1, 99, 3, 1);
        ctx.fillRect(x0 + len, 100, 1, 1);
      }
    }
    if (o.source) drawText(ctx, sourceLine(o.source, 260), x0, ruler ? 124 : 104, S.microFog);
  } finally {
    ctx.restore();
  }
}
const MICRO_FOG_C = { color: P.fog, font: 'micro', align: 'center' };

// MONEY MINUTE: the paper card
const PAPER = { x: 40, y: 32, w: 304, h: 88 };
const PAPER_LAYOUTS = layoutCache(120);
function paperLayout(headline, rows, source, fact) {
  return PAPER_LAYOUTS(String(headline ?? ''), rows, source, fact, () => {
    const { y, h } = PAPER;
    const inner = PAPER.w - 16;
    const title = headline ? balanceLines(headline, inner, 1, 2) : [];
    const ruleY = title.length ? y + 9 + title.length * 11 - 4 + 4 : y + 9;
    const src = srcText(source, inner);
    // the body sits centred between the rule and the source line
    const bodyTop = ruleY + 6;
    const bodyBot = src ? y + h - 15 : y + h - 7;
    const room = bodyBot - bodyTop;
    const r0 = rows[0];
    // two non-negative values with the same unit and label: proportional bars
    let bars = null;
    if (rows.length >= 2) {
      const [a, b] = rows;
      const unit = (x) => x.figure.replace(/[\d.,\s]/g, '');
      if (a.label === b.label && unit(a) === unit(b) && a.f.value >= 0 && b.f.value >= 0 && Number.isFinite(a.f.value) && Number.isFinite(b.f.value)) {
        const max = Math.max(a.f.value, b.f.value) || 1;
        bars = [a, b].map((r) => ({ figure: r.qual ? `${r.qual} ${r.figure}` : r.figure, len: Math.max(1, Math.round((200 * r.f.value) / max)) }));
      }
    }
    const out = { title, ruleY, src, bars, barsY: bodyTop + Math.max(0, (room - 22) >> 1), figure: null, text: null };
    if (!bars && r0) {
      // one figure: 3x when it fits the panel (the number of the day), else 2x
      const qual = r0.qual ? ellipsis(r0.qual, inner, 1) : '';
      const label = r0.label ? ellipsis(r0.label, inner, 1) : '';
      const extra = (qual ? 7 : 0) + (label ? 11 : 0);
      const scale = textW(r0.figure, 3) <= inner && 21 + extra <= room ? 3 : 2;
      const figure = ellipsis(r0.figure, inner, scale);
      const blockH = extra + 7 * scale;
      const top = bodyTop + Math.max(0, (room - blockH) >> 1);
      out.figure = { text: figure, scale, qual, label, qualY: top, figY: top + (qual ? 7 : 0), labelY: top + (qual ? 7 : 0) + 7 * scale + 4 };
    } else if (!bars && fact) {
      // no figure: the fact itself in ink, 2x when it fits in two lines, else 1x
      let scale = 2;
      let lines = balanceLines(fact, inner, 2, 99);
      if (lines.length > 2 || lines.length * 18 - 4 > room || lines.some((l) => l.endsWith('...'))) {
        scale = 1;
        lines = balanceLines(fact, inner, 1, Math.max(1, Math.floor((room + 4) / 11)));
      }
      const lh = scale === 2 ? 18 : 11;
      const blockH = lines.length * lh - (lh - 7 * scale);
      out.text = { lines, scale, lh, y: bodyTop + Math.max(0, (room - blockH) >> 1) };
    }
    return out;
  });
}

function drawPaper(ctx, dt, o, rows) {
  // the cut goes to the dark frame; the cream panel wipes in (never hard-cuts in)
  const p = easeOutQuint(seg(dt, 0.05, 0.25));
  const vis = Math.round(PAPER.w * p);
  if (vis <= 0) return;
  const L = paperLayout(o.headline, rows, o.source, typeof o.fact === 'string' ? o.fact : String(o.fact ?? ''));
  const { x, y, w, h } = PAPER;
  ctx.save();
  try {
    clipRect(ctx, x, y, vis + 1, h + 1);
    ctx.fillStyle = P.cream;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = P.tan; // the paper's shaded edges (key light upper left)
    ctx.fillRect(x + w - 1, y + 1, 1, h - 1);
    ctx.fillRect(x + 1, y + h - 1, w - 1, 1);
    ctx.fillStyle = P.black;
    ctx.fillRect(x + 1, y + h, w, 1);
    ctx.fillRect(x + w, y + 1, 1, h);
    const tx = x + 8;
    for (let i = 0; i < L.title.length; i++) drawText(ctx, L.title[i], tx, y + 9 + i * 11, S.ink);
    ctx.fillStyle = P.darkGreen;
    ctx.fillRect(tx, L.ruleY, w - 16, 1);
    if (L.bars) {
      const bp = easeOutQuint(seg(dt, 0.4, 0.5));
      for (let i = 0; i < 2; i++) {
        const b = L.bars[i];
        const by = L.barsY + i * 14;
        const len = Math.max(1, Math.round(b.len * bp));
        ctx.fillStyle = i === 0 ? P.steel : P.ink;
        ctx.fillRect(tx, by, len, 8);
        if (bp >= 1) drawText(ctx, b.figure, tx + len + 6, by + 1, S.ink);
      }
    } else if (L.figure) {
      const F = L.figure;
      if (F.qual) drawText(ctx, F.qual, tx, F.qualY, S.microSlate);
      // the figure is set after the panel is out (absent, then whole)
      if (dt >= 0.35) drawText(ctx, F.text, tx, F.figY, F.scale === 3 ? S.ink3 : S.ink2);
      if (F.label) drawText(ctx, F.label, tx, F.labelY, S.ink);
    } else if (L.text) {
      const T = L.text;
      for (let i = 0; i < T.lines.length; i++) drawText(ctx, T.lines[i], tx, T.y + i * T.lh, T.scale === 2 ? S.ink2 : S.ink);
    }
    if (L.src) drawText(ctx, L.src, tx, y + h - 11, S.microSlate);
  } finally {
    ctx.restore();
  }
}

const RULE_STYLE = { look: 'rule', wipe: 0.3 };
const FACT_STYLES = {
  'world-now': RULE_STYLE,
  'news-60': { look: 'rule', wipe: 0.25 },
  'tech-bytes': { look: 'ledger' },
  cosmos: { look: 'reading' },
  'money-minute': { look: 'paper' },
};

/**
 * Fact card. o = { fact, label, source, image, numbers: [{ value, label, qualifier? }], programId,
 * accent, headline (MONEY MINUTE's paper title), quote: { text, by } (shown when there is no fact) }.
 */
export function drawFactCard(ctx, t, dt, o = {}) {
  const opts = o || {};
  if (!opts.fact && !(Array.isArray(opts.numbers) && opts.numbers.length) && opts.quote?.text) {
    QUOTE.text = opts.quote.text;
    QUOTE.by = opts.quote.by ?? null;
    QUOTE.image = opts.image ?? null;
    QUOTE.accent = opts.accent ?? null;
    QUOTE.programId = opts.programId ?? '';
    return drawQuoteCard(ctx, t, dt, QUOTE);
  }
  const style = typeof opts.programId === 'string' && Object.hasOwn(FACT_STYLES, opts.programId) ? FACT_STYLES[opts.programId] : RULE_STYLE;
  const acc = accentFor(opts.programId, opts.accent);
  const rows = rowsFor(opts.fact, opts.numbers);
  if (style.look === 'paper') {
    ctx.drawImage(inkField(), 0, 0);
    return drawPaper(ctx, dt, opts, rows);
  }
  if (style.look === 'reading') {
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, W, H);
    return drawReading(ctx, dt, opts, rows);
  }
  if (style.look === 'ledger') {
    cardGround(ctx, dt, opts.image, inkField);
    return rows.length ? drawLedger(ctx, dt, opts, rows, acc) : drawLedgerText(ctx, dt, opts, acc);
  }
  cardGround(ctx, dt, opts.image, factField);
  if (rows.length > 1) return drawStack(ctx, dt, opts, rows, acc);
  return drawRuleCard(ctx, dt, opts, rows, acc, style.wipe || 0.3);
}

const QUOTE = { text: '', by: null, image: null, accent: null, programId: '' };
const NUMBERS = { fact: '', label: 'BY THE NUMBERS', source: '', image: null, numbers: null, programId: '', accent: null, headline: '' };

/** BY THE NUMBERS: up to three stated figures (numbers[]) in the programme's look. */
export function drawNumbersCard(ctx, t, dt, o = {}) {
  const src = o || {};
  NUMBERS.fact = src.fact || '';
  NUMBERS.label = src.label || 'BY THE NUMBERS';
  NUMBERS.source = src.source || '';
  NUMBERS.image = src.image || null;
  NUMBERS.numbers = src.numbers || null;
  NUMBERS.programId = src.programId || '';
  NUMBERS.accent = src.accent || null;
  NUMBERS.headline = src.headline || '';
  return drawFactCard(ctx, t, dt, NUMBERS);
}

// ---------------------------------------------------------------------------
// QUOTE CARD: words quoted in the story, in body type on an ink plate under a hand-pixelled
// opening quotation mark in the programme accent, the attribution in micro fog ("- THE MAYOR"),
// so a quote never reads as a fact. TECH BYTES carries a 1 px cyan bar on the left; the others
// a 1 px accent rule that draws under the quote on entry.

// an opening quotation mark, two "6" shapes (4x6 each, 2 px apart)
const QUOTE_MARK = ['..##..##', '.##..##.', '##..##..', '########', '########', '.##..##.'];
function quoteMark(ctx, x, y, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < QUOTE_MARK.length; r++) {
    const row = QUOTE_MARK[r];
    let run = -1;
    for (let c = 0; c <= row.length; c++) {
      const on = row[c] === '#';
      if (on && run < 0) run = c;
      else if (!on && run >= 0) {
        ctx.fillRect(x + run, y + r, c - run, 1);
        run = -1;
      }
    }
  }
}

const QUOTE_LAYOUTS = layoutCache(80);
export function drawQuoteCard(ctx, t, dt, { text = '', by = null, image = null, accent = null, programId = '' } = {}) {
  const acc = accentFor(programId, accent);
  cardGround(ctx, dt, image, inkField);
  const L = QUOTE_LAYOUTS(String(text ?? ''), by, null, null, () => {
    const inner = W - 2 * 40 - 28;
    let scale = 2;
    let lines = balanceLines(text, inner, 2, 3);
    if (lines.length > 3 || lines.some((l) => l.endsWith('...'))) {
      scale = 1;
      lines = balanceLines(text, inner, 1, 6);
    }
    const lh = scale === 2 ? 18 : 11;
    const blockH = lines.length * lh - (lh - 7 * scale);
    const attr = by ? ellipsis(`— ${String(by).toUpperCase()}`, inner, 1) : '';
    const h = 9 + 6 + 7 + blockH + 6 + 1 + (attr ? 12 : 0) + 10;
    const y = clamp(Math.round(80 - h / 2), 28, SAFE_BOTTOM - h);
    return { lines, scale, lh, blockH, attr, h, y, x: 40, w: W - 80 };
  });
  const wipe = easeOutQuint(seg(dt, 0, 0.35));
  const vis = Math.round(L.w * wipe);
  if (vis <= 0) return;
  ctx.save();
  try {
    clipRect(ctx, L.x, L.y, vis, L.h);
    ctx.fillStyle = P.ink;
    ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.fillStyle = P.slate;
    ctx.fillRect(L.x, L.y, L.w, 1);
    const tx = L.x + 14;
    quoteMark(ctx, tx, L.y + 9, acc);
    let y = L.y + 9 + 6 + 7;
    const st = L.scale === 2 ? S.white2 : S.white;
    for (let i = 0; i < L.lines.length; i++) drawText(ctx, L.lines[i], tx, y + i * L.lh, st);
    if (programId === 'tech-bytes') {
      ctx.fillStyle = acc;
      ctx.fillRect(L.x + 7, L.y + 9, 1, y - L.y - 9 + L.blockH + 1);
    }
    y += L.blockH + 6;
    if (programId !== 'tech-bytes') {
      const rw = Math.round((L.w - 28) * easeOutQuint(seg(dt, 0.25, 0.4)));
      if (rw > 0) {
        ctx.fillStyle = acc;
        ctx.fillRect(tx, y, rw, 1);
      }
    }
    if (L.attr) drawText(ctx, L.attr, tx, y + 8, S.microFog);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// BREAKING NEWS card: a calm colour change, done in about a second and held
// (the card lasts at most 3 s). No flash, no siren, no flashing borders. The
// text sits on a flat field (no dither under type).

const breakingField = lazyBackdrop({ key: 'breaking', colors: [P.black, P.ink], cx: 192, cy: 108, reach: 520 });

export function drawBreakingCard(ctx, t, dt, { headline = '', source = '' } = {}) {
  ctx.drawImage(breakingField(), 0, 0);
  // the red band wipes in from the left
  const BY = 52;
  const BH = 28;
  const bp = easeOutQuint(seg(dt, 0, 0.36));
  plate(ctx, 0, BY, W, BH, P.red, bp);
  plate(ctx, 0, BY + BH, W, 2, P.darkRed, bp);
  ctx.save();
  try {
    clipRect(ctx, 0, BY, Math.round(W * bp), BH);
    rise(ctx, 'BREAKING NEWS', X0, BY + 7, seg(dt, 0.2, 0.32), S.white2, 16);
  } finally {
    ctx.restore();
  }
  // headline on the calm field below, balanced lines, all left-aligned on x 19
  const lay = layout(headline, W - 2 * X0, 3, 4);
  const top = BY + BH + 14;
  for (let i = 0; i < lay.lines.length; i++) rise(ctx, lay.lines[i], X0, top + i * lay.lh, seg(dt, 0.42 + i * 0.08, 0.34), lay.scale === 2 ? S.white2 : S.white);
  if (source) {
    // the breaking card runs under the 'bug' graphics (no captions or strap): room down to the ticker
    const sy = Math.min(186, top + lay.lines.length * lay.lh + 4);
    rise(ctx, sourceLine(source, W - 2 * X0), X0, sy, seg(dt, 0.75, 0.3), S.microFog);
  }
}

// ---------------------------------------------------------------------------
// END CARD (the programme's endcap): the channel logo, the programme plate with
// its accent bar, the sign-off lines and the outro rail. No clock and no next
// programme (channel-and-breaks.md 3.1, 3.3). Everything settles by 1.2 s.

const END_FIELD = lazyBackdrop({ key: 'end', colors: [P.black, P.ink], cx: 192, cy: 80, reach: 300 });
let END_LOGO = null;
export function drawEndCard(ctx, t, dt, { channel = 'GLOBIT 24', line1 = 'STAY WITH US', line2 = 'NEXT BULLETIN SHORTLY', accent = P.red } = {}) {
  ctx.drawImage(END_FIELD(), 0, 0);
  const LS = 2;
  const ls = END_LOGO || (END_LOGO = measureLogo({ variant: 'full', scale: LS }));
  const ly = 32;
  const lp = seg(dt, 0.1, 0.45);
  if (lp > 0) {
    const off = Math.round((1 - easeOutQuint(lp)) * 8);
    ctx.save();
    try {
      clipRect(ctx, 0, ly - 2, W, ls.h + 4);
      drawLogo(ctx, W / 2, ly + off, { variant: 'full', scale: LS, align: 'center', t: dt - 0.1 < 0.9 ? Math.max(0, dt - 0.1) : null });
    } finally {
      ctx.restore();
    }
  }
  // programme plate: title at 2x on black with the accent bar
  const title = ellipsis(String(channel || ''), W - 80, 2);
  const tw = textW(title, 2);
  const pw = tw + 24;
  const px = (W - pw) >> 1;
  const py = ly + ls.h + 14;
  const pp = easeOutQuint(seg(dt, 0.35, 0.4));
  if (pp > 0) {
    const vis = plate(ctx, px, py, pw, 26, P.black, pp);
    ctx.fillStyle = P.slate;
    ctx.fillRect(px, py, vis, 1);
    ctx.fillStyle = ACCENTS.has(accent) ? accent : P.red;
    ctx.fillRect(px, py + 26, Math.round(pw * easeOutQuint(seg(dt, 0.5, 0.36))), 2);
    ctx.save();
    try {
      clipRect(ctx, px, py + 1, vis, 25);
      rise(ctx, title, px + 12, py + 6, seg(dt, 0.48, 0.3), S.white2);
    } finally {
      ctx.restore();
    }
  }
  // sign-off lines
  const l1 = ellipsis(String(line1 || ''), W - 60);
  const l2 = line2 ? ellipsis(String(line2), W - 60) : '';
  rise(ctx, l1, W / 2, py + 40, seg(dt, 0.65, 0.3), S.whiteC);
  if (l2) rise(ctx, l2, W / 2, py + 52, seg(dt, 0.78, 0.3), S.silverC);
  // outro rail: the programme handing over, drawn once across 2.2 s
  const RY = 188;
  const rp = easeInOut(seg(dt, 0.6, 2.2));
  ctx.fillStyle = P.slate;
  ctx.fillRect(28, RY + 1, W - 56, 1);
  if (rp > 0) {
    ctx.fillStyle = P.red;
    ctx.fillRect(28, RY, Math.round((W - 56) * rp), 3);
  }
}

// ---------------------------------------------------------------------------
// STANDBY (test card): a still test card with the message; only the clock
// moves. Its bars are muted one palette step so it is never the loudest frame
// on the channel.

const TC = { cx: 192, cy: 108, R: 100 };

const TESTCARDS = new Map();
function testCardLayer(channel) {
  const hit = TESTCARDS.get(channel);
  if (hit) return hit;
  const c = mk(W, H);
  const x = c.getContext('2d');
  // background grid
  x.fillStyle = P.ink;
  x.fillRect(0, 0, W, H);
  x.fillStyle = P.slate;
  for (let gx = 0; gx <= W; gx += 24) x.fillRect(gx, 0, 1, H);
  for (let gy = 12; gy < H; gy += 24) x.fillRect(0, gy, W, 1);
  // castellated border
  for (let i = 0; i * 12 < W; i++) {
    x.fillStyle = i % 2 ? P.black : P.fog;
    x.fillRect(i * 12, 0, 12, 4);
    x.fillStyle = i % 2 ? P.fog : P.black;
    x.fillRect(i * 12, H - 4, 12, 4);
  }
  for (let i = 0; i * 12 < H; i++) {
    x.fillStyle = i % 2 ? P.fog : P.black;
    x.fillRect(0, i * 12, 4, 12);
    x.fillStyle = i % 2 ? P.black : P.fog;
    x.fillRect(W - 4, i * 12, 4, 12);
  }
  [P.darkRed, P.tanShade, P.darkGreen, P.navy].forEach((col, i) => {
    x.fillStyle = col;
    x.fillRect(24, 61 + i * 24, 24, 23);
    x.fillStyle = [P.silver, P.fog, P.steel, P.black][i];
    x.fillRect(W - 48, 61 + i * 24, 24, 23);
  });
  // circle contents
  const { cx, cy, R } = TC;
  const inner = mk(W, H);
  const ix = inner.getContext('2d');
  ix.fillStyle = P.ink;
  ix.fillRect(0, 0, W, H);
  const bars = [P.fog, P.tan, P.blue, P.darkGreen, P.purple, P.darkRed, P.navy];
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
    ix.fillStyle = P.silver;
    for (let xx = 0; xx < gw; xx++) if (Math.floor(xx / (pp / 2)) % 2 === 0) ix.fillRect(gx0 + xx, 132, 1, 20);
  });
  ix.fillStyle = P.ink;
  ix.fillRect(0, 152, W, 26);
  ix.fillStyle = P.maroon;
  ix.fillRect(0, 178, W, 40);
  ix.fillStyle = P.darkRed;
  ix.fillRect(cx - 30, 178, 60, 40);
  drawText(ix, 'STANDBY', cx, 186, { color: P.white, align: 'center' });
  ix.fillStyle = P.steel;
  ix.fillRect(cx, 60, 1, 58);
  ix.fillRect(bx0, cy, 2 * R + 1, 1);
  const mask = mk(W, H);
  disc(mask.getContext('2d'), cx, cy, R, '#fff');
  ix.globalCompositeOperation = 'destination-in';
  ix.drawImage(mask, 0, 0);
  disc(x, cx, cy, R + 2, P.black);
  disc(x, cx, cy, R + 1, P.silver);
  x.drawImage(inner, 0, 0);
  // station name plate over the top of the circle
  const nm = ellipsis(channel || 'GLOBIT 24', 170, 2);
  const nw = measureText(nm, 2) + 14;
  x.fillStyle = P.black;
  x.fillRect(cx - (nw >> 1), 15, nw, 22);
  x.fillStyle = P.red;
  x.fillRect(cx - (nw >> 1), 37, nw, 1);
  drawText(x, nm, cx, 19, { color: P.white, scale: 2, align: 'center' });
  TESTCARDS.set(channel, c);
  return c;
}

const STANDBY_STYLE = { white2C: { color: P.white, scale: 2, align: 'center' }, silverC: { color: P.silver, align: 'center' } };
export function drawStandby(ctx, t, { channel = 'GLOBIT 24', message = '' } = {}) {
  ctx.drawImage(testCardLayer(String(channel ?? 'GLOBIT 24')), 0, 0);
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
  drawText(ctx, "WE'LL BE RIGHT BACK", cx, by + 9, STANDBY_STYLE.white2C);
  for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], cx, by + 30 + i * 11, STANDBY_STYLE.silverC);
  // the studio clock is the only thing that moves
  const clk = clockIn();
  const clock = `${clk.time}:${clk.sec}`;
  const cw = textW(clock, 2) + 14;
  ctx.fillStyle = P.black;
  ctx.fillRect(cx - (cw >> 1), 155, cw, 22);
  ctx.fillStyle = P.steel;
  ctx.fillRect(cx - (cw >> 1), 177, cw, 1);
  drawText(ctx, clock, cx, 159, STANDBY_STYLE.white2C);
}

// ---------------------------------------------------------------------------
// START SCREEN (before the viewer clicks): the logo, a slowly turning earth
// (the one moving thing), a steady prompt and the studio date and time.

const START_FIELD = lazyBackdrop({ key: 'start', colors: [P.black, P.ink], cx: 300, cy: 96, reach: 220 });
export function drawStartScreen(ctx, t, { channel = 'GLOBIT 24', prompt = 'CLICK TO TUNE IN' } = {}) {
  const ch = String(channel ?? '');
  ctx.drawImage(START_FIELD(), 0, 0);
  drawEarth(ctx, 300, 96, 58, -10 + ((t * 4) % 360));
  const LX = 20;
  // live tag with a steady red square
  const live = 'LIVE • 24 HOURS';
  const lw = textW(live) + 18;
  plate(ctx, LX, 44, lw, 11, P.black);
  ctx.fillStyle = P.red;
  ctx.fillRect(LX + 4, 47, 5, 5);
  drawText(ctx, live, LX + 13, 46, S.white);
  const ls = measureLogo({ variant: 'full', scale: 2 });
  const sc = ls.w <= 230 ? 2 : 1;
  drawLogo(ctx, LX, 62, { variant: 'full', scale: sc });
  const lh = measureLogo({ variant: 'full', scale: sc }).h;
  drawText(ctx, 'THE WORLD, PIXEL BY PIXEL', LX, 62 + lh + 8, S.silver);
  if (ch && ch.toUpperCase() !== 'GLOBIT 24') drawText(ctx, ellipsis(ch, 200), LX, 62 + lh + 20, S.fog);
  // prompt: white pill with a red play key, steady
  const pr = ellipsis(String(prompt ?? ''), 200);
  const pw = textW(pr) + 32;
  const py = 146;
  ctx.fillStyle = P.white;
  ctx.fillRect(LX, py, pw, 17);
  ctx.fillStyle = P.red;
  ctx.fillRect(LX, py, 17, 17);
  ctx.fillStyle = P.white;
  for (let i = 0; i < 4; i++) ctx.fillRect(LX + 7 + i, py + 5 + i, 1, 7 - 2 * i);
  ctx.fillStyle = P.silver;
  ctx.fillRect(LX, py + 17, pw, 1);
  drawText(ctx, pr, LX + 24, py + 5, S.black);
  // date and studio time
  const clk = clockIn();
  ctx.fillStyle = P.slate;
  ctx.fillRect(0, 196, W, 1);
  drawText(ctx, ellipsis(`${clk.date}  •  LONDON ${clk.time}`, W - 40), LX, 202, S.fog);
}

// ---------------------------------------------------------------------------
// UP NEXT promo (the last card of a break): a NETWORK card, not a replay of the
// open (the open itself follows a stinger later). The next programme's settled
// lock-up (its emblem still, plate, title, tagline and credits, exactly the
// frame its open will end on) sits on the channel's ident field. It arrives by
// a two-step palette fade (one step darker, then itself) while rising 6 px, a
// micro UP NEXT appears above the plate, and then nothing moves
// (channel-and-breaks.md 5.4: the next open's lock-up frame, card motion <= 8 px,
// no clock text). The footer is shown only when it adds something: the promo
// closes the break, so "AFTER THE BREAK" is never drawn.

const PROMO_FIELD = lazyBackdrop({ key: 'promo', colors: [P.black, P.ink], cx: 192, cy: 150, reach: 260 });
const PROMO_ART = new WeakMap();
const PROMO_NONE = { title: 'GLOBIT 24', tagline: '', presenters: [] };
/** The lock-up baked twice (itself and one palette step darker) per announced programme. */
function promoArt(next, nameOf) {
  let a = next ? PROMO_ART.get(next) : null;
  if (a) return a;
  const n = next || PROMO_NONE;
  const pres = Array.isArray(n.presenters) ? n.presenters : [];
  const info = {
    title: String(n.title || 'GLOBIT 24'),
    tagline: String(n.tagline || ''),
    presenters: pres.map((p) => {
      try {
        return String(nameOf(p) ?? '');
      } catch {
        return String(p ?? '').toUpperCase();
      }
    }),
    channel: 'GLOBIT 24',
    bug: false,
  };
  const id = typeof n.id === 'string' ? n.id : '';
  const full = mk(W, H);
  const L = drawProgrammeLockup(full.getContext('2d'), id, info);
  const dim = mk(W, H);
  const dx = dim.getContext('2d');
  dx.drawImage(full, 0, 0);
  try {
    const img = dx.getImageData(0, 0, W, H);
    stepDown(new Uint32Array(img.data.buffer), 1);
    dx.putImageData(img, 0, 0);
  } catch {
    /* no pixel access: the fade starts on the full colours */
  }
  a = { full, dim, L, id };
  if (next) PROMO_ART.set(next, a);
  return a;
}

/**
 * card = { next: { id, title, tagline, presenters }, label, footer }; nameOf maps a presenter id
 * to the on-air name (the art is built once per card).
 */
export function drawPromoCard(ctx, t, dt, card = {}, nameOf = (id) => String(id || '').toUpperCase()) {
  const c = card || {};
  const next = c.next && typeof c.next === 'object' ? c.next : null;
  const d = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  ctx.drawImage(PROMO_FIELD(), 0, 0);
  const A = promoArt(next, typeof nameOf === 'function' ? nameOf : (id) => String(id || '').toUpperCase());
  if (d < 0.1) return;
  // two palette steps in 0.15 s while the group rises 6 px (eased out), then still
  const off = Math.round((1 - easeOutQuint(seg(d, 0.1, 0.45))) * 6);
  ctx.drawImage(d < 0.25 ? A.dim : A.full, 0, off);
  const L = A.L;
  const tag = ellipsis(c.label || 'UP NEXT', 160, 1);
  if (d >= 0.4) drawText(ctx, tag, L.titleX, L.plateY - 10, S.microFog);
  const footer = c.footer && String(c.footer).toUpperCase() !== 'AFTER THE BREAK' ? ellipsis(c.footer, W - 19 - L.titleX, 1) : '';
  if (footer && d >= 0.55) drawText(ctx, footer, L.titleX, L.bottom + 8, S.microFog);
}

// ---------------------------------------------------------------------------
// IDENT (between programmes and breaks): Europe from orbit with one slow motion,
// the terminator crossing it (cities coming on at dusk, going out at dawn), the
// wordmark arriving by a two-step palette fade over the horizon (opens/ident.js).

/** The channel ident at dt (opts.variant 'dusk' | 'dawn' forces the daypart; default from the London clock). */
export function drawIdentCard(ctx, t, dt, opts = null) {
  drawIdentScene(ctx, dt, opts);
}

// ---------------------------------------------------------------------------
// TITLE CARD (kept for compatibility: a plain programme title card)

export function drawTitleCard(ctx, t, dt, { channel = 'GLOBIT 24', subtitle = '', date = '' } = {}) {
  drawEndCard(ctx, t, dt, { channel, line1: subtitle || '', line2: date || clockIn().date });
}

// ---------------------------------------------------------------------------
// STINGER (0.8 s transition overlay for the open and close, breaks and breaking
// news): three slanted slabs in the set's neutrals (slate, ink, black) sweep
// across, the front one with a 1 px brand-red leading edge, and the logo passes
// in its own colours over the black slab while the frame is covered, so the
// shot can change underneath at the midpoint. No saturated full-frame colour
// (channel-and-breaks.md 5.4; Ofcom flags saturated-red transitions).

const STINGER_LAYERS = [
  { c: P.slate, a: 0.0, b: 0.32, e: 0.68, f: 1.0 },
  { c: P.ink, a: 0.03, b: 0.37, e: 0.63, f: 0.97 },
  { c: P.black, a: 0.06, b: 0.42, e: 0.58, f: 0.94, front: true },
];
const STING = { lead: 0, tail: 0 };
let STING_LOGO = null;

export function drawStinger(ctx, t, p) {
  if (!(p > 0 && p < 1)) return;
  const SL = 0.5;
  const SH = H * SL;
  let front = false;
  for (let i = 0; i < STINGER_LAYERS.length; i++) {
    const L = STINGER_LAYERS[i];
    const lead = lerp(0, W + SH, easeInOut(seg(p, L.a, L.b - L.a)));
    const tail = lerp(0, W + SH, easeInOut(seg(p, L.e, L.f - L.e)));
    if (lead - tail < 1) continue;
    slab(ctx, tail, 0, lead - tail, H, -SL, L.c);
    if (L.front) {
      // the front slab's leading edge: one pixel of brand red
      if (lead < W + SH) slab(ctx, lead - 1, 0, 1, H, -SL, P.red);
      front = true;
      STING.lead = lead;
      STING.tail = tail;
    }
  }
  if (!front) return;
  // the logo glides through while the black slab covers the frame
  const lp = seg(p, 0.26, 0.48);
  if (lp <= 0 || lp >= 1) return;
  const size = STING_LOGO || (STING_LOGO = measureLogo({ variant: 'full', scale: 2 }));
  const drift = Math.round(lerp(14, -14, easeInOut(lp)));
  ctx.save();
  try {
    // clip to the front slab (minus its red edge) so the logo never spills onto the picture
    ctx.beginPath();
    for (let y = 0; y < H; y += 2) {
      const off = Math.floor(y * -SL);
      ctx.rect(Math.round(STING.tail + off), y, Math.max(0, Math.round(STING.lead - STING.tail) - 1), 2);
    }
    ctx.clip();
    drawLogo(ctx, W / 2 + drift, Math.round(H / 2 - size.h / 2), { variant: 'full', scale: 2, align: 'center' });
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Warm the card backdrops in the background (one per timer slice) so the first
// card of the day never stutters.
if (typeof document !== 'undefined' && typeof setTimeout === 'function') {
  // one small job per timer slice (no slice over a few ms): fields, the test card, the ident's
  // pieces, then one ident frame and one start frame on their own
  let scratch = null;
  const sc = () => scratch || (scratch = document.createElement('canvas').getContext('2d'));
  const jobs = [MONTAGE_FIELD, factField, inkField, breakingField, END_FIELD, START_FIELD, PROMO_FIELD, () => testCardLayer('GLOBIT 24'), ...IDENT_WARM,
    () => drawIdentCard(sc(), 0, 2), () => drawStartScreen(sc(), 0, {})];
  let j = 0;
  const step = () => {
    if (j >= jobs.length) return;
    try {
      jobs[j++]();
    } catch {
      j = jobs.length;
    }
    setTimeout(step, 40);
  };
  setTimeout(step, 1500);
}
// keep the old helper name for anything importing it
export { backdrop as cardBackdrop };

// The story boards laid out again for the vertical picture (docs/publishing/vertical.md §3.3). The horizontal boards
// (scenes/cards.js, cards-more.js) are 304-358 px panels; the vertical stage is 216 px wide, so each board is set
// again from its own data, in the same package: a black panel wiped in from the left over 0.3 s, a slate top line, the
// micro kicker in fog, the programme's accent as the one colour (rules, squares, nodes), white type rising into place
// line by line, the source line in micro fog, nothing counted up. MONEY MINUTE keeps its cream paper. The text sizes
// are the channel's three (display 2x or 3x for figures and terms, body 1x, micro), never shrunk to fit: a line that
// would not fit is wrapped, and a board that would not fit the stage loses its source line first (the strap carries
// it), then its last row.
//
//   drawVerticalBoard(ctx, dt, card, { x, y, w, h, programId, accent }) -> true when drawn (false: not a board it knows)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, clipRect, ellipsis, balanceLines, textW } from '../gfx/index.js';
import { parseFigure, boardTitle } from '../scenes/cards.js';
import { shareChart, nextLeaf, initialsOf } from '../scenes/cards-more.js';

const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver: { color: P.silver },
  fog: { color: P.fog },
  ink: { color: P.ink },
  ink2: { color: P.ink, scale: 2 },
  ink3: { color: P.ink, scale: 3 },
  microFog: { color: P.fog, font: 'micro' },
  microSilver: { color: P.silver, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  microInk: { color: P.ink, font: 'micro' },
  microSlate: { color: P.slate, font: 'micro' },
  microBlack: { color: P.black, font: 'micro' },
};
const PROGRAM_ACCENT = { 'world-now': P.red, 'tech-bytes': P.cyan, cosmos: P.magenta, 'money-minute': P.green, 'news-60': P.yellow, 'seven-days': P.pink, 'full-time': P.orange, 'pay-attention': P.purple };
const accentFor = (programId, accent) => accent || PROGRAM_ACCENT[programId] || P.red;
const BIG = new Map();
/** The board's type at a scale: white, or ink on MONEY MINUTE's paper (any scale: a lone figure goes to 4x). */
const styleOf = (scale, ink = false) => {
  if (scale <= 3) return ink ? (scale === 3 ? S.ink3 : scale === 2 ? S.ink2 : S.ink) : scale === 3 ? S.white3 : scale === 2 ? S.white2 : S.white;
  const key = `${scale}|${ink}`;
  if (!BIG.has(key)) BIG.set(key, Object.freeze({ color: ink ? P.ink : P.white, scale }));
  return BIG.get(key);
};
/** Micro text cut to `w` px with dots, measured in the micro face it is drawn in (gfx `ellipsis` measures the body
 * face, wider, and would cut a credit that fits: "SOURCE: GUARDIA…"). */
export function microFit(text, w) {
  let s = String(text ?? '');
  if (measureText(s, 1, 'micro') <= w) return s;
  while (s && measureText(`${s}...`, 1, 'micro') > w) s = s.slice(0, -1).trimEnd();
  return `${s}...`;
}
const srcLine = (source, maxW) => (source ? microFit(`SOURCE: ${String(source).toUpperCase()}`, maxW) : '');

/**
 * On the glass a line is whole or not there: it pops in at its beat (p past half way), never half risen out of its mask,
 * so no frame of a vertical clip, its first above all, shows a line cut in two.
 */
function pop(ctx, text, x, y, p, style) {
  if (p >= 0.5 && text) drawText(ctx, text, x, y, style);
}

/** Text rising into place inside a mask at its own rows (p 0..1), as the channel's boards. */
function rise(ctx, text, x, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    clipRect(ctx, x - 2, y - 3 * scale, 400, h + 3 * scale + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

/** The figures of a board (numbers[] or the fact's leading figure), as cards.js reads them: [{ figure, label, qual }]. */
export function figureRows(fact, numbers) {
  if (Array.isArray(numbers) && numbers.length) {
    const r = [];
    for (let i = 0; i < numbers.length && r.length < 3; i++) {
      const v = String(numbers[i]?.value ?? '').trim();
      if (!v) continue;
      const f = parseFigure(v);
      const qual = String(numbers[i]?.qualifier ?? '').toUpperCase().replace(/\s+/g, ' ').trim() || f.qual;
      r.push({ figure: (f.text ? (f.rest ? `${f.text} ${f.rest}` : f.text) : v).toUpperCase(), label: String(numbers[i]?.label ?? '').toUpperCase().trim(), f, qual });
    }
    if (r.length) return r;
  }
  const raw = typeof fact === 'string' ? fact : String(fact ?? '');
  const f = parseFigure(raw);
  if (f.text) return [{ figure: f.text, label: f.rest, f, qual: f.qual }];
  // a fact that ends on its figure (ECONOMY UP 0.1%): the figure large, the words before it its label
  const m = raw.trim().match(/^(.*\S)\s+([$€£¥]?\d[\d,]*(?:\.\d+)?\s?(?:%|PER ?CENT|[KMB]|MN|BN|TN)?)$/i);
  const t = m ? parseFigure(m[2]) : null;
  return t?.text && !t.rest ? [{ figure: t.text, label: m[1].toUpperCase(), f: t, qual: t.qual }] : [];
}

/** Which board a card is (the horizontal card's own order of precedence, cards.js drawFactCard). */
export function boardKind(o = {}) {
  if (!o) return null;
  if (!o.fact && !(Array.isArray(o.numbers) && o.numbers.length) && !(Array.isArray(o.known) && o.known.length) && !(Array.isArray(o.timeline) && o.timeline.length) && !o.change && o.quote?.text) return 'quote';
  if (o.score?.a && o.score?.b) return 'score';
  if (o.chalk) return 'chalk';
  if (Array.isArray(o.fixtures) && o.fixtures.length >= 2) return 'fixtures';
  if (Array.isArray(o.who) && o.who.length >= 2) return 'who';
  if (o.share?.value && o.share?.label) return 'share';
  if (o.next?.when && o.next?.what) return 'next';
  if (o.term?.term && o.term?.plain) return 'term';
  if (Array.isArray(o.known) && o.known.length >= 2) return 'known';
  if (o.change?.from && o.change?.to && o.change?.label) return 'change';
  if (Array.isArray(o.timeline) && o.timeline.length >= 2) return 'timeline';
  if (o.fact || (Array.isArray(o.numbers) && o.numbers.length)) return 'figures';
  return null;
}

// ---------------------------------------------------------------- layouts
// Every layout is a list of rows { y, h, draw(ctx, x, y, dt) } under a kicker, measured from the panel's top; the
// panel is centred in the stage. Cached per card object (a card's content never changes while it is on air).
//
// On the vertical frame's glass (bare: the compositor's glass and frame stand behind the board, the whole stage) a
// board is set as large as the stage lets it: its words at 2x (T2) when every row fits the stage that way, else at the
// body size (T1), never shrunk past it and never cut; the kicker and the source line in the body face, the kicker in
// the programme's accent.

const LAYOUTS = new WeakMap();
const KICK_Y = 10; // the kicker's caps from the panel's top
// the programmes whose display carries the source in its foot (vset.js frame 'hud'), and the rows that foot takes
const SRC_FOOT = new Set(['cosmos']);
const FOOT_H = 10;
const TOP = 24; // the first row from the panel's top
const PAD = 12;
const TOPB = 27; // bare: under a kicker in the body face
const PADB = 8; // bare: the glass is the panel, its frame the edge
/**
 * On the glass, how far a board's own cascade has run on the shot's first frame (s): its kicker and first four rows
 * whole (a figure with its label, a headline over its figure), so a clip that opens on a board opens on the board, not
 * on its kicker; a fifth row and on pops in at its beat.
 */
export const PRE = 1.6;
/** The body face's two sizes: a block of n lines is n * lh - (lh - cap) tall. */
export const T1 = Object.freeze({ s: 1, lh: 11, cap: 7, gap: 9 });
export const T2 = Object.freeze({ s: 2, lh: 18, cap: 14, gap: 11 });
const blockH = (n, T) => (n ? n * T.lh - (T.lh - T.cap) : 0);
const metrics = (w, bare) => ({ pad: bare ? PADB : PAD, inner: w - 2 * (bare ? PADB : PAD), top: bare ? TOPB : TOP });

function finish(rows, src, w, h, inner, extra = {}, { bare = false, pad = PAD, T = T1 } = {}) {
  // fit the stage: drop the source line, then the last rows
  let list = rows.slice();
  const top = bare ? TOPB : TOP;
  const srcH = bare ? 17 : 15;
  const bottomOf = (l) => (l.length ? l[l.length - 1].y + l[l.length - 1].h : top);
  let s = src;
  let H = bottomOf(list) + (s ? srcH : 0) + 9;
  let dropped = false;
  if (H > h && s) {
    s = '';
    H -= srcH;
    dropped = true;
  }
  while (H > h && list.length > 1) {
    list = list.slice(0, -1);
    H = bottomOf(list) + 9;
    dropped = true;
  }
  return { rows: list, src: s, srcY: bottomOf(list) + 6, PH: H, inner, PW: w, pad, bare, T, dropped, ...extra };
}

function srcFor(source, inner, bare) {
  if (!source) return '';
  const s = `SOURCE: ${String(source).toUpperCase()}`;
  return bare ? ellipsis(s, inner, 1) : srcLine(source, inner);
}

function layoutFigures(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const rows = figureRows(o.fact, o.numbers);
  const paper = programId === 'money-minute';
  const out = [];
  let y = top;
  if (paper && o.headline) {
    const title = balanceLines(String(o.headline), inner, T.s, 2);
    out.push({ y, h: blockH(title.length, T), kind: 'title', lines: title, T });
    y += blockH(title.length, T) + 6;
    out.push({ y, h: 1, kind: 'rule' });
    y += 8;
  }
  const opt = { bare, pad, T };
  if (!rows.length) {
    // a fact without a figure: its words at 2x when they fit three lines (four on the glass), else 1x
    const big = balanceLines(String(o.fact || ''), inner, 2, bare ? 4 : 3);
    const two = !big[big.length - 1]?.endsWith('...');
    const lines = two ? big : balanceLines(String(o.fact || ''), inner, 1, 6);
    const lh = two ? 18 : 11;
    out.push({ y, h: lines.length * lh - (lh - 7 * (two ? 2 : 1)), kind: 'text', lines, scale: two ? 2 : 1, lh });
    return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: ellipsis(o.label || 'KEY FACT', inner, 1), paper }, opt);
  }
  // one figure: 3x when it fits (4x on the glass at 2x); two or three: the size every one of them fits (never one
  // big, one small)
  const fits = (s) => rows.every((r) => textW(r.figure, s) <= inner);
  const scale = rows.length === 1 && T.s === 2 && fits(4) ? 4 : rows.length === 1 && fits(3) ? 3 : T.s === 2 && fits(3) ? 3 : fits(2) ? 2 : 1;
  const qh = bare ? 10 : 7;
  // the labels a size under their figures (a 2x figure keeps 1x labels: the figure leads)
  const TL = T.s === 2 && scale >= 3 ? T2 : T1;
  for (const r of rows) {
    const qual = r.qual ? ellipsis(r.qual, inner, 1) : '';
    const fig = ellipsis(r.figure, inner, scale);
    const label = r.label ? balanceLines(r.label, inner, TL.s, 2) : [];
    const rh = (qual ? qh : 0) + 7 * scale + 5 + 1 + (label.length ? 6 + blockH(label.length, TL) : 0);
    out.push({ y, h: rh, kind: 'figure', qual, qh, fig, figW: textW(fig, scale), scale, label, T: TL });
    y += rh + 10;
  }
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: ellipsis(boardTitle('numbers', { programId, kicker: o.label }) || 'BY THE NUMBERS', inner, 1), paper }, opt);
}

function layoutKnown(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const points = o.known.slice(0, 3).map((p) => String(p));
  const bullet = T.s === 2 ? 12 : 9;
  const tw = inner - bullet;
  const out = [];
  let y = top;
  for (const p of points) {
    const lines = balanceLines(p, tw, T.s, 4);
    out.push({ y, h: blockH(lines.length, T), kind: 'point', lines, T, bullet });
    y += blockH(lines.length, T) + T.gap;
  }
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: 'WHAT WE KNOW' }, { bare, pad, T });
}

// HOW THE WEEK UNFOLDED (SEVEN DAYS), set for the tall frame as on air: the week's diary, up to five days, oldest
// first, the day at 2x in its own column (right-aligned on the widest, WED), a node on the rail beside it, the day's
// headline beside the rail at 1x on up to three lines (never cut). Only when every day is a day's name that fits the
// column; a dated step falls back to the timeline (the date over its words).
function layoutWeek(o, w, h, programId, { bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const steps = o.timeline.slice(0, 5);
  const dayW = textW('WED', 2);
  const days = steps.map((p) => String(p.when).toUpperCase().trim());
  if (!days.every((d) => d && textW(d, 2) <= dayW)) return null;
  const railX = dayW + 6;
  const textX = railX + 7;
  const tw = inner - textX;
  const out = [];
  let y = top;
  steps.forEach((p, i) => {
    const lines = balanceLines(String(p.what).trim(), tw, 1, 3);
    const rh = Math.max(14, lines.length * 11 - 4);
    out.push({ y, h: rh, kind: 'day', when: days[i], lines, dayW, railX, textX });
    y += rh + (bare ? 12 : 8);
  });
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: ellipsis(boardTitle('timeline', { programId }), inner, 1) }, { bare, pad, T: T1 });
}

function layoutTimeline(o, w, h, programId, { T = T1, bare = false } = {}) {
  if (programId === 'seven-days') {
    const week = layoutWeek(o, w, h, programId, { bare });
    if (week) return week;
  }
  const { pad, inner, top } = metrics(w, bare);
  const steps = o.timeline.slice(0, 3);
  const tx = 14; // the words' column right of the rail
  const tw = inner - tx;
  const dates = steps.map((p) => String(p.when).toUpperCase().replace(/\b(JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\b/g, '$1').replace(/\s+/g, ' ').trim());
  const ws = dates.every((d) => textW(d, 2) <= tw) ? 2 : 1;
  const out = [];
  let y = top;
  steps.forEach((p, i) => {
    const when = ellipsis(dates[i], tw, ws);
    const lines = balanceLines(String(p.what), tw, T.s, 3);
    const rh = 7 * ws + 5 + blockH(lines.length, T);
    out.push({ y, h: rh, kind: 'step', when, ws, lines, tx, T });
    y += rh + 10;
  });
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: ellipsis(boardTitle('timeline', { programId }), inner, 1) }, { bare, pad, T });
}

const SCALE_WORDS = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, mn: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };
function numOf(v) {
  const m = String(v).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion|bn|mn|tn|k|m|b)?\b/i);
  return m ? Number(m[1]) * (m[2] ? SCALE_WORDS[m[2].toLowerCase()] : 1) : NaN;
}

function layoutChange(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const c = o.change;
  const from = String(c.from).toUpperCase();
  const to = String(c.to).toUpperCase();
  const fit = (s) => textW(from, s) <= inner && textW(to, s) <= inner;
  const vs = T.s === 2 && fit(4) ? 4 : fit(3) ? 3 : fit(2) ? 2 : 1;
  const up = numOf(c.to) > numOf(c.from) ? 'UP' : numOf(c.to) < numOf(c.from) ? 'DOWN' : '';
  const lab = bare ? 9 : 7;
  const out = [];
  let y = top;
  out.push({ y, h: lab + 2 + 7 * vs, kind: 'from', text: ellipsis(from, inner, vs), vs, lab });
  y += lab + 2 + 7 * vs + 6;
  out.push({ y, h: 12, kind: 'arrow' });
  y += 12 + 6;
  out.push({ y, h: lab + 2 + 7 * vs, kind: 'to', text: ellipsis(to, inner, vs), vs, up, lab });
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: ellipsis(String(c.label).toUpperCase(), inner, 1) }, { bare, pad, T });
}

function layoutTerm(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const term = String(o.term.term).toUpperCase();
  const ts = textW(term, 3) <= inner ? 3 : 2;
  // (the term whole, on up to three lines: "LARGE LANGUAGE..." lost its last word)
  let tls = ts;
  let tl = balanceLines(term, inner, ts, 3);
  if (tl[tl.length - 1]?.endsWith('...')) {
    tls = 1;
    tl = balanceLines(term, inner, 1, 3);
  }
  const plain = balanceLines(String(o.term.plain), inner, T.s, 6);
  // (on the glass at 2x the board is the caption, the voice reading it: when its lines would not fit at the usual
  // spacing they close up under the kicker and the rule, before the whole board drops to the body size)
  const build = (y0, g1, g2) => {
    const out = [];
    let y = y0;
    out.push({ y, h: tl.length * (7 * tls + 4) - 4, kind: 'term', lines: tl, ts: tls });
    y += tl.length * (7 * tls + 4) - 4 + g1;
    out.push({ y, h: 1, kind: 'accentRule' });
    y += g2;
    out.push({ y, h: blockH(plain.length, T), kind: 'lines', lines: plain, T });
    return out;
  };
  const opt = { bare, pad, T };
  let L = finish(build(top, 6, 8), '', w, h, inner, { kicker: 'IN PLAIN ENGLISH' }, opt);
  if (L.dropped && bare && T.s === 2) {
    // (the kicker goes up with the rows, so a tilde over the term never meets it: EL NIÑO)
    const tight = finish(build(top - 5, 5, 6), '', w, h, inner, { kicker: 'IN PLAIN ENGLISH', kickY: KICK_Y - 6 }, opt);
    if (!tight.dropped) L = tight;
  }
  return L;
}

function layoutQuote(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const text = `${String(o.quote.text).replace(/^["“'‘]+|["”'’]+$/g, '')}`;
  const big = balanceLines(text, inner, 2, T.s === 2 ? 6 : 4);
  const two = !big[big.length - 1]?.endsWith('...');
  const lines = two ? big : balanceLines(text, inner, 1, 9);
  const lh = two ? 18 : 11;
  const out = [];
  let y = top + 2;
  out.push({ y, h: 6, kind: 'mark' });
  y += 12;
  out.push({ y, h: lines.length * lh - (lh - 7 * (two ? 2 : 1)), kind: 'quote', lines, scale: two ? 2 : 1, lh });
  y += lines.length * lh - (lh - 7 * (two ? 2 : 1)) + 8;
  if (o.quote.by) out.push({ y, h: 7, kind: 'by', text: ellipsis(`— ${String(o.quote.by).toUpperCase()}`, inner, 1) });
  return finish(out, '', w, h, inner, { kicker: 'IN THEIR WORDS' }, { bare, pad, T });
}

function layoutWho(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const big = T.s === 2;
  const box = big ? 30 : 24;
  const tw = inner - box - 8;
  const nh = big ? 17 : 10; // a name line's pitch
  const out = [];
  let y = top;
  for (const p of o.who.slice(0, 3)) {
    const name = balanceLines(String(p.name).toUpperCase(), tw, big ? 2 : 1, 2);
    const role = balanceLines(String(p.role || '').toUpperCase(), tw, 1, 2);
    const th = name.length * nh - (big ? 3 : 0) + (role.length ? 3 + role.length * 9 : 0);
    const rh = Math.max(box, th);
    out.push({ y, h: rh, kind: 'person', ini: initialsOf(p.name), name, role, T: box, tw, nh, ns: big ? 2 : 1, ty: Math.round((rh - th) / 2) });
    y += rh + (big ? 10 : 8);
  }
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: "WHO'S WHO" }, { bare, pad, T });
}

function layoutShare(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const s = o.share;
  const chart = shareChart(s.value, s.fraction);
  const value = String(s.value).toUpperCase();
  const vs = T.s === 2 && textW(value, 4) <= inner ? 4 : textW(value, 3) <= inner ? 3 : textW(value, 2) <= inner ? 2 : 1;
  const out = [];
  let y = top;
  if (s.lead) {
    const lead = balanceLines(String(s.lead), inner, T.s, 2);
    out.push({ y, h: blockH(lead.length, T), kind: 'lead', lines: lead, T });
    y += blockH(lead.length, T) + 7;
  }
  if (chart.kind !== 'none') {
    const perRow = chart.kind === 'people' ? Math.min(chart.of, 12) : 10;
    const gh = chart.kind === 'people' ? 20 : 39;
    out.push({ y, h: gh, kind: 'chart', chart, perRow });
    y += gh + 8;
  }
  const qh = bare ? 10 : 8;
  out.push({ y, h: (s.qualifier ? qh : 0) + 7 * vs, kind: 'value', value: ellipsis(value, inner, vs), vs, qh, qual: s.qualifier ? ellipsis(String(s.qualifier).toUpperCase(), inner, 1) : '' });
  y += (s.qualifier ? qh : 0) + 7 * vs + 6;
  // (the label whole, never cut with dots: "COVERED IN..." loses what it is covered in; a label too long for the
  // stage at 2x drops the 2x layout, and the board is set at the body size)
  const label = balanceLines(String(s.label), inner, T.s, 6);
  out.push({ y, h: blockH(label.length, T), kind: 'lines', lines: label, T });
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: 'IN PROPORTION' }, { bare, pad, T });
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
/**
 * The calendar leaf (scenes/cards-more.js nextLeaf), a loose "28 OCTOBER" read as the date it is: the day large under
 * the month's three letters, as a dated step shows it (the leaf's 36 px would cut OCTOBER to OCTOB...).
 */
function vLeaf(next) {
  const l = nextLeaf(next);
  if (l.big || !/^\d{1,2}$/.test(l.head)) return l;
  const m = MONTHS.find((x) => x === l.foot || (l.foot.length >= 3 && x.startsWith(l.foot)));
  return m ? { head: m.slice(0, 3), big: l.head, foot: '', line: '' } : l;
}

function layoutNext(o, w, h, programId, { T = T1, bare = false } = {}) {
  const { pad, inner, top } = metrics(w, bare);
  const leaf = vLeaf(o.next);
  const LW = 40;
  const LH = 46;
  if (T.s === 2) {
    // on the glass: the calendar leaf over the words, the words at 2x across the board (a tall board for a tall frame;
    // a leaf with no weekday under its day is 6 rows shorter)
    const lines = balanceLines(String(o.next.what), inner, 2, 4);
    if (!lines[lines.length - 1]?.endsWith('...')) {
      // (the date in words beside the leaf, not under it: WEDNESDAY 28 OCTOBER, TODAY or TOMORROW before it)
      const said = leaf.big && leaf.line ? balanceLines(leaf.line, inner - LW - 10, 1, 3) : [];
      const lh2 = leaf.big && leaf.foot ? LH : 40;
      const out = [];
      let y = top;
      out.push({ y, h: lh2, kind: 'leaf', leaf, LW, LH: lh2, lines: said, lh: 11, big: false, tw: inner - LW - 10, ty: Math.round((lh2 - (said.length * 11 - 4)) / 2) });
      y += lh2 + 6;
      out.push({ y, h: blockH(lines.length, T2), kind: 'lines', lines, T: T2 });
      return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: 'WHAT HAPPENS NEXT' }, { bare, pad, T });
    }
  }
  const tw = inner - LW - 10;
  const two = balanceLines(String(o.next.what), tw, 2, T.s === 2 ? 4 : 3);
  const big = !two[two.length - 1]?.endsWith('...');
  const lines = big ? two : balanceLines(String(o.next.what), tw, 1, 5);
  const lh = big ? 18 : 11;
  const line = leaf.big && leaf.line ? ellipsis(leaf.line, inner, 1) : '';
  const out = [];
  let y = top;
  const th = lines.length * lh - (lh - 7 * (big ? 2 : 1));
  out.push({ y, h: Math.max(LH, th), kind: 'leaf', leaf, LW, LH, lines, lh, big, tw, ty: Math.round((Math.max(LH, th) - th) / 2) });
  y += Math.max(LH, th) + 7;
  if (line) out.push({ y, h: bare ? 7 : 5, kind: 'micro', text: line });
  return finish(out, srcFor(o.source, inner, bare), w, h, inner, { kicker: 'WHAT HAPPENS NEXT' }, { bare, pad, T });
}

const BUILDERS = { figures: layoutFigures, known: layoutKnown, timeline: layoutTimeline, change: layoutChange, term: layoutTerm, quote: layoutQuote, who: layoutWho, share: layoutShare, next: layoutNext };

/**
 * The board's layout for a stage of w x h (cached per card). Bare (on the vertical frame's glass): at 2x when every row
 * and the source fit the stage that way, else at the body size.
 */
export function verticalBoardLayout(card, w, h, programId = '', bare = false) {
  const kind = boardKind(card);
  if (!kind || !BUILDERS[kind]) return null;
  let per = LAYOUTS.get(card);
  const key = `${kind}|${w}|${h}|${programId}|${bare ? 1 : 0}`;
  if (per?.key === key) return per.L;
  let L = null;
  // COSMOS's display carries the source in its foot, under the rows, as an instrument's caption (SRC_FOOT): the rows
  // are laid out without it, in the height above it, so its figures and words keep their large size
  const foot = bare && SRC_FOOT.has(programId) && card.source ? srcFor(card.source, w - 2 * PADB, true) : '';
  const c = foot ? { ...card, source: '' } : card;
  const hh = foot ? h - FOOT_H : h;
  if (bare) {
    const big = BUILDERS[kind](c, w, hh, programId, { T: T2, bare: true });
    if (big && !big.dropped) L = { kind, ...big };
  }
  L ||= { kind, ...BUILDERS[kind](c, w, hh, programId, { T: T1, bare }) };
  if (foot) L.foot = foot;
  LAYOUTS.set(card, { key, L });
  return L;
}

// ---------------------------------------------------------------- drawing

const QUOTE_MARK = ['..##..##', '.##..##.', '##..##..', '########', '########', '.##..##.'];
const FIGURE = ['.###.', '.###.', '.###.', '.....', '#####', '#####', '#####', '#####', '.#.#.', '.#.#.'];

function person(ctx, x, y, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < FIGURE.length; r++) for (let c = 0; c < 5; c++) if (FIGURE[r][c] === '#') ctx.fillRect(x + c * 2, y + r * 2, 2, 2);
}

/**
 * Draw the board of `card` in the stage box { x, y, w, h } on its own clock dt (s since the board's cut). Returns
 * false when the card is not a board this module lays out (the caller then shows something else).
 */
export function drawVerticalBoard(ctx, dt0, card, { x, y, w, h, programId = '', accent = null, bare = false } = {}) {
  // (bare: the board's cascade is pre-rolled by PRE, so its kicker and first rows are whole on the shot's first frame:
  // a clip that opens on a board opens on a composed frame; nothing on a story board follows the voice)
  const dt = bare ? dt0 + PRE : dt0;
  const R = bare ? pop : rise;
  const PW = w - 16;
  const L = verticalBoardLayout(card, PW, h - 8, programId, bare);
  if (!L) return false;
  const acc = accentFor(programId, accent);
  const paper = !!L.paper;
  const PX = x + 8;
  // (the rows centred in the height above the foot's source line when the display carries one)
  const hb = L.foot ? h - FOOT_H : h;
  const PY = y + clamp(Math.round((hb - L.PH) / 2), 4, Math.max(4, hb - L.PH - 4));
  // (bare: the glass and its frame are already there, whole from the shot's first frame: nothing wipes in)
  const vis = bare ? PW : Math.round(PW * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return true;
  const tx = PX + L.pad;
  const ink = paper;
  const textStyle = paper ? S.ink : S.white;
  const lineStyle = (T) => styleOf(T?.s || 1, ink);
  ctx.save();
  try {
    // MONEY MINUTE's paper: cream, an ink edge on the right and the foot (on the glass: the whole sheet, the glass's
    // height, the board's rows centred on it; no small card floating in the screen)
    const sheet = paper && bare ? { y: y + 4, h: h - 8 } : { y: PY, h: L.PH };
    clipRect(ctx, PX, sheet.y, vis, sheet.h);
    if (paper) {
      ctx.fillStyle = P.cream;
      ctx.fillRect(PX, sheet.y, PW, sheet.h);
      ctx.fillStyle = P.tan;
      ctx.fillRect(PX + PW - 1, sheet.y + 1, 1, sheet.h - 1);
      ctx.fillRect(PX + 1, sheet.y + sheet.h - 1, PW - 1, 1);
    } else if (!bare) {
      ctx.fillStyle = P.black;
      ctx.fillRect(PX, PY, PW, L.PH);
      ctx.fillStyle = P.slate;
      ctx.fillRect(PX, PY, PW, 1);
    }
    // the kicker: micro fog on the channel's panel; on the glass, the body face in the programme's accent
    const ky = PY + (L.kickY ?? KICK_Y);
    if (bare) drawText(ctx, L.kicker, tx, ky, { color: paper ? P.darkGreen : acc === P.purple ? P.fog : acc });
    else drawText(ctx, L.kicker, tx, ky, paper ? S.microSlate : S.microFog);
    const rule = paper ? P.darkGreen : acc;
    L.rows.forEach((r, i) => {
      const ry = PY + r.y;
      const at = 0.3 + i * 0.4;
      switch (r.kind) {
        case 'title':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * r.T.lh, seg(dt, 0.25 + k * 0.07, 0.34), lineStyle(r.T)));
          break;
        case 'rule': {
          const rw = Math.round(L.inner * easeOutQuint(seg(dt, 0.35, 0.3)));
          if (rw > 0) {
            ctx.fillStyle = rule;
            ctx.fillRect(tx, ry, rw, 1);
          }
          break;
        }
        case 'text':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * r.lh, seg(dt, at + k * 0.07, 0.34), styleOf(r.scale, ink)));
          break;
        case 'figure': {
          let fy = ry;
          if (r.qual) {
            drawText(ctx, r.qual, tx, fy, L.bare ? (paper ? S.ink : S.silver) : paper ? S.microSlate : S.microSilver);
            fy += r.qh;
          }
          const ruleY = fy + 7 * r.scale + 5;
          const rw = Math.round(r.figW * easeOutQuint(seg(dt, at, 0.25)));
          if (rw > 0) {
            ctx.fillStyle = rule;
            ctx.fillRect(tx, ruleY, rw, 1);
          }
          if (dt >= at + 0.35) drawText(ctx, r.fig, tx, fy, styleOf(r.scale, ink));
          r.label.forEach((ln, k) => R(ctx, ln, tx, ruleY + 7 + k * r.T.lh, seg(dt, at + 0.4 + k * 0.07, 0.34), lineStyle(r.T)));
          break;
        }
        case 'point': {
          if (dt < at) break;
          const b = r.T.s === 2 ? 4 : 3;
          ctx.fillStyle = acc;
          ctx.fillRect(tx, ry + (r.T.s === 2 ? 5 : 2), b, b);
          r.lines.forEach((ln, k) => R(ctx, ln, tx + r.bullet, ry + k * r.T.lh, seg(dt, at + 0.05 + k * 0.07, 0.34), lineStyle(r.T)));
          break;
        }
        case 'step': {
          // the rail down the steps, a node each, the date rising beside it and what happened under the date
          const railX = tx + 3;
          if (i < L.rows.length - 1) {
            const next = PY + L.rows[i + 1].y;
            const len = Math.round((next - ry) * easeOutQuint(seg(dt, at + 0.2, 0.4)));
            if (len > 0) {
              ctx.fillStyle = P.slate;
              ctx.fillRect(railX, ry + 4, 1, len);
            }
          }
          if (dt < at) break;
          ctx.fillStyle = acc;
          ctx.fillRect(railX - 1, ry + (r.ws === 2 ? 5 : 2), 3, 3);
          R(ctx, r.when, tx + r.tx, ry, seg(dt, at + 0.05, 0.34), styleOf(r.ws));
          r.lines.forEach((ln, k) => R(ctx, ln, tx + r.tx, ry + 7 * r.ws + 5 + k * r.T.lh, seg(dt, at + 0.12 + k * 0.07, 0.34), lineStyle(r.T)));
          break;
        }
        case 'day': {
          // the week's diary: the rail drawn down to the next day's node, the node, the day rising right-aligned in
          // its column, the day's headline rising beside the rail
          const railX = tx + r.railX;
          if (i < L.rows.length - 1) {
            const next = PY + L.rows[i + 1].y;
            const len = Math.round((next - ry) * easeOutQuint(seg(dt, at + 0.2, 0.4)));
            if (len > 0) {
              ctx.fillStyle = P.slate;
              ctx.fillRect(railX, ry + 6, 1, len);
            }
          }
          if (dt < at) break;
          ctx.fillStyle = acc;
          ctx.fillRect(railX - 1, ry + 5, 3, 3);
          R(ctx, r.when, tx + r.dayW - textW(r.when, 2), ry, seg(dt, at + 0.04, 0.34), S.white2);
          r.lines.forEach((ln, k) => R(ctx, ln, tx + r.textX, ry + 4 + k * 11 - (r.lines.length > 1 ? 4 : 0), seg(dt, at + 0.12 + k * 0.07, 0.34), S.white));
          break;
        }
        case 'from':
          drawText(ctx, 'FROM', tx, ry, L.bare ? S.fog : S.microFog);
          R(ctx, r.text, tx, ry + r.lab + 2, seg(dt, 0.3, 0.34), styleOf(r.vs));
          break;
        case 'arrow': {
          const p = easeOutQuint(seg(dt, 0.55, 0.3));
          const len = Math.round(9 * p);
          if (len > 0) {
            ctx.fillStyle = acc;
            ctx.fillRect(tx + 5, ry, 1, len);
            if (p >= 1) {
              ctx.fillRect(tx + 3, ry + 8, 5, 1);
              ctx.fillRect(tx + 4, ry + 9, 3, 1);
              ctx.fillRect(tx + 5, ry + 10, 1, 1);
            }
          }
          break;
        }
        case 'to':
          if (dt < 0.8) break;
          drawText(ctx, r.up ? `TO · ${r.up}` : 'TO', tx, ry, L.bare ? S.fog : S.microFog);
          R(ctx, r.text, tx, ry + r.lab + 2, seg(dt, 0.85, 0.34), styleOf(r.vs));
          break;
        case 'term':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * (7 * r.ts + 4), seg(dt, 0.3 + k * 0.08, 0.34), styleOf(r.ts)));
          break;
        case 'accentRule': {
          const rw = Math.round(L.inner * easeOutQuint(seg(dt, 0.5, 0.3)));
          if (rw > 0) {
            ctx.fillStyle = acc;
            ctx.fillRect(tx, ry, rw, 1);
          }
          break;
        }
        case 'lines':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * (r.T?.lh || 11), seg(dt, at + k * 0.07, 0.34), lineStyle(r.T)));
          break;
        case 'lead':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * (r.T?.lh || 11), seg(dt, 0.3 + k * 0.07, 0.34), { color: P.silver, scale: r.T?.s || 1 }));
          break;
        case 'mark':
          ctx.fillStyle = acc;
          for (let yy = 0; yy < QUOTE_MARK.length; yy++) for (let xx = 0; xx < 8; xx++) if (QUOTE_MARK[yy][xx] === '#') ctx.fillRect(tx + xx, ry + yy, 1, 1);
          break;
        case 'quote':
          r.lines.forEach((ln, k) => R(ctx, ln, tx, ry + k * r.lh, seg(dt, 0.35 + k * 0.08, 0.34), styleOf(r.scale)));
          break;
        case 'by':
          R(ctx, r.text, tx, ry, seg(dt, 0.6, 0.34), S.fog);
          break;
        case 'person': {
          if (dt < at) break;
          const p = easeOutQuint(seg(dt, at, 0.3));
          const ty = ry + Math.round((1 - p) * 6);
          ctx.save();
          try {
            clipRect(ctx, tx - 1, ry - 1, r.T + 2, r.T + 2);
            ctx.fillStyle = P.slate;
            ctx.fillRect(tx, ty, r.T, r.T);
            ctx.fillStyle = P.ink;
            ctx.fillRect(tx + 1, ty + 1, r.T - 2, r.T - 2);
            ctx.fillStyle = acc;
            ctx.fillRect(tx, ty + r.T - 2, r.T, 2);
            const is = textW(r.ini, 2) <= r.T - 6 ? 2 : 1;
            drawText(ctx, r.ini, tx + ((r.T - textW(r.ini, is)) >> 1), ty + (is === 2 ? 4 : 8), styleOf(is));
          } finally {
            ctx.restore();
          }
          const nx = tx + r.T + 8;
          const nb = r.name.length * r.nh - (r.ns === 2 ? 3 : 0);
          r.name.forEach((ln, k) => R(ctx, ln, nx, ry + r.ty + k * r.nh, seg(dt, at + 0.12 + k * 0.06, 0.34), styleOf(r.ns)));
          r.role.forEach((ln, k) => R(ctx, ln, nx, ry + r.ty + nb + 3 + k * 9, seg(dt, at + 0.22 + k * 0.06, 0.34), S.fog));
          break;
        }
        case 'chart': {
          const sweep = easeOutQuint(seg(dt, 0.35, 0.6));
          if (r.chart.kind === 'people') {
            const n = r.chart.of;
            const per = Math.min(n, 12);
            const pitch = Math.min(14, Math.floor((L.inner + 4) / per));
            const edge = tx + Math.round(per * pitch * sweep);
            for (let k = 0; k < n; k++) {
              const px = tx + (k % per) * pitch;
              if (px + 10 > edge) continue;
              person(ctx, px, ry, k < r.chart.n ? acc : P.slate);
            }
          } else {
            const edge = tx + Math.round(40 * sweep);
            for (let k = 0; k < 100; k++) {
              const px = tx + (k % 10) * 4;
              if (px + 3 > edge) continue;
              ctx.fillStyle = k < r.chart.lit ? acc : P.slate;
              ctx.fillRect(px, ry + Math.floor(k / 10) * 4, 3, 3);
            }
          }
          break;
        }
        case 'value':
          if (r.qual && dt >= 0.6) drawText(ctx, r.qual, tx, ry, L.bare ? S.fog : S.microFog);
          if (dt >= 0.95) R(ctx, r.value, tx, ry + (r.qual ? r.qh : 0), seg(dt, 0.95, 0.3), styleOf(r.vs));
          break;
        case 'leaf': {
          const p = easeOutQuint(seg(dt, 0.3, 0.4));
          if (p > 0) {
            const ly = ry - Math.round((1 - p) * 8);
            ctx.save();
            try {
              clipRect(ctx, tx, ry - 1, r.LW, r.LH + 1);
              ctx.fillStyle = P.silver;
              ctx.fillRect(tx, ly, r.LW, r.LH);
              ctx.fillStyle = acc;
              ctx.fillRect(tx, ly, r.LW, 10);
              ctx.fillStyle = P.black;
              ctx.fillRect(tx + 8, ly - 1, 2, 3);
              ctx.fillRect(tx + r.LW - 10, ly - 1, 2, 3);
              const head = ellipsis(r.leaf.head, r.LW - 4, 1);
              drawText(ctx, head, tx + ((r.LW - measureText(head, 1, 'micro')) >> 1), ly + 3, S.microBlack);
              if (r.leaf.big) {
                const bs = textW(r.leaf.big, 3) <= r.LW - 4 ? 3 : 2;
                drawText(ctx, r.leaf.big, tx + ((r.LW - textW(r.leaf.big, bs)) >> 1), ly + (bs === 3 ? 13 : 16), styleOf(bs, true));
                if (r.leaf.foot) drawText(ctx, r.leaf.foot, tx + ((r.LW - measureText(r.leaf.foot, 1, 'micro')) >> 1), ly + 38, S.microInk);
              } else if (textW(r.leaf.foot, 1) <= r.LW - 4) {
                drawText(ctx, r.leaf.foot, tx + ((r.LW - textW(r.leaf.foot, 1)) >> 1), ly + 24, S.ink);
              } else {
                // (a long word in the micro face, whole, before any dots)
                const foot = microFit(r.leaf.foot, r.LW - 4);
                drawText(ctx, foot, tx + ((r.LW - measureText(foot, 1, 'micro')) >> 1), ly + 25, S.microInk);
              }
            } finally {
              ctx.restore();
            }
          }
          const wx = tx + r.LW + 10;
          r.lines.forEach((ln, k) => R(ctx, ln, wx, ry + r.ty + k * r.lh, seg(dt, 0.7 + k * 0.08, 0.34), r.big ? S.white2 : S.white));
          break;
        }
        case 'micro':
          R(ctx, r.text, tx, ry, seg(dt, 0.55, 0.34), L.bare ? S.white : S.microWhite);
          break;
        default:
          break;
      }
    });
    if (L.src) drawText(ctx, L.src, tx, PY + L.srcY, L.bare ? (paper ? { color: P.slate } : S.fog) : paper ? S.microSlate : S.microFog);
  } finally {
    ctx.restore();
  }
  // (the foot's source outside the rows' clip, whole from the first frame, as the display's own caption)
  if (L.foot) drawText(ctx, L.foot, tx, y + h - FOOT_H - 4, S.fog);
  return true;
}

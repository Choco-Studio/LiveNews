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
const styleOf = (scale, ink = false) => (ink ? (scale === 3 ? S.ink3 : scale === 2 ? S.ink2 : S.ink) : scale === 3 ? S.white3 : scale === 2 ? S.white2 : S.white);
const srcLine = (source, maxW) => (source ? ellipsis(`SOURCE: ${String(source).toUpperCase()}`, maxW, 1) : '');

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
  const f = parseFigure(typeof fact === 'string' ? fact : String(fact ?? ''));
  return f.text ? [{ figure: f.text, label: f.rest, f, qual: f.qual }] : [];
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

const LAYOUTS = new WeakMap();
const KICK_Y = 10; // the kicker's caps (micro, 5 px) from the panel's top
const TOP = 24; // the first row from the panel's top
const PAD = 12;

function finish(rows, src, w, h, inner, extra = {}) {
  // fit the stage: drop the source line, then the last rows
  let list = rows.slice();
  const bottomOf = (l) => (l.length ? l[l.length - 1].y + l[l.length - 1].h : TOP);
  let s = src;
  let H = bottomOf(list) + (s ? 15 : 0) + 9;
  if (H > h && s) {
    s = '';
    H -= 15;
  }
  while (H > h && list.length > 1) {
    list = list.slice(0, -1);
    H = bottomOf(list) + 9;
  }
  return { rows: list, src: s, srcY: bottomOf(list) + 6, PH: H, inner, PW: w, ...extra };
}

function layoutFigures(o, w, h, programId) {
  const inner = w - 2 * PAD;
  const rows = figureRows(o.fact, o.numbers);
  const paper = programId === 'money-minute';
  const out = [];
  let y = TOP;
  if (paper && o.headline) {
    const title = balanceLines(String(o.headline), inner, 1, 2);
    out.push({ y, h: title.length * 11 - 4, kind: 'title', lines: title });
    y += title.length * 11 - 4 + 6;
    out.push({ y, h: 1, kind: 'rule' });
    y += 8;
  }
  if (!rows.length) {
    // a fact without a figure: its words at 2x when they fit three lines, else 1x
    const big = balanceLines(String(o.fact || ''), inner, 2, 3);
    const two = !big[big.length - 1]?.endsWith('...');
    const lines = two ? big : balanceLines(String(o.fact || ''), inner, 1, 6);
    const lh = two ? 18 : 11;
    out.push({ y, h: lines.length * lh - (lh - 7 * (two ? 2 : 1)), kind: 'text', lines, scale: two ? 2 : 1, lh });
    return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: ellipsis(o.label || 'KEY FACT', inner, 1), paper });
  }
  // one figure: 3x when it fits; two or three: the size every one of them fits (never one big, one small)
  const scale = rows.every((r) => textW(r.figure, 3) <= inner) && rows.length === 1 ? 3 : rows.every((r) => textW(r.figure, 2) <= inner) ? 2 : 1;
  for (const r of rows) {
    const qual = r.qual ? ellipsis(r.qual, inner, 1) : '';
    const fig = ellipsis(r.figure, inner, scale);
    const label = r.label ? balanceLines(r.label, inner, 1, 2) : [];
    const rh = (qual ? 7 : 0) + 7 * scale + 5 + 1 + (label.length ? 6 + label.length * 11 - 4 : 0);
    out.push({ y, h: rh, kind: 'figure', qual, fig, figW: textW(fig, scale), scale, label });
    y += rh + 10;
  }
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: ellipsis(boardTitle('numbers', { programId, kicker: o.label }) || 'BY THE NUMBERS', inner, 1), paper });
}

function layoutKnown(o, w, h) {
  const inner = w - 2 * PAD;
  const points = o.known.slice(0, 3).map((p) => String(p));
  const tw = inner - 9;
  const out = [];
  let y = TOP;
  for (const p of points) {
    const lines = balanceLines(p, tw, 1, 4);
    out.push({ y, h: lines.length * 11 - 4, kind: 'point', lines });
    y += lines.length * 11 - 4 + 9;
  }
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: 'WHAT WE KNOW' });
}

function layoutTimeline(o, w, h, programId) {
  const inner = w - 2 * PAD;
  const steps = o.timeline.slice(0, 3);
  const tx = 14; // the words' column right of the rail
  const tw = inner - tx;
  const dates = steps.map((p) => String(p.when).toUpperCase().replace(/\b(JAN|FEB|MAR|APR|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\b/g, '$1').replace(/\s+/g, ' ').trim());
  const ws = dates.every((d) => textW(d, 2) <= tw) ? 2 : 1;
  const out = [];
  let y = TOP;
  steps.forEach((p, i) => {
    const when = ellipsis(dates[i], tw, ws);
    const lines = balanceLines(String(p.what), tw, 1, 3);
    const rh = 7 * ws + 5 + lines.length * 11 - 4;
    out.push({ y, h: rh, kind: 'step', when, ws, lines, tx });
    y += rh + 10;
  });
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: ellipsis(boardTitle('timeline', { programId }), inner, 1) });
}

const SCALE_WORDS = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, mn: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };
function numOf(v) {
  const m = String(v).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion|bn|mn|tn|k|m|b)?\b/i);
  return m ? Number(m[1]) * (m[2] ? SCALE_WORDS[m[2].toLowerCase()] : 1) : NaN;
}

function layoutChange(o, w, h) {
  const inner = w - 2 * PAD;
  const c = o.change;
  const from = String(c.from).toUpperCase();
  const to = String(c.to).toUpperCase();
  const vs = textW(from, 3) <= inner && textW(to, 3) <= inner ? 3 : textW(from, 2) <= inner && textW(to, 2) <= inner ? 2 : 1;
  const up = numOf(c.to) > numOf(c.from) ? 'UP' : numOf(c.to) < numOf(c.from) ? 'DOWN' : '';
  const out = [];
  let y = TOP;
  out.push({ y, h: 7 + 2 + 7 * vs, kind: 'from', text: ellipsis(from, inner, vs), vs });
  y += 9 + 7 * vs + 6;
  out.push({ y, h: 12, kind: 'arrow' });
  y += 12 + 6;
  out.push({ y, h: 7 + 2 + 7 * vs, kind: 'to', text: ellipsis(to, inner, vs), vs, up });
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: ellipsis(String(c.label).toUpperCase(), inner, 1) });
}

function layoutTerm(o, w, h) {
  const inner = w - 2 * PAD;
  const term = String(o.term.term).toUpperCase();
  const ts = textW(term, 3) <= inner ? 3 : 2;
  const tl = balanceLines(term, inner, ts, 2);
  const plain = balanceLines(String(o.term.plain), inner, 1, 6);
  const out = [];
  let y = TOP;
  out.push({ y, h: tl.length * (7 * ts + 4) - 4, kind: 'term', lines: tl, ts });
  y += tl.length * (7 * ts + 4) - 4 + 6;
  out.push({ y, h: 1, kind: 'accentRule' });
  y += 8;
  out.push({ y, h: plain.length * 11 - 4, kind: 'lines', lines: plain });
  return finish(out, '', w, h, inner, { kicker: 'IN PLAIN ENGLISH' });
}

function layoutQuote(o, w, h) {
  const inner = w - 2 * PAD;
  const text = `${String(o.quote.text).replace(/^["“'‘]+|["”'’]+$/g, '')}`;
  const big = balanceLines(text, inner, 2, 4);
  const two = !big[big.length - 1]?.endsWith('...');
  const lines = two ? big : balanceLines(text, inner, 1, 9);
  const lh = two ? 18 : 11;
  const out = [];
  let y = TOP + 2;
  out.push({ y, h: 6, kind: 'mark' });
  y += 12;
  out.push({ y, h: lines.length * lh - (lh - 7 * (two ? 2 : 1)), kind: 'quote', lines, scale: two ? 2 : 1, lh });
  y += lines.length * lh - (lh - 7 * (two ? 2 : 1)) + 8;
  if (o.quote.by) out.push({ y, h: 7, kind: 'by', text: ellipsis(`— ${String(o.quote.by).toUpperCase()}`, inner, 1) });
  return finish(out, '', w, h, inner, { kicker: 'IN THEIR WORDS' });
}

function layoutWho(o, w, h) {
  const inner = w - 2 * PAD;
  const T = 24;
  const tw = inner - T - 8;
  const out = [];
  let y = TOP;
  for (const p of o.who.slice(0, 3)) {
    const name = balanceLines(String(p.name).toUpperCase(), tw, 1, 2);
    const role = balanceLines(String(p.role || '').toUpperCase(), tw, 1, 2);
    const th = name.length * 10 + (role.length ? 2 + role.length * 9 : 0);
    const rh = Math.max(T, th);
    out.push({ y, h: rh, kind: 'person', ini: initialsOf(p.name), name, role, T, tw, ty: Math.round((rh - th) / 2) });
    y += rh + 8;
  }
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: "WHO'S WHO" });
}

function layoutShare(o, w, h) {
  const inner = w - 2 * PAD;
  const s = o.share;
  const chart = shareChart(s.value, s.fraction);
  const value = String(s.value).toUpperCase();
  const vs = textW(value, 3) <= inner ? 3 : textW(value, 2) <= inner ? 2 : 1;
  const out = [];
  let y = TOP;
  if (s.lead) {
    const lead = balanceLines(String(s.lead), inner, 1, 2);
    out.push({ y, h: lead.length * 11 - 4, kind: 'lead', lines: lead });
    y += lead.length * 11 - 4 + 7;
  }
  if (chart.kind !== 'none') {
    const perRow = chart.kind === 'people' ? Math.min(chart.of, 12) : 10;
    const gh = chart.kind === 'people' ? 20 : 39;
    out.push({ y, h: gh, kind: 'chart', chart, perRow });
    y += gh + 8;
  }
  out.push({ y, h: (s.qualifier ? 8 : 0) + 7 * vs, kind: 'value', value: ellipsis(value, inner, vs), vs, qual: s.qualifier ? ellipsis(String(s.qualifier).toUpperCase(), inner, 1) : '' });
  y += (s.qualifier ? 8 : 0) + 7 * vs + 6;
  const label = balanceLines(String(s.label), inner, 1, 3);
  out.push({ y, h: label.length * 11 - 4, kind: 'lines', lines: label });
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: 'IN PROPORTION' });
}

function layoutNext(o, w, h) {
  const inner = w - 2 * PAD;
  const leaf = nextLeaf(o.next);
  const LW = 40, LH = 46;
  const tw = inner - LW - 10;
  const two = balanceLines(String(o.next.what), tw, 2, 3);
  const big = !two[two.length - 1]?.endsWith('...') && two.length <= 3;
  const lines = big ? two : balanceLines(String(o.next.what), tw, 1, 5);
  const lh = big ? 18 : 11;
  const line = leaf.big ? ellipsis(leaf.line, inner, 1) : '';
  const out = [];
  let y = TOP;
  const th = lines.length * lh - (lh - 7 * (big ? 2 : 1));
  out.push({ y, h: Math.max(LH, th), kind: 'leaf', leaf, LW, LH, lines, lh, big, tw, ty: Math.round((Math.max(LH, th) - th) / 2) });
  y += Math.max(LH, th) + 7;
  if (line) out.push({ y, h: 5, kind: 'micro', text: line });
  return finish(out, srcLine(o.source, inner), w, h, inner, { kicker: 'WHAT HAPPENS NEXT' });
}

const BUILDERS = { figures: layoutFigures, known: layoutKnown, timeline: layoutTimeline, change: layoutChange, term: layoutTerm, quote: layoutQuote, who: layoutWho, share: layoutShare, next: layoutNext };

/** The board's layout for a stage of w x h (cached per card). */
export function verticalBoardLayout(card, w, h, programId = '') {
  const kind = boardKind(card);
  if (!kind || !BUILDERS[kind]) return null;
  let per = LAYOUTS.get(card);
  const key = `${kind}|${w}|${h}|${programId}`;
  if (per?.key === key) return per.L;
  const L = { kind, ...BUILDERS[kind](card, w, h, programId) };
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
export function drawVerticalBoard(ctx, dt, card, { x, y, w, h, programId = '', accent = null } = {}) {
  const PW = w - 16;
  const L = verticalBoardLayout(card, PW, h - 8, programId);
  if (!L) return false;
  const acc = accentFor(programId, accent);
  const paper = !!L.paper;
  const PX = x + 8;
  const PY = y + clamp(Math.round((h - L.PH) / 2), 4, Math.max(4, h - L.PH - 4));
  const vis = Math.round(PW * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return true;
  const tx = PX + PAD;
  const ink = paper;
  const textStyle = paper ? S.ink : S.white;
  ctx.save();
  try {
    clipRect(ctx, PX, PY, vis, L.PH);
    if (paper) {
      // MONEY MINUTE's paper: cream, an ink edge on the right and the foot, a shadow under it
      ctx.fillStyle = P.cream;
      ctx.fillRect(PX, PY, PW, L.PH);
      ctx.fillStyle = P.tan;
      ctx.fillRect(PX + PW - 1, PY + 1, 1, L.PH - 1);
      ctx.fillRect(PX + 1, PY + L.PH - 1, PW - 1, 1);
    } else {
      ctx.fillStyle = P.black;
      ctx.fillRect(PX, PY, PW, L.PH);
      ctx.fillStyle = P.slate;
      ctx.fillRect(PX, PY, PW, 1);
    }
    drawText(ctx, L.kicker, tx, PY + KICK_Y, paper ? S.microSlate : S.microFog);
    const rule = paper ? P.darkGreen : acc;
    L.rows.forEach((r, i) => {
      const ry = PY + r.y;
      const at = 0.3 + i * 0.4;
      switch (r.kind) {
        case 'title':
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * 11, seg(dt, 0.25 + k * 0.07, 0.34), textStyle));
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
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * r.lh, seg(dt, at + k * 0.07, 0.34), styleOf(r.scale, ink)));
          break;
        case 'figure': {
          let fy = ry;
          if (r.qual) {
            drawText(ctx, r.qual, tx, fy, paper ? S.microSlate : S.microSilver);
            fy += 7;
          }
          const ruleY = fy + 7 * r.scale + 5;
          const rw = Math.round(r.figW * easeOutQuint(seg(dt, at, 0.25)));
          if (rw > 0) {
            ctx.fillStyle = rule;
            ctx.fillRect(tx, ruleY, rw, 1);
          }
          if (dt >= at + 0.35) drawText(ctx, r.fig, tx, fy, styleOf(r.scale, ink));
          r.label.forEach((ln, k) => rise(ctx, ln, tx, ruleY + 7 + k * 11, seg(dt, at + 0.4 + k * 0.07, 0.34), textStyle));
          break;
        }
        case 'point':
          if (dt < at) break;
          ctx.fillStyle = acc;
          ctx.fillRect(tx, ry + 2, 3, 3);
          r.lines.forEach((ln, k) => rise(ctx, ln, tx + 9, ry + k * 11, seg(dt, at + 0.05 + k * 0.07, 0.34), S.white));
          break;
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
          rise(ctx, r.when, tx + r.tx, ry, seg(dt, at + 0.05, 0.34), styleOf(r.ws));
          r.lines.forEach((ln, k) => rise(ctx, ln, tx + r.tx, ry + 7 * r.ws + 5 + k * 11, seg(dt, at + 0.12 + k * 0.07, 0.34), S.white));
          break;
        }
        case 'from':
          drawText(ctx, 'FROM', tx, ry, S.microFog);
          rise(ctx, r.text, tx, ry + 9, seg(dt, 0.3, 0.34), styleOf(r.vs));
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
          drawText(ctx, r.up ? `TO · ${r.up}` : 'TO', tx, ry, S.microFog);
          rise(ctx, r.text, tx, ry + 9, seg(dt, 0.85, 0.34), styleOf(r.vs));
          break;
        case 'term':
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * (7 * r.ts + 4), seg(dt, 0.3 + k * 0.08, 0.34), styleOf(r.ts)));
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
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * 11, seg(dt, at + k * 0.07, 0.34), S.white));
          break;
        case 'lead':
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * 11, seg(dt, 0.3 + k * 0.07, 0.34), S.silver));
          break;
        case 'mark':
          ctx.fillStyle = acc;
          for (let yy = 0; yy < QUOTE_MARK.length; yy++) for (let xx = 0; xx < 8; xx++) if (QUOTE_MARK[yy][xx] === '#') ctx.fillRect(tx + xx, ry + yy, 1, 1);
          break;
        case 'quote':
          r.lines.forEach((ln, k) => rise(ctx, ln, tx, ry + k * r.lh, seg(dt, 0.35 + k * 0.08, 0.34), styleOf(r.scale)));
          break;
        case 'by':
          rise(ctx, r.text, tx, ry, seg(dt, 0.6, 0.34), S.fog);
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
          r.name.forEach((ln, k) => rise(ctx, ln, nx, ry + r.ty + k * 10, seg(dt, at + 0.12 + k * 0.06, 0.34), S.white));
          r.role.forEach((ln, k) => rise(ctx, ln, nx, ry + r.ty + r.name.length * 10 + 2 + k * 9, seg(dt, at + 0.22 + k * 0.06, 0.34), S.fog));
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
          if (r.qual && dt >= 0.6) drawText(ctx, r.qual, tx, ry, S.microFog);
          if (dt >= 0.95) rise(ctx, r.value, tx, ry + (r.qual ? 8 : 0), seg(dt, 0.95, 0.3), styleOf(r.vs));
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
                drawText(ctx, r.leaf.foot, tx + ((r.LW - measureText(r.leaf.foot, 1, 'micro')) >> 1), ly + 38, S.microInk);
              } else {
                const foot = ellipsis(r.leaf.foot, r.LW - 4, 1);
                drawText(ctx, foot, tx + ((r.LW - textW(foot, 1)) >> 1), ly + 24, S.ink);
              }
            } finally {
              ctx.restore();
            }
          }
          const wx = tx + r.LW + 10;
          r.lines.forEach((ln, k) => rise(ctx, ln, wx, ry + r.ty + k * r.lh, seg(dt, 0.7 + k * 0.08, 0.34), r.big ? S.white2 : S.white));
          break;
        }
        case 'micro':
          rise(ctx, r.text, tx, ry, seg(dt, 0.55, 0.34), S.microWhite);
          break;
        default:
          break;
      }
    });
    if (L.src) drawText(ctx, L.src, tx, PY + L.srcY, paper ? S.microSlate : S.microFog);
  } finally {
    ctx.restore();
  }
  return true;
}

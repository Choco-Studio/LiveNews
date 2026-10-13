// Three more fact boards, in the cards' package (black panel wiped in from the left, slate top line, micro kicker,
// the programme accent as the one colour, text rising into place, a source line, nothing counted up):
//   SHARE              IN PROPORTION: a part of a whole ("65%", "1 IN 7", "TWO-THIRDS") beside a small chart of
//                      it, a row of figures when the whole is a few people, a grid of a hundred squares otherwise
//   WHAT HAPPENS NEXT  a calendar leaf with the day the story gives, and the step that comes then
//   WHO'S WHO          two or three people the story names: a monogram tile each (initials, never a face we do not
//                      have), the name, and the role the story gives them
// Each panel keeps clear of the top row and of the captions (y 28..134), like the other boards.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { clamp, seg, easeOutQuint, clipRect, ellipsis, balanceLines, textW } from '../gfx/index.js';

const W = 384;
const SAFE_BOTTOM = 134;
const PX = 40;
const PW = W - 2 * PX;
const INNER = PW - 24;

const S = {
  white: { color: P.white },
  white2: { color: P.white, scale: 2 },
  white3: { color: P.white, scale: 3 },
  silver: { color: P.silver },
  microFog: { color: P.fog, font: 'micro' },
  microWhite: { color: P.white, font: 'micro' },
  microInk: { color: P.ink, font: 'micro' },
  microBlack: { color: P.black, font: 'micro' },
  ink2: { color: P.ink, scale: 2 },
  ink3: { color: P.ink, scale: 3 },
};

/** Text that rises into place inside a mask at its own rows (p: 0..1). */
function rise(ctx, text, x, y, p, style) {
  if (p <= 0 || !text) return;
  const scale = style.scale || 1;
  const h = (style.font === 'micro' ? 5 : 7) * scale;
  const off = Math.round((1 - easeOutQuint(p)) * (h + 3));
  ctx.save();
  try {
    clipRect(ctx, 0, y - 3 * scale, W, h + 3 * scale + 1);
    drawText(ctx, text, x, y + off, style);
  } finally {
    ctx.restore();
  }
}

/** Micro-font lines (3x5) wrapped to maxW, at most maxLines (the last cut with "..."). */
function microLines(text, maxW, maxLines = 2) {
  const words = String(text || '').toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measureText(next, 1, 'micro') <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = `${kept[maxLines - 1]}...`;
    while (last.length > 4 && measureText(last, 1, 'micro') > maxW) last = `${last.slice(0, -4).trimEnd()}...`;
    kept[maxLines - 1] = last;
    return kept;
  }
  return lines.map((l) => (measureText(l, 1, 'micro') <= maxW ? l : l.slice(0, Math.max(1, Math.floor(maxW / 4)))));
}

const srcText = (source) => (source ? ellipsis(`SOURCE: ${String(source).toUpperCase()}`, INNER, 1) : '');
const place = (h) => clamp(Math.round(80 - h / 2), 28, SAFE_BOTTOM - h);

/** The board's panel: black, wiped in from the left over 0.3 s, a slate top line and the kicker. */
function panel(ctx, dt, PY, PH, kicker) {
  const vis = Math.round(PW * easeOutQuint(seg(dt, 0, 0.3)));
  if (vis <= 0) return false;
  clipRect(ctx, PX, PY, vis, PH);
  ctx.fillStyle = P.black;
  ctx.fillRect(PX, PY, PW, PH);
  ctx.fillStyle = P.slate;
  ctx.fillRect(PX, PY, PW, 1);
  drawText(ctx, kicker, PX + 12, PY + 10, S.microFog);
  return true;
}

/** A small cache: one layout per board content (rebuilt when the content changes). */
function cache(limit = 40) {
  const m = new Map();
  return (key, build) => {
    let v = m.get(key);
    if (v) return v;
    v = build();
    if (m.size >= limit) m.delete(m.keys().next().value);
    m.set(key, v);
    return v;
  };
}

// ---------------------------------------------------------------- SHARE (IN PROPORTION)

// a person, 5x9: head 3x3, shoulders and body 5x4, legs 2 (one figure of the whole)
const FIGURE = ['.###.', '.###.', '.###.', '.....', '#####', '#####', '#####', '#####', '.#.#.', '.#.#.'];
function figure(ctx, x, y, k, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < FIGURE.length; r++) for (let c = 0; c < 5; c++) if (FIGURE[r][c] === '#') ctx.fillRect(x + c * k, y + r * k, k, k);
}

/** How a share is drawn: { kind: 'people', n, of } for a few people, { kind: 'grid', lit } for a hundred squares. */
export function shareChart(value, fraction) {
  const v = String(value || '').toUpperCase();
  const m = /^(\d+) IN (\d+)$/.exec(v);
  if (m && Number(m[2]) <= 12) return { kind: 'people', n: Number(m[1]), of: Number(m[2]) };
  const words = { HALF: [1, 2], 'A THIRD': [1, 3], 'TWO-THIRDS': [2, 3], 'A QUARTER': [1, 4], 'THREE-QUARTERS': [3, 4], 'A FIFTH': [1, 5], 'A TENTH': [1, 10] };
  if (words[v]) return { kind: 'people', n: words[v][0], of: words[v][1] };
  const f = Number(fraction);
  // (under one in a hundred a grid would show none, or a lie: the figure stands alone)
  if (!(f >= 0.01 && f <= 1)) return { kind: 'none' };
  return { kind: 'grid', lit: Math.round(f * 100) };
}

const SHARE_LAYOUTS = cache();
function shareLayout(s, source) {
  return SHARE_LAYOUTS(`${s.value}|${s.fraction}|${s.lead}|${s.label}|${s.qualifier}|${source}`, () => {
    const chart = shareChart(s.value, s.fraction);
    // the chart: figures at 2x (one row up to five, two rows up to twelve), or a 10x10 grid of 3px squares
    const k = 2;
    const perRow = chart.kind === 'people' ? (chart.of <= 5 ? chart.of : Math.ceil(chart.of / 2)) : 0;
    const rows = chart.kind === 'people' ? Math.ceil(chart.of / perRow) : 0;
    const gw = chart.kind === 'people' ? perRow * 10 + (perRow - 1) * 4 : chart.kind === 'grid' ? 39 : 0;
    const gh = chart.kind === 'people' ? rows * FIGURE.length * k + (rows - 1) * 4 : chart.kind === 'grid' ? 39 : 0;
    const tx = PX + 12 + (gw ? gw + 14 : 0);
    const tw = PX + PW - 12 - tx;
    const value = String(s.value).toUpperCase();
    const vs = textW(value, 3) <= tw ? 3 : textW(value, 2) <= tw ? 2 : 1;
    const lead = s.lead ? balanceLines(String(s.lead), tw, 1, 2) : [];
    const label = balanceLines(String(s.label), tw, 1, 3);
    const qual = s.qualifier ? ellipsis(String(s.qualifier), tw, 1) : '';
    const top = 24;
    let y = 0;
    const leadY = y;
    y += lead.length ? lead.length * 11 + 2 : 0;
    const qualY = y;
    y += qual ? 8 : 0;
    const valueY = y;
    y += 8 * vs + 5;
    const labelY = y;
    y += label.length * 11 - 4;
    const th = y;
    const bh = Math.max(th, gh);
    const src = srcText(source);
    const h = top + bh + (src ? 13 : 0) + 9;
    const PY = place(h);
    return { PY, PH: h, chart, k, perRow, gw, gh, gx: PX + 12, gy: PY + top + Math.round((bh - gh) / 2), tx, ty: PY + top + Math.round((bh - th) / 2), value, vs, lead, label, qual, leadY, qualY, valueY, labelY, src, srcY: PY + top + bh + 6 };
  });
}

/** SHARE (IN PROPORTION): o = { share: { value, fraction, lead, label, qualifier? }, source }. */
export function drawShare(ctx, dt, o, acc) {
  const s = o.share;
  const L = shareLayout(s, o.source);
  ctx.save();
  try {
    if (!panel(ctx, dt, L.PY, L.PH, 'IN PROPORTION')) return;
    // the chart is swept in from the left: the whole in slate, its share in the accent (a drawing, not a count)
    const sweep = easeOutQuint(seg(dt, 0.35, 0.6));
    const edge = L.gx + Math.round((L.gw + 1) * sweep);
    if (L.chart.kind === 'people') {
      for (let i = 0; i < L.chart.of; i++) {
        const x = L.gx + (i % L.perRow) * 14;
        if (x + 10 > edge) continue;
        figure(ctx, x, L.gy + Math.floor(i / L.perRow) * (FIGURE.length * L.k + 4), L.k, i < L.chart.n ? acc : P.slate);
      }
    } else if (L.chart.kind === 'grid') {
      for (let i = 0; i < 100; i++) {
        const x = L.gx + (i % 10) * 4;
        if (x + 3 > edge) continue;
        ctx.fillStyle = i < L.chart.lit ? acc : P.slate;
        ctx.fillRect(x, L.gy + Math.floor(i / 10) * 4, 3, 3);
      }
    }
    for (let i = 0; i < L.lead.length; i++) rise(ctx, L.lead[i], L.tx, L.ty + L.leadY + i * 11, seg(dt, 0.35 + i * 0.07, 0.34), S.silver);
    // the qualifier belongs to the figure: on the panel before it; the figure lands whole once the chart is drawn
    if (L.qual && dt >= 0.6) drawText(ctx, L.qual, L.tx, L.ty + L.qualY, S.microFog);
    if (dt >= 0.95) rise(ctx, L.value, L.tx, L.ty + L.valueY, seg(dt, 0.95, 0.3), L.vs === 3 ? S.white3 : L.vs === 2 ? S.white2 : S.white);
    for (let i = 0; i < L.label.length; i++) rise(ctx, L.label[i], L.tx, L.ty + L.labelY + i * 11, seg(dt, 1.15 + i * 0.07, 0.34), S.white);
    if (L.src) drawText(ctx, L.src, PX + 12, L.srcY, S.microFog);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- WHAT HAPPENS NEXT

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * The leaf and the line of a step's date: { head, big, foot, line }. A dated step shows its month, day and weekday
 * ("OCT", "28", "WED"; "WEDNESDAY 28 OCTOBER", TODAY or TOMORROW before it when it is); a step the story dates
 * loosely shows the words ("NEXT", "WEEK"; "NEXT WEEK").
 */
export function nextLeaf(n, now = Date.now()) {
  const when = String(n?.when || '').toUpperCase();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(n?.date || ''));
  if (m) {
    const at = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(at);
    const days = Math.round((at - Math.floor(now / 86_400_000) * 86_400_000) / 86_400_000);
    const tag = days === 0 ? 'TODAY · ' : days === 1 ? 'TOMORROW · ' : '';
    return { head: MONTHS[d.getUTCMonth()].slice(0, 3), big: String(d.getUTCDate()), foot: DAYS[d.getUTCDay()].slice(0, 3), line: `${tag}${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
  }
  const words = when.split(/\s+/).filter(Boolean);
  const head = words[0] === 'IN' ? 'SOON' : words[0] || 'NEXT';
  return { head, big: '', foot: words.at(-1) || '', line: when };
}

const NEXT_LAYOUTS = cache();
function nextLayout(n, source, day) {
  return NEXT_LAYOUTS(`${n.when}|${n.date}|${n.what}|${source}|${day}`, () => {
    const leaf = nextLeaf(n);
    const LW = 40;
    const LH = 46;
    const tx = PX + 12 + LW + 14;
    const tw = PX + PW - 12 - tx;
    const two = balanceLines(String(n.what), tw, 2, 2);
    const big = two.length <= 2 && two.every((l) => !l.endsWith('...'));
    const lines = big ? two : balanceLines(String(n.what), tw, 1, 3);
    const lh = big ? 18 : 11;
    // (a loose date is on the leaf already: no line repeats it)
    const line = leaf.big ? ellipsis(leaf.line, tw, 1) : '';
    const th = (line ? 14 : 0) + lines.length * lh - (lh - 7 * (big ? 2 : 1));
    const top = 24;
    const bh = Math.max(LH, th);
    const src = srcText(source);
    const h = top + bh + (src ? 13 : 0) + 9;
    const PY = place(h);
    return { PY, PH: h, leaf, LW, LH, lx: PX + 12, ly: PY + top + Math.round((bh - LH) / 2), tx, ty: PY + top + Math.round((bh - th) / 2), line, lines, lh, big, src, srcY: PY + top + bh + 6 };
  });
}

/** WHAT HAPPENS NEXT: o = { next: { when, date, what }, source }. */
export function drawNext(ctx, dt, o, acc) {
  const L = nextLayout(o.next, o.source, Math.floor(Date.now() / 86_400_000));
  ctx.save();
  try {
    if (!panel(ctx, dt, L.PY, L.PH, 'WHAT HAPPENS NEXT')) return;
    // the leaf drops into place: its head in the accent, the day on the page
    const p = easeOutQuint(seg(dt, 0.3, 0.4));
    if (p > 0) {
      const y = L.ly - Math.round((1 - p) * 8);
      ctx.save();
      try {
        clipRect(ctx, L.lx, L.ly - 1, L.LW, L.LH + 1);
        ctx.fillStyle = P.silver;
        ctx.fillRect(L.lx, y, L.LW, L.LH);
        ctx.fillStyle = acc;
        ctx.fillRect(L.lx, y, L.LW, 10);
        // two binding rings across the head
        ctx.fillStyle = P.black;
        ctx.fillRect(L.lx + 8, y - 1, 2, 3);
        ctx.fillRect(L.lx + L.LW - 10, y - 1, 2, 3);
        const head = ellipsis(L.leaf.head, L.LW - 4, 1);
        drawText(ctx, head, L.lx + ((L.LW - measureText(head, 1, 'micro')) >> 1), y + 3, S.microBlack);
        if (L.leaf.big) {
          // the day at 3x under the head, the weekday in micro below it, apart
          const bs = textW(L.leaf.big, 3) <= L.LW - 4 ? 3 : 2;
          drawText(ctx, L.leaf.big, L.lx + ((L.LW - textW(L.leaf.big, bs)) >> 1), y + (bs === 3 ? 13 : 16), bs === 3 ? S.ink3 : S.ink2);
          drawText(ctx, L.leaf.foot, L.lx + ((L.LW - measureText(L.leaf.foot, 1, 'micro')) >> 1), y + 38, S.microInk);
        } else {
          const foot = ellipsis(L.leaf.foot, L.LW - 4, 1);
          drawText(ctx, foot, L.lx + ((L.LW - textW(foot, 1)) >> 1), y + 24, { color: P.ink });
        }
      } finally {
        ctx.restore();
      }
    }
    if (L.line) rise(ctx, L.line, L.tx, L.ty, seg(dt, 0.55, 0.34), S.microWhite);
    for (let i = 0; i < L.lines.length; i++) rise(ctx, L.lines[i], L.tx, L.ty + (L.line ? 14 : 0) + i * L.lh, seg(dt, 0.7 + i * 0.08, 0.34), L.big ? S.white2 : S.white);
    if (L.src) drawText(ctx, L.src, PX + 12, L.srcY, S.microFog);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------- WHO'S WHO

/** A name's initials for its tile: the first letters of its first and last words ("Laurent Nuñez" -> "LN"). */
export function initialsOf(name) {
  const words = String(name || '').split(/\s+/).filter((w) => /^\p{Lu}/u.test(w) && !/^[IVX]{1,4}$/.test(w));
  if (!words.length) return '';
  const first = words[0].normalize('NFD')[0];
  const last = words.length > 1 ? words.at(-1).normalize('NFD')[0] : '';
  return `${first}${last}`.toUpperCase();
}

const WHO_LAYOUTS = cache();
function whoLayout(people, source) {
  return WHO_LAYOUTS(`${people.map((p) => `${p.name}~${p.role}`).join('|')}|${source}`, () => {
    const n = people.length;
    const colW = Math.floor(INNER / n);
    const T = 28; // the tile
    const cols = people.map((p, i) => {
      const cx = PX + 12 + Math.round(colW * (i + 0.5));
      const name = balanceLines(String(p.name).toUpperCase(), colW - 8, 1, 2);
      const role = microLines(p.role, colW - 8, 2);
      return { cx, ini: initialsOf(p.name), name, role };
    });
    const top = 24;
    const tileY = top;
    const nameY = tileY + T + 7;
    // each role right under its own name (a two-line name pushes only its own role down)
    for (const c of cols) c.roleY = nameY + c.name.length * 10 + 2;
    const bh = Math.max(...cols.map((c) => c.roleY + c.role.length * 7)) - top;
    const src = srcText(source);
    const h = top + bh + (src ? 13 : 0) + 9;
    const PY = place(h);
    return { PY, PH: h, cols, T, tileY, nameY, src, srcY: PY + top + bh + 6 };
  });
}

/** WHO'S WHO: o = { who: [{ name, role }] (two or three), source }. */
export function drawWho(ctx, dt, o, acc) {
  const people = (o.who || []).slice(0, 3);
  if (people.length < 2) return;
  const L = whoLayout(people, o.source);
  ctx.save();
  try {
    if (!panel(ctx, dt, L.PY, L.PH, "WHO'S WHO")) return;
    for (let i = 0; i < L.cols.length; i++) {
      const c = L.cols[i];
      const at = 0.3 + i * 0.4;
      if (dt < at) continue;
      // the tile lands (ink, a slate edge, the accent along its foot), then the name and the role rise under it
      const p = easeOutQuint(seg(dt, at, 0.3));
      const x = c.cx - (L.T >> 1);
      const y = L.PY + L.tileY + Math.round((1 - p) * 6);
      ctx.save();
      try {
        clipRect(ctx, x - 1, L.PY + L.tileY - 1, L.T + 2, L.T + 2);
        ctx.fillStyle = P.slate;
        ctx.fillRect(x, y, L.T, L.T);
        ctx.fillStyle = P.ink;
        ctx.fillRect(x + 1, y + 1, L.T - 2, L.T - 2);
        ctx.fillStyle = acc;
        ctx.fillRect(x, y + L.T - 2, L.T, 2);
        const is = textW(c.ini, 2) <= L.T - 6 ? 2 : 1;
        drawText(ctx, c.ini, c.cx - (textW(c.ini, is) >> 1), y + (is === 2 ? 6 : 10), is === 2 ? S.white2 : S.white);
      } finally {
        ctx.restore();
      }
      for (let k = 0; k < c.name.length; k++) rise(ctx, c.name[k], c.cx - (textW(c.name[k], 1) >> 1), L.PY + L.nameY + k * 10, seg(dt, at + 0.12 + k * 0.06, 0.34), S.white);
      for (let k = 0; k < c.role.length; k++) rise(ctx, c.role[k], c.cx - (measureText(c.role[k], 1, 'micro') >> 1), L.PY + c.roleY + k * 7, seg(dt, at + 0.22 + k * 0.06, 0.34), S.microFog);
    }
    if (L.src) drawText(ctx, L.src, PX + 12, L.srcY, S.microFog);
  } finally {
    ctx.restore();
  }
}

// PAY ATTENTION's text fit (docs/programmes/pay-attention.md §6): how the boards lay their words out at 1x, and whether
// a question's texts fit their boxes. No canvas and no DOM: the boards (scenes/cards-quiz.js) draw from these layouts,
// and the question desk (server/quiz/rounds.js) refuses what would not fit, since a headline is never cut nor shrunk on
// air ("A headline that does not fit a tile's three lines is not used as an option").
import { measureText } from '../font.js';

/** The boards' safe area: the action-safe width, clear of the top row (y < 28) and of the captions (y > 134). */
export const SAFE = Object.freeze({ left: 13, right: 371, top: 28, bottom: 134 });
export const CX = SAFE.left + 4; // the content's left edge (17)
export const CR = SAFE.right - 4; // its right edge (367)
export const CW = CR - CX; // 350
export const LINE = 10; // the 1x line pitch (7 px caps, 3 px between: room for an accent above)
export const SPACE = 4; // a word space at 1x (3 px and the letter gap)
export const MASK_UNIT = 6; // a mask block per ▮: as wide as a capital and its gap
export const COL_W = 132; // the question column (the frame "WHICH STORY?" at 2x is 132 px)

/** A small layout cache (one entry per text; rebuilt when it changes). */
function cache(limit = 80) {
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

// ---------------------------------------------------------------- text, masks and reveals

/** The masked text's pieces: plain text and ▮ runs (one block each, as wide as its run). */
function piecesOf(text) {
  const out = [];
  const s = String(text ?? '');
  let last = 0;
  for (const m of s.matchAll(/▮+/g)) {
    if (m.index > last) out.push({ k: 't', s: s.slice(last, m.index) });
    out.push({ k: 'm', n: m[0].length });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ k: 't', s: s.slice(last) });
  return out;
}

/**
 * The revealed text's pieces: the full words, with what the masks hid lit ("F1 in ▮▮▮▮▮: There's…" and
 * "F1 in Singapore: There's…" → "F1 in " + lit "Singapore" + ": There's…"). Null when the two do not align.
 */
export function revealPieces(masked, words) {
  const m = String(masked ?? '');
  const w = String(words ?? '');
  const parts = m.split(/▮+/);
  if (parts.length === 1) return [{ k: 't', s: w }];
  if (!w.startsWith(parts[0])) return null;
  const out = parts[0] ? [{ k: 't', s: parts[0] }] : [];
  let pos = parts[0].length;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const at = i === parts.length - 1 ? w.length - p.length : w.indexOf(p, pos + 1);
    if (at <= pos || (i === parts.length - 1 && !w.endsWith(p))) return null;
    out.push({ k: 'h', s: w.slice(pos, at) });
    if (p) out.push({ k: 't', s: p });
    pos = at + p.length;
  }
  return out;
}

/** Words of pieces, each a list of segments with its width at 1x (a segment's neighbour is one letter gap away). */
function wordsOf(pieces) {
  const words = [];
  let cur = null;
  const push = (sg) => {
    if (!cur) {
      cur = { segs: [], w: 0 };
      words.push(cur);
    }
    cur.w += (cur.segs.length ? 1 : 0) + sg.w;
    cur.segs.push(sg);
  };
  for (const p of pieces) {
    if (p.k === 'm') {
      push({ k: 'm', n: p.n, w: p.n * MASK_UNIT - 1 });
      continue;
    }
    const parts = String(p.s).split(/(\s+)/).filter(Boolean);
    const last = parts.length - 1 - [...parts].reverse().findIndex((x) => !/^\s+$/.test(x));
    const first = parts.findIndex((x) => !/^\s+$/.test(x));
    parts.forEach((part, k) => {
      if (/^\s+$/.test(part)) {
        cur = null;
        return;
      }
      // (a lit span's gold box takes a column of air at its two ends, in its width, so punctuation never touches it;
      // between the words of one span, only the lit space: "$1.3 BILLION" reads as it aired)
      const padL = p.k === 'h' && k === first ? 1 : 0;
      const padR = p.k === 'h' && k === last ? 1 : 0;
      push({ k: p.k, s: part, w: measureText(part) + padL + padR, padL });
    });
  }
  return words;
}

function wrapWords(words, maxW) {
  const lines = [];
  let line = null;
  for (const wd of words) {
    if (line && line.w + SPACE + wd.w <= maxW) {
      line.words.push(wd);
      line.w += SPACE + wd.w;
    } else {
      line = { words: [wd], w: wd.w };
      lines.push(line);
    }
  }
  return lines;
}

const LAYOUTS = new Map(); // text -> Map(words | '' -> Map(maxW * 16 + maxLines -> layout))
/**
 * A text laid out at 1x in lines of at most maxW (balanced: the fewest lines, then the narrowest width that keeps
 * them, so no line is a one-word widow). `words` (optional): the full text that the masked `text` hides, to lay out
 * the reveal. Returns { lines, fits, w, h } (fits: at most maxLines lines and no word wider than maxW).
 */
export function layoutText(text, maxW, maxLines = 3, words = null) {
  const tx = String(text ?? '');
  let byWords = LAYOUTS.get(tx);
  if (!byWords) {
    if (LAYOUTS.size >= 300) LAYOUTS.delete(LAYOUTS.keys().next().value);
    LAYOUTS.set(tx, (byWords = new Map()));
  }
  const wk = words === null ? '' : String(words);
  let byNum = byWords.get(wk);
  if (!byNum) byWords.set(wk, (byNum = new Map()));
  const num = maxW * 16 + maxLines;
  let L = byNum.get(num);
  if (!L) byNum.set(num, (L = layoutBuild(tx, maxW, maxLines, words)));
  return L;
}
function layoutBuild(text, maxW, maxLines, words) {
  const pieces = words !== null ? revealPieces(text, words) || [{ k: 't', s: words }] : piecesOf(text);
  const ws = wordsOf(pieces);
  let lines = wrapWords(ws, maxW);
  const fits = ws.length > 0 && lines.length <= maxLines && ws.every((x) => x.w <= maxW);
  if (fits && lines.length > 1) {
    let lo = Math.ceil(maxW / lines.length);
    let hi = maxW;
    const n = lines.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const t = wrapWords(ws, mid);
      if (t.length === n && ws.every((x) => x.w <= mid)) {
        lines = t;
        hi = mid - 1;
      } else lo = mid + 1;
    }
  }
  const w = Math.max(0, ...lines.map((l) => l.w));
  return { lines, fits, w, h: lines.length ? lines.length * LINE - 3 : 0 };
}

export const TILE = Object.freeze({ x: CX + COL_W + 7, y: 31, w: 167, h: 31, gap: 3, badge: 9, lines: 3 });
/** The width a tile's text has at 1x (the desk refuses a headline that does not fit TILE.lines lines of it). */
export const TILE_TEXT_W = TILE.w - 1 - TILE.badge - 3 - 3 - 1;

/** A headline laid out in a tile: { lines, fits, w, h }. */
export const tileLayout = (words) => layoutText(words, TILE_TEXT_W, TILE.lines);
/** Does a headline fit a tile's three lines? (The desk refuses an option that does not.) */
export const fitsTile = (words) => tileLayout(words).fits;

// ---------------------------------------------------------------- LETTER BY LETTER

// a tile is 11 x 15 with its 1x letter in the middle (3 px each side, 4 above and below); the rows sit in the middle of
// the board between the frame and the foot
export const LT = Object.freeze({ w: 11, h: 15, row: 18, word: 6, areaTop: 56, areaBottom: 121, rows: 3 });
const LETTER_RE = /[\p{L}\p{N}]/u;
const LETTERS_LAYOUTS = cache(60);
/**
 * The letter tiles of a headline: one cell per character of [...words] (the reveal's indices), an 11 x 15 tile for a
 * letter or digit, punctuation bare between them, a gap for a space; rows broken at spaces and centred, one type size.
 * Returns { cells: [{ i, ch, tile, x, y }], rows, top, fits }.
 */
export function lettersLayout(words) {
  return LETTERS_LAYOUTS(String(words), () => {
    const chars = [...String(words ?? '')];
    const wordsOf2 = [];
    let cur = [];
    chars.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        if (cur.length) wordsOf2.push(cur);
        cur = [];
      } else cur.push({ i, ch, tile: LETTER_RE.test(ch), w: LETTER_RE.test(ch) ? LT.w : measureText(ch) });
    });
    if (cur.length) wordsOf2.push(cur);
    const widthOf = (wd) => wd.reduce((t, c, k) => t + c.w + (k ? 1 : 0), 0);
    const rows = [];
    let row = null;
    for (const wd of wordsOf2) {
      const w = widthOf(wd);
      if (row && row.w + LT.word + 1 + w <= CW) {
        row.words.push(wd);
        row.w += LT.word + 1 + w;
      } else {
        row = { words: [wd], w };
        rows.push(row);
      }
    }
    const cells = [];
    const top = LT.areaTop + Math.max(0, Math.round((LT.areaBottom - LT.areaTop - (rows.length * LT.row - 3)) / 2));
    rows.forEach((r, ri) => {
      let x = CX + Math.round((CW - r.w) / 2);
      const y = top + ri * LT.row;
      r.words.forEach((wd, wi) => {
        if (wi) x += LT.word + 1;
        wd.forEach((c, k) => {
          if (k) x += 1;
          cells.push({ ...c, x, y });
          x += c.w;
        });
      });
    });
    return { cells, rows: rows.length, top, fits: rows.length <= LT.rows && rows.every((r) => r.w <= CW) };
  });
}
/** Does a headline fit the LETTER BY LETTER board (three rows of tiles)? */
export const fitsLetters = (words) => lettersLayout(words).fits;

const SHOWN = new WeakMap();
/**
 * The characters showing at a stage (0: the first letters, digits and punctuation; 1..3: the reveal's stages), as a
 * set of indices into [...words]; built once per reveal and stage (the board asks every frame).
 */
export function lettersShown(reveal, stage) {
  const k = clampStage(stage);
  if (!reveal || typeof reveal !== 'object') return new Set();
  let sets = SHOWN.get(reveal);
  if (!sets) SHOWN.set(reveal, (sets = []));
  if (!sets[k]) {
    const set = new Set(reveal.shown || []);
    const n = k === 0 ? 0 : reveal.stages?.[k - 1] ?? 0;
    (reveal.order || []).slice(0, n).forEach((i) => set.add(i));
    sets[k] = set;
  }
  return sets[k];
}
const clampStage = (stage) => (stage <= 0 ? 0 : Math.min(3, Math.floor(stage)));

export const HEAD = Object.freeze({ y: 58, lines: 6 });
/** Does a WHERE headline (masked and whole) fit the question column's six lines? */
export const fitsWhere = (q) => layoutText(q.masked || q.words, COL_W, HEAD.lines).fits && layoutText(q.masked || q.words, COL_W, HEAD.lines, q.masked ? q.words : null).fits;

export const SENT = Object.freeze({ y: 58, lines: 4 });
/** Does a HOW MANY? sentence (masked and revealed) fit four lines of the board? */
export const fitsSentence = (q) => layoutText(q.masked, CW, SENT.lines).fits && layoutText(q.masked, CW, SENT.lines, q.sentence).fits;

export const CARD = Object.freeze({ y: 57, lines: 2, pad: 4 });
/** Does a quickfire headline fit its card's two lines? */
export const fitsToday = (words) => layoutText(words, CW - 2 * CARD.pad - 2, CARD.lines).fits;

// ---------------------------------------------------------------- the desk's check

/**
 * Does every text of a question fit its board? { ok, why } — the desk refuses a question (or an option) that does not:
 * a headline is never cut nor shrunk on air. PICTURE THIS: each option's three tile lines; LETTER BY LETTER: three rows
 * of tiles; WHERE: six lines of the question column, masked and whole; HOW MANY?: four lines, masked and revealed;
 * TODAY OR NOT TODAY?: each headline's two card lines.
 */
export function quizFits(q) {
  if (!q) return { ok: false, why: 'no question' };
  switch (q.type) {
    case 'picture': {
      const bad = (q.options || []).find((x) => !fitsTile(x.words));
      return bad ? { ok: false, why: `option ${bad.letter} does not fit a tile's three lines` } : { ok: true };
    }
    case 'letters':
      return fitsLetters(q.words) ? { ok: true } : { ok: false, why: 'more than three rows of letter tiles' };
    case 'where':
      return fitsWhere(q) ? { ok: true } : { ok: false, why: 'the headline does not fit six lines of the question column' };
    case 'howmany':
      return fitsSentence(q) ? { ok: true } : { ok: false, why: 'the sentence does not fit four lines' };
    case 'today': {
      const bad = (q.items || []).find((x) => !fitsToday(x.words));
      return bad ? { ok: false, why: `"${bad.words}" does not fit the card's two lines` } : { ok: true };
    }
    default:
      return { ok: true };
  }
}

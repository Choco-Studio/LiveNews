// Ticker: a 14 px band at the foot of the screen with a BBC-style flipper, one
// headline at a time pushed up in 0.3 s and held 1.5 s + 0.4 s per word. It
// never scrolls: a headline too wide for the band is split at phrase
// boundaries into pages that flip like separate items; every page but the
// last ends with an ellipsis and every page but the first starts with one, so
// a page seen on its own still reads as part of a headline, and no page is a
// scrap of a few words. The micro source label leads an item when it costs no
// page. The plate is sized to its own label: LATEST (black on yellow),
// BREAKING (red) for a breaking item, NEXT for the coming programme.
// Programme modes (graphics/index.js PROGRAM_GRAPHICS): MONEY MINUTE flips the
// figures of stories already aired ("OIL $82" + a silver direction glyph) under
// a BOTTOM LINE plate; NEWS IN 60 holds one static UP NEXT plate.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TICKER, inkOn, easeOut, easeIn, easeInOut, lerp, rect, clipStart, clipEnd } from './layout.js';
import { linePages } from './breaks.js';
import { CHANNEL, paceTrace, tickerHold } from '../pace.js';

// PACE: push and hold from the one pacing table (pace.js CHANNEL.ticker; owner 18:52: items held longer, >= 6 s)
export const TICKER_TIMING = CHANNEL.ticker;
const T = TICKER_TIMING;

/** Width of a plate that carries `label` (text at graphics-safe x, 6 px after it). */
export const plateWidth = (label) => TICKER.textX + measureText(label) + 6;
const ITEM_GAP = 6; // between the plate and the item text
/** Room for an item's text after a LATEST plate, up to the action-safe margin. */
export const TICKER_ROOM = TICKER.right - (plateWidth('LATEST') + ITEM_GAP);
const SOURCE_GAP = 5;
const MAX_PAGES = 3;
// No page may be a scrap: at least 40 % of the band and four words, or the split moves.
const PAGE_RULES = { maxPages: MAX_PAGES, lead: true, minShare: 0.4, minWords: 3 };
const GLYPH_W = 5;
const VALUE_GAP = 6;

const wordCount = (s) => {
  let n = 0;
  let inWord = false;
  for (let i = 0; i < s.length; i++) {
    const space = s.charCodeAt(i) <= 32;
    if (!space && !inWord) n++;
    inWord = !space;
  }
  return n;
};

// Outlets prefix titles with "BREAKING:" or "LIVE:"; under a LATEST plate that
// reads as an alarm the channel is not raising (real breaking news has its own plate).
const ALARM = /^\s*(breaking(\s+news)?|live|urgent|just in)\s*[:\-–—|]\s*/i;

// Text styles (constant objects: no allocation per frame).
const SOURCE_STYLE = Object.freeze({ color: P.silver, font: 'micro' });
const TEXT_STYLE = Object.freeze({ color: P.white });
const LABEL_STYLE = Object.freeze({ color: P.silver });
const NEXT_STYLE = Object.freeze({ color: P.fog });
const plateStyles = new Map();
const plateStyle = (color) => {
  let s = plateStyles.get(color);
  if (!s) plateStyles.set(color, (s = Object.freeze({ color: inkOn(color) })));
  return s;
};

/**
 * The flipper entries for one ticker item: usually one, or 2-3 pages for a
 * long headline. `short` (optional, from editorial) is a ticker-length
 * version of the headline and is used first. Entry: { id, base, label, plate,
 * x, source, text, breaking, page, pages, dur }.
 */
export function makeEntries({ label = 'LATEST', plate = P.yellow, source = '', text = '', short = '', breaking = false }) {
  const src = String(source || '').trim();
  const body = String(short || text || '').replace(ALARM, '').trim();
  if (!body) return [];
  const x = plateWidth(label) + ITEM_GAP;
  const room = TICKER.right - x;
  const base = `${label}|${src}|${body}`;
  let pages = linePages(body, room, PAGE_RULES);
  let withSource = false;
  if (src) {
    const srcW = measureText(src, 1, 'micro') + SOURCE_GAP;
    // the source leads only when the whole headline still fits on one page with it
    if (pages.length === 1 && measureText(body) <= room - srcW) withSource = true;
  }
  return pages.map((s, i) =>
    Object.freeze({
      id: `${base}#${i}`,
      base,
      label,
      plate,
      x,
      source: i === 0 && withSource ? src : '',
      text: s,
      value: '',
      glyph: null,
      breaking,
      page: i,
      pages: pages.length,
      dur: tickerHold(wordCount(s)), // pace.js: push + base + per word, within [minHold, maxHold]
    })
  );
}

/** First entry of an item (single-page items are the common case). */
export const makeEntry = (item) => makeEntries(item)[0] || null;

/**
 * A "bottom line" entry for an aired figure: { value: '$82', label: 'OIL',
 * dir: 'up' | 'down' | 'flat', market }. The direction glyph is shape only
 * (silver) and only for market figures (money-minute.md 3.6). Null when it
 * does not fit the band.
 */
export function makeFigureEntry({ value = '', label = '' } = {}, { dir = null, market = false, plateLabel = 'BOTTOM LINE' } = {}) {
  const v = String(value || '').trim().toUpperCase();
  const l = String(label || '').trim().toUpperCase();
  if (!v || !l) return null;
  const x = plateWidth(plateLabel) + ITEM_GAP;
  const glyph = market && (dir === 'up' || dir === 'down' || dir === 'flat') ? dir : null;
  const w = measureText(l) + VALUE_GAP + measureText(v) + (glyph ? VALUE_GAP + GLYPH_W : 0);
  if (x + w > TICKER.right) return null;
  const base = `${plateLabel}|${l}|${v}|${glyph}`;
  return Object.freeze({
    id: base,
    base,
    label: plateLabel,
    plate: P.yellow,
    x,
    source: '',
    text: l,
    value: v,
    glyph,
    breaking: false,
    page: 0,
    pages: 1,
    dur: tickerHold(wordCount(l) + 1),
  });
}

/** One static entry: the NEWS IN 60 "UP NEXT" plate (ink plate, no flipping). */
export function makeNextEntry(title) {
  const text = String(title || '').trim().toUpperCase();
  if (!text) return null;
  const label = 'UP NEXT';
  return Object.freeze({
    id: `next|${text}`,
    base: `next|${text}`,
    label,
    plate: P.ink,
    x: plateWidth(label) + ITEM_GAP,
    source: '',
    text,
    value: '',
    glyph: null,
    breaking: false,
    page: 0,
    pages: 1,
    dur: Infinity,
  });
}

/** Tracks the flipper: the entry on air, when it started, and the one it replaced. */
export class TickerState {
  constructor() {
    this.list = [];
    this.key = null;
    this.cur = null;
    this.prev = null;
    this.idx = -1;
    this.start = 0;
    this.heldAt = null; // the flipper pauses (no pushes) while a full-screen card is up
    this.shownBreaking = new Set(); // breaking items that have already interrupted once
  }

  /** `hold`: keep the entry on air without pushing (time spent held does not count). */
  update(t, list, key, hold = false) {
    if (hold) {
      if (this.heldAt === null) this.heldAt = t;
      return;
    }
    if (this.heldAt !== null) {
      this.start += t - this.heldAt;
      this.heldAt = null;
    }
    if (key !== this.key) {
      const old = this.list;
      this.key = key;
      this.list = list;
      // a breaking item interrupts whatever is showing, once: later list rebuilds
      // (schedule, ticker refresh) just keep it in the rotation
      const breaking = list.findIndex((e) => e.breaking && e.page === 0 && !this.shownBreaking.has(e.base));
      if (breaking >= 0) {
        this.shownBreaking.add(list[breaking].base);
        if (this.shownBreaking.size > 20) this.shownBreaking.delete(this.shownBreaking.values().next().value);
        this.push(t, breaking);
        return;
      }
      if (!this.cur) {
        if (list.length) this.push(t, 0);
        return;
      }
      const id = this.cur.id;
      this.idx = list.findIndex((e) => e.id === id);
      // a static entry (or a mode change) replaces the rotation at once
      if (this.idx < 0 && list.length && (list[0].dur === Infinity || this.cur.dur === Infinity)) {
        this.push(t, 0);
        return;
      }
      // the entry on air left the list (the story it repeats came on the strap): the
      // rotation carries on from where it was instead of starting again at the top
      if (this.idx < 0) this.idx = resumeAt(old, list, id) - 1;
    }
    if (!this.cur || t < this.start + this.cur.dur) return;
    if (!this.list.length) {
      this.prev = this.cur;
      this.cur = null;
      this.start = t;
      return;
    }
    const idx = (this.idx + 1) % this.list.length;
    const next = this.list[idx];
    // keep the rhythm exact, unless we were away (tab hidden) for a while
    const start = t - (this.start + this.cur.dur) > 1 ? t : this.start + this.cur.dur;
    this.idx = idx;
    if (next.id === this.cur.id) {
      this.start = start; // the only entry: it simply stays (no push of itself)
      return;
    }
    this.prev = this.cur;
    this.cur = next;
    this.start = start;
    paceTrace({ k: 'ticker', id: next.id, hold: next.dur }); // PACE trace (no-op outside the recorder)
  }

  push(t, idx) {
    this.prev = this.cur;
    this.cur = this.list[idx];
    this.idx = idx;
    this.start = t;
  }
}

/** Index in `list` of the first entry that followed entry `id` in `old` (0 when none survives). */
function resumeAt(old, list, id) {
  const from = old.findIndex((e) => e.id === id);
  for (let k = 1; k <= old.length; k++) {
    const cand = old[(from + k + old.length) % old.length];
    const j = list.findIndex((e) => e.id === cand.id);
    if (j >= 0) return j;
  }
  return 0;
}

// 5x5 direction glyphs, hand-placed (money-minute.md 3.6): a north-east arrow
// (diagonal shaft, 2 px head), a south-east arrow and "=" for flat.
const GLYPHS = {
  up: ['..###', '...##', '..#.#', '.#...', '#....'],
  down: ['#....', '.#...', '..#.#', '...##', '..###'],
  flat: ['#####', '.....', '.....', '#####', '.....'],
};
function drawGlyph(ctx, dir, x, y) {
  const rows = GLYPHS[dir];
  if (!rows) return;
  ctx.fillStyle = P.silver;
  for (let r = 0; r < 5; r++) {
    const row = rows[r];
    for (let c = 0; c < 5; c++) if (row.charCodeAt(c) === 35) ctx.fillRect(x + c, y + r, 1, 1);
  }
}

function drawEntry(ctx, e, y) {
  let x = e.x;
  if (e.source) {
    drawText(ctx, e.source, x, y + 5, SOURCE_STYLE);
    x += measureText(e.source, 1, 'micro') + SOURCE_GAP;
  }
  if (e.value) {
    // a figure: silver label, white value, then the glyph centred on the caps
    x += drawText(ctx, e.text, x, y + 4, LABEL_STYLE) + VALUE_GAP;
    x += drawText(ctx, e.value, x, y + 4, TEXT_STYLE);
    if (e.glyph) drawGlyph(ctx, e.glyph, x + VALUE_GAP, y + 5);
    return;
  }
  drawText(ctx, e.text, x, y + 4, TEXT_STYLE);
}

function drawPlate(ctx, e, y, w) {
  const label = e ? e.label : 'LATEST';
  const color = e ? e.plate : P.yellow;
  rect(ctx, 0, y, w, TICKER.h, color);
  drawText(ctx, label, TICKER.textX, y + 4, color === P.ink ? NEXT_STYLE : plateStyle(color));
}

/**
 * Draw the ticker band. `inAt` is when the band came on (it slides up), `outAt`
 * when it started to leave (null while on air).
 */
export function drawTicker(ctx, t, s, inAt, outAt = null) {
  const h = TICKER.h;
  const k0 = outAt === null ? 1 - easeOut((t - inAt - T.bandDelay) / T.bandIn) : easeIn((t - outAt) / T.bandOut);
  const slide = Math.round(k0 * (h + 1));
  if (slide > h) return;
  const y = TICKER.y + slide;
  rect(ctx, 0, y, W, h, P.black);
  rect(ctx, 0, y, W, 1, P.ink);
  const held = s.heldAt !== null;
  const k = held ? 1 : easeInOut((t - s.start) / T.push);
  const pushing = k < 1 && !!s.prev;
  const shown = s.cur || s.prev;
  // the plate pushes with the item only when its label or colour changes, and eases to its new width
  const plateChanges = pushing && s.cur && (s.prev.label !== s.cur.label || s.prev.plate !== s.cur.plate);
  const curW = plateWidth(shown ? shown.label : 'LATEST');
  const plateW = plateChanges ? Math.round(lerp(plateWidth(s.prev.label), curW, k)) : curW;
  // items push up inside the band; nothing ever passes the action-safe margin
  clipStart(ctx, plateW, y + 1, TICKER.right + 1 - plateW, h - 1);
  try {
    if (pushing) drawEntry(ctx, s.prev, y - Math.round(k * h));
    if (s.cur) drawEntry(ctx, s.cur, y + (pushing ? Math.round((1 - k) * h) : 0));
  } finally {
    clipEnd(ctx);
  }
  if (plateChanges) {
    clipStart(ctx, 0, y, plateW, h);
    try {
      drawPlate(ctx, s.prev, y - Math.round(k * h), plateW);
      drawPlate(ctx, s.cur, y + Math.round((1 - k) * h), plateW);
    } finally {
      clipEnd(ctx);
    }
  } else drawPlate(ctx, shown, y, plateW);
}

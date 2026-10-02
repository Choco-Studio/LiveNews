// Ticker: a 14 px band at the foot of the screen with a BBC-style flipper, one
// headline at a time pushed up in 0.3 s and held 1.5 s + 0.4 s per word. It
// never scrolls: a headline too wide for the band is split at phrase
// boundaries into pages (each but the last ends with an ellipsis) that flip
// like separate items, so every state on air is whole words inside the
// action-safe margin. The micro source label leads an item when it fits. The
// plate reads LATEST (black on yellow), BREAKING (red) for a breaking item, or
// NEXT for the coming programme when the schedule is known.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TICKER, inkOn, easeOut, easeIn, easeInOut, rect, clipped } from './layout.js';
import { linePages } from './breaks.js';

export const TICKER_TIMING = { push: 0.3, base: 1.5, perWord: 0.4, bandIn: 0.35, bandDelay: 0.15, bandOut: 0.25 };
const T = TICKER_TIMING;

const PLATE_W = TICKER.textX + measureText('BREAKING') + 6;
const ITEM_X = PLATE_W + 6;
/** Room for an item's text, from after the plate to the action-safe margin. */
export const TICKER_ROOM = TICKER.right - ITEM_X;
const SOURCE_GAP = 5;
const MAX_PAGES = 3;

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

/**
 * The flipper entries for one ticker item: usually one, or 2-3 pages for a
 * long headline. Entry: { id, base, label, plate, source, text, breaking, page,
 * pages, dur }. The source label leads the first page when the item still
 * fits in as many pages with it as without it.
 */
export function makeEntries({ label = 'LATEST', plate = P.yellow, source = '', text = '', breaking = false }) {
  const src = String(source || '').trim();
  const body = String(text || '').trim();
  if (!body) return [];
  const base = `${label}|${src}|${body}`;
  const srcW = src ? measureText(src, 1, 'micro') + SOURCE_GAP : 0;
  let pages = linePages(body, TICKER_ROOM, { maxPages: MAX_PAGES });
  let withSource = false;
  if (srcW && TICKER_ROOM - srcW > TICKER_ROOM / 2) {
    const sourced = linePages(body, TICKER_ROOM, { firstMaxW: TICKER_ROOM - srcW, maxPages: MAX_PAGES });
    if (sourced.length <= pages.length && sourced.join(' ').length >= pages.join(' ').length) {
      pages = sourced;
      withSource = true;
    }
  }
  return pages.map((s, i) =>
    Object.freeze({
      id: `${base}#${i}`,
      base,
      label,
      plate,
      source: i === 0 && withSource ? src : '',
      text: s,
      breaking,
      page: i,
      pages: pages.length,
      dur: T.push + T.base + T.perWord * wordCount(s),
    })
  );
}

/** First entry of an item (single-page items are the common case). */
export const makeEntry = (item) => makeEntries(item)[0] || null;

/** Tracks the flipper: the entry on air, when it started, and the one it replaced. */
export class TickerState {
  constructor() {
    this.list = [];
    this.key = null;
    this.cur = null;
    this.prev = null;
    this.idx = -1;
    this.start = 0;
    this.shownBreaking = new Set(); // breaking items that have already interrupted once
  }

  update(t, list, key) {
    if (key !== this.key) {
      this.key = key;
      this.list = list;
      // a breaking item interrupts whatever is showing, once: later list rebuilds
      // (schedule, ticker refresh) just keep it in the rotation
      const breaking = list.findIndex((e) => e.breaking && e.page === 0 && !this.shownBreaking.has(e.base));
      if (breaking >= 0) {
        this.shownBreaking.add(list[breaking].base);
        if (this.shownBreaking.size > 20) this.shownBreaking.delete(this.shownBreaking.values().next().value);
        this.prev = this.cur;
        this.cur = list[breaking];
        this.idx = breaking;
        this.start = t;
        return;
      }
      if (!this.cur) {
        if (list.length) {
          this.prev = null;
          this.cur = list[0];
          this.idx = 0;
          this.start = t;
        }
        return;
      }
      const id = this.cur.id;
      this.idx = list.findIndex((e) => e.id === id);
    }
    if (!this.cur || t < this.start + this.cur.dur) return;
    this.prev = this.cur;
    if (!this.list.length) {
      this.cur = null;
      return;
    }
    this.idx = (this.idx + 1) % this.list.length;
    const next = this.list[this.idx];
    // keep the rhythm exact, unless we were away (tab hidden) for a while
    this.start = t - (this.start + this.cur.dur) > 1 ? t : this.start + this.cur.dur;
    this.cur = next;
  }
}

function drawEntry(ctx, e, y) {
  let x = ITEM_X;
  if (e.source) {
    drawText(ctx, e.source, x, y + 5, { color: P.silver, font: 'micro' });
    x += measureText(e.source, 1, 'micro') + SOURCE_GAP;
  }
  drawText(ctx, e.text, x, y + 4, { color: P.white });
}

function drawPlate(ctx, e, y) {
  const label = e ? e.label : 'LATEST';
  const color = e ? e.plate : P.yellow;
  rect(ctx, 0, y, PLATE_W, TICKER.h, color);
  drawText(ctx, label, TICKER.textX, y + 4, { color: inkOn(color) });
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
  const k = easeInOut((t - s.start) / T.push);
  const pushing = k < 1;
  // items push up inside the band; nothing ever passes the action-safe margin
  clipped(ctx, PLATE_W, y + 1, TICKER.right + 1 - PLATE_W, h - 1, () => {
    if (pushing && s.prev) drawEntry(ctx, s.prev, y - Math.round(k * h));
    if (s.cur) drawEntry(ctx, s.cur, y + (pushing ? Math.round((1 - k) * h) : 0));
  });
  // the plate pushes with the item only when its label or colour changes
  const plateChanges = pushing && s.prev && s.cur && (s.prev.label !== s.cur.label || s.prev.plate !== s.cur.plate);
  if (plateChanges) {
    clipped(ctx, 0, y, PLATE_W, h, () => {
      drawPlate(ctx, s.prev, y - Math.round(k * h));
      drawPlate(ctx, s.cur, y + Math.round((1 - k) * h));
    });
  } else drawPlate(ctx, s.cur || s.prev, y);
}

// Ticker: a 14 px band at the foot of the screen with a BBC-style flipper,
// one headline at a time pushed up in 0.3 s and held 1.5 s + 0.4 s per word.
// A headline too wide for the band glides left at 35 px/s after a pause. The
// plate reads LATEST (black on yellow), BREAKING (red) for a breaking item, or
// NEXT for the coming programme when the schedule is known.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W, TICKER, inkOn, easeOut, easeInOut, rect, clipped } from './layout.js';

export const TICKER_TIMING = { push: 0.3, base: 1.5, perWord: 0.4, glideWait: 1.2, glideSpeed: 35, glideHold: 1.0 };
const T = TICKER_TIMING;

const PLATE_W = TICKER.textX + measureText('BREAKING') + 6;
const ITEM_X = PLATE_W + 6;
const ROOM = TICKER.right - ITEM_X;
const SOURCE_GAP = 5;

/** A ticker entry: { id, label, plate, source, text, breaking, width, dur }. */
export function makeEntry({ label = 'LATEST', plate = P.yellow, source = '', text = '', breaking = false }) {
  const src = String(source || '').trim();
  const body = String(text || '').trim();
  const width = (src ? measureText(src, 1, 'micro') + SOURCE_GAP : 0) + measureText(body);
  const words = body.split(/\s+/).filter(Boolean).length;
  const over = width - ROOM;
  const glide = over > 0 ? T.glideWait + over / T.glideSpeed + T.glideHold : 0;
  return { id: `${label}|${src}|${body}`, label, plate, source: src, text: body, breaking, width, dur: T.push + Math.max(T.base + T.perWord * words, glide) };
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
  }

  update(t, list, key) {
    if (key !== this.key) {
      this.key = key;
      this.list = list;
      const breaking = list.findIndex((e) => e.breaking);
      if (breaking >= 0 && !this.cur?.breaking) {
        // a breaking item interrupts whatever is showing
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

function drawEntry(ctx, e, t, start, y) {
  const local = t - start - T.push;
  const over = e.width - ROOM;
  const shift = over > 0 ? Math.round(Math.min(over, Math.max(0, local - T.glideWait) * T.glideSpeed)) : 0;
  let x = ITEM_X - shift;
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

/** Draw the ticker band; `onAt` is when the graphics came on (the band slides up). */
export function drawTicker(ctx, t, s, onAt) {
  const slide = Math.round((1 - easeOut((t - onAt - 0.15) / 0.35)) * (TICKER.h + 1));
  const y = TICKER.y + slide;
  rect(ctx, 0, y, W, TICKER.h, P.black);
  rect(ctx, 0, y, W, 1, P.ink);
  const k = easeInOut((t - s.start) / T.push);
  const pushing = k < 1;
  const h = TICKER.h;
  // text slides under the plate on the left and off the screen edge on the right, like a real crawl;
  // a glide still stops with the last word inside the safe margin (ROOM)
  clipped(ctx, PLATE_W, y + 1, W - PLATE_W, h - 1, () => {
    if (pushing && s.prev) drawEntry(ctx, s.prev, t, s.start - s.prev.dur, y - Math.round(k * h));
    if (s.cur) drawEntry(ctx, s.cur, t, s.start, y + (pushing ? Math.round((1 - k) * h) : 0));
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

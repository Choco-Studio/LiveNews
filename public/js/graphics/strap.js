// Lower third ("strap"): an 11 px tag row (kicker or category in the
// programme accent, then the source in micro type or, the first time a
// presenter speaks, their name) over a 17 px ink headline bar.
// Timing per docs/ART_DIRECTION.md: the bar wipes in left to right in 0.35 s
// (ease-out, whole pixels), the text rises in 0.1 s after it, a story change
// flips the text in 0.3 s and keeps the bar, the exit takes 0.25 s. Breaking
// news turns the strap red with one calm wipe; no flashing.
// The strap never scrolls: a headline wider than the bar (a long live
// breaking item) is shown as phrase pages (graphics/breaks.js) that flip with
// the same 0.3 s push. A breaking strap pages through once and holds its last
// page; a story strap shows its second page once and returns to the first.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { STRAP, inkOn, easeOut, easeIn, easeInOut, lerp, rect, clipped } from './layout.js';
import { linePages } from './breaks.js';

export const STRAP_TIMING = { in: 0.35, textDelay: 0.1, textRise: 0.2, flip: 0.3, out: 0.25, red: 0.45, name: 5, page: 5, breakingPage: 4 };
const T = STRAP_TIMING;

const BAR_W = STRAP.right - STRAP.x;
const TEXT_X = STRAP.x + 5; // aligned with the tag text above
/** Room for headline text inside the bar. */
export const TEXT_ROOM = STRAP.right - 5 - TEXT_X;
const TEXT_Y = 3; // cap line inside the tag row: 3 px above for accents, the bar's accent line below
const BAR = P.ink;
const BAR_HI = P.slate; // 1 px lit edge under the accent line: separates the bar from dark ink sets
const BAR_RED = P.darkRed;

const CATEGORY_LABEL = {
  world: 'WORLD', politics: 'POLITICS', business: 'BUSINESS', tech: 'TECH', science: 'SCIENCE', health: 'HEALTH',
  climate: 'CLIMATE', sport: 'SPORT', sports: 'SPORT', culture: 'CULTURE', general: 'NEWS',
};
export const categoryLabel = (c) => (c ? CATEGORY_LABEL[String(c).toLowerCase()] || String(c).toUpperCase() : '');

/**
 * Build the strap content from a lower-third object. `accent` is the programme
 * accent. Returns { key, tag, tagColor, plate, name, headline, breaking, since }.
 */
export function strapContent(lt, { accent = P.red, category = '' } = {}) {
  const breaking = !!lt.breaking;
  const kicker = lt.kicker ? String(lt.kicker).trim() : '';
  const cat = categoryLabel(lt.category || category);
  const source = lt.source ? String(lt.source).trim() : '';
  let tag = breaking ? 'BREAKING' : kicker || cat || source;
  if (!tag) tag = 'NEWS';
  const plate = tag === source ? '' : source;
  const headline = String(lt.headline || '').trim();
  const pages = linePages(headline, TEXT_ROOM);
  return {
    key: `${breaking ? 1 : 0}|${tag}|${headline}`,
    tag,
    tagColor: breaking ? P.red : accent,
    plate,
    name: lt.showName && lt.anchorName ? String(lt.anchorName) : '',
    headline,
    pages: pages.length ? pages : [''],
    breaking,
    since: Number.isFinite(lt.since) ? lt.since : 0,
  };
}

/** Seconds from the text coming up until a strap has shown all its pages once. */
export const strapReadTime = (c) => (c.pages.length - 1) * (c.breaking ? T.breakingPage : T.page);

/**
 * Page on air `local` seconds after the strap's text came up, written into
 * `out` = { i, from, k } (k < 1 while flipping from page `from` to page `i`).
 */
export function strapPage(c, local, out = { i: 0, from: 0, k: 1 }) {
  const n = c.pages.length;
  out.i = 0;
  out.from = 0;
  out.k = 1;
  if (n < 2 || local <= 0) return out;
  const hold = c.breaking ? T.breakingPage : T.page;
  const flips = c.breaking ? n - 1 : n; // breaking: once through; story: once through and back to page 1
  const step = Math.min(flips, Math.floor(local / hold));
  if (step === 0) return out;
  out.i = step % n;
  out.from = (step - 1) % n;
  out.k = easeInOut((local - step * hold) / T.flip);
  return out;
}

/** Tracks what the strap shows so it can wipe, flip, turn red and leave smoothly. */
export class StrapState {
  constructor() {
    this.cur = null;
    this.prev = null;
    this.inAt = 0;
    this.outAt = null;
    this.flipAt = -Infinity;
    this.redAt = -Infinity;
    this.redFrom = false;
    this.tagFromW = 0;
    this.textAt = 0; // when the current content's text is fully up (pages count from here)
    this.prevPage = 0; // page the previous content showed when it was flipped away
  }

  reset() {
    this.cur = null;
    this.prev = null;
    this.outAt = null;
  }

  /** Bar reveal 0..1 (in, hold, out). */
  reveal(t) {
    if (!this.cur) return 0;
    const rin = easeOut((t - this.inAt) / T.in);
    const rout = this.outAt === null ? 0 : easeIn((t - this.outAt) / T.out);
    return rin * (1 - rout);
  }

  /** `lead`: seconds to hold back a fresh entry (lets captions move out of the way first). */
  update(t, want, lead = 0) {
    if (!want) {
      if (this.cur && this.outAt === null) this.outAt = t;
      if (this.cur && this.outAt !== null && t - this.outAt >= T.out) this.reset();
      return;
    }
    if (!this.cur) {
      this.cur = want;
      this.prev = null;
      this.inAt = Math.max(t + lead, want.since);
      this.textAt = this.inAt + T.in + T.textDelay + T.textRise;
      this.outAt = null;
      this.flipAt = -Infinity;
      this.redAt = -Infinity;
      return;
    }
    if (this.outAt !== null) {
      // called back while leaving: wipe in again from where the bar is now
      const r = this.reveal(t);
      this.outAt = null;
      this.inAt = t - (1 - Math.cbrt(1 - r)) * T.in;
      if (want.key !== this.cur.key) {
        this.redAt = want.breaking !== this.cur.breaking ? t : this.redAt;
        this.redFrom = this.cur.breaking;
        this.cur = want;
        this.flipAt = -Infinity;
        this.textAt = t;
      }
      return;
    }
    if (want.key === this.cur.key) return;
    const textShown = t >= this.inAt + T.in + T.textDelay;
    this.tagFromW = this.tagWidth(t);
    if (want.breaking !== this.cur.breaking) {
      this.redAt = t;
      this.redFrom = this.cur.breaking;
    }
    if (textShown) {
      this.prevPage = strapPage(this.cur, t - this.textAt, SCRATCH).i;
      this.prev = this.cur;
      this.flipAt = t;
      this.textAt = t + T.flip;
    }
    this.cur = want;
  }

  /** Width of the accent tag right now (it eases between texts on a flip). */
  tagWidth(t) {
    if (!this.cur) return 0;
    const w = measureText(this.cur.tag) + 10;
    const k = easeInOut((t - this.flipAt) / T.flip);
    return k >= 1 || !this.prev ? w : Math.round(lerp(this.tagFromW, w, k));
  }
}

const SCRATCH = { i: 0, from: 0, k: 1 };
const PAGE_NOW = { i: 0, from: 0, k: 1 };

// The black plate beside the tag: the presenter's name for the first seconds
// (name super), then the source in micro type. `k` is the name -> source push
// (0 = name, 1 = source) of content `c` at time t.
const plateK = (c, t) => (c.name ? easeInOut((t - c.since - T.name) / T.flip) : 1);
const nameW = (c) => (c.name ? measureText(c.name) + 10 : 0);
const sourceW = (c) => (c.plate ? measureText(c.plate, 1, 'micro') + 10 : 0);
function plateWidth(c, k) {
  if (k <= 0) return nameW(c);
  if (k >= 1) return sourceW(c);
  return Math.round(lerp(nameW(c), sourceW(c), k));
}
function drawName(ctx, c, x, y) {
  if (c.name) drawText(ctx, c.name, x + 5, y + TEXT_Y, { color: P.white });
}
function drawSource(ctx, c, x, y) {
  if (c.plate) drawText(ctx, c.plate, x + 5, y + TEXT_Y, { color: P.silver, font: 'micro' });
}
/** Draw one plate label with a vertical offset (name and source push past each other). */
function drawPlateLabel(ctx, c, k, x, y, h, dy) {
  if (k <= 0) drawName(ctx, c, x, y + dy);
  else if (k >= 1) drawSource(ctx, c, x, y + dy);
  else {
    drawName(ctx, c, x, y + dy - Math.round(k * h));
    drawSource(ctx, c, x, y + dy + Math.round((1 - k) * h));
  }
}
const samePlate = (a, ka, b, kb) => ka === kb && (ka >= 1 ? a.plate === b.plate : a.name === b.name);

function drawLine(ctx, text, dy) {
  drawText(ctx, text, TEXT_X, STRAP.barY + 5 + dy, { color: P.white });
}

/** Draw the strap for state `s` at time t. */
export function drawStrap(ctx, t, s) {
  const c = s.cur;
  if (!c) return;
  const rin = easeOut((t - s.inAt) / T.in);
  const rout = s.outAt === null ? 0 : easeIn((t - s.outAt) / T.out);
  const barVis = Math.round(BAR_W * rin * (1 - rout));
  if (barVis <= 0) return;

  // --- headline bar (colour wipe when it turns red or back)
  const redK = easeInOut((t - s.redAt) / T.red);
  const base = c.breaking ? BAR_RED : BAR;
  clipped(ctx, STRAP.x, STRAP.barY, barVis, STRAP.barH, () => {
    const split = redK < 1 ? Math.round(BAR_W * redK) : BAR_W;
    if (split < BAR_W) {
      const from = s.redFrom ? BAR_RED : BAR;
      rect(ctx, STRAP.x, STRAP.barY, BAR_W, STRAP.barH, from);
      if (from === BAR) rect(ctx, STRAP.x + split, STRAP.barY + 1, BAR_W - split, 1, BAR_HI);
    }
    rect(ctx, STRAP.x, STRAP.barY, split, STRAP.barH, base);
    if (base === BAR) rect(ctx, STRAP.x, STRAP.barY + 1, split, 1, BAR_HI);
    // 1 px accent line along the top ties the bar to the tag and lifts it off dark sets
    const line = c.breaking ? P.red : c.tagColor;
    rect(ctx, STRAP.x, STRAP.barY, BAR_W, 1, s.prev && redK < 1 ? s.prev.tagColor : line);
    if (redK < 1) rect(ctx, STRAP.x, STRAP.barY, split, 1, line);
    rect(ctx, STRAP.x, STRAP.barY + STRAP.barH - 1, BAR_W, 1, P.black);

    const textK = easeOut((t - s.inAt - T.in - T.textDelay) / T.textRise);
    if (textK <= 0) return;
    clipped(ctx, TEXT_X - 2, STRAP.barY + 2, TEXT_ROOM + 4, STRAP.barH - 3, () => {
      const fk = easeInOut((t - s.flipAt) / T.flip);
      if (s.prev && fk < 1) {
        drawLine(ctx, s.prev.pages[s.prevPage] ?? '', -Math.round(fk * 12));
        drawLine(ctx, c.pages[0], Math.round((1 - fk) * 12));
        return;
      }
      const pg = strapPage(c, t - s.textAt, PAGE_NOW);
      if (pg.k < 1) {
        drawLine(ctx, c.pages[pg.from], -Math.round(pg.k * 12));
        drawLine(ctx, c.pages[pg.i], Math.round((1 - pg.k) * 12));
      } else drawLine(ctx, c.pages[pg.i], Math.round((1 - textK) * 6));
    });
  });

  // --- tag row: accent tag + black plate, revealed with the bar (slightly behind)
  const tagIn = easeOut((t - s.inAt - 0.05) / T.in);
  const fk = easeInOut((t - s.flipAt) / T.flip);
  const flipping = !!s.prev && fk < 1;
  const tagW = s.tagWidth(t);
  const pk = plateK(c, t);
  const prevK = flipping ? plateK(s.prev, s.flipAt) : 1;
  const plateChanges = flipping && !samePlate(s.prev, prevK, c, pk);
  const plateW = plateChanges ? Math.round(lerp(plateWidth(s.prev, prevK), plateWidth(c, pk), fk)) : plateWidth(c, pk);
  const rowVis = Math.round((tagW + plateW) * tagIn * (1 - rout));
  if (rowVis <= 0) return;
  const y = STRAP.tagY;
  const h = STRAP.tagH;
  const textK = easeOut((t - s.inAt - T.in - T.textDelay) / T.textRise);
  clipped(ctx, STRAP.x, y, rowVis, h, () => {
    // tag colour changes with the same wipe as the bar
    const prevColor = flipping ? s.prev.tagColor : c.tagColor;
    rect(ctx, STRAP.x, y, tagW, h, prevColor);
    if (prevColor !== c.tagColor) rect(ctx, STRAP.x, y, Math.round(tagW * redK), h, c.tagColor);
    if (textK > 0) {
      clipped(ctx, STRAP.x, y, tagW, h, () => {
        if (flipping && s.prev.tag !== c.tag) {
          drawText(ctx, s.prev.tag, STRAP.x + 5, y + TEXT_Y - Math.round(fk * h), { color: inkOn(s.prev.tagColor) });
          drawText(ctx, c.tag, STRAP.x + 5, y + TEXT_Y + Math.round((1 - fk) * h), { color: inkOn(c.tagColor) });
        } else drawText(ctx, c.tag, STRAP.x + 5, y + TEXT_Y + Math.round((1 - textK) * 4), { color: inkOn(c.tagColor) });
      });
    }
    if (plateW > 0) {
      const px = STRAP.x + tagW;
      rect(ctx, px, y, plateW, h, P.black);
      if (textK > 0) {
        clipped(ctx, px, y, plateW, h, () => {
          if (plateChanges) {
            drawPlateLabel(ctx, s.prev, prevK, px, y, h, -Math.round(fk * h));
            drawPlateLabel(ctx, c, pk, px, y, h, Math.round((1 - fk) * h));
          } else drawPlateLabel(ctx, c, pk, px, y, h, Math.round((1 - textK) * 4));
        });
      }
    }
  });
}

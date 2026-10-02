// Lower third ("strap"): an 11 px tag row (kicker or category in the
// programme accent, then the source in micro type or, the first time a
// presenter speaks, their name) over an ink headline bar.
// Timing per docs/ART_DIRECTION.md: the bar wipes in left to right in 0.35 s
// (ease-out, whole pixels) and the text rises 0.1 s after the wipe starts,
// uncovered by it, so it lands as the bar settles (no empty-bar beat); a story
// change flips the text in 0.3 s and keeps the bar; the exit takes 0.25 s.
// Breaking news turns the strap red with one calm wipe; no flashing.
// The strap never scrolls and never shows a scrap: a story headline wider than
// the bar gets a two-line bar (26 px, the tag row rides 9 px higher) with two
// balanced phrase lines. Only a long live breaking item is paged: one-line
// phrase pages (graphics/breaks.js) that flip with the same 0.3 s push, once
// through, holding the last page. NEWS IN 60 turns the bar's 1 px top line
// into its progress rule (slate track, yellow fill, whole pixels, never shrinking).
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { STRAP, inkOn, easeOut, easeIn, easeInOut, lerp, rect, clipStart, clipEnd } from './layout.js';
import { linePages, layoutText, withEllipsis, ELLIPSIS_W } from './breaks.js';
import { CHANNEL } from '../pace.js';

// PACE: in/out/flip and dwell (name super, page holds) from the one pacing table (pace.js CHANNEL.strap)
export const STRAP_TIMING = CHANNEL.strap;
const T = STRAP_TIMING;

const BAR_W = STRAP.right - STRAP.x; // 346
const TEXT_X = STRAP.x + 5; // aligned with the tag text above
/** Room for headline text inside the bar. */
export const TEXT_ROOM = STRAP.right - 5 - TEXT_X;
/** Bar tops: one line (17 px) or two lines (26 px); the bottom never moves. */
export const BAR_TOP = { one: STRAP.barY, two: STRAP.bottom - 26 };
const LINE_PITCH = 10; // two-line bar: 5 px above, 7 px caps, 3 px gap, 7 px caps, 4 px below
const BAR = P.ink;
const BAR_HI = P.slate; // 1 px lit edge under the accent line: separates the bar from dark ink sets
const BAR_RED = P.darkRed;
// Tag-row type: body caps sit 2 px from the top of the 11 px row (2 above, 2 below), sharing a
// centre line with the micro source (5 px caps at +3); a string with accented capitals drops 1 px
// so its marks stay inside the row.
const ACCENTED = /[À-Ýà-ý]/;
const rowY = (text) => (ACCENTED.test(text) ? 3 : 2);
const MICRO_Y = 3;
// Lead-in rules for breaking pages: no page a scrap, and a page on its own reads as a continuation.
const PAGE_RULES = { lead: true, minShare: 0.4, minWords: 4, maxPages: 4 };

const CATEGORY_LABEL = {
  world: 'WORLD', politics: 'POLITICS', business: 'BUSINESS', tech: 'TECH', science: 'SCIENCE', health: 'HEALTH',
  climate: 'CLIMATE', sport: 'SPORT', sports: 'SPORT', culture: 'CULTURE', general: 'NEWS',
};
export const categoryLabel = (c) => (c ? CATEGORY_LABEL[String(c).toLowerCase()] || String(c).toUpperCase() : '');

// Constant text styles (no allocation per frame).
const WHITE = Object.freeze({ color: P.white });
const SOURCE_STYLE = Object.freeze({ color: P.silver, font: 'micro' });
const inkStyles = new Map();
const inkStyle = (color) => {
  let s = inkStyles.get(color);
  if (!s) inkStyles.set(color, (s = Object.freeze({ color: inkOn(color) })));
  return s;
};

/** Headline pages: arrays of lines (one line, or two on a two-line bar). */
function headlinePages(headline, breaking) {
  if (!headline) return [['']];
  if (measureText(headline) <= TEXT_ROOM) return [[headline]];
  if (breaking) return linePages(headline, TEXT_ROOM, PAGE_RULES).map((line) => [line]);
  // a story keeps its whole headline on screen: two balanced lines, no paging
  const pages = layoutText(headline, { maxW: TEXT_ROOM, perPage: 2, more: ELLIPSIS_W, minWords: 2 });
  return pages.map((p, i) => {
    if (i === pages.length - 1) return [...p.lines];
    const lines = [...p.lines];
    lines[lines.length - 1] = withEllipsis(lines[lines.length - 1]);
    return lines;
  });
}

/**
 * Build the strap content from a lower-third object. `accent` is the programme
 * accent. Tag: BREAKING, else the kicker, else the category, else the place
 * (`lt.place`), else NEWS; the source always goes in the micro plate.
 */
export function strapContent(lt, { accent = P.red, category = '' } = {}) {
  const breaking = !!lt.breaking;
  const kicker = lt.kicker ? String(lt.kicker).trim() : '';
  const cat = categoryLabel(lt.category || category);
  const place = lt.place ? String(lt.place).trim().toUpperCase() : '';
  const source = lt.source ? String(lt.source).trim() : '';
  const tag = breaking ? 'BREAKING' : kicker || cat || place || 'NEWS';
  const headline = String(lt.headline || '').trim();
  const pages = headlinePages(headline, breaking);
  const twoLine = pages.some((p) => p.length > 1);
  const tagColor = breaking ? P.red : accent;
  const name = lt.showName && lt.anchorName ? String(lt.anchorName) : '';
  return {
    key: `${breaking ? 1 : 0}|${tag}|${headline}`,
    tag,
    tagColor,
    tagStyle: inkStyle(tagColor),
    tagY: rowY(tag),
    tagW: measureText(tag) + 10,
    plate: source,
    name,
    nameY: rowY(name),
    headline,
    pages,
    twoLine,
    barY: twoLine ? BAR_TOP.two : BAR_TOP.one,
    breaking,
    since: Number.isFinite(lt.since) ? lt.since : 0,
  };
}

/** Seconds from the text coming up until a strap has shown all its pages once. */
export const strapReadTime = (c) => (c.pages.length - 1) * (c.breaking ? T.breakingPage : T.page);

/**
 * Page on air `local` seconds after the strap's text came up, written into
 * `out` = { i, from, k } (k < 1 while flipping from page `from` to page `i`).
 * Pages go through once and the last one holds.
 */
export function strapPage(c, local, out = { i: 0, from: 0, k: 1 }) {
  const n = c.pages.length;
  out.i = 0;
  out.from = 0;
  out.k = 1;
  if (n < 2 || local <= 0) return out;
  const hold = c.breaking ? T.breakingPage : T.page;
  const step = Math.min(n - 1, Math.floor(local / hold));
  if (step === 0) return out;
  out.i = step;
  out.from = step - 1;
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
    this.progress = null; // NEWS IN 60 progress rule (0..1), null = the plain accent line
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

  /** Top of the headline bar right now (it eases between one and two lines on a flip). */
  barY(t) {
    const c = this.cur;
    if (!c) return BAR_TOP.one;
    const k = easeInOut((t - this.flipAt) / T.flip);
    return k >= 1 || !this.prev ? c.barY : Math.round(lerp(this.prev.barY, c.barY, k));
  }

  /** Top of the whole strap (its tag row) right now, for whatever sits above it. */
  top(t) {
    return this.barY(t) - STRAP.tagH;
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
      this.textAt = this.inAt + T.textDelay + T.textRise;
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
        this.prev = null;
        this.flipAt = -Infinity;
        this.textAt = t;
      }
      return;
    }
    if (want.key === this.cur.key) return;
    const textShown = t >= this.inAt + T.textDelay;
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
    const w = this.cur.tagW;
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
  if (c.name) drawText(ctx, c.name, x + 5, y + c.nameY, WHITE);
}
function drawSource(ctx, c, x, y) {
  if (c.plate) drawText(ctx, c.plate, x + 5, y + MICRO_Y, SOURCE_STYLE);
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

/** How far pages push on a flip: the taller block travels its own height plus a gap, so it leaves the window whole. */
const pushDistance = (a, b) => LINE_PITCH * Math.max(a.length, b.length) + 4;

/** Draw a page (one or two lines) with its first cap line at y. */
function drawPage(ctx, lines, y) {
  for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], TEXT_X, y + i * LINE_PITCH, WHITE);
}

/** The bar's 1 px top line: the accent, or the NEWS IN 60 progress rule. */
function drawTopLine(ctx, s, barY, color, split, splitColor) {
  if (s.progress !== null) {
    rect(ctx, STRAP.x, barY, BAR_W, 1, P.slate);
    rect(ctx, STRAP.x, barY, Math.floor(BAR_W * s.progress), 1, P.yellow);
    return;
  }
  rect(ctx, STRAP.x, barY, BAR_W, 1, color);
  if (split < BAR_W) rect(ctx, STRAP.x, barY, split, 1, splitColor);
}

/** Draw the strap for state `s` at time t. */
export function drawStrap(ctx, t, s) {
  const c = s.cur;
  if (!c) return;
  const rin = easeOut((t - s.inAt) / T.in);
  const rout = s.outAt === null ? 0 : easeIn((t - s.outAt) / T.out);
  const barVis = Math.round(BAR_W * rin * (1 - rout));
  if (barVis <= 0) return;
  const barY = s.barY(t);
  const barH = STRAP.bottom - barY;
  const textK = easeOut((t - s.inAt - T.textDelay) / T.textRise);

  // --- headline bar (colour wipe when it turns red or back)
  const redK = easeInOut((t - s.redAt) / T.red);
  const base = c.breaking ? BAR_RED : BAR;
  clipStart(ctx, STRAP.x, barY, barVis, barH);
  try {
    const split = redK < 1 ? Math.round(BAR_W * redK) : BAR_W;
    if (split < BAR_W) {
      const from = s.redFrom ? BAR_RED : BAR;
      rect(ctx, STRAP.x, barY, BAR_W, barH, from);
      if (from === BAR) rect(ctx, STRAP.x + split, barY + 1, BAR_W - split, 1, BAR_HI);
    }
    rect(ctx, STRAP.x, barY, split, barH, base);
    if (base === BAR) rect(ctx, STRAP.x, barY + 1, split, 1, BAR_HI);
    // 1 px accent line along the top ties the bar to the tag and lifts it off dark sets
    const line = c.breaking ? P.red : c.tagColor;
    drawTopLine(ctx, s, barY, s.prev && redK < 1 ? s.prev.tagColor : line, redK < 1 ? split : BAR_W, line);
    rect(ctx, STRAP.x, STRAP.bottom - 1, BAR_W, 1, P.black);

    if (textK > 0) {
      clipStart(ctx, TEXT_X - 2, barY + 2, TEXT_ROOM + 4, barH - 3);
      try {
        const y0 = barY + 5;
        const fk = easeInOut((t - s.flipAt) / T.flip);
        if (s.prev && fk < 1) {
          const from = s.prev.pages[s.prevPage] ?? s.prev.pages[0];
          const d = pushDistance(from, c.pages[0]);
          drawPage(ctx, from, y0 - Math.round(fk * d));
          drawPage(ctx, c.pages[0], y0 + Math.round((1 - fk) * d));
        } else {
          const pg = strapPage(c, t - s.textAt, PAGE_NOW);
          if (pg.k < 1) {
            const d = pushDistance(c.pages[pg.from], c.pages[pg.i]);
            drawPage(ctx, c.pages[pg.from], y0 - Math.round(pg.k * d));
            drawPage(ctx, c.pages[pg.i], y0 + Math.round((1 - pg.k) * d));
          } else drawPage(ctx, c.pages[pg.i], y0 + Math.round((1 - textK) * 6));
        }
      } finally {
        clipEnd(ctx);
      }
    }
  } finally {
    clipEnd(ctx);
  }

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
  const y = barY - STRAP.tagH;
  const h = STRAP.tagH;
  clipStart(ctx, STRAP.x, y, rowVis, h);
  try {
    // tag colour changes with the same wipe as the bar
    const prevColor = flipping ? s.prev.tagColor : c.tagColor;
    rect(ctx, STRAP.x, y, tagW, h, prevColor);
    if (prevColor !== c.tagColor) rect(ctx, STRAP.x, y, Math.round(tagW * redK), h, c.tagColor);
    if (textK > 0) {
      clipStart(ctx, STRAP.x, y, tagW, h);
      try {
        if (flipping && s.prev.tag !== c.tag) {
          drawText(ctx, s.prev.tag, STRAP.x + 5, y + s.prev.tagY - Math.round(fk * h), s.prev.tagStyle);
          drawText(ctx, c.tag, STRAP.x + 5, y + c.tagY + Math.round((1 - fk) * h), c.tagStyle);
        } else drawText(ctx, c.tag, STRAP.x + 5, y + c.tagY + Math.round((1 - textK) * 4), c.tagStyle);
      } finally {
        clipEnd(ctx);
      }
    }
    if (plateW > 0) {
      const px = STRAP.x + tagW;
      rect(ctx, px, y, plateW, h, P.black);
      if (textK > 0) {
        clipStart(ctx, px, y, plateW, h);
        try {
          if (plateChanges) {
            drawPlateLabel(ctx, s.prev, prevK, px, y, h, -Math.round(fk * h));
            drawPlateLabel(ctx, c, pk, px, y, h, Math.round((1 - fk) * h));
          } else drawPlateLabel(ctx, c, pk, px, y, h, Math.round((1 - textK) * 4));
        } finally {
          clipEnd(ctx);
        }
      }
    }
  } finally {
    clipEnd(ctx);
  }
}

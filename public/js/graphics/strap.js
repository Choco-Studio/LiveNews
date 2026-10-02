// Lower third ("strap"): an 11 px tag row (kicker or category in the
// programme accent, then the source in micro type or, the first time a
// presenter speaks, their name) over a 17 px ink headline bar.
// Timing per docs/ART_DIRECTION.md: the bar wipes in left to right in 0.35 s
// (ease-out, whole pixels), the text rises in 0.1 s after it, a story change
// flips the text in 0.3 s and keeps the bar, the exit takes 0.25 s. Breaking
// news turns the strap red with one calm wipe; no flashing.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { STRAP, inkOn, easeOut, easeIn, easeInOut, clamp01, lerp, rect, clipped } from './layout.js';

export const STRAP_TIMING = { in: 0.35, textDelay: 0.1, textRise: 0.2, flip: 0.3, out: 0.25, red: 0.45, name: 5 };
const T = STRAP_TIMING;

const BAR_W = STRAP.right - STRAP.x;
const TEXT_X = STRAP.x + 8;
const TEXT_ROOM = STRAP.right - 8 - TEXT_X;
const BAR = P.ink;
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
  return {
    key: `${breaking ? 1 : 0}|${tag}|${headline}`,
    tag,
    tagColor: breaking ? P.red : accent,
    plate,
    name: lt.showName && lt.anchorName ? String(lt.anchorName) : '',
    headline,
    breaking,
    since: Number.isFinite(lt.since) ? lt.since : 0,
  };
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

  update(t, want) {
    if (!want) {
      if (this.cur && this.outAt === null) this.outAt = t;
      if (this.cur && this.outAt !== null && t - this.outAt >= T.out) this.reset();
      return;
    }
    if (!this.cur) {
      this.cur = want;
      this.prev = null;
      this.inAt = Math.max(t, want.since);
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
      this.prev = this.cur;
      this.flipAt = t;
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

// The black plate beside the tag: the presenter's name for the first seconds
// (name super), then the source in micro type. Returns the label on air at t.
function plateAt(c, t) {
  const k = c.name ? easeInOut((t - c.since - T.name) / T.flip) : 1;
  return { k, name: c.name, source: c.plate };
}
const nameW = (p) => (p.name ? measureText(p.name) + 10 : 0);
const sourceW = (p) => (p.source ? measureText(p.source, 1, 'micro') + 10 : 0);
function plateWidth(p) {
  if (p.k <= 0) return nameW(p);
  if (p.k >= 1) return sourceW(p);
  return Math.round(lerp(nameW(p), sourceW(p), p.k));
}
/** Draw one plate label with a vertical offset (name and source push past each other). */
function drawPlateLabel(ctx, p, x, y, h, dy) {
  const name = (o) => p.name && drawText(ctx, p.name, x + 5, y + 2 + o, { color: P.white });
  const source = (o) => p.source && drawText(ctx, p.source, x + 5, y + 3 + o, { color: P.silver, font: 'micro' });
  if (p.k <= 0) name(dy);
  else if (p.k >= 1) source(dy);
  else {
    name(dy - Math.round(p.k * h));
    source(dy + Math.round((1 - p.k) * h));
  }
}
const samePlate = (a, b) => a.k === b.k && (a.k >= 1 ? a.source === b.source : a.name === b.name);

/** Horizontal scroll for a headline wider than the bar (rare: headlines are capped at ~45-56 chars). */
function overflowShift(w, local) {
  const over = w - TEXT_ROOM;
  if (over <= 0) return 0;
  const glide = over / 25;
  const cycle = 3 + glide + 3 + glide / 2;
  const p = local % cycle;
  if (p < 3) return 0;
  if (p < 3 + glide) return Math.round(((p - 3) / glide) * over);
  if (p < 6 + glide) return over;
  return Math.round((1 - (p - 6 - glide) / (glide / 2)) * over);
}

function drawHeadline(ctx, c, t, dy) {
  const w = measureText(c.headline);
  const shift = overflowShift(w, Math.max(0, t - c.since - 1));
  drawText(ctx, c.headline, TEXT_X - shift, STRAP.barY + 5 + dy, { color: P.white });
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
    if (redK < 1) {
      const split = Math.round(BAR_W * redK);
      rect(ctx, STRAP.x, STRAP.barY, BAR_W, STRAP.barH, s.redFrom ? BAR_RED : BAR);
      rect(ctx, STRAP.x, STRAP.barY, split, STRAP.barH, base);
    } else rect(ctx, STRAP.x, STRAP.barY, BAR_W, STRAP.barH, base);
    // 1 px accent line along the top ties the bar to the tag and lifts it off dark sets
    const line = c.breaking ? P.red : c.tagColor;
    rect(ctx, STRAP.x, STRAP.barY, BAR_W, 1, s.prev && redK < 1 ? s.prev.tagColor : line);
    if (redK < 1) rect(ctx, STRAP.x, STRAP.barY, Math.round(BAR_W * redK), 1, line);
    rect(ctx, STRAP.x, STRAP.barY + STRAP.barH - 1, BAR_W, 1, P.black);

    const textK = easeOut((t - s.inAt - T.in - T.textDelay) / T.textRise);
    if (textK <= 0) return;
    clipped(ctx, TEXT_X - 2, STRAP.barY + 1, TEXT_ROOM + 4, STRAP.barH - 2, () => {
      const fk = easeInOut((t - s.flipAt) / T.flip);
      if (s.prev && fk < 1) {
        drawHeadline(ctx, s.prev, t, -Math.round(fk * 12));
        drawHeadline(ctx, c, t, Math.round((1 - fk) * 12));
      } else drawHeadline(ctx, c, t, Math.round((1 - textK) * 6));
    });
  });

  // --- tag row: accent tag + black plate, revealed with the bar (slightly behind)
  const tagIn = easeOut((t - s.inAt - 0.05) / T.in);
  const fk = easeInOut((t - s.flipAt) / T.flip);
  const flipping = !!s.prev && fk < 1;
  const tagW = s.tagWidth(t);
  const plate = plateAt(c, t);
  const prevPlate = flipping ? plateAt(s.prev, s.flipAt) : null;
  const plateChanges = flipping && !samePlate(prevPlate, plate);
  const plateW = plateChanges ? Math.round(lerp(plateWidth(prevPlate), plateWidth(plate), fk)) : plateWidth(plate);
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
          drawText(ctx, s.prev.tag, STRAP.x + 5, y + 2 - Math.round(fk * h), { color: inkOn(s.prev.tagColor) });
          drawText(ctx, c.tag, STRAP.x + 5, y + 2 + Math.round((1 - fk) * h), { color: inkOn(c.tagColor) });
        } else drawText(ctx, c.tag, STRAP.x + 5, y + 2 + Math.round((1 - textK) * 4), { color: inkOn(c.tagColor) });
      });
    }
    if (plateW > 0) {
      const px = STRAP.x + tagW;
      rect(ctx, px, y, plateW, h, P.black);
      if (textK > 0) {
        clipped(ctx, px, y, plateW, h, () => {
          if (plateChanges) {
            drawPlateLabel(ctx, prevPlate, px, y, h, -Math.round(fk * h));
            drawPlateLabel(ctx, plate, px, y, h, Math.round((1 - fk) * h));
          } else drawPlateLabel(ctx, plate, px, y, h, Math.round((1 - textK) * 4));
        });
      }
    }
  });
}

/** 0..1: how much room the strap takes right now (captions move above it). */
export function strapPresence(s, t) {
  return clamp01(s.reveal(t));
}

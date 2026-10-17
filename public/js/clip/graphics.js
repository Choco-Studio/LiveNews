// The graphics package in clip mode (?clip=1: a recording made to be cut into clips; docs/publishing/vertical.md §5).
// A clip is watched later, out of the channel's flow, mostly with the sound off, so three things change and nothing
// else does:
//   - no clock and no LIVE tag (a clip is not live, and an hour on screen dates it); the bug stays, with the
//     programme's name beside it for the whole clip (a clip is seen without the open that names the programme)
//   - no ticker (its headlines belong to the hour it aired, and would put stories in a clip that it is not about)
//   - the captions are the clip captions (clip/captions.js): 2x type, short pages paced by the voice, the word said lit
// The strap, the RECREATION label and name super, the link graphics and the FILE credits draw exactly as on air.
//
// ClipGraphics (horizontal clip) extends the channel's Graphics; VerticalGraphics keeps the same bookkeeping (the
// strap's state, which the vertical frame reads) and draws nothing on the horizontal picture: clip/vertical.js draws
// the vertical frame's own graphics.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { Graphics, contentWords } from '../graphics/index.js';
import { drawTopRow, BUG_W } from '../graphics/bug.js';
import { drawStrap } from '../graphics/strap.js';
import { drawRecreation } from '../graphics/recreation.js';
import { drawLinkGraphics, drawFileCredit } from '../graphics/remote.js';
import { TOP, STRAP, inkOn } from '../graphics/layout.js';
import { THEME_ACCENT } from '../cast.js';
import { WordCaptions } from './captions.js';
import { takeMapLabel, mapKeepOut } from '../scenes/worldmap.js';
import { drawClipMark } from './mark.js';

const ON = new Set(['news', 'bug']);
const GRAVE = new Set(['sad', 'serious']);

/** Is the voice on air telling a grave story (no lit word, no bright accents)? */
export function graveNow(scene, slot) {
  const e = scene?.anchors?.[slot]?.emotion;
  return GRAVE.has(e) || !!scene?.remote?.grave;
}

/** The sentence on air and where the voice is in it: { text, charIndex, slot }. */
export function speechNow(audio, scene) {
  const text = scene?.subtitles !== false && typeof scene?.subtitle === 'string' ? scene.subtitle : null;
  let charIndex = null;
  let slot = null;
  try {
    const f = audio?.speechFrame?.(performance.now());
    if (f) {
      slot = f.slot ?? null;
      if (f.speaking && Number.isFinite(f.charIndex) && f.charIndex >= 0) charIndex = f.charIndex;
    }
  } catch {
    /* no timeline: the captions keep the clock's pace */
  }
  return { text, charIndex, slot };
}

/** Every string a card carries (its question, headline, lines), for comparing with what is said over it. */
function cardTexts(card, depth = 0, out = []) {
  if (!card || depth > 3 || out.length > 40) return out;
  for (const v of Array.isArray(card) ? card : Object.values(card)) {
    if (typeof v === 'string' && v.length > 3 && / /.test(v)) out.push(v);
    else if (v && typeof v === 'object') cardTexts(v, depth + 1, out);
  }
  return out;
}

/**
 * True when the voice is reading the words the board already shows (PAY ATTENTION's "here's the sentence as it
 * aired", a quote card): 60 % of the sentence's content words are on the board, so a caption would say it twice.
 */
export function boardRepeats(text, scene) {
  if (!text || !scene?.card || !['quiz', 'fact'].includes(scene.shot)) return false;
  const words = contentWords(text);
  if (words.length < 3) return false;
  const shown = new Set(contentWords(cardTexts(scene.card).join(' ')));
  return words.filter((w) => shown.has(w)).length >= words.length * 0.6;
}

/** The programme's tag beside the bug, held for the whole clip (accent plate, ink type; purple in its fog rim). */
export function drawProgrammeTag(ctx, x, y, title, color) {
  if (!title) return 0;
  const w = measureText(title) + 8;
  if (color === P.purple) {
    ctx.fillStyle = P.fog;
    ctx.fillRect(x, y, w, TOP.h);
    ctx.fillStyle = P.purple;
    ctx.fillRect(x + 1, y + 1, w - 2, TOP.h - 2);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, TOP.h);
  }
  drawText(ctx, title, x + 4, y + 3, { color: inkOn(color) });
  return w;
}

/**
 * The channel's bug (graphics/bug.js's top row, clipped to the bug: no LIVE, no clock) and the AI mark docked to its
 * right edge (clip/mark.js), their top-left at (x, y). Returns their width.
 */
export function drawBugOnly(ctx, t, onAt, x = TOP.x, y = TOP.y) {
  ctx.save();
  try {
    ctx.translate(x - TOP.x, y - TOP.y);
    ctx.beginPath();
    ctx.rect(TOP.x, TOP.y, BUG_W, TOP.h);
    ctx.clip();
    drawTopRow(ctx, t, { onAt, replay: false, program: null, programIn: null, programOut: null, clock: '' });
  } finally {
    ctx.restore();
  }
  return BUG_W + 1 + drawClipMark(ctx, x + BUG_W + 1, y);
}

/**
 * Where a horizontal clip's captions go when a full-screen map's place label is up: over the strap as always, unless
 * the label sits there (on air nothing covers it; in a clip the captions would hide the place it names); then at the
 * top, when that is clear. `label` and `size` in the 384x216 frame's pixels; 2 px kept round the label.
 */
export function captionSpot({ label = null, size = null, bottom, cx = 192, top = 40 }) {
  if (!label || !size) return { bottom };
  const hits = (y0) => {
    const x0 = cx - size.w / 2;
    return label.x - 2 < x0 + size.w && label.x + label.w + 2 > x0 && label.y - 2 < y0 + size.h && label.y + label.h + 2 > y0;
  };
  if (!hits(bottom - size.h)) return { bottom };
  return hits(top) ? { bottom } : { top };
}

/**
 * A strap that is another story's: its headline is the headline of a story in the running order other than the one
 * the shot shows (the director cuts to the next story a frame before its voice, and its strap, take over).
 */
export function strapOfAnotherStory(strap, scene) {
  if (!strap?.headline || !scene?.storyId || !Array.isArray(scene.rundown)) return false;
  const h = String(strap.headline).trim().toLowerCase();
  const owner = scene.rundown.find((r) => r?.headline && String(r.headline).trim().toLowerCase() === h);
  return !!owner && owner.storyId !== scene.storyId;
}

/**
 * At a story change the strap stays up and flips its text from the last story's headline to the new one (on air, a
 * transition). A clip opening on that cut would open on the last story's words rolling away: when the flip's old text
 * is another story's, the clip settles it at once and shows the new headline. Returns true when it did.
 */
export function settleFlip(strap, scene, t) {
  if (!strap?.prev || !strapOfAnotherStory(strap.prev, scene)) return false;
  strap.prev = null;
  strap.flipAt = -Infinity;
  strap.textAt = Math.min(strap.textAt, t);
  return true;
}

/** Horizontal clip graphics. */
export class ClipGraphics extends Graphics {
  constructor(opts = {}) {
    super(opts);
    this.clipCaptions = new WordCaptions({ maxW: 336, scale: 2, perPage: 2 });
  }

  update(t, scene) {
    super.update(t, scene);
    settleFlip(this.strap, scene, t);
    const sp = speechNow(this.audio, scene);
    const mode = this.mode;
    const text = mode === 'news' ? sp.text : null;
    this.clipCaptions.update(t, text && !this.quietCaption(text, scene) ? text : null, sp.charIndex, { grave: graveNow(scene, sp.slot) });
  }

  /** The caption the channel itself leaves out (the quote card or IN PLAIN ENGLISH already shows those words). */
  quietCaption(text, scene) {
    if (scene.shot === 'fact' && scene.card?.term?.term) return true;
    return boardRepeats(text, scene);
  }

  render(ctx, t, scene) {
    const mode = this.mode;
    if (!ON.has(mode)) return;
    const bw = drawBugOnly(ctx, t, this.topAt);
    if (mode === 'news' && scene.program?.title) drawProgrammeTag(ctx, TOP.x + bw + 1, TOP.y, String(scene.program.title), THEME_ACCENT[scene.program?.theme] || P.red);
    if (mode === 'news' && scene.remote) drawLinkGraphics(ctx, t, scene, this.accentOf(scene));
    if (scene.shot === 'montage' && scene.card?.vid) {
      const credit = scene.rundown?.[scene.card.index]?.footage?.credit;
      if (credit) drawFileCredit(ctx, credit);
    }
    // the map's place label, read every frame (a full-screen map shot's own, never one left from another picture)
    const label = takeMapLabel();
    mapKeepOut(null);
    if (mode !== 'news') return;
    // a clip never shows the strap of another story: the one leaving as the next story's begins is dropped at once
    // (on air it wipes out over the new shot; a clip opening on that shot would open on the last story's headline)
    const want = scene.recreation ? null : this.wantStrap(t, scene);
    const stale = !!(want && this.strap.cur && this.strap.cur.key !== want.key) || strapOfAnotherStory(this.strap.cur, scene);
    if (scene.recreation) drawRecreation(ctx, scene.recreation, this.accentOf(scene));
    else if (!stale) drawStrap(ctx, t, this.strap);
    // the captions: over the full-screen graphics that own the bottom, at the top; else 4 px over the strap (or the
    // RECREATION name super), else over the frame's foot (no ticker in a clip)
    if (this.captionsOnTop(scene)) {
      this.clipCaptions.draw(ctx, t, { cx: 192, top: 40 });
      return;
    }
    const strapTop = scene.recreation ? STRAP.tagY : this.strap.cur && this.strap.outAt === null && !stale ? this.strap.top(t) : null;
    const bottom = strapTop !== null ? strapTop - 4 : 206;
    const full = scene.shot === 'map' && label && label.cw === 384 && label.ch === 216 ? label : null;
    const spot = captionSpot({ label: full, size: full ? this.clipCaptions.size() : null, bottom });
    // captions moved to the top: the map's context names keep out of their whole band (never half under a caption)
    mapKeepOut(spot.top !== undefined ? { x: 192 - 336 / 2 - 8, y: spot.top, w: 336 + 16, h: WordCaptions.blockHeight(2, 2) } : null);
    this.clipCaptions.draw(ctx, t, { cx: 192, ...spot });
  }
}

/** Vertical: the channel's bookkeeping (strap state, programme tag timing) with nothing drawn on the source picture. */
export class VerticalGraphics extends Graphics {
  render() {}
}

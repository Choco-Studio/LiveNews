// Burned-in captions for clips (the publishing desk: docs/publishing/vertical.md §4). A clip plays with the sound off
// in most feeds, so its words are on the picture: the channel's own 5x7 face at 2x (14 px caps, 70 px on a 1080-wide
// phone picture), white caps on solid black line boxes as the channel's subtitles, short pages of one or two lines
// paced by the voice itself (the speech timeline's character position from the recorded voice's word marks, never a
// guess when the marks are there), and the word being said lit in yellow (yellow on black is one of the channel's two
// coloured text pairs). Over grave news nothing is lit: every word white.
//
// Pages break between words only, at the phrase boundary nearest the line's end (after a comma, never after "the" or
// "of"), and a page never shows a word before it is said (the page turns on its first word). A sentence is always
// shown whole across its pages: no word is dropped, none is cut.
//
//   const caps = new WordCaptions({ maxW: 200 });
//   caps.update(t, sentence, charIndex, { grave });   // per frame (sentence null when nobody speaks)
//   caps.draw(ctx, t, { cx: 108, bottom: 296 });      // or { cx, top }
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';

export const CLIP_CAPTION = Object.freeze({
  scale: 2,
  padX: 4, // box padding (px at 1x) either side of a line
  padTop: 3, // room for an accent over the caps (NICOLÁS)
  padBottom: 2,
  gap: 1, // px between two line boxes
  cps: 15, // characters a second when the voice gives no timeline (the engine's mute pace)
  hold: 0.35, // s the last page stays after the sentence
  lead: 0, // characters before a page's first word it may turn (0: on the word itself)
});

// a line never ends on one of these words when the next word can join it (the reader's eye expects the noun)
const WEAK = new Set('A AN THE OF TO IN ON AT BY FOR FROM WITH AND OR BUT AS INTO ONTO OVER UNDER ITS HIS HER THEIR OUR YOUR MY NOT NO IS ARE WAS WERE BE HAS HAVE HAD THAT THIS THESE THOSE'.split(' '));
const PUNCT_END = /[,;:.!?)"'’”]$/;
// a running-order label at a sentence's head ("And finally:", "Our number of the day:") is a page of its own, so a
// clip that starts on the news after it (server/publish/moments.js leadIn) never shows the label on its first frame
const LABEL_HEAD = /^(?:and finally|finally|our number of the day(?: is)?|the number of the day(?: is)?|(?:now,? )?around the world(?: in \d+ seconds)?|in other news|(?:and )?now|meanwhile|next|also)\s*[:,—–-]\s*/i;
const SPACE_1X = 4; // a word space at 1x in the body face (3 px space + 1 px letter gap)

/** Words of a sentence with their character offsets: [{ w, at, end }]. */
export function wordsOf(text) {
  const out = [];
  const s = String(text ?? '');
  const re = /\S+/g;
  let m;
  while ((m = re.exec(s))) out.push({ w: m[0], at: m.index, end: m.index + m[0].length });
  return out;
}

const PAGES = new Map();
/**
 * The sentence's pages: [{ start (char), lines: [{ text, words: [{ w, at, x }] , width }] }], cached. Each page is
 * `perPage` lines of `maxW` px at `scale` at most, its words and its turns chosen together over the whole sentence: a
 * page turns where the sentence pauses (a full stop, a comma, else before a little word), never inside a phrase or
 * after a little word ("TO THE LUNAR | SURFACE" is two pages that read as none), a one-word page only when nothing else
 * fits; a running-order label ends a page of its own.
 */
export function pagesOf(text, maxW, scale = 2, perPage = 2) {
  const key = `${maxW}|${scale}|${perPage}|${text}`;
  const hit = PAGES.get(key);
  if (hit) return hit;
  const words = wordsOf(text);
  const head = LABEL_HEAD.exec(String(text ?? ''));
  const labelEnd = head ? head[0].trimEnd().length : -1;
  const width = (w) => measureText(w, scale);
  const sp = SPACE_1X * scale;
  const N = words.length;
  const ww = words.map((x) => width(x.w));
  const bare = (i) => words[i].w.toUpperCase().replace(/[^A-Z]/g, '');
  // the width of words [a, b) on one line
  const span = (a, b) => {
    let w = 0;
    for (let i = a; i < b; i++) w += ww[i] + (i > a ? sp : 0);
    return w;
  };
  // how awkward a break before word b is: none after a full stop, little after a comma, some before a little word
  // that starts a phrase, most inside a phrase; a break after a little word is worse still ("THE | LUNAR")
  const pause = (b) => {
    const last = words[b - 1].w;
    if (/[.!?;:]["'’”)]*$/.test(last)) return 0;
    if (/,["'’”)]*$/.test(last)) return 0.2;
    return (WEAK.has(bare(b)) ? 1 : 3) + (WEAK.has(bare(b - 1)) ? 4 : 0);
  };
  // a page of words [a, b): its lines (one, or two split where it reads best) and what that split costs, or null
  const layout = (a, b) => {
    if (span(a, b) <= maxW) return { cost: 0, splits: [] };
    if (perPage < 2) return null;
    let bestS = -1;
    let bestC = Infinity;
    for (let s2 = a + 1; s2 < b; s2++) {
      if (span(a, s2) > maxW || span(s2, b) > maxW) continue;
      // (a line ending inside the page costs a third of a page's turn: both lines are read together)
      const c = pause(s2) / 3 + Math.abs(span(a, s2) - span(s2, b)) / (maxW * 8);
      if (c < bestC) {
        bestC = c;
        bestS = s2;
      }
    }
    return bestS < 0 ? null : { cost: bestC, splits: [bestS] };
  };
  // a running-order label ends a page of its own
  const labelWord = labelEnd > 0 ? words.findIndex((x) => x.end === labelEnd) : -1;
  const best = new Array(N + 1).fill(Infinity);
  const from = new Array(N + 1).fill(-1);
  const lay = new Array(N + 1).fill(null);
  best[0] = 0;
  for (let b = 1; b <= N; b++) {
    for (let a = b - 1; a >= 0; a--) {
      if (labelWord >= 0 && a <= labelWord && labelWord < b - 1) break; // (the label's last word inside the page)
      const L = layout(a, b);
      if (!L) {
        if (span(a, b) > maxW * perPage) break;
        continue;
      }
      let c = best[a] + L.cost;
      if (b < N) {
        c += pause(b);
        // a page of one word flashes by; a page of one short line, a little
        if (b - a === 1) c += 2.5;
        else if (!L.splits.length && span(a, b) < maxW * 0.6) c += 0.6;
      }
      if (labelWord >= 0 && b - 1 === labelWord) c -= 10;
      if (c < best[b]) {
        best[b] = c;
        from[b] = a;
        lay[b] = L;
      }
    }
    if (!Number.isFinite(best[b])) {
      // (a word wider than a line: a page of its own)
      best[b] = best[b - 1] + 5;
      from[b] = b - 1;
      lay[b] = { cost: 0, splits: [] };
    }
  }
  const groups = [];
  for (let b = N; b > 0; b = from[b]) groups.unshift([from[b], b, lay[b]]);
  const pages = [];
  for (const [a, b, L] of groups) {
    const cuts = [a, ...L.splits, b];
    const ls = [];
    for (let q = 0; q < cuts.length - 1; q++) {
      const ws = words.slice(cuts[q], cuts[q + 1]);
      const text = ws.map((x) => x.w).join(' ');
      let x = 0;
      const placed = ws.map((x0, k) => {
        const o = { w: x0.w, at: x0.at, end: x0.end, x };
        x += width(x0.w) + (k < ws.length - 1 ? sp : 0);
        return o;
      });
      ls.push({ text, words: placed, width: width(text) });
    }
    pages.push({ start: ls[0].words[0].at, end: ls.at(-1).words.at(-1).end, lines: ls });
  }
  const frozen = Object.freeze(pages);
  if (PAGES.size > 400) PAGES.delete(PAGES.keys().next().value);
  PAGES.set(key, frozen);
  return frozen;
}

/** Index of the page holding character `at` (the last page whose first word has started). */
export function pageIndexAt(pages, at) {
  let k = 0;
  for (let i = 1; i < pages.length; i++) if (pages[i].start - CLIP_CAPTION.lead <= at) k = i;
  return k;
}

export class WordCaptions {
  constructor({ maxW = 200, scale = CLIP_CAPTION.scale, perPage = 2 } = {}) {
    this.maxW = maxW;
    this.scale = scale;
    this.perPage = perPage;
    this.reset();
  }

  reset() {
    this.text = null;
    this.pages = [];
    this.page = -1;
    this.word = -1; // char offset of the lit word (-1 none)
    this.since = 0;
    this.lastChar = null;
    this.lastCharAt = 0;
    this.clearAt = null;
    this.grave = false;
  }

  /**
   * `text`: the sentence being spoken (null when nobody speaks); `charIndex`: where the voice is in it (the speech
   * timeline's word start; null or -1 unknown); `grave`: no lit word.
   */
  update(t, text, charIndex = null, { grave = false } = {}) {
    if (!text) {
      if (this.text !== null && this.clearAt === null) this.clearAt = t;
      if (this.clearAt !== null && t - this.clearAt >= CLIP_CAPTION.hold) this.reset();
      this.word = -1;
      return;
    }
    if (text !== this.text) {
      this.text = text;
      this.pages = pagesOf(text, this.maxW, this.scale, this.perPage);
      this.page = -1;
      this.since = t;
      this.lastChar = null;
    }
    this.clearAt = null;
    this.grave = grave;
    let at;
    if (Number.isFinite(charIndex) && charIndex >= 0) {
      at = charIndex;
      this.lastChar = charIndex;
      this.lastCharAt = t;
    } else if (this.lastChar !== null) {
      // the timeline paused (between two words, or after its last mark): hold on the last known word, then carry on at
      // the mute pace only if it stays silent long (a voice that overran its marks)
      at = this.lastChar + Math.max(0, t - this.lastCharAt - 0.6) * CLIP_CAPTION.cps;
    } else at = (t - this.since) * CLIP_CAPTION.cps;
    if (!this.pages.length) return;
    // within a sentence the page only moves forward
    const k = Math.max(this.page, pageIndexAt(this.pages, at));
    this.page = Math.min(k, this.pages.length - 1);
    // the lit word: the word the voice is on (charIndex inside it or at its start)
    this.word = -1;
    if (Number.isFinite(charIndex) && charIndex >= 0) {
      for (const ln of this.pages[this.page].lines) for (const w of ln.words) if (w.at <= charIndex && charIndex < w.end + 1) this.word = w.at;
    }
  }

  get active() {
    return this.page >= 0 && this.pages.length > 0;
  }

  /** The page's lines as drawn (tests and the layout): [{ text, width }]. */
  lines() {
    return this.active ? this.pages[this.page].lines : [];
  }

  /** Height in px of `n` line boxes. */
  static blockHeight(n, scale = CLIP_CAPTION.scale) {
    const C = CLIP_CAPTION;
    const lh = C.padTop + 7 + C.padBottom;
    return n * lh * scale - (n > 0 ? 0 : 0) + Math.max(0, n - 1) * C.gap;
  }

  /** The page's block: { w, h } of its widest line and its lines together (null when nothing is captioned). */
  size() {
    if (!this.active) return null;
    const C = CLIP_CAPTION;
    const s = this.scale;
    const lines = this.pages[this.page].lines;
    const lh = (C.padTop + 7 + C.padBottom) * s;
    return { w: Math.max(...lines.map((ln) => ln.width + 2 * C.padX * s)), h: lines.length * lh + (lines.length - 1) * C.gap };
  }

  /** Draw the page centred on `cx`, its block ending at `bottom` (or starting at `top`). Returns the block's top. */
  draw(ctx, t, { cx, bottom = null, top = null }) {
    if (!this.active) return null;
    const C = CLIP_CAPTION;
    const s = this.scale;
    const lines = this.pages[this.page].lines;
    const lh = (C.padTop + 7 + C.padBottom) * s;
    const h = lines.length * lh + (lines.length - 1) * C.gap;
    const y0 = top !== null ? top : bottom - h;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const bw = ln.width + 2 * C.padX * s;
      const bx = Math.round(cx - bw / 2);
      const by = y0 + i * (lh + C.gap);
      ctx.fillStyle = P.black;
      ctx.fillRect(bx, by, bw, lh);
      const tx = bx + C.padX * s;
      const ty = by + C.padTop * s;
      for (const w of ln.words) {
        const lit = !this.grave && w.at === this.word;
        drawText(ctx, w.w, tx + w.x, ty, lit ? LIT[s] || (LIT[s] = { color: P.yellow, scale: s }) : PLAIN[s] || (PLAIN[s] = { color: P.white, scale: s }));
      }
    }
    return y0;
  }
}
const LIT = {};
const PLAIN = {};

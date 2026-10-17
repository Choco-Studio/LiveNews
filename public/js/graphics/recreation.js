// Graphics of a re-staged guest (IN THEIR WORDS, owner 12 Oct; server/guests/restage.js; WAVE3 §6.3: "always
// labelled"). While the person is on screen, from the first frame of the piece to the last, with no wipe that
// could leave a frame without it:
//   the label     under the clock, right-aligned: AI RECREATION on a yellow plate (the double-struck AI is the
//                 channel's AI mark, graphics/disclosure.js: yellow means made by AI; the EU Code of Practice asks
//                 for the capital "AI" as the label's main element, top right on a deep fake) and the rest of the
//                 line ("— WORDS FROM PUBLIC STATEMENTS") white on black, then "SOURCE: <OUTLET>" on its own plate
//                 below (body type: readable at 1x)
//   the name      the channel's name super in the strap's place: the role on the programme's accent tag (IN THEIR
//                 WORDS for a speaker the source names by role only), the name on the ink bar
// In a clip's frame (?frame=9x16, 1x1: graphics/disclosure.js FRAME) the same plates stack inside the window, every
// word whole, so a vertical crop keeps the label and the source legible in every frame (compliance.md §5.1).
// The words themselves ride in the captions above it (graphics/index.js places them).
//
//   recreationOf(booking, seg)     what the graphics show: { name, role, line, credit } (scene.recreation)
//   recreationLayout(rec, frame)   the plates, where they go and whether every word fits (server/compliance/clips.js
//                                  checks a clip's crop against it)
//   drawRecreation(ctx, rec, accent)
//   RECREATION                     the label's geometry (top-right, under the clock)
import { P } from '../palette.js';
import { drawText, measureText, wrapLines } from '../font.js';
import { rect, inkOn, STRAP, TOP, W } from './layout.js';
import { FRAME, AI_W, drawBoldAI } from './disclosure.js';

export const RECREATION = { right: W - TOP.x, y: TOP.y + TOP.h + 3, h: 11, gap: 2 };
const LINE = 'RECREATION — WORDS FROM PUBLIC STATEMENTS';
const FEATURE = 'IN THEIR WORDS';
const NAME_ROOM = STRAP.right - STRAP.x - 10;
const HEAD = 'RECREATION';
// the yellow plate: 4 px, the bold AI, 4 px, RECREATION, 4 px
const HEAD_W = 4 + AI_W + 4 + measureText(HEAD) + 4;
const MICRO_H = 9; // a micro-face plate: 2 px, 5 px capitals, 2 px

const upper = (s) => String(s ?? '').trim().toUpperCase();

/**
 * The guest's lines on screen. `booking` = episode.guests[id] ({ strap: { name, role }, label: { line, credit } });
 * `seg` = the piece (its source and quoteRef, for a booking without a label). Never empty: the label always reads
 * RECREATION.
 */
export function recreationOf(booking, seg = {}) {
  const strap = booking?.strap || {};
  const label = booking?.label || {};
  const outlet = upper(seg?.quoteRef?.outlet || seg?.source);
  const said = String(seg?.quoteRef?.by || seg?.desk || '').replace(/^(?:the|a|an)\s+/i, '');
  const name = upper(strap.name || booking?.name || booking?.role || said || 'SPEAKER');
  const role = upper(strap.role || '');
  const line = /^RECREATION\b/i.test(String(label.line || '')) ? upper(label.line) : LINE;
  const credit = upper(label.credit) || (outlet ? `SOURCE: ${outlet}` : 'SOURCE: PUBLIC STATEMENTS');
  return { name, role, line, credit };
}

/**
 * Fit `text` into `room` px, cutting whole words (never a scrap of one), and never ending on a word that needs the
 * next ("CHIEF EXECUTIVE OF" once stood alone on a 9:16 tag).
 */
function fit(text, room) {
  if (measureText(text) <= room) return text;
  const words = text.split(' ');
  while (words.length > 1 && (measureText(words.join(' ')) > room || DANGLING.test(words.at(-1)))) words.pop();
  return words.join(' ');
}
const DANGLING = /^(?:OF|THE|AND|FOR|AT|IN|ON|TO|A|AN|WITH|FROM|BY|&|-|—)$/i;

// line breaks: never after a word that binds to the next; a looser preposition may end a line to keep its phrase whole
const TIGHT = /^(?:OF|THE|A|AN|AND|TO|&|-|—)$/i;
const LOOSE = /^(?:FOR|AT|IN|ON|WITH|FROM|BY)$/i;

/**
 * `text` wrapped to `room` px; when it takes two lines, broken where a subtitler would break it. Never after a word
 * that binds to the next ("OF", "THE"). At a natural point when one fits: after "SOURCE:", before "OF", "FROM" or
 * "THE", or after a looser preposition, which keeps the phrase after it whole. The most even of those; otherwise the
 * most even break. So "CHIEF EXECUTIVE / OF NIMBUS RAIL", not "CHIEF EXECUTIVE OF NIMBUS / RAIL"; "WORDS FROM /
 * PUBLIC STATEMENTS"; "SOURCE: / THE WALL STREET JOURNAL" keeps the outlet's name whole. The same for three or four lines.
 */
export function evenLines(text, room, font = 'body', most = 4) {
  const lines = wrapLines(String(text || ''), room, 1, font);
  if (lines.length < 2 || lines.length > most) return lines.slice();
  const words = String(text).split(/\s+/).filter(Boolean);
  const widthOf = (i, j) => measureText(words.slice(i, j).join(' '), 1, font);
  const natural = (k) => /:$/.test(words[k - 1]) || DANGLING.test(words[k]) || LOOSE.test(words[k - 1]);
  // every split into m lines (a role or a source is a handful of words): fewest rough breaks, then the narrowest
  // widest line (within a letter), then the fullest last line (no lone word left under the rest)
  const better = (a, b) => {
    if (!b || a.rough !== b.rough) return !b || a.rough < b.rough;
    if (Math.abs(a.wide - b.wide) > 6) return a.wide < b.wide;
    return a.last > b.last || (a.last === b.last && a.wide < b.wide);
  };
  const search = (i, m, cuts, rough, wide, best) => {
    if (m === 1) {
      const last = widthOf(i, words.length);
      if (last > room) return best;
      const cand = { rough, wide: Math.max(wide, last), last, cuts };
      return better(cand, best) ? cand : best;
    }
    for (let k = i + 1; k <= words.length - m + 1; k++) {
      const head = widthOf(i, k);
      if (head > room) break;
      if (TIGHT.test(words[k - 1])) continue;
      best = search(k, m - 1, [...cuts, k], rough + (natural(k) ? 0 : 1), Math.max(wide, head), best);
    }
    return best;
  };
  // as few lines as the greedy wrap, or one more when no acceptable break exists at that count
  for (let m = lines.length; m <= most; m++) {
    const best = search(0, m, [], 0, 0, null);
    if (best) return [0, ...best.cuts].map((c, n, all) => words.slice(c, all[n + 1] ?? words.length).join(' '));
  }
  return lines.slice();
}

/**
 * Where every plate of the label and the name super goes, in the full frame or inside a clip's window.
 * `frame` = { active, x, w } (graphics/disclosure.js FRAME; the full width when not active).
 * -> { plates: [{ role, x, y, w, h, color, text, ink, ai? }], label: { x0, y0, x1, y1 }, whole: bool, lost: [words] }
 * `whole` is false when a word of the label, the source, the name or the role could not be shown (the window is too
 * narrow for it).
 */
export function recreationLayout(rec, frame = FRAME) {
  const r = rec || recreationOf(null, {});
  const plates = [];
  const lost = [];
  const { y, h, gap } = RECREATION;
  const m = /^(RECREATION)\s*(.*)$/.exec(String(r.line || LINE));
  const rest = m ? m[2] : String(r.line || LINE);
  const credit = String(r.credit || '');
  const narrow = !!frame?.active;
  const right = narrow ? frame.x + frame.w - 4 : RECREATION.right;
  const left = narrow ? frame.x + 4 : TOP.x;
  const room = right - left;
  if (!narrow) {
    // one line under the clock: AI RECREATION, then the rest on black; the source under it
    const rw = rest ? measureText(rest) + 9 : 0;
    const x = right - HEAD_W - rw;
    plates.push({ role: 'mark', x, y, w: HEAD_W, h, color: P.yellow, text: HEAD, ink: P.black, ai: true });
    if (rest) plates.push({ role: 'line', x: x + HEAD_W, y, w: rw, h, color: P.black, text: rest, ink: P.white });
    if (credit) {
      const cw = measureText(credit) + 10;
      plates.push({ role: 'credit', x: right - cw, y: y + h + gap, w: cw, h, color: P.ink, text: credit, ink: P.silver });
    }
  } else {
    // stacked inside the window: AI RECREATION, the rest wrapped on black, the source wrapped on ink
    let yy = y;
    plates.push({ role: 'mark', x: right - HEAD_W, y: yy, w: HEAD_W, h, color: P.yellow, text: HEAD, ink: P.black, ai: true });
    yy += h + 1;
    const words = rest.replace(/^[—–-]\s*/, '');
    for (const ln of evenLines(words, room - 9)) {
      const w = measureText(ln) + 9;
      if (w > room) lost.push(ln);
      plates.push({ role: 'line', x: right - w, y: yy, w, h, color: P.black, text: ln, ink: P.white });
      yy += h + 1;
    }
    // the source in the micro face (the package's face for sources: ART_DIRECTION §4), so the stack stays above
    // the guest's eyes in a 9:16 window; 5 px capitals are still 44 px tall on a 1920 px picture
    yy += gap - 1;
    for (const ln of evenLines(credit, room - 8, 'micro')) {
      const w = measureText(ln, 1, 'micro') + 8;
      if (w > room) lost.push(ln);
      plates.push({ role: 'credit', x: right - w, y: yy, w, h: MICRO_H, color: P.ink, text: ln, ink: P.silver, font: 'micro' });
      yy += MICRO_H + 1;
    }
  }
  if (HEAD_W > room) lost.push(HEAD);
  const label = plates.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x + p.w), y1: Math.max(b.y1, p.y + p.h) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  // the name super: the role (or the feature) on the accent tag, the name on the bar; inside the window, the name
  // wraps to two lines rather than lose a word
  const sx = narrow ? left : STRAP.x;
  const sw = narrow ? room : STRAP.right - STRAP.x;
  const nameRoom = narrow ? room - 10 : NAME_ROOM;
  const nameLines = narrow ? upTo(String(r.name || ''), nameRoom, 2, lost) : [fit(String(r.name || ''), nameRoom)];
  const barH = STRAP.barH + (nameLines.length - 1) * 10;
  const barY = STRAP.bottom - barH;
  // (the role wraps too inside a window, up to four lines on the tag, rather than a role cut after "OF")
  const roleText = r.role ? r.role : FEATURE;
  const roleLines = narrow ? upTo(roleText, nameRoom, 4, lost) : [fit(roleText, nameRoom)];
  const tagH = STRAP.tagH + (roleLines.length - 1) * 10;
  const tagW = Math.max(...roleLines.map((l) => measureText(l))) + 10;
  plates.push({ role: 'role', x: sx, y: barY - tagH, w: tagW, h: tagH, color: null, text: roleLines.join('\n'), lines: roleLines });
  plates.push({ role: 'name', x: sx, y: barY, w: sw, h: barH, color: P.ink, text: nameLines.join('\n'), lines: nameLines });
  return { plates, label, whole: lost.length === 0, lost };
}

/**
 * At most `max` lines of `text` in `room` px, whole words. When even that cannot hold it, the last line is fitted and
 * the words left out go to `lost` (the layout is then not whole, and the publish check refuses the window).
 */
function upTo(text, room, max, lost) {
  const lines = evenLines(String(text || ''), room, 'body', max);
  if (lines.length <= max) return lines;
  const kept = [...lines.slice(0, max - 1), fit(lines.slice(max - 1).join(' '), room)];
  const shown = kept.join(' ').split(' ').length;
  lost.push(String(text).split(/\s+/).filter(Boolean).slice(shown).join(' '));
  return kept;
}

/**
 * The top of the recreation's name super (its role tag) in the current frame: the captions sit above it. In the full
 * frame it is the strap's tag line; in a narrow window a wrapped role or name raises it. Cached per label and frame.
 */
const tops = new WeakMap();
export function recreationTop(rec) {
  if (!rec) return STRAP.tagY;
  if (!FRAME.active) return STRAP.tagY;
  const key = `${FRAME.x}|${FRAME.w}`;
  const hit = tops.get(rec);
  if (hit && hit.key === key) return hit.top;
  const top = recreationLayout(rec, FRAME).plates.find((p) => p.role === 'role').y;
  tops.set(rec, { key, top });
  return top;
}

/** The window a 9:16 clip of a recreation is cut to: centred on the guest at the lectern (studio/press.js headX 124). */
export const RECREATION_WINDOW = '9x16@64';

/** The label (top-right, or stacked in a clip's window) and the name super, static from the first frame. */
export function drawRecreation(ctx, rec, accent = P.red) {
  if (!rec) return;
  const L = recreationLayout(rec, FRAME);
  for (const p of L.plates) {
    if (p.role === 'mark') {
      rect(ctx, p.x, p.y, p.w, p.h, p.color);
      drawBoldAI(ctx, p.x + 4, p.y + 2, p.ink);
      drawText(ctx, p.text, p.x + 4 + AI_W + 4, p.y + 2, { color: p.ink });
    } else if (p.role === 'line') {
      rect(ctx, p.x, p.y, p.w, p.h, p.color);
      drawText(ctx, p.text, p.x + 5, p.y + 2, { color: p.ink });
    } else if (p.role === 'credit') {
      rect(ctx, p.x, p.y, p.w, p.h, p.color);
      drawText(ctx, p.text, p.x + (p.font === 'micro' ? 4 : 5), p.y + 2, { color: p.ink, font: p.font || 'body' });
    } else if (p.role === 'role') {
      rect(ctx, p.x, p.y, p.w, p.h, accent);
      p.lines.forEach((ln, i) => drawText(ctx, ln, p.x + 5, p.y + 2 + i * 10, { color: inkOn(accent) }));
    } else if (p.role === 'name') {
      rect(ctx, p.x, p.y, p.w, p.h, P.ink);
      rect(ctx, p.x, p.y, p.w, 1, accent);
      rect(ctx, p.x, p.y + 1, p.w, 1, P.slate);
      rect(ctx, p.x, p.y + p.h - 1, p.w, 1, P.black);
      p.lines.forEach((ln, i) => drawText(ctx, ln, p.x + 5, p.y + 5 + i * 10, { color: P.white }));
    }
  }
}

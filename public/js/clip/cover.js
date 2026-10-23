// The packaging's pictures (docs/publishing/thumbnails-titles.md): a clip's covers (Shorts, TikTok, Reels: 216x384,
// 1080x1920 at 5x) and its thumbnails (YouTube, X, Facebook: 384x216, 1920x1080 at 5x), on the channel's own grid,
// scaled by whole numbers only by the publishing desk, so every pixel is as crisp as on air.
//
// One template per programme, three variants per clip (YouTube's Test & Compare takes three; the owner picks one for
// a Short, a TikTok or a Reel):
//   A 'photo'      the story's cleared picture (pixelated as on air, its credit on it), the words under it
//   B 'presenter'  the programme's presenter as the clip shows them (a frame of the clip itself), the words under it
//   C 'words'      the words big, the picture (or the presenter) as a strip above them
// Every variant carries the brand frame: the channel's bug and the programme's own tag and colour (cast.js
// THEME_ACCENT), the accent bar under the picture, the type in the channel's 5x7 face made bold (each glyph one
// pixel wider, a pixel apart) with a one-pixel shadow. Nothing on a cover that the clip does not show or say: the
// picture is the one the story aired with, the presenter a frame of the clip, the words checked by
// server/publish/packaging.js. Grave news: no accent colour in the words, the bar in the set's steel.
//
// The words sit where every feed keeps them: on a cover inside the 4:5 middle (y 57-327: Instagram's grid crops a Reel
// to 3:4, y 48-336; TikTok's profile grid crops the same way), on a thumbnail clear of YouTube's time stamp (bottom
// right).
//
//   coverWords(text, width, height, { scales, maxLines })  the lines and the scale that fit -> { lines, scale } | null
//   drawBold(ctx, text, x, y, scale, color, { shadow })      the bold face; returns the width
//   drawCover(ctx, spec)    a 216x384 cover          spec: { variant, programme, accent, words, photo, credit,
//   drawThumb16(ctx, spec)  a 384x216 thumbnail             frame, frameRect, kicker, grave }
import { P } from '../palette.js';
import { drawText, measureText, textPixels } from '../font.js';
import { TOP } from '../graphics/layout.js';
import { drawBugOnly, drawProgrammeTag } from './graphics.js';

export const COVER = Object.freeze({ w: 216, h: 384 });
export const THUMB = Object.freeze({ w: 384, h: 216 });
/** The part of a cover every feed shows (the 4:5 middle; Instagram's 3:4 grid keeps y 48-336). */
export const COVER_SAFE = Object.freeze({ top: 57, bottom: 327, left: 8, right: 208 });
/** A thumbnail's corner YouTube covers with the video's length. */
export const THUMB_STAMP = Object.freeze({ x: 330, y: 190 });
export const VARIANTS = Object.freeze(['photo', 'presenter', 'words']);
/**
 * A story's picture is pixelated exactly as on air: the director's full-screen rendition (director.js FULL, 416×234 at
 * the channel's pixel, 24 colours), and a cover or a thumbnail shows a 1x crop of it, never a finer pixelation of
 * the same picture (test/packaging.test.js holds the two sizes together).
 */
export const ON_AIR_PICTURE = Object.freeze({ w: 416, h: 234, colors: 24 });
/** The vertical picture's stage (clip/layout.js V.stage): the presenter as the clip shows them, at 1x. */
export const STAGE = Object.freeze({ x: 0, y: 72, w: 216, h: 176 });

/**
 * The box a variant's picture fills (a story's picture is pixelated at exactly this size: one pixel, one pixel). A
 * cover's picture is the stage's height for A and B (the presenter as the clip shows them, at 1x), a strip for C; a
 * thumbnail's is full width over the words for A, a panel at the right for B (the presenter's stage), a column for C.
 */
export function pictureBox(format, variant) {
  if (format === 'vertical') return variant === 'words' ? { x: 0, y: 40, w: 216, h: 112 } : { x: 0, y: 40, w: 216, h: STAGE.h };
  // (B's panel is the stage's middle, 152 wide: the face; the words beside it keep 3x for a nine-letter word)
  if (variant === 'presenter') return { x: 232, y: 40, w: 152, h: STAGE.h };
  return variant === 'words' ? { x: 232, y: 0, w: 152, h: 216 } : { x: 0, y: 0, w: 384, h: 136 };
}

const INK_ON = new Set([P.yellow, P.cyan, P.green, P.cream, P.white, P.silver, P.orange, P.pink]);

/** A word's width in the bold face at `scale` (each glyph one pixel wider, then a pixel apart; a space is 4). */
export function boldWidth(text, scale = 1) {
  let w = 0;
  for (const ch of String(text || '').toUpperCase()) {
    if (ch === ' ') {
      w += 4;
      continue;
    }
    w += textPixels(ch, 'body').width + 2;
  }
  return Math.max(0, w - 1) * scale;
}

/** The bold face: the 5x7 body glyphs dilated one pixel to the right, a pixel apart; a shadow one pixel down-right. */
export function drawBold(ctx, text, x, y, scale, color, { shadow = P.black } = {}) {
  const s = scale;
  const paint = (dx, dy, c) => {
    ctx.fillStyle = c;
    let cx = x + dx;
    for (const ch of String(text || '').toUpperCase()) {
      if (ch === ' ') {
        cx += 4 * s;
        continue;
      }
      const g = textPixels(ch, 'body');
      for (const [px, py] of g.pixels) ctx.fillRect(cx + px * s, y + dy + py * s, 2 * s, s);
      cx += (g.width + 2) * s;
    }
  };
  if (shadow) paint(s, s, shadow);
  paint(0, 0, color);
  return boldWidth(text, scale);
}

/**
 * The words in at most `maxLines` lines of at most `width` pixels, at the biggest scale of `scales` whose lines also
 * fit `height` (a line is 7 glyph pixels and a 3-pixel gap). Whole words only. null when nothing fits.
 */
export function coverWords(text, width, height, { scales = [6, 5, 4, 3, 2], maxLines = 3 } = {}) {
  const words = String(text || '').toUpperCase().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  for (const scale of scales) {
    const lines = [''];
    let ok = true;
    for (const w of words) {
      const cur = lines[lines.length - 1];
      const next = cur ? `${cur} ${w}` : w;
      if (boldWidth(next, scale) <= width) lines[lines.length - 1] = next;
      else if (!cur || boldWidth(w, scale) > width) {
        ok = false;
        break;
      } else lines.push(w);
    }
    const h = lines.length * 7 * scale + (lines.length - 1) * 3 * scale;
    if (ok && lines.length <= maxLines && h <= height) return { lines, scale, height: h };
  }
  return null;
}

/** The words, ranged left (or centred), the line that carries the point in the accent colour (never on grave news). */
function drawWordsBlock(ctx, fit, x, y, width, { accent, grave, align = 'left' }) {
  const hi = grave ? P.white : INK_ON.has(accent) ? accent : P.yellow;
  const pitch = 10 * fit.scale;
  fit.lines.forEach((line, i) => {
    const w = boldWidth(line, fit.scale);
    const lx = align === 'center' ? x + Math.round((width - w) / 2) : x;
    // the last line in the accent when there are two or more (the word that carries the point: a figure, a place)
    const color = fit.lines.length > 1 && i === fit.lines.length - 1 ? hi : P.white;
    drawBold(ctx, line, lx, y + i * pitch, fit.scale, color);
  });
}

/**
 * An image in a box at 1x (never scaled: no pixel bigger than another), its middle (or `src.focusY` of its height) in
 * the box's middle; what the box has left over stays black. `src` a rectangle of the image (a frame's stage).
 */
function fill(ctx, img, box, src = null) {
  const iw = src?.w || img.width;
  const ih = src?.h || img.height;
  const cw = Math.min(iw, box.w);
  const ch = Math.min(ih, box.h);
  const sx = (src?.x || 0) + Math.floor((iw - cw) * (src?.focusX ?? 0.5));
  const sy = (src?.y || 0) + Math.floor((ih - ch) * (src?.focusY ?? 0.5));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, cw, ch, box.x + ((box.w - cw) >> 1), box.y + ((box.h - ch) >> 1), cw, ch);
}

/** A picture's credit (FILE · AUTHOR · LICENCE · PIXELATED) in the micro face on a dark plate, bottom left of its box. */
function drawCredit(ctx, credit, box) {
  if (!credit) return;
  let c = String(credit).toUpperCase();
  while (c.length > 8 && measureText(c, 1, 'micro') > box.w - 6) c = c.replace(/\s*·?\s*[^·]*$/, '');
  const w = measureText(c, 1, 'micro') + 4;
  ctx.fillStyle = P.black;
  ctx.fillRect(box.x, box.y + box.h - 8, w, 8);
  drawText(ctx, c, box.x + 2, box.y + box.h - 6, { color: P.silver, font: 'micro' });
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/**
 * What a variant shows when the clip has nothing of its own for it (no picture of the story, no presenter on screen):
 * the programme's own card, its colour as an ordered dither on the set's ink and its name, so the three variants never
 * show the same picture three times. No frame is tinted: this is drawn instead of one.
 */
function drawBrandPanel(ctx, box, programme, accent, grave) {
  ctx.fillStyle = P.ink;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = grave ? P.slate : accent === P.purple ? P.fog : accent;
  for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) if (BAYER4[(y & 3) * 4 + (x & 3)] < 2 + Math.floor((3 * y) / box.h)) ctx.fillRect(box.x + x, box.y + y, 1, 1);
  const name = String(programme || 'GLOBIT 24').toUpperCase();
  const fit = coverWords(name, box.w - 24, box.h - 24, { scales: [4, 3, 2], maxLines: 2 });
  if (!fit) return;
  const pitch = 10 * fit.scale;
  fit.lines.forEach((l, i) => {
    const w = boldWidth(l, fit.scale);
    const lx = box.x + Math.round((box.w - w) / 2);
    const ly = box.y + Math.round((box.h - fit.height) / 2) + i * pitch;
    ctx.fillStyle = P.black;
    ctx.fillRect(lx - 4, ly - 4, w + 8 + fit.scale, 7 * fit.scale + 8 + fit.scale);
    drawBold(ctx, l, lx, ly, fit.scale, P.white);
  });
}

/** The brand row: the bug at its place, the programme's tag on its accent at the right. */
function drawMast(ctx, width, programme, accent, y = TOP.y) {
  drawBugOnly(ctx, 9, 0, TOP.x, y);
  const name = String(programme || '').toUpperCase();
  if (name) drawProgrammeTag(ctx, width - TOP.x - (measureText(name) + 8), y, name, accent);
}

/** What fills a variant's picture: the story's picture, else the clip's frame (its stage), else nothing. */
const pictureOf = (spec, prefer) => {
  const photo = spec.photo ? { img: spec.photo, src: spec.photoRect || null, credit: spec.credit } : null;
  const frame = spec.frame ? { img: spec.frame, src: spec.frameRect || null, credit: null } : null;
  return prefer === 'presenter' ? frame || photo : photo || frame;
};

/**
 * A cover, 216x384 (1080x1920 at 5x). `photo`: the story's picture already pixelated (a canvas); `frame`: a frame of
 * the clip (its vertical picture), `frameRect` the part of it that shows the presenter (the stage: x 0, y 72, 216x176).
 */
export function drawCover(ctx, spec = {}) {
  const { variant = 'photo', programme = '', accent = P.red, words = '', kicker = '', grave = false } = spec;
  const W = COVER.w;
  const H = COVER.h;
  const bar = grave ? P.steel : accent;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, H);
  const pic = pictureOf(spec, variant === 'presenter' ? 'presenter' : 'photo');
  const box = pictureBox('vertical', variant);
  if (pic) {
    fill(ctx, pic.img, box, pic.src);
    drawCredit(ctx, pic.credit, box);
  } else drawBrandPanel(ctx, box, programme, accent, grave);
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, 40);
  drawMast(ctx, W, programme, accent, 14);
  // the accent bar under the picture: the programme's colour, the brand's thread through every variant
  ctx.fillStyle = bar;
  ctx.fillRect(0, box.y + box.h, W, 4);
  // the words: under the picture, inside the 4:5 middle every feed keeps
  const top = box.y + box.h + 12;
  const room = COVER_SAFE.bottom - top;
  const fit = coverWords(words, W - 16, room, { scales: variant === 'words' ? [7, 6, 5, 4, 3, 2] : [5, 4, 3, 2], maxLines: 3 });
  if (fit) drawWordsBlock(ctx, fit, 8, top + Math.max(0, Math.floor((room - fit.height) / (variant === 'words' ? 2 : 3))), W - 16, { accent, grave, align: variant === 'words' ? 'center' : 'left' });
  // the foot (under the grid's crop): the programme and the day, quietly
  if (kicker) drawText(ctx, String(kicker).toUpperCase(), 12, H - 30, { color: P.fog });
  return { fit, box };
}

/**
 * A thumbnail, 384x216 (1920x1080 at 5x). A: the story's picture full width, the words on a band under it (clear of
 * YouTube's time stamp at the bottom right); B: the presenter's stage as a panel at the right, the words at the left;
 * C: the words big at the left, the picture as a column at the right.
 */
export function drawThumb16(ctx, spec = {}) {
  const { variant = 'photo', programme = '', accent = P.red, words = '', kicker = '', grave = false } = spec;
  const W = THUMB.w;
  const H = THUMB.h;
  const bar = grave ? P.steel : accent;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, H);
  const pic = pictureOf(spec, variant === 'presenter' ? 'presenter' : 'photo');
  // (A with no picture of the story's own: a stage-wide frame as B's panel, never letterboxed across the width; a whole
  // frame, a board, keeps A's full width. C's narrow column never shows a slice of a whole frame's board: the card)
  const wide = (x) => (x?.src?.w || x?.img?.width || 0) >= W;
  const layout = variant === 'photo' && pic && !spec.photo && !wide(pic) ? 'presenter' : variant;
  const shown = layout === 'words' && pic && !spec.photo && wide(pic) ? null : pic;
  const box = pictureBox('horizontal', layout);
  let fit = null;
  if (layout === 'photo') {
    if (pic) {
      fill(ctx, pic.img, box, pic.src);
      const cw = Math.min(W, measureText(String(pic.credit || '').toUpperCase(), 1, 'micro') + 4);
      drawCredit(ctx, pic.credit, { ...box, x: W - cw, w: cw });
    } else drawBrandPanel(ctx, box, programme, accent, grave);
    ctx.fillStyle = bar;
    ctx.fillRect(0, box.h, W, 4);
    // a plate behind the bug and the tag, so they read on any picture
    ctx.fillStyle = P.black;
    ctx.fillRect(0, 0, W, TOP.y + TOP.h + 3);
    drawMast(ctx, W, programme, accent);
    // the words on the band: up to two lines, clear of the time stamp YouTube lays over the bottom right
    const top = box.h + 8;
    const room = H - 4 - top;
    fit = coverWords(words, THUMB_STAMP.x - 16, room, { scales: [6, 5, 4, 3, 2], maxLines: 2 });
    if (fit) drawWordsBlock(ctx, fit, 12, top + Math.max(0, Math.floor((room - fit.height) / 2)), THUMB_STAMP.x - 16, { accent, grave });
  } else {
    if (shown) {
      fill(ctx, shown.img, box, shown.src);
      drawCredit(ctx, shown.credit, box);
    } else drawBrandPanel(ctx, box, programme, accent, grave);
    ctx.fillStyle = bar;
    ctx.fillRect(box.x - 4, layout === 'presenter' ? box.y : 0, 4, layout === 'presenter' ? box.h : H);
    const width = box.x - 4 - 20;
    const top = 40;
    const room = (layout === 'presenter' ? box.y + box.h : H - 20) - top;
    fit = coverWords(words, width, room, { scales: [7, 6, 5, 4, 3, 2], maxLines: 3 });
    if (fit) drawWordsBlock(ctx, fit, 10, top + Math.max(0, Math.floor((room - fit.height) / 2)), width, { accent, grave });
    drawMast(ctx, layout === 'presenter' ? W : box.x - 4, programme, accent);
    if (kicker && layout === 'words') drawText(ctx, String(kicker).toUpperCase(), 12, H - 14, { color: P.fog });
  }
  return { fit, box };
}

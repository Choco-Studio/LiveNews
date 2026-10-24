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
  const photo = spec.photo ? { img: spec.photo, src: spec.photoRect || null, credit: spec.credit, photo: true } : null;
  const frame = spec.frame ? { img: spec.frame, src: spec.frameRect || null, credit: null, photo: false } : null;
  return prefer === 'presenter' ? frame || photo : photo || frame;
};

// ---------------------------------------------------------------------------------------------------- the look
// A thumbnail is not a slide: the picture fills the frame, the words stand on it in heavy type, the presenter stands
// in front of it as a cut-out. All of it on the channel's grid and palette: the shading is an ordered dither of the
// set's black (no colour that is not the channel's), the outline a whole pixel, the cut-out the cast's own drawing.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Shade a box with the set's black by an ordered dither: `dark(x, y)` 0 (none) to 1 (solid). Runs per row. */
function shade(ctx, box, dark) {
  ctx.fillStyle = P.black;
  const x1 = box.x + box.w;
  for (let y = box.y; y < box.y + box.h; y++) {
    let run = -1;
    for (let x = box.x; x <= x1; x++) {
      const on = x < x1 && BAYER4[(y & 3) * 4 + (x & 3)] < dark(x, y) * 16;
      if (on && run < 0) run = x;
      else if (!on && run >= 0) {
        ctx.fillRect(run, y, x - run, 1);
        run = -1;
      }
    }
  }
}

/** The glyph rectangles of `text` in the bold face at `s`, from (x, y). */
function glyphRects(text, x, y, s) {
  const rects = [];
  let cx = x;
  for (const ch of String(text || '').toUpperCase()) {
    if (ch === ' ') {
      cx += 4 * s;
      continue;
    }
    const g = textPixels(ch, 'body');
    for (const [px, py] of g.pixels) rects.push([cx + px * s, y + py * s, 2 * s, s]);
    cx += (g.width + 2) * s;
  }
  return rects;
}

/** Heavy type for words on a picture: the bold face inside a whole-pixel dark outline, with a hard shadow under it. */
export function drawHeavy(ctx, text, x, y, s, color, { outline = P.black, ow = Math.max(1, Math.round(s / 3)) } = {}) {
  const rects = glyphRects(text, x, y, s);
  ctx.fillStyle = outline;
  for (const [rx, ry, rw, rh] of rects) ctx.fillRect(rx - ow + ow, ry - ow + 2 * ow, rw + 2 * ow, rh + 2 * ow);
  for (const [rx, ry, rw, rh] of rects) ctx.fillRect(rx - ow, ry - ow, rw + 2 * ow, rh + 2 * ow);
  ctx.fillStyle = color;
  for (const [rx, ry, rw, rh] of rects) ctx.fillRect(rx, ry, rw, rh);
  return boldWidth(text, s);
}

/** A line on a plate: the programme's colour behind it, outlined, the words in the set's black. */
function drawPlated(ctx, text, x, y, s, plate) {
  const w = boldWidth(text, s);
  const pad = Math.max(2, s);
  const ow = Math.max(1, Math.round(s / 3));
  ctx.fillStyle = P.black;
  ctx.fillRect(x - pad - ow + ow, y - pad - ow + 2 * ow, w + 2 * pad + 2 * ow, 7 * s + 2 * pad + 2 * ow);
  ctx.fillRect(x - pad - ow, y - pad - ow, w + 2 * pad + 2 * ow, 7 * s + 2 * pad + 2 * ow);
  ctx.fillStyle = plate;
  ctx.fillRect(x - pad, y - pad, w + 2 * pad, 7 * s + 2 * pad);
  ctx.fillStyle = P.black;
  for (const [rx, ry, rw, rh] of glyphRects(text, x, y, s)) ctx.fillRect(rx, ry, rw, rh);
  return w;
}

/**
 * The words laid on the picture: white heavy type, and the line that carries the point (the last of two or more) on a
 * plate in the programme's colour. Grave news: every line white, no plate, no colour. Lines ranged left or centred.
 */
function drawWordsOn(ctx, fit, x, y, width, { accent, grave, align = 'left' }) {
  const plate = INK_ON.has(accent) ? accent : P.yellow;
  const pitch = 10 * fit.scale + (grave ? 0 : Math.max(2, fit.scale));
  fit.lines.forEach((line, i) => {
    const w = boldWidth(line, fit.scale);
    const lx = align === 'center' ? x + Math.round((width - w) / 2) : x;
    const ly = y + i * pitch;
    if (!grave && fit.lines.length > 1 && i === fit.lines.length - 1) drawPlated(ctx, line, lx, ly, fit.scale, plate);
    else drawHeavy(ctx, line, lx, ly, fit.scale, P.white);
  });
}
/** The block's height with the plate's spacing. */
const blockHeight = (fit, grave) => fit.lines.length * 7 * fit.scale + (fit.lines.length - 1) * (3 * fit.scale + (grave ? 0 : Math.max(2, fit.scale)));

/** Fit words for a laid-on block: as coverWords, with room for the plate's spacing and the outline. */
function fitOn(words, width, height, scales, maxLines, grave) {
  const tries = [...scales.map((s) => [s, maxLines]), [3, maxLines + 1], [2, maxLines + 1]];
  let first = null;
  for (const [s, lines] of tries) {
    const f = coverWords(words, width - 2 * s, height, { scales: [s], maxLines: lines });
    if (!f || blockHeight(f, grave) + 3 * s > height) continue;
    const fit = { ...f, height: blockHeight(f, grave) };
    // (a line of one short word, "A" alone over "FLYING", wastes a line: one size smaller keeps the words together)
    if (fit.lines.some((l) => l.length < 3) && fit.lines.length > 1) {
      first ||= fit;
      continue;
    }
    return fit;
  }
  return first;
}

/**
 * The presenter's cut-out (clip/sprite.js) at (x, y), ringed by a whole-pixel outline in the set's black and a rim in
 * the programme's colour, so the figure stands off any picture. `rings` from the inside out.
 */
function drawSprite(ctx, sp, x, y, rings) {
  const R = rings.length;
  const W2 = sp.w + 2 * R;
  const H2 = sp.h + 2 * R;
  let mask = new Uint8Array(W2 * H2);
  try {
    const d = sp.canvas.getContext('2d').getImageData(0, 0, sp.w, sp.h).data;
    for (let j = 0; j < sp.h; j++) for (let i = 0; i < sp.w; i++) if (d[(j * sp.w + i) * 4 + 3]) mask[(j + R) * W2 + i + R] = 1;
  } catch {
    mask = null;
  }
  if (mask) {
    for (let r = 0; r < R; r++) {
      const next = mask.slice();
      ctx.fillStyle = rings[r];
      for (let j = 0; j < H2; j++) {
        for (let i = 0; i < W2; i++) {
          if (mask[j * W2 + i]) continue;
          let near = false;
          for (let dj = -1; dj <= 1 && !near; dj++) for (let di = -1; di <= 1 && !near; di++) near = !!mask[(j + dj) * W2 + i + di];
          if (near) {
            next[j * W2 + i] = 1;
            ctx.fillRect(x - R + i, y - R + j, 1, 1);
          }
        }
      }
      mask = next;
    }
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sp.canvas, x, y);
}

/**
 * The programme's backdrop when the picture is not the story's: the set's ink, the programme's colour rising from the
 * bottom as an ordered dither, a brighter burst behind where the presenter or the words stand. Grave news: slate.
 */
function drawBackdrop(ctx, box, accent, grave, burst = null) {
  ctx.fillStyle = P.ink;
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const tone = grave ? P.slate : accent === P.purple ? P.magenta : accent;
  ctx.fillStyle = tone;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const fall = (y - box.y) / box.h;
      let k = 0.15 + 0.55 * fall;
      if (burst) {
        const dx = (x - burst.x) / burst.r;
        const dy = (y - burst.y) / burst.r;
        k += 0.6 * clamp01(1 - Math.sqrt(dx * dx + dy * dy));
      }
      if (BAYER4[(y & 3) * 4 + (x & 3)] < clamp01(k) * 16) ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** The brand: the bug on a small plate top left, the programme's tag beside it; a picture's credit under the tag. */
function drawBrand(ctx, programme, accent, { y = TOP.y, credit = null, width = 384 } = {}) {
  const name = String(programme || '').toUpperCase();
  const tagW = name ? measureText(name) + 8 : 0;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, TOP.x + 52 + tagW + 6, y + TOP.h + 3);
  drawBugOnly(ctx, 9, 0, TOP.x, y);
  if (name) drawProgrammeTag(ctx, TOP.x + 52, y, name, accent);
  if (credit) {
    let c = String(credit).toUpperCase();
    while (c.length > 8 && measureText(c, 1, 'micro') > width - 12) c = c.replace(/\s*·?\s*[^·]*$/, '');
    const w = measureText(c, 1, 'micro') + 4;
    ctx.fillStyle = P.black;
    ctx.fillRect(width - w, 0, w, 8);
    drawText(ctx, c, width - w + 2, 2, { color: P.silver, font: 'micro' });
  }
}

/** Where a cut-out stands: its head at `hx` (clamped so the figure stays in the frame), its feet at the bottom edge. */
function placeSprite(sp, hx, bottom, { minX = -Infinity, maxRight = Infinity } = {}) {
  const headX = sp.head?.x ?? sp.w / 2;
  let x = Math.round(hx - headX);
  if (x + sp.w > maxRight) x = maxRight - sp.w;
  if (x < minX) x = minX;
  return { x, y: bottom - sp.h };
}

/**
 * A thumbnail, 384x216 (1920x1080 at 5x). Three looks, each a full frame:
 *   A 'photo'      the story's picture full-bleed, shaded toward the words, the words laid on it bottom left
 *   B 'presenter'  the picture full-bleed and pushed back, the presenter as a cut-out on the right third, the words left
 *   C 'words'      the programme's colour, the words giant, the story's picture as a framed print (or the presenter)
 * Words clear of YouTube's time stamp (bottom right); the brand top left; the credit of a picture top right.
 */
export function drawThumb16(ctx, spec = {}) {
  const { variant = 'photo', programme = '', accent = P.red, words = '', kicker = '', grave = false, sprite = null } = spec;
  const W = THUMB.w;
  const H = THUMB.h;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, H);
  const full = { x: 0, y: 0, w: W, h: H };
  const pic = pictureOf(spec, variant === 'presenter' ? 'photo' : 'photo');
  const ringed = grave ? [P.black, P.steel] : [P.black, INK_ON.has(accent) ? accent : P.yellow];
  let fit = null;
  let box = full;
  if (variant === 'photo') {
    if (pic) fill(ctx, pic.img, full, pic.src);
    else {
      // nothing of the story's or the clip's own: the programme's backdrop and its presenter, never an empty frame
      drawBackdrop(ctx, full, accent, grave, { x: 300, y: 90, r: 140 });
      if (sprite) {
        const at = placeSprite(sprite, 300, H, { maxRight: W + Math.round(sprite.w * 0.12) });
        drawSprite(ctx, sprite, Math.max(at.x, 222), at.y, ringed);
      }
    }
    shade(ctx, full, (x, y) => Math.max(clamp01((200 - x) / 200) * 0.35, clamp01((y - 96) / 120) * (grave ? 0.9 : 0.8)));
    // (two lines at most along the bottom: a picture's subject, a face, sits in its upper middle and stays clear)
    const width = THUMB_STAMP.x - 26;
    fit = fitOn(words, width, 100, [8, 7, 6, 5, 4, 3], 2, grave);
    if (fit) drawWordsOn(ctx, fit, 14, H - 16 - fit.height, width, { accent, grave });
    drawBrand(ctx, programme, accent, { credit: pic?.credit });
  } else if (variant === 'presenter') {
    // (behind the cut-out only the story's own picture: a frame of the clip shows the same presenter, a ghost of them)
    const bg = pic?.photo ? pic : null;
    if (bg) fill(ctx, bg.img, full, bg.src);
    else drawBackdrop(ctx, full, accent, grave, { x: 300, y: 100, r: 130 });
    shade(ctx, full, (x) => (bg ? 0.45 : 0) + clamp01((220 - x) / 220) * 0.5);
    let left = W;
    if (sprite) {
      // the words keep 200 pixels at least: the presenter moves right for them (the frame's edge may cut a shoulder,
      // never the face)
      const at = placeSprite(sprite, 300, H, { maxRight: W + Math.round(sprite.w * 0.12) });
      const headX = sprite.head?.x ?? sprite.w / 2;
      at.x = Math.min(Math.max(at.x, 222), W - headX - 30);
      drawSprite(ctx, sprite, at.x, at.y, ringed);
      left = Math.max(222, at.x + 6);
      box = { x: at.x, y: at.y, w: sprite.w, h: sprite.h };
    } else if (spec.frame) {
      // no cut-out (a presenter the cast cannot draw alone): the clip's own frame of them, as a panel
      box = pictureBox('horizontal', 'presenter');
      fill(ctx, spec.frame, box, spec.frameRect);
      ctx.fillStyle = grave ? P.steel : accent;
      ctx.fillRect(box.x - 4, box.y, 4, box.h);
      left = box.x - 4;
    }
    const width = Math.min(left, THUMB_STAMP.x) - 26;
    fit = fitOn(words, width, H - 40 - 16, [8, 7, 6, 5, 4, 3], 3, grave);
    if (fit) drawWordsOn(ctx, fit, 14, 40 + Math.max(0, Math.floor((H - 56 - fit.height) / 2)), width, { accent, grave });
    drawBrand(ctx, programme, accent, { credit: pic?.photo ? pic.credit : null, width: left < W ? left : W });
  } else {
    drawBackdrop(ctx, full, accent, grave, { x: 290, y: 108, r: 150 });
    let left = W;
    if (pic?.photo) {
      // the story's picture as a panel down the right third, at 1x (the middle of the on-air rendition: its subject),
      // a black rule and the programme's colour between it and the words
      box = { x: 222, y: 0, w: W - 222, h: H };
      fill(ctx, pic.img, box, pic.src);
      ctx.fillStyle = P.black;
      ctx.fillRect(box.x - 4, 0, 4, H);
      ctx.fillStyle = grave ? P.steel : INK_ON.has(accent) ? accent : P.yellow;
      ctx.fillRect(box.x - 7, 0, 3, H);
      left = box.x - 10;
    } else if (sprite) {
      const at = placeSprite(sprite, 306, H, { maxRight: W + Math.round(sprite.w * 0.15) });
      drawSprite(ctx, sprite, at.x, at.y, ringed);
      box = { x: at.x, y: at.y, w: sprite.w, h: sprite.h };
      left = Math.max(180, at.x + 6);
    } else if (pic) {
      box = { x: 236, y: 30, w: 132, h: 160 };
      fill(ctx, pic.img, box, pic.src);
      left = box.x - 6;
    }
    const width = Math.min(left, THUMB_STAMP.x) - 22;
    fit = fitOn(words, width, H - 40 - 22, [10, 9, 8, 7, 6, 5, 4, 3], 3, grave);
    if (fit) drawWordsOn(ctx, fit, 14, 40 + Math.max(0, Math.floor((H - 62 - fit.height) / 2)), width, { accent, grave });
    drawBrand(ctx, programme, accent, { credit: pic?.photo ? pic.credit : null, width: W });
    if (kicker) drawText(ctx, String(kicker).toUpperCase(), 14, H - 12, { color: P.fog });
  }
  // the programme's thread: a bar along the bottom (the set's steel on grave news)
  ctx.fillStyle = grave ? P.steel : accent;
  ctx.fillRect(0, H - 3, THUMB_STAMP.x - 8, 3);
  return { fit, box };
}

/**
 * A cover, 216x384 (1080x1920 at 5x). The words and the face inside the 4:5 middle every feed keeps (y 57-327).
 *   A 'photo'      the story's picture (1x, as on air) under the brand, shaded at its foot, the words laid across it
 *   B 'presenter'  the words at the top of the middle, the presenter's cut-out big below them, the picture behind
 *   C 'words'      the programme's colour, the words giant, the picture as a framed print under them (or the presenter)
 */
export function drawCover(ctx, spec = {}) {
  const { variant = 'photo', programme = '', accent = P.red, words = '', kicker = '', grave = false, sprite = null } = spec;
  const W = COVER.w;
  const H = COVER.h;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, H);
  const full = { x: 0, y: 0, w: W, h: H };
  const pic = pictureOf(spec, 'photo');
  const ringed = grave ? [P.black, P.steel] : [P.black, INK_ON.has(accent) ? accent : P.yellow];
  const room = { top: COVER_SAFE.top + 4, bottom: COVER_SAFE.bottom - 4 };
  let fit = null;
  let box = full;
  drawBackdrop(ctx, full, accent, grave, variant === 'words' ? { x: 108, y: 160, r: 150 } : { x: 108, y: 300, r: 140 });
  if (variant === 'photo') {
    box = { x: 0, y: 40, w: W, h: 234 };
    if (pic) {
      fill(ctx, pic.img, box, pic.src);
      shade(ctx, box, (x, y) => clamp01((y - 170) / 104) * (grave ? 0.9 : 0.75));
      ctx.fillStyle = grave ? P.steel : accent;
      ctx.fillRect(0, box.y + box.h, W, 3);
    } else if (sprite) {
      // nothing of the story's or the clip's own: the presenter stands where the picture would be, never an empty frame
      const at = placeSprite(sprite, W / 2, box.y + box.h, { minX: -Math.round(sprite.w * 0.2), maxRight: W + Math.round(sprite.w * 0.2) });
      drawSprite(ctx, sprite, at.x, Math.max(48, at.y), ringed);
    }
    fit = fitOn(words, W - 20, room.bottom - 196, [7, 6, 5, 4, 3], 3, grave);
    if (fit) drawWordsOn(ctx, fit, 10, room.bottom - fit.height, W - 20, { accent, grave, align: 'center' });
  } else if (variant === 'presenter') {
    box = { x: 0, y: 40, w: W, h: 234 };
    if (pic?.photo) {
      fill(ctx, pic.img, box, pic.src);
      shade(ctx, box, (x, y) => 0.45 + clamp01((150 - (y - 40)) / 150) * 0.4);
    }
    fit = fitOn(words, W - 20, 104, [6, 5, 4, 3], 3, grave);
    const wordsBottom = fit ? room.top + fit.height : room.top;
    if (sprite) {
      const at = placeSprite(sprite, W / 2, H, { minX: -Math.round(sprite.w * 0.2), maxRight: W + Math.round(sprite.w * 0.2) });
      // the face inside the middle: the head no higher than just under the words
      const y = Math.max(wordsBottom + 10, at.y);
      drawSprite(ctx, sprite, at.x, y, ringed);
      box = { x: at.x, y, w: sprite.w, h: sprite.h };
    } else if (spec.frame) {
      box = { ...STAGE, y: Math.max(wordsBottom + 10, STAGE.y) };
      fill(ctx, spec.frame, box, spec.frameRect);
    }
    if (fit) drawWordsOn(ctx, fit, 10, room.top, W - 20, { accent, grave, align: 'center' });
  } else {
    fit = fitOn(words, W - 20, 150, [9, 8, 7, 6, 5, 4, 3], 3, grave);
    if (pic?.photo) {
      box = { x: 20, y: 210, w: W - 40, h: 108 };
      ctx.fillStyle = P.black;
      ctx.fillRect(box.x - 3 + 4, box.y - 3 + 4, box.w + 6, box.h + 6);
      ctx.fillRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
      ctx.fillStyle = P.white;
      ctx.fillRect(box.x - 2, box.y - 2, box.w + 4, box.h + 4);
      // (a print shows the upper middle of the picture, where its subject's face is: never a chin)
      fill(ctx, pic.img, box, { ...(pic.src || { x: 0, y: 0, w: pic.img.width, h: pic.img.height }), focusY: Math.min(pic.src?.focusY ?? 0.35, 0.2) });
    } else if (sprite) {
      const at = placeSprite(sprite, W / 2, H, { minX: -Math.round(sprite.w * 0.2), maxRight: W + Math.round(sprite.w * 0.2) });
      const y = Math.max(214, at.y);
      drawSprite(ctx, sprite, at.x, y, ringed);
      box = { x: at.x, y, w: sprite.w, h: sprite.h };
    } else if (pic) {
      box = { x: 20, y: 210, w: W - 40, h: 108 };
      fill(ctx, pic.img, box, pic.src);
    }
    if (fit) drawWordsOn(ctx, fit, 10, room.top + Math.max(0, Math.floor((144 - fit.height) / 2)), W - 20, { accent, grave, align: 'center' });
  }
  ctx.fillStyle = P.black;
  ctx.fillRect(0, 0, W, 40);
  drawMast(ctx, W, programme, accent, 14);
  if (pic?.photo && pic.credit) drawCredit(ctx, pic.credit, { x: 0, y: 32, w: W, h: 8 });
  ctx.fillStyle = grave ? P.steel : accent;
  ctx.fillRect(0, 40, W, 3);
  if (kicker) drawText(ctx, String(kicker).toUpperCase(), 12, H - 30, { color: P.fog });
  return { fit, box };
}

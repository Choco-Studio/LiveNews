// Bitmap fonts, uppercase only, proportional width: the 5x7 body/display face
// and a 3x5 micro face. Accents are drawn as marks above the base letter so
// Spanish text (ÁÉÍÓÚÑÜ¿¡) renders correctly. Normalisation, widths, wraps
// and rendered strings are all memoised: per-frame text costs one Map lookup.

const GLYPHS = `
A .###. #...# #...# ##### #...# #...# #...#
B ####. #...# #...# ####. #...# #...# ####.
C .###. #...# #.... #.... #.... #...# .###.
D ####. #...# #...# #...# #...# #...# ####.
E ##### #.... #.... ####. #.... #.... #####
F ##### #.... #.... ####. #.... #.... #....
G .###. #...# #.... #.### #...# #...# .####
H #...# #...# #...# ##### #...# #...# #...#
I ### .#. .#. .#. .#. .#. ###
J ..### ...#. ...#. ...#. #..#. #..#. .##..
K #...# #..#. #.#.. ##... #.#.. #..#. #...#
L #.... #.... #.... #.... #.... #.... #####
M #...# ##.## #.#.# #.#.# #...# #...# #...#
N #...# #...# ##..# #.#.# #..## #...# #...#
O .###. #...# #...# #...# #...# #...# .###.
P ####. #...# #...# ####. #.... #.... #....
Q .###. #...# #...# #...# #.#.# #..#. .##.#
R ####. #...# #...# ####. #.#.. #..#. #...#
S .#### #.... #.... .###. ....# ....# ####.
T ##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..
U #...# #...# #...# #...# #...# #...# .###.
V #...# #...# #...# #...# #...# .#.#. ..#..
W #...# #...# #...# #.#.# #.#.# #.#.# .#.#.
X #...# #...# .#.#. ..#.. .#.#. #...# #...#
Y #...# #...# .#.#. ..#.. ..#.. ..#.. ..#..
Z ##### ....# ...#. ..#.. .#... #.... #####
0 .###. #...# #..## #.#.# ##..# #...# .###.
1 .#. ##. .#. .#. .#. .#. ###
2 .###. #...# ....# ...#. ..#.. .#... #####
3 ####. ....# ....# .###. ....# ....# ####.
4 ...#. ..##. .#.#. #..#. ##### ...#. ...#.
5 ##### #.... ####. ....# ....# #...# .###.
6 .###. #.... #.... ####. #...# #...# .###.
7 ##### ....# ...#. ..#.. .#... .#... .#...
8 .###. #...# #...# .###. #...# #...# .###.
9 .###. #...# #...# .#### ....# ....# .###.
. . . . . . . #
, .. .. .. .. .. .# .# #.
: . . # . . # .
; .. .. .# .. .. .# .# #.
! # # # # # . #
¡ # . # # # # #
? .###. #...# ....# ...#. ..#.. ..... ..#..
¿ ..#.. ..... ..#.. .#... #.... #...# .###.
' # # . . . . .
" #.# #.# ... ... ... ... ...
- .... .... .... #### .... .... ....
+ ..... ..#.. ..#.. ##### ..#.. ..#.. .....
/ ....# ...#. ...#. ..#.. .#... .#... #....
( .# #. #. #. #. #. .#
) #. .# .# .# .# .# #.
% ##..# ##.#. ...#. ..#.. .#... .#.## #..##
& .##.. #..#. #.#.. .#... #.#.# #..#. .##.#
# .#.#. .#.#. ##### .#.#. ##### .#.#. .#.#.
@ .###. #...# #.### #.#.# #.### #.... .###.
€ ..### .#... ####. .#... ####. .#... ..###
£ ..##. .#..# .#... ####. .#... .#... #####
¥ #...# .#.#. ..#.. ##### ..#.. ##### ..#..
$ ..#.. .#### #.#.. .###. ..#.# ####. ..#..
* ..... #.#.# .###. ##### .###. #.#.# .....
= .... .... #### .... #### .... ....
_ .... .... .... .... .... .... ####
< ...# ..#. .#.. #... .#.. ..#. ...#
> #... .#.. ..#. ...# ..#. .#.. #...
★ ..#.. ..#.. ##### .###. .#.#. #...# .....
° .#. #.# .#. ... ... ... ...
• ... ... .#. ### .#. ... ...
▸ #.. ##. ### ##. #.. ... ...
| # # # # # # #
½ #.... #.... #..#. ..#.. .#.## #...# ...##
☆ ..#.. ..#.. ##.## .#.#. .#.#. #...# .....
`;

// 3x5 micro font for sources, times and small labels (art direction: "Micro is
// 3x5, for source and time only"). M, N and W are wider so they stay legible.
const MICRO_GLYPHS = `
A .#. #.# ### #.# #.#
B ##. #.# ##. #.# ##.
C .## #.. #.. #.. .##
D ##. #.# #.# #.# ##.
E ### #.. ##. #.. ###
F ### #.. ##. #.. #..
G .## #.. #.# #.# .##
H #.# #.# ### #.# #.#
I ### .#. .#. .#. ###
J ..# ..# ..# #.# .#.
K #.# #.# ##. #.# #.#
L #.. #.. #.. #.. ###
M #...# ##.## #.#.# #...# #...#
N #..# ##.# #.## #..# #..#
O .#. #.# #.# #.# .#.
P ##. #.# ##. #.. #..
Q .#. #.# #.# ##. .##
R ##. #.# ##. #.# #.#
S .## #.. .#. ..# ##.
T ### .#. .#. .#. .#.
U #.# #.# #.# #.# ###
V #.# #.# #.# #.# .#.
W #...# #...# #.#.# #.#.# .#.#.
X #.# #.# .#. #.# #.#
Y #.# #.# .#. .#. .#.
Z ### ..# .#. #.. ###
0 ### #.# #.# #.# ###
1 .#. ##. .#. .#. ###
2 ##. ..# .#. #.. ###
3 ##. ..# .#. ..# ##.
4 #.# #.# ### ..# ..#
5 ### #.. ##. ..# ##.
6 .## #.. ### #.# ###
7 ### ..# .#. .#. .#.
8 ### #.# ### #.# ###
9 ### #.# ### ..# ##.
. . . . . #
, . . . . # #
: . # . # .
; . . . . . # #
! # # # . #
¡ # . # # #
? ##. ..# .#. ... .#.
¿ .#. ... .#. #.. .##
' # # . . .
" #.# #.# ... ... ...
- ... ... ### ... ...
+ ... .#. ### .#. ...
/ ..# ..# .#. #.. #..
( .# #. #. #. .#
) #. .# .# .# #.
% #.# ..# .#. #.. #.#
& .#. #.# .#. #.# .##
# #.# ### #.# ### #.#
@ ### #.# #.# #.. .##
€ .## #.. ##. #.. .##
£ .## #.. ##. #.. ###
¥ #.# #.# .#. ### .#.
$ .## ##. .#. .## ##.
* ... #.# .#. #.# ...
= ... ### ... ### ...
_ ... ... ... ... ###
< ..# .#. #.. .#. ..#
> #.. .#. ..# .#. #..
° ### #.# ### ... ...
• .. .. ## ## ..
▸ #.. ##. ### ##. #..
| # # # # #
★ ... #.# .#. #.# ...
☆ ... #.# .#. #.# ...
½ #.. #.. ..# .#. #..
`;

// A font is { glyphs: Map(char -> {width, pixels}), space, ascent, lineHeight }.
function parseGlyphs(table) {
  const map = new Map();
  for (const line of table.trim().split('\n')) {
    const [ch, ...rows] = line.split(' ');
    const width = Math.max(...rows.map((row) => row.length));
    const pixels = [];
    rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && pixels.push([x, y])));
    map.set(ch, { width, pixels });
  }
  return map;
}

function compose(map, table) {
  for (const [ch, [base, marks]] of Object.entries(table)) {
    const b = map.get(base);
    if (b) map.set(ch, { width: b.width, pixels: [...b.pixels, ...marks] });
  }
}

// Diacritics: [base letter, mark pixels relative to glyph origin]
const ACUTE = [[3, -3], [2, -2]];
const TILDE = [[1, -3], [2, -3], [4, -3], [0, -2], [3, -2]];
const DIAER = [[1, -2], [3, -2]];
const CEDIL = [[2, 7], [1, 8]];
const body = parseGlyphs(GLYPHS);
compose(body, {
  Á: ['A', ACUTE], É: ['E', ACUTE], Í: ['I', [[2, -3], [1, -2]]], Ó: ['O', ACUTE], Ú: ['U', ACUTE],
  À: ['A', [[1, -3], [2, -2]]], È: ['E', [[1, -3], [2, -2]]], Ò: ['O', [[1, -3], [2, -2]]],
  Ñ: ['N', TILDE], Ü: ['U', DIAER], Ï: ['I', [[0, -2], [2, -2]]], Ç: ['C', CEDIL],
});

// Micro marks get one row of room above the cap line.
const M_ACUTE = [[2, -2]];
const M_GRAVE = [[0, -2]];
const micro = parseGlyphs(MICRO_GLYPHS);
compose(micro, {
  Á: ['A', M_ACUTE], É: ['E', M_ACUTE], Í: ['I', [[1, -2]]], Ó: ['O', M_ACUTE], Ú: ['U', M_ACUTE],
  À: ['A', M_GRAVE], È: ['E', M_GRAVE], Ò: ['O', M_GRAVE],
  Ñ: ['N', [[0, -2], [1, -2], [2, -2], [3, -2]]], Ü: ['U', [[0, -2], [2, -2]]], Ï: ['I', [[0, -2], [2, -2]]], Ç: ['C', [[1, 5]]],
});

export const LINE_HEIGHT = 11; // 7px glyph + room for accents above
export const ASCENT = 3; // pixels reserved above the cap line
export const MICRO_LINE_HEIGHT = 8; // 5px glyph + accent row + descender
export const MICRO_ASCENT = 2;
export const MICRO_CAP = 5; // cap height of the micro font (body: 7)

const FONTS = {
  body: { id: 'body', glyphs: body, space: 3, ascent: ASCENT, lineHeight: LINE_HEIGHT, cap: 7, unknown: 3, resolved: new Map() },
  micro: { id: 'micro', glyphs: micro, space: 2, ascent: MICRO_ASCENT, lineHeight: MICRO_LINE_HEIGHT, cap: MICRO_CAP, unknown: 2, resolved: new Map() },
};
const fontOf = (name) => (name === 'micro' ? FONTS.micro : FONTS.body);

/** Metrics of a font ('body' 5x7 or 'micro' 3x5): { ascent, lineHeight, cap, space }. */
export function fontMetrics(name = 'body') {
  const f = fontOf(name);
  return { ascent: f.ascent, lineHeight: f.lineHeight, cap: f.cap, space: f.space };
}

const ALIASES = { '«': '"', '»': '"', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'", '–': '-', '—': '-', '·': '•', 'º': '°', 'ª': '°' };

// Small bounded memo tables. Text on air repeats every frame, so after the
// first frame every lookup is a single Map hit (no regex, no toUpperCase).
function memo(limit) {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set(k, v) {
      if (m.size >= limit) m.delete(m.keys().next().value);
      m.set(k, v);
      return v;
    },
  };
}

const normMemo = memo(4000);
export function normalizeText(text) {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const hit = normMemo.get(s);
  if (hit !== undefined) return hit;
  let out = '';
  for (const c of s.replace(/…/g, '...').toUpperCase()) out += ALIASES[c] ?? c;
  return normMemo.set(s, out);
}

function glyphFor(f, c) {
  const g = f.glyphs.get(c);
  if (g) return g;
  let r = f.resolved.get(c);
  if (r === undefined) {
    // Strip unknown diacritics (e.g. Â → A); remember misses as null.
    const plain = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
    r = f.glyphs.get(plain) || null;
    f.resolved.set(c, r);
  }
  return r;
}

const widthMemo = { body: memo(4000), micro: memo(2000) };

/** Width in pixels at scale 1 of already-normalised text. */
function rawWidth(f, norm) {
  const table = widthMemo[f.id];
  const hit = table.get(norm);
  if (hit !== undefined) return hit;
  let w = 0;
  for (const c of norm) {
    if (c === ' ') w += f.space;
    else {
      const g = glyphFor(f, c);
      w += (g ? g.width : f.unknown) + 1;
    }
  }
  return table.set(norm, Math.max(0, w - 1));
}

/** Width of `text` in canvas pixels. `font` is 'body' (5x7, default) or 'micro' (3x5). */
export function measureText(text, scale = 1, font = 'body') {
  return rawWidth(fontOf(font), normalizeText(text)) * scale;
}

// Rendered strings, nested font -> scale -> colour -> text so a lookup never
// builds a key string (drawText runs dozens of times per frame). Each leaf
// table is bounded on its own; there are only a handful of font/scale/colour
// combinations on air.
const renderCache = new Map();
const RENDER_LIMIT = 400;

function leafFor(f, scale, color) {
  let byScale = renderCache.get(f.id);
  if (!byScale) renderCache.set(f.id, (byScale = new Map()));
  let byColor = byScale.get(scale);
  if (!byColor) byScale.set(scale, (byColor = new Map()));
  let leaf = byColor.get(color);
  if (!leaf) byColor.set(color, (leaf = new Map()));
  return leaf;
}

/** Render text to a cached offscreen canvas (cap line at y = ascent*scale). */
function renderText(f, text, color, scale) {
  const leaf = leafFor(f, scale, color);
  let c = leaf.get(text);
  if (c) return c;
  const norm = normalizeText(text);
  const w = Math.max(1, rawWidth(f, norm) * scale + scale);
  const h = (f.lineHeight + 1) * scale;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  let x = 0;
  for (const ch of norm) {
    if (ch === ' ') {
      x += f.space;
      continue;
    }
    const g = glyphFor(f, ch);
    if (!g) {
      x += f.unknown + 1;
      continue;
    }
    for (const [px, py] of g.pixels) ctx.fillRect((x + px) * scale, (py + f.ascent) * scale, scale, scale);
    x += g.width + 1;
  }
  if (leaf.size >= RENDER_LIMIT) leaf.delete(leaf.keys().next().value);
  leaf.set(text, c);
  return c;
}

/**
 * Draw text with its cap line at (x, y). Options: color, scale, shadow color,
 * align ('left' | 'center' | 'right'), font ('body' | 'micro'). Returns the width.
 */
export function drawText(ctx, text, x, y, { color = '#ffffff', scale = 1, shadow = null, align = 'left', font = 'body' } = {}) {
  if (text === null || text === undefined || text === '') return 0;
  const f = fontOf(font);
  const s = typeof text === 'string' ? text : String(text);
  const w = rawWidth(f, normalizeText(s)) * scale;
  const dx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const dy = Math.round(y - f.ascent * scale);
  if (shadow) ctx.drawImage(renderText(f, s, shadow, scale), dx + scale, dy + scale);
  ctx.drawImage(renderText(f, s, color, scale), dx, dy);
  return w;
}

/**
 * The lit pixels of `text` at scale 1 for code that draws into a pixel frame (no canvas): { width, cap,
 * pixels: [[x, y], ...] } with the cap line at y = 0. Memoised per font.
 */
const pixelMemo = { body: memo(400), micro: memo(400) };
export function textPixels(text, font = 'micro') {
  const f = fontOf(font);
  const s = typeof text === 'string' ? text : String(text ?? '');
  const hit = pixelMemo[f.id].get(s);
  if (hit) return hit;
  const norm = normalizeText(s);
  const pixels = [];
  let x = 0;
  for (const ch of norm) {
    if (ch === ' ') {
      x += f.space;
      continue;
    }
    const g = glyphFor(f, ch);
    if (!g) {
      x += f.unknown + 1;
      continue;
    }
    for (const [px, py] of g.pixels) pixels.push([x + px, py]);
    x += g.width + 1;
  }
  return pixelMemo[f.id].set(s, Object.freeze({ width: Math.max(0, x - 1), cap: f.cap, pixels }));
}

const wrapMemo = memo(1500);

/**
 * Greedy word wrap to a maximum pixel width; returns a frozen, cached array
 * (use in per-frame code). Word widths are measured once and summed, so a
 * long caption wraps in linear time.
 */
export function wrapLines(text, maxWidth, scale = 1, font = 'body') {
  const s = typeof text === 'string' ? text : String(text ?? '');
  const key = `${font}|${scale}|${maxWidth}|${s}`;
  const hit = wrapMemo.get(key);
  if (hit) return hit;
  const f = fontOf(font);
  const words = s.split(/\s+/).filter(Boolean);
  const lines = [];
  // width("a b") = width("a") + 1 (letter gap) + space + width("b")
  const gap = (f.space + 1) * scale;
  let line = '';
  let lineW = 0;
  for (const word of words) {
    const ww = rawWidth(f, normalizeText(word)) * scale;
    if (!line) {
      line = word;
      lineW = ww;
    } else if (lineW + gap + ww <= maxWidth) {
      line = `${line} ${word}`;
      lineW += gap + ww;
    } else {
      lines.push(line);
      line = word;
      lineW = ww;
    }
  }
  if (line) lines.push(line);
  return wrapMemo.set(key, Object.freeze(lines));
}

/** Greedy word wrap to a maximum pixel width (returns a fresh array callers may modify). */
export function wrapText(text, maxWidth, scale = 1, font = 'body') {
  return wrapLines(text, maxWidth, scale, font).slice();
}

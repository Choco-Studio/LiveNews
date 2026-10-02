// 5x7 bitmap font, uppercase only, proportional width. Accents are drawn as
// marks above the base letter so Spanish text (ÁÉÍÓÚÑÜ¿¡) renders correctly.

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

const font = new Map();
for (const line of GLYPHS.trim().split('\n')) {
  const [ch, ...rows] = line.split(' ');
  const width = rows[0].length;
  const pixels = [];
  rows.forEach((row, y) => [...row].forEach((c, x) => c === '#' && pixels.push([x, y])));
  font.set(ch, { width, pixels });
}

// Diacritics: [base letter, mark pixels relative to glyph origin]
const ACUTE = [[3, -3], [2, -2]];
const TILDE = [[1, -3], [2, -3], [4, -3], [0, -2], [3, -2]];
const DIAER = [[1, -2], [3, -2]];
const CEDIL = [[2, 7], [1, 8]];
const COMPOSED = {
  Á: ['A', ACUTE], É: ['E', ACUTE], Í: ['I', [[2, -3], [1, -2]]], Ó: ['O', ACUTE], Ú: ['U', ACUTE],
  À: ['A', [[1, -3], [2, -2]]], È: ['E', [[1, -3], [2, -2]]], Ò: ['O', [[1, -3], [2, -2]]],
  Ñ: ['N', TILDE], Ü: ['U', DIAER], Ï: ['I', [[0, -2], [2, -2]]], Ç: ['C', CEDIL],
};
for (const [ch, [base, marks]] of Object.entries(COMPOSED)) {
  const b = font.get(base);
  font.set(ch, { width: b.width, pixels: [...b.pixels, ...marks] });
}

const ALIASES = { '«': '"', '»': '"', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'", '–': '-', '—': '-', '·': '•', 'º': '°', 'ª': '°' };

export const LINE_HEIGHT = 11; // 7px glyph + room for accents above
export const ASCENT = 3; // pixels reserved above the cap line

export function normalizeText(text) {
  return String(text)
    .replace(/…/g, '...')
    .toUpperCase()
    .replace(/./gu, (c) => ALIASES[c] ?? c);
}

function glyphFor(c) {
  if (font.has(c)) return font.get(c);
  // Strip unknown diacritics (e.g. Â → A)
  const plain = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return font.get(plain) || null;
}

export function measureText(text, scale = 1) {
  let w = 0;
  for (const c of normalizeText(text)) {
    if (c === ' ') w += 3;
    else {
      const g = glyphFor(c);
      w += (g ? g.width : 3) + 1;
    }
  }
  return Math.max(0, w - 1) * scale;
}

const cache = new Map();

/** Render text to a cached offscreen canvas (cap line at y = ASCENT*scale). */
function renderText(text, color, scale) {
  const key = `${scale}|${color}|${text}`;
  let c = cache.get(key);
  if (c) return c;
  const norm = normalizeText(text);
  const w = Math.max(1, measureText(text, scale) + scale);
  const h = (LINE_HEIGHT + 1) * scale;
  c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  let x = 0;
  for (const ch of norm) {
    if (ch === ' ') {
      x += 3;
      continue;
    }
    const g = glyphFor(ch);
    if (!g) {
      x += 4;
      continue;
    }
    for (const [px, py] of g.pixels) ctx.fillRect((x + px) * scale, (py + ASCENT) * scale, scale, scale);
    x += g.width + 1;
  }
  if (cache.size > 400) cache.delete(cache.keys().next().value);
  cache.set(key, c);
  return c;
}

/**
 * Draw text with its cap line at (x, y). Options: color, scale, shadow color,
 * align ('left' | 'center' | 'right').
 */
export function drawText(ctx, text, x, y, { color = '#ffffff', scale = 1, shadow = null, align = 'left' } = {}) {
  if (!text) return 0;
  const w = measureText(text, scale);
  let dx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const dy = Math.round(y - ASCENT * scale);
  if (shadow) ctx.drawImage(renderText(text, shadow, scale), dx + scale, dy + scale);
  ctx.drawImage(renderText(text, color, scale), dx, dy);
  return w;
}

/** Greedy word wrap to a maximum pixel width. */
export function wrapText(text, maxWidth, scale = 1) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (measureText(test, scale) <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

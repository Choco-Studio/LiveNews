// Procedurally drawn pixel-art presenters. Every part is authored as a tiny
// ASCII sprite, compiled once into rectangles, then painted with integer
// fillRect calls on the low-resolution canvas so it stays crisp at any zoom.
// Colours come only from the channel palette.
//
// A look picks a hair/face `style` ('short' or 'bob') and toggles features
// (glasses, mustache, tie, pocket square, earrings, necklace…); any colour a
// look leaves out falls back to a sensible default, so new presenters only
// need a handful of fields.
import { P } from './palette.js';

export const LOOKS = {
  A: {
    name: 'PACO PÍXEL',
    style: 'short',
    skin: P.skin,
    skinShade: P.skinShade,
    hair: P.maroon,
    hairHi: P.brown,
    hairShade: P.black,
    temples: P.fog,
    templesHi: P.silver,
    brow: P.maroon,
    suit: P.navy,
    suitShade: P.ink,
    suitHi: P.steel,
    suitDeep: P.black,
    shirt: P.white,
    shirtShade: P.silver,
    tie: P.red,
    tieShade: P.darkRed,
    pocket: P.white,
    pocketShade: P.silver,
    glasses: P.steel,
    glassesHi: P.silver,
    mustache: true,
    prop: 'papers',
    phase: 0, // offsets idle animations (breathing, earrings) between presenters
  },
  B: {
    name: 'LOLA BYTE',
    style: 'bob',
    skin: P.tan,
    skinShade: P.tanShade,
    hair: P.rust,
    hairHi: P.orange,
    hairShade: P.darkRed,
    hairShine: P.yellow,
    brow: P.brown,
    suit: P.blue,
    suitShade: P.navy,
    suitHi: P.cyan,
    suitDeep: P.ink,
    shirt: P.cream,
    cuff: P.yellow, // gold bracelet
    earrings: P.yellow,
    necklace: P.yellow,
    necklaceShade: P.orange,
    lipstick: P.darkRed,
    lipstickHi: P.red,
    prop: 'tablet',
    phase: 2.3,
  },
};

// ---------------------------------------------------------------------------
// Sprite helpers

// Characters that render differently on each half of a mirrored sprite,
// [left, right], so symmetric shapes can carry light-from-the-left shading.
const SWAP = {
  '~': ['S', 's'], // skin lit / shaded
  '$': ['R', 'r'], // tie lit / shaded
};

const mirrorRow = (half) => {
  let left = '';
  let right = '';
  for (const ch of half) left += SWAP[ch] ? SWAP[ch][0] : ch;
  for (let i = half.length - 1; i >= 0; i--) right += SWAP[half[i]] ? SWAP[half[i]][1] : half[i];
  return left + right;
};

/**
 * Compile rows of characters into rectangles grouped by colour key. Runs that
 * repeat on consecutive rows merge, so big areas cost a single fillRect.
 */
function compile(rows, ox, oy) {
  const groups = {};
  const open = {};
  rows.forEach((row, dy) => {
    let i = 0;
    while (i < row.length) {
      const ch = row[i];
      let j = i + 1;
      while (j < row.length && row[j] === ch) j++;
      if (ch !== '.') {
        const key = `${ch}:${i}:${j}`;
        const prev = open[key];
        if (prev && prev[1] + prev[3] === oy + dy) prev[3]++;
        else (groups[ch] ||= []).push((open[key] = [ox + i, oy + dy, j - i, 1]));
      }
      i = j;
    }
  });
  return Object.entries(groups).map(([ch, rects]) => [ch, rects.flat()]);
}

/** Free-form sprite; (ox, oy) is its top-left relative to the anchor point. */
const spr = (rows, ox, oy) => compile(rows, ox, oy);
/** Symmetric sprite from left halves written outside → centre (centre line x - 0.5). */
const sym = (halves, oy = 0) => {
  const n = Math.max(...halves.map((h) => h.length));
  return compile(halves.map((h) => mirrorRow(h.padStart(n, '.'))), -n, oy);
};

/** Paint a compiled sprite at (x, y); `flip` mirrors it around x - 0.5. */
function draw(ctx, sprite, x, y, pal, flip = false) {
  for (const [ch, rects] of sprite) {
    const c = pal[ch];
    if (!c) continue;
    ctx.fillStyle = c;
    for (let i = 0; i < rects.length; i += 4) {
      const w = rects[i + 2];
      ctx.fillRect(flip ? x - rects[i] - w : x + rects[i], y + rects[i + 1], w, rects[i + 3]);
    }
  }
}

const PALS = new WeakMap();
/** Colour key → palette colour for a look (with fallbacks), cached per look. */
function palette(L) {
  let p = PALS.get(L);
  if (p) return p;
  const skin = L.skin || P.skin;
  const skinShade = L.skinShade || P.skinShade;
  const hair = L.hair || P.maroon;
  const suit = L.suit || P.navy;
  const suitShade = L.suitShade || P.ink;
  const shirt = L.shirt || P.white;
  p = {
    S: skin,
    s: skinShade,
    H: hair,
    h: L.hairHi || hair,
    j: L.hairShade || P.black,
    J: L.hairShine || L.hairHi || hair,
    G: L.temples || hair,
    g: L.templesHi || L.temples || L.hairHi || hair,
    K: P.black,
    W: P.white,
    k: P.black,
    F: L.glasses,
    f: L.glassesHi || L.glasses,
    Z: L.mustacheColor || hair,
    z: L.hairHi || hair,
    M: P.maroon,
    T: P.white,
    N: P.pink,
    L: L.lipstick || P.brown,
    l: L.lipstickHi || skinShade,
    U: suit,
    u: suitShade,
    V: L.suitHi || suit,
    D: L.suitDeep || suitShade,
    O: shirt,
    o: L.shirtShade || shirt,
    w: L.cuff || shirt,
    R: L.tie,
    r: L.tieShade || L.tie,
    X: L.pocket,
    x: L.pocketShade || L.pocket,
    Y: L.necklace,
    y: L.necklaceShade || L.necklace,
    m: P.black,
    n: P.steel,
    Q: P.white,
    q: P.fog,
    v: P.steel,
    I: P.ink,
    a: P.cyan,
    b: P.blue,
  };
  PALS.set(L, p);
  return p;
}

// ---------------------------------------------------------------------------
// Heads. Grid: column c of a 20-wide sprite sits at x - 10 + c; the face is
// centred on x - 0.5. Rows are relative to the top of the skull.

const HEAD = {
  short: sym([
    '....SSSSSS',
    '...SSSSSSS',
    '..~SSSSSSS',
    '..~SSSSSSS',
    '..~SSSSSSS',
    '..~SSSSSSS',
    '.~~SSSSSSS',
    '.s~SSSSSSS',
    '.s~SSSSSSS',
    '.~~SSSSSSS',
    '..~SSSSSSS',
    '..~SSSSSSS',
    '..~SSSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '....~SSSSS',
    '......~SSS',
  ]),
  bob: sym([
    '.....SSSSS',
    '....SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '...~SSSSSS',
    '....~SSSSS',
    '.....~SSSS',
    '......~SSS',
    '........SS',
  ]),
};

const HAIR_BACK = {
  bob: sym([
    '..jjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '.jjjjjjjjj',
    '..jjjjjjjj',
    '...jjjjjjj',
  ]),
};

const HAIR = {
  // side parting, combed over to the right, greying at the temples
  short: spr(
    [
      '.......HHHHHH.......',
      '.....HhhhhHHHHH.....',
      '....HhhHHHHHHHHHH...',
      '...HhHHHHHHHHHHHHH..',
      '..HhHHjHHHHHHHHHHH..',
      '..GHHHjHHHHHHHHHHG..',
      '..gG...HHHHHHH..GG..',
      '..gG............GG..',
      '..G..............G..',
      '..G..............G..',
    ],
    -10,
    -4,
  ),
  // rounded bob with a side-swept fringe, curling in at the jaw
  bob: spr(
    [
      '.......HHHHHH.......',
      '.....HJhhHHHHHH.....',
      '...HhhhHHHHHHHHHH...',
      '..HhhHHHHHHHHHHHHH..',
      '.HhHHHHHHHHHHHHHHHj.',
      '.HhHHjHHHHHHHHHHHHj.',
      'HHhHj..HHHHHHHHHHHjH',
      'HhHj.....jHHHHHHHjHH',
      'HhHj...........HHjHH',
      'HhHj............jHHH',
      'HHHj............jHHH',
      'HHHj............jHHH',
      'HHHj............jHHH',
      'HHHj............jHHH',
      'jHHj............jHHj',
      'jHHHj..........jHHHj',
      '.jHHH..........HHHj.',
      '..jjj..........jjj..',
    ],
    -10,
    -4,
  ),
};

// Face layout per style (x from the face centre, y from the skull top).
const FACE = {
  short: { eyeOx: -5, browOx: -6, noseY: 9, noseH: 2, mouthY: 13, cheekY: 9, jaw: [-3, 17, 6] },
  bob: { eyeOx: -4, browOx: -5, noseY: 9, noseH: 1, mouthY: 11, cheekY: 8, jaw: [-2, 16, 4] },
};

const GLASSES = spr(['..fFFF....fFFF..', 'FF....FFFF....FF', '.F....F..F....F.', '..FFFF....FFFF..'], -8, 5);

const MUSTACHE = {
  neutral: spr(['...zzzzzz...', '..ZZZZZZZZ..', '.ZZZ....ZZZ.'], -6, 11),
  happy: spr(['Z..zzzzzz..Z', '.ZZZZZZZZZZ.'], -6, 11),
  sad: spr(['...zzzzzz...', '..ZZZZZZZZ..', '.ZZZ....ZZZ.', '.Z........Z.'], -6, 11),
};

// Eyes are authored for the left eye and mirrored for the right one, unless
// a separate right-eye drawing is given (a glance to one side).
const eyeSet = (style, defs) => {
  const out = {};
  for (const [name, [rows, ox, oy, right]] of Object.entries(defs)) {
    const lx = FACE[style].eyeOx + ox;
    out[name] = { l: spr(rows, lx, oy), r: right ? spr(right, -lx - right[0].length, oy) : null };
  }
  return out;
};

const EYES = {
  short: eyeSet('short', {
    open: [['KW', 'KK'], 0, 6],
    blink: [['KK'], 0, 7],
    happy: [['.KK.', 'K..K'], -1, 6],
    surprised: [['WKW', 'WKW'], -1, 6],
    sad: [['.K', 'KK'], 0, 6],
    serious: [['ss', 'KK'], 0, 6],
    up: [['WK', 'WW'], 0, 6, ['WK', 'WW']],
  }),
  bob: eyeSet('bob', {
    open: [['kkk.', '.KW.', '.KK.'], -1, 5],
    blink: [['kkk.', '.ss.'], -1, 7],
    happy: [['.KK.', 'K..K'], -1, 6],
    surprised: [['.kk.', '.KW.', '.KK.', '.KK.'], -1, 4],
    sad: [['.kk.', 'kKW.', '.KK.'], -1, 5],
    serious: [['kkk.', '.KK.'], -1, 6],
    up: [['kkk.', '.WK.', '.WW.'], -1, 5, ['.kkk', '.WK.', '.WW.']],
  }),
};

// Brow heights per column (outer → inner) relative to the brow row; an
// optional second entry gives the right brow when it differs.
const BROWS = {
  neutral: [[0, 0, 0, 0], null],
  happy: [[0, -1, -1, 0], null],
  serious: [[0, 0, 0, 1], null],
  surprised: [[-1, -2, -2, -1], null],
  sad: [[1, 0, -1, -1], null],
  thinking: [[0, 0, 1, 1], [-1, -2, -2, -1]],
};

// Mouths, 8 wide and centred: L lip line, l lower lip, M inside, T teeth, N tongue.
const MOUTHS = {
  neutral0: spr(['..LLLL..', '...ll...'], -4, 0),
  happy0: spr(['.L....L.', '.LTTTTL.', '..LllL..'], -4, -1),
  serious0: spr(['.LLLLLL.'], -4, 0),
  surprised0: spr(['...LL...', '..LMML..', '...LL...'], -4, -1),
  sad0: spr(['..LLLL..', '.L....L.'], -4, 0),
  thinking0: spr(['....LLL.', '.......L'], -4, 0),
  neutral1: spr(['..MTTM..', '..MNNM..', '...ll...'], -4, 0),
  happy1: spr(['.MTTTTM.', '..MNNM..', '...ll...'], -4, 0),
  sad1: spr(['..MTTM..', '.MMNNMM.'], -4, 0),
  surprised1: spr(['...MM...', '..MTTM..', '..MNNM..', '...MM...'], -4, -1),
  neutral2: spr(['..MTTM..', '.MMMMMM.', '..MNNM..', '...ll...'], -4, 0),
  happy2: spr(['MTTTTTTM', '.MMMMMM.', '..MNNM..', '...ll...'], -4, 0),
  sad2: spr(['...MM...', '..MTTM..', '.MMNNMM.'], -4, 0),
  surprised2: spr(['..MMMM..', '.MTTTTM.', '.MMMMMM.', '..MNNM..', '...MM...'], -4, -1),
};
// under a mustache a closed smile shows as a toothy grin
const MOUTHS_MUSTACHE = { happy0: spr(['.LTTTTL.', '..LLLL..'], -4, 0) };

function mouthSprite(emotion, mouth, mustache) {
  if (mouth <= 0) return (mustache && MOUTHS_MUSTACHE[emotion + '0']) || MOUTHS[emotion + '0'] || MOUTHS.neutral0;
  const base = emotion === 'happy' || emotion === 'sad' || emotion === 'surprised' ? emotion : 'neutral';
  return MOUTHS[base + Math.min(2, mouth)];
}

// ---------------------------------------------------------------------------
// Bodies, relative to the shoulder line. 40-wide grid centred on x - 0.5.

// suit, shirt and tie
const SUIT = sym([
  '............VUUoO...',
  '..........VVUUUoOOOr',
  '........VVUUUUUuoOO$',
  '......VUUUUUUUUuuOO$',
  '.....VUUUUUUUUUUuOO$',
  '....VUUUUUUUUUUUuOO$',
  '....UUUUUUUUUUUUuOO$',
  '....UUUuUUUUUUUUUuO$',
  '....UUUuUUUUUUUUUu$$',
  '....UUUuUUUUUUUUUUu$',
  '....UUUuUUUUUUUUUUuu',
  '....UUUuUUUUUUUUUUUD',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUD',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
  '...UUUUuUUUUUUUUUUUU',
]);
// blazer over a top with a scooped neckline, buttoned at the waist
const BLAZER = sym([
  '.............VUOO...',
  '...........VVUOOOSSS',
  '.........VVUUOOuOSSS',
  '.......VVUUUUUOuuOSS',
  '......VUUUUUUUUuOOOS',
  '.....VUUUUUUUUUuuOOO',
  '.....UUUUUUUUUUUuOOO',
  '.....UUUuUUUUUUUuOOO',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUUuO',
  '.....UUUuUUUUUUUUUuO',
  '....UUUUuUUUUUUUUUUu',
  '....UUUUuUUUUUUUUUUD',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
  '....UUUUuUUUUUUUUUUU',
]);
const LAPEL_MIC = spr(['mn', 'mm'], -8, 5);
const POCKET_SQUARE = spr(['XX', 'XxX', 'uuuuu'], 7, 6);
const NECKLACE = spr(['Y....Y', '.Y..Y.', '..YY..', '..yy..'], -3, 1);

// ---------------------------------------------------------------------------
// Hands (the screen-left one; the other is mirrored), relative to (x, deskY).

const HAND_REST = spr(
  ['.DDD............', 'DUUUDDD.........', 'UUUUUUUDDwSSs...', 'uUUUUUUUUwSSSSs.', '.uuuuuuuuwsSsSs.'],
  -17,
  -3,
);
const HAND_UP = spr(
  ['.SsSs.', '.SSSS.', '.SSSSS', '.SSSS.', '..sS..', '.www..', 'DUUUD.', 'UUUUU.', 'uUUUUu', '.uuuu.'],
  -16,
  -8,
);
const PROPS = {
  papers: spr(['.QQQQQQQQQQ.', 'QvQvvQvvvQQQ', 'qqqqqqqqqqqq'], -6, -1),
  tablet: spr(['IIIIIIIIIIII', 'IaabaaabaaaI', 'KKKKKKKKKKKK'], -6, -1),
};

// ---------------------------------------------------------------------------

/**
 * @param x       center x of the presenter
 * @param y       top of the head
 * @param state   { t, speaking, emotion, mouth (0 closed..2 wide), blink, look (-1..1), bob, gesture }
 */
export function drawAnchor(ctx, x, y, L, state) {
  const { t = 0, speaking = false, mouth = 0, blink = false, look = 0, bob = 0, gesture = 0 } = state;
  const emotion = BROWS[state.emotion] ? state.emotion : 'neutral';
  const pal = palette(L);
  const style = L.style === 'bob' ? 'bob' : 'short';
  const F = FACE[style];
  const turn = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  const phase = t + (L.phase ?? (L.name || '').length * 0.37);
  // breathing: the shoulders rise a pixel for a moment every ~4 s
  const breath = phase % 4.2 < 1.4 ? 1 : 0;
  // thinking: the head drifts sideways now and then, as if pondering
  const tilt = emotion === 'thinking' && Math.floor(phase / 1.7) % 3 !== 0 ? 1 : 0;
  // listening to the co-anchor: a small nod every few seconds
  const nod = !speaking && turn !== 0 && phase % 2.6 < 0.3 ? 1 : 0;
  const hx = x + turn + tilt;
  const hy = y - 1 + (Math.round(bob) || nod);
  const fx = hx + turn; // the features turn a little further than the skull
  const by = y + 18 - breath;

  if (HAIR_BACK[style]) draw(ctx, HAIR_BACK[style], hx, hy, pal);

  // neck, shaded under the chin
  const nw = style === 'bob' ? 6 : 8;
  ctx.fillStyle = pal.s;
  ctx.fillRect(hx - nw / 2, hy + 14, nw, by + 3 - hy - 14);

  // body
  draw(ctx, L.tie ? SUIT : BLAZER, x, by, pal);
  if (L.pocket) draw(ctx, POCKET_SQUARE, x, by, pal);
  if (L.necklace) draw(ctx, NECKLACE, x, by, pal);
  draw(ctx, LAPEL_MIC, x, by, pal);

  // head; on wide-open vowels the jaw drops a pixel
  draw(ctx, HEAD[style], hx, hy, pal);
  if (mouth >= 2) {
    ctx.fillStyle = pal.S;
    ctx.fillRect(hx + F.jaw[0], hy + F.jaw[1], F.jaw[2], 1);
  }

  // eyes
  const E = EYES[style];
  let eye = E.open;
  if (blink) eye = E.blink;
  else if (emotion === 'happy' && !speaking) eye = E.happy;
  else if (emotion === 'surprised') eye = E.surprised;
  else if (emotion === 'sad') eye = E.sad;
  else if (emotion === 'serious') eye = E.serious;
  else if (emotion === 'thinking' && !speaking) eye = E.up;
  draw(ctx, eye.l, fx, hy, pal);
  if (eye.r) draw(ctx, eye.r, fx, hy, pal);
  else draw(ctx, eye.l, fx, hy, pal, true);

  if (L.glasses) draw(ctx, GLASSES, fx, hy, pal);

  // brows
  const [bl, br] = BROWS[emotion];
  ctx.fillStyle = L.brow || L.hairShade || pal.H;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(fx + F.browOx + i, hy + 4 + bl[i], 1, 1);
    ctx.fillRect(fx - 1 - F.browOx - i, hy + 4 + (br || bl)[i], 1, 1);
  }

  // nose
  ctx.fillStyle = pal.s;
  ctx.fillRect(fx, hy + F.noseY, 1, F.noseH);
  if (F.noseH > 1) ctx.fillRect(fx - 1, hy + F.noseY + 1, 1, 1);

  // rosy cheeks
  if (emotion === 'happy' || (style === 'bob' && emotion === 'surprised')) {
    ctx.fillStyle = P.pink;
    ctx.fillRect(fx + F.eyeOx - 1, hy + F.cheekY, 2, 1);
    ctx.fillRect(fx - F.eyeOx - 1, hy + F.cheekY, 2, 1);
  }

  // mouth, with the mustache over it
  draw(ctx, mouthSprite(emotion, mouth, L.mustache), fx, hy + F.mouthY, pal);
  if (L.mustache) {
    const mood = emotion === 'happy' ? 'happy' : emotion === 'sad' || emotion === 'serious' ? 'sad' : 'neutral';
    draw(ctx, MUSTACHE[mood], fx, hy, pal);
  }

  draw(ctx, HAIR[style], hx, hy, pal);

  // drop earrings that swing a little
  if (L.earrings) {
    const swing = Math.round(Math.sin(phase * (speaking ? 6 : 1.6)) * (speaking ? 1 : 0.7));
    ctx.fillStyle = L.earrings;
    ctx.fillRect(hx - 7, hy + 13, 1, 2);
    ctx.fillRect(hx + 6, hy + 13, 1, 2);
    ctx.fillRect(hx - 7 + swing, hy + 15, 1, 1);
    ctx.fillRect(hx + 6 + swing, hy + 15, 1, 1);
  }

  return { gesture, by };
}

/** Hands resting on (or raised above) the desk; drawn after the desk. */
export function drawHands(ctx, x, deskY, L, gesture = 0) {
  const pal = palette(L);
  // gesture with the hand nearest the centre of the set (toward the video wall)
  const side = x <= 192 ? 1 : -1;
  draw(ctx, PROPS[L.prop] || PROPS.papers, x, deskY, pal);
  draw(ctx, gesture > 0 && side < 0 ? HAND_UP : HAND_REST, x, deskY, pal);
  draw(ctx, gesture > 0 && side > 0 ? HAND_UP : HAND_REST, x, deskY, pal, true);
}

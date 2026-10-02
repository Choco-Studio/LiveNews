// Procedurally drawn pixel-art presenters. Every part is authored as a tiny
// ASCII sprite, compiled once into rectangles, then painted with integer
// fillRect calls on the low-resolution canvas so it stays crisp at any zoom.
// Colours come only from the channel palette.
//
// A look picks a hair `style` (which also sets the face shape), a `body`
// (outfit) and toggles details (glasses, mustache, beard, tie, pocket square,
// earrings, necklace, headphones, patch, pin, prop…). Any colour a look leaves
// out falls back to a sensible default, so new presenters need few fields.
// `robot: true` switches to UNIT-8's mechanical renderer.
import { P } from './palette.js';

const PACO = {
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
  body: 'suit',
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
  phase: 0, // offsets idle animations (breathing, earrings…) between presenters
};

const LOLA = {
  name: 'LOLA BYTE',
  style: 'bob',
  skin: P.tan,
  skinShade: P.tanShade,
  hair: P.rust,
  hairHi: P.orange,
  hairShade: P.darkRed,
  hairShine: P.yellow,
  brow: P.brown,
  body: 'blazer',
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
};

const MAX = {
  name: 'MAX CIRCUIT',
  style: 'spiky',
  skin: P.tan,
  skinShade: P.tanShade,
  hair: P.brown,
  hairHi: P.tanShade,
  hairShade: P.maroon,
  streak: P.cyan,
  brow: P.maroon,
  body: 'hoodie',
  suit: P.slate,
  suitShade: P.ink,
  suitHi: P.steel,
  suitDeep: P.black,
  shirt: P.silver,
  cuff: P.ink,
  headphones: P.red,
  headphonesShade: P.darkRed,
  pin: P.green,
  pinShade: P.darkGreen,
  gesture: 'thumb',
  prop: 'console',
  phase: 1.1,
};

const ADA = {
  name: 'ADA VOLT',
  style: 'curly',
  skin: P.tanShade,
  skinShade: P.brown,
  hair: P.maroon,
  hairHi: P.purple,
  hairShade: P.black,
  accent: P.magenta, // headband
  brow: P.black,
  eyes: 'plain',
  glasses: P.silver,
  glassesHi: P.white,
  glassesStyle: 'round',
  skeptic: true,
  body: 'turtleneck',
  suit: P.magenta,
  suitShade: P.purple,
  suitHi: P.pink,
  suitDeep: P.maroon,
  shirt: P.black,
  shirtShade: P.slate,
  cuff: P.black,
  watch: P.cyan, // smartwatch glint
  lipstick: P.maroon,
  blush: P.darkRed,
  prop: 'tablet',
  phase: 3.0,
};

const NOVA = {
  name: 'DR NOVA REYES',
  style: 'ponytail',
  skin: P.skin,
  skinShade: P.skinShade,
  hair: P.maroon,
  hairHi: P.purple,
  hairShade: P.black,
  accent: P.orange, // scrunchie
  brow: P.maroon,
  body: 'flight',
  suit: P.navy,
  suitShade: P.ink,
  suitHi: P.steel,
  suitDeep: P.black,
  shirt: P.white,
  shirtShade: P.silver,
  cuff: P.ink,
  patch: P.orange,
  pin: P.yellow,
  lipstick: P.rust,
  prop: 'planet',
  phase: 0.6,
};

const UNIT8 = {
  name: 'UNIT-8',
  robot: true,
  suit: P.silver,
  suitShade: P.fog,
  suitHi: P.white,
  suitDeep: P.ink,
  led: P.cyan,
  gesture: 'claw',
  hands: 'robot',
  prop: 'none',
  phase: 1.7,
};

const PENNY = {
  name: 'PENNY STERLING',
  style: 'bun',
  skin: P.cream,
  skinShade: P.skin,
  hair: P.yellow,
  hairHi: P.cream,
  hairShade: P.orange,
  brow: P.tanShade,
  body: 'blouse',
  suit: P.darkGreen,
  suitShade: P.ink,
  suitHi: P.green,
  suitDeep: P.black,
  shirt: P.white,
  shirtShade: P.silver,
  earrings: P.white,
  earringStyle: 'stud',
  lipstick: P.darkRed,
  lipstickHi: P.red,
  prop: 'pen',
  phase: 2.9,
};

const SAM = {
  name: 'SAM NIGHT',
  style: 'crop',
  skin: P.brown,
  skinShade: P.maroon,
  hair: P.black,
  hairHi: P.slate,
  hairShade: P.black,
  brow: P.black,
  beard: true,
  body: 'open',
  suit: P.slate,
  suitShade: P.ink,
  suitHi: P.steel,
  suitDeep: P.black,
  shirt: P.silver,
  shirtShade: P.fog,
  lipstick: P.maroon,
  blush: P.darkRed,
  prop: 'mug',
  phase: 3.6,
};

// 'A' and 'B' are kept as aliases of the original pair.
export const LOOKS = {
  A: PACO,
  B: LOLA,
  paco: PACO,
  lola: LOLA,
  max: MAX,
  ada: ADA,
  nova: NOVA,
  unit8: UNIT8,
  penny: PENNY,
  sam: SAM,
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

// Fixed colours usable in any sprite.
const FIXED = {
  0: P.black,
  1: P.white,
  2: P.red,
  3: P.darkRed,
  4: P.orange,
  5: P.yellow,
  6: P.green,
  7: P.cyan,
  8: P.silver,
  9: P.fog,
  '#': P.darkGreen,
  '+': P.steel,
  '=': P.ink,
  '*': P.slate,
};

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
    ...FIXED,
    S: skin,
    s: skinShade,
    H: hair,
    h: L.hairHi || hair,
    j: L.hairShade || P.black,
    J: L.hairShine || L.hairHi || hair,
    e: L.streak || L.hairHi || hair,
    P: L.accent || hair,
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
    E: L.watch || L.cuff || shirt,
    R: L.tie,
    r: L.tieShade || L.tie,
    X: L.pocket,
    x: L.pocketShade || L.pocket,
    Y: L.necklace,
    y: L.necklaceShade || L.necklace,
    A: L.headphones,
    a: L.headphonesShade || L.headphones,
    B: L.pin,
    b: L.pinShade || L.pin,
    C: L.patch,
    c: L.led || P.cyan,
    m: P.black,
    n: P.steel,
    Q: P.white,
    q: P.fog,
    v: P.steel,
    I: P.ink,
  };
  PALS.set(L, p);
  return p;
}

// ---------------------------------------------------------------------------
// Heads. Grid: column c of a 20-wide sprite sits at x - 10 + c; the face is
// centred on x - 0.5. Rows are relative to the top of the skull.

const HEAD = {
  // square-jawed, ears showing
  wide: sym([
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
  // softer and narrower, with a pointed chin
  narrow: sym([
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
const NARROW_EARS = sym(['..~.......', '..s.......', '..s.......', '..~.......'], 6);

// Face layout per head shape (x from the face centre, y from the skull top).
// jaw: [x, y, w] of the extra chin row on wide-open vowels.
const FACE = {
  wide: { eyeOx: -5, browOx: -6, noseY: 9, noseH: 2, mouthY: 13, cheekY: 9, jaw: [-3, 17, 6], neck: 8, earring: [-9, 10] },
  narrow: { eyeOx: -4, browOx: -5, noseY: 9, noseH: 1, mouthY: 11, cheekY: 8, jaw: [-2, 16, 4], neck: 6, earring: [-8, 10] },
};

// --- hair (front layer unless noted) ---------------------------------------

// side parting, combed over, greying at the temples
const HAIR_SHORT = spr(
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
  ],
  -10,
  -4,
);

// messy spikes with a dyed streak
const HAIR_SPIKY = spr(
  [
    '....H....H...e......',
    '...HH...HH..eeH..H..',
    '..HhHH.HhHH.eeHHHH..',
    '..HhHHHhHHHeeHHHHH..',
    '.HHhHHHHHHHeeHHHHHH.',
    '.HHHHHHHHHHeHHHHHHj.',
    '..jHHjHHHjHeHHjHHHj.',
    '..j..HH..HH...HH.j..',
    '..j..............j..',
  ],
  -10,
  -4,
);

// close crop with a crisp line-up, running into the beard
const HAIR_CROP = spr(
  [
    '',
    '',
    '......HHHHHHHH......',
    '....HhhHHHHHHHHH....',
    '...HhHHHHHHHHHHHH...',
    '..HHHHHHHHHHHHHHHH..',
    '..HHH..........HHH..',
    '..H..............H..',
    '..H..............H..',
    '..H..............H..',
    '..H..............H..',
    '..H..............H..',
    '..H..............H..',
  ],
  -10,
  -4,
);
const BEARD = spr(
  [
    '..Z..............Z..',
    '..ZZ............ZZ..',
    '..ZZ............ZZ..',
    '..ZZZ.ZZZZZZZZ.ZZZ..',
    '..ZZZZ........ZZZZ..',
    '...ZZZ........ZZZ...',
    '....ZZZZZZZZZZZZ....',
    '......ZZZZZZZZ......',
  ],
  -10,
  9,
);

// rounded bob with a side-swept fringe, curling in at the jaw
const HAIR_BOB = spr(
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
);
const BACK_BOB = sym(
  [
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
  ],
  0,
);

// big natural curls with a headband (24-wide grid)
const HAIR_CURLY = spr(
  [
    '.....HHH...HHHH...HHH...',
    '...HHHhHHjHHhhHHjHHhHH..',
    '..HHhHHjHHhHHHjHHhHHHHH.',
    '.HHhHHHHhHHHjHHHhHHjHHHH',
    '.HjHHPPPPPPPPPPPPPPHHhHH',
    'HHhHj..............jHhHH',
    'HhHHj..............jHHhH',
    '.HHjj..............jjHH.',
    'HHhHj..............jHhHH',
    'HhHHj..............jHHhH',
    '.HHjj..............jjHH.',
    'HHhHj..............jHhHH',
    'HhHHj..............jHHhH',
    '.HHjHj............jHjHH.',
    '..HhHHj..........jHHhH..',
    '...jHHH..........HHHj...',
    '.....jj..........jj.....',
  ],
  -12,
  -4,
);
const BACK_CURLY = sym(
  [
    '...jjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '..jjjjjjjjjj',
    '...jjjjjjjjj',
    '....jjjjjjjj',
  ],
  -1,
);

// sleek pulled-back hair, face-framing strands, high ponytail
const HAIR_PONY = spr(
  [
    '',
    '.......HHHHHH.......',
    '.....HhhhHHHHHH.....',
    '....HhhHHHHHHHHH....',
    '...HhHHHHHHHHHHHj...',
    '..HhHHHHHjHHHHHHHj..',
    '..hH............Hj..',
    '..hH............Hj..',
    '..hH............Hj..',
    '..hH............Hj..',
    '..hH............Hj..',
    '..H..............j..',
    '.H................j.',
  ],
  -10,
  -4,
);
const TAIL_TOP = spr(
  [
    '...............HHh....',
    '.............PPHhHH...',
    '.............PP.jHHh..',
    '................jHHh..',
    '.................jHHh.',
    '.................jHHh.',
    '................jHHh..',
    '................jHHh..',
    '.................jHH..',
    '.................jHHh.',
  ],
  -10,
  -4,
);
const TAIL_LOW = spr(
  ['..................jHh.', '..................jHh.', '.................jHh..', '.................jH...', '..................jH..', '..................jh..', '...................h..'],
  -10,
  6,
);

// neat bun, swept back behind the ears
const HAIR_BUN = spr(
  [
    '........hHHH........',
    '.......hHHHHj.......',
    '.......jHHHjj.......',
    '.....hhHHHHHHH......',
    '....hHHHHHHHHHHj....',
    '...hHHHHHHjHHHHHj...',
    '..hHHHHHH.....HHHj..',
    '..hHHj..........Hj..',
    '..Hj.............j..',
    '..j..............j..',
  ],
  -10,
  -4,
);

const STYLES = {
  short: { face: 'wide', hair: HAIR_SHORT },
  spiky: { face: 'wide', hair: HAIR_SPIKY },
  crop: { face: 'wide', hair: HAIR_CROP },
  bob: { face: 'narrow', hair: HAIR_BOB, back: BACK_BOB, earring: [-7, 13] },
  curly: { face: 'narrow', hair: HAIR_CURLY, back: BACK_CURLY, earring: [-8, 12] },
  ponytail: { face: 'narrow', hair: HAIR_PONY, back: TAIL_TOP, sway: TAIL_LOW },
  bun: { face: 'narrow', hair: HAIR_BUN, ears: true },
};

// --- glasses ---------------------------------------------------------------

const GLASSES = {
  // rectangular steel frames with arms to the ears (wide face)
  rect: spr(['..fFFF....fFFF..', 'FF....FFFF....FF', '.F....F..F....F.', '..FFFF....FFFF..'], -8, 5),
  // thin round frames (narrow face)
  round: spr(['..fFF..fFF..', 'FF...FF...FF', '.F...FF...F.', '..FFF..FFF..'], -6, 5),
};

const MUSTACHE = {
  neutral: spr(['...zzzzzz...', '..ZZZZZZZZ..', '.ZZZ....ZZZ.'], -6, 11),
  happy: spr(['Z..zzzzzz..Z', '.ZZZZZZZZZZ.'], -6, 11),
  sad: spr(['...zzzzzz...', '..ZZZZZZZZ..', '.ZZZ....ZZZ.', '.Z........Z.'], -6, 11),
};

// --- eyes, brows, mouths -----------------------------------------------------

// Eyes are authored for the left eye and mirrored for the right one, unless
// a separate right-eye drawing is given (a glance to one side).
function eyeSet(defs) {
  const out = {};
  for (const face of Object.keys(FACE)) {
    out[face] = {};
    for (const [name, [rows, ox, oy, right]] of Object.entries(defs)) {
      const lx = FACE[face].eyeOx + ox;
      out[face][name] = { l: spr(rows, lx, oy), r: right ? spr(right, -lx - right[0].length, oy) : null };
    }
  }
  return out;
}

const EYES = {
  plain: eyeSet({
    open: [['KW', 'KK'], 0, 6],
    blink: [['KK'], 0, 7],
    happy: [['.KK.', 'K..K'], -1, 6],
    surprised: [['WKW', 'WKW'], -1, 6],
    sad: [['.K', 'KK'], 0, 6],
    serious: [['ss', 'KK'], 0, 6],
    up: [['WK', 'WW'], 0, 6, ['WK', 'WW']],
  }),
  lashes: eyeSet({
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

const clampMouth = (open) => Math.max(0, Math.min(2, Math.round(open) || 0));

function mouthSprite(emotion, mouth, mustache) {
  if (mouth === 0) return (mustache && MOUTHS_MUSTACHE[emotion + '0']) || MOUTHS[emotion + '0'] || MOUTHS.neutral0;
  const base = emotion === 'happy' || emotion === 'sad' || emotion === 'surprised' ? emotion : 'neutral';
  return MOUTHS[base + mouth];
}

// ---------------------------------------------------------------------------
// Bodies, relative to the shoulder line. 40-wide grid centred on x - 0.5.

const FILL = (row, n) => Array(n).fill(row);

// suit, white shirt and tie
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
  ...FILL('...UUUUuUUUUUUUUUUUU', 15),
]);

// casual blazer, open-collar shirt, no tie
const OPEN = sym([
  '............VUUoO...',
  '..........VVUUUoOOSS',
  '........VVUUUUUuOoSS',
  '......VUUUUUUUUuuOOS',
  '.....VUUUUUUUUUUuOOO',
  '....VUUUUUUUUUUUuOOo',
  '....UUUUUUUUUUUUuOOO',
  '....UUUuUUUUUUUUUuOO',
  '....UUUuUUUUUUUUUuOo',
  '....UUUuUUUUUUUUUUuO',
  '....UUUuUUUUUUUUUUuO',
  '....UUUuUUUUUUUUUUUu',
  '...UUUUuUUUUUUUUUUUD',
  ...FILL('...UUUUuUUUUUUUUUUUU', 17),
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
  ...FILL('....UUUUuUUUUUUUUUUU', 16),
]);

// blazer over a crisp blouse buttoned to the collar
const BLOUSE = sym([
  '.............VUoOO..',
  '...........VVUUoOOoO',
  '.........VVUUUuoOOoO',
  '.......VVUUUUUuuoOOO',
  '......VUUUUUUUUuOOOO',
  '.....VUUUUUUUUUuuOOo',
  '.....UUUUUUUUUUUuOOO',
  '.....UUUuUUUUUUUuOOO',
  '.....UUUuUUUUUUUUuOo',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUUuO',
  '.....UUUuUUUUUUUUUuO',
  '....UUUUuUUUUUUUUUUu',
  '....UUUUuUUUUUUUUUUD',
  ...FILL('....UUUUuUUUUUUUUUUU', 16),
]);

// blazer over a turtleneck that rises to the chin
const TURTLENECK = sym(
  [
    '................oOOO',
    '................OOOO',
    '................oooo',
    '.............VUOOOOO',
    '...........VVUUuOOOO',
    '.........VVUUUUuOOOO',
    '.......VVUUUUUUuuOOO',
    '......VUUUUUUUUUuOOO',
    '.....VUUUUUUUUUUuOOO',
    '.....UUUUUUUUUUUuOOO',
    '.....UUUuUUUUUUUuOOO',
    '.....UUUuUUUUUUUUuOO',
    '.....UUUuUUUUUUUUuOO',
    '.....UUUuUUUUUUUUUuO',
    '.....UUUuUUUUUUUUUuO',
    '....UUUUuUUUUUUUUUUu',
    '....UUUUuUUUUUUUUUUD',
    ...FILL('....UUUUuUUUUUUUUUUU', 16),
  ],
  -3,
);

// hoodie with the hood bunched behind the neck
const HOODIE = sym(
  [
    '.............VVV....',
    '............VUUu....',
    '..........VVUUUu....',
    '........VVUUUUUUuu..',
    '......VUUUUUUUUUUuuu',
    '.....VUUUUUUUUUUUUUU',
    '....VUUUUUUUUUUUUUUU',
    '....UUUUUUUUUUUUUUUU',
    '....UUUUUUUUUUUUUUUU',
    '....UUUuUUUUUUUUUUUU',
    '....UUUuUUUUUUUUUUUU',
    '....UUUuUUUUUUUUUUUU',
    '....UUUuUUUUUUUUUUUU',
    '....UUUuUUUUUUUUUUUU',
    '...UUUUuUUUUUUUUUUUU',
    ...FILL('...UUUUuUUUUUUUUUUUU', 17),
  ],
  -2,
);
const DRAWSTRINGS = sym(['.................8..', '.................8..', '.................8..', '.................8..', '.................9..'], 2);
const HEADPHONES = sym(['.............aa.....', '............AAa.....', '...........AA0a.....', '...........AA0a.....', '............aa......'], -3);

// open bomber jacket over a crew-neck tee
const FLIGHT = sym([
  '............VUDDO...',
  '..........VVUUUDDOOO',
  '........VVUUUUUUDOOO',
  '......VUUUUUUUUUD8OO',
  '.....VUUUUUUUUUUDOOO',
  '....VUUUUUUUUUUUDOOO',
  '....UUUUUUUUUUUUDOOO',
  '....UUUuUUUUUUUUDOOO',
  '....UUUuUUUUUUUUDOOO',
  '....UUUuUUUUUUUUDOOO',
  '....UUUuUUUUUUUUDOOO',
  '....UUUuUUUUUUUUDOOO',
  '...UUUUuUUUUUUUUDOOO',
  ...FILL('...UUUUuUUUUUUUUDOOO', 17),
]);

const LAPEL_MIC = spr(['mn', 'mm'], -8, 5);
const POCKET_SQUARE = spr(['XX', 'XxX', 'uuuuu'], 7, 6);
const NECKLACE = spr(['Y....Y', '.Y..Y.', '..YY..', '..yy..'], -3, 1);
const HOODIE_PIN = spr(['BB', 'Bb'], 7, 6);
const MISSION_PATCH = spr(['.CC.', 'C55C', 'C55C', '.CC.'], 5, 4);
const STAR_PIN = spr(['.B.', 'BBB', '.B.'], -7, 8);

const BODIES = {
  suit: { sprite: SUIT, extras: [['pocket', POCKET_SQUARE]] },
  open: { sprite: OPEN, extras: [] },
  blazer: { sprite: BLAZER, extras: [['necklace', NECKLACE]] },
  blouse: { sprite: BLOUSE, extras: [] },
  turtleneck: { sprite: TURTLENECK, extras: [] },
  hoodie: { sprite: HOODIE, extras: [[null, DRAWSTRINGS], ['headphones', HEADPHONES], ['pin', HOODIE_PIN]] },
  flight: { sprite: FLIGHT, extras: [['patch', MISSION_PATCH], ['pin', STAR_PIN]] },
};

// ---------------------------------------------------------------------------
// Hands (the screen-left one; the other is mirrored), relative to (x, deskY).

const HAND_REST = spr(
  ['.DDD............', 'DUUUDDD.........', 'UUUUUUUDDwSSs...', 'uUUUUUUUUESSSSs.', '.uuuuuuuuwsSsSs.'],
  -17,
  -3,
);
const GESTURES = {
  palm: spr(['.SsSs.', '.SSSS.', '.SSSSS', '.SSSS.', '..sS..', '.wEw..', 'DUUUD.', 'UUUUU.', 'uUUUUu', '.uuuu.'], -16, -8),
  thumb: spr(['...S..', '...S..', '.SSSs.', '.SSSSs', '.sSSs.', '.wEw..', 'DUUUD.', 'UUUUU.', 'uUUUUu', '.uuuu.'], -16, -8),
  claw: spr(['+.+.+.', '+++++.', '.999..', '=UUU=.', '=UUu=.', '=UUu=.', '=UUu=.', '=uuu=.', '.===..'], -16, -7),
};
const ROBOT_REST = spr(
  ['.===............', '=UUU===.........', 'UUUUUUU==9+.+...', 'uUUUUUUUu9+++...', '.======u=9+.+...'],
  -17,
  -3,
);

const PROPS = {
  none: [],
  papers: spr(['.QQQQQQQQQQ.', 'QvQvvQvvvQQQ', 'qqqqqqqqqqqq'], -6, -1),
  tablet: spr(['IIIIIIIIIIII', 'I77+777+777I', '000000000000'], -6, -1),
  pen: spr(['.........55.', '.QQQQQQQ53Q.', 'QvQvv55vvQQQ', 'qqqqqqqqqqqq'], -6, -2),
  console: spr(['.88888.', '.86668.', '.86668.', '.88888.', '.82838.', '.99999.'], -4, -5),
  mug: spr(['.1118.', '.12281', '.12281', '.1118.', '.9999.'], -3, -4),
  planet: spr(['...44....', '..4444...', '555555555', '..3443...', '...99....'], -5, -4),
};

// ---------------------------------------------------------------------------
// UNIT-8, the robot co-host

const ROBOT_HEAD = spr(
  [
    '..==================..',
    '.=VVVVVVVVVVVVVVVVVV=.',
    '.=VU9UUUUUUUUUUUU9Uu=.',
    '.=VU++++++++++++++Uu=.',
    '.=VU+KKKKKKKKKKKK+Uu=.',
    '+=VU+KKKKKKKKKKKK+Uu=+',
    '9=VU+KKKKKKKKKKKK+Uu=9',
    '9=VU+KKKKKKKKKKKK+Uu=9',
    '+=VU+KKKKKKKKKKKK+Uu=+',
    '.=VU+KKKKKKKKKKKK+Uu=.',
    '.=VU+KKKKKKKKKKKK+Uu=.',
    '.=VU+KKKKKKKKKKKK+Uu=.',
    '.=VU+KKKKKKKKKKKK+Uu=.',
    '.=VU++++++++++++++Uu=.',
    '.=VU9UUUUUUUUUUUU9Uu=.',
    '.=uuuuuuuuuuuuuuuuuu=.',
    '..==================..',
  ],
  -11,
  -1,
);
const ROBOT_NECK = spr(['=9999=', '======', '=9999='], -3, 16);
const ROBOT_BODY = sym([
  '...=====............',
  '..=VVVVU=...........',
  '.=VUUUUUu=.=========',
  '.=VUUUUUu==VVVVVVVVV',
  '.=uUUUUuu=VUUUUUUUUU',
  '..=uuuuu=.VUU+++++++',
  '...=UUu=..VUU+======',
  '...=UUu=..VUU+======',
  '...=UUu=..VUU+======',
  '...=UUu=..VUU+======',
  '...=UUu=..VUU+======',
  '...=UUu=..VUU+++++++',
  '...=UUu=..VUUUUUUUUU',
  '..=UUUUu=.VUUUUUUUUU',
  '..=U9UUu=.VUUUUUUUuU',
  ...FILL('..=UUUUu=.VUUUUUUUUU', 17),
], -2);

// LED eyes (left eye; mirrored unless a right one is given), rows from hy + 4
const LED_EYES = {
  neutral: [['ccc', 'ccc']],
  happy: [['.c.', 'c.c']],
  serious: [['...', 'ccc']],
  surprised: [['ccc', 'c.c', 'ccc']],
  sad: [['..c', 'cc.']],
  thinking: [['.cc'], ['.cc']],
};
for (const [k, [l, r]] of Object.entries(LED_EYES)) {
  LED_EYES[k] = { l: spr(l, -5, 4), r: r ? spr(r, 2, 4) : null };
}
// LED mouths (closed), rows from hy + 8
const LED_MOUTH = {
  neutral: spr(['........', '.cccccc.'], -4, 8),
  happy: spr(['c......c', '.cccccc.'], -4, 8),
  sad: spr(['.cccccc.', 'c......c'], -4, 9),
  serious: spr(['........', 'cccccccc'], -4, 8),
  surprised: spr(['...cc...', '..c..c..', '...cc...'], -4, 8),
};

function drawRobot(ctx, x, y, L, st) {
  const pal = palette(L);
  const { t = 0, speaking = false, blink = false, look = 0, bob = 0 } = st;
  const emotion = BROWS[st.emotion] ? st.emotion : 'neutral';
  const mouth = clampMouth(st.mouth);
  const phase = t + (L.phase || 0);
  const turn = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  const tilt = emotion === 'thinking' && Math.floor(phase / 1.7) % 3 !== 0 ? 1 : 0;
  const nod = !speaking && turn !== 0 && phase % 2.6 < 0.3 ? 1 : 0;
  const hx = x + turn + tilt;
  const hy = y - 1 + (Math.round(bob) || nod);
  const fx = hx + turn;
  const by = y + 18;

  // antenna with a blinking tip
  ctx.fillStyle = P.steel;
  ctx.fillRect(hx + 4, hy - 2, 1, 1);
  ctx.fillStyle = phase % 1.2 < 0.6 ? P.red : P.darkRed;
  ctx.fillRect(hx + 4, hy - 4, 2, 2);

  draw(ctx, ROBOT_NECK, hx, hy, pal);
  draw(ctx, ROBOT_BODY, x, by, pal);
  // chest panel lights
  const lights = [P.red, P.yellow, P.green, P.cyan];
  for (let i = 0; i < 4; i++) {
    const on = Math.floor(phase * 3 + i * 1.7) % 3 !== 0;
    ctx.fillStyle = on ? lights[i] : P.slate;
    ctx.fillRect(x - 5 + i * 3, by + 5 + (i % 2) * 2, 2, 1);
  }

  draw(ctx, ROBOT_HEAD, hx, hy, pal);
  // a little screen sheen
  ctx.fillStyle = P.slate;
  ctx.fillRect(hx + 3, hy + 3, 2, 1);
  ctx.fillRect(hx + 4, hy + 4, 1, 1);

  if (!blink) {
    const e = speaking && emotion === 'thinking' ? LED_EYES.neutral : LED_EYES[emotion];
    draw(ctx, e.l, fx, hy, pal);
    if (e.r) draw(ctx, e.r, fx, hy, pal);
    else draw(ctx, e.l, fx, hy, pal, true);
  }

  if (mouth > 0) {
    // equalizer bars, taller for louder speech
    ctx.fillStyle = pal.c;
    const cols = [-4, -2, 1, 3];
    for (let i = 0; i < 4; i++) {
      const wobble = Math.sin(t * 17 + i * 2.1) > 0 ? 1 : 0;
      const h = mouth + wobble;
      ctx.fillRect(fx + cols[i], hy + 11 - h, 1, h);
    }
    ctx.fillRect(fx - 1, hy + 10 - mouth, 2, mouth + 1);
  } else if (emotion === 'thinking') {
    // "processing…" dots
    ctx.fillStyle = pal.c;
    const n = 1 + (Math.floor(phase * 2.5) % 3);
    for (let i = 0; i < n; i++) ctx.fillRect(fx - 4 + i * 3, hy + 9, 2, 1);
  } else draw(ctx, LED_MOUTH[emotion], fx, hy, pal);

  return { gesture: st.gesture || 0, by };
}

// ---------------------------------------------------------------------------

/**
 * @param x       center x of the presenter
 * @param y       top of the head
 * @param state   { t, speaking, emotion, mouth (0 closed..2 wide), blink, look (-1..1), bob, gesture }
 */
export function drawAnchor(ctx, x, y, L, state) {
  if (L.robot) return drawRobot(ctx, x, y, L, state);
  const { t = 0, speaking = false, blink = false, look = 0, bob = 0, gesture = 0 } = state;
  const emotion = BROWS[state.emotion] ? state.emotion : 'neutral';
  const mouth = clampMouth(state.mouth);
  const pal = palette(L);
  const S = STYLES[L.style] || STYLES.short;
  const face = S.face;
  const F = FACE[face];
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
  const sway = Math.round(Math.sin(phase * (speaking ? 6 : 1.6)) * (speaking ? 1 : 0.7));

  if (S.back) draw(ctx, S.back, hx, hy, pal);
  if (S.sway) draw(ctx, S.sway, hx + sway, hy, pal);

  // neck, shaded under the chin
  ctx.fillStyle = pal.s;
  ctx.fillRect(hx - F.neck / 2, hy + 14, F.neck, by + 3 - hy - 14);

  // body and its details
  const body = BODIES[L.body] || (L.tie ? BODIES.suit : BODIES.blazer);
  draw(ctx, body.sprite, x, by, pal);
  for (const [flag, sprite] of body.extras) if (!flag || L[flag]) draw(ctx, sprite, x, by, pal);
  draw(ctx, LAPEL_MIC, x, by, pal);

  // head; on wide-open vowels the jaw drops a pixel
  draw(ctx, HEAD[face], hx, hy, pal);
  if (S.ears) draw(ctx, NARROW_EARS, hx, hy, pal);
  if (mouth === 2) {
    ctx.fillStyle = L.beard ? pal.Z : pal.S;
    ctx.fillRect(hx + F.jaw[0], hy + F.jaw[1], F.jaw[2], 1);
  }

  // eyes
  const E = EYES[L.eyes || (face === 'narrow' ? 'lashes' : 'plain')][face];
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

  if (L.glasses) draw(ctx, GLASSES[L.glassesStyle] || GLASSES.rect, fx, hy, pal);

  // brows (a sceptic keeps one brow cocked)
  const [bl, br] = BROWS[emotion];
  const right = br || (L.skeptic && (emotion === 'neutral' || emotion === 'serious') ? bl.map((v) => v - 1) : bl);
  ctx.fillStyle = L.brow || L.hairShade || pal.H;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(fx + F.browOx + i, hy + 4 + bl[i], 1, 1);
    ctx.fillRect(fx - 1 - F.browOx - i, hy + 4 + right[i], 1, 1);
  }

  // nose
  ctx.fillStyle = pal.s;
  ctx.fillRect(fx, hy + F.noseY, 1, F.noseH);
  if (F.noseH > 1) ctx.fillRect(fx - 1, hy + F.noseY + 1, 1, 1);

  // rosy cheeks
  if (emotion === 'happy' || (face === 'narrow' && emotion === 'surprised')) {
    ctx.fillStyle = L.blush || P.pink;
    ctx.fillRect(fx + F.eyeOx - 1, hy + F.cheekY, 2, 1);
    ctx.fillRect(fx - F.eyeOx - 1, hy + F.cheekY, 2, 1);
  }

  // beard, mouth, mustache
  if (L.beard) draw(ctx, BEARD, fx, hy, pal);
  draw(ctx, mouthSprite(emotion, mouth, L.mustache), fx, hy + F.mouthY, pal);
  if (L.mustache) {
    const mood = emotion === 'happy' ? 'happy' : emotion === 'sad' || emotion === 'serious' ? 'sad' : 'neutral';
    draw(ctx, MUSTACHE[mood], fx, hy, pal);
  }

  draw(ctx, S.hair, hx, hy, pal);

  // earrings: drops swing a little, studs just sparkle
  if (L.earrings) {
    const [ex, ey] = S.earring || F.earring;
    ctx.fillStyle = L.earrings;
    if (L.earringStyle === 'stud') {
      ctx.fillRect(hx + ex, hy + ey, 1, 1);
      ctx.fillRect(hx - 1 - ex, hy + ey, 1, 1);
    } else {
      ctx.fillRect(hx + ex, hy + ey, 1, 2);
      ctx.fillRect(hx - 1 - ex, hy + ey, 1, 2);
      ctx.fillRect(hx + ex + sway, hy + ey + 2, 1, 1);
      ctx.fillRect(hx - 1 - ex + sway, hy + ey + 2, 1, 1);
    }
  }

  return { gesture, by };
}

/** Hands resting on (or raised above) the desk; drawn after the desk. */
export function drawHands(ctx, x, deskY, L, gesture = 0) {
  const pal = palette(L);
  // gesture with the hand nearest the centre of the set (toward the video wall)
  const side = x <= 192 ? 1 : -1;
  const rest = L.hands === 'robot' ? ROBOT_REST : HAND_REST;
  const up = GESTURES[L.gesture] || GESTURES.palm;
  draw(ctx, PROPS[L.prop] || PROPS.papers, x, deskY, pal);
  draw(ctx, gesture > 0 && side < 0 ? up : rest, x, deskY, pal);
  draw(ctx, gesture > 0 && side > 0 ? up : rest, x, deskY, pal, true);
}

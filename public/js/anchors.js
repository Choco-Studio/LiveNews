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
  quirk: 'glasses',
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
  quirk: 'tap',
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
  quirk: 'bounce',
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
  quirk: 'skeptic',
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
  quirk: 'gaze',
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
  quirk: 'scan',
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
  quirk: 'pen',
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
  quirk: 'sip',
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
// Hands and arms, relative to (x, deskY). A resting forearm is a sprite
// (authored for the screen-left arm and mirrored for the right). Moving arms
// are two thick segments (shoulder → elbow → wrist) with a hand sprite at the
// wrist; hands are authored for the screen-right arm with the wrist pixel at
// (0, 0), pointing "outward" (+x), and mirrored for the left arm.

const HAND_REST = spr(
  ['.DDD............', 'DUUUDDD.........', 'UUUUUUUDDwSSs...', 'uUUUUUUUUESSSSs.', '.uuuuuuuuwsSsSs.'],
  -17,
  -3,
);
const ROBOT_REST = spr(
  ['.===............', '=UUU===.........', 'UUUUUUU==9++....', 'uUUUUUUUu9+++...', '.======u=9++....'],
  -17,
  -3,
);

const HANDS = {
  palm: spr(['.SsSs', '.SSSS', 'SSSSS', '.SSSs', '.wEw.'], -2, -4),
  fist: spr(['.SSS.', 'SSSSs', '.sSs.', '.wEw.'], -2, -3),
  thumb: spr(['.S...', '.S...', '.SSSs', '.SSSs', '.sSs.', '.wEw.'], -2, -5),
  point_up: spr(['....S', '...S.', '.SSS.', 'SSSSs', '.sSs.', '.wEw.'], -2, -5),
  point_side: spr(['wSSS...', 'ESSSSSS', 'wSSSs..'], 0, -1),
  point_cam: spr(['.sSs.', 'SSSSS', 'SsSsS', '.SSS.', '.wEw.'], -2, -4),
  count1: spr(['..S..', '..S..', '.SSS.', '.SSSs', '.sSs.', '.wEw.'], -2, -5),
  count2: spr(['.S.S.', '.S.S.', '.SSS.', '.SSSs', '.sSs.', '.wEw.'], -2, -5),
  count3: spr(['S.S.S', 'S.S.S', 'SSSSS', '.SSSs', '.sSs.', '.wEw.'], -2, -5),
  cup: spr(['S.S.S.', 'SSSSSS', '.sSSs.', '..wEw.'], -3, -3),
  chin: spr(['.S..', '.S..', 'SSSs', 'sSSs', '.wE.'], -2, -4),
  face: spr(['S.S.S.', 'SSSSS.', 'SSSSSS', '.SSSS.', '.sSSs.', '..wE..'], -3, -5),
  pinch: spr(['.S..', '.SS.', 'SSS.', 'sSs.', '.wE.'], -2, -4),
  steeple: spr(['S...', 'SS..', 'SSS.', '.SSs', '..wE'], -1, -4),
  chop: spr(['.S.', 'SS.', 'SSs', 'SSs', '.w.'], -1, -4),
  mug: spr(['.1118.', 'S12281', 'S12281', 'S1118.', '.ww...'], -1, -4),
};
// UNIT-8's grippers stand in for the human hand shapes
const CLAWS = {
  open: spr(['+.+.+', '+++++', '.999.'], -2, -2),
  grip: spr(['.+++.', '+999+', '.999.'], -2, -2),
  point: spr(['....+', '...+.', '.++..', '+99..', '.99..'], -2, -4),
  side: spr(['9+.....', '9++++++', '9+.....'], 0, -1),
  thumb: spr(['.+...', '.+...', '+++..', '+999.', '.99..'], -2, -4),
};
const CLAW_FOR = {
  fist: 'grip',
  chin: 'grip',
  point_cam: 'grip',
  mug: 'grip',
  point_up: 'point',
  point_side: 'side',
  thumb: 'thumb',
  count1: 'thumb',
  count2: 'thumb',
  count3: 'thumb',
};

/** Thick integer line from w×w squares; runs along one row or column merge. */
function thick(ctx, x0, y0, x1, y1, w) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const h = (w - 1) >> 1;
  let ax = 0;
  let ay = 0;
  let bx = -1;
  let by = 0;
  const flush = () => bx >= ax && ctx.fillRect(ax - h, ay - h, bx - ax + w, by - ay + w);
  for (let i = 0; i <= n; i++) {
    const px = n ? Math.round(x0 + ((x1 - x0) * i) / n) : x0;
    const py = n ? Math.round(y0 + ((y1 - y0) * i) / n) : y0;
    if (bx >= ax && ((ay === by && py === ay) || (ax === bx && px === ax))) {
      ax = Math.min(ax, px);
      bx = Math.max(bx, px);
      ay = Math.min(ay, py);
      by = Math.max(by, py);
    } else {
      flush();
      ax = bx = px;
      ay = by = py;
    }
  }
  flush();
}

/** One moving arm on side s (+1 screen right, -1 screen left). */
function drawArm(ctx, x, deskY, s, arm, pal, robot) {
  const X = (o) => (s > 0 ? x + o : x - 1 - o);
  const sx = X(robot ? 14 : 12);
  const sy = deskY - 17;
  const ex = X(arm.e[0]);
  const ey = deskY + arm.e[1];
  const wx = X(arm.w[0]);
  const wy = deskY + arm.w[1];
  const upper = robot || arm.e[1] < -2; // the robot's arms hang free of its torso
  ctx.fillStyle = pal.D;
  if (upper) thick(ctx, sx, sy, ex, ey, 5);
  thick(ctx, ex, ey, wx, wy, 5);
  ctx.fillStyle = pal.U;
  if (upper) thick(ctx, sx, sy, ex, ey, 3);
  thick(ctx, ex, ey, wx, wy, 3);
  const hand = robot ? CLAWS[CLAW_FOR[arm.h] || 'open'] : HANDS[arm.h] || HANDS.palm;
  draw(ctx, hand, s > 0 ? wx : wx + 1, wy, pal, s < 0);
}

const PROPS = {
  none: [],
  papers: spr(['.QQQQQQQQQQ.', 'QvQvvQvvvQQQ', 'qqqqqqqqqqqq'], -6, -1),
  tablet: spr(['IIIIIIIIIIII', 'I77+777+777I', '000000000000'], -6, -1),
  pen: spr(['.QQQQQQQQQQ.', 'QvQvvQvvvQQQ', 'qqqqqqqqqqqq'], -6, -1),
  console: spr(['.88888.', '.86668.', '.86668.', '.88888.', '.82838.', '.99999.'], -4, -5),
  mug: spr(['.1118.', '.12281', '.12281', '.1118.', '.9999.'], -3, -4),
  planet: spr(['...44....', '..4444...', '555555555', '..3443...', '...99....'], -5, -4),
};
const PEN = spr(['.....55', '...55..', '.35....'], -1, -3);
// prop held upright and tapped on the desk during the "papers" action
const STACK = spr(['.QQQQQQQQ.', 'QQvvQvvvQQ', 'QQQQQQQQQQ', 'QQvvvQvvQQ', 'QQQQQQQQQQ', 'qqqqqqqqqq'], -5, -6);
const STACK_TABLET = spr(['IIIIIIIIII', 'I7777+777I', 'I77+77777I', 'I7777777+I', 'IIIIIIIIII', '0000000000'], -5, -6);

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
const ROBOT_BODY = sym(
  [
    '...=====............',
    '..=VVVVU=...........',
    '.=VUUUUUu=.=========',
    '.=VUUUUUu==VVVVVVVVV',
    '.=uUUUUuu=VUUUUUUUUU',
    '..=uuuuu=.VUU+++++++',
    '..........VUU+======',
    '..........VUU+======',
    '..........VUU+======',
    '..........VUU+======',
    '..........VUU+======',
    '..........VUU+++++++',
    ...FILL('..........VUUUUUUUUU', 2),
    '..........VUUUUUUUuU',
    ...FILL('..........VUUUUUUUUU', 17),
  ],
  -2,
);
// the screen-left arm hanging from its ball joint (mirrored for the right)
const ROBOT_ARM = spr(
  [...FILL('...=UUu=', 7), '..=UUUUu=', '..=U9UUu=', ...FILL('..=UUUUu=', 17)],
  -20,
  4,
);

// LED eyes (left eye; mirrored unless a right one is given), rows from hy + 4
const LED_EYES = {
  neutral: [['ccc', 'ccc']],
  happy: [['.c.', 'c.c']],
  serious: [['...', 'ccc']],
  surprised: [['ccc', 'c.c', 'ccc']],
  sad: [['..c', 'cc.']],
  thinking: [['.cc'], ['.cc']],
  x: [['c.c', '.c.', 'c.c']],
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
  zigzag: spr(['.c...c..', 'c.c.c.c.', '...c...c'], -4, 8),
  ha: spr(['c.c.ccc.', 'ccc.c.c.', 'c.c.ccc.', 'c.c.c.c.'], -4, 8),
  1: spr(['.c.', 'cc.', '.c.', 'ccc'], -2, 8),
  2: spr(['cc.', '..c', 'c..', 'ccc'], -2, 8),
  3: spr(['ccc', '.cc', '..c', 'ccc'], -2, 8),
};

// ---------------------------------------------------------------------------
// Motion: scripted actions (cues.js), passive life and personality quirks.

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
/** Ease in over [0, a], hold, ease out over [b, 1]. */
const envelope = (p, a = 0.2, b = 0.8) => (p < a ? ease(p / a) : p > b ? ease((1 - p) / (1 - b)) : 1);
/** Progress through the hold part of an action, 0..1. */
const holdOf = (p, a = 0.2, b = 0.8) => clamp01((p - a) / (b - a));
/** Progress (0..1) inside a recurring window of `dur` seconds every `period`, or -1. */
const every = (phase, period, dur, offset = 0) => {
  const q = (((phase + offset) % period) + period) % period;
  return q < dur ? q / dur : -1;
};

// Arm targets for the active (screen-right) arm: e elbow, w wrist, h hand.
const REST_ARM = { e: [15, 0], w: [7, 0] };
const ARM = {
  raise_hand: { e: [15, 0], w: [11, -16], h: 'palm' },
  wave: { e: [15, -2], w: [12, -19], h: 'palm' },
  point_screen: { e: [17, -8], w: [20, -16], h: 'point_up' },
  point_partner: { e: [16, -6], w: [19, -9], h: 'point_side' },
  point_camera: { e: [14, -1], w: [6, -10], h: 'point_cam' },
  thumbs_up: { e: [15, 0], w: [10, -13], h: 'thumb' },
  count: { e: [15, 0], w: [10, -16], h: 'count1' },
  fist_pump: { e: [15, -1], w: [11, -18], h: 'fist' },
  facepalm: { e: [12, -4], w: [2, -27], h: 'face' },
  chin: { e: [11, -3], w: [1, -20], h: 'chin' },
  glasses: { e: [12, -5], w: [7, -28], h: 'pinch' },
  hair: { e: [14, -6], w: [8, -28], h: 'palm' },
  sip: { e: [12, -3], w: [3, -21], h: 'mug' },
  shrug: { e: [16, -1], w: [18, -7], h: 'cup' },
  steeple: { e: [14, 0], w: [1, -9], h: 'steeple' },
  wow: { e: [17, -6], w: [15, -19], h: 'palm' },
  papers: { e: [15, 0], w: [6, -4], h: 'fist' },
  // small talking gestures
  g_raise: { e: [15, 0], w: [11, -12], h: 'palm' },
  g_open: { e: [15, 0], w: [12, -4], h: 'cup' },
  g_point: { e: [14, 0], w: [8, -8], h: 'point_cam' },
  g_chop: { e: [15, 0], w: [10, -7], h: 'chop' },
  g_thumb: { e: [15, 0], w: [10, -11], h: 'thumb' },
};
const BOTH_ARMS = new Set(['shrug', 'steeple', 'wow', 'papers', 'g_open']);
const HEAD_ACTIONS = new Set(['nod', 'shake_head', 'laugh', 'lean_in', 'look_partner']);
const TALK_GESTURES = {
  palm: ['g_raise', 'g_open', 'g_point', 'g_chop'],
  thumb: ['g_thumb', 'g_raise', 'g_open', 'g_thumb'],
  claw: ['g_raise', 'g_open', 'g_point', 'g_raise'],
};
// UNIT-8's LED reaction to each action
const LED_ACTION = {
  wave: { eyes: 'happy' },
  raise_hand: { eyes: 'happy' },
  thumbs_up: { eyes: 'happy', mouth: 'happy' },
  fist_pump: { eyes: 'happy', mouth: 'happy' },
  shrug: { eyes: 'serious', mouth: 'zigzag' },
  steeple: { eyes: 'thinking', mouth: 'dots' },
  chin: { eyes: 'thinking', mouth: 'dots' },
  wow: { eyes: 'surprised', mouth: 'surprised' },
  facepalm: { eyes: 'x', mouth: 'sad' },
  lean_in: { eyes: 'serious' },
  shake_head: { eyes: 'serious' },
  papers: { eyes: 'serious' },
};

const mixArm = (target, k) => ({
  e: [Math.round(REST_ARM.e[0] + (target.e[0] - REST_ARM.e[0]) * k), Math.round(REST_ARM.e[1] + (target.e[1] - REST_ARM.e[1]) * k)],
  w: [Math.round(REST_ARM.w[0] + (target.w[0] - REST_ARM.w[0]) * k), Math.round(REST_ARM.w[1] + (target.w[1] - REST_ARM.w[1]) * k)],
  h: target.h,
});

function newPose() {
  return {
    hdx: 0, // head shift
    hdy: 0,
    turn: 0, // feature turn (-1 left, 1 right), 0 = keep
    bdx: 0, // body shift
    bdy: 0,
    eyes: null, // 'happy' | 'closed' | 'up' | 'down' | 'surprised'
    brow: 0, // extra brow raise (negative = up)
    brow2: 0, // extra raise for the right brow only
    browMood: null,
    mouthMood: null,
    mouthOpen: null,
    blush: false,
    arms: {}, // side (-1 / 1) → arm
    prop: null, // 'stack' | 'hidden'
    propDy: 0,
    penDy: 0,
    tap: {}, // side → resting-hand lift
    led: null, // UNIT-8 overrides { eyes, mouth }
    ledDx: 0,
    active: false, // an action (or quirk) is driving the body
  };
}

/** Apply a scripted action at progress p (0..1) to the pose. */
function applyAction(pose, name, p, o) {
  let k = envelope(p);
  if (o.robot) k = Math.round(k * 3) / 3; // stepped servo motion
  const hold = holdOf(p);
  const on = k > 0.5;
  const t = o.t;
  pose.active = k > 0;
  let armName = name;
  if (name === 'glasses' && !o.glasses) armName = 'hair';
  const target = ARM[armName];
  if (target) {
    const a = mixArm(target, k);
    if (name === 'wave') a.w[0] += Math.round(Math.sin(hold * Math.PI * 5) * 2 * k);
    if (name === 'fist_pump' && hold > 0 && hold < 1) a.w[1] += (Math.floor(hold * 4) % 2) * 5;
    if (name === 'count') a.h = hold < 0.34 ? 'count1' : hold < 0.67 ? 'count2' : 'count3';
    if (name === 'papers') {
      const tap = (hold > 0.2 && hold < 0.4) || (hold > 0.6 && hold < 0.8) ? 0 : -2;
      a.w[1] += on ? tap : 0;
      pose.prop = k > 0.2 ? 'stack' : null;
      pose.propDy = on ? tap : 0;
    }
    if (name === 'sip' && k > 0.2) pose.prop = 'hidden';
    if (k > 0.2) {
      pose.arms[o.side] = a;
      if (BOTH_ARMS.has(name)) pose.arms[-o.side] = a;
    }
  }
  switch (name) {
    case 'wave':
    case 'raise_hand':
    case 'point_camera':
      if (on) pose.brow = -1;
      if (on && name === 'wave' && !o.speaking) pose.eyes = 'happy';
      break;
    case 'point_screen':
      if (on) pose.turn = pose.hdx = o.side;
      break;
    case 'point_partner':
      if (on) pose.turn = o.partner;
      break;
    case 'thumbs_up':
    case 'fist_pump':
      if (on) {
        if (!o.speaking) pose.eyes = 'happy';
        pose.mouthMood = 'happy';
        pose.blush = true;
      }
      break;
    case 'facepalm':
      if (on) {
        pose.eyes = 'closed';
        pose.hdy = 1;
        pose.mouthMood = 'sad';
      }
      break;
    case 'chin':
      if (on) {
        pose.eyes = 'up';
        pose.browMood = 'thinking';
        if (!o.speaking) pose.mouthMood = 'thinking';
      }
      break;
    case 'sip':
      if (on) pose.eyes = 'closed';
      break;
    case 'shrug':
      if (on) {
        pose.bdy = -1;
        pose.brow = -1;
        pose.browMood = 'sad';
        if (!o.speaking) pose.mouthMood = 'serious';
      }
      break;
    case 'steeple':
      if (on) pose.browMood = 'serious';
      break;
    case 'wow':
      if (on) {
        pose.eyes = 'surprised';
        pose.browMood = 'surprised';
        pose.mouthMood = 'surprised';
        pose.blush = true;
        if (!o.speaking) pose.mouthOpen = 1;
      }
      break;
    case 'papers':
      if (on) pose.eyes = 'down';
      break;
    case 'nod':
      pose.hdy = (p > 0.12 && p < 0.32) || (p > 0.52 && p < 0.72) ? 1 : 0;
      break;
    case 'shake_head':
      if (p > 0.1 && p < 0.9) pose.hdx = pose.turn = Math.floor((p - 0.1) / 0.2) % 2 ? 1 : -1;
      break;
    case 'laugh':
      if (k > 0.2) {
        pose.eyes = 'happy';
        pose.mouthMood = 'happy';
        pose.mouthOpen = 1 + (Math.floor(t * 9) % 2);
        pose.bdy = -(Math.floor(t * 7) % 2);
        pose.blush = true;
      }
      break;
    case 'lean_in':
      pose.bdy = Math.round(k);
      pose.hdy = Math.round(k * 2);
      if (on) pose.browMood = 'serious';
      break;
    case 'look_partner':
      if (k > 0.3) pose.turn = pose.hdx = o.partner;
      break;
    default:
  }
  if (o.robot && k > 0.2) {
    const led = { ...(LED_ACTION[name] || {}) };
    if (name === 'count') led.mouth = hold < 0.34 ? 1 : hold < 0.67 ? 2 : 3;
    if (name === 'laugh') led.mouth = Math.floor(t * 6) % 2 ? 'ha' : 'none';
    if (name === 'laugh') led.eyes = 'happy';
    if (name === 'glasses') led.eyes = Math.floor(t * 10) % 2 ? 'off' : 'neutral';
    if (name === 'point_screen' || name === 'point_partner' || name === 'look_partner') pose.ledDx = name === 'point_screen' ? o.side : o.partner;
    if (name === 'nod' && pose.hdy) led.eyes = 'happy';
    pose.led = led;
  }
}

// Personality touches while listening (no action playing).
function quirk(pose, L, phase, o) {
  let q;
  switch (L.quirk) {
    case 'glasses': // Paco pushes his glasses up now and then
      if ((q = every(phase, 19, 1.2, 5)) >= 0) applyAction(pose, 'glasses', q, o);
      break;
    case 'sip': // Sam takes a sip of coffee, rarely
      if ((q = every(phase, 23, 2.6, 9)) >= 0) applyAction(pose, 'sip', q, o);
      break;
    case 'bounce': // Max can't sit still
      if ((q = every(phase, 6, 1, 2)) >= 0) pose.bdy = -(Math.floor(q * 8) % 2);
      break;
    case 'skeptic': // Ada cocks her head
      if ((q = every(phase, 7, 2, 1)) >= 0) {
        pose.hdx = 1;
        pose.brow2 = -1;
      }
      break;
    case 'gaze': // Nova looks up, thinking about the stars
      if ((q = every(phase, 8, 1.8, 4)) >= 0) pose.eyes = 'up';
      break;
    case 'pen': // Penny taps her pen
      if ((q = every(phase, 5, 0.9, 1)) >= 0) pose.penDy = pose.tap[o.side] = -(Math.floor(q * 10) % 2);
      break;
    case 'tap': // Lola taps at her tablet
      if ((q = every(phase, 7, 0.8, 3)) >= 0) {
        pose.tap[-o.side] = -(Math.floor(q * 8) % 2);
        pose.eyes = 'down';
      }
      break;
    case 'scan': // UNIT-8 sweeps its LEDs
      if ((q = every(phase, 5, 1.2, 2)) >= 0) pose.ledDx = [-1, 0, 1, 0][Math.floor(q * 4) % 4];
      break;
    default:
  }
}

/** Work out head/body/face/arm offsets for this frame. */
function computePose(L, st, x, m) {
  const pose = newPose();
  const t = st.t || 0;
  const phase = t + (L.phase ?? (L.name || '').length * 0.37);
  const speaking = !!st.speaking;
  const o = {
    t,
    robot: !!L.robot,
    speaking,
    glasses: !!L.glasses,
    side: x <= 192 ? 1 : -1, // the arm nearest the centre of the set
    partner: x > 192 ? -1 : 1, // where the co-presenter sits
  };
  const name = st.action && st.action.name;
  if (name && (ARM[name] || HEAD_ACTIONS.has(name))) {
    applyAction(pose, name, clamp01(Number(st.action.p) || 0), o);
    return pose;
  }
  if (speaking) {
    // small speech-synchronised head moves and weight shifts
    const w = Math.sin(t * 1.3 + phase * 2);
    pose.hdx = w > 0.8 ? 1 : w < -0.85 ? -1 : 0;
    const ws = Math.sin(t * 0.45 + phase);
    pose.bdx = ws > 0.75 ? 1 : ws < -0.75 ? -1 : 0;
    if (t < m.emphUntil) pose.brow = -1; // eyebrows up on emphasis
    if (st.gesture) {
      const list = TALK_GESTURES[L.gesture] || TALK_GESTURES.palm;
      const v = list[(((Math.floor(m.gestAt * 3.3) % 4) + 4) % 4)];
      const k = o.robot ? 1 : ease((t - m.gestAt) / 0.15);
      const a = mixArm(ARM[v], k);
      if (v === 'g_chop') a.w[1] += Math.floor(t * 6) % 2;
      if (k > 0.2) {
        pose.arms[o.side] = a;
        if (BOTH_ARMS.has(v)) pose.arms[-o.side] = a;
      }
    } else if (Math.sin(t * 2.7 + phase) > 0.93) pose.tap[o.side] = -1; // a beat on the desk
    if (o.robot) pose.hdx = 0;
  } else {
    if (every(phase, 9, 0.9, 3) >= 0) pose.eyes = 'down'; // glance at the notes
    quirk(pose, L, phase, o);
  }
  return pose;
}

// Per-presenter memory (emphasis, gesture starts, double blinks) and the pose
// handed from drawAnchor to drawHands, keyed by on-screen position.
const MEM = new Map();
function remember(key, L, st) {
  const t = st.t || 0;
  let m = MEM.get(key);
  const fresh = !m || m.L !== L || t < m.t - 0.5;
  if (fresh) {
    if (MEM.size > 256) MEM.clear();
    m = { L, t, zeroAt: -9, emphUntil: -9, gestAt: t - 1, gest: st.gesture ? 1 : 0, blink: false, blink2At: -9, pose: null };
    MEM.set(key, m);
  }
  const mouth = clampMouth(st.mouth);
  if (mouth === 0) m.zeroAt = t;
  else if (mouth === 2 && t - m.zeroAt < 0.25 && t > m.emphUntil + 0.6) m.emphUntil = t + 0.45;
  const g = st.gesture ? 1 : 0;
  if (g && !m.gest) m.gestAt = t;
  m.gest = g;
  if (m.blink && !st.blink && Math.floor(t * 37) % 3 === 0) m.blink2At = t + 0.12; // sometimes blink twice
  m.blink = !!st.blink;
  m.t = t;
  return m;
}

// ---------------------------------------------------------------------------

function drawRobot(ctx, x, y, L, st, pose) {
  const pal = palette(L);
  const { t = 0, speaking = false, look = 0, bob = 0 } = st;
  const emotion = BROWS[st.emotion] ? st.emotion : 'neutral';
  const mouth = clampMouth(st.mouth);
  const phase = t + (L.phase || 0);
  const lookTurn = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  const turn = pose.turn || lookTurn;
  const idle = !pose.active;
  const tilt = idle && emotion === 'thinking' && Math.floor(phase / 1.7) % 3 !== 0 ? 1 : 0;
  const nod = idle && !speaking && lookTurn !== 0 && phase % 2.6 < 0.3 ? 1 : 0;
  const hx = x + turn + tilt + pose.hdx;
  const hy = y - 1 + Math.max(0, (Math.round(bob) || nod) + pose.hdy);
  const fx = hx + turn;
  const by = y + 18 + pose.bdy;
  const bx = x + pose.bdx;

  // antenna with a blinking tip
  ctx.fillStyle = P.steel;
  ctx.fillRect(hx + 4, hy - 2, 1, 1);
  ctx.fillStyle = phase % 1.2 < 0.6 ? P.red : P.darkRed;
  ctx.fillRect(hx + 4, hy - 4, 2, 2);

  draw(ctx, ROBOT_NECK, hx, hy, pal);
  draw(ctx, ROBOT_BODY, bx, by, pal);
  // an arm that is moving is drawn by drawHands instead
  if (!pose.arms[-1]) draw(ctx, ROBOT_ARM, bx, by, pal);
  if (!pose.arms[1]) draw(ctx, ROBOT_ARM, bx, by, pal, true);
  // chest panel lights
  const lights = [P.red, P.yellow, P.green, P.cyan];
  for (let i = 0; i < 4; i++) {
    const on = Math.floor(phase * 3 + i * 1.7) % 3 !== 0;
    ctx.fillStyle = on ? lights[i] : P.slate;
    ctx.fillRect(bx - 5 + i * 3, by + 5 + (i % 2) * 2, 2, 1);
  }

  draw(ctx, ROBOT_HEAD, hx, hy, pal);
  // a little screen sheen
  ctx.fillStyle = P.slate;
  ctx.fillRect(hx + 3, hy + 3, 2, 1);
  ctx.fillRect(hx + 4, hy + 4, 1, 1);

  const led = pose.led || {};
  const ex = fx + pose.ledDx;
  const eyeName = led.eyes || (pose.eyes === 'happy' ? 'happy' : pose.eyes === 'up' ? 'thinking' : null) || (speaking && emotion === 'thinking' ? 'neutral' : emotion);
  if (!st.blink && eyeName !== 'off') {
    const e = LED_EYES[eyeName] || LED_EYES.neutral;
    draw(ctx, e.l, ex, hy, pal);
    if (e.r) draw(ctx, e.r, ex, hy, pal);
    else draw(ctx, e.l, ex, hy, pal, true);
  }

  const lm = led.mouth;
  if (lm === 'none') {
    // blank between "HA"s
  } else if (lm !== undefined && lm !== 'dots' && LED_MOUTH[lm]) {
    draw(ctx, LED_MOUTH[lm], fx, hy, pal);
  } else if (mouth > 0) {
    // equalizer bars, taller for louder speech
    ctx.fillStyle = pal.c;
    const cols = [-4, -2, 1, 3];
    for (let i = 0; i < 4; i++) {
      const h = mouth + (Math.sin(t * 17 + i * 2.1) > 0 ? 1 : 0);
      ctx.fillRect(fx + cols[i], hy + 11 - h, 1, h);
    }
    ctx.fillRect(fx - 1, hy + 10 - mouth, 2, mouth + 1);
  } else if (lm === 'dots' || emotion === 'thinking') {
    // "processing…" dots
    ctx.fillStyle = pal.c;
    const n = 1 + (Math.floor(phase * 2.5) % 3);
    for (let i = 0; i < n; i++) ctx.fillRect(fx - 4 + i * 3, hy + 9, 2, 1);
  } else draw(ctx, LED_MOUTH[emotion] || LED_MOUTH.neutral, fx, hy, pal);

  return { gesture: st.gesture || 0, by };
}

/**
 * @param x       center x of the presenter
 * @param y       top of the head
 * @param state   { t, speaking, emotion, mouth (0 closed..2 wide), blink, look (-1..1), bob, gesture,
 *                  action: { name, t0, dur, p } | null }
 */
export function drawAnchor(ctx, x, y, L, state) {
  const m = remember(`${x}:${y + 38}`, L, state);
  const pose = computePose(L, state, x, m);
  m.pose = pose;
  if (L.robot) return drawRobot(ctx, x, y, L, state, pose);

  const { t = 0, speaking = false, look = 0, bob = 0, gesture = 0 } = state;
  const emotion = BROWS[state.emotion] ? state.emotion : 'neutral';
  const pal = palette(L);
  const S = STYLES[L.style] || STYLES.short;
  const face = S.face;
  const F = FACE[face];
  const idle = !pose.active;
  const lookTurn = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  const turn = pose.turn || lookTurn;
  const phase = t + (L.phase ?? (L.name || '').length * 0.37);
  // breathing: the shoulders rise a pixel for a moment every ~4 s
  const breath = phase % 4.2 < 1.4 ? 1 : 0;
  // thinking: the head drifts sideways now and then, as if pondering
  const tilt = idle && emotion === 'thinking' && Math.floor(phase / 1.7) % 3 !== 0 ? 1 : 0;
  // listening to the co-anchor: a small nod every few seconds
  const nod = idle && !speaking && lookTurn !== 0 && phase % 2.6 < 0.3 ? 1 : 0;
  const hx = x + turn + tilt + pose.hdx;
  const hy = y - 1 + Math.max(0, (Math.round(bob) || nod) + pose.hdy);
  const fx = hx + turn; // the features turn a little further than the skull
  const by = y + 18 - breath + pose.bdy;
  const bx = x + pose.bdx;
  const sway = Math.round(Math.sin(phase * (speaking ? 6 : 1.6)) * (speaking ? 1 : 0.7));
  const blink = (state.blink || (t >= m.blink2At && t < m.blink2At + 0.1)) && pose.eyes !== 'closed';

  if (S.back) draw(ctx, S.back, hx, hy, pal);
  if (S.sway) draw(ctx, S.sway, hx + sway, hy, pal);

  // neck, shaded under the chin
  ctx.fillStyle = pal.s;
  ctx.fillRect(hx - F.neck / 2, hy + 14, F.neck, by + 3 - hy - 14);

  // body and its details
  const body = BODIES[L.body] || (L.tie ? BODIES.suit : BODIES.blazer);
  draw(ctx, body.sprite, bx, by, pal);
  for (const [flag, sprite] of body.extras) if (!flag || L[flag]) draw(ctx, sprite, bx, by, pal);
  draw(ctx, LAPEL_MIC, bx, by, pal);

  // head; on wide-open vowels the jaw drops a pixel
  const mouth = pose.mouthOpen ?? clampMouth(state.mouth);
  draw(ctx, HEAD[face], hx, hy, pal);
  if (S.ears) draw(ctx, NARROW_EARS, hx, hy, pal);
  if (mouth === 2) {
    ctx.fillStyle = L.beard ? pal.Z : pal.S;
    ctx.fillRect(hx + F.jaw[0], hy + F.jaw[1], F.jaw[2], 1);
  }

  // eyes
  const E = EYES[L.eyes || (face === 'narrow' ? 'lashes' : 'plain')][face];
  let eye = E.open;
  if (blink || pose.eyes === 'closed') eye = E.blink;
  else if (pose.eyes) eye = E[{ happy: 'happy', up: 'up', down: 'serious', surprised: 'surprised' }[pose.eyes]] || E.open;
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
  const mood = pose.browMood || emotion;
  const [bl, br] = BROWS[mood];
  const right = br || (L.skeptic && (mood === 'neutral' || mood === 'serious') ? bl.map((v) => v - 1) : bl);
  ctx.fillStyle = L.brow || L.hairShade || pal.H;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(fx + F.browOx + i, hy + 4 + Math.max(-2, bl[i] + pose.brow), 1, 1);
    ctx.fillRect(fx - 1 - F.browOx - i, hy + 4 + Math.max(-2, right[i] + pose.brow + pose.brow2), 1, 1);
  }

  // nose
  ctx.fillStyle = pal.s;
  ctx.fillRect(fx, hy + F.noseY, 1, F.noseH);
  if (F.noseH > 1) ctx.fillRect(fx - 1, hy + F.noseY + 1, 1, 1);

  // rosy cheeks
  const mouthMood = pose.mouthMood || emotion;
  if (emotion === 'happy' || pose.blush || (face === 'narrow' && emotion === 'surprised')) {
    ctx.fillStyle = L.blush || P.pink;
    ctx.fillRect(fx + F.eyeOx - 1, hy + F.cheekY, 2, 1);
    ctx.fillRect(fx - F.eyeOx - 1, hy + F.cheekY, 2, 1);
  }

  // beard, mouth, mustache
  if (L.beard) draw(ctx, BEARD, fx, hy, pal);
  draw(ctx, mouthSprite(BROWS[mouthMood] ? mouthMood : 'neutral', mouth, L.mustache), fx, hy + F.mouthY, pal);
  if (L.mustache) {
    const mm = mouthMood === 'happy' ? 'happy' : mouthMood === 'sad' || mouthMood === 'serious' ? 'sad' : 'neutral';
    draw(ctx, MUSTACHE[mm], fx, hy, pal);
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

/**
 * Hands and forearms on (or raised above) the desk; drawn after the desk.
 * Uses the pose worked out by drawAnchor this frame (scripted actions,
 * talking gestures, fidgets); `gesture` is the fallback when there is none.
 */
export function drawHands(ctx, x, deskY, L, gesture = 0) {
  const pal = palette(L);
  const m = MEM.get(`${x}:${deskY}`);
  let pose = m && m.L === L ? m.pose : null;
  if (!pose) {
    pose = newPose();
    if (gesture > 0) pose.arms[x <= 192 ? 1 : -1] = mixArm(ARM.g_raise, 1);
  }
  const robot = L.robot || L.hands === 'robot';
  const prop = PROPS[L.prop] ? L.prop : 'papers';
  if (pose.prop === 'stack') draw(ctx, prop === 'tablet' ? STACK_TABLET : STACK, x, deskY + pose.propDy, pal);
  else if (pose.prop !== 'hidden') draw(ctx, PROPS[prop], x, deskY, pal);
  if (prop === 'pen' && pose.prop !== 'stack') draw(ctx, PEN, x, deskY + pose.penDy, pal);
  const rest = robot ? ROBOT_REST : HAND_REST;
  for (const s of [-1, 1]) {
    const arm = pose.arms[s];
    if (arm) drawArm(ctx, x, deskY, s, arm, pal, robot);
    else draw(ctx, rest, x, deskY + (pose.tap[s] || 0), pal, s > 0);
  }
}

// Procedurally drawn pixel-art presenters. Every part is authored as a tiny
// ASCII sprite that is compiled once into horizontal runs, then painted with
// integer fillRect calls on the low-resolution canvas so it stays crisp at any
// zoom. Colours come only from the channel palette.
import { P } from './palette.js';

export const LOOKS = {
  A: {
    name: 'PACO PÍXEL',
    kind: 'A',
    skin: P.skin,
    skinShade: P.skinShade,
    skinDark: P.brown,
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
    glasses: P.steel,
    glassesHi: P.silver,
    mustache: P.maroon,
    mustacheHi: P.brown,
    lip: P.brown,
    lipLow: P.skinShade,
    pocket: P.white,
    pocketShade: P.silver,
    blush: P.pink,
    gestureSide: 1, // raises the hand nearest the video wall
    phase: 0,
  },
  B: {
    name: 'LOLA BYTE',
    kind: 'B',
    skin: P.tan,
    skinShade: P.tanShade,
    skinDark: P.brown,
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
    shirtShade: P.yellow,
    earrings: P.yellow,
    earringsShade: P.orange,
    necklace: P.yellow,
    lip: P.darkRed,
    lipLow: P.red,
    lashes: P.black,
    blush: P.pink,
    gestureSide: -1,
    phase: 1.9,
  },
};

// ---------------------------------------------------------------------------
// Sprite helpers

// Characters that render differently on each half of a mirrored sprite:
// [left, right]. Lets symmetric shapes carry light-from-the-left shading.
const SWAP = {
  '~': ['S', 's'], // skin lit / shaded
  '^': ['h', 'H'], // hair highlight / base
  '%': ['U', 'u'], // suit lit / shaded
  '$': ['R', 'r'], // tie lit / shaded
  '/': ['V', 'U'], // suit highlight / base
  '<': ['O', 'o'], // shirt lit / shaded
};

const mirrorRow = (half) => {
  let left = '';
  let right = '';
  for (const ch of half) left += SWAP[ch] ? SWAP[ch][0] : ch;
  for (let i = half.length - 1; i >= 0; i--) right += SWAP[half[i]] ? SWAP[half[i]][1] : half[i];
  return left + right;
};

/**
 * Compile rows of characters into rectangles grouped by colour key. Runs
 * that repeat on consecutive rows are merged so big areas cost one fillRect.
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
      if (ch !== '.' && ch !== ' ') {
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

/** Symmetric sprite from left halves (written outside → centre). */
const sym = (halves, oy = 0) => {
  const n = Math.max(...halves.map((h) => h.length));
  return compile(halves.map((h) => mirrorRow(h.padStart(n, '.'))), -n, oy);
};
/** Free-form sprite; ox/oy relative to the anchor centre line. */
const spr = (rows, ox, oy) => compile(rows, ox, oy);

const PALS = new WeakMap();
function palette(L) {
  let p = PALS.get(L);
  if (p) return p;
  p = {
    S: L.skin, s: L.skinShade, d: L.skinDark,
    H: L.hair, h: L.hairHi, j: L.hairShade, J: L.hairShine || L.hairHi,
    G: L.temples, g: L.templesHi,
    B: L.brow,
    K: P.black, W: P.white, k: L.lashes || P.black,
    F: L.glasses, f: L.glassesHi,
    M: P.maroon, T: P.white, N: P.pink, L: L.lip, l: L.lipLow,
    C: L.blush,
    Z: L.mustache, z: L.mustacheHi,
    U: L.suit, u: L.suitShade, V: L.suitHi, D: L.suitDeep,
    O: L.shirt, o: L.shirtShade,
    R: L.tie, r: L.tieShade,
    X: L.pocket, x: L.pocketShade,
    E: L.earrings, e: L.earringsShade,
    Y: L.necklace, y: L.earringsShade || P.orange,
    m: P.black, n: P.steel,
    Q: P.white, q: P.silver, v: P.fog, I: P.ink, c: P.cyan, b: P.blue,
  };
  PALS.set(L, p);
  return p;
}

/** Paint a compiled sprite at (x, y); flip mirrors around x - 0.5. */
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

// ---------------------------------------------------------------------------
// Paco (A)

const A_HEAD = sym([
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
]);

const A_HAIR = spr(
  [
    '.......HHHHHH.......',
    '.....HhhhhHHHHH.....',
    '....HhhHHHHHHHHHH...',
    '...HhHHHHHHHHHHHHH..',
    '..GhHHjHHHHHHHHHHHG.',
    '.gGHHHjHHHHHHHHHHGG.',
    '.gG....HHHHHHH...GG.',
    '.gG..............GG.',
    '.GG..............GG.',
    '..G..............G..',
    '..G..............G..',
    '..G..............G..',
  ],
  -10,
  -4,
);

const A_GLASSES = spr(['.fFFF....FFFF.', 'F....FFFF....F', 'F....F..F....F', '.FFFF....FFFF.'], -7, 0);
const A_MUSTACHE = spr(['...zzzzzz...', '..ZZZZZZZZ..', '.ZZZ....ZZZ.'], -6, 0);

// ---------------------------------------------------------------------------
// Lola (B)

const B_HEAD = sym([
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
]);

const B_HAIR_BACK = sym([
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
]);

const B_HAIR = spr(
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

// ---------------------------------------------------------------------------
// Faces

// Face layout per presenter (x offsets from the face centre, y from the skull top).
const FACE = {
  A: { eyeOx: -5, browOx: -6, noseY: 9, noseH: 2, mouthY: 13, cheekY: 9, chinY: 17 },
  B: { eyeOx: -4, browOx: -5, noseY: 9, noseH: 1, mouthY: 11, cheekY: 8, chinY: 16 },
};

// Eye sprites are authored for the left eye and mirrored for the right one,
// unless a separate right-eye drawing is given (for a sideways glance).
const eyeSet = (k, defs) => {
  const out = {};
  for (const [name, [rows, ox, oy, right]] of Object.entries(defs)) {
    const lx = FACE[k].eyeOx + ox;
    out[name] = {
      l: spr(rows, lx, oy),
      r: right ? spr(right, -lx - right[0].length, oy) : null,
    };
  }
  return out;
};

const EYES = {
  A: eyeSet('A', {
    open: [['KW', 'KK'], 0, 0],
    blink: [['..', 'KK'], 0, 0],
    happy: [['.KK.', 'K..K'], -1, 0],
    surprised: [['WKW', 'WKW'], -1, 0],
    sad: [['.K', 'KK'], 0, 0],
    serious: [['ss', 'KK'], 0, 0],
    up: [['WK', 'WW'], 0, 0, ['WK', 'WW']],
  }),
  B: eyeSet('B', {
    open: [['kkk.', '.KW.', '.KK.'], -1, -1],
    blink: [['....', '....', 'kkk.', '.ss.'], -1, -1],
    happy: [['....', '.KK.', 'K..K'], -1, -1],
    surprised: [['.kk.', '.KW.', '.KK.', '.KK.'], -1, -2],
    sad: [['.kk.', 'kKW.', '.KK.'], -1, -1],
    serious: [['....', 'kkk.', '.KK.'], -1, -1],
    up: [['kkk.', '.WK.', '.WW.'], -1, -1, ['.kkk', '.WK.', '.WW.']],
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

const MOUTHS = {
  // closed mouths (8 wide, centred)
  neutral0: spr(['..LLLL..', '...ll...'], -4, 0),
  happy0: spr(['.L....L.', '..LLLL..', '...ll...'], -4, -1),
  serious0: spr(['.LLLLLL.'], -4, 0),
  surprised0: spr(['...LL...', '..LMML..', '...LL...'], -4, -1),
  sad0: spr(['..LLLL..', '.L....L.'], -4, 0),
  thinking0: spr(['....LLL.', '.......L'], -4, 0),
  // half open
  neutral1: spr(['..MTTM..', '..MNNM..', '...ll...'], -4, 0),
  happy1: spr(['.MTTTTM.', '..MNNM..', '...ll...'], -4, 0),
  sad1: spr(['..MTTM..', '.MMNNMM.'], -4, 0),
  surprised1: spr(['...MM...', '..MTTM..', '..MNNM..', '...MM...'], -4, -1),
  // wide open
  neutral2: spr(['..MTTM..', '.MMMMMM.', '..MNNM..', '...ll...'], -4, 0),
  happy2: spr(['MTTTTTTM', '.MMMMMM.', '..MNNM..', '...ll...'], -4, 0),
  sad2: spr(['...MM...', '..MTTM..', '.MMNNMM.'], -4, 0),
  surprised2: spr(['..MMMM..', '.MTTTTM.', '.MMMMMM.', '..MNNM..', '...MM...'], -4, -1),
};

function mouthSprite(emotion, mouth) {
  if (mouth <= 0) return MOUTHS[emotion + '0'] || MOUTHS.neutral0;
  const base = emotion === 'happy' || emotion === 'sad' || emotion === 'surprised' ? emotion : 'neutral';
  return MOUTHS[base + Math.min(2, mouth)];
}

// ---------------------------------------------------------------------------
// Bodies (relative to the shoulder line)

const A_BODY = sym([
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
// lapel mic (screen left) and pocket square (wearer's left = screen right)
const A_BODY_DETAIL = spr(
  ['mn', 'mm', '..............XX', '..............XxX', '.............uuuuu'],
  -7,
  4,
);

const B_BODY = sym([
  '.............VUOO...',
  '...........VVUUOOSSS',
  '.........VVUUUuOOSSS',
  '.......VVUUUUUuuOOSS',
  '......VUUUUUUUUuOOOS',
  '.....VUUUUUUUUUuuOOO',
  '.....UUUUUUUUUUUuOOO',
  '.....UUUuUUUUUUUuOOO',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUuOO',
  '.....UUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
  '....UUUUuUUUUUUUUuOO',
]);
const B_NECKLACE = spr(['Y....Y', '.Y..Y.', '..YY..', '..yy..'], -3, 1);
const B_BODY_DETAIL = spr(['mn', 'mm'], -8, 5);

// ---------------------------------------------------------------------------
// Hands (screen-left hand; the other one is mirrored). Relative to (x, deskY).

const HAND_REST = {
  A: spr(['.UUU..........', 'UUUUUU........', 'UUUUUUUU......', 'uUUUUUUOSSS...', '.uuuuuuOSSSSs.', '.......osSSs..'], -17, -4),
  B: spr(['.UUU..........', 'UUUUUU........', 'UUUUUUUU......', 'uUUUUUUYSSS...', '.uuuuuuYSSSSs.', '.......ysSSs..'], -17, -4),
};
const HAND_UP = {
  A: spr(['..S.S.', '.SSSSS', '.SSSSSS', '.sSSSs', '..OOO.', '.UUUU.', 'UUUUU.', 'uUUUUU', '.uuuu.'], -15, -8),
  B: spr(['..S.S.', '.SSSSS', '.SSSSSS', '.sSSSs', '..YYY.', '.UUUU.', 'UUUUU.', 'uUUUUU', '.uuuu.'], -15, -8),
};
const PAPERS = spr(['.QQQQQQQQQQ.', 'QnQnnQnnnQQQ', 'vvvvvvvvvvvv'], -6, -1);
const TABLET = spr(['IIIIIIIIIIII', 'IccbcccbcccI', 'KKKKKKKKKKKK'], -6, -1);

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
  const k = L.kind === 'B' ? 'B' : 'A';
  const isA = k === 'A';
  const F = FACE[k];
  const turn = look > 0.3 ? 1 : look < -0.3 ? -1 : 0;
  const phase = t + (L.phase || 0);
  // breathing: shoulders rise one pixel for a moment every ~4 s
  const breath = phase % 4.2 < 1.4 ? 1 : 0;
  // thinking: an occasional sideways head tilt
  const tilt = emotion === 'thinking' && Math.floor(phase / 1.7) % 3 !== 0 ? 1 : 0;
  const hx = x + turn + tilt;
  const hy = y - 1 + Math.round(bob);
  const fx = hx + turn; // facial features turn a little further than the head
  const by = y + 18 - breath;

  // hair behind the head
  if (!isA) draw(ctx, B_HAIR_BACK, hx, hy, pal);

  // neck (shaded under the chin)
  const nw = isA ? 8 : 6;
  ctx.fillStyle = L.skinShade;
  ctx.fillRect(hx - nw / 2, hy + 14, nw, by + 3 - hy - 14);

  // body
  draw(ctx, isA ? A_BODY : B_BODY, x, by, pal);
  if (isA) draw(ctx, A_BODY_DETAIL, x, by, pal);
  else {
    draw(ctx, B_NECKLACE, x, by, pal);
    draw(ctx, B_BODY_DETAIL, x, by, pal);
  }

  // head
  draw(ctx, isA ? A_HEAD : B_HEAD, hx, hy, pal);
  if (mouth >= 2) {
    // the jaw drops a pixel on wide-open vowels
    ctx.fillStyle = L.skin;
    ctx.fillRect(hx - 3, hy + F.chinY - 1, 6, 1);
    ctx.fillStyle = L.skinShade;
    ctx.fillRect(hx - 2, hy + F.chinY, 4, 1);
  }

  // eyes
  const eyeY = hy + 6;
  const E = EYES[k];
  let eye = E.open;
  if (blink) eye = E.blink;
  else if (emotion === 'happy' && !speaking) eye = E.happy;
  else if (emotion === 'surprised') eye = E.surprised;
  else if (emotion === 'sad') eye = E.sad;
  else if (emotion === 'serious') eye = E.serious;
  else if (emotion === 'thinking' && !speaking) eye = E.up;
  draw(ctx, eye.l, fx, eyeY, pal);
  if (eye.r) draw(ctx, eye.r, fx, eyeY, pal);
  else draw(ctx, eye.l, fx, eyeY, pal, true);

  // glasses
  if (isA) draw(ctx, A_GLASSES, fx, hy + 5, pal);

  // brows
  const [bl, br0] = BROWS[emotion];
  const brR = br0 || bl;
  const browY = hy + 4;
  ctx.fillStyle = L.brow;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(fx + F.browOx + i, browY + bl[i], 1, 1);
    ctx.fillRect(fx - 1 - F.browOx - i, browY + brR[i], 1, 1);
  }

  // nose
  ctx.fillStyle = L.skinShade;
  ctx.fillRect(fx, hy + F.noseY, 1, F.noseH);
  if (isA) ctx.fillRect(fx - 1, hy + F.noseY + 1, 1, 1);

  // cheeks
  if (emotion === 'happy' || (!isA && emotion === 'surprised')) {
    ctx.fillStyle = L.blush;
    ctx.fillRect(fx + F.eyeOx - 1, hy + F.cheekY, 2, 1);
    ctx.fillRect(fx - F.eyeOx - 1, hy + F.cheekY, 2, 1);
  }

  // mouth (+ mustache over it)
  draw(ctx, mouthSprite(emotion, mouth), fx, hy + F.mouthY, pal);
  if (isA) draw(ctx, A_MUSTACHE, fx, hy + 11, pal);

  // hair in front
  draw(ctx, isA ? A_HAIR : B_HAIR, hx, hy, pal);

  // drop earrings that swing a little with the head
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
  const k = L.kind === 'B' ? 'B' : 'A';
  const side = L.gestureSide || 1;
  // prop on the desk
  draw(ctx, k === 'B' ? TABLET : PAPERS, x, deskY, pal);
  // screen-left hand as authored, screen-right hand mirrored
  draw(ctx, gesture > 0 && side < 0 ? HAND_UP[k] : HAND_REST[k], x, deskY, pal);
  draw(ctx, gesture > 0 && side > 0 ? HAND_UP[k] : HAND_REST[k], x, deskY, pal, true);
}

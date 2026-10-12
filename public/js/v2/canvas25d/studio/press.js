// The press room (IN THEIR WORDS, re-staged: server/guests/restage.js, backdrop 'press'). A public figure a story
// quotes says their own sourced words here, a recreation labelled as one (graphics/recreation.js). A generic room in
// the experts' studios' style (studio/experts.js STUDIO_KIT), drawn round the speaker on the left third (PRESS):
//   the wall      a backdrop of fabric panels in a quiet blue-grey over a deep navy wainscot, lit soft and even (one
//                 broad wash, never a spot), a step darker at the frame's edges
//   the emblem    a plain plaque on the right third: two rings round an abstract diamond, no words, no flag and no
//                 real organisation's mark (a recreation must never pretend to be a real room)
//   the lectern   in front of the speaker (drawPressFront, over the figure): its lit top edge and panelled front,
//                 in wood (or brushed steel before a brown suit, so the two never merge), and a cluster of five
//                 microphones on goosenecks below the chin, aimed at the mouth: dark foam windshields, three blank
//                 cubes in plain colours (no broadcaster's logo)
// The sober variant for a grave story ('grave'): darker and cooler (ink and black, the emblem dimmed, no colour on
// the cubes), the same room. Nothing moves in either: the speaker is the only thing alive in the frame.
//
//   drawPressRoom(px, variant, t)          the room behind the speaker into a 384x216 u32 frame ('press' | 'grave')
//   drawPressFront(px, variant, finish)    the lectern ('wood' | 'steel') and the microphones over the speaker
//   PRESS                                  the speaker's framing (neck base and scale, as studio/remote.js REMOTE)
//   PRESS_VARIANTS, LECTERN, MICS          the variants, the lectern's and the microphones' geometry (tests)
import { C } from '../pixbuf.js';
import { STUDIO_KIT } from './experts.js';

const { rect, bands, relight, falloff, disc, put, DOWN } = STUDIO_KIT;
const W = 384, H = 216;

/** The speaker at the lectern: a medium close-up on the left third, the lectern's top across the chest. */
export const PRESS = { x: 124, y: 118, s: 3.2, headX: 124 };
export const PRESS_VARIANTS = ['press', 'grave'];

// the room's furniture (screen px): the lectern's top sits above the captions' line (y 148), the wainscot under it
const ROOM = { wainscot: 158, seams: [54, 214, 268, 340], emblem: [282, 84, 29] };
export const LECTERN = { x0: 38, x1: 210, top: 143 };
// the microphones: the head's centre and the base of its stem on the lectern; each head points at the mouth (MOUTH)
const MOUTH = [124, 94];
export const MICS = [
  { hx: 100, hy: 126, bx: 113, wind: 'black', cube: 'navy' },
  { hx: 111, hy: 120, bx: 118, wind: 'ink', cube: null },
  { hx: 124, hy: 119, bx: 124, wind: 'black', cube: 'darkRed' },
  { hx: 137, hy: 121, bx: 130, wind: 'slate', cube: null },
  { hx: 148, hy: 127, bx: 135, wind: 'black', cube: 'steel' },
];

const TONES = {
  press: { wall: ['ink', 'slate', 'slate', 'slate'], wash: 1.6, seam: 'ink', seamHi: 'steel', wain: ['navy', 'ink', 'ink'], rule: 'fog', ring: 'fog', ring2: 'steel', field: 'navy', mark: 'silver', markShade: 'fog', inner: 'navy', stemHi: 'steel', cubes: true },
  grave: { wall: ['black', 'ink', 'ink', 'ink'], wash: 1.1, seam: 'black', seamHi: 'slate', wain: ['ink', 'black', 'black'], rule: 'slate', ring: 'steel', ring2: 'slate', field: 'ink', mark: 'steel', markShade: 'slate', inner: 'ink', stemHi: 'slate', cubes: false },
};
// the lectern's finishes [top lit, top, front edge, front, front low, groove] per variant
const FINISH = {
  press: { wood: ['cream', 'tan', 'tanShade', 'brown', 'maroon', 'maroon'], steel: ['silver', 'fog', 'steel', 'slate', 'ink', 'ink'] },
  // (a grave story's lectern is cool whatever it is made of: the room keeps no warm note but the speaker's face)
  grave: { wood: ['steel', 'slate', 'ink', 'ink', 'black', 'black'], steel: ['fog', 'steel', 'slate', 'ink', 'black', 'black'] },
};
const c = (name) => C[name];

/** The room behind the speaker (cached per variant): wall, seams, wainscot, emblem, the soft wash, the falloff. */
function room(px, variant) {
  const T = TONES[variant];
  // the fabric wall: flat bands, a little darker toward the ceiling
  bands(px, 0, 0, W, ROOM.wainscot, T.wall.map(c));
  // the soft, even key: one broad wash centred over the speaker's shoulder (never a ring round the head)
  relight(px, 168, 62, 260, 150, T.wash);
  // the panel seams: a dark 1 px groove, its far side catching the light from camera-left (a dithered lit edge)
  for (const x of ROOM.seams) {
    for (let y = 0; y < ROOM.wainscot; y++) {
      px[y * W + x] = c(T.seam);
      if ((y + x) % 2 === 0) px[y * W + x + 1] = c(T.seamHi);
    }
  }
  // the wainscot: a lit rule, then deep navy panels with a shadow line under the rule
  rect(px, 0, ROOM.wainscot, W, ROOM.wainscot + 1, c(T.rule));
  rect(px, 0, ROOM.wainscot + 1, W, ROOM.wainscot + 2, c(T.seamHi));
  bands(px, 0, ROOM.wainscot + 2, W, H, T.wain.map(c));
  rect(px, 0, ROOM.wainscot + 2, W, ROOM.wainscot + 3, c('black'));
  for (let x = 30; x < W; x += 92) {
    rect(px, x, ROOM.wainscot + 8, x + 1, H, c('black'));
    rect(px, x + 1, ROOM.wainscot + 8, x + 2, H, c(T.wain[0]));
  }
  emblem(px, T);
  falloff(px);
}

/** The plaque: two rings round an abstract diamond (no words, no flag, nobody's real mark). */
function emblem(px, T) {
  const [cx, cy, r] = ROOM.emblem;
  // its shadow on the wall (down and right), then the outer ring, the field, the inner ring
  disc(px, cx + 2, cy + 2, r, c('black'));
  disc(px, cx, cy, r, c(T.ring));
  disc(px, cx, cy, r - 1, c(T.ring2));
  disc(px, cx, cy, r - 3, c(T.field));
  disc(px, cx, cy, r - 7, c(T.ring2));
  disc(px, cx, cy, r - 8, c(T.field));
  // the outer ring's lit arc (upper left) and shaded arc (lower right)
  for (let a = 0; a < 360; a += 1.5) {
    const k = (a * Math.PI) / 180;
    const x = Math.round(cx + Math.cos(k) * (r - 0.5)), y = Math.round(cy + Math.sin(k) * (r - 0.5));
    const lit = Math.cos(k) * -0.6 + Math.sin(k) * -0.8;
    if (lit > 0.35) put(px, x, y, c(T.mark));
    else if (lit < -0.45) put(px, x, y, c(T.ring2));
  }
  // a plain beading on the band between the rings
  for (let i = 0; i < 24; i++) {
    const k = (i / 24) * Math.PI * 2;
    put(px, Math.round(cx + Math.cos(k) * (r - 5)), Math.round(cy + Math.sin(k) * (r - 5)), c(T.ring2));
  }
  // the diamond: a lit upper-left half, its shade lower right, a small inner diamond and a bar through it
  const d = r - 14;
  for (let y = -d; y <= d; y++) {
    for (let x = -d; x <= d; x++) {
      const m = Math.abs(x) + Math.abs(y);
      if (m > d) continue;
      let col = x + y < 0 ? T.mark : T.markShade;
      if (m > d - 1) col = x + y < 0 ? T.markShade : T.ring2;
      if (m <= d * 0.42) col = m > d * 0.42 - 1 ? T.markShade : T.inner;
      put(px, cx + x, cy + y, c(col));
    }
  }
  rect(px, cx - d - 5, cy - 1, cx - d + 1, cy + 1, c(T.markShade));
  rect(px, cx + d, cy - 1, cx + d + 6, cy + 1, c(T.markShade));
}

/** A thick line (Bresenham, `w` px wide toward +x). */
function stem(layer, x0, y0, x1, y1, col, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let k = 0; k < w; k++) put(layer, x + k, y, col);
  }
}

/** One microphone: the gooseneck from the lectern, a blank cube on some, the foam windshield aimed at the mouth. */
function mic(layer, m, T) {
  const top = LECTERN.top;
  const dx = MOUTH[0] - m.hx, dy = MOUTH[1] - m.hy;
  const dl = Math.hypot(dx, dy) || 1;
  const ux = dx / dl, uy = dy / dl; // toward the mouth
  const hl = 5, r = 3.4; // the windshield: a capsule 2 * (hl + r) long
  const ax = m.hx - ux * hl, ay = m.hy - uy * hl; // its back end (the stem's top)
  // the gooseneck: a gentle bend from the base up into the windshield's back, 2 px, a lit pixel every few
  const mx = (m.bx + ax) / 2 + (ax - m.bx) * 0.25, my = (top + ay) / 2 + 4;
  let lx = m.bx, ly = top;
  for (let i = 1; i <= 14; i++) {
    const u = i / 14;
    const x = (1 - u) * (1 - u) * m.bx + 2 * u * (1 - u) * mx + u * u * ax;
    const y = (1 - u) * (1 - u) * top + 2 * u * (1 - u) * my + u * u * ay;
    stem(layer, lx, ly, x, y, c('black'), 2);
    if (i % 3 === 1) put(layer, Math.round(x), Math.round(y), c(T.stemHi));
    lx = x;
    ly = y;
  }
  // the cube: a blank block round the stem just below the windshield, lit on its top and left
  if (m.cube && T.cubes) {
    const cx = Math.round(ax - ux * 4), cy = Math.round(ay - uy * 4) + 1;
    rect(layer, cx - 5, cy - 4, cx + 5, cy + 4, c('black'));
    rect(layer, cx - 4, cy - 3, cx + 4, cy + 3, c(m.cube));
    rect(layer, cx - 4, cy + 1, cx + 4, cy + 3, DOWN.get(c(m.cube)) ?? c(m.cube));
    rect(layer, cx - 4, cy - 3, cx + 4, cy - 2, c(m.cube === 'steel' ? 'fog' : m.cube === 'navy' ? 'blue' : 'red'));
  }
  // the windshield: every pixel within r of the capsule's axis; a black outline, the foam lit on its upper left
  const bx = m.hx + ux * hl, by = m.hy + uy * hl;
  const wind = c(m.wind), lit = c(m.wind === 'black' ? 'ink' : m.wind === 'ink' ? 'slate' : 'steel');
  for (let y = Math.floor(Math.min(ay, by) - r - 1); y <= Math.ceil(Math.max(ay, by) + r + 1); y++) {
    for (let x = Math.floor(Math.min(ax, bx) - r - 1); x <= Math.ceil(Math.max(ax, bx) + r + 1); x++) {
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / (4 * hl * hl)));
      const qx = ax + (bx - ax) * t, qy = ay + (by - ay) * t;
      const d = Math.hypot(x - qx, y - qy);
      if (d > r) continue;
      // the foam's normal (from the axis), lit from the upper left; a fine weave every other pixel in the shade
      const nx = (x - qx) / r, ny = (y - qy) / r;
      let col = nx * -0.6 + ny * -0.8 > 0.2 ? lit : wind;
      if (col === wind && (x + y) % 2 === 0 && d < r - 1.2 && m.wind !== 'black') col = DOWN.get(wind) ?? wind;
      put(layer, x, y, d > r - 1 ? c('black') : col);
    }
  }
}

/** The lectern and the microphones into a layer (0 = transparent), cached per variant and finish. */
function front(layer, variant, finish) {
  const T = TONES[variant];
  const F = FINISH[variant][finish].map(c);
  const { x0, x1, top } = LECTERN;
  for (const m of MICS) mic(layer, m, T);
  // the lectern: the top's lit edge (a 1 px dark lip over it), then the panelled front falling into shadow
  for (let x = x0; x < x1; x++) {
    layer[(top - 3) * W + x] = c('black');
    layer[(top - 2) * W + x] = F[0];
    layer[(top - 1) * W + x] = F[1];
    layer[top * W + x] = F[1];
    layer[(top + 1) * W + x] = F[2];
    for (let y = top + 2; y < H; y++) {
      const k = (y - top) / (H - top);
      layer[y * W + x] = k < 0.42 ? F[3] : k < 0.5 && (x + y) % 2 ? F[3] : F[4];
    }
    layer[(top + 2) * W + x] = c('black'); // the shadow under the top's lip
  }
  // the corners: the left edge catches the light, the right turns away
  for (let y = top - 2; y < H; y++) {
    put(layer, x0, y, F[1]);
    put(layer, x1 - 1, y, c('black'));
  }
  // two raised panels on the front: a groove round each, lit on its lower-right edge
  for (const [a, b] of [[x0 + 10, 118], [130, x1 - 10]]) {
    for (let x = a; x < b; x++) {
      put(layer, x, top + 8, F[5]);
      put(layer, x, top + 9, F[2]);
    }
    for (let y = top + 8; y < H; y++) {
      put(layer, a, y, F[5]);
      put(layer, b, y, F[2]);
    }
  }
}

const ROOMS = new Map(), FRONTS = new Map();

/** The room behind the speaker into px (u32, 384x216). Unknown variants draw 'press'. */
export function drawPressRoom(px, variant = 'press', t = 0) {
  const v = TONES[variant] ? variant : 'press';
  let layer = ROOMS.get(v);
  if (!layer) {
    layer = new Uint32Array(W * H);
    room(layer, v);
    ROOMS.set(v, layer);
  }
  px.set(layer);
  return true;
}

/** The lectern and the microphones over the speaker (only their own pixels). */
export function drawPressFront(px, variant = 'press', finish = 'wood') {
  const v = TONES[variant] ? variant : 'press';
  const f = finish === 'steel' ? 'steel' : 'wood';
  const key = `${v}|${f}`;
  let layer = FRONTS.get(key);
  if (!layer) {
    layer = new Uint32Array(W * H);
    front(layer, v, f);
    FRONTS.set(key, layer);
  }
  for (let i = 0; i < layer.length; i++) if (layer[i]) px[i] = layer[i];
}

// TECH BYTES' intro for the vertical clips (docs/publishing/shorts-v2.md §6; its cue sheet: cues.js INTRO_CUES). The
// owner, 26 Oct: "hagamos primero Tech Bytes, han tenido mucho más éxito"; as for COSMOS DESK's: spectacular, a music
// that holds the eye, four seconds at most, the letters worked for, no boxes of text, no flash; then, after three cuts
// of a city turning into a motherboard: "haz como que se avanza por las calles de la ciudad, como haría un dron a
// velocidad rápida, todo con luces azules, y llega hasta el procesador y allí sube para dar la vista desde arriba".
// Seven beats at 112 BPM (3.75 s), one unbroken shot on the clips' 216 x 384 frame, moving from its first frame:
//
//   RUN     beats 0-2.25  a drone flying fast and low down the avenue that leads to the processor, between the towers of
//                         a city of blue light: their windows lit blue and cyan, their edges trimmed in cyan, the street's
//                         lanes glowing, streaks of light racing along them (some overtaking the drone toward the
//                         processor, some coming the other way); the drone swaying and banking a little as it goes; at
//                         the avenue's end the canyon opens onto the plaza at the city's heart, the processor waiting in
//                         a pool of its own blue light
//   PULL    2.25-3.5      over the plaza the drone swoops up: on at its speed, climbing, its look locked on the
//                         processor and turning down with it, slowing to a stop straight over it; the processor's own
//                         traces light as their signals run in
//   BOOT    3.5           overhead (the stroke): every signal reaches its pins together and the die boots the byte, a
//                         cell at a time: the emblem
//   TITLE   4-5.5         TECH types in under it, a letter a quarter beat, the cursor running ahead of it; BYTES
//                         between two cyan rules under that; on the hit a scan runs down the letters
//   LOCK    5.5-7         the emblem and the title, signals still running in along its traces; the cut on the seventh
//                         beat
//
// How it is drawn: the city lies on a plane, the processor at its middle, seen through one lens from a camera on the
// drone's path (overhead at the end, 185 units over the processor: a unit of the ground is a pixel of the frame and the
// processor stands at the emblem's place). Its streets are buses of traces on a grid, lines of light (the copper's glint
// and the cyan) each spread over the pixels it crosses by the share of them it covers (a far lane is a faint haze, never
// a shimmer of whole pixels), the cyan given a lens's glow, brought to the channel's palette on its ramps through the
// screen's Bayer matrix. The towers are boxes drawn far to near, their windows a grid of floors and bays (panes near to,
// points further off, never closer than two pixels on the frame), their edges lines of cyan; the processor is the
// emblem's own chip (tech.js: the epoxy package, its bevel and pins, the die and its byte) drawn from its true shapes at
// any size and angle, its light a glow on the ground round it (strongest on the boot, faint under the emblem).
import { P } from '../../palette.js';
import { textPixels, drawText, measureText } from '../../font.js';
import { u32, clamp, seg, easeOutQuint, easeInOut } from '../../gfx/index.js';
import { mulberry32 } from '../../util.js';
import { Layer, ditherAt } from './seq.js';
import { INTRO_CUES } from './cues.js';

const VW = 216;
const VH = 384;
const NPX = VW * VH;
const Q = INTRO_CUES['tech-bytes'];
const BEAT = 60 / Q.bpm;
const FRAME = 1 / 30 / BEAT; // one frame, in beats
const DEG = Math.PI / 180;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));

// ---------------------------------------------------------------------------------------------
// The drone. The processor at the origin of the ground (z = 0, y to the frame's top at the end). The drone flies north
// up the avenue on x = 0, low between the towers, then over the plaza it pulls up and turns its look down to the
// processor: a position, a heading (yaw), a look pitched back from straight down (pitch) and a bank (roll).

const REST = { x: 108, y: 150 }; // the lens's middle on the frame: the processor's place at the end (the emblem's)
const F = 180; // px: the lens
const CH = 5; // the package's height: overhead its top face is a unit a pixel
const D_END = F + CH;
const RUN = { y0: -1040, y1: -260, z: 24 }; // the avenue: from, to (where the drone swoops up), the drone's height
const V_RUN = (RUN.y1 - RUN.y0) / Q.pull; // units a beat (about twenty a frame)
const LOOK = 82 * DEG; // the look along the avenue: a little down from level
const NEAR = 2;
const sstep = (a, e, x) => {
  const v = clamp((x - a) / (e - a), 0, 1);
  return v * v * (3 - 2 * v);
};
const sstep5 = (x) => {
  const v = clamp(x, 0, 1);
  return v * v * v * (v * (6 * v - 15) + 10);
};
// a quintic from p0 to p1 over t in 0..1, leaving at v0 with acceleration a0 and arriving at rest (both per unit of t)
const quintic = (p0, p1, v0, a0, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  const h0 = 1 - 10 * t3 + 15 * t4 - 6 * t5;
  const h1 = t - 6 * t3 + 8 * t4 - 3 * t5;
  const h2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5;
  return h0 * p0 + h1 * v0 + h2 * a0 + (1 - h0) * p1;
};
const PULL_LEN = Q.boot - Q.pull;
const BOB = { a: 2.5, w: 3.1 }; // the drone's rise and fall as it runs
const PATH = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
function pathAt(b, o = PATH) {
  // the sway of a drone flown by hand: a little side to side, banking into it, a little up and down
  const sway = 1 - sstep(Q.pull - 0.25, Q.pull + 0.6, b);
  o.x = 6 * Math.sin(b * 2.3) * sway;
  o.roll = -0.09 * Math.cos(b * 2.3) * sway;
  o.yaw = -0.035 * Math.cos(b * 2.3 + 0.4) * sway;
  if (b <= Q.pull) {
    o.y = RUN.y0 + V_RUN * b;
    o.z = RUN.z + BOB.a * Math.sin(b * BOB.w);
    o.pitch = LOOK;
    return o;
  }
  // the swoop: on from the avenue at its speed, the drone climbs out over the plaza, slowing to a stop overhead (each a
  // single smooth curve leaving the run at its speed and its acceleration, never a brake); its look leaves the street
  // and locks on the processor, turning down with it till it is straight under
  const t = Math.min(1, (b - Q.pull) / PULL_LEN);
  const L = PULL_LEN;
  const bp = Q.pull * BOB.w;
  o.y = quintic(RUN.y1, 0, V_RUN * L, 0, t);
  o.z = quintic(RUN.z + BOB.a * Math.sin(bp), D_END, BOB.a * BOB.w * Math.cos(bp) * L, -BOB.a * BOB.w * BOB.w * Math.sin(bp) * L * L, t);
  const lock = Math.atan2(-o.y, o.z - CH);
  const w = sstep5(t / 0.55);
  o.pitch = LOOK + (lock - LOOK) * w;
  return o;
}

const CAM = {};
function cameraAt(b, c = CAM) {
  const p = pathAt(b);
  const st = Math.sin(p.pitch);
  const ct = Math.cos(p.pitch);
  const sp = Math.sin(p.yaw);
  const cp = Math.cos(p.yaw);
  c.px = p.x;
  c.py = p.y;
  c.pz = p.z;
  c.fx = -st * sp;
  c.fy = st * cp;
  c.fz = -ct;
  // right and up, then banked about the look
  const rx = cp;
  const ry = sp;
  const rz = 0;
  const ux = -ct * sp;
  const uy = ct * cp;
  const uz = st;
  const cr = Math.cos(p.roll);
  const sr = Math.sin(p.roll);
  c.rx = rx * cr + ux * sr;
  c.ry = ry * cr + uy * sr;
  c.rz = rz * cr + uz * sr;
  c.ux = -rx * sr + ux * cr;
  c.uy = -ry * sr + uy * cr;
  c.uz = -rz * sr + uz * cr;
  c.d = Math.hypot(p.x, p.y, p.z);
  return c;
}
// a world point in the camera's frame: [right, up, depth]
function toCam(c, x, y, z, out) {
  const vx = x - c.px;
  const vy = y - c.py;
  const vz = z - c.pz;
  out[0] = vx * c.rx + vy * c.ry + vz * c.rz;
  out[1] = vx * c.ux + vy * c.uy + vz * c.uz;
  out[2] = vx * c.fx + vy * c.fy + vz * c.fz;
  return out;
}
const sxOf = (cc) => REST.x + (F * cc[0]) / cc[2];
const syOf = (cc) => REST.y - (F * cc[1]) / cc[2];

// ---------------------------------------------------------------------------------------------
// The city: avenues on a grid every 160 units (each a bus of traces: its lanes), the two through the middle crossing at
// the processor; the blocks between them parted into lots, a tower on each (taller toward the heart); round the
// processor, a plaza holding it and its own traces alone. The avenue the drone comes up ends on the bus across the
// plaza's foot (both in the frame at rest, under the logotype), and the blocks either side of its last stretch are low
// (seen from above at the end, parts on a board; seen from the street, the canyon opening onto the plaza).

const B = 38; // the package's half side
const PIN = 8;
const PINW = 4;
const OFFS = [-25, -8, 8, 25];
const CLEAR = { x0: -140, x1: 140, y0: -140, y1: 176 };
const LOW = { x0: -140, x1: 140, y0: -300, y1: -245 }; // the low blocks either side of the avenue's end (under the frame at rest)
const clearOf = (x0, y0, x1, y1) => x1 < CLEAR.x0 || x0 > CLEAR.x1 || y1 < CLEAR.y0 || y0 > CLEAR.y1;
const GRID = 160;
const STREET = 27; // a block's margin from its avenue's middle: the street between the towers is twice this

let CITY = null;
function city() {
  if (CITY) return CITY;
  const rnd = mulberry32(1040);
  const traces = [];
  // a trace from its far end (s = 0) to its end toward the processor (s = len)
  const addTrace = (pts, w, ring, sig, base = 0) => {
    const n = pts.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const cum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i][0];
      ys[i] = pts[i][1];
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    const tr = { xs, ys, cum, len: cum[n - 1], w, ring, sig, base };
    traces.push(tr);
    return tr;
  };
  // the processor's own: from each pin out to the frame's edges and on (tech.js traces, stood on end); the bottom's
  // turn out under the package and drop through vias, clear of the logotype
  const t = B + PIN;
  const vias = [];
  OFFS.forEach((o, j) => {
    const s = Math.sign(o);
    const sp = s * (Math.abs(o) + 8) * 1.7;
    const lag = (j % 2 ? 0.04 : 0) + (Math.abs(o) > 10 ? 0.02 : 0);
    const top = [[o + 2 * sp, 1500], [o + 2 * sp, 700 + Math.abs(sp)], [o + sp, 700], [o + sp, t + 10 + Math.abs(sp)], [o, t + 10], [o, t]];
    const outer = Math.abs(o) > 10;
    const vx = o + s * (outer ? 8 : 5);
    const vy = -t - 4 - Math.abs(vx - o) - (outer ? 4 : 3);
    const bottom = [[vx, vy], [vx, -t - 4 - (vx - o) * s], [o, -t - 4], [o, -t]];
    vias.push([vx, vy]);
    const lx = -t - 22 - Math.abs(sp);
    const left = [[-1500, o + sp * 0.5 + 2 * sp], [-700 - Math.abs(sp), o + sp * 0.5 + 2 * sp], [-700, o + sp * 0.5], [lx, o + sp * 0.5], [lx + Math.abs(sp * 0.5), o], [-t, o]];
    const right = left.map(([x, y]) => [-x, y]);
    [top, bottom, left, right].forEach((pts, k) => addTrace(pts, 1, 0, [{ arrive: Q.boot - 0.06 + lag + k * 0.012 }]));
  });
  // an avenue: `k` lanes side by side, each with its streaks of light, half of them racing toward the processor and
  // half coming the other way; lit a little along its length
  const avenue = (main, k, through) => {
    for (let i = 0; i < k; i++) {
      const sig = [];
      const ns = 1 + Math.floor(rnd() * 3);
      const dir = i % 2 ? -1 : 1;
      for (let q = 0; q < ns; q++) sig.push({ phase: rnd(), speed: (through ? 760 : 520) * (0.75 + 0.5 * rnd()) * dir });
      addTrace(offsetLine(main, (i - (k - 1) / 2) * 3.6), 1.5, 1, sig, 1.1 * (0.5 + rnd()));
    }
  };
  const outer = 2720;
  const n = Math.floor(outer / GRID);
  for (const along of [0, 1]) {
    for (let a = -n; a <= n; a++) {
      const c = a * GRID;
      for (const side of [-1, 1]) {
        // (round the plaza: a line along x is cut where it crosses it, x0 to x1; a line along y, y0 to y1)
        // (the bus across the plaza's foot runs through; the drone's avenue ends on it)
        const [lo, hi] = along ? [CLEAR.x0, CLEAR.x1] : [CLEAR.y0, CLEAR.y1];
        let near = c > lo - 30 && c < hi + 30 ? (along ? (side > 0 ? CLEAR.y1 : CLEAR.y0) + side * 30 : (side > 0 ? CLEAR.x1 : CLEAR.x0) + side * 30) : side * 4;
        if (!along && a === -1) near = side * 4;
        if (along && a === 0 && side < 0) near = -GRID + 14;
        const far = outer * side;
        if (Math.abs(far - near) < GRID) continue;
        const pts = [[far, c], [near, c]];
        avenue(pts.map(([u, v]) => (along ? [v, u] : [u, v])), a === 0 ? 9 : 3 + Math.floor(rnd() * 5), a === 0);
      }
    }
  }
  // the towers: each block's ground parted into lots, a tower on each, taller toward the heart; its windows a grid of
  // floors and bays (`fl` units a floor), some lit; a beacon on the tallest roofs
  const towers = [];
  const tower = (x0, y0, x1, y1, h) => {
    if (!clearOf(x0, y0, x1, y1)) return;
    towers.push({ x0, y0, x1, y1, h, fl: 7, seed: Math.floor(rnd() * 1e9), beacon: rnd() < 0.4 && h > 160, r: Math.hypot((x0 + x1) / 2, (y0 + y1) / 2) });
  };
  for (let i = -n; i < n; i++) {
    for (let jj = -n; jj < n; jj++) {
      const x0 = i * GRID + STREET;
      const y0 = jj * GRID + STREET;
      const x1 = (i + 1) * GRID - STREET;
      const y1 = (jj + 1) * GRID - STREET;
      const r = Math.hypot((x0 + x1) / 2, (y0 + y1) / 2);
      const downtown = 1 + 1.2 * Math.exp(-r / 1100);
      const nx = 1 + Math.floor(rnd() * 2.4);
      const ny = 1 + Math.floor(rnd() * 2.4);
      for (let p = 0; p < nx; p++) {
        for (let q = 0; q < ny; q++) {
          const lx0 = x0 + ((x1 - x0) * p) / nx;
          const lx1 = x0 + ((x1 - x0) * (p + 1)) / nx;
          const ly0 = y0 + ((y1 - y0) * q) / ny;
          const ly1 = y0 + ((y1 - y0) * (q + 1)) / ny;
          const sb = Math.min(lx1 - lx0, ly1 - ly0) * 0.08;
          const inLow = lx1 > LOW.x0 && lx0 < LOW.x1 && ly1 <= CLEAR.y0 && ly0 >= LOW.y0;
          const low = inLow && ly1 <= LOW.y1;
          if (inLow && !low) continue; // (between them and the plaza: open ground)
          tower(lx0 + sb, ly0 + sb, lx1 - sb, ly1 - sb, low ? 6 + 14 * rnd() : GRID * (0.35 + 0.95 * rnd() ** 1.4) * downtown);
        }
      }
    }
  }
  CITY = { traces, vias, towers };
  return CITY;
}

// a polyline moved sideways by `off` (its corners mitred: the traces of a bus stay parallel round the jog)
function offsetLine(pts, off) {
  const n = pts.length;
  const nrm = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const l = Math.hypot(dx, dy) || 1;
    nrm.push([dy / l, -dx / l]);
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = nrm[Math.max(0, i - 1)];
    const b = nrm[Math.min(n - 2, i)];
    let mx = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const k = off / Math.max(0.5, mx * b[0] + my * b[1]);
    out.push([pts[i][0] + mx * k, pts[i][1] + my * k]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The light: the copper's glint and the cyan, each line spread over the pixels it crosses by the share of them it covers

const COPPER = new Float32Array(NPX);
const GLOW = new Float32Array(NPX);
const COPPER_K = 0.9; // a unit-wide trace's glint, seen a unit a pixel
const LIT = 4.4; // a lit trace's light (the cyan rung)
const HEAD = 16; // a streak's head
const TRAIL = 5; // its trail's brightest

function splat(buf, x, y, v) {
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const fx = x - 0.5 - x0;
  const fy = y - 0.5 - y0;
  if (x0 < 0 || y0 < 0 || x0 >= VW - 1 || y0 >= VH - 1) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi >= 0 && yi >= 0 && xi < VW && yi < VH) buf[yi * VW + xi] += v;
    return;
  }
  const i = y0 * VW + x0;
  buf[i] += v * (1 - fx) * (1 - fy);
  buf[i + 1] += v * fx * (1 - fy);
  buf[i + VW] += v * (1 - fx) * fy;
  buf[i + VW + 1] += v * fx * fy;
}

const A = [0, 0, 0];
const Bc = [0, 0, 0];
// a stretch of a trace on the ground, from (x0, y0) to (x1, y1), its light va to vb along it (per unit of width seen at
// a pixel), `w` units wide, into `buf`
function groundLine(c, buf, x0, y0, x1, y1, va, vb, w, minCov = 0) {
  toCam(c, x0, y0, 0, A);
  toCam(c, x1, y1, 0, Bc);
  if (A[2] < NEAR && Bc[2] < NEAR) return;
  let ta = 0;
  let tb = 1;
  if (A[2] < NEAR) ta = (NEAR - A[2]) / (Bc[2] - A[2]);
  if (Bc[2] < NEAR) tb = (NEAR - A[2]) / (Bc[2] - A[2]);
  const za = A[2] + (Bc[2] - A[2]) * ta;
  const zb = A[2] + (Bc[2] - A[2]) * tb;
  const ax = REST.x + (F * (A[0] + (Bc[0] - A[0]) * ta)) / za;
  const ay = REST.y - (F * (A[1] + (Bc[1] - A[1]) * ta)) / za;
  const bx = REST.x + (F * (A[0] + (Bc[0] - A[0]) * tb)) / zb;
  const by = REST.y - (F * (A[1] + (Bc[1] - A[1]) * tb)) / zb;
  if ((ax < -2 && bx < -2) || (ax > VW + 2 && bx > VW + 2) || (ay < -2 && by < -2) || (ay > VH + 2 && by > VH + 2)) return;
  const v0 = va + (vb - va) * ta;
  const v1 = va + (vb - va) * tb;
  const wa = (w * F) / za;
  const wb = (w * F) / zb;
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.min(2000, Math.ceil(len / 0.7)));
  const step = len / n;
  const nx = len > 0 ? -(by - ay) / len : 0;
  const ny = len > 0 ? (bx - ax) / len : 0;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const wp = wa + (wb - wa) * f;
    let v = (v0 + (v1 - v0) * f) * Math.max(step, 0.35) * (i === 0 || i === n ? 0.5 : 1);
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    if (wp <= 1.25) {
      splat(buf, x, y, v * Math.max(minCov, Math.min(1, wp)));
      continue;
    }
    const m = Math.min(5, Math.round(wp));
    for (let q = 0; q < m; q++) {
      const o = q - (m - 1) / 2;
      splat(buf, x + nx * o, y + ny * o, v);
    }
  }
}

// the point of a trace at arc length s
function along(tr, s, out) {
  const { xs, ys, cum } = tr;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const f = clamp((s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]), 0, 1);
  out[0] = xs[i - 1] + (xs[i] - xs[i - 1]) * f;
  out[1] = ys[i - 1] + (ys[i] - ys[i - 1]) * f;
  return out;
}
// the stretch of a trace from s0 to s1, its light va to vb
const PA = [0, 0];
const PB = [0, 0];
function stretch(c, buf, tr, s0, s1, va, vb, minCov = 0) {
  s0 = Math.max(0, s0);
  s1 = Math.min(tr.len, s1);
  if (s1 <= s0) return;
  const { cum } = tr;
  let from = s0;
  while (from < s1 - 1e-6) {
    let i = 1;
    while (i < cum.length - 1 && cum[i] <= from + 1e-6) i++;
    const to = Math.min(s1, cum[i]);
    along(tr, from, PA);
    along(tr, to, PB);
    const fa = (from - s0) / (s1 - s0);
    const fb = (to - s0) / (s1 - s0);
    groundLine(c, buf, PA[0], PA[1], PB[0], PB[1], va + (vb - va) * fa, va + (vb - va) * fb, tr.w, minCov);
    from = to;
  }
}

const TAIL = 260; // a streak's trail, in units
const RING_WAIT = 0.9; // the processor's own traces before their signal comes: as faint as a lane
function lightCity(c, b) {
  const { traces } = city();
  COPPER.fill(0);
  GLOW.fill(0);
  for (const tr of traces) {
    stretch(c, COPPER, tr, 0, tr.len, COPPER_K, COPPER_K);
    if (tr.ring === 0) {
      // the processor's own: one signal runs in from its far end and reaches the pin on the stroke, the trace lit behind
      // it; then small pulses keep running in
      const { arrive } = tr.sig[0];
      const run = Math.max(0.3, tr.len / 520); // 520 units a beat: in sight for the last third of a beat or so
      const p = (b - (arrive - run)) / run;
      const head = tr.len * clamp(p, 0, 1);
      if (head < tr.len) stretch(c, GLOW, tr, head, tr.len, RING_WAIT, RING_WAIT, 0.25); // waiting: a faint blue
      if (p <= 0) continue;
      stretch(c, GLOW, tr, 0, head, LIT * 0.55, LIT);
      if (p < 1) stretch(c, GLOW, tr, head - 40, head, LIT, HEAD);
      else {
        // after the boot: pulses keep running in, one every three quarters of a beat, each trace at its own time
        const q = ((b - arrive) / 0.75 + tr.xs[0] * 0.0137) % 1;
        const s = tr.len * q;
        stretch(c, GLOW, tr, s - 50, s, LIT, LIT * 2.4);
      }
      continue;
    }
    // an avenue's lane: lit a little along its length, its streaks racing along it (toward the processor or away)
    stretch(c, GLOW, tr, 0, tr.len, tr.base, tr.base, 0.25);
    for (const sg of tr.sig) {
      const period = tr.len + TAIL;
      const s = ((sg.phase * period + b * sg.speed) % period + period) % period;
      if (sg.speed > 0) {
        stretch(c, GLOW, tr, s - TAIL, s, 0, TRAIL, 0.5);
        if (s <= tr.len) stretch(c, GLOW, tr, s - 12, s, TRAIL, HEAD, 0.7);
      } else {
        // coming the other way: its head at the near end of its trail
        const h = tr.len - s;
        stretch(c, GLOW, tr, h, h + TAIL, TRAIL, 0, 0.5);
        if (h >= 0) stretch(c, GLOW, tr, h, h + 12, HEAD, TRAIL, 0.7);
      }
    }
  }
}

// the cyan's glow in the lens: a quarter of the frame, blurred twice, laid back over itself
const GW = VW / 4;
const GH = VH / 4;
const GL = new Float32Array(GW * GH);
const GT = new Float32Array(GW * GH);
const GLOW_K = 0.6;
function bloom(buf = GLOW) {
  const GLOW = buf;
  GL.fill(0);
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) GL[(y >> 2) * GW + (x >> 2)] += Math.min(30, GLOW[y * VW + x]) / 16;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += GL[y * GW + clamp(x + k, 0, GW - 1)];
        GT[y * GW + x] = a / 5;
      }
    }
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        let a = 0;
        for (let k = -2; k <= 2; k++) a += GT[clamp(y + k, 0, GH - 1) * GW + x];
        GL[y * GW + x] = a / 5;
      }
    }
  }
  for (let y = 0; y < VH; y++) {
    const gy = Math.min(GH - 1.001, Math.max(0, y / 4 - 0.375));
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < VW; x++) {
      const gx = Math.min(GW - 1.001, Math.max(0, x / 4 - 0.375));
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const i = y0 * GW + x0;
      GLOW[y * VW + x] += GLOW_K * ((GL[i] * (1 - fx) + GL[i + 1] * fx) * (1 - fy) + (GL[i + GW] * (1 - fx) + GL[i + GW + 1] * fx) * fy);
    }
  }
}

// the palette's ramps, dark to light: the cyan and the copper; the sky's glow over the city
const CYAN = [C.black, C.ink, C.navy, C.blue, C.cyan, C.white];
const COPPER_RAMP = [C.black, C.ink, C.slate, C.steel];
const SKY = [C.black, C.ink, C.navy];
const GMAX = Math.log1p(7.4); // a lit trace (LIT) on the cyan rung
const CMAX = 1.35; // a unit-wide trace's glint on the slate rung
const POOL_R = 22; // the processor's light on the ground: how far it reaches past the package
// its strength at beat b: coming up as the drone nears, fullest on the boot, settling under the emblem
const poolAt = (b) => 2.6 * sstep(0, Q.boot, b) * (1 - 0.75 * sstep(Q.boot, Q.boot + 1, b));
function develop(d, c, b) {
  // where the horizon is: a pixel's ray rises (the sky) or falls (the ground), the sky glowing navy over the city
  const k = Math.hypot(c.rz, c.uz) || 1;
  const pool = poolAt(b);
  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const t = ditherAt(x, y) / 16;
      const up = (c.fz * F + (x + 0.5 - REST.x) * c.rz - (y + 0.5 - REST.y) * c.uz) / k; // px above the horizon
      if (up > 0) {
        d[i] = SKY[Math.min(2, Math.floor(Math.exp(-up / 30) * 2.2 + t))];
        continue;
      }
      let g = GLOW[i] + Math.exp(up / 6) * 0.9;
      if (pool > 0) {
        // the processor's light on the ground round it (where this pixel's ray meets the ground)
        const dx = c.fx * F + (x + 0.5 - REST.x) * c.rx - (y + 0.5 - REST.y) * c.ux;
        const dy = c.fy * F + (x + 0.5 - REST.x) * c.ry - (y + 0.5 - REST.y) * c.uy;
        const dz = c.fz * F + (x + 0.5 - REST.x) * c.rz - (y + 0.5 - REST.y) * c.uz;
        const s = -c.pz / dz;
        const gx = Math.abs(c.px + s * dx) - B;
        const gy = Math.abs(c.py + s * dy) - B;
        const out = Math.hypot(Math.max(0, gx), Math.max(0, gy)) + Math.min(0, Math.max(gx, gy));
        g += pool * Math.exp(-Math.max(0, out) / POOL_R);
      }
      const gi = (Math.log1p(g) / GMAX) * 4;
      const ci = (COPPER[i] / CMAX) * 2;
      if (gi / 4 >= ci / 2.6) d[i] = CYAN[Math.min(5, Math.floor(gi + t))];
      else d[i] = COPPER_RAMP[Math.min(3, Math.floor(ci + t))];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Polygons: a face of the board's world, cut at the near plane, filled on the frame

const PX = new Float64Array(16);
const PY = new Float64Array(16);
const CC = [0, 0, 0];
const VXc = new Float64Array(16);
const VYc = new Float64Array(16);
const VZc = new Float64Array(16);
// a convex face (flat arrays of its corners in the world), filled with `col`; false when nothing of it is seen
function face(d, c, wx, wy, wz, n, col, cover = 1) {
  // into the camera's frame
  let m = 0;
  for (let i = 0; i < n; i++) {
    toCam(c, wx[i], wy[i], wz[i], CC);
    VXc[i] = CC[0];
    VYc[i] = CC[1];
    VZc[i] = CC[2];
  }
  // cut at the near plane
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ia = VZc[i] >= NEAR;
    const ib = VZc[j] >= NEAR;
    if (ia) {
      PX[m] = REST.x + (F * VXc[i]) / VZc[i];
      PY[m] = REST.y - (F * VYc[i]) / VZc[i];
      m++;
    }
    if (ia !== ib) {
      const tt = (NEAR - VZc[i]) / (VZc[j] - VZc[i]);
      PX[m] = REST.x + (F * (VXc[i] + (VXc[j] - VXc[i]) * tt)) / NEAR;
      PY[m] = REST.y - (F * (VYc[i] + (VYc[j] - VYc[i]) * tt)) / NEAR;
      m++;
    }
  }
  if (m < 3) return false;
  fillPoly(d, PX, PY, m, col, cover);
  return true;
}
// (cover under 1: only the pixels whose place in the screen's Bayer matrix is under it)
function fillPoly(d, xs, ys, n, col, cover = 1) {
  let ymin = Infinity;
  let ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (ys[i] < ymin) ymin = ys[i];
    if (ys[i] > ymax) ymax = ys[i];
  }
  const y0 = Math.max(0, Math.ceil(ymin - 0.5));
  const y1 = Math.min(VH - 1, Math.floor(ymax - 0.5));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    let xl = Infinity;
    let xr = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ya = ys[i];
      const yb = ys[j];
      if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) {
        const x = xs[i] + ((yc - ya) / (yb - ya)) * (xs[j] - xs[i]);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    if (xl > xr) continue;
    const a = Math.max(0, Math.ceil(xl - 0.5));
    const e = Math.min(VW - 1, Math.floor(xr - 0.5));
    const row = y * VW;
    if (cover >= 1) for (let x = a; x <= e; x++) d[row + x] = col;
    else for (let x = a; x <= e; x++) if (ditherAt(x, y) < cover * 16) d[row + x] = col;
  }
}
const WX = new Float64Array(4);
const WY = new Float64Array(4);
const WZ = new Float64Array(4);
// a flat rectangle at height z
function rectAt(d, c, x0, y0, x1, y1, z, col, cover = 1) {
  WX[0] = x0; WY[0] = y0;
  WX[1] = x1; WY[1] = y0;
  WX[2] = x1; WY[2] = y1;
  WX[3] = x0; WY[3] = y1;
  WZ.fill(z);
  return face(d, c, WX, WY, WZ, 4, col, cover);
}
// an upright side from (xa, ya) to (xb, yb), z0 to z1
function sideAt(d, c, xa, ya, xb, yb, z0, z1, col, cover = 1) {
  WX[0] = xa; WY[0] = ya; WZ[0] = z0;
  WX[1] = xb; WY[1] = yb; WZ[1] = z0;
  WX[2] = xb; WY[2] = yb; WZ[2] = z1;
  WX[3] = xa; WY[3] = ya; WZ[3] = z1;
  return face(d, c, WX, WY, WZ, 4, col, cover);
}

// a line in the world, cut at the near plane, drawn a pixel at a time
const LA = [0, 0, 0];
const LB = [0, 0, 0];
function line3(d, c, x0, y0, z0, x1, y1, z1, col) {
  toCam(c, x0, y0, z0, LA);
  toCam(c, x1, y1, z1, LB);
  if (LA[2] < NEAR && LB[2] < NEAR) return;
  if (LA[2] < NEAR || LB[2] < NEAR) {
    const tt = (NEAR - LA[2]) / (LB[2] - LA[2]);
    const P = LA[2] < NEAR ? LA : LB;
    P[0] = LA[0] + (LB[0] - LA[0]) * tt;
    P[1] = LA[1] + (LB[1] - LA[1]) * tt;
    P[2] = NEAR;
  }
  const ax = sxOf(LA);
  const ay = syOf(LA);
  const bx = sxOf(LB);
  const by = syOf(LB);
  const n = Math.min(1200, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))));
  for (let i = 0; i <= n; i++) {
    const f = n ? i / n : 0;
    const x = Math.floor(ax + (bx - ax) * f);
    const y = Math.floor(ay + (by - ay) * f);
    if (x >= 0 && y >= 0 && x < VW && y < VH) d[y * VW + x] = col;
  }
}

// ---------------------------------------------------------------------------------------------
// A tower: its sides toward the camera dark, their windows lit blue and cyan here and there (panes near to, points
// further off); its roof dark; its edges trimmed in cyan (blue further off); a cyan beacon blinking on the tallest

const WIN = [C.blue, C.blue, C.cyan, C.navy, C.blue, C.fog, C.cyan, C.white];
const WP = [0, 0, 0];
const hash = (a, b2, c2, d2) => {
  let h = (a ^ (b2 * 374761393) ^ (c2 * 668265263) ^ (d2 * 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const FX = new Float64Array(4);
const FY = new Float64Array(4);
const FZ = new Float64Array(4);
function drawTower(d, c, t, b, size, dist) {
  const { x0, y0, x1, y1, h } = t;
  const trim = dist < 700 ? C.cyan : dist < 1600 ? C.blue : C.navy;
  const sides = [];
  if (c.py < y0) sides.push([x0, y0, x1, y0, 0]);
  if (c.py > y1) sides.push([x1, y1, x0, y1, 1]);
  if (c.px < x0) sides.push([x0, y1, x0, y0, 2]);
  if (c.px > x1) sides.push([x1, y0, x1, y1, 3]);
  for (const [xa, ya, xb, yb, fi] of sides) {
    if (!sideAt(d, c, xa, ya, xb, yb, 0, h, C.black)) continue;
    if (size >= 3) {
      // its windows: floors of `fl` units, bays as wide
      const w = Math.hypot(xb - xa, yb - ya);
      const floors = Math.floor(h / t.fl);
      const bays = Math.max(1, Math.floor(w / t.fl));
      for (let f = 1; f < floors; f++) {
        const z = f * t.fl;
        for (let q = 0; q < bays; q++) {
          const hv = hash(t.seed, fi, f, q);
          if (hv >= 0.42) continue;
          const u = (q + 0.5) / bays;
          toCam(c, xa + (xb - xa) * u, ya + (yb - ya) * u, z, WP);
          if (WP[2] < NEAR) continue;
          const px = (F * t.fl) / WP[2];
          if (px < 2 && hash(t.seed, f, q, 7) > px / 2) continue; // far off, fewer of them (never a solid wash)
          const col = WIN[Math.floor(hv * 97) % WIN.length];
          if (px >= 4) {
            // a pane: half the bay's width, half the floor's height
            const u0 = (q + 0.25) / bays;
            const u1 = (q + 0.75) / bays;
            FX[0] = xa + (xb - xa) * u0; FY[0] = ya + (yb - ya) * u0; FZ[0] = z - t.fl * 0.25;
            FX[1] = xa + (xb - xa) * u1; FY[1] = ya + (yb - ya) * u1; FZ[1] = z - t.fl * 0.25;
            FX[2] = FX[1]; FY[2] = FY[1]; FZ[2] = z + t.fl * 0.25;
            FX[3] = FX[0]; FY[3] = FY[0]; FZ[3] = z + t.fl * 0.25;
            face(d, c, FX, FY, FZ, 4, col);
            continue;
          }
          const sx = Math.round(sxOf(WP) - 0.5);
          const sy = Math.round(syOf(WP) - 0.5);
          if (sx >= 0 && sy >= 0 && sx < VW && sy < VH) d[sy * VW + sx] = col;
        }
      }
    }
    // its edges: the side's two uprights and its top
    if (size >= 2) {
      line3(d, c, xa, ya, 0, xa, ya, h, trim);
      line3(d, c, xb, yb, 0, xb, yb, h, trim);
      line3(d, c, xa, ya, h, xb, yb, h, trim);
    }
  }
  // the roof (seen from above it: dark, its edges trimmed)
  if (c.pz > h) {
    rectAt(d, c, x0, y0, x1, y1, h, C.black);
    if (size >= 2) {
      line3(d, c, x0, y0, h, x1, y0, h, trim);
      line3(d, c, x1, y0, h, x1, y1, h, trim);
      line3(d, c, x1, y1, h, x0, y1, h, trim);
      line3(d, c, x0, y1, h, x0, y0, h, trim);
    }
  }
  if (t.beacon && Math.floor(b * 1.6 + (t.seed % 7)) % 2 === 0) {
    toCam(c, (x0 + x1) / 2, (y0 + y1) / 2, h + 2, WP);
    if (WP[2] > NEAR) {
      const sx = Math.round(sxOf(WP) - 0.5);
      const sy = Math.round(syOf(WP) - 0.5);
      if (sx > 0 && sy > 0 && sx < VW - 1 && sy < VH - 1) {
        d[sy * VW + sx] = C.white;
        if (WP[2] < 900) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) d[(sy + dy) * VW + sx + dx] = C.cyan;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The processor: the emblem's chip (tech.js chipSprite, drawDie) from its true shapes, a unit a pixel overhead: the
// black epoxy top with a bevel lit on its key side (top and left) and shaded on the far side, its specular corner, the
// pin-1 dimple, the recessed die window with its fine grid, four pins a side (lit on their key edge, a solder-bright
// tip), and on the stroke the die's cyan outline drawing round and the byte booting a cell at a time

const BYTE = [1, 0, 1, 1, 0, 1, 0, 1]; // 0xB5, as the emblem's
const CELL = { w: 8, h: 9, gap: 3 };
const GRID_W = 4 * CELL.w + 3 * CELL.gap;
const GRID_H = 2 * CELL.h + CELL.gap;
const DIE = { hw: (GRID_W + 2 * (CELL.gap + 1) + 2) / 2, hh: (GRID_H + 2 * (CELL.gap + 1) + 2 + 2 * CELL.gap) / 2 };
function drawChip(d, c, b) {
  const z = CH;
  // the package's sides
  if (c.py < -B) sideAt(d, c, -B, -B, B, -B, 0, z, C.black);
  if (c.px > B) sideAt(d, c, B, -B, B, B, 0, z, C.black);
  if (c.py > B) sideAt(d, c, -B, B, B, B, 0, z, C.slate);
  if (c.px < -B) sideAt(d, c, -B, -B, -B, B, 0, z, C.ink);
  // the pins: a leg out of each side, 2 high
  for (const o of OFFS) {
    const a = o - PINW / 2;
    const e = o + PINW / 2;
    // top and bottom rows (legs along y): the left column lit, the right in shade; the solder tip at the outer end
    for (const [ya, yb, lit] of [[B, B + PIN, true], [-B - PIN, -B, false]]) {
      rectAt(d, c, a, ya, e, yb, 2, lit ? C.steel : C.slate);
      rectAt(d, c, a, ya, a + 1, yb, 2, lit ? C.silver : C.steel);
      rectAt(d, c, e - 1, ya, e, yb, 2, lit ? C.slate : C.ink);
      const ty = lit ? yb - 1 : ya;
      rectAt(d, c, a, ty, a + 1, ty + 1, 2, lit ? C.white : C.fog);
    }
    // left and right columns (legs along x): the top row lit, the bottom in shade
    for (const [xa, xb, lit] of [[-B - PIN, -B, true], [B, B + PIN, false]]) {
      rectAt(d, c, xa, a, xb, e, 2, lit ? C.steel : C.slate);
      rectAt(d, c, xa, e - 1, xb, e, 2, lit ? C.silver : C.steel);
      rectAt(d, c, xa, a, xb, a + 1, 2, lit ? C.slate : C.ink);
      const tx = lit ? xa : xb - 1;
      rectAt(d, c, tx, e - 1, tx + 1, e, 2, lit ? C.white : C.fog);
    }
  }
  // the top: black epoxy, the bevel (two rows lit on the key side, shaded on the far side), the specular corner
  rectAt(d, c, -B, -B, B, B, z, C.black);
  rectAt(d, c, -B, B - 1, B, B, z, C.silver);
  rectAt(d, c, -B, -B, -B + 1, B - 1, z, C.silver);
  rectAt(d, c, -B + 1, B - 2, B - 1, B - 1, z, C.steel);
  rectAt(d, c, -B + 1, -B + 1, -B + 2, B - 2, z, C.steel);
  rectAt(d, c, B - 1, -B, B, B - 1, z, C.slate);
  rectAt(d, c, -B + 1, -B, B - 1, -B + 1, z, C.slate);
  rectAt(d, c, B - 2, -B + 1, B - 1, B - 2, z, C.ink);
  rectAt(d, c, -B + 2, -B + 1, B - 2, -B + 2, z, C.ink);
  rectAt(d, c, -B, B - 1, -B + 1, B, z, C.white);
  // the pin-1 dimple: a small pit, dark on its lit rim, catching the light on its far rim
  const dp = 3;
  const dx0 = -B + 9;
  const dy1 = B - 9;
  rectAt(d, c, dx0, dy1 - dp, dx0 + dp, dy1, z, C.ink);
  rectAt(d, c, dx0, dy1 - 1, dx0 + dp, dy1, z, C.black);
  rectAt(d, c, dx0 + dp - 1, dy1 - dp, dx0 + dp, dy1 - 1, z, C.slate);
  // the die window, recessed: shadowed on its key side, lit on its far side, a fine grid on its surface
  const { hw, hh } = DIE;
  rectAt(d, c, -hw, -hh, hw, hh, z, C.ink);
  rectAt(d, c, -hw - 1, hh, hw + 1, hh + 1, z, C.black);
  rectAt(d, c, -hw - 1, -hh, -hw, hh, z, C.black);
  rectAt(d, c, -hw, -hh - 1, hw + 1, -hh, z, C.slate);
  rectAt(d, c, hw, -hh, hw + 1, hh, z, C.slate);
  if (c.d < 700) for (let yy = hh - 3; yy > -hh + 1; yy -= 3) for (let xx = -hw + 2; xx < hw - 1; xx += 3) rectAt(d, c, xx, yy - 1, xx + 1, yy, z, C.black);
  // the boot: the outline draws round clockwise from the top left, then the byte's cells come on
  const p = easeInOut(seg(b, Q.boot - 0.4, 0.4));
  if (p > 0) {
    const w = 2 * hw;
    const h = 2 * hh;
    let len = 2 * (w + h) * p;
    const run = (l) => {
      const v = Math.min(l, len);
      len -= v;
      return v;
    };
    let v = run(w);
    if (v > 0) rectAt(d, c, -hw, hh - 1, -hw + v, hh, z, C.cyan);
    v = run(h);
    if (v > 0) rectAt(d, c, hw - 1, hh - v, hw, hh, z, C.cyan);
    v = run(w);
    if (v > 0) rectAt(d, c, hw - v, -hh, hw, -hh + 1, z, C.cyan);
    v = run(h);
    if (v > 0) rectAt(d, c, -hw, -hh, -hw + 1, -hh + v, z, C.cyan);
  }
  for (let i = 0; i < 8; i++) {
    if (b < Q.boot + i * 0.0625) continue;
    const x0 = -GRID_W / 2 + (i % 4) * (CELL.w + CELL.gap);
    const y1 = GRID_H / 2 - (i >> 2) * (CELL.h + CELL.gap);
    if (BYTE[i]) {
      rectAt(d, c, x0, y1 - CELL.h, x0 + CELL.w, y1, z, C.cyan);
      rectAt(d, c, x0, y1 - CELL.h, x0 + CELL.w, y1 - CELL.h + 1, z, C.blue);
      rectAt(d, c, x0 + CELL.w - 1, y1 - CELL.h + 1, x0 + CELL.w, y1, z, C.blue);
    } else {
      rectAt(d, c, x0, y1 - CELL.h, x0 + CELL.w, y1, z, C.slate);
      rectAt(d, c, x0, y1 - 1, x0 + CELL.w, y1, z, C.black);
    }
  }
}

// the vias the processor's lower traces drop through: a copper ring round a hole, lit once their signal has come
const VX8 = new Float64Array(8);
const VY8 = new Float64Array(8);
const VZ8 = new Float64Array(8);
function ringAt(d, c, x, y, r, col, z = 0, cover = 1) {
  for (let k = 0; k < 8; k++) {
    VX8[k] = x + Math.cos((k + 0.5) * (Math.PI / 4)) * r;
    VY8[k] = y + Math.sin((k + 0.5) * (Math.PI / 4)) * r;
    VZ8[k] = z;
  }
  return face(d, c, VX8, VY8, VZ8, 8, col, cover);
}
function drawVias(d, c, b) {
  const lit = b >= Q.boot - 0.25;
  for (const [x, y] of city().vias) {
    ringAt(d, c, x, y, 2.7, lit ? C.cyan : C.slate);
    ringAt(d, c, x, y, 1.2, C.black);
  }
}

// the towers and the processor, far to near
const ORDER = [];
const MID = [0, 0, 0];
function drawSolids(d, c, b) {
  const { towers } = city();
  ORDER.length = 0;
  for (const t of towers) {
    toCam(c, (t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, t.h / 2, MID);
    const r = Math.max(t.x1 - t.x0, t.y1 - t.y0, t.h);
    if (MID[2] < -r) continue;
    if (MID[2] > NEAR) {
      const sx = sxOf(MID);
      const sy = syOf(MID);
      const sr = (F * r) / MID[2];
      if (sx + sr < 0 || sx - sr > VW || sy + sr < 0 || sy - sr > VH) continue;
    }
    const dist = Math.max(NEAR, MID[2]);
    ORDER.push([MID[2], t, (F * Math.max(t.x1 - t.x0, t.y1 - t.y0)) / dist, dist]);
  }
  toCam(c, 0, 0, 0, MID);
  ORDER.push([MID[2], null, 0, 0]);
  ORDER.sort((u, v) => v[0] - u[0]);
  for (const [, t, size, dist] of ORDER) {
    if (t) drawTower(d, c, t, b, size, dist);
    else drawChip(d, c, b);
  }
}

// ---------------------------------------------------------------------------------------------
// The logotype: TECH in the channel's 5x7 face at four times its size, each of its pixels a 4 x 4 block, filled top to
// bottom from white through cyan and blue to navy, a white edge along its tops and a navy one along its undersides, a
// black outline and a blue glow round it. It types in a letter a quarter beat, each letter printed down in two frames,
// a cyan cursor running ahead of it and blinking after the last; on the hit a scan runs down the letters. BYTES under
// it at twice the size, its letters spaced, between two cyan rules.

const SC = 4;
const TOP = 224; // TECH's cap line
const BYTES_Y = 262;
const ROWS = 7 * SC;
const TYPE = 0.25; // beats a letter
let LETTERS = null;
function letters() {
  if (LETTERS) return LETTERS;
  const glyphs = [...'TECH'].map((ch) => textPixels(ch, 'body'));
  const width = glyphs.reduce((a, g) => a + g.width, 0) + (glyphs.length - 1);
  let cx = Math.round(VW / 2 - (width * SC) / 2);
  LETTERS = glyphs.map((g, i) => {
    const l = { x: cx, w: g.width, pixels: g.pixels, at: Q.title + TYPE * i };
    cx += (g.width + 1) * SC;
    return l;
  });
  return LETTERS;
}
const MASK = new Uint8Array(NPX);
function cursorAt(b) {
  const ls = letters();
  if (b < Q.title - TYPE || b >= Q.lock) return null;
  let i = 0;
  while (i < ls.length && b >= ls[i].at) i++;
  const x = i < ls.length ? ls[i].x : ls.at(-1).x + (ls.at(-1).w + 1) * SC;
  // steady while it types; before the first letter and once the word is in, it blinks (a quarter beat on, a quarter off)
  const done = b - (ls.at(-1).at + TYPE);
  if (done > 0 && Math.floor(done / TYPE) % 2 === 1) return null;
  if (b < Q.title && Math.floor((b - (Q.title - TYPE)) / (TYPE / 2)) % 2 === 1) return null;
  return { x, w: 3 * SC };
}
function logotype(L, b) {
  if (b < Q.title - TYPE) return;
  const ls = letters();
  const x0 = ls[0].x - 4;
  const x1 = ls.at(-1).x + (ls.at(-1).w + 1) * SC + 3 * SC + 4;
  const y0 = TOP - 4;
  const y1 = TOP + ROWS + 4;
  for (let y = y0; y <= y1; y++) MASK.fill(0, y * VW + x0, y * VW + x1 + 1);
  for (const l of ls) {
    const p = (b - l.at) / (2 * FRAME); // printed down in two frames
    if (p <= 0) continue;
    const rows = Math.min(ROWS, Math.ceil(p * ROWS));
    for (const [gx, gy] of l.pixels) {
      for (let j = 0; j < SC; j++) {
        const r = gy * SC + j;
        if (r >= rows) continue;
        for (let i = 0; i < SC; i++) MASK[(TOP + r) * VW + l.x + gx * SC + i] = 1 + r;
      }
    }
  }
  const cur = cursorAt(b);
  const d = L.d;
  const m = (x, y) => (x >= x0 && y >= y0 && x <= x1 && y <= y1 ? MASK[y * VW + x] : 0);
  const scan = seg(b, Q.lock, 0.5);
  const sy = TOP - 6 + (ROWS + 12) * easeInOut(scan);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = MASK[y * VW + x];
      if (v) {
        const r = v - 1;
        let col = r < 2 ? C.white : r < 11 ? C.cyan : r < 20 ? C.blue : C.navy;
        if (!m(x, y - 1)) col = C.white;
        else if (!m(x, y + 1) && r > 4) col = C.ink;
        if (scan > 0 && scan < 1 && Math.abs(y - sy) < 1.5) col = C.white;
        d[y * VW + x] = col;
        continue;
      }
      if (m(x - 1, y) || m(x + 1, y) || m(x, y - 1) || m(x, y + 1)) d[y * VW + x] = C.black;
      else if ((m(x - 2, y) || m(x + 2, y) || m(x, y - 2) || m(x, y + 2) || m(x - 1, y - 1) || m(x + 1, y + 1) || m(x - 1, y + 1) || m(x + 1, y - 1)) && ditherAt(x, y) < 7) d[y * VW + x] = C.navy;
    }
  }
  if (cur) {
    // the cursor: a cyan block the letters' height, a white top edge, a black outline
    for (let y = TOP - 1; y <= TOP + ROWS; y++) {
      for (let x = cur.x - 1; x <= cur.x + cur.w; x++) {
        const edge = y === TOP - 1 || y === TOP + ROWS || x === cur.x - 1 || x === cur.x + cur.w;
        L.plot(x, y, edge ? C.black : y === TOP ? C.white : C.cyan);
      }
    }
  }
}
// BYTES: wiped out from its middle once TECH is in, its letters spaced, a cyan rule each side
function bytes(ctx, b) {
  const ls = letters();
  const p = easeOutQuint(seg(b, ls.at(-1).at + TYPE, 0.45));
  if (p <= 0) return;
  const word = [...'BYTES'];
  const gap = 5;
  const ws = word.map((ch) => measureText(ch, 2));
  const total = ws.reduce((a, w) => a + w, 0) + gap * (word.length - 1);
  const x0 = Math.round(VW / 2 - total / 2);
  const left = ls[0].x;
  const right = ls.at(-1).x + ls.at(-1).w * SC;
  const half = Math.round(((right - left) / 2) * p);
  ctx.save();
  try {
    ctx.beginPath();
    ctx.rect(VW / 2 - half, BYTES_Y - 2, half * 2, 20);
    ctx.clip();
    let x = x0;
    word.forEach((ch, i) => {
      drawText(ctx, ch, x, BYTES_Y, { color: P.white, scale: 2 });
      x += ws[i] + gap;
    });
    ctx.fillStyle = P.cyan;
    ctx.fillRect(left, BYTES_Y + 6, x0 - 8 - left, 2);
    ctx.fillRect(x0 + total + 8, BYTES_Y + 6, right - (x0 + total + 8), 2);
  } finally {
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------

const LAYER = new Layer('tech-intro', VW, VH);

/** The intro's frame at t seconds (the whole frame). */
export function drawTechIntro(ctx, t) {
  const b = t / BEAT;
  const L = LAYER;
  L.begin(C.black);
  const c = cameraAt(b);
  lightCity(c, b);
  bloom(GLOW);
  develop(L.d, c, b);
  drawVias(L.d, c, b);
  drawSolids(L.d, c, b);
  logotype(L, b);
  L.end(ctx);
  bytes(ctx, b);
}

export const TECH_INTRO = Object.freeze({
  id: 'tech-bytes',
  cues: Q,
  draw: drawTechIntro,
  warm: () => [city(), letters()],
});
/** The drone at beat b (for checks): { x, y, z, pitch, yaw, roll, d } (units, radians; d its distance from the processor). */
export const techIntroCamera = (b) => {
  const p = pathAt(b, {});
  return { ...p, d: Math.hypot(p.x, p.y, p.z) };
};
/** The processor's top-face scale on the frame at beat b once overhead, in pixels a unit (1 at rest). */
export const techIntroScale = (b) => F / (pathAt(b, {}).z - CH);
/** The logotype's box at rest (for checks): { x0, x1, y0, y1 } of TECH and BYTES together. */
export function techIntroTitle() {
  const ls = letters();
  return { x0: ls[0].x - 1, x1: ls.at(-1).x + ls.at(-1).w * SC, y0: TOP - 1, y1: BYTES_Y + 14 };
}
/** The processor's own traces (for checks). */
export function techIntroTraces() {
  return city().traces.filter((tr) => tr.ring === 0);
}

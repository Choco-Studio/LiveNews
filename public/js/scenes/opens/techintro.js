// TECH BYTES' intro for the vertical clips (docs/publishing/shorts-v2.md §6; its cue sheet: cues.js INTRO_CUES). The
// owner, 26 Oct: "hagamos primero Tech Bytes, han tenido mucho más éxito"; as for COSMOS DESK's: spectacular, a music
// that holds the eye, four seconds at most, the letters worked for, no boxes of text, no flash; then, on the first cut,
// "necesita algo para parecer mucho más impresionante, por ejemplo la transición de una ciudad a una placa madre". Seven
// beats at 112 BPM (3.75 s), one unbroken flight on the clips' 216 x 384 frame, moving from its first frame:
//
//   CITY    beats 0-1     low over a city at night, toward its heart: towers with their windows lit, avenues of street
//                         lamps and cars' lights, the city's glow on the haze over the horizon; its tallest tower, at
//                         the heart, lights cyan from the top down
//   WAVE    1-2.6         the tower sinks and a ring of cyan light runs out across the city from it: as it passes, the
//                         lights go out in the towers and they sink into the ground, their roofs' edges lit cyan, the
//                         parts of a motherboard rise in their places, the avenues turn to buses of traces and the cars'
//                         lights to signals racing along them; the ring runs under the camera and on to the horizon
//   DIVE    1.2-3.5       the camera noses down at the processor (where the tower stood) and comes round over it, the
//                         parts rushing up past it, slowing a little every frame; the processor's own traces light as
//                         their signals run in from the edges of the frame
//   BOOT    3.5           overhead (the stroke): every signal reaches its pins together and the die boots the byte, a
//                         cell at a time: the emblem
//   TITLE   4-5.5         TECH types in under it, a letter a quarter beat, the cursor running ahead of it; BYTES
//                         between two cyan rules under that; on the hit a scan runs down the letters
//   LOCK    5.5-7         the emblem and the title, signals still running in along its traces; the cut on the seventh
//                         beat
//
// How it is drawn: the board is a plane seen through one lens from a camera on a logarithmic track (2,200 units from
// the processor to 185 above it: overhead, a unit of the board is a pixel of the frame and the processor stands at the
// emblem's place). The city and the board share one plan: each block between the avenues holds the city's towers and
// the board's parts, and every pixel of a trace, tower or part is the city's or the board's by where the wave has got
// to. The traces are lines of light (the city's warm lamps and cars, its red tail lights, the board's copper glint and
// its cyan), each spread over the pixels it crosses by the share of them it covers (a far street is a faint haze, never
// a shimmer of whole pixels), the warm and the cyan given a lens's glow, all brought to the channel's palette on their
// ramps through the screen's Bayer matrix. The towers and the parts are boxes lit from the upper left, drawn far to near,
// a tower's windows a grid of floors and bays (never closer than two pixels on the frame); the processor is the emblem's
// own chip (tech.js: the epoxy package, its bevel and pins, the die and its byte) drawn from its true shapes at any size
// and angle.
import { P } from '../../palette.js';
import { textPixels, drawText, measureText } from '../../font.js';
import { u32, clamp, lerp, seg, easeOutQuint, easeInOut, easeInOutSine } from '../../gfx/index.js';
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
// The camera. The processor at the origin on the board (z = 0, y to the frame's top at the end); the camera looks at it
// from `d` away, pitched back from straight down by `pitch` and turned about the board's upright by `yaw`; the
// processor stays at the emblem's place on the frame the whole way.

const REST = { x: 108, y: 150 }; // the processor's place on the frame: the emblem's (as Saturn's in COSMOS DESK's)
const F = 180; // px: the lens
const CH = 5; // the package's height: overhead its top face is a unit a pixel
const D_END = F + CH;
// the camera's distance: closing in gently over the city on the first frame, gathering speed through the dive and then
// losing it a little every frame down to overhead (a glide, never a brake): its rate a single swell,
// (0.015 + u^2.5)(1 - u)^2 over the way in, summed
const D0 = 2200;
const LAND = 4.2; // beats: at rest overhead
const SWELL = (() => {
  const n = 600;
  const a = new Float64Array(n + 1);
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    a[i] = acc;
    const u = (i + 0.5) / n;
    acc += ((0.015 + u ** 2.5) * (1 - u) ** 2) / n;
  }
  return a.map((v) => v / acc);
})();
const swell = (b) => {
  const f = clamp(b / LAND, 0, 1) * (SWELL.length - 1);
  const i = Math.min(SWELL.length - 2, Math.floor(f));
  return SWELL[i] + (SWELL[i + 1] - SWELL[i]) * (f - i);
};
const LN_D0 = Math.log(D0);
const LN_DROP = Math.log(D_END) - LN_D0;
// (before the first frame, on at the first frame's rate: the frame before it streaks as the first does)
const LN_D = (b) => LN_D0 + LN_DROP * (b >= 0 ? swell(b) : (b / FRAME) * swell(FRAME));
const PITCH0 = 64 * DEG; // the horizon high in the frame
const PITCH = (b) => PITCH0 * (1 - easeInOutSine(seg(b, 1.2, Q.boot - 1.2)));
const YAW0 = -38 * DEG;
const YAW = (b) => YAW0 * (1 - easeInOutSine(seg(b, 0, Q.boot + 0.3)));
const NEAR = 6;

// The wave: from the city's heart (the processor) at beat Q.wave, out across the city at WAVE_V units a beat; each
// place turns from city to board over WAVE_LEN beats once it has passed (0 a city, 1 a board)
const WAVE_V = 700;
const WAVE_LEN = 0.5;
const morphAt = (r, b) => clamp((b - Q.wave - r / WAVE_V) / WAVE_LEN, 0, 1);
const sstep = (a, e, x) => {
  const v = clamp((x - a) / (e - a), 0, 1);
  return v * v * (3 - 2 * v);
};

const CAM = {};
function cameraAt(b, c = CAM) {
  const d = Math.exp(LN_D(b));
  const th = PITCH(b);
  const ps = YAW(b);
  const st = Math.sin(th);
  const ct = Math.cos(th);
  const sp = Math.sin(ps);
  const cp = Math.cos(ps);
  c.d = d;
  c.px = d * st * sp;
  c.py = -d * st * cp;
  c.pz = d * ct;
  c.fx = -st * sp;
  c.fy = st * cp;
  c.fz = -ct;
  c.rx = cp;
  c.ry = sp;
  c.ux = -ct * sp;
  c.uy = ct * cp;
  c.uz = st;
  // the horizon's row (above the frame once the camera looks down far enough)
  c.hy = st > 1e-4 ? REST.y - (F * ct) / st : -1e9;
  return c;
}
// a world point in the camera's frame: [right, up, depth]
function toCam(c, x, y, z, out) {
  const vx = x - c.px;
  const vy = y - c.py;
  const vz = z - c.pz;
  out[0] = vx * c.rx + vy * c.ry;
  out[1] = vx * c.ux + vy * c.uy + vz * c.uz;
  out[2] = vx * c.fx + vy * c.fy + vz * c.fz;
  return out;
}
const sxOf = (cc) => REST.x + (F * cc[0]) / cc[2];
const syOf = (cc) => REST.y - (F * cc[1]) / cc[2];

// ---------------------------------------------------------------------------------------------
// The board: traces (polylines on the board, each with its width and its signals) and parts (boxes), in three rings:
// the processor's own traces (the emblem's, a unit wide), the buses round it, and the board's far reaches. The frame the
// camera comes to rest over holds the processor and its own traces alone.

const B = 38; // the package's half side
const PIN = 8;
const PINW = 4;
const OFFS = [-25, -8, 8, 25];
// the frame at rest, with a margin: nothing but the processor's own traces in it
const CLEAR = { x0: -122, x1: 122, y0: -246, y1: 166 };
const clearOf = (x0, y0, x1, y1) => x1 < CLEAR.x0 || x0 > CLEAR.x1 || y1 < CLEAR.y0 || y0 > CLEAR.y1;

let BOARD = null;
function board() {
  if (BOARD) return BOARD;
  const rnd = mulberry32(1040);
  const traces = [];
  const parts = [];
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
  // the processor's own: from each pin out to the frame's edges and on across the board (tech.js traces, stood on end);
  // the bottom's turn out under the package and drop through vias to the board's other side, clear of the logotype
  const t = B + PIN;
  const vias = [];
  OFFS.forEach((o, j) => {
    const s = Math.sign(o);
    const sp = s * (Math.abs(o) + 8) * 1.7;
    const lag = (j % 2 ? 0.04 : 0) + (Math.abs(o) > 10 ? 0.02 : 0);
    const top = [[o + 2 * sp, 1500], [o + 2 * sp, 700 + Math.abs(sp)], [o + sp, 700], [o + sp, t + 10 + Math.abs(sp)], [o, t + 10], [o, t]];
    const outer = Math.abs(o) > 10;
    // under the package: down, a 45-degree turn out, and into a via (the outer pins' a little further out and lower)
    const vx = o + s * (outer ? 8 : 5);
    const vy = -t - 4 - Math.abs(vx - o) - (outer ? 4 : 3);
    const bottom = [[vx, vy], [vx, -t - 4 - (vx - o) * s], [o, -t - 4], [o, -t]];
    vias.push([vx, vy]);
    const lx = -t - 22 - Math.abs(sp);
    const left = [[-1500, o + sp * 0.5 + 2 * sp], [-700 - Math.abs(sp), o + sp * 0.5 + 2 * sp], [-700, o + sp * 0.5], [lx, o + sp * 0.5], [lx + Math.abs(sp * 0.5), o], [-t, o]];
    const right = left.map(([x, y]) => [-x, y]);
    [top, bottom, left, right].forEach((pts, k) => addTrace(pts, 1, 0, [{ arrive: Q.boot - 0.06 + lag + k * 0.012 }]));
  });
  // a bus: `k` traces side by side along a route that ends toward the processor, each with its signals; an avenue's lit
  // a little along its length (`base`), a street's dark but for its signals
  const bus = (main, k, gap, w, ring, speed, base) => {
    for (let i = 0; i < k; i++) {
      const sig = [];
      const ns = 1 + Math.floor(rnd() * 3);
      for (let q = 0; q < ns; q++) sig.push({ phase: rnd(), speed: speed * (0.75 + 0.5 * rnd()) });
      addTrace(offsetLine(main, (i - (k - 1) / 2) * gap), w, ring, sig, base * (0.5 + rnd()));
    }
  };
  // the parts: boxes on the board, lit from the upper left, many with status lights on top
  const part = (x, y, hx, hy, h, kind, ledP = 0.5) => {
    if (!clearOf(x - hx, y - hy, x + hx, y + hy)) return false;
    const leds = [];
    if (rnd() < ledP) {
      const n = 1 + Math.floor(rnd() * 4);
      for (let q = 0; q < n; q++) leds.push([x + (rnd() - 0.5) * hx * 1.5, y + (rnd() - 0.5) * hy * 1.5, rnd() < 0.72 ? C.cyan : rnd() < 0.6 ? C.white : C.orange, rnd()]);
    }
    parts.push({ x0: x - hx, y0: y - hy, x1: x + hx, y1: y + hy, h, kind, leds, r: Math.hypot(x, y) });
    return true;
  };
  // the city's towers: a block's ground parted into lots, a tower on each (taller toward the city's heart), its windows
  // a grid of floors and bays (`fl` units a floor), some lit; the tallest with a red beacon on its roof
  const towers = [];
  const tower = (x0, y0, x1, y1, h, fl) => {
    if (Math.max(Math.abs(x0), Math.abs(x1)) < 70 && Math.max(Math.abs(y0), Math.abs(y1)) < 70) return;
    if (!(x1 < -60 || x0 > 60 || y1 < -60 || y0 > 60)) return; // (the heart: its own tower)
    towers.push({ x0, y0, x1, y1, h, fl, seed: Math.floor(rnd() * 1e9), beacon: rnd() < 0.35 && h > fl * 14, r: Math.hypot((x0 + x1) / 2, (y0 + y1) / 2) });
  };
  const lots = (x0, y0, x1, y1, cell) => {
    const r = Math.hypot((x0 + x1) / 2, (y0 + y1) / 2);
    const downtown = 1 + 1.3 * Math.exp(-r / 1600);
    const nx = 1 + Math.floor(rnd() * 2.6);
    const ny = 1 + Math.floor(rnd() * 2.6);
    const fl = cell * (cell > 300 ? 0.034 : 0.05);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const lx0 = x0 + ((x1 - x0) * i) / nx;
        const lx1 = x0 + ((x1 - x0) * (i + 1)) / nx;
        const ly0 = y0 + ((y1 - y0) * j) / ny;
        const ly1 = y0 + ((y1 - y0) * (j + 1)) / ny;
        const sb = Math.min(lx1 - lx0, ly1 - ly0) * 0.1;
        const h = cell * (0.16 + 0.8 * rnd() ** 1.7) * downtown;
        tower(lx0 + sb, ly0 + sb, lx1 - sb, ly1 - sb, h, fl);
      }
    }
  };
  // the board laid out like a city: avenues of traces on a grid (every `cell` units), blocks between them, each with its
  // parts and a street or two; a finer grid round the processor, a coarser one beyond (`hole`: the finer grid's square)
  const grid = (cell, outer, hole, ring) => {
    const sc = cell / 160;
    const n = Math.floor(outer / cell);
    const lines = [];
    for (let a = -n; a < n; a++) lines.push((a + 0.5) * cell);
    for (const along of [0, 1]) {
      for (const c of lines) {
        // the line's runs, cut where it crosses the hole or the frame at rest, each toward the processor
        const runs = [];
        const cut = Math.abs(c) < hole ? hole : 0;
        for (const side of [-1, 1]) {
          let near = cut * side;
          const far = outer * side;
          // (round the frame at rest: a line along x is cut where it crosses it, x0 to x1; a line along y, y0 to y1)
          const [lo, hi] = along ? [CLEAR.x0, CLEAR.x1] : [CLEAR.y0, CLEAR.y1];
          if (ring === 1 && c > lo - 30 && c < hi + 30) near = along ? (side > 0 ? CLEAR.y1 : CLEAR.y0) + side * 30 : (side > 0 ? CLEAR.x1 : CLEAR.x0) + side * 30;
          if (Math.abs(far - near) < cell) continue;
          runs.push([far, near]);
        }
        for (const [far, near] of runs) {
          const k = ring === 2 ? 4 + Math.floor(rnd() * 7) : 3 + Math.floor(rnd() * 5);
          const gap = 3.6 * sc;
          // now and then a 45-degree jog half way
          const mid = (far + near) / 2;
          const j = rnd() < 0.4 ? (rnd() < 0.5 ? -1 : 1) * cell * 0.12 : 0;
          const dir = Math.sign(near - far);
          const pts = j ? [[far, c], [mid, c], [mid + dir * Math.abs(j), c + j], [near, c + j]] : [[far, c], [near, c]];
          bus(pts.map(([u, v]) => (along ? [v, u] : [u, v])), k, gap, (ring === 2 ? 1.1 : 1.5) * sc, ring, 420 * sc, ring === 2 ? 0.9 : 1.2);
        }
      }
    }
    // the blocks
    for (let i = -n; i < n - 1; i++) {
      for (let jj = -n; jj < n - 1; jj++) {
        const x0 = (i + 0.5) * cell;
        const y0 = (jj + 0.5) * cell;
        const cx = x0 + cell / 2;
        const cy = y0 + cell / 2;
        if (Math.abs(cx) < hole && Math.abs(cy) < hole) continue;
        // the city's block first: its towers between the avenues
        const m = cell * 0.17;
        lots(x0 + m, y0 + m, x0 + cell - m, y0 + cell - m, cell);
        const r = rnd();
        const u = cell * 0.5;
        if (r < 0.3) {
          const h = u * (0.28 + rnd() * 0.4);
          part(cx + (rnd() - 0.5) * u * 0.4, cy + (rnd() - 0.5) * u * 0.4, h, h * (0.7 + rnd() * 0.6), u * (0.05 + rnd() * 0.05), 'chip', 0.7);
        } else if (r < 0.52) {
          // a row of capacitors
          const m = 3 + Math.floor(rnd() * 5);
          const cs = u * 0.07;
          for (let q = 0; q < m; q++) part(cx - u * 0.5 + q * cs * 3, cy + (rnd() - 0.5) * u * 0.5, cs, cs, u * (0.2 + rnd() * 0.12), 'cap', 0.25);
        } else if (r < 0.68) {
          // a bank of memory: sticks side by side
          const m = 3 + Math.floor(rnd() * 4);
          const vert = rnd() < 0.5;
          for (let q = 0; q < m; q++) {
            const o = (q - (m - 1) / 2) * u * 0.16;
            if (vert) part(cx + o, cy, u * 0.035, u * 0.62, u * 0.3, 'stick', 0.6);
            else part(cx, cy + o, u * 0.62, u * 0.035, u * 0.3, 'stick', 0.6);
          }
        } else if (r < 0.76) {
          part(cx, cy, u * 0.5, u * 0.45, u * 0.4, 'sink', 0.3);
        } else {
          // a street across the block and a few small chips along it
          const vert = rnd() < 0.5;
          const a0 = -u * 0.9;
          const a1 = u * 0.9;
          const off = (rnd() - 0.5) * u * 0.6;
          const jg = (rnd() < 0.5 ? -1 : 1) * u * 0.25;
          const pts = [[a0, off], [-u * 0.2, off], [-u * 0.2 + Math.abs(jg), off + jg], [a1, off + jg]];
          const toward = vert ? cy > 0 : cx > 0; // run toward the processor
          const route = pts.map(([pu, pv]) => (vert ? [cx + pv, cy + (toward ? -pu : pu)] : [cx + (toward ? -pu : pu), cy + pv]));
          if (clearOf(Math.min(...route.map((p) => p[0])), Math.min(...route.map((p) => p[1])), Math.max(...route.map((p) => p[0])), Math.max(...route.map((p) => p[1])))) {
            bus(route, 3 + Math.floor(rnd() * 3), 2.6 * sc, 0.9 * sc, ring, 300 * sc, 0);
          }
          for (let q = 0; q < 3; q++) part(cx + (rnd() - 0.5) * u, cy + (rnd() - 0.5) * u, u * 0.1, u * 0.1, u * 0.04, 'chip', 0.5);
        }
      }
    }
  };
  grid(160, 1760, 0, 1);
  grid(560, 8400, 1760, 2);
  // the heart: the city's tallest tower, standing over the processor
  towers.push({ x0: -B + 2, y0: -B + 2, x1: B - 2, y1: B - 2, h: 760, fl: 9, seed: 777, beacon: true, r: 0, heart: true });
  traces.forEach((tr, i) => {
    tr.lane = i % 2; // in the city: headlights (0) or tail lights (1)
  });
  BOARD = { traces, parts, vias, towers };
  return BOARD;
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
// The light: the copper's glint and the signals' cyan, each line spread over the pixels it crosses by the share of
// them it covers

const COPPER = new Float32Array(NPX);
const GLOW = new Float32Array(NPX);
const WARM = new Float32Array(NPX); // the city's light: its street lamps, its headlights, its windows' glow
const RED = new Float32Array(NPX); // its tail lights
const COPPER_K = 0.9; // a unit-wide trace's glint, seen a unit a pixel
const LIT = 4.4; // a lit trace's light (the cyan rung)
const HEAD = 16; // a signal's head
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
// how a stretch's light falls: the copper (the board's alone), an avenue's own light (the city's street lamps, the
// board's cyan), a signal (a car's lights in the city, the board's cyan), or the board's cyan alone
const COPPERY = 0;
const STREET = 1;
const SIGNAL = 2;
const CYANLY = 3;
let BEAT_NOW = 0;
let LANE = 0;
// a stretch of a trace on the board, from (x0, y0) to (x1, y1), its light va to vb along it (per unit of width seen at
// a pixel), `w` units wide; each pixel's share split between the city's light and the board's by the wave where it lies
function boardLine(c, mode, x0, y0, x1, y1, va, vb, w, minCov = 0) {
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
  // the ends on the board (for the wave)
  const wxa = x0 + (x1 - x0) * ta;
  const wya = y0 + (y1 - y0) * ta;
  const wxb = x0 + (x1 - x0) * tb;
  const wyb = y0 + (y1 - y0) * tb;
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / 0.7));
  const step = len / n;
  const nx = len > 0 ? -(by - ay) / len : 0;
  const ny = len > 0 ? (bx - ax) / len : 0;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const wp = wa + (wb - wa) * f;
    let v = (v0 + (v1 - v0) * f) * Math.max(step, 0.35) * (i === 0 || i === n ? 0.5 : 1);
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    // where this pixel lies on the board (the screen's fraction made true to the perspective), and so the wave's state
    let mo = 1;
    if (mode !== CYANLY) {
      const t = f / zb / ((1 - f) / za + f / zb);
      mo = morphAt(Math.hypot(wxa + (wxb - wxa) * t, wya + (wyb - wya) * t), BEAT_NOW);
    }
    let cov = 1;
    if (wp <= 1.25) cov = Math.max(minCov, Math.min(1, wp));
    v *= cov;
    const m = wp <= 1.25 ? 1 : Math.min(5, Math.round(wp));
    for (let q = 0; q < m; q++) {
      const o = q - (m - 1) / 2;
      const px = x + nx * o;
      const py = y + ny * o;
      if (mode === COPPERY) {
        if (mo > 0) splat(COPPER, px, py, v * mo);
      } else if (mode === CYANLY) {
        splat(GLOW, px, py, v);
      } else {
        if (mo > 0) splat(GLOW, px, py, v * mo);
        if (mo < 1) splat(mode === SIGNAL && LANE ? RED : WARM, px, py, v * (1 - mo) * (mode === STREET ? 0.8 : 1));
      }
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
function stretch(c, mode, tr, s0, s1, va, vb, minCov = 0) {
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
    boardLine(c, mode, PA[0], PA[1], PB[0], PB[1], va + (vb - va) * fa, va + (vb - va) * fb, tr.w, minCov);
    from = to;
  }
}

const TAIL = [0, 150, 520]; // each ring's trail, in units (the processor's own run in whole)
function lightBoard(c, b) {
  const { traces } = board();
  COPPER.fill(0);
  GLOW.fill(0);
  WARM.fill(0);
  RED.fill(0);
  BEAT_NOW = b;
  for (const tr of traces) {
    LANE = tr.lane;
    // the copper, the whole trace (the board's: where the wave has passed)
    stretch(c, COPPERY, tr, 0, tr.len, COPPER_K, COPPER_K);
    if (tr.ring === 0) {
      // the processor's own: one signal runs in from its far end and reaches the pin on the stroke, the trace lit behind
      // it; then small pulses keep running in
      const { arrive } = tr.sig[0];
      const run = Math.max(0.3, tr.len / 520); // 520 units a beat: in sight for the last third of a beat or so
      const p = (b - (arrive - run)) / run;
      if (p <= 0) continue;
      const head = tr.len * Math.min(1, p);
      stretch(c, SIGNAL, tr, 0, head, LIT * 0.55, LIT);
      if (p < 1) stretch(c, SIGNAL, tr, head - 40, head, LIT, HEAD);
      else {
        // after the boot: pulses keep running in, one every three quarters of a beat, each trace at its own time
        const q = ((b - arrive) / 0.75 + tr.xs[0] * 0.0137) % 1;
        const s = tr.len * q;
        stretch(c, CYANLY, tr, s - 50, s, LIT, LIT * 2.4);
      }
      continue;
    }
    if (tr.base > 0) stretch(c, STREET, tr, 0, tr.len, tr.base, tr.base, 0.25);
    for (const sg of tr.sig) {
      // a signal running in, again and again (its period the trace's length and its trail)
      const tail = TAIL[tr.ring];
      const period = tr.len + tail;
      const s = ((sg.phase * period + b * sg.speed) % period + period) % period;
      stretch(c, SIGNAL, tr, s - tail, s, 0, TRAIL, 0.5);
      if (s <= tr.len) stretch(c, SIGNAL, tr, s - Math.min(12, tail * 0.05), s, TRAIL, HEAD, 0.7);
    }
  }
  // the wave's front: a ring of cyan light on the ground, and a fainter one just inside it
  const R = (b - Q.wave) * WAVE_V;
  if (R > 0 && R < 9000) {
    const fade = 1 - sstep(4000, 9000, R);
    const seg = Math.min(256, 48 + Math.round(R / 25));
    for (const [rr, v, w] of [[R, 10 * fade, 6 + R * 0.008], [R - 30, 4 * fade, 5 + R * 0.006], [R - 70, 1.6 * fade, 4 + R * 0.004]]) {
      if (rr <= 0) continue;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2;
        const a1 = ((k + 1) / seg) * Math.PI * 2;
        boardLine(c, CYANLY, Math.cos(a0) * rr, Math.sin(a0) * rr, Math.cos(a1) * rr, Math.sin(a1) * rr, v, v, w, 1);
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

// the palette's ramps, dark to light: the signals' cyan, the copper's, the city's warm light and its tail lights
const CYAN = [C.black, C.ink, C.navy, C.blue, C.cyan, C.white];
const COPPER_RAMP = [C.black, C.ink, C.slate, C.steel];
const WARM_RAMP = [C.black, C.maroon, C.brown, C.rust, C.orange, C.yellow, C.cream, C.white];
const RED_RAMP = [C.black, C.maroon, C.darkRed, C.red, C.pink];
const GMAX = Math.log1p(7.4); // a lit trace (LIT) on the cyan rung
const WMAX = Math.log1p(9);
const CMAX = 1.35; // a unit-wide trace's glint on the slate rung
const SKY = [C.black, C.ink, C.navy];
const CITY_SKY = [C.black, C.maroon, C.brown]; // the glow a city throws on the haze over it
function develop(d, c, b) {
  const hy = c.hy;
  // the far reaches turn last: the horizon's haze stays the city's until the wave has gone that far
  const far = morphAt(4000, b);
  for (let y = 0; y < VH; y++) {
    // the sky over the horizon (black to a glow at it) and, under it, the far reaches a haze
    const above = hy - (y + 0.5);
    const sky = above > 0 ? Math.exp(-above / 11) * 1.35 : -1;
    const haze = above <= 0 ? Math.exp(above / 8) * 0.6 : 0;
    const skyRamp = far < 0.5 ? CITY_SKY : SKY;
    for (let x = 0; x < VW; x++) {
      const i = y * VW + x;
      const t = ditherAt(x, y) / 16;
      if (sky >= 0) {
        d[i] = skyRamp[Math.min(2, Math.floor(sky + t))];
        continue;
      }
      const gi = (Math.log1p(GLOW[i] + haze * far) / GMAX) * 4; // cyan: 4 is the cyan rung
      const wi = (Math.log1p(WARM[i] + haze * (1 - far)) / WMAX) * 6; // warm: 5 is yellow
      const ri = (Math.log1p(RED[i]) / WMAX) * 4;
      const ci = (COPPER[i] / CMAX) * 2;
      // the brightest of the four, on its own ramp
      const gf = gi / 4;
      const wf = wi / 5;
      const rf = ri / 3.3;
      const cf = ci / 2.6;
      if (gf >= wf && gf >= rf && gf >= cf) d[i] = CYAN[Math.min(5, Math.floor(gi + t))];
      else if (wf >= rf && wf >= cf) d[i] = WARM_RAMP[Math.min(7, Math.floor(wi + t))];
      else if (rf >= cf) d[i] = RED_RAMP[Math.min(4, Math.floor(ri + t))];
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
function face(d, c, wx, wy, wz, n, col) {
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
  fillPoly(d, PX, PY, m, col);
  return true;
}
function fillPoly(d, xs, ys, n, col) {
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
    for (let x = a; x <= e; x++) d[row + x] = col;
  }
}
const WX = new Float64Array(4);
const WY = new Float64Array(4);
const WZ = new Float64Array(4);
// a flat rectangle at height z
function rectAt(d, c, x0, y0, x1, y1, z, col) {
  WX[0] = x0; WY[0] = y0;
  WX[1] = x1; WY[1] = y0;
  WX[2] = x1; WY[2] = y1;
  WX[3] = x0; WY[3] = y1;
  WZ.fill(z);
  return face(d, c, WX, WY, WZ, 4, col);
}
// an upright side from (xa, ya) to (xb, yb), z0 to z1
function sideAt(d, c, xa, ya, xb, yb, z0, z1, col) {
  WX[0] = xa; WY[0] = ya; WZ[0] = z0;
  WX[1] = xb; WY[1] = yb; WZ[1] = z0;
  WX[2] = xb; WY[2] = yb; WZ[2] = z1;
  WX[3] = xa; WY[3] = ya; WZ[3] = z1;
  return face(d, c, WX, WY, WZ, 4, col);
}

// a part: its sides toward the camera (the north and west lit, the south and east in shade), its top, its rim lit
// along the key edges, its status lights
const LP = [0, 0, 0];
function drawPart(d, c, p, b, size) {
  const { x0, y0, x1, y1, h } = p;
  if (size < 7) {
    // a few pixels across: its top alone, a dark block (no rim to make a glyph of it)
    rectAt(d, c, x0, y0, x1, y1, h, size < 3.5 ? C.black : C.ink);
    if (p.leds.length) lights(d, c, p, b);
    return;
  }
  if (c.py < y0) sideAt(d, c, x0, y0, x1, y0, 0, h, C.black); // south face
  if (c.py > y1) sideAt(d, c, x0, y1, x1, y1, 0, h, C.ink); // north face
  if (c.px < x0) sideAt(d, c, x0, y0, x0, y1, 0, h, C.ink); // west face
  if (c.px > x1) sideAt(d, c, x1, y0, x1, y1, 0, h, C.black); // east face
  rectAt(d, c, x0, y0, x1, y1, h, p.kind === 'sink' ? C.ink : C.black);
  // the key edges: a sliver of the top along its north and west sides (steel close to, slate further off)
  const e = Math.max(1.2, Math.min(x1 - x0, y1 - y0) * 0.04);
  toCam(c, (x0 + x1) / 2, (y0 + y1) / 2, h, LP);
  const rim = LP[2] < 1200 ? C.steel : C.slate;
  rectAt(d, c, x0, y1 - e, x1, y1, h, rim);
  rectAt(d, c, x0, y0, x0 + e, y1, h, rim);
  if (p.kind === 'sink') {
    // the fins: dark grooves across its top
    const n = 7;
    for (let k = 1; k < n; k++) {
      const yy = y0 + ((y1 - y0) * k) / n;
      rectAt(d, c, x0 + e, yy - 4, x1 - e, yy + 4, h, C.black);
    }
  } else if (p.kind === 'cap') {
    // the vent cross on a can's top
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const s = (x1 - x0) * 0.08;
    rectAt(d, c, x0 + e, my - s, x1 - e, my + s, h, C.slate);
    rectAt(d, c, mx - s, y0 + e, mx + s, y1 - e, h, C.slate);
  }
  lights(d, c, p, b);
}
function lights(d, c, p, b) {
  const { h } = p;
  for (const [lx, ly, col, ph] of p.leds) {
    // a status light: steady, or blinking at its own rate
    if (ph > 0.6 && ((b * (1 + ph * 2) + ph * 7) % 1) > 0.55) continue;
    toCam(c, lx, ly, h, LP);
    if (LP[2] < NEAR) continue;
    const x = Math.round(sxOf(LP) - 0.5);
    const y = Math.round(syOf(LP) - 0.5);
    if (x < 1 || y < 1 || x >= VW - 1 || y >= VH - 1) continue;
    d[y * VW + x] = col;
    if (LP[2] < 900) {
      const halo = col === C.cyan ? C.blue : col === C.orange ? C.rust : C.fog;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (d[(y + dy) * VW + x + dx] !== col) d[(y + dy) * VW + x + dx] = halo;
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
function ringAt(d, c, x, y, r, col) {
  for (let k = 0; k < 8; k++) {
    VX8[k] = x + Math.cos((k + 0.5) * (Math.PI / 4)) * r;
    VY8[k] = y + Math.sin((k + 0.5) * (Math.PI / 4)) * r;
  }
  return face(d, c, VX8, VY8, VZ8, 8, col);
}
function drawVias(d, c, b) {
  const lit = b >= Q.boot - 0.25;
  for (const [x, y] of board().vias) {
    ringAt(d, c, x, y, 2.7, lit ? C.cyan : C.slate);
    ringAt(d, c, x, y, 1.2, C.black);
  }
}

// a tower of the city: its sides toward the camera dark, its windows lit here and there, a dark roof; as the wave
// reaches it the lights go out and it sinks into the board, its roof's edge lit cyan as it goes
const WIN = [C.cream, C.cream, C.yellow, C.cream, C.yellow, C.white, C.orange, C.cream];
const WP = [0, 0, 0];
const hash = (a, b2, c2, d2) => {
  let h = (a ^ (b2 * 374761393) ^ (c2 * 668265263) ^ (d2 * 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function drawTower(d, c, t, b, size) {
  const m = morphAt(t.r, b);
  const k = 1 - sstep(0, 0.6, m);
  if (k <= 0.01) return;
  const h = t.h * k;
  const { x0, y0, x1, y1 } = t;
  // the share of its windows lit (the heart's, most of them; in the beat before the wave leaves it, its windows turn cyan
  // from the top down, and it goes on lit as it sinks)
  const lit = t.heart ? 0.75 : 0.42 * (1 - sstep(0, 0.3, m));
  const boot = t.heart ? (b - (Q.wave - 0.5)) / 0.45 : -1;
  const sides = [];
  if (c.py < y0) sides.push([x0, y0, x1, y0, 0]);
  if (c.py > y1) sides.push([x1, y1, x0, y1, 1]);
  if (c.px < x0) sides.push([x0, y1, x0, y0, 2]);
  if (c.px > x1) sides.push([x1, y0, x1, y1, 3]);
  for (const [xa, ya, xb, yb, fi] of sides) {
    sideAt(d, c, xa, ya, xb, yb, 0, h, C.black);
    if (lit <= 0.01 || size < 3) continue;
    // its windows: floors of `fl` units, bays as wide; on the frame never closer than two pixels (far off, every
    // second or third of them)
    const w = Math.hypot(xb - xa, yb - ya);
    toCam(c, (xa + xb) / 2, (ya + yb) / 2, h / 2, WP);
    if (WP[2] < NEAR) continue;
    const px = (F * t.fl) / WP[2];
    const stepN = px >= 2 ? 1 : Math.ceil(2 / Math.max(0.2, px));
    const floors = Math.floor(t.h / t.fl);
    const bays = Math.max(1, Math.floor(w / t.fl));
    for (let f = 1; f < floors; f += stepN) {
      const z = f * t.fl;
      if (z > h - t.fl * 0.5) break;
      for (let q = 0; q < bays; q += stepN) {
        const hv = hash(t.seed, fi, f, q);
        if (hv >= lit) continue;
        const u = (q + 0.5) / bays;
        toCam(c, xa + (xb - xa) * u, ya + (yb - ya) * u, z, WP);
        if (WP[2] < NEAR) continue;
        const sx = Math.round(sxOf(WP) - 0.5);
        const sy = Math.round(syOf(WP) - 0.5);
        if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
        d[sy * VW + sx] = boot > 1 - z / t.h ? (hv < 0.2 ? C.white : C.cyan) : WIN[Math.floor(hv * 97) % WIN.length];
      }
    }
  }
  rectAt(d, c, x0, y0, x1, y1, h, C.black);
  if (size > 10 && m <= 0) {
    // the roof's lit edge (the key side), close to
    const e = Math.max(1, Math.min(x1 - x0, y1 - y0) * 0.04);
    rectAt(d, c, x0, y1 - e, x1, y1, h, C.ink);
    rectAt(d, c, x0, y0, x0 + e, y1, h, C.ink);
  }
  if (m > 0 && m < 0.6 && size > 4) {
    // the wave's light on its roof's edge as it sinks
    const e = Math.max(1, Math.min(x1 - x0, y1 - y0) * 0.06);
    rectAt(d, c, x0, y1 - e, x1, y1, h, C.cyan);
    rectAt(d, c, x0, y0, x0 + e, y1, h, C.cyan);
    rectAt(d, c, x0, y0, x1, y0 + e, h, C.blue);
    rectAt(d, c, x1 - e, y0, x1, y1, h, C.blue);
  }
  if (t.beacon && m < 0.2 && Math.floor(b * 1.5 + t.seed) % 2 === 0) {
    toCam(c, (x0 + x1) / 2, (y0 + y1) / 2, h + 1, WP);
    if (WP[2] > NEAR) {
      const sx = Math.round(sxOf(WP) - 0.5);
      const sy = Math.round(syOf(WP) - 0.5);
      if (sx > 0 && sy > 0 && sx < VW - 1 && sy < VH - 1) {
        d[sy * VW + sx] = C.red;
        if (WP[2] < 1500) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) d[(sy + dy) * VW + sx + dx] = C.darkRed;
      }
    }
  }
}

// the towers, the parts and the processor, far to near (the parts rise out of the board once the towers have sunk)
const ORDER = [];
const MID = [0, 0, 0];
const TOWER = 1;
const PART = 2;
function queue(c, x0, y0, x1, y1, h, kind, item) {
  toCam(c, (x0 + x1) / 2, (y0 + y1) / 2, h / 2, MID);
  const r = Math.max(x1 - x0, y1 - y0, h);
  if (MID[2] < -r) return;
  if (MID[2] > NEAR) {
    const sx = sxOf(MID);
    const sy = syOf(MID);
    const sr = (F * r) / MID[2];
    if (sx + sr < 0 || sx - sr > VW || sy + sr < 0 || sy - sr > VH) return;
  }
  ORDER.push([MID[2], kind, item, MID[2] > NEAR ? (F * Math.max(x1 - x0, y1 - y0, h)) / MID[2] : 99]);
}
function drawSolids(d, c, b) {
  const { parts, towers } = board();
  ORDER.length = 0;
  for (const t of towers) {
    if (morphAt(t.r, b) >= 0.6) continue;
    queue(c, t.x0, t.y0, t.x1, t.y1, t.h, TOWER, t);
  }
  for (const p of parts) {
    if (morphAt(p.r, b) <= 0.45) continue;
    queue(c, p.x0, p.y0, p.x1, p.y1, p.h, PART, p);
  }
  toCam(c, 0, 0, 0, MID);
  ORDER.push([MID[2] + 1, 0, null, 0]); // (the processor under its tower)
  ORDER.sort((u, v) => v[0] - u[0]);
  for (const [, kind, item, size] of ORDER) {
    if (kind === TOWER) drawTower(d, c, item, b, size);
    else if (kind === PART) {
      const rise = sstep(0.45, 1, morphAt(item.r, b));
      if (rise >= 0.999) drawPart(d, c, item, b, size);
      else {
        RISEN.x0 = item.x0;
        RISEN.y0 = item.y0;
        RISEN.x1 = item.x1;
        RISEN.y1 = item.y1;
        RISEN.h = item.h * rise;
        RISEN.kind = item.kind;
        RISEN.leds = rise > 0.8 ? item.leds : NONE;
        drawPart(d, c, RISEN, b, size * rise);
      }
    } else drawChip(d, c, b);
  }
}
const RISEN = { x0: 0, y0: 0, x1: 0, y1: 0, h: 0, kind: '', leds: [] };
const NONE = [];

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
  lightBoard(c, b);
  bloom(GLOW);
  bloom(WARM);
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
  warm: () => [board(), letters()],
});
/** The camera at beat b (for checks): { d, pitch, yaw } (units, radians). */
export const techIntroCamera = (b) => ({ d: Math.exp(LN_D(b)), pitch: PITCH(b), yaw: YAW(b) });
/** The processor's top-face scale on the frame at beat b, in pixels a unit (1 overhead at rest). */
export const techIntroScale = (b) => F / (Math.exp(LN_D(b)) - CH);
/** The logotype's box at rest (for checks): { x0, x1, y0, y1 } of TECH and BYTES together. */
export function techIntroTitle() {
  const ls = letters();
  return { x0: ls[0].x - 1, x1: ls.at(-1).x + ls.at(-1).w * SC, y0: TOP - 1, y1: BYTES_Y + 14 };
}
/** The processor's traces on the frame at rest: where each crosses the logotype's rows (for checks). */
export function techIntroTraces() {
  return board().traces.filter((tr) => tr.ring === 0);
}

// NEWS IN 60's title sequence (owner, 9 Oct: the other programmes' opens "as crafted" as WORLD
// NOW's). Under seven seconds on the programme's grid (cues.js, 120 BPM): the minute starts.
//
//   THE PUSHER  beats 0-1    close on the top of the stopwatch: the pusher over the bezel, the
//                            twelve o'clock tick under it; on beat 1 the pusher goes down
//   THE MINUTE  1-7          the hand sets off and makes one turn, a five-minute tick passing on
//                            every eighth (the bed's tock on the beat, its tick off it), lighting
//                            each tick as it goes, while the camera pulls back from the pusher to
//                            the whole dial at centre stage; the hand stops dead at twelve
//   SIXTY       7.5          "60" lights, as on the emblem
//   TITLE       8.7-12       the package's reveal; still for the last 0.8 s
//
// The stopwatch is the emblem's own (flash.js): its bands (face, inner wall, bezel, ticks, the hand
// and the crown) are sized in proportion when it is big and in the emblem's own pixels when it is
// small, so the close-up is a machined object and the wide shot is the emblem; from the settle on
// it is the emblem's drawing (tested), so the hand-over never pops. Every frame is the average of
// up to six instants within half a frame (the shutter), dithered on the screen's matrix: the pull-
// back and the hand blur where they move fast instead of strobing.
import { P } from '../../palette.js';
import { u32, clamp, seg, smoothstep, easeOut } from '../../gfx/index.js';
import { W, H, CENTRE, ZOOM } from './kit.js';
import { FLASH, R0, drawDial } from './flash.js';
import { track, sequence, Layer, ditherAt } from './seq.js';
import { CUES, hitOf } from './cues.js';

const ID = 'news-60';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
const HIT = hitOf(ID);
const TAU = Math.PI * 2;
const C = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, u32(v)]));
const RE = Math.round(R0 * ZOOM); // the tick ring's radius at centre stage (51 px)

// ---------------------------------------------------------------------------------------------
// The camera: s = the tick ring's radius in pixels; (FX, FY) = the dial point at screen centre, in
// tick-ring units. Close on the pusher, then a pull-back that eases onto the emblem at centre stage.

const SETTLE = 6.5; // beats: the dial is the emblem from here (the hand still turning to twelve)
// (locked off on the pusher until it goes down: a still close-up holds still; then never faster than a
// few pixels a frame)
const S = track([[0, Math.log(430)], [Q.press, Math.log(430)], [2.5, Math.log(190)], [4, Math.log(100)], [5.5, Math.log(62)], [SETTLE, Math.log(RE)], [SETTLE + 2, Math.log(RE)]]);
const FY = track([[0, -1.06], [Q.press, -1.06], [2.5, -0.7], [4, -0.22], [5.5, -0.04], [SETTLE, 0], [SETTLE + 2, 0]]);
const FX = track([[0, 0], [Q.press, 0], [2.6, 0.1], [4, 0.05], [SETTLE, 0], [SETTLE + 2, 0]]);
const scaleAt = (b) => Math.exp(S(b));

/** The hand, in turns: still until the pusher goes down, one turn in six beats, stopped at twelve. */
const handAt = (b) => clamp((b - Q.press) / (Q.turn - Q.press), 0, 1);
/** The pusher's travel (0 up .. 1 down): down on the beat, back up after it. */
const pressAt = (b) => (b < Q.press ? easeOut(seg(b, Q.press - 0.22, 0.22)) : 1 - easeOut(seg(b, Q.press + 0.05, 0.35)));
/** "60" lights as on the emblem: slate, orange, yellow (a frame or two each), like an LCD coming on. */
function digitsAt(b) {
  const t = (b - Q.sixty) * BEAT;
  return t < 0 ? null : t < 0.06 ? P.slate : t < 0.12 ? P.orange : P.yellow;
}

// ---------------------------------------------------------------------------------------------
// The stopwatch at any size. Bands in pixels: proportional when big, the emblem's when small.

const LIGHT = [-Math.SQRT1_2, -Math.SQRT1_2]; // the channel's key light: upper left
const SP = [{}]; // scratch parameters (checks)

function params(o, b) {
  const s = scaleAt(b);
  o.s = s;
  o.fx = FX(b);
  o.fy = FY(b);
  // every band is the emblem's own pixels at centre stage and grows in proportion beyond it
  const g = Math.max(0, s - RE);
  // face, inner wall, bezel (the emblem: face disc R + 0.45, rings at R + 1 and R + 2)
  o.E0 = s + 0.45;
  o.E1 = o.E0 + 1.05 + 0.02 * g;
  o.E2 = o.E1 + 1 + 0.026 * g;
  // ticks: minutes at R - 2, fives at R - 2 and R - 3, a pixel wide
  o.tOut = s - 1.5 - 0.029 * g;
  o.tMin = s - 2.5 - 0.049 * g;
  o.tFive = s - 3.5 - 0.075 * g;
  o.tHw = 0.5 + 0.0065 * g;
  // the hand: tip at R - 8 (R - 5k), a 2 px tail, 1 px wide; tapered and ridged when big
  o.tip = s - 8 - 0.157 * g;
  o.tail = 2 + 0.07 * g;
  o.hw = 0.5 + 0.011 * g;
  o.hub = 1.5 + 0.032 * g;
  o.a = handAt(b);
  o.a0 = o.a;
  o.lit = o.a >= 1 ? 60 : Math.floor(60 * o.a + 1e-6);
  o.home = o.a >= 1;
  o.hx = Math.sin(o.a * TAU);
  o.hy = -Math.cos(o.a * TAU);
  // the crown: a 3 px stem and an 11 px button, 3 px each, over a 1 px gap (the emblem's at k 1.6)
  o.gap = 1 - smoothstep(RE, 110, s);
  o.stemH = 3 + 0.062 * g;
  o.btnH = 3 + 0.058 * g;
  o.sw = 1.5 + 0.03 * g;
  o.bw = 5.5 + 0.108 * g;
  o.press = pressAt(b) * 0.45 * o.stemH;
  // what only a close-up carries: the metal's modelling (fine), and its finest detail (the minute
  // track's rules and fifths, the knurling), which also goes while the camera moves fast
  o.fine = smoothstep(120, 260, s);
  o.detail = o.fine;
  // within two pixels of centre stage: the emblem's own rasterisation (midpoint rings, rounded tick
  // points, a line between rounded ends) about the nearest whole pixel, so it lands without a seam
  o.exact = g < 2;
  o.cx = Math.round(CENTRE.x - o.fx * s);
  o.cy = Math.round(CENTRE.y - o.fy * s);
  return o;
}

// steel as a ramp (black .. white), quantised through the screen's matrix with short dithered edges
const METAL = [C.black, C.slate, C.steel, C.fog, C.silver, C.white];
function metal(v, X, Y) {
  if (v <= 0) return METAL[0];
  if (v >= 5) return METAL[5];
  const k = v | 0;
  const t = (v - k - 0.65) / 0.35;
  return METAL[k + (t > 0 && ditherAt(X, Y) < t * 16 ? 1 : 0)];
}
// the emblem's colours on that ramp
const V_SLATE = 1.3;
const V_STEEL = 2.3;
const V_SILVER = 4.3;

/** A midpoint circle of radius r (the emblem's rings): rounding along the major axis. */
function onRing(px, py, r) {
  const ax = Math.abs(px);
  const ay = Math.abs(py);
  return ax >= ay ? Math.abs(ax - Math.sqrt(Math.max(0, r * r - ay * ay))) < 0.5 : Math.abs(ay - Math.sqrt(Math.max(0, r * r - ax * ax))) < 0.5;
}
/** Tick i's point at radius rr, rounded as the emblem places it. */
function onTick(px, py, i, rr) {
  const a = (i / 60) * TAU;
  return Math.abs(px - Math.round(Math.sin(a) * rr)) < 0.5 && Math.abs(py + Math.round(Math.cos(a) * rr)) < 0.5;
}
/** The emblem's hand, walked as flash.js walks it (Bresenham between the rounded ends) into a mask. */
const HAND = new Uint8Array(W * H);
const HAND_PX = [];
function maskHand(o) {
  for (const k of HAND_PX) HAND[k] = 0;
  HAND_PX.length = 0;
  let x0 = o.cx + Math.round(-o.hx * 2);
  let y0 = o.cy + Math.round(-o.hy * 2);
  const x1 = o.cx + Math.round(o.hx * (o.s - 8));
  const y1 = o.cy + Math.round(o.hy * (o.s - 8));
  const ax = Math.abs(x1 - x0);
  const ay = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = ax + ay;
  for (let i = 0; i < 256; i++) {
    if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) {
      HAND[y0 * W + x0] = 1;
      HAND_PX.push(y0 * W + x0);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= ay) {
      err += ay;
      x0 += sx;
    }
    if (e2 <= ax) {
      err += ax;
      y0 += sy;
    }
  }
}

/** The colour (u32) of the stopwatch at dial point (x, y) (tick-ring units from its centre), or 0. */
function shade(x, y, o, X, Y) {
  const s = o.s;
  const fine = o.fine;
  const r = Math.sqrt(x * x + y * y);
  const rp = r * s;
  const px = x * s;
  const py = y * s;
  // the crown, above the bezel at twelve (it rides down with the pusher)
  if (py < -o.E2 + 1 && Math.abs(px) <= o.bw + 0.5) {
    const base = -o.E2 - o.gap + 0.5 + o.press; // the stem's foot (the emblem's rows at its size)
    const stemTop = base - o.stemH;
    const btnTop = stemTop - o.btnH;
    if (py >= btnTop - 0.5 && py < stemTop - 0.5 && Math.abs(px) <= o.bw - 0.5 + fine) {
      // the button: steel, a silver lip on the lit half of its top, slate along its foot; close up, a
      // knurled cylinder lit from the upper left
      let v = py < btnTop + 0.5 && px < -0.5 ? V_SILVER : py >= stemTop - 1.5 ? V_SLATE : V_STEEL;
      if (fine > 0) {
        const xn = clamp(px / o.bw, -1, 1);
        const lit = -xn * 0.75 + Math.sqrt(1 - xn * xn) * 0.55; // the cylinder's normal against the light
        let f = 1.2 + 2.6 * clamp(lit, 0, 1.2);
        const g = (((px + o.bw) / Math.max(3, 0.016 * s)) % 1 + 1) % 1;
        if (g < 0.3) f -= 1.1 * o.detail; // the knurl's grooves
        if (py < btnTop + Math.max(1, 0.006 * s)) f += 1; // the top's edge
        if (py >= stemTop - Math.max(1.5, 0.01 * s)) f = 0.9; // its shadowed foot
        v += (f - v) * fine;
      }
      return metal(v, X, Y);
    }
    if (py >= stemTop - 0.5 && py < base - 0.5 && Math.abs(px) <= o.sw) {
      if (rp <= o.E2) return 0; // inside the case: hidden by the bezel below
      let v = V_STEEL;
      if (fine > 0) {
        const xn = clamp(px / o.sw, -1, 1);
        v += (1.1 + 2.4 * clamp(-xn * 0.75 + Math.sqrt(1 - xn * xn) * 0.55, 0, 1.2) - v) * fine;
      }
      return metal(v, X, Y);
    }
  }
  const d = r > 0 ? (x * LIGHT[0] + y * LIGHT[1]) / r : 0; // facing the key light (-1 .. 1)
  if (o.exact && rp > s - 0.5 && rp < s + 2.6) {
    // the emblem's rings: the bezel (R + 2) coloured by the key light, its inner wall (R + 1)
    if (onRing(px, py, s + 2)) {
      const lit = -px * 0.7 - py * 0.7;
      return lit > (s + 2) * 0.55 ? C.silver : lit < -(s + 2) * 0.45 ? C.slate : C.steel;
    }
    if (onRing(px, py, s + 1)) return px + py > 0 ? C.slate : C.black;
    if (rp > o.E0) return 0;
  }
  if (rp > o.E2) return 0;
  if (rp > o.E1 && !o.exact) {
    // the bezel: silver where it faces the key light, slate away from it, steel between; close up, a
    // polished convex ring (its crest catching the light, a dark lip at either edge)
    let v = d > 0.55 ? V_SILVER : d < -0.45 ? V_SLATE : V_STEEL;
    if (fine > 0) {
      const u = (rp - o.E1) / (o.E2 - o.E1);
      const crest = clamp(1 - ((u - 0.6) / 0.42) ** 2, 0, 1);
      let f = 1 + 2.4 * crest + 1.3 * d;
      if (d > 0.8 && Math.abs(u - 0.6) < 0.1) f = 5; // the glint
      if (u > 0.92 || u < 0.08) f = Math.min(f, 0.9);
      v += (f - v) * fine;
    }
    return metal(v, X, Y);
  }
  if (rp > o.E0 && !o.exact) return x + y > 0 ? C.slate : C.black; // the inner wall
  // the hub over the hand, the hand over the dial
  if (o.exact ? Math.abs(px) <= 1.5 && Math.abs(py) <= 1.5 : rp <= o.hub) {
    if (o.exact ? Math.abs(px) < 0.5 && Math.abs(py) < 0.5 : rp < Math.max(0.5, o.hub * 0.35)) return C.steel; // the hub's jewel
    return fine > 0 && rp > o.hub - 1.2 && d < 0 ? C.silver : C.white;
  }
  if (o.exact && HAND[Y * W + X]) return C.silver;
  const along = o.exact ? -1e9 : (x * o.hx + y * o.hy) * s;
  if (along > -o.tail - 0.5 && along < o.tip + 0.5) {
    const sp = (x * o.hy - y * o.hx) * s;
    const taper = s > RE ? 1.25 - 0.85 * clamp(along / o.tip, 0, 1) : 1;
    const hw = Math.max(0.5, o.hw * taper);
    if (Math.abs(sp) <= hw) {
      if (fine > 0 && hw > 1.5) return sp < -hw * 0.2 ? C.white : sp > hw * 0.55 ? C.steel : C.silver; // a ridged needle
      return C.silver;
    }
  }
  if (o.a0 < o.a && rp > o.hub && rp < o.tip && s > 64) {
    // inside the wedge the hand swept: covered in proportion to its width over the sweep
    const th = (Math.atan2(x, -y) / TAU + 1) % 1;
    if (th >= o.a0 && th <= o.a) {
      // (none on the emblem: the blur thins away as the dial comes down to its size)
      const cover = ((2 * Math.max(0.5, o.hw)) / ((o.a - o.a0) * TAU * rp)) * smoothstep(64, 100, s);
      if (cover * 16 > ditherAt(X, Y) + 0.5) return C.steel;
    }
  }
  // ticks: printed in luminous paint, raised a little (close up, a lit edge and a shaded one)
  if (rp >= o.tFive - 1 && rp <= o.tOut + 1) {
    const th = Math.atan2(x, -y);
    const fi = (th / TAU) * 60;
    const i = ((Math.round(fi) % 60) + 60) % 60;
    const sp = rp * Math.sin(((fi - Math.round(fi)) * TAU) / 60);
    const five = i % 5 === 0;
    const hit = o.exact
      ? onTick(px, py, i, s - 2) || (five && onTick(px, py, i, s - 3))
      : Math.abs(sp) <= o.tHw && rp >= (five ? o.tFive : o.tMin) - 0.5;
    if (hit) {
      const on = i < o.lit || (i === 0 && o.home);
      if (o.tHw >= 1.5) {
        // which side faces the light: the tangent at angle th is (cos th, sin th)
        const side = sp * -(Math.cos(th) + Math.sin(th));
        if (side > o.tHw * 0.45) return five ? (on ? C.cream : C.silver) : on ? C.fog : C.steel;
        if (side < -o.tHw * 0.45) return five ? (on ? C.orange : C.slate) : on ? C.slate : C.ink;
      }
      return five ? (on ? C.yellow : C.steel) : on ? C.steel : C.slate;
    }
    // the fifths between the minute ticks (close up only)
    if (o.detail > 0 && rp >= o.tMin && rp <= o.tOut) {
      const ff = fi * 5;
      const p2 = rp * Math.abs(Math.sin(((ff - Math.round(ff)) * TAU) / 300));
      if (p2 <= Math.max(0.5, o.tHw * 0.4) && ditherAt(X, Y) < o.detail * 13) return C.slate;
    }
  }
  if (o.detail > 0) {
    // the minute track's printed rules
    if ((Math.abs(rp - (o.tOut + 0.4 * (s - o.tOut))) < 0.5 || Math.abs(rp - (o.tFive - 0.02 * s)) < 0.5) && ditherAt(X, Y) < o.detail * 14) return C.slate;
  }
  return C.ink;
}

// ---------------------------------------------------------------------------------------------
// The sequence

const LAYER = new Layer('news-titles');
const SPF = 1 / 30; // a frame

function stopwatch(L, dt) {
  const b = dt / BEAT;
  const o = params(SP[0], b);
  // fine detail (rules, fifths, knurling) only where the camera is nearly still: moving, it would crawl
  const db = SPF / BEAT;
  const s0 = scaleAt(b - db);
  const pace = Math.abs(Math.log(o.s / s0)) * 200 + Math.hypot(o.fx - FX(b - db), o.fy - FY(b - db)) * o.s;
  o.detail = o.fine * clamp((4 - pace) / 2.5, 0, 1);
  // the hand's blur: the wedge it swept over the last two frames, thinned to its width there (each
  // pixel it crosses is covered alike on two frames running, so none lights for a single frame)
  o.a0 = handAt(b - 2 * db);
  if (o.exact) maskHand(o);
  const d = L.d;
  for (let Y = 0; Y < H; Y++) {
    const yu = o.exact ? (Y - o.cy) / o.s : o.fy + (Y - CENTRE.y) / o.s;
    for (let X = 0; X < W; X++) d[Y * W + X] = shade(o.exact ? (X - o.cx) / o.s : o.fx + (X - CENTRE.x) / o.s, yu, o, X, Y);
  }
}

function before(ctx, dt) {
  const b = dt / BEAT;
  ctx.drawImage(FLASH.background(), 0, 0);
  if (b >= SETTLE) {
    // the emblem itself, its hand finishing the turn, then "60"
    const a = handAt(b);
    drawDial(ctx, CENTRE.x, CENTRE.y, ZOOM, 1, true, a >= 1 ? 60 : Math.floor(60 * a + 1e-6), a >= 1, digitsAt(b), a);
    return;
  }
  LAYER.begin(0);
  stopwatch(LAYER, dt);
  LAYER.end(ctx);
}

// from the reveal on the package plays its open, the dial at rest ("60" lit) as the sequence left it
const REVEAL = { ...FLASH, emblem: (ctx, dt, x, y, k) => FLASH.emblem(ctx, Math.max(dt, 1.62), x, y, k) };
const SEQ = sequence({ hit: HIT, before, reveal: REVEAL });

/** NEWS IN 60's title sequence at dt seconds (full frame). */
export function drawNewsTitles(ctx, dt, info) {
  SEQ.draw(ctx, dt, info);
}

export const NEWS_TITLES = { ...FLASH, warmJobs: () => [...FLASH.warmJobs()] };
export const NEWS_SEQ = SEQ;
/** For checks: the camera (tick-ring radius in px, the dial point at screen centre) and the hand at beat b. */
export const newsCamera = (b) => ({ s: scaleAt(b), fx: FX(b), fy: FY(b), hand: handAt(b) });
/** For checks: the stopwatch drawn by the close-up's renderer at beat b into the layer (its pixels). */
export function newsDialPixels(b) {
  LAYER.begin(0);
  const o = params(SP[0], b);
  const d = LAYER.d;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) d[Y * W + X] = shade(o.fx + (X - CENTRE.x) / o.s, o.fy + (Y - CENTRE.y) / o.s, o, X, Y);
  return d;
}

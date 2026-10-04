// The set's live layer (round 4, owner: "puedes añadir animaciones"): what moves in a real studio while the
// presenters talk — windows in the city going on and off, the red lights on the masts, a plane crossing the
// night sky, a cursor blinking, stars twinkling, a ticker running, the studio clock's seconds, a slow sweep
// of light along the desk's LED line. The background stays cached (set.js); this layer is drawn over it every
// frame, after the desk and before the presenters, so it costs a few hundred pixel writes at most.
//
// Two kinds of element:
//   points   pixels the dressing registered while it drew the cached background (livePoint): each has an "on"
//            and an "off" colour and a blink rule; a frame recolours the pixel only while it still shows one
//            of the two (so whatever stands in front of it, the desk included, keeps it hidden)
//   drawers  per-programme functions (LIVE_DRAW[id]) that draw moving things from world positions each frame
//
// Everything is a pure function of the time t and the camera: the same frame twice is the same pixels, and a
// cached frame and an uncached one stay identical.
//
//   liveReset()                          before the dressing draws (set.js, on a cache miss)
//   livePoint(x, y, on, off, kind, seed) register a pixel (kinds below)
//   drawLive(fr, cam, t, style, clipRows, soft, wall)   wall: the video wall's screen rect (drawers keep off it)
//   setLive(on)                          labs and tests: the still set
const W = 384, H = 216;
const MAX = 6000;
const PTS = { n: 0, idx: new Int32Array(MAX), on: new Uint32Array(MAX), off: new Uint32Array(MAX), kind: new Uint8Array(MAX), seed: new Float32Array(MAX) };
export const LIVE = { on: true };

// blink rules
export const BLINK = {
  WINDOW: 1, // a window: on most of the time; now and then someone switches a light off or on (minutes)
  BEACON: 2, // an aviation light: 1.0 s on, 1.0 s off, each mast on its own phase
  TWINKLE: 3, // a star: one step dimmer for a few frames now and then
  CURSOR: 4, // a terminal cursor: 0.53 s on, 0.53 s off
  SLOW: 5, // a status LED: a long breath (on 2.6 s, off 0.4 s)
};

export function liveReset() {
  PTS.n = 0;
}

export function livePoint(x, y, on, off, kind, seed = 0) {
  if (PTS.n >= MAX || x < 0 || x >= W || y < 0 || y >= H) return;
  const i = PTS.n++;
  PTS.idx[i] = y * W + x;
  PTS.on[i] = on;
  PTS.off[i] = off;
  PTS.kind[i] = kind;
  PTS.seed[i] = seed;
}

export function setLive(on) {
  LIVE.on = !!on;
}

const frac = (v) => v - Math.floor(v);
/** Is a point lit at time t? */
function stateOf(kind, seed, t) {
  switch (kind) {
    case BLINK.WINDOW: {
      // each window lives on its own 40-130 s cycle and is dark for 8-20 % of it
      const period = 40 + seed * 90;
      return frac(t / period + seed * 7.3) > 0.08 + 0.12 * frac(seed * 13.1);
    }
    case BLINK.BEACON:
      return frac(t / 2 + seed) < 0.5;
    case BLINK.TWINKLE: {
      // a dim beat of 0.25 s every 3-9 s
      const period = 3 + seed * 6;
      return frac(t / period + seed * 3.7) > 0.25 / period;
    }
    case BLINK.CURSOR:
      return frac(t / 1.06) < 0.5;
    case BLINK.SLOW:
      return frac(t / 3 + seed) < 0.86;
    default:
      return true;
  }
}

/** The programme drawers: (fr, cam, t, style, clipRows, soft) → nothing. Filled by dressing.js. */
export const LIVE_DRAW = {};
/** The desk LED's row per screen column of the frame on air (set.js drawDesk fills it; -1 where there is none). */
export const LED_ROWS = new Int16Array(W).fill(-1);
/** A slow sweep of light along the desk's LED line, per programme: { hot, every (s), cross (s) }. */
export const DESK_SWEEP = {};

export function drawLive(fr, cam, t, style, clipRows, soft, wall = null) {
  if (!LIVE.on || !Number.isFinite(t)) return;
  const px = fr.px;
  for (let i = 0; i < PTS.n; i++) {
    const o = PTS.idx[i];
    const cur = px[o];
    if (cur !== PTS.on[i] && cur !== PTS.off[i]) continue;
    const x = o % W, y = (o / W) | 0;
    if (clipRows && y >= clipRows[x]) continue;
    px[o] = stateOf(PTS.kind[i], PTS.seed[i], t) ? PTS.on[i] : PTS.off[i];
  }
  // the desk line's sweep: a short hot run of light crossing the desk now and then, left to right
  const sw = DESK_SWEEP[style.id];
  if (sw && !soft) {
    const u = (t % sw.every) / sw.cross;
    if (u < 1) {
      let xa = W, xb = -1;
      for (let x = 0; x < W; x++) if (LED_ROWS[x] >= 0) {
        if (x < xa) xa = x;
        xb = x;
      }
      if (xb > xa) {
        const cx = xa - 12 + u * (xb - xa + 24);
        for (let x = Math.max(xa, Math.floor(cx - 6)); x <= Math.min(xb, Math.ceil(cx + 6)); x++) {
          const y = LED_ROWS[x];
          if (y < 0 || y >= H) continue;
          const o = y * W + x, d = Math.abs(x + 0.5 - cx);
          if (px[o] !== sw.line) continue;
          if (d < 2.5) px[o] = sw.hot;
          else if (d < 6 && ((x + y) & 1)) px[o] = sw.warm || sw.hot;
        }
      }
    }
  }
  const f = LIVE_DRAW[style.id];
  if (f) f(fr, cam, t, style, clipRows, soft, wall);
}


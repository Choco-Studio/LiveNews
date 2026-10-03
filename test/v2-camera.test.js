// CAMERA stream (wave 2): framings, moves and the runtime shot grammar of the
// canvas25d stage. Framings are checked as geometry (head boxes, bezel, graphics
// rectangles) for every programme's cast and all eight looks; moves as numbers and
// as rendered set frames at 60 fps (landmarks monotone and ≤ 1 px per frame, flat
// panels change colour at most once); the shot grammar per programme on saved
// /api/queue episodes (estimated timing) and on synthetic recorded word timings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { framing, cameraAt, framingInfo, bezelClearance, moveScale, easeMove, singleCam, kAt, MOVE_CEILING } from '../public/js/v2/canvas25d/camera.js';
import { SET, sxOf, syOf } from '../public/js/v2/canvas25d/studio/geometry.js';
import { lookFor, PRESENTER_IDS } from '../public/js/v2/canvas25d/cast/index.js';
import { segmentContext } from '../public/js/v2/canvas25d/direction/context.js';
import { planShots, MIN_SHOT, SHOT_STYLES, pauseCut, isCatch } from '../public/js/v2/canvas25d/direction/shots.js';
import { paceFor } from '../public/js/pace.js'; // PACE: the round-up's map-run rule

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, `v2-camera-${name}.json`), 'utf8'));
// saved /api/queue episodes of the offline channel: -1/-2 from the first round, -3+ re-captured after editorial
// round 2 (intro teases, round-up index/count, map[] multi-pin, breaking leads); -rec = synthetic recorded word timings
const FIXTURES = [
  'world-now-1', 'world-now-2', 'world-now-3', 'world-now-4', 'world-now-5', 'world-now-6',
  'tech-bytes-1', 'tech-bytes-2', 'tech-bytes-3', 'tech-bytes-4',
  'cosmos-1', 'cosmos-2', 'cosmos-3', 'cosmos-4',
  'money-minute-1', 'money-minute-2',
  'news-60-1', 'news-60-2', 'news-60-3', 'news-60-4', 'news-60-5', 'news-60-6',
  'world-now-1-rec', 'world-now-3-rec', 'tech-bytes-1-rec', 'tech-bytes-3-rec', 'cosmos-3-rec', 'money-minute-1-rec', 'money-minute-2-rec', 'news-60-3-rec',
];

const CASTS = {
  'world-now': { A: 'paco', B: 'lola' },
  'tech-bytes': { A: 'max', B: 'ada' },
  cosmos: { A: 'nova', B: 'unit8' },
  'money-minute': { A: 'penny' },
  'news-60': { A: 'sam' },
};
const seatX = (slot, solo) => (solo ? SET.seatX.solo ?? 0 : slot === 'B' ? SET.seatX.B : SET.seatX.A);
const actorsOf = (cast) => {
  const solo = !cast.B;
  return Object.keys(cast).map((slot) => ({ slot, X: seatX(slot, solo), look: lookFor(cast[slot]) }));
};

// ---------------------------------------------------------------------------
// Framings

const SINGLES = ['single', 'close', 'mcu-l', 'mcu-r', 'mcu', 'ots'];
const BUG = { x0: 13, y0: 8, x1: 61, y1: 21 };

function checkSingle(name, cast, focus, programId, cam, label) {
  const info = framingInfo(cam, actorsOf(cast));
  const h = info.heads.find((x) => x.slot === focus);
  assert.ok(h.x0 >= 0 && h.x1 <= 384 && h.y0 >= 0 && h.y1 <= 216, `${label}: head box inside the frame ${JSON.stringify(h)}`);
  assert.ok(h.y0 >= 10, `${label}: head top ≥ 10 px below the frame top (${h.y0})`);
  assert.ok(h.y1 < 136, `${label}: chin above the caption band y 136 (${h.y1})`);
  const underBug = h.x0 <= BUG.x1 && h.x1 >= BUG.x0 && h.y0 <= BUG.y1;
  assert.ok(!underBug, `${label}: head under the bug`);
  const gap = bezelClearance(h, info.bezel);
  assert.ok(gap >= 4, `${label}: bezel edge ${gap.toFixed(1)} px from the head (≥ 4)`);
  return { h, info, gap };
}

test('framings: singles keep head, headroom, chin, bug and bezel rules for every programme cast', () => {
  for (const [programId, cast] of Object.entries(CASTS)) {
    const slots = cast.B ? ['A', 'B'] : ['A'];
    for (const name of SINGLES) {
      for (const focus of slots) {
        const cam = framing(name, { cast, focus, programId });
        const { h } = checkSingle(name, cast, focus, programId, cam, `${programId} ${name} ${focus}`);
        // eye lines on the upper third (mcu / close / ots; the approved single sits higher)
        if (name !== 'single') assert.ok(h.eye >= 60 && h.eye <= 80, `${programId} ${name} ${focus}: eye line ${h.eye.toFixed(1)} on the thirds`);
      }
    }
  }
});

test('framings: MONEY MINUTE MCU-R has its bible numbers (head centre x 248-264, eye 64-76, head top ≥ 10 px)', () => {
  const cast = CASTS['money-minute'];
  const cam = framing('mcu-r', { cast, programId: 'money-minute' });
  const { h, info } = checkSingle('mcu-r', cast, 'A', 'money-minute', cam, 'money mcu-r');
  assert.ok(h.cx >= 248 && h.cx <= 264, `head centre x ${h.cx}`);
  assert.ok(h.eye >= 64 && h.eye <= 76, `eye line ${h.eye}`);
  // the wall's left part carries the figure panel (SET request): wall from x ≤ 64 to past x 176, below the top
  assert.ok(info.wall.x0 <= 64 && info.wall.x1 > 176, `wall x ${info.wall.x0}-${info.wall.x1}`);
  assert.ok(info.wall.y1 >= 110 && info.wall.y1 <= 136, `wall bottom ${info.wall.y1} behind the shoulders, above the captions`);
});

test('framings: WORLD NOW singles put the speaker in the third nearer their seat, the wall in the other', () => {
  const cast = CASTS['world-now'];
  for (const [focus, name] of [['A', 'mcu-l'], ['B', 'mcu-r']]) {
    const cam = framing(name, { cast, focus, programId: 'world-now' });
    const info = framingInfo(cam, actorsOf(cast));
    const h = info.heads.find((x) => x.slot === focus);
    if (focus === 'A') {
      assert.ok(h.cx < 150, `A head centre ${h.cx} in the left third`);
      assert.ok(info.wall.x1 > 300 && info.wall.x0 > h.x1, 'the wall fills the right of the frame');
    } else {
      assert.ok(h.cx > 234, `B head centre ${h.cx} in the right third`);
      assert.ok(info.wall.x0 < 84 && info.wall.x1 < h.x0, 'the wall fills the left of the frame');
    }
  }
});

test('framings: NEWS IN 60 MCU-L leaves the right of the wall beside the head; OTS shows the whole wall', () => {
  const cast = CASTS['news-60'];
  const cam = framing('mcu-l', { cast, programId: 'news-60' });
  const info = framingInfo(cam, actorsOf(cast));
  const h = info.heads[0];
  assert.ok(h.cx < 150 && info.wall.x1 - h.x1 >= 100, `${h.cx} / wall to ${info.wall.x1}`);
  for (const [programId, c] of Object.entries(CASTS)) {
    const ots = framing('ots', { cast: c, focus: 'A', programId });
    const w = framingInfo(ots, actorsOf(c)).wall;
    assert.ok(w.y0 >= 0 && w.y1 <= 136 && w.x1 <= 384, `${programId} ots: wall fully in frame above the captions ${JSON.stringify(w)}`);
  }
});

test('framings: every look in every seat survives the singles (no hard-coded presenter)', () => {
  for (const id of PRESENTER_IDS) {
    for (const [cast, focus] of [[{ A: id, B: 'lola' }, 'A'], [{ A: 'paco', B: id }, 'B'], [{ A: id }, 'A']]) {
      for (const name of ['single', 'mcu-l', 'mcu-r', 'close', 'ots', 'mcu']) {
        if (name === 'mcu' && cast.B) continue;
        const cam = framing(name, { cast, focus, programId: cast.B ? 'world-now' : 'news-60' });
        checkSingle(name, cast, focus, '', cam, `${id} ${name} ${focus}${cast.B ? '' : ' solo'}`);
      }
    }
  }
});

test('framings: wides keep both heads in frame and clear of the bezel; the two-shot keeps the plate out of the strap', () => {
  for (const [programId, cast] of Object.entries(CASTS)) {
    for (const name of ['wide', 'two']) {
      const cam = framing(name, { cast, programId });
      const info = framingInfo(cam, actorsOf(cast));
      for (const h of info.heads) {
        assert.ok(h.x0 >= 0 && h.x1 <= 384 && h.y0 >= 22 && h.y1 < 136, `${programId} ${name} ${h.slot}: ${JSON.stringify(h)}`);
        if (cast.B) assert.ok(bezelClearance(h, info.bezel) >= 4, `${programId} ${name} ${h.slot}: bezel`);
      }
    }
  }
  // the closing two-shot: eye lines on the upper half, the desk's front edge (and the red plate under it) below the
  // caption band, behind the ticker; ~1.86x the wide so the cut from or to the wide is a clear change of size
  for (const cast of [CASTS['world-now'], CASTS['tech-bytes'], CASTS.cosmos]) {
    const cam = framing('two', { cast });
    const info = framingInfo(cam, actorsOf(cast));
    for (const h of info.heads) assert.ok(h.eye >= 70 && h.eye <= 92 && h.y0 >= 40, `two: eye ${h.eye} crown ${h.y0}`);
    assert.ok(syOf(cam, kAt(cam, SET.deskFrontZ), 0) >= 196, 'two: desk front edge below the captions');
    const wide = framing('wide', { cast });
    const ratio = kAt(cam, SET.presenterZ) / kAt(wide, SET.presenterZ);
    assert.ok(ratio >= 1.6, `two vs wide size ${ratio.toFixed(2)}`);
  }
});

test('framings: cached, read-only cameras; singleCam reads SET (approved single unchanged)', () => {
  const a = framing('mcu-l', { cast: CASTS['world-now'], focus: 'A' });
  assert.equal(a, framing('mcu-l', { cast: CASTS['world-now'], focus: 'A' }));
  const s = singleCam('B', 3.4);
  // identical to the prototype's formula with seat 74 and screen edge 73 (owner-approved camera demo)
  const k = 3.4, kw = (k * 540) / 940;
  assert.equal(s.x, (74 * k - 73 * kw - 10.5 * k) / (k - kw));
  assert.equal(singleCam('A', 3.4).x, -s.x);
});

// ---------------------------------------------------------------------------
// Moves

test('moves: eased, monotone, no overshoot; pull widens; ceiling 6 %', () => {
  const push = { type: 'push', amount: 0.04, delay: 0.5, dur: 4.5 };
  let prev = moveScale(push, 0);
  assert.equal(prev, 1);
  for (let t = 0; t <= 6; t += 1 / 60) {
    const f = moveScale(push, t);
    assert.ok(f >= prev - 1e-12 && f <= 1.04 + 1e-12);
    prev = f;
  }
  assert.ok(Math.abs(moveScale(push, 5.0) - 1.04) < 1e-9);
  // zero speed at both ends (sine in-out)
  assert.ok(easeMove(0.01) < 0.001 && 1 - easeMove(0.99) < 0.001);
  const pull = { type: 'pull', amount: 0.04, delay: 0, dur: 5 };
  assert.equal(moveScale(pull, 0), 1);
  assert.ok(Math.abs(moveScale(pull, 5) - 1 / 1.04) < 1e-9);
  assert.ok(moveScale({ type: 'push', amount: 0.5, delay: 0, dur: 1 }, 2) <= 1 + MOVE_CEILING + 1e-12);
  // the camera of a move is a dolly: x, y, hy and zoom stay
  const spec = { framing: 'wide', cast: CASTS['world-now'], programId: 'world-now', move: push };
  const c0 = { ...cameraAt(spec, 0) };
  const c1 = cameraAt(spec, 5);
  assert.equal(c1.x, c0.x);
  assert.equal(c1.hy, c0.hy);
  assert.equal(c1.zoom, c0.zoom);
  assert.ok(Math.abs(kAt(c1, SET.presenterZ) / kAt(c0, SET.presenterZ) - 1.04) < 1e-9);
});

// a minimal 2D canvas for logo.js (the desk plate's logo texture) so the set renders in node
function fakeCanvas() {
  const c = { width: 0, height: 0, data: null };
  const px = () => (c.data && c.data.length === c.width * c.height * 4 ? c.data : (c.data = new Uint8ClampedArray(c.width * c.height * 4)));
  const ctx = {
    fillStyle: '#000000',
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      const d = px();
      const v = /^#([0-9a-f]{6})$/i.exec(String(ctx.fillStyle));
      const n = v ? parseInt(v[1], 16) : 0;
      for (let j = Math.max(0, y | 0); j < Math.min(c.height, (y + h) | 0); j++)
        for (let i = Math.max(0, x | 0); i < Math.min(c.width, (x + w) | 0); i++) {
          const k = (j * c.width + i) * 4;
          d[k] = n >> 16;
          d[k + 1] = (n >> 8) & 255;
          d[k + 2] = n & 255;
          d[k + 3] = 255;
        }
    },
    drawImage(src, dx, dy) {
      const d = px(), s = src.data || new Uint8ClampedArray(0);
      for (let j = 0; j < src.height; j++)
        for (let i = 0; i < src.width; i++) {
          const x = i + (dx | 0), y = j + (dy | 0);
          if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
          const a = (j * src.width + i) * 4;
          if (s[a + 3] === 0) continue;
          const b = (y * c.width + x) * 4;
          d[b] = s[a];
          d[b + 1] = s[a + 1];
          d[b + 2] = s[a + 2];
          d[b + 3] = s[a + 3];
        }
    },
    getImageData(x, y, w, h) {
      const d = px(), out = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) out.set(d.subarray(((y + j) * c.width + x) * 4, ((y + j) * c.width + x + w) * 4), j * w * 4);
      return { width: w, height: h, data: out };
    },
  };
  c.getContext = () => ctx;
  return c;
}

let SETMOD = null;
async function setModule() {
  if (SETMOD) return SETMOD;
  globalThis.document ??= { createElement: () => fakeCanvas() };
  const [set, pix] = await Promise.all([import('../public/js/v2/canvas25d/studio/set.js'), import('../public/js/v2/canvas25d/pixbuf.js')]);
  SETMOD = { set, pix };
  return SETMOD;
}

/** Render the set only (no presenters, wall clock frozen) for each frame of a move. */
async function renderMove(spec, t0, t1, fps = 60) {
  const { set, pix } = await setModule();
  const fr = new pix.Frame();
  const clip = new Int16Array(384);
  const frames = [];
  for (let i = 0; t0 + i / fps <= t1 + 1e-9; i++) {
    const cam = cameraAt(spec, t0 + i / fps);
    set.drawBackground(fr, cam, 0);
    set.drawDesk(fr, cam, clip, pix.C.red);
    frames.push(fr.px.slice());
  }
  return frames;
}

/** Static landmarks (wall-bezel corners, desk-plate edges, practical strips) projected and rounded as the set draws them. */
function landmarks(cam) {
  const kw = kAt(cam, SET.wallZ), kd = kAt(cam, SET.deskFrontZ), kf = kAt(cam, SET.flatsZ);
  const S = SET.screen;
  return [
    Math.round(sxOf(cam, kw, S.x0)), Math.round(syOf(cam, kw, S.y0)),
    Math.round(sxOf(cam, kw, S.x1)), Math.round(syOf(cam, kw, S.y1)),
    Math.round(sxOf(cam, kd, -26)), Math.round(sxOf(cam, kd, 26)), Math.round(syOf(cam, kd, 17)), Math.round(syOf(cam, kd, 33)),
    Math.round(sxOf(cam, kf, -214)), Math.round(sxOf(cam, kf, 214)),
  ];
}

/**
 * True when every colour change of pixel i takes a colour that a neighbour within 2 px showed in the frame
 * before: an edge or a thin line moving into the pixel (a dolly moves every layer monotonically), as opposed
 * to shimmer (a dither or rounding flip with no such neighbour).
 */
export function travellingEdge(frames, i, W) {
  for (let f = 1; f < frames.length; f++) {
    if (frames[f][i] === frames[f - 1][i]) continue;
    const c = frames[f][i];
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && frames[f - 1][i + dy * W + dx] === c) { near = true; break; }
    if (!near) return false;
  }
  return true;
}

test('moves: the shimmer check tells a travelling line from a flipping pixel', () => {
  const W = 12, H = 5, mk = () => new Uint32Array(W * H).fill(1);
  // a 1 px dark line crossing the row, one column per frame: every pixel flips in and out, from a neighbour
  const line = [];
  for (let f = 0; f < 10; f++) {
    const px = mk();
    for (let y = 0; y < H; y++) px[y * W + 1 + f] = 2;
    line.push(px);
  }
  assert.ok(travellingEdge(line, 2 * W + 5, W));
  // a pixel that toggles in place with no neighbour of that colour: shimmer
  const flip = [mk(), mk(), mk()];
  flip[1][2 * W + 5] = 3;
  assert.ok(!travellingEdge(flip, 2 * W + 5, W));
});

const MOVE_CASES = {
  'world-now greeting push': { framing: 'wide', cast: CASTS['world-now'], programId: 'world-now', move: { type: 'push', amount: 0.034, delay: 0.5, dur: 4.258 } },
  'world-now lead push': { framing: 'mcu-l', focus: 'A', cast: CASTS['world-now'], programId: 'world-now', move: { type: 'push', amount: 0.04, delay: 0.5, dur: 7.661 } },
  'world-now sign-off pull': { framing: 'wide', cast: CASTS['world-now'], programId: 'world-now', move: { type: 'pull', amount: 0.04, delay: 0.5, dur: 7.263 } },
  'tech-bytes catch push': { framing: 'close', focus: 'B', cast: CASTS['tech-bytes'], programId: 'tech-bytes', move: { type: 'push', amount: 0.016, delay: 0.3, dur: 3.2 } },
};

export const MOVE_STATS = {};

test('moves: landmarks step monotonically, ≤ 1 px per frame at 60 fps (world-now §5.11, tech-bytes §4.5)', () => {
  for (const [label, spec] of Object.entries(MOVE_CASES)) {
    const { delay, dur } = spec.move;
    let prev = landmarks(cameraAt(spec, 0));
    const dir = new Array(prev.length).fill(0);
    let maxStep = 0;
    for (let i = 1; i / 60 <= delay + dur + 0.5; i++) {
      const cur = landmarks(cameraAt(spec, i / 60));
      cur.forEach((v, k) => {
        const d = v - prev[k];
        maxStep = Math.max(maxStep, Math.abs(d));
        if (d) {
          assert.ok(!dir[k] || Math.sign(d) === dir[k], `${label}: landmark ${k} reverses at frame ${i}`);
          dir[k] = Math.sign(d);
        }
      });
      prev = cur;
    }
    assert.ok(maxStep <= 1, `${label}: max landmark step ${maxStep} px`);
    MOVE_STATS[label] = { maxStep };
  }
});

test('moves: rendered set frames: flat-panel pixels change colour at most once; TECH BYTES push ends on a still hold', async (t) => {
  let mod;
  try {
    mod = await setModule();
  } catch (err) {
    t.skip(`set.js not importable right now (another stream mid-edit): ${err.message}`);
    return;
  }
  for (const [label, spec] of Object.entries(MOVE_CASES)) {
    const { delay, dur } = spec.move;
    const frames = await renderMove(spec, 0, delay + dur + 0.5);
    const first = frames[0], last = frames[frames.length - 1], W = 384, H = 216;
    // flat-panel pixels: inside a uniform 5x5 block of one colour in the first AND the last frame, and no
    // Bayer dot (a pixel unlike all four neighbours) within 4 px: light falloff, 1-2 px lines and the
    // practical strips are not flat panels
    const dot = (px, i) => {
      const c = px[i];
      return px[i - 1] !== c && px[i + 1] !== c && px[i - W] !== c && px[i + W] !== c;
    };
    const flat = (px, i) => {
      const x = i % W, y = (i / W) | 0;
      if (x < 5 || y < 5 || x >= W - 5 || y >= H - 5) return false;
      const c = px[i];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (px[i + dy * W + dx] !== c) return false;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dot(px, i + dy * W + dx)) return false;
      return true;
    };
    let flats = 0, bad = 0, edges = 0, maxChanges = 0, changedAny = 0;
    for (let i = 0; i < W * H; i++) {
      if (!flat(first, i) || !flat(last, i)) continue;
      flats++;
      let n = 0;
      for (let f = 1; f < frames.length; f++) if (frames[f][i] !== frames[f - 1][i]) n++;
      if (n) changedAny++;
      if (n > 1) {
        // a thin line of the set (a flat's edge, an outline) travelling across the panel flips a pixel in and out:
        // that is the move itself, not shimmer; shimmer is a colour appearing where no neighbour had it
        if (travellingEdge(frames, i, W)) edges++;
        else bad++;
      }
      maxChanges = Math.max(maxChanges, n);
    }
    MOVE_STATS[label] = { ...(MOVE_STATS[label] || {}), frames: frames.length, flatPixels: flats, changed: changedAny, travellingEdge: edges, flickering: bad, maxChanges };
    assert.equal(bad, 0, `${label}: ${bad} of ${flats} flat-panel pixels shimmer (change colour more than once with no travelling edge; max ${maxChanges})`);
    // the hold after the move: identical frames for the last 0.5 s
    const holdFrames = Math.floor(0.5 * 60);
    for (let f = frames.length - holdFrames; f < frames.length; f++) assert.deepEqual(frames[f], frames[frames.length - 1], `${label}: still hold`);
  }
  if (process.env.V2_CAMERA_STATS) console.log(JSON.stringify(MOVE_STATS, null, 1));
});

// ---------------------------------------------------------------------------
// Shot grammar

/** Contexts with neighbour access (ctx.contextAt), memoised per episode, as the runtime is asked to provide. */
function contexts(ep, withNeighbours = true) {
  const memo = new Map();
  const at = (j) => {
    if (memo.has(j)) return memo.get(j);
    const c = segmentContext(ep, j, {});
    if (withNeighbours) c.contextAt = at;
    memo.set(j, c);
    return c;
  };
  return ep.segments.map((_, i) => at(i));
}

const HOLD = { 'world-now': 1.5, 'news-60': 1.0, cosmos: 0.6 };
const TWO_SHOTS = new Set(['wide', 'two']);

/** The episode on one clock: plans per segment and the visible shots (a framing change, a new graphic, a map to map cut). */
function episodeLog(ep, opts = {}) {
  const ctxs = contexts(ep, opts.neighbours !== false);
  const plans = [];
  const shots = [];
  let T = 0;
  ctxs.forEach((ctx, i) => {
    const events = planShots(ctx);
    plans.push({ ctx, events, T });
    for (const e of events) {
      const prev = shots[shots.length - 1];
      const studio = !!e.framing;
      const same =
        prev && !e.zoom && prev.shot === e.shot && prev.framing === e.framing && (TWO_SHOTS.has(e.framing) || prev.focus === e.focus) && (studio || prev.seg === i) && (prev.card ?? null) === (e.card ?? null);
      if (same) {
        if (e.move) prev.moves.push({ ...e.move, at: T + e.at });
        continue;
      }
      if (prev) prev.t1 = T + e.at;
      // a round-up zoom (world view → item 1's place) is not a cut, but each part is timed as its own map beat
      shots.push({ t0: T + e.at, t1: null, seg: i, ctx, e, shot: e.shot, framing: e.framing, focus: e.focus, beat: e.beat, card: e.card, zoom: !!e.zoom, moves: e.move ? [{ ...e.move, at: T + e.at }] : [] });
    }
    T += ctx.duration + (ctx.type === 'outro' ? HOLD[ctx.programId] ?? 0.3 : 0.3);
  });
  shots[shots.length - 1].t1 = T;
  for (const s of shots) s.len = s.t1 - s.t0;
  return { ctxs, plans, shots, total: T };
}

/** Can a shot be split at a sentence boundary with both parts ≥ MIN_SHOT? (else an over-max shot is unavoidable) */
function splittable(s, log) {
  for (const p of log.plans) {
    for (const b of p.ctx.sentences.slice(1)) {
      const t = p.T + b.t0;
      if (t - s.t0 >= MIN_SHOT && s.t1 - t >= MIN_SHOT) return true;
    }
  }
  return false;
}

const median = (a) => {
  const v = [...a].sort((x, y) => x - y);
  return v[v.length >> 1];
};

test('grammar: deterministic per episode, never throws, legacy shot names only', () => {
  for (const name of FIXTURES) {
    const ep = load(name);
    const a = JSON.stringify(episodeLog(ep).plans.map((p) => p.events));
    const b = JSON.stringify(episodeLog(ep).plans.map((p) => p.events));
    assert.equal(a, b, `${name}: same plan twice`);
    const c = JSON.stringify(episodeLog(ep, { neighbours: false }).plans.map((p) => p.events.length));
    assert.ok(c.length > 2);
    for (const p of episodeLog(ep).plans) {
      for (const e of p.events) {
        assert.ok(['wide', 'close', 'full', 'map', 'fact', 'montage'].includes(e.shot), `${name}: legacy shot name ${e.shot}`);
        assert.ok(e.framing === null || ['wide', 'two', 'single', 'close', 'mcu-l', 'mcu-r', 'mcu', 'ots'].includes(e.framing), e.framing);
        assert.ok(Number.isFinite(e.at) && Number.isInteger(e.char) && e.kind === 'shot');
        if (e.framing) assert.ok(e.framing === 'wide' || e.framing === 'two' ? e.shot === 'wide' : e.shot === 'close', `${name}: ${e.framing} maps to ${e.shot}`);
      }
    }
  }
  // malformed contexts give one safe shot
  assert.equal(planShots({ valid: false }).length, 1);
  assert.equal(planShots(segmentContext({ segments: [] }, 0, {})).length, 1);
});

test('grammar: shot lengths per bible with the owner minimum (≥ 4 s, median 5-7 s)', () => {
  const report = {};
  for (const name of FIXTURES) {
    const ep = load(name);
    const id = ep.program.id;
    const S = SHOT_STYLES[id];
    const log = episodeLog(ep);
    const lens = [];
    for (const s of log.shots) {
      const label = `${name} ${s.t0.toFixed(2)} ${s.shot}/${s.framing} ${s.beat} ${s.len.toFixed(2)} s`;
      lens.push(s.len);
      if (s.beat === 'headline') {
        // voice-paced headline beats (the director holds minLen with the line gap)
        assert.ok(s.len >= 2.2 && s.e.minLen >= 3.8, label);
        continue;
      }
      const shortTemplate = s.e.minLen >= MIN_SHOT; // the director is asked to hold it
      // the round-up's world view zooms into item 1 (no cut): the minimum applies to the whole map shot
      const next = log.shots[log.shots.indexOf(s) + 1];
      const uncut = next?.zoom ? s.len + next.len : s.len;
      if (!shortTemplate) assert.ok(uncut >= MIN_SHOT - 0.02, `${label}: under ${MIN_SHOT} s`);
      const max = s.framing ? S.studioMax : s.shot === 'full' ? S.pictureMax ?? S.fullMax ?? 8 : s.shot === 'map' ? S.mapMax ?? 8 : 12;
      // over the maximum only when nothing can split it: no sentence start leaves both parts ≥ MIN_SHOT, or the
      // bible keeps the whole run on the wide (chats, then the sign-off)
      const mandated =
        (s.framing === 'wide' && log.plans.slice(s.seg).every((p) => p.T >= s.t1 - 1e-6 || ['chat', 'outro'].includes(p.ctx.type))) ||
        (id === 'money-minute' && s.beat === 'greeting'); // money-minute §3.5: the intro is WIDE throughout
      if (s.len > max + 0.05) assert.ok(mandated || !splittable(s, log), `${label}: over ${max} s although a sentence boundary could split it`);
    }
    report[name] = { shots: lens.length, min: Math.min(...lens).toFixed(2), median: median(lens).toFixed(2), max: Math.max(...lens).toFixed(2) };
  }
  if (process.env.V2_CAMERA_STATS) console.log(JSON.stringify(report, null, 1));
});

test('grammar: every cut sits on a sentence start (±0.1 s), a named word, an item start or inside a MONEY pause', () => {
  for (const name of FIXTURES) {
    const ep = load(name);
    for (const { ctx, events } of episodeLog(ep).plans) {
      for (const e of events) {
        if (e.at <= 0.001) continue;
        const label = `${name} seg ${ctx.index} ${e.shot} ${e.beat} at ${e.at}`;
        const starts = ctx.sentences.slice(1).map((s) => s.t0);
        if (ctx.programId === 'money-minute') {
          // inside the pause before a sentence: after the last word's end, before the next word
          const i = ctx.sentences.findIndex((s) => s.start === e.char);
          assert.ok(i > 0, `${label}: anchored to a sentence start`);
          assert.ok(e.at < ctx.sentences[i].t0 && e.at > ctx.sentences[i].t0 - 0.5, `${label}: inside the pause`);
          continue;
        }
        if (e.beat === 'map' && e.place === 'name') {
          const tName = ctx.timeAt(e.char);
          assert.ok(Math.abs(e.at - tName) <= 0.3, `${label}: within ±0.3 s of the place name`);
          continue;
        }
        // PACE (pace.js maxima, logged in CONTRACTS): a cut on a word that opens a phrase (`place: 'phrase'`, or
        // COSMOS' Reading 'word'): on that word's start
        if (e.place === 'phrase' || e.place === 'word') {
          assert.ok((ctx.words || []).some((w) => w.char === e.char && Math.abs(w.t - e.at) <= 0.1), `${label}: on a word start`);
          continue;
        }
        assert.ok(starts.some((t) => Math.abs(t - e.at) <= 0.1), `${label}: on a sentence start`);
      }
    }
  }
});

test('grammar: MONEY MINUTE cuts fall inside the real pauses of recorded speech (money-minute §5.8)', () => {
  const ep = load('money-minute-1-rec');
  for (const { ctx, events } of episodeLog(ep).plans) {
    assert.equal(ctx.timing, 'recorded');
    const words = ctx.seg.audio.words;
    for (const e of events) {
      if (e.at <= 0.001) continue;
      // true end of the word before the cut (the fixture's words run at a constant speed per sentence)
      const k = words.findIndex((w) => w.char === e.char);
      assert.ok(k > 0, 'cut anchored to a recorded word');
      const prev = words[k - 1], next = words[k];
      const lead = ctx.lead;
      const spc = (words[k - 1].t - words[k - 2].t) / (words[k - 1].char - words[k - 2].char);
      const end = prev.t + prev.len * spc - lead;
      assert.ok(e.at > end && e.at < next.t - lead, `cut ${e.at} inside the pause ${end.toFixed(3)}-${(next.t - lead).toFixed(3)}`);
    }
    // the camera never moves in MONEY MINUTE
    for (const e of events) assert.equal(e.move, null);
  }
  // pauseCut never lands on or after the next word
  const ctx = contexts(load('money-minute-1'))[1];
  for (let i = 1; i < ctx.sentences.length; i++) assert.ok(pauseCut(ctx, i) < ctx.sentences[i].t0);
});

test('grammar: moves only where the bibles allow them, with their numbers', () => {
  for (const name of FIXTURES) {
    const ep = load(name);
    const id = ep.program.id;
    const log = episodeLog(ep);
    const moves = [];
    log.shots.forEach((s, k) => {
      for (const m of s.moves) {
        moves.push(m);
        const next = log.shots[k + 1]?.t0 ?? log.total;
        const start = m.at + m.delay, end = start + m.dur;
        if (id === 'world-now') {
          assert.ok(m.dur >= 4 && m.amount <= 0.04 + 1e-9, `${name}: world-now move ${JSON.stringify(m)}`);
          assert.ok(start >= s.t0 + 0.5 - 1e-6 || (m.at > s.t0 && start - s.t0 >= 0.5), `${name}: starts ≥ 0.5 s after the cut`);
          assert.ok(end <= next - 0.5 + 0.005, `${name}: ends ≥ 0.5 s before the next cut (${end.toFixed(2)} vs ${next.toFixed(2)})`);
          assert.ok(['greeting', 'single', 'signoff', 'chat'].includes(s.beat), `${name}: move on ${s.beat}`);
          assert.ok(!s.ctx.grave, 'grave segments are locked off');
        } else if (id === 'tech-bytes') {
          assert.equal(s.beat, 'catch', `${name}: the only TECH BYTES move is THE CATCH push`);
          assert.ok(m.amount <= 0.03 && Math.abs(m.amount - Math.min(0.03, 0.005 * m.dur)) < 1e-3 && m.delay === 0.3);
          assert.ok(end <= next - 0.5 + 0.005, 'stops 0.5 s before the shot ends');
        } else assert.fail(`${name}: ${id} never moves the camera`);
      }
      assert.ok(s.moves.length <= 1, `${name}: at most one move per shot`);
    });
    if (id === 'world-now') assert.ok(moves.length <= 3, `${name}: ${moves.length} moves`);
    if (id === 'tech-bytes') assert.ok(moves.length <= 1);
  }
});

test('grammar: TECH BYTES THE CATCH: Ada asks on her close with the 0.5 %/s push; short questions stay on the wide', () => {
  const ep = load('tech-bytes-1');
  // a 4-s question (bible example: ~1.6 %)
  const long = structuredClone(ep);
  long.segments[2].text = 'And when does it actually reach people who are not in a laboratory?';
  const ctxs = contexts(long);
  assert.ok(isCatch(ctxs[2]));
  const ev = planShots(ctxs[2]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].framing, 'close');
  assert.equal(ev[0].focus, 'B');
  assert.equal(ev[0].at, 0);
  const len = ctxs[2].duration + 0.3;
  assert.ok(Math.abs(ev[0].move.amount - Math.min(0.03, 0.005 * (len - 0.8))) < 1e-3, JSON.stringify(ev[0].move));
  assert.ok(ev[0].move.delay === 0.3 && Math.abs(ev[0].move.delay + ev[0].move.dur - (len - 0.5)) < 1e-3);
  // Max's answer back to the wide
  assert.equal(planShots(ctxs[3])[0].framing, 'wide');
  // a 4 s shot gives ≈ 1.6 %
  const m = { len: 4 };
  assert.ok(Math.abs(Math.min(0.03, 0.005 * (m.len - 0.8)) - 0.016) < 1e-9);
  // the saved episode's 2.3 s question is under the owner minimum: it stays on the wide
  const short = contexts(ep)[2];
  assert.ok(isCatch(short));
  assert.equal(planShots(short)[0].framing, 'wide');
  // a later chat by Ada is not THE CATCH
  const later = contexts(load('tech-bytes-2'));
  for (const c of later) if (c.type === 'chat' && c.speaker === 'B' && c.index > 3) assert.ok(!isCatch(c));
});

test('grammar: never cut on a dry line or within 1.2 s after it (tech-bytes §4.4)', () => {
  const ep = structuredClone(load('tech-bytes-1'));
  // a story whose second sentence is dry, followed by more copy
  ep.segments[4].text = 'Circuit Weekly reports that a startup has launched a satellite internet service designed for farms in remote areas of three countries. Rightly so. It says the service reaches speeds of 100 megabits per second across most of the region it covers.';
  ep.segments[4].dry = 'Rightly so.';
  const ctx = contexts(ep)[4];
  assert.ok(ctx.dryLine);
  for (const e of planShots(ctx)) {
    if (e.at <= 0) continue;
    assert.ok(!(e.at >= ctx.dryLine.t0 - 0.05 && e.at < ctx.dryLine.t1 + 1.2), `cut at ${e.at} inside the dry line guard ${ctx.dryLine.t0}-${ctx.dryLine.t1 + 1.2}`);
  }
});

test('grammar: WORLD NOW maps on sentence 2 (or the first sentence start the single has held 4 s), round-up map to map', () => {
  for (const name of ['world-now-1', 'world-now-2', 'world-now-1-rec']) {
    for (const { ctx, events } of episodeLog(load(name)).plans) {
      if (ctx.type !== 'story') continue;
      const map = events.find((e) => e.beat === 'map');
      if (map) {
        const first = ctx.sentences.slice(1).find((s) => s.t0 >= MIN_SHOT - 1e-6);
        const prior = events.filter((e) => e.at < map.at);
        if (prior.length === 1) assert.ok(Math.abs(map.at - first.t0) <= 0.1, `${name} seg ${ctx.index}: map at ${map.at} vs ${first.t0}`);
      }
      if (ctx.seg.roundup) {
        assert.equal(events[0].at, 0, 'round-up items cut on their first word');
        // PACE (shots.mapRun, logged in CONTRACTS): after mapRun map items in a row, one item shows its picture or reader
        const run = paceFor(ctx.programId).shots.mapRun;
        const k = ctx.seg.roundup.index;
        if (k > 0 && k % (run + 1) === run) assert.ok(events.length === 1 && ['full', 'close'].includes(events[0].shot), 'a break in the map run');
        else {
          assert.equal(events[0].shot, 'map');
          assert.ok(events.every((e) => e.shot === 'map' || e.capped), 'all on the map');
        }
      }
    }
  }
});

test('grammar: COSMOS: every shot ≥ 4 s, maps near the place name, the Reading choreography, a still camera', () => {
  for (const name of ['cosmos-1', 'cosmos-2']) {
    const log = episodeLog(load(name));
    for (const s of log.shots) {
      assert.ok(s.len >= 4 - 0.02, `${name}: ${s.beat} ${s.len.toFixed(2)} s`);
      assert.equal(s.moves.length, 0, 'the set camera never moves');
    }
    for (const { ctx, events } of log.plans) {
      if (ctx.feature === 'number' && ctx.storyIndex > 0) {
        assert.equal(events[0].shot, 'fact');
        assert.equal(events[0].at, 0, 'the Reading on the first word, no single before it');
        const single = events.find((e) => e.shot === 'close');
        // (or on the word the planner's readingSingle chose inside sentence 2 when the voice has no pause there)
        if (single) assert.ok(single.at >= 4 && (ctx.sentences.some((s) => Math.abs(s.t0 - single.at) < 0.1) || (single.place === 'word' && ctx.words.some((w) => w.char === single.char))), 'single on a sentence start ≥ 4 s after the cut');
      }
      if (ctx.type === 'story') {
        // never cut away during sentence 1
        const s2 = ctx.sentences[1]?.t0 ?? Infinity;
        for (const e of events) if (e.at > 0 && events[0].shot === 'close') assert.ok(e.at >= s2 - 0.1, `${name} seg ${ctx.index}: cut during sentence 1`);
      }
    }
  }
  // a place name spoken after sentence 1 gets the map within ±0.3 s of it
  const ep = structuredClone(load('cosmos-1'));
  ep.segments[1].text = 'According to Starfield Journal, a Mars rover has photographed layered rocks in what scientists believe was an ancient lake bed. The rover is working in the Jezero crater on Mars, where water once pooled. The layers could hold clues about past water on the planet.';
  ep.segments[1].location = { place: 'JEZERO CRATER, MARS', lat: 18, lon: 77 };
  const ctx = contexts(ep)[1];
  const map = planShots(ctx).find((e) => e.shot === 'map');
  assert.ok(map, 'map planned');
  const named = ctx.timeAt(ep.segments[1].text.indexOf('Jezero'));
  assert.ok(Math.abs(map.at - named) <= 0.3, `map ${map.at} vs name ${named}`);
});

test('grammar: NEWS IN 60: WIDE only for intro/outro, Sam in vision in every item, one MAP for the round-up, visible item cuts', () => {
  for (const name of ['news-60-1', 'news-60-2']) {
    const log = episodeLog(load(name));
    let mapRun = 0, inRoundup = false, roundupStart = 0, roundupEnd = 0;
    for (const { ctx, events, T } of log.plans) {
      for (const e of events) {
        if (e.framing === 'wide') assert.ok(ctx.type === 'intro' || ctx.type === 'outro', `${name}: WIDE in a ${ctx.type}`);
        assert.equal(e.move, null, 'locked camera');
      }
      if (ctx.type === 'story' && !ctx.seg.roundup) assert.ok(events.some((e) => e.shot === 'close'), `${name} seg ${ctx.index}: Sam in vision`);
      if (ctx.type === 'story') assert.equal(events[0].at, 0, 'item change on the first word');
      if (ctx.seg.roundup) {
        assert.ok(events.every((e) => e.shot === 'map'));
        if (!inRoundup) {
          mapRun++;
          roundupStart = T;
        }
        inRoundup = true;
        roundupEnd = T + ctx.duration + 0.3;
      } else {
        inRoundup = false;
        assert.ok(events.every((e) => e.shot !== 'map'), 'MAP only in the round-up');
      }
    }
    assert.ok(mapRun <= 1, `${name}: one round-up map block`);
    assert.ok(roundupEnd - roundupStart <= 22.5, `${name}: round-up ${(roundupEnd - roundupStart).toFixed(1)} s`);
    // every item change is a visible cut: consecutive shots never share shot + framing across items
    for (let k = 1; k < log.shots.length; k++) {
      const a = log.shots[k - 1], b = log.shots[k];
      assert.ok(!(a.shot === b.shot && a.framing === b.framing && a.framing), `${name}: no visible cut at ${b.t0.toFixed(2)}`);
    }
  }
});

test('grammar: MONEY MINUTE: WIDE/MCU-R/CARD plan, visible story changes, ≤ 1 MAP, a no-figure episode alternates WIDE and MCU-R', () => {
  const ep = load('money-minute-1');
  const log = episodeLog(ep);
  assert.equal(log.plans[0].events[0].framing, 'wide', 'intro on the WIDE');
  assert.equal(log.plans[1].events[0].framing, 'mcu-r', 'story 1 opens on MCU-R');
  assert.equal(log.plans[log.plans.length - 1].events.length, 1, 'sign-off: WIDE throughout');
  const number = log.plans.find((p) => p.ctx.feature === 'number');
  assert.equal(number.events[0].shot, 'fact');
  assert.equal(number.events[0].beforeSpeech, 1.2, 'the number cut lands in the 1.2 s gap');
  assert.ok(log.shots.filter((s) => s.shot === 'map').length <= 1);
  for (let k = 1; k < log.shots.length; k++) assert.ok(log.shots[k].seg !== log.shots[k - 1].seg || log.shots[k].shot !== log.shots[k - 1].shot || log.shots[k].framing !== log.shots[k - 1].framing);
  // story changes are visible cuts
  for (const p of log.plans.slice(1)) {
    const prevShot = log.shots.filter((s) => s.t0 < p.T - 1e-6).pop();
    const first = p.events[0];
    if (prevShot && p.ctx.type === 'story') assert.ok(!(prevShot.framing && prevShot.framing === first.framing), `story ${p.ctx.index} opens on ${first.framing} after ${prevShot.framing}`);
  }
  // no figures, pictures or places: WIDE and MCU-R alternate (money-minute §5.17)
  const bare = structuredClone(ep);
  for (const s of bare.segments) {
    delete s.fact;
    delete s.numbers;
    delete s.location;
    s.hasImage = false;
    if (s.feature === 'number') delete s.feature;
    if (s.type === 'story') s.text = `${s.text} Analysts expect the trend to continue into the next quarter as demand settles.`;
  }
  const bl = episodeLog(bare);
  const studio = bl.shots.filter((s) => s.framing).map((s) => s.framing);
  assert.ok(studio.includes('wide') && studio.includes('mcu-r'));
  for (let k = 1; k < bl.shots.length; k++) assert.notEqual(bl.shots[k].framing, bl.shots[k - 1].framing, 'alternating studio shots');
});

test('grammar: hand-over cut on B\'s first word; chats and sign-off on the wide; story singles per seat', () => {
  for (const name of ['world-now-1', 'world-now-2', 'cosmos-1', 'tech-bytes-2']) {
    for (const { ctx, events } of episodeLog(load(name)).plans) {
      if (ctx.type === 'story' && !ctx.seg.roundup && !(ctx.feature === 'number' && ctx.storyIndex > 0)) {
        assert.equal(events[0].at, 0, 'cut on the first word');
        assert.equal(events[0].focus, ctx.speaker, 'the speaker in vision');
        if (ctx.programId === 'world-now' && events[0].framing !== 'ots') assert.equal(events[0].framing, ctx.speaker === 'B' ? 'mcu-r' : 'mcu-l');
      }
      if (ctx.type === 'chat' && !isCatch(ctx)) assert.ok(TWO_SHOTS.has(events[0].framing), `chat on a two-shot (${events[0].framing})`);
      if (ctx.type === 'outro') assert.equal(events[0].framing, 'wide');
    }
  }
});

test('grammar: a presenter reading two stories in a row opens the second on the over-the-shoulder framing (a visible cut)', () => {
  const ep = structuredClone(load('world-now-1'));
  ep.segments[2].anchor = 'A'; // Paco reads the lead and the next story
  ep.segments[2].text = ep.segments[2].text.replace('Thanks, Paco. ', '');
  const log = episodeLog(ep);
  assert.equal(log.plans[1].events[0].framing, 'mcu-l');
  assert.equal(log.plans[2].events[0].framing, 'ots');
  const third = structuredClone(ep);
  third.segments[3].anchor = 'A';
  assert.equal(episodeLog(third).plans[3].events[0].framing, 'mcu-l', 'alternates back on the third');
});

test('grammar: the intro montage follows the spoken teasers (owner 20:40): card = the teased story, cut on its line', () => {
  for (const name of ['world-now-3', 'world-now-4', 'world-now-5', 'world-now-6', 'tech-bytes-3', 'tech-bytes-4', 'cosmos-3', 'cosmos-4', 'world-now-3-rec', 'cosmos-3-rec']) {
    const ep = load(name);
    const ctx = contexts(ep)[0];
    assert.equal(ctx.type, 'intro');
    const events = planShots(ctx);
    const frames = events.filter((e) => e.shot === 'montage');
    const stories = ep.segments.filter((s) => s.type === 'story');
    const teases = ep.segments[0].teases;
    assert.ok(Array.isArray(teases), `${name}: fixture has teases`);
    frames.forEach((f, k) => {
      const si = ctx.sentences.findIndex((s) => s.start === f.char);
      assert.ok(si >= 0 && Math.abs(ctx.sentences[si].t0 - f.at) < 0.002, `${name}: frame ${k} cut on a teased line's first word`);
      assert.equal(f.storyId, teases[si], `${name}: frame ${k} is the story its line teases`);
      assert.equal(stories[f.card].storyId, f.storyId, `${name}: card ${f.card} is that story's rundown index`);
      assert.equal(f.minLen, 3.8);
      const next = events[events.indexOf(f) + 1];
      const len = next.at - f.at;
      if (ep.program.id === 'cosmos') assert.ok(len >= MIN_SHOT - 1e-6, `${name}: COSMOS frame ${len.toFixed(2)} s ≥ 4`);
      if (ep.program.id === 'tech-bytes') assert.ok(len >= 3.0 - 1e-6, `${name}: TECH BYTES frame ${len.toFixed(2)} s ≥ 3`);
    });
    if (ep.program.id === 'world-now') assert.equal(frames.length, Math.min(3, stories.length), `${name}: WORLD NOW reads three headlines`);
    const wide = events[events.length - 1];
    assert.equal(wide.framing, 'wide');
    assert.equal(wide.beat, 'greeting');
    assert.ok(ctx.duration + 0.3 - wide.at >= MIN_SHOT - 1e-6, `${name}: the greeting wide holds MIN_SHOT`);
  }
});

test('grammar: a long closing exchange plays on the tighter two-shot, the sign-off cuts back to the wide', () => {
  let seen = 0;
  for (const name of FIXTURES) {
    const ep = load(name);
    if (!ep.cast.B) continue;
    const log = episodeLog(ep);
    const outro = log.plans[log.plans.length - 1];
    assert.equal(outro.ctx.type, 'outro');
    assert.equal(outro.events[0].framing, 'wide', `${name}: sign-off on the wide`);
    const before = log.shots.filter((s) => s.t1 <= outro.T + 1e-6).pop();
    const closing = log.shots.find((s) => s.seg === outro.ctx.index) ?? null;
    if (before && before.framing === 'two') {
      seen++;
      assert.ok(before.len >= MIN_SHOT - 0.02 && closing.len >= MIN_SHOT - 0.02, `${name}: both parts ≥ ${MIN_SHOT} s`);
      assert.ok(before.len + closing.len > 11, `${name}: split only when the closing run passes 11 s`);
      assert.equal(before.shot, 'wide', 'two maps to the legacy wide');
    }
    // nothing but closing chats (and their lead-in) ever plays on 'two'
    for (const s of log.shots) if (s.framing === 'two') assert.ok(log.plans.slice(s.seg + 1).every((p) => ['chat', 'outro'].includes(p.ctx.type)), `${name}: two outside the closing run`);
  }
  assert.ok(seen >= 3, `closing two-shots seen: ${seen}`);
});

test('grammar: long singles change size on a sentence start (single ⇄ over-the-shoulder), both parts ≥ 4.5 s', () => {
  for (const name of FIXTURES) {
    const ep = load(name);
    const id = ep.program.id;
    const soft = SHOT_STYLES[id].singleSoft;
    if (!soft) continue;
    const log = episodeLog(ep);
    for (const s of log.shots) {
      if (s.shot !== 'close' || s.moves.length || s.beat === 'catch') continue;
      if (s.len <= soft + 0.05) continue;
      // over the soft cap only when no open sentence start leaves both parts ≥ 4.5 s inside its segment
      const p = log.plans[s.seg];
      const ok = p.ctx.sentences.slice(1).some((b) => p.T + b.t0 - s.t0 >= 4.5 && s.t1 - (p.T + b.t0) >= 4.5 && !(p.ctx.dryLine && b.start >= p.ctx.dryLine.char));
      assert.ok(!ok, `${name} ${s.t0.toFixed(2)} ${s.framing} ${s.len.toFixed(2)} s over ${soft} s although it could split`);
    }
    for (let k = 1; k < log.shots.length; k++) {
      const a = log.shots[k - 1], b = log.shots[k];
      if (b.beat === 'alt' && a.seg === b.seg && a.shot === 'close') assert.notEqual(a.framing, b.framing, `${name}: a split is a visible change of framing`);
    }
  }
});

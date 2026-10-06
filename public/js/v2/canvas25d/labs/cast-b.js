// Lab driver for PRESENTERS B (owner: PRESENTERS B stream): Max, Ada, Nova and
// UNIT-8 in isolation, deterministic for tools/shoot.mjs contact sheets.
//   window.__lab.render(t)     draw the instant t (seconds; in 'lineup' t picks the scale)
//   window.__lab.set({ mode, presenter, seat, scale, level, pair, zoom, focus, emotion, gesture })
//     mode      'lineup'   Paco + the four at s 1 / 1.37 / 2.15 / 3.4 (t = 0..3), one column each
//                          (`ids` replaces the list, e.g. ['paco', 'sam', 'max'] to compare silhouettes)
//               'turnaround' head yaw sweeping -0.6 .. 0.6 rad (4 s period)
//               'idle'     idle loop (breathing, sway, blinks / UNIT-8's dim)
//               'talk'     a line per presenter (UNIT-8's indicator in sync with the timeline;
//                          `level` 0..1 replaces the line with a constant voice level)
//               'gesture'  the presenter's programme gestures in sequence (those HANDS has registered)
//               'two'      a two-shot of a pairing in its programme's set: pair 'tech' (Max + Ada)
//                          or 'cosmos' (Nova + UNIT-8); A speaks, then B, with turn-start glances
//               'single'   the programme single (k = state.k) of `presenter` in its set
//     scale     px per rig unit for lineup-free modes (default 3.4); seat +1 (left, A) | -1 (right, B)
//     zoom      integer magnification of a crop around `focus` ([x, y] frame px, 'head', or a head index)
//   window.__lab.bench(n)      { [id]: { total, noFace, face, baseline } } ms per frame at k = 4, min of 5 runs
//   window.__lab.profile(n)    { pose, draw, resolve } ms per frame for the current presenter (k = 4)
// The lab sets f.t and f.speech on the face params each frame (what FACES is
// asked to provide), so UNIT-8's indicator runs its exact, time-quantised path.
import { C } from '../pixbuf.js';
import { frame, parts, actor } from '../scene.js';
import { drawCharacter, GROUPS_PER_ACTOR } from '../character.js';
import { poseAt } from '../rig.js';
import { buildSpeech } from '../visemes.js';
import * as cam from '../camera.js';
import * as studio from '../studio/set.js';
import { SET } from '../studio/geometry.js';
import { GESTURES } from '../gestures/index.js';

export const B_IDS = ['max', 'ada', 'nova', 'unit8'];
export const LINEUP = ['paco', 'max', 'ada', 'nova', 'unit8'];
export const SCALES = [1, 1.37, 2.15, 3.4];
const PROGRAMME = { max: 'tech-bytes', ada: 'tech-bytes', nova: 'cosmos', unit8: 'cosmos', paco: 'world-now' };
const LINES = {
  paco: "Good evening. Here are tonight's top stories from around the world.",
  max: 'This is the first phone that folds twice. The battery, of course, does not.',
  ada: 'Lovely. But who actually asked for a phone that folds twice?',
  nova: 'Forty thousand tonnes of dust reach the Earth every year. Most of it is older than the Sun.',
  unit8: 'Forty thousand tonnes. Noted, Dr Reyes.',
};
const PERSONA_GESTURES = {
  max: ['lean_in', 'raise_hand', 'point_screen', 'count'],
  ada: ['glasses', 'steeple', 'chin', 'shake_head', 'shrug'],
  nova: ['steeple', 'raise_hand', 'point_screen', 'glasses', 'chin', 'nod'],
  unit8: ['nod', 'look_partner', 'lean_in', 'count'],
  paco: ['raise_hand', 'nod', 'shrug'],
};
const PAIRS = { tech: ['max', 'ada'], cosmos: ['nova', 'unit8'] };

const state = { mode: 'lineup', ids: null, presenter: 'unit8', seat: null, scale: 3.4, level: null, pair: 'cosmos', zoom: 1, focus: 'head', emotion: null, gesture: null, k: 4 };

// ---------------------------------------------------------------------------
// Actors (rebuilt only when the inputs change; all pure in t)

const LEVEL_FRAME = { speaking: false, level: 0, viseme: 'AH', next: 'AH', mix: 0, accent: 0, emph: 0, sentenceIndex: 0, charIndex: 0, wordIndex: 0, pause: false };
const levelSource = (lvl) => ({ level: lvl, frame() {
  LEVEL_FRAME.speaking = lvl > 0;
  LEVEL_FRAME.level = lvl;
  LEVEL_FRAME.viseme = LEVEL_FRAME.next = lvl > 0 ? 'AH' : 'rest';
  return LEVEL_FRAME;
} });

const ACTORS = new Map();
function cached(key, make) {
  let a = ACTORS.get(key);
  if (!a) {
    a = make();
    ACTORS.set(key, a);
  }
  return a;
}
const seatOf = (id) => (state.seat === 1 || state.seat === -1 ? state.seat : id === 'ada' || id === 'unit8' ? -1 : 1);
const SEEDS = { paco: 11, max: 17, ada: 29, nova: 31, unit8: 43 };

function idleActor(id) {
  return cached(`idle:${id}:${seatOf(id)}:${state.emotion}`, () => actor(id, { side: seatOf(id), seed: SEEDS[id] || 7, emotions: state.emotion ? [{ t0: 0, name: state.emotion }] : [] }));
}

function talkActor(id) {
  const lvl = state.level;
  return cached(`talk:${id}:${seatOf(id)}:${lvl}`, () =>
    actor(id, { side: seatOf(id), seed: SEEDS[id] || 7, speech: Number.isFinite(lvl) ? levelSource(lvl) : buildSpeech(LINES[id] || LINES.paco, { t0: 0.4 }) }));
}

function gestureActor(id) {
  const list = (state.gesture ? [state.gesture] : PERSONA_GESTURES[id] || []).filter((g) => GESTURES[g]);
  return cached(`gest:${id}:${seatOf(id)}:${list.join(',')}`, () => {
    let t = 0.4;
    const gestures = list.map((name) => {
      const g = { name, t0: t };
      t += Math.max(1.2, (GESTURES[name].dur || 2) - 0.3);
      return g;
    });
    return actor(id, { side: seatOf(id), seed: SEEDS[id] || 7, gestures });
  });
}

function pairActors(pair) {
  const [a, b] = PAIRS[pair] || PAIRS.cosmos;
  return cached(`pair:${pair}`, () => {
    const sa = buildSpeech(LINES[a], { t0: 0.4 });
    const tb = sa.t1 + 0.9;
    const sb = buildSpeech(LINES[b], { t0: tb });
    return [
      actor(a, { side: 1, seed: SEEDS[a], speech: sa, listen: true, look: [{ t0: tb + 0.25, t1: tb + 2.6 }] }),
      actor(b, { side: -1, seed: SEEDS[b], speech: sb, listen: true, look: [{ t0: 0.65, t1: 0.65 + (b === 'unit8' ? 1.5 : 3.0) }] }),
    ];
  });
}

// ---------------------------------------------------------------------------
// Drawing

const clipRows = new Int16Array(384);
const ITEMS = [];
const heads = [];

/** Pose, draw and resolve a list of { actor, x, y, s, yaw? } into the shared frame. */
function drawCast(t, list, clip = null) {
  parts.clear();
  if (clip) parts.clipY.set(clip);
  let gb = 0;
  heads.length = 0;
  for (const it of list) {
    const sk = poseAt(it.actor, t);
    if (it.yaw !== undefined) sk.head.yaw = it.yaw;
    // what FACES is asked to provide on the face params (CONTRACTS): the time and the speech source
    sk.face.t = t;
    sk.face.speech = it.actor.perf.speech || null;
    heads.push(drawCharacter(parts, it.actor.look, sk, { x: it.x, y: it.y, s: it.s, gb, clip: !!clip }));
    gb += GROUPS_PER_ACTOR;
  }
  parts.resolve(frame);
  return heads;
}

function item(i, a, x, y, s, yaw) {
  const it = (ITEMS[i] ||= {});
  it.actor = a;
  it.x = x;
  it.y = y;
  it.s = s;
  it.yaw = yaw;
  return it;
}

// lineup: each presenter rendered alone, then one 76 px column of it copied into a composite
const COMP = new Uint32Array(384 * 216);
function lineup(t) {
  const si = Math.max(0, Math.min(SCALES.length - 1, Math.round(t)));
  const s = SCALES[si];
  const ids = state.ids || LINEUP;
  const colW = Math.floor(384 / ids.length);
  COMP.fill(C.ink);
  const neckY = si < 2 ? 150 : si === 2 ? 128 : 112;
  ids.forEach((id, n) => {
    frame.clear(C.ink);
    const x = colW * n + (colW >> 1) + 1;
    drawCast(0, [item(0, idleActor(id), x, neckY, s)]);
    const x0 = colW * n, x1 = x0 + colW;
    for (let y = 0; y < 216; y++) for (let xx = x0 + 1; xx < x1 - 1; xx++) COMP[y * 384 + xx] = frame.px[y * 384 + xx];
  });
  frame.px.set(COMP);
}

function solo(t, a, s, yaw) {
  frame.clear(C.ink);
  const neckY = s >= 3 ? 116 + (s - 3.4) * 20 : s >= 2 ? 120 : 140;
  return drawCast(t, [item(0, a, 192, neckY, s, yaw)]);
}

function studioShot(t, list, camera, programId) {
  const style = studio.styleFor ? studio.styleFor(programId) : null;
  studio.drawBackground(frame, camera, t, style ? { style } : undefined);
  studio.drawDesk(frame, camera, clipRows, style || C.red);
  const cast = list.map(([a, X], i) => {
    const p = cam.placeActor(camera, X);
    return item(i, a, p.x, p.y, p.s);
  });
  return drawCast(t, cast, clipRows);
}

function two(t) {
  const [a, b] = pairActors(state.pair);
  const programId = state.pair === 'tech' ? 'tech-bytes' : 'cosmos';
  const camera = cam.framing ? cam.framing('two', { cast: { A: a.id, B: b.id }, programId }) : cam.makeCamera({ x: 0, y: -60, z: 370, zoom: 1, hy: 42 });
  return studioShot(t, [[a, SET.seatX.A], [b, SET.seatX.B]], camera, programId);
}

function single(t) {
  const id = state.presenter;
  const pairName = id === 'max' || id === 'ada' ? 'tech' : 'cosmos';
  const [a, b] = pairActors(pairName);
  const focus = id === b.id ? 'B' : 'A';
  const programId = pairName === 'tech' ? 'tech-bytes' : 'cosmos';
  const camera = cam.singleCam(focus, state.k || 4);
  return studioShot(t, [[focus === 'A' ? a : b, SET.seatX[focus]]], camera, programId);
}

const MODES = {
  lineup,
  turnaround: (t) => solo(0.3, idleActor(state.presenter), state.scale, 0.6 * Math.sin((t * 2 * Math.PI) / 4)),
  idle: (t) => solo(t, idleActor(state.presenter), state.scale),
  talk: (t) => solo(t, talkActor(state.presenter), state.scale),
  gesture: (t) => solo(t, gestureActor(state.presenter), state.scale),
  two,
  single,
};

// zoomed crop (nearest neighbour) for 5x-style detail sheets
const ZOOM = new Uint32Array(384 * 216);
function applyZoom() {
  const z = state.zoom | 0;
  if (z <= 1) return;
  let fx = 192, fy = 108;
  const hi = typeof state.focus === 'number' ? state.focus : 0;
  if (Array.isArray(state.focus)) [fx, fy] = state.focus;
  else if (heads[hi]) {
    fx = heads[hi].cx;
    fy = heads[hi].cy + 1.5 * heads[hi].s;
  }
  const w = 384 / z, h = 216 / z;
  const x0 = Math.round(Math.max(0, Math.min(384 - w, fx - w / 2))), y0 = Math.round(Math.max(0, Math.min(216 - h, fy - h / 2)));
  for (let y = 0; y < 216; y++) {
    const sy = y0 + Math.floor(y / z);
    for (let x = 0; x < 384; x++) ZOOM[y * 384 + x] = frame.px[sy * 384 + x0 + Math.floor(x / z)];
  }
  frame.px.set(ZOOM);
}

// ---------------------------------------------------------------------------
// Bench and profile (one presenter at a k = 4 single, presenter only: no set)

function benchCase(id, n, noFace) {
  const a = idleActor(id);
  const L = a.look;
  const saved = L.parts;
  if (noFace) L.parts = { ...saved, head: () => {}, face: () => {}, over: saved.over && L.glasses ? null : saved.over };
  const s = 4 * 22 / 22;
  const run = () => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      frame.clear(C.ink);
      drawCast(0.5 + i / 60, [item(0, a, 192, 132, s)]);
    }
    return (performance.now() - t0) / n;
  };
  run(); // warm-up
  const runs = [];
  for (let r = 0; r < 5; r++) runs.push(run());
  L.parts = saved;
  return Math.min(...runs);
}

export function createLab(canvas) {
  const ctx = canvas.getContext('2d');
  const lab = {
    state,
    render(t = 0) {
      (MODES[state.mode] || MODES.idle)(t);
      applyZoom();
      frame.present(ctx);
    },
    set(opts = {}) {
      Object.assign(state, opts);
      return { ...state };
    },
    /** ms per frame at k = 4 (presenter only), min of 5 runs; noFace = head/face/glasses hooks off. */
    bench(n = 120) {
      const out = {};
      const baseline = benchCase('paco', n, false);
      const baselineNoFace = benchCase('paco', n, true);
      for (const id of B_IDS) {
        const total = benchCase(id, n, false);
        const noFace = id === 'unit8' ? total : benchCase(id, n, true);
        out[id] = { total: +total.toFixed(3), noFace: +noFace.toFixed(3), face: +(total - noFace).toFixed(3), ratioToPaco: +(total / baseline).toFixed(2) };
      }
      out.paco = { total: +baseline.toFixed(3), noFace: +baselineNoFace.toFixed(3) };
      return out;
    },
    /** Split of one frame of the current presenter at k = 4: pose (rig), draw (character), resolve. */
    profile(n = 120) {
      const a = idleActor(state.presenter);
      let pose = 0, draw = 0, res = 0;
      for (let i = -10; i < n; i++) {
        const t = 0.5 + i / 60;
        frame.clear(C.ink);
        parts.clear();
        const t0 = performance.now();
        const sk = poseAt(a, t);
        sk.face.t = t;
        sk.face.speech = a.perf.speech || null;
        const t1 = performance.now();
        drawCharacter(parts, a.look, sk, { x: 192, y: 132, s: 4, gb: 0, clip: false });
        const t2 = performance.now();
        parts.resolve(frame);
        const t3 = performance.now();
        if (i >= 0) {
          pose += t1 - t0;
          draw += t2 - t1;
          res += t3 - t2;
        }
      }
      return { pose: +(pose / n).toFixed(3), draw: +(draw / n).toFixed(3), resolve: +(res / n).toFixed(3) };
    },
    heads: () => heads.map((h) => ({ cx: h.cx, cy: h.cy, s: h.s })),
  };
  return lab;
}

export const MODE_NAMES = Object.keys(MODES);

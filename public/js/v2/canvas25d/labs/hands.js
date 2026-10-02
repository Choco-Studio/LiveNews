// Lab driver for HANDS & GESTURES (owner: HANDS & GESTURES stream), page
// public/lab/v2-hands.html. Every view is a pure function of t, so
// tools/shoot.mjs contact sheets are deterministic.
//
//   window.__lab.render(t)
//   window.__lab.set({ mode, presenter, seat, gesture, variant, n, amp, speed, scale, shape, zoom, bg,
//                      blendWith, blendAt, programme, segment })
//     mode 'gesture'  one presenter at the desk performing `gesture` at t0 = 0.3
//                     (scale = presenter px per unit: 1 wide, 1.37 two-shot, 2.15 medium, 3.4 single);
//                     zoom 2|3 magnifies around the gesturing hand
//          'shapes'   hand-shape sheet: every shape, palm and back, at `scale` (zoom magnifies cell `shape`)
//          'blend'    gesture `gesture` interrupted by `blendWith` at `blendAt` s
//          'cast'     all 8 presenters side by side (seat A / B alternating) performing `gesture`
//          'planner'  a fixture episode segment through planSegment: words, stressed words, cuts, gestures
//   window.__lab.bench(n)   ms per frame (min of 5) for the current view + rig/arms counters
//   window.__lab.profile()  { rig, arms } ms per actor (evaluate + solve; arms + hands at the view's scale)
import { C, PartBuffer } from '../pixbuf.js';
import { frame, parts, actor, drawActors } from '../scene.js';
import { poseAt } from '../rig.js';
import { GESTURES, defOf } from '../gestures/index.js';
import { SHAPES } from '../gestures/shapes.js';
import { PRESENTER_IDS, lookFor } from '../cast/index.js';
import { makeCamera, placeActor } from '../camera.js';
import { SET } from '../studio/geometry.js';
import { matsOf } from '../cast/base.js';
import { drawHand, drawArm } from '../hands.js';
import { TILT } from '../space.js';

const state = {
  mode: 'gesture', presenter: 'paco', seat: 1, gesture: 'raise_hand', variant: null, n: null, amp: null, speed: null,
  scale: 2.15, shape: null, zoom: 1, bg: 'set', blendWith: 'point_screen', blendAt: 0.9, programme: 'world-now', segment: 1,
  papers: true,
};

let setMod = null; // studio/set.js, loaded lazily (another stream edits it: a broken import must not break this lab)
import('../studio/set.js').then((m) => (setMod = m)).catch(() => (setMod = null));

const clipRows = new Int16Array(384);

function camFor(k, seat) {
  const sx = seat === -1 ? SET.seatX.B : SET.seatX.A;
  // medium single framing of the approved rig demo, mirrored for seat B
  return makeCamera({ x: sx + (seat === -1 ? -82 : 82) / k, y: -60, z: 300, zoom: (k * 700) / 1000, hy: 34 + 23.6 * k - 30 * k });
}

function background(cam, t) {
  if (state.bg === 'set' && setMod) {
    try {
      setMod.drawBackground(frame, cam, t);
      setMod.drawDesk(frame, cam, clipRows, C.red);
      return true;
    } catch {
      /* fall through */
    }
  }
  frame.clear(C.ink);
  clipRows.fill(216);
  return false;
}

const actors = new Map();
function actorFor(id, seat, gestures) {
  const key = `${id}|${seat}`;
  let a = actors.get(key);
  if (!a) {
    a = actor(id, { side: seat === -1 ? -1 : 1, seed: id === 'paco' ? 11 : 23 });
    actors.set(key, a);
  }
  a.perf.gestures = gestures;
  a.perf.papers = !!state.papers;
  return a;
}

function eventOf(name, t0) {
  const e = { name, t0 };
  if (state.variant) e.variant = state.variant;
  if (state.n) e.n = state.n;
  if (state.amp) e.amp = state.amp;
  if (state.speed) e.speed = state.speed;
  return e;
}

// ---------------------------------------------------------------------------
// gesture

const focus = { x: 192, y: 108 };
function gestureView(t) {
  const k = state.scale;
  const seat = state.seat === -1 ? -1 : 1;
  const cam = camFor(k, seat);
  background(cam, t);
  const g = GESTURES[state.gesture] ? [eventOf(state.gesture, 0.3)] : [];
  const a = actorFor(state.presenter, seat, g);
  const X = seat === -1 ? SET.seatX.B : SET.seatX.A;
  const pl = placeActor(cam, X);
  drawActors(t, [{ actor: a, ...pl }], state.bg === 'set' && setMod ? clipRows : null);
  // focus for the zoom: the near hand (toward the partner)
  const sk = a._sk;
  const near = seat === 1 ? sk.arms.R : sk.arms.L;
  const far = seat === 1 ? sk.arms.L : sk.arms.R;
  const useFar = (GESTURES[state.gesture]?.focus || 'near') === 'far';
  if (state.focus === 'hand') {
    const w = useFar ? far.wrist : near.wrist;
    focus.x = pl.x + (w[0] + sk.body.x) * pl.s;
    focus.y = pl.y + (w[1] + w[2] * TILT + sk.body.y) * pl.s;
  } else {
    // a still window on the upper body (a moving window would hide the motion)
    focus.x = pl.x + (seat === 1 ? 6 : -6) * pl.s;
    const faceWork = /^(chin|facepalm|glasses|nod|shake_head|laugh|look_partner|lean_in)$/.test(state.gesture);
    focus.y = pl.y + (state.focusY ?? (faceWork ? 0 : 14)) * pl.s;
  }
}

// ---------------------------------------------------------------------------
// shapes: a sheet of hand shapes, palm and back views

const SHEET_PB = new PartBuffer();
function shapesView(t) {
  frame.clear(C.ink);
  const L = lookFor(state.presenter);
  const m = matsOf(L);
  const names = state.shapes || Object.keys(SHAPES);
  const s = state.scale;
  const H = L.arm.hand * s;
  const cw = Math.max(18, Math.ceil(H * 1.35)), ch = Math.max(20, Math.ceil(H * 1.5));
  const cols = Math.max(2, Math.floor(384 / cw) & ~1); // palm and back side by side
  const rows = Math.max(1, Math.floor(216 / ch));
  const perPage = (cols / 2) * rows;
  const page = state.page || 0;
  SHEET_PB.clear();
  let gidx = 0;
  const list = names.slice(page * perPage, page * perPage + perPage);
  list.forEach((name, i) => {
    for (const view of [0, 1]) {
      const cell = i * 2 + view;
      const cx = (cell % cols) * cw + cw / 2 + (view ? -1 : 1) * cw * 0.05, cy = Math.floor(cell / cols) * ch + ch * 0.86;
      const sh = SHAPES[name];
      const arm = {
        wrist: [0, 0, 0],
        handDir: sh.dir ? [...sh.dir] : [0.05, -1, 0.12],
        hand: { curl: [...sh.curl], spread: sh.spread ?? 0.2, facing: view === 0 ? sh.facing ?? 1 : -(sh.facing ?? 1), sup: sh.sup || 0 },
      };
      arm.handDir[0] += 0.05 * Math.sin(t * 1.3 + i);
      // the hand's centre sits in the cell: move the wrist back along the projected direction
      const d = arm.handDir;
      const ox = -d[0] * L.arm.hand * 0.5 * s, oy = -(d[1] + d[2] * TILT) * L.arm.hand * 0.5 * s - ch * 0.36;
      const toS = (x, y, z = 0) => [cx + ox + x * s, cy + oy + (y + z * TILT) * s];
      drawHand(SHEET_PB, L, m, arm, view ? -1 : 1, toS, s, 13 + (gidx++ % 6) * 8, 23);
    }
  });
  SHEET_PB.resolve(frame);
  const i = state.shape ? list.indexOf(state.shape) : -1;
  if (i >= 0) {
    focus.x = ((i * 2) % cols) * cw + cw;
    focus.y = Math.floor((i * 2) / cols) * ch + ch * 0.5;
  } else {
    focus.x = 192;
    focus.y = 108;
  }
}

// ---------------------------------------------------------------------------
// blend: A interrupted by B

function blendView(t) {
  const k = state.scale;
  const seat = state.seat === -1 ? -1 : 1;
  const cam = camFor(k, seat);
  background(cam, t);
  const list = [eventOf(state.gesture, 0.3)];
  if (GESTURES[state.blendWith]) list.push({ name: state.blendWith, t0: 0.3 + state.blendAt });
  const a = actorFor(state.presenter, seat, list);
  const X = seat === -1 ? SET.seatX.B : SET.seatX.A;
  drawActors(t, [{ actor: a, ...placeActor(cam, X) }], state.bg === 'set' && setMod ? clipRows : null);
}

// ---------------------------------------------------------------------------
// cast: all 8 at the two-shot scale

const castActors = PRESENTER_IDS.map((id, i) => actor(id, { side: i % 2 ? -1 : 1, seed: 11 + i * 7 }));
function castView(t) {
  frame.clear(C.ink);
  const s = state.scale;
  const list = castActors.map((a, i) => {
    a.perf.gestures = GESTURES[state.gesture] ? [eventOf(state.gesture, 0.3 + i * 0.04)] : [];
    a.perf.papers = !!state.papers;
    return { actor: a, x: 24 + i * 48, y: 216 - 52 * s - 20, s };
  });
  // the PartBuffer holds 4 characters (64 groups each): draw in two passes of four
  for (let h = 0; h < 2; h++) drawActors(t, list.slice(h * 4, h * 4 + 4), null, true);
}

// ---------------------------------------------------------------------------
// zoom: nearest-neighbour magnification of the region around `focus`

const ZOOM_TMP = new Uint32Array(384 * 216);
function applyZoom(z) {
  if (!(z > 1)) return;
  const w = 384 / z, h = 216 / z;
  const x0 = Math.round(Math.max(0, Math.min(384 - w, focus.x - w / 2)));
  const y0 = Math.round(Math.max(0, Math.min(216 - h, focus.y - h / 2)));
  ZOOM_TMP.set(frame.px);
  for (let y = 0; y < 216; y++) {
    const sy = y0 + Math.floor(y / z);
    for (let x = 0; x < 384; x++) frame.px[y * 384 + x] = ZOOM_TMP[sy * 384 + x0 + Math.floor(x / z)];
  }
}

// ---------------------------------------------------------------------------

let plannerView = null; // installed by the planner module of this lab (below), lazily

const VIEWS = {
  gesture: gestureView,
  shapes: shapesView,
  blend: blendView,
  cast: castView,
  planner: (t, ctx2d) => (plannerView ? plannerView(t, ctx2d, state) : frame.clear(C.black)),
};

export function setPlannerView(fn) {
  plannerView = fn;
}

export function createHandsLab(canvas) {
  const ctx = canvas ? canvas.getContext('2d') : null;
  const lab = {
    state,
    render(t = 0) {
      (VIEWS[state.mode] || gestureView)(t, ctx);
      if (state.mode !== 'planner') applyZoom(state.zoom);
      if (ctx && state.mode !== 'planner') frame.present(ctx);
    },
    set(opts = {}) {
      Object.assign(state, opts);
      return { ...state };
    },
    bench(n = 240, t0 = 0.3, dt = 1 / 60) {
      const fn = VIEWS[state.mode] || gestureView;
      for (let i = 0; i < 20; i++) fn(t0 + i * dt, ctx);
      const runs = [];
      for (let r = 0; r < 5; r++) {
        const a = performance.now();
        for (let i = 0; i < n; i++) fn(t0 + i * dt, ctx);
        runs.push((performance.now() - a) / n);
      }
      runs.sort((x, y) => x - y);
      return { min: runs[0], median: runs[2], ...lab.profile() };
    },
    /** Rig evaluate + solve per actor, and arms + hands per presenter at the current scale (ms, min of 5 runs). */
    profile(n = 400) {
      const a = actorFor(state.presenter, state.seat === -1 ? -1 : 1, [eventOf(state.gesture in GESTURES ? state.gesture : 'raise_hand', 0.3)]);
      let rig = Infinity, arms = Infinity;
      for (let r = 0; r < 5; r++) {
        let t0 = performance.now();
        for (let i = 0; i < n; i++) poseAt(a, 0.3 + (i % 120) / 60);
        rig = Math.min(rig, (performance.now() - t0) / n);
        const L = a.look, m = matsOf(L), s = state.scale >= 3 ? state.scale : 4;
        const toS = (x, y, z = 0) => [192 + x * s, 40 + (y + z * TILT) * s];
        t0 = performance.now();
        for (let i = 0; i < n / 4; i++) {
          const sk = poseAt(a, 0.3 + ((i * 4) % 120) / 60);
          SHEET_PB.clear();
          drawArm(SHEET_PB, L, m, sk.arms.L, -1, toS, s, 11, 12, 13, 20);
          drawArm(SHEET_PB, L, m, sk.arms.R, 1, toS, s, 20, 21, 22, 24);
        }
        arms = Math.min(arms, (performance.now() - t0) / (n / 4));
      }
      return { rig, arms, armsScale: state.scale >= 3 ? state.scale : 4 };
    },
    gestures: () => Object.keys(GESTURES),
    /** Use the live episodes of the node server (/api/queue) in the planner view. */
    async loadQueue() {
      const r = await fetch('/api/queue');
      const q = await r.json();
      LIVE = (Array.isArray(q) ? q : q.queue || q.episodes || []).filter((e) => e && e.kind === 'episode');
      return LIVE.map((e) => e.program?.id);
    },
    /** Key instants of a gesture played at t0 = 0.3: [stroke, apex, hold, release mid] (s). */
    keyTimes(name, variant = null, n = null) {
      const d = defOf({ name, variant, n });
      if (!d) return [];
      return [0.3 + d.stroke, 0.3 + d.apex, 0.3 + d.hold, 0.3 + (d.hold + d.dur) / 2];
    },
    /** Overview: the k-th of 4 key instants of the i-th gesture in `list` ('name' or 'name:variant'). */
    overview(list, idx) {
      const [name, variant] = String(list[Math.floor(idx / 4)] || '').split(':');
      lab.set({ mode: 'gesture', gesture: name, variant: variant || null });
      lab.render(lab.keyTimes(name, variant || null)[idx % 4] ?? 0);
    },
    shapes: () => Object.keys(SHAPES),
    presenters: () => PRESENTER_IDS.slice(),
  };
  return lab;
}

// ---------------------------------------------------------------------------
// planner preview: an episode segment through planSegment, drawn as a timeline

// Small built-in episodes (one per programme) so the view works on the static lab server;
// under the node server `__lab.loadQueue()` swaps in the live /api/queue episodes.
const SAMPLE_TEXT = [
  ['intro', 'A', 'neutral', 'Rail fares rise in March. A new bridge opens in Lisbon. Good evening, this is the programme. I am here with my colleague.'],
  ['story', 'A', 'neutral', 'The city of Lisbon has opened a new bridge across the Tagus river, the Pixelburg Post reports. It carries 40,000 cars a day, and three new tram lines will follow by spring.'],
  ['story', 'B', 'serious', 'Floods have closed roads across the north of the country. Officials say 3 towns are cut off and rescue teams are on their way.'],
  ['chat', 'A', 'neutral', 'Three tram lines in one spring. Ambitious, then.'],
  ['chat', 'B', 'happy', 'Let us see if they arrive on time.'],
  ['outro', 'B', 'neutral', 'That is all from us tonight. Thank you for watching, and good night.'],
];
const SAMPLE_CAST = { 'world-now': ['paco', 'lola'], 'tech-bytes': ['max', 'ada'], cosmos: ['nova', 'unit8'], 'money-minute': ['penny'], 'news-60': ['sam'] };
const SAMPLES = Object.fromEntries(Object.entries(SAMPLE_CAST).map(([pid, ids]) => {
  const solo = ids.length === 1;
  return [pid, {
    id: `lab-${pid}`, program: { id: pid }, cast: solo ? { A: ids[0] } : { A: ids[0], B: ids[1] },
    segments: SAMPLE_TEXT.filter((x) => !solo || x[0] !== 'chat').map(([type, anchor, emotion, text], i) => ({
      type, anchor: solo ? 'A' : anchor, emotion, text, hasImage: i === 1, location: i === 1 ? { place: 'Lisbon', lat: 38.7, lon: -9.1 } : null,
      shot: i === 1 ? 'close' : undefined, cues: i === 1 ? [{ char: 70, slot: null, action: 'count' }] : [],
    })),
  }];
}));
let LIVE = null;
let planMod = null;
import('../direction/index.js').then((m) => (planMod = m)).catch(() => (planMod = null));
let fontMod = null;
import('../../../font.js').then((m) => (fontMod = m)).catch(() => (fontMod = null));

const PLAN_COL = { gesture: '#e43b44', emotion: '#feae34', look: '#2ce8f5', shot: '#8b9bb4' };
setPlannerView((t, ctx2d) => {
  frame.clear(C.black);
  if (ctx2d) frame.present(ctx2d);
  if (!ctx2d || !planMod || !fontMod) return;
  const ep = (LIVE && LIVE.find((e) => e.program?.id === state.programme)) || SAMPLES[state.programme] || SAMPLES['world-now'];
  const i = Math.max(0, Math.min(ep.segments.length - 1, state.segment | 0));
  const { ctx, events } = planMod.planSegment(ep, i, {});
  const T = (x) => 8 + (x / Math.max(1, ctx.duration + 2.5)) * 368;
  const txt = (s, x, y, c = '#c0cbdc', font = 'micro') => fontMod.drawText(ctx2d, s, x, y, { color: c, font });
  txt(`${ep.program?.id || '?'}  seg ${i}/${ep.segments.length - 1}  ${ctx.type}  ${ctx.speaker}:${ctx.speakerId}${ctx.grave ? '  GRAVE' : ''}  ${ctx.duration.toFixed(1)} s`, 8, 10, '#ffffff');
  // words: a tick each, stressed words tall and named
  ctx2d.fillStyle = '#3a4466';
  ctx2d.fillRect(8, 60, 368, 1);
  let lastLabel = -99;
  for (const w of ctx.words) {
    const x = Math.round(T(w.t));
    ctx2d.fillStyle = w.stressed ? '#feae34' : w.figure ? '#63c74d' : '#5a6988';
    ctx2d.fillRect(x, w.stressed ? 52 : 57, 1, w.stressed ? 9 : 4);
    if (w.stressed && x - lastLabel > 26) {
      txt(ctx.seg.text.slice(w.char, w.end).toUpperCase().slice(0, 8), x, 48, '#feae34');
      lastLabel = x;
    }
  }
  // cuts
  for (const c of ctx.shots) {
    const x = Math.round(T(c.at));
    ctx2d.fillStyle = '#8b9bb4';
    ctx2d.fillRect(x, 22, 1, 40);
    ctx2d.fillStyle = '#262b44';
    ctx2d.fillRect(x + 1, 22, Math.max(1, Math.round(T(c.at + ctx.cutGuard) - x)), 3);
    txt(String(c.shot).toUpperCase(), x + 2, 30, '#8b9bb4');
  }
  // events: bars from start to end, apex tick
  let row = 0;
  for (const e of events) {
    if (e.kind === 'shot') continue;
    const y = 70 + row * 12;
    row = (row + 1) % 10;
    const x0 = Math.round(T(e.at));
    let x1 = x0 + 3;
    if (e.kind === 'gesture') x1 = Math.round(T(e.at + durOfEv(e)));
    if (e.kind === 'look') x1 = Math.round(T(e.at + (e.dur || 1)));
    ctx2d.fillStyle = PLAN_COL[e.kind] || '#ffffff';
    ctx2d.fillRect(x0, y, Math.max(2, x1 - x0), 3);
    if (e.apexAt != null) {
      ctx2d.fillStyle = '#ffffff';
      ctx2d.fillRect(Math.round(T(e.apexAt)), y - 2, 1, 7);
    }
    txt(`${e.slot} ${e.kind === 'gesture' ? e.name + (e.variant ? ':' + e.variant : '') + (e.n ? ' ' + e.n : '') + (e.amp ? ' a' + e.amp : '') : e.kind === 'look' ? 'look ' + (e.target || '') : e.name}  ${e.planner || ''}`, Math.min(300, x0), y + 9, PLAN_COL[e.kind] || '#ffffff');
  }
  // the text, wrapped
  const lines = fontMod.wrapText(ctx.seg.text, 368, 1, 'micro');
  lines.slice(0, 4).forEach((l, k) => txt(l, 8, 186 + k * 8, '#8b9bb4'));
});

function durOfEv(e) {
  const g = GESTURES[e.name];
  if (!g) return 1;
  const d = defOf(e);
  const sp = (e.speed || 1) * (e.amp != null && e.amp < 1 ? 1 - (1 - Math.max(0.5, e.amp)) * 0.4 : 1);
  return d.dur / sp;
}

// ---------------------------------------------------------------------------
// page wiring (only in a browser page with #screen)

if (typeof document !== 'undefined' && document.getElementById('screen')) {
  const canvas = document.getElementById('screen');
  const lab = createHandsLab(canvas);
  window.__lab = lab;
  const $ = (id) => document.getElementById(id);
  const fill = (id, list, val) => {
    const el = $(id);
    if (!el) return;
    for (const n of list) el.add(new Option(String(n), String(n)));
    el.value = String(val);
    el.onchange = () => {
      const v = el.value;
      lab.set({ [id]: id === 'scale' || id === 'seat' || id === 'n' || id === 'zoom' ? Number(v) || null : v === '-' ? null : v });
      t0 = performance.now();
    };
  };
  fill('mode', ['gesture', 'shapes', 'blend', 'cast', 'planner'], state.mode);
  fill('presenter', PRESENTER_IDS, state.presenter);
  fill('seat', [1, -1], state.seat);
  fill('gesture', Object.keys(GESTURES), state.gesture);
  fill('variant', ['-', ...new Set(Object.values(GESTURES).flatMap((g) => Object.keys(g.variants || {})))], '-');
  fill('n', ['-', 1, 2, 3, 4, 5], '-');
  fill('scale', [1, 1.37, 2.15, 2.7, 3.4, 4], state.scale);
  fill('zoom', [1, 2, 3, 4], 1);
  const still = new URLSearchParams(location.search).has('still');
  let playing = !still;
  let t0 = performance.now();
  $('play').onclick = () => {
    playing = !playing;
    $('play').textContent = playing ? 'pause' : 'play';
  };
  const loop = () => {
    if (playing) {
      const t = ((performance.now() - t0) / 1000) % 4.5;
      lab.render(t);
    }
    requestAnimationFrame(loop);
  };
  lab.render(0);
  if (!still) loop();
}

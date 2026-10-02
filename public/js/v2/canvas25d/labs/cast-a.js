// Lab driver for PRESENTERS A (owner: PRESENTERS A stream): Paco, Lola, Sam
// and Penny in isolation, deterministic for contact sheets
// (public/lab/v2-cast-a.html). DOM-free at import, so node can use it too.
//
//   const lab = createCastALab(canvas | null)
//   lab.render(t)     draw instant t (seconds) of the current mode
//   lab.set({ mode, presenter, seat, scale, emotion, gesture, yaw, pitch, bg, k, zoom })
//   lab.bench(n)      { min, median, runs } ms per frame: one presenter in a close single (k = 4), 5 runs
//   lab.profile(n)    ms per frame by section: total, face (FACES), hair, body (neck, outfit, ears),
//                     look (over hooks), arms (HANDS), resolve, and `rest` = total − face
//   modes
//     'lineup'      the four in columns at `scale` (each rendered alone, 96 px wide), seat +1 | -1
//     'closeup'     one presenter at `scale` on ink, idle at t, optional yaw / pitch offsets
//     'turnaround'  closeup; t 0..4 sweeps yaw −0.5 → 0.5, t 4..8 pitch −0.15 → 0.15
//     'idle'        closeup with the idle layer only (breathing, blinks, sway)
//     'talk'        closeup speaking LINE (visemes.js buildSpeech)
//     'gesture'     closeup performing `gesture` (any GESTURES name) from t = 0.3, looping every 4 s
//     'studio'      the approved close single (camera.js singleCam, k) in the set, speaking
//   `bg`: 'ink' (default) or 'set' (studio background behind closeups when the set module loads)
//   `zoom`: integer nearest-neighbour enlargement around the head for close-up modes (1 = off)
import { C } from '../pixbuf.js';
import { frame, parts, actor, drawActors } from '../scene.js';
import { drawCharacter, CHAR_PROFILE, GROUPS_PER_ACTOR } from '../character.js';
import { poseAt } from '../rig.js';
import { GESTURES } from '../gestures/index.js';
import { buildSpeech } from '../visemes.js';
import { singleCam, placeActor } from '../camera.js';
import { SET } from '../studio/geometry.js';

export const CAST_A = ['paco', 'lola', 'sam', 'penny'];
export const SCALES = [1, 1.37, 2.15, 3.4];
export const LINE = "Good evening. Here are tonight's top stories from around the world.";
const W = 384, H = 216;
const clipRows = new Int16Array(W);
const comp = new Uint32Array(W * H);
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// The studio set belongs to another stream and may be mid-edit: load it lazily, fall back to ink.
let SETMOD = null;
import('../studio/set.js').then((m) => { SETMOD = m; }).catch(() => { SETMOD = null; });

const state = { mode: 'lineup', presenter: 'paco', seat: 1, scale: 2.15, emotion: null, gesture: 'raise_hand', yaw: 0, pitch: 0, bg: 'ink', k: 4, zoom: 1 };
const actors = new Map();
function actorFor(id, kind) {
  const key = `${id}|${kind}|${state.seat}|${state.emotion}|${state.gesture}`;
  let a = actors.get(key);
  if (!a) {
    const perf = { side: state.seat, seed: 11, emotions: state.emotion ? [{ t0: 0, name: state.emotion }] : [] };
    if (kind === 'talk') perf.speech = buildSpeech(LINE, { t0: 0.4 });
    a = actor(id, perf);
    actors.set(key, a);
  }
  if (kind === 'gesture') a.perf.gestures = GESTURES[state.gesture] ? [{ name: state.gesture, t0: 0.3 }] : [];
  return a;
}

/** Neck-base row for a scale: wides show the upper body, close-ups keep the head in the upper third. */
export function neckRow(s) {
  return Math.max(80, Math.min(200, Math.round(30 + 26 * s)));
}

function background(cam, t) {
  if ((state.bg === 'set' || cam) && SETMOD) {
    try {
      SETMOD.drawBackground(frame, cam, t);
      return true;
    } catch { /* fall through */ }
  }
  frame.clear(C.ink);
  return false;
}

/** Draw one presenter with optional head offsets (turnaround) at screen (x, y), scale s; returns the head frame. */
function drawOne(a, t, x, y, s, yaw = 0, pitch = 0, clip = null) {
  parts.clear();
  if (clip) parts.clipY.set(clip);
  const sk = poseAt(a, t);
  sk.head.yaw += yaw;
  sk.head.pitch += pitch;
  const head = drawCharacter(parts, a.look, sk, { x, y, s, gb: 0, clip: !!clip });
  parts.resolve(frame);
  return head;
}

/** Nearest-neighbour zoom of the frame around (cx, cy) by an integer factor (inspection at 1x pixels). */
function zoomFrame(cx, cy, z) {
  if (!(z > 1)) return;
  const w = Math.floor(W / z), h = Math.floor(H / z);
  const x0 = Math.max(0, Math.min(W - w, Math.round(cx - w / 2))), y0 = Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
  for (let y = 0; y < H; y++) {
    const sy = y0 + Math.min(h - 1, (y / z) | 0);
    for (let x = 0; x < W; x++) comp[y * W + x] = frame.px[sy * W + x0 + Math.min(w - 1, (x / z) | 0)];
  }
  frame.px.set(comp);
}

function lineup(t) {
  const s = state.scale;
  const y = neckRow(s);
  for (let i = 0; i < 4; i++) {
    frame.clear(C.ink);
    drawOne(actorFor(CAST_A[i], 'idle'), t, 192, y, s);
    for (let r = 0; r < H; r++) comp.set(frame.px.subarray(r * W + 144, r * W + 240), r * W + i * 96);
  }
  frame.px.set(comp);
  // 1 px column separators in black
  for (let i = 1; i < 4; i++) for (let r = 0; r < H; r++) frame.px[r * W + i * 96] = C.black;
}

function closeup(t, kind, yaw = state.yaw, pitch = state.pitch) {
  const s = state.scale;
  background(state.bg === 'set' ? singleCam('A', s * 1.0) : null, t);
  const head = drawOne(actorFor(state.presenter, kind), t, 192, neckRow(s), s, yaw, pitch);
  // zoom: the head and shoulders enlarged (head a third down the frame)
  if (state.zoom > 1) zoomFrame(head.cx, head.cy + 4 * s, state.zoom);
}

function turnaround(t) {
  const u = ((t % 8) + 8) % 8;
  const yaw = u < 4 ? -0.5 + u / 4 : 0;
  const pitch = u < 4 ? 0 : -0.15 + 0.3 * ((u - 4) / 4);
  closeup(0, 'idle', state.yaw + yaw, state.pitch + pitch);
}

function studio(t) {
  const slot = state.seat === -1 ? 'B' : 'A';
  const cam = singleCam(slot, state.k);
  clipRows.fill(H);
  if (background(cam, t)) {
    try {
      SETMOD.drawDesk(frame, cam, clipRows, C.red);
    } catch {
      clipRows.fill(H);
    }
  }
  const a = actorFor(state.presenter, 'talk');
  const pl = placeActor(cam, slot === 'B' ? SET.seatX.B : SET.seatX.A);
  drawActors(t, [{ actor: a, x: pl.x, y: pl.y, s: pl.s }], clipRows);
}

const MODES = {
  lineup,
  closeup: (t) => closeup(t, 'idle'),
  turnaround,
  idle: (t) => closeup(t, 'idle'),
  talk: (t) => closeup(t, 'talk'),
  gesture: (t) => closeup(((t % 4) + 4) % 4, 'gesture'),
  studio,
};

// ---------------------------------------------------------------------------
// Bench: one presenter in a close single at k = 4 (s ≈ 4), the desk clipping the torso
// as in the channel; no background (the set has its own budget).
const benchRows = new Int16Array(W);
function benchFrame(a, t, s, y) {
  frame.clear(C.ink);
  parts.clear();
  parts.clipY.set(benchRows);
  const sk = poseAt(a, t);
  drawCharacter(parts, a.look, sk, { x: 192, y, s, gb: 0, clip: true });
  parts.resolve(frame);
}

export function createCastALab(canvas = null) {
  const ctx = canvas ? canvas.getContext('2d') : null;
  const lab = {
    render(t = 0) {
      (MODES[state.mode] || lineup)(t);
      if (ctx) frame.present(ctx);
    },
    set(opts = {}) {
      Object.assign(state, opts);
      return { ...state };
    },
    /** ms per frame for one presenter (state.presenter) at k = 4: min and median of 5 runs. */
    bench(n = 240, presenter = state.presenter) {
      const a = actor(presenter, { side: 1, seed: 11, speech: buildSpeech(LINE, { t0: 0.4 }) });
      const s = Math.round(22 * 4) / 22, y = 120;
      benchRows.fill(Math.round(y + 30 * s));
      for (let i = 0; i < 30; i++) benchFrame(a, 0.5 + i / 60, s, y);
      const runs = [];
      for (let r = 0; r < 5; r++) {
        const t0 = now();
        for (let i = 0; i < n; i++) benchFrame(a, 0.5 + i / 60, s, y);
        runs.push((now() - t0) / n);
      }
      runs.sort((p, q) => p - q);
      return { min: +runs[0].toFixed(3), median: +runs[2].toFixed(3), runs: runs.map((v) => +v.toFixed(3)) };
    },
    /** Section timings (ms per frame) for one presenter at k = 4 (minimum over 5 runs per section). */
    profile(n = 120, presenter = state.presenter) {
      const a = actor(presenter, { side: 1, seed: 11, speech: buildSpeech(LINE, { t0: 0.4 }) });
      const s = Math.round(22 * 4) / 22, y = 120;
      benchRows.fill(Math.round(y + 30 * s));
      for (let i = 0; i < 30; i++) benchFrame(a, 0.5 + i / 60, s, y);
      const best = { total: Infinity, pose: Infinity, resolve: Infinity, body: Infinity, face: Infinity, hair: Infinity, look: Infinity, arms: Infinity };
      for (let r = 0; r < 5; r++) {
        Object.assign(CHAR_PROFILE, { on: true, body: 0, face: 0, hair: 0, look: 0, arms: 0, n: 0 });
        let pose = 0, res = 0, tot = 0;
        for (let i = 0; i < n; i++) {
          const t = 0.5 + i / 60;
          const a0 = now();
          frame.clear(C.ink);
          parts.clear();
          parts.clipY.set(benchRows);
          const sk = poseAt(a, t);
          const a1 = now();
          drawCharacter(parts, a.look, sk, { x: 192, y, s, gb: 0, clip: true });
          const a2 = now();
          parts.resolve(frame);
          const a3 = now();
          pose += a1 - a0;
          res += a3 - a2;
          tot += a3 - a0;
        }
        CHAR_PROFILE.on = false;
        const k = 1 / n;
        best.total = Math.min(best.total, tot * k);
        best.pose = Math.min(best.pose, pose * k);
        best.resolve = Math.min(best.resolve, res * k);
        for (const key of ['body', 'face', 'hair', 'look', 'arms']) best[key] = Math.min(best[key], CHAR_PROFILE[key] * k);
      }
      const out = {};
      for (const [key, v] of Object.entries(best)) out[key] = +v.toFixed(3);
      out.rest = +(best.total - best.face).toFixed(3);
      out.mine = +(best.body + best.hair + best.look).toFixed(3);
      return out;
    },
    state,
    modes: Object.keys(MODES),
  };
  return lab;
}

export { GROUPS_PER_ACTOR };

// Lab driver for FULL TIME's presenters (docs/programmes/full-time.md §2): the owner's comparison sheet of the three
// candidate looks of Kai Sprite and Rosa Rally (cast/full-time.js), and the look on air in every framing, in both
// renderers. Deterministic: every sheet draws fixed instants. DOM-free at import (node can import it), the sheets
// need a 2D canvas.
//
//   const lab = createFullTimeLab()
//   lab.sheet(name, canvas)   draw a sheet into `canvas` (resized to fit) and return its size:
//     'candidates'  one row per candidate: the close single at 1x (neutral, talking) and its head at 4x (neutral,
//                   talking), the wide shot's figure at 1x and 4x
//     'pairs'       the two-shot of every Kai candidate beside every Rosa candidate (3 x 3), Kai talking
//     'onair'       the looks on air (FULL_TIME_LOOK) in the wide, two-shot, singles, closes, MCUs and OTS
//     'legacy'      the old renderer: each candidate's wide sprite and close-up portrait (anchors.js, portraits.js)
//   lab.frame(opts, t)        one 384 x 216 frame as a Uint32Array: { shot, A, B, focus, talk: 'A'|'B'|null }
import { frame, drawActors } from '../scene.js';
import { lookFor } from '../cast/index.js';
import { KAI_CANDIDATES, ROSA_CANDIDATES, CANDIDATE_NOTES } from '../cast/full-time.js';
import { C } from '../pixbuf.js';
import { buildSpeech } from '../visemes.js';
import * as cam from '../camera.js';
import { SET } from '../studio/geometry.js';
import { FULL_TIME_LOOK } from '../../../full-time-looks.js';

const W = 384, H = 216;
const PROGRAMME = 'full-time';
export const KAI_IDS = Object.values(KAI_CANDIDATES).map((L) => L.id);
export const ROSA_IDS = Object.values(ROSA_CANDIDATES).map((L) => L.id);
const LINE_A = 'Good evening. A long wait ended tonight: four one, and a first title in nine years.';
const LINE_B = 'Nine years, Kai. You were still in goal back then.';
// the instants: a still moment before anyone speaks, and one inside each line with the mouth open
export const T_NEUTRAL = 0.25;
export const T_TALK = { A: 1.62, B: 2.1 };

let SETMOD = null;
const setReady = import('../studio/set.js').then((m) => (SETMOD = m)).catch(() => null);

const actors = new Map();
function actorFor(id, slot, talk) {
  const key = `${id}|${slot}|${talk}`;
  let a = actors.get(key);
  if (!a) {
    const sa = buildSpeech(LINE_A, { t0: 0.4 });
    const tb = sa.t1 + 0.8;
    const perf = { side: slot === 'B' ? -1 : 1, seed: slot === 'B' ? 29 : 17, gestures: [], emotions: [], look: [] };
    if (talk === slot) perf.speech = slot === 'A' ? sa : buildSpeech(LINE_B, { t0: 0.4 });
    else if (talk) perf.look = [{ t0: 0.5, t1: 9 }]; // the other one listens, turned to the speaker
    void tb;
    a = { id, look: lookFor(id), perf };
    actors.set(key, a);
  }
  return a;
}

const clip = new Int16Array(W);
/** One frame (copied out of the shared frame): { shot: framing name, A, B, focus, talk }. */
export function renderFrame({ shot = 'two', A = 'kai', B = 'rosa', focus = 'A', talk = null, bg = true }, t) {
  const camera = cam.framing(shot, { cast: { A, B }, focus, programId: PROGRAMME });
  frame.clear(C.ink);
  clip.fill(H);
  if (bg && SETMOD) {
    try {
      SETMOD.drawBackground(frame, camera, t, { style: PROGRAMME });
      SETMOD.drawDesk(frame, camera, clip, PROGRAMME);
    } catch {
      frame.clear(C.ink);
    }
  }
  const list = [];
  for (const [id, slot] of [[A, 'A'], [B, 'B']]) {
    if (!id) continue;
    const p = cam.placeActor(camera, SET.seatX[slot]);
    list.push({ actor: actorFor(id, slot, talk), x: p.x, y: p.y, s: p.s });
  }
  const heads = drawActors(t, list, bg ? clip : null);
  return { px: new Uint32Array(frame.px), heads: heads.map((h) => ({ cx: h.cx, cy: h.cy, s: h.s })) };
}

// ---------------------------------------------------------------------------
// Sheet composition (2D canvas)

function toCanvas(px, mk) {
  const c = mk(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  new Uint32Array(img.data.buffer).set(px);
  g.putImageData(img, 0, 0);
  return c;
}

function blit(ctx, src, sx, sy, sw, sh, dx, dy, z) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, sw, sh, dx, dy, sw * z, sh * z);
}

function label(ctx, text, x, y, colour = '#c0cbdc', size = 12) {
  ctx.fillStyle = colour;
  ctx.font = `${size}px monospace`;
  ctx.fillText(text, x, y);
}

const SLOT_OF = (id) => (id.startsWith('rosa') ? 'B' : 'A');
const PARTNER = (id) => (id.startsWith('rosa') ? 'kai' : 'rosa');

/** The 'candidates' sheet. */
function sheetCandidates(ctx, mk) {
  const ids = [...KAI_IDS, ...ROSA_IDS];
  const rowH = 344, x0 = 12;
  ctx.canvas.width = 1500;
  ctx.canvas.height = 70 + ids.length * rowH;
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  label(ctx, 'FULL TIME: candidate looks for the owner (A airs until chosen; switch: public/js/full-time-looks.js)', x0, 22, '#feae34', 14);
  label(ctx, 'close single 1x: neutral | talking        head at 4x: neutral | talking        wide figure 1x | 4x', x0, 44);
  ids.forEach((id, n) => {
    const y = 60 + n * rowH;
    const slot = SLOT_OF(id);
    const person = slot === 'A' ? 'kai' : 'rosa';
    const letter = id.slice(-1).toUpperCase();
    const onAir = FULL_TIME_LOOK[person] === letter;
    label(ctx, `${person.toUpperCase()} ${letter}${onAir ? '  (on air)' : ''}: ${CANDIDATE_NOTES[person][letter]}`, x0, y + 12, onAir ? '#feae34' : '#c0cbdc');
    const cast = slot === 'A' ? { A: id, B: 'rosa' } : { A: 'kai', B: id };
    let x = x0;
    for (const talk of [null, slot]) {
      const f = renderFrame({ shot: 'close', ...cast, focus: slot, talk }, talk ? T_TALK[slot] : T_NEUTRAL);
      const h = f.heads[slot === 'A' ? 0 : 1];
      const c = toCanvas(f.px, mk);
      const cw = 150, ch = 220;
      const sx = Math.round(Math.max(0, Math.min(W - cw, h.cx - cw / 2))), sy = Math.round(Math.max(0, Math.min(H - ch, h.cy - ch * 0.38)));
      blit(ctx, c, sx, sy, cw, ch, x, y + 20, 1);
      x += cw + 8;
    }
    for (const talk of [null, slot]) {
      // the single (s 3.4): the whole head at 4x
      const f = renderFrame({ shot: 'single', ...cast, focus: slot, talk }, talk ? T_TALK[slot] : T_NEUTRAL);
      const h = f.heads[slot === 'A' ? 0 : 1];
      const c = toCanvas(f.px, mk);
      const cw = 64, ch = 78;
      const sx = Math.round(h.cx - cw / 2), sy = Math.round(Math.max(0, h.cy - ch * 0.6));
      blit(ctx, c, sx, sy, cw, ch, x, y + 20, 4);
      x += cw * 4 + 8;
    }
    // the wide: the figure at 1x, and at 4x
    const f = renderFrame({ shot: 'wide', ...cast, talk: slot }, T_TALK[slot]);
    const h = f.heads[slot === 'A' ? 0 : 1];
    const c = toCanvas(f.px, mk);
    blit(ctx, c, Math.round(h.cx - 30), Math.round(h.cy - 20), 60, 80, x, y + 20, 1);
    blit(ctx, c, Math.round(h.cx - 14), Math.round(h.cy - 14), 28, 50, x + 66, y + 20, 4);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'pairs' sheet: every Kai candidate beside every Rosa candidate in the two-shot. */
function sheetPairs(ctx, mk, talk = 'A') {
  const z = 1;
  ctx.canvas.width = 24 + 3 * (W * z + 12);
  ctx.canvas.height = 50 + 3 * (H * z + 30);
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  label(ctx, `FULL TIME two-shot: rows Kai A/B/C, columns Rosa A/B/C (${talk === 'A' ? 'Kai talking' : talk === 'B' ? 'Rosa talking' : 'neutral'}; set: placeholder)`, 12, 22, '#feae34', 14);
  KAI_IDS.forEach((k, r) => {
    ROSA_IDS.forEach((rid, c) => {
      const f = renderFrame({ shot: 'two', A: k, B: rid, talk }, talk ? T_TALK[talk] : T_NEUTRAL);
      const x = 12 + c * (W * z + 12), y = 40 + r * (H * z + 30);
      label(ctx, `${k.toUpperCase()} + ${rid.toUpperCase()}`, x, y + 12);
      blit(ctx, toCanvas(f.px, mk), 0, 0, W, H, x, y + 18, z);
    });
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'onair' sheet: the looks on air in every framing. */
function sheetOnAir(ctx, mk) {
  const shots = [['wide', 'A', 'A'], ['two', 'A', 'B'], ['single', 'A', 'A'], ['single', 'B', 'B'], ['close', 'A', 'A'], ['close', 'B', 'B'], ['mcu-l', 'A', 'A'], ['mcu-r', 'B', 'B'], ['ots', 'A', 'B'], ['ots', 'B', 'A']];
  const cols = 2;
  ctx.canvas.width = 24 + cols * (W * 2 + 12);
  ctx.canvas.height = 40 + Math.ceil(shots.length / cols) * (H * 2 + 26);
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  label(ctx, `FULL TIME on air: kai ${FULL_TIME_LOOK.kai}, rosa ${FULL_TIME_LOOK.rosa} (2x; set: placeholder)`, 12, 22, '#feae34', 14);
  shots.forEach(([shot, focus, talk], n) => {
    const f = renderFrame({ shot, A: 'kai', B: 'rosa', focus, talk }, T_TALK[talk] + (n % 3) * 0.04);
    const x = 12 + (n % cols) * (W * 2 + 12), y = 34 + Math.floor(n / cols) * (H * 2 + 26);
    label(ctx, `${shot} ${focus} (talking: ${talk})`, x, y + 12);
    blit(ctx, toCanvas(f.px, mk), 0, 0, W, H, x, y + 16, 2);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'legacy' sheet: the old renderer's wide sprites (2 per frame, A and B candidates) and close-up portraits. */
async function sheetLegacy(ctx, mk) {
  const [{ drawAnchor, drawHands, FULL_TIME_OLD }, { drawCloseup }] = await Promise.all([import('../../../anchors.js'), import('../../../scenes/portraits.js')]);
  const letters = ['A', 'B', 'C'];
  ctx.canvas.width = 24 + 3 * (W + 12);
  ctx.canvas.height = 260 + 2 * (H + 28);
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  label(ctx, 'FULL TIME in the old renderer: wide sprites (Kai | Rosa) and close-up portraits, candidates A / B / C', 12, 22, '#feae34', 14);
  letters.forEach((l, i) => {
    const c = mk(W, H);
    const g = c.getContext('2d');
    g.fillStyle = '#262b44';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a4466';
    g.fillRect(0, 118, W, 98);
    g.fillStyle = '#c0cbdc';
    g.fillRect(0, 118, W, 1);
    const kai = FULL_TIME_OLD.kai[l], rosa = FULL_TIME_OLD.rosa[l];
    const st = { t: 1, speaking: false, emotion: 'neutral', mouth: 0, blink: false, look: 0, bob: 0, gesture: 0 };
    drawAnchor(g, 142, 80, kai, { ...st, look: 1 });
    drawAnchor(g, 242, 80, rosa, { ...st, look: -1 });
    drawHands(g, 142, 118, kai, 0);
    drawHands(g, 242, 118, rosa, 0);
    const x = 12 + i * (W + 12);
    label(ctx, `wide sprites (2x), candidates ${l}`, x, 44);
    blit(ctx, c, 96, 44, 192, 96, x, 50, 2);
  });
  ['kai', 'rosa'].forEach((p, r) => {
    letters.forEach((l, i) => {
      const c = mk(W, H);
      const g = c.getContext('2d');
      drawCloseup(g, 1, `${p}-${l.toLowerCase()}`, { t: 1, speaking: false, emotion: 'neutral', mouth: 0, blink: false, look: 0 }, { side: p === 'kai' ? 'left' : 'right', accent: '#f77622' });
      const x = 12 + i * (W + 12), y = 250 + r * (H + 28);
      label(ctx, `close-up ${p.toUpperCase()} ${l}`, x, y + 12);
      blit(ctx, c, 0, 0, W, H, x, y + 18, 1);
    });
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

export function createFullTimeLab() {
  const mk = (w, h) => {
    const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    return c;
  };
  return {
    ready: () => setReady,
    frame: renderFrame,
    async sheet(name, canvas) {
      await setReady;
      const ctx = canvas.getContext('2d');
      if (name === 'candidates') return sheetCandidates(ctx, mk);
      if (name === 'pairs') return sheetPairs(ctx, mk, 'A');
      if (name === 'pairs-b') return sheetPairs(ctx, mk, 'B');
      if (name === 'pairs-neutral') return sheetPairs(ctx, mk, null);
      if (name === 'onair') return sheetOnAir(ctx, mk);
      if (name === 'legacy') return sheetLegacy(ctx, mk);
      throw new Error(`unknown sheet ${name}`);
    },
  };
}

export const SHEETS = ['candidates', 'pairs', 'pairs-b', 'pairs-neutral', 'onair', 'legacy'];

// Lab driver for PAY ATTENTION's host (docs/programmes/pay-attention.md §2, step 6): the owner's comparison sheets of
// the quizmaster's three candidate looks (cast/pay-attention.js) beside the eight contestants, in both renderers.
// Deterministic: every sheet draws fixed instants. DOM-free at import (node can import it); the sheets need a 2D
// canvas.
//
//   const lab = createPayAttentionLab()
//   lab.sheet(name, canvas)   draw a sheet into `canvas` (resized to fit) and return its size:
//     'candidates'   one row per candidate: the close single at 1x (neutral, talking), the head at 4x (neutral,
//                    talking), the seated figure in the wide at 1x and 4x
//     'contestants'  the three candidates and the eight contestants (Kai and Rosa once approved) side by side: the
//                    seated figure at 1x and the head at 4x, on the dark placeholder stage
//     'quiz'         each candidate at the centre podium between two contestants (four pairings), 1x and 2x
//     'onair'        the look on air (HOST_LOOK) in the quiz's framings, host talking and listening
//     'gestures'     the quizmaster's gestures (HOST_GESTURES.allow) on each candidate, at the apex, 2x
//     'legacy'       the old renderer: each candidate's wide sprite and close-up portrait (anchors.js, portraits.js)
//   lab.frame(opts, t)        one 384 x 216 frame as a Uint32Array: { host, A, B, shot, talk }
//
// The stage is a placeholder (the quiz studio is step 5, public/js/set.js and the v2 studio): a dark room, the
// question board behind the host in the programme's purple with its fog rim (bible §6), the podium and two desks.
import { frame, drawActors } from '../scene.js';
import { lookFor } from '../cast/index.js';
import { HOST_CANDIDATES, CANDIDATE_NOTES, HOST_NAMES, HOST_GESTURES } from '../cast/pay-attention.js';
import { C, u32 } from '../pixbuf.js';
import { buildSpeech } from '../visemes.js';
import * as cam from '../camera.js';
import { SET } from '../studio/geometry.js';
import { P } from '../../../palette.js';
import { HOST_LOOK } from '../../../pay-attention-looks.js';

const W = 384, H = 216;
export const HOST_IDS = Object.values(HOST_CANDIDATES).map((L) => L.id);
/** The contestants (bible §2): the eight presenters, then FULL TIME's two once approved. */
export const CONTESTANTS = ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam'];
export const LATER = ['kai', 'rosa'];
export const PAIRS = [['penny', 'nova'], ['max', 'lola'], ['paco', 'ada'], ['sam', 'unit8']];
const LINE_HOST = 'Good evening, and welcome to the quiz on what this channel told you this week.';
const LINE_PLAYER = 'I will go for B. Final answer.';
export const T_NEUTRAL = 0.25;
export const T_TALK = 1.62;

const actors = new Map();
function actorFor(id, role, talk) {
  const key = `${id}|${role}|${talk}`;
  let a = actors.get(key);
  if (!a) {
    const side = role === 'B' ? -1 : 1;
    const perf = { side, seed: role === 'B' ? 29 : role === 'A' ? 17 : 23, gestures: [], emotions: [], look: [] };
    if (talk === role) perf.speech = buildSpeech(role === 'host' ? LINE_HOST : LINE_PLAYER, { t0: 0.4 });
    else if (talk) perf.look = [{ t0: 0.5, t1: 9 }];
    a = { id, look: lookFor(id), perf };
    actors.set(key, a);
  }
  return a;
}

// ---------------------------------------------------------------------------
// The placeholder stage

const INK = C.ink, BLACK = C.black, SLATE = C.slate, FOG = C.fog, PURPLE = C.purple, GOLD = C.yellow, WHITE = C.white;
function fillRect(x0, y0, x1, y1, c) {
  x0 = Math.max(0, Math.round(x0));
  y0 = Math.max(0, Math.round(y0));
  x1 = Math.min(W, Math.round(x1));
  y1 = Math.min(H, Math.round(y1));
  for (let y = y0; y < y1; y++) frame.px.fill(c, y * W + x0, y * W + x1);
}
function rimRect(x0, y0, x1, y1, fill, rim) {
  fillRect(x0, y0, x1, y1, rim);
  fillRect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, fill);
}
/** The room and the board behind the host (screen space, from the host's placement). */
function drawStage(host) {
  frame.clear(INK);
  if (!host) return;
  const s = host.s;
  // the floor below the desks' tops is black (the dark stage)
  fillRect(0, Math.round(host.y + -SET.neckY * s + 14 * s), W, H, BLACK);
  // the question board behind the host's head and shoulders: the programme's purple with its fog rim (bible §6), one
  // row of white type standing in for a question
  const bw = 92 * s, bh = 40 * s;
  const bx = host.x - bw / 2, by = host.y - 42 * s;
  rimRect(bx, by, bx + bw, by + bh, PURPLE, FOG);
  fillRect(bx + 6 * s, by + 6 * s, bx + bw * 0.62, by + 7.4 * s, WHITE);
}
/** Desks over the seated bodies: the host's podium (purple front, fog rim), the players' desks with a gold lamp. */
const deskHW = (it) => (it.role === 'host' ? 18 : 24) * it.s;
function deskClip(list) {
  const clip = new Int16Array(W).fill(H);
  for (const it of list) {
    const top = Math.round(it.y + -SET.neckY * it.s);
    const hw = deskHW(it);
    for (let x = Math.max(0, Math.round(it.x - hw)); x < Math.min(W, Math.round(it.x + hw)); x++) clip[x] = Math.min(clip[x], top);
  }
  return clip;
}
function drawDesks(list) {
  for (const it of list) {
    const top = Math.round(it.y + -SET.neckY * it.s);
    const hw = deskHW(it), bottom = Math.min(H + 2, top + 26 * it.s);
    if (it.role === 'host') {
      rimRect(it.x - hw, top, it.x + hw, bottom, PURPLE, FOG);
      fillRect(it.x - hw + 1, top + 1, it.x + hw - 1, top + Math.max(2, 2 * it.s), SLATE);
    } else {
      rimRect(it.x - hw, top, it.x + hw, bottom, SLATE, FOG);
      const lx = it.x + (it.role === 'A' ? 1 : -1) * hw * 0.55, ly = top + 8 * it.s, r = Math.max(1, 2.2 * it.s);
      fillRect(lx - r, ly - r, lx + r, ly + r, GOLD);
    }
  }
}

/** One frame: the host at the centre podium (seat 'solo'), players A and B at their desks, through a framing. */
export function renderFrame({ host = 'qm', A = 'penny', B = 'nova', shot = 'wide', talk = null, desks = true }, t) {
  const players = A && B;
  const camera = players ? cam.framing(shot === 'host' ? 'wide' : shot, { cast: { A, B }, focus: 'A', programId: 'world-now' }) : cam.framing('mcu', { cast: { A: host }, solo: true, programId: 'world-now' });
  const list = [];
  const ph = cam.placeActor(camera, SET.seatX.solo ?? 0);
  const hostIt = host ? { actor: actorFor(host, 'host', talk), x: ph.x, y: ph.y, s: ph.s, role: 'host' } : null;
  if (players) {
    for (const [id, slot] of [[A, 'A'], [B, 'B']]) {
      const p = cam.placeActor(camera, SET.seatX[slot]);
      list.push({ actor: actorFor(id, slot, talk), x: p.x, y: p.y, s: p.s, role: slot });
    }
  }
  if (hostIt) list.push(hostIt);
  drawStage(hostIt);
  const heads = drawActors(t, list, desks ? deskClip(list) : null);
  if (desks) drawDesks(list);
  return { px: new Uint32Array(frame.px), heads: heads.map((h, i) => ({ cx: h.cx, cy: h.cy, s: h.s, role: list[i].role })) };
}

/** One look alone at scale s (neck base at row y), on the stage with the board behind: the head frame. */
export function renderSolo(id, s, y, t, talk = false, x = 192) {
  const it = { actor: actorFor(id, 'host', talk ? 'host' : null), x, y, s, role: 'host' };
  drawStage(it);
  const h = drawActors(t, [it], deskClip([it]))[0];
  drawDesks([it]);
  return { px: new Uint32Array(frame.px), head: { cx: h.cx, cy: h.cy, s: h.s } };
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
const letterOf = (id) => id.slice(-1).toUpperCase();
const bg = (ctx) => {
  ctx.fillStyle = '#181425';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
};

/** The 'candidates' sheet. */
function sheetCandidates(ctx, mk) {
  const rowH = 360, x0 = 12;
  ctx.canvas.width = 1500;
  ctx.canvas.height = 70 + HOST_IDS.length * rowH;
  bg(ctx);
  label(ctx, `PAY ATTENTION: the host's candidate looks for the owner (${HOST_LOOK} provisional; switch: public/js/pay-attention-looks.js)`, x0, 22, '#feae34', 14);
  label(ctx, 'close single 1x: neutral | talking        head at 4x: neutral | talking        seated in the wide 1x | 4x        (stage: placeholder)', x0, 44);
  HOST_IDS.forEach((id, n) => {
    const y = 60 + n * rowH;
    const l = letterOf(id);
    label(ctx, `${l}${l === HOST_LOOK ? ' (provisional)' : ''}  ${HOST_NAMES[l].name}: ${CANDIDATE_NOTES[l]}`, x0, y + 12, l === HOST_LOOK ? '#feae34' : '#c0cbdc');
    let x = x0;
    for (const talk of [false, true]) {
      // the close single (s 4.4): the host's head and shoulders at 1x
      const f = renderSolo(id, 4.4, 200, talk ? T_TALK : T_NEUTRAL, talk);
      const cw = 150, ch = 210;
      const sx = Math.round(Math.max(0, Math.min(W - cw, f.head.cx - cw / 2))), sy = Math.round(Math.max(0, Math.min(H - ch, f.head.cy - ch * 0.36)));
      blit(ctx, toCanvas(f.px, mk), sx, sy, cw, ch, x, y + 22, 1);
      x += cw + 8;
    }
    for (const talk of [false, true]) {
      // the single (s 3.4): the whole head at 4x
      const f = renderSolo(id, 3.4, 190, talk ? T_TALK : T_NEUTRAL, talk);
      const cw = 64, ch = 80;
      const sx = Math.round(f.head.cx - cw / 2), sy = Math.round(Math.max(0, f.head.cy - ch * 0.58));
      blit(ctx, toCanvas(f.px, mk), sx, sy, cw, ch, x, y + 22, 4);
      x += cw * 4 + 8;
    }
    // the wide: the seated figure at 1x and at 4x (talking)
    const f = renderFrame({ host: id, A: 'penny', B: 'nova', shot: 'wide', talk: 'host' }, T_TALK);
    const h = f.heads.find((k) => k.role === 'host');
    const c = toCanvas(f.px, mk);
    blit(ctx, c, Math.round(h.cx - 30), Math.round(h.cy - 22), 60, 80, x, y + 22, 1);
    blit(ctx, c, Math.round(h.cx - 16), Math.round(h.cy - 16), 32, 52, x + 66, y + 22, 4);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'contestants' sheet: every candidate and every contestant, the seated figure at 1x and the head at 4x. */
function sheetContestants(ctx, mk) {
  const ids = [...HOST_IDS, ...CONTESTANTS, ...LATER];
  const colW = 176, x0 = 12, per = Math.ceil(ids.length / 2);
  ctx.canvas.width = x0 * 2 + per * colW;
  ctx.canvas.height = 60 + 2 * 330;
  bg(ctx);
  label(ctx, 'PAY ATTENTION: the host candidates (gold) beside the contestants, seated in the wide (s 1): 1x, and the same pixels at 4x (stage: placeholder)', x0, 22, '#feae34', 14);
  ids.forEach((id, n) => {
    const col = n % per, row = Math.floor(n / per);
    const x = x0 + col * colW, y = 40 + row * 330;
    const host = HOST_IDS.includes(id);
    label(ctx, host ? `HOST ${letterOf(id)}` : `${id}${LATER.includes(id) ? ' (later)' : ''}`, x, y + 10, host ? '#feae34' : '#c0cbdc');
    const wide = renderSolo(id, 1, 140, T_TALK, true);
    const c = toCanvas(wide.px, mk);
    blit(ctx, c, Math.round(wide.head.cx - 20), Math.round(wide.head.cy - 16), 40, 54, x, y + 16, 1);
    blit(ctx, c, Math.round(wide.head.cx - 20), Math.round(wide.head.cy - 16), 40, 54, x, y + 78, 4);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'quiz' sheet: each candidate at the podium between four pairings of contestants. */
function sheetQuiz(ctx, mk, z = 1) {
  ctx.canvas.width = 24 + PAIRS.length * (W * z + 12);
  ctx.canvas.height = 50 + HOST_IDS.length * (H * z + 30);
  bg(ctx);
  label(ctx, `PAY ATTENTION wide three-shot: rows host A/B/C, columns the pairings (host talking; stage: placeholder; ${z}x)`, 12, 22, '#feae34', 14);
  HOST_IDS.forEach((id, r) => {
    PAIRS.forEach(([a, b], c) => {
      const f = renderFrame({ host: id, A: a, B: b, shot: 'wide', talk: 'host' }, T_TALK + c * 0.06);
      const x = 12 + c * (W * z + 12), y = 40 + r * (H * z + 30);
      label(ctx, `${a.toUpperCase()} | HOST ${letterOf(id)} | ${b.toUpperCase()}`, x, y + 12);
      blit(ctx, toCanvas(f.px, mk), 0, 0, W, H, x, y + 18, z);
    });
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'onair' sheet: the look on air in the framings the quiz will use. */
function sheetOnAir(ctx, mk) {
  const shots = [
    ['wide', 'host', 'penny', 'nova'], ['wide', 'A', 'max', 'lola'], ['host', 'host', null, null], ['host', null, null, null],
    ['two', 'host', 'paco', 'ada'], ['two', 'B', 'sam', 'unit8'],
  ];
  const cols = 2;
  ctx.canvas.width = 24 + cols * (W * 2 + 12);
  ctx.canvas.height = 40 + Math.ceil(shots.length / cols) * (H * 2 + 26);
  bg(ctx);
  label(ctx, `PAY ATTENTION on air: host ${HOST_LOOK} (qm) in the quiz's framings (2x; stage: placeholder)`, 12, 22, '#feae34', 14);
  shots.forEach(([shot, talk, a, b], n) => {
    const f = renderFrame({ host: 'qm', A: a, B: b, shot: shot === 'host' ? 'mcu' : shot, talk }, T_TALK + (n % 3) * 0.05);
    const x = 12 + (n % cols) * (W * 2 + 12), y = 34 + Math.floor(n / cols) * (H * 2 + 26);
    label(ctx, `${shot === 'host' ? 'host single (mcu)' : shot}${a ? ` ${a}/${b}` : ''} (talking: ${talk || 'nobody'})`, x, y + 12);
    blit(ctx, toCanvas(f.px, mk), 0, 0, W, H, x, y + 16, 2);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

const APEX = { nod: 0.55, point_partner: 1.0, look_partner: 1.0, point_screen: 1.0, raise_hand: 1.0, count: 1.2, lean_in: 0.9, steeple: 1.0, papers: 1.0 };
/** The 'gestures' sheet: the quizmaster's allowed gestures on each candidate (2x, at the apex). */
function sheetGestures(ctx, mk) {
  const gs = HOST_GESTURES.allow;
  const cw = 96, ch = 110, z = 2;
  ctx.canvas.width = 24 + gs.length * (cw * z + 8);
  ctx.canvas.height = 50 + HOST_IDS.length * (ch * z + 26);
  bg(ctx);
  label(ctx, 'PAY ATTENTION: the quizmaster\'s gestures (HOST_GESTURES.allow) at the apex, s 2.15, 2x (stage: placeholder)', 12, 22, '#feae34', 14);
  HOST_IDS.forEach((id, r) => {
    gs.forEach((g, c) => {
      const it = { actor: { id, look: lookFor(id), perf: { side: 1, seed: 23, gestures: [{ name: g, t0: 0.3 }], emotions: [], look: [] } }, x: 192, y: 70, s: 2.15, role: 'host' };
      drawStage(null);
      const h = drawActors(0.3 + (APEX[g] || 1), [it], deskClip([it]))[0];
      drawDesks([it]);
      const x = 12 + c * (cw * z + 8), y = 34 + r * (ch * z + 26);
      label(ctx, `${letterOf(id)} ${g}`, x, y + 12);
      blit(ctx, toCanvas(new Uint32Array(frame.px), mk), Math.round(h.cx - cw / 2), Math.round(h.cy - 26), cw, ch, x, y + 18, z);
    });
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

/** The 'legacy' sheet: the old renderer's wide sprites and close-up portraits of the three candidates. */
async function sheetLegacy(ctx, mk) {
  const [{ drawAnchor, drawHands, HOST_OLD }, { drawCloseup }] = await Promise.all([import('../../../anchors.js'), import('../../../scenes/portraits.js')]);
  const letters = ['A', 'B', 'C'];
  ctx.canvas.width = 24 + 3 * (W + 12);
  ctx.canvas.height = 260 + (H + 28);
  bg(ctx);
  label(ctx, 'PAY ATTENTION in the old renderer: wide sprites (host between Penny and Nova) and close-up portraits, candidates A / B / C', 12, 22, '#feae34', 14);
  const { LOOKS } = await import('../../../anchors.js');
  letters.forEach((l, i) => {
    const c = mk(W, H);
    const g = c.getContext('2d');
    g.fillStyle = P.ink;
    g.fillRect(0, 0, W, H);
    g.fillStyle = P.slate;
    g.fillRect(0, 118, W, 98);
    g.fillStyle = P.fog;
    g.fillRect(0, 118, W, 1);
    const st = { t: 1, speaking: false, emotion: 'neutral', mouth: 0, blink: false, look: 0, bob: 0, gesture: 0 };
    drawAnchor(g, 112, 80, LOOKS.penny, { ...st, look: 1 });
    drawAnchor(g, 192, 80, HOST_OLD[l], { ...st, speaking: true, mouth: 1 });
    drawAnchor(g, 272, 80, LOOKS.nova, { ...st, look: -1 });
    drawHands(g, 112, 118, LOOKS.penny, 0);
    drawHands(g, 192, 118, HOST_OLD[l], 0);
    drawHands(g, 272, 118, LOOKS.nova, 0);
    const x = 12 + i * (W + 12);
    label(ctx, `wide sprites (2x), host ${l}`, x, 44);
    blit(ctx, c, 96, 44, 192, 96, x, 50, 2);
  });
  letters.forEach((l, i) => {
    const c = mk(W, H);
    const g = c.getContext('2d');
    drawCloseup(g, 1, `qm-${l.toLowerCase()}`, { t: 1, speaking: false, emotion: 'neutral', mouth: 0, blink: false, look: 0 }, { side: 'left', accent: P.purple });
    const x = 12 + i * (W + 12), y = 250;
    label(ctx, `close-up host ${l}`, x, y + 12);
    blit(ctx, c, 0, 0, W, H, x, y + 18, 1);
  });
  return [ctx.canvas.width, ctx.canvas.height];
}

export function createPayAttentionLab() {
  const mk = (w, h) => (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
  return {
    frame: renderFrame,
    async sheet(name, canvas) {
      const ctx = canvas.getContext('2d');
      if (name === 'candidates') return sheetCandidates(ctx, mk);
      if (name === 'contestants') return sheetContestants(ctx, mk);
      if (name === 'quiz') return sheetQuiz(ctx, mk, 1);
      if (name === 'quiz-2x') return sheetQuiz(ctx, mk, 2);
      if (name === 'onair') return sheetOnAir(ctx, mk);
      if (name === 'gestures') return sheetGestures(ctx, mk);
      if (name === 'legacy') return sheetLegacy(ctx, mk);
      throw new Error(`unknown sheet ${name}`);
    },
  };
}

export const SHEETS = ['candidates', 'contestants', 'quiz', 'quiz-2x', 'onair', 'gestures', 'legacy'];
void u32;

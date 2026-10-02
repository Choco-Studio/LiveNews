// Lab driver for the CAMERA stream (public/lab/v2-camera.html): framings,
// moves and the runtime shot grammar, rendered at exact instants so contact
// sheets are deterministic.
//   window.__lab.render(t)     draw instant t (s); in 'gallery' and 'storyboard'
//                              modes t is the case / shot index (floor)
//   window.__lab.set({ mode: 'gallery' | 'move' | 'storyboard' | 'framing',
//                      programme, framing, focus, move, episode, overlay })
//   window.__lab.load(url)     fetch an episode JSON (a test fixture or /api/queue)
//                              for the storyboard; resolves to its shot list
//   window.__lab.shots()       the storyboard's shot list [{ t0, t1, seg, shot, framing, focus, move }]
//   window.__lab.cases()       the gallery's case labels
// Modes:
//   gallery     every framing for the programme's cast (duo and solo casts)
//   move        one move ('greeting' | 'lead' | 'signoff' | 'catch' | a shot spec)
//               at shot time t, for 1/60 s sheets
//   storyboard  a real episode through planSegment: one frame per planned shot
//               (at the middle of the shot, or the end of its move) with the time
//   framing     one framing (set framing / focus) at time t (idle presenters)
import { C } from '../pixbuf.js';
import { frame, actor, drawActors } from '../scene.js';
import { drawBackground, drawDesk } from '../studio/set.js';
import { SET } from '../studio/geometry.js';
import { framing, cameraAt, framingInfo, placeActor, moveScale } from '../camera.js';
import { planSegment } from '../direction/index.js';
import { lookFor } from '../cast/index.js';
import { drawText } from '../../../font.js';
import { P } from '../../../palette.js';

const CASTS = {
  'world-now': { A: 'paco', B: 'lola' },
  'tech-bytes': { A: 'max', B: 'ada' },
  cosmos: { A: 'nova', B: 'unit8' },
  'money-minute': { A: 'penny' },
  'news-60': { A: 'sam' },
};

const state = { mode: 'gallery', programme: 'world-now', framing: 'wide', focus: 'A', move: 'greeting', overlay: false, episode: null };
const clipRows = new Int16Array(384);
let styleFn = null; // studio/styles.js setStyle (SET stream), loaded with ?styles=1 once it exists
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('styles')) {
  import('../studio/styles.js').then((m) => (styleFn = typeof m.setStyle === 'function' ? m.setStyle : null)).catch(() => {});
}

// ---------------------------------------------------------------------------
// Actors per cast (idle performance, seeded)

const ACTORS = new Map();
function actorsFor(cast) {
  const key = `${cast.A}|${cast.B || ''}`;
  if (ACTORS.has(key)) return ACTORS.get(key);
  const solo = !cast.B;
  const list = Object.entries(cast).map(([slot, id], i) => ({
    slot,
    id,
    X: solo ? SET.seatX.solo ?? 0 : slot === 'B' ? SET.seatX.B : SET.seatX.A,
    a: actor(id, { side: solo ? 0 : slot === 'B' ? -1 : 1, seed: 11 + i * 12 }),
  }));
  ACTORS.set(key, list);
  return list;
}

function drawStudio(cam, t, cast, programId) {
  let style = null;
  try {
    style = styleFn ? styleFn(programId) : null;
  } catch {
    style = null;
  }
  if (style) drawBackground(frame, cam, t, { style });
  else drawBackground(frame, cam, t);
  drawDesk(frame, cam, clipRows, style?.accent ?? C.red);
  const list = actorsFor(cast).map(({ a, X }) => ({ actor: a, ...placeActor(cam, X) }));
  drawActors(t, list, clipRows);
}

// ---------------------------------------------------------------------------
// Gallery

function galleryCases(programme) {
  const cast = CASTS[programme] || CASTS['world-now'];
  const duo = !!cast.B;
  const out = [];
  const add = (name, focus, label) => out.push({ name, focus, label: label || `${name}${duo ? ' ' + focus : ''}` });
  if (duo) {
    add('wide', 'A', 'wide');
    add('two', 'A', 'two');
    add('single', 'A');
    add('single', 'B');
    add('mcu-l', 'A');
    add('mcu-r', 'B');
    add('close', 'A');
    add('close', 'B');
    add('ots', 'A');
    add('ots', 'B');
  } else {
    add('wide', 'A', 'solo wide');
    add('mcu', 'A', 'mcu');
    add('mcu-l', 'A', 'mcu-l');
    add('mcu-r', 'A', 'mcu-r');
    add('close', 'A', 'close');
    add('ots', 'A', 'ots');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Moves

const MOVES = {
  greeting: { programId: 'world-now', framing: 'wide', move: { type: 'push', amount: 0.04, delay: 0.5, dur: 4.4 } },
  lead: { programId: 'world-now', framing: 'mcu-l', focus: 'A', move: { type: 'push', amount: 0.035, delay: 0.5, dur: 5.0 } },
  signoff: { programId: 'world-now', framing: 'wide', move: { type: 'pull', amount: 0.04, delay: 0.5, dur: 5.0 } },
  catch: { programId: 'tech-bytes', framing: 'close', focus: 'B', move: { type: 'push', amount: 0.016, delay: 0.3, dur: 3.2 } },
};

function moveSpec() {
  const m = typeof state.move === 'object' && state.move ? state.move : MOVES[state.move] || MOVES.greeting;
  const programId = m.programId || state.programme;
  const cast = m.cast || CASTS[programId] || CASTS['world-now'];
  return { ...m, programId, cast, solo: !cast.B };
}

// ---------------------------------------------------------------------------
// Storyboard: a real episode through planSegment, laid out on one clock

const GAP = 0.3; // the director's pause after each segment (s)
let board = null;

function buildBoard(ep) {
  const shots = [];
  let T = 0;
  const cast = ep.cast || { A: 'paco' };
  for (let i = 0; i < (ep.segments || []).length; i++) {
    const { ctx, events } = planSegment(ep, i, {});
    if (!ctx) continue;
    for (const e of events) {
      if (e.kind !== 'shot') continue;
      const prev = shots[shots.length - 1];
      const same = prev && prev.shot === e.shot && prev.framing === e.framing && prev.focus === e.focus && prev.card === (e.card ?? null);
      if (same && !e.move) continue;
      if (same && e.move) {
        prev.move = e.move;
        prev.moveAt = T + e.at;
        continue;
      }
      if (prev) prev.t1 = T + e.at;
      shots.push({ t0: T + e.at, t1: null, seg: i, type: ctx.type, shot: e.shot, framing: e.framing || null, focus: e.focus, move: e.move || null, moveAt: T + e.at, card: e.card ?? null, beat: e.beat || null, text: ctx.seg.text });
    }
    T += ctx.duration + (Number.isFinite(ctx.gapAfter) ? ctx.gapAfter : GAP);
  }
  if (shots.length) shots[shots.length - 1].t1 = T;
  return { ep, cast, programId: ep.program?.id || 'world-now', shots, total: T };
}

const STUDIO = new Set(['wide', 'close', 'two', 'single']);

function slate(lines) {
  frame.clear(C.black);
  frame.span(8, 8, 376, 208, C.ink);
  return lines;
}

function drawBoard(i, ctx2d) {
  if (!board || !board.shots.length) {
    frame.clear(C.ink);
    frame.present(ctx2d);
    drawText(ctx2d, 'NO EPISODE', 150, 100, { color: P.fog });
    return;
  }
  const s = board.shots[Math.max(0, Math.min(board.shots.length - 1, Math.floor(i)))];
  const len = s.t1 - s.t0;
  const studio = STUDIO.has(s.shot) && s.framing;
  let label = [];
  if (studio) {
    // show the end of the move when there is one, else the middle of the shot
    const dt = s.move ? s.move.delay + s.move.dur + 0.05 : len / 2;
    const cam = cameraAt({ framing: s.framing, focus: s.focus, cast: board.cast, solo: !board.cast.B, programId: board.programId, move: s.move }, dt);
    drawStudio(cam, s.t0 + dt, board.cast, board.programId);
  } else {
    label = slate([]);
  }
  frame.present(ctx2d);
  const seg = board.ep.segments[s.seg] || {};
  const tag = `${s.t0.toFixed(1)}S  ${len.toFixed(1)}S  ${s.shot.toUpperCase()}${s.framing ? ' ' + s.framing.toUpperCase() : ''} ${s.focus || ''}`;
  ctx2d.fillStyle = 'rgba(0,0,0,0.75)';
  ctx2d.fillRect(0, 0, 384, 12);
  drawText(ctx2d, tag, 3, 3, { color: P.white, font: 'micro' });
  const mv = s.move ? `${s.move.type.toUpperCase()} ${(s.move.amount * 100).toFixed(1)}% ${s.move.dur.toFixed(1)}S` : '';
  drawText(ctx2d, `${seg.type || ''} ${s.seg} ${s.beat || ''} ${mv}`.toUpperCase(), 3, 206, { color: P.yellow, font: 'micro' });
  if (!studio) {
    const what = s.shot === 'map' ? `MAP  ${seg.location?.place || ''}` : s.shot === 'fact' ? `FACT  ${seg.fact || seg.numbers?.[0]?.value || ''}` : s.shot === 'full' ? 'PICTURE' : s.shot === 'montage' ? `MONTAGE ${s.card ?? ''}` : s.shot.toUpperCase();
    drawText(ctx2d, String(what).toUpperCase().slice(0, 40), 20, 96, { color: P.fog, scale: 1 });
    drawText(ctx2d, String(seg.headline || '').toUpperCase().slice(0, 56), 20, 112, { color: P.steel, font: 'micro' });
  }
  return label;
}

// ---------------------------------------------------------------------------
// Overlay: graphics rectangles (CONTRACTS graphics fix r1), head boxes, bezel

function overlay(ctx2d, cam, cast) {
  ctx2d.save();
  ctx2d.globalAlpha = 0.85;
  const box = (x0, y0, x1, y1, c) => {
    ctx2d.strokeStyle = c;
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
  };
  box(13, 8, 61, 22, P.yellow); // bug
  box(13, 8, 372, 22, P.orange); // top row
  box(55, 136, 330, 197, P.cyan); // caption band
  box(19, 166, 366, 195, P.green); // strap
  box(0, 202, 384, 216, P.magenta); // ticker
  const solo = !cast.B;
  const actors = Object.keys(cast).map((slot) => ({ slot, X: solo ? SET.seatX.solo ?? 0 : slot === 'B' ? SET.seatX.B : SET.seatX.A, look: lookFor(cast[slot]) }));
  const info = framingInfo(cam, actors);
  box(info.bezel.x0, info.bezel.y0, info.bezel.x1, info.bezel.y1, P.pink);
  for (const h of info.heads) {
    box(h.x0, h.y0, h.x1, h.y1, P.red);
    ctx2d.fillStyle = P.red;
    ctx2d.fillRect(h.x0 - 3, Math.round(h.eye), 3, 1);
  }
  ctx2d.fillStyle = P.white;
  for (const x of [128, 256]) ctx2d.fillRect(x, 0, 1, 3);
  for (const y of [72, 144]) ctx2d.fillRect(0, y, 3, 1);
  ctx2d.restore();
}

// ---------------------------------------------------------------------------

export function createCameraLab(canvas) {
  const ctx2d = canvas.getContext('2d');
  ctx2d.imageSmoothingEnabled = false;
  const lab = {
    state,
    render(t = 0) {
      const programme = state.programme;
      if (state.mode === 'storyboard') return drawBoard(t, ctx2d);
      let cam, cast, tt = t;
      if (state.mode === 'move') {
        const spec = moveSpec();
        cast = spec.cast;
        cam = cameraAt(spec, t);
        drawStudio(cam, t, cast, spec.programId);
        frame.present(ctx2d);
        if (state.overlay) overlay(ctx2d, cam, cast);
        return { scale: moveScale(spec.move, t) };
      }
      cast = CASTS[programme] || CASTS['world-now'];
      let name = state.framing, focus = state.focus;
      if (state.mode === 'gallery') {
        const cases = galleryCases(programme);
        const c = cases[Math.max(0, Math.min(cases.length - 1, Math.floor(t)))];
        name = c.name;
        focus = c.focus;
        tt = 2.0;
      }
      cam = framing(name, { cast, focus, programId: programme });
      drawStudio(cam, tt, cast, programme);
      frame.present(ctx2d);
      if (state.overlay) overlay(ctx2d, cam, cast);
      return { name, focus };
    },
    set(opts = {}) {
      Object.assign(state, opts);
      if (opts.episode && typeof opts.episode === 'object') board = buildBoard(opts.episode);
      return { ...state, episode: !!state.episode };
    },
    async load(url) {
      const res = await fetch(url);
      let data = await res.json();
      if (Array.isArray(data)) data = data.find((e) => e.kind === 'episode' && (!state.programme || e.program?.id === state.programme)) || data[0];
      state.episode = data;
      board = buildBoard(data);
      return lab.shots();
    },
    shots() {
      return board ? board.shots.map(({ text, ...s }) => s) : [];
    },
    cases() {
      return galleryCases(state.programme).map((c) => c.label);
    },
    info() {
      const cast = CASTS[state.programme] || CASTS['world-now'];
      const cam = framing(state.framing, { cast, focus: state.focus, programId: state.programme });
      const solo = !cast.B;
      return framingInfo(cam, Object.keys(cast).map((slot) => ({ slot, X: solo ? SET.seatX.solo ?? 0 : slot === 'B' ? SET.seatX.B : SET.seatX.A, look: lookFor(cast[slot]) })));
    },
  };
  return lab;
}

export { CASTS, MOVES };

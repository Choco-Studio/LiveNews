// Segment planning entry point (owner: INTEGRATION stream). The director calls
// planSegment() when it reaches a segment of a live episode; the Stage's cue
// clock (runtime/cueclock.js) then fires the events against the speech clock.
//
//   planSegment(episode, i, { presenters, gapAfter }) → { ctx, events, errors }
//
// Order matters (PLAN §3.6, CONTRACTS "planner arbitration"):
//   1. planShots(ctx)               CAMERA: the cuts; copied to ctx.shots so the
//                                   other planners can keep gestures out of the
//                                   first ctx.cutGuard s of every shot
//   2. planGestures(ctx)            HANDS: the SPEAKER's body (arm gestures, the
//                                   speaker's nods, emotions from the writer)
//   3. planBehaviour(ctx)           FACES: every EYELINE (listener glances, the
//                                   speaker's hand-over/toss glance, the writer's
//                                   look_partner cue) and every LISTENER nod
//   4. arbitrate(events, ctx)       one owner per kind: look_partner gestures become
//                                   looks, at most one nod per slot per turn, no
//                                   overlapping looks per slot
//   5. onScreenGlances(events, ctx) the listener's turn-start glance (the owner's
//                                   favourite detail) is moved to the first planned
//                                   shot that shows the listener (montage, maps and
//                                   the speaker's own single hide it), 0.25 s after
//                                   that cut, when it comes within the turn's glance
//                                   window (15 s; 4.5 s in a story). FACES' planner
//                                   now places its glances this way itself, so this
//                                   step only acts on what it left hidden: the
//                                   default glance after a planner failure, or a
//                                   story glance FACES moved past 4.5 s (dropped)
// Each planner runs inside try/catch: a planner bug costs that planner's events
// for the segment (logged once per distinct message), never the segment. If the
// behaviour planner fails, the owner-approved turn-start glance is still added.
// Pure apart from the log; deterministic per episode.
import { segmentContext } from './context.js';
import { planShots } from './shots.js';
import { planGestures } from './gestures.js';
import { planBehaviour } from './behaviour.js';

const LOGGED = new Set();
function logOnce(where, err) {
  const msg = `${where}: ${err?.message || err}`;
  if (LOGGED.has(msg)) return;
  LOGGED.add(msg);
  if (LOGGED.size > 200) LOGGED.clear();
  try {
    console.warn(`[v2 direction] ${msg}`);
  } catch {
    /* no console */
  }
}

function run(where, fn, ctx, errors) {
  try {
    const out = fn(ctx);
    return Array.isArray(out) ? out.filter((e) => e && typeof e === 'object' && Number.isFinite(e.at)) : [];
  } catch (err) {
    errors.push(where);
    logOnce(where, err);
    return [];
  }
}

/** The owner-approved glance (cast.html camera demo): listeners look at a new speaker ~0.25 s in, for ~3 s. */
export function defaultGlance(ctx) {
  if (!ctx.duo || !ctx.turnStart) return [];
  const dur = Math.min(3.2, Math.max(0.8, ctx.duration - 0.6));
  return ctx.listeners.map((slot) => ({ kind: 'look', slot, target: 'partner', char: 0, at: 0.25, dur, src: 'default', why: 'turn' }));
}

const NOD_GAP = 2.5; // s: two nods of one slot closer than this are one nod

/**
 * One owner per kind of event (CONTRACTS "planner arbitration"):
 *  - a `look_partner` gesture from any planner becomes a look event (FACES' look
 *    layer performs every eyeline);
 *  - nods: the LISTENER's come only from planBehaviour, the SPEAKER's only from
 *    planGestures; at most one nod per slot per segment for listeners, and no two
 *    nods of one slot within NOD_GAP s;
 *  - looks: per slot, a look that starts inside another one is dropped.
 * Returns a new array sorted by `at` (stable: shots first at equal times).
 */
export function arbitrate(events, ctx) {
  const ORDER = { shot: 0, emotion: 1, look: 2, gesture: 3 };
  const list = events.map((e) => {
    if (e.kind === 'gesture' && e.name === 'look_partner') {
      return { kind: 'look', slot: e.slot, target: 'partner', char: e.char, at: e.at, dur: e.dur || 1.9, src: e.src || 'look_partner', planner: e.planner };
    }
    return e;
  });
  list.sort((a, b) => a.at - b.at || (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
  const out = [];
  const lookEnd = new Map();
  const lastNod = new Map();
  const listenerNods = new Map();
  for (const e of list) {
    if (e.kind === 'look') {
      const end = lookEnd.get(e.slot) ?? -Infinity;
      if (e.at < end) continue;
      lookEnd.set(e.slot, e.at + (e.dur || 0));
    } else if (e.kind === 'gesture' && e.name === 'nod') {
      const isSpeaker = e.slot === ctx.speaker;
      if (isSpeaker && e.planner === 'behaviour') continue;
      if (!isSpeaker && e.planner === 'gestures') continue;
      if (!isSpeaker) {
        if (listenerNods.get(e.slot)) continue;
        listenerNods.set(e.slot, true);
      }
      if (e.at - (lastNod.get(e.slot) ?? -Infinity) < NOD_GAP) continue;
      lastNod.set(e.slot, e.at);
    }
    out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the listener's glance where the viewer can see it

const LEGACY = new Set(['wide', 'close', 'full', 'map', 'fact', 'montage']);
const WIDE_FRAMINGS = new Set(['wide', 'two', 'solo-wide']);
export const GLANCE_WINDOW = 15; // s after the turn start a hidden turn glance may move to (intros, chats)
export const STORY_GLANCE_WINDOW = 4.5; // ... in a story turn (owner: "only at the start"; runtime/cueclock.js STORY_WINDOW)
const TURN_GLANCE = /^turn(?!-notes)/; // FACES' 'turn-notes' is a look at the notes, not at the partner
export const GLANCE_AFTER_CUT = 0.25; // s after the cut that shows the listener (the approved demo's delay)
const GLANCE_MIN = 0.8; // s: a shorter glance is not worth moving
const LOOK_GAP = 0.4; // s between two looks of one slot
const EYES_BACK = 0.1; // s the eyes need to reach the lens before the line ends (FACES)

/** Does a planned shot ({ shot, framing, focus }) show `slot`? Two-shots show both; a single only its focus. */
export function shotShows(shot, slot) {
  if (!shot) return false;
  const legacy = LEGACY.has(shot.shot) ? shot.shot : WIDE_FRAMINGS.has(shot.framing || shot.shot) ? 'wide' : 'close';
  if (legacy === 'wide') return true;
  return legacy === 'close' && shot.focus === slot && shot.framing !== 'ots';
}

/** Index of the planned shot on air at t (s from the first word), -1 before the first. */
function shotIndexAt(shots, t) {
  let i = -1;
  for (let k = 0; k < shots.length; k++) {
    if (shots[k].at > t + 1e-6) break;
    i = k;
  }
  return i;
}

function charAtTime(ctx, t) {
  const w = Array.isArray(ctx.words) ? ctx.words : [];
  let c = 0;
  for (let k = 0; k < w.length && w[k].t <= t + 1e-6; k++) c = w[k].char;
  return c;
}

/**
 * Owner 17:47: the listener glances at the speaker at the start of the speaker's turn. A turn
 * glance planned while the plan shows something else (the headline montage, a map, the speaker's
 * own single) would be spent off screen; it moves to GLANCE_AFTER_CUT s after the first later
 * planned cut that shows the listener, if that cut comes within GLANCE_WINDOW s of the turn start
 * and the glance still fits (≥ 0.8 s, clear of the slot's other looks, back before the line ends).
 * Otherwise it stays where it was (harmless off screen; the cue clock still holds it for a real
 * cut that shows the listener). Returns the events, re-sorted when one moved.
 */
export function onScreenGlances(events, ctx) {
  const shots = ctx?.shots;
  if (!ctx?.duo || !Array.isArray(shots) || !shots.length || !Array.isArray(events)) return events;
  let moved = false;
  const window = ctx.type === 'story' ? STORY_GLANCE_WINDOW : GLANCE_WINDOW;
  let drop = null;
  for (const e of events) {
    if (e.kind !== 'look' || e.slot === ctx.speaker || (e.target ?? 'partner') !== 'partner' || !TURN_GLANCE.test(e.why || '')) continue;
    // a story glance already placed past the window (it would read as a random look): not made
    if (e.at > window + GLANCE_AFTER_CUT + 1e-6) {
      (drop ||= new Set()).add(e);
      continue;
    }
    const i = shotIndexAt(shots, e.at);
    if (i >= 0 && shotShows(shots[i], e.slot)) continue;
    let j = i + 1;
    while (j < shots.length && !(shots[j].at > e.at && shotShows(shots[j], e.slot))) j++;
    if (j >= shots.length || shots[j].at > window) continue;
    const at = shots[j].at + GLANCE_AFTER_CUT;
    let end = Math.min(at + (e.dur > 0 ? e.dur : 1.5), (ctx.duration || 0) - EYES_BACK);
    let clash = false;
    for (const o of events) {
      if (o === e || o.kind !== 'look' || o.slot !== e.slot) continue;
      if (o.at <= at && o.at + (o.dur || 0) + LOOK_GAP > at) clash = true; // already looking then
      else if (o.at > at) end = Math.min(end, o.at - LOOK_GAP);
    }
    if (clash || end - at < GLANCE_MIN) continue;
    e.at = Math.round(at * 1000) / 1000;
    e.dur = Math.round((end - at) * 1000) / 1000;
    e.char = charAtTime(ctx, at);
    e.onScreen = true; // moved here by INTEGRATION (debug, analysers)
    moved = true;
  }
  if (!moved && !drop) return events;
  const ORDER = { shot: 0, emotion: 1, look: 2, gesture: 3 };
  const out = drop ? events.filter((e) => !drop.has(e)) : events.slice();
  return moved ? out.sort((a, b) => a.at - b.at || (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9)) : out;
}

const PLANNERS = { shots: planShots, gestures: planGestures, behaviour: planBehaviour };

/**
 * Plan one segment. Never throws: a malformed episode or a planner bug gives
 * fewer events, and the Stage still animates idle, blinks and mouths.
 * opts: { presenters, gapAfter } for segmentContext, and `planners` ({ shots,
 * gestures, behaviour } overrides, for tests and labs).
 */
export function planSegment(episode, index, opts = {}) {
  const errors = [];
  let ctx;
  try {
    ctx = segmentContext(episode, index, opts);
  } catch (err) {
    logOnce('segmentContext', err);
    return { ctx: null, events: [], errors: ['context'] };
  }
  const P = opts.planners || PLANNERS;
  const shots = run('planShots', P.shots || planShots, ctx, errors).map((e) => ({ ...e, planner: 'shots' }));
  // framing too (additive): which presenters a studio shot shows (glances, gesture visibility)
  ctx.shots = shots.filter((e) => e.kind === 'shot').map((e) => ({ at: e.at, char: e.char, shot: e.shot, focus: e.focus, framing: e.framing ?? null }));
  const gestures = run('planGestures', P.gestures || planGestures, ctx, errors).map((e) => ({ ...e, planner: 'gestures' }));
  let behaviour = run('planBehaviour', P.behaviour || planBehaviour, ctx, errors).map((e) => ({ ...e, planner: 'behaviour' }));
  if (errors.includes('planBehaviour')) behaviour = defaultGlance(ctx).map((e) => ({ ...e, planner: 'behaviour' }));
  let events = arbitrate([...shots, ...gestures, ...behaviour], ctx);
  try {
    events = onScreenGlances(events, ctx);
  } catch (err) {
    errors.push('onScreenGlances');
    logOnce('onScreenGlances', err);
  }
  return { ctx, events, errors };
}

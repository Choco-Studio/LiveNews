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
  return ctx.listeners.map((slot) => ({ kind: 'look', slot, target: 'partner', char: 0, at: 0.25, dur, src: 'default' }));
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
  ctx.shots = shots.filter((e) => e.kind === 'shot').map((e) => ({ at: e.at, char: e.char, shot: e.shot, focus: e.focus }));
  const gestures = run('planGestures', P.gestures || planGestures, ctx, errors).map((e) => ({ ...e, planner: 'gestures' }));
  let behaviour = run('planBehaviour', P.behaviour || planBehaviour, ctx, errors).map((e) => ({ ...e, planner: 'behaviour' }));
  if (errors.includes('planBehaviour')) behaviour = defaultGlance(ctx).map((e) => ({ ...e, planner: 'behaviour' }));
  const events = arbitrate([...shots, ...gestures, ...behaviour], ctx);
  return { ctx, events, errors };
}

// Cue clock (owner: INTEGRATION stream): fires a segment plan's events
// (direction/index.js planSegment) against the voice that is actually on air,
// and turns them into rig performance entries (perf.gestures / look / emotions).
//
// The director stores the plan as scene.segPlan = { id, ctx, events, voice,
// speechStart, speechEnd } (renderer clock, seconds): speechStart is set at
// onSentence(0), speechEnd when speak() resolves. Every frame the Stage calls
// tick(t, frame) with the speaking slot's audio.speechFrame():
//   - recorded voice (ctx.timing 'recorded', not blips): an event fires at
//     speechStart + at (the first recorded word is the origin, ctx.lead);
//   - browser TTS / blips / mute: it fires when the voice's absolute char
//     (ctx.sentences[sentenceIndex].start + charIndex) reaches event.char; an
//     anticipation (at earlier than the char's planned time) is converted to
//     chars with the chars-per-second learned from the voice itself; a delay
//     (at later than the char's time, e.g. a glance 0.25 s into the turn) runs
//     from the moment the char is reached;
//   - events at char 0 fire at speech start (+ their positive at);
//   - speech start is the first frame that is really speaking (onSentence can
//     run a caption lead ahead of the voice), else speechStart + 0.6 s;
//   - a recorded segment whose voice fell back to TTS (sentence starts drift
//     > 0.75 s from the word times) switches to the char rule; a sentence start
//     first seen after a stalled frame (> 0.1 s since the previous tick: a busy
//     machine, a capture tool) is not judged, the stall would read as drift;
//   - CUT GUARD against ACTUAL cuts (cut(T), the Stage reports every real cut):
//     a gesture due in [T, T + cutGuard) is shifted to T + cutGuard if that
//     moves it by <= 0.3 s, otherwise dropped; nods, looks and emotions are exempt;
//   - the listener's TURN GLANCE (a look at the partner whose why is 'turn',
//     'turn-late' or 'turn+dry'; FACES' 'turn-notes' look at the notes is not one)
//     is never spent off screen: due while the shot on air does not show that
//     listener (canSee(slot), from the Stage), it is held and fires 0.25 s after
//     the next real cut that shows the listener, if that comes within the turn's
//     glance window and before the speech ends; otherwise it is dropped. A glance
//     the planner moved onto a later shot (ev.onScreen) fires 0.25 s after an
//     EARLIER real cut that shows the listener (the director's max-hold guard, a
//     stinger delay) within that window. The window is the first 4.5 s of a
//     story turn (owner: "only at the start"; later it reads as a random look)
//     and 15 s of an intro or chat (the greeting wide is the listener's first
//     appearance); a story glance due past it is dropped;
//   - after the speech ends, unfired events planned up to 2.5 s past the end
//     keep their offset from the end; later ones are dropped (ANALYSIS bug 9);
//     interrupted speech (N key, stop) drops everything still pending;
//   - a new plan (segment boundary), reset() (episode boundary) or a plan
//     whose speech never starts (30 s) clears the pending events.
// No allocation per frame: entries are built once per segment; firing pushes
// one small object per event.
import { GESTURES } from '../gestures/index.js';

export const TAIL = 2.5; // s after the end of speech an event may still fire
export const SHIFT_MAX = 0.3; // largest cut-guard shift (s)
const STALE = 30; // s a plan may wait for its speech before it is dropped
const START_WAIT = 0.6; // s after onSentence(0) without a speaking frame: start anyway
const DRIFT = 0.75; // s of sentence-start drift that turns a recorded plan to the char rule
const STALL = 0.1; // s between two ticks beyond which a sentence start's timing is not trusted
const EXEMPT = new Set(['nod']);
const KINDS = new Set(['gesture', 'look', 'emotion']);
export const HOLD_MAX = 15; // s a held turn glance may wait for a shot that shows the listener
export const STORY_WINDOW = 4.5; // s of a story turn a turn glance may fire in (FACES' bible wording: "the first 4.5 s")
export const AFTER_CUT = 0.25; // s after that cut it fires (the approved glance's delay)
const TURN = /^turn(?!-notes)/;

/** Is this event the listener's turn glance at the speaker (held / moved for the viewer)? */
export function isTurnGlance(ev, speaker) {
  return !!ev && ev.kind === 'look' && ev.slot !== speaker && (ev.target ?? 'partner') === 'partner' && TURN.test(ev.why || '');
}

/** The seconds from the speech start a turn glance may still fire in. */
export const glanceWindow = (ctx) => (ctx?.type === 'story' ? STORY_WINDOW : HOLD_MAX);

const W_WAIT = 0, W_DUE = 1, W_DONE = 2, W_HELD = 3;

export class CueClock {
  /** @param opts { log?: (msg) => void, onFire?: (event, slot, t) => void } */
  constructor({ log = null, onFire = null } = {}) {
    this.perfs = {}; // slot -> perf (the actors' performance objects)
    this.epoch = 0; // perf t0 = renderer t - epoch (the Stage's rig clock)
    this.log = log;
    this.onFire = onFire;
    this.entries = [];
    this.stats = { fired: 0, shifted: 0, dropped: 0, cleared: 0, held: 0, released: 0 };
    // (slot) => does the shot on air show that presenter? Set by the Stage; null = always
    this.canSee = null;
    this.lastCut = -Infinity;
    this.cutSeen = -Infinity; // the last cut the moved turn glances were checked against
    this.lastTick = -Infinity; // renderer time of the previous tick (stall detection)
    this.reset();
  }

  /** Forget the plan and everything pending (episode boundary, Stage rebuilt). */
  reset() {
    this.clear();
    this.plan = null;
  }

  /** Drop every pending event (keeps the plan; nothing more of it will fire). */
  clear() {
    let n = 0;
    for (const e of this.entries) if (e.state !== W_DONE) n++;
    this.stats.cleared += n;
    this.entries = [];
    this.started = null;
    this.ended = null;
    this.interrupted = false;
    this.absChar = -1;
    this.cps = 15;
    this.mode = 'char';
    this.lastSentence = -1;
  }

  /** Take a plan (scene.segPlan). Same object again: nothing happens. */
  load(plan, t) {
    if (plan === this.plan) return;
    this.clear();
    this.plan = plan || null;
    this.loadedAt = t;
    const ctx = plan?.ctx;
    if (!ctx || !Array.isArray(plan.events)) return;
    this.mode = ctx.timing === 'recorded' && plan.voice !== 'blips' ? 'at' : 'char';
    this.cps = ctx.duration > 0.5 ? Math.min(30, Math.max(6, (ctx.seg?.text?.length || 0) / ctx.duration)) : 15;
    for (const ev of plan.events) {
      if (!ev || !KINDS.has(ev.kind) || !Number.isFinite(ev.at)) continue;
      const char = Number.isFinite(ev.char) ? ev.char : 0;
      let anchor = 0;
      try {
        anchor = typeof ctx.timeAt === 'function' ? ctx.timeAt(char) : 0;
      } catch {
        anchor = ev.at;
      }
      this.entries.push({ ev, char, off: ev.at - anchor, state: W_WAIT, dueAt: 0 });
    }
  }

  /** A real cut happened at renderer time T (any shot change the viewer sees). */
  cut(T) {
    this.lastCut = T;
  }

  /**
   * Advance to renderer time t. `fr` = audio.speechFrame() of the plan's speaker
   * (or null when unknown). Fires due events into this.perfs.
   */
  tick(t, fr = null) {
    const gap = t - this.lastTick;
    this.lastTick = t;
    const plan = this.plan;
    if (!plan || !plan.ctx) return;
    const ctx = plan.ctx;
    // speech start: the first frame that really speaks, or a moment after onSentence(0)
    if (this.started === null) {
      if (plan.speechStart == null) {
        if (t - this.loadedAt > STALE && this.entries.length) this.clear();
        return;
      }
      if (fr && fr.speaking && fr.sentenceIndex <= 0) this.started = t;
      else if (t >= plan.speechStart + START_WAIT || plan.speechEnd != null) this.started = plan.speechStart;
      else return;
    }
    this.track(t, fr, ctx, gap);
    if (this.ended === null && plan.speechEnd != null) this.end(plan.speechEnd, ctx);
    const entries = this.entries;
    if (this.lastCut !== this.cutSeen) {
      this.cutSeen = this.lastCut;
      this.earlyGlances(ctx);
    }
    const guard = Number.isFinite(ctx.cutGuard) ? ctx.cutGuard : 0.5;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.state === W_DONE) continue;
      if (e.state === W_HELD && !this.release(e, t, ctx)) continue;
      if (e.state === W_WAIT && !this.schedule(e, t, ctx)) continue;
      if (t < e.dueAt) continue;
      // cut guard: no gesture starts in the first `guard` s of a shot
      const ev = e.ev;
      if (ev.kind === 'gesture' && !EXEMPT.has(ev.name) && t >= this.lastCut && t < this.lastCut + guard) {
        const shift = this.lastCut + guard - t;
        if (shift <= SHIFT_MAX + 1e-9) {
          e.dueAt = this.lastCut + guard;
          this.stats.shifted++;
        } else {
          e.state = W_DONE;
          this.stats.dropped++;
        }
        continue;
      }
      if (this.canSee && isTurnGlance(ev, ctx.speaker)) {
        // a story's turn glance only at the start of the turn (a late one reads as a random look)
        if (t - this.started > glanceWindow(ctx) + AFTER_CUT) {
          e.state = W_DONE;
          this.stats.dropped++;
          continue;
        }
        // the listener's turn glance waits for a shot that shows the listener
        if (!this.canSee(ev.slot)) {
          e.state = W_HELD;
          e.heldAt = t;
          this.stats.held++;
          continue;
        }
      }
      e.state = W_DONE;
      if (this.ended !== null && t > this.ended + TAIL) {
        this.stats.dropped++;
        continue;
      }
      this.fire(ev, t);
    }
  }

  // --- internals -------------------------------------------------------------

  /** Where the voice is: absolute char, learned rate, recorded-voice sanity (gap: s since the previous tick). */
  track(t, fr, ctx, gap = 0) {
    if (!fr || !(fr.sentenceIndex >= 0)) return;
    const si = fr.sentenceIndex;
    const s = ctx.sentences?.[si];
    if (!s) return;
    const c = fr.charIndex >= 0 ? s.start + fr.charIndex : s.start;
    if (c > this.absChar) this.absChar = c;
    const el = t - this.started;
    if (el > 1 && this.absChar > 8) this.cps = Math.min(30, Math.max(6, this.absChar / el));
    if (si !== this.lastSentence) {
      this.lastSentence = si;
      // a recorded plan whose voice is not the recording (TTS fallback): use chars
      if (this.mode === 'at' && si > 0 && gap <= STALL && Math.abs(el - s.t0) > DRIFT) {
        this.mode = 'char';
        this.log?.(`recorded timing drifted ${(el - s.t0).toFixed(2)} s at sentence ${si}: firing by char`);
      }
    }
  }

  /** Speech ended at T: tail events keep their offset from the end, the rest go. */
  end(T, ctx) {
    this.ended = T;
    const sents = ctx.sentences || [];
    const lastStart = sents.length ? sents[sents.length - 1].start : 0;
    const len = ctx.seg?.text?.length || 0;
    const spoken = T - this.started;
    // stopped early (N key, stop(), a new item): by time for recordings, by the
    // voice's progress through the text otherwise
    const short = spoken < ctx.duration * 0.85 - (this.mode === 'at' ? 0.3 : 0);
    this.interrupted = this.mode === 'at' || this.absChar < 0 ? short : short && this.absChar < Math.max(lastStart, len * 0.8);
    for (const e of this.entries) {
      if (e.state === W_DONE) continue;
      if (this.interrupted) {
        e.state = W_DONE;
        this.stats.dropped++;
        continue;
      }
      if (e.state === W_WAIT || e.dueAt > T) {
        const late = e.ev.at - ctx.duration;
        if (late > TAIL) {
          e.state = W_DONE;
          this.stats.dropped++;
        } else if (e.state === W_WAIT) {
          e.state = W_DUE;
          e.dueAt = T + Math.max(0, late);
        }
      }
    }
  }

  /**
   * A real cut that shows a listener: a turn glance the planner moved onto a later shot (it was
   * hidden at the turn start) comes forward to AFTER_CUT s after this cut, within HOLD_MAX s of the
   * speech start (the director cut to the two-shot earlier than planned).
   */
  earlyGlances(ctx) {
    const T = this.lastCut;
    if (!this.canSee || this.started === null || T < this.started || T - this.started > glanceWindow(ctx)) return;
    for (const e of this.entries) {
      const ev = e.ev;
      if (e.state === W_DONE || e.state === W_HELD || !ev.onScreen || !isTurnGlance(ev, ctx.speaker)) continue;
      if (e.state === W_DUE && e.dueAt <= T + AFTER_CUT) continue;
      if (!this.canSee(ev.slot)) continue;
      e.state = W_DUE;
      e.dueAt = T + AFTER_CUT;
    }
  }

  /** A held turn glance: due AFTER_CUT s after a later real cut that shows its slot; dropped when too late. */
  release(e, t, ctx) {
    if (this.ended !== null || t - e.heldAt > HOLD_MAX || t - this.started > glanceWindow(ctx)) {
      e.state = W_DONE;
      this.stats.dropped++;
      return false;
    }
    if (!(this.lastCut > e.heldAt) || !this.canSee?.(e.ev.slot)) return false;
    e.state = W_DUE;
    e.dueAt = this.lastCut + AFTER_CUT;
    this.stats.released++;
    return true;
  }

  /** Decide when a waiting entry is due; returns true once it has a due time. */
  schedule(e, t, ctx) {
    const ev = e.ev;
    // no speech frames at all (no audio clock for this slot): fall back to the planned times
    const blind = this.absChar < 0 && t - this.started > 1;
    if (e.char <= 0 || this.mode === 'at' || blind) {
      e.dueAt = this.started + Math.max(0, ev.at);
      e.state = W_DUE;
      return true;
    }
    if (e.off < 0) {
      if (this.absChar >= e.char + e.off * this.cps) {
        e.dueAt = t;
        e.state = W_DUE;
        return true;
      }
    } else if (this.absChar >= e.char) {
      e.dueAt = t + e.off;
      e.state = W_DUE;
      return true;
    }
    return false;
  }

  fire(ev, t) {
    const perf = this.perfs[ev.slot];
    if (!perf) return;
    const t0 = t - this.epoch;
    if (ev.kind === 'gesture') {
      if (!GESTURES[ev.name]) return;
      const g = { name: ev.name, t0 };
      if (ev.speed > 0) g.speed = ev.speed;
      if (ev.n > 0) g.n = ev.n;
      if (ev.variant) g.variant = ev.variant;
      if (ev.amp > 0) g.amp = ev.amp;
      perf.gestures.push(g);
    } else if (ev.kind === 'look') {
      const lk = { t0, t1: t0 + (ev.dur > 0 ? ev.dur : 1.5), target: ev.target || 'partner' };
      if (ev.amt > 0) lk.amt = ev.amt;
      if (ev.style) lk.style = ev.style; // FACES: 'mech' (UNIT-8 moves eyes and head together)
      perf.look.push(lk);
    } else if (ev.kind === 'emotion') {
      perf.emotions.push({ t0, name: ev.name });
    } else return;
    this.stats.fired++;
    this.onFire?.(ev, ev.slot, t);
  }
}

/**
 * Forget performance entries that ended long ago (rig time `t`), in place and
 * without allocating. Keeps the last gesture (the next one fades in across its
 * overlap) and the last emotion that started before the cut-off (the current mood).
 */
export function prunePerf(perf, t, keep = 10) {
  const cut = t - keep;
  const g = perf.gestures;
  let n = 0;
  while (n < g.length - 1 && g[n].t0 + gestureDur(g[n]) < cut) n++;
  dropFront(g, n);
  const e = perf.emotions;
  n = 0;
  while (n < e.length - 1 && e[n + 1].t0 < cut) n++;
  dropFront(e, n);
  const l = perf.look;
  let w = 0;
  for (let i = 0; i < l.length; i++) if (l[i].t1 >= cut) l[w++] = l[i];
  l.length = w;
}

/** Shift every entry of a performance by -d s (the Stage moving its rig clock). */
export function shiftPerf(perf, d) {
  for (const g of perf.gestures) g.t0 -= d;
  for (const e of perf.emotions) e.t0 -= d;
  for (const l of perf.look) {
    l.t0 -= d;
    l.t1 -= d;
  }
}

function gestureDur(g) {
  const def = GESTURES[g.name];
  return def ? def.dur / (g.speed || 1) : 0;
}

function dropFront(arr, n) {
  if (n <= 0) return;
  for (let i = n; i < arr.length; i++) arr[i - n] = arr[i];
  arr.length -= n;
}

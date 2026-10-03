// Behaviour planner (owner: FACES stream): eyelines and listener reactions,
// decided at runtime from the live episode data, seeded per episode (nothing
// is pre-planned per story). It generalises the detail the owner loved in
// the prototype: "the girl in blue looks at him when he has spoken (not all
// the time, only at the start) - that is doing it right."
//
//   planBehaviour(ctx) → events (ctx = direction/context.js segmentContext)
//     { kind: 'look', slot, target: 'partner' | 'notes' | 'wall' | 'camera', char, at, dur, amt?, style?, why }
//     { kind: 'gesture', slot, name: 'nod', char, at, speed, amp, why }   (listener nods only)
//   `at` = seconds from the segment's first word; looks may run past the end of
//   the speech (into the gap or the partner's next turn): perf.look entries that
//   overlap merge in behaviour.js applyLook, they never add up.
//
// OWNERSHIP (CONTRACTS "planner arbitration"): every eyeline (listener glances,
// the speaker's reply and hand-over glances, the writer's look_partner cues,
// notes / wall looks) and every LISTENER nod ([B:nod] cues are hints) is planned
// here; planGestures owns the speaker's body.
//
// The rules (owner 17:47, PLAN §9, docs/programmes/*.md), with the numbers of
// the owner-approved camera demo (look t0 = first word + 0.25 s, held 3.7 s):
//   TURN-START GLANCE  when the speaker changes, the listener glances at the new
//     speaker 0.20-0.35 s after the first word, holds 2.4-3.9 s (seeded) and is
//     back on the lens by 4.5 s after the turn start, or by the end of a shorter
//     turn. UNIT-8 looks at Nova for ~1.5 s, eased and mechanical (amt 0.45).
//   TOSS  a segment that hands over by name or question: the speaker looks at the
//     partner over the last words, the partner meets the look, and both looks run
//     on into the next turn (where they merge with that turn's glances).
//   REPLY  a chat reply may open with one brief look at the partner (≤ 1.9 s).
//   DRY LINE (TECH BYTES)  the listener glances as the dry line starts and is back
//     before it ends (merged with the turn-start glance when they are close).
//   NODS  at most one listener nod per turn, on one of the speaker's stressed
//     content words, only on the wide when the shots are known, never on grave
//     lines or a dry line (the deadpan needs a straight face), slower on serious stories, never within 1 s of one of its own looks
//     starting; the writer's [B:nod] makes it likely and picks the word.
//   NOTES  between stories, or just before one's own turn: 0.6-1.4 s, at most one
//     per 8 s. Solo shows: MONEY MINUTE glances down in every gap between stories
//     (starts ≤ 0.3 s after the last word, back on the lens ≥ 0.15 s before the
//     next first word, ctx.gapAfter); NEWS IN 60 only in gaps ≥ 0.6 s.
//   WALL  only within 1.5 s after the wall content changes (a new story with a
//     picture or a place), at most once per change, by a listener with no other look;
//     otherwise, at a story boundary after a long story, the listener may glance down
//     at its notes instead (between stories), never on every roundup item.
//   VARIETY (owner 20:40: "few gestures, it gets repetitive")  no two glances are the
//     same move: the turn-start glance's amplitude is seeded (0.82-1.0 of the approved
//     glance); the dry-line glance is a sidelong look (style 'side': the eyes go, the
//     head turns less); a listener on the wide may show INTEREST (a small brow lift and
//     tilt, target 'interest', face only, no eye move) as the speaker lands the story's
//     figure, at most once per turn, never on grave lines, never during another look. It
//     needs the listener IN FRAME at that word (a reaction nobody sees is wasted), which
//     today's shot grammar rarely gives (figures land on the speaker's single or a card):
//     the variant that airs is the interest-lifted glance in banter ('interest' style on a
//     turn / cont look).
//   RESTRAINT  per listener and turn: one glance at the speaker (plus the dry-line
//     glance and the toss exchange), gaze at the speaker ≤ 45 % of turns of 8 s or
//     more and ≤ 4.0 s in shorter ones; ≥ 2.0 s between two looks of one slot.
//   SHORT LINES (critic r1: banter read as a mutual stare)  a chat line shorter than
//     5.4 s gets ONE look from the speaker (banter: the reply look at its start; a named
//     or asked hand-over: the toss look at its end) and the listener's glance stays
//     within 60 % of the line: both look at each other as the line starts, then the lens.
//   VARIETY OVER TIME  a story turn start (never the listener's first, never UNIT-8's,
//     never grave) varies with p 0.3, and always when that listener's last 3 turn glances
//     were the same move: a later glance (0.45-0.9 s in, shorter), a look at the notes, or
//     none (per programme, VARY); tosses and banter keep the approved glance.
//   ONE LOOK PER SEGMENT (TECH BYTES §4 item 6)  when a dry line gets its own sidelong
//     glance, the listener's turn-start glance is dropped (the dry-line look is the one).
//   ACROSS THE BOUNDARY (critic r2: head to the partner, back for 0.5 s, to the partner
//     again)  a hand-over look (toss or by name) runs on into the partner's first words and
//     the next turn carries it on as ONE look ('cont': from the first word, the whole within
//     the approved 2.4-3.9 s hold, ≥ 1 s past the first word) instead of a fresh glance; every
//     other look keeps ≥ 2 s from the slot's looks of the previous segment (carryLooks).
//   ON SCREEN  a turn glance planned while the shot hides the listener moves to 0.25 s after
//     the first planned cut that shows the listener (≤ 15 s), like INTEGRATION's
//     onScreenGlances, but here, so the plan around it keeps its spacing (event `onScreen`).
import { rng } from './context.js';
import { listenerRules } from '../../../pace.js';

const GAP = { 'money-minute': 1.2, 'news-60': 0.7 }; // the director's usual gap when ctx.gapAfter is unknown
const STYLE = {
  'world-now': { nodP: 0.35, hintNodP: 0.8, replyP: 0.5, prepP: 0.55, wallP: 0.35, notesP: 0.3, interestP: 0.4, dry: false },
  'tech-bytes': { nodP: 0.45, hintNodP: 0.85, replyP: 0.65, prepP: 0.5, wallP: 0.3, notesP: 0.3, interestP: 0.5, dry: true },
  cosmos: { nodP: 0.3, hintNodP: 0.75, replyP: 0.4, prepP: 0.45, wallP: 0.4, notesP: 0.25, interestP: 0.4, dry: false },
  'money-minute': { solo: 'money' },
  'news-60': { solo: 'news60' },
};
const NAMES = { nova: ['nova', 'dr reyes', 'doctor reyes'], unit8: ['unit-8', 'unit 8', 'unit eight'] };
const ROBOT = new Set(['unit8']);

export const RULES = Object.freeze({
  glanceStart: [0.2, 0.35],
  glanceHold: [2.4, 3.9],
  backBy: 4.5,
  robotHold: [1.4, 1.6],
  replyMax: 1.9,
  notes: [0.6, 1.4],
  notesEvery: 8,
  wallWithin: 1.5,
  lookGap: 2.0,
  gazeShare: 0.45,
  gazeShort: 4.0,
  nodAfterLook: 1.0,
  glanceAmt: [0.82, 1.0],
  interest: [1.0, 1.5],
  reactClear: 0.3,
  boundaryAfter: 8,
  shortLine: 5.4, // a line too short for a reply look, the lens and a toss look (1.9 + 2.0 + 1.5)
  shortShare: 0.6, // gaze at the partner in a short chat line ≤ 60 % of the line
  varyP: 0.3, // a story turn's glance varies (later / notes / none) with p 0.3 ...
  varyEvery: 4, // ... and always when the listener's last 3 turn glances were the same move
  lateStart: [0.45, 0.9],
  lateHold: [1.6, 2.6],
  contMin: 1.0, // a hand-over look carried on into the partner's turn stays ≥ 1 s past the first word
  minFull: 1.6, // a turn glance kept apart from a toss meet stays ≥ 1.6 s (shorter, the full head turn is a flick)
  sideBelow: 1.4, // a partner look shorter than this (merged) is eye-led: style 'side', the head turns 40 %
  exchangeMax: 4.3, // a carried look that runs on through a short line's toss: the whole ≤ 4.3 s
});

// Turn-start variety per programme (bibles): WORLD NOW may vary the glance into a later one,
// a look at the notes or none; TECH BYTES keeps a glance in the first second of every turn
// (a later one only); COSMOS varies Nova's glance, never UNIT-8's (its look is the format).
const VARY = { 'world-now': ['late', 'notes', 'skip'], 'tech-bytes': ['late'], cosmos: ['late', 'notes'] };

/** Face-only reactions: carried as perf.look entries (the cue clock passes the target through), they never move the eyes. */
export const REACTIONS = new Set(['interest']);
const isReaction = (l) => REACTIONS.has(l.target);

const EYES_BACK = 0.1; // s the eyes need to reach the lens after a look ends

/** The behaviour plan of one segment (pure, seeded). */
export function planBehaviour(ctx) {
  if (!ctx || !ctx.seg || !Array.isArray(ctx.words)) return [];
  return planCore(ctx, CARRY_DEPTH).events();
}

// The previous segment's looks reach into this one: a hand-over look runs on into the partner's
// first words, and a look that ended just before the turn leaves the eyes there a moment ago. A
// segment is planned alone (the cue clock asks for one at a time), so it re-plans its neighbour's
// EYELINE looks (pure; those never depend on the shots, only nods and interest do, on their own
// seeded streams) to keep the hand-over one continuous look and ≥ 2 s between two looks of a slot
// across the boundary (critic r2: the head turned to the partner, back to the lens for 0.5 s and
// to the partner again). The neighbour's own carry is planned to a fixed depth (deterministic,
// a few planner runs per segment; only chains of very short lines reach further back).
const CARRY_DEPTH = 3;

function planCore(ctx, depth) {
  const style = STYLE[ctx.programId] || (ctx.duo ? STYLE['world-now'] : { solo: 'default' });
  const seed = ctx.seed >>> 0;
  const r = rng((seed ^ 0x5bd1e995) >>> 0);
  // nods and interest read the shots: their own streams, so the eyelines never depend on them
  const rr = { nod: rng((seed ^ 0x2c1b3c6d) >>> 0 || 1), interest: rng((seed ^ 0x297a2d39) >>> 0 || 1) };
  const plan = new Plan(ctx);
  if (!ctx.duo) planSolo(ctx, style, r, plan);
  else {
    plan.ghosts = depth > 0 ? carryLooks(ctx, depth - 1) : {};
    planDuo(ctx, style, r, plan, rr);
  }
  return plan;
}

/** The previous segment's eyeline looks per slot, on this segment's clock (at < 0: before the first word). */
function carryLooks(ctx, depth) {
  const out = {};
  if (!(ctx.index > 0) || typeof ctx.contextAt !== 'function') return out;
  let p = null;
  try {
    p = ctx.contextAt(ctx.index - 1);
  } catch {
    p = null;
  }
  if (!p || !p.valid || !p.duo || !p.seg || !Array.isArray(p.words) || !(p.duration > 0)) return out;
  const off = p.duration + gapOf(p);
  const prev = planCore(p, depth);
  for (const [slot, list] of Object.entries(prev.looks)) {
    for (const l of list) {
      if (isReaction(l)) continue;
      const end = l.at + l.dur - off;
      if (end < -(RULES.lookGap + 1)) continue; // long gone
      // origin: where a carried chain of looks really began (a 'cont' continues an earlier look)
      (out[slot] ||= []).push({ at: l.at - off, dur: l.dur, target: l.target, why: l.why, origin: (l.origin ?? l.at) - off });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

class Plan {
  constructor(ctx) {
    this.ctx = ctx;
    this.looks = {}; // slot → [{ at, dur, target, ... }]
    this.ghosts = {}; // slot → the previous segment's looks on this clock (never emitted)
    this.nods = [];
  }

  list(slot) {
    return (this.looks[slot] ||= []);
  }

  /** The previous segment's partner look of `slot` that runs on into this turn (a hand-over), or null. */
  running(slot) {
    let best = null;
    for (const g of this.ghosts[slot] || []) if (g.target === 'partner' && g.at < 0 && g.at + g.dur > 0.05 && (!best || g.at + g.dur > best.at + best.dur)) best = g;
    return best;
  }

  /** End (this clock) of the previous segment's last look of `slot`, -Infinity if none. */
  lastEnd(slot) {
    let e = -Infinity;
    for (const g of this.ghosts[slot] || []) e = Math.max(e, g.at + g.dur);
    return e;
  }

  /** Room for an eyeline look of `slot` over [at, at + dur]: ≥ 2 s from its other eyeline looks (this segment's and the previous one's), clear of its reactions. */
  fits(slot, at, dur, gap = RULES.lookGap) {
    for (const l of this.list(slot)) {
      const g = isReaction(l) ? RULES.reactClear : gap;
      if (at < l.at + l.dur + g && l.at < at + dur + g) return false;
    }
    for (const l of this.ghosts[slot] || []) if (at < l.at + l.dur + gap && l.at < at + dur + gap) return false;
    return true;
  }

  /** Room for a reaction: clear of every look of the slot (arbitrate drops a look that starts inside another). */
  clear(slot, at, dur) {
    for (const l of this.list(slot)) {
      if (at < l.at + l.dur + RULES.reactClear && l.at < at + dur + RULES.reactClear) return false;
    }
    for (const n of this.nods) if (n.slot === slot && n.at > at - RULES.nodAfterLook && n.at < at + dur + RULES.reactClear) return false;
    return true;
  }

  add(slot, at, dur, target, extra = {}) {
    if (!(dur > 0.2) || !Number.isFinite(at)) return null;
    const l = { at: Math.max(0, at), dur, target, ...extra };
    this.list(slot).push(l);
    return l;
  }

  events() {
    const ctx = this.ctx;
    const out = [];
    for (const [slot, list] of Object.entries(this.looks)) {
      const robot = ROBOT.has(ctx.cast[slot]);
      for (const l of list) {
        const e = { kind: 'look', slot, target: l.target, char: charAt(ctx, l.at), at: round3(l.at), dur: round3(l.dur), why: l.why };
        if (robot) {
          e.amt = 0.45;
          e.style = 'mech';
        } else {
          if (l.amt !== undefined && l.amt < 0.999) e.amt = round3(l.amt);
          if (l.style) e.style = l.style;
        }
        if (l.onScreen) e.onScreen = true; // moved onto the first shot that shows the listener
        out.push(e);
      }
    }
    for (const n of this.nods) out.push(n);
    out.sort((a, b) => a.at - b.at);
    return out;
  }
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/** Char offset at time t (s from the first word): the word being spoken, or the end of the text. */
function charAt(ctx, t) {
  const w = ctx.words;
  if (!w.length || t <= w[0].t) return 0;
  if (t >= ctx.duration) return ctx.seg.text.length;
  let lo = 0, hi = w.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (w[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return w[lo].char;
}

/** The word that contains char `ch` (or the last word starting before it). */
function wordAtChar(ctx, ch) {
  const w = ctx.words;
  let best = null;
  for (const x of w) {
    if (x.char > ch) break;
    best = x;
  }
  return best;
}

const between = (r, [a, b]) => a + (b - a) * r();
/** Seeded hold that favours the middle of the range (the demo's 3.7 s is near the top). */
const hold = (r, [a, b]) => a + (b - a) * (0.5 * (r() + r()));

function gapOf(ctx) {
  return Number.isFinite(ctx.gapAfter) ? ctx.gapAfter : GAP[ctx.programId] ?? 0.9;
}

function namesOf(id) {
  if (!id) return [];
  return NAMES[id] || [String(id).toLowerCase()];
}

/** A hand-over by name or question at the end of the segment (stay on the wide, eyes meet). */
export function isToss(ctx) {
  if (!ctx.handover || !ctx.duo) return false;
  const next = ctx.nextSpeaker;
  const last = ctx.sentences[ctx.sentences.length - 1];
  if (!last) return false;
  const text = last.text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean).length;
  const named = namesOf(ctx.cast[next]).some((n) => text.includes(n));
  const nextSeg = ctx.episode?.segments?.[ctx.index + 1];
  if (ctx.type === 'chat' && nextSeg?.type === 'chat') return true; // banter: always on the wide
  if (named && words <= 8) return true;
  return /\?["'’”)]*\s*$/.test(last.text) && words <= 14;
}

/**
 * The partner's next line is a short chat line that hands straight back (a question or a name):
 * an optional hand-over look into it would make one look of the whole exchange, longer than the
 * approved hold, or a toss the partner can no longer meet (critic r3); the partner's question
 * turns this presenter anyway (its toss-meet).
 */
function tossBack(ctx) {
  if (typeof ctx.contextAt !== 'function') return false;
  let n = null;
  try {
    n = ctx.contextAt(ctx.index + 1);
  } catch {
    n = null;
  }
  return !!(n && n.valid && n.duo && n.type === 'chat' && n.duration < RULES.shortLine && isToss(n));
}

/**
 * Can the viewer see `slot` at time t? Unknown shots: yes. A wide, a two-shot or a solo wide
 * show both; a single (not an over-the-shoulder) only its focus (shows(), as for the glance).
 */
function seenAt(ctx, t, slot) {
  const shots = ctx.shots;
  if (!Array.isArray(shots) || !shots.length) return true;
  let cur = shots[0];
  for (const s of shots) {
    if (s.at > t + 1e-6) break;
    cur = s;
  }
  return shows(cur, slot);
}

// ---------------------------------------------------------------------------
// Duo programmes

function planDuo(ctx, style, r, plan, rr) {
  const D = ctx.duration;
  if (!(D > 0)) return;
  const speaker = ctx.speaker;
  const gap = gapOf(ctx);
  const toss = isToss(ctx);
  const segs = ctx.episode?.segments || [];
  const prevSeg = segs[ctx.index - 1] || null;
  const nextSeg = segs[ctx.index + 1] || null;
  const cues = Array.isArray(ctx.seg.cues) ? ctx.seg.cues : [];
  const speakerRobot = ROBOT.has(ctx.cast[speaker]);

  // ---- the speaker: the lens, a brief look at the partner opening a chat reply,
  // one hand-over glance at the end
  const speakerCue = cues.find((c) => c && c.action === 'look_partner' && (!c.slot || c.slot === speaker));
  const reply = ctx.type === 'chat' && ctx.turnStart && !!prevSeg && (prevSeg.type === 'chat' || prevSeg.anchor !== ctx.seg.anchor);
  const banter = ctx.type === 'chat' && prevSeg?.type === 'chat' && nextSeg?.type === 'chat';
  const short = ctx.type === 'chat' && D < RULES.shortLine;
  const cueAt = speakerCue ? ctx.timeAt(speakerCue.char) : null;
  // in banter every reply opens with the look (the eye contact of the exchange); otherwise seeded
  if (reply && (banter || r() < style.replyP || (cueAt !== null && cueAt < 2))) {
    const at = 0.05 + r() * 0.1;
    let dur = Math.min(RULES.replyMax, Math.max(0.9, D * 0.5), 1.2 + r() * 0.7);
    // met a toss and still looking: the reply look carries that look on (one look through the
    // hand-over, the whole of it within the approved glance's hold), never a second turn
    const run = plan.running(speaker);
    if (run) {
      const origin = run.origin ?? run.at;
      dur = Math.min(dur, RULES.glanceHold[1] - 0.4 + origin - at);
      // the carried look already took most of the hold: at most 0.7 s more, the whole within the
      // exchange (a look carried through a short line's toss), and none when it still runs anyway
      if (dur < 0.7) dur = Math.min(0.7, RULES.exchangeMax + origin - at);
      if (at + dur <= run.at + run.dur + 0.05) dur = 0;
    }
    // a look of its own a moment ago (the dry-line glance, the notes before its turn): no second one
    if (run ? dur > 0.2 : plan.lastEnd(speaker) + RULES.lookGap <= at) plan.add(speaker, at, dur, 'partner', run ? { why: 'reply-cont', origin: run.origin ?? run.at } : { why: 'reply' });
  } else if (cueAt !== null && cueAt < D - 2.5 && D > 3) {
    // the writer's look_partner cue for the speaker: one brief look where it was written
    const at = Math.max(0, cueAt - 0.15);
    if (plan.fits(speaker, at, 1.6)) plan.add(speaker, at, Math.min(RULES.replyMax, D - at - 0.3), 'partner', { why: 'cue' });
  }
  if (toss) {
    const at = Math.max(0.3, D - 1.15 - r() * 0.25);
    const end = D + gap + 0.9; // runs on into the partner's answer, where its 'cont' look carries it on
    const list = plan.list(speaker);
    const prev = list.filter((l) => l.target === 'partner').pop();
    if (prev && at < prev.at + prev.dur + RULES.lookGap) {
      if (D - prev.at <= RULES.shortShare * D) {
        // a late reply look and the toss are one short look
        prev.dur = end - prev.at;
        prev.why += '+toss';
      } else if (!banter) {
        // a short line that hands over by name or question: the toss look is the one look
        list.splice(list.indexOf(prev), 1);
        plan.add(speaker, at, end - at, 'partner', { why: 'toss' });
      }
      // banter: the reply look is the one look (merging it with the toss read as a stare
      // across the whole line); the partner's answer opens with its own look
    } else if (plan.fits(speaker, at, end - at)) plan.add(speaker, at, end - at, 'partner', { why: 'toss' });
  } else if (ctx.handover && (ctx.type === 'chat' || nextSeg?.type === 'chat') && D > 2.5 && r() < 0.5 && !tossBack(ctx)) {
    // the hand-over look runs on into the partner's first words like a toss (critic r2: ending
    // 0.3 s into the gap, it made the head come back to the lens and turn again at the partner's
    // turn); the next segment carries it on as its 'cont' look and keeps the whole within the hold
    const at = D - 0.9 - r() * 0.2;
    const end = D + gap + 0.9; // slack for a longer pause on air: the partner's 'cont' look takes over at its first word
    if (plan.fits(speaker, at, D - at)) plan.add(speaker, at, end - at, 'partner', { why: 'handover' });
  }
  // a short chat line: the speaker's own gaze at the partner stays within 60 % of it too
  if (short) trimGaze(plan, speaker, D, RULES.shortShare * D);
  const speakerLooks = plan.list(speaker);

  // ---- listeners
  const LR = listenerOf(ctx.programId);
  for (const slot of ctx.listeners) {
    const robot = ROBOT.has(ctx.cast[slot]);
    const cap = D >= 8 ? Math.min(RULES.gazeShare, LR.maxGazeShare ?? RULES.gazeShare) * D : RULES.gazeShort;
    const tossLook = speakerLooks.find((l) => /toss/.test(l.why));
    let glance = null;
    if (ctx.turnStart) {
      let at = between(r, RULES.glanceStart);
      let dur;
      if (robot) dur = between(r, RULES.robotHold);
      else {
        dur = hold(r, RULES.glanceHold);
        if (ctx.grave) dur = Math.min(dur, 2.4 + r() * 0.6); // grave: a shorter, quieter glance
      }
      // over a long show the same move at every hand-over turns mechanical: some story turns
      // vary (episode-level running budget, seeded; see turnVariety)
      const vary = robot ? null : turnVariety(ctx, slot);
      if (vary === 'late') {
        at = between(r, RULES.lateStart);
        dur = Math.min(dur, between(r, RULES.lateHold));
      }
      // back on the lens by 4.5 s, or by the end of a shorter turn
      dur = Math.min(dur, RULES.backBy - EYES_BACK - at, D - EYES_BACK - at);
      // a short chat line: the glance stays within 60 % of it (then the lens)
      if (short) dur = Math.min(dur, RULES.shortShare * D - at);
      // never the same move twice: half the glances are the full approved turn, the others a little smaller
      const amt = r() < 0.5 ? 1 : between(r, RULES.glanceAmt);
      const run = plan.running(slot);
      if (run) {
        // the hand-over look of its own last line is still on (it tossed or handed over by name):
        // the eyes stay with the new speaker over the first words and then come back, ONE look
        // through the hand-over whose whole stays within the approved hold (never back to the lens
        // for half a second and round again: critic r2)
        const whole = robot ? between(r, RULES.robotHold) : Math.min(dur, RULES.glanceHold[1]);
        const origin = run.origin ?? run.at;
        let end = Math.max(RULES.contMin, whole + origin);
        end = Math.min(end, RULES.backBy - EYES_BACK, D - EYES_BACK, short ? RULES.shortShare * D : Infinity);
        if (end > 0.3) glance = plan.add(slot, 0, end, 'partner', { why: 'cont', origin });
        // answered in banter on the wide: now and then the held look takes the answer with interest
        if (glance && ctx.type === 'chat' && !ctx.grave && !robot && !speakerRobot && !(style.dry && ctx.dryLine) && style.interestP && r() < style.interestP * 0.6) glance.style = 'interest';
      } else if (vary === 'notes') {
        const nd = between(r, [0.7, 1.1]);
        const n0 = Math.max(0.4 + r() * 0.4, plan.lastEnd(slot) + RULES.lookGap);
        if (n0 + nd < D - 0.3 && n0 < 2) onScreen(ctx, plan, slot, plan.add(slot, n0, nd, 'notes', { why: 'turn-notes' }), gap, nextSeg);
      } else if (vary !== 'skip' && dur > 0.5) {
        // a look of its own ended a moment before the turn (its reply look, a short line's last
        // look): the glance waits for the 2 s between two looks, or is not made (≤ 1 s into the turn)
        const wait = plan.lastEnd(slot) + RULES.lookGap + 0.01;
        if (wait > at) {
          dur -= wait - at;
          at = wait;
        }
        if (at <= RULES.glanceStart[1] + 0.65 && dur > 0.5) glance = onScreen(ctx, plan, slot, plan.add(slot, at, dur, 'partner', { why: vary === 'late' ? 'turn-late' : 'turn', amt }), gap, nextSeg);
        // banter on the wide (both in frame): now and then the glance meets the line with
        // interest, a small brow lift for its first second (variety; never grave, never
        // during UNIT-8's literal lines, never on a dry line: the deadpan needs a straight face)
        if (glance && ctx.type === 'chat' && !ctx.grave && !speakerRobot && !(style.dry && ctx.dryLine) && style.interestP && r() < style.interestP * 0.6) glance.style = 'interest';
      }
    }
    // TECH BYTES: the dry line gets a glance as it starts, back before it ends
    // (not in an intro or outro: their last line is the greeting or the sign-off, said to the lens)
    if (style.dry && ctx.dryLine && !robot && !speakerRobot && ctx.type !== 'outro' && ctx.type !== 'intro') {
      const d0 = ctx.dryLine.t0 + 0.06 + r() * 0.08;
      const d1 = Math.min(ctx.dryLine.t1 - 0.15 - EYES_BACK, d0 + 2.6);
      if (d1 - d0 >= 0.7) {
        if (glance && d0 < glance.at + glance.dur + RULES.lookGap) {
          // close to the turn-start glance: one look that covers both, still back before the line ends
          // (a carried look keeps its whole within the approved hold: then the carried look is the one)
          const whole = glance.why === 'cont' ? (glance.origin ?? 0) + RULES.glanceHold[1] : Infinity;
          const end = Math.min(Math.max(glance.at + glance.dur, d0 + 0.7), d1, glance.at + cap, whole);
          if (end > glance.at + glance.dur) {
            glance.dur = end - glance.at;
            glance.why = glance.why === 'cont' ? 'cont+dry' : 'turn+dry';
          }
        } else {
          // one look per segment (tech-bytes.md §4 item 6): the dry-line glance replaces the turn's
          if (glance) {
            const list = plan.list(slot);
            list.splice(list.indexOf(glance), 1);
            glance = null;
          }
          if (plan.fits(slot, d0, d1 - d0)) plan.add(slot, d0, d1 - d0, 'partner', { why: 'dry', style: 'side' }); // a sidelong look: the deadpan holds
        }
      }
    }
    // a toss: the partner meets the look, and keeps it into its own reply; asked a question,
    // its brows lift a little as it meets the look (style 'interest', no extra event)
    const meetStyle = tossLook && !robot && !ctx.grave && ctx.question && ctx.question.t1 >= D - 0.3 ? { style: 'interest' } : {};
    if (tossLook) {
      const m0 = Math.max(tossLook.at, D - 1.4) + 0.12 + r() * 0.13;
      const mEnd = D + gap + 0.6;
      const prev = plan.list(slot).filter((l) => l.target === 'partner').pop();
      if (short) {
        // a short chat line that hands over (critic r3 blocker): the glance at its start, cut to
        // 60 % of the line, was a head flick that ended just as the speaker's toss look began, so
        // the two heads passed each other and the answer went to the lens. ONE look instead: the
        // partner meets the toss (and keeps it into its answer, where its reply look carries it on)
        meetShort(plan, slot, prev, m0, mEnd, D, robot, meetStyle);
      } else if (prev && m0 < prev.at + prev.dur + RULES.lookGap) {
        // merge with the earlier glance when the turn is short enough for one look
        const merged = D - prev.at;
        if (merged <= cap) {
          prev.dur = mEnd - prev.at;
          prev.why += '+toss';
          if (meetStyle.style && D <= 3.5 && !prev.style) prev.style = meetStyle.style; // a short question: the brows go up as the look meets it
        } else {
          // keep both apart: shorten the earlier glance (≥ 1.6 s: a shorter one with the full head
          // turn reads as a flick, critic r3) and meet the toss later
          const room = Math.min(m0 - RULES.lookGap - 0.01 - prev.at, cap - (D - m0) - 0.05);
          if (room >= RULES.minFull) {
            prev.dur = Math.min(prev.dur, room);
            plan.add(slot, m0, mEnd - m0, 'partner', { why: 'toss-meet', ...meetStyle });
          } else {
            // one look again, starting late enough to respect the cap
            prev.at = Math.max(prev.at, D - cap + 0.05);
            prev.dur = mEnd - prev.at;
            prev.why += '+toss';
          }
        }
      } else if (plan.fits(slot, m0, 0.1, RULES.lookGap)) {
        plan.add(slot, m0, mEnd - m0, 'partner', { why: 'toss-meet', ...meetStyle });
      } else {
        // the previous segment's look ended less than 2 s before the toss: meet it as soon as the
        // spacing allows, while the speaker still looks (never a missed toss)
        const at = plan.lastEnd(slot) + RULES.lookGap + 0.01;
        if (at < D - 0.2 && plan.fits(slot, at, mEnd - at)) plan.add(slot, at, mEnd - at, 'partner', { why: 'toss-meet', ...meetStyle });
      }
    }
    trimGaze(plan, slot, D, short ? Math.min(cap, RULES.shortShare * D) : cap);
    // the next speaker glances at its notes just before its own turn (no toss)
    if (ctx.handover && ctx.nextSpeaker === slot && !tossLook && D >= 6 && r() < style.prepP) {
      const dur = between(r, [0.7, 1.1]);
      // its own line may open with a look at the partner (a chat reply): the notes end ≥ 2 s before it
      const lead = nextSeg?.type === 'chat' ? Math.max(0.55, RULES.lookGap + 0.15 - gap) : 0.55;
      const at = D - lead - dur - r() * 0.5;
      if (at > 1.5 && plan.fits(slot, at, dur)) plan.add(slot, at, dur, 'notes', { why: 'prep' });
    }
    // a story boundary (the same speaker goes on with a new story): the wall changed (a picture
    // or a place) → maybe a glance at it; otherwise, after a long story, maybe the notes. Never on
    // every roundup item (only the first), never right after a short item (one per ~8 s at most).
    if (!ctx.turnStart && ctx.type === 'story' && !robot && !plan.list(slot).length && boundaryOk(ctx, prevSeg)) {
      const k = r();
      if ((ctx.hasImage || ctx.seg.location) && k < style.wallP) {
        const at = 0.3 + r() * (RULES.wallWithin - 0.9);
        const dur = between(r, [1.0, 1.4]);
        if (plan.fits(slot, at, dur)) plan.add(slot, at, dur, 'wall', { why: 'wall' });
      } else if (k > 1 - style.notesP && D >= 5) {
        const at = 0.35 + r() * 0.6;
        const dur = between(r, [0.7, 1.1]);
        if (plan.fits(slot, at, dur)) plan.add(slot, at, dur, 'notes', { why: 'between' });
      }
    }
    planNod(ctx, style, rr.nod, plan, slot, robot, LR);
    planInterest(ctx, style, rr.interest, plan, slot, robot, LR);
  }

  // ---- between stories: the speaker who carries on glances at the notes in the gap
  if (!ctx.handover && nextSeg && nextSeg.anchor === ctx.seg.anchor && ctx.type === 'story' && D >= 7.5 && gap >= 0.75 && r() < 0.5) {
    const at = D + 0.05 + r() * 0.15;
    const dur = Math.min(RULES.notes[1], gap - 0.3 - EYES_BACK + 0.05);
    if (dur >= RULES.notes[0] && plan.fits(speaker, at, dur)) plan.add(speaker, at, dur, 'notes', { why: 'gap' });
  }
  eyeLed(ctx, plan);
}

/**
 * Short looks are eye-led (critic r3: a 0.5-1.0 s partner look with the full 0.4 rad head turn,
 * in over 0.38 s and back over 0.42 s, read as a twitchy double-take): a partner look whose merged
 * span (with the slot's overlapping partner looks, the previous segment's included) is shorter than
 * RULES.sideBelow becomes a sidelong look (style 'side': the eyes go, the head turns 40 %).
 * behaviour.js applyLook scales the head by the look's length on top, as a safety net.
 */
function eyeLed(ctx, plan) {
  for (const [slot, list] of Object.entries(plan.looks)) {
    if (ROBOT.has(ctx.cast[slot])) continue; // UNIT-8's look is its own (mechanical, 1 px)
    const ghosts = plan.ghosts[slot] || [];
    for (const l of list) {
      if (l.target !== 'partner' || l.style === 'side') continue;
      let a = l.at, b = l.at + l.dur;
      for (let pass = 0; pass < 2; pass++) {
        for (const o of list) if (o !== l && o.target === 'partner' && o.at <= b + 0.05 && o.at + o.dur >= a - 0.05) (a = Math.min(a, o.at)), (b = Math.max(b, o.at + o.dur));
        for (const o of ghosts) if (o.target === 'partner' && o.at <= b + 0.05 && o.at + o.dur >= a - 0.05) (a = Math.min(a, o.at)), (b = Math.max(b, o.at + o.dur));
      }
      if (b - a < RULES.sideBelow) l.style = 'side';
    }
  }
}

/** pace.js listener rules for a programme (reactionGap, maxGazeShare, nodsPerMin...); {} if pace fails. */
function listenerOf(programId) {
  try {
    return listenerRules(programId) || {};
  } catch {
    return {};
  }
}

const VARIETY = new WeakMap(); // episode summary → Map(segment index → 'late' | 'notes' | 'skip')

/**
 * Turn-start variety for this segment's listener, decided for the whole episode at once
 * (a pure function of the episode summary and its seed, memoised; no runtime state): a
 * story turn start varies with p 0.3 (never the listener's first turn), and always after
 * three turn glances of that listener in a row with the plain move, among the programme's
 * VARY kinds; 'skip' only on turns of ~8 s or more. Never UNIT-8, never a grave story.
 */
export function turnVariety(ctx, slot) {
  const kinds = VARY[ctx.programId];
  if (!kinds || ctx.type !== 'story' || !ctx.turnStart) return null;
  const ep = ctx.episode;
  if (!ep || !Array.isArray(ep.segments)) return null;
  let m = VARIETY.get(ep);
  if (!m) {
    m = varietyPlan(ep, ctx.cast || {}, kinds);
    VARIETY.set(ep, m);
  }
  return m.get(ctx.index) || null;
}

function varietyPlan(ep, cast, kinds) {
  const out = new Map();
  const run = {}; // listener slot → turn glances in a row with the same approved move
  const segs = ep.segments;
  // the intro's glance (the greeting, owner 17:47) is every listener's first
  if (segs[0]?.anchor) for (const slot of Object.keys(cast)) if (slot !== segs[0].anchor) run[slot] = 1;
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i], prev = segs[i - 1];
    if (!s.anchor || !prev.anchor || s.anchor === prev.anchor) continue;
    const lis = prev.anchor; // a duo: this turn's listener is the previous speaker
    if (ROBOT.has(cast[lis])) continue; // UNIT-8's look is the format
    const n = run[lis] || 0;
    let v = null;
    if (s.type === 'story' && !s.grave && n >= 1) {
      // a running budget, not a time window (critic r2: alternating 12-15 s turns put the same
      // listener's glances ~28 s apart, so every story turn opened with the identical move): seeded
      // p 0.3, and the 4th story turn in a row with the plain glance always varies
      const r = rng((((ep.seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0) || 1);
      if (n >= RULES.varyEvery - 1 || r() < RULES.varyP) {
        v = kinds[Math.floor(r() * kinds.length) % kinds.length];
        if (v === 'skip' && s.chars / 15 < 8) v = kinds.includes('notes') ? 'notes' : 'late';
      }
    }
    if (v) {
      out.set(i, v);
      run[lis] = 0;
    } else run[lis] = n + 1;
  }
  return out;
}

/**
 * A short chat line that hands over (critic r3 blocker): the listener's ONE look meets the
 * speaker's toss look. The glance at the line's start goes (cut to 60 % of a ~2 s line it ended
 * as the toss began: the heads crossed and the toss was never met); a look the listener carries on
 * from its own hand-over ('cont') runs on through the toss when the whole stays within
 * RULES.exchangeMax (one look through a quick exchange); otherwise the meet starts just after the
 * toss look, or as soon as the 2 s between two looks allows, while the speaker still looks.
 */
function meetShort(plan, slot, prev, m0, mEnd, D, robot, meetStyle) {
  const list = plan.list(slot);
  const run = plan.running(slot);
  const carried = prev && /^cont/.test(prev.why) ? prev : null;
  if (carried) {
    const start = carried.origin ?? (run ? Math.min(run.at, carried.at) : carried.at);
    if (mEnd - start <= RULES.exchangeMax) {
      carried.dur = mEnd - carried.at;
      carried.why += '+toss';
      carried.keep = true; // the exchange: not trimmed to 60 % of the line
      return;
    }
  }
  if (prev) list.splice(list.indexOf(prev), 1);
  let at = m0;
  if (!plan.fits(slot, at, mEnd - at)) at = Math.max(at, plan.lastEnd(slot) + RULES.lookGap + 0.01);
  if (at < D - 0.15 && plan.fits(slot, at, mEnd - at)) {
    plan.add(slot, at, mEnd - at, 'partner', { why: 'toss-meet', ...(robot ? {} : meetStyle) });
    return;
  }
  // no room for a separate meet (the carried look ended a moment ago): the carried look runs on
  // as far as the exchange allows, so the toss is still met
  if (carried) {
    const start = carried.origin ?? (run ? Math.min(run.at, carried.at) : carried.at);
    const end = Math.min(mEnd, start + RULES.exchangeMax);
    if (end > D - 0.6) {
      carried.dur = end - carried.at;
      carried.why += '+toss';
      carried.keep = true;
      list.push(carried);
    } else list.push(carried); // keep the carried look as it was
  }
}

/** Gaze at the speaker within the turn ≤ cap: trim the latest partner look's in-turn part (an exchange look is kept). */
function trimGaze(plan, slot, D, cap) {
  const looks = plan.list(slot).filter((l) => l.target === 'partner' && !l.keep);
  let total = 0;
  for (const l of looks) total += Math.max(0, Math.min(D, l.at + l.dur) - l.at);
  if (total <= cap + 1e-6) return;
  for (let i = looks.length - 1; i >= 0 && total > cap + 1e-6; i--) {
    const l = looks[i];
    const inTurn = Math.max(0, Math.min(D, l.at + l.dur) - l.at);
    const cut = Math.min(total - cap, inTurn - 0.8);
    if (cut <= 0) continue;
    if (l.at + l.dur > D) {
      // a look that runs on past the turn starts later instead of ending earlier
      l.at += cut;
      l.dur -= cut;
    } else l.dur -= cut;
    total -= cut;
  }
}

/** A boundary look is allowed: not a later roundup item, and the previous segment was long enough. */
function boundaryOk(ctx, prevSeg) {
  const ru = ctx.seg.roundup || ctx.episode?.segments?.[ctx.index]?.roundup;
  if (ru && ru.index > 0) return false;
  const prevChars = ctx.episode?.segments?.[ctx.index - 1]?.chars ?? (prevSeg?.text ? prevSeg.text.length : 0);
  return prevChars / 15 >= RULES.boundaryAfter; // ~15 chars/s of speech
}

// The turn glance where the viewer can see it (owner 17:47; INTEGRATION's request): planned while
// the shot hides the listener (the headline montage, a map, the speaker's single), it moves to
// 0.25 s after the first later planned cut that shows the listener, within 15 s of the turn start,
// the way direction/index.js onScreenGlances would, but here, so the rest of the plan (the notes
// before its own turn, the toss) keeps ≥ 2 s from it, and so it ends early enough for the slot's
// first look of the next segment (critic r2: a moved glance 0.4 s from the notes look). A glance
// that cannot fit there is not made (it would have been spent off screen); with no such cut it
// stays (the cue clock holds a hidden turn glance for a real cut).
const SHOW_LEGACY = new Set(['wide', 'close', 'full', 'map', 'fact', 'montage']);
const SHOW_WIDE = new Set(['wide', 'two', 'solo-wide']);
const MOVE = { window: 15, afterCut: 0.25, min: 0.8 };

function shows(s, slot) {
  const legacy = SHOW_LEGACY.has(s.shot) ? s.shot : SHOW_WIDE.has(s.framing || s.shot) ? 'wide' : 'close';
  if (legacy === 'wide') return true;
  return legacy === 'close' && s.focus === slot && s.framing !== 'ots';
}

function onScreen(ctx, plan, slot, look, gap, nextSeg) {
  const shots = ctx.shots;
  if (!look || !Array.isArray(shots) || !shots.length) return look;
  let i = -1;
  for (let k = 0; k < shots.length && shots[k].at <= look.at + 1e-6; k++) i = k;
  if (i >= 0 && shows(shots[i], slot)) return look;
  let j = i + 1;
  while (j < shots.length && !(shots[j].at > look.at && shows(shots[j], slot))) j++;
  if (j >= shots.length || shots[j].at > MOVE.window) return look; // nothing to move to: it stays
  const list = plan.list(slot);
  list.splice(list.indexOf(look), 1);
  const at = shots[j].at + MOVE.afterCut;
  let end = Math.min(at + look.dur, ctx.duration - EYES_BACK);
  // ≥ 2 s before the slot's first look of the next segment (a reply look opens its line at ~0.1 s)
  if (nextSeg) end = Math.min(end, ctx.duration + gap + 0.1 - RULES.lookGap);
  if (end - at < MOVE.min || !plan.fits(slot, at, end - at)) return null;
  return plan.add(slot, at, end - at, look.target, { why: look.why, amt: look.amt, onScreen: true });
}

/**
 * INTEREST: a listener in frame lifts its brows a little and tilts its head (face only)
 * as the speaker lands the story's figure (ctx.figures), or, in a chat line on the wide
 * (where the listener is seen), on the speaker's last stressed word after the turn glance.
 * At most once per turn; never on grave lines, never by UNIT-8, never inside another look
 * of that listener, never on UNIT-8's literal lines (the straight face), never into a dry line.
 */
function planInterest(ctx, style, r, plan, slot, robot, LR) {
  if (robot || ctx.grave || !style.interestP) return;
  if (ROBOT.has(ctx.speakerId) && ctx.type === 'chat') return; // the straight face for UNIT-8's literal lines
  if (r() >= style.interestP) return;
  const D = ctx.duration;
  const dry = ctx.dryLine;
  const cands = [];
  if (Array.isArray(ctx.figures)) for (const f of ctx.figures) cands.push(f.t);
  if (ctx.type === 'chat' && D >= 3.2) {
    for (let i = ctx.words.length - 1; i >= 0; i--) {
      const w = ctx.words[i];
      if (w.stressed && w.content && w.t >= 2.2 && w.t <= D - 0.4) {
        cands.push(w.t);
        break;
      }
    }
  }
  for (const t of cands) {
    const at = t - 0.08;
    const dur = between(r, RULES.interest);
    if (at < 0.6 || at + dur > D + 0.4) continue;
    if (dry && at + dur > dry.t0 - 0.2) continue;
    if (!seenAt(ctx, at, slot)) continue;
    if (!plan.clear(slot, at, dur)) continue;
    // two visible reactions of one listener keep pace's reactionGap apart (a nod and a brow lift)
    if (plan.nods.some((n) => n.slot === slot && Math.abs(n.at - at) < (LR.reactionGap ?? 0))) continue;
    plan.add(slot, at, dur, 'interest', { why: 'interest' });
    return;
  }
}

/** Char offset of the listener's own name in an intro's greeting ("I'm Paco Pixel, with Lola Byte"), or -1. */
function greetingNameAt(ctx, slot) {
  if (ctx.type !== 'intro') return -1;
  const text = ctx.seg.text.toLowerCase();
  let at = -1;
  for (const n of namesOf(ctx.cast[slot])) {
    const k = text.lastIndexOf(n);
    if (k > at) at = k;
  }
  // only the greeting's own sentence names the co-presenter (not a headline that mentions them)
  const last = ctx.sentences[ctx.sentences.length - 1];
  return last && at >= last.start ? at : -1;
}

function planNod(ctx, style, r, plan, slot, robot, LR) {
  if (ctx.grave) return; // never on grave lines
  let hint = (Array.isArray(ctx.seg.cues) ? ctx.seg.cues : []).find((c) => c && c.action === 'nod' && c.slot === slot);
  // the greeting nod (world-now.md: once per presenter): named in the intro, the co-presenter
  // acknowledges it with a small nod even when the writer sent no [B:nod]
  const named = greetingNameAt(ctx, slot);
  if (!hint && named >= 0) hint = { char: named, action: 'nod', slot };
  const greeting = named >= 0 && !!hint && Math.abs(hint.char - named) < 24;
  // the straight face: nobody nods along to UNIT-8's literal lines unless the writer asks
  if (!hint && ROBOT.has(ctx.speakerId) && ctx.type === 'chat') return;
  // the greeting nod is part of the format (once per presenter), not a chance reaction; otherwise
  // pace's listener.nodsPerMin [min, max] per minute of listening bounds the chance per turn
  const D = ctx.duration;
  const rate = Array.isArray(LR.nodsPerMin) ? LR.nodsPerMin : null;
  let p = greeting ? 1 : hint ? style.hintNodP : style.nodP;
  if (!greeting && rate) p = Math.min(Math.max(p, (rate[0] * 1.25 * D) / 60), Math.max(0.05, (rate[1] * D) / 60), 1);
  if (r() >= p) return;
  const looks = plan.list(slot);
  const dry = ctx.dryLine;
  const ok = (w) => {
    if (!w.stressed || !w.content || w.t < 1.2 || w.t > D - 0.6) return false;
    if (dry && w.t >= dry.t0 - 0.3) return false; // a deadpan line needs a straight face
    const at = w.t + 0.05;
    for (const l of looks) if (at >= l.at - 0.3 && at < l.at + RULES.nodAfterLook) return false;
    // where the viewer sees the listener (critic r3: only the wide counted, so the A seat, rarely
    // on the wide while its partner speaks, never nodded on air): any shot that shows it, the whole
    // nod inside it (~0.6 s)
    return seenAt(ctx, at, slot) && seenAt(ctx, at + 0.6, slot);
  };
  // the hinted word itself (a name at the very end of the turn included): the nod lands where the
  // writer put it, and may run on into the gap; otherwise the nearest stressed word to the hint
  let w = null;
  if (hint) {
    const hw = wordAtChar(ctx, hint.char);
    // a stressed content word (the greeting's name may carry no accent mark of its own)
    if (hw && hw.content && (hw.stressed || greeting) && hw.t >= 1.2 && hw.t <= D + 0.05 && (!dry || hw.t < dry.t0 - 0.3)) {
      const at = hw.t + 0.05;
      const clearOfLooks = looks.every((l) => !(at >= l.at - 0.3 && at < l.at + RULES.nodAfterLook));
      if (clearOfLooks && seenAt(ctx, at, slot) && seenAt(ctx, at + 0.6, slot)) w = hw;
    }
  }
  const cands = w ? [w] : ctx.words.filter(ok);
  if (!cands.length) return;
  if (w) {
    // the hinted word passed
  } else if (hint) {
    const ht = ctx.timeAt(hint.char);
    w = cands.reduce((b, c) => (Math.abs(c.t - ht) < Math.abs(b.t - ht) ? c : b), cands[0]);
  } else {
    // prefer the stronger accents, seeded
    const strong = cands.filter((c) => c.emph >= 0.6);
    const pool = strong.length ? strong : cands;
    w = pool[Math.floor(r() * pool.length) % pool.length];
  }
  const serious = ctx.emotion === 'serious' || ctx.emotion === 'sad';
  plan.nods.push({
    kind: 'gesture', slot, name: 'nod', char: w.char, at: round3(w.t + 0.05),
    speed: robot ? 0.75 : serious ? 0.8 : 0.95, amp: robot ? 0.5 : 0.6, why: greeting ? 'nod-greeting' : hint ? 'nod-hint' : 'nod',
  });
}

// ---------------------------------------------------------------------------
// Solo programmes: the lens, and the notes in the gaps

function planSolo(ctx, style, r, plan) {
  const D = ctx.duration;
  const segs = ctx.episode?.segments || [];
  const next = segs[ctx.index + 1];
  if (!next || !(D > 0) || !Number.isFinite(ctx.gapAfter)) return;
  const gap = ctx.gapAfter;
  const slot = ctx.speaker;
  const betweenStories = ctx.type === 'story' || ctx.type === 'intro';
  if (!betweenStories) return;
  if (style.solo === 'money') {
    // down at the notes ≤ 0.3 s after the last word, back on the lens ≥ 0.15 s before the next first word
    const at = D + 0.04 + r() * 0.2;
    const t1 = D + gap - 0.15 - EYES_BACK - 0.02;
    const dur = Math.min(RULES.notes[1], t1 - at);
    if (dur >= 0.45) plan.add(slot, at, dur, 'notes', { why: 'gap' });
  } else if (style.solo === 'news60') {
    if (gap < 0.6 || D < 7.5) return;
    // the eyes drop once the last word has ended (never during it: critic r2) and are back on the
    // lens ≥ 0.15 s before the next item's first word: in NEWS IN 60's 0.7-0.8 s gaps a quick dip
    // of the eyes (0.35-0.5 s), the brisk read of the format
    const at = D + 0.02 + r() * 0.04;
    const dur = Math.min(RULES.notes[1], D + gap - 0.15 - EYES_BACK - 0.02 - at);
    if (dur >= 0.35) plan.add(slot, at, dur, 'notes', { why: 'gap' });
  } else if (gap >= 0.75 && D >= 7.5 && r() < 0.7) {
    const at = D + 0.05 + r() * 0.2;
    const dur = Math.min(RULES.notes[1], D + gap - 0.15 - EYES_BACK - at);
    if (dur >= RULES.notes[0]) plan.add(slot, at, dur, 'notes', { why: 'gap' });
  }
}

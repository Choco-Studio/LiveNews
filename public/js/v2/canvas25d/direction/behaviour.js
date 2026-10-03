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
//     figure, at most once per turn, never on grave lines, never during another look.
//   RESTRAINT  per listener and turn: one glance at the speaker (plus the dry-line
//     glance and the toss exchange), gaze at the speaker ≤ 45 % of turns of 8 s or
//     more and ≤ 4.0 s in shorter ones; ≥ 2.0 s between two looks of one slot.
//   SHORT LINES (critic r1: banter read as a mutual stare)  a chat line shorter than
//     5.4 s gets ONE look from the speaker (banter: the reply look at its start; a named
//     or asked hand-over: the toss look at its end) and the listener's glance stays
//     within 60 % of the line: both look at each other as the line starts, then the lens.
//   VARIETY OVER TIME  a story turn start whose listener already glanced less than 25 s
//     earlier may (seeded, 30 %) vary: a later glance (0.45-0.9 s in, shorter), a look
//     at the notes, or none (per programme, VARY); tosses and banter keep the approved
//     glance (the hand-over's own look runs into the turn anyway).
//   ONE LOOK PER SEGMENT (TECH BYTES §4 item 6)  when a dry line gets its own sidelong
//     glance, the listener's turn-start glance is dropped (the dry-line look is the one).
import { rng } from './context.js';

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
  varyWithin: 25, // a turn-start glance may vary when the same listener glanced < 25 s earlier
  varyP: 0.3,
  lateStart: [0.45, 0.9],
  lateHold: [1.6, 2.6],
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
  const style = STYLE[ctx.programId] || (ctx.duo ? STYLE['world-now'] : { solo: 'default' });
  const r = rng((ctx.seed ^ 0x5bd1e995) >>> 0);
  const plan = new Plan(ctx);
  if (!ctx.duo) planSolo(ctx, style, r, plan);
  else planDuo(ctx, style, r, plan);
  return plan.events();
}

// ---------------------------------------------------------------------------

class Plan {
  constructor(ctx) {
    this.ctx = ctx;
    this.looks = {}; // slot → [{ at, dur, target, ... }]
    this.nods = [];
  }

  list(slot) {
    return (this.looks[slot] ||= []);
  }

  /** Room for an eyeline look of `slot` over [at, at + dur]: ≥ 2 s from its other eyeline looks, clear of its reactions. */
  fits(slot, at, dur, gap = RULES.lookGap) {
    for (const l of this.list(slot)) {
      const g = isReaction(l) ? RULES.reactClear : gap;
      if (at < l.at + l.dur + g && l.at < at + dur + g) return false;
    }
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

/** Shot (legacy name) planned at time t, or null when the camera plan is unknown. */
function shotAt(ctx, t) {
  const shots = ctx.shots;
  if (!Array.isArray(shots) || !shots.length) return null;
  let cur = null;
  for (const s of shots) {
    if (s.at > t + 1e-6) break;
    cur = s.shot;
  }
  return cur || shots[0].shot;
}

// ---------------------------------------------------------------------------
// Duo programmes

function planDuo(ctx, style, r, plan) {
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
    plan.add(speaker, at, Math.min(RULES.replyMax, Math.max(0.9, D * 0.5), 1.2 + r() * 0.7), 'partner', { why: 'reply' });
  } else if (cueAt !== null && cueAt < D - 2.5 && D > 3) {
    // the writer's look_partner cue for the speaker: one brief look where it was written
    const at = Math.max(0, cueAt - 0.15);
    if (plan.fits(speaker, at, 1.6)) plan.add(speaker, at, Math.min(RULES.replyMax, D - at - 0.3), 'partner', { why: 'cue' });
  }
  if (toss) {
    const at = Math.max(0.3, D - 1.15 - r() * 0.25);
    const end = D + gap + 0.55; // runs on into the partner's answer, where it merges
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
  } else if (ctx.handover && (ctx.type === 'chat' || nextSeg?.type === 'chat') && D > 2.5 && r() < 0.5) {
    const at = D - 0.9 - r() * 0.2;
    if (plan.fits(speaker, at, D - at)) plan.add(speaker, at, D - at + 0.3, 'partner', { why: 'handover' });
  }
  // a short chat line: the speaker's own gaze at the partner stays within 60 % of it too
  if (short) trimGaze(plan, speaker, D, RULES.shortShare * D);
  const speakerLooks = plan.list(speaker);

  // ---- listeners
  for (const slot of ctx.listeners) {
    const robot = ROBOT.has(ctx.cast[slot]);
    const cap = D >= 8 ? RULES.gazeShare * D : RULES.gazeShort;
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
      // over a long show the same move at every hand-over turns mechanical: a story turn whose
      // listener glanced less than 25 s ago may vary (episode-level, seeded; see turnVariety)
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
      if (vary === 'notes') {
        const nd = between(r, [0.7, 1.1]);
        const n0 = 0.4 + r() * 0.4;
        if (n0 + nd < D - 0.3) plan.add(slot, n0, nd, 'notes', { why: 'turn-notes' });
      } else if (vary !== 'skip' && dur > 0.5) {
        glance = plan.add(slot, at, dur, 'partner', { why: vary === 'late' ? 'turn-late' : 'turn', amt });
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
          const end = Math.min(Math.max(glance.at + glance.dur, d0 + 0.7), d1, glance.at + cap);
          glance.dur = end - glance.at;
          glance.why = 'turn+dry';
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
      if (prev && m0 < prev.at + prev.dur + RULES.lookGap) {
        // merge with the earlier glance when the turn is short enough for one look
        const merged = D - prev.at;
        if (short) {
          // a short chat line: no second look and no merge into a stare; the glance at its
          // start was the look (the toss is met as the partner's own answer opens with a look)
        } else if (merged <= cap) {
          prev.dur = mEnd - prev.at;
          prev.why += '+toss';
          if (meetStyle.style && D <= 3.5 && !prev.style) prev.style = meetStyle.style; // a short question: the brows go up as the look meets it
        } else {
          // keep both apart: shorten the earlier glance (≥ 1.2 s) and meet the toss later
          const room = Math.min(m0 - RULES.lookGap - prev.at, cap - (D - m0) - 0.05);
          if (room >= 1.2) {
            prev.dur = room;
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
      }
    }
    trimGaze(plan, slot, D, short ? Math.min(cap, RULES.shortShare * D) : cap);
    // the next speaker glances at its notes just before its own turn (no toss)
    if (ctx.handover && ctx.nextSpeaker === slot && !tossLook && D >= 6 && r() < style.prepP) {
      const dur = between(r, [0.7, 1.1]);
      const at = D - 0.55 - dur - r() * 0.5;
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
    planNod(ctx, style, r, plan, slot, robot);
    planInterest(ctx, style, r, plan, slot, robot);
  }

  // ---- between stories: the speaker who carries on glances at the notes in the gap
  if (!ctx.handover && nextSeg && nextSeg.anchor === ctx.seg.anchor && ctx.type === 'story' && D >= 7.5 && gap >= 0.75 && r() < 0.5) {
    const at = D + 0.05 + r() * 0.15;
    const dur = Math.min(RULES.notes[1], gap - 0.3 - EYES_BACK + 0.05);
    if (dur >= RULES.notes[0] && plan.fits(speaker, at, dur)) plan.add(speaker, at, dur, 'notes', { why: 'gap' });
  }
}

const VARIETY = new WeakMap(); // episode summary → Map(segment index → 'late' | 'notes' | 'skip')

/**
 * Turn-start variety for this segment's listener, decided for the whole episode at once
 * (a pure function of the episode summary and its seed, memoised; no runtime state): a
 * story turn start whose listener already made a turn-start glance less than 25 s earlier
 * (estimated at 15 chars/s plus 0.9 s gaps) varies with p 0.3, among the programme's VARY
 * kinds; 'skip' only on turns of ~8 s or more. Never UNIT-8, never a grave story.
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
  const last = {}; // listener slot → estimated time of its last turn-start glance
  const segs = ep.segments;
  let t = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i], prev = segs[i - 1];
    if (prev && s.anchor && prev.anchor && s.anchor !== prev.anchor) {
      const lis = prev.anchor; // a duo: this turn's listener is the previous speaker
      const robot = ROBOT.has(cast[lis]);
      let v = null;
      if (!robot && s.type === 'story' && !s.grave && last[lis] !== undefined && t - last[lis] < RULES.varyWithin) {
        const r = rng((((ep.seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0) || 1);
        if (r() < RULES.varyP) {
          v = kinds[Math.floor(r() * kinds.length) % kinds.length];
          if (v === 'skip' && s.chars / 15 < 8) v = kinds.includes('notes') ? 'notes' : 'late';
        }
      }
      if (v) out.set(i, v);
      if (!robot && v !== 'notes' && v !== 'skip') last[lis] = t;
    }
    t += s.chars / 15 + 0.9;
  }
  return out;
}

/** Gaze at the speaker within the turn ≤ cap: trim the latest partner look's in-turn part. */
function trimGaze(plan, slot, D, cap) {
  const looks = plan.list(slot).filter((l) => l.target === 'partner');
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

/** Is the listener `slot` in frame at time t? (unknown shots: yes; the wide / two-shot; a single on the listener) */
function inFrame(ctx, t, slot) {
  const shots = ctx.shots;
  if (!Array.isArray(shots) || !shots.length) return true;
  let cur = shots[0];
  for (const s of shots) {
    if (s.at > t + 1e-6) break;
    cur = s;
  }
  return cur.shot === 'wide' || cur.framing === 'two' || (cur.shot === 'close' && cur.focus === slot && cur.framing !== 'ots');
}

/**
 * INTEREST: a listener in frame lifts its brows a little and tilts its head (face only)
 * as the speaker lands the story's figure (ctx.figures), or, in a chat line on the wide
 * (where the listener is seen), on the speaker's last stressed word after the turn glance.
 * At most once per turn; never on grave lines, never by UNIT-8, never inside another look
 * of that listener, never on UNIT-8's literal lines (the straight face), never into a dry line.
 */
function planInterest(ctx, style, r, plan, slot, robot) {
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
    if (!inFrame(ctx, at, slot)) continue;
    if (!plan.clear(slot, at, dur)) continue;
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

function planNod(ctx, style, r, plan, slot, robot) {
  if (ctx.grave) return; // never on grave lines
  let hint = (Array.isArray(ctx.seg.cues) ? ctx.seg.cues : []).find((c) => c && c.action === 'nod' && c.slot === slot);
  // the greeting nod (world-now.md: once per presenter): named in the intro, the co-presenter
  // acknowledges it with a small nod even when the writer sent no [B:nod]
  const named = greetingNameAt(ctx, slot);
  if (!hint && named >= 0) hint = { char: named, action: 'nod', slot };
  const greeting = named >= 0 && !!hint && Math.abs(hint.char - named) < 24;
  // the straight face: nobody nods along to UNIT-8's literal lines unless the writer asks
  if (!hint && ROBOT.has(ctx.speakerId) && ctx.type === 'chat') return;
  // the greeting nod is part of the format (once per presenter), not a chance reaction
  const p = greeting ? 1 : hint ? style.hintNodP : style.nodP;
  if (r() >= p) return;
  const D = ctx.duration;
  const looks = plan.list(slot);
  const dry = ctx.dryLine;
  const ok = (w) => {
    if (!w.stressed || !w.content || w.t < 1.2 || w.t > D - 0.6) return false;
    if (dry && w.t >= dry.t0 - 0.3) return false; // a deadpan line needs a straight face
    const at = w.t + 0.05;
    for (const l of looks) if (at >= l.at - 0.3 && at < l.at + RULES.nodAfterLook) return false;
    const shot = shotAt(ctx, at);
    return shot === null || shot === 'wide';
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
      const shot = shotAt(ctx, at);
      if (clearOfLooks && (shot === null || shot === 'wide')) w = hw;
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
    // the eyes drop as the last word ends and are back before the next item
    const at = Math.max(0, D - 0.2 - r() * 0.05);
    const dur = Math.min(RULES.notes[1], D + gap - 0.15 - EYES_BACK - 0.02 - at);
    if (dur >= 0.5) plan.add(slot, at, dur, 'notes', { why: 'gap' });
  } else if (gap >= 0.75 && D >= 7.5 && r() < 0.7) {
    const at = D + 0.05 + r() * 0.2;
    const dur = Math.min(RULES.notes[1], D + gap - 0.15 - EYES_BACK - at);
    if (dur >= RULES.notes[0]) plan.add(slot, at, dur, 'notes', { why: 'gap' });
  }
}

// Shot planner (owner: CAMERA stream): the camera grammar of a segment,
// decided at runtime from the live episode data and the programme's style
// bible (docs/programmes/*.md, "Camera and directing"). Pure and seeded: the
// same episode gives the same plan; nothing is written per story.
//
//   planShots(ctx) → [{ kind: 'shot', shot, framing, focus, char, at, move, beat, len, ... }]
//     shot     the LEGACY name the graphics, the music hooks and the old renderer
//              understand: 'wide' | 'close' | 'full' | 'map' | 'fact' | 'montage'
//     framing  the v2 camera framing for studio shots (camera.js framing()):
//              'wide' | 'two' | 'single' | 'close' | 'mcu-l' | 'mcu-r' | 'mcu' | 'ots';
//              null for full-screen graphics (full, map, fact, montage)
//     focus    the slot on screen (singles) or the speaker (two-shots)
//     char/at  the cut: char offset in seg.text and seconds from the first word
//              (ctx.timeAt); cuts sit on sentence starts or on a named word
//     move     null | { type: 'push' | 'pull', amount, delay, dur } (camera.js
//              cameraAt), timed from this event; only where the bible allows it
//     beat     what the shot is for: 'single' 'wide' 'headline' 'map' 'picture'
//              'fact' 'number' 'quote' 'roundup' 'pin' 'catch' 'alt' 'signoff'...
//     len      planned length inside this segment (s, to the next event or the
//              segment end + gap); informative
//     extras   card (montage index), pins (multi-pin map), pan (s, map to map),
//              beforeSpeech (s: MONEY MINUTE's number card cuts in the gap)
//   ctx = direction/context.js segmentContext(); `at` = seconds from the first word
//
// Shared rules (owner, 18:52, over every bible number): no planned shot under
// MIN_SHOT (≈ 4 s) except voice-paced headline beats; cuts only at sentence
// starts (or the named word); never cut on a dry line or within 1.2 s after it.
// Per programme (PLAN §9 digest, bibles win):
//   WORLD NOW    single (speaker in the third nearer their seat: mcu-l / mcu-r)
//                → map (2nd sentence) → picture ≤ 8 s → fact → single; round-up on
//                the map (map to map on each item's first word); chats and the
//                sign-off on the wide; moves: settling push ≤ 4 % on the greeting
//                wide, 3-4 % push on the lead's opening single, pull-out ≤ 4 % on
//                the sign-off wide ending in its hold; grave locked off
//   TECH BYTES   close singles; picture 4-8 s; chats on the wide; THE CATCH (Ada's
//                question on her close, push 0.5 %/s ≤ 3 %, Max's answer back to
//                the wide); studio ≤ 12 s
//   COSMOS       never moves; ≥ 4 s everywhere; single for sentence 1, map within
//                ±0.3 s of the place name, picture 6-10 s, single for the last
//                sentence; NUMBER OF THE DAY choreography (Reading on UNIT-8's first
//                word, single on sentence 2 ≥ 4 s later)
//   MONEY MINUTE never moves; WIDE / MCU-R / CARD / PIC / MAP (≤ 1 per episode);
//                cuts inside inter-sentence pauses; the per-story plan
//   NEWS IN 60   locked; WIDE only for intro/outro; lead MCU-L/FULL alternating;
//                items one shot per sentence, MCU-L/FULL order seeded per item, Sam
//                in vision in every item; one MAP for the round-up (pin pans 0.7 s)
// Unknown programme ids use WORLD NOW rules.
//
// Neighbour segments: decisions that depend on the previous or next segment
// (MONEY MINUTE's opening shot, the episode's single MAP, a chat run too short
// for its own wide) use ctx.contextAt(j) when the context provides it (exact),
// else a prediction from the episode summary (ctx.episode). Same answer from
// every call: pure functions of the episode.
import { rng } from './context.js';

export const MIN_SHOT = 4.0; // owner 18:52: no cut faster than ~4 s
const TOL = 0.5; // bible beats may go this far under MIN_SHOT (THE CATCH close)
const DEFAULT_GAP = 0.3; // the director's pause after a segment when ctx.gapAfter is unknown
const DRY_HOLD = 1.2; // tech-bytes: never cut on a dry line, hold 1.2 s after it
const CPS = 14.5; // chars per second to estimate a neighbour's length from the summary
// headline beats are paced by the voice (world-now.md: line + 1.0 s gap, held ≥ 3.8 s);
// the planner marks them with minLen so the director can hold the gap
const HEADLINE_MIN = 3.8;

/** Per-programme numbers (bibles; the owner's MIN_SHOT on top). */
export const SHOT_STYLES = {
  'world-now': { studioMax: 15, pictureMax: 8, mapMax: 7.5, signoffHold: 1.5, moves: true },
  'tech-bytes': { studioMax: 12, pictureMin: 4, pictureMax: 8, catch: true },
  cosmos: { studioMax: 15, pictureMin: 6, pictureMax: 10, mapMin: 4, mapMax: 6, placeWindow: 0.3 },
  'money-minute': { studioMax: 12, shotMax: 12, numberGap: 1.2, pauseCuts: true },
  'news-60': { studioMax: 12, fullMax: 8, fullHoldMax: 10.5, mapMax: 8 },
};

const styleOf = (id) => (SHOT_STYLES[id] ? id : 'world-now');

export function planShots(ctx) {
  if (!ctx || !ctx.valid || !Array.isArray(ctx.sentences)) {
    const solo = !ctx?.duo;
    return [ev(ctx, 0, 0, solo ? 'close' : 'wide', solo ? 'mcu' : 'wide', ctx?.speaker || 'A', 'fallback')];
  }
  const id = styleOf(ctx.programId);
  const tl = timeline(ctx);
  let out;
  switch (id) {
    case 'tech-bytes':
      out = techBytes(ctx, tl);
      break;
    case 'cosmos':
      out = cosmos(ctx, tl);
      break;
    case 'money-minute':
      out = moneyMinute(ctx, tl);
      break;
    case 'news-60':
      out = news60(ctx, tl);
      break;
    default:
      out = worldNow(ctx, tl);
  }
  if (!out.length) out.push(ev(ctx, 0, 0, ctx.duo ? 'wide' : 'close', ctx.duo ? 'wide' : 'mcu', ctx.speaker, 'fallback'));
  out.sort((a, b) => a.at - b.at);
  for (let i = 0; i < out.length; i++) out[i].len = round3((i + 1 < out.length ? out[i + 1].at : tl.end) - out[i].at);
  return out;
}

// ---------------------------------------------------------------------------
// Timeline helpers

const round3 = (v) => Math.round(v * 1000) / 1000;

function ev(ctx, at, char, shot, framing, focus, beat, extra = null) {
  const e = { kind: 'shot', shot, framing: framing || null, focus: focus || ctx?.speaker || 'A', char: Math.max(0, char | 0), at: round3(at), move: null, beat };
  return extra ? Object.assign(e, extra) : e;
}

/** Sentence boundaries (cut candidates), the segment's end and the dry-line guard. */
/** The director's hold after the sign-off before the end card (bibles), when ctx.gapAfter is unknown. */
const SIGNOFF_HOLD = { 'world-now': 1.5, 'news-60': 1.0, cosmos: 0.6, 'tech-bytes': 0.3, 'money-minute': 0.3 };

function timeline(ctx) {
  const hold = ctx.type === 'outro' ? SIGNOFF_HOLD[styleOf(ctx.programId)] : DEFAULT_GAP;
  const gap = Number.isFinite(ctx.gapAfter) ? ctx.gapAfter : hold;
  const end = ctx.duration + gap;
  const dry = ctx.dryLine;
  const bounds = [];
  for (let i = 1; i < ctx.sentences.length; i++) {
    const s = ctx.sentences[i];
    const t = s.t0;
    // never cut on a dry line, nor within DRY_HOLD s after it
    const blocked = !!dry && ((s.start >= dry.char && s.start < dry.end) || (t >= dry.t1 - 0.05 && t < dry.t1 + DRY_HOLD));
    bounds.push({ i, t, char: s.start, blocked });
  }
  return { gap, end, bounds, n: ctx.sentences.length };
}

/** First open boundary at or after time `from`, leaving at least `room` s before the end. */
function boundaryAfter(tl, from, room = 0) {
  for (const b of tl.bounds) if (!b.blocked && b.t >= from - 1e-6 && tl.end - b.t >= room - 1e-6) return b;
  return null;
}

/** Next open boundary after time t (any room). */
function nextBoundary(tl, t) {
  for (const b of tl.bounds) if (!b.blocked && b.t > t + 1e-6) return b;
  return null;
}

/**
 * The single a story opens on: the programme's single, or the over-the-shoulder
 * wall framing when the previous segment was a story by the same presenter (so
 * the story change is a visible cut, never a jump on the same framing).
 */
function storySingle(ctx) {
  const base = singleFraming(ctx);
  const id = styleOf(ctx.programId);
  if (id === 'money-minute' || id === 'news-60') return base;
  const segs = ctx.episode?.segments || [];
  let run = 0;
  for (let j = ctx.index - 1; j >= 0; j--) {
    const p = segs[j];
    if (p.type !== 'story' || p.anchor !== segs[ctx.index]?.anchor || p.roundup) break;
    run++;
  }
  return run % 2 === 1 ? 'ots' : base;
}

/** Studio framing of a single for the speaker, per programme. */
function singleFraming(ctx, slot = ctx.speaker) {
  switch (styleOf(ctx.programId)) {
    case 'tech-bytes':
      return ctx.duo ? 'single' : 'mcu';
    case 'money-minute':
      return 'mcu-r';
    case 'news-60':
      return ctx.hasImage ? 'mcu-l' : 'mcu';
    default:
      if (!ctx.duo) return 'mcu';
      return slot === 'B' ? 'mcu-r' : 'mcu-l';
  }
}

/** Estimated length of segment j from the summary (or its exact context). */
function segLength(ctx, j) {
  const c = neighbour(ctx, j);
  if (c) return c.duration;
  const s = ctx.episode?.segments?.[j];
  return s ? s.chars / CPS : 0;
}

/** Context of segment j when the runtime provides it (ctx.contextAt), else null. */
function neighbour(ctx, j) {
  if (typeof ctx.contextAt !== 'function') return null;
  try {
    const c = ctx.contextAt(j);
    return c && c.valid ? c : null;
  } catch {
    return null;
  }
}

/**
 * Length of the run of chat segments right after this one (they share one
 * wide), including the sign-off when it follows on the wide; 0 if the next
 * segment is not a chat.
 */
function chatRunAfter(ctx, gap) {
  const segs = ctx.episode?.segments || [];
  let t = 0;
  let j = ctx.index + 1;
  if (segs[j]?.type !== 'chat') return 0;
  for (; j < segs.length && segs[j].type === 'chat'; j++) t += segLength(ctx, j) + gap;
  if (segs[j]?.type === 'outro' && ctx.duo) t += segLength(ctx, j) + gap;
  return t;
}

/** Previous segment's type from the summary. */
const prevType = (ctx) => ctx.episode?.segments?.[ctx.index - 1]?.type || null;

/** Words in a string. */
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Intro: headline sentences (before the greeting) as montage beats cut on each
 * line's first word, then the greeting. Returns { headlines: [sentence idx], greet }.
 */
function splitIntro(ctx, maxHeadlines) {
  const n = ctx.sentences.length;
  let greet = n;
  for (let i = 0; i < n; i++) {
    const t = ctx.sentences[i].text.trim().toLowerCase();
    if (/^(good (morning|afternoon|evening)|hello|welcome|this is|i'm|i am|and i'm)\b/.test(t) || /\bwelcome to\b/.test(t)) {
      greet = i;
      break;
    }
  }
  if (greet === n) greet = Math.min(n - 1, maxHeadlines);
  const headlines = [];
  for (let i = 0; i < greet && headlines.length < maxHeadlines; i++) headlines.push(i);
  return { headlines, greet };
}

/** Montage beats for the intro (shot 'montage', card index), then the wide for the greeting. */
function introWithHeadlines(ctx, tl, maxHeadlines, wideFraming = 'wide') {
  const out = [];
  const rundown = ctx.episode?.storyCount ?? 0;
  const frames = Math.min(maxHeadlines, rundown);
  const { headlines, greet } = frames >= 2 ? splitIntro(ctx, frames) : { headlines: [], greet: 0 };
  headlines.forEach((si, k) => {
    const s = ctx.sentences[si];
    out.push(ev(ctx, s.t0, s.start, 'montage', null, ctx.speaker, 'headline', { card: k }));
  });
  // the greeting's wide must hold MIN_SHOT: earlier headline lines join it when it would not
  let first = greet;
  while (out.length && tl.end - (ctx.sentences[first]?.t0 ?? 0) < MIN_SHOT) {
    out.pop();
    first = headlines[out.length] ?? 0;
  }
  if (out.length === 1) out.length = 0; // one card alone is not a montage
  const g = out.length ? ctx.sentences[first] : null;
  out.push(ev(ctx, g ? g.t0 : 0, g ? g.start : 0, 'wide', ctx.duo ? wideFraming : 'wide', ctx.speaker, 'greeting'));
  for (const e of out) if (e.beat === 'headline') e.minLen = HEADLINE_MIN;
  return out;
}

/** A move that fills [start, end] of shot time (relative to its event), or null if under minDur. */
function moveIn(type, amount, start, end, minDur = 4) {
  const dur = end - start;
  if (!(dur >= minDur)) return null;
  return { type, amount: round3(amount), delay: round3(start), dur: round3(dur) };
}

/**
 * Break any studio shot longer than `max` with an alternate studio framing at
 * the boundary nearest its middle (both parts ≥ MIN_SHOT).
 */
function capStudio(ctx, tl, out, max, altOf) {
  for (let k = 0; k < out.length; k++) {
    const e = out[k];
    if (!e.framing) continue;
    const t1 = k + 1 < out.length ? out[k + 1].at : tl.end;
    if (t1 - e.at <= max) continue;
    const mid = (e.at + t1) / 2;
    let best = null;
    for (const b of tl.bounds) {
      if (b.blocked || b.t - e.at < MIN_SHOT || t1 - b.t < MIN_SHOT) continue;
      if (!best || Math.abs(b.t - mid) < Math.abs(best.t - mid)) best = b;
    }
    if (!best) continue;
    const alt = altOf(e);
    if (!alt) continue;
    out.splice(k + 1, 0, ev(ctx, best.t, best.char, alt.shot, alt.framing, alt.focus || e.focus, 'alt'));
    if (e.move) {
      // a move must end 0.5 s before the new cut
      const end = best.t - e.at - 0.5;
      if (e.move.delay + e.move.dur > end) e.move = moveIn(e.move.type, e.move.amount, e.move.delay, end);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// WORLD NOW

function worldNow(ctx, tl) {
  const S = SHOT_STYLES['world-now'];
  const me = ctx.speaker;
  const seg = ctx.seg;
  if (ctx.type === 'intro') {
    const out = introWithHeadlines(ctx, tl, 3);
    const w = out[out.length - 1];
    if (ctx.duo && !ctx.grave) w.move = moveIn('push', Math.min(0.04, 0.008 * (tl.end - w.at - 1)), 0.5, tl.end - w.at - 0.5);
    return out;
  }
  if (ctx.type === 'chat') return [ev(ctx, 0, 0, ctx.duo ? 'wide' : 'close', ctx.duo ? 'wide' : singleFraming(ctx), me, 'chat')];
  if (ctx.type === 'outro') {
    const e = ev(ctx, 0, 0, ctx.duo ? 'wide' : 'wide', 'wide', me, 'signoff');
    // pull-out ≤ 4 %: from 0.5 s after the cut (at once when the wide carries on
    // from the chats), ending 0.5 s before the end card inside the 1.5 s hold
    const hold = Number.isFinite(ctx.gapAfter) ? ctx.gapAfter : S.signoffHold;
    const start = prevType(ctx) === 'chat' && ctx.duo ? 0 : 0.5;
    const end = ctx.duration + hold - 0.5;
    if (!ctx.grave) e.move = moveIn('pull', Math.min(0.04, 0.008 * (end - start)), start, end);
    return [e];
  }
  // stories
  if (ctx.seg.roundup || roundupLike(ctx)) return roundupMap(ctx, tl, 'world-now');
  const out = storyBeats(ctx, tl, {
    single: storySingle(ctx),
    map: !!seg.location,
    picture: ctx.hasImage,
    fact: seg.fact || seg.numbers?.[0]?.value ? factHold(seg) : 0,
    pictureFirst: seg.shot === 'full' && ctx.hasImage,
    pictureMax: S.pictureMax,
    mapMax: S.mapMax,
    mapOnSecond: true,
  });
  capStudio(ctx, tl, out, S.studioMax, () => (ctx.duo ? { shot: 'wide', framing: 'wide', focus: me } : { shot: 'wide', framing: 'wide', focus: me }));
  chatLeadIn(ctx, tl, out);
  // the 3-4 % push on the lead's opening single (never on grave stories)
  if (ctx.isLead && !ctx.grave && out[0].framing) {
    const t1 = out.length > 1 ? out[1].at : tl.end;
    const end = t1 - out[0].at - 0.5;
    const m = moveIn('push', Math.min(0.04, Math.max(0.03, 0.0075 * (end - 0.5))), 0.5, Math.min(end, 0.5 + 8));
    if (m) out[0].move = m;
  }
  return out;
}

/** The fact card's hold: (words in fact ÷ 3) + 2 s (world-now.md). */
const factHold = (seg) => words(seg.fact || seg.numbers?.[0]?.value || '') / 3 + 2;

/** A short located story inside a run of located stories (round-up without the field). */
function roundupLike(ctx) {
  const segs = ctx.episode?.segments || [];
  const me = segs[ctx.index];
  if (!me || me.type !== 'story' || !me.location || ctx.sentences.length > 2) return false;
  const short = (s) => s && s.type === 'story' && s.location && !s.feature && s.chars <= 150;
  if (!short(me) && !/around the world/i.test(ctx.seg.text)) return false;
  return short(segs[ctx.index - 1]) || short(segs[ctx.index + 1]) || /^\W*(now,?\s*)?around the world/i.test(ctx.seg.text);
}

/**
 * Generic story beats: single for sentence 1 (never cut away during it), then
 * the cutaways in order (each on whole sentences, ≥ MIN_SHOT), then back to the
 * single for the remaining sentences if they hold ≥ MIN_SHOT.
 */
function storyBeats(ctx, tl, o) {
  const me = ctx.speaker;
  const out = [ev(ctx, 0, 0, 'close', o.single, me, 'single')];
  const order = [];
  if (o.map) order.push('map');
  if (o.picture) order.push('picture');
  if (o.pictureFirst && o.map) order.reverse();
  // the Number of the day leads with its card; otherwise the card comes last
  if (o.fact) (ctx.feature === 'number' ? order.unshift('fact') : order.push('fact'));
  let cur = 0;
  let curMin = MIN_SHOT;
  for (const beat of order) {
    const need = beat === 'fact' ? Math.max(MIN_SHOT, o.fact) : beat === 'picture' ? Math.max(MIN_SHOT, o.pictureMin || 0) : Math.max(MIN_SHOT, o.mapMin || 0);
    // world-now: the map cuts in on the first word of sentence 2 when the single has had its time
    const b = boundaryAfter(tl, cur + curMin, need);
    if (!b) break;
    out.push(ev(ctx, b.t, b.char, beat === 'picture' ? 'full' : beat, null, me, beat));
    cur = b.t;
    curMin = need;
  }
  // back to the single for what remains (whole sentences, ≥ MIN_SHOT)
  if (out.length > 1) {
    const b = boundaryAfter(tl, cur + curMin, MIN_SHOT);
    if (b) out.push(ev(ctx, b.t, b.char, 'close', o.single, me, 'single'));
  }
  return out;
}

/**
 * When the chats after this story are too short to hold their own wide
 * (< MIN_SHOT together), the story's last sentence goes to the wide so the
 * exchange plays on one wide (cosmos.md: the last AND FINALLY line with the reply).
 */
function chatLeadIn(ctx, tl, out, always = false) {
  if (!ctx.duo) return;
  const run = chatRunAfter(ctx, tl.gap);
  if (!run || (run >= MIN_SHOT && !always)) return;
  // cosmos.md cuts to the wide ON the last AND FINALLY line (always): the dry-line guard does not apply there
  const last = tl.bounds.filter((b) => always || !b.blocked).pop();
  if (!last) return;
  const prev = out.filter((e) => e.at <= last.t + 1e-6).pop();
  if (!prev || last.t - prev.at < MIN_SHOT) return;
  if (tl.end - last.t + run < MIN_SHOT) return;
  // optional lead-ins never make the wide longer than the studio maximum
  if (run >= MIN_SHOT && tl.end - last.t + run > (SHOT_STYLES[styleOf(ctx.programId)].studioMax || 15)) return;
  // drop planned cuts after it and put the wide on the last sentence
  for (let k = out.length - 1; k >= 0; k--) if (out[k].at > last.t - 1e-6) out.splice(k, 1);
  out.push(ev(ctx, last.t, last.char, 'wide', 'wide', ctx.speaker, 'wide'));
}

/** Round-up items on the map: title over the world view, map to map on each item's first word. */
function roundupMap(ctx, tl, programme) {
  const me = ctx.speaker;
  const r = ctx.seg.roundup;
  const index = r ? r.index : roundupIndex(ctx);
  const out = [];
  if (index === 0) {
    out.push(ev(ctx, 0, 0, 'map', null, me, 'roundup', { card: 'world' }));
    // the title line plays over the world view; item 1's place zooms in on its first word
    if (ctx.sentences.length > 1 && /around the world|world in/i.test(ctx.sentences[0].text)) {
      const s = ctx.sentences[1];
      out.push(ev(ctx, s.t0, s.start, 'map', null, me, 'pin', { zoom: true }));
    }
  } else out.push(ev(ctx, 0, 0, 'map', null, me, 'pin', { pan: programme === 'news-60' ? 0.7 : 0 }));
  if (Array.isArray(ctx.seg.map) && ctx.seg.map.length > 1) out[out.length - 1].pins = true;
  return out;
}

function roundupIndex(ctx) {
  const segs = ctx.episode?.segments || [];
  let k = 0;
  for (let j = ctx.index - 1; j >= 0 && segs[j]?.type === 'story' && segs[j]?.location && segs[j]?.chars <= 150; j--) k++;
  return k;
}

// ---------------------------------------------------------------------------
// TECH BYTES

function techBytes(ctx, tl) {
  const S = SHOT_STYLES['tech-bytes'];
  const me = ctx.speaker;
  const seg = ctx.seg;
  if (ctx.type === 'intro') return introWithHeadlines(ctx, tl, 3);
  if (ctx.type === 'outro') return [ev(ctx, 0, 0, 'wide', 'wide', me, 'signoff')];
  if (ctx.type === 'chat') {
    if (isCatch(ctx)) {
      const len = tl.end;
      if (len >= MIN_SHOT - TOL) {
        const e = ev(ctx, 0, 0, 'close', 'close', me, 'catch');
        // the episode's only push: 0.3 s after the cut, 0.5 % of scale per second,
        // eased, stopping 0.5 s before the shot ends, ≤ 3 %, none under 2 s
        const dur = len - 0.3 - 0.5;
        if (len >= 2 && dur > 0) e.move = { type: 'push', amount: round3(Math.min(0.03, 0.005 * dur)), delay: 0.3, dur: round3(dur) };
        return [e];
      }
    }
    return [ev(ctx, 0, 0, ctx.duo ? 'wide' : 'close', ctx.duo ? 'wide' : 'mcu', me, 'chat')];
  }
  // stories: the number of the day opens on its card, then the close
  if (ctx.feature === 'number' && !ctx.isLead) {
    const out = [ev(ctx, 0, 0, 'fact', null, me, 'number')];
    const b = boundaryAfter(tl, MIN_SHOT, MIN_SHOT);
    if (b) out.push(ev(ctx, b.t, b.char, 'close', singleFraming(ctx), me, 'single'));
    if (ctx.hasImage && b) {
      const p = boundaryAfter(tl, b.t + MIN_SHOT, S.pictureMin);
      if (p) {
        out.push(ev(ctx, p.t, p.char, 'full', null, me, 'picture'));
        const back = boundaryAfter(tl, p.t + S.pictureMin, MIN_SHOT);
        if (back) out.push(ev(ctx, back.t, back.char, 'close', singleFraming(ctx), me, 'single'));
      }
    }
    capStudio(ctx, tl, out, S.studioMax, (e) => ({ shot: 'wide', framing: 'wide', focus: e.focus }));
    chatLeadIn(ctx, tl, out);
    return out;
  }
  const out = storyBeats(ctx, tl, {
    single: storySingle(ctx),
    map: !!seg.location && !ctx.hasImage,
    picture: ctx.hasImage,
    fact: 0,
    pictureMin: S.pictureMin,
    pictureMax: S.pictureMax,
  });
  capStudio(ctx, tl, out, S.studioMax, (e) => ({ shot: 'wide', framing: ctx.duo ? 'wide' : 'wide', focus: e.focus }));
  chatLeadIn(ctx, tl, out);
  return out;
}

/** THE CATCH: the first chat after the lead where Ada (the analyst, seat B) asks. */
export function isCatch(ctx) {
  if (ctx.type !== 'chat') return false;
  if (ctx.seg.catch === true || ctx.seg.feature === 'catch') return true;
  if (!ctx.question) return false;
  const ids = Object.values(ctx.cast || {});
  const ada = ids.includes('ada') ? ctx.speakerId === 'ada' : ctx.speaker === 'B';
  if (!ada) return false;
  const segs = ctx.episode?.segments || [];
  const lead = segs.findIndex((s) => s.type === 'story');
  if (lead < 0 || ctx.index < lead) return false;
  for (let j = lead + 1; j < segs.length; j++) {
    if (segs[j].type === 'chat' && segs[j].anchor === ctx.speaker) return j === ctx.index;
  }
  return false;
}

// ---------------------------------------------------------------------------
// COSMOS DESK

function cosmos(ctx, tl) {
  const S = SHOT_STYLES.cosmos;
  const me = ctx.speaker;
  const seg = ctx.seg;
  if (ctx.type === 'intro') {
    // the cold line over the lead's picture (montage card 0), then the greeting on the wide
    const out = [];
    const { greet } = splitIntro(ctx, 1);
    if (greet >= 1 && ctx.sentences.length > 1 && (ctx.episode?.storyCount ?? 0) >= 1) {
      out.push(ev(ctx, 0, 0, 'montage', null, me, 'cold', { card: 0 }));
      const g = ctx.sentences[1];
      const b = tl.bounds.find((x) => x.i === 1);
      // every COSMOS shot holds 4 s: a cold line shorter than that plays on the wide
      if (b && b.t >= MIN_SHOT && tl.end - b.t >= MIN_SHOT) out.push(ev(ctx, g.t0, g.start, 'wide', 'wide', me, 'greeting'));
      else out.length = 0;
    }
    if (!out.length) {
      // a wide over 15 s: the teasers on Nova's single, the greeting (naming both) on the wide
      const g = splitIntro(ctx, 3).greet;
      const b = tl.bounds.find((x) => x.i === g && !x.blocked);
      if (tl.end > S.studioMax && b && b.t >= MIN_SHOT && tl.end - b.t >= MIN_SHOT) {
        out.push(ev(ctx, 0, 0, 'close', singleFraming(ctx), me, 'teaser'));
        out.push(ev(ctx, b.t, b.char, 'wide', 'wide', me, 'greeting'));
      } else out.push(ev(ctx, 0, 0, 'wide', 'wide', me, 'greeting'));
    }
    return out;
  }
  if (ctx.type === 'chat') return [ev(ctx, 0, 0, ctx.duo ? 'wide' : 'close', ctx.duo ? 'wide' : 'mcu', me, 'chat')];
  if (ctx.type === 'outro') return [ev(ctx, 0, 0, 'wide', 'wide', me, 'signoff')];
  const single = storySingle(ctx);
  let out;
  if (ctx.feature === 'number' && !ctx.isLead) {
    // the Reading on UNIT-8's first word; the single on sentence 2, no earlier than 4 s after the cut
    out = [ev(ctx, 0, 0, 'fact', null, me, 'number')];
    const b = boundaryAfter(tl, MIN_SHOT, MIN_SHOT);
    if (b) {
      out.push(ev(ctx, b.t, b.char, 'close', single, me, 'single'));
      if (ctx.hasImage) addPicture(ctx, tl, out, b.t, single, S);
    }
  } else {
    out = [ev(ctx, 0, 0, 'close', single, me, 'single')];
    // never cut away during sentence 1; ≥ 4 s
    const s1end = ctx.sentences[1]?.t0 ?? tl.end;
    let cur = 0;
    if (seg.location) {
      const m = mapOnPlace(ctx, tl, Math.max(MIN_SHOT, s1end));
      if (m) {
        out.push(ev(ctx, m.at, m.char, 'map', null, me, 'map', { place: m.how }));
        cur = m.at;
        // the map holds 4-6 s and gives way at a sentence start
        const next = boundaryAfter(tl, cur + S.mapMin, MIN_SHOT);
        if (next && ctx.hasImage) {
          if (!addPicture(ctx, tl, out, cur, single, S, S.mapMin)) out.push(ev(ctx, next.t, next.char, 'close', single, me, 'single'));
        } else if (next) out.push(ev(ctx, next.t, next.char, 'close', single, me, 'single'));
      } else if (ctx.hasImage) addPicture(ctx, tl, out, 0, single, S);
    } else if (ctx.hasImage) addPicture(ctx, tl, out, 0, single, S);
  }
  capStudio(ctx, tl, out, S.studioMax, (e) => ({ shot: 'wide', framing: 'wide', focus: e.focus }));
  // cosmos.md: the wide carries the last AND FINALLY line and the idiom reply
  chatLeadIn(ctx, tl, out, ctx.feature === 'lighter');
  return out;
}

/** The picture (6-10 s) from the first sentence start ≥ MIN_SHOT after `from`, then back to the single. */
function addPicture(ctx, tl, out, from, single, S, minBefore = MIN_SHOT) {
  const p = boundaryAfter(tl, from + minBefore, S.pictureMin);
  if (!p) return false;
  out.push(ev(ctx, p.t, p.char, 'full', null, ctx.speaker, 'picture'));
  // back to the single for the last sentence(s) when ≥ MIN_SHOT remain; prefer a cut inside 6-10 s
  let back = null;
  for (const b of tl.bounds) {
    if (b.blocked || b.t - p.t < S.pictureMin - 1e-6 || tl.end - b.t < MIN_SHOT) continue;
    back = b;
    if (b.t - p.t <= S.pictureMax) break;
  }
  if (back && back.t - p.t <= S.pictureMax + 2) out.push(ev(ctx, back.t, back.char, 'close', single, ctx.speaker, 'single'));
  return true;
}

/**
 * The locator map cut within ±0.3 s of the spoken place name (any part of
 * location.place or a map[] place), at or after `from`; if the name is only in
 * sentence 1, the map takes the start of the next sentence.
 */
function mapOnPlace(ctx, tl, from) {
  const text = ctx.seg.text;
  const names = placeNames(ctx.seg);
  const hits = [];
  for (const name of names) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    for (const m of text.matchAll(re)) hits.push(m.index);
  }
  hits.sort((a, b) => a - b);
  for (const c of hits) {
    const t = ctx.timeAt(c) - 0.1; // a touch before the name: the map lands as it is said
    if (t < from - 1e-6 || tl.end - t < MIN_SHOT) continue;
    if (insideDry(ctx, t)) continue;
    return { at: t, char: c, how: 'name' };
  }
  const b = boundaryAfter(tl, from, MIN_SHOT);
  return b ? { at: b.t, char: b.char, how: 'sentence' } : null;
}

function placeNames(seg) {
  const out = new Set();
  const add = (p) => {
    for (const part of String(p || '').split(/[,/]/)) {
      const n = part.trim();
      if (n.length >= 3) out.add(n);
    }
  };
  add(seg.location?.place);
  for (const m of Array.isArray(seg.map) ? seg.map : []) add(m?.place);
  return [...out];
}

const insideDry = (ctx, t) => !!ctx.dryLine && t >= ctx.dryLine.t0 - 0.05 && t < ctx.dryLine.t1 + DRY_HOLD;

// ---------------------------------------------------------------------------
// MONEY MINUTE (solo): the camera never moves; cuts inside inter-sentence pauses

function moneyMinute(ctx, tl) {
  const me = ctx.speaker;
  const seg = ctx.seg;
  if (ctx.type !== 'story') return [ev(ctx, 0, 0, 'wide', 'wide', me, ctx.type === 'outro' ? 'signoff' : ctx.type === 'intro' ? 'greeting' : 'wide')];
  const plan = moneyStoryPlan(ctx, tl);
  return plan.map((p) => {
    if (p.boundary) return ev(ctx, pauseCut(ctx, p.boundary.i), p.boundary.char, p.shot, p.framing, me, p.beat);
    return ev(ctx, p.at ?? 0, 0, p.shot, p.framing, me, p.beat, p.extra || null);
  });
}

const MCU_R = { shot: 'close', framing: 'mcu-r', beat: 'mcu-r' };
const WIDE_M = { shot: 'wide', framing: 'wide', beat: 'wide' };

/**
 * The per-story plan (money-minute.md §3.5). Story 1 opens on MCU-R; the number
 * of the day opens on its CARD in the gap before the first word; every other
 * story opens on the WIDE. That is the bible's "the studio shot the previous
 * story did not end on" without looking back, because no story is allowed to
 * end on the WIDE (a WIDE cutaway that cannot hand back to MCU-R is not taken).
 * One cutaway (CARD preview/recap, PIC, MAP if the episode's map is unused, else
 * the other studio shot) at the first sentence start after the opening has run
 * MIN_SHOT; whole sentences (two when the first is short); back to MCU-R for
 * the money line. Shots ≤ 12 s where sentence boundaries allow.
 */
function moneyStoryPlan(ctx, tl) {
  const S = SHOT_STYLES['money-minute'];
  const plan = [];
  const hasCard = !!(ctx.seg.fact || ctx.seg.numbers?.length);
  if (ctx.feature === 'number' && !ctx.isLead) {
    plan.push({ shot: 'fact', framing: null, beat: 'number', at: 0, extra: { beforeSpeech: S.numberGap } });
    // back to MCU-R at a sentence start once the card has run MIN_SHOT; else the card holds (≤ 12 s)
    const b = boundaryAfter(tl, MIN_SHOT, MIN_SHOT);
    if (b && b.t <= S.shotMax) plan.push({ ...MCU_R, boundary: b });
    return plan;
  }
  const open = ctx.isLead ? MCU_R : WIDE_M;
  plan.push({ ...open, at: 0 });
  let c = boundaryAfter(tl, MIN_SHOT, MIN_SHOT);
  if (!c) return plan;
  const cut = cutaway(ctx, tl, c, hasCard, open);
  if (!cut) return plan;
  if (cut.after) {
    c = boundaryAfter(tl, cut.after, MIN_SHOT);
    if (!c) return plan;
  }
  const back = boundaryAfter(tl, c.t + MIN_SHOT, MIN_SHOT);
  const returns = !!back && back.t - c.t <= S.shotMax;
  if (cut.framing === 'wide' && !returns) {
    // rule 5 for the lead: alternate only when the WIDE can hand back to MCU-R
    return plan;
  }
  delete cut.after;
  plan.push({ ...cut, boundary: c });
  if (returns && cut.framing !== 'mcu-r') plan.push({ ...MCU_R, boundary: back });
  return plan;
}

function otherStudio(shot) {
  return shot && shot.framing === 'mcu-r' ? WIDE_M : MCU_R;
}

function cutaway(ctx, tl, c, hasCard, open) {
  if (hasCard) {
    // preview (figure spoken later, legible ≥ 0.3 s before it) or recap (figure already spoken)
    return { shot: 'fact', framing: null, beat: cardKind(ctx, c) };
  }
  if (ctx.hasImage) return { shot: 'full', framing: null, beat: 'picture' };
  if (ctx.seg.location && moneyMapStory(ctx) === ctx.index) return { shot: 'map', framing: null, beat: 'map' };
  // otherwise the other studio shot (rule 5: once the opening has run 7 s)
  return { ...otherStudio(open), beat: 'alt', after: 7 };
}

function cardKind(ctx, c) {
  const figure = ctx.figures?.[0];
  if (!figure) return 'card';
  return figure.t - (c.t + 0.25) >= 0.3 ? 'card-preview' : 'card-recap';
}

/** The story that gets the episode's one MAP: the first located story whose plan reaches the map step. */
function moneyMapStory(ctx) {
  const segs = ctx.episode?.segments || [];
  for (let j = 0; j < segs.length; j++) {
    const s = segs[j];
    if (s.type !== 'story' || !s.location || s.hasImage || (s.feature === 'number' && s.storyIndex > 0)) continue;
    const c = j === ctx.index ? ctx : neighbour(ctx, j);
    if (c && (c.seg.fact || c.seg.numbers?.length)) continue; // the CARD comes first there
    return j;
  }
  return -1;
}

/**
 * A cut inside the pause before sentence i: between the previous sentence's last
 * word end (its start + its length at the sentence's own speed) and sentence i's
 * first word; 0.12 s before the word when the pause allows.
 */
export function pauseCut(ctx, i) {
  const s = ctx.sentences[i];
  const next = s.t0;
  const prev = ctx.sentences[i - 1];
  const ws = ctx.words.filter((w) => w.char >= prev.start && w.char < prev.end);
  if (ws.length < 2) return round3(Math.max(0, next - 0.12));
  const first = ws[0], last = ws[ws.length - 1];
  const spc = (last.t - first.t) / Math.max(1, last.char - first.char);
  const lastEnd = last.t + Math.max(1, last.end - last.char) * spc;
  const at = Math.max(lastEnd + 0.04, next - 0.12);
  return round3(Math.min(at, next - 0.02));
}

// ---------------------------------------------------------------------------
// NEWS IN 60 (solo)

function news60(ctx, tl) {
  const me = ctx.speaker;
  if (ctx.type !== 'story') {
    const e = ev(ctx, 0, 0, 'wide', 'wide', me, ctx.type === 'outro' ? 'signoff' : ctx.type === 'intro' ? 'greeting' : 'wide');
    // the templated intro is ~3 s: ask the director to hold the WIDE to MIN_SHOT
    if (tl.end < MIN_SHOT) e.minLen = MIN_SHOT;
    return [e];
  }
  if (ctx.seg.roundup || roundupLike(ctx)) return roundupMap(ctx, tl, 'news-60');
  const item = news60Item(ctx, tl, 0);
  const out = item.map(({ b, kind }) => ev(ctx, b.t, b.char, kind === 'full' ? 'full' : kind === 'fact' ? 'fact' : 'close', kind === 'full' || kind === 'fact' ? null : kind, me, kind === 'full' ? 'picture' : kind));
  const hold = Number(ctx.episode?.plan?.pictureHold) > 0 && isLastItem(ctx) && item[item.length - 1].kind === 'full';
  if (hold) out[out.length - 1].hold = Number(ctx.episode.plan.pictureHold);
  return out;
}

/**
 * The shots of one NEWS IN 60 item: [{ b: { t, char }, kind: 'mcu-l' | 'mcu' | 'full' | 'fact' }].
 * One shot per sentence, cut on its first word (a sentence under MIN_SHOT shares
 * the next one's shot). With an image MCU-L and FULL alternate: the lead starts
 * on MCU-L, other items in a seeded order, the item after the round-up on MCU-L,
 * and with the picture hold the last item ends on FULL. Sam is in vision in
 * every item, and every item change is a visible cut: an item never opens on the
 * framing the previous item ended on.
 */
function news60Item(ctx, tl, depth) {
  const starts = [{ t: 0, char: 0 }];
  let cur = 0;
  for (const b of tl.bounds) {
    if (b.blocked || b.t - cur < MIN_SHOT - 1e-6 || tl.end - b.t < MIN_SHOT - 1e-6) continue;
    starts.push(b);
    cur = b.t;
  }
  const prevEnd = news60PrevEnd(ctx, depth);
  if (!ctx.hasImage) {
    // MCU for the whole item (the looser MCU-L when the previous item ended on the MCU); the lead may take its
    // FACT; an item over the 12 s studio maximum changes framing at the sentence nearest its middle
    const kind = prevEnd === 'mcu' ? 'mcu-l' : 'mcu';
    const out = [{ b: starts[0], kind }];
    if (ctx.isLead && (ctx.seg.fact || ctx.seg.numbers?.length) && starts.length > 1) out.push({ b: starts[1], kind: 'fact' });
    else if (tl.end > SHOT_STYLES['news-60'].studioMax && starts.length > 1) {
      const mid = tl.end / 2;
      const b = starts.slice(1).reduce((m, x) => (Math.abs(x.t - mid) < Math.abs(m.t - mid) ? x : m));
      out.push({ b, kind: kind === 'mcu' ? 'mcu-l' : 'mcu' });
    }
    return out;
  }
  if (starts.length === 1) return [{ b: starts[0], kind: prevEnd === 'mcu-l' ? 'mcu' : 'mcu-l' }];
  const r = rng((ctx.episodeSeed ^ Math.imul(ctx.index + 1, 0x9e3779b1)) >>> 0);
  let mcuFirst = ctx.isLead || afterRoundup(ctx) || r() < 0.5;
  if (Number(ctx.episode?.plan?.pictureHold) > 0 && isLastItem(ctx)) mcuFirst = starts.length % 2 === 0; // end on FULL
  if (mcuFirst && prevEnd === 'mcu-l') mcuFirst = false;
  else if (!mcuFirst && prevEnd === 'full' && !ctx.isLead) mcuFirst = true;
  return starts.map((b, k) => ({ b, kind: (k % 2 === 0) === mcuFirst ? 'mcu-l' : 'full' }));
}

/** What the previous NEWS IN 60 item ended on ('wide' after the intro, 'map' after the round-up). */
function news60PrevEnd(ctx, depth) {
  const segs = ctx.episode?.segments || [];
  const j = ctx.index - 1;
  const p = segs[j];
  if (!p) return null;
  if (p.type !== 'story') return 'wide';
  if (p.roundup || (p.location && p.chars <= 150 && segs[j - 1]?.type === 'story' && segs[j - 1]?.location)) return 'map';
  const c = depth < 8 ? neighbour(ctx, j) : null;
  if (c) {
    const item = news60Item(c, timeline(c), depth + 1);
    return item[item.length - 1].kind;
  }
  // no neighbour context: predict from the summary (two shots for a two-sentence item)
  if (!p.hasImage) return 'mcu';
  return p.chars >= 150 ? 'full' : 'mcu-l';
}

function isLastItem(ctx) {
  const segs = ctx.episode?.segments || [];
  for (let j = ctx.index + 1; j < segs.length; j++) if (segs[j].type === 'story') return false;
  return true;
}

function afterRoundup(ctx) {
  const prev = ctx.episode?.segments?.[ctx.index - 1];
  return !!prev && (!!prev.roundup || (prev.type === 'story' && prev.location && prev.chars <= 150));
}

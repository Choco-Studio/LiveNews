// Live direction for the v2 path (owner: INTEGRATION stream): the director's
// side of wave 2. director.js loads it only when v2 is on and calls it from a
// few surgical hooks; it plans every segment of a live episode (the server
// produced it a few minutes ago, nothing is pre-planned) and drives the v2
// shot cues with the director's own rules.
//
//   setCast(episode)         → episode(ep): scene.episode; every segment is planned
//                              in idle time (the first planSegment of a session costs
//                              ~100-200 ms cold, later ones a few ms), never on the
//                              frame path; segment i+1 is ready while i plays
//   playStory(seg)           → shots(seg, hasImg, handler): the plan's shot cues, or
//                              null (the old storyBeats then); the opening cue is the
//                              caller's, later cues come back through `handler`
//   playIntro(seg)           → intro(seg): the intro follows its plan: headline frames
//                              cut on the spoken teaser (each at its sentence's first
//                              word, showing the story that sentence teases, held to the
//                              next), the greeting on its planned studio shot; no cut back
//                              to the studio at the end (the next segment cuts, or a
//                              breaking story's stinger covers the montage)
//   say(seg)                 → begin(seg): scene.segPlan = { id, ctx, events, voice,
//                              speechStart, speechEnd }; the handle gives speak()
//                              marks for cuts inside a sentence, sentence(i) at each
//                              onSentence (speechStart at 0, sentence-start cuts) and
//                              end() when speak() resolves (speechEnd)
// Chats, outros and an intro without a montage use the default handler: studio
// cuts only (never away from a montage or a card), MIN_SHOT holds. Every cut
// waits for a stinger on screen to finish. scene.shot keeps the legacy names
// (wide/close/full/map/fact) the graphics, music hooks and old renderer know;
// the framing travels in scene.framing (CONTRACTS "framings never reach graphics").
// MAX HOLD (pace maxima on air, holdCut()): at a sentence start with no planned
// cut, a story or intro shot that would otherwise run past its pace maximum
// (map, picture, fact card, studio single, an intro's long wide) gives way to the
// speaker's studio shot; when no sentence start can split it, a phrase boundary
// inside a sentence can (comma, colon, semicolon, dash, ' and ' / ' but ':
// guardMarks(), fired by speak() marks), never within 1.5 s before a dry line.
// An intro that the guard took off its wide comes back to the wide for the
// greeting (the bibles' greeting wide) when both parts hold the cooldown.
// WALL WARM-UP (SET request; critic r2: the first frame of a cut to a wall with new
// content cost 87-225 ms, up to 1 s on a loaded box): the studio cues of the segment
// on air and of the next one are known ahead, so each one's wall content (picture
// filtered at its size in that framing, plate text masks) is prepared with SET's
// warmWallContent() in idle time, one cue per idle callback; the cut then costs
// 3-5 ms. Every idle task of this module waits while a break element (ad, ident,
// promo) is on air, so it never competes with an ad's first frames.
// Every public method is guarded: a throw is logged once and returns the neutral
// value (null), so the director's own beats carry on (never freeze).
import { planSegment } from '../direction/index.js';
import * as SETM from '../studio/set.js';
import * as CAM from '../camera.js';
import { defaultFraming } from './stage.js';
// the Stage's module graph loads with this one: once the director's v2 side is ready, so is the
// Renderer's (studio.js imports host.js itself; this only removes the start-up race)
import './host.js';
import { paceFor, gapAfter as paceGap, CHANNEL, shotMax } from '../../../pace.js';

const now = () => performance.now() / 1000;
// PACE (public/js/pace.js, owner 23:10): the cut cooldown, the stinger and the pause after each
// segment come from the programme's pace profile, the same table the director reads
const minShot = (scene) => paceFor(scene.program?.id).shots.cooldown;
const STINGER = CHANNEL.stinger; // s (cards.js STINGER_DURATION)
const GAP_AFTER = 0.3; // s: the plan's pause when no episode profile is known
export const LEGACY_SHOTS = new Set(['wide', 'close', 'full', 'map', 'fact', 'montage']);
const STUDIO = new Set(['wide', 'close']);
const WIDE_FRAMINGS = new Set(['wide', 'two', 'solo-wide']);

/** The legacy shot name for a planned shot (framing names never reach graphics). */
export function legacyShot(shot, framing) {
  if (LEGACY_SHOTS.has(shot)) return shot;
  return WIDE_FRAMINGS.has(framing || shot) ? 'wide' : 'close';
}

/**
 * Shot cues of a plan, in order: [{ k, char, at, sentence, mid, shot, framing, focus, move, card }].
 * k 0 is the opening shot; `mid` cues fall inside a sentence (fired by speech marks).
 * Beats the story cannot show (no picture / location / figure), non-studio beats
 * outside stories (montage frames only in an intro) and repeats of the shot on air
 * are dropped. A montage cue's `card` is the rundown index of the story its sentence
 * teases (seg.teases, editorial), else the planner's card index. Null when nothing is left.
 */
export function cuesFromPlan(plan, { hasImg = true, rundown = null } = {}) {
  const ctx = plan?.ctx;
  if (!ctx || !Array.isArray(plan.events)) return null;
  const seg = ctx.seg || {};
  const story = seg.type === 'story';
  const intro = seg.type === 'intro';
  const out = [];
  for (const e of plan.events) {
    if (e.kind !== 'shot') continue;
    const shot = legacyShot(e.shot, e.framing);
    if (shot === 'montage' ? !intro : !story && !STUDIO.has(shot)) continue;
    if (shot === 'full' && !hasImg) continue;
    if (shot === 'map' && !(seg.location && Number.isFinite(seg.location.lat))) continue;
    if (shot === 'fact' && !seg.fact) continue; // the director's fact card needs seg.fact
    const focus = e.focus && e.focus in ctx.cast ? e.focus : ctx.speaker;
    let framing = shot === 'montage' ? null : (e.framing ?? null);
    // over-the-shoulder exists to show the wall: without a picture, a map or a figure it would frame
    // an empty wall with a small plate; a later one is dropped (no near jump-cut), an opening one plays as a single
    if (framing === 'ots' && !wallContent(seg, hasImg, ctx.programId)) {
      if (out.length) continue;
      framing = null;
    }
    const char = Number.isFinite(e.char) ? Math.max(0, e.char) : 0;
    const ss = ctx.sentences || [];
    let si = 0;
    while (si + 1 < ss.length && ss[si + 1].start <= char + 2) si++;
    const card = shot === 'montage' ? montageCard(e, seg, si, rundown, out) : null;
    const prev = out[out.length - 1];
    if (prev && prev.shot === shot && prev.framing === framing && prev.focus === focus && prev.card === card && !e.move) continue;
    const mid = out.length > 0 && Math.abs(char - (ss[si]?.start ?? 0)) > 2;
    out.push({ k: out.length, char, at: e.at, sentence: si, mid, shot, framing, focus, move: e.move ?? null, card, minLen: Number.isFinite(e.minLen) ? e.minLen : null, beat: e.beat ?? null });
  }
  return out.length ? out : null;
}

const WALL_IMG = { width: 1, height: 1 }; // stands for a loaded picture when asking SET what the wall shows
const SHOWS = new Set(['picture', 'map', 'figure']);

/**
 * Will the studio wall show the story itself (a picture, a map, a figure) rather than its kicker plate?
 * SET decides per programme (studio/wall.js: TECH BYTES, COSMOS, MONEY MINUTE and NEWS IN 60 walls show
 * only a picture; WORLD NOW also a locator map or a figure), so ask its wallFromScene(); without it, any
 * picture, place or figure counts.
 */
function wallContent(seg, hasImg, programId) {
  const wallFromScene = SETM.wallFromScene;
  try {
    if (typeof wallFromScene === 'function') {
      const sid = seg.storyId ?? null;
      const scene = { program: { id: programId }, storyId: sid, images: { get: () => (hasImg ? WALL_IMG : null) }, wall: hasImg ? { mode: 'image', storyId: sid } : { mode: 'source', source: seg.source || '', category: seg.category || 'general' }, segPlan: { ctx: { seg } }, framing: 'ots', focus: seg.anchor || 'A', cast: null, lowerThird: null };
      const w = wallFromScene(scene, programId);
      if (w && typeof w.mode === 'string') return SHOWS.has(w.mode);
    }
  } catch {
    /* fall back to the story's own data */
  }
  return !!hasImg || !!(seg.location && Number.isFinite(seg.location.lat)) || !!seg.fact || (Array.isArray(seg.numbers) && seg.numbers.length > 0);
}

// ---------------------------------------------------------------------------
// max hold: the pace maxima on air

const HOLD_SHOTS = new Set(['wide', 'close', 'map', 'full', 'fact']);
// s under the maximum the guard aims for: a shot on air runs longer than its plan (the director's
// pause, voice start-up, timers on a busy machine), measured 1-3 s on the offline channel
const HOLD_MARGIN = 1.0;
const DRY_HOLD = 1.2; // s: never cut on a dry line or this soon after it (tech-bytes.md)
const DRY_LEAD = 1.5; // s: a phrase-boundary cut lands at least this long before a dry line (it reads on a settled shot)
const MARK_MARGIN = 1.0; // s more than the cooldown a phrase-boundary cut must leave its replacement (planned time)
// the greeting that ends an intro's headlines (director.js / direction/shots.js GREETING_RE)
const GREETING = /^(good (morning|afternoon|evening)|hello|welcome|this is|i'm|i am|and i'm)\b|\bwelcome to\b/i;

/** The longest a shot may hold on air (s, pace.js shotMax): maps their window, pictures the picture window, fact cards factMax, studio shots studioMax. */
export function maxHold(shot, programId) {
  return shotMax(programId, shot);
}

/**
 * Max-hold guard. At the start of sentence `si` of a story or intro (no planned cut there), or at a
 * phrase boundary inside it (`point` = { char, t0 }, from guardMarks()), the shot on air (`onAir` =
 * { shot, framing, focus, held: s since its cut }) would run past its pace maximum (less a 1 s
 * margin) before the next planned cut (or the end of the segment, at the voice's real pace `rate`):
 * if it has held the cooldown and the shot that replaces it can hold the cooldown too, return a cue
 * back to the speaker's studio shot: a map, picture or card → the speaker's single (`closeFraming`);
 * a single → the wide (`wideFraming`; not NEWS IN 60, whose bible keeps the wide for the intro and
 * sign-off); a wide → the single (an intro's wide too, but only once it would pass the studio maximum:
 * critic r2, a 22 s MONEY MINUTE intro on one solo wide). Never on or just after a dry line (a phrase
 * cut also not within DRY_LEAD s before it), and never from a studio shot into one that would run
 * straight into an identical opening shot of the next segment (`nextOpen`: { shot, framing, focus }):
 * that only makes one longer hold. At an intro's greeting sentence, a single on air goes back to the
 * wide when both parts hold the cooldown (the bibles' greeting wide). Null otherwise. Pure.
 */
export function holdCut(plan, si, onAir, { programId = null, gap = 0.6, cues = null, closeFraming = null, wideFraming = null, nextOpen = null, rate = 1, point = null } = {}) {
  const ctx = plan?.ctx;
  if (!ctx || !onAir || !HOLD_SHOTS.has(onAir.shot) || !(point ? si >= 0 : si > 0)) return null;
  if (ctx.type !== 'story' && ctx.type !== 'intro') return null;
  const S = paceFor(programId).shots;
  if (!(onAir.held >= S.cooldown)) return null;
  const sent = ctx.sentences?.[si];
  if (!sent || !Number.isFinite(sent.t0)) return null;
  const t0 = point ? point.t0 : sent.t0;
  const char = point ? point.char : sent.start;
  if (!Number.isFinite(t0)) return null;
  const dry = ctx.dryLine;
  if (dry && t0 >= dry.t0 - (point ? DRY_LEAD : 0.05) && t0 <= dry.t1 + DRY_HOLD) return null;
  const end = (ctx.duration || 0) + (Number.isFinite(gap) ? gap : 0.6);
  let next = end;
  for (const c of cues || []) if (c.k > 0 && Number.isFinite(c.at) && c.at > t0 + 0.05 && c.at < next) next = c.at;
  // the planned time left, at the pace the voice really runs (`rate` = elapsed on air / planned)
  const remaining = (next - t0) * (rate > 0 ? rate : 1);
  // the replacement would be short: the planned cut comes soon anyway (a phrase cut keeps 1 s more: it falls late in a
  // sentence, where a voice that runs ahead of its plan leaves the new shot under the minimum; seen at load 30: 1.8 s)
  if (remaining < S.cooldown + (point ? MARK_MARGIN : 0)) return null;
  // the greeting of an intro the guard took off its wide: back to the wide (both parts hold the cooldown)
  const greeting = !point && ctx.type === 'intro' && onAir.shot === 'close' && GREETING.test(String(sent.text ?? ctx.seg?.text?.slice(sent.start) ?? '').trim());
  if (greeting) return { k: 1000 + si, char, at: t0, sentence: si, mid: false, shot: 'wide', framing: wideFraming ?? null, focus: ctx.speaker, move: null, card: null, minLen: null, beat: 'greeting', guard: true };
  if (onAir.held + remaining <= maxHold(onAir.shot, programId) - HOLD_MARGIN) return null;
  let shot, framing;
  if (onAir.shot === 'close') {
    if (programId === 'news-60') return null;
    shot = 'wide';
    framing = wideFraming;
  } else {
    shot = 'close';
    framing = closeFraming;
  }
  // a studio shot that would only continue as the next segment's identical opening: no gain (a picture or map
  // past its maximum still goes back to the presenter: the new story's strap changes that picture anyway). An
  // intro is the exception when a later sentence start can still split the new shot (both parts ≥ the cooldown):
  // the guard comes back to the wide there (critic r2: a MONEY MINUTE intro whose next story opens on the MCU-R
  // held its solo wide 22.9 s, because every cut to the MCU-R was refused as "continuing into the story")
  const splitLater = ctx.type === 'intro' && (ctx.sentences || []).some((x) => Number.isFinite(x.t0) && x.t0 - t0 >= S.cooldown && end - x.t0 >= S.cooldown && !(dry && x.t0 >= dry.t0 - 0.05 && x.t0 <= dry.t1 + DRY_HOLD));
  if (STUDIO.has(onAir.shot) && next === end && !splitLater && nextOpen && nextOpen.shot === shot && (nextOpen.framing ?? null) === (framing ?? null) && nextOpen.focus === ctx.speaker) return null;
  return { k: 1000 + si, char, at: t0, sentence: si, mid: !!point, shot, framing: framing ?? null, focus: ctx.speaker, move: null, card: null, minLen: null, beat: 'hold', guard: true };
}

// a phrase boundary: after a comma / semicolon / colon / dash, or before ' and ' / ' but ' (the next word's char)
const PHRASE = /[,;:]\s+(?=\S)|\s[\u2013\u2014-]\s+(?=\S)|\s(?=(?:and|but)\s)/gi;

/**
 * Phrase boundaries inside the sentences of a story or intro where the max-hold guard may cut when no
 * sentence start can (speak() marks fire them): [{ char, t0, si }], not within 3 chars of a sentence
 * start or a planned cut inside a sentence (`skip`: chars). Pure.
 */
export function guardMarks(plan, skip = []) {
  const ctx = plan?.ctx;
  if (!ctx || (ctx.type !== 'story' && ctx.type !== 'intro') || typeof ctx.timeAt !== 'function') return [];
  const text = String(ctx.seg?.text || '');
  const ss = ctx.sentences || [];
  const out = [];
  for (const m of text.matchAll(PHRASE)) {
    const char = m.index + m[0].length;
    let si = 0;
    while (si + 1 < ss.length && ss[si + 1].start <= char) si++;
    const sent = ss[si];
    if (!sent || char - sent.start < 3 || (ss[si + 1] && ss[si + 1].start - char < 3)) continue;
    if (skip.some((c) => Math.abs(c - char) < 3)) continue;
    let t0 = NaN;
    try {
      t0 = ctx.timeAt(char);
    } catch {
      /* no timing: no mark */
    }
    if (Number.isFinite(t0)) out.push({ char, t0, si });
    if (out.length >= 24) break;
  }
  return out;
}

// a short partner pickup at a story's start ("Thanks, Ada."): heard on the studio shot on air, not over a card
const PICKUP = /^(thanks|thank you)\b/i;
const CARD_SHOTS = new Set(['fact', 'full', 'map']);
const PICKUP_SLACK = 0.5; // s

/** The shortest a card / picture / map should hold on air (s, pace.js). */
function minHold(shot, programId) {
  const S = paceFor(programId).shots;
  if (shot === 'map') return S.map[0];
  if (shot === 'full') return S.picture[0];
  if (shot === 'fact') return S.factMin ?? S.min;
  return S.min;
}

/**
 * A story that opens on a card, picture or map with a short partner pickup ("Thanks, Ada." ≤ 4 words) as
 * its first sentence: the pickup stays on the studio shot on air (cue 0 `keep`: the director makes no cut)
 * and the card moves to the next sentence, where its own line starts (critic r2: the card was on air 1.6 s
 * before its line, the pickup heard over a graphic). Only when the card still holds its minimum there and no
 * other cut is planned at that sentence. Returns new cues (renumbered) or the same array. Pure.
 */
export function pickupOpening(cues, plan, { programId = null, gap = 0.6 } = {}) {
  const ctx = plan?.ctx;
  if (!Array.isArray(cues) || !cues.length || !ctx || ctx.type !== 'story') return cues;
  const c0 = cues[0];
  const ss = ctx.sentences || [];
  if (!CARD_SHOTS.has(c0.shot) || ss.length < 2 || !Number.isFinite(ss[1].t0)) return cues;
  const first = String(ss[0].text ?? ctx.seg?.text?.slice(0, ss[1].start) ?? '').trim();
  if (!PICKUP.test(first) || first.split(/\s+/).length > 4) return cues;
  if (cues.some((c) => c.k > 0 && !c.mid && c.sentence === 1)) return cues;
  const t1 = ss[1].t0;
  let next = (ctx.duration || 0) + gap;
  for (const c of cues) if (c.k > 0 && Number.isFinite(c.at) && c.at > t1 + 0.05 && c.at < next) next = c.at;
  // (0.5 s of slack: the director's cut cooldown holds the card at least that long before the next cut anyway)
  if (next - t1 < minHold(c0.shot, programId) - PICKUP_SLACK) return cues;
  const close = cues.find((c) => c.shot === 'close' && c.focus === ctx.speaker && c.framing && c.framing !== 'ots')?.framing ?? null;
  const out = [{ k: 0, char: 0, at: 0, sentence: 0, mid: false, shot: 'close', framing: close, focus: ctx.speaker, move: null, card: null, minLen: null, beat: 'pickup', keep: true }];
  out.push({ ...c0, k: 1, char: ss[1].start, at: t1, sentence: 1, mid: false });
  for (const c of cues.slice(1)) out.push({ ...c, k: out.length });
  return out;
}

/** Rundown index of the story a headline sentence teases (event storyId, seg.teases, else the planner's card). */
function montageCard(e, seg, si, rundown, out) {
  const list = Array.isArray(rundown) ? rundown : [];
  const sid = e.storyId || (Array.isArray(seg.teases) ? seg.teases[si] : null);
  const at = sid ? list.findIndex((r) => r && r.storyId === sid) : -1;
  if (at >= 0) return at;
  const k = Number.isInteger(e.card) ? e.card : out.filter((c) => c.shot === 'montage').length;
  return list.length ? Math.min(Math.max(0, k), list.length - 1) : Math.max(0, k);
}

const LOGGED = new Set();
function logOnce(where, err) {
  const msg = `${where}: ${err?.message || err}`;
  if (LOGGED.has(msg)) return;
  LOGGED.add(msg);
  if (LOGGED.size > 100) LOGGED.clear();
  try {
    console.warn(`[v2 direction] ${msg}`);
  } catch {
    /* no console */
  }
}

/** Run fn; a throw is logged once and gives `fallback` (the director's own beats then carry on). */
function guarded(where, fn, fallback = null) {
  try {
    return fn();
  } catch (err) {
    logOnce(where, err);
    return fallback;
  }
}

const NONE = {}; // replan key: no recording
const NO_PRESENTERS = Object.freeze({}); // one object: context.js memoises neighbours per presenters object
// break elements: v2 idle work (plans, wall warm-up) waits while one is on air (critic r2: freezes at an ad's first frame)
const BUSY_SHOTS = new Set(['ad', 'ident', 'promo']);
const BUSY_RETRY = 750; // ms
const AIR_EVERY = 10; // segments between two ?perf=1 'air between segments' lines
const WARM = { id: 'warm-up', program: { id: 'world-now' }, cast: { A: 'paco', B: 'lola' }, segments: [{ type: 'story', anchor: 'A', text: 'Good evening. Floods have forced 40,000 people from their homes in southern Brazil.', cues: [] }] };

export class LiveDirection {
  /** @param opts { director (setShot, scene), channel ({ presenters }), audio (mode) } */
  constructor({ director, channel = null, audio = null }) {
    this.director = director;
    this.scene = director.scene;
    this.channel = channel;
    this.audio = audio;
    this.ep = null;
    this.plans = new WeakMap();
    this.replans = new WeakMap(); // seg -> { key, plan } made for the voice that really plays
    this.story = null; // { seg, cues, handler } registered by playStory
    this.framings = { close: {}, wide: null }; // the last studio framings applied (max-hold guard targets)
    // the scheduler (tests and labs replace `schedule` / `retry`)
    this.schedule = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 1500 }) : (fn) => setTimeout(fn, 30);
    this.retry = (fn) => setTimeout(fn, BUSY_RETRY);
    // the wall warm-up waits longer for real idle time (one warm can block 50-250 ms on a loaded box: better between
    // frames that have time to spare than forced by a short timeout; a wall not warmed in time only costs its cut frame)
    this.scheduleWall = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 5000 }) : (fn) => setTimeout(fn, 60);
    // idle work never runs while a break element is on air (it waits for the programme)
    this.idle = (fn) =>
      this.schedule(() => {
        if (BUSY_SHOTS.has(this.scene.shot)) this.retry(() => this.idle(fn));
        else guarded('idle', fn);
      });
    this.wallQueue = []; // { seg, i, cue, hasImg } waiting for warmWallContent
    this.wallKeys = new Set(); // what this episode already warmed
    this.wallBusy = false;
    this.wallStats = { warmed: 0, skipped: 0, ms: 0 };
    // ?perf=1: the air between segments as aired (speechEnd → next speechStart) per pace gap kind, against the
    // profile's pause (critic r2: 0.3-2 s over the profile); logged every AIR_EVERY segments, airStats() for tools
    this.perf = /[?&]perf=1(&|$)/.test(globalThis.location?.search || '');
    this.air = new Map(); // kind -> { n, sum, max, target }
    this.airNotes = 0;
    this.lastSpoken = null; // { ep, index, end }
    // the first plan of a session warms the text model and lexicon (~100-200 ms): do it now,
    // on the start card, so no programme open ever pays for it
    this.idle(() => planSegment(WARM, 0, {}));
  }

  /** A new episode is on air: remember it and plan its segments in idle time. */
  episode(ep) {
    guarded('episode', () => this.episode0(ep));
  }

  episode0(ep) {
    this.ep = ep && Array.isArray(ep.segments) ? ep : null;
    this.framings = { close: {}, wide: null };
    this.scene.episode = this.ep;
    this.scene.presenters = this.channel?.presenters || null; // the Stage's looks for ids without a design
    this.scene.segPlan = null;
    this.story = null;
    // the pause after each segment, as the director will hold it (one function per episode: contextAt memo)
    const ep2 = this.ep;
    this.gapFn = ep2 ? (i) => paceGap(ep2, i).gap : GAP_AFTER;
    this.wallQueue.length = 0;
    this.wallKeys.clear();
    this.warm(this.ep, 0);
    this.warmWalls(1); // the first story's walls while the open and the intro play (its plan comes from the idle chain)
  }

  /**
   * Queue the studio cues of segment i (only those after `fromK`) for the wall warm-up. The plan is made in
   * idle time if it is not ready; a cue whose wall needs nothing (idle wall, chats) costs one wallFromScene().
   */
  warmWalls(i, fromK = -1) {
    const ep = this.ep;
    if (!ep || !(i >= 0) || i >= ep.segments.length || typeof SETM.warmWallContent !== 'function') return;
    this.idle(() => {
      if (this.ep !== ep) return;
      const seg = ep.segments[i];
      const p = this.planAt(i);
      if (!p || !seg) return;
      const hasImg = !!this.director.images?.get?.(seg.storyId);
      const cues = cuesFromPlan(p, { hasImg }) || [];
      for (const cue of cues) {
        if (cue.k <= fromK || !STUDIO.has(cue.shot)) continue;
        const key = `${i}|${cue.k}|${hasImg ? 1 : 0}`;
        if (this.wallKeys.has(key)) continue;
        this.wallKeys.add(key);
        this.wallQueue.push({ seg, i, plan: p, cue, hasImg, ep });
      }
      this.pumpWalls();
    });
  }

  /** Warm the next queued wall, one per idle callback (never during a break element: it waits like every idle task). */
  pumpWalls() {
    if (this.wallBusy || !this.wallQueue.length) return;
    this.wallBusy = true;
    const run = () => {
      if (BUSY_SHOTS.has(this.scene.shot)) return this.retry(() => this.scheduleWall(run));
      this.wallBusy = false;
      const item = this.wallQueue.shift();
      if (item && item.ep === this.ep) guarded('wall', () => this.warmWall(item));
      this.pumpWalls();
    };
    this.scheduleWall(run);
  }

  /** SET's warmWallContent for one studio cue: the wall the Stage will latch on that cut, at that framing's size. */
  warmWall({ seg, plan, cue, hasImg }) {
    const t0 = performance.now();
    const programId = this.scene.program?.id || this.ep?.program?.id || 'world-now';
    const cast = this.ep?.cast || this.scene.cast || {};
    const solo = !(cast.A && cast.B);
    const story = seg.type === 'story';
    const images = this.director.images;
    const scene = {
      program: { id: programId },
      storyId: story ? seg.storyId : null,
      images,
      wall: story ? (hasImg ? { mode: 'image', storyId: seg.storyId } : { mode: 'source', source: seg.source || '', category: seg.category || 'general' }) : { mode: 'logo' },
      segPlan: plan,
      framing: cue.framing,
      focus: cue.focus,
      cast,
      lowerThird: story ? { kicker: seg.kicker, category: seg.category } : null,
    };
    let style = programId;
    try {
      style = SETM.styleFor?.(programId) || programId;
    } catch {
      /* the id resolves in SET */
    }
    const req = SETM.wallFromScene?.(scene, style);
    if (!req || req.mode === 'idle') {
      this.wallStats.skipped++;
      return;
    }
    // the camera the Stage will frame for this cue (stage.js onCut: inset singles of a solo show sit on side +1)
    const inset = cue.shot === 'close' && req.mode === 'picture' && cue.framing !== 'ots';
    const framing = cue.framing || defaultFraming(cue.shot, solo, inset);
    const focus = cue.focus in cast ? cue.focus : 'A';
    const cam = typeof CAM.framing === 'function' ? CAM.framing(framing, { framing, cast, focus, solo, side: solo && inset ? 1 : undefined, programId, move: null }) : null;
    SETM.warmWallContent(req, style, cam || null);
    this.wallStats.warmed++;
    this.wallStats.ms += performance.now() - t0;
  }

  warm(ep, i) {
    if (!ep || i >= ep.segments.length) return;
    this.idle(() => {
      if (this.ep !== ep) return;
      this.planAt(i);
      this.warm(ep, i + 1);
    });
  }

  /** Plan record of segment i (planned once). */
  planAt(i) {
    const seg = this.ep?.segments?.[i];
    if (!seg || typeof seg !== 'object') return null;
    let p = this.plans.get(seg);
    if (p) return p;
    const t0 = performance.now();
    const res = planSegment(this.ep, i, { presenters: this.channel?.presenters || NO_PRESENTERS, gapAfter: this.gapFn ?? GAP_AFTER });
    p = { id: `${this.ep.id}:${i}`, index: i, ctx: res.ctx, events: res.events, errors: res.errors, voice: null, speechStart: null, speechEnd: null, ms: performance.now() - t0 };
    this.plans.set(seg, p);
    return p;
  }

  /**
   * Plan segment i again for the voice that will actually play (recorded words, or none). The same
   * episode object is planned with the segment's audio swapped for the call (restored in finally): the
   * neighbours' memoised contexts and HANDS' running-order memory are reused, so a late segment of a
   * 19-segment episode costs one segment's plan, not a re-plan of every segment before it (critic r2:
   * 64-188 ms on the say() path at load 17).
   */
  replan(i, recorded) {
    const seg = this.ep.segments[i];
    const key = recorded || NONE;
    const hit = this.replans.get(seg);
    if (hit && hit.key === key) return hit.plan;
    const t0 = performance.now();
    const had = Object.prototype.hasOwnProperty.call(seg, 'audio');
    const saved = seg.audio;
    let res;
    try {
      seg.audio = recorded || undefined;
      res = planSegment(this.ep, i, { presenters: this.channel?.presenters || NO_PRESENTERS, gapAfter: this.gapFn ?? GAP_AFTER });
    } finally {
      if (had) seg.audio = saved;
      else delete seg.audio;
    }
    const plan = { id: `${this.ep.id}:${i}`, index: i, ctx: res.ctx, events: res.events, errors: res.errors, voice: null, speechStart: null, speechEnd: null, ms: performance.now() - t0 };
    this.replans.set(seg, { key, plan });
    return plan;
  }

  indexOf(seg) {
    return this.ep?.segments?.indexOf(seg) ?? -1;
  }

  /**
   * playStory: the story's v2 shot cues (null = use the old beats). `handler(cue)`
   * applies a later cue with the director's card/wall/MIN_SHOT logic.
   */
  shots(seg, hasImg, handler) {
    return guarded('shots', () => this.shots0(seg, hasImg, handler));
  }

  shots0(seg, hasImg, handler) {
    const i = this.indexOf(seg);
    const p = i >= 0 ? this.planAt(i) : null;
    let cues = p ? cuesFromPlan(p, { hasImg }) : null;
    // a pickup ("Thanks, Ada.") stays on the studio shot on air; its card comes with its own line
    if (cues && STUDIO.has(this.scene.shot)) cues = pickupOpening(cues, p, { programId: this.scene.program?.id, gap: typeof this.gapFn === 'function' ? this.gapFn(i) : GAP_AFTER });
    this.story = cues ? { seg, cues, handler } : null;
    return cues;
  }

  /**
   * playIntro: the intro on its plan (montage frames on the spoken teaser, the greeting's
   * studio shot). Applies the opening cue now, registers the rest for begin()/onSentence and
   * speaks the intro; the promise resolves when the last shot has held its `minLen` (a
   * templated NEWS IN 60 intro: 4 s; at most 2 s past the voice). Null when there is no plan
   * (the director's own montage then).
   */
  intro(seg) {
    return guarded('intro', () => this.intro0(seg));
  }

  intro0(seg) {
    const i = this.indexOf(seg);
    const p = i >= 0 ? this.planAt(i) : null;
    const cues = p ? cuesFromPlan(p, { rundown: this.scene.rundown }) : null;
    if (!cues) return null;
    // a headline montage needs at least two stories to show (the director's own rule): else its plain intro
    if (cues.some((c) => c.shot === 'montage') && !((this.scene.rundown?.length || 0) >= 2)) return null;
    let last = null;
    const apply = (cue) => {
      last = cue;
      if (cue.shot === 'montage') this.director.setShot('montage', { focus: seg.anchor, storyId: null, card: { index: cue.card } });
      else {
        this.director.setShot(cue.shot, { focus: cue.focus, storyId: null, wall: { mode: 'logo' }, card: null, framing: cue.framing, cameraMove: cue.move });
        this.noteFraming(cue);
      }
    };
    this.story = { seg, cues, handler: apply };
    apply(cues[0]);
    // the first line comes a breath after the cut from the open (pace open.firstWord; world-now.md 0.5 s)
    const breath = paceFor(this.scene.program?.id).open.firstWord;
    return new Promise((r) => setTimeout(r, breath * 1000)).then(() => this.director.say(seg)).then(() => {
      // PACE: only a headline frame is held to its floor here; a studio wide's cooldown is the next story's opening cut's
      // to wait for (it cuts when the wide has held it), so the next voice is never delayed (NEWS IN 60: 1.5 s of dead air)
      const need = last?.shot === 'montage' ? Math.min(2, (last?.minLen || 0) - (now() - (this.scene.shotSince || 0))) : 0;
      return need > 0 ? new Promise((r) => setTimeout(r, need * 1000)) : undefined;
    });
  }

  /**
   * say(): the segment's plan goes on air. `recorded` = the voice speak() will really play
   * (the voice player's answer: a recording that arrived after the episode, or null when it
   * falls back to the browser voice); a plan made for other timing is re-made for it.
   * Returns the handle for speak() and onSentence.
   */
  begin(seg, recorded = undefined) {
    const h = guarded('begin', () => this.begin0(seg, recorded));
    if (!h) return null;
    // the handle's calls are guarded too: speak() and onSentence never see a v2 throw
    const { speak } = h;
    return {
      plan: h.plan,
      speak: speak ? { marks: speak.marks, onMark: (j) => guarded('mark', () => speak.onMark(j)) } : null,
      sentence: (si) => guarded('sentence', () => h.sentence(si)),
      end: () => guarded('end', () => h.end()),
    };
  }

  begin0(seg, recorded) {
    const i = this.indexOf(seg);
    let p = i >= 0 ? this.planAt(i) : null;
    if (!p) return null;
    if (recorded !== undefined && (recorded || null) !== (seg.audio || null) && (recorded?.words?.length || seg.audio?.words?.length)) p = this.replan(i, recorded);
    p.voice = this.audio?.mode ?? null;
    p.speechStart = null;
    p.speechEnd = null;
    this.scene.segPlan = p;
    const story = this.story?.seg === seg ? this.story : null;
    const cues = story ? story.cues : cuesFromPlan(p);
    const apply = story ? story.handler : (cue) => this.studioCut(cue);
    const timers = [];
    const fireCue = (cue) => {
      const st = this.scene.stinger;
      const left = st ? st.start + STINGER - now() : 0;
      if (left > 0) timers.push(setTimeout(() => guarded('cue', () => fireCue(cue)), left * 1000 + 20));
      else {
        apply(cue);
        if (story) this.noteFraming(cue);
      }
    };
    if (!story && cues?.[0]) fireCue(cues[0]);
    // wall warm-up: this segment's later studio cuts, then the next segment's (its picture may have loaded since)
    this.warmWalls(i, 0);
    this.warmWalls(i + 1);
    const mids = cues ? cues.filter((c) => c.k > 0 && c.mid) : [];
    // the max-hold guard's phrase boundaries (a cut inside a sentence when no sentence start can split a long shot)
    const gm = guardMarks(p, mids.map((c) => c.char));
    const marks = [...mids.map((c) => c.char), ...gm.map((m) => m.char)];
    return {
      plan: p,
      speak: marks.length
        ? {
            marks,
            onMark: (j) => {
              if (j < mids.length) return mids[j] && fireCue(mids[j]);
              const m = gm[j - mids.length];
              const g = m ? this.holdCue(p, m.si, cues, m) : null;
              if (g) fireCue(g);
            },
          }
        : null,
      sentence: (si) => {
        if (si === 0 && p.speechStart == null) {
          p.speechStart = now();
          const prev = this.lastSpoken;
          if (prev && prev.ep === this.ep && prev.index === i - 1 && prev.end != null) this.noteAir(i - 1, p.speechStart - prev.end);
        }
        let planned = false;
        if (cues) {
          for (const c of cues) {
            if (c.k > 0 && !c.mid && c.sentence === si) {
              fireCue(c);
              planned = true;
            }
          }
        }
        // no planned cut here: a shot running past its pace maximum gives way to the speaker's studio shot
        if (!planned && si > 0) {
          const g = this.holdCue(p, si, cues);
          if (g) fireCue(g);
        }
      },
      end: () => {
        p.speechEnd = now();
        this.lastSpoken = { ep: this.ep, index: i, end: p.speechEnd };
        for (const id of timers) clearTimeout(id);
        if (this.story?.seg === seg) this.story = null;
        this.warmWalls(i + 1); // again, in the pause: a picture that loaded during this segment (cheap when done)
      },
    };
  }

  /** The air after segment i as aired (s), against the pace profile's pause for that gap kind. */
  noteAir(i, air) {
    if (!(air >= 0) || air > 30) return;
    const g = this.ep ? paceGap(this.ep, i) : null;
    const kind = g?.kind || 'gap';
    let a = this.air.get(kind);
    if (!a) this.air.set(kind, (a = { n: 0, sum: 0, max: 0, target: g?.gap ?? GAP_AFTER }));
    a.n++;
    a.sum += air;
    if (air > a.max) a.max = air;
    if (this.perf && ++this.airNotes % AIR_EVERY === 0) {
      const parts = [];
      for (const [k, v] of this.air) parts.push(`${k} ${(v.sum / v.n).toFixed(2)} s (profile ${v.target.toFixed(2)}, max ${v.max.toFixed(2)}, n ${v.n})`);
      try {
        console.info(`[v2] air between segments: ${parts.join('; ')}`);
      } catch {
        /* no console */
      }
    }
  }

  /** { kind: { mean, max, n, target } } of the air between segments so far (tools, soak checks). */
  airStats() {
    const out = {};
    for (const [k, v] of this.air) out[k] = { mean: v.sum / v.n, max: v.max, n: v.n, target: v.target };
    return out;
  }

  /** Remember the studio framings applied in this episode (the max-hold guard cuts back to them). */
  noteFraming(cue) {
    if (!cue || !cue.framing || cue.guard) return;
    if (cue.shot === 'close' && cue.framing !== 'ots') this.framings.close[cue.focus] = cue.framing;
    else if (cue.shot === 'wide') this.framings.wide = cue.framing;
  }

  /** The max-hold guard's cue at sentence `si` (or phrase mark `point` inside it) of plan `p` (holdCut with the shot on air), or null. */
  holdCue(p, si, cues, point = null) {
    const s = this.scene;
    if (s.stinger || !Number.isFinite(s.shotSince)) return null;
    const ctx = p.ctx;
    const speaker = ctx?.speaker;
    // the speaker's framings: this segment's planned ones first, else the last ones on air
    let closeFraming = this.framings.close[speaker] ?? null;
    let wideFraming = this.framings.wide;
    for (const c of cues || []) {
      if (c.shot === 'close' && c.focus === speaker && c.framing && c.framing !== 'ots') closeFraming = c.framing;
      if (c.shot === 'wide' && c.framing) wideFraming = c.framing;
    }
    // nothing on air yet for this speaker (an intro): the single the episode's plans give them
    if (!closeFraming) {
      for (const seg of this.ep?.segments || []) {
        const ev = this.plans.get(seg)?.events || [];
        const e = ev.find((x) => x.kind === 'shot' && x.focus === speaker && x.framing && legacyShot(x.shot, x.framing) === 'close' && x.framing !== 'ots');
        if (e) {
          closeFraming = e.framing;
          break;
        }
      }
    }
    const i = p.index;
    const gap = typeof this.gapFn === 'function' ? this.gapFn(i) : GAP_AFTER;
    const onAir = { shot: s.shot, framing: s.framing ?? null, focus: s.focus, held: now() - s.shotSince };
    // the next segment's opening shot (already planned in idle time; never planned here)
    const nextSeg = this.ep?.segments?.[i + 1];
    const np = nextSeg ? this.plans.get(nextSeg) : null;
    const nextOpen = np ? cuesFromPlan(np, { hasImg: true })?.[0] || null : null;
    // how fast the voice really runs against the plan (a slower voice or a stalled page makes every shot longer)
    const t0 = point ? point.t0 : ctx?.sentences?.[si]?.t0;
    const rate = p.speechStart != null && t0 > 1 ? Math.min(1.5, Math.max(0.9, (now() - p.speechStart) / t0)) : 1;
    return holdCut(p, si, onAir, { programId: s.program?.id, gap, cues, closeFraming, wideFraming, nextOpen, rate, point });
  }

  /** Default cue handler: studio cuts only, MIN_SHOT holds (chats, outros, intros without a montage). */
  studioCut(cue, held = false) {
    guarded('studioCut', () => this.studioCut0(cue, held));
  }

  studioCut0(cue, held = false) {
    const s = this.scene;
    if (!STUDIO.has(s.shot) || !STUDIO.has(cue.shot)) return;
    const wait = cue.k > 0 && !held ? minShot(s) - (now() - (s.shotSince || 0)) : 0;
    if (wait > 0) {
      const p = s.segPlan;
      setTimeout(() => s.segPlan === p && p.speechEnd == null && this.studioCut(cue, true), wait * 1000);
      return;
    }
    const reframe = s.shot === cue.shot && s.focus === cue.focus && (s.framing ?? null) !== cue.framing;
    this.director.setShot(cue.shot, { focus: cue.focus, framing: cue.framing, cameraMove: cue.move });
    if (reframe) s.shotSince = now(); // a new framing of the same shot is a cut too (director.setShot does it as well)
    this.noteFraming(cue);
  }
}

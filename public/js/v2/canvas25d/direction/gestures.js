// Gesture planner (owner: HANDS & GESTURES stream): which gestures the
// SPEAKER performs during a segment, decided at runtime from the live episode
// data (the writer's cues, segment type, emotion, the camera's cuts, the
// stressed words of the text) and the programme's style bible. Pure and
// seeded: the same episode always gives the same plan; nothing is authored
// per story.
//
//   planGestures(ctx) → [{ kind: 'gesture' | 'emotion', slot, name, char, at, speed?, n?, variant?, amp? }]
//   ctx = direction/context.js segmentContext() with ctx.shots filled by planShots;
//   `at` = seconds from the first word; `char` = offset in seg.text
//
// OWNERSHIP (CONTRACTS "planner arbitration"): the speaker's body only (arm
// gestures, the speaker's nods: greeting, sign-off, the writer's [nod]) and
// the writer's emotion cues. Every eyeline (look_partner included) and every
// listener nod belongs to planBehaviour (FACES); arbitrate() enforces it.
//
// Programme rules (docs/programmes/*.md "Gestures" tables and acceptance
// checklists; PLAN §9 digest). The editorial policy of config/channel.json
// `programs.<id>.gestures` is mirrored in CONFIG_POLICY (a parity test keeps
// them equal); `ctx.programGestures` / `ctx.program.gestures` replace it when
// the server sends the policy with the episode. Both apply: where the bible
// is stricter than the config block, the bible wins. Unknown programmes use
// the WORLD NOW rules.
//
// Timing (all programmes): a gesture is anchored to the nearest stressed word
// (ctx.words[].stressed) at or after its cue in the same sentence. Its stroke
// starts 0.2-0.3 s before that word (0.3 s in COSMOS), its apex lands within
// ±0.1 s of it and is held through it, the release takes ≥ 0.4 s (the
// definitions guarantee it). No gesture starts in the first ctx.cutGuard s of
// a shot (ctx.shots), at most one arm gesture per sentence, gestures never
// overlap (beyond a settle), and grave stories get small, slow nods and
// steeples only (amp 0.6-0.7). Per-episode budgets (NEWS IN 60: 2; MONEY
// MINUTE: one lean_in; greeting nods) are a pure function of ctx.episode and
// ctx.episodeSeed, memoised per episode object.
//
// Restraint (owner 22:50 note 6 "don't overuse them"; pace.js, one pacing table): each presenter's
// MARKED gestures (arm strokes and statements on meaningful words: the writer's cues, the fillers,
// the hand-over) and tiny BEATS have separate budgets from paceFor(programme).gestures: a per-episode
// token bucket per presenter at `perMin` / `beatsPerMin` of their own speech (grave segments at the
// `grave` rate, no beats), capped per turn by gestureBudget(programme, seconds); two marked gestures
// of one speaker start at least `minGap` s apart and any two arm gestures (beats too) at least
// ARM_GAP, across segments as well; the hands rest at least `rest` of the speech; never the same
// gesture twice in a row. Structural moments (greeting and sign-off nods, NEWS IN 60's allocation,
// the sign-off papers) are outside the budget.
//
// Variety on air (owner 20:40 "repetitive", critics r2): the programme remembers the marked arm
// gestures that aired before this segment, whoever performed them (the plan of the previous segment
// carries that memory forward): never the same family twice in a row on air, nor within 45 s, and the
// full palm-out raise_hand at most once per presenter per episode. A statement that cannot air as
// written gives way to a variant of the same action that reads in the shot (steeple → steeple:tap,
// raise_hand → raise_hand:lift / box), then to a seeded rotation of chest-level options, then to a head
// beat (nod / lean_in), never to the same gesture again.
// Meaning (critics r2): gestures that carry a meaning need it in the text: shake_head only near a
// negation, contrast or doubt, shrug only on uncertainty or a question, glasses only on the question
// (tech-bytes.md "before her question"); chin while speaking is a brief touch (the long thinking pose
// only on a question or into the pause after the last word).
//
// Visibility (owner 20:40 / critics): a gesture is only worth performing where the viewer sees the
// hands. At planning time every arm gesture's apex hand is projected through the framing of the
// shot it lands in (camera.js framing + placeActor): in head-and-shoulders singles the hands must
// stay above the lower third (HAND_FLOOR) and, where the subtitle can run (graphics/layout.js CAPTION:
// centred, one 12 px line ending 6 px above the strap, rows 148-160), above the caption too (critic r2:
// a palm-up lift landed behind the caption), so desk-level beats are skipped there and a cue gesture
// that would not read is replaced by an allowed face- or chest-level one (raise_hand, count, chin,
// glasses, point_screen when a picture follows), or dropped. No unexplained shoulder bobs.
import { GESTURES, defOf, rateOf } from '../gestures/index.js';
import { rng, hashSeed } from './context.js';
import { lookFor } from '../cast/index.js';
import { framing as cameraFraming, placeActor } from '../camera.js';
import { SET } from '../studio/geometry.js';
import { evalTrack } from '../tracks.js';
import { TILT } from '../space.js';
import { planShots } from './shots.js';
import { paceFor, gestureBudget, CHANNEL } from '../../../pace.js';

/** config/channel.json programs.<id>.gestures, mirrored for the client (test/v2-hands.test.js checks parity). */
export const CONFIG_POLICY = {
  'world-now': {
    allow: ['nod', 'lean_in', 'steeple', 'raise_hand', 'point_screen', 'look_partner', 'point_partner', 'shrug', 'shake_head', 'papers'],
    listener: ['nod', 'look_partner'],
    grave: ['nod', 'steeple'],
    map: { wave: 'nod', point_camera: 'nod', count: 'steeple', chin: 'steeple' },
    perSegment: 2,
    defaults: { intro: 'nod', outro: 'nod' },
  },
  'tech-bytes': {
    allow: {
      max: ['lean_in', 'raise_hand', 'point_screen', 'count', 'look_partner', 'nod'],
      ada: ['steeple', 'chin', 'glasses', 'shake_head', 'shrug', 'look_partner', 'nod'],
    },
    listener: ['nod', 'look_partner'],
    grave: ['nod', 'steeple'],
    map: { wave: 'nod', point_camera: 'nod' },
    perSegment: { max: 2, ada: 1 },
    defaults: { intro: 'nod', outro: 'nod' },
  },
  cosmos: {
    deny: ['wave', 'wow', 'fist_pump', 'thumbs_up', 'facepalm', 'laugh', 'point_camera'],
    listener: ['nod', 'look_partner'],
    grave: ['nod', 'steeple'],
    map: { wave: 'nod' },
    perSegment: 1,
    defaults: { intro: 'nod', outro: 'nod' },
  },
  'money-minute': {
    allow: ['nod', 'steeple', 'lean_in', 'papers'],
    grave: ['nod', 'steeple'],
    map: { count: 'steeple', point_camera: 'nod', raise_hand: 'nod', wave: 'nod' },
    only: { papers: 'outro' },
    perSegment: 2,
    defaults: { intro: 'nod', outro: 'nod' },
  },
  'news-60': {
    allow: ['nod', 'lean_in', 'papers'],
    grave: ['nod'],
    map: { wave: 'nod', point_camera: 'nod', point_screen: 'nod', raise_hand: 'nod' },
    only: { lean_in: 'lead', papers: 'outro' },
    perSegment: 1,
    perEpisode: 2,
    defaults: { intro: 'nod', outro: 'nod' },
  },
};

const LIGHT = ['wave', 'thumbs_up', 'wow', 'fist_pump', 'facepalm', 'laugh'];

/**
 * The bibles' rules (what each programme's planner may choose; stricter than or equal to the config).
 *   speaker   allowed speaker gestures (or per presenter id)
 *   story     the pool fillers are drawn from in stories (point_screen only before a picture/map)
 *   cap       per segment (or per presenter), perStory, perEpisode
 *   lead      [min, max] s between the stroke start and the stressed word
 */
export const BIBLE = {
  'world-now': {
    speaker: ['nod', 'lean_in', 'steeple', 'raise_hand', 'point_screen', 'point_partner', 'shrug', 'shake_head', 'papers'],
    banned: ['wave', 'thumbs_up', 'wow', 'fist_pump', 'facepalm', 'laugh', 'point_camera', 'chin', 'glasses', 'count'],
    story: ['nod', 'lean_in', 'steeple', 'raise_hand'],
    chat: ['shrug', 'shake_head'], // chat and AND FINALLY add these
    grave: ['nod', 'steeple'],
    cap: 2,
    perStory: 2,
    lead: [0.2, 0.3],
    greeting: true,
    handover: true,
    signoffPapers: true,
    storyCount: [1, 2],
    beats: {
      density: { story: 0.62, chat: 0.4, intro: 0.3 },
      variants: ['raise_hand:beat', 'raise_hand:offer', 'raise_hand:beat2', 'steeple:press', 'raise_hand:box', 'raise_hand:lift', 'raise_hand:settle', 'raise_hand:tick', 'raise_hand:turn'],
    },
  },
  'tech-bytes': {
    speaker: {
      max: ['lean_in', 'raise_hand', 'point_screen', 'count'],
      ada: ['steeple', 'chin', 'glasses', 'shake_head', 'shrug'],
    },
    banned: ['wave', 'wow', 'fist_pump', 'thumbs_up', 'facepalm', 'point_camera', 'point_partner', 'papers', 'laugh'],
    defaultsOnly: ['nod'], // the speaker's nod is only the intro/outro default
    grave: ['nod', 'steeple'],
    cap: { max: 2, ada: 1 },
    // §3.5 "Ada 1, Max 2 per segment" caps the cue-level gestures; the owner's 20:40 delivery beats come
    // on top but are capped too: at most ONE beat per segment beyond the cap (Ada ≤ 2 arm movements, Max ≤ 3)
    capBeats: 1,
    lead: [0.2, 0.3],
    variants: { ada: { shake_head: 'slow' } },
    storyCount: [1, 2],
    beats: {
      max: { density: { story: 0.68, chat: 0.45, intro: 0.3 }, variants: ['raise_hand:beat', 'raise_hand:offer', 'raise_hand:beat2', 'raise_hand:box', 'raise_hand:lift', 'raise_hand:tick', 'raise_hand:turn'] },
      ada: { density: { story: 0.4, chat: 0.3 }, variants: ['steeple:press', 'shrug:small', 'steeple:tap'] },
    },
  },
  cosmos: {
    speaker: {
      nova: ['steeple', 'raise_hand', 'point_screen', 'glasses', 'chin', 'nod'],
      unit8: ['nod', 'lean_in', 'count'],
    },
    banned: ['wave', 'wow', 'fist_pump', 'thumbs_up', 'facepalm', 'laugh', 'point_camera'],
    grave: ['nod', 'steeple'],
    cap: 1,
    lead: [0.3, 0.3],
    armSpacing: 6, // s between two arm gestures of one presenter
    variants: { unit8: { nod: 'crisp' } },
    amp: { unit8: 0.85 },
    storyCount: [1, 1],
    // Nova only; armSpacing (6 s per presenter) still holds for every arm movement
    beats: { nova: { density: { story: 0.5, chat: 0.3 }, variants: ['raise_hand:beat', 'steeple:press', 'raise_hand:box', 'raise_hand:lift', 'raise_hand:settle', 'steeple:tap'] } },
  },
  'money-minute': {
    speaker: ['nod', 'steeple', 'lean_in', 'papers'],
    banned: ['point_screen', 'glasses', ...LIGHT, 'wave', 'point_camera', 'raise_hand', 'count', 'chin', 'point_partner', 'shrug', 'shake_head'],
    story: ['nod', 'steeple'],
    grave: ['nod', 'steeple'],
    cap: 2,
    perStory: 2,
    perSentence: 1, // any gesture, not only arm gestures
    steeplePerStory: 1,
    leanInPerEpisode: 1,
    figureGuard: 0.4,
    lead: [0.2, 0.3],
    amp: 0.85, // Penny's restraint
    signoffPapers: true,
    greeting: true,
    storyCount: [1, 2],
  },
  'news-60': {
    speaker: ['nod', 'lean_in', 'papers'],
    banned: [...LIGHT, 'wave', 'point_screen', 'raise_hand'],
    grave: ['nod'],
    cap: 1,
    perEpisode: 2,
    only: { lean_in: 'lead', papers: 'outro' },
    lead: [0.2, 0.3],
    amp: 0.85,
    storyCount: [0, 0],
  },
};

// s two gestures may overlap while the first one settles (≤ 0.3, so a cut-guard shift of the runtime
// can never turn a settle into an interruption, rig.js SETTLE_OVERLAP 0.4)
const SETTLE = 0.3;
const BEAT_AIR = 0.2; // s of stillness a beat keeps from the gestures around it
const ARM_GAP_MIN = 2.6; // s: two arm gestures of one speaker (beats included) start at least this far apart
const HEAD_GAP = 3.5; // s between two planned head statements of one speaker (speech.js adds its own emphasis nods)
// lowest screen row a gesture's hand may reach at its apex in a single (6 px above the lower third's tag
// row at y 166, where two caption lines also start) and in wider shots (6 px above the ticker band)
const HAND_FLOOR = 160, HAND_FLOOR_WIDE = 190, WRIST_FLOOR = 166;
// the caption box over a strap (graphics/layout.js: STRAP.tagY 166 - gap 6 = bottom 160, one 12 px line
// while a strap is up; centred, at most 264 + 2·5 px wide): a hand centre in its columns must clear its
// top by 4 px (the hand is about 24 px long in a single: two thirds of it then show above the box)
const CAPTION_BOX = { x0: 55, x1: 329, top: 148 };
const CAPTION_CLEAR = 4;
const SINGLE_SCALE = 2.2; // presenter scale from which a framing counts as a single (the over-the-shoulder 2.41 too)
const CPS = 14.5; // chars per second to estimate segment lengths from the episode summary
/**
 * Identity of a gesture for the no-repeat rule: its family (variants that read alike on screen share
 * one: a steeple and a steeple press, a one- and a two-handed beat, every nod).
 */
const FAMILY = {
  'steeple:press': 'steeple',
  'steeple:tap': 'steeple',
  'raise_hand:turn': 'raise_hand:offer',
  'raise_hand:beat2': 'raise_hand:beat',
  'raise_hand:two': 'raise_hand',
  'nod:single': 'nod',
  'nod:crisp': 'nod',
  'shrug:small': 'shrug',
  'shake_head:slow': 'shake_head',
  'point_screen:open': 'point_screen',
  'point_partner:after_you': 'point_partner',
  // (critic r3: a hand to the jaw is a hand to the jaw, brief or held: Ada's chin and chin touch aired back to back)
  'chin:touch': 'chin',
};
export const familyOf = (e) => {
  // a beat with the far hand reads as the same beat
  const v = e.variant && e.variant.endsWith('_far') ? e.variant.slice(0, -4) : e.variant;
  const k = v ? `${e.name}:${v}` : e.name;
  return FAMILY[k] || k;
};
const keyOf = familyOf;
/** Legacy shots in which the presenter is not in vision: a gesture's apex never lands there. */
const HIDDEN = new Set(['full', 'map', 'fact', 'montage', 'card', 'numbers', 'quote', 'number', 'headlines']);
const GRAVE_AMP = [0.6, 0.7];
const RAISE_CAP = 1; // the full palm-out raise_hand: per presenter per episode
const REPEAT_GAP = 45; // s: one marked family never twice within this on air, whoever performs it
const MEMORY_SPAN = 60; // s of aired marked gestures the programme remembers
const MIN_BEAT_PX = 2; // a beat that moves less than this on screen is not worth a slot (nor the budget)
// per presenter per episode: the wall point at most twice (the second time the open hand), a third wall
// reference is left to the eyeline (critic r3: Lola pointed at the wall at 41, 105 and 151 s)
const FAMILY_CAP = { point_screen: 2 };
// meaning in the text: a head shake near a negation, contrast or doubt; a shrug on uncertainty or a question
const NEGATION = /\b(not|no|never|nothing|nobody|none|neither|nor|without|despite|still|yet|but|however|denied|denies|deny|refused|refuses|rejected|unclear|cannot|hardly|failed|fails|unlikely|doubts?|sceptic\w*|skeptic\w*)\b|n't\b/gi;
const UNCERTAIN = /\b(maybe|perhaps|unclear|uncertain|unknown|possibly|might|remains? to be seen|who knows|hard to say|not sure|depends|anyone's guess|open question)\b|\?/gi;

// ---------------------------------------------------------------------------
// Rules for one segment

function listFor(v, id) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    if (id && Array.isArray(v[id])) return v[id];
    // an unknown presenter in a per-presenter table: the union of the lists
    return [...new Set(Object.values(v).flat())];
  }
  return null;
}

function capFor(v, id, fallback) {
  if (typeof v === 'number') return v;
  if (v && typeof v === 'object') return typeof v[id] === 'number' ? v[id] : Math.min(...Object.values(v));
  return fallback;
}

/** The effective rules for this segment: bible ∩ editorial policy (config mirror or the episode's own). */
export function rulesFor(ctx) {
  const pid = BIBLE[ctx.programId] ? ctx.programId : 'world-now';
  const B = BIBLE[pid];
  const policy = ctx.programGestures || ctx.program?.gestures || CONFIG_POLICY[pid];
  const id = ctx.speakerId;
  let speaker = listFor(B.speaker, id) || [];
  const pAllow = listFor(policy?.allow, id);
  if (pAllow) speaker = speaker.filter((n) => pAllow.includes(n));
  const deny = new Set([...(B.banned || []), ...(policy?.deny || [])]);
  speaker = speaker.filter((n) => !deny.has(n) && n !== 'look_partner' && GESTURES[n]);
  const graveList = (B.grave || ['nod', 'steeple']).filter((n) => (policy?.grave || B.grave).includes(n));
  const cap = Math.min(capFor(B.cap, id, 2), capFor(policy?.perSegment, id, 2));
  const variants = (B.variants && id && B.variants[id]) || {};
  const amp = typeof B.amp === 'number' ? B.amp : (B.amp && id && B.amp[id]) || 1;
  return {
    pid,
    B,
    policy,
    speaker,
    deny,
    grave: graveList,
    map: { ...(policy?.map || {}) },
    only: { ...(policy?.only || {}), ...(B.only || {}) },
    cap,
    perEpisode: Math.min(B.perEpisode ?? Infinity, policy?.perEpisode ?? Infinity),
    variants,
    amp,
    lead: B.lead || [0.2, 0.3],
    defaultsOnly: new Set(B.defaultsOnly || []),
  };
}

/** Where a segment is in the running order, in the editorial policy's words ('lead' for the first story). */
function whereOf(ctx) {
  return ctx.type === 'story' && ctx.isLead ? 'lead' : ctx.type;
}

// ---------------------------------------------------------------------------
// Per-episode allocation (pure in ctx.episode + ctx.episodeSeed, memoised)

// memo: episode summary object (context.js memoises it per episode object) → Map(programme|seed → plan),
// so two episodes that share an id never share a plan
const EPISODE_PLANS = new WeakMap();

/**
 * Budgets that span segments, decided once per episode from its summary:
 *   greet[i]   the speaker of segment i nods hello there (their first turn in the opening)
 *   leanIn     the segment that may carry MONEY MINUTE's single lean_in
 *   n60        NEWS IN 60's two gestures: { [index]: name }
 *   armMinAt[i] COSMOS: earliest arm gesture in segment i (6 s per presenter across segments)
 *   quota[i]   { marked, beats, cumMarked, cumBeats }: the presenter's pace budget (pace.js
 *              gestures.perMin / beatsPerMin per minute of their own speech; grave: gestures.grave, no
 *              beats) as a token bucket over their segments in running order: cum* = what the
 *              presenter may have used by the end of segment i (the planner subtracts what their
 *              earlier turns really used, so a montage-covered intro hands its tokens on), so many
 *              short turns cannot add up to more than the rate allows
 */
export function episodePlan(ctx) {
  const ep = ctx.episode;
  const key = `${ctx.programId}|${ctx.episodeSeed}`;
  let byKey = EPISODE_PLANS.get(ep);
  if (!byKey) EPISODE_PLANS.set(ep, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const segs = ep.segments || [];
  const r = rng((ctx.episodeSeed ^ 0x6a09e667) >>> 0);
  const plan = { greet: {}, leanIn: -1, n60: {}, armMinAt: {}, quota: {} };
  // greetings: each presenter's first segment if it is part of the opening (intro, or a turn right after it)
  const seen = new Set();
  segs.forEach((s, i) => {
    if (!s.anchor || seen.has(s.anchor)) return;
    seen.add(s.anchor);
    if (s.type === 'intro' || (i <= 2 && s.type !== 'story' && segs.slice(0, i).every((p) => p.type === 'intro' || p.type === 'chat'))) plan.greet[i] = true;
  });
  // MONEY MINUTE: one lean_in on a money line, in one non-grave story (seeded among the first three)
  const stories = segs.map((s, i) => ({ s, i })).filter((x) => x.s.type === 'story' && !x.s.grave && x.s.feature !== 'roundup');
  if (stories.length) plan.leanIn = stories[Math.floor(r() * Math.min(3, stories.length))].i;
  // NEWS IN 60: at most two, counting the defaults: the intro nod, then lean_in on the lead or papers at the outro
  const intro = segs.findIndex((s) => s.type === 'intro');
  const lead = segs.findIndex((s) => s.type === 'story');
  const outro = segs.findIndex((s) => s.type === 'outro');
  if (intro >= 0) plan.n60[intro] = 'nod';
  const second = [];
  if (lead >= 0 && !segs[lead].grave) second.push([lead, 'lean_in']);
  if (outro >= 0) second.push([outro, 'papers']);
  if (second.length) {
    const [i, name] = second[Math.floor(r() * second.length)];
    if (plan.n60[i]) plan.n60[i] = [plan.n60[i], name];
    else plan.n60[i] = name;
  }
  // COSMOS: estimate segment lengths from their characters to keep 6 s between one presenter's arm gestures;
  // the estimate assumes fast speech (18 chars/s, no lead-in) so it never overestimates the time that passed
  const lastEnd = {};
  let t = 0;
  segs.forEach((s, i) => {
    const dur = (s.chars || 0) / 18;
    const prevEnd = lastEnd[s.anchor];
    plan.armMinAt[i] = prevEnd === undefined ? 0 : Math.max(0, 6 - (t - prevEnd));
    // assume a presenter's arm gesture may land as late as the end of their segment
    lastEnd[s.anchor] = t + dur;
    t += dur + 0.5;
  });
  // pace budget: token buckets per presenter (marked at perMin, grave at the grave rate; beats at
  // beatsPerMin, none when grave); a segment may use what its own speech adds to the bucket
  const G = paceFor(ctx.programId).gestures;
  const acc = {};
  segs.forEach((s, i) => {
    const a = (acc[s.anchor] ||= { m: 0.35, b: 0.5 }); // phases: the first long turn gets its first gesture
    const min = (s.chars || 0) / CPS / 60;
    const m0 = a.m, b0 = a.b;
    a.m += (s.grave ? G.grave : G.perMin) * min;
    if (!s.grave) a.b += G.beatsPerMin * min;
    plan.quota[i] = { marked: Math.floor(a.m) - Math.floor(m0), beats: Math.floor(a.b) - Math.floor(b0), cumMarked: Math.floor(a.m), cumBeats: Math.floor(a.b) };
  });
  byKey.set(key, plan);
  return plan;
}

// ---------------------------------------------------------------------------
// Text helpers

/** Count to show for a `count` cue: digits 1-5, one..five, first/second/third, or list items after it; fallback 2. */
export function countFromText(text, from = 0, to = text.length) {
  const s = text.slice(Math.max(0, from), Math.max(from, to));
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  let m = s.match(/\b([1-5])\b(?![.,]\d)/);
  if (m) return +m[1];
  m = s.toLowerCase().match(/\b(one|two|three|four|five)\b/);
  if (m) return WORDS[m[1]];
  const low = s.toLowerCase();
  if (/\bthird(ly)?\b/.test(low)) return 3;
  if (/\bsecond(ly)?\b/.test(low)) return 2;
  // a list after the cue: "a, b and c" (figures such as 1,500 are not list separators)
  const items = s.replace(/\d[\d,.]*\d/g, '0').split(/,|;|\band\b/).map((x) => x.trim()).filter((x) => x.length > 1);
  if (items.length >= 2) return Math.max(1, Math.min(5, items.length));
  return 2;
}

function sentenceOf(ctx, char) {
  const S = ctx.sentences;
  for (let i = 0; i < S.length; i++) if (char < S[i].end || i === S.length - 1) return i;
  return 0;
}

/** Index of the word containing / starting at char. */
function wordAt(ctx, char) {
  const W = ctx.words;
  let k = 0;
  for (let i = 0; i < W.length; i++) if (W[i].char <= char) k = i;
  return k;
}

// ---------------------------------------------------------------------------
// The planner of one segment

class SegmentPlan {
  constructor(ctx, R) {
    this.ctx = ctx;
    this.R = R;
    this.events = [];
    this.r = rng((ctx.seed ^ 0x9e3779b9) >>> 0);
    this.sentArm = new Map();
    this.sentAny = new Map();
    this.count = 0;
    this.steeples = 0;
    this.marked = 0; // budgeted statement gestures placed
    this.beats = 0;
    this.busy = 0; // s of budgeted arm movement placed (the hands' rest share)
    this.budget = null;
    this.prev = NO_PREV;
    this.mem = MEM0; // what aired before this segment (programmeMemory)
    this.vis = new Map();
    this.fails = new Set(); // rejection tags of the last placeNear (placeVisible reads them)
  }

  /** The pace budget of this turn (pace.js), within the episode's per-presenter bucket. */
  setBudget(ep) {
    const { ctx, R } = this;
    const G = paceFor(R.pid).gestures;
    const gb = gestureBudget(R.pid, ctx.duration, { grave: ctx.grave });
    const q = ep.quota[ctx.index];
    // the bucket: what this presenter may have used by the end of this segment, minus what their earlier
    // turns used (exact when their plans are known, else their own quotas); never more than one turn allows
    const left = (cum, used, own) => (cum == null ? own : Math.max(0, cum - (used ?? cum - own)));
    const m = q ? left(q.cumMarked, this.prev.usedM, q.marked) : gb.marked;
    const b = q ? left(q.cumBeats, this.prev.usedB, q.beats) : gb.beats;
    this.budget = {
      marked: Math.min(gb.marked, m),
      beats: ctx.grave ? 0 : Math.min(gb.beats, b),
      minGap: G.minGap,
      armGap: Math.max(ARM_GAP_MIN, G.minGap * 0.55),
      busy: (1 - G.rest) * (ctx.duration + (ctx.gapAfter ?? 0.6)),
    };
  }

  lead() {
    const [a, b] = this.R.lead;
    return a === b ? a : a + (b - a) * this.r();
  }

  /** Map, filter and check a gesture name for this segment; returns the name to play or null. */
  admit(name, { structural = false } = {}) {
    const { R, ctx } = this;
    name = R.map[name] || name;
    if (!GESTURES[name] || name === 'look_partner') return null;
    if (R.deny.has(name)) return null;
    if (R.defaultsOnly.has(name) && !structural) return null;
    if (!R.speaker.includes(name) && !(structural && name === 'nod' && R.defaultsOnly.has('nod'))) return null;
    if (ctx.grave && !R.grave.includes(name)) return null;
    const only = R.only[name];
    if (only && !(Array.isArray(only) ? only : [only]).includes(whereOf(ctx))) return null;
    if (name === 'glasses' && !lookFor(ctx.speakerId).glasses) return null;
    return name;
  }

  /** Event for `name` with its apex on word index wi; null when a rule forbids it. */
  tryAt(name, wi, opts = {}) {
    const { ctx, R } = this;
    const w = ctx.words[wi];
    if (!w) return null;
    const ev = { kind: 'gesture', slot: ctx.speaker, name, char: w.char };
    const variant = opts.variant || R.variants[name];
    if (variant && GESTURES[name].variants?.[variant]) ev.variant = variant;
    if (name === 'count') ev.n = opts.n ?? countFromText(ctx.seg.text, w.char, ctx.sentences[sentenceOf(ctx, w.char)].end);
    // chin while speaking: a brief touch; the long thinking pose only on the question or held into the pause
    if (name === 'chin' && !opts.variant) {
      const full = GESTURES.chin;
      const q = ctx.question && sentenceOf(ctx, w.char) === sentenceOf(ctx, ctx.question.char);
      if (!q && w.t + (full.hold - full.apex) < ctx.duration - 0.2) ev.variant = 'touch';
    }
    let amp = opts.amp ?? R.amp;
    if (ctx.grave) amp = GRAVE_AMP[0] + (GRAVE_AMP[1] - GRAVE_AMP[0]) * this.r();
    if (amp < 1) ev.amp = Math.round(amp * 100) / 100;
    if (opts.speed && opts.speed !== 1) ev.speed = opts.speed;
    if (opts.beat) ev.beat = true;
    const d = defOf(ev);
    const rate = rateOf(ev);
    const apex = d.apex / rate, stroke = d.stroke / rate, dur = d.dur / rate;
    // stroke starts `lead` before the word; the apex lands within ±0.1 s of it
    const lead = opts.lead ?? this.lead();
    const offset = Math.max(-0.095, Math.min(0.095, apex - stroke - lead));
    ev.at = w.t + offset - apex;
    if (opts.atOverride != null) ev.at = opts.atOverride;
    if (ev.at < 0) return null;
    ev.apexAt = ev.at + apex;
    ev.word = w.char;
    ev.dur = dur;
    return this.check(ev, d, opts) ? ev : null;
  }

  check(ev, d, opts) {
    const { ctx, R } = this;
    const arm = d.arm;
    const budgeted = !opts.free || opts.beat; // statements and beats; structural nods and papers are not
    // cut guard: no start inside the first cutGuard s of a shot, and no cut before the apex
    for (const c of ctx.shots || []) {
      if (ev.at >= c.at && ev.at < c.at + ctx.cutGuard) return why(ev, 'cut-guard');
      if (c.at > ev.at && c.at < ev.apexAt + 0.1) return why(ev, 'cut-before-apex');
    }
    // the apex must be seen: not under a picture, map or card
    if (ctx.shots && ctx.shots.length && HIDDEN.has(shotAt(ctx, ev.apexAt))) return why(ev, 'hidden-shot');
    // a gesture may run a little into the pause after the segment, not into the next one; at a hand-over
    // its release may settle while the partner starts (the speaker's own next gesture is a turn away)
    const over = ctx.duration + (ctx.gapAfter ?? 0.8);
    if (ev.at + ev.dur > over + (ctx.handover ? 1.0 : 0.4) || ev.at + d.hold / rateOf(ev) > over + 0.4) return why(ev, 'runs-over');
    // never two gestures at once (a settle overlap is fine); a beat also leaves a little air around it
    const air = ev.beat ? -BEAT_AIR : SETTLE;
    for (const p of this.events) if (ev.at < p.at + p.dur - air && p.at < ev.at + ev.dur - air) return why(ev, 'overlap');
    const si = sentenceOf(ctx, ev.word);
    if (arm && (this.sentArm.get(si) || 0) >= 1) return why(ev, 'sentence-arm');
    if (R.B.perSentence && (this.sentAny.get(si) || 0) >= R.B.perSentence) return why(ev, 'sentence-any');
    // figures land on still arms (MONEY MINUTE)
    if (R.B.figureGuard) for (const f of ctx.figures || []) if (Math.abs(f.t - ev.apexAt) <= R.B.figureGuard) return why(ev, 'figure');
    // COSMOS: one arm gesture per 6 s per presenter (inside the segment, and the episode estimate)
    if (arm && R.B.armSpacing) {
      for (const p of this.events) if (p.arm && Math.abs(p.at - ev.at) < R.B.armSpacing) return why(ev, 'cosmos-6s');
      if (ev.at < (this.ep.armMinAt[ctx.index] || 0)) return why(ev, 'cosmos-episode');
    }
    if (!opts.free && this.count >= R.cap) return why(ev, 'cap');
    // TECH BYTES: arm movements per segment, beats included, at most the cap + capBeats
    if (opts.beat && arm && R.B.capBeats != null) {
      let n = 0;
      for (const p of this.events) if (p.arm && p.name !== 'papers') n++;
      if (n >= R.cap + R.B.capBeats) return why(ev, 'cap-beat');
    }
    // meaning: a head shake, a shrug or the glasses need their words
    if (!semanticOk(ctx, ev)) return why(ev, 'meaning');
    // a beat must move enough to be seen in its shot (else it is not worth a slot nor the budget)
    if (opts.beat && arm && beatPx(ctx, ev, d) < MIN_BEAT_PX) return why(ev, 'too-small');
    // variety on air: the programme's memory of marked arm gestures (both presenters)
    if (arm && !opts.beat && (!opts.free || opts.statement) && !this.fresh(ev)) return false;
    // pace.js budget: marked gestures and beats per turn, minGap between statements, ARM_GAP between any
    // two arm movements of this speaker (also across the previous turns), the hands' rest share
    const B = this.budget;
    if (B && budgeted) {
      if (opts.beat ? this.beats >= B.beats : arm && this.marked >= B.marked) return why(ev, 'budget');
      if (!opts.beat && arm) {
        if (ev.at + this.prev.marked < B.minGap) return why(ev, 'min-gap-prev');
        for (const p of this.events) if (p.marked && Math.abs(p.at - ev.at) < B.minGap) return why(ev, 'min-gap');
      }
      // head statements (a filler nod, lean_in, a head shake) are not arm strokes: their own, shorter gap
      if (!opts.beat && !arm) for (const p of this.events) if (!p.arm && p.budgeted && Math.abs(p.at - ev.at) < HEAD_GAP) return why(ev, 'head-gap');
      if (arm) {
        if (ev.at + this.prev.arm < B.armGap) return why(ev, 'arm-gap-prev');
        for (const p of this.events) if (p.arm && p.budgeted && Math.abs(p.at - ev.at) < B.armGap) return why(ev, 'arm-gap');
        if (this.busy + ev.dur > B.busy) return why(ev, 'rest-share');
      }
    }
    // the vocabulary (pace.js gestures.vocabWindow, critic r3): by NAME, the way the viewer reads it (a hand rising
    // is a hand rising, box, lift or beat), never the same gesture as the presenter's neighbouring one, and a
    // statement's name not within the presenter's last vocabWindow gestures, across turns (nods are the
    // newsreader's default and do not count)
    if (ev.name !== 'nod' && !this.nameOk(ev, !opts.beat && ev.name !== 'papers')) return false;
    // the viewer must see the hands: an arm gesture's apex hand inside the framing of its shot
    if (arm && !this.visible(ev, d)) return why(ev, 'not-visible');
    // never the same gesture twice in a row (name and variant), whatever planned it
    // (for an arm gesture: nor the arm gestures around it, a nod in between does not make it new)
    const key = keyOf(ev);
    let before = null, after = null, bArm = null, aArm = null;
    for (const p of this.events) {
      if (p.at <= ev.at && (!before || p.at > before.at)) before = p;
      if (p.at > ev.at && (!after || p.at < after.at)) after = p;
      if (arm && p.arm && p.at <= ev.at && (!bArm || p.at > bArm.at)) bArm = p;
      if (arm && p.arm && p.at > ev.at && (!aArm || p.at < aArm.at)) aArm = p;
    }
    if ((before && keyOf(before) === key) || (after && keyOf(after) === key)) return why(ev, 'repeat');
    if ((bArm && keyOf(bArm) === key) || (aArm && keyOf(aArm) === key)) return why(ev, 'repeat');
    // ...nor as the first arm gesture of a turn when the presenter's previous turn ended on it
    if (arm && this.avoidFirst === key && !this.events.some((p) => p.arm && p.at < ev.at)) return why(ev, 'repeat-turn');
    if (ev.name === 'steeple' && R.B.steeplePerStory && this.steeples >= R.B.steeplePerStory) return why(ev, 'steeple-story');
    return true;
  }

  /**
   * A marked arm gesture is new on air: not the family of the last marked gesture that aired (either
   * presenter, this segment or the memory), not the same family within REPEAT_GAP s, and the full
   * palm-out raise_hand at most RAISE_CAP times per presenter per episode.
   */
  fresh(ev) {
    const fam = keyOf(ev);
    const mem = this.mem;
    if (fam === 'raise_hand') {
      let n = mem.raised[this.ctx.speaker] || 0;
      for (const p of this.events) if (p.aired && keyOf(p) === 'raise_hand') n++;
      if (n >= RAISE_CAP) return why(ev, 'raise-cap');
    }
    const cap = FAMILY_CAP[fam];
    if (cap) {
      let n = (mem.counts || {})[`${this.ctx.speaker}|${fam}`] || 0;
      for (const p of this.events) if (p.aired && keyOf(p) === fam) n++;
      if (n >= cap) return why(ev, 'family-cap');
      // the second wall reference is the open hand, not the index again
      if (fam === 'point_screen' && n >= 1 && !ev.variant) return why(ev, 'family-second');
    }
    let last = null;
    for (const p of this.events) if (p.aired && p.at <= ev.at && (!last || p.at > last.at)) last = p;
    const prevFam = last ? keyOf(last) : mem.recent.length ? mem.recent[mem.recent.length - 1].fam : null;
    if (prevFam === fam) return why(ev, 'repeat-air');
    const abs = mem.t0 + ev.at;
    for (const r of mem.recent) if (r.fam === fam && abs - r.abs < REPEAT_GAP) return why(ev, 'repeat-45');
    for (const p of this.events) if (p.aired && keyOf(p) === fam && Math.abs(p.at - ev.at) < REPEAT_GAP) return why(ev, 'repeat-45');
    return true;
  }

  /**
   * The presenter's sequence of non-nod gestures (the previous turns' tail, then this segment's in time
   * order) with `ev` inserted: its neighbours never share its name; a statement never shares its name with
   * the vocabWindow gestures before it, nor with a later statement that has it inside its own window.
   */
  nameOk(ev, statement) {
    const W = paceFor(this.R.pid).gestures.vocabWindow || 3;
    const seq = this.prev.names.slice();
    const mine = this.events.filter((p) => p.kind === 'gesture' && p.name !== 'nod').sort((a, b) => a.at - b.at);
    let idx = seq.length;
    for (const p of mine) {
      if (p.at <= ev.at) idx++;
      seq.push({ name: p.name, marked: !p.beat && p.name !== 'papers' });
    }
    seq.splice(idx, 0, { name: ev.name, marked: statement });
    if (seq[idx - 1]?.name === ev.name || seq[idx + 1]?.name === ev.name) return why(ev, 'repeat-name');
    for (let j = Math.max(0, idx - W); j < idx; j++) if (statement && seq[j].name === ev.name) return why(ev, 'name-window');
    for (let j = idx + 1; j <= idx + W && j < seq.length; j++) if (seq[j].marked && seq[j].name === ev.name) return why(ev, 'name-window');
    return true;
  }

  /** handsVisible, memoised per definition, shot and amp step (the planner tries many words). */
  visible(ev, d) {
    const cut = cutAt(this.ctx, ev.apexAt);
    const ak = ev.amp == null ? 10 : Math.round(Math.max(0.5, Math.min(1, ev.amp)) * 10);
    let byD = this.vis.get(d);
    if (!byD) this.vis.set(d, (byD = new Map()));
    const key = (cut ? this.ctx.shots.indexOf(cut) + 1 : 0) * 16 + ak;
    let v = byD.get(key);
    if (v === undefined) byD.set(key, (v = handsVisible(this.ctx, ev, d)));
    return v;
  }

  commit(ev, opts = {}) {
    const d = defOf(ev);
    ev.arm = d.arm;
    ev.budgeted = !opts.free || !!opts.beat;
    ev.marked = !opts.free && !opts.beat && d.arm; // pace.js "marked": arm strokes on meaningful words
    // what the programme's variety memory keeps: marked strokes and the bible's own statement moments
    // outside the budget (the glasses on the question)
    ev.aired = ev.marked || (!!opts.statement && d.arm);
    this.events.push(ev);
    const si = sentenceOf(this.ctx, ev.word);
    if (d.arm) this.sentArm.set(si, (this.sentArm.get(si) || 0) + 1);
    this.sentAny.set(si, (this.sentAny.get(si) || 0) + 1);
    // beats are delivery (owner 20:40), not the bible's cue-level gestures: they do not use its caps
    if (!ev.beat) {
      this.count++;
      if (ev.name === 'steeple') this.steeples++;
    }
    if (ev.marked) this.marked++;
    if (opts.beat) this.beats++;
    if (ev.budgeted && d.arm) this.busy += ev.dur;
    return ev;
  }

  /**
   * Place `name` on the nearest stressed word at or after `char` in the same sentence (then the
   * following stressed words of that sentence; `spill` lets fillers try later sentences too).
   */
  placeNear(name, char, opts = {}) {
    const { ctx } = this;
    const si = sentenceOf(ctx, char);
    const S = ctx.sentences[si];
    const W = ctx.words;
    const tried = [];
    for (let i = wordAt(ctx, char); i < W.length; i++) {
      if (W[i].char < char && !(W[i].end > char)) continue;
      if (!opts.spill && W[i].char >= S.end) break;
      if (W[i].stressed) tried.push(i);
    }
    // `early`: the first content word of the sentence part comes first (the glasses touch as the question starts)
    if (opts.early) {
      // (in order: the first one late enough to leave room for the reach wins)
      const early = [];
      for (let i = wordAt(ctx, char); i < W.length && W[i].char < S.end; i++) if (W[i].char >= char && W[i].content && !tried.includes(i)) early.push(i);
      tried.unshift(...early);
    }
    // no stressed word left: the content word nearest after the cue
    if (!tried.length) {
      for (let i = wordAt(ctx, char); i < W.length && W[i].char < S.end; i++) if (W[i].content) {
        tried.push(i);
        break;
      }
    }
    this.fails.clear();
    FAILS.set = this.fails;
    for (const wi of tried) {
      const ev = this.tryAt(name, wi, opts);
      if (ev) {
        FAILS.set = null;
        return this.commit(ev, opts);
      }
    }
    FAILS.set = null;
    return null;
  }

  /**
   * A statement gesture (the writer's cue, a filler) that cannot air as written (the viewer would not see
   * it in this shot, or it would repeat what just aired) gives way, on the same words, to a variant of the
   * same action that reads there (steeple → steeple:tap...), then to a seeded rotation of the allowed
   * chest-level statements, then (`head`) to a head beat; nothing when none fits.
   */
  placeVisible(name, char, opts = {}, { head = true } = {}) {
    const ev = this.placeNear(name, char, opts);
    if (ev || !defOf({ name, variant: opts.variant })?.arm) return ev;
    const why0 = new Set(this.fails);
    const sentence = this.ctx.sentences[sentenceOf(this.ctx, char)];
    for (const [alt, variant] of this.alternatives(name, sentence, char)) {
      const e = this.placeNear(alt, char, { ...opts, variant });
      if (e) return e;
      for (const f of this.fails) why0.add(f);
    }
    // the words still deserve a beat of the head when the hands could not show or would only repeat
    if (head && ['not-visible', 'repeat-air', 'repeat-45', 'raise-cap', 'family-cap', 'repeat-name', 'name-window'].some((f) => why0.has(f))) {
      for (const h of ['nod', 'lean_in']) {
        if (this.admit(h) !== h) continue;
        if (h === 'lean_in' && this.R.B.leanInPerEpisode && this.ep.leanIn !== this.ctx.index) continue;
        const e = this.placeNear(h, char, { ...opts, variant: h === 'nod' ? this.R.variants.nod || 'single' : undefined });
        if (e) return e;
      }
    }
    return null;
  }

  /** Substitutes for `name` on this sentence: its own readable variants first, then a seeded chest-level rotation. */
  alternatives(name, sentence, char) {
    const out = [];
    const ok = (alt, variant) => {
      if (this.admit(alt) !== alt) return false;
      if (variant && !GESTURES[alt].variants?.[variant]) return false;
      if (alt === 'point_screen' && !pictureFollows(this.ctx, this.ctx.timeAt(char) + 0.6)) return false;
      if (alt === 'count' && !NUMBERISH.test(sentence.text || '')) return false;
      return !out.some(([a, v]) => a === alt && v === variant);
    };
    for (const v of SAME_ACTION[name] || []) if (ok(name, v)) out.push([name, v]);
    const r = rng((hashSeed(`${this.ctx.episodeId}|${this.ctx.index}|${char}|alt`) ^ this.ctx.episodeSeed) >>> 0);
    const rot = CHEST.slice();
    for (let i = rot.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [rot[i], rot[j]] = [rot[j], rot[i]];
    }
    for (const [alt, v] of rot) if (!(alt === name && v == null) && ok(alt, v)) out.push([alt, v]);
    // the full palm-out raise is the loudest of them: only when nothing quieter reads here
    if (name !== 'raise_hand' && ok('raise_hand', null)) out.push(['raise_hand', null]);
    return out;
  }
}

/** Debug hook for tools (labs, stats): rejection reasons of the last plans when DEBUG.on. */
// errors: planner faults that were contained (a neighbour plan, the camera API), counted and logged once
export const DEBUG = { on: false, log: [], errors: 0 };
const FAILS = { set: null };
function why(ev, tag) {
  if (FAILS.set) FAILS.set.add(tag);
  if (DEBUG.on && DEBUG.log.length < 5000) DEBUG.log.push(`${ev.name}:${ev.variant || ''} ${ev.at.toFixed(2)} ${tag}`);
  return false;
}
const LOGGED = new Set();
function fault(where, err) {
  DEBUG.errors++;
  const msg = `${where}: ${err?.message || err}`;
  if (LOGGED.has(msg)) return;
  if (LOGGED.size > 100) LOGGED.clear();
  LOGGED.add(msg);
  try {
    console.warn(`[v2 gestures] ${msg}`);
  } catch {
    /* no console */
  }
}

/** Readable variants of the same action, tried first when a statement cannot air as written. */
const SAME_ACTION = { steeple: ['tap'], raise_hand: ['lift', 'box'], point_screen: ['open'], chin: ['touch'] };
/** Statements whose hands read in a head-and-shoulders single (chest and face level), rotated per sentence. */
// (the full palm-out raise_hand is not in the rotation: alternatives() offers it last)
const CHEST = [['steeple', 'tap'], ['raise_hand', 'lift'], ['raise_hand', 'box'], ['point_screen', 'open'], ['count', null], ['chin', 'touch']];
const NUMBERISH = /\d|\b(one|two|three|four|five|first|second|third)\b|,/i;
const NO_PREV = Object.freeze({ marked: Infinity, arm: Infinity, fam: null, usedM: 0, usedB: 0, names: Object.freeze([]) });
const MEM0 = Object.freeze({ t0: 0, recent: Object.freeze([]), raised: Object.freeze({}), counts: Object.freeze({}) });

// ---------------------------------------------------------------------------

// What the previous turns of the same presenter left behind, from their own plans (with the camera's
// cuts, so they are the plans that air): the family of the last arm gesture (the next turn never
// opens on it: owner 20:40 "never the same gesture twice in a row") and how long before this
// segment's first word their last statement and their last arm movement started (pace.js minGap and
// ARM_GAP hold across segments). Pure functions of the episode, memoised per neighbour context object.
const TURN = new WeakMap(); // neighbour context → { evs, dur, gap } | null
function turnOf(c) {
  if (TURN.has(c)) return TURN.get(c);
  TURN.set(c, null); // guard: a turn never depends on itself
  let out = null;
  try {
    const cc = Object.create(c); // the shared neighbour context stays read-only
    cc.shots = cutsOf(c);
    const P = planInternal(cc).P;
    out = P
      ? { evs: P.events, usedM: (P.prev.usedM ?? 0) + P.marked, usedB: (P.prev.usedB ?? 0) + P.beats, mem: memoryAfter(P) }
      : { evs: [], usedM: null, usedB: null, mem: carryMemory(c) };
  } catch (err) {
    fault('neighbour plan', err);
    out = null;
  }
  TURN.set(c, out);
  return out;
}

// The programme's memory of what aired (owner 20:40 "repetitive"; critics r2: both anchors ending up on
// the same raise_hand back to back). Each segment's plan carries forward the marked arm gestures of the
// last MEMORY_SPAN s, whoever performed them, with their time on the episode clock, and how many full
// raise_hands each presenter has used; the next segment reads it from its predecessor's plan (one
// neighbour, memoised), so the whole running order is remembered at the cost of one plan per segment.
function memoryBefore(ctx) {
  if (!(ctx.index > 0) || typeof ctx.contextAt !== 'function') return MEM0;
  const c = ctx.contextAt(ctx.index - 1);
  if (!c || !c.valid) return MEM0;
  const t = turnOf(c);
  if (!t || !t.mem) return MEM0;
  return { t0: t.mem.t0 + c.duration + (c.gapAfter ?? 0.7), recent: t.mem.recent, raised: t.mem.raised, counts: t.mem.counts };
}

/** The memory at the end of a planned segment: what came before plus its own marked arm gestures. */
function memoryAfter(P) {
  const m = P.mem;
  const end = m.t0 + P.ctx.duration;
  // the last MEMORY_SPAN s, and always the latest one (never the same family twice in a row on air)
  const recent = m.recent.filter((r, i) => end - r.abs <= MEMORY_SPAN || i === m.recent.length - 1);
  let raised = m.raised, counts = m.counts;
  for (const e of P.events.slice().sort((a, b) => a.at - b.at)) {
    if (!e.aired) continue;
    const fam = familyOf(e);
    recent.push({ fam, abs: m.t0 + e.at, slot: e.slot });
    if (fam === 'raise_hand') raised = { ...raised, [e.slot]: (raised[e.slot] || 0) + 1 };
    if (FAMILY_CAP[fam]) counts = { ...counts, [`${e.slot}|${fam}`]: (counts[`${e.slot}|${fam}`] || 0) + 1 };
  }
  return { t0: m.t0, recent, raised, counts };
}

/** A segment with no plan of its own (no words, invalid) passes the memory on unchanged. */
function carryMemory(c) {
  const m = memoryBefore(c);
  return { t0: m.t0, recent: m.recent, raised: m.raised, counts: m.counts };
}

function previousTurns(ctx) {
  if (typeof ctx.contextAt !== 'function') return NO_PREV;
  const segs = ctx.episode.segments || [];
  const me = ctx.seg.anchor;
  let elapsed = 0; // s from the start of segment j to this segment's first word
  let marked = Infinity, arm = Infinity, fam = null, usedM = 0, usedB = 0, first = true;
  // the presenter's last non-nod gesture names, newest first (pace.js vocabWindow)
  const names = [];
  const W = paceFor(ctx.programId).gestures.vocabWindow || 3;
  // the presenter's recent turns, back to the last one with an arm gesture (at most four) and at least
  // 12 s (the other presenter's lines between them are estimated from the summary: their exact
  // timelines are not needed and would cost a context each), and far enough for the vocabulary window
  for (let j = ctx.index - 1, own = 0; j >= 0 && (own < 4 ? fam === null || elapsed <= 12 || names.length < W : own < 10 && names.length < W); j--) {
    if (segs[j]?.anchor !== me) {
      elapsed += (segs[j]?.chars || 0) / CPS + 0.7;
      continue;
    }
    const c = ctx.contextAt(j);
    if (!c || !c.valid) break;
    own++;
    elapsed += c.duration + (c.gapAfter ?? 0.7);
    const t = turnOf(c);
    if (first) {
      // what this presenter used so far (the most recent turn carries the running total)
      usedM = t ? t.usedM : null;
      usedB = t ? t.usedB : null;
      first = false;
    }
    if (!t) continue;
    let last = null;
    for (const e of t.evs) {
      if (e.marked) marked = Math.min(marked, elapsed - e.at);
      if (e.arm && e.budgeted) arm = Math.min(arm, elapsed - e.at);
      if (e.arm && (!last || e.at > last.at)) last = e;
    }
    if (last && fam === null) fam = familyOf(last);
    if (names.length < W) {
      const own2 = t.evs.filter((e) => e.kind === 'gesture' && e.name !== 'nod').sort((a, b) => b.at - a.at);
      for (const e of own2) if (names.length < W) names.push({ name: e.name, marked: !e.beat && e.name !== 'papers' });
    }
  }
  // (oldest first, like the segment's own sequence)
  return { marked, arm, fam, usedM, usedB, names: names.reverse() };
}

// the cuts of a segment as planSegment hands them to the planners, with their framing
const CUTS = new WeakMap();
function cutsOf(c) {
  let v = CUTS.get(c);
  if (!v) {
    v = planShots(c).filter((e) => e.kind === 'shot').map((e) => ({ at: e.at, char: e.char, shot: e.shot, focus: e.focus, framing: e.framing ?? null }));
    CUTS.set(c, v);
  }
  return v;
}

/** @returns planned gesture and emotion events for the speaker (emotions for any slot) */
export function planGestures(ctx) {
  return planInternal(ctx).out;
}

function planInternal(ctx) {
  const out = [];
  if (!ctx || !ctx.seg) return { out, P: null };
  const cues = Array.isArray(ctx.seg.cues) ? ctx.seg.cues : [];
  // the writer's emotion cues change the face of whoever they name
  for (const cue of cues) {
    if (!cue || !cue.emotion) continue;
    const slot = cue.slot && cue.slot in ctx.cast ? cue.slot : ctx.speaker;
    out.push({ kind: 'emotion', slot, name: cue.emotion, char: cue.char, at: Math.max(0, ctx.timeAt(cue.char) - 0.25) });
  }
  if (!ctx.valid || !ctx.words || !ctx.words.length || !ctx.speaker) return { out, P: null };
  const R = rulesFor(ctx);
  const P = new SegmentPlan(ctx, R);
  P.ep = episodePlan(ctx);
  P.prev = previousTurns(ctx);
  P.mem = memoryBefore(ctx);
  P.avoidFirst = P.prev.fam;
  P.setBudget(P.ep);
  const B = R.B;
  const text = ctx.seg.text;
  const where = whereOf(ctx);
  const n60 = R.pid === 'news-60';

  // ---- NEWS IN 60: only the episode's two allocated gestures
  if (n60) {
    const want = P.ep.n60[ctx.index];
    for (const name of Array.isArray(want) ? want : want ? [want] : []) {
      if (name === 'papers') continue; // after the sign-off, below
      const ok = P.admit(name, { structural: true });
      if (ok) placeFirst(P, ok, { free: true });
    }
    if ((Array.isArray(want) ? want : [want]).includes('papers') && P.admit('papers', { structural: true })) papersAfter(P);
    return { out: out.concat(finish(P)), P };
  }

  // ---- greeting nod (the presenter's first turn in the opening)
  if (B.greeting !== false && (P.ep.greet[ctx.index] || ctx.type === 'intro') && P.admit('nod', { structural: true })) {
    const m = text.match(/\b(good (evening|morning|afternoon|night)|welcome|hello)\b/i) || text.match(/\bI'?m\b|\bI am\b/);
    const char = m ? m.index : ctx.sentences[ctx.sentences.length - 1]?.start || 0;
    P.placeNear('nod', char, { variant: R.variants.nod || 'single', spill: true, free: true });
  } else if (ctx.type === 'intro' || ctx.type === 'outro') {
    // the programmes' default for intro and outro is a nod
    const dflt = R.policy?.defaults?.[ctx.type];
    if (dflt && ctx.type === 'intro' && P.admit(dflt, { structural: true })) placeFirst(P, dflt, { free: true });
  }

  // ---- the writer's cues for the speaker (hints, already filtered by the server's policy)
  const greeted = P.events.some((e) => e.name === 'nod');
  for (const cue of cues) {
    if (!cue || !cue.action) continue;
    if (cue.slot && cue.slot !== ctx.speaker) continue; // listener business (FACES)
    const name = P.admit(cue.action);
    if (!name || (name === 'papers' && B.signoffPapers)) continue;
    if (name === 'nod' && greeted) continue; // one greeting nod, not two
    if (name === 'point_screen' && !pictureFollows(ctx, ctx.timeAt(cue.char) + 0.6)) continue;
    if (name === 'lean_in' && B.leanInPerEpisode && P.ep.leanIn !== ctx.index) continue;
    P.placeVisible(name, cue.char, {});
  }

  // ---- TECH BYTES / COSMOS: a presenter who wears glasses may touch them as her question starts
  // (the bible's own moment, like the greeting: outside the pace budget, inside the variety memory)
  if (ctx.question && R.speaker.includes('glasses') && P.admit('glasses') && P.r() < 0.7) P.placeNear('glasses', ctx.question.char, { early: true, free: true, statement: true });

  // ---- sign-off: a nod on the last stressed word, then the papers in the hold
  if (ctx.type === 'outro') {
    if (P.admit('nod', { structural: true }) && !P.events.some((e) => e.name === 'nod')) {
      const last = ctx.sentences[ctx.sentences.length - 1];
      P.placeNear('nod', last ? last.start : 0, { variant: R.variants.nod || 'single', spill: true, free: true });
    }
    if (B.signoffPapers && P.admit('papers', { structural: true })) papersAfter(P);
  }

  // ---- WORLD NOW hand-over on the wide: an "after you" open palm on the last stressed word
  if (B.handover && ctx.duo && ctx.handover && !ctx.grave && shotAt(ctx, ctx.duration - 0.8) === 'wide' && P.r() < 0.6) {
    const name = P.admit('point_partner');
    const last = ctx.sentences[ctx.sentences.length - 1];
    if (name && last) P.placeNear(name, last.start, { variant: 'after_you', amp: 0.9, spill: true });
  }

  // ---- chat and AND FINALLY: a dry shrug or head shake on the dry line, now and then
  const lighter = ctx.feature === 'lighter';
  if ((ctx.type === 'chat' || lighter) && B.chat && ctx.dryLine && P.r() < 0.55) {
    // the one whose meaning the dry line carries (a head shake needs a negation, a shrug some doubt)
    const k = Math.floor(P.r() * B.chat.length);
    for (let q = 0; q < B.chat.length; q++) {
      const name = P.admit(B.chat[(k + q) % B.chat.length]);
      if (name && P.placeNear(name, ctx.dryLine.char, { variant: name === 'shrug' ? 'small' : undefined })) break;
    }
  }

  // ---- stories: seeded fillers from the programme's pool, 1-2 per story
  if (ctx.type === 'story' && ctx.feature !== 'roundup') fillStory(P, ctx, R);

  // ---- MONEY MINUTE / tech / cosmos: a chat or intro may carry one listed gesture too
  if ((ctx.type === 'chat' || ctx.type === 'intro') && R.pid !== 'world-now' && P.count < R.cap && P.r() < 0.4) fillStory(P, ctx, R, 1);

  // ---- owner 20:40: small motivated beats on most other sentences of light and neutral segments
  addBeats(P, ctx, R);

  return { out: out.concat(finish(P)), P };
}

// ---------------------------------------------------------------------------
// Beats (owner 20:40: "few gestures, repetitive" → motivated gestures on most sentences of light and
// neutral stories, rotated, never twice in a row, adult and restrained; grave: none)

const CONTRAST = /\b(but|however|yet|although|though|instead|despite|except|whereas|meanwhile)\b/i;
const SCALE = /\b(all|every|whole|entire|across|nationwide|worldwide|record|biggest|largest|most|millions?|billions?|thousands?|everyone|everywhere)\b/i;
const STEADY = /\b(still|steady|steadily|unchanged|remains?|remained|calm|for now|so far|held|holds|stable|flat)\b/i;
const LIST = /\b(first|second|third|also|another|both|either|plus)\b|,[^,]+,/i;
// beats the far hand may take (the desk-level tick and settle of the far hand hardly show in any shot)
const FAR_OK = new Set(['raise_hand:beat', 'raise_hand:offer', 'raise_hand:turn', 'raise_hand:lift']);

/** The speaker's beat settings in this programme ({ density, variants }) or null. */
export function beatConfig(R, id) {
  const b = R.B.beats;
  if (!b) return null;
  if (b.variants) return b;
  return (id && b[id]) || null;
}

/**
 * The rotation of beat variants for one presenter across the episode: position p (the speaker's
 * running sentence count) → variant, a seeded shuffle per lap whose first item never repeats the
 * previous lap's last, so consecutive positions never hold the same variant.
 */
export function beatAt(ctx, pool, p) {
  const n = pool.length;
  if (n === 1) return pool[0];
  const lapOf = (L) => {
    const r = rng((hashSeed(`${ctx.episodeId}|${ctx.speaker}|beats|${L}`) ^ ctx.episodeSeed) >>> 0);
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const L = Math.floor(p / n), k = p - L * n;
  const lap = lapOf(L);
  if (L > 0 && n >= 2) {
    const prevLast = lapOf(L - 1)[n - 1];
    if (lap[0] === prevLast) [lap[0], lap[1]] = [lap[1], lap[0]];
  }
  return lap[k];
}

/** The speaker's running sentence position at the start of this segment (an upper bound: ~18 chars a sentence at least). */
function sentenceOffset(ctx) {
  const segs = ctx.episode.segments || [];
  const me = ctx.seg.anchor;
  let n = 0;
  for (let i = 0; i < ctx.index && i < segs.length; i++) if (segs[i].anchor === me) n += Math.ceil((segs[i].chars || 0) / 18) + 1;
  return n;
}

function addBeats(P, ctx, R) {
  const cfg = beatConfig(R, ctx.speakerId);
  if (!cfg || ctx.grave) return;
  const kind = ctx.type === 'story' ? (ctx.feature === 'roundup' ? null : 'story') : ctx.type;
  const density = (kind && cfg.density[kind]) || 0;
  if (density <= 0) return;
  const pool = cfg.variants.filter((v) => {
    const [name, variant] = v.split(':');
    return P.admit(name) === name && GESTURES[name].variants?.[variant];
  });
  if (!pool.length) return;
  const r = rng((ctx.seed ^ 0x51ed270b) >>> 0); // its own stream: beats never shift the other choices
  const S = ctx.sentences, W = ctx.words;
  const base = sentenceOffset(ctx);
  for (let si = 0; si < S.length; si++) {
    const sent = S[si];
    const roll = r(), pickAmp = r(), pickSpeed = r(), pickHand = r();
    if ((P.sentArm.get(si) || 0) >= 1) continue;
    if (sent.t1 - sent.t0 < 1.3 || roll > density) continue;
    // anchor candidates: the sentence's stressed words, the most emphatic first
    const cands = [];
    for (let i = 0; i < W.length; i++) if (W[i].char >= sent.start && W[i].char < sent.end && W[i].stressed) cands.push(i);
    if (!cands.length) continue;
    cands.sort((a, b) => (W[b].emph || 0) - (W[a].emph || 0) || a - b);
    // motivated choices first (a contrast opens the palm, scale frames it with both hands), then the rotation
    const prefs = [];
    const text = sent.text || ctx.seg.text.slice(sent.start, sent.end);
    const mC = CONTRAST.exec(text), mS = SCALE.exec(text), mT = STEADY.exec(text), mL = LIST.exec(text);
    const want = (v, m) => {
      if (m && pool.includes(v)) prefs.push([v, sent.start + m.index]);
    };
    // a contrast opens or turns the palm, scale frames it with both hands, an enumeration ticks, a
    // "still / unchanged" settles the hand on the desk; the order inside each pair rotates per sentence
    const alt = (base + si) & 1;
    want(alt ? 'raise_hand:turn' : 'raise_hand:offer', mC);
    want(alt ? 'raise_hand:offer' : 'raise_hand:turn', mC);
    want(alt ? 'raise_hand:box' : 'raise_hand:beat2', mS);
    want(alt ? 'raise_hand:beat2' : 'raise_hand:box', mS);
    want('raise_hand:tick', mL);
    want('raise_hand:settle', mT);
    if (/\?\s*$/.test(text) && pool.includes('shrug:small')) prefs.push(['shrug:small', sent.start]);
    const rot = beatAt(ctx, pool, base + si);
    prefs.push([rot, -1]);
    for (const v of pool) if (v !== rot) prefs.push([v, -1]);
    const amp = Math.round((0.82 + 0.18 * pickAmp) * (R.amp < 1 ? R.amp : 1) * 100) / 100;
    const speed = [0.92, 1, 1.08][Math.floor(pickSpeed * 3)];
    let done = false;
    // a third of the one-handed beats use the far hand (a presenter has two hands)
    const far = pickHand < 0.34;
    for (const [v, from] of prefs) {
      const [name, v0] = v.split(':');
      const variant = far && FAR_OK.has(v) ? `${v0}_far` : v0;
      const order = from < 0 ? cands : cands.filter((i) => W[i].char >= from).concat(cands.filter((i) => W[i].char < from));
      for (const wi of order) {
        const opts = { variant, amp, speed, free: true, beat: true };
        const ev = P.tryAt(name, wi, opts);
        if (ev) {
          P.commit(ev, opts);
          done = true;
          break;
        }
      }
      if (done) break;
    }
    // no hand beat reads here (the shot hides the desk or the subtitle covers the chest): the stressed
    // word still gets a small beat of the head, the newsreader's own default
    if (!done && P.admit('nod') === 'nod') {
      for (const wi of cands) {
        const opts = { variant: R.variants.nod || 'single', amp, free: true, beat: true };
        const ev = P.tryAt('nod', wi, opts);
        if (ev) {
          P.commit(ev, opts);
          break;
        }
      }
    }
  }
}

/** Seeded fillers for a story (or `max` of them elsewhere), never repeating the previous turn's first choice. */
function fillStory(P, ctx, R, max = null) {
  const B = R.B;
  const [lo, hi] = B.storyCount || [1, 2];
  let want = max ?? (lo + Math.floor(P.r() * (hi - lo + 1)));
  if (ctx.duration < 4) want = Math.min(want, 1);
  want = Math.min(want, R.cap - P.count, (B.perStory ?? Infinity) - P.count);
  if (want <= 0) return;
  let pool = (B.story || R.speaker).filter((n) => P.admit(n));
  if (B.story && P.admit('point_screen') && R.speaker.includes('point_screen')) pool.push('point_screen');
  // the glasses belong to the question (planned there), never a filler
  if (!B.story) pool = R.speaker.filter((n) => P.admit(n) && n !== 'papers' && n !== 'glasses');
  if (B.leanInPerEpisode && P.ep.leanIn !== ctx.index) pool = pool.filter((n) => n !== 'lean_in');
  if (!pool.length) return;
  // seeded preference order; the first choice differs from the same presenter's previous turn
  const order = preference(ctx, pool, ctx.index);
  const prev = previousTurn(ctx);
  if (prev >= 0 && order.length > 1) {
    const prevFirst = preference(ctx, pool, prev)[0];
    if (order[0] === prevFirst) order.push(order.shift());
  }
  // candidate words: stressed words, spread over the segment
  const W = ctx.words;
  const stressed = W.map((w, i) => (w.stressed ? i : -1)).filter((i) => i >= 0);
  if (!stressed.length) return;
  const starts = [];
  if (want >= 1) starts.push(stressed[Math.min(stressed.length - 1, Math.floor(P.r() * Math.min(3, stressed.length)))]);
  if (want >= 2) starts.push(stressed[Math.min(stressed.length - 1, Math.floor(stressed.length * (0.55 + P.r() * 0.3)))]);
  let k = 0;
  for (const wi of starts) {
    let placed = null;
    const pic = pictureFollows(ctx, W[wi].t + 0.5);
    const fits = (name) => !(name === 'point_screen' && !pic) && !(name === 'count' && !/\d|\bone\b|\btwo\b|\bthree\b|\bfirst\b|,/.test(ctx.sentences[sentenceOf(ctx, W[wi].char)].text));
    const opts = (name) => ({ spill: true, variant: name === 'shrug' ? 'small' : undefined });
    // the wall about to show the story is the most motivated thing to open a hand toward
    if (pic && pool.includes('point_screen')) placed = P.placeNear('point_screen', W[wi].char, opts('point_screen'));
    // the seeded order as written first (its variety), then the first fitting one with a stand-in that reads
    for (let tries = 0; tries < order.length && !placed; tries++) {
      const name = order[(k + tries) % order.length];
      if (fits(name)) placed = P.placeNear(name, W[wi].char, opts(name));
    }
    for (let tries = 0; tries < order.length && !placed; tries++) {
      const name = order[(k + tries) % order.length];
      if (fits(name)) placed = P.placeVisible(name, W[wi].char, opts(name), { head: false });
    }
    if (placed) k++;
  }
}

function preference(ctx, pool, index) {
  const r = rng((hashSeed(`${ctx.episodeId}|${index}|fill`) ^ ctx.episodeSeed) >>> 0);
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function previousTurn(ctx) {
  const segs = ctx.episode.segments || [];
  const me = ctx.seg.anchor;
  for (let i = ctx.index - 1; i >= 0; i--) if (segs[i].anchor === me && segs[i].type === ctx.type) return i;
  return -1;
}

/** The first stressed word of the segment that admits the gesture. */
function placeFirst(P, name, opts) {
  return P.placeNear(name, 0, { ...opts, spill: true });
}

/**
 * The sign-off papers in the hold after the last word (WORLD NOW 1.5 s, NEWS IN 60 1.0 s, MONEY MINUTE
 * 0.6 s: pace.js holds.signoff, or ctx.gapAfter when the director says). The full stand-and-square
 * (2.4 s) only when it fits the hold; otherwise the short `signoff` squaring: its tap lands at least
 * 0.1 s before the hold ends and the stack is flat again before the stinger, so the cut never catches
 * it in the air. It may start in the last syllable (≤ 0.15 s before the last word ends) when the hold
 * is short; nothing when even that cannot complete.
 */
function papersAfter(P) {
  const { ctx } = P;
  const hold = Number.isFinite(ctx.gapAfter) ? ctx.gapAfter : paceFor(P.R.pid).holds.signoff;
  const ev = { kind: 'gesture', slot: ctx.speaker, name: 'papers', char: ctx.seg.text.length };
  const amp = P.R.amp < 1 ? P.R.amp : null;
  if (amp) ev.amp = amp;
  const full = defOf(ev);
  if (0.15 + full.dur / rateOf(ev) > hold) ev.variant = 'signoff';
  const d = defOf(ev);
  const rate = rateOf(ev);
  const apex = d.apex / rate, flat = flatAfter(d) / rate;
  ev.dur = d.dur / rate;
  // as soon after the last word as the hold allows (0.12 s of breath), earlier when the hold is short
  ev.at = Math.min(ctx.duration + 0.12, ctx.duration + hold - 0.1 - apex);
  // no gesture may still be running, and no cut may land in its first moments
  for (const p of P.events) if (p.at + p.dur - SETTLE > ev.at) ev.at = p.at + p.dur - SETTLE;
  for (const c of ctx.shots || []) if (ev.at >= c.at && ev.at < c.at + ctx.cutGuard) ev.at = c.at + ctx.cutGuard;
  if (ev.at < ctx.duration - 0.15) ev.at = ctx.duration - 0.15;
  // the tap inside the hold, the stack down before the stinger: else it cannot air
  if (ev.at + apex > ctx.duration + hold - 0.1 + 1e-9 || ev.at + flat > ctx.duration + hold + 0.05 + 1e-9) return null;
  if (d === full && ev.at + ev.dur > ctx.duration + hold + 1e-9) return null;
  ev.apexAt = ev.at + apex;
  ev.word = ctx.seg.text.length;
  ev.arm = true;
  P.events.push(ev);
  P.count++;
  return ev;
}

/** s from t0 until the papers stack is flat on the desk for good (its tilt track's last raised key). */
function flatAfter(d) {
  const tr = d.tracks.tilt;
  if (!tr) return 0;
  let t = 0;
  for (let k = 0; k < tr.length; k++) if (tr[k][1] > 0.02) t = tr[k + 1] ? tr[k + 1][0] : tr[k][0];
  return t;
}

// ---------------------------------------------------------------------------
// Visibility: where does the hand land on screen in the shot of the apex?

const BANDS = new WeakMap(); // look → Map(definition → [band per amp step 5..10])
const TV = [0, 0, 0], TD = [0, 0, 0];

/**
 * The speaker's hands between the apex and the hold of a gesture, in body units below the neck base as
 * the oblique camera sees them (y + z·TILT): the highest and lowest hand centres, the lowest wrist, and
 * the x range (screen-right positive for a presenter whose partner is on the right). From the tracks
 * and the look's proportions (rig.js solve), never from a render.
 */
function handBand(L, d, ev) {
  // amp in tenths: the band moves less than a pixel between steps
  const step = ev.amp == null ? 10 : Math.round(Math.max(0.5, Math.min(1, ev.amp)) * 10);
  const amp = step / 10;
  let byL = BANDS.get(L);
  if (!byL) BANDS.set(L, (byL = new Map()));
  let arr = byL.get(d);
  if (!arr) byL.set(d, (arr = []));
  let b = arr[step];
  if (b) return b;
  const A = L.arm, T = L.torso;
  const k = (A.upper + A.fore) / 37;
  b = { top: Infinity, bottom: -Infinity, wrist: -Infinity, x0: Infinity, x1: -Infinity };
  const reach = d._ch.some((c) => c.ch === 'reach');
  for (const ch of d._ch) {
    if (ch.ch !== 'wrist' && ch.ch !== 'wristF') continue;
    const far = ch.ch === 'wristF';
    const dch = d._ch.find((c) => c.ch === (far ? 'dirF' : 'dir'));
    const sx = far ? -T.shoulderJoint[0] : T.shoulderJoint[0];
    for (let q = 0; q <= 2; q++) {
      const t = d.apex + ((d.hold - d.apex) * q) / 2;
      const w = evalTrack(ch.keys, t, TV);
      const r = ch.rest;
      const wx = r[0] + (w[0] - r[0]) * amp, wy = r[1] + (w[1] - r[1]) * amp, wz = r[2] + (w[2] - r[2]) * amp;
      let dx = -0.8, dy = 0.12, dz = 0.58;
      if (dch) {
        const v = evalTrack(dch.keys, t, TD), rr = dch.rest, k2 = 0.5 + amp * 0.5;
        dx = rr[0] + (v[0] - rr[0]) * k2;
        dy = rr[1] + (v[1] - rr[1]) * k2;
        dz = rr[2] + (v[2] - rr[2]) * k2;
      }
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      let x = sx + wx * k, y = T.shoulderJoint[1] + wy * k + wz * k * TILT;
      if (reach && !far) {
        // the glasses reach puts the hand at the face (rig.js reachGlasses)
        x = L.headAt[0] + 2;
        y = L.headAt[1] + 4;
      }
      const cy = y + ((dy + dz * TILT) / dl) * A.hand * 0.5, cx = x + (dx / dl) * A.hand * 0.5;
      b.top = Math.min(b.top, cy);
      b.bottom = Math.max(b.bottom, cy);
      b.wrist = Math.max(b.wrist, y);
      b.x0 = Math.min(b.x0, cx);
      b.x1 = Math.max(b.x1, cx);
    }
  }
  arr[step] = b;
  return b;
}

/** The shot in view at time t: the cut object (with its framing when known) or null. */
function cutAt(ctx, t) {
  let s = null;
  for (const c of ctx.shots || []) if (c.at <= t) s = c;
  return s;
}

/**
 * Framing of a cut: its own (planSegment passes it since w2-integ fix r1), else the camera planner's for
 * that cut (older contexts strip it), else a guess from the legacy shot.
 */
function framingOfCut(ctx, cut) {
  if (cut.framing != null) return cut.framing;
  if (cut.framing === undefined) {
    for (const e of cutsOf(ctx)) if (Math.abs(e.at - cut.at) < 0.002 && e.shot === cut.shot && e.framing != null) return e.framing;
  }
  return cut.shot === 'wide' ? 'wide' : cut.shot === 'close' ? (ctx.duo ? 'mcu' : 'solo-mcu') : null;
}

/** Tests and tools: would the viewer see this planned gesture's hands ({ name, variant?, n?, amp?, apexAt })? */
export function gestureVisible(ctx, ev) {
  const d = defOf(ev);
  return !d || !d.arm || handsVisible(ctx, ev, d);
}
/** Tests and tools: the hand band of a gesture for a look (body units below the neck, see handBand). */
export const handBandOf = (L, ev) => handBand(L, defOf(ev), ev);

const SIDE = { A: 1, B: -1 };
/** Is the speaker's apex hand of this gesture inside the shot that is on air at its apex? */
function handsVisible(ctx, ev, d) {
  if (!ctx.shots || !ctx.shots.length) return true; // no camera plan (labs, tests): nothing to check
  const cut = cutAt(ctx, ev.apexAt);
  if (!cut) return true;
  if (HIDDEN.has(cut.shot)) return false;
  const name = framingOfCut(ctx, cut);
  if (!name) return false;
  const solo = !ctx.duo;
  // a single on the other presenter does not show the speaker's hands
  if (!solo && cut.focus && cut.focus !== ctx.speaker && name !== 'wide' && name !== 'two') return false;
  const L = lookFor(ctx.speakerId);
  if (!L) return true;
  let cam;
  try {
    cam = cameraFraming(name, { cast: ctx.cast, focus: cut.focus || ctx.speaker, programId: ctx.programId, solo });
  } catch (err) {
    fault('camera framing', err); // fail open on air (the gesture plays), but never silently
    return true;
  }
  const X = solo ? SET.seatX.solo ?? 0 : SET.seatX[ctx.speaker === 'B' ? 'B' : 'A'];
  const p = placeActor(cam, X);
  const b = handBand(L, d, ev);
  const single = p.s >= SINGLE_SCALE;
  const m = solo ? 1 : SIDE[ctx.speaker] ?? 1;
  const xa = p.x + Math.min(b.x0 * m, b.x1 * m) * p.s, xb = p.x + Math.max(b.x0 * m, b.x1 * m) * p.s;
  let floor = single ? HAND_FLOOR : HAND_FLOOR_WIDE;
  // in the subtitle's columns (the hand's half-width either side of its centre counts) the hand must
  // clear the caption box, in any shot: below it there is only the strap (the desk hands of a two-shot
  // sit behind its tag row, or peek through the 6 px gap)
  if (xb + 6 >= CAPTION_BOX.x0 && xa - 6 <= CAPTION_BOX.x1) floor = Math.min(floor, CAPTION_BOX.top - CAPTION_CLEAR);
  if (p.y + b.bottom * p.s > floor || p.y + b.top * p.s < 12) return false;
  if (single && p.y + b.wrist * p.s > WRIST_FLOOR) return false;
  return xa >= 8 && xb <= 376;
}

/** Do the words carry this gesture's meaning (head shake: negation / contrast / doubt; shrug: uncertainty; glasses: the question)? */
function semanticOk(ctx, ev) {
  const name = ev.name;
  if (name !== 'shake_head' && name !== 'shrug' && name !== 'glasses') return true;
  const si = sentenceOf(ctx, ev.word);
  if (name === 'glasses') return !!ctx.question && si === sentenceOf(ctx, ctx.question.char);
  const sent = ctx.sentences[si];
  const text = sent.text || ctx.seg.text.slice(sent.start, sent.end);
  const re = name === 'shake_head' ? NEGATION : UNCERTAIN;
  re.lastIndex = 0;
  let m;
  // the anchor word at or just after the cue word (a question mark carries the whole sentence)
  while ((m = re.exec(text))) {
    if (m[0] === '?') return true;
    const at = sent.start + m.index;
    if (at <= ev.word + 2 && ev.word - at <= 32) return true;
  }
  return false;
}

// how far a beat's hand moves, in body units as the oblique camera sees them (wrist travel, and the
// fingers' share of a curl change), per definition; and the presenter's scale in the shot at its apex
const MOTION = new WeakMap();
function motionOf(d, L) {
  let m = MOTION.get(d);
  if (m !== undefined) return m;
  const k = (L.arm.upper + L.arm.fore) / 37;
  m = 0;
  for (const ch of d._ch) {
    if (ch.ch === 'wrist' || ch.ch === 'wristF') {
      const r = ch.rest;
      for (const key of ch.keys) {
        const v = key[1];
        const dx = (v[0] - r[0]) * k, dy = (v[1] - r[1] + (v[2] - r[2]) * TILT) * k;
        m = Math.max(m, Math.sqrt(dx * dx + dy * dy));
      }
    } else if (ch.ch === 'curl' || ch.ch === 'curlF') {
      // a finger curling on the desk moves mostly in depth: about half its length on screen per unit of curl
      const r = ch.rest;
      for (const key of ch.keys) for (let q = 1; q < 5; q++) m = Math.max(m, Math.abs(key[1][q] - r[q]) * L.arm.hand * 0.43 * 0.5);
    }
  }
  MOTION.set(d, m);
  return m;
}
function beatPx(ctx, ev, d) {
  const L = lookFor(ctx.speakerId);
  if (!L || !ctx.shots || !ctx.shots.length) return Infinity;
  const s = scaleAt(ctx, ev.apexAt);
  if (s == null) return Infinity;
  const amp = ev.amp == null ? 1 : Math.max(0.5, Math.min(1, ev.amp));
  return motionOf(d, L) * amp * s;
}
/** The speaker's presenter scale in the shot on air at time t (null when unknown). */
function scaleAt(ctx, t) {
  const cut = cutAt(ctx, t);
  if (!cut || HIDDEN.has(cut.shot)) return null;
  const name = framingOfCut(ctx, cut);
  if (!name) return null;
  try {
    const solo = !ctx.duo;
    const cam = cameraFraming(name, { cast: ctx.cast, focus: cut.focus || ctx.speaker, programId: ctx.programId, solo });
    const X = solo ? SET.seatX.solo ?? 0 : SET.seatX[ctx.speaker === 'B' ? 'B' : 'A'];
    return placeActor(cam, X).s;
  } catch (err) {
    fault('camera framing', err);
    return null;
  }
}

/** The legacy shot in view at time t (from planShots' cuts), or null. */
function shotAt(ctx, t) {
  let s = null;
  for (const c of ctx.shots || []) if (c.at <= t) s = c.shot;
  return s;
}

/** Does a picture or a map follow within 1.5 s of time t (point_screen's condition)? */
function pictureFollows(ctx, t) {
  for (const c of ctx.shots || []) if ((c.shot === 'full' || c.shot === 'map') && c.at >= t - 0.2 && c.at - t <= 1.5) return true;
  // COSMOS: the wall carries the picture or map in the studio shot
  if (ctx.programId === 'cosmos' && (ctx.hasImage || ctx.seg.location)) return true;
  // the framings that compose the speaker against the wall (camera.js: mcu-l / mcu-r keep the wall
  // content in the other third, ots looks past the shoulder at it) while it shows the story's picture or map
  if (ctx.hasImage || ctx.seg.location) {
    const cut = cutAt(ctx, t);
    const f = cut && !HIDDEN.has(cut.shot) ? framingOfCut(ctx, cut) : null;
    if (f === 'ots' || f === 'mcu-l' || f === 'mcu-r') return true;
  }
  return false;
}

function finish(P) {
  const evs = P.events.sort((a, b) => a.at - b.at);
  return evs.map((e) => {
    const o = { kind: 'gesture', slot: e.slot, name: e.name, char: e.char, at: round(e.at), apexAt: round(e.apexAt), word: e.word };
    if (e.variant) o.variant = e.variant;
    if (e.n != null) o.n = e.n;
    if (e.amp != null) o.amp = e.amp;
    if (e.speed != null) o.speed = e.speed;
    if (e.beat) o.beat = true;
    return o;
  });
}

const round = (v) => Math.round(v * 1000) / 1000;

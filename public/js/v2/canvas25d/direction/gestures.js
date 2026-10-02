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
// ctx.episodeSeed, memoised by episode id.
import { GESTURES, defOf, rateOf } from '../gestures/index.js';
import { rng, hashSeed } from './context.js';
import { lookFor } from '../cast/index.js';

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
    lead: [0.2, 0.3],
    variants: { ada: { shake_head: 'slow' } },
    storyCount: [1, 2],
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

const SETTLE = 0.35; // s two gestures may overlap while the first one settles
/** Legacy shots in which the presenter is not in vision: a gesture's apex never lands there. */
const HIDDEN = new Set(['full', 'map', 'fact', 'montage', 'card', 'numbers', 'quote', 'number', 'headlines']);
const GRAVE_AMP = [0.6, 0.7];

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

const EPISODE_PLANS = new Map();

/**
 * Budgets that span segments, decided once per episode from its summary:
 *   greet[i]   the speaker of segment i nods hello there (their first turn in the opening)
 *   leanIn     the segment that may carry MONEY MINUTE's single lean_in
 *   n60        NEWS IN 60's two gestures: { [index]: name }
 *   armMinAt[i] COSMOS: earliest arm gesture in segment i (6 s per presenter across segments)
 */
export function episodePlan(ctx) {
  const ep = ctx.episode;
  const key = `${ep.id}|${ctx.programId}|${ctx.episodeSeed}`;
  const hit = EPISODE_PLANS.get(key);
  if (hit) return hit;
  const segs = ep.segments || [];
  const r = rng((ctx.episodeSeed ^ 0x6a09e667) >>> 0);
  const plan = { greet: {}, leanIn: -1, n60: {}, armMinAt: {} };
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
  if (EPISODE_PLANS.size > 64) EPISODE_PLANS.clear();
  EPISODE_PLANS.set(key, plan);
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
    let amp = opts.amp ?? R.amp;
    if (ctx.grave) amp = GRAVE_AMP[0] + (GRAVE_AMP[1] - GRAVE_AMP[0]) * this.r();
    if (amp < 1) ev.amp = Math.round(amp * 100) / 100;
    const d = defOf(ev);
    const rate = rateOf(ev);
    const apex = d.apex / rate, stroke = d.stroke / rate, dur = d.dur / rate;
    // stroke starts `lead` before the word; the apex lands within ±0.1 s of it
    const lead = opts.lead ?? this.lead();
    const offset = Math.max(-0.1, Math.min(0.1, apex - stroke - lead));
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
    // cut guard: no start inside the first cutGuard s of a shot, and no cut before the apex
    for (const c of ctx.shots || []) {
      if (ev.at >= c.at && ev.at < c.at + ctx.cutGuard) return false;
      if (c.at > ev.at && c.at < ev.apexAt + 0.1) return false;
    }
    // the apex must be seen: not under a picture, map or card
    if (ctx.shots && ctx.shots.length && HIDDEN.has(shotAt(ctx, ev.apexAt))) return false;
    // a gesture may run a little into the pause after the segment, not into the next one
    if (ev.at + ev.dur > ctx.duration + (ctx.gapAfter ?? 0.8) + 0.4) return false;
    // never two gestures at once (a settle overlap is fine)
    for (const p of this.events) if (ev.at < p.at + p.dur - SETTLE && p.at < ev.at + ev.dur - SETTLE) return false;
    const si = sentenceOf(ctx, ev.word);
    if (arm && (this.sentArm.get(si) || 0) >= 1) return false;
    if (R.B.perSentence && (this.sentAny.get(si) || 0) >= R.B.perSentence) return false;
    // figures land on still arms (MONEY MINUTE)
    if (R.B.figureGuard) for (const f of ctx.figures || []) if (Math.abs(f.t - ev.apexAt) <= R.B.figureGuard) return false;
    // COSMOS: one arm gesture per 6 s per presenter (inside the segment, and the episode estimate)
    if (arm && R.B.armSpacing) {
      for (const p of this.events) if (p.arm && Math.abs(p.at - ev.at) < R.B.armSpacing) return false;
      if (ev.at < (this.ep.armMinAt[ctx.index] || 0)) return false;
    }
    if (!opts.free && this.count >= R.cap) return false;
    if (ev.name === 'steeple' && R.B.steeplePerStory && this.steeples >= R.B.steeplePerStory) return false;
    return true;
  }

  commit(ev) {
    const d = defOf(ev);
    ev.arm = d.arm;
    this.events.push(ev);
    const si = sentenceOf(this.ctx, ev.word);
    if (d.arm) this.sentArm.set(si, (this.sentArm.get(si) || 0) + 1);
    this.sentAny.set(si, (this.sentAny.get(si) || 0) + 1);
    this.count++;
    if (ev.name === 'steeple') this.steeples++;
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
    // no stressed word left: the content word nearest after the cue
    if (!tried.length) {
      for (let i = wordAt(ctx, char); i < W.length && W[i].char < S.end; i++) if (W[i].content) {
        tried.push(i);
        break;
      }
    }
    for (const wi of tried) {
      const ev = this.tryAt(name, wi, opts);
      if (ev) return this.commit(ev);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------

/** @returns planned gesture and emotion events for the speaker (emotions for any slot) */
export function planGestures(ctx) {
  const out = [];
  if (!ctx || !ctx.seg) return out;
  const cues = Array.isArray(ctx.seg.cues) ? ctx.seg.cues : [];
  // the writer's emotion cues change the face of whoever they name
  for (const cue of cues) {
    if (!cue || !cue.emotion) continue;
    const slot = cue.slot && cue.slot in ctx.cast ? cue.slot : ctx.speaker;
    out.push({ kind: 'emotion', slot, name: cue.emotion, char: cue.char, at: Math.max(0, ctx.timeAt(cue.char) - 0.25) });
  }
  if (!ctx.valid || !ctx.words || !ctx.words.length || !ctx.speaker) return out;
  const R = rulesFor(ctx);
  const P = new SegmentPlan(ctx, R);
  P.ep = episodePlan(ctx);
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
    return out.concat(finish(P));
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
    P.placeNear(name, cue.char, {});
  }

  // ---- TECH BYTES / COSMOS: a presenter who wears glasses may touch them as her question starts
  if (ctx.question && R.speaker.includes('glasses') && P.admit('glasses') && P.r() < 0.7) P.placeNear('glasses', ctx.question.char, {});

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
    const pick = B.chat[Math.floor(P.r() * B.chat.length)];
    const name = P.admit(pick);
    if (name) P.placeNear(name, ctx.dryLine.char, { variant: name === 'shrug' ? 'small' : undefined });
  }

  // ---- stories: seeded fillers from the programme's pool, 1-2 per story
  if (ctx.type === 'story' && ctx.feature !== 'roundup') fillStory(P, ctx, R);

  // ---- MONEY MINUTE / tech / cosmos: a chat or intro may carry one listed gesture too
  if ((ctx.type === 'chat' || ctx.type === 'intro') && R.pid !== 'world-now' && P.count < R.cap && P.r() < 0.4) fillStory(P, ctx, R, 1);

  return out.concat(finish(P));
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
  if (!B.story) pool = R.speaker.filter((n) => P.admit(n) && n !== 'papers');
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
    for (let tries = 0; tries < order.length && !placed; tries++) {
      const name = order[(k + tries) % order.length];
      if (name === 'point_screen' && !pictureFollows(ctx, W[wi].t + 0.5)) continue;
      if (name === 'count' && !/\d|\bone\b|\btwo\b|\bthree\b|\bfirst\b|,/.test(ctx.sentences[sentenceOf(ctx, W[wi].char)].text)) continue;
      placed = P.placeNear(name, W[wi].char, { spill: true, variant: name === 'shrug' ? 'small' : undefined });
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

/** papers in the hold after the last word (the sign-off's wide). */
function papersAfter(P) {
  const { ctx } = P;
  const ev = { kind: 'gesture', slot: ctx.speaker, name: 'papers', char: ctx.seg.text.length };
  const d = defOf(ev);
  const amp = P.R.amp < 1 ? P.R.amp : null;
  if (amp) ev.amp = amp;
  ev.at = Math.max(0, ctx.duration + 0.15);
  ev.apexAt = ev.at + d.apex / rateOf(ev);
  ev.word = ctx.seg.text.length;
  ev.dur = d.dur / rateOf(ev);
  // no gesture may still be running, and no cut may land in its first moments
  for (const p of P.events) if (p.at + p.dur - SETTLE > ev.at) ev.at = p.at + p.dur - SETTLE;
  for (const c of ctx.shots || []) if (ev.at >= c.at && ev.at < c.at + ctx.cutGuard) ev.at = c.at + ctx.cutGuard;
  ev.apexAt = ev.at + d.apex / rateOf(ev);
  ev.arm = true;
  P.events.push(ev);
  P.count++;
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
    return o;
  });
}

const round = (v) => Math.round(v * 1000) / 1000;

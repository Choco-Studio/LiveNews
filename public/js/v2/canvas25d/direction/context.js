// Planning context for one segment of a live episode (owner: INTEGRATION
// stream). Nothing is pre-planned per story: when the director reaches a
// segment it builds this context from the episode JSON and hands it to the
// planners (direction/shots.js, gestures.js, behaviour.js; direction/index.js
// planSegment runs them), which return events. Pure and DOM-free (node can
// import it), deterministic per episode, and it never throws on a malformed
// episode (ctx.valid is false then and the planners get an empty segment).
//
//   const ctx = segmentContext(episode, i, { presenters, gapAfter })
//   ctx.words      [{ char, end, t, emph, stressed, content, figure }]
//                  t = seconds from the FIRST WORD (both timing modes, see below)
//                  emph 0..1 = how much the word carries the sentence (content
//                  word, nuclear position, figure, proper noun, length);
//                  stressed = the one or two accent words per intonation phrase
//                  (≈ 1 in 4-7 words): what gestures and nods anchor to
//   ctx.timing     'recorded' (seg.audio.words [{ t, char, len? }] from the voice
//                  worker: t from the start of the file, char/len in seg.text) |
//                  'estimated' (the audio stream's text model)
//   ctx.lead       s from the start of the audio file to the first word (recorded;
//                  0 when estimated). The runtime's speechStart is onSentence(0),
//                  which the audio contract fires AT the first recorded word, so
//                  every `at` is measured from the first word, never from the file.
//   ctx.timeAt(c)  seconds from the first word of char offset c in seg.text
//   ctx.figures    [{ char, end, t }] spoken figures (digits, number words, seg.numbers)
//   ctx.dryLine    { char, end, t0, t1, source } | null: the deflating/dry line
//                  (seg.dry / seg.wry when editorial sends them, else a heuristic)
//   ctx.question   { char, end, t0, t1 } | null: the last question in the segment
//   ctx.episode    read-only episode summary for per-episode budgets:
//                  { id, programId, seed, segmentCount, storyCount, segments: [...] }
//   ctx.shots      [] here; planSegment fills it with planShots' cuts
//                  [{ at, char, shot, focus }] before running the other planners
//   ctx.cutGuard   s after a cut in which no gesture may start (bibles: 0.5, MONEY 0.6)
//   ctx.contextAt(j)  the context of segment j of the same episode (memoised per
//                  episode object, presenters and gapAfter; READ-ONLY, shared by every
//                  caller): planners that depend on a neighbour (CAMERA's one MAP per
//                  MONEY MINUTE, NEWS IN 60's "never open an item on the previous
//                  item's last framing") read it exactly instead of predicting it
//
// Event anchors: every planned event carries `char` (offset into seg.text) and
// `at` (seconds from the first word, from ctx.timeAt). The runtime fires recorded
// segments by `at` and live TTS by `char` (the speech clock's current char), so
// both voice paths stay in sync.
import { splitSentences } from '../../../audio/sentences.js';
import { buildTimeline } from '../../../audio/visemes.js';

/**
 * Silence after a sentence (s), by how it ends: the newsreader's pause the audio
 * engine leaves in mute and blips (audio.js gapAfter); browser TTS leaves about
 * the same (a shorter scheduled gap plus the engine's own tail).
 */
function pauseAfter(sentence) {
  const end = /([.!?…:;])["'’”»)\]]*\s*$/.exec(sentence)?.[1] ?? '';
  if (end === '?') return 0.48;
  if (end === '…') return 0.56;
  if (end === '.' || end === '!') return 0.43;
  if (end === ':' || end === ';') return 0.3;
  return 0.16; // a long sentence cut at a comma
}

/** FNV-1a hash of a string → uint32 (seeds). */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic random generator in [0, 1) for a seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAVE = new Set(['serious', 'sad']);
/** s after a cut in which no gesture may start (style bibles; MONEY MINUTE 0.6). */
const CUT_GUARD = { 'money-minute': 0.6 };
const NUMBER_WORDS = new Set(
  ('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen ' +
    'eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion trillion ' +
    'half third quarter percent dozen first second third fourth fifth').split(' ')
);

export function cutGuard(programId) {
  return CUT_GUARD[programId] ?? 0.5;
}

const EPISODES = new WeakMap();
/** Frozen per-episode summary (memoised per episode object). */
function episodeSummary(episode) {
  if (episode && typeof episode === 'object') {
    const hit = EPISODES.get(episode);
    if (hit) return hit;
  }
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  let stories = 0;
  const segments = segs.map((s) => {
    const story = s?.type === 'story';
    const out = Object.freeze({
      type: s?.type || 'story',
      anchor: s?.anchor ?? null,
      emotion: s?.emotion || 'neutral',
      grave: GRAVE.has(s?.emotion) || !!s?.breaking || !!s?.grave,
      feature: s?.feature || null,
      hasImage: !!s?.hasImage,
      location: !!s?.location,
      roundup: s?.roundup || null,
      storyIndex: story ? stories : -1,
      chars: String(s?.text || '').length,
    });
    if (story) stories++;
    return out;
  });
  const id = episode?.id ?? 'episode';
  const sum = Object.freeze({
    id,
    programId: episode?.program?.id || 'world-now',
    seed: hashSeed(id),
    segmentCount: segs.length,
    storyCount: stories,
    segments: Object.freeze(segments),
    plan: episode?.plan || null, // NEWS IN 60 fit stage, when the server sends it
  });
  if (episode && typeof episode === 'object') EPISODES.set(episode, sum);
  return sum;
}

const NEIGHBOURS = new WeakMap(); // episode -> { presenters, gapAfter, ctxs: Map(index -> ctx) }

/** Memoised context of segment j (neighbour access for the planners). */
function contextAt(episode, j, presenters, gapAfter) {
  if (!episode || typeof episode !== 'object' || !Number.isInteger(j)) return null;
  const segs = Array.isArray(episode.segments) ? episode.segments : [];
  if (j < 0 || j >= segs.length) return null;
  let memo = NEIGHBOURS.get(episode);
  if (!memo || memo.presenters !== presenters || memo.gapAfter !== gapAfter) {
    memo = { presenters, gapAfter, ctxs: new Map() };
    NEIGHBOURS.set(episode, memo);
  }
  let c = memo.ctxs.get(j);
  if (!c) {
    c = segmentContext(episode, j, { presenters, gapAfter });
    memo.ctxs.set(j, c);
  }
  return c;
}

/**
 * @param episode   the episode JSON from /api/next ({ id, program, cast, segments, ... })
 * @param index     segment index
 * @param opts      { presenters: channel.presenters (voice lang/rate per id),
 *                    gapAfter: s the director waits after this segment (optional) }
 */
const NO_PRESENTERS = Object.freeze({}); // one object, so contextAt's memo holds across default calls

export function segmentContext(episode, index, { presenters = NO_PRESENTERS, gapAfter = null } = {}) {
  const ep = episodeSummary(episode);
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  const valid = Number.isInteger(index) && index >= 0 && index < segs.length && !!segs[index];
  const raw = valid ? segs[index] : null;
  const seg = raw && typeof raw.text === 'string' ? raw : { ...(raw || {}), type: raw?.type || 'story', text: String(raw?.text ?? '') };
  const cast = episode?.cast && typeof episode.cast === 'object' && Object.keys(episode.cast).length ? episode.cast : { A: null };
  const slots = Object.keys(cast);
  const speaker = seg.anchor in cast ? seg.anchor : slots[0];
  const prev = valid ? segs[index - 1] || null : null;
  const next = valid ? segs[index + 1] || null : null;
  const voice = presenters?.[cast[speaker]]?.voice || {};
  const programId = episode?.program?.id || 'world-now';
  const { sentences, words, timing, duration, lead } = timeline(seg, voice);
  const sum = ep.segments[index] || null;
  const timeAt = (char) => timeAtChar(words, char);
  const span = (char, end) => ({ char, end, t0: timeAt(char), t1: end >= seg.text.length ? duration : timeAt(end) });
  const storyIndex = sum ? sum.storyIndex : -1;
  return {
    valid,
    episodeId: ep.id,
    episode: ep,
    programId,
    theme: episode?.program?.theme || 'world',
    seed: hashSeed(`${ep.id}|${index}`),
    episodeSeed: ep.seed,
    index,
    seg,
    type: seg.type || 'story',
    emotion: seg.emotion || 'neutral',
    grave: GRAVE.has(seg.emotion) || !!seg.breaking || !!seg.grave,
    feature: seg.feature || null,
    storyIndex,
    isLead: storyIndex === 0,
    cast,
    duo: slots.length > 1,
    speaker,
    speakerId: cast[speaker] ?? null,
    listeners: slots.filter((s) => s !== speaker),
    prevSpeaker: prev?.anchor ?? null,
    nextSpeaker: next?.anchor ?? null,
    turnStart: !prev || prev.anchor !== seg.anchor,
    handover: !!next && next.anchor !== seg.anchor,
    first: index === 0,
    last: index === segs.length - 1,
    hasImage: !!seg.hasImage,
    sentences,
    words,
    timing,
    lead,
    duration,
    timeAt,
    figures: figuresOf(seg, words),
    dryLine: dryLineOf(seg, sentences, span),
    question: questionOf(seg, sentences, span),
    gapAfter: Number.isFinite(gapAfter) ? gapAfter : null,
    cutGuard: cutGuard(programId),
    shots: [],
    contextAt: (j) => contextAt(episode, j, presenters, gapAfter),
  };
}

/** Seconds from the first word of char offset `char` (binary search, interpolated inside a word). */
export function timeAtChar(words, char) {
  const n = words.length;
  if (!n) return 0;
  if (char <= words[0].char) return words[0].t;
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (words[mid].char <= char) lo = mid;
    else hi = mid - 1;
  }
  const w = words[lo], nx = words[lo + 1];
  if (!nx || char <= w.char) return w.t;
  return w.t + ((nx.t - w.t) * (char - w.char)) / Math.max(1, nx.char - w.char);
}

/** Sentences of the segment with char spans in seg.text (same split as audio.js onSentence). */
function sentencesOf(text) {
  const out = [];
  let from = 0;
  for (const p of splitSentences(text)) {
    const at = text.indexOf(p.slice(0, 12), from);
    const start = at >= 0 ? at : from;
    out.push({ text: p, start, end: start + p.length, t0: 0, t1: 0 });
    from = start + p.length;
  }
  return out;
}

/** Word timings of a segment: recorded (seg.audio.words) or estimated from the text. */
function timeline(seg, voice) {
  const text = seg.text || '';
  const sentences = sentencesOf(text);
  const lang = voice.lang || 'en';
  const rate = voice.rate || 1;
  // The text model always runs: it gives the estimated times AND the emphasis
  // of every word (recorded audio carries times only).
  const est = [];
  let t = 0;
  for (const s of sentences) {
    const tl = buildTimeline(s.text, { lang, rate });
    s.t0 = t;
    const stressDur = new Map();
    for (const x of tl.segs) if (x.stress) stressDur.set(x.wi, (stressDur.get(x.wi) || 0) + (x.t1 - x.t0));
    for (const w of tl.words) {
      const char = s.start + w.ci;
      const prev = est[est.length - 1];
      // a normalised expansion ("40,000" → "forty thousand") gives several spoken
      // words on one source token: they are one word here (the token's start)
      if (prev && prev.char === char) {
        prev.sd += stressDur.get(w.wi) || 0;
        prev.content = prev.content || stressDur.has(w.wi);
        continue;
      }
      est.push({ char, end: tokenEnd(text, char), t: t + w.t0 / 1000, emph: 0, stressed: false, content: stressDur.has(w.wi), figure: false, sd: stressDur.get(w.wi) || 0 });
    }
    t += tl.total / 1000;
    s.t1 = t;
    t += pauseAfter(s.text);
  }
  // the next sentence starts after the pause; the last one ends with its last sound
  for (let i = 0; i + 1 < sentences.length; i++) sentences[i].t1 = sentences[i + 1].t0;
  const spokenEnd = sentences.length ? sentences[sentences.length - 1].t1 : 0;
  rankEmphasis(text, est);
  const rec = seg.audio?.words;
  if (Array.isArray(rec) && rec.length) {
    const words = rec
      .filter((w) => Number.isFinite(w?.t) && Number.isFinite(w?.char))
      .map((w) => ({ char: w.char, end: Number.isFinite(w.len) && w.len > 0 ? w.char + w.len : -1, t: w.t, emph: 0, stressed: false, content: false, figure: false }))
      .sort((a, b) => a.char - b.char);
    if (words.length) {
      // first-word origin: the director's speechStart is the first recorded word
      const lead = Math.min(...words.map((w) => w.t));
      for (const w of words) w.t -= lead;
      // emphasis from the text model, mapped by char (the word that contains it)
      let j = 0;
      for (const w of words) {
        while (j + 1 < est.length && est[j + 1].char <= w.char) j++;
        const e = est[j];
        if (e && w.char >= e.char && w.char < Math.max(e.end, e.char + 1)) {
          if (w.end < 0) w.end = e.end;
          w.emph = e.emph;
          w.stressed = e.stressed;
          w.content = e.content;
          w.figure = e.figure;
        } else if (w.end < 0) w.end = nextSpace(text, w.char);
      }
      const total = Number.isFinite(seg.audio.duration) ? seg.audio.duration - lead : words[words.length - 1].t + 0.5;
      const duration = Math.max(total, words[words.length - 1].t + 0.2);
      for (const s of sentences) s.t0 = timeAtChar(words, s.start);
      for (let i = 0; i < sentences.length; i++) sentences[i].t1 = i + 1 < sentences.length ? sentences[i + 1].t0 : duration;
      return { sentences, words, timing: 'recorded', duration, lead };
    }
  }
  // estimated: normalise to the first word as well (the model may start with a short rest)
  const lead = est.length ? est[0].t : 0;
  const words = est.map((w) => ({ char: w.char, end: w.end, t: w.t - lead, emph: w.emph, stressed: w.stressed, content: w.content, figure: w.figure }));
  for (const s of sentences) {
    s.t0 = Math.max(0, s.t0 - lead);
    s.t1 = Math.max(0, s.t1 - lead);
  }
  return { sentences, words, timing: 'estimated', duration: Math.max(0, spokenEnd - lead), lead: 0 };
}

function nextSpace(text, i) {
  const j = text.indexOf(' ', i);
  return j < 0 ? text.length : j;
}

/** End of the source token at `i` without its trailing punctuation ("Brazil." → after the "l"). */
function tokenEnd(text, i) {
  const tok = text.slice(i, nextSpace(text, i));
  const core = tok.replace(/[^\p{L}\p{N}%$€£'’]+$/u, '');
  return i + Math.max(1, core.length);
}

/**
 * Emphasis per word, then the accent words. English news reading puts the
 * nuclear accent on the last content word of an intonation phrase; figures and
 * names carry weight; function words carry none. Pure text, so recorded and
 * estimated segments get the same ranking.
 */
function rankEmphasis(text, words) {
  // intonation phrases: split at punctuation that ends a phrase
  const phrases = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const token = text.slice(w.char, nextSpace(text, w.char));
    const bare = token.toLowerCase().replace(/[^a-z0-9']/g, '');
    w.figure = /\d/.test(token) || NUMBER_WORDS.has(bare);
    const cap = /^[A-Z]/.test(token) && i > 0 && !/[.!?…]["'’”)]*\s*$/.test(text.slice(words[i - 1].char, w.char));
    let e = 0;
    if (w.content || w.figure) {
      e = 0.4 + 0.1 * Math.min(1, Math.max(0, (bare.length - 4) / 6)) + Math.min(0.1, w.sd * 0.0008);
      if (w.figure) e += 0.25;
      if (cap) e += 0.15;
    }
    w.emph = e;
    cur.push(w);
    // phrase end: trailing punctuation on the token, or a dash before the next word
    const trail = token.slice(Math.max(0, w.end - w.char));
    const gap = text.slice(w.char + token.length, words[i + 1]?.char ?? text.length);
    if (/[,;:.!?…—–]/.test(trail) || /[—–-]/.test(gap) || i === words.length - 1) {
      phrases.push(cur);
      cur = [];
    }
  }
  if (cur.length) phrases.push(cur);
  for (const ph of phrases) {
    // nuclear position: the last content word of the phrase
    for (let k = ph.length - 1; k >= 0; k--) {
      if (ph[k].emph > 0) {
        ph[k].emph += 0.2;
        break;
      }
    }
    // one accent per phrase, two in a long phrase (best of each half)
    const marks = ph.length > 8 ? [ph.slice(0, ph.length >> 1), ph.slice(ph.length >> 1)] : [ph];
    for (const part of marks) {
      let best = null;
      for (const w of part) if (w.emph > 0 && (!best || w.emph > best.emph)) best = w;
      if (best) best.stressed = true;
    }
  }
  for (const w of words) {
    w.emph = Math.min(1, w.emph);
    delete w.sd;
  }
}

function figuresOf(seg, words) {
  const out = [];
  const values = (Array.isArray(seg.numbers) ? seg.numbers : []).map((n) => String(n?.value || '').toLowerCase()).filter(Boolean);
  if (seg.fact) values.push(...String(seg.fact).toLowerCase().match(/[\d][\d.,%]*/g) || []);
  const text = seg.text || '';
  for (const w of words) {
    const token = text.slice(w.char, w.end).toLowerCase().replace(/[.,;:!?]+$/, '');
    if (w.figure || values.some((v) => v && (v.startsWith(token) || token.startsWith(v)) && /\d/.test(token))) {
      out.push({ char: w.char, end: w.end, t: w.t });
    }
  }
  return out;
}

function lastSentence(sentences) {
  return sentences.length ? sentences[sentences.length - 1] : null;
}

function wordCount(s) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** The deflating / dry line: editorial fields when present, else the last short line of a chat, AND FINALLY or sign-off. */
function dryLineOf(seg, sentences, span) {
  const text = seg.text || '';
  if (!text) return null;
  if (typeof seg.dry === 'string' && seg.dry) {
    const at = text.indexOf(seg.dry);
    if (at >= 0) return { ...span(at, at + seg.dry.length), source: 'field' };
  }
  const last = lastSentence(sentences);
  if (!last) return null;
  if (seg.wry || seg.dry === true) return { ...span(last.start, last.end), source: 'field' };
  const grave = GRAVE.has(seg.emotion) || !!seg.breaking || !!seg.grave;
  if (grave || wordCount(last.text) > 14 || /\?\s*$/.test(last.text)) return null;
  const chat = seg.type === 'chat';
  const closing = seg.feature === 'lighter' || seg.type === 'outro';
  if (chat || (closing && sentences.length >= 2)) return { ...span(last.start, last.end), source: 'heuristic' };
  return null;
}

function questionOf(seg, sentences, span) {
  for (let i = sentences.length - 1; i >= 0; i--) {
    if (/\?["'’”)]*\s*$/.test(sentences[i].text)) return span(sentences[i].start, sentences[i].end);
  }
  return null;
}

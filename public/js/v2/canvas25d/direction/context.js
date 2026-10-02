// Planning context for one segment of a live episode (owner: INTEGRATION
// stream). Nothing is pre-planned per story: when the director reaches a
// segment it builds this context from the episode JSON and hands it to the
// planners (direction/shots.js, gestures.js, behaviour.js), which return
// events. Pure and DOM-free (node can import it), deterministic per episode.
//
//   const ctx = segmentContext(episode, i, { presenters, rates })
//   ctx.words      [{ char, end, t, stressed }]  word starts (s from speech start)
//   ctx.timing     'recorded' (seg.audio.words, exact) | 'estimated' (text model)
//   ctx.timeAt(c)  seconds from speech start of char offset c in seg.text
//
// Event anchors: every planned event carries `char` (offset into seg.text) and
// `at` (seconds from speech start, from ctx.timeAt). The runtime fires recorded
// segments by `at` and live TTS by `char` (the speech clock's current char), so
// both voice paths stay in sync.
import { splitSentences } from '../../../audio.js';
import { buildTimeline } from '../../../audio/visemes.js';

const GAP = 0.06; // s of closed mouth between TTS sentences (audio.js GAP.tts)

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

/**
 * @param episode   the episode JSON from /api/next ({ id, program, cast, segments, ... })
 * @param index     segment index
 * @param opts      { presenters: channel.presenters (voice lang/rate per id) }
 */
export function segmentContext(episode, index, { presenters = {} } = {}) {
  const segs = episode.segments || [];
  const seg = segs[index];
  const cast = episode.cast || {};
  const slots = Object.keys(cast);
  const speaker = seg.anchor in cast ? seg.anchor : slots[0] || 'A';
  const prev = segs[index - 1] || null;
  const next = segs[index + 1] || null;
  const voice = presenters[cast[speaker]]?.voice || {};
  const programId = episode.program?.id || 'world-now';
  const { sentences, words, timing, duration } = timeline(seg, voice);
  const timeAt = (char) => {
    if (!words.length) return 0;
    let w = words[0];
    for (const x of words) {
      if (x.char <= char) w = x;
      else break;
    }
    // inside a word: interpolate toward the next word start
    const i = words.indexOf(w);
    const nx = words[i + 1];
    if (!nx || char <= w.char) return w.t;
    return w.t + ((nx.t - w.t) * (char - w.char)) / Math.max(1, nx.char - w.char);
  };
  return {
    episodeId: episode.id,
    programId,
    theme: episode.program?.theme || 'world',
    seed: hashSeed(`${episode.id}|${index}`),
    index,
    seg,
    type: seg.type,
    emotion: seg.emotion || 'neutral',
    grave: GRAVE.has(seg.emotion) || !!seg.breaking,
    cast,
    duo: slots.length > 1,
    speaker,
    speakerId: cast[speaker],
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
    duration,
    timeAt,
  };
}

/** Word timings of a segment: recorded (seg.audio.words) or estimated from the text. */
function timeline(seg, voice) {
  const text = seg.text || '';
  const parts = splitSentences(text);
  const sentences = [];
  let from = 0;
  for (const p of parts) {
    const at = text.indexOf(p.slice(0, 12), from);
    const start = at >= 0 ? at : from;
    sentences.push({ text: p, start, end: start + p.length, t0: 0, t1: 0 });
    from = start + p.length;
  }
  const words = [];
  const rec = seg.audio?.words;
  if (Array.isArray(rec) && rec.length) {
    for (const w of rec) words.push({ char: w.char, end: w.char, t: w.t, stressed: false });
    words.sort((a, b) => a.char - b.char);
    const duration = seg.audio.duration || (words.length ? words[words.length - 1].t + 0.5 : 0);
    for (const s of sentences) {
      const first = words.find((w) => w.char >= s.start);
      s.t0 = first ? first.t : 0;
    }
    for (let i = 0; i < sentences.length; i++) sentences[i].t1 = i + 1 < sentences.length ? sentences[i + 1].t0 : duration;
    return { sentences, words, timing: 'recorded', duration };
  }
  // estimated: the audio stream's mouth model gives natural word durations per sentence
  let t = 0;
  const lang = voice.lang || 'en';
  const rate = voice.rate || 1;
  for (const s of sentences) {
    const tl = buildTimeline(s.text, { lang, rate });
    s.t0 = t;
    const stressedAt = new Set(tl.segs.filter((x) => x.stress).map((x) => x.wi));
    tl.words.forEach((w, wi) => words.push({ char: s.start + w.ci, end: s.start + w.end, t: t + w.t0 / 1000, stressed: stressedAt.has(wi) }));
    t += tl.total / 1000 + GAP;
    s.t1 = t;
  }
  return { sentences, words, timing: 'estimated', duration: t };
}

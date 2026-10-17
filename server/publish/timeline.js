// The aired timeline of an episode, to the word (docs/publishing/clips.md §3): when every segment, sentence and word
// was heard in a recording, and every cut. The recorder (tools/record.mjs --report) logs the director's speech
// ('speak': a segment handed to the voice, 'sentence': each sentence as its caption goes up), every recorded voice
// clip that starts ('clip': its exact audio time and length) and every cut ('shot'); the episode carries each
// segment's recorded voice with its word marks (seg.audio.words: the time and character of every word) and phrases
// (seg.audio.phrases: time, length and characters of each phrase). Put together: an exact transcript in recording time,
// so a clip starts and ends on a sentence's own sound, never inside a word.
//
//   buildTimeline(episode, report) -> { segments: [{ index, seg, slot, start, end, words, sentences }], shots, duration }
//   estimateTimeline(episode)      -> the same from the voices' lengths alone (planning before a recording)
import { splitSentences } from './text.js';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => norm(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** The sentences of a text with their character ranges in it: [{ text, from, to }]. */
export function sentenceRanges(text) {
  const src = String(text ?? '');
  const out = [];
  let pos = 0;
  for (const s of splitSentences(src)) {
    // the splitter normalises spaces: find the sentence's first word from where the last one ended
    const head = s.split(' ')[0];
    let at = src.indexOf(head, pos);
    if (at < 0) at = pos;
    // its end: walk the sentence's characters (ignoring whitespace differences)
    let i = at;
    let k = 0;
    const flat = s.replace(/\s+/g, '');
    while (i < src.length && k < flat.length) {
      if (!/\s/.test(src[i])) k++;
      i++;
    }
    out.push({ text: s, from: at, to: i });
    pos = i;
  }
  return out;
}

/** A segment's words in absolute time: [{ w, from, to, at, end }] (end: the next word's start, or the phrase's end). */
export function wordsAt(seg, start) {
  const text = String(seg?.text ?? '');
  const marks = Array.isArray(seg?.audio?.words) ? seg.audio.words : [];
  const phrases = Array.isArray(seg?.audio?.phrases) ? seg.audio.phrases : [];
  const dur = Number(seg?.audio?.duration) || 0;
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const from = Number(m.char) || 0;
    const to = from + (Number(m.len) || 0);
    const at = start + (Number(m.t) || 0);
    // the word ends where its phrase ends if it is the phrase's last, else where the next word starts
    const ph = phrases.find((p) => from >= p.char && from < p.char + p.len);
    const phraseEnd = ph ? start + ph.t + ph.dur : null;
    const next = marks[i + 1];
    let end = next ? start + next.t : start + dur;
    if (ph && (!next || next.char >= ph.char + ph.len)) end = Math.min(end, phraseEnd);
    out.push({ w: text.slice(from, to), from, to, at, end: Math.max(at, end) });
  }
  return out;
}

/** Sentences of a segment with their times (from its words), [{ text, from, to, start, end }]. */
export function sentencesAt(seg, start, words = wordsAt(seg, start)) {
  const ranges = sentenceRanges(seg?.text);
  const end0 = start + (Number(seg?.audio?.duration) || 0);
  return ranges.map((r) => {
    const inside = words.filter((w) => w.from >= r.from && w.from < r.to);
    return { ...r, start: inside.length ? inside[0].at : null, end: inside.length ? inside[inside.length - 1].end : null };
  }).map((s, i, all) => {
    // a sentence with no marks (a voice without its timing) takes the share of the segment its characters take
    if (s.start !== null) return s;
    const text = String(seg?.text || '');
    const share = (c) => start + (end0 - start) * (c / Math.max(1, text.length));
    return { ...s, start: share(s.from), end: share(s.to) };
  });
}

/**
 * The timeline from a recording's report. Each 'speak' event is matched to the next spoken segment whose text it
 * begins (the recorder keeps the first 60 characters); its sound starts at the recorded clip that starts with it
 * (within 1.5 s), else at the speak event. Unmatched segments are left out (a segment that did not air).
 */
export function buildTimeline(episode, report) {
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  const events = Array.isArray(report?.events) ? report.events : [];
  const speaks = events.filter((e) => e.type === 'speak' && Number.isFinite(e.v));
  const clips = events.filter((e) => e.type === 'clip' && Number.isFinite(e.va)).sort((a, b) => a.va - b.va);
  const shots = events.filter((e) => e.type === 'shot' && Number.isFinite(e.v)).map((e) => ({ shot: e.shot, at: e.v }));
  const out = [];
  let si = 0;
  let ci = 0;
  for (const ev of speaks) {
    const want = key(ev.text);
    if (!want) continue;
    let k = si;
    while (k < segs.length && !key(segs[k].text).startsWith(want)) k++;
    if (k >= segs.length) continue;
    const seg = segs[k];
    si = k + 1;
    // the voice clip that starts with this speech
    while (ci < clips.length && clips[ci].va < ev.v - 0.5) ci++;
    let start = ev.v;
    if (ci < clips.length && clips[ci].va <= ev.v + 1.5) {
      start = clips[ci].va;
      ci++;
    }
    const dur = Number(seg.audio?.duration) || norm(seg.text).length / 14.5;
    const words = wordsAt(seg, start);
    // spokeAt: when the director handed the segment to the voice, the moment its strap, card or board change
    out.push({ index: k, seg, type: seg.type, slot: seg.anchor || null, spokeAt: ev.v, start, end: start + dur, words, sentences: sentencesAt(seg, start, words) });
  }
  const duration = Number(report?.seconds) || (out.length ? out[out.length - 1].end + 2 : 0);
  return { segments: out, shots, duration, measured: true };
}

/** The timeline as the voices' lengths predict it (no recording): the open, each voice, the pauses between. */
export function estimateTimeline(episode, { open = 6, gap = 0.7 } = {}) {
  const segs = Array.isArray(episode?.segments) ? episode.segments : [];
  const out = [];
  let t = open;
  segs.forEach((seg, index) => {
    if (!norm(seg.text)) return;
    const dur = Number(seg.audio?.duration) || norm(seg.text).length / 14.5;
    const words = wordsAt(seg, t);
    out.push({ index, seg, type: seg.type, slot: seg.anchor || null, start: t, end: t + dur, words, sentences: sentencesAt(seg, t, words) });
    t += dur + gap;
  });
  return { segments: out, shots: [], duration: t + 4, measured: false };
}

/** The timeline entry of segment `index` (null when it did not air). */
export function segmentAt(timeline, index) {
  return timeline?.segments?.find((s) => s.index === index) || null;
}

/** The last cut at or before `t` and the first after it: { before, after } (times or null). */
export function cutsAround(timeline, t) {
  let before = null;
  let after = null;
  for (const s of timeline?.shots || []) {
    if (s.at <= t && (before === null || s.at > before)) before = s.at;
    if (s.at > t && (after === null || s.at < after)) after = s.at;
  }
  return { before, after };
}

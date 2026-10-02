// Text → viseme timeline, following the speechFrame contract in
// $SP/v2/CONTRACTS.md: classes rest, MBP, FV, TH, L, EE, AH, OH, OO, WQ, S.
//
// buildSpeech(text) turns English text into contiguous segments with natural
// durations (vowels longer, stressed vowels longer still, plosives short but
// always long enough for the lips to visibly close, pauses at punctuation).
// speechFrame(sp, t) returns { speaking, level, viseme, next, mix, wordIndex,
// charIndex, sentenceIndex, emph } where the blend toward `next` happens over
// the last BLEND seconds of each segment (≥ 50 ms, never a snap).
// If real word start times are known (TTS boundary events, Kokoro word
// times), pass them as opts.words = [{ t, char }] and each word is stretched
// to fit its slot, so lips stay in sync with the actual voice.
//
// VISEMES maps each class to mouth parameters for face.js; mouthParams()
// blends them and applies co-articulation.

export const VISEMES = {
  rest: { open: 0, wide: 0, round: 0, teeth: 0, tongue: 0, press: 0, tuck: 0 },
  MBP: { open: 0, wide: -0.1, round: 0.05, teeth: 0, tongue: 0, press: 1, tuck: 0 },
  FV: { open: 0.3, wide: 0.05, round: 0, teeth: 1, tongue: 0, press: 0, tuck: 1 },
  TH: { open: 0.38, wide: 0.08, round: 0, teeth: 0.7, tongue: 1, press: 0, tuck: 0 },
  L: { open: 0.5, wide: 0.05, round: 0, teeth: 0.6, tongue: 0.8, press: 0, tuck: 0 },
  EE: { open: 0.42, wide: 0.4, round: 0, teeth: 0.8, tongue: 0, press: 0, tuck: 0 },
  AH: { open: 0.85, wide: 0.1, round: 0.1, teeth: 0.5, tongue: 0.55, press: 0, tuck: 0 },
  OH: { open: 0.72, wide: -0.2, round: 0.75, teeth: 0, tongue: 0, press: 0, tuck: 0 },
  OO: { open: 0.4, wide: -0.45, round: 1, teeth: 0, tongue: 0, press: 0, tuck: 0 },
  WQ: { open: 0.28, wide: -0.55, round: 1, teeth: 0, tongue: 0, press: 0, tuck: 0 },
  S: { open: 0.24, wide: 0.3, round: 0, teeth: 1, tongue: 0, press: 0, tuck: 0 },
};

const BLEND = 0.055; // seconds of cross-blend at the end of each segment
const D = { vowel: 0.1, stressed: 0.145, cons: 0.06, lips: 0.085, comma: 0.2, stop: 0.42, gap: 0.0 };

const VOWELS = 'aeiouy';

// Grapheme rules, longest first: [pattern, [classes...], kind]
const RULES = [
  ['tion', ['S', 'AH', 'L'], 'v'],
  ['igh', ['AH', 'EE'], 'v'],
  ['ough', ['OH'], 'v'],
  ['th', ['TH'], 'c'],
  ['sh', ['S'], 'c'],
  ['ch', ['S'], 'c'],
  ['ph', ['FV'], 'l'],
  ['wh', ['WQ'], 'c'],
  ['qu', ['WQ'], 'c'],
  ['ng', ['L'], 'c'],
  ['ck', ['S'], 'c'],
  ['oo', ['OO'], 'v'],
  ['ee', ['EE'], 'v'],
  ['ea', ['EE'], 'v'],
  ['ie', ['EE'], 'v'],
  ['ai', ['EE'], 'v'],
  ['ay', ['EE'], 'v'],
  ['ei', ['EE'], 'v'],
  ['ey', ['EE'], 'v'],
  ['oa', ['OH'], 'v'],
  ['au', ['OH'], 'v'],
  ['aw', ['OH'], 'v'],
  ['ou', ['AH', 'OO'], 'v'],
  ['ow', ['AH', 'OO'], 'v'],
  ['oi', ['OH', 'EE'], 'v'],
  ['oy', ['OH', 'EE'], 'v'],
  ['er', ['AH', 'WQ'], 'v'],
  ['ir', ['AH', 'WQ'], 'v'],
  ['ur', ['AH', 'WQ'], 'v'],
  ['or', ['OH', 'WQ'], 'v'],
  ['ar', ['AH'], 'v'],
];
const SINGLE = {
  a: ['AH', 'v'], e: ['EE', 'v'], i: ['EE', 'v'], o: ['OH', 'v'], u: ['AH', 'v'], y: ['EE', 'v'],
  m: ['MBP', 'l'], b: ['MBP', 'l'], p: ['MBP', 'l'], f: ['FV', 'l'], v: ['FV', 'l'],
  l: ['L', 'c'], n: ['L', 'c'], t: ['L', 'c'], d: ['L', 'c'],
  s: ['S', 'c'], z: ['S', 'c'], c: ['S', 'c'], x: ['S', 'c'], j: ['S', 'c'], k: ['S', 'c'], g: ['S', 'c'],
  r: ['WQ', 'c'], w: ['WQ', 'c'], q: ['WQ', 'c'], h: ['AH', 'h'],
};

function wordPhones(word) {
  const out = [];
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  let i = 0;
  // silent final e (but not in short words like "the", "be")
  const end = w.length > 3 && w.endsWith('e') && !VOWELS.includes(w[w.length - 2]) ? w.length - 1 : w.length;
  while (i < end) {
    let hit = null;
    for (const [pat, cls, kind] of RULES) {
      if (w.startsWith(pat, i) && i + pat.length <= end) {
        hit = [pat.length, cls, kind];
        break;
      }
    }
    if (!hit) {
      const ch = w[i];
      if (i > 0 && w[i - 1] === ch && !VOWELS.includes(ch)) {
        i++; // double consonants are one sound
        continue;
      }
      const s = SINGLE[ch];
      hit = s ? [1, [s[0]], s[1]] : [1, ['rest'], 'c'];
    }
    for (const c of hit[1]) out.push({ v: c, kind: hit[2], at: i });
    i += hit[0];
  }
  return out;
}

/**
 * @param text  the line (cues already stripped)
 * @param opts  { t0 = 0, rate = 1, words?: [{ t, char }] word start times from a real voice }
 * @returns { text, segs: [{ v, t0, t1, word, char, sentence, stress }], words: [{ t0, t1, char, text }], t0, t1 }
 */
export function buildSpeech(text, { t0 = 0, rate = 1, words: timed = null } = {}) {
  const segs = [];
  const words = [];
  let t = t0;
  let sentence = 0;
  const re = /([A-Za-z']+)|([,;:])|([.!?]+)|(\s+)/g;
  let m;
  let wi = 0;
  const push = (v, dur, char, stress = 0) => {
    const last = segs[segs.length - 1];
    if (last && last.v === v && v !== 'MBP') {
      last.t1 += dur;
      return;
    }
    segs.push({ v, t0: t, t1: t + dur, word: wi, char, sentence, stress });
    t += dur;
  };
  while ((m = re.exec(text))) {
    if (m[1]) {
      const word = m[1];
      const phones = wordPhones(word);
      const syll = phones.filter((p) => p.kind === 'v').length;
      const wStart = t;
      // stress: first vowel of a word, a little more for long or sentence-initial words
      let firstVowel = true;
      for (const ph of phones) {
        let dur;
        let stress = 0;
        if (ph.kind === 'v') {
          stress = firstVowel ? (syll > 1 || word.length > 4 ? 1 : 0.5) : 0;
          dur = stress >= 1 ? D.stressed : D.vowel;
          firstVowel = false;
        } else if (ph.kind === 'l') dur = D.lips;
        else if (ph.kind === 'h') dur = 0.045;
        else dur = D.cons;
        push(ph.v, dur / rate, m.index + ph.at, stress);
      }
      words.push({ t0: wStart, t1: t, char: m.index, text: word });
      wi++;
    } else if (m[2]) {
      push('rest', D.comma / rate, m.index);
    } else if (m[3]) {
      push('rest', D.stop / rate, m.index);
      sentence++;
    }
  }
  // close the mouth at the end
  if (!segs.length || segs[segs.length - 1].v !== 'rest') push('rest', 0.12, text.length);
  const sp = { text, segs, words, t0, t1: t };
  if (timed && timed.length) retime(sp, timed);
  return sp;
}

/** Stretch each word's segments to start at the given word times (TTS boundary / Kokoro words). */
function retime(sp, timed) {
  const n = Math.min(sp.words.length, timed.length);
  for (let i = 0; i < n; i++) {
    const w = sp.words[i];
    const start = timed[i].t;
    const end = i + 1 < timed.length ? timed[i + 1].t : start + (w.t1 - w.t0);
    const natural = w.t1 - w.t0;
    const k = Math.min(1.6, Math.max(0.5, (end - start) / Math.max(0.05, natural)));
    for (const s of sp.segs) {
      if (s.word !== i) continue;
      s.t0 = start + (s.t0 - w.t0) * k;
      s.t1 = start + (s.t1 - w.t0) * k;
    }
    w.t1 = start + natural * k;
    w.t0 = start;
  }
  // fill gaps between words with rest
  sp.segs.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < sp.segs.length; i++) if (sp.segs[i].t0 < sp.segs[i - 1].t1) sp.segs[i].t0 = sp.segs[i - 1].t1;
  sp.t1 = sp.segs[sp.segs.length - 1].t1;
}

function findSeg(segs, t) {
  let lo = 0, hi = segs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const FRAME = { slot: null, speaking: false, level: 0, viseme: 'rest', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: -1, emph: 0 };

/** The contract's speechFrame for a built speech at time t (seconds). Returns a reused object. */
export function speechFrame(sp, t, slot = null, out = FRAME) {
  out.slot = slot;
  if (!sp || t < sp.t0 || t >= sp.t1) {
    out.speaking = false;
    out.level = 0;
    out.viseme = out.next = 'rest';
    out.mix = 0;
    out.wordIndex = out.charIndex = out.sentenceIndex = -1;
    out.emph = 0;
    return out;
  }
  const segs = sp.segs;
  const i = findSeg(segs, t);
  const s = segs[i];
  const n = segs[i + 1];
  const blend = Math.min(BLEND, (s.t1 - s.t0) * 0.6);
  const mix = n ? Math.max(0, Math.min(1, (t - (s.t1 - blend)) / blend)) : 0;
  out.speaking = true;
  out.viseme = s.v;
  out.next = n ? n.v : 'rest';
  out.mix = mix * mix * (3 - 2 * mix);
  out.wordIndex = s.word;
  out.charIndex = s.char;
  out.sentenceIndex = s.sentence;
  const a = VISEMES[out.viseme], b = VISEMES[out.next];
  out.level = a.open + (b.open - a.open) * out.mix;
  // emphasis: a soft bump that peaks shortly after a stressed vowel starts
  let e = 0;
  for (let k = Math.max(0, i - 4); k <= i; k++) {
    const sk = segs[k];
    if (sk.stress < 1) continue;
    const dt = t - sk.t0;
    if (dt < 0) continue;
    const v = dt < 0.08 ? dt / 0.08 : Math.exp(-(dt - 0.08) / 0.28);
    if (v > e) e = v;
  }
  out.emph = e;
  return out;
}

const SHAPE_KEYS = ['round', 'teeth', 'tongue', 'press', 'tuck'];

/**
 * Blend the frame's visemes into face mouth parameters (written into `face`).
 * The viseme pair gives the SHAPE (width, rounding, teeth, tongue, lip press or
 * tuck); the opening follows the frame's `level` (the speechFrame jaw: one
 * smooth opening per syllable, real loudness with recorded voices), so the
 * mouth never flaps faster than the voice. Width goes to `mwide`, never to the
 * eyes' `wide` channel.
 */
export function mouthParams(fr, face, gain = 1) {
  const a = VISEMES[fr.viseme] || VISEMES.rest;
  const b = VISEMES[fr.next] || VISEMES.rest;
  const k = fr.mix || 0;
  for (const key of SHAPE_KEYS) face[key] = a[key] + (b[key] - a[key]) * k;
  face.mwide = a.wide + (b.wide - a.wide) * k;
  const shape = a.open + (b.open - a.open) * k;
  const level = Number.isFinite(fr.level) ? fr.level : shape;
  face.open = Math.max(0, Math.min(1, level * gain));
  // "th" is quiet (low loudness) but the tongue shows between parted teeth: never a closed line
  if (fr.speaking) {
    const th = (fr.viseme === 'TH' ? 1 - k : 0) + (fr.next === 'TH' ? k : 0);
    if (th > 0.5) face.open = Math.max(face.open, Math.min(1, 0.48 * (th - 0.5) * gain));
  }
  // a pressed m/b/p wins over the blend while the lips meet (also on the way into one)
  if ((fr.viseme === 'MBP' && k < 0.65) || (fr.next === 'MBP' && k > 0.45)) {
    face.press = 1;
    face.open = 0;
  }
  face.jaw = face.open * 0.45; // units; head.js caps the drop at 2 px
  return face;
}

// Speech layer of the canvas25d rig (owner: FACES stream): the mouth from
// visemes, plus the small brow lifts and head dips that stressed syllables
// cause, slow phrase-level head arcs, and the listener's resting posture.
//
// perf.speech is either
//   - a timeline built by visemes.js buildSpeech(text, { t0, words? }) (lab
//     pages and the frozen demos, deterministic), or
//   - a live source { frame(t) } (liveSpeech(audio, slot)) on the AudioEngine's
//     speechFrame contract ({ speaking, level, viseme, next, mix, accent, pause,
//     sentenceIndex, ... }, see $SP/v2/CONTRACTS.md).
// Either way sampleSpeech() returns the contract frame plus smoothed signals:
//   env      the voice envelope (30 ms attack, 120 ms release): f.level for
//            UNIT-8's speech indicator (PRESENTERS B)
//   jawEnv   a slower envelope (70 ms attack, 220 ms release) for the jaw drop, so
//            the chin moves with the phrase while the lips follow every syllable
//   emph     a slow envelope of the stressed syllables (90 ms in, 420 ms out):
//            brows and head move with the phrase, never twitch per syllable
//   act      a slow "is talking" envelope (0.25 s in, 0.6 s out): head arcs and
//            the listening posture cross-fade instead of popping at turn changes
//   pauseAt, sentAt, endAt   when the last comma pause began, the last sentence
//            changed and the speech last stopped (s): idle.js blinks on them
import { speechFrame, mouthParams } from './visemes.js';
import { smooth } from './space.js';

const FAR = -1e9;
const MIN_HOLD = 0.042; // s a dominant mouth shape is held at least

/** Smooth non-repeating drift in -1..1 (same recipe as idle.js wobble; kept here to avoid an import cycle). */
function wobble(t, seed) {
  return 0.5 * Math.sin(t * 1.13 + seed * 1.7) + 0.3 * Math.sin(t * 2.31 + seed * 2.9) + 0.2 * Math.sin(t * 3.77 + seed * 4.3);
}

/** One step of a one-pole envelope with separate rise / fall time constants (s). */
function ease(v, target, up, down, dt) {
  return v + (target - v) * (1 - Math.exp(-dt / (target > v ? up : down)));
}

function blankFrame(slot) {
  return {
    slot, speaking: false, level: 0, viseme: 'rest', next: 'rest', mix: 0, accent: 0, pause: false,
    sentenceIndex: -1, wordIndex: -1, charIndex: -1, emph: 0, env: 0, jawEnv: 0, act: 0, pauseAt: FAR, sentAt: FAR, endAt: FAR, startAt: FAR,
  };
}

/** The speech frame of `sp` at t (either kind of source), with env / emph / act. */
export function sampleSpeech(sp, t) {
  if (sp && typeof sp.frame === 'function') {
    const fr = sp.frame(t);
    if (fr.emph === undefined) fr.emph = fr.accent || 0;
    if (fr.env === undefined) fr.env = fr.level || 0;
    if (fr.jawEnv === undefined) fr.jawEnv = fr.env;
    if (fr.act === undefined) fr.act = fr.speaking ? 1 : 0;
    return fr;
  }
  const fr = speechFrame(sp, t, null);
  // a built timeline is pure in t: derive the slow signals from its span
  fr.env = fr.level;
  fr.act = sp ? smooth((t - sp.t0 + 0.05) / 0.3) * (1 - smooth((t - sp.t1) / 0.6)) : 0;
  fr.pauseAt = fr.sentAt = FAR;
  fr.endAt = sp && t >= sp.t1 ? sp.t1 : FAR;
  return fr;
}

/**
 * A live speech source for perf.speech: the AudioEngine's mouth for one slot.
 * `t` is in seconds on the renderer clock (performance.now() / 1000), converted
 * by `toNow`. The source samples speechFrame ONCE per new t (the rig asks for
 * the same instant from several layers and the follow-through pose asks for an
 * earlier one: both get the current frame) into a reused object, and keeps the
 * envelopes as state. A jump (first frame, a seek, a lab capture out of order)
 * pre-rolls 0.5 s at 60 Hz from a quiet state, so any instant renders the same
 * whatever came before it, within a frame's worth of envelope.
 */
export function liveSpeech(audio, slot, toNow = (t) => t * 1000) {
  const raw = {};
  const fr = blankFrame(slot);
  let lastT = null;
  let wasPause = false, wasSpeaking = false, lastSentence = -1;
  let shown = 'rest', shownAt = -1e9;
  const reset = () => {
    Object.assign(fr, blankFrame(slot));
    wasPause = false;
    wasSpeaking = false;
    lastSentence = -1;
    shown = 'rest';
    shownAt = -1e9;
  };
  const step = (t, dt) => {
    audio.speechFrame(toNow(t), slot, raw);
    fr.speaking = !!raw.speaking;
    fr.level = raw.level || 0;
    fr.viseme = raw.viseme || 'rest';
    fr.next = raw.next || 'rest';
    fr.mix = raw.mix || 0;
    fr.accent = raw.accent || 0;
    fr.pause = !!raw.pause;
    fr.sentenceIndex = raw.sentenceIndex ?? -1;
    fr.wordIndex = raw.wordIndex ?? -1;
    fr.charIndex = raw.charIndex ?? -1;
    // the dominant shape never changes again within MIN_HOLD of its last change
    // (lip closures excepted): fast phones blend, they do not flicker
    const dom = fr.mix > 0.5 ? fr.next : fr.viseme;
    if (dom !== shown) {
      if (t - shownAt >= MIN_HOLD || dom === 'MBP' || !fr.speaking) {
        shown = dom;
        shownAt = t;
      } else if (fr.viseme === shown) fr.mix = Math.min(fr.mix, 0.49);
      else if (fr.next === shown) fr.mix = Math.max(fr.mix, 0.51);
      else {
        fr.next = fr.viseme = shown;
        fr.mix = 0;
      }
    }
    fr.env = ease(fr.env, fr.level, 0.03, 0.12, dt);
    // the jaw (chin outline) moves with the phrase, not with every syllable: a chin
    // that bobs a pixel per syllable reads as chattering at this resolution
    fr.jawEnv = ease(fr.jawEnv, fr.speaking ? fr.level : 0, 0.07, 0.22, dt);
    fr.emph = ease(fr.emph, fr.accent, 0.09, 0.42, dt);
    fr.act = ease(fr.act, fr.speaking ? 1 : 0, 0.25, 0.6, dt);
    if (fr.pause && !wasPause) fr.pauseAt = t;
    if (fr.speaking && !wasSpeaking) fr.startAt = t;
    if (!fr.speaking && wasSpeaking) fr.endAt = t;
    if (fr.speaking && wasSpeaking && fr.sentenceIndex !== lastSentence) fr.sentAt = t;
    wasPause = fr.pause;
    wasSpeaking = fr.speaking;
    if (fr.speaking) lastSentence = fr.sentenceIndex;
  };
  return {
    live: true,
    slot,
    frame(t) {
      if (t === lastT) return fr;
      if (lastT !== null && t < lastT && lastT - t < 0.5) return fr; // follow-through pose: same frame
      if (lastT === null || t < lastT || t - lastT > 0.5) {
        reset();
        for (let k = 30; k >= 1; k--) step(t - k / 60, 1 / 60);
        step(t, 1 / 60);
      } else step(t, t - lastT);
      lastT = t;
      return fr;
    },
  };
}

/** Layer 6. Writes the mouth channels into c; returns the speech frame. */
export function applySpeech(c, persona, perf, t) {
  const p = persona;
  const fr = sampleSpeech(perf.speech, t);
  c.speaking = fr.speaking;
  const gain = perf.gain ?? 1;
  mouthParams(fr, c, gain);
  if (fr.jawEnv !== undefined) c.jaw = Math.min(1, fr.jawEnv * gain) * 0.45; // units; head.js caps it at 2 px
  c.level = fr.env || 0;
  c.t = t;
  c.speech = perf.speech || null;
  const act = fr.act || 0;
  const seed = perf.seed ?? 0;
  if (act > 0.001 || fr.emph > 0.001) {
    // emphasis: a small brow lift and a dip of the head into the stressed words
    // (≤ 1 px at close-up), on a slow envelope so nothing reads as a twitch
    const e = (fr.emph || 0) * p.energy;
    c.brow += 0.24 * e;
    c.pitch += 0.022 * e - 0.008 * act;
    c.hy += 0.12 * e;
    // phrase-level head arcs: a slow drift while talking, faded in and out with the turn
    c.yaw += 0.05 * p.headMotion * act * wobble(t * 0.55, seed + 3.1);
    c.roll += 0.012 * p.headMotion * act * wobble(t * 0.45, seed + 7.7);
  }
  if (perf.listen && act < 0.999) {
    // listening: the head settles a touch lower and tilts a little, slowly and
    // never on a cycle (applyListen's old 5.2 s nod was ruled mechanical)
    const w = 1 - act;
    c.roll += 0.016 * w * wobble(t * 0.19, seed + 11.3);
    c.pitch += 0.01 * w;
  }
  return fr;
}

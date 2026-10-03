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
//   ohold    the opening held for 80 ms (a peak hold): face.js opens the small mouths
//            of the wide / medium tiers from it, so a 1 px mouth that shows each syllable
//            never flickers for a single frame between syllables (critic r3)
import { speechFrame, mouthParams } from './visemes.js';
import { smooth } from './space.js';

const FAR = -1e9;
const MIN_HOLD = 0.042; // s a dominant mouth shape is held at least
const MBP_LEAD = 1 / 60; // a lip closure may cut that hold short by one 60 Hz frame (it is the shape that must show)
const RISE = 15; // per s: the opening rises at most 0.25 per 60 Hz frame (shut to half open over ~2 frames, never in one)
const OHOLD = 0.08; // s the visible opening is held (ohold)
const PREROLL = 180; // steps of 1/60 s replayed after a jump: 3 s, five times the slowest envelope's memory (act, 0.6 s)

/** Smooth non-repeating drift in -1..1 (same recipe as idle.js wobble; kept here to avoid an import cycle). */
function wobble(t, seed) {
  return 0.5 * Math.sin(t * 1.13 + seed * 1.7) + 0.3 * Math.sin(t * 2.31 + seed * 2.9) + 0.2 * Math.sin(t * 3.77 + seed * 4.3);
}

/** Seeded head attitude of sentence `si` on axis `k`, in -1..1 (0 before the first sentence). */
function att(seed, si, k) {
  if (si < 0) return 0;
  const v = Math.sin((si + 1) * 12.9898 + seed * 78.233 + k * 37.719) * 43758.5453;
  return 2 * (v - Math.floor(v)) - 1;
}

/** One step of a one-pole envelope with separate rise / fall time constants (s). */
function ease(v, target, up, down, dt) {
  return v + (target - v) * (1 - Math.exp(-dt / (target > v ? up : down)));
}

function blankFrame(slot) {
  return {
    slot, speaking: false, level: 0, voice: -1, viseme: 'rest', next: 'rest', mix: 0, accent: 0, pause: false,
    sentenceIndex: -1, wordIndex: -1, charIndex: -1, emph: 0, env: 0, jawEnv: 0, act: 0, pauseAt: FAR, sentAt: FAR, endAt: FAR, startAt: FAR,
    pausePrev: FAR, endPrev: FAR, ohold: 0, vquiet: false,
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
  // a built timeline is pure in t: the held opening from two earlier instants (sampled first:
  // speechFrame fills one shared object), the slow signals from its span
  const l2 = sp ? speechFrame(sp, t - 0.08, null).level : 0;
  const l1 = sp ? speechFrame(sp, t - 0.04, null).level : 0;
  const fr = speechFrame(sp, t, null);
  fr.ohold = Math.max(fr.level, l1, l2);
  fr.env = fr.level;
  fr.act = sp ? smooth((t - sp.t0 + 0.05) / 0.3) * (1 - smooth((t - sp.t1) / 0.6)) : 0;
  fr.pauseAt = fr.sentAt = fr.pausePrev = fr.endPrev = FAR;
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
 * pre-rolls 3 s on the 60 Hz grid from a quiet state (five times the slowest
 * envelope's memory: act releases over 0.6 s), so an instant renders the same as in
 * a 60 fps walk through it, within ~1 % of that envelope (critic r3).
 */
export function liveSpeech(audio, slot, toNow = (t) => t * 1000) {
  const raw = {};
  const fr = blankFrame(slot);
  let lastT = null;
  let wasPause = false, wasSpeaking = false, lastSentence = -1, opened = false;
  let shown = 'rest', shownAt = -1e9, lastShape = 'rest', lastShapeAt = -1e9;
  let lastLevel = 0, oholdAt = -1e9, vRef = 0, vRefAt = -1e9, vTrend = 0;
  const reset = () => {
    lastLevel = 0;
    oholdAt = -1e9;
    vRef = 0;
    vRefAt = -1e9;
    vTrend = 0;
    Object.assign(fr, blankFrame(slot));
    wasPause = false;
    wasSpeaking = false;
    lastSentence = -1;
    opened = false;
    shown = 'rest';
    shownAt = -1e9;
    lastShape = 'rest';
    lastShapeAt = -1e9;
  };
  const step = (t, dt) => {
    raw.voice = -1; // an engine without the loudness field leaves it alone
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
    if (dom !== 'rest') {
      lastShape = dom;
      lastShapeAt = t;
    }
    if (dom !== shown) {
      if (t - shownAt >= (dom === 'MBP' ? MIN_HOLD - MBP_LEAD : MIN_HOLD) || !fr.speaking) {
        shown = dom;
        shownAt = t;
      } else if (fr.viseme === shown) fr.mix = Math.min(fr.mix, 0.49);
      else if (fr.next === shown) fr.mix = Math.max(fr.mix, 0.51);
      else {
        fr.next = fr.viseme = shown;
        fr.mix = 0;
      }
    }
    // the recorded voice gates the mouth when the engine sends its loudness (`voice`,
    // 0..1, CONTRACTS request to the audio stream; absent or < 0 without a recording):
    // the engine's timeline only re-anchors when a recorded word is reached, so after a
    // comma it can run into the next word while the recording is still silent (the lips
    // part early) or rest while the voice is still sounding (the lips shut under sound)
    const voice = typeof raw.voice === 'number' && raw.voice >= 0 ? raw.voice : -1;
    fr.voice = voice;
    // the voice's trend over ~15 ms (the engine caches its loudness for 8 ms): the engine smooths
    // it with a 60 ms release, so a falling voice under 0.15 is already a pause in the recording
    if (voice < 0) {
      vTrend = 0;
      vRefAt = -1e9;
    } else if (t - vRefAt >= 0.015) {
      vTrend = vRefAt > -1e8 ? voice - vRef : 0;
      vRef = voice;
      vRefAt = t;
    }
    fr.vquiet = voice >= 0 && voice < 0.15 && vTrend < 0;
    if (voice >= 0) {
      // silence closes the mouth; the opening returns with the sound (smoothstep 0.03..0.3)
      const g = voice <= 0.03 ? 0 : voice >= 0.3 ? 1 : smooth((voice - 0.03) / 0.27);
      fr.level *= g;
      // audible voice never sits behind closed lips (m/b/p excepted), also when the
      // engine's sentence timeline has already ended while the recording still sounds:
      // a small parting, eased in with the loudness so it never pops
      const pressing = fr.viseme === 'MBP' ? fr.mix < 0.65 : fr.next === 'MBP' && fr.mix > 0.45;
      // the murmur after a word-final m/b/p is made with the lips still closed: no floor
      // until another shape has shown (else the lips part, shut in the pause and part again)
      // (a murmur is short: after 0.1 s an audible voice is the next word, not the m)
      const murmur = lastShape === 'MBP' && t - lastShapeAt < 0.1 && (fr.viseme === 'rest' || fr.viseme === 'MBP') && (fr.next === 'rest' || fr.mix < 0.5);
      // (a rising voice reaches the visible parting sooner, so a word's first sound is seen
      // with it; a falling one lets go sooner, so the lips close in the pause after it)
      const rising = vTrend > 0;
      if (!pressing && !murmur && voice > (rising ? 0.1 : 0.2)) {
        const floor = 0.16 * (rising ? smooth((voice - 0.1) / 0.18) : smooth((voice - 0.2) / 0.2));
        if (fr.level < floor) fr.level = floor;
      }
    } else if (fr.viseme === 'rest' && fr.next !== 'rest' && opened) {
      // no loudness from the engine: out of a comma or sentence pause the lips part with the
      // sound, not with the timeline's blend into the first vowel (with recorded voices that
      // blend can lead the recorded word by up to ~0.1 s): while the shape is still mostly
      // 'rest', the opening grows with the blend. Not before the first word of the speech has
      // opened the lips: the engine starts the clip and its timeline together, and the gate
      // only made the first word open ~150 ms late (critic r2)
      fr.level *= fr.mix * fr.mix;
    }
    // the opening never jumps from shut to half open in one frame (critic r3: 21 % of the onsets
    // rose 0.1 → 0.5 in under 25 ms); closing is free (a lip closure is instant)
    // (the envelopes below keep the unlimited level: env is UNIT-8's indicator, 30 ms attack)
    const level = fr.level;
    if (fr.level > lastLevel + RISE * dt) fr.level = lastLevel + RISE * dt;
    lastLevel = fr.level;
    // the visible opening, held for OHOLD after its last peak (see ohold in the header); not
    // into a pause (the recording fell silent): there the lips close with the sound
    if (fr.level >= fr.ohold || t - oholdAt > OHOLD || fr.vquiet) {
      fr.ohold = fr.level;
      oholdAt = t;
    }
    if (!fr.speaking) opened = false;
    else if (fr.level > 0.12) opened = true;
    fr.env = ease(fr.env, level, 0.03, 0.12, dt);
    // the jaw (chin outline) moves with the phrase, not with every syllable: a chin
    // that bobs a pixel per syllable reads as chattering at this resolution
    fr.jawEnv = ease(fr.jawEnv, fr.speaking ? level : 0, 0.07, 0.22, dt);
    fr.emph = ease(fr.emph, fr.accent, 0.09, 0.42, dt);
    fr.act = ease(fr.act, fr.speaking ? 1 : 0, 0.25, 0.6, dt);
    // (the previous pause / end too: idle.js keeps an event blink's place in the timetable until
    // two newer events have happened, so forgetting one never resurrects a blink mid-curve)
    if (fr.pause && !wasPause) {
      fr.pausePrev = fr.pauseAt;
      fr.pauseAt = t;
    }
    if (fr.speaking && !wasSpeaking) fr.startAt = t;
    if (!fr.speaking && wasSpeaking) {
      fr.endPrev = fr.endAt;
      fr.endAt = t;
    }
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
        // on the 60 Hz grid (a 60 fps walk samples the same instants, so the shape holds and
        // the held opening decide alike), then the instant itself
        reset();
        const g = Math.floor(t * 60);
        let prev = (g - PREROLL - 1) / 60;
        for (let k = PREROLL; k >= 0; k--) {
          const tk = (g - k) / 60;
          if (tk >= t) break;
          step(tk, tk - prev);
          prev = tk;
        }
        step(t, Math.max(1e-4, t - prev));
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
    // a new head attitude per sentence (live voices only, so the frozen demos keep their
    // approved motion): presenters settle into a slightly different angle for each
    // sentence instead of holding one pose; eased over 0.7 s from the sentence's first word
    if (perf.speech && perf.speech.live && fr.sentenceIndex >= 0) {
      const si = fr.sentenceIndex;
      const k = fr.sentAt > FAR ? smooth((t - fr.sentAt) / 0.7) : 1;
      const hm = p.headMotion * act;
      c.yaw += hm * 0.035 * (att(seed, si, 1) * k + att(seed, si - 1, 1) * (1 - k));
      c.roll += hm * 0.016 * (att(seed, si, 2) * k + att(seed, si - 1, 2) * (1 - k));
      c.pitch += hm * 0.01 * (att(seed, si, 3) * k + att(seed, si - 1, 3) * (1 - k));
    }
  }
  if (perf.listen && act < 0.999) {
    // listening: the head settles a touch lower and tilts a little, slowly and
    // never on a cycle (applyListen's old 5.2 s nod was ruled mechanical)
    const w = 1 - act;
    c.roll += 0.016 * w * wobble(t * 0.19, seed + 11.3);
    c.roll += 0.012 * w; // the attentive tilt, a touch toward the partner (partner space)
    c.pitch += 0.01 * w;
  }
  return fr;
}

// Speech layer of the canvas25d rig (owner: FACES stream): the mouth from
// visemes, plus the small brow lifts, nods and phrase-level head arcs that
// stressed syllables cause.
//
// perf.speech is either
//   - a timeline built by visemes.js buildSpeech(text, { t0, words? }) (lab pages,
//     deterministic), or
//   - a live source { frame(t) } returning the AudioEngine speechFrame contract
//     ({ speaking, level, viseme, next, mix, accent, pause, sentenceIndex, ... },
//     see $SP/v2/CONTRACTS.md); liveSpeech(audio, slot) makes one. `accent` is
//     used as the emphasis when the source has no `emph`.
import { speechFrame, mouthParams } from './visemes.js';

/** The speech frame of `sp` at t (either kind of source). */
export function sampleSpeech(sp, t) {
  if (sp && typeof sp.frame === 'function') {
    const fr = sp.frame(t);
    if (fr.emph === undefined) fr.emph = fr.accent || 0;
    return fr;
  }
  return speechFrame(sp, t, null);
}

/** A live speech source for perf.speech: the AudioEngine's mouth for one slot (t in seconds, same clock as performance.now()). */
export function liveSpeech(audio, slot, toNow = (t) => t * 1000) {
  return { live: true, slot, frame: (t) => audio.speechFrame(toNow(t), slot) };
}

/** Layer 6. Writes the mouth channels into c; returns the speech frame. */
export function applySpeech(c, persona, perf, t) {
  const p = persona;
  const fr = sampleSpeech(perf.speech, t);
  c.speaking = fr.speaking;
  mouthParams(fr, c, perf.gain ?? 1);
  if (fr.speaking) {
    const e = fr.emph * p.energy;
    c.brow += 0.42 * e;
    c.pitch += 0.03 * e - 0.012;
    c.hy += 0.25 * e;
    // phrase-level head arcs: a slow drift that changes direction each sentence
    c.yaw += 0.05 * p.headMotion * Math.sin(t * 0.9 + fr.sentenceIndex * 2.1);
    c.roll += 0.012 * p.headMotion * Math.sin(t * 0.7 + fr.sentenceIndex);
  }
  return fr;
}

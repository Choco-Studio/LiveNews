// Theme jingles for the programme opens (chiptune descriptions read by
// AudioEngine.playTune). Each is time-fitted so its last chord lands as the
// lock-up settles and rings out to the cut at 4 s. When the audio stream
// provides a shared signature (themeFor in audio.js) the opens use that instead.

const WN_TUNE = {
  bpm: 135,
  wave: 'square',
  // brass-like fanfare in D minor, resolving to a bright D major chord
  notes: 'R:2 D4+A4+D5:1 F5:0.5 E5:0.5 D5:0.75 A4:0.25 C5:0.5 D5:0.5 D5+A5:1.5 G5:0.25 F5:0.25 E5:0.5 G5:0.5 A5:0.5 D5+F#5+A5+D6:2',
  // timpani roll, then pounding low strokes
  bass: 'D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:0.25 D2:1 A1:0.5 A1:0.5 D2:0.5 R:0.5 F2:0.5 C2:0.5 D2:1.5 G1:0.5 C2:0.5 A1:0.5 A1:0.25 A1:0.25 D2:2',
  bassWave: 'triangle',
  drums: 'S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 S:0.25 K:1 H:0.5 K:0.5 S:0.5 H:0.5 K:0.5 S:0.25 S:0.25 K:1 S:0.5 K:0.5 K:0.5 S:0.5 S:0.25 S:0.25 K:2',
};

const TB_TUNE = {
  bpm: 150,
  wave: 'square',
  // boot bleeps, then a driving A minor / F / C / G-E arpeggio
  notes: 'C6:0.125 R:0.375 C6:0.125 R:0.375 G6:0.125 R:0.125 C7:0.25 R:0.5 '
    + 'A4:0.25 C5:0.25 E5:0.25 A5:0.25 C6:0.25 A5:0.25 E5:0.25 C5:0.25 '
    + 'F4:0.25 A4:0.25 C5:0.25 F5:0.25 A5:0.25 F5:0.25 C5:0.25 A4:0.25 '
    + 'C5:0.25 E5:0.25 G5:0.25 C6:0.25 E6:0.25 C6:0.25 G5:0.25 E5:0.25 '
    + 'G4:0.25 B4:0.25 D5:0.25 G5:0.25 B5:0.25 G#5:0.25 B5:0.25 E6:0.25 '
    + 'G#5:0.25 B5:0.25 A4+C5+E5+A5:2',
  bass: 'R:2 A2:0.5 A3:0.5 A2:0.5 A3:0.5 F2:0.5 F3:0.5 F2:0.5 F3:0.5 C3:0.5 C4:0.5 C3:0.5 C4:0.5 G2:0.5 G3:0.5 E2:0.5 E3:0.5 E2:0.25 E2:0.25 A2:2',
  bassWave: 'sawtooth',
  drums: 'R:1.5 H:0.25 H:0.25 '
    + 'K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.25 H:0.25 '
    + 'S:0.25 S:0.25 K:2',
};

const CO_TUNE = {
  bpm: 100,
  wave: 'triangle',
  // shimmering E-lydian rise into hyperspace, a floating melody, Emaj7 landing
  notes: 'E4:0.25 B4:0.25 F#5:0.25 G#5:0.25 B5:0.25 D#6:0.25 F#6:0.25 B6:0.25 '
    + 'B5:1 A#5:0.5 F#5:0.5 G#5:1.5 D#5:0.5 F#5:1 E5+G#5+B5+D#6:2',
  bass: 'R:1 E2:1 E3:1 C#3:1 A2:2 B2:1 E2+B2:2',
  bassWave: 'sine',
  drums: 'H:0.25 H:0.25 H:0.25 H:0.25 H:0.25 H:0.25 S:0.25 S:0.25 K:2 K:1 H:0.5 H:0.5 S:0.5 S:0.5 K:2',
};

const MM_TUNE = {
  bpm: 146,
  wave: 'square',
  // "cha-ching" pickup, a strutting major riff, big C major finish
  notes: 'G4:0.25 C5:0.25 E5:0.25 G5:0.25 C6:0.5 R:0.25 G5:0.25 A5:0.5 G5:0.5 '
    + 'E5:0.5 F5:0.25 G5:0.25 R:0.25 C5:0.25 E5:0.5 F5:0.5 A5:0.5 C6:0.5 A5:0.25 C6:0.25 '
    + 'D6:0.75 C6:0.25 B5:0.5 G5:0.5 C5+E5+G5+C6:2',
  bass: 'C3:0.5 G2:0.5 C3:0.5 C4:0.5 A2:0.5 A3:0.5 F2:0.5 F3:0.5 G2:0.5 G3:0.5 F2:0.5 F3:0.5 A2:0.5 A3:0.5 G2:0.5 G3:0.5 G2:0.5 B2:0.5 C3:2',
  bassWave: 'triangle',
  drums: 'K:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 H:0.5 S:0.25 S:0.25 K:2',
};

const N6_TUNE = {
  bpm: 190,
  wave: 'square',
  // ticking clock, a rising fill, the punch, a racing riff and the stab
  notes: 'E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 E6:0.25 R:0.25 B5:0.25 R:0.25 '
    + 'C6:0.25 D6:0.25 E6:0.25 F#6:0.25 G5+B5+D6+G6:1 '
    + 'D6:0.5 B5:0.5 G5:0.5 B5:0.25 D6:0.25 E6:0.5 D6:0.5 B5:0.5 A5:0.5 G5+B5+D6+G6:2',
  bass: 'G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 G2:0.5 D2:0.25 D2:0.25 D2:0.25 D2:0.25 G2:1 '
    + 'G2:0.5 G3:0.5 E2:0.5 E3:0.5 C2:0.5 C3:0.5 D2:0.5 D3:0.5 G2:2',
  bassWave: 'square',
  drums: 'K:0.5 H:0.5 K:0.5 H:0.5 K:0.5 H:0.5 K:0.5 H:0.5 S:0.25 S:0.25 S:0.25 S:0.25 K:1 '
    + 'K:0.5 H:0.5 S:0.5 H:0.5 K:0.5 H:0.5 S:0.5 S:0.5 K:2',
};

const GEN_TUNE = {
  bpm: 146,
  wave: 'square',
  notes: 'C5:0.5 G4:0.25 C5:0.25 E5:0.5 G5:0.5 C6:1 B5:0.5 G5:0.5 A5:0.5 G5:0.25 E5:0.25 F5:0.5 A5:0.5 G5:1 E5:0.5 F5:0.5 D5:0.5 B4:0.5 C5+E5+G5+C6:2',
  bass: 'C3:1 C3:1 A2:1 F2:1 G2:1 G2:1 F2:1 G2:1 G2:0.5 B2:0.5 C3:2',
  bassWave: 'triangle',
  drums: 'K:1 S:1 K:1 S:1 K:1 S:1 K:1 S:1 K:0.5 S:0.5 K:2',
};

/** Beats in a track string ("C5:0.5 R:1 ..."). */
function beatsOf(track) {
  let n = 0;
  for (const tok of String(track || '').trim().split(/\s+/)) {
    const d = Number(tok.split(':')[1]);
    if (Number.isFinite(d)) n += d;
  }
  return n;
}

/**
 * Re-times a tune so its melody ends exactly at `seconds`, with the final
 * chord (its last `tail` beats) starting at about `settle` seconds.
 */
export function fitTune(tune, seconds = 4.0) {
  const beats = Math.max(beatsOf(tune.notes), beatsOf(tune.bass), beatsOf(tune.drums));
  if (!beats) return tune;
  return { ...tune, bpm: Math.round((beats * 60) / seconds) };
}

export const TUNES = {
  'world-now': fitTune(WN_TUNE),
  'tech-bytes': fitTune(TB_TUNE),
  cosmos: fitTune(CO_TUNE),
  'money-minute': fitTune(MM_TUNE),
  'news-60': fitTune(N6_TUNE),
  generic: fitTune(GEN_TUNE),
};

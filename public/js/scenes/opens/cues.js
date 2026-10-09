// The title sequences' cue sheets (all but WORLD NOW's, in worldcues.js). The pictures
// (opens/*titles.js) and the theme (audio/themes.js) read the same sheet, so every hit lands
// on its picture. Beats from the cut; `hit` is the lock-up's still frame (the theme's final
// chord), 0.8 s before the cut as in every open.
export const CUES = Object.freeze({
  // TECH BYTES: a run low over a circuit board, signals racing ahead of the camera; it cranes up
  // over the processor, whose traces light from the frame edges into its pins; the die boots
  'tech-bytes': Object.freeze({
    bpm: 104,
    pulses: Object.freeze([0, 1, 2, 3, 4, 5, 6]), // a signal leaves under the camera on each beat
    wave: 7, // every trace of both buses fires at once and the board's side buses light as it passes
    crane: 7.5, // the camera starts to rise over the processor
    land: 10.75, // straight overhead: the board is the emblem's own frame
    hit: 15,
  }),
  // COSMOS DESK: a voyage. Stars stream past through a magenta nebula; the ringed planet sweeps in
  // huge and backlit, the sun bursting at its limb; the camera pulls back as day comes round onto it
  // and the moon runs its orbit; it settles as the emblem itself
  cosmos: Object.freeze({
    bpm: 82,
    glints: Object.freeze([0, 1, 2]), // stars flare as the camera passes them (the bells)
    flyby: 3, // the planet's limb and rings sweep into frame
    burst: 4.5, // the sun bursts at the limb
    pull: 6, // the camera pulls back; day swings round onto the planet
    settle: 9.5, // the emblem, settled at centre stage
    hit: 12,
  }),
});

/** Seconds of a beat on a programme's grid. */
export const cueAt = (id, beat) => (beat * 60) / CUES[id].bpm;
/** The lock-up's still frame and the cut of a programme's sequence. */
export const hitOf = (id) => cueAt(id, CUES[id].hit);
export const durationOf = (id) => hitOf(id) + 0.8;

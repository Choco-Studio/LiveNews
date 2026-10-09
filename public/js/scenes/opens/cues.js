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
  // MONEY MINUTE: after the close. A time-lapse over the financial district from the golden hour to
  // the blue hour, the camera rising over the rooftops and tracking along the skyline as the sun
  // sets and the offices light up; a cut to the tallest tower's face, whose lights go out floor by
  // floor until one window is left: the bit, from which the ledger opens
  'money-minute': Object.freeze({
    bpm: 114,
    lights: Object.freeze([1.5, 3.5, 5.5, 7.5]), // windows come on in bursts with the e-piano's chords
    sun: 5, // the sun goes down behind the far skyline
    cut: 8, // cut to the tower's face, every office lit
    off: Object.freeze([9, 10, 11]), // the floors go dark on the beat, from the foot upward
    last: 11.5, // one window left: the bit
    hit: 18,
  }),
  // NEWS IN 60: the minute starts. Close on the stopwatch's pusher, which goes down; the hand makes
  // one turn (a five-minute tick on every eighth) as the camera pulls back to the dial; "60" lights
  'news-60': Object.freeze({
    bpm: 120,
    press: 1, // the pusher goes down: the hand sets off
    turn: 7, // the hand stops at twelve (six beats a turn: the fives on every eighth)
    sixty: 7.5, // "60" lights
    hit: 12,
  }),
  // WORLD WEATHER: up through the weather. Inside a storm, rising, lightning; the cloud thins and
  // pales; the camera breaks out over a sea of cloud into the sun; one cloud rises to it: the emblem
  'world-weather': Object.freeze({
    bpm: 92,
    flash: 2, // lightning lights the storm from within
    sheet: 3.5, // a distant sheet of it, high on the right
    climb: 4, // the rain stops; the cloud pales as the camera climbs
    breakout: 7, // the cloud tops rush past: the sea of cloud, the sun
    wisp: 7.8, // one cloud rises from the sea...
    settle: 10.6, // ...and settles in front of the sun
    hit: 14,
  }),
});

/** Seconds of a beat on a programme's grid. */
export const cueAt = (id, beat) => (beat * 60) / CUES[id].bpm;
/** The lock-up's still frame and the cut of a programme's sequence. */
export const hitOf = (id) => cueAt(id, CUES[id].hit);
export const durationOf = (id) => hitOf(id) + 0.8;

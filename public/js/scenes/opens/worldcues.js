// WORLD NOW's title sequence on one beat grid. The music (audio/themes.js) and the pictures
// (opens/worldtitles.js) read this one cue sheet, so every hit lands on its picture.
//
//   beats 0-4    NIGHT    Europe at night from orbit; London pips once a beat
//   beats 4-9    NETWORK  routes leave London and land one a beat (the signature's first three
//                         notes on bells), then the network blooms (its high 5)
//   beats 9-12   SUNRISE  the camera pulls back to the whole planet; the sun clears the limb
//   beats 11-15  TITLE    the brass states the signature; the lock-up lands on the final chord
//   beat 15 + 0.8 s       the cut
export const WN_BPM = 96;
export const WN_BEAT = 60 / WN_BPM; // 0.625 s

export const WN_CUES = Object.freeze({
  pings: Object.freeze([0, 1, 2, 3]), // London's pips
  launch: Object.freeze([4, 5, 6]), // New York, New Delhi, Nairobi leave London...
  land: Object.freeze([5, 6, 7]), // ...and land, one a beat
  bloom: 8, // the second wave lands together
  sunrise: 10, // the sun clears the limb
  lock: 11, // the camera settles on the planet; the brass enters
  hit: 15, // the lock-up holds still (the theme's final chord)
});

/** Seconds of a beat on the grid. */
export const wnAt = (beat) => beat * WN_BEAT;
/** The lock-up's still frame (the final chord) and the cut, 0.8 s later as in every open. */
export const WN_HIT = wnAt(WN_CUES.hit);
export const WN_DURATION = WN_HIT + 0.8;

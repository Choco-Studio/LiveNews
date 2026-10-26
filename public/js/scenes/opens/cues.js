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
  // SEVEN DAYS: the week turning over. The camera travels along a row of seven split-flap cards, each turning to its
  // day as it passes (Monday to Sunday), pulls back over the whole week, gathers the days into one stack, and the
  // top card turns to the coral 7: the emblem
  'seven-days': Object.freeze({
    bpm: 90,
    days: Object.freeze([1, 2, 3, 4, 5, 6, 7]), // a day's card turns on each beat, Monday to Sunday
    pull: 7.4, // the camera pulls back over the whole week
    week: 9, // the seven cards stand in a row at the emblem's size; a glint runs along them
    gather: 9.5, // the days gather into one stack behind Thursday...
    stack: 10.5, // ...and settle
    seven: 11, // the top card turns to the 7
    hit: 14,
  }),
  // FULL TIME (full-time.md §6): the final whistle. A dark ground at night, only the board's clock alight (89:55, a
  // second every two beats); the floodlights bang on bank by bank, one a beat (a low thunk each: the band's count-in);
  // the camera sweeps down the pitch to the centre circle under the board; the referee's final whistle on the brass,
  // three blasts, the last long, a cut closer on each (the wide, the mid, the board's clock) and the board flips to FULL
  // TIME on the last; the stadium drops away round the board's clock, a stopwatch at 90:00 at centre stage: the emblem,
  // from which the plate wipes out
  'full-time': Object.freeze({
    bpm: 120,
    ticks: Object.freeze([0, 2, 4, 6, 8]), // the board's clock: 89:55 at the cut, a second every two beats
    floods: Object.freeze([3, 4, 5, 6]), // a bank of floodlights bangs on each beat (far left, far right, near left, near right)
    sweep: 6.5, // the camera sweeps down the pitch...
    circle: 10, // ...and comes to rest over the centre circle, the board over the far stand
    whistle: Object.freeze([10, 11, 12]), // the final whistle: three blasts on the beat, a cut closer on each, the last long...
    long: 2, // ...two beats (the clock reads 90:00 from the first)
    flip: 12, // the board flips to FULL TIME on the last blast
    lift: 13.5, // an air swell under the clock's shot, into the cut...
    settle: 15.25, // ...and the stopwatch at 90:00 alone at centre stage on the open's field: the emblem
    hit: 19,
  }),
  // PAY ATTENTION (pay-attention.md §6): "a dark stage; the buzzer lamps of both desks light in turn on the beat; the
  // question board flips to PAY ATTENTION; the plate." The quiz studio in the dark, the two desks' shape lamps unlit; they
  // light in turn, one a beat (the circle, the square, the circle, the square: the buzzers playing the channel's
  // signature), each bringing its desk up; both at once and the room's white light on the downbeat; the board turns over
  // to PAY ATTENTION; a cut closer on the board; a cut to the two lamps alone on the open's field: the emblem
  'pay-attention': Object.freeze({
    bpm: 112,
    lamps: Object.freeze([2, 3, 4, 5]), // a lamp lights on each beat, in turn: A (circle), B (square), A, B
    both: 6, // both lamps lit, the room's white light comes up, the band comes in
    flip: 6.5, // the question board turns over...
    flipLen: 1, // ...in a beat
    close: 8, // a cut closer: PAY ATTENTION on the board
    emblem: 10, // a cut: the two lamps lit, alone on the open's field (the emblem), from which the plate wipes out
    hit: 14,
  }),
});

/** Seconds of a beat on a programme's grid. */
export const cueAt = (id, beat) => (beat * 60) / CUES[id].bpm;
/** The lock-up's still frame and the cut of a programme's sequence. */
export const hitOf = (id) => cueAt(id, CUES[id].hit);
export const durationOf = (id) => hitOf(id) + 0.8;

// The vertical clips' intros (docs/publishing/shorts-v2.md §6: the owner, 26 Oct, "necesitamos el hook… la intro como
// en los programas: espectacular… y con una música que mantenga atención", four seconds at most). The programme's own
// sequence for a phone on its own grid (public/js/clip/intro.js): motion from the first frame, one peak on a stroke,
// the programme's emblem and title on the hit, then the intro dissolving into the programme (from `push` to `cut`:
// the clip's first frames come in through it, never a hard cut). The picture and the theme
// (audio/themes.js introTheme) read the same sheet.
export const INTRO_CUES = Object.freeze({
  // COSMOS DESK (the owner, 26 Oct: "un acercamiento desde fuera de la galaxia, con todas las estrellas y puntitos
  // moviéndose dando un efecto potente", then "que lleve hasta Saturno, que es el icono… que parezca una galaxia de
  // verdad cuando te acercas, como el espacio real", the letters worked for, up to four seconds). One unbroken fall from
  // outside a spiral galaxy down to Saturn: the galaxy, its arm resolving into stars streaming past, Saturn coming in
  // head on out of them, backlit (the Sun behind it the whole way: a crescent, never a glare), the camera swinging round
  // it a few degrees as day comes round onto the planet, a little past the emblem's size and gently back to it; COSMOS
  // DESK under it as the programme's logotype; the intro's pixels dissolve away into the programme
  cosmos: Object.freeze({
    bpm: 92,
    glints: Object.freeze([0, 0.5, 1]), // bells: the galaxy's first stars catching the light
    roll: 2, // the timpani roll and an air swell as the stars stream past...
    sun: 3, // ...into the stroke: Saturn, a ringed crescent, swelling in head on; from here day comes round onto it
    title: 4.5, // the logotype's letters rise in, one after another, as the camera eases back from Saturn
    lock: 5, // the emblem and the title whole (the theme's hit); a shine runs across the letters
    push: 5.2, // the intro's pixels dissolve away, top right to bottom left, into the programme, the camera still
    // drifting back (the clip's graph: render.js introParts)
    cut: 6, // the intro's last frame, on the next downbeat
  }),
});

/** Seconds of an intro's beat, and its length (the cut). */
export const introAt = (id, beat) => (beat * 60) / INTRO_CUES[id].bpm;
export const introDuration = (id) => introAt(id, INTRO_CUES[id].cut);

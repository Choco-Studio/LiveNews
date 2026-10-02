// The "broadcast" network package: one motif (theory.js MOTIF), six colours.
// Each programme gets a key, tempo, palette and groove; each moment gets an
// arrangement of layers that the arranger (arranger.js) plays bar by bar.
//
// Layer types: pad, bass, osti (pulse ostinato), arp, stabs, timp, kit, motif,
// sparkle. Common layer fields: level (dB), pan, rev / dly (send amounts),
// enter (bar it enters when the bed starts from silence), tail (bar it enters
// after the programme open), on (phrase mask like 'x.xx').
//
// Patterns: digit strings are velocities per step ('9' loud, '1' soft, '.'
// rest); bass patterns are [beat, beats, degree, velocity] with degrees
// r(oot) 5 8(octave) 3(rd) a(pproach to the next chord).

// ------------------------------------------------------------ layer helpers

const pad = (o) => ({ type: 'pad', wave: 'soft', n: 4, lo: 50, hi: 70, vel: 0.8, a: 0.7, r: 1.6, cut: 800, cutTo: 1250, detune: 7, level: -12, rev: 0.4, ...o });
const bass = (o) => ({ type: 'bass', wave: 'tri', lo: 33, hi: 50, cut: 900, level: -9, rev: 0.06, enter: 1, tail: 1, a: 0.012, s: 0.8, r: 0.12, ...o });
const osti = (o) => ({ type: 'osti', wave: 'pulse25', rate: 4, decay: 0.16, cut: 1900, cutEnd: 420, level: -16, pan: -0.25, dly: 0.14, rev: 0.12, enter: 2, tail: 1, ...o });
const arp = (o) => ({ type: 'arp', wave: 'tri', rate: 2, shape: 'up', lo: 57, span: 2, decay: 0.3, cut: 1500, cutEnd: 500, level: -18, pan: 0.3, dly: 0.25, rev: 0.3, enter: 2, tail: 2, ...o });
const stabs = (o) => ({ type: 'stabs', wave: 'epiano', n: 4, lo: 55, hi: 74, a: 0.008, r: 0.28, cut: 1700, level: -14, rev: 0.25, enter: 1, tail: 1, ...o });
const timp = (o) => ({ type: 'timp', level: -9, rev: 0.3, enter: 0, tail: 0, hits: [], rolls: [], ...o });
const kit = (o) => ({ type: 'kit', level: -12, rev: 0.05, enter: 2, tail: 2, ...o });
const motif = (o) => ({ type: 'motif', inst: 'horn', every: 8, at: 6, beat: 0, aug: 1, harm: [], vel: 0.7, level: -14, rev: 0.4, dly: 0.18, enter: 4, tail: 4, ...o });
const sparkle = (o) => ({ type: 'sparkle', chance: 0.12, lo: 74, level: -24, rev: 0.5, dly: 0.35, enter: 2, tail: 2, pan: 0.4, ...o });

// Timpani figure from the motif head (sol, sol -> DO): a downbeat every two
// bars and a pickup into every fourth bar.
const TIMP_HEAD = [['even', 0, 'do', 0.7], [[3, 7], 3, 'sol', 0.42], [[3, 7], 3.5, 'sol', 0.55]];

// ----------------------------------------------------------- programmes

// WORLD NOW: the flagship. D minor, 108 BPM, a 16th pulse on the tonic pedal
// built from the motif's own pitch cell (do re sol), brass-like horn statements
// in parallel fifths, timpani from the motif head. BBC/CNN idiom, pixel palette.
const WORLD = {
  id: 'world-now',
  name: 'The Global Desk',
  tonic: 50, // D3
  mode: 'minor',
  bpm: 108,
  home: 'Dmadd9',
  final: 'Dadd9', // Picardy third on the end card: the day ends warm
  timbre: { lead: 'horn', harm: [-7], sparkle: 'glock' },
  beds: {
    headlines: {
      hr: 1,
      progs: {
        A: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A7sus'],
        B: ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'Asus4', 'A7sus'],
        C: ['Gm', 'Bb', 'Dm', 'C', 'Gm', 'Bb', 'Csus4', 'C'],
        D: ['Dm', 'F', 'C', 'Bb', 'Dm', 'F', 'Gm', 'A7sus'],
      },
      form: 'AABACADB',
      layers: [
        pad({ level: -13, cut: 700, cutTo: 1250 }),
        bass({ patterns: [
          [[0, 1.5, 'r', 0.9], [1.5, 0.5, 'r', 0.6], [2, 1, 'r', 0.8], [3, 0.5, '5', 0.55], [3.5, 0.5, 'a', 0.65]],
          [[0, 0.75, 'r', 0.9], [0.75, 0.75, 'r', 0.6], [1.5, 0.5, '8', 0.5], [2, 1.5, 'r', 0.8], [3.5, 0.5, 'a', 0.6]],
        ] }),
        osti({ pedal: true, variants: [
          { notes: [0, 0, 12, 0, 7, 0, 12, 14, 0, 0, 12, 0, 7, 12, 14, 7], acc: '7346634673466356' },
          { notes: [0, 12, 7, 12, 0, 12, 14, 12, 0, 12, 7, 12, 0, 14, 12, 7], acc: '7464646474646465' },
        ], fill: { notes: [0, 2, 7, 12, 0, 2, 7, 12, 2, 7, 12, 14, 7, 12, 14, 19], acc: '3445455656676778' } }),
        timp({ hits: TIMP_HEAD, rolls: [[7, 2, 2, 'do', 0.12, 0.5, 'odd']] }),
        kit({ kick: '7.......5.......', shaker: '3131313131313131', on: 'xxxx' }),
        motif({ oct: 62, harm: [-7] }),
      ],
    },
    story: {
      hr: 2,
      colours: {
        light: { tonic: 53, progs: { A: ['Fadd9', 'C/E', 'Dm7', 'Bbmaj7'], B: ['Gm7', 'Bbmaj7', 'Fadd9', 'Csus4'] }, form: 'AB' },
        neutral: { progs: { A: ['Dm', 'Bbmaj7', 'Fadd9', 'Csus2'], B: ['Gm7', 'Bbmaj7', 'Dm', 'Asus4'] }, form: 'AB' },
      },
      layers: [
        pad({ level: -12, cut: 560, cutTo: 820, a: 1.6, r: 2.6 }),
        bass({ pattern: [[0, 3.8, 'r', 0.75]], a: 0.08, r: 0.5, level: -12, cut: 500 }),
        osti({ pedal: false, rate: 2, base: 45, variants: [
          { notes: [0, 7, 12, 7, 0, 7, 12, 7], acc: '53435343' },
          { notes: [0, 12, 7, 12, 0, 12, 14, 12], acc: '53435344' },
        ], decay: 0.3, cut: 950, cutEnd: 300, level: -21, pan: 0.15, dly: 0.3, on: 'xx.x' }),
        timp({ hits: [[0, 0, 'do', 0.32]], level: -14 }),
        motif({ inst: 'reed', every: 16, at: 4, aug: 2, oct: 62, level: -25, colour: 'light', cut: 1000 }),
      ],
    },
    chat: {
      hr: 1,
      tonic: 53, // F major: the relative major, warmer for banter
      swing: 0.16,
      progs: {
        A: ['Fmaj7', 'Dm7', 'Gm7', 'C7sus', 'Fmaj7', 'Dm7', 'Gm7', 'C7sus'],
        B: ['Bbmaj7', 'C', 'Am7', 'Dm7', 'Gm7', 'Bbmaj7', 'Csus4', 'C'],
      },
      form: 'AABA',
      layers: [
        stabs({ pattern: [[0, 1.4, 0.55], [1.5, 0.4, 0.4], [3, 0.9, 0.45]], level: -15 }),
        bass({ patterns: [
          [[0, 1, 'r', 0.85], [1, 1, '5', 0.6], [2, 1, '3', 0.65], [3, 1, 'a', 0.6]],
          [[0, 1.5, 'r', 0.85], [1.5, 0.5, '5', 0.5], [2, 1, '8', 0.6], [3, 1, 'a', 0.6]],
        ], level: -11 }),
        kit({ kick: '8.....5.7.......', brush: '....4.......4...', shaker: '4.2.4.2.4.2.4.2.' }),
        pad({ level: -21, n: 3, cut: 650, cutTo: 800 }),
        arp({ wave: 'pulse12', shape: 'cell', rate: 2, decay: 0.16, cut: 1400, level: -21, on: '.x.x' }),
        motif({ inst: 'pluck', at: 6, beat: 2, oct: 65, level: -19 }),
      ],
    },
    roundup: {
      hr: 1,
      mode: 'dorian',
      progs: {
        A: ['Dm', 'G/D', 'C', 'Dm', 'Dm', 'G/D', 'Bb', 'A7sus'],
        B: ['Bb', 'C', 'Dm', 'G/D', 'Bb', 'C', 'Asus4', 'A7sus'],
      },
      form: 'AABA',
      layers: [
        osti({ wave: 'pulse12', pedal: false, base: 50, variants: [
          { notes: [0, 7, 12, 14, 7, 12, 14, 19, 0, 7, 12, 14, 7, 14, 12, 7], acc: '6343534363435344' },
          { notes: [0, 12, 7, 14, 0, 12, 7, 19, 0, 12, 7, 14, 12, 14, 19, 14], acc: '6343534363435344' },
        ], decay: 0.12, cut: 1700, cutEnd: 400, level: -17, pan: 0.3, dly: 0.22 }),
        osti({ wave: 'warmsq', pedal: true, rate: 2, oct: -12, variants: [{ notes: [0, 0, 0, 0, 0, 0, 0, 0], acc: '75757575' }], decay: 0.2, cut: 700, cutEnd: 250, level: -18, pan: -0.3, dly: 0 }),
        bass({ pattern: [[0, 0.5, 'r', 0.85], [0.5, 0.5, '8', 0.5], [1, 0.5, 'r', 0.7], [1.5, 0.5, '8', 0.5], [2, 0.5, 'r', 0.8], [2.5, 0.5, '8', 0.5], [3, 0.5, '5', 0.6], [3.5, 0.5, '8', 0.55]], level: -13 }),
        timp({ hits: [['all', 0, 'do', 0.5]], rolls: [[7, 2, 2, 'do', 0.1, 0.45, 'odd']] }),
        kit({ kick: '8.......6.......', tick: '5252525252525252' }),
        pad({ level: -17, cut: 800, cutTo: 1300 }),
      ],
    },
    outro: {
      hr: 1,
      progs: {
        A: ['Bb', 'C', 'Dm', 'Dm', 'Bb', 'C', 'Dsus4', 'D'],
        B: ['Gm7', 'Bbmaj7', 'Csus4', 'C', 'Bb', 'C', 'Dsus4', 'D'],
      },
      form: 'AB',
      layers: [
        pad({ level: -12, cut: 700, cutTo: 1700, a: 0.9, r: 2.2 }),
        bass({ pattern: [[0, 2, 'r', 0.8], [2, 1.5, 'r', 0.6], [3.5, 0.5, 'a', 0.6]], level: -11 }),
        osti({ pedal: true, rate: 2, variants: [{ notes: [0, 12, 7, 12, 0, 12, 14, 12], acc: '64546455' }], decay: 0.22, cut: 1200, level: -19 }),
        timp({ hits: TIMP_HEAD }),
        kit({ shaker: '3.2.3.2.3.2.3.2.' }),
        motif({ at: 0, aug: 2, oct: 62, harm: [-7], level: -14, enter: 0, tail: 0 }),
        motif({ at: 6, retro: true, oct: 62, level: -16, enter: 0, tail: 0 }),
      ],
    },
  },
};

// TECH BYTES: A minor, 122 BPM. Chip arpeggios (the classic fast chord-cycling
// trick, softened), an octave-bouncing square bass, side-chain "pump" on the
// pads, a syncopated kick. Playful, bright, but low-passed under speech.
const TECH = {
  id: 'tech-bytes',
  name: 'Bitstream',
  tonic: 57, // A3
  mode: 'minor',
  bpm: 122,
  home: 'Am7',
  final: 'Asus2',
  timbre: { lead: 'square', harm: [12], sparkle: 'chip' },
  beds: {
    headlines: {
      hr: 1,
      progs: {
        A: ['Am7', 'Fmaj7', 'Cadd9', 'G6', 'Am7', 'Fmaj7', 'Cadd9', 'G6'],
        B: ['Fmaj7', 'G', 'Am7', 'Cadd9', 'Fmaj7', 'G', 'Dm7', 'E7sus'],
        C: ['Dm7', 'Fmaj7', 'Am7', 'G', 'Dm7', 'Fmaj7', 'Cadd9', 'G'],
      },
      form: 'AABACABC',
      layers: [
        pad({ wave: 'saw', level: -16, cut: 700, cutTo: 1100, pump: 0.5, a: 0.3 }),
        bass({ wave: 'warmsq', cut: 650, level: -12, patterns: [
          [[0, 0.5, 'r', 0.9], [0.75, 0.25, '8', 0.55], [1.5, 0.5, 'r', 0.7], [2, 0.5, '8', 0.6], [2.75, 0.25, 'r', 0.6], [3.5, 0.5, '8', 0.6]],
          [[0, 0.75, 'r', 0.9], [0.75, 0.25, 'r', 0.5], [1.5, 0.5, '8', 0.6], [2.5, 0.5, 'r', 0.7], [3, 0.5, '5', 0.55], [3.5, 0.5, 'a', 0.6]],
        ] }),
        arp({ wave: 'pulse12', rate: 4, shape: 'chip', lo: 57, span: 2, decay: 0.11, cut: 1800, cutEnd: 450, level: -18, pan: 0.25, dly: 0.2 }),
        kit({ kick: '9.....7...9.....', shaker: '4242424242424242', brush: '....5.......5...' }),
        motif({ inst: 'square', oct: 69, harm: [12], level: -19, cut: 1500 }),
        timp({ hits: [[0, 0, 'do', 0.45]], level: -13 }),
      ],
    },
    story: {
      hr: 2,
      colours: {
        light: { tonic: 48, progs: { A: ['Cmaj7', 'Am7', 'Fmaj7', 'G6'] }, form: 'A' },
        neutral: { progs: { A: ['Am7', 'Fmaj7', 'Cadd9', 'G6'], B: ['Dm7', 'Fmaj7', 'Am7', 'Esus4'] }, form: 'AB' },
      },
      layers: [
        pad({ wave: 'saw', level: -15, cut: 550, cutTo: 750, pump: 0.3, a: 1, r: 2 }),
        arp({ rate: 2, shape: 'updown', lo: 57, span: 2, decay: 0.26, cut: 1100, cutEnd: 380, level: -20, on: 'xxx.' }),
        bass({ pattern: [[0, 1.8, 'r', 0.75], [2, 1.8, '5', 0.55]], level: -13, cut: 500, a: 0.04 }),
        kit({ shaker: '2.1.2.1.2.1.2.1.', on: '.xx.', level: -16 }),
      ],
    },
    chat: {
      hr: 1,
      tonic: 48, // C major: the sunny side of A minor
      swing: 0.1,
      progs: { A: ['Cmaj7', 'Am7', 'Fmaj7', 'G6', 'Cmaj7', 'Am7', 'Dm7', 'G'], B: ['Fmaj7', 'G6', 'Em7', 'Am7', 'Dm7', 'Fmaj7', 'Gsus4', 'G'] },
      form: 'AABA',
      layers: [
        bass({ wave: 'warmsq', cut: 600, level: -12, pattern: [[0, 0.5, 'r', 0.9], [0.5, 0.5, '8', 0.5], [1.5, 0.5, 'r', 0.7], [2, 0.5, '8', 0.55], [3, 0.5, 'r', 0.7], [3.5, 0.5, 'a', 0.6]] }),
        stabs({ wave: 'warmsq', pattern: [[0.5, 0.3, 0.5], [1.5, 0.3, 0.45], [2.5, 0.3, 0.5], [3.5, 0.3, 0.45]], cut: 1300, level: -18, n: 3, lo: 60, hi: 76 }),
        arp({ wave: 'pulse25', rate: 4, shape: 'chip', lo: 60, span: 1, decay: 0.09, cut: 1600, level: -22, on: '.x.x' }),
        kit({ kick: '9.......8.......', brush: '....5.......5...', shaker: '3.3.3.3.3.3.3.3.' }),
        motif({ inst: 'square', at: 7, beat: 0, oct: 60, level: -20, cut: 1400 }),
      ],
    },
    outro: {
      hr: 1,
      progs: { A: ['Fmaj7', 'G6', 'Am7', 'Am7', 'Fmaj7', 'G6', 'Cadd9', 'Cadd9'], B: ['Dm7', 'Fmaj7', 'G', 'Am7', 'Fmaj7', 'G6', 'Esus4', 'Asus2'] },
      form: 'AB',
      layers: [
        pad({ wave: 'saw', level: -14, cut: 650, cutTo: 1500, pump: 0.35 }),
        arp({ wave: 'pulse12', rate: 4, shape: 'chip', lo: 60, span: 2, decay: 0.12, cut: 1600, level: -19 }),
        bass({ wave: 'warmsq', cut: 600, level: -12, pattern: [[0, 1.5, 'r', 0.85], [1.5, 0.5, '8', 0.55], [2.5, 0.5, 'r', 0.7], [3, 1, '5', 0.6]] }),
        kit({ kick: '9.......7.......', shaker: '3232323232323232' }),
        motif({ inst: 'square', at: 0, aug: 2, oct: 69, harm: [12], level: -17, cut: 1500, enter: 0, tail: 0 }),
        motif({ inst: 'square', at: 6, retro: true, oct: 69, level: -18, cut: 1500, enter: 0, tail: 0 }),
      ],
    },
  },
};

// COSMOS DESK: E lydian (the raised fourth is "wonder"), 84 BPM half-time.
// Glassy arpeggios through a long dotted echo, slow rising pads over an E
// pedal, a sub bass and a soft deep "boom" instead of drums.
const COSMOS = {
  id: 'cosmos',
  name: 'Deep Field',
  tonic: 52, // E3
  mode: 'lydian',
  bpm: 84,
  home: 'Emaj9',
  final: 'Eadd9',
  timbre: { lead: 'glass', harm: [12], sparkle: 'glass' },
  delay: 0.75,
  beds: {
    headlines: {
      hr: 2,
      progs: { A: ['Emaj7', 'F#/E', 'C#m7', 'B6sus'], B: ['Emaj7', 'F#/E', 'G#m7', 'F#6sus'], C: ['C#m7', 'G#m7', 'F#/E', 'B6sus'] },
      form: 'ABAC',
      layers: [
        pad({ wave: 'soft', level: -12, cut: 600, cutTo: 1900, a: 1.4, r: 3, n: 5, lo: 52, hi: 76, detune: 9 }),
        bass({ wave: 'sub', pattern: [[0, 7.8, 'r', 0.8]], level: -10, cut: 300, a: 0.3, r: 1, only: 'even' }),
        arp({ wave: 'glass', rate: 4, shape: 'updown', lo: 64, span: 2, decay: 0.35, cut: 1600, cutEnd: 600, level: -19, dly: 0.45, rev: 0.5 }),
        timp({ hits: [['even', 0, 'do', 0.55]], level: -11, rev: 0.6 }),
        kit({ kick: '6...............', shaker: '..2...2...2...2.', level: -14 }),
        motif({ inst: 'glass', oct: 64, aug: 2, at: 4, level: -16, harm: [12] }),
      ],
    },
    story: {
      hr: 2,
      colours: {
        light: { progs: { A: ['Emaj9', 'F#/E', 'C#m7', 'B6sus'] }, form: 'A' },
        neutral: { progs: { A: ['C#m7', 'Emaj7', 'F#/E', 'B6sus'], B: ['G#m7', 'Emaj7', 'F#/E', 'F#6sus'] }, form: 'AB' },
      },
      layers: [
        pad({ level: -12, cut: 520, cutTo: 900, a: 2, r: 3, n: 5, lo: 52, hi: 76, detune: 9 }),
        bass({ wave: 'sub', pattern: [[0, 7.8, 'r', 0.7]], level: -12, cut: 260, a: 0.4, r: 1.2, only: 'even' }),
        arp({ wave: 'tri', rate: 2, shape: 'cell', lo: 64, span: 1, decay: 0.5, cut: 1000, cutEnd: 400, level: -22, dly: 0.5, rev: 0.5, on: 'xx.x' }),
        timp({ hits: [[0, 0, 'do', 0.3]], level: -15, rev: 0.6 }),
      ],
    },
    chat: {
      hr: 1,
      progs: { A: ['Emaj7', 'F#/E', 'G#m7', 'F#6sus', 'Emaj7', 'F#/E', 'C#m7', 'B6sus'] },
      form: 'A',
      layers: [
        pad({ level: -16, cut: 600, cutTo: 900, a: 0.6, n: 4, lo: 52, hi: 72 }),
        bass({ wave: 'sub', pattern: [[0, 1.5, 'r', 0.8], [2.5, 1, '5', 0.55]], level: -11, cut: 300 }),
        kit({ kick: '7.....5.........', shaker: '..2...2...2...2.', level: -13 }),
        sparkle({ inst: 'chip', chance: 0.16, lo: 76, level: -24 }), // UNIT-8's bleeps
        arp({ wave: 'glass', rate: 2, shape: 'cell', lo: 64, decay: 0.4, cut: 1300, level: -21, dly: 0.45 }),
        motif({ inst: 'glass', oct: 64, at: 6, level: -18 }),
      ],
    },
    outro: {
      hr: 2,
      progs: { A: ['C#m7', 'B6sus', 'F#/E', 'Emaj9'] },
      form: 'A',
      layers: [
        pad({ level: -11, cut: 600, cutTo: 2000, a: 1.4, r: 3, n: 5, lo: 52, hi: 76, detune: 9 }),
        bass({ wave: 'sub', pattern: [[0, 7.8, 'r', 0.75]], level: -11, cut: 300, a: 0.3, r: 1, only: 'even' }),
        arp({ wave: 'glass', rate: 4, shape: 'updown', lo: 64, span: 2, decay: 0.3, cut: 1500, level: -20, dly: 0.45 }),
        timp({ hits: [['even', 0, 'do', 0.5]], level: -12, rev: 0.6 }),
        motif({ inst: 'glass', at: 0, aug: 2, oct: 64, harm: [12], level: -15, enter: 0, tail: 0 }),
      ],
    },
  },
};

// MONEY MINUTE: C major, 116 BPM, "the ticker". Staccato pulse 8ths, a walking
// triangle bass, electric-piano maj7/9 chords, clock ticks. Calm and crisp.
const MONEY = {
  id: 'money-minute',
  name: 'Ticker',
  tonic: 48, // C3
  mode: 'major',
  bpm: 116,
  home: 'Cmaj7',
  final: 'Cadd9',
  timbre: { lead: 'reed', harm: [-7], sparkle: 'bell' },
  beds: {
    headlines: {
      hr: 1,
      progs: {
        A: ['Cmaj7', 'Am7', 'Dm7', 'G9sus', 'Cmaj7', 'Am7', 'Dm7', 'G9sus'],
        B: ['Fmaj7', 'Em7', 'Dm7', 'G9sus', 'Cmaj7', 'Am7', 'Dm7', 'G9sus'],
        C: ['Am7', 'Dm7', 'G9sus', 'Cmaj7', 'Fmaj7', 'Em7', 'Dm7', 'G7sus'],
      },
      form: 'AABACABC',
      layers: [
        stabs({ pattern: [[0, 1.2, 0.5], [1.5, 0.4, 0.4], [2.5, 1.2, 0.45]], level: -16, cut: 1500 }),
        osti({ wave: 'pulse12', pedal: true, rate: 2, variants: [{ notes: [0, 12, 7, 12, 2, 12, 7, 12], acc: '64545454' }, { notes: [0, 7, 12, 14, 0, 7, 12, 7], acc: '64545455' }], decay: 0.07, cut: 1600, cutEnd: 500, level: -17, pan: -0.2, dly: 0.12 }),
        bass({ patterns: [
          [[0, 1, 'r', 0.85], [1, 1, '5', 0.6], [2, 1, '8', 0.65], [3, 1, 'a', 0.6]],
          [[0, 1, 'r', 0.85], [1, 1, '3', 0.6], [2, 1, '5', 0.65], [3, 1, 'a', 0.6]],
        ], level: -11 }),
        kit({ kick: '8.......6.......', tick: '5353535353535353', brush: '....4.......4...' }),
        pad({ level: -20, n: 3, cut: 600, cutTo: 900 }),
        motif({ inst: 'reed', oct: 60, harm: [-7], level: -17, cut: 1300 }),
      ],
    },
    story: {
      hr: 2,
      colours: {
        light: { progs: { A: ['Cmaj7', 'Am7', 'Fmaj7', 'G9sus'] }, form: 'A' },
        neutral: { progs: { A: ['Am7', 'Fmaj7', 'Dm7', 'G9sus'], B: ['Fmaj7', 'Em7', 'Dm7', 'G9sus'] }, form: 'AB' },
      },
      layers: [
        pad({ wave: 'epiano', level: -15, n: 4, cut: 900, cutTo: 900, a: 0.05, r: 1.6, s: 0.35, d: 2.5, detune: 4 }),
        osti({ wave: 'pulse12', pedal: true, rate: 2, variants: [{ notes: [0, 12, 7, 12, 0, 12, 7, 12], acc: '42323232' }], decay: 0.06, cut: 1200, cutEnd: 400, level: -21, pan: -0.2, dly: 0.12, on: 'x.xx' }),
        bass({ pattern: [[0, 1.5, 'r', 0.75], [2, 1.5, '5', 0.55]], level: -12, cut: 600 }),
        kit({ tick: '3.2.3.2.3.2.3.2.', level: -16, on: '.xxx' }),
      ],
    },
    outro: {
      hr: 1,
      progs: { A: ['Fmaj7', 'G9sus', 'Em7', 'Am7', 'Dm7', 'G9sus', 'Cmaj7', 'Cadd9'] },
      form: 'A',
      layers: [
        stabs({ pattern: [[0, 1.8, 0.5], [2, 1.8, 0.45]], level: -15, cut: 1500 }),
        bass({ pattern: [[0, 1, 'r', 0.85], [1, 1, '5', 0.6], [2, 1, '8', 0.6], [3, 1, 'a', 0.6]], level: -11 }),
        kit({ kick: '8.......6.......', tick: '4343434343434343' }),
        pad({ level: -16, cut: 650, cutTo: 1400 }),
        motif({ inst: 'reed', at: 0, aug: 2, oct: 60, harm: [-7], level: -16, cut: 1300, enter: 0, tail: 0 }),
        motif({ inst: 'bell', at: 6, retro: true, oct: 72, level: -22, enter: 0, tail: 0 }),
      ],
    },
  },
};

// NEWS IN 60: G major / E minor, 132 BPM. A tick-tock clock on the off-beats,
// a driving 8th bass, staccato pulses on the tonic pedal. Urgent but light.
const FLASH = {
  id: 'news-60',
  name: 'Countdown',
  tonic: 55, // G3
  mode: 'major',
  bpm: 132,
  home: 'Em7',
  final: 'Gadd9',
  timbre: { lead: 'pulse', harm: [-12], sparkle: 'chip' },
  beds: {
    headlines: {
      hr: 1,
      progs: {
        A: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am7', 'Dsus4'],
        B: ['C', 'D', 'Em', 'Em', 'C', 'D', 'Dsus4', 'D'],
        C: ['Am7', 'C', 'Em', 'D', 'Am7', 'C', 'Dsus4', 'D'],
      },
      form: 'AABACABC',
      layers: [
        osti({ wave: 'pulse25', pedal: true, rate: 4, variants: [
          { notes: [0, 0, 12, 0, 2, 0, 12, 0, 7, 0, 12, 0, 2, 0, 12, 7], acc: '6.4.5.4.6.4.5.45' },
          { notes: [0, 12, 0, 12, 2, 12, 2, 12, 7, 12, 7, 12, 2, 12, 0, 12], acc: '6.4.5.4.6.4.5.4.' },
        ], decay: 0.1, cut: 1600, cutEnd: 420, level: -17 }),
        bass({ pattern: [[0, 0.5, 'r', 0.9], [0.5, 0.5, 'r', 0.55], [1, 0.5, 'r', 0.7], [1.5, 0.5, 'r', 0.55], [2, 0.5, 'r', 0.8], [2.5, 0.5, 'r', 0.55], [3, 0.5, '5', 0.65], [3.5, 0.5, 'a', 0.6]], level: -12, cut: 700 }),
        kit({ kick: '8.......7.......', tick: '..5...5...5...5.', tock: '5...5...5...5...' }),
        pad({ level: -18, n: 3, cut: 650, cutTo: 1000 }),
        timp({ hits: TIMP_HEAD, level: -11 }),
        motif({ inst: 'pulse', oct: 67, harm: [-12], level: -19, cut: 1400 }),
      ],
    },
    story: {
      hr: 2,
      colours: {
        light: { progs: { A: ['G', 'D/F#', 'Em7', 'Cadd9'] }, form: 'A' },
        neutral: { progs: { A: ['Em', 'Cadd9', 'G', 'Dsus4'] }, form: 'A' },
      },
      layers: [
        pad({ level: -15, cut: 550, cutTo: 800, a: 1, r: 2 }),
        bass({ pattern: [[0, 0.5, 'r', 0.75], [1, 0.5, 'r', 0.55], [2, 0.5, 'r', 0.7], [3, 0.5, 'r', 0.55]], level: -13, cut: 550 }),
        kit({ tick: '..3...3...3...3.', tock: '3...3...3...3...', level: -15 }),
      ],
    },
    roundup: {
      hr: 1,
      progs: { A: ['Em', 'D', 'C', 'D', 'Em', 'D', 'C', 'Dsus4'], B: ['C', 'D', 'Em', 'G', 'C', 'D', 'Dsus4', 'D'] },
      form: 'AABA',
      layers: [
        osti({ wave: 'pulse12', pedal: false, base: 52, variants: [{ notes: [0, 7, 12, 14, 7, 12, 14, 19, 0, 7, 12, 14, 7, 14, 12, 7], acc: '6343534363435344' }], decay: 0.1, cut: 1600, level: -18, pan: 0.3, dly: 0.2 }),
        bass({ pattern: [[0, 0.5, 'r', 0.85], [0.5, 0.5, '8', 0.5], [1, 0.5, 'r', 0.7], [1.5, 0.5, '8', 0.5], [2, 0.5, 'r', 0.8], [2.5, 0.5, '8', 0.5], [3, 0.5, '5', 0.6], [3.5, 0.5, '8', 0.55]], level: -13, cut: 700 }),
        kit({ kick: '8.......7.......', tick: '..5...5...5...5.', tock: '5...5...5...5...' }),
        timp({ hits: [['all', 0, 'do', 0.5]] }),
        pad({ level: -18, n: 3 }),
      ],
    },
    outro: {
      hr: 1,
      progs: { A: ['C', 'D', 'Em', 'Em', 'C', 'D', 'Gsus4', 'G'] },
      form: 'A',
      layers: [
        osti({ wave: 'pulse25', pedal: true, rate: 2, variants: [{ notes: [0, 12, 7, 12, 2, 12, 7, 12], acc: '64546455' }], decay: 0.12, cut: 1400, level: -18 }),
        bass({ pattern: [[0, 1.5, 'r', 0.85], [1.5, 0.5, 'r', 0.55], [2, 1, 'r', 0.7], [3, 1, 'a', 0.6]], level: -12, cut: 700 }),
        kit({ kick: '8.......7.......', tick: '..4...4...4...4.' }),
        pad({ level: -15, cut: 650, cutTo: 1500 }),
        timp({ hits: TIMP_HEAD, level: -11 }),
        motif({ inst: 'pulse', at: 0, aug: 2, oct: 67, harm: [-12], level: -17, cut: 1400, enter: 0, tail: 0 }),
      ],
    },
  },
};

// The network itself: F major, used by standby, bumpers and the replay tag.
const CHANNEL = {
  id: 'channel',
  name: 'GLOBIT 24',
  tonic: 53, // F3
  mode: 'major',
  bpm: 84,
  home: 'Fmaj7',
  final: 'Fadd9',
  timbre: { lead: 'horn', harm: [-7], sparkle: 'glock' },
  delay: 0.75,
  beds: {
    standby: {
      hr: 2,
      progs: { A: ['Fmaj7', 'Dm7', 'Bbmaj7', 'C6sus'], B: ['Gm7', 'Bbmaj7', 'Fadd9', 'Csus4'], C: ['Dm7', 'Bbmaj7', 'Gm7', 'C6sus'] },
      form: 'ABAC',
      layers: [
        pad({ level: -12, cut: 650, cutTo: 1050, a: 2, r: 3 }),
        arp({ wave: 'tri', rate: 2, lo: 60, span: 2, decay: 0.45, cut: 1300, level: -19, variants: ['up', 'updown', 'cell', 'down'] }),
        bass({ wave: 'sub', pattern: [[0, 3.8, 'r', 0.6]], level: -13, cut: 300, a: 0.2, r: 0.8 }),
        kit({ shaker: '2.1.2.1.2.1.2.1.', on: '.xx.', level: -16 }),
        motif({ inst: 'musicbox', oct: 77, level: -17, at: 6, every: 8, enter: 1 }),
        sparkle({ inst: 'glock', chance: 0.08, lo: 77, level: -25, on: 'x.xx' }),
      ],
    },
  },
};

export const PROGRAMMES = { 'world-now': WORLD, 'tech-bytes': TECH, cosmos: COSMOS, 'money-minute': MONEY, 'news-60': FLASH };
export const CHANNEL_PKG = CHANNEL;

// Moments that loop as beds, and the fallbacks when a programme has no
// dedicated arrangement (single-presenter shows have no chat, only WORLD NOW and
// NEWS IN 60 run the map round-up).
export const BED_MOMENTS = ['headlines', 'openTail', 'story', 'chat', 'roundup', 'outro', 'standby'];
export const STING_MOMENTS = ['endcard', 'bumperIn', 'bumperOut', 'upNext', 'breaking'];
export const OVERLAY_MOMENTS = ['replay', 'frame', 'item'];
const FALLBACK = { chat: ['story'], roundup: ['headlines'], openTail: ['headlines'] };

/**
 * Bed definition for (programme, moment, colour): merges programme-level
 * fields (tonic, mode, bpm) with the moment's own, and picks a story colour.
 * Returns null when the cue means silence (grave stories, ads, off).
 */
export function bedDef(programId, moment, { emotion } = {}) {
  if (moment === 'standby') return finish(CHANNEL, 'standby', CHANNEL.beds.standby, null);
  const pkg = PROGRAMMES[programId] || PROGRAMMES['world-now'];
  const want = moment === 'openTail' ? 'headlines' : moment;
  const key = [want, ...(FALLBACK[want] || [])].find((k) => pkg.beds[k]);
  if (!key) return null;
  const colour = key === 'story' ? storyColour(emotion) : null;
  return finish(pkg, key, pkg.beds[key], colour, moment === 'chat' && key === 'story' ? 'light' : null);
}

export function storyColour(emotion) {
  return emotion === 'happy' ? 'light' : emotion === 'serious' || emotion === 'sad' ? 'grave' : 'neutral';
}

function finish(pkg, key, bed, colour, force) {
  const c = force || colour;
  const col = c && bed.colours ? bed.colours[c] || bed.colours.neutral : null;
  return {
    id: `${pkg.id}:${key}${c ? `:${c}` : ''}`,
    programme: pkg.id,
    moment: key,
    colour: c,
    pkg,
    bpm: bed.bpm || pkg.bpm,
    tonic: col?.tonic ?? bed.tonic ?? pkg.tonic,
    mode: bed.mode || pkg.mode,
    hr: bed.hr || 1,
    swing: bed.swing || 0,
    progs: col?.progs || bed.progs,
    form: (col?.form || bed.form || 'A').replace(/\s+/g, ''),
    layers: bed.layers.filter((l) => !l.colour || l.colour === c),
    delay: bed.delay || pkg.delay || 0.75,
  };
}

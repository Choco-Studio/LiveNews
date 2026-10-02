// The "broadcast" network package: one motif (theory.js MOTIF, from the sonic
// identity), five programme colours plus the network's own, written to the
// programme style bibles (docs/programmes/*.md). Each programme has beds (bar-
// by-bar arrangements of layers, played by arranger.js) and a cue POLICY that
// says what each director moment gets: a bed, silence, "keep what is playing",
// a sting or an accent. Silence is the default under main story copy: music
// only where it helps.
//
// Layer types: pad, bass, osti (pulse/pluck ostinato), arp, stabs, timp, kit,
// motif, sparkle. Common layer fields: level (dB), pan, rev / dly (sends),
// enter (bar it enters when the bed starts from silence), tail (bar it enters
// after the programme open), on (phrase mask like 'x.xx'), gate (plays only
// while nobody speaks), frame (driven by montage frames, not by bars).
//
// Patterns: digit strings are velocities per step ('9' loud, '1' soft, '.'
// rest); bass patterns are [beat, beats, degree, velocity] with degrees
// r(oot) 5 8(octave) 3(rd) a(pproach to the next chord).

import { COLOURS } from './theory.js';
import { themeFor } from '../../../audio/themes.js';

// ------------------------------------------------------------ layer helpers

const pad = (o) => ({ type: 'pad', wave: 'soft', n: 4, lo: 50, hi: 70, vel: 0.8, a: 0.7, r: 1.6, cut: 800, cutTo: 1100, detune: 7, level: -12, rev: 0.4, ...o });
const bass = (o) => ({ type: 'bass', wave: 'tri', lo: 33, hi: 50, cut: 900, level: -10, rev: 0.06, enter: 1, tail: 1, a: 0.012, s: 0.8, r: 0.12, ...o });
const osti = (o) => ({ type: 'osti', wave: 'warmsq', rate: 2, decay: 0.16, cut: 1200, cutEnd: 350, level: -16, pan: -0.2, dly: 0.12, rev: 0.12, enter: 2, tail: 1, ...o });
const arp = (o) => ({ type: 'arp', yieldTo: 'motif', wave: 'tri', rate: 2, shape: 'up', lo: 57, span: 2, decay: 0.3, cut: 1500, cutEnd: 500, level: -18, pan: 0.3, dly: 0.25, rev: 0.3, enter: 2, tail: 2, ...o });
const stabs = (o) => ({ type: 'stabs', wave: 'epiano', n: 4, lo: 55, hi: 74, a: 0.008, r: 0.28, cut: 1600, level: -14, rev: 0.25, enter: 1, tail: 1, ...o });
const kit = (o) => ({ type: 'kit', level: -14, rev: 0.05, enter: 2, tail: 2, ...o });
const motif = (o) => ({ type: 'motif', inst: 'horn', every: 8, at: 6, beat: 0, aug: 1, harm: [], vel: 0.7, level: -14, rev: 0.4, dly: 0.18, enter: 4, tail: 4, ...o });
const sparkle = (o) => ({ type: 'sparkle', yieldTo: 'motif', chance: 0.12, max: 4, lo: 74, level: -22, rev: 0.5, dly: 0.35, enter: 2, tail: 2, pan: 0.4, ...o });

// ----------------------------------------------------------- programmes

// Keys follow the programme opens of the sonic identity (audio/themes.js), so
// an open's last chord is caught by the bed in the same key; each package
// carries the open's "colour" note. Tempos and textures follow the bibles.

// WORLD NOW (docs/programmes/world-now.md). D major, the network's home key.
// The signature sound is LOW BRASS OVER TIMPANI. Headlines: triangle roots and
// low brass chords moving Bm -> G -> D across the three lines (minor to major),
// a timpani hit and a two-note bell "pip" (low 5 then 1) in each gap. Then
// silence for the greeting and the main stories; a muted pluck ostinato for
// the round-up; sparse triangle and pluck for AND FINALLY and its chat; the
// motif resolving 3 then 1 on brass for the sign-off.
const WORLD = {
  id: 'world-now',
  name: 'The Global Desk',
  tonic: 50, // D3
  mode: 'major',
  bpm: 92,
  home: 'D',
  final: 'D',
  colour: COLOURS.home,
  duckDb: -9,
  timbre: { lead: 'horn', harm: [-12], sparkle: null, noise: false },
  policy: {
    openTail: 'headlines', headlines: 'headlines', frame: { accent: 'pip' }, greeting: null,
    story: null, number: null, roundup: 'roundup', item: null, lighter: 'lighter', chat: 'keep',
    outro: null, signoff: null, endcard: { sting: 'signoff' }, picture: 'keep', single: 'keep',
  },
  beds: {
    headlines: {
      bpm: 92,
      hr: 2,
      frames: ['Bm', 'G', 'D'],
      progs: { A: ['Bm', 'G', 'D', 'A7sus'] },
      form: 'A',
      layers: [
        // Low brass chords: D3 and below while anyone speaks.
        pad({ wave: 'horn', n: 3, lo: 38, hi: 52, a: 0.35, r: 1.2, cut: 760, cutTo: 1000, detune: 5, level: -11, rev: 0.35, frame: true }),
        bass({ pattern: [[0, 8.6, 'r', 0.75]], a: 0.04, r: 0.6, level: -11, frame: true }),
      ],
    },
    roundup: {
      bpm: 100,
      hr: 1,
      progs: {
        A: ['D', 'Bm7', 'Gmaj7', 'A7sus', 'D', 'Bm7', 'Em7', 'A7sus'],
        B: ['Gmaj7', 'A', 'Bm7', 'D/F#', 'Gmaj7', 'A', 'Asus4', 'A7sus'],
      },
      form: 'AABA',
      layers: [
        // The muted pluck ostinato in eighths (no pulse-12 lead, no melody, no drum).
        osti({ base: 50, variants: [
          { notes: [0, 7, 12, 7, 0, 7, 12, 14], acc: '64535453' },
          { notes: [0, 12, 7, 12, 0, 12, 14, 12], acc: '64535453' },
        ], decay: 0.14, cut: 1000, cutEnd: 320, level: -14, pan: 0.2, dly: 0.15 }),
        bass({ pattern: [[0, 1.9, 'r', 0.8], [2, 1.9, '5', 0.6]], level: -12 }),
        pad({ level: -21, n: 3, lo: 43, hi: 62, power: true, cut: 600, cutTo: 750 }),
      ],
    },
    lighter: {
      bpm: 88,
      hr: 2,
      progs: { A: ['Dadd9', 'Gmaj7', 'Bm7', 'Asus4'], B: ['Gmaj7', 'Dadd9', 'Em7', 'Asus4'] },
      form: 'AB',
      layers: [
        // Sparse pluck on 1, the "and" of 2 and 3; a soft triangle dyad; the root.
        osti({ base: 55, variants: [
          { notes: [0, 0, 0, 7, 0, 12, 0, 0], acc: '6..4.4..' },
          { notes: [0, 0, 7, 0, 12, 0, 14, 0], acc: '5.4.4.3.' },
        ], decay: 0.5, cut: 1200, cutEnd: 350, level: -16, pan: 0.15, dly: 0.25, enter: 1 }),
        pad({ wave: 'tri', n: 2, lo: 57, hi: 69, a: 0.8, r: 1.6, cut: 1400, cutTo: 1400, detune: 4, level: -19, no7: true, enter: 0 }),
        bass({ pattern: [[0, 3.8, 'r', 0.7]], a: 0.05, r: 0.4, level: -13 }),
      ],
    },
  },
};

// TECH BYTES (docs/programmes/tech-bytes.md). A dorian, 104 BPM half-time:
// triangle roots, a soft pulse-12 arpeggio low-passed under 1.8 kHz with a
// dotted-eighth echo, a pad on Am9 and D9 (the dorian IV), a closed hat only
// on light beds. No kick, snare, pump or swing under speech. Beds under the
// cold-open montage, chats, the number card, AND FINALLY and the sign-off;
// story links are dry. The signature only peeks out in the gaps.
const techBed = (light) => ({
  bpm: 104,
  hr: 2,
  progs: { A: ['Am9', 'D9', 'Am9', 'D9'], B: ['Am9', 'D9', 'Cmaj7', 'Em7'] },
  form: 'AABA',
  layers: [
    pad({ n: 4, lo: 52, hi: 71, a: 1, r: 2, cut: 700, cutTo: 1000, level: -13, no7: true }),
    bass({ pattern: [[0, 1.7, 'r', 0.8], [2.5, 1.2, 'r', 0.55]], level: -12 }),
    arp({ wave: 'pulse12', rate: 2, shape: 'up', lo: 57, span: 2, decay: 0.16, cut: 1700, cutEnd: 450, level: -17, vel: 0.5, dly: 0.35, no7: true }),
    ...(light ? [kit({ shaker: '..3...3...3...3.', level: -15 })] : []),
    motif({ inst: 'pluck', gate: true, oct: 69, level: -17 }),
  ],
});
const TECH = {
  id: 'tech-bytes',
  name: 'Bitstream',
  tonic: 57, // A3
  mode: 'dorian',
  bpm: 104,
  home: 'Am9',
  final: 'Am9',
  colour: COLOURS.tech,
  duckDb: -9,
  timbre: { lead: 'pluck', harm: [], sparkle: null, noise: false },
  policy: {
    openTail: 'headlines', headlines: 'headlines', frame: null, greeting: null,
    story: null, number: { sting: 'number', then: 'number' }, roundup: null, item: null,
    lighter: 'lighter', chat: 'chat', featureEnd: { sting: 'featureEnd' },
    outro: 'outro', signoff: null, endcard: { sting: 'endcard' }, picture: 'keep', single: 'keep',
  },
  beds: { headlines: techBed(false), chat: techBed(true), number: techBed(false), lighter: techBed(true), outro: techBed(false) },
};

// COSMOS DESK (docs/programmes/cosmos.md). E lydian, 80 BPM. Music only on
// the cold open and under picture / map shots of non-grave stories (fading in
// over 1.0 s from the cut, out over 1.5 s): pad and sub only, under 1.2 kHz,
// whenever a voice is on. Bells (at most four a bar, long echo) only while
// nobody speaks. Greeting, chats, singles, The Reading: silence. End card: the
// network outro cue.
const cosmosBed = (o = {}) => ({
  bpm: 80,
  hr: 2,
  progs: o.progs || { A: ['Emaj7', 'F#/E', 'C#m7', 'B6sus'], B: ['Emaj7', 'F#/E', 'G#m7', 'F#6sus'], C: ['C#m7', 'F#/E', 'G#m7', 'B6sus'] },
  form: o.form || 'ABAC',
  presence: o.presence || false,
  layers: [
    pad({ n: 5, lo: 52, hi: 76, a: 1.6, r: 3, cut: 600, cutTo: 1100, detune: 9, level: -12, no7: true }),
    bass({ wave: 'sub', pattern: [[0, 8.9, 'r', 0.8]], only: 'even', a: 0.3, r: 1, level: -11 }),
    sparkle({ inst: 'bell', gate: true, chance: 0.3, max: 4, lo: 76, level: -21, dly: 0.55, rev: 0.6 }),
  ],
});
const COSMOS = {
  id: 'cosmos',
  name: 'Deep Field',
  tonic: 52, // E3
  mode: 'lydian',
  bpm: 80,
  home: 'Emaj9',
  final: 'E69',
  colour: COLOURS.cosmos,
  duckDb: -9,
  delay: 0.75,
  timbre: { lead: 'glass', harm: [], sparkle: 'bell', noise: false },
  policy: {
    openTail: 'headlines', headlines: 'headlines', frame: null, greeting: null,
    story: 'story', picture: { presence: 'in' }, single: { presence: 'out' }, lighter: 'lighter',
    number: 'story', roundup: 'story', item: null, chat: null, reading: null,
    outro: null, signoff: null, endcard: { external: 'outro' },
  },
  beds: {
    headlines: cosmosBed(),
    story: cosmosBed({ presence: true }),
    lighter: cosmosBed({ presence: true, progs: { A: ['Emaj9', 'F#/E', 'C#m7', 'B6sus'] }, form: 'A' }),
  },
};

// MONEY MINUTE (docs/programmes/money-minute.md). F major, 114 BPM, straight.
// Short electric-piano chords on the "and" of 2 and 4, a triangle bass in half
// notes (root and fifth), a filtered pulse-25 pad on the intro only. No arps,
// hats, ticks, kick, snare, walking bass or melody under speech; no swing,
// brass, bells above C6 or coin effects. Stories are dry. The number of the
// day gets a double-speed motif sting and a "tape" bed (up / down / mixed /
// neutral, one pitch set, only the centre moves).
const vamp = ['Fmaj9', 'Dm9', 'Bbmaj9', 'C6sus', 'Fmaj9', 'Dm9', 'Bbmaj9', 'C6sus'];
const moneyKeys = (o = {}) => [
  bass({ pattern: [[0, 1.9, 'r', 0.75], [2, 1.9, '5', 0.6]], level: -12, enter: 1, ...o.bass }),
  stabs({ pattern: [[1.5, 0.35, 0.45], [3.5, 0.35, 0.42]], level: -15, enter: 2, n: 4, lo: 57, hi: 76, ...o.stabs }),
];
const MONEY = {
  id: 'money-minute',
  name: 'Ticker',
  tonic: 53, // F3
  mode: 'major',
  bpm: 114,
  home: 'F69',
  final: 'F69',
  colour: COLOURS.money,
  duckDb: -9,
  timbre: { lead: 'keys', harm: [], sparkle: null, noise: false },
  policy: {
    openTail: 'intro', headlines: 'intro', greeting: 'keep', frame: null,
    story: null, number: { sting: 'number', then: 'number' }, roundup: null, item: null, lighter: null, chat: null,
    outro: 'outro', signoff: { sting: 'signoff' }, endcard: { sting: 'endcard' }, picture: 'keep', single: 'keep',
  },
  options: { bedUnderStories: 'off' }, // 'drone': one sustained pad under stories, 28 LU under the voice
  beds: {
    intro: {
      bpm: 114,
      hr: 1,
      progs: { A: vamp },
      form: 'A',
      layers: [
        pad({ wave: 'pulse25', n: 3, lo: 53, hi: 69, a: 0.6, r: 1.2, cut: 650, cutTo: 750, level: -19, no7: true, enter: 0, tail: 0 }),
        ...moneyKeys(),
      ],
    },
    outro: { bpm: 114, hr: 1, progs: { A: vamp }, form: 'A', layers: moneyKeys() },
    number: {
      bpm: 114,
      hr: 1,
      colours: {
        up: { progs: { A: ['Fmaj9', 'Bbmaj9'] }, form: 'A' },
        down: { progs: { A: ['Dm9', 'Bbmaj9'] }, form: 'A' },
        mixed: { progs: { A: ['Gm9', 'C9sus'] }, form: 'A' },
        neutral: { progs: { A: ['F6no3'] }, form: 'A' },
      },
      layers: moneyKeys({ bass: { enter: 0 }, stabs: { enter: 0 } }),
    },
    drone: { bpm: 114, hr: 8, progs: { A: ['F6no3'] }, form: 'A', layers: [pad({ n: 3, lo: 41, hi: 60, a: 2, r: 3, cut: 600, cutTo: 600, level: -14 })] },
  },
};

// NEWS IN 60 (docs/programmes/news-60.md). E minor / G major, 120 BPM: from
// the downbeat to the sign-off only the story bed (a pad, a staccato bass on
// every beat, a soft tick-tock low-passed under 2 kHz: the tock on 1 and 3,
// the tick on 2 and 4, so they fall on whole and half seconds). The item
// change is the bed's own tick, once, 4 dB up. Grave items keep the pad alone
// (a fast show must not lurch into dead air). The sign-off is one Gadd9 bell
// chord. The signature itself plays only in the open.
const FLASH = {
  id: 'news-60',
  name: 'Countdown',
  tonic: 55, // G3
  mode: 'major',
  bpm: 120,
  home: 'Gadd9',
  final: 'Gadd9',
  colour: COLOURS.sixty,
  duckDb: -4, // the bed lives low: -20 LU in gaps, -24 LU under speech
  graveBed: 'grave',
  timbre: { lead: 'pulse', harm: [], sparkle: null, noise: false },
  policy: {
    openTail: 'story', headlines: 'story', greeting: 'keep', frame: null,
    story: 'story', number: 'story', roundup: 'story', item: { accent: 'tick' }, lighter: 'story', chat: 'story',
    outro: 'keep', signoff: { sting: 'bellchord' }, endcard: { sting: 'bellchord' }, picture: 'keep', single: 'keep',
  },
  beds: {
    story: {
      bpm: 120,
      hr: 2,
      colours: {
        light: { progs: { A: ['G', 'D/F#', 'Em7', 'Cadd9'] }, form: 'A' },
        neutral: { progs: { A: ['Em7', 'Cadd9', 'G', 'Dsus4'] }, form: 'A' },
      },
      layers: [
        pad({ n: 3, lo: 52, hi: 69, a: 1, r: 2, cut: 600, cutTo: 800, level: -14, no7: true, enter: 0, tail: 0 }),
        bass({ pattern: [[0, 0.3, 'r', 0.7], [1, 0.3, 'r', 0.55], [2, 0.3, 'r', 0.65], [3, 0.3, 'r', 0.55]], a: 0.006, r: 0.08, level: -12 }),
        kit({ tock: '4.......4.......', tick: '....3.......3...', level: -13 }),
      ],
    },
    grave: { bpm: 120, hr: 4, progs: { A: ['Em7', 'Cadd9'] }, form: 'A', layers: [pad({ n: 3, lo: 52, hi: 69, a: 1.5, r: 2.5, cut: 550, cutTo: 650, level: -15, no7: true, enter: 0, tail: 0 })] },
  },
};

// The network itself: D major like the idents. Standby loop, break bumper
// cards (a tri bass and a swung pluck at 84), the ident and countdown lead-ins
// (stings.js), the replay tag.
const CHANNEL = {
  id: 'channel',
  name: 'GLOBIT 24',
  tonic: 50, // D3
  mode: 'major',
  bpm: 84,
  home: 'Dadd9',
  final: 'Dadd9',
  colour: COLOURS.home,
  duckDb: -9,
  delay: 0.75,
  timbre: { lead: 'horn', harm: [-12], sparkle: 'glock', noise: false },
  beds: {
    standby: {
      hr: 2,
      progs: { A: ['Dmaj7', 'Bm7', 'Gmaj7', 'A6sus'], B: ['Em7', 'Gmaj7', 'Dadd9', 'Asus4'], C: ['Bm7', 'Gmaj7', 'Em7', 'A6sus'] },
      form: 'ABAC',
      layers: [
        pad({ no7: true, level: -12, cut: 650, cutTo: 1000, a: 2, r: 3 }),
        arp({ wave: 'tri', rate: 2, lo: 62, span: 2, decay: 0.45, cut: 1300, level: -19, variants: ['up', 'updown', 'cell', 'down'] }),
        bass({ wave: 'sub', pattern: [[0, 4.5, 'r', 0.6]], level: -13, a: 0.2, r: 0.8 }),
        kit({ shaker: '2.1.2.1.2.1.2.1.', on: '.xx.', level: -16 }),
        motif({ inst: 'musicbox', oct: 74, level: -17, at: 6, every: 8, enter: 1 }),
        sparkle({ inst: 'glock', chance: 0.08, lo: 74, level: -25, on: 'x.xx' }),
      ],
    },
    bumper: {
      bpm: 84,
      hr: 1,
      swing: 0.33,
      progs: { A: ['Dmaj7', 'Bm7', 'Gmaj7', 'A6sus', 'Dmaj7', 'Bm7', 'Em7', 'A6sus'] },
      form: 'A',
      layers: [
        bass({ pattern: [[0, 1, 'r', 0.85], [1.5, 0.5, '5', 0.55], [2, 1, '8', 0.65], [3.5, 0.5, 'a', 0.6]], level: -10, enter: 0, tail: 0 }),
        osti({ base: 57, variants: [{ notes: [0, 7, 12, 7, 0, 12, 7, 14], acc: '64546454' }], decay: 0.3, cut: 1400, cutEnd: 400, level: -14, enter: 0, tail: 0 }),
        pad({ no7: true, n: 3, level: -19, cut: 600, cutTo: 700 }),
      ],
    },
  },
};

export const PROGRAMMES = { 'world-now': WORLD, 'tech-bytes': TECH, cosmos: COSMOS, 'money-minute': MONEY, 'news-60': FLASH };
export const CHANNEL_PKG = CHANNEL;

export const STING_MOMENTS = ['endcard', 'bumperIn', 'bumperOut', 'upNext', 'breaking', 'countdown'];
export const CHANNEL_BEDS = ['standby', 'bumper'];

/** What the story cue really is: its feature (round-up, AND FINALLY, number) or its gravity. */
export function storyMoment(moment, { emotion, feature } = {}) {
  if (moment !== 'story') return moment;
  if (emotion === 'serious' || emotion === 'sad') return 'grave';
  if (feature === 'roundup' || feature === 'lighter' || feature === 'number') return feature;
  return 'story';
}

export function storyColour(emotion) {
  return emotion === 'happy' ? 'light' : emotion === 'serious' || emotion === 'sad' ? 'grave' : 'neutral';
}

/**
 * The policy rule of a programme for a moment: a bed key, null (silence),
 * 'keep', { sting, then? }, { accent }, { presence: 'in' | 'out' } or
 * { external }. Unknown moments are silence.
 */
export function ruleFor(programId, moment) {
  const pkg = PROGRAMMES[programId] || PROGRAMMES['world-now'];
  if (moment === 'story' && pkg.options?.bedUnderStories === 'drone') return 'drone';
  return moment in pkg.policy ? pkg.policy[moment] : null;
}

/** Bed definition for a bed key of a programme (or a channel bed), with its colour. */
export function bedDef(programId, key, { emotion, tape } = {}) {
  if (CHANNEL_BEDS.includes(key)) return finish(CHANNEL, key, CHANNEL.beds[key], null);
  const pkg = PROGRAMMES[programId] || PROGRAMMES['world-now'];
  const bed = pkg.beds[key];
  if (!bed) return null;
  const colour = bed.colours ? (key === 'number' ? tape || 'neutral' : key === 'lighter' ? 'light' : storyColour(emotion) === 'light' ? 'light' : 'neutral') : null;
  return finish(pkg, key, bed, colour);
}

function finish(pkg, key, bed, c) {
  const col = c && bed.colours ? bed.colours[c] || bed.colours.neutral || Object.values(bed.colours)[0] : null;
  return {
    id: `${pkg.id}:${key}${col ? `:${c}` : ''}`,
    programme: pkg.id,
    moment: key,
    colour: col ? c : null,
    pkg,
    bpm: bed.bpm || pkg.bpm,
    tonic: col?.tonic ?? bed.tonic ?? pkg.tonic,
    mode: bed.mode || pkg.mode,
    hr: bed.hr || 1,
    swing: bed.swing || 0,
    progs: col?.progs || bed.progs,
    form: (col?.form || bed.form || 'A').replace(/\s+/g, ''),
    layers: bed.layers,
    frames: bed.frames || null,
    presence: Boolean(bed.presence),
    delay: bed.delay || pkg.delay || 0.75,
  };
}

/**
 * Checks the packages against the programme opens of the sonic identity: the
 * bed's tonic must be the open's key (its last chord is caught at the cut).
 * Returns [{ programId, bed, open, ok }]; run it after any theme change.
 */
export function alignment() {
  const pc = (name) => ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;
  return Object.values(PROGRAMMES).map((p) => {
    let open = null;
    try {
      open = themeFor(p.id)?.meta?.key ?? null;
    } catch { /* theme missing */ }
    return { programId: p.id, bed: p.tonic % 12, open: open && pc(open), ok: open != null && pc(open) === p.tonic % 12 };
  });
}

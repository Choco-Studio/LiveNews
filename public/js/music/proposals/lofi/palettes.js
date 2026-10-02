// Lo-fi newsroom proposal: the songs. Since the programme style bibles
// (docs/programmes/*.md) every programme has its own music rules, so a "song"
// is one bed of one programme (World Now's round-up, Tech Bytes' beds, Money
// Minute's intro vamp and tape beds...). Each song has moments = arrangements
// of its layers; changing moment inside a song never restarts it (layers fade
// on the musical grid). All songs sing the channel signature (theory.js) in
// the key of their programme's open (audio/themes.js). The lo-fi craft stays
// in the sound: Rhodes, round triangle basses, soft pulses, tape wobble, a
// warm room, swung plucks where a bible allows swing.

import { COLOUR } from './theory.js';

export const LAYERS = ['pad', 'keys', 'bass', 'kick', 'snare', 'hat', 'perc', 'arp', 'lead', 'tex'];

// Speech-duck groups. 'air' and 'tex' (hats, ticks, vinyl) skip the bed low-pass.
export const DUCK_GROUP = {
  pad: 'bed', bass: 'bed', keys: 'keys', kick: 'drums', snare: 'drums', hat: 'air', perc: 'air',
  arp: 'melody', lead: 'melody', tex: 'tex',
};

/** Programme identities shared by beds and stings (same keys and colours as audio/themes.js). */
export const PROGRAMMES = {
  'world-now': { title: 'WORLD NOW', tonic: 62, scale: 'major', colour: COLOUR.home, bpm: 92 },
  'tech-bytes': { title: 'TECH BYTES', tonic: 57, scale: 'dorian', colour: COLOUR.tech, bpm: 104 },
  cosmos: { title: 'COSMOS DESK', tonic: 64, scale: 'lydian', colour: COLOUR.cosmos, bpm: 72 },
  'money-minute': { title: 'MONEY MINUTE', tonic: 65, scale: 'major', colour: COLOUR.money, bpm: 114 },
  'news-60': { title: 'NEWS IN 60', tonic: 67, scale: 'major', colour: COLOUR.sixty, bpm: 120 },
  channel: { title: 'GLOBIT 24', tonic: 62, scale: 'major', colour: COLOUR.home, bpm: 84 },
};

const silentLayers = Object.fromEntries(LAYERS.map((l) => [l, 0]));

export const PALETTES = {
  // ------------------------------------------------------------ WORLD NOW (D)
  // The headline arc (brass Bm -> G -> D, timpani + pips) is cue-driven: stings.js.
  'world-now/roundup': {
    programme: 'world-now', title: 'WORLD NOW · around the world', key: 'D major', tonic: 62, scale: 'major', bpm: 100, swing: 0.5, trim: 0,
    mood: 'a muted pluck ostinato in eighths over triangle roots: travelling; no melody, no drums',
    sections: { A: ['Dadd9', 'Bm7', 'Gmaj9', 'A9sus'], B: ['Gmaj9', 'Dadd9/F#', 'Em9', 'A9sus'] },
    form: ['A', 'A', 'B', 'A'],
    colour: COLOUR.home,
    keys: { inst: 'ep', lo: 54 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.8 },
    bass: { style: 'half', wave: 'triangle', lp: 560 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'broken', oct: 12, wave: 'pulse25', decay: 0.085, bright: 1150, vel: 0.75 },
    lead: { inst: 'bell', oct: 12, variants: ['statement'] },
    perc: 'none', tex: 0,
    fx: { reverb: 0.16, echo: 0.06, tremolo: 0 },
    duckDb: -9,
    moments: {
      roundup: { energy: 0.6, gain: -13, lp: 2400, pocket: 0, bright: 0.9, layers: { arp: 1, bass: 0.85 } },
    },
  },
  'world-now/finally': {
    programme: 'world-now', title: 'WORLD NOW · and finally', key: 'D major', tonic: 62, scale: 'major', bpm: 88, swing: 0.55, trim: 0,
    mood: 'sparse soft triangle and pluck: the smile at the end of the bulletin, running through the chat',
    sections: { A: ['Gmaj9', 'Dadd9/F#', 'Em9', 'A9sus'], A2: ['Gmaj9', 'Bm9', 'Em9', 'A13'] },
    form: ['A', 'A2'],
    colour: COLOUR.home,
    keys: { inst: 'ep', lo: 54 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.8 },
    bass: { style: 'long', wave: 'triangle', lp: 500 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12, wave: 'pulse25', decay: 0.16, bright: 1500, vel: 0.6, sparse: 0.5 },
    lead: { inst: 'softtri', oct: 12, mode: 'sparse', maxNotes: 2 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.22, echo: 0.12, tremolo: 0 },
    duckDb: -9,
    moments: {
      finally: { energy: 0.45, gain: -6, lp: 2600, pocket: 0, bright: 1, layers: { arp: 0.9, lead: 0.8 }, lead: 'sparse' },
      chat: { energy: 0.45, gain: -6, lp: 2600, pocket: 0, bright: 1, layers: { arp: 0.9, lead: 0.6 }, lead: 'sparse' },
    },
  },

  // ------------------------------------------------------- TECH BYTES (A dorian)
  'tech-bytes': {
    programme: 'tech-bytes', title: 'TECH BYTES', key: 'A dorian', tonic: 57, scale: 'dorian', bpm: 104, swing: 0.5, trim: 0,
    mood: 'technological, classy: half-time triangle roots, a pad on Am9 and D9, a pulse-12 arpeggio in a dotted echo',
    sections: { A: ['Am9', 'Am9', 'D9', 'D9'], A2: ['Am9', 'D9', 'Am9', 'D9'] },
    form: ['A', 'A2'],
    colour: COLOUR.tech,
    keys: { inst: 'ep', lo: 55 },
    pad: { wave: 'pulse25', lo: 52, lpTo: 1000, attack: 0.9 },
    bass: { style: 'halftime', wave: 'triangle', lp: 520 },
    drums: 'hats',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'updown', oct: 12, wave: 'pulse125', decay: 0.14, bright: 1500, vel: 0.45 },
    lead: { inst: 'pluck', oct: 12, variants: ['statement'] },
    perc: 'none', tex: 0,
    fx: { reverb: 0.16, echo: 0.32, tremolo: 0 },
    duckDb: -9,
    moments: {
      headlines: { energy: 0.6, gain: -10, lp: 2200, pocket: 0, bright: 1, layers: { pad: 0.8, bass: 0.9, arp: 1, hat: 0.6 } },
      chat: { energy: 0.5, gain: -11, lp: 2000, pocket: 0, bright: 1, layers: { pad: 0.8, bass: 0.9, arp: 0.8 } },
      number: { energy: 0.45, gain: -12, lp: 1900, pocket: 0, bright: 0.9, layers: { pad: 0.8, bass: 0.8, arp: 0.6 } },
      finally: { energy: 0.6, gain: -10, lp: 2200, pocket: 0, bright: 1, layers: { pad: 0.8, bass: 0.9, arp: 1, hat: 0.6 } },
      signoff: { energy: 0.55, gain: -10, lp: 2200, pocket: 0, bright: 1, layers: { pad: 0.9, bass: 0.9, arp: 0.8 } },
    },
  },

  // --------------------------------------------------------- COSMOS (E lydian)
  cosmos: {
    programme: 'cosmos', title: 'COSMOS DESK', key: 'E lydian', tonic: 64, scale: 'lydian', bpm: 72, swing: 0.5, trim: 0,
    mood: 'pad and sub under every voice; bells (at most four a bar) in a long echo only when nobody speaks',
    sections: { A: ['Emaj9', 'F#add9/E', 'Emaj9', 'F#add9/E'], A2: ['C#m9', 'Amaj7#11', 'Emaj9', 'B9sus'] },
    form: ['A', 'A2'],
    colour: COLOUR.cosmos,
    keys: { inst: 'ep', lo: 56 },
    pad: { wave: 'glass', lo: 52, lpTo: 1100, attack: 1.8 },
    bass: { style: 'sub', wave: 'sine', lp: 380 },
    drums: 'none',
    arp: { inst: 'bell', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'bell', oct: 12, mode: 'sparse', maxNotes: 4, decay: 0.9 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.4, echo: 0.42, tremolo: 0 },
    duckDb: -6,
    duck: { melody: 0 }, // bells never sound under a voice
    moments: {
      coldOpen: { energy: 0.4, gain: -12, lp: 1200, pocket: 0, bright: 0.9, layers: { pad: 0.9, bass: 0.8, lead: 1 }, lead: 'sparse' },
      story: { energy: 0.35, gain: -12, lp: 1200, pocket: 0, bright: 0.9, layers: { pad: 0.9, bass: 0.8, lead: 0.8 }, lead: 'sparse', hidden: true },
    },
  },
  'cosmos/finally': {
    programme: 'cosmos', title: 'COSMOS DESK · and finally', key: 'E lydian', tonic: 64, scale: 'lydian', bpm: 72, swing: 0.5, trim: -4,
    mood: 'the light colour of the bed, 4 dB quieter',
    sections: { A: ['Amaj9', 'Emaj9/G#', 'F#m9', 'B9sus'] },
    form: ['A'],
    colour: COLOUR.cosmos,
    keys: { inst: 'ep', lo: 56 },
    pad: { wave: 'glass', lo: 54, lpTo: 1150, attack: 1.6 },
    bass: { style: 'sub', wave: 'sine', lp: 380 },
    drums: 'none',
    arp: { inst: 'bell', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'bell', oct: 12, mode: 'sparse', maxNotes: 3, decay: 0.9 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.4, echo: 0.42, tremolo: 0 },
    duckDb: -6,
    duck: { melody: 0 },
    moments: {
      story: { energy: 0.35, gain: -12, lp: 1200, pocket: 0, bright: 1, layers: { pad: 0.9, bass: 0.7, lead: 0.8 }, lead: 'sparse', hidden: true },
    },
  },

  // ---------------------------------------------------- MONEY MINUTE (F major)
  'money-minute/intro': {
    programme: 'money-minute', title: 'MONEY MINUTE · intro vamp', key: 'F major', tonic: 65, scale: 'major', bpm: 114, swing: 0.5, trim: 0,
    mood: 'brisk, straight: short Rhodes chords on the "and" of 2 and 4, triangle half notes, a filtered pad (intro only)',
    sections: { A: ['Fmaj9', 'Dm9', 'Bbmaj9', 'C6sus'] },
    form: ['A'],
    colour: COLOUR.money,
    keys: { inst: 'ep', lo: 53, index: 0.8, attack: 0.008, vel: 0.55 }, // peaks <= 0.5 with accents and humanising
    pad: { wave: 'pulse25', lo: 50, lpTo: 850, attack: 0.7 },
    bass: { style: 'half', wave: 'triangle', lp: 600 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'ep', oct: 12 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.15, echo: 0.06, tremolo: 0.15 },
    duckDb: -8,
    moments: {
      intro: { energy: 0.5, gain: -11, lp: 2400, pocket: 0, bright: 1, comp: 'andTwoFour', layers: { pad: 0.8, bass: 0.9, keys: 0.9 }, stagger: { pad: 0, bass: 1, keys: 2 } },
      signoff: { energy: 0.5, gain: -11, lp: 2400, pocket: 0, bright: 1, comp: 'andTwoFour', layers: { bass: 0.9, keys: 0.9 } },
    },
  },
  'money-minute/tape-up': tape('up', ['Fmaj9', 'Bbmaj9'], 'F Ionian'),
  'money-minute/tape-down': tape('down', ['Dm9', 'Bbmaj9'], 'D Aeolian'),
  'money-minute/tape-mixed': tape('mixed', ['Gm9', 'C9sus'], 'G Dorian, unresolved'),
  'money-minute/tape-neutral': {
    ...tape('neutral', ['F5add6'], 'F, no third: an F-C-D drone over an F pedal'),
    moments: { number: { energy: 0.3, gain: -12, lp: 1400, pocket: 0, bright: 0.9, layers: { pad: 0.9, bass: 0.7 }, bass: 'pedal' } },
  },
  // Owner switch bedUnderStories: 'drone' (default 'off' = silence under stories).
  'money-minute/drone': {
    ...tape('drone', ['F5add6'], 'one sustained pad, low-passed at 800 Hz, no rhythm'),
    moments: { story: { energy: 0.1, gain: -22, lp: 800, pocket: 0, bright: 0.7, layers: { pad: 1 } } },
  },

  // ------------------------------------------------------ NEWS IN 60 (G / Em)
  'news-60': {
    programme: 'news-60', title: 'NEWS IN 60', key: 'E minor / G major', tonic: 67, scale: 'major', bpm: 120, swing: 0.5, trim: 0,
    mood: 'a clock, not a race: pad, a staccato triangle on every beat, a soft woodblock tock (1, 3) and tick (2, 4)',
    sections: { A: ['Em9', 'Cmaj9', 'Gadd9', 'D6'], A2: ['Em9', 'Cmaj9', 'Am7', 'D9sus'] },
    form: ['A', 'A2'],
    colour: COLOUR.sixty,
    keys: { inst: 'ep', lo: 55 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.6 },
    bass: { style: 'staccato', wave: 'triangle', lp: 560 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'bell', oct: 12 },
    perc: 'clock', tex: 0,
    fx: { reverb: 0.14, echo: 0, tremolo: 0 },
    duckDb: -4, // -24 dB under speech, -20 dB in gaps (bible): a small duck on a quiet bed
    moments: {
      bed: { energy: 0.5, gain: -12, lp: 2000, pocket: 0, bright: 0.9, layers: { pad: 0.8, bass: 0.8, perc: 0.9 } },
      grave: { energy: 0.1, gain: -12, lp: 1600, pocket: 0, bright: 0.8, layers: { pad: 0.8 }, immediate: true },
    },
  },

  // ---------------------------------------------------------------- CHANNEL
  'channel/bumper': {
    programme: 'channel', title: 'GLOBIT 24 · bumper cards', key: 'D major', tonic: 62, scale: 'major', bpm: 84, swing: 0.6, trim: 0,
    mood: 'a loop of triangle bass and swung pluck, a whisper of vinyl: the network between programmes',
    sections: { A: ['Dmaj9', 'Bm9', 'Gmaj9', 'A9sus'] },
    form: ['A'],
    colour: COLOUR.home,
    keys: { inst: 'ep', lo: 54 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.8 },
    bass: { style: 'lofi', wave: 'triangle', lp: 620 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'broken', oct: 12, wave: 'pulse25', decay: 0.2, bright: 1800, vel: 0.85 },
    lead: { inst: 'pulse12', oct: 12 },
    perc: 'none', tex: 0.5,
    fx: { reverb: 0.22, echo: 0.14, tremolo: 0 },
    duckDb: -9,
    moments: {
      bumper: { energy: 0.6, gain: 3, lp: 5000, pocket: 0, bright: 1.2, layers: { arp: 1, bass: 1, tex: 0.5 }, entry: 'instant' },
    },
  },
  'channel/holding': {
    programme: 'channel', title: 'GLOBIT 24 · holding slide', key: 'D major', tonic: 62, scale: 'major', bpm: 72, swing: 0.5, trim: 0,
    mood: 'a held Dmaj9 over a triangle pedal: a quiet card between ads',
    sections: { A: ['Dmaj9', 'Gmaj9/D'] },
    form: ['A'],
    colour: COLOUR.home,
    keys: { inst: 'ep', lo: 54 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 1000, attack: 0.6 },
    bass: { style: 'pedal', wave: 'triangle', lp: 500 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'bell', oct: 12 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.3, echo: 0, tremolo: 0 },
    duckDb: -9,
    moments: { holding: { energy: 0.2, gain: -6, lp: 3000, pocket: 0, bright: 1, layers: { pad: 0.9, bass: 0.6 }, entry: 'instant' } },
  },
  // Standby (server unreachable): the cosy lo-fi home bed, endless and evolving.
  'channel/standby': {
    programme: 'channel', title: 'GLOBIT 24 · standby', key: 'D major', tonic: 62, scale: 'major', bpm: 72, swing: 0.6, trim: 1,
    mood: 'home: Rhodes with tremolo, lazy brushes, vinyl, the signature sung on a Rhodes; starts on IV and walks home',
    sections: {
      A: ['Gmaj9', 'F#m7', 'Em9', 'Dmaj9'],
      A2: ['Gmaj9', 'F#m7', 'Bm9', 'A9sus'],
      B: ['Em9', 'F#m7', 'Gmaj7#11', 'A13'],
      B2: ['Bm9', 'Gmaj9', 'Em9', 'A9sus'],
    },
    form: ['A', 'A2', 'B', 'A', 'B2', 'A2', 'A', 'B'],
    colour: COLOUR.home,
    keys: { inst: 'ep', lo: 53, index: 0.8, attack: 0.012 },
    pad: { wave: 'pulse25', lo: 48, lpTo: 1000, attack: 1.1 },
    bass: { style: 'lofi', wave: 'triangle', lp: 620 },
    drums: 'boombap',
    arp: { inst: 'bell', rate: 0.5, pattern: 'broken', oct: 12 },
    lead: { inst: 'ep', oct: 12, variants: ['statement', 'displaced', 'echo', 'augmented', 'head', 'statement'], colours: [COLOUR.home, COLOUR.next] },
    perc: 'shaker', tex: 1,
    fx: { reverb: 0.3, echo: 0.18, tremolo: 0.4 },
    moments: {
      standby: { energy: 0.6, gain: -2, lp: 6500, pocket: 0, bright: 1.5, lead: 'generative',
        layers: { pad: 0.8, keys: 1, bass: 1, kick: 0.7, snare: 0.5, hat: 0.55, perc: 0.45, arp: 0.25, lead: 0.9, tex: 1 } },
    },
  },
};

// Money Minute tape beds share one pitch set; only the tonal centre moves (the key never changes).
function tape(kind, chords, mood) {
  return {
    programme: 'money-minute', title: `MONEY MINUTE · tape ${kind}`, key: 'F major', tonic: 65, scale: 'major', bpm: 114, swing: 0.5, trim: 0,
    mood: `number of the day bed (${mood})`,
    sections: { A: chords },
    form: ['A'],
    colour: COLOUR.money,
    keys: { inst: 'ep', lo: 53, index: 0.8, attack: 0.008, vel: 0.55 }, // peaks <= 0.5 with accents and humanising
    pad: { wave: 'pulse25', lo: 50, lpTo: 800, attack: 0.9 },
    bass: { style: 'half', wave: 'triangle', lp: 600 },
    drums: 'none',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12 },
    lead: { inst: 'ep', oct: 12 },
    perc: 'none', tex: 0,
    fx: { reverb: 0.15, echo: 0.06, tremolo: 0.15 },
    duckDb: -8,
    moments: {
      number: { energy: 0.45, gain: -12, lp: 2200, pocket: 0, bright: 0.95, comp: 'andTwoFour', layers: { keys: 0.9, bass: 0.9 } },
    },
  };
}

/** Arrangement for (song, moment): unlisted layers are silent. */
export function arrangementFor(songId, moment) {
  const song = PALETTES[songId];
  const m = song?.moments?.[moment] || Object.values(song?.moments || {})[0] || { layers: {} };
  return { energy: 0.5, gain: -12, lp: 2400, pocket: 0, bright: 1, ...m, name: moment, layers: { ...silentLayers, ...m.layers } };
}

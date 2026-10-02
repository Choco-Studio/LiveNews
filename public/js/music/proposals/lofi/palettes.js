// Lo-fi newsroom proposal: one "song" per programme plus the channel's home bed.
// Every programme shares the motif (theory.js) but has its own key, tempo,
// groove and instruments. The keys sit on a chain of fifths
// (F channel - C money - G news-60 - D world - A tech - E cosmos), so any
// handoff is a near neighbour and the network sounds like one family.
//
// A programme is a song; a MOMENT is an arrangement of that song (which layers
// play and how loud). Changing moment inside a programme never stops the song:
// layers fade on a bar line ("vertical remix"), so transitions are seamless.

export const LAYERS = ['pad', 'keys', 'bass', 'kick', 'snare', 'hat', 'perc', 'arp', 'lead', 'tex'];

// Speech-duck groups: how far each layer drops while a presenter talks.
export const DUCK_GROUP = {
  pad: 'bed', bass: 'bed', keys: 'keys', kick: 'drums', snare: 'drums', hat: 'drums', perc: 'drums',
  arp: 'melody', lead: 'melody', tex: 'tex',
};

// Moment arrangements: layer levels 0..1, bed low-pass (Hz), level (dB), energy
// (orders transitions: going up waits for the bar line, going down only for the beat).
export const MOMENTS = {
  openTail: {
    energy: 0.8, gain: -3, lp: 5200, pocket: -3, dwellBars: 1, entry: 'instant',
    layers: { pad: 1, keys: 0.85, bass: 1, kick: 0.7, snare: 0.5, hat: 0.6, perc: 0.5, arp: 0.35, lead: 1, tex: 0.8 },
    lead: 'signature',
  },
  headlines: {
    energy: 0.7, gain: -8, lp: 3000, pocket: -5,
    layers: { pad: 0.55, keys: 1, bass: 1, kick: 0.85, snare: 0.55, hat: 0.65, perc: 0.7, arp: 0.45, lead: 0, tex: 0.45 },
  },
  story: {
    energy: 0.3, gain: -14, lp: 1700, pocket: -6, bass: 'long', comp: 'long',
    layers: { pad: 0.9, keys: 0.55, bass: 0.7, kick: 0, snare: 0, hat: 0.2, perc: 0.25, arp: 0, lead: 0, tex: 0.3 },
  },
  storyNeutral: {
    energy: 0.2, gain: -18, lp: 1300, pocket: -7, bass: 'long', comp: 'long',
    layers: { pad: 0.9, keys: 0.35, bass: 0.6, kick: 0, snare: 0, hat: 0, perc: 0.12, arp: 0, lead: 0, tex: 0.2 },
  },
  // Default for grave stories is real silence; this is only used with { gravePad: true }.
  gravePad: {
    energy: 0.05, gain: -30, lp: 420, pocket: -8, bass: 'long', comp: 'long', fadeOutSec: 9,
    layers: { pad: 1, keys: 0, bass: 0.5, kick: 0, snare: 0, hat: 0, perc: 0, arp: 0, lead: 0, tex: 0 },
  },
  chat: {
    energy: 0.55, gain: -11, lp: 2600, pocket: -5, bass: 'walk', comp: 'bouncy',
    layers: { pad: 0.45, keys: 1, bass: 1, kick: 0.55, snare: 0.4, hat: 0.55, perc: 0.6, arp: 0.15, lead: 0, tex: 0.4 },
  },
  map: {
    energy: 0.6, gain: -10, lp: 3000, pocket: -5,
    layers: { pad: 0.5, keys: 0.4, bass: 0.9, kick: 0.6, snare: 0.25, hat: 0.55, perc: 0.85, arp: 1, lead: 0, tex: 0.35 },
  },
  outro: {
    energy: 0.75, gain: -6, lp: 4200, pocket: -4,
    layers: { pad: 0.9, keys: 1, bass: 1, kick: 0.7, snare: 0.5, hat: 0.6, perc: 0.5, arp: 0.3, lead: 0.8, tex: 0.7 },
    lead: 'answer',
  },
  standby: {
    energy: 0.6, gain: -2, lp: 5200, pocket: 0,
    layers: { pad: 0.8, keys: 1, bass: 1, kick: 0.7, snare: 0.5, hat: 0.55, perc: 0.45, arp: 0.25, lead: 0.9, tex: 1 },
    lead: 'generative',
  },
};

/** Programme songs. tonic = MIDI note of the key in octave 4. */
export const PALETTES = {
  'world-now': {
    title: 'WORLD NOW', key: 'D major', tonic: 62, scale: 'major', bpm: 76, swing: 0.58,
    mood: 'steady flagship: Rhodes, brushes, warm triangle bass, music-box motif',
    sections: {
      A: ['Dmaj9', 'Bm9', 'Gmaj9', 'A9sus'],
      A2: ['Dmaj9', 'F#m7', 'Gmaj9', 'A13'],
      B: ['Em9', 'A13', 'F#m7', 'Bm9'],
      B2: ['Gmaj7#11', 'F#m7', 'Em9', 'A9sus'],
    },
    form: ['A', 'A2', 'B', 'A', 'B2', 'A2'],
    keys: { inst: 'ep', lo: 54, index: 0.85, attack: 0.012 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 1000, attack: 1.0 },
    bass: { style: 'lofi', wave: 'triangle', lp: 650 },
    drums: 'boombap',
    arp: { inst: 'bell', rate: 0.5, pattern: 'broken', oct: 12 },
    lead: { inst: 'bell', oct: 12, variants: ['statement', 'displaced', 'head', 'answer'] },
    perc: 'shaker',
    tex: 0.7,
    fx: { reverb: 0.22, echo: 0.14, tremolo: 0.35 },
    neutralStory: 'storyNeutral',
  },
  'tech-bytes': {
    title: 'TECH BYTES', key: 'A dorian', tonic: 57, scale: 'dorian', bpm: 88, swing: 0.55,
    mood: 'playful geek: chip plucks, bouncy sine bass, rim + shaker, 16th arps',
    sections: {
      A: ['Am9', 'D9', 'Fmaj9', 'E9sus'],
      A2: ['Am9', 'D9', 'Cmaj7', 'Bm7'],
      B: ['Fmaj9', 'G6', 'Em7', 'Am9'],
      B2: ['Fmaj9', 'G6', 'Cmaj7', 'E9sus'],
    },
    form: ['A', 'A2', 'A', 'B', 'A2', 'B2'],
    keys: { inst: 'pluck', lo: 57, wave: 'pulse25', bright: 1900, decay: 0.32 },
    pad: { wave: 'square', lo: 52, lpTo: 900, attack: 0.7 },
    bass: { style: 'bounce', wave: 'sine', lp: 520 },
    drums: 'bounce',
    arp: { inst: 'pluck', rate: 0.25, pattern: 'updown', oct: 12, wave: 'pulse125' },
    lead: { inst: 'chip', oct: 12, variants: ['statement', 'displaced', 'inversion', 'head'] },
    perc: 'shaker',
    tex: 0.3,
    fx: { reverb: 0.14, echo: 0.2, tremolo: 0 },
    neutralStory: 'story',
  },
  cosmos: {
    title: 'COSMOS DESK', key: 'E lydian', tonic: 64, scale: 'lydian', bpm: 68, swing: 0.5,
    mood: 'floating wonder: glass pads, sub sine, bells in a long echo, half-time pulse',
    sections: {
      A: ['Emaj9', 'F#add9/E', 'Emaj9', 'F#add9/E'],
      A2: ['Emaj9', 'F#6/E', 'G#m7', 'C#m9'],
      B: ['Amaj7#11', 'G#m7', 'F#add9', 'B9sus'],
      B2: ['C#m9', 'Amaj9', 'Emaj9', 'B9sus'],
    },
    form: ['A', 'A2', 'B', 'A', 'B2', 'A2'],
    keys: { inst: 'ep', lo: 56, index: 0.45, attack: 0.03, roll: 0.06 },
    pad: { wave: 'glass', lo: 52, lpTo: 1400, attack: 1.8 },
    bass: { style: 'sub', wave: 'sine', lp: 400 },
    drums: 'halftime',
    arp: { inst: 'bell', rate: 0.5, pattern: 'up', oct: 12, sparse: 0.35 },
    lead: { inst: 'bell', oct: 12, variants: ['augmented', 'statement', 'retrograde', 'displaced'] },
    perc: 'shaker',
    tex: 0.35,
    fx: { reverb: 0.42, echo: 0.3, tremolo: 0.2 },
    neutralStory: 'story',
  },
  'money-minute': {
    title: 'MONEY MINUTE', key: 'C major', tonic: 60, scale: 'major', bpm: 82, swing: 0.52,
    mood: 'crisp and tidy: bright Rhodes, walking bass, straight hats, a pluck ticker',
    sections: {
      A: ['Cmaj9', 'Am9', 'Dm9', 'G13'],
      A2: ['Em7', 'Am9', 'Dm9', 'G9sus'],
      B: ['Fmaj9', 'Em7', 'Dm9', 'G13'],
      B2: ['Fmaj9', 'Em7', 'Dm9', 'Dm9/G'],
    },
    form: ['A', 'A2', 'B', 'A', 'A2', 'B2'],
    keys: { inst: 'ep', lo: 55, index: 1.0, attack: 0.008 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.8 },
    bass: { style: 'tidy', wave: 'triangle', lp: 700 },
    drums: 'tight',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'broken', oct: 12, wave: 'pulse25' },
    lead: { inst: 'pluck', oct: 12, variants: ['statement', 'head', 'displaced', 'answer'] },
    perc: 'rim',
    tex: 0.4,
    fx: { reverb: 0.15, echo: 0.1, tremolo: 0.15 },
    neutralStory: 'storyNeutral',
  },
  'news-60': {
    title: 'NEWS IN 60', key: 'G major', tonic: 67, scale: 'major', bpm: 92, swing: 0.5,
    mood: 'rolling clock: straight 8th pulse bass, off-beat chip stabs, soft ticking',
    sections: {
      A: ['Gadd9', 'Em7', 'Cmaj9', 'D6'],
      A2: ['Gadd9', 'Bm7', 'Cmaj9', 'D9sus'],
      B: ['Am7', 'Cmaj7', 'Em7', 'D9sus'],
      B2: ['Cmaj9', 'D6', 'Bm7', 'Em7'],
    },
    form: ['A', 'A2', 'A', 'B', 'A2', 'B2'],
    keys: { inst: 'pulse', lo: 55, wave: 'pulse25', decay: 0.2 },
    pad: { wave: 'pulse25', lo: 50, lpTo: 900, attack: 0.6 },
    bass: { style: 'pulse8', wave: 'triangle', lp: 600 },
    drums: 'four',
    arp: { inst: 'pluck', rate: 0.5, pattern: 'up', oct: 12, wave: 'pulse125' },
    lead: { inst: 'chip', oct: 0, variants: ['statement', 'head', 'statement', 'displaced'] },
    perc: 'tick',
    tex: 0.3,
    fx: { reverb: 0.12, echo: 0.1, tremolo: 0 },
    neutralStory: 'story',
  },
  channel: {
    title: 'GLOBIT 24', key: 'F major', tonic: 65, scale: 'major', bpm: 72, swing: 0.6,
    mood: 'home: the coziest bed, Rhodes with tremolo, lazy brushes, vinyl, the motif sung on bells',
    sections: {
      A: ['Fmaj9', 'Am7', 'Dm9', 'C9sus'],
      A2: ['Bbmaj9', 'Am7', 'Gm9', 'C13'],
      B: ['Dm9', 'Bbmaj7', 'Gm9', 'C9sus'],
      B2: ['Bbmaj7#11', 'Am7', 'Gm9', 'Gm9/C'],
    },
    form: ['A', 'A2', 'B', 'A', 'B2', 'A2', 'A', 'B'],
    keys: { inst: 'ep', lo: 53, index: 0.8, attack: 0.012 },
    pad: { wave: 'pulse25', lo: 48, lpTo: 1000, attack: 1.1 },
    bass: { style: 'lofi', wave: 'triangle', lp: 620 },
    drums: 'boombap',
    arp: { inst: 'bell', rate: 0.5, pattern: 'broken', oct: 12 },
    lead: { inst: 'bell', oct: 12, variants: ['statement', 'displaced', 'answer', 'augmented', 'head', 'retrograde'] },
    perc: 'shaker',
    tex: 1,
    fx: { reverb: 0.3, echo: 0.18, tremolo: 0.4 },
    neutralStory: 'story',
  },
};

// Per-programme tweaks to moment arrangements (personality on top of the template).
export const OVERRIDES = {
  cosmos: {
    story: { layers: { arp: 0.25, hat: 0, perc: 0.15 } }, // a few distant bells: wonder under the explanation
    headlines: { layers: { snare: 0.3 } },
  },
  'news-60': {
    story: { layers: { perc: 0.45, bass: 0.6 }, bass: 'pulse8', comp: 'long' }, // the clock keeps ticking
    storyNeutral: { layers: { perc: 0.35 }, bass: 'pulse8' },
  },
  'money-minute': {
    story: { layers: { arp: 0.18 } }, // a faint ticker
  },
  'tech-bytes': {
    story: { layers: { arp: 0.12 } },
  },
};

/** Arrangement for (palette, moment) with the programme overrides merged in. */
export function arrangementFor(paletteId, moment) {
  const base = MOMENTS[moment] || MOMENTS.story;
  const o = OVERRIDES[paletteId]?.[moment];
  const arr = { ...base, ...(o || {}), name: moment, layers: { ...base.layers, ...(o?.layers || {}) } };
  return arr;
}

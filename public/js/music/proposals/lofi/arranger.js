// Lo-fi newsroom proposal: the arranger. For (song, arrangement, bar n) it
// returns that bar's notes. It is deterministic (seeded by song + bar) so a bed
// played live sounds exactly like its offline render, and it varies on every
// pass through the form (chord colours, voicings, comping, fills, melody), so
// a bed can run for many minutes without sounding like a loop.

import {
  SCALES, parseChord, voiceChord, chordPcs, degreeToMidi, motifVariant, rng, hash, mod,
} from './theory.js';

// Colour substitutions on later passes: same function, different shade.
const SUBS = {
  maj9: ['6/9', 'maj7', 'maj9'],
  maj7: ['maj9', '6/9'],
  m9: ['m11', 'm7', 'm9'],
  m7: ['m9', 'm11'],
  13: ['9', '7b9', '13'],
  '9sus': ['13', '9sus'],
  add9: ['6/9', 'maj9'],
};

/** Bars in one pass of the form (sections may be 1, 2 or 4 bars long). */
export function formBars(pal) {
  return pal.form.reduce((sum, sec) => sum + pal.sections[sec].length, 0);
}

/** Chord for bar n (with variety from the second pass of the form on). */
export function chordAt(pal, n, id) {
  const total = formBars(pal);
  let k = mod(n, total);
  let sym = null;
  for (const sec of pal.form) {
    const chords = pal.sections[sec];
    if (k < chords.length) {
      sym = chords[k];
      break;
    }
    k -= chords.length;
  }
  const chord = parseChord(sym);
  const pass = Math.floor(n / total);
  if (pass > 0 && n % 4 !== 0 && total >= 8) {
    const r = rng(hash(id, 'sub', n));
    const opts = SUBS[chord.quality];
    if (opts && r.chance(0.35)) {
      const q = r.pick(opts);
      return parseChord(sym.replace(chord.quality, q));
    }
  }
  return chord;
}

// Keys comping rhythms: [start beat, length] per hit.
const COMP = {
  long: [[[0, 3.9]], [[0, 2.4], [2.5, 1.4]]],
  lofi: [[[0, 1.4], [1.5, 2.4]], [[0, 0.9], [2.5, 1.4]], [[0, 2.4], [3.5, 0.45]], [[0.5, 1], [2.5, 1.4]], [[0, 3.9]]],
  bouncy: [[[0, 0.4], [0.75, 0.6], [2, 0.4], [2.75, 1.1]], [[0, 0.9], [1.5, 0.4], [2.5, 1.4]], [[0.5, 0.4], [1.5, 0.9], [3, 0.4], [3.5, 0.45]]],
  tidy: [[[0, 0.9], [1.5, 0.4], [2, 0.9], [3.5, 0.45]], [[0, 1.9], [2.5, 1.4]], [[0, 0.9], [1, 0.9], [2.5, 1.4]]],
  float: [[[0, 3.9]], [[0, 1.9], [2, 1.9]]],
  stabs: [[[0.5, 0.3], [1.5, 0.3], [2.5, 0.3], [3.5, 0.3]], [[0, 0.3], [0.5, 0.3], [1.5, 0.3], [2.5, 0.3], [3, 0.3], [3.5, 0.3]]],
  andTwoFour: [[[1.5, 0.4], [3.5, 0.4]]], // Money Minute: short chords on the "and" of 2 and 4
};
const PALETTE_COMP = { ep: 'lofi', pluck: 'bouncy', pulse: 'stabs' };

const DRUMS = {
  boombap: {
    brush: true,
    kick: [[0, 1], [1.75, 0.5, 0.45], [2.5, 0.85]],
    snare: [[1, 1], [3, 1]],
    ghosts: [[2.75, 0.22, 0.3], [3.75, 0.18, 0.25], [0.75, 0.15, 0.2]],
    hats: { step: 0.5, vel: [0.9, 0.45, 0.7, 0.45, 0.85, 0.45, 0.7, 0.5], open: 0.15 },
  },
  halftime: {
    brush: true,
    kick: [[0, 1], [2.5, 0.55, 0.4]],
    snare: [[2, 0.75]],
    ghosts: [[3.75, 0.15, 0.2]],
    hats: { step: 1, vel: [0.55, 0.4, 0.5, 0.4], open: 0 },
  },
  tight: {
    brush: false,
    kick: [[0, 1], [1.5, 0.45, 0.3], [2.5, 0.85]],
    snare: [[1, 0.85], [3, 0.85]],
    ghosts: [[3.75, 0.15, 0.2]],
    hats: { step: 0.5, vel: [0.8, 0.5, 0.65, 0.5, 0.8, 0.5, 0.65, 0.55], open: 0 },
  },
  four: {
    brush: false,
    kick: [[0, 0.72], [1, 0.55], [2, 0.7], [3, 0.55]], // a soft heartbeat, not a club kick
    snare: [[1, 0.45], [3, 0.45]],
    ghosts: [],
    hats: { step: 0.5, vel: [0, 0.75, 0, 0.7, 0, 0.75, 0, 0.7], open: 0.1 },
  },
  hats: { // closed hats only (Tech Bytes light beds): no kick, no snare
    brush: false, kick: [], snare: [], ghosts: [],
    hats: { step: 0.5, vel: [0.55, 0.35, 0.45, 0.35, 0.55, 0.35, 0.45, 0.4], open: 0 },
  },
  none: { brush: false, kick: [], snare: [], ghosts: [], hats: { step: 1, vel: [0], open: 0 } },
  bounce: {
    brush: false,
    kick: [[0, 1], [0.75, 0.5, 0.4], [2, 0.8], [2.5, 0.6, 0.5]],
    snare: [[1, 0.85], [3, 0.85]],
    ghosts: [[1.75, 0.15, 0.25], [3.25, 0.15, 0.2]],
    hats: { step: 0.5, vel: [0.75, 0.45, 0.6, 0.45, 0.75, 0.45, 0.6, 0.5], open: 0.08 },
  },
};

const isOn = (arr, prev, layer) => (arr.layers[layer] || 0) > 0 || (prev?.layers[layer] || 0) > 0;

/** Swing the off-beat 8ths (and, more lightly, the 16ths). */
export function swingAt(at, s) {
  const beat = Math.floor(at + 1e-6);
  const f = at - beat;
  if (Math.abs(f - 0.5) < 1e-3) return beat + s;
  if (Math.abs(f - 0.25) < 1e-3) return beat + 0.25 + (s - 0.5) * 0.5;
  if (Math.abs(f - 0.75) < 1e-3) return beat + 0.75 + (s - 0.5) * 0.5;
  return at;
}

const bassNote = (pc) => 36 + mod(pc, 12); // C2..B2
const fifthOf = (n) => (n + 7 > 47 ? n - 5 : n + 7);

function approach(r, cur, nextChord) {
  const target = bassNote(nextChord.bass);
  const t = Math.abs(target - cur) > 6 ? (target > cur ? target - 12 : target + 12) : target;
  return r.weighted([[t - 1, 5], [t + 1, 2], [t - 5 < 33 ? t + 7 : t - 5, 2]]);
}

function bassLine(style, r, chord, next, pal) {
  const root = bassNote(chord.bass);
  const fifth = fifthOf(root);
  const third = root + (chord.tones.includes(3) ? 3 : chord.tones.includes(5) ? 5 : 4);
  const ev = (at, dur, midi, vel) => ({ inst: 'bass', layer: 'bass', at, dur, midi, vel });
  switch (style) {
    case 'long': {
      if (chord.bass === chord.root && r.chance(0.3)) return [ev(0, 2.45, root, 0.8), ev(2.5, 1.48, fifth, 0.6)];
      return [ev(0, 3.97, root, 0.8)]; // legato into the next bar: no gap, no re-attack bump
    }
    case 'sub':
      return r.chance(0.35) ? [ev(0, 2.45, root, 0.85), ev(2.5, 1.48, fifth, 0.55)] : [ev(0, 3.97, root, 0.85)];
    case 'walk':
      return [
        ev(0, 0.92, root, 0.85),
        ev(1, 0.92, r.chance(0.5) ? third : fifth, 0.68),
        ev(2, 0.92, r.chance(0.6) ? fifth : root + 9 > 47 ? root - 3 : root + 9, 0.7),
        ev(3, 0.92, approach(r, root, next), 0.66),
      ];
    case 'bounce':
      return [
        ev(0, 0.45, root, 0.85), ev(0.75, 0.25, root + 12, 0.5), ev(1.5, 0.45, root, 0.68),
        ev(2.5, 0.45, fifth, 0.66), ev(3, 0.45, root + 12, 0.5), ev(3.5, 0.45, approach(r, root, next), 0.58),
      ];
    case 'pulse8': {
      const out = [];
      for (let i = 0; i < 8; i++) {
        const oct = i % 2 === 1 && r.chance(0.18) ? 12 : 0;
        out.push(ev(i * 0.5, 0.4, i === 7 ? approach(r, root, next) : root + oct, i % 2 ? 0.45 : 0.62));
      }
      return out;
    }
    case 'half': // half notes, root then fifth
      return [ev(0, 1.95, root, 0.8), ev(2, 1.95, chord.bass === chord.root ? fifth : root, 0.68)];
    case 'halftime': // a root that breathes: long on 1, a short push into 3
      return r.chance(0.5) ? [ev(0, 2.9, root, 0.85), ev(3, 0.9, root, 0.55)] : [ev(0, 3.95, root, 0.85)];
    case 'staccato': // NEWS IN 60: a short note on every beat
      return [0, 1, 2, 3].map((b) => ev(b, 0.3, b === 2 && chord.bass === chord.root && r.chance(0.4) ? fifth : root, b % 2 ? 0.6 : 0.78));
    case 'pedal': // the programme's tonic held under everything
      return [ev(0, 3.98, bassNote(pal ? pal.tonic % 12 : chord.root), 0.75)];
    case 'tidy':
      return [ev(0, 1.9, root, 0.82), ev(2, 1.4, r.chance(0.5) ? fifth : third, 0.66), ev(3.5, 0.45, approach(r, root, next), 0.6)];
    default: { // 'lofi'
      const out = [ev(0, 1.4, root, 0.85)];
      if (r.chance(0.45)) out.push(ev(1.5, 0.45, root, 0.5));
      out.push(ev(2.5, 0.9, r.chance(0.7) ? fifth : root + 12, 0.7));
      if (r.chance(0.7)) out.push(ev(3.5, 0.45, approach(r, root, next), 0.58));
      return out;
    }
  }
}

function arpOrder(pattern, notes) {
  const up = [...notes, ...notes.map((n) => n + 12)];
  if (pattern === 'updown') return [...up, ...up.slice(1, -1).reverse()];
  if (pattern === 'broken') return [0, 2, 1, 3, 2, 4, 3, 1].map((i) => up[i % up.length]);
  return up;
}

// Pick a transposition (in scale steps) so the motif's long last note sits well on the chord.
function fitShift(pal, chord, variant, r) {
  const scale = SCALES[pal.scale];
  const pcs = chordPcs(chord);
  pcs.add((chord.root + 2) % 12); // the 9th is always welcome in lo-fi
  const last = variant[variant.length - 1];
  const order = [0, 2, -2, 4, -3, 1, -1, 3];
  const start = r.chance(0.7) ? 0 : 1;
  for (let i = 0; i < order.length; i++) {
    const s = order[(i + start) % order.length];
    if (pcs.has(mod(degreeToMidi(pal.tonic, scale, last.d + s), 12))) return s;
  }
  return 0;
}

function motifNotes(pal, chord, kind, offset, r, inst, vel = 0.8, colour = pal.colour) {
  const scale = SCALES[pal.scale];
  // The signature itself is never transposed (it is the channel's name); variations follow the chords.
  const shift = kind === 'statement' ? 0 : fitShift(pal, chord, motifVariant(kind, 0, colour), r);
  const v = motifVariant(kind, shift, colour);
  const oct = pal.lead.oct;
  return v.map((n, i) => ({
    inst, layer: 'lead', at: offset + n.at, dur: n.len * 0.95,
    midi: degreeToMidi(pal.tonic + oct, scale, n.d), vel: vel * (i === v.length - 1 ? 0.9 : 1) * (0.92 + r() * 0.12),
    p: inst === 'ep' ? { index: 0.9, tine: 0.3, attack: 0.01, decay: 1.1 } : {},
  }));
}

// 4-bar lead plans for the generative standby melody. null = rest bar.
const LEAD_PLANS = [
  ['v0', null, 'v1', null],
  [null, 'displaced', null, 'echo'],
  ['augmented', null, 'head', null],
  ['v0', null, null, 'echo'],
  [null, 'v1', null, 'head'],
];

// Sparse lead: a few long chord tones a bar (COSMOS bells: at most 4; WORLD NOW soft triangle: 2).
function sparseLead(pal, chord, r, n) {
  const max = pal.lead.maxNotes ?? 2;
  const count = Math.max(1, Math.min(max, 1 + Math.floor(r() * max)));
  const slots = [0, 1, 1.5, 2, 2.5, 3];
  const picks = [];
  while (picks.length < count && slots.length) picks.push(slots.splice(Math.floor(r() * slots.length), 1)[0]);
  picks.sort((x, y) => x - y);
  const tones = voiceChord(chord, null, pal.tonic + pal.lead.oct - 5);
  const out = [];
  let prev = null;
  for (let i = 0; i < picks.length; i++) {
    let midi = r.pick(tones);
    if (midi === prev && tones.length > 1) midi = tones[(tones.indexOf(midi) + 1) % tones.length];
    prev = midi;
    const end = i + 1 < picks.length ? picks[i + 1] : 4;
    out.push({
      inst: pal.lead.inst, layer: 'lead', at: picks[i], dur: Math.max(0.5, (end - picks[i]) * 0.95), midi, vel: 0.6 * (0.9 + r() * 0.2),
      p: pal.lead.inst === 'bell' ? { decay: pal.lead.decay ?? 0.7, pan: r.range(-0.4, 0.4) } : { pan: r.range(-0.2, 0.2) },
    });
  }
  // Breathe: every fourth bar has no melody at all.
  return n % 4 === 3 ? [] : out;
}

function leadFor(pal, id, arr, n, chord, r) {
  const inst = pal.lead.inst;
  const mode = arr.lead;
  if (mode === 'sparse') return sparseLead(pal, chord, r, n);
  if (mode === 'signature') {
    if (n === 0) return motifNotes(pal, chord, 'statement', 0, r, inst, 0.9);
    if (n === 2) return motifNotes(pal, chord, 'echo', 0, r, inst, 0.6);
    return [];
  }
  if (mode === 'answer') {
    if (n % 4 === 0) return motifNotes(pal, chord, 'statement', 0, r, inst, 0.75);
    if (n % 4 === 2) return motifNotes(pal, chord, 'answer', 0, r, inst, 0.7);
    return [];
  }
  if (mode === 'generative') {
    const period = Math.floor(n / 4);
    if (period % 4 === 3) return []; // breathe: four bars without melody every sixteen
    const pr = rng(hash(id, 'plan', period));
    const plan = pr.pick(LEAD_PLANS);
    const variants = pal.lead.variants;
    const colours = pal.lead.colours || [pal.colour];
    const colour = colours[period % colours.length];
    const slot = plan[n % 4];
    if (!slot) return [];
    const kind = slot === 'v0' ? variants[period % variants.length] : slot === 'v1' ? pr.pick(variants) : slot;
    if (kind === 'augmented' && n % 4 === 3) return [];
    return motifNotes(pal, chord, kind, 0, r, inst, 0.75, colour);
  }
  return [];
}

/**
 * Notes for bar n. `state` carries the voice leading from bar to bar.
 * opts.noDrums keeps the kit out (first bar after silence: the bed eases in).
 */
export function barEvents(pal, id, arr, prev, n, state, opts = {}) {
  const r = rng(hash(id, arr.name, n));
  const chord = chordAt(pal, n, id);
  const next = chordAt(pal, n + 1, id);
  const out = [];
  const human = () => 0.92 + r() * 0.14;
  // Timbral ducking: instruments play darker under speech, brighter when the music is alone.
  const bright = arr.bright ?? 1;

  // Pad: the chord as a slow swell, voiced low and close.
  if (isOn(arr, prev, 'pad')) {
    const v = voiceChord(chord, state.padVoicing, pal.pad.lo);
    state.padVoicing = v;
    v.forEach((midi, i) => out.push({
      inst: 'pad', layer: 'pad', at: 0, dur: 4, midi, vel: 0.8 * human(),
      p: { wave: pal.pad.wave, lpTo: pal.pad.lpTo * bright, attack: pal.pad.attack, pan: (i - (v.length - 1) / 2) * 0.22 },
    }));
  }

  // Keys: rootless voicings with a little strum, rhythm from the comping table.
  if (isOn(arr, prev, 'keys')) {
    const style = arr.comp || PALETTE_COMP[pal.keys.inst] || 'lofi';
    const pats = COMP[pal.keys.inst === 'pulse' && style !== 'long' ? 'stabs' : style] || COMP.lofi;
    // One groove per 4-bar phrase (repetition is what makes a loop feel good), a variation
    // on the phrase's last bar half the time (the turnaround), a new groove next phrase.
    const pr = rng(hash(id, style, 'comp', Math.floor(n / 4)));
    const phrasePat = n < 4 ? pats[0] : pr.pick(pats);
    const pat = n % 4 === 3 && pr.chance(0.5) ? pr.pick(pats) : phrasePat;
    const v = voiceChord(chord, state.voicing, pal.keys.lo);
    state.voicing = v;
    const inst = pal.keys.inst === 'pulse' ? 'stab' : pal.keys.inst;
    for (const [at, dur] of pat) {
      const roll = pal.keys.roll ?? 0.022;
      const accent = at % 1 === 0 ? 1 : 0.85;
      v.forEach((midi, i) => out.push({
        inst, layer: 'keys', at, dur, midi, vel: (pal.keys.vel ?? 0.75) * accent * human(), strum: i * roll * r.range(0.6, 1.2),
        p: { index: (pal.keys.index ?? 0.8) * bright, tine: Math.max(0, bright - 1), attack: pal.keys.attack, wave: pal.keys.wave, bright: (pal.keys.bright ?? 2000) * bright, decay: pal.keys.decay, pan: (i - 1.5) * 0.12 },
      }));
    }
  }

  if (isOn(arr, prev, 'bass')) {
    const style = arr.bass && !(pal.bass.style === 'pulse8' && arr.bass === 'walk') ? arr.bass : pal.bass.style;
    for (const e of bassLine(style, r, chord, next, pal)) out.push({ ...e, vel: e.vel * human(), p: { wave: pal.bass.wave, lp: pal.bass.lp, release: style === 'staccato' ? 0.04 : undefined } });
  }

  // Drums, with a fill every 8 bars and a breather bar every 16.
  const kit = DRUMS[pal.drums] || DRUMS.boombap;
  const breather = n % 16 === 15 && arr.energy < 0.9;
  if (!opts.noDrums) {
    if (isOn(arr, prev, 'kick')) {
      for (const [at, vel, p] of kit.kick) {
        if (breather && at > 0) continue;
        if (p && !r.chance(p)) continue;
        out.push({ inst: 'kick', layer: 'kick', at, vel: vel * human() });
      }
    }
    if (isOn(arr, prev, 'snare') && !breather) {
      for (const [at, vel] of kit.snare) out.push({ inst: 'snare', layer: 'snare', at, vel: vel * human(), p: { brush: kit.brush } });
      for (const [at, vel, p] of kit.ghosts) if (r.chance(p)) out.push({ inst: 'snare', layer: 'snare', at, vel: vel * human(), p: { brush: kit.brush } });
      if (n % 8 === 7) for (const [at, vel] of [[3.25, 0.18], [3.5, 0.26], [3.75, 0.34]]) out.push({ inst: 'snare', layer: 'snare', at, vel, p: { brush: kit.brush } });
    }
    if (isOn(arr, prev, 'hat') && !breather) {
      const { step, vel, open } = kit.hats;
      for (let i = 0; i * step < 4; i++) {
        const v = vel[i % vel.length];
        if (!v || r.chance(0.08)) continue;
        const isOpen = open && i * step === 3.5 && r.chance(open);
        out.push({ inst: 'hat', layer: 'hat', at: i * step, vel: v * human(), open: isOpen });
      }
    }
    if (isOn(arr, prev, 'perc')) {
      if (pal.perc === 'clock') {
        // tock on 1 and 3, tick on 2 and 4: a clock rather than a race
        for (let b = 0; b < 4; b++) out.push({ inst: 'clock', layer: 'perc', at: b, vel: (b % 2 ? 0.6 : 0.8) * human(), tok: b % 2 === 0 });
      } else if (pal.perc === 'none') {
        // nothing
      } else if (pal.perc === 'tick') {
        for (let i = 0; i < 8; i++) out.push({ inst: 'tick', layer: 'perc', at: i * 0.5, vel: (i % 2 ? 0.55 : 0.8) * human(), tok: i % 2 === 1 });
      } else if (pal.perc === 'rim') {
        for (const at of [0.75, 2.75]) if (r.chance(0.8)) out.push({ inst: 'rim', layer: 'perc', at, vel: 0.6 * human() });
        if (r.chance(0.3)) out.push({ inst: 'rim', layer: 'perc', at: 3.5, vel: 0.4 });
      } else if (!breather) {
        const step = pal.drums === 'halftime' || pal.drums === 'bounce' ? 0.25 : 0.5;
        for (let i = 0; i * step < 4; i++) {
          if (r.chance(0.1)) continue;
          const accent = (i * step) % 1 === 0.5 ? 1 : (i * step) % 1 === 0 ? 0.75 : 0.5;
          out.push({ inst: 'shaker', layer: 'perc', at: i * step, vel: accent * human() * 0.8 });
        }
      }
    }
  }

  // Arpeggio: the chord broken into 8ths or 16ths, an octave above the keys.
  if (isOn(arr, prev, 'arp')) {
    const a = pal.arp;
    const v = voiceChord(chord, null, pal.keys.lo + 7);
    const seq = arpOrder(a.pattern, v);
    const steps = Math.round(4 / a.rate);
    for (let i = 0; i < steps; i++) {
      if (a.sparse && r.chance(a.sparse)) continue;
      if (arr.name === 'story' && i % 2) continue;
      const midi = seq[i % seq.length] + (a.oct - 12);
      const accent = (i * a.rate) % 1 === 0 ? 1 : 0.7;
      out.push({
        inst: a.inst, layer: 'arp', at: i * a.rate, dur: a.rate * 0.9, midi, vel: (a.vel ?? 0.8) * accent * human(),
        p: { wave: a.wave, decay: a.decay ?? (a.inst === 'bell' ? 0.35 : 0.12), bright: (a.bright ?? 1600) * bright, pan: ((i % 4) - 1.5) * 0.25 },
      });
    }
  }

  if (isOn(arr, prev, 'lead') && arr.lead) out.push(...leadFor(pal, id, arr, n, chord, r));

  return { chord, events: out };
}

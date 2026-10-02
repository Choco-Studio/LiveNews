// Lo-fi newsroom proposal: offline renders for the lab page and
// tools/render-audio.mjs. Drives LofiEngine on an OfflineAudioContext through
// the same pump()/cue()/setSpeaking() calls the live channel would make, with
// test voice lines (Kokoro WAVs when the page can fetch them, otherwise a
// speech-shaped stand-in) placed at realistic times.

import { LofiEngine, LOOKAHEAD } from './engine.js';
import { PALETTES } from './palettes.js';
import { rng } from './theory.js';

// Durations of the Kokoro test clips (scratchpad/audio/music/lofi/voice), used for the stand-in too.
export const CLIPS = {
  'wn-headlines': 11.457, 'wn-light': 11.427, 'wn-grave': 8.715, 'wn-chat1': 3.124, 'wn-chat2': 2.884,
  'wn-chat3': 1.516, 'wn-outro': 2.791, 'tb-line': 9.938, 'tb-line2': 7.397, 'co-line': 8.684,
  'co-line2': 6.174, 'mm-line': 9.393, 'n6-line': 9.555, 'wn-map': 9.802,
};
const PROGRAMME_LINES = {
  'world-now': ['wn-light', 'wn-headlines'],
  'tech-bytes': ['tb-line', 'tb-line2'],
  cosmos: ['co-line', 'co-line2'],
  'money-minute': ['mm-line'],
  'news-60': ['n6-line', 'wn-map'],
  channel: [],
};

/** The required 60 s demo: open tail -> headlines -> light -> grave -> chat -> outro -> end card. */
export const TIMELINES = {
  demo: {
    programme: 'world-now',
    seconds: 60,
    cues: [
      [0, 'openTail'],
      [2.6, 'headlines'],
      [15.0, 'story', { emotion: 'happy' }],
      [27.3, 'story', { emotion: 'serious' }],
      [37.3, 'chat'],
      [46.8, 'outro'],
      [50.6, 'endcard'],
    ],
    voice: [[3.0, 'wn-headlines'], [15.3, 'wn-light'], [27.8, 'wn-grave'], [38.0, 'wn-chat1'], [41.4, 'wn-chat2'], [44.6, 'wn-chat3'], [47.3, 'wn-outro']],
  },
  // A break and the next show: end card, bumper, (ads: silence), up next, replay tag, Tech Bytes opens.
  'demo-break': {
    programme: 'world-now',
    seconds: 40,
    cues: [
      [0, 'outro'],
      [3.5, 'endcard'],
      [9.0, 'bumperIn'],
      [13.5, 'silence'],
      [18.0, 'upNext', { next: 'tech-bytes' }],
      [23.0, 'replay', { programId: 'tech-bytes' }],
      [24.8, 'openTail', { programId: 'tech-bytes' }],
      [26.5, 'headlines', { programId: 'tech-bytes' }],
    ],
    voice: [[0.6, 'wn-outro'], [27.2, 'tb-line']],
  },
  // News in 60: headlines, an 'around the world' map round-up, a breaking story, outro.
  'demo-news60': {
    programme: 'news-60',
    seconds: 50,
    cues: [
      [0, 'openTail'],
      [2.0, 'headlines'],
      [12.5, 'map'],
      [23.5, 'story', { breaking: true }],
      [36.5, 'outro'],
      [41.0, 'endcard'],
    ],
    voice: [[2.4, 'n6-line'], [13.0, 'wn-map'], [26.8, 'wn-grave'], [37.2, 'wn-outro']],
  },
  // The standby bed for three minutes (fatigue check).
  standby: { programme: 'channel', seconds: 180, cues: [[0, 'standby']], voice: [] },
};

/** Cues + voice placements for a single (programme, moment) render. */
export function planFor({ programme = 'world-now', moment = 'headlines', seconds = 30, withVoice = false, emotion }) {
  const opts = { programId: programme, emotion };
  const cues = [];
  const voice = [];
  switch (moment) {
    case 'openTail':
      cues.push([0, 'openTail', opts]);
      break;
    case 'endcard':
      cues.push([0, 'outro', opts], [Math.max(1, seconds - 6), 'endcard', opts]);
      break;
    case 'grave': // the transition into a grave story: light bed, then the cut to silence
      cues.push([0, 'story', { ...opts, emotion: 'happy' }], [seconds * 0.4, 'story', { ...opts, emotion: 'serious' }]);
      break;
    case 'storyNeutral':
      cues.push([0, 'story', { ...opts, emotion: 'neutral' }]);
      break;
    case 'story':
      cues.push([0, 'story', { ...opts, emotion: emotion || 'happy' }]);
      break;
    case 'bumperIn':
    case 'bumperOut':
    case 'replay':
    case 'breaking':
      cues.push([0.3, moment, { ...opts, next: programme }]);
      break;
    case 'upNext':
      cues.push([0.3, 'upNext', { ...opts, next: programme, seconds: 4.2 }]);
      break;
    default:
      cues.push([0, moment, opts]);
  }
  if (withVoice) {
    const lines = PROGRAMME_LINES[programme] || [];
    let t = moment === 'openTail' ? 3.3 : 2.0;
    let i = 0;
    while (lines.length && t + CLIPS[lines[i % lines.length]] < seconds - 0.5) {
      const key = lines[i % lines.length];
      voice.push([t, key]);
      t += CLIPS[key] + (i % 2 ? 1.6 : 0.9);
      i++;
    }
  }
  return { programme, seconds, cues, voice };
}

// Merge voice clips into speech regions; gaps under 0.6 s count as one region (no pumping).
export function speechRegions(voice) {
  const regions = voice.map(([t, key]) => [t, t + (CLIPS[key] || 3)]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const r of regions) {
    const last = out[out.length - 1];
    if (last && r[0] - last[1] < 0.6) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

// Speech-shaped stand-in when the Kokoro clips are not reachable: glottal
// pulses through three formant resonators with a syllable envelope (~-20 LUFS).
function standInVoice(ctx, seconds, seed) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const d = buf.getChannelData(0);
  const r = rng(seed);
  const formants = [[650, 0.06], [1150, 0.045], [2500, 0.03]];
  const state = formants.map(() => [0, 0]);
  let phase = 0;
  let syl = 0;
  let sylLen = 0.2;
  let f0 = 120 + r() * 60;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    if (t - syl > sylLen) {
      syl = t;
      sylLen = 0.12 + r() * 0.2;
      f0 = 110 + r() * 90;
      formants[0][0] = 450 + r() * 400;
      formants[1][0] = 900 + r() * 900;
    }
    const k = (t - syl) / sylLen;
    const env = Math.sin(Math.PI * Math.min(1, k)) ** 1.5 * (k < 0.9 ? 1 : 0.6);
    phase += f0 / sr;
    const pulse = phase >= 1 ? ((phase -= 1), 1) : 0;
    const exc = pulse + (r() * 2 - 1) * 0.05;
    let y = 0;
    formants.forEach(([f, bw], j) => {
      const w = (2 * Math.PI * f) / sr;
      const rad = Math.exp(-Math.PI * f * bw / sr * 10);
      const s = state[j];
      const v = exc + 2 * rad * Math.cos(w) * s[0] - rad * rad * s[1];
      s[1] = s[0];
      s[0] = v;
      y += v * (j === 2 ? 0.5 : 1);
    });
    d[i] = y * env * 0.012;
  }
  return buf;
}

async function loadClip(ctx, key, voiceBase) {
  try {
    const res = await fetch(`${voiceBase}${key}.wav`);
    if (!res.ok) throw new Error(String(res.status));
    return { buffer: await ctx.decodeAudioData(await res.arrayBuffer()), real: true };
  } catch {
    return { buffer: standInVoice(ctx, CLIPS[key] || 3, key.length * 977), real: false };
  }
}

/**
 * Render to { sampleRate, channels, log, realVoice }.
 * opts: { programme, moment, seconds, withVoice, timeline, stem: 'mix'|'music'|'voice', sampleRate, gravePad, voiceBase }
 * stem 'music' keeps the ducking (as if the voice were there) but mutes the voice: for measurements.
 */
export async function render(opts = {}) {
  const plan = opts.timeline ? TIMELINES[opts.timeline] : planFor(opts);
  if (!plan) throw new Error(`unknown timeline ${opts.timeline}`);
  const seconds = Number(opts.seconds) > 0 && !opts.timeline ? Number(opts.seconds) : plan.seconds;
  const sr = Number(opts.sampleRate) || 44100;
  const withVoice = opts.timeline ? opts.withVoice !== false : Boolean(opts.withVoice);
  const voice = withVoice || opts.stem === 'music' || opts.stem === 'voice' ? plan.voice : [];
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const musicOut = ctx.createGain();
  musicOut.gain.value = opts.stem === 'voice' ? 0 : 1;
  musicOut.connect(ctx.destination);
  const engine = new LofiEngine(ctx, musicOut, { gravePad: Boolean(opts.gravePad) });
  if (opts.solo) engine.solo = new Set(String(opts.solo).split(','));
  if (opts.noReverb) engine.rig.reverbIn.gain.value = 0; // diagnostics

  const events = [];
  for (const [t, moment, o] of plan.cues) events.push({ t, cue: moment, opts: { programId: plan.programme, ...(o || {}) } });
  for (const [a, b] of speechRegions(voice)) {
    events.push({ t: Math.max(0, a - 0.08), speak: true }); // TTS onset latency: the duck leads the first word slightly
    events.push({ t: b, speak: false });
  }
  events.sort((x, y) => x.t - y.t || (x.cue ? -1 : 1));
  for (const e of events) {
    engine.pump(e.t + LOOKAHEAD);
    if (e.cue) engine.cue(e.cue, e.opts, e.t);
    else engine.setSpeaking(e.speak, e.t);
  }
  engine.pump(seconds + 2);

  let realVoice = null;
  if (voice.length && opts.stem !== 'music') {
    const base = opts.voiceBase || '/__voice/';
    for (const [t, key] of voice) {
      const clip = await loadClip(ctx, key, base);
      realVoice = realVoice === null ? clip.real : realVoice && clip.real;
      const src = ctx.createBufferSource();
      src.buffer = clip.buffer;
      const pan = ctx.createStereoPanner();
      pan.pan.value = 0;
      src.connect(pan).connect(ctx.destination);
      src.start(t);
    }
  }

  const out = await ctx.startRendering();
  const round = (arr) => {
    const a = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) a[i] = Math.round(arr[i] * 1e5) / 1e5;
    return a;
  };
  return {
    sampleRate: sr,
    channels: [round(out.getChannelData(0)), round(out.getChannelData(1))],
    log: engine.log,
    realVoice,
    palette: PALETTES[plan.programme]?.key,
  };
}

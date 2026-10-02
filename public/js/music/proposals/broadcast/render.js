// Offline renders of the "broadcast" proposal for tools/render-audio.mjs and
// the lab page: any (programme, moment, seconds), optionally with test voice
// lines (the house Kokoro chain, tools/voice/say.py, -16 LUFS) mixed in at
// realistic times, plus two 60 s demo timelines (WORLD NOW and TECH BYTES).
// Stems: 'mix' (default), 'music' (as broadcast, ducked), 'voice'.

import { BroadcastMusic } from './conductor.js';
import { bedDef } from './packages.js';

const VOICE_DIR = new URL('./lab/voice/', import.meta.url);

// House-voice lines (scratchpad audio/music/broadcast/voice2/gen2.py), seconds.
export const LINES = {
  'wn-h1': 2.885, 'wn-h2': 2.64, 'wn-h3': 2.415, 'wn-intro': 9.77, 'wn-light': 9.215, 'wn-grave': 9.893, 'wn-finally': 6.372,
  'wn-chat1': 1.3, 'wn-chat2': 3.64, 'wn-chat3': 2.147, 'wn-outro': 4.777, 'wn-roundup': 11.155,
  'tb-story': 7.62, 'tb-chat': 5.78, 'tb-number': 6.725, 'co-story': 8.477, 'co-chat': 6.718,
  'mm-story': 6.665, 'mm-number': 6.478, 'mm-teaser': 5.31, 'n6-story': 7.33, 'n6-item2': 4.718, 'n6-signoff': 2.348, brk: 5.57,
};

export const NEXT = { 'world-now': 'tech-bytes', 'tech-bytes': 'news-60', 'news-60': 'cosmos', cosmos: 'world-now', 'money-minute': 'news-60' };

/**
 * Cue/speech plan for a render: [{ at, cue, opts } | { at, say }], built by a
 * small script per (programme, moment) that mirrors the director's pacing.
 */
export function timeline({ programme = 'world-now', moment = 'headlines', seconds = 20, withVoice = false, emotion, tape }) {
  const P = programme;
  const ev = [];
  const cue = (at, m, o = {}) => ev.push({ at, cue: m, opts: { programId: P, ...o } });
  const say = (at, line) => {
    if (withVoice && at + LINES[line] < seconds - 0.2) ev.push({ at, say: line });
    return at + LINES[line];
  };
  const S = (line) => ({ 'world-now': { story: 'wn-light', chat: ['wn-chat1', 'wn-chat2', 'wn-chat3'], h: ['wn-h1', 'wn-h2', 'wn-h3'], out: 'wn-outro' },
    'tech-bytes': { story: 'tb-story', chat: ['tb-chat', 'tb-story'], h: ['tb-story'], out: 'tb-chat' },
    cosmos: { story: 'co-story', chat: ['co-chat'], h: ['co-story'], out: 'co-chat' },
    'money-minute': { story: 'mm-story', chat: ['mm-story'], h: ['mm-teaser'], out: 'mm-story' },
    'news-60': { story: 'n6-story', chat: ['n6-item2'], h: ['n6-story'], out: 'n6-signoff' } }[P] || {})[line];

  if (moment === 'demo') return P === 'tech-bytes' ? demoTech() : demoWorld();
  switch (moment) {
    case 'openTail':
    case 'headlines': {
      // The cold-open montage after the open: lines with the frame cue in each gap.
      cue(0, 'openTail');
      let t = 1.2;
      const lines = S('h') || ['wn-h1'];
      for (const l of lines) {
        t = say(t, l) + 0.25;
        cue(t, 'frame');
        t += 0.9;
      }
      cue(t + 0.6, 'greeting');
      break;
    }
    case 'story': // main story copy: dry in most programmes (the bed only where the bible allows)
      cue(0, 'story', { emotion: emotion || 'neutral' });
      say(0.6, S('story') || 'wn-light');
      break;
    case 'grave': {
      // From a bed into a grave story, and the segment after it (no bed either).
      const into = P === 'world-now' ? 'roundup' : P === 'tech-bytes' ? 'chat' : P === 'money-minute' ? 'headlines' : 'story';
      cue(0, into, into === 'roundup' ? {} : { emotion: 'happy' });
      const t1 = say(0.6, P === 'world-now' ? 'wn-roundup' : S('story'));
      cue(withVoice ? t1 + 0.5 : 6, 'story', { emotion: 'serious' });
      const t2 = say((withVoice ? t1 + 0.5 : 6) + 0.6, P === 'world-now' ? 'wn-grave' : S('story'));
      cue(withVoice ? t2 + 0.5 : 12, P === 'tech-bytes' ? 'chat' : 'story', { emotion: 'neutral' });
      break;
    }
    case 'roundup':
      cue(0, 'story', { feature: 'roundup' });
      say(1.0, 'wn-roundup');
      for (const t of [4.2, 7.3, 9.9]) cue(t, 'item');
      break;
    case 'lighter': {
      // AND FINALLY: the bed enters after the words "And finally", runs through the chat.
      const t0 = 0.5;
      cue(t0 + 1.0, 'story', { feature: 'lighter' });
      let t = say(t0, P === 'world-now' ? 'wn-finally' : S('story')) + 0.4;
      cue(t, 'chat');
      for (const l of S('chat') || []) t = say(t + 0.2, l) + 0.35;
      cue(t + 0.3, 'outro');
      break;
    }
    case 'chat': {
      cue(0, 'chat');
      let t = 0.8;
      for (const l of S('chat') || []) t = say(t, l) + 0.4;
      break;
    }
    case 'number': {
      cue(0.3, 'story', { feature: 'number', tape: tape || 'up' });
      say(1.4, P === 'money-minute' ? 'mm-number' : 'tb-number');
      if (P === 'tech-bytes') cue(9.2, 'featureEnd');
      break;
    }
    case 'picture': {
      // COSMOS: the bed runs through the story, heard only on the picture shot.
      cue(0, 'story', { emotion: 'neutral' });
      say(0.5, 'co-story');
      cue(2.0, 'picture', { seconds: 8 });
      cue(9.6, 'single');
      cue(10.2, 'chat');
      say(10.6, 'co-chat');
      break;
    }
    case 'itemTick': {
      // NEWS IN 60: the story bed, the item tick on the cut, a grave item (pad only), the sign-off bell.
      cue(0, 'story', { emotion: 'neutral' });
      let t = say(0.6, 'n6-story') + 0.4;
      cue(t, 'item');
      t = say(t + 0.3, 'n6-item2') + 0.4;
      cue(t, 'story', { emotion: 'serious' });
      t = say(t + 0.3, 'n6-item2') + 0.4;
      cue(t, 'story', { emotion: 'neutral' });
      t = say(t + 0.3, 'n6-signoff');
      cue(t - 0.25, 'signoff');
      break;
    }
    case 'outro':
    case 'endcard': {
      cue(0, 'outro');
      const t = say(0.5, S('out') || 'wn-outro');
      if (P === 'money-minute') cue(withVoice ? t + 0.15 : 3, 'signoff');
      cue(Math.max(withVoice ? t + 0.5 : 5.5, 4), 'endcard');
      break;
    }
    case 'breaking': {
      cue(0, 'story', { feature: 'roundup' });
      const t = withVoice ? say(0.8, 'wn-roundup') + 0.4 : 4;
      cue(t, 'breaking');
      say(t + 3.1, 'brk');
      break;
    }
    case 'upNext':
      cue(0.3, 'upNext', { next: P });
      break;
    case 'countdown':
      cue(0.3, 'countdown', { seconds: 5 });
      break;
    case 'bumperIn':
    case 'bumperOut':
    case 'replay':
      cue(0.3, moment);
      break;
    default: // channel beds (standby, bumper)
      cue(0, moment);
  }
  return ev;
}

// WORLD NOW, 60 s at the director's pace: open tail, the three headline lines
// with pips and the Bm -> G -> D brass, the greeting (bed released), a grave
// lead story (silence), the next story (no bed: grave cooldown), AND FINALLY
// (the bed enters after "And finally") and its chat, the sign-off, the end
// card's brass sign-off.
function demoWorld() {
  const o = { programId: 'world-now' };
  const c = (at, cue, x = {}) => ({ at, cue, opts: { ...o, ...x } });
  return [
    c(0, 'openTail'),
    { at: 1.2, say: 'wn-h1' }, c(4.3, 'frame'),
    { at: 5.3, say: 'wn-h2' }, c(8.2, 'frame'),
    { at: 9.2, say: 'wn-h3' }, c(11.85, 'frame'),
    c(13.2, 'greeting'),
    c(13.5, 'story', { emotion: 'serious' }), { at: 14.0, say: 'wn-grave' },
    c(24.3, 'story', { emotion: 'happy' }), { at: 24.6, say: 'wn-light' },
    { at: 34.2, say: 'wn-finally' }, c(35.2, 'story', { feature: 'lighter' }),
    c(40.9, 'chat'), { at: 41.1, say: 'wn-chat1' }, { at: 42.7, say: 'wn-chat2' }, { at: 46.6, say: 'wn-chat3' },
    c(49.1, 'outro'), { at: 49.3, say: 'wn-outro' },
    c(54.4, 'endcard'),
  ];
}

// TECH BYTES, 60 s: open tail and montage bed, a dry story, a chat on the
// light bed (closed hat), the number of the day (head sting, then the bed),
// the feature button, a dry story, the sign-off bed, the end card, the ident.
function demoTech() {
  const o = { programId: 'tech-bytes' };
  const c = (at, cue, x = {}) => ({ at, cue, opts: { ...o, ...x } });
  return [
    c(0, 'openTail'), { at: 1.0, say: 'tb-story' },
    c(9.1, 'story', { emotion: 'neutral' }), { at: 9.5, say: 'tb-chat' },
    c(15.8, 'chat'), { at: 16.3, say: 'tb-story' },
    c(24.4, 'story', { feature: 'number' }), { at: 25.4, say: 'tb-number' },
    c(32.5, 'featureEnd'),
    c(33.4, 'story', { emotion: 'neutral' }), { at: 33.8, say: 'tb-chat' },
    c(40.0, 'outro'), { at: 40.5, say: 'tb-story' },
    c(48.6, 'endcard'),
    c(53.4, 'bumperIn'),
  ];
}

const voiceCache = new Map();
async function loadLine(ctx, name) {
  let data = voiceCache.get(name);
  if (!data) {
    const res = await fetch(new URL(`${name}.ogg`, VOICE_DIR));
    data = await res.arrayBuffer();
    voiceCache.set(name, data);
  }
  return ctx.decodeAudioData(data.slice(0));
}

/**
 * Renders to { sampleRate, channels: [L, R], plan }.
 * opts: { programme, moment ('demo' for the timeline), seconds, withVoice,
 *         stem: 'mix'|'music'|'voice', duck (default true when voices are
 *         planned), grave: 'silence'|'pad', tape, solo, mute, seed, sampleRate }
 */
export async function renderBroadcast(opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const seconds = opts.seconds || (opts.moment === 'demo' ? 60 : 20);
  const withVoice = opts.moment === 'demo' ? opts.withVoice !== false : !!opts.withVoice;
  const stem = opts.stem || 'mix';
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const musicOut = ctx.createGain();
  const voiceOut = ctx.createGain();
  if (stem !== 'voice') musicOut.connect(ctx.destination);
  if (stem !== 'music') voiceOut.connect(ctx.destination);
  const music = new BroadcastMusic({ context: ctx, destination: musicOut, grave: opts.grave || 'silence', seed: opts.seed ?? 7, solo: opts.solo || null, mute: opts.mute || null, ...(opts.trim ? { trim: opts.trim } : {}) });
  // Calibration: one bed alone, unducked (opts.bed = bed key of the programme).
  if (opts.bed) {
    const def = bedDef(opts.programme || 'world-now', opts.bed, opts);
    music.programme = opts.programme || 'world-now';
    music.startBed(def, 0, 'cut', 0, { cued: opts.bed });
    music.pump(seconds + 2);
    const out = await ctx.startRendering();
    return { sampleRate, channels: [out.getChannelData(0), out.getChannelData(1)], plan: [] };
  }
  // Voices are planned (for ducking) whenever the render has them or asks for the duck.
  const plan = timeline({ ...opts, seconds, withVoice: withVoice || opts.duck === true });
  const events = [...plan].sort((a, b) => a.at - b.at);
  for (const ev of events) {
    music.pump(ev.at);
    if (ev.cue) music.cue(ev.cue, { ...ev.opts, at: ev.at });
    else if (ev.say) {
      const dur = LINES[ev.say];
      if (opts.duck !== false) {
        music.speech(true, ev.at);
        music.speech(false, ev.at + dur);
      }
      if (withVoice && stem !== 'music') {
        const buf = await loadLine(ctx, ev.say);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(voiceOut);
        src.start(ev.at);
      }
    }
  }
  music.pump(seconds + 2);
  const out = await ctx.startRendering();
  return { sampleRate, channels: [out.getChannelData(0), out.getChannelData(1)], plan: events };
}

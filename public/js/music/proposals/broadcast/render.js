// Offline renders of the "broadcast" proposal for tools/render-audio.mjs and
// the lab page: any (programme, moment, seconds), optionally with test voice
// lines (the house Kokoro chain, tools/voice/say.py, -16 LUFS) mixed in at
// realistic times. Two kinds of 60 s timelines:
//   'demo'      the requested rundown for any programme: the programme's real
//               open (audio/themes.js themeFor, rendered offline), open tail,
//               headlines, a light story, a grave story, the chat (solo
//               shows: their feature), the sign-off and the end card;
//   'bulletin'  a realistic WORLD NOW or TECH BYTES running order.
// Stems: 'mix' (default), 'music' (beds and stings as broadcast, ducked,
// plus the open / external cues), 'voice'.

import { BroadcastMusic } from './conductor.js';
import { bedDef } from './packages.js';
import { themeFor, cueFor } from '../../../audio/themes.js';
import { renderTune } from '../../../audio/synth.js';

const VOICE_DIR = new URL('./lab/voice/', import.meta.url);

// House-voice lines (scratchpad audio/music/broadcast/voice2/gen2.py, gen3.py),
// seconds. Renders measure the decoded files and use these only as a fallback.
export const LINES = {
  'wn-h1': 2.885, 'wn-h2': 2.64, 'wn-h3': 2.415, 'wn-intro': 9.77, 'wn-light': 9.215, 'wn-grave': 9.893, 'wn-finally': 6.372,
  'wn-chat1': 1.3, 'wn-chat2': 3.64, 'wn-chat3': 2.147, 'wn-outro': 4.777, 'wn-roundup': 11.155,
  'wn-greet': 3.3, 'wn-sober1': 2.4, 'wn-sober2': 3.6,
  'tb-story': 7.62, 'tb-chat': 5.78, 'tb-number': 6.725, 'tb-h1': 2.6, 'tb-h2': 3.2, 'tb-h3': 2.6, 'tb-greet': 2.4,
  'tb-grave': 10, 'tb-sober1': 3.9, 'tb-sober2': 1.7, 'tb-outro': 5,
  'co-story': 8.477, 'co-chat': 6.718, 'co-h1': 2.2, 'co-h2': 2.2, 'co-h3': 2.4, 'co-greet': 3, 'co-grave': 9.5,
  'co-sober1': 3.4, 'co-sober2': 1.9, 'co-outro': 3.6,
  'mm-story': 6.665, 'mm-number': 6.478, 'mm-teaser': 5.31, 'mm-light': 6.5, 'mm-grave': 9, 'mm-outro': 3.3,
  'n6-story': 7.33, 'n6-item2': 4.718, 'n6-signoff': 2.348, 'n6-grave': 5.4, 'n6-item3': 3,
  brk: 5.57,
};

export const NEXT = { 'world-now': 'tech-bytes', 'tech-bytes': 'news-60', 'news-60': 'cosmos', cosmos: 'world-now', 'money-minute': 'news-60' };

// The requested rundown per programme. Solo programmes (MONEY MINUTE, NEWS IN
// 60: no chats) put their own feature in the chat's place, before the grave
// story, because a feature never follows one (writer.js FEATURES rules).
export const DEMO = {
  'world-now': { heads: ['wn-h1', 'wn-h2', 'wn-h3'], greet: 'wn-greet', light: 'wn-light', grave: 'wn-grave', chat: ['wn-sober1', 'wn-sober2'], outro: 'wn-outro' },
  'tech-bytes': { heads: ['tb-h1', 'tb-h2', 'tb-h3'], greet: 'tb-greet', light: 'tb-story', grave: 'tb-grave', chat: ['tb-sober1', 'tb-sober2'], outro: 'tb-outro' },
  cosmos: { heads: ['co-h1', 'co-h2', 'co-h3'], greet: 'co-greet', light: 'co-story', picture: true, grave: 'co-grave', chat: ['co-sober1', 'co-sober2'], outro: 'co-outro' },
  'money-minute': { teaser: 'mm-teaser', light: 'mm-light', feature: { story: { feature: 'number', tape: 'up' }, line: 'mm-number' }, grave: 'mm-grave', outro: 'mm-outro', signoff: true },
  'news-60': { teaser: 'n6-story', light: 'n6-item2', item: true, grave: 'n6-grave', feature: { story: { emotion: 'neutral' }, line: 'n6-item3' }, outro: 'n6-signoff', signoff: true },
};

/**
 * Cue/speech plan for a render: [{ at, cue, opts } | { at, say } | { at, open }],
 * built by a small script per (programme, moment) that mirrors the director's
 * pacing. `len(name)` gives a voice line's length (decoded file or LINES).
 */
export function timeline({ programme = 'world-now', moment = 'headlines', seconds = 20, withVoice = false, emotion, tape, open = true }, len = (n) => LINES[n]) {
  const P = programme;
  const ev = [];
  const cue = (at, m, o = {}) => ev.push({ at, cue: m, opts: { programId: P, ...o } });
  const say = (at, line) => {
    if (withVoice && at + len(line) < seconds - 0.2) ev.push({ at, say: line });
    return at + len(line);
  };
  const S = (line) => ({ 'world-now': { story: 'wn-light', chat: ['wn-chat1', 'wn-chat2', 'wn-chat3'], h: ['wn-h1', 'wn-h2', 'wn-h3'], out: 'wn-outro' },
    'tech-bytes': { story: 'tb-story', chat: ['tb-chat', 'tb-story'], h: ['tb-h1', 'tb-h2', 'tb-h3'], out: 'tb-outro' },
    cosmos: { story: 'co-story', chat: ['co-chat'], h: ['co-h1', 'co-h2', 'co-h3'], out: 'co-outro' },
    'money-minute': { story: 'mm-story', chat: ['mm-story'], h: ['mm-teaser'], out: 'mm-outro' },
    'news-60': { story: 'n6-story', chat: ['n6-item2'], h: ['n6-story'], out: 'n6-signoff' } }[P] || {})[line];

  if (moment === 'demo') return demoFor(P, { len, withVoice, seconds, open });
  if (moment === 'bulletin') return P === 'tech-bytes' ? bulletinTech(open) : bulletinWorld(open);
  switch (moment) {
    case 'openTail':
    case 'headlines': {
      // The programme's open (4 s), then the cold-open montage: lines with the frame cue in each gap.
      let t = 0;
      if (moment === 'openTail' && open) {
        ev.push({ at: 0, open: P });
        t = 4;
      }
      cue(t, 'openTail');
      t += 1.0;
      const lines = S('h') || ['wn-h1'];
      for (const l of lines) {
        t = say(t, l) + 0.25;
        cue(t, 'frame');
        t += 1.0;
      }
      cue(t + 0.4, 'greeting');
      break;
    }
    case 'story': // main story copy: dry in most programmes (the bed only where the bible allows)
    case 'light':
    case 'underscore':
      cue(0, 'story', { emotion: emotion || (moment === 'light' ? 'happy' : 'neutral') });
      if (P === 'cosmos') {
        cue(2.0, 'picture', { seconds: 8 });
        cue(9.8, 'single');
      }
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
      t = say(t + 0.3, 'n6-grave') + 0.4;
      cue(t, 'story', { emotion: 'neutral' });
      t = say(t + 0.3, 'n6-item3') + 0.3;
      t = say(t + 0.3, 'n6-signoff');
      cue(t + 0.15, 'signoff');
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

// The requested rundown: open, open tail, headlines (pips in the gaps),
// greeting, light story, grave story, chat (or the solo show's feature), the
// sign-off and the end card, at the director's pace (0.7 s between segments).
function demoFor(P, { len, withVoice, seconds, open }) {
  const d = DEMO[P] || DEMO['world-now'];
  const ev = [];
  const cue = (at, m, o = {}) => ev.push({ at, cue: m, opts: { programId: P, ...o } });
  // Voices are always planned (the duck needs them); the voice stem decides whether they sound.
  const say = (at, line) => {
    if (at + len(line) < seconds - 0.2) ev.push({ at, say: line });
    return at + len(line);
  };
  const GAP = 0.7;
  if (open) ev.push({ at: 0, open: P });
  let t = open ? 4 : 0;
  cue(t, 'openTail');
  t += 0.45;
  if (d.heads) {
    for (const l of d.heads) {
      t = say(t, l);
      cue(t + 0.25, 'frame');
      t += 1.2;
    }
    cue(t - 0.35, 'greeting');
    t = say(t, d.greet) + GAP;
  } else {
    t = say(t, d.teaser) + GAP;
    cue(t - 0.4, 'greeting');
  }
  // Light story.
  cue(t - 0.2, 'story', { emotion: 'happy' });
  if (d.item) cue(t - 0.2, 'item');
  if (d.picture) cue(t + 2.2, 'picture', { seconds: 7 });
  const lightStart = t;
  t = say(t, d.light) + GAP;
  if (d.picture) cue(Math.max(lightStart + 9.4, t - 0.6), 'single');
  // Solo shows: the feature before the grave story.
  if (d.feature) {
    cue(t - 0.2, 'story', d.feature.story);
    if (d.item) cue(t - 0.2, 'item');
    t = say(t + (d.feature.story.feature === 'number' ? 0.9 : 0), d.feature.line) + GAP;
  }
  // Grave story: the bed bows out within the first words.
  cue(t - 0.2, 'story', { emotion: 'serious' });
  t = say(t, d.grave) + GAP + 0.3;
  if (d.chat) {
    cue(t - 0.2, 'chat');
    for (const l of d.chat) t = say(t, l) + 0.4;
    t += GAP - 0.4;
  }
  cue(t - 0.2, 'outro');
  t = say(t, d.outro);
  if (d.signoff) cue(t + 0.15, 'signoff');
  cue(t + (d.signoff ? 1.6 : 0.6), 'endcard');
  void withVoice;
  return ev;
}

// WORLD NOW, 60 s at the director's pace: the open, the three headline lines
// with pips and the Bm -> G -> D brass, the greeting (bed released), a grave
// lead story (silence), the next story (no bed: grave cooldown), AND FINALLY
// (the bed enters after "And finally") and its chat, the sign-off, the end
// card's brass sign-off.
function bulletinWorld(open) {
  const o = { programId: 'world-now' };
  const c = (at, cue, x = {}) => ({ at: at + (open ? 4 : 0), cue, opts: { ...o, ...x } });
  const v = (at, say) => ({ at: at + (open ? 4 : 0), say });
  return [
    ...(open ? [{ at: 0, open: 'world-now' }] : []),
    c(0, 'openTail'),
    v(0.6, 'wn-h1'), c(3.7, 'frame'),
    v(4.7, 'wn-h2'), c(7.6, 'frame'),
    v(8.6, 'wn-h3'), c(11.25, 'frame'),
    c(12.4, 'greeting'), v(12.6, 'wn-greet'),
    c(16.3, 'story', { emotion: 'serious' }), v(16.5, 'wn-grave'),
    c(27.0, 'story', { emotion: 'neutral' }), v(27.2, 'wn-roundup'),
    v(39.4, 'wn-finally'), c(40.4, 'story', { feature: 'lighter' }),
    c(46.2, 'chat'), v(46.4, 'wn-chat1'), v(48.0, 'wn-chat2'), v(51.9, 'wn-chat3'),
  ];
}

// TECH BYTES, 60 s: the open and the montage bed, a dry story, a chat on the
// light bed (closed hat), the number of the day (head sting, then the bed),
// the feature button, a dry story, the sign-off bed, the end card.
function bulletinTech(open) {
  const o = { programId: 'tech-bytes' };
  const off = open ? 4 : 0;
  const c = (at, cue, x = {}) => ({ at: at + off, cue, opts: { ...o, ...x } });
  const v = (at, say) => ({ at: at + off, say });
  return [
    ...(open ? [{ at: 0, open: 'tech-bytes' }] : []),
    c(0, 'openTail'), v(0.5, 'tb-h1'), v(3.6, 'tb-h3'), c(6.4, 'greeting'), v(6.6, 'tb-greet'),
    c(9.6, 'story', { emotion: 'neutral' }), v(9.8, 'tb-story'),
    c(18.0, 'chat'), v(18.2, 'tb-chat'),
    c(24.6, 'story', { feature: 'number' }), v(25.5, 'tb-number'),
    c(32.6, 'featureEnd'),
    c(33.6, 'story', { emotion: 'neutral' }), v(33.8, 'tb-chat'),
    c(40.2, 'outro'), v(40.6, 'tb-outro'),
    c(46.6, 'endcard'),
  ];
}

const voiceCache = new Map();
async function fetchLine(name) {
  let data = voiceCache.get(name);
  if (!data) {
    const res = await fetch(new URL(`${name}.ogg`, VOICE_DIR));
    if (!res.ok) throw new Error(`voice line ${name}: ${res.status}`);
    data = await res.arrayBuffer();
    voiceCache.set(name, data);
  }
  return data;
}
async function loadLine(ctx, name) {
  return ctx.decodeAudioData((await fetchLine(name)).slice(0));
}

// The programme's own open theme or an external network cue, rendered by the
// audio stream's engine (same mixer and levels as on air) into a buffer.
async function renderCue(tune, { seconds, stopAt, volume }) {
  try {
    const r = await renderTune(tune, { seconds, stopAt, volume, startAt: 0 });
    return r?.buffer || null;
  } catch {
    return null;
  }
}

/**
 * Renders to { sampleRate, channels: [L, R], plan }.
 * opts: { programme, moment ('demo' | 'bulletin' for 60 s timelines), seconds,
 *         withVoice, stem: 'mix'|'music'|'voice', duck (default true when
 *         voices are planned), grave: 'silence'|'pad', storyBeds: 'bible'|'soft',
 *         open (play the programme open, default true), tape, solo, mute, seed,
 *         sampleRate, bed (one bed alone, unducked: calibration) }
 */
export async function renderBroadcast(opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const long = opts.moment === 'demo' || opts.moment === 'bulletin';
  const seconds = opts.seconds || (long ? 60 : 20);
  const withVoice = long ? opts.withVoice !== false : !!opts.withVoice;
  const stem = opts.stem || 'mix';
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const musicOut = ctx.createGain();
  const voiceOut = ctx.createGain();
  if (stem !== 'voice') musicOut.connect(ctx.destination);
  if (stem !== 'music') voiceOut.connect(ctx.destination);
  const music = new BroadcastMusic({
    context: ctx, destination: musicOut, grave: opts.grave || 'silence', storyBeds: opts.storyBeds || 'bible', seed: opts.seed ?? 7,
    solo: opts.solo || null, mute: opts.mute || null, ...(opts.trim ? { trim: opts.trim } : {}),
  });
  // Calibration: one bed alone, unducked (opts.bed = bed key of the programme).
  if (opts.bed) {
    const def = bedDef(opts.programme || 'world-now', opts.bed, opts);
    music.programme = opts.programme || 'world-now';
    music.startBed(def, 0, 'cut', 0, { cued: opts.bed });
    music.pump(seconds + 2);
    const out = await ctx.startRendering();
    return { sampleRate, channels: [out.getChannelData(0), out.getChannelData(1)], plan: [] };
  }
  // Real line lengths from the decoded files (falls back to LINES).
  const lens = new Map();
  const buffers = new Map();
  await Promise.all(Object.keys(LINES).map(async (name) => {
    try {
      const b = await loadLine(ctx, name);
      buffers.set(name, b);
      lens.set(name, b.duration);
    } catch { /* fallback length */ }
  }));
  const len = (n) => lens.get(n) ?? LINES[n] ?? 3;
  // Voices are planned (for ducking) whenever the render has them or asks for the duck.
  const plan = timeline({ ...opts, seconds, withVoice: withVoice || opts.duck === true, open: opts.open !== false }, len);
  const events = [...plan].sort((a, b) => a.at - b.at);
  const playBuffer = (buf, at, out) => {
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.start(at);
  };
  for (const ev of events) {
    music.pump(ev.at);
    if (ev.open) {
      // The director plays the open's theme at volume 0.6 and stops it on the cut (fadeOut rings over).
      const theme = themeFor(ev.open, { duration: 4 });
      if (stem !== 'voice') playBuffer(await renderCue(theme, { seconds: 6.5, stopAt: 4, volume: 0.6 }), ev.at, musicOut);
    } else if (ev.cue) {
      const r = music.cue(ev.cue, { ...ev.opts, at: ev.at });
      if (r?.external && stem !== 'voice') {
        // COSMOS end card: the network's own outro cue (audio.js sfx('outro', { programId })).
        const tune = cueFor(r.external, ev.opts.programId);
        if (tune) playBuffer(await renderCue(tune, { seconds: 5, volume: 0.5 }), ev.at, musicOut);
      }
      ev.reply = r?.external ? `external:${r.external}` : r?.def?.id || (r?.len ? 'sting' : null);
    } else if (ev.say) {
      const dur = len(ev.say);
      if (opts.duck !== false) {
        music.speech(true, ev.at);
        music.speech(false, ev.at + dur);
      }
      if (withVoice && stem !== 'music') playBuffer(buffers.get(ev.say) || (await loadLine(ctx, ev.say)), ev.at, voiceOut);
    }
  }
  music.pump(seconds + 2);
  const out = await ctx.startRendering();
  return { sampleRate, channels: [out.getChannelData(0), out.getChannelData(1)], plan: events.map(({ at, cue, say, open, reply }) => ({ at, cue, say, open, reply })) };
}

// Offline renders of the "broadcast" proposal for tools/render-audio.mjs and
// the lab page: any (programme, moment, seconds), optionally with Kokoro test
// voice lines mixed in at realistic times, plus the 60 s demo timeline
// (open tail -> headlines -> light story -> grave story -> chat -> outro ->
// end card -> break bumper). Stems: 'mix' (default), 'music' (as broadcast,
// ducked under the voice), 'voice'.

import { BroadcastMusic } from './conductor.js';

const VOICE_DIR = new URL('./lab/voice/', import.meta.url);

// Kokoro lines (tools: scratchpad gen.py), trimmed, normalised to -18 LUFS.
export const LINES = {
  'wn-intro': 11.44, 'wn-light': 10.16, 'wn-grave': 11.72, 'wn-chat1': 2.05, 'wn-chat2': 3.4, 'wn-chat3': 1.61,
  'wn-outro': 4.22, 'wn-roundup': 12.09, 'tb-story': 7.26, 'tb-chat': 4.91, 'co-story': 6.71, 'co-chat': 5.12,
  'mm-story': 6.46, 'n6-story': 8.72, brk: 6.53,
};

// What the presenters say over each moment in single-bed renders.
const SAY = {
  'world-now': { headlines: ['wn-intro'], story: ['wn-light', 'wn-grave'], chat: ['wn-chat1', 'wn-chat2', 'wn-chat3', 'wn-chat1', 'wn-chat2'], roundup: ['wn-roundup'], outro: ['wn-outro'] },
  'tech-bytes': { headlines: ['tb-story'], story: ['tb-story', 'tb-chat'], chat: ['tb-story', 'tb-chat'], outro: ['tb-chat'] },
  cosmos: { headlines: ['co-story'], story: ['co-story', 'co-chat'], chat: ['co-story', 'co-chat'], outro: ['co-chat'] },
  'money-minute': { headlines: ['mm-story'], story: ['mm-story', 'mm-story'], chat: ['mm-story'], outro: ['mm-story'] },
  'news-60': { headlines: ['n6-story'], story: ['n6-story', 'n6-story'], roundup: ['wn-roundup'], outro: ['n6-story'] },
};

export const NEXT = { 'world-now': 'tech-bytes', 'tech-bytes': 'news-60', 'news-60': 'cosmos', cosmos: 'world-now', 'money-minute': 'news-60' };

/** Cue/speech plan for a render: [{ at, cue, opts } | { at, say }]. */
export function timeline({ programme = 'world-now', moment = 'headlines', seconds = 20, withVoice = false, emotion }) {
  const P = programme;
  const ev = [];
  const cue = (at, m, o = {}) => ev.push({ at, cue: m, opts: { programId: P, ...o } });
  const say = (at, line) => ev.push({ at, say: line });
  const talk = (from, lines, gap = 0.8) => {
    let t = from;
    for (const l of lines) {
      if (t + LINES[l] > seconds - 0.5) break;
      say(t, l);
      t += LINES[l] + gap;
    }
  };
  const lines = (m) => SAY[P]?.[m] || SAY['world-now'][m] || ['wn-light'];

  if (moment === 'demo') return demo(P);
  switch (moment) {
    case 'openTail':
      cue(0, 'openTail');
      if (withVoice) talk(1.2, lines('headlines'));
      for (let k = 0; k < 4; k++) cue(1.2 + k * 2.6, 'frame');
      break;
    case 'grave':
      // Grave on its own is silence: show the light bed tailing out into it.
      cue(0, 'story', { emotion: 'happy' });
      if (withVoice) say(0.8, 'wn-light');
      cue(withVoice ? 11.4 : 6, 'story', { emotion: 'serious' });
      if (withVoice) say(12.0, 'wn-grave');
      break;
    case 'breaking':
      // A story is interrupted between items: the sting, then the presenter.
      cue(0, 'story', { emotion: 'neutral' });
      if (withVoice) {
        const first = lines('story')[0];
        const at = 0.8 + LINES[first] + 0.4;
        say(0.8, first);
        cue(at, 'breaking');
        say(at + 3.1, 'brk');
      } else cue(4, 'breaking');
      break;
    case 'endcard':
      cue(0, 'outro');
      if (withVoice) say(0.6, 'wn-outro');
      cue(Math.max(5.5, (withVoice ? 0.6 + LINES['wn-outro'] + 0.5 : 5.5)), 'endcard');
      break;
    case 'upNext':
      cue(0.3, 'upNext', { next: P });
      break;
    case 'bumperIn':
    case 'bumperOut':
    case 'replay':
      cue(0.3, moment);
      break;
    case 'roundup':
      cue(0, 'roundup');
      if (withVoice) talk(1.0, lines('roundup'));
      // One chime per place ("In Tokyo...", "In Nairobi...", "And in Lima...").
      for (const t of [3.9, 7.0, 9.6]) cue(t, 'item');
      break;
    default:
      cue(0, moment, { emotion: emotion || (moment === 'story' ? 'happy' : undefined) });
      if (withVoice) talk(moment === 'headlines' ? 1.2 : 1.5, lines(moment));
  }
  return ev;
}

// The 60 s demo, WORLD NOW, at the director's real pace (300 ms between
// segments, montage frames every 2.6 s, speech starting just after each cut).
function demo(P) {
  const o = { programId: P };
  return [
    { at: 0, cue: 'openTail', opts: o },
    { at: 1.2, say: 'wn-intro' },
    { at: 1.2, cue: 'frame', opts: o }, { at: 3.8, cue: 'frame', opts: o }, { at: 6.4, cue: 'frame', opts: o }, { at: 9.0, cue: 'frame', opts: o },
    { at: 1.2, cue: 'headlines', opts: o },
    { at: 13.2, cue: 'story', opts: { ...o, emotion: 'happy' } },
    { at: 13.6, say: 'wn-light' },
    { at: 24.2, cue: 'story', opts: { ...o, emotion: 'serious' } },
    { at: 24.9, say: 'wn-grave' },
    { at: 37.2, cue: 'chat', opts: o },
    { at: 38.0, say: 'wn-chat1' }, { at: 40.4, say: 'wn-chat2' }, { at: 44.1, say: 'wn-chat3' },
    { at: 46.2, cue: 'outro', opts: o },
    { at: 46.6, say: 'wn-outro' },
    { at: 51.3, cue: 'endcard', opts: o },
    { at: 56.0, cue: 'bumperIn', opts: o },
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
 * Renders to { sampleRate, channels: [L, R] }.
 * opts: { programme, moment ('demo' for the timeline), seconds, withVoice,
 *         stem: 'mix'|'music'|'voice', duck (default true when voices are
 *         planned), grave: 'silence'|'pad', solo, mute, seed, sampleRate }
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
  const plan = timeline({ ...opts, seconds, withVoice: withVoice || opts.duck === true });
  const speechOn = withVoice || opts.duck === true || (opts.moment === 'demo' && opts.duck !== false);
  const events = [...plan].sort((a, b) => a.at - b.at);
  for (const ev of events) {
    music.pump(ev.at);
    if (ev.cue) music.cue(ev.cue, { ...ev.opts, at: ev.at });
    else if (ev.say) {
      const dur = LINES[ev.say];
      if (speechOn && opts.duck !== false) {
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

// Lo-fi newsroom proposal: the cue sheet. Turns what the director is doing
// into a musical action, programme by programme, following the style bibles
// in docs/programmes/*.md. The common rules: music fills gaps and carries the
// light moments; story copy is mostly dry; nothing sits on grave news (nor on
// the segment after it); stings never overlap speech; one network signature.
//
// resolveCue(moment, opts, ctx) -> action
//   moment: open, openTail, headlines, pip, coldOpen, greeting, story, shot,
//           item, roundup (map), number, numberSting, finally, chat, featureEnd,
//           outro, signoffEnd, endcard, breaking, grave, introEnd,
//           bumper, holding, leadin, upNext, replay, standby, silence, ad, cut
//   opts:   { programId, emotion, breaking, grave, segment, line, lines, kind,
//             expected, tape, next, sombre, replay, hour, seconds }
//   ctx:    { afterGrave, current (song id playing or null), gravePad,
//             sharedStings, bedUnderStories: 'off' (bibles) | 'soft' | 'drone' }
// bedUnderStories 'soft' (owner switch) gives light / neutral stories a very soft bed
// (pad + triangle, < 1.3 kHz, >= 24 LU under the voice); grave stories and the segment
// after them stay silent whatever the switch says.
// action kinds: bed, silence, sting, headline, pip, shot, accent, cut, keep, gravePad

import { PALETTES } from './palettes.js';

export const SEGMENT_MOMENTS = new Set(['headlines', 'coldOpen', 'greeting', 'story', 'roundup', 'map', 'number', 'finally', 'chat', 'outro']);

const bed = (song, moment, extra = {}) => ({ kind: 'bed', song, moment, ...extra });
const silence = (fade = 0.6, extra = {}) => ({ kind: 'silence', fade, ...extra });
const sting = (name, extra = {}) => ({ kind: 'sting', name, ...extra });
const KEEP = { kind: 'keep' };

export const isGrave = (opts = {}) => Boolean(opts.grave || opts.emotion === 'serious' || opts.emotion === 'sad');
const softStory = (o, c) => c.bedUnderStories === 'soft' && !isGrave(o) && !o.breaking && !c.afterGrave;

// ------------------------------------------------------------------ programmes

const WORLD = (m, o, c) => {
  switch (m) {
    case 'openTail':
    case 'headlines': return { kind: 'headline', line: o.line ?? 0, lines: o.lines ?? 3 };
    case 'pip': return { kind: 'pip', line: o.line ?? 0, lines: o.lines ?? 3 };
    case 'greeting': return silence(0.3); // the bed releases in 0.3 s on the cut to the greeting
    case 'story':
      if (o.breaking) return sting('breaking', { stopBed: true, hard: true });
      return softStory(o, c) ? bed('world-now/story', 'story') : silence(0.8);
    case 'roundup':
    case 'map': return c.afterGrave ? silence() : bed('world-now/roundup', 'roundup');
    case 'finally': return c.afterGrave ? silence() : bed('world-now/finally', 'finally');
    case 'chat': return c.current === 'world-now/finally' && !c.afterGrave ? bed('world-now/finally', 'chat') : silence();
    case 'outro': return silence(1.2, { atBar: true }); // the sign-off is spoken dry...
    case 'signoffEnd': return sting('signoffBrass'); // ...then the brass 3 -> 1 in its 1.5 s hold
    case 'endcard': return KEEP; // the brass rings on under the stinger and the end card
    case 'breaking': return sting('breaking', { stopBed: true, hard: true });
    default: return silence();
  }
};

const TECH = (m, o, c) => {
  const song = 'tech-bytes';
  if (c.afterGrave && SEGMENT_MOMENTS.has(m)) return silence();
  switch (m) {
    case 'openTail':
    case 'headlines':
    case 'coldOpen':
    case 'greeting': return bed(song, 'headlines');
    case 'story': return softStory(o, c) ? bed(song, 'story') : silence(0.8); // story links have no bed (bible)
    case 'chat': return bed(song, 'chat');
    case 'number': return bed(song, 'number');
    case 'numberSting': return sting('techNumber', { stopBed: false });
    case 'finally': return bed(song, 'finally');
    case 'featureEnd': return sting('techButton', { stopBed: false });
    case 'outro': return bed(song, 'signoff');
    case 'signoffEnd': return silence(1.5, { atBar: true });
    case 'endcard': return silence(0.6);
    default: return silence();
  }
};

const COSMOS = (m, o, c) => {
  if (c.afterGrave && SEGMENT_MOMENTS.has(m)) return silence();
  switch (m) {
    case 'coldOpen': return bed('cosmos', 'coldOpen');
    case 'story':
      if (isGrave(o)) return silence(1.5);
      return bed('cosmos', softStory(o, c) ? 'storySoft' : 'story'); // bible: hidden until a picture shot
    case 'finally': return bed('cosmos/finally', 'story');
    case 'shot': return { kind: 'shot', show: o.kind === 'picture' || o.kind === 'map' || o.kind === 'full', expected: o.expected };
    case 'number': return silence(1.5); // the Reading: silence, its 1.5 s pause included
    case 'endcard': return silence(0.6); // the network outro cue plays (audio.sfx('outro'))
    default: return silence(); // open, greeting, chats, close, singles
  }
};

const MONEY = (m, o, c) => {
  if (c.afterGrave && SEGMENT_MOMENTS.has(m) && m !== 'outro') return silence();
  switch (m) {
    case 'openTail':
    case 'headlines': return bed('money-minute/intro', 'intro');
    case 'introEnd': return silence(0.5, { atBar: true }); // tails out on the bar line, gone before story 1
    case 'story': return (c.bedUnderStories === 'drone' || softStory(o, c)) && !isGrave(o) ? bed('money-minute/drone', 'story') : silence(0.6);
    case 'numberSting': return sting('moneyNumber', { stopBed: true });
    case 'number': {
      const tape = ['up', 'down', 'mixed', 'neutral'].includes(o.tape) ? o.tape : 'neutral';
      return bed(`money-minute/tape-${tape}`, 'number');
    }
    case 'outro': return c.afterGrave ? silence() : bed('money-minute/intro', 'signoff'); // crossfade on a bar line to the vamp
    case 'signoffEnd': return sting('moneySignoff', { stopBed: false });
    case 'endcard': return sting('moneyButton', { stopBed: true });
    default: return silence();
  }
};

const NEWS60 = (m, o) => {
  switch (m) {
    case 'openTail':
    case 'headlines':
    case 'greeting':
    case 'roundup':
    case 'map':
    case 'chat':
    case 'outro': return bed('news-60', 'bed');
    case 'story':
      // Grave or breaking: tick, tock and bass drop out on the cut, the pad stays alone.
      return isGrave(o) || o.breaking ? bed('news-60', 'grave') : bed('news-60', 'bed');
    case 'item': return { kind: 'accent' }; // the bed's own tick on the cut, 4 dB up
    case 'signoffEnd': return sting('sixtyBell', { stopBed: false, fadeBed: 2 });
    case 'endcard': return silence(0.6);
    case 'breaking': return bed('news-60', 'grave');
    default: return silence();
  }
};

const POLICY = { 'world-now': WORLD, 'tech-bytes': TECH, cosmos: COSMOS, 'money-minute': MONEY, 'news-60': NEWS60 };

// ------------------------------------------------------------------ channel

function channel(m, o, c) {
  switch (m) {
    case 'bumper':
      if (o.grave || o.kind === 'sombre') return sting('sombreIdent', { stopBed: true });
      if (o.kind === 'ident') return sting('shortIdent', { stopBed: true });
      return bed('channel/bumper', 'bumper');
    case 'holding': return bed('channel/holding', 'holding');
    case 'leadin': {
      const pid = POLICY[o.programId] ? o.programId : 'world-now';
      const countdown = pid === 'world-now' || pid === 'news-60';
      return sting(countdown ? 'countdown' : 'identFilm', { stopBed: true, programme: pid, sombre: Boolean(o.sombre), hour: o.hour });
    }
    case 'upNext': return c.sharedStings ? silence(0.15) : sting('upNext', { stopBed: true, programme: o.next, seconds: o.seconds });
    case 'standby': return bed('channel/standby', 'standby');
    case 'replay': return sting('replay', { stopBed: true, programme: POLICY[o.programId] ? o.programId : 'channel' });
    case 'cut': return { kind: 'cut' };
    case 'ad':
    case 'silence': return silence(0.15); // 0.3 s of true silence at every ad boundary
    default: return null;
  }
}

export function resolveCue(moment, opts = {}, ctx = {}) {
  const ch = channel(moment, opts, ctx);
  if (ch) return ch;
  if (moment === 'open') return silence(0.4); // the open's own theme plays
  const policy = POLICY[opts.programId];
  if (!policy) return silence();
  if (moment === 'grave') return opts.programId === 'news-60' ? bed('news-60', 'grave') : silence(2.5);
  if (moment === 'breaking' && ctx.sharedStings && opts.programId === 'world-now') return silence(0.15);
  // Grave stories outside NEWS IN 60: silence, or the opt-in low pad.
  if (moment === 'story' && isGrave(opts) && opts.programId !== 'news-60' && !opts.breaking) {
    return ctx.gravePad ? { kind: 'gravePad', song: gravePadSong(opts.programId) } : silence(2.5);
  }
  return policy(moment, opts, ctx);
}

function gravePadSong(pid) {
  return { 'world-now': 'world-now/finally', 'tech-bytes': 'tech-bytes', cosmos: 'cosmos', 'money-minute': 'money-minute/drone' }[pid] || 'cosmos';
}

export const SONGS = Object.keys(PALETTES);

/** Human-readable cue sheet (lab page + DESIGN.md): [programme, moment, music]. */
export const CUE_SHEET = [
  ['WORLD NOW', 'headlines (3 lines)', 'triangle roots + low brass (D3 and below under speech) Bm -> G -> D, one chord per line'],
  ['WORLD NOW', 'each headline gap', 'one soft timpani hit, then the pip: bell low 5 -> 1 (the signature\'s first two notes)'],
  ['WORLD NOW', 'greeting, lead, main stories, number', 'silence (the bed releases in 0.3 s on the cut to the greeting)'],
  ['WORLD NOW', 'around the world', '100 BPM muted pluck ostinato in eighths + triangle half notes, no melody, no drums'],
  ['WORLD NOW', 'and finally + chat', '88 BPM sparse soft triangle and pluck, from "And finally" through the chat'],
  ['WORLD NOW', 'sign-off', 'spoken dry; then low brass sings the signature resolving 3 -> 1 in the 1.5 s hold'],
  ['WORLD NOW', 'breaking', 'one b3 signature sting (D minor, low brass over one timpani), then silence'],
  ['TECH BYTES', 'cold open, chats, number, and finally, sign-off', '104 BPM half-time: triangle roots, pad on Am9/D9, pulse-12 arpeggio (vel <= 0.45, LP 1.5 kHz) in a dotted echo; closed hats on cold open and and-finally only'],
  ['TECH BYTES', 'story links', 'silence'],
  ['TECH BYTES', 'number of the day', 'pluck, dry: low 5 -> 1 landing on the figure (0.8 s), bed under the card'],
  ['TECH BYTES', 'end of a feature', 'two-note pluck button resolving to A (0.6 s)'],
  ['COSMOS DESK', 'cold open', 'pad + sub; bells only before Nova\'s first word'],
  ['COSMOS DESK', 'picture / map shots in stories', 'bed fades in over 1.0 s from the cut, out over 1.5 s from the cut away (>= 10 s between fade-ins, not on shots < 6 s); pad + sub only under voice, LP 1.2 kHz'],
  ['COSMOS DESK', 'and finally pictures', 'the light colour of the bed, 4 dB quieter'],
  ['COSMOS DESK', 'greeting, singles, chats, the Reading, close', 'silence; end card = the network outro cue'],
  ['MONEY MINUTE', 'intro', 'vamp Fmaj9 | Dm9 | Bbmaj9 | C6sus at 114 BPM: pad, then bass, then Rhodes on the "and" of 2 and 4; out on the bar line at the teaser\'s last word'],
  ['MONEY MINUTE', 'stories', 'silence (owner switch soft/drone: a sustained pad low-passed at 800 Hz, 28 LU under the voice)'],
  ['MONEY MINUTE', 'into the number', 'the signature at double speed + the 6th (0.8 s), inside the 1.2 s gap'],
  ['MONEY MINUTE', 'number of the day', 'tape bed: up F Ionian | down D Aeolian | mixed G Dorian | neutral F-C-D drone'],
  ['MONEY MINUTE', 'sign-off + end card', 'crossfade on a bar line to the vamp, a signature fragment after the last word, a button on the end card\'s first downbeat'],
  ['NEWS IN 60', 'downbeat to sign-off', '120 BPM: pad, staccato triangle on every beat, woodblock tock (1, 3) / tick (2, 4) under 2 kHz; -24 dB under speech, -20 dB in gaps'],
  ['NEWS IN 60', 'each item cut', 'the bed\'s own tick, once, 4 dB up: the only sound between items'],
  ['NEWS IN 60', 'grave / breaking item', 'tick, tock and bass drop out on the cut; the pad stays alone'],
  ['NEWS IN 60', 'sign-off', 'one Gadd9 bell chord on the last word, then the bed bows out'],
  ['ALL (owner switch soft)', 'light / neutral stories', 'WORLD NOW 76 BPM pad + triangle + slow Rhodes (D); TECH pad + half-time triangle on Am9/D9; COSMOS pad + sub on every shot; MONEY the 800 Hz drone; all below 1.3 kHz, >= 24 LU under the voice'],
  ['ALL', 'grave story', 'silence (opt-in: a near-inaudible low pad), and no bed in the segment after it'],
  ['CHANNEL', 'lead-in WORLD NOW / NEWS IN 60', 'countdown 10.5 s: a quiet bell tick every second, triangle eighths at 120 BPM, a pad minor -> major at 0:00 (sombre: pad only)'],
  ['CHANNEL', 'lead-in TECH / COSMOS / MONEY', 'ident film: the signature once on pulse-12 with echo over pad + triangle pedal, last note on the alignment (bar 4); hold loops pad + pluck; 84-92 BPM night, 96-104 day'],
  ['CHANNEL', 'bumper cards', '84 BPM loop of triangle bass and swung pluck (grave mode: the sombre ident, pad only)'],
  ['CHANNEL', 'ad boundaries', '0.3 s of true silence; ads bring their own music'],
  ['CHANNEL', 'replay plate', 'the signature backwards (high 5 - 2 - 1 - low 5, then the 2 left open) on a soft Rhodes through a long tape echo, over IV(add9); 2.6 s, before the open'],
  ['CHANNEL', 'holding slide', 'a held Dmaj9 over a triangle pedal'],
  ['CHANNEL', 'standby', 'the cosy lo-fi home bed, endless and evolving'],
];

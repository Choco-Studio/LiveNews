// Lo-fi newsroom proposal: offline renders for the lab page and
// tools/render-audio.mjs. Drives LofiEngine on an OfflineAudioContext through
// the same pump()/cue()/setSpeaking() calls the live channel would make, with
// Kokoro test voices placed where the programme bibles put them (spoken through
// the channel's own broadcast chain, tools/voice presets, -16 LUFS). A timeline
// can start with the programme's real open theme (audio stream, themeFor) so the
// open -> bed hand-over is heard as on air. Without the clips a speech-shaped
// stand-in is used.

import { LofiEngine, LOOKAHEAD } from './engine.js';
import { rng } from './theory.js';
import { CUES as SEQ_CUES, durationOf } from '../../../scenes/opens/cues.js';
import { WN_DURATION } from '../../../scenes/opens/worldcues.js';

// Durations of the Kokoro test clips ($SP/audio/music/lofi/voice3: house broadcast chain), for planning and the stand-in.
export const CLIPS = {
  'wn-hl1': 3.5, 'wn-hl2': 3.67, 'wn-hl3': 3.127, 'wn-greet': 3.9, 'wn-lead': 8.065, 'wn-round': 13.262,
  'wn-grave': 6.723, 'wn-chat1': 2.74, 'wn-chat2': 1.85, 'wn-finally': 7.93, 'wn-signoff': 3.985, 'tb-cold': 7.44,
  'tb-lead': 8.29, 'tb-catch1': 3.678, 'tb-catch2': 2.072, 'tb-number': 7.11, 'tb-finally': 7.615,
  'tb-button': 2.402, 'tb-signoff': 2.377, 'co-cold': 4.402, 'co-greet': 5.39, 'co-story': 13.943,
  'co-reading': 5.865, 'co-finally': 8.11, 'co-close': 3.277, 'mm-intro': 8.373, 'mm-lead': 6.487,
  'mm-story2': 5.195, 'mm-number': 6.072, 'mm-signoff': 2.545, 'n6-intro': 1.5, 'n6-item1': 4.39, 'n6-item2': 3.132,
  'n6-item3': 6.175, 'n6-grave': 4.935, 'n6-item4': 4.01, 'n6-signoff': 1.845, 'ct-next-wn': 3.203,
  'ct-next-tb': 2.402, 'ct-sombre': 2.248, 'wn-light': 8.355,
  'ww-intro': 4.755, 'ww-zone1': 6.53, 'ww-zone2': 5.365, 'ww-warning': 6.98, 'ww-zone3': 4.258, 'ww-tomorrow': 4.367, 'ww-outro': 3.507,
};

/** Replace planning durations with the real ones (the lab page loads the clips' manifest). */
export function setClipDurations(map) {
  for (const [k, v] of Object.entries(map || {})) if (Number(v) > 0) CLIPS[k] = Number(v);
}

/**
 * A tiny script language: steps run in order on a clock.
 *   ['cue', moment, opts]          cue now
 *   ['say', clip]                  voice from now; the clock moves to its end
 *   ['rel', offset, moment, opts]  cue at (start of the last 'say' + offset), clock unchanged
 *   ['wait', s] / ['at', t]        move / set the clock
 *   ['open', programId]            the programme's open theme (audio stream), 4 s
 * Returns { cues: [[t, moment, opts]], voice: [[t, clip]], opens: [[t, programId]], end }.
 */
export const OPEN_SECONDS = 4;
/** How long a programme's open runs on air (its title sequence, as the director waits it out). */
export const openSeconds = (pid) => (pid === 'world-now' ? WN_DURATION : SEQ_CUES[pid] ? durationOf(pid) : OPEN_SECONDS);
function script(steps) {
  let t = 0;
  let lastSay = 0;
  const cues = [];
  const voice = [];
  const opens = [];
  for (const [op, a, b, c] of steps) {
    if (op === 'open') {
      cues.push([t, 'open', { programId: a }]);
      opens.push([t, a]);
      t += openSeconds(a);
    } else if (op === 'cue') cues.push([t, a, b || {}]);
    else if (op === 'say') {
      voice.push([t, a]);
      lastSay = t;
      t += CLIPS[a] || 3;
    } else if (op === 'rel') cues.push([lastSay + a, b, c || {}]);
    else if (op === 'wait') t += a;
    else if (op === 'at') t = a;
  }
  return { cues, voice, opens, end: t };
}

const P = (programId, extra = {}) => ({ programId, ...extra });

// WORLD NOW headlines per the bible: the first word 0.5 s after the cut, each beat = line + 1.0 s
// gap (>= 3.8 s), the timpani + pip 0.1 s after each line's last word.
function headlines(lines = ['wn-hl1', 'wn-hl2', 'wn-hl3']) {
  const steps = [];
  lines.forEach((clip, i) => {
    steps.push(['cue', 'headlines', P('world-now', { line: i, lines: lines.length, segment: 1 })]);
    if (i === 0) steps.push(['wait', 0.5]);
    steps.push(['say', clip], ['wait', 0.1], ['cue', 'pip', P('world-now', { line: i, lines: lines.length })], ['wait', 0.9]);
  });
  return steps;
}

export const TIMELINES = {
  // The required 60 s demo, in the task's order (open tail -> headlines -> light story -> grave
  // story -> chat -> outro), with the WORLD NOW bible's rules: the open's own theme (audio stream)
  // hands over to the headline arc; the round-up is the light segment with a bed; the grave story
  // and the segment after it (the chat) are dry; the sign-off ends on brass.
  demo: () => ({
    programme: 'world-now', seconds: 60,
    ...script([
      ['open', 'world-now'],
      ...headlines(),
      ['wait', 0.3], ['cue', 'greeting', P('world-now', { segment: 2 })], ['wait', 0.3], ['say', 'wn-greet'], ['wait', 0.6],
      ['cue', 'roundup', P('world-now', { segment: 3 })], ['wait', 0.2], ['say', 'wn-round'], ['wait', 0.8],
      ['cue', 'story', P('world-now', { emotion: 'serious', segment: 4 })], ['wait', 0.3], ['say', 'wn-grave'], ['wait', 0.7],
      ['cue', 'chat', P('world-now', { segment: 5 })], ['wait', 0.2], ['say', 'wn-chat1'], ['wait', 0.3], ['say', 'wn-chat2'], ['wait', 0.7],
      ['cue', 'outro', P('world-now', { segment: 6 })], ['wait', 0.2], ['say', 'wn-signoff'], ['wait', 0.12],
      ['cue', 'signoffEnd', P('world-now')], ['wait', 1.5], ['cue', 'endcard', P('world-now')],
    ]),
  }),
  // The same running order with the owner switch bedUnderStories: 'soft': a light story gets the
  // very soft story bed, which hands over to the round-up on a bar line; grave and after stay dry.
  'demo-soft': () => ({
    programme: 'world-now', seconds: 70, bedUnderStories: 'soft',
    ...script([
      ['open', 'world-now'],
      ...headlines(),
      ['wait', 0.3], ['cue', 'greeting', P('world-now', { segment: 2 })], ['wait', 0.3], ['say', 'wn-greet'], ['wait', 0.6],
      ['cue', 'story', P('world-now', { emotion: 'neutral', segment: 3 })], ['wait', 0.3], ['say', 'wn-light'], ['wait', 0.7],
      ['cue', 'roundup', P('world-now', { segment: 4 })], ['wait', 0.2], ['say', 'wn-round'], ['wait', 0.8],
      ['cue', 'story', P('world-now', { emotion: 'serious', segment: 5 })], ['wait', 0.3], ['say', 'wn-grave'], ['wait', 0.7],
      ['cue', 'chat', P('world-now', { segment: 6 })], ['wait', 0.2], ['say', 'wn-chat1'], ['wait', 0.3], ['say', 'wn-chat2'], ['wait', 0.7],
      ['cue', 'outro', P('world-now', { segment: 7 })], ['wait', 0.2], ['say', 'wn-signoff'], ['wait', 0.12],
      ['cue', 'signoffEnd', P('world-now')], ['wait', 1.5], ['cue', 'endcard', P('world-now')],
    ]),
  }),
  // WORLD NOW, the light ending: lead (dry), round-up, And finally, the chat on its bed, brass sign-off.
  'world-now': () => ({
    programme: 'world-now', seconds: 75,
    ...script([
      ['open', 'world-now'],
      ...headlines(),
      ['wait', 0.3], ['cue', 'greeting', P('world-now', { segment: 2 })], ['wait', 0.3], ['say', 'wn-greet'], ['wait', 0.6],
      ['cue', 'story', P('world-now', { emotion: 'neutral', segment: 3 })], ['wait', 0.3], ['say', 'wn-lead'], ['wait', 0.6],
      ['cue', 'roundup', P('world-now', { segment: 4 })], ['wait', 0.2], ['say', 'wn-round'], ['wait', 1.0],
      ['cue', 'finally', P('world-now', { segment: 5 })], ['wait', 0.4], ['say', 'wn-finally'], ['wait', 0.5],
      ['cue', 'chat', P('world-now', { segment: 6 })], ['say', 'wn-chat1'], ['wait', 0.25], ['say', 'wn-chat2'], ['wait', 0.6],
      ['cue', 'outro', P('world-now', { segment: 7 })], ['wait', 0.2], ['say', 'wn-signoff'], ['wait', 0.12],
      ['cue', 'signoffEnd', P('world-now')], ['wait', 1.5], ['cue', 'endcard', P('world-now')],
    ]),
  }),
  'tech-bytes': () => ({
    programme: 'tech-bytes', seconds: 58,
    ...script([
      ['open', 'tech-bytes'],
      ['cue', 'coldOpen', P('tech-bytes', { segment: 1 })], ['wait', 0.5], ['say', 'tb-cold'], ['wait', 0.6],
      ['cue', 'story', P('tech-bytes', { emotion: 'neutral', segment: 2 })], ['wait', 0.3], ['say', 'tb-lead'], ['wait', 0.6],
      ['cue', 'chat', P('tech-bytes', { segment: 3 })], ['wait', 0.4], ['say', 'tb-catch1'], ['wait', 0.3], ['say', 'tb-catch2'], ['wait', 0.6],
      ['cue', 'number', P('tech-bytes', { segment: 4 })], ['wait', 0.2], ['cue', 'numberSting', P('tech-bytes')], ['wait', 0.9], ['say', 'tb-number'], ['wait', 1.5],
      ['cue', 'finally', P('tech-bytes', { segment: 5 })], ['wait', 0.8], ['say', 'tb-finally'], ['wait', 0.15],
      ['cue', 'featureEnd', P('tech-bytes')], ['wait', 0.7],
      ['cue', 'chat', P('tech-bytes', { segment: 6 })], ['say', 'tb-button'], ['wait', 0.8],
      ['cue', 'outro', P('tech-bytes', { segment: 7 })], ['wait', 0.3], ['say', 'tb-signoff'], ['wait', 0.2],
      ['cue', 'signoffEnd', P('tech-bytes')], ['wait', 2.4], ['cue', 'endcard', P('tech-bytes')],
    ]),
  }),
  cosmos: () => ({
    programme: 'cosmos', seconds: 48,
    ...script([
      ['cue', 'coldOpen', P('cosmos', { segment: 1 })], ['wait', 1.2], ['say', 'co-cold'], ['wait', 0.6],
      ['open', 'cosmos'],
      ['cue', 'greeting', P('cosmos', { segment: 2 })], ['wait', 0.3], ['say', 'co-greet'], ['wait', 0.6],
      ['cue', 'story', P('cosmos', { emotion: 'happy', segment: 3 })], ['cue', 'shot', P('cosmos', { kind: 'presenter' })], ['wait', 0.3],
      ['say', 'co-story'], ['rel', 3.2, 'shot', P('cosmos', { kind: 'picture', expected: 8 })], ['rel', 11.0, 'shot', P('cosmos', { kind: 'presenter' })], ['wait', 0.6],
      ['cue', 'number', P('cosmos', { segment: 4 })], ['wait', 0.3], ['say', 'co-reading'], ['wait', 1.5],
      ['cue', 'finally', P('cosmos', { segment: 5 })], ['cue', 'shot', P('cosmos', { kind: 'presenter' })], ['wait', 0.3],
      ['say', 'co-finally'], ['rel', 1.8, 'shot', P('cosmos', { kind: 'picture', expected: 6.5 })], ['wait', 0.6],
      ['cue', 'outro', P('cosmos', { segment: 6 })], ['wait', 0.3], ['say', 'co-close'], ['wait', 1.0],
      ['cue', 'endcard', P('cosmos')],
    ]),
  }),
  'money-minute': () => ({
    programme: 'money-minute', seconds: 45,
    ...script([
      ['open', 'money-minute'],
      ['cue', 'headlines', P('money-minute', { segment: 1 })], ['wait', 1.2], ['say', 'mm-intro'], ['wait', 0.1],
      ['cue', 'introEnd', P('money-minute')], ['wait', 0.8],
      ['cue', 'story', P('money-minute', { emotion: 'neutral', segment: 2 })], ['wait', 0.2], ['say', 'mm-lead'], ['wait', 0.8],
      ['cue', 'story', P('money-minute', { emotion: 'neutral', segment: 3 })], ['wait', 0.2], ['say', 'mm-story2'], ['wait', 0.1],
      ['cue', 'numberSting', P('money-minute')], ['wait', 1.1],
      ['cue', 'number', P('money-minute', { tape: 'up', segment: 4 })], ['wait', 0.1], ['say', 'mm-number'], ['wait', 0.8],
      ['cue', 'outro', P('money-minute', { segment: 5 })], ['wait', 0.4], ['say', 'mm-signoff'], ['wait', 0.15],
      ['cue', 'signoffEnd', P('money-minute')], ['wait', 2.2], ['cue', 'endcard', P('money-minute')],
    ]),
  }),
  'news-60': () => ({
    programme: 'news-60', seconds: 45,
    ...script([
      ['open', 'news-60'],
      ['cue', 'headlines', P('news-60', { segment: 1 })], ['wait', 0.3], ['say', 'n6-intro'], ['wait', 0.7],
      ['cue', 'item', P('news-60')], ['cue', 'story', P('news-60', { segment: 2 })], ['wait', 0.05], ['say', 'n6-item1'], ['wait', 0.7],
      ['cue', 'item', P('news-60')], ['cue', 'story', P('news-60', { segment: 3 })], ['wait', 0.05], ['say', 'n6-item2'], ['wait', 0.7],
      ['cue', 'item', P('news-60')], ['cue', 'roundup', P('news-60', { segment: 4 })], ['wait', 0.05], ['say', 'n6-item3'], ['wait', 0.7],
      ['cue', 'item', P('news-60')], ['cue', 'story', P('news-60', { emotion: 'sad', grave: true, segment: 5 })], ['wait', 0.05], ['say', 'n6-grave'], ['wait', 0.7],
      ['cue', 'item', P('news-60')], ['cue', 'story', P('news-60', { segment: 6 })], ['wait', 0.05], ['say', 'n6-item4'], ['wait', 0.7],
      ['cue', 'outro', P('news-60', { segment: 7 })], ['wait', 0.3], ['say', 'n6-signoff'],
      ['cue', 'signoffEnd', P('news-60')], ['wait', 2.5], ['cue', 'endcard', P('news-60')],
    ]),
  }),
  // WORLD WEATHER: the open, its own bed under the zones, silence for the warning, the bed again for
  // tomorrow, the sign-off on keys and bass.
  'world-weather': () => ({
    programme: 'world-weather', seconds: 60,
    ...script([
      ['open', 'world-weather'],
      ['cue', 'weather', P('world-weather', { kind: 'intro', segment: 1 })], ['wait', 0.4], ['say', 'ww-intro'], ['wait', 0.7],
      ['cue', 'weather', P('world-weather', { kind: 'zone', segment: 2 })], ['wait', 0.3], ['say', 'ww-zone1'], ['wait', 0.6],
      ['cue', 'weather', P('world-weather', { kind: 'zone', segment: 3 })], ['wait', 0.3], ['say', 'ww-zone2'], ['wait', 0.6],
      ['cue', 'weather', P('world-weather', { kind: 'warning', emotion: 'serious', segment: 4 })], ['wait', 0.5], ['say', 'ww-warning'], ['wait', 0.8],
      ['cue', 'weather', P('world-weather', { kind: 'zone', segment: 5 })], ['wait', 0.3], ['say', 'ww-zone3'], ['wait', 0.6],
      ['cue', 'weather', P('world-weather', { kind: 'tomorrow', segment: 6 })], ['wait', 0.3], ['say', 'ww-tomorrow'], ['wait', 0.6],
      ['cue', 'weather', P('world-weather', { kind: 'outro', segment: 7 })], ['wait', 0.3], ['say', 'ww-outro'], ['wait', 1.2],
      ['cue', 'endcard', P('world-weather')],
    ]),
  }),
  // A main break and the next lead-in: bumper cards, 0.3 s silences, an ad (silent stand-in),
  // a holding slide, then the WORLD NOW countdown with the continuity voice and the hard cut.
  break: () => ({
    programme: 'channel', seconds: 31,
    ...script([
      ['cue', 'bumper', P('channel', { kind: 'cards' })], ['wait', 8.0],
      ['cue', 'silence', P('channel')], ['wait', 0.3], ['cue', 'ad', P('channel')], ['wait', 6.0], ['cue', 'silence', P('channel')], ['wait', 0.3],
      ['cue', 'holding', P('channel')], ['wait', 3.5], ['cue', 'silence', P('channel')], ['wait', 0.3],
      ['cue', 'leadin', P('channel', { programId: 'world-now' })], ['wait', 0.5], ['say', 'ct-next-wn'], ['at', 18.4 + 10.5],
      ['cue', 'cut', P('channel')],
    ]),
  }),
  // Ident film lead-in (TECH BYTES, daytime): 3 bars, alignment, the voice at +0.6 s, the hold, the cut.
  ident: () => {
    const spb = 60 / 100;
    const align = spb * 12;
    const hold = Math.ceil(Math.max(2.0, 0.6 + CLIPS['ct-next-tb'] + 0.6) / spb) * spb;
    return {
      programme: 'channel', seconds: 13.5,
      ...script([
        ['cue', 'leadin', P('channel', { programId: 'tech-bytes', hour: 14 })], ['at', align + 0.6], ['say', 'ct-next-tb'],
        ['at', align + Math.min(5, hold)], ['cue', 'cut', P('channel')],
      ]),
    };
  },
  // Grave mode: the sombre short ident as the bumper, then a sombre countdown (no ticks).
  sombre: () => ({
    programme: 'channel', seconds: 18,
    ...script([
      ['cue', 'bumper', P('channel', { grave: true })], ['wait', 6.0], ['cue', 'silence', P('channel')], ['wait', 0.3],
      ['cue', 'leadin', P('channel', { programId: 'world-now', sombre: true })], ['wait', 0.5], ['say', 'ct-sombre'], ['at', 6.3 + 10.5],
      ['cue', 'cut', P('channel')],
    ]),
  }),
  standby: () => ({ programme: 'channel', seconds: 180, cues: [[0, 'standby', {}]], voice: [], end: 180 }),
};

/** Bed-only renders: (programme, moment) -> cues, no voice. */
export function planFor({ programme = 'world-now', moment = 'roundup', seconds = 20 }) {
  const p = (extra = {}) => P(programme, extra);
  const c = (...xs) => xs.map(([t, m, o]) => [t, m, o || p()]);
  switch (`${programme}:${moment}`) {
    case 'world-now:headlines': {
      const tl = script(headlines());
      return { programme, seconds: Math.max(seconds, tl.end + 1), cues: [...tl.cues, [tl.end + 0.3, 'greeting', p({ segment: 2 })]], voice: [] };
    }
    case 'world-now:roundup': return { programme, seconds, cues: c([0, 'roundup', p({ segment: 4 })]), voice: [] };
    case 'world-now:finally': return { programme, seconds, cues: c([0, 'finally', p({ segment: 5 })], [seconds * 0.55, 'chat', p({ segment: 6 })]), voice: [] };
    case 'world-now:signoff': return { programme, seconds, cues: c([0.3, 'signoffEnd']), voice: [] };
    case 'world-now:breaking': return { programme, seconds, cues: c([0.3, 'breaking']), voice: [] };
    case 'world-now:story-soft':
    case 'tech-bytes:story-soft':
    case 'cosmos:story-soft':
    case 'money-minute:story-soft':
      // Owner switch bedUnderStories 'soft': two light stories back to back (the bed carries on).
      return { programme, seconds, bedUnderStories: 'soft', cues: c([0, 'story', p({ emotion: 'neutral', segment: 3 })], [seconds * 0.5, 'story', p({ emotion: 'happy', segment: 4 })]), voice: [] };
    case 'tech-bytes:signoff': return { programme, seconds, cues: c([0, 'outro', p({ segment: 7 })], [seconds - 3.5, 'signoffEnd'], [seconds - 1.2, 'endcard']), voice: [] };
    case 'tech-bytes:number': return { programme, seconds, cues: c([0, 'number', p({ segment: 4 })], [0.4, 'numberSting'], [seconds - 2, 'featureEnd']), voice: [] };
    case 'cosmos:story':
    case 'cosmos:finally': return { programme, seconds, cues: c([0, moment, p({ emotion: 'happy', segment: 3 })], [0.2, 'shot', p({ kind: 'picture', expected: 12 })]), voice: [] };
    case 'money-minute:intro': return { programme, seconds, cues: c([0, 'headlines', p({ segment: 1 })], [seconds - 2, 'introEnd']), voice: [] };
    case 'money-minute:signoff': return { programme, seconds, cues: c([0, 'outro', p({ segment: 5 })], [seconds - 4.5, 'signoffEnd'], [seconds - 2.3, 'endcard']), voice: [] };
    case 'money-minute:sting': return { programme, seconds, cues: c([0.3, 'numberSting']), voice: [] };
    case 'news-60:grave': return { programme, seconds, cues: c([0, 'headlines', p({ segment: 1 })], [4, 'item'], [4, 'story', p({ grave: true, segment: 2 })], [12, 'item'], [12, 'story', p({ segment: 3 })]), voice: [] };
    case 'news-60:bed': return { programme, seconds, cues: c([0, 'headlines', p({ segment: 1 })], ...[4, 9, 14, 19].map((t) => [t, 'item']), [seconds - 3, 'signoffEnd']), voice: [] };
    case 'world-weather:forecast': return { programme, seconds, cues: c([0, 'weather', p({ kind: 'zone', segment: 2 })]), voice: [] };
    case 'world-weather:tomorrow': return { programme, seconds, cues: c([0, 'weather', p({ kind: 'tomorrow', segment: 6 })]), voice: [] };
    case 'world-weather:signoff': return { programme, seconds, cues: c([0, 'weather', p({ kind: 'outro', segment: 7 })], [seconds - 1.2, 'endcard']), voice: [] };
    default:
      if (programme === 'money-minute' && moment.startsWith('tape-')) return { programme, seconds, cues: c([0, 'number', p({ tape: moment.slice(5), segment: 4 })]), voice: [] };
      if (programme === 'channel') {
        const ch = {
          countdown: [[0, 'leadin', { programId: 'world-now' }], [10.5, 'cut', {}]],
          'countdown-sombre': [[0, 'leadin', { programId: 'world-now', sombre: true }], [10.5, 'cut', {}]],
          'countdown-news60': [[0, 'leadin', { programId: 'news-60' }], [10.5, 'cut', {}]],
          'ident-day': [[0, 'leadin', { programId: 'tech-bytes', hour: 14 }]],
          'ident-night': [[0, 'leadin', { programId: 'cosmos', hour: 23 }]],
          'ident-money': [[0, 'leadin', { programId: 'money-minute', hour: 10 }]],
          'short-ident': [[0, 'bumper', { kind: 'ident' }]],
          'sombre-ident': [[0, 'bumper', { grave: true }]],
          bumper: [[0, 'bumper', { kind: 'cards' }], [seconds - 0.3, 'silence', {}]],
          holding: [[0, 'holding', {}], [seconds - 0.3, 'silence', {}]],
          'up-next': [[0.2, 'upNext', { next: 'cosmos', seconds: 4.2 }]],
          replay: [[0.2, 'replay', { programId: 'world-now' }]],
          standby: [[0, 'standby', {}]],
        }[moment] || [[0, moment, {}]];
        return { programme, seconds, cues: ch.map(([t, m, o]) => [t, m, { programId: 'channel', ...o }]), voice: [] };
      }
      return { programme, seconds, cues: c([0, moment, p({ segment: 3 })]), voice: [] };
  }
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
// pulses through three formant resonators with a syllable envelope (~-16 LUFS).
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
    let pulse = 0;
    if (phase >= 1) {
      phase -= 1;
      pulse = 1;
    }
    const exc = pulse + (r() * 2 - 1) * 0.05;
    let y = 0;
    formants.forEach(([f, bw], j) => {
      const w = (2 * Math.PI * f) / sr;
      const rad = Math.exp((-Math.PI * f * bw * 10) / sr);
      const s = state[j];
      const v = exc + 2 * rad * Math.cos(w) * s[0] - rad * rad * s[1];
      s[1] = s[0];
      s[0] = v;
      y += v * (j === 2 ? 0.5 : 1);
    });
    d[i] = y * env * 0.019;
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

/** The audio stream's open theme for a programme, rendered offline (null if unavailable). */
async function openTheme(programId, sampleRate, duck = []) {
  try {
    const [{ renderTune }, { themeFor }] = await Promise.all([import('../../../audio/synth.js'), import('../../../audio/themes.js')]);
    const seconds = openSeconds(programId);
    const out = await renderTune(themeFor(programId, { duration: seconds }), {
      sampleRate, volume: 0.6, startAt: 0, stopAt: seconds, seconds: seconds + 2.5, duck, // ducked under the first words as on air
    });
    return out?.buffer || null;
  } catch (err) {
    console.warn('[lofi] open theme unavailable', err);
    return null;
  }
}

/** The plan for a render: a named timeline or a (programme, moment) bed. */
export function planOf(opts = {}) {
  if (opts.timeline) {
    const make = TIMELINES[opts.timeline];
    if (!make) throw new Error(`unknown timeline ${opts.timeline}`);
    const plan = make();
    // Real clip lengths (manifest) can differ from the planning ones: keep 3 s after the last event.
    plan.seconds = Math.max(plan.seconds, Math.ceil(plan.end + 3));
    return plan;
  }
  return planFor(opts);
}

/**
 * Render to { sampleRate, channels, log, realVoice, melodyNotesUnderVoice }.
 * opts: { programme, moment, seconds, timeline, withVoice, stem: 'mix'|'music'|'voice', sampleRate,
 *         gravePad, sharedStings, voiceBase, solo, seed }
 * stem 'music' keeps the ducking (as if the voice were there) but mutes the voice: for measurements.
 */
export async function render(opts = {}) {
  const plan = planOf(opts);
  const seconds = Number(opts.seconds) > 0 && !opts.timeline ? Number(opts.seconds) : plan.seconds;
  const sr = Number(opts.sampleRate) || 44100;
  const withVoice = opts.timeline ? opts.withVoice !== false : Boolean(opts.withVoice);
  const voice = withVoice || opts.stem === 'music' || opts.stem === 'voice' ? plan.voice : [];
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const musicOut = ctx.createGain();
  musicOut.gain.value = opts.stem === 'voice' ? 0 : 1;
  musicOut.connect(ctx.destination);
  const engine = new LofiEngine(ctx, musicOut, {
    gravePad: Boolean(opts.gravePad), sharedStings: Boolean(opts.sharedStings), seed: opts.seed || 'demo', noteLog: true,
    bedUnderStories: opts.bedUnderStories || plan.bedUnderStories || 'soft', // as on air (music/live.js)
  });
  if (opts.solo) engine.solo = new Set(String(opts.solo).split(','));
  if (opts.noReverb) engine.rig.reverbIn.gain.value = 0; // diagnostics
  engine.speechPlan = speechRegions(voice.length ? voice : plan.voice);

  const events = [];
  for (const [t, moment, o] of plan.cues) events.push({ t, cue: moment, opts: { programId: plan.programme, ...(o || {}) } });
  for (const [a, b] of speechRegions(voice)) {
    events.push({ t: Math.max(0, a - 0.12), speak: true }); // the duck leads the first syllable by 120 ms
    events.push({ t: b, speak: false });
  }
  events.sort((x, y) => x.t - y.t || (x.cue ? -1 : 1));
  for (const e of events) {
    engine.pump(e.t + LOOKAHEAD);
    if (e.cue) engine.cue(e.cue, e.opts, e.t);
    else engine.setSpeaking(e.speak, e.t);
  }
  engine.pump(seconds + 2);

  // The programme's open theme from the audio stream, played as director.js does (volume 0.6,
  // stopped on the cut so its last chord rings over it), rendered with the channel's own mixer.
  if (plan.opens?.length && opts.stem !== 'voice' && opts.open !== false) {
    for (const [t, pid] of plan.opens) {
      // the voice regions on the theme's own clock: its tail ducks under the first words, as audio.js does
      const duck = speechRegions(voice.length ? voice : plan.voice).map(([a, b]) => [a - t, b - t]).filter(([, b]) => b > 0);
      const buf = await openTheme(pid, sr, duck);
      if (!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(t);
    }
  }

  let realVoice = null;
  if (voice.length && opts.stem !== 'music') {
    const base = opts.voiceBase || '/__voice/';
    for (const [t, key] of voice) {
      const clip = await loadClip(ctx, key, base);
      realVoice = realVoice === null ? clip.real : realVoice && clip.real;
      const src = ctx.createBufferSource();
      src.buffer = clip.buffer;
      src.connect(ctx.destination);
      src.start(t);
    }
  }

  const out = await ctx.startRendering();
  const round = (arr) => {
    const a = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) a[i] = Math.round(arr[i] * 1e5) / 1e5;
    return a;
  };
  // Bells / arpeggio notes that start while a voice is active (COSMOS: must be none).
  const regions = speechRegions(voice);
  const underVoice = (engine.notes || []).filter((n) => (n.layer === 'lead' || n.layer === 'arp') && regions.some(([a, b]) => n.t >= a && n.t <= b));
  return {
    sampleRate: sr,
    channels: [round(out.getChannelData(0)), round(out.getChannelData(1))],
    log: engine.log,
    realVoice,
    melodyNotesUnderVoice: underVoice.length,
    voice: plan.voice,
    cues: plan.cues,
    seconds,
  };
}

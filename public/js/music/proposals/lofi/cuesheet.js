// Lo-fi newsroom proposal: the cue sheet. Turns what the director is doing
// (a moment + the story's emotion) into a musical action. The rule of thumb:
// music fills the gaps and carries the energy of light moments, it never sits
// on grave news, and it gets out of the way of every word.

import { PALETTES } from './palettes.js';

const bed = (palette, moment) => ({ kind: 'bed', palette, moment });

/**
 * resolveCue(moment, { programId, emotion, breaking, next, seconds }, { gravePad })
 * -> { kind: 'bed', palette, moment } | { kind: 'silence', fade } | { kind: 'gravePad', palette }
 *  | { kind: 'sting', name, palette, stopBed, hard?, seconds? } | { kind: 'ending', palette }
 */
export function resolveCue(moment, opts = {}, { gravePad = false } = {}) {
  const pid = PALETTES[opts.programId] ? opts.programId : 'channel';
  const emotion = opts.emotion || 'neutral';
  const grave = emotion === 'serious' || emotion === 'sad';
  switch (moment) {
    case 'openTail':
      return bed(pid, 'openTail');
    case 'headlines':
    case 'intro':
      return bed(pid, 'headlines');
    case 'story':
      if (opts.breaking) return { kind: 'sting', name: 'breaking', palette: pid, stopBed: true, hard: true };
      if (grave) return gravePad ? { kind: 'gravePad', palette: pid } : { kind: 'silence', fade: 2.5 };
      if (emotion === 'happy' || emotion === 'surprised') return bed(pid, 'story');
      return bed(pid, PALETTES[pid].neutralStory || 'story');
    case 'grave':
      return gravePad ? { kind: 'gravePad', palette: pid } : { kind: 'silence', fade: 2.5 };
    case 'map':
    case 'roundup':
      return grave ? { kind: 'silence', fade: 2.5 } : bed(pid, 'map');
    case 'chat':
      return grave ? { kind: 'silence', fade: 2.5 } : bed(pid, 'chat');
    case 'outro':
      return bed(pid, 'outro');
    case 'endcard':
      return { kind: 'ending', palette: pid };
    case 'standby':
      return bed('channel', 'standby');
    case 'bumperIn':
      return { kind: 'sting', name: 'bumperIn', palette: 'channel', stopBed: true };
    case 'bumperOut':
      return { kind: 'sting', name: 'bumperOut', palette: PALETTES[opts.next] ? opts.next : pid, stopBed: true };
    case 'upNext':
      return { kind: 'sting', name: 'upNext', palette: PALETTES[opts.next] ? opts.next : pid, stopBed: true, seconds: opts.seconds };
    case 'replay':
      return { kind: 'sting', name: 'replay', palette: pid, stopBed: false };
    case 'breaking':
      return { kind: 'sting', name: 'breaking', palette: pid, stopBed: true, hard: true };
    default: // 'silence', 'open', 'ident', 'ad', unknown
      return { kind: 'silence', fade: 0.6 };
  }
}

/** Human-readable cue sheet: director event -> cue call (used by the lab page and DESIGN.md). */
export const CUE_SHEET = [
  ['stinger + programme open (4 s)', "silence (the open's own theme plays)"],
  ['open ends (tune stops)', "cue('openTail') - the song starts on its tonic, motif on top, 1 bar minimum"],
  ['intro / headline montage', "cue('headlines') - drums + keys + bass, ducked under the presenter"],
  ['story, happy / surprised', "cue('story', { emotion }) - pad + soft keys + bass, low-passed at 1.7 kHz"],
  ['story, neutral / thinking', "cue('story') - storyNeutral (world, money) or story (tech, cosmos, news-60)"],
  ['story, serious / sad', "cue('story', { emotion }) - fade to SILENCE over 2.5 s (optional gravePad)"],
  ['story, breaking', "cue('story', { breaking: true }) - calm breaking sting, then silence"],
  ['round-up items with a place (map)', "cue('map') - travelling arpeggio + shaker"],
  ['chat / banter', "cue('chat') - walking bass, bouncy keys, brushes"],
  ['outro', "cue('outro') - fuller bed, motif + answer in the gaps"],
  ['end card', "cue('endcard') - the button: tonic, motif, resolution to 'do'"],
  ['break starts (stinger to ident)', "cue('bumperIn') - motif in F on bells, open sus ending"],
  ['ident jingle / ads', "silence (they have their own jingles)"],
  ['up-next promo (4.2 s)', "cue('upNext', { next }) - IV-V-I in the next show's key"],
  ['back from a break mid-show', "cue('bumperOut', { next })"],
  ['replay episode', "cue('replay') right after the open - rewind tag"],
  ['standby (no item)', "cue('standby') - channel home bed, endless, evolving"],
];

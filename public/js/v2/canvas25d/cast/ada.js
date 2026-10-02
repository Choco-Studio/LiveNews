// Ada Volt (owner: PRESENTERS B stream). Sceptical tech analyst of TECH
// BYTES. PLACEHOLDER derived from Lola so the channel can map all eight
// presenters today; replace it with Ada's own design (keep the export name and
// do not keep importing another stream's presenter file).
import { P } from '../../../palette.js';
import { deriveLook, SKIN_LIGHT } from './base.js';
import { lola } from './lola.js';

export const ada = deriveLook(lola, {
  id: 'ada',
  name: 'Ada Volt',
  skin: SKIN_LIGHT,
  eyes: { ...lola.eyes, iris: [P.brown, P.maroon] },
  brows: { ...lola.brows, color: P.black },
  hair: { style: 'bob', ramp: [P.slate, P.ink, P.black, P.black], line: P.black },
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.slate, P.ink, P.ink, P.black], line: P.black },
  necklace: null,
  earrings: P.silver,
  cuff: P.slate,
  persona: { sway: 0.55, headMotion: 0.8, blinkMin: 2.8, blinkMax: 6.0, energy: 0.8, smile: 0.08 },
});

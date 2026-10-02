// Penny Sterling (owner: PRESENTERS A stream). Crisp markets correspondent of
// MONEY MINUTE. PLACEHOLDER derived from Lola so the channel can map all eight
// presenters today; replace it with Penny's own design (keep the export name).
import { P } from '../../../palette.js';
import { deriveLook, SKIN_LIGHT } from './base.js';
import { lola } from './lola.js';

export const penny = deriveLook(lola, {
  id: 'penny',
  name: 'Penny Sterling',
  skin: SKIN_LIGHT,
  eyes: { ...lola.eyes, iris: [P.steel, P.slate] },
  brows: { ...lola.brows, color: P.tanShade },
  hair: { style: 'bob', ramp: [P.cream, P.tan, P.tanShade, P.brown], line: P.brown },
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.white, P.white, P.silver, P.fog], line: P.steel },
  necklace: null,
  earrings: P.silver,
  cuff: P.white,
  persona: { sway: 0.6, headMotion: 0.8, blinkMin: 2.6, blinkMax: 5.6, energy: 0.8, smile: 0.16 },
});

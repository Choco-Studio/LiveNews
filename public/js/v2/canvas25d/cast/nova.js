// Dr Nova Reyes (owner: PRESENTERS B stream). Astrophysicist presenting COSMOS
// DESK. PLACEHOLDER derived from Lola so the channel can map all eight
// presenters today; replace it with Nova's own design (keep the export name and
// do not keep importing another stream's presenter file).
import { P } from '../../../palette.js';
import { deriveLook } from './base.js';
import { lola } from './lola.js';

export const nova = deriveLook(lola, {
  id: 'nova',
  name: 'Dr Nova Reyes',
  skin: [P.tan, P.tanShade, P.brown, P.maroon],
  skinLine: P.maroon,
  eyes: { ...lola.eyes, iris: [P.brown, P.maroon] },
  brows: { ...lola.brows, color: P.black },
  hair: { style: 'bob', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  mouth: { ...lola.mouth, lip: P.maroon, lipHi: P.tanShade, upper: P.brown },
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  necklace: [P.silver, P.fog],
  earrings: P.silver,
  cuff: P.silver,
  persona: { sway: 0.8, headMotion: 0.95, blinkMin: 2.3, blinkMax: 5.2, energy: 0.95, smile: 0.24 },
});

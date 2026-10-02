// Max Circuit (owner: PRESENTERS B stream). Technology correspondent of TECH
// BYTES. PLACEHOLDER derived from Paco so the channel can map all eight
// presenters today; replace it with Max's own design (keep the export name and
// do not keep importing another stream's presenter file).
import { P } from '../../../palette.js';
import { deriveLook, SKIN_TAN } from './base.js';
import { paco } from './paco.js';

export const max = deriveLook(paco, {
  id: 'max',
  name: 'Max Circuit',
  skin: SKIN_TAN,
  eyes: { ...paco.eyes, bags: false },
  brows: { ...paco.brows, color: P.black },
  hair: { style: 'short', ramp: [P.brown, P.maroon, P.black, P.black], line: P.black },
  mustache: null,
  jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black },
  shirt: { ramp: [P.slate, P.ink, P.ink, P.black], line: P.black },
  tie: null,
  pocket: false,
  persona: { sway: 0.95, headMotion: 1.1, blinkMin: 2.0, blinkMax: 4.8, energy: 1.15, smile: 0.24 },
  parts: { over: null },
});

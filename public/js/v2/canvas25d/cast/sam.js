// Sam Night (owner: PRESENTERS A stream). Relaxed rolling-news anchor of
// NEWS IN 60. PLACEHOLDER derived from Paco so the channel can map all eight
// presenters today; replace it with Sam's own design (keep the export name).
import { P } from '../../../palette.js';
import { deriveLook, SKIN_TAN } from './base.js';
import { paco } from './paco.js';

export const sam = deriveLook(paco, {
  id: 'sam',
  name: 'Sam Night',
  skin: SKIN_TAN,
  eyes: { ...paco.eyes, bags: false },
  brows: { ...paco.brows, color: P.maroon },
  hair: { style: 'short', ramp: [P.tanShade, P.brown, P.maroon, P.black], line: P.black },
  mustache: null,
  jacket: { ramp: [P.blue, P.navy, P.ink, P.black], line: P.black },
  tie: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  pocket: false,
  persona: { sway: 0.75, headMotion: 0.9, blinkMin: 2.4, blinkMax: 5.4, energy: 0.85, smile: 0.22 },
  parts: { over: null },
});

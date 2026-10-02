// UNIT-8 (owner: PRESENTERS B stream). The channel's robot co-host on COSMOS
// DESK. PLACEHOLDER: a grey-skinned human silhouette so the channel can map all
// eight presenters today. The real design replaces head/face/hair through the
// look's parts hooks (parts.head, parts.face, parts.hair, parts.over) and its
// own materials (mats): "an instrument, not a toy" (docs/programmes/cosmos.md):
// steel casing, 1x2 px eye slits with no pupils, a 3x1 px speech indicator that
// follows the voice envelope.
import { P } from '../../../palette.js';
import { deriveLook } from './base.js';
import { paco } from './paco.js';

export const unit8 = deriveLook(paco, {
  id: 'unit8',
  name: 'UNIT-8',
  skin: [P.silver, P.fog, P.steel, P.slate],
  skinLine: P.ink,
  eyes: { ...paco.eyes, iris: [P.white, P.silver], lash: P.ink, bags: false },
  brows: { ...paco.brows, color: P.slate },
  mouth: { ...paco.mouth, lip: P.slate, lipHi: P.steel, upper: P.steel, inner: P.ink },
  hair: { style: 'none', ramp: [P.silver, P.fog, P.steel, P.slate], line: P.ink },
  mustache: null,
  jacket: { ramp: [P.steel, P.slate, P.ink, P.black], line: P.black },
  shirt: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.ink },
  tie: null,
  pocket: false,
  cuff: P.fog,
  persona: { sway: 0.3, headMotion: 0.45, blinkMin: 4.0, blinkMax: 8.0, energy: 0.5, smile: 0 },
  parts: { hair: () => {}, over: null },
});

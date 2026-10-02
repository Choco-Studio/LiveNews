// Presenter registry for canvas25d (owner: INTEGRATION stream; presenter
// streams never need to edit it: each presenter lives in its own file).
//   LOOKS[id]           the look of one of the eight channel presenters
//   lookFor(id, info)   a look for any presenter id; unknown ids borrow the
//                       closest design (by voice gender in config/channel.json)
import { paco } from './paco.js';
import { lola } from './lola.js';
import { sam } from './sam.js';
import { penny } from './penny.js';
import { max } from './max.js';
import { ada } from './ada.js';
import { nova } from './nova.js';
import { unit8 } from './unit8.js';

export const LOOKS = { paco, lola, max, ada, nova, unit8, penny, sam };
export const PRESENTER_IDS = Object.keys(LOOKS);

/** Look for presenter `id`; `info` is its config entry ({ voice: { gender } }) for unknown ids. */
export function lookFor(id, info = null) {
  if (LOOKS[id]) return LOOKS[id];
  const g = info?.voice?.gender;
  return g === 'female' ? LOOKS.lola : g === 'robot' ? LOOKS.unit8 : LOOKS.paco;
}

// Presenter registry for canvas25d (owner: INTEGRATION stream; presenter
// streams never need to edit it: each presenter lives in its own file).
//   LOOKS[id]           the look of one of the ten channel presenters (FULL TIME's kai and rosa: cast/full-time.js)
//   lookFor(id, info)   a look for any presenter id; unknown ids borrow the
//                       closest design (by voice gender in config/channel.json);
//                       a re-staged guest (rp_…, IN THEIR WORDS) gets the look of their
//                       booking (`info` = episode.guests[id], cast/guest.js), never a presenter's
import { paco } from './paco.js';
import { lola } from './lola.js';
import { sam } from './sam.js';
import { penny } from './penny.js';
import { max } from './max.js';
import { ada } from './ada.js';
import { nova } from './nova.js';
import { unit8 } from './unit8.js';
import { kai, rosa, KAI_CANDIDATES, ROSA_CANDIDATES } from './full-time.js';
import { rhea, vic, mika } from './correspondents.js';
import { EXPERTS } from './experts.js';
import { guestLook, isGuestId } from './guest.js';

// (kai and rosa, FULL TIME: the candidate the owner approved, public/js/full-time-looks.js)
export const LOOKS = { paco, lola, max, ada, nova, unit8, penny, sam, kai, rosa };
export const PRESENTER_IDS = Object.keys(LOOKS);
// the correspondents (WORLD NOW links): looked up like presenters, never seated at a desk
export const CORRESPONDENT_LOOKS = { rhea, vic, mika };
// the experts (analyses, server/experts.js): seen only in the correspondents' shots, from their own studio
export const EXPERT_LOOKS = EXPERTS;
// FULL TIME's candidate looks for the owner's choice (kai-a, rosa-b, ...): looked up by id for the labs and the
// camera's framing; never on air under these ids, never in LOOKS
export const CANDIDATE_LOOKS = Object.fromEntries([...Object.values(KAI_CANDIDATES), ...Object.values(ROSA_CANDIDATES)].map((L) => [L.id, L]));

/**
 * Look for presenter `id`; `info` is its config entry ({ voice: { gender } }) for unknown ids, or a re-staged
 * guest's booking ({ kind: 'restaged', look: LookSpec }).
 */
export function lookFor(id, info = null) {
  if (isGuestId(id) || info?.kind === 'restaged') return guestLook(id, info?.kind === 'restaged' ? info : null);
  if (LOOKS[id]) return LOOKS[id];
  if (CORRESPONDENT_LOOKS[id]) return CORRESPONDENT_LOOKS[id];
  if (EXPERT_LOOKS[id]) return EXPERT_LOOKS[id];
  if (CANDIDATE_LOOKS[id]) return CANDIDATE_LOOKS[id];
  const g = info?.voice?.gender;
  return g === 'female' ? LOOKS.lola : g === 'robot' ? LOOKS.unit8 : LOOKS.paco;
}

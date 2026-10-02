// Maps channel presenters (config/channel.json) to their pixel-art drawings.
// Presenters without dedicated art yet borrow the closest existing design.
import { LOOKS } from './anchors.js';
import { P } from './palette.js';

let presenters = {};

export function setPresenters(map) {
  presenters = map || {};
}

export function presenterName(id) {
  return (presenters[id]?.name || id || '').toUpperCase();
}

function fallbackBase(id) {
  return presenters[id]?.voice?.gender === 'female' ? 'B' : 'A';
}

/** Look object for the wide-shot sprite (anchors.js). */
export function lookOf(id) {
  if (LOOKS[id]) return LOOKS[id];
  if (id === 'paco') return LOOKS.A;
  if (id === 'lola') return LOOKS.B;
  return LOOKS[fallbackBase(id)];
}

/** Id understood by portraits.js drawCloseup for this presenter (every cast member has a portrait). */
export function portraitOf(id, supported = ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']) {
  if (supported.includes(id)) return id;
  if (id === 'paco') return 'A';
  if (id === 'lola') return 'B';
  return fallbackBase(id);
}

/** Accent colour for each programme theme (docs/ART_DIRECTION.md "Re-dressing by programme"). */
export const THEME_ACCENT = {
  world: P.red,
  tech: P.cyan,
  space: P.magenta,
  money: P.green,
  flash: P.yellow,
};

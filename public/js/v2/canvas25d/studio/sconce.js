// MONEY MINUTE's bronze sconce (set.js draws the style's pair on the bare set, dressing.js on its wood wall).
import { C } from '../pixbuf.js';
import { SET, kAt, sxOf, syOf } from './geometry.js';

// MONEY MINUTE's bronze up/down sconce, hand-pixelled (two levels of detail: the wide, and the close
// shots). A tapered drum lit from camera-left: a 1 px silver highlight on its left edge, a three-tone
// bronze ramp (tan, tanShade, brown, maroon), a cream lip at the top opening, a tan one at the bottom and
// the short stem of its wall plate under it. Its light on the panel is styles.js's neutral scallop (a warm
// heart in the beam was tried: at the beam's size any warm cluster reads as an opaque brown shape).
//   k black, m maroon, b brown, n tanShade, t tan, c cream, s silver
const SCONCE = {
  small: {
    shade: 5.5, // the shade's centre row (the fixture's world Y)
    rows: [
      '.ccccc.',
      '.stnbm.',
      '.stnbm.',
      '.stnbm.',
      'stnnbbm',
      'stnnbbm',
      'stnnbbm',
      'stnbbbm',
      'stnbbbm',
      'kttttbk',
      '..kmk..',
      '..kmk..',
    ],
  },
  large: {
    shade: 7.5,
    rows: [
      '..cccccccccc..',
      '..sttttnnnbm..',
      '..sttnnnnbbm..',
      '..sttnnnnbbm..',
      '.sttnnnnnbbbm.',
      '.sttnnnnbbbbm.',
      '.stnnnnnbbbbm.',
      '.stnnnnnbbbbm.',
      'sttnnnnnbbbbmk',
      'stnnnnnbbbbbmk',
      'stnnnnnbbbbbmk',
      'kttttttttttbmk',
      '...kmmmmmmk...',
      '....kmmmmk....',
    ],
  },
};
const SCONCE_C = { k: 'black', m: 'maroon', b: 'brown', n: 'tanShade', t: 'tan', c: 'cream', s: 'silver' };
// out of focus: lower contrast, no highlight, no lit lips
const SCONCE_SOFT = { k: 'maroon', m: 'maroon', b: 'brown', n: 'brown', t: 'tanShade', c: 'tan', s: 'tanShade' };
const SCONCE_W = 9.8; // the fixture's width in world units (7 px in the wide)
export function drawSconce(fr, cam, X, Y, soft) {
  const k = kAt(cam, SET.wallZ);
  const spr = k < 1.1 ? SCONCE.small : SCONCE.large;
  const w = spr.rows[0].length;
  const sc = k < 1.1 ? 1 : Math.max(1, Math.round((k * SCONCE_W) / w));
  const map = soft ? SCONCE_SOFT : SCONCE_C;
  const x0 = Math.round(sxOf(cam, k, X) - (w * sc) / 2);
  const y0 = Math.round(syOf(cam, k, Y) - (spr.shade + 0.5) * sc);
  for (let j = 0; j < spr.rows.length; j++) {
    const row = spr.rows[j];
    for (let i = 0; i < w; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      fr.span(x0 + i * sc, y0 + j * sc, x0 + (i + 1) * sc, y0 + (j + 1) * sc, C[map[ch]]);
    }
  }
}


// Graphics of a correspondent link (WORLD NOW, server/correspondents.js), over the Stage's LOCATION and TWO-WAY
// shots and the B-roll of the place's footage:
//   (the correspondent's name and desk ride in the lower third for the first seconds of their first picture:
//   director.js playCross, as broadcasters do)
//   place tag    the place the story is about, under the clock (a dateline: the story's place, not a claim
//                that anyone stands there)
//   FILE         over the place's footage: FILE and the clip's credit (scene.fileCredit), as on any file picture
//   box labels   in the two-way, the studio's city and the place, in each box's corner
// An expert's analysis (server/experts.js) shows ANALYSIS where a link's place tag would be, and the expert's title
// on their box: they join from their own studio, so there is no place and no FILE.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { rect, TOP, W } from './layout.js';

export const LINK_SHOTS = new Set(['location', 'twoway', 'broll']);
const TWO = { y: 44, h: 99, w: 176, left: 12, right: 196 }; // studio/remote.js TWOWAY
const STUDIO_CITY = 'LONDON';

/** A black tag with white text, right-aligned at `right` (a small accent square in front). */
function tagRight(ctx, text, right, y, accent, { micro = false } = {}) {
  const font = micro ? 'micro' : 'body';
  const tw = measureText(text, 1, font);
  const h = micro ? 9 : 11;
  const x = right - tw - (accent ? 12 : 8);
  rect(ctx, x, y, right - x, h, P.black);
  if (accent) rect(ctx, x + 3, y + Math.round(h / 2) - 1, 3, 3, accent);
  drawText(ctx, text, right - tw - 4, y + (micro ? 2 : 2), { color: P.white, font });
  return x;
}

/** FILE and a clip's credit, right-aligned under the clock at `y` (a link's footage, a montage frame's). */
export function drawFileCredit(ctx, credit, y = TOP.y + TOP.h + 3) {
  const right = W - TOP.x;
  const x = tagRight(ctx, 'FILE', right, y, null);
  const text = String(credit || '').replace(/^FILE\s*·\s*/i, '').toUpperCase();
  if (!text) return;
  const cw = measureText(text, 1, 'micro');
  rect(ctx, x - cw - 7, y + 1, cw + 6, 9, P.ink);
  drawText(ctx, text, x - cw - 4, y + 3, { color: P.fog, font: 'micro' });
}

/**
 * Everything a link adds over its shot. scene = { shot, remote, fileCredit }; accent = the
 * programme's accent. Called by graphics/index.js after the top row, before the strap and captions.
 */
export function drawLinkGraphics(ctx, t, scene, accent = P.red) {
  const r = scene.remote;
  if (!r || !LINK_SHOTS.has(scene.shot)) return;
  const right = W - TOP.x;
  let y = TOP.y + TOP.h + 3;
  const expert = r.kind === 'expert';
  if (scene.shot !== 'twoway' && (r.place || expert)) {
    tagRight(ctx, expert ? 'ANALYSIS' : r.place, right, y, accent);
    y += 13;
  }
  if (scene.fileCredit && scene.shot !== 'twoway') drawFileCredit(ctx, scene.fileCredit, y); // the clip's credit beside it
  if (scene.shot === 'twoway') {
    for (const [bx, label] of [[TWO.left, STUDIO_CITY], [TWO.right, expert ? r.desk || '' : r.place || '']]) {
      if (!label) continue;
      const tw = measureText(label);
      const ly = TWO.y + TWO.h - 13;
      rect(ctx, bx + 4, ly, tw + 14, 11, P.black);
      rect(ctx, bx + 7, ly + 4, 3, 3, accent);
      drawText(ctx, label, bx + 13, ly + 2, { color: P.white });
    }
  }
}

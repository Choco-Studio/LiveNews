// The channel's AI mark beside the bug in a clip (docs/publishing/vertical.md §3; the compliance desk's
// public/js/graphics/disclosure.js and docs/publishing/compliance.md §3). A clip travels alone, so the mark that says
// "made by AI" stands docked to the bug's right edge for the whole clip, in both formats and on the hook card.
//
// When the compliance desk's module is in the build, its own mark is drawn (closed: the yellow AI plate; the channel
// opens it into words at the programme's start and every five minutes, which a cut clip cannot rely on, so the clip
// keeps it closed and its end card says the words). Until that module lands, a plain mark of the same shape stands in:
// a yellow plate, black AI, corners knocked off. Nothing else changes when the real one arrives.
//
//   markReady                  a promise: await it before the first frame (the recording is deterministic)
//   clipMarkWidth()            the mark's width in px (0 never: a clip always carries it)
//   drawClipMark(ctx, x, y)    the mark at (x, y), TOP.h tall; returns its width
//   realMark()                 true when the compliance desk's own mark is drawn
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { TOP } from '../graphics/layout.js';

let real = null;
export const markReady = import('../graphics/disclosure.js')
  .then((m) => {
    if (typeof m.drawMark === 'function' && typeof m.markWidth === 'function') real = m;
  })
  .catch(() => {});

const PAD = 3;
const FALLBACK_W = PAD + measureText('AI') + 1 + PAD;

export const realMark = () => !!real;

export function clipMarkWidth() {
  return real ? real.markWidth(0) : FALLBACK_W;
}

export function drawClipMark(ctx, x, y) {
  if (real) return real.drawMark(ctx, x, y, 0);
  const h = TOP.h;
  ctx.fillStyle = P.yellow;
  ctx.fillRect(x + 1, y, FALLBACK_W - 2, h);
  ctx.fillRect(x, y + 1, FALLBACK_W, h - 2);
  // double-struck: the same caps one pixel to the right
  drawText(ctx, 'AI', x + PAD, y + 3, { color: P.black });
  drawText(ctx, 'AI', x + PAD + 1, y + 3, { color: P.black });
  return FALLBACK_W;
}

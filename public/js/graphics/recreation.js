// Graphics of a re-staged guest (IN THEIR WORDS, owner 12 Oct; server/guests/restage.js; WAVE3 §6.3: "always
// labelled"). While the person is on screen, from the first frame of the piece to the last, with no wipe that
// could leave a frame without it:
//   the label     under the clock, right-aligned: RECREATION on a yellow plate and the rest of the line
//                 ("— WORDS FROM PUBLIC STATEMENTS") white on black, then "SOURCE: <OUTLET>" on its own plate
//                 below (body type: readable at 1x)
//   the name      the channel's name super in the strap's place: the role on the programme's accent tag (IN THEIR
//                 WORDS for a speaker the source names by role only), the name on the ink bar
// The words themselves ride in the captions above it (graphics/index.js places them).
//
//   recreationOf(booking, seg)     what the graphics show: { name, role, line, credit } (scene.recreation)
//   drawRecreation(ctx, rec, accent)
//   RECREATION                     the label's geometry (top-right, under the clock)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { rect, inkOn, STRAP, TOP, W } from './layout.js';

export const RECREATION = { right: W - TOP.x, y: TOP.y + TOP.h + 3, h: 11, gap: 2 };
const LINE = 'RECREATION — WORDS FROM PUBLIC STATEMENTS';
const FEATURE = 'IN THEIR WORDS';
const NAME_ROOM = STRAP.right - STRAP.x - 10;

const upper = (s) => String(s ?? '').trim().toUpperCase();

/**
 * The guest's lines on screen. `booking` = episode.guests[id] ({ strap: { name, role }, label: { line, credit } });
 * `seg` = the piece (its source and quoteRef, for a booking without a label). Never empty: the label always reads
 * RECREATION.
 */
export function recreationOf(booking, seg = {}) {
  const strap = booking?.strap || {};
  const label = booking?.label || {};
  const outlet = upper(seg?.quoteRef?.outlet || seg?.source);
  const said = String(seg?.quoteRef?.by || seg?.desk || '').replace(/^(?:the|a|an)\s+/i, '');
  const name = upper(strap.name || booking?.name || booking?.role || said || 'SPEAKER');
  const role = upper(strap.role || '');
  const line = /^RECREATION\b/i.test(String(label.line || '')) ? upper(label.line) : LINE;
  const credit = upper(label.credit) || (outlet ? `SOURCE: ${outlet}` : 'SOURCE: PUBLIC STATEMENTS');
  return { name, role, line, credit };
}

/** A label line right-aligned at `right`: the first word on a yellow plate when it is RECREATION, the rest on black. */
function labelLine(ctx, text, right, y, h) {
  const m = /^(RECREATION)\s*(.*)$/.exec(text);
  const head = m ? m[1] : '';
  const rest = m ? m[2] : text;
  const hw = head ? measureText(head) + 8 : 0;
  const rw = rest ? measureText(rest) + 9 : 0;
  const x = right - hw - rw;
  if (head) {
    rect(ctx, x, y, hw, h, P.yellow);
    drawText(ctx, head, x + 4, y + 2, { color: P.black });
  }
  if (rest) {
    rect(ctx, x + hw, y, rw, h, P.black);
    drawText(ctx, rest, x + hw + 5, y + 2, { color: P.white });
  }
  return x;
}

/** Fit `text` into `room` px, cutting whole words (never a scrap of one). */
function fit(text, room) {
  if (measureText(text) <= room) return text;
  const words = text.split(' ');
  while (words.length > 1 && measureText(words.join(' ')) > room) words.pop();
  return words.join(' ');
}

/** The label (top-right) and the name super (the strap's place), static from the first frame. */
export function drawRecreation(ctx, rec, accent = P.red) {
  if (!rec) return;
  const { right, y, h, gap } = RECREATION;
  labelLine(ctx, rec.line || LINE, right, y, h);
  const credit = rec.credit || '';
  if (credit) {
    const cw = measureText(credit) + 10;
    rect(ctx, right - cw, y + h + gap, cw, h, P.ink);
    drawText(ctx, credit, right - cw + 5, y + h + gap + 2, { color: P.silver });
  }
  // the name super: the role (or the feature) on the accent tag, the name on the bar
  const tag = fit(rec.role ? rec.role : FEATURE, NAME_ROOM);
  const tw = measureText(tag) + 10;
  const ty = STRAP.tagY, by = STRAP.barY;
  rect(ctx, STRAP.x, ty, tw, STRAP.tagH, accent);
  drawText(ctx, tag, STRAP.x + 5, ty + 2, { color: inkOn(accent) });
  rect(ctx, STRAP.x, by, STRAP.right - STRAP.x, STRAP.barH, P.ink);
  rect(ctx, STRAP.x, by, STRAP.right - STRAP.x, 1, accent);
  rect(ctx, STRAP.x, by + 1, STRAP.right - STRAP.x, 1, P.slate);
  rect(ctx, STRAP.x, STRAP.bottom - 1, STRAP.right - STRAP.x, 1, P.black);
  drawText(ctx, fit(rec.name, NAME_ROOM), STRAP.x + 5, by + 5, { color: P.white });
}

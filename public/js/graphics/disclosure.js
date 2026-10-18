// The channel's AI disclosure on screen (docs/publishing/compliance.md §3; AI Act Art. 50(4)-(5)).
//
// Owner, 18 Oct: "Quita la etiqueta IA, queda bastante mal", then, shown the break ident: "vale, deja solo esta
// versión. Durante el programa no hace falta que salga", and "en los anuncios no lo pongas". So:
//
//   THE IDENT       the channel's own card (scenes/opens/ident.js), before every programme, when the channel comes
//                   back from its break, and before a filler break long after the last one (pace.js CHANNEL.ident,
//                   director.js playIdent): GLOBIT 24, THE WORLD, PIXEL BY PIXEL, and under them
//                     AI-PRODUCED NEWS
//                     PRESENTERS ARE AI CHARACTERS · FACTS FROM CREDITED SOURCES
//                   white then silver, the body face with a 1 px shadow. Nothing over a programme, nothing inside a
//                   break (the bumper, the spots, the promo, the countdown).
//   A CLIP'S END CARD  the same words in the same type (clip/cards.js drawEndCard): three rows on the vertical card,
//                   two on the horizontal one.
//
// The RECREATION label (graphics/recreation.js) is not this: it stays in every frame of a re-staged guest, with its
// yellow plate and double-struck AI (the deep-fake case, Art. 50(4) first subparagraph), untouched.
//
// Frames: a clip cut to 9:16 or 1:1 is recorded with ?frame=9x16 (or 9x16@<x>, 1x1, 4x5): the graphics that carry a
// disclosure (the recreation's label and name, the captions) are laid out inside that window.
//
//   FRAME                          the active window { active, aspect, x, w, cx }
//   setFrame(spec) / frameFromSearch(search)
//   nounOf(programId)              NEWS, FORECAST, SPORT or QUIZ (the server's programmeWording says the same)
//   noticeParts(noun)              ['AI-PRODUCED NEWS', 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES']
//   NOTICE_LINE, IDENT_LINE        the parts joined by " · " (the server's CHANNEL.notice and CHANNEL.ident)
//   IDENT_ROWS, IDENT_STYLES       the ident's two rows and their type
//   IDENT_W, IDENT_H, drawIdentLine(ctx, cx, y)   the ident's statement
//   NOTICE_DRAWS                   how many times the notice has been drawn (a test reads it: never in a break)
//   drawBoldAI(ctx, x, y, color), AI_W     the double-struck AI of the RECREATION label (unchanged)
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { W } from './layout.js';

// ------------------------------------------------------------------------------------------------ frames

/** The window disclosures are laid out in (the whole 384 px width unless a clip frame is set). */
export const FRAME = { active: false, aspect: '16:9', x: 0, w: W, cx: W / 2 };

const ASPECTS = { '9x16': 9 / 16, '1x1': 1, '4x5': 4 / 5, '3x4': 3 / 4 };

/**
 * Set the clip frame: '9x16' (centred), '9x16@140' (left edge at x = 140), '1x1', '4x5', or null for the full
 * 16:9 frame. The window is the crop of the 216 px tall canvas at that aspect, in whole pixels, inside the canvas.
 */
export function setFrame(spec) {
  const m = /^(9x16|1x1|4x5|3x4)(?:@(\d{1,3}))?$/.exec(String(spec ?? '').trim());
  if (!m) {
    Object.assign(FRAME, { active: false, aspect: '16:9', x: 0, w: W, cx: W / 2 });
    return FRAME;
  }
  const w = Math.floor(216 * ASPECTS[m[1]]);
  const x = m[2] !== undefined ? Math.max(0, Math.min(W - w, Number(m[2]))) : Math.round((W - w) / 2);
  Object.assign(FRAME, { active: true, aspect: m[1].replace('x', ':'), x, w, cx: x + w / 2 });
  return FRAME;
}

/** The frame a page's URL asks for (?frame=9x16). */
export function frameFromSearch(search) {
  try {
    return new URLSearchParams(String(search || '')).get('frame');
  } catch {
    return null;
  }
}

if (typeof location !== 'undefined' && location?.search) setFrame(frameFromSearch(location.search));

// ------------------------------------------------------------------------------------------------ the words

/** The programme's noun (the server's disclosure.js programmeWording says the same). */
export const NOTICE_NOUN = Object.freeze({ 'world-weather': 'FORECAST', 'full-time': 'SPORT', 'pay-attention': 'QUIZ' });
export const nounOf = (programId) => NOTICE_NOUN[programId] || 'NEWS';

/** The notice's three parts: what the channel is, who presents it, where the facts come from. */
export function noticeParts(noun = 'NEWS') {
  return [`AI-PRODUCED ${String(noun || 'NEWS').toUpperCase()}`, 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES'];
}
export const NOTICE_SEP = ' · ';
export const NOTICE_LINE = noticeParts('NEWS').join(NOTICE_SEP);

/** How many times the notice has been drawn on this page (the ident, an end card): a test proves no break draws it. */
export const NOTICE_DRAWS = { n: 0 };

// ------------------------------------------------------------------------------------------------ the ident

/** The channel's statement under the ident's wordmark (server/compliance/disclosure.js CHANNEL.ident). */
export const IDENT_LINE = NOTICE_LINE;
/** The ident's two rows: what the channel is, then the rest of the notice. */
export const IDENT_ROWS = Object.freeze([noticeParts('NEWS')[0], noticeParts('NEWS').slice(1).join(NOTICE_SEP)]);
/** Their type: the body face, white then silver, a 1 px shadow (legible on the ident's horizon and any card's ground). */
export const IDENT_STYLES = Object.freeze([Object.freeze({ color: P.white, shadow: P.black }), Object.freeze({ color: P.silver, shadow: P.black })]);
/** Width of the ident's statement (its longer row) and its height (two rows, 11 px apart). */
export const IDENT_W = Math.max(...IDENT_ROWS.map((r) => measureText(r)));
export const IDENT_H = 7 + 4 + 7;

/** The ident's statement centred on cx, from y: AI-PRODUCED NEWS, and under it the rest of the notice. */
export function drawIdentLine(ctx, cx, y) {
  IDENT_ROWS.forEach((row, i) => drawText(ctx, row, Math.round(cx - measureText(row) / 2), y + 11 * i, IDENT_STYLES[i]));
  NOTICE_DRAWS.n++;
  return IDENT_W;
}

// ------------------------------------------------------------------------------------------------ the RECREATION label's AI

export const AI_W = measureText('AI') + 1; // double-struck: one pixel wider

/** The double-struck "AI" (5x7 caps drawn twice, one pixel apart) with its cap line at y (the RECREATION label's). */
export function drawBoldAI(ctx, x, y, color = P.black) {
  drawText(ctx, 'AI', x, y, { color });
  drawText(ctx, 'AI', x + 1, y, { color });
}

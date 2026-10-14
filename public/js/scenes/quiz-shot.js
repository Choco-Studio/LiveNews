// PAY ATTENTION's boards on air (docs/programmes/pay-attention.md §6; the director's step 4): the full-frame board shot
// ('quiz': studio.js) and the scores strip over the studio. The boards are cards-quiz.js's, each a pure function of its
// own clock; the director (quizdirector.js) passes the card { board, o } and fills in its times as they happen.
//
// Full frame, on the quiz's own ground: every board fills the safe area (x 13..371, y 28..134) and in the quiz's wide
// the three people sit inside those rows, so a board over the studio would cover them and leave their desks' fronts.
// The ground is the room's dark (black at the edges, ink behind the board's middle, a dithered step between), so the
// board's black panel reads against it, the captions below sit on black, and nothing moves behind the text.
import { P } from '../palette.js';
import { lazyBackdrop } from './opens/kit.js';
import { drawQuestionBoard, drawLettersBoard, drawWhereBoard, drawHowManyBoard, drawTodayBoard, drawRoundCard, drawDoubleCard, drawScoresStrip, drawTableBoard } from './cards-quiz.js';

const GROUND = lazyBackdrop({ key: 'quiz-ground', colors: [P.black, P.ink], cx: 192, cy: 81, reach: 250 });

const BOARDS = {
  picture: drawQuestionBoard,
  letters: drawLettersBoard,
  where: drawWhereBoard,
  howmany: drawHowManyBoard,
  today: drawTodayBoard,
  round: drawRoundCard,
  double: drawDoubleCard,
  final: drawScoresStrip,
  table: drawTableBoard,
};

/**
 * The board shot: the ground, then the card's board on its own clock (dt: s since the board's cut; a question's board
 * the director cuts back to after the players' faces keeps its first cut's clock, card.epoch, so it never replays).
 */
export function drawQuizShot(ctx, t, dt, card) {
  ctx.drawImage(GROUND(), 0, 0);
  const draw = BOARDS[card?.board];
  if (draw) draw(ctx, Number.isFinite(card?.epoch) ? Math.max(0, t - card.epoch) : dt, card.o || {});
}

/**
 * Where the strip stands in the quiz's wide: on the stage under the host's podium (its plate ends at y 148), clear of
 * the board's marquee and of every head, 6 px over the captions' two lines (they start at y 172).
 */
export const QUIZ_STRIP_Y = 153;

/** The scores as a one-line strip over the studio (the half-time scores, the banter after them). */
export function drawQuizStrip(ctx, t, strip) {
  if (!strip?.players) return;
  drawScoresStrip(ctx, Math.max(0, t - (strip.since || 0)), { players: strip.players, scores: strip.scores || {}, compact: true, y: QUIZ_STRIP_Y });
}

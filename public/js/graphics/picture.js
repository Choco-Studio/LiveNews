// The credit of the picture on screen (docs/pictures/RIGHTS.md; owner 17 Oct: "no sanction risk"): whenever a story's
// picture is visible, full frame, behind a board, in the studio's wall or the close-up's box, in a headline frame or a
// STILL TO COME tile, its credit is drawn under the clock as each licence asks: FILE, the author, the licence and
// "PIXELATED" for the licences that ask a change to be said ("FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED"). The
// server writes it (server/rights.js onAirCredit) into each segment's and rundown item's `imageCredit`.
// A picture that is not cleared (only in a private preview, PICTURE_RIGHTS=preview) carries PREVIEW · NOT CLEARED
// under its credit, for as long as it is on screen: a recording of a preview can never pass for a publishable one.
import { P } from '../palette.js';
import { drawText, measureText } from '../font.js';
import { rect, TOP, W } from './layout.js';
import { drawFileCredit } from './remote.js';

// shots that draw a board, a map or a card of their own over the whole frame (no studio wall behind)
const NOT_STUDIO = new Set(['full', 'broll', 'fact', 'montage', 'tease', 'map', 'weather', 'quiz', 'scores', 'ad', 'breakingCard', 'open', 'title', 'endcard', 'ident', 'promo', 'countdown', 'start', 'standby', 'location', 'twoway']);

/** The stories whose pictures are on screen now (at most two: STILL TO COME's tiles), by the scene the studio draws. */
export function picturesOnScreen(scene) {
  const images = scene?.images;
  if (!images?.get) return [];
  const has = (id, kind) => !!(id && images.get(id)?.[kind]);
  const shot = scene.shot;
  const card = scene.card || {};
  if (shot === 'full') return has(scene.storyId, 'full') ? [scene.storyId] : [];
  // a correspondent's B-roll shows the story's picture only when the place's footage is not there (its FILE credit is
  // the link graphics')
  if (shot === 'broll') return !card.footage && !scene.fileCredit && has(scene.storyId, 'full') ? [scene.storyId] : [];
  // (a board on its own ground shows no picture, so no credit: the sport's slate, the chalkboard, COMING UP)
  if (shot === 'fact') return has(scene.storyId, 'card') && !card.sport?.name && !card.chalk && !(Array.isArray(card.fixtures) && card.fixtures.length >= 2) ? [scene.storyId] : [];
  if (shot === 'montage') {
    const id = scene.rundown?.[card.index]?.storyId;
    return card.pic && id ? [id] : [];
  }
  if (shot === 'tease') {
    const ids = (card.items || []).filter(Boolean);
    if (ids.length >= 2) return ids.slice(0, 2).filter((id) => has(id, 'tile'));
    return card.pic && ids[0] ? [ids[0]] : [];
  }
  if (shot === 'close' && has(scene.storyId, 'small')) return [scene.storyId];
  if (NOT_STUDIO.has(shot)) return [];
  // the studio: the wall behind the presenters
  const wall = scene.wall;
  return wall?.mode === 'image' && has(wall.storyId, 'small') ? [wall.storyId] : [];
}

/** The credit of a story's picture as the episode gives it ({ credit, uncleared }), or null. */
export function pictureCreditOf(scene, id) {
  const fromMap = scene?.pictureCredits?.get?.(id);
  if (fromMap) return fromMap;
  // (only an item the rights desk credited: its imageLabel says FILE or EVENT)
  const item = (scene?.rundown || []).find((r) => r.storyId === id);
  return item?.imageCredit && item.imageLabel ? { credit: item.imageCredit, uncleared: !!item.imageUncleared } : null;
}

/** "PREVIEW · NOT CLEARED", right-aligned at `y` (yellow on black: it must never be missed). */
export function drawPreviewTag(ctx, y) {
  const text = 'PREVIEW · NOT CLEARED';
  const tw = measureText(text, 1, 'micro');
  const right = W - TOP.x;
  rect(ctx, right - tw - 8, y, tw + 8, 9, P.black);
  drawText(ctx, text, right - tw - 4, y + 2, { color: P.yellow, font: 'micro' });
}

/**
 * The right edge of the headline frame's tag under the bug, in the credit's row (scenes/cards.js drawHeadlineFrame: at
 * x 13, the micro words and 10 px, then the montage's pips, 11 px a story and 4 px), plus the gap a credit keeps from
 * it; 0 where no such tag is on screen. (Round 8: a long credit ran up against TOP STORIES' pips.)
 */
export function headlineTagRight(scene) {
  const shot = scene?.shot;
  if (shot === 'montage') {
    const n = Math.max(1, Math.min(12, Math.floor(scene.rundown?.length || 1)));
    return 13 + measureText('TOP STORIES', 1, 'micro') + 10 + n * 11 + 4 + CREDIT_GAP;
  }
  if (shot === 'tease' && (scene.card?.items || []).filter(Boolean).length < 2) return 13 + measureText('STILL TO COME', 1, 'micro') + 10 + CREDIT_GAP;
  return 0;
}
const CREDIT_GAP = 8;

// where the credits drawn this frame end (0: none): the captions at the top of a montage frame start under them
// (graphics/index.js captionPlace)
export const CREDITS = { bottom: 0 };

/** Draw the credits of the pictures on screen (under the clock, one line each). Returns how many were drawn. */
export function drawPictureCredits(ctx, scene) {
  if (scene?.remote && (scene.fileCredit || scene.shot === 'twoway')) return 0; // a link's own FILE credit is there
  let y = TOP.y + TOP.h + 3;
  let n = 0;
  CREDITS.bottom = 0;
  const left = headlineTagRight(scene);
  for (const id of picturesOnScreen(scene)) {
    const c = pictureCreditOf(scene, id);
    if (!c?.credit) continue;
    // (a picture of the event itself, a NASA photograph of that day's launch, says PHOTO, not FILE)
    // (a FILE picture of an earlier event says its year in the tag: "FILE 2023")
    const lines = drawFileCredit(ctx, c.credit, y, /^FILE\b/i.test(c.credit) ? /^FILE(?: \d{4})?/i.exec(c.credit)[0].toUpperCase() : 'PHOTO', { left });
    y += 11 + 9 * ((lines || 1) - 1);
    if (c.uncleared) {
      drawPreviewTag(ctx, y);
      y += 11;
    }
    n++;
    CREDITS.bottom = y - 1;
  }
  return n;
}

/** storyId -> { credit, uncleared } for every item of an episode the rights desk credited (segments and rundown). */
export function pictureCreditsOf(episode) {
  const out = new Map();
  for (const x of [...(episode?.segments || []), ...(episode?.rundown || [])]) {
    if (x?.storyId && x.imageCredit && x.imageLabel && x.hasImage !== false && !out.has(x.storyId)) out.set(x.storyId, { credit: x.imageCredit, uncleared: !!x.imageUncleared });
  }
  return out;
}

// The credit of the picture on screen (public/js/graphics/picture.js): whenever a story's cleared picture is visible
// (full frame, behind a board, on the studio wall, in the close-up's box, a headline frame, a STILL TO COME tile) its
// credit is drawn under the clock as its licence asks; a picture not cleared (a private preview) also says
// PREVIEW · NOT CLEARED; nothing is drawn for a story the rights desk did not credit.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

function fakeCtx() {
  return {
    depth: 0,
    fills: [],
    images: 0,
    fillStyle: '#000',
    imageSmoothingEnabled: false,
    save() {
      this.depth++;
    },
    restore() {
      this.depth--;
    },
    beginPath() {},
    rect() {},
    clip() {},
    fillRect(x, y, w, h) {
      this.fills.push({ x, y, w, h, c: this.fillStyle });
    },
    drawImage() {
      this.images++;
    },
    createImageData(w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    putImageData() {},
    getImageData(x, y, w, h) {
      return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fillText() {},
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { picturesOnScreen, pictureCreditsOf, drawPictureCredits, headlineTagRight, CREDITS } = await import('../public/js/graphics/picture.js');
const { P } = await import('../public/js/palette.js');

const pic = { small: {}, full: {}, card: {}, tile: {} };
const images = new Map([
  ['s1', pic],
  ['s2', pic],
]);
const episode = {
  segments: [{ storyId: 's1', hasImage: true, imageCredit: 'FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED', imageLabel: 'FILE' }],
  rundown: [
    { storyId: 's1', hasImage: true, imageCredit: 'FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED', imageLabel: 'FILE' },
    { storyId: 's2', hasImage: true, imageCredit: 'Reuters', imageLabel: 'FILE', imageUncleared: true },
    { storyId: 's3', hasImage: true, imageCredit: 'Pixelburg Post' }, // no rights desk: no credit drawn
  ],
};
const pictureCredits = pictureCreditsOf(episode);

describe('which pictures are on screen', () => {
  test('full frame, behind a board, the close-up box, the studio wall', () => {
    assert.deepEqual(picturesOnScreen({ shot: 'full', storyId: 's1', images }), ['s1']);
    assert.deepEqual(picturesOnScreen({ shot: 'fact', storyId: 's1', images }), ['s1']);
    // (FULL TIME's boards on their own ground show no picture: the sport's slate, the chalkboard, COMING UP)
    assert.deepEqual(picturesOnScreen({ shot: 'fact', storyId: 's1', images, card: { sport: { name: 'TENNIS', sport: 'tennis' } } }), []);
    assert.deepEqual(picturesOnScreen({ shot: 'fact', storyId: 's1', images, card: { chalk: { yards: 30 } } }), []);
    assert.deepEqual(picturesOnScreen({ shot: 'fact', storyId: 's1', images, card: { score: { a: 'A', b: 'B', sa: 1, sb: 0 } } }), ['s1']);
    assert.deepEqual(picturesOnScreen({ shot: 'close', storyId: 's1', images }), ['s1']);
    assert.deepEqual(picturesOnScreen({ shot: 'wide', storyId: 's1', images, wall: { mode: 'image', storyId: 's2' } }), ['s2']);
    assert.deepEqual(picturesOnScreen({ shot: 'wide', storyId: 's1', images, wall: { mode: 'source' } }), []);
  });
  test('a headline frame with its picture, STILL TO COME tiles; a map or a card of its own shows none', () => {
    assert.deepEqual(picturesOnScreen({ shot: 'montage', images, card: { index: 1, pic: {} }, rundown: episode.rundown }), ['s2']);
    assert.deepEqual(picturesOnScreen({ shot: 'montage', images, card: { index: 1, pic: false }, rundown: episode.rundown }), []);
    assert.deepEqual(picturesOnScreen({ shot: 'tease', images, card: { items: ['s1', 's2'] } }), ['s1', 's2']);
    assert.deepEqual(picturesOnScreen({ shot: 'map', storyId: 's1', images }), []);
    assert.deepEqual(picturesOnScreen({ shot: 'open', storyId: 's1', images }), []);
  });
  test("a correspondent's B-roll: the story's picture only when the place's footage is not on (its own FILE credit is)", () => {
    assert.deepEqual(picturesOnScreen({ shot: 'broll', storyId: 's1', images, card: {} }), ['s1']);
    assert.deepEqual(picturesOnScreen({ shot: 'broll', storyId: 's1', images, card: { footage: 'f1' } }), []);
  });
  test('a picture not loaded is not on screen', () => {
    assert.deepEqual(picturesOnScreen({ shot: 'full', storyId: 's9', images }), []);
  });
});

describe('the credit drawn', () => {
  test('the credits map holds the rights desk items only', () => {
    assert.equal(pictureCredits.get('s1').credit, 'FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED');
    assert.equal(pictureCredits.get('s2').uncleared, true);
    assert.equal(pictureCredits.has('s3'), false);
  });
  test('FILE and the credit under the clock, inside action-safe, while the picture is on screen', () => {
    const ctx = fakeCtx();
    assert.equal(drawPictureCredits(ctx, { shot: 'full', storyId: 's1', images, pictureCredits }), 1);
    assert.ok(ctx.fills.some((f) => f.c === P.black), 'the FILE tag');
    assert.ok(ctx.fills.some((f) => f.c === P.ink), 'the credit plate');
    assert.ok(ctx.fills.every((f) => f.x >= 13 && f.x + f.w <= 384 - 13 + 1 && f.y >= 21 && f.y + f.h <= 36), JSON.stringify(ctx.fills));
  });
  test('a FILE picture of an earlier event says its year in the tag ("FILE 2023"), the credit beside it, inside action-safe', () => {
    const plain = fakeCtx();
    drawPictureCredits(plain, { shot: 'full', storyId: 's1', images, pictureCredits });
    const dated = fakeCtx();
    const credits = new Map([['s1', { credit: 'FILE 2023 · EUROPEAN PARLIAMENT · CC BY 2.0 · PIXELATED', uncleared: false }]]);
    assert.equal(drawPictureCredits(dated, { shot: 'full', storyId: 's1', images, pictureCredits: credits }), 1);
    const tag = (ctx) => ctx.fills.filter((f) => f.c === P.black).reduce((w, f) => Math.max(w, f.w), 0);
    assert.ok(tag(dated) > tag(plain), 'the year is in the tag');
    assert.ok(dated.fills.every((f) => f.x >= 13 && f.x + f.w <= 384 - 13 + 1), JSON.stringify(dated.fills));
  });
  test('a picture not cleared (a private preview) carries PREVIEW · NOT CLEARED under its credit', () => {
    const ctx = fakeCtx();
    drawPictureCredits(ctx, { shot: 'full', storyId: 's2', images, pictureCredits });
    assert.ok(ctx.fills.some((f) => f.y >= 34 && f.y < 50 && f.c === P.black), 'the preview tag below the credit');
  });
  test('nothing for a story the rights desk did not credit, nor over a map, nor over a link with its own FILE credit', () => {
    for (const scene of [{ shot: 'full', storyId: 's3', images, pictureCredits, rundown: episode.rundown }, { shot: 'map', storyId: 's1', images, pictureCredits }, { shot: 'broll', storyId: 's1', images, pictureCredits, remote: { place: 'X' }, fileCredit: 'FILE · X · CC BY', card: {} }]) {
      const ctx = fakeCtx();
      assert.equal(drawPictureCredits(ctx, scene), 0, scene.shot);
      assert.equal(ctx.fills.length, 0);
    }
  });
  test('the longest credit the server writes (60 characters) fits on the line with the FILE tag', async () => {
    const { measureText } = await import('../public/js/font.js');
    const longest = 'X'.repeat(60 - 'FILE · '.length);
    assert.ok(measureText(longest, 1, 'micro') + measureText('FILE', 1, 'body') + 24 < 384 - 26, 'inside action-safe');
  });
  test('a longer credit runs on two lines (the author, then the licence and PIXELATED), inside action-safe; what comes under it moves down', async () => {
    const { creditLines } = await import('../public/js/graphics/remote.js');
    const { measureText } = await import('../public/js/font.js');
    // (the longest author line the server writes: 53 characters)
    const credit = 'FILE · ALEXANDROS MICHAILIDIS OF THE EUROPEAN PARLIAMENT · CC BY-SA 4.0 · PIXELATED';
    assert.deepEqual(creditLines(credit.replace(/^FILE · /, ''), (t) => measureText(t, 1, 'micro')), ['ALEXANDROS MICHAILIDIS OF THE EUROPEAN PARLIAMENT', 'CC BY-SA 4.0 · PIXELATED']);
    assert.ok(measureText('X'.repeat(53), 1, 'micro') <= 236, 'an author line fits');
    assert.deepEqual(creditLines('JANE DOE · CC BY-SA 4.0 · PIXELATED', (t) => measureText(t, 1, 'micro')), ['JANE DOE · CC BY-SA 4.0 · PIXELATED']);
    const long = new Map([['s1', { credit, uncleared: true }]]);
    const ctx = fakeCtx();
    drawPictureCredits(ctx, { shot: 'full', storyId: 's1', images, pictureCredits: long });
    const plates = ctx.fills.filter((f) => f.c === P.ink);
    assert.equal(plates.length, 2);
    assert.ok(plates.every((f) => f.x >= 13 && f.x + f.w <= 384 - 13 + 1), JSON.stringify(plates));
    // the preview tag sits under both lines
    const tag = ctx.fills.filter((f) => f.c === P.black).pop();
    assert.ok(tag.y >= plates[1].y + plates[1].h, JSON.stringify({ tag, plates }));
  });
  test('beside the montage\'s TOP STORIES tag and its pips a long credit runs on two lines, never touching it; the captions start under it (round 8)', async () => {
    const { drawHeadlineFrame } = await import('../public/js/scenes/cards.js');
    const credit = 'FILE · PRESS SERVICE OF THE PRESIDENT OF UKRAINE · CC BY 4.0 · PIXELATED';
    const rundown = [1, 2, 3, 4, 5, 6].map((i) => ({ storyId: `m${i}`, imageCredit: credit, imageLabel: 'FILE' }));
    const scene = { shot: 'montage', images: new Map([['m3', pic]]), card: { index: 2, pic: {} }, rundown };
    // the tag's own plate, as the headline frame draws it
    const frame = fakeCtx();
    drawHeadlineFrame(frame, 4, 4, { index: 2, total: 6, headline: 'A headline', source: 'X', image: null });
    const tagPlate = frame.fills.filter((f) => f.y === 25 && f.h === 11 && f.x === 13).sort((a, b) => b.w - a.w)[0];
    assert.ok(headlineTagRight(scene) >= tagPlate.x + tagPlate.w + 6, `${headlineTagRight(scene)} vs ${tagPlate.x + tagPlate.w}`);
    const ctx = fakeCtx();
    drawPictureCredits(ctx, scene);
    const plates = ctx.fills.filter((f) => f.c === P.ink);
    assert.equal(plates.length, 2, 'two lines');
    assert.ok(plates.every((f) => f.x >= tagPlate.x + tagPlate.w + 6), JSON.stringify(plates));
    assert.ok(CREDITS.bottom >= plates[1].y + plates[1].h - 1);
    // the compliance desk's AI plate lives in the top row beside the logo (graphics/bug.js): the credit is a row under it
    const { TOP } = await import('../public/js/graphics/layout.js');
    assert.ok(plates.every((f) => f.y > TOP.y + TOP.h + 1), 'never in the AI plate\'s row');
    // the full frame has the whole row: one line
    const full = fakeCtx();
    drawPictureCredits(full, { shot: 'full', storyId: 'm3', images: scene.images, rundown });
    assert.equal(full.fills.filter((f) => f.c === P.ink).length, 1);
  });
});

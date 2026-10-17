// PICTURE THIS draws its picture's licence credit while the picture shows (round 9 of the pictures desk): the cleared
// record's own credit ("FILE · AUTHOR · CC BY 4.0 · PIXELATED"), drawn as the montage draws it, under the board and
// clear of its text and of the captions; PREVIEW · NOT CLEARED in a private preview; nothing without a picture.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { quizPictureCredit } from '../public/js/quizplay.js';

function fakeCanvas(width = 384, height = 216) {
  const cv = { width, height };
  let clips = [];
  const stack = [];
  let pending = null;
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() { stack.push(clips.slice()); },
    restore() { clips = stack.pop() || []; },
    beginPath() { pending = null; },
    rect(x, y, w, h) { pending = { x, y, w, h }; },
    clip() { if (pending) clips.push(pending); },
    fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h, clips: clips.slice() }); },
    drawImage(img, ...a) {
      const r = a.length === 8 ? { sw: a[2], x: a[4], y: a[5], w: a[6], h: a[7] } : { x: a[0], y: a[1], w: img?.width || 0, h: img?.height || 0 };
      this.images.push({ img, ...r, clips: clips.slice() });
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}
/** A text image's glyph pixels as a box on the screen (font.js draws each glyph pixel as a square), or null. */
function inkOf(im) {
  const img = im.img;
  if (!img || im.sw !== undefined || typeof img.getContext !== 'function') return null;
  const f = img.getContext('2d').fills || [];
  if (!f.length || !f.every((p) => p.w === p.h && p.w <= 3)) return null;
  return { x0: im.x + Math.min(...f.map((p) => p.x)), y0: im.y + Math.min(...f.map((p) => p.y)), x1: im.x + Math.max(...f.map((p) => p.x + p.w)), y1: im.y + Math.max(...f.map((p) => p.y + p.h)), color: f[0].c };
}

const HN = 120 / 112;
const NOW = Date.parse('2026-10-17T20:20:00Z');
const URL1 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Lisbon.jpg/1280px-Lisbon.jpg';
const rights = (credit, extra = {}) => ({ source: 'wikimedia-commons', licence: 'CC-BY-4.0', author: 'Jane Doe', url: URL1, credit, cleared: true, ...extra });
const LONG = ['Lisbon opens its first new tram line in forty years', 'Council approves a budget for the city’s schools', 'Antarctic Sea Ice Grows to Its 2026 Maximum'];
const question = (extra = {}) => ({ type: 'picture', image: URL1, imageId: 's1', steps: [8, 16, 32, 64], aired: { programme: 'world-now', at: NOW - 3 * 3600_000, source: 'Reuters' }, options: LONG.map((words, i) => ({ letter: 'ABC'[i], words })), answer: 'A', ...extra });

describe('the licence credit of the picture in PICTURE THIS', () => {
  test("a cleared record's own credit and tag; PREVIEW · NOT CLEARED only in a private preview; nothing for an unshown picture", () => {
    assert.deepEqual(quizPictureCredit(question({ imageRights: rights('FILE · JANE DOE · CC BY 4.0 · PIXELATED') })), { credit: 'FILE · JANE DOE · CC BY 4.0 · PIXELATED', tag: 'FILE', uncleared: false });
    assert.equal(quizPictureCredit(question({ imageRights: rights('FILE 2023 · JANE DOE · CC BY 4.0 · PIXELATED') })).tag, 'FILE 2023');
    assert.equal(quizPictureCredit(question({ imageRights: rights('NASA/BILL INGALLS') })).tag, 'PHOTO', 'a picture of the event itself');
    assert.equal(quizPictureCredit(question({ imageRights: rights('FILE · X · CC BY 4.0', { url: 'https://upload.wikimedia.org/other.jpg' }) })), null, 'a record for another picture');
    assert.equal(quizPictureCredit(question({ imageRights: { source: 'outlet', credit: 'REUTERS', cleared: false, url: URL1 } })), null, 'never on air outside a preview');
    assert.deepEqual(quizPictureCredit(question({ imageRights: { source: 'outlet', credit: 'REUTERS', cleared: false, url: URL1 } }), { picturePreview: true }), { credit: 'REUTERS', tag: 'PHOTO', uncleared: true });
    assert.deepEqual(quizPictureCredit(question(), { picturePreview: true }), { credit: null, tag: 'PHOTO', uncleared: true });
    assert.equal(quizPictureCredit(question({ image: 'file:///srv/pictures/lisbon.jpg' })), null, "the operator's own picture");
    assert.equal(quizPictureCredit(question({ image: null })), null);
  });

  let G;
  let P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    G = await import('../public/js/scenes/cards-quiz.js');
    P = (await import('../public/js/palette.js')).P;
  });
  const draw = (dt, o) => {
    const ctx = fakeCanvas().getContext('2d');
    G.drawQuestionBoard(ctx, dt, { question: o.question, image: fakeCanvas(512, 288), players: [{ seat: 'A', name: 'LOLA' }, { seat: 'B', name: 'SAM' }], optionsAt: 1, countdown: { at: 15, dur: 7 * HN }, locks: [], revealAt: 23, now: NOW, ...o });
    return ctx;
  };
  const under = (ctx) => ctx.images.map(inkOf).filter((k) => k && k.y0 >= 135);

  for (const [label, credit, lines] of [
    ['one line', 'FILE · GAGE SKIDMORE · CC BY-SA 4.0 · PIXELATED', 1],
    ['two lines', 'FILE · PRESIDENCY OF THE REPUBLIC OF TURKEY PRESS OFFICE · CC BY 4.0 · PIXELATED', 2],
  ]) {
    test(`drawn under the board while the picture shows, clear of its text and of the captions (${label})`, () => {
      const q = question({ imageRights: rights(credit) });
      const pictureCredit = quizPictureCredit(q);
      for (const dt of [8, 16, 20.5, 23.5, 25.5]) {
        const ctx = draw(dt, { question: q, pictureCredit });
        const ink = under(ctx);
        assert.ok(ink.length >= 1 + lines, `${dt}: the tag and ${lines} line(s) of credit drawn`);
        for (const k of ink) {
          assert.ok(k.x0 >= 13 && k.x1 <= 371, `${dt}: inside x 13..371 (${k.x0}..${k.x1})`);
          assert.ok(k.y0 >= G.PICTURE_CREDIT_Y && k.y1 <= 171, `${dt}: under the board (134), over the captions (172): ${k.y0}..${k.y1}`);
        }
        // every text of the board itself still inside it
        const board = ctx.images.map(inkOf).filter((k) => k && k.y0 < 135);
        assert.ok(board.every((k) => k.y1 <= 134), `${dt}: the board's own text unmoved`);
        // legible: light type on the channel's dark plates
        assert.ok(ink.every((k) => k.color === P.fog || k.color === P.white), `${dt}: fog or white type`);
      }
    });
  }

  test('no credit before the picture is on, nor without one; PREVIEW · NOT CLEARED in a preview', () => {
    const q = question({ imageRights: rights('FILE · JANE DOE · CC BY 4.0 · PIXELATED') });
    const pictureCredit = quizPictureCredit(q);
    assert.equal(under(draw(0.05, { question: q, pictureCredit })).length, 0, 'the board still wiping in');
    assert.ok(under(draw(0.35, { question: q, pictureCredit })).length >= 2, 'up with the picture');
    assert.equal(under(draw(8, { question: q, pictureCredit, image: null })).length, 0, 'no picture, no credit');
    assert.equal(under(draw(8, { question: q })).length, 0, 'a board given no credit draws none');
    const preview = draw(8, { question: question(), pictureCredit: quizPictureCredit(question(), { picturePreview: true }) });
    const ink = under(preview);
    assert.equal(ink.length, 1);
    assert.equal(ink[0].color, P.yellow, 'PREVIEW · NOT CLEARED, in the preview yellow');
    assert.ok(ink[0].y1 <= 171);
  });
});

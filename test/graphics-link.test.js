import { test } from 'node:test';
import assert from 'node:assert/strict';

// A recording 2D context (font.js renders text offscreen through document.createElement).
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
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { drawLinkGraphics, drawFileCredit, LINK_SHOTS } = await import('../public/js/graphics/remote.js');
const { OVERLAYS } = await import('../public/js/graphics/index.js');
const { P } = await import('../public/js/palette.js');

const REMOTE = { slot: 'R1', id: 'vic', place: 'CANCÚN', desk: 'AMERICAS DESK', name: 'Vic Vector' };

test("a link's shots carry the news graphics (strap, captions) and the link's own", () => {
  for (const shot of LINK_SHOTS) assert.equal(OVERLAYS[shot], 'news', shot);
});

test('LOCATION: the place under the clock; FILE and the credit only while footage is on screen', () => {
  const ctx = fakeCtx();
  drawLinkGraphics(ctx, 10, { shot: 'location', remote: REMOTE, fileCredit: null }, P.red);
  const plain = ctx.fills.length;
  assert.ok(plain >= 2, 'the place tag (plate and accent square)');
  assert.ok(ctx.fills.some((f) => f.c === P.red && f.w === 3 && f.h === 3), 'the accent square');
  assert.ok(ctx.fills.every((f) => f.x + f.w <= 384 - 13 + 1), 'inside action-safe on the right');
  const withFile = fakeCtx();
  drawLinkGraphics(withFile, 10, { shot: 'location', remote: REMOTE, fileCredit: 'FILE · Sevenbell Production · CC BY' }, P.red);
  assert.ok(withFile.fills.length > plain, 'FILE and its credit plate');
  assert.ok(withFile.fills.some((f) => f.c === P.ink), 'the credit on its ink plate');
  assert.equal(withFile.depth, 0, 'save/restore balanced');
});

test('TWO-WAY: a label in each box (the studio’s city, the place), no FILE, no place tag under the clock', () => {
  const ctx = fakeCtx();
  drawLinkGraphics(ctx, 10, { shot: 'twoway', remote: REMOTE, fileCredit: 'FILE · X · CC BY' }, P.red);
  const plates = ctx.fills.filter((f) => f.c === P.black && f.h === 11);
  assert.equal(plates.length, 2, 'two corner labels');
  assert.ok(plates.every((f) => f.y > 100 && f.y < 145), 'in the boxes, above the strap');
  assert.ok(!ctx.fills.some((f) => f.c === P.ink), 'no FILE credit over the two-way');
});

test('nothing without a link, nor over a studio shot', () => {
  for (const scene of [{ shot: 'location', remote: null }, { shot: 'close', remote: REMOTE }, { shot: 'wide', remote: REMOTE }]) {
    const ctx = fakeCtx();
    drawLinkGraphics(ctx, 1, scene, P.red);
    assert.equal(ctx.fills.length + ctx.images, 0, JSON.stringify(scene.shot));
  }
});

test('FILE and a clip’s credit (a link’s footage, a montage frame’s): under the clock, inside action-safe', () => {
  const ctx = fakeCtx();
  drawFileCredit(ctx, 'FILE · Sevenbell Production · CC BY');
  assert.ok(ctx.fills.some((f) => f.c === P.black), 'the FILE tag');
  assert.ok(ctx.fills.some((f) => f.c === P.ink), 'the credit plate');
  assert.ok(ctx.fills.every((f) => f.y >= 21 && f.y + f.h <= 36 && f.x + f.w <= 384 - 13 + 1), JSON.stringify(ctx.fills));
});

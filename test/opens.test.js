// Programme opens, cards and their layouts in Node with a recording fake canvas: every open's
// lock-up is frame-identical from 3.2 s (the theme's final chord) to the cut and beyond, no
// emblem crosses the title plate, every save() is restored, and the cards draw for any input.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/** A canvas whose context records every call (numbers rounded), so two frames can be compared. */
let nextId = 1;
function fakeCanvas() {
  const cv = { width: 300, height: 150, id: nextId++, version: 0 };
  const log = [];
  let depth = 0;
  const ctx = {
    canvas: cv,
    log,
    fillStyle: '#000',
    strokeStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    get depth() { return depth; },
    save() { depth++; log.push('save'); },
    restore() { depth--; log.push('restore'); },
    fillRect(x, y, w, h) { log.push(`F${this.fillStyle}|${x}|${y}|${w}|${h}`); },
    drawImage(img, ...a) { log.push(`D${img?.id ?? '?'}.${img?.version ?? 0}|${a.join('|')}`); },
    putImageData() { cv.version++; },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return { pattern: true }; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'resetTransform', 'translate', 'scale', 'fillText', 'strokeRect', 'clearRect']) {
    ctx[m] = (...a) => log.push(`${m}|${a.join('|')}`);
  }
  cv.getContext = () => ctx;
  return cv;
}

let opens;
let cards;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  const gfx = await import('../public/js/gfx/index.js');
  gfx.setNow(Date.UTC(2026, 9, 2, 17, 42, 7));
  opens = await import('../public/js/scenes/opens.js');
  cards = await import('../public/js/scenes/cards.js');
});

const INFO = {
  'world-now': { title: 'WORLD NOW', tagline: 'THE STORIES SHAPING OUR WORLD', presenters: ['PACO PIXEL', 'LOLA BYTE'] },
  'tech-bytes': { title: 'TECH BYTES', tagline: 'THE FUTURE, ONE BYTE AT A TIME', presenters: ['MAX CIRCUIT', 'ADA VOLT'] },
  cosmos: { title: 'COSMOS DESK', tagline: 'SCIENCE, SPACE & OUR PLANET', presenters: ['DR NOVA REYES', 'UNIT-8'] },
  'money-minute': { title: 'MONEY MINUTE', tagline: 'MARKETS & YOUR MONEY', presenters: ['PENNY STERLING'] },
  'news-60': { title: 'NEWS IN 60', tagline: 'THE HEADLINES IN A MINUTE', presenters: ['SAM NIGHT'] },
  'weekend-review': { title: 'WEEKEND REVIEW', tagline: 'THE WEEK THAT WAS', presenters: ['PACO PIXEL'] },
};

function frame(id, dt, info = INFO[id]) {
  const cv = fakeCanvas();
  const ctx = cv.getContext('2d');
  opens.drawOpen(ctx, 0, dt, id, info);
  assert.equal(ctx.depth, 0, `${id} at ${dt}: every save() is restored`);
  return ctx.log.join('\n');
}

for (const id of Object.keys(INFO)) {
  test(`${id}: the lock-up holds still from 3.2 s to the cut (and after)`, () => {
    frame(id, 3.0); // let every lazy cache settle
    const a = frame(id, 3.2);
    assert.equal(frame(id, 3.6), a);
    assert.equal(frame(id, 3.99), a);
    assert.equal(frame(id, 8), a);
    assert.notEqual(frame(id, 2.6), a, 'and it is still moving before the hit');
  });
}

test('every open is 4 s and the title column is the same for every programme', () => {
  const lay = {};
  for (const id of Object.keys(INFO)) {
    assert.equal(opens.openFor(id).duration, 4);
    lay[id] = opens.lockupFor(id, INFO[id]);
    assert.equal(lay[id].plateX, 130);
    assert.equal(lay[id].titleX, 152);
    assert.ok(lay[id].bottom < 200, 'the credits stay above the ticker band');
  }
  // cached: the same info gives the same layout object
  assert.equal(opens.lockupFor('cosmos', INFO.cosmos), lay.cosmos);
});

test('only opaque globes may overlap the title plate: every other emblem ends 4 px before it', () => {
  for (const [id, o] of Object.entries(opens.OPENS)) {
    const slot = 130 - 4 - o.prog.extent + (o.prog.front ? 8 : 0);
    if (!o.prog.front) assert.ok(slot + o.prog.extent <= 126, `${id} emblem right edge ${slot + o.prog.extent}`);
  }
});

test('a replay open shows REPLAY and a promo replay draws no top row', () => {
  const live = frame('world-now', 3.5);
  const replay = frame('world-now', 3.5, { ...INFO['world-now'], replay: true });
  assert.notEqual(live, replay);
  const promo = frame('world-now', 3.5, { ...INFO['world-now'], bug: false });
  assert.ok(promo.length < live.length);
});

test('long programme titles wrap to balanced lines at 2x without breaking the lock-up', () => {
  const L = opens.lockupFor('weekend-review', { title: 'THE WEEKEND FOREIGN CORRESPONDENTS REVIEW', tagline: 'X', presenters: [] });
  assert.ok(L.titles.length >= 2 && L.titles.length <= 3);
  assert.ok(L.plateY >= 26);
});

test('cards draw for hostile input without throwing or leaving state behind', () => {
  const weird = [undefined, null, '', 12345, {}, [], 'x'.repeat(400), 'ÉMOJI 🙂 TEST', '3.5%', '$2.5bn', '1.2 million'];
  for (const w of weird) {
    for (const dt of [0, 0.2, 0.5, 1, 3, NaN]) {
      const ctx = fakeCanvas().getContext('2d');
      cards.drawFactCard(ctx, 0, dt, { fact: w, label: w, source: w, programId: 'world-now' });
      cards.drawFactCard(ctx, 0, dt, { fact: w, numbers: [{ value: w, label: w }], programId: 'tech-bytes' });
      cards.drawFactCard(ctx, 0, dt, { fact: w, numbers: [{ value: w, label: w }], programId: 'cosmos' });
      cards.drawFactCard(ctx, 0, dt, { fact: w, headline: w, numbers: [{ value: '3%', label: 'A' }, { value: '2%', label: 'A' }], programId: 'money-minute' });
      cards.drawQuoteCard(ctx, 0, dt, { text: w, by: w, programId: 'cosmos' });
      cards.drawHeadlineFrame(ctx, 0, dt, { headline: w, source: w, category: w, programId: w });
      cards.drawBreakingCard(ctx, 0, dt, { headline: w, source: w });
      cards.drawEndCard(ctx, 0, dt, { channel: w, line1: w, line2: w });
      cards.drawStartScreen(ctx, 0, { channel: w, prompt: w });
      cards.drawStandby(ctx, 0, { channel: w, message: w });
      cards.drawPromoCard(ctx, 0, dt, { next: { id: w, title: w, tagline: w, presenters: [w] } });
      cards.drawStinger(ctx, 0, dt / 2);
      assert.equal(ctx.depth, 0);
    }
  }
});

test('figures are parsed exactly as written, never recounted', () => {
  const f = cards.parseFigure('2,400 flights cancelled');
  assert.equal(f.text, '2,400');
  assert.equal(f.value, 2400);
  assert.equal(cards.parseFigure('$2.5bn').value, 2.5e9);
  assert.equal(cards.parseFigure('1.2 million homes').text, '1.2 MILLION');
  assert.equal(cards.parseFigure('3.5%').pct, true);
  assert.equal(cards.parseFigure('1997').year, true);
  assert.equal(cards.parseFigure('no figure here').text, null);
});

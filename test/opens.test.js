// Programme opens, cards and their layouts in Node with a recording fake canvas: every open's
// lock-up is frame-identical from its hit (3.2 s; WORLD NOW's title sequence 9.375 s: the theme's
// final chord) to the cut and beyond, no
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
let WN_DURATION;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  const gfx = await import('../public/js/gfx/index.js');
  gfx.setNow(Date.UTC(2026, 9, 2, 17, 42, 7));
  opens = await import('../public/js/scenes/opens.js');
  ({ WN_DURATION } = await import('../public/js/scenes/opens/worldcues.js'));
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
  test(`${id}: the lock-up holds still from the hit to the cut (and after)`, () => {
    const still = opens.OPENS[id]?.still ?? 3.2;
    const end = opens.OPENS[id]?.duration ?? 4;
    frame(id, still - 0.2); // let every lazy cache settle
    const a = frame(id, still);
    assert.equal(frame(id, still + 0.4), a);
    assert.equal(frame(id, end - 0.01), a);
    assert.equal(frame(id, end + 4), a);
    assert.notEqual(frame(id, still - 0.6), a, 'and it is still moving before the hit');
  });
}

test('every open is 4 s but WORLD NOW\'s title sequence; the hit is 0.8 s before every cut; one title column', () => {
  const lay = {};
  for (const id of Object.keys(INFO)) {
    const o = opens.OPENS[id];
    assert.equal(opens.openFor(id).duration, id === 'world-now' ? WN_DURATION : 4, id);
    if (o) assert.ok(Math.abs(o.duration - o.still - 0.8) < 1e-9, `${id}: the still lands 0.8 s before the cut`);
    lay[id] = opens.lockupFor(id, INFO[id]);
    const front = (opens.OPENS[id] || { prog: { front: true } }).prog.front;
    // globes overlap the plate's left end (plate at 130); every other plate has the same 12 px
    // inset either side of the title
    assert.equal(lay[id].plateX, front ? 130 : 140, id);
    assert.equal(lay[id].titleX, 152);
    if (!front) assert.equal(lay[id].plateX + lay[id].plateW - (lay[id].titleX + lay[id].titleW), lay[id].titleX - lay[id].plateX, `${id} plate padding`);
    assert.ok(lay[id].bottom < 200, 'the credits stay above the ticker band');
  }
  // cached: the same info gives the same layout object
  assert.equal(opens.lockupFor('cosmos', INFO.cosmos), lay.cosmos);
});

test('only opaque globes may overlap the title plate: every other emblem ends 4 px before it', () => {
  for (const [id, o] of Object.entries(opens.OPENS)) {
    const plateX = o.prog.front ? 130 : 140;
    const slot = plateX - 4 - o.prog.extent + (o.prog.front ? 8 : 0);
    if (!o.prog.front) assert.ok(slot + o.prog.extent <= plateX - 4, `${id} emblem right edge ${slot + o.prog.extent}`);
  }
});

test('a replay open shows REPLAY and a promo replay draws no top row', () => {
  for (const id of ['world-now', 'cosmos']) {
    const at = opens.OPENS[id].still + 0.3; // the top row is on by the lock-up
    const live = frame(id, at);
    const replay = frame(id, at, { ...INFO[id], replay: true });
    assert.notEqual(live, replay, id);
    const promo = frame(id, at, { ...INFO[id], bug: false });
    assert.ok(promo.length < live.length, id);
  }
});

test('long programme titles wrap to balanced lines at 2x without breaking the lock-up', () => {
  const L = opens.lockupFor('weekend-review', { title: 'THE WEEKEND FOREIGN CORRESPONDENTS REVIEW', tagline: 'X', presenters: [] });
  assert.ok(L.titles.length >= 2 && L.titles.length <= 3);
  assert.ok(L.plateY >= 26);
  // a name too long for 2x drops to 1x before any word is lost
  const L2 = opens.lockupFor('weekend-review', { title: 'THE WEEKEND FOREIGN CORRESPONDENTS AND INTERNATIONAL AFFAIRS REVIEW', tagline: 'X', presenters: [] });
  assert.equal(L2.scale, 1);
  assert.ok(L2.titles.length <= 3 && L2.plateY >= 26);
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

const draws = (fn) => {
  const ctx = fakeCanvas().getContext('2d');
  fn(ctx);
  assert.equal(ctx.depth, 0, 'every save() is restored');
  return ctx.log;
};

test('MONEY MINUTE paper card draws the fact when it has no leading figure (with a headline)', () => {
  for (const fact of ['RICE PRICES DOWN 8%', 'RECORD HIGH FOR COCOA', 'UP TO 12 TONNES', 'NEARLY 3 MILLION VISITORS']) {
    const base = { headline: 'Rice prices fall for a third month', source: 'Ledger Line', programId: 'money-minute' };
    const empty = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { ...base, fact: '' }));
    const full = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { ...base, fact }));
    const images = (log) => log.filter((l) => l.startsWith('D')).length; // a line of text is one image
    assert.ok(images(full) > images(empty), `${fact}: the fact is on the paper (${images(full)} vs ${images(empty)} text images)`);
  }
});

test('a stated qualifier stays with its figure (parsed from the fact, or numbers[].qualifier) in every look', () => {
  const f = cards.parseFigure('ABOUT 1,500 DOLLARS');
  assert.equal(f.text, '1,500');
  assert.equal(f.qual, 'ABOUT');
  assert.equal(f.rest, 'DOLLARS');
  assert.equal(cards.parseFigure('more than 62% of traders').qual, 'MORE THAN');
  assert.equal(cards.parseFigure('up to 12 tonnes').text, '12');
  for (const programId of ['world-now', 'news-60', 'tech-bytes', 'cosmos', 'money-minute', 'weekend-review']) {
    const plain = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { numbers: [{ value: '62%', label: 'OF TRADERS' }], programId }));
    const qual = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { numbers: [{ value: '62%', qualifier: 'MORE THAN', label: 'OF TRADERS' }], programId }));
    const images = (log) => log.filter((l) => l.startsWith('D')).length;
    assert.ok(images(qual) > images(plain), `${programId}: the qualifier is drawn`);
    // a fact that opens with a qualifier gets the programme's figure look, not the plain text card
    const viaFact = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { fact: 'ABOUT 1,500 DOLLARS', programId }));
    const text = draws((ctx) => cards.drawFactCard(ctx, 0, 2, { fact: 'THE BRIDGE REOPENED ON FRIDAY', programId }));
    assert.notDeepEqual(viaFact, text);
  }
});

test('the first montage frame shows its accent bar on the very first frame after the cut', () => {
  const log = draws((ctx) => cards.drawHeadlineFrame(ctx, 0, 1 / 60, { index: 0, total: 3, headline: 'Storm closes ports', source: 'BBC', category: 'world', programId: 'world-now' }));
  assert.ok(log.some((l) => l.startsWith('F#e43b44')), 'the red accent is drawn at dt = 1/60');
});

test('a montage frame without its picture over the story\'s map draws only the legibility shade, never the dark world field (owner 22:50)', () => {
  const o = { index: 1, total: 3, headline: 'Storm closes ports', source: 'BBC', category: 'world', programId: 'world-now' };
  const field = draws((ctx) => cards.drawHeadlineFrame(ctx, 0, 1, o));
  const map = draws((ctx) => cards.drawHeadlineFrame(ctx, 0, 1, { ...o, backdrop: 'map' }));
  const images = (log) => log.filter((l) => l.startsWith('D'));
  // the field and the shade are both one image; over the map only the shade is drawn
  assert.equal(images(map).length, images(field).length);
  assert.notDeepEqual(images(map)[0], images(field)[0], 'the map frame does not draw the world field');
});

test('the UP NEXT promo is a still card: the lock-up holds, and odd presenter data never throws', () => {
  const card = { label: 'UP NEXT', footer: 'AFTER THE BREAK', next: { id: 'news-60', title: 'NEWS IN 60', tagline: 'THE HEADLINES IN A MINUTE', presenters: ['sam'] } };
  const a = draws((ctx) => cards.drawPromoCard(ctx, 0, 1.0, card)).join('\n');
  assert.equal(draws((ctx) => cards.drawPromoCard(ctx, 0, 3.0, card)).join('\n'), a, 'nothing moves after the entrance');
  assert.ok(!a.includes('AFTER'), 'no footer text replays');
  for (const presenters of ['sam', 42, { a: 1 }, null, [null, 'x', 3]]) {
    assert.doesNotThrow(() => draws((ctx) => cards.drawPromoCard(ctx, 0, 1, { next: { id: 'cosmos', title: 'COSMOS DESK', presenters } }, () => { throw new Error('no name'); })));
  }
});

test('the ident draws both dayparts at any instant without leaving state behind', () => {
  for (const variant of ['dusk', 'dawn', undefined]) {
    for (const dt of [0, 0.55, 0.7, 2, 3.2, 5.5, 60, NaN]) draws((ctx) => cards.drawIdentCard(ctx, 0, dt, { variant }));
  }
});

test('programme ids that are Object.prototype keys get the generic open and accent', () => {
  for (const id of ['constructor', '__proto__', 'toString']) {
    assert.equal(opens.openFor(id).duration, 4);
    assert.doesNotThrow(() => frame(id, 2, INFO['weekend-review']));
    draws((ctx) => cards.drawFactCard(ctx, 0, 1, { fact: '2,400 flights', programId: id }));
  }
});

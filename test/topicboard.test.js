// The topic board (public/js/graphics/topicboard.js): what a story with neither a cleared picture nor a place shows
// behind its headline. Its topic as a pixel glyph and a named plate in the upper right, clear of the TOP STORIES tag
// and the headline block; under a grave story or a story of crime, no glyph (never a cartoon under a death or a charge).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

function fakeCanvas() {
  const ops = [];
  const cv = { width: 300, height: 150, ops };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    drawImage(src) {
      ops.push({ op: 'image', src });
    },
    fillRect(x, y, w, h) {
      ops.push({ op: 'fill', x, y, w, h, c: this.fillStyle });
    },
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
  };
  cv.getContext = () => ctx;
  return cv;
}

let mod;
let P;
before(async () => {
  globalThis.document ??= { createElement: fakeCanvas };
  mod = await import('../public/js/graphics/topicboard.js');
  P = (await import('../public/js/palette.js')).P;
});

describe('the topic', () => {
  test('the headline names it; the section decides otherwise', () => {
    assert.deepEqual(mod.topicOf({ headline: 'Elorian’s first AI model wants to reason with images', category: 'tech' }), { glyph: 'chip', label: 'ARTIFICIAL INTELLIGENCE' });
    assert.equal(mod.topicOf({ headline: 'Neutron’s first launch slips again', category: 'science' }).glyph, 'rocket');
    assert.equal(mod.topicOf({ headline: 'Scientists uncover a hidden map of the brain', category: 'science' }).glyph, 'flask');
    assert.equal(mod.topicOf({ headline: 'Driving test waits fall to two-year low', category: 'business' }).glyph, 'car');
    assert.equal(mod.topicOf({ headline: 'Heating oil customers face tough winter', category: 'business' }).glyph, 'bolt');
    assert.equal(mod.topicOf({ headline: 'Epic is bringing Fortnite to Linux', category: 'tech' }).glyph, 'gamepad');
    assert.equal(mod.topicOf({ headline: 'Surprise GDP growth as UK economy stronger than thought', category: 'business' }).glyph, 'chart');
    assert.deepEqual(mod.topicOf({ headline: 'KDE turns 30 with Plasma 6.8', category: 'tech' }), { glyph: 'chip', label: 'TECH' });
    assert.deepEqual(mod.topicOf({ headline: 'Something happened', category: '' }), { glyph: 'paper', label: 'NEWS' });
  });
  test('a grave story or a story of crime: no glyph, the section only', () => {
    assert.deepEqual(mod.topicOf({ headline: 'Horrified witnesses recount fatal rollercoaster incident', category: 'world', grave: true }), { glyph: null, label: 'WORLD' });
    assert.equal(mod.topicOf({ headline: 'DNA, vehicle-tracking help investigators recover stolen Renoirs', category: 'world' }).glyph, null, 'not a science story');
    assert.equal(mod.topicOf({ headline: 'Emergency calls from botched Christa Pike execution released', category: 'world' }).glyph, null);
    assert.equal(mod.topicOf({ headline: 'Roofing scammers con homeowners out of thousands', category: 'money' }).glyph, null);
  });
  test('every glyph is 16 by 16 in the board\'s own letters', () => {
    for (const [name, rows] of Object.entries(mod.GLYPHS)) {
      assert.equal(rows.length, 16, name);
      for (const r of rows) assert.match(r, /^[#.+o ]{16}$/, `${name}: "${r}"`);
    }
  });
});

describe('the board', () => {
  const draw = (item, dt = 9) => {
    const cv = fakeCanvas();
    const ctx = cv.getContext();
    const topic = mod.drawTopicBoard(ctx, item, { accent: P.blue, dt });
    return { ops: cv.ops, topic };
  };
  test('the field, the rings, the glyph in the accent and the plate, in the upper right clear of the tag and the headline', () => {
    const { ops, topic } = draw({ headline: 'Elorian’s first AI model wants to reason with images', category: 'tech' });
    assert.equal(topic.glyph, 'chip');
    assert.equal(ops[0].op, 'image', 'the field first');
    const fills = ops.filter((o) => o.op === 'fill');
    assert.ok(fills.some((f) => f.c === P.blue && f.w === 4), 'the accent pixels of the glyph');
    assert.ok(fills.some((f) => f.c === P.blue && f.w === 2), 'the plate\'s accent bar');
    const big = fills.filter((f) => f.w >= 4);
    assert.ok(big.every((f) => f.x >= 13 && f.x + f.w <= 384 - 13 && f.y >= 25 && f.y + f.h <= 120), JSON.stringify(big.find((f) => !(f.x >= 13 && f.x + f.w <= 371 && f.y >= 25 && f.y + f.h <= 120))));
  });
  test('it builds in: nothing of the glyph before 0.15 s, all of it by 0.5 s', () => {
    const at = (dt) => draw({ headline: 'Elorian’s first AI model', category: 'tech' }, dt).ops.filter((o) => o.op === 'fill' && o.w === 4 && o.c !== P.black).length;
    assert.equal(at(0.1), 0);
    assert.ok(at(0.3) > 0 && at(0.3) < at(0.6));
    assert.equal(at(0.6), at(5));
  });
  test('a grave story: the rings and the section\'s plate, no glyph', () => {
    const { ops, topic } = draw({ headline: 'Man who died in rollercoaster fall was a father', category: 'world', grave: true });
    assert.equal(topic.glyph, null);
    assert.ok(!ops.some((o) => o.op === 'fill' && o.w === 4 && o.c !== P.black), 'no glyph pixel');
  });
});

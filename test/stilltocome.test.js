import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBulletin } from '../server/writer.js';
import { loadChannel } from '../server/channel.js';

// STILL TO COME (WORLD NOW round 2): the mid-programme signpost shows the later stories it names, the first from
// the cut, the second as the presenter names it.

const CHANNEL = loadChannel();
const WN = { id: 'world-now', ...CHANNEL.programs['world-now'] };
const DUO = { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } };
const story = (id, title, summary, extra = {}) => ({ id, title, summary, source: 'Pixelburg Post', category: 'world', image: null, ...extra });
const STORIES = [
  story('a1', 'Norway raises interest rates', 'Norway’s central bank has raised its main interest rate to 4.75 percent.'),
  story('a2', 'Carmaker to close Turin plant', 'A carmaker says it will close its plant near Turin by the end of next year.'),
  story('a3', 'Lisbon opens a new tram line', 'Lisbon has opened a new tram line along the Tagus river with 40,000 riders a day.'),
  story('a4', 'Ferry fire kills passengers off Crete', 'A fire on a ferry off Crete has killed several passengers, the coastguard says.'),
  story('a5', 'Coral recovers on parts of Great Barrier Reef', 'Scientists say coral cover has grown on parts of the Great Barrier Reef for a second year.'),
];
const seg = (id, anchor, text, extra = {}) => ({ type: 'story', storyId: id, anchor, emotion: 'neutral', headline: STORIES.find((s) => s.id === id).title, text, shot: 'wide', ...extra });
const run = (signpost, { before = 1 } = {}) => {
  const body = [
    seg('a1', 'A', 'Norway’s central bank has raised its main interest rate to 4.75 percent.'),
    seg('a2', 'B', 'A carmaker says it will close its plant near Turin by the end of next year.'),
  ];
  const later = [
    seg('a3', 'A', 'Lisbon has opened a new tram line along the Tagus river, with 40,000 riders a day.'),
    seg('a4', 'B', 'A fire on a ferry off Crete has killed several passengers, the coastguard says.', { emotion: 'serious' }),
    seg('a5', 'A', 'And finally: scientists say coral cover has grown on parts of the Great Barrier Reef for a second year.', { feature: 'lighter' }),
  ];
  const segments = [...body.slice(0, before + 1), { type: 'chat', anchor: 'B', emotion: 'neutral', text: signpost }, ...body.slice(before + 1), ...later];
  return normalizeBulletin(
    { title: 'T', segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' }, ...segments, { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW." }] },
    STORIES,
    { program: WN, presenters: DUO, maxStories: 14, maxChats: 6, features: ['lighter'] }
  );
};
const signpostOf = (b) => b.segments.find((s) => s.type === 'chat' && /^Still to come/i.test(s.text));

describe('the signpost names its stories (writer)', () => {
  test('two later stories, each with where its words start', () => {
    const sp = signpostOf(run('Still to come: coral recovers on the Great Barrier Reef, and Lisbon opens its new tram line.'));
    assert.ok(sp, 'the signpost airs');
    assert.deepEqual(sp.stillToCome.map((x) => x.storyId), ['a5', 'a3']);
    assert.equal(sp.stillToCome[0].char, 0, 'the first from the line’s start');
    assert.equal(sp.text.slice(sp.stillToCome[1].char, sp.stillToCome[1].char + 6), 'Lisbon');
  });

  test('never a grave story, never one already aired, never a line that is no signpost', () => {
    const grave = signpostOf(run('Still to come: the ferry fire off Crete, and coral on the Great Barrier Reef.'));
    assert.deepEqual(grave.stillToCome.map((x) => x.storyId), ['a5'], 'the ferry fire is not shown');
    const aired = signpostOf(run('Still to come: the Turin carmaker plant closure.', { before: 1 }));
    assert.equal(aired?.stillToCome, undefined, 'the Turin story aired before the line');
    const b = run('Coral on the Great Barrier Reef is a story to watch.');
    assert.ok(!b.segments.some((s) => s.stillToCome), 'a chat that is no signpost');
  });
});

/** A canvas whose context records fills and keeps save/restore depth (font.js draws text offscreen). */
function fakeCanvas() {
  const cv = { width: 300, height: 150 };
  const ctx = {
    canvas: cv,
    fills: [],
    depth: 0,
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() { this.depth++; },
    restore() { this.depth--; },
    fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h }); },
    drawImage() {},
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

describe('the STILL TO COME frames (cards.js)', () => {
  let cards, P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas() };
    cards = await import('../public/js/scenes/cards.js');
    ({ P } = await import('../public/js/palette.js'));
  });
  const items = [
    { headline: 'Coral recovers on parts of Great Barrier Reef', category: 'climate', image: null, lat: -18.3, lon: 147.7, place: 'QUEENSLAND, AUSTRALIA' },
    { headline: 'Carmaker to close Turin plant', category: 'business', image: null, lat: 45.07, lon: 7.69, place: 'TURIN, ITALY' },
  ];
  const { TEASE_TILE: T } = { TEASE_TILE: { w: 168, h: 84, y: 78, x: [19, 197] } };
  const inTile = (f, k) => f.x >= T.x[k] && f.x < T.x[k] + T.w && f.y >= T.y && f.y < T.y + T.h;

  test('two stories: both tiles from the cut, the second dimmed until named, then lit (its accent rule grows)', () => {
    assert.deepEqual(cards.TEASE_TILE, T);
    const ctx = fakeCanvas().getContext('2d');
    cards.drawStillToCome(ctx, 10, 2, { items, shown: [0, -Infinity], programId: 'world-now' });
    const dim = ctx.fills.filter((f) => inTile(f, 1) && /rgba/.test(f.c));
    assert.ok(dim.length >= 1, 'the shade over the story not yet named');
    assert.ok(!ctx.fills.some((f) => inTile(f, 0) && /rgba/.test(f.c)), 'the first story is lit from the cut');
    assert.ok(!ctx.fills.some((f) => f.c === P.red && f.x === T.x[1] && f.y === T.y + T.h + 5), 'no accent rule beside the second headline yet');
    assert.equal(ctx.depth, 0);
    const lit = fakeCanvas().getContext('2d');
    cards.drawStillToCome(lit, 12, 4, { items, shown: [0, 1.5], programId: 'world-now' });
    assert.ok(!lit.fills.some((f) => inTile(f, 1) && /rgba/.test(f.c)), 'named: lit');
    assert.ok(lit.fills.some((f) => f.c === P.red && f.x === T.x[1] && f.y === T.y + T.h + 5), 'its accent rule');
    // a story with no picture: its place on the tile's dot map, the pin at the centre
    assert.ok(lit.fills.some((f) => f.c === P.white && f.w === 3 && f.h === 3 && f.x === T.x[1] + T.w / 2 - 1), 'the pin');
    assert.equal(lit.depth, 0);
  });

  test('one story: the montage’s headline frame under STILL TO COME, without the montage’s pips', () => {
    const one = fakeCanvas().getContext('2d');
    cards.drawHeadlineFrame(one, 10, 2, { headline: 'Coral recovers', category: 'climate', tag: 'STILL TO COME', pips: false, tagIn: true, programId: 'world-now' });
    assert.ok(!one.fills.some((f) => f.y === 29 && f.h === 3 && f.w === 9), 'no pips');
    const montage = fakeCanvas().getContext('2d');
    cards.drawHeadlineFrame(montage, 10, 2, { index: 1, total: 3, headline: 'Coral recovers', category: 'climate', programId: 'world-now' });
    assert.equal(montage.fills.filter((f) => f.y === 29 && f.h === 3 && f.w === 9).length, 3, 'the montage keeps its pips');
    assert.equal(one.depth, 0);
  });
});

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBulletin, KNOWN_MAX } from '../server/writer.js';
import { knownPoints } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { numbersBoard, knownBoard, factText, factHold, paceFor } from '../public/js/pace.js';

// WORLD NOW's boards (round 2): BY THE NUMBERS when a story states two or three figures, WHAT WE KNOW (the
// writer's grounded key points) otherwise; never a figure the presenter does not say.

const CHANNEL = loadChannel();
const WN = { id: 'world-now', ...CHANNEL.programs['world-now'] };
const DUO = { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } };
const SOURCE =
  'Stations across Germany were almost empty on Thursday as rail workers began a strike over pay. The operator says only one in five long-distance trains is running, and unions say talks over pay have stalled. ' +
  'About 1.2 million commuters were affected, the operator said.';
const STORY = { id: 'g1', title: 'Rail strike halts most trains across Germany', summary: SOURCE, source: 'Ledger Line', category: 'business', image: null };
const run = (known, text = 'Stations across Germany were almost empty on Thursday as rail workers began a strike over pay. The operator says only one in five long-distance trains is running.') =>
  normalizeBulletin(
    {
      title: 'T',
      segments: [
        { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' },
        { type: 'story', storyId: 'g1', anchor: 'A', emotion: 'neutral', headline: STORY.title, text, shot: 'wide', known },
        { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW." },
      ],
    },
    [STORY],
    { program: WN, presenters: DUO, maxStories: 14 }
  ).segments.find((s) => s.storyId === 'g1');

describe('WHAT WE KNOW points (writer)', () => {
  test('grounded short statements air; a question, a quote, an invention or a long point never does', () => {
    const seg = run([
      'Only one in five trains is running',
      'Unions say talks over pay have stalled',
      'Is the government to blame?',
      'The strike will last a month',
      'Rail workers began a strike over pay on Thursday across the whole country of Germany',
    ]);
    assert.deepEqual(seg.known, ['Only one in five trains is running', 'Unions say talks over pay have stalled'], 'the month is invented');
    assert.ok(seg.known.every((k) => k.length <= KNOWN_MAX));
  });

  test('a point whose figure the presenter does not say is dropped; fewer than two points, no board', () => {
    const seg = run(['About 1.2 million commuters were affected', 'Unions say talks over pay have stalled', 'Stations across Germany were almost empty']);
    assert.deepEqual(seg.known, ['Unions say talks over pay have stalled', 'Stations across Germany were almost empty'], 'the 1.2 million is in the source, not in the story text');
    assert.equal(run(['Unions say talks over pay have stalled']).known, undefined);
    const other = normalizeBulletin(
      { title: 'T', segments: [{ type: 'story', storyId: 'g1', anchor: 'A', emotion: 'neutral', headline: STORY.title, text: SOURCE, shot: 'wide', known: ['Unions say talks over pay have stalled', 'Stations across Germany were almost empty'] }] },
      [STORY],
      { program: { id: 'news-60', ...CHANNEL.programs['news-60'] }, presenters: DUO }
    );
    assert.equal(other.segments.find((s) => s.storyId === 'g1').known, undefined, 'only a programme with the board');
  });

  test('the fallback writer finds them in the source: short clauses, attribution off, nothing that leans on another line', () => {
    assert.deepEqual(knownPoints(["Mexico’s civil protection agency says about 1.2 million homes are without power and 40,000 people have gone to shelters."]), ['About 1.2 million homes are without power', '40,000 people have gone to shelters']);
    assert.deepEqual(knownPoints(['Prices are rising faster than it expected, the bank said.', '“This is serious,” the agency said.', 'Is it over?']), []);
    assert.deepEqual(knownPoints(['Nearby roads were closed, officials said.', 'Flights are not affected.']), ['Nearby roads were closed', 'Flights are not affected']);
    // a claim keeps whose word it is, or stays off the board: never the minister's reason as the channel's fact
    assert.deepEqual(knownPoints(['Geffray said the closures were a security precaution.', 'Nearby roads were closed as a precaution, officials said.']), []);
    assert.deepEqual(knownPoints(['Unions say talks over pay have stalled.']), ['Unions say talks over pay have stalled']);
  });
});

describe('which board a story gets (pace.js)', () => {
  const nums = [{ value: '1,000', label: 'DRONES' }, { value: '200,000', label: 'PEOPLE', qualifier: 'ABOUT' }];
  test('two or three figures: BY THE NUMBERS (never the number of the day, which keeps its own card)', () => {
    assert.deepEqual(numbersBoard({ numbers: nums }, 'world-now'), nums);
    assert.equal(numbersBoard({ numbers: nums.slice(0, 1) }, 'world-now'), null);
    assert.equal(numbersBoard({ numbers: nums, feature: 'number' }, 'world-now'), null);
    assert.equal(numbersBoard({ numbers: [...nums, nums[0]] }, 'world-now').length, 2, 'one row per value');
    assert.equal(numbersBoard({ numbers: nums }, 'news-60'), null, 'only where the profile asks for it');
  });

  test('the hold reads the whole board, within the card window', () => {
    const S = paceFor('world-now').shots;
    const known = { known: ['Only one in five services is running', 'Unions say talks over pay have stalled'] };
    assert.deepEqual(knownBoard(known, 'world-now'), known.known);
    assert.equal(factText({ numbers: nums, fact: '1,000 DRONES' }, 'world-now'), '1,000 DRONES ABOUT 200,000 PEOPLE');
    assert.equal(factText({ ...known, fact: 'X' }, 'world-now'), known.known.join(' '));
    const h = factHold(factText(known, 'world-now'), 'world-now');
    assert.ok(h >= S.factMin && h <= S.factMax);
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

describe('the WHAT WE KNOW card (cards.js)', () => {
  let cards, P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas() };
    cards = await import('../public/js/scenes/cards.js');
    ({ P } = await import('../public/js/palette.js'));
  });
  const known = ['Only one in five services is running', 'Unions say talks over pay have stalled', 'Flights are not affected'];
  const squares = (ctx) => ctx.fills.filter((f) => f.c === P.red && f.w === 3 && f.h === 3);

  test('one point after another, each beside an accent square, inside the card area (y 26-134)', () => {
    const early = fakeCanvas().getContext('2d');
    cards.drawFactCard(early, 10, 0.5, { known, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(squares(early).length, 1, 'the first point only, half a second in');
    const late = fakeCanvas().getContext('2d');
    cards.drawFactCard(late, 10, 3, { known, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(squares(late).length, 3);
    const panel = late.fills.find((f) => f.c === P.black && f.w > 200);
    assert.ok(panel && panel.y >= 26 && panel.y + panel.h <= 134, JSON.stringify(panel));
    assert.equal(late.depth, 0);
  });
});

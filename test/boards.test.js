import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBulletin, normalizeTimeline, normalizeChange, KNOWN_MAX, TIMELINE_MAX } from '../server/writer.js';
import { knownPoints, timelinePoints, changeFrom } from '../server/providers/mock.js';
import { loadChannel } from '../server/channel.js';
import { numbersBoard, knownBoard, timelineBoard, changeBoard, storyBoard, factText, factHold, paceFor } from '../public/js/pace.js';

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

// HOW WE GOT HERE (boards round 3): a story with a history gets its dated steps on a board, two or three in date order,
// every date and step the source's own; one board a story (WHAT WE KNOW first).
describe('HOW WE GOT HERE steps (writer)', () => {
  const SRC = 'Officials closed the Haverford Bridge on Monday. In 2019, the bridge was declared unsafe, officials said. Repairs began in March 2023. Engineers found new cracks in 2025. Traffic is being sent through the old tunnel. The city will reopen it in 2027.';
  test('dates the source states, in order, one a date; a plan, an invented date or a long step never airs', () => {
    const steps = normalizeTimeline(
      [
        { when: 'March 2023', what: 'Repairs began' },
        { when: '2019', what: 'The bridge was declared unsafe' },
        { when: '2027', what: 'The bridge reopens' },
        { when: '2021', what: 'A flood hit the city' },
        { when: '2025', what: 'Engineers found new cracks on the eastern and western spans of the bridge' },
        { when: 'in 2019', what: 'The bridge was closed again' },
      ],
      SRC,
      [],
      2026,
    );
    assert.deepEqual(steps, [{ when: '2019', what: 'The bridge was declared unsafe' }, { when: 'March 2023', what: 'Repairs began' }]);
    assert.ok(steps.every((p) => p.what.length <= TIMELINE_MAX));
    assert.equal(normalizeTimeline([{ when: '2019', what: 'The bridge was declared unsafe' }], SRC, [], 2026), null, 'one step is no timeline');
    assert.equal(normalizeTimeline([{ when: 'yesterday', what: 'Repairs began' }, { when: '2019', what: 'The bridge was declared unsafe' }], SRC, [], 2026), null, 'a date is a year');
  });

  test('the fallback writer reads them from the article: the date and the attribution off, never a span, a plan or a clause that leans on another', () => {
    assert.deepEqual(timelinePoints(['In 2019, the bridge was declared unsafe, officials said.', 'Repairs began in March 2023.', 'Engineers found new cracks in 2025.', 'The city will reopen it in 2027.', 'Since 2010 traffic has doubled.'], 2026), [
      { when: '2019', what: 'The bridge was declared unsafe' },
      { when: 'March 2023', what: 'Repairs began' },
      { when: '2025', what: 'Engineers found new cracks' },
    ]);
    assert.deepEqual(timelinePoints(['The company was founded in 1998 in a garage.', 'It listed on the stock market in 2004.'], 2026), [{ when: '1998', what: 'The company was founded in a garage' }]);
    assert.deepEqual(timelinePoints(['“We opened in 2001,” she said.', 'Prices may rise in 2024.'], 2026), []);
  });

  test('the bulletin keeps one board a story, and only on a programme with it', () => {
    const story = { id: 'b1', title: 'Haverford Bridge closed again', summary: SRC, source: 'Ledger Line', category: 'world', image: null };
    const text = 'Officials closed the Haverford Bridge on Monday. Traffic is being sent through the old tunnel.';
    const tl = [{ when: '2019', what: 'The bridge was declared unsafe' }, { when: 'March 2023', what: 'Repairs began' }];
    const seg = (program, extra = {}) =>
      normalizeBulletin(
        { title: 'T', segments: [{ type: 'story', storyId: 'b1', anchor: 'A', emotion: 'neutral', headline: story.title, text, shot: 'wide', timeline: tl, ...extra }] },
        [story],
        { program, presenters: DUO, maxStories: 14 },
      ).segments.find((s) => s.storyId === 'b1');
    assert.deepEqual(seg(WN).timeline, tl);
    assert.equal(seg({ id: 'news-60', ...CHANNEL.programs['news-60'] }).timeline, undefined);
    const both = seg(WN, { known: ['Officials closed the Haverford Bridge', 'Traffic is being sent through the old tunnel'] });
    assert.ok(both.known && both.timeline === undefined, 'WHAT WE KNOW first');
  });
});

describe('the HOW WE GOT HERE card (pace.js, cards.js)', () => {
  const steps = [{ when: '2019', what: 'The bridge was declared unsafe' }, { when: 'March 2023', what: 'Repairs began on the eastern span' }, { when: '2025', what: 'Engineers found new cracks' }];
  test('a board of two or three steps where the profile has it, after WHAT WE KNOW; the hold reads it all', () => {
    assert.deepEqual(timelineBoard({ timeline: steps }, 'world-now'), steps);
    assert.equal(timelineBoard({ timeline: steps.slice(0, 1) }, 'world-now'), null);
    assert.equal(timelineBoard({ timeline: steps }, 'news-60'), null);
    const known = ['Only one in five services is running', 'Unions say talks over pay have stalled'];
    assert.deepEqual(storyBoard({ known, timeline: steps }, 'world-now'), known);
    assert.deepEqual(storyBoard({ timeline: steps }, 'world-now'), steps);
    assert.equal(factText({ timeline: steps }, 'world-now'), '2019 The bridge was declared unsafe March 2023 Repairs began on the eastern span 2025 Engineers found new cracks');
    const S = paceFor('world-now').shots;
    const h = factHold(factText({ timeline: steps }, 'world-now'), 'world-now');
    assert.ok(h >= S.factMin && h <= S.factMax);
  });

  test('the rail draws and each step lands on it in turn, inside the card area (y 26-134)', async () => {
    globalThis.document = { createElement: () => fakeCanvas() };
    const cards = await import('../public/js/scenes/cards.js');
    const { P } = await import('../public/js/palette.js');
    const nodes = (ctx) => ctx.fills.filter((f) => f.c === P.red && f.w === 3 && f.h === 3);
    const early = fakeCanvas().getContext('2d');
    cards.drawFactCard(early, 10, 0.5, { timeline: steps, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(nodes(early).length, 1, 'the first step only, half a second in');
    const late = fakeCanvas().getContext('2d');
    cards.drawFactCard(late, 10, 3, { timeline: steps, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(nodes(late).length, 3);
    const panel = late.fills.find((f) => f.c === P.black && f.w > 200);
    assert.ok(panel && panel.y >= 26 && panel.y + panel.h <= 134, JSON.stringify(panel));
    assert.equal(late.depth, 0);
  });
});

// FROM → TO (boards round 3): one figure that moved, as the story says it; it takes the story's card before the figures board.
describe('FROM → TO (writer, pace.js, cards.js)', () => {
  const SRC = 'Norway’s central bank has raised its main interest rate from 4.5% to 4.75%, the first rise in a year. Profit fell to $870 million from $1.2 billion.';
  test('both values the source says moved, a grounded label; anything else is no board', () => {
    assert.deepEqual(normalizeChange({ from: '4.5%', to: '4.75%', label: 'main interest rate' }, SRC), { from: '4.5%', to: '4.75%', label: 'MAIN INTEREST RATE' });
    assert.deepEqual(normalizeChange({ from: '$1.2 billion', to: '$870 million', label: 'profit' }, SRC), { from: '$1.2 BILLION', to: '$870 MILLION', label: 'PROFIT' });
    assert.equal(normalizeChange({ from: '4%', to: '4.75%', label: 'main interest rate' }, SRC), null, 'an old value the source never gives');
    assert.equal(normalizeChange({ from: '4.75%', to: '4.5%', label: 'main interest rate' }, SRC), null, 'the wrong way round');
    assert.equal(normalizeChange({ from: '4.5%', to: '4.75%', label: 'mortgage costs' }, SRC), null, 'a label the source does not support');
  });

  test('the fallback writer reads what moved: the object of a verb that moves it, or the subject of one that moves', () => {
    assert.deepEqual(changeFrom(['Norway’s central bank has unexpectedly raised its main interest rate from 4.5% to 4.75%.']), { from: '4.5%', to: '4.75%', label: 'MAIN INTEREST RATE' });
    assert.deepEqual(changeFrom(['Inflation fell to 2.1% from 2.6% in September, the agency said.']), { from: '2.6%', to: '2.1%', label: 'INFLATION' });
    assert.equal(changeFrom(['It rose from 3 to 5.']), null, 'a pronoun is no label');
    assert.equal(changeFrom(['“It rose from 3% to 5%,” she said.']), null, 'never inside a quote');
  });

  test('the bulletin keeps it only when the presenter says both values, and it takes the card before BY THE NUMBERS', () => {
    const story = { id: 'r1', title: 'Norway raises interest rate', summary: SRC, source: 'Ledger Line', category: 'business', image: null };
    const seg = (text) =>
      normalizeBulletin(
        { title: 'T', segments: [{ type: 'story', storyId: 'r1', anchor: 'A', emotion: 'neutral', headline: story.title, text, shot: 'wide', change: { from: '4.5%', to: '4.75%', label: 'main interest rate' } }] },
        [story],
        { program: WN, presenters: DUO, maxStories: 14 },
      ).segments.find((s) => s.storyId === 'r1');
    assert.deepEqual(seg('Norway’s central bank has raised its main interest rate from 4.5% to 4.75%.').change, { from: '4.5%', to: '4.75%', label: 'MAIN INTEREST RATE' });
    assert.equal(seg('Norway’s central bank has raised its main interest rate to 4.75%.').change, undefined, 'the old value is not said');
    const c = { from: '4.5%', to: '4.75%', label: 'MAIN INTEREST RATE' };
    const nums = [{ value: '4.75%', label: 'RATE' }, { value: '1', label: 'YEAR' }];
    assert.deepEqual(changeBoard({ change: c, numbers: nums }, 'world-now'), c);
    assert.equal(numbersBoard({ change: c, numbers: nums }, 'world-now'), null);
    assert.deepEqual(storyBoard({ change: c, known: ['a b c', 'd e f'] }, 'world-now'), c);
    assert.equal(changeBoard({ change: c }, 'news-60'), null);
    assert.equal(changeBoard({ change: c, feature: 'number' }, 'world-now'), null);
    assert.equal(factText({ change: c }, 'world-now'), 'MAIN INTEREST RATE 4.5% 4.75%');
  });

  test('the card: the old value first, the arrow, then the new one, inside the card area', async () => {
    globalThis.document = { createElement: () => fakeCanvas() };
    const cards = await import('../public/js/scenes/cards.js');
    const { P } = await import('../public/js/palette.js');
    const c = { from: '4.5%', to: '4.75%', label: 'MAIN INTEREST RATE' };
    const arrow = (ctx) => ctx.fills.filter((f) => f.c === P.red && f.h === 1);
    const early = fakeCanvas().getContext('2d');
    cards.drawFactCard(early, 10, 0.5, { change: c, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(arrow(early).length, 0, 'no arrow before the old value has landed');
    const late = fakeCanvas().getContext('2d');
    cards.drawFactCard(late, 10, 3, { change: c, source: 'Ledger Line', programId: 'world-now' });
    assert.equal(arrow(late).length, 1);
    const panel = late.fills.find((f) => f.c === P.black && f.w > 200);
    assert.ok(panel && panel.y >= 26 && panel.y + panel.h <= 134, JSON.stringify(panel));
    assert.equal(late.depth, 0);
  });
});

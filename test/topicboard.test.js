// The topic board (public/js/graphics/topicboard.js): what a story with neither a cleared picture nor a place shows
// behind its headline, the story's own strongest element (public/js/boardspec.js): its key figure, a short quote card,
// the named actor's wordmark, its topic beside a line glyph, its key phrase. Everything inside the board's box, clear of
// the captions (y 46-70) and of the headline's chip (from y 127); under a grave story silver and fog only, no glyph.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

function fakeCanvas() {
  const ops = [];
  const cv = { width: 300, height: 150, ops };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    globalAlpha: 1,
    drawImage(src, x = 0, y = 0) {
      ops.push({ op: 'image', src, x, y, w: src.width, h: src.height, c: src.$colour });
    },
    fillRect(x, y, w, h) {
      ops.push({ op: 'fill', x, y, w, h, c: this.fillStyle });
      // (a rendered text's colour, so the board's text can be told apart)
      cv.$colour = this.fillStyle;
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
let spec;
let P;
before(async () => {
  globalThis.document ??= { createElement: fakeCanvas };
  mod = await import('../public/js/graphics/topicboard.js');
  spec = await import('../public/js/boardspec.js');
  P = (await import('../public/js/palette.js')).P;
});

const draw = (item, dt = 9, accent = '#e43b44') => {
  const cv = fakeCanvas();
  const ctx = cv.getContext();
  const s = mod.drawTopicBoard(ctx, item, { accent, dt });
  // everything after the field is the board itself
  return { ops: cv.ops.slice(1), field: cv.ops[0], spec: s };
};
const extent = (ops) => {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const o of ops) {
    if (!(o.w > 0 && o.h > 0)) continue;
    let { x, y, w, h } = o;
    // a rendered text: only its letters (font.js renders the line with room above the caps and below, and one more column)
    if (o.op === 'image') {
      const micro = h === 9;
      const s = micro ? 1 : h / 12;
      y += (micro ? 2 : 3) * s;
      h = (micro ? 5 : 7) * s;
      w -= s;
    }
    b.x0 = Math.min(b.x0, x);
    b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x + w);
    b.y1 = Math.max(b.y1, y + h);
  }
  return b;
};
const BOARDS = () => [
  { kind: 'figure', value: '139', label: 'MIGRANTS', qual: 'AT LEAST', grave: true },
  { kind: 'figure', value: '£750,000', label: 'LOAN', qual: null, grave: false },
  { kind: 'figure', value: '50%', label: 'DISCOUNTED API RATES', qual: null, grave: false },
  { kind: 'figure', value: '1,000', label: 'TIMES MORE EASILY', qual: 'MORE THAN', grave: false },
  { kind: 'figure', value: '$100,000', label: 'GRAND PRIZE', qual: 'UP TO', grave: false },
  { kind: 'quote', text: 'IT WAS FAKE', by: 'INDIAN VILLAGERS', grave: true },
  { kind: 'quote', text: 'THERE ARE NO RIGHT OR WRONG ANSWERS', by: 'CONNERTY', grave: false },
  { kind: 'quote', text: 'MISTING OR WATER TRAPPED BETWEEN THE PANES OF DOUBLE GLAZING CAN POINT TO A FAILED SEALED UNIT', by: 'ANTONY HEATH', grave: false },
  { kind: 'actor', name: 'POPE LEO XIV', about: 'HEAD OF THE CATHOLIC CHURCH', grave: true },
  { kind: 'actor', name: 'INTERNATIONAL ENERGY AGENCY', about: 'INTERGOVERNMENTAL ORGANISATION', grave: false },
  { kind: 'actor', name: 'UEFA CHAMPIONS LEAGUE', about: 'EUROPEAN ASSOCIATION FOOTBALL TOURNAMENT', grave: false },
  { kind: 'actor', name: 'LICUBE', about: 'FUSION POWER', grave: false },
  { kind: 'topic', label: 'AI SURVEILLANCE', glyph: 'chip', grave: false },
  { kind: 'topic', label: 'FAMILY AND SEXUAL VIOLENCE', glyph: null, grave: true },
  { kind: 'topic', label: 'ARTIFICIAL INTELLIGENCE', glyph: 'chip', grave: false },
  { kind: 'phrase', text: "CARER'S ALLOWANCE", grave: true },
  { kind: 'none', grave: false },
];

describe('the glyphs', () => {
  test('every glyph is 24 by 24 in the board\'s own letters, and none is a car or a cartoon', () => {
    assert.ok(Object.keys(mod.GLYPHS).length >= 20);
    for (const [name, rows] of Object.entries(mod.GLYPHS)) {
      assert.equal(rows.length, 24, name);
      for (const r of rows) assert.match(r, /^[#.+o ]{24}$/, `${name}: "${r}"`);
    }
    assert.ok(!('car' in mod.GLYPHS) && !('rocket' in mod.GLYPHS));
  });
  test('every glyph the topics name is drawn', () => {
    for (const t of spec.TOPICS) if (t.glyph) assert.ok(mod.GLYPHS[t.glyph], t.glyph);
  });
});

describe('the board', () => {
  test('every kind stays inside its box: clear of the captions above, the chip below, graphics-safe on the right', () => {
    for (const board of BOARDS()) {
      const { ops } = draw({ board, category: 'world' });
      if (board.kind === 'none') continue;
      const b = extent(ops);
      assert.ok(b.y0 >= 71 && b.y1 <= 127 && b.x1 <= 367 && b.x0 >= 50, `${board.kind} ${board.text || board.name || board.label || board.value}: ${JSON.stringify(b)}`);
    }
  });
  test('a figure big, what it counts beside it and its qualifier, behind the accent rule', () => {
    const { ops } = draw({ board: { kind: 'figure', value: '20', label: 'WEEKS', qual: null, grave: false } });
    const imgs = ops.filter((o) => o.op === 'image');
    const tallest = Math.max(...imgs.map((o) => o.h));
    assert.ok(tallest >= 7 * 5, 'the figure at 5x or more');
    assert.ok(ops.some((o) => o.op === 'fill' && o.c === '#e43b44' && o.w === 2), 'the accent rule');
  });
  test('a grave story: silver and fog only, never the accent; no glyph', () => {
    for (const board of BOARDS().filter((b) => b.grave)) {
      const { ops } = draw({ board, category: 'world' });
      assert.ok(!ops.some((o) => o.c === '#e43b44'), `${board.kind}: no accent`);
    }
    const { ops } = draw({ board: { kind: 'topic', label: 'INQUEST', glyph: null, grave: true } });
    assert.ok(!ops.some((o) => o.op === 'fill' && o.w === 2 && o.h === 2 && o.c === P.silver), 'no glyph cell');
  });
  test('a topic: its glyph on a tile in the programme\'s accent, the words beside it', () => {
    const { ops } = draw({ board: { kind: 'topic', label: 'AI SURVEILLANCE', glyph: 'chip', grave: false } }, 9, P.cyan);
    assert.ok(ops.some((o) => o.op === 'fill' && o.w === 2 && o.h === 2 && o.c === P.cyan), 'the glyph\'s accent cells');
    assert.ok(ops.some((o) => o.op === 'fill' && o.w === 52 && o.h === 52 && o.c === P.ink), 'its tile');
  });
  test('nothing the story says: the section\'s glyph on its tile, no words; under a grave story the field alone', () => {
    const quiet = draw({ board: { kind: 'none', grave: false }, category: 'tech' });
    assert.ok(quiet.ops.some((o) => o.op === 'fill' && o.w === 52 && o.h === 52));
    assert.ok(!quiet.ops.some((o) => o.op === 'image'), 'no words');
    assert.equal(draw({ board: { kind: 'none', grave: true }, category: 'world' }).ops.length, 0);
  });
  test('one wipe: nothing before 0.1 s, all of it by 0.5 s', () => {
    const item = { board: { kind: 'actor', name: 'REPLIT', about: 'COMPANY AND ONLINE CODING ENVIRONMENT', grave: false } };
    assert.equal(draw(item, 0.05).ops.length, 0);
    assert.ok(draw(item, 0.3).ops.length > 0);
    assert.equal(draw(item, 0.7).ops.length, draw(item, 5).ops.length);
  });
  test('an item without the server\'s board reads one from its headline, never a bare section word', () => {
    const a = draw({ headline: 'Driving test waits fall to two-year low - but still average 20 weeks', category: 'business' });
    assert.deepEqual([a.spec.kind, a.spec.value, a.spec.label], ['figure', '20', 'WEEKS']);
    const b = draw({ headline: 'Something happened', category: 'world' });
    assert.equal(b.spec.kind, 'none');
    assert.ok(!b.ops.some((o) => o.op === 'image'), 'no words at all, never WORLD');
  });
});

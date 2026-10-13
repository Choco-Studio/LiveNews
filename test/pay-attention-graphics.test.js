import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

// PAY ATTENTION's graphics (public/js/scenes/cards-quiz.js, docs/programmes/pay-attention.md §6): every board keeps the
// safe area (x 13..371, y 28..134: clear of the top row and of the captions), one type size for each role (a headline
// is refused, never shrunk), the right tile gold and the wrong ones slate, the players told apart by a shape (never a
// letter), the picture sharpening in whole blocks, LETTER BY LETTER's stages, the mask as a block, palette colours only.

const FILLS = []; // every fill on every canvas (the boards' and the font's own text canvases)
/** A canvas whose context records fills and images, with the source and destination of every drawImage. */
function fakeCanvas(width = 384, height = 216) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    fillRect(x, y, w, h) {
      const f = { c: this.fillStyle, x, y, w, h };
      this.fills.push(f);
      FILLS.push(f);
    },
    drawImage(img, ...a) {
      const r = a.length === 8 ? { sw: a[2], sh: a[3], x: a[4], y: a[5], w: a[6], h: a[7] } : a.length === 4 ? { x: a[0], y: a[1], w: a[2], h: a[3] } : { x: a[0], y: a[1], w: img?.width || 0, h: img?.height || 0 };
      this.images.push({ img, ...r });
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
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

const HN = 120 / 112;
const NOW = Date.parse('2026-10-13T20:20:00Z');
const LOLA = { seat: 'A', name: 'LOLA', id: 'lola' };
const SAM = { seat: 'B', name: 'SAM', id: 'sam' };
const UNIT8 = { seat: 'B', name: 'UNIT-8', id: 'unit8' };
// the hardest options: real headlines of 71-72 characters (13 Oct)
const LONG = [
  'Fitbit Edge is Google’s middle ground between Fitbit Air and Pixel Watch',
  'Smart ring maker Ultrahuman to roll out biological-age model across UAE',
  'Bumble agrees to a $1.3B acquisition deal as online dating faces a reset',
];
const PIC = { type: 'picture', steps: [8, 16, 32, 64], aired: { programme: 'tech-bytes', at: NOW - 26 * 3600_000, source: 'The Wall Street Journal' }, options: LONG.map((words, i) => ({ letter: 'ABC'[i], words })), answer: 'C' };
const WHERE = { type: 'where', words: 'Smart ring maker Ultrahuman to roll out biological-age model across UAE', masked: 'Smart ring maker Ultrahuman to roll out biological-age model across ▮▮▮▮▮', aired: { programme: 'tech-bytes', at: NOW - 20 * 3600_000, source: 'TechCrunch' }, options: [{ letter: 'A', label: 'NETHERLANDS', lat: 52.2, lon: 5.5 }, { letter: 'B', label: 'UNITED ARAB EMIRATES', lat: 23.4, lon: 53.8 }, { letter: 'C', label: 'TANZANIA', lat: -6.4, lon: 34.9 }], answer: 'B' };
const F1 = { type: 'where', words: "F1 in Singapore: There's new fastest car now", masked: "F1 in ▮▮▮▮▮: There's new fastest car now", aired: { programme: 'tech-bytes', at: NOW - 20 * 3600_000, source: 'Ars Technica' }, options: [{ letter: 'A', label: 'SINGAPORE', lat: 1.35, lon: 103.8 }, { letter: 'B', label: 'NEW ZEALAND', lat: -41.3, lon: 174 }, { letter: 'C', label: 'UNITED KINGDOM', lat: 54, lon: -2 }], answer: 'A' };
const HM = { type: 'howmany', masked: 'After years of declining subscriber numbers and falling revenue, Bumble just agreed to a ▮▮▮▮▮▮ acquisition.', sentence: 'After years of declining subscriber numbers and falling revenue, Bumble just agreed to a $1.3 billion acquisition.', figure: { value: '$1.3 billion', label: 'ACQUISITION', qualifier: '', exact: true }, aired: { programme: 'tech-bytes', at: NOW - 2 * 3600_000, source: 'TechCrunch' } };
const LET = { type: 'letters', words: 'Xbox is officially embracing chaos of AI-powered game ports', desk: 'tech', reveal: { shown: [0, 4, 5, 7, 8, 18, 19, 28, 29, 34, 35, 37, 38, 40, 41, 48, 49, 53, 54], order: [3, 46, 11, 31, 56, 21, 50, 12, 52, 57, 25, 36, 51, 15, 24, 47, 14, 27, 2, 44, 22, 33, 1, 42, 32, 45, 58, 9, 6, 16, 13, 10, 30, 39, 17, 20, 55, 26, 23, 43], stages: [10, 20, 30] }, aired: { programme: 'tech-bytes', at: NOW - 2 * 3600_000, source: 'The Verge' } };
const TODAY = { words: 'Paris Auto Show is full of interesting cars Americans can’t have', answer: 'EARLIER', aired: { programme: 'money-minute', at: NOW - 100 * 3600_000, source: 'The Verge' } };

describe('PAY ATTENTION graphics', () => {
  let G;
  let P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    G = await import('../public/js/scenes/cards-quiz.js');
    ({ P } = await import('../public/js/palette.js'));
  });
  // a text image's caps (font.js: body 1x 12 px tall, caps 3..9; 2x 24, caps 6..19; 3x 36, caps 9..29; micro 9, caps 2..6)
  const CAPS = { 12: [3, 7], 24: [6, 14], 36: [9, 21], 9: [2, 5] };
  const isText = (im) => im.img && im.sw === undefined && CAPS[im.h] && im.w < 384;
  const inSafe = (ctx, label) => {
    for (const f of ctx.fills) assert.ok(f.x >= 13 && f.x + f.w <= 371 && f.y >= 28 && f.y + f.h <= 134, `${label}: fill ${JSON.stringify(f)}`);
    for (const im of ctx.images) {
      if (isText(im)) {
        const [top, cap] = CAPS[im.h];
        assert.ok(im.x >= 13 && im.x <= 371 && im.y + top >= 28 && im.y + top + cap <= 134, `${label}: text at ${im.x},${im.y} (${im.w}x${im.h})`);
      } else assert.ok(im.x >= 13 && im.x + im.w <= 371 && im.y >= 28 && im.y + im.h <= 134, `${label}: image ${JSON.stringify({ x: im.x, y: im.y, w: im.w, h: im.h })}`);
    }
  };
  const board = (draw, dt, o) => {
    const ctx = fakeCanvas().getContext('2d');
    draw(ctx, dt, o);
    return ctx;
  };
  const picO = (extra = {}) => ({ question: PIC, image: fakeCanvas(512, 288), players: [LOLA, UNIT8], optionsAt: 1, countdown: { at: 15, dur: 7 * HN }, locks: [{ seat: 'A', answer: 'C', at: 16.4 }, { seat: 'B', answer: 'C', at: 17.2 }], revealAt: 23, now: NOW, ...extra });

  test('every board, at every moment, stays inside the safe area (clear of the top row and the captions)', () => {
    const cases = [
      ['question', G.drawQuestionBoard, picO(), [0.5, 8, 16, 18, 20.5, 23.5, 25.5]],
      ['letters', G.drawLettersBoard, { question: LET, players: [LOLA, SAM], stageTimes: [3, 6.2, 9.4], countdown: { at: 3, dur: 9 * HN }, buzzes: [{ seat: 'B', at: 7, stall: true }, { seat: 'A', at: 10.6 }], winner: 'A', revealAt: 13, now: NOW }, [1, 5, 8, 11, 13.5, 15]],
      ['where', G.drawWhereBoard, { question: WHERE, players: [LOLA, UNIT8], pinsAt: 2.2, countdown: { at: 5, dur: 6 * HN }, locks: [{ seat: 'A', answer: 'B', at: 8 }, { seat: 'B', answer: 'C', at: 9 }], revealAt: 13, now: NOW }, [1, 4, 9.5, 13.5, 14.2, 16.5]],
      ['where2', G.drawWhereBoard, { question: F1, players: [LOLA, SAM], pinsAt: 2.2, locks: [{ seat: 'A', answer: 'A', at: 8 }, { seat: 'B', answer: 'A', at: 9 }], revealAt: 13, now: NOW }, [9.5, 14, 16.5]],
      ['howmany', G.drawHowManyBoard, { question: HM, players: [LOLA, SAM], countdown: { at: 6, dur: 4 * HN }, guesses: [{ seat: 'A', said: '$1.2 billion', at: 7, points: 2 }, { seat: 'B', said: '$900 million', at: 8.5, points: 0 }], revealAt: 11, now: NOW }, [1, 9, 11.5, 13]],
      ['today', G.drawTodayBoard, { item: TODAY, index: 5, total: 6, players: [LOLA, SAM], countdown: { at: 3.2, dur: 3 * HN }, locks: [{ seat: 'A', answer: 'TODAY', at: 4 }, { seat: 'B', answer: 'EARLIER', at: 4.6 }], tally: { A: [true, false, true, true, false], B: [true, true, true, false, true] }, revealAt: 6, now: NOW }, [1, 4, 5, 6.1, 7.8]],
      ['scores', G.drawScoresStrip, { players: [LOLA, SAM], scores: { A: 17, B: 13 }, title: 'FINAL SCORE', winner: 'A' }, [0.5, 3]],
      ['strip', G.drawScoresStrip, { players: [LOLA, UNIT8], scores: { A: 9, B: 11 }, compact: true }, [3]],
      ['double', G.drawDoubleCard, { players: [LOLA, SAM], player: 'B', leader: 'A', offered: ['science', 'tech'], pick: 'tech', pickAt: 2 }, [0.6, 3]],
      ['table', G.drawTableBoard, { players: [LOLA, SAM], standings: ['penny', 'lola', 'nova', 'unit8', 'paco', 'sam', 'max', 'ada', 'kai', 'rosa'].map((id, i) => ({ id, name: id.toUpperCase(), played: 3, wins: 3 - i * 0.5 })) }, [3]],
      ['round', G.drawRoundCard, { type: 'picture', k: 2 }, [3]],
      ['sudden', G.drawRoundCard, { sudden: true }, [3]],
    ];
    for (const [label, draw, o, times] of cases) {
      for (const t of times) {
        const ctx = board(draw, t, o);
        assert.ok(ctx.fills.length > 0, `${label} at ${t}: drawn`);
        inSafe(ctx, `${label} at ${t}`);
      }
    }
  });

  test('a tile holds three 1x lines: the 72-character headlines fit, and the desk can refuse what does not', () => {
    for (const w of LONG) {
      const L = G.tileLayout(w);
      assert.ok(G.fitsTile(w), w);
      assert.ok(L.lines.length <= 3 && L.w <= G.TILE_TEXT_W, `${w}: ${L.lines.length} lines, ${L.w} px`);
    }
    assert.equal(G.TILE.lines, 3);
    assert.equal(G.fitsTile('International Space Station crew completes record-breaking spacewalk today'), false, 'four lines');
    assert.equal(G.fitsTile('Supercalifragilisticexpialidocious telecommunications conglomerate merges'), false, 'a word wider than the tile');
    assert.deepEqual(G.quizFits(PIC), { ok: true });
    const bad = G.quizFits({ ...PIC, options: [...PIC.options.slice(0, 2), { letter: 'C', words: 'International Space Station crew completes record-breaking spacewalk today' }] });
    assert.equal(bad.ok, false);
    assert.match(bad.why, /option C/);
    assert.equal(G.quizFits(LET).ok, true);
    assert.equal(G.quizFits(WHERE).ok, true);
    assert.equal(G.quizFits(HM).ok, true);
    assert.equal(G.quizFits({ type: 'today', items: [TODAY] }).ok, true);
  });

  test('the desk refuses by the boards\' own measure: a headline that would not fit is never asked nor offered', async () => {
    const R = await import('../server/quiz/rounds.js');
    const ev = (key, words, extra = {}) => ({ key, words, image: 'x.jpg', category: 'tech', programmes: ['tech-bytes'], last: NOW, source: 'Lab', ...extra });
    const tooLong = ev('k0', 'International space station crew completes record-breaking spacewalk today');
    const ok = [ev('k1', 'apple refreshes its smart speaker line'), ev('k2', 'robot vacuum learns to climb stairs'), ev('k3', 'tiny satellite maps ocean plastic', { category: 'science' })];
    const asked = R.pickAsked('picture', [tooLong, ...ok], { n: 3 });
    assert.ok(asked && !asked.includes(tooLong), 'not asked');
    const opts = [tooLong, ev('k4', 'new phone camera reads text in sixty languages', { category: 'science' }), ev('k5', 'game studio opens archive of early sketches', { category: 'science' })];
    const qs = R.buildQuestions('picture', [ok[0]], opts, () => 0.5, {});
    assert.ok(qs && qs[0].options.every((o) => o.key !== 'k0'), 'not offered');
    assert.ok(qs[0].options.every((o) => G.fitsTile(o.words)));
  });

  test('one type size for each role: every tile line at 1x even for the longest headlines, the frame at 2x, the kicker in micro', () => {
    const ctx = board(G.drawQuestionBoard, 25.5, picO());
    const tiles = ctx.images.filter((im) => isText(im) && im.x >= G.TILE.x && im.x < G.TILE.x + G.TILE.w);
    // three letters and nine lines (three a tile; a line of plain words is one text)
    assert.equal(tiles.length, 12, `${tiles.length} texts in the tiles`);
    assert.ok(tiles.every((im) => im.h === 12), 'every tile text at 1x: never shrunk to the micro face');
    const left = ctx.images.filter((im) => isText(im) && im.x < G.TILE.x);
    assert.equal(left.filter((im) => im.h === 24).length, 1, 'one frame at 2x');
    assert.ok(left.filter((im) => im.h === 9).length >= 2, 'the kicker and the credit in micro');
    // LETTER BY LETTER: every letter at 1x
    const L = board(G.drawLettersBoard, 15, { question: LET, players: [LOLA, SAM], stageTimes: [3, 6, 9], revealAt: 13, winner: 'A', now: NOW });
    const lay = G.lettersLayout(LET.words);
    const letters = L.images.filter((im) => isText(im) && im.w <= 12 && im.y + 3 >= lay.top && im.y + 3 < lay.top + lay.rows * 18);
    assert.equal(letters.length, lay.cells.length, 'one text a character');
    assert.ok(letters.every((im) => im.h === 12), 'one size');
  });

  test('the reveal: the right tile gold with black type, the wrong ones slate; the credit (source and airing) on the foot', () => {
    const tileFills = (ctx) => ctx.fills.filter((f) => f.x === G.TILE.x + 1 && f.w === G.TILE.w - 2 && f.h === G.TILE.h - 2);
    const before = board(G.drawQuestionBoard, 20, picO());
    assert.deepEqual(tileFills(before).map((f) => f.c), [P.purple, P.purple, P.purple], 'three open tiles, the accent as a fill');
    assert.equal(before.fills.filter((f) => f.x === G.TILE.x && f.w === G.TILE.w && f.h === G.TILE.h && f.c === P.fog).length, 3, 'each in its fog rim');
    const after = board(G.drawQuestionBoard, 25, picO());
    const fills = tileFills(after);
    assert.deepEqual(fills.map((f) => f.c), [P.slate, P.slate, P.yellow], 'C gold, A and B slate');
    assert.equal(fills[2].y, G.TILE.y + 2 * (G.TILE.h + G.TILE.gap) + 1, 'the gold one is C');
    // the credit: never cut, two lines of the question column
    const credit = G.creditLines(G.creditOf(PIC.aired, { now: NOW }), 132, 2);
    assert.deepEqual(credit, ['SOURCE: THE WALL STREET JOURNAL', 'TECH BYTES, YESTERDAY 19:20']);
    assert.ok(G.creditLines(G.creditOf({ programme: 'money-minute', at: NOW - 30 * 3600_000 - 86_400_000, source: 'The Guardian' }, { now: NOW }), 132, 2).every((l) => !l.includes('...')));
    assert.equal(G.creditOf({ programme: 'cosmos', at: NOW - 3600_000, source: 'ESA' }, { now: NOW }).day, 'TODAY');
    assert.equal(G.creditOf({ programme: 'cosmos', at: NOW - 3 * 86_400_000, source: 'ESA' }, { now: NOW }).day, 'SATURDAY');
    assert.equal(G.creditOf({ programme: 'cosmos', at: NOW, source: 'ESA' }, { now: NOW }).title, 'COSMOS DESK');
  });

  test('the players are a circle and a square (never a letter), lit gold when they lock in, beside the tile they chose', () => {
    const cv = fakeCanvas().getContext('2d');
    G.drawSeat(cv, 'A', 0, 0, P.yellow);
    assert.deepEqual(cv.fills.map((f) => f.w), [3, 5, 7, 7, 7, 5, 3], 'the circle, row by row');
    const sq = fakeCanvas().getContext('2d');
    G.drawSeat(sq, 'B', 0, 0, P.yellow);
    assert.deepEqual(sq.fills.map((f) => [f.w, f.y]), [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]], 'the square on the caps\' baseline');
    assert.deepEqual(G.SEAT_SHAPES, { A: 'circle', B: 'square' });
    // both players on one tile: both shapes in its gutter, gold, stacked; each with a name (never a lone letter)
    const ctx = board(G.drawQuestionBoard, 18, picO());
    const gutter = ctx.fills.filter((f) => f.x >= G.TILE.x + G.TILE.w && f.c === P.yellow);
    const rowsA = gutter.filter((f) => f.y >= 99 + 7 && f.y < 99 + 14).map((f) => f.w);
    const rowsB = gutter.filter((f) => f.y >= 99 + 17 && f.y < 99 + 24).map((f) => f.w);
    assert.deepEqual(rowsA, [3, 5, 7, 7, 7, 5, 3], 'the circle by tile C');
    assert.deepEqual(rowsB, [6, 6, 6, 6, 6, 6], 'the square under it');
    const names = ctx.images.filter((im) => isText(im) && im.x >= G.TILE.x + G.TILE.w);
    assert.equal(names.length, 2, 'two names');
    assert.ok(names.every((im) => im.w > 8), 'names, not a one-letter label');
    // before a lock-in nothing is in the gutter
    const early = board(G.drawQuestionBoard, 15.5, picO());
    assert.equal(early.fills.filter((f) => f.x >= G.TILE.x + G.TILE.w).length, 0);
  });

  test('PICTURE THIS: four steps of whole blocks (8, 16, 32, 64 across) on the countdown\'s beats, the full picture at the reveal', () => {
    assert.deepEqual(G.pictureSteps().map((s) => [s.blocks, s.rows, s.size]), [[8, 4, 16], [16, 8, 8], [32, 16, 4], [64, 32, 2]]);
    const times = [0, 15, 15 + 2 * HN, 15 + 4 * HN];
    assert.deepEqual([0.5, 14.9, 15, 17.2, 19.4, 23.1].map((t) => G.pictureStepAt(t, times, 23)), [1, 1, 2, 3, 4, 'full']);
    const pic = (t) => board(G.drawQuestionBoard, t, picO()).images.find((im) => im.sw !== undefined);
    for (const [t, blocks] of [[8, 8], [15.5, 16], [17.5, 32], [20, 64], [24, 128]]) {
      const im = pic(t);
      assert.ok(im, `a picture at ${t}`);
      assert.deepEqual([im.sw, im.sh, im.w, im.h], [blocks, blocks / 2, 128, 64], `${blocks} blocks across at ${t}`);
      assert.ok(Number.isInteger(128 / im.sw), 'whole pixels a block');
    }
    // no picture: a dark slot, never a crash
    const none = board(G.drawQuestionBoard, 8, picO({ image: null }));
    assert.ok(!none.images.some((im) => im.sw !== undefined));
  });

  test('LETTER BY LETTER: the first letters, digits and punctuation at once, then the stages from the reveal\'s order', () => {
    const r = LET.reveal;
    const s0 = G.lettersShown(r, 0);
    assert.deepEqual([...s0].sort((a, b) => a - b), [...r.shown].sort((a, b) => a - b));
    for (let k = 1; k <= 3; k++) {
      const s = G.lettersShown(r, k);
      assert.equal(s.size, r.shown.length + r.stages[k - 1], `stage ${k}`);
      for (const i of r.order.slice(0, r.stages[k - 1])) assert.ok(s.has(i));
    }
    const lay = G.lettersLayout(LET.words);
    assert.ok(lay.fits && lay.rows <= 3, `${lay.rows} rows`);
    assert.equal(lay.cells.length, [...LET.words].filter((c) => c !== ' ').length);
    assert.ok(lay.cells.filter((c) => !c.tile).every((c) => c.ch === '-'), 'punctuation bare, letters in tiles');
    // more letters on the board at each stage, every one at the reveal
    const count = (t) => {
      const ctx = board(G.drawLettersBoard, t, { question: LET, players: [LOLA, SAM], stageTimes: [3, 6, 9], revealAt: 13, now: NOW });
      return ctx.images.filter((im) => isText(im) && im.w <= 12 && im.y + 3 >= lay.top && im.y + 3 < lay.top + lay.rows * 18).length;
    };
    const n = [2, 5.5, 8.5, 11.5, 14].map(count);
    const chars = [...LET.words];
    assert.equal(n[0], r.shown.filter((i) => chars[i] !== ' ').length, 'the first letters and the hyphen');
    assert.ok(n[0] < n[1] && n[1] < n[2] && n[2] < n[3] && n[3] < n[4], n.join(' < '));
    assert.equal(n[4], lay.cells.length);
    // a stall: the lamp goes out; the winner's tiles go gold at the reveal
    const won = board(G.drawLettersBoard, 15, { question: LET, players: [LOLA, SAM], stageTimes: [3, 6, 9], buzzes: [{ seat: 'A', at: 10 }], winner: 'A', revealAt: 13, now: NOW });
    assert.equal(won.fills.filter((f) => f.c === P.yellow && f.w === 11 && f.h === 15).length, lay.cells.filter((c) => c.tile).length, 'every tile gold');
    assert.equal(G.fitsLetters('Supercalifragilisticexpialidocious telecommunications conglomerate merges today again'), false);
  });

  test('a mask is a solid block in the text (never a glyph), and the reveal lights the words it hid', () => {
    const L = G.layoutText(F1.masked, 132, 6);
    const segs = L.lines.flatMap((l) => l.words.flatMap((w) => w.segs));
    const masks = segs.filter((s) => s.k === 'm');
    assert.equal(masks.length, 1);
    assert.deepEqual([masks[0].n, masks[0].w], [5, 29]);
    assert.ok(segs.filter((s) => s.k === 't').every((s) => !s.s.includes('▮')), 'no ▮ ever reaches the font');
    const ctx = board(G.drawWhereBoard, 9, { question: F1, players: [LOLA, SAM], pinsAt: 2, revealAt: 13, now: NOW });
    const block = ctx.fills.find((f) => f.c === P.purple && f.w === 27 && f.h === 7 && f.x < 150);
    assert.ok(block, 'the purple block in the headline');
    assert.ok(ctx.fills.some((f) => f.c === P.fog && f.w === 29 && f.h === 9 && f.x === block.x - 1 && f.y === block.y - 1), 'in its fog rim');
    assert.deepEqual(G.revealPieces(F1.masked, F1.words), [{ k: 't', s: 'F1 in ' }, { k: 'h', s: 'Singapore' }, { k: 't', s: ": There's new fastest car now" }]);
    const shown = board(G.drawWhereBoard, 16, { question: F1, players: [LOLA, SAM], pinsAt: 2, revealAt: 13, now: NOW });
    assert.ok(shown.fills.some((f) => f.c === P.yellow && f.x < 150 && f.h === 11), 'the hidden place lit gold at the reveal');
    assert.ok(!shown.fills.some((f) => f.c === P.purple && f.w === 27 && f.h === 7 && f.x < 150), 'no mask left');
    // HOW MANY?: a six-block mask; the figure's words one gold span at the reveal
    const hm = G.layoutText(HM.masked, 350, 4).lines.flatMap((l) => l.words.flatMap((w) => w.segs)).filter((s) => s.k === 'm');
    assert.deepEqual(hm.map((s) => s.n), [6]);
    const rv = G.layoutText(HM.masked, 350, 4, HM.sentence).lines.flatMap((l) => l.words.flatMap((w) => w.segs)).filter((s) => s.k === 'h').map((s) => s.s);
    assert.deepEqual(rv, ['$1.3', 'billion']);
  });

  test('WHERE IN THE WORLD?: three pins framed inside the map, their tags inside it and apart, even "UNITED ARAB EMIRATES"', () => {
    for (const q of [WHERE, F1]) {
      const L = G.whereLayout(q, [{ seat: 'A', answer: q.answer, name: 'LOLA' }, { seat: 'B', answer: q.answer, name: 'UNIT-8' }]);
      assert.equal(L.pts.length, 3);
      for (const p of L.pts) assert.ok(p.x >= 10 && p.x <= 203 && p.y >= 8 && p.y <= 92, `pin at ${p.x},${p.y}`);
      for (const b of L.boxes) assert.ok(b.x >= 2 && b.y >= 2 && b.x + b.w <= 211 && b.y + b.h <= 98, `tag ${JSON.stringify(b)}`);
      for (let i = 0; i < 3; i++) {
        for (let j = i + 1; j < 3; j++) {
          const a = L.boxes[i];
          const b = L.boxes[j];
          assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `tags ${i} and ${j} apart`);
        }
      }
    }
    const uae = G.whereLayout(WHERE, []);
    assert.equal(uae.tags[1].lines.length, 2, 'the long name on two lines of the tag');
    assert.ok(uae.vEnd.zoom >= 4 && uae.vEnd.zoom >= uae.frame.zoom * 2 - 1e-9 || uae.vEnd.zoom === 8, 'the move closes in on the right pin');
    assert.equal(G.whereLayout({ ...WHERE, options: [] }, []), null, 'no pins: no board');
  });

  test('TODAY OR NOT TODAY?: a lamp lit gold for each choice, the wrong one dimmed at the reveal, the stamp, the tally', () => {
    const o = { item: TODAY, index: 5, total: 6, players: [LOLA, SAM], locks: [{ seat: 'A', answer: 'TODAY', at: 4 }, { seat: 'B', answer: 'EARLIER', at: 4.6 }], tally: { A: [true], B: [false] }, revealAt: 6, now: NOW };
    const lamps = (ctx) => ctx.fills.filter((f) => f.h === 13 && f.w > 2 && (f.c === P.yellow || f.c === P.slate || f.c === P.ink));
    const before = lamps(board(G.drawTodayBoard, 5, o));
    assert.equal(before.filter((f) => f.c === P.yellow).length, 2, 'both lamps lit');
    const after = lamps(board(G.drawTodayBoard, 7, o));
    assert.equal(after.filter((f) => f.c === P.yellow).length, 1, 'Sam right: still lit');
    assert.equal(after.filter((f) => f.c === P.slate).length, 1, 'Lola wrong: dimmed');
    const stamp = board(G.drawTodayBoard, 7, o).fills.filter((f) => f.c === P.white && f.h > 15);
    assert.equal(stamp.length, 1, 'the stamp\'s rim');
    const pips = board(G.drawTodayBoard, 7, o).fills.filter((f) => f.w === 5 && f.h === 3);
    assert.deepEqual(pips.map((f) => f.c), [P.yellow, P.slate, P.slate, P.yellow], 'the tally so far and this headline');
    assert.equal(G.kickerOf({ type: 'today', k: 6, n: 6 }), 'HEADLINE 6 OF 6');
    assert.equal(G.frameOf('today'), 'TODAY OR NOT TODAY?');
  });

  test('the stake beside the countdown: 3, 2, 1 points by step, and on DOUBLE OR NOTHING the doubled points and whose', () => {
    assert.deepEqual([1, 2, 3, 4].map((s) => G.stakeOf('picture', s)), ['', '3 POINTS', '2 POINTS', '1 POINT']);
    assert.deepEqual([0, 1, 2, 3].map((s) => G.stakeOf('letters', s)), ['', '3 POINTS', '2 POINTS', '1 POINT']);
    assert.equal(G.stakeOf('picture', 2, 'Penny'), '6 FOR PENNY', 'never a stake lower than the one played for');
    assert.equal(G.stakeOf('letters', 3, 'UNIT-8'), '2 FOR UNIT-8');
    assert.equal(G.stakeOf('where', 2), '');
  });

  test('the countdown goes out a cell on each half note of the bed', () => {
    const cd = { at: 2, dur: 7 * HN };
    assert.deepEqual([2, 2 + HN * 0.99, 2 + HN, 2 + 3.5 * HN, 2 + 7 * HN].map((t) => G.countdownCells(cd, t).lit), [7, 7, 6, 4, 0]);
    assert.equal(G.countdownCells({ at: 0, dur: 4 * HN }, 0).n, 4);
  });

  test('palette colours only, on every board and in every text', () => {
    const palette = new Set(Object.values(P));
    FILLS.length = 0;
    const o = { question: PIC, image: fakeCanvas(512, 288), players: [LOLA, SAM] };
    for (const t of [1, 16, 18, 24]) G.drawQuestionBoard(fakeCanvas().getContext('2d'), t, picO());
    for (const t of [5, 14]) G.drawLettersBoard(fakeCanvas().getContext('2d'), t, { question: LET, players: [LOLA, SAM], stageTimes: [3, 6, 9], buzzes: [{ seat: 'B', at: 4, stall: true }], winner: 'A', revealAt: 13, now: NOW });
    for (const t of [9, 16]) G.drawWhereBoard(fakeCanvas().getContext('2d'), t, { question: WHERE, players: [LOLA, SAM], locks: [{ seat: 'A', answer: 'B', at: 8 }], revealAt: 13, now: NOW });
    for (const t of [9, 13]) G.drawHowManyBoard(fakeCanvas().getContext('2d'), t, { question: HM, players: [LOLA, SAM], guesses: [{ seat: 'A', said: '$1.2 billion', at: 7, points: 2 }], revealAt: 11, now: NOW });
    for (const t of [5, 7]) G.drawTodayBoard(fakeCanvas().getContext('2d'), t, { item: TODAY, index: 0, players: [LOLA, SAM], locks: [{ seat: 'A', answer: 'TODAY', at: 4 }], revealAt: 6, now: NOW });
    G.drawScoresStrip(fakeCanvas().getContext('2d'), 3, { players: [LOLA, SAM], scores: { A: 3, B: 4 }, winner: 'B' });
    G.drawDoubleCard(fakeCanvas().getContext('2d'), 3, { players: [LOLA, SAM], player: 'A', offered: ['world', 'business'], pick: 'world', pickAt: 1 });
    G.drawTableBoard(fakeCanvas().getContext('2d'), 3, { players: [LOLA, SAM], standings: [{ id: 'lola', name: 'LOLA', played: 2, wins: 1.5 }] });
    G.drawRoundCard(fakeCanvas().getContext('2d'), 3, { type: 'today', k: 3 });
    assert.ok(o && FILLS.length > 500);
    const off = [...new Set(FILLS.map((f) => f.c))].filter((c) => !palette.has(c));
    assert.deepEqual(off, [], 'every colour from palette.js');
    // the quiz's look: purple only as a fill in its fog rim, never magenta or cyan (COSMOS's and TECH BYTES's)
    assert.ok(!FILLS.some((f) => f.c === P.magenta || f.c === P.cyan));
  });
});

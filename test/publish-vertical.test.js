// The vertical picture and the clip's own graphics (public/js/clip/; docs/publishing/vertical.md): the zones fill the
// 216x384 frame exactly, every PAY ATTENTION board and every news board set for it stays inside its box at every
// moment, the hook and the end card stay inside the frame and the platforms' safe area, the captions page whole
// words in two lines, nothing lit over grave news, a voice reading the board is not captioned twice, the AI mark
// docks to the bug, the thumbnail's lead fits.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

function fakeCanvas(width = 216, height = 384) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      this.fills.push({ c: this.fillStyle, x, y, w, h, clip: this.clipBox });
    },
    drawImage(img, ...a) {
      const r = a.length === 8 ? { x: a[4], y: a[5], w: a[6], h: a[7] } : a.length === 4 ? { x: a[0], y: a[1], w: a[2], h: a[3] } : { x: a[0], y: a[1], w: img?.width || 0, h: img?.height || 0 };
      this.images.push({ img, ...r, clip: this.clipBox });
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
    clipBox: null,
    stack: [],
    pending: null,
    save() { this.stack.push(this.clipBox); },
    restore() { this.clipBox = this.stack.pop() ?? null; },
    beginPath() { this.pending = null; },
    rect(x, y, w, h) { this.pending = { x, y, w, h }; },
    clip() {
      if (!this.pending) return;
      const p = this.pending;
      const c = this.clipBox;
      this.clipBox = c ? { x: Math.max(c.x, p.x), y: Math.max(c.y, p.y), w: Math.min(c.x + c.w, p.x + p.w) - Math.max(c.x, p.x), h: Math.min(c.y + c.h, p.y + p.h) - Math.max(c.y, p.y) } : p;
    },
  };
  for (const m of ['moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}
/** The visible part of a draw (its clip applied): null when fully clipped away. */
const visible = (d) => {
  if (!d.clip) return d;
  const x0 = Math.max(d.x, d.clip.x);
  const y0 = Math.max(d.y, d.clip.y);
  const x1 = Math.min(d.x + d.w, d.clip.x + d.clip.w);
  const y1 = Math.min(d.y + d.h, d.clip.y + d.clip.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};
/**
 * Every word a viewer must read inside the platforms' safe column (x 8-188) and above their caption band (y 300): the
 * text-sized images drawn (words, the bug, small plates' text), not the pictures. A pixel of slack for a glyph's edge.
 */
function wordsSafe(ctx, label, { bottom = 300, left = 8, right = 188 } = {}) {
  let n = 0;
  for (const im of ctx.images) {
    if (!(im.h <= 24 && im.w <= right - left + 2)) continue;
    const v = visible(im);
    if (!v) continue;
    n++;
    assert.ok(v.x >= left - 1 && v.x + v.w <= right + 1, `${label}: a word outside the safe column (x ${left}-${right}): ${JSON.stringify(v)}`);
    assert.ok(v.y + v.h <= bottom + 1, `${label}: a word under the feed's caption band (y ${bottom}): ${JSON.stringify(v)}`);
  }
  return n;
}
function inside(ctx, box, label) {
  for (const d of [...ctx.fills, ...ctx.images]) {
    const v = visible(d);
    if (!v || v.w <= 0 || v.h <= 0) continue;
    assert.ok(v.x >= box.x - 1e-6 && v.y >= box.y - 1e-6 && v.x + v.w <= box.x + box.w + 1e-6 && v.y + v.h <= box.y + box.h + 1e-6, `${label}: ${JSON.stringify(v)} outside ${JSON.stringify(box)}`);
  }
}

describe('the vertical picture', () => {
  let L;
  let VQ;
  let Q;
  let quizCases;
  let VB;
  let cards;
  let caps;
  let G;
  let clipIdx;
  let thumb;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    L = await import('../public/js/clip/layout.js');
    VQ = await import('../public/js/clip/vquiz.js');
    Q = await import('../public/js/scenes/cards-quiz.js');
    ({ quizCases } = await import('../public/lab/quiz-cases.js'));
    VB = await import('../public/js/clip/vboards.js');
    cards = await import('../public/js/clip/cards.js');
    caps = await import('../public/js/clip/captions.js');
    G = await import('../public/js/clip/graphics.js');
    clipIdx = await import('../public/js/clip/index.js');
    thumb = await import('../public/js/clip/thumb.js');
  });

  test('the zones fill 216x384 top to bottom, at the channel\'s pixel size (5x: 1080x1920)', () => {
    const z = [L.V.mast, L.V.title, L.V.stage, L.V.caps, L.V.foot];
    assert.equal(z[0].y, 0);
    for (let i = 1; i < z.length; i++) assert.equal(z[i].y, z[i - 1].y + z[i - 1].h);
    assert.equal(z.at(-1).y + z.at(-1).h, L.VH);
    assert.equal(L.VW * 5, 1080);
    assert.equal(L.VH * 5, 1920);
  });

  test('clip mode is asked for by the URL, and only then', () => {
    const p = (s) => new URLSearchParams(s);
    assert.deepEqual(clipIdx.clipOptions(p('')), { on: false, vertical: false });
    assert.deepEqual(clipIdx.clipOptions(p('clip=1')), { on: true, vertical: false });
    assert.deepEqual(clipIdx.clipOptions(p('format=vertical')), { on: true, vertical: true });
    assert.deepEqual(clipIdx.clipSizes({ vertical: true }), { page: { w: 216, h: 384 }, render: { w: 384, h: 216 } });
    // a clean plate (a thumbnail's frame): the horizontal picture with no graphics
    assert.deepEqual(clipIdx.clipOptions(p('clip=clean')), { on: true, vertical: false, clean: true });
    assert.equal(clipIdx.clipOptions(p('clip=clean&format=vertical')).clean, undefined, 'the vertical picture is never a plate');
  });

  test('every PAY ATTENTION board set for the tall stage stays inside its box, its words in the safe column', () => {
    const BOX = L.boardBox({ x: 0, y: 32, w: 216, h: 216 });
    const pics = Object.fromEntries(['device', 'ice', 'corridor', 'rocket', 'owl', 'phone'].map((k) => [k, fakeCanvas(512, 288)]));
    const box = (fn) => (ctx, t, o) => fn(ctx, t, o, BOX);
    const V = { ...Q, drawQuestionBoard: box(VQ.VQUIZ.picture), drawLettersBoard: box(VQ.VQUIZ.letters), drawWhereBoard: box(VQ.VQUIZ.where), drawHowManyBoard: box(VQ.VQUIZ.howmany), drawTodayBoard: box(VQ.VQUIZ.today), drawScoresStrip: (ctx, t, o) => (o.compact ? null : VQ.VQUIZ.final(ctx, t, o, BOX)), drawDoubleCard: box(VQ.VQUIZ.double), drawTableBoard: box(VQ.VQUIZ.table), drawRoundCard: box(VQ.VQUIZ.round) };
    const cases = quizCases({ Q: V, pics, HN: Q.HALF_NOTE, NOW: Date.parse('2026-10-13T20:20:00Z') });
    let n = 0;
    for (const [id, , c] of cases) {
      if (id === 'strip') continue;
      for (const [name, t] of Object.entries(c.moments || {})) {
        const ctx = fakeCanvas().getContext('2d');
        c.draw(ctx, t);
        inside(ctx, BOX, `${id} at ${name}`);
        wordsSafe(ctx, `${id} at ${name}`);
        n++;
      }
    }
    assert.ok(n > 30, `${n} board moments checked`);
  });

  test('every news board set for the vertical stage stays inside its box, its words in the safe column', () => {
    const STAGE = L.boardBox({ x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h });
    const boards = {
      figures: { numbers: [{ value: '$1.3 billion', label: 'acquisition' }, { value: '68.7%', label: 'profit rise' }], source: 'TechCrunch' },
      known: { known: ['Only one in five services is running', 'Unions say talks over pay have stalled', 'Stations across Germany were almost empty'], source: 'DW' },
      timeline: { timeline: [{ when: '3 October 2026', what: 'The bridge closes for checks' }, { when: '10 October', what: 'Engineers find cracks in two piers' }, { when: '17 October', what: 'The city orders a full rebuild' }] },
      change: { change: { from: '4.5%', to: '4.75%', label: 'main interest rate' } },
      term: { term: { term: 'OPEN SOURCE', plain: 'Software whose code anyone can read, change and share' } },
      quote: { quote: { text: 'We came back to the table because the river does not wait for anyone', by: 'Lena Novak' } },
      who: { who: [{ name: 'Laurent Nuñez', role: 'INTERIOR MINISTER' }, { name: 'Sébastien Lecornu', role: 'PRIME MINISTER' }] },
      share: { share: { value: '65 percent', lead: '', label: 'of teachers in the region have asked for more security' } },
      next: { next: { when: '28 OCTOBER', what: 'The matter is due to be discussed in parliament' } },
    };
    for (const [kind, card] of Object.entries(boards)) {
      assert.equal(VB.boardKind(card), kind);
      for (const prog of ['world-now', 'money-minute', 'cosmos']) {
        for (const dt of [0.1, 0.6, 3]) {
          const ctx = fakeCanvas().getContext('2d');
          const drew = VB.drawVerticalBoard(ctx, dt, card, { ...STAGE, programId: prog });
          assert.ok(drew, `${kind} drew`);
          inside(ctx, STAGE, `${kind} (${prog}) at ${dt}`);
          wordsSafe(ctx, `${kind} (${prog}) at ${dt}`);
        }
      }
    }
  });

  test('HOW MANY? gives the space under the guesses a job all question long, with or without the countdown on the board', async () => {
    const { P: PAL } = await import('../public/js/palette.js');
    const BOX = L.boardBox({ x: 0, y: 32, w: 216, h: 216 });
    // the real TSMC question of 17 Oct: the board is up while the host reads; the countdown runs over the players' faces
    const q = { type: 'howmany', words: 'TSMC profit soars', masked: 'Taiwanese chip giant TSMC said on Thursday that net profit soared ▮▮▮▮▮ to a record high in the third quarter.', sentence: 'Taiwanese chip giant TSMC said on Thursday that net profit soared 68.7% to a record high in the third quarter.', figure: { value: '68.7%', label: 'NET PROFIT UP', qualifier: '', exact: true }, aired: { programme: 'world-now', at: Date.parse('2026-10-16T16:56:00Z'), source: 'Euronews Business' } };
    const players = [{ seat: 'A', name: 'UNIT-8', id: 'unit8' }, { seat: 'B', name: 'PENNY', id: 'penny' }];
    const o = { question: q, players, countdown: null, guesses: [], revealAt: 15.5, now: Date.parse('2026-10-17T13:20:00Z') };
    const mid = (ctx) => ctx.fills.filter((f) => f.y >= 140 && f.y + f.h <= 236 && f.w * f.h > 0);
    const read = fakeCanvas().getContext('2d');
    VQ.VQUIZ.howmany(read, 3, o, BOX);
    assert.ok(mid(read).some((f) => f.c === PAL.slate && f.w === 96 && f.h === 27), 'the empty answer box, one width whatever the answer');
    const empty = mid(read).find((f) => f.c === PAL.slate && f.h === 27);
    assert.ok(read.images.some((im) => im.w > 100 && im.y + im.h <= empty.y && im.y >= empty.y - 30), 'YOUR GUESS? at 2x over it');
    const answer = fakeCanvas().getContext('2d');
    VQ.VQUIZ.howmany(answer, 17, { ...o, guesses: [{ seat: 'A', said: '70%', at: 10, points: 2 }, { seat: 'B', said: '50%', at: 12, points: 0 }] }, BOX);
    const box = mid(answer).find((f) => f.c === PAL.slate && f.h === 27);
    assert.ok(box && answer.images.some((im) => im.w >= 40 && im.y + im.h / 2 > box.y && im.y + im.h / 2 < box.y + box.h), 'the answer at 3x, in the box');
    for (const [ctx, label] of [[read, 'read'], [answer, 'answer']]) {
      inside(ctx, BOX, `HOW MANY? ${label}`);
      wordsSafe(ctx, `HOW MANY? ${label}`);
    }
  });

  test('a credit in the micro face is measured in it: never cut when it fits (17 Oct: "SOURCE: GUARDIA…")', async () => {
    const { measureText } = await import('../public/js/font.js');
    const { ellipsis } = await import('../public/js/gfx/index.js');
    const src = 'SOURCE: GUARDIAN SCIENCE';
    const w = measureText(src, 1, 'micro');
    assert.notEqual(ellipsis(src, w, 1), src, 'the body face\'s measure cut it');
    assert.equal(VB.microFit(src, w), src);
    assert.ok(measureText(VB.microFit(src, w - 10), 1, 'micro') <= w - 10);
    assert.ok(VB.microFit(src, w - 10).endsWith('...'));
  });

  test('the week\'s table never cuts a name mid-word (17 Oct: "PENNY STER…")', () => {
    assert.equal(VQ.tableName('Penny Sterling', 200), 'PENNY STERLING');
    assert.equal(VQ.tableName('Penny Sterling', 70), 'PENNY S.');
    assert.equal(VQ.tableName('Penny Sterling', 35), 'PENNY');
    assert.equal(VQ.tableName('UNIT-8', 40), 'UNIT-8');
  });

  test('SEVEN DAYS\'s HOW THE WEEK UNFOLDED set for the tall frame: the whole week (up to five days), no headline cut', () => {
    const STAGE = L.boardBox({ x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h });
    // the real week of 17 Oct (material of SEVEN DAYS), and a full five-day week
    const week4 = { timeline: [{ when: 'MON', what: 'Pope Leo XIV will have surgery' }, { when: 'WED', what: 'Pope Leo has cancerous growth removed' }, { when: 'WED', what: 'Vatican confirms the surgery went well' }, { when: 'FRI', what: 'Pope pictured for first time' }], source: 'Vatican News' };
    const week5 = { timeline: ['MON', 'TUE', 'WED', 'THU', 'FRI'].map((d, i) => ({ when: d, what: ['Talks open in Geneva', 'Both sides walk out', 'Mediators table a new plan', 'The plan is accepted in part', 'A ceasefire is signed'][i] })) };
    for (const [card, n] of [[week4, 4], [week5, 5]]) {
      const Lw = VB.verticalBoardLayout(card, STAGE.w - 16, STAGE.h - 8, 'seven-days');
      assert.equal(Lw.kicker, 'HOW THE WEEK UNFOLDED');
      assert.equal(Lw.rows.filter((r) => r.kind === 'day').length, n, `all ${n} days`);
      for (const r of Lw.rows) assert.ok(!r.lines.join(' ').includes('…'), `whole: ${r.lines.join(' ')}`);
      assert.equal(Lw.rows.map((r) => r.lines.join(' ')).join('|'), card.timeline.map((p) => p.what.toUpperCase()).join('|'), 'every headline whole, in order');
      for (const dt of [0.1, 0.8, 2, 4]) {
        const ctx = fakeCanvas().getContext('2d');
        assert.ok(VB.drawVerticalBoard(ctx, dt, card, { ...STAGE, programId: 'seven-days' }));
        inside(ctx, STAGE, `week of ${n} at ${dt}`);
        wordsSafe(ctx, `week of ${n} at ${dt}`);
      }
    }
    // a dated step is the timeline's (the date over its words); another programme keeps HOW WE GOT HERE
    const dated = { timeline: [{ when: '3 October 2026', what: 'The bridge closes' }, { when: '10 October', what: 'Cracks found' }] };
    assert.ok(VB.verticalBoardLayout(dated, STAGE.w - 16, STAGE.h - 8, 'seven-days').rows.every((r) => r.kind === 'step'));
    assert.equal(VB.verticalBoardLayout(week4, STAGE.w - 16, STAGE.h - 8, 'world-now').kicker, 'HOW WE GOT HERE');
  });

  test('WORLD WEATHER\'s boards set for the vertical stage stay inside it, at every step of the countdown', async () => {
    const W = await import('../public/js/clip/vweather.js');
    const STAGE = L.boardBox({ x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h });
    const place = (id, name, value) => ({ id, name, value, kind: 'cloudy' });
    const hc = { kind: 'hotcold', hot: [place('a', 'KHARTOUM', 41), place('b', 'AHVAZ', 41), place('c', 'A VERY LONG PLACE NAME INDEED', 39)], cold: [place('d', 'VOSTOK STATION', -58), place('e', 'YAKUTSK', -9), place('f', 'ULAANBAATAR', -6)] };
    const day = (max, min) => ({ max, min, kind: 'rain' });
    const ol = { kind: 'outlook', days: [{ name: 'TUE' }, { name: 'WED' }, { name: 'THU' }], cities: ['NEW YORK', 'LONDON', 'TOKYO', 'SYDNEY', 'SAO PAULO'].map((n, i) => ({ id: `c${i}`, name: n, days: [day(-12, -20), day(41, 30), day(9, 2)] })) };
    for (const [board, steps] of [[hc, [['c', 2], ['b', 3.5], ['a', 5], ['f', 7], ['e', 8.5], ['d', 10]]], [ol, ol.cities.map((c, i) => [c.id, 2 + i * 2])]]) {
      const spoken = new Map();
      for (const [id, at] of steps) {
        spoken.set(id, at);
        const done = spoken.size === steps.length ? at + 1.6 : null;
        for (const t of [at + 0.1, at + 1, at + 4]) {
          const ctx = fakeCanvas().getContext('2d');
          assert.ok(W.drawVerticalWeatherBoard(ctx, t, board, { since: 0, spoken: new Map(spoken), hot: id, hotAt: at, done, anySaid: true }, STAGE));
          inside(ctx, STAGE, `${board.kind} at ${t}`);
          wordsSafe(ctx, `${board.kind} at ${t}`);
        }
      }
    }
    assert.equal(W.drawVerticalWeatherBoard(fakeCanvas().getContext('2d'), 1, { kind: 'zone' }, { spoken: new Map() }, STAGE), false);
    // HOT AND COLD's value column: every chip one width, its right edges in line (41°, 39°, -58°, -6°)
    const all = new Map([['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 1], ['f', 1]]);
    const ctx = fakeCanvas().getContext('2d');
    W.drawVerticalWeatherBoard(ctx, 9, hc, { since: 0, spoken: all, hot: null, hotAt: 0, done: 2, anySaid: true }, STAGE);
    const chips = ctx.fills.filter((f) => f.h === 16 && f.w >= 30 && f.w <= 60);
    assert.equal(chips.length, 6, 'six chips');
    assert.equal(new Set(chips.map((f) => f.w)).size, 1, `one width: ${chips.map((f) => f.w)}`);
    assert.equal(new Set(chips.map((f) => f.x + f.w)).size, 1, 'one right edge');
    // THE NEXT THREE DAYS: every high's chip one width (19° as wide as 22°)
    const ol2 = { kind: 'outlook', days: ol.days, cities: [['NEW YORK', 22, 26, 20], ['PARIS', 25, 19, 22], ['PERTH', 27, 30, 19]].map(([n, a, b, c], i) => ({ id: `p${i}`, name: n, days: [a, b, c].map((max) => ({ max, min: 12, kind: 'cloudy' })) })) };
    const c2 = fakeCanvas().getContext('2d');
    W.drawVerticalWeatherBoard(c2, 9, ol2, { since: 0, spoken: new Map(), hot: null, hotAt: 0, done: null, anySaid: false }, STAGE);
    const highs = c2.fills.filter((f) => f.h === 16 && f.w >= 26 && f.w <= 60);
    assert.equal(highs.length, 9, 'nine highs');
    assert.equal(new Set(highs.map((f) => f.w)).size, 1, `one width: ${highs.map((f) => f.w)}`);
  });

  test('WORLD WEATHER\'s maps are composed for the vertical stage: every word in the safe column, the place named in view', async () => {
    const { WeatherDesk } = await import('../server/weather.js');
    const { writeWeather } = await import('../server/weatherwriter.js');
    const centre = await import('../public/js/scenes/weather/index.js');
    const { measureText } = await import('../public/js/font.js');
    (await import('../public/js/scenes/worldmap.js')).warmMapData();
    const report = await new WeatherDesk({ source: 'fixture', log: { info() {}, warn() {}, error() {} } }).report();
    const ep = writeWeather(report, { seed: 'vertical' });
    const STAGE = { x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h };
    const COLUMN = { x0: L.SAFE.x, x1: L.SAFE.right };
    const hctx = fakeCanvas(384, 216).getContext('2d');
    const scene = { weather: null, cast: { A: 'sam' }, channel: { name: 'GLOBIT 24', presenters: {} }, program: { id: 'world-weather' }, shot: 'weather' };
    const SPEAK = 15;
    const seen = new Set();
    let base = 5000;
    let litInColumn = 0;
    let mexico = 0;
    for (const [i, seg] of ep.segments.entries()) {
      const shot = centre.shotOf(seg);
      base += 100;
      scene.weather = { data: ep.weather, seg, index: i, since: base, dur: seg.text.length / SPEAK, hot: null, hotAt: 0, pin: null, pinAt: 0 };
      const map = ['graphic', 'wall', 'warning'].includes(shot);
      // (three zones: the tallest, the widest, the most crowded)
      if (seg.zone && !['north-america', 'europe', 'asia'].includes(seg.zone)) continue;
      const len = map ? seg.text.length / SPEAK : 1;
      // the voice at 15 characters a second, the frames at 4 a second, a vertical frame every second
      for (let k = 0; k <= Math.ceil(len * 4); k++) {
        const el = k / 4;
        for (const m of seg.marks || []) if (el >= m.char / SPEAK && scene.weather.hotAt < base + m.char / SPEAK) Object.assign(scene.weather, { hot: m.city, hotAt: base + m.char / SPEAK });
        for (const p of seg.pins || []) if (el >= p.char / SPEAK && scene.weather.pinAt < base + p.char / SPEAK) Object.assign(scene.weather, { pin: p, pinAt: base + p.char / SPEAK });
        hctx.fills.length = 0;
        hctx.images.length = 0;
        centre.drawWeather(hctx, base + el, scene, null);
        const ctx = fakeCanvas().getContext('2d');
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, STAGE.y, L.VW, STAGE.h);
        ctx.clip();
        const drew = centre.drawWeatherVertical(ctx, base + el, STAGE, COLUMN);
        ctx.restore();
        assert.equal(drew, map, `${shot}: composed for the tall frame only for the maps`);
        if (!drew || k % 4) continue;
        seen.add(shot);
        const label = `${seg.kind} ${seg.zone || ''} at ${el}s`;
        assert.ok(wordsSafe(ctx, label, { bottom: STAGE.y + STAGE.h }) > 0, `${label}: words drawn`);
        for (const im of ctx.images) if (im.h <= 24) assert.ok(im.y >= STAGE.y - 1, `${label}: a word above the stage ${JSON.stringify(im)}`);
        // the high or low being named stands lit in the column (the camera brought it in)
        if (shot === 'graphic' && el - (scene.weather.pinAt - base) > 1.2 && el - (scene.weather.pinAt - base) < 2.7 && scene.weather.pin) {
          const plate = ctx.fills.find((f) => f.w === 17 && f.h === 24);
          if (plate) {
            litInColumn++;
            assert.ok(plate.x >= COLUMN.x0 && plate.x + plate.w <= COLUMN.x1, `${label}: the named system in the column ${JSON.stringify(plate)}`);
          }
        }
        if (seg.zone === 'north-america' && el > 4) {
          const w = measureText('MEXICO CITY', 1, 'micro');
          if (ctx.images.some((im) => Math.abs(im.w - w) <= 1 && im.x >= COLUMN.x0 && im.x + im.w <= COLUMN.x1 + 1)) mexico++;
        }
      }
    }
    assert.deepEqual([...seen].sort(), ['graphic', 'wall', 'warning'], 'the world, the zones and the warning are all composed');
    assert.ok(litInColumn > 0, 'a named high or low checked in the column');
    assert.ok(mexico > 0, 'MEXICO CITY whole in the column');
  });

  test('FULL TIME\'s RESULT card and SCORE CENTRE set for the vertical stage stay inside it', async () => {
    const SP = await import('../public/js/clip/vsport.js');
    const STAGE = L.boardBox({ x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h });
    const cards = [
      { score: { a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, home: 'Coventry', sport: 'football' }, source: 'Sky Sports' },
      { score: { a: 'Brighton & Hove Albion', b: 'Wolverhampton Wanderers Women Under Twenty-Ones', sa: 3, sb: 0, home: 'Wolverhampton Wanderers Women Under Twenty-Ones', sport: 'football', stage: 'SEMI-FINAL' }, source: 'A Very Long Source Name Indeed And Another' },
      { score: { a: 'Portland Trail Blazers', b: 'London Lions', sa: 119, sb: 66, draw: false, sport: 'basketball' } },
      { score: { a: 'Starfield City', b: 'Ledgerton Rovers', sa: 2, sb: 2, draw: true } },
    ];
    for (const c of cards) for (const dt of [0.1, 0.5, 1, 5]) {
      const ctx = fakeCanvas().getContext('2d');
      assert.ok(SP.drawVerticalScoreline(ctx, dt, c, STAGE));
      inside(ctx, STAGE, `scoreline ${c.score.a} at ${dt}`);
      wordsSafe(ctx, `scoreline ${c.score.a} at ${dt}`);
    }
    const row = (a, b, sa, sb, day) => ({ a, b, sa, sb, sport: 'football', day });
    for (const n of [1, 3, 4, 5, 6]) {
      const rows = Array.from({ length: n }, (_, i) => row(`Home Side Number ${i} With A Long Name`, `Away ${i}`, 100 + i, i, i % 2 ? 'SUN' : null));
      const ctx = fakeCanvas().getContext('2d');
      assert.ok(SP.drawVerticalScoreboard(ctx, 20, { scores: rows, title: 'THE WEEKEND\'S RESULTS', source: 'Sky Sports / BBC Sport / The Guardian / Another' }, STAGE));
      inside(ctx, STAGE, `scoreboard of ${n}`);
      wordsSafe(ctx, `scoreboard of ${n}`);
    }
    assert.equal(SP.drawVerticalScoreline(fakeCanvas().getContext('2d'), 1, { score: null }, STAGE), false);
    // COMING UP and THE MOMENT ON THE BOARD, set for the tall frame (they fell back to the middle crop before)
    const { P: PAL } = await import('../public/js/palette.js');
    const fx = { title: 'THE WEEKEND AHEAD', source: 'BBC Sport', fixtures: [{ event: 'Arsenal v Manchester City', date: '2026-10-18', when: 'SUNDAY 16:30', sport: 'football' }, { event: 'Wolverhampton Wanderers v Brighton & Hove Albion', date: '2026-10-19', when: 'MONDAY 20:00', sport: 'football' }, { event: 'Leinster v Munster', when: 'NEXT WEEK', sport: 'rugby' }] };
    for (const dt of [0.1, 0.5, 1.5, 5]) {
      const ctx = fakeCanvas().getContext('2d');
      assert.ok(SP.drawVerticalComingUp(ctx, dt, fx, STAGE, PAL.orange));
      inside(ctx, STAGE, `coming up at ${dt}`);
      wordsSafe(ctx, `coming up at ${dt}`);
    }
    assert.equal(SP.drawVerticalComingUp(fakeCanvas().getContext('2d'), 1, { fixtures: [fx.fixtures[0]] }, STAGE), false, 'one fixture is no board');
    // a side too long for its column never runs under the sport's icon (17 Oct, the lab: "WOLVERHAMPTON WANDERER" under
    // the ball): the row gives up its icon, and the name is whole
    const iconX = STAGE.x + 8 + (STAGE.w - 16) - 10 - 9;
    const cu = fakeCanvas().getContext('2d');
    SP.drawVerticalComingUp(cu, 5, fx, STAGE, PAL.orange);
    const icons = cu.fills.filter((f) => f.x >= iconX && f.x < iconX + 9 && f.c === PAL.fog);
    const words = cu.images.filter((im) => im.h <= 24);
    for (const ic of icons) for (const im of words) if (im.y < ic.y + ic.h && ic.y < im.y + im.h) assert.ok(im.x + im.w <= iconX + 1 || im.x >= iconX + 9, `a word under the icon: ${JSON.stringify(im)}`);
    const rowsWithIcon = new Set(icons.map((f) => Math.floor((f.y - STAGE.y - 26) / 44)));
    assert.ok(!rowsWithIcon.has(1), 'the Wolverhampton row gives up its icon');
    for (const chalk of [{ yards: 30, sport: 'football' }, { yards: 45, sport: 'american-football' }, { metres: 40, sport: 'rugby', label: 'FROM HALFWAY' }]) {
      for (const dt of [0.2, 1, 3]) {
        const ctx = fakeCanvas().getContext('2d');
        assert.ok(SP.drawVerticalChalkboard(ctx, dt, { chalk }, STAGE));
        inside(ctx, STAGE, `chalkboard ${chalk.sport} at ${dt}`);
        wordsSafe(ctx, `chalkboard ${chalk.sport} at ${dt}`);
      }
    }
    assert.equal(SP.drawVerticalChalkboard(fakeCanvas().getContext('2d'), 1, { chalk: { yards: 300 } }, STAGE), false, 'a distance it cannot draw to scale: no board');
    // SCORE CENTRE: the winner's score in the accent, a draw's two in white (as on the RESULT card)
    const { P } = await import('../public/js/palette.js');
    const accentWords = (rows) => {
      const ctx = fakeCanvas().getContext('2d');
      SP.drawVerticalScoreboard(ctx, 20, { scores: rows, title: 'RESULTS', source: '' }, STAGE, P.orange);
      return ctx.images.filter((im) => im.img?.getContext && im.img.getContext('2d').fills.some((f) => f.c === P.orange)).length;
    };
    assert.equal(accentWords([row('Brightwater', 'Kestrel Vale', 0, 0)]), 1, 'a draw: only the title in the accent');
    assert.equal(accentWords([row('Northgate', 'Saltmarsh', 3, 2)]), 2, 'a win: the title and the winner\'s score');
  });

  test('the hook and the end card stay inside the frame; the vertical end card\'s words inside the platforms\' safe area', () => {
    for (const profile of ['normal', 'tall']) {
      for (const lines of [['HOW MANY?', 'PLAY ALONG'], ['FULL ROUND'], ['UNIT-8 HAS A', 'THOUGHT']]) {
        const v = fakeCanvas(216, 384).getContext('2d');
        cards.drawHook(v, { format: 'vertical', lines, programme: 'PAY ATTENTION', profile });
        inside(v, { x: 0, y: 0, w: 216, h: 384 }, `vertical hook ${profile} ${lines}`);
        wordsSafe(v, `vertical hook ${profile} ${lines}`);
        for (const im of v.images) assert.ok(im.y + im.h <= (profile === 'tall' ? L.V.title.y : L.V.stage.y), 'the hook keeps to the mast and title band');
        const h = fakeCanvas(384, 216).getContext('2d');
        cards.drawHook(h, { format: 'horizontal', lines, programme: 'PAY ATTENTION', profile });
        inside(h, { x: 0, y: 0, w: 384, h: 216 }, `horizontal hook ${profile}`);
      }
    }
    for (const t of [0.2, 1, 2.5]) {
      const v = fakeCanvas(216, 384).getContext('2d');
      cards.drawEndCard(v, t, { format: 'vertical', programme: 'COSMOS DESK' });
      inside(v, { x: 0, y: 0, w: 216, h: 384 }, `vertical end card at ${t}`);
      wordsSafe(v, `vertical end card at ${t}`);
      const h = fakeCanvas(384, 216).getContext('2d');
      cards.drawEndCard(h, t, { format: 'horizontal', programme: 'COSMOS DESK' });
      inside(h, { x: 0, y: 0, w: 384, h: 216 }, `horizontal end card at ${t}`);
    }
  });

  test('the vertical frame\'s own bands: the source and NEWS IN 60\'s minute on the stage (the hook holds the title band in a clip), a foot with nothing to read', async () => {
    const mark = await import('../public/js/clip/mark.js');
    await mark.markReady;
    const { VerticalCompositor, profileOf } = await import('../public/js/clip/vertical.js');
    const strap = { cur: { headline: 'NASA to conduct low-altitude flights over Texas', tag: 'TRANSPORT', plate: 'NASA', since: 0 }, outAt: null };
    const canvas = fakeCanvas(216, 384);
    const comp = new VerticalCompositor({ canvas, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
    const scene = { shot: 'close', program: { id: 'cosmos', title: 'COSMOS DESK', theme: 'space' }, storyId: 's1', rundown: [{ storyId: 's1', source: 'NASA' }] };
    comp.profile = profileOf(scene);
    comp.box = comp.profile.box;
    const ctx = canvas.getContext('2d');
    comp.drawMast(9, scene);
    comp.drawTitle(9, scene);
    const band = ctx.images.length;
    comp.sourcePlate(9, scene);
    comp.caps.update(1, 'NASA will fly low over the Texas farmland this autumn to measure emissions from the fields.', 30);
    comp.caps.draw(ctx, 1, { cx: L.SAFE.cx, bottom: L.V.caps.y + L.V.caps.h - 4 });
    const before = ctx.images.length;
    comp.drawFoot(9, scene);
    assert.ok(wordsSafe(ctx, 'mast, title, source, captions') > 5);
    // the source on a plate at the stage's top left, inside the safe column (a clip's hook covers the whole band)
    const plate = ctx.fills.find((f) => f.y === L.V.stage.y + 4 && f.h === 9);
    assert.ok(plate && plate.x === L.SAFE.x && plate.y === L.V.stage.y + 4, JSON.stringify(plate));
    assert.ok(ctx.images.slice(band, before).some((im) => im.y >= L.V.stage.y && im.y < L.V.stage.y + 16), 'SOURCE: NASA at the stage\'s top left');
    assert.ok(!ctx.images.slice(0, band).some((im) => im.y >= L.V.title.y && im.y < L.V.title.y + 16 && im.x > 50), 'nothing beside the tag: the hook covers the band');
    const footWords = ctx.images.slice(before).filter((im) => im.h <= 8);
    assert.equal(footWords.length, 0, 'no source or other small type in the foot (the feeds cover it)');
    // no plate once the strap has gone, nor on the quiz's tall stage
    const c2 = fakeCanvas(216, 384);
    const comp2 = new VerticalCompositor({ canvas: c2, source: fakeCanvas(384, 216), renderer: { graphics: { strap: { ...strap, outAt: 8 } } }, channel: { name: 'GLOBIT 24' } });
    comp2.profile = comp.profile;
    comp2.box = comp.box;
    comp2.sourcePlate(9, scene);
    assert.equal(c2.getContext('2d').images.length, 0);
    // NEWS IN 60: its progress rule across the safe column along the stage's top edge
    const c60 = fakeCanvas(216, 384);
    const comp60 = new VerticalCompositor({ canvas: c60, source: fakeCanvas(384, 216), renderer: { graphics: { strap: { ...strap, progress: 0.5 } } }, channel: { name: 'GLOBIT 24' } });
    comp60.profile = comp.profile;
    comp60.box = comp.box;
    comp60.progressRule();
    const { P: PAL } = await import('../public/js/palette.js');
    const fill = c60.getContext('2d').fills.find((f) => f.c === PAL.yellow && f.y === L.V.stage.y);
    assert.ok(fill && fill.x === L.SAFE.x && fill.w === Math.floor(L.SAFE.w / 2), JSON.stringify(fill));
    // the montage takes the captions' rows: its headline at the safe area's foot, no caption over it
    const m = profileOf({ shot: 'montage', program: { id: 'world-now' } });
    assert.equal(m.captions, false);
    assert.equal(m.box.y + m.box.h, L.PLATFORM_SAFE.bottom);
  });

  test('pictures in the vertical frame: the credit legible in the safe column, wrapped never cut; the locator and topic boards set for the tall backdrop', async () => {
    const mark = await import('../public/js/clip/mark.js');
    await mark.markReady;
    const { VerticalCompositor, profileOf, drawVerticalCredit, creditWords } = await import('../public/js/clip/vertical.js');
    const { P: PAL } = await import('../public/js/palette.js');
    const { measureText } = await import('../public/js/font.js');
    (await import('../public/js/scenes/worldmap.js')).warmMapData();
    // the credit alone: the tag in body type, the credit in micro type, light on black, every word in the column
    const long = 'FILE · ALEXANDRA KONSTANTINOPOULOU-WHITTAKER · CC BY-SA 4.0 · PIXELATED';
    for (const [credit, uncleared] of [['FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED', false], [long, false], ['FILE 2023 · NASA/JOEL KOWSKY', false], ['PHOTO · REUTERS', true]]) {
      const ctx = fakeCanvas().getContext('2d');
      const h = drawVerticalCredit(ctx, credit, { x: L.SAFE.x, y: L.V.stage.y + 16, w: L.SAFE.w, uncleared });
      assert.ok(h >= 11);
      assert.ok(wordsSafe(ctx, credit) >= 2);
      for (const f of ctx.fills) assert.ok(f.x >= L.SAFE.x && f.x + f.w <= L.SAFE.right, `${credit}: a plate outside the column ${JSON.stringify(f)}`);
      assert.ok(ctx.fills.every((f) => f.c === PAL.black && f.h === 11), 'black plates 11 px tall: body type (35 px on 1920), read over any picture');
      // legible: every line in the body face (7 px glyphs), never the micro face
      assert.ok(ctx.images.every((im) => im.h >= 7), `${credit}: a line in the micro face ${JSON.stringify(ctx.images.map((im) => im.h))}`);
      if (uncleared) assert.ok(ctx.images.length >= 3, 'PREVIEW · NOT CLEARED under it');
    }
    // never cut: every word of the credit is on a line, a part kept whole where it fits
    const text = 'ALEXANDRA KONSTANTINOPOULOU-WHITTAKER · CC BY-SA 4.0 · PIXELATED';
    const squash = (t) => t.replace(/[\s·]+/g, '');
    for (const [first, rest] of [[141, 172], [100, 100], [60, 60]]) {
      const lines = creditWords(text, first, rest);
      assert.equal(squash(lines.join('')), squash(text), `every letter kept at ${first}/${rest}: ${JSON.stringify(lines)}`);
      lines.forEach((l, i) => assert.ok(measureText(l) <= (i ? rest : first), `${l} fits ${i ? rest : first}`));
    }
    assert.deepEqual(creditWords(text, 141, 172), ['ALEXANDRA', 'KONSTANTINOPOULOU-WHITTAKER ·', 'CC BY-SA 4.0 · PIXELATED']);
    // the compositor: a story's picture full frame carries its credit under the source plate; a link's file footage too
    const strap = { cur: { headline: 'Storm floods the valley', tag: 'WEATHER', plate: 'BBC', since: 0 }, outAt: null };
    const canvas = fakeCanvas(216, 384);
    const comp = new VerticalCompositor({ canvas, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
    const picture = fakeCanvas(400, 240);
    const scene = { shot: 'full', shotSince: 0, program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, storyId: 's1', images: new Map([['s1', { full: picture, card: picture }]]), pictureCredits: new Map([['s1', { credit: 'FILE · JANE DOE · CC BY-SA 4.0 · PIXELATED', uncleared: false }]]), rundown: [{ storyId: 's1', source: 'BBC', headline: 'Storm floods the valley' }] };
    comp.profile = profileOf(scene);
    comp.box = comp.profile.box;
    comp.drawStage(2, scene);
    const ctx = canvas.getContext('2d');
    const tag = ctx.fills.find((f) => f.y === L.V.stage.y + 16 && f.h === 11);
    assert.ok(tag && tag.x === L.SAFE.x, `the credit's FILE tag under the source plate: ${JSON.stringify(tag)}`);
    assert.ok(wordsSafe(ctx, 'full picture with its credit', { bottom: L.V.stage.y + L.V.stage.h }) >= 3);
    const fileCtx = fakeCanvas(216, 384);
    const comp2 = new VerticalCompositor({ canvas: fileCtx, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
    comp2.profile = comp.profile;
    comp2.box = comp.box;
    comp2.drawStage(2, { ...scene, shot: 'broll', card: { footage: 'f1' }, remote: { kind: 'correspondent' }, fileCredit: 'FILE · WIKIMEDIA COMMONS · CC BY 4.0' });
    assert.ok(fileCtx.getContext('2d').fills.some((f) => f.y === L.V.stage.y + 16 && f.h === 11), "the file footage's credit");
    // no picture on the stage (the studio single): no credit
    const c3 = fakeCanvas(216, 384);
    const comp3 = new VerticalCompositor({ canvas: c3, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
    comp3.profile = comp.profile;
    comp3.box = comp.box;
    assert.equal(comp3.pictureCredit({ ...scene, shot: 'close' }), 0);
    // the headline frame without a picture: the place's locator board, its name in the column; without a place, the
    // topic board (the story's own figure, quote, actor or topic), every word of it in the column, over the headline
    const boards = [
      { storyId: 't1', headline: 'Startup raises $1.3bn for a new AI chip', source: 'TechCrunch', category: 'tech' },
      { storyId: 't2', headline: "'It was fake': villagers allege a staged rescue", source: 'BBC', category: 'world' },
      { storyId: 't3', headline: 'Replit lets anyone build apps by talking to them', source: 'TechCrunch', category: 'tech', board: { kind: 'actor', name: 'REPLIT', about: 'COMPANY AND ONLINE CODING ENVIRONMENT' } },
      { storyId: 't4', headline: 'Carers left waiting as the allowance rule changes', source: 'BBC', category: 'politics' },
    ];
    for (const item of boards) {
      const c = fakeCanvas(216, 384);
      const cm = new VerticalCompositor({ canvas: c, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
      const sc = { shot: 'montage', shotSince: 0, program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, card: { index: 0 }, rundown: [item], images: new Map() };
      cm.profile = profileOf(sc);
      cm.box = cm.profile.box;
      cm.drawStage(3, sc);
      const g = c.getContext('2d');
      assert.ok(wordsSafe(g, `topic board ${item.storyId}`) >= 2);
      assert.ok(g.images.some((im) => im.w === L.VW && im.h === cm.box.h && im.y === cm.box.y), `${item.storyId}: the board's field for the tall backdrop`);
      // the board's own words above the headline's plate (the plate rises at most 106 rows from the stage's foot)
      for (const im of g.images.filter((x) => x.h <= 48 && x.y < cm.box.y + cm.box.h - 106 && x.y > cm.box.y)) assert.ok(im.x >= L.SAFE.x - 1 && im.x + im.w <= L.SAFE.right + 1, `${item.storyId}: ${JSON.stringify(im)}`);
    }
    // FULL TIME (no topic board in sport): a result without a picture or a place shows its sport's tag in the field,
    // never an empty stage (round 6, the first real edition's montage), the tag inside the column above the plate
    for (const [kicker, scale] of [['FOOTBALL', 2], ['RUGBY UNION', 2], ['WINTER OLYMPICS', 1]]) {
      const c = fakeCanvas(216, 384);
      const cm = new VerticalCompositor({ canvas: c, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
      const item = { storyId: 'f1', headline: 'Coventry thump Newcastle for first home win', source: 'Sky Sports', category: 'sport', kicker, board: { kind: 'none' } };
      const sc = { shot: 'montage', shotSince: 0, program: { id: 'full-time', title: 'FULL TIME', theme: 'sport' }, card: { index: 0 }, rundown: [item], images: new Map() };
      cm.profile = profileOf(sc);
      cm.box = cm.profile.box;
      cm.drawStage(3, sc);
      const g = c.getContext('2d');
      assert.ok(wordsSafe(g, `sport tag ${kicker}`) >= 2);
      const tab = g.fills.find((f) => f.c === PAL.ink && f.h === 7 * scale + 10);
      assert.ok(tab, `${kicker}: the tag's tab at ${scale}x`);
      assert.ok(tab.x >= L.SAFE.x && tab.x + tab.w <= L.SAFE.right, `${kicker}: the tab in the column ${JSON.stringify(tab)}`);
      assert.ok(tab.y > cm.box.y && tab.y + tab.h < cm.box.y + cm.box.h - 106, `${kicker}: the tab above the tallest plate ${JSON.stringify(tab)}`);
      const word = g.images.map(visible).filter(Boolean).find((v) => v.y >= tab.y && v.y + v.h <= tab.y + tab.h && v.x > tab.x && v.x + v.w < tab.x + tab.w);
      assert.ok(word && word.h >= 6 * scale, `${kicker}: its word on the tab, at ${scale}x ${JSON.stringify(word)}`);
    }
    for (const item of [{ storyId: 'p1', headline: 'Flooding closes roads across the north of the country', source: 'BBC', location: { lat: 37.2, lon: -119.5, place: 'CALIFORNIA, USA' } }]) {
      const c = fakeCanvas(216, 384);
      const cm = new VerticalCompositor({ canvas: c, source: fakeCanvas(384, 216), renderer: { graphics: { strap } }, channel: { name: 'GLOBIT 24' } });
      const sc = { shot: 'montage', shotSince: 0, program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, card: { index: 0 }, rundown: [item], images: new Map() };
      cm.profile = profileOf(sc);
      cm.box = cm.profile.box;
      cm.drawStage(3, sc);
      const g = c.getContext('2d');
      assert.ok(wordsSafe(g, `headline frame ${item.storyId}`) >= 2);
      const backdrop = g.images.find((im) => im.w === L.VW && im.h === cm.box.h && im.y === cm.box.y);
      assert.ok(backdrop, `${item.storyId}: a board drawn for the tall backdrop`);
      const accent = g.fills.find((f) => f.w === 2 && f.h >= 13 && f.y < cm.box.y + cm.box.h - 64 && f.c !== PAL.ink);
      assert.ok(accent && accent.x >= L.SAFE.x && accent.x <= L.SAFE.right, `${item.storyId}: the name's plate in the column ${JSON.stringify(accent)}`);
      // a city's dot is never under its own name (no room either side in 216 px: the name goes under it)
      const dot = g.fills.find((f) => f.w === 7 && f.h === 7 && f.c === PAL.black);
      const plate = g.fills.find((f) => f.c === PAL.ink && (f.h === 13 || f.h === 21) && f.x === accent.x);
      if (dot && plate) assert.ok(dot.y + 7 <= plate.y || dot.y >= plate.y + plate.h || dot.x + 7 <= plate.x || dot.x >= plate.x + plate.w, `the dot under the name: ${JSON.stringify({ dot, plate })}`);
      if (item.location) assert.ok(dot && plate, 'the locator drew its dot and its name');
    }
  });

  test('the AI mark docks to the bug in every clip (the compliance desk\'s own when it is there)', async () => {
    const mark = await import('../public/js/clip/mark.js');
    await mark.markReady;
    const ctx = fakeCanvas(216, 384).getContext('2d');
    const w = G.drawBugOnly(ctx, 5, 0, 8, 10);
    assert.ok(w > mark.clipMarkWidth(), 'the bug and its mark');
    const { P } = await import('../public/js/palette.js');
    assert.ok(ctx.fills.some((f) => f.c === P.yellow && f.x >= 8 + 48), 'a yellow plate right of the bug');
    // never twice: the bug's own row draws no mark (not even one clipped away), the clip's is the only one
    const yellow = ctx.fills.filter((f) => f.c === P.yellow);
    const span = Math.max(...yellow.map((f) => f.x + f.w)) - Math.min(...yellow.map((f) => f.x));
    assert.ok(span <= mark.clipMarkWidth(), `one mark's width of yellow, no more: ${JSON.stringify(yellow)}`);
    assert.ok(yellow.every((f) => visible(f)), 'no mark drawn into a clip that hides it (the bug row\'s own, clipped away)');
  });

  test('captions: whole words, at most two lines a page within the width, a weak word never ends a line', () => {
    const text = 'A rare family of barn owls has moved into Manhattan, and New Yorkers have been gathering in the park every evening to watch the young birds learn to fly.';
    const pages = caps.pagesOf(text, 200, 2, 2);
    const all = pages.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => w.w)));
    assert.deepEqual(all, text.split(' '), 'every word, once, in order');
    for (const p of pages) {
      assert.ok(p.lines.length <= 2);
      for (const l of p.lines) {
        assert.ok(l.width <= 200, `${l.text}: ${l.width}`);
        const last = l.words.at(-1).w.toUpperCase();
        if (l.words.length > 1 && l !== p.lines.at(-1)) assert.ok(!['THE', 'OF', 'A', 'TO', 'IN'].includes(last), `ends on "${last}"`);
      }
    }
    assert.equal(caps.pageIndexAt(pages, 0), 0);
    assert.equal(caps.pageIndexAt(pages, text.length - 1), pages.length - 1);
  });

  test('the word being said is lit, except over grave news', async () => {
    const c = new caps.WordCaptions({ maxW: 200, scale: 2, perPage: 2 });
    const s = 'Evacuation orders are in place as a wildfire burns homes.';
    c.update(1, s, 12, { grave: false });
    const lit = fakeCanvas(216, 384).getContext('2d');
    c.draw(lit, 1, { cx: 108, bottom: 296 });
    c.update(1.1, s, 12, { grave: true });
    const flat = fakeCanvas(216, 384).getContext('2d');
    c.draw(flat, 1.1, { cx: 108, bottom: 296 });
    const { P } = await import('../public/js/palette.js');
    // font.js draws each text into its own small canvas: its glyph fills carry the colour
    const colours = (ctx) => new Set(ctx.images.flatMap((im) => (im.img?.getContext ? im.img.getContext('2d').fills.map((f) => f.c) : [])));
    assert.ok(colours(lit).has(P.yellow), 'the word being said is yellow');
    assert.ok(!colours(flat).has(P.yellow), 'nothing lit over grave news');
  });

  test('a voice reading what the board shows is not captioned twice', () => {
    const scene = { shot: 'quiz', card: { question: { masked: 'And finally: Taiwanese chip giant TSMC said on Thursday that net profit soared ▮▮▮▮ to a record high in the third quarter.' } } };
    assert.ok(G.boardRepeats('And finally: Taiwanese chip giant TSMC said on Thursday that net profit soared blank to a record high in the third quarter.', scene));
    assert.ok(!G.boardRepeats('Round one is HOW MANY? No options. Just your best guess.', scene));
    assert.ok(!G.boardRepeats('And finally: Taiwanese chip giant TSMC said profit soared.', { shot: 'studio', card: scene.card }));
  });

  test('the thumbnail\'s lead: three lines of eleven at most, cut at its own break, never on a weak word', () => {
    assert.deepEqual(thumb.thumbLines('A rare family of barn owls moves to Manhattan'), ['A RARE', 'FAMILY OF', 'BARN OWLS']);
    assert.deepEqual(thumb.thumbLines('Owls return: a city watches the young fly'), ['OWLS RETURN'], 'cut at its own colon');
    for (const t of ['Arctic sea ice hits another troubling low in both winter and summer', 'NASA names Stephen Cash Marshall Space Flight Center director']) {
      const ls = thumb.thumbLines(t);
      assert.ok(ls && ls.length <= 3 && ls.every((l) => l.length <= 11), `${t}: ${ls}`);
      assert.ok(!['OF', 'TO', 'THE', 'A', 'AND', 'IN'].includes(ls.at(-1).split(' ').at(-1)));
    }
    assert.equal(thumb.thumbLines(''), null);
    // a first word longer than 11 (LONG-SERVING): the 2x lead of 16 a line
    assert.equal(thumb.thumbLines('Long-serving ABC broadcaster Robyn Williams to leave Science Show after 51 years'), null);
    const two = thumb.thumbLines('Long-serving ABC broadcaster Robyn Williams to leave Science Show after 51 years', { chars: 16, max: 3 });
    assert.ok(two && two.length <= 3 && two.every((l) => l.length <= 16) && two[0].startsWith('LONG-SERVING'), String(two));
  });

  test('horizontal captions keep clear of a map\'s place label; a strap of another story is never shown', () => {
    const size = { w: 300, h: 46 };
    // the label just above the strap, where the captions would be (TEXAS, USA on 17 Oct: label 100-118, captions
    // 106-152): they go to the top
    assert.deepEqual(G.captionSpot({ label: { x: 150, y: 100, w: 60, h: 18 }, size, bottom: 152 }), { top: 40 });
    assert.deepEqual(G.captionSpot({ label: { x: 150, y: 100, w: 60, h: 18 }, size, bottom: 166 }), { bottom: 166 }, 'clear by 2 px and more: they stay');
    // a label high on the map: the captions stay over the strap
    assert.deepEqual(G.captionSpot({ label: { x: 150, y: 44, w: 60, h: 18 }, size, bottom: 166 }), { bottom: 166 });
    // a label at the frame's side, clear of a short page
    assert.deepEqual(G.captionSpot({ label: { x: 300, y: 130, w: 60, h: 18 }, size: { w: 120, h: 20 }, bottom: 166 }), { bottom: 166 });
    // nothing clear: over the strap as always
    assert.deepEqual(G.captionSpot({ label: { x: 20, y: 30, w: 340, h: 140 }, size, bottom: 166 }), { bottom: 166 });
    assert.deepEqual(G.captionSpot({ label: null, size, bottom: 166 }), { bottom: 166 });
    const rundown = [{ storyId: 'a', headline: 'Historic cannons airlifted for restoration' }, { storyId: 'b', headline: 'NASA to conduct low-altitude flights' }];
    assert.ok(G.strapOfAnotherStory({ headline: 'Historic cannons airlifted for restoration' }, { storyId: 'b', rundown }), 'the last story\'s strap on the next story\'s shot');
    assert.ok(!G.strapOfAnotherStory({ headline: 'NASA to conduct low-altitude flights' }, { storyId: 'b', rundown }));
    assert.ok(!G.strapOfAnotherStory({ headline: 'DR NOVA REYES' }, { storyId: 'b', rundown }), 'a name strap is no story\'s');
    assert.ok(!G.strapOfAnotherStory({ headline: 'Historic cannons airlifted for restoration' }, { storyId: null, rundown }), 'no story on the shot: nothing to compare');
    // the strap flips from the last story's headline to the new one at the cut (17 Oct, 99.2 s): a clip settles it
    const strap = { prev: { headline: 'Historic cannons airlifted for restoration' }, cur: { headline: 'NASA to conduct low-altitude flights' }, flipAt: 100.65, textAt: 101.1 };
    assert.ok(G.settleFlip(strap, { storyId: 'b', rundown }, 100.7));
    assert.equal(strap.prev, null);
    assert.equal(strap.flipAt, -Infinity);
    assert.ok(strap.textAt <= 100.7, 'the new headline is up at once');
    // a flip within one story (a breaking change of the same headline's content) is left to play
    const same = { prev: { headline: 'NASA to conduct low-altitude flights' }, cur: { headline: 'NASA to conduct low-altitude flights' }, flipAt: 1, textAt: 2 };
    assert.ok(!G.settleFlip(same, { storyId: 'b', rundown }, 1.1));
    assert.ok(same.prev);
  });

  test('the map reports its place label, and its context names keep out of a caption band whole', async () => {
    const WM = await import('../public/js/scenes/worldmap.js');
    const draw = () => {
      const ctx = fakeCanvas(384, 216).getContext('2d');
      WM.drawWorldMap(ctx, 20, 6, { lat: 31.5, lon: -99.3, place: 'TEXAS, USA', programId: 'cosmos' });
      return ctx;
    };
    WM.mapKeepOut(null);
    WM.takeMapLabel();
    // (the map loads its data a few milliseconds a frame: drawn until it is ready)
    let free = null;
    let label = null;
    for (let i = 0; i < 2000 && !label; i++) {
      free = draw();
      label = WM.takeMapLabel();
    }
    assert.ok(label && label.w > 0 && label.h > 0 && label.cw === 384 && label.ch === 216, JSON.stringify(label));
    assert.equal(WM.takeMapLabel(), null, 'read once');
    // the context names: micro words drawn inside a clip box of their own
    const names = (ctx) => ctx.images.filter((im) => im.clip && im.clip.h <= 12 && !(im.clip.x === label.x && im.clip.y === label.y));
    assert.ok(names(free).length >= 1, 'the map names its neighbours');
    const band = { x: 0, y: 0, w: 384, h: 216 };
    WM.mapKeepOut(band);
    const kept = draw();
    WM.mapKeepOut(null);
    assert.equal(names(kept).length, 0, 'a name under the band is not drawn at all');
    assert.ok(WM.takeMapLabel(), 'the place label itself is still drawn and reported');
  });

  test('the thumbnail\'s band and type stay on their side: on the right, clear of a presenter standing left', () => {
    const lines = ['LONG-SERVING ABC', 'BROADCASTER', 'ROBYN WILLIAMS'];
    for (const side of ['left', 'right']) {
      const ctx = fakeCanvas(384, 216).getContext('2d');
      thumb.drawThumb(ctx, { frame: null, programme: 'COSMOS DESK', lines, kicker: 'FULL PROGRAMME · 17 OCT', side });
      // the dither: black single pixels, only within the band on its side
      const dots = ctx.fills.filter((f) => f.w === 1 && f.h === 1 && f.y > 30);
      assert.ok(dots.length > 1000, side);
      const xs = dots.map((f) => f.x);
      if (side === 'left') assert.ok(Math.max(...xs) < thumb.THUMB_BAND, `left band ends by ${thumb.THUMB_BAND}`);
      else assert.ok(Math.min(...xs) >= 384 - thumb.THUMB_BAND, `right band starts at ${384 - thumb.THUMB_BAND}`);
      // the type (the words, drawn as images, and the plate and bar below the bug) inside the frame, on its side
      const words = ctx.images.filter((im) => im.y > 30);
      assert.ok(words.length >= 9, `${side}: the name, three lines and the kicker, with their shadows`);
      const type = [...words, ...ctx.fills.filter((f) => f.y > 30 && !(f.w === 1 && f.h === 1) && !(f.w === 384 && f.h === 216))];
      for (const f of type) assert.ok(f.x >= 0 && f.x + f.w <= 384 && f.y + f.h <= 216, `${side}: ${JSON.stringify(f)}`);
      if (side === 'right') assert.ok(Math.min(...type.map((f) => f.x)) >= 384 - thumb.THUMB_BAND, 'the type stays over the band');
      else assert.ok(Math.max(...type.map((f) => f.x + f.w)) <= thumb.THUMB_BAND, 'the type stays over the band');
    }
  });
});

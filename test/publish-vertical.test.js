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

  test('every PAY ATTENTION board set for the tall stage stays inside its 216x216 box at every moment', () => {
    const BOX = { x: 0, y: 32, w: 216, h: 216 };
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
        n++;
      }
    }
    assert.ok(n > 30, `${n} board moments checked`);
  });

  test('every news board set for the vertical stage stays inside its box', () => {
    const STAGE = { x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h };
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
        }
      }
    }
  });

  test('WORLD WEATHER\'s boards set for the vertical stage stay inside it, at every step of the countdown', async () => {
    const W = await import('../public/js/clip/vweather.js');
    const STAGE = { x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h };
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

  test('FULL TIME\'s RESULT card and SCORE CENTRE set for the vertical stage stay inside it', async () => {
    const SP = await import('../public/js/clip/vsport.js');
    const STAGE = { x: 0, y: L.V.stage.y, w: L.VW, h: L.V.stage.h };
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
    }
    const row = (a, b, sa, sb, day) => ({ a, b, sa, sb, sport: 'football', day });
    for (const n of [1, 3, 4, 5, 6]) {
      const rows = Array.from({ length: n }, (_, i) => row(`Home Side Number ${i} With A Long Name`, `Away ${i}`, 100 + i, i, i % 2 ? 'SUN' : null));
      const ctx = fakeCanvas().getContext('2d');
      assert.ok(SP.drawVerticalScoreboard(ctx, 20, { scores: rows, title: 'THE WEEKEND\'S RESULTS', source: 'Sky Sports / BBC Sport / The Guardian / Another' }, STAGE));
      inside(ctx, STAGE, `scoreboard of ${n}`);
    }
    assert.equal(SP.drawVerticalScoreline(fakeCanvas().getContext('2d'), 1, { score: null }, STAGE), false);
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
      const words = v.images.filter((im) => im.w < 216 && im.h <= 24 && im.y > 150);
      for (const im of words) assert.ok(im.y + im.h <= L.PLATFORM_SAFE.bottom, `end card words below the safe area: ${JSON.stringify(im)}`);
      const h = fakeCanvas(384, 216).getContext('2d');
      cards.drawEndCard(h, t, { format: 'horizontal', programme: 'COSMOS DESK' });
      inside(h, { x: 0, y: 0, w: 384, h: 216 }, `horizontal end card at ${t}`);
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

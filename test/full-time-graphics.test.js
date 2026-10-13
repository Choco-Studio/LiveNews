import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

// FULL TIME's graphics (public/js/scenes/cards-sport.js, docs/programmes/full-time.md §6): the boards keep the safe area
// (x 40..344, y 28..134: clear of the top row and of the captions), the scoreline says FT or DRAW and puts the winner in
// the accent, SCORE CENTRE flips a row in when its line is read, the eleven sport icons are 11 x 11 and each its own.

/** A canvas whose context records fills and images (font.js draws text into its own offscreen canvases). */
function fakeCanvas(width = 384, height = 216) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    depth: 0,
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() { this.depth++; },
    restore() { this.depth--; },
    fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h }); },
    drawImage(img, x = 0, y = 0) { this.images.push({ x, y, w: img?.width || 0, h: img?.height || 0 }); },
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

describe('FULL TIME graphics', () => {
  let G;
  let P;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    G = await import('../public/js/scenes/cards-sport.js');
    ({ P } = await import('../public/js/palette.js'));
  });
  const inSafe = (ctx) => {
    for (const f of ctx.fills) assert.ok(f.x >= 40 && f.x + f.w <= 344 && f.y >= 28 && f.y + f.h <= 134, `fill ${JSON.stringify(f)}`);
    // (a text image is wider than its ink by one scale step: its left edge and its rows are what count)
    for (const im of ctx.images) assert.ok(im.x >= 40 && im.x <= 344 && im.y >= 24 && im.y <= 134, `text at ${im.x},${im.y}`);
  };

  test('eleven sport icons, 11 x 11, two tones, each its own silhouette', () => {
    const names = Object.keys(G.ICONS);
    assert.deepEqual(names.sort(), ['american-football', 'athletics', 'basketball', 'boxing', 'cricket', 'cycling', 'f1', 'football', 'golf', 'rugby', 'tennis']);
    const lit = (rows) => rows.join('').replace(/\./g, '').length;
    for (const n of names) {
      const rows = G.ICONS[n];
      assert.equal(rows.length, 11, n);
      assert.ok(rows.every((r) => r.length === 11 && /^[#+.]+$/.test(r)), n);
      assert.ok(lit(rows) >= 20, `${n}: ${lit(rows)} pixels`);
    }
    // (two icons that differ in fewer than 15 of their 121 pixels, either tone counted, would read as one at 1x)
    const px = (rows) => rows.join('').split('');
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const a = px(G.ICONS[names[i]]);
        const b = px(G.ICONS[names[j]]);
        assert.ok(a.filter((v, k) => v !== b[k]).length >= 15, `${names[i]} / ${names[j]}`);
      }
    }
    assert.equal(G.iconOf('american-football'), 'american-football');
    assert.equal(G.iconOf('darts'), null, 'no icon is better than a wrong one');
    assert.equal(G.iconOf('ice-hockey'), null, 'never the football for a puck');
    assert.equal(G.iconOf('baseball'), null, 'never the cricket bat for a baseball one');
  });

  test('the scoreline: two rows with FT in the accent, the boxes of a home-and-away board, DRAW on a draw; inside the safe area', () => {
    const v = fakeCanvas().getContext('2d');
    G.drawScoreline(v, 3, { score: { a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, winner: 'Coventry', draw: false, sport: 'football' }, source: 'Sky Sports' }, P.orange);
    inSafe(v);
    assert.ok(v.fills.some((f) => f.c === P.orange && f.w === 26 && f.h === 12), 'the FT block');
    const h = fakeCanvas().getContext('2d');
    G.drawScoreline(h, 3, { score: { a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, winner: 'Coventry', home: 'Coventry', draw: false, sport: 'football' }, source: 'Sky Sports' }, P.orange);
    inSafe(h);
    const boxes = h.fills.filter((f) => f.h === 25);
    assert.equal(boxes.length, 2, 'two score boxes');
    assert.equal(boxes[0].c, P.orange, 'the home winner\'s box in the accent, on the left');
    assert.ok(boxes[0].x < boxes[1].x);
    const d = fakeCanvas().getContext('2d');
    G.drawScoreline(d, 3, { score: { a: 'Starfield City', b: 'Ledgerton Rovers', sa: 2, sb: 2, draw: true, sport: 'football' } }, P.orange);
    inSafe(d);
    assert.ok(d.fills.some((f) => f.c === P.slate && f.w === 26 && f.h === 12), 'the DRAW block, not the accent');
    assert.ok(!d.fills.some((f) => f.c === P.orange && f.w === 26), 'nobody won');
    const early = fakeCanvas().getContext('2d');
    G.drawScoreline(early, 0.5, { score: { a: 'A Team', b: 'B Team', sa: 1, sb: 0, winner: 'A Team', sport: 'football' } }, P.orange);
    assert.ok(!early.fills.some((f) => f.w === 26 && f.h === 12), 'FT lands after the scores');
  });

  test('SCORE CENTRE flips each row in at the moment its line is read, and the board stays clear of the captions', () => {
    const rows = [
      { a: 'Northgate County', b: 'Saltmarsh', sa: 3, sb: 2, sport: 'football' },
      { a: 'Brightwater Wanderers', b: 'Kestrel Vale', sa: 0, sb: 0, draw: true, sport: 'football' },
      { a: 'Bitport Comets', b: 'Harbourside Herons', sa: 98, sb: 91, sport: 'basketball', day: 'SUN' },
    ];
    const texts = (dt) => {
      const ctx = fakeCanvas().getContext('2d');
      G.drawScoreboard(ctx, dt, { scores: rows, title: "TODAY'S RESULTS", rowTimes: [1, 3, 5] }, P.orange);
      // (the board's face, its rim included, is drawn once a height and copied: 300 + 2 x 2 wide)
      const board = ctx.images.find((im) => im.w === 304);
      assert.ok(board && board.x >= 40 && board.x + board.w <= 344 && board.y >= 28 && board.y + board.h <= 134, 'the board in the safe area');
      return ctx.images.filter((im) => im.y > board.y + 14 && im.y < board.y + board.h).length;
    };
    assert.equal(texts(0.5), 0, 'no row before its line');
    const one = texts(1.5);
    const two = texts(3.5);
    const three = texts(5.5);
    assert.ok(one > 0 && two > one && three > two, `${one} < ${two} < ${three}`);
  });

  test('SCORE CENTRE: one type size a board, the winner lit on either side, a draw both, three figures in their column', () => {
    const night = G.boardLayout([
      { a: 'Northgate County', b: 'Saltmarsh', sa: 3, sb: 2, sport: 'football' },
      { a: 'Brightwater Wanderers', b: 'Kestrel Vale', sa: 0, sb: 0, draw: true, sport: 'football' },
      { a: 'Millbrook', b: 'Ashcombe', sa: 1, sb: 2, sport: 'football' },
    ]);
    assert.equal(night.font, 'one', 'the score column moves off the middle before a name shrinks');
    assert.ok(night.laid.every((r) => !r.a.micro && !r.b.micro && r.a.lines.length === 1 && r.b.lines.length === 1));
    assert.deepEqual(night.laid.map((r) => [r.aLit, r.bLit]), [[true, false], [true, true], [false, true]], 'home win, draw, away win');
    const long = G.boardLayout([
      { a: 'Ashcombe', b: 'Brightwater Wanderers', sa: 1, sb: 2, sport: 'football' },
      { a: 'Wolverhampton Wanderers', b: 'Brighton & Hove Albion', sa: 1, sb: 1, draw: true, sport: 'football' },
      { a: 'Bitport Comets', b: 'Lanternhill Lynx', sa: 112, sb: 108, sport: 'basketball' },
    ]);
    assert.equal(long.font, 'wrap', 'a long name on two lines of the same size');
    assert.ok(long.laid.every((r) => !r.a.micro && !r.b.micro && r.a.lines.length <= 2 && r.b.lines.length <= 2));
    assert.ok(long.laid.every((r) => ![...r.a.lines, ...r.b.lines].some((l) => l.includes('...'))), 'nothing cut');
    const six = G.boardLayout([
      ...long.laid.map((r) => ({ a: r.a.lines.join(' '), b: r.b.lines.join(' '), sa: r.sa, sb: r.sb })),
      { a: 'Harbourside Hawks', b: 'Millbrook Foxes', sa: 24, sb: 17 },
      { a: 'Bills', b: 'Rams', sa: 37, sb: 34, day: 'MON' },
      { a: 'Kestrel Vale', b: 'Glimmerford', sa: 7, sb: 21 },
    ]);
    assert.equal(six.font, 'micro');
    assert.ok(six.laid.every((r) => r.a.micro && r.b.micro), 'the compact board: every name in the micro face together');
    assert.ok(six.scoreX >= 42 + 20 && six.scoreX + six.scoreW <= 42 + 300 - 6, 'the score column inside the board');
  });

  test('COMING UP: a leaf a date (two or three), nothing with fewer than two', () => {
    const ctx = fakeCanvas().getContext('2d');
    G.drawComingUp(ctx, 3, { title: 'COMING UP', fixtures: [{ event: 'WALES V ALBANIA', date: '2026-10-14', when: 'WEDNESDAY' }, { event: 'TYSON FURY V ANTHONY JOSHUA', date: '2026-12-11', when: '11 DECEMBER' }, { event: 'THE ASHES', date: '2026-11-21', when: '21 NOVEMBER' }], source: 'Sky Sports' }, P.orange);
    inSafe(ctx);
    assert.equal(ctx.fills.filter((f) => f.c === P.silver && f.w === 40 && f.h === 42).length, 3, 'three leaves');
    const none = fakeCanvas().getContext('2d');
    G.drawComingUp(none, 3, { fixtures: [{ event: 'WALES V ALBANIA', date: '2026-10-14' }] }, P.orange);
    assert.equal(none.fills.length + none.images.length, 0);
    assert.deepEqual(G.sidesOf('WALES V ALBANIA'), ['WALES', 'ALBANIA']);
    assert.deepEqual(G.sidesOf('THE ASHES'), ['THE ASHES']);
    assert.deepEqual(G.sidesOf('Harbourside Herons vs Lanternhill Lynx'), ['HARBOURSIDE HERONS', 'LANTERNHILL LYNX']);
  });

  test('COMING UP: the sport\'s icon by its leaf, one type size, names never touching nor cut', () => {
    const day = (d) => `2026-10-${d}`;
    const three = G.comingLayout([
      { event: 'STARFIELD CITY V GLIMMERFORD', date: day(14), when: 'WEDNESDAY', sport: 'football' },
      { event: 'BITPORT COMETS V LANTERNHILL LYNX', date: day(15), when: 'THURSDAY', sport: 'basketball' },
      { event: 'TYSON FURY V ANTHONY JOSHUA', date: '2026-12-11', when: '11 DECEMBER', sport: 'ice-hockey' },
    ], 'COMING UP', 'Pixelburg Sport');
    assert.deepEqual(three.cols.map((c) => c.icon), ['football', 'basketball', null]);
    assert.ok(three.cols.every((c) => c.lines.every((l) => !l.micro)), 'all at 1x');
    const long = G.comingLayout([
      { event: 'WOLVERHAMPTON WANDERERS V BRIGHTON & HOVE ALBION', date: day(14), when: 'WEDNESDAY' },
      { event: 'HARBOURSIDE HERONS V LANTERNHILL LYNX', date: day(15), when: 'THURSDAY' },
      { event: 'KESTREL VALE V GLIMMERFORD', date: day(16), when: 'FRIDAY' },
    ], 'COMING UP', '');
    const all = long.cols.flatMap((c) => c.lines);
    assert.ok(all.every((l) => l.micro) || all.every((l) => !l.micro), 'one size on the board');
    assert.ok(all.every((l) => !l.text.includes('...')), 'nothing cut');
    for (const L of [three, long]) {
      const ext = L.cols.map((c) => Math.max(...c.lines.map((l) => (l.micro ? 4 : 6) * l.text.length)));
      for (let i = 1; i < L.cols.length; i++) assert.ok(L.cols[i].cx - L.cols[i - 1].cx >= 40 + 15, 'leaves and icons apart');
      assert.ok(L.cols[0].cx - ext[0] / 2 >= 30 && L.cols.at(-1).cx <= 344, 'inside the board');
    }
  });

  test('the moment on the board: the line from the distance is drawn as it is said, its length after it', () => {
    const dots = (dt) => {
      const ctx = fakeCanvas().getContext('2d');
      G.drawChalkboard(ctx, dt, { chalk: { yards: 30, sport: 'football' } });
      for (const f of ctx.fills) assert.ok(f.y >= 25 && f.y + f.h <= 137, `fill ${JSON.stringify(f)}`);
      return { dots: ctx.fills.filter((f) => f.w === 2 && f.h === 2).length, texts: ctx.images.length };
    };
    const a = dots(0.6);
    const b = dots(1.0);
    const c = dots(2);
    assert.ok(a.dots < b.dots && b.dots <= c.dots, `${a.dots} < ${b.dots} <= ${c.dots}`);
    assert.equal(a.texts, 0, 'no length before the line is drawn');
    assert.ok(c.texts >= 1, 'then "30 YARDS"');
    // the other grounds: the American football field and the rugby pitch (in metres), inside the board's frame
    for (const chalk of [{ yards: 45, sport: 'american-football' }, { metres: 45, sport: 'rugby' }, { yards: 12, label: 'THE PENALTY SPOT', sport: 'football' }]) {
      const ctx = fakeCanvas().getContext('2d');
      G.drawChalkboard(ctx, 2, { chalk });
      for (const f of ctx.fills) assert.ok(f.x >= 90 && f.x + f.w <= 294 && f.y >= 25 && f.y + f.h <= 137, `${chalk.sport} fill ${JSON.stringify(f)}`);
      assert.ok(ctx.images.length >= 1, `${chalk.sport}: its length`);
    }
  });
});

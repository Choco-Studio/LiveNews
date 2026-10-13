// Set and graphics polish (owner, 13 Oct: "con un nivel real"): the owner's open list for the studio and the on-screen
// graphics, measured on frames and graphics state rendered in node.
//   set       the walls' gradients (no stripes), the city's sky ramps, the plates at the wall's scale in a single, the
//             two-way's wall at rest, NEWS IN 60's rundown board and soft monitors, MONEY MINUTE's sconce light and
//             soffit ticker, the planetarium's baked noise and the experts' rooms built ahead (the first cut's cost)
//   graphics  NEWS IN 60's tag back after a breaking card, MONEY MINUTE's bottom line from the aired stories, two-line
//             captions above the strap, name lists kept whole, the micro pound
//   boards    the one-figure card's hero at 3x, the stack inside the card area with three qualified figures, the ledger's
//             labels in body type, the breaking card centred
//   round 2   the two-way's boxes clear of a two-line caption, TECH BYTES's idle chip with its traces, the weather's
//             cloud texture built ahead in slices
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor } from '../public/js/v2/canvas25d/studio/styles.js';
import { drawBackground, wallRect, wallFromScene, setSkyHour } from '../public/js/v2/canvas25d/studio/set.js';
import { RUNDOWN, rundownRows } from '../public/js/v2/canvas25d/studio/dressing.js';
import { drawSpace, skyWarmTasks, SKY } from '../public/js/v2/canvas25d/studio/space.js';
import { drawExpertStudio, warmExpertStudio, EXPERT_STUDIOS } from '../public/js/v2/canvas25d/studio/experts.js';
import { SET, kAt, sxOf, syOf } from '../public/js/v2/canvas25d/studio/geometry.js';
import { P } from '../public/js/palette.js';
import { textPixels, measureText } from '../public/js/font.js';
import { layoutText } from '../public/js/graphics/breaks.js';
import { paginate } from '../public/js/graphics/captions.js';
import * as lab from '../public/js/v2/canvas25d/labs/set.js';
import { TWOWAY } from '../public/js/v2/canvas25d/studio/remote.js';
import { CAPTION, STRAP, TOP, TICKER } from '../public/js/graphics/layout.js';
import { drawLinkGraphics } from '../public/js/graphics/remote.js';
import { cloudTexture, warmCloudTexture } from '../public/js/scenes/weather/sky.js';

const W = 384;
function shot(o, t = 10) {
  lab.set({ presenters: false, wall: 'idle', phase: 'intro', ...o });
  lab.reset();
  lab.render(t);
  return Uint32Array.from(lab.frame.px);
}
const count = (px, x0, y0, x1, y1, pred) => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (pred(px[y * W + x] >>> 0)) n++;
  return n;
};

describe('set: no colour banding', () => {
  test('WORLD NOW\'s wall falls from navy to ink as a gradient over most of its height, never as a stripe', () => {
    const px = shot({ programme: 'world-now', framing: 'wide', wall: 'idle' });
    const r = wallRect(lab.cameraFor('wide', 'world-now'));
    // per row, the share of navy in a strip of the field beside the globe (the globe sits in the middle)
    const shares = [];
    for (let y = r.y0 + 1; y < r.y1 - 1; y++) shares.push(count(px, r.x0 + 2, y, r.x0 + 18, y + 1, (c) => c === C.navy >>> 0) / 16);
    const partial = shares.filter((s) => s > 0 && s < 1).length;
    assert.ok(partial >= 20, `the ramp spans ${partial} rows`);
    for (let i = 4; i < shares.length; i++) assert.ok(shares[i] <= shares[i - 4] + 0.13, `row ${i}: the navy only thins out downward`);
  });

  test('the city\'s sky changes colour in a tall ramp behind a head, not a two-row dotted seam', () => {
    setSkyHour(9);
    try {
      const px = shot({ programme: 'world-now', framing: 'mcu-r', wall: 'idle' });
      // a column of the glass left of the wall: rows where navy and steel are mixed (the day's sky ramp)
      let mixed = 0;
      for (let y = 0; y < 150; y++) {
        const n = count(px, 4, y, 20, y + 1, (c) => c === C.navy >>> 0);
        const s = count(px, 4, y, 20, y + 1, (c) => c === C.steel >>> 0);
        if (n > 0 && s > 0) mixed++;
      }
      assert.ok(mixed >= 6, `the navy-to-steel ramp spans ${mixed} rows`);
    } finally {
      setSkyHour(23);
    }
  });
});

describe('set: walls that are never empty panels', () => {
  test('a story plate is set at the wall\'s own scale: 2x in a single, 1x in the wide', async () => {
    const { plateRectFor } = await import('../public/js/v2/canvas25d/studio/wall.js');
    for (const programme of ['world-now', 'money-minute', 'tech-bytes']) {
      const single = plateRectFor(lab.cameraFor(programme === 'money-minute' ? 'mcu-r' : 'single-a', programme), 'TRADE', 'PANAMA', programme, true);
      const wide = plateRectFor(lab.cameraFor('wide', programme), 'TRADE', 'PANAMA', programme, true);
      assert.equal(single?.ts, 2, `${programme}: 2x in its single`);
      assert.equal(wide?.ts, 1, `${programme}: 1x in its wide`);
    }
  });

  test('the two-way\'s wall at rest shows no words: NEWS IN 60\'s dial and its figures go, WORLD NOW keeps its globe', () => {
    const cam = lab.cameraFor('mcu-l', 'news-60');
    const r = wallRect(cam);
    const yellow = (px) => count(px, r.x0, r.y0, r.x1, r.y1, (c) => c === C.yellow >>> 0);
    const idle = new Uint32Array(W * 216), rest = new Uint32Array(W * 216);
    const fr = lab.frame;
    lab.reset();
    drawBackground(fr, cam, 5, { style: styleFor('news-60'), wall: { mode: 'idle' }, shotSince: 1, cut: true });
    idle.set(fr.px);
    lab.reset();
    drawBackground(fr, cam, 5, { style: styleFor('news-60'), wall: { mode: 'rest' }, shotSince: 2, cut: true });
    rest.set(fr.px);
    assert.ok(yellow(idle) > 0, 'the idle dial has its yellow mark');
    assert.equal(yellow(rest), 0, 'at rest: no dial, no "60"');
    const cw = lab.cameraFor('mcu-l', 'world-now');
    const rw = wallRect(cw);
    lab.reset();
    drawBackground(fr, cw, 5, { style: styleFor('world-now'), wall: { mode: 'rest' }, shotSince: 3, cut: true });
    assert.ok(count(fr.px, rw.x0, rw.y0, rw.x1, rw.y1, (c) => c === C.fog >>> 0 || c === C.steel >>> 0) > 20, 'the globe\'s dots are there');
  });

  test('NEWS IN 60\'s rundown board shows the bulletin\'s beats and moves on with the story on a cut only', () => {
    const rundown = [
      { storyId: 'a', kicker: 'BREAKING', category: 'world' },
      { storyId: 'b', kicker: 'VOLCANO', category: 'science' },
      { storyId: 'c', kicker: 'AROUND THE WORLD', category: 'business' },
      { storyId: 'd', category: 'tech' },
    ];
    assert.deepEqual(rundownRows(rundown), ['BREAKING', 'VOLCANO', 'BUSINESS', 'TECH'], 'a kicker too long for the board gives way to its desk');
    const scene = { program: { id: 'news-60' }, cast: { A: 'sam' }, rundown, storyId: 'b', images: new Map(), focus: 'A' };
    wallFromScene(scene, 'news-60');
    const cam = lab.cameraFor('wide', 'news-60');
    const before = RUNDOWN.rows;
    drawBackground(lab.frame, cam, 1, { style: styleFor('news-60'), wall: { mode: 'idle' }, shotSince: 10, cut: false });
    assert.equal(RUNDOWN.rows, before, 'no change in the middle of a shot');
    drawBackground(lab.frame, cam, 2, { style: styleFor('news-60'), wall: { mode: 'idle' }, shotSince: 11, cut: true });
    assert.deepEqual([RUNDOWN.rows.slice(0, 2), RUNDOWN.live], [['BREAKING', 'VOLCANO'], 1], 'on the cut: the beats, the story on air marked');
  });

  test('NEWS IN 60\'s gallery out of focus: soft pictures of the feeds, never a wall of blank squares', () => {
    const px = shot({ programme: 'news-60', framing: 'mcu-r', wall: 'idle' });
    // the left gallery block in the MCU-R (soft): the soft colour bars and the map's sea are there
    const cols = new Set();
    for (let y = 0; y < 120; y++) for (let x = 0; x < 80; x++) cols.add(px[y * W + x] >>> 0);
    for (const c of [C.navy, C.darkGreen, C.purple]) assert.ok(cols.has(c >>> 0), `soft monitors show ${c.toString(16)}`);
  });
});

describe('set: MONEY MINUTE\'s lights', () => {
  test('each sconce throws light up and down that is brightest by the lamp (two steps of lift), never a flat oval', () => {
    const px = shot({ programme: 'money-minute', framing: 'wide', wall: 'idle' });
    const cam = lab.cameraFor('wide', 'money-minute');
    const k = kAt(cam, SET.wallZ);
    const cx = Math.round(sxOf(cam, k, -153)), cy = Math.round(syOf(cam, k, -66));
    const near = count(px, cx - 3, cy - 14, cx + 4, cy - 5, (c) => c === C.tan >>> 0);
    const far = count(px, cx - 10, cy - 26, cx + 11, cy - 20, (c) => c === C.tan >>> 0);
    assert.ok(near > 4, `the wash near the lamp lifts the wood to tan (${near} px)`);
    assert.ok(far < near, 'and fades with distance');
  });

  test('the soffit ticker is an ambient light of the room: steel letters, never fog', () => {
    const px = shot({ programme: 'money-minute', framing: 'wide', wall: 'idle' });
    assert.equal(count(px, 0, 0, W, 8, (c) => c === C.fog >>> 0), 0);
    assert.ok(count(px, 0, 0, W, 8, (c) => c === C.steel >>> 0) > 30);
  });
});

describe('set: the first cut to a new shot', () => {
  test('the planetarium\'s noise is baked once (in warm-up slices): the sky drawn after the bake is the one drawn before', () => {
    const cam = lab.cameraFor('wide', 'cosmos');
    const k = kAt(cam, SET.wallZ);
    const box = { x0: 0, x1: W, y0: Math.round(syOf(cam, k, SKY.top)), y1: 150 };
    const a = new Uint32Array(W * 216), b = new Uint32Array(W * 216);
    const fr = { px: a };
    drawSpace(fr, cam, box, false); // bakes whatever the warm-up has not
    for (const task of skyWarmTasks()) task(); // nothing left to do
    drawSpace({ px: b }, cam, box, false);
    assert.deepEqual(a, b);
    assert.ok(count(a, 0, box.y0, W, box.y1, (c) => c === C.purple >>> 0) > 10, 'the nebula');
    assert.ok(count(a, 0, box.y0, W, box.y1, (c) => c === C.ink >>> 0) > 200, 'the Milky Way');
  });

  test('an expert\'s studio can be built ahead of its first shot, and is the same studio', () => {
    for (const name of EXPERT_STUDIOS) {
      assert.equal(warmExpertStudio(name), true, name);
      const a = new Uint32Array(W * 216), b = new Uint32Array(W * 216);
      drawExpertStudio(a, name, 1);
      drawExpertStudio(b, name, 1);
      assert.deepEqual(a, b, name);
    }
    assert.equal(warmExpertStudio('nowhere'), false);
  });
});

describe('graphics', () => {
  let Graphics;
  before(async () => {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, drawImage() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }) }) };
    ({ Graphics } = await import('../public/js/graphics/index.js'));
  });

  test('NEWS IN 60 gets its programme tag back after a breaking card (it keeps it the whole bulletin)', () => {
    const g = new Graphics({ now: () => 0 });
    const scene = { shot: 'wide', program: { id: 'news-60', title: 'NEWS IN 60', theme: 'flash' }, programTagUntil: 15, rundown: [], ticker: [] };
    for (let t = 0; t < 5; t += 0.1) g.update(t, scene);
    assert.ok(g.tagIn !== null && g.tagOut === null);
    scene.shot = 'breakingCard';
    for (let t = 5; t < 8; t += 0.1) g.update(t, scene);
    assert.notEqual(g.tagOut, null, 'off under the card');
    scene.shot = 'close';
    for (let t = 8; t < 12; t += 0.1) g.update(t, scene);
    assert.equal(g.tagOut, null, 'back with the news');
    assert.ok(g.tagIn >= 8, 'wiped in again after the card');
  });

  test('MONEY MINUTE\'s bottom line flips the figures of the stories already aired, read off their segments', () => {
    const g = new Graphics({ now: () => 0 });
    const rundown = [{ storyId: 'm1', headline: 'Canal reopens' }, { storyId: 'm2', headline: 'Wind farm' }, { storyId: 'm3', headline: 'Rail strike' }];
    const seg = (id, numbers) => ({ ctx: { seg: { type: 'story', storyId: id, numbers } } });
    const scene = { shot: 'close', program: { id: 'money-minute', title: 'MONEY MINUTE', theme: 'money' }, rundown, ticker: [{ text: 'Other news' }] };
    g.update(0, { ...scene, storyId: 'm1', segPlan: seg('m1', [{ value: '30', label: 'SHIPS' }]) });
    g.update(1, { ...scene, storyId: 'm2', segPlan: seg('m2', [{ value: '1.2 MILLION', label: 'HOMES' }]) });
    assert.ok(g.tickerList.every((e) => !e.value), 'one aired figure: still the headlines');
    g.update(2, { ...scene, storyId: 'm3', segPlan: seg('m3', [{ value: '2,400', label: 'JOBS' }]) });
    const figs = g.tickerList.filter((e) => e.value);
    assert.deepEqual(figs.map((e) => `${e.text} ${e.value}`), ['SHIPS 30', 'HOMES 1.2 MILLION'], 'never the story on air');
    assert.equal(figs[0].label, 'BOTTOM LINE');
  });

  test('captions are two lines a page above the strap too (one-line pages flipped every 2.4 s)', () => {
    const g = new Graphics({ now: () => 0 });
    const scene = {
      shot: 'close', program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, rundown: [], ticker: [], subtitles: true,
      lowerThird: { headline: 'Rail strike halts most trains across Germany', kicker: 'TRANSPORT', source: 'Ledger Line', since: 0 },
      subtitle: 'Stations in Berlin, Munich and Frankfurt were almost empty during the morning rush hour.', subtitleSince: 2,
    };
    for (let t = 0; t < 3; t += 0.05) g.update(t, scene);
    assert.ok(g.strapUp(), 'the strap is up');
    assert.equal(g.captions.lines.length, 2);
  });

  test('a list of names is never split at its commas; a clause comma still is a good break', () => {
    const show = (s) => paginate(s).map((p) => p.lines.join(' / ')).join(' || ');
    assert.equal(show('Stations in Berlin, Munich and Frankfurt were almost empty during the morning rush hour.'), 'Stations in Berlin, Munich and Frankfurt were / almost empty during the morning rush hour.');
    assert.match(show('And finally: coral recovers on parts of the Great Barrier Reef, Bitport Herald reports.'), /Reef, \|\| Bitport Herald reports\.$/);
    const pages = layoutText('Officials in Paris, Rome or Madrid could meet next week.', { maxW: 264, perPage: 2, style: 'caption' });
    for (const p of pages) for (const l of p.lines) assert.doesNotMatch(l, /(Paris,|Rome)$/, l);
  });

  test('the micro pound is not the micro E (a source line\'s "£2.5BN" read "E2.5BN")', () => {
    const pound = textPixels('£', 'micro'), e = textPixels('E', 'micro');
    const key = (g) => g.pixels.map(([x, y]) => `${x},${y}`).sort().join(' ');
    assert.notEqual(key(pound), key(e));
    // its stem stands in the middle column, as a pound sign's does
    assert.ok(pound.pixels.some(([x, y]) => x === 1 && y === 1));
  });
});

describe('boards', () => {
  let cards;
  before(async () => {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
    cards = await import('../public/js/scenes/cards.js');
  });

  test('a one-figure card sets its figure at 3x when it is short (a "30" at 2x was a speck in an empty panel)', () => {
    assert.equal(cards.cardLayouts.rule('ABOUT 30 SHIPS', 'BY THE NUMBERS', 'Ledger Line').scale, 3);
    assert.equal(cards.cardLayouts.rule('1.2 MILLION homes', 'BY THE NUMBERS', 'Pixelburg Post').scale, 3);
    assert.equal(cards.cardLayouts.rule('$2,400,000,000,000 IN SPENDING', 'BY THE NUMBERS', 'Ledger Line').scale, 2);
  });

  test('three qualified figures stay inside the card area (y 26-134): the source line gives way first', () => {
    const numbers = [
      { value: '1.2 MILLION', label: 'HOMES', qualifier: 'ABOUT' },
      { value: '40,000', label: 'PEOPLE', qualifier: 'MORE THAN' },
      { value: '180', label: 'KILOMETRES PER HOUR', qualifier: 'UP TO' },
    ];
    const L = cards.cardLayouts.stack(numbers, 'BY THE NUMBERS', 'Pixelburg Post / Photo: Pixel Wire');
    assert.ok(L.PY >= 26 && L.PY + L.PH <= 134, `panel ${L.PY}..${L.PY + L.PH}`);
    assert.equal(L.src, '', 'the source went (the strap carries it)');
    const two = cards.cardLayouts.stack(numbers.slice(0, 2), 'BY THE NUMBERS', 'Pixelburg Post');
    assert.ok(two.src, 'two figures keep their source line');
    // the first qualifier stands clear of the kicker (micro over micro read as one two-line kicker)
    assert.ok(L.ys[0] - 7 - (L.PY + 15) >= 4);
  });
});

describe('round 2', () => {
  test('the two-way\'s box labels and accent rule stay clear of a two-line caption over the strap', () => {
    const capTop = STRAP.tagY - CAPTION.gap - 2 * CAPTION.pitch;
    assert.ok(TWOWAY.y + TWOWAY.h + 3 < capTop, `the accent rule at ${TWOWAY.y + TWOWAY.h + 3}, the caption from ${capTop}`);
    assert.ok(TWOWAY.y - 1 >= TOP.y + TOP.h + 8, 'the boxes keep their distance from the top row');
    const fills = [];
    const ctx = { fillStyle: '', fillRect(x, y, w, h) { fills.push({ c: this.fillStyle, x, y, w, h }); }, drawImage() {}, save() {}, restore() {} };
    drawLinkGraphics(ctx, 10, { shot: 'twoway', remote: { kind: 'correspondent', place: 'YUCAT\u00c1N PENINSULA', desk: 'AMERICAS DESK' } }, P.red);
    const plates = fills.filter((f) => f.c === P.black && f.h === 11);
    assert.equal(plates.length, 2);
    for (const p of plates) assert.ok(p.y + p.h <= capTop - 2, `label ${p.y}..${p.y + p.h} under the caption's top ${capTop}`);
  });

  test('TECH BYTES\'s idle chip carries the open\'s traces out across the wall (an emblem alone read as an empty panel)', () => {
    for (const [framing, min] of [['mcu-l', 20], ['single-a', 20], ['wide', 6]]) {
      const px = shot({ programme: 'tech-bytes', framing, wall: 'idle', presenters: true });
      const r = wallRect(lab.cameraFor(framing, 'tech-bytes'));
      const x0 = Math.max(0, r.x0), x1 = Math.min(W, r.x1), y0 = Math.max(0, r.y0), y1 = Math.min(216, r.y1);
      let sx = 0, sy = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (px[y * W + x] >>> 0 !== C.cyan >>> 0) continue;
          sx += x;
          sy += y;
          n++;
        }
      }
      assert.ok(n > 0, `${framing}: the chip`);
      const cx = Math.round(sx / n), cy = Math.round(sy / n);
      const body = framing === 'wide' ? 14 : 28; // the chip's half-width with its pins
      let best = 0;
      for (let y = cy - 16; y <= cy + 16; y++) {
        let run = 0;
        for (let x = x0; x < x1; x++) {
          if (px[y * W + x] >>> 0 === C.slate >>> 0 && Math.abs(x - cx) > body) best = Math.max(best, ++run);
          else run = 0;
        }
      }
      assert.ok(best >= min, `${framing}: the longest trace beside the chip is ${best} px`);
    }
  });

  test('the weather\'s cloud texture is built ahead in slices, the same texture as built at once', () => {
    let calls = 0;
    while (!warmCloudTexture(0)) calls++;
    assert.ok(calls > 50, `${calls} slices (one step each at a zero budget)`);
    const L = cloudTexture();
    assert.deepEqual(L.map((l) => l.size), [256, 128, 64, 32]);
    for (const l of L) {
      const hist = new Uint32Array(256);
      for (const v of l.data) hist[v]++;
      assert.ok(hist.every((h) => h === l.data.length / 256), 'equalised: a flat histogram');
      for (let i = 1; i < l.gauss.length; i += 97) assert.equal(Math.sign(l.gauss[i]), Math.sign(l.data[i] - 127.5), 'the same ranks as a normal');
      assert.equal(l.corr.length, 32 * 32);
      assert.ok(Math.abs(l.corr[0] - 1) < 0.01, 'unshifted, the texture matches itself');
    }
  });
});

describe('boards, round 2', () => {
  let cards;
  before(async () => {
    globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) };
    cards = await import('../public/js/scenes/cards.js');
  });

  test('TECH BYTES\'s ledger labels are body type (micro fog on a dimmed picture was the faintest thing on the card)', () => {
    const L = cards.cardLayouts.ledger([{ value: '30%', label: 'less energy' }], 'BY THE NUMBERS', 'Circuit Weekly');
    assert.equal(L.fs, 3);
    assert.equal(L.items[0].labW, measureText(L.items[0].lab, 1));
  });

  test('the breaking card\'s block sits in the middle of the frame, not in its top half', () => {
    for (const [h, src] of [['Panama Canal reopens', 'Ledger Line'], ['Panama Canal reopens after a day-long closure', ''], ['Magnitude 7.1 earthquake strikes off the coast of northern Japan, tsunami warning issued for the region', 'Pixelburg Post']]) {
      const B = cards.cardLayouts.breaking(h, src);
      const above = B.BY - (TOP.y + TOP.h), below = TICKER.y - (B.BY + B.blockH);
      assert.ok(above >= 18 && below >= above, `${h}: ${above} px above the block, ${below} below`);
      assert.ok(below - above <= 24, `${h}: balanced (${above} above, ${below} below)`);
    }
  });
});

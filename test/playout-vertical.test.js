// The vertical live (docs/publishing/playout.md §13): the portrait air size on the vertical canvas, the renderer's grab
// and filter graph (the vertical picture at 5x over the clean frame's spot at 2x in its window, proved on a real frame
// through ffmpeg), the spot's window the same in the page and in the encoder, and the channel's own moments set for the
// 216x384 frame: whole words inside the platforms' safe column, the AI notice on the ident and never in a break, the
// spot's window left open only for the playout.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { integerSize, canvasFor, VCANVAS, CANVAS, SIZES } from '../server/airsize.js';
import { renderGraph, grabLayout, adPlacement, AD_WINDOW, airVideoArgs, levelFor } from '../server/playout/encode.js';

function fakeCanvas(width = 216, height = 384) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    images: [],
    cleared: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect(x, y, w, h) {
      this.fills.push({ c: this.fillStyle, x, y, w, h, clip: this.clipBox });
    },
    clearRect(x, y, w, h) {
      this.cleared.push({ x, y, w, h });
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
  for (const m of ['moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}
const visible = (d) => {
  if (!d.clip) return d;
  const x0 = Math.max(d.x, d.clip.x);
  const y0 = Math.max(d.y, d.clip.y);
  const x1 = Math.min(d.x + d.w, d.clip.x + d.clip.w);
  const y1 = Math.min(d.y + d.h, d.clip.y + d.clip.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
};
/** Every line of type (a text-sized image) inside the safe column (x 8-188) and above the feeds' band (y 300). */
function wordsSafe(ctx, label) {
  let n = 0;
  for (const im of ctx.images) {
    if (!(im.h <= 24 && im.w <= 182)) continue;
    const v = visible(im);
    if (!v) continue;
    n++;
    assert.ok(v.x >= 7 && v.x + v.w <= 189, `${label}: a word outside the safe column: ${JSON.stringify(v)}`);
    assert.ok(v.y + v.h <= 301, `${label}: a word under the feeds' band: ${JSON.stringify(v)}`);
  }
  return n;
}

test('a portrait air size is a whole multiple of the vertical picture (216x384), never of the horizontal one', () => {
  assert.deepEqual(VCANVAS, { w: 216, h: 384 });
  assert.equal(SIZES.vertical, '1080x1920');
  assert.deepEqual(integerSize('1080x1920'), { w: 1080, h: 1920, k: 5, size: '1080x1920', asked: '1080x1920', rounded: false });
  assert.equal(integerSize('vertical').k, 5);
  assert.equal(integerSize('720x1280', { warn: () => {} }).size, '648x1152', 'x3.33 rounds to x3, as 720p does');
  assert.equal(canvasFor('1920x1080'), CANVAS);
  assert.equal(canvasFor('1080x1920'), VCANVAS);
  assert.equal(integerSize('1920x1080').k, 5, 'the horizontal sizes are unchanged');
  // the air's settings at the vertical size: the same profile, level 4.1 as 1080p (the same number of pixels)
  assert.equal(levelFor({ w: 1080, h: 1920 }, 30), '4.1');
  const a = airVideoArgs({ size: '1080x1920' });
  assert.equal(a[a.indexOf('-level:v') + 1], '4.1');
  assert.throws(() => airVideoArgs({ size: '1080x1900' }), /not a whole multiple/);
});

test('the grab and the filter graph: the air picture, the twin master, the clean frame and the vertical picture', () => {
  assert.deepEqual(grabLayout({}), { w: 384, h: 216, air: 0, twin: null, clean: null, vertical: null });
  assert.deepEqual(grabLayout({ twin: true, vertical: true }), { w: 1368, h: 384, air: 0, twin: 384, clean: 768, vertical: 1152 });
  const plain = renderGraph({ size: '1920x1080' });
  assert.deepEqual(plain.outputs, ['[air]']);
  const both = renderGraph({ size: '1920x1080', twin: true, vertical: '1080x1920' });
  assert.deepEqual(both.outputs, ['[air]', '[m]', '[vair]', '[vm]']);
  assert.match(both.graph, /crop=216:384:1152:0/);
  assert.match(both.graph, /scale=w=768:h=432:flags=neighbor/, 'the spot at 2x');
  assert.match(both.graph, /overlay=156:742:format=yuv420\[vair\]/, 'over its window alone');
  assert.match(both.graph, /scale=w=1080:h=1920:flags=neighbor:out_color_matrix=bt709:out_range=tv,format=yuv420p/, 'the vertical frame at 5x, BT.709');
  assert.match(both.graph, /alphaextract,negate/, "the spot shown where the frame's window is open");
  assert.throws(() => renderGraph({ vertical: '1080x1900' }), /not a whole multiple/);
});

test("the spot's place: the largest whole scale in the 154x87 window, centred (2x at 1080x1920, 1x at 648x1152)", () => {
  assert.deepEqual(adPlacement(5), { a: 2, x: 156, y: 742, w: 768, h: 432 });
  assert.deepEqual(adPlacement(3), { a: 1, x: 132, y: 466, w: 384, h: 216 });
  for (const k of [3, 4, 5, 6]) {
    const p = adPlacement(k);
    assert.ok(p.x >= AD_WINDOW.x * k && p.x + p.w <= (AD_WINDOW.x + AD_WINDOW.w) * k, `x${k}: inside the window across`);
    assert.ok(p.y >= AD_WINDOW.y * k && p.y + p.h <= (AD_WINDOW.y + AD_WINDOW.h) * k, `x${k}: inside the window down`);
    assert.ok(p.x % 2 === 0 && p.y % 2 === 0, `x${k}: on even pixels (whole chroma samples)`);
  }
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('through ffmpeg: the vertical picture is its frame, and the spot shows only while the frame leaves its window open', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
  const L = grabLayout({ vertical: true });
  const frame = (open) => {
    const px = Buffer.alloc(L.w * L.h * 4);
    const put = (x, y, [r, g, b, a = 255]) => px.set([r, g, b, a], (y * L.w + x) * 4);
    for (let y = 0; y < L.h; y++) {
      for (let x = 0; x < L.w; x++) {
        if (x < L.clean && y < 216) put(x, y, [255, 0, 0]); // the air picture: red
        else if (x >= L.clean && x < L.vertical && y < 216) put(x, y, [0, 228, 54]); // the clean frame (the spot): green
        else if (x >= L.vertical) {
          const vx = x - L.vertical;
          const inWin = vx >= AD_WINDOW.x && vx < AD_WINDOW.x + AD_WINDOW.w && y >= AD_WINDOW.y && y < AD_WINDOW.y + AD_WINDOW.h;
          put(x, y, inWin && open ? [0, 0, 0, 0] : [0, 0, 255]); // the vertical frame: blue, its window transparent while open
        }
      }
    }
    return px;
  };
  const { graph } = renderGraph({ size: '1152x648', vertical: '1080x1920' });
  const r = spawnSync('ffmpeg', ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${L.w}x${L.h}`, '-framerate', '30', '-i', 'pipe:0', '-filter_complex', `${graph};[vair]scale=in_color_matrix=bt709:in_range=tv,format=rgb24[out]`, '-map', '[out]', '-frames:v', '2', '-f', 'rawvideo', 'pipe:1', '-map', '[air]', '-f', 'null', '-', '-map', '[vm]', '-f', 'null', '-'], { input: Buffer.concat([frame(true), frame(false)]), maxBuffer: 1 << 26 });
  assert.equal(r.status, 0, String(r.stderr));
  const FR = 1080 * 1920 * 3;
  assert.equal(r.stdout.length, 2 * FR);
  const at = (f, x, y) => [...r.stdout.subarray(f * FR + (y * 1080 + x) * 3, f * FR + (y * 1080 + x) * 3 + 3)];
  const near = (c, want, label) => assert.ok(c.every((v, i) => Math.abs(v - want[i]) <= 24), `${label}: ${c} not ${want}`);
  const ad = adPlacement(5);
  near(at(0, ad.x + 10, ad.y + 10), [0, 228, 54], 'the spot in the open window');
  near(at(0, ad.x + ad.w - 10, ad.y + ad.h - 10), [0, 228, 54], "the spot's far corner");
  near(at(0, 40, 40), [0, 0, 255], 'the frame above');
  near(at(0, 1040, 1880), [0, 0, 255], 'the frame below');
  near(at(0, ad.x - 30, ad.y + 100), [0, 0, 255], 'the frame beside the window');
  // the spot never spills past its 768x432 (the window's hairline round it; its colour is the 4:2:0 neighbour's)
  for (const [x, y] of [[ad.x - 1, ad.y + 100], [ad.x + ad.w, ad.y + 100], [ad.x + 100, ad.y - 1], [ad.x + 100, ad.y + ad.h]]) assert.ok(at(0, x, y)[1] < 40, `no spot at ${x},${y}: ${at(0, x, y)}`);
  // the window shut: the frame, never the clean frame behind it
  near(at(1, ad.x + 10, ad.y + 10), [0, 0, 255], 'the frame where the window was');
  near(at(1, ad.x + ad.w / 2, ad.y + ad.h / 2), [0, 0, 255], "the window's middle, shut");
});

describe("the channel's moments in the vertical frame", () => {
  let V;
  let D;
  let L;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    L = await import('../public/js/clip/layout.js');
    V = await import('../public/js/clip/vchannel.js');
    D = await import('../public/js/graphics/disclosure.js');
  });

  test("the film's window is the encoder's: one window, centred on the frame across and down, inside the safe column", () => {
    assert.deepEqual({ ...V.AD_WINDOW }, { ...AD_WINDOW });
    for (const k of [3, 5]) assert.deepEqual(V.adPlacement(k), adPlacement(k));
    assert.equal(V.AD_WINDOW.x + V.AD_WINDOW.w / 2, L.VW / 2);
    assert.ok(Math.abs(V.AD_WINDOW.y + V.AD_WINDOW.h / 2 - L.VH / 2) <= 1, "its middle on the frame's middle row");
    assert.ok(V.AD_WINDOW.x >= L.SAFE.x && V.AD_WINDOW.x + V.AD_WINDOW.w <= L.SAFE.right);
    assert.ok(V.AD_WINDOW.y >= L.V.stage.y && V.AD_WINDOW.y + V.AD_WINDOW.h <= L.V.stage.y + L.V.stage.h);
  });

  const scene = (shot, card = {}, extra = {}) => ({ shot, card, shotSince: 997, ...extra });
  const T = 1000;
  const CASES = {
    ident: scene('ident', {}),
    bumper: scene('ident', { kind: 'break', seconds: 75, next: 'WORLD WEATHER', theme: 'weather' }, { adBreak: { until: T + 70, total: 75 } }),
    spot: scene('ad', { ad: { id: 'bitfizz-cola', duration: 24 }, line: -1 }, { adBreak: { until: T + 44, total: 75 } }),
    promo: scene('promo', { next: { id: 'tech-bytes', title: 'TECH BYTES', tagline: 'The tech news that matters, in plain words', presenters: ['max', 'nova'], theme: 'tech' }, label: 'UP NEXT', footer: 'AFTER THE BREAK' }),
    countdown: scene('countdown', { next: { title: 'NEWS IN 60', theme: 'world' }, at: Date.UTC(2026, 9, 24, 14, 0), until: T + 23 }),
    standby: scene('standby', { message: 'PREPARING THE NEXT PROGRAMME' }),
    breaking: scene('breakingCard', { headline: 'Earthquake of magnitude 7.1 strikes off the coast of Japan; tsunami warning issued', source: 'Reuters' }),
    start: scene('start', { prompt: 'CLICK TO TUNE IN' }),
  };

  test('each is drawn for the frame, its words whole inside the safe column and above the feeds; a programme is not', () => {
    for (const [name, sc] of Object.entries(CASES)) {
      const c = fakeCanvas();
      const g = c.getContext('2d');
      const memo = {};
      if (name === 'spot') V.drawVerticalChannel(g, T, CASES.bumper, { memo }); // (the bumper says what comes after)
      g.images.length = 0;
      assert.equal(V.drawVerticalChannel(g, T, sc, { adWindow: true, memo }), true, name);
      assert.ok(wordsSafe(g, name) >= (name === 'ident' ? 0 : 2), `${name}: words drawn`);
    }
    for (const shot of ['wide', 'close', 'full', 'map', 'montage', 'hold', 'open']) assert.equal(V.drawVerticalChannel(fakeCanvas().getContext('2d'), T, scene(shot)), false, shot);
  });

  test('the AI notice is on the ident, in the end card\'s three rows, and never in a break', () => {
    const n0 = D.NOTICE_DRAWS.n;
    for (const name of ['bumper', 'spot', 'promo', 'countdown']) V.drawVerticalChannel(fakeCanvas().getContext('2d'), T, CASES[name], { adWindow: true, memo: {} });
    assert.equal(D.NOTICE_DRAWS.n, n0, 'nothing in the break says it');
    // (the ident's words arrive with its lock-up, half a second in)
    V.drawVerticalChannel(fakeCanvas().getContext('2d'), T, scene('ident', {}, { shotSince: T - 0.2 }), {});
    assert.equal(D.NOTICE_DRAWS.n, n0, 'not before the lock-up');
    V.drawVerticalChannel(fakeCanvas().getContext('2d'), T, CASES.ident, {});
    assert.equal(D.NOTICE_DRAWS.n, n0 + 1);
    assert.deepEqual(D.noticeParts('NEWS'), ['AI-PRODUCED NEWS', 'PRESENTERS ARE AI CHARACTERS', 'FACTS FROM CREDITED SOURCES']);
  });

  test("a spot: its window left open for the playout's encoder only, the black between spots black, the tag and the clock", () => {
    const c = fakeCanvas();
    const g = c.getContext('2d');
    V.drawVerticalChannel(g, T, CASES.spot, { adWindow: true, memo: {} });
    assert.deepEqual(g.cleared, [{ ...V.AD_WINDOW }]);
    const c2 = fakeCanvas();
    const g2 = c2.getContext('2d');
    const src = { width: 384, height: 216 };
    V.drawVerticalChannel(g2, T, CASES.spot, { adWindow: false, source: src, memo: {} });
    assert.equal(g2.cleared.length, 0);
    assert.ok(g2.images.some((im) => im.img === src && im.x === V.AD_WINDOW.x && im.w === V.AD_WINDOW.w), 'the spot scaled into the window');
    const c3 = fakeCanvas();
    const g3 = c3.getContext('2d');
    V.drawVerticalChannel(g3, T, scene('ad', { ad: { id: 'black', black: true } }), { adWindow: true, memo: {} });
    assert.equal(g3.cleared.length, 0);
    assert.deepEqual(g3.fills.map((f) => [f.x, f.y, f.w, f.h]), [[0, 0, 216, 384]]);
  });

  test('balanced lines: the same count, as even as they go; a word too long for a line is cut, never lost silently', () => {
    const l = V.balancedWords('The tech news that matters, in plain words', 180, 1, 2);
    assert.equal(l.length, 2);
    const wrap = V.wrapWords('The tech news that matters, in plain words', 180, 1, 2);
    assert.equal(wrap.length, 2);
    assert.equal(l.join(' '), wrap.join(' '));
    assert.equal(V.wrapWords('one two three four five six seven eight nine ten', 40, 1, 2).at(-1).endsWith('…'), true);
  });
});

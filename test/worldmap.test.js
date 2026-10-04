// The world map's land-mask decoder: bit-packed output, identical to a plain
// reference decode of the real data, and safe on truncated or corrupt input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeLandBits, drawWorldMap, warmMapData, __test } from '../public/js/scenes/worldmap.js';
import { LAND } from '../public/js/scenes/worlddata.js';

/** Straightforward byte-per-pixel decode used as the reference. */
function reference(rle, W, H) {
  const bin = Buffer.from(rle, 'base64');
  const out = new Uint8Array(W * H);
  let p = 0;
  for (let j = 0; j < H && p < bin.length; j++) {
    let x = 0;
    let cur = 0;
    while (x < W && p < bin.length) {
      let run = 0;
      let shift = 0;
      let b;
      do {
        b = bin[p++];
        run += (b & 127) * 2 ** shift;
        shift += 7;
      } while (b & 128 && p < bin.length);
      run = Math.min(run, W - x);
      if (cur) out.fill(1, j * W + x, j * W + x + run);
      x += run;
      cur ^= 1;
    }
  }
  return out;
}

const bit = (m, x, y) => (m.bits[y * m.stride + (x >> 3)] >> (x & 7)) & 1;

test('decodeLandBits packs the real land mask into 1 bit per pixel and matches the reference', () => {
  const m = decodeLandBits(LAND.rle, LAND.w, LAND.h);
  assert.equal(m.bits.length, (LAND.w * LAND.h) / 8);
  const ref = reference(LAND.rle, LAND.w, LAND.h);
  let land = 0;
  for (let y = 0; y < LAND.h; y += 3) {
    for (let x = 0; x < LAND.w; x++) {
      assert.equal(bit(m, x, y), ref[y * LAND.w + x], `pixel ${x},${y}`);
      land += ref[y * LAND.w + x];
    }
  }
  assert.ok(land > 0.15 * (LAND.w * LAND.h) / 3 && land < 0.45 * (LAND.w * LAND.h) / 3, 'about 30% of the planet is land');
});

test('decodeLandBits never writes past a row or the buffer on corrupt input', () => {
  const W = 16;
  const H = 3;
  // row 0: 4 ocean, then a land run claiming 1000 px (clamped to the row); row 1: truncated varint
  const bytes = Uint8Array.from([4, 0xe8, 0x07, 0, 16, 0x80]);
  const m = decodeLandBits(bytes, W, H);
  assert.equal(m.bits.length, (W * H) / 8);
  for (let x = 0; x < W; x++) assert.equal(bit(m, x, 0), x >= 4 ? 1 : 0);
  for (let x = 0; x < W; x++) assert.equal(bit(m, x, 2), 0);
  assert.doesNotThrow(() => decodeLandBits(new Uint8Array(0), W, H));
  assert.doesNotThrow(() => decodeLandBits(Uint8Array.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), W, H));
});

test('decodeLandBits keeps rows apart when the width is not a multiple of 8', () => {
  // row 0: 8 ocean, then a land run of 2 (to the end of the 10 px row); row 1: 10 ocean
  const m = decodeLandBits(Uint8Array.from([8, 2, 10, 0]), 10, 2);
  assert.equal(m.stride, 2);
  assert.equal(bit(m, 8, 0), 1);
  assert.equal(bit(m, 9, 0), 1);
  for (let x = 0; x < 10; x++) assert.equal(bit(m, x, 1), 0, `row 1 pixel ${x}`);
});

// The place label must never hide the place it names: the land connected to the marker (the
// target's own coastline) is a keep-out area for the label plate.
for (const [place, lat, lon] of [
  ['REYKJAVIK, ICELAND', 64.15, -21.94],
  ['REYKJANES PENINSULA, ICELAND', 63.9, -22.4],
  ['HERAKLION, CRETE', 35.34, 25.13],
  ['PALERMO, SICILY', 38.12, 13.36],
  ['HONOLULU, HAWAII', 21.31, -157.86],
  ['SUVA, FIJI', -18.14, 178.44],
]) {
  test(`the label for ${place} leaves the target landmass uncovered and stays in y 26..134`, () => {
    const r = __test.labelFor(place, lat, lon);
    assert.ok(r.nearTotal > 0, 'the target has land around its marker');
    assert.equal(r.near, 0, `the plate covers ${r.near} px of the target's own land`);
    assert.ok(r.box.y >= 26 && r.box.y + r.box.h <= 134, `plate rows ${r.box.y}..${r.box.y + r.box.h}`);
    assert.ok(r.box.x >= 13 && r.box.x + r.box.w <= 371, 'plate inside the action-safe area');
    const overMarker = r.box.x < r.cx + 8 && r.box.x + r.box.w > r.cx - 8 && r.box.y < r.cy + 8 && r.box.y + r.box.h > r.cy - 8;
    assert.ok(!overMarker, 'the plate never sits on the marker');
  });
}

test('map timelines follow the programme bibles and compress for short shots', () => {
  const wn = __test.timingFor('world-now');
  const n60 = __test.timingFor('news-60');
  assert.equal(wn.fly, 1.2);
  assert.equal(n60.pan, 0.7);
  assert.ok(n60.fly < wn.fly);
  const short = __test.timingFor('world-now', 2.1);
  assert.ok(short.fly + short.mark + short.label + 0.5 <= 2.1, 'the label is readable inside a 2.1 s beat');
});

// --- rendering in Node: a fake canvas that keeps the composed ImageData the map puts into its buffer
function fakeDoc() {
  const make = () => {
    const cv = { width: 300, height: 150, last: null };
    const ctx = {
      canvas: cv,
      fillStyle: '#000',
      imageSmoothingEnabled: false,
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData(img) { cv.last = img; },
      drawImage(src) { if (!ctx.drawn) ctx.drawn = src; }, // the map's own buffer is the first image drawn
      fillRect() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
      measureText: () => ({ width: 0 }),
    };
    cv.getContext = () => ctx;
    return cv;
  };
  return { createElement: make, make };
}

test('the composed map never holds a transparent pixel (fly-in, reticle, ring, pan, mini)', () => {
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    warmMapData();
    const target = doc.make().getContext('2d');
    const cases = [
      { lat: 38.72, lon: -9.14, place: 'LISBON, PORTUGAL' },
      { lat: -1.29, lon: 36.82, place: 'NAIROBI, KENYA', from: { lat: 38.72, lon: -9.14 } },
      { lat: 64.15, lon: -21.94, place: 'REYKJAVIK', x: 140, y: 18, w: 104, h: 62, mini: true },
      { lat: 45.42, lon: -75.7, place: 'OTTAWA', pins: [{ lat: 38.9, lon: -77.04, place: 'WASHINGTON' }] },
      { lat: -77.85, lon: 166.67, place: 'MCMURDO STATION' },
    ];
    for (const o of cases) {
      for (let dt = 0; dt <= 2.2; dt += 0.05) {
        target.drawn = null;
        drawWorldMap(target, 100 + dt, dt, { ...o, now: Date.UTC(2026, 9, 2, 17, 42) });
        const img = target.drawn.last;
        const d = img.data;
        let holes = 0;
        for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) holes++;
        assert.equal(holes, 0, `${o.place} at dt ${dt.toFixed(2)}: ${holes} transparent pixels`);
      }
    }
  } finally {
    delete globalThis.document;
  }
});

test('every RGB.<name> the map plots is in its colour table', () => {
  const src = readFileSync(new URL('../public/js/scenes/worldmap.js', import.meta.url), 'utf8');
  const table = src.match(/const RGB = Object\.freeze\(Object\.fromEntries\(\[([^\]]+)\]/);
  assert.ok(table, 'RGB table found');
  const names = new Set([...table[1].matchAll(/'(\w+)'/g)].map((m) => m[1]));
  const used = new Set([...src.matchAll(/RGB\.(\w+)/g)].map((m) => m[1]));
  for (const n of used) assert.ok(names.has(n), `RGB.${n} is plotted but missing from the table`);
});

test('the fly-in starts inside the poles and the map survives bad sizes and odd programme ids', () => {
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    warmMapData();
    const target = doc.make().getContext('2d');
    for (const w of [Infinity, 1e18, -5, NaN, '384']) assert.doesNotThrow(() => drawWorldMap(target, 0, 0.5, { lat: 10, lon: 10, w, h: 1e9 }));
    for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      assert.doesNotThrow(() => drawWorldMap(target, 0, 0.5, { lat: 10, lon: 10, programId: id }));
      assert.ok(Number.isFinite(__test.timingFor(id).fly), `timing for ${id}`);
    }
    // a whole-world first frame shows no rows beyond the poles
    for (const [lat, lon] of [[38.72, -9.14], [-77.85, 166.67], [78.22, 15.65], [-1.29, 36.82]]) {
      for (const dt of [0, 0.15, 0.3, 0.6]) {
        const v = __test.viewAt(lat, lon, dt);
        assert.ok(v.top <= 90 + 1e-6 && v.bottom >= -90 - 1e-6, `${lat},${lon} at ${dt}: rows ${v.top.toFixed(1)}..${v.bottom.toFixed(1)}`);
      }
    }
  } finally {
    delete globalThis.document;
  }
});

test('follow mode decides per shot: a place shown again after a gap flies in from the world', () => {
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    warmMapData();
    const target = doc.make().getContext('2d');
    const A = { lat: 38.72, lon: -9.14, place: 'LISBON', follow: true, w: 200, h: 112 };
    const B = { lat: -1.29, lon: 36.82, place: 'NAIROBI', follow: true, w: 200, h: 112 };
    const hashAt = (o, t, dt) => {
      target.drawn = null;
      drawWorldMap(target, t, dt, o);
      const d = target.drawn.last.data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) h = Math.imul(h ^ (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16)), 16777619);
      return h >>> 0;
    };
    // fresh fly-in to Nairobi
    for (let k = 0; k <= 10; k++) hashAt(B, 500 + k / 30, k / 30);
    const fresh = hashAt(B, 600.4, 0.4);
    // Lisbon, then a straight cut to Nairobi (a pan), then a 30 s gap and Nairobi again
    for (let k = 0; k <= 60; k++) hashAt(A, 700 + k / 30, k / 30);
    const pan = hashAt(B, 702.04, 0.02);
    for (let k = 1; k <= 12; k++) hashAt(B, 702.04 + k / 30, 0.02 + k / 30);
    assert.ok(Number.isFinite(pan));
    for (let k = 0; k <= 12; k++) hashAt(B, 740 + k / 30, k / 30);
    assert.equal(hashAt(B, 740.4, 0.4), fresh, 'the revisit renders like a fresh fly-in');
  } finally {
    delete globalThis.document;
  }
});

test('a whole country is named, never pinned: no marker in the map’s pixels (a pin in Kansas once stood for "off the US coast")', () => {
  const doc = fakeDoc();
  globalThis.document = doc;
  try {
    warmMapData();
    const target = doc.make().getContext('2d');
    const red = (o) => {
      target.drawn = null;
      drawWorldMap(target, 200, 3, { lat: 39.8, lon: -98.6, place: 'USA', ...o, now: Date.UTC(2026, 9, 2, 17, 42) });
      const d = target.drawn.last.data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] === 0xe4 && d[i + 1] === 0x3b && d[i + 2] === 0x44) n++;
      return n;
    };
    assert.ok(red({}) > 0, 'a place has its pin (the programme accent)');
    assert.equal(red({ scope: 'country' }), 0, 'a country has none');
  } finally {
    delete globalThis.document;
  }
});

// The world map's land-mask decoder: bit-packed output, identical to a plain
// reference decode of the real data, and safe on truncated or corrupt input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLandBits, __test } from '../public/js/scenes/worldmap.js';
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

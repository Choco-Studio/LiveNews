// The world map's land-mask decoder: bit-packed output, identical to a plain
// reference decode of the real data, and safe on truncated or corrupt input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeLandBits } from '../public/js/scenes/worldmap.js';
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

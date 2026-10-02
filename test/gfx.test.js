// Shared graphics helpers (public/js/gfx): easing end points, quantised alpha
// colours (bounded cache), bounded memo, pixel rings and the frozen clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeOut, easeInOut, easeOutQuint, easeOutBack, seg, dropBounce, rgba, u32, memo, ringPts, setNow, clockIn, bayer } from '../public/js/gfx/index.js';

test('easing curves start at 0, end at 1 and clamp outside', () => {
  for (const f of [easeOut, easeInOut, easeOutQuint, (x) => easeOutBack(x, 1.2)]) {
    assert.ok(Math.abs(f(0)) < 1e-9);
    assert.ok(Math.abs(f(1) - 1) < 1e-9);
    assert.equal(f(-3), f(0));
    assert.equal(f(4), f(1));
  }
  assert.equal(seg(0.5, 0, 1), 0.5);
  assert.equal(seg(-1, 0, 1), 0);
  assert.equal(dropBounce(0), 1);
  assert.equal(dropBounce(1), 0);
});

test('rgba quantises alpha so every alpha maps to one of 33 strings per colour', () => {
  const seen = new Set();
  for (let i = 0; i <= 1000; i++) seen.add(rgba('#e43b44', i / 1000));
  assert.ok(seen.size <= 33);
  assert.equal(rgba('#e43b44', 1), '#e43b44');
  assert.equal(rgba('#e43b44', 0.5), 'rgba(228,59,68,0.5)');
  assert.equal(u32('#ff0000'), 0xff0000ff);
});

test('memo caches by key and never grows past its limit', () => {
  const cached = memo(4);
  let builds = 0;
  for (let i = 0; i < 20; i++) cached(`k${i % 6}`, () => ++builds);
  assert.ok(cached.size() <= 4);
  const a = cached('same', () => ({}));
  assert.equal(cached('same', () => ({})), a);
});

test('ringPts gives a closed symmetric 1 px circle', () => {
  const pts = ringPts(10);
  const set = new Set();
  for (let i = 0; i < pts.length; i += 2) set.add(`${pts[i]},${pts[i + 1]}`);
  for (const k of set) {
    const [x, y] = k.split(',').map(Number);
    assert.ok(set.has(`${-x},${y}`) && set.has(`${x},${-y}`));
    assert.ok(Math.abs(Math.hypot(x, y) - 10) < 1);
  }
  assert.ok(bayer(0, 0) > 0 && bayer(3, 3) < 1);
});

test('the graphics clock can be frozen for deterministic frames', () => {
  setNow(Date.UTC(2026, 9, 2, 17, 42, 7));
  const c = clockIn('Europe/London');
  assert.equal(c.time, '18:42');
  assert.equal(c.sec, '07');
  assert.match(c.date, /FRIDAY 2 OCTOBER/);
  setNow(null);
});

// Ad-break playout: pickAds rotation (no back-to-back repeats) and the
// director restarting the clock of every ad and headline-montage frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADS, pickAds } from '../public/js/ads/index.js';
import { Director } from '../public/js/director.js';

const fake = (ids) => ids.map((id) => ({ id }));
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

test('pickAds returns distinct ads and never more than exist', () => {
  const ads = pickAds(10, []);
  assert.equal(ads.length, ADS.length);
  assert.equal(new Set(ads.map((a) => a.id)).size, ads.length);
  assert.equal(pickAds(0).length, 0);
  assert.equal(pickAds(2).length, 2);
});

test('pickAds prefers ads that have not played, then the least recently played', () => {
  const ads = fake(['a', 'b', 'c', 'd']);
  for (let s = 1; s < 40; s++) {
    const picked = pickAds(2, ['a', 'b'], { ads, rand: seeded(s) }).map((a) => a.id).sort();
    assert.deepEqual(picked, ['c', 'd']);
    // every ad seen: the two oldest come back, the two newest wait
    const later = pickAds(2, ['a', 'b', 'c', 'd'], { ads, rand: seeded(s) }).map((a) => a.id).sort();
    assert.deepEqual(later, ['a', 'b']);
  }
});

test('the ad that played last never opens the next break (no back-to-back repeat)', () => {
  const ads = fake(['a', 'b', 'c']);
  for (let s = 1; s < 60; s++) {
    const picked = pickAds(3, ['b', 'c', 'a'], { ads, rand: seeded(s) });
    assert.notEqual(picked[0].id, 'a');
  }
});

test('a long run of breaks with the real history never repeats an ad back to back', () => {
  const rand = seeded(7);
  let recent = [];
  let prev = null;
  for (let b = 0; b < 200; b++) {
    for (const ad of pickAds(1 + (b % 3), recent, { rand })) {
      assert.notEqual(ad.id, prev, `break ${b}`);
      prev = ad.id;
      recent = [...recent, ad.id].slice(-24);
    }
  }
});

test('director restarts the shot clock for consecutive ads and montage frames', () => {
  const director = new Director({ audio: {}, channel: { name: 'T', slogan: '', presenters: {} } });
  const s = director.scene;
  director.setShot('ad', { card: { ad: ADS[0], line: -1 } });
  s.shotSince = -100;
  director.setShot('ad', { card: { ad: ADS[1], line: -1 } });
  assert.ok(s.shotSince > -100, 'second ad starts from its own t=0');
  director.setShot('montage', { card: { index: 0 } });
  s.shotSince = -100;
  director.setShot('montage', { card: { index: 1 } });
  assert.ok(s.shotSince > -100, 'montage frame 2 replays its entrance');
  // other shots keep their clock when nothing changes (e.g. the wall swap on a wide)
  director.setShot('wide', { focus: 'A' });
  s.shotSince = -100;
  director.setShot('wide', { focus: 'A', wall: { mode: 'logo' } });
  assert.equal(s.shotSince, -100);
});

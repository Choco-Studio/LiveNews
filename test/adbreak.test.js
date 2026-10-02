// Ad-break playout: pickAds rotation (no back-to-back repeats), the director
// restarting the clock of every ad and headline-montage frame and keeping the
// voice-over and bed on that picture clock, the contract every spot follows
// (including a smoke run of every spot's draw() on a recording fake canvas),
// and the commercial kit's faces and pure helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADS, pickAds } from '../public/js/ads/index.js';
import { Director } from '../public/js/director.js';
import { parseTune } from '../public/js/audio/tune.js';
import * as K from '../public/js/ads/kit.js';

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

test('after every ad has aired, breaks do not settle into a fixed carousel of pairs', () => {
  const rand = seeded(11);
  let recent = ADS.map((a) => a.id); // everything has played once
  const pairs = new Set();
  for (let b = 0; b < 40; b++) {
    const picked = pickAds(2, recent, { rand });
    // never one of the two most recently played
    for (const ad of picked) assert.ok(!recent.slice(-2).includes(ad.id), `break ${b}: ${ad.id} just played`);
    pairs.add(picked.map((a) => a.id).join('>'));
    recent = [...recent, ...picked.map((a) => a.id)].slice(-24);
  }
  assert.ok(pairs.size > ADS.length / 2 + 2, `only ${pairs.size} distinct pairs in 40 breaks`);
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

// --- the spots themselves (contract shared with director.js / studio.js) ----

test('every ad follows the contract the director plays', () => {
  for (const ad of ADS) {
    assert.ok(ad.id && typeof ad.id === 'string', 'id');
    assert.ok(ad.brand, `${ad.id}: brand`);
    assert.equal(typeof ad.draw, 'function', `${ad.id}: draw`);
    assert.ok(ad.duration >= 15 && ad.duration <= 30, `${ad.id}: duration ${ad.duration}`);
    assert.ok(Array.isArray(ad.script) && ad.script.length, `${ad.id}: script`);
    let prev = -1;
    for (const line of ad.script) {
      assert.ok(line.at > prev && line.at < ad.duration, `${ad.id}: line at ${line.at}`);
      assert.ok(line.text && line.text.length < 90, `${ad.id}: line text`);
      prev = line.at;
    }
    assert.ok(parseTune(ad.tune), `${ad.id}: tune parses`);
  }
  assert.equal(new Set(ADS.map((a) => a.id)).size, ADS.length, 'ids are unique');
});

test('ads-1 spots: each voice-over line ends before the next one and inside the spot', () => {
  for (const id of ['bitfizz-cola', 'cloudbrella']) {
    const ad = ADS.find((a) => a.id === id);
    assert.ok(ad, id);
    const cps = 13.5 * (ad.voice?.rate || 1); // browser TTS speaks ~13-15 characters a second
    ad.script.forEach((line, i) => {
      const end = line.at + line.text.length / cps;
      const next = i + 1 < ad.script.length ? ad.script[i + 1].at : ad.duration;
      assert.ok(end <= next + 0.05, `${id}: "${line.text}" ends at ${end.toFixed(2)}s, next starts ${next}`);
    });
    assert.ok(ad.duration >= 20 && ad.duration <= 25.5, `${id}: 20-25 s`);
  }
});

test('ads-1 jingles cover the whole spot with a tail, every track in step', () => {
  for (const id of ['bitfizz-cola', 'cloudbrella']) {
    const ad = ADS.find((a) => a.id === id);
    const song = parseTune(ad.tune);
    const seconds = (song.beats * 60) / song.bpm;
    assert.ok(seconds >= ad.duration + 1, `${id}: ${seconds.toFixed(1)} s of music for ${ad.duration} s`);
    for (const tr of song.tracks) assert.equal(tr.beats, song.beats, `${id}: a ${tr.kind} track repeats early`);
    assert.ok(song.bpm <= 110, `${id}: a calm tempo`);
  }
});

test('no looping ad bed restarts inside its spot (music >= duration + 0.5 s)', () => {
  for (const ad of ADS) {
    const song = parseTune(ad.tune);
    const seconds = (song.beats * 60) / song.bpm;
    assert.ok(seconds >= ad.duration + 0.5, `${ad.id}: ${seconds.toFixed(2)} s of music for a ${ad.duration} s spot`);
  }
});

test('ads-1 voice-overs stay short and calm (channel-and-breaks §5.5)', () => {
  const words = (ad) => ad.script.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  const bf = ADS.find((a) => a.id === 'bitfizz-cola');
  assert.ok(words(bf) <= 25, `luxury spirits VO is ${words(bf)} words`);
  for (const ad of [bf, ADS.find((a) => a.id === 'cloudbrella')]) {
    for (const l of ad.script) assert.ok(!l.text.includes('!'), `${ad.id}: no exclamation in "${l.text}"`);
  }
});

// --- the director keeps an ad's sound on its picture clock ------------------------

test('playAd speaks each line and starts the bed on the picture clock, not 0.4 s late', async () => {
  const spoken = [];
  let tuneOpts = null;
  const audio = {
    setVoices() {},
    playTune(tune, opts) {
      tuneOpts = opts;
      return { stop() {} };
    },
    async speak(text) {
      spoken.push({ text, t: performance.now() / 1000 });
    },
  };
  const director = new Director({ audio, channel: { name: 'T', slogan: '', presenters: {} } });
  const ad = { id: 'x', voice: {}, tune: 'C4:1', duration: 0.62, script: [{ at: 0.32, text: 'one' }, { at: 0.48, text: 'two' }] };
  director.setShot('ad', { card: { ad, line: -1 } });
  const s = director.scene;
  // the stinger's second half has already run when playAd is called
  s.shotSince = performance.now() / 1000 - 0.25;
  await director.playAd(ad);
  const end = performance.now() / 1000 - s.shotSince;
  assert.equal(spoken.length, 2);
  for (let i = 0; i < 2; i++) {
    const dt = spoken[i].t - s.shotSince;
    assert.ok(Math.abs(dt - ad.script[i].at) < 0.06, `line ${i} at ${dt.toFixed(3)} s on the picture clock, script says ${ad.script[i].at}`);
  }
  assert.ok(Math.abs(tuneOpts.startAt - s.shotSince * 1000) < 1, 'the bed is scheduled from the cut');
  assert.ok(end >= ad.duration - 0.02 && end < ad.duration + 0.1, `the ad holds ${end.toFixed(3)} s for a ${ad.duration} s spot`);
});

// --- every spot draws cleanly ----------------------------------------------------------

/**
 * A recording fake 2D context: counts save/restore, flags non-finite numeric
 * arguments, out-of-range alpha and missing images. Canvases created by the
 * ads (cached art, scratch buffers) get their own fake contexts.
 */
function fakeCanvasWorld() {
  const issues = [];
  let depth = 0;
  let where = '';
  const note = (kind) => {
    if (issues.length < 20) issues.push(`${where}: ${kind}`);
  };
  const makeCtx = (cv) => {
    const state = { canvas: cv };
    return new Proxy(state, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === 'save') return () => depth++;
        if (p === 'restore') return () => depth--;
        if (p === 'createImageData') return (a, b) => {
          const w = typeof a === 'object' ? a.width : a;
          const h = typeof a === 'object' ? a.height : b;
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        };
        if (p === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (p === 'measureText') return () => ({ width: 10 });
        if (p === 'createPattern' || p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        return (...args) => {
          for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) note(`${String(p)} got ${a}`);
          if (p === 'drawImage' && (!args[0] || !args[0].width || !args[0].height)) note('drawImage of an empty image');
        };
      },
      set(t, p, v) {
        if (p === 'globalAlpha' && !(v >= 0 && v <= 1)) note(`globalAlpha ${v}`);
        t[p] = v;
        return true;
      },
    });
  };
  const doc = {
    createElement() {
      const cv = { width: 300, height: 150 };
      let ctx = null;
      cv.getContext = () => (ctx ||= makeCtx(cv));
      return cv;
    },
  };
  return { doc, makeCtx, issues, at: (w) => (where = w), depth: () => depth };
}

test('every ad draws its whole spot without errors, bad numbers or unbalanced save/restore', () => {
  const world = fakeCanvasWorld();
  const prevDoc = globalThis.document;
  globalThis.document = world.doc;
  try {
    for (const ad of ADS) {
      const ctx = world.makeCtx({ width: 384, height: 216 });
      for (let dt = 0; dt < ad.duration + 0.5; dt += 0.1) {
        world.at(`${ad.id} @${dt.toFixed(1)}s`);
        const before = world.depth();
        let line = -1;
        ad.script.forEach((l, i) => {
          if (dt >= l.at && dt < l.at + 2.5) line = i;
        });
        assert.doesNotThrow(() => ad.draw(ctx, dt, dt, { line, speaking: line >= 0, duration: ad.duration }), `${ad.id} at ${dt.toFixed(1)} s`);
        assert.equal(world.depth(), before, `${ad.id} at ${dt.toFixed(1)} s: save/restore balanced`);
      }
    }
  } finally {
    globalThis.document = prevDoc;
  }
  assert.deepEqual(world.issues, [], world.issues.join('\n'));
});

test('kit display faces have every capital, digit and common mark', () => {
  for (const face of ['serif', 'thin']) {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\'-:/&?!%+()') assert.ok(K.hasGlyph(face, ch), `${face} ${ch}`);
  }
  assert.equal(K.faceCap('serif'), 11);
  assert.equal(K.faceCap('thin'), 9);
  // tracking adds exactly (n - 1) * track; scale multiplies
  const w = K.typeWidth('RESERVE', { face: 'serif' });
  assert.equal(K.typeWidth('RESERVE', { face: 'serif', track: 3 }), w + 6 * 3);
  assert.equal(K.typeWidth('RESERVE', { face: 'serif', scale: 2 }), w * 2);
  assert.equal(K.typeWidth('reserve', { face: 'serif' }), w, 'lower case is set in capitals');
});

test('kit pure helpers: hash noise, dither threshold, palette shadows, profiles', () => {
  for (let i = 0; i < 200; i++) {
    const v = K.hash01(i, 7);
    assert.ok(v >= 0 && v < 1);
    assert.equal(v, K.hash01(i, 7), 'deterministic');
  }
  const seen = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) seen.add(K.bayer(x, y));
  assert.equal(seen.size, 16, 'Bayer 4x4 has 16 levels');
  const luma = (hex) => {
    const [r, g, b] = K.rgb(hex);
    return r * 0.3 + g * 0.59 + b * 0.11;
  };
  for (const c of [K.P.white, K.P.yellow, K.P.cream, K.P.silver, K.P.orange]) {
    const d = K.shadeOf(c, 0.6);
    assert.ok(Object.values(K.P).includes(d), `${c} shades to a palette colour`);
    assert.ok(luma(d) < luma(c), `${c} -> ${d} is darker`);
  }
  const prof = K.profile(10, [[0, 2], [1, 12]]);
  assert.equal(prof.length, 10);
  assert.ok(Math.abs(prof[0] - 2) < 1e-6 && Math.abs(prof[9] - 12) < 1e-6);
  const out = new Float32Array(20);
  assert.equal(K.profileInto(out, 10, [[0, 2], [1, 12]]), out, 'fills in place');
});

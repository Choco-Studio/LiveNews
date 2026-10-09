// WORLD NOW's title sequence (owner, 9 Oct): the music and the pictures on one cue sheet, the big
// earth handing over to the lock-up's globe pixel for pixel, and the sequence's own length end to end
// (cue sheet -> theme -> openFor -> the director's wait).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// a canvas whose image data is real memory (the planet and the globe draw into pixel buffers)
function fakeCanvas() {
  const cv = { width: 300, height: 150 };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    fillRect() {},
    drawImage() {},
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'resetTransform', 'translate', 'scale', 'fillText', 'strokeRect', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

let cues, themes, opens, planet, world, kit, titles, tune;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  cues = await import('../public/js/scenes/opens/worldcues.js');
  themes = await import('../public/js/audio/themes.js');
  tune = await import('../public/js/audio/tune.js');
  opens = await import('../public/js/scenes/opens.js');
  planet = await import('../public/js/scenes/opens/planet.js');
  world = await import('../public/js/scenes/opens/world.js');
  kit = await import('../public/js/scenes/opens/kit.js');
  titles = await import('../public/js/scenes/opens/worldtitles.js');
  await new Promise((r) => setTimeout(r, 50)); // opens.js loads the themes lazily
});

test('the sequence runs ten seconds on one grid: the hit 0.8 s before the cut, the theme on the same clock', () => {
  const { WN_DURATION, WN_HIT, WN_BPM, WN_CUES } = cues;
  assert.ok(WN_DURATION > 9.5 && WN_DURATION < 11, `${WN_DURATION} s`);
  assert.ok(Math.abs(WN_DURATION - WN_HIT - 0.8) < 1e-9);
  const o = opens.openFor('world-now');
  assert.equal(o.duration, WN_DURATION, 'the director waits the sequence out');
  assert.equal(o.tune.meta.cutAt, WN_DURATION);
  assert.equal(o.tune.meta.hitAt, WN_HIT);
  assert.equal(o.tune.meta.bpm, WN_BPM, 'the theme keeps the pictures\' tempo (no re-fit)');
  assert.equal(WN_CUES.hit * (60 / WN_BPM), WN_HIT);
});

test('each landing rings its bell on the beat, London pips on the first four, the brass states the signature into the hit', () => {
  const { WN_DURATION, WN_CUES, WN_BPM } = cues;
  const song = tune.parseTune(themes.themeFor('world-now', { duration: WN_DURATION }));
  const spb = 60 / WN_BPM;
  const starts = (track) => track.events.map((e) => Math.round(e.at * 1000) / 1000);
  // the lead's first five notes: the signature, then the colour (3) over the D pedal, ending on the hit
  const lead = song.tracks[0].events;
  const tonic = lead[1].midis[0];
  assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
  assert.equal(lead[4].midis[0] - tonic, themes.COLOURS.home);
  assert.equal(lead[4].at + lead[4].dur, WN_CUES.hit, 'the colour resolves on the hit');
  assert.ok(lead[0].at >= WN_CUES.lock - 1e-9, 'the brass waits for the camera to settle');
  // pips and bells
  const pips = song.tracks.find((t) => t.events.length === WN_CUES.pings.length && t.events.every((e) => e.dur < 0.25));
  assert.ok(pips, 'a pip track');
  assert.deepEqual(starts(pips), [...WN_CUES.pings]);
  const bells = song.tracks.find((t) => t.kind === 'harmony' && WN_CUES.land.every((b) => t.events.some((e) => Math.abs(e.at - b) < 1e-6)));
  assert.ok(bells, 'a bell on every landing');
  // the bells sing the signature's first notes (low 5, 1, 2) and its high 5 on the bloom (two octaves
  // over the low brass)
  const at = (b) => bells.events.find((e) => Math.abs(e.at - b) < 1e-6).midis;
  assert.deepEqual([...WN_CUES.land, WN_CUES.bloom].map((b) => Math.max(...at(b)) - tonic - 12), [7, 12, 14, 19]);
  // the final chord on the hit, the button on the cut (in seconds, as the director plays it)
  const all = song.tracks.flatMap((t) => t.events.map((e) => Math.round(e.at * spb * 1000)));
  assert.ok(all.includes(Math.round(cues.WN_HIT * 1000)), 'a hit on the lock-up');
  assert.ok(all.includes(Math.round(WN_DURATION * 1000)), 'a button on the cut');
});

test('at the emblem\'s camera the big earth draws exactly the emblem globe\'s pixels (no pop at the hand-over)', () => {
  for (const [R, lam] of [[54, -13.37], [54, -12], [41, 7.5]]) {
    const cam = planet.aim({ cx: 192, cy: 98, R, tilt: world.TILT_DEG, lam, light: [...world.LIGHT], space: 0 });
    planet.begin(cam);
    planet.disc(cam);
    const D = kit.frameBuffer('planet', kit.W, kit.H).d;
    const ctx = fakeCanvas().getContext('2d');
    world.drawEarth(ctx, 192, 98, R, lam);
    const S = 2 * R + 5;
    const c = R + 2;
    const G = kit.frameBuffer('wn-globe', S, S).d;
    let n = 0;
    let diff = 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const g = G[y * S + x];
        if (!g) continue;
        n++;
        if (D[(98 - c + y) * kit.W + (192 - c + x)] !== g) diff++;
      }
    }
    assert.ok(n > 3 * R * R, `R ${R}: the globe drew (${n} px)`);
    assert.equal(diff, 0, `R ${R} lam ${lam}: ${diff} of ${n} pixels differ`);
  }
});

test('the sequence draws every instant without throwing and hands over to the package\'s reveal', () => {
  const info = { title: 'WORLD NOW', tagline: 'THE STORIES SHAPING OUR WORLD', presenters: ['PACO PIXEL', 'LOLA BYTE'] };
  const ctx = fakeCanvas().getContext('2d');
  for (let t = 0; t < cues.WN_DURATION + 1; t += 0.05) assert.doesNotThrow(() => opens.drawOpen(ctx, 0, t, 'world-now', info), `t ${t.toFixed(2)}`);
  assert.ok(titles.WN_REVEAL > cues.wnAt(cues.WN_CUES.lock) && titles.WN_REVEAL < cues.WN_HIT, 'the reveal comes after the camera settles, before the hit');
});

test('the place names carry real zones (their local time is on the plate)', () => {
  for (const pl of titles.WN_PLACES) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat('en-GB', { timeZone: pl.tz }), pl.tz);
    assert.ok(pl.to - pl.from >= 1.8, `${pl.name} is up long enough to read`);
  }
  assert.deepEqual(titles.WN_PLACES.map((p) => p.name), ['LONDON', 'NEW YORK', 'NEW DELHI', 'NAIROBI']);
});

test('the horizon is the true circle on every frame, so it only moves as the camera does (owner, 9 Oct: "it vibrates")', () => {
  // The planet was drawn with its centre and radius rounded apart: the horizon stepped 56, 57, 56, 57...
  // Now the first row of the disc down any column is the true circle's, 60 frames a second along the
  // camera's whole flight, and the night shot's horizon (where the camera only pulls back) never rises.
  const D = kit.frameBuffer('planet', kit.W, kit.H).d;
  const end = titles.WN_REVEAL * 60;
  for (const col of [60, 120, 192, 260, 330]) {
    let prev = -1;
    let back = 0;
    for (let f = 0; f < end; f++) {
      const cam = titles.wnCamera(f / 60 / cues.WN_BEAT);
      cam.space = 0;
      planet.aim(cam);
      planet.begin(cam);
      planet.disc(cam);
      let top = -1;
      for (let y = 0; y < kit.H; y++) if (D[y * kit.W + col]) { top = y; break; }
      const RR = cam.R + 0.5;
      const dx = col - cam.cx;
      const want = dx * dx <= RR * RR ? Math.max(0, Math.ceil(cam.cy - Math.sqrt(RR * RR - dx * dx))) : -1;
      if (want >= kit.H) continue;
      assert.equal(top, want, `column ${col}, frame ${f}`);
      if (f <= 130) {
        if (prev >= 0 && top < prev) back++;
        prev = top;
      }
    }
    assert.equal(back, 0, `column ${col}: the night shot's horizon stepped back up ${back} times`);
  }
});

test('the glide to the slot is drawn from the true circle and lands on the emblem\'s own pixels', () => {
  // the glide's end: the planet renderer at the slot equals the cached emblem globe at R0
  const R = world.R0;
  const x = 100;
  const y = 98;
  const cam = planet.aim({ cx: x, cy: y, R, tilt: world.TILT_DEG, lam: world.LAM_END, light: [...world.LIGHT], space: 0, ax: 192, ay: 98 });
  planet.begin(cam);
  planet.disc(cam);
  const D = kit.frameBuffer('planet', kit.W, kit.H).d;
  world.drawEarth(fakeCanvas().getContext('2d'), x, y, R, world.LAM_END);
  const S = 2 * R + 5;
  const c = R + 2;
  const G = kit.frameBuffer('wn-globe', S, S).d;
  let diff = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) if (G[j * S + i] && D[(y - c + j) * kit.W + (x - c + i)] !== G[j * S + i]) diff++;
  assert.equal(diff, 0, `${diff} pixels differ at the slot`);
});

// The programme title sequences (owner, 9 Oct: "the other programmes' intros as crafted as WORLD
// NOW's"): each runs on its own cue sheet (opens/cues.js) that the pictures and the theme both read,
// draws every instant, holds the lock-up for the last 0.8 s and lands exactly on the package's open.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

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

let cues, themes, opens, tune, tech;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  cues = await import('../public/js/scenes/opens/cues.js');
  themes = await import('../public/js/audio/themes.js');
  tune = await import('../public/js/audio/tune.js');
  opens = await import('../public/js/scenes/opens.js');
  tech = await import('../public/js/scenes/opens/techtitles.js');
  await new Promise((r) => setTimeout(r, 50)); // opens.js loads the themes lazily
});

const INFO = { title: 'TECH BYTES', tagline: 'THE FUTURE, ONE BYTE AT A TIME', presenters: ['MAX CIRCUIT', 'ADA VOLT'] };

test('each sequence runs on its cue sheet: the open, the theme and the director all keep its length', () => {
  for (const id of Object.keys(cues.CUES)) {
    const o = opens.openFor(id);
    const want = cues.durationOf(id);
    assert.ok(want > 5 && want < 11, `${id}: ${want} s`);
    assert.equal(o.duration, want, `${id}: the director waits the sequence out`);
    assert.equal(opens.OPENS[id].still, cues.hitOf(id), `${id}: the lock-up holds from the hit`);
    assert.equal(o.tune.meta.bpm, cues.CUES[id].bpm, `${id}: the theme keeps the pictures' tempo`);
    assert.equal(o.tune.meta.hitAt, cues.hitOf(id));
    assert.equal(o.tune.meta.cutAt, want);
    // the lead still states the signature first, then the programme's colour, ending on the hit
    const song = tune.parseTune(o.tune);
    const lead = song.tracks[0].events;
    const tonic = lead[1].midis[0];
    assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s), id);
    assert.equal(lead[4].at + lead[4].dur, cues.CUES[id].hit, `${id}: the colour resolves on the hit`);
    // the final chord on the hit, the button on the cut
    const spb = 60 / song.bpm;
    const starts = song.tracks.flatMap((t) => t.events.map((e) => Math.round(e.at * spb * 1000)));
    assert.ok(starts.includes(Math.round(cues.hitOf(id) * 1000)), `${id}: a hit on the lock-up`);
    assert.ok(starts.includes(Math.round(want * 1000)), `${id}: a button on the cut`);
  }
});

test('every sequence draws every instant without throwing, and holds still from the hit', () => {
  const ctx = fakeCanvas().getContext('2d');
  for (const id of Object.keys(cues.CUES)) {
    const end = cues.durationOf(id);
    for (let t = 0; t < end + 1; t += 0.05) assert.doesNotThrow(() => opens.drawOpen(ctx, 0, t, id, INFO), `${id} at ${t.toFixed(2)}`);
  }
});

test('TECH BYTES: the run stays low, the crane lands straight overhead at one unit a pixel, centred on the processor', () => {
  const Q = cues.CUES['tech-bytes'];
  for (let b = 0; b < Q.crane; b += 0.25) {
    const c = tech.techCamera(b);
    assert.ok(c.h > 15 && c.h < 30, `beat ${b}: the run is low (${c.h.toFixed(1)})`);
  }
  // the landing: the camera is exactly the emblem's frame (pinhole height = focal length, looking down)
  const c = tech.techCamera(Q.land);
  assert.equal(c.h, 200);
  assert.ok(Math.abs(c.fy + 1) < 1e-12 && Math.abs(c.x) < 1e-12 && Math.abs(c.rx - 1) < 1e-12, 'straight down, unrolled, centred');
  // over the processor before it tips fully down: the last move is a pure push in
  for (let b = 10.15; b <= Q.land; b += 0.05) assert.ok(Math.abs(tech.techCamera(b).fy + 1) < 1e-9, `beat ${b.toFixed(2)} looks straight down`);
  // the package takes over on the emblem's own build, after the landing and before the reveal
  assert.ok(tech.TECH_SEQ.revealAt >= cues.cueAt('tech-bytes', Q.land) - 1e-9);
  assert.ok(tech.TECH_SEQ.revealAt < cues.hitOf('tech-bytes') - 1.6);
});

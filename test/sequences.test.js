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
    const near = (a, b) => Math.abs(a - b) < 1e-9;
    assert.ok(near(o.tune.meta.bpm, cues.CUES[id].bpm), `${id}: the theme keeps the pictures' tempo (${o.tune.meta.bpm})`);
    assert.ok(near(o.tune.meta.hitAt, cues.hitOf(id)));
    assert.ok(near(o.tune.meta.cutAt, want));
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

test('COSMOS DESK: at centre stage the voyage\'s planet is the emblem\'s own pixels (no pop at the hand-over)', async () => {
  const cosmos = await import('../public/js/scenes/opens/cosmos.js');
  const ct = await import('../public/js/scenes/opens/cosmostitles.js');
  const kit = await import('../public/js/scenes/opens/kit.js');
  const PR = Math.round(cosmos.PR0 * kit.ZOOM);
  const n = Math.hypot(...cosmos.L1);
  const D = ct.cosmosPlanetPixels(192, 98, PR, cosmos.L1.map((v) => v / n));
  // the emblem, settled, renders its planet into its own buffer
  const ctx = fakeCanvas().getContext('2d');
  cosmos.COSMOS.emblem(ctx, 2, 192, 98, kit.ZOOM);
  const BW = 2 * Math.ceil(PR * cosmos.RING_OUT) + 5;
  const BH = 2 * PR + 11;
  const G = kit.frameBuffer('cosmos-planet', BW, BH).d;
  const bx = BW >> 1;
  const by = BH >> 1;
  let drawn = 0;
  let diff = 0;
  for (let j = 0; j < BH; j++) {
    for (let i = 0; i < BW; i++) {
      const g = G[j * BW + i];
      if (!g) continue;
      drawn++;
      if (D[(98 - by + j) * kit.W + (192 - bx + i)] !== g) diff++;
    }
  }
  assert.ok(drawn > 2000, `the emblem drew its planet (${drawn} px)`);
  assert.equal(diff, 0, `${diff} of ${drawn} pixels differ`);
  // and the voyage arrives there: the planet at centre stage at the emblem's size from the settle on
  const Q = cues.CUES.cosmos;
  const p = ct.cosmosPlanet(Q.settle);
  assert.deepEqual([p.cx, p.cy, p.R], [192, 98, PR]);
  assert.ok(ct.COSMOS_SEQ.revealAt > cues.cueAt('cosmos', Q.settle));
});

test('MONEY MINUTE: the last lit window is the bit, where the ledger\'s binding opens out', async () => {
  const mt = await import('../public/js/scenes/opens/moneytitles.js');
  const kit = await import('../public/js/scenes/opens/kit.js');
  const Q = cues.CUES['money-minute'];
  const beat = 60 / Q.bpm;
  // the pad at centre stage: its binding strip's rows, opening out from the pad's middle column
  const top = kit.CENTRE.y + Math.round(11 * kit.ZOOM) - Math.round(46 * kit.ZOOM);
  const bind = Math.max(4, Math.round(6 * kit.ZOOM));
  const B = mt.MONEY_BIT;
  assert.ok(B.y >= top && B.y + 4 <= top + bind, `the bit (rows ${B.y}-${B.y + 3}) sits in the binding (rows ${top}-${top + bind - 1})`);
  assert.equal(B.x + 2, kit.CENTRE.x, 'centred where the binding starts to open');
  // the tower's offices: the bit's stays lit; every other is out by the last cue, on the beats
  const offices = mt.moneyOffices();
  const bit = offices.filter((o) => o.off > 20);
  assert.deepEqual(bit.map((o) => [o.i, o.j, o.lit]), [[14, 0, 0]], 'one office stays lit: the bit (yellow)');
  for (const o of offices) if (o.off < 20) assert.ok(o.off < Q.last, `office ${o.i},${o.j} is out before the last cue (${o.off.toFixed(2)})`);
  const lit = offices.filter((o) => o.lit >= 0 && o.off < 20);
  const onBeat = lit.filter((o) => Q.off.some((b) => o.off >= b && o.off < b + 0.5)).length;
  assert.ok(onBeat / lit.length > 0.85, `most floors go dark in waves on the beats (${onBeat} of ${lit.length})`);
  // the camera has stopped by then, with the bit on its mark; the package takes over from its first frame
  assert.equal(mt.moneySlides(Q.last).at(-1), 0);
  assert.ok(Math.abs(mt.MONEY_SEQ.revealAt - mt.MONEY_SEQ.shift) < 1e-12);
  assert.ok(mt.MONEY_SEQ.revealAt > Q.last * beat);
});

test('MONEY MINUTE: nothing that slides changes on two frames running (no pixel lit for a single frame)', async () => {
  const mt = await import('../public/js/scenes/opens/moneytitles.js');
  const Q = cues.CUES['money-minute'];
  const beat = 60 / Q.bpm;
  for (const fps of [30, 60]) {
    let prev = null;
    let changed = false;
    for (let f = 0; f / fps < mt.MONEY_SEQ.revealAt; f++) {
      const s = mt.moneySlides(f / fps / beat).join(',');
      const now = prev !== null && s !== prev;
      assert.ok(!(now && changed), `${fps} fps: frame ${f} moves right after frame ${f - 1}`);
      changed = now;
      prev = s;
    }
  }
});

test('MONEY MINUTE: the theme lands on the pictures (keys with the bursts of windows, a note for each floor, the last window)', () => {
  const Q = cues.CUES['money-minute'];
  const o = opens.openFor('money-minute');
  const song = tune.parseTune(o.tune);
  const at = (t, b) => t.events.some((e) => Math.abs(e.at - b) < 1e-6);
  const keys = song.tracks.find((t) => t.kind === 'harmony' && t.events.length > 6 && t.events.every((e) => e.dur <= 1.5));
  assert.ok(keys, 'a keys track');
  for (const b of Q.lights) assert.ok(at(keys, b), `keys on beat ${b}`);
  for (const b of Q.lights) assert.equal(b % 2, 1.5, 'on the "and" of 2 and 4');
  const floors = song.tracks[1];
  for (const b of [...Q.off, Q.last]) assert.ok(at(floors, b), `a note on beat ${b}`);
  // no swing, nothing above C6 (the bible's ceiling for bells)
  assert.ok(!o.tune.swing);
  for (const t of song.tracks) for (const e of t.events) for (const m of e.midis ?? []) assert.ok(m <= 84, `note ${m} above C6`);
});

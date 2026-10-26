// A vertical clip's intro (docs/publishing/shorts-v2.md §6; public/js/clip/intro.js): the owner, 26 Oct, "espectacular…
// y con una música que mantenga atención", four seconds at most; for COSMOS DESK "un acercamiento desde fuera de la
// galaxia… que lleve hasta Saturno", its letters worked for, no boxes of text; then TECH BYTES's ("hagamos primero Tech
// Bytes"), a flight over a motherboard to its processor. The picture and the theme read one cue sheet (cues.js INTRO_CUES); the clip's
// graph puts the intro first and lays its theme's tail, dipped, under the clip's first words (server/publish/render.js).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { composeArgs, loudnessArgs, measureArgs, parseLoudness, loudnessGain, srtFor, INTRO_TAIL, LOUDNESS } from '../server/publish/render.js';

function fakeCanvas() {
  const cv = { width: 300, height: 150 };
  const ctx = {
    canvas: cv,
    fillStyle: '#000',
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    fillRect() {},
    drawImage() {},
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'translate', 'scale', 'setTransform']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

let cues, themes, tune, intro, cosmos, tech, font;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  cues = await import('../public/js/scenes/opens/cues.js');
  themes = await import('../public/js/audio/themes.js');
  tune = await import('../public/js/audio/tune.js');
  intro = await import('../public/js/clip/intro.js');
  cosmos = await import('../public/js/scenes/opens/cosmosintro.js');
  tech = await import('../public/js/scenes/opens/techintro.js');
  font = await import('../public/js/font.js');
});

test('every intro lasts four seconds at most, on its cue sheet; a programme without one has none', () => {
  for (const id of Object.keys(intro.INTROS)) {
    const s = intro.introSeconds(id);
    assert.ok(s > 2 && s <= 4, `${id}: ${s} s`);
    assert.equal(s, cues.introDuration(id));
    // the factory makes it frame by frame: whole frames at 30 a second, still under four seconds
    assert.ok(Math.round(s * 30) / 30 <= 4, `${id}: ${Math.round(s * 30)} frames`);
  }
  assert.deepEqual(Object.keys(intro.INTROS), ['cosmos', 'tech-bytes']);
  assert.equal(intro.introFor('world-now'), null);
  assert.equal(intro.introSeconds('world-now'), 0);
  assert.equal(intro.drawIntro(fakeCanvas().getContext('2d'), 1, { programId: 'world-now' }), false);
});

test('COSMOS DESK\'s theme is heard from the first frame, climbs, lands the signature\'s DAH as Saturn comes in, resolves on the lock-up, and leaves the cut to the clip', () => {
  const Q = cues.INTRO_CUES.cosmos;
  const t = themes.introTheme('cosmos');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(t.meta.peakAt, cues.introAt('cosmos', Q.sun)));
  assert.ok(near(t.meta.hitAt, cues.introAt('cosmos', Q.lock)));
  assert.ok(near(t.meta.cutAt, intro.introSeconds('cosmos')));
  assert.equal(themes.introTheme('world-now'), null);
  const song = tune.parseTune(t);
  assert.equal(song.bpm, Q.bpm);
  const events = song.tracks.flatMap((tr) => tr.events);
  assert.ok(events.filter((e) => e.at === 0).length >= 4, 'a thump, a stroke, a chord and the strings on the first frame');
  // the lead: the signature (low 5, 1, 2, high 5), its DAH on the stroke, then the colour (#4), then the 5 on the hit
  const lead = song.tracks[0].events;
  const tonic = lead[1].midis[0];
  assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
  assert.equal(lead[3].at, Q.sun);
  assert.equal(lead[4].midis[0] - tonic, themes.COLOURS.cosmos);
  assert.equal(lead[5].at, Q.lock);
  assert.equal(lead[5].midis[0] - tonic, 7);
  // the sixteenths climb into the stroke
  const orbit = song.tracks[2].events.filter((e) => e.at < Q.sun);
  assert.ok(orbit.length >= 5 && orbit.at(-1).vel > orbit[0].vel, 'the orbit climbs');
  // nothing starts on the cut: the clip's first words are there
  assert.ok(!events.some((e) => Math.abs(e.at - Q.cut) < 1e-6), 'no button on the cut');
});

test('COSMOS DESK\'s picture draws every instant without throwing; it lands on Saturn at the emblem\'s size, its logotype inside the safe column', () => {
  const ctx = fakeCanvas().getContext('2d');
  const secs = intro.introSeconds('cosmos');
  for (let t = 0; t <= secs + 0.5; t += 2 / 30) assert.doesNotThrow(() => intro.drawIntro(ctx, t, { programId: 'cosmos' }), `at ${t.toFixed(3)} s`);
  const Q = cues.INTRO_CUES.cosmos;
  // Saturn: a point of light ahead, swelling to the emblem's size and place on the hit
  assert.ok(cosmos.cosmosIntroSaturn(Q.sun - 0.5) < 2, `${cosmos.cosmosIntroSaturn(Q.sun - 0.5)} px half a beat before the stroke`);
  // from the arm on it stays at the emblem's place (the owner: it must not seem to come in from the side); the camera
  // closes in, a little past the emblem's size, and eases back to it (the owner: "puedes hacer el acercamiento y que se
  // aleje para colocarse donde quiere. Pero hazlo fluido"): one turn, no wobble, and each frame's change of size close
  // to the last's (a glide, never a brake: the stop the owner found "demasiado brusca")
  const FR = 1 / 30 / (60 / Q.bpm);
  let last = 0;
  let turned = null;
  let prev = null;
  let jolt = 0;
  for (let bt = 2.6; bt <= Q.cut; bt += FR) {
    assert.deepEqual(cosmos.cosmosIntroSaturnAt(bt), { x: 108, y: 150 }, `at the emblem's place at beat ${bt.toFixed(2)}`);
    const r = cosmos.cosmosIntroSaturn(bt);
    if (turned === null && r < last) turned = bt;
    if (turned === null) assert.ok(r >= last, `it grows until it turns (beat ${bt.toFixed(2)})`);
    else assert.ok(r <= last + 1e-9, `once turned it only eases back (beat ${bt.toFixed(2)}: ${r} after ${last})`);
    const g = Math.log(r / cosmos.cosmosIntroSaturn(bt - FR));
    if (prev !== null) jolt = Math.max(jolt, Math.abs(g - prev));
    prev = g;
    last = r;
  }
  assert.ok(turned > 3.9 && turned < 4.7, `the camera turns at beat ${turned}`);
  assert.ok(jolt < 0.05, `the most a frame's change of size differs from the last's: ${jolt.toFixed(3)}`);
  const peak = cosmos.cosmosIntroSaturn(turned - FR);
  assert.ok(peak > 46 && peak < 55, `${peak} px at the closest (its rings still inside the frame)`);
  assert.deepEqual(cosmos.cosmosIntroSaturnAt(Q.lock), { x: 108, y: 150 }, 'at the emblem\'s place on the hit');
  const R = cosmos.cosmosIntroSaturn(Q.lock);
  assert.ok(R > 38 && R < 48, `${R} px on the hit`);
  const end = cosmos.cosmosIntroSaturn(Q.cut);
  assert.ok(end > 34 && end < 40, `${end} px at the cut: the emblem's size`);
  // the logotype: COSMOS over DESK, inside the column the feeds leave clear and above their caption
  const box = cosmos.cosmosIntroTitle();
  assert.ok(box.x0 >= 28 && box.x1 <= 188, `x ${box.x0}-${box.x1}`);
  assert.ok(box.y0 > 150 + 40 && box.y1 < 300, `y ${box.y0}-${box.y1}: under Saturn's rings, over the feeds' caption`);
  assert.equal(box.x1 - box.x0, font.textPixels('COSMOS', 'body').width * 4 + 1, 'COSMOS at four times the channel\'s face');
});

test('the intro dissolves into the programme over its last beats, never a hard cut', () => {
  const Q = cues.INTRO_CUES.cosmos;
  const way = intro.introTransition('cosmos');
  assert.ok(Math.abs(way.seconds - cues.introAt('cosmos', Q.cut - Q.push)) < 1e-9);
  assert.ok(way.seconds > 0.3 && way.seconds < 0.8, `${way.seconds} s`);
  assert.equal(intro.introTransition('world-now'), null);
  // the camera is still easing back from Saturn as it dissolves: never a still frame, never a jolt
  const drift = cosmos.cosmosIntroSaturn(Q.cut) / cosmos.cosmosIntroSaturn(Q.push);
  assert.ok(drift > 0.8 && drift < 0.98, `Saturn drifts back (x${drift.toFixed(2)})`);
});

test('COSMOS DESK\'s light: the Sun behind Saturn the whole way in (a crescent, never a glare), day coming round it at an even pace to the emblem\'s light on the hit', () => {
  const Q = cues.INTRO_CUES.cosmos;
  const FR = 1 / 30 / (60 / Q.bpm);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  // behind the planet (toward the frame's back) until the stroke, up and to the right
  for (let bt = 2.4; bt <= Q.sun; bt += FR) {
    const l = cosmos.cosmosIntroLight(bt);
    assert.ok(l[2] < -0.4 && l[0] > 0 && l[1] > 0, `behind Saturn at beat ${bt.toFixed(2)}: ${l.map((c) => c.toFixed(2))}`);
  }
  // then round to the channel's key light (cosmos.js L1) by the hit, no frame turning it more than twice the average
  const L1 = [-0.56, 0.5, 0.66];
  const n = Math.hypot(...L1);
  assert.ok(dot(cosmos.cosmosIntroLight(Q.lock), L1) / n > 0.999, 'the emblem\'s light on the hit');
  let most = 0;
  let total = 0;
  let frames = 0;
  for (let bt = Q.sun; bt < Q.lock; bt += FR) {
    const step = Math.acos(Math.min(1, dot(cosmos.cosmosIntroLight(bt), cosmos.cosmosIntroLight(bt + FR))));
    most = Math.max(most, step);
    total += step;
    frames++;
  }
  assert.ok(most < (2 * total) / frames, `the most in a frame ${((most * 180) / Math.PI).toFixed(1)}°, the average ${((total / frames) * 180 / Math.PI).toFixed(1)}°`);
});

test('TECH BYTES\'s theme is heard from the first frame, brings the data in with the wave, climbs through the dive, lands the signature\'s DAH as the die boots, resolves on the lock-up, and leaves the cut to the clip', () => {
  const Q = cues.INTRO_CUES['tech-bytes'];
  const t = themes.introTheme('tech-bytes');
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(t.meta.peakAt, cues.introAt('tech-bytes', Q.boot)));
  assert.ok(near(t.meta.hitAt, cues.introAt('tech-bytes', Q.lock)));
  assert.ok(near(t.meta.cutAt, intro.introSeconds('tech-bytes')));
  const song = tune.parseTune(t);
  assert.equal(song.bpm, Q.bpm);
  const events = song.tracks.flatMap((tr) => tr.events);
  assert.ok(events.filter((e) => e.at === 0).length >= 4, 'a kick, a pluck chord, the pad and the bass on the first frame');
  // the lead: the signature (low 5, 1, 2, high 5), its DAH on the boot, then the colour (the b7), then the tonic on the hit
  const lead = song.tracks[0].events;
  const tonic = lead[1].midis[0];
  assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([st]) => st));
  assert.equal(lead[3].at, Q.boot);
  assert.equal(lead[4].midis[0] - tonic, themes.COLOURS.tech);
  assert.equal(lead[5].at, Q.lock);
  assert.equal(lead[5].midis[0] - tonic, 12);
  // the data comes in with the wave and climbs in level into the boot
  const data = song.tracks[2].events.filter((e) => e.at < Q.boot);
  assert.equal(data[0].at, Q.wave);
  assert.ok(data.length >= 8 && data.at(-1).vel > data[0].vel, 'the data climbs');
  assert.ok(!events.some((e) => Math.abs(e.at - Q.cut) < 1e-6), 'no button on the cut');
});

test('TECH BYTES\'s picture draws every instant without throwing; one glide in to overhead the processor at the emblem\'s scale, the logotype in the safe column and clear of every trace', () => {
  const ctx = fakeCanvas().getContext('2d');
  const secs = intro.introSeconds('tech-bytes');
  assert.ok(secs > 3 && secs <= 4, `${secs} s`);
  for (let t = 0; t <= secs + 0.5; t += 3 / 30) assert.doesNotThrow(() => intro.drawIntro(ctx, t, { programId: 'tech-bytes' }), `at ${t.toFixed(3)} s`);
  const Q = cues.INTRO_CUES['tech-bytes'];
  const FR = 1 / 30 / (60 / Q.bpm);
  // moving from the first frame; the camera only ever closes in, and each frame's change of distance is close to the
  // last's (a glide down to rest, never a brake: the owner's "demasiado brusca" on COSMOS's first tries)
  const d = (b) => tech.techIntroCamera(b).d;
  assert.ok(Math.log(d(0) / d(FR)) > 0.012, 'already closing in on the first frame');
  let prev = null;
  let jolt = 0;
  for (let b = FR; b <= Q.cut; b += FR) {
    const g = Math.log(d(b - FR) / d(b));
    assert.ok(g >= -1e-9, `never backs off (beat ${b.toFixed(2)})`);
    if (prev !== null) jolt = Math.max(jolt, Math.abs(g - prev));
    prev = g;
  }
  assert.ok(jolt < 0.01, `the most a frame's change of distance differs from the last's: ${jolt.toFixed(4)}`);
  // overhead by the boot, at rest at the emblem's scale (a unit of the package a pixel) by the title
  const boot = tech.techIntroCamera(Q.boot);
  assert.ok(boot.pitch < 0.02 && Math.abs(boot.yaw) < 0.06, `overhead on the stroke (pitch ${boot.pitch}, yaw ${boot.yaw})`);
  assert.ok(Math.abs(tech.techIntroScale(Q.title + 0.5) - 1) < 0.01, `${tech.techIntroScale(Q.title + 0.5)} px a unit under the title`);
  assert.ok(Math.abs(tech.techIntroScale(Q.cut) - 1) < 1e-6, 'still at the cut');
  // the logotype: TECH over BYTES, inside the column the feeds leave clear, above their caption
  const box = tech.techIntroTitle();
  assert.ok(box.x0 >= 28 && box.x1 <= 188, `x ${box.x0}-${box.x1}`);
  assert.ok(box.y0 > 210 && box.y1 < 300, `y ${box.y0}-${box.y1}`);
  assert.equal(box.x1 - box.x0, font.textPixels('TECH', 'body').width * 4 + 1, 'TECH at four times the channel\'s face');
  // no trace of the processor's runs through the logotype or boxes it in (the owner: no boxes of text): on the frame at
  // rest (a unit a pixel, the processor at 108, 150), every trace keeps out of the logotype's box widened by 6 px
  const inBox = (x, y) => x > box.x0 - 6 && x < box.x1 + 6 && y > box.y0 - 6 && y < box.y1 + 6;
  for (const tr of tech.techIntroTraces()) {
    for (let s = 0; s <= tr.len; s += 1) {
      let i = 1;
      while (i < tr.cum.length - 1 && tr.cum[i] < s) i++;
      const f = Math.min(1, Math.max(0, (s - tr.cum[i - 1]) / (tr.cum[i] - tr.cum[i - 1] || 1)));
      const x = 108 + tr.xs[i - 1] + (tr.xs[i] - tr.xs[i - 1]) * f;
      const y = 150 - (tr.ys[i - 1] + (tr.ys[i] - tr.ys[i - 1]) * f);
      assert.ok(!inBox(x, y), `a trace at (${x.toFixed(0)}, ${y.toFixed(0)}) in the logotype`);
    }
  }
});

test('TECH BYTES\'s intro dissolves into the programme over its last beat', () => {
  const Q = cues.INTRO_CUES['tech-bytes'];
  const way = intro.introTransition('tech-bytes');
  assert.ok(Math.abs(way.seconds - cues.introAt('tech-bytes', Q.cut - Q.push)) < 1e-9);
  assert.ok(way.seconds > 0.3 && way.seconds < 0.8, `${way.seconds} s`);
});

test('composeArgs puts the intro first and dissolves it into the clip: the intro\'s sound to that point, its tail dipped and fading under the clip; the overlays keep the clip\'s clock', () => {
  const window = { start: 10, end: 20, duration: 10 };
  const it = { file: 'i.mkv', seconds: 3.9, overlap: 0.45 };
  const a = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: 'e.mkv', intro: it, window, format: 'vertical', out: 'o.mp4', gain: 1.2 });
  const inputs = a.filter((x, i) => a[i - 1] === '-i');
  assert.deepEqual(inputs, ['m.mkv', 'h.png', 'e.mkv', 'i.mkv']);
  const graph = a[a.indexOf('-filter_complex') + 1];
  assert.match(graph, /\[3:v\]trim=duration=3\.900,setpts=PTS-STARTPTS,fps=30,setsar=1,format=gbrp\[iv\]/);
  // the clip comes in over the intro's last 0.45 s, the intro's pixels going along the diagonal, held back by the Bayer
  // matrix
  assert.match(graph, /\[o\]format=gbrp\[og\];\[iv\]\[og\]xfade=transition=custom:duration=0\.450:offset=3\.450:expr='if\(gt\(\(1-P\)\*1\.35,\(W-X\+Y\)\/\(W\+H\)\+0\.35\*\(\(8\*abs/);
  assert.ok(!/st\(|ld\(/.test(graph), 'no expression registers (the filter\'s threads share them)');
  assert.match(graph, /\[ia0\]atrim=end=3\.450,asetpts=PTS-STARTPTS\[ih\]/);
  assert.match(graph, new RegExp(`\\[ia1\\]atrim=start=3\\.450,asetpts=PTS-STARTPTS,volume=-6dB,afade=t=out:st=0:d=${INTRO_TAIL}\\[it\\]`));
  assert.match(graph, /\[a\]\[it\]amix=inputs=2:duration=first:dropout_transition=0:normalize=0\[am\];\[ih\]\[am\]concat=n=2:v=0:a=1\[ai\]/);
  assert.match(graph, /\[vi\]\[ai\]\[ev\]\[ea\]concat=n=2:v=1:a=1\[v\]\[ac\]/);
  assert.match(graph, /\[c\]\[1:v\]overlay=0:0:eof_action=repeat\[h\]/, 'the hook laid over the clip alone');
  assert.match(graph, /\[ac\]volume=1\.2dB\[aa\]/, 'one gain on the whole, the intro too');
  // with no overlap, a cut; without an end card, one piece
  const b = composeArgs({ master: 'm.mkv', hook: null, endcard: null, intro: { file: 'i.mkv', seconds: 3.9 }, window, format: 'vertical', out: 'o.mp4' });
  const bg = b[b.indexOf('-filter_complex') + 1];
  assert.match(bg, /\[iv\]\[o\]concat=n=2:v=1:a=0\[vi\]/);
  assert.match(bg, /\[vi\]null\[v\];\[ai\]anull\[ac\]/);
  // without an intro: as before
  const c = composeArgs({ master: 'm.mkv', hook: null, endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4' });
  assert.match(c[c.indexOf('-filter_complex') + 1], /\[o\]\[a\]\[ev\]\[ea\]concat=n=2:v=1:a=1\[v\]\[ac\]/);
  // the measurement mixes the same sound
  const m = loudnessArgs({ master: 'm.mkv', endcard: 'e.mkv', intro: it, window });
  const mg = m[m.indexOf('-filter_complex') + 1];
  assert.deepEqual(m.filter((x, i) => m[i - 1] === '-i'), ['m.mkv', 'e.mkv', 'i.mkv']);
  assert.match(mg, /\[2:a\]aresample=48000,asplit=2/);
  assert.match(mg, /\[ai\]\[ea\]concat=n=2:v=0:a=1\[ac\]/);
});

test('the caption file waits for the intro', () => {
  const tl = { segments: [{ sentences: [{ from: 0, to: 2 }], words: [{ w: 'Hello', from: 0, at: 11, end: 11.4 }, { w: 'there', from: 1, at: 11.5, end: 12 }] }] };
  const window = { start: 10, end: 14, duration: 4 };
  assert.match(srtFor(tl, window), /^1\n00:00:01,000 --> /);
  assert.match(srtFor(tl, window, { offset: 2.9333 }), /^1\n00:00:03,933 --> /);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('through ffmpeg: the intro\'s picture first, dissolving into the clip, then its end card, all at the feeds\' loudness', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intro-'));
  try {
    const ff = (args) => {
      const r = spawnSync('ffmpeg', args, { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stderr;
    };
    const master = path.join(dir, 'm.mkv');
    const card = path.join(dir, 'e.mkv');
    const intr = path.join(dir, 'i.mkv');
    const out = path.join(dir, 'o.mp4');
    const clip = (color, d, freq, vol, file) => ff(['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=216x384:r=30:d=${d}`, '-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:d=${d}`, '-filter_complex', `[1:a]volume=${vol}dB[a]`, '-map', '0:v', '-map', '[a]', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', file]);
    clip('black', 4, 220, -2, master);
    clip('navy', 1, 440, -20, card);
    // the intro: a red picture 1.5 s long with 3 s of sound (its tail)
    ff(['-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=216x384:r=30:d=1.5', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:d=3', '-filter_complex', '[1:a]volume=-8dB[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'ffv1', '-c:a', 'pcm_s16le', intr]);
    const window = { start: 0.5, end: 3.5, duration: 3 };
    const it = { file: intr, seconds: 1.5, overlap: 0.5 };
    const gain = loudnessGain(parseLoudness(ff(loudnessArgs({ master, endcard: card, intro: it, window }))));
    ff(composeArgs({ master, hook: null, endcard: card, intro: it, window, format: 'vertical', out, gain }));
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
    assert.ok(Math.abs(dur - 5) < 0.1, `intro 1.5 + clip 3 + card 1, less the half second they share = ${dur} s`);
    // the first frame is the intro's (red); half way through the half second they share, the intro's pixels have gone
    // at the top right and are still there at the bottom left; then the clip (black) alone
    const px = (t, x, y) => spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', `crop=5:5:${x * 5}:${y * 5},scale=1:1`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout;
    const first = px(0.1, 108, 150);
    assert.ok(first[0] > 150 && first[2] < 80, `red first: ${[...first]}`);
    const topRight = px(1.25, 210, 2);
    assert.ok(topRight[0] < 40, `the clip at the top right: ${[...topRight]}`);
    const bottomLeft = px(1.25, 2, 378);
    assert.ok(bottomLeft[0] > 150, `the intro still at the bottom left: ${[...bottomLeft]}`);
    const later = px(2.5, 108, 150);
    assert.ok(later[0] < 40 && later[2] < 40, `the clip after it: ${[...later]}`);
    const made = parseLoudness(ff(measureArgs(out)));
    assert.ok(Math.abs(made.lufs - LOUDNESS.target) <= 0.6, `made at ${made.lufs} LUFS`);
    assert.ok(made.truePeak <= -1, `true peak ${made.truePeak} dBTP`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

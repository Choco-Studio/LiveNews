// A vertical clip's intro (docs/publishing/shorts-v2.md §6; public/js/clip/intro.js): the owner, 26 Oct, "espectacular…
// y con una música que mantenga atención", four seconds at most; for COSMOS DESK "un acercamiento desde fuera de la
// galaxia… que lleve hasta Saturno", its letters worked for, no boxes of text. The picture and the theme read one cue sheet (cues.js INTRO_CUES); the clip's
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

let cues, themes, tune, intro, cosmos, font;
before(async () => {
  globalThis.document = { createElement: () => fakeCanvas() };
  cues = await import('../public/js/scenes/opens/cues.js');
  themes = await import('../public/js/audio/themes.js');
  tune = await import('../public/js/audio/tune.js');
  intro = await import('../public/js/clip/intro.js');
  cosmos = await import('../public/js/scenes/opens/cosmosintro.js');
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
  assert.equal(intro.introFor('world-now'), null);
  assert.equal(intro.introSeconds('world-now'), 0);
  assert.equal(intro.drawIntro(fakeCanvas().getContext('2d'), 1, { programId: 'world-now' }), false);
});

test('COSMOS DESK\'s theme is heard from the first frame, climbs, lands the signature\'s DAH as the camera passes the Sun, resolves on the lock-up, and leaves the cut to the clip', () => {
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
  // the lead: the signature (low 5, 1, 2, high 5), its DAH on the Sun, then the colour (#4), then the 5 on the hit
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
  const end = intro.introSeconds('cosmos');
  for (let t = 0; t <= end + 0.5; t += 2 / 30) assert.doesNotThrow(() => intro.drawIntro(ctx, t, { programId: 'cosmos' }), `at ${t.toFixed(3)} s`);
  const Q = cues.INTRO_CUES.cosmos;
  // Saturn: a point of light until the camera passes the Sun, then swelling to the emblem's size on the hit
  assert.ok(cosmos.cosmosIntroSaturn(Q.sun - 0.5) < 2, `${cosmos.cosmosIntroSaturn(Q.sun - 0.5)} px before the Sun`);
  const R = cosmos.cosmosIntroSaturn(Q.lock);
  assert.ok(R > 34 && R < 42, `${R} px on the hit`);
  assert.ok(cosmos.cosmosIntroSaturn(Q.cut) - R < 4, 'it holds (a slow drift) to the cut');
  // the logotype: COSMOS over DESK, inside the column the feeds leave clear and above their caption
  const box = cosmos.cosmosIntroTitle();
  assert.ok(box.x0 >= 28 && box.x1 <= 188, `x ${box.x0}-${box.x1}`);
  assert.ok(box.y0 > 150 + 40 && box.y1 < 300, `y ${box.y0}-${box.y1}: under Saturn's rings, over the feeds' caption`);
  assert.equal(box.x1 - box.x0, font.textPixels('COSMOS', 'body').width * 4 + 1, 'COSMOS at four times the channel\'s face');
});

test('composeArgs puts the intro first: its picture, its sound to the cut, its tail dipped and fading under the clip; the overlays keep the clip\'s clock', () => {
  const window = { start: 10, end: 20, duration: 10 };
  const it = { file: 'i.mkv', seconds: 2.9333 };
  const a = composeArgs({ master: 'm.mkv', hook: 'h.png', endcard: 'e.mkv', intro: it, window, format: 'vertical', out: 'o.mp4', gain: 1.2 });
  const inputs = a.filter((x, i) => a[i - 1] === '-i');
  assert.deepEqual(inputs, ['m.mkv', 'h.png', 'e.mkv', 'i.mkv']);
  const graph = a[a.indexOf('-filter_complex') + 1];
  assert.match(graph, /\[3:v\]trim=duration=2\.933,setpts=PTS-STARTPTS,fps=30,setsar=1\[iv\]/);
  assert.match(graph, /\[ia0\]atrim=end=2\.933,asetpts=PTS-STARTPTS\[ih\]/);
  assert.match(graph, new RegExp(`\\[ia1\\]atrim=start=2\\.933,asetpts=PTS-STARTPTS,volume=-6dB,afade=t=out:st=0:d=${INTRO_TAIL}\\[it\\]`));
  assert.match(graph, /\[a\]\[it\]amix=inputs=2:duration=first:dropout_transition=0:normalize=0\[am\]/);
  assert.match(graph, /\[iv\]\[ih\]\[o\]\[am\]\[ev\]\[ea\]concat=n=3:v=1:a=1\[v\]\[ac\]/);
  assert.match(graph, /\[c\]\[1:v\]overlay=0:0:eof_action=repeat\[h\]/, 'the hook laid over the clip alone');
  assert.match(graph, /\[ac\]volume=1\.2dB\[aa\]/, 'one gain on the whole, the intro too');
  // without an end card: two pieces
  const b = composeArgs({ master: 'm.mkv', hook: null, endcard: null, intro: it, window, format: 'vertical', out: 'o.mp4' });
  assert.match(b[b.indexOf('-filter_complex') + 1], /\[iv\]\[ih\]\[o\]\[am\]concat=n=2:v=1:a=1\[v\]\[ac\]/);
  assert.equal(b.filter((x, i) => b[i - 1] === '-i').at(-1), 'i.mkv');
  // without an intro: as before
  const c = composeArgs({ master: 'm.mkv', hook: null, endcard: 'e.mkv', window, format: 'vertical', out: 'o.mp4' });
  assert.match(c[c.indexOf('-filter_complex') + 1], /\[o\]\[a\]\[ev\]\[ea\]concat=n=2:v=1:a=1\[v\]\[ac\]/);
  // the measurement mixes the same sound
  const m = loudnessArgs({ master: 'm.mkv', endcard: 'e.mkv', intro: it, window });
  const mg = m[m.indexOf('-filter_complex') + 1];
  assert.deepEqual(m.filter((x, i) => m[i - 1] === '-i'), ['m.mkv', 'e.mkv', 'i.mkv']);
  assert.match(mg, /\[2:a\]aresample=48000,asplit=2/);
  assert.match(mg, /\[ih\]\[am\]\[ea\]concat=n=3:v=0:a=1\[ac\]/);
});

test('the caption file waits for the intro', () => {
  const tl = { segments: [{ sentences: [{ from: 0, to: 2 }], words: [{ w: 'Hello', from: 0, at: 11, end: 11.4 }, { w: 'there', from: 1, at: 11.5, end: 12 }] }] };
  const window = { start: 10, end: 14, duration: 4 };
  assert.match(srtFor(tl, window), /^1\n00:00:01,000 --> /);
  assert.match(srtFor(tl, window, { offset: 2.9333 }), /^1\n00:00:03,933 --> /);
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('through ffmpeg: the intro\'s picture first, then the clip and its end card, all at the feeds\' loudness', { skip: !hasFfmpeg && 'no ffmpeg' }, () => {
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
    const it = { file: intr, seconds: 1.5 };
    const gain = loudnessGain(parseLoudness(ff(loudnessArgs({ master, endcard: card, intro: it, window }))));
    ff(composeArgs({ master, hook: null, endcard: card, intro: it, window, format: 'vertical', out, gain }));
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout);
    assert.ok(Math.abs(dur - 5.5) < 0.1, `intro 1.5 + clip 3 + card 1 = ${dur} s`);
    // the first frame is the intro's (red), the frame at 2 s the clip's (black)
    const px = (t) => spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']).stdout;
    const first = px(0.1);
    assert.ok(first[0] > 150 && first[2] < 80, `red first: ${[...first]}`);
    const later = px(2.5);
    assert.ok(later[0] < 40 && later[2] < 40, `the clip after it: ${[...later]}`);
    const made = parseLoudness(ff(measureArgs(out)));
    assert.ok(Math.abs(made.lufs - LOUDNESS.target) <= 0.6, `made at ${made.lufs} LUFS`);
    assert.ok(made.truePeak <= -1, `true peak ${made.truePeak} dBTP`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

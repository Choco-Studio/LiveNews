// FULL TIME's opening titles and sound (docs/programmes/full-time.md §6): the final whistle in a night stadium on one
// cue sheet with its theme, the stopwatch at 90:00 handing over to the plate; the bed (116 BPM, punchy drums, bass, a
// muted guitar), SCORE CENTRE's ticking bed and its row ticks, the lead scoreline's sting, the theme's tail at the
// sign-off, and the grave rules for all of them.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PROGRAMMES, arrangementFor } from '../public/js/music/proposals/lofi/palettes.js';
import { barEvents } from '../public/js/music/proposals/lofi/arranger.js';
import { resolveCue, signoffAllowed, CUE_SHEET } from '../public/js/music/proposals/lofi/cuesheet.js';
import { STINGS, SCORE_STING } from '../public/js/music/proposals/lofi/stings.js';
import { openSeconds } from '../public/js/music/proposals/lofi/render.js';
import { LiveMusic } from '../public/js/music/live.js';
import { Director } from '../public/js/director.js';
import { parseTune } from '../public/js/audio/tune.js';
import { CUES, hitOf, durationOf } from '../public/js/scenes/opens/cues.js';
import { fakeClock } from '../tools/pace/fakeplay.mjs';
import { LofiEngine } from '../public/js/music/proposals/lofi/engine.js';
import { P } from '../public/js/palette.js';
import { u32 } from '../public/js/gfx/index.js';
import { textPixels } from '../public/js/font.js';

// a frame's pixels by palette colour (rows y0..y1)
const NAME = new Map(Object.entries(P).map(([k, v]) => [u32(v), k]));
function colours(d, y0 = 0, y1 = 216) {
  const c = {};
  for (let y = y0; y < y1; y++) for (let x = 0; x < 384; x++) {
    const n = NAME.get(d[y * 384 + x]) || '?';
    c[n] = (c[n] || 0) + 1;
  }
  return c;
}

// a canvas whose image data is real memory (the open draws into pixel buffers)
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
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'resetTransform', 'translate', 'scale', 'fillText', 'strokeRect', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

const Q = CUES['full-time'];
const BEAT = 60 / Q.bpm;
let themes, opens, kit, sport, titles;
before(async () => {
  globalThis.document ??= { createElement: () => fakeCanvas() };
  themes = await import('../public/js/audio/themes.js');
  opens = await import('../public/js/scenes/opens.js');
  kit = await import('../public/js/scenes/opens/kit.js');
  sport = await import('../public/js/scenes/opens/sport.js');
  titles = await import('../public/js/scenes/opens/fulltimetitles.js');
  await new Promise((r) => setTimeout(r, 50)); // opens.js loads the themes lazily
});

describe('FULL TIME: the open', () => {
  test('about ten seconds at 120 BPM on one cue sheet: the hit 0.8 s before the cut, the theme on the same clock', () => {
    assert.equal(Q.bpm, 120);
    const dur = durationOf('full-time');
    assert.ok(dur > 9.5 && dur < 11, `${dur} s`);
    const o = opens.openFor('full-time');
    assert.equal(o.duration, dur, 'the director waits the sequence out');
    assert.equal(o.tune.meta.cutAt, dur);
    assert.equal(o.tune.meta.hitAt, hitOf('full-time'));
    assert.equal(o.tune.meta.bpm, Q.bpm, 'the theme keeps the pictures\' tempo');
    assert.equal(openSeconds('full-time'), dur, 'the sound lab renders it as long as it airs');
  });

  test('the floodlights bang on bank by bank on the beat: dark before, a flash on its beat, then steady', () => {
    assert.equal(Q.floods.length, 4, 'four banks');
    Q.floods.forEach((b, i) => {
      if (i) assert.equal(b - Q.floods[i - 1], 1, 'a bank a beat');
      assert.equal(titles.fullTimeBank(i, b - 0.01), 0, `bank ${i} dark before its beat`);
      assert.ok(titles.fullTimeBank(i, b) > 1.4, `bank ${i} flashes on its beat`);
      assert.ok(Math.abs(titles.fullTimeBank(i, b + 1) - 1) < 1e-3, `bank ${i} steady a beat later`);
    });
  });

  test('the referee\'s final whistle: three blasts, the last long, played by the brass; the board flips on the last', () => {
    assert.equal(Q.whistle.length, 3);
    assert.ok(Q.long >= 2, 'the last blast is held');
    assert.equal(Q.flip, Q.whistle[2], 'FULL TIME on the long blast');
    const song = parseTune(themes.themeFor('full-time', { duration: durationOf('full-time') }));
    const whistle = song.tracks.find((t) => t.kind === 'lead' && t.events.length === 3 && t.events.every((e) => e.midis.length === 1 && e.midis[0] === t.events[0].midis[0]));
    assert.ok(whistle, 'a lead track of three blasts on one note');
    assert.deepEqual(whistle.events.map((e) => e.at), [...Q.whistle]);
    const [a, b, c] = whistle.events.map((e) => e.dur);
    assert.ok(c >= 4 * Math.max(a, b), `the last blast long (${a}, ${b}, ${c} beats)`);
    // the board: 2ND HALF until the flip, FULL TIME from it; its clock 89:55 at the cut, 90:00 on the first blast
    assert.equal(titles.fullTimePanel(Q.flip - 0.5).text, '2ND HALF');
    assert.equal(titles.fullTimePanel(Q.flip + 0.5).text, 'FULL TIME');
    assert.equal(titles.fullTimePanel(Q.flip + 0.5).open, 1, 'fully open half a beat after the flip');
    assert.equal(titles.clockAt(0), '8955');
    assert.equal(titles.clockAt(Q.whistle[0] - 0.01), '8959');
    assert.equal(titles.clockAt(Q.whistle[0]), '9000');
    // the board's clock ticks a second at a time in the theme, until 90:00
    assert.deepEqual(Q.ticks.map((b) => titles.clockAt(b)), ['8955', '8956', '8957', '8958', '8959']);
  });

  test('the camera sweeps down to the centre circle and never turns sideways (the board stays square to the watch)', () => {
    const top = titles.fullTimeCamera(0);
    const circle = titles.fullTimeCamera(Q.circle);
    assert.ok(top.y > 3 * circle.y, `down from high (${top.y} m) to the circle (${circle.y} m)`);
    assert.ok(circle.z > top.z, 'and in towards it');
    for (let b = 0; b < Q.settle; b += 0.05) assert.equal(titles.fullTimeCamera(b).F[0], 0, `beat ${b.toFixed(2)}`);
    assert.equal(titles.fullTimeCamera(Q.circle + 1).moving, 0, 'held still on the circle (the crowd\'s detail draws in)');
  });

  test('the whistle\'s cut-ins: a still framing closer on each blast, never a zoom; the watch on whole pixels', () => {
    assert.deepEqual([Q.circle + 0.5, Q.whistle[1] + 0.5, Q.whistle[2] + 0.5].map(titles.fullTimeFraming), [0, 1, 2]);
    // still between the cuts: the same lens, the same frame (a pixel picture is never scaled between frames)
    for (const [a, b] of [[Q.whistle[0], Q.whistle[1]], [Q.whistle[1], Q.whistle[2]], [Q.whistle[2], 15]]) {
      const c0 = titles.fullTimeCamera(a), c1 = titles.fullTimeCamera(b - 0.01);
      for (const k of ['f', 'px', 'py', 'y', 'z']) assert.ok(Math.abs(c0[k] - c1[k]) < 1e-6, `${k} held from beat ${a} to ${b}`);
      assert.equal(c1.moving, 0);
    }
    // each cut closer, on its blast (the board's clock a quarter larger at least each time)
    for (const w of Q.whistle.slice(1)) assert.ok(titles.watchOnScreen(w).k > 1.25 * titles.watchOnScreen(w - 0.01).k, `a cut-in on beat ${w}`);
    for (const b of [Q.whistle[1] + 0.5, Q.whistle[2] + 0.5]) {
      const w = titles.watchOnScreen(b);
      assert.ok(Math.abs(w.x - Math.round(w.x)) < 1e-6 && Math.abs(w.y - Math.round(w.y)) < 1e-6, `the watch on whole pixels at beat ${b}`);
    }
  });

  test('the pitch: mown stripes in solid bands; the light falls on the grass quarter by quarter', () => {
    const lit = titles.fullTimeFrame(Q.circle + 0.5);
    const c = colours(lit);
    assert.ok(c.green > 5000 && c.midGreen > 5000, `green ${c.green}, mid green ${c.midGreen}`);
    // solid bands: a stripe's pixel has its own colour beside it (no dither between the two greens)
    let same = 0, n = 0;
    for (let y = 120; y < 216; y++) for (let x = 0; x < 383; x++) {
      const a = lit[y * 384 + x];
      if (a !== u32(P.green) && a !== u32(P.midGreen)) continue;
      n++;
      if (lit[y * 384 + x + 1] === a) same++;
    }
    assert.ok(same / n > 0.97, `${((100 * same) / n).toFixed(1)}% of the stripes' pixels have their own colour beside them`);
    // in the dark: dark and deep green, no lit grass; one bank on: its quarter lit, the rest still dark
    const dark = colours(titles.fullTimeFrame(1));
    assert.ok(!dark.green && !dark.midGreen && dark.darkGreen > 3000 && dark.deepGreen > 3000);
    const one = colours(titles.fullTimeFrame(Q.floods[0] + 0.5));
    assert.ok(one.green > 300 && one.midGreen > 300 && one.darkGreen > 3000 && one.deepGreen > 3000, JSON.stringify(one));
  });

  test('the last cut-in: FULL TIME in the board\'s 7 px face at 2x; the far stand holds its scarves up on the long blast', () => {
    const up = titles.fullTimeFrame(Q.flip + 0.6);
    const text = textPixels('FULL TIME', 'body');
    assert.equal(colours(up, 0, 186).orange, text.pixels.length * 4, 'every pixel of the line at twice the face');
    // the scarves: a band of orange and white across the far stand's front rows, half a beat into the long blast, held
    const bottom = (b) => colours(titles.fullTimeFrame(b), 186, 216);
    const before = bottom(Q.flip + 0.2), after = bottom(Q.flip + 0.6);
    assert.ok(!before.orange && after.orange > 150 && after.white > 150, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    assert.deepEqual(bottom(14.9), after, 'held to the cut');
  });

  test('the stopwatch at 90:00 lands on centre stage at the emblem\'s size, so it becomes the plate with no pop', () => {
    const w = titles.watchOnScreen(Q.settle - 1e-9);
    assert.ok(Math.abs(w.x - kit.CENTRE.x) < 1e-6 && Math.abs(w.y - kit.CENTRE.y) < 1e-6, `at (${w.x}, ${w.y})`);
    assert.ok(Math.abs(w.k - kit.ZOOM) < 1e-6, `size ${w.k}`);
    assert.equal(titles.clockAt(Q.settle), sport.WATCH_STILL.digits, 'the same digits as the emblem\'s settled watch');
    // painted at its last stadium place and at the emblem's place, the watch is the same pixels
    const paint = (x, y, k) => {
      const T = { d: new Uint32Array(kit.W * kit.H), w: kit.W, h: kit.H, ox: 0, oy: 0 };
      sport.paintWatch(T, x, y, k, sport.WATCH_STILL);
      return T.d;
    };
    const a = paint(w.x, w.y, w.k);
    const b = paint(kit.CENTRE.x, kit.CENTRE.y, kit.ZOOM);
    let n = 0, diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] || b[i]) n++;
      if (a[i] !== b[i]) diff++;
    }
    assert.ok(n > 1500, `the watch drew (${n} px)`);
    assert.equal(diff, 0, `${diff} of ${n} pixels differ at the hand-over`);
  });

  test('the sequence draws every instant without throwing and hands over to the package\'s reveal', () => {
    const info = { title: 'FULL TIME', tagline: 'THE DAY IN SPORT', presenters: ['KAI SPRITE', 'ROSA RALLY'] };
    const ctx = fakeCanvas().getContext('2d');
    for (let t = 0; t < durationOf('full-time') + 1; t += 0.05) assert.doesNotThrow(() => opens.drawOpen(ctx, 0, t, 'full-time', info), `t ${t.toFixed(2)}`);
    assert.ok(Q.settle * BEAT < hitOf('full-time'), 'the watch settles before the hit');
  });

  test('the theme: the signature then FULL TIME\'s colour (#5) on the brass, resolving to the 6th on the hit; no crash, no whoosh', () => {
    const tune = themes.themeFor('full-time', { duration: durationOf('full-time') });
    const song = parseTune(tune);
    const lead = song.tracks[0].events;
    const tonic = lead[1].midis[0];
    assert.equal(tonic % 12, 3, 'E-flat');
    assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
    assert.equal(lead[4].midis[0] - tonic, themes.COLOURS.sport);
    assert.equal(lead[4].at + lead[4].dur, Q.hit, 'the colour ends on the hit');
    assert.equal(lead[5].midis[0] - tonic, 9, 'up to the 6th on the hit');
    const drums = tune.tracks.filter((t) => t.drums).map((t) => t.drums).join(' ');
    assert.ok(!/\bc:|\bw:/.test(drums), 'no crash cymbal, no whoosh');
    assert.equal(themes.COLOURS.sport, 8);
  });
});

describe('FULL TIME: the bed', () => {
  test('116 BPM in the open\'s key, straight; a punchy kit, the bass driving in eighths, a palm-muted guitar', () => {
    const pal = PALETTES['full-time'];
    assert.equal(pal.bpm, 116);
    assert.equal(PROGRAMMES['full-time'].bpm, 116);
    assert.equal(pal.tonic % 12, 3, 'E-flat');
    assert.equal(pal.swing, 0.5, 'straight');
    const arr = arrangementFor('full-time', 'headlines');
    const all = [];
    for (let n = 0; n < 8; n++) all.push(...barEvents(pal, 'full-time#test', arr, n ? arr : null, n, {}).events);
    const of = (layer) => all.filter((e) => e.layer === layer);
    assert.ok(of('kick').length >= 16 && of('kick').every((e) => e.p?.punch), 'the punch kick');
    const backbeat = of('snare').filter((e) => e.vel > 0.6);
    assert.ok(backbeat.length >= 16 && backbeat.every((e) => e.p?.punch), 'the cracking snare');
    assert.ok(backbeat.every((e) => e.at === 1 || e.at === 3), 'the backbeat on 2 and 4');
    assert.ok(of('keys').length >= 8 * 8 && of('keys').every((e) => e.inst === 'mute' && e.dur <= 0.25), 'muted guitar chops');
    assert.ok(of('bass').length >= 8 * 8, 'the bass in eighths');
    assert.equal(of('lead').length, 0, 'no melody: the brass is the theme\'s');
  });

  test('SCORE CENTRE has a ticking bed of its own: ticks, the bass, a chop; no kit', () => {
    const pal = PALETTES['full-time'];
    const arr = arrangementFor('full-time', 'scores');
    const ev = [];
    for (let n = 0; n < 4; n++) ev.push(...barEvents(pal, 'full-time#test', arr, n ? arr : null, n, {}).events);
    assert.ok(ev.filter((e) => e.layer === 'perc' && e.inst === 'tick').length >= 4 * 8, 'eighth ticks');
    assert.equal(ev.filter((e) => e.layer === 'kick' || e.layer === 'snare').length, 0, 'no kit');
    assert.equal(resolveCue('story', { programId: 'full-time', feature: 'scores' }, {}).moment, 'scores');
    assert.equal(resolveCue('story', { programId: 'full-time', feature: 'fixtures' }, {}).moment, 'ahead', 'COMING UP');
  });

  test('the cue sheet: the groove under the headlines, dry stories (soft switch aside), nothing on or after grave news', () => {
    const cue = (m, o = {}, c = {}) => resolveCue(m, { programId: 'full-time', ...o }, c);
    assert.deepEqual([cue('headlines').kind, cue('headlines').song, cue('headlines').moment], ['bed', 'full-time', 'headlines']);
    assert.equal(cue('story').kind, 'silence', 'the bibles: a story is dry');
    assert.equal(cue('story', {}, { bedUnderStories: 'soft' }).moment, 'story', 'the owner\'s soft switch');
    assert.equal(cue('story', { grave: true }, { bedUnderStories: 'soft' }).kind, 'silence', 'nothing under grave news');
    for (const m of ['headlines', 'greeting', 'number', 'finally', 'chat', 'outro']) assert.equal(cue(m, {}, { afterGrave: true, current: 'full-time' }).kind, 'silence', `${m} after grave news`);
    assert.equal(cue('story', { feature: 'scores' }, { afterGrave: true }).kind, 'silence', 'SCORE CENTRE after grave news: no bed (its ticks stay: sound effects)');
    assert.equal(cue('outro').moment, 'signoff');
    assert.ok(CUE_SHEET.some(([p, m]) => p === 'FULL TIME' && /SCORE CENTRE/.test(m)), 'the cue sheet documents it');
  });

  test('the scoreline sting: the A/B\'s pick on the lead\'s scoreline card, never on grave news nor after it', () => {
    assert.ok(['scoreCrowd', 'scoreBrass'].includes(SCORE_STING));
    assert.equal(SCORE_STING, 'scoreCrowd', 'the A/B (docs/roadmap/critique/full-time-sound.md): it sounds like a crowd, not rain');
    const cue = (o = {}, c = {}) => resolveCue('scoreSting', { programId: 'full-time', ...o }, c);
    assert.deepEqual([cue().kind, cue().name, cue().stopBed], ['sting', 'scoreSting', false], 'the bed carries on under it');
    assert.equal(cue({ grave: true }).kind, 'keep');
    assert.equal(cue({ emotion: 'sad' }).kind, 'keep');
    assert.equal(cue({}, { graveNear: true }).kind, 'keep', 'in the grave segment or the one after it');
    assert.equal(cue({}, { afterGrave: true }).kind, 'keep');
  });

  test('the sign-off: the theme\'s tail (the signature, #5 -> 6) except after grave news; every other programme\'s cue as before', () => {
    const song = parseTune(themes.cueFor('outro', 'full-time'));
    const lead = song.tracks[0].events;
    const tonic = lead[1].midis[0];
    assert.equal(tonic % 12, 3);
    assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
    assert.deepEqual(lead.slice(4, 6).map((e) => e.midis[0] - tonic), [themes.COLOURS.sport, 9]);
    assert.equal(signoffAllowed('full-time'), true);
    assert.equal(signoffAllowed('full-time', { afterGrave: true }), false);
    for (const id of ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60', 'world-weather', 'seven-days']) assert.equal(signoffAllowed(id, { afterGrave: true }), true, id);
  });

  test('music/live.js remembers grave news as the engine does: the sign-off right after it stays dry', () => {
    const m = new LiveMusic({ context: null, musicBus: null }, { enabled: false });
    m.setProgram('full-time');
    m.cue('open');
    m.cue('headlines', { segment: 1 });
    m.cue('story', { segment: 2, emotion: 'neutral' });
    m.cue('outro', { segment: 3 });
    assert.equal(m.signoffAllowed(), true, 'a light edition ends on the tail');
    m.cue('story', { segment: 4, emotion: 'sad' });
    m.cue('outro', { segment: 5 });
    assert.equal(m.signoffAllowed(), false, 'the sign-off straight after grave news');
    assert.equal(m.signoffAllowed('world-now'), true, 'other programmes keep their cue');
    m.cue('open');
    m.cue('headlines', { segment: 1 });
    assert.equal(m.signoffAllowed(), true, 'a new edition forgets');
  });

  test('SCORE CENTRE\'s row tick: one short dry cue, well under the voice, its own light duck', () => {
    const tick = themes.cueFor('scoreTick', 'full-time');
    assert.deepEqual(tick, themes.SCORE_TICK);
    assert.equal(tick.meta.cue, 'scoreTick');
    assert.ok(tick.loudness <= -10, `quiet (${tick.loudness} dB)`);
    assert.ok(tick.duck >= -3, 'it barely ducks anything');
    const song = parseTune(tick);
    const end = Math.max(...song.tracks.flatMap((t) => t.events.map((e) => e.at + (e.dur || 0))));
    assert.ok(end * (60 / tick.bpm) <= 0.5, 'a tick, not a phrase');
  });
});

describe('FULL TIME: the stings', () => {
  test('candidate B, the brass stab and timpani: Eb6/9, no semitone rubs', () => {
    const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), apply: () => node(), set: () => true });
    const notes = [];
    const rig = new Proxy({}, { get: (t, inst) => (time, midi, third) => {
      if (typeof midi === 'number' && midi > 20 && midi < 110) notes.push({ inst, t: time, midi, dur: inst === 'timpani' ? 0.8 : typeof third === 'number' ? third : 0.5 });
    } });
    STINGS.scoreBrass({ ctx: node(), stingBus: node(), rig, registerSting() {} }, 0, {});
    const pcs = new Set(notes.filter((n) => n.inst === 'brass').map((n) => n.midi % 12));
    assert.deepEqual([...pcs].sort((a, b) => a - b), [0, 3, 5, 7, 10], 'Eb G Bb C F');
    assert.ok(notes.some((n) => n.inst === 'timpani' && n.midi % 12 === 3), 'a timpani on E-flat');
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) assert.notEqual(Math.abs(notes[i].midi - notes[j].midi), 1);
  });

  test('candidate A, the crowd swell: many voices out of tune with one another, open vowels, a swell and a fall, ducked', () => {
    const param = (v = 0) => ({ value: v, events: [], setValueAtTime(x, t) { this.events.push(['set', x, t]); return this; }, linearRampToValueAtTime(x, t) { this.events.push(['ramp', x, t]); return this; }, setTargetAtTime(x, t, k) { this.events.push(['target', x, t, k]); return this; } });
    const convolvers = [];
    const node = (extra) => ({ connect: (d) => d, disconnect() {}, ...extra });
    const oscs = [];
    const filters = [];
    const ctx = {
      currentTime: 0,
      sampleRate: 48000,
      createGain: () => node({ gain: param(1) }),
      createBiquadFilter: () => { const f = node({ type: 'lowpass', frequency: param(350), Q: param(1), gain: param(0) }); filters.push(f); return f; },
      createOscillator: () => { const o = node({ type: 'sine', frequency: param(440), start() {}, stop() {} }); oscs.push(o); return o; },
      createBufferSource: () => node({ buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} }),
      createStereoPanner: () => node({ pan: param(0) }),
      createConvolver: () => { const c = node({ buffer: null }); convolvers.push(c); return c; },
      createBuffer: (ch, n, sr) => { const data = Array.from({ length: ch }, () => new Float32Array(n)); return { numberOfChannels: ch, length: n, sampleRate: sr, getChannelData: (c) => data[c] }; },
    };
    let ducked = null;
    let played = null;
    const eng = { ctx, rig: { white: {}, pink: {}, play: (srcs, nodes, t, stop) => { played = { srcs, t, stop }; } }, duckedSting: (level, under) => { ducked = [level, under]; return ctx.createGain(); } };
    const end = STINGS.scoreCrowd(eng, 10);
    assert.equal(oscs.length, 34, 'thirty voices and four callers');
    assert.ok(oscs.every((o) => o.type === 'sawtooth'));
    const f0 = oscs.map((o) => o.frequency.events[0][1]);
    assert.ok(f0.every((f) => f >= 100 && f <= 340), 'men and women, 100-340 Hz');
    assert.ok(Math.max(...f0) / Math.min(...f0) > 2.5, 'spread over more than an octave and a half');
    // never a choir: most voices sit between the notes of the scale, not on them (within 10 cents of a note: by chance)
    const tuned = f0.filter((f) => {
      const c = 1200 * Math.log2(f / 440);
      return Math.abs(c - 100 * Math.round(c / 100)) < 10;
    });
    assert.ok(tuned.length <= f0.length / 3, `${tuned.length} of ${f0.length} voices on a note`);
    const bands = filters.filter((f) => f.type === 'bandpass').map((f) => f.frequency.value);
    assert.ok(bands.some((f) => f > 500 && f < 800) && bands.some((f) => f > 950 && f < 1300), 'vowel formants (F1, F2)');
    assert.ok(filters.some((f) => f.type === 'highshelf' && f.gain.value < 0), 'its top rolled off: not hiss');
    assert.deepEqual(ducked, [3.3, 1.2], 'ducked under the voice it lands on');
    assert.ok(played && played.stop === end && end - 10 <= 5, `gone in under five seconds (${end - 10} s)`);
    // the callers' vowels open from "eh" to "ah" (their first formant slides up)
    const glides = filters.filter((f) => f.type === 'bandpass' && f.frequency.events.some((e) => e[0] === 'ramp'));
    assert.ok(glides.length >= 4 * 3, 'four callers, three formants each');
    // the ground's space: a dark tail of about a second and a half
    assert.equal(convolvers.length, 1);
    const ir = convolvers[0].buffer.getChannelData(0);
    const rms = (a, b) => Math.sqrt(ir.slice(Math.round(a * 48000), Math.round(b * 48000)).reduce((s, v) => s + v * v, 0) / ((b - a) * 48000));
    const drop = 20 * Math.log10(rms(1.3, 1.5) / rms(0.03, 0.23));
    assert.ok(drop < -40 && drop > -70, `the tail falls ${drop.toFixed(0)} dB in 1.3 s`);
    // on air, scoreSting plays the pick
    STINGS.scoreSting(eng, 20, {});
    assert.equal(oscs.length, 68, 'scoreSting is the crowd');
  });
});

describe('FULL TIME: SCORE CENTRE\'s row ticks and the bed\'s ticks', () => {
  const tick = (t) => {
    const k = { t, note: {}, g: { gain: { calls: [], setValueAtTime(v, at) { this.calls.push([v, at]); } } } };
    return k;
  };
  test('the bed\'s own tick leaves room for a row\'s: none within 150 ms of it', () => {
    // the bed ticks in eighths at 116 BPM (0.259 s); the clock is at 10.00 s
    const ticks = [9.741, 10.0, 10.259, 10.517, 10.776].map(tick);
    const eng = { ctx: { currentTime: 10.0 }, beds: new Set([{ ticks }]) };
    // asked for 30 ms ahead: the tick that has just sounded (10.000) moves it to 10.150; the one at 10.259 is silenced
    const at = LofiEngine.prototype.rowTick.call(eng, 10.03);
    assert.ok(Math.abs(at - 10.15) < 1e-9, `${at}`);
    assert.deepEqual(ticks.map((k) => Boolean(k.off)), [false, false, true, false, false]);
    assert.equal(ticks[2].note.cancelled, true);
    assert.deepEqual(ticks[2].g.gain.calls, [[0, 10.249]]);
    // no bed tick that still sounds is within 150 ms of the row's
    for (const k of ticks) if (!k.off) assert.ok(Math.abs(k.t - at) >= 0.15 - 1e-9, `${k.t}`);
    // far from the grid's last tick: on time, and the next one silenced if it is near
    const t2 = [10.0, 10.259].map(tick);
    assert.equal(LofiEngine.prototype.rowTick.call({ ctx: { currentTime: 10.1 }, beds: new Set([{ ticks: t2 }]) }, 10.2), 10.2);
    assert.equal(t2[1].off, true);
  });

  test('music/live.js asks the engine when the row\'s tick sounds; without a bed, at once', () => {
    const off = new LiveMusic({ context: null, musicBus: null }, { enabled: false });
    assert.equal(off.rowTick(0.03), 0.03);
    const m = new LiveMusic({ context: { currentTime: 5 }, musicBus: {} }, { enabled: false });
    m.engine = { rowTick: (at) => at + 0.08 };
    assert.ok(Math.abs(m.rowTick(0.03) - 0.11) < 1e-9);
  });
});

describe('FULL TIME: the director\'s hooks', () => {
  // paced: the voice at the estimate's own pace (14.5 characters a second, on the fake clock), so the shots can cut
  const director = ({ paced = false } = {}) => {
    const sfx = [];
    const cues = [];
    const d = new Director({
      audio: {
        mode: 'mute',
        setVoices() {},
        stop() {},
        playTune: () => ({ stop() {} }),
        sfx: (name, o) => sfx.push({ name, o }),
        speak: async (text, anchor, o = {}) => {
          const marks = o.marks || [];
          for (let i = 0; i < marks.length; i++) {
            await new Promise((r) => setTimeout(r, 20));
            o.onMark(i);
          }
          const lines = text.split(/(?<=[.!?])\s+/);
          for (let i = 0; i < lines.length; i++) {
            o.onSentence?.(lines[i], i);
            await new Promise((r) => setTimeout(r, paced ? (lines[i].length / 14.5) * 1000 : 5));
          }
        },
      },
      channel: { name: 'GLOBIT 24', slogan: '', presenters: {} },
      music: false,
    });
    d.voices = { audioFor: async () => null, episode() {}, refreshAds() {}, prepareAd() {}, adLine: () => null };
    const cue = d.music.cue.bind(d.music);
    d.music.cue = (moment, opts) => {
      cues.push({ moment, opts });
      return cue(moment, opts);
    };
    d.scene.program = { id: 'full-time', theme: 'sport' };
    d.scene.cast = { A: 'kai', B: 'rosa' };
    return { d, sfx, cues };
  };

  test('SCORE CENTRE: a tick as each row flips onto the board (an audio.sfx cue, so it stays after grave news)', async () => {
    const { d, sfx } = director();
    const text = "Let's go through the scores. Northgate County beat Saltmarsh 3-2. Millbrook beat Ashcombe 2-1. Elsewhere, Bitport Comets beat Harbourside Herons 98-91.";
    const seg = { type: 'story', feature: 'scores', anchor: 'A', storyId: 'x1', hasImage: false, text, scoresTitle: "TODAY'S RESULTS", cues: [], scores: [
      { a: 'Northgate County', b: 'Saltmarsh', sa: 3, sb: 2, char: text.indexOf('Northgate') },
      { a: 'Millbrook', b: 'Ashcombe', sa: 2, sb: 1, char: text.indexOf('Millbrook') },
      { a: 'Bitport Comets', b: 'Harbourside Herons', sa: 98, sb: 91, char: text.indexOf('Elsewhere') },
    ] };
    d.scene.shotSince = -100;
    assert.equal(await d.playBoardSegment(seg, 0), true);
    const ticks = sfx.filter((s) => s.name === 'scoreTick');
    assert.equal(ticks.length, 3, 'one tick a row');
    assert.ok(ticks.every((t) => t.o.programId === 'full-time'));
    // when the bed's tick asks for room, the row's tick and the row itself come in a little later together
    const { d: d2, sfx: sfx2 } = director();
    d2.music.rowTick = () => 0.1;
    const calls = [];
    const sfxCall = d2.audio.sfx;
    d2.audio.sfx = (name, o) => { calls.push({ name, ahead: o.startAt - performance.now() }); sfxCall(name, o); };
    d2.scene.shotSince = -100;
    await d2.playBoardSegment(seg, 0);
    const late = calls.filter((c) => c.name === 'scoreTick');
    assert.equal(late.length, 3);
    assert.ok(late.every((c) => Math.abs(c.ahead - 100) < 5), JSON.stringify(late));
    assert.equal(sfx2.filter((s) => s.name === 'scoreTick').length, 3);
    // COMING UP turns leaves, it does not tick
    sfx.length = 0;
    const t2 = "Coming up in sport. On Wednesday, it's Starfield City against Glimmerford. On Thursday, Bitport Comets against Lanternhill Lynx.";
    await d.playBoardSegment({ type: 'story', feature: 'fixtures', anchor: 'A', storyId: 'x2', hasImage: false, kicker: 'COMING UP', text: t2, cues: [], fixtures: [
      { event: 'STARFIELD CITY V GLIMMERFORD', date: '2026-10-14', when: 'WEDNESDAY', sport: 'football', char: t2.indexOf('On Wednesday') },
      { event: 'BITPORT COMETS V LANTERNHILL LYNX', date: '2026-10-15', when: 'THURSDAY', sport: 'basketball', char: t2.indexOf('On Thursday') },
    ] }, 0);
    assert.equal(sfx.filter((s) => s.name === 'scoreTick').length, 0);
  });

  test('the lead\'s scoreline card lands on the scoreline sting, once; on grave news the cue says so (the cue sheet keeps quiet)', async () => {
    const SCORE = { a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, winner: 'Coventry', draw: false, sport: 'football' };
    const lead = (emotion) => ({ type: 'story', anchor: 'A', emotion, storyId: `s-${emotion}`, headline: 'Coventry beat Newcastle', source: 'Pixelburg Sport', category: 'sport', hasImage: false, cues: [],
      text: 'Coventry beat Newcastle four one at home on Saturday afternoon. Their striker scored twice before half time, both with his left foot. Newcastle pulled one back early in the second half. Coventry added two more in the last ten minutes. They stay top of the table, three points clear.',
      fact: '4-1', score: SCORE, scoreSting: true });
    const clock = fakeClock();
    try {
      for (const emotion of ['upbeat', 'sad']) {
        const { d, cues } = director({ paced: true });
        d.scene.shotSince = clock.now() - 30;
        await clock.run(d.playStory(lead(emotion)));
        const stings = cues.filter((c) => c.moment === 'scoreSting');
        assert.equal(stings.length, 1, `${emotion}: one sting`);
        assert.equal(stings[0].opts.grave, emotion === 'sad');
        assert.equal(d.lastBoard, 'score', 'on the cut to the scoreline card');
      }
      // a story without the flag (not the lead): no sting
      const { d, cues } = director({ paced: true });
      d.scene.shotSince = clock.now() - 30;
      await clock.run(d.playStory({ ...lead('upbeat'), scoreSting: false }));
      assert.equal(d.lastBoard, 'score');
      assert.equal(cues.filter((c) => c.moment === 'scoreSting').length, 0);
    } finally {
      clock.restore();
    }
  });
});

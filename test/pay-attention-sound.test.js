// PAY ATTENTION's opening titles and sound (docs/programmes/pay-attention.md §6; critique logs
// docs/roadmap/critique/pay-attention-open.md and pay-attention-sound.md): the open (about 8 s at 112 BPM: a dark stage,
// the buzzer lamps lighting in turn on the beat, the question board flipping to PAY ATTENTION, the plate) on one cue
// sheet with its theme; the bed (112 BPM, light, bright, plucked); the countdown's ticks on the bed's half notes; the
// right sting (two bright notes), the wrong sting (a soft low note, never a buzzer's sneer), the drumroll for DOUBLE OR
// NOTHING, named for the director; the theme's tail at the sign-off. No laughter and no applause, anywhere.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PALETTES, PROGRAMMES, arrangementFor } from '../public/js/music/proposals/lofi/palettes.js';
import { barEvents } from '../public/js/music/proposals/lofi/arranger.js';
import { resolveCue, CUE_SHEET, QUIZ_MOMENTS } from '../public/js/music/proposals/lofi/cuesheet.js';
import { STINGS, QUIZ_STINGS } from '../public/js/music/proposals/lofi/stings.js';
import { LofiEngine } from '../public/js/music/proposals/lofi/engine.js';
import { openSeconds } from '../public/js/music/proposals/lofi/render.js';
import { LiveMusic } from '../public/js/music/live.js';
import { parseTune } from '../public/js/audio/tune.js';
import { CUES, hitOf, durationOf } from '../public/js/scenes/opens/cues.js';
import { P } from '../public/js/palette.js';
import { u32 } from '../public/js/gfx/index.js';
import { textPixels } from '../public/js/font.js';

const NAME = new Map(Object.entries(P).map(([k, v]) => [u32(v), k]));
function colours(d, y0 = 0, y1 = 216, x0 = 0, x1 = 384) {
  const c = {};
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const n = NAME.get(d[y * 384 + x]) || '?';
    c[n] = (c[n] || 0) + 1;
  }
  return c;
}
function fakeCanvas() {
  const cv = { width: 300, height: 150 };
  const ctx = {
    canvas: cv, fillStyle: '#000', globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: false,
    save() {}, restore() {}, fillRect() {}, drawImage() {}, putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
    createPattern() { return {}; }, measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'resetTransform', 'translate', 'scale', 'fillText', 'strokeRect', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

const ID = 'pay-attention';
const Q = CUES[ID];
const BEAT = 60 / Q.bpm;
let themes, opens, kit, emblem, titles;
before(async () => {
  globalThis.document ??= { createElement: () => fakeCanvas() };
  themes = await import('../public/js/audio/themes.js');
  opens = await import('../public/js/scenes/opens.js');
  kit = await import('../public/js/scenes/opens/kit.js');
  emblem = await import('../public/js/scenes/opens/payattention.js');
  titles = await import('../public/js/scenes/opens/payattentiontitles.js');
  await new Promise((r) => setTimeout(r, 50)); // opens.js loads the themes lazily
});

describe('PAY ATTENTION: the open', () => {
  test('about eight seconds at 112 BPM on one cue sheet: the hit 0.8 s before the cut, the theme on the same clock', () => {
    assert.equal(Q.bpm, 112);
    const dur = durationOf(ID);
    assert.ok(dur > 7.6 && dur < 8.6, `${dur} s`);
    assert.ok(Math.abs(hitOf(ID) - Q.hit * BEAT) < 1e-9 && Number.isInteger(Q.hit), 'the hit on a beat');
    const o = opens.openFor(ID);
    assert.equal(o.duration, dur, 'the director waits the sequence out');
    assert.equal(o.tune.meta.cutAt, dur);
    assert.ok(Math.abs(o.tune.meta.hitAt - hitOf(ID)) < 1e-9);
    assert.ok(Math.abs(o.tune.meta.bpm - 112) < 1e-6, 'the theme keeps the pictures\' tempo');
    assert.equal(openSeconds(ID), dur, 'the sound lab renders it as long as it airs');
  });

  test('a dark stage, then the buzzer lamps light in turn, one a beat (the circle, the square, the circle, the square), then both with the room\'s light', () => {
    assert.deepEqual([...Q.lamps], [2, 3, 4, 5], 'four beats in a row');
    assert.equal(Q.both, Q.lamps[3] + 1);
    for (let b = 0; b < Q.lamps[0]; b += 0.1) assert.deepEqual([titles.lampAt('A', b), titles.lampAt('B', b), titles.roomLight(b)], [0, 0, 0], `dark at ${b.toFixed(1)}`);
    const turn = Q.lamps.map((b, i) => [titles.lampAt('A', b + 0.05), titles.lampAt('B', b + 0.05), i]);
    assert.deepEqual(turn.map(([a, bb]) => [a, bb]), [[2, 0], [0, 2], [2, 0], [0, 2]], 'in turn, each flashing on its beat');
    for (const b of Q.lamps) {
      const who = Q.lamps.indexOf(b) % 2 === 0 ? 'A' : 'B';
      assert.equal(titles.lampAt(who, b - 0.01), 0, `${who} dark just before its beat ${b}`);
      assert.equal(titles.lampAt(who, b + 0.5), 1, `${who} lit after its flash`);
    }
    assert.deepEqual([titles.lampAt('A', Q.both + 0.5), titles.lampAt('B', Q.both + 0.5), titles.roomLight(Q.both)], [1, 1, 1]);
    // the pictures: gold appears on its desk on its beat; the dark stage has no gold, no purple and no white light
    const dark = colours(titles.payAttentionFrame(1));
    assert.ok(!dark.yellow && !dark.purple && !dark.fog, JSON.stringify(dark));
    const a = colours(titles.payAttentionFrame(Q.lamps[0] + 0.5), 0, 216, 0, 192);
    const b = colours(titles.payAttentionFrame(Q.lamps[0] + 0.5), 0, 216, 192, 384);
    assert.ok(a.yellow > 20 && !b.yellow, 'the circle\'s desk lights first, on the left');
  });

  test('the question board flips to PAY ATTENTION: blank before its turn, edge-on at the half, the two words after, at 2x in the wide', () => {
    assert.equal(titles.flipAt(Q.flip - 0.01), 0);
    assert.equal(titles.flipAt(Q.flip + Q.flipLen), 1);
    const B = titles.QUIZ_BOARD;
    const inBoard = (d) => colours(d, B.v0 + B.frame, B.v1 - B.frame, B.u0 + B.frame, B.u1 - B.frame);
    const before = inBoard(titles.payAttentionFrame(Q.flip - 0.1));
    assert.ok(!before.white && !before.silver, 'blank');
    const after = inBoard(titles.payAttentionFrame(Q.flip + Q.flipLen + 0.2));
    const words = textPixels('PAY', 'body').pixels.length + textPixels('ATTENTION', 'body').pixels.length;
    assert.equal((after.white || 0) + (after.silver || 0), words * 4, 'every pixel of the two words at 2x (white over silver)');
    // the close: a still framing on the board, twice the wide (a cut, never a zoom)
    assert.equal(titles.payAttentionFraming(Q.close - 0.01), 0);
    assert.equal(titles.payAttentionFraming(Q.close + 0.01), 1);
    assert.deepEqual(titles.FRAMINGS.map((f) => f.k), [1, 2]);
    // the wide creeps in on the dark stage (5 %, eased, one way), then holds from the room's light to the close
    let last = 0;
    for (let bb = 0; bb < Q.both; bb += 0.05) {
      const k = titles.framingOf(bb).k;
      assert.ok(k >= last - 1e-12, 'one way');
      last = k;
    }
    assert.ok(Math.abs(titles.framingOf(Q.both).k - 1.05) < 1e-9 && Math.abs(titles.framingOf(Q.close - 0.01).k - 1.05) < 1e-9, 'held');
    assert.equal(titles.framingOf(Q.close + 0.5).k, 2, 'the close: still');
    const close = titles.payAttentionFrame(Q.close + 0.5);
    const c = colours(close);
    assert.equal((c.white || 0) + (c.silver || 0), words * 16, 'the words at 4x in the close');
  });

  test('purple only as fills with their fog rims (the board\'s frame, the desks\' fronts), gold only in the lamps; nothing of TECH BYTES or COSMOS', () => {
    for (const b of [1, 2.5, 4.5, 6.2, 7, 8.5, 9.5]) {
      const d = titles.payAttentionFrame(b);
      const c = colours(d);
      for (const n of ['magenta', 'cyan', 'pink', 'blue', 'navy', 'green', 'red', '?']) assert.ok(!c[n], `beat ${b}: ${n}`);
      // every purple pixel's dark neighbour is across its rim: no purple pixel touches black or ink directly, but for
      // the score windows and the lamps' housings set into the desks' fronts
      let bare = 0;
      for (let y = 1; y < 215; y++) for (let x = 1; x < 383; x++) {
        if (d[y * 384 + x] !== u32(P.purple)) continue;
        for (const o of [-1, 1, -384, 384]) {
          const nb = NAME.get(d[y * 384 + x + o]);
          if (nb === 'slate' || nb === 'steel') bare++;
        }
      }
      assert.equal(bare, 0, `beat ${b}: purple against the room without its rim`);
    }
    // exactly: once lit, the outer ring of the board's frame and of each desk's band is fog, all round (the wide)
    const d = titles.payAttentionFrame(Q.both + 0.5);
    const B = titles.QUIZ_BOARD, D = titles.QUIZ_DESKS;
    const F = { ...titles.framingOf(Q.both + 0.5) }; // the wide on air (its creep included)
    const box = (u0, v0, u1, v1) => [u0, v0, u1, v1].map((v, i) => Math.round(i % 2 ? 108 + (v - F.cy) * F.k : 192 + (v - F.cx) * F.k));
    const boxes = [box(B.u0, B.v0, B.u1, B.v1), ...['A', 'B'].map((id) => box(D[id].u0 + 4, D[id].v0 + 3, D[id].u1 - 4, D[id].v0 + 19))];
    for (const [x0, y0, x1, y1] of boxes) {
      let bad = 0;
      for (let x = x0; x < x1; x++) for (const y of [y0, y1 - 1]) if (NAME.get(d[y * 384 + x]) !== 'fog') bad++;
      for (let y = y0; y < y1; y++) for (const x of [x0, x1 - 1]) if (NAME.get(d[y * 384 + x]) !== 'fog') bad++;
      assert.equal(bad, 0, `the rim of [${x0},${y0},${x1},${y1}]`);
      assert.ok(NAME.get(d[(y0 + 1) * 384 + x0 + 1]) === 'purple', 'purple inside it');
    }
    // and no purple outside those boxes
    let stray = 0;
    for (let y = 0; y < 216; y++) for (let x = 0; x < 384; x++) if (d[y * 384 + x] === u32(P.purple) && !boxes.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)) stray++;
    assert.equal(stray, 0);
  });

  test('the two lamps become the emblem: the cut lands it at centre stage at the package\'s size, so the plate wipes out of it with no pop', () => {
    assert.equal(Q.emblem, Q.close + 2);
    assert.ok(Q.emblem * BEAT < hitOf(ID) - 3.2 + kit.TL.glide, 'the emblem stands before the package takes over');
    const p = kit.emblemPos(kit.TL.glide);
    assert.deepEqual([p.x, p.y], [kit.CENTRE.x, kit.CENTRE.y]);
    assert.ok(Math.abs(kit.emblemScale(kit.TL.glide) - kit.ZOOM) < 1e-9);
    // the emblem's own settled state is both lamps lit, the circle left of the square
    assert.deepEqual(emblem.lampsAt(emblem.BUILD_DONE), { a: 1, b: 1 });
    const d = titles.emblemPixels();
    const left = colours(d, 0, 216, 0, 192), right = colours(d, 0, 216, 192, 384);
    assert.ok(left.yellow > 40 && right.yellow > 40, 'both lit');
    assert.ok(right.yellow > left.yellow, 'the square has more gold than the circle of the same size');
    assert.ok(left.purple > 100 && left.fog > 20, 'on a purple plaque with its fog rim');
    // the plate: purple with white type (8.9:1), its rim fog (the package draws its top line and bar; the open its sides)
    assert.equal(emblem.QUIZ_OPEN.style.plate, P.purple);
    assert.equal(emblem.QUIZ_OPEN.style.plateHi, P.fog);
    assert.equal(emblem.QUIZ_OPEN.style.bar, P.fog);
    assert.equal(emblem.QUIZ_OPEN.style.ink, 'light');
    assert.equal(emblem.QUIZ_OPEN.style.plateRim, P.fog, 'and down its sides, in the open and in the still lock-up alike');
  });

  test('in the lock-up the plaque stands centred in the plate\'s box (its top line to its bar): as many rows above as below', () => {
    const info = { title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", presenters: ['THE HOST'] };
    const Lk = kit.lockupLayout(info, emblem.QUIZ_OPEN.style);
    const top = Lk.plateY, bottom = Lk.plateY + Lk.plateH + (emblem.QUIZ_OPEN.style.barH || 2) - 1;
    const p = kit.emblemPos(20);
    assert.equal(kit.emblemScale(20), 1);
    const T = { d: new Uint32Array(384 * 216), w: 384, h: 216, ox: 0, oy: 0 };
    emblem.paintLamps(T, p.x, p.y, 1);
    let y0 = 216, y1 = -1;
    for (let y = 0; y < 216; y++) for (let x = 0; x < 384; x++) if (T.d[y * 384 + x] && T.d[y * 384 + x] !== u32(P.black)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    assert.ok(y0 > top && y1 < bottom, `inside the box (${y0}-${y1} in ${top}-${bottom})`);
    assert.equal(y0 - top, bottom - y1, `rows above ${y0 - top}, below ${bottom - y1}`);
  });

  test('the sequence draws every instant without throwing and hands over to the package\'s reveal', () => {
    const info = { title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", presenters: ['THE HOST'] };
    const ctx = fakeCanvas().getContext('2d');
    for (let t = 0; t < durationOf(ID) + 1; t += 0.05) assert.doesNotThrow(() => opens.drawOpen(ctx, 0, t, ID, info), `t ${t.toFixed(2)}`);
  });

  test('the lock-up holds still from the hit to the cut and after (the network\'s rule), and moves before it', () => {
    const info = { title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", presenters: ['THE HOST'] };
    // a canvas that records every call, so two frames can be compared (opens.test.js's method)
    const frame = (dt) => {
      const log = [];
      const cv = fakeCanvas();
      const ctx = cv.getContext('2d');
      ctx.fillRect = function (x, y, w, h) { log.push(`F${this.fillStyle}|${x}|${y}|${w}|${h}`); };
      ctx.drawImage = (img, ...a) => log.push(`D${a.join('|')}`);
      opens.drawOpen(ctx, 0, dt, ID, info);
      return log.join('\n');
    };
    const still = opens.OPENS[ID].still, end = opens.OPENS[ID].duration;
    assert.ok(Math.abs(still - hitOf(ID)) < 1e-9);
    frame(still - 0.2);
    const a = frame(still);
    assert.equal(frame(still + 0.4), a);
    assert.equal(frame(end - 0.01), a);
    assert.equal(frame(end + 4), a);
    assert.notEqual(frame(still - 0.6), a, 'still moving before the hit');
  });

  test('the theme: the buzzers\' pings on the lamps\' beats, left and right by turns, the signature an octave up; the signature then the 9th, answered by the 10th on the hit', () => {
    const tune = themes.themeFor(ID, { duration: durationOf(ID) });
    const song = parseTune(tune);
    const lead = song.tracks[0].events;
    const tonic = lead[1].midis[0];
    assert.equal(tonic % 12, 8, 'A-flat');
    assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
    assert.equal(lead[4].midis[0] - tonic, themes.COLOURS.quiz);
    assert.equal(themes.COLOURS.quiz, 14, 'the 9th');
    assert.ok(Math.abs(lead[4].at + lead[4].dur - Q.hit) < 1e-6, 'the colour ends on the hit');
    assert.equal(lead[5].midis[0] - tonic, 16, 'up to the 10th on the hit');
    assert.ok(Math.abs(lead[0].at - Q.emblem) < 1e-6, 'the signature starts on the cut to the emblem');
    // the pings: two tracks, one left and one right, a note on each lamp's beat
    const pings = tune.tracks.filter((t) => t.kind === 'lead' && Math.abs(t.pan || 0) > 0.3);
    assert.equal(pings.length, 2);
    const left = pings.find((t) => t.pan < 0), right = pings.find((t) => t.pan > 0);
    const at = (t) => parseTune({ ...tune, tracks: [t] }).tracks[0].events.map((e) => [e.at, e.midis[0] - tonic]);
    assert.deepEqual(at(left), [[Q.lamps[0], 7], [Q.lamps[2], 14]], 'the circle (A, left): low 5 and 2, an octave up');
    assert.deepEqual(at(right), [[Q.lamps[1], 12], [Q.lamps[3], 19]], 'the square (B, right): 1 and high 5, an octave up');
    // no crash, no whoosh; no semitone between any two notes sounding together
    const drums = tune.tracks.filter((t) => t.drums).map((t) => t.drums).join(' ');
    assert.ok(!/\bc:|\bw:/i.test(drums), 'no crash cymbal, no whoosh');
    const notes = song.tracks.filter((t) => t.events).flatMap((t) => t.events.filter((e) => e.midis).flatMap((e) => e.midis.map((m) => ({ m, a: e.at, b: e.at + e.dur }))));
    let rubs = 0;
    for (let i = 0; i < notes.length; i++) for (let j = i + 1; j < notes.length; j++) if (notes[i].a < notes[j].b - 1e-3 && notes[j].a < notes[i].b - 1e-3 && Math.abs(notes[i].m - notes[j].m) === 1) rubs++;
    assert.equal(rubs, 0);
  });
});

describe('PAY ATTENTION: the bed', () => {
  test('112 BPM in the open\'s key, straight; light, bright and plucked: a pluck in eighths, plucked chords, a bouncing bass, a light kit (no snare)', () => {
    const pal = PALETTES[ID];
    assert.equal(pal.bpm, 112);
    assert.equal(PROGRAMMES[ID].bpm, 112);
    assert.equal(pal.tonic % 12, 8, 'A-flat');
    assert.equal(pal.swing, 0.5, 'straight');
    const arr = arrangementFor(ID, 'welcome');
    const all = [];
    for (let n = 0; n < 8; n++) all.push(...barEvents(pal, `${ID}#test`, arr, n ? arr : null, n, {}).events);
    const of = (layer) => all.filter((e) => e.layer === layer);
    assert.ok(of('arp').length >= 8 * 6 && of('arp').every((e) => e.inst === 'pluck' && e.dur <= 0.5), 'the pluck in eighths');
    assert.ok(of('keys').length && of('keys').every((e) => e.inst === 'pluck'), 'plucked chords');
    assert.ok(of('arp').every((e) => e.midi >= 64), 'bright: the pluck over E4');
    assert.equal(of('snare').length, 0, 'light: no snare');
    assert.ok(of('kick').every((e) => e.vel <= 0.75), 'a soft kick');
    assert.ok(of('perc').filter((e) => e.inst === 'rim').every((e) => e.at === 1 || e.at === 3), 'the snap on 2 and 4');
    assert.equal(of('lead').length, 0, 'no melody: the signature is the theme\'s');
  });

  test('a question is lighter and dry: the pluck, the bass and the pad, no kit (the countdown\'s ticks have the half notes to themselves)', () => {
    const pal = PALETTES[ID];
    const arr = arrangementFor(ID, 'question');
    const ev = [];
    for (let n = 0; n < 8; n++) ev.push(...barEvents(pal, `${ID}#test`, arr, n ? arr : null, n, {}).events);
    const on = ev.filter((e) => (arr.layers[e.layer] || 0) > 0);
    assert.ok(on.some((e) => e.layer === 'arp') && on.some((e) => e.layer === 'bass'));
    assert.equal(on.filter((e) => ['kick', 'snare', 'hat', 'perc'].includes(e.layer)).length, 0);
    assert.ok(arrangementFor(ID, 'question').gain < arrangementFor(ID, 'welcome').gain, 'quieter than the welcome');
  });

  test('the cue sheet: the director\'s moments, the stings over the bed, the drumroll stepping the bed out, nothing after grave news', () => {
    const cue = (m, o = {}, c = {}) => resolveCue(m, { programId: ID, ...o }, c);
    assert.deepEqual([cue('welcome').kind, cue('welcome').song, cue('welcome').moment], ['bed', ID, 'welcome']);
    assert.equal(cue('greeting').moment, 'welcome');
    assert.equal(cue('question').moment, 'question');
    assert.equal(cue('question', { double: true }).moment, 'double', 'DOUBLE OR NOTHING\'s question on its pedal');
    assert.equal(cue('scores').moment, 'scores');
    assert.equal(cue('result').moment, 'result');
    assert.equal(cue('outro').moment, 'signoff');
    assert.deepEqual([cue('right').kind, cue('right').name, cue('right').stopBed], ['sting', QUIZ_STINGS.right, false]);
    assert.deepEqual([cue('wrong').kind, cue('wrong').name, cue('wrong').stopBed], ['sting', QUIZ_STINGS.wrong, false]);
    assert.deepEqual([cue('double').kind, cue('double').name, cue('double').stopBed], ['sting', QUIZ_STINGS.drumroll, true]);
    for (const m of QUIZ_MOMENTS) assert.equal(cue(m, {}, { afterGrave: true }).kind, 'silence', `${m} after grave news`);
    assert.ok(CUE_SHEET.filter(([p]) => p === 'PAY ATTENTION').length >= 5, 'the cue sheet documents it');
  });

  test('the sign-off: the theme\'s tail (the signature, the 9th answered by the 10th)', () => {
    const song = parseTune(themes.cueFor('outro', ID));
    const lead = song.tracks[0].events;
    const tonic = lead[1].midis[0];
    assert.equal(tonic % 12, 8);
    assert.deepEqual(lead.slice(0, 4).map((e) => e.midis[0] - tonic), themes.MOTIF.map(([s]) => s));
    assert.deepEqual(lead.slice(4, 6).map((e) => e.midis[0] - tonic), [14, 16]);
  });

  test('the colour is heard over the tonic pedal in the title sequence, the 4 s package and the tail (the house rule)', () => {
    for (const [what, tune] of [['titles', themes.themeFor(ID, { duration: durationOf(ID) })], ['package', themes.themeFor(ID, { duration: 4 })], ['tail', themes.cueFor('outro', ID)]]) {
      const song = parseTune(tune);
      const lead = song.tracks[0].events;
      const tonic = lead[1].midis[0] % 12;
      for (const dt of [0.01, 0.5, 1.0, 1.45]) {
        const b = lead[4].at + dt;
        const bass = song.tracks.filter((t) => t.kind === 'bass').flatMap((t) => t.events.filter((e) => e.at <= b && e.at + e.dur > b).flatMap((e) => e.midis));
        assert.ok(bass.length && bass.every((m) => m % 12 === tonic), `${what} at the colour +${dt}: ${bass}`);
      }
    }
  });
});

describe('PAY ATTENTION: the countdown on the bed\'s half notes', () => {
  // a stand-in engine: the real countdown method, a bed on a grid, a rig that records the ticks
  const engineWith = (bed) => {
    const notes = [];
    const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), apply: () => node(), set: () => true });
    const rig = new Proxy({}, { get: (t, inst) => (time, midi) => notes.push({ inst, t: time, midi }) });
    return { eng: { bed, ctx: node(), stingBus: node(), rig, registerSting() {}, duckedSting: () => node(), noteLog() {}, log: [] }, notes };
  };
  const HALF = 2 * (60 / 112);

  test('a half note is 1.07 s at 112 BPM; a countdown is a whole number of them on the bed\'s own grid, ending on the grid', () => {
    assert.ok(Math.abs(HALF - 1.0714) < 1e-3);
    for (const [t0, at, n] of [[0.06, 2.4, 8], [3.13, 7.0, 4], [10, 10, 5], [1.5, 1.49, 3]]) {
      const { eng, notes } = engineWith({ t0, spb: 60 / 112, endAt: Infinity });
      const r = LofiEngine.prototype.countdown.call(eng, at, n);
      assert.ok(Math.abs(r.half - HALF) < 1e-9);
      assert.ok(r.start >= at - 1e-9 && r.start - at < HALF, 'the next half note at or after the ask');
      const k = (r.start - t0) / HALF;
      assert.ok(Math.abs(k - Math.round(k)) < 1e-9, `on the grid (${k})`);
      assert.equal(r.ticks.length, n);
      r.ticks.forEach((tk, i) => assert.ok(Math.abs(tk - (r.start + i * HALF)) < 1e-9));
      assert.ok(Math.abs(r.end - (r.start + n * HALF)) < 1e-9, 'a whole number of half notes');
      const pitched = notes.filter((x) => x.inst === 'pluck');
      assert.deepEqual(pitched.map((x) => +x.t.toFixed(9)), r.ticks.map((x) => +x.toFixed(9)), 'one tick on each half note');
      assert.ok(pitched.at(-1).midi === pitched[0].midi + 5 || n === 1, 'the last tick up to the octave (time)');
    }
    // without a bed: on the quiz's grid from the ask
    const { eng } = engineWith(null);
    const r = LofiEngine.prototype.countdown.call(eng, 4.2, 3);
    assert.equal(r.start, 4.2);
    assert.ok(Math.abs(r.end - (4.2 + 3 * HALF)) < 1e-9);
  });

  test('music/live.js gives the director the countdown in seconds from now; without the engine, the same grid from the lead', () => {
    const off = new LiveMusic({ context: null, musicBus: null }, { enabled: false });
    const r0 = off.countdown(4, 0.05);
    assert.equal(r0.ticks.length, 4);
    assert.ok(Math.abs(r0.end - (0.05 + 4 * HALF)) < 1e-9);
    const m = new LiveMusic({ context: { currentTime: 10 }, musicBus: {} }, { enabled: false });
    m.engine = { countdown: (at, n) => ({ start: at + 0.3, ticks: Array.from({ length: n }, (_, i) => at + 0.3 + i * HALF), end: at + 0.3 + n * HALF, half: HALF }) };
    const r = m.countdown(6, 0.05);
    assert.ok(Math.abs(r.start - 0.35) < 1e-9 && r.ticks.length === 6 && Math.abs(r.end - (0.35 + 6 * HALF)) < 1e-9);
  });
});

describe('PAY ATTENTION: the stings', () => {
  const record = () => {
    const notes = [];
    const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), apply: () => node(), set: () => true });
    const rig = new Proxy({}, { get: (t, inst) => (time, a, b, c, d, e) => notes.push({ inst, t: time, a, midi: typeof a === 'number' && a > 20 ? a : null, p: [a, b, c, d, e].find((v) => v && typeof v === 'object' && !v.connect && !('value' in v)) || {} }) });
    return { notes, eng: { ctx: node(), stingBus: node(), rig, registerSting() {}, duckedSting: () => node() } };
  };

  test('named for the director, and each exists', () => {
    assert.deepEqual(Object.keys(QUIZ_STINGS).sort(), ['drumroll', 'right', 'tick', 'wrong']);
    for (const n of Object.values(QUIZ_STINGS)) assert.equal(typeof STINGS[n], 'function', n);
  });

  test('right: two bright notes, short', () => {
    const { notes, eng } = record();
    const end = STINGS.quizRight(eng, 10);
    const pitched = notes.filter((n) => n.midi);
    const times = [...new Set(pitched.map((n) => +n.t.toFixed(6)))];
    assert.equal(times.length, 2, 'two notes');
    assert.equal(new Set(pitched.map((n) => n.midi)).size, 2);
    assert.ok(pitched.every((n) => n.midi >= 84), 'bright: over C6');
    assert.ok(pitched.find((n) => n.t > 10).midi > pitched.find((n) => n.t === 10).midi, 'rising');
    assert.ok(end - 10 <= 1.5, `${end - 10} s`);
  });

  test('wrong: one soft low note, never a buzzer\'s sneer (no saw, square or brass, no bend, no clash), short and under the right sting', () => {
    const { notes, eng } = record();
    const end = STINGS.quizWrong(eng, 10);
    const pitched = notes.filter((n) => n.midi);
    assert.equal(new Set(pitched.map((n) => n.midi % 12)).size, 1, 'one note (its octave doubling)');
    assert.ok(pitched.every((n) => n.midi <= 61), 'low');
    assert.ok(pitched.every((n) => ['bass', 'softtri', 'ep'].includes(n.inst)), `soft voices (${pitched.map((n) => n.inst)})`);
    assert.ok(pitched.every((n) => !/saw|square/.test(n.p.wave || '') && !n.p.bend), 'no buzz, no bend');
    assert.ok(new Set(pitched.map((n) => n.t)).size === 1, 'one attack');
    assert.ok(end - 10 <= 1, `${end - 10} s`);
    // the levels the stings set for themselves: the wrong one softer than the right one
    const levels = {};
    for (const name of ['quizRight', 'quizWrong']) {
      const lv = [];
      const node = () => new Proxy(function () {}, { get: (t, k) => (k === 'value' ? 0 : node()), apply: () => node(), set: () => true });
      STINGS[name]({ ctx: node(), stingBus: node(), rig: new Proxy({}, { get: () => () => {} }), registerSting() {}, duckedSting: (a) => { lv.push(a); return node(); } }, 0);
      levels[name] = lv[0];
    }
    assert.ok(levels.quizWrong < levels.quizRight * 0.5, JSON.stringify(levels));
  });

  test('DOUBLE OR NOTHING: a drumroll of two bars at the quiz\'s tempo, rising, landing on the next downbeat on the key (no crash)', () => {
    const { notes, eng } = record();
    const end = STINGS.quizDrumroll(eng, 10);
    const snares = notes.filter((n) => n.inst === 'snare');
    assert.equal(snares.length, 64, 'thirty-seconds for two bars');
    const span = snares.at(-1).t - snares[0].t;
    assert.ok(Math.abs(span - (8 - 1 / 8) * BEAT) < 1e-6);
    // rising: each later hit at least as loud (the velocity is the rig's second argument)
    const vel = snares.map((n) => n.a);
    assert.ok(vel.every((v, i) => i === 0 || v >= vel[i - 1]) && vel.at(-1) > 3 * vel[0], `rising (${vel[0].toFixed(2)} to ${vel.at(-1).toFixed(2)})`);
    const land = 10 + 8 * BEAT;
    assert.ok(notes.some((n) => n.inst === 'timpani' && Math.abs(n.t - land) < 1e-9 && n.midi % 12 === 8), 'a timpani on A-flat on the landing');
    assert.ok(!notes.some((n) => /crash|cymbal|swell/.test(n.inst)), 'no crash');
    assert.ok(end - land <= 2.5);
  });

  test('the tick: a dry high pluck and a click, a tenth of a second', () => {
    const { notes, eng } = record();
    const end = STINGS.quizTick(eng, 5);
    assert.deepEqual(notes.map((n) => n.inst).sort(), ['pluck', 'tick']);
    assert.ok(end - 5 <= 0.2);
  });
});

describe('PAY ATTENTION: no laughter, no applause', () => {
  test('no laugh, applause or cheer sound anywhere in the channel\'s files, and none in the quiz\'s stings or cues', () => {
    const root = new URL('../public', import.meta.url).pathname;
    const bad = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(wav|mp3|ogg|m4a|aac|flac|opus|webm)$/i.test(e.name) && /laugh|applau|clap|cheer|audience/i.test(e.name)) bad.push(p);
      }
    };
    walk(root);
    assert.deepEqual(bad, []);
    for (const n of Object.values(QUIZ_STINGS)) assert.ok(!/crowd|laugh|applau|cheer/i.test(n + STINGS[n].toString()), `${n}: no crowd, laugh or applause`);
    const src = fs.readFileSync(new URL('../public/js/music/proposals/lofi/cuesheet.js', import.meta.url), 'utf8');
    const quiz = src.slice(src.indexOf('const QUIZ = '), src.indexOf('const POLICY'));
    assert.ok(!/scoreCrowd|crowd|laugh|applau/i.test(quiz.replace(/\/\/.*$/gm, '')), 'the quiz\'s cue policy plays no crowd');
    // the theme's drums: no clap
    const tune = themes.themeFor(ID, { duration: durationOf(ID) });
    assert.ok(!/\bp:/i.test(tune.tracks.filter((t) => t.drums).map((t) => t.drums).join(' ')), 'no hand clap in the theme');
  });
});

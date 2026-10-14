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
import { quizCamera, lampRect } from '../public/js/v2/canvas25d/studio/quiz.js';
import { kAt, SET } from '../public/js/v2/canvas25d/studio/geometry.js';
import { wallRect } from '../public/js/v2/canvas25d/studio/set.js';
import { lstarOf } from '../public/js/v2/canvas25d/studio/color.js';

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
let themes, opens, kit, emblem, titles, S;
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
  test('before its studio loads (and always with ?v2=0) the open airs its flat picture: every instant draws, no frame is black, the lamps strike on the beat', () => {
    assert.equal(titles.payAttentionStudio(), null, 'the studio is loaded only when asked');
    const info = { title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", presenters: ['THE HOST'] };
    const ctx = fakeCanvas().getContext('2d');
    for (let t = 0; t < durationOf(ID) + 0.5; t += 1 / 30) assert.doesNotThrow(() => opens.drawOpen(ctx, 0, t, ID, info), `t ${t.toFixed(2)}`);
    assert.equal(titles.payAttentionStudio(), null, 'drawing the open never loads the studio by itself');
    for (let b = 0; b < Q.emblem; b += 0.25) {
      const c = colours(titles.payAttentionFlatFrame(b));
      const lit = 384 * 216 - (c.black || 0);
      assert.ok(lit > 400, `beat ${b}: ${lit} lit pixels`);
    }
    const a = colours(titles.payAttentionFlatFrame(Q.lamps[0] + 0.5), 0, 216, 0, 192), bb = colours(titles.payAttentionFlatFrame(Q.lamps[0] + 0.5), 0, 216, 192, 384);
    assert.ok(a.yellow > 20 && !bb.yellow, 'the circle\'s lamp first, on the left');
    const after = colours(titles.payAttentionFlatFrame(Q.flip + Q.flipLen + 0.2));
    assert.ok((after.white || 0) + (after.silver || 0) > 100, 'PAY ATTENTION on the board after the flip');
  });

  test('the studio loads with a dynamic import when asked (the renderer asks when the v2 studio is on), and from then a play airs the studio', async () => {
    S = await titles.loadPayAttentionStudio();
    assert.ok(S && typeof S.paintStage === 'function', 'loaded');
    assert.equal(await titles.loadPayAttentionStudio(), S, 'once');
    assert.equal(titles.payAttentionStudio(), S);
    const src = fs.readFileSync(new URL('../public/js/scenes/opens/payattentiontitles.js', import.meta.url), 'utf8');
    assert.ok(!/^\s*import\s[^;]*v2\/canvas25d\/(runtime|direction|studio)\//m.test(src), 'no static import of the v2 studio');
    assert.ok(/import\(\s*'\.\/payattentionstudio\.js'\s*\)/.test(src), 'a dynamic import of the studio');
  });

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
    // the dark is built from black: through every dark beat the studio is the neutral ramp only (its lights dimmed along
    // it, never amber), but for the gold of a lit lamp and its player's shape; the lamp's warm shade and highlight stay
    // inside the lamp
    const NEUTRAL = new Set(['black', 'ink', 'slate', 'steel', 'fog', 'yellow']);
    for (let bb = 0; bb < Q.both; bb += 0.1) {
      const d = titles.payAttentionFrame(bb);
      const cam = S.cameraAt(bb);
      const lamps = ['A', 'B'].filter((id) => titles.lampAt(id, bb) > 0).map((id) => lampRect(cam, id));
      for (let i = 0; i < d.length; i++) {
        const n = NAME.get(d[i]) || '?';
        if (NEUTRAL.has(n)) continue;
        const x = i % 384, y = (i / 384) | 0;
        const inLamp = lamps.some((lp) => x >= lp.x0 && x < lp.x0 + lp.n && y >= lp.y0 && y < lp.y0 + lp.n);
        assert.ok(inLamp && (n === 'orange' || n === 'cream'), `beat ${bb.toFixed(1)}: ${n} at ${x},${y}`);
      }
    }
    const a = colours(titles.payAttentionFrame(Q.lamps[0] + 0.5), 0, 216, 0, 192);
    const b = colours(titles.payAttentionFrame(Q.lamps[0] + 0.5), 0, 216, 192, 384);
    assert.ok(a.yellow > 20 && !b.yellow, 'the circle\'s desk lights first, on the left');
  });

  test('the camera moves through the studio: from high at the back of the room, a crane down and a push in, landing on the quiz\'s wide on the room\'s light; then a cut to the board at twice the scale', () => {
    const wide = quizCamera('wide');
    // a smooth start from rest: the speed only builds through the first second (no jolt, nothing passing the lens), and
    // in the first beat no point of the room (the wall's corners, the desks' fronts, the stage's edge) moves a pixel in a
    // frame at 30 fps; yet it is moving
    const pts = [[-260, -120, SET.wallZ], [260, 52, SET.wallZ], [-152, 0, 900], [152, 52, 900], [-300, 52, 870], [300, 52, 870]];
    const at = (b) => {
      const c = { ...S.cameraAt(b) };
      return pts.map(([X, Y, Z]) => [192 + (X - c.x) * kAt(c, Z), c.hy + (Y - c.y) * kAt(c, Z)]);
    };
    const frame = 1 / 30 / BEAT;
    const speeds = [];
    for (let bb = 0; bb + frame <= 1 / BEAT; bb += frame) {
      const p0 = at(bb), p1 = at(bb + frame);
      let fastest = 0;
      for (let i = 0; i < pts.length; i++) fastest = Math.max(fastest, Math.hypot(p1[i][0] - p0[i][0], p1[i][1] - p0[i][1]));
      speeds.push(fastest);
    }
    assert.ok(speeds[0] < 0.05, `from rest (${speeds[0].toFixed(3)} px in the first frame)`);
    for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] >= speeds[i - 1] - 1e-9, `building, frame ${i}`);
    const firstBeat = Math.max(...speeds.slice(0, Math.floor(1 / frame)));
    assert.ok(firstBeat < 1, `the first beat's fastest point: ${firstBeat.toFixed(2)} px a frame`);
    assert.ok(S.moveAt(1) > 0.05, `moving (${S.moveAt(1).toFixed(2)} by beat 1)`);
    // and the pictures don't strobe: over the first second at 30 fps, few pixels change and change straight back
    // (A, B, A in three frames); a pass through the rig flipped some forty thousand
    let f0 = null, f1 = null, flips = 0;
    for (let i = 0; i <= 30; i++) {
      const f2 = S.paintStage(i * frame).slice();
      if (f0) for (let p = 0; p < f2.length; p++) if (f0[p] === f2[p] && f1[p] !== f0[p]) flips++;
      [f0, f1] = [f1, f2];
    }
    assert.ok(flips < 1500, `${flips} A-B-A flips in the first second`);
    // one way, landing exactly on the wide on the downbeat
    let last = -1;
    for (let bb = 0; bb <= Q.both; bb += 0.05) {
      const u = S.moveAt(bb);
      assert.ok(u >= last - 1e-12, 'one way');
      last = u;
    }
    assert.deepEqual(S.cameraAt(Q.both), wide, 'the wide on the downbeat');
    assert.deepEqual(S.cameraAt(Q.close - 0.01), wide, 'held to the close');
    const c0 = { ...S.cameraAt(0) };
    assert.ok(c0.y < wide.y - 150 && c0.z < wide.z - 300, `from high (${c0.y}) at the back (${c0.z})`);
    // a cut to the board: twice the wide's scale on the wall, still for two beats
    const close = S.cameraAt(Q.close + 0.01);
    assert.ok(Math.abs(kAt(close, SET.wallZ) / kAt(wide, SET.wallZ) - 2) < 1e-9, 'twice the wide');
    assert.equal(S.cameraAt(Q.close + 1.9), close, 'still');
  });

  test('the board\'s letters flip in one by one, left to right, to PAY ATTENTION under the emblem: blank tiles before, every pixel of the name after (1x in the wide, 2x in the close)', () => {
    const L = S.QUIZ_LETTERS;
    for (let i = 1; i < L.length; i++) assert.ok(S.flipStart(i) > S.flipStart(i - 1), 'left to right');
    assert.ok(S.flipStart(0) >= Q.flip && S.flipStart(L.length - 1) + 0.24 <= Q.flip + Q.flipLen + 1e-9, 'inside the flip\'s beat');
    const r = (b) => wallRect(S.cameraAt(b));
    const inBoard = (b) => {
      const w = r(b);
      return colours(titles.payAttentionFrame(b), w.y0, w.y1, w.x0, w.x1);
    };
    const dark = inBoard(Q.both - 0.1);
    assert.ok(!dark.white && !dark.silver && !dark.yellow, 'nothing on the board before the light');
    const tiles = inBoard(Q.flip - 0.05);
    assert.ok(tiles.ink > 100 && !tiles.white, `the blank tiles (${tiles.ink} ink px)`);
    assert.ok(tiles.yellow > 10 && tiles.purple > 20, 'the emblem over them: the two lamps on their plaque');
    const name = textPixels('PAY ATTENTION', 'body').pixels.length;
    const after = inBoard(Q.flip + Q.flipLen + 0.1);
    assert.equal((after.white || 0) + (after.silver || 0), name, 'every pixel of the name at 1x (white over silver)');
    const close = inBoard(Q.close + 0.5);
    assert.equal((close.white || 0) + (close.silver || 0), name * 4, 'at 2x in the close');
    // a tile mid-turn is squashed (edge-on at its half turn)
    const mid = (S.flipStart(5) + 0.12);
    assert.ok(S.tileAt(5, mid) > 0.4 && S.tileAt(5, mid) < 0.6);
  });

  test('the studio lights up in steps: dark, lifted on each lamp\'s strike, full on the downbeat; the moving heads fire inward and sweep out, stopping dead on the next beat', () => {
    assert.equal(S.darkAt(0.5), 3);
    for (const b of Q.lamps) {
      assert.equal(S.darkAt(b + 0.05), 1, `lifted on the strike at ${b}`);
      assert.equal(S.darkAt(b + 0.5), 2);
    }
    assert.equal(S.darkAt(Q.both), 0);
    assert.equal(S.beamAt(Q.both - 0.01), null, 'no beams in the dark');
    assert.ok(S.beamAt(Q.both) > 0, 'fired inward');
    assert.ok(Math.abs(S.beamAt(Q.both + 1) - S.BEAM_REST) < 1e-9 && Math.abs(S.beamAt(Q.both + 1.7) - S.BEAM_REST) < 1e-9, 'at rest from the next beat');
    // the frame's mean light rises with the steps
    const mean = (b) => {
      const d = titles.payAttentionFrame(b);
      let s = 0;
      for (const c of d) s += lstarOf(c);
      return s / d.length;
    };
    const m0 = mean(1), m1 = mean(Q.lamps[0] + 0.05), m2 = mean(Q.lamps[0] + 0.5), m3 = mean(Q.both + 0.5);
    assert.ok(m2 < m1 && m0 < m3 && m1 < m3, `dark ${m0.toFixed(1)}, strike ${m1.toFixed(1)}, lamps ${m2.toFixed(1)}, light ${m3.toFixed(1)}`);
    // in the dark the heads are the room's light: both search it, then each strike's head swings onto its desk in the
    // last third of a beat and stops dead on the strike (a follow spot on the player who buzzed), the other dark
    assert.deepEqual(S.beamsAt(1).sides, [true, true], 'searching');
    assert.deepEqual(S.beamsAt(Q.lamps[0] + 0.1).sides, [true, false], 'A\'s head on A');
    assert.deepEqual(S.beamsAt(Q.lamps[1] + 0.1).sides, [false, true], 'B\'s head on B');
    const swing = S.beamsAt(Q.lamps[1] - 0.1);
    assert.deepEqual(swing.sides, [true, true], 'B\'s head swinging in before its strike');
    const spot = S.beamsAt(Q.lamps[1]).angle[1];
    assert.ok(swing.angle[1] < spot, 'still on its way');
    assert.equal(S.beamsAt(Q.lamps[1] + 0.6).angle[1], spot, 'and stopped on the strike');
  });

  test('palette only: purple only as fills with their fog rims, gold only in the lamps and their players\' shapes, red only on the network\'s plate; nothing of TECH BYTES or COSMOS', () => {
    for (const b of [1, 2.5, 4.5, 6.2, 7, 8.5, 9.5]) {
      const d = titles.payAttentionFrame(b);
      const c = colours(d);
      for (const n of ['magenta', 'cyan', 'pink', 'blue', 'navy', 'green', '?']) assert.ok(!c[n], `beat ${b}: ${n}`);
      // every purple pixel's light neighbour is its fog rim or a bulb: no purple pixel meets the room's slate or steel
      let bare = 0;
      for (let y = 1; y < 215; y++) for (let x = 1; x < 383; x++) {
        if (d[y * 384 + x] !== u32(P.purple)) continue;
        for (const o of [-1, 1, -384, 384]) {
          const nb = NAME.get(d[y * 384 + x + o]);
          if (nb === 'slate' || nb === 'steel') bare++;
        }
      }
      assert.equal(bare, 0, `beat ${b}: purple against the room without its rim`);
      // red only on the podium's plate (the network's), in the lower middle of the frame
      if (c.red) {
        let out = 0;
        for (let y = 0; y < 216; y++) for (let x = 0; x < 384; x++) if (NAME.get(d[y * 384 + x]) === 'red' && (x < 120 || x > 264 || y < 100)) out++;
        assert.equal(out, 0, `beat ${b}: red off the plate`);
      }
    }
    // gold only where a lamp is lit: none in the dark, before the first strike
    assert.ok(!colours(titles.payAttentionFrame(1.5)).yellow, 'no gold before the first lamp');
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

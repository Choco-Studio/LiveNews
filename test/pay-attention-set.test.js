// PAY ATTENTION's set, the quiz studio (docs/programmes/pay-attention.md §6, build step 5; critique log
// docs/roadmap/critique/pay-attention-set.md): a low stage in a dark room, the question board (the network's screen) in a
// purple frame with its fog rim, the host's podium in the centre, two contestant desks with their shape lamps (a circle
// on seat A, a square on seat B) and score displays in pixel digits, two moving heads on the back wall that sweep between
// questions and hold still during one. Palette only, purple only as fills with their rims, white and gold light only,
// nothing of TECH BYTES's rings and LEDs or COSMOS's glow; the seats' geometry for the director; the frame's cost.
// Rendered in node through the quiz set's lab (no DOM: no text or logo).
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { C } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor, STYLE_IDS, BUILT_STYLE_IDS } from '../public/js/v2/canvas25d/studio/styles.js';
import { wallRect, wallFromScene, setLive, setQuizState as setFromSet, quizState } from '../public/js/v2/canvas25d/studio/set.js';
import { QUIZ, QUIZ_SEATS, quizCamera, setQuizState, resetQuizState, sweepClock, beamAngle, beamOf, BEAM_RANGE, lampRect, scoreRect, deskRect } from '../public/js/v2/canvas25d/studio/quiz.js';
import { SET, kAt, sxOf, syOf } from '../public/js/v2/canvas25d/studio/geometry.js';
import { isPalette, nameOf, lstarOf, NEUTRAL } from '../public/js/v2/canvas25d/studio/color.js';
import * as lab from '../public/js/v2/canvas25d/labs/pay-attention-set.js';

const W = 384, H = 216;
const PEOPLE = lab.hasPresenters();
const FRAMINGS = lab.FRAMINGS;

function shot(o = {}, t = 6) {
  lab.reset();
  lab.set({ presenters: false, wall: 'idle', framing: 'wide', move: null, ...o });
  lab.render(t);
  return Uint32Array.from(lab.frame.px);
}
/** The people's pixels (materials and their outline) of the last render, for masking. */
async function peopleMask() {
  const SCENE = await import('../public/js/v2/canvas25d/scene.js');
  const m = SCENE.parts.mat, mask = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (m[i] || m[i - 1] || m[i + 1] || m[i - W] || m[i + W]) mask[i] = 1;
  }
  return mask;
}
const inBox = (x, y, b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

after(() => {
  resetQuizState();
  setLive(true);
});

describe('PAY ATTENTION: the style', () => {
  test('a style of its own: theme quiz, the purple accent, the quiz idle, the quiz desks, the host at the solo seat; built ahead of its config entry', () => {
    const s = styleFor('pay-attention');
    assert.equal(s.id, 'pay-attention');
    assert.equal(s.theme, 'quiz');
    assert.equal(s.accent, C.purple);
    assert.equal(s.wallIdle, 'quiz');
    assert.equal(s.desk, 'quiz');
    assert.equal(s.solo, true);
    assert.equal(s.flats, false, 'a dark room: no set flats');
    assert.ok(BUILT_STYLE_IDS.includes('pay-attention'));
    assert.ok(!STYLE_IDS.includes('pay-attention'), 'STYLE_IDS stays config\'s programmes and drafts until the draft is entered');
  });

  test('the old renderer has THEMES.quiz: white and gold light, never TECH BYTES\'s purple and magenta rings and LEDs nor COSMOS\'s purple glow', () => {
    const src = fs.readFileSync(new URL('../public/js/set.js', import.meta.url), 'utf8');
    const line = src.split('\n').find((l) => /^\s*quiz: \{ id: 'quiz'/.test(l));
    assert.ok(line, 'THEMES.quiz');
    for (const key of ['ring', 'led', 'glow', 'tint']) {
      const m = line.match(new RegExp(`${key}: (\\[[^\\]]*\\]|P\\.\\w+)`));
      assert.ok(m, key);
      assert.ok(!/purple|magenta|pink/.test(m[1]), `${key}: ${m[1]}`);
    }
    const tech = src.split('\n').find((l) => /^\s*tech: \{/.test(l));
    assert.ok(/magenta/.test(tech) && !line.includes('P.magenta'), 'tech is purple and magenta; the quiz is not');
  });
});

describe('PAY ATTENTION: pixel discipline', () => {
  test('every pixel a palette colour in every framing, with the board at rest and with a picture, lamps lit and dark, the heads still and sweeping', () => {
    for (const framing of FRAMINGS) {
      for (const [lamps, question] of [[{ A: true, B: false }, false], [{ A: false, B: true }, true], [{ A: true, B: true }, false]]) {
        const px = shot({ framing, presenters: PEOPLE, scores: { A: 7, B: 12 }, lamps, question, at: 0 }, 9);
        let off = 0;
        for (const c of px) if (!isPalette(c)) off++;
        assert.equal(off, 0, `${framing}: ${off} off-palette pixels`);
      }
    }
  });

  test('the graphics zone (y 150-216) in the wide: black and ink, but for the stage\'s one light line (its white nosing and its fall, three rows)', () => {
    const px = shot({ framing: 'wide', scores: { A: 3, B: 4 }, lamps: { A: true } });
    const rows = new Map();
    for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) {
      const n = nameOf(px[y * W + x]);
      if (n === 'black' || n === 'ink') continue;
      rows.set(y, (rows.get(y) || new Set()).add(n));
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    assert.ok(ys.length <= 2 && (ys.length === 0 || ys.at(-1) - ys[0] <= 2), `light rows ${ys.join(',')}`);
    for (const [, set] of rows) for (const n of set) assert.ok(['fog', 'steel', 'slate'].includes(n), `the nosing's white light only (${n})`);
  });

  test('purple only as fills: on the desks\' fronts and the board\'s frame, each inside its one-pixel fog rim; nowhere else on the set', () => {
    for (const framing of ['wide', 'player-a', 'player-b', 'host']) {
      const px = shot({ framing });
      const cam = lab.cameraFor(framing);
      const k = kAt(cam, SET.wallZ), S = SET.screen, m = QUIZ.frame;
      const boxes = [{ x0: Math.round(sxOf(cam, k, S.x0 - m)), x1: Math.round(sxOf(cam, k, S.x1 + m)), y0: Math.round(syOf(cam, k, S.y0 - m)), y1: Math.round(syOf(cam, k, S.y1 + m)) }];
      for (const id of ['A', 'B']) {
        const d = QUIZ.desks[id], kf = kAt(cam, d.Z), F = QUIZ.fascia;
        boxes.push({ x0: Math.round(sxOf(cam, kf, d.X - d.hw + F.inset)), x1: Math.round(sxOf(cam, kf, d.X + d.hw - F.inset)), y0: Math.round(syOf(cam, kf, F.y0)), y1: Math.round(syOf(cam, kf, F.y1)) });
      }
      let stray = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y * W + x] === C.purple && !boxes.some((b) => inBox(x, y, b))) stray++;
      assert.equal(stray, 0, `${framing}: purple outside the fronts and the frame`);
      // each box's rim: its visible outer ring is fog (in every framing)
      for (const b of boxes) {
        const rimC = C.fog;
        let n = 0, bad = 0;
        for (let x = Math.max(0, b.x0); x < Math.min(W, b.x1); x++) for (const y of [b.y0, b.y1 - 1]) if (y >= 0 && y < H) { n++; if (px[y * W + x] !== rimC) bad++; }
        for (let y = Math.max(0, b.y0); y < Math.min(H, b.y1); y++) for (const x of [b.x0, b.x1 - 1]) if (x >= 0 && x < W) { n++; if (px[y * W + x] !== rimC) bad++; }
        if (n) assert.equal(bad, 0, `${framing}: ${bad} of ${n} rim pixels not ${nameOf(rimC)}`);
      }
    }
  });

  test('white and gold light only: the set\'s colours are neutrals and the purple fills; gold only in a lit lamp, red only on the network\'s plate', () => {
    const px = shot({ framing: 'wide', lamps: { A: true, B: true }, scores: { A: 12, B: 9 } });
    const cam = lab.cameraFor('wide');
    const r = wallRect(cam);
    const lamps = ['A', 'B'].map((id) => { const l = lampRect(cam, id); return { x0: l.x0 - 1, y0: l.y0 - 1, x1: l.x0 + l.n + 1, y1: l.y0 + l.n + 1 }; });
    const pod = deskRect(cam, 'host');
    const kf = pod.kf, P = QUIZ.plate;
    const plate = { x0: Math.round(sxOf(cam, kf, -P.hw)) - 1, x1: Math.round(sxOf(cam, kf, P.hw)) + 1, y0: Math.round(syOf(cam, kf, P.y0)) - 1, y1: Math.round(syOf(cam, kf, P.y1)) + 1 };
    const found = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (inBox(x, y, r)) continue; // the board's own content
      const n = nameOf(px[y * W + x]);
      if (NEUTRAL.has(n) || n === 'purple') continue;
      if (['yellow', 'cream', 'orange'].includes(n) && lamps.some((b) => inBox(x, y, b))) continue;
      if (['red', 'darkRed'].includes(n) && inBox(x, y, plate)) continue;
      found[n] = (found[n] || 0) + 1;
    }
    assert.deepEqual(found, {}, 'no other colour on the set');
  });

  test('the set is symmetric about x = 192 (8x8 block L* within 3), outside what differs by design: the board\'s content, the plate, the lamps, the score windows', () => {
    setLive(true);
    const px = shot({ framing: 'wide', question: true, at: 0 }, 6);
    const cam = lab.cameraFor('wide');
    const r = wallRect(cam);
    const skip = [r];
    for (const id of ['A', 'B']) {
      const l = lampRect(cam, id), s = scoreRect(cam, id);
      skip.push({ x0: l.x0 - 2, y0: l.y0 - 2, x1: l.x0 + l.n + 2, y1: l.y0 + l.n + 2 }, { x0: s.x0 - 1, y0: s.y0 - 1, x1: s.x1 + 1, y1: s.y1 + 1 });
    }
    const pod = deskRect(cam, 'host');
    skip.push({ x0: Math.floor(pod.x0), x1: Math.ceil(pod.x1), y0: Math.floor(pod.yTop) + 2, y1: Math.ceil(pod.yTop) + 24 });
    const mirrorSkip = skip.map((b) => ({ x0: W - b.x1, x1: W - b.x0, y0: b.y0, y1: b.y1 }));
    const blockL = (bx, by) => {
      let s = 0;
      for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) s += lstarOf(px[y * W + x]);
      return s / 64;
    };
    let bad = 0, n = 0;
    for (let by = 0; by + 8 <= H; by += 8) for (let bx = 0; bx + 8 <= 192; bx += 8) {
      const box = { x0: bx, y0: by, x1: bx + 8, y1: by + 8 };
      const hit = (b) => box.x0 < b.x1 && b.x0 < box.x1 && box.y0 < b.y1 && b.y0 < box.y1;
      if ([...skip, ...mirrorSkip].some(hit)) continue;
      n++;
      if (Math.abs(blockL(bx, by) - blockL(W - 8 - bx, by)) > 3) bad++;
    }
    assert.ok(n > 300, `${n} blocks compared`);
    assert.equal(bad, 0, `${bad} of ${n} blocks asymmetric`);
  });
});

describe('PAY ATTENTION: the desks', () => {
  test('the shape lamps: a circle on seat A, a square on seat B, told apart lit or dark (corners), the shape outlined in fog when dark, gold when lit', () => {
    for (const framing of ['wide']) {
      const cam = lab.cameraFor(framing);
      for (const lit of [false, true]) {
        const px = shot({ framing, lamps: { A: lit, B: lit } });
        for (const id of ['A', 'B']) {
          const l = lampRect(cam, id);
          const at = (x, y) => nameOf(px[(l.y0 + y) * W + l.x0 + x]);
          const shape = new Set(lit ? ['yellow', 'cream', 'orange'] : ['ink', 'fog']);
          const corners = [at(0, 0), at(l.n - 1, 0), at(0, l.n - 1), at(l.n - 1, l.n - 1)];
          const centreRow = Array.from({ length: l.n }, (_, x) => at(x, l.n >> 1));
          assert.ok(centreRow.every((c) => shape.has(c)), `${id} ${lit}: the shape spans its box across the middle (${centreRow})`);
          if (id === 'A') assert.ok(corners.every((c) => !shape.has(c)), `the circle leaves its box's corners (${corners})`);
          else assert.ok(corners.every((c) => shape.has(c)), `the square fills its corners (${corners})`);
          if (!lit) assert.equal(at(0, l.n >> 1), 'fog', 'dark: the outline in fog');
          else assert.ok(Array.from({ length: l.n * l.n }, (_, i) => at(i % l.n, (i / l.n) | 0)).includes('yellow'), 'lit: gold');
        }
      }
    }
  });

  test('the score displays: white pixel digits in their black windows, the units digit always in its place; blank when no score', () => {
    const cam = lab.cameraFor('wide');
    const count = (px, id) => {
      const s = scoreRect(cam, id);
      let n = 0;
      for (let y = s.y0; y < s.y1; y++) for (let x = s.x0; x < s.x1; x++) if (px[y * W + x] === C.white) n++;
      return n;
    };
    const blank = shot({ framing: 'wide' });
    assert.equal(count(blank, 'A') + count(blank, 'B'), 0);
    const px = shot({ framing: 'wide', scores: { A: 8, B: 18 } });
    assert.ok(count(px, 'A') > 10 && count(px, 'B') > count(px, 'A'), `${count(px, 'A')} / ${count(px, 'B')}`);
    // the 8 of "8" and of "18" in the same columns (right-aligned)
    const sA = scoreRect(cam, 'A'), sB = scoreRect(cam, 'B');
    const unit = (s) => { const out = []; for (let y = s.y0; y < s.y1; y++) for (let x = s.x1 - 7 * s.s; x < s.x1; x++) out.push(px[y * W + x] === C.white ? 1 : 0); return out.join(''); };
    assert.equal(unit(sA), unit(sB), 'the units digit right-aligned');
    // the hook clamps and blanks
    setQuizState({ scores: { A: 140, B: -3 } });
    assert.deepEqual(quizState().scores, { A: 99, B: 0 });
    setQuizState({ scores: { A: null } });
    assert.equal(quizState().scores.A, null);
    assert.equal(setFromSet, setQuizState, 'the hook is re-exported by studio/set.js');
  });

  test('the podium carries the network\'s red plate; the desks\' tops catch the key in silver, their fronts stand off the black stage', () => {
    const px = shot({ framing: 'wide' });
    const cam = lab.cameraFor('wide');
    const pod = deskRect(cam, 'host');
    let red = 0;
    for (let y = Math.floor(pod.yTop); y < Math.ceil(pod.yFoot); y++) for (let x = Math.ceil(pod.x0); x < Math.floor(pod.x1); x++) if (px[y * W + x] === C.red) red++;
    assert.ok(red > 300, `the plate (${red} px)`);
    for (const id of ['A', 'B', 'host']) {
      const d = deskRect(cam, id);
      const y = Math.round(d.yTop), x = Math.round((d.x0 + d.x1) / 2) + (id === 'host' ? 30 : 0);
      assert.equal(nameOf(px[y * W + x]), 'silver', `${id}: the top's lit edge`);
      assert.equal(nameOf(px[(Math.round(d.yFoot) - 10) * W + x]), 'ink', `${id}: the front stands off the stage`);
    }
  });
});

describe('PAY ATTENTION: the moving heads', () => {
  test('they sweep slowly between questions and hold still during one (the director\'s question flag), easing to a stop: never a jump', () => {
    resetQuizState();
    // no question: the sweep runs on the clock
    assert.equal(sweepClock(5), 5);
    const a0 = beamAngle(2), a1 = beamAngle(4);
    assert.ok(Math.abs(a1 - a0) > 0.02, 'the beams move between questions');
    // a question at t = 10: the sweep's clock slows to a stop within its ramp, then stands still
    setQuizState({ question: true }, 10);
    const s1 = sweepClock(11), s2 = sweepClock(20), s3 = sweepClock(60);
    assert.ok(Math.abs(s2 - s1) < 1e-9 && Math.abs(s3 - s1) < 1e-9, 'still during the question');
    assert.ok(s1 - 10 > 0 && s1 - 10 < 0.8, `eased to a stop (${(s1 - 10).toFixed(3)} s of sweep in the ramp)`);
    // no jump: the angle is continuous across the flag (per frame at 30 fps, a fraction of a degree)
    let maxStep = 0;
    for (let t = 9; t < 12; t += 1 / 30) maxStep = Math.max(maxStep, Math.abs(beamAngle(t + 1 / 30) - beamAngle(t)));
    assert.ok(maxStep < 0.01, `largest step ${(maxStep * 180 / Math.PI).toFixed(3)} deg a frame`);
    // the question ends at 30: it picks up again, eased
    setQuizState({ question: false }, 30);
    assert.ok(Math.abs(sweepClock(30) - s1) < 1e-9, 'it starts again from where it stood');
    assert.ok(sweepClock(40) - s1 > 9, 'sweeping again');
    // whole frames: during a question nothing on the set moves (the people off)
    const f1 = shot({ framing: 'wide', question: true, at: 0 }, 3);
    lab.set({ question: true, at: 0 });
    lab.render(9);
    const f2 = Uint32Array.from(lab.frame.px);
    let diff = 0;
    for (let i = 0; i < f1.length; i++) if (f1[i] !== f2[i]) diff++;
    assert.equal(diff, 0, `${diff} pixels changed during the question`);
    // and between questions they move (the beams' pixels)
    const g1 = shot({ framing: 'wide' }, 2), g2 = shot({ framing: 'wide' }, 4);
    let moved = 0;
    for (let i = 0; i < g1.length; i++) if (g1[i] !== g2[i]) moved++;
    assert.ok(moved > 20, `${moved} pixels moved between questions`);
    resetQuizState();
  });

  test('the beams keep clear of every head (6 px) and of the graphics\' top row over their whole sweep; the board\'s frame untouched', async () => {
    const cam = lab.cameraFor('wide');
    lab.reset();
    lab.set({ framing: 'wide', presenters: true });
    const { heads } = lab.render(6);
    const boxes = heads.map((h) => ({ x0: h.cx - 13 * h.s - 6, x1: h.cx + 13 * h.s + 6, y0: h.cy - 17 * h.s - 6, y1: h.cy + 13 * h.s + 6 }));
    const top = [{ x0: 13, y0: 8, x1: 150, y1: 22 }, { x0: 272, y0: 8, x1: 371, y1: 22 }];
    const k = kAt(cam, SET.wallZ), S = SET.screen, m = QUIZ.frame;
    const frame = { x0: sxOf(cam, k, S.x0 - m) - 2, x1: sxOf(cam, k, S.x1 + m) + 2, y0: syOf(cam, k, S.y0 - m), y1: syOf(cam, k, S.y1 + m) };
    for (let i = 0; i <= 24; i++) {
      // drive the angle over its whole range through the clock (a quarter period at a time)
      const t = (i / 24) * 16;
      for (const side of [-1, 1]) {
        const b = beamOf(cam, side, t);
        const tan = Math.tan(b.spread);
        for (let d = 0; d <= b.len; d += 1) {
          const hw = 1 + d * tan;
          for (const o of [-hw, 0, hw]) {
            const x = b.lx + b.dx * d - b.dy * o, y = b.ly + b.dy * d + b.dx * o;
            for (const bx of boxes) assert.ok(!(x >= bx.x0 && x < bx.x1 && y >= bx.y0 && y < bx.y1), `t ${t.toFixed(1)} side ${side}: the beam near a head at (${x.toFixed(0)}, ${y.toFixed(0)})`);
            for (const bx of top) assert.ok(!(x >= bx.x0 && x < bx.x1 && y >= bx.y0 && y < bx.y1), `under the top row at (${x.toFixed(0)}, ${y.toFixed(0)})`);
            assert.ok(!(x >= frame.x0 && x < frame.x1 && y >= frame.y0 && y < frame.y1), 'on the board');
          }
        }
        assert.ok(b.ly - 6 * b.s >= 22, 'the head itself below the top row');
      }
    }
    assert.ok(BEAM_RANGE[0] < BEAM_RANGE[1]);
    // the fixtures themselves (the bracket over each head included) keep 4 px of air under the top row's boxes (on air
    // the bug's globe and the clock stand there): its top edge at y 26 or lower, and nothing but the dark wall (black,
    // ink) within 4 px of either box at any point of the sweep
    assert.ok(syOf(cam, k, QUIZ.heads.Y - 9) >= 26 - 0.5, `the bracket's top at y ${syOf(cam, k, QUIZ.heads.Y - 9).toFixed(1)}`);
    for (const t of [0, 4, 8, 12]) {
      lab.render(t);
      const px = lab.frame.px;
      for (const bx of top) {
        for (let y = bx.y0; y < bx.y1 + 4; y++) for (let x = Math.max(0, bx.x0 - 4); x < Math.min(W, bx.x1 + 4); x++) {
          const n = nameOf(px[y * W + x]);
          assert.ok(n === 'black' || n === 'ink', `t ${t}: ${n} at (${x}, ${y}), within 4 px of the top row`);
        }
      }
    }
  });

  test('only the wide sees them: in the singles nothing of theirs is in frame (nothing moves behind a contestant\'s or the host\'s head)', () => {
    for (const framing of ['host', 'player-a', 'player-b']) {
      for (const t of [0, 4, 8, 12]) {
        const on = shot({ framing }, t);
        setLive(false);
        const off = shot({ framing }, t);
        setLive(true);
        let d = 0;
        for (let i = 0; i < on.length; i++) if (on[i] !== off[i]) d++;
        assert.equal(d, 0, `${framing} at ${t} s: ${d} pixels of the moving heads in frame`);
      }
    }
  });
});

describe('PAY ATTENTION: the seats (for the director)', () => {
  test('three seated anchors: the host at the solo seat in the centre, A left and B right mirrored, all at the people\'s depth', () => {
    assert.equal(QUIZ_SEATS.host.X, SET.seatX.solo ?? 0);
    assert.equal(QUIZ_SEATS.A.X, -QUIZ_SEATS.B.X);
    assert.ok(QUIZ_SEATS.A.X < -100);
    for (const s of Object.values(QUIZ_SEATS)) assert.equal(s.Z, SET.presenterZ);
    assert.deepEqual([QUIZ_SEATS.A.side, QUIZ_SEATS.host.side, QUIZ_SEATS.B.side], [1, 0, -1], 'the contestants turn toward the host');
    for (const id of ['A', 'B']) assert.equal(QUIZ.desks[id].X, QUIZ_SEATS[id].X, `desk ${id} under its seat`);
  });

  test('the proposed wide frames all three: heads inside with 20 px of air, below the top row; the board\'s foot behind the host\'s shoulders; the contestants clear of the board', { skip: !PEOPLE && 'presenter modules unavailable' }, () => {
    lab.reset();
    lab.set({ framing: 'wide', presenters: true });
    const { heads, cam } = lab.render(6);
    assert.equal(heads.length, 3);
    const r = wallRect(cam);
    for (const h of heads) {
      const x0 = h.cx - 12.5 * h.s, x1 = h.cx + 12.5 * h.s;
      assert.ok(x0 >= 20 && x1 <= W - 20, `head at ${h.cx.toFixed(0)}`);
      assert.ok(h.cy - 16 * h.s >= 24, 'below the top row');
    }
    const [A, B, host] = heads;
    const neck = syOf(cam, kAt(cam, SET.presenterZ), SET.neckY);
    assert.ok(r.y1 >= neck + 2, `the board's foot (${r.y1}) behind the host's shoulders (neck ${neck.toFixed(0)})`);
    assert.ok(A.cx + 13 * A.s + 10 < r.x0 - 8 && B.cx - 13 * B.s - 10 > r.x1 + 8, 'the contestants clear of the board and its frame');
    assert.ok(Math.abs(host.cx - 192) < 1, 'the host centred');
  });

  test('faces are the brightest thing on the set: no studio 4x4 patch brighter than the darkest face (the lit lamps aside), in every framing', { skip: !PEOPLE && 'presenter modules unavailable' }, () => {
    for (const framing of FRAMINGS) {
      lab.reset();
      lab.set({ framing, presenters: true, lamps: { A: false, B: false }, scores: { A: 11, B: 7 } });
      const m = lab.measure(6);
      assert.equal(m.set.off, 0);
      assert.equal(m.patches, 0, `${framing}: ${m.patches} patches brighter than a face`);
      for (let i = 0; i < m.faces.length; i++) {
        if (m.faces[i] == null) continue;
        assert.ok(m.faces[i] >= m.zones[i].mean + 20, `${framing}: face ${m.faces[i].toFixed(1)} over its ring ${m.zones[i].mean.toFixed(1)}`);
      }
    }
  });
});

describe('PAY ATTENTION: the board', () => {
  test('the board at rest: the programme\'s name and the two players\' marks in fog, no gold and no purple on it; a story\'s picture fills it', () => {
    const px = shot({ framing: 'wide' });
    const r = wallRect(lab.cameraFor('wide'));
    const seen = {};
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const n = nameOf(px[y * W + x]); seen[n] = (seen[n] || 0) + 1; }
    assert.ok(seen.fog > 80, `the name and the marks (${seen.fog} fog px)`);
    for (const n of ['yellow', 'purple', 'cream', 'orange']) assert.ok(!seen[n], `no ${n} on the board`);
    // the scene's rules: a picture or the board at rest, laid out round the host (solo) whatever the cast
    const img = { full: { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(120) } };
    const scene = (o) => ({ program: { id: 'pay-attention' }, cast: { A: 'penny', B: 'nova' }, storyId: 's1', images: new Map([['s1', img]]), segPlan: { ctx: { seg: { type: 'story', storyId: 's1', ...o } } } });
    const w1 = wallFromScene(scene({}), 'pay-attention');
    assert.equal(w1.mode, 'picture');
    assert.equal(w1.solo, true);
    const w2 = wallFromScene({ ...scene({ numbers: [{ value: '42', label: 'X' }], location: { lat: 1, lon: 2, place: 'P' } }), images: new Map(), storyId: 's2' }, 'pay-attention');
    assert.equal(w2.mode, 'idle', 'never a map, a figure or a plate on the question board');
  });

  test('cached frames equal uncached ones: the lamps, the scores and the beams are drawn over the cached set each frame', () => {
    lab.reset();
    lab.set({ framing: 'wide', presenters: false, cache: true, lamps: { A: true }, scores: { A: 5, B: 6 } });
    lab.render(4);
    lab.set({ lamps: { A: false, B: true }, scores: { A: 9, B: 6 } });
    lab.render(5);
    const cached = Uint32Array.from(lab.frame.px);
    lab.set({ cache: false });
    lab.render(5);
    const fresh = Uint32Array.from(lab.frame.px);
    lab.set({ cache: true });
    let d = 0;
    for (let i = 0; i < cached.length; i++) if (cached[i] !== fresh[i]) d++;
    assert.equal(d, 0, `${d} pixels differ`);
  });
});

describe('PAY ATTENTION: frame cost', () => {
  test('the background uncached under a push stays within the network\'s 1 ms budget a frame (with margin for a busy machine); cached, a copy', () => {
    lab.reset();
    lab.set({ framing: 'wide', presenters: false });
    let best = Infinity, bestCached = Infinity;
    for (let i = 0; i < 3; i++) {
      const p = lab.profile(60);
      best = Math.min(best, p.bgUncached);
      bestCached = Math.min(bestCached, p.bgCached);
    }
    assert.ok(best < 2.5, `uncached ${best.toFixed(2)} ms`);
    assert.ok(bestCached < 0.3, `cached ${bestCached.toFixed(3)} ms`);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stage, REMOTE_SHOTS } from '../public/js/v2/canvas25d/runtime/stage.js';
import { frame } from '../public/js/v2/canvas25d/scene.js';
import { C } from '../public/js/v2/canvas25d/pixbuf.js';
import { REMOTE, TWOWAY, drawBackdrop } from '../public/js/v2/canvas25d/studio/remote.js';
import { gapKind } from '../public/js/pace.js';

// A correspondent link on the v2 Stage (owner 4 Oct: "poner un reportero hablando sobre ello"): the LOCATION
// shot (the correspondent before the place) and the TWO-WAY (the presenter and the correspondent side by side).

const W = 384, H = 216;
const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
const ctx = { putImageData() {} };

function fakeAudio(speaking = 'R1') {
  const calls = [];
  return {
    calls,
    speaking,
    speechFrame(ms, slot, o = {}) {
      calls.push(slot);
      o.slot = slot;
      o.speaking = slot === this.speaking;
      o.level = o.speaking ? 0.6 : 0;
      o.viseme = o.speaking ? 'AA' : 'rest';
      o.next = 'rest';
      o.mix = 0;
      o.wordIndex = o.charIndex = o.sentenceIndex = -1;
      o.accent = 0;
      o.pause = false;
      return o;
    },
  };
}
const EP = { id: 'epR', program: { id: 'world-now', title: 'WORLD NOW', theme: 'world' }, cast: { A: 'paco', B: 'lola' }, correspondents: { R1: 'vic' } };
const sceneOf = (shot, extra = {}) => ({ episode: EP, program: EP.program, cast: EP.cast, anchors: {}, images: new Map(), wall: { mode: 'logo' }, segPlan: null, focus: 'A', shot, shotSince: 1, ...extra });
const REMOTE_AT = { slot: 'R1', id: 'vic', lat: 21.2, lon: -86.9, grave: false, footage: 'fclip', place: 'CANCÚN' };

/** A fake footage deck: one clip, a 192x108 frame of a flat steel "sky" over a navy "sea". */
function fakeDeck(ready = true) {
  const px = new Uint32Array(192 * 108);
  for (let i = 0; i < px.length; i++) px[i] = i < 192 * 60 ? C.steel : C.navy;
  return { asked: [], ready: (id) => ready && id === 'fclip', frame(id, variant) { this.asked.push(variant); return ready && id === 'fclip' ? { px, w: 192, h: 108 } : null; } };
}

function run(stage, scene, t0 = 1, n = 6) {
  for (let i = 0; i < n; i++) stage.frame(ctx, t0 + i * 0.1, scene);
  return new Uint32Array(frame.px);
}

test('the link shots are the Stage’s, and the two-way keeps its turns close (pace: link gap)', () => {
  assert.deepEqual([...REMOTE_SHOTS].sort(), ['location', 'twoway']);
  assert.equal(gapKind({ type: 'story', anchor: 'A', link: 'R1' }, { type: 'cross', part: 'piece', anchor: 'R1' }), 'link');
  assert.equal(gapKind({ type: 'cross', part: 'piece', anchor: 'R1' }, { type: 'cross', part: 'ask', anchor: 'A' }), 'link');
});

test('LOCATION: the correspondent in a medium close-up on the left third, before the place’s footage (2x, graded "back")', () => {
  const audio = fakeAudio('R1');
  const st = new Stage({ audio, channel: { presenters: {} }, idle: null });
  const deck = fakeDeck();
  const px = run(st, sceneOf('location', { remote: REMOTE_AT, footageDeck: deck }));
  assert.ok(deck.asked.every((v) => v === 'back'), 'the darker grading behind a person');
  // the backdrop where nobody stands: the footage at 2x
  assert.equal(px[10 * W + 370], C.steel);
  assert.equal(px[200 * W + 370], C.navy);
  // the correspondent: Vic's deep skin round the head's place, never the backdrop's colours
  let face = 0, skin = 0;
  for (let y = 50; y < 110; y++)
    for (let x = REMOTE.headX - 20; x < REMOTE.headX + 20; x++) {
      const c = px[y * W + x];
      if (c !== C.steel && c !== C.navy) face++;
      if (c === C.tan || c === C.tanShade || c === C.brown) skin++;
    }
  assert.ok(face > 1200, `the head is drawn (${face} px)`);
  assert.ok(skin > 400, `in Vic's skin ramp (${skin} px)`);
  // the correspondent's own voice slot drives the mouth
  assert.ok(audio.calls.includes('R1'), 'speechFrame sampled for R1');
  assert.equal(st.remote.id, 'vic');
  assert.equal(st.remote.perf.side, 0, 'to camera');
});

test('LOCATION on a grave story, or with no footage ready: the desk backdrop (dark field, the region’s map, the pin), palette only', () => {
  for (const scene of [sceneOf('location', { remote: { ...REMOTE_AT, grave: true }, footageDeck: fakeDeck() }), sceneOf('location', { remote: REMOTE_AT, footageDeck: fakeDeck(false) })]) {
    const st = new Stage({ audio: fakeAudio(), channel: { presenters: {} }, idle: null });
    const px = run(st, scene);
    assert.equal(st.backdrop.kind, 'desk');
    for (const c of px) assert.ok(PALETTE.has(c >>> 0), 'palette only');
    assert.equal(px[92 * W + 286], C.white, 'the pin on the place');
    let dots = 0;
    for (let y = 2; y < H; y += 3) for (let x = 200; x < W; x += 3) if (px[y * W + x] === C.fog || px[y * W + x] === C.steel) dots++;
    assert.ok(dots > 40, `the region's land in dots (${dots})`);
  }
  // the desk backdrop alone, as drawn: black at the floor, the wash high behind the correspondent
  const px = new Uint32Array(W * H);
  drawBackdrop(px, { kind: 'desk', lat: 0, lon: -150, accent: C.red }, 0);
  assert.equal(px[(H - 1) * W + 2], C.black);
  assert.equal(px[40 * W + 100], C.slate);
});

test('TWO-WAY: the presenter’s single and the correspondent, each cropped into a framed box; the studio wall at rest', () => {
  const st = new Stage({ audio: fakeAudio('A'), channel: { presenters: {} }, idle: null });
  // a story on the wall before the link (a plate would be cut by the box: it must not show)
  run(st, sceneOf('close', { framing: 'mcu-l', storyId: 's1', wall: { mode: 'source', source: 'PIXELBURG POST' } }), 1, 3);
  const px = run(st, sceneOf('twoway', { shotSince: 2, remote: REMOTE_AT, footageDeck: fakeDeck() }), 2, 6);
  assert.equal(st.wall.mode, 'idle');
  for (const bx of [TWOWAY.left, TWOWAY.right]) {
    // the fog frame round each box, the accent rule under it
    assert.equal(px[(TWOWAY.y - 1) * W + bx + 20], C.fog);
    assert.equal(px[(TWOWAY.y + TWOWAY.h) * W + bx + 20], C.fog);
    assert.equal(px[(TWOWAY.y + TWOWAY.h + 3) * W + bx + 20], st.accent);
    // a head in the box (skin round its centre)
    let warm = 0;
    for (let y = TWOWAY.y + 25; y < TWOWAY.y + 60; y++) for (let x = bx + TWOWAY.headX - 10; x < bx + TWOWAY.headX + 10; x++) {
      const c = px[y * W + x];
      if (c === C.skin || c === C.tan || c === C.skinShade || c === C.tanShade || c === C.brown || c === C.cream) warm++;
    }
    assert.ok(warm > 150, `a face in the box at ${bx} (${warm} px)`);
  }
  // off the link, the Stage drops the correspondent
  run(st, sceneOf('wide', { shotSince: 3 }), 3, 2);
  assert.equal(st.remote, null);
});

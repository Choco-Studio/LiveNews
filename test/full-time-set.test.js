// FULL TIME's set, the pitchside platform (docs/programmes/full-time.md §6, build step 5; critique log
// docs/roadmap/critique/full-time-set.md): the ground by the hour and its floodlight banks, the still crowd, the only two
// motions (the scoreboard's minute and the pennant), signs whole or not at all and never behind a person, values that
// keep the faces the brightest thing in every phase and framing, no shimmer under the camera's moves, the screen's rule
// (pictures and the emblem), and a frame cost below WORLD NOW's; the integrator's round (the platform's edge in the
// wide, the scoreboard on the stand's roof, the day's pitch brighter than the night's, the golden hour's lit banks, no
// sky band or stripe edge behind a head, the singles' ground). Rendered in node through the set lab.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor, STYLE_IDS } from '../public/js/v2/canvas25d/studio/styles.js';
import { wallFromScene, setLive, setSkyHour, setSkyClock, wallRect } from '../public/js/v2/canvas25d/studio/set.js';
import { GROUND, groundKey, banksLit, boardTime, towerHead, TOWER_LIST, PHASE_PALS, PENNANT_FRAMES, pennantFrame, LIVE_STATE } from '../public/js/v2/canvas25d/studio/pitch.js';
import { skyPhase } from '../public/js/v2/canvas25d/studio/city.js';
import { isPalette, nameOf, LSTAR } from '../public/js/v2/canvas25d/studio/color.js';
import { THEME_ACCENT } from '../public/js/cast.js';
import { P } from '../public/js/palette.js';
import * as lab from '../public/js/v2/canvas25d/labs/set.js';

const W = 384, H = 216;
const PRESENTERS = lab.hasPresenters();
// one hour per sky phase (city.js skyPhase), and the golden hour's floodlight banks coming on
const HOURS = { night: 23, dawn: 6.5, breakfast: 8.5, day: 12.5, golden: 18.1, blue: 20 };
const FRAMINGS = ['wide', 'two', 'mcu-l', 'mcu-r', 'ots'];

function shot(o, t = 10) {
  lab.set({ programme: 'full-time', presenters: false, wall: 'idle', phase: 'intro', move: null, ...o });
  lab.reset();
  lab.render(t);
  return Uint32Array.from(lab.frame.px);
}

after(() => {
  setSkyClock(null);
  setSkyHour(23);
  setLive(true);
  lab.set({ move: null, hour: 23 });
});

describe('FULL TIME: the style', () => {
  test('a style of its own: the orange accent and edge light, the FULL TIME emblem, an open set (no back wall); warmed with the others', () => {
    const s = styleFor('full-time');
    assert.equal(s.id, 'full-time');
    assert.equal(s.theme, 'sport');
    assert.equal(s.accent, C.orange);
    assert.equal(s.deskLine, C.orange);
    assert.equal(s.wallIdle, 'fulltime');
    assert.equal(s.open, true);
    assert.ok(STYLE_IDS.includes('full-time'));
    assert.equal(THEME_ACCENT.sport, P.orange, 'the programme accent of cast.js');
    assert.ok(lab.PROGRAMMES.includes('full-time'), 'the set lab shows it');
  });
});

describe('FULL TIME: the ground follows the hour', () => {
  test('the channel\'s sky phases; the floodlights come on bank by bank at the golden hour; never a night ground at breakfast', () => {
    const at = (h) => {
      setSkyHour(h);
      const k = groundKey();
      return { phase: k >> 3, banks: k & 7 };
    };
    for (const h of [21.5, 23, 2, 5]) assert.deepEqual(at(h), { phase: 0, banks: 4 }, `night ${h}`);
    for (const h of [5.5, 6, 7, 7.4]) assert.deepEqual(at(h), { phase: 1, banks: 0 }, `dawn ${h}: the floodlights off`);
    for (const h of [7.5, 8, 8.5, 9, 12, 16.9]) assert.deepEqual(at(h), { phase: 2, banks: 0 }, `day ${h}`);
    assert.deepEqual([17.05, 17.45, 17.85, 18.25, 18.65, 18.95].map((h) => at(h).banks), [0, 1, 2, 3, 4, 4], 'one bank every 24 minutes as the sky reddens');
    for (const h of [19, 20, 20.9]) assert.deepEqual(at(h), { phase: 4, banks: 4 }, `blue hour ${h}`);
    for (let h = 6; h <= 9.5; h += 0.25) {
      setSkyHour(h);
      assert.notEqual(skyPhase(), 0, `${h}: breakfast is never a night ground`);
      assert.equal(banksLit(skyPhase(), h), 0, `${h}: no floodlight on at breakfast`);
    }
    setSkyHour(23);
  });

  test('the lamps on the towers show the banks lit (top bank first), and the halos only while they burn', () => {
    const cam = lab.cameraFor('wide', 'full-time');
    const near = TOWER_LIST.find((t) => t.kind === 'near' && t.X < 0);
    const hd = towerHead(cam, near);
    const lampAt = (px, j) => px[(hd.y0 + hd.s + j * (hd.lw + hd.gap)) * W + hd.x0 + hd.s];
    for (const [h, banks] of [[17.1, 0], [17.5, 1], [18.1, 2], [18.7, 4], [20, 4], [23, 4], [12.5, 0], [6.5, 0]]) {
      const px = shot({ framing: 'wide', hour: h });
      const lit = [0, 1, 2, 3].map((j) => lampAt(px, j) === C.white);
      assert.deepEqual(lit, [0, 1, 2, 3].map((j) => j < banks), `${h}: ${banks} banks`);
    }
    // the halo: posterised rings of light round a lit head over the dark sky (steel and slate lifted), none at dawn
    const ring = (px) => {
      let n = 0;
      for (let y = Math.floor(hd.cy - hd.R); y <= Math.ceil(hd.cy + hd.R); y++) for (let x = Math.floor(hd.cx - hd.R); x <= Math.ceil(hd.cx + hd.R); x++) {
        if (x < 0 || y < 0 || (x >= hd.x0 - 1 && x <= hd.x0 + hd.w && y >= hd.y0 - 1 && y <= hd.y0 + hd.h)) continue;
        const d = Math.hypot(x + 0.5 - hd.cx, (y + 0.5 - hd.cy) * 1.15) / hd.R;
        if (d < 0.9 && (px[y * W + x] === C.steel || px[y * W + x] === C.slate)) n++;
      }
      return n;
    };
    assert.ok(ring(shot({ framing: 'wide', hour: 23 })) > 20, 'a halo at night');
    assert.equal(ring(shot({ framing: 'wide', hour: 6.5 })), 0, 'no halo with the floodlights off');
  });

  test('the graphics\' top row never sits on a light: no tower head or halo under the bug and its tags or the clock', () => {
    // the top row's boxes (graphics/layout.js TOP: y 8-21; the bug, LIVE and the programme tag up to x ~150, the clock
    // from x ~272)
    const boxes = [{ x0: 13, y0: 8, x1: 150, y1: 22 }, { x0: 272, y0: 8, x1: 371, y1: 22 }];
    for (const framing of ['wide', 'two', 'ots']) {
      const cam = lab.cameraFor(framing, 'full-time');
      for (const t of TOWER_LIST) {
        const hd = towerHead(cam, t);
        const r = { x0: Math.min(hd.x0, hd.cx - hd.R), x1: Math.max(hd.x0 + hd.w, hd.cx + hd.R), y0: Math.min(hd.y0, hd.cy - hd.R / 1.15), y1: Math.max(hd.y0 + hd.h, hd.cy + hd.R / 1.15) };
        for (const b of boxes) assert.ok(r.x1 <= b.x0 || r.x0 >= b.x1 || r.y1 <= b.y0 || r.y0 >= b.y1, `${framing} ${t.kind} ${t.X}: a light under the top row [${r.x0.toFixed(0)},${r.y0.toFixed(0)}]-[${r.x1.toFixed(0)},${r.y1.toFixed(0)}]`);
      }
    }
  });

  test('each phase is its own ground: the sky, the stand and the pitch change with the hour', () => {
    const wides = Object.values(HOURS).map((h) => shot({ framing: 'wide', hour: h }));
    for (let a = 0; a < wides.length; a++) for (let b = a + 1; b < wides.length; b++) {
      const same = (Object.values(HOURS)[a] === 8.5 && Object.values(HOURS)[b] === 12.5);
      let d = 0;
      for (let i = 0; i < W * 112; i++) if (wides[a][i] !== wides[b][i]) d++;
      if (same) assert.ok(d < 200, `breakfast and noon are the same day ground (${d})`);
      else assert.ok(d > 3000, `${Object.keys(HOURS)[a]} vs ${Object.keys(HOURS)[b]}: ${d} px`);
    }
  });
});

describe('FULL TIME: pixel discipline', () => {
  test('every pixel a palette colour in every phase and framing, with the idle screen and with a picture; the graphics zone dark in the wide', () => {
    for (const h of Object.values(HOURS)) {
      for (const framing of [...FRAMINGS, 'single-a']) {
        const px = shot({ framing, hour: h, presenters: true });
        let off = 0;
        for (let i = 0; i < px.length; i++) if (!isPalette(px[i])) off++;
        assert.equal(off, 0, `${h} ${framing}: ${off} off-palette pixels`);
      }
      // the graphics zone: black and ink, but for the one light line (ART_DIRECTION: the desk's foot light; here the
      // platform's edge, its LED and the light on the riser's top row: two rows a column, never an area)
      const px = shot({ framing: 'wide', hour: h });
      let light = 0;
      for (let x = 0; x < W; x++) {
        let lit = 0;
        for (let y = 150; y < H; y++) {
          const c = px[y * W + x];
          if (c === C.orange || c === C.rust) {
            lit++;
            assert.ok(y >= 170, `${h}: the light line at ${x},${y} sits under the desk's foot`);
            continue;
          }
          assert.ok(c === C.black || c === C.ink, `${h}: ${x},${y} ${nameOf(c)} in the graphics zone`);
        }
        assert.ok(lit <= 2, `${h}: ${lit} lit rows in column ${x}`);
        light += lit;
      }
      assert.ok(light <= 4 * W, `${h}: ${light} light pixels in the graphics zone`);
    }
  });

  test('the set is symmetric about x = 192 in every phase (8x8 blocks, the dressing on, outside the wall), but for the scoreboard on the roof to one side', () => {
    for (const h of Object.values(HOURS)) {
      const px = shot({ framing: 'wide', hour: h });
      const r = wallRect(lab.cameraFor('wide', 'full-time'));
      // the scoreboard and its pennant (the board's digits to the pennant's tip, the legs down to the roof), mirrored
      const bd = LIVE_STATE.board, pn = LIVE_STATE.pennant;
      assert.ok(bd && pn, `${h}: the scoreboard and its pennant in the wide`);
      const sb = { x0: bd.x0 - 3 * bd.s, x1: pn.x + 9 * pn.s, y0: bd.y0 - 2 * bd.s, y1: bd.y0 + 10 * bd.s };
      const nearBoard = (bx, by) => {
        const mx0 = 384 - (bx + 8);
        return (mx0 < sb.x1 && sb.x0 < mx0 + 8 && by < sb.y1 && sb.y0 < by + 8);
      };
      let bad = 0, skipped = 0;
      for (let by = 0; by < 112; by += 8) for (let bx = 0; bx + 8 <= r.x0 - 3; bx += 8) {
        if (nearBoard(bx, by)) {
          skipped++;
          continue;
        }
        let a = 0, b = 0;
        for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
          a += LSTAR[nameOf(px[y * W + x])];
          b += LSTAR[nameOf(px[y * W + (383 - x)])];
        }
        if (Math.abs(a - b) / 64 > 3) bad++;
      }
      assert.equal(bad, 0, `${h}: ${bad} asymmetric blocks`);
      assert.ok(skipped <= 16, `${h}: the scoreboard's blocks (${skipped})`);
    }
  });

  test('a still crowd in the lower tier (heads in two tones, a few muted scarves), the upper tier darker', () => {
    setSkyHour(23);
    const px = shot({ framing: 'wide' });
    const cam = lab.cameraFor('wide', 'full-time');
    const k = 1000 / (GROUND.stand.Z - cam.z);
    const yOf = (Y) => Math.round(cam.hy + (Y - cam.y) * k);
    const count = (y0, y1, x0, x1) => {
      const by = {};
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const nm = nameOf(px[y * W + x]);
        by[nm] = (by[nm] || 0) + 1;
        sum += LSTAR[nm];
        n++;
      }
      return { by, mean: sum / n };
    };
    // the lower tier beside the screen and the presenters (x 60-100: between a near tower and Paco)
    const low = count(yOf(GROUND.stand.lower), yOf(GROUND.stand.wall), 56, 100);
    const [hA, hB] = PHASE_PALS[0].heads.map(nameOf);
    assert.ok(low.by[hA] > 30 && low.by[hB] > 5, `heads in two tones: ${JSON.stringify(low.by)}`);
    const scarves = PHASE_PALS[0].scarves.map(nameOf).reduce((a, n) => a + (low.by[n] || 0), 0);
    assert.ok(scarves >= 1 && scarves < 0.05 * (100 - 56) * (yOf(GROUND.stand.wall) - yOf(GROUND.stand.lower)), `a few scarves (${scarves})`);
    const up = count(yOf(GROUND.stand.under), yOf(GROUND.stand.balcony), 56, 100);
    assert.ok(up.mean < low.mean, `the upper tier is dark (${up.mean.toFixed(1)} < ${low.mean.toFixed(1)})`);
  });
});

describe('FULL TIME: motion, slow and sparse', () => {
  test('a still camera over two minutes: only the scoreboard\'s minute and the pennant change; nothing moves in the closer framings', () => {
    setLive(true);
    let minute = 21 * 60 + 46.5;
    setSkyClock(() => minute / 60);
    try {
      for (const framing of FRAMINGS) {
        lab.set({ programme: 'full-time', framing, wall: 'idle', presenters: false, move: null });
        lab.reset();
        let first = null;
        const changed = new Uint8Array(W * H);
        const states = new Set();
        for (let t = 0; t <= 120; t += 1 / 10) {
          minute = 21 * 60 + 46.5 + t / 60;
          lab.render(t);
          const px = lab.frame.px;
          if (!first) first = Uint32Array.from(px);
          let h = 0;
          for (let j = 0; j < px.length; j++) {
            if (px[j] !== first[j]) changed[j] = 1;
            h = (Math.imul(h, 31) + px[j]) | 0;
          }
          states.add(h);
        }
        let n = 0, x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let j = 0; j < W * H; j++) if (changed[j]) {
          n++;
          const x = j % W, y = (j / W) | 0;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        if (framing !== 'wide') {
          assert.equal(n, 0, `${framing}: ${n} pixels move`);
          continue;
        }
        // the wide: the board's digits and the pennant, on the stand's roof right of the screen
        const bd = LIVE_STATE.board, pn = LIVE_STATE.pennant;
        assert.ok(n > 0 && n <= 60, `${n} moving pixels`);
        assert.ok(x0 >= bd.x0 && x1 < pn.x + 8 * pn.s && y0 >= Math.min(bd.y0, pn.y) && y1 < Math.max(bd.y0 + 5 * bd.s, pn.y + 4 * pn.s),
          `the motion stays on the scoreboard and its pennant: [${x0},${y0}]-[${x1},${y1}]`);
        // three pennant frames x the minutes 21:46, 21:47, 21:48
        assert.ok(states.size >= 3 && states.size <= 9, `${states.size} distinct frames`);
      }
    } finally {
      setSkyClock(null);
    }
  });

  test('the scoreboard shows the channel\'s clock and turns over on the minute, not between', () => {
    setLive(true);
    let v = 21 + 46 / 60;
    setSkyClock(() => v);
    try {
      lab.set({ programme: 'full-time', framing: 'wide', wall: 'idle', presenters: false, move: null });
      lab.reset();
      assert.deepEqual(boardTime(), [2, 1, 4, 6]);
      const frameAt = (hours, t) => {
        v = hours;
        lab.render(t);
        return Uint32Array.from(lab.frame.px);
      };
      // the same pennant frame (t 0.1 and 2.8 are both frame 0), within one minute and across it
      const a = frameAt(21 + 46 / 60, 0.1), b = frameAt(21 + 46 / 60, 2.8), c = frameAt(21 + 47 / 60, 2.8);
      assert.deepEqual(a, b, 'nothing changes within the minute');
      let d = 0;
      for (let i = 0; i < c.length; i++) if (c[i] !== b[i]) d++;
      assert.ok(d >= 2 && d <= 15, `the last digit turns over (${d} px)`);
      // the lit digits are orange dots over the board's unlit (maroon) matrix
      const bd = LIVE_STATE.board;
      let orange = 0, maroon = 0;
      for (let y = bd.y0; y < bd.y0 + 5 * bd.s; y++) for (let x = bd.x0; x < bd.x0 + 17 * bd.s; x++) {
        if (c[y * W + x] === C.orange) orange++;
        if (c[y * W + x] === C.maroon) maroon++;
      }
      assert.ok(orange >= 25 && maroon >= 15, `digits ${orange} lit / ${maroon} unlit dots`);
    } finally {
      setSkyClock(null);
    }
  });

  test('the pennant: three frames, each held 0.9 s, slow', () => {
    assert.equal(PENNANT_FRAMES.length, 3);
    const seq = [];
    for (let t = 0; t < 8.1; t += 0.1) seq.push(pennantFrame(t));
    let run = 1, minRun = Infinity;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === seq[i - 1]) run++;
      else {
        minRun = Math.min(minRun, run);
        run = 1;
      }
    }
    assert.ok(minRun >= 8, `a frame is held ${minRun / 10} s at least`);
    assert.deepEqual([...new Set(seq)].sort(), [0, 1, 2]);
  });

  test('a slow push in every framing: whole-pixel layers, no pixel flips back (no shimmer)', () => {
    setLive(false);
    try {
      for (const h of [23, 12.5]) for (const framing of FRAMINGS) {
        lab.set({ programme: 'full-time', framing, wall: 'idle', presenters: false, hour: h, move: { type: 'push', amount: 0.04, delay: 0, dur: 4 } });
        lab.reset();
        let prev = null, prev2 = null, flips = 0;
        for (let i = 0; i <= 120; i++) {
          lab.render((i / 120) * 4);
          const px = Uint32Array.from(lab.frame.px);
          if (prev2) for (let j = 0; j < W * 150; j++) if (px[j] === prev2[j] && px[j] !== prev[j]) flips++;
          prev2 = prev;
          prev = px;
        }
        assert.equal(flips, 0, `${h} ${framing}: ${flips} flip-backs`);
      }
    } finally {
      lab.set({ move: null });
      setLive(true);
    }
  });
});

describe('FULL TIME: the platform, the scoreboard, the light (the integrator\'s round)', () => {
  test('the raised platform reads in the wide: the deck under the desk, the edge\'s orange light across the frame, the riser\'s panels under it', () => {
    for (const h of [23, 12.5]) {
      const px = shot({ framing: 'wide', hour: h });
      const edge = new Int16Array(W).fill(-1);
      let joints = 0;
      for (let x = 0; x < W; x++) {
        for (let y = 150; y < H; y++) if (px[y * W + x] === C.orange) {
          edge[x] = y;
          break;
        }
        // the strip runs panel by panel: broken for a column at each of the riser's joints
        if (edge[x] < 0 && x > 0 && edge[x - 1] >= 0) {
          joints++;
          edge[x] = edge[x - 1];
          continue;
        }
        if (edge[x] < 0) {
          edge[x] = edge[x + 1 < W ? x + 1 : x - 1];
          joints++;
          continue;
        }
        // (in the wide's free rows: under the captions and the lower third, which end at y 196, over the ticker at 202)
        assert.ok(edge[x] >= 196 && edge[x] <= 200, `${h}: the platform's edge light in column ${x} (row ${edge[x]})`);
        assert.equal(px[(edge[x] + 1) * W + x], C.rust, `${h}: its light on the riser's top row at ${x}`);
        for (let y = edge[x] - 16; y < edge[x]; y++) assert.equal(px[y * W + x], C.ink, `${h}: the deck in front of the desk at ${x},${y}`);
        for (let y = edge[x] + 2; y < H; y++) assert.ok(px[y * W + x] === C.black || px[y * W + x] === C.ink, `${h}: the riser at ${x},${y}`);
      }
      assert.ok(joints >= 3 && joints <= 6, `${h}: the strip broken at the riser's joints (${joints} columns)`);
      // the edge runs straight across (one row), and the riser has its seams, mirrored pairs
      assert.ok(edge.every((y) => y === edge[0]), `${h}: a straight edge`);
      const seams = [];
      for (let x = 0; x < W; x++) if (px[(H - 4) * W + x] === C.ink) seams.push(x);
      assert.ok(seams.length >= 2 && seams.every((x) => seams.includes(383 - x)), `${h}: the riser's seams ${seams}`);
    }
  });

  test('the scoreboard is an object of the ground: on the stand\'s roof, right of the screen, in its frame on legs, its shadow on the roof; not on the frame\'s top bar', () => {
    setLive(true);
    const cam = lab.cameraFor('wide', 'full-time');
    for (const h of [23, 12.5, 18.7]) {
      const px = shot({ framing: 'wide', hour: h });
      const bd = LIVE_STATE.board;
      assert.ok(bd, `${h}: the scoreboard in the wide`);
      const r = wallRect(cam);
      const k = 1000 / (GROUND.stand.Z - cam.z);
      const yRoof = Math.round(cam.hy + (GROUND.stand.roof - cam.y) * k);
      // right of the screen and its mount, on the roof, well under the canopy and the graphics' top row
      assert.ok(bd.x0 - 2 * bd.s >= r.x1 + 6, `${h}: beside the screen, not over it (board x ${bd.x0}, screen to ${r.x1})`);
      assert.ok(bd.y0 >= 20 && bd.y0 + 6 * bd.s < yRoof, `${h}: the board stands over the roof (y ${bd.y0}, roof ${yRoof})`);
      // its two legs reach the roof: the column under each leg is the leg's colour down to the roof row
      const P = PHASE_PALS[groundKey() >> 3];
      const legs = [bd.x0 + bd.s, bd.x0 + 15 * bd.s];
      for (const x of legs) for (let y = bd.y0 + 6 * bd.s; y < yRoof; y++) {
        assert.equal(px[y * W + x], P.boardFrame, `${h}: a leg at ${x},${y}`);
        assert.ok(Math.abs(LSTAR[nameOf(P.boardFrame)] - LSTAR[nameOf(px[y * W + x + 2])]) >= 4, `${h}: the leg stands off the sky beside it at ${x},${y}`);
      }
      // nothing of the board in the top bar's slot (the old place over the screen, under the canopy)
      for (let y = 4; y < 16; y++) for (let x = r.x0; x < r.x1; x++) assert.ok(px[y * W + x] !== C.maroon && px[y * W + x] !== C.orange, `${h}: the slot over the screen is empty at ${x},${y}`);
    }
    // by day the board's shadow breaks the roof's lit edge under it
    const day = shot({ framing: 'wide', hour: 12.5 });
    const bd = LIVE_STATE.board;
    const yRoof = Math.round(cam.hy + (GROUND.stand.roof - cam.y) * (1000 / (GROUND.stand.Z - cam.z)));
    const P = PHASE_PALS[2];
    let shade = 0;
    for (let x = bd.x0; x < bd.x0 + 17 * bd.s; x++) if (day[yRoof * W + x] === P.roof) shade++;
    assert.ok(shade >= 10, `the board's shadow on the roof's edge (${shade} px)`);
    assert.equal(day[yRoof * W + bd.x0 - 6], P.roofEdge, 'the lit edge beside it');
  });

  // the pitch's mean light (L* of the mean luminance, as the eye mixes a checker) over its visible pixels
  const lin = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const lOfY = (Y) => (Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y);
  const pitchLight = (framing, hour) => {
    const bare = shot({ framing, hour });
    lab.set({ presenters: true });
    lab.reset();
    const r = lab.render(10);
    const px = lab.frame.px;
    const m = lab.measure(10);
    const cam = r.cam;
    const kb = 1000 * cam.zoom / (GROUND.boards.Z - cam.z);
    const yP = Math.round(cam.hy + (GROUND.pitchY - cam.y) * kb);
    let n = 0, sum = 0;
    for (let y = Math.max(0, yP + 1); y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (y >= r.clipRows[x] || bare[i] !== px[i]) continue;
      const nm = nameOf(px[i]);
      if (!['green', 'darkGreen', 'black'].includes(nm)) continue;
      n++;
      sum += lin(P[nm]);
    }
    return { L: lOfY(sum / n), n, faces: m.faces };
  };

  test('the day\'s pitch is brighter than the floodlit night\'s, in the wide and in the singles, and stays under every face', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
    for (const framing of ['wide', 'two', 'mcu-l', 'mcu-b']) {
      const day = pitchLight(framing, 12.5), night = pitchLight(framing, 23), dawn = pitchLight(framing, 6.5);
      assert.ok(day.L >= night.L + 8, `${framing}: day ${day.L.toFixed(1)} over night ${night.L.toFixed(1)}`);
      assert.ok(day.L >= dawn.L + 8, `${framing}: day ${day.L.toFixed(1)} over dawn ${dawn.L.toFixed(1)}`);
      for (const f of day.faces) assert.ok(day.L < f, `${framing}: the day's pitch ${day.L.toFixed(1)} under the face ${f.toFixed(1)}`);
    }
  });

  test('the mown stripes: two values, each one colour or a 50 % mix of two adjacent steps (no busy dither); no stripe edge within 6 px of a head in any framing', () => {
    // the values
    for (const P of PHASE_PALS) for (const [a, b] of P.pitch) {
      const la = LSTAR[nameOf(a)], lb = LSTAR[nameOf(b)];
      assert.ok(a === b || Math.abs(la - lb) <= 40, `a mix of neighbours (${nameOf(a)}/${nameOf(b)})`);
    }
    // in the wide by day: each stripe is one colour or a checker, half and half
    const px = shot({ framing: 'wide', hour: 12.5 });
    const y = 100;
    const runs = {};
    for (let x = 150; x < 234; x++) runs[nameOf(px[y * W + x])] = (runs[nameOf(px[y * W + x])] || 0) + 1;
    const g = runs.green || 0, d = runs.darkGreen || 0;
    assert.ok(g > 10 && Math.abs(g - d) <= 0.2 * (g + d) + 4, `the centre stripe a 50 % checker by day (${JSON.stringify(runs)})`);
    // the edges, from the ground's geometry, against the presenters' heads (crown to shoulders) in every framing
    const edgesX = [0];
    for (let n = 0; n < 8; n++) edgesX.push(GROUND.stripe.centre / 2 + n * GROUND.stripe.width, -(GROUND.stripe.centre / 2 + n * GROUND.stripe.width));
    for (const framing of ['wide', 'two', 'ots', 'ots-b', 'mcu-l', 'mcu-b']) {
      const a = shot({ framing, hour: 23 });
      lab.set({ presenters: true });
      lab.reset();
      const r = lab.render(10);
      const b = lab.frame.px;
      const cam = r.cam;
      const head = new Uint8Array(W * H), person = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) if (a[i] !== b[i]) person[i] = 1;
      for (const hd of r.heads) {
        const x0 = Math.max(0, Math.round(hd.cx - 40 * hd.s)), x1 = Math.min(W, Math.round(hd.cx + 40 * hd.s));
        let crown = -1, hw = 0;
        for (let yy = 0; yy < H; yy++) {
          let lo = W, hi = -1;
          for (let x = x0; x < x1; x++) if (person[yy * W + x]) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
          }
          if (hi < 0) {
            if (crown >= 0) break;
            continue;
          }
          if (crown < 0) crown = yy;
          if (yy - crown < 12 * hd.s) hw = Math.max(hw, hi - lo + 1);
          else if (hi - lo + 1 > hw * 1.5) break;
          for (let x = lo; x <= hi; x++) if (person[yy * W + x]) head[yy * W + x] = 1;
        }
      }
      const kb = 1000 * cam.zoom / (GROUND.boards.Z - cam.z);
      const yP = Math.round(cam.hy + (GROUND.pitchY - cam.y) * kb);
      const dY = GROUND.pitchY - cam.y;
      for (let yy = Math.max(0, yP); yy < H; yy++) {
        const kr = (yy + 0.5 - cam.hy) / dY;
        if (kr <= 0) continue;
        for (const X of edgesX) {
          const x = Math.round(192 + (X - cam.x) * kr);
          if (x < 0 || x >= W || yy >= r.clipRows[x] || person[yy * W + x]) continue;
          for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
            const xx = x + dx, y2 = yy + dy;
            if (xx < 0 || y2 < 0 || xx >= W || y2 >= H || Math.hypot(dx, dy) > 6) continue;
            assert.ok(!head[y2 * W + xx], `${framing}: a stripe edge (X ${X}) at ${x},${yy} within 6 px of a head`);
          }
        }
      }
    }
  });

  test('the golden hour\'s lit banks glare as the blue hour\'s do; the over-the-shoulder\'s sky bands never cross behind a head', () => {
    const cam = lab.cameraFor('wide', 'full-time');
    const near = TOWER_LIST.find((t) => t.kind === 'near' && t.X < 0);
    const hd = towerHead(cam, near);
    const ring = (fn) => {
      let n = 0, rise = 0;
      for (let y = Math.floor(hd.cy - hd.R); y <= Math.ceil(hd.cy + hd.R); y++) for (let x = Math.floor(hd.cx - hd.R); x <= Math.ceil(hd.cx + hd.R); x++) {
        if (x < 0 || y < 0 || (x >= hd.x0 && x < hd.x0 + hd.w && y >= hd.y0 && y < hd.y0 + hd.h)) continue;
        const d = fn(y * W + x);
        if (d > 0) {
          n++;
          rise += d;
        }
      }
      return { n, rise: n ? rise / n : 0 };
    };
    // the golden hour: the lit frame (four banks, 18:42) against the same sky with the banks still off (17:03)
    const off = shot({ framing: 'wide', hour: 17.05 }), on = shot({ framing: 'wide', hour: 18.7 });
    const golden = ring((i) => LSTAR[nameOf(on[i])] - LSTAR[nameOf(off[i])]);
    // the blue hour: the halo's colours over its navy sky
    const blueFrame = shot({ framing: 'wide', hour: 20 });
    const blue = ring((i) => (blueFrame[i] === C.steel || blueFrame[i] === C.fog ? LSTAR[nameOf(blueFrame[i])] - LSTAR.navy : 0));
    assert.ok(golden.n >= 0.8 * blue.n && golden.rise >= 5, `golden: ${golden.n} pixels lifted ${golden.rise.toFixed(1)} L*; blue hour: ${blue.n} lifted ${blue.rise.toFixed(1)}`);
    // the over-the-shoulder (the horizon at the shoulders): one sky band behind each head, crown to neck
    for (const h of Object.values(HOURS)) for (const framing of ['ots', 'ots-b']) {
      const px = shot({ framing, hour: h });
      lab.set({ presenters: true });
      lab.reset();
      const { cam: c, heads } = lab.render(10);
      const P = PHASE_PALS[groundKey() >> 3];
      const k = 1000 * c.zoom / (GROUND.stand.Z - c.z);
      const yRoof = Math.round(c.hy + (GROUND.stand.roof - c.y) * k); // (the sky only: above the stand's roof)
      for (const hh of heads) {
        if (hh.cx < 0 || hh.cx >= W) continue;
        const seen = new Set();
        for (let y = Math.max(0, Math.floor(hh.cy - 16 * hh.s)); y < Math.min(yRoof, Math.ceil(hh.cy + 12 * hh.s)); y++) {
          for (const x of [Math.floor(hh.cx - 14 * hh.s), Math.ceil(hh.cx + 14 * hh.s)]) {
            if (x < 0 || x >= W) continue;
            // (not a floodlight's head, mast or glare: only the sky)
            if (TOWER_LIST.some((t) => {
              const th = towerHead(c, t);
              return Math.hypot(x + 0.5 - th.cx, y + 0.5 - th.cy) < th.R + 2 || Math.abs(x + 0.5 - th.cx) < th.w / 2 + 1;
            })) continue;
            const v = px[y * W + x];
            if (P.sky.includes(v)) seen.add(v);
          }
        }
        assert.ok(seen.size <= 1, `${h} ${framing}: ${[...seen].map(nameOf)} behind the head`);
      }
    }
  });

  test('the singles\' ground out of focus: the stripes\' two values and the halfway line, not a flat plane', () => {
    for (const h of [23, 12.5]) for (const framing of ['mcu-l', 'mcu-b']) {
      const px = shot({ framing, hour: h });
      const cam = lab.cameraFor(framing, 'full-time');
      const P = PHASE_PALS[groundKey() >> 3];
      const kb = 1000 * cam.zoom / (GROUND.boards.Z - cam.z);
      const yP = Math.round(cam.hy + (GROUND.pitchY - cam.y) * kb);
      const counts = {};
      let line = 0;
      for (let y = yP + 2; y < H; y++) for (let x = 0; x < W; x++) {
        const c = px[y * W + x];
        counts[nameOf(c)] = (counts[nameOf(c)] || 0) + 1;
        if (c === P.softLine) line++;
      }
      const values = P.pitch.flat().map(nameOf);
      assert.ok(values.every((n) => (counts[n] || 0) > 200), `${h} ${framing}: both stripes' colours (${JSON.stringify(counts)})`);
      assert.ok(line >= H - yP - 10, `${h} ${framing}: the halfway line, out of focus (${line} px)`);
    }
  });
});

describe('FULL TIME: the presenters in the ground', { skip: !PRESENTERS && 'presenter modules unavailable' }, () => {
  test('in every phase and framing the faces stay the brightest thing: head zone 12-45 L*, faces at least 15 over it', () => {
    for (const [name, h] of Object.entries(HOURS)) {
      for (const framing of FRAMINGS) {
        lab.set({ programme: 'full-time', framing, wall: 'idle', presenters: true, hour: h, move: null });
        lab.reset();
        const r = lab.measure(10);
        assert.ok(r.faces.length >= 1, `${name} ${framing}: a face`);
        assert.ok(r.headZone.mean >= 12 && r.headZone.mean <= 45, `${name} ${framing}: zone ${r.headZone.mean.toFixed(1)}`);
        for (const f of r.faces) assert.ok(f >= r.headZone.mean + 15, `${name} ${framing}: face ${f.toFixed(1)} zone ${r.headZone.mean.toFixed(1)}`);
      }
    }
  });

  test('signs whole or not at all: the FULL TIME bands clear of every person, the frame, the screen and the graphics\' top row', () => {
    for (const h of [23, 12.5]) for (const framing of [...FRAMINGS, 'single-a', 'single-b']) {
      lab.set({ programme: 'full-time', framing, wall: 'idle', presenters: true, hour: h, move: null });
      lab.reset();
      const { cam, heads } = lab.render(10);
      const px = lab.frame.px;
      // find the bands: runs of orange at least 20 px wide on one row (the desk line is on the desk, below them)
      const k = 1000 * cam.zoom / (GROUND.boards.Z - cam.z);
      const y0 = Math.round(cam.hy + (GROUND.boards.top - cam.y) * k), y1 = Math.round(cam.hy + (GROUND.pitchY - cam.y) * k);
      const row = Math.round((y0 + y1) / 2);
      if (row < 0 || row >= H) continue;
      const orangeNear = (x) => {
        for (let i = x; i < Math.min(W, x + 4); i++) if (px[row * W + i] === C.orange) return true;
        return false;
      };
      for (let x = 0; x < W; x++) {
        if (px[row * W + x] !== C.orange) continue;
        // a band: orange with its dark type (gaps under 4 px)
        let e = x;
        while (e < W && orangeNear(e)) e++;
        for (const hd of heads) {
          const s = hd.s;
          const box = { x0: hd.cx - 36 * s, x1: hd.cx + 36 * s, y0: hd.cy - 20 * s };
          assert.ok(!(x < box.x1 && e > box.x0 && row > box.y0), `${h} ${framing}: a band behind a person at x ${x}`);
        }
        assert.ok(x >= 1 && e <= W - 1, `${h} ${framing}: a band cut by the frame`);
        x = e;
      }
    }
  });
});

describe('FULL TIME: the side screen (full-time.md §6: pictures and the idle emblem)', () => {
  const images = new Map([['s1', { full: { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(128) } }]]);
  const base = { program: { id: 'full-time' }, cast: { A: 'kai', B: 'rosa' }, images, focus: 'A' };
  const seg = (o, shots = []) => ({ segPlan: { ctx: { seg: { type: 'story', ...o }, shots } } });
  test('a story\'s picture; else the emblem (never a map, a plate or a story\'s number such as an age)', () => {
    assert.equal(wallFromScene({ ...base, wall: { mode: 'image', storyId: 's1' }, storyId: 's1', ...seg({ storyId: 's1' }) }).mode, 'picture');
    const age = wallFromScene({ ...base, wall: { mode: 'source', source: 'BBC Sport' }, storyId: 's2', ...seg({ storyId: 's2', kicker: 'TENNIS', numbers: [{ value: '19', label: '19-YEAR-OLD' }], location: { place: 'MELBOURNE', lat: -37.8, lon: 145 } }) });
    assert.equal(age.mode, 'idle');
    assert.equal(age.figure, null);
    assert.equal(wallFromScene({ ...base, wall: { mode: 'source', source: 'ESPN' }, storyId: 's3', ...seg({ storyId: 's3', kicker: 'NBA', fact: 'Three titles in four years' }) }).mode, 'idle');
    assert.equal(wallFromScene({ ...base, wall: { mode: 'figure', figure: { value: '22' } }, storyId: 's6', ...seg({ storyId: 's6' }) }).mode, 'idle', 'a passed-through figure too');
  });
  test('THE NUMBER\'s own segment may show its figure (the number of the day), unless its card shows it', () => {
    const n = wallFromScene({ ...base, wall: { mode: 'source', source: 'Sky Sports' }, storyId: 's4', ...seg({ storyId: 's4', feature: 'number', kicker: 'THE NUMBER', numbers: [{ value: '25', label: 'YEARS' }] }) });
    assert.equal(n.mode, 'figure');
    assert.equal(n.figure.value, '25');
    const carded = wallFromScene({ ...base, wall: { mode: 'source', source: 'Sky Sports' }, storyId: 's5', ...seg({ storyId: 's5', feature: 'number', kicker: 'THE NUMBER', numbers: [{ value: '25', label: 'YEARS' }] }, [{ shot: 'fact' }]) });
    assert.equal(carded.mode, 'idle');
  });
  test('the other programmes keep their walls (WORLD NOW still shows a story\'s figure)', () => {
    const w = wallFromScene({ ...base, program: { id: 'world-now' }, cast: { A: 'paco', B: 'lola' }, wall: { mode: 'source', source: 'BBC' }, storyId: 's7', ...seg({ storyId: 's7', numbers: [{ value: '40,000', label: 'PASSENGERS' }] }) });
    assert.equal(w.mode, 'figure');
  });
});

describe('FULL TIME: frame cost', () => {
  test('the uncached ground (a moving camera) costs less than WORLD NOW\'s city; a still camera is a cached copy', () => {
    setSkyHour(23);
    const cost = (programme) => {
      lab.set({ programme, framing: 'wide', wall: 'idle', presenters: false, move: null });
      return lab.profile(60);
    };
    cost('full-time');
    const ft = cost('full-time'), wn = cost('world-now');
    assert.ok(ft.bgUncached < wn.bgUncached, `FULL TIME ${ft.bgUncached.toFixed(3)} ms, WORLD NOW ${wn.bgUncached.toFixed(3)} ms`);
    assert.ok(ft.bgCached < ft.bgUncached / 4, `cached ${ft.bgCached.toFixed(3)} ms`);
  });
});

// FULL TIME's set, the pitchside platform (docs/programmes/full-time.md §6, build step 5; critique log
// docs/roadmap/critique/full-time-set.md): the ground by the hour and its floodlight banks, the still crowd, the only two
// motions (the scoreboard's minute and the pennant), signs whole or not at all and never behind a person, values that
// keep the faces the brightest thing in every phase and framing, no shimmer under the camera's moves, the side screen's
// rule (pictures and the emblem), and a frame cost below WORLD NOW's. Rendered in node through the set lab.
import { describe, test, after } from 'node:test';
import assert from 'node:assert/strict';
import { C } from '../public/js/v2/canvas25d/pixbuf.js';
import { styleFor, STYLE_IDS } from '../public/js/v2/canvas25d/studio/styles.js';
import { wallFromScene, setLive, setSkyHour, setSkyClock, wallRect } from '../public/js/v2/canvas25d/studio/set.js';
import { GROUND, groundKey, banksLit, boardTime, towerHead, TOWER_LIST, PHASE_PALS, PENNANT_FRAMES, pennantFrame } from '../public/js/v2/canvas25d/studio/pitch.js';
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
      const px = shot({ framing: 'wide', hour: h });
      for (let y = 150; y < H; y++) for (let x = 0; x < W; x++) assert.ok(px[y * W + x] === C.black || px[y * W + x] === C.ink, `${h}: ${x},${y} ${nameOf(px[y * W + x])} in the graphics zone`);
    }
  });

  test('the set is symmetric about x = 192 in every phase (8x8 blocks, the dressing on, outside the wall)', () => {
    for (const h of Object.values(HOURS)) {
      const px = shot({ framing: 'wide', hour: h });
      const r = wallRect(lab.cameraFor('wide', 'full-time'));
      let bad = 0;
      for (let by = 0; by < 112; by += 8) for (let bx = 0; bx + 8 <= r.x0 - 3; bx += 8) {
        let a = 0, b = 0;
        for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
          a += LSTAR[nameOf(px[y * W + x])];
          b += LSTAR[nameOf(px[y * W + (383 - x)])];
        }
        if (Math.abs(a - b) / 64 > 3) bad++;
      }
      assert.equal(bad, 0, `${h}: ${bad} asymmetric blocks`);
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
        // the wide: the board's digits and the pennant, in the slot over the screen (x 160-224, y 3-14)
        assert.ok(n > 0 && n <= 60, `${n} moving pixels`);
        assert.ok(x0 >= 160 && x1 < 224 && y0 >= 3 && y1 < 15, `the motion stays in the scoreboard slot: [${x0},${y0}]-[${x1},${y1}]`);
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
      let orange = 0, maroon = 0;
      for (let y = 3; y < 15; y++) for (let x = 160; x < 210; x++) {
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

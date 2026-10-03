// PRESENTERS B (max, ada, nova, unit8): looks, palette, ownership, UNIT-8's
// eyes and speech indicator, silhouettes. Renders in node (pixbuf Frame works
// without ImageData), so everything here is measured on real pixels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { P } from '../public/js/palette.js';
import { C, Frame, PartBuffer } from '../public/js/v2/canvas25d/pixbuf.js';
import { drawCharacter } from '../public/js/v2/canvas25d/character.js';
import { poseAt } from '../public/js/v2/canvas25d/rig.js';
import { buildSpeech } from '../public/js/v2/canvas25d/visemes.js';
import { OUTFITS } from '../public/js/v2/canvas25d/cast/outfit.js';
import { LOOKS } from '../public/js/v2/canvas25d/cast/index.js';
import { max } from '../public/js/v2/canvas25d/cast/max.js';
import { ada } from '../public/js/v2/canvas25d/cast/ada.js';
import { nova } from '../public/js/v2/canvas25d/cast/nova.js';
import { liveSpeech, sampleSpeech } from '../public/js/v2/canvas25d/speech.js';
import { speechFrame } from '../public/js/v2/canvas25d/visemes.js';
import { frame as sceneFrame, drawActors, actor } from '../public/js/v2/canvas25d/scene.js';
import {
  unit8, CASE, VISOR, EYE, eyeWidth, eyeHeight, indicatorWidth, indicatorSpec, widthAtTick, INDICATOR, bandRows,
  indicatorAtRest,
} from '../public/js/v2/canvas25d/cast/unit8.js';

const B = { max, ada, nova, unit8 };
const W = 384, H = 216;
const PALETTE = new Set(Object.values(C));

// ---------------------------------------------------------------------------
// rendering helpers (one presenter, static pose, neck base at 192,116 as in cast.html's static demo)

const frame = new Frame();
const parts = new PartBuffer();
function render(L, s, t = 0, { side = 1, yaw, lag, speech = null, face = null } = {}) {
  frame.clear(C.ink);
  parts.clear();
  const a = { id: L.id, look: L, perf: { side, seed: 11, gestures: [], emotions: [], look: [], speech } };
  const sk = poseAt(a, t);
  if (yaw !== undefined) sk.head.yaw = yaw;
  if (lag !== undefined) sk.hairLag = lag;
  sk.face.t = t;
  sk.face.speech = speech;
  if (face) Object.assign(sk.face, face);
  const head = drawCharacter(parts, L, sk, { x: 192, y: 116, s, gb: 0, clip: false });
  parts.resolve(frame);
  return { px: Uint32Array.from(frame.px), head };
}
const count = (px, c, box = null) => {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (box && (x < box[0] || y < box[1] || x >= box[2] || y >= box[3])) continue;
    if (px[y * W + x] === c) n++;
  }
  return n;
};

// a speech source with a constant level (what audio.speechFrame would report for a sustained vowel)
const constSource = (level) => {
  const fr = { speaking: level > 0, level, viseme: level > 0 ? 'AH' : 'rest', next: level > 0 ? 'AH' : 'rest', mix: 0, accent: 0, emph: 0, sentenceIndex: 0, charIndex: 0, wordIndex: 0 };
  return { frame: () => fr };
};

// ---------------------------------------------------------------------------

test('the four looks are registered under their ids and validate', () => {
  for (const [id, L] of Object.entries(B)) {
    assert.equal(LOOKS[id], L, `${id} registered in cast/index.js`);
    assert.equal(L.id, id);
    for (const k of ['name', 'head', 'headAt', 'neck', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'skin', 'skinLine', 'hair', 'torso', 'outfit', 'jacket', 'shirt', 'cuff', 'arm', 'persona']) {
      assert.ok(L[k] !== undefined && L[k] !== null, `${id}.${k}`);
    }
    for (const k of ['top', 'craniumY', 'R', 'cheekY', 'cheekHW', 'chinY', 'chinHW', 'jawPow']) assert.equal(typeof L.head[k], 'number', `${id}.head.${k}`);
    for (const k of ['neckHW', 'shoulderTop', 'shoulderHW', 'sideHW', 'bottom', 'vDepth']) assert.equal(typeof L.torso[k], 'number', `${id}.torso.${k}`);
    for (const k of ['sway', 'headMotion', 'blinkMin', 'blinkMax', 'energy', 'smile']) assert.equal(typeof L.persona[k], 'number', `${id}.persona.${k}`);
    assert.equal(L.skin.length, 4);
    assert.equal(L.hair.ramp.length, 4);
    assert.equal(typeof L.parts.hair, 'function', `${id}.parts.hair`);
    assert.ok(OUTFITS[L.outfit], `${id} outfit '${L.outfit}' is registered`);
  }
  assert.equal(typeof unit8.parts.head, 'function');
  assert.equal(typeof unit8.parts.face, 'function');
  assert.equal(unit8.handStyle, 'robot');
  assert.ok(ada.glasses && ada.glasses.style && ada.glasses.ramp.length === 4, 'Ada wears glasses');
  assert.equal(typeof ada.parts.over, 'function', 'Ada draws glasses from parts.over');
  assert.ok(!nova.glasses && !max.glasses && !unit8.glasses);
  // adult proportions: head about half the shoulder width or less (no big-head mascots)
  for (const L of [max, ada, nova]) {
    const headH = L.head.chinY - L.head.top;
    assert.ok(headH / (2 * L.torso.shoulderHW) < 0.55, `${L.id} head ${headH} on shoulders ${2 * L.torso.shoulderHW}`);
  }
});

test('every colour comes from the palette (s 1 / 2.7 / 5, both seats, a turn)', () => {
  for (const L of Object.values(B)) {
    for (const s of [1, 2.7, 5]) {
      for (const opts of [{ side: 1 }, { side: -1, yaw: 0.45, lag: 1.2 }]) {
        const { px } = render(L, s, 1.3, opts);
        let bad = 0;
        for (const c of px) if (!PALETTE.has(c)) bad++;
        assert.equal(bad, 0, `${L.id} s=${s}: ${bad} off-palette pixels`);
      }
    }
  }
});

test('palette-only and no accent colours across gestures, emotions and speech (s 1.37 / 3.4, both seats)', async () => {
  const { GESTURES } = await import('../public/js/v2/canvas25d/gestures/index.js');
  const names = Object.keys(GESTURES);
  const pick = names.filter((_, i) => i % Math.max(1, Math.floor(names.length / 6)) === 0).slice(0, 6);
  const sp = buildSpeech('Forty thousand tonnes of dust reach the Earth every year.', { t0: 0.2 });
  const neutral = new Set([C.black, C.ink, C.slate, C.steel, C.fog, C.silver, C.white]);
  for (const [id, L] of Object.entries(B)) {
    for (const s of [1.37, 3.4]) {
      for (const side of [1, -1]) {
        for (const g of pick) {
          for (const emo of [null, 'happy', 'concerned']) {
            frame.clear(C.ink);
            parts.clear();
            const a = { id, look: L, perf: { side, seed: 7, gestures: [{ name: g, t0: 0.2 }], emotions: emo ? [{ t0: 0, name: emo }] : [], look: [], speech: emo === 'happy' ? sp : null } };
            const sk = poseAt(a, 1.1);
            sk.face.t = 1.1;
            sk.face.speech = a.perf.speech;
            drawCharacter(parts, L, sk, { x: 192, y: 116, s, gb: 0, clip: false });
            parts.resolve(frame);
            for (const c of frame.px) {
              if (c === C.ink) continue;
              assert.ok(PALETTE.has(c), `${id} ${g}: off-palette colour`);
              assert.ok(c !== C.cyan, `${id} ${g}: cyan`);
              // (owner polish round, 3 Oct: Nova's plum cardigan is COSMOS's purple; no magenta or pink on her)
              if (id === 'nova') assert.ok(c !== C.magenta && c !== C.pink, `nova ${g}: accent pixel`);
              // UNIT-8: neutral but for the small status light on the antenna's tip (owner polish round)
              if (id === 'unit8') assert.ok(neutral.has(c) || c === C.magenta || c === C.pink, `unit8 ${g}: a coloured pixel`);
            }
          }
        }
      }
    }
  }
});

test("no presenter-B file imports PRESENTERS A's presenter files", () => {
  const dir = new URL('../public/js/v2/canvas25d/cast/', import.meta.url);
  for (const f of ['max.js', 'ada.js', 'nova.js', 'unit8.js', 'wardrobe-b.js']) {
    const src = fs.readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /from\s+['"]\.\/(paco|lola|sam|penny)\.js['"]/, f);
    assert.doesNotMatch(src, /deriveLook\(/, `${f} is its own design, not a derived placeholder`);
  }
});

test('drawing is deterministic and every part reads at the three LOD tiers', () => {
  for (const L of Object.values(B)) {
    for (const s of [1.0, 1.8, 3.0]) {
      const a = render(L, s, 2.2).px, b = render(L, s, 2.2).px;
      assert.deepEqual(a, b, `${L.id} s=${s} deterministic`);
      // the hair / casing material is drawn at every tier
      let hair = 0;
      const id = parts.mat;
      for (let i = 0; i < id.length; i++) if (id[i]) hair++;
      assert.ok(hair > 50 * s, `${L.id} drew at s=${s}`);
    }
  }
});

test('hair follow-through: sk.hairLag moves the hair of max, ada and nova', () => {
  for (const L of [max, ada, nova]) {
    const a = render(L, 3.0, 0.5, { lag: 0 }).px;
    const b = render(L, 3.0, 0.5, { lag: 1.6 }).px;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    assert.ok(diff > 6, `${L.id}: ${diff} pixels follow through`);
  }
});

test("Nova's wardrobe has no P.magenta or P.pink (her cardigan is COSMOS's deep purple, owner polish round), in data and in pixels", () => {
  const banned = [P.magenta, P.pink];
  const ramps = [nova.jacket.ramp, nova.shirt.ramp, nova.hair.ramp, nova.skin, [nova.cuff], nova.necklace || [], ...Object.values(nova.mats || {}).map((m) => m.ramp)];
  for (const r of ramps) for (const c of r) assert.ok(!banned.includes(c), `nova uses ${c}`);
  for (const s of [1, 2.7, 5]) {
    const { px } = render(nova, s, 0.8);
    assert.equal(count(px, C.magenta) + count(px, C.pink), 0, `nova s=${s}`);
    assert.ok(count(px, C.purple) > 0, `nova s=${s}: the plum cardigan`);
  }
});

test('no cyan on any presenter B (TECH BYTES accent belongs to the graphics; never on UNIT-8)', () => {
  for (const L of Object.values(B)) {
    for (const s of [1, 2.15, 4]) {
      const { px } = render(L, s, 0.6, { speech: constSource(0.6) });
      assert.equal(count(px, C.cyan), 0, `${L.id} s=${s}`);
    }
  }
});

// ---------------------------------------------------------------------------
// UNIT-8

/** Rows and runs of the slit colours (white / silver) inside the sensor band, around the left slit. */
function slits(px, head, s) {
  // around the left slit only (inside the band; the lit casing next to it may be silver too)
  const x0 = Math.round(head.cx - (EYE.x + 1.9) * s) - 1, x1 = Math.round(head.cx - (EYE.x - 1.9) * s) + 1;
  const B = bandRows(head.cy, s);
  const rows = new Set();
  let run = 0, bestRun = 0;
  for (let y = B.top; y < B.groove - (s < 1.35 ? 0 : 1); y++) {
    run = 0;
    for (let x = x0; x <= x1; x++) {
      const c = px[y * W + x];
      const lit = c === C.white || c === C.silver;
      if (lit && x < head.cx) rows.add(y);
      run = lit && x < head.cx ? run + 1 : 0;
      if (run > bestRun) bestRun = run;
    }
  }
  return { rows: rows.size, width: bestRun };
}

test('UNIT-8 slits: 2 px tall at close-up, 1 px in the wide; ~12 % of the head width; no pupils', () => {
  for (const s of [2.2, 2.7, 3.4, 4, 5]) {
    const { px, head } = render(unit8, s, 0.3);
    const sl = slits(px, head, s);
    assert.equal(sl.rows, 2, `s=${s}: ${sl.rows} rows`);
    assert.equal(eyeHeight(s), 2);
    const target = EYE.share * 2 * CASE.hw * s;
    assert.ok(Math.abs(sl.width - target) <= 1, `s=${s}: slit ${sl.width} px vs 12 % = ${target.toFixed(2)}`);
    // the top row is white, the bottom silver (no pupil: no dark pixel inside a slit row)
    assert.ok(count(px, C.white, [head.cx - CASE.hw * s, head.cy - 5 * s, head.cx, head.cy]) > 0);
  }
  for (const s of [1, 1.2, 1.3]) {
    const { px, head } = render(unit8, s, 0.3);
    const sl = slits(px, head, s);
    assert.equal(sl.rows, 1, `s=${s}: ${sl.rows} rows`);
    const target = EYE.share * 2 * CASE.hw * s;
    assert.ok(Math.abs(sl.width - target) <= 1, `s=${s}: slit ${sl.width} px vs ${target.toFixed(2)}`);
  }
  // processing (the 'thinking' face) = 1 px at close-up; the blink is a dim to fog (no closing)
  const proc = render(unit8, 3.4, 0.3, { face: { lid: 0.2, squint: 0.1, smile: 0 } });
  assert.equal(slits(proc.px, proc.head, 3.4).rows, 1);
  const dim = render(unit8, 3.4, 0.3, { face: { blink: 1 } });
  assert.equal(slits(dim.px, dim.head, 3.4).rows, 0, 'dimmed slits are fog, not silver');
  assert.ok(count(dim.px, C.fog, [dim.head.cx - 8 * 3.4, dim.head.cy - 3 * 3.4, dim.head.cx + 8 * 3.4, dim.head.cy]) >= 2 * eyeWidth(3.4));
});

test('UNIT-8 indicator: one odd-width line, wider for a voice than for silence', () => {
  for (const s of [1, 2.7, 4]) {
    const { max: wmax } = indicatorSpec(s);
    const quiet = indicatorWidth({ t: 3, speech: constSource(0) }, s);
    const loud = indicatorWidth({ t: 3, speech: constSource(0.8) }, s);
    assert.equal(quiet, 1);
    assert.equal(loud % 2, 1, 'odd');
    assert.ok(loud > quiet && loud <= wmax, `s=${s}: ${quiet} → ${loud} (max ${wmax})`);
    // and on the rendered frame: the indicator row holds exactly that many lit pixels
    const { px, head } = render(unit8, s, 3, { speech: constSource(0.8) });
    const y = bandRows(head.cy, s).groove;
    // the lit run through the visor centre
    const lit = (x) => px[y * W + x] === C.silver || px[y * W + x] === C.fog;
    let a = Math.round(head.cx), b = a;
    while (lit(a - 1)) a--;
    while (lit(b + 1)) b++;
    const n = lit(Math.round(head.cx)) ? b - a + 1 : 0;
    assert.equal(n, loud, `s=${s}: ${n} indicator pixels`);
  }
  assert.ok(indicatorSpec(4).max === 13 && indicatorSpec(1).max === 5);
});

test('UNIT-8 indicator: ≤ 12 updates/s (8 in the wide), ≤ 4 px per update, pure in t', () => {
  const line = 'Forty thousand tonnes. Noted, Dr Reyes. The figure is exact, to the nearest tonne, as published.';
  for (const s of [1, 2.7]) {
    const sp = buildSpeech(line, { t0: 0.3 });
    const { rate } = indicatorSpec(s);
    const step = 1 / 240;
    const widths = [];
    let changes = [];
    let prev = null;
    for (let t = 0; t < sp.t1 + 1; t += step) {
      const w = indicatorWidth({ t, speech: sp }, s);
      assert.equal(w % 2, 1);
      if (prev !== null && w !== prev) {
        assert.ok(Math.abs(w - prev) <= INDICATOR.maxStep, `s=${s} t=${t.toFixed(3)}: ${prev} → ${w}`);
        changes.push(t);
      }
      prev = w;
      widths.push(w);
    }
    assert.ok(changes.length > 4, `s=${s}: the indicator moves (${changes.length} changes)`);
    // at most `rate` changes in any 1 s window
    for (let i = 0; i < changes.length; i++) {
      let n = 0;
      for (let j = i; j < changes.length && changes[j] < changes[i] + 1 - 1e-9; j++) n++;
      assert.ok(n <= rate, `s=${s}: ${n} updates within 1 s (max ${rate})`);
    }
    // pure: a fresh copy of the same timeline sampled in a shuffled order gives the same widths
    const sp2 = buildSpeech(line, { t0: 0.3 });
    const order = widths.map((_, i) => i).sort((a, b) => ((a * 7919) % 1009) - ((b * 7919) % 1009));
    for (const i of order.slice(0, 400)) assert.equal(indicatorWidth({ t: i * step, speech: sp2 }, s), widths[i], `t=${(i * step).toFixed(3)}`);
    // at rest after the line (1 px, steel)
    assert.ok(widthAtTick(sp, Math.floor((sp.t1 + 0.5) * rate), s) === 1);
    indicatorWidth({ t: sp.t1 + 0.5, speech: sp }, s);
    assert.ok(indicatorAtRest(), 'steel rest after the line');
  }
});

// a live source with the v2 stage's semantics (runtime/stage.js: the proxy returns the CURRENT frame for
// any time asked), fed from a built timeline frame by frame
function stageLive(tl) {
  const cur = { slot: 0, speaking: false, level: 0, viseme: 'rest', next: 'rest', mix: 0, wordIndex: -1, charIndex: -1, sentenceIndex: -1, accent: 0, pause: false };
  const proxy = { speechFrame: (ms, slot, out) => Object.assign(out, cur) };
  const feed = (t) => {
    const fr = speechFrame(tl, t, null);
    Object.assign(cur, { speaking: fr.speaking, level: fr.level, viseme: fr.viseme, next: fr.next, mix: fr.mix, wordIndex: fr.wordIndex ?? -1, charIndex: fr.charIndex ?? -1, sentenceIndex: fr.sentenceIndex ?? -1, accent: fr.accent || 0, pause: !!fr.pause });
  };
  return { live: liveSpeech(proxy, 0), feed };
}

test('UNIT-8 indicator on a live source (the v2 stage): same limits, and it never disturbs the shared source', () => {
  const line = 'Forty thousand tonnes. Noted, Dr Reyes. The figure is exact, to the nearest tonne, as published.';
  const tl = buildSpeech(line, { t0: 0.3 });
  for (const s of [1, 2.7]) {
    const { rate, max: wmax } = indicatorSpec(s);
    const A = stageLive(tl), Bsrc = stageLive(tl);
    const changes = [];
    let prev = null, maxW = 1, diverged = 0;
    for (let k = 0; k * (1 / 60) < tl.t1 + 1; k++) {
      const t = k / 60;
      A.feed(t);
      Bsrc.feed(t);
      const fa = sampleSpeech(A.live, t);
      sampleSpeech(Bsrc.live, t);
      const w = indicatorWidth({ t, speech: A.live, level: fa.env, speaking: fa.speaking }, s);
      assert.equal(w % 2, 1);
      assert.ok(w >= 1 && w <= wmax);
      if (prev !== null && w !== prev) {
        assert.ok(Math.abs(w - prev) <= INDICATOR.maxStep, `s=${s} t=${t.toFixed(3)}: ${prev} → ${w}`);
        changes.push(t);
      }
      prev = w;
      maxW = Math.max(maxW, w);
      // the source the indicator read is in exactly the state of one nobody else read
      const a = sampleSpeech(A.live, t), b = sampleSpeech(Bsrc.live, t);
      for (const key of ['act', 'env', 'startAt', 'sentAt', 'endAt', 'pauseAt']) if (Math.abs((a[key] ?? 0) - (b[key] ?? 0)) > 1e-9) diverged++;
    }
    assert.equal(diverged, 0, `s=${s}: the live source diverged in ${diverged} reads`);
    assert.ok(maxW >= 5, `s=${s}: the indicator follows the voice (max ${maxW})`);
    for (let i = 0; i < changes.length; i++) {
      let n = 0;
      for (let j = i; j < changes.length && changes[j] < changes[i] + 1 - 1e-9; j++) n++;
      assert.ok(n <= rate, `s=${s}: ${n} updates within 1 s (max ${rate})`);
    }
  }
});

test('UNIT-8 indicator never turns on and off within 120 ms (rendered rows, pure and live, 60 fps)', () => {
  const lines = [
    'Forty thousand tonnes. Noted, Dr Reyes. The figure is exact, to the nearest tonne, as published.',
    'No. Yes. Noted. Dr Reyes, no. Exact. Correct.',
  ];
  for (const line of lines) {
    const tl = buildSpeech(line, { t0: 0.3 });
    for (const mode of ['pure', 'live']) {
      for (const s of [3.4, 1]) {
        const L = stageLive(tl);
        const a = { id: 'unit8', look: unit8, perf: { side: -1, seed: 43, gestures: [], emotions: [], look: [], speech: mode === 'live' ? L.live : tl } };
        const seq = [];
        for (let k = 0; k * (1 / 60) < tl.t1 + 1.2; k++) {
          const t = k / 60;
          L.feed(t);
          frame.clear(C.ink);
          parts.clear();
          const sk = poseAt(a, t);
          const head = drawCharacter(parts, unit8, sk, { x: 192, y: 116, s, gb: 0, clip: false });
          parts.resolve(frame);
          // the indicator row: the centred pixel is steel at rest, silver when active
          let state = null;
          for (let d = -1; d <= 1 && state === null; d++) {
            const c = frame.px[(bandRows(head.cy, s).groove + d) * W + Math.round(head.cx)];
            if (c === C.steel) state = 'R';
            else if (c === C.silver) state = 'A';
          }
          assert.ok(state, `${mode} s=${s} t=${t.toFixed(2)}: indicator readable`);
          seq.push(state);
        }
        const runs = [];
        for (let i = 0; i < seq.length;) {
          let j = i;
          while (j < seq.length && seq[j] === seq[i]) j++;
          runs.push({ st: seq[i], ms: ((j - i) * 1000) / 60, t: i / 60 });
          i = j;
        }
        assert.ok(runs.length >= 3, `${mode} s=${s}: the indicator rests and speaks (${runs.length} runs)`);
        for (let i = 1; i < runs.length - 1; i++) assert.ok(runs[i].ms >= 120 - 1e-6, `${mode} s=${s}: a ${runs[i].st} run of ${runs[i].ms.toFixed(0)} ms at ${runs[i].t.toFixed(2)} s`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// silhouettes (head + hair, rows above the neck base) at s 1 and 1.37: distinct at 1x

function mask(L, s) {
  const { px } = render(L, s, 0);
  const m = new Uint8Array(W * H);
  for (let i = 0; i < W * 116; i++) if (px[i] !== C.ink) m[i] = 1;
  return m;
}
const iou = (a, b) => {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] && b[k]) i++;
    if (a[k] || b[k]) u++;
  }
  return i / u;
};

test('distinct silhouettes: Max-Ada and Nova-UNIT-8 ≤ 0.80, any pair with Paco / Lola ≤ 0.86', () => {
  for (const s of [1, 1.37]) {
    const M = Object.fromEntries(['paco', 'lola', 'max', 'ada', 'nova', 'unit8'].map((id) => [id, mask(LOOKS[id], s)]));
    assert.ok(iou(M.max, M.ada) <= 0.8, `s=${s} max-ada ${iou(M.max, M.ada).toFixed(3)}`);
    assert.ok(iou(M.nova, M.unit8) <= 0.8, `s=${s} nova-unit8 ${iou(M.nova, M.unit8).toFixed(3)}`);
    for (const a of ['max', 'ada', 'nova', 'unit8']) {
      for (const b of ['paco', 'lola', 'max', 'ada', 'nova', 'unit8']) {
        if (a === b) continue;
        const v = iou(M[a], M[b]);
        assert.ok(v <= 0.86, `s=${s} ${a}-${b} ${v.toFixed(3)}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// round 2: finish checks (rims that never sparkle, Nova's lit planes, UNIT-8 as an instrument)

test('hair rims are continuous arcs: no isolated silver pixel on the hair of max, nova and ada (s 2.15 / 3.4)', () => {
  for (const L of [max, nova, ada]) {
    for (const s of [2.15, 3.4]) {
      const { px, head } = render(L, s, 0.5);
      const y1 = Math.round(head.cy - 2 * s);
      let isolated = 0, rim = 0;
      for (let y = 1; y < y1; y++) for (let x = 1; x < W - 1; x++) {
        if (px[y * W + x] !== C.silver) continue;
        rim++;
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && px[(y + dy) * W + x + dx] === C.silver) nb++;
        if (!nb) isolated++;
      }
      assert.ok(rim > 2, `${L.id} s=${s}: the hair has a rim (${rim} px)`);
      assert.ok(isolated <= 1, `${L.id} s=${s}: ${isolated} isolated rim pixels`);
    }
  }
});

test("Nova's face carries lit planes in tan and stays the warmest, brightest area of her head", () => {
  const lstar = (c) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const r = f(c & 255), g = f((c >>> 8) & 255), b = f((c >>> 16) & 255);
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  };
  const skinRamp = new Set([C.tan, C.tanShade, C.brown, C.maroon, C.skinShade]);
  for (const s of [1, 2.7, 3.4]) {
    const { px, head } = render(nova, s, 0.5);
    let n = 0, sum = 0, lit = 0;
    for (let y = Math.round(head.cy - 6 * s); y <= Math.round(head.cy + 7 * s); y++) for (let x = Math.round(head.cx - 5 * s); x <= Math.round(head.cx + 5 * s); x++) {
      const c = px[y * W + x];
      if (!skinRamp.has(c)) continue;
      n++;
      sum += lstar(c);
      if (c === C.tan || c === C.skinShade) lit++; // the planes: a tan core inside a skinShade ring
    }
    assert.ok(lit / n > (s === 1 ? 0.1 : 0.12), `s=${s}: ${(100 * lit / n).toFixed(0)} % of the inner face is lit (tan / skinShade planes)`);
    // in the wide: above the planet's lit side on the COSMOS wall (tan / tanShade bands, mean ≈ 51;
    // cosmos.md §5 item 8 is measured in the wide)
    if (s === 1) assert.ok(sum / n > 51, `s=${s}: inner face mean L* ${(sum / n).toFixed(1)}`);
  }
});

test('UNIT-8 reads as an instrument: a low housing on a broad collar, no ear bumps, a sensor band, no mouth shape', () => {
  const w = 2 * CASE.hw, h = CASE.bot - CASE.top;
  assert.ok(w / h > 1.25, `housing ${w} x ${h}`);
  const human = (max.head.chinY - max.head.top) * 2 * max.head.cheekHW;
  assert.ok((w * h) / human < 1.15, `area ratio ${((w * h) / human).toFixed(2)}`);
  // a broad turret collar, never a stalk neck (critic r1: bobble-head)
  assert.ok(2 * unit8.neck.hw >= 0.6 * w, `collar ${2 * unit8.neck.hw} vs housing ${w}`);
  // the band is a full-width sensor strip, the slits in its upper third
  assert.ok(VISOR.hw >= CASE.hw - 2, `band half-width ${VISOR.hw}`);
  const s = 3.4;
  const { px, head } = render(unit8, s, 0.3);
  const B = bandRows(head.cy, s);
  assert.ok((B.eye - B.top) / (B.bottom - B.top + 1) < 0.34, `slits at ${B.eye - B.top} of ${B.bottom - B.top + 1} band rows`);
  // nothing sticks out of the housing's sides (no side modules / "ears")
  for (let y = Math.round(head.cy + CASE.top * s) + 2; y < Math.round(head.cy + CASE.bot * s) - 2; y++) {
    for (const x of [Math.round(head.cx - CASE.hw * s) - 3, Math.round(head.cx + CASE.hw * s) + 3]) assert.equal(px[y * W + x], C.ink, `row ${y}: a pixel beside the housing at x ${x}`);
  }
  // silent: below the slits the glass holds nothing lit (the speech line lives in the bezel groove)
  let lit = 0;
  const inset = Math.ceil(VISOR.rc * s) + 2;
  for (let y = B.eye + 3; y <= B.bottom; y++) for (let x = Math.round(head.cx - VISOR.hw * s) + inset; x < Math.round(head.cx + VISOR.hw * s) - inset; x++) {
    const c = px[y * W + x];
    if (c === C.silver || c === C.white || c === C.fog || c === C.steel) lit++;
  }
  assert.ok(lit === 0, `${lit} lit pixels in the glass below the slits at rest`);
  // at rest the groove holds exactly one steel pixel, centred
  const g = B.groove;
  let steel = 0;
  for (let x = Math.round(head.cx - VISOR.hw * s); x < Math.round(head.cx + VISOR.hw * s); x++) if (px[g * W + x] === C.steel) steel++;
  assert.equal(steel, 1);
});

// ---------------------------------------------------------------------------
// idle: no whole-figure 1 px hop and back within 0.3 s (owner: idle jitter is a BLOCKER)

function hops(id, s, seed, seconds) {
  const a = actor(id, { side: 1, seed });
  const cx = [];
  for (let k = 0; k < seconds * 60; k++) {
    sceneFrame.clear(C.ink);
    drawActors(k / 60, [{ actor: a, x: 192, y: 150, s }]);
    const p = sceneFrame.px;
    let sx = 0, n = 0;
    for (let y = 40; y < 216; y++) for (let x = 100; x < 284; x++) if (p[y * 384 + x] !== C.ink) {
      sx += x;
      n++;
    }
    cx.push(sx / n);
  }
  let found = 0;
  for (let k = 1; k < cx.length; k++) {
    const d = cx[k] - cx[k - 1];
    if (Math.abs(d) < 0.6) continue;
    for (let j = k + 1; j < Math.min(cx.length, k + 18); j++) {
      const e = cx[j] - cx[j - 1];
      if (Math.abs(e) >= 0.6 && Math.sign(e) !== Math.sign(d)) {
        found++;
        break;
      }
    }
  }
  return found;
}

test('idle: Max no longer hops 1 px and back (sway on a pixel boundary); no B look hops more than Paco', () => {
  assert.ok(max.persona.sway <= 0.65 && max.persona.energy <= 0.9, 'Max is lively through his head and gestures, not his body');
  for (const s of [1, 1.37]) {
    const ref = hops('paco', s, 11, 6);
    for (const id of ['max', 'ada', 'nova', 'unit8']) {
      const n = hops(id, s, 11, 6);
      assert.ok(n <= ref, `${id} s=${s}: ${n} hops (Paco ${ref})`);
    }
  }
});

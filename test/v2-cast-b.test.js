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
import {
  unit8, CASE, VISOR, EYE, IND_Y, eyeWidth, eyeHeight, indicatorWidth, indicatorSpec, widthAtTick, INDICATOR,
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

test("Nova's wardrobe has no P.magenta or P.purple (cosmos accent pixels), in data and in pixels", () => {
  const banned = [P.magenta, P.purple, P.pink];
  const ramps = [nova.jacket.ramp, nova.shirt.ramp, nova.hair.ramp, nova.skin, [nova.cuff], nova.necklace || [], ...Object.values(nova.mats || {}).map((m) => m.ramp)];
  for (const r of ramps) for (const c of r) assert.ok(!banned.includes(c), `nova uses ${c}`);
  for (const s of [1, 2.7, 5]) {
    const { px } = render(nova, s, 0.8);
    assert.equal(count(px, C.magenta) + count(px, C.purple) + count(px, C.pink), 0, `nova s=${s}`);
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

/** Rows and runs of the slit colours (white / silver) above the indicator row, inside the visor. */
function slits(px, head, s) {
  // around the left slit only (inside the visor; the lit casing next to it may be silver too)
  const x0 = Math.round(head.cx - (EYE.x + 1.9) * s) - 1, x1 = Math.round(head.cx - (EYE.x - 1.9) * s) + 1;
  const yTop = Math.round(head.cy + VISOR.top * s) + 1, yInd = Math.round(head.cy + IND_Y * s);
  const rows = new Set();
  let run = 0, bestRun = 0;
  for (let y = yTop; y < yInd - 1; y++) {
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
    const y = Math.round(head.cy + IND_Y * s);
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
    // never off and on again within 120 ms: a rest needs 200 ms of silence
    assert.ok(widthAtTick(sp, Math.floor((sp.t1 + 0.5) * rate), s) === 1);
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
  const skinRamp = new Set([C.tan, C.tanShade, C.brown, C.maroon]);
  for (const s of [1, 2.7]) {
    const { px, head } = render(nova, s, 0.5);
    let n = 0, sum = 0, lit = 0;
    for (let y = Math.round(head.cy - 6 * s); y <= Math.round(head.cy + 7 * s); y++) for (let x = Math.round(head.cx - 5 * s); x <= Math.round(head.cx + 5 * s); x++) {
      const c = px[y * W + x];
      if (!skinRamp.has(c)) continue;
      n++;
      sum += lstar(c);
      if (c === C.tan) lit++;
    }
    assert.ok(lit / n > 0.15, `s=${s}: ${(100 * lit / n).toFixed(0)} % of the inner face is lit (tan)`);
    // above the planet's lit side on the COSMOS wall (tan / tanShade bands, mean ≈ 51; cosmos.md §5 item 8)
    assert.ok(sum / n > 51, `s=${s}: inner face mean L* ${(sum / n).toFixed(1)}`);
  }
});

test('UNIT-8 reads as an instrument: a housing wider than tall, about a human head in area, no mouth shape', () => {
  const w = 2 * CASE.hw, h = CASE.bot - CASE.top;
  assert.ok(w / h > 1.1, `housing ${w} x ${h}`);
  const human = (max.head.chinY - max.head.top) * 2 * max.head.cheekHW;
  assert.ok((w * h) / human < 1.15, `area ratio ${((w * h) / human).toFixed(2)}`);
  // silent: the only lit pixel row under the slits is the 1 px steel rest line, centred
  const { px, head } = render(unit8, 3.4, 0.3);
  const s = 3.4;
  let lit = 0;
  for (let y = Math.round(head.cy + 0.5 * s); y < Math.round(head.cy + VISOR.bot * s) - 1; y++) for (let x = Math.round(head.cx - VISOR.hw * s) + 2; x < Math.round(head.cx + VISOR.hw * s) - 2; x++) {
    const c = px[y * W + x];
    if (c === C.silver || c === C.white || c === C.fog || c === C.steel) lit++;
  }
  assert.ok(lit <= 1, `${lit} lit pixels below the slits at rest`);
});

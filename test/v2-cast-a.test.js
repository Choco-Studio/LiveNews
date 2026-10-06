// PRESENTERS A (owner: PRESENTERS A stream): the looks of Paco, Lola, Sam and
// Penny, rendered in node. Checks that every look is complete and adult in
// proportion, that rendered frames use palette colours only, that Penny follows
// money-minute.md request S2, that the looks' own parts stay inside their group
// ranges (CONTRACTS "group ids"), that faces sit in the bibles' value range, and
// that the shared foundation APIs other streams import stay in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../public/js/palette.js';
import { C, PartBuffer, Frame } from '../public/js/v2/canvas25d/pixbuf.js';
import { drawCharacter, GROUPS, GROUPS_PER_ACTOR, CHAR_PROFILE } from '../public/js/v2/canvas25d/character.js';
import { poseAt } from '../public/js/v2/canvas25d/rig.js';
import { defineLook, deriveLook, matsOf, SKIN_LIGHT, SKIN_TAN } from '../public/js/v2/canvas25d/cast/base.js';
import { OUTFITS, registerOutfit, torsoFrame, drawOutfit, drawLapels, drawNecklace } from '../public/js/v2/canvas25d/cast/outfit.js';
import { hash01, clumpTone, localBox, LocalXY } from '../public/js/v2/canvas25d/cast/kit-a.js';
import { paco } from '../public/js/v2/canvas25d/cast/paco.js';
import { lola } from '../public/js/v2/canvas25d/cast/lola.js';
import { sam } from '../public/js/v2/canvas25d/cast/sam.js';
import { penny } from '../public/js/v2/canvas25d/cast/penny.js';
import { createCastALab, CAST_A } from '../public/js/v2/canvas25d/labs/cast-a.js';

const LOOKS = { paco, lola, sam, penny };
const PALETTE = new Set(Object.values(C));
const HEX = new Set(Object.values(P));

/** Render one look alone on ink (static pose at t) and return the frame and part buffer. */
function render(L, s, t = 0, side = 1, opts = {}) {
  const frame = new Frame();
  const buf = new PartBuffer();
  frame.clear(C.ink);
  const actor = { id: L.id, look: L, perf: { side, seed: 11, gestures: [], emotions: [], look: [] } };
  const sk = poseAt(actor, t);
  if (opts.yaw) sk.head.yaw += opts.yaw;
  const head = drawCharacter(buf, L, sk, { x: 192, y: 116, s, gb: opts.gb || 0, clip: false });
  buf.resolve(frame);
  return { frame, buf, head };
}

// CIE L* of a u32 palette colour (little-endian ABGR)
function lstar(c) {
  const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const Y = 0.2126 * lin(c & 255) + 0.7152 * lin((c >>> 8) & 255) + 0.0722 * lin((c >>> 16) & 255);
  return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
}

// ---------------------------------------------------------------------------

test('every look is complete: data fields, ramps from the palette, a hair hook, a registered outfit', () => {
  for (const [id, L] of Object.entries(LOOKS)) {
    assert.equal(L.id, id);
    assert.ok(L.name && typeof L.name === 'string', `${id} name`);
    for (const k of ['top', 'craniumY', 'R', 'cheekY', 'cheekHW', 'chinY', 'chinHW', 'jawPow']) assert.equal(typeof L.head[k], 'number', `${id} head.${k}`);
    assert.equal(L.headAt.length, 2);
    for (const part of ['neck', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'torso', 'arm', 'persona']) assert.ok(L[part], `${id} ${part}`);
    for (const k of ['neckHW', 'shoulderTop', 'shoulderHW', 'sideHW', 'bottom', 'vDepth']) assert.equal(typeof L.torso[k], 'number', `${id} torso.${k}`);
    for (const k of ['upper', 'fore', 'rUpper', 'rElbow', 'rWrist', 'hand']) assert.equal(typeof L.arm[k], 'number', `${id} arm.${k}`);
    for (const k of ['sway', 'headMotion', 'blinkMin', 'blinkMax', 'energy', 'smile']) assert.equal(typeof L.persona[k], 'number', `${id} persona.${k}`);
    assert.equal(typeof L.parts.hair, 'function', `${id} parts.hair`);
    assert.ok(OUTFITS[L.outfit], `${id} outfit ${L.outfit} registered`);
    const ramps = [L.skin, L.hair.ramp, L.jacket.ramp, L.shirt.ramp, L.tie && L.tie.ramp, L.mustache && L.mustache.ramp].filter(Boolean);
    for (const r of ramps) {
      assert.equal(r.length, 4, `${id} ramp has 4 steps`);
      for (const c of r) assert.ok(HEX.has(c), `${id} colour ${c} is a palette token`);
    }
    for (const c of [L.skinLine, L.hair.line, L.jacket.line, L.shirt.line, L.cuff]) assert.ok(HEX.has(c), `${id} ${c}`);
  }
});

test('adult proportions: head ≈ 20 u tall on broad shoulders, eyes near the head\'s half-way line', () => {
  for (const [id, L] of Object.entries(LOOKS)) {
    const H = L.head;
    const headH = H.chinY - H.top;
    assert.ok(headH > 17.5 && headH < 21.5, `${id} head height ${headH}`);
    // shoulders 2.4-3 head widths: no big-head mascots
    const ratio = (2 * L.torso.shoulderHW) / (2 * H.cheekHW);
    assert.ok(ratio > 2.4 && ratio < 3.3, `${id} shoulder/head width ${ratio.toFixed(2)}`);
    const eyeFromTop = (L.eyes.y - H.top) / headH;
    assert.ok(eyeFromTop > 0.44 && eyeFromTop < 0.56, `${id} eyes at ${eyeFromTop.toFixed(2)} of the head`);
    // the hand is about half a head, the upper arm a little longer than a head
    assert.ok(L.arm.hand / headH > 0.45 && L.arm.hand / headH < 0.65, `${id} hand`);
    assert.ok(L.arm.upper / headH > 1.0 && L.arm.upper / headH < 1.3, `${id} upper arm`);
  }
});

test('rendered frames use palette colours only (s 1, 2.7, 5, both seats, a turned head)', () => {
  for (const [id, L] of Object.entries(LOOKS)) {
    for (const s of [1, 2.7, 5]) {
      for (const side of [1, -1]) {
        const { frame } = render(L, s, 1.3, side, { yaw: side > 0 ? 0.3 : -0.3 });
        for (let i = 0; i < frame.px.length; i++) {
          if (!PALETTE.has(frame.px[i])) assert.fail(`${id} s ${s}: non-palette pixel 0x${frame.px[i].toString(16)} at ${i % 384},${(i / 384) | 0}`);
        }
      }
    }
  }
});

test('Penny follows money-minute.md S2: no glasses, persona energy 0.6, a resting pen, no green in her wardrobe', () => {
  assert.ok(!penny.glasses, 'no glasses');
  assert.equal(penny.persona.energy, 0.6);
  assert.ok(Array.isArray(penny.props) && penny.props.includes('pen'), 'props include the pen');
  const greens = new Set([P.green, P.darkGreen]);
  for (const r of [penny.jacket.ramp, penny.shirt.ramp, penny.hair.ramp, penny.pin.ramp, penny.pearls]) for (const c of r) assert.ok(!greens.has(c), `no green: ${c}`);
  // and none rendered (her pen and hands belong to HANDS, but nothing of hers may be green)
  const { frame } = render(penny, 2.7);
  const g = new Set([C.green, C.darkGreen]);
  for (let i = 0; i < frame.px.length; i++) assert.ok(!g.has(frame.px[i]), 'no green pixel');
});

test('wardrobe stays neutral where the programme accent lives: Sam has no yellow, Penny no green, Lola no candy blue', () => {
  const has = (L, c) => [L.jacket.ramp, L.shirt.ramp, L.tie ? L.tie.ramp : []].some((r) => r.includes(c));
  assert.ok(!has(sam, P.yellow) && !has(sam, P.orange), 'NEWS IN 60 yellow belongs to the graphics');
  // news-60.md §4 item 8: saturated colour ≤ 6 % of the studio layer, presenter included: Sam's wardrobe is neutral
  const saturated = [P.red, P.darkRed, P.rust, P.orange, P.yellow, P.green, P.darkGreen, P.cyan, P.blue, P.navy, P.pink, P.magenta, P.purple];
  for (const c of saturated) assert.ok(!has(sam, c), `Sam's wardrobe has no saturated ${c}`);
  assert.ok(!has(penny, P.green) && !has(penny, P.darkGreen), 'MONEY MINUTE green is market data');
  assert.ok(!lola.jacket.ramp.includes(P.blue), 'Lola keeps the deep blue blazer without the saturated highlight');
  assert.ok(paco.tie.ramp.includes(P.red) && paco.pocket, 'Paco keeps the red tie and the pocket square');
});

test("the looks' own parts stay inside their group ranges (1-10 and 19; extras 40-55)", () => {
  const allowed = (g) => (g >= 1 && g <= 10) || g === 19 || (g >= 40 && g <= 55);
  const orig = PartBuffer.prototype.part;
  for (const [id, L0] of Object.entries(LOOKS)) {
    const used = new Set();
    let mine = 0;
    PartBuffer.prototype.part = function (g, z, c) {
      if (mine) used.add(g % GROUPS_PER_ACTOR);
      return orig.call(this, g, z, c);
    };
    const wrap = (fn) => fn && function (buf, ...a) {
      mine++;
      used.add(buf.g % GROUPS_PER_ACTOR);
      try {
        return fn.call(this, buf, ...a);
      } finally {
        mine--;
      }
    };
    const parts = {};
    for (const [k, v] of Object.entries(L0.parts)) parts[k] = typeof v === 'function' ? wrap(v) : v;
    const outfitName = `cast-a-test:${id}`;
    registerOutfit(outfitName, (o) => {
      mine++;
      used.add(o.buf.g % GROUPS_PER_ACTOR);
      try {
        OUTFITS[L0.outfit](o);
      } finally {
        mine--;
      }
    });
    const L = { ...L0, parts, outfit: outfitName };
    try {
      for (const gb of [0, 64, 128]) for (const s of [1, 2.7, 5]) render(L, s, 0.7, 1, { gb });
    } finally {
      PartBuffer.prototype.part = orig;
      delete OUTFITS[outfitName];
    }
    for (const g of used) assert.ok(allowed(g), `${id} uses group ${g}`);
  }
});

test('faces sit in the bible value range and are the brightest warm area of the presenter', () => {
  // world-now.md §5 item 10 (L* 55-73), news-60.md §4 item 14 (mean ≥ 60 for Sam)
  const warm = new Set([C.skin, C.skinShade, C.tan, C.tanShade, C.cream, C.orange, C.yellow, C.rust]);
  for (const [id, L] of Object.entries(LOOKS)) {
    const { frame, buf } = render(L, 2.7);
    let sum = 0, n = 0;
    for (let i = 0; i < buf.grp.length; i++) {
      if (!buf.mat[i] || buf.grp[i] !== GROUPS.head) continue;
      sum += lstar(frame.px[i]);
      n++;
    }
    const mean = sum / n;
    assert.ok(n > 300, `${id} face pixels ${n}`);
    if (id === 'sam') assert.ok(mean >= 60, `sam face mean L* ${mean.toFixed(1)} ≥ 60`);
    assert.ok(mean >= 55 && mean <= 73, `${id} face mean L* ${mean.toFixed(1)}`);
    // no warm area of the look's own clothes or hair (4x4 or larger) brighter on average than the face
    // (hands and props belong to HANDS and are judged in their stream)
    const W = 384;
    const ownGroup = (g) => [GROUPS.hairBack, GROUPS.shirt, GROUPS.tie, GROUPS.jacket, GROUPS.hair, GROUPS.over, GROUPS.collar].includes(g) || (g >= GROUPS.look && g <= GROUPS.lookEnd);
    for (let y = 0; y + 4 <= 216; y += 2) {
      for (let x = 0; x + 4 <= W; x += 2) {
        let s = 0, all = true;
        for (let j = 0; j < 4 && all; j++) for (let i = 0; i < 4; i++) {
          const k = (y + j) * W + x + i;
          if (!warm.has(frame.px[k]) || !buf.mat[k] || !ownGroup(buf.grp[k])) { all = false; break; }
          s += lstar(frame.px[k]);
        }
        if (all) assert.ok(s / 16 <= mean + 14, `${id}: warm patch at ${x},${y} (L* ${(s / 16).toFixed(1)}) outshines the face (${mean.toFixed(1)})`);
      }
    }
  }
});

test('distinct silhouettes: head+hair masks of Sam and Penny differ from every other A presenter at s 1 and 1.37', () => {
  const mask = (L, s) => {
    const { frame } = render(L, s);
    const m = new Uint8Array(384 * 116);
    for (let i = 0; i < m.length; i++) m[i] = frame.px[i] !== C.ink ? 1 : 0;
    return m;
  };
  const iou = (a, b) => {
    let i = 0, u = 0;
    for (let k = 0; k < a.length; k++) {
      if (a[k] && b[k]) i++;
      if (a[k] || b[k]) u++;
    }
    return i / u;
  };
  for (const s of [1, 1.37]) {
    const m = Object.fromEntries(CAST_A.map((id) => [id, mask(LOOKS[id], s)]));
    for (const [a, b] of [['paco', 'lola'], ['paco', 'sam'], ['paco', 'penny'], ['lola', 'sam'], ['lola', 'penny'], ['sam', 'penny']]) {
      const v = iou(m[a], m[b]);
      assert.ok(v <= 0.86, `${a}-${b} at s ${s}: IoU ${v.toFixed(3)} ≤ 0.86`);
    }
  }
});

test('rendering is deterministic and every part reads at the three face LOD tiers', () => {
  for (const L of Object.values(LOOKS)) {
    for (const s of [1.0, 1.6, 3.0]) {
      const a = render(L, s, 2.1).frame.px, b = render(L, s, 2.1).frame.px;
      assert.deepEqual(a, b);
      let hair = 0;
      const { buf } = render(L, s, 2.1);
      for (let i = 0; i < buf.grp.length; i++) if (buf.mat[i] && buf.grp[i] === GROUPS.hair) hair++;
      assert.ok(hair > 20 * s * s, `${L.id} hair visible at s ${s} (${hair} px)`);
    }
  }
});

test('shared foundation APIs other streams import stay stable', () => {
  assert.equal(typeof defineLook, 'function');
  assert.equal(typeof deriveLook, 'function');
  assert.equal(typeof matsOf, 'function');
  assert.equal(typeof registerOutfit, 'function');
  assert.equal(typeof drawOutfit, 'function');
  assert.equal(typeof drawLapels, 'function');
  assert.equal(typeof drawNecklace, 'function');
  assert.equal(SKIN_LIGHT.length, 4);
  assert.equal(SKIN_TAN.length, 4);
  for (const k of ['hairBack', 'neck', 'shirt', 'tie', 'jacket', 'ears', 'head', 'hair', 'over', 'collar', 'look', 'lookEnd', 'glasses', 'props']) assert.equal(typeof GROUPS[k], 'number', `GROUPS.${k}`);
  assert.equal(GROUPS_PER_ACTOR, 64);
  assert.ok('on' in CHAR_PROFILE);
  // a derived look still works (B's placeholders) and gets the lapel material
  const d = deriveLook(paco, { id: 'cast-a-derived', jacket: { ramp: [P.fog, P.steel, P.slate, P.ink], line: P.black } });
  const m = matsOf(d);
  assert.ok(m.lapel && m.jacket && m.sleeve && m.hair);
  assert.throws(() => defineLook({ id: 'nohair', parts: {} }));
  // torsoFrame keeps its fields
  const buf = new PartBuffer();
  const actor = { id: 'paco', look: paco, perf: { side: 1, seed: 11, gestures: [], emotions: [], look: [] } };
  const sk = poseAt(actor, 0);
  const toS = (x, y) => [192 + x * 2, 116 + y * 2];
  const F = torsoFrame({ buf, L: paco, m: matsOf(paco), sk, toS, s: 2, gb: 0, G: GROUPS, clip: false });
  for (const k of ['T', 'lift', 'outline', 'jacketPts', 'vY', 'torsoTone']) assert.ok(k in F, `torsoFrame.${k}`);
  assert.equal(typeof F.torsoTone(), 'function');
  // an outfit called without o.inv / o.head (another stream's caller) still draws
  OUTFITS.suit({ buf, L: paco, m: matsOf(paco), sk, toS, s: 2.5, gb: 0, G: GROUPS, clip: false });
  OUTFITS.blazer({ buf, L: lola, m: matsOf(lola), sk, toS, s: 2.5, gb: 0, G: GROUPS, clip: false });
});

test('kit helpers are deterministic and allocation-free in shape', () => {
  assert.equal(hash01(5), hash01(5));
  assert.ok(hash01(5) >= 0 && hash01(5) < 1);
  const o = { cw: 1.6, s: 3, seed: 1, sep: true, hiLo: 0.5, hiHi: 6, hiW: 0.4, gap: 3 };
  for (let v = 0; v < 10; v += 0.37) for (const t of [0, 1, 2, 3]) {
    const r = clumpTone(t, v, 2.5, o);
    assert.ok(r >= 0 && r <= 3);
  }
  const head = { cx: 100, cy: 80, s: 2, cr: 1, sr: 0 };
  const box = localBox(head, -5, -5, 5, 5);
  assert.deepEqual(box, [89, 69, 111, 91]);
  const q = new LocalXY().set(head);
  q.at(104, 80);
  assert.equal(q.x, 2);
  assert.equal(q.y, 0);
});

test('the lab renders every mode in node and reports a profile', () => {
  const lab = createCastALab(null);
  for (const mode of lab.modes) {
    lab.set({ mode, presenter: 'penny', scale: 2.15 });
    lab.render(1.1);
  }
  const p = lab.profile(6, 'paco');
  for (const k of ['total', 'face', 'hair', 'body', 'arms', 'rest']) assert.ok(Number.isFinite(p[k]), k);
});

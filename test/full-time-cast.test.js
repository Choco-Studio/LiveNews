// FULL TIME's presenters on screen (docs/programmes/full-time.md §2; critique docs/roadmap/critique/full-time-cast.md):
// Kai Sprite and Rosa Rally have looks of their own in both renderers (no fallback to another presenter's design),
// three candidates each for the owner, one switch (public/js/full-time-looks.js) for both renderers; each face unlike
// every other on the channel at 1x, drawn in the palette, hair of its own, its tells readable in the wide, its mouth,
// blinks and gestures working, nothing clipped in the programme's framings; the guests never repeat them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// the old renderer's close-up rasterises offscreen through document.createElement: a recording canvas
const IMAGES = [];
const FILLS = [];
function fakeCtx() {
  return {
    fillStyle: '#000000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    arc() {},
    clip() {},
    putImageData() {},
    drawImage() {},
    createImageData(w, h) {
      const img = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      IMAGES.push(img);
      return img;
    },
    fillRect() {
      FILLS.push({ c: this.fillStyle, a: this.globalAlpha });
    },
  };
}
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };

const { P } = await import('../public/js/palette.js');
const { FULL_TIME_LOOK, FULL_TIME_CANDIDATES } = await import('../public/js/full-time-looks.js');
const { LOOKS, PRESENTER_IDS, CORRESPONDENT_LOOKS, EXPERT_LOOKS, CANDIDATE_LOOKS, lookFor } = await import('../public/js/v2/canvas25d/cast/index.js');
const { KAI_CANDIDATES, ROSA_CANDIDATES, CANDIDATE_NOTES } = await import('../public/js/v2/canvas25d/cast/full-time.js');
const { frame, parts, drawActors, actor } = await import('../public/js/v2/canvas25d/scene.js');
const { C, u32 } = await import('../public/js/v2/canvas25d/pixbuf.js');
const { GROUPS, GROUPS_PER_ACTOR } = await import('../public/js/v2/canvas25d/character.js');
const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
const { buildSpeech } = await import('../public/js/v2/canvas25d/visemes.js');
const cam = await import('../public/js/v2/canvas25d/camera.js');
const { SET } = await import('../public/js/v2/canvas25d/studio/geometry.js');
const { REMOTE } = await import('../public/js/v2/canvas25d/studio/remote.js');
const { NAMED_IDS, guestSpec, guestFeatures, twinOf } = await import('../public/js/v2/canvas25d/cast/guest.js');

const W = 384, H = 216;
const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
const HEX = new Set(Object.values(P).map((h) => h.toLowerCase()));
const OTHERS = [...Object.values(LOOKS), ...Object.values(CORRESPONDENT_LOOKS), ...Object.values(EXPERT_LOOKS)].filter((L) => L.id !== 'kai' && L.id !== 'rosa');
const CANDIDATES = [...Object.values(KAI_CANDIDATES), ...Object.values(ROSA_CANDIDATES)];
const HEAD = new Set([GROUPS.hairBack, GROUPS.ears, GROUPS.head, GROUPS.hair, GROUPS.over]);

const mk = (L, perf = {}) => ({ id: L.id, look: L, perf: { side: 1, seed: 11, gestures: [], emotions: [], look: [], ...perf } });
/** One look alone on ink at scale s (neck base at a row that keeps the head in frame); returns the head frame. */
function solo(L, s, t = 1, perf = {}, y = Math.max(80, Math.min(200, Math.round(30 + 26 * s)))) {
  frame.px.fill(C.ink);
  return drawActors(t, [{ actor: mk(L, perf), x: 192, y, s, clip: false }])[0];
}
const lum = (c) => 0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255);
const count = (pred, x0 = 0, y0 = 0, x1 = W, y1 = H) => {
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) if (pred(frame.px[y * W + x], y * W + x)) n++;
  return n;
};

test('Kai and Rosa have looks of their own, registered as presenters: FULL TIME no longer falls back to Paco or Lola', () => {
  const channel = JSON.parse(fs.readFileSync(new URL('../config/channel.json', import.meta.url)));
  assert.deepEqual(channel.drafts['full-time'].presenters, ['kai', 'rosa']);
  for (const id of ['kai', 'rosa']) {
    assert.ok(channel.presenters[id], `${id} is a presenter in config/channel.json`);
    assert.ok(PRESENTER_IDS.includes(id), `${id} is in the cast's registry`);
    assert.equal(LOOKS[id].id, id);
    assert.equal(lookFor(id, channel.presenters[id]), LOOKS[id], `${id}: its own look, not the ${channel.presenters[id].voice.gender} fallback`);
  }
  assert.notEqual(LOOKS.kai.parts.hair, LOOKS.paco.parts.hair);
  assert.notEqual(LOOKS.rosa.parts.hair, LOOKS.lola.parts.hair);
  // the look on air is the candidate the switch names, under the presenter's own id (its own material keys)
  for (const [id, cands] of [['kai', KAI_CANDIDATES], ['rosa', ROSA_CANDIDATES]]) {
    assert.ok(FULL_TIME_CANDIDATES.includes(FULL_TIME_LOOK[id]), `${id}: ${FULL_TIME_LOOK[id]} is a candidate letter`);
    assert.deepEqual(Object.keys(cands), ['A', 'B', 'C']);
    const L = cands[FULL_TIME_LOOK[id]];
    for (const k of ['hair', 'hairBack', 'over', 'head', 'sleeves']) assert.equal(LOOKS[id].parts[k], L.parts[k], `${id}.parts.${k}`);
    for (const k of ['outfit', 'skin', 'jacket', 'head']) assert.deepEqual(LOOKS[id][k], L[k], `${id}.${k}`);
    for (const l of ['A', 'B', 'C']) assert.ok(CANDIDATE_NOTES[id][l]?.length > 40, `${id} ${l} is described`);
  }
  // the candidates are looked up by their own ids (labs, framing), never as presenters
  for (const L of CANDIDATES) {
    assert.equal(lookFor(L.id), L);
    assert.equal(CANDIDATE_LOOKS[L.id], L);
    assert.ok(!PRESENTER_IDS.includes(L.id));
  }
});

test('every candidate draws hair of its own: never a presenter\'s, a correspondent\'s or an expert\'s drawer, never another candidate\'s', () => {
  const others = new Map();
  for (const L of OTHERS) for (const k of ['hair', 'hairBack']) if (L.parts[k]) others.set(L.parts[k], L.id);
  const seen = new Map();
  for (const L of CANDIDATES) {
    assert.equal(typeof L.parts.hair, 'function', `${L.id} draws hair`);
    for (const fn of [L.parts.hair, L.parts.hairBack].filter(Boolean)) {
      assert.ok(!others.has(fn), `${L.id}'s ${fn.name} is ${others.get(fn)}'s`);
      assert.ok(!seen.has(fn), `${L.id}'s ${fn.name} is ${seen.get(fn)}'s too`);
      seen.set(fn, L.id);
    }
  }
});

test('every candidate is a whole adult figure drawn in the channel palette only (desk single and remote scale)', () => {
  for (const L of CANDIDATES) {
    for (const s of [1, 2.15, 3.4]) {
      solo(L, s, 1.3);
      for (const c of frame.px) assert.ok(PALETTE.has(c >>> 0), `${L.id} s${s}: a colour off the palette`);
    }
    frame.px.fill(C.ink);
    drawActors(1, [{ actor: mk(L, { side: 0 }), x: REMOTE.x, y: REMOTE.y, s: REMOTE.s, clip: false }]);
    const drawn = count((c) => c !== C.ink);
    assert.ok(drawn > 6000, `${L.id} is drawn (${drawn} px)`);
  }
});

test('unlike every face on air at 1x: the dark mass sits elsewhere, and the figure\'s colours are its own', () => {
  // where the dark goes in the head (Kai's beard below, a dark head of hair above) is what tells two faces apart at
  // 1x; the cast's own nearest pairs overlap 0.54-0.77 by this measure, FULL TIME's faces stay at or under 0.5
  const darkMask = (L, s) => {
    solo(L, s, 1, {}, 150);
    const m = new Uint8Array(W * H);
    for (let i = 0; i < m.length; i++) if (parts.mat[i] && HEAD.has(parts.grp[i]) && lum(frame.px[i]) < 80) m[i] = 1;
    return m;
  };
  const iou = (a, b) => {
    let i = 0, u = 0;
    for (let k = 0; k < a.length; k++) {
      if (a[k] && b[k]) i++;
      if (a[k] || b[k]) u++;
    }
    return u ? i / u : 0;
  };
  for (const s of [1, 1.37]) {
    const masks = new Map(OTHERS.map((L) => [L.id, darkMask(L, s)]));
    for (const id of ['kai', 'rosa']) {
      const me = darkMask(LOOKS[id], s);
      for (const [o, m] of masks) assert.ok(iou(me, m) <= 0.5, `s${s} ${id} vs ${o}: dark mass overlaps ${iou(me, m).toFixed(2)}`);
    }
  }
  // the whole figure's colour histogram (as the experts' test: no one is a recoloured twin of anyone)
  const hist = (L) => {
    frame.px.fill(C.ink);
    drawActors(1, [{ actor: mk(L, { side: 0 }), x: REMOTE.x, y: REMOTE.y, s: REMOTE.s, clip: false }]);
    const h = new Map();
    for (const c of frame.px) if (c !== C.ink) h.set(c, (h.get(c) || 0) + 1);
    return h;
  };
  const diff = (a, b) => {
    let d = 0, n = 0;
    for (const k of new Set([...a.keys(), ...b.keys()])) d += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
    for (const v of a.values()) n += v;
    return d / n;
  };
  const H0 = new Map(OTHERS.map((L) => [L.id, hist(L)]));
  for (const id of ['kai', 'rosa']) {
    const me = hist(LOOKS[id]);
    for (const [o, h] of H0) assert.ok(diff(me, h) > 0.35, `${id} vs ${o}: ${diff(me, h).toFixed(2)}`);
  }
  assert.ok(diff(hist(LOOKS.kai), hist(LOOKS.rosa)) > 0.35, 'Kai and Rosa apart from each other');
});

test('what makes each one reads in the wide (s 1): Kai\'s dome, beard and orange collar; Rosa\'s ponytail hook and sleeve stripes', () => {
  const orange = new Set([u32(P.orange), u32(P.rust)].map((c) => c >>> 0));
  const white = u32(P.white) >>> 0;
  for (const id of ['kai', 'rosa']) {
    const L = LOOKS[id];
    const h = solo(L, 1, 1, {}, 150);
    const s = h.s, cx = Math.round(h.cx), cy = Math.round(h.cy);
    const neck = 150;
    // the white tee's V under the chin, both of them
    assert.ok(count((c) => c >>> 0 === white, cx - 3, neck - 2, cx + 4, neck + 8) >= 3, `${id}: the white V`);
    if (id === 'kai' && FULL_TIME_LOOK.kai === 'A') {
      // the bomber's orange collar round the neck: at least 2 px each side of the V
      assert.ok(count((c) => orange.has(c >>> 0), cx - 7, neck - 6, cx, neck + 3) >= 2, 'Kai: orange collar, left');
      assert.ok(count((c) => orange.has(c >>> 0), cx + 1, neck - 6, cx + 8, neck + 3) >= 2, 'Kai: orange collar, right');
      // the dome is skin to its top (no hair), the lower face dark (the beard)
      const skin = new Set(L.skin.map((c) => u32(c) >>> 0));
      assert.ok(count((c) => skin.has(c >>> 0), cx - 3, cy - 9 * s, cx + 4, cy - 5 * s) >= 10, 'Kai: a bare dome');
      assert.ok(count((c) => lum(c) < 60, cx - 6, cy + 3 * s, cx + 7, cy + 11 * s) >= 30, 'Kai: the beard\'s dark mass');
    }
    if (id === 'rosa' && FULL_TIME_LOOK.rosa === 'A') {
      // the ponytail: hair above the crown, right of centre (its hook), and beside the head on the right
      const hair = (i) => parts.mat[i] && (parts.grp[i] === GROUPS.hair || parts.grp[i] === GROUPS.hairBack);
      let top = H;
      for (let i = 0; i < W * H; i++) if (hair(i) && i % W > cx) top = Math.min(top, Math.floor(i / W));
      let topL = H;
      for (let i = 0; i < W * H; i++) if (hair(i) && i % W < cx) topL = Math.min(topL, Math.floor(i / W));
      assert.ok(top < topL, `Rosa: the hook rises above the crown on the right (${top} vs ${topL})`);
      assert.ok(count((c, i) => hair(i), cx + Math.round(7.3 * s), cy - 4, cx + Math.round(10 * s), cy + 6) >= 3, 'Rosa: the tail beside the head');
      // the orange stripe down each sleeve, in the sleeves' own groups
      const arm = (i) => parts.grp[i] === GROUPS.armA || parts.grp[i] === GROUPS.armB;
      assert.ok(count((c, i) => arm(i) && orange.has(c >>> 0)) >= 12, 'Rosa: stripes on the sleeves');
    }
  }
});

test('mouth, eyes and blinks work through Kai\'s beard and under Rosa\'s hair (closes)', () => {
  for (const id of ['kai', 'rosa']) {
    const L = LOOKS[id];
    const speech = buildSpeech('Good evening. A long wait ended tonight: four one, and a first title in nine years.', { t0: 0.4 });
    const a = mk(L, { speech });
    // a wide-open instant and a shut one
    let open = 0, shut = 0;
    for (let t = 0.45; t < 3.5 && !(open && shut); t += 0.02) {
      const f = poseAt(a, t).face;
      if (!open && f.open > 0.8) open = t;
      if (!shut && f.open < 0.05 && f.speaking) shut = t;
    }
    assert.ok(open && shut, `${id}: the line opens and closes the mouth`);
    const s = 3.4;
    const grab = (t) => {
      const h = solo(L, s, t, { speech });
      const box = [Math.round(h.cx - 3 * s), Math.round(h.cy + 4 * s), Math.round(h.cx + 3 * s), Math.round(h.cy + 8.5 * s)];
      const px = [];
      for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) px.push(frame.px[y * W + x]);
      return px;
    };
    const A = grab(open), B = grab(shut);
    const changed = A.filter((c, i) => c !== B[i]).length;
    assert.ok(changed >= 12, `${id}: the mouth moves (${changed} px)`);
    // the inside of the mouth shows when open (dark) and the lips are visible (not beard-coloured) when shut
    const lips = new Set([L.mouth.lip, L.mouth.lipHi, L.mouth.upper].map((c) => u32(c) >>> 0));
    assert.ok(B.filter((c) => lips.has(c >>> 0)).length >= 3, `${id}: the lips show when closed`);
    // a blink closes the eyes
    const b = mk(L);
    let bt = 0;
    for (let t = 0.1; t < 12 && !bt; t += 0.01) if (poseAt(b, t).face.blink > 0.95) bt = t;
    assert.ok(bt, `${id} blinks`);
    const eyes = (t) => {
      const h = solo(L, s, t);
      const out = [];
      for (let y = Math.round(h.cy - 2 * s); y < Math.round(h.cy + 1 * s); y++) for (let x = Math.round(h.cx - 5 * s); x < Math.round(h.cx + 5 * s); x++) out.push(frame.px[y * W + x]);
      return out;
    };
    const E1 = eyes(bt), E0 = eyes(bt + 0.4);
    assert.ok(E1.filter((c, i) => c !== E0[i]).length >= 8, `${id}: the blink shows`);
  }
});

test('nothing is clipped in the programme\'s framings: the whole head (the ponytail and the beard too) inside the frame', () => {
  const speech = buildSpeech('Four one.', { t0: 0.3 });
  for (const [shot, focus] of [['wide', 'A'], ['two', 'A'], ['single', 'A'], ['single', 'B'], ['close', 'A'], ['close', 'B'], ['mcu-l', 'A'], ['mcu-r', 'B'], ['ots', 'A'], ['ots', 'B']]) {
    const camera = cam.framing(shot, { cast: { A: 'kai', B: 'rosa' }, focus, programId: 'full-time' });
    for (const t of [0.6, 2.2]) {
      frame.px.fill(C.ink);
      const list = [];
      for (const [id, slot] of [['kai', 'A'], ['rosa', 'B']]) {
        const p = cam.placeActor(camera, SET.seatX[slot]);
        list.push({ actor: mk(LOOKS[id], { side: slot === 'A' ? 1 : -1, speech }), x: p.x, y: p.y, s: p.s, slot });
      }
      drawActors(t, list);
      list.forEach((it, n) => {
        // the head groups of this actor
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        const gb = n * GROUPS_PER_ACTOR;
        for (let i = 0; i < W * H; i++) {
          if (!parts.mat[i] || !HEAD.has(parts.grp[i] - gb)) continue;
          const x = i % W, y = (i / W) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        if (x1 < 0) return; // out of this framing (a single of the other)
        const inFrame = x0 > 1 && x1 < W - 2 && y1 < H - 2;
        if (it.slot === focus || shot === 'wide' || shot === 'two') assert.ok(inFrame && y0 > 1, `${shot}/${focus} t${t}: ${it.actor.id}'s head ${x0},${y0}-${x1},${y1} clipped`);
      });
    }
  }
});

test('gestures keep the cast system\'s hands, with Rosa\'s stripes and Kai\'s orange cuffs on the sleeves that move', () => {
  const orange = new Set([u32(P.orange), u32(P.rust)].map((c) => c >>> 0));
  const cases = [['kai', 'raise_hand', 1.0], ['kai', 'point_screen', 1.0], ['kai', 'count', 1.0], ['rosa', 'steeple', 1.0], ['rosa', 'chin', 1.0], ['rosa', 'shrug', 0.8]];
  for (const [id, g, t] of cases) {
    const L = LOOKS[id];
    solo(L, 2.15, t, { gestures: [{ name: g, t0: 0.3 }] }, 100);
    const arm = (i) => [GROUPS.armA, GROUPS.armB, GROUPS.cuffA, GROUPS.cuffB].includes(parts.grp[i]);
    const hand = (i) => parts.grp[i] === GROUPS.handA || parts.grp[i] === GROUPS.handB;
    assert.ok(count((c, i) => hand(i)) > 80, `${id} ${g}: hands drawn`);
    if (id === 'rosa' && FULL_TIME_LOOK.rosa === 'A') assert.ok(count((c, i) => arm(i) && orange.has(c >>> 0)) >= 20, `${id} ${g}: the stripes follow the arms`);
    // (the bomber's rib cuff is a small accent at 2.15: a few px at each wrist, between the sleeve's hem and the hand)
    const cuff = (i) => parts.grp[i] === GROUPS.cuffA || parts.grp[i] === GROUPS.cuffB;
    if (id === 'kai' && FULL_TIME_LOOK.kai === 'A') assert.ok(count((c, i) => cuff(i) && orange.has(c >>> 0)) >= 3, `${id} ${g}: the orange cuffs`);
    for (const c of frame.px) assert.ok(PALETTE.has(c >>> 0), `${id} ${g}: palette only`);
  }
});

test('the old renderer: Kai and Rosa have their own sprite and close-up (every candidate), drawn in the palette', async () => {
  const { LOOKS: OLD, FULL_TIME_OLD, drawAnchor, drawHands } = await import('../public/js/anchors.js');
  const { lookOf, portraitOf } = await import('../public/js/cast.js');
  const { drawCloseup } = await import('../public/js/scenes/portraits.js');
  assert.equal(lookOf('kai'), OLD.kai);
  assert.equal(lookOf('rosa'), OLD.rosa);
  assert.notEqual(lookOf('kai'), OLD.A);
  assert.notEqual(lookOf('rosa'), OLD.B);
  assert.equal(OLD.kai, FULL_TIME_OLD.kai[FULL_TIME_LOOK.kai]);
  assert.equal(OLD.rosa, FULL_TIME_OLD.rosa[FULL_TIME_LOOK.rosa]);
  assert.equal(portraitOf('kai'), 'kai');
  assert.equal(portraitOf('rosa'), 'rosa');
  const st = { t: 1, speaking: true, emotion: 'neutral', mouth: 2, blink: false, look: 0, bob: 0, gesture: 0 };
  const styles = new Set();
  for (const p of ['kai', 'rosa']) {
    for (const l of ['A', 'B', 'C']) {
      const L = FULL_TIME_OLD[p][l];
      styles.add(L.style);
      FILLS.length = 0;
      drawAnchor(fakeCtx(), 118, 80, L, st);
      drawHands(fakeCtx(), 118, 118, L, 0);
      assert.ok(FILLS.length > 40, `${p} ${l}: a sprite`);
      for (const f of FILLS) assert.ok(HEX.has(String(f.c).toLowerCase()), `${p} ${l}: ${f.c} off the palette`);
      // the close-up: its layers are built from palette ramps only
      IMAGES.length = 0;
      drawCloseup(fakeCtx(), 1, `${p}-${l.toLowerCase()}`, st, { side: p === 'kai' ? 'left' : 'right', accent: P.orange });
      assert.ok(IMAGES.length >= 4, `${p} ${l}: the close-up's layers`);
      for (const img of IMAGES) {
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const hex = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
          assert.ok(HEX.has(hex), `${p} ${l}: close-up colour ${hex} off the palette`);
        }
      }
    }
  }
  // six hair styles of their own, none of them another presenter's in this renderer
  const taken = new Set(['paco', 'lola', 'max', 'ada', 'nova', 'penny', 'sam'].map((id) => OLD[id].style));
  assert.equal(styles.size, 6);
  for (const s of styles) assert.ok(!taken.has(s), `${s} is another presenter's style`);
  // the aliases the old studio uses resolve to the candidate on air
  IMAGES.length = 0;
  drawCloseup(fakeCtx(), 1, 'kai', st, { side: 'left' });
  assert.ok(IMAGES.length >= 4, 'kai alias builds its own close-up');
});

test('the guests never repeat Kai or Rosa: they are in the twin guard, a bald bearded guest goes grey at the sides', () => {
  assert.ok(NAMED_IDS.includes('kai') && NAMED_IDS.includes('rosa'));
  const bald = guestSpec('rp_bald0001', { v: 1, presentation: 'man', age: 'adult', build: 'average', skin: 'tan', hair: { style: 'bald' }, facialHair: { style: 'short-beard' }, glasses: 'none', wear: { outfit: 'suit', main: 'navy', tie: 'plain' } });
  assert.equal(bald.twin, null);
  assert.equal(twinOf(guestFeatures(bald)), null, 'not Kai');
  if (FULL_TIME_LOOK.kai === 'A') assert.notEqual(bald.hair.colour, 'none', 'the clipped sides step aside from Kai\'s dark');
  const pony = guestSpec('rp_pony0001', { v: 1, presentation: 'woman', age: 'adult', build: 'average', skin: 'light', hair: { style: 'ponytail', colour: 'black' }, facialHair: { style: 'none' }, glasses: 'none', wear: { outfit: 'blazer', main: 'charcoal', tie: 'none' } });
  assert.equal(pony.twin, null);
  assert.equal(twinOf(guestFeatures(pony)), null, 'not Rosa');
});

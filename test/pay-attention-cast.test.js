// PAY ATTENTION's host on screen and on air (docs/programmes/pay-attention.md §2, build step 6; critique
// docs/roadmap/critique/pay-attention-cast.md): a new character, the quizmaster, registered as the presenter `qm`; three
// candidate looks, names and voices for the owner, one switch (public/js/pay-attention-looks.js) for both renderers;
// each face unlike every other on the channel at 1x, drawn in the palette, hair (or headwear) of its own, its tells
// readable in the wide, its mouth, blinks and quizmaster's gestures working, nothing clipped at the centre podium; each
// voice built of components no one else on the channel uses; the guests never repeat the host.
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
const { HOST_LOOK, HOST_CANDIDATES: LETTERS } = await import('../public/js/pay-attention-looks.js');
const { LOOKS, PRESENTER_IDS, CORRESPONDENT_LOOKS, EXPERT_LOOKS, CANDIDATE_LOOKS, lookFor } = await import('../public/js/v2/canvas25d/cast/index.js');
const { HOST_CANDIDATES, CANDIDATE_NOTES, HOST_NAMES, HOST_GESTURES } = await import('../public/js/v2/canvas25d/cast/pay-attention.js');
const { frame, parts, drawActors } = await import('../public/js/v2/canvas25d/scene.js');
const { C, u32 } = await import('../public/js/v2/canvas25d/pixbuf.js');
const { GROUPS, GROUPS_PER_ACTOR } = await import('../public/js/v2/canvas25d/character.js');
const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
const { buildSpeech } = await import('../public/js/v2/canvas25d/visemes.js');
const { GESTURES } = await import('../public/js/v2/canvas25d/gestures/index.js');
const cam = await import('../public/js/v2/canvas25d/camera.js');
const { SET } = await import('../public/js/v2/canvas25d/studio/geometry.js');
const { REMOTE } = await import('../public/js/v2/canvas25d/studio/remote.js');
const { NAMED_IDS } = await import('../public/js/v2/canvas25d/cast/guest.js');
const { SCARF_GROUP } = await import('../public/js/v2/canvas25d/cast/hair-quiz.js');

const W = 384, H = 216;
const CHANNEL = JSON.parse(fs.readFileSync(new URL('../config/channel.json', import.meta.url)));
const CASTING = JSON.parse(fs.readFileSync(new URL('../server/voice/casting.json', import.meta.url)));
const ADCAST = JSON.parse(fs.readFileSync(new URL('../server/voice/adcast.json', import.meta.url)));
const PALETTE = new Set(Object.values(C).map((c) => c >>> 0));
const HEX = new Set(Object.values(P).map((h) => h.toLowerCase()));
const OTHERS = [...Object.values(LOOKS), ...Object.values(CORRESPONDENT_LOOKS), ...Object.values(EXPERT_LOOKS)].filter((L) => L.id !== 'qm');
const CANDIDATES = Object.values(HOST_CANDIDATES);
// the head's groups; for the hijab its own group with them (it frames the face; other looks use the look-owned groups
// for lapels and collars)
const HEAD = new Set([GROUPS.hairBack, GROUPS.ears, GROUPS.head, GROUPS.hair, GROUPS.over]);
const HEAD_HIJAB = new Set([...HEAD, SCARF_GROUP]);
const headOf = (L) => (L.outfit === 'hijabJacket' ? HEAD_HIJAB : HEAD);

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
const set = (...hex) => new Set(hex.map((h) => u32(h) >>> 0));

test('the host is the presenter qm: registered in the config and the cast, its look the candidate the switch names', () => {
  const qm = CHANNEL.presenters.qm;
  assert.ok(qm, 'qm is a presenter in config/channel.json');
  assert.equal(qm.role, 'Quizmaster');
  assert.equal(qm.name, HOST_NAMES.A.name, 'the option-A name stands until the owner chooses');
  assert.match(qm.personality, /provisional/, 'the name is marked provisional');
  for (const l of ['A', 'B', 'C']) assert.ok(qm.personality.includes(HOST_NAMES[l].name), `the personality names option ${l}`);
  assert.match(qm.personality, /quick, warm and exact/);
  assert.equal(qm.voice.gender, HOST_NAMES.A.gender);
  assert.ok(PRESENTER_IDS.includes('qm'));
  assert.equal(LOOKS.qm.id, 'qm');
  assert.equal(lookFor('qm', qm), LOOKS.qm, 'its own look, not a fallback');
  assert.deepEqual(LETTERS, ['A', 'B', 'C']);
  assert.ok(LETTERS.includes(HOST_LOOK));
  assert.deepEqual(Object.keys(HOST_CANDIDATES), ['A', 'B', 'C']);
  const L = HOST_CANDIDATES[HOST_LOOK];
  for (const k of ['hair', 'hairBack', 'over', 'head', 'sleeves']) assert.equal(LOOKS.qm.parts[k], L.parts[k], `qm.parts.${k}`);
  for (const k of ['outfit', 'skin', 'jacket', 'head', 'hair']) assert.deepEqual(LOOKS.qm[k], L[k], `qm.${k}`);
  for (const l of ['A', 'B', 'C']) assert.ok(CANDIDATE_NOTES[l]?.length > 60, `${l} is described`);
  // the candidates are looked up by their own ids (labs, framing), never as presenters
  for (const C0 of CANDIDATES) {
    assert.equal(lookFor(C0.id), C0);
    assert.equal(CANDIDATE_LOOKS[C0.id], C0);
    assert.ok(!PRESENTER_IDS.includes(C0.id));
  }
});

test('three names in the channel\'s style, one per look, none a name the channel already uses', () => {
  const taken = Object.values(CHANNEL.presenters).filter((p, i) => Object.keys(CHANNEL.presenters)[i] !== 'qm').map((p) => p.name.replace(/^Dr /, ''));
  const firsts = new Set(taken.map((n) => n.split(' ')[0]));
  const lasts = new Set(taken.map((n) => n.split(' ').slice(-1)[0]));
  for (const l of ['A', 'B', 'C']) {
    const { name, gender, personality } = HOST_NAMES[l];
    assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/, `${l}: a first name and a word of the trade, like Kai Sprite`);
    const [first, last] = name.split(' ');
    assert.ok(!firsts.has(first) && !lasts.has(last), `${l}: ${name} shares a name with the cast`);
    assert.ok(['female', 'male'].includes(gender));
    assert.ok(personality.length > 60, `${l}: a one-line personality`);
  }
  assert.equal(new Set(['A', 'B', 'C'].map((l) => HOST_NAMES[l].name)).size, 3);
});

test('every candidate draws hair (or headwear) of its own: never anyone else\'s drawer, never another candidate\'s', () => {
  const others = new Map();
  for (const L of [...OTHERS, ...Object.values(CANDIDATE_LOOKS).filter((L) => !L.id.startsWith('qm'))]) for (const k of ['hair', 'hairBack']) if (L.parts[k]) others.set(L.parts[k], L.id);
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
    for (const s of [1, 1.5, 2.15, 3.4, 4.4]) {
      solo(L, s, 1.3);
      for (const c of frame.px) assert.ok(PALETTE.has(c >>> 0), `${L.id} s${s}: a colour off the palette`);
    }
    frame.px.fill(C.ink);
    drawActors(1, [{ actor: mk(L, { side: 0 }), x: REMOTE.x, y: REMOTE.y, s: REMOTE.s, clip: false }]);
    const drawn = count((c) => c !== C.ink);
    assert.ok(drawn > 6000, `${L.id} is drawn (${drawn} px)`);
  }
});

test('unlike every face on the channel at 1x: the dark mass sits elsewhere, and the figure\'s colours are its own', () => {
  // where the dark goes in the head is what tells two faces apart at 1x; the cast's own nearest pairs overlap
  // 0.51-0.77 by this measure; FULL TIME's faces stay at or under 0.5, and so does every host candidate
  const darkMask = (L, s) => {
    solo(L, s, 1, {}, 150);
    const m = new Uint8Array(W * H);
    const hd = headOf(L);
    for (let i = 0; i < m.length; i++) if (parts.mat[i] && hd.has(parts.grp[i]) && lum(frame.px[i]) < 80) m[i] = 1;
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
    for (const L of CANDIDATES) {
      const me = darkMask(L, s);
      for (const [o, m] of masks) assert.ok(iou(me, m) <= 0.5, `s${s} ${L.id} vs ${o}: dark mass overlaps ${iou(me, m).toFixed(2)}`);
    }
  }
  // the whole figure's colour histogram (as the experts' test: no one is a recoloured twin of anyone), FULL TIME's
  // candidates too (the owner may yet put one of them on air)
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
  const ft = Object.values(CANDIDATE_LOOKS).filter((L) => !L.id.startsWith('qm'));
  const H0 = new Map([...OTHERS, ...ft].map((L) => [L.id, hist(L)]));
  const mine = CANDIDATES.map((L) => [L.id, hist(L)]);
  for (const [id, me] of mine) for (const [o, h] of H0) assert.ok(diff(me, h) > 0.35, `${id} vs ${o}: ${diff(me, h).toFixed(2)}`);
  // and apart from each other: three choices, not one look in three colours
  for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) assert.ok(diff(mine[i][1], mine[j][1]) > 1, `${mine[i][0]} vs ${mine[j][0]}`);
});

test('what makes each one reads in the wide (s 1): A\'s two puffs and red jacket, B\'s streak, bow tie and cream jacket, C\'s hijab', () => {
  for (const L of CANDIDATES) {
    const h = solo(L, 1, 1, {}, 150);
    const s = h.s, cx = Math.round(h.cx), cy = Math.round(h.cy);
    const neck = 150;
    const hair = (i) => parts.mat[i] && (parts.grp[i] === GROUPS.hair || parts.grp[i] === GROUPS.hairBack);
    if (L.id === 'qm-a') {
      // two clouds above the crown, a gap between them where the head's top shows below the puffs' tops
      const top = (x0, x1) => {
        let t = H;
        for (let x = x0; x < x1; x++) for (let y = 0; y < H; y++) if (hair(y * W + x)) { t = Math.min(t, y); break; }
        return t;
      };
      const left = top(cx - Math.round(8 * s), cx - Math.round(3 * s)), right = top(cx + Math.round(3 * s), cx + Math.round(8 * s)), mid = top(cx, cx + 1);
      assert.ok(left < cy - 11 * s && right < cy - 11 * s, `A: both puffs rise over the crown (${left}, ${right}, crown ${cy - 10 * s})`);
      assert.ok(mid - Math.max(left, right) >= 2, `A: the gap between the puffs reads (${mid} vs ${left}/${right})`);
      assert.ok(count((c) => set(P.red, P.pink, P.darkRed).has(c >>> 0), cx - 20, neck, cx + 21, neck + 20) >= 150, 'A: the red jacket');
    }
    if (L.id === 'qm-b') {
      assert.ok(count((c) => set(P.purple, P.magenta).has(c >>> 0), cx - 4, neck - 2, cx + 5, neck + 4) >= 2, 'B: the purple bow at the throat');
      assert.ok(count((c) => set(P.cream).has(c >>> 0), cx - 20, neck, cx + 21, neck + 20) >= 150, 'B: the cream jacket');
      assert.ok(count((c) => set(P.silver, P.white, P.fog).has(c >>> 0), cx - 4, cy - 12 * s, cx + 4, cy - 6 * s) >= 2, 'B: the silver streak in the hair');
    }
    if (L.id === 'qm-c') {
      const blue = set(P.blue, P.cyan, P.navy);
      assert.ok(count((c) => blue.has(c >>> 0), cx - 4, cy - 12 * s, cx + 5, cy - 7 * s) >= 6, 'C: the hijab over the crown');
      assert.ok(count((c) => blue.has(c >>> 0), cx - 10, cy - 2, cx - 5, cy + 6) >= 4, 'C: beside the face, key side');
      assert.ok(count((c) => blue.has(c >>> 0), cx + 5, cy - 2, cx + 10, cy + 6) >= 4, 'C: beside the face, far side');
      assert.ok(count((c) => blue.has(c >>> 0), cx - 14, neck - 2, cx + 15, neck + 6) >= 40, 'C: the drape round the neck and on the shoulders');
    }
  }
});

test('mouth, eyes and blinks work for every candidate (the hijab never covers the mouth, even wide open)', () => {
  for (const L of CANDIDATES) {
    const speech = buildSpeech('Good evening. And the answer is B, as told on Tuesday. Three points to Penny.', { t0: 0.4 });
    const a = mk(L, { speech });
    let open = 0, shut = 0;
    for (let t = 0.45; t < 4 && !(open && shut); t += 0.02) {
      const f = poseAt(a, t).face;
      if (!open && f.open > 0.8) open = t;
      if (!shut && f.open < 0.05 && f.speaking) shut = t;
    }
    assert.ok(open && shut, `${L.id}: the line opens and closes the mouth`);
    const s = 3.4;
    const grab = (t) => {
      const h = solo(L, s, t, { speech });
      const box = [Math.round(h.cx - 3 * s), Math.round(h.cy + 4 * s), Math.round(h.cx + 3 * s), Math.round(h.cy + 8.5 * s)];
      const px = [];
      for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) px.push(frame.px[y * W + x]);
      return { px };
    };
    const A = grab(open), B = grab(shut);
    const changed = A.px.filter((c, i) => c !== B.px[i]).length;
    assert.ok(changed >= 12, `${L.id}: the mouth moves (${changed} px)`);
    const lips = set(L.mouth.lip, L.mouth.lipHi, L.mouth.upper);
    assert.ok(B.px.filter((c) => lips.has(c >>> 0)).length >= 3, `${L.id}: the lips show when closed`);
    // nothing of the hair or the hijab over the mouth itself (its width, from above the upper lip to below the lower
    // one), open or shut
    for (const t of [open, shut]) {
      const h = solo(L, s, t, { speech });
      for (let y = Math.round(h.cy + (L.mouth.y - 1.4) * s); y < Math.round(h.cy + (L.mouth.y + 1.8) * s); y++) {
        for (let x = Math.round(h.cx - (L.mouth.w / 2 + 0.4) * s); x < Math.round(h.cx + (L.mouth.w / 2 + 0.4) * s); x++) {
          const g = parts.grp[y * W + x];
          assert.ok(g !== GROUPS.hair && g !== SCARF_GROUP, `${L.id}: something over the mouth at ${x},${y}`);
        }
      }
    }
    const b = mk(L);
    let bt = 0;
    for (let t = 0.1; t < 12 && !bt; t += 0.01) if (poseAt(b, t).face.blink > 0.95) bt = t;
    assert.ok(bt, `${L.id} blinks`);
    const eyes = (t) => {
      const h = solo(L, s, t);
      const out = [];
      for (let y = Math.round(h.cy - 2 * s); y < Math.round(h.cy + 1 * s); y++) for (let x = Math.round(h.cx - 5 * s); x < Math.round(h.cx + 5 * s); x++) out.push(frame.px[y * W + x]);
      return out;
    };
    const E1 = eyes(bt), E0 = eyes(bt + 0.4);
    assert.ok(E1.filter((c, i) => c !== E0[i]).length >= 8, `${L.id}: the blink shows`);
  }
});

test('nothing is clipped at the centre podium: the whole head in the wide three-shot, the host\'s singles and closes', () => {
  const speech = buildSpeech('Lock it in.', { t0: 0.3 });
  for (const L of CANDIDATES) {
    const cases = [
      ['wide', cam.framing('wide', { cast: { A: 'penny', B: 'nova' }, focus: 'A', programId: 'world-now' })],
      ['mcu', cam.framing('mcu', { cast: { A: L.id }, solo: true, programId: 'world-now' })],
      ['close', cam.framing('close', { cast: { A: L.id }, solo: true, programId: 'world-now' })],
      ['single', cam.framing('single', { cast: { A: L.id }, solo: true, programId: 'world-now' })],
    ];
    for (const [shot, camera] of cases) {
      for (const t of [0.6, 2.2]) {
        frame.px.fill(C.ink);
        const p = cam.placeActor(camera, SET.seatX.solo ?? 0);
        drawActors(t, [{ actor: mk(L, { speech }), x: p.x, y: p.y, s: p.s }]);
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let i = 0; i < W * H; i++) {
          if (!parts.mat[i] || !headOf(L).has(parts.grp[i] % GROUPS_PER_ACTOR)) continue;
          const x = i % W, y = (i / W) | 0;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        assert.ok(x1 >= 0, `${L.id} ${shot}: drawn`);
        assert.ok(x0 > 1 && x1 < W - 2 && y0 > 1 && y1 < H - 2, `${L.id} ${shot} t${t}: head ${x0},${y0}-${x1},${y1} clipped`);
      }
    }
  }
});

test('the quizmaster\'s gestures: the channel\'s own, no laugh and nothing that takes a side; every one works on every look', () => {
  const { allow, listener, deny } = HOST_GESTURES;
  for (const g of [...allow, ...listener, ...deny]) assert.ok(GESTURES[g], `${g} is a gesture of the channel`);
  for (const g of allow) assert.ok(!deny.includes(g), `${g} both allowed and denied`);
  for (const g of ['laugh', 'thumbs_up', 'shake_head', 'facepalm', 'wow', 'fist_pump']) assert.ok(deny.includes(g) && !allow.includes(g), `${g} is never the host's`);
  for (const g of ['point_partner', 'point_screen', 'count', 'lean_in', 'nod']) assert.ok(allow.includes(g), `a quizmaster ${g}s`);
  for (const L of CANDIDATES) {
    for (const g of allow) {
      solo(L, 2.15, 1.0, { gestures: [{ name: g, t0: 0.3 }] }, 100);
      const hand = (i) => parts.grp[i] === GROUPS.handA || parts.grp[i] === GROUPS.handB;
      assert.ok(count((c, i) => hand(i)) > 60, `${L.id} ${g}: hands drawn`);
      for (const c of frame.px) assert.ok(PALETTE.has(c >>> 0), `${L.id} ${g}: palette only`);
    }
  }
});

test('the old renderer: the host has its own sprite and close-up (every candidate), drawn in the palette', async () => {
  const { LOOKS: OLD, HOST_OLD, drawAnchor, drawHands } = await import('../public/js/anchors.js');
  const { lookOf, portraitOf } = await import('../public/js/cast.js');
  const { drawCloseup } = await import('../public/js/scenes/portraits.js');
  assert.equal(lookOf('qm'), OLD.qm);
  assert.equal(OLD.qm, HOST_OLD[HOST_LOOK]);
  assert.equal(portraitOf('qm'), 'qm');
  const st = { t: 1, speaking: true, emotion: 'neutral', mouth: 2, blink: false, look: 0, bob: 0, gesture: 0 };
  const styles = new Set();
  for (const l of ['A', 'B', 'C']) {
    const L = HOST_OLD[l];
    assert.equal(L.name, HOST_NAMES[l].name.toUpperCase());
    styles.add(L.style);
    FILLS.length = 0;
    drawAnchor(fakeCtx(), 118, 80, L, st);
    drawHands(fakeCtx(), 118, 118, L, 0);
    assert.ok(FILLS.length > 40, `${l}: a sprite`);
    for (const f of FILLS) assert.ok(HEX.has(String(f.c).toLowerCase()), `${l}: ${f.c} off the palette`);
    IMAGES.length = 0;
    drawCloseup(fakeCtx(), 1, `qm-${l.toLowerCase()}`, st, { side: 'left', accent: P.purple });
    assert.ok(IMAGES.length >= 4, `${l}: the close-up's layers`);
    for (const img of IMAGES) {
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const hex = '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        assert.ok(HEX.has(hex), `${l}: close-up colour ${hex} off the palette`);
      }
    }
  }
  // three hair styles of their own, none of them anyone else's in this renderer
  const taken = new Set(Object.entries(OLD).filter(([id]) => id !== 'qm').map(([, L]) => L.style));
  assert.equal(styles.size, 3);
  for (const s of styles) assert.ok(!taken.has(s), `${s} is another presenter's style`);
  IMAGES.length = 0;
  drawCloseup(fakeCtx(), 1, 'qm', st, { side: 'left' });
  assert.ok(IMAGES.length >= 4, 'the qm alias builds its own close-up');
});

test('three voices for the owner, each built of components no one else on the channel uses, the settings distinct', () => {
  const parts0 = (spec) => spec.split('+').map((p) => p.split(':')[0]);
  const qm = CASTING.qm;
  assert.ok(qm?.voice, 'qm has a cast voice');
  assert.deepEqual(Object.keys(qm.candidates), ['A', 'B', 'C']);
  assert.equal(qm.voice, qm.candidates[HOST_LOOK].voice, 'the voice on air is the provisional candidate\'s');
  assert.equal(qm.lang, CHANNEL.presenters.qm.voice.lang.toLowerCase(), 'read with the accent of the config');
  // every component anyone else speaks with: presenters, correspondents, experts, the continuity announcer, the adverts
  const taken = new Map();
  for (const [id, c] of Object.entries(CASTING)) if (id !== 'qm') for (const v of parts0(c.voice)) taken.set(v, id);
  for (const [id, a] of Object.entries(ADCAST)) {
    if (id === '_note') continue;
    for (const c of id === 'default' ? Object.values(a) : [a]) for (const v of parts0(c.voice)) taken.set(v, `advert ${id}`);
  }
  const configs = Object.entries(CHANNEL.presenters).filter(([id]) => id !== 'qm').map(([, p]) => p.voice);
  const tuple = (v) => `${v.gender}|${v.lang.toLowerCase()}|${v.pitch}|${v.rate}`;
  const tuples = new Set(configs.map(tuple));
  const seen = new Set();
  for (const l of ['A', 'B', 'C']) {
    const c = qm.candidates[l];
    assert.match(c.voice, /^[a-z]{2}_[a-z]+(:\d*\.?\d+)?(\+[a-z]{2}_[a-z]+:\d*\.?\d+)*$/);
    for (const v of parts0(c.voice)) assert.ok(!taken.has(v), `${l}: ${v} is ${taken.get(v)}'s`);
    assert.ok(!seen.has(c.voice), `${l}: another candidate's voice`);
    seen.add(c.voice);
    assert.equal(c.gender, HOST_NAMES[l].gender, `${l}: the voice fits the look`);
    assert.ok(c.speed >= 0.8 && c.speed <= 1.15, `${l}: speed ${c.speed} where Kokoro stays natural`);
    assert.ok(['en-us', 'en-gb'].includes(c.lang));
    // the browser's fallback settings (config voice) are a combination no one else has
    const cfg = { gender: c.gender, lang: c.lang === 'en-gb' ? 'en-GB' : 'en-US', pitch: c.pitch, rate: c.rate };
    assert.ok(!tuples.has(tuple(cfg)), `${l}: the config voice ${tuple(cfg)} is someone else's`);
    assert.ok(!configs.some((v) => v.pitch === c.pitch && v.rate === c.rate && v.gender === c.gender), `${l}: the same pitch and rate as someone else`);
    assert.ok(c.notes?.length > 30, `${l}: measured and described`);
  }
  // the presenter entry carries candidate A's settings
  const A = qm.candidates[HOST_LOOK];
  assert.deepEqual(CHANNEL.presenters.qm.voice, { gender: A.gender, lang: A.lang === 'en-gb' ? 'en-GB' : 'en-US', pitch: A.pitch, rate: A.rate });
  // the pauses are the host's own (a beat before an answer), never a copy of another voice's set
  const own = JSON.stringify(qm.pauses);
  for (const [id, c] of Object.entries(CASTING)) if (id !== 'qm' && c.pauses) assert.notEqual(JSON.stringify(c.pauses), own, `the pause set is ${id}'s`);
  // the auditions are in the lab, one per candidate
  for (const l of ['a', 'b', 'c']) assert.ok(fs.statSync(new URL(`../public/lab/pay-attention-voices/host-${l}.ogg`, import.meta.url)).size > 50_000, `host-${l}.ogg`);
});

test('the guests never repeat the host: qm is in the twin guard', () => {
  assert.ok(NAMED_IDS.includes('qm'));
});

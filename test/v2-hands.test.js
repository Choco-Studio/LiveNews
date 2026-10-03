// HANDS & GESTURES (w2-hands): the gesture library, the rig's blending, the
// hands renderer and the speaker gesture planner (direction/gestures.js).
// Numbers come from PLAN §3 and the programme bibles' acceptance checklists;
// the owner-approved motion is test/fixtures/v2-motion-baseline.json (never
// regenerated) plus its idle-only companion v2-hands-idle-baseline.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTIONS } from '../public/js/cues.js';
import { GESTURES, APPROVED, defOf, rateOf, durOf } from '../public/js/v2/canvas25d/gestures/index.js';
import { poseAt } from '../public/js/v2/canvas25d/rig.js';
import { actor } from '../public/js/v2/canvas25d/scene.js';
import { TILT, HIP } from '../public/js/v2/canvas25d/space.js';
import { PartBuffer, Frame, MAT } from '../public/js/v2/canvas25d/pixbuf.js';
import { drawArm, drawHand, handGeometry, newHandGeometry, RASTER_STATS } from '../public/js/v2/canvas25d/hands.js';
import { glassesAnchor } from '../public/js/v2/canvas25d/glasses.js';
import { drawCharacter, GROUPS } from '../public/js/v2/canvas25d/character.js';
import { SHAPES } from '../public/js/v2/canvas25d/gestures/shapes.js';
import { paceFor } from '../public/js/pace.js';
import { matsOf } from '../public/js/v2/canvas25d/cast/base.js';
import { LOOKS, PRESENTER_IDS } from '../public/js/v2/canvas25d/cast/index.js';
import { planSegment } from '../public/js/v2/canvas25d/direction/index.js';
import { planGestures, CONFIG_POLICY, BIBLE, countFromText, episodePlan, familyOf, gestureVisible, handBandOf, DEBUG } from '../public/js/v2/canvas25d/direction/gestures.js';
import { framing as cameraFraming, placeActor } from '../public/js/v2/canvas25d/camera.js';
import { SET } from '../public/js/v2/canvas25d/studio/geometry.js';
import { segmentContext } from '../public/js/v2/canvas25d/direction/context.js';

const BASE = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-motion-baseline.json', import.meta.url), 'utf8'));
const IDLE = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-hands-idle-baseline.json', import.meta.url), 'utf8'));
const CHANNEL = JSON.parse(fs.readFileSync(new URL('../config/channel.json', import.meta.url), 'utf8'));
const S = 2.15, DT = 0.04, T0 = 0.3;

// ---------------------------------------------------------------------------
// motion sampling (same protocol as $SP/w2arch/motionbase.mjs)

function sample(ev, { presenter = 'paco', side = 1, seed = 11, dt = DT, tail = 0.6 } = {}) {
  const a = actor(presenter, { side, seed, gestures: [{ t0: T0, ...ev }] });
  const idle = actor(presenter, { side, seed });
  const dur = durOf({ t0: T0, ...ev });
  const frames = [];
  for (let t = 0; t <= T0 + dur + tail + 1e-9; t += dt) {
    const sk = poseAt(a, t);
    const si = poseAt(idle, t);
    frames.push({
      t: Math.round(t * 1000) / 1000,
      wristL: [...sk.arms.L.wrist], wristR: [...sk.arms.R.wrist],
      idleL: [...si.arms.L.wrist], idleR: [...si.arms.R.wrist],
      head: [sk.head.x, sk.head.y, sk.head.yaw, sk.head.pitch, sk.head.roll],
      idleHead: [si.head.x, si.head.y, si.head.yaw, si.head.pitch, si.head.roll],
      elbowR: [...sk.arms.R.elbow], handDirR: [...sk.arms.R.handDir],
    });
  }
  return frames;
}

const scr = (p) => [p[0] * S, (p[1] + p[2] * TILT) * S];

/** Max wrist step in px per 0.04 s at s = 2.15 and the max change between consecutive steps. */
function popNumbers(frames) {
  let prev = null, prevStep = null, maxStep = 0, maxJerk = 0;
  for (const f of frames) {
    const cur = [scr(f.wristL), scr(f.wristR)];
    if (prev) {
      const step = Math.max(Math.hypot(cur[0][0] - prev[0][0], cur[0][1] - prev[0][1]), Math.hypot(cur[1][0] - prev[1][0], cur[1][1] - prev[1][1]));
      maxStep = Math.max(maxStep, step);
      if (prevStep !== null) maxJerk = Math.max(maxJerk, Math.abs(step - prevStep));
      prevStep = step;
    }
    prev = cur;
  }
  return { maxStep, maxJerk };
}

const allEvents = () => {
  const out = [];
  for (const [name, g] of Object.entries(GESTURES)) {
    out.push({ name });
    for (const v of Object.keys(g.variants || {})) out.push({ name, variant: v });
    if (g.forN) for (const n of [1, 2, 4, 5]) out.push({ name, n });
  }
  return out;
};
const label = (e) => `${e.name}${e.variant ? ':' + e.variant : ''}${e.n ? ' n=' + e.n : ''}`;

// ---------------------------------------------------------------------------
// library

test('every cues.js ACTION is a v2 gesture, with timing metadata that keeps the planner rules possible', () => {
  for (const name of Object.keys(ACTIONS)) assert.ok(GESTURES[name], `missing gesture ${name}`);
  for (const e of allEvents()) {
    const d = defOf(e);
    assert.ok(d && d.dur > 0, label(e));
    assert.ok(d.stroke >= 0 && d.stroke < d.apex && d.apex <= d.hold && d.hold < d.dur, `${label(e)} stroke < apex <= hold < dur`);
    assert.ok(d.apex - d.stroke <= 0.4 + 1e-9, `${label(e)}: stroke to apex ≤ 0.4 s (start 0.2-0.3 s before the word, apex ±0.1 s)`);
    assert.ok(d.dur - d.hold >= 0.4 - 1e-9, `${label(e)}: release ≥ 0.4 s`);
    // every track starts and ends at rest (clean return), and the override tracks end exactly at rest
    for (const ch of d._ch) {
      const last = ch.keys[ch.keys.length - 1][1];
      if (ch.override) assert.deepEqual(last, ch.rest, `${label(e)} ${ch.ch} ends at rest`);
      else assert.ok(Math.abs(last) < 1e-9, `${label(e)} ${ch.ch} ends at 0`);
    }
  }
});

test('event parameters: count n 1..5 changes the fingers, variants exist, amp slows (never below 0.8) and shrinks', () => {
  for (let n = 1; n <= 5; n++) assert.equal(defOf({ name: 'count', n }).n, n);
  assert.equal(defOf({ name: 'count', n: 3 }).dur, GESTURES.count.dur, 'n = 3 is the approved count');
  assert.equal(defOf({ name: 'count', n: 9 }).n, 5, 'clamped');
  assert.ok(GESTURES.point_partner.variants.after_you);
  assert.ok(GESTURES.nod.variants.crisp && GESTURES.shake_head.variants.slow && GESTURES.raise_hand.variants.two);
  assert.equal(rateOf({ name: 'nod', amp: 0.5 }), 0.8);
  assert.equal(rateOf({ name: 'nod', amp: 0.2 }), 0.8);
  assert.equal(rateOf({ name: 'nod', amp: 1, speed: 1.2 }), 1.2);
  const big = sample({ name: 'raise_hand' }), small = sample({ name: 'raise_hand', amp: 0.6 });
  const reach = (fr) => Math.max(...fr.map((f) => Math.hypot(...f.wristR.map((v, i) => v - f.idleR[i]))));
  assert.ok(reach(small) < reach(big) * 0.75, 'amp 0.6 makes the arc smaller');
  // n fingers up at the apex hold of count n
  for (let n = 1; n <= 5; n++) {
    const d = defOf({ name: 'count', n });
    const a = actor('paco', { side: 1, seed: 11, gestures: [{ name: 'count', n, t0: 0 }] });
    const sk = poseAt(a, d.hold - 0.05);
    const up = sk.arms.R.hand.curl.filter((c) => c < 0.3).length;
    assert.equal(up, n, `count n=${n}: ${n} fingers up`);
  }
});

// ---------------------------------------------------------------------------
// no pops (0.04 s steps, s = 2.15)

const APPROVED_MAX = { raise_hand: 9.47, wave: 13.95, point_screen: 11.45, count: 7.46, shrug: 3.96 };

test('no pops: wrist step and step-to-step change for every gesture, variant and count', () => {
  const rows = [];
  for (const e of allEvents()) {
    const { maxStep, maxJerk } = popNumbers(sample(e));
    rows.push(`${label(e).padEnd(24)} step ${maxStep.toFixed(2).padStart(6)} px  change ${maxJerk.toFixed(2)} px`);
    if (process.env.V2_HANDS_TABLE) console.log(rows[rows.length - 1]);
    const approved = APPROVED.includes(e.name) && !e.variant && !e.n;
    const cap = approved && APPROVED_MAX[e.name] ? APPROVED_MAX[e.name] * 1.15 : 14;
    assert.ok(maxStep <= cap + 1e-9, `${label(e)}: max wrist step ${maxStep.toFixed(2)} > ${cap.toFixed(2)} px`);
    assert.ok(maxJerk <= 4.5, `${label(e)}: step change ${maxJerk.toFixed(2)} > 4.5 px`);
  }
});

// critic r3: the wrist path was smooth while the HAND fluttered (raise_hand:lift turned through four unrelated
// shapes in 0.1 s; point_screen spun 34° in one frame as a ring-shaped fist at the lens). The whole hand frame
// (finger axis + palm normal) is now measured at 60 fps. Limit: 15° per frame (the approved raise_hand already
// turns its hand 8.9° per frame on the stroke and point_screen's approved 0.36 s stroke needs ~14°: a lower limit
// would retime the owner-approved strokes).
const HAND_TURN_MAX = 15;
function handTurns(ev, side, dt = 1 / 60) {
  const a = actor('paco', { side, seed: 11, gestures: [{ t0: T0, ...ev }] });
  const dur = durOf({ t0: T0, ...ev });
  const G = { L: newHandGeometry(), R: newHandGeometry() };
  const prev = { L: null, R: null };
  let frame = 0, dir = 0, at = 0;
  for (let t = 0; t <= T0 + dur + 0.2 + 1e-9; t += dt) {
    const sk = poseAt(a, t);
    for (const sd of ['L', 'R']) {
      const g = handGeometry(a.look, sk.arms[sd], sd === 'R' ? 1 : -1, G[sd]);
      const cur = [...g.f, ...g.n, ...g.t];
      const p = prev[sd];
      if (p) {
        const df = cur[0] * p[0] + cur[1] * p[1] + cur[2] * p[2];
        const dn = cur[3] * p[3] + cur[4] * p[4] + cur[5] * p[5];
        const dtt = cur[6] * p[6] + cur[7] * p[7] + cur[8] * p[8];
        const rot = (Math.acos(Math.max(-1, Math.min(1, (df + dn + dtt - 1) / 2))) * 180) / Math.PI;
        const turn = (Math.acos(Math.max(-1, Math.min(1, df))) * 180) / Math.PI;
        if (rot > frame) {
          frame = rot;
          at = t - T0;
        }
        dir = Math.max(dir, turn);
      }
      prev[sd] = cur;
    }
  }
  return { frame, dir, at };
}

test('hand orientation is continuous (critic r3): the hand frame turns ≤ 15° per 1/60 s frame in every gesture, variant and count, both seats', () => {
  const rows = [];
  for (const e of allEvents()) {
    for (const side of [1, -1]) {
      const r = handTurns(e, side);
      rows.push([label(e), side, r]);
      assert.ok(r.frame <= HAND_TURN_MAX, `${label(e)} seat ${side}: the hand turns ${r.frame.toFixed(1)}° in one frame at ${r.at.toFixed(2)} s`);
      assert.ok(r.dir <= HAND_TURN_MAX, `${label(e)} seat ${side}: the finger axis turns ${r.dir.toFixed(1)}° in one frame`);
    }
  }
  if (process.env.V2_HANDS_TABLE) {
    rows.sort((a, b) => b[2].frame - a[2].frame);
    console.log('hand turn per frame (deg): ' + rows.slice(0, 12).map(([n, s, r]) => `${n}${s < 0 ? ' B' : ''} ${r.frame.toFixed(1)}/${r.dir.toFixed(1)}`).join(', '));
  }
  // and the sweeps the critic named carry a twist-free palm through the lens direction
  for (const ev of [{ name: 'raise_hand', variant: 'lift' }, { name: 'point_screen' }, { name: 'shrug' }]) assert.ok(defOf(ev)._ch.some((c) => c.ch === 'palm' || c.ch === 'palmF'), `${label(ev)} carries a palm track`);
});

test('no pops in blends: an interruption mid-gesture, gesture-to-gesture overlaps, speed variants', () => {
  const cases = [
    [{ name: 'raise_hand', t0: 0.3 }, { name: 'point_screen', t0: 1.1 }],
    [{ name: 'point_screen', t0: 0.3 }, { name: 'steeple', t0: 1.0 }],
    [{ name: 'steeple', t0: 0.3 }, { name: 'raise_hand', t0: 1.2 }],
    [{ name: 'count', t0: 0.3, n: 4 }, { name: 'point_partner', t0: 1.5, variant: 'after_you' }],
    [{ name: 'wave', t0: 0.3 }, { name: 'nod', t0: 1.0 }],
    [{ name: 'raise_hand', t0: 0.3 }, { name: 'shrug', t0: 1.68 }],
    [{ name: 'chin', t0: 0.3, speed: 1.25 }, { name: 'glasses', t0: 1.4, speed: 0.85 }],
  ];
  for (const list of cases) {
    const a = actor('paco', { side: 1, seed: 11, gestures: list });
    const frames = [];
    for (let t = 0; t <= 5; t += DT) {
      const sk = poseAt(a, t);
      frames.push({ wristL: [...sk.arms.L.wrist], wristR: [...sk.arms.R.wrist] });
    }
    const { maxStep, maxJerk } = popNumbers(frames);
    const tag = list.map((g) => g.name).join(' → ');
    assert.ok(maxStep <= 14, `${tag}: step ${maxStep.toFixed(2)}`);
    assert.ok(maxJerk <= 4.5, `${tag}: change ${maxJerk.toFixed(2)}`);
    // back to rest at the end
    const end = poseAt(a, 6), rest = poseAt(actor('paco', { side: 1, seed: 11 }), 6);
    assert.ok(Math.hypot(...end.arms.R.wrist.map((v, i) => v - rest.arms.R.wrist[i])) < 0.05, `${tag}: clean return to rest`);
  }
});

// ---------------------------------------------------------------------------
// same feel as the owner-approved motion

test('the 7 approved gestures keep their feel (apex, wrist path, head, duration) against the motion baseline', () => {
  const idleAt = new Map(IDLE.frames.map((f) => [f.t, f]));
  for (const name of APPROVED) {
    const b = BASE.gestures[name];
    const fr = sample({ name });
    assert.ok(Math.abs(GESTURES[name].dur - b.dur) <= 0.1, `${name} dur`);
    // compare gesture deltas (gesture − idle) so a FACES idle change cannot fail this test
    let sw = 0, mw = 0, sy = 0, n = 0;
    for (const bf of b.frames) {
      const f = fr.find((x) => Math.abs(x.t - bf.t) < 1e-6);
      const i0 = idleAt.get(bf.t);
      if (!f || !i0) continue;
      for (const [k, ik, nk] of [['wristL', 'wristL', 'idleL'], ['wristR', 'wristR', 'idleR']]) {
        const db = bf[k].map((v, q) => v - i0[ik][q]);
        const dn = f[k].map((v, q) => v - f[nk][q]);
        const e = Math.hypot(...db.map((v, q) => v - dn[q]));
        sw += e * e;
        mw = Math.max(mw, e);
      }
      for (const q of [2, 3]) {
        const db = bf.head[q] - i0.head[q], dn = f.head[q] - f.idleHead[q];
        sy += (db - dn) ** 2;
      }
      n++;
    }
    const wristRms = Math.sqrt(sw / (2 * n)), headRms = Math.sqrt(sy / (2 * n));
    assert.ok(wristRms <= 1.5, `${name}: wrist path RMS ${wristRms.toFixed(3)} > 1.5`);
    assert.ok(mw <= 3.0, `${name}: wrist path max ${mw.toFixed(3)} > 3.0`);
    assert.ok(headRms <= 0.02, `${name}: head yaw/pitch RMS ${headRms.toFixed(4)} > 0.02`);
    // apex: wrist apex for arm gestures, head apex for head gestures
    const arm = GESTURES[name].arm;
    let best = -1, apex = 0;
    for (const f of fr) {
      const v = arm
        ? Math.max(...['L', 'R'].map((s) => Math.hypot(...f[`wrist${s}`].map((x, q) => x - f[`idle${s}`][q]))))
        : Math.abs(f.head[2] - f.idleHead[2]) + 2 * Math.abs(f.head[3] - f.idleHead[3]);
      if (v > best) {
        best = v;
        apex = f.t - T0;
      }
    }
    const want = arm ? b.apex : b.headApex;
    assert.ok(Math.abs(apex - want) <= 0.08, `${name}: apex ${apex.toFixed(2)} vs ${want}`);
  }
});

test('follow-through: the hand direction lags the forearm by 40-80 ms (raise_hand, point_screen)', () => {
  for (const name of ['raise_hand', 'point_screen']) {
    const fr = sample({ name }, { dt: 0.005, tail: 0.2 }).filter((f) => f.t >= T0);
    const norm = (v) => {
      const l = Math.hypot(...v) || 1;
      return v.map((x) => x / l);
    };
    const F = fr.map((f) => norm(f.wristR.map((v, i) => v - f.elbowR[i])));
    const Hd = fr.map((f) => f.handDirR);
    const w = (V) => V.slice(1).map((v, i) => {
      const u = V[i];
      return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    });
    const wf = w(F), wh = w(Hd);
    let best = -Infinity, lagMs = 0;
    for (let lag = 0; lag <= 30; lag++) {
      let s = 0, n1 = 0, n2 = 0;
      for (let i = 0; i + lag < wh.length; i++) {
        const p = wf[i], q = wh[i + lag];
        s += p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
        n1 += p[0] ** 2 + p[1] ** 2 + p[2] ** 2;
        n2 += q[0] ** 2 + q[1] ** 2 + q[2] ** 2;
      }
      const c = s / Math.sqrt(n1 * n2);
      if (c > best) {
        best = c;
        lagMs = lag * 5;
      }
    }
    assert.ok(lagMs >= 40 && lagMs <= 80, `${name}: hand lags the forearm by ${lagMs} ms`);
  }
});

test('evaluate is pure: any instant renders the same whatever was evaluated before', () => {
  const g = [{ name: 'steeple', t0: 0.3 }, { name: 'raise_hand', t0: 1.3 }, { name: 'nod', t0: 2.0 }];
  const a = actor('lola', { side: -1, seed: 5, gestures: g });
  const b = actor('lola', { side: -1, seed: 5, gestures: g.map((x) => ({ ...x })) });
  const at = (x, t) => JSON.stringify(poseAt(x, t).arms) + JSON.stringify(poseAt(x, t).head);
  const ref = at(a, 1.7);
  for (const t of [3.1, 0.2, 1.71, 2.5]) poseAt(b, t);
  assert.equal(at(b, 1.7), ref);
});

// ---------------------------------------------------------------------------
// rendering

test('arms and hands render for all 8 looks, both seats, every scale; robot hands for UNIT-8; seats mirror', () => {
  const buf = new PartBuffer();
  const frame = new Frame();
  for (const id of PRESENTER_IDS) {
    const L = LOOKS[id], m = matsOf(L);
    for (const side of [1, -1]) {
      const a = actor(id, { side, seed: 3, gestures: [{ name: 'count', n: 5, t0: 0 }] });
      const sk = poseAt(a, 1.2);
      for (const s of [1, 1.37, 2.15, 3.4]) {
        buf.clear();
        const toS = (x, y, z = 0) => [192 + x * s, 60 + (y + z * TILT) * s];
        drawArm(buf, L, m, sk.arms.L, -1, toS, s, 11, 12, 13, 20);
        drawArm(buf, L, m, sk.arms.R, 1, toS, s, 20, 21, 22, 24);
        let skin = 0;
        for (let i = 0; i < buf.mat.length; i++) if (buf.mat[i] && (buf.grp[i] === 13 || buf.grp[i] === 22)) skin++;
        assert.ok(skin > 6 * s * s, `${id} side ${side} s ${s}: hand pixels ${skin}`);
        buf.resolve(frame);
      }
    }
  }
  assert.equal(LOOKS.unit8.handStyle, 'robot');
  // mirror: seat A's near hand and seat B's near hand cover the same number of pixels
  const count = (side) => {
    const a = actor('paco', { side, seed: 3, gestures: [{ name: 'raise_hand', t0: 0 }] });
    const sk = poseAt(a, 0.9);
    buf.clear();
    const s = 2.15, toS = (x, y, z = 0) => [192 + x * s, 60 + (y + z * TILT) * s];
    const arm = side === 1 ? sk.arms.R : sk.arms.L;
    drawArm(buf, LOOKS.paco, matsOf(LOOKS.paco), arm, side === 1 ? 1 : -1, toS, s, 20, 21, 22, 24);
    let n = 0;
    for (let i = 0; i < buf.mat.length; i++) if (buf.mat[i] && buf.grp[i] === 22) n++;
    return n;
  };
  const nA = count(1), nB = count(-1);
  assert.ok(Math.abs(nA - nB) <= Math.max(4, nA * 0.08), `mirrored hands ${nA} vs ${nB}`);
});

// ---------------------------------------------------------------------------
// planner

const PROGRAMMES = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60'];
const FIX = Object.fromEntries(PROGRAMMES.map((p) => [p, JSON.parse(fs.readFileSync(new URL(`./fixtures/v2-episodes/${p}.json`, import.meta.url), 'utf8'))]));

function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixture episodes plus seeded variants: new ids (new seeds), random writer cues of all 20 actions, grave flags. */
function episodes(pid, n = 14) {
  const out = [FIX[pid]];
  const names = Object.keys(ACTIONS);
  for (let k = 0; k < n; k++) {
    const r = rnd(1000 + k * 77 + pid.length);
    const ep = JSON.parse(JSON.stringify(FIX[pid]));
    ep.id = `${ep.id}-v${k}`;
    for (const s of ep.segments) {
      const len = (s.text || '').length;
      if (r() < 0.6) {
        s.cues = Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ char: Math.floor(r() * len), slot: r() < 0.3 ? (s.anchor === 'A' ? 'B' : 'A') : null, action: names[Math.floor(r() * names.length)] }));
      }
      if (s.type === 'story' && r() < 0.2) s.emotion = 'serious';
    }
    out.push(ep);
  }
  return out;
}

function planEpisode(ep) {
  return ep.segments.map((_, i) => planSegment(ep, i, { presenters: CHANNEL.presenters }));
}

const gesturesOf = (res) => res.events.filter((e) => e.kind === 'gesture' && e.planner === 'gestures');
/** The bibles' cue-level gestures (their caps); beats are the owner's 20:40 delivery layer on top. */
const featuredOf = (res) => gesturesOf(res).filter((e) => !e.beat);
const beatsOf = (res) => gesturesOf(res).filter((e) => e.beat);

test('config parity: the client mirror equals config/channel.json programs.<id>.gestures', () => {
  for (const pid of PROGRAMMES) assert.deepEqual(CONFIG_POLICY[pid], CHANNEL.programs[pid].gestures, pid);
  assert.deepEqual(Object.keys(CONFIG_POLICY).sort(), Object.keys(CHANNEL.programs).filter((p) => CHANNEL.programs[p].gestures).sort());
});

test('the planner plans the speaker only: never a listener gesture, never look_partner', () => {
  for (const pid of PROGRAMMES) {
    for (const ep of episodes(pid, 6)) {
      for (const res of planEpisode(ep)) {
        for (const e of planGestures(res.ctx)) {
          if (e.kind !== 'gesture') continue;
          assert.equal(e.slot, res.ctx.speaker, `${pid}: listener gesture ${e.name}`);
          assert.notEqual(e.name, 'look_partner');
        }
      }
    }
  }
});

test('timing: anchored to a stressed word (stroke 0.2-0.3 s before, apex ±0.1 s), cut guard, one arm gesture per sentence', () => {
  for (const pid of PROGRAMMES) {
    for (const ep of episodes(pid, 6)) {
      for (const res of planEpisode(ep)) {
        const { ctx } = res;
        const evs = planGestures(ctx).filter((e) => e.kind === 'gesture');
        const perSentence = new Map();
        for (const e of evs) {
          const d = defOf(e), rate = rateOf(e);
          for (const c of ctx.shots) assert.ok(!(e.at >= c.at - 1e-9 && e.at < c.at + ctx.cutGuard - 1e-9), `${pid} ${e.name} starts ${e.at} in the guard of the cut at ${c.at}`);
          if (e.name === 'papers') {
            // after the last word (at most overlapping its last syllable when the hold is short)
            assert.ok(e.at >= ctx.duration - 0.15 - 1e-9, 'papers after the last word');
            continue;
          }
          const w = ctx.words.find((x) => x.char === e.word);
          assert.ok(w, 'anchored to a word');
          const lead = pid === 'cosmos' ? [0.3, 0.3] : [0.2, 0.3];
          assert.ok(w.stressed || w.content, `${pid} ${e.name}: anchor word is stressed (or the content word after a cue)`);
          const apex = e.at + d.apex / rate, start = e.at + d.stroke / rate;
          assert.ok(Math.abs(apex - w.t) <= 0.1 + 0.002, `${pid} ${e.name}: apex ${apex.toFixed(3)} vs word ${w.t.toFixed(3)}`);
          assert.ok(w.t - start >= lead[0] - 0.1001 && w.t - start <= lead[1] + 0.1001, `${pid} ${e.name}: stroke starts ${(w.t - start).toFixed(3)} s before the word`);
          if (d.arm) {
            const si = ctx.sentences.findIndex((s) => e.word < s.end);
            perSentence.set(si, (perSentence.get(si) || 0) + 1);
            assert.ok(perSentence.get(si) <= 1, `${pid}: two arm gestures in one sentence`);
          }
        }
      }
    }
  }
});

test('WORLD NOW §5 item 13: only allowlisted cues, grave = nod/steeple (small), ≤ 2 per story, none in a shot\'s first 0.5 s', () => {
  const allow = new Set(BIBLE['world-now'].speaker);
  for (const ep of episodes('world-now')) {
    for (const res of planEpisode(ep)) {
      const g = gesturesOf(res);
      for (const e of g) {
        assert.ok(allow.has(e.name), `world-now: ${e.name}`);
        if (res.ctx.grave) {
          assert.ok(['nod', 'steeple'].includes(e.name), `grave: ${e.name}`);
          assert.ok(e.amp <= 0.7, 'grave gestures are small');
        }
        for (const c of res.ctx.shots) assert.ok(!(e.at >= c.at && e.at < c.at + 0.5));
      }
      if (res.ctx.type === 'story') assert.ok(featuredOf(res).length <= 2, `story with ${featuredOf(res).length} cue-level gestures`);
    }
  }
});

test('TECH BYTES §4 item 6: Max ≤ 2 from his list, Ada ≤ 1 from hers, everything else dropped', () => {
  const B = BIBLE['tech-bytes'];
  for (const ep of episodes('tech-bytes')) {
    for (const res of planEpisode(ep)) {
      const g = gesturesOf(res);
      const id = res.ctx.speakerId;
      const list = new Set([...B.speaker[id], ...(res.ctx.type === 'intro' || res.ctx.type === 'outro' ? ['nod'] : [])]);
      for (const e of g) assert.ok(list.has(e.name), `${id}: ${e.name} in ${res.ctx.type}`);
      assert.ok(featuredOf(res).length <= B.cap[id], `${id}: ${featuredOf(res).length} gestures`);
      for (const e of g) if (e.name === 'shake_head' && id === 'ada') assert.equal(e.variant, 'slow');
    }
  }
});

test('COSMOS §5 item 12: no banned gesture, ≤ 1 per segment, ≤ 1 arm gesture per 6 s per presenter across the episode', () => {
  const banned = new Set(BIBLE.cosmos.banned);
  for (const ep of episodes('cosmos')) {
    let t = 0;
    const lastArm = {};
    for (const res of planEpisode(ep)) {
      const g = gesturesOf(res);
      assert.ok(featuredOf(res).length <= 1, 'perSegment 1');
      for (const e of g) {
        assert.ok(!banned.has(e.name), e.name);
        assert.ok(BIBLE.cosmos.speaker[res.ctx.speakerId].includes(e.name), `${res.ctx.speakerId}: ${e.name}`);
        if (res.ctx.speakerId === 'unit8' && e.name === 'nod') assert.equal(e.variant, 'crisp');
        if (defOf(e).arm) {
          const abs = t + e.at;
          const prev = lastArm[res.ctx.speaker];
          assert.ok(prev === undefined || abs - prev >= 6 - 1e-6, `arm gestures ${prev} and ${abs}`);
          lastArm[res.ctx.speaker] = abs;
        }
      }
      t += res.ctx.duration + 0.5;
    }
  }
});

test('MONEY MINUTE §5 item 14: allowed only, ≤ 1 per sentence and 2 per story, 0.6 s guard, figures land on still arms, lean_in once, papers after the sign-off', () => {
  const allow = new Set(['nod', 'steeple', 'lean_in', 'papers']);
  for (const ep of episodes('money-minute')) {
    let leanIns = 0, papers = 0;
    for (const res of planEpisode(ep)) {
      const { ctx } = res;
      const g = gesturesOf(res);
      const perSentence = new Map();
      let steeples = 0;
      for (const e of g) {
        assert.ok(allow.has(e.name), e.name);
        for (const c of ctx.shots) assert.ok(!(e.at >= c.at && e.at < c.at + 0.6));
        if (e.name === 'papers') {
          papers++;
          assert.equal(ctx.type, 'outro');
          assert.ok(e.at >= ctx.duration - 0.15 - 1e-9, 'papers after the sign-off (the 0.6 s hold may start it in the last syllable)');
          continue;
        }
        if (e.name === 'lean_in') leanIns++;
        if (e.name === 'steeple') steeples++;
        const apex = e.at + defOf(e).apex / rateOf(e);
        for (const f of ctx.figures) assert.ok(Math.abs(f.t - apex) > 0.4, `apex ${apex} near figure ${f.t}`);
        const si = ctx.sentences.findIndex((s) => e.word < s.end);
        perSentence.set(si, (perSentence.get(si) || 0) + 1);
        assert.ok(perSentence.get(si) <= 1, 'one per sentence');
      }
      if (ctx.type === 'story') {
        assert.ok(g.length <= 2);
        assert.ok(steeples <= 1);
      }
    }
    assert.ok(leanIns <= 1, `lean_in ${leanIns} times`);
    assert.ok(papers <= 1);
  }
});

test('NEWS IN 60 §4 item 11: at most 2 per episode, nod / lean_in (lead) / papers (outro) only, nothing light', () => {
  for (const ep of episodes('news-60')) {
    let total = 0;
    for (const res of planEpisode(ep)) {
      const { ctx } = res;
      for (const e of gesturesOf(res)) {
        total++;
        assert.ok(['nod', 'lean_in', 'papers'].includes(e.name), e.name);
        assert.ok(!ACTIONS[e.name].light);
        if (e.name === 'lean_in') assert.ok(ctx.isLead && !ctx.grave, 'lean_in on the lead');
        if (e.name === 'papers') assert.equal(ctx.type, 'outro');
        if (ctx.grave) assert.equal(e.name, 'nod');
      }
    }
    assert.ok(total <= 2, `${total} gestures`);
  }
});

test('grave filter: no light gesture and nothing beyond nod/steeple on a grave story, in every programme', () => {
  for (const pid of PROGRAMMES) {
    for (const ep of episodes(pid, 8)) {
      for (const res of planEpisode(ep)) {
        if (!res.ctx.grave) continue;
        for (const e of gesturesOf(res)) {
          assert.ok(['nod', 'steeple'].includes(e.name), `${pid} grave ${e.name}`);
          assert.ok(!ACTIONS[e.name].light);
        }
      }
    }
  }
});

test('per-episode budgets are a pure function of the episode: same answer from any segment, any order', () => {
  for (const pid of PROGRAMMES) {
    const ep = episodes(pid, 2)[2];
    const a = episodePlan(segmentContext(ep, 0, {}));
    const b = episodePlan(segmentContext(JSON.parse(JSON.stringify(ep)), ep.segments.length - 1, {}));
    assert.deepEqual(a, b, pid);
  }
});

test('count n comes from the text (digits, number words, ordinals, lists), clamped 1-5, fallback 2', () => {
  assert.equal(countFromText('There are 3 reasons.'), 3);
  assert.equal(countFromText('Four things changed.'), 4);
  assert.equal(countFromText('first the price, second the range, third the battery'), 3);
  assert.equal(countFromText('faster, lighter and cheaper'), 3);
  assert.equal(countFromText('It costs 1,500 dollars.'), 2);
  assert.equal(countFromText('Nothing to count here.'), 2);
  assert.equal(countFromText('red, green, blue, cyan, pink, gold and grey'), 5);
  assert.equal(countFromText('one more thing'), 1);
});

test('determinism: the same episode gives the same plan; another episode id reseeds the variety', () => {
  for (const pid of PROGRAMMES) {
    const ep = FIX[pid];
    const p1 = JSON.stringify(planEpisode(ep).map((r) => gesturesOf(r)));
    const p2 = JSON.stringify(planEpisode(JSON.parse(JSON.stringify(ep))).map((r) => gesturesOf(r)));
    assert.equal(p1, p2, pid);
  }
  const plans = new Set(episodes('world-now', 8).map((ep) => JSON.stringify(planEpisode(ep).map((r) => gesturesOf(r).map((e) => e.name)))));
  assert.ok(plans.size >= 4, 'seeded variety across episodes');
});

test('malformed input never throws: empty segments, missing text, unknown programme (WORLD NOW rules)', () => {
  const ep = { id: 'x', program: { id: 'mystery' }, cast: { A: 'paco', B: 'lola' }, segments: [{ type: 'story', anchor: 'A', text: 'A short story about three things, really.', cues: [{ char: 2, action: 'wow' }] }, { type: 'chat' }, null] };
  for (let i = -1; i < 4; i++) {
    const res = planSegment(ep, i, {});
    assert.ok(Array.isArray(res.events));
  }
  const g = gesturesOf(planSegment(ep, 0, {}));
  for (const e of g) assert.ok(BIBLE['world-now'].speaker.includes(e.name), `unknown programme uses WORLD NOW: ${e.name}`);
});

// ---------------------------------------------------------------------------
// beats and variety (owner 20:40: more gestures, more variety, never twice in a row, adult)

const ALL_SEGS = (pid, n) => episodes(pid, n).flatMap((ep) => planEpisode(ep));

// critic r3: the coverage below used the camera planner's live cuts, so unrelated camera edits moved it across its
// floor (42 % once, 58 % the next run). It now plans against a FROZEN cut list per segment: the speaker's head-
// and-shoulders single for the first half, the two-shot (or the solo wide) for the rest.
function frozenCuts(ctx) {
  const half = ctx.duration * 0.5;
  let char = 0;
  for (const w of ctx.words) if (w.t <= half) char = w.char;
  return [
    { at: 0, char: 0, shot: 'close', focus: ctx.speaker, framing: ctx.duo ? 'mcu' : 'solo-mcu' },
    { at: Math.round(half * 1000) / 1000, char, shot: 'wide', focus: ctx.speaker, framing: ctx.duo ? 'two' : 'solo-wide' },
  ];
}
function withFrozenCuts(res) {
  const ctx = Object.create(res.ctx);
  ctx.shots = frozenCuts(res.ctx);
  const events = planGestures(ctx).map((e) => ({ ...e, planner: 'gestures' }));
  return { ctx, events };
}

test('beats: motivated gestures on most sentences of light/neutral stories (WORLD NOW, TECH BYTES), none on grave ones', () => {
  for (const pid of ['world-now', 'tech-bytes']) {
    let sentences = 0, moved = 0;
    for (const res0 of ALL_SEGS(pid, 10)) {
      const res = withFrozenCuts(res0);
      const { ctx } = res;
      const g = gesturesOf(res);
      if (ctx.grave) {
        assert.equal(beatsOf(res).length, 0, `${pid}: beat on a grave segment`);
        continue;
      }
      if (ctx.type !== 'story' || ctx.feature === 'roundup') continue;
      const shotAt = (t) => {
        let sh = null;
        for (const c of ctx.shots) if (c.at <= t) sh = c.shot;
        return sh;
      };
      for (const s of ctx.sentences) {
        // sentences long enough to carry a gesture, spoken while the presenter is in vision
        if (s.t1 - s.t0 < 1.3) continue;
        const sh = shotAt((s.t0 + s.t1) / 2);
        if (sh && sh !== 'wide' && sh !== 'close') continue;
        sentences++;
        if (g.some((e) => e.word >= s.start && e.word < s.end)) moved++;
      }
    }
    const share = moved / sentences;
    if (process.env.V2_HANDS_TABLE) console.log(`${pid}: ${moved}/${sentences} story sentences in vision carry a gesture (${(share * 100).toFixed(0)} %)`);
    assert.ok(share >= 0.5, `${pid}: only ${(share * 100).toFixed(0)} % of story sentences carry a gesture`);
    assert.ok(share <= 0.9, `${pid}: ${(share * 100).toFixed(0)} % is too busy for 24/7 (adult, restrained)`);
  }
});

test('beats: allowed variants of the speaker\'s own list, small, ≤ 1 arm gesture per sentence, air around them', () => {
  for (const pid of PROGRAMMES) {
    for (const res of ALL_SEGS(pid, 6)) {
      const { ctx } = res;
      const g = gesturesOf(res).sort((a, b) => a.at - b.at);
      for (const e of beatsOf(res)) {
        assert.ok(e.variant && GESTURES[e.name].variants[e.variant], `${pid}: beat ${e.name}:${e.variant}`);
        assert.ok(e.amp == null || (e.amp >= 0.5 && e.amp <= 1), 'amp 0.5-1');
        assert.ok(!['money-minute', 'news-60'].includes(pid), `${pid} keeps its bible's strict count: no beats`);
        assert.ok(!(pid === 'cosmos' && ctx.speakerId === 'unit8'), 'UNIT-8 does not beat');
      }
      for (let i = 1; i < g.length; i++) {
        const a = g[i - 1], b = g[i];
        if (!a.beat && !b.beat) continue;
        assert.ok(b.at >= a.at + durOf(a) + 0.2 - 1e-6, `${pid}: ${a.name} and ${b.name} too close (${a.at} → ${b.at})`);
      }
    }
  }
});

test('variety: never the same gesture (family) twice in a row within a turn; rotation across the episode', () => {
  for (const pid of PROGRAMMES) {
    let pairs = 0, repeats = 0;
    for (const ep of episodes(pid, 8)) {
      const last = {};
      for (const res of planEpisode(ep)) {
        const g = gesturesOf(res).sort((a, b) => a.at - b.at);
        const key = familyOf; // variants that read alike (steeple / steeple press, every nod) count as one
        for (let i = 1; i < g.length; i++) assert.notEqual(key(g[i]), key(g[i - 1]), `${pid}: ${key(g[i])} twice in a row`);
        const slot = res.ctx.speaker;
        // across turns: the visible arm gestures (a sign-off nod after a story nod is not "the same gesture again")
        for (const e of g.filter((x) => defOf(x).arm)) {
          if (last[slot] !== undefined) {
            pairs++;
            if (last[slot] === key(e)) repeats++;
          }
          last[slot] = key(e);
        }
      }
    }
    // across turns the episode rotation keeps immediate repeats rare (a presenter's nod at the end of one turn
    // and the greeting nod of the next can coincide in solo programmes)
    if (pairs > 20) assert.ok(repeats / pairs <= 0.2, `${pid}: ${repeats}/${pairs} consecutive repeats across turns`);
  }
});

test('the idle hands settle into new poses (pure, seeded, calm) and yield to gestures', async () => {
  const { applyArmIdle } = await import('../public/js/v2/canvas25d/gestures/fidget.js');
  assert.equal(typeof applyArmIdle, 'function');
  const a = actor('paco', { side: 1, seed: 11 });
  const b = actor('paco', { side: 1, seed: 11 });
  const at = (x, t) => JSON.stringify(poseAt(x, t).arms.R.wrist);
  // pure: the same instant gives the same pose whatever was evaluated before
  for (const t of [40, 3, 77.7, 12]) poseAt(b, t);
  assert.equal(at(b, 31.3), at(a, 31.3));
  // the first seconds are the reference rest (the approved motion baseline is untouched)
  const off = actor('paco', { side: 1, seed: 11, armIdle: false });
  assert.equal(at(a, 4), at(off, 4));
  // over two minutes the hands move several times, gently (≤ 1 px per 0.04 s at s = 2.15)
  let moves = 0, moving = false, prev = null, maxStep = 0;
  for (let t = 0; t < 120; t += DT) {
    const sk = poseAt(a, t);
    const w = [scr(sk.arms.R.wrist), scr(sk.arms.L.wrist)];
    if (prev) {
      const st = Math.max(...w.map((p, i) => Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1])));
      maxStep = Math.max(maxStep, st);
      if (st > 0.05 && !moving) {
        moves++;
        moving = true;
      }
      if (st < 0.01) moving = false;
    }
    prev = w;
  }
  assert.ok(moves >= 6 && moves <= 20, `${moves} hand moves in 120 s`);
  assert.ok(maxStep <= 1, `idle step ${maxStep.toFixed(2)} px`);
  // a gesture owns the arm: mid-gesture the idle offset is gone (pose equals the idle-free pose)
  const g = [{ name: 'raise_hand', t0: 50 }];
  const withIdle = actor('paco', { side: 1, seed: 11, gestures: g });
  const noIdle = actor('paco', { side: 1, seed: 11, gestures: g, armIdle: false });
  assert.equal(at(withIdle, 50.8), at(noIdle, 50.8));
});

// ---------------------------------------------------------------------------
// fix round 1: restraint (pace.js), visibility, the sign-off papers, blends, hands craft

test('restraint (owner 22:50 note 6, pace.js): per presenter, marked gestures and beats within the budget, minGap between statements, air between arm movements, hands mostly at rest', () => {
  for (const pid of PROGRAMMES) {
    const G = paceFor(pid).gestures;
    for (const ep of episodes(pid, 8)) {
      const per = {};
      let t = 0;
      for (const res of planEpisode(ep)) {
        const { ctx } = res;
        const p = (per[ctx.speaker] ||= { speech: 0, marked: [], beats: 0, arm: [], busy: 0 });
        p.speech += ctx.duration;
        for (const e of gesturesOf(res)) {
          const d = defOf(e);
          if (!d.arm || e.name === 'papers') continue;
          const abs = t + e.at;
          if (e.beat) p.beats++;
          else p.marked.push(abs);
          p.arm.push(abs);
          p.busy += durOf(e);
        }
        t += ctx.duration + (ctx.gapAfter ?? 0.7);
      }
      for (const [slot, p] of Object.entries(per)) {
        const min = p.speech / 60;
        assert.ok(p.marked.length <= Math.ceil(G.perMin * min) + 1, `${pid} ${slot}: ${p.marked.length} marked gestures in ${p.speech.toFixed(0)} s (budget ${G.perMin}/min)`);
        assert.ok(p.beats <= Math.ceil(G.beatsPerMin * min) + 1, `${pid} ${slot}: ${p.beats} beats in ${p.speech.toFixed(0)} s`);
        p.marked.sort((a, b) => a - b);
        p.arm.sort((a, b) => a - b);
        for (let i = 1; i < p.marked.length; i++) assert.ok(p.marked[i] - p.marked[i - 1] >= G.minGap - 0.05, `${pid} ${slot}: statements ${(p.marked[i] - p.marked[i - 1]).toFixed(2)} s apart (minGap ${G.minGap})`);
        for (let i = 1; i < p.arm.length; i++) assert.ok(p.arm[i] - p.arm[i - 1] >= 2.6 - 0.05, `${pid} ${slot}: arm movements ${(p.arm[i] - p.arm[i - 1]).toFixed(2)} s apart`);
        assert.ok(p.busy <= (1 - G.rest) * (p.speech + 30) + 1e-6, `${pid} ${slot}: hands busy ${p.busy.toFixed(1)} s of ${p.speech.toFixed(0)} s`);
      }
    }
  }
});

test('visibility: every planned arm gesture lands where the viewer sees the hands; desk-level beats never in a head-and-shoulders single', () => {
  const desk = new Set(['raise_hand:beat', 'raise_hand:beat2', 'raise_hand:offer', 'raise_hand:turn', 'raise_hand:settle', 'raise_hand:tick', 'steeple:press', 'shrug:small']);
  let singles = 0;
  for (const pid of PROGRAMMES) {
    for (const ep of episodes(pid, 6)) {
      for (const res of planEpisode(ep)) {
        const { ctx } = res;
        for (const e of gesturesOf(res)) {
          if (!defOf(e).arm || e.name === 'papers') continue;
          assert.ok(gestureVisible(ctx, e), `${pid} ${e.name}:${e.variant || ''} at ${e.at} is not visible in its shot`);
          let cut = null;
          for (const c of ctx.shots) if (c.at <= e.apexAt) cut = c;
          if (cut && cut.shot === 'close') {
            singles++;
            const v = e.variant ? `${e.name}:${e.variant.replace(/_far$/, '')}` : e.name;
            assert.ok(!desk.has(v), `${pid}: desk-level ${v} planned in a single`);
          }
        }
      }
    }
  }
  assert.ok(singles > 0, 'some gestures do land in singles (face and chest level)');
  // a writer's steeple cue in a WORLD NOW single: replaced by a gesture that reads there, or dropped
  const ep = JSON.parse(JSON.stringify(FIX['world-now']));
  const i = ep.segments.findIndex((sg) => sg.type === 'story');
  ep.segments[i].cues = [{ char: 0, slot: null, action: 'steeple' }];
  const res = planSegment(ep, i, { presenters: CHANNEL.presenters });
  for (const e of gesturesOf(res)) if (defOf(e).arm) assert.ok(gestureVisible(res.ctx, e), `${e.name} visible`);
});

test('sign-off papers fit the hold (pace.js holds.signoff): the tap inside the hold, the stack flat again before the stinger', () => {
  for (const pid of ['world-now', 'money-minute', 'news-60']) {
    const hold = paceFor(pid).holds.signoff;
    let found = 0;
    for (const ep of episodes(pid, 6)) {
      for (const res of planEpisode(ep)) {
        const e = gesturesOf(res).find((x) => x.name === 'papers');
        if (!e) continue;
        found++;
        const { ctx } = res;
        const d = defOf(e), rate = rateOf(e);
        assert.equal(e.variant, 'signoff', `${pid}: the short squaring (the full 2.4 s one never fits a ${hold} s hold)`);
        assert.ok(e.at + d.apex / rate <= ctx.duration + hold - 0.1 + 2e-3, `${pid}: tap at ${(e.at + d.apex / rate - ctx.duration).toFixed(2)} s after the last word (hold ${hold})`);
        // the stack is flat (tilt 0) by the end of the hold + 0.05 s
        const tilt = d.tracks.tilt;
        let flat = 0;
        for (let k = 0; k < tilt.length; k++) if (tilt[k][1] > 0.02) flat = tilt[k + 1][0];
        assert.ok(e.at + flat / rate <= ctx.duration + hold + 0.05 + 2e-3, `${pid}: stack flat at ${(e.at + flat / rate - ctx.duration).toFixed(2)} s`);
        if (pid === 'world-now') assert.ok(e.at + durOf(e) <= ctx.duration + hold + 2e-3, 'WORLD NOW: the whole squaring inside the 1.5 s hold');
      }
    }
    if (pid !== 'news-60') assert.ok(found > 0, `${pid}: papers planned on some sign-offs`);
  }
});

test('blends of every aired pair: settle overlaps within the no-pop limits; interruptions (runtime delays only) within the documented exemption', () => {
  const AIRED = [['nod'], ['lean_in'], ['steeple'], ['steeple', 'press'], ['steeple', 'tap'], ['raise_hand'], ['raise_hand', 'beat'], ['raise_hand', 'beat2'], ['raise_hand', 'offer'], ['raise_hand', 'box'], ['raise_hand', 'lift'], ['raise_hand', 'lift_far'], ['chin', 'touch'], ['raise_hand', 'turn'], ['raise_hand', 'settle'], ['point_screen'], ['point_partner', 'after_you'], ['shrug', 'small'], ['papers', 'signoff'], ['count'], ['chin'], ['glasses'], ['shake_head']];
  const run = (id, a, b, t0b) => {
    const ea = { name: a[0], variant: a[1], t0: 0.4 }, eb = { name: b[0], variant: b[1], t0: t0b(durOf(ea)) };
    const ac = actor(id, { side: 1, seed: 5, gestures: [ea, eb] });
    const frames = [];
    for (let t = 0; t < eb.t0 + durOf(eb) + 0.6; t += DT) {
      const sk = poseAt(ac, t);
      frames.push({ wristL: [...sk.arms.L.wrist], wristR: [...sk.arms.R.wrist] });
    }
    return popNumbers(frames);
  };
  // the planner's rules: two statements may overlap by a settle (≤ 0.3 s); a beat keeps 0.2 s of air
  const BEATS = new Set(['beat', 'beat2', 'offer', 'box', 'lift', 'lift_far', 'turn', 'settle', 'press', 'tap', 'small', 'signoff']);
  for (const id of ['paco', 'unit8']) {
    for (const a of AIRED) for (const b of AIRED) {
      const beat = BEATS.has(a[1]) || BEATS.has(b[1]);
      for (const ov of beat ? [-0.2] : [0.15, 0.3]) {
        const { maxStep, maxJerk } = run(id, a, b, (d) => 0.4 + d - ov);
        assert.ok(maxStep <= 14 && maxJerk <= 4.5, `${id} ${a.join(':')} > ${b.join(':')} overlap ${ov}: step ${maxStep.toFixed(2)} change ${maxJerk.toFixed(2)}`);
      }
      const { maxStep, maxJerk } = run(id, a, b, (d) => 0.4 + d - 0.6);
      assert.ok(maxStep <= 14 && maxJerk <= 6, `${id} ${a.join(':')} > ${b.join(':')} interruption: step ${maxStep.toFixed(2)} change ${maxJerk.toFixed(2)}`);
    }
  }
});

test('idle finger tap: the same whether the presenter speaks or listens (no pop when the stage flips perf.listen at a turn)', () => {
  for (const seed of [3, 11, 23, 41, 77]) {
    const a = actor('lola', { side: -1, seed });
    const b = actor('lola', { side: -1, seed, listen: true });
    for (let t = 0; t < 90; t += 0.37) {
      const ca = poseAt(a, t).arms.L.hand.curl[1], cb = poseAt(b, t).arms.L.hand.curl[1];
      const ra = poseAt(a, t).arms.R.hand.curl[1], rb = poseAt(b, t).arms.R.hand.curl[1];
      assert.ok(Math.abs(ca - cb) < 1e-9 && Math.abs(ra - rb) < 1e-9, `seed ${seed} t ${t.toFixed(2)}: index curl differs by listen`);
    }
  }
});

test('per-episode plans are keyed by the episode object: two episodes sharing an id but not their segments get their own budgets', () => {
  const a = JSON.parse(JSON.stringify(FIX['money-minute']));
  const b = JSON.parse(JSON.stringify(FIX['money-minute']));
  b.segments = b.segments.slice(0, 3);
  const pa = episodePlan(segmentContext(a, 0, {})), pb = episodePlan(segmentContext(b, 0, {}));
  assert.notEqual(pa, pb);
  assert.equal(Object.keys(pb.quota).length, 3);
  assert.equal(Object.keys(pa.quota).length, a.segments.length);
});

test('far-hand beats drive the far arm only, mirroring the near-hand beat exactly', () => {
  for (const v of ['beat', 'offer', 'lift', 'turn', 'settle', 'tick']) {
    const near = defOf({ name: 'raise_hand', variant: v }), far = defOf({ name: 'raise_hand', variant: `${v}_far` });
    assert.ok(near.armN && !near.armF, `${v} is near-handed`);
    assert.ok(far.armF && !far.armN, `${v}_far drives the far arm`);
    assert.equal(far.dur, near.dur);
    assert.equal(familyOf({ name: 'raise_hand', variant: `${v}_far` }), familyOf({ name: 'raise_hand', variant: v }));
    const fn = sample({ name: 'raise_hand', variant: v }), ff = sample({ name: 'raise_hand', variant: `${v}_far` });
    const reach = (fr, k, i) => Math.max(...fr.map((f) => Math.hypot(...f[k].map((x, q) => x - f[i][q]))));
    assert.ok(Math.abs(reach(fn, 'wristR', 'idleR') - reach(ff, 'wristL', 'idleL')) < 1e-6, `${v}: mirrored reach`);
  }
});

test('hands craft: clean clusters (no lone line or detail pixel) at every scale; a hand over the face keeps a continuous outline', () => {
  const buf = new PartBuffer(160, 160);
  for (const id of ['paco', 'lola', 'max']) {
    const L = LOOKS[id], m = matsOf(L);
    for (const [name, sh] of Object.entries(SHAPES)) {
      for (const facing of [sh.facing, -sh.facing]) {
        for (const s of [1.37, 2.15, 3.4]) {
          buf.clear();
          const arm = { wrist: [0, 0, 0], handDir: sh.dir ? [...sh.dir] : [0.05, -1, 0.12], hand: { curl: [...sh.curl], spread: sh.spread, facing, sup: sh.sup || 0 } };
          const toS = (x, y, z = 0) => [80 + x * s, 100 + (y + z * TILT) * s];
          drawHand(buf, L, m, arm, 1, toS, s, 13, 20);
          const W = buf.w;
          for (let i = W; i < buf.mat.length - W; i++) {
            const mt = buf.mat[i];
            if (!mt || !(MAT.flags[mt] & 1)) continue; // decal = lines and painted details
            let mates = 0;
            for (const d of [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1]) if (buf.mat[i + d] === mt && buf.tone[i + d] === buf.tone[i]) mates++;
            assert.ok(mates > 0, `${id} ${name} facing ${facing} s ${s}: lone detail pixel at ${i % W},${Math.floor(i / W)}`);
          }
        }
      }
    }
  }
  // the chin: every hand pixel touching the face is outline
  for (const id of ['paco', 'lola', 'max']) {
    const L = LOOKS[id];
    const a = actor(id, { side: 1, seed: 11, gestures: [{ name: 'chin', t0: 0 }] });
    const sk = poseAt(a, 1.0);
    const b2 = new PartBuffer();
    drawCharacter(b2, L, sk, { x: 192, y: 60, s: 3.4, gb: 0, clip: false });
    const W = b2.w, line = MAT.flags;
    let touching = 0;
    for (let i = W; i < b2.mat.length - W; i++) {
      const g = b2.grp[i];
      if (!b2.mat[i] || (g !== GROUPS.handA && g !== GROUPS.handB)) continue;
      const nearFace = [-1, 1, -W, W].some((d) => b2.mat[i + d] && (b2.grp[i + d] === GROUPS.head || b2.grp[i + d] === GROUPS.neck));
      if (!nearFace) continue;
      touching++;
      assert.ok(line[b2.mat[i]] & 1 && MAT.ramp[b2.mat[i] * 4] === MAT.ramp[b2.mat[i] * 4 + 3], `${id}: hand pixel against the face is not outline`);
    }
    assert.ok(touching > 0, `${id}: the chin hand touches the face`);
  }
});


// ---------------------------------------------------------------------------
// fix round 2: variety on air, meaning, the glasses touch, the chin while speaking, TECH BYTES caps

/** Marked arm gestures of a whole episode in air order (both presenters): { fam, t, slot, e }. */
function airedMarked(ep) {
  const out = [];
  let t = 0;
  for (const res of planEpisode(ep)) {
    for (const e of featuredOf(res)) if (defOf(e).arm && e.name !== 'papers') out.push({ fam: familyOf(e), t: t + e.at, slot: res.ctx.speaker, e, ctx: res.ctx });
    t += res.ctx.duration + (res.ctx.gapAfter ?? 0.7);
  }
  return out.sort((a, b) => a.t - b.t);
}

test('variety on air (critics r2): no marked family twice in a row or within 45 s programme-wide, palm-out raise_hand once per presenter, WORLD NOW not one move', () => {
  for (const pid of PROGRAMMES) {
    let pairs = 0, same = 0, raises = 0, total = 0;
    const fams = new Set();
    for (const ep of episodes(pid, 12)) {
      const air = airedMarked(ep);
      const perSlot = {};
      for (let i = 0; i < air.length; i++) {
        const a = air[i];
        total++;
        fams.add(a.fam);
        if (a.fam === 'raise_hand') {
          raises++;
          perSlot[a.slot] = (perSlot[a.slot] || 0) + 1;
          assert.ok(perSlot[a.slot] <= 1, `${pid} ${ep.id}: palm-out raise_hand twice by ${a.slot}`);
        }
        if (i > 0) {
          pairs++;
          if (air[i - 1].fam === a.fam) same++;
        }
        for (let j = 0; j < i; j++) if (air[j].fam === a.fam) assert.ok(a.t - air[j].t >= 45 - 1e-6, `${pid} ${ep.id}: ${a.fam} again after ${(a.t - air[j].t).toFixed(1)} s`);
      }
    }
    if (process.env.V2_HANDS_TABLE) console.log(`${pid}: ${total} marked arm gestures, ${fams.size} families, consecutive same ${same}/${pairs}, palm-out raise ${raises}`);
    if (pairs) assert.ok(same / pairs <= 0.2, `${pid}: ${same}/${pairs} consecutive repeats on air`);
    if (pid === 'world-now') {
      assert.ok(raises / total <= 0.4, `world-now: raise_hand ${raises} of ${total} marked gestures`);
      assert.ok(fams.size >= 4, `world-now: only ${[...fams].join(', ')}`);
    }
  }
});

// critic r3 (pace.js gestures.vocabWindow 3): variety by NAME, as the viewer reads it: box, lift and a beat are all
// "a hand rising" (raise_hand). Every fixture (world-now-long included) and 12 seeded variants per programme.
test('vocabulary (critics r3, pace.js vocabWindow): no name twice in a row per presenter, a statement never repeats a name of the last 3, wall point ≤ 2 per presenter, chin ≤ 35 % in TECH BYTES', () => {
  const dir = new URL('./fixtures/v2-episodes/', import.meta.url);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const chin = { n: 0, of: 0 };
  let checked = 0;
  for (const f of files) {
    const base = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    for (const e0 of (Array.isArray(base) ? base : [base]).filter((e) => e && Array.isArray(e.segments))) {
      for (let k = 0; k < 12; k++) {
        const ep = k === 0 ? e0 : { ...e0, id: `${e0.id}-voc${k}` };
        const seq = {};
        for (const res of planEpisode(ep)) {
          if (!res.ctx) continue;
          for (const e of gesturesOf(res).sort((a, b) => a.at - b.at)) if (e.slot === res.ctx.speaker && e.name !== 'nod') (seq[e.slot] ||= []).push(e);
        }
        for (const [slot, list] of Object.entries(seq)) {
          let walls = 0;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            checked++;
            if (i > 0) assert.notEqual(list[i - 1].name, e.name, `${f} ${ep.id} ${slot}: ${e.name} twice in a row`);
            const statement = !e.beat && e.name !== 'papers';
            if (statement) for (let j = Math.max(0, i - 3); j < i; j++) assert.notEqual(list[j].name, e.name, `${f} ${ep.id} ${slot}: ${e.name} again within the last 3 (${list.slice(Math.max(0, i - 3), i + 1).map((x) => x.name).join(' ')})`);
            if (e.name === 'point_screen' && statement) walls++;
            if (ep.program?.id === 'tech-bytes' && statement && defOf(e).arm) {
              chin.of++;
              if (e.name === 'chin') chin.n++;
            }
          }
          assert.ok(walls <= 2, `${f} ${ep.id} ${slot}: ${walls} wall points`);
        }
      }
    }
  }
  assert.ok(checked > 100, `${checked} gestures checked`);
  if (process.env.V2_HANDS_TABLE) console.log(`vocabulary: ${checked} gestures; TECH BYTES chin ${chin.n}/${chin.of}`);
  assert.ok(chin.of > 0 && chin.n / chin.of <= 0.35, `TECH BYTES: chin ${chin.n} of ${chin.of} arm statements`);
});

test('the episode\'s own gesture policy replaces the client mirror when the context carries it (ctx.programGestures)', () => {
  const ep = FIX['world-now'];
  const seen = { def: new Set(), nod: new Set() };
  for (const res of planEpisode(ep)) {
    if (!res.ctx) continue;
    for (const e of planGestures(res.ctx)) if (e.kind === 'gesture') seen.def.add(e.name);
    const ctx = Object.create(res.ctx);
    ctx.programGestures = { allow: ['nod'], grave: ['nod'] };
    for (const e of planGestures(ctx)) if (e.kind === 'gesture') seen.nod.add(e.name);
  }
  assert.ok(seen.def.size > 1, `default policy: ${[...seen.def]}`);
  assert.deepEqual([...seen.nod], ['nod'], `nod-only policy: ${[...seen.nod]}`);
});

test('meaning (critics r2): head shakes need a negation, contrast or doubt, shrugs uncertainty or a question, glasses the question', () => {
  const NEG = /\b(not|no|never|nothing|nobody|none|neither|nor|without|despite|still|yet|but|however|denied|denies|deny|refused|refuses|rejected|unclear|cannot|hardly|failed|fails|unlikely|doubts?|sceptic\w*|skeptic\w*)\b|n't\b/i;
  const UNC = /\b(maybe|perhaps|unclear|uncertain|unknown|possibly|might|remains? to be seen|who knows|hard to say|not sure|depends|anyone's guess|open question)\b|\?/i;
  let seen = 0;
  for (const pid of ['world-now', 'tech-bytes', 'cosmos']) {
    for (const res of ALL_SEGS(pid, 10)) {
      const { ctx } = res;
      for (const e of gesturesOf(res)) {
        if (!['shake_head', 'shrug', 'glasses'].includes(e.name)) continue;
        seen++;
        const si = ctx.sentences.findIndex((x) => e.word < x.end);
        const sent = ctx.sentences[si < 0 ? ctx.sentences.length - 1 : si];
        const text = sent.text || ctx.seg.text.slice(sent.start, sent.end);
        if (e.name === 'shake_head') assert.ok(NEG.test(text), `${pid}: shake_head on "${text}"`);
        if (e.name === 'shrug') assert.ok(UNC.test(text), `${pid}: shrug on "${text}"`);
        if (e.name === 'glasses') {
          assert.ok(ctx.question, `${pid}: glasses without a question`);
          assert.equal(ctx.sentences.findIndex((x) => ctx.question.char < x.end), si, `${pid}: glasses outside the question`);
        }
      }
    }
  }
  assert.ok(seen > 0, 'the semantic gestures still air where the words carry them');
});

test('the chin while speaking is a brief touch; the long thinking pose only on a question or into the pause', () => {
  const touch = defOf({ name: 'chin', variant: 'touch' });
  assert.ok(touch.hold - touch.apex <= 0.9, `touch holds ${(touch.hold - touch.apex).toFixed(2)} s`);
  let n = 0;
  for (const pid of ['tech-bytes', 'cosmos']) {
    for (const res of ALL_SEGS(pid, 10)) {
      const { ctx } = res;
      for (const e of gesturesOf(res).filter((x) => x.name === 'chin')) {
        n++;
        if (e.variant === 'touch') continue;
        const d = defOf(e);
        const q = ctx.question && ctx.sentences.findIndex((x) => ctx.question.char < x.end) === ctx.sentences.findIndex((x) => e.word < x.end);
        assert.ok(q || e.at + d.hold / rateOf(e) >= ctx.duration - 0.25, `${pid}: the full chin held through the read at ${e.at}`);
      }
    }
  }
  assert.ok(n > 0, 'chin still airs');
});

test('TECH BYTES: arm movements per segment, beats included, stay within the cap plus one beat (Ada ≤ 2, Max ≤ 3)', () => {
  const B = BIBLE['tech-bytes'];
  for (const res of ALL_SEGS('tech-bytes', 12)) {
    const id = res.ctx.speakerId;
    const arms = gesturesOf(res).filter((e) => defOf(e).arm && e.name !== 'papers');
    assert.ok(arms.length <= B.cap[id] + B.capBeats, `${id}: ${arms.length} arm movements in one segment`);
    assert.ok(arms.filter((e) => !e.beat).length <= B.cap[id], `${id}: cue-level cap`);
  }
});

test('beats move enough to be seen (≥ 2 px in their shot); the far hand never takes the desk-level tick or settle', () => {
  for (const pid of ['world-now', 'tech-bytes', 'cosmos']) {
    for (const res of ALL_SEGS(pid, 8)) {
      for (const e of beatsOf(res)) assert.ok(!/^(tick|settle)_far$/.test(e.variant || ''), `${pid}: far-hand ${e.variant}`);
    }
  }
});

test('contained planner faults are counted and stay at 0 over the fixtures', () => {
  DEBUG.errors = 0;
  for (const pid of PROGRAMMES) for (const ep of episodes(pid, 4)) planEpisode(ep);
  assert.equal(DEBUG.errors, 0);
});

test('glasses: the index fingertip sits on the hinge of the glasses (glassesAnchor) within 1 px at s 2.15 and 3.4, eyes open', () => {
  const buf = new PartBuffer();
  const g = newHandGeometry();
  for (const side of [1, -1]) {
    for (const s of [2.15, 3.4]) {
      const a = actor('ada', { side, seed: 11, gestures: [{ name: 'glasses', t0: 0.3 }] });
      for (const lt of [0.8, 0.9, 1.0, 1.1]) {
        const sk = poseAt(a, 0.3 + lt);
        const xf = { x: 192, y: 70, s, gb: 0, clip: false };
        buf.clear();
        const head = drawCharacter(buf, a.look, sk, xf);
        const key = side > 0 ? 'R' : 'L';
        handGeometry(a.look, sk.arms[key], key === 'R' ? 1 : -1, g);
        // character.js toS (lean about the hip, oblique depth)
        const cl = Math.cos(sk.body.lean), sl = Math.sin(sk.body.lean);
        const bx = Math.round(sk.body.x * s) / s, by = Math.round(sk.body.y * s) / s;
        const ly = g.J[10] - HIP;
        const tx = Math.round(xf.x) + (g.J[9] * cl - ly * sl + bx) * s;
        const ty = Math.round(xf.y) + (g.J[9] * sl + ly * cl + HIP + by + g.J[11] * TILT) * s;
        const anc = glassesAnchor(head, side > 0 ? 'templeR' : 'templeL', [0, 0]);
        // critic r3: at the hinge the fingertip nudges the frame up (~1 px) and lets it settle: the aim is the
        // hinge plus that push (c.reachY, body units)
        const nudge = (a._c.reachY || 0) * a._c.reach * s;
        if (lt === 0.9) assert.ok(nudge <= -0.6 * (s / 3.4), `side ${side} s ${s}: the push lifts ${(-nudge).toFixed(2)} px`);
        const err = Math.hypot(tx - anc[0], ty - (anc[1] + nudge));
        assert.ok(err <= 1, `side ${side} s ${s} t ${lt}: fingertip ${err.toFixed(2)} px from the hinge`);
      }
    }
  }
  // no blink while the fingertip is at the hinge (a blink there reads as rubbing an eye)
  for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
    for (let t0 = 0.3; t0 < 9; t0 += 0.7) {
      const a = actor('ada', { side: 1, seed, gestures: [{ name: 'glasses', t0 }] });
      for (const lt of [0.75, 0.9, 1.05]) {
        const c = poseAt(a, t0 + lt) && a._c;
        assert.ok(c.blink < 0.05, `seed ${seed} t0 ${t0.toFixed(1)}: blink ${c.blink.toFixed(2)} at the hinge`);
      }
    }
  }
});

test('chest-level beats read as open hands, never a grab at the jacket: box and lift fingers extended, box palms facing', () => {
  for (const v of ['box', 'lift']) {
    const d = defOf({ name: 'raise_hand', variant: v });
    for (const ch of ['curl', 'curlF']) {
      const tr = d.tracks[ch];
      if (!tr) continue;
      const k = tr.find((x) => Math.abs(x[0] - d.apex) < 0.1 && Array.isArray(x[1]));
      assert.ok(k, `${v} ${ch} has a key at the apex`);
      assert.ok(Math.max(...k[1]) <= 0.25, `${v}: curl ${k[1]}`);
    }
  }
  const box = defOf({ name: 'raise_hand', variant: 'box' });
  // critic r3: the palms face each other AND turn ~40° to the lens (edge-on, the hands were 2-3 px slivers at the
  // lapels), and the hands sit outside the lapels: ≥ 4 px wide at s 3.18, centres clear of the lapel edge
  const pk = box.tracks.palm.find((x) => Math.abs(x[0] - box.apex) < 0.2 && Array.isArray(x[1]));
  assert.ok(pk && pk[1][0] < -0.5 && pk[1][2] > 0.45, `box palms face in and to the lens: ${pk && pk[1]}`);
  for (const id of PRESENTER_IDS) {
    const a = actor(id, { side: 1, seed: 3, gestures: [{ name: 'raise_hand', variant: 'box', t0: 0.3 }] });
    const sk = poseAt(a, 0.3 + box.apex + 0.1);
    const T = a.look.torso;
    for (const [sd, side] of [['R', 1], ['L', -1]]) {
      const g = handGeometry(a.look, sk.arms[sd], side, newHandGeometry());
      let x0 = Infinity, x1 = -Infinity, cx = 0;
      for (let j = 0; j < 20; j++) {
        const x = g.J[j * 3];
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        cx += x / 20;
      }
      assert.ok((x1 - x0) * 3.18 >= 4, `${id} ${sd}: box hand ${((x1 - x0) * 3.18).toFixed(1)} px wide at s 3.18`);
      // the lapel's outer edge at the notch is collar + lapel width (outfit.js lapelSpec, ≤ 9.8 u ≈ 0.47 of the
      // shoulder half-width); the hand centre keeps 3 px (at s 3.18) outside it
      const edge = 0.47 * T.shoulderHW + 3 / 3.18;
      assert.ok(Math.abs(cx) >= edge, `${id} ${sd}: box hand centre ${Math.abs(cx).toFixed(1)} u from the midline, lapel edge + 3 px ${edge.toFixed(1)}`);
    }
  }
  // the box hands stay apart (a hand-width or more between the fingertips at the apex, both looks' extremes)
  for (const id of ['paco', 'lola']) {
    const a = actor(id, { side: 1, seed: 3, gestures: [{ name: 'raise_hand', variant: 'box', t0: 0.3 }] });
    const sk = poseAt(a, 0.3 + box.apex + 0.1);
    const g1 = newHandGeometry(), g2 = newHandGeometry();
    handGeometry(a.look, sk.arms.R, 1, g1);
    handGeometry(a.look, sk.arms.L, -1, g2);
    let inner1 = Infinity, inner2 = -Infinity;
    for (let j = 0; j < 20; j++) {
      inner1 = Math.min(inner1, g1.J[j * 3]);
      inner2 = Math.max(inner2, g2.J[j * 3]);
    }
    assert.ok(inner1 - inner2 >= a.look.arm.hand * 0.4, `${id}: box hands ${(inner1 - inner2).toFixed(1)} u apart`);
  }
});

test('hand raster cache (perf, critics r2/r3): an unchanged hand reuses its raster; a cached frame is exactly a fresh raster (history-independent)', () => {
  const s = 3.4;
  const toS = (x, y, z = 0) => [192 + x * s, 60 + (y + z * TILT) * s];
  const a = actor('paco', { side: 1, seed: 5, papers: true, gestures: [{ name: 'raise_hand', variant: 'lift', t0: 1.2 }] });
  const bust = actor('paco', { side: 1, seed: 9, papers: true, gestures: [{ name: 'count', t0: 0 }] });
  const L = a.look, m = matsOf(L);
  const b1 = new PartBuffer(), b2 = new PartBuffer();
  const arms = (buf, sk) => {
    drawArm(buf, L, m, sk.arms.L, -1, toS, s, 11, 12, 13, 20);
    drawArm(buf, L, m, sk.arms.R, 1, toS, s, 20, 21, 22, 24);
  };
  // (clear() empties mat only: tone and group count where something is drawn)
  const diff = (p, q) => {
    let d = 0;
    for (let i = 0; i < p.mat.length; i++) if (p.mat[i] !== q.mat[i] || (p.mat[i] && (p.tone[i] !== q.tone[i] || p.grp[i] !== q.grp[i]))) d++;
    return d;
  };
  const prev = { mat: new Uint8Array(b2.mat.length), tone: new Uint8Array(b2.mat.length), grp: new Uint8Array(b2.mat.length) };
  let worst = 0, total = 0, moved = 0;
  const N = 180;
  for (let f = 0; f < N; f++) {
    const t = 0.5 + f / 60;
    // in sequence (the cache may reuse the previous frame's raster)
    b1.clear();
    arms(b1, poseAt(a, t));
    // after another pose of the same look (both slots miss: a fresh raster)
    b2.clear();
    arms(b2, poseAt(bust, 0.6));
    b2.clear();
    arms(b2, poseAt(a, t));
    const d = diff(b1, b2);
    worst = Math.max(worst, d);
    total += d;
    if (f) moved += diff(b2, prev);
    prev.mat.set(b2.mat);
    prev.tone.set(b2.tone);
    prev.grp.set(b2.grp);
  }
  if (process.env.V2_HANDS_TABLE) console.log(`raster cache: worst ${worst} px, mean ${(total / N).toFixed(2)} px vs a fresh raster; the fresh raster itself changes ${(moved / (N - 1)).toFixed(2)} px per frame`);
  // critic r3: exact, whatever was drawn before (the inputs are snapped, the key compares exactly)
  assert.equal(worst, 0, `a cached frame differs from a fresh raster by ${worst} px`);
  // and the cache still pays off on resting hands (the first 0.7 s: breathing and idle only)
  const h0 = RASTER_STATS.hits;
  for (let f = 0; f < 40; f++) {
    b1.clear();
    arms(b1, poseAt(a, 0.2 + f / 60));
  }
  assert.ok(RASTER_STATS.hits - h0 >= 20, `resting hands reuse their raster: ${RASTER_STATS.hits - h0} hits in 80 hand draws`);
  // the same instant twice: identical
  b1.clear();
  arms(b1, poseAt(a, 2.0));
  b2.clear();
  arms(b2, poseAt(a, 2.0));
  assert.equal(diff(b1, b2), 0, 'same pose, same pixels');
});

test('caption box (critic r2 stage find): planned arm gestures clear the subtitle over a strap; box and lift read above it in the mcu singles', () => {
  // graphics/layout.js: the caption over a strap ends 6 px above the tag row (166) and is one 12 px line
  const TOP = 148, X0 = 55, X1 = 329;
  const CAST = { 'world-now': ['paco', 'lola'], 'tech-bytes': ['max', 'ada'], cosmos: ['nova', 'unit8'] };
  for (const [pid, ids] of Object.entries(CAST)) {
    const cast = { A: ids[0], B: ids[1] };
    for (const slot of ['A', 'B']) {
      const cam = cameraFraming('mcu-l', { cast, focus: slot, programId: pid, solo: false });
      const p = placeActor(cam, SET.seatX[slot]);
      const L = LOOKS[cast[slot]];
      const m = slot === 'A' ? 1 : -1;
      for (const v of ['box', 'lift']) {
        const b = handBandOf(L, { name: 'raise_hand', variant: v });
        const xa = p.x + Math.min(b.x0 * m, b.x1 * m) * p.s, xb = p.x + Math.max(b.x0 * m, b.x1 * m) * p.s;
        const inCols = xb + 6 >= X0 && xa - 6 <= X1;
        assert.ok(!inCols || p.y + b.bottom * p.s <= TOP - 4 + 0.5, `${pid} ${cast[slot]} raise_hand:${v} hand at y ${(p.y + b.bottom * p.s).toFixed(1)} behind the caption`);
      }
    }
  }
  // and the planner never plans a hand behind it: every planned arm gesture of the fixtures passes gestureVisible (caption-aware)
  for (const pid of ['world-now', 'tech-bytes', 'cosmos']) {
    for (const res of ALL_SEGS(pid, 6)) for (const e of gesturesOf(res)) if (defOf(e).arm) assert.ok(gestureVisible(res.ctx, e), `${pid}: ${e.name}:${e.variant || ''} hidden`);
  }
});

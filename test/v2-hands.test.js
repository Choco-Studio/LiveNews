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
import { TILT } from '../public/js/v2/canvas25d/space.js';
import { PartBuffer, Frame } from '../public/js/v2/canvas25d/pixbuf.js';
import { drawArm } from '../public/js/v2/canvas25d/hands.js';
import { matsOf } from '../public/js/v2/canvas25d/cast/base.js';
import { LOOKS, PRESENTER_IDS } from '../public/js/v2/canvas25d/cast/index.js';
import { planSegment } from '../public/js/v2/canvas25d/direction/index.js';
import { planGestures, CONFIG_POLICY, BIBLE, countFromText, episodePlan, familyOf } from '../public/js/v2/canvas25d/direction/gestures.js';
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
            assert.ok(e.at >= ctx.duration, 'papers after the last word');
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
          assert.ok(e.at >= ctx.duration);
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

test('beats: motivated gestures on most sentences of light/neutral stories (WORLD NOW, TECH BYTES), none on grave ones', () => {
  for (const pid of ['world-now', 'tech-bytes']) {
    let sentences = 0, moved = 0;
    for (const res of ALL_SEGS(pid, 10)) {
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

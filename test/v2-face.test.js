// Wave-2 FACES stream: faces, eyes, lip sync and listener behaviour
// (public/js/v2/canvas25d/{head,face,glasses,expression,idle,behaviour,speech,
// visemes}.js and direction/behaviour.js). Everything runs in node: the planner on
// real offline episodes (the lab's embedded copies), the rig and the pixel buffer
// for the face checks, recorded Kokoro lines (word times + loudness) for lip sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { segmentContext } from '../public/js/v2/canvas25d/direction/context.js';
import { planBehaviour, RULES, REACTIONS, isToss } from '../public/js/v2/canvas25d/direction/behaviour.js';
import { EPISODES, SAMPLES, timelineAudio } from '../public/js/v2/canvas25d/labs/face.js';
import { liveSpeech, sampleSpeech } from '../public/js/v2/canvas25d/speech.js';
import { mouthParams, buildSpeech } from '../public/js/v2/canvas25d/visemes.js';
import { FACE_REST, solveFace, EMOTIONS } from '../public/js/v2/canvas25d/expression.js';
import { applyLook, applyListen } from '../public/js/v2/canvas25d/behaviour.js';
import { headFrame, JAW_MAX_PX } from '../public/js/v2/canvas25d/head.js';
import { drawGlasses, glassesAnchor } from '../public/js/v2/canvas25d/glasses.js';
import { decal } from '../public/js/v2/canvas25d/pixbuf.js';

const GLANCE = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-face-glance.json', import.meta.url), 'utf8'));
const DUOS = ['world-now', 'tech-bytes', 'cosmos'];
const SOLOS = ['money-minute', 'news-60'];
const GAP = { 'money-minute': 1.2, 'news-60': 0.7 };
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Every segment of an episode: { ctx, events } with the director's gaps. */
function planAll(ep) {
  const n = ep.segments.length;
  return ep.segments.map((seg, i) => {
    const ctx = segmentContext(ep, i, { gapAfter: i + 1 < n ? GAP[ep.program.id] ?? 0.9 : null });
    return { ctx, events: planBehaviour(ctx) };
  });
}
const looksOf = (events, slot) => events.filter((e) => e.kind === 'look' && e.slot === slot && !REACTIONS.has(e.target));
const reactionsOf = (events, slot) => events.filter((e) => e.kind === 'look' && e.slot === slot && REACTIONS.has(e.target));
const inTurn = (l, D) => Math.max(0, Math.min(D, l.at + l.dur) - l.at);

// ---------------------------------------------------------------------------
// The owner-approved glance (performed by applyLook)

test('applyLook keeps the approved glance: yaw RMS ≤ 0.03 rad of the camera demo, peak -0.42 rad', async () => {
  const { actor } = await import('../public/js/v2/canvas25d/scene.js');
  const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
  const lola = actor('lola', { side: -1, seed: 23, emotions: [{ t0: 0, name: 'happy' }], look: [{ t0: 0.6, t1: 4.3 }], listen: true });
  let se = 0, peak = 0;
  for (const [t, yaw] of GLANCE.frames) {
    const sk = poseAt(lola, t);
    se += (sk.head.yaw - yaw) ** 2;
    if (Math.abs(sk.head.yaw) > Math.abs(peak)) peak = sk.head.yaw;
  }
  const rms = Math.sqrt(se / GLANCE.frames.length);
  assert.ok(rms <= 0.03, `glance yaw RMS ${rms.toFixed(4)}`);
  assert.ok(Math.abs(peak - GLANCE.peakYaw) < 0.03, `peak ${peak}`);
});

test('applyLook: eyes lead the head, overlapping looks merge instead of adding up, targets move the right way', () => {
  const ch = () => ({ lookX: 0, lookY: 0, yaw: 0, pitch: 0, lean: 0, hx: 0, hy: 0, lid: 0, smile: 0 });
  const perf = { side: 1, look: [{ t0: 1, t1: 4 }] };
  const a = ch();
  applyLook(a, perf, 1.1, 0);
  assert.ok(a.lookX > 0.5 && a.yaw < 0.2, 'at +0.1 s the eyes are there and the head is still turning');
  const one = ch(), two = ch();
  applyLook(one, { side: 1, look: [{ t0: 0, t1: 5 }] }, 2, 0);
  applyLook(two, { side: 1, look: [{ t0: 0, t1: 5 }, { t0: 1, t1: 6 }] }, 2, 0);
  assert.ok(Math.abs(one.yaw - two.yaw) < 1e-9 && Math.abs(one.lookX - two.lookX) < 1e-9, 'two looks at the partner = one look');
  const notes = ch();
  applyLook(notes, { side: 1, look: [{ t0: 0, t1: 5, target: 'notes' }] }, 2, 0);
  assert.ok(notes.lookY > 0.8 && notes.pitch > 0.1 && notes.lid > 0.3, 'notes: eyes and head down, lids lower');
  const wallSolo = ch();
  applyLook(wallSolo, { side: 0, seed: 3, look: [{ t0: 0, t1: 5, target: 'wall' }] }, 2, 0);
  assert.ok(wallSolo.lookY < -0.5 && Math.abs(wallSolo.yaw) > 0.3, 'solo wall: up and to a side');
  const solo = ch();
  applyLook(solo, { side: 0, look: [{ t0: 0, t1: 5, target: 'partner' }] }, 2, 0);
  assert.equal(solo.yaw, 0, 'a solo presenter has no partner to look at');
  const mech = ch();
  applyLook(mech, { side: 1, look: [{ t0: 0, t1: 5, amt: 0.45, style: 'mech' }] }, 0.1, 0);
  assert.ok(Math.abs(mech.lookX / 0.8 - mech.yaw / 0.4) < 1e-9, 'mech: eyes and head move together');
});

test('applyListen has no cyclic nod any more (the fixed 5.2 s nod was mechanical)', () => {
  const c = { pitch: 0, roll: 0, yaw: 0 };
  for (let t = 0; t < 20; t += 0.1) applyListen(c, { listen: true }, t, 7);
  assert.deepEqual(c, { pitch: 0, roll: 0, yaw: 0 });
});

// ---------------------------------------------------------------------------
// Planner: turn-start glance, restraint caps, solo shows

test('duo turn starts: each listener glances 0.20-0.35 s after the first word, holds 2.4-3.9 s, back by 4.5 s or the end of the turn', () => {
  let checked = 0;
  for (const id of DUOS) {
    for (const { ctx, events } of planAll(EPISODES[id])) {
      if (!ctx.turnStart) continue;
      for (const slot of ctx.listeners) {
        const g = looksOf(events, slot).find((l) => /^turn/.test(l.why));
        assert.ok(g, `${id} #${ctx.index}: a turn-start glance for ${slot}`);
        assert.equal(g.target, 'partner');
        assert.ok(g.at >= RULES.glanceStart[0] && g.at <= RULES.glanceStart[1], `${id} #${ctx.index} start ${g.at}`);
        if (g.why !== 'turn') continue; // merged with a toss or a dry line: checked below
        const robot = ctx.cast[slot] === 'unit8';
        const end = g.at + g.dur;
        assert.ok(end + 0.1 <= Math.min(RULES.backBy, ctx.duration) + 1e-6, `${id} #${ctx.index} back by ${end}`);
        if (!robot && ctx.duration >= 4.5) assert.ok(g.dur >= 2.4 - 1e-6 && g.dur <= 3.9 + 1e-6, `${id} #${ctx.index} hold ${g.dur}`);
        checked++;
      }
    }
  }
  assert.ok(checked >= 8, `checked ${checked} glances`);
});

test('no turn-start glance in solo programmes, and no partner looks at all', () => {
  for (const id of SOLOS) {
    for (const { events } of planAll(EPISODES[id])) {
      assert.equal(events.filter((e) => e.target === 'partner').length, 0, id);
      assert.equal(events.filter((e) => e.kind === 'gesture').length, 0, `${id}: no listener nods without a listener`);
    }
  }
});

test('restraint caps: one glance per listener per turn (+ dry line / toss exchange), gaze ≤ 45 % (≥ 8 s) or ≤ 4.0 s, ≥ 2 s between looks, no overlaps', () => {
  for (const id of [...DUOS, ...SOLOS]) {
    for (const { ctx, events } of planAll(EPISODES[id])) {
      const D = ctx.duration;
      for (const slot of Object.keys(ctx.cast)) {
        const looks = looksOf(events, slot).sort((a, b) => a.at - b.at);
        for (let i = 1; i < looks.length; i++) {
          const gap = looks[i].at - (looks[i - 1].at + looks[i - 1].dur);
          assert.ok(gap >= RULES.lookGap - 1e-6, `${id} #${ctx.index} ${slot}: ${gap.toFixed(2)} s between looks`);
        }
        // face-only reactions never overlap an eyeline look (arbitrate would drop one of them)
        const all = events.filter((e) => e.kind === 'look' && e.slot === slot).sort((a, b) => a.at - b.at);
        for (let i = 1; i < all.length; i++) assert.ok(all[i].at >= all[i - 1].at + all[i - 1].dur, `${id} #${ctx.index} ${slot}: looks overlap`);
        if (slot === ctx.speaker) continue;
        const glances = looks.filter((l) => l.target === 'partner');
        const generic = glances.filter((l) => !/^(dry|toss-meet)$/.test(l.why));
        assert.ok(generic.length <= 1, `${id} #${ctx.index} ${slot}: ${generic.length} glances`);
        const gaze = glances.reduce((s, l) => s + inTurn(l, D), 0);
        const cap = D >= 8 ? RULES.gazeShare * D : RULES.gazeShort;
        assert.ok(gaze <= cap + 1e-6, `${id} #${ctx.index} ${slot}: gaze ${gaze.toFixed(2)} > ${cap.toFixed(2)}`);
      }
    }
  }
});

test('listener nods: at most one per turn, on a stressed content word, never on grave lines, ≥ 1 s after a look starts; never for the speaker', () => {
  let nods = 0;
  for (const id of DUOS) {
    for (const { ctx, events } of planAll(EPISODES[id])) {
      const ns = events.filter((e) => e.kind === 'gesture');
      for (const n of ns) {
        assert.equal(n.name, 'nod');
        assert.notEqual(n.slot, ctx.speaker, 'speaker nods belong to planGestures');
        assert.ok(!ctx.grave, 'no nod on a grave segment');
        const w = ctx.words.find((x) => x.char === n.char);
        // a stressed content word, or the listener's own name in the greeting (world-now.md: greeting nod once per presenter)
        assert.ok(w && w.content && (w.stressed || n.why === 'nod-greeting'), `${id} #${ctx.index}: nod on a stressed content word`);
        for (const l of looksOf(events, n.slot)) assert.ok(!(n.at >= l.at - 0.3 && n.at < l.at + RULES.nodAfterLook), 'not within 1 s of a look start');
        nods++;
      }
      for (const slot of ctx.listeners) assert.ok(ns.filter((n) => n.slot === slot).length <= 1);
    }
  }
  // grave copy of a segment that nods: the nod disappears
  const ep = clone(EPISODES['world-now']);
  ep.segments[0].emotion = 'serious';
  const ctx = segmentContext(ep, 0, { gapAfter: 0.9 });
  assert.equal(planBehaviour(ctx).filter((e) => e.kind === 'gesture').length, 0);
  assert.ok(nods >= 1, 'the fixtures produce at least one nod');
});

test('TECH BYTES: Max glances at Ada as her dry line starts and is back before it ends', () => {
  const ep = {
    id: 'tb-dry', program: { id: 'tech-bytes', theme: 'tech' }, cast: { A: 'max', B: 'ada' },
    segments: [
      { type: 'story', anchor: 'A', emotion: 'neutral', text: 'A chipmaker has unveiled a laptop processor it says can run for twenty hours on one charge. Reviewers will test that claim next month.' },
      { type: 'story', anchor: 'B', emotion: 'neutral', text: 'A startup says its new folding phone survives two hundred thousand folds in the lab. The company plans to ship it in the spring across Europe and Asia. A phone that folds is still a phone.' },
    ],
  };
  const ctx = segmentContext(ep, 1, { gapAfter: 0.9 });
  assert.ok(ctx.dryLine === null || ctx.dryLine, 'dry line from the heuristic or the field');
  ep.segments[1].dry = 'A phone that folds is still a phone.';
  const c2 = segmentContext(ep, 1, { gapAfter: 0.9 });
  assert.ok(c2.dryLine, 'the dry line is known');
  const looks = looksOf(planBehaviour(c2), 'A').filter((l) => l.target === 'partner');
  const dry = looks.find((l) => /dry/.test(l.why));
  assert.ok(dry, 'Max glances at the dry line');
  const end = dry.at + dry.dur;
  assert.ok(end >= c2.dryLine.t0 + 0.3, 'the glance is on the line as it starts');
  assert.ok(end + 0.1 <= c2.dryLine.t1 + 1e-6, `back before it ends (${end.toFixed(2)} vs ${c2.dryLine.t1.toFixed(2)})`);
  if (dry.why === 'dry') assert.ok(dry.at >= c2.dryLine.t0 && dry.at <= c2.dryLine.t0 + 0.3, 'starts as the line starts');
});

test('COSMOS: UNIT-8 looks at Nova at the start of her turn for ~1.5 s, eased and mechanical; Nova never nods at its literal lines', () => {
  const plans = planAll(EPISODES.cosmos);
  let seen = 0;
  for (const { ctx, events } of plans) {
    if (!ctx.turnStart || ctx.speakerId !== 'nova') continue;
    const g = looksOf(events, 'B').find((l) => /^turn/.test(l.why));
    assert.ok(g, `#${ctx.index}: UNIT-8 glance`);
    assert.equal(g.style, 'mech');
    assert.ok(g.amt > 0 && g.amt < 1);
    if (g.why === 'turn') assert.ok(g.dur >= 1.4 - 1e-6 && g.dur <= 1.6 + 1e-6, `dur ${g.dur}`);
    seen++;
  }
  assert.ok(seen >= 2);
  for (const { ctx, events } of plans) {
    if (ctx.speakerId === 'unit8' && ctx.type === 'chat') assert.equal(events.filter((e) => e.kind === 'gesture' && e.slot === 'A').length, 0);
  }
});

test('MONEY MINUTE: notes glance in each gap between stories, ≤ 0.3 s after the last word, back on the lens ≥ 0.15 s before the next first word', () => {
  const plans = planAll(EPISODES['money-minute']);
  let n = 0;
  for (const { ctx, events } of plans) {
    const notes = events.filter((e) => e.target === 'notes');
    if (ctx.last) {
      assert.equal(notes.length, 0);
      continue;
    }
    if (!(ctx.type === 'story' || ctx.type === 'intro')) continue;
    assert.equal(notes.length, 1, `#${ctx.index}`);
    const l = notes[0];
    assert.ok(l.at <= ctx.duration + 0.3 + 1e-6, 'starts ≤ 0.3 s after the last word');
    assert.ok(l.at + l.dur + 0.1 <= ctx.duration + ctx.gapAfter - 0.15 + 1e-6, 'eyes back ≥ 0.15 s before the next first word');
    assert.ok(l.dur >= 0.45 && l.dur <= RULES.notes[1]);
    n++;
  }
  assert.ok(n >= 3);
  // without a known gap the planner does not guess
  const ctx = segmentContext(EPISODES['money-minute'], 1, {});
  assert.equal(planBehaviour(ctx).length, 0);
});

test('NEWS IN 60: notes only in gaps ≥ 0.6 s, at most one per 8 s', () => {
  const ep = EPISODES['news-60'];
  for (let i = 0; i < ep.segments.length - 1; i++) {
    const short = planBehaviour(segmentContext(ep, i, { gapAfter: 0.5 }));
    assert.equal(short.length, 0, 'no glance in a 0.5 s gap');
  }
  const plans = planAll(ep);
  let lastAbs = -Infinity, clock = 0;
  for (const { ctx, events } of plans) {
    for (const e of events) {
      assert.equal(e.target, 'notes');
      const abs = clock + e.at;
      assert.ok(abs - lastAbs >= RULES.notesEvery - 1e-6, 'one per 8 s at most');
      lastAbs = abs;
    }
    clock += ctx.duration + 0.7;
  }
});

test('a toss: the speaker looks at the partner over the last words and the partner meets the look', () => {
  const ep = clone(EPISODES['world-now']);
  const i = ep.segments.findIndex((s, k) => k > 0 && s.type === 'story' && s.anchor === 'A' && ep.segments[k + 1]?.anchor === 'B');
  ep.segments[i].text += ' Lola?';
  const ctx = segmentContext(ep, i, { gapAfter: 0.9 });
  assert.ok(isToss(ctx));
  const ev = planBehaviour(ctx);
  const sp = looksOf(ev, 'A').find((l) => /toss/.test(l.why));
  const meet = looksOf(ev, 'B').find((l) => /toss/.test(l.why));
  assert.ok(sp && meet, 'both look at each other');
  assert.ok(sp.at > ctx.duration - 2 && sp.at < ctx.duration, 'over the last words');
  assert.ok(meet.at + meet.dur > ctx.duration, 'the partner keeps the look into its own turn');
  assert.ok(meet.at >= sp.at, 'the partner meets the look, it does not start it');
});

test('planner is deterministic per episode and varies between episodes', () => {
  const a = planAll(EPISODES['tech-bytes']).map((p) => p.events);
  const b = planAll(EPISODES['tech-bytes']).map((p) => p.events);
  assert.deepEqual(a, b);
  const other = clone(EPISODES['tech-bytes']);
  other.id = `${other.id}-x`;
  const c = planAll(other).map((p) => p.events);
  assert.notDeepEqual(a, c, 'another episode id gives another (seeded) plan');
  // holds vary across turns (never one mechanical length)
  const holds = planAll(EPISODES['world-now']).flatMap((p) => p.events.filter((e) => e.why === 'turn').map((e) => e.dur.toFixed(2)));
  assert.ok(new Set(holds).size >= Math.min(3, holds.length));
});

test('planBehaviour never throws on malformed segments', () => {
  const bad = [{}, { id: 'x', segments: [] }, { id: 'y', cast: { A: 'paco', B: 'lola' }, segments: [{ type: 'chat' }] }, { id: 'z', segments: [{ text: 42 }] }];
  for (const ep of bad) for (let i = -1; i < 2; i++) assert.ok(Array.isArray(planBehaviour(segmentContext(ep, i))));
  assert.deepEqual(planBehaviour(null), []);
});

// ---------------------------------------------------------------------------
// Speech adapter and lip sync

/** A fake AudioEngine whose mouth is scripted: speaking 1.0-2.0 s at level 0.8 with a comma pause at 1.4 s. */
function scripted() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    speechFrame(ms, slot, out = {}) {
      calls++;
      const t = ms / 1000;
      const on = t >= 1 && t < 2;
      Object.assign(out, { slot, speaking: on, level: on ? 0.8 : 0, viseme: on ? 'AH' : 'rest', next: on ? 'AH' : 'rest', mix: 0, accent: on && t < 1.1 ? 1 : 0, pause: t >= 1.4 && t < 1.5, sentenceIndex: on ? 0 : -1, wordIndex: 0, charIndex: 0 });
      return out;
    },
  };
}

test('liveSpeech: one speechFrame per instant, env with 30 ms attack / 120 ms release, pause and end events', () => {
  const audio = scripted();
  const src = liveSpeech(audio, 'A');
  let fr;
  const at = (k) => 0.9 + k / 120; // a fixed 120 Hz grid from 0.9 s
  for (let k = 0; k <= 12; k++) fr = src.frame(at(k)); // up to 1.0 s
  const before = audio.calls;
  assert.equal(src.frame(at(12)), fr);
  assert.equal(audio.calls, before, 'the same instant is not sampled again');
  for (let k = 13; k <= 16; k++) fr = src.frame(at(k)); // ~1.033 s
  assert.ok(fr.env > 0.8 * 0.55 && fr.env < 0.8, `30 ms attack: env ${fr.env.toFixed(3)} after ~30 ms`);
  for (let k = 17; k <= 84; k++) fr = src.frame(at(k)); // to 1.6 s
  assert.ok(Math.abs(fr.pauseAt - 1.4) < 0.01, 'pause onset recorded');
  for (let k = 85; k <= 146; k++) fr = src.frame(at(k)); // to ~2.117 s
  assert.ok(Math.abs(fr.endAt - 2.0) < 0.01, 'end recorded');
  assert.ok(fr.env > 0.8 * 0.25 && fr.env < 0.8 * 0.45, `120 ms release: env ${fr.env.toFixed(3)} after 120 ms`);
  // the follow-through pose asks for an earlier instant: same frame, no sampling
  const n = audio.calls;
  assert.equal(src.frame(at(146) - 0.12), fr);
  assert.equal(audio.calls, n);
  // a seek pre-rolls: the same instant reached two ways gives the same envelope
  const a = liveSpeech(scripted(), 'A'), b = liveSpeech(scripted(), 'A');
  for (let t = 0; t <= 1.5; t += 1 / 60) a.frame(t);
  const fb = b.frame(a.frame(1.5) && 1.5);
  assert.ok(Math.abs(a.frame(1.5).env - fb.env) < 0.05);
});

test('mouthParams: the opening follows level, the width goes to mwide (not the eyes), m/b/p press the lips shut', () => {
  const f = {};
  mouthParams({ viseme: 'EE', next: 'EE', mix: 0, level: 0.3 }, f);
  assert.ok(Math.abs(f.open - 0.3) < 1e-9 && f.mwide > 0.3 && f.wide === undefined);
  mouthParams({ viseme: 'MBP', next: 'AH', mix: 0.2, level: 0.1 }, f);
  assert.equal(f.press, 1);
  assert.equal(f.open, 0);
  // the eye/mouth split survives solveFace: surprise opens the eyes, EE widens only the mouth
  const c = { ...FACE_REST, blink: 0, lookX: 0, lookY: 0, brow: 0, browIn: 0, smile: 0, squint: 0, lid: 0, wide: EMOTIONS.surprised.wide, open: 0, round: 0, teeth: 0, tongue: 0, press: 0, tuck: 0, jaw: 0 };
  mouthParams({ viseme: 'EE', next: 'EE', mix: 0, level: 0.4 }, c);
  const out = solveFace(c, {}, 1);
  assert.ok(out.wide > 0.4 && out.mwide > 0.3, 'eyes wide from the emotion, mouth wide from the viseme');
  const d = { ...c, wide: 0 };
  mouthParams({ viseme: 'EE', next: 'EE', mix: 0, level: 0.4 }, d);
  assert.equal(solveFace(d, {}, 1).wide, 0, 'speech never widens the eyes');
  assert.deepEqual(Object.keys(FACE_REST).sort(), ['level', 'mwide', 't']);
});

function lipRun(name, dt = 0.001) {
  const smp = SAMPLES[name];
  const T0 = 0.5;
  const audio = timelineAudio([{ slot: 'A', text: smp.text, t0: T0, words: smp.words, levels: { rate: 50, values: smp.levels } }]);
  const src = liveSpeech(audio, 'A');
  const f = {};
  const out = [];
  for (let t = 0; t < T0 + smp.duration + 0.5; t += dt) {
    const fr = sampleSpeech(src, t);
    mouthParams(fr, f, 1);
    out.push({ t, open: f.open, press: f.press > 0.5 && fr.speaking, shown: fr.mix > 0.5 ? fr.next : fr.viseme, speaking: fr.speaking });
  }
  return { smp, T0, lead: smp.words[0][0], out };
}

test('lip sync on recorded voices: openings after a pause start within ±40 ms of the recorded word', () => {
  let n = 0;
  for (const name of Object.keys(SAMPLES)) {
    const { smp, T0, lead, out } = lipRun(name);
    for (let k = 0; k < smp.words.length; k++) {
      const [wt, ch] = smp.words[k];
      const prevText = k ? smp.text.slice(smp.words[k - 1][1], ch) : '.';
      const word = smp.text.slice(ch).toLowerCase();
      if (!/[,.;:?!]\s*$/.test(prevText) || /^[mbpfvw]/.test(word)) continue; // after a pause, open-lip start
      const ts = T0 + (wt - lead);
      // first visible opening after the closed pause
      const i0 = out.findIndex((o) => o.t >= ts - 0.2);
      let onset = null;
      for (let i = i0; i < out.length && out[i].t < ts + 0.2; i++) {
        if (out[i].open >= 0.08 && out[i - 1].open < 0.08) {
          onset = out[i].t;
          break;
        }
      }
      assert.ok(onset !== null, `${name}: opening for "${word.slice(0, 8)}"`);
      assert.ok(Math.abs(onset - ts) <= 0.04 + 1e-6, `${name}: "${word.slice(0, 8)}" onset ${((onset - ts) * 1000).toFixed(0)} ms`);
      n++;
    }
  }
  assert.ok(n >= 5, `${n} onsets measured`);
});

test('lip sync: every m/b/p shows at least one closed frame at 25 fps (any phase); no shape switch faster than 40 ms', () => {
  for (const name of Object.keys(SAMPLES)) {
    const { out } = lipRun(name);
    // closed (pressed) intervals at 1 ms: each must catch a 25 fps frame whatever the phase (≥ 40 ms)
    let start = null;
    const lens = [];
    for (const o of out) {
      if (o.press && start === null) start = o.t;
      else if (!o.press && start !== null) {
        lens.push(o.t - start);
        start = null;
      }
    }
    assert.ok(lens.length >= 4, `${name}: m/b/p closures found`);
    for (const l of lens) assert.ok(l >= 0.04 - 1e-6, `${name}: closure ${(l * 1000).toFixed(0)} ms`);
    let last = null, lastT = -1;
    for (const o of out) {
      if (!o.speaking) continue;
      if (o.shown !== last) {
        if (lastT >= 0 && last !== null) assert.ok(o.t - lastT >= 0.04 - 0.0015, `${name}: ${last}→${o.shown} after ${((o.t - lastT) * 1000).toFixed(0)} ms`);
        last = o.shown;
        lastT = o.t;
      }
    }
  }
});

test('mute mode still moves the lips (estimated timeline, no recording)', () => {
  const audio = timelineAudio([{ slot: 'B', text: 'Good evening. Markets moved sharply today.', t0: 0.3 }]);
  const src = liveSpeech(audio, 'B');
  const f = {};
  let opened = 0, closed = 0;
  for (let t = 0.3; t < 2.5; t += 1 / 60) {
    mouthParams(sampleSpeech(src, t), f, 1);
    if (f.open > 0.2) opened++;
    if (f.press) closed++;
  }
  assert.ok(opened > 20 && closed > 2);
});

// ---------------------------------------------------------------------------
// Head frame, jaw, glasses, faces in pixels

test('head frame: frozen signatures, allocation-free variants, the jaw drops ≤ 2 px at any scale', () => {
  const L = { headAt: [0, -13], head: { top: -10, craniumY: -2.5, R: 7.4, cheekY: 1.6, cheekHW: 7, chinY: 9.2, chinHW: 2.6, jawPow: 2.1 } };
  for (const s of [1, 1.37, 2.15, 2.7, 4, 5]) {
    const sk = { head: { x: 0, y: 0, roll: 0.03, yaw: 0.2, pitch: 0 }, face: { jaw: 1 } };
    const head = headFrame(L, sk, (x, y) => [100 + x * s, 100 + y * s], s);
    assert.ok(head.jaw * s <= JAW_MAX_PX + 1e-9, `jaw ${head.jaw * s} px at s ${s}`);
    const p = head.toScreen(1, 2);
    assert.ok(Array.isArray(p) && p.length === 2);
    const q = head.toLocal(p[0], p[1]);
    assert.ok(Array.isArray(q) && Math.abs(q[0] - 1) < 1e-9 && Math.abs(q[1] - 2) < 1e-9);
    const o = [0, 0];
    assert.equal(head.toScreenInto(1, 2, o), o);
    assert.deepEqual(o, p);
    for (const k of ['L', 'cx', 'cy', 's', 'roll', 'cr', 'sr', 'yaw', 'pitch', 'jaw']) assert.ok(k in head, k);
  }
  assert.equal(drawGlasses.length, 5);
  assert.equal(glassesAnchor.length, 1); // (head, which = 'bridge', out = [0, 0])
});

test('faces render at every tier: eyes, brows and mouth inside the head; open mouths stay small; glasses follow the eyes', async () => {
  const { PartBuffer, Frame } = await import('../public/js/v2/canvas25d/pixbuf.js');
  const { actor } = await import('../public/js/v2/canvas25d/scene.js');
  const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
  const { drawCharacter } = await import('../public/js/v2/canvas25d/character.js');
  const { deriveLook } = await import('../public/js/v2/canvas25d/cast/base.js');
  const talk = { speaking: true, level: 1, viseme: 'AH', next: 'AH', mix: 0, accent: 0, pause: false, sentenceIndex: 0 };
  for (const id of ['paco', 'lola']) {
    for (const s of [1, 1.75, 2.7, 4]) {
      const buf = new PartBuffer();
      const a = actor(id, { side: 1, seed: 5, speech: { frame: () => talk } });
      const sk = poseAt(a, 0.3);
      const head = drawCharacter(buf, a.look, sk, { x: 192, y: 150, s, gb: 0 });
      // the mouth (maroon interior) never takes more than 3 rows: no gaping
      let rows = 0;
      const M = a.look.mouth;
      const my = Math.round(head.cy + M.y * s);
      for (let y = my - 2; y <= my + 6; y++) {
        let any = false;
        for (let x = head.cx - 10; x <= head.cx + 10; x++) {
          const i = y * buf.w + x;
          if (buf.mat[i] && buf.mat[i] === decal(M.inner)) any = true;
        }
        if (any) rows++;
      }
      assert.ok(rows <= (s >= 3.2 ? 3 : s >= 2.2 ? 2 : 1), `${id} s ${s}: ${rows} rows of open mouth`);
      const frame = new Frame();
      buf.resolve(frame);
    }
  }
  // glasses: the bridge anchor sits between the eyes, on the eye line
  const base = actor('lola', { side: 1, seed: 5 });
  const look = deriveLook(base.look, { id: 'lola-g', glasses: { style: 'rect', ramp: ['#3a4466', '#262b44', '#181425', '#181425'] } });
  const sk = poseAt(base, 0.3);
  const buf = new PartBuffer();
  const head = drawCharacter(buf, look, sk, { x: 192, y: 150, s: 4, gb: 0 });
  drawGlasses(buf, look, head, sk.face, 4);
  const br = glassesAnchor(head, 'bridge', [0, 0]);
  assert.ok(Math.abs(br[0] - head.cx) < 3 && br[1] < head.cy + look.eyes.y * 4 + 2 && br[1] > head.cy + look.eyes.y * 4 - 8);
  let frame = 0;
  for (let i = 0; i < buf.grp.length; i++) if (buf.mat[i] && (buf.grp[i] === 56 || buf.grp[i] === 57)) frame++;
  assert.ok(frame > 20, `glasses pixels ${frame}`);
});

test('emotions stay restrained (adult register): no preset beyond small brows and a closed smile', () => {
  for (const [name, e] of Object.entries(EMOTIONS)) {
    assert.ok(Math.abs(e.brow) <= 0.65, `${name} brow`);
    assert.ok(Math.abs(e.smile) <= 0.6, `${name} smile`);
    assert.ok((e.wide || 0) <= 0.5, `${name} wide`);
  }
  // the built-in demo timelines still drive the mouth (frozen demos)
  const sp = buildSpeech('Good evening, and welcome.', { t0: 0 });
  const f = {};
  let open = 0;
  for (let t = 0; t < sp.t1; t += 0.02) {
    mouthParams(sampleSpeech(sp, t), f);
    if (f.open > 0.2) open++;
  }
  assert.ok(open > 10);
});

// ---------------------------------------------------------------------------
// Round 2: variety without repetition (owner 20:40), calmer jaw, wide-shot fixes

test('variety: turn glances vary in amplitude (0.82-1.0 of the approved glance), the dry-line glance is sidelong, plans stay deterministic', () => {
  const amps = [];
  for (const id of DUOS) {
    for (const { ctx, events } of planAll(EPISODES[id])) {
      for (const e of events) {
        if (e.kind !== 'look' || !/^turn/.test(e.why) || ctx.cast[e.slot] === 'unit8') continue;
        const a = e.amt ?? 1;
        assert.ok(a >= RULES.glanceAmt[0] - 1e-9 && a <= 1, `${id} #${ctx.index} amt ${a}`);
        amps.push(a);
      }
    }
  }
  assert.ok(new Set(amps.map((a) => a.toFixed(2))).size >= 3, 'not one mechanical glance');
  assert.ok(amps.some((a) => a === 1), 'the full approved glance stays in the mix');
  const dry = planAll(EPISODES['tech-bytes']).flatMap((p) => p.events).filter((e) => e.why === 'dry');
  assert.ok(dry.length >= 1 && dry.every((e) => e.style === 'side'), 'the deadpan glance is sidelong');
});

test('interest reactions: face only, at a spoken figure, at most one per listener per turn, never grave, never UNIT-8, never inside another look', () => {
  let seen = 0;
  const eps = [...DUOS.map((id) => EPISODES[id])];
  // more chances: the same episodes under other ids (other seeds)
  for (let k = 0; k < 6; k++) for (const id of DUOS) eps.push({ ...clone(EPISODES[id]), id: `${EPISODES[id].id}-v${k}` });
  for (const ep of eps) {
    for (const { ctx, events } of planAll(ep)) {
      for (const slot of Object.keys(ctx.cast)) {
        const rs = reactionsOf(events, slot);
        assert.ok(rs.length <= 1, 'one reaction per turn at most');
        for (const r of rs) {
          assert.notEqual(slot, ctx.speaker, 'listeners only');
          assert.ok(!ctx.grave, 'never on grave lines');
          assert.notEqual(ctx.cast[slot], 'unit8');
          assert.ok(ctx.figures.some((f) => Math.abs(f.t - 0.08 - r.at) < 1e-3), 'lands on a spoken figure');
          for (const n of events.filter((e) => e.kind === 'gesture' && e.slot === slot)) assert.ok(n.at <= r.at - RULES.nodAfterLook || n.at >= r.at + r.dur, 'not on a nod');
          seen++;
        }
      }
    }
  }
  assert.ok(seen >= 2, `${seen} reactions in the fixtures and their reseeded copies`);
  // grave copy: none
  const ep = clone(EPISODES['tech-bytes']);
  for (const sg of ep.segments) sg.emotion = 'serious';
  for (const { events } of planAll(ep)) assert.equal(events.filter((e) => REACTIONS.has(e.target)).length, 0);
});

test('story-boundary looks: never on a later roundup item, never after a short item', () => {
  for (let k = 0; k < 8; k++) {
    const ep = { ...clone(EPISODES['world-now']), id: `wn-b${k}` };
    for (const { ctx, events } of planAll(ep)) {
      const b = events.filter((e) => e.why === 'wall' || e.why === 'between');
      if (!b.length) continue;
      assert.ok(!(ctx.seg.roundup && ctx.seg.roundup.index > 0), `#${ctx.index}: a boundary look on roundup item ${ctx.seg.roundup?.index}`);
      assert.ok(ep.segments[ctx.index - 1].text.length / 15 >= RULES.boundaryAfter, `#${ctx.index}: after a short item`);
      for (const e of b) assert.ok(e.at <= RULES.wallWithin + 1e-6 && e.dur <= RULES.notes[1] + 1e-6);
    }
  }
});

test('applyLook: an interest reaction lifts the brows without moving the eyes; a sidelong glance turns the head 40 %', () => {
  const ch = () => ({ lookX: 0, lookY: 0, yaw: 0, pitch: 0, lean: 0, hx: 0, hy: 0, lid: 0, smile: 0, brow: 0, browIn: 0, roll: 0 });
  const r = ch();
  const g = applyLook(r, { side: 1, look: [{ t0: 0, t1: 2, target: 'interest' }] }, 1, 0);
  assert.ok(r.brow > 0.2 && r.lookX === 0 && r.lookY === 0 && r.yaw === 0 && g === 0, 'brows only, no eye drive');
  const full = ch(), side = ch();
  applyLook(full, { side: 1, look: [{ t0: 0, t1: 5 }] }, 2, 0);
  applyLook(side, { side: 1, look: [{ t0: 0, t1: 5, style: 'side' }] }, 2, 0);
  assert.ok(Math.abs(side.lookX - full.lookX) < 1e-9, 'the eyes go all the way');
  assert.ok(Math.abs(side.yaw - 0.4 * full.yaw) < 1e-9, 'the head follows 40 %');
  const meet = ch();
  applyLook(meet, { side: 1, look: [{ t0: 0, t1: 5, style: 'interest' }] }, 0.8, 0);
  assert.ok(meet.brow > 0.15 && meet.lookX > 0.5, 'meeting a question: eyes on the partner, brows up');
  const later = ch();
  applyLook(later, { side: 1, look: [{ t0: 0, t1: 5, style: 'interest' }] }, 3.5, 0);
  assert.ok(Math.abs(later.brow) < 1e-6, 'the lift is brief, the look goes on');
});

test('the jaw moves with the phrase, not every syllable: few chin steps per second on recorded voices', async () => {
  const { actor } = await import('../public/js/v2/canvas25d/scene.js');
  const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
  for (const name of Object.keys(SAMPLES)) {
    const smp = SAMPLES[name];
    const audio = timelineAudio([{ slot: 'A', text: smp.text, t0: 0.5, words: smp.words, levels: { rate: 50, values: smp.levels } }]);
    const a = actor(smp.presenter, { side: 1, seed: 5, speech: liveSpeech(audio, 'A') });
    const s = 4;
    let last = null, steps = 0, open = 0, n = 0;
    for (let t = 0.5; t < 0.5 + smp.duration; t += 1 / 60) {
      const sk = poseAt(a, t);
      const px = Math.round(Math.min(sk.face.jaw, JAW_MAX_PX / s) * s);
      if (last !== null && px !== last) steps++;
      last = px;
      if (sk.face.open > 0.15) open++;
      n++;
    }
    const perSec = steps / smp.duration;
    assert.ok(perSec <= 4.5, `${name}: ${perSec.toFixed(1)} chin steps/s`);
    assert.ok(open / n > 0.2, `${name}: the lips still open on the syllables`);
  }
});

test('per-sentence head attitude: live voices only (the frozen demos keep their motion), deterministic', async () => {
  const { applySpeech } = await import('../public/js/v2/canvas25d/speech.js');
  const persona = { energy: 0.7, headMotion: 0.7 };
  const audio = timelineAudio([{ slot: 'A', text: 'Good evening. Markets moved sharply today. Bakers are pleased.', t0: 0.3 }]);
  const run = (sp) => {
    const out = [];
    for (let t = 0.3; t < 4; t += 0.25) {
      const c = { brow: 0, pitch: 0, hy: 0, yaw: 0, roll: 0 };
      applySpeech(c, persona, { seed: 9, speech: sp }, t);
      out.push(c.yaw);
    }
    return out;
  };
  const a = run(liveSpeech(audio, 'A')), b = run(liveSpeech(audio, 'A'));
  assert.deepEqual(a, b);
  // built timelines: no attitude term (the demo motion is unchanged)
  const sp = buildSpeech('Good evening. Markets moved sharply today.', { t0: 0.3 });
  const c1 = { brow: 0, pitch: 0, hy: 0, yaw: 0, roll: 0 };
  applySpeech(c1, persona, { seed: 9, speech: sp }, 1.5);
  const fr = sampleSpeech(sp, 1.5);
  const wob = (t, seed) => 0.5 * Math.sin(t * 1.13 + seed * 1.7) + 0.3 * Math.sin(t * 2.31 + seed * 2.9) + 0.2 * Math.sin(t * 3.77 + seed * 4.3);
  assert.ok(Math.abs(c1.yaw - 0.05 * persona.headMotion * fr.act * wob(1.5 * 0.55, 9 + 3.1)) < 1e-9);
});

test('wide shots: a smile never bends the mouth into a U; glasses never make a dark bar across the eyes', async () => {
  const { PartBuffer } = await import('../public/js/v2/canvas25d/pixbuf.js');
  const { actor } = await import('../public/js/v2/canvas25d/scene.js');
  const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
  const { drawCharacter } = await import('../public/js/v2/canvas25d/character.js');
  for (const id of ['paco', 'lola', 'max', 'penny', 'sam']) {
    const a = actor(id, { side: 1, seed: 5, emotions: [{ t0: -5, name: 'happy' }] });
    const buf = new PartBuffer();
    const head = drawCharacter(buf, a.look, poseAt(a, 0.3), { x: 192, y: 150, s: 1, gb: 0 });
    // the lip line is one row: no mouth pixel on the row above the line within the mouth's width
    const M = a.look.mouth;
    const y0 = Math.round(head.cy + M.y);
    let rows = 0;
    for (let y = y0 - 2; y <= y0 + 2; y++) {
      let any = false;
      for (let x = head.cx - 4; x <= head.cx + 4; x++) {
        const i = y * buf.w + x;
        if (buf.mat[i] === a.look._mats.skinD && buf.tone[i] >= 2 && buf.grp[i] === 7) any = true;
      }
      if (any) rows++;
    }
    assert.ok(rows <= 2, `${id}: ${rows} rows of mouth at s 1`);
  }
  // Ada's glasses at s 1: the eye row never carries a run of more than 3 non-skin pixels
  // (frame + eye + eye), so the two eyes, the rims and the bridge never join into a bar
  const ada = actor('ada', { side: 1, seed: 5 });
  const buf = new PartBuffer();
  const head = drawCharacter(buf, ada.look, poseAt(ada, 0.3), { x: 192, y: 150, s: 1, gb: 0 });
  const skin = ada.look._mats.skin;
  let frame = 0, worst = 0;
  for (let y = head.cy - 6; y <= head.cy + 4; y++) {
    let onRow = false; // only the rows that carry the frame (the eye line), not the brows
    for (let x = head.cx - 8; x <= head.cx + 8; x++) if (buf.grp[y * buf.w + x] === 56 || buf.grp[y * buf.w + x] === 57) onRow = true;
    if (!onRow) continue;
    let run = 0;
    for (let x = head.cx - 8; x <= head.cx + 8; x++) {
      const i = y * buf.w + x;
      if (buf.grp[i] === 56 || buf.grp[i] === 57) frame++;
      const g = buf.grp[i];
      const feature = (g === 56 || g === 57 || (g === 7 && buf.mat[i] && buf.mat[i] !== skin && buf.mat[i] !== ada.look._mats.skinD));
      run = feature ? run + 1 : 0;
      if (run > worst) worst = run;
    }
  }
  assert.ok(frame >= 2, `glasses visible (${frame} px)`);
  assert.ok(worst <= 3, `a dark run of ${worst} px across the eyes`);
});

// ---------------------------------------------------------------------------
// Round 3 (retry): real recorded clips, the greeting nod, the forehead sheen

const VOICED = JSON.parse(fs.readFileSync(new URL('./fixtures/v2-face-voiced.json', import.meta.url), 'utf8')).segments;

test('lip sync on 16 real Kokoro clips: openings after pauses within ±40 ms of the recorded word, m/b/p closures ≥ 40 ms, no shape held < 40 ms', () => {
  let onsets = 0, closures = 0;
  for (const seg of VOICED) {
    const T0 = 0.5, lead = seg.words[0][0];
    const audio = timelineAudio([{ slot: 'A', text: seg.text, t0: T0, words: seg.words, levels: seg.levels }]);
    const src = liveSpeech(audio, 'A');
    const f = {}, out = [];
    for (let t = 0; t < T0 + seg.duration + 0.3; t += 0.001) {
      const fr = sampleSpeech(src, t);
      mouthParams(fr, f, 1);
      out.push({ t, open: f.open, press: f.press > 0.5 && fr.speaking, shown: fr.mix > 0.5 ? fr.next : fr.viseme });
    }
    for (let k = 0; k < seg.words.length; k++) {
      const [wt, ch] = seg.words[k];
      const prevText = k ? seg.text.slice(seg.words[k - 1][1], ch) : '.';
      const word = seg.text.slice(ch).toLowerCase();
      if (!/[,.;:?!]\s*$/.test(prevText) || /^[mbpfvw]/.test(word)) continue; // after a pause, open-lip start
      const ts = T0 + (wt - lead);
      const i0 = out.findIndex((o) => o.t >= ts - 0.2);
      let onset = null;
      for (let i = Math.max(1, i0); i < out.length && out[i].t < ts + 0.2; i++) {
        if (out[i].open >= 0.08 && out[i - 1].open < 0.08) {
          onset = out[i].t;
          break;
        }
      }
      assert.ok(onset !== null && Math.abs(onset - ts) <= 0.04 + 1e-6, `${seg.programme} "${word.slice(0, 12)}": onset ${onset === null ? 'none' : ((onset - ts) * 1000).toFixed(0) + ' ms'}`);
      onsets++;
    }
    let start = null;
    for (const o of out) {
      if (o.press && start === null) start = o.t;
      else if (!o.press && start !== null) {
        assert.ok(o.t - start >= 0.04 - 1e-6, `closure ${((o.t - start) * 1000).toFixed(0)} ms`);
        closures++;
        start = null;
      }
    }
    let last = null, lastT = -1;
    for (const o of out) {
      if (o.shown === last) continue;
      if (lastT >= 0 && last !== null) assert.ok(o.t - lastT >= 0.04 - 0.0015, `${last}→${o.shown} after ${((o.t - lastT) * 1000).toFixed(0)} ms`);
      last = o.shown;
      lastT = o.t;
    }
  }
  assert.ok(onsets >= 30 && closures >= 40, `${onsets} onsets, ${closures} closures`);
});

test('greeting nod (world-now.md: once per presenter): the co-presenter named in the intro nods on its own name', () => {
  for (const id of DUOS) {
    const ep = clone(EPISODES[id]);
    for (const s of ep.segments) s.cues = (s.cues || []).filter((c) => c.action !== 'nod' || !c.slot); // no writer hint
    const ctx = segmentContext(ep, 0, { gapAfter: 0.9 });
    const name = { lola: 'lola', ada: 'ada', unit8: 'unit-8' }[ep.cast.B];
    const at = ctx.seg.text.toLowerCase().lastIndexOf(name);
    const nods = planBehaviour(ctx).filter((e) => e.kind === 'gesture' && e.slot === 'B');
    assert.equal(nods.length, 1, `${id}: one greeting nod`);
    assert.equal(nods[0].why, 'nod-greeting');
    assert.ok(nods[0].char >= at && nods[0].char < at + name.length + 1, `${id}: on "${name}" (char ${nods[0].char}, name at ${at})`);
    // grave intros keep a straight face
    ep.segments[0].emotion = 'serious';
    assert.equal(planBehaviour(segmentContext(ep, 0, { gapAfter: 0.9 })).filter((e) => e.kind === 'gesture').length, 0);
  }
});

test('skin: the forehead highlight is a short sheen above the key-side brow in close-ups (never a patch under the hairline), none in mediums', async () => {
  const { PartBuffer } = await import('../public/js/v2/canvas25d/pixbuf.js');
  const { actor } = await import('../public/js/v2/canvas25d/scene.js');
  const { poseAt } = await import('../public/js/v2/canvas25d/rig.js');
  const { drawCharacter, GROUPS } = await import('../public/js/v2/canvas25d/character.js');
  for (const id of ['paco', 'lola', 'max', 'ada', 'penny', 'sam']) {
    for (const s of [1.75, 3.4, 4]) {
      const buf = new PartBuffer();
      const a = actor(id, { side: 1, seed: 11 });
      const head = drawCharacter(buf, a.look, poseAt(a, 0.3), { x: 192, y: 150, s, gb: 0 });
      const skin = a.look._mats.skin, B = a.look.brows;
      let hi = 0, forehead = 0, high = 0, n = 0;
      for (let i = 0; i < buf.grp.length; i++) {
        if (buf.grp[i] !== GROUPS.head || buf.mat[i] !== skin) continue;
        n++;
        if (buf.tone[i] !== 0) continue;
        hi++;
        const y = (Math.floor(i / buf.w) + 0.5 - head.cy) / s;
        if (y < a.look.eyes.y - 1) forehead++;
        if (y < B.y - 2.2) high++;
      }
      if (s < 2.2) assert.equal(forehead, 0, `${id} s ${s}: no forehead highlight in a medium`);
      else {
        assert.ok(hi / n <= 0.04, `${id} s ${s}: highlight ${(100 * hi / n).toFixed(1)} % of the skin`);
        assert.equal(high, 0, `${id} s ${s}: ${high} highlight px high on the forehead (a bald patch)`);
      }
    }
  }
});

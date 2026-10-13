// Camera and rhythm polish (owner, 13 Oct: "con un nivel real"): the rules the recorded programmes were measured
// against (tools/pace/trace.mjs --camera, tools/pace/camera.mjs; docs/PACING.md "Camera polish"): no cut inside a
// word, the cooldown counted from the last cut the viewer saw, a new card is a cut, the picture's pan eases off
// the cut on one axis, the guard's hand-over point for an expert, the round-up's opening map, the planner's rhythm
// (a story's shot budget, COSMOS's cooldown, no lead-in wide before a card of its own, the closing wide's cap) and
// the analyser's own checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paceFor, picturePan, PROGRAMME_IDS, gapAfter } from '../public/js/pace.js';
import { Director } from '../public/js/director.js';
import { holdCut } from '../public/js/v2/canvas25d/runtime/direction.js';
import { planSegment } from '../public/js/v2/canvas25d/direction/index.js';
import { fakeClock } from '../tools/pace/fakeplay.mjs';
import { analyseTimeline } from '../tools/pace/camera.mjs';
import { planLink, playPlan, wantedShots } from '../public/js/linkplan.js';

const FIX = new URL('./fixtures/v2-episodes/', import.meta.url);
const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`${name}.json`, FIX), 'utf8'));
const shotsOf = (ep, i) => planSegment(ep, i, { gapAfter: (j) => gapAfter(ep, j).gap }).events.filter((e) => e.kind === 'shot');

// ------------------------------------------------------------------ the picture's pan

test('picture pan: eases off the cut from rest, one axis, whole pixels, never past its margin, never stops dead on air', () => {
  for (const id of PROGRAMME_IDS) {
    const { speed, ease } = paceFor(id).shots.pan;
    assert.ok(speed > 0 && speed <= 4, `${id}: the bibles' 4 px/s at most (${speed})`);
    for (const dir of [1, -1]) {
      let prev = null;
      let steps = 0;
      for (let f = 0; f <= 30 * 20; f++) {
        const p = picturePan(f / 30, 32, 18, dir, id);
        assert.ok(Number.isInteger(p.ox) && Number.isInteger(p.oy), 'whole pixels');
        assert.equal(p.oy, 9, 'held at its vertical centre: no diagonal staircase');
        assert.ok(p.ox >= 0 && p.ox <= 32, `inside the margin (${p.ox})`);
        if (prev) {
          const d = (p.ox - prev.ox) * dir;
          assert.ok(d >= 0 && d <= 1, `${id}: monotone, at most a pixel a frame (${d} at frame ${f})`);
          if (d) steps++;
        }
        prev = p;
      }
      assert.equal(steps, 32, `${id}: crosses the whole margin once`);
      // from rest: the first pixel comes well after the cut (the old ease-out moved at ~7 px/s from frame 1)
      let first = 0;
      while (picturePan(first / 30, 32, 18, dir, id).ox === picturePan(0, 32, 18, dir, id).ox) first++;
      assert.ok(first / 30 >= ease / 2, `${id}: first step at ${(first / 30).toFixed(2)} s`);
    }
    // a picture is on air at most ~10 s: it is still drifting when it is cut (no stop on air)
    const at = (t) => picturePan(t, 32, 18, 1, id).ox;
    assert.ok(at(paceFor(id).shots.picture[1]) < 32, `${id}: still moving at the picture maximum`);
  }
  // the bibles' numbers: COSMOS slower than the rest
  assert.ok(paceFor('cosmos').shots.pan.speed < paceFor('world-now').shots.pan.speed);
});

// ------------------------------------------------------------------ the director's cuts

function director(audio = {}) {
  return new Director({
    audio: { mode: 'mute', setVoices() {}, stop() {}, playTune: () => ({ stop() {} }), sfx() {}, speak: () => Promise.resolve(), ...audio },
    channel: { name: 'GLOBIT 24', slogan: '', presenters: {} },
  });
}

test('director: a cut held back by the cooldown never lands inside a word (next word onset, else at once in silence)', async () => {
  const clock = fakeClock();
  try {
    const t0 = clock.now();
    // a voice whose words start every 0.3 s for 2 s; then silence
    const onsets = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8];
    let long = false;
    const audio = {
      speechFrame(nowMs, slot, out = {}) {
        const t = nowMs / 1000 - t0;
        out.speaking = long || (t >= 0 && t < 2);
        out.sentenceIndex = 0;
        out.wordIndex = long ? 7 : out.speaking ? onsets.filter((x) => x <= t + 1e-9).length - 1 : -1;
        return out;
      },
    };
    const d = director(audio);
    const at = {};
    d.cutWhenClear(0.5, () => (at.mid = clock.now() - t0)); // in the middle of word 1 (0.3-0.6)
    d.cutWhenClear(2.4, () => (at.silent = clock.now() - t0)); // after the voice
    const cancelled = d.cutWhenClear(0.5, () => (at.cancelled = clock.now() - t0));
    cancelled.cancel();
    await clock.run(new Promise((r) => setTimeout(r, 3000)));
    assert.ok(at.mid >= 0.6 - 1e-6 && at.mid < 0.6 + 0.02, `on the next word's first sound: ${at.mid}`);
    assert.ok(Math.abs(at.silent - 2.4) < 1e-6, `in silence at once: ${at.silent}`);
    assert.equal(at.cancelled, undefined, 'a cancelled cut never fires');
    // one endless word: at most WORD_WAIT (0.8 s) late
    long = true;
    const t1 = clock.now();
    let late = null;
    d.cutWhenClear(0.2, () => (late = clock.now() - t1));
    await clock.run(new Promise((r) => setTimeout(r, 2000)));
    assert.ok(late > 0.95 && late < 1.05, `capped: ${late}`);
    // no speech frame at all (a test stub, an old engine): the plain timer
    const plain = director();
    const t2 = clock.now();
    let p = null;
    plain.cutWhenClear(0.4, () => (p = clock.now() - t2));
    await clock.run(new Promise((r) => setTimeout(r, 1000)));
    assert.ok(Math.abs(p - 0.4) < 1e-6);
  } finally {
    clock.restore();
  }
});

test('director: a new card is a cut; the cooldown counts from the last cut the viewer saw (a re-set wide is none)', async () => {
  const clock = fakeClock();
  try {
    const d = director();
    d.scene.cast = { A: 'paco', B: 'lola' };
    const wait = (s) => clock.run(new Promise((r) => setTimeout(r, s * 1000)));
    d.setShot('fact', { focus: 'A', storyId: 's1', card: { numbers: [{ value: '40,000' }], source: 'X' } });
    const first = d.scene.shotSince;
    await wait(5);
    d.setShot('fact', { focus: 'A', storyId: 's1', card: { numbers: [{ value: '40,000' }], source: 'X' } });
    assert.equal(d.scene.shotSince, first, 'the same card again is no cut');
    d.setShot('fact', { focus: 'A', storyId: 's1', card: { quote: { text: 'This line will change the old town' }, source: 'X' } });
    assert.ok(d.scene.shotSince > first, 'BY THE NUMBERS → the quote card: a cut (its clock restarts)');
    // v2: the chats' wide re-set on a new speaker is the same camera; a new framing of it (two-shot → wide) is a cut
    d.v2 = { episode() {} };
    d.setShot('wide', { focus: 'B', framing: 'wide', cameraMove: null });
    await wait(3);
    d.setShot('wide', { focus: 'A', framing: 'wide', cameraMove: null });
    assert.ok(d.onAir() >= 3 - 1e-6, `a focus re-set keeps counting: ${d.onAir()}`);
    d.setShot('wide', { focus: 'A', framing: 'two', cameraMove: null });
    assert.ok(d.onAir() < 1e-6, 'a new framing of the wide is a visible cut');
  } finally {
    clock.restore();
  }
});

test('director: the first word is heard a breath after the open, the voice start-up included', () => {
  const d = director({ mode: 'tts' });
  for (const id of ['world-now', 'news-60', 'cosmos']) {
    d.scene.program = { id };
    const P = paceFor(id);
    assert.ok(Math.abs(d.openBreath() - Math.max(0.05, P.open.firstWord - 0.18)) < 1e-9, id);
  }
  const mute = director({ mode: 'mute' });
  mute.scene.program = { id: 'world-now' };
  assert.equal(mute.openBreath(), paceFor('world-now').open.firstWord, 'no voice, no start-up to take off');
});

// ------------------------------------------------------------------ the runtime guard

function storyPlan(sentences, seg, { duration, events = [] } = {}) {
  let start = 0;
  const ss = sentences.map(([t0, text]) => {
    const s = { t0, start, text };
    start += text.length + 1;
    return s;
  });
  return { index: 1, events, ctx: { type: 'story', seg: { text: sentences.map((x) => x[1]).join(' '), ...seg }, speaker: 'B', sentences: ss, duration, dryLine: null } };
}

test('guard: an expert\'s two-sentence hand-over is the limit (never a cut back to the reader just before the two-way)', () => {
  const S = paceFor('world-now').shots;
  const lines = [
    [0, 'DNA left on a cover helped investigators recover two stolen paintings, a prosecutor said.'],
    [5.5, 'An alarm sounded and police officers arrived four minutes later, according to reports.'],
    [11.2, "Let's bring in our Culture Correspondent, Leo Sepia."],
    [13.5, 'Leo, what is the story behind it?'],
  ];
  const point = { char: 120, t0: 7.0 };
  const onAir = { shot: 'full', framing: null, focus: 'B', held: S.cooldown };
  // a correspondent's link: the hand-over is the last sentence (13.5 s): the picture would pass its maximum
  const plain = storyPlan(lines, { link: 'R3' }, { duration: 15.5 });
  assert.ok(holdCut(plain, 1, onAir, { programId: 'world-now', gap: 0.85, cues: [], closeFraming: 'mcu-r', point }), 'a correspondent: cut back');
  // an expert's: the introduction (11.2 s) is the limit, 4.2 s away: no new shot that short
  const expert = storyPlan(lines, { link: 'R3', linkKind: 'expert' }, { duration: 15.5 });
  assert.equal(holdCut(expert, 1, onAir, { programId: 'world-now', gap: 0.85, cues: [], closeFraming: 'mcu-r', point }), null);
});

test('guard: the round-up\'s opening map carries its title on top of the map maximum', () => {
  const S = paceFor('world-now').shots;
  const lines = [
    [0, 'Now, around the world.'],
    [2.5, 'In Kenya, a solar farm north of Nairobi has started supplying power to a million homes.'],
    [8.2, 'It is the largest in East Africa, the operator says, and more panels are planned next year.'],
  ];
  const zoom = { kind: 'shot', shot: 'map', zoom: true, at: 2.5 };
  const onAir = { shot: 'map', framing: null, focus: 'B', held: 8.2 };
  const item = storyPlan(lines, { roundup: { index: 0 } }, { duration: 13, events: [{ kind: 'shot', shot: 'map', at: 0 }, zoom] });
  // 8.2 s held + 5.4 s to go = 13.6 s: past 10, inside 10 + the 2.5 s title (less the 1 s margin)? no: 13.6 > 11.5
  assert.ok(holdCut(item, 2, onAir, { programId: 'world-now', gap: 0.6, cues: [], closeFraming: 'mcu-r' }));
  // a shorter item: 6.2 + 5 = 11.2 s, inside 10 + 2.5 - 1 = 11.5: no flash of the reader between two maps
  const short = storyPlan([lines[0], lines[1], [6.2, lines[2][1]]], { roundup: { index: 0 } }, { duration: 10.6, events: [{ kind: 'shot', shot: 'map', at: 0 }, zoom] });
  assert.equal(holdCut(short, 2, { ...onAir, held: 6.2 }, { programId: 'world-now', gap: 0.6, cues: [], closeFraming: 'mcu-r' }), null);
  // never a phrase-mark cut back to the reader in the middle of that map's voice-over (live WORLD NOW: 4.4 s of map,
  // then the reader 1.1 s into "Rescue helicopters..."), whether or not the writer flagged the item as a round-up
  const unflagged = storyPlan(lines, {}, { duration: 13, events: [{ kind: 'shot', shot: 'map', at: 0 }, zoom] });
  assert.equal(holdCut(unflagged, 2, { ...onAir, held: 4.4 }, { programId: 'world-now', gap: 0.6, cues: [], closeFraming: 'mcu-r', point: { char: 60, t0: 4.4 } }), null);
  // without the title (a later item), the same item is capped at the map maximum
  const later = storyPlan([lines[1], [5.7, lines[2][1]]], { roundup: { index: 1 } }, { duration: 9.6, events: [{ kind: 'shot', shot: 'map', at: 0 }] });
  assert.ok(S.map[1] < 11.2);
  assert.ok(holdCut(later, 1, { ...onAir, held: 6.2 }, { programId: 'world-now', gap: 0.6, cues: [], closeFraming: 'mcu-r' }));
});

// ------------------------------------------------------------------ the correspondent's shots

test('link plan: a correspondent or expert full frame past the studio maximum gives way to their pictures or the two-way', () => {
  const holdsOf = (plan, o) => {
    const full = plan.map((x, i) => x || null);
    return playPlan(full, { ...o, want: wantedShots(o.part, o.starts.length, o) }).holds.filter((h) => h.to > h.from);
  };
  // an expert's 24 s answer (no pictures): location, two-way, location; each part keeps the floor
  const expert = { part: 'piece', starts: [0, 6, 11.5, 17, 21], end: 24, current: 'twoway', held: 5.4, min: 4, broll: false, next: 'twoway', nextAt: 24.4, max: 15 };
  const plan = planLink(expert);
  assert.ok(plan.includes('twoway'), plan.join(' '));
  for (const h of holdsOf(plan, expert)) {
    assert.ok(h.to - h.from <= expert.max + 0.5 || h.shot !== 'location', `${h.shot} ${(h.to - h.from).toFixed(1)} s`);
    if (h.from >= 0) assert.ok(h.to - h.from >= expert.min - 1e-6, `${h.shot} ${(h.to - h.from).toFixed(1)} s under the floor`);
  }
  // with pictures the relief is the pictures
  assert.ok(planLink({ ...expert, broll: true }).includes('broll'));
  // within the maximum (or without one), the plan is as before
  assert.ok(!planLink({ ...expert, max: Infinity }).includes('twoway'));
  const short = { ...expert, starts: [0, 4.5, 8], end: 11, nextAt: 11.4 };
  assert.deepEqual(planLink(short), planLink({ ...short, max: Infinity }));
});

// ------------------------------------------------------------------ the planner's rhythm

const story = (text, extra = {}) => ({ type: 'story', anchor: 'A', emotion: 'neutral', text, cues: [], storyId: `s${text.length}`, ...extra });
const WALES = 'Storms have uncovered footprints left on a beach in Wales about seven thousand years ago. Scientists say the prints belong to adults and children walking together. The tide will cover them again within weeks, so teams are racing to record them. They hope the scans will show how the group moved along the old shore.';

test('planner: a story carries at most max(2, floor(L / ideal)) shots at the programme\'s median (COSMOS: picture, not map + picture + reader)', () => {
  const ep = {
    id: 'cosmos-rhythm',
    program: { id: 'cosmos' },
    cast: { A: 'nova', B: 'unit8' },
    segments: [{ type: 'intro', anchor: 'A', text: 'Good evening and welcome to COSMOS DESK.', cues: [] }, story(WALES, { hasImage: true, location: { lat: 51.6, lon: -4.0, place: 'Wales' } }), { type: 'outro', anchor: 'A', text: 'That is COSMOS DESK. Thank you for watching.', cues: [] }],
  };
  const shots = shotsOf(ep, 1);
  const P = paceFor('cosmos').shots;
  const L = planSegment(ep, 1, { gapAfter: (j) => gapAfter(ep, j).gap }).ctx.duration + gapAfter(ep, 1).gap;
  assert.ok(shots.length <= Math.max(2, Math.floor(L / ((P.median[0] + P.median[1]) / 2))) + 1, `${shots.map((e) => e.shot).join(' ')}`);
  assert.ok(shots.some((e) => e.shot === 'full'), 'the picture airs');
  assert.ok(!shots.some((e) => e.shot === 'map'), 'the map gives way to the picture in a 20 s story');
  // a long story keeps both
  const long = { ...ep, segments: [ep.segments[0], story(`${WALES} ${WALES}`, { hasImage: true, location: { lat: 51.6, lon: -4.0, place: 'Wales' } }), ep.segments[2]] };
  const both = shotsOf(long, 1);
  assert.ok(both.some((e) => e.shot === 'map') && both.some((e) => e.shot === 'full'), both.map((e) => e.shot).join(' '));
});

test('planner: COSMOS never plans two cuts closer than its 4.5 s cooldown (the runtime would push the later one mid-sentence)', () => {
  const ep = fixture('cosmos');
  const cool = paceFor('cosmos').shots.cooldown;
  for (let i = 0; i < ep.segments.length; i++) {
    const shots = shotsOf(ep, i).filter((e) => e.shot !== 'montage');
    for (let k = 1; k < shots.length; k++) assert.ok(shots[k].at - shots[k - 1].at >= cool - 1e-6, `seg ${i}: ${shots[k - 1].shot}→${shots[k].shot} ${(shots[k].at - shots[k - 1].at).toFixed(2)} s`);
  }
});

test('planner: no lead-in wide before a chat that airs on a card of its own (STILL TO COME), the closing wide capped by the studio maximum', () => {
  const ep = fixture('tech-bytes');
  const i = ep.segments.findIndex((s, k) => s.type === 'story' && ep.segments[k + 1]?.type === 'chat');
  assert.ok(i > 0);
  const signpost = structuredClone(ep);
  signpost.segments[i + 1] = { ...signpost.segments[i + 1], text: 'Still to come: drones carry medicine across Rwanda.', stillToCome: [{ storyId: ep.segments[i].storyId, char: 15 }] };
  if (signpost.segments[i + 2]?.type === 'chat') signpost.segments.splice(i + 2, 1);
  assert.ok(!shotsOf(signpost, i).some((e) => e.shot === 'wide'), 'the story ends on its own shot; the signpost cuts to its frame');
  // the closing exchange: one wide up to the studio maximum (+ 0.5 s grace), a two-shot and the wide past it
  for (const name of ['tech-bytes', 'world-now', 'cosmos']) {
    const e = fixture(name);
    const o = e.segments.findIndex((s) => s.type === 'outro');
    const first = (() => {
      let f = o;
      while (f > 0 && e.segments[f - 1].type === 'chat') f--;
      return f;
    })();
    if (first === o) continue;
    const ctxs = e.segments.map((_, j) => planSegment(e, j, { gapAfter: (k) => gapAfter(e, k).gap }).ctx);
    let run = 0;
    for (let j = first; j <= o; j++) run += ctxs[j].duration + (j < o ? gapAfter(e, j).gap : paceFor(name).holds.signoff);
    const two = shotsOf(e, first).some((x) => x.framing === 'two');
    const max = paceFor(name).shots.studioMax + 0.5;
    if (run <= max) assert.equal(two, false, `${name}: a ${run.toFixed(1)} s closing run stays on the wide`);
  }
});

test('planner: a split long single alternates single ⇄ over-the-shoulder, never the same framing twice in a row', () => {
  for (const name of ['world-now', 'world-now-long', 'tech-bytes', 'cosmos', 'money-minute', 'money-minute-long', 'news-60']) {
    const ep = fixture(name);
    for (let i = 0; i < ep.segments.length; i++) {
      const shots = shotsOf(ep, i);
      for (let k = 1; k < shots.length; k++) {
        const a = shots[k - 1];
        const b = shots[k];
        assert.ok(!(a.framing && a.shot === b.shot && a.framing === b.framing && a.focus === b.focus && !b.move), `${name} seg ${i}: ${b.framing} twice at ${b.at}`);
      }
    }
  }
  // a long story's last single that capStudio and splitLongSingles both cut: single, over-the-shoulder, single
  const long = `${WALES} ${WALES} ${WALES}`;
  const ep = { id: 'tb-long', program: { id: 'tech-bytes' }, cast: { A: 'max', B: 'ada' }, segments: [{ type: 'intro', anchor: 'A', text: 'This is TECH BYTES.', cues: [] }, story(long), { type: 'outro', anchor: 'A', text: 'That is TECH BYTES.', cues: [] }] };
  const shots = shotsOf(ep, 1);
  for (let k = 1; k < shots.length; k++) assert.notEqual(`${shots[k].framing}`, `${shots[k - 1].framing}`, shots.map((e) => e.framing).join(' '));
});

test('planner: a picture or map gives way near the middle of its window, not at the first sentence start it can', () => {
  const ep = fixture('world-now-long');
  const P = paceFor('world-now').shots;
  let pictures = 0;
  let mid = 0;
  for (let i = 0; i < ep.segments.length; i++) {
    if (ep.segments[i].type !== 'story') continue;
    const shots = shotsOf(ep, i);
    const end = planSegment(ep, i, { gapAfter: (j) => gapAfter(ep, j).gap }).ctx.duration + gapAfter(ep, i).gap;
    for (let k = 0; k < shots.length; k++) {
      if (shots[k].shot !== 'full') continue;
      const len = (k + 1 < shots.length ? shots[k + 1].at : end) - shots[k].at;
      pictures++;
      assert.ok(len <= P.picture[1] + 0.25, `seg ${i}: picture ${len.toFixed(2)} s`);
      if (len >= P.picture[0] + 1) mid++;
    }
  }
  assert.ok(pictures > 0);
  assert.ok(mid / pictures >= 0.5, `${mid} of ${pictures} pictures hold toward the middle of their window`);
});

// ------------------------------------------------------------------ the analyser

test('camera analyser: cuts inside words, jump cuts, eyelines, moves that start on the cut or stop dead', () => {
  const rows = [];
  const fps = 30;
  const wide = [0, -60, 0, 1, 52];
  const single = [-30, -36, 520, 1.4, -40];
  const near = [-28, -36, 530, 1.45, -40]; // the same presenter, a hair tighter: a jump cut
  const push = (t0, t1, row) => {
    for (let f = Math.round(t0 * fps); f < Math.round(t1 * fps); f++) rows.push({ t: f / fps, ...row(f / fps) });
  };
  const voiceAt = (t) => (t >= 2 && t < 9 ? { A: [1, 0, Math.floor((t - 2) / 0.3), 0, 0.8, 0] } : {});
  push(0, 1, () => ({ shot: 'open', since: 0, base: null, cam: null, voice: {} }));
  push(1, 6.1, (t) => ({ shot: 'wide', since: 1, spec: 'wide', focus: 'A', base: wide, cam: wide, move: null, voice: voiceAt(t) }));
  push(6.1, 11, (t) => ({ shot: 'close', since: 6.1, spec: 'mcu-l', focus: 'A', base: single, cam: single, voice: voiceAt(t) })); // 6.1: inside word 13 (5.9-6.2)
  push(11, 16, (t) => ({ shot: 'close', since: 11, spec: 'single', focus: 'A', base: near, cam: near, voice: {} }));
  // a push that starts on its cut at full speed and is cut while still moving
  push(16, 21, (t) => {
    const k = 1 + 0.02 * (t - 16);
    return { shot: 'wide', since: 16, spec: 'wide', focus: 'A', base: wide, cam: [0, -60, 1000 - 1000 / k, 1, 52], move: ['push', 0.1, 0, 5], moveSince: 16, voice: {} };
  });
  push(21, 25, () => ({ shot: 'endcard', since: 21, base: null, cam: null, voice: {} }));
  const T = { camera: rows, events: [{ ev: 'playEpisode', phase: 'start', t: 0, programId: 'world-now', episodeId: 'e1', cast: { A: 'paco', B: 'lola' } }] };
  const [p] = analyseTimeline(T);
  const kinds = new Set(p.defects.map((d) => d.kind));
  for (const k of ['cut inside a word', 'jump cut', 'move starts abruptly', 'move cut before it settles']) assert.ok(kinds.has(k), `${k} found: ${[...kinds].join(', ')}`);
  assert.ok(p.defects.some((d) => d.kind === 'cut inside a word' && Math.abs(d.at - 6.1) < 0.05));
  assert.equal(p.shots, 4);
});

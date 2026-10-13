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

// IN THEIR WORDS on the v2 plan: the card holds from its sentence to the plan's next cue (else the next segment's cut)
async function quoteRun(quoteLine) {
  const clock = fakeClock();
  try {
    const lines = ['The probe reached the tail of the comet on Monday after a journey of ten years.', 'Its camera sent back the first pictures of the ice within hours of the pass.', quoteLine];
    const text = lines.join(' ');
    const seg = { type: 'story', anchor: 'A', emotion: 'neutral', storyId: 'q1', headline: 'A probe in the tail', source: 'Orbit Daily', category: 'science', hasImage: false, cues: [], text, quote: { text: quoteLine.split(': ')[1], by: 'Mira Holt' } };
    const next = { type: 'story', anchor: 'A', emotion: 'neutral', storyId: 'q2', headline: 'Next', source: 'X', category: 'science', hasImage: false, cues: [], text: 'Next story.' };
    const ep = { id: 'epQ', program: { id: 'cosmos', title: 'COSMOS DESK', theme: 'cosmos' }, cast: { A: 'paco' }, segments: [seg, next], rundown: [] };
    const shots = [];
    let at = 0;
    const cues = lines.map((l, k) => {
      const cue = { k, char: at, at: null, sentence: k, mid: false, shot: k === 1 ? 'full' : 'close', framing: k === 1 ? null : 'mcu', focus: 'A', move: null, card: null, minLen: null, beat: null };
      at += l.length + 1;
      return cue;
    });
    let handler = null;
    const audio = {
      async speak(t, slot, opts) {
        // the voice at the estimate's own pace (14.5 characters a second)
        for (const [i, l] of splitLines(t).entries()) {
          opts?.onSentence?.(l, i);
          await new Promise((r) => setTimeout(r, (l.length / 14.5) * 1000));
        }
      },
    };
    const d = director(audio);
    d.voices = { audioFor: async () => null, episode() {}, refreshAds() {}, prepareAd() {}, adLine: () => null };
    d.v2 = { episode() {}, planAt: () => null, shots: (sg, hasImg, h) => ((handler = h), cues), begin: () => ({ speak: null, sentence: (i) => cues.filter((c) => c.k > 0 && c.sentence === i).forEach((c) => handler(c)), end() {} }) };
    d.episode = ep;
    d.scene.program = ep.program;
    d.scene.cast = ep.cast;
    d.scene.anchors = {};
    d.scene.shotSince = clock.now() - 30;
    const setShot = d.setShot.bind(d);
    d.setShot = (shot, extra = {}) => {
      setShot(shot, extra);
      shots.push({ t: clock.now(), shot, quote: !!extra.card?.quote });
    };
    await clock.run(d.playStory(seg));
    return shots;
  } finally {
    clock.restore();
  }
}
const splitLines = (t) => t.split(/(?<=[.!?])\s+/);

test('director: the quote card never holds past a fact card\'s maximum (a long quote sentence keeps the plan\'s shot)', async () => {
  const factMax = paceFor('cosmos').shots.factMax;
  // a quote read as the story's last sentence, 6.6 s: the card carries it
  const short = await quoteRun('As Mira Holt put it: "We have never seen ice this old so close to the sun."');
  assert.ok(short.some((s) => s.quote), `the card airs: ${JSON.stringify(short)}`);
  // a quote sentence of ~11 s (over COSMOS's 9 s card maximum with the pause after it): the plan's own close instead
  const long = await quoteRun('As Mira Holt put it: "We have never seen ice this old so close to the sun, and every picture we get back from the tail tells us more about the first days of the solar system."');
  assert.ok(!long.some((s) => s.quote), `no quote card past ${factMax} s: ${JSON.stringify(long)}`);
  assert.equal(long.at(-1).shot, 'close', 'the plan\'s close carries the long quote');
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

test('guard: a re-staged quote\'s hand-over stays on the presenter, so a long single gives way to the wide there', () => {
  const lines = [
    [0, 'A secondhand store in Leeds opened its doors to families who cannot afford new clothes this winter.'],
    [6.0, 'The founder said the couple behind it struggled for years before the idea took off.'],
    [12.4, 'In the words of Thomas Cliffe, the founder, as reported by BBC Business:'],
  ];
  const onAir = { shot: 'close', framing: 'mcu-r', focus: 'A', held: 10.4 };
  const opts = { programId: 'money-minute', gap: 0.6, cues: [], closeFraming: 'mcu-r', wideFraming: 'wide' };
  // the hand-over (12.4-16.3 s) is the presenter's: the MCU-R would run 14.3 s, the WIDE takes the hand-over
  const restage = storyPlan(lines, { link: 'R2', linkKind: 'restage' }, { duration: 16.3 });
  restage.ctx.speaker = 'A';
  const cut = holdCut(restage, 2, onAir, opts);
  assert.ok(cut && cut.shot === 'wide' && !cut.mid, `the hand-over on the WIDE: ${JSON.stringify(cut)}`);
  // inside the maximum with the hand-over (7.0 + 4.5 s of 12): no cut, the hand-over's length is known (no margin)
  assert.equal(holdCut(restage, 2, { ...onAir, held: 7.0 }, opts), null);
  // a correspondent's hand-over goes to the two-way (director.js throwTo): the guard leaves it alone
  const cross = storyPlan(lines, { link: 'R2' }, { duration: 16.3 });
  cross.ctx.speaker = 'A';
  assert.equal(holdCut(cross, 2, onAir, opts), null);
  // a picture on air at a re-staged hand-over: the director cuts back to the presenter there, so its end is the hand-over
  assert.equal(holdCut(restage, 2, { shot: 'full', framing: null, focus: 'A', held: 5 }, opts), null);
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

test('planner: NEWS IN 60 never opens an item on the framing the last one ended on (a short located item after the round-up is no map)', () => {
  const loc = (place, lat, lon) => ({ place, lat, lon });
  const story = (id, text, extra = {}) => ({ type: 'story', anchor: 'A', storyId: id, headline: id, source: 'X', category: 'world', hasImage: true, emotion: 'neutral', cues: [], text, ...extra });
  // the live NEWS IN 60 of 13 Oct: after the two-item round-up, a one-sentence located item (no round-up item:
  // the next one is long) ended on MCU-L, and the last item was planned as if a map came before it
  const ep = {
    id: 'epN60', program: { id: 'news-60', title: 'NEWS IN 60', theme: 'flash' }, cast: { A: 'sam' }, rundown: [],
    segments: [
      { type: 'intro', anchor: 'A', text: "This is NEWS IN 60. I'm Sam Night.", cues: [] },
      story('s1', 'Six energy sites have been hit since the ceasefire was announced, the president said on Sunday. Repairs will take weeks, engineers warned, as the cold sets in across the region.', { location: loc('UKRAINE', 49, 31.4) }),
      story('s2', 'Women say they share stories of abuse to highlight the issue, despite social pressure. Campaigners say the courts are slow to act on their reports.', { location: loc('IRAQ', 33.2, 43.7) }),
      story('s3', 'Around the world. First, Qatar. The emir says his country has shown it can mediate between the two sides.', { location: loc('QATAR', 25.3, 51.2), feature: 'roundup', roundup: { index: 0, count: 2 } }),
      story('s4', 'In Paris, the iconic covered market was ravaged by fire overnight, France 24 reports.', { location: loc('PARIS, FRANCE', 48.86, 2.35), feature: 'roundup', roundup: { index: 1, count: 2 } }),
      story('s5', 'Russia said on Monday that European countries had bought $320.7 billion worth of its energy since 2022.', { location: loc('RUSSIA', 61.5, 90) }),
      story('s6', 'China has sanctioned two foreign ministers over their ties with Taiwan. The two countries are among the last twelve remaining diplomatic allies of Taiwan, according to ABC News.', { location: loc('PARAGUAY', -23.4, -58.4) }),
      { type: 'outro', anchor: 'A', text: "That's the minute. Stay with us on GLOBIT 24.", cues: [] },
    ],
  };
  const plans = ep.segments.map((s, i) => shotsOf(ep, i));
  assert.deepEqual(plans[5].map((e) => e.framing), ['mcu-l'], 'the item after the round-up opens on MCU-L');
  for (let i = 2; i < plans.length - 1; i++) {
    const end = plans[i - 1].at(-1);
    const open = plans[i][0];
    if (open.shot === 'map' && end.shot === 'map') continue; // the round-up's one map pans from pin to pin
    assert.ok(open.shot !== end.shot || open.framing !== end.framing, `item ${i} opens on ${open.shot}/${open.framing}, as item ${i - 1} ended: no visible cut`);
  }
});

test('planner: a long MONEY MINUTE intro plans WIDE → MCU-R → WIDE, the greeting on the WIDE, every shot inside the maximum', () => {
  const max = paceFor('money-minute').shots.studioMax;
  const check = (ep, label) => {
    const shots = shotsOf(ep, 0);
    const plan = planSegment(ep, 0, { gapAfter: (j) => gapAfter(ep, j).gap });
    const end = plan.ctx.duration + gapAfter(ep, 0).gap;
    assert.deepEqual(shots.map((e) => e.framing), ['wide', 'mcu-r', 'wide'], label);
    const ends = [...shots.slice(1).map((e) => e.at), end];
    shots.forEach((e, k) => {
      const len = ends[k] - e.at;
      assert.ok(len >= 4 - 1e-6 && len <= max + 1e-6, `${label}: ${e.framing} ${len.toFixed(2)} s`);
    });
    const greet = plan.ctx.sentences.find((x) => /^this is/i.test(x.text.trim()));
    assert.ok(shots[2].at <= greet.t0 + 1e-6, `${label}: the WIDE is back for the greeting`);
    return shots;
  };
  for (const name of ['money-minute', 'money-minute-long']) {
    const shots = check(fixture(name), name);
    const plan = planSegment(fixture(name), 0, { gapAfter: (j) => gapAfter(fixture(name), j).gap });
    for (const e of shots.slice(1)) assert.ok(plan.ctx.sentences.some((x) => Math.abs(x.start - e.char) <= 2), `${name}: in a sentence's pause (money-minute.md §5.8)`);
  }
  // the live intro of 13 Oct (three long headlines, 26 s): no two sentence pauses fit; one cut takes a phrase's pause,
  // the first two shots inside the guard's margin (max − 1 s: it would cut them again)
  const intro = "Americans Hall and Woodford win Nobel Prize in economics for stabilisation models. Also coming up: Swamped with 'daily avalanches' of soiled items and poor-quality fast fashion, secondhand stores are in crisis. Later: Lobbying, lawyers and a media blitz: the fight to kill the Church of England's £100m slavery compensation fund. This is MONEY MINUTE. I'm Penny Sterling.";
  const ep = { id: 'mmLive', program: { id: 'money-minute', title: 'MONEY MINUTE', theme: 'money' }, cast: { A: 'penny' }, rundown: [], segments: [{ type: 'intro', anchor: 'A', text: intro, cues: [] }, { type: 'story', anchor: 'A', storyId: 's1', headline: 'x', source: 'X', hasImage: true, cues: [], text: 'Two Americans won the Nobel Prize in economics on Monday for their work on stabilisation. The prize committee praised models that central banks still use.' }, { type: 'outro', anchor: 'A', text: "That's MONEY MINUTE.", cues: [] }] };
  const shots = check(ep, 'live intro');
  const mid = shots.slice(1).find((e) => !/[.!?]\s*$/.test(ep.segments[0].text.slice(0, e.char)));
  assert.ok(mid, `one cut in a phrase's pause: ${shots.map((e) => e.char).join(' ')}`);
  assert.match(ep.segments[0].text.slice(mid.char - 3, mid.char), /[,:;]\s*$/, 'after a comma, colon or semicolon');
  assert.ok(shots[1].at <= 12 - 1 && shots[2].at - shots[1].at <= 12 - 1, `inside the guard's margin: ${shots.map((e) => e.at).join(' ')}`);
});

test('planner: a MONEY MINUTE story never opens on the WIDE the previous story stayed on (however long it was)', () => {
  const story = (id, text, extra = {}) => ({ type: 'story', anchor: 'A', storyId: id, headline: id, source: 'X', category: 'business', hasImage: true, emotion: 'neutral', cues: [], text, ...extra });
  const ep = {
    id: 'mmWide', program: { id: 'money-minute', title: 'MONEY MINUTE', theme: 'money' }, cast: { A: 'penny' }, rundown: [],
    segments: [
      { type: 'intro', anchor: 'A', text: "Cocoa stays expensive. This is MONEY MINUTE. I'm Penny Sterling.", cues: [] },
      story('s1', 'Chocolate makers warn of higher prices as cocoa stays expensive for a third year. Retailers say shoppers are already trading down to cheaper bars.'),
      // one long sentence and a short one: no sentence start leaves both sides 4 s, so the story stays on its WIDE
      story('s2', 'Trade ministers from twelve countries met in Geneva on Tuesday to restart talks on a deal covering steel, aluminium and the cars made with them. A deal is not close.'),
      story('s3', 'Electric car sales overtook diesel in Europe for the first time last month. Carmakers credit cheaper batteries and new models at lower prices.'),
      { type: 'outro', anchor: 'A', text: "That's MONEY MINUTE.", cues: [] },
    ],
  };
  const s2 = shotsOf(ep, 2);
  assert.deepEqual(s2.map((e) => e.framing), ['wide'], 'the trade story stays on its WIDE');
  assert.ok(planSegment(ep, 2, { gapAfter: (j) => gapAfter(ep, j).gap }).ctx.duration > 8.5, 'longer than the old rule of thumb (8.5 s)');
  const s3 = shotsOf(ep, 3);
  assert.equal(s3[0].framing, 'mcu-r', `the next story opens on the MCU-R: ${s3.map((e) => e.framing).join(' ')}`);
});

test('planner: a cut inside a sentence never lands on its last word (one word before the boundary)', () => {
  let mids = 0;
  // (the live TECH BYTES story of 13 Oct: its picture was cut on "October | 8.", the speech mark fired only with the
  // next sentence and the picture held 8.9 s; the company and model names in its copy are replaced)
  const live = JSON.parse(fs.readFileSync(new URL('./fixtures/camera-polish-tb-last-word.json', import.meta.url), 'utf8'));
  for (const name of ['world-now', 'world-now-long', 'tech-bytes', 'cosmos', 'money-minute', 'money-minute-long', 'news-60', 'live']) {
    const ep = name === 'live' ? live : fixture(name);
    for (let i = 0; i < ep.segments.length; i++) {
      const plan = planSegment(ep, i, { gapAfter: (j) => gapAfter(ep, j).gap });
      const ss = plan.ctx?.sentences || [];
      const W = plan.ctx?.words || [];
      for (const e of plan.events.filter((x) => x.kind === 'shot' && x.at > 0)) {
        if (ss.some((x) => Math.abs(x.start - e.char) <= 2)) continue; // a sentence start
        const k = W.findIndex((w) => w.char === e.char);
        if (k < 0) continue;
        mids++;
        const after = W[k + 1];
        assert.ok(after && !ss.some((x) => Math.abs(x.start - after.char) <= 2), `${name} seg ${i}: a cut on the last word of its sentence (char ${e.char})`);
      }
    }
  }
  assert.ok(mids > 0, 'the fixtures plan phrase cuts');
});

test('planner: an intro\'s headline frames, then a wide over the studio maximum: the teasers on the single, the greeting on the wide', () => {
  const intro = 'Solar eclipse to be visible across northern Spain next August. Coming up: our number of the day. Later in the programme: bees use the sun as a compass even on cloudy days, scientists in Sweden say, after tracking hives across two long summers. This is COSMOS DESK. I\'m Dr Nova Reyes, with UNIT-8.';
  const story = (id, text) => ({ type: 'story', anchor: 'A', storyId: id, headline: id, source: 'X', category: 'science', hasImage: true, emotion: 'neutral', cues: [], text });
  const ep = { id: 'coIntro', program: { id: 'cosmos', title: 'COSMOS DESK', theme: 'cosmos' }, cast: { A: 'nova', B: 'unit8' }, rundown: [], segments: [{ type: 'intro', anchor: 'A', text: intro, cues: [] }, story('s1', 'A total solar eclipse will be visible across northern Spain next August. Astronomers expect clear skies over the north coast.'), story('s2', 'Bees use the sun as a compass even when clouds cover it. The study tracked hives for two summers.'), story('s3', 'A comet returns to the inner solar system this winter. It was last seen in 1950.'), { type: 'outro', anchor: 'A', text: 'That is COSMOS DESK.', cues: [] }] };
  const plan = planSegment(ep, 0, { gapAfter: (j) => gapAfter(ep, j).gap });
  const shots = plan.events.filter((e) => e.kind === 'shot');
  const end = plan.ctx.duration + gapAfter(ep, 0).gap;
  const ends = [...shots.slice(1).map((e) => e.at), end];
  assert.equal(shots[0].shot, 'montage', shots.map((e) => e.shot).join(' '));
  assert.equal(shots.at(-1).shot, 'wide', 'the greeting on the wide');
  const greet = plan.ctx.sentences.find((x) => /^this is/i.test(x.text.trim()));
  assert.ok(shots.at(-1).at <= greet.t0 + 1e-6, 'the wide is back for the greeting');
  shots.forEach((e, k) => {
    if (e.shot !== 'montage') assert.ok(ends[k] - e.at <= paceFor('cosmos').shots.studioMax + 1e-6 && ends[k] - e.at >= 4 - 1e-6, `${e.shot}/${e.framing} ${(ends[k] - e.at).toFixed(2)} s`);
  });
  assert.ok(shots.some((e) => e.shot === 'close' && e.beat === 'teaser'), 'the teasers on the reader\'s single');
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
  // an 11.7 s map: over WORLD NOW's 10 s, unless it is the round-up's opening map (its title line over the world view)
  const map = (roundup) => {
    const r = [];
    for (let f = 0; f < 30 * 15; f++) {
      const t = f / 30;
      r.push({ t, ...(t < 1 ? { shot: 'open', since: 0 } : t < 12.7 ? { shot: 'map', since: 1, spec: 'wide', focus: 'A' } : { shot: 'close', since: 12.7, spec: 'mcu-l', focus: 'A', base: single, cam: single }), voice: {} });
    }
    const ev = [{ ev: 'playEpisode', phase: 'start', t: 0, programId: 'world-now', episodeId: 'e2', cast: { A: 'paco', B: 'lola' } }, { ev: 'say', phase: 'start', t: 1, type: 'story', anchor: 'A', roundup }];
    return analyseTimeline({ camera: r, events: ev })[0].defects.filter((d) => d.kind === 'over its maximum').length;
  };
  assert.equal(map(null), 1, 'a plain map: over its maximum');
  assert.equal(map({ index: 0, count: 4 }), 0, 'the round-up\'s opening map: the title allowance');
  assert.equal(map({ index: 1, count: 4 }), 1, 'a later round-up item: no allowance');
});

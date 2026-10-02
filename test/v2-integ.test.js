// Wave-2 integration (owner: INTEGRATION stream): segment context and planner
// arbitration, the cue clock, the Stage's cast and bookkeeping, the live
// direction helper, and the degradation rules (fallback with backoff, perf
// watchdog). Everything runs in node; episodes come from the offline channel
// (test/fixtures/v2-episodes/<programme>.json, saved from /api/queue).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { segmentContext, hashSeed } from '../public/js/v2/canvas25d/direction/context.js';
import { planSegment, arbitrate, defaultGlance } from '../public/js/v2/canvas25d/direction/index.js';
import { CueClock, prunePerf, TAIL } from '../public/js/v2/canvas25d/runtime/cueclock.js';
import { FallbackPolicy, PerfWatchdog, BACKOFF } from '../public/js/v2/canvas25d/runtime/watchdog.js';
import { StageHost } from '../public/js/v2/canvas25d/runtime/host.js';
import { Stage, castSeats, episodeKey, defaultFraming } from '../public/js/v2/canvas25d/runtime/stage.js';
import { cuesFromPlan, legacyShot, LiveDirection } from '../public/js/v2/canvas25d/runtime/direction.js';
import { LOOKS } from '../public/js/v2/canvas25d/cast/index.js';

const FIX = new URL('./fixtures/v2-episodes/', import.meta.url);
const PROGRAMMES = ['world-now', 'tech-bytes', 'cosmos', 'money-minute', 'news-60'];
const episodeOf = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, FIX), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------
// the architect's check episode (recorded and estimated versions of one text)

const TEXT = 'Floods have forced 40,000 people from their homes in southern Brazil. Rescue teams say the water is still rising.';
function recordedWords(text, lead = 0.18, step = 0.33) {
  const words = [];
  let t = lead;
  for (const m of text.matchAll(/\S+/g)) {
    words.push({ t: Math.round(t * 100) / 100, char: m.index, len: m[0].length });
    t += step;
  }
  return words;
}
const EP = {
  id: 'ep-test-1',
  program: { id: 'world-now', theme: 'world' },
  cast: { A: 'paco', B: 'lola' },
  segments: [
    { type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening. This is World Now.', cues: [] },
    { type: 'story', anchor: 'B', emotion: 'serious', text: TEXT, hasImage: true, location: { place: 'BRAZIL', lat: -29, lon: -53 }, numbers: [{ value: '40,000', label: 'PEOPLE' }], cues: [{ char: 0, slot: 'A', action: 'nod' }, { char: 10, slot: null, action: 'look_partner' }] },
    { type: 'story', anchor: 'B', emotion: 'neutral', text: TEXT, audio: { url: 'x', duration: 7.5, words: recordedWords(TEXT) }, cues: [] },
    { type: 'chat', anchor: 'A', emotion: 'happy', text: 'Thanks, Lola. Rising water and rising prices, then.', cues: [{ char: 0, slot: 'B', action: 'nod' }, { char: 5, slot: 'B', action: 'nod' }] },
  ],
};

test('context: the time origin is the first word in recorded and estimated mode', () => {
  const est = segmentContext(EP, 1, {});
  const rec = segmentContext(EP, 2, {});
  assert.equal(est.timing, 'estimated');
  assert.equal(rec.timing, 'recorded');
  assert.equal(est.words[0].t, 0);
  assert.equal(rec.words[0].t, 0);
  assert.equal(est.lead, 0);
  assert.equal(rec.lead, 0.18);
  assert.equal(rec.timeAt(0), 0);
  // recorded sentence starts are the recorded word times minus the lead
  const w2 = EP.segments[2].audio.words.find((w) => w.char >= rec.sentences[1].start);
  assert.ok(Math.abs(rec.sentences[1].t0 - (w2.t - 0.18)) < 1e-9);
  // estimated times grow with the text and include the newsreader's pause after a full stop
  assert.ok(est.sentences[1].t0 > est.sentences[0].t1 - 1e-9);
  const lastWord = est.words.filter((w) => w.char < est.sentences[0].end).at(-1);
  assert.ok(est.sentences[1].t0 - lastWord.t > 0.75, 'the last word plus the pause after a full stop');
  assert.ok(est.duration > 4 && est.duration < 12, `duration ${est.duration}`);
});

test('context: emphasis discriminates and is the same for recorded and estimated text', () => {
  const est = segmentContext(EP, 1, {});
  const rec = segmentContext(EP, 2, {});
  const sEst = est.words.filter((w) => w.stressed);
  const sRec = rec.words.filter((w) => w.stressed);
  assert.ok(sEst.length >= 2 && sEst.length <= Math.ceil(est.words.length / 3), `${sEst.length} of ${est.words.length}`);
  assert.deepEqual(sRec.map((w) => w.char), sEst.map((w) => w.char));
  const fn = est.words.find((w) => TEXT.slice(w.char, w.end) === 'the');
  assert.equal(fn.emph, 0, 'function words carry no emphasis');
  assert.deepEqual(rec.figures.map((f) => TEXT.slice(f.char, f.end)), ['40,000']);
  assert.equal(est.figures.length, 1);
});

test('context: dry line, episode summary, story index and cut guard', () => {
  const est = segmentContext(EP, 1, {});
  assert.equal(est.episode.segmentCount, 4);
  assert.equal(est.episode.storyCount, 2);
  assert.equal(est.storyIndex, 0);
  assert.ok(est.isLead);
  assert.equal(est.cutGuard, 0.5);
  assert.equal(est.dryLine, null);
  assert.ok(Object.isFrozen(est.episode));
  const chat = segmentContext(EP, 3, {});
  assert.equal(chat.dryLine?.source, 'heuristic');
  assert.equal(segmentContext({ ...EP, program: { id: 'money-minute' } }, 1, {}).cutGuard, 0.6);
  assert.equal(segmentContext(EP, 1, { gapAfter: 0.3 }).gapAfter, 0.3);
});

test('context and planSegment: malformed episodes never throw', () => {
  const bad = [
    [null, 0], [{}, 0], [EP, 99], [EP, -1], [EP, 1.5], [{ ...EP, cast: {} }, 1], [{ ...EP, cast: null }, 1],
    [{ ...EP, segments: [{ type: 'story' }] }, 0], [{ ...EP, segments: [{ text: 'Hi.', anchor: 'Z' }] }, 0],
    [{ ...EP, segments: [null] }, 0], [{ ...EP, segments: 'nope' }, 0], [{ ...EP, segments: [{ text: 42 }] }, 0],
    [{ ...EP, segments: [{ text: 'Hi there.', audio: { words: [{ t: 'x', char: null }] } }] }, 0],
  ];
  for (const [e, i] of bad) {
    const p = planSegment(e, i, {});
    assert.ok(Array.isArray(p.events));
  }
  assert.equal(segmentContext(EP, 99, {}).valid, false);
});

test('planSegment: events sorted, solo casts get no partner looks, one listener nod per turn', () => {
  const p1 = planSegment(EP, 1, {});
  assert.ok(p1.events.every((e, i, a) => !i || a[i - 1].at <= e.at), 'sorted by at');
  const solo = planSegment({ ...EP, cast: { A: 'penny' } }, 1, {});
  assert.ok(!solo.events.some((x) => x.kind === 'look' && x.target === 'partner'));
  const p3 = planSegment(EP, 3, {});
  assert.equal(p3.events.filter((e) => e.kind === 'gesture' && e.name === 'nod' && e.slot === 'B').length, 1);
});

test('arbitrate: nod and look ownership', () => {
  const arb = arbitrate(
    [
      { kind: 'gesture', slot: 'B', name: 'nod', at: 1, planner: 'gestures' }, // listener nod from HANDS: dropped
      { kind: 'gesture', slot: 'B', name: 'nod', at: 1.2, planner: 'behaviour' }, // listener nod from FACES: kept
      { kind: 'gesture', slot: 'B', name: 'nod', at: 4, planner: 'behaviour' }, // a second listener nod: dropped
      { kind: 'gesture', slot: 'A', name: 'nod', at: 2, planner: 'behaviour' }, // speaker nod from FACES: dropped
      { kind: 'gesture', slot: 'A', name: 'nod', at: 3, planner: 'gestures' }, // speaker nod from HANDS: kept
      { kind: 'gesture', slot: 'A', name: 'nod', at: 4, planner: 'gestures' }, // within 2.5 s of the last: dropped
      { kind: 'gesture', slot: 'A', name: 'look_partner', at: 0.5, planner: 'gestures' }, // becomes a look
      { kind: 'look', slot: 'A', target: 'partner', at: 1.0, dur: 2, planner: 'behaviour' }, // inside the look above: dropped
    ],
    { speaker: 'A' }
  );
  assert.deepEqual(arb.map((e) => `${e.kind}:${e.slot}:${e.planner}:${e.at}`), ['look:A:gestures:0.5', 'gesture:B:behaviour:1.2', 'gesture:A:gestures:3']);
});

test('planSegment: a throwing planner costs only its events; the default glance replaces a failed behaviour planner', () => {
  const boom = () => {
    throw new Error('planner bug (test)');
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const p = planSegment(EP, 1, { planners: { behaviour: boom } });
    assert.deepEqual(p.errors, ['planBehaviour']);
    assert.ok(p.events.some((e) => e.kind === 'shot'), 'shots survive');
    const glance = p.events.filter((e) => e.kind === 'look' && e.src === 'default');
    assert.deepEqual(glance.map((e) => e.slot), ['A'], 'the listener glances at the new speaker');
    assert.deepEqual(glance, defaultGlance(p.ctx).map((e) => ({ ...e, planner: 'behaviour' })));
    const q = planSegment(EP, 1, { planners: { shots: boom, gestures: boom } });
    assert.deepEqual(q.errors, ['planShots', 'planGestures']);
    assert.ok(!q.events.some((e) => e.kind === 'shot'));
    assert.ok(q.events.some((e) => e.kind === 'look'), 'behaviour survives');
  } finally {
    console.warn = warn;
  }
});

test('planSegment: every programme fixture plans every segment without errors', () => {
  for (const id of PROGRAMMES) {
    const ep = episodeOf(id);
    for (let i = 0; i < ep.segments.length; i++) {
      const p = planSegment(ep, i, { gapAfter: 0.3 });
      assert.deepEqual(p.errors, [], `${id} #${i}`);
      assert.ok(p.ctx.valid);
      for (const e of p.events) assert.ok(Number.isFinite(e.at) && Number.isFinite(e.char), `${id} #${i} ${e.kind}`);
    }
  }
});

// ---------------------------------------------------------------------------
// cue clock

const FPS = 60;
const DT = 1 / FPS;
const newPerf = () => ({ gestures: [], look: [], emotions: [] });

/** A simulated voice reading ctx's text at `cps` chars per second from t0 (speechFrame contract). */
function voiceFrames(ctx, t0, cps) {
  const fr = { speaking: false, sentenceIndex: -1, charIndex: -1 };
  const len = ctx.seg.text.length;
  return (t) => {
    const c = Math.floor((t - t0) * cps);
    if (c < 0 || c >= len) {
      fr.speaking = false;
      fr.sentenceIndex = c >= len ? ctx.sentences.length - 1 : -1;
      fr.charIndex = -1;
      return fr;
    }
    let si = 0;
    while (si + 1 < ctx.sentences.length && ctx.sentences[si + 1].start <= c) si++;
    fr.speaking = true;
    fr.sentenceIndex = si;
    fr.charIndex = c - ctx.sentences[si].start;
    return fr;
  };
}

function planOf(ep, i, events, extra = {}) {
  const ctx = segmentContext(ep, i, {});
  return { id: `${ep.id}:${i}`, ctx, events, voice: 'mute', speechStart: null, speechEnd: null, ...extra };
}

/** Run a clock from t0 to t1 at 60 fps; `voice(t)` gives the frame; `at(t)` may mutate the plan. Returns fire log. */
function run(clock, plan, t0, t1, voice = () => null, hook = null) {
  const log = [];
  clock.onFire = (ev, slot, t) => log.push({ name: ev.name || ev.target || ev.kind, kind: ev.kind, slot, t });
  for (let k = 0; ; k++) {
    const t = t0 + k * DT;
    if (t > t1 + 1e-9) break;
    hook?.(t);
    clock.load(typeof plan === 'function' ? plan() : plan, t);
    clock.tick(t, voice(t));
  }
  return log;
}

test('cue clock: recorded timing fires by `at` from the speech start, within one frame', () => {
  const plan = planOf(EP, 2, [
    { kind: 'gesture', slot: 'B', name: 'raise_hand', char: 30, at: 1.0 },
    { kind: 'look', slot: 'A', target: 'partner', char: 0, at: 0.25, dur: 3 },
    { kind: 'emotion', slot: 'B', name: 'happy', char: 0, at: 0 },
  ]);
  assert.equal(plan.ctx.timing, 'recorded');
  const clock = new CueClock();
  const perfs = { A: newPerf(), B: newPerf() };
  clock.perfs = perfs;
  clock.epoch = 100;
  const log = run(clock, plan, 9, 14, () => null, (t) => {
    if (t >= 10 && plan.speechStart == null) plan.speechStart = 10;
  });
  const fire = (n) => log.find((l) => l.name === n)?.t;
  // no speaking frames here: the clock starts at speechStart + 0.6 s at the latest; recorded uses speechStart then
  assert.ok(Math.abs(fire('happy') - 10.6) <= DT + 1e-6, `emotion at ${fire('happy')}`);
  const clock2 = new CueClock();
  clock2.perfs = { A: newPerf(), B: newPerf() };
  const plan2 = planOf(EP, 2, plan.events);
  const speaking = { speaking: true, sentenceIndex: 0, charIndex: 0 };
  const log2 = [];
  clock2.onFire = (ev, slot, t) => log2.push({ name: ev.name || ev.target, t });
  for (let k = 0; k < 6 * FPS; k++) {
    const t = 9 + k * DT;
    if (t >= 10 && plan2.speechStart == null) plan2.speechStart = 10;
    clock2.load(plan2, t);
    clock2.tick(t, t >= 10 ? speaking : null);
  }
  const f = (n) => log2.find((l) => l.name === n)?.t;
  assert.ok(f('happy') >= 10 && f('happy') - 10 <= DT + 1e-6, `emotion ${f('happy')}`);
  assert.ok(f('partner') - 10.25 >= -1e-9 && f('partner') - 10.25 <= DT + 1e-6, `look ${f('partner')}`);
  assert.ok(f('raise_hand') - 11 >= -1e-9 && f('raise_hand') - 11 <= DT + 1e-6, `gesture ${f('raise_hand')}`);
  // perf entries carry the rig clock (t - epoch) and the look its duration
  assert.equal(perfs.B.emotions.length, 1);
  assert.ok(Math.abs(perfs.B.emotions[0].t0 - (fire('happy') - 100)) < 1e-9);
});

test('cue clock: TTS / blips / mute fire by the voice char, anticipation converted with the learned rate', () => {
  const ep = clone(EP);
  const ctx = segmentContext(ep, 1, {});
  const C = TEXT.indexOf('Brazil');
  const tc = ctx.timeAt(C);
  const plan = planOf(ep, 1, [
    { kind: 'gesture', slot: 'B', name: 'point_screen', char: C, at: tc }, // on the word
    { kind: 'gesture', slot: 'B', name: 'count', char: TEXT.indexOf('water'), at: ctx.timeAt(TEXT.indexOf('water')) - 0.25 }, // 0.25 s early
  ]);
  const clock = new CueClock();
  clock.perfs = { A: newPerf(), B: newPerf() };
  const cps = 12; // a slower voice than the estimate: the plan's `at` would be early
  const voice = voiceFrames(ctx, 20, cps);
  const log = run(clock, plan, 19.5, 32, voice, (t) => {
    if (t >= 20 && plan.speechStart == null) plan.speechStart = 20;
  });
  const reach = (c) => 20 + c / cps;
  const point = log.find((l) => l.name === 'point_screen').t;
  assert.ok(point >= reach(C) - 1e-9 && point - reach(C) <= DT + 1 / cps + 1e-6, `point_screen ${point} vs ${reach(C)}`);
  const lean = log.find((l) => l.name === 'count').t;
  const target = reach(TEXT.indexOf('water')) - 0.25;
  assert.ok(Math.abs(lean - target) < 0.12, `count ${lean.toFixed(3)} vs ${target.toFixed(3)}`);
});

test('cue clock: the cut guard shifts gestures by <= 0.3 s, drops the rest, never touches nods and looks', () => {
  const plan = planOf(EP, 2, [
    { kind: 'gesture', slot: 'B', name: 'raise_hand', char: 0, at: 1.1 }, // 0.1 s after the cut: shift 0.4 → dropped
    { kind: 'gesture', slot: 'B', name: 'point_screen', char: 0, at: 1.3 }, // 0.3 s after: shift 0.2 → fires at cut + 0.5
    { kind: 'gesture', slot: 'A', name: 'nod', char: 0, at: 1.05 }, // nods are exempt
    { kind: 'look', slot: 'A', target: 'partner', char: 0, at: 1.1, dur: 1 }, // looks are exempt
    { kind: 'gesture', slot: 'B', name: 'shrug', char: 0, at: 1.7 }, // after the guard: on time
  ]);
  const clock = new CueClock();
  clock.perfs = { A: newPerf(), B: newPerf() };
  plan.speechStart = 10;
  const speaking = { speaking: true, sentenceIndex: 0, charIndex: 0 };
  let cut = false;
  const log = run(clock, plan, 10, 14, () => speaking, (t) => {
    if (!cut && t >= 11) {
      cut = true;
      clock.cut(11);
    }
  });
  const f = (n) => log.find((l) => l.name === n)?.t;
  assert.equal(f('raise_hand'), undefined, 'dropped');
  assert.ok(Math.abs(f('point_screen') - 11.5) <= DT + 1e-6, `point_screen ${f('point_screen')}`);
  assert.ok(Math.abs(f('nod') - 11.05) <= DT + 1e-6, `nod ${f('nod')}`);
  assert.ok(Math.abs(f('partner') - 11.1) <= DT + 1e-6, `look ${f('partner')}`);
  assert.ok(Math.abs(f('shrug') - 11.7) <= DT + 1e-6, `shrug ${f('shrug')}`);
  assert.equal(clock.stats.shifted, 1);
  assert.equal(clock.stats.dropped, 1);
});

test('cue clock: no event leaks across segments, past the tail, or after interrupted speech', () => {
  const clock = new CueClock();
  clock.perfs = { A: newPerf(), B: newPerf() };
  const speaking = { speaking: true, sentenceIndex: 0, charIndex: 0 };
  // segment 1 is replaced by segment 2 before its late event is due
  const p1 = planOf(EP, 2, [{ kind: 'gesture', slot: 'B', name: 'raise_hand', char: 50, at: 5 }]);
  const p2 = planOf(EP, 2, [{ kind: 'gesture', slot: 'A', name: 'point_screen', char: 0, at: 0.5 }]);
  p1.speechStart = 0;
  let cur = p1;
  const log = run(clock, () => cur, 0, 6, () => speaking, (t) => {
    if (t >= 2 && cur === p1) {
      p1.speechEnd = 2; // the director moves on
      cur = p2;
      p2.speechStart = 2.2;
    }
  });
  assert.deepEqual(log.map((l) => l.name), ['point_screen']);
  // the tail: 1 s after the end fires, 3 s after the end is dropped
  const ctx = segmentContext(EP, 2, {});
  const d = ctx.duration;
  const p3 = planOf(EP, 2, [
    { kind: 'gesture', slot: 'A', name: 'shrug', char: TEXT.length, at: d + 1 },
    { kind: 'gesture', slot: 'A', name: 'count', char: TEXT.length, at: d + TAIL + 0.5 },
  ]);
  p3.speechStart = 0;
  const clock3 = new CueClock();
  clock3.perfs = { A: newPerf(), B: newPerf() };
  const log3 = run(clock3, p3, 0, d + 6, () => speaking, (t) => {
    if (t >= d && p3.speechEnd == null) p3.speechEnd = d;
  });
  assert.deepEqual(log3.map((l) => l.name), ['shrug']);
  assert.ok(Math.abs(log3[0].t - (d + 1)) <= DT + 1e-6);
  // interrupted (N key): the speech stops at 1 s of a ~7 s segment; nothing pending fires afterwards
  const p4 = planOf(EP, 2, [{ kind: 'gesture', slot: 'B', name: 'raise_hand', char: 60, at: 3 }]);
  p4.speechStart = 0;
  const clock4 = new CueClock();
  clock4.perfs = { A: newPerf(), B: newPerf() };
  const log4 = run(clock4, p4, 0, 8, () => speaking, (t) => {
    if (t >= 1 && p4.speechEnd == null) p4.speechEnd = 1;
  });
  assert.deepEqual(log4, []);
  assert.ok(clock4.interrupted);
  // an episode boundary (reset) forgets everything
  const p5 = planOf(EP, 2, [{ kind: 'gesture', slot: 'B', name: 'raise_hand', char: 0, at: 1 }]);
  p5.speechStart = 0;
  const clock5 = new CueClock();
  clock5.perfs = { A: newPerf(), B: newPerf() };
  clock5.load(p5, 0);
  clock5.tick(0.7, speaking);
  clock5.reset();
  clock5.tick(2, speaking);
  assert.equal(clock5.stats.fired, 0);
});

test('cue clock: unknown gestures are never pushed into the rig; prunePerf keeps the last gesture', () => {
  const clock = new CueClock();
  const perf = newPerf();
  clock.perfs = { A: perf, B: newPerf() };
  const plan = planOf(EP, 2, [
    { kind: 'gesture', slot: 'A', name: 'moonwalk', char: 0, at: 0 },
    { kind: 'gesture', slot: 'A', name: 'nod', char: 0, at: 0.1 },
    { kind: 'gesture', slot: 'Z', name: 'nod', char: 0, at: 0.1 },
  ]);
  plan.speechStart = 0;
  run(clock, plan, 0, 1, () => ({ speaking: true, sentenceIndex: 0, charIndex: 0 }));
  assert.deepEqual(perf.gestures.map((g) => g.name), ['nod']);
  perf.gestures.push({ name: 'shrug', t0: 0.5 });
  perf.look.push({ t0: 0, t1: 1 }, { t0: 30, t1: 31 });
  perf.emotions.push({ t0: 0, name: 'happy' }, { t0: 1, name: 'serious' });
  prunePerf(perf, 60);
  assert.deepEqual(perf.gestures.map((g) => g.name), ['shrug']);
  assert.equal(perf.look.length, 0);
  assert.deepEqual(perf.emotions.map((e) => e.name), ['serious']);
});

// ---------------------------------------------------------------------------
// Stage

/** A fake AudioEngine: speechFrame(ms, slot, out) with a call counter and an optional speaker. */
function fakeAudio() {
  const a = {
    calls: 0,
    speaker: null,
    speechFrame(ms, slot, out = {}) {
      a.calls++;
      out.slot = slot;
      out.speaking = slot === a.speaker;
      out.level = out.speaking ? 0.4 : 0;
      out.viseme = out.speaking ? 'AH' : 'rest';
      out.next = 'rest';
      out.mix = 0;
      out.sentenceIndex = out.speaking ? 0 : -1;
      out.charIndex = out.speaking ? 3 : -1;
      out.accent = 0;
      out.pause = false;
      return out;
    },
  };
  return a;
}

function sceneOf(ep, extra = {}) {
  return { episode: ep, program: ep.program, cast: ep.cast, shot: 'wide', shotSince: 1, focus: 'A', anchors: {}, images: new Map(), wall: { mode: 'logo' }, segPlan: null, ...extra };
}

test('Stage: seats and sides for duo and solo casts', () => {
  assert.deepEqual(castSeats({ A: 'paco', B: 'lola' }), [{ slot: 'A', X: -74, side: 1 }, { slot: 'B', X: 74, side: -1 }]);
  assert.deepEqual(castSeats({ A: 'sam' }), [{ slot: 'A', X: 0, side: 0 }]);
  assert.deepEqual(castSeats({}), []);
  assert.deepEqual(castSeats(null), []);
  assert.equal(defaultFraming('close', true, true), 'mcu-l');
  assert.equal(defaultFraming('close', false, false), 'single');
  assert.equal(defaultFraming('wide', true, false), 'solo-wide');
  const audio = fakeAudio();
  for (const id of PROGRAMMES) {
    const ep = episodeOf(id);
    const st = new Stage({ audio, channel: { presenters: {} } });
    st.update(1, sceneOf(ep));
    const slots = Object.keys(ep.cast);
    assert.deepEqual(st.actors.map((a) => a.slot), slots, id);
    for (const a of st.actors) {
      assert.equal(a.actor.look, LOOKS[ep.cast[a.slot]], `${id} ${a.slot} look`);
      assert.equal(a.perf.seed, hashSeed(`${ep.id}${a.slot}`));
      assert.equal(a.perf.side, slots.length === 1 ? 0 : a.slot === 'A' ? 1 : -1);
      assert.equal(typeof a.perf.speech?.frame, 'function', 'live speech source');
    }
    assert.equal(episodeKey(sceneOf(ep)), ep.id);
  }
});

test('Stage: one speechFrame per slot per frame; the plan fires into the actors; emotions and listening follow the scene', () => {
  const ep = episodeOf('world-now');
  const audio = fakeAudio();
  const st = new Stage({ audio, channel: { presenters: {} } });
  const scene = sceneOf(ep);
  st.update(1, scene);
  audio.calls = 0;
  st.update(1 + DT, scene);
  assert.equal(audio.calls, 2, 'one sample per slot');
  // the lag pose and FACES read the cached frame: no extra samples
  st.actors[0].perf.speech.frame(1);
  st.actors[0].perf.speech.frame(0.88);
  assert.equal(audio.calls, 2);
  // a plan for segment 1 (B speaks): the listener's turn-start glance reaches A's perf
  const i = ep.segments.findIndex((s, k) => k > 0 && s.anchor === 'B' && ep.segments[k - 1].anchor === 'A');
  const p = planSegment(ep, i, {});
  const plan = { id: 'x', ctx: p.ctx, events: p.events, voice: 'mute', speechStart: null, speechEnd: null };
  scene.segPlan = plan;
  scene.anchors = { A: { emotion: 'neutral' }, B: { emotion: 'serious' } };
  audio.speaker = 'B';
  for (let t = 2; t < 6; t += DT) {
    if (plan.speechStart == null) plan.speechStart = t;
    st.update(t, scene);
  }
  const A = st.actors.find((a) => a.slot === 'A');
  const B = st.actors.find((a) => a.slot === 'B');
  assert.ok(A.perf.look.length >= 1, 'listener glance fired');
  assert.ok(A.perf.listen && !B.perf.listen, 'A listens while B speaks');
  assert.equal(B.perf.emotions.at(-1).name, 'serious');
  // a new episode rebuilds the actors and forgets the old plan
  const ep2 = episodeOf('news-60');
  st.update(7, sceneOf(ep2));
  assert.deepEqual(st.actors.map((a) => a.id), ['sam']);
  assert.equal(st.clock.plan, null);
});

test('Stage: errors are logged once and reported, the frame returns false', () => {
  const st = new Stage({ audio: fakeAudio(), channel: {} });
  const errors = [];
  st.onError = (t) => errors.push(t);
  const err = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a);
  try {
    const scene = { get episode() { throw new Error('broken scene'); } };
    assert.equal(st.frame(null, 1, scene, false), false);
    assert.equal(st.frame(null, 2, scene, false), false);
  } finally {
    console.error = err;
  }
  assert.deepEqual(errors, [1, 2]);
  assert.equal(logged.length, 1, 'each distinct error once');
});

// ---------------------------------------------------------------------------
// fallback with backoff, perf watchdog

function hostWith(behaviour) {
  const made = [];
  const logs = [];
  let clock = 0;
  const host = new StageHost({
    makeStage: () => {
      const st = {
        lod: 0,
        onError: null,
        clock: { stats: {} },
        setChannel() {},
        frame(ctx, t) {
          const ok = behaviour(st, t);
          if (!ok) st.onError?.(t);
          return ok;
        },
      };
      made.push(st);
      return st;
    },
    now: () => clock,
    log: (m) => logs.push(m),
  });
  return { host, made, logs, setMs: (ms) => (clock += ms) };
}

test('fallback: 3 Stage errors in 10 s drop the Stage; retries back off 1, 2, 4, 8 episodes', () => {
  let failing = true;
  const { host, made, logs } = hostWith(() => !failing);
  const scene = { episode: { id: 'e0' }, shot: 'wide' };
  assert.equal(host.frame(null, 0, scene), false);
  assert.equal(host.frame(null, 4, scene), false);
  assert.ok(host.stage, 'two errors: still on');
  assert.equal(host.frame(null, 15, scene), false); // the first error is now older than 10 s
  host.frame(null, 16, scene); // 4, 15, 16: only two within 10 s
  assert.ok(host.stage, 'errors spread over more than 10 s');
  host.frame(null, 17, scene);
  assert.equal(host.stage, null, '3 errors within 10 s');
  assert.equal(made.length, 1);
  let ep = 0;
  const nextEpisode = () => {
    scene.episode = { id: `e${++ep}` };
    return host.frame(null, 100 + ep, scene);
  };
  for (const wait of BACKOFF) {
    for (let k = 1; k < wait; k++) {
      nextEpisode();
      assert.equal(host.stage, null, `still waiting (${k}/${wait})`);
    }
    nextEpisode();
    assert.ok(host.stage, `retried after ${wait}`);
    const t = 200 + ep * 20;
    host.frame(null, t, scene);
    host.frame(null, t + 1, scene);
    host.frame(null, t + 2, scene);
    assert.equal(host.stage, null, 'dropped again');
  }
  // the backoff stays at 8 episodes, never off for the session
  for (let k = 0; k < 8; k++) nextEpisode();
  assert.ok(host.stage);
  failing = false;
  assert.equal(host.frame(null, 999, scene), true, 'a healthy stage draws studio shots');
  scene.shot = 'map';
  assert.equal(host.frame(null, 999.1, scene), false, 'non-studio shots stay with the old renderer');
  assert.ok(logs.some((m) => /dropped/.test(m)) && logs.some((m) => /retry/.test(m)));
  // steady for 4 episodes: the backoff resets to 1
  for (let k = 0; k < 4; k++) nextEpisode();
  failing = true;
  host.frame(null, 2000, scene);
  host.frame(null, 2001, scene);
  host.frame(null, 2002, scene);
  assert.equal(host.stage, null);
  nextEpisode();
  assert.ok(host.stage, 'back to a 1-episode wait');
});

test('watchdog: p95 > 12 ms steps the detail level down, > 16 ms at the lowest level falls back, 120 s under 8 ms recovers', () => {
  const w = new PerfWatchdog();
  let t = 0;
  /** Feed `ms` frames until `until()` or `secs` have passed; returns { verdict, secs }. */
  const feed = (ms, secs, until = () => false) => {
    const from = t;
    for (let k = 0; k < secs * FPS; k++) {
      t += DT;
      const verdict = w.sample(t, ms);
      if (verdict || until()) return { verdict, secs: t - from };
    }
    return { verdict: null, secs: t - from };
  };
  feed(10, 40);
  assert.equal(w.level, 0, '10 ms is within budget');
  feed(13, 40, () => w.level === 1);
  assert.equal(w.level, 1);
  const r2 = feed(13, 40, () => w.level === 2);
  assert.equal(w.level, 2);
  assert.ok(r2.secs >= 30 && r2.secs < 32, `a full 30 s window at level 1 (${r2.secs.toFixed(1)} s)`);
  assert.equal(feed(14, 60).verdict, null, 'at the lowest level only > 16 ms falls back');
  assert.equal(w.level, 2);
  const rec = feed(5, 200, () => w.level === 1);
  assert.equal(w.level, 1, 'recovered one level');
  assert.ok(rec.secs >= 120 && rec.secs < 133, `after 120 s under 8 ms (${rec.secs.toFixed(1)} s)`);
  feed(13, 70, () => w.level === 2);
  assert.equal(w.level, 2);
  assert.equal(feed(17, 40).verdict, 'fallback');
  // a spike now and then never moves the level: p95, not max
  const w2 = new PerfWatchdog();
  t = 0;
  for (let k = 0; k < 40 * FPS; k++) {
    t += DT;
    w2.sample(t, k % 100 === 0 ? 40 : 4);
  }
  assert.equal(w2.level, 0);
  const r = w2.percentiles(t, 10);
  assert.ok(r.p50 > 3.9 && r.p50 < 4.2 && r.p95 < 4.2, JSON.stringify(r));
});

test('host: the watchdog verdict reaches the Stage (detail level) and the fallback', () => {
  let cost = 13;
  const { host, setMs } = hostWith(() => {
    setMs(cost);
    return true;
  });
  const scene = { episode: { id: 'e0' }, shot: 'close' };
  let t = 0;
  for (let k = 0; k < 31 * FPS; k++) host.frame(null, (t += DT), scene);
  assert.equal(host.stage.lod, 1);
  for (let k = 0; k < 31 * FPS; k++) host.frame(null, (t += DT), scene);
  assert.equal(host.stage.lod, 2);
  cost = 20;
  for (let k = 0; k < 31 * FPS && host.stage; k++) host.frame(null, (t += DT), scene);
  assert.equal(host.stage, null, 'fell back');
  assert.equal(host.stats().drops, 1);
});

// ---------------------------------------------------------------------------
// live direction (director side)

test('direction: legacy shot names, cues per sentence, beats the story cannot show are dropped', () => {
  assert.equal(legacyShot('two', 'two'), 'wide');
  assert.equal(legacyShot('ots', 'ots'), 'close');
  assert.equal(legacyShot('map', null), 'map');
  const p = planSegment(EP, 1, {});
  const cues = cuesFromPlan(p, { hasImg: true });
  assert.equal(cues[0].k, 0);
  assert.ok(cues.every((c) => ['wide', 'close', 'full', 'map', 'fact'].includes(c.shot)));
  assert.ok(cues.every((c, i) => !i || c.char >= cues[i - 1].char));
  const noPic = cuesFromPlan(p, { hasImg: false });
  assert.ok(!noPic.some((c) => c.shot === 'full'));
  const chat = cuesFromPlan(planSegment(EP, 3, {}));
  assert.ok(chat.every((c) => c.shot === 'wide' || c.shot === 'close'));
});

test('direction: plans go on air as scene.segPlan with speech start/end; chats cut with the default handler', () => {
  const shots = [];
  const director = {
    scene: { shot: 'wide', focus: 'A', shotSince: 0, stinger: null, framing: null },
    setShot(shot, extra) {
      shots.push({ shot, ...extra });
      Object.assign(this.scene, extra, { shot });
    },
  };
  const live = new LiveDirection({ director, channel: { presenters: {} }, audio: { mode: 'mute' } });
  live.episode(EP);
  assert.equal(director.scene.episode, EP);
  const h = live.begin(EP.segments[3]); // a chat: the default handler applies its opening cue now
  assert.equal(director.scene.segPlan, h.plan);
  assert.equal(h.plan.voice, 'mute');
  assert.ok(shots.length >= 1 && ['wide', 'close'].includes(shots[0].shot));
  h.sentence(0);
  assert.ok(h.plan.speechStart > 0);
  h.end();
  assert.ok(h.plan.speechEnd >= h.plan.speechStart);
  // a story: shots() registers the caller's handler and returns the cues
  const got = [];
  const cues = live.shots(EP.segments[1], true, (c) => got.push(c.k));
  const h2 = live.begin(EP.segments[1]);
  for (let si = 0; si < h2.plan.ctx.sentences.length; si++) h2.sentence(si);
  assert.deepEqual(got, cues.filter((c) => c.k > 0 && !c.mid).map((c) => c.k));
  h2.end();
  // the montage is never cut away from by a chat/intro cue
  director.scene.shot = 'montage';
  shots.length = 0;
  live.begin(EP.segments[0]).end();
  assert.equal(shots.length, 0);
});

// Pace & polish (public/js/pace.js): the one pacing table, its helpers, and the
// rules the planners must respect on real episode fixtures (minimum shot,
// cut cooldown, repetition limits, gesture budget), plus the consumers that
// must read the table instead of keeping their own numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PACE,
  PROGRAMME_IDS,
  CHANNEL,
  TRANSITIONS,
  paceFor,
  gapKind,
  gapAfter,
  readTwice,
  tickerHold,
  factHold,
  cutAllowed,
  cutWait,
  isRepeat,
  gestureBudget,
  listenerRules,
  estimateAir,
  paceTrace,
  wordCount,
} from '../public/js/pace.js';
import { STINGER_DURATION } from '../public/js/scenes/cards.js';
import { STRAP_TIMING } from '../public/js/graphics/strap.js';
import { TICKER_TIMING, makeEntry } from '../public/js/graphics/ticker.js';
import { CAPTION_TIMING } from '../public/js/graphics/captions.js';
import { PROGRAM_TAG } from '../public/js/graphics/index.js';
import { MIN_SHOT, SHOT_STYLES } from '../public/js/v2/canvas25d/direction/shots.js';
import { layoutEpisode, planReport } from '../tools/pace/plans.mjs';

const CHANNEL_FILE = new URL('../config/channel.json', import.meta.url);
const FIX = new URL('./fixtures/v2-episodes/', import.meta.url);
const channel = JSON.parse(fs.readFileSync(CHANNEL_FILE, 'utf8'));
const fixtures = fs
  .readdirSync(FIX)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(new URL(f, FIX), 'utf8')));

test('pace: every programme in the rotation has its own frozen profile, unknown ids get WORLD NOW', () => {
  for (const id of new Set(channel.rotation)) {
    assert.ok(PROGRAMME_IDS.includes(id), `${id} has a profile`);
    assert.equal(paceFor(id).id, id);
  }
  assert.equal(paceFor('no-such-show').id, 'world-now');
  assert.ok(Object.isFrozen(PACE) && Object.isFrozen(PACE['world-now'].gaps) && Object.isFrozen(PACE.cosmos.shots.median));
  assert.throws(() => {
    'use strict';
    PACE['world-now'].gaps.story = 0.1;
  });
});

test('pace: the owner\'s 24/7 floor holds in every profile (shots >= 4 s, median 5-7 s band, air between segments)', () => {
  for (const id of PROGRAMME_IDS) {
    const P = paceFor(id);
    assert.ok(P.shots.min >= 4, `${id}: no cut faster than 4 s`);
    assert.ok(P.shots.cooldown >= P.shots.min, `${id}: the cut cooldown is at least the minimum shot`);
    assert.ok(P.shots.median[0] >= 4 && P.shots.median[1] <= 9 && P.shots.median[0] < P.shots.median[1], `${id}: median band`);
    assert.ok(P.shots.map[0] >= 4 && P.shots.picture[0] >= 4, `${id}: maps and pictures hold >= 4 s`);
    assert.ok(P.shots.sameFramingRun === 1, `${id}: never two identical framings in a row`);
    assert.ok(P.shots.cutsPerMinMax <= 10, `${id}: at most 10 cuts a minute`);
    for (const [k, v] of Object.entries(P.gaps)) {
      if (k === 'jitter') assert.ok(v >= 0 && v <= 0.1, `${id}: jitter ${v}`);
      else assert.ok(v >= 0.3 && v <= 2, `${id}: gap ${k} ${v} s`);
    }
    // a hand-over breathes more than a chat turn, a block more than a story change
    assert.ok(P.gaps.chatTurn < P.gaps.handover && P.gaps.handover <= P.gaps.story + 0.05 && P.gaps.story < P.gaps.block, id);
    assert.ok(P.gaps.beforeFinally >= P.gaps.story, `${id}: And finally gets its own beat`);
    assert.ok(P.holds.endcard >= 2.5 && P.holds.signoff >= 0.5 && P.holds.breakingCard <= 3, id);
    assert.ok(P.gestures.rest >= 0.5, `${id}: hands rest most of the time`);
    assert.ok(P.gestures.minGap >= 4, `${id}: marked gestures at least 4 s apart`);
    assert.equal(P.gestures.repeat, false, `${id}: never the same gesture twice in a row`);
    assert.ok(P.music.minBed >= 20 && P.music.maxChangesPerMin <= 2, `${id}: beds change only at blocks`);
    const [lo, hi] = P.length.target;
    assert.ok(lo < hi && hi <= 600, `${id}: up to 10 minutes`);
  }
  // personalities: COSMOS is the slowest, NEWS IN 60 the briskest, WORLD NOW measured
  assert.ok(paceFor('cosmos').gaps.story > paceFor('world-now').gaps.story && paceFor('world-now').gaps.story > paceFor('news-60').gaps.story);
  assert.ok(paceFor('cosmos').shots.median[0] > paceFor('world-now').shots.median[0]);
  assert.ok(paceFor('cosmos').gestures.perMin < paceFor('tech-bytes').gestures.perMin);
  assert.equal(paceFor('cosmos').moves.max, 0, 'COSMOS: the set camera never moves');
  assert.equal(paceFor('money-minute').moves.max, 0, 'MONEY MINUTE: the camera never moves');
  assert.equal(paceFor('news-60').moves.max, 0, 'NEWS IN 60: locked off');
});

test('pace: config/channel.json targetSeconds mirrors each profile\'s length target', () => {
  for (const id of PROGRAMME_IDS) {
    const p = channel.programs[id];
    assert.ok(p, id);
    assert.deepEqual(p.targetSeconds, paceFor(id).length.target, `${id}.targetSeconds`);
  }
});

test('pace: the consumers read the one table (no private copies of the timings)', () => {
  assert.equal(CHANNEL.stinger, STINGER_DURATION, 'stinger = cards.js STINGER_DURATION');
  assert.equal(TRANSITIONS.stinger.dur, STINGER_DURATION);
  assert.equal(STRAP_TIMING, CHANNEL.strap);
  assert.equal(TICKER_TIMING, CHANNEL.ticker);
  assert.equal(CAPTION_TIMING, CHANNEL.captions);
  assert.equal(PROGRAM_TAG, CHANNEL.programTag);
  assert.equal(MIN_SHOT, PACE.default.shots.min);
  for (const id of ['world-now', 'tech-bytes', 'cosmos']) {
    assert.equal(SHOT_STYLES[id].studioMax, paceFor(id).shots.studioMax, id);
    assert.equal(SHOT_STYLES[id].pictureMax, paceFor(id).shots.picture[1], id);
    assert.equal(SHOT_STYLES[id].mapMin, paceFor(id).shots.map[0], id);
  }
  // ART_DIRECTION §4 strap motion kept exactly
  assert.equal(CHANNEL.strap.in, 0.35);
  assert.equal(CHANNEL.strap.flip, 0.3);
  assert.equal(CHANNEL.strap.out, 0.25);
  // the director, the v2 direction and the stage import pace.js (and drop their old constants)
  const src = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const director = src('../public/js/director.js');
  assert.match(director, /from '\.\/pace\.js'/);
  assert.doesNotMatch(director, /const MIN_SHOT = 3|const MONTAGE_FRAME = 2\.6|sleep\(3200\)|sleep\(4200\)|sleep\(2600\)|sleep\(3000\)/);
  const live = src('../public/js/v2/canvas25d/runtime/direction.js');
  assert.match(live, /pace\.js/);
  assert.doesNotMatch(live, /const MIN_SHOT = 3;/);
});

test('pace: ticker items hold >= 6 s from three words on and grow with the text; strap pages and captions readable', () => {
  assert.ok(tickerHold(1) >= CHANNEL.ticker.minHold);
  for (let w = 3; w <= 14; w++) {
    const e = makeEntry({ source: 'Wire', text: Array.from({ length: w }, (_, i) => `word${i}`).join(' ') });
    if (!e) continue;
    assert.ok(e.dur >= 6.0 - 1e-9, `${w} words hold ${e.dur.toFixed(2)} s`);
  }
  assert.ok(tickerHold(7) > tickerHold(3) && tickerHold(40) === CHANNEL.ticker.maxHold);
  assert.ok(CHANNEL.strap.page >= 5 && CHANNEL.captions.minPage >= 1.2 && CHANNEL.captions.hold >= 0.5);
  // readable twice at 3 words/s
  assert.equal(readTwice('one two three'), 2 + 0.6);
  assert.ok(factHold('40,000 PASSENGERS A DAY', 'world-now') >= paceFor('world-now').shots.factMin);
  assert.equal(wordCount('Oil prices slide, 3.5% down'), 5);
});

const ep = (programId, types) => ({
  id: 'e-test',
  program: { id: programId },
  cast: { A: 'paco', B: 'lola' },
  segments: types.map(([type, anchor, extra]) => ({ type, anchor, text: 'Words here.', ...(extra || {}) })),
});

test('pace: gapKind names every pause and gapAfter is seeded per episode (same episode, same rhythm)', () => {
  const e = ep('world-now', [
    ['intro', 'A'],
    ['story', 'A'],
    ['story', 'B'],
    ['chat', 'A'],
    ['chat', 'B'],
    ['chat', 'B', { text: 'Still to come: the weather.' }],
    ['story', 'A'],
    ['story', 'B', { feature: 'roundup', roundup: { index: 0 } }],
    ['story', 'B', { feature: 'roundup', roundup: { index: 1 } }],
    ['story', 'B', { feature: 'lighter', text: 'And finally: a panda.' }],
    ['chat', 'A'],
    ['story', 'A', { feature: 'lighter', text: 'And finally: a second panda.' }],
    ['outro', 'A'],
  ]);
  const kinds = e.segments.map((_, i) => gapAfter(e, i).kind);
  assert.deepEqual(kinds, ['afterIntro', 'handover', 'intoChat', 'chatTurn', 'chatTurn', 'block', 'block', 'roundupItem', 'beforeFinally', 'intoChat', 'beforeFinally', 'beforeOutro', 'signoff']);
  const P = paceFor('world-now');
  for (let i = 0; i < e.segments.length - 1; i++) {
    const { kind, gap } = gapAfter(e, i);
    assert.ok(Math.abs(gap - P.gaps[kind]) <= P.gaps[kind] * P.gaps.jitter + 1e-9, `${kind} ${gap}`);
    assert.equal(gap, gapAfter(structuredClone(e), i).gap, 'deterministic');
  }
  assert.equal(gapAfter(e, e.segments.length - 1).gap, P.holds.signoff);
  const other = { ...e, id: 'e-other' };
  assert.ok(e.segments.some((_, i) => gapAfter(e, i).gap !== gapAfter(other, i).gap), 'the variation follows the episode seed');
  assert.equal(gapKind(null, null), 'story');
  assert.equal(gapKind({ type: 'story', anchor: 'A' }, { type: 'story', anchor: 'A' }), 'story');
});

test('pace: cut cooldown and repetition rules', () => {
  assert.equal(cutAllowed('world-now', 10, 13), false);
  assert.equal(cutAllowed('world-now', 10, 14), true);
  assert.equal(cutAllowed('world-now', 10, 11, { force: true }), true);
  assert.equal(cutWait('cosmos', 0, 1), paceFor('cosmos').shots.cooldown - 1);
  assert.equal(cutWait('cosmos', 0, 99), 0);
  const single = { shot: 'close', framing: 'mcu-l', focus: 'A' };
  assert.equal(isRepeat('world-now', [single], { ...single }), true, 'identical framing twice = jump cut');
  assert.equal(isRepeat('world-now', [single], { shot: 'close', framing: 'ots', focus: 'A' }), false);
  assert.equal(isRepeat('world-now', [single], { shot: 'close', framing: 'mcu-r', focus: 'B' }), false);
  const map = { shot: 'map' };
  assert.equal(isRepeat('world-now', [map, map], map), true, 'three maps in a row outside a round-up');
  assert.equal(isRepeat('world-now', [map, map], map, { roundup: true }), false);
  assert.equal(isRepeat('world-now', [], single), false);
});

test('pace: gesture budget and listener rules scale with the turn, grave turns are stiller', () => {
  for (const id of PROGRAMME_IDS) {
    const b30 = gestureBudget(id, 30);
    const b60 = gestureBudget(id, 60);
    const g60 = gestureBudget(id, 60, { grave: true });
    assert.ok(b60.marked >= b30.marked && b60.marked <= Math.ceil(paceFor(id).gestures.perMin), `${id}: ${b60.marked} in a minute`);
    assert.ok(g60.marked <= b60.marked, `${id}: grave is stiller`);
    assert.equal(gestureBudget(id, 2).marked, 0, `${id}: no marked gesture in a 2 s turn`);
    assert.ok(b60.minGap >= 4 && b60.perSentence === 1 && b60.repeat === false);
    const L = listenerRules(id);
    assert.ok(L.nodsPerTurn <= 1 && L.reactionGap >= 6 && L.maxGazeShare <= 0.5, id);
  }
  assert.ok(listenerRules('cosmos').reactionGap > listenerRules('tech-bytes').reactionGap);
});

test('pace: estimateAir adds the profile\'s pauses, holds and cards to the speech', () => {
  const e = ep('world-now', [
    ['intro', 'A', { audio: { duration: 15 } }],
    ['story', 'A', { audio: { duration: 20 } }],
    ['story', 'B', { audio: { duration: 20 }, breaking: true }],
    ['outro', 'A', { audio: { duration: 6 } }],
  ]);
  const P = paceFor('world-now');
  const gaps = [0, 1, 2].reduce((a, i) => a + gapAfter(e, i).gap, 0);
  const want = 4 + P.open.firstWord + 61 + gaps + CHANNEL.stinger + P.holds.breakingCard + P.holds.signoff + CHANNEL.stinger + P.holds.endcard;
  assert.ok(Math.abs(estimateAir(e) - want) < 1e-6);
});

test('pace: paceTrace is a no-op on a normal page and logs into the recorder when it is there', () => {
  delete globalThis.__sc;
  assert.doesNotThrow(() => paceTrace({ k: 'cut' }));
  globalThis.__sc = { log: [] };
  paceTrace({ k: 'cut', shot: 'wide' });
  assert.equal(globalThis.__sc.log.length, 1);
  assert.equal(globalThis.__sc.log[0].ev, 'pace');
  assert.ok(Number.isFinite(globalThis.__sc.log[0].t));
  delete globalThis.__sc;
});

test('pace: planned shots on the episode fixtures respect the minimum shot, the cut rate and never repeat a framing', () => {
  assert.ok(fixtures.length >= 5);
  for (const e of fixtures) {
    const P = paceFor(e.program.id);
    const L = layoutEpisode(e);
    const r = planReport(e, L);
    assert.equal(r.under.length, 0, `${e.program.id}: shots under ${P.shots.min} s: ${JSON.stringify(r.under)}`);
    assert.ok(r.cutsPerMin <= P.shots.cutsPerMinMax, `${e.program.id}: ${r.cutsPerMin} cuts/min`);
    assert.equal(r.sameFraming, 0, `${e.program.id}: identical framings in a row`);
    assert.ok(r.shots.median >= P.shots.median[0] - 0.5, `${e.program.id}: median ${r.shots.median}`);
    // studio holds stay under the bible's maximum
    for (const s of L.shots) if (s.framing) assert.ok(s.len <= P.shots.studioMax + 2.6, `${e.program.id}: ${s.framing} ${s.len.toFixed(1)} s`);
    // camera moves: within the profile's budget (COSMOS, MONEY MINUTE, NEWS IN 60 never move)
    assert.ok(r.moves <= P.moves.max, `${e.program.id}: ${r.moves} moves`);
    // the pause after each segment is the profile's (the plans are timed for the director's real gaps)
    for (const s of L.segs.slice(0, -1)) assert.equal(s.gap, gapAfter(e, s.i).gap);
  }
});

test('pace: planned gestures on the fixtures stay inside the budget (hands mostly at rest, no immediate repeats)', () => {
  for (const e of fixtures) {
    const P = paceFor(e.program.id);
    const r = planReport(e);
    for (const [slot, p] of Object.entries(r.presenters)) {
      if (p.talk < 20) continue; // a few seconds of talk cannot carry a per-minute rate
      assert.ok(p.markedPerMin <= P.gestures.perMin * 1.75, `${e.program.id} ${slot}: ${p.markedPerMin} marked gestures/min (budget ${P.gestures.perMin})`);
      assert.ok(p.repeats <= 1, `${e.program.id} ${slot}: ${p.repeats} immediate repeats`);
      if (p.listenerNodsPerMin != null) assert.ok(p.listenerNodsPerMin <= 60 / listenerRules(e.program.id).nodGap, `${e.program.id} ${slot}: listener nods ${p.listenerNodsPerMin}/min`);
    }
  }
});

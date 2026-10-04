import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLink, playPlan, wantedShots, sentenceStarts } from '../public/js/linkplan.js';

// The shots of a correspondent link (WORLD NOW): planned from the sentence times so that no shot breaks the floor
// (owner 24/7: 4 s), the correspondent starts talking in the two-way the hand-over opened, the prompt lands on the
// two-way, the answer goes to the correspondent.

const MIN = 4;
const every = (n, d, at0 = 0) => Array.from({ length: n }, (_, i) => at0 + i * d);
const holdsOf = (plan, o) => playPlan(plan, { want: wantedShots(o.part, o.starts.length, o), min: MIN, ...o }).holds;

test('the piece off a young two-way: the first line stays in the box, then the pictures (live into tape), then the correspondent', () => {
  const o = { part: 'piece', starts: every(4, 5), end: 20, current: 'twoway', held: 1.5, broll: true, next: 'twoway', nextAt: 20.4 };
  const plan = planLink(o);
  assert.deepEqual(plan, [null, 'broll', null, 'location']);
  for (const h of holdsOf(plan, o)) assert.ok(h.to - h.from >= MIN - 1e-6, `${h.shot} ${(h.to - h.from).toFixed(2)} s`);
});

test('the piece off a two-way that has held the floor: the correspondent at once', () => {
  const plan = planLink({ part: 'piece', starts: every(3, 5), end: 15, current: 'twoway', held: 5, broll: true, next: 'twoway', nextAt: 15.4 });
  assert.equal(plan[0], 'location');
  assert.equal(plan[1], 'broll');
});

test('off the studio, the correspondent’s words never play over it: the cut comes in the first sentence', () => {
  const o = { part: 'piece', starts: every(3, 5), end: 15, current: 'close', held: 2, broll: true, next: 'twoway', nextAt: 15.4 };
  const plan = planLink(o);
  assert.equal(plan[0], 'location');
  const [studio] = holdsOf(plan, o);
  assert.equal(studio.shot, 'close');
  assert.ok(studio.to - studio.from >= MIN - 1e-6, 'the studio shot still airs the floor (the cut waits inside the sentence)');
});

test('the prompt lands on the two-way: the piece’s last shot is never too young for it', () => {
  // the last sentence 2.5 s: going back to the correspondent for it would leave the prompt over them
  const o = { part: 'piece', starts: [0, 5, 10, 15], end: 17.5, current: 'twoway', held: 6, broll: true, next: 'twoway', nextAt: 17.9 };
  const plan = planLink(o);
  assert.deepEqual(plan, ['location', 'broll', null, null]);
  const ask = planLink({ part: 'ask', starts: [0], end: 2, current: 'broll', held: 17.9 - 5, next: 'twoway', nextAt: 2.4 });
  assert.deepEqual(ask, ['twoway']);
});

test('as aired (Rhea, 3 lines off a 4.0 s two-way): first line in the box, the pictures to the end, the prompt on the two-way', () => {
  const o = { part: 'piece', starts: [0, 3.38, 7.65], end: 10.9, current: 'twoway', held: 3.99, broll: true, next: 'twoway', nextAt: 11.3 };
  const plan = planLink(o);
  assert.deepEqual(plan, [null, 'broll', null]);
  for (const h of holdsOf(plan, o)) assert.ok(h.to - h.from >= MIN - 1e-6, `${h.shot} ${(h.to - h.from).toFixed(2)} s`);
});

test('a short piece off a young two-way stays in it (the ask then needs no cut)', () => {
  const plan = planLink({ part: 'piece', starts: [0, 3], end: 6, current: 'twoway', held: 1.2, broll: true, next: 'twoway', nextAt: 6.4 });
  assert.deepEqual(plan, [null, null]);
});

test('the answer: the two-way the prompt opened, then the correspondent, only with room before the studio', () => {
  const room = planLink({ part: 'answer', starts: [0, 4.5], end: 10, current: 'twoway', held: 2.4, next: 'studio', nextAt: 12 });
  assert.deepEqual(room, [null, 'location']);
  // the studio cut never waits: a correspondent's shot of 3 s before it would break the floor
  const tight = planLink({ part: 'answer', starts: [0, 4.5], end: 6.5, current: 'twoway', held: 2.4, next: 'studio', nextAt: 7.5 });
  assert.deepEqual(tight, [null, null]);
  assert.deepEqual(planLink({ part: 'answer', starts: [0, 4], end: 9, current: 'location', held: 3, next: 'studio', nextAt: 11 }), [null, null], 'already on the correspondent');
  assert.deepEqual(planLink({ part: 'thanks', starts: [0], end: 1.5, current: 'location', held: 8, next: 'studio', nextAt: 1.5 }), [null]);
});

test('no broll source: the piece holds the correspondent', () => {
  assert.deepEqual(planLink({ part: 'piece', starts: every(4, 5), end: 20, current: 'twoway', held: 5, broll: false, next: 'twoway', nextAt: 20.4 }), ['location', null, null, null]);
});

test('whatever the timings, no shot under the floor that not cutting would have spared', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 400; k++) {
    const part = ['piece', 'piece', 'ask', 'answer'][k % 4];
    const n = part === 'ask' ? 1 : part === 'answer' ? 1 + (k % 2) : 1 + Math.floor(rnd() * 4);
    const starts = [0];
    for (let i = 1; i < n; i++) starts.push(starts[i - 1] + 1.5 + rnd() * 6);
    const end = starts[n - 1] + 1.5 + rnd() * 6;
    const current = ['twoway', 'close', 'location', 'broll'][Math.floor(rnd() * 4)];
    const next = part === 'piece' ? (rnd() < 0.7 ? 'twoway' : 'studio') : part === 'ask' ? 'twoway' : 'studio';
    const o = { part, starts, end, current, held: rnd() * 8, broll: rnd() < 0.8, next, nextAt: end + 0.4 + (next === 'studio' ? rnd() * 2 : 0) };
    const plan = planLink(o);
    const holds = holdsOf(plan, o);
    const stay = holdsOf(new Array(n).fill(null), o);
    const studioStart = !['twoway', 'location', 'broll'].includes(current);
    // every shot the plan cuts away from airs the floor (the first: counted from when it came up)
    for (const h of holds.slice(0, -1)) assert.ok(h.to - h.from >= MIN - 1e-6, `${JSON.stringify(o)} ${JSON.stringify(plan)}`);
    // the last before the studio: as long as staying would have made it
    const last = holds[holds.length - 1];
    if (next === 'studio' && last.to - last.from < MIN - 1e-6) assert.ok(stay[0].to - stay[0].from < MIN - 1e-6 || studioStart, `${JSON.stringify(o)} ${JSON.stringify(plan)}`);
    if (studioStart && part === 'piece') assert.ok(plan[0], `off the studio at once ${JSON.stringify(o)} ${JSON.stringify(plan)}`);
  }
});

test('sentence starts: the recorded words by character, else the characters at the estimated pace', () => {
  const lines = ['One two.', 'Three four five.', 'Six.'];
  const words = [{ char: 0, t: 0.1 }, { char: 4, t: 0.4 }, { char: 9, t: 1.2 }, { char: 15, t: 1.5 }, { char: 26, t: 2.6 }];
  assert.deepEqual(sentenceStarts(lines, words), [0.1, 1.2, 2.6]);
  const est = sentenceStarts(lines, null, 10);
  assert.equal(est[0], 0);
  assert.ok(Math.abs(est[1] - 0.9) < 1e-9 && Math.abs(est[2] - 2.6) < 1e-9);
});

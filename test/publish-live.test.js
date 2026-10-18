// The live supervisor (server/publish/live.js; docs/publishing/pipeline.md §6), on a fake clock with a fake streamer:
// a run that ends is started again after a growing pause, a stalled or starved run is stopped and started again, too
// many restarts pause it, a channel that does not answer is waited for, the title follows the programme on air at
// most every 20 minutes, and the stream key never appears in what it logs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LiveSupervisor, liveTitle, liveDescription, LIVE_POLICY } from '../server/publish/live.js';

/** A fake clock whose timers run when time is advanced. */
function clock(start = Date.parse('2026-10-17T10:00:00Z')) {
  let t = start;
  let timers = [];
  let id = 0;
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const h = ++id;
      timers.push({ h, at: t + ms, fn });
      return h;
    },
    clearTimer: (h) => {
      timers = timers.filter((x) => x.h !== h);
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        t = next.at;
        await next.fn();
        await new Promise((r) => setImmediate(r));
      }
      t = end;
    },
  };
}

/** A fake streamer process. */
function fakeSpawn() {
  const kids = [];
  const spawn = (cmd, args) => {
    const c = new EventEmitter();
    c.pid = 1000 + kids.length;
    c.args = args;
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.exitCode = null;
    c.signalCode = null;
    c.killed = false;
    c.kills = [];
    c.kill = (sig) => {
      c.kills.push(sig);
      c.killed = true;
      c.exitCode = null;
      c.signalCode = sig;
      setImmediate(() => c.emit('exit', null, sig));
      return true;
    };
    c.rate = (kbps) => c.stdout.emit('data', `[stream] 10:00:00 ${kbps} KB/s from the page\n`);
    c.end = (code) => {
      c.exitCode = code;
      c.emit('exit', code, null);
    };
    kids.push(c);
    return c;
  };
  return { spawn, kids };
}

const SCHED = (title, id = title.toLowerCase()) => ({ now: { kind: 'episode', id, title, tagline: 'SCIENCE, SPACE & OUR PLANET' }, upcoming: [{ title: 'TECH BYTES' }, { title: 'NEWS IN 60' }] });
function fetchOf(state) {
  return async () => {
    if (state.down) throw new Error('ECONNREFUSED');
    return { ok: true, json: async () => state.sched };
  };
}

test('the title and description: what is on, what comes next, how it is made', () => {
  const t = liveTitle({ title: 'Cosmos Desk' });
  assert.equal(t, 'GLOBIT 24 LIVE · Now: COSMOS DESK · AI-produced news 24/7');
  assert.ok(t.length <= 100);
  assert.ok(liveTitle({ title: 'X'.repeat(120) }).length <= 100);
  const d = liveDescription(SCHED('COSMOS DESK'));
  assert.match(d, /On air now: COSMOS DESK/);
  assert.match(d, /Coming up: TECH BYTES, NEWS IN 60/);
  assert.match(d, /AI-produced news/);
});

test('a run that ends is started again, after 2, then 5, then 15 seconds', async () => {
  const c = clock();
  const f = fakeSpawn();
  const state = { sched: SCHED('COSMOS DESK') };
  const sup = new LiveSupervisor({ streamArgs: ['tools/stream.mjs', '--out', '/tmp/x-{n}.flv'], spawn: f.spawn, fetchImpl: fetchOf(state), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  await sup.start();
  assert.equal(f.kids.length, 1);
  assert.deepEqual(f.kids[0].args.slice(-2), ['--out', '/tmp/x-1.flv'], 'a file per run');
  const restarts = [];
  for (let i = 0; i < 3; i++) {
    const before = c.now();
    f.kids.at(-1).end(2);
    const n = f.kids.length;
    while (f.kids.length === n) await c.advance(1000);
    restarts.push(Math.round((c.now() - before) / 1000));
  }
  assert.deepEqual(restarts, [2, 5, 15]);
  assert.deepEqual(f.kids.at(-1).args.slice(-1), ['/tmp/x-4.flv']);
  await sup.stop();
});

test('a stalled run (no rate for 45 s) and a starved one (under 8 KB/s) are stopped and started again', async () => {
  const c = clock();
  const f = fakeSpawn();
  const sup = new LiveSupervisor({ streamArgs: [], spawn: f.spawn, fetchImpl: fetchOf({ sched: SCHED('COSMOS DESK') }), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  await sup.start();
  const k1 = f.kids[0];
  k1.rate(600);
  await c.advance(30_000);
  assert.equal(k1.kills.length, 0, 'healthy at 30 s');
  await c.advance(25_000);
  assert.deepEqual(k1.kills, ['SIGTERM'], 'no rate line for over 45 s');
  await c.advance(10_000);
  assert.equal(f.kids.length, 2);
  const k2 = f.kids[1];
  for (let i = 0; i < 6; i++) {
    k2.rate(2);
    await c.advance(10_000);
  }
  assert.ok(k2.kills.includes('SIGTERM'), 'starved');
  await sup.stop();
});

test('more than 12 restarts in an hour: a ten-minute pause, said in the status', async () => {
  const c = clock();
  const f = fakeSpawn();
  const sup = new LiveSupervisor({ streamArgs: [], spawn: f.spawn, fetchImpl: fetchOf({ sched: SCHED('COSMOS DESK') }), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, policy: { backoff: [1] } });
  await sup.start();
  for (let i = 0; i < LIVE_POLICY.maxRestartsPerHour; i++) {
    f.kids.at(-1).end(2);
    await c.advance(1500);
  }
  const n = f.kids.length;
  f.kids.at(-1).end(2);
  await c.advance(2000);
  assert.equal(sup.state, 'cooling');
  await c.advance(60_000);
  assert.equal(f.kids.length, n, 'nothing started during the pause');
  await c.advance(LIVE_POLICY.cooldown * 1000);
  assert.ok(f.kids.length > n, 'started again after it');
  await sup.stop();
});

test('a channel server that does not answer is waited for, not streamed', async () => {
  const c = clock();
  const f = fakeSpawn();
  const state = { down: true, sched: SCHED('COSMOS DESK') };
  const sup = new LiveSupervisor({ streamArgs: [], spawn: f.spawn, fetchImpl: fetchOf(state), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  await sup.start();
  assert.equal(f.kids.length, 0);
  assert.equal(sup.state, 'waiting');
  state.down = false;
  await c.advance(10_000);
  assert.equal(f.kids.length, 1);
  await sup.stop();
});

test('the title follows the programme on air, at most every 20 minutes; a dry run sends nothing', async () => {
  const c = clock();
  const f = fakeSpawn();
  const state = { sched: SCHED('COSMOS DESK') };
  const updates = [];
  const youtube = { planLiveUpdate: (id, meta) => [{ step: 'live-update', body: meta }], liveUpdate: async () => updates.push('LIVE') };
  const sup = new LiveSupervisor({ streamArgs: [], spawn: f.spawn, fetchImpl: fetchOf(state), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, youtube, live: false, videoId: 'vid' });
  await sup.start();
  await c.advance(2000);
  assert.match(sup.title, /COSMOS DESK/);
  state.sched = SCHED('TECH BYTES');
  await c.advance(5 * 60_000);
  assert.match(sup.title, /COSMOS DESK/, 'too soon: the next change will carry it');
  await c.advance(20 * 60_000);
  assert.match(sup.title, /TECH BYTES/);
  assert.equal(updates.length, 0, 'a dry run never calls the API');
  await sup.stop();
});

test('the stream key never appears in what it logs', () => {
  const sup = new LiveSupervisor({ streamArgs: ['tools/stream.mjs', '--rtmp', 'rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop'] });
  assert.ok(!JSON.stringify(sup.safeArgs()).includes('abcd-efgh-ijkl-mnop'));
});

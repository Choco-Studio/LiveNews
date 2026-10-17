// The face reader run and watched by the station (server/facereader.js): a child process (tools/pictures/faces.mjs in
// its watch mode), started again when it stops, after a pause that doubles while it keeps failing at once and is short
// again once it has run a while; FACE_READER=off never starts it; it never outlives the station.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FaceReader, READER, BACKOFF } from '../server/facereader.js';
import { FaceStore } from '../server/faces.js';

function fakes() {
  let now = 0;
  const timers = [];
  const spawned = [];
  const logs = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.pid = 1000 + spawned.length;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.killed = null;
    child.kill = (sig) => {
      child.killed = sig;
      setImmediate(() => child.emit('exit', null, sig));
    };
    spawned.push({ cmd, args, opts, child });
    return child;
  };
  const setTimer = (fn, ms) => {
    const t = { fn, ms, at: now + ms, done: false };
    timers.push(t);
    return t;
  };
  const clearTimer = (t) => {
    if (t) t.done = true;
  };
  const fire = () => {
    const t = timers.find((x) => !x.done);
    if (!t) return null;
    t.done = true;
    now = t.at;
    t.fn();
    return t.ms;
  };
  const log = { info: (m) => logs.push(['info', m]), warn: (m) => logs.push(['warn', m]) };
  return { spawn, setTimer, clearTimer, fire, log, logs, spawned, timers, advance: (ms) => (now += ms), now: () => now };
}

describe('the face reader under the station', () => {
  test('started as a child process in its watch mode, on the desk\'s folder; its lines go to the station\'s log', () => {
    const f = fakes();
    const r = new FaceReader({ dir: '/data/pictures', spawn: f.spawn, setTimer: f.setTimer, clearTimer: f.clearTimer, now: f.now, log: f.log });
    assert.equal(r.start(), true);
    assert.equal(f.spawned.length, 1);
    const { cmd, args } = f.spawned[0];
    assert.equal(cmd, process.execPath);
    assert.deepEqual(args, [READER, '--dir', '/data/pictures', '--watch', '60']);
    assert.match(READER, /tools[/\\]pictures[/\\]faces\.mjs$/);
    assert.equal(r.start(), false, 'once');
    f.spawned[0].child.stdout.emit('data', Buffer.from('[faces] 3 pictures to read\npartial'));
    f.spawned[0].child.stderr.emit('data', Buffer.from('a warning\n'));
    assert.deepEqual(f.logs, [['info', '[faces] 3 pictures to read'], ['warn', '[faces] a warning']]);
    assert.equal(r.status().running, true);
  });
  test('started again when it stops: 5 s, then 10 s, 20 s while it fails at once; 5 s again after a long run; at most 30 min', () => {
    const f = fakes();
    const r = new FaceReader({ dir: '/d', spawn: f.spawn, setTimer: f.setTimer, clearTimer: f.clearTimer, now: f.now, log: f.log });
    r.start();
    const delays = [];
    for (let i = 0; i < 3; i++) {
      f.advance(1000);
      f.spawned.at(-1).child.emit('exit', 1, null);
      delays.push(f.fire());
    }
    assert.deepEqual(delays, [5000, 10000, 20000]);
    assert.equal(f.spawned.length, 4);
    // a long run, then it stops: soon again
    f.advance(BACKOFF.stableMs + 1);
    f.spawned.at(-1).child.emit('exit', 0, null);
    assert.equal(f.fire(), 5000);
    // failing at once for ever: never more than 30 min between two starts
    for (let i = 0; i < 12; i++) {
      f.spawned.at(-1).child.emit('exit', 1, null);
      f.fire();
    }
    assert.equal(r.status().backoffMs, BACKOFF.maxMs);
    assert.ok(f.logs.some(([lvl, m]) => lvl === 'warn' && /starting it again in 5 s/.test(m)));
  });
  test('a start that throws, or a spawn error, is tried again the same way', () => {
    const f = fakes();
    let fail = true;
    const spawn = (...a) => {
      if (fail) throw new Error('ENOENT');
      return f.spawn(...a);
    };
    const r = new FaceReader({ dir: '/d', spawn, setTimer: f.setTimer, clearTimer: f.clearTimer, now: f.now, log: f.log });
    r.start();
    assert.equal(r.status().last.error, 'ENOENT');
    fail = false;
    assert.equal(f.fire(), 5000);
    assert.equal(r.status().running, true);
    f.spawned[0].child.emit('error', new Error('spawn EACCES'));
    assert.equal(r.status().running, false);
    assert.equal(f.fire(), 10000);
    assert.equal(f.spawned.length, 2);
  });
  test('stopped: the child is ended and never started again; off: never started at all', async () => {
    const f = fakes();
    const r = new FaceReader({ dir: '/d', spawn: f.spawn, setTimer: f.setTimer, clearTimer: f.clearTimer, now: f.now, log: f.log });
    r.start();
    const child = f.spawned[0].child;
    r.stop();
    assert.equal(child.killed, 'SIGTERM');
    await new Promise((res) => setImmediate(res));
    assert.equal(f.timers.filter((t) => !t.done).length, 0, 'no restart');
    const off = new FaceReader({ dir: '/d', enabled: false, spawn: f.spawn, log: f.log });
    assert.equal(off.start(), false);
    assert.equal(f.spawned.length, 1);
  });
  test('it never outlives the station: stopped on exit and on SIGTERM, the signal then doing its default', () => {
    const f = fakes();
    const r = new FaceReader({ dir: '/d', spawn: f.spawn, setTimer: f.setTimer, clearTimer: f.clearTimer, now: f.now, log: f.log });
    const proc = new EventEmitter();
    proc.pid = 42;
    const kills = [];
    proc.kill = (pid, sig) => kills.push([pid, sig]);
    r.exitWithStation(proc);
    r.start();
    const child = f.spawned[0].child;
    proc.emit('SIGTERM');
    assert.equal(child.killed, 'SIGTERM');
    assert.deepEqual(kills, [[42, 'SIGTERM']]);
  });
  test('a real child that keeps exiting is started again and again, each pause longer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facereader-'));
    const script = path.join(dir, 'reader.mjs');
    fs.writeFileSync(script, "console.log('[faces] up', process.argv.slice(2).join(' ')); process.exit(3);\n");
    const logs = [];
    const r = new FaceReader({ dir, script, backoff: { minMs: 20, maxMs: 200, stableMs: 60_000 }, log: { info: (m) => logs.push(m), warn: (m) => logs.push(m) } });
    r.start();
    const until = Date.now() + 10_000;
    while (r.status().restarts < 3 && Date.now() < until) await new Promise((res) => setTimeout(res, 10));
    r.stop();
    assert.ok(r.status().restarts >= 3, `restarts ${r.status().restarts}`);
    assert.equal(r.status().last.code, 3);
    assert.ok(logs.some((m) => m === `[faces] up --dir ${dir} --watch 60`), logs.join(' | '));
    assert.ok(logs.some((m) => /starting it again in 0 s/.test(m)));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('the queue between the desk and the reader', () => {
  test('the reader reads the queue again while the desk adds to it, and never writes over it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faces-'));
    const desk = new FaceStore({ dir });
    const reader = new FaceStore({ dir });
    desk.want('https://upload.wikimedia.org/a.jpg', 'portrait: A');
    reader.reloadQueue();
    assert.deepEqual(reader.queue().map((x) => x.url), ['https://upload.wikimedia.org/a.jpg']);
    desk.want('https://upload.wikimedia.org/b.jpg', 'portrait: B');
    reader.record('https://upload.wikimedia.org/a.jpg', { faces: [] });
    reader.save({ queue: false });
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'faces-queue.json'), 'utf8'));
    assert.ok(file.queue['https://upload.wikimedia.org/b.jpg'], 'the desk\'s later wish is still queued');
    assert.ok(desk.verdict('https://upload.wikimedia.org/a.jpg'), 'and the desk reads what the reader wrote');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// The publisher (server/publish/publisher.js; docs/publishing/pipeline.md §4): a dry run unless every live switch is
// on, the compliance gate again at the moment of publishing (a refusal holds the item, nothing is sent), the C2PA mark
// on a signed copy, the ledger before and after (never twice), the outbox with no secret in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PublishQueue } from '../server/publish/queue.js';
import { Publisher, liveBlockers } from '../server/publish/publisher.js';

const T0 = Date.parse('2026-10-17T09:00:00Z');
const SECRET = 'very-secret-token-value-123456';
function setup({ gate = () => ({ ok: true, violations: [] }), env = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const video = path.join(dir, 'clip.mp4');
  fs.writeFileSync(video, 'fake video bytes');
  const q = new PublishQueue({ dir, now: () => T0 });
  const marks = [];
  const mark = async (file, manifest, opts) => {
    marks.push({ file, opts });
    fs.writeFileSync(opts.output, 'signed');
    return { ok: true, path: opts.output };
  };
  const fetchImpl = () => {
    throw new Error('the dry run touched the network');
  };
  const p = new Publisher({ queue: q, env: { YOUTUBE_CLIENT_ID: SECRET, ...env }, fetchImpl, gate, mark, readMark: () => ({ ok: true, aiGenerated: true }), usingStub: false, now: () => T0 });
  const it = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Owls', text: 'Owls', media: { video, sha256: 'abc' }, source: { episodeId: 'e', momentId: 'e:story:1-1', storyIds: ['s1'] }, compliance: { ok: true }, disclosure: { youtube: { containsSyntheticMedia: true } } });
  return { dir, q, p, it, marks, video };
}

test('liveBlockers names every switch that is off', () => {
  const { q, it } = setup();
  const why = liveBlockers(q, it, { env: {}, usingStub: true, adapter: { configured: () => false, missing: () => ['YOUTUBE_CLIENT_ID'] } });
  assert.equal(why.length, 6);
  assert.ok(why.some((w) => /PUBLISH_LIVE/.test(w)) && why.some((w) => /stub/.test(w)) && why.some((w) => /approved/.test(w)) && why.some((w) => /YOUTUBE_CLIENT_ID/.test(w)));
});

test('a dry run: gated, marked on a copy, described, recorded in the dry ledger, nothing sent', async () => {
  const { q, p, it, marks, video, dir } = setup();
  q.approve(it.id);
  const out = await p.publishOne(q.get(it.id));
  assert.equal(out.status, 'published');
  assert.equal(out.result.dryRun, true);
  assert.equal(marks.length, 1);
  assert.notEqual(marks[0].opts.output, video, 'the clip itself is never rewritten');
  assert.equal(fs.readFileSync(video, 'utf8'), 'fake video bytes');
  assert.equal(q.ledger(true).length, 1);
  assert.equal(q.ledger(false).length, 0, 'the real ledger is untouched');
  const outbox = fs.readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8');
  assert.ok(!outbox.includes(SECRET), 'no secret in the outbox');
  assert.match(outbox, /"dryRun":true/);
  // never twice
  const again = await p.publishOne({ ...q.get(it.id), status: 'scheduled' });
  assert.equal(again.status, 'duplicate');
});

test('a compliance refusal at the moment of publishing holds the item and sends nothing', async () => {
  const { q, p, it, marks } = setup({ gate: () => ({ ok: false, violations: [{ rule: 'sentence-cut', message: 'inside a sentence' }] }) });
  q.approve(it.id);
  const out = await p.publishOne(q.get(it.id));
  assert.equal(out.status, 'held');
  assert.equal(marks.length, 0, 'not even marked');
  assert.equal(q.ledger(true).length, 0);
});

test('the gate sees the clip as the contract asks: the recording, the range, the flags, the vertical frame', async () => {
  let seen = null;
  const { q, p, it } = setup({ gate: (item) => ((seen = item), { ok: true, violations: [] }) });
  q.approve(it.id);
  await p.publishOne(q.get(it.id));
  assert.equal(seen.kind, 'short');
  assert.deepEqual(seen.platforms, ['youtube']);
  assert.equal(seen.flags.youtube.containsSyntheticMedia, true);
  assert.equal(seen.frame.output.h, 1920);
});

test('run(): schedules what is approved and publishes only what is due', async () => {
  const { q, p, it } = setup();
  q.approve(it.id);
  const out = await p.run();
  // 09:00 UTC is inside YouTube's hours in London: the first slot is now
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'published');
});

test('one publisher at a time: a live lock refuses a second round; a lock of a process that is gone is taken over', async () => {
  const { q, p, it } = setup();
  q.approve(it.id);
  // a lock held by another live process (this test's parent: alive, and not this process)
  fs.writeFileSync(path.join(q.dir, 'publisher.lock'), JSON.stringify({ pid: process.ppid, at: T0 }));
  await assert.rejects(p.run(), /another publisher/);
  // a lock left by a process that is gone
  fs.writeFileSync(path.join(q.dir, 'publisher.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, at: T0 }));
  const out = await p.run();
  assert.equal(out.length, 1);
  assert.ok(!fs.existsSync(path.join(q.dir, 'publisher.lock')), 'released');
});

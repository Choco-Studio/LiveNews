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

test('the re-check before each round: what no longer passes is held with its reason in Spanish; passing again, it goes back to the owner', async () => {
  const { recheckQueue, refreshRights, WAITING } = await import('../server/publish/recheck.js');
  const { gateView } = await import('../server/publish/publisher.js');
  const { itemView } = await import('../server/publish/approval.js');
  assert.deepEqual([...WAITING], ['pending', 'approved', 'scheduled']);
  let blocked = false;
  const gate = (view, opts) => (blocked || opts.register?.isBlocked?.({ storyId: 's1' }) ? { ok: false, violations: [{ rule: 'blocked', message: 'story s1: takedown: a copyright complaint' }], warnings: [] } : { ok: true, violations: [], warnings: [] });
  const { q, p, it } = setup({ gate });
  q.approve(it.id);
  q.schedule(T0);
  assert.equal(q.get(it.id).status, 'scheduled');
  // nothing changed: it passes, nothing written in its history
  let r = recheckQueue({ queue: q, view: (x) => gateView(x, { now: T0 }), gate, now: () => T0, register: null, getStory: () => null });
  assert.deepEqual([r.checked, r.passed, r.held.length], [1, 1, 0]);
  // a takedown arrives in the register while it waits: held before the round schedules or sends anything
  const register = { isBlocked: ({ storyId }) => (storyId === 's1' ? 'takedown: a copyright complaint' : null) };
  r = recheckQueue({ queue: q, view: (x) => gateView(x, { now: T0 }), gate, now: () => T0, register, getStory: () => null });
  assert.equal(r.held.length, 1);
  const held = q.get(it.id);
  assert.equal(held.status, 'held');
  assert.equal(held.schedule, null, 'its slot is given back');
  assert.equal(held.history.at(-1).by, 'recheck');
  assert.equal(held.history.at(-1).was, 'scheduled');
  assert.equal(q.approve(it.id).status, 'held', 'never approved over');
  const card = itemView(held);
  assert.equal(card.compliance.recheck, true);
  assert.match(card.compliance.violations[0].es, /registro/);
  // the complaint is closed: it passes again and waits for the owner (never straight out)
  r = recheckQueue({ queue: q, view: (x) => gateView(x, { now: T0 }), gate, now: () => T0, register: null, getStory: () => null });
  assert.equal(r.released.length, 1);
  assert.equal(q.get(it.id).status, 'pending');
  // the publisher's round runs it first: a refusal now holds the item and nothing goes out
  q.approve(it.id);
  blocked = true;
  const out = await p.run();
  assert.equal(out.length, 0);
  assert.equal(q.get(it.id).status, 'held');
  assert.equal(p.lastRecheck.held.length, 1);
  // a picture's record judged again under today's terms: a licence the desk no longer accepts is no longer cleared
  const ep = { segments: [{ storyId: 's1', hasImage: true, imageRights: { source: 'commons', licence: 'CC-BY-NC-4.0', author: 'Jane Doe', url: 'https://upload.wikimedia.org/x.jpg', label: 'FILE', cleared: true, checkedAt: '2026-10-16T10:00:00.000Z' } }, { storyId: 's2', hasImage: true, imageRights: { source: 'commons', licence: 'CC-BY-4.0', author: 'Jane Doe', url: 'https://upload.wikimedia.org/y.jpg', label: 'FILE', cleared: true, checkedAt: '2026-10-16T10:00:00.000Z' } }], rundown: [] };
  assert.equal(refreshRights(ep, { now: T0 }), 1);
  assert.equal(ep.segments[0].imageRights.cleared, false);
  assert.match(ep.segments[0].imageRights.why, /commercial|licence/);
  assert.equal(ep.segments[1].imageRights.cleared, true, 'a licence still accepted stays cleared');
  // and a record that was not cleared is never cleared by judging it again
  const outlet = { segments: [{ imageRights: { source: 'outlet', licence: null, cleared: false } }] };
  refreshRights(outlet, { now: T0 });
  assert.equal(outlet.segments[0].imageRights.cleared, false);
});

test('tools/publish/recheck.mjs: the re-check by hand, the reasons in Spanish, nothing sent', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recheck-'));
  const q = new PublishQueue({ dir: path.join(dir, 'publish'), now: () => T0 });
  q.saveSettings({ modes: { bluesky: 'manual' } });
  // a post whose words copy its source: the real gate holds it now
  const source = 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring, after engineers found that its steel supports had corroded far faster than expected.';
  const it = q.enqueue({ kind: 'text', platform: 'bluesky', title: 'Bridge', text: `AI-generated: ${source}`, sourceTexts: [source], source: { storyIds: ['s9'] }, compliance: { ok: true } });
  assert.equal(it.status, 'pending');
  const r = spawnSync(process.execPath, ['tools/publish/recheck.mjs', '--data', dir, '--json'], { encoding: 'utf8', env: { ...process.env, EDITORIAL_CONTACT: 'editor@example.org', NODE_NO_WARNINGS: '1' } });
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.checked, 1);
  assert.equal(doc.held.length, 1);
  assert.ok(doc.held[0].rules.includes('verbatim'));
  assert.match(doc.held[0].es.join(' '), /Copia palabras del medio/);
  assert.equal(new PublishQueue({ dir: path.join(dir, 'publish'), now: () => T0 }).get(it.id).status, 'held');
  assert.ok(!fs.existsSync(path.join(dir, 'publish', 'outbox.jsonl')), 'nothing sent');
});

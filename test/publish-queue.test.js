// The publishing queue (server/publish/queue.js; docs/publishing/pipeline.md §2): statuses by each network's mode, a
// compliance refusal held and never approved over, the ledger making a second post of the same thing impossible, the
// owner's edits kept safe, and the scheduler keeping every network's hours, spacing, daily cap and the ten-minute gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PublishQueue, contentKey, localParts, SAMPLE_EVERY } from '../server/publish/queue.js';
import { PLATFORMS } from '../server/publish/platforms.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pubq-'));
const T0 = Date.parse('2026-10-17T05:00:00Z'); // 06:00 in London
const clip = (n, extra = {}) => ({ kind: 'clip', platform: 'youtube', format: 'vertical', title: `Clip ${n}`, text: `Clip ${n}`, media: { video: `/x/${n}.mp4`, sha256: `sha${n}` }, source: { episodeId: 'e1', momentId: `e1:story:${n}-${n}`, storyIds: [`s${n}`] }, compliance: { ok: true }, score: 10 - n, ...extra });

test('contentKey: the same moment to the same network and format is the same post', () => {
  assert.equal(contentKey(clip(1)), contentKey({ ...clip(1), title: 'another title' }));
  assert.notEqual(contentKey(clip(1)), contentKey({ ...clip(1), platform: 'tiktok' }));
  assert.notEqual(contentKey(clip(1)), contentKey({ ...clip(1), format: 'horizontal' }));
});

test('enqueue: manual waits for the owner, auto is approved, off is not queued, a refusal is held', () => {
  const q = new PublishQueue({ dir: tmp(), now: () => T0 });
  q.saveSettings({ phase: 3, modes: { youtube: 'manual', tiktok: 'auto', x: 'off' } });
  assert.equal(q.enqueue(clip(1)).status, 'pending');
  assert.equal(q.enqueue({ ...clip(2), platform: 'tiktok' }).status, 'approved');
  assert.equal(q.enqueue({ ...clip(3), platform: 'x' }), null);
  assert.equal(q.enqueue({ ...clip(4), compliance: { ok: false, violations: [{ rule: 'demo' }] } }).status, 'held');
  // a grave story waits for the owner even in an automatic mode
  assert.equal(q.enqueue({ ...clip(5), platform: 'tiktok', grave: true }).status, 'pending');
});

test('the automatic modes belong to Phase 3: earlier, every item waits for the owner', () => {
  const q = new PublishQueue({ dir: tmp() });
  const s = q.saveSettings({ phase: 1, modes: { youtube: 'auto', tiktok: 'sample', instagram: 'bogus' } });
  assert.equal(s.modes.youtube, 'manual');
  assert.equal(s.modes.tiktok, 'manual');
  assert.equal(s.modes.instagram, 'manual');
  assert.equal(s.dryRun, true, 'dry run by default');
});

test('sample mode: one in SAMPLE_EVERY waits for the owner', () => {
  const q = new PublishQueue({ dir: tmp(), now: () => T0 });
  q.saveSettings({ phase: 3, modes: { youtube: 'sample' } });
  const st = Array.from({ length: SAMPLE_EVERY * 2 }, (_, i) => q.enqueue(clip(i + 1)).status);
  assert.equal(st.filter((s) => s === 'pending').length, 2);
});

test('the ledger: what was published is refused again, by key, by the same video, by the same story within a day', () => {
  const q = new PublishQueue({ dir: tmp(), now: () => T0 });
  const it = q.enqueue(clip(1));
  q.record(it, { remoteId: 'abc' });
  assert.equal(q.enqueue(clip(1)).status, 'duplicate');
  assert.equal(q.enqueue({ ...clip(9), media: { sha256: 'sha1' } }).status, 'duplicate', 'the same bytes');
  const text = { kind: 'text', platform: 'x', text: 'AI-generated: a', source: { storyIds: ['sZ'] }, postKind: 'story' };
  q.saveSettings({ modes: { x: 'manual' } });
  q.record(q.enqueue(text), {});
  assert.equal(q.enqueue({ ...text, postKind: 'story-2' }).status, 'duplicate', 'the same story within 24 h');
  // a dry run's ledger does not block the real thing, but blocks another dry run
  const q2 = new PublishQueue({ dir: tmp(), now: () => T0 });
  const it2 = q2.enqueue(clip(1));
  q2.record(it2, {}, { dry: true });
  assert.equal(q2.published(it2.key), null);
  assert.ok(q2.published(it2.key, { dry: true }));
});

test('the owner: approve, reject, edit; a compliance refusal is never approved; edits are cleaned and kept safe', () => {
  const q = new PublishQueue({ dir: tmp(), now: () => T0 });
  const held = q.enqueue({ ...clip(1), compliance: { ok: false, violations: [{ rule: 'demo' }] } });
  assert.equal(q.approve(held.id).status, 'held');
  const it = q.enqueue(clip(2));
  assert.equal(q.approve(it.id).status, 'approved');
  assert.ok(q.get(it.id).history.some((h) => h.action === 'approved' && h.by === 'owner'));
  const long = 'x'.repeat(300);
  assert.equal(q.edit(it.id, { title: `<b>${long}</b>` }).title.length, PLATFORMS.youtube.text.title);
  assert.ok(!q.get(it.id).title.includes('<'));
  assert.equal(q.edit(it.id, { title: '   ' }).title.length, PLATFORMS.youtube.text.title, 'an empty title keeps the old one');
  q.saveSettings({ modes: { x: 'manual' } });
  const post = q.enqueue({ kind: 'text', platform: 'x', text: 'AI-generated: Owls move in.', source: { storyIds: ['s7'] } });
  assert.equal(q.edit(post.id, { text: 'Owls move in, edited.' }).text, 'AI-generated: Owls move in, edited.', 'the disclosure stays first');
  assert.equal(q.reject(it.id, 'owner', 'not today').status, 'rejected');
});

test('schedule: inside the network\'s hours, its spacing, ten minutes from any other upload, its daily cap, best first', () => {
  const q = new PublishQueue({ dir: tmp(), now: () => T0 });
  q.saveSettings({ phase: 1, modes: { youtube: 'manual', tiktok: 'manual' } });
  const ids = [];
  for (let i = 1; i <= 7; i++) ids.push(q.approve(q.enqueue(clip(i)).id).id);
  for (let i = 1; i <= 2; i++) q.approve(q.enqueue({ ...clip(20 + i), platform: 'tiktok' }).id);
  const done = q.schedule(T0);
  const yt = done.filter((x) => x.platform === 'youtube').sort((a, b) => a.schedule.at - b.schedule.at);
  const cap = 5; // Phase 1: up to five Shorts a day
  const firstDay = yt.filter((x) => x.schedule.local.day === yt[0].schedule.local.day);
  assert.ok(firstDay.length <= cap);
  for (const it of yt) {
    const h = localParts(it.schedule.at, 'Europe/London').h;
    assert.ok(h >= PLATFORMS.youtube.hours[0] && h < PLATFORMS.youtube.hours[1], `hour ${h}`);
  }
  for (let i = 1; i < yt.length; i++) assert.ok(yt[i].schedule.at - yt[i - 1].schedule.at >= PLATFORMS.youtube.spacing);
  const all = done.map((x) => x.schedule.at).sort((a, b) => a - b);
  for (let i = 1; i < all.length; i++) assert.ok(all[i] - all[i - 1] >= 10 * 60_000, 'ten minutes between any two uploads');
  // best first: the best-scored clip has the earliest YouTube slot
  assert.equal(yt[0].score, Math.max(...yt.map((x) => x.score)));
  assert.equal(q.due(T0).length, 0);
  assert.ok(q.due(yt[0].schedule.at).some((x) => x.id === yt[0].id));
});

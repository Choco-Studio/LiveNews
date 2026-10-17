// The takedown and correction workflow's register (server/compliance/registry.js; compliance.md §7): a complaint is
// logged with its deadlines, what it names is held at once, the triage takes down every publication in scope on
// every platform (derived clips too) and keeps it off air and out of publication, the publisher reports each
// removal, a complaint closes only when all are done, overdue ones are listed, and other processes see it all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ComplianceRegister, CATEGORIES } from '../server/compliance/registry.js';

const HOUR = 3600_000;
const T0 = Date.parse('2026-10-17T09:00:00Z');

function seeded(dir = null) {
  let now = T0;
  const reg = new ComplianceRegister({ dir, now: () => now });
  const rec = [{ id: 'rp_ana', name: 'Ana Silva', qid: 'Q999', outlet: 'Harbour Herald' }];
  reg.recordPublication({ itemId: 'e1', kind: 'episode', platform: 'youtube', remoteId: 'yt-e1', url: 'https://youtu.be/yt-e1', storyIds: ['s1', 's2'], recreations: rec });
  reg.recordPublication({ itemId: 'c1', parentId: 'e1', kind: 'short', platform: 'youtube', remoteId: 'yt-c1', storyIds: ['s1'], recreations: rec });
  reg.recordPublication({ itemId: 'c1', parentId: 'e1', kind: 'short', platform: 'tiktok', remoteId: 'tt-c1', storyIds: ['s1'], recreations: rec });
  reg.recordPublication({ itemId: 'c2', parentId: 'e1', kind: 'clip', platform: 'instagram', remoteId: 'ig-c2', storyIds: ['s2'], recreations: [] });
  reg.recordPublication({ itemId: 'p1', kind: 'text', platform: 'x', remoteId: 'x-p1', storyIds: ['s3'] });
  return { reg, tick: (h) => (now += h * HOUR) };
}

test('a likeness complaint: logged with its deadlines, held at once, taken down everywhere, kept off air for good', () => {
  const { reg, tick } = seeded();
  const c = reg.fileComplaint({ channel: 'email', from: 'Ana Silva', contact: 'ana@example.org', category: 'privacy-likeness', about: { url: 'https://youtu.be/yt-e1', person: { name: 'Ana Silva', qid: 'Q999' } }, text: 'Please remove the recreation of me.' });
  assert.equal(Date.parse(c.actBy) - T0, CATEGORIES['privacy-likeness'].act * HOUR);
  assert.ok(c.held, 'held from the moment it is logged');
  assert.ok(reg.isBlocked({ name: 'ana silva' }), 'a precaution: no new recreation of her while it is triaged');
  tick(2);
  const { actions, blocks } = reg.triage(c.id, { decision: 'block-person', reason: 'her request', by: 'owner' });
  // the episode and the Short on both platforms carry her recreation; the Instagram clip and the X post do not
  assert.deepEqual(actions.map((a) => `${a.platform}:${a.remoteId}:${a.action}`).sort(), ['tiktok:tt-c1:delete', 'youtube:yt-c1:delete', 'youtube:yt-e1:delete']);
  assert.equal(blocks.length, 1);
  assert.ok(reg.isBlocked({ qid: 'Q999' }) && reg.isBlocked({ name: 'Ana Silva' }));
  assert.ok(reg.isBlocked({ itemId: 'c1' }), 'the items themselves never go out again');
  assert.equal(reg.isBlocked({ name: 'Rui Costa' }), null);
  // closing waits for every removal
  assert.throws(() => reg.close(c.id, { outcome: 'removed' }), /3 action\(s\) still open/);
  for (const a of actions) reg.actionDone(a.id, { ok: true, result: 'deleted' });
  assert.deepEqual(reg.openActions(), []);
  assert.equal(reg.publicationsFor({ person: { name: 'Ana Silva' } }).length, 0, 'nothing of her live');
  assert.equal(reg.publicationsFor({ person: { name: 'Ana Silva' } }, { live: false }).every((p) => p.state === 'removed'), true);
  reg.close(c.id, { outcome: 'removed everywhere, blocked', reply: 'Done within 2 hours.' });
  assert.ok(reg.complaint(c.id).closed);
});

test('an inaccuracy: corrected on each publication and read on air; a failed removal stays open and the complaint goes overdue', () => {
  const { reg, tick } = seeded();
  const c = reg.fileComplaint({ category: 'inaccuracy', about: { storyId: 's2' }, text: 'The rain forecast named the wrong region.' });
  const { actions } = reg.triage(c.id, { decision: 'correct', reason: 'wrong region' });
  assert.deepEqual(actions.map((a) => a.action), ['correct', 'correct']);
  assert.equal(reg.isBlocked({ storyId: 's2' }), null, 'a correction keeps the story');
  const cor = reg.correction({ about: { storyId: 's2' }, text: 'Correction: the rain is forecast for the north-west, not the north-east.', complaintId: c.id });
  assert.deepEqual(reg.pendingCorrections().map((x) => x.id), [cor.id]);
  reg.correctionAired(cor.id, { programId: 'world-now' });
  assert.deepEqual(reg.pendingCorrections(), []);
  reg.actionDone(actions[0].id, { ok: false, result: 'platform error 500' });
  tick(25);
  const late = reg.overdue();
  assert.equal(late.length, 1);
  assert.equal(late[0].openActions, 2);
});

test('a copyright notice about one URL takes down that item on every platform; rejected and escalated complaints take nothing', () => {
  const { reg } = seeded();
  const c = reg.fileComplaint({ category: 'copyright', about: { remote: { platform: 'instagram', remoteId: 'ig-c2' } }, text: 'Our photo.' });
  const { actions } = reg.triage(c.id, { decision: 'remove' });
  assert.deepEqual(actions.map((a) => a.remoteId), ['ig-c2']);
  const d = reg.fileComplaint({ category: 'other', about: { itemId: 'p1' }, text: 'I disagree.' });
  assert.ok(reg.isBlocked({ itemId: 'p1' }), 'held while triaged');
  assert.deepEqual(reg.triage(d.id, { decision: 'reject', reason: 'an opinion, not an error' }).actions, []);
  assert.equal(reg.isBlocked({ itemId: 'p1' }), null, 'released by the triage');
  assert.throws(() => reg.triage(d.id, { decision: 'shrug' }), /a decision is one of/);
});

test('one file, an append-only log: a second process sees the first one\'s block at once; a torn last line is skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-'));
  const server = new ComplianceRegister({ dir });
  const tool = new ComplianceRegister({ dir });
  const c = tool.fileComplaint({ category: 'harm', about: { person: { name: 'Child Name' } }, text: 'A minor was named.' });
  tool.triage(c.id, { decision: 'block-person' });
  assert.ok(server.isBlocked({ name: 'Child Name' }), 'the server reads what the tool appended');
  fs.appendFileSync(path.join(dir, 'register.jsonl'), '{"type":"block","id":"x"');
  const again = new ComplianceRegister({ dir });
  assert.ok(again.isBlocked({ name: 'Child Name' }));
  const lines = fs.readFileSync(path.join(dir, 'register.jsonl'), 'utf8').trim().split('\n');
  assert.ok(lines.length >= 4 && lines.slice(0, -1).every((l) => JSON.parse(l).at));
  fs.rmSync(dir, { recursive: true, force: true });
});

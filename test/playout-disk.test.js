// Pre-rendered playout's disk policy (server/playout/disk.js; docs/publishing/playout.md §8): the buffer is never
// touched, an aired file goes after N hours, a held unit's files after a day, and a programme's clip-mode master stays
// for the publishing desk until the clip factory has cut it (factory.json in its folder), or until its own limit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diskPlan, diskPolicyFromEnv, DISK_DEFAULTS } from '../server/playout/disk.js';

const H = 3600_000;
const NOW = Date.parse('2026-10-18T12:00:00Z');
const seg = (id, endHoursAgo, seconds = 600) => ({ id, airAt: NOW - endHoursAgo * H - seconds * 1000, frames: seconds * 30, fps: 30, file: `/p/segments/${id}.mkv` });

test('an aired file goes once it aired more than airedHours ago; the tail before that stays', () => {
  const plan = diskPlan({ aired: [seg('old', 3), seg('recent', 1), seg('just', 0.01)], now: NOW });
  assert.deepEqual(plan.map((d) => d.path), ['/p/segments/old.mkv']);
  assert.match(plan[0].reason, /aired 3\.0 h ago \(keep 2 h\)/);
  assert.equal(plan[0].kind, 'aired');
  assert.deepEqual(diskPlan({ aired: [seg('recent', 1)], now: NOW, policy: { airedHours: 0.5 } }).map((d) => d.id), ['recent'], 'configurable');
});

test('the buffer is never deleted: only aired (or dropped) segments are candidates', () => {
  // (what is queued is not passed in at all; a master whose programme has not aired yet is part of the buffer)
  const plan = diskPlan({ aired: [], masters: [{ dir: '/p/masters/future', airEnd: NOW + 1800_000, cut: false }], now: NOW, policy: { masterHours: 0.001 } });
  assert.deepEqual(plan, []);
});

test('a master stays until the factory has cut it (and an hour more for its other formats)', () => {
  const masters = [
    { dir: '/p/masters/uncut', airEnd: NOW - 10 * H, cut: false },
    { dir: '/p/masters/cut-long-ago', airEnd: NOW - 10 * H, cut: true, cutAt: NOW - 2 * H },
    { dir: '/p/masters/cut-just-now', airEnd: NOW - 10 * H, cut: true, cutAt: NOW - 0.2 * H },
  ];
  const plan = diskPlan({ masters, now: NOW });
  assert.deepEqual(plan.map((d) => d.path), ['/p/masters/cut-long-ago']);
  assert.equal(plan[0].reason, 'cut by the clip factory');
});

test('a master never cut goes after masterHours (0: kept until cut, however long)', () => {
  const masters = [{ dir: '/p/masters/a', airEnd: NOW - 50 * H, cut: false }];
  assert.deepEqual(diskPlan({ masters, now: NOW }).map((d) => d.path), ['/p/masters/a']);
  assert.match(diskPlan({ masters, now: NOW })[0].reason, /never cut, aired 50\.0 h ago \(keep 48 h\)/);
  assert.deepEqual(diskPlan({ masters, now: NOW, policy: { masterHours: 0 } }), []);
});

test('a held unit\'s files stay heldHours for a look on the approval page, then go', () => {
  const held = [{ id: 'u1', heldAt: NOW - 25 * H, files: ['/p/segments/a.mkv', '/p/segments/b.mkv'] }, { id: 'u2', heldAt: NOW - 2 * H, files: ['/p/segments/c.mkv'] }];
  const plan = diskPlan({ held, now: NOW });
  assert.deepEqual(plan.map((d) => d.path), ['/p/segments/a.mkv', '/p/segments/b.mkv']);
  assert.ok(plan.every((d) => d.kind === 'held' && d.id === 'u1'));
});

test('the policy from the environment, hours, with the defaults for anything not a number', () => {
  assert.deepEqual(diskPolicyFromEnv({}), { ...DISK_DEFAULTS });
  assert.deepEqual(diskPolicyFromEnv({ PLAYOUT_KEEP_AIRED_H: '0.5', PLAYOUT_KEEP_HELD_H: '6', PLAYOUT_KEEP_MASTER_H: '0' }), { airedHours: 0.5, heldHours: 6, masterHours: 0, cutGraceHours: DISK_DEFAULTS.cutGraceHours });
  assert.equal(diskPolicyFromEnv({ PLAYOUT_KEEP_AIRED_H: 'lots' }).airedHours, DISK_DEFAULTS.airedHours);
  assert.equal(diskPolicyFromEnv({ PLAYOUT_KEEP_AIRED_H: '-3' }).airedHours, DISK_DEFAULTS.airedHours);
});

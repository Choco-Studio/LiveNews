// The autonomous round's choices (server/publish/autoplan.js; tools/publish/auto.mjs): a piece that would go out more
// than a day after its programme aired leaves the queue, the programmes are made in turn by type (the newest edition of
// the type made least recently), and the backlog counts what waits for a network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stale, nextProgramme, backlog, AUTO_DEFAULTS } from '../server/publish/autoplan.js';

const H = 3600_000;
const NOW = Date.parse('2026-10-19T08:00:00Z');

test('stale: aired more than a day ago, or scheduled to go out more than a day after it aired', () => {
  const piece = (airedHoursAgo, status = 'scheduled', atHours = 1) => ({ status, source: { airedAt: NOW - airedHoursAgo * H }, schedule: { at: NOW + atHours * H } });
  assert.equal(stale(piece(2), NOW), null, 'fresh');
  assert.match(stale(piece(30), NOW), /aired 30 h ago/);
  assert.match(stale(piece(12, 'scheduled', 20), NOW), /would go out 32 h after it aired/, 'a week of backlog: let go now');
  assert.equal(stale(piece(30, 'published'), NOW), null, 'what went out stays');
  assert.equal(stale({ status: 'scheduled', source: {} }, NOW), null, 'no air time: kept');
  assert.equal(AUTO_DEFAULTS.freshHours, 24);
});

test('nextProgramme: the type made least recently first, its newest edition; nothing older than a day', () => {
  const c = (id, programId, hoursAgo) => ({ id, programId, airEnd: NOW - hoursAgo * H });
  const list = [c('a', 'world-now', 1), c('b', 'world-now', 0.5), c('c', 'cosmos', 3), c('d', 'tech-bytes', 30)];
  assert.equal(nextProgramme(list, { 'world-now': NOW - 2 * H, cosmos: NOW - H }, { now: NOW }).id, 'b', 'WORLD NOW made longest ago: its newest');
  assert.equal(nextProgramme(list, { 'world-now': NOW - H }, { now: NOW }).id, 'c', 'never made: COSMOS first');
  assert.equal(nextProgramme([c('d', 'tech-bytes', 30)], {}, { now: NOW }), null, 'too old');
});

test('backlog: what waits to go out on a network', () => {
  const items = [{ platform: 'youtube', status: 'scheduled' }, { platform: 'youtube', status: 'approved' }, { platform: 'youtube', status: 'held' }, { platform: 'tiktok', status: 'scheduled' }];
  assert.equal(backlog(items, 'youtube'), 2);
});

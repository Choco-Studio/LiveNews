// The approval page (server/publish/approval.js; docs/publishing/setup.md §6): on 127.0.0.1 only, answering only its
// own Host, every change a JSON POST with the page's token, media only from the paths the queue names inside the
// folders it was given, and the owner's decisions landing in the queue (a compliance refusal never approved).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PublishQueue } from '../server/publish/queue.js';
import { createApprovalServer, insideRoots, itemView } from '../server/publish/approval.js';

let dir;
let media;
let q;
let srv;
let port;
let token;
let okItem;
let heldItem;

/** A raw request (fetch would set its own Host): { status, headers, body }. */
function req(method, p, { host, headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: { host: host ?? `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    if (body !== null) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}
const post = (p, body, extra = {}) => req('POST', p, { headers: { 'content-type': 'application/json', 'x-approval-token': token, ...extra }, body });

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appr-'));
  media = fs.mkdtempSync(path.join(os.tmpdir(), 'media-'));
  fs.writeFileSync(path.join(media, 'clip.mp4'), Buffer.alloc(1000, 7));
  fs.writeFileSync(path.join(media, 'clip.jpg'), 'jpg');
  q = new PublishQueue({ dir });
  okItem = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Owls', text: 'Owls in Manhattan', media: { video: path.join(media, 'clip.mp4'), thumb: path.join(media, 'clip.jpg'), contact: '/etc/passwd' }, source: { momentId: 'm1', storyIds: ['s1'] }, compliance: { ok: true } });
  heldItem = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Demo', text: 'Demo', media: {}, source: { momentId: 'm2' }, compliance: { ok: false, violations: [{ rule: 'demo', message: 'demo data' }] } });
  srv = createApprovalServer({ queue: q, mediaRoots: [media] });
  port = await srv.listen(0);
  token = srv.token;
});
after(() => srv.close());

test('only its own Host: another name (DNS rebinding) is refused', async () => {
  assert.equal((await req('GET', '/', { host: 'evil.example:80' })).status, 421);
  assert.equal((await req('GET', '/', { host: `localhost:${port}` })).status, 200);
});

test('the page: Spanish, a strict content policy with a nonce, the token inside, no frames', async () => {
  const r = await req('GET', '/');
  assert.equal(r.status, 200);
  assert.match(r.body, /<html lang="es">/);
  assert.match(r.body, /Aprobar/);
  assert.match(r.headers['content-security-policy'], /default-src 'none'; script-src 'nonce-/);
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.ok(r.body.includes(token));
});

test('state: the items without file paths', async () => {
  const r = await req('GET', '/api/state');
  const s = JSON.parse(r.body);
  assert.equal(s.items.length, 2);
  assert.ok(!r.body.includes(media), 'no path on the page');
  assert.equal(s.settings.dryRun, true);
});

test('a change needs the token, JSON and its own Origin', async () => {
  assert.equal((await req('POST', '/api/approve', { headers: { 'content-type': 'application/json' }, body: { id: okItem.id } })).status, 403);
  assert.equal((await post('/api/approve', { id: okItem.id }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await req('POST', '/api/approve', { headers: { 'content-type': 'text/plain', 'x-approval-token': token }, body: JSON.stringify({ id: okItem.id }) })).status, 415);
  assert.equal(q.get(okItem.id).status, 'pending', 'nothing changed');
});

test('approve, edit, reject; a compliance refusal cannot be approved', async () => {
  const e = await post('/api/edit', { id: okItem.id, title: 'Barn owls in Manhattan' });
  assert.equal(e.status, 200);
  assert.equal(q.get(okItem.id).title, 'Barn owls in Manhattan');
  assert.equal((await post('/api/approve', { id: okItem.id })).status, 200);
  assert.equal(q.get(okItem.id).status, 'approved');
  const h = await post('/api/approve', { id: heldItem.id });
  assert.equal(h.status, 409);
  assert.equal(q.get(heldItem.id).status, 'held');
  assert.equal((await post('/api/reject', { id: okItem.id, reason: 'no' })).status, 200);
  assert.equal(q.get(okItem.id).status, 'rejected');
  assert.equal((await post('/api/approve', { id: '../../etc' })).status, 400);
});

test('settings: modes per network; the automatic ones are refused before Phase 3', async () => {
  const r = await post('/api/settings', { modes: { youtube: 'auto', x: 'manual', nope: 'auto' }, timezone: 'America/New_York' });
  const s = JSON.parse(r.body).settings;
  assert.equal(s.modes.youtube, 'manual');
  assert.equal(s.modes.x, 'manual');
  assert.equal(s.timezone, 'America/New_York');
  assert.ok(!('nope' in s.modes));
  assert.equal(s.dryRun, true, 'never switched off from the page');
});

test('media: the item\'s own files inside the given folders only, ranges for video', async () => {
  const v = await req('GET', `/media/${okItem.id}/video`, { headers: { range: 'bytes=100-199' } });
  assert.equal(v.status, 206);
  assert.equal(v.headers['content-range'], 'bytes 100-199/1000');
  assert.equal((await req('GET', `/media/${okItem.id}/thumb`)).status, 200);
  assert.equal((await req('GET', `/media/${okItem.id}/contact`)).status, 403, 'a path outside the folders');
  assert.equal((await req('GET', `/media/${heldItem.id}/video`)).status, 404);
  assert.equal((await req('GET', '/media/..%2F..%2Fetc/video')).status, 404);
  assert.ok(!insideRoots('/etc/passwd', [media]));
  assert.ok(insideRoots(path.join(media, 'clip.mp4'), [media]));
});

test('itemView: what the card shows', () => {
  const v = itemView({ ...okItem, schedule: { at: Date.parse('2026-10-17T09:30:00Z'), tz: 'Europe/London' } });
  assert.equal(v.schedule.time, '10:30');
  assert.equal(v.platformLabel, 'YouTube');
  assert.ok(!JSON.stringify(v).includes(media));
});

test('it listens on 127.0.0.1 only', () => {
  const s = createApprovalServer({ queue: q });
  assert.throws(() => s.listen(0, '0.0.0.0'));
});

test('approve on every network: the same clip\'s other pending items, never one the compliance desk held', async () => {
  const mk = (platform, ok = true) => q.enqueue({ kind: 'clip', platform, format: 'vertical', title: 'Owls', text: 'Owls', media: {}, source: { momentId: 'm9' }, compliance: ok ? { ok: true } : { ok: false, violations: [{ rule: 'x', message: 'x' }] } });
  q.saveSettings({ modes: { youtube: 'manual', tiktok: 'manual', instagram: 'manual' } });
  const a = mk('youtube');
  const b = mk('tiktok');
  const c = mk('instagram', false);
  const r = await post('/api/approve', { id: a.id, all: true });
  assert.equal(r.status, 200);
  assert.equal(q.get(a.id).status, 'approved');
  assert.equal(q.get(b.id).status, 'approved');
  assert.equal(q.get(c.id).status, 'held');
});

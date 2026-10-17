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
import { makeAdapter } from '../server/publish/adapters/index.js';

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

test('itemView: why an item was held, in Spanish for the owner, the desk\'s own message kept', () => {
  const v = itemView({ ...heldItem, compliance: { ok: false, violations: [{ rule: 'verbatim', message: 'the story\'s aired text copies 18 words in a row from its source' }, { rule: 'something-new', message: 'x' }] } });
  assert.match(v.compliance.violations[0].es, /Copia palabras del medio/);
  assert.match(v.compliance.violations[0].message, /copies 18 words/);
  assert.equal(v.compliance.violations[1].es, null, 'a rule without words of its own shows its message');
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

test('TikTok: the owner\'s privacy, interaction choices and consent saved on the item (no default privacy)', async () => {
  const t = q.enqueue({ kind: 'clip', platform: 'tiktok', format: 'vertical', title: 'Owls', text: 'Owls', media: {}, source: { momentId: 'm20' }, compliance: { ok: true } });
  const yt = q.enqueue({ kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Owls', text: 'Owls', media: {}, source: { momentId: 'm20' }, compliance: { ok: true } });
  // the card: nothing chosen until the owner chooses it; no block for another network
  assert.deepEqual(itemView(t).tiktok, { privacy: null, allowComment: false, allowDuet: false, allowStitch: false, consent: false });
  assert.equal(itemView(yt).tiktok, null);
  const st = JSON.parse((await req('GET', '/api/state')).body);
  assert.equal(st.tiktokMode, 'inbox', 'the inbox route unless TIKTOK_MODE says direct');
  assert.equal((await post('/api/tiktok', { id: t.id, privacy: 'EVERYONE' })).status, 400, 'only TikTok\'s own levels');
  assert.equal((await post('/api/tiktok', { id: yt.id, privacy: 'SELF_ONLY' })).status, 400, 'only on a TikTok item');
  const r = await post('/api/tiktok', { id: t.id, privacy: 'FOLLOWER_OF_CREATOR', allowComment: true, allowDuet: 'yes', consent: true });
  assert.equal(r.status, 200);
  assert.deepEqual(q.get(t.id).tiktok, { privacy: 'FOLLOWER_OF_CREATOR', allowComment: true, allowDuet: false, allowStitch: false, consent: true });
  assert.equal(JSON.parse(r.body).item.tiktok.privacy, 'FOLLOWER_OF_CREATOR');
  assert.ok(q.get(t.id).history.some((h) => h.action === 'tiktok choices' && h.by === 'owner'));
  // what the adapter would send: comments as ticked, duets and stitches off (nothing on unless the owner ticks it)
  const info = makeAdapter('tiktok', { env: {}, dryRun: true }).postInfo(q.get(t.id));
  assert.deepEqual([info.privacy_level, info.disable_comment, info.disable_duet, info.disable_stitch], ['FOLLOWER_OF_CREATOR', false, true, true]);
  assert.equal(makeAdapter('tiktok', { env: {}, dryRun: true }).postInfo({ ...t, tiktok: undefined }).disable_comment, true, 'no choice made: comments off');
  // the page carries the block, in Spanish, with no radio checked by default
  const page = (await req('GET', '/')).body;
  assert.match(page, /Todo el mundo/);
  assert.match(page, /Solo yo/);
  assert.match(page, /Music Usage Confirmation/);
  assert.match(page, /\/api\/tiktok/);
  assert.doesNotMatch(page, /checked: true|checked="checked"/);
  // in the inbox route an approval needs none of it (the owner finishes the post in the TikTok app)
  const t2 = q.enqueue({ kind: 'clip', platform: 'tiktok', format: 'vertical', title: 'Owls', text: 'Owls', media: {}, source: { momentId: 'm21' }, compliance: { ok: true } });
  assert.equal((await post('/api/approve', { id: t2.id })).status, 200);
  assert.equal(q.get(t2.id).status, 'approved');
});

test('TikTok direct posts: no approval until the owner has chosen the privacy and given consent', async () => {
  const d = createApprovalServer({ queue: q, mediaRoots: [media], env: { TIKTOK_MODE: 'direct' } });
  const dport = await d.listen(0);
  const dpost = (p, body) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: dport, method: 'POST', path: p, headers: { host: `127.0.0.1:${dport}`, 'content-type': 'application/json', 'x-approval-token': d.token } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    r.end(JSON.stringify(body));
  });
  try {
    const mk = (platform) => q.enqueue({ kind: 'clip', platform, format: 'vertical', title: 'Owls', text: 'Owls', media: {}, source: { momentId: 'm30' }, compliance: { ok: true } });
    const yt = mk('youtube');
    const tt = mk('tiktok');
    const no = await dpost('/api/approve', { id: tt.id });
    assert.equal(no.status, 409);
    assert.equal(JSON.parse(no.body).error, 'tiktok');
    assert.equal(q.get(tt.id).status, 'pending');
    // "approve on every network" leaves the TikTok item waiting for its own choices
    assert.equal((await dpost('/api/approve', { id: yt.id, all: true })).status, 200);
    assert.equal(q.get(yt.id).status, 'approved');
    assert.equal(q.get(tt.id).status, 'pending');
    // privacy alone is not enough: the consent too
    await dpost('/api/tiktok', { id: tt.id, privacy: 'SELF_ONLY' });
    assert.equal((await dpost('/api/approve', { id: tt.id })).status, 409);
    await dpost('/api/tiktok', { id: tt.id, privacy: 'SELF_ONLY', consent: true });
    assert.equal((await dpost('/api/approve', { id: tt.id })).status, 200);
    assert.equal(q.get(tt.id).status, 'approved');
    // once out, the choices are not changed after the fact
    q.save({ ...q.get(tt.id), status: 'published' });
    assert.equal((await dpost('/api/tiktok', { id: tt.id, privacy: 'PUBLIC_TO_EVERYONE', consent: true })).status, 409);
  } finally {
    d.close();
  }
});

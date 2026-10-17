// The playback server (server/publish/playback.js): the channel's page and one saved episode, nothing else; the
// episode served once, then the station stands by; what is on for the live supervisor; recorded voices by id only;
// no path outside public/.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createPlaybackServer } from '../server/publish/playback.js';

let pb;
let port;
const EP = { id: 'ep-1', program: { id: 'cosmos', title: 'COSMOS DESK', tagline: 'SCIENCE' }, segments: [{ type: 'intro', text: 'Hello.' }] };
const get = (p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    const chunks = [];
    res.on('data', (d) => chunks.push(d));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), type: res.headers['content-type'] }));
  }).on('error', reject);
});

before(async () => {
  const voices = fs.mkdtempSync(path.join(os.tmpdir(), 'voices-'));
  pb = createPlaybackServer({ items: [EP], voiceDir: voices, channel: { name: 'GLOBIT 24', programs: {} } });
  port = await pb.listen(0);
});
after(() => pb.close());

test('the episode once, then standby', async () => {
  const first = await get('/api/next');
  assert.equal(first.status, 200);
  assert.equal(JSON.parse(first.body).id, 'ep-1');
  assert.equal((await get('/api/next')).status, 202);
});

test('what is on: the episode served last (the live supervisor\'s title)', async () => {
  const s = JSON.parse((await get('/api/schedule')).body);
  assert.equal(s.now.kind, 'episode');
  assert.equal(s.now.title, 'COSMOS DESK');
});

test('no other /api path, a voice by its id only, nothing outside public/', async () => {
  assert.equal((await get('/api/desk')).status, 404);
  assert.equal((await get('/api/voice/../../etc/passwd')).status, 404);
  assert.equal((await get('/api/voice/v0123456789abcdef0123.json')).status, 404);
  const trav = await get('/../package.json');
  assert.ok(trav.status === 404 || !/"name": "livenews"/.test(trav.body));
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.type, /html/);
});

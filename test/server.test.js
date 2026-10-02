import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { storyId } from '../server/news.js';
import { publicChannel } from '../server/channel.js';

// End-to-end: the real server/index.js runs as a child process, from a throw-away
// copy of the project (so its data/usage.json is not the project's), with the mock
// AI provider and a stubbed global fetch (preloaded with --import) that serves RSS
// feeds, article pages and images from memory. No network is touched.

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgo=', 'base64');

const STUB_FETCH = `
import fs from 'node:fs';
import path from 'node:path';
const feeds = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'feeds.json'), 'utf8'));
const PNG = Buffer.from('${PNG.toString('base64')}', 'base64');
const item = (n, i) =>
  '<item><title>Dispatch from place' + n + '</title><link>https://stub.test/article/' + n + '</link>' +
  '<description>Summary of dispatch ' + n + '. A second sentence with more detail, long enough to count as a real summary for the ranking.</description>' +
  '<pubDate>' + new Date(Date.now() - i * 300000).toUTCString() + '</pubDate>' +
  (i % 2 === 0 ? '<media:thumbnail url="https://img.stub.test/' + n + '.png" width="640" height="360"/>' : '') +
  '</item>';
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.startsWith('https://img.stub.test/')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
  if (url.startsWith('https://stub.test/article/')) return new Response('<html><head><title>article</title></head><body></body></html>', { status: 200 });
  const index = feeds.findIndex((f) => f.url === url);
  if (index < 0) return new Response('not found', { status: 404 });
  const items = Array.from({ length: 8 }, (_, i) => item(index * 100 + i, i)).join('');
  return new Response('<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>t</title>' + items + '</channel></rss>', { status: 200 });
};
`;

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a copy of the app. Resolves once it answers HTTP; `stop()` kills it and deletes the copy. */
async function startApp(env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-server-test-'));
  for (const item of ['server', 'config', 'package.json']) fs.cpSync(path.join(REPO, item), path.join(dir, item), { recursive: true });
  fs.mkdirSync(path.join(dir, 'public', 'js'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'public', 'js', 'cues.js'), path.join(dir, 'public', 'js', 'cues.js'));
  fs.writeFileSync(path.join(dir, 'public', 'index.html'), '<!doctype html><title>test page</title>');
  fs.writeFileSync(path.join(dir, 'public', 'js', 'app.js'), 'export const ok = true;');
  fs.mkdirSync(path.join(dir, 'public-evil'));
  fs.writeFileSync(path.join(dir, 'public-evil', 'secret.txt'), 'top secret');
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'stub-fetch.mjs'), STUB_FETCH);

  const port = await freePort();
  const output = { stdout: '', stderr: '' };
  const child = spawn(process.execPath, ['--import', pathToFileURL(path.join(dir, 'stub-fetch.mjs')).href, 'server/index.js'], {
    cwd: dir,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), PROVIDERS: 'mock', QUEUE_SIZE: '2', REVIEW_PASS: '1', CANDIDATE_POOL: '12', MIN_NEW_STORIES: '3', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => (output.stdout += d));
  child.stderr.on('data', (d) => (output.stderr += d));
  let exited = false;
  child.on('exit', () => (exited = true));

  const app = {
    dir,
    port,
    output,
    base: `http://127.0.0.1:${port}`,
    async stop() {
      if (!exited) {
        child.kill('SIGTERM');
        await new Promise((resolve) => child.once('exit', resolve));
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
    /** GET/POST a path and return { status, headers, text, json }. */
    async request(urlPath, { method = 'GET' } = {}) {
      const res = await fetch(app.base + urlPath, { method });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        /* not JSON */
      }
      return { status: res.status, headers: res.headers, text, json };
    },
    /** Polls `check()` until it returns something truthy. */
    async waitFor(check, what, timeoutMs = 15_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (exited) throw new Error(`the server exited while waiting for ${what}\n${output.stdout}\n${output.stderr}`);
        try {
          const value = await check();
          if (value) return value;
        } catch {
          /* not up yet */
        }
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}\n${output.stdout}\n${output.stderr}`);
        await sleep(40);
      }
    },
  };
  try {
    await app.waitFor(async () => (await app.request('/api/channel')).status === 200, 'the server to answer');
  } catch (err) {
    await app.stop();
    throw err;
  }
  return app;
}

/** The server with the mock AI, once its first two episodes are produced. */
const stationReady = (app) => app.waitFor(async () => (await app.request('/api/status')).json.queue.length === 2, 'two episodes to be produced');

// ---------------------------------------------------------------- a healthy channel

describe('server/index.js: HTTP API of a running channel', () => {
  /** @type {Awaited<ReturnType<typeof startApp>>} */
  let app;
  const real = JSON.parse(fs.readFileSync(path.join(REPO, 'config', 'channel.json'), 'utf8'));
  before(async () => {
    app = await startApp();
    await stationReady(app);
  });
  after(() => app?.stop());

  test('announces itself on the console', () => {
    assert.match(app.output.stdout, /GLOBIT 24 on air at http:\/\/127\.0\.0\.1:\d+/);
    assert.match(app.output.stdout, /AI providers: mock \(review pass: no AI editor configured\)/, 'the mock writes but never reviews');
  });

  test('GET /api/channel is the public view of config/channel.json, as uncacheable JSON', async () => {
    const res = await app.request('/api/channel');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(res.json, publicChannel(real));
    assert.ok(!res.text.includes('personality'));
  });

  test('GET /api/status reports the queue, the news desk, the providers and the AI usage', async () => {
    const { status, json } = await app.request('/api/status');
    assert.equal(status, 200);
    assert.deepEqual(json.queue, [real.programs[real.rotation[0]].title, real.programs[real.rotation[1]].title]);
    assert.equal(json.producing, null);
    assert.equal(json.lastError, null);
    assert.equal(json.aired, 0);
    assert.ok(json.stories >= 100, `${json.stories} stories`);
    assert.ok(json.uncovered > 0);
    assert.ok(Object.values(json.feeds).length >= 10 && Object.values(json.feeds).every((f) => f.ok && f.items === 8));
    assert.match(json.lastRefresh, /^\d{4}-\d\d-\d\dT/);
    assert.deepEqual(json.providers.map((p) => [p.name, p.configured]), [['mock', true]]);
    assert.ok(json.usage.today.mock.calls >= 2, 'two episodes written (the mock never stands in for the editor)');
    assert.equal(json.usage.today.mock.errors, 0);
    assert.deepEqual(Object.keys(json.schedule), ['now', 'upcoming']);
  });

  test('GET /api/desk (editorial dev view) lists the desk, most interesting first, without advancing the channel', async () => {
    const { status, json } = await app.request('/api/desk');
    assert.equal(status, 200);
    assert.ok(Array.isArray(json) && json.length > 10 && json.length <= 80);
    assert.deepEqual(Object.keys(json[0]).sort(), ['breaking', 'category', 'covered', 'hasImage', 'id', 'live', 'outlets', 'score', 'source', 'title']);
    assert.ok(json.every((s, i) => i === 0 || json[i - 1].score >= s.score));
    assert.equal((await app.request('/api/status')).json.aired, 0);
  });

  test('GET /api/queue shows the episodes ready to air, as the clients will get them', async () => {
    const { status, json } = await app.request('/api/queue');
    assert.equal(status, 200);
    assert.deepEqual(json.map((e) => e.program.id), [real.rotation[0], real.rotation[1]]);
    assert.ok(json.every((e) => e.kind === 'episode' && e.pipeline.find((p) => p.stage === 'review').reviewed === false));
    assert.equal((await app.request('/api/status')).json.aired, 0);
  });

  test('GET /api/schedule lists what is ready and what comes next in the rotation', async () => {
    const { json } = await app.request('/api/schedule');
    assert.equal(json.now, null);
    assert.deepEqual(json.upcoming.map((u) => [u.id, u.ready]), [
      [real.rotation[0], true],
      [real.rotation[1], true],
      [real.rotation[2], false],
      [real.rotation[3], false],
    ]);
    assert.deepEqual(Object.keys(json.upcoming[0]).sort(), ['id', 'presenters', 'ready', 'tagline', 'theme', 'title']);
  });

  test('GET /api/events is a server-sent event stream that starts with the ticker, the status and the schedule', async () => {
    const buffer = await new Promise((resolve, reject) => {
      let text = '';
      const timer = setTimeout(() => reject(new Error(`no events: ${text}`)), 5000);
      const req = http.get(`${app.base}/api/events`, (res) => {
        try {
          assert.equal(res.statusCode, 200);
          assert.equal(res.headers['content-type'], 'text/event-stream');
          assert.equal(res.headers['cache-control'], 'no-store');
        } catch (err) {
          reject(err);
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
          if (text.includes('event: schedule')) {
            clearTimeout(timer);
            req.destroy();
            resolve(text);
          }
        });
      });
      req.on('error', () => {});
    });
    const events = buffer
      .split('\n\n')
      .filter((block) => block.startsWith('event:'))
      .map((block) => {
        const [, name, data] = block.match(/^event: (\w+)\ndata: (.*)$/s);
        return { name, data: JSON.parse(data) };
      });
    assert.deepEqual(events.map((e) => e.name), ['ticker', 'status', 'schedule']);
    assert.ok(events[0].data.length > 0 && events[0].data.length <= 18);
    assert.deepEqual(Object.keys(events[0].data[0]).sort(), ['source', 'text']);
    assert.equal(events[1].data.queue.length, 2);
    assert.equal(events[2].data.upcoming.length, 4);
  });

  test('POST /api/refresh refreshes the news and returns the status', async () => {
    const res = await app.request('/api/refresh', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.ok(res.json.stories >= 100);
    assert.equal(res.json.queue.length, 2);
  });

  describe('playout over HTTP', () => {
    let first;
    let breakItem;
    let second;

    test('GET /api/next gives the first episode of the rotation', async () => {
      const res = await app.request('/api/next');
      assert.equal(res.status, 200);
      first = res.json;
      assert.equal(first.kind, 'episode');
      assert.equal(first.program.id, real.rotation[0]);
      assert.deepEqual(first.cast, { A: real.programs[first.program.id].presenters[0], B: real.programs[first.program.id].presenters[1] });
      assert.equal(first.provider, 'mock');
      assert.deepEqual(first.pipeline.map((p) => p.stage), ['pictures', 'write', 'review', 'assets']);
      assert.equal(first.segments[0].type, 'intro');
      assert.equal(first.segments.at(-1).type, 'outro');
      assert.ok(first.storyIds.length >= 1 && first.storyIds.length <= real.programs[first.program.id].stories);
      assert.ok(first.segments.every((s) => Array.isArray(s.cues)));
    });

    test('?after=<episode id> gives the commercial break, announcing the next programme as ready', async () => {
      const res = await app.request(`/api/next?after=${first.id}`);
      breakItem = res.json;
      assert.equal(res.status, 200);
      assert.equal(breakItem.kind, 'break');
      assert.equal(breakItem.filler, false);
      assert.equal(breakItem.ads, real.breaks.adsPerBreak);
      assert.equal(breakItem.next.id, real.rotation[1]);
      assert.equal(breakItem.next.ready, true);
    });

    test('?after=<break id> gives the next episode', async () => {
      const res = await app.request(`/api/next?after=${breakItem.id}`);
      second = res.json;
      assert.equal(second.kind, 'episode');
      assert.equal(second.program.id, real.rotation[1]);
      assert.notEqual(second.id, first.id);
    });

    test('a client that is behind is given the same following item from history', async () => {
      assert.equal((await app.request(`/api/next?after=${first.id}`)).json.id, breakItem.id);
      assert.equal((await app.request(`/api/next?after=${breakItem.id}`)).json.id, second.id);
    });

    test('the schedule and the status follow the playout', async () => {
      const { json: schedule } = await app.request('/api/schedule');
      assert.deepEqual(schedule.now, { kind: 'episode', ...second.program });
      const status = (await app.request('/api/status')).json;
      assert.equal(status.aired, 3);
      await app.waitFor(async () => (await app.request('/api/status')).json.queue.length === 2, 'the queue to be refilled');
    });

    test('the rotation keeps going: break, then the third programme', async () => {
      const brk = (await app.request(`/api/next?after=${second.id}`)).json;
      assert.equal(brk.kind, 'break');
      const third = (await app.request(`/api/next?after=${brk.id}`)).json;
      assert.equal(third.kind, 'episode');
      assert.equal(third.program.id, real.rotation[2]);
    });

    test('the stories already on air do not come back', () => {
      assert.deepEqual(first.storyIds.filter((id) => second.storyIds.includes(id)), []);
    });
  });

  describe('story pictures', () => {
    const withImage = storyId('https://stub.test/article/0'); // the first item of the first feed has a picture
    const withoutImage = storyId('https://stub.test/article/1');

    test('GET /api/img/<story id> serves the picture of a story, with the type and cache headers', async () => {
      const res = await fetch(`${app.base}/api/img/${withImage}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('cache-control'), 'public, max-age=86400');
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
    });

    test('a story without a picture, or an unknown story, is a 404', async () => {
      for (const id of [withoutImage, 's0000000000']) {
        const res = await app.request(`/api/img/${id}`);
        assert.equal(res.status, 404, id);
        assert.equal(typeof res.json.error, 'string');
      }
    });

    test(
      'the 404 explains itself in English',
      async () => {
        const res = await app.request(`/api/img/${withoutImage}`);
        assert.match(res.json.error, /no image/i);
      }
    );

    test('only well-formed story ids are routed to the image handler', async () => {
      for (const id of ['abc', 's123', 's0123456789ab', 'S0123456789', 's012345678z']) {
        const res = await app.request(`/api/img/${id}`);
        assert.equal(res.status, 404, id);
        assert.equal(res.json.error, 'not found', id);
      }
    });
  });

  describe('static files and other requests', () => {
    test('serves public/index.html at /, with the right type and no-cache', async () => {
      const res = await app.request('/');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(res.headers.get('cache-control'), 'no-cache');
      assert.match(res.text, /test page/);
    });

    test('serves other files with their MIME type', async () => {
      const res = await app.request('/js/app.js');
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
      assert.equal(res.text, 'export const ok = true;');
    });

    test('unknown files and unknown API routes are 404 JSON', async () => {
      for (const url of ['/missing.css', '/api/nope', '/js/']) {
        const res = await app.request(url);
        assert.equal(res.status, 404, url);
        assert.deepEqual(res.json, { error: 'not found' }, url);
      }
    });

    test('cannot read files outside public/, including a sibling directory that merely starts with the same name', async () => {
      for (const url of ['/..%2fserver%2fconfig.js', '/..%2f..%2fpackage.json', '/..%2fpublic-evil%2fsecret.txt', '/js%2f..%2f..%2fserver%2findex.js']) {
        const res = await app.request(url);
        assert.equal(res.status, 403, url);
        assert.deepEqual(res.json, { error: 'forbidden' }, url);
        assert.ok(!/top secret|export const config/.test(res.text), url);
      }
    });

    test('methods other than GET (and POST /api/refresh) are 405', async () => {
      for (const [method, url] of [['PUT', '/api/next'], ['DELETE', '/'], ['POST', '/api/next'], ['POST', '/anything']]) {
        const res = await app.request(url, { method });
        assert.equal(res.status, 405, `${method} ${url}`);
        assert.deepEqual(res.json, { error: 'method not allowed' });
      }
    });

    test('a malformed URL gets an error response and does not take the server down', async () => {
      const res = await app.request('/%E0%A4%A');
      assert.ok(res.status >= 400 && res.status < 600, String(res.status));
      assert.equal((await app.request('/api/channel')).status, 200);
    });
  });
});

// ---------------------------------------------------------------- a channel whose AI is down

describe('server/index.js: no AI provider available', () => {
  let app;
  before(async () => {
    app = await startApp({ PROVIDERS: 'nonexistent' });
  });
  after(() => app?.stop());

  test('with nothing aired and nothing ready, /api/next answers 202 with { standby: true } and the status', async () => {
    const status = await app.waitFor(async () => {
      const { json } = await app.request('/api/status');
      return json.lastError ? json : null;
    }, 'the first production attempt to fail');
    assert.match(status.lastError, /no AI provider available \(all paused\)/);

    const res = await app.request('/api/next');
    assert.equal(res.status, 202);
    assert.equal(res.json.standby, true);
    assert.deepEqual(res.json.status.queue, []);
    assert.match(res.json.status.lastError, /no AI provider available/);
    assert.equal(res.json.status.stories >= 100, true, 'the news desk itself works');
  });

  test('the rest of the API still works', async () => {
    assert.equal((await app.request('/api/channel')).status, 200);
    const schedule = (await app.request('/api/schedule')).json;
    assert.equal(schedule.now, null);
    assert.ok(schedule.upcoming.every((u) => u.ready === false));
    assert.match(app.output.stdout, /AI providers: nonexistent/);
  });
});

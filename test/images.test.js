import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ImageCache } from '../server/images.js';

// ---------------------------------------------------------------- helpers

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** Fake fetch: `respond(url, n)` returns a Response (or throws). Counts calls per URL. */
function makeFetch(respond = () => imageResponse()) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, calls.length);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

const imageResponse = (body = PNG, headers = {}, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'image/png', ...headers } });

const URL_A = 'https://img.test/a.png';

// ---------------------------------------------------------------- ImageCache

describe('ImageCache', () => {
  test('downloads an image and returns its type and bytes', async () => {
    const fetchImpl = makeFetch();
    const entry = await new ImageCache({ fetchImpl }).get('s1', URL_A);
    assert.equal(entry.type, 'image/png');
    assert.ok(Buffer.isBuffer(entry.body));
    assert.deepEqual(entry.body, PNG);
    assert.equal(entry.error, undefined);
  });

  test('requests the URL following redirects, with a bot user agent, an image Accept header and a timeout', async () => {
    const fetchImpl = makeFetch();
    await new ImageCache({ fetchImpl }).get('s1', URL_A);
    const [{ url, init }] = fetchImpl.calls;
    assert.equal(url, URL_A);
    assert.equal(init.redirect, 'follow');
    assert.match(init.headers['user-agent'], /LiveNewsBot/);
    assert.equal(init.headers.accept, 'image/*');
    assert.ok(init.signal instanceof AbortSignal);
  });

  test('keeps what it downloaded: the same story id is served from memory', async () => {
    const fetchImpl = makeFetch();
    const cache = new ImageCache({ fetchImpl });
    const first = await cache.get('s1', URL_A);
    const second = await cache.get('s1', URL_A);
    assert.equal(second, first);
    assert.equal(fetchImpl.calls.length, 1);
  });

  test('simultaneous requests for the same story share one download', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const fetchImpl = makeFetch(async () => {
      await gate;
      return imageResponse();
    });
    const cache = new ImageCache({ fetchImpl });

    const pending = [cache.get('s1', URL_A), cache.get('s1', URL_A), cache.get('s1', URL_A)];
    release();
    const entries = await Promise.all(pending);

    assert.equal(fetchImpl.calls.length, 1);
    assert.equal(entries[0], entries[1]);
    assert.equal(entries[1], entries[2]);
    assert.equal(cache.inflight.size, 0, 'nothing is left in flight');
  });

  test('different story ids are downloaded separately', async () => {
    const fetchImpl = makeFetch();
    const cache = new ImageCache({ fetchImpl });
    await cache.get('s1', 'https://img.test/1.png');
    await cache.get('s2', 'https://img.test/2.png');
    assert.deepEqual(fetchImpl.calls.map((c) => c.url), ['https://img.test/1.png', 'https://img.test/2.png']);
  });

  test('accepts jpeg, png, webp, gif and avif, ignoring parameters such as a charset', async () => {
    const cache = new ImageCache({ fetchImpl: makeFetch((url) => imageResponse(PNG, { 'content-type': url.split('?')[1] })) });
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
      const entry = await cache.get(type, `https://img.test/x?${type}`);
      assert.equal(entry.error, undefined, type);
      assert.equal(entry.type, type);
    }
    assert.equal((await cache.get('upper', 'https://img.test/x?IMAGE/JPEG')).error, undefined, 'the check is case-insensitive');
    const withParams = await cache.get('params', 'https://img.test/x?image/jpeg; charset=binary');
    assert.equal(withParams.type, 'image/jpeg');
  });

  test('refuses anything that is not an allowed image type (html, svg, json, no type at all)', async () => {
    const cache = new ImageCache({ fetchImpl: makeFetch((url) => new Response('<html>', { headers: url.endsWith('?none') ? {} : { 'content-type': url.split('?')[1] } })) });
    for (const type of ['text/html', 'image/svg+xml', 'application/json', 'image/tiff', 'none']) {
      const entry = await cache.get(type, `https://img.test/x?${type}`);
      assert.match(entry.error, /^content type not allowed: /, type);
      assert.equal(entry.body, undefined);
    }
    assert.equal((await cache.get('html', 'https://img.test/x?text/html')).error, 'content type not allowed: text/html');
  });

  test('only http(s) URLs are ever requested', async () => {
    const fetchImpl = makeFetch();
    const cache = new ImageCache({ fetchImpl });
    for (const [i, url] of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://img.test/a.png', 'data:image/png;base64,AAAA', '//img.test/a.png', '/relative.png', '', undefined].entries()) {
      assert.deepEqual(await cache.get(`bad${i}`, url), { error: 'invalid URL' }, String(url));
    }
    assert.equal(fetchImpl.calls.length, 0);
    assert.ok((await cache.get('http', 'http://img.test/a.png')).type, 'plain http is fine');
  });

  test('HTTP errors become { error } entries instead of throwing', async () => {
    const cache = new ImageCache({ fetchImpl: makeFetch(() => new Response('nope', { status: 404 })) });
    assert.deepEqual(await cache.get('s1', URL_A), { error: 'HTTP 404' });
  });

  test('network errors become { error } entries instead of throwing', async () => {
    const cache = new ImageCache({
      fetchImpl: async () => {
        throw new Error('connect ECONNRESET');
      },
    });
    assert.deepEqual(await cache.get('s1', URL_A), { error: 'connect ECONNRESET' });
  });

  test('refuses images over 6 MB, by Content-Length or by what actually arrives', async () => {
    const declared = new ImageCache({ fetchImpl: makeFetch(() => imageResponse(PNG, { 'content-length': '6000001' })) });
    assert.deepEqual(await declared.get('s1', URL_A), { error: 'image too large' });

    const actual = new ImageCache({ fetchImpl: makeFetch(() => imageResponse(Buffer.alloc(6_000_001))) });
    assert.deepEqual(await actual.get('s1', URL_A), { error: 'image too large' });

    const fits = new ImageCache({ fetchImpl: makeFetch(() => imageResponse(Buffer.alloc(6_000_000), { 'content-length': '6000000' })) });
    assert.equal((await fits.get('s1', URL_A)).body.length, 6_000_000);
  });

  test('failures are remembered too: a broken image is not downloaded again', async () => {
    const fetchImpl = makeFetch(() => new Response('nope', { status: 503 }));
    const cache = new ImageCache({ fetchImpl });
    const first = await cache.get('s1', URL_A);
    const second = await cache.get('s1', URL_A);
    assert.deepEqual(second, { error: 'HTTP 503' });
    assert.equal(second, first);
    assert.equal(fetchImpl.calls.length, 1);
  });

  test('keeps the 120 most recently used images and forgets the rest', async () => {
    const fetchImpl = makeFetch();
    const cache = new ImageCache({ fetchImpl });
    const url = (i) => `https://img.test/${i}.png`;

    for (let i = 0; i < 120; i++) await cache.get(`id${i}`, url(i));
    assert.equal(cache.cache.size, 120);
    assert.equal(fetchImpl.calls.length, 120);

    await cache.get('id0', url(0)); // a hit: id0 becomes the most recently used
    assert.equal(fetchImpl.calls.length, 120);

    await cache.get('id120', url(120)); // one over the limit: the least recently used (id1) goes
    assert.equal(cache.cache.size, 120);
    assert.equal(fetchImpl.calls.length, 121);

    await cache.get('id0', url(0));
    assert.equal(fetchImpl.calls.length, 121, 'id0 survived because it was used recently');
    await cache.get('id1', url(1));
    assert.equal(fetchImpl.calls.length, 122, 'id1 had to be downloaded again');
  });
});

// ---------------------------------------------------------------- local pictures (offline fixtures)

describe('ImageCache: local pictures', () => {
  const setup = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livenews-img-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'ok.png'), PNG);
    fs.writeFileSync(path.join(dir, 'fake.png'), 'not really a picture');
    fs.writeFileSync(path.join(dir, 'note.txt'), 'hello');
    return dir;
  };
  const url = (...p) => pathToFileURL(path.join(...p)).href;

  test('reads a picture from an allowed folder, typed by its bytes, without any network', async (t) => {
    const dir = setup(t);
    const fetchImpl = makeFetch(() => {
      throw new Error('no network expected');
    });
    const entry = await new ImageCache({ fetchImpl, localRoots: () => [dir] }).get('s1', url(dir, 'ok.png'));
    assert.equal(entry.type, 'image/png');
    assert.deepEqual(entry.body, PNG);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test('accepts the roots as a list or a Set returned by a function', async (t) => {
    const dir = setup(t);
    assert.equal((await new ImageCache({ localRoots: [dir] }).get('a', url(dir, 'ok.png'))).type, 'image/png');
    assert.equal((await new ImageCache({ localRoots: () => new Set([dir]) }).get('b', url(dir, 'ok.png'))).type, 'image/png');
  });

  test('refuses files outside the allowed folders, non-picture names and files that are not pictures', async (t) => {
    const dir = setup(t);
    const cache = new ImageCache({ localRoots: () => [path.join(dir, 'sub')] });
    assert.deepEqual(await cache.get('x1', url(dir, 'ok.png')), { error: 'invalid URL' }, 'outside the root');
    const open = new ImageCache({ localRoots: () => [dir] });
    assert.deepEqual(await open.get('x2', url(dir, 'note.txt')), { error: 'invalid URL' });
    assert.deepEqual(await open.get('x3', url(dir, 'fake.png')), { error: 'content type not allowed: not an image' });
    assert.match((await open.get('x4', url(dir, 'missing.png'))).error, /ENOENT/);
    assert.deepEqual(await open.get('x5', url(dir, '..', 'ok.png')), { error: 'invalid URL' });
  });

  test('without local roots (the default) a file: URL is refused like any other non-http URL', async (t) => {
    const dir = setup(t);
    assert.deepEqual(await new ImageCache().get('d', url(dir, 'ok.png')), { error: 'invalid URL' });
  });
});

// Outbound requests for links found inside feeds: no request to the machine
// itself or its private network (on any redirect hop), and bodies cut at a byte
// cap while they stream, never after they have been buffered.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, guardedFetch, isPrivateAddress, readCapped } from '../server/net.js';
import { NewsDesk } from '../server/news.js';
import { ImageCache } from '../server/images.js';

const quiet = { info() {}, warn() {}, error() {} };
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
const privateDns = async () => [{ address: '10.0.0.7', family: 4 }];

/** An endless chunked body (no Content-Length) that counts how much was pulled. */
function endless(chunk = 64 * 1024) {
  const stats = { pulled: 0, cancelled: false };
  const body = new ReadableStream({
    pull(controller) {
      stats.pulled += chunk;
      controller.enqueue(new Uint8Array(chunk).fill(60)); // '<'
    },
    cancel() {
      stats.cancelled = true;
    },
  });
  return { body, stats };
}

describe('net: private addresses', () => {
  test('loopback, private, link-local, CGNAT, multicast and mapped forms are private; public ones are not', () => {
    for (const ip of ['127.0.0.1', '127.8.8.8', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'not an ip']) {
      assert.equal(isPrivateAddress(ip), true, ip);
    }
    for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2001:4860:4860::8888', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(ip), false, ip);
  });

  test('assertPublicUrl refuses local names, literal private addresses, credentials and other schemes', async () => {
    for (const url of ['http://localhost:8080/api/next', 'http://127.0.0.1:8324/api/next', 'http://[::1]/x', 'http://169.254.169.254/latest/meta-data', 'http://intranet/x', 'http://printer.local/x', 'file:///etc/passwd', 'ftp://a.test/x', 'https://user:pass@a.test/x', 'not a url']) {
      await assert.rejects(assertPublicUrl(url, { lookup: publicDns }), undefined, url);
    }
    await assert.rejects(assertPublicUrl('https://sneaky.test/x', { lookup: privateDns }), /private/);
    assert.equal((await assertPublicUrl('https://news.test/x', { lookup: publicDns })).hostname, 'news.test');
    // Unresolvable here (behind an egress proxy): the request itself decides.
    const failing = async () => {
      throw new Error('ENOTFOUND');
    };
    assert.equal((await assertPublicUrl('https://news.test/x', { lookup: failing })).hostname, 'news.test');
  });

  test('guardedFetch checks every redirect hop: a public page that redirects to loopback is never followed', async () => {
    const asked = [];
    const fetchImpl = async (url) => {
      asked.push(url);
      if (url === 'https://news.test/a') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8324/api/next' } });
      return new Response('ok');
    };
    await assert.rejects(guardedFetch(fetchImpl, 'https://news.test/a', { lookup: publicDns }), /private/);
    assert.deepEqual(asked, ['https://news.test/a']);
  });

  test('guardedFetch follows a few public redirects by hand, then gives up', async () => {
    let n = 0;
    const loop = async (url) => new Response(null, { status: 301, headers: { location: `${url}x` } });
    await assert.rejects(guardedFetch(loop, 'https://news.test/a', { lookup: publicDns, maxRedirects: 3 }), /too many redirects/);
    const ok = async (url) => (n++ < 2 ? new Response(null, { status: 302, headers: { location: '/next' } }) : new Response('done'));
    const { res, url } = await guardedFetch(ok, 'https://news.test/a', { lookup: publicDns });
    assert.equal(await res.text(), 'done');
    assert.equal(url, 'https://news.test/next');
  });

  test('the operator\'s own feed list may point at a private host (allowPrivate), links in feeds may not', async () => {
    const fetchImpl = async () => new Response('<rss/>');
    const { res } = await guardedFetch(fetchImpl, 'http://192.168.1.20/feed.xml', { allowPrivate: true });
    assert.equal(await res.text(), '<rss/>');
    await assert.rejects(guardedFetch(fetchImpl, 'file:///etc/passwd', { allowPrivate: true }), /http/);
  });
});

describe('net: streaming byte caps', () => {
  test('a chunked body with no Content-Length is cut at the cap while it streams (truncate: an HTML head)', async () => {
    const { body, stats } = endless();
    const buf = await readCapped(new Response(body), 300_000, { truncate: true });
    assert.equal(buf.length, 300_000);
    assert.ok(stats.pulled < 1_000_000, `pulled ${stats.pulled} bytes`);
    assert.equal(stats.cancelled, true);
  });

  test('without truncate a body over the cap is an error, raised before the rest is read', async () => {
    const { body, stats } = endless();
    await assert.rejects(readCapped(new Response(body), 200_000, { tooLarge: 'image too large' }), /image too large/);
    assert.ok(stats.pulled < 1_000_000);
  });

  test('a declared Content-Length over the cap fails without reading anything', async () => {
    const { body, stats } = endless();
    const res = new Response(body, { headers: { 'content-length': '999999999' } });
    await assert.rejects(readCapped(res, 1000), /too large/);
    assert.ok(stats.pulled <= 64 * 1024 * 2);
  });

  test('a small body comes back whole', async () => {
    assert.equal((await readCapped(new Response('hello'), 100)).toString(), 'hello');
  });

  test('NewsDesk.fetchText keeps only the cap of an endless article page', async () => {
    const { body, stats } = endless();
    const desk = new NewsDesk({ log: quiet, lookup: publicDns, fetchImpl: async () => new Response(body) });
    const html = await desk.fetchText('https://news.test/page', { maxBytes: 100_000 });
    assert.equal(html.length, 100_000);
    assert.ok(stats.pulled < 500_000);
  });

  test('ImageCache refuses an endless picture without buffering it', async () => {
    const { body, stats } = endless();
    const cache = new ImageCache({ log: quiet, lookup: publicDns, fetchImpl: async () => new Response(body, { headers: { 'content-type': 'image/png' } }) });
    const entry = await cache.get('s1', 'https://img.test/huge.png');
    assert.match(entry.error, /too large/);
    assert.ok(stats.pulled < 8_000_000, `pulled ${stats.pulled}`);
  });
});

describe('net: feed links never reach the machine itself', () => {
  test('an article link pointing at the channel\'s own API is not fetched for a picture', async () => {
    const asked = [];
    const desk = new NewsDesk({ log: quiet, lookup: publicDns, fetchImpl: async (url) => (asked.push(url), new Response('<html></html>')) });
    const story = { id: 'sabc0000001', title: 'x', link: 'http://127.0.0.1:8324/api/next', source: 'Evil', image: null };
    assert.equal(await desk.resolveImage(story), null);
    assert.deepEqual(asked, []);
  });

  test('a picture URL on a private host is refused by the image cache, a file: URL from a remote feed too', async () => {
    const asked = [];
    const cache = new ImageCache({ log: quiet, lookup: privateDns, fetchImpl: async (url) => (asked.push(url), new Response('x', { headers: { 'content-type': 'image/png' } })) });
    assert.match((await cache.get('s1', 'https://intranet-cam.test/a.png')).error, /private/);
    assert.match((await cache.get('s2', 'file:///etc/passwd.png')).error, /invalid URL/);
    assert.deepEqual(asked, []);
  });

  test('fetchText refuses anything that is not http(s)', async () => {
    const desk = new NewsDesk({ log: quiet, lookup: publicDns, fetchImpl: async () => new Response('x') });
    await assert.rejects(desk.fetchText('file:///etc/passwd'), /not an http/);
    await assert.rejects(desk.fetchText('gopher://a.test/'), /not an http/);
  });
});

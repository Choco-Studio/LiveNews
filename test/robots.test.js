// The outlets' robots.txt (server/robots.js, RFC 9309) and the news desk's readers obeying it (server/news.js): the
// group that applies to us, the longest-match rule, the 4xx / 5xx answers, the day's cache in memory and on disk, the
// Crawl-delay, and the article page, its picture and its AMP page never opened when the file keeps them from us (the
// story keeps its feed's text and pictures; the article cache keeps only the feed's text).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Robots, RobotsRefusal, USER_AGENT, ROBOTS_TOKEN, parseRobots, rulesFor, isAllowed, agentIsUs, namedAgents, TTL_MS, RETRY_MS, SHORT_MS, CLOSED_MS } from '../server/robots.js';
import { NewsDesk, pageUrl } from '../server/news.js';
import { ArticleCache } from '../server/articlecache.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => fs.readFileSync(path.join(here, 'fixtures', 'robots', name), 'utf8');
const quiet = { info() {}, warn() {}, error() {} };
const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'robots-'));

/** A fake web: robots.txt per origin (a fixture name, a status number, or a function), pages by URL; every request logged. */
function web({ robots = {}, pages = {}, redirects = {} } = {}) {
  const asked = [];
  const agents = [];
  const fetchImpl = async (url, opts = {}) => {
    asked.push(url);
    agents.push(opts.headers?.['user-agent']);
    const u = new URL(url);
    if (redirects[url]) return new Response('', { status: 301, headers: { location: redirects[url] } });
    if (u.pathname === '/robots.txt') {
      const spec = robots[u.origin];
      if (spec === undefined) return new Response('not found', { status: 404 });
      if (typeof spec === 'function') return spec();
      if (typeof spec === 'number') return new Response('x', { status: spec });
      return new Response(spec.endsWith('.txt') ? fixture(spec) : spec, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    const page = pages[url];
    if (page === undefined) return new Response('missing', { status: 404 });
    if (typeof page === 'number') return new Response('x', { status: page });
    return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
  };
  fetchImpl.asked = asked;
  fetchImpl.agents = agents;
  fetchImpl.pages = () => asked.filter((u) => !u.endsWith('/robots.txt'));
  return fetchImpl;
}

const ARTICLE = (words = 'The council voted on Tuesday to close the old harbour bridge to cars from next spring.') =>
  `<!doctype html><html><head><title>t</title><meta property="og:image" content="https://cdn.outlet.test/big.jpg"><meta property="og:image:width" content="1600"></head><body><article>${Array.from({ length: 6 }, (_, i) => `<p>${words} Engineers said phase ${i + 1} of the repairs would take ${i + 2} months and cost far more than planned.</p>`).join('')}</article></body></html>`;

function clock(start = Date.parse('2026-10-17T12:00:00Z')) {
  let t = start;
  const c = () => t;
  c.advance = (ms) => (t += ms);
  return c;
}

describe('robots.txt: the group that applies to us', () => {
  test('no group names us: the "*" group is obeyed, the named bots\' groups are not', () => {
    const r = rulesFor(parseRobots(fixture('outlet.txt')));
    assert.equal(r.agent, '*');
    assert.ok(r.rules.some((x) => x.path === '/search/' && !x.allow));
    assert.ok(!r.rules.some((x) => x.path === '/' && !x.allow), 'the GPTBot/CCBot "Disallow: /" is theirs, not ours');
  });

  test('a group naming GLOBIT24 (or GLOBIT) wins over "*", and both of our groups are combined, with their Crawl-delay', () => {
    const parsed = parseRobots(fixture('ours.txt'));
    const r = rulesFor(parsed);
    assert.equal(r.agent, ROBOTS_TOKEN);
    assert.deepEqual(r.rules.map((x) => `${x.allow ? 'A' : 'D'} ${x.path}`), ['D /sport/', 'A /sport/results', 'D /culture/*/gallery$']);
    assert.equal(r.delay, 2);
    assert.equal(isAllowed(r.rules, '/members/area').allowed, true, 'the "*" group no longer applies once one names us');
    assert.equal(isAllowed(r.rules, '/sport/football').allowed, false);
    assert.equal(isAllowed(r.rules, '/sport/results/today').allowed, true);
    assert.equal(isAllowed(r.rules, '/culture/2026/gallery').allowed, false);
    assert.equal(isAllowed(r.rules, '/culture/2026/gallery/2').allowed, true, '"$" anchors the end');
    // the rule before any user-agent line belongs to no group
    assert.equal(isAllowed(r.rules, '/orphan-rule-before-any-group').allowed, true);
  });

  test('tokens that look like ours, or like words of our user-agent header, are not ours: exact tokens, never substrings', () => {
    const parsed = parseRobots(fixture('lookalikes.txt'));
    for (const t of namedAgents(parsed).filter((a) => a !== '*')) assert.equal(agentIsUs(t), false, t);
    const r = rulesFor(parsed);
    assert.equal(r.agent, '*');
    assert.equal(isAllowed(r.rules, '/world/story').allowed, true);
    assert.equal(isAllowed(r.rules, '/private/x').allowed, false);
    assert.equal(r.delay, 1);
    for (const t of ['GLOBIT24', 'globit24', 'GLOBIT24/1.0', 'GLOBIT-24', 'Globit', 'GLOBIT']) assert.equal(agentIsUs(t), true, t);
  });

  test('a file whose groups all name other bots allows us everything; so does a file with no group at all', () => {
    assert.equal(rulesFor(parseRobots(fixture('others-only.txt'))).agent, null);
    assert.equal(isAllowed(rulesFor(parseRobots(fixture('others-only.txt'))).rules, '/anything').allowed, true);
    assert.equal(isAllowed(rulesFor(parseRobots('Sitemap: https://x.test/s.xml\n')).rules, '/a').allowed, true);
    assert.equal(isAllowed(rulesFor(parseRobots('<html><body>Soft 404</body></html>')).rules, '/a').allowed, true);
  });
});

describe('robots.txt: the longest match decides', () => {
  const rules = rulesFor(parseRobots(fixture('outlet.txt'))).rules;
  const allowed = (p) => isAllowed(rules, p).allowed;

  test('Allow and Disallow by length; an Allow wins a tie; an empty Disallow is no rule', () => {
    assert.equal(allowed('/search/'), true, 'Allow: /search/$ is as long as Disallow: /search/ and wins');
    assert.equal(allowed('/search/?q=x'), false);
    assert.equal(allowed('/news/live/123'), false);
    assert.equal(allowed('/news/live/summary-today'), true, 'the longer Allow wins');
    assert.equal(allowed('/news/world-12345'), true);
    assert.equal(isAllowed([{ allow: false, path: '/a' }, { allow: true, path: '/a' }], '/a/b').allowed, true);
  });

  test('"*" matches any run, "$" the end, and the query counts', () => {
    assert.equal(allowed('/preview/x/y'), false);
    assert.equal(allowed('/data/feed.json'), false);
    assert.equal(allowed('/data/feed.json?x=1'), true, '".json$" only at the end');
    assert.equal(allowed('/news/a?share=fb'), false);
    assert.equal(allowed('/news/a?x=1&share=fb'), false);
    assert.equal(allowed('/news/a?x=1'), true);
    assert.equal(allowed('/apiary'), false, '"/api" is a prefix');
  });

  test('/robots.txt itself is always allowed, and percent escapes compare in any case', () => {
    assert.equal(isAllowed([{ allow: false, path: '/' }], '/robots.txt').allowed, true);
    const r = rulesFor(parseRobots('User-agent: *\nDisallow: /café\nDisallow: /a%2fb\n')).rules;
    assert.equal(isAllowed(r, '/caf%C3%A9/menu').allowed, false);
    assert.equal(isAllowed(r, '/caf%c3%a9').allowed, false);
    assert.equal(isAllowed(r, '/A%2Fb').allowed, true, 'paths are case-sensitive, escapes are not');
    assert.equal(isAllowed(r, '/a%2Fb').allowed, false);
  });

  test('a hostile pattern of many wildcards cannot stall the desk', () => {
    const r = [{ allow: false, path: `/${'*a'.repeat(40)}b` }];
    const t0 = Date.now();
    assert.equal(isAllowed(r, `/${'a'.repeat(3000)}`).allowed, true);
    assert.ok(Date.now() - t0 < 500, `${Date.now() - t0} ms`);
  });
});

describe('robots.txt: reading the file', () => {
  test('one read per origin at a time, kept a day in memory, read again after it', async () => {
    const now = clock();
    const f = web({ robots: { 'https://outlet.test': 'outlet.txt' } });
    const r = new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet });
    const all = await Promise.all(['/a', '/b', '/search/x', '/c'].map((p) => r.check(`https://outlet.test${p}`)));
    assert.deepEqual(all.map((c) => c.allowed), [true, true, false, true]);
    assert.equal(f.asked.length, 1);
    now.advance(TTL_MS - 1000);
    await r.check('https://outlet.test/d');
    assert.equal(f.asked.length, 1);
    now.advance(2000);
    await r.check('https://outlet.test/d');
    assert.equal(f.asked.length, 2);
    assert.equal(f.agents[0], USER_AGENT);
  });

  test('a 4xx means everything is allowed (404 for the day, a 403 for the hour); a 429 counts as unreachable', async () => {
    const now = clock();
    const f = web({ robots: { 'https://gone.test': 404, 'https://shield.test': 403, 'https://slow.test': 429 } });
    const r = new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet });
    assert.equal((await r.check('https://gone.test/x')).reason, 'no-robots');
    assert.equal((await r.check('https://shield.test/x')).allowed, true);
    assert.equal((await r.check('https://slow.test/x')).reason, 'unreachable');
    now.advance(SHORT_MS + 1000);
    await r.check('https://gone.test/x');
    await r.check('https://shield.test/x');
    assert.equal(f.asked.filter((u) => u.startsWith('https://gone.test')).length, 1);
    assert.equal(f.asked.filter((u) => u.startsWith('https://shield.test')).length, 2);
  });

  test('a 5xx or a network failure disallows everything until the next try', async () => {
    const now = clock();
    let down = true;
    const f = web({ robots: { 'https://flaky.test': () => (down ? new Response('oops', { status: 503 }) : new Response('User-agent: *\nDisallow: /x/\n')), 'https://dead.test': () => Promise.reject(new Error('ECONNRESET')) } });
    const r = new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet });
    assert.equal((await r.check('https://flaky.test/story')).reason, 'unreachable');
    assert.equal((await r.check('https://dead.test/story')).reason, 'unreachable');
    await assert.rejects(r.gate('https://flaky.test/story'), (e) => e instanceof RobotsRefusal && e.reason === 'unreachable');
    down = false;
    now.advance(RETRY_MS - 1000);
    assert.equal((await r.check('https://flaky.test/story')).allowed, false, 'not asked again before the retry time');
    now.advance(2000);
    assert.equal((await r.check('https://flaky.test/story')).allowed, true);
    assert.equal((await r.check('https://flaky.test/x/1')).allowed, false);
  });

  test('redirects are followed (five at most) to the file on another host', async () => {
    const f = web({ robots: { 'https://www.moved.test': 'closed.txt' }, redirects: { 'https://moved.test/robots.txt': 'https://www.moved.test/robots.txt' } });
    const r = new Robots({ fetchImpl: f, lookup: publicDns, log: quiet });
    assert.equal((await r.check('https://moved.test/a')).allowed, false);
    const loop = web({ redirects: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`https://loop${i ? i : ''}.test/robots.txt`, `https://loop${i + 1}.test/robots.txt`])) });
    const r2 = new Robots({ fetchImpl: loop, lookup: publicDns, log: quiet });
    assert.equal((await r2.check('https://loop.test/a')).reason, 'unreachable');
  });

  test('the disk cache keeps only our rules, survives a restart, and is ignored once expired', async () => {
    const dir = tmp();
    const now = clock();
    const f = web({ robots: { 'https://outlet.test': 'outlet.txt' } });
    await new Robots({ fetchImpl: f, now, dir, lookup: publicDns, log: quiet }).check('https://outlet.test/a');
    const files = fs.readdirSync(dir);
    assert.deepEqual(files, ['https_outlet.test.json']);
    const kept = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
    assert.equal(kept.agent, '*');
    assert.ok(!kept.rules.some((x) => x.path === '/' && !x.allow), 'the other bots\' rules are not kept');
    assert.ok(fs.statSync(path.join(dir, files[0])).size < 4000);
    const again = new Robots({ fetchImpl: f, now, dir, lookup: publicDns, log: quiet });
    assert.equal((await again.check('https://outlet.test/search/x')).allowed, false);
    assert.equal(f.asked.length, 1, 'a restart reads the disk cache, not the outlet');
    now.advance(TTL_MS + 1);
    await new Robots({ fetchImpl: f, now, dir, lookup: publicDns, log: quiet }).check('https://outlet.test/a');
    assert.equal(f.asked.length, 2);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('robots.txt: Crawl-delay and servers that refuse us', () => {
  test('our page requests to an origin are spaced by its Crawl-delay; a turn too far off is left for later', async () => {
    const now = clock();
    const slept = [];
    const f = web({ robots: { 'https://ours.test': 'ours.txt' } });
    const r = new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet, maxWaitMs: 3000, sleep: async (ms) => (slept.push(ms), now.advance(ms)) });
    await r.gate('https://ours.test/news/1');
    await r.gate('https://ours.test/news/2');
    assert.deepEqual(slept, [2000]);
    // two more at once: the first waits its turn, the next would wait more than 3 s
    const t = now();
    const third = r.gate('https://ours.test/news/3');
    await assert.rejects(r.gate('https://ours.test/news/4', { maxWaitMs: 1000 }), (e) => e.reason === 'delay' && e.retryAt > t);
    await third;
  });

  test('a page answering 403 closes the origin for a while; robots.txt is not asked meanwhile', async () => {
    const now = clock();
    const f = web({ robots: { 'https://shield.test': 403 }, pages: { 'https://shield.test/a': 403 } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet, robots: new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet }) });
    await assert.rejects(d.fetchText('https://shield.test/a'), /HTTP 403/);
    await assert.rejects(d.fetchText('https://shield.test/b'), (e) => e instanceof RobotsRefusal && e.reason === 'closed');
    assert.deepEqual(f.pages(), ['https://shield.test/a']);
    now.advance(CLOSED_MS + 1);
    await assert.rejects(d.fetchText('https://shield.test/b'), /HTTP 404/);
  });
});

describe('the news desk obeys robots.txt', () => {
  const story = (extra = {}) => ({
    id: 'srobots00001',
    title: 'Harbour bridge to close to cars',
    summary: 'The council voted to close the bridge.',
    link: 'https://outlet.test/search/harbour-bridge',
    source: 'Outlet',
    category: 'world',
    weight: 1,
    published: Date.now(),
    image: 'https://cdn.outlet.test/feed-small.jpg',
    imageWidth: 300,
    ...extra,
  });

  test('a disallowed article page is never fetched, for the text or the picture: the story keeps its feed\'s text and picture', async () => {
    const f = web({ robots: { 'https://outlet.test': 'outlet.txt' }, pages: { 'https://outlet.test/search/harbour-bridge': ARTICLE() } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    const s = story({ feedText: 'The council voted on Tuesday to close the bridge. '.repeat(8) });
    d.stories.set(s.id, s);
    await d.readArticles([s]);
    await d.findPictures([s]);
    assert.deepEqual(f.pages(), []);
    assert.equal(f.asked.length, 1, 'robots.txt once, nothing else');
    assert.equal(s.body, undefined);
    assert.equal(s.pageRefused, 'robots');
    assert.equal(s.image, 'https://cdn.outlet.test/feed-small.jpg');
    assert.ok(s.feedText);
    assert.equal(d.deskView().find((x) => x.id === s.id)?.pageRefused, 'robots');
    // a later pass does not ask again
    s.bodyChecked = false;
    s.imageChecked = false;
    await d.readArticle(s);
    await d.resolveImage(s);
    assert.equal(f.asked.length, 1);
  });

  test('an allowed page is read as before, with our user-agent; the robots.txt read is shared by the text and the picture', async () => {
    const f = web({ robots: { 'https://outlet.test': 'outlet.txt' }, pages: { 'https://outlet.test/news/harbour-bridge': ARTICLE() } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    const s = story({ link: 'https://outlet.test/news/harbour-bridge' });
    d.stories.set(s.id, s);
    await d.readArticle(s);
    await d.resolveImage(s);
    assert.ok(s.body && s.body.length > 100);
    assert.equal(s.image, 'https://cdn.outlet.test/big.jpg');
    assert.equal(f.asked.filter((u) => u.endsWith('/robots.txt')).length, 1);
    assert.ok(f.agents.every((a) => a === USER_AGENT));
  });

  test('the feed\'s tracking tags are dropped: the article is opened at its own address, which robots.txt leaves open', async () => {
    assert.equal(pageUrl('https://www.aj.test/news/2026/10/17/story?traffic_source=rss'), 'https://www.aj.test/news/2026/10/17/story');
    assert.equal(pageUrl('https://www.bbc.test/news/articles/c1?at_medium=RSS&at_campaign=rss'), 'https://www.bbc.test/news/articles/c1');
    assert.equal(pageUrl('https://www.dw.test/en/x/a-1?maca=en-rss-en-world-4025-rdf&page=2#top'), 'https://www.dw.test/en/x/a-1?page=2');
    assert.equal(pageUrl('https://o.test/a?id=7&utm_source=x'), 'https://o.test/a?id=7');
    const f = web({ robots: { 'https://www.aj.test': 'tagged.txt' }, pages: { 'https://www.aj.test/news/2026/10/17/story': ARTICLE() } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    const s = story({ link: 'https://www.aj.test/news/2026/10/17/story?traffic_source=rss' });
    assert.equal((await d.robots.check(s.link)).allowed, false, 'the tagged copy is kept from crawlers');
    await d.readArticle(s);
    assert.deepEqual(f.pages(), ['https://www.aj.test/news/2026/10/17/story']);
    assert.ok(s.body);
    assert.equal(s.link, 'https://www.aj.test/news/2026/10/17/story?traffic_source=rss', 'the story keeps the feed\'s link');
  });

  test('a redirect to a disallowed path is not followed; an AMP page robots.txt keeps is skipped, the article stays read', async () => {
    const f = web({
      robots: { 'https://outlet.test': 'outlet.txt' },
      redirects: { 'https://outlet.test/news/short': 'https://outlet.test/preview/full' },
      pages: { 'https://outlet.test/preview/full': ARTICLE(), 'https://outlet.test/news/amp-story': `<html><head><link rel="amphtml" href="https://outlet.test/api/amp/story"></head><body><p>x</p></body></html>` },
    });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    const a = story({ id: 'sredirect001', link: 'https://outlet.test/news/short' });
    await d.readArticle(a);
    assert.equal(a.pageRefused, 'robots');
    assert.ok(!f.asked.includes('https://outlet.test/preview/full'));
    const b = story({ id: 'samp00000001', link: 'https://outlet.test/news/amp-story', image: null, imageWidth: undefined });
    await d.resolveImage(b);
    assert.ok(f.asked.includes('https://outlet.test/news/amp-story'));
    assert.ok(!f.asked.includes('https://outlet.test/api/amp/story'));
    assert.equal(b.pageRefused, undefined);
  });

  test('robots.txt unreachable: the page waits for the next pass, then is read once the file answers', async () => {
    const now = clock();
    let up = false;
    const f = web({ robots: { 'https://outlet.test': () => (up ? new Response('User-agent: *\nDisallow: /search/\n') : new Response('x', { status: 500 })) }, pages: { 'https://outlet.test/news/x': ARTICLE() } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet, robots: new Robots({ fetchImpl: f, now, lookup: publicDns, log: quiet }) });
    const s = story({ link: 'https://outlet.test/news/x' });
    await d.readArticle(s);
    assert.equal(s.body, undefined);
    assert.equal(s.bodyChecked, false, 'tried again at the next pass');
    assert.equal(s.pageRefused, undefined);
    assert.deepEqual(f.pages(), []);
    up = true;
    now.advance(RETRY_MS + 1);
    await d.readArticle(s);
    assert.ok(s.body);
  });

  test('the feeds themselves are read without robots.txt', async () => {
    const f = web({ robots: { 'https://feeds.outlet.test': 'closed.txt' }, pages: { 'https://feeds.outlet.test/rss.xml': '<rss><channel><item><title>A</title><link>https://outlet.test/news/a</link></item></channel></rss>' } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    assert.match(await d.readFeed('https://feeds.outlet.test/rss.xml'), /<rss>/);
    assert.deepEqual(f.asked, ['https://feeds.outlet.test/rss.xml']);
  });

  test('the user-agent carries the channel\'s name and the repository, never an e-mail', () => {
    assert.match(USER_AGENT, /GLOBIT24\/\d/);
    assert.match(USER_AGENT, /\+https:\/\/github\.com\/choco-studio\/livenews/);
    assert.doesNotMatch(USER_AGENT, /@|mailto/i);
    assert.equal(agentIsUs(USER_AGENT.match(/GLOBIT24\/[\d.]+/)[0]), true);
  });
});

describe('the article cache keeps only the feed\'s text of a page robots.txt keeps from us', () => {
  const link = 'https://outlet.test/search/harbour-bridge';
  const feedText = 'The council voted on Tuesday to close the harbour bridge to cars from next spring, the feed says. '.repeat(3);

  test('a refused story with a feed text: the feed\'s text, even over an article text kept before', () => {
    const dir = tmp();
    const cache = new ArticleCache({ dir, log: quiet });
    const body = 'An article text read before robots.txt was consulted, long enough to count as the outlet\'s words. '.repeat(3);
    assert.equal(cache.save({ link, source: 'Outlet', body, bodyVia: 'paragraphs' }), 'article');
    assert.equal(cache.save({ link, source: 'Outlet', body, feedText, pageRefused: 'robots' }), 'feed');
    assert.equal(cache.read(link).via, 'feed');
    assert.equal(cache.text(link), feedText.trim());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a refused story without a feed text: an article text kept before is removed, nothing new is kept', () => {
    const dir = tmp();
    const cache = new ArticleCache({ dir, log: quiet });
    cache.save({ link, source: 'Outlet', body: 'Article words kept before the outlet\'s robots.txt was read by the desk, long enough. '.repeat(3) });
    assert.ok(cache.text(link));
    assert.equal(cache.save({ link, source: 'Outlet', summary: 'short', pageRefused: 'robots' }), null);
    assert.equal(cache.read(link), null);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('end to end: the desk refuses the page, the cache keeps the feed\'s text', async () => {
    const dir = tmp();
    const f = web({ robots: { 'https://outlet.test': 'outlet.txt' }, pages: { [link]: ARTICLE() } });
    const d = new NewsDesk({ fetchImpl: f, lookup: publicDns, log: quiet });
    const s = { id: 'scache000001', title: 'Bridge', summary: 'Short.', link, source: 'Outlet', feedText, published: Date.now(), image: null };
    await d.readArticle(s);
    const cache = new ArticleCache({ dir, log: quiet });
    assert.equal(cache.save(s), 'feed');
    assert.equal(cache.read(link).via, 'feed');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

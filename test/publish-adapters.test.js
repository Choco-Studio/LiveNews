// The networks' adapters (server/publish/adapters/; docs/publishing/platforms.md): one interface, a dry run that
// describes the documented requests and sends nothing, credentials only from the environment and never in a plan, a
// log or an error, the AI label on every upload that has a field for it, rate limits and retries that honour the
// network's Retry-After.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ADAPTERS, makeAdapter, credentialStatus } from '../server/publish/adapters/index.js';
import { redact, withRetries, RateLimiter, PublishError, readResponse } from '../server/publish/adapters/base.js';
import { videoResource } from '../server/publish/adapters/youtube.js';
import { tiktokCaption } from '../server/publish/adapters/tiktok.js';
import { oauth1Header } from '../server/publish/adapters/x.js';
import { linkFacets, blueskyRecord } from '../server/publish/adapters/bluesky.js';
import { telegramHtml } from '../server/publish/adapters/telegram.js';

const SECRET = 'sk-THIS-IS-A-FAKE-SECRET-1234567890';
const ENV = Object.fromEntries(Object.values(ADAPTERS).flatMap((A) => A.env).map((k) => [k, `${SECRET}-${k}`]));
ENV.PUBLIC_MEDIA_BASE_URL = 'https://media.example.org/clips';
const noFetch = () => {
  throw new Error('a dry run must not touch the network');
};
const CLIP = { id: 'c1', kind: 'clip', platform: 'youtube', format: 'vertical', title: 'Barn owls move into Manhattan', text: 'AI-generated: Barn owls move into Manhattan.', description: 'A clip.', hashtags: ['owls', 'nyc'], tags: ['GLOBIT 24'], links: [{ label: 'NPR', url: 'https://www.npr.org/owls', title: 'Owls', description: 'Owls in the park' }], media: { video: '/nonexistent/clip.mp4', duration: 30 }, source: { programId: 'cosmos' }, disclosure: { youtube: { containsSyntheticMedia: true }, tiktok: { is_aigc: true }, instagram: { is_ai_generated: true } } };

test('every network has an adapter, its variables and a dry run that sends nothing and shows no secret', async () => {
  for (const id of Object.keys(ADAPTERS)) {
    const a = makeAdapter(id, { env: ENV, fetchImpl: noFetch, dryRun: true });
    assert.ok(a.configured(), id);
    const r = await a.publish({ ...CLIP, platform: id });
    assert.equal(r.ok, true, id);
    assert.equal(r.dryRun, true, id);
    assert.ok(Array.isArray(r.requests) && r.requests.length >= 1, id);
    assert.ok(!JSON.stringify(r).includes(SECRET), `${id}: a secret in the dry run`);
    for (const q of r.requests) if (q.url && !q.url.startsWith('<')) assert.match(q.url, /^https:\/\//, `${id}: ${q.url}`);
  }
});

test('dry run is the default; live without credentials refuses and names what is missing (never the values)', async () => {
  const a = makeAdapter('youtube', { env: {}, fetchImpl: noFetch });
  assert.equal(a.dryRun, true);
  const live = makeAdapter('youtube', { env: {}, fetchImpl: noFetch, dryRun: false });
  const r = await live.publish(CLIP);
  assert.equal(r.ok, false);
  assert.match(r.error, /YOUTUBE_CLIENT_ID/);
  const status = credentialStatus({ YOUTUBE_CLIENT_ID: SECRET });
  assert.deepEqual(status.youtube.missing, ['YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN']);
  assert.ok(!JSON.stringify(status).includes(SECRET));
});

test('redact: every secret value, bearer tokens, bot tokens and credential fields', () => {
  const r = redact({ authorization: 'Bearer abcdefghijklmnop', url: `https://api.telegram.org/bot123456:${'A'.repeat(30)}/sendMessage`, nested: [`key=${SECRET}`], token: 'x' }, [SECRET]);
  const s = JSON.stringify(r);
  assert.ok(!s.includes(SECRET) && !s.includes('abcdefghijklmnop') && !s.includes('A'.repeat(30)));
  assert.equal(r.token, '<redacted>');
});

test('YouTube: the synthetic-media flag on, title and description within the limits, the Shorts category', () => {
  const v = videoResource({ ...CLIP, title: 'x'.repeat(150), description: 'é'.repeat(4000), tags: Array.from({ length: 80 }, (_, i) => `tag number ${i}`) });
  assert.equal(v.status.containsSyntheticMedia, true);
  assert.equal(v.status.selfDeclaredMadeForKids, false);
  assert.equal(v.snippet.title.length, 100);
  assert.ok(Buffer.byteLength(v.snippet.description, 'utf8') <= 5000);
  assert.ok(v.snippet.tags.join(',').length <= 500);
  assert.equal(v.snippet.categoryId, '28');
});

test('TikTok: the AI-generated label, the owner chooses who sees it, the inbox route by default', () => {
  const a = makeAdapter('tiktok', { env: ENV, fetchImpl: noFetch });
  assert.equal(a.mode(), 'inbox');
  assert.equal(a.postInfo(CLIP).is_aigc, true);
  assert.match(String(a.postInfo(CLIP).privacy_level), /owner/);
  assert.ok(a.plan(CLIP).some((s) => /inbox\/video\/init/.test(s.url)));
  const d = makeAdapter('tiktok', { env: { ...ENV, TIKTOK_MODE: 'direct' }, fetchImpl: noFetch });
  assert.ok(d.plan(CLIP).find((s) => s.step === 'init-direct').body.post_info.is_aigc);
  assert.ok(tiktokCaption({ text: 'y'.repeat(3000) }).length <= 2200);
});

test('Instagram: a Reel from a public URL with the AI label', () => {
  const a = makeAdapter('instagram', { env: ENV, fetchImpl: noFetch });
  const s = JSON.stringify(a.plan({ ...CLIP, platform: 'instagram' }));
  assert.match(s, /REELS/);
  assert.match(s, /is_ai_generated/);
  assert.match(s, /media_publish/);
});

test('X: OAuth 1.0a signature over the method, the URL and the sorted, percent-encoded parameters', () => {
  const args = { method: 'GET', url: 'https://api.x.com/2/media/upload?command=STATUS&media_id=12 3!', key: 'ck', secret: 'cs', token: 'at', tokenSecret: 'as', nonce: 'n0nce', timestamp: 1700000000 };
  const h = oauth1Header(args);
  const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  const params = { command: 'STATUS', media_id: '12 3!', oauth_consumer_key: 'ck', oauth_nonce: 'n0nce', oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: '1700000000', oauth_token: 'at', oauth_version: '1.0' };
  const norm = Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&');
  const base = `GET&${pct('https://api.x.com/2/media/upload')}&${pct(norm)}`;
  const sig = crypto.createHmac('sha1', 'cs&as').update(base).digest('base64');
  assert.ok(h.startsWith('OAuth '));
  assert.ok(h.includes(`oauth_signature="${pct(sig)}"`), h);
});

test('Bluesky: link facets over UTF-8 byte ranges, the article as a link card', () => {
  const text = 'AI-generated: Café owls — see https://example.org/owls. (via NPR)';
  const f = linkFacets(text);
  assert.equal(f.length, 1);
  const bytes = Buffer.from(text, 'utf8');
  assert.equal(bytes.subarray(f[0].index.byteStart, f[0].index.byteEnd).toString('utf8'), 'https://example.org/owls');
  const rec = blueskyRecord({ ...CLIP, text }, Date.parse('2026-10-17T10:00:00Z'));
  assert.equal(rec.embed.external.uri, 'https://www.npr.org/owls');
  assert.equal(rec.createdAt, '2026-10-17T10:00:00.000Z');
});

test('Telegram: the disclosure first, the headline bold, HTML escaped, the links', () => {
  const html = telegramHtml({ title: 'Owls <b>& co</b>', text: 'AI-generated: The owls stay.', links: [{ label: 'NPR', url: 'https://npr.org/a?b=1&c=2' }] });
  assert.ok(html.startsWith('AI-generated: <b>Owls &lt;b&gt;&amp; co&lt;/b&gt;</b>'));
  assert.match(html, /<a href="https:\/\/npr.org\/a\?b=1&amp;c=2">NPR<\/a>/);
});

test('withRetries: 429 and 5xx retried with backoff, Retry-After wins, a 4xx fails at once', async () => {
  const waits = [];
  const sleep = async (ms) => waits.push(ms);
  let n = 0;
  const v = await withRetries(async () => {
    n++;
    if (n === 1) throw new PublishError('HTTP 429', { status: 429, retryable: true, retryAfter: 7 });
    if (n === 2) throw new PublishError('HTTP 503', { status: 503, retryable: true });
    return 'ok';
  }, { sleep });
  assert.equal(v, 'ok');
  assert.deepEqual(waits, [7000, 4000]);
  let m = 0;
  await assert.rejects(withRetries(async () => {
    m++;
    throw new PublishError('HTTP 400', { status: 400, retryable: false });
  }, { sleep }));
  assert.equal(m, 1);
});

test('readResponse: errors become PublishErrors that say whether to retry', async () => {
  const res = (status, body, headers = {}) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), headers: { get: (k) => headers[k] ?? null } });
  assert.deepEqual((await readResponse(res(200, { id: 1 }))).body, { id: 1 });
  await assert.rejects(readResponse(res(429, {}, { 'retry-after': '30' })), (e) => e.retryable && e.retryAfter === 30);
  await assert.rejects(readResponse(res(401, {})), (e) => !e.retryable);
});

test('RateLimiter: requests a minute and posts a rolling day', () => {
  let t = 0;
  const L = new RateLimiter({ perMinute: 2, perDay: 1, now: () => t });
  L.takeRequest();
  L.takeRequest();
  assert.ok(L.waitForRequest() > 0);
  t = 61_000;
  assert.equal(L.waitForRequest(), 0);
  assert.ok(L.canPost());
  L.takePost();
  assert.ok(!L.canPost());
  t += 24 * 3600_000;
  assert.ok(L.canPost());
});

test('live (a fake network): the requests go out, the answer is read, nothing secret comes back', async () => {
  const calls = [];
  const fetchImpl = async (url, o) => {
    calls.push({ url, o });
    if (/createSession/.test(url)) return { ok: true, status: 200, text: async () => JSON.stringify({ accessJwt: 'jwt-abcdefghijklmnop', did: 'did:plc:x' }), headers: { get: () => null } };
    return { ok: true, status: 200, text: async () => JSON.stringify({ uri: 'at://did:plc:x/app.bsky.feed.post/3abc' }), headers: { get: () => null } };
  };
  const a = makeAdapter('bluesky', { env: ENV, fetchImpl, dryRun: false });
  const r = await a.publish({ ...CLIP, platform: 'bluesky' });
  assert.equal(r.ok, true);
  assert.equal(r.remoteId, 'at://did:plc:x/app.bsky.feed.post/3abc');
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(r).includes(SECRET));
});

test('aiFlags: the AI fields each adapter really sends (what the publisher\'s gate checks)', () => {
  const flags = (id, item = CLIP) => makeAdapter(id, { env: {}, fetchImpl: noFetch }).aiFlags(item);
  // (YouTube: the audience too, on the same line of the compliance desk's check; without it every Short was held as
  // flag-missing by the real module, 17 Oct)
  assert.deepEqual(flags('youtube'), { containsSyntheticMedia: true, selfDeclaredMadeForKids: false });
  assert.deepEqual(flags('tiktok'), { is_aigc: true });
  assert.deepEqual(flags('instagram'), { is_ai_generated: true });
  assert.deepEqual(flags('facebook'), {}, 'no API field');
  // the flag follows the item, so an item that turned it off is caught by the gate, not hidden
  assert.deepEqual(flags('youtube', { ...CLIP, disclosure: { youtube: { containsSyntheticMedia: false } } }), { containsSyntheticMedia: false, selfDeclaredMadeForKids: false });
});

test('the gate measures a clip\'s own stories\' aired words against their sources (clipGetStory), not its episode\'s others', async () => {
  const C = await import('../server/publish/compliance.js');
  const summary = 'Evacuation orders in California are in effect due to a rapidly growing wildfire that has already burned six homes in the southern Los Angeles area.';
  const episode = {
    id: 'e1', program: { id: 'world-now', title: 'WORLD NOW' }, storyIds: ['s1', 's2'],
    segments: [
      { type: 'story', storyId: 's1', headline: 'Wildfire burns homes', text: summary, source: 'BBC Science' },
      { type: 'story', storyId: 's2', headline: 'Owls in the park', text: 'Four barn owl chicks were counted in Riverside Park on Tuesday, birders said.', source: 'NPR' },
    ],
  };
  const sources = { s1: { title: 'Evacuation orders as fast-moving California wildfire burns homes', summary, body: null }, s2: { title: 'A rare family of barn owls moved into Manhattan', summary: 'Barn owls are nesting in Manhattan this autumn.', body: null } };
  const getStory = (id) => sources[id] || null;
  const gate = (ids) => C.preflight({ id: 'c1', kind: 'short', episode, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } }, text: 'AI-generated: owls.' }, { now: Date.parse('2026-10-17T12:00:00Z'), getStory: C.clipGetStory(ids, getStory) });
  const verbatim = (r) => (r.violations || []).filter((v) => v.rule === 'verbatim');
  if (C.usingStub) return; // (the stub has no episode lint)
  assert.equal(verbatim(gate(['s2'])).length, 0, 'the owls clip carries no copied words');
  assert.ok(verbatim(gate(['s1'])).length > 0, 'the wildfire clip reads the outlet\'s sentence');
  assert.equal(C.clipGetStory(['s2'], getStory)('s1'), null);
});

test('the verbatim rule fails closed: a story whose sources are not at hand is refused (sources-missing), in a clip and in a whole programme', async () => {
  const C = await import('../server/publish/compliance.js');
  const episode = {
    id: 'e1', program: { id: 'full-time', title: 'FULL TIME' }, storyIds: ['s1', 's2'],
    segments: [
      { type: 'story', storyId: 's1', headline: 'Coventry win', text: 'Coventry beat Newcastle four goals to one on Saturday.', source: 'Sky Sports' },
      { type: 'story', storyId: 's2', headline: 'Owls in the park', text: 'Four barn owl chicks were counted in Riverside Park on Tuesday, birders said.', source: 'NPR' },
    ],
  };
  // (a FULL TIME edition replayed from a sport snapshot: the archive never kept s1)
  const getStory = (id) => (id === 's2' ? { title: 'A rare family of barn owls moved into Manhattan', summary: 'Barn owls are nesting in Manhattan this autumn.', body: null } : null);
  const flags = { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } };
  const missing = (r) => (r.violations || []).filter((v) => v.rule === 'sources-missing').map((v) => v.storyId);
  const clip = (ids) => C.preflight({ id: 'c1', kind: 'short', episode, storyIds: ids, platforms: ['youtube'], flags, text: 'AI-generated: sport.' }, { now: Date.parse('2026-10-17T12:00:00Z'), getStory: C.clipGetStory(ids, getStory) });
  assert.deepEqual(missing(clip(['s1'])), ['s1']);
  assert.equal(clip(['s1']).ok, false);
  assert.deepEqual(missing(clip(['s2'])), [], 'a clip of a story whose sources are at hand is not concerned');
  const whole = C.preflight({ id: 'e1', kind: 'episode', episode, platforms: ['youtube'], flags, text: 'AI-generated: sport.' }, { now: Date.parse('2026-10-17T12:00:00Z'), getStory });
  assert.deepEqual(missing(whole), ['s1']);
  assert.deepEqual(C.storiesWithoutSources({ episode, kind: 'episode' }, getStory), ['s1']);
  assert.deepEqual(C.storiesWithoutSources({ episode, kind: 'short' }, getStory), [], 'a clip that lists no story is checked by its own rules');
  // no getStory given at all: preflight warns, as before (the check needs a door to the sources)
  assert.deepEqual(missing(C.preflight({ id: 'e1', kind: 'episode', episode, platforms: ['youtube'], flags, text: 'AI-generated: sport.' }, { now: 0 })), []);
  const { RULE_ES } = await import('../server/publish/approval.js');
  assert.match(RULE_ES['sources-missing'], /no se puede comprobar/);
});

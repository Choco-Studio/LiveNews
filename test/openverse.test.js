// Openverse (server/openverse.js): institutions' own Flickr pictures only, the licence as indexed, no agency credit,
// dated before the story; the anonymous API paced under its announced limits
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenverseClient, openverseResult, openverseTrust, titleYear, INSTITUTIONS, AGENCY_CREDIT } from '../server/openverse.js';

const STORY_AT = Date.UTC(2026, 9, 17, 12);
const raw = (over = {}) => ({
  id: 'x',
  title: 'Volodymyr Zelenskyy addressed the nation 14.03.2025',
  indexed_on: '2025-04-01T00:00:00Z',
  foreign_landing_url: 'https://www.flickr.com/photos/165930373@N06/53000000000',
  url: 'https://live.staticflickr.com/65535/53000000000_abc_b.jpg',
  creator: 'President Of Ukraine',
  creator_url: 'https://www.flickr.com/photos/165930373@N06',
  license: 'cc0',
  license_version: '1.0',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  provider: 'flickr',
  source: 'flickr',
  width: 1024,
  height: 683,
  tags: [{ name: 'zelensky' }],
  ...over,
});

describe('what an Openverse result is', () => {
  test('its licence as indexed, its Flickr account, its source page and when it was indexed', () => {
    const r = openverseResult(raw());
    assert.equal(r.licence, 'CC0-1.0');
    assert.equal(r.account, '165930373@N06');
    assert.equal(r.page, 'https://www.flickr.com/photos/165930373@N06/53000000000');
    assert.equal(r.indexedOn, Date.UTC(2025, 3, 1));
    assert.equal(openverseResult(raw({ license: 'by-sa', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by-sa/2.0/' })).licence, 'CC-BY-SA-2.0');
    assert.equal(openverseResult(raw({ url: 'http://insecure.example/x.jpg' })), null);
  });
  test('the year a title gives', () => {
    assert.equal(titleYear('Meeting 14.03.2025'), 2025);
    assert.equal(titleYear('Plenary session 2024-03-12'), 2024);
    assert.equal(titleYear('European Youth Event 2025'), 2025);
    assert.equal(titleYear('Plenary hall'), null);
  });
});

describe('may it air', () => {
  test("an institution's own account (checked by hand), a licence the rights desk clears, indexed before the story", () => {
    const t = openverseTrust(openverseResult(raw()), { storyAt: STORY_AT });
    assert.equal(t.tier, 1);
    assert.equal(t.why, 'Office of the President of Ukraine');
    assert.equal(t.year, 2025);
    assert.ok(INSTITUTIONS.has('european_parliament') && INSTITUTIONS.has('36612355@N08'));
  });
  test('never another account (a long-standing one cannot be checked without Flickr), never NC or ND', () => {
    assert.equal(openverseTrust(openverseResult(raw({ creator_url: 'https://www.flickr.com/photos/12345@N00' })), { storyAt: STORY_AT }).tier, 0);
    assert.equal(openverseTrust(openverseResult(raw({ license: 'by-nc', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by-nc/2.0/' })), { storyAt: STORY_AT }).tier, 0);
    assert.equal(openverseTrust(openverseResult(raw({ license: 'by-nd', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by-nd/2.0/' })), { storyAt: STORY_AT }).tier, 0);
    assert.equal(openverseTrust(openverseResult(raw({ source: 'wikimedia', provider: 'wikimedia' })), { storyAt: STORY_AT }).tier, 0);
  });
  test("never another agency's picture or credit, never indexed after the story, never a year after it", () => {
    assert.equal(openverseTrust(openverseResult(raw({ title: 'Zelenskyy in Kyiv (Reuters photo)' })), { storyAt: STORY_AT }).why, "another agency's picture or credit");
    assert.equal(openverseTrust(openverseResult(raw({ tags: [{ name: 'gettyimages' }] })), { storyAt: STORY_AT }).tier, 0);
    assert.equal(openverseTrust(openverseResult(raw({ indexed_on: '2026-10-18T00:00:00Z' })), { storyAt: STORY_AT }).tier, 0);
    assert.equal(openverseTrust(openverseResult(raw({ title: 'Address 14.03.2027' })), { storyAt: STORY_AT }).tier, 0);
    for (const w of ['AP Photo', 'AFP', 'Getty Images', 'EPA-EFE', 'Anadolu', 'Courtesy of the ministry']) assert.ok(AGENCY_CREDIT.test(w), w);
  });
});

describe('the anonymous API, politely', () => {
  const reply = (status, body, headers = {}) => ({ ok: status === 200, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });
  test('licence filters, the identifying agent, a gap between requests, the day counted in the store', async () => {
    let t = 0;
    const seen = [];
    const store = new Map();
    const client = new OpenverseClient({
      agent: 'GLOBIT24-picturedesk/1.0 (https://example.org/repo)',
      gapMs: 3200,
      perDay: 2,
      now: () => t,
      sleep: async (ms) => (t += ms),
      store: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
      fetchImpl: async (url, opts) => {
        seen.push({ url: new URL(url), ua: opts.headers['user-agent'], at: t });
        return reply(200, { results: [raw()] }, { 'x-ratelimit-available-anon_sustained': '150' });
      },
    });
    const a = await client.search('zelensky', { extra: { source: 'flickr' } });
    const b = await client.search('european parliament');
    const c = await client.search('third');
    assert.equal(a.length, 1);
    assert.equal(b.length, 1);
    assert.equal(c, null, 'the day allowance the desk keeps under');
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url.searchParams.get('license_type'), 'commercial,modification');
    assert.equal(seen[0].url.searchParams.get('source'), 'flickr');
    assert.match(seen[0].ua, /^GLOBIT24-picturedesk\/1\.0 \(https:/);
    assert.ok(seen[1].at - seen[0].at >= 3200, 'paced');
    assert.equal([...store.values()][0], 2);
  });
  test('a 429 pauses it (until tomorrow when the day is spent)', async () => {
    const t = Date.UTC(2026, 9, 17, 12);
    const client = new OpenverseClient({ now: () => t, sleep: async () => {}, fetchImpl: async () => reply(429, {}, { 'retry-after': '30', 'x-ratelimit-available-anon_sustained': '0' }), log: { warn() {} } });
    assert.equal(await client.search('x'), null);
    assert.equal(client.pausedUntil, Date.UTC(2026, 9, 18));
    assert.equal(await client.search('y'), null);
    assert.equal(client.stats.requests, 1, 'nothing asked while paused');
  });
});

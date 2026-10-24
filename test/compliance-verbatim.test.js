// The verbatim lint (server/compliance/verbatim.js; docs/publishing/verbatim.md): runs of the outlet's own words in
// what we say, outside attributed quotations; the 12-word run and the 20 % share; the episode lint the writer team
// runs and the publish-time check applies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokens, quotedSpans, verbatimRuns, storyReport, lintEpisode, archiveSample, archiveGetStory, articleKey, MAX_RUN, MAX_SHARE } from '../server/compliance/verbatim.js';
import { preflight, launchReport, VERBATIM_LAUNCH_RATE } from '../server/compliance/index.js';

const ARTICLE = 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring, after engineers found that its steel supports had corroded far faster than expected. The mayor said the decision was painful but necessary. "We cannot ask people to drive over a bridge we no longer trust," she told reporters. A temporary ferry will carry cyclists and pedestrians across the river while a replacement is designed.';

test('words and attributed quotations: a speaker\'s quoted words are exempt, an outlet\'s phrase in quotation marks is not', () => {
  assert.deepEqual(tokens("Don't stop — it's 3.5% now").map((t) => t.w), ['dont', 'stop', 'its', '3', '5', 'now']);
  const said = 'The mayor was clear. "We cannot ask people to drive over a bridge we no longer trust," she told reporters.';
  assert.equal(quotedSpans(said).length, 1);
  const scare = 'The bridge was described as "corroded far faster than expected" in a report.';
  assert.equal(quotedSpans(scare).length, 1, 'described as… is an attribution');
  assert.equal(quotedSpans('Officials called it "a painful but necessary step" for the river.').length, 0, 'no verb of saying: not exempt');
});

test('runs: the longest stretch of the source\'s words, in order', () => {
  const aired = 'Engineers found that its steel supports had corroded far faster than expected, so the bridge will close to cars.';
  const runs = verbatimRuns(aired, [ARTICLE], { min: 6 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].length, 12);
  assert.equal(runs[0].text, 'Engineers found that its steel supports had corroded far faster than expected');
});

test('a story read out from its article breaks both rules; a story told in our words with the mayor\'s quote passes', () => {
  const copied = storyReport('The city council voted on Tuesday to close the old harbour bridge to cars from next spring, after engineers found that its steel supports had corroded far faster than expected.', [ARTICLE]);
  assert.ok(copied.longest > MAX_RUN);
  assert.deepEqual(copied.violations.map((v) => v.rule).sort(), ['run', 'share']);
  const ours = storyReport('The old harbour bridge will shut to cars next spring. Its steel has rusted faster than engineers thought. "We cannot ask people to drive over a bridge we no longer trust," the mayor told reporters. A ferry will take cyclists and walkers across meanwhile.', [ARTICLE]);
  assert.deepEqual(ours.violations, [], JSON.stringify(ours.runs));
  assert.equal(ours.quoted, 13, 'the quote (13 words) is not counted');
  assert.ok(ours.share <= MAX_SHARE);
});

test('the episode lint: per story, with the reading and the expert\'s answer; a story without its sources is unverified', () => {
  const ep = {
    segments: [
      { type: 'story', storyId: 's1', text: 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring.' },
      { type: 'cross', part: 'piece', kind: 'expert', storyId: 's1', text: 'A temporary ferry will carry cyclists and pedestrians across the river while a replacement is designed.' },
      { type: 'story', storyId: 's2', text: 'Rain is on the way.' },
    ],
  };
  const r = lintEpisode(ep, { getStory: (id) => (id === 's1' ? { title: 'Harbour bridge to close', summary: '', body: ARTICLE } : null) });
  assert.equal(r.ok, false);
  assert.ok(r.violations.every((v) => v.storyId === 's1'));
  assert.equal(r.stories.find((s) => s.storyId === 's2').unverified, true);
  assert.equal(lintEpisode(ep, { getStory: () => null, strict: true }).violations.filter((v) => v.rule === 'unverified').length, 2);
  // the publish-time check refuses it (the writer team's lint is upstream; this is the last net)
  const pf = preflight({ id: 'e1', kind: 'episode', episode: { id: 'e1', provider: 'mock', program: { id: 'world-now' }, storyIds: ['s1'], segments: ep.segments.slice(0, 2) }, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: false, selfDeclaredMadeForKids: false } } }, { calendar: { generatedAt: new Date().toISOString(), elections: [] }, env: { EDITORIAL_CONTACT: 'x@example.org' }, getStory: () => ({ title: 'Harbour bridge to close', body: ARTICLE }), requireReview: false });
  assert.ok(pf.violations.some((v) => v.rule === 'verbatim'));
});

test('the launch report measures what aired: copied summaries block launch, composed sentences pass; the article counts when cached', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'globit-verbatim-'));
  fs.mkdirSync(path.join(dataDir, 'archive'));
  const summary = 'The city council voted on Tuesday to close the old harbour bridge to cars from next spring after a report';
  const told = (i, text, extra = {}) => ({ at: 1792195261285 + i, programId: 'world-now', id: `s${i}`, title: 'Harbour bridge to close', summary, link: `https://example.org/a${i}`, text, ...extra });
  const copied = (i) => told(i, `${summary}. Our correspondent has more.`);
  const composed = (i) => told(i, 'Cars will be kept off the old harbour bridge from next spring. Councillors decided it on Tuesday.');
  const write = (rows) => fs.writeFileSync(path.join(dataDir, 'archive', '2026-10-16.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const verbatimBlocker = (r) => r.blockers.find((b) => /verbatim rule/.test(b));

  // no archive yet: said, not blocked
  assert.ok(launchReport({ env: {}, dataDir }).warnings.some((w) => /no archive yet/.test(w)));
  // the fallback writer's way (the summary read out): blocked
  write([copied(1), copied(2), composed(3), composed(4)]);
  const bad = launchReport({ env: {}, dataDir });
  assert.match(verbatimBlocker(bad), /50 % of the last 4 stories/);
  assert.equal(bad.verbatim.violating, 2);
  // composed sentences, one copied story in 40 (2.5 %): under the 5 % bar
  write([copied(0), ...Array.from({ length: 39 }, (_, k) => composed(k + 1))]);
  const ok = launchReport({ env: {}, dataDir });
  assert.equal(verbatimBlocker(ok), undefined);
  assert.ok(ok.verbatim.rate > 0 && ok.verbatim.rate <= VERBATIM_LAUNCH_RATE);
  // a fixture story (a .invalid link) is not counted; the newest stories are the ones measured
  write([...Array.from({ length: 5 }, (_, k) => copied(k)), told(9, `${summary}.`, { link: 'https://fixture.invalid/x' }), ...Array.from({ length: 3 }, (_, k) => composed(k + 10))]);
  assert.deepEqual(['stories', 'violating'].map((k) => archiveSample({ dataDir, limit: 3 })[k]), [3, 0]);
  assert.equal(archiveSample({ dataDir }).stories, 8);
  // the article: a reading that rewords the summary but copies the article is found once the audit cached it
  const fromArticle = told(20, 'Engineers found that its steel supports had corroded far faster than expected, so the bridge closes.');
  write([fromArticle]);
  assert.equal(archiveSample({ dataDir }).violating, 0, 'against the summary alone: a floor');
  fs.mkdirSync(path.join(dataDir, 'compliance', 'articles'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'compliance', 'articles', `${articleKey(fromArticle.link)}.json`), JSON.stringify({ link: fromArticle.link, text: ARTICLE }));
  assert.deepEqual(['violating', 'withArticle'].map((k) => archiveSample({ dataDir })[k]), [1, 1]);
  // and the operator's check reads the same sources
  assert.equal(archiveGetStory({ dataDir })('s20').body, ARTICLE);
  assert.equal(archiveGetStory({ dataDir })('nope'), null);
});

test('the article cache: the archive keeps the article the desk read (else the feed\'s full text), capped, expired; nothing fetched', async () => {
  const { ArticleCache, sourceTextOf, ARTICLE_MAX } = await import('../server/articlecache.js');
  const { Archive } = await import('../server/archive.js');
  const { parseFeed } = await import('../server/news.js');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'articles-'));
  let clock = Date.parse('2026-10-17T12:00:00Z');
  const now = () => clock;
  const cache = new ArticleCache({ dir: path.join(dataDir, 'compliance', 'articles'), now });
  const archive = new Archive({ dir: path.join(dataDir, 'archive'), now, articles: cache });
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => assert.fail('the cache never fetches');
  try {
    // the article the desk read for the writer; a story with only its feed's full text; one with neither
    const read = { id: 'a1', title: 'Harbour bridge to close to cars', summary: 'The council voted to close the bridge.', link: 'https://news.example/bridge', source: 'Example News', body: ARTICLE, bodyVia: 'jsonld' };
    const feedOnly = { id: 'a2', title: 'Ferry for cyclists', summary: 'A ferry will carry cyclists.', link: 'https://news.example/ferry', source: 'Example News', feedText: `${ARTICLE} `.repeat(30) };
    const bare = { id: 'a3', title: 'A headline only', summary: 'A teaser.', link: 'https://news.example/teaser', source: 'Example News' };
    const stories = new Map([read, feedOnly, bare].map((s) => [s.id, s]));
    const ep = { program: { id: 'world-now' }, storyIds: ['a1', 'a2', 'a3'], segments: ['a1', 'a2', 'a3'].map((id) => ({ type: 'story', storyId: id, headline: 'X', text: 'Told in our own words.' })) };
    assert.equal(archive.record(ep, { get: (id) => stories.get(id) }), 3);
    const doc = JSON.parse(fs.readFileSync(path.join(dataDir, 'compliance', 'articles', `${articleKey(read.link)}.json`), 'utf8'));
    assert.deepEqual(Object.keys(doc).sort(), ['at', 'link', 'source', 'text', 'via']);
    assert.equal(doc.text, ARTICLE);
    assert.equal(doc.via, 'article:jsonld');
    const feedDoc = cache.read(feedOnly.link);
    assert.equal(feedDoc.via, 'feed');
    assert.ok(feedDoc.text.length <= ARTICLE_MAX && /[.!?]$/.test(feedDoc.text), 'capped at whole sentences');
    assert.equal(cache.text(bare.link), null, 'a teaser keeps nothing here');
    assert.equal(sourceTextOf(bare), null);
    // the clip, upload and post checks read it: getStory's body
    const get = archiveGetStory({ dataDir });
    assert.equal(get('a1').body, ARTICLE);
    assert.ok(get('a2').body.startsWith('The city council'));
    assert.equal(get('a3').body, null);
    // an article kept is never replaced by a feed's text; told again, it is refreshed and stays
    assert.equal(cache.save({ ...read, body: null, feedText: 'A much shorter feed text that is not the article at all, but long enough to count here.' }), 'feed');
    assert.equal(cache.text(read.link), ARTICLE);
    // fifteen days on: what was not told again is gone, what was told again stays
    clock += 13 * 86400_000;
    cache.save(read);
    clock += 2 * 86400_000;
    assert.equal(cache.prune(), 1);
    assert.equal(cache.text(read.link), ARTICLE);
    assert.equal(cache.text(feedOnly.link), null);
    // a feed marked "cache": false is never kept; with no folder (ARTICLE_CACHE=off) nothing is
    const picky = new ArticleCache({ dir: path.join(dataDir, 'compliance', 'articles'), now, skip: (s) => s.source === 'No Copies Ltd' });
    assert.equal(picky.save({ ...read, link: 'https://nocopies.example/a', source: 'No Copies Ltd' }), null);
    assert.equal(picky.text('https://nocopies.example/a'), null);
    assert.equal(new ArticleCache({ dir: null }).save(read), null);
  } finally {
    globalThis.fetch = realFetch;
  }
  // the feed's full text on the story (content:encoded), only when it says more than the summary
  const long = `<p>${ARTICLE}</p><p>${ARTICLE.replace('council', 'assembly')}</p>`;
  const rss = `<?xml version="1.0"?><rss><channel><item><title>Bridge to close</title><link>https://news.example/b</link><description>The council voted to close the bridge.</description><content:encoded><![CDATA[${long}]]></content:encoded></item><item><title>Short one</title><link>https://news.example/s</link><description>Short.</description><content:encoded><![CDATA[<p>Short.</p>]]></content:encoded></item></channel></rss>`;
  const items = parseFeed(rss, { name: 'Example News', url: 'https://news.example/rss' }, { now: Date.parse('2026-10-17T12:00:00Z') });
  assert.ok(items[0].feedText.startsWith('The city council voted') && !/<p>/.test(items[0].feedText));
  assert.equal(items[1].feedText, undefined);
});

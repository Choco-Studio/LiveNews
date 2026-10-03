// The story dossier's article text (server/article.js, NewsDesk.readArticles, the writer's prompt and grounding):
// depth for programmes of 8-10 minutes (owner), read from the article page, never padding.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArticle } from '../server/article.js';
import { NewsDesk } from '../server/news.js';
import { buildPrompt, buildReviewPrompt, ARTICLE_MAX } from '../server/writer.js';

const P = (t) => `<p>${t}</p>`;
const LONG1 = 'The Panama Canal has reopened to ships after fog closed it for a day, the canal authority said on Wednesday.';
const LONG2 = 'Ships began moving again at dawn, with pilots guiding the first vessels through the locks at reduced speed.';
const LONG3 = 'The canal carries around 5 percent of world sea trade, so even a short closure can delay deliveries.';

describe('extractArticle', () => {
  test('the paragraphs inside <article>, without boilerplate, captions or navigation', () => {
    const html = `<html><body><nav><p>Home | World | Business and other sections of this site.</p></nav><article><h1>Canal reopens</h1>${P(LONG1)}<figure><figcaption>Ships wait at the locks in the morning, as seen from the bank.</figcaption></figure>${P(LONG2)}${P('Sign up for our newsletter to get the day\'s top stories in your inbox.')}${P(LONG3)}${P('Photo')}</article><footer><p>Copyright 2026 The Outlet. All rights reserved for this page.</p></footer></body></html>`;
    const a = extractArticle(html);
    assert.equal(a.via, 'article');
    assert.deepEqual(a.paragraphs, [LONG1, LONG2, LONG3]);
    assert.equal(a.text, [LONG1, LONG2, LONG3].join('\n'));
  });
  test('a JSON-LD articleBody wins (inside @graph too)', () => {
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'NewsArticle', articleBody: `${LONG1}\n${LONG2}\n${LONG3}` }] };
    const a = extractArticle(`<script type="application/ld+json">${JSON.stringify(ld)}</script><article>${P('Something else entirely that is long enough to count as text.')}</article>`);
    assert.equal(a.via, 'jsonld');
    assert.deepEqual(a.paragraphs, [LONG1, LONG2, LONG3]);
  });
  test('a page without <article>: its run of long paragraphs; entities decoded, markup stripped', () => {
    const a = extractArticle(`<div>${P('Officials said the &ldquo;delays&rdquo; would clear <b>within days</b>, according to the statement released today.')}${P(LONG2)}${P(LONG3)}</div>`);
    assert.equal(a.via, 'page');
    assert.equal(a.paragraphs[0], 'Officials said the “delays” would clear within days, according to the statement released today.');
  });
  test('whole sentences within the limit; nothing worth reading gives null; junk never throws', () => {
    const many = Array.from({ length: 40 }, (_, i) => P(`Paragraph number ${i + 1} of a long report that keeps going with more detail than anyone needs here.`)).join('');
    const a = extractArticle(`<article>${many}</article>`, { max: 500 });
    assert.ok(a.text.length <= 500, `${a.text.length}`);
    assert.ok(/[.!?]$/.test(a.text));
    assert.equal(extractArticle('<article><p>Watch the video.</p></article>'), null);
    assert.equal(extractArticle(''), null);
    for (const junk of [null, undefined, 42, '<<<>>>', '<script type="application/ld+json">{not json</script>', '<p'.repeat(5000)]) assert.doesNotThrow(() => extractArticle(junk));
  });
});

describe('the news desk reads the article text once, within its budget', () => {
  test('offline fixture pages: the stories that link a page get their body; each is read once', async () => {
    const desk = new NewsDesk({ log: { warn() {}, info() {} } });
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config', 'fixtures');
    desk.localImageRoots.add(dir);
    const page = (name) => new URL(`file://${path.join(dir, 'pages', name)}`).href;
    const canal = { id: 'a', title: 'Panama Canal reopens after a day-long closure', summary: 'The canal has reopened.', source: 'Ledger Line', local: true, page: page('business-12.html') };
    const none = { id: 'b', title: 'No page', summary: 'Nothing more.', source: 'Ledger Line', local: true };
    const res = await desk.readArticles([canal, none], { budgetMs: 3000 });
    assert.ok(canal.body && canal.body.includes('5 percent of world sea trade'), canal.body);
    assert.ok(!/newsletter|Fictional/i.test(canal.body), 'no boilerplate');
    assert.equal(none.body, undefined);
    assert.deepEqual([res.read, res.of], [1, 1]);
    canal.body = 'changed';
    await desk.readArticles([canal], { budgetMs: 1000 });
    assert.equal(canal.body, 'changed', 'read once');
  });
  test('a remote page that fails leaves the story without a body, never throws', async () => {
    const desk = new NewsDesk({ fetchImpl: async () => { throw new Error('ENOTFOUND'); }, log: { warn() {}, info() {} } });
    const s = { id: 'c', title: 'T', summary: 'S.', source: 'X', link: 'https://news.example/x' };
    await assert.doesNotReject(desk.readArticles([s], { budgetMs: 1000 }));
    assert.equal(s.body, undefined);
  });
});

describe('the writer and the editor read the article', () => {
  const program = { id: 'world-now', title: 'WORLD NOW', stories: 2, targetSeconds: [480, 600], features: [] };
  const presenters = { A: { name: 'Paco Pixel', personality: 'calm' }, B: { name: 'Lola Byte', personality: 'warm' } };
  const story = { id: 's1', title: 'Panama Canal reopens', summary: 'The canal has reopened.', source: 'Ledger Line', category: 'business', body: `${LONG1}\n${LONG2}\n${'x'.repeat(3000)}` };
  test('the prompt carries it (capped), and the rules allow its facts and say how to use its depth', () => {
    const prompt = buildPrompt({ channelName: 'GLOBIT 24', program, presenters, stories: [story, { ...story, id: 's2', body: undefined }] });
    assert.ok(prompt.includes('"article":'), 'the article is in the input');
    assert.ok(prompt.includes(LONG2));
    const m = prompt.match(/"article": "([^"]*)"/);
    assert.ok(m && m[1].length <= ARTICLE_MAX + 50, 'capped');
    assert.match(prompt, /"headline", "summary" and "article"/);
    assert.match(prompt, /three to five sentences/);
    const review = buildReviewPrompt({ channelName: 'GLOBIT 24', program, script: { segments: [] }, stories: [story] });
    assert.ok(review.includes(LONG1) && /headline\/summary\/article/.test(review));
  });
});

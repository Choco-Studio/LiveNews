// The compliance API's contract (server/compliance/index.js; compliance.md §8): disclosureFor per kind and platform,
// describe() and textPost() with the disclosure first, who wrote the words, the recreations an episode holds, the
// preflight that refuses an item, and the launch report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { disclosureFor, describe, textPost, writerOf, recreationsIn, programmeWording, preflight, launchReport, CHANNEL, PLATFORMS } from '../server/compliance/index.js';

const ep = (extra = {}) => ({
  id: 'e1',
  provider: 'mock',
  program: { id: 'money-minute', title: 'MONEY MINUTE' },
  storyIds: ['s1'],
  guests: { rp_1: { id: 'rp_1', name: 'Ana Silva', role: 'finance minister', qid: 'Q1' } },
  segments: [
    { type: 'story', storyId: 's1', text: 'Markets rose.', source: 'Harbour Herald', linkKind: 'restage' },
    { type: 'cross', kind: 'restage', recreation: true, reporter: 'rp_1', anchor: 'R1', storyId: 's1', text: 'We will cut the deficit next year.', quoteRef: { outlet: 'Harbour Herald', by: 'Ana Silva' } },
  ],
  ...extra,
});

test('disclosureFor: every platform gets its flag; a recreation makes it required; Facebook and Threads need a hand label', () => {
  const d = disclosureFor({ kind: 'episode', episode: ep() });
  assert.deepEqual(Object.keys(d.platforms), PLATFORMS);
  assert.equal(d.platforms.youtube.containsSyntheticMedia, true);
  assert.equal(d.platforms.youtube.required, true);
  assert.equal(d.platforms.youtube.prominentLabel, true, 'news: the label shows on the player');
  assert.equal(d.platforms.youtube.selfDeclaredMadeForKids, false, 'the audience YouTube requires: general, not made for kids');
  assert.equal(d.platforms.tiktok.is_aigc, true);
  assert.equal(d.platforms.instagram.is_ai_generated, true);
  assert.equal(d.platforms.facebook.field, null);
  assert.equal(d.platforms.facebook.manualLabel, true);
  assert.equal(d.labels.recreation, 'AI RECREATION — WORDS FROM PUBLIC STATEMENTS');
  assert.equal(d.labels.onAir, 'AI-PRODUCED NEWS');
  assert.deepEqual(d.recreations.map((r) => [r.name, r.outlet]), [['Ana Silva', 'Harbour Herald']]);
  // without a recreation: flags still set (our policy), not required by the platform's own rule
  const plain = disclosureFor({ kind: 'clip', episode: ep({ segments: ep().segments.slice(0, 1) }) });
  assert.equal(plain.platforms.youtube.containsSyntheticMedia, true);
  assert.equal(plain.platforms.youtube.required, false);
  assert.equal(plain.platforms.facebook.manualLabel, false);
  // only the platforms asked for
  assert.deepEqual(Object.keys(disclosureFor({ kind: 'short', episode: ep(), platforms: ['tiktok'] }).platforms), ['tiktok']);
});

test('who wrote it: the rule-based writers are "software", anything else an AI writer (the safe side)', () => {
  assert.equal(writerOf({ provider: 'mock' }), 'software');
  for (const p of ['weekly', 'quiz', 'weather']) assert.equal(writerOf({ provider: p }), 'software');
  assert.equal(writerOf({ provider: 'some-model-provider' }), 'ai');
  assert.equal(writerOf({}), 'ai');
  assert.match(disclosureFor({ kind: 'episode', episode: ep() }).description.opening, /written by the channel’s software/);
  assert.match(disclosureFor({ kind: 'episode', episode: ep({ provider: 'x' }) }).description.opening, /written by AI/);
});

test('describe: the disclosure is the first line, then the programme, its no-advice line, the recreation, credits, who answers', () => {
  const prev = process.env.EDITORIAL_CONTACT;
  process.env.EDITORIAL_CONTACT = 'editor@example.org';
  try {
    const text = describe({ kind: 'episode', episode: ep() }, { credits: ['Reporting: Harbour Herald'] });
    const lines = text.split('\n');
    assert.match(lines[0], /^AI-produced news: /);
    assert.match(lines[1], /^MONEY MINUTE: /);
    assert.ok(lines.includes(programmeWording('money-minute').advice));
    assert.ok(lines.some((l) => /^Contains an AI RECREATION: the words of Ana Silva, finance minister, as reported by Harbour Herald/.test(l)));
    assert.ok(lines.includes('· Reporting: Harbour Herald'));
    assert.ok(lines.includes(CHANNEL.statement));
    assert.match(lines.at(-1), /editor@example\.org/);
  } finally {
    if (prev === undefined) delete process.env.EDITORIAL_CONTACT;
    else process.env.EDITORIAL_CONTACT = prev;
  }
});

test('textPost: "AI-generated:" first, the source, the link counted as X counts it, never past the limit', () => {
  const t = textPost({ text: 'The old harbour bridge will close to cars next spring after engineers found its steel had rusted much faster than expected, and a ferry will carry cyclists and walkers across the river while a replacement is designed and built over the next three years at a cost the council has not yet given.', source: 'Harbour Herald', link: 'https://example.org/a-very-long-link-that-x-counts-as-23' });
  assert.match(t, /^AI-generated: The old harbour bridge/);
  assert.match(t, /… \(Source: Harbour Herald\) https:\/\/example\.org/);
  const counted = t.replace(/https:\/\/\S+/, 'x'.repeat(23));
  assert.ok(counted.length <= 280, `${counted.length} characters`);
});

test('recreationsIn and preflight: a text post without its disclosure, an episode without the editorial contact, are refused', () => {
  assert.equal(recreationsIn(ep()).length, 1);
  assert.equal(recreationsIn({ segments: [{ type: 'story' }] }).length, 0);
  const env = { EDITORIAL_CONTACT: 'editor@example.org' };
  assert.deepEqual(preflight({ kind: 'text', text: 'Markets rose.' }, { env }).violations.map((v) => v.rule), ['text-disclosure-missing']);
  assert.equal(preflight({ kind: 'text', text: textPost({ text: 'Markets rose.', source: 'Harbour Herald' }) }, { env }).ok, true);
  const noContact = preflight({ kind: 'text', text: 'AI-generated: Markets rose.' }, { env: {} });
  assert.deepEqual(noContact.violations.map((v) => v.rule), ['editorial-contact-missing']);
});

test('the launch report lists what must be in place, and says the channel is not ready without it', () => {
  const r = launchReport({ env: {} });
  assert.equal(r.ready, false);
  const all = r.blockers.join('\n');
  for (const want of [/EDITORIAL_CONTACT/, /RIGHTS_GATE/, /Open-Meteo/, /C2PA/]) assert.match(all, want);
  assert.ok(r.warnings.some((w) => /YouTube live/.test(w)));
});

test('preflight: a text post may not copy its source (MAX_RUN 12, MAX_SHARE 0.2); an attributed headline is a citation', () => {
  const env = { EDITORIAL_CONTACT: 'editor@example.org' };
  // 17 Oct, BBC Science: the post carried the article's opening sentence, 22 words of it
  const title = 'Evacuation orders as fast-moving California wildfire burns homes';
  const summary = 'Fanned by the fierce Santa Ana winds, the Norte Fire is one of 13 burning across the state.';
  const article = 'Evacuation orders in California are in effect due to a rapidly growing wildfire that has already burned six homes in the southern Los Angeles area. The US National Weather Service has issued a red flag warning for several California counties.';
  const copied = `AI-generated: ${title}. Evacuation orders in California are in effect due to a rapidly growing wildfire that has already burned six homes in the southern Los Angeles area. via BBC Science: https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo`;
  const r = preflight({ kind: 'text', text: copied, sourceTexts: [title, summary, article] }, { env });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((x) => x.rule === 'verbatim' && /words in a row/.test(x.message)), JSON.stringify(r.violations));
  // the channel's own words, the outlet's headline only as an attributed citation beside the link: allowed
  const cited = `AI-generated: Wildfire · California, USA. BBC Science: “${title}” https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo`;
  assert.equal(preflight({ kind: 'text', text: cited, sourceTexts: [title, summary, article] }, { env }).ok, true);
  // the same headline unattributed, as the post's own words: refused (all of its words are the outlet's)
  const bare = `AI-generated: ${title}. https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo`;
  assert.ok(preflight({ kind: 'text', text: bare, sourceTexts: [title, summary] }, { env }).violations.some((x) => x.rule === 'verbatim'));
  // a link's slug repeats the headline: links are not words of the post
  const slug = 'AI-generated: Wildfire · California, USA. BBC Science: https://www.example.org/evacuation-orders-as-fast-moving-california-wildfire-burns-homes';
  assert.equal(preflight({ kind: 'text', text: slug, sourceTexts: [title, summary] }, { env }).ok, true);
  // no sources given: not checked, and said so
  assert.ok(preflight({ kind: 'text', text: cited }, { env }).warnings.some((w) => /no source texts/.test(w)));
});

test('preflight and the register: a withdrawn story holds every item that tells it, a quiz clip (no stories on its episode) and a post included', () => {
  const register = { isBlocked: ({ storyId }) => (storyId === 's9' ? 'takedown: a copyright complaint' : null), review: () => null };
  const env = { EDITORIAL_CONTACT: 'editor@example.org' };
  // a quiz question's clip: its episode lists no stories, the clip tells s9
  const quiz = { id: 'q1', provider: 'quiz', program: { id: 'pay-attention', title: 'PAY ATTENTION' }, storyIds: [], segments: [{ type: 'quiz', text: 'How many?' }] };
  const held = preflight({ kind: 'short', episode: quiz, storyIds: ['s9'], platforms: [] }, { register, env, requireReview: false });
  assert.ok(held.violations.some((v) => v.rule === 'blocked' && /s9/.test(v.message)), JSON.stringify(held.violations));
  assert.ok(!preflight({ kind: 'short', episode: quiz, storyIds: ['s1'], platforms: [] }, { register, env, requireReview: false }).violations.some((v) => v.rule === 'blocked'));
  // a text post on the story
  const post = preflight({ kind: 'text', text: 'AI-generated: Our words.', storyIds: ['s9'] }, { register, env });
  assert.ok(post.violations.some((v) => v.rule === 'blocked'));
  // once only, when its episode lists the story too (checkClip reads it there)
  const news = { ...quiz, storyIds: ['s9'], segments: [{ type: 'story', storyId: 's9', text: 'Told.' }] };
  assert.equal(preflight({ kind: 'short', episode: news, storyIds: ['s9'], platforms: [] }, { register, env, requireReview: false }).violations.filter((v) => v.rule === 'blocked').length, 1);
});

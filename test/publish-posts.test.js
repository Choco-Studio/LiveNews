// Text posts, clip texts and full uploads (server/publish/posts.js, clipmeta.js, uploads.js, platforms.js;
// docs/publishing/plan.md §4-5): every post opens "AI-generated:", fits its network, credits and links the outlet,
// carries only what aired (whole sentences, no opinion, no emoji), and a whole programme's title, chapters and
// description keep YouTube's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStories, postsFor, newsLine, wholeSentences, sameEvent } from '../server/publish/posts.js';
import { chaptersFor, uploadMeta, worthUploading } from '../server/publish/uploads.js';
import { fitTitle, clipTexts } from '../server/publish/clipmeta.js';
import { quizWords } from '../server/publish/moments.js';
import { PLATFORMS, xLength, graphemes, byteLength, fitsPlatform, lengthFor } from '../server/publish/platforms.js';
import { estimateTimeline } from '../server/publish/timeline.js';

const EMOJI = /\p{Extended_Pictographic}/u;
const AT = Date.parse('2026-10-16T09:00:00Z');
const entry = (id, title, text, extra = {}) => ({ id, title, text, source: 'NPR Science', link: `https://www.npr.org/${id}`, at: AT, programId: 'cosmos', rank: 1, ...extra });
const ENTRIES = [
  entry('s1', 'A rare family of barn owls moved into Manhattan', "A rare family of barn owls moved into Manhattan's Upper West Side. New Yorkers are captivated, according to NPR Science. When the owlets first flew, as they did last week, crowds gathered. He said it was jaw-dropping."),
  entry('s1b', 'Barn owls move into Manhattan park', 'Barn owls nest in a Manhattan park, birders say.', { source: 'Gothamist', link: 'https://gothamist.com/owls', programId: 'world-now', rank: 0 }),
  entry('s2', 'Pandemic loans are proving a disaster for restaurants', 'At the time, it provided a desperately needed lifeline. The Spice N Curry cafe relied heavily on traffic from FIU.', { source: 'Guardian Business', link: 'https://www.theguardian.com/x', programId: 'money-minute' }),
  entry('s3', 'Deadly shooting at an elementary school', 'Police are investigating a deadly shooting at an elementary school in Bend, Oregon.', { source: 'The Guardian', link: 'https://www.theguardian.com/y', grave: true }),
  entry('s4', 'No link story', 'It aired without a link.', { link: null }),
];

test('wholeSentences joins the pieces the voice splitter cut at commas and drops an unfinished end', () => {
  assert.deepEqual(wholeSentences('One, two, three, four and five went by. And a cut piece without'), ['One, two, three, four and five went by.']);
});

test('dayStories: grouped by event across outlets, most told first, only stories with a link to credit', () => {
  const ss = dayStories(ENTRIES, { day: '2026-10-16' });
  assert.ok(sameEvent('A rare family of barn owls moved into Manhattan', 'Barn owls move into Manhattan park'));
  assert.equal(ss[0].ids.length, 2, 'the owls from two outlets are one story');
  assert.ok(!ss.some((s) => s.ids.includes('s4')), 'no link, no post');
  assert.ok(ss.find((s) => s.ids.includes('s3')).grave);
});

test('dayStories: grave is the channel\'s own call when it made one; harm always; the words alone only when unclassed', () => {
  const cure = 'Scientists find a never-ending supply of cancer-fighting cells';
  const sum = 'A team grew immune cells that attack tumours in patients with advanced cancer.';
  const day = (extra, title = cure, summary = sum) => dayStories([entry('c1', title, `${summary} More detail followed.`, { summary, ...extra })], { day: '2026-10-16' })[0];
  assert.equal(day({ grave: false }).grave, false, 'the channel said not grave: a cure is good news');
  assert.equal(day({}).grave, true, 'never classed: the word cancer is enough to wait for the owner');
  assert.equal(day({ grave: false }, 'Three killed as gunman opens fire at a school', 'Three people were killed when a gunman opened fire.').grave, true, 'harm to people always waits');
});

test('newsLine: a whole aired sentence about the subject; never a pronoun before a name, a back reference, an opinion', () => {
  const owls = dayStories(ENTRIES, { day: '2026-10-16' })[0];
  const line = newsLine(owls);
  assert.ok(line && !/according to/i.test(line), line);
  assert.ok(!/jaw-dropping|When the owlets/.test(line));
  const loans = dayStories(ENTRIES, { day: '2026-10-16' }).find((s) => s.ids.includes('s2'));
  assert.equal(newsLine(loans), '', 'a time pointing back and a side detail: the headline goes alone');
});

test('newsLine: the headline said again in other inflections, with its attribution, is not news', () => {
  const st = { title: 'Kenya confirms third Ebola case, a relative of the first patient who died', text: 'Kenya has confirmed third Ebola case, a relative of the first patient who died, according to ABC News. Kenya’s health ministry is tracing 40 contacts of the three patients in Nairobi.' };
  assert.equal(newsLine(st), "Kenya’s health ministry is tracing 40 contacts of the three patients in Nairobi.");
});

test('newsLine: a line that sets up a quote the post will not carry is never the news', () => {
  const st = { title: 'For restaurants Covid-19 was a crisis – pandemic loans are proving a disaster', text: "In Guardian Business's report, here is how Erika Polmar, the executive director of the Independent Restaurant Coalition, put it. Federal pandemic loans of up to $2m now cost restaurant owners thousands of dollars a month." };
  assert.equal(newsLine(st), 'Federal pandemic loans of up to $2m now cost restaurant owners thousands of dollars a month.');
});

test('postsFor: every network within its limit, "AI-generated:" first, the outlet credited and linked, no emoji', () => {
  for (const s of dayStories(ENTRIES, { day: '2026-10-16' })) {
    const p = postsFor(s, { clip: { url: 'https://youtube.com/shorts/abc' } });
    assert.ok(xLength(p.x.text) <= PLATFORMS.x.text.post, p.x.text);
    assert.ok(p.threads.text.length <= PLATFORMS.threads.text.post);
    assert.ok(graphemes(p.bluesky.text) <= PLATFORMS.bluesky.text.post);
    for (const [net, post] of Object.entries(p)) {
      assert.ok(post.text.startsWith('AI-generated:'), `${net}: ${post.text}`);
      assert.ok(!EMOJI.test(post.text), `${net}: an emoji`);
      assert.equal(post.links[0].url, s.link, `${net}: the outlet's article`);
      assert.equal(post.grave, !!s.grave);
    }
    assert.ok(p.x.text.includes(s.link), 'X carries the article link');
    assert.match(p.threads.text, new RegExp(`Source: ${s.source}`));
  }
});

test('X counts a link as 23 characters; Bluesky counts graphemes; YouTube descriptions count bytes', () => {
  assert.equal(xLength(`a https://example.org/${'x'.repeat(200)}`), 2 + 23);
  assert.equal(graphemes('é 👍🏽'), 3);
  assert.equal(byteLength('é'), 2);
});

test('quiz clip texts never give the answer away, and two questions never share a title', () => {
  const ep = { id: 'q', program: { id: 'pay-attention', title: 'PAY ATTENTION' }, cast: { H: 'host', A: 'unit8', B: 'penny' }, segments: [] };
  const qs = [
    { type: 'where', words: 'Waymo’s robotaxis are headed to Canada', masked: 'Waymo’s robotaxis are headed to ▮▮▮▮▮', answer: 'CANADA' },
    { type: 'howmany', words: 'Lufthansa to buy 44.9% of TAP Air Portugal in €1.2B deal', masked: 'Lufthansa is buying a 44.9% stake in TAP Air Portugal in a deal valued at ▮▮▮▮▮▮ dollars.', answer: '1.2B' },
    { type: 'howmany', words: 'Taiwan chip TSMC says net profit hit record', masked: 'And finally: Taiwanese chip giant TSMC said on Thursday that net profit soared ▮▮▮▮▮ to a record high in the third quarter.', answer: '68.7%' },
    { type: 'letters', words: 'iPhone Duo orders are already delayed into 2027', answer: 'IPHONE DUO ORDERS' },
  ];
  const titles = new Set();
  for (const q of qs) {
    const m = { id: `q:${q.type}`, kind: 'quiz-question', from: 0, to: 0, light: true, grave: false, hook: ['PLAY ALONG'], headline: q.words, storyIds: [], sources: ['TechCrunch'], credits: [], programme: 'PAY ATTENTION', programId: 'pay-attention', quiz: { type: q.type, players: ['unit8', 'penny'], ...quizWords(q, q.type) } };
    for (const platform of ['youtube', 'tiktok', 'instagram']) {
      const t = clipTexts(m, ep, { platform, presenters: { unit8: { name: 'UNIT-8' }, penny: { name: 'Penny' } } });
      const all = `${t.title}\n${t.text}\n${t.description || ''}`.toUpperCase();
      assert.ok(!all.includes(q.answer.toUpperCase()), `${q.type} on ${platform} gives the answer: ${all}`);
      assert.ok(!all.includes('AND FINALLY'), 'no running-order label');
      assert.ok(t.title.length <= 100, t.title);
      if (platform === 'youtube') titles.add(t.title);
    }
  }
  assert.equal(titles.size, qs.length, [...titles].join(' / '));
  assert.equal(quizWords(qs[3]).title, 'Name the headline: I. D. O. A. A. D. I. 2027');
  // a long question keeps its blank in the title
  for (const t of titles) if (/^How many|^Where is it/.test(t)) assert.match(t, /___/, t);
  for (const t of titles) assert.doesNotMatch(t, /\b(?:the|a|of|in|to|and)…/i, `cut after a weak word: ${t}`);
  assert.equal(fitTitle('How many? Taiwanese chip giant TSMC said on Thursday that net profit soared ___ to a record high in the third quarter.', 50), 'How many? …net profit soared ___ to a record high…');
});

test('fitsPlatform: formats and lengths per network', () => {
  assert.ok(fitsPlatform({ format: 'vertical', duration: 40 }, 'tiktok').ok);
  assert.ok(!fitsPlatform({ format: 'horizontal', duration: 40 }, 'tiktok').ok);
  assert.equal(lengthFor('facebook', 120), 'long');
  assert.equal(lengthFor('instagram', 2), 'short');
});

test('clip texts: titles within limits, the disclosure, the outlet credited, no emoji on a grave clip', () => {
  const ep = { id: 'e', program: { id: 'cosmos', title: 'COSMOS DESK' }, cast: { A: 'nova' }, segments: [{ type: 'story', anchor: 'A', text: 'A rare family of barn owls moved into Manhattan.', storyId: 's1', headline: 'Barn owls move into Manhattan', source: 'NPR Science' }] };
  const m = { id: 'e:story:0-0', kind: 'story', from: 0, to: 0, light: true, grave: false, hook: ['BARN OWLS', 'IN MANHATTAN'], headline: 'Barn owls move into Manhattan', storyIds: ['s1'], sources: ['NPR Science'], credits: [], text: 'A rare family of barn owls moved into Manhattan.', programme: 'COSMOS DESK', programId: 'cosmos' };
  const stories = new Map([['s1', { title: 'Barn owls', source: 'NPR Science', link: 'https://www.npr.org/s1' }]]);
  for (const platform of ['youtube', 'tiktok', 'instagram', 'facebook', 'x']) {
    const t = clipTexts(m, ep, { platform, stories });
    if (platform === 'youtube') assert.ok(t.title.length <= 100);
    assert.match(`${t.text}\n${t.description || ''}`, /NPR/);
    assert.ok(t.disclosure, platform);
    const g = clipTexts({ ...m, grave: true, light: false }, ep, { platform, stories });
    assert.ok(!EMOJI.test(`${g.title} ${g.text}`), `${platform}: an emoji on a grave clip`);
  }
});

test('uploads: chapters from 0:00, three or more, ten seconds each; title and description within YouTube limits', () => {
  const segs = [{ type: 'intro', text: 'Good evening.' }];
  for (let i = 0; i < 6; i++) segs.push({ type: 'story', text: 'A story told over about fifteen seconds of voice. '.repeat(4), headline: `Headline number ${i} about something`, storyId: `s${i}`, source: 'NPR', audio: { url: 'x', duration: 26 } });
  segs.push({ type: 'outro', text: 'Goodbye from all of us here.', audio: { url: 'x', duration: 3 } });
  segs[0].audio = { url: 'x', duration: 2 };
  const ep = { id: 'e', program: { id: 'cosmos', title: 'COSMOS DESK' }, segments: segs };
  const tl = estimateTimeline(ep);
  const ch = chaptersFor(ep, tl);
  assert.equal(ch[0].at, 0);
  assert.ok(ch.length >= 3);
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].at - ch[i - 1].at >= 10);
  const meta = uploadMeta(ep, { timeline: tl, airedAt: AT });
  assert.ok(meta.title.length <= 100);
  assert.ok(byteLength(meta.description) <= 5000);
  assert.match(meta.description, /0:00 /);
  assert.match(meta.description, /AI/);
  assert.ok(worthUploading(ep, tl).worthy);
  assert.ok(!worthUploading({ ...ep, demo: true }, tl).worthy);
  assert.equal(chaptersFor(ep, { segments: tl.segments.slice(0, 1), duration: 20 }).length, 0, 'fewer than three: none');
});

// Text posts, clip texts and full uploads (server/publish/posts.js, clipmeta.js, uploads.js, platforms.js;
// docs/publishing/plan.md §4-5): every post opens "AI-generated:", fits its network, credits and links the outlet,
// carries only what aired (whole sentences, no opinion, no emoji), and a whole programme's title, chapters and
// description keep YouTube's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayStories, postsFor, newsLine, wholeSentences, sameEvent, postHead, personsIllness } from '../server/publish/posts.js';
import { chaptersFor, uploadMeta, worthUploading } from '../server/publish/uploads.js';
import { fitTitle, clipTexts } from '../server/publish/clipmeta.js';
import { quizWords } from '../server/publish/moments.js';
import { cleanLink, storyLabel, citation } from '../server/publish/wording.js';
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

test('dayStories: grave when read sad, or with grave words, whatever the archive\'s grave says (it means only "read sad")', () => {
  const day = (extra, title, summary) => dayStories([entry('c1', title, `${summary} More detail followed.`, { summary, ...extra })], { day: '2026-10-16' })[0];
  // the archive's grave: false with serious: true is a story read serious, not one judged light
  assert.equal(day({ grave: false, serious: true }, 'Three killed as gunman opens fire at a school', 'Three people were killed when a gunman opened fire.').grave, true, 'harm to people waits');
  assert.equal(day({ grave: false, serious: true }, 'Scientists find a never-ending supply of cancer-fighting cells', 'A team grew immune cells that attack tumours.').grave, false, 'a cure: grave words in another sense (facts.js)');
  assert.equal(day({ grave: false, serious: true }, 'Ceasefire talks collapse as shelling resumes', 'Talks broke down on Friday.').grave, true, 'grave words: the owner decides (the safe side)');
  assert.equal(day({ grave: true }, 'Village mourns its baker', 'The town gathered on Sunday.').grave, true, 'read sad on air');
  assert.equal(day({ grave: false, serious: true }, 'Mark Wahlberg wants to take on the longevity-startup crowd with a gym', 'A chain of gyms.').grave, false);
});

test('newsLine: a whole aired sentence about the subject; never a pronoun before a name, a back reference, an opinion', () => {
  const owls = { title: 'A rare family of barn owls moved into Manhattan', text: "When the owlets first flew, crowds gathered. He said it was jaw-dropping. Birders counted four barn owl chicks in Riverside Park on Tuesday, NPR Science reports." };
  const line = newsLine(owls, { requireArticle: false });
  assert.equal(line, 'Birders counted four barn owl chicks in Riverside Park on Tuesday.');
  const loans = dayStories(ENTRIES, { day: '2026-10-16' }).find((s) => s.ids.includes('s2'));
  assert.equal(newsLine(loans, { requireArticle: false }), '', 'a time pointing back and a side detail: the headline goes alone');
});

test('newsLine: the headline said again in other inflections, with its attribution, is not news', () => {
  const st = { title: 'Kenya confirms third Ebola case, a relative of the first patient who died', text: 'Kenya has confirmed third Ebola case, a relative of the first patient who died, according to ABC News. Kenya’s health ministry is tracing 40 contacts of the three patients in Nairobi.' };
  assert.equal(newsLine(st, { requireArticle: false }), "Kenya’s health ministry is tracing 40 contacts of the three patients in Nairobi.");
});

test('newsLine: a line that sets up a quote the post will not carry is never the news', () => {
  const st = { title: 'For restaurants Covid-19 was a crisis – pandemic loans are proving a disaster', text: "In Guardian Business's report, here is how Erika Polmar, the executive director of the Independent Restaurant Coalition, put it. Federal pandemic loans of up to $2m now cost restaurant owners thousands of dollars a month." };
  assert.equal(newsLine(st, { requireArticle: false }), 'Federal pandemic loans of up to $2m now cost restaurant owners thousands of dollars a month.');
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
    assert.ok(p.threads.text.includes(`Source: ${s.source}`) || p.threads.text.includes(`${s.source}: “`), p.threads.text);
  }
});

// 17 Oct 2026, BBC Science (the archive's entry): the post copied the article's opening sentence
const WILDFIRE = {
  at: Date.parse('2026-10-17T08:30:00Z'), programId: 'cosmos', rank: 0, id: 'sf06d27e1ad',
  title: 'Evacuation orders as fast-moving California wildfire burns homes',
  headline: 'Evacuation orders as fast-moving California wildfire burns homes',
  summary: 'Fanned by the fierce Santa Ana winds, the Norte Fire is one of 13 burning across the state.',
  source: 'BBC Science', category: 'science', kicker: 'WILDFIRE', location: { place: 'CALIFORNIA, USA' },
  link: 'https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo?at_medium=RSS&at_campaign=rss',
  text: 'Evacuation orders in California are in effect due to a rapidly growing wildfire that has already burned six homes in the southern Los Angeles area. The US National Weather Service has issued a red flag warning for several California counties due to strong. Fanned by the fierce Santa Ana winds, the Norte Fire is one of 13 burning across the state. The Norte Fire erupted on Friday in Orange County and quickly grew to 465 acres by the evening.',
  grave: false,
};
const ARTICLE = 'Evacuation orders in California are in effect due to a rapidly growing wildfire that has already burned six homes in the southern Los Angeles area. The US National Weather Service has issued a red flag warning for several California counties due to strong winds. Fanned by the fierce Santa Ana winds, the Norte Fire is one of 13 burning across the state. The Norte Fire erupted on Friday in Orange County and quickly grew to 465 acres by the evening, officials said.';

test('posts never copy their source: an aired sentence only when the article proves it the channel\'s own; the outlet\'s headline cited', async () => {
  const { preflight, usingStub } = await import('../server/publish/compliance.js');
  const [story] = dayStories([WILDFIRE], { day: '2026-10-17' });
  assert.ok(story.sourceTexts.includes(WILDFIRE.summary));
  // without the article at hand, no aired sentence at all (the title and summary would let the article's through)
  assert.equal(newsLine(story), '');
  // with it: every aired sentence here is the article's own words, so none
  assert.equal(newsLine({ ...story, articles: [ARTICLE] }), '');
  // the channel's headline is the outlet's: the post's own words are the channel's label, the headline is cited
  const head = postHead(story);
  assert.equal(head.own, '');
  assert.equal(head.lead, 'Wildfire · California, USA.');
  assert.equal(head.cite, 'BBC Science: “Evacuation orders as fast-moving California wildfire burns homes”');
  const p = postsFor({ ...story, articles: [ARTICLE] });
  for (const [net, post] of Object.entries(p)) {
    assert.ok(!/Evacuation orders in California are in effect/.test(post.text), `${net} copies the article: ${post.text}`);
    assert.ok(!/at_medium|at_campaign/.test(`${post.text} ${post.links[0].url}`), `${net}: a tracker left in the link`);
    if (!usingStub) {
      const g = preflight({ kind: 'text', text: post.text, sourceTexts: post.sourceTexts }, { env: { EDITORIAL_CONTACT: 'editor@example.org' } });
      assert.ok(g.ok, `${net}: ${JSON.stringify(g.violations)}`);
    }
  }
  assert.equal(p.x.text, 'AI-generated: Wildfire · California, USA. BBC Science: “Evacuation orders as fast-moving California wildfire burns homes” https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo');
  // a headline the channel wrote itself passes and leads the post, the outlet credited with "via"
  const reworded = postHead({ ...story, headline: 'Thirteen fires burn across California as winds rise' });
  assert.equal(reworded.own, 'Thirteen fires burn across California as winds rise.');
  assert.equal(reworded.cite, '');
  // an aired sentence the channel composed itself, checked against the article, is the line
  const own = { ...story, text: `${WILDFIRE.text} Officials expect the California winds to ease on Sunday, firefighters told reporters.`, articles: [ARTICLE] };
  assert.equal(newsLine(own), 'Officials expect the California winds to ease on Sunday, firefighters told reporters.');
});

test('newsLine: a line that only gives background is not news', () => {
  const st = { title: 'Mark Wahlberg wants to take on the longevity-startup crowd with an affordable gym concept', text: 'Mark Wahlberg has started companies of his own and backed plenty of others. Wahlberg’s chain opens its first two gyms in Los Angeles in January.' };
  assert.equal(newsLine(st, { requireArticle: false }), 'Wahlberg’s chain opens its first two gyms in Los Angeles in January.');
  assert.equal(newsLine({ ...st, text: 'Mark Wahlberg has started companies of his own and backed plenty of others.' }, { requireArticle: false }), '');
});

test('dayStories: a named person\'s illness is grave in a post, whatever the channel classed', () => {
  const pope = { ...WILDFIRE, id: 'p1', title: 'Pope pictured for first time since surgery and cancer diagnosis', headline: 'Pope pictured for first time since surgery', summary: 'The 71-year-old pontiff was diagnosed with lung cancer.', kicker: 'VATICAN', grave: false };
  assert.equal(dayStories([pope], { day: '2026-10-17' })[0].grave, true);
  assert.ok(personsIllness('Pope Leo to make public appearance Sunday, first since cancer surgery'));
  assert.ok(!personsIllness('USC scientists discover how to create a never-ending supply of cancer-fighting cells'), 'a cure is not a person\'s illness');
  // nor is a word in another sense grave (17 Oct: a gym chain and a discovery waited for the owner as "grave")
  const gym = { ...WILDFIRE, id: 'g1', title: 'Mark Wahlberg wants to take on the longevity-startup crowd with an affordable gym concept', summary: 'Mark Wahlberg, who once sank money into a gym chain that got kicked off the NYSE, is now building his own.', grave: false };
  const usc = { ...WILDFIRE, id: 'u1', title: 'USC scientists discover how to create a never-ending supply of cancer-fighting cells', summary: 'Engineered immune cells that can attack cancer and strengthen the body\'s natural defenses.', grave: false };
  for (const st of [gym, usc]) assert.equal(dayStories([st], { day: '2026-10-17' })[0].grave, false, st.title);
  // a death named in other words waits too
  const hack = { ...WILDFIRE, id: 'h1', title: 'Russian man linked to deadly London hospitals hack arrested', summary: 'The man was held in Moscow.', grave: false };
  assert.equal(dayStories([hack], { day: '2026-10-17' })[0].grave, true);
});

test('storyLabel with the story\'s own words: only a kicker and a place they bear out (the real labels of 17 Oct)', () => {
  // the channel's kicker and map, as archived, against the story's title and summary
  assert.equal(storyLabel({ kicker: 'WILDFIRE', place: 'CALIFORNIA, USA' }, 'Evacuation orders as fast-moving California wildfire burns homes'), 'Wildfire · California, USA');
  assert.equal(storyLabel({ kicker: 'VOLCANO' }, 'Astronomers discover a strange universal rule behind black hole eruptions'), '', 'no volcano in a black hole');
  assert.equal(storyLabel({ kicker: 'JUSTICE', place: 'USA' }, ['Three men jailed for 158 years each for murdering Australian and US surfers in Mexico', 'A Mexican judge sentenced three men.']), '', 'a trial in Mexico is not "Justice · USA"');
  assert.equal(storyLabel({ kicker: 'EDUCATION', place: 'OREGON, USA', category: 'world' }, 'Oregon school shooter was former special needs student, police say'), 'Oregon, USA', 'a school shooting is not "Education"; no desk name in its place');
  assert.equal(storyLabel({ kicker: 'PROTESTS', place: 'FRANCE' }, '\'Finish what we started\': After student protests, France braces for return of the Yellow Vests'), 'Protests · France');
  assert.equal(storyLabel({ kicker: 'WILDFIRE', place: 'CALIFORNIA, USA' }, []), '', 'nothing to check it by: nothing said');
  // the post leads with the label the words bear out, or with the cited headline alone
  const vol = postHead({ title: 'Astronomers discover a strange universal rule behind black hole eruptions', headline: 'Astronomers discover a strange universal rule behind black hole eruptions', source: 'ScienceDaily', kicker: 'VOLCANO', sourceTexts: ['Astronomers discover a strange universal rule behind black hole eruptions'] });
  assert.equal(vol.lead, '');
  assert.equal(vol.cite, 'ScienceDaily: “Astronomers discover a strange universal rule behind black hole eruptions”');
});

test('storyLabel and citation: the channel\'s own label of a story; the outlet\'s headline whole, quoted, attributed', () => {
  assert.equal(storyLabel({ kicker: 'WILDFIRE', location: { place: 'CALIFORNIA, USA' } }), 'Wildfire · California, USA');
  assert.equal(storyLabel({ kicker: 'TECHNOLOGY', category: 'tech' }), '', 'a desk name alone says nothing');
  assert.equal(storyLabel({ kicker: 'TECHNOLOGY', category: 'tech', place: 'BERLIN, GERMANY' }), 'Technology · Berlin, Germany');
  assert.equal(storyLabel({ kicker: 'AND FINALLY', category: 'science' }), '', 'a running-order label is not the story\'s');
  assert.equal(citation('France 24', '"Finish what we started": France braces for the Yellow Vests.'), 'France 24: “\'Finish what we started\': France braces for the Yellow Vests”');
  assert.equal(citation('BBC', 'A “quoted” word'), 'BBC: “A ‘quoted’ word”', 'one quotation, whole');
});

test('cleanLink: trackers out, everything else kept', () => {
  assert.equal(cleanLink('https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo?at_medium=RSS&at_campaign=rss'), 'https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo');
  assert.equal(cleanLink('https://www.aljazeera.com/news/2026/10/16/pope?traffic_source=rss'), 'https://www.aljazeera.com/news/2026/10/16/pope');
  assert.equal(cleanLink('https://ex.org/a?utm_source=x&utm_medium=y&id=42&fbclid=abc&page=2#top'), 'https://ex.org/a?id=42&page=2#top');
  assert.equal(cleanLink('https://ex.org/a?gclid=1&ref=home'), 'https://ex.org/a?ref=home', 'a plain ref is kept (it may be the page\'s own)');
  assert.equal(cleanLink('https://ex.org/a?q=x%20y'), 'https://ex.org/a?q=x%20y', 'nothing to take out: exactly as given');
  assert.equal(cleanLink('not a url'), 'not a url');
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

test('clip texts: a story clip whose headline is the outlet\'s own cites it; its own words lead; the link is clean', () => {
  const ep = { id: 'e', program: { id: 'cosmos', title: 'COSMOS DESK' }, segments: [] };
  const title = 'Evacuation orders as fast-moving California wildfire burns homes';
  const m = { id: 'e:story:0-0', kind: 'story', from: 0, to: 0, light: false, grave: false, hook: ['EVACUATION ORDERS AS FAST-MOVING', 'CALIFORNIA WILDFIRE BURNS HOMES'], headline: title, kicker: 'WILDFIRE', place: 'CALIFORNIA, USA', storyIds: ['w1'], sources: ['BBC Science'], credits: [], programme: 'COSMOS DESK', programId: 'cosmos' };
  const stories = new Map([['w1', { title, summary: 'Fanned by the fierce Santa Ana winds, the Norte Fire is one of 13 burning across the state.', source: 'BBC Science', link: 'https://www.bbc.co.uk/news/articles/c6vgjnk8nw2wo?at_medium=RSS&at_campaign=rss' }]]);
  for (const platform of ['youtube', 'tiktok', 'instagram', 'facebook']) {
    const t = clipTexts(m, ep, { platform, stories });
    assert.equal(t.title, "BBC Science: “Evacuation orders as fast-moving California wildfire burns homes” | GLOBIT 24", "a citation whole, the tail shortened");
    assert.ok(t.title.length <= 100);
    assert.match(t.lead, /^Wildfire · California, USA\. From COSMOS DESK on GLOBIT 24\. BBC Science: “/);
    assert.ok(!/at_medium/.test(`${t.text} ${t.description || ''} ${t.links.map((l) => l.url).join(' ')}`));
  }
  // a headline the channel wrote itself leads, as before
  const own = clipTexts({ ...m, headline: 'Thirteen fires burn across California', hook: ['THIRTEEN FIRES BURN', 'ACROSS CALIFORNIA'] }, ep, { platform: 'tiktok', stories });
  assert.match(own.lead, /^Thirteen fires burn across California\. Reporting: BBC Science\./);
  assert.match(own.title, /^Thirteen fires burn across California \|/);
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
    // the AI disclosure is the caption's first line, what a viewer reads before "more" (compliance.md §1, §3.5)
    assert.match(t.text.split('\n')[0], platform === 'youtube' ? /^AI-produced/ : /^Presenters are AI-generated characters/, `${platform}: ${t.text.split('\n')[0]}`);
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
  // the outlets' own headlines are other words: the channel's are its own
  const stories = new Map(segs.filter((x) => x.storyId).map((x, i) => [x.storyId, { title: `An outlet reports development ${i} in its own words`, summary: 'A summary.', source: 'NPR', link: `https://www.npr.org/s${i}?utm_source=rss` }]));
  const ch = chaptersFor(ep, tl, { stories });
  assert.equal(ch[0].at, 0);
  assert.ok(ch.length >= 3);
  assert.ok(ch.some((c) => /^Headline number/.test(c.label)), 'the channel\'s own headline names its chapter');
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].at - ch[i - 1].at >= 10);
  // the channel's headline is the outlet's own: the chapter is the story's label, the outlet's headline only cited
  // (the label only as the story's words bear it out: its summary names the space mission and the place)
  const copied = new Map([...stories].map(([id, st], i) => [id, { ...st, title: `Headline number ${i} about something in the news this evening`, summary: `A space mission reports from ${['Florida', 'Texas', 'Kenya', 'Japan', 'Peru', 'Norway'][i]}.` }]));
  const segs2 = segs.map((x) => (x.storyId ? { ...x, headline: `Headline number ${x.storyId.slice(1)} about something in the news this evening`, kicker: 'SPACE', location: { place: ['FLORIDA, USA', 'TEXAS, USA', 'KENYA', 'JAPAN', 'PERU', 'NORWAY'][Number(x.storyId.slice(1))] } } : x));
  const ch2 = chaptersFor({ ...ep, segments: segs2 }, estimateTimeline({ ...ep, segments: segs2 }), { stories: copied });
  assert.ok(!ch2.some((c) => /^Headline number/.test(c.label)), JSON.stringify(ch2));
  assert.ok(ch2.some((c) => c.label === 'Space · Texas, USA'), JSON.stringify(ch2));
  const m2 = uploadMeta({ ...ep, segments: segs2 }, { timeline: estimateTimeline({ ...ep, segments: segs2 }), stories: copied, airedAt: AT });
  assert.ok(!/^COSMOS DESK: Headline number/.test(m2.title), m2.title);
  assert.match(m2.description, /NPR: “Headline number 0 about something in the news this evening” — https:\/\/www\.npr\.org\/s0\n/);
  // a story with nothing of its own to name it by is a numbered chapter, never a "Story 3" in the title or summary
  const bare = new Map([...copied].map(([id, st]) => [id, { ...st, summary: 'A summary.' }]));
  const m3 = uploadMeta({ ...ep, segments: segs2 }, { timeline: estimateTimeline({ ...ep, segments: segs2 }), stories: bare, airedAt: AT });
  assert.ok(!/Story \d/.test(m3.title) && !/In this edition:[^\n]*Story \d/.test(m3.description), m3.title);
  assert.ok(m3.chapters.some((c) => /^Story \d · NPR$/.test(c.label)), JSON.stringify(m3.chapters));
  // with no stories to check against, the chapters stay apart
  assert.ok(chaptersFor(ep, tl).length >= 3);
  const meta = uploadMeta(ep, { timeline: tl, airedAt: AT });
  assert.ok(meta.title.length <= 100);
  assert.ok(byteLength(meta.description) <= 5000);
  assert.match(meta.description, /0:00 /);
  assert.match(meta.description, /AI/);
  assert.ok(worthUploading(ep, tl).worthy);
  assert.ok(!worthUploading({ ...ep, demo: true }, tl).worthy);
  assert.equal(chaptersFor(ep, { segments: tl.segments.slice(0, 1), duration: 20 }).length, 0, 'fewer than three: none');
});

test('clip texts: a hook that fell back to the programme\'s name never names the programme twice in the title', () => {
  const ep = { id: 'e', program: { id: 'cosmos', title: 'COSMOS DESK' }, cast: { A: 'nova' }, segments: [{ type: 'story', anchor: 'A', text: 'From next month, readers in Oslo can use the main public library on Sundays too.', storyId: 'osl', headline: 'Oslo library to open on Sundays', source: 'Circuit Weekly' }] };
  // the aired headline is the outlet's own (ownHook gave the programme's name): the title cites it
  const m = { id: 'e:story:0-0', kind: 'story', from: 0, to: 0, light: true, grave: false, hook: ['COSMOS DESK'], headline: 'Oslo library to open on Sundays', storyIds: ['osl'], sources: ['Circuit Weekly'], credits: [], programme: 'COSMOS DESK', programId: 'cosmos' };
  const stories = new Map([['osl', { title: 'Oslo library to open on Sundays', summary: 'The main public library in Oslo will open on Sundays from next month.', source: 'Circuit Weekly', link: 'https://example.test/osl' }]]);
  const t = clipTexts(m, ep, { platform: 'youtube', stories });
  assert.ok(!/COSMOS DESK \| COSMOS DESK/.test(t.title), t.title);
  assert.match(t.title, /^Circuit Weekly: “Oslo library to open on Sundays”/);
  // and with no headline at all: the programme once
  const bare = clipTexts({ ...m, headline: null, storyIds: [] }, ep, { platform: 'youtube', stories });
  assert.equal(bare.title, 'COSMOS DESK | GLOBIT 24');
});

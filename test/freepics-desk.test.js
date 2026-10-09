import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FreePictureDesk } from '../server/freepics/desk.js';
import { cleanBrief, parseBriefs, subjectGrounded, buildBriefPrompt } from '../server/freepics/brief.js';
import { headlineNames, headlineSubjects } from '../server/freepics/subjects.js';
import { PROFILES } from '../server/freepics/licence.js';
import { buildPrompt, normalizeBulletin } from '../server/writer.js';
import { NewsDesk, isFreePicture } from '../server/news.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const readLic = (label) => ({ 'CC BY 4.0': { id: 'cc-by', version: '4.0', label: 'CC BY 4.0' }, 'CC BY-SA 4.0': { id: 'cc-by-sa', version: '4.0', label: 'CC BY-SA 4.0' }, 'CC BY-NC 2.0': { id: 'cc-by-nc', version: '2.0', label: 'CC BY-NC 2.0' }, CC0: { id: 'cc0', version: null, label: 'CC0' } })[label];
const file = (name, o = {}) => ({
  name: `File:${name}`,
  url: `https://upload.wikimedia.org/${encodeURIComponent(name)}`,
  width: 1280,
  height: 720,
  fullWidth: 4000,
  mime: 'image/jpeg',
  title: name.replace(/\.jpg$/, ''),
  description: '',
  licence: readLic(o.lic || 'CC BY 4.0'),
  licenceName: o.lic || 'CC BY 4.0',
  author: 'Jane Doe',
  credit: 'Own work',
  date: '2024-05-01',
  uploaded: '2020-01-01T00:00:00Z',
  categories: [],
  restrictions: [],
  assessments: [],
  page: `https://commons.wikimedia.org/wiki/File:${name}`,
  ...o,
});
const entities = {
  'Giorgia Meloni': { qid: 'Q451791', label: 'Giorgia Meloni', description: 'Prime Minister of Italy since 2022', classes: ['Q5'], image: 'Meloni 2025.jpg', sitelinks: 110 },
  'Jane Smith': { qid: 'Q1', label: 'Jane Smith', description: 'British nurse', classes: ['Q5'], image: 'Jane Smith.jpg', sitelinks: 2 },
  Lisbon: { qid: 'Q597', label: 'Lisbon', description: 'capital city of Portugal', classes: ['Q5119'], image: 'Lisbon NC.jpg', commonsCategory: 'Lisbon', coords: { lat: 38.7, lon: -9.1 }, sitelinks: 200 },
  Tennessee: { qid: 'Q1509', label: 'Tennessee', description: 'state of the United States of America', classes: ['Q35657'], image: 'Lake Lindsey.jpg', sitelinks: 150 },
};
const files = {
  'Meloni 2025.jpg': file('Meloni 2025.jpg', { width: 1079, height: 1363, author: 'Governo Italiano', credit: 'governo.it', categories: ['Files from external sources with reviewed licenses'], restrictions: ['personality'], date: '2025-04-05' }),
  'Jane Smith.jpg': file('Jane Smith.jpg', { width: 900, height: 1200 }),
  'Lisbon NC.jpg': file('Lisbon NC.jpg', { lic: 'CC BY-NC 2.0' }),
  'Lake Lindsey.jpg': file('Lake Lindsey.jpg', { lic: 'CC0', title: 'Lake Lindsey in a state park' }),
};
const category = {
  Lisbon: [file('Lisbon skyline from the castle.jpg', { lic: 'CC BY-SA 4.0', description: 'View of Lisbon' }), file('Lisbon tram REUTERS.jpg', { author: 'REUTERS/Pedro Nunes' })],
};
const fakeWikidata = { resolve: async (name) => entities[name] || null };
const fakeCommons = {
  files: async (names) => names.map((n) => files[n]).filter(Boolean),
  search: async (text, { category: cat } = {}) => (cat ? category[cat] || [] : []),
};
const desk = (profile = PROFILES.youtube) => new FreePictureDesk({ wikidata: fakeWikidata, commons: fakeCommons, profile, now: () => NOW, log: { warn() {} } });
const brief = (subjects, o = {}) => ({ subjects: subjects.map(([name, kind, role = 'main', hint = '']) => ({ name, kind, role, hint })), never: [], tone: 'neutral', ...o });

test('a public figure the story is about: their official portrait, cropped around the face', async () => {
  const p = await desk().find({ id: 'a', title: 'Meloni backs EU migration plan', summary: 'Italy’s prime minister Giorgia Meloni said…' }, { brief: brief([['Giorgia Meloni', 'person', 'main', 'Prime Minister of Italy']]) });
  assert.equal(p.record.file, 'File:Meloni 2025.jpg');
  assert.equal(p.focusY, 0.18);
  assert.equal(p.via, 'free:p18');
  assert.equal(p.credit, 'FILE · Governo Italiano · CC BY', 'the credit on air is short; the record keeps the version');
  assert.equal(p.record.licence.label, 'CC BY 4.0');
  assert.equal(p.record.qid, 'Q451791');
});

test('never a private person, never a public figure in a story accusing them', async () => {
  assert.equal(await desk().find({ id: 'b', title: 'Nurse Jane Smith honoured', summary: '' }, { brief: brief([['Jane Smith', 'person']]) }), null);
  assert.equal(await desk().find({ id: 'c', title: 'Meloni accused of misusing funds', summary: 'Giorgia Meloni was accused…' }, { brief: brief([['Giorgia Meloni', 'person']]) }), null);
});

test('licence and provenance gates: the NC picture and the agency picture never air; the free one does', async () => {
  const d = desk();
  const p = await d.find({ id: 'd', title: 'Lisbon opens a riverside tram line', summary: 'The city of Lisbon…' }, { brief: brief([['Lisbon', 'city', 'main', 'capital of Portugal']]) });
  assert.equal(p.record.file, 'File:Lisbon skyline from the castle.jpg');
  const why = Object.fromEntries(d.lastRun.rejected.map((r) => [r.file, r.why]));
  assert.match(why['File:Lisbon NC.jpg'], /licence CC BY-NC/);
  assert.match(why['File:Lisbon tram REUTERS.jpg'], /agency/);
  // the strict profile leaves CC BY-SA out too: nothing is left
  assert.equal(await desk(PROFILES.youtubeStrict).find({ id: 'd2', title: 'Lisbon opens a riverside tram line', summary: '' }, { brief: brief([['Lisbon', 'city']]) }), null);
});

test('a grave story in a region: no pretty landscape (the map carries it); the brief can veto a picture', async () => {
  const story = { id: 'e', title: 'Judge orders Tennessee to preserve execution evidence', summary: 'A botched execution…' };
  assert.equal(await desk().find(story, { brief: brief([['Tennessee', 'place', 'place', 'US state']], { tone: 'grave' }) }), null);
  assert.ok(await desk().find(story, { brief: brief([['Tennessee', 'place', 'place', 'US state']], { tone: 'neutral' }) }));
  const never = await desk().find({ id: 'f', title: 'Lisbon tram line opens', summary: '' }, { brief: brief([['Lisbon', 'city']], { never: ['Lisbon skyline castle'] }) });
  assert.equal(never, null);
});

test('subjects from a headline when there is no brief', () => {
  assert.deepEqual(headlineNames("Germany's Merz vows to fight extremism after AfD gains"), ['Merz', 'AfD']);
  assert.deepEqual(headlineNames('Trump says he has no regrets about endorsing Texas Republican Ken Paxton'), ['Ken Paxton']);
  assert.deepEqual(headlineNames('Trump says he has no regrets', 'The president, Donald Trump, said'), ['Trump']);
  assert.deepEqual(headlineNames('Israelis mourn as Palestinians grapple with war'), []);
  assert.deepEqual(headlineNames('Big Oil asks Supreme Court to kill climate lawsuits'), ['Oil', 'Supreme Court']);
  const s = headlineSubjects({ title: 'Lisbon opens a new riverside tram line', summary: '' });
  assert.deepEqual(s.map((x) => [x.name, x.kind, x.role]), [['Lisbon', 'city', 'place']]);
});

test('the brief: a stock query that names what the story names is not generic', () => {
  assert.equal(cleanBrief({ subjects: [], tone: 'neutral', stock: 'british consulate building' }, { source: 'UK consulate in East Jerusalem: British diplomats prepare' }).stock, null);
  assert.equal(cleanBrief({ subjects: [], tone: 'neutral', stock: 'offshore oil platform' }, { source: 'Equinor may stop investing in UK oil fields' }).stock, 'offshore oil platform');
  assert.equal(cleanBrief({ subjects: [], tone: 'neutral', stock: 'drone' }, { source: 'x' }).stock, null, 'one word is too vague');
});

test('the brief: shape cleaned, invented subjects dropped, one per id', () => {
  const b = cleanBrief(
    { subjects: [{ name: 'Donald Trump', kind: 'person', role: 'main', hint: 'US president' }, { name: 'Joe Biden', kind: 'person', role: 'other' }, { name: 'X', kind: 'alien', role: 'boss' }], never: ['another storm', 7], tone: 'furious' },
    { source: 'Trump says he has no regrets about Paxton' },
  );
  assert.deepEqual(b.subjects.map((s) => s.name), ['Donald Trump']);
  assert.deepEqual(b.never, ['another storm', '7']);
  assert.equal(b.tone, null);
  assert.ok(subjectGrounded('Supreme Court of the United States', 'Big Oil asks Supreme Court…'));
  assert.ok(!subjectGrounded('United States', 'Big Oil asks Supreme Court…'), '"united" and "states" alone ground nothing');
  const m = parseBriefs({ briefs: [{ id: 'a', visual: { subjects: [{ name: 'Lisbon', kind: 'city', role: 'place' }], tone: 'neutral' } }, { id: 'zzz', visual: { tone: 'grave' } }] }, ['a']);
  assert.deepEqual([...m.keys()], ['a']);
  assert.match(buildBriefPrompt([{ id: 'a', title: 'T', summary: 'S' }]), /"briefs"/);
});

test('the writer asks for the brief only in a free mode, and keeps a grounded one', () => {
  const program = { title: 'WORLD NOW', tagline: 't', style: 's', stories: 1, storyLength: '3 sentences' };
  const presenters = { A: { name: 'Paco Pixel', personality: 'calm' } };
  const stories = [{ id: 's1', title: 'Lisbon opens a new riverside tram line', summary: 'The city of Lisbon opened a tram line on Tuesday.', source: 'Ledger', category: 'world' }];
  assert.doesNotMatch(buildPrompt({ channelName: 'G', program, presenters, stories }), /VISUAL BRIEF/);
  const withBrief = buildPrompt({ channelName: 'G', program, presenters, stories, visual: true });
  assert.match(withBrief, /VISUAL BRIEF/);
  assert.match(withBrief, /"visual": \{"subjects"/);
  const raw = {
    segments: [
      { type: 'intro', anchor: 'A', text: 'Good evening.' },
      { type: 'story', storyId: 's1', anchor: 'A', text: 'Lisbon has opened a new riverside tram line. The city opened it on Tuesday. Ledger reports it.', headline: 'Lisbon opens tram line', visual: { subjects: [{ name: 'Lisbon', kind: 'city', role: 'main', hint: 'capital of Portugal' }, { name: 'Porto', kind: 'city', role: 'other' }], tone: 'light' } },
      { type: 'outro', anchor: 'A', text: 'Good night.' },
    ],
  };
  const out = normalizeBulletin(raw, stories, { solo: true });
  const seg = out.segments.find((s) => s.type === 'story');
  assert.deepEqual(seg.visual.subjects.map((s) => s.name), ['Lisbon'], 'Porto is not in the story');
});

test('news desk in a free mode: an outlet picture never stays, the free desk decides, the brief has the last word', async () => {
  const news = new NewsDesk({ log: { warn() {} } });
  const calls = [];
  news.freeDesk = {
    find: async (s, { brief: b }) => {
      calls.push([s.id, !!b]);
      if (b?.tone === 'grave') return null;
      return { url: 'https://upload.wikimedia.org/x.jpg', width: 1280, height: 720, focusY: 0.18, credit: 'FILE · X · CC BY', license: 'CC BY 4.0', page: 'p', via: 'free:p18', kind: 'file', record: { file: 'File:x.jpg' } };
    },
  };
  const s = { id: 's1', title: 'Meloni backs plan', summary: '', image: 'https://outlet.example/agency.jpg', imageVia: 'feed', link: 'https://outlet.example/a' };
  await news.findPictures([s], { budgetMs: 1000 });
  assert.equal(s.image, 'https://upload.wikimedia.org/x.jpg');
  assert.ok(isFreePicture(s));
  assert.equal(s.imageFocus, 0.18);
  assert.equal(s.imageCreditVia, 'free');
  // the writer's brief makes it look again; a grave brief that finds nothing takes the picture off
  await news.findPictures([s], { budgetMs: 1000, briefs: new Map([['s1', { subjects: [], tone: 'grave' }]]) });
  assert.equal(s.image, null);
  assert.equal(isFreePicture(s), false);
  assert.deepEqual(calls, [['s1', false], ['s1', true]]);
  // a refresh that lends an outlet picture over a free one: the free one comes back, without a new search
  const t = { id: 's2', title: 'Lisbon tram', summary: '', link: 'https://outlet.example/b' };
  await news.findPictures([t], { budgetMs: 1000 });
  t.image = 'https://outlet.example/other.jpg';
  t.imageVia = 'cluster';
  await news.findPictures([t], { budgetMs: 1000 });
  assert.equal(t.image, 'https://upload.wikimedia.org/x.jpg');
  assert.equal(isFreePicture(t), true);
  assert.equal(calls.filter(([id]) => id === 's2').length, 1);
});

test('bench round 1 (7 Oct): what a search brings back that is not a view never airs', async () => {
  const cases = {
    Amazon: file('RWDSU National Amazon workers press conference.jpg', { lic: 'CC0', description: 'Amazon workers speak at a press conference' }),
    Google: file('Republic of Korea Google visit.jpg', { description: 'A man sits in a restaurant during a visit' }),
    Gaza: file('Gaza Strip IDF operation.jpg', { description: 'Soldiers in the Gaza Strip, smoke rising' }),
    Israel: file('Wall after rocket hit.jpg', { description: 'Damage to a house after a rocket hit' }),
    Okinawa: file('USMC women reservists.jpg', { credit: 'USMC Archives', date: '1917', description: 'Marine Corps women reservists in Okinawa harbour view' }),
    Chat: file('ChatGPT screenshot.jpg', { description: 'Screenshot of the ChatGPT interface' }),
    Lisbon: file('Lisbon skyline at dusk.jpg', { description: 'View of Lisbon' }),
  };
  const d = new FreePictureDesk({
    wikidata: { resolve: async (name) => ({ qid: `Q-${name}`, label: name, description: 'thing', classes: [], commonsCategory: name, coords: { lat: 1, lon: 1 }, sitelinks: 50 }) },
    commons: { files: async () => [], search: async (_t, { category: cat }) => [cases[cat]] },
    now: () => NOW,
    log: { warn() {} },
  });
  for (const name of ['Amazon', 'Google', 'Gaza', 'Israel', 'Okinawa', 'Chat']) {
    assert.equal(await d.find({ id: name, title: `${name} story`, summary: '' }, { brief: brief([[name, 'organisation']]) }), null, name);
  }
  assert.ok(await d.find({ id: 'L', title: 'Lisbon story', summary: '' }, { brief: brief([['Lisbon', 'city']]) }));
});

test('no picture twice in one programme while another candidate is left', async () => {
  const d = desk();
  const story = { id: 'g', title: 'Lisbon opens a riverside tram line', summary: 'The city of Lisbon…' };
  const first = await d.find(story, { brief: brief([['Lisbon', 'city']]) });
  assert.equal(first.record.file, 'File:Lisbon skyline from the castle.jpg');
  // the only other Lisbon file is the agency one: rather the same view again than an unfree picture
  const again = await d.find(story, { brief: brief([['Lisbon', 'city']]), avoid: new Set([first.record.file]) });
  assert.equal(again.record.file, first.record.file);
});

test('bench round 2 (7 Oct): a generic concept gets no category search, an organisation only its buildings, a grave story no postcard', async () => {
  const searched = [];
  const files = {
    School: file('School building in Leeds.jpg', { description: 'View of a school building' }),
    Google: file('Google Search 2025 report view.jpg', { description: 'View of the productivity report page' }),
    'Gaza City': file('Gaza City at sunset.jpg', { description: 'View of Gaza City at sunset' }),
  };
  const ents = {
    School: { qid: 'Q3914', label: 'school', description: 'institution for education', classes: [], commonsCategory: 'School', sitelinks: 200 },
    Google: { qid: 'Q95', label: 'Google', description: 'American technology company', classes: [], commonsCategory: 'Google', sitelinks: 200 },
    'Gaza City': { qid: 'Q39550', label: 'Gaza City', description: 'city in the Gaza Strip', classes: [], commonsCategory: 'Gaza City', coords: { lat: 31.5, lon: 34.4 }, sitelinks: 100 },
  };
  const d = new FreePictureDesk({
    wikidata: { resolve: async (name) => ents[name] || null },
    commons: { files: async () => [], search: async (_t, { category: cat }) => (searched.push(cat), [files[cat]]) },
    now: () => NOW,
    log: { warn() {} },
  });
  assert.equal(await d.find({ id: 's', title: 'Seven injured in attack at Polish school', summary: '' }, { brief: brief([['School', 'other']], { tone: 'grave' }) }), null);
  assert.ok(!searched.includes('School'), 'no search inside a generic concept');
  assert.equal(await d.find({ id: 'g', title: 'Google rolls out SynthID', summary: '' }, { brief: brief([['Google', 'organisation']]) }), null);
  assert.equal(await d.find({ id: 'z', title: "Gaza's devastation, three years on", summary: '' }, { brief: brief([['Gaza City', 'city']], { tone: 'grave' }) }), null);
  assert.ok(await d.find({ id: 'z2', title: 'Gaza City council meets', summary: '' }, { brief: brief([['Gaza City', 'city']], { tone: 'neutral' }) }), 'a sunset is fine when the story is not grave');
});

test('bench round 3 (7 Oct): the place name is no evidence of a view, a searched PNG is no photograph, a structure needs coordinates', async () => {
  const files = {
    'Gaza City': file('5M0A8322-01.jpg', { description: 'Gaza City' }),
    Google: file('Chrome-web-store-stats.png', { mime: 'image/png', description: 'Stats of the web store' }),
    School: file('Lawrence HS Exterior Photo.jpg', { description: 'Exterior view' }),
  };
  const ents = {
    'Gaza City': { qid: 'Q39550', label: 'Gaza City', description: 'city', classes: [], commonsCategory: 'Gaza City', coords: { lat: 31.5, lon: 34.4 }, sitelinks: 100 },
    Google: { qid: 'Q95', label: 'Google', description: 'American technology company', classes: [], commonsCategory: 'Google', sitelinks: 200 },
    School: { qid: 'Q3914', label: 'school', description: 'institution', classes: [], commonsCategory: 'School', sitelinks: 200 },
  };
  const d = new FreePictureDesk({
    wikidata: { resolve: async (name) => ents[name] || null },
    commons: { files: async () => [], search: async (_t, { category: cat }) => [files[cat]] },
    now: () => NOW,
    log: { warn() {} },
  });
  assert.equal(await d.find({ id: 'z', title: 'Gaza City story', summary: '' }, { brief: brief([['Gaza City', 'city']]) }), null);
  assert.equal(await d.find({ id: 'g', title: 'Google story', summary: '' }, { brief: brief([['Google', 'organisation']]) }), null);
  assert.equal(await d.find({ id: 's', title: 'School story', summary: '' }, { brief: brief([['School', 'structure']]) }), null);
});

test('a watermarked file never airs (Commons tags them: "Images with watermarks")', async () => {
  const d = new FreePictureDesk({
    wikidata: { resolve: async () => ({ qid: 'Q1', label: 'Gaza City', description: 'city', classes: [], commonsCategory: 'Gaza City', coords: { lat: 1, lon: 1 }, sitelinks: 50 }) },
    commons: { files: async () => [], search: async () => [file('5M0A8322-01.jpg', { description: 'Gaza Sea Port, with the memorial silhouetted against the sky', categories: ['Images with watermarks', 'Port of Gaza'] })] },
    now: () => NOW,
    log: { warn() {} },
  });
  assert.equal(await d.find({ id: 'w', title: 'Gaza port', summary: '' }, { brief: brief([['Gaza City', 'city']]) }), null);
  assert.match(d.lastRun.rejected[0].why, /watermark/);
});

test('round 7 (8 Oct): a Wikipedia-style bracket is searched bare and joins the hint', () => {
  const [s] = cleanBrief({ subjects: [{ name: 'Curiosity (rover)', kind: 'product', role: 'main', hint: 'NASA Mars rover' }], tone: 'neutral' }).subjects;
  assert.equal(s.name, 'Curiosity');
  assert.equal(s.hint, 'rover, NASA Mars rover');
});

test('round 8 (8 Oct): people in a searched picture are seen in other languages too', async () => {
  const d = new FreePictureDesk({
    wikidata: { resolve: async () => ({ qid: 'Q8880', label: 'European Commission', description: 'executive of the European Union', classes: [], commonsCategory: 'European Commission', sitelinks: 100 }) },
    commons: { files: async () => [], search: async () => [file('Reunión con Vicepresidenta de la Comisión Europea.jpg', { description: 'Reunión en el edificio Berlaymont, sede de la Comisión' })] },
    now: () => NOW,
    log: { warn() {} },
  });
  assert.equal(await d.find({ id: 'eu', title: 'EU expansion', summary: '' }, { brief: brief([['European Commission', 'organisation']]) }), null);
  assert.match(d.lastRun.rejected[0].why, /people/);
});

test('round 9 (8 Oct): an aircraft over a place is not a view of it', async () => {
  const d = new FreePictureDesk({
    wikidata: { resolve: async () => ({ qid: 'Q12630', label: 'Gulf of Mexico', description: 'ocean basin', classes: [], commonsCategory: 'Gulf of Mexico', coords: { lat: 25, lon: -90 }, sitelinks: 150 }) },
    commons: { files: async () => [], search: async () => [file('QF-16 over the Gulf of Mexico.jpg', { description: 'A QF-16 aerial target flies over the Gulf of Mexico, aerial view' })] },
    now: () => NOW,
    log: { warn() {} },
  });
  assert.equal(await d.find({ id: 'h', title: 'Hurricane heads for Gulf coast', summary: '' }, { brief: brief([['Gulf of Mexico', 'place']]) }), null);
  assert.match(d.lastRun.rejected[0].why, /craft/);
});

// The rights-aware picture desk (server/picturedesk.js): exact subjects through Wikipedia titles and Wikidata items,
// a person's portrait only for the right person in the right role (wrong-person rate 0), NASA for space, the
// Commons FILE photo of the place, strict relevance (no event, no crowd under a grave story), every pick cleared.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PictureDesk, nameSpans, subjectsOf, storyFlags, roleAgreement, personProblem, itemKind, pictureProblem, nasaItem, nasaOwnPicture, focusOf, near, placeTitlesOf, aliasFor, singular } from '../server/picturedesk.js';
import { feedCandidates } from '../server/pictures.js';
import { WikimediaClient, PacedJson } from '../server/wikimedia.js';
import { ImageSearch } from '../server/imagesearch.js';
import { lookupPlace } from '../server/gazetteer.js';

const NOW = Date.UTC(2026, 9, 17, 12);
const YEAR = 365.25 * 86400_000;

// ------------------------------------------------------------------ a fake Wikipedia, Wikidata, Commons and NASA

const PAGES = {
  'Keir Starmer': { qid: 'Q6383803', description: 'Prime Minister of the United Kingdom from 2024 to 2026', living: true },
  'Jensen Huang': { qid: 'Q305177', description: 'Taiwanese-American businessman (born 1963)', living: true },
  Nvidia: { qid: 'Q182477', description: 'American multinational technology company' },
  'Chris Evans': { qid: 'Q178348', description: 'American actor (born 1981)', living: true },
  'Ana Lopez': { qid: 'Q900001', description: 'Spanish politician, mayor of Ribera', living: true },
  'John Smith': { qid: 'Q900002', description: 'Topics referred to by the same term', disambiguation: true },
  'Old King': { qid: 'Q900003', description: 'Ruler (1900–1990)', living: false },
  'Kid Star': { qid: 'Q900004', description: 'Child actor', living: true },
  Lisbon: { qid: 'Q597', description: 'Capital and largest city of Portugal', coords: { lat: 38.72, lon: -9.15 } },
  Rotterdam: { qid: 'Q34370', description: 'City in the Netherlands', coords: { lat: 51.92, lon: 4.48 } },
  Turkey: { qid: 'Q43', description: 'Country in Asia and Europe', coords: { lat: 39, lon: 35 } },
  Kyiv: { qid: 'Q1899', description: 'Capital of Ukraine', coords: { lat: 50.45, lon: 30.52 } },
  'United Nations': { qid: 'Q1065', description: 'Intergovernmental organization' },
  'Artemis II': { qid: 'Q16947045', description: "NASA's crewed lunar flyby" },
  'Recep Tayyip Erdoğan': { qid: 'Q39723', description: 'President of Turkey since 2014', living: true },
  Beaver: { qid: 'Q47542', description: 'Genus of mammals' },
  'Charles III': { qid: 'Q43274', description: 'King of the United Kingdom since 2022', living: true },
  Shark: { qid: 'Q7372', description: 'Superorder of fishes' },
  Netflix: { qid: 'Q907311', description: 'American video streaming service' },
  'United States': { qid: 'Q30', description: 'Country in North America', coords: { lat: 39.8, lon: -98.6 } },
  Leeds: { qid: 'Q39121', description: 'City in England', coords: { lat: 53.8, lon: -1.55 } },
  'United Kingdom': { qid: 'Q145', description: 'Country in Europe', coords: { lat: 54, lon: -2 } },
  'Amazon rainforest': { qid: 'Q177567', description: 'Large rainforest in South America', coords: { lat: -3.4, lon: -62 } },
  Hake: { qid: 'Q1289807', description: 'Family of fishes' },
  'Michael Olise': { qid: 'Q900010', description: 'French footballer (born 2001)', living: true },
};
const REDIRECTS = { 'Recep Tayyip Erdogan': 'Recep Tayyip Erdoğan', Erdogan: 'Recep Tayyip Erdoğan', 'Prince Charles': 'Charles III' };
const FACTS = {
  Q6383803: { inst: 'human', imgs: ['Keir Starmer portrait.jpg'], born: '1962-09-02T00:00:00Z', sitelinks: 125, occ: 'politician|barrister', pos: 'Prime Minister of the United Kingdom|Leader of the Labour Party', cty: 'United Kingdom' },
  Q305177: { inst: 'human', imgs: ['Jensen Huang 2025.jpg'], born: '1963-02-17T00:00:00Z', sitelinks: 60, occ: 'businessperson|engineer|chief executive officer', pos: '', cty: 'United States|Taiwan' },
  Q182477: { inst: 'business|public company', imgs: ['NVIDIA Headquarters.jpg'], logos: ['Nvidia logo.svg'], sitelinks: 81 },
  Q178348: { inst: 'human', imgs: ['Chris Evans 2023.jpg'], born: '1981-06-13T00:00:00Z', sitelinks: 90, occ: 'actor|film producer', cty: 'United States' },
  Q900001: { inst: 'human', imgs: ['Ana Lopez.jpg'], born: '1970-01-01T00:00:00Z', sitelinks: 3, occ: 'politician', pos: 'mayor of Ribera', cty: 'Spain' },
  Q900003: { inst: 'human', imgs: ['Old King.jpg'], born: '1900-01-01T00:00:00Z', died: '1990-01-01T00:00:00Z', sitelinks: 40, occ: 'monarch', cty: 'Ruritania' },
  Q900004: { inst: 'human', imgs: ['Kid Star.jpg'], born: '2013-05-01T00:00:00Z', sitelinks: 20, occ: 'actor', cty: 'United Kingdom' },
  Q597: { inst: 'city|national capital', imgs: ['Lisbon skyline.jpg'], coord: 'Point(-9.139 38.708)', sitelinks: 267 },
  Q34370: { inst: 'city|municipality of the Netherlands', imgs: [], coord: 'Point(4.48 51.92)', sitelinks: 200 },
  Q43: { inst: 'sovereign state|country', imgs: ['Turkey landscape.jpg'], coord: 'Point(35 39)', sitelinks: 300 },
  Q1899: { inst: 'city|capital', imgs: ['Kyiv skyline.jpg'], coord: 'Point(30.52 50.45)', sitelinks: 250 },
  Q1065: { inst: 'intergovernmental organization', imgs: ['UN headquarters.jpg'], sitelinks: 300 },
  Q16947045: { inst: 'human spaceflight', imgs: ['Artemis II artist concept.jpg'], sitelinks: 72 },
  Q39723: { inst: 'human', imgs: ['Erdogan official.jpg'], born: '1954-02-26T00:00:00Z', sitelinks: 200, occ: 'politician', pos: 'President of Turkey|Prime Minister of Turkey', cty: 'Turkey' },
  Q47542: { inst: 'taxon', imgs: ['Eurasian beaver at the river.jpg'], sitelinks: 100 },
  Q43274: { inst: 'human', imgs: ['King Charles III.jpg'], born: '1948-11-14T00:00:00Z', sitelinks: 200, occ: 'monarch', pos: 'King of the United Kingdom|Prince of Wales', cty: 'United Kingdom' },
  Q7372: { inst: 'taxon', imgs: ['Great white shark.jpg'], sitelinks: 150 },
  Q907311: { inst: 'video streaming service|business|mobile app|website', imgs: [], logos: ['Netflix 2015 logo.svg'], sitelinks: 100 },
  Q30: { inst: 'sovereign state|country', imgs: ['USA orthographic.svg'], coord: 'Point(-98.6 39.8)', sitelinks: 300 },
  Q39121: { inst: 'city', imgs: ['Leeds skyline.jpg'], coord: 'Point(-1.55 53.8)', sitelinks: 150 },
  Q145: { inst: 'sovereign state|country', imgs: ['Palace of Westminster.jpg'], coord: 'Point(-2 54)', sitelinks: 300 },
  Q177567: { inst: 'tropical forest', imgs: ['Amazon Manaus forest.jpg'], coord: 'Point(-62 -3.4)', sitelinks: 150 },
  Q1289807: { inst: 'taxon', imgs: ['Illustration from The Natural History of British Fishes (1802) by Edward Donovan.jpg'], sitelinks: 40 },
  Q900010: { inst: 'human', imgs: ['Michael Olise 2025.jpg'], born: '2001-12-12T00:00:00Z', sitelinks: 45, occ: 'association football player', cty: 'France' },
};
const file = (title, { w = 1280, h = 720, licence = 'CC BY-SA 4.0', code = '', artist = 'Jane Doe', description = '', categories = '', restrictions = '' } = {}) => ({ title: `File:${title}`, w, h, licence, code, artist, description, categories, restrictions });
const FILES = Object.fromEntries(
  [
    file('Keir Starmer portrait.jpg', { w: 800, h: 1000, licence: 'CC BY 3.0', code: 'cc-by-3.0', artist: 'Chris McAndrew', restrictions: 'personality' }),
    file('Jensen Huang 2025.jpg', { w: 900, h: 1200, licence: 'CC BY-SA 4.0', artist: 'Raysonho' }),
    file('NVIDIA Headquarters.jpg', { licence: 'CC BY-SA 4.0', artist: 'Coolcaesar' }),
    file('Chris Evans 2023.jpg', { w: 800, h: 1000 }),
    file('Ana Lopez.jpg', { w: 800, h: 1000 }),
    file('Old King.jpg', { w: 800, h: 1000 }),
    file('Kid Star.jpg', { w: 800, h: 1000 }),
    file('Lisbon skyline.jpg', { licence: 'CC BY-SA 4.0', artist: 'Lisboa Fotos' }),
    file('Turkey landscape.jpg'),
    file('Kyiv skyline.jpg'),
    file('UN headquarters.jpg', { licence: 'Public domain', code: 'pd', artist: '' }),
    file('Artemis II artist concept.jpg', { description: "An artist's concept of Orion", licence: 'Public domain', code: 'pd' }),
    file('Erdogan official.jpg', { w: 800, h: 1000, licence: 'CC BY 4.0', artist: 'Presidency of Turkey' }),
    file('Eurasian beaver at the river.jpg', { licence: 'CC BY-SA 4.0', artist: 'Per Harald Olsen' }),
    file('King Charles III.jpg', { w: 800, h: 1000, licence: 'CC BY 4.0', artist: 'Someone' }),
    file('Great white shark.jpg', { licence: 'CC BY 2.0', artist: 'Elias Levy' }),
    file('USA orthographic.svg', { w: 1280, h: 1280, licence: 'CC BY-SA 3.0' }),
    file('Leeds skyline.jpg', { licence: 'CC BY-SA 4.0' }),
    file('Palace of Westminster.jpg', { licence: 'CC BY-SA 4.0' }),
    file('Amazon Manaus forest.jpg', { licence: 'CC BY-SA 3.0', artist: 'Neil Palmer' }),
    file('Illustration from The Natural History of British Fishes (1802) by Edward Donovan.jpg', { licence: 'CC0', code: 'cc0' }),
    file('Michael Olise 2025.jpg', { w: 800, h: 1000, licence: 'CC BY-SA 4.0', artist: 'Someone' }),
  ].map((f) => [f.title, f])
);
const SEARCH = {
  'Rotterdam port': [
    file('Rotterdam harbour cranes NC.jpg', { licence: 'CC BY-NC 2.0', description: 'Rotterdam harbour' }),
    file('Map of Rotterdam port.png', { description: 'Rotterdam' }),
    file('Rotterdam Hilton port view.jpg', { licence: 'CC BY 2.0', code: 'cc-by-2.0', artist: 'Someone', description: 'Port, Rotterdam (no country: refused)' }),
    file('Port of Rotterdam Maasvlakte container terminal.jpg', { licence: 'CC BY 2.0', code: 'cc-by-2.0', artist: 'Frans Berkelaar', description: 'Container terminal in the port of Rotterdam, Netherlands' }),
  ],
  'Lisbon tram': [
    file('Lisbon mayor visits tram depot.jpg', { licence: 'CC BY-SA 4.0', artist: 'Jane Doe', description: 'Tram depot, Lisbon, Portugal' }),
    file('Lisbon tram 28 in 1975.jpg', { licence: 'CC BY-SA 4.0', artist: 'Jane Doe', description: 'Tram in Lisbon, Portugal' }),
    file('Lisbon tram 28 at Graca.jpg', { licence: 'CC BY-SA 4.0', artist: 'Jane Doe', description: 'Tram 28 in Lisbon, Portugal' }),
  ],
  Hake: [
    file('Hake (Merluccius) drawing.jpg', { licence: 'CC0', description: 'A drawing of a hake' }),
    file('Hake specimen, Natural History Museum.jpg', { licence: 'CC BY 2.0', code: 'cc-by-2.0', artist: 'Museum Photos' }),
    file('Fresh hake at Billingsgate fish market.jpg', { licence: 'CC BY 2.0', code: 'cc-by-2.0', artist: 'Market Photos' }),
  ],
  'Netflix headquarters': [
    file('Los Gatos town hall.jpg', { licence: 'CC BY-SA 4.0', description: 'Not the company' }),
    file('Netflix headquarters in Los Gatos.jpg', { licence: 'CC BY-SA 4.0', artist: 'Coolcaesar', description: 'Netflix headquarters, Los Gatos, California' }),
  ],
};
const NASA = {
  'Artemis II': [
    { data: [{ nasa_id: 'poster', title: 'Artemis II Poster', description: 'Stylized poster', keywords: ['Artemis II'], date_created: '2023-04-06T00:00:00Z', media_type: 'image', photographer: null }], links: [{ href: 'https://images-assets.nasa.gov/image/poster/poster~large.jpg' }] },
    { data: [{ nasa_id: 'spx', title: 'Artemis II recovery ship', description: 'Recovery. Credit: SpaceX', keywords: ['Artemis II'], date_created: '2026-10-16T00:00:00Z', media_type: 'image', photographer: 'SpaceX' }], links: [{ href: 'https://images-assets.nasa.gov/image/spx/spx~large.jpg' }] },
    { data: [{ nasa_id: 'art2-crew', title: 'Artemis II Crew After Splashdown', description: 'The crew is helped out of Orion.', keywords: ['Artemis II', 'Orion'], date_created: '2026-10-16T00:00:00Z', media_type: 'image', photographer: 'NASA/Joel Kowsky' }], links: [{ href: 'https://images-assets.nasa.gov/image/art2-crew/art2-crew~large.jpg' }] },
  ],
};

function commonsPage(f, index = 0) {
  const name = f.title.replace(/^File:/, '').replace(/ /g, '_');
  return {
    title: f.title,
    index,
    imageinfo: [
      {
        thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(name)}/1280px-${encodeURIComponent(name)}?utm_source=commons.wikimedia.org`,
        thumbwidth: f.w,
        thumbheight: f.h,
        url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${encodeURIComponent(name)}`,
        width: f.w * 2,
        height: f.h * 2,
        mime: 'image/jpeg',
        descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.title.replace(/ /g, '_'))}`,
        extmetadata: { LicenseShortName: { value: f.licence }, License: { value: f.code }, Artist: { value: f.artist ? `<a href="//commons.wikimedia.org/wiki/User:X">${f.artist}</a>` : '' }, ImageDescription: { value: f.description }, Categories: { value: f.categories }, Restrictions: { value: f.restrictions } },
      },
    ],
  };
}

function backend({ limited = () => false } = {}) {
  const calls = [];
  const reply = (data, status = 200, headers = {}) => ({ ok: status === 200, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, text: async () => JSON.stringify(data), json: async () => data, body: null });
  const fetchImpl = async (url) => {
    const u = new URL(url);
    calls.push(u.hostname);
    if (limited(u)) return reply({}, 429, { 'retry-after': '30' });
    if (u.hostname === 'en.wikipedia.org') {
      const titles = u.searchParams.get('titles').split('|');
      const redirects = [];
      const pages = [];
      for (const t of titles) {
        const to = REDIRECTS[t];
        if (to) redirects.push({ from: t, to });
        const title = to || t;
        const p = PAGES[title];
        if (!p) pages.push({ title, missing: true });
        else pages.push({ title, pageprops: { wikibase_item: p.qid, ...(p.disambiguation ? { disambiguation: '' } : {}) }, description: p.description, ...(p.coords ? { coordinates: [{ ...p.coords, primary: true }] } : {}), ...(p.living ? { categories: [{ ns: 14, title: 'Category:Living people' }] } : {}) });
      }
      return reply({ query: { redirects, pages } });
    }
    if (u.hostname === 'query.wikidata.org') {
      const ids = [...u.searchParams.get('query').matchAll(/wd:(Q\d+)/g)].map((m) => m[1]);
      const fp = (names) => names.map((n) => `http://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(n)}`).join('|');
      const bindings = ids
        .filter((id) => FACTS[id])
        .map((id) => {
          const f = FACTS[id];
          const v = (value) => ({ type: 'literal', value: String(value) });
          return { item: { value: `http://www.wikidata.org/entity/${id}` }, inst: v(f.inst), imgs: v(fp(f.imgs || [])), ...(f.logos ? { logos: v(fp(f.logos)) } : {}), ...(f.born ? { born: v(f.born) } : {}), ...(f.died ? { died: v(f.died) } : {}), sitelinks: v(f.sitelinks || 0), occ: v(f.occ || ''), pos: v(f.pos || ''), cty: v(f.cty || ''), ...(f.coord ? { coord: v(f.coord) } : {}) };
        });
      return reply({ results: { bindings } });
    }
    if (u.hostname === 'commons.wikimedia.org') {
      if (u.searchParams.get('generator') === 'search') {
        const q = u.searchParams.get('gsrsearch').replace(/ filetype:.*$/, '');
        return reply({ query: { pages: (SEARCH[q] || []).map((f, i) => commonsPage(f, i + 1)) } });
      }
      const titles = u.searchParams.get('titles').split('|');
      return reply({ query: { pages: titles.map((t) => (FILES[t] ? commonsPage(FILES[t]) : { title: t, missing: true })) } });
    }
    if (u.hostname === 'images-api.nasa.gov') return reply({ collection: { items: NASA[u.searchParams.get('q')] || [] } });
    return reply({}, 404);
  };
  return { fetchImpl, calls };
}

function makeDesk(opts = {}) {
  let now = opts.now ?? NOW;
  const clock = () => now;
  const { fetchImpl, calls } = backend(opts);
  const wikimedia = new WikimediaClient({ fetchImpl, gapMs: 0, now: clock, sleep: async () => {}, log: { warn() {} } });
  const search = new ImageSearch({ fetchImpl, wikimedia, log: { warn() {} } });
  const desk = new PictureDesk({ wikimedia, nasa: new PacedJson({ fetchImpl, gapMs: 0, now: clock, sleep: async () => {} }), search, mode: opts.mode || 'cleared', now: clock, log: { warn() {} } });
  return { desk, calls, advance: (ms) => (now += ms), wikimedia };
}

const story = (id, title, summary = '', extra = {}) => ({ id, title, summary, source: 'Test Wire', category: 'world', link: `https://news.example/${id}`, published: NOW, ...extra });
const pickOf = async (s, opts) => {
  const { desk } = makeDesk(opts);
  const d = (await desk.decide([s], { budgetMs: 10_000 })).get(s.id);
  return { d, pick: d?.picks?.[0] || null, desk };
};

// ------------------------------------------------------------------ names and roles

describe('names: what a headline is about', () => {
  test('role words and nationalities shed, a role inside a span splits it, a possessive ends a name', () => {
    assert.deepEqual(nameSpans('US President Donald Trump says Hamas must disarm').map((x) => x.text), ['Donald Trump', 'Hamas']);
    assert.deepEqual(nameSpans('Nvidia CEO Jensen Huang says AI boom is real').map((x) => x.text), ['Nvidia', 'Jensen Huang', 'AI']);
    assert.deepEqual(nameSpans("Ukraine's Zelensky holds presser in Brussels").map((x) => x.text), ['Ukraine', 'Zelensky', 'Brussels']);
    assert.deepEqual(nameSpans('Prime Minister Keir Starmer visits the Bank of England').map((x) => x.text), ['Keir Starmer', 'Bank of England']);
    assert.deepEqual(nameSpans('Is Andy Burnham in hot water over Manchester City?').map((x) => x.text), ['Andy Burnham', 'Manchester City']);
  });
  test('a surname in the headline takes the full name the summary gives; a kicker is not the subject', () => {
    const s = subjectsOf(story('a', 'REPLAY: Starmer says the UK will meet its targets', 'Prime Minister Keir Starmer told MPs on Monday.'));
    assert.equal(s[0].text, 'Keir Starmer');
    assert.equal(s[0].start, 0);
    assert.ok(!s.some((c) => c.text === 'REPLAY'));
  });
  test('a title-cased headline borrows its capitals from the summary (no "Develops", no "Power")', () => {
    const s = subjectsOf(story('b', 'NASA Develops Batteries to Power Humanity’s Return to Moon', 'NASA engineers are testing new batteries for the Moon.'));
    assert.deepEqual(s.filter((c) => c.how !== 'topic').map((c) => c.text), ['NASA', 'Moon'], 'the Moon is a name; Develops, Batteries and Power are not');
  });
  test('ambiguous company names go to the exact article meant ("Apple" the company, not the fruit)', () => {
    const s = subjectsOf(story('c', 'Apple unveils a thinner iPhone', 'Apple said the phone ships next week.'));
    assert.ok(s.some((c) => c.text === 'Apple Inc.'));
  });
});

describe('roles: the right person in the right role', () => {
  const starmer = { desc: 'Prime Minister of the United Kingdom from 2024 to 2026', positions: ['Prime Minister of the United Kingdom'], occupations: ['politician'], countries: ['United Kingdom'], sitelinks: 125 };
  test('the role word and the country agree', () => {
    assert.ok(roleAgreement('Prime Minister Keir Starmer told MPs in London that Britain would act.', starmer));
  });
  test('another role is refused (an actor for a radio presenter of the same name)', () => {
    const actor = { desc: 'American actor (born 1981)', occupations: ['actor', 'film producer'], countries: ['United States'], sitelinks: 90 };
    assert.equal(roleAgreement('Presenter Chris Evans will leave Virgin Radio after twenty years.', actor), null);
  });
  test('the same role word in a little-known namesake from another country is refused', () => {
    const mayor = { desc: 'Spanish politician, mayor of Ribera', positions: ['mayor of Ribera'], occupations: ['politician'], countries: ['Spain'], sitelinks: 3 };
    assert.equal(roleAgreement('Mayor Ana Lopez opened a metro line in Bogotá, Colombia.', mayor), null);
  });
  test('no role in the story at all: refused', () => {
    assert.equal(roleAgreement('Keir Starmer was seen on Monday.', starmer), null);
  });
});

describe('a person: living, adult, the story about them in their role, never on a death or an accusation', () => {
  const page = { title: 'Keir Starmer', living: true };
  const facts = { types: ['human'], born: Date.UTC(1962, 8, 2), desc: 'Prime Minister of the United Kingdom', positions: ['Prime Minister of the United Kingdom'], occupations: ['politician'], countries: ['United Kingdom'], sitelinks: 125 };
  const text = 'Starmer says the UK will act. Prime Minister Keir Starmer told MPs in London.';
  const ok = { candidate: { text: 'Keir Starmer', start: 0 }, page, facts, flags: storyFlags(story('x', 'Starmer says the UK will act')), text, now: NOW };
  test('the right person in the right role passes', () => assert.equal(personProblem(ok), null));
  test('deceased, under 18, not in living people, no birth date: refused', () => {
    assert.equal(personProblem({ ...ok, facts: { ...facts, died: true } }), 'deceased');
    assert.equal(personProblem({ ...ok, facts: { ...facts, born: NOW - 15 * YEAR } }), 'under 18');
    assert.match(personProblem({ ...ok, page: { ...page, living: false } }), /living people/);
    assert.match(personProblem({ ...ok, facts: { ...facts, born: null } }), /birth date/);
  });
  test('a story of their death or of an accusation: refused', () => {
    assert.equal(personProblem({ ...ok, flags: storyFlags(story('x', 'Keir Starmer dies at 70')) }), 'a story of a death');
    assert.match(personProblem({ ...ok, flags: storyFlags(story('x', 'Keir Starmer charged over donations')) }), /accusation/);
  });
  test('named late in the headline (not its subject), or not in full: refused', () => {
    assert.match(personProblem({ ...ok, candidate: { text: 'Keir Starmer', start: 9 } }), /subject/);
    assert.match(personProblem({ ...ok, candidate: { text: 'Starmer', start: 0 }, text: 'Starmer says the UK will act. The prime minister told MPs in London.' }), /in full/);
  });
});

describe('the desk end to end (a fake Wikipedia, Wikidata, Commons and NASA)', () => {
  test('a public figure in their role: their Wikidata portrait, cleared, credited with the licence and PIXELATED, focus on the head', async () => {
    const { pick } = await pickOf(story('s1', 'Starmer says the UK will meet its climate targets', 'Prime Minister Keir Starmer told MPs in London that Britain would meet its 2030 targets.'));
    assert.equal(pick.kind, 'portrait');
    assert.equal(pick.subject.qid, 'Q6383803');
    assert.equal(pick.rights.cleared, true);
    assert.equal(pick.rights.credit, 'FILE · CHRIS MCANDREW · CC BY 3.0 · PIXELATED');
    assert.deepEqual(pick.rights.restrictions, ['personality']);
    assert.equal(pick.focus, focusOf('person', 800, 1000));
    assert.ok(pick.url.startsWith('https://thumb.wikimedia.org/') && !pick.url.includes('utm_'), pick.url);
  });
  test('wrong-person guards: another role, a little-known namesake, a disambiguation, the deceased, a child: no portrait', async () => {
    for (const s of [
      story('w1', 'Chris Evans to leave his breakfast show', 'Presenter Chris Evans will leave Virgin Radio after twenty years.'),
      story('w2', 'Ana Lopez opens a metro line in Bogotá', 'Mayor Ana Lopez opened the line in Bogotá, Colombia.'),
      story('w3', 'John Smith wins the vote', 'Senator John Smith won the vote.'),
      story('w4', 'Old King honoured with a statue', 'King Old King, the former monarch, was honoured.'),
      story('w5', 'Kid Star wins a television award', 'Actor Kid Star won the award in London.'),
    ]) {
      const { d } = await pickOf(s);
      assert.ok(!d.picks.some((p) => p.kind === 'portrait'), `${s.title}: ${JSON.stringify(d.picks.map((p) => p.subject))}`);
    }
  });
  test('a person and a company early in the headline: the person (the story is what they said)', async () => {
    const { pick } = await pickOf(story('s2', 'Nvidia CEO Jensen Huang says the AI boom is real', 'Nvidia chief executive Jensen Huang told investors in Taipei, Taiwan, demand was rising.', { category: 'tech' }));
    assert.equal(pick.subject.label, 'Jensen Huang');
  });
  test("a company: its own picture (the headquarters), never its logo", async () => {
    const { pick, d } = await pickOf(story('s3', 'Nvidia shares hit a record high', 'Shares in the technology company rose 4%.', { category: 'business' }));
    assert.equal(pick.kind, 'subject');
    assert.equal(pick.subject.label, 'Nvidia');
    assert.ok(!d.options.flatMap((o) => o.files).includes('File:Nvidia logo.svg'));
  });
  test("the story's place, confirmed by its coordinates; the Commons search when Wikidata has no picture", async () => {
    const lisbon = await pickOf(story('s4', 'Lisbon opens a new riverside tram line', 'The city council said the line opens in May.'));
    assert.equal(lisbon.pick.kind, 'place');
    assert.equal(lisbon.pick.subject.label, 'Lisbon');
    const rotterdam = await pickOf(story('s5', 'Rotterdam opens a new container port terminal', 'The port authority said it doubles capacity.'));
    assert.equal(rotterdam.pick.rights.via, 'commons:search');
    assert.equal(rotterdam.pick.rights.credit, 'FILE · FRANS BERKELAAR · CC BY 2.0 · PIXELATED');
  });
  test('a grave story: no portrait (an expression cannot be checked), never a postcard of the place; a violent one: no institution either', async () => {
    const quake = await pickOf(story('g1', 'Earthquake kills 30 in eastern Turkey', 'Rescuers searched collapsed buildings overnight.'));
    assert.equal(quake.pick, null, 'no place photo under a grave story (the map tells it)');
    const visit = await pickOf(story('g2', 'Erdogan visits quake zone as death toll rises', 'President Recep Tayyip Erdogan visited Turkey’s eastern provinces after the earthquake killed 30.'));
    assert.equal(visit.pick, null, 'his usual portrait may be a smile: not under a death toll');
    assert.ok(visit.d.options.some((o) => o.label === 'Recep Tayyip Erdoğan' && /grave story/.test(o.refused || '')));
    const speech = await pickOf(story('g2b', 'Erdogan visits new airport terminal in Ankara', 'President Recep Tayyip Erdogan opened the terminal.'));
    assert.equal(speech.pick?.kind, 'portrait', 'the same person, the same picture, on a story that is not grave');
    // a person's illness or operation is grave for the picture
    assert.equal(storyFlags(story('g2c', "What we know about Pope Leo XIV's planned lung operation this week")).grave, true);
    assert.equal(storyFlags(story('g2d', 'NASA operations centre opens in Houston')).grave, false);
    const ill = await pickOf(story('g2e', 'Erdogan undergoes heart surgery in Ankara', 'President Recep Tayyip Erdogan is recovering.'));
    assert.equal(ill.pick, null);
    const strike = await pickOf(story('g3', 'United Nations condemns missile strike on Kyiv that killed 12', 'The attack hit a residential block.'));
    assert.equal(strike.pick, null);
    assert.ok(strike.d.options.some((o) => o.label === 'United Nations' && /violence/.test(o.refused || '')));
  });
  test("space: the mission's render is refused, NASA's own photograph (never a poster, never SpaceX's) stands in", async () => {
    const { pick, d } = await pickOf(story('n1', 'Artemis II crew safely back on Earth', 'The Orion capsule splashed down in the Pacific after the Moon flyby.', { category: 'science' }));
    assert.ok(d.options.some((o) => o.label === 'Artemis II' && o.rejected.some((r) => r.problem === 'not a photograph')));
    assert.equal(pick.rights.source, 'nasa');
    assert.equal(pick.url, 'https://images-assets.nasa.gov/image/art2-crew/art2-crew~large.jpg');
    assert.equal(pick.rights.label, 'EVENT', 'taken the day before the story, the mission in its title');
    assert.equal(pick.rights.credit, 'NASA/JOEL KOWSKY');
  });
  test('kept: the same stories are never asked twice', async () => {
    const { desk, calls } = makeDesk();
    const list = [story('k1', 'Lisbon opens a new riverside tram line'), story('k2', 'Nvidia shares hit a record high', '', { category: 'business' })];
    await desk.decide(list);
    const n = calls.length;
    await desk.decide(list);
    assert.equal(calls.length, n);
  });
  test('a rate limit: nothing is decided or kept as "nothing", the queue pauses, and the next try decides', async () => {
    let limitedOnce = true;
    const { desk, advance, wikimedia } = makeDesk({ limited: () => (limitedOnce ? ((limitedOnce = false), true) : false) });
    const s = story('r1', 'Lisbon opens a new riverside tram line');
    const first = await desk.decide([s]);
    assert.ok(!first.get(s.id)?.complete);
    assert.equal(wikimedia.paused, true);
    advance(31_000);
    const second = await desk.decide([s]);
    assert.equal(second.get(s.id).picks[0].subject.label, 'Lisbon');
  });
});

describe('round 2 of the critique: topics, company buildings, NASA\'s own picture, conflict, sport, the headline\'s place', () => {
  test('a living thing the headline names in plain words: its own photograph', async () => {
    const { pick } = await pickOf(story('t1', 'Children asked to name Ealing’s new beavers', 'The beavers were released into a nature reserve.', { category: 'science' }));
    assert.equal(pick.subject.label, 'Beaver');
    assert.equal(pick.rights.credit, 'FILE · PER HARALD OLSEN · CC BY-SA 4.0 · PIXELATED');
  });
  test('never the animal where people were harmed (a shark under a shark-attack story)', async () => {
    const { d } = await pickOf(story('t2', 'Shark kills swimmer off a beach in Sydney', 'A man died after the attack.'));
    assert.ok(!d.picks.some((p) => p.subject.label === 'Shark'));
  });
  test('a company with no picture on Wikidata: a Commons photo of its headquarters, named so in the file', async () => {
    const { pick } = await pickOf(story('c1', 'Netflix to lay off 1,000 staff', 'The streaming company said the cuts were part of a plan.', { category: 'tech' }));
    assert.equal(pick.rights.via, 'commons:search');
    assert.match(pick.rights.title, /Netflix headquarters/);
    assert.equal(pick.subject.label, 'Netflix');
  });
  test("NASA's own article picture when its own credit names NASA (never on the site's name alone)", async () => {
    const url = 'https://www.nasa.gov/wp-content/uploads/2026/10/crs35.jpg';
    const base = { source: 'NASA', link: 'https://www.nasa.gov/x', category: 'science', image: url, imageWidth: 1600 };
    const { pick } = await pickOf(story('n2', 'NASA Science, Cargo Launch on SpaceX Resupply Mission', 'The mission lifted off.', { ...base, imageCredits: { [url]: ['NASA/Kim Shiflett', 'media:credit'] } }));
    assert.equal(pick.rights.source, 'nasa');
    assert.equal(pick.rights.credit, 'FILE · NASA/KIM SHIFLETT');
    const site = await pickOf(story('n3', 'NASA Science, Cargo Launch on SpaceX Resupply Mission', 'The mission lifted off.', { ...base, imageCredits: { [url]: ['NASA', 'site_name'] } }));
    assert.ok(!site.d.picks.some((p) => p.rights.via === 'nasa:article'));
    const spacex = await pickOf(story('n4', 'NASA Science, Cargo Launch on SpaceX Resupply Mission', 'The mission lifted off.', { ...base, imageCredits: { [url]: ['SpaceX', 'media:credit'] } }));
    assert.ok(!spacex.d.picks.some((p) => p.rights.via === 'nasa:article'));
  });
  test('a story of armed conflict: no postcard of the place, whatever its words of harm', async () => {
    assert.equal(storyFlags(story('v', 'Kyiv hit by Russian ballistic missiles for second day')).harm, true);
    const { pick } = await pickOf(story('v1', 'Kyiv hit by Russian ballistic missiles for second day', 'There was no warning.'));
    assert.equal(pick, null);
  });
  test('a sports story: never the city of the club', async () => {
    const { pick } = await pickOf(story('sp1', 'Leeds vs Manchester United: teams, prediction, lineups', 'The match kicks off at 8pm.', { category: 'sport' }));
    assert.equal(pick, null);
  });
  test('only a place the headline names (one met in the summary is rarely the story)', async () => {
    const { pick } = await pickOf(story('h1', 'Scale back on hake and coley, seafood charity tells shoppers', 'Shoppers in the UK are told to buy other fish.'));
    assert.equal(pick, null);
  });
  test('a country is never searched for (its own Wikidata picture or nothing); a map is never its picture', async () => {
    const { d, pick } = await pickOf(story('u1', 'US inflation rose to 3.7% in September', 'Prices rose faster than expected.', { category: 'business' }));
    assert.equal(pick, null);
    assert.ok(d.options.some((o) => o.label === 'United States' && o.rejected.some((r) => /photograph|format/.test(r.problem))));
  });
  test('a searched city photo: no people in it, no old photograph; the right one is found', async () => {
    const { desk } = makeDesk();
    const s = story('ls', 'Lisbon tram line reopens after repairs', 'The tram will run every ten minutes.');
    PAGES.Lisbon.qid = 'Q597';
    const saved = FACTS.Q597.imgs;
    FACTS.Q597.imgs = [];
    try {
      const pick = (await desk.decide([s])).get('ls').picks[0];
      assert.match(pick.rights.title, /Graca/);
    } finally {
      FACTS.Q597.imgs = saved;
    }
  });
});

describe("NASA's own article pictures, credited in their figures (the live feed's markup, 17 Oct)", () => {
  const figure = (src, credit) => `<figure><a href="${src}"><img src="${src}" width="1600" height="1067" /></a></figure><figcaption class="hds-caption padding-y-2"><div class="hds-caption-text p-sm margin-0">A caption.</div><div class="hds-credits">${credit}</div></figcaption>`;
  const nasaStory = (credit) => {
    const url = 'https://www.nasa.gov/wp-content/uploads/2026/10/ksc-20261013-ph-ajn01-0009.jpg';
    const [c] = feedCandidates({ 'content:encoded': figure(url, credit) });
    return { story: { id: 'n', title: 'I Am Artemis', source: 'NASA', link: 'https://www.nasa.gov/x', image: c.url, imageCredits: c.credit ? { [c.url]: [c.credit, c.creditVia] } : undefined }, c };
  };
  test("the figure's own credit is read from the feed (class hds-credits)", () => {
    const { c } = nasaStory('NASA/Amber Jean Notvest');
    assert.equal(c.credit, 'NASA/Amber Jean Notvest');
    assert.equal(c.creditVia, 'html');
  });
  test("NASA's photographer: cleared under NASA's guidelines; a US Navy picture: a federal work in the public domain", () => {
    assert.equal(nasaOwnPicture(nasaStory('NASA/Amber Jean Notvest').story).rights.credit, 'FILE · NASA/AMBER JEAN NOTVEST');
    const navy = nasaOwnPicture(nasaStory('US Navy').story);
    assert.equal(navy.rights.licence.id, 'PD-USGov');
    assert.equal(navy.rights.credit, 'FILE · US NAVY · PD');
  });
  test("a picture shared with ESA or a university (Hubble's), or ESA's own, is not NASA's to give", () => {
    assert.equal(nasaOwnPicture(nasaStory('NASA, ESA, Michael Jones (California Institute of Technology)').story), null);
    assert.equal(nasaOwnPicture(nasaStory('ESA, Rosetta').story), null);
  });
});

describe('round 3 of the critique: no wrong person, no wrong sense, no wrong species, no postcard under a disaster', () => {
  test('a cinema named after a prince is not the prince (the wrong person the hand check found)', async () => {
    const { d } = await pickOf(story('wp1', 'Cult venue Prince Charles cinema ‘saved’ after lease renewal signed', 'The London cinema near Leicester Square in the UK has signed a new lease.', { category: 'business' }));
    assert.ok(!d.picks.some((p) => p.kind === 'portrait'), JSON.stringify(d.options.map((o) => [o.label, o.refused])));
  });
  test('every word of the written name must be in the article title', () => {
    const page = { title: 'Charles III', living: true };
    const facts = { types: ['human'], born: Date.UTC(1948, 10, 14), desc: 'King of the United Kingdom', positions: ['Prince of Wales'], countries: ['United Kingdom'], sitelinks: 200 };
    const why = personProblem({ candidate: { text: 'Prince Charles', start: 0 }, page: { ...page, redirected: true }, facts, flags: storyFlags(story('x', 'Prince Charles visits Wales')), text: 'Prince Charles visits Wales. The prince met people in the UK.', now: NOW });
    assert.match(why, /not the article/);
  });
  test("an everyday word stands for a company only where the story speaks of one (the Amazon is also a forest)", () => {
    assert.equal(aliasFor('Amazon', story('a', 'Brazil’s Amazon deforestation hits lowest level on record', 'Forest loss fell sharply.')), 'Amazon rainforest', 'the forest, never the company');
    assert.equal(aliasFor('Amazon', story('a2', 'Amazon wins a court case in Delaware', 'The ruling...')), null, 'neither, when the story does not say');
    assert.equal(aliasFor('Amazon', story('b', 'Amazon to cut 1,000 jobs', 'The company said...', { category: 'business' })), 'Amazon (company)');
    assert.equal(aliasFor('Webb', story('c', 'Webb spots a distant galaxy', 'The telescope saw...')), 'James Webb Space Telescope');
    assert.equal(aliasFor('NASA', story('d', 'x')), 'NASA');
    // an acronym that names other bodies too (the second sample's hand check: the Entertainment Software Association)
    assert.equal(aliasFor('ESA', story('e1', 'ESA targets Anbernic emulation handhelds as "superfake" piracy enablers')), null);
    assert.equal(aliasFor('ESA', story('e2', 'ESA launches a new weather satellite', 'The rocket lifted off from Kourou.')), 'European Space Agency');
    assert.equal(aliasFor('ICC', story('e3', 'ICC confirms Champions Trophy schedule')), null);
    assert.equal(aliasFor('ICC', story('e4', 'Navi Pillay slams US sanctions against ICC')), 'International Criminal Court');
    assert.ok(!subjectsOf(story('e5', 'ESA targets Anbernic emulation handhelds as "superfake" piracy enablers', '', { category: 'tech' })).some((c) => /^ESA$|Space Agency/.test(c.text)), 'nor asked as written (Wikipedia sends "ESA" to the space agency)');
  });
  test('a topic only in a science or nature story, never a broad group, never the head alone after a two-word name', () => {
    const topics = (t, extra = {}) => subjectsOf(story('t', t, '', extra)).filter((c) => c.how === 'topic').map((c) => c.text);
    assert.deepEqual(topics('US inflation rose to 3.7% in September', { category: 'business' }), [], 'not the flower');
    assert.ok(!topics('Pollinating insects flock to plants gardeners think of as weeds', { category: 'science' }).includes('Plant'));
    const red = topics('Red squirrel project opens £250k community grant', { category: 'science' });
    assert.ok(red.includes('Red squirrel'));
    assert.ok(!red.includes('Squirrel'), 'never a grey squirrel under a red squirrel story');
    assert.equal(singular('colonies'), 'colony');
    assert.equal(singular('species'), 'species');
  });
  test('a disaster in the headline: no postcard of its place', async () => {
    assert.equal(storyFlags(story('f', 'Fire ravages oldest covered food market in Lisbon')).disaster, true);
    const { pick } = await pickOf(story('f1', 'Fire ravages oldest covered food market in Lisbon', 'Nobody was hurt.'));
    assert.equal(pick, null);
  });
});

describe('round 4 of the critique: the place the headline opens on, no seat of government out of place, legible credits', () => {
  test("a place's picture only when the headline opens on it (not a city met at its end)", async () => {
    const late = await pickOf(story('pl1', 'Tech startup Acme plans to open its new offices in Lisbon', 'The company will hire 200 people.', { category: 'tech' }));
    assert.equal(late.pick, null);
    const desk = makeDesk().desk;
    assert.equal(desk.plan(story('pl2', 'Lisbon opens a new riverside tram line')).placeAt, 0);
    assert.equal(desk.plan(story('pl3', 'Stinky business: Lisbon tram depot smells')).placeAt, 0, 'after a kicker');
  });
  test('a seat of government is the picture of a country only under a story about government', async () => {
    const westminster = { title: 'File:Palace of Westminster.jpg', url: 'https://thumb.wikimedia.org/x.jpg', width: 1280, height: 720, mime: 'image/jpeg' };
    assert.match(pictureProblem(westminster, { kind: 'place', flags: storyFlags(story('g', 'UK growth forecast upgraded')) }), /seat of government/);
    assert.equal(pictureProblem(westminster, { kind: 'place', flags: storyFlags(story('g', 'UK government announces new sanctions')) }), null);
    const economy = await pickOf(story('g1', 'UK growth forecast upgraded as economy recovers', 'The economy grew.', { category: 'business' }));
    assert.equal(economy.pick, null);
    assert.ok(economy.d.options.some((o) => o.label === 'United Kingdom' && o.rejected.some((r) => /seat of government/.test(r.problem))));
    const politics = await pickOf(story('g2', 'UK government announces new sanctions on oil traders', 'Ministers said...'));
    assert.match(politics.pick?.rights.title || '', /Westminster/);
  });
  test('a seat of government however the file writes it ("WashMonument_WhiteHouse.jpg"); a country never stands for a place within it', async () => {
    const wh = { title: 'File:WashMonument WhiteHouse.jpg', url: 'https://thumb.wikimedia.org/x.jpg', width: 1280, height: 720, mime: 'image/jpeg' };
    assert.match(pictureProblem(wh, { kind: 'place', flags: storyFlags(story('w', 'US archbishop says Catholics in army should not take part')) }), /seat of government/);
    const desk = makeDesk().desk;
    const plan = desk.plan(story('in1', "Fuel crisis hits Turkey's Istanbul, long lines at gas stations"));
    assert.equal(plan.place?.name, 'Istanbul');
    const { d } = await pickOf(story('in2', "Fuel crisis hits Turkey's Istanbul, long lines at gas stations", 'Drivers queued for hours.'));
    assert.ok(!d.picks.some((p) => p.subject.label === 'Turkey'), 'the capital is not Istanbul');
  });
  test('a state acting at the head of the headline is a story about government', () => {
    const { desk } = makeDesk();
    assert.equal(desk.plan(story('sa1', 'Russia arrests Japanese reporter for alleged espionage')).flags.statecraft, true);
    assert.equal(desk.plan(story('sa2', 'France seizes tanker suspected of belonging to a shadow fleet')).flags.statecraft, true);
    assert.ok(!desk.plan(story('sa3', 'US inflation rose to 3.7% in September')).flags.statecraft);
  });
  test("no city's postcard under a story about nature, and none under an outbreak", async () => {
    assert.equal(storyFlags(story('e', 'Brazil’s Amazon deforestation hits lowest level on record')).environment, true);
    assert.equal(storyFlags(story('o', 'Kenya confirms second Ebola case')).disaster, true);
    assert.equal(storyFlags(story('o2', "'Finish what we started': France braces for return of the Yellow Vests protests")).disaster, true, 'unrest: no postcard either');
    assert.equal(storyFlags(story('o3', 'In Brazil, thousands march fearing return of Bolsonaro presidency')).disaster, true, 'a march too');
    assert.equal(storyFlags(story('o4', 'Brazil inflation eased in March')).disaster, false, 'never the month');
    const { pick } = await pickOf(story('e1', 'Lisbon launches plan to protect its coastal wetlands', 'The city council voted...'));
    assert.equal(pick, null);
  });
  test("no city's postcard under any grave story, even one where nobody was harmed", async () => {
    const flags = storyFlags(story('gr', 'Lisbon faces a deepening housing crisis'));
    assert.equal(flags.grave, true);
    assert.equal(flags.harm, false);
    const { pick } = await pickOf(story('gr1', 'Lisbon faces a deepening housing crisis', 'Rents rose again.'));
    assert.equal(pick, null);
  });
  test("an original's URL kept from before is served as Commons' standard rendition; its size is judged by the original", async () => {
    const { desk } = makeDesk();
    desk.kept.set('s:Bank of America headquarters', [{ title: 'File:Bank of America Tower 001.jpg', url: 'https://upload.wikimedia.org/wikipedia/commons/9/99/Bank_of_America_Tower_001.jpg', width: 1280, height: 960, origWidth: 1024 }], 60_000);
    const [f] = await desk.commonsSearch('Bank of America headquarters');
    assert.equal(f.url, 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/Bank_of_America_Tower_001.jpg/960px-Bank_of_America_Tower_001.jpg');
    assert.deepEqual([f.width, f.height], [960, 720]);
    const base = { title: 'File:HomePod.png', url: 'https://thumb.wikimedia.org/x/500px-HomePod.png', mime: 'image/png' };
    assert.equal(pictureProblem({ ...base, width: 500, height: 361, origWidth: 739 }, { kind: 'other' }), null, 'a 739 px original served at 500 px: no upscaling');
    assert.match(pictureProblem({ ...base, width: 500, height: 361, origWidth: 500 }, { kind: 'other' }), /too small/);
  });
  test("a person's picture airs framed as a portrait (the whole head on screen); any other picture is cover-cropped", async () => {
    const { desk } = makeDesk();
    const person = story('pf1', 'Starmer says the UK will meet its climate targets', 'Prime Minister Keir Starmer told MPs in London that Britain would meet its 2030 targets.');
    const city = story('pf2', 'Lisbon opens a new riverside tram line');
    await desk.decide([person, city]);
    desk.apply(person);
    desk.apply(city);
    assert.equal(person.imageFit, 'portrait');
    assert.equal(city.imageFit, undefined);
  });
  test("a logo by its category is not a photograph (HMV's \"Nipper in logos\")", () => {
    const hmv = { title: "File:His Master's Voice EG 962.jpg", url: 'https://thumb.wikimedia.org/x.jpg', width: 1007, height: 1010, mime: 'image/jpeg', categories: "His Master's Voice|HMV|Nipper in logos" };
    assert.equal(pictureProblem(hmv, { kind: 'other' }), 'not a photograph');
  });
  test('people meeting are never the picture of a place or a thing', () => {
    const meeting = { title: 'File:NATO Defense Ministers Meet at NATO Headquarters (5531624).jpg', url: 'https://thumb.wikimedia.org/x.jpg', width: 1280, height: 720, mime: 'image/jpeg' };
    assert.match(pictureProblem(meeting, { kind: 'other', flags: {} }), /people|occasion/);
  });
  test("the Amazon of a deforestation story is the forest: its own photograph, a natural place even under a story about nature", async () => {
    const { pick } = await pickOf(story('am1', 'Brazil’s Amazon deforestation hits lowest level on record', 'Forest loss in the Amazon fell sharply.', { category: 'environment' }));
    assert.equal(pick?.subject.label, 'Amazon rainforest');
    assert.match(pick.rights.title, /Amazon Manaus forest/);
    const fire = await pickOf(story('am2', 'Brazil investigates Amazon wildfires that disrupt daily life', 'Fires burned...', { category: 'environment' }));
    assert.equal(fire.pick, null, 'never under a disaster');
  });
  test("a living thing whose Wikidata picture is a drawing: a Commons photograph named so (alive: never a museum's specimen)", async () => {
    const { pick } = await pickOf(story('hk1', 'Scale back on hake and coley, seafood charity tells shoppers', 'Fish stocks are falling.', { category: 'science' }));
    assert.equal(pick?.subject.label, 'Hake');
    assert.match(pick.rights.title, /Fresh hake/);
    assert.equal(pick.rights.via, 'commons:search');
  });
  test('a sports story about a sportsperson known in many languages: the player, by his exact article', async () => {
    const { pick } = await pickOf(story('sp2', 'Bayern’s Michael Olise sent off for two yellows within seconds', 'The winger was dismissed in the Bundesliga match.', { category: 'sport' }));
    assert.equal(pick?.subject.label, 'Michael Olise');
    // a sports story that never says "player": the sport is in the headline
    const yellows = await pickOf(story('sp4', 'Bayern’s Michael Olise sent off for two yellows within seconds', 'Bayern lost 2-1.'));
    assert.equal(yellows.pick?.subject.label, 'Michael Olise');
    const notSport = await pickOf(story('sp3', 'Michael Olise opens a bakery in his home town', 'The shop sells bread.', { category: 'business' }));
    assert.ok(!notSport.d.picks.some((p) => p.kind === 'portrait'), 'outside a sports story his role is not given');
  });
  test("a search of someone's home or a raid is a story of suspicion: no portrait", () => {
    assert.equal(storyFlags(story('j1', "Immigration agents search Congresswoman Ilhan Omar's home")).jeopardy, true);
    assert.equal(storyFlags(story('j2', 'Police raid offices of opposition party')).jeopardy, true);
    assert.equal(storyFlags(story('j3', 'Google search traffic falls')).jeopardy, false);
  });
  test('a decision made while a source did not answer is decided again once it can be asked (the better subject wins)', async () => {
    let once = true;
    const { desk, advance } = makeDesk({ limited: (u) => u.searchParams.get('generator') === 'search' && (once ? ((once = false), true) : false) });
    const s = story('pa1', 'Lisbon and Netflix sign a film studio deal', 'The company will build a studio.', { category: 'business' });
    const first = (await desk.decide([s])).get(s.id);
    assert.equal(first.complete, false);
    assert.equal(first.picks[0].subject.label, 'Lisbon', 'the picture found meanwhile stands');
    advance(31_000);
    const second = (await desk.decide([s])).get(s.id);
    assert.equal(second.picks[0].subject.label, 'Netflix');
    assert.notEqual(second.complete, false);
  });
});

describe('on the story: only the cleared picture; the outlet photo kept aside for a private preview', () => {
  test("apply(): the cleared pick replaces the outlet's photo; with no pick, nothing airs", async () => {
    const { desk } = makeDesk();
    const s = story('a1', 'Lisbon opens a new riverside tram line', '', { image: 'https://i.guim.co.uk/outlet.jpg', imageCredit: 'Reuters' });
    const none = story('a2', 'Council approves a new budget', '', { image: 'https://ichef.bbci.co.uk/x.jpg' });
    await desk.assign([s, none], { budgetMs: 5000 });
    assert.equal(s.imageRights.cleared, true);
    assert.equal(s.image, s.imageRights.url);
    assert.equal(s.outletPicture.image, 'https://i.guim.co.uk/outlet.jpg');
    assert.equal(none.image, null);
    assert.equal(none.outletPicture.image, 'https://ichef.bbci.co.uk/x.jpg');
  });
  test('preview mode: the outlet photo comes back where nothing cleared fits, marked not cleared', async () => {
    const { desk } = makeDesk({ mode: 'preview' });
    const none = story('p1', 'Council approves a new budget', '', { image: 'https://ichef.bbci.co.uk/x.jpg' });
    await desk.assign([none], { budgetMs: 5000 });
    assert.equal(none.image, 'https://ichef.bbci.co.uk/x.jpg');
    assert.equal(none.imageRights.cleared, false);
    assert.equal(none.imageRights.licence.id, 'OUTLET');
  });
  test('a picture that will not download: the next cleared one, or none', async () => {
    const { desk } = makeDesk();
    const s = story('f1', 'Lisbon opens a new riverside tram line');
    await desk.assign([s], { budgetMs: 5000 });
    const first = s.image;
    desk.failed(s, 'HTTP 404');
    assert.notEqual(s.image, first);
  });
  test("the operator's own local feed keeps its picture (the offline demo), recorded as the operator's", () => {
    const { desk } = makeDesk();
    const s = { id: 'l1', title: 'Panama Canal reopens', local: true, image: 'file:///srv/feeds/img/canal.png', source: 'Ledger Line' };
    desk.apply(s);
    assert.equal(s.image, 'file:///srv/feeds/img/canal.png');
    assert.equal(s.imageRights.source, 'operator');
  });
  test('a news-desk refresh that lends an outlet photo is undone by the next apply', async () => {
    const { desk } = makeDesk();
    const s = story('b1', 'Lisbon opens a new riverside tram line');
    await desk.assign([s], { budgetMs: 5000 });
    const cleared = s.image;
    Object.assign(s, { image: 'https://lender.example/photo.jpg', imageFrom: 'other', imageCredit: 'Other Outlet' });
    desk.apply(s);
    assert.equal(s.image, cleared);
    assert.equal(s.imageFrom, undefined);
  });
});

describe('what a picture must be', () => {
  const ok = { url: 'https://thumb.wikimedia.org/x/1280px-a.jpg', width: 1280, height: 720, mime: 'image/jpeg', title: 'File:Lisbon skyline.jpg', description: '', categories: '' };
  test('a photograph, big enough, of a usable shape, from Commons', () => {
    assert.equal(pictureProblem(ok), null);
    assert.match(pictureProblem({ ...ok, width: 500, height: 300 }), /too small/);
    assert.match(pictureProblem({ ...ok, width: 720, height: 1280 }), /shape/, 'a tall picture under a place');
    assert.equal(pictureProblem({ ...ok, width: 800, height: 1000 }, { kind: 'person' }), null, 'a portrait for a person');
    assert.match(pictureProblem({ ...ok, url: 'https://example.org/a.jpg' }), /Commons/);
  });
  test('never drawn, mapped, rendered or generated', () => {
    assert.equal(pictureProblem({ ...ok, title: 'File:Map of Lisbon.png' }), 'not a photograph');
    assert.equal(pictureProblem({ ...ok, description: "An artist's impression of the probe" }), 'not a photograph');
    assert.equal(pictureProblem({ ...ok, categories: 'AI-generated images|Lisbon' }), 'generated image');
    assert.equal(pictureProblem({ ...ok, title: 'File:Lisbon - oil on canvas.jpg', description: 'Oil on canvas' }), 'not a photograph');
    assert.equal(pictureProblem({ ...ok, description: 'The tower, a symbol of the city, seen from the river' }), null, 'a description may say "symbol"');
  });
  test('never an event (another flood under a flood story would mislead), never a crowd under a grave story', () => {
    assert.equal(pictureProblem({ ...ok, title: 'File:Lisbon flood 1967.jpg' }), 'shows an event');
    assert.equal(pictureProblem({ ...ok, description: 'Protesters in the square' }), 'shows an event');
    assert.match(pictureProblem({ ...ok, description: 'Tourists on the beach' }, { flags: { grave: true } }), /crowd or leisure/);
    assert.equal(pictureProblem({ ...ok, description: 'Tourists on the beach' }), null);
  });
});

describe('NASA, what an item is, where a place is', () => {
  test("a NASA photograph by NASA's photographer; never a poster, a graphic or a third party's picture", () => {
    const item = (d) => ({ data: [{ nasa_id: 'x', media_type: 'image', title: 'Artemis II Crew', description: '', keywords: ['Artemis II'], date_created: '2026-01-01T00:00:00Z', ...d }], links: [{ href: 'https://images-assets.nasa.gov/image/x/x~large.jpg' }] });
    assert.ok(nasaItem(item({ photographer: 'NASA/Joel Kowsky' }), { query: 'Artemis II' }));
    assert.equal(nasaItem(item({ title: 'Artemis II Ascent Graphic' }), { query: 'Artemis II' }), null);
    assert.equal(nasaItem(item({ photographer: 'SpaceX' }), { query: 'Artemis II' }), null);
    assert.equal(nasaItem(item({ photographer: 'NASA/ESA' }), { query: 'Artemis II' }), null);
    assert.equal(nasaItem(item({ description: "An artist's concept of the lander" }), { query: 'Artemis II' }), null);
    assert.equal(nasaItem(item({ title: 'Crew portrait', keywords: [] }), { query: 'Artemis II' }), null, 'not about the subject');
  });
  test('an item is a person, a place, a thing, or nothing (an event, a concept, a party, a militant group)', () => {
    assert.equal(itemKind({ types: ['human'] }), 'person');
    assert.equal(itemKind({ types: ['city', 'national capital'], coords: { lat: 1, lon: 1 } }), 'place');
    assert.equal(itemKind({ types: ['business', 'public company'] }), 'thing:org');
    assert.equal(itemKind({ types: ['human spaceflight'] }), 'thing:mission');
    assert.equal(itemKind({ types: ['bridge'] }), 'thing:structure');
    assert.equal(itemKind({ types: ['war'] }), null);
    assert.equal(itemKind({ types: ['political party'] }), null);
    assert.equal(itemKind({ types: ['militant group'] }), null);
    assert.equal(itemKind({ types: ['fruit'] }), null);
    assert.equal(itemKind({ types: ['election'] }), null);
  });
  test("a place's item must stand where the gazetteer puts it", () => {
    const lisbon = lookupPlace('Lisbon');
    assert.equal(near(lisbon, { lat: 38.71, lon: -9.14 }), true);
    assert.equal(near(lisbon, { lat: 41.2, lon: -80.7 }), false, 'Lisbon, Ohio');
    assert.deepEqual(placeTitlesOf(lookupPlace('Georgia') || { kind: 'country', name: 'Georgia' }).slice(0, 2), ['Georgia', 'Georgia (country)']);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickEntity, entityOf, namesMatch, Wikidata } from '../server/freepics/wikidata.js';

// candidates shaped as Wikidata returned them during calibration (7 Oct): search rank, description, P31, sitelinks
const sanchez = [
  { qid: 'Q6070218', label: 'Pedro Sánchez', description: 'Prime Minister of Spain since 2018', rank: 0, classes: ['Q5'], sitelinks: 95 },
  { qid: 'Q109858307', label: 'Pedro Sánchez', description: '1526-1609', rank: 1, classes: ['Q5'], sitelinks: 1, died: 1609 },
  { qid: 'Q3374128', label: 'Pedro Sánchez II', description: 'Spanish painter, active 1454-circa 1468', rank: 2, classes: ['Q5'], sitelinks: 3, died: 1468 },
  { qid: 'Q57012132', label: 'Pedro L Sanchez', description: 'researcher', rank: 3, classes: ['Q5'], sitelinks: 0 },
];
const mistral = [
  { qid: 'Q2981505', label: 'Mistral', description: '2004 Mistral-class amphibious assault ship', rank: 0, classes: ['Q1185562'], sitelinks: 12 },
  { qid: 'Q181606', label: 'mistral', description: 'strong, cold northwesterly wind in France', rank: 1, classes: ['Q118131'], sitelinks: 50 },
  { qid: 'Q119718658', label: 'Mistral AI', description: 'French AI company', rank: 2, classes: ['Q4830453'], sitelinks: 30 },
];
const meloni = [
  { qid: 'Q3851540', label: 'Meloni', description: 'Italian painter (1450-1500)', rank: 0, classes: ['Q5'], sitelinks: 2, died: 1500 },
  { qid: 'Q451791', label: 'Giorgia Meloni', description: 'Prime Minister of Italy since 2022', rank: 1, classes: ['Q5'], sitelinks: 110 },
];

test('a person: the living office-holder, never the namesake painter, and only with a clear margin', () => {
  const r = pickEntity(sanchez, { kind: 'person', context: "Pedro Sánchez's bid to turn Spain's housing crunch into an electoral victory", year: 2026 });
  assert.equal(r.best?.qid, 'Q6070218');
  // a person long dead is not who a news story is about...
  assert.equal(pickEntity(meloni, { kind: 'person', context: 'Meloni says Italy will back the plan', year: 2026 }).best?.qid, 'Q451791');
  // ...unless the story is about the death or an anniversary, and then its words must still confirm who
  assert.equal(pickEntity([meloni[0]], { kind: 'person', context: 'Meloni anniversary exhibition opens', year: 2026 }).best, null, 'a face is never matched on the name alone');
  assert.equal(pickEntity([meloni[0]], { kind: 'person', context: 'Anniversary exhibition for the Renaissance painter Meloni', year: 2026 }).best?.qid, 'Q3851540');
});

test('a kind the item is not is out, not merely behind (Mistral the ship under an AI story)', () => {
  const r = pickEntity(mistral, { kind: 'organisation', context: 'Mistral raises funds for its AI models', year: 2026 });
  assert.equal(r.best?.qid, 'Q119718658');
  assert.equal(pickEntity(mistral, { kind: 'person', context: 'Mistral raises funds', year: 2026 }).best, null);
});

test('a name read off a headline (no kind, no hint) must be confirmed by the story words, or nothing', () => {
  // "Mistral" with no brief: the ship, the wind and the company are all namesakes; the story says "AI"
  const ai = pickEntity(mistral, { context: 'Mistral unveils a new AI model for European companies', requireContext: true, name: 'Mistral', year: 2026 });
  assert.equal(ai.best?.qid, 'Q119718658');
  // the story never says what Mistral is: no guess
  assert.equal(pickEntity(mistral, { context: 'Mistral strikes back', requireContext: true, name: 'Mistral', year: 2026 }).best, null);
});

test('two candidates the story cannot tell apart: no guess', () => {
  const twins = [
    { qid: 'Q1', label: 'Springfield', description: 'city in Illinois', rank: 0, classes: ['Q515'], sitelinks: 40 },
    { qid: 'Q2', label: 'Springfield', description: 'city in Missouri', rank: 1, classes: ['Q515'], sitelinks: 40 },
  ];
  assert.equal(pickEntity(twins, { kind: 'city', context: 'Springfield council votes on budget', year: 2026 }).best, null);
  assert.equal(pickEntity(twins, { kind: 'city', context: 'Springfield, Missouri council votes on budget', year: 2026 }).best?.qid, 'Q2');
});

test('scholarly articles, surnames and disambiguation pages never stand for a news name', () => {
  const junk = [
    { qid: 'Q9', label: 'Boots', description: 'scientific article published in 2001', rank: 0, classes: ['Q13442814'], sitelinks: 0 },
    { qid: 'Q8', label: 'Boots', description: 'family name', rank: 1, classes: ['Q101352'], sitelinks: 2 },
    { qid: 'Q6123139', label: 'Boots', description: 'UK based pharmacy shop chain', rank: 2, classes: ['Q507619'], sitelinks: 8 },
  ];
  assert.equal(pickEntity(junk, { kind: 'organisation', context: 'Boots sold in £7bn deal to pharmacy family', year: 2026 }).best?.qid, 'Q6123139');
});

test('a prefix match is not the name, and "who" confirms nothing (live case: "Trump" → a trumpeter, 7 Oct)', async () => {
  assert.equal(namesMatch('Trump', 'trumpeter'), false);
  assert.equal(namesMatch('Trump', 'Trump Tower'), true);
  assert.equal(namesMatch('Meloni', 'Giorgia Meloni'), true);
  const search = [
    { id: 'Q16944413', label: 'Trump', description: 'family name' },
    { id: 'Q12377274', label: 'trumpeter', description: 'musician who plays the trumpet' },
  ];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('action') === 'wbsearchentities') return { ok: true, json: async () => ({ search }) };
    const ids = u.searchParams.get('ids').split('|');
    return { ok: true, json: async () => ({ entities: Object.fromEntries(ids.map((id) => [id, { id, descriptions: { en: { value: search.find((s) => s.id === id).description } }, claims: {}, sitelinks: {} }])) }) };
  };
  const wd = new Wikidata({ fetchImpl });
  assert.equal(await wd.resolve('Trump', { context: 'The Republican candidates who are walking a Trump tightrope', requireContext: true }), null);
});

test('entityOf keeps what a picture search needs', () => {
  const item = {
    id: 'Q597',
    labels: { en: { value: 'Lisbon' } },
    descriptions: { en: { value: 'capital city of Portugal' } },
    sitelinks: { enwiki: {}, ptwiki: {} },
    claims: {
      P31: [{ mainsnak: { datavalue: { value: { id: 'Q5119' } } } }],
      P18: [{ rank: 'deprecated', mainsnak: { datavalue: { value: 'Old.jpg' } } }, { rank: 'normal', mainsnak: { datavalue: { value: 'Lisbon skyline.jpg' } } }],
      P373: [{ mainsnak: { datavalue: { value: 'Lisbon' } } }],
      P625: [{ mainsnak: { datavalue: { value: { latitude: 38.7, longitude: -9.1 } } } }],
    },
  };
  const e = entityOf(item, 'city');
  assert.equal(e.image, 'Lisbon skyline.jpg', 'a deprecated P18 is skipped');
  assert.deepEqual(e.coords, { lat: 38.7, lon: -9.1 });
  assert.equal(e.commonsCategory, 'Lisbon');
  assert.equal(e.sitelinks, 2);
});

test('resolve: one search and one batch read, cached, and nothing when Wikidata is down', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const u = new URL(url);
    if (u.searchParams.get('action') === 'wbsearchentities') return { ok: true, json: async () => ({ search: [{ id: 'Q451791', label: 'Giorgia Meloni', description: 'Prime Minister of Italy since 2022' }] }) };
    return {
      ok: true,
      json: async () => ({ entities: { Q451791: { id: 'Q451791', labels: { en: { value: 'Giorgia Meloni' } }, descriptions: { en: { value: 'Prime Minister of Italy since 2022' } }, sitelinks: { a: 1, b: 1, c: 1 }, claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }], P18: [{ mainsnak: { datavalue: { value: 'Meloni 2023.jpg' } } }] } } } }),
    };
  };
  const wd = new Wikidata({ fetchImpl });
  const e = await wd.resolve('Giorgia Meloni', { kind: 'person', context: 'Italy prime minister' });
  assert.equal(e.image, 'Meloni 2023.jpg');
  await wd.resolve('Giorgia Meloni', { kind: 'person', context: 'Italy prime minister' });
  assert.equal(calls, 2, 'the second resolve is served from the cache');
  const down = new Wikidata({ fetchImpl: async () => ({ ok: false, status: 503 }), retryMs: 0 });
  await assert.rejects(down.resolve('Lisbon', { kind: 'city' }), /503/);
});

test('a Wikidata hiccup (timeout, 429, 5xx) is tried once more; a 4xx is final', async () => {
  let calls = 0;
  const flaky = async () => (++calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ search: [] }) });
  const wd = new Wikidata({ fetchImpl: flaky, retryMs: 0 });
  assert.equal(await wd.resolve('Ukraine', { kind: 'country' }), null);
  assert.equal(calls, 2);
  let n = 0;
  const gone = new Wikidata({ fetchImpl: async () => (n++, { ok: false, status: 404 }), retryMs: 0 });
  await assert.rejects(gone.resolve('X', {}), /404/);
  assert.equal(n, 1);
});

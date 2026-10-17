// Credits and rights (server/compliance/credits.js, rights.json; compliance.md §6). The test that fails when an asset
// without a rights record reaches air or an export: every asset file in the repository has a class; every picture,
// clip and data source an episode puts on screen has a record, or the episode is refused for export and, with
// RIGHTS_GATE=strict, the asset is taken off air; and the description credits each one as its licence asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanRepoAssets, fileClass, auditItem, creditsFor, rightsGate, loadRights } from '../server/compliance/credits.js';
import { preflight } from '../server/compliance/index.js';

const QUIET = { generatedAt: new Date().toISOString(), elections: [] };
const ENV = { EDITORIAL_CONTACT: 'editor@example.org', EDITORIAL_RESPONSIBLE: 'The owner' };

test('every asset file in the repository has a rights record (a new picture, sound, font or data file without one fails here)', () => {
  const assets = scanRepoAssets();
  assert.ok(assets.length > 100, `${assets.length} asset files scanned`);
  const orphans = assets.filter((a) => !a.class);
  assert.deepEqual(orphans.map((a) => a.path), [], 'add each to server/compliance/rights.json "files" with its class');
  const rights = loadRights();
  for (const a of assets) assert.ok(rights.classes[a.class], `${a.path}: class ${a.class} is defined`);
  // and the check bites: a file nobody registered is caught
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));
  fs.mkdirSync(path.join(dir, 'public', 'sounds'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'public', 'sounds', 'sting.wav'), 'RIFF');
  assert.deepEqual(scanRepoAssets(dir).map((a) => [a.path, a.class]), [['public/sounds/sting.wav', null]]);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(fileClass('public/js/scenes/worlddata.js'), 'natural-earth');
});

/** An episode with a cleared picture, an outlet's photo without a licence, a FILE clip and a map. */
function episode() {
  return {
    id: 'e1',
    // (an AI writer's: the offline writer's news is never published at all, rule offline-writer)
    provider: 'openai',
    program: { id: 'world-now' },
    storyIds: ['s1', 's2', 's3'],
    segments: [
      { type: 'story', storyId: 's1', source: 'Harbour Herald', outlet: 'Harbour Herald', hasImage: true, imageRights: { licence: 'CC BY 4.0', credit: 'Jane Doe', source: 'Wikimedia Commons' }, location: { place: 'LISBON' } },
      { type: 'story', storyId: 's2', source: 'Pixel Wire / Photo: Agency X', outlet: 'Pixel Wire', hasImage: true, imageCredit: 'Agency X', imageCreditVia: 'media:credit' },
      { type: 'cross', storyId: 's3', source: 'Circuit Weekly', outlet: 'Circuit Weekly', footage: { id: 'v1', credit: 'FILE · Joao Silva · CC BY-SA 4.0' } },
    ],
    rundown: [],
  };
}

test('an episode\'s assets: the outlet photo with no licence is the one without a record; credits list everything else', () => {
  const a = auditItem(episode());
  assert.deepEqual(a.missing.map((m) => [m.kind, m.storyId]), [['picture', 's2']]);
  assert.match(a.missing[0].reason, /no licence on record/);
  const credits = creditsFor(episode());
  assert.ok(credits.some((c) => /^Reporting: Harbour Herald, Pixel Wire, Circuit Weekly$/.test(c)), credits.join(' | '));
  assert.ok(credits.some((c) => /Jane Doe \(CC BY 4\.0\)/.test(c)));
  assert.ok(credits.some((c) => /Footage: Joao Silva \(CC BY-SA 4\.0, Wikimedia Commons\)/.test(c)));
  assert.ok(credits.includes('Map data: Natural Earth'));
  assert.ok(credits.some((c) => /^Voices: synthetic/.test(c)));
});

test('WORLD WEATHER credits Open-Meteo (CC BY 4.0) and GDACS; the demo forecast is never publishable', () => {
  const w = { id: 'w1', provider: 'weather', program: { id: 'world-weather' }, segments: [{ type: 'story', text: 'Sunny.' }], weather: { source: 'OPEN-METEO · GDACS', warnings: [{ id: 'g1' }] } };
  const credits = creditsFor(w);
  assert.ok(credits.includes('Weather data by Open-Meteo.com (CC BY 4.0), processed into maps and icons by GLOBIT 24'));
  assert.ok(credits.includes('Alerts: GDACS (UN / European Commission)'));
  const demo = auditItem({ ...w, weather: { demo: true, source: 'DEMO DATA' } });
  assert.ok(demo.assets.some((x) => x.kind === 'weather' && x.publish === false));
  const pf = preflight({ id: 'w1', kind: 'episode', episode: { ...w, weather: { demo: true, source: 'DEMO DATA' } }, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } } }, { calendar: QUIET, env: ENV, requireReview: false });
  assert.ok(pf.violations.some((v) => v.rule === 'demo') && pf.violations.some((v) => v.rule === 'not-publishable'));
});

test('an export with an asset without a record is refused; on air the strict gate takes the asset off', () => {
  const ep = episode();
  const pf = preflight({ id: 'e1', kind: 'episode', episode: ep, platforms: ['youtube'], flags: { youtube: { containsSyntheticMedia: true, selfDeclaredMadeForKids: false } } }, { calendar: QUIET, env: ENV, requireReview: false });
  assert.equal(pf.ok, false);
  assert.deepEqual(pf.violations.map((v) => v.rule), ['rights-missing']);
  // report mode notes it; strict mode drops the uncleared picture (the story keeps its card) and keeps the cleared ones
  const r = episode();
  rightsGate(r, { mode: 'report' });
  assert.equal(r.rights.missing, 1);
  assert.equal(r.segments[1].hasImage, true);
  const s = episode();
  rightsGate(s, { mode: 'strict' });
  assert.equal(s.segments[1].hasImage, false);
  assert.equal(s.segments[1].source, 'Pixel Wire', 'the stop-gap credit leaves with the picture');
  assert.equal(s.segments[0].hasImage, true);
  assert.ok(s.segments[2].footage, 'free FILE footage stays');
  assert.deepEqual(auditItem(s).missing, [], 'nothing without a record airs');
});

test('the picture desk\'s own record decides: cleared airs and is credited, an outlet photo in a preview never counts as licensed', () => {
  const seg = (storyId, imageRights) => ({ type: 'story', storyId, source: 'Harbour Herald', outlet: 'Harbour Herald', hasImage: true, imageRights });
  const cleared = { source: 'commons', licence: 'CC BY-SA 4.0', author: 'Jane Doe', credit: 'FILE 2023 · JANE DOE · CC BY-SA 4.0 · PIXELATED', attribution: 'Jane Doe, CC BY-SA 4.0, via Wikimedia Commons (pixelated)', cleared: true };
  const outlet = { source: 'outlet', licence: 'OUTLET', author: 'Harbour Herald', credit: 'Harbour Herald', cleared: false };
  const episode = { segments: [seg('s1', cleared), seg('s2', outlet)], rundown: [] };
  const audit = auditItem(episode);
  const pictures = audit.assets.filter((a) => a.kind === 'picture');
  assert.equal(pictures.find((a) => a.storyId === 's1').ok, true, 'a cleared record (even a FILE-year credit) is licensed');
  assert.equal(pictures.find((a) => a.storyId === 's1').credit, cleared.attribution);
  const bad = pictures.find((a) => a.storyId === 's2');
  assert.equal(bad.ok, false, 'licence "OUTLET" is not a licence');
  assert.match(bad.reason, /not cleared/);
  const r = rightsGate(episode, { mode: 'strict', annotate: false });
  assert.equal(r.dropped, 1);
  assert.equal(episode.segments[0].hasImage, true);
  assert.equal(episode.segments[1].hasImage, false);
});

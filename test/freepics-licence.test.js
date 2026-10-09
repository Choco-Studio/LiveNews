import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLicence, allowedFor, shortLabel, attribution, PROFILES, LICENCES } from '../server/freepics/licence.js';

const id = (s, url) => readLicence(s, url).id;

test('licence strings as Commons, Flickr and the CC site publish them are read to the right licence', () => {
  const cases = [
    ['CC0', 'cc0'],
    ['CC0 1.0', 'cc0'],
    ['Public domain', 'pd'],
    ['PD-USGov-NASA', 'pd-usgov'],
    ['No known copyright restrictions', 'no-known-copyright'],
    ['CC BY 2.0', 'cc-by'],
    ['CC BY 4.0', 'cc-by'],
    ['CC BY-SA 3.0', 'cc-by-sa'],
    ['CC BY-SA 3.0 IGO', 'cc-by-sa'],
    ['Attribution-ShareAlike 2.0', 'cc-by-sa'],
    ['Attribution License', 'cc-by'],
    ['CC BY-NC 2.0', 'cc-by-nc'],
    ['CC BY-NC-SA 4.0', 'cc-by-nc-sa'],
    ['CC BY-ND 2.0', 'cc-by-nd'],
    ['CC BY-NC-ND 3.0', 'cc-by-nc-nd'],
    ['Attribution-NonCommercial-NoDerivs License', 'cc-by-nc-nd'],
    ['GFDL', 'gfdl'],
    ['Pexels License', 'pexels'],
    ['Contains modified Copernicus Sentinel data', 'copernicus'],
    ['', 'unknown'],
    ['All rights reserved', 'unknown'],
    ['Creative Commons', 'unknown'],
  ];
  for (const [s, want] of cases) assert.equal(id(s), want, s);
});

test('licence URLs are read too, and a NC / ND clause in the URL wins over a name that does not say it', () => {
  assert.equal(id('', 'https://creativecommons.org/licenses/by/4.0/'), 'cc-by');
  assert.equal(id('', 'https://creativecommons.org/licenses/by-sa/2.0/'), 'cc-by-sa');
  assert.equal(id('', 'https://creativecommons.org/licenses/by-nc-sa/2.0/'), 'cc-by-nc-sa');
  assert.equal(id('', 'https://creativecommons.org/licenses/by-nd/2.0/'), 'cc-by-nd');
  assert.equal(id('', 'https://creativecommons.org/publicdomain/zero/1.0/'), 'cc0');
  assert.equal(id('', 'https://creativecommons.org/publicdomain/mark/1.0/'), 'pd');
  assert.equal(id('Creative Commons', 'https://creativecommons.org/licenses/by-nc/2.0/'), 'cc-by-nc');
});

test('the YouTube profile allows only what may be monetised and adapted; NC, ND, GFDL, unknown never air', () => {
  const ok = ['cc0', 'pd', 'pd-usgov', 'cc-by', 'cc-by-sa', 'pexels', 'pixabay', 'unsplash', 'copernicus'];
  const no = ['cc-by-nc', 'cc-by-nc-sa', 'cc-by-nd', 'cc-by-nc-nd', 'gfdl', 'fal', 'unknown', 'outlet', 'no-known-copyright', 'nonsense'];
  for (const l of ok) assert.equal(allowedFor(l, PROFILES.youtube), true, l);
  for (const l of no) assert.equal(allowedFor(l, PROFILES.youtube), false, l);
});

test('the strict profile also leaves CC BY-SA out; the private stream may show the outlets\' pictures', () => {
  assert.equal(allowedFor('cc-by-sa', PROFILES.youtubeStrict), false);
  assert.equal(allowedFor('cc-by', PROFILES.youtubeStrict), true);
  assert.equal(allowedFor('outlet', PROFILES.emision), true);
  assert.equal(allowedFor('no-known-copyright', PROFILES.emision), true);
  assert.equal(allowedFor('cc-by-nc', PROFILES.emision), false, 'NC is never on air, not even privately');
});

test('every licence in the table has a label and the four terms', () => {
  for (const [k, l] of Object.entries(LICENCES)) {
    for (const t of ['commercial', 'adapt', 'attribution', 'shareAlike']) assert.equal(typeof l[t], 'boolean', `${k}.${t}`);
    assert.equal(typeof l.label, 'string', k);
  }
});

test('labels and attributions carry the version and the change made', () => {
  assert.equal(shortLabel('cc-by-sa', '4.0'), 'CC BY-SA 4.0');
  assert.equal(shortLabel('pd'), 'PD');
  const a = attribution({ title: 'Panama Canal locks', author: '<a href="x">J. Smith</a>', source: 'Wikimedia Commons', licence: readLicence('CC BY-SA 4.0'), licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' });
  assert.equal(a, '"Panama Canal locks" by J. Smith (Wikimedia Commons), CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/, modified: pixelated and cropped');
});

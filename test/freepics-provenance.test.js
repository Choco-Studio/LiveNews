import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provenance } from '../server/freepics/provenance.js';
import { parseFile, Commons } from '../server/freepics/commons.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const file = (o = {}) => ({ author: 'Jane Doe', credit: 'Own work', description: 'View of the harbour', title: 'Harbour', categories: [], restrictions: [], assessments: [], uploaded: '2019-05-01T10:00:00Z', licenceName: 'CC BY-SA 4.0', ...o });

test('a plain own-work Commons file passes, with its signs', () => {
  const p = provenance(file(), { now: NOW });
  assert.equal(p.ok, true);
  assert.deepEqual(p.flags, ['own work']);
});

test('the official Meloni portrait (Commons metadata of 7 Oct) passes as official and reviewed', () => {
  const p = provenance(
    file({
      author: 'Governo Italiano',
      credit: 'https://www.governo.it/it/governo/meloni/presidente-del-consiglio',
      description: 'Official portrait of Giorgia Meloni, 2023',
      categories: ['Personality rights warning', 'Files from external sources with reviewed licenses', 'Giorgia Meloni in 2023'],
      restrictions: ['personality'],
      uploaded: '2023-04-09T22:40:56Z',
    }),
    { now: NOW },
  );
  assert.equal(p.ok, true, p.reasons.join());
  assert.ok(p.flags.includes('licence reviewed') && p.flags.includes('official') && p.flags.includes('personality rights'));
  assert.equal(p.trust, 2);
});

test('licence laundering is kept off air', () => {
  const out = (o) => provenance(file(o), { now: NOW });
  assert.match(out({ author: 'REUTERS/Yves Herman' }).reasons.join(), /agency/);
  assert.match(out({ credit: 'Getty Images' }).reasons.join(), /agency/);
  assert.match(out({ description: 'Protesters in Paris. Photo: AFP' }).reasons.join(), /agency/);
  assert.match(out({ description: 'Riot police (AP Photo) in Lima' }).reasons.join(), /agency/);
  assert.match(out({ categories: ['Deletion requests October 2026'] }).reasons.join(), /deletion/i);
  assert.match(out({ categories: ['Copyright violations'] }).reasons.join(), /copyright/i);
  assert.match(out({ categories: ['Media without a source as of 3 October 2026'] }).reasons.join(), /without a source/);
  assert.match(out({ categories: ['Flickr review needed'] }).reasons.join(), /review needed/);
  assert.match(out({ author: '© Grupo Prensa Ibérica' }).reasons.join(), /copyright notice/);
  assert.match(out({ credit: 'All rights reserved' }).reasons.join(), /reserved/);
  // fresh and not reviewed, not own work: the classic washed upload
  assert.match(out({ credit: 'https://www.flickr.com/photos/123', uploaded: '2026-10-01T00:00:00Z' }).reasons.join(), /fresh upload/);
});

test('…but not the honest cases that look alike', () => {
  const ok = (o) => provenance(file(o), { now: NOW }).ok;
  assert.ok(ok({ author: '© Raimond Spekking / CC BY-SA 4.0 (via Wikimedia Commons)' }), 'a © followed by its free licence is a normal Commons credit');
  assert.ok(ok({ description: 'Michael Bloomberg speaking at a conference in 2019' }), 'a picture OF Bloomberg');
  assert.ok(ok({ description: 'The Reuters building in Canary Wharf' }), 'a picture of the Reuters building');
  assert.ok(ok({ credit: 'Own work', uploaded: '2026-10-05T00:00:00Z' }), 'a fresh own-work upload');
  assert.ok(ok({ credit: 'Flickr', uploaded: '2026-10-05T00:00:00Z', categories: ['Files from external sources with reviewed licenses'] }), 'a fresh but reviewed upload');
  assert.equal(provenance(file({ description: 'Government building in Lisbon' }), { now: NOW }).flags.includes('official'), false, 'a description never makes a picture official');
});

const page = {
  title: 'File:Giorgia Meloni Official 2023 (cropped).jpg',
  imageinfo: [
    {
      url: 'https://upload.wikimedia.org/a.jpg',
      thumburl: 'https://upload.wikimedia.org/thumb/a.jpg',
      width: 1079,
      height: 1363,
      thumbwidth: 1079,
      thumbheight: 1363,
      mime: 'image/jpeg',
      timestamp: '2023-04-09T22:40:56Z',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Giorgia_Meloni_Official_2023_(cropped).jpg',
      extmetadata: {
        ObjectName: { value: 'Giorgia Meloni Official 2023 (cropped)' },
        ImageDescription: { value: 'Official portrait of Giorgia Meloni, 2023' },
        Artist: { value: '<a href="x">Governo Italiano</a>' },
        Credit: { value: '<a rel="nofollow" class="external text" href="https://www.governo.it/">https://www.governo.it/</a>' },
        LicenseShortName: { value: 'CC BY 3.0 it' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by/3.0/it/deed.en' },
        Categories: { value: 'Personality rights warning|Files from external sources with reviewed licenses|Giorgia Meloni in 2023' },
        Restrictions: { value: 'personality' },
        DateTimeOriginal: { value: '2023-04-05' },
      },
    },
  ],
};

test('parseFile reads licence, credit, categories and restrictions as Commons sends them', () => {
  const f = parseFile(page);
  assert.equal(f.licence.id, 'cc-by');
  assert.equal(f.licence.label, 'CC BY 3.0');
  assert.equal(f.author, 'Governo Italiano');
  assert.deepEqual(f.restrictions, ['personality']);
  assert.equal(f.categories.length, 3);
  assert.equal(f.url, 'https://upload.wikimedia.org/thumb/a.jpg');
  assert.equal(parseFile({ title: 'File:X.jpg', missing: true }), null);
});

test('Commons client: batched file details in asked order, normalised titles mapped back, one retry on 429', async () => {
  const seen = [];
  let first = true;
  const fetchImpl = async (url) => {
    seen.push(url);
    if (first) {
      first = false;
      return { ok: false, status: 429, headers: { get: () => '0' } };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        query: {
          normalized: [{ from: 'File:giorgia Meloni Official 2023 (cropped).jpg', to: 'File:Giorgia Meloni Official 2023 (cropped).jpg' }],
          pages: [page, { title: 'File:Nope.jpg', missing: true }],
        },
      }),
    };
  };
  const c = new Commons({ fetchImpl, gapMs: 0 });
  const got = await c.files(['Nope.jpg', 'giorgia_Meloni_Official_2023_(cropped).jpg']);
  assert.equal(got.length, 1);
  assert.equal(got[0].author, 'Governo Italiano');
  assert.equal(seen.length, 2, 'the 429 is retried once');
  assert.match(decodeURIComponent(seen[1].replace(/\+/g, ' ')), /titles=File:Nope\.jpg\|File:giorgia Meloni/);
  await c.files(['giorgia Meloni Official 2023 (cropped).jpg']);
  assert.equal(seen.length, 2, 'details are cached');
});

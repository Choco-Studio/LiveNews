// The picture rights desk (server/rights.js): every picture on air carries a rights record; by default only cleared
// pictures air. Cleared means: editorial use, commercial use (the channel will be monetised) and adaptation (owner,
// 17 Oct: "El pixelado de las fotos no lo quites" — every picture is pixelated, a modification).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { LICENCES, licenceOf, rightsRecord, onAirCredit, attributionText, outletRecord, operatorRecord, airable, currentRights, compactRights, pictureMode, cleanAuthor, CREDIT_MAX_CHARS } from '../server/rights.js';

const commons = (licence, extra = {}) => rightsRecord({ source: 'wikimedia-commons', via: 'wikidata:P18', licence, author: 'Jane Doe', title: 'File:Lisbon tram 28.jpg', page: 'https://commons.wikimedia.org/wiki/File:Lisbon_tram_28.jpg', url: 'https://upload.wikimedia.org/x/1280px-Lisbon_tram_28.jpg', checkedAt: Date.UTC(2026, 9, 17), ...extra });

describe('licences: Commons names and codes to the terms the desk knows', () => {
  test('free licences, with their versions; ported and IGO licences', () => {
    assert.equal(licenceOf('CC BY-SA 4.0'), 'CC-BY-SA-4.0');
    assert.equal(licenceOf('cc-by-sa-4.0'), 'CC-BY-SA-4.0');
    assert.equal(licenceOf('CC BY 2.0'), 'CC-BY-2.0');
    assert.equal(licenceOf('cc-by-3.0'), 'CC-BY-3.0');
    assert.equal(licenceOf('CC BY-SA 3.0 de'), 'CC-BY-SA-3.0', 'a ported licence');
    assert.equal(licenceOf('CC BY-SA 3.0 igo'), 'CC-BY-SA-3.0-IGO', "ESA's open images");
    assert.equal(licenceOf('CC0'), 'CC0-1.0');
    assert.equal(licenceOf('cc0'), 'CC0-1.0');
    assert.equal(licenceOf('Public domain'), 'PD');
    assert.equal(licenceOf('pd'), 'PD');
    assert.equal(licenceOf('OGL 3'), 'OGL-UK-3.0');
    assert.equal(licenceOf('Open Government Licence v2.0'), 'OGL-UK-2.0');
    assert.equal(licenceOf('', 'https://creativecommons.org/licenses/by/4.0/'), 'CC-BY-4.0', 'from its URL');
    assert.equal(licenceOf('FAL'), 'FAL-1.3', 'the Free Art License: modify, commercial, same licence');
  });
  test('NonCommercial and NoDerivatives are told apart from BY and BY-SA (never read as their prefix)', () => {
    assert.equal(licenceOf('CC BY-NC 2.0'), 'CC-BY-NC');
    assert.equal(licenceOf('CC BY-NC-SA 4.0'), 'CC-BY-NC-SA');
    assert.equal(licenceOf('CC BY-ND 4.0'), 'CC-BY-ND');
    assert.equal(licenceOf('CC BY-NC-ND 3.0'), 'CC-BY-NC-ND');
    assert.equal(licenceOf('cc-by-nd-4.0'), 'CC-BY-ND');
  });
  test('unknown, versionless or GFDL-only: never a licence the desk clears', () => {
    assert.equal(licenceOf('All rights reserved'), null);
    assert.equal(licenceOf('Attribution'), null);
    assert.equal(licenceOf('CC BY-SA'), null, 'no version: it cannot be quoted');
    assert.equal(licenceOf('GFDL'), 'GFDL');
    assert.equal(licenceOf(''), null);
  });
});

describe('the rights record: cleared only for editorial, commercial and adapted (pixelated) use', () => {
  test('CC BY, CC BY-SA, CC0, public domain, OGL and NASA are cleared; their uses all true', () => {
    for (const id of ['CC-BY-4.0', 'CC-BY-SA-3.0', 'CC0-1.0', 'PD', 'PD-USGov', 'OGL-UK-3.0', 'CC-BY-SA-3.0-IGO', 'FAL-1.3']) {
      const r = commons(id);
      assert.equal(r.cleared, true, `${id}: ${r.why}`);
      assert.deepEqual(r.uses, { editorial: true, commercial: true, derivative: true, pixelation: true }, id);
    }
    const nasa = rightsRecord({ source: 'nasa', licence: 'NASA-MUG', author: 'NASA/Joel Kowsky', title: 'Artemis II launch', page: 'https://images.nasa.gov/details/x', url: 'https://images-assets.nasa.gov/image/x/x~large.jpg' });
    assert.equal(nasa.cleared, true);
  });
  test('NonCommercial, NoDerivatives, GFDL, ESA standard terms, UN Photo, an outlet: never cleared, with the reason', () => {
    const why = (id) => commons(id).why;
    assert.match(why('CC-BY-NC'), /NonCommercial/);
    assert.match(why('CC-BY-ND'), /NoDerivatives|pixelated/);
    assert.match(why('CC-BY-NC-ND'), /NoDerivatives/);
    assert.match(why('GFDL'), /GFDL/);
    assert.match(why('ESA-STD'), /commercial/);
    assert.match(why('UN-PHOTO'), /alteration/);
    assert.match(why('OUTLET'), /outlet/);
    assert.equal(commons(null).why, 'licence unknown');
    for (const id of ['CC-BY-NC', 'CC-BY-ND', 'CC-BY-NC-ND', 'GFDL', 'ESA-STD', 'UN-PHOTO', 'OUTLET']) assert.equal(commons(id).cleared, false, id);
  });
  test('a generated image, a licence that asks attribution with no author to name, or no https picture: not cleared', () => {
    assert.equal(commons('CC-BY-4.0', { ai: true }).cleared, false);
    assert.match(commons('CC-BY-4.0', { ai: true }).why, /generator/);
    assert.equal(commons('CC-BY-4.0', { author: '<a href="//commons.wikimedia.org/wiki/User:X">Own work</a>' }).why, 'no author or source to credit');
    assert.equal(commons('CC0-1.0', { author: null }).cleared, true, 'public domain asks no attribution');
    assert.equal(commons('CC-BY-4.0', { url: 'http://upload.wikimedia.org/x.jpg' }).cleared, false);
  });
  test('the record carries every field the brief asks: source, licence, author, original, attribution, uses, checked', () => {
    const r = commons('CC-BY-SA-4.0', { restrictions: ['personality'] });
    assert.equal(r.source, 'wikimedia-commons');
    assert.deepEqual(r.licence, { id: 'CC-BY-SA-4.0', name: 'Creative Commons Attribution-ShareAlike 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' });
    assert.equal(r.author, 'Jane Doe');
    assert.equal(r.page, 'https://commons.wikimedia.org/wiki/File:Lisbon_tram_28.jpg');
    assert.equal(r.checkedAt, '2026-10-17T00:00:00.000Z');
    assert.deepEqual(r.restrictions, ['personality']);
    assert.equal(r.label, 'FILE');
    assert.ok(r.attribution.length > 40);
    assert.ok(r.credit.startsWith('FILE · '));
  });
});

describe('the on-air credit follows each licence', () => {
  test('CC BY and CC BY-SA: author, licence with its version, and PIXELATED (the change said)', () => {
    assert.equal(commons('CC-BY-4.0').credit, 'FILE · JANE DOE · CC BY 4.0 · PIXELATED');
    assert.equal(commons('CC-BY-SA-3.0').credit, 'FILE · JANE DOE · CC BY-SA 3.0 · PIXELATED');
    assert.equal(commons('CC-BY-SA-3.0-IGO', { author: 'ESA/ATG medialab' }).credit, 'FILE · ESA/ATG MEDIALAB · CC BY-SA 3.0 IGO · PIXELATED');
  });
  test('a FILE picture of an earlier event says its year in the tag ("FILE 2023"); an institution\'s Flickr picture names it', () => {
    const r = commons('CC-BY-SA-4.0', { year: 2023 });
    assert.equal(r.credit, 'FILE 2023 · JANE DOE · CC BY-SA 4.0 · PIXELATED');
    assert.equal(r.year, 2023);
    assert.equal(compactRights(r).year, 2023);
    assert.equal(commons('CC-BY-4.0', { year: 2023, label: 'EVENT' }).credit, 'JANE DOE · CC BY 4.0 · PIXELATED', 'a picture of the event itself has no FILE tag');
    assert.equal(commons('CC-BY-4.0', { year: 'soon' }).credit, 'FILE · JANE DOE · CC BY 4.0 · PIXELATED');
    const f = rightsRecord({ source: 'flickr', via: 'openverse:flickr', licence: 'CC-BY-2.0', author: 'European Parliament', title: 'European Youth Event 2025', page: 'https://www.flickr.com/photos/36612355@N08/1', url: 'https://live.staticflickr.com/1/x_b.jpg', year: 2025 });
    assert.equal(f.cleared, true);
    assert.equal(f.credit, 'FILE 2025 · EUROPEAN PARLIAMENT · CC BY 2.0 · PIXELATED');
    assert.equal(f.page, 'https://www.flickr.com/photos/36612355@N08/1', 'the source page kept');
  });
  test('public domain and CC0: the author when known, the licence named; no modification note needed', () => {
    assert.equal(commons('PD').credit, 'FILE · JANE DOE · PD');
    assert.equal(commons('CC0-1.0', { author: null }).credit, 'FILE · CC0');
  });
  test('OGL: the source and the licence on screen, the provider statement in the attribution', () => {
    const r = commons('OGL-UK-3.0', { author: 'HM Treasury' });
    assert.equal(r.credit, 'FILE · HM TREASURY · OGL v3');
    assert.match(r.attribution, /Contains public sector information licensed under the Open Government Licence v3\.0\./);
  });
  test('NASA: NASA named (its guidelines ask the source acknowledged); a picture of the event itself has no FILE', () => {
    const base = { source: 'nasa', licence: 'NASA-MUG', title: 'Launch', page: 'https://images.nasa.gov/details/x', url: 'https://images-assets.nasa.gov/x~large.jpg' };
    assert.equal(rightsRecord({ ...base, author: 'NASA/Joel Kowsky' }).credit, 'FILE · NASA/JOEL KOWSKY');
    assert.equal(rightsRecord({ ...base, author: 'Joel Kowsky' }).credit, 'FILE · NASA/JOEL KOWSKY');
    assert.equal(rightsRecord({ ...base, author: null }).credit, 'FILE · NASA');
    assert.equal(rightsRecord({ ...base, author: 'NASA/Bill Ingalls', label: 'EVENT' }).credit, 'NASA/BILL INGALLS');
  });
  test('a long credit runs on two lines; an author longer than a line is shortened at a word; the licence and PIXELATED are never dropped', () => {
    // (the first line: the author beside the FILE tag; the second: the terms)
    const lines = (credit) => {
      const parts = credit.replace(/^FILE · /, '').split(' · ');
      return credit.length <= CREDIT_MAX_CHARS ? [credit] : [parts[0], parts.slice(1).join(' · ')];
    };
    const r = commons('CC-BY-SA-4.0', { author: 'Alexandros Michailidis of the European Parliament Photographic Service' });
    assert.ok(lines(r.credit).every((l) => l.length <= CREDIT_MAX_CHARS - 7), r.credit);
    assert.ok(r.credit.endsWith('· CC BY-SA 4.0 · PIXELATED'), r.credit);
    assert.ok(!/…|\.\.\./.test(r.credit));
    assert.ok(!/\b(?:OF|THE)\s+·/.test(r.credit), r.credit);
    const ukraine = commons('CC-BY-4.0', { author: 'Press Service of the President of Ukraine' });
    assert.equal(ukraine.credit, 'FILE · PRESS SERVICE OF THE PRESIDENT OF UKRAINE · CC BY 4.0 · PIXELATED');
    const one = commons('CC-BY-4.0', { author: 'Abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz' });
    assert.ok(lines(one.credit).every((l) => l.length <= CREDIT_MAX_CHARS - 7) && one.credit.endsWith('CC BY 4.0 · PIXELATED'), one.credit);
  });
  test("the author as Commons writes it, credited as a name (uploader notes, a Flickr account's town, a derivative's two authors)", () => {
    const credit = (author, licence = 'CC-BY-SA-3.0') => commons(licence, { author }).credit;
    assert.equal(credit('The original uploader was Blofeld of SPECTRE at English Wikipedia . ( Original text'), 'FILE · BLOFELD OF SPECTRE · CC BY-SA 3.0 · PIXELATED');
    assert.equal(credit('Coolcaesar at English Wikipedia'), 'FILE · COOLCAESAR · CC BY-SA 3.0 · PIXELATED');
    assert.equal(credit('VW_Werk_Altes_Heizkraftwerk.jpg : Richard Bartz derivative work: Diliff'), 'FILE · RICHARD BARTZ/DILIFF · CC BY-SA 3.0 · PIXELATED');
    assert.equal(credit('User:Steindy derivative work: Mario Zamic'), 'FILE · STEINDY/MARIO ZAMIC · CC BY-SA 3.0 · PIXELATED');
    assert.equal(credit('This image or media was taken or created by Matt H. Wade . To see his entire portfolio, click here .'), 'FILE · MATT H. WADE · CC BY-SA 3.0 · PIXELATED');
    assert.equal(credit("Prime Minister ' s Office", 'OGL-UK-3.0'), "FILE · PRIME MINISTER'S OFFICE · OGL v3");
    assert.equal(credit('©House of Commons / photography by Roger Harris', 'CC-BY-3.0'), 'FILE · HOUSE OF COMMONS/ROGER HARRIS · CC BY 3.0 · PIXELATED');
    assert.equal(credit('Pierre Blaché from Paris, France', 'CC-BY-2.0'), 'FILE · PIERRE BLACHÉ · CC BY 2.0 · PIXELATED');
    assert.equal(credit('Photo by Rivian.', 'CC-BY-SA-4.0'), 'FILE · RIVIAN · CC BY-SA 4.0 · PIXELATED');
    // the full attribution keeps the name as written
    assert.match(commons('CC-BY-2.0', { author: 'Pierre Blaché from Paris, France' }).attribution, /by Pierre Blaché from Paris, France/);
  });
  test("a name in another alphabet is written in the screen's letters; one the screen cannot write is not cleared where the licence asks for it", () => {
    assert.equal(commons('CC-BY-SA-4.0', { author: 'Виктор Пинчук' }).credit, 'FILE · VIKTOR PINCHUK · CC BY-SA 4.0 · PIXELATED');
    assert.equal(commons('CC-BY-SA-4.0', { author: 'Κα Κιτ' }).credit, 'FILE · KA KIT · CC BY-SA 4.0 · PIXELATED');
    assert.equal(commons('CC-BY-SA-4.0', { author: 'Jørgen Ødegård' }).credit, 'FILE · JORGEN ODEGARD · CC BY-SA 4.0 · PIXELATED');
    const cjk = commons('CC-BY-SA-4.0', { author: '瑞丽江的河水' });
    assert.equal(cjk.cleared, false);
    assert.match(cjk.why, /cannot be written/);
    // a picture that need not name its author airs without the name
    const free = commons('CC0-1.0', { author: '瑞丽江的河水' });
    assert.equal(free.cleared, true);
    assert.equal(free.credit, 'FILE · CC0');
    assert.match(free.attribution, /瑞丽江的河水/);
  });
  test('an author is credited as a name: markup, talk links, "Own work" and URLs go', () => {
    assert.equal(cleanAuthor('<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a> (talk)'), 'Jane Doe');
    assert.equal(cleanAuthor('Own work'), null);
    assert.equal(cleanAuthor('https://www.flickr.com/people/x'), null);
    assert.equal(cleanAuthor('Simon Walker / HM Treasury'), 'Simon Walker / HM Treasury');
  });
});

describe('the attribution text (a programme description lists one per picture)', () => {
  test('title, author, original page, licence and its link, the modification; ShareAlike says what the pixelated picture is offered under', () => {
    const t = commons('CC-BY-SA-4.0').attribution;
    assert.match(t, /^"Lisbon tram 28" by Jane Doe, https:\/\/commons\.wikimedia\.org\/wiki\/File:Lisbon_tram_28\.jpg, CC BY-SA 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/\)\./);
    assert.match(t, /Pixelated \(modified\) by GLOBIT 24\./);
    assert.match(t, /The pixelated picture is offered under CC BY-SA 4\.0/);
    assert.doesNotMatch(commons('CC-BY-4.0').attribution, /offered under/);
  });
  test('NASA: no endorsement implied; an uncleared record says so', () => {
    assert.match(rightsRecord({ source: 'nasa', licence: 'NASA-MUG', title: 'x', url: 'https://images-assets.nasa.gov/x~large.jpg' }).attribution, /no endorsement by NASA/);
    assert.match(commons('CC-BY-NC').attribution, /NOT CLEARED/);
  });
});

describe('what airs', () => {
  const cleared = commons('CC-BY-4.0');
  test('a cleared record for the very picture the story carries airs; a record for another picture does not', () => {
    assert.equal(airable({ image: cleared.url, imageRights: cleared }), true);
    assert.equal(airable({ image: 'https://i.guim.co.uk/outlet.jpg', imageRights: cleared }), false, 'the news desk lent another picture since');
    assert.equal(currentRights({ image: 'https://i.guim.co.uk/outlet.jpg', imageRights: cleared }), null);
    assert.equal(airable({ image: null, imageRights: cleared }), false);
  });
  test("an outlet's photo never airs by default; only in a private preview", () => {
    const s = { id: 's1', image: 'https://i.guim.co.uk/outlet.jpg', source: 'The Guardian', imageCredit: 'Reuters' };
    s.imageRights = outletRecord(s);
    assert.equal(s.imageRights.cleared, false);
    assert.equal(s.imageRights.licence.id, 'OUTLET');
    assert.equal(airable(s), false);
    assert.equal(airable(s, { mode: 'preview' }), true);
    assert.equal(airable({ image: 'https://x/y.jpg' }), false, 'no record at all');
  });
  test("the operator's own local feed (offline demo) airs as the operator's", () => {
    const s = { image: 'file:///srv/feeds/img/canal.png', source: 'Ledger Line', local: true };
    s.imageRights = operatorRecord(s);
    assert.equal(s.imageRights.cleared, true);
    assert.equal(airable(s), true);
  });
  test('modes: cleared unless "preview" is asked for explicitly', () => {
    assert.equal(pictureMode(undefined), 'cleared');
    assert.equal(pictureMode('PREVIEW'), 'preview');
    assert.equal(pictureMode('outlet'), 'cleared');
  });
  test('the compact record (episode, archive, client) keeps what a description and the gate need', () => {
    const c = compactRights(commons('CC-BY-SA-4.0', { restrictions: ['personality'] }));
    assert.deepEqual(Object.keys(c).sort(), ['attribution', 'author', 'checkedAt', 'cleared', 'credit', 'label', 'licence', 'page', 'restrictions', 'source', 'url'].sort());
    assert.equal(airable({ image: c.url, imageRights: c }), true);
  });
  test('every licence the desk knows has a name and a short form; the cleared ones have their text linked', () => {
    for (const [id, l] of Object.entries(LICENCES)) {
      assert.ok(l.name && l.short, id);
      if (!l.why && id !== 'OPERATOR') assert.ok(/^https:\/\//.test(l.url || ''), `${id} links its terms`);
    }
  });
});

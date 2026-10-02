import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GAZETTEER, degreesApart, findPlaces, locate, lookupPlace, placeSupported, placesIn } from '../server/gazetteer.js';

describe('gazetteer data', () => {
  test('has about 200 places or more: countries, cities and regions', () => {
    const kinds = (k) => GAZETTEER.filter((e) => e.kind === k).length;
    assert.ok(GAZETTEER.length >= 200, `${GAZETTEER.length} entries`);
    assert.ok(kinds('country') >= 100 && kinds('city') >= 80 && kinds('region') >= 40);
  });

  test('every entry has valid coordinates, a label of at most 32 characters and a known country', () => {
    const countries = new Set(GAZETTEER.filter((e) => e.kind === 'country').map((e) => e.name));
    for (const e of GAZETTEER) {
      assert.ok(Math.abs(e.lat) <= 90 && Math.abs(e.lon) <= 180, e.name);
      assert.ok(e.label.length <= 32 && e.label === e.label.toUpperCase(), e.label);
      if (e.country) assert.ok(countries.has(e.country), `${e.name}: unknown country ${e.country}`);
    }
  });

  test('cities sit inside (or very near) their country: a sanity check on the coordinates', () => {
    for (const e of GAZETTEER.filter((g) => g.kind === 'city')) {
      const country = lookupPlace(e.country);
      // Russia, the USA, Canada, Brazil, China and Australia are wide: allow a generous radius.
      assert.ok(degreesApart(e, country) < 40, `${e.name} is ${degreesApart(e, country).toFixed(1)} degrees from ${e.country}`);
    }
  });

  test('labels are what the map shows: city and country, or the country alone', () => {
    assert.equal(lookupPlace('Nairobi').label, 'NAIROBI, KENYA');
    assert.equal(lookupPlace('New York').label, 'NEW YORK, USA');
    assert.equal(lookupPlace('Kerala').label, 'KERALA, INDIA');
    assert.equal(lookupPlace('Gaza').label, 'GAZA', 'places with an identity of their own carry no country');
    assert.equal(lookupPlace('Democratic Republic of the Congo').label, 'DR CONGO');
  });
});

describe('lookupPlace', () => {
  test('finds a place by name, alias, label or the first part of a label, ignoring case and accents', () => {
    assert.equal(lookupPlace('kiev').name, 'Kyiv');
    assert.equal(lookupPlace('UK').name, 'United Kingdom');
    assert.equal(lookupPlace('NAIROBI, KENYA').name, 'Nairobi');
    assert.equal(lookupPlace('Sao Paulo').name, 'São Paulo');
    assert.equal(lookupPlace('Atlantis'), null);
  });
});

describe('findPlaces', () => {
  test('lists places in order of appearance; the longest name wins', () => {
    const found = findPlaces('From New York to South Africa, via Paris.').map((h) => h.entry.name);
    assert.deepEqual(found, ['New York', 'South Africa', 'Paris']);
  });

  test('is case-sensitive like news copy, and skips names that are also everyday words or people', () => {
    assert.deepEqual(findPlaces('the turkey was in paris').map((h) => h.entry.name), []);
    assert.deepEqual(findPlaces('Michael Jordan visits Chad and Georgia').map((h) => h.entry.name), []);
    assert.deepEqual(findPlaces('Amazon opens a warehouse').map((h) => h.entry.name), [], 'the company is not the forest');
    assert.deepEqual(findPlaces('Deforestation in the Amazon fell').map((h) => h.entry.name), ['Amazon']);
  });

  test('accepts possessives but not longer words that start with a place name', () => {
    assert.deepEqual(findPlaces("Brazil's space agency").map((h) => h.entry.name), ['Brazil']);
    assert.deepEqual(findPlaces('Brazilian farmers').map((h) => h.entry.name), []);
  });
});

describe('locate', () => {
  test('prefers a city or region of the country the headline names', () => {
    assert.equal(locate('Kenya switches on its largest solar farm near Nairobi').place, 'NAIROBI, KENYA');
    assert.equal(locate('Brazil reports a sharp fall in Amazon deforestation', 'Deforestation in the Amazon fell by 30 percent.').place, 'AMAZON, BRAZIL');
  });

  test('falls back to the summary, and to continents or oceans only when nothing else is named', () => {
    assert.equal(locate('Ferries cancelled', 'Sailings from Athens were cancelled.').place, 'ATHENS, GREECE');
    assert.equal(locate('Storms hit Europe').place, 'EUROPE');
    assert.equal(locate('Storms hit Europe', 'Floods in Valencia.').place, 'EUROPE', 'the headline is the story');
    assert.equal(locate('A quiet day in the markets', 'Nothing much happened.'), null);
  });

  test('returns coordinates with the label', () => {
    assert.deepEqual(locate('Tokyo stocks rise'), { place: 'TOKYO, JAPAN', lat: 35.68, lon: 139.69, entry: lookupPlace('Tokyo') });
  });
});

describe('placesIn', () => {
  test('distinct places, without a country whose own city is listed', () => {
    assert.deepEqual(placesIn('Canada and Mexico sign a deal').map((p) => p.place), ['CANADA', 'MEXICO']);
    assert.deepEqual(placesIn('Ferries from Athens to the Greek islands. Greece says...').map((p) => p.place), ['ATHENS, GREECE', 'GREEK ISLANDS, GREECE']);
    assert.equal(placesIn('One two three four five', 4).length, 0);
  });
});

describe('placeSupported', () => {
  test('any part of the place named in the text is support', () => {
    assert.equal(placeSupported('LISBON, PORTUGAL', 'Lisbon opened a tram line.'), true);
    assert.equal(placeSupported('PARIS, FRANCE', 'The city of Rome.'), false);
  });

  test('so is a demonym, or a city inside a named country', () => {
    assert.equal(placeSupported('FRANCE', 'French farmers protested.'), true);
    assert.equal(placeSupported('PORTUGAL', 'Lisbon opened a tram line.'), true);
    assert.equal(placeSupported('BRAZIL', 'Lisbon opened a tram line.'), false);
  });

  test('an ambiguous name counts when written out, and an empty text supports nothing', () => {
    assert.equal(placeSupported('JORDAN', 'Jordan says it will reopen the border.'), true);
    assert.equal(placeSupported('PARIS', ''), false);
    assert.equal(placeSupported('', 'Paris'), false);
  });
});

// The place a no-picture story's locator board shows (server/producer.js boardPlace, server/gazetteer.js locate): the
// place the headline names wins over the writer's; each case is a wrong board of the round 7 sheets or the round 8
// hand check of every board in three samples.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { locate, placeSupported } from '../server/gazetteer.js';
import { boardPlace } from '../server/producer.js';

const at = (place, lat, lon, scope) => ({ place, lat, lon, ...(scope ? { scope } : {}) });

describe('where the headline puts it (gazetteer)', () => {
  test('a country that receives something from another is where it happened ("from" counts only after leaving)', () => {
    assert.equal(locate('Jamaica accepts first flight of third-country deportations from US', 'The flight landed in Kingston from the United States.').entry.name, 'Jamaica');
    assert.equal(locate('US withdraws all B-1 bombers from British military base RAF Fairford', '').entry.name, 'United Kingdom', 'leaving: where it left from');
  });
  test('"off <country>" is that country\'s coast; every country a headline may name is known', () => {
    assert.equal(locate('Children among 139 dead after boat capsizes off Djibouti, UN says', 'The boat had left Yemen.').entry.name, 'Djibouti');
    for (const c of ['Djibouti', 'Eritrea', 'Gambia', 'Sierra Leone', 'Bhutan', 'Maldives', 'Mauritius', 'Belize', 'Guyana', 'Tajikistan']) assert.ok(locate(`Unrest in ${c} grows`, '')?.entry, c);
  });
  test('a people\'s adjective on people says who they are; "in <country>" or that country\'s court says where (the surfers)', () => {
    assert.equal(locate('3 men sentenced to 158 years for the killings of Australian, US surfers in Mexico', '').entry.name, 'Mexico');
    assert.equal(locate('Mexican judge sentences three men to 158 years in prison for murders of Australian and US surfers', '').entry.name, 'Mexico');
    assert.equal(locate('Albanian police fire tear gas at protesters as Education Ministry attacked', '').entry.name, 'Albania');
    assert.equal(locate('Australian woman charged with lacing colleague\'s curry with snail poison', ''), null, 'a woman is no institution');
    assert.equal(locate('Israeli settlers abuse and reportedly poison goats in Palestinian village', ''), null);
  });
  test('a country that speaks is itself, never a country its summary goes on to name', () => {
    assert.equal(locate('Ukraine says its Starshield access is back', 'Russian forces had benefited, officials said.').entry.country || 'Ukraine', 'Ukraine');
    assert.equal(locate('Israel says it struck Hezbollah targets in Lebanon', '').entry.name, 'Lebanon', 'unless the headline says where');
  });
  test('a country that strikes another: where the strikes fell', () => {
    assert.equal(locate('Russia strikes 9 Ukrainian regions as strain grows', '').entry.name, 'Ukraine');
  });
  test('a destination gives way to where it happened; waters the news names', () => {
    assert.equal(locate('Graduate student accused of trying to flee to China arrested at LAX', '').entry.name, 'Los Angeles');
    assert.equal(locate('Container ship sinks near strait of Hormuz amid surge in Iranian attacks', '').entry.name, 'Strait of Hormuz');
    assert.equal(locate('Drones hit ships in Black Sea, sinking 1, Bulgaria says', '').entry.name, 'Black Sea');
  });
  test('a people\'s territory is their country; places the topic boards were showing instead of a map', () => {
    assert.equal(locate('Ukrainian drones strike more than 100km into Russian territory', '').entry.name, 'Russia');
    assert.equal(locate('Rescued turtles return home after NSW government cut flows to wetland', '').entry.name, 'New South Wales');
    assert.equal(locate("A rare family of barn owls moved into Manhattan's Upper West Side", '').entry.name, 'New York');
    assert.equal(locate("Drugs fuelling 'horrific' events seen in Waterford, says Irish justice minister", '').entry.name, 'Waterford');
    assert.equal(locate('Boy, 17, shot dead with air rifle at Hampshire house party, inquest told', '').entry.name, 'Hampshire');
    assert.notEqual(locate('Primary voters head to the polls in New Hampshire', '')?.entry.name, 'Hampshire');
  });
  test('a name inside another name is no place: a currency, a newspaper, a club, a university, a nationality', () => {
    assert.equal(locate('Euro slides to fresh lows against US dollar', ''), null);
    assert.equal(placeSupported('NEW YORK, USA', 'The New York Times first reported the spending numbers.'), false);
    assert.equal(locate('Leeds vs Manchester United: Premier League', ''), null);
    assert.equal(placeSupported('ARIZONA, USA', 'a psychologist at Arizona State University said'), false);
    assert.equal(locate('Mexican judge jails three men for murders of Australian and US surfers', '').entry.name, 'Mexico', 'the surfers are no place; the Mexican judge is');
    assert.equal(locate('Ex-leader of N. Ireland’s largest unionist party sentenced', '').entry.name, 'Northern Ireland');
    assert.equal(locate('Spanish royals make sensitive visit to Ceuta enclave', '').entry.country, 'Spain');
  });
});

describe('the board\'s place (producer)', () => {
  test('the headline\'s place wins over the writer\'s', () => {
    assert.equal(boardPlace('Jamaica accepts first flight of third-country deportations from US', at('USA', 39.8, -98.6, 'country')).place, 'JAMAICA');
    assert.equal(boardPlace('Children among 139 dead after boat capsizes off Djibouti, UN says', at('YEMEN', 15.6, 48.5, 'country')).place, 'DJIBOUTI');
    assert.equal(boardPlace('Ukraine says its Starshield access is back', at('RUSSIA', 61.5, 105.3, 'country')).place, 'UKRAINE');
    // (archived with USA: the strap read JUSTICE · USA)
    const usa = at('USA', 39.8, -98.6, 'country');
    assert.equal(boardPlace('3 men sentenced to 158 years for the killings of Australian, US surfers in Mexico', usa, 'Three Mexican men have been sentenced to more than 158 years in prison each.').place, 'MEXICO');
    assert.equal(boardPlace('Three Mexicans jailed for 158 years each for killing Australian, US surfers', usa, 'A Mexican judge sentenced the three men for the 2024 murders a week after they were found guilty.').place, 'MEXICO');
  });
  test('the writer\'s more precise place stays where the story names it, and only there', () => {
    const kyiv = at('KYIV, UKRAINE', 50.45, 30.52);
    assert.equal(boardPlace('Ukraine accuses SpaceX of throttling Starlink terminals', kyiv, 'Officials in Kyiv said the terminals were throttled.'), kyiv);
    assert.equal(boardPlace('Mexico jails three men for the murders of surfers', at('CALIFORNIA, USA', 37, -120), 'The killings happened during a surf trip to Baja California.').place, 'MEXICO');
  });
  test('a headline that names no place keeps the writer\'s only where the lead names it; never one taken from the lead instead', () => {
    const florida = at('FLORIDA, USA', 28.6, -82.4);
    assert.equal(boardPlace('First Thing: Pope Leo recovering from surgery after lung cancer diagnosis', florida, 'Good morning. Pope Leo XIV has been diagnosed with lung cancer. The Vatican made the announcement.'), null);
    const india = at('INDIA', 20.6, 78.9, 'country');
    assert.equal(boardPlace('These workers help train robots who could one day steal their jobs', india, 'Factory workers in India are being asked to wear GoPros.'), india);
    assert.equal(boardPlace("Manchester United's Martinez blasts board's lack of investment", at('MANCHESTER, UK', 53.48, -2.24), 'Martinez spoke after the defeat to Atletico Madrid.'), null);
  });
  test('a headline in capitals is read in title case', () => {
    assert.equal(boardPlace('KENYA CONFIRMS THIRD EBOLA CASE', at('DR CONGO', -4, 21, 'country')).place, 'KENYA');
  });
});

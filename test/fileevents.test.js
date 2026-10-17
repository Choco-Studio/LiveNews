// FILE pictures of the same named actor doing the same kind of thing, and the seat of government (server/fileevents.js)
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { storyAction, actorKind, fileYear, eventFileProblem, eventQuery, seatFor, SEATS, ACTIONS } from '../server/fileevents.js';
import { storyFlags } from '../server/picturedesk.js';

const STORY_AT = Date.UTC(2026, 9, 17, 12);
const flags = (title, summary = '', extra = {}) => storyFlags({ title, summary, ...extra });
const action = (id) => ACTIONS.find((a) => a.id === id);

describe('the action the headline says', () => {
  test('a protest, a strike by workers, a vote, a summit', () => {
    assert.equal(storyAction(flags('Students and unions set to protest across France'))?.id, 'protest');
    assert.equal(storyAction(flags('Unite members to strike at Felixstowe port'))?.id, 'strike');
    assert.equal(storyAction(flags('Nurses strike over pay'))?.id, 'strike');
    assert.equal(storyAction(flags('European Parliament votes to ban single-use vapes'))?.id, 'session');
    assert.equal(storyAction(flags('NATO leaders gather for Hague summit'))?.id, 'summit');
  });
  test('never an air strike, a deal struck, or a story with a toll', () => {
    assert.notEqual(storyAction(flags('Israeli air strike hits Gaza City'))?.id, 'strike');
    assert.notEqual(storyAction(flags('US strikes a deal with Japan on chips'))?.id, 'strike');
    assert.equal(storyAction(flags('Protest after three killed in police raid')), null, 'a death in the headline');
    assert.equal(storyAction(flags('Protesters march as floods hit the city')), null, 'a disaster');
    assert.equal(storyAction(flags('Protests grow', 'Police said 12 people were killed and dozens injured.')), null, 'a toll in the summary');
  });
});

describe('the actor', () => {
  test('a movement, a union, a party, a legislature, a bloc, a company; never an armed group, a police force or a person', () => {
    assert.equal(actorKind({ types: ['trade union'] }), 'union');
    assert.equal(actorKind({ types: ['social movement', 'advocacy group'] }), 'movement');
    assert.equal(actorKind({ types: ['political party'] }), 'party');
    assert.equal(actorKind({ types: ['legislature', 'parliament'] }), 'legislature');
    assert.equal(actorKind({ types: ['intergovernmental organization'] }), 'bloc');
    assert.equal(actorKind({ types: ['public company'] }), 'company');
    assert.equal(actorKind({ types: ['militant group', 'organization'] }), null);
    assert.equal(actorKind({ types: ['police', 'law enforcement agency'] }), null);
    assert.equal(actorKind({ types: ['human'] }), null);
    assert.equal(actorKind({ types: [] }), null);
  });
});

describe('when a file was taken', () => {
  test('its EXIF date, else a date in its title, description or categories, else a lone year in its title', () => {
    assert.deepEqual(fileYear({ taken: '2023:04:21 14:02:11' }, STORY_AT), { year: 2023, at: Date.UTC(2023, 3, 21), how: 'taken' });
    assert.equal(fileYear({ title: 'File:Protest 2024-03-12 Paris.jpg' }, STORY_AT).year, 2024);
    assert.equal(fileYear({ title: 'File:Manif.jpg', description: 'Manifestation du 8 décembre 2018 à Paris' }, STORY_AT).year, 2018);
    assert.equal(fileYear({ title: 'File:XR London 2022.jpg' }, STORY_AT).year, 2022);
    assert.equal(fileYear({ title: 'File:XR London 2019 and 2022.jpg' }, STORY_AT), null, 'two years: unsure');
    assert.equal(fileYear({ title: 'File:Crowd.jpg' }, STORY_AT), null);
    assert.equal(fileYear({ title: 'File:Rally 2031.jpg' }, STORY_AT), null, 'a year after the story is no date');
  });
});

describe('may a file stand for the actor doing it', () => {
  const names = ['Extinction Rebellion', 'XR'];
  const ok = { title: 'File:Extinction Rebellion protest in London, 2023-04-21.jpg', description: 'Protesters on Parliament Square', categories: 'Extinction Rebellion protests in London' };
  test('it names the actor and the action, it is dated before the story and recent enough', () => {
    assert.equal(eventFileProblem(ok, { names, action: action('protest'), storyAt: STORY_AT }), null);
    assert.equal(eventFileProblem({ ...ok, title: 'File:Protest in London, 2023-04-21.jpg', categories: 'Protests in London' }, { names, action: action('protest'), storyAt: STORY_AT }), 'does not name the actor');
    assert.equal(eventFileProblem({ ...ok, title: 'File:Extinction Rebellion office 2023-04-21.jpg', description: 'The office', categories: 'Extinction Rebellion' }, { names, action: action('protest'), storyAt: STORY_AT }), 'does not show a protest');
    assert.equal(eventFileProblem({ ...ok, title: 'File:Extinction Rebellion protest in London, 2009-04-21.jpg' }, { names, action: action('protest'), storyAt: STORY_AT }), 'too old (2009)');
    assert.equal(eventFileProblem({ ...ok, title: 'File:Extinction Rebellion protest in London, 2026-10-16.jpg' }, { names, action: action('protest'), storyAt: STORY_AT }), "possibly the story's own event");
    assert.equal(eventFileProblem({ ...ok, title: 'File:Extinction Rebellion protest in London.jpg', description: 'Protesters', categories: 'Extinction Rebellion' }, { names, action: action('protest'), storyAt: STORY_AT }), 'no date');
  });
  test('never a violent scene (riot, tear gas, the injured, arrests), in any of the languages the files are captioned in', () => {
    for (const d of ['Riot police and tear gas', 'Protesters injured', 'Arrests on the bridge', 'Affrontements avec la police', 'Krawalle in Berlin']) assert.equal(eventFileProblem({ ...ok, description: d }, { names, action: action('protest'), storyAt: STORY_AT }), 'a violent scene', d);
  });
  test('a short acronym never names the actor on its own; the query is the name and the plain action', () => {
    assert.equal(eventFileProblem({ ...ok, title: 'File:Protest in London, 2023-04-21.jpg', categories: 'Protests', description: 'XR' }, { names: ['XR'], action: action('protest'), storyAt: STORY_AT }), 'does not name the actor');
    assert.equal(eventQuery('Extinction Rebellion', action('protest')), '"Extinction Rebellion" protest');
    assert.equal(eventQuery('European Parliament', action('session')), '"European Parliament" plenary session');
  });
});

describe('the seat of government', () => {
  test('the legislature for a vote, the government otherwise, the country the headline names first; the EU its own', () => {
    assert.deepEqual(seatFor(flags('US Senate votes on budget bill as shutdown looms')), { country: 'United States', title: 'United States Capitol', kind: 'legislature' });
    assert.deepEqual(seatFor(flags('France imposes new sanctions on Iran')), { country: 'France', title: 'Élysée Palace', kind: 'government' });
    assert.equal(seatFor(flags('EU imposes sanctions on almost 1,600 Russians'))?.title, 'Berlaymont building');
    assert.equal(seatFor(flags('Australia politics live: Labor’s $630m funding boost for charities'))?.title, 'Parliament House, Canberra');
  });
  test('never under violence, a death or a toll; never for a story that is not about government', () => {
    assert.equal(seatFor(flags('US Senate votes to authorise air strikes as attack kills soldiers')), null);
    assert.equal(seatFor(flags('France mourns minister who died at 80')), null);
    assert.equal(seatFor(flags('France wins the rugby world cup')), null);
    assert.equal(seatFor(flags('Talks on Ukraine continue in Geneva as ministers meet')), null, 'the topic, not the actor');
    assert.equal(seatFor(flags('Duel in the desert: US marine veteran aims to win back working-class voters for Democrats')), null, 'a person of that country, not its state');
    assert.equal(seatFor(flags('Australian industry reliant on gas for the foreseeable future, resources minister says')), null, 'a thing of that country');
    assert.equal(seatFor(flags('Leeds vs Manchester United: Premier League – teams, prediction, lineups', '', { category: 'sport' })), null, 'never a seat under sport (the hand check of round 7: 10 Downing Street under a match)');
    assert.equal(seatFor(flags('Irish justice minister says drugs are fuelling violence'))?.title, 'Leinster House', 'a demonym and its government');
    assert.equal(seatFor(flags("'Dark day for Turkey': Govt takes control of most-watched news channel"))?.country, 'Turkey', 'the kicker names the country, the headline its government');
    assert.equal(seatFor(flags('EU watchdog urges smart glasses to signal when recording')), null, 'the EU acting, never its watchdogs');
    assert.equal(seatFor(flags('Kenya health ministry confirms second Ebola case')), null, 'never under an outbreak');
    assert.equal(seatFor(flags('US lawmakers unveil bill to hold Wall Street bosses to account'))?.title, 'United States Capitol', 'lawmakers: the Capitol, never the White House');
  });
  test('every seat is a title (a body whose picture is a logo is left out)', () => {
    for (const [country, seat] of Object.entries(SEATS)) assert.ok(seat.government || seat.legislature, country);
  });
});

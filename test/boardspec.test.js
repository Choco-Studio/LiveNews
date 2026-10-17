// What a story with neither a cleared picture nor a place shows behind its headline (public/js/boardspec.js): the
// story's own strongest element, never a bare section word. Each case is a story of the three measured samples (the
// round 8 hand check of every such board), or a board that went wrong on the way.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { boardSpec, headlineFigure, statedFigure, shortQuote, headlineQuote, headlineTopic, keyPhrase, aboutLine, BARE, TOPICS } from '../public/js/boardspec.js';
import { boardActorOf } from '../server/picturedesk.js';

const fig = (h) => {
  const f = headlineFigure(h);
  return f ? [f.value, f.label, f.qual] : null;
};

describe('the key figure', () => {
  test('a count with what it counts, its qualifier kept', () => {
    assert.deepEqual(fig('Driving test waits fall to two-year low - but still average 20 weeks'), ['20', 'WEEKS', null]);
    assert.deepEqual(fig('At least 139 migrants die in boat wreck'), ['139', 'MIGRANTS', 'AT LEAST']);
    assert.deepEqual(fig('Man stabs at least 8 people in South Korean mall'), ['8', 'PEOPLE', 'AT LEAST']);
    assert.deepEqual(fig('Latin American organised crime ‘may operate in 16 European countries’'), ['16', 'EUROPEAN COUNTRIES', null]);
    assert.deepEqual(fig('Anne Aly reveals she has received 19 death threats in the last week alone'), ['19', 'DEATH THREATS', null]);
    assert.deepEqual(fig('Minibus crashes into train at French Channel Tunnel entrance, injuring 19'), ['19', 'INJURED', null]);
    assert.deepEqual(fig('’How do you explain the deletion of 130 million names?’ Why Indian voters are on the streets'), ['130M', 'NAMES', null]);
    assert.deepEqual(fig('KDE turns 30 with Plasma 6.8, remote upgrades, and an X11 farewell'), ['30', 'YEARS', null]);
  });
  test('a sum with what it is, and a share with its direction', () => {
    assert.deepEqual(fig('Bumble agrees to a $1.3B acquisition deal as online dating faces a reset'), ['$1.3BN', 'ACQUISITION', null]);
    assert.deepEqual(fig('Former CBI chair Soames handed lobby group £750,000 loan'), ['£750,000', 'LOAN', null]);
    assert.deepEqual(fig('Elon Musk has donated over $276 million to Republican midterm efforts'), ['$276M', 'DONATED', 'OVER']);
    assert.deepEqual(fig('Fly-tippers face £5k fine in new crackdown'), ['£5K', 'FINE', null]);
    assert.deepEqual(fig('This French AI stock is up 570% in 2026: Analysts see a further 90% upside'), ['+570%', 'STOCK', null]);
  });
  test('never a year, an age, a model number or a small sum that says nothing', () => {
    assert.equal(fig('Boy, 17, accidentally shot dead with air rifle'), null);
    assert.equal(fig('The Alexa Tablet 12 Pro is almost the Android tablet we needed'), null);
    assert.equal(fig('TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up to $100 ticket savings'), null);
    assert.equal(fig('210-million-year-old dinosaur discovery reveals a lost world in Africa'), null);
  });
  test('the writer\'s stated figure only with words that say what it counts', () => {
    assert.deepEqual(statedFigure([{ value: '23', label: 'PROTESTERS', qualifier: 'AT LEAST' }]), { value: '23', label: 'PROTESTERS', qual: 'AT LEAST' });
    assert.equal(statedFigure([{ value: '2800', label: 'X' }]), null);
    assert.equal(statedFigure([{ value: '2026', label: 'THE YEAR' }]), null);
    assert.equal(statedFigure([{ value: '23%', label: 'MORE' }]), null);
  });
});

describe('the quote', () => {
  test('a short quote whole, attributed; never one cut or begun mid-sentence', () => {
    assert.deepEqual(shortQuote({ text: 'There’s no right or wrong answers.', by: 'Connerty' }), { text: "THERE'S NO RIGHT OR WRONG ANSWERS", by: 'CONNERTY' });
    assert.equal(shortQuote({ text: 'She said he fainted, or passed – her words were ‘he passed out,', by: 'Neighbour' }), null);
    assert.equal(shortQuote({ text: 'to just screaming, what is happening?', by: 'A witness' }), null);
    assert.equal(shortQuote({ text: 'This sentence is far too long to be quoted whole on a board behind a headline, so it never is quoted at all.', by: 'X' }), null);
    assert.equal(shortQuote({ text: 'No one said this.', by: null }), null);
  });
  test('the headline\'s own quote, with who said it', () => {
    assert.deepEqual(headlineQuote('‘It was fake’: Indian villagers allege forgery behind Adani mine project'), { text: 'IT WAS FAKE', by: 'INDIAN VILLAGERS' });
    assert.deepEqual(headlineQuote('‘I introduce myself to anyone who looks a bit jumpy’: a security guard’s take on anti-shoplifting'), { text: 'I INTRODUCE MYSELF TO ANYONE WHO LOOKS A BIT JUMPY', by: 'SECURITY GUARD' });
    assert.equal(headlineQuote("'Money-saving hack' for school photos is illegal, photographer warns"), null, 'two words of a sentence are no quote');
    assert.equal(headlineQuote("'I'd spend $1,000 on a wedding present'"), null, 'no one to attribute it to');
  });
});

describe('the topic', () => {
  test('the headline\'s own words, the most specific first, with a glyph where one fits', () => {
    const t = (h) => {
      const x = headlineTopic(h);
      return x ? [x.label, x.glyph] : null;
    };
    assert.deepEqual(t('Is your boss watching you? The rise of AI surveillance at work - video'), ['AI SURVEILLANCE', 'chip']);
    assert.deepEqual(t('DNA, vehicle-tracking help investigators recover stolen Renoirs and makes arrests'), ['STOLEN ART', null]);
    assert.deepEqual(t('Heating oil customers face tough winter despite shake-up promise'), ['HEATING OIL', 'bolt']);
    assert.deepEqual(t('Euro slides to fresh lows against US dollar and British pound despite ECB rate hikes'), ['CURRENCIES', 'chart']);
    assert.deepEqual(t('Students in Europe are rising up to call for better education'), ['EDUCATION', 'book']);
    assert.deepEqual(t('They war-gamed dimming the Sun. It went even worse than you think.'), ['SOLAR GEOENGINEERING', 'orbit']);
    assert.deepEqual(t('Neutron’s first launch slips again amid trouble with carbon composites'), null, 'carbon composites are no emissions');
  });
  test('no label is a bare section word', () => {
    for (const x of TOPICS) if (x.label) assert.ok(!BARE.has(x.label), x.label);
  });
  test('a key phrase never repeats the words the headline opens with; a scare quote is no phrase', () => {
    assert.equal(keyPhrase('Campaigners decry slow progress in repaying victims of carer’s allowance crisis'), "CARER'S ALLOWANCE");
    assert.equal(keyPhrase('Neutron’s first launch slips again amid trouble'), null);
    assert.equal(keyPhrase("Stinky 'skunk' plant cleared from river"), null);
  });
  test('what an actor is: its description shortened only from a leading adjective, without dates', () => {
    assert.equal(aboutLine('Head of the Catholic Church since 2025'), 'HEAD OF THE CATHOLIC CHURCH');
    assert.equal(aboutLine('English actress (born 1934)'), 'ENGLISH ACTRESS');
    assert.equal(aboutLine('Autonomous intergovernmental organisation for energy policy'), null);
    assert.equal(aboutLine('Autonomous intergovernmental organisation'), 'AUTONOMOUS INTERGOVERNMENTAL ORGANISATION'.length <= 40 ? 'AUTONOMOUS INTERGOVERNMENTAL ORGANISATION' : 'INTERGOVERNMENTAL ORGANISATION');
  });
});

describe('the board', () => {
  test('in order: the figure, the quote, the actor, the topic, the writer\'s label borne out, the phrase, nothing', () => {
    const quote = { text: 'We will appeal.', by: 'The firm' };
    const actor = { name: 'Replit', about: 'company and online coding environment' };
    assert.equal(boardSpec({ headline: 'Firm fined £5m over data breach', quote, actor }).kind, 'figure');
    assert.equal(boardSpec({ headline: 'Firm loses appeal over data breach', quote, actor }).kind, 'quote');
    assert.deepEqual(boardSpec({ headline: 'Replit’s CEO says the future of work is the self-driving company', actor }), { kind: 'actor', name: 'REPLIT', about: 'COMPANY AND ONLINE CODING ENVIRONMENT', grave: false });
    assert.equal(boardSpec({ headline: 'Heating oil customers face tough winter' }).kind, 'topic');
    assert.deepEqual(boardSpec({ headline: 'A town holds its breath', kicker: 'VOLCANO', text: 'The volcano near the town rumbled.' }), { kind: 'topic', label: 'VOLCANO', glyph: null, grave: false });
    assert.equal(boardSpec({ headline: 'Something happened', kicker: 'WORLD' }).kind, 'none');
  });
  test('a writer\'s label the story never bears out is dropped (a feed\'s SOFTWARE under a carer\'s allowance story)', () => {
    const b = boardSpec({ headline: 'Campaigners decry slow progress in repaying victims', kicker: 'SOFTWARE', text: 'Campaigners have urged the mayor to step in.' });
    assert.notEqual(b.label, 'SOFTWARE');
  });
  test('the outlet\'s own title gives the figure the writer\'s shorter headline drops', () => {
    const b = boardSpec({ headline: 'Migrants die in boat wreck', alt: 'At least 139 migrants die in boat wreck between Djibouti and Yemen', grave: true });
    assert.deepEqual([b.kind, b.value, b.qual, b.grave], ['figure', '139', 'AT LEAST', true]);
  });
  test('sober: a grave story, or a topic of harm or the courts, has no glyph', () => {
    assert.equal(boardSpec({ headline: 'Heating oil customers face tough winter', grave: true }).glyph, null);
    const b = boardSpec({ headline: 'Watch: Emergency calls from botched execution released' });
    assert.deepEqual([b.label, b.glyph, b.grave], ['DEATH PENALTY', null, true]);
  });
  test('a name no encyclopaedia describes carries the story\'s topic under it', () => {
    const b = boardSpec({ headline: 'Licube wants to be the fuel provider to the fusion power industry', actor: { name: 'Licube', about: null } });
    assert.deepEqual([b.kind, b.name, b.about], ['actor', 'LICUBE', 'FUSION POWER']);
  });
});

describe('the named actor (picture desk)', () => {
  const page = (t) => ({ Licube: null, 'Paris Auto': null, 'Thousands of NI': null, 'Sprout Pi': null }[t]);
  const decide = (options, flags = {}, subjects = []) => ({ options, plan: { flags, subjects } });
  test('a person or a body the desk found, with its description', () => {
    assert.deepEqual(boardActorOf(decide([{ kind: 'thing:org', label: 'Sportsbet', about: 'Australian online bookmaker' }])), { name: 'Sportsbet', about: 'Australian online bookmaker' });
    assert.deepEqual(boardActorOf(decide([{ kind: 'person', label: 'Pope Leo XIV', about: 'head of the Catholic Church since 2025', sober: true }], { grave: true })), { name: 'Pope Leo XIV', about: 'head of the Catholic Church since 2025' });
  });
  test('never a name refused for who it is: an accused, someone else of that name, a victim', () => {
    assert.equal(boardActorOf(decide([{ kind: 'person', label: 'Roman Abramovich', refused: 'a story of an accusation or a trial' }])), null);
    assert.equal(boardActorOf(decide([{ kind: 'person', label: 'Nigel Farage', refused: 'the story gives another role' }])), null);
    assert.equal(boardActorOf(decide([{ kind: 'person', label: 'Ann Widdecombe', refused: "not in Wikipedia's living people", named: true }], { harm: true, violent: true }), { title: 'Security to be reviewed after Ann Widdecombe’s murder' }), null);
  });
  test('a public figure no longer living, named in full: their obituary carries their name', () => {
    const d = decide([{ kind: 'person', label: 'Cyril Hilsum', refused: "not in Wikipedia's living people", named: true, about: 'British physicist' }], { grave: true, harm: true, deathOf: true });
    assert.deepEqual(boardActorOf(d, { title: 'Cyril Hilsum obituary' }), { name: 'Cyril Hilsum', about: 'British physicist' });
  });
  test('a name no encyclopaedia knows yet stands alone, only as a whole name the story writes so', () => {
    assert.deepEqual(boardActorOf(decide([], {}, ['Licube']), { page, title: 'Licube wants to be the fuel provider to the fusion power industry', summary: 'Fusion power plants will need a lot of lithium, and Licube is preparing to be a key supplier.' }), { name: 'Licube', about: null });
    assert.deepEqual(boardActorOf(decide([], {}, ['Sprout Pi']), { page, title: 'Sprout Pi adds Bluetooth, streaming, and USB-C to your aging iPod', summary: 'Sprout Pi is a board.' }), null, 'a first word the story never writes mid-sentence');
    assert.equal(boardActorOf(decide([], {}, ['Paris Auto']), { page, title: 'The Paris Auto Show is full of interesting cars', summary: '' }), null, 'part of a longer name');
    assert.equal(boardActorOf(decide([], {}, ['Thousands of NI']), { page, title: 'Thousands of NI workers to get pay bump', summary: '' }), null);
    assert.equal(boardActorOf(decide([], { grave: true }, ['Licube']), { page, title: 'Licube wants more', summary: 'and Licube is' }), null, 'never under a grave story');
  });
});

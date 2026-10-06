import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { DESKS, deskOf, rosterOf, presenceClaim, throwLine, askLine, thanksLine, AHEAD } from '../server/correspondents.js';
import { buildPrompt, buildReviewPrompt, collapseCrosses, normalizeBulletin, LINK_GAP } from '../server/writer.js';
import { loadChannel } from '../server/channel.js';

// WORLD NOW's correspondent links (owner 4 Oct): which desk takes a story, what a correspondent may say, and how
// a writer's `cross` becomes the link's segments.

const CHANNEL = loadChannel();
const WN = { id: 'world-now', ...CHANNEL.programs['world-now'] };
const ROSTER = rosterOf(WN, CHANNEL.presenters);
const DUO = { A: { id: 'paco', ...CHANNEL.presenters.paco }, B: { id: 'lola', ...CHANNEL.presenters.lola } };

describe('desks and roster', () => {
  test('a story goes to the desk of its place: the country named first, coordinates only as a last resort', () => {
    const desk = (place, lat, lon) => deskOf({ place, lat, lon });
    assert.deepEqual(desk('MARSEILLE, FRANCE', 43.3, 5.37), { desk: 'europe-africa', region: 'europe', label: 'EUROPE DESK', spoken: 'Europe' });
    assert.equal(desk('NAIROBI, KENYA', -1.29, 36.8).label, 'AFRICA DESK');
    assert.equal(desk('CAIRO, EGYPT', 30, 31.2).label, 'AFRICA DESK');
    assert.equal(desk('ANKARA, TURKEY', 39.9, 32.8).label, 'EUROPE DESK', "Turkey's centre sits in the Middle East box: the country decides");
    assert.equal(desk('SEVILLE, SPAIN', 37.4, -6).label, 'EUROPE DESK', 'south of Tunis, still Europe');
    assert.equal(desk('GAZA', 31.4, 34.4).label, 'MIDDLE EAST DESK');
    assert.equal(desk('TEHRAN, IRAN', 35.7, 51.4).label, 'MIDDLE EAST DESK');
    assert.equal(desk('KERALA, INDIA', 10.5, 76.3).label, 'ASIA-PACIFIC DESK');
    assert.equal(desk('QUEENSLAND, AUSTRALIA', -22, 145).label, 'ASIA-PACIFIC DESK');
    assert.equal(desk('YUCATÁN PENINSULA, MEXICO', 20, -88.8).label, 'AMERICAS DESK');
    assert.equal(desk('HONOLULU', 21.3, -157.8).label, 'AMERICAS DESK');
    assert.equal(deskOf({ place: 'NOWHERE' }), null, 'no coordinates, no desk');
  });

  test("WORLD NOW's correspondents cover every desk, each once, with a voice and a look of their own", async () => {
    assert.deepEqual(ROSTER.map((c) => c.desk).sort(), Object.keys(DESKS).sort());
    assert.deepEqual(ROSTER.map((c) => c.first), ['Rhea', 'Vic', 'Mika']);
    const casting = (await import('../server/voice/casting.json', { with: { type: 'json' } })).default;
    const { lookFor } = await import('../public/js/v2/canvas25d/cast/index.js');
    for (const c of ROSTER) {
      assert.ok(casting[c.id]?.voice, `${c.id} has a voice`);
      assert.equal(lookFor(c.id).id, c.id, `${c.id} has a look`);
    }
    // never a presenter's dominant voice (adcast.json keeps the same rule for adverts)
    const dominant = (spec) => spec.split('+')[0].split(':')[0];
    const anchors = ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam'].map((id) => dominant(casting[id].voice));
    for (const c of ROSTER) assert.ok(!anchors.includes(dominant(casting[c.id].voice)), `${c.id} leads with a voice of their own`);
  });
});

describe('what a correspondent may say', () => {
  test('a line that puts the speaker at the scene, or claims reporting the channel did not do, is caught', () => {
    for (const bad of ['I am standing outside the parliament.', 'Here in Marseille the smoke is thick.', 'Behind me, the canal is busy.', "We're live at the port.", 'On the ground, people are angry.', "I've seen the damage myself.", 'Officials told me the line reopens.', 'I can see crews at work.', 'Reporting from Cancún, this is Vic.'])
      assert.ok(presenceClaim(bad), bad);
    for (const ok of ['Officials say the line reopens in May.', 'Residents told the BBC they were afraid.', 'The canal authority says 30 ships are waiting.', 'Firefighters are working through the night.'])
      assert.ok(!presenceClaim(ok), ok);
  });

  test("the presenter's lines name the correspondent and their desk, and the prompt fits the answer", () => {
    const vic = ROSTER.find((c) => c.id === 'vic');
    const desk = deskOf({ place: 'CANCÚN, MEXICO', lat: 21.2, lon: -86.9 });
    for (let i = 0; i < 12; i++) {
      assert.match(throwLine(vic, desk, `k${i}`), /Vic Vector/);
      assert.match(throwLine(vic, desk, `k${i}`), /Americas/);
      assert.match(thanksLine(vic, desk, `k${i}`), /Vic/);
      assert.match(askLine(vic, `k${i}`, 'Forecasters expect more rain over the next two days.'), /^Vic, what (?:happens|comes) next\?$/);
      assert.match(askLine(vic, `k${i}`, 'Airports in Cancún have closed.'), /^Vic, what (?:else do we know|more can you tell us)\?$/);
    }
    assert.ok(AHEAD.test('The union will announce its next steps.'));
    assert.ok(!AHEAD.test('Water-bombing planes are flying over the ridge.'));
  });
});

// a story with an article deep enough for a link
const ARTICLE =
  'Stations across Germany were almost empty on Thursday as rail workers began a 24-hour strike over pay. The operator says only one in five long-distance trains is running. ' +
  'Freight trains were also affected, the operator says. The strike is the third this year in a long dispute over pay and working hours. ' +
  'Many commuters switched to buses and car shares for the day. The union says it will announce its next steps after the strike ends.';
const story = (id, extra = {}) => ({ id, title: `Story ${id}`, summary: `Summary of story ${id}.`, source: 'Pixelburg Post', category: 'world', image: null, ...extra });
const STRIKE = story('g1', { title: 'Germany rail strike leaves stations empty', summary: ARTICLE.split('. ').slice(0, 2).join('. ') + '.', body: ARTICLE });
const strikeSeg = (extra = {}) => ({
  type: 'story',
  storyId: 'g1',
  anchor: 'A',
  emotion: 'neutral',
  headline: 'Germany rail strike leaves stations empty',
  text: 'Stations across Germany were almost empty on Thursday as rail workers began a 24-hour strike over pay. The operator says only one in five long-distance trains is running.',
  shot: 'map',
  location: { place: 'GERMANY', lat: 51.1, lon: 10.4 },
  cross: {
    piece: 'Freight trains were also affected, the operator says. The strike is the third this year in a long dispute over pay and working hours. Many commuters switched to buses and car shares for the day.',
    ask: 'What happens next?',
    answer: 'The union says it will announce its next steps after the strike ends.',
  },
  ...extra,
});
const fillers = (n) => Array.from({ length: n }, (_, i) => story(`f${i}`, { title: `Filler story number ${i}`, summary: `Filler story number ${i} happened today.` }));
const fillerSegs = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ type: 'story', storyId: `f${from + i}`, anchor: i % 2 ? 'A' : 'B', emotion: 'neutral', headline: `Filler ${from + i}`, text: `Filler story number ${from + i} happened today.`, shot: 'wide' }));
const run = (segments, stories, extra = {}) =>
  normalizeBulletin({ title: 'T', segments: [{ type: 'intro', anchor: 'A', emotion: 'neutral', text: 'Good evening.' }, ...segments, { type: 'outro', anchor: 'A', emotion: 'neutral', text: "That's WORLD NOW." }] }, stories, {
    program: WN,
    presenters: DUO,
    correspondents: ROSTER,
    maxStories: 14,
    maxChats: 6,
    ...extra,
  });

describe('a writer’s cross becomes a link', () => {
  test('the story hands over, then the piece, the prompt, the answer and the thanks, each in its own voice slot', () => {
    const b = run([strikeSeg(), ...fillerSegs(3)], [STRIKE, ...fillers(3)]);
    const segs = b.segments;
    const at = segs.findIndex((s) => s.storyId === 'g1');
    assert.equal(segs[at].type, 'story');
    assert.equal(segs[at].link, 'R1');
    assert.match(segs[at].text, /Rhea Raster/, 'the hand-over names the Europe correspondent');
    assert.deepEqual(segs.slice(at + 1, at + 5).map((s) => `${s.type}:${s.part}:${s.anchor}`), ['cross:piece:R1', 'cross:ask:A', 'cross:answer:R1', 'cross:thanks:A']);
    assert.deepEqual(b.correspondents, { R1: 'rhea' });
    const piece = segs[at + 1];
    assert.equal(piece.reporter, 'rhea');
    assert.equal(piece.desk, 'EUROPE DESK');
    assert.equal(piece.place, 'GERMANY');
    assert.equal(piece.storyId, 'g1');
    assert.match(segs[at + 2].text, /^Rhea, what happens next\?$/);
    assert.ok(!b.rundown.some((r) => r.type === 'cross') && b.storyIds.length === 4, 'the link adds no story');
  });

  test('every line of a link is grounded; a line that claims presence or invents a fact never airs', () => {
    const cross = {
      piece: 'Freight trains were also affected, the operator says. I am standing outside the main station. The strike has cost 9 billion euros. Many commuters switched to buses and car shares for the day.',
      ask: 'What happens next?',
      answer: 'The union says it will announce its next steps after the strike ends.',
    };
    const b = run([strikeSeg({ cross }), ...fillerSegs(3)], [STRIKE, ...fillers(3)]);
    const piece = b.segments.find((s) => s.part === 'piece');
    assert.doesNotMatch(piece.text, /standing|9 billion/);
    assert.match(piece.text, /Freight trains/);
  });

  test('a cross that cannot stand (fewer than two grounded lines) leaves an ordinary story', () => {
    const cross = { piece: 'I am here at the station. The strike cost 9 billion euros.', ask: 'Rhea?', answer: '' };
    const b = run([strikeSeg({ cross }), ...fillerSegs(3)], [STRIKE, ...fillers(3)]);
    assert.ok(!b.segments.some((s) => s.type === 'cross'));
    assert.equal(b.correspondents, undefined);
  });

  test('two links never sit within LINK_GAP stories of each other; a cross with no slot gives its lines back to the story', () => {
    const second = story('g2', { title: 'Chile earthquake', summary: STRIKE.summary.replace(/Germany/g, 'Chile'), body: ARTICLE.replace(/Germany/g, 'Chile') });
    const near = strikeSeg({ storyId: 'g2', anchor: 'B', location: { place: 'SANTIAGO, CHILE', lat: -33.4, lon: -70.6 }, text: strikeSeg().text.replace(/Germany/g, 'Chile') });
    const b = run([strikeSeg(), near, ...fillerSegs(4)], [STRIKE, second, ...fillers(4)]);
    assert.equal(b.segments.filter((s) => s.part === 'piece').length, 1, 'the next story is too close for a second link');
    const g2 = b.segments.find((s) => s.type === 'story' && s.storyId === 'g2');
    assert.match(g2.text, /Freight trains were also affected/, 'its first lines went back to the story');
    const far = run([strikeSeg(), ...fillerSegs(LINK_GAP - 1), near, ...fillerSegs(2, LINK_GAP - 1)], [STRIKE, second, ...fillers(LINK_GAP + 1)]);
    assert.deepEqual(far.correspondents, { R1: 'rhea', R2: 'vic' }, 'far enough apart: the second link goes to the Americas desk');
  });

  test('no link on the number of the day, a round-up item or And finally, and none without correspondents', () => {
    const b = run([...fillerSegs(3), strikeSeg({ feature: 'lighter', text: `And finally: ${strikeSeg().text}` })], [STRIKE, ...fillers(3)]);
    assert.equal(b.segments.find((s) => s.storyId === 'g1').feature, 'lighter');
    assert.ok(!b.segments.some((s) => s.type === 'cross'));
    const none = run([strikeSeg(), ...fillerSegs(3)], [STRIKE, ...fillers(3)], { correspondents: [] });
    assert.ok(!none.segments.some((s) => s.type === 'cross'));
  });

  test('the review reads a link as its story’s cross, and a second pass rebuilds the same link', () => {
    const b = run([strikeSeg(), ...fillerSegs(3)], [STRIKE, ...fillers(3)]);
    const script = collapseCrosses(b.segments);
    const s = script.find((x) => x.storyId === 'g1');
    assert.ok(!script.some((x) => x.type === 'cross'));
    assert.doesNotMatch(s.text, /Rhea Raster/, 'the hand-over comes off the story');
    assert.match(s.cross.piece, /Freight trains/);
    const again = run(script.filter((x) => x.type === 'story'), [STRIKE, ...fillers(3)]);
    assert.deepEqual(
      again.segments.filter((x) => x.type === 'cross').map((x) => x.text),
      b.segments.filter((x) => x.type === 'cross').map((x) => x.text)
    );
  });

  test('the prompts tell the writer and the editor the link rules', () => {
    const p = buildPrompt({ channelName: 'GLOBIT 24', program: WN, presenters: DUO, stories: [STRIKE] });
    assert.match(p, /Correspondent links/);
    assert.match(p, /NOT at the scene/);
    assert.match(p, /"cross"/);
    const plain = buildPrompt({ channelName: 'GLOBIT 24', program: { ...WN, crosses: 0 }, presenters: DUO, stories: [STRIKE] });
    assert.doesNotMatch(plain, /Correspondent links/);
    assert.doesNotMatch(plain, /"cross"/);
    assert.match(buildReviewPrompt({ channelName: 'GLOBIT 24', program: WN, script: { segments: [] }, stories: [STRIKE] }), /never claims to be at the scene/);
  });
});

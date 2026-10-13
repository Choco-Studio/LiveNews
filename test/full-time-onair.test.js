import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { BANKS, cutInAside, dayShape, numberDayless, saidScoreline, shapeEpisode } from '../server/sport/shape.js';
import { prepareStory, withoutOdds } from '../server/sport/prepare.js';
import { scorelineFrom } from '../server/sport/scores.js';
import { withoutJudgement } from '../server/sport/words.js';
import { normalizeForSpeech, planSpeech } from '../public/js/voice/speechtext.js';
import * as speech from '../public/js/voice/speechtext.js';
import { segmentRequest } from '../server/voice/plan.js';
import { planSegment } from '../public/js/v2/canvas25d/direction/index.js';
import { freezeAllClocks } from '../tools/sport/snapshot.mjs';

// FULL TIME on air (docs/programmes/full-time.md §9, step 7; docs/roadmap/critique/full-time.md): the faults the
// recordings of a matchday and a quiet-day edition showed, each with its fix.

const NOW = Date.parse('2026-10-13T09:00:00Z'); // a Tuesday morning: MIDWEEK
const SAT = Date.parse('2026-10-17T17:30:00Z'); // Saturday 18:30 in London: MATCHDAY
const presenters = { A: { name: 'Kai Sprite' }, B: { name: 'Rosa Rally' } };
const program = { title: 'FULL TIME', headlineMax: 45 };
const cand = (id, title, sport, summary, extra = {}) => ({ id, title, sport, summary, scorelines: [], fixtures: [], source: 'Pixelburg Sport', published: NOW - 3600_000, sportTag: sport.toUpperCase(), ...extra });
const sl = (a, b, sa, sb, sport, at = NOW) => ({ a, b, sa, sb, winner: a, loser: b, verb: 'beat', sport, published: at - 3600_000 });

describe('FULL TIME on air: the headlines and the rundown', () => {
  const candidates = [
    cand('lead', 'Coventry thump Newcastle for first home win', 'football', 'Coventry beat Newcastle 4-1 at home.', { scorelines: [sl('Coventry', 'Newcastle', 4, 1, 'football')] }),
    cand('react', 'Jaissle sorry for Coventry loss as Carra says Newcastle beaten up again', 'football', 'Newcastle boss Matthias Jaissle has apologised after the 4-1 loss at Coventry.'),
    cand('lewis', 'Lewis left out of England World Cup opener', 'rugby', 'Mikey Lewis has been left out of the England side.'),
    cand('bills', "Bills' Allen, 0-7 in OT games entering MNF, finally gets over hump in wild win", 'american-football', 'Josh Allen led the Bills to a 37-34 overtime win against the Rams.', { scorelines: [sl('Bills', 'Rams', 37, 34, 'american-football')] }),
  ];
  const episode = () => ({
    segments: [
      // the writer's three headlines and its teases: the match, its reaction and the rugby
      { type: 'intro', anchor: 'A', text: 'Coventry thump Newcastle for first home win. Jaissle sorry for Coventry loss. Lewis left out of England World Cup opener. Good morning, and welcome to FULL TIME.', cues: [], teases: ['lead', 'react', 'lewis', null] },
      { type: 'story', anchor: 'A', storyId: 'lead', headline: 'Coventry thump Newcastle for first home win', text: 'Coventry beat Newcastle 4-1 at home. It was their first home win of the season.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'react', headline: 'Jaissle sorry for Coventry loss', text: 'Newcastle boss Matthias Jaissle has apologised after the 4-1 loss at Coventry.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'lewis', headline: 'Lewis left out of England World Cup opener', text: 'Mikey Lewis has been left out of the England side.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'bills', headline: "Bills' Allen, 0-7 in OT games entering MNF", text: 'Josh Allen led the Bills to a 37-34 overtime win against the Rams.', cues: [] },
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ],
    rundown: ['lead', 'react', 'lewis', 'bills', 'gone'].map((storyId) => ({ storyId, headline: `writer's ${storyId}`, category: 'sport', source: 'Pixelburg Sport' })),
  });

  test('the montage cuts to the story each spoken headline names (the strap under the third showed another story)', () => {
    const ep = episode();
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, seed: 'm' });
    const intro = ep.segments[0];
    const heads = intro.text.split(/(?<=\.)\s+/).slice(0, 3);
    assert.equal(intro.teases.length, intro.text.replace(/\[[^\]]*\]\s*/g, '').split(/(?<=[.!?])\s+/).length, 'one tease a sentence');
    // never the match and its reaction both: the Bills come in, and the third frame is theirs
    assert.match(heads[2], /Bills/);
    assert.deepEqual(intro.teases.slice(0, 3), ['lead', 'lewis', 'bills']);
    assert.ok(intro.teases.slice(3).every((x) => x === null), 'the greeting teases nothing');
  });

  test('the rundown is the stories on air, in their order, with the straps and sport tags they air with', () => {
    const ep = episode();
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, seed: 'm' });
    const told = ep.segments.filter((s) => s.type === 'story' && s.storyId).map((s) => s.storyId);
    assert.deepEqual(ep.rundown.map((r) => r.storyId), told);
    assert.ok(!ep.rundown.some((r) => r.storyId === 'gone'));
    for (const r of ep.rundown) {
      const seg = ep.segments.find((s) => s.storyId === r.storyId);
      assert.equal(r.headline, seg.headline);
      assert.equal(r.kicker, seg.kicker);
    }
  });

  test('a strap is never the title cut inside its aside: "Bills\' Allen, 0-7 in OT games entering MNF"', () => {
    assert.equal(cutInAside("Bills' Allen, 0-7 in OT games entering MNF", "Bills' Allen, 0-7 in OT games entering MNF, finally gets over hump in wild win"), true);
    assert.equal(cutInAside('Coventry thump Newcastle', 'Coventry thump Newcastle for first home win'), false);
    assert.equal(cutInAside('Lille considering legal action', 'Lille considering legal action'), false);
    const ep = episode();
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, seed: 'm' });
    const bills = ep.segments.find((s) => s.storyId === 'bills');
    assert.equal(bills.headline, "Bills' Allen finally gets over hump");
  });

  test('the greeting names both presenters: a first-time viewer meets Rosa before she speaks', () => {
    for (const part of ['morning', 'afternoon', 'evening']) for (const line of BANKS.greeting[part]) assert.match(line, /\{A\}/), assert.match(line, /\{R\}/);
    const ep = episode();
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, seed: 'g' });
    assert.match(ep.segments[0].text, /Kai Sprite/);
    assert.match(ep.segments[0].text, /Rosa Rally/);
  });
});

describe('FULL TIME on air: the running order', () => {
  // the offline desk's Saturday: the women's semi-final told as THE NUMBER ("Our number of the day: 6,000.")
  const res = (id, title, a, b, sa, sb, sport, at) => cand(id, title, sport, `${a} beat ${b} ${sa}-${sb}.`, { published: at - 3600_000, scorelines: [sl(a, b, sa, sb, sport, at)] });
  const desk = (at) => [
    res('lead', 'Pixelburg United beat Bitport Athletic 3-1', 'Pixelburg United', 'Bitport Athletic', 3, 1, 'football', at),
    res('hawks', 'Harbourside Hawks beat Millbrook Foxes', 'Harbourside Hawks', 'Millbrook Foxes', 24, 17, 'rugby', at),
    { ...res('sirens', 'Saltmarsh Sirens beat Kestrel Vale Women to reach final', 'Saltmarsh Sirens', 'Kestrel Vale Women', 31, 12, 'rugby', at), summary: 'Saltmarsh Sirens beat Kestrel Vale Women 31-12 to reach the final of the Coastal Cup. A crowd of 6,000 watched the semi-final at the Saltmarsh Bowl.' },
    cand('vela', 'Ana Vela wins the Pixelburg Open', 'tennis', 'Ana Vela won the Pixelburg Open.', { published: at - 3600_000 }),
  ];
  const episode = () => ({
    segments: [
      { type: 'intro', anchor: 'A', text: 'Pixelburg United beat Bitport Athletic 3-1. Ana Vela wins the Pixelburg Open. Good evening, and welcome to FULL TIME.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'lead', headline: 'Pixelburg United beat Bitport Athletic 3-1', text: 'Pixelburg United beat Bitport Athletic 3-1.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'hawks', headline: 'Harbourside Hawks beat Millbrook Foxes', text: 'Harbourside Hawks beat Millbrook Foxes 24-17.', cues: [] },
      { type: 'story', anchor: 'A', storyId: 'vela', headline: 'Ana Vela wins the Pixelburg Open', text: 'Ana Vela won the Pixelburg Open.', cues: [] },
      { type: 'story', anchor: 'B', storyId: 'sirens', feature: 'number', numbers: [{ value: '6,000', label: 'WATCHED' }], headline: 'Saltmarsh Sirens beat Kestrel Vale Women to reach final', text: '[count] Our number of the day: 6,000. A crowd of 6,000 watched the semi-final at the Saltmarsh Bowl. Saltmarsh Sirens beat Kestrel Vale Women 31-12 to reach the final of the Coastal Cup.', cues: [] },
      { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
    ],
  });

  test('MATCHDAY has no THE NUMBER (§4): its story is told as any other, in the outlet\'s order, with its result on its board', () => {
    const ep = episode();
    const note = shapeEpisode(ep, { candidates: desk(SAT), program, presenters, now: SAT, seed: 'n' });
    assert.equal(note.shape, 'MATCHDAY');
    assert.ok(!ep.segments.some((s) => s.feature === 'number' || s.kicker === 'THE NUMBER'));
    const sirens = ep.segments.find((s) => s.storyId === 'sirens');
    assert.doesNotMatch(sirens.text, /number of the day/i);
    assert.match(sirens.text, /^(?:\[[^\]]*\]\s*)*(?:Some rugby now\. |Rugby now\. |To the rugby\. |On to the rugby\. |Rugby next\. )?Saltmarsh Sirens beat Kestrel Vale Women 31-12/);
    assert.equal(sirens.score?.sa, 31, 'the scoreline card');
    assert.equal(sirens.kicker, 'RUGBY');
    // among its sport's stories: the two rugby results together
    const order = ep.segments.filter((s) => s.type === 'story' && s.storyId).map((s) => s.storyId);
    assert.equal(Math.abs(order.indexOf('sirens') - order.indexOf('hawks')), 1, order.join(' '));
  });

  test('MIDWEEK keeps THE NUMBER, Rosa\'s, with its own card; the decision counts the results the stories tell', () => {
    const ep = episode();
    const note = shapeEpisode(ep, { candidates: desk(NOW), program, presenters, now: NOW, seed: 'n' });
    assert.equal(note.shape, 'MIDWEEK');
    const num = ep.segments.find((s) => s.feature === 'number');
    assert.equal(num?.anchor, 'B');
    assert.equal(num.kicker, 'THE NUMBER');
    // three results on the desk, all told in their stories: SCORE CENTRE has none, the day is no MATCHDAY
    const told = new Set(['Bitport Athletic|Pixelburg United', 'Harbourside Hawks|Millbrook Foxes', 'Kestrel Vale Women|Saltmarsh Sirens']);
    assert.equal(numberDayless({ candidates: desk(NOW), now: NOW, told }), false);
    assert.equal(dayShape({ weekday: 6, hour: 18 }, 0, 0), 'MATCHDAY');
    assert.equal(dayShape({ weekday: 2, hour: 9 }, 4, 0), 'MATCHDAY');
    assert.equal(dayShape({ weekday: 2, hour: 9 }, 3, 0), 'MIDWEEK');
    assert.ok(saidScoreline(desk(NOW)[0], 'Pixelburg United beat Bitport Athletic 3-1.'));
    assert.equal(saidScoreline(desk(NOW)[0], 'Pixelburg United won.'), undefined);
  });

  test('never two hand-overs by name in a row, and every transition a whole spoken line (never a bare "In tennis.")', () => {
    for (const [sport, lines] of Object.entries(BANKS.transition)) for (const l of lines) assert.doesNotMatch(l, /^In [A-Z][\w ]*\.$/, `${sport}: ${l}`);
    const ep = episode();
    shapeEpisode(ep, { candidates: desk(SAT), program, presenters, now: SAT, seed: 'h' });
    const stories = ep.segments.filter((s) => s.type === 'story' && s.storyId);
    const handed = stories.map((s) => BANKS.handover.some((h) => new RegExp(`${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\{N\\}', '(?:Kai|Rosa)').replace('\\{S\\}', 'the \\w+')}$`).test(s.text.replace(/\[[^\]]*\]\s*/g, '').trim())));
    for (let i = 1; i < handed.length; i++) assert.ok(!(handed[i] && handed[i - 1]), `two tosses in a row: ${stories[i - 1].text} / ${stories[i].text}`);
  });
});

describe('FULL TIME on air: the toss in vision', () => {
  test('no hand-over by name at the end of a story with a scoreline card: the next presenter takes the sport up', () => {
    const at = NOW;
    const candidates = [
      cand('lead', 'Pixelburg United beat Bitport Athletic 3-1', 'football', 'Pixelburg United beat Bitport Athletic 3-1.', { scorelines: [sl('Pixelburg United', 'Bitport Athletic', 3, 1, 'football', at)] }),
      cand('hawks', 'Harbourside Hawks beat Millbrook Foxes', 'rugby', 'Harbourside Hawks beat Millbrook Foxes 24-17.', { scorelines: [sl('Harbourside Hawks', 'Millbrook Foxes', 24, 17, 'rugby', at)] }),
      cand('vela', 'Ana Vela wins the Pixelburg Open', 'tennis', 'Ana Vela won the Pixelburg Open.'),
    ];
    const ep = {
      segments: [
        { type: 'intro', anchor: 'A', text: 'Pixelburg United beat Bitport Athletic 3-1. Good morning, and welcome to FULL TIME.', cues: [] },
        { type: 'story', anchor: 'A', storyId: 'lead', headline: 'Pixelburg United beat Bitport Athletic 3-1', text: 'Pixelburg United beat Bitport Athletic 3-1. United are top.', cues: [] },
        { type: 'story', anchor: 'B', storyId: 'hawks', headline: 'Harbourside Hawks beat Millbrook Foxes', text: 'Harbourside Hawks beat Millbrook Foxes 24-17. The Hawks are unbeaten.', cues: [] },
        { type: 'story', anchor: 'A', storyId: 'vela', headline: 'Ana Vela wins the Pixelburg Open', text: 'Ana Vela won the Pixelburg Open.', cues: [] },
        { type: 'outro', anchor: 'A', text: 'That is FULL TIME.', cues: [] },
      ],
    };
    shapeEpisode(ep, { candidates, program, presenters, now: NOW, seed: 'v' });
    const lead = ep.segments.find((s) => s.storyId === 'lead');
    const hawks = ep.segments.find((s) => s.storyId === 'hawks');
    const vela = ep.segments.find((s) => s.storyId === 'vela');
    assert.ok(lead.score && hawks.score);
    assert.doesNotMatch(lead.text, /(?:Rosa|Kai)[^.]*\b(?:has|with|for|takes)\b[^.]*\bthe rugby\./, lead.text);
    assert.doesNotMatch(hawks.text, /the tennis\./, hawks.text);
    assert.ok(BANKS.transition.rugby.some((l) => hawks.text.replace(/^(?:\[[^\]]*\]\s*)*/, '').startsWith(l)), hawks.text);
    assert.ok(BANKS.transition.tennis.some((l) => vela.text.replace(/^(?:\[[^\]]*\]\s*)*/, '').startsWith(l)), vela.text);
  });
});

describe('FULL TIME on air: the desk', () => {
  test('betting\'s language never airs: a point spread\'s clause goes, a sentence about odds goes whole', () => {
    assert.equal(withoutOdds('The Trail Blazers extended their lead in every quarter, going into the breaks 34-21, 72-33 and 100-49 ahead, having entered the game as 36.5-point favourites.'), 'The Trail Blazers extended their lead in every quarter, going into the breaks 34-21, 72-33 and 100-49 ahead.');
    assert.equal(withoutOdds('The bookmakers make them 2/1 favourites.'), null);
    assert.equal(withoutOdds('England head into the World Cup as underdogs.'), 'England head into the World Cup as underdogs.');
    const s = prepareStory({ id: 'nba', title: 'London Lions given lesson by Portland', summary: 'The London Lions became the first British club to face an NBA team but suffered a heavy 119-66 defeat to the Portland Trail Blazers in Oregon on Monday. The Trail Blazers extended their lead in every quarter, having entered the game as 36.5-point favourites.', link: 'https://www.skysports.com/nba/news/1/2', source: 'Sky Sports', published: NOW - 3600_000, category: 'sport' }, { now: NOW });
    assert.doesNotMatch(s.summary, /favourites/);
  });

  test('a verdict carried in a "with" phrase goes, the result stays ("with his usual late-game theatrics", ESPN 13 Oct)', () => {
    assert.equal(withoutJudgement('Josh Allen came through with his usual late-game theatrics in leading the Bills to a 37-34 overtime win against the Rams.'), 'Josh Allen came through in leading the Bills to a 37-34 overtime win against the Rams.');
    assert.equal(withoutJudgement('The Bills won with a late field goal.'), 'The Bills won with a late field goal.');
    assert.equal(withoutJudgement('His heroics won the game.'), null, 'a verdict that is the sentence still drops it');
  });

  test('a result whose subject opens the sentence and suffers it after "but": the London Lions\' 119-66 (Sky Sports, 13 Oct)', () => {
    const r = scorelineFrom('The London Lions became the first British club to face an NBA team but suffered a heavy 119-66 defeat to the Portland Trail Blazers in Oregon on Monday.', 'basketball');
    assert.deepEqual([r.winner, r.loser, r.sa, r.sb], ['Portland Trail Blazers', 'London Lions', 119, 66]);
    assert.equal(scorelineFrom('Fans of Leeds cheered but suffered a 2-1 defeat to Wigan.', 'football'), null, 'never a crowd for a team');
    assert.equal(scorelineFrom('Arsenal said they were proud but suffered a 2-1 defeat to Spurs.', 'football'), null, 'one clause, no reported speech');
  });
});

describe('FULL TIME on air: the voice reads results as a results reader', () => {
  const say = (t, sport) => normalizeForSpeech(t, { lang: 'en-GB', sport }).spoken;
  test('cricket totals, tennis sets, American records, football and rugby nil, a hundred keeps its "to"', () => {
    assert.match(say('as the Proteas laboured to 102-4.', 'cricket'), /one hundred and two for four/);
    assert.match(say('England won the series 2-1.', 'cricket'), /series two one/);
    assert.match(say('beating top seed Lia Moreau 6-4 6-3 in the final.', 'tennis'), /six-four, six-three/);
    assert.match(say('He won 6-0 7-6 (7-4).', 'tennis'), /six-love, seven-six, seven-four/);
    assert.match(say("Before Monday's game, Allen was 0-7 in overtime.", 'american-football'), /oh and seven/);
    assert.match(say('going into the breaks 34-21, 72-33 and 100-49 ahead', 'basketball'), /thirty-four twenty-one, seventy-two thirty-three and one hundred to forty-nine/);
    assert.match(say('the England side that suffered a 3-0 Ashes series defeat', 'rugby'), /three nil Ashes/);
    assert.match(say('They set up in a 4-3-3.', 'football'), /four-three-three/);
    assert.match(say('Portland Trail Blazers beat London Lions 119-66.', null), /one hundred and nineteen to sixty-six/);
  });

  test('without a sport (every other programme) the reading is as before', () => {
    assert.match(say('The vote was 5-4.', null), /five to four/);
    assert.match(say('Coventry beat Newcastle 4-1.', null), /four one/);
  });

  test('the voice plan passes a FULL TIME story\'s sport to the planner (and nothing for a segment without one)', () => {
    const base = { type: 'story', anchor: 'A', emotion: 'neutral', text: 'Ana Vela won, beating Lia Moreau 6-4 6-3 in the final.', cues: [] };
    const withSport = segmentRequest({ ...base, sport: 'tennis' }, { presenterId: 'kai', presenter: { id: 'kai', voice: { lang: 'en-gb' } }, casting: {}, speech });
    const without = segmentRequest(base, { presenterId: 'kai', presenter: { id: 'kai', voice: { lang: 'en-gb' } }, casting: {}, speech });
    assert.ok(withSport.phrases.some((p) => /six-four, six-three/.test(p.say || '')), JSON.stringify(withSport.phrases.map((p) => p.say)));
    assert.ok(!without.phrases.some((p) => /six-four, six-three/.test(p.say || '')));
    assert.ok(planSpeech('x', {}));
  });
});

/** A canvas whose context records fills (as test/full-time-graphics.test.js; font.js draws into its own canvases). */
function fakeCanvas(width = 384, height = 216) {
  const cv = { width, height };
  const ctx = {
    canvas: cv,
    fills: [],
    fillStyle: '#000',
    globalAlpha: 1,
    imageSmoothingEnabled: false,
    save() {},
    restore() {},
    fillRect(x, y, w, h) { this.fills.push({ c: this.fillStyle, x, y, w, h }); },
    drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    putImageData() {},
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    createPattern() { return {}; },
    measureText() { return { width: 0 }; },
  };
  for (const m of ['beginPath', 'rect', 'clip', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'closePath', 'setTransform', 'translate', 'scale', 'fillText', 'clearRect']) ctx[m] = () => {};
  cv.getContext = () => ctx;
  return cv;
}

describe('FULL TIME on air: picture', () => {
  let cards;
  let gfx;
  before(async () => {
    globalThis.document = { createElement: () => fakeCanvas(300, 150) };
    cards = await import('../public/js/scenes/cards.js');
    gfx = await import('../public/js/gfx/index.js');
  });

  test('the headline montage\'s chip is the story\'s sport when one is given (FOOTBALL, not SPORT on every headline)', () => {
    const chip = (o) => fakeCanvas().getContext('2d');
    const draw = (o) => {
      const ctx = chip();
      cards.drawHeadlineFrame(ctx, 10, 2, { index: 1, total: 3, headline: 'Coventry thump Newcastle for first home win', source: 'Sky Sports', category: 'sport', ...o });
      return ctx.fills.filter((f) => f.h === 11).map((f) => f.w);
    };
    assert.ok(draw({ kicker: 'FOOTBALL' }).includes(gfx.textW('FOOTBALL') + 13));
    assert.ok(draw({}).includes(gfx.textW('SPORT') + 13), 'without a kicker (every other programme) the category, as before');
  });

  test('the scoreline card has one type size: "PORTLAND TRAIL BLAZERS" never at 1x over "LONDON LIONS" at 2x', async () => {
    const { scoreLayout } = await import('../public/js/scenes/cards-sport.js');
    const sizes = (sc) => {
      const L = scoreLayout(sc, 'Sky Sports');
      const rows = L.laid || [L.hn, L.an];
      assert.ok(L.PY >= 28 && L.PY + L.PH <= 134, `inside the safe area: ${L.PY}+${L.PH}`);
      return rows.map((r) => r.scale);
    };
    const lions = { a: 'Portland Trail Blazers', b: 'London Lions', sa: 119, sb: 66, winner: 'Portland Trail Blazers', sport: 'basketball' };
    assert.deepEqual(sizes(lions), [2, 2], 'the long name on two lines before anything shrinks');
    assert.deepEqual(scoreLayout(lions, 'Sky Sports').laid[0].lines, ['PORTLAND', 'TRAIL BLAZERS']);
    assert.deepEqual(sizes({ a: 'Wolverhampton Wanderers Women', b: 'Saltmarsh', sa: 2, sb: 1, sport: 'football' }), [2, 2]);
    // two long names: at 2x on two lines each the board would leave the safe area, so both drop to 1x together
    assert.deepEqual(sizes({ a: 'Wolverhampton Wanderers Women', b: 'Brighton & Hove Albion Women', sa: 2, sb: 1, sport: 'football' }), [1, 1]);
    assert.deepEqual(sizes({ a: 'Coventry', b: 'Newcastle', sa: 4, sb: 1, home: 'Coventry', sport: 'football' }), [2, 2]);
    assert.deepEqual(sizes({ a: 'Brighton & Hove Albion', b: 'Coventry', sa: 3, sb: 0, home: 'Coventry', sport: 'football' }), [1, 1]);
  });

  test('THE NUMBER keeps its own name on its card (never BY THE NUMBERS over one figure)', () => {
    assert.equal(cards.boardTitle('numbers', { kicker: 'THE NUMBER' }), 'THE NUMBER');
    assert.equal(cards.boardTitle('numbers', { kicker: 'THE WEEK IN NUMBERS' }), 'THE WEEK IN NUMBERS');
    assert.equal(cards.boardTitle('numbers', { kicker: 'NUMBER OF THE DAY' }), 'BY THE NUMBERS', 'other programmes as before');
  });

  test('a short result story still shows its scoreline card (the nine-second basketball result aired with none)', () => {
    const story = { type: 'story', anchor: 'A', storyId: 's1', kicker: 'BASKETBALL', score: { a: 'Bitport Comets', b: 'Harbourside Herons', sa: 98, sb: 91, winner: 'Bitport Comets' }, text: 'Bitport Comets beat Harbourside Herons 98-91, with guard Theo Ansah scoring 31 points. The Comets have won seven of their first eight games.', cues: [] };
    const ep = (id) => ({
      program: { id, theme: id === 'full-time' ? 'sport' : 'world' },
      presenters: { A: { id: 'kai' }, B: { id: 'rosa' } },
      segments: [{ type: 'intro', anchor: 'A', text: 'Good evening.' }, story, { type: 'outro', anchor: 'A', text: 'Good night.' }],
    });
    // (on air the director's pause after a story is FULL TIME's 0.85 s, pace.js gaps.story: the card holds through it)
    const shots = planSegment(ep('full-time'), 1, { gapAfter: 0.85 }).events.filter((e) => e.kind === 'shot');
    assert.deepEqual(shots.map((e) => e.shot), ['close', 'fact']);
    assert.equal(shots[1].char, story.text.indexOf('The Comets'));
    // other programmes have no scoreline board: their plan is unchanged
    assert.ok(!planSegment(ep('world-now'), 1, { gapAfter: 0.85 }).events.some((e) => e.kind === 'shot' && e.shot === 'fact'));
  });
});

describe('FULL TIME on air: its own shot windows', () => {
  test('the v2 planner plays FULL TIME\'s pace profile, not WORLD NOW\'s: no studio shot past its 12 s (a 13 s single aired)', async () => {
    const { SHOT_STYLES } = await import('../public/js/v2/canvas25d/direction/shots.js');
    const { PACE } = await import('../public/js/pace.js');
    assert.equal(SHOT_STYLES['full-time'].studioMax, PACE['full-time'].shots.studioMax);
    assert.equal(SHOT_STYLES['full-time'].singleSoft, PACE['full-time'].shots.singleSoft);
    assert.equal(SHOT_STYLES['full-time'].pictureMax, PACE['full-time'].shots.picture[1]);
    const story = { type: 'story', anchor: 'B', storyId: 's2', kicker: 'FOOTBALL', follows: true, text: 'There is more on that one. Newcastle boss Matthias Jaissle has apologised to the travelling fans following their 4-1 loss at Coventry, as Jamie Carragher said they were beaten up once again on the road.', cues: [] };
    const ep = { program: { id: 'full-time', theme: 'sport' }, presenters: { A: { id: 'kai' }, B: { id: 'rosa' } }, segments: [{ type: 'intro', anchor: 'A', text: 'Good morning.' }, story, { type: 'outro', anchor: 'A', text: 'Goodbye.' }] };
    const shots = planSegment(ep, 1, { gapAfter: 0.6 }).events.filter((e) => e.kind === 'shot');
    const end = story.text.length / 14.5 + 0.6;
    const lens = shots.map((e, k) => (k + 1 < shots.length ? shots[k + 1].at : end) - e.at);
    assert.ok(shots.length >= 2, `split: ${shots.map((e) => `${e.shot}@${e.at.toFixed(1)}`).join(' ')}`);
    assert.ok(lens.every((l) => l <= PACE['full-time'].shots.studioMax + 0.01), lens.join(', '));
  });
});

describe('FULL TIME on air: the recording tools', () => {
  test('the on-air launcher freezes the whole clock: Date.now() and new Date() alike, running on', () => {
    const t0 = Date.parse('2026-10-17T17:30:00Z');
    const restore = freezeAllClocks(t0);
    try {
      assert.ok(Math.abs(Date.now() - t0) < 1000);
      assert.ok(Math.abs(new Date().getTime() - t0) < 1000);
      assert.equal(new Date(5).getTime(), 5);
      assert.equal(new Date('2026-01-01T00:00:00Z').toISOString(), '2026-01-01T00:00:00.000Z');
      assert.ok(new Date() instanceof Date);
    } finally {
      restore();
    }
    assert.ok(Math.abs(Date.now() - t0) > 1000);
  });
});

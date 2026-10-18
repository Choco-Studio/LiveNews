// The visual-variety round (owner, 18 Oct, on PAY ATTENTION and FULL TIME: "necesitan algunas diapositivas más o cosas
// que no lo hagan muy repetitivo"; docs/roadmap/critique/visual-variety.md): the pacing standard each programme is held
// to (public/js/variety.js VARIETY), checked on the real directors through the fake clock: no shot past its maximum, none
// under the network's 4 s floor, never the same layout twice in a row, at least three kinds of picture in every minute,
// at most ten cuts a minute. And the pieces that make it: the shot taxonomy, FULL TIME's table and form boards read from
// a story's own words (server/sport/stats.js), SCORE CENTRE's turn to its wall, the results ticker.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { VARIETY, shotLayout, varietyReport, varietyFaults } from '../public/js/variety.js';
import { measureVariety } from '../tools/pace/variety.mjs';
import { loadChannel } from '../server/channel.js';
import { quizEdition } from './fixtures/quiz-week.js';
import { standingOf, formOf, countOf } from '../server/sport/stats.js';
import { turnRow } from '../public/js/director.js';
import { resultEntry, fixtureEntries, programGraphics } from '../public/js/graphics/index.js';
import { iconOf, sportOfKicker, ICONS } from '../public/js/scenes/cards-sport.js';

const channel = loadChannel(undefined, { drafts: true });
const CH = { name: 'GLOBIT 24', slogan: '', presenters: channel.presenters, programs: channel.programs };

describe('the shot taxonomy (variety.js shotLayout)', () => {
  test('presenters by framing, boards by name, a question board\'s reveal view a picture of its own', () => {
    assert.deepEqual(shotLayout({ shot: 'wide', framing: 'quiz-wide-tight' }), { group: 'presenter', kind: 'wide', layout: 'quiz-wide-tight' });
    assert.equal(shotLayout({ shot: 'wide', framing: 'quiz-two-a' }).kind, 'two');
    assert.equal(shotLayout({ shot: 'wide', framing: 'two' }).kind, 'two');
    assert.equal(shotLayout({ shot: 'close', framing: 'ots', focus: 'B' }).kind, 'ots');
    assert.equal(shotLayout({ shot: 'close', framing: 'mcu-l', focus: 'A' }).layout, 'single:mcu-l:A');
    assert.equal(shotLayout({ shot: 'quiz', card: { board: 'where', o: {} } }).layout, 'board:where');
    assert.deepEqual(shotLayout({ shot: 'quiz', card: { board: 'where', o: { view: 'reveal' } } }), { group: 'map', kind: 'board:where-reveal', layout: 'board:where-reveal' });
    assert.equal(shotLayout({ shot: 'quiz', card: { board: 'picture-open', o: {} } }).group, 'picture');
    assert.equal(shotLayout({ shot: 'scores', card: { view: 'wall' } }).layout, 'board:scores-wall');
    assert.equal(shotLayout({ shot: 'fact', card: { sport: { name: 'TENNIS', sport: 'tennis' } } }).layout, 'board:sport');
    assert.equal(shotLayout({ shot: 'fact', card: { standing: { team: 'KILMARNOCK', text: 'OFF THE BOTTOM' } } }).layout, 'board:standing');
    assert.equal(shotLayout({ shot: 'montage', card: { look: 'sport:tennis' } }).layout, 'montage:sport:tennis');
    assert.equal(shotLayout({ shot: 'endcard' }).group, 'furniture');
  });

  test('the report finds every breach: a long shot, a short one, a layout twice, a flat minute, too many cuts', () => {
    const shots = [];
    let t = 0;
    const add = (len, shot, framing = null, card = null) => {
      shots.push({ t, shot, framing, focus: 'A', card });
      t += len;
    };
    add(16, 'fact', null, { fact: 'X' }); // past FULL TIME's 12 s
    add(3, 'close', 'mcu-l'); // under the floor
    add(6, 'close', 'mcu-l'); // the same layout twice
    for (let k = 0; k < 8; k++) add(8, 'close', k % 2 ? 'mcu-l' : 'ots'); // a minute of singles and over-the-shoulders only
    const r = varietyReport(shots, { end: t, window: 60, maxShot: 12, maxStudio: 12, minShot: 4 });
    const f = varietyFaults(r, 'full-time');
    assert.ok(f.some((x) => /held 16 s .*the most is 12/.test(x)), f.join('\n'));
    assert.ok(f.some((x) => /held 3 s .*floor/.test(x)), f.join('\n'));
    assert.ok(f.some((x) => /twice in a row/.test(x)), f.join('\n'));
    assert.ok(f.some((x) => /only 2 kind\(s\)/.test(x)), f.join('\n'));
    const fast = [];
    for (let k = 0; k < 40; k++) fast.push({ t: k * 4.5, shot: 'close', framing: k % 2 ? 'mcu-l' : 'ots', focus: 'A' });
    assert.ok(varietyFaults(varietyReport(fast, { end: 180, minShot: 4 }), 'full-time').some((x) => /cuts a minute/.test(x)));
  });

  test('the standard: PAY ATTENTION\'s boards to 15 s (PICTURE THIS\'s reading board 22), FULL TIME\'s every picture to 12', () => {
    assert.equal(VARIETY['pay-attention'].maxShot, 15);
    assert.equal(VARIETY['pay-attention'].limits['board:picture'], 22);
    assert.equal(VARIETY['full-time'].maxShot, 12);
    for (const id of ['pay-attention', 'full-time']) {
      const V = VARIETY[id];
      assert.equal(V.maxStudio, 12, id);
      assert.equal(V.minShot, 4, id);
      assert.equal(V.cutsPerMin, 10, id);
      assert.ok(V.kindsPerWindow >= 3 && V.window === 60, id);
    }
  });
});

describe('PAY ATTENTION holds the standard (the director, the fake clock)', () => {
  // editions of every round type, every DOUBLE OR NOTHING, a stall and a tie-break (fixture week seeds)
  const seeds = ['s0', 's1', 's2', 's3', 's4', 's6', 's11', 's14', 's18', 's27'];
  test('every edition: no breach, the new pictures on air, more kinds than the boards and the one wide of before', async () => {
    const seen = new Set();
    for (const seed of seeds) {
      const ed = quizEdition(channel, seed);
      const { report, faults } = await measureVariety(ed.episode, { channel: CH });
      assert.deepEqual(faults, [], `${seed}: ${faults.join('; ')}`);
      assert.ok(report.distinctKinds >= 12, `${seed}: ${report.distinctKinds} kinds`);
      assert.ok(report.share.presenter >= 0.28, `${seed}: faces ${report.share.presenter}`);
      for (const k of Object.keys(report.kinds)) seen.add(k);
    }
    // the round transitions, the reveal views, the two-shots and the tighter wide, PICTURE THIS's picture, the half-time race
    for (const k of ['board:round', 'board:where-reveal', 'board:letters-reveal', 'board:howmany-reveal', 'board:picture-reveal', 'board:picture-open', 'board:halftime', 'two']) assert.ok(seen.has(k), `never on air: ${k}`);
  });
});

describe('FULL TIME holds the standard (17 Oct\'s real edition, its recorded voices\' timing)', () => {
  const ep = JSON.parse(fs.readFileSync(new URL('./fixtures/full-time-17oct.json', import.meta.url), 'utf8'));
  test('no breach; the sport\'s slates, the table board, SCORE CENTRE in two pictures, the two-way, the sport frames', async () => {
    const { report, faults, log } = await measureVariety(ep, { channel: CH });
    assert.deepEqual(faults, [], faults.join('; '));
    for (const k of ['board:sport', 'board:standing', 'board:scores', 'board:scores-wall', 'board:moment', 'two', 'wide', 'single']) assert.ok(report.kinds[k], `never on air: ${k}`);
    assert.ok(report.distinctKinds >= 11, `${report.distinctKinds} kinds`);
    // the headline frames of a picture-less edition: each story's sport, never one text template three times
    const frames = log.shots.filter((x) => x.shot === 'montage').map((x) => shotLayout(x).layout);
    assert.ok(frames.length >= 3 && new Set(frames).size === frames.length, frames.join(', '));
    // SCORE CENTRE: the stadium's board, then the wall, each inside 12 s and at least the floor
    const i = log.shots.findIndex((x) => x.shot === 'scores');
    const wall = log.shots[i + 1];
    assert.equal(wall.card?.view, 'wall');
    const a = wall.t - log.shots[i].t;
    const b = log.shots[i + 2].t - wall.t;
    assert.ok(a >= 4 && a <= 12 && b >= 4 && b <= 12, `${a.toFixed(2)} s then ${b.toFixed(2)} s`);
  });
  test('the slate names the sport as its strap does, once a turn of the running order', () => {
    const slates = ep.segments.filter((s) => s.slate).map((s) => s.slate);
    assert.ok(slates.length >= 3);
    for (const s of slates) assert.ok(s.name && Number(s.count) >= 1 && typeof s.sport === 'string', JSON.stringify(s));
    const names = slates.map((s) => s.name);
    for (let k = 1; k < names.length; k++) assert.notEqual(names[k], names[k - 1]);
  });
});

describe('FULL TIME\'s table and form boards: a story\'s own words, the side the sentence names (stats.js)', () => {
  const kilmarnock = { a: 'Kilmarnock', b: 'Motherwell', sa: 3, sb: 2, winner: 'Kilmarnock' };
  const norwich = { a: 'Portsmouth', b: 'Norwich', sa: 1, sb: 0, winner: 'Portsmouth' };
  test('a place and a run said of a scoreline\'s side', () => {
    assert.deepEqual(standingOf('Greg Kiltie scored twice to lift Kilmarnock off the bottom of the Scottish Premiership with a 3-2 win over Motherwell.', kilmarnock), { text: 'OFF THE BOTTOM OF THE SCOTTISH PREMIERSHIP', team: 'KILMARNOCK' });
    assert.deepEqual(standingOf('Portsmouth are six points clear at the top of the table.', norwich), { text: 'SIX POINTS CLEAR AT THE TOP OF THE TABLE', team: 'PORTSMOUTH' });
    assert.deepEqual(formOf('It was a fifth successive league defeat for Norwich at Carrow Road.', norwich), { count: 5, label: 'SUCCESSIVE LEAGUE DEFEATS', cells: 'LLLLL', team: 'NORWICH' });
    assert.deepEqual(formOf('Portsmouth have won six consecutive games.', norwich), { count: 6, label: 'CONSECUTIVE GAMES WON', cells: 'WWWWWW', team: 'PORTSMOUTH' });
    // (an unbeaten run gives no outcome a game: no cells)
    assert.equal(formOf('Portsmouth are unbeaten in nine league games.', norwich).cells, '');
    assert.equal(countOf('fifth'), 5);
    assert.equal(countOf('13th'), 13);
  });
  test('never a side the sentence does not name, a run that ended or is still to come, someone\'s quoted words', () => {
    assert.equal(formOf('It was a fifth successive league defeat for the hosts.', norwich), null);
    assert.equal(formOf("Portsmouth ended Norwich's four-match winning streak.", norwich), null);
    assert.equal(formOf('Norwich are chasing a third consecutive win.', norwich), null);
    assert.equal(formOf('"Norwich have lost five league games in a row," said the manager.', norwich), null);
    assert.equal(formOf('They have lost a game after four years and 41 games unbeaten.', norwich), null);
    assert.equal(standingOf('The Steelmen stay bottom of the table.', kilmarnock), null);
    assert.equal(standingOf('Kilmarnock could go top of the table with a win.', kilmarnock), null);
    assert.equal(formOf('Norwich have lost three in a row.', null), null);
  });
});

describe('SCORE CENTRE\'s wall and the results ticker', () => {
  test('the wall comes in on the row nearest the middle of the voice, both pictures at least the floor', () => {
    const text = 'Here are the scores. A drew 1-1 with B. C beat D 2-1. E beat F 3-1. G beat H 1-0. I drew 0-0 with J.';
    const rows = [21, 41, 56, 71, 86].map((char) => ({ char }));
    const words = text.split(' ').reduce((a, w) => (a.push({ char: a.length ? a.at(-1).char + a.at(-1).w.length + 1 : 0, w, t: 0 }), a), []).map((x) => ({ char: x.char, t: (x.char / text.length) * 20 }));
    const k = turnRow({ text, audio: { words } }, rows, 20, 0.85, 4);
    assert.equal(k, 2, 'the middle row');
    assert.equal(turnRow({ text }, rows.slice(0, 1), 20, 0.85, 4), -1, 'never the first row');
  });
  test('the results read so far, the winner first, in the band; the headlines until two', () => {
    assert.equal(programGraphics({ id: 'full-time' }).ticker, 'results');
    const e = resultEntry({ a: 'Hibs', b: 'Falkirk', sa: 1, sb: 2, winner: 'Falkirk' });
    assert.equal(e.label, 'RESULTS');
    assert.equal(e.text, 'FALKIRK BEAT HIBS');
    assert.equal(e.value, '2-1');
    assert.equal(resultEntry({ a: 'Dundee United', b: 'St Johnstone', sa: 1, sb: 1, draw: true }).text, 'DUNDEE UNITED DREW WITH ST JOHNSTONE');
    // COMING UP's fixtures once read: the event and its day, a long one in pages
    const f = fixtureEntries({ event: 'Starfield City v Glimmerford', when: 'Wednesday' });
    assert.equal(f.length, 1);
    assert.deepEqual([f[0].label, f[0].text, f[0].value], ['COMING UP', 'STARFIELD CITY V GLIMMERFORD', 'WEDNESDAY']);
    const long = fixtureEntries({ event: 'WOLVERHAMPTON WANDERERS V BRIGHTON & HOVE ALBION WOMEN', when: '11 DECEMBER' });
    assert.ok(long.length >= 1 && long.every((e) => e.label === 'COMING UP'));
    assert.deepEqual(fixtureEntries(null), []);
  });
  test('racing has its icon (a horseshoe), a strap\'s tag its sport', () => {
    assert.equal(iconOf('racing'), 'racing');
    assert.equal(ICONS.racing.length, 11);
    assert.equal(sportOfKicker('RUGBY LEAGUE'), 'rugby');
    assert.equal(sportOfKicker('Racing'), 'racing');
    assert.equal(sportOfKicker('DARTS'), null);
  });
});

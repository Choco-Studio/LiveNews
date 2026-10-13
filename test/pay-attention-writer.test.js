import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Archive } from '../server/archive.js';
import { quizEvents } from '../server/quiz/desk.js';
import { planEdition, contestantsFrom } from '../server/quiz/planner.js';
import { writeEpisode, airedWhen, spokenTime, placeSaid, figureSaid } from '../server/quiz/writer.js';
import { playEdition, playHowMany, decidedBeforeDon, SKILL } from '../server/quiz/players.js';
import { QuizTable, weekOf } from '../server/quiz/table.js';
import { HOST, ANSWERS, PLAYERS } from '../server/quiz/banks.js';
import { seeded } from '../server/quiz/rounds.js';
import { loadChannel } from '../server/channel.js';

// PAY ATTENTION's writer (docs/programmes/pay-attention.md §4–5; build step 2): the players' model, the banks, the
// episode, the weekly table.

const H = 3600_000;
const DAY = 24 * H;
const NOW = Date.parse('2026-10-15T15:00:00Z'); // Thursday 16:00 London
const channel = loadChannel();
const CONTESTANTS = contestantsFrom(channel, ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']);
const COUNTRIES = [['France', 46.6, 2.2], ['Japan', 36.2, 138.3], ['Brazil', -10.8, -52.9], ['Kenya', 0.2, 37.9], ['Canada', 56.1, -106.3], ['Australia', -25.3, 133.8], ['Morocco', 31.8, -7.1], ['Peru', -9.2, -75], ['Jordan', 30.6, 36.2]];
const PROGRAMMES = [['world-now', 'world'], ['tech-bytes', 'tech'], ['cosmos', 'science'], ['money-minute', 'business'], ['news-60', 'world']];
const NOUNS = ['Telescope', 'Museum', 'Garden', 'Robot', 'Orchestra', 'Library', 'Bridge', 'Satellite', 'Festival', 'Glacier', 'Ferry', 'Observatory'];
function week(now = NOW) {
  const a = new Archive({ dir: null, days: 14, now: () => now });
  let n = 0;
  for (let d = 9; d >= 0; d--) {
    for (let k = 0; k < 12; k++) {
      const [programId, category] = PROGRAMMES[n % PROGRAMMES.length];
      const title = `${NOUNS[n % NOUNS.length]} opens a quiet new wing number ${n + 1}`;
      const placed = n % 3 === 0;
      const [country, lat, lon] = COUNTRIES[n % COUNTRIES.length];
      const fig = n % 4 === 1;
      a.keep({ id: `e${n}`, at: now - d * DAY - (k + 1) * 50 * 60_000, programId, category, rank: k % 6, title, headline: title, link: 'https://www.bbc.co.uk/x', source: 'BBC News', image: 'https://x/y.jpg', summary: '',
        text: `${title}${placed ? ` in ${country}` : ''}. The work took ${fig ? `${120 + n} days` : 'months'}, its makers say.`,
        ...(placed ? { location: { place: country.toUpperCase(), lat, lon } } : {}), ...(fig ? { numbers: [{ value: String(120 + n), label: 'DAYS' }] } : {}) });
      n++;
    }
  }
  a.entries.slice(-24).forEach((e, i) => a.keep({ ...e, at: now - ((i * 37) % 300) * 60_000 - 60_000 }));
  a.entries.sort((x, y) => x.at - y.at);
  return a;
}
function edition(seed = 'w', now = NOW, extra = {}) {
  const archive = week(now);
  const { events, avoid } = quizEvents(archive, { now, days: 7 });
  const plan = planEdition({ events, entries: archive.entries, now, contestants: CONTESTANTS, history: [], avoid, seed });
  return { plan, ...writeEpisode(plan, { channel, now, nextAt: now + 4.5 * H, ...extra }) };
}

describe('the players (§4.2)', () => {
  test('the same plan always plays the same game', () => {
    const { plan } = edition('det');
    const g1 = playEdition(plan, seeded('x'));
    const g2 = playEdition(plan, seeded('x'));
    assert.deepEqual(g1.scores, g2.scores);
    assert.equal(g1.winner, g2.winner);
  });
  test('two guesses are never the same number; an unqualified exact guess earns three', () => {
    const q = { figure: { value: '150', label: 'DAYS', exact: true } };
    for (let i = 0; i < 200; i++) {
      const p = playHowMany(q, ['ada', 'unit8'], seeded(`g${i}`));
      assert.notEqual(p.ada.guess, p.unit8.guess);
      if (p.ada.guess === 150) assert.equal(p.ada.points, 3);
    }
    const qual = { figure: { value: '150', label: 'DAYS', exact: false } };
    for (let i = 0; i < 200; i++) for (const pl of Object.values(playHowMany(qual, ['ada', 'unit8'], seeded(`q${i}`)))) assert.ok(pl.points <= 2);
  });
  test('every player is strong on a desk outside their own programme', () => {
    const own = { paco: 'world', lola: 'world', max: 'tech', ada: 'tech', nova: 'science', unit8: 'science', penny: 'business', sam: 'world' };
    for (const [id, home] of Object.entries(own)) assert.ok(SKILL[id].strong.some((d) => d !== home), id);
  });
  test('the score adds up: rounds, then DOUBLE OR NOTHING at double points for the player behind', () => {
    const { game } = edition('sum');
    const [a, b] = Object.keys(game.scores);
    const last = game.rounds.at(-1).played.at(-1).after;
    assert.deepEqual(game.don.before, last);
    const donPts = (id) => game.don.played.after[id] - game.don.before[id];
    if (donPts(game.don.trailing) > 0) assert.equal(donPts(game.don.trailing) % 2, 0);
    assert.equal(typeof decidedBeforeDon(game), 'boolean');
    assert.ok(game.scores[a] >= 0 && game.scores[b] >= 0);
  });
});

describe('the episode (§4, §5)', () => {
  const { plan, episode, game } = edition('ep');
  const segs = episode.segments;
  test('the shape: open, welcome, three rounds, the scores, DOUBLE OR NOTHING, the result, the sign-off', () => {
    assert.equal(segs[0].part, 'open');
    assert.equal(segs.at(-1).part, 'signoff');
    assert.equal(segs.filter((s) => s.part === 'round').length, 3);
    assert.equal(segs.filter((s) => s.part === 'scores').length, 1);
    assert.equal(segs.filter((s) => s.part === 'don').length, 1);
    assert.equal(segs.filter((s) => s.part === 'result').length, 1);
    assert.deepEqual(episode.cast, { H: 'host', A: plan.pair[0], B: plan.pair[1] });
  });
  test('nothing unspoken is left in the words: no mask, no placeholder', () => {
    for (const s of segs) {
      assert.ok(!/▮/.test(s.text), s.text);
      assert.ok(!/\{\w+\}/.test(s.text), s.text);
    }
  });
  test('a player’s answer is always a guess in form, never a statement of fact; a buzz says the aired headline', () => {
    for (const s of segs.filter((x) => x.anchor !== 'H')) {
      assert.ok(!/\b(?:it was|it is in|that happened|the answer is)\b/i.test(s.text), s.text);
      if (s.part === 'buzz') assert.ok(plan.rounds.some((r) => r.questions.some((q) => `${q.words}.` === s.text)) || `${plan.tieBreak.words}.` === s.text || plan.don.offers.some((o) => `${o.question.words}.` === s.text));
    }
  });
  test('no laughter, no applause', () => {
    for (const s of segs) assert.ok(!/\b(?:ha ?ha|hee|chuckl\w*|giggl\w*|applause|laughs)\b/i.test(s.text), s.text);
  });
  test('every reveal carries where and when the story aired, for the screen; the host says it now and then', () => {
    const reveals = segs.filter((x) => x.part === 'reveal' && x.quiz?.round !== 'today');
    for (const s of reveals) assert.match(s.quiz.credit, /(?:From .+?, )?(?:on|It aired on) .+?(?:this (?:morning|afternoon|evening)|yesterday's|'s )/, s.text);
    const spoken = reveals.filter((s) => s.text.includes(s.quiz.credit)).length;
    assert.ok(spoken >= 1 && spoken < reveals.length, `${spoken} of ${reveals.length} said aloud`);
  });
  test('the length: within the bible’s 290–360 seconds, allowing for these test headlines being shorter than real ones', () => {
    for (const seed of ['l1', 'l2', 'l3', 'l4', 'l5', 'l6']) {
      const { episode: e } = edition(seed);
      assert.ok(e.estSeconds >= 260 && e.estSeconds <= 360, `${seed}: ${e.estSeconds} s`);
    }
  });
  test('no line of the station’s last hours is used again', () => {
    const used = segs.find((s) => s.part === 'welcome').text;
    const again = edition('ep', NOW, { recentLines: [used] }).episode;
    assert.notEqual(again.segments.find((s) => s.part === 'welcome').text, used);
  });
  test('the score in the result is the game’s', () => {
    const r = segs.find((s) => s.part === 'result');
    if (game.winner) assert.ok(r.text.includes(String(game.scores[game.winner])));
  });
});

describe('the words', () => {
  test('when a story aired, as the host says it', () => {
    assert.equal(airedWhen('TECH BYTES', NOW - 2 * H, NOW), 'on TECH BYTES this afternoon');
    assert.equal(airedWhen('COSMOS DESK', NOW - DAY, NOW), "on yesterday's COSMOS DESK");
    assert.equal(airedWhen('WORLD NOW', NOW - 3 * DAY, NOW), "on Monday's WORLD NOW");
    assert.equal(spokenTime(Date.parse('2026-10-15T19:30:00Z'), NOW), 'half past eight tonight');
    assert.equal(spokenTime(Date.parse('2026-10-16T13:10:00Z'), NOW), 'ten past two tomorrow afternoon');
    assert.equal(placeSaid('United States'), 'the United States');
    assert.equal(placeSaid('Madagascar'), 'Madagascar');
    assert.equal(figureSaid({ sentence: 'A barn owl and 15 chicks are ringed.', masked: 'A barn owl and ▮▮ chicks are ringed.', figure: { value: '15', label: 'CHICKS' } }), '15 chicks');
  });
  test('every player has a full bank, and UNIT-8 never laughs', () => {
    for (const [id, bank] of Object.entries(PLAYERS)) {
      const n = Object.values(bank).flat().length;
      assert.ok(n >= 24, `${id} has ${n} lines`);
    }
    for (const line of Object.values(PLAYERS.unit8).flat()) assert.ok(!/\bha\b|laughing/i.test(line));
    assert.ok(HOST.welcome.length >= 10 && HOST.result.length >= 10 && HOST.signoff.length >= 10);
    for (const line of ANSWERS.place.concat(ANSWERS.number, ANSWERS.lock)) assert.ok(/\{x\}/.test(line));
  });
});

describe('the weekly table (§5)', () => {
  test('wins this week, a draw counts half, the last meeting', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-')), 'table.json');
    const t = new QuizTable({ file, now: () => NOW });
    t.record({ at: NOW - DAY, pair: ['penny', 'max'], scores: { penny: 12, max: 9 }, winner: 'penny' });
    t.record({ at: NOW - 2 * H, pair: ['penny', 'nova'], scores: { penny: 10, nova: 10 }, winner: null });
    t.record({ at: NOW - 8 * DAY, pair: ['max', 'nova'], scores: { max: 14, nova: 6 }, winner: 'max' }); // last week
    const s = t.standings(NOW);
    assert.deepEqual(s[0], { id: 'penny', played: 2, wins: 1.5 });
    assert.equal(s.find((r) => r.id === 'max').wins, 0);
    assert.equal(t.lastMeeting('max', 'penny', NOW).winner, 'penny');
    const again = new QuizTable({ file, now: () => NOW });
    assert.equal(again.results.length, 3);
    assert.equal(weekOf(NOW), '2026-10-12'); // the Monday
  });
});

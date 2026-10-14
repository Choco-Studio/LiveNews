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
    // two guesses equally close, either side ($150 and $250 against $200, on air 13 Oct): both the closest, two points each
    let level = 0;
    const q200 = { figure: { value: '$200', label: 'PER MONTH', exact: true } };
    for (let i = 0; i < 400; i++) {
      const p = playHowMany(q200, ['paco', 'penny'], seeded(`e${i}`));
      if (p.paco.off !== p.penny.off || p.paco.points === 3 || p.penny.points === 3) continue;
      level++;
      assert.equal(p.paco.points, 2);
      assert.equal(p.penny.points, 2);
    }
    assert.ok(level > 0, 'some guesses fall equally close');
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
    for (const s of reveals) assert.match(s.quiz.credit, /(?:From .+?, )?(?:on|It aired on) .+?(?:this (?:morning|afternoon|evening)|overnight|yesterday's|'s )/, s.text);
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
    // a sum of money with its rate, never with what it bought (on air, 13 Oct: "The answer: $149 HomePod mini")
    assert.equal(figureSaid({ sentence: 'Plans ranging from $8 to $200 per month.', masked: 'Plans ranging from $8 to ▮▮▮▮ per month.', figure: { value: '$200', label: 'PER MONTH' } }), '$200 per month');
    assert.equal(figureSaid({ sentence: 'The new $149 HomePod mini will be available.', masked: 'The new ▮▮▮▮ HomePod mini will be available.', figure: { value: '$149', label: 'HOMEPOD MINI' } }), '$149');
    assert.equal(figureSaid({ sentence: 'Bumble just agreed to a $1.3 billion acquisition.', masked: 'Bumble just agreed to a ▮▮▮▮▮▮ acquisition.', figure: { value: '$1.3 billion', label: 'ACQUISITION' } }), '$1.3 billion');
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

describe('heard on air (step 7, the editions of 12–13 Oct with the real voices)', () => {
  const seeds = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'ep', 'w', 'sum', 'det', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  const eds = seeds.map((s) => edition(s));
  // (and UNIT-8 at a desk: the pairing given)
  const archive = week(NOW);
  const { events, avoid } = quizEvents(archive, { now: NOW, days: 7 });
  const u8 = planEdition({ events, entries: archive.entries, now: NOW, contestants: contestantsFrom(channel, ['unit8', 'penny']), history: [], avoid, seed: 'u8' });
  eds.push({ plan: u8, ...writeEpisode(u8, { channel, now: NOW }) });
  test('the host and the players speak as people do (contractions); UNIT-8 says the shared answers in full', () => {
    const stiff = /\b(?:Let us|I will|I am|That is|It is|There is|Here is|We are|You are|do not|is not)\b/;
    for (const line of [...Object.values(HOST).flatMap((v) => (Array.isArray(v) ? v : Object.values(v).flat())), ...Object.values(ANSWERS).flat()]) assert.ok(!stiff.test(line), line);
    for (const id of ['lola', 'max', 'nova', 'penny', 'sam']) for (const line of Object.values(PLAYERS[id]).flat()) assert.ok(!stiff.test(line), `${id}: ${line}`);
    let unit8 = 0;
    for (const { episode } of eds) {
      for (const s of episode.segments) {
        if (episode.cast[s.anchor] !== 'unit8' || !['lock', 'guess', 'stall', 'pick'].includes(s.part)) continue;
        unit8++;
        assert.ok(!/\b(?:I'll|I'm|I'd|Let's)\b/.test(s.text), `UNIT-8: ${s.text}`);
      }
    }
    assert.ok(unit8 >= 4, `${unit8} UNIT-8 answers`);
    // and the writer's own lines (the standing, DOUBLE OR NOTHING's "We're level"), in every edition
    for (const { episode } of eds) {
      for (const s of episode.segments.filter((x) => x.anchor === 'H' && ['welcome', 'introduce', 'standing', 'round', 'scores', 'don', 'tie', 'result', 'table', 'signoff', 'recap', 'countdown'].includes(x.part))) assert.ok(!stiff.test(s.text), s.text);
    }
  });
  test('DOUBLE OR NOTHING when the scores are level: the player who picks is never called behind', () => {
    const { HOST: H } = { HOST };
    const level = H.don.filter((l) => !/\b(?:behind|trail\w*)\b/i.test(l));
    assert.ok(level.length >= 4, 'lines enough for a level game');
    for (const { episode, game } of eds) {
      const don = episode.segments.find((s) => s.part === 'don');
      if (game.don.level) assert.ok(!/\b(?:behind|trail\w*)\b/i.test(don.text), don.text);
    }
  });
  test('no line is said twice in an edition: eight lock-ins and six guesses each find their own', () => {
    for (const { episode } of eds) {
      const said = episode.segments.filter((s) => s.anchor !== 'H' && ['lock', 'guess', 'react', 'stall', 'pick'].includes(s.part)).map((s) => s.text);
      assert.equal(new Set(said).size, said.length, said.join(' | '));
    }
    assert.ok(ANSWERS.lock.length >= 12 && ANSWERS.place.length >= 12 && ANSWERS.number.length >= 12);
  });
  test('the seats: player A sits on screen left, the host\'s right', () => {
    for (const line of HOST.introduce) assert.ok(!/On my left, \{a\}|On my right, \{b\}/.test(line), line);
  });
  test('a score said after a name that ends in a number keeps them apart', async () => {
    const { scoreSafe } = await import('../server/quiz/writer.js');
    assert.equal(scoreSafe('Halfway: UNIT-8 9 points, Penny 8.'), 'Halfway: UNIT-8, 9 points, Penny 8.');
    assert.equal(scoreSafe('Two rounds gone. Penny 8, UNIT-8 9.'), 'Two rounds gone. Penny 8, UNIT-8, 9.');
    assert.equal(scoreSafe('Score check. UNIT-8: 9. Penny: 8.'), 'Score check. UNIT-8: 9. Penny: 8.');
  });
  test('WHERE\'s reveal says the place and the verdict once; the headline is not read again', () => {
    for (const { episode } of eds) {
      for (const s of episode.segments.filter((x) => x.part === 'reveal' && x.quiz?.round === 'where')) {
        assert.ok(!s.text.includes(s.quiz.question.words), s.text);
        assert.match(s.text, /^It's /);
      }
    }
  });
  test('a round\'s rule never presents its first question, which the frame then presents again', () => {
    // (on air, 13 Oct: "Here's the sentence as it aired, with the number covered up." then "The sentence, with the figure
    // hidden: …")
    for (const line of Object.values(HOST.roundIntro).flat()) assert.ok(!/\bHere(?:'s| is)\b/i.test(line), line);
  });
  test('DOUBLE OR NOTHING never offers again a wrong option the rounds showed (on air, 12 Oct: the same decoy twice)', () => {
    let offers = 0;
    for (const { plan } of eds) {
      const shown = new Set(plan.rounds.flatMap((r) => r.questions.flatMap((q) => (q.options || []).filter((o) => o.letter !== q.answer).map((o) => o.key || o.words || o.country))));
      for (const o of plan.don.offers) {
        const q = o.question;
        for (const x of (q.options || []).filter((y) => y.letter !== q.answer)) {
          offers++;
          assert.ok(!shown.has(x.key || x.words || x.country), `${x.words || x.country} offered twice`);
        }
      }
    }
    assert.ok(offers >= 10, `${offers} wrong options in DOUBLE OR NOTHING`);
  });
  test('nothing read twice: WHERE\'s headline never ends on a question the pins ask again, HOW MANY? never describes its board', () => {
    // (on air, 12-13 Oct: "Here's the headline: … Where is this story?" then "Is it Chile, Singapore or Greece?"; "The
    // sentence, with the figure hidden: …" over a board titled FILL IN THE NUMBER)
    for (const line of HOST.frame.where) assert.ok(/\{words\}$/.test(line), line);
    for (const line of HOST.frame.howmany) assert.ok(!/hidden|covered|blank/i.test(line), line);
  });
  test('nobody regrets an answer they never gave: when nobody buzzed LETTER BY LETTER, no player reacts to the miss', () => {
    let silent = 0;
    for (const { episode } of eds) {
      const segs = episode.segments;
      segs.forEach((s, i) => {
        if (s.part !== 'reveal' || s.quiz?.round !== 'letters') return;
        let f = i - 1;
        while (f > 0 && segs[f].part !== 'frame') f--;
        if (segs.slice(f, i).some((x) => x.part === 'buzz' || x.part === 'stall')) return;
        silent++;
        assert.notEqual(segs[i + 1]?.part, 'react', `${s.text} / ${segs[i + 1]?.text}`);
      });
    }
    assert.ok(silent >= 1, `${silent} LETTER BY LETTER questions nobody buzzed`);
  });
  test('an afternoon edition says the afternoon\'s words: never "tonight", "good evening" or "night" outside an aired headline', async () => {
    // (on air, 14 Oct, 15:20 London: "Tonight it is Ada Volt…", "Good evening. My memory is large.", "It's Ada's night")
    const { afternoonWords } = await import('../server/quiz/writer.js');
    assert.equal(afternoonWords('Tonight it is {a}, from {progA}.'), 'Today it is {a}, from {progA}.');
    assert.equal(afternoonWords("It's {winner}'s night: {sw} to {sl}."), "It's {winner}'s afternoon: {sw} to {sl}.");
    assert.equal(afternoonWords("A good night's work."), "A good afternoon's work.");
    assert.equal(afternoonWords('Good evening. Straight in.'), 'Good afternoon. Straight in.');
    const at = Date.parse('2026-10-15T14:20:00Z'); // 15:20 London
    let lines = 0;
    for (const s of ['w', 'l1', 'l2', 'a1', 'a2', 'a3']) {
      const { episode } = edition(s, at);
      for (const seg of episode.segments) {
        if (['frame', 'options', 'pins', 'buzz', 'reveal'].includes(seg.part)) continue; // (an aired headline may say it)
        lines++;
        // (the next edition's time is said as it is: "Back at ten to eight tonight")
        const text = seg.text.replace(spokenTime(at + 4.5 * H, at), '').replace(/\bSam Night\b/g, 'Sam');
        assert.ok(!/\b(?:tonight|evening|night)\b/i.test(text), `${s}: ${seg.text}`);
      }
    }
    assert.ok(lines >= 60, `${lines} lines`);
  });
  test('a story aired in the small hours aired overnight, not this morning', () => {
    const night = Date.parse('2026-10-15T23:40:00Z'); // 00:40 London on the 16th
    assert.equal(airedWhen('WORLD NOW', night, night + 21 * H), 'on WORLD NOW overnight');
    assert.equal(airedWhen('WORLD NOW', night + 7 * H, night + 21 * H), 'on WORLD NOW this morning');
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

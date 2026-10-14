import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Archive } from '../server/archive.js';
import { Producer } from '../server/producer.js';
import { QuizDesk } from '../server/quiz/edition.js';
import { loadChannel, validateChannel } from '../server/channel.js';

// PAY ATTENTION at the station (docs/programmes/pay-attention.md §7–8): the programme kind, the producer's quiz path,
// the history and the table kept on disk.

const H = 3600_000;
const DAY = 24 * H;
const NOW = Date.parse('2026-10-15T15:00:00Z'); // Thursday 16:00 London
const silent = { info() {}, warn() {}, error() {} };
const COUNTRIES = [['France', 46.6, 2.2], ['Japan', 36.2, 138.3], ['Brazil', -10.8, -52.9], ['Kenya', 0.2, 37.9], ['Canada', 56.1, -106.3], ['Australia', -25.3, 133.8], ['Morocco', 31.8, -7.1], ['Peru', -9.2, -75], ['Jordan', 30.6, 36.2]];
const PROGRAMMES = [['world-now', 'world'], ['tech-bytes', 'tech'], ['cosmos', 'science'], ['money-minute', 'business'], ['news-60', 'world']];
const NOUNS = ['Telescope', 'Museum', 'Garden', 'Robot', 'Orchestra', 'Library', 'Bridge', 'Satellite', 'Festival', 'Glacier', 'Ferry', 'Observatory'];
function archive() {
  const a = new Archive({ dir: null, days: 14, now: () => NOW });
  let n = 0;
  for (let d = 9; d >= 0; d--) {
    for (let k = 0; k < 12; k++) {
      const [programId, category] = PROGRAMMES[n % PROGRAMMES.length];
      const title = `${NOUNS[n % NOUNS.length]} opens a quiet new wing number ${n + 1}`;
      const [country, lat, lon] = COUNTRIES[n % COUNTRIES.length];
      const placed = n % 3 === 0;
      a.keep({ id: `e${n}`, at: NOW - d * DAY - (k + 1) * 50 * 60_000, programId, category, rank: k % 6, title, headline: title, link: 'https://www.bbc.co.uk/x', source: 'BBC News', image: 'https://x/y.jpg', summary: '',
        text: `${title}${placed ? ` in ${country}` : ''}. The work took months, its makers say.`, ...(placed ? { location: { place: country.toUpperCase(), lat, lon } } : {}) });
      n++;
    }
  }
  a.entries.slice(-24).forEach((e, i) => a.keep({ ...e, at: NOW - ((i * 37) % 300) * 60_000 - 60_000 }));
  a.entries.sort((x, y) => x.at - y.at);
  return a;
}
// the channel with the quiz as a programme (config/channel.json's draft moved on air; the host is config's qm)
function channelWithQuiz() {
  const ch = structuredClone(loadChannel());
  if (ch.drafts) delete ch.drafts['pay-attention'];
  ch.programs['pay-attention'] = { kind: 'quiz', title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", theme: 'quiz', presenters: ['qm'], contestants: ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam'], style: 'The week’s news as a game.', minGapHours: 4, targetSeconds: [290, 360] };
  return ch;
}

describe('the quiz as a programme kind', () => {
  test('a quiz programme is valid with one host and contestants among the presenters', () => {
    assert.doesNotThrow(() => validateChannel(channelWithQuiz()));
  });
  test('two hosts, an unknown contestant or the host as a contestant are refused', () => {
    const two = channelWithQuiz();
    two.programs['pay-attention'].presenters = ['qm', 'sam'];
    assert.throws(() => validateChannel(two), /one presenter/);
    const unknown = channelWithQuiz();
    unknown.programs['pay-attention'].contestants = ['paco', 'nobody'];
    assert.throws(() => validateChannel(unknown), /unknown contestant/);
    const host = channelWithQuiz();
    host.programs['pay-attention'].contestants = ['paco', 'qm'];
    assert.throws(() => validateChannel(host), /host cannot be a contestant/);
  });
});

describe('the producer makes an edition', () => {
  test('ready, made, voiced slots H, A and B, remembered; not again within four hours; the history survives a restart', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-station-'));
    const a = archive();
    const producer = new Producer({ config: { dataDir: dir }, newsDesk: null, chain: null, archive: a, log: silent });
    producer.quiz = new QuizDesk({ archive: a, dir: path.join(dir, 'quiz'), now: () => NOW, log: silent });
    const ch = channelWithQuiz();
    assert.equal(producer.canProduce(ch, 'pay-attention'), true);
    const ep = await producer.produce(ch, 'pay-attention');
    assert.equal(ep.program.id, 'pay-attention');
    assert.equal(ep.cast.H, 'qm');
    assert.ok(ep.cast.A && ep.cast.B && ep.cast.A !== ep.cast.B);
    assert.ok(ep.segments.some((s) => s.anchor === 'H') && ep.segments.some((s) => s.anchor === 'A') && ep.segments.some((s) => s.anchor === 'B'));
    assert.equal(ep.provider, 'quiz');
    assert.ok(producer.recentText().length > 0, 'the quiz lines join the station’s recent lines');
    assert.equal(producer.canProduce(ch, 'pay-attention'), false, 'not again within four hours');
    const again = new QuizDesk({ archive: a, dir: path.join(dir, 'quiz'), now: () => NOW + 5 * H, log: silent });
    assert.equal(again.history.length, 1);
    assert.deepEqual(again.history[0].pair, [ep.cast.A, ep.cast.B]);
    assert.ok(fs.existsSync(path.join(dir, 'quiz', 'table.json')));
  });
  test('no archive, no quiz', () => {
    const producer = new Producer({ config: {}, newsDesk: null, chain: null, log: silent });
    assert.equal(producer.canProduce(channelWithQuiz(), 'pay-attention'), false);
  });
});

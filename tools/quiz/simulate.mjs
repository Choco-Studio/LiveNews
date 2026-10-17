#!/usr/bin/env node
// PAY ATTENTION's game, simulated over many editions (docs/programmes/pay-attention.md §4.2, step 2's gate): how often
// the stronger player loses (target about a third), how often the player behind at half time wins (comebacks happen),
// how often an edition is decided before DOUBLE OR NOTHING (at most half), draws, and the edition's length.
//
//   node tools/quiz/simulate.mjs [--editions 2000]
import fs from 'node:fs';
import path from 'node:path';
import { Archive } from '../../server/archive.js';
import { quizEvents } from '../../server/quiz/desk.js';
import { planEdition, contestantsFrom, historyOf } from '../../server/quiz/planner.js';
import { playEdition, decidedBeforeDon, accuracy } from '../../server/quiz/players.js';
import { writeEpisode } from '../../server/quiz/writer.js';
import { seeded } from '../../server/quiz/rounds.js';

const opts = { editions: 2000 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--')) opts[argv[i].slice(2)] = argv[i + 1];
const channel = JSON.parse(fs.readFileSync(path.resolve('config/channel.json'), 'utf8'));
const contestants = contestantsFrom(channel, ['paco', 'lola', 'max', 'ada', 'nova', 'unit8', 'penny', 'sam']);

// A rich synthetic week: benign stories on every desk and programme, places in every region, some figures
const H = 3600_000;
const COUNTRIES = [['France', 46.6, 2.2], ['Japan', 36.2, 138.3], ['Brazil', -10.8, -52.9], ['Kenya', 0.2, 37.9], ['Canada', 56.1, -106.3], ['Australia', -25.3, 133.8], ['India', 22, 79], ['Mexico', 23.6, -102.5], ['Norway', 60.5, 8.5], ['Chile', -35.7, -71.5], ['Vietnam', 14.1, 108.3], ['Morocco', 31.8, -7.1], ['Italy', 41.9, 12.6], ['Peru', -9.2, -75], ['Jordan', 30.6, 36.2]];
// every picture with a cleared rights record (by default PICTURE THIS shows no other: server/quiz/desk.js pictureCleared)
const CLEARED = { source: 'wikimedia-commons', licence: 'CC-BY-4.0', author: 'Jane Doe', url: 'https://x/y.jpg', credit: 'FILE · JANE DOE · CC BY 4.0 · PIXELATED', label: 'FILE', cleared: true };
const DESKS = [['world-now', 'world'], ['tech-bytes', 'tech'], ['cosmos', 'science'], ['money-minute', 'business'], ['news-60', 'world']];
const NOUNS = ['telescope', 'museum', 'garden', 'robot', 'orchestra', 'library', 'bridge', 'satellite', 'festival', 'glacier', 'reef', 'tramway', 'chip plant', 'wind farm', 'ferry', 'zoo', 'observatory', 'bakery', 'airline', 'startup', 'rover', 'aquarium', 'stadium', 'vineyard'];
const VERBS = ['unveils', 'opens', 'launches', 'celebrates', 'tests', 'restores', 'maps', 'finds', 'builds', 'records', 'shows', 'reveals'];
const OBJECTS = ['a new wing', 'its largest dish', 'a rare orchid', 'a quiet engine', 'a floating stage', 'an old map', 'a glass walkway', 'a weather sensor', 'a lantern parade', 'a hidden cave', 'a solar roof', 'a tiny camera'];
function week(now, rnd) {
  const a = new Archive({ dir: null, days: 14, now: () => now });
  let n = 0;
  for (let d = 9; d >= 0; d--) {
    for (let k = 0; k < 14; k++) {
      const at = now - d * 24 * H - (k + 1) * 45 * 60_000;
      const [programId, category] = DESKS[Math.floor(rnd() * DESKS.length)];
      const title = `${NOUNS[n % NOUNS.length].replace(/^./, (c) => c.toUpperCase())} ${VERBS[Math.floor(rnd() * VERBS.length)]} ${OBJECTS[Math.floor(rnd() * OBJECTS.length)]} ${n}`;
      const placed = rnd() < 0.35;
      const [country, lat, lon] = COUNTRIES[Math.floor(rnd() * COUNTRIES.length)];
      const fig = rnd() < 0.2;
      const value = String(20 + Math.floor(rnd() * 900));
      a.keep({ id: `e${n}`, at, programId, category, rank: k % 6, title, headline: title, link: 'https://www.bbc.co.uk/x', source: 'BBC News', image: 'https://x/y.jpg', imageRights: CLEARED,
        text: `${title}${placed ? ` in ${country}` : ''}. The work took ${fig ? `${value} days` : 'months'}, its makers say.`, summary: '',
        ...(placed ? { location: { place: country.toUpperCase(), lat, lon } } : {}), ...(fig ? { numbers: [{ value, label: 'DAYS' }] } : {}) });
      n++;
    }
  }
  a.entries.slice(-30).forEach((e, i) => a.keep({ ...e, at: now - ((i * 37) % 300) * 60_000 - 60_000 }));
  a.entries.sort((x, y) => x.at - y.at);
  return a;
}

const stats = { mc: { n: 0, lost: 0, strong: 0, strongLost: 0 }, gaps: {}, seats: {}, editions: 0, strongerLost: 0, judged: 0, clearLost: 0, clear: 0, clearBehindBeforeDon: 0, donFlips: 0, comeback: 0, behindAtHalf: 0, decided: 0, draws: 0, ties: 0, lengths: [], margins: [], wins: {} };
const base = Date.parse('2026-10-15T14:00:00Z');
for (let i = 0; i < Number(opts.editions); i++) {
  const rnd = seeded(`sim:${i}`);
  const now = base + (i % 7) * 24 * H + (i % 2 ? 4.5 * H : 0);
  const archive = week(now, rnd);
  const { events, avoid } = quizEvents(archive, { now, days: 7 });
  const plan = planEdition({ events, entries: archive.entries, now, contestants, history: [], avoid, seed: `sim:${i}` });
  if (!plan.air) continue;
  const { episode, game } = writeEpisode(plan, { channel, now });
  stats.editions++;
  const [a, b] = plan.pair;
  const desks = plan.rounds.flatMap((r) => r.questions.flatMap((q) => (q.items ? q.items.map((x) => x.desk) : [q.desk || q.options?.find((o) => o.letter === q.answer)?.desk])));
  const exp = (id) => desks.reduce((s, d) => s + accuracy(id, d), 0) / desks.length;
  if (Math.abs(exp(a) - exp(b)) >= 0.02 && game.winner) {
    stats.judged++;
    const stronger = exp(a) > exp(b) ? a : b;
    if (game.winner !== stronger) stats.strongerLost++;
    const bucket = Math.abs(exp(a) - exp(b)) >= 0.1 ? '10+' : Math.abs(exp(a) - exp(b)) >= 0.06 ? '6-10' : '2-6';
    stats.gaps[bucket] = stats.gaps[bucket] || [0, 0];
    stats.gaps[bucket][0]++;
    if (game.winner !== stronger) stats.gaps[bucket][1]++;
    if (Math.abs(exp(a) - exp(b)) >= 0.06) {
      stats.clear++;
      if (game.winner !== stronger) stats.clearLost++;
      const weaker = stronger === a ? b : a;
      if (game.don.before[stronger] <= game.don.before[weaker]) stats.clearBehindBeforeDon++;
    }
    const lead = game.don.before[a] === game.don.before[b] ? null : game.don.before[a] > game.don.before[b] ? a : b;
    if (lead && game.winner && game.winner !== lead) stats.donFlips++;
  }
  if (game.half[a] !== game.half[b]) {
    stats.behindAtHalf++;
    const behind = game.half[a] < game.half[b] ? a : b;
    if (game.winner === behind) stats.comeback++;
  }
  // the real favourite: the player who wins more of 100 replays of the same plan (speed counts, not only accuracy)
  let winsA = 0;
  for (let k = 0; k < 100; k++) {
    const g = playEdition(plan, seeded(`mc:${i}:${k}`));
    if (g.winner === a) winsA++;
    else if (!g.winner) winsA += 0.5;
  }
  const fav = winsA >= 50 ? a : b;
  const edge = Math.max(winsA, 100 - winsA) / 100;
  if (game.winner) {
    stats.mc.n++;
    if (game.winner !== fav) stats.mc.lost++;
    if (edge >= 0.65) {
      stats.mc.strong++;
      if (game.winner !== fav) stats.mc.strongLost++;
    }
  }
  if (decidedBeforeDon(game)) stats.decided++;
  if (game.tie) stats.ties++;
  if (!game.winner) stats.draws++;
  stats.lengths.push(episode.estSeconds);
  stats.margins.push(game.winner ? game.scores[game.winner] - game.scores[game.loser] : 0);
  if (game.winner) stats.wins[game.winner] = (stats.wins[game.winner] || 0) + 1;
  for (const id of plan.pair) stats.seats[id] = (stats.seats[id] || 0) + 1;
}
const pct = (x, n) => `${((100 * x) / Math.max(1, n)).toFixed(1)} %`;
const q = (arr, p) => [...arr].sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))];
console.log(`editions ${stats.editions}`);
console.log(`the favourite lost: ${pct(stats.strongerLost, stats.judged)} of ${stats.judged} with any favourite (2+ points of expected accuracy); ${pct(stats.clearLost, stats.clear)} of ${stats.clear} with a clear one (6+ points; target about a third)`);
console.log(`the favourite by 100 replays lost: ${pct(stats.mc.lost, stats.mc.n)} of ${stats.mc.n}; a strong favourite (wins 65 %+ of replays) lost ${pct(stats.mc.strongLost, stats.mc.strong)} of ${stats.mc.strong} (target about a third)`);
console.log(`the favourite lost, by its edge in expected accuracy: ${Object.entries(stats.gaps).map(([k, [n, l]]) => `${k} points: ${pct(l, n)} of ${n}`).join(' · ')}`);
console.log(`a clear favourite level or behind before DOUBLE OR NOTHING: ${pct(stats.clearBehindBeforeDon, stats.clear)} · DOUBLE OR NOTHING or the tie-break overturned the leader: ${pct(stats.donFlips, stats.editions)}`);
console.log(`behind at half time and won: ${pct(stats.comeback, stats.behindAtHalf)} (comebacks)`);
console.log(`decided before DOUBLE OR NOTHING: ${pct(stats.decided, stats.editions)} (target at most half)`);
console.log(`tie-breaks: ${pct(stats.ties, stats.editions)} · drawn: ${pct(stats.draws, stats.editions)}`);
console.log(`length (s): min ${Math.min(...stats.lengths)} · p10 ${q(stats.lengths, 0.1)} · median ${q(stats.lengths, 0.5)} · p90 ${q(stats.lengths, 0.9)} · max ${Math.max(...stats.lengths)}`);
console.log(`winning margin: median ${q(stats.margins, 0.5)} · p90 ${q(stats.margins, 0.9)}`);
console.log(`win rate by player: ${Object.entries(stats.seats).map(([k, v]) => `${k} ${pct(stats.wins[k] || 0, v)} of ${v}`).join(', ')} (target 35–65 % each)`);

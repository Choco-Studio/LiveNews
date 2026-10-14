#!/usr/bin/env node
// PAY ATTENTION's episodes written in full from the real archive, for step 2's gate (docs/programmes/pay-attention.md
// §9: twenty editions read in full). Each edition is planned as the station would plan it, with the editions before
// it as history (pairings, round types), then written; the script is printed speaker by speaker, with what the screen
// shows in brackets.
//
//   node tools/quiz/write.mjs --at 2026-10-16T15:30 --editions 20 [--reuse] [--min-days 0] [--out data/quiz-run/scripts.md]
//   (--reuse lets later editions ask stories earlier ones asked: a writer's test on a young archive, never the station)
import fs from 'node:fs';
import path from 'node:path';
import { Archive } from '../../server/archive.js';
import { NewsDesk } from '../../server/news.js';
import { quizEvents, realEntry } from '../../server/quiz/desk.js';
import { planEdition, contestantsFrom, historyOf, AIR_FROM, AIR_TO } from '../../server/quiz/planner.js';
import { londonDayStart } from '../../server/quiz/rounds.js';
import { writeEpisode } from '../../server/quiz/writer.js';
import { QuizTable } from '../../server/quiz/table.js';

const opts = { dir: 'data/archive', editions: 1, contestants: 'paco,lola,max,ada,nova,unit8,penny,sam' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) opts[argv[i].slice(2)] = true;
  else (opts[argv[i].slice(2)] = v), i++;
}
const channel = JSON.parse(fs.readFileSync(path.resolve('config/channel.json'), 'utf8'));
const contestants = contestantsFrom(channel, String(opts.contestants).split(','));
const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
const same = (a, b) => desk.sameStory(a, b);
const now = opts.at ? Date.parse(opts.at.length <= 16 ? `${opts.at}:00Z` : opts.at) : Date.now();
const archive = new Archive({ dir: path.resolve(opts.dir), days: 14, now: () => now, log: { warn() {} } });
archive.entries = archive.entries.filter((e) => e.at <= now);
const entries = archive.entries.filter(realEntry);
const { events, avoid } = quizEvents(archive, { now, days: 7, same });
const table = new QuizTable({ now: () => now });
// the next edition, as the sign-off says it: five hours on, inside the schedule's window (London 14:00–23:00); a time
// past the window's end or before its start is the next window's first hour ("two o'clock tomorrow afternoon"), never
// the small hours
const HOUR = 3600_000;
const londonHourOf = (t) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t))) % 24;
function nextAirAt(t) {
  const h = londonHourOf(t);
  if (h >= AIR_FROM && h < AIR_TO) return t;
  // (before the window: today's start; after it: tomorrow's, found from a moment in tomorrow's small hours)
  const day = h >= AIR_TO ? londonDayStart(t + (24 - h + 1) * HOUR) : londonDayStart(t);
  return day + AIR_FROM * HOUR;
}
const nextAt = nextAirAt(now + 5 * HOUR);
const names = { H: 'HOST' };
const lines = [];
const history = [];
let written = 0;
let lastLines = [];
for (let i = 0; i < Number(opts.editions) * 4 && written < Number(opts.editions); i++) {
  const plan = planEdition({ events, entries, now, contestants, history: history.map((h) => (opts.reuse ? { ...h, asked: [] } : h)), same, avoid, seed: `write:${i}`, checkHour: false, ...(opts['min-days'] !== undefined ? { minArchiveDays: Number(opts['min-days']) } : {}) });
  if (!plan.air) {
    if (!written) console.error(`no edition: ${plan.reason}`);
    history.push({ at: now - (40 - i) * 3600_000, pair: ['-', '-'], types: [], asked: [] });
    continue;
  }
  // the station's six hours of recent lines: the edition before this one
  // (each edition its own moment, as on air: the banks are picked by the edition's time)
  plan.at = now - (20 - written) * 4.5 * 3600_000;
  const { episode, game } = writeEpisode(plan, { channel, now, table, nextAt, recentLines: lastLines });
  lastLines = episode.segments.map((x) => x.text).filter(Boolean);
  written++;
  // (with --reuse the editions before sit four days back: the pairing rules let pairs meet again, the rotation still turns)
  history.push({ ...historyOf(plan), at: opts.reuse ? now - 4 * 86400_000 + i * 60_000 : now - (40 - i) * 3600_000 });
  const who = (anchor) => (anchor === 'H' ? 'HOST' : (channel.presenters[episode.cast[anchor]]?.name || episode.cast[anchor]).toUpperCase());
  lines.push(`## Edition ${written}: ${episode.title} · ${episode.quiz.types.join(' / ')} · about ${episode.estSeconds} s · ${game.winner ? `${game.winner} wins ${game.scores[game.winner]}–${game.scores[game.loser]}` : 'drawn'}`, '');
  for (const s of episode.segments) {
    if (s.part === 'open') {
      lines.push('[OPEN: PAY ATTENTION]');
      continue;
    }
    const screen = s.part === 'options' ? ` [tiles ${s.quiz.question.options.map((o) => o.letter).join(' ')}]` : s.part === 'pins' ? ' [three pins]' : s.quiz?.reveal ? ' [reveal]' : '';
    lines.push(`${who(s.anchor)} (${s.part}): ${s.text}${screen}`);
  }
  lines.push('');
}
const text = lines.join('\n');
if (opts.out) {
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  fs.writeFileSync(path.resolve(opts.out), text + '\n');
}
console.log(text);

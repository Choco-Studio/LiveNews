#!/usr/bin/env node
// PAY ATTENTION's question desk on the real archive, for step 1's gate (docs/programmes/pay-attention.md §9): plans the
// editions of one or more days as the station would (two a day, 15:30 and 20:30 London, each edition's history feeding
// the next), and prints every question, option and answer for the hand check, with what the desk left out and why.
//
//   node tools/quiz/desk.mjs --from 2026-10-16 --days 3 [--dir data/archive] [--at 15:30,20:30] [--out data/quiz-run/plans.md]
//   (--min-days 0 plans on a younger archive than the station would: a dry run, never the gate)
import fs from 'node:fs';
import path from 'node:path';
import { Archive } from '../../server/archive.js';
import { NewsDesk } from '../../server/news.js';
import { quizEvents, realEntry } from '../../server/quiz/desk.js';
import { planEdition, contestantsFrom, historyOf } from '../../server/quiz/planner.js';
import { ROUND_TITLES } from '../../server/quiz/rounds.js';

const opts = { dir: 'data/archive', days: 1, at: '15:30,20:30', contestants: 'paco,lola,max,ada,nova,unit8,penny,sam' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) if (argv[i]?.startsWith('--')) opts[argv[i].slice(2)] = argv[i + 1];
const channel = JSON.parse(fs.readFileSync(path.resolve('config/channel.json'), 'utf8'));
const contestants = contestantsFrom(channel, String(opts.contestants).split(','));
const desk = new NewsDesk({ log: { info() {}, warn() {}, error() {} } });
const same = (a, b) => desk.sameStory(a, b);

// a London wall time → ms (BST or GMT, found by trying both offsets)
function londonTime(day, hhmm) {
  for (const off of ['+01:00', '+00:00']) {
    const t = Date.parse(`${day}T${hhmm}:00${off}`);
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
    if (h === hhmm) return t;
  }
  return Date.parse(`${day}T${hhmm}:00Z`);
}
const clock = (t) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

const lines = [];
const say = (s = '') => lines.push(s);
const history = [];
const from = opts.from || new Date().toISOString().slice(0, 10);
const tally = { editions: 0, aired: 0, seats: {} };
for (let d = 0; d < Number(opts.days); d++) {
  const day = new Date(Date.parse(`${from}T12:00:00Z`) + d * 86400_000).toISOString().slice(0, 10);
  for (const hhmm of String(opts.at).split(',')) {
    const now = londonTime(day, hhmm);
    const archive = new Archive({ dir: path.resolve(opts.dir), days: 14, now: () => now, log: { warn() {} } });
    archive.entries = archive.entries.filter((e) => e.at <= now);
    const entries = archive.entries.filter(realEntry);
    const { events, out, avoid } = quizEvents(archive, { now, days: 7, same });
    const plan = planEdition({ events, entries, now, contestants, history, same, avoid, ...(opts['min-days'] !== undefined ? { minArchiveDays: Number(opts['min-days']) } : {}) });
    tally.editions++;
    say(`## ${day} ${hhmm} London — ${plan.air ? `ON AIR: ${plan.pair.join(' v ')}` : `does not air: ${plan.reason}`}`);
    say();
    say(`Eligible events in the window: ${events.length} (pictures ${events.filter((e) => e.image).length}, usable places ${events.filter((e) => e.place).length}, usable figures ${events.filter((e) => e.figure).length}). Left out: ${Object.entries(out).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
    if (plan.grave) say(`Grave-day check: ${plan.grave.airings} airings in six hours, ${plan.grave.share} % read grave, top harmful lead ×${plan.grave.leads}.`);
    if (!plan.air) {
      if (plan.tried) say(`Pairings tried (pool): ${plan.tried.join(', ')}`);
      say();
      continue;
    }
    tally.aired++;
    for (const id of plan.pair) tally.seats[id] = (tally.seats[id] || 0) + 1;
    say(`Pool ${plan.pool} · ${plan.recent} questions from the last 24 h · rounds: ${plan.types.map((t) => ROUND_TITLES[t]).join(' / ')}${plan.twiceToday ? ' · (a player\'s second seat today)' : ''}`);
    say();
    const aired = (a) => `${a.programme} ${clock(a.at)}${a.source ? `, ${a.source}` : ''}`;
    const show = (q, n) => {
      if (q.type === 'picture') {
        say(`${n}. PICTURE THIS — picture: ${q.image}`);
        for (const o of q.options) say(`   ${o.letter}. ${o.words} [${o.desk}]${o.letter === q.answer ? '   ← ANSWER' : ''}`);
        say(`   aired: ${aired(q.aired)}`);
      } else if (q.type === 'letters') {
        const masked = [...q.words].map((c, i) => (q.reveal.shown.includes(i) || q.reveal.order.slice(0, q.reveal.stages[0]).includes(i) ? c : /\s/.test(c) ? ' ' : '_')).join('');
        say(`${n}. LETTER BY LETTER — "${q.words}" (stage 1: ${masked}) [${q.desk}] · aired: ${aired(q.aired)}`);
      } else if (q.type === 'where') {
        say(`${n}. WHERE IN THE WORLD? — "${q.masked || q.words}"${q.masked ? ` (reveal: "${q.words}")` : ''}`);
        for (const o of q.options) say(`   ${o.letter}. ${o.label} (${o.region})${o.letter === q.answer ? '   ← ANSWER' : ''}`);
        say(`   aired: ${aired(q.aired)}`);
      } else if (q.type === 'howmany') {
        say(`${n}. HOW MANY? — "${q.masked}" → ${q.figure.qualifier ? `${q.figure.qualifier} ` : ''}${q.figure.value} ${q.figure.label}${q.figure.exact ? '' : ' (no exact bonus)'} · headline "${q.words}" · aired: ${aired(q.aired)}`);
      } else if (q.type === 'today') {
        say(`${n}. TODAY OR NOT TODAY?`);
        for (const it of q.items) say(`   - ${it.words} → ${it.answer} (${aired(it.aired)})`);
      }
    };
    plan.rounds.forEach((r, i) => {
      say(`### Round ${i + 1}: ${ROUND_TITLES[r.type]}`);
      r.questions.forEach((q, j) => show(q, j + 1));
      say();
    });
    say(`### DOUBLE OR NOTHING: ${ROUND_TITLES[plan.don.type]} — desks offered: ${plan.don.offers.map((o) => o.desk).join(' / ')}`);
    plan.don.offers.forEach((o) => show(o.question, o.desk));
    say();
    say('### Tie-break');
    show(plan.tieBreak, 'TB');
    say();
    history.push(historyOf(plan));
  }
}
say(`---\n${tally.aired} of ${tally.editions} editions fit. Seats: ${Object.entries(tally.seats).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`);
const text = lines.join('\n');
if (opts.out) {
  fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
  fs.writeFileSync(path.resolve(opts.out), text + '\n');
}
console.log(text);

// PAY ATTENTION's weekly table (docs/programmes/pay-attention.md §5): every edition's result, kept in its own file beside
// the archive (data/quiz/table.json), so the host can say who leads the week and how two players' last meeting went.
// The week runs Monday to Sunday, London time. A drawn game (neither named the tie-break headline) counts half a win to
// each.
//
//   new QuizTable({ file, now })   .record({ at, pair, scores, winner })   .standings(now)   .lastMeeting(a, b, now)
import fs from 'node:fs';
import path from 'node:path';

const DAY = 86400_000;

/** The Monday 00:00 London (as a date key, YYYY-MM-DD) of the week `t` falls in. */
export function weekOf(t) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(t));
  const get = (k) => parts.find((p) => p.type === k)?.value;
  const back = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[get('weekday')] ?? 0;
  const noon = Date.parse(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`) - back * DAY;
  return new Date(noon).toISOString().slice(0, 10);
}

export class QuizTable {
  constructor({ file = null, now = () => Date.now(), keepDays = 35 } = {}) {
    this.file = file;
    this.now = now;
    this.keepDays = keepDays;
    this.results = [];
    if (file && fs.existsSync(file)) {
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        this.results = Array.isArray(data?.results) ? data.results.filter((r) => Number.isFinite(r?.at) && Array.isArray(r.pair)) : [];
      } catch { /* a torn file starts a fresh table */ }
    }
  }

  record({ at, pair, scores, winner = null }) {
    this.results.push({ at, pair: [...pair], scores: { ...scores }, winner, week: weekOf(at) });
    const since = this.now() - this.keepDays * DAY;
    this.results = this.results.filter((r) => r.at >= since);
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify({ results: this.results }, null, 1));
      } catch { /* the table is a nicety: the quiz airs without it */ }
    }
  }

  /** This week's standings: [{ id, played, wins }] — most wins first, then fewer games, then the id. */
  standings(now = this.now()) {
    const week = weekOf(now);
    const rows = new Map();
    for (const r of this.results.filter((x) => x.week === week && x.at <= now)) {
      for (const id of r.pair) {
        const row = rows.get(id) || { id, played: 0, wins: 0 };
        row.played++;
        row.wins += r.winner === id ? 1 : r.winner ? 0 : 0.5;
        rows.set(id, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.wins - a.wins || a.played - b.played || a.id.localeCompare(b.id));
  }

  /** The two players' last meeting before `now`, or null. */
  lastMeeting(a, b, now = this.now()) {
    return [...this.results].reverse().find((r) => r.at < now && r.pair.includes(a) && r.pair.includes(b)) || null;
  }
}

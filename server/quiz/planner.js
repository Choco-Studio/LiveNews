// PAY ATTENTION's edition planner (docs/programmes/pay-attention.md §2, §4, §7): before each edition it builds the whole
// plan, or says why the quiz does not air. It picks the pairing (two presenters from different programmes, never the
// same pair within three days, each at most once a day unless nothing else fits, the seats to whoever has played least
// this week), three round types (never the same three as the edition before, data first), DOUBLE OR NOTHING (the type
// not played tonight, for two desks, else PICTURE THIS) and a tie-break, and every question and option, from the
// pairing's pool: eligible events of the last seven days, none aired on either player's programme, none asked in the
// last seven days.
//
//   planEdition({ events, entries, now, contestants, history, same, avoid })
//     → { air: true, pair, rounds, don, tieBreak, asked, recent, pool, why } | { air: false, reason, ... }
import { graveDay } from './grave.js';
import { ROUND_TYPES, QUESTIONS, TODAY_ITEMS, pickAsked, buildQuestions, seeded, shuffle, londonDayStart } from './rounds.js';
import { DAY_MS, shareName, neutralPlaces } from './desk.js';

export const AIR_FROM = 14; // London hours the quiz may air: 14:00–23:00
export const AIR_TO = 23;
export const MIN_ARCHIVE_DAYS = 3;
export const RECENT_MIN = 5; // questions on stories first aired in the last 24 hours
export const PAIR_GAP_MS = 3 * DAY_MS;
const SCARCE_FIRST = ['where', 'howmany', 'today', 'picture', 'letters']; // the order rounds take their stories in

/** Each contestant's own programmes, from the channel's config (programmes and drafts): Sam's are NEWS IN 60 and WORLD WEATHER. */
export function contestantsFrom(channel, ids) {
  const all = { ...(channel?.programs || {}), ...(channel?.drafts || {}) };
  return ids.map((id) => ({ id, own: Object.entries(all).filter(([, p]) => (p.presenters || []).includes(id)).map(([pid]) => pid) }));
}

function londonHour(now) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hourCycle: 'h23' }).format(new Date(now));
  return Number(h) % 24;
}

/** The pairings allowed now, best first (§2): fewest seats this week, then today, then the seeded order. */
export function pairings(contestants, history, now, rnd, { twiceToday = false } = {}) {
  const dayStart = londonDayStart(now);
  const week = history.filter((h) => h.at > now - 7 * DAY_MS && h.at <= now);
  const seats = (id, since) => week.filter((h) => h.at >= since && h.pair.includes(id)).length;
  const out = [];
  for (let i = 0; i < contestants.length; i++) {
    for (let j = i + 1; j < contestants.length; j++) {
      const a = contestants[i], b = contestants[j];
      if (a.own.some((p) => b.own.includes(p))) continue; // never two from the same programme
      if (week.some((h) => h.at > now - PAIR_GAP_MS && h.pair.includes(a.id) && h.pair.includes(b.id))) continue;
      const today = seats(a.id, dayStart) + seats(b.id, dayStart);
      const max = twiceToday ? 2 : 1;
      if (seats(a.id, dayStart) >= max || seats(b.id, dayStart) >= max) continue;
      out.push({ a, b, week: seats(a.id, 0) + seats(b.id, 0), today, r: rnd() });
    }
  }
  return out.sort((x, y) => x.week - y.week || x.today - y.today || x.r - y.r);
}

/** Candidate sets of three round types, in preference order: types played least lately first, never last edition's set. */
function typeSets(history, rnd) {
  const recent = history.slice(-4);
  const played = (t) => recent.reduce((n, h) => n + (h.types || []).filter((x) => x === t).length, 0);
  const last = new Set(history.at(-1)?.types || []);
  const sets = [];
  for (let i = 0; i < ROUND_TYPES.length; i++)
    for (let j = i + 1; j < ROUND_TYPES.length; j++)
      for (let k = j + 1; k < ROUND_TYPES.length; k++) {
        const s = [ROUND_TYPES[i], ROUND_TYPES[j], ROUND_TYPES[k]];
        if (last.size === 3 && s.every((t) => last.has(t))) continue;
        sets.push({ s, score: s.reduce((n, t) => n + played(t), 0) + rnd() * 0.5 });
      }
  return sets.sort((x, y) => x.score - y.score).map((x) => x.s);
}

/** The order the three rounds air in: never the edition before's first round first. */
function roundOrder(types, history, rnd) {
  const firstBefore = history.at(-1)?.types?.[0];
  for (let tries = 0; tries < 6; tries++) {
    const o = shuffle(types, rnd);
    if (o[0] !== firstBefore) return o;
  }
  return types;
}

// DOUBLE OR NOTHING's fallbacks among the types already played, before PICTURE THIS (§4, §7)
const DON_REPLAY = ['letters', 'where'];

/** Try to fill a plan for one pairing and one set of types. Returns the plan or null. */
function fill(types, pool, all, ctx, rnd) {
  const askedKeys = new Set();
  const askedList = [];
  const ask = (evs) => {
    for (const ev of evs) {
      askedKeys.add(ev.key);
      askedList.push(ev);
    }
  };
  // never two takes on one story in an edition, even where the desk's grouping kept them apart (a shared name)
  const free = (list) => list.filter((ev) => !askedKeys.has(ev.key) && !askedList.some((a) => shareName(a, ev)));
  const chosen = {};
  for (const t of SCARCE_FIRST.filter((x) => types.includes(x))) {
    const got = pickAsked(t, free(pool), { ...ctx, n: t === 'today' ? TODAY_ITEMS : QUESTIONS });
    if (!got) return null;
    ask(got);
    chosen[t] = got;
  }
  // DOUBLE OR NOTHING: a type not played tonight, for two desks if the pool allows; else a type already played that
  // offers two desks, LETTER BY LETTER or WHERE (a second PICTURE THIS keeps the board up longest: on air 12 Oct, 68 % of
  // the air on the boards); only then PICTURE THIS; and last, LETTER BY LETTER or WHERE for one desk
  const rest = ROUND_TYPES.filter((t) => !types.includes(t));
  const replay = DON_REPLAY.filter((t) => types.includes(t));
  const order = [...rest.map((t) => [t, 1]), ...replay.map((t) => [t, 2]), ...(rest.includes('picture') ? [] : [['picture', 1]]), ...replay.map((t) => [t, 1])];
  let don = null;
  for (const [t, need] of order) {
    const desks = [...new Set(free(pool).map((ev) => ev.category).filter(Boolean))];
    const offers = [];
    for (const desk of shuffle(desks, rnd)) {
      if (offers.length >= 2) break;
      const got = pickAsked(t, free(pool).filter((ev) => !offers.some((o) => o.asked.some((x) => x.key === ev.key || shareName(x, ev)))), { ...ctx, n: t === 'today' ? 3 : 1, desk });
      if (got) offers.push({ desk, asked: got });
    }
    if (offers.length >= need) {
      don = { type: t, offers };
      offers.forEach((o) => ask(o.asked));
      break;
    }
  }
  if (!don) return null;
  const tie = pickAsked('letters', free(pool), { ...ctx, n: 1 });
  if (!tie) return null;
  ask(tie);
  // at least five questions on stories first aired in the last 24 hours
  const askedEvents = [...Object.values(chosen).flat(), ...don.offers.flatMap((o) => o.asked)];
  const recent = askedEvents.filter((ev) => ev.first > ctx.now - DAY_MS).length;
  if (recent < RECENT_MIN) return null;
  // options: from the pairing's whole window (asked earlier in the week is fine), never a story this edition asks
  const options = all.filter((ev) => !askedKeys.has(ev.key) && !askedList.some((a) => shareName(a, ev)));
  const taken = new Set();
  const rounds = [];
  for (const t of roundOrder(types, ctx.history, rnd)) {
    const questions = buildQuestions(t, chosen[t], options, rnd, { todayStart: ctx.todayStart, taken, extraPlaces: ctx.extraPlaces });
    if (!questions) return null;
    rounds.push({ type: t, questions });
  }
  // (DOUBLE OR NOTHING's wrong options: none the rounds showed when the pool allows, else they may be: on air, 12 Oct,
  // "NASA spots patch of Moon-like rock on Earth" was a wrong option in PICTURE THIS and again in DOUBLE OR NOTHING)
  const donOffers = [];
  for (const o of don.offers) {
    const build = (seen) => buildQuestions(don.type, o.asked, options, rnd, { todayStart: ctx.todayStart, taken: new Set(seen), extraPlaces: ctx.extraPlaces });
    const questions = build(taken) || build([]);
    if (questions) donOffers.push({ desk: o.desk, question: questions[0] });
  }
  if (!donOffers.length) return null;
  const [tieBreak] = buildQuestions('letters', tie, options, rnd, {});
  return { rounds, don: { type: don.type, offers: donOffers }, tieBreak, asked: [...askedKeys], recent };
}

/**
 * The plan for an edition at `now`, or why the quiz does not air. `events` are the eligible events of the last seven
 * days (quizEvents), `entries` the archive's airings (for the grave-day rule and the three-day minimum), `contestants`
 * [{ id, own }], `history` the editions before [{ at, pair, types, asked }].
 */
export function planEdition({ events, entries, now = Date.now(), contestants, history = [], same = null, seed = null, checkHour = true, minArchiveDays = MIN_ARCHIVE_DAYS, avoid = new Set() } = {}) {
  const rnd = seeded(seed ?? `pay-attention:${new Date(now).toISOString().slice(0, 13)}`);
  const hour = londonHour(now);
  if (checkHour && (hour < AIR_FROM || hour >= AIR_TO)) return { air: false, reason: `overnight (${hour}:00 London; the quiz airs 14:00–23:00)` };
  const oldest = entries.length ? Math.min(...entries.map((e) => e.at)) : now;
  if (now - oldest < minArchiveDays * DAY_MS) return { air: false, reason: `the archive holds ${((now - oldest) / DAY_MS).toFixed(1)} days; the quiz needs ${minArchiveDays}` };
  const grave = graveDay(entries, { now, same });
  if (grave.grave || grave.thin) return { air: false, reason: grave.grave ? `grave news day: ${grave.reason}` : `too little aired to judge the day (${grave.reason})`, grave };
  const dayStart = londonDayStart(now);
  const ctx = { now, todayStart: dayStart + 6 * 3600_000, earlierBefore: dayStart - DAY_MS, history, extraPlaces: neutralPlaces(avoid) };
  const askedWeek = new Set(history.filter((h) => h.at > now - 7 * DAY_MS).flatMap((h) => h.asked || []));
  // (asked once in seven days goes by story: another source's take on a story asked this week is out too; round 15's
  // reading: "Google makes it easier to launch your vibe-coded apps" asked on the 13th, "Google wants to host your
  // personal vibe-coded apps" planned for the 14th)
  const askedStories = events.filter((ev) => askedWeek.has(ev.key));
  const askedThisWeek = (ev) => askedWeek.has(ev.key) || askedStories.some((a) => shareName(a, ev));
  // recent stories first, in a seeded order within each day
  const ordered = (list) => shuffle(list, rnd).sort((a, b) => Math.floor((now - a.first) / DAY_MS) - Math.floor((now - b.first) / DAY_MS));
  const tried = [];
  for (const twiceToday of [false, true]) {
    for (const p of pairings(contestants, history, now, rnd, { twiceToday })) {
      const own = new Set([...p.a.own, ...p.b.own]);
      const mine = events.filter((ev) => !ev.programmes.some((x) => own.has(x)));
      const pool = ordered(mine.filter((ev) => !askedThisWeek(ev)));
      tried.push(`${p.a.id}+${p.b.id}:${pool.length}`);
      for (const types of typeSets(history, rnd)) {
        const plan = fill(types, pool, mine, ctx, rnd);
        if (plan) return { air: true, at: now, pair: [p.a.id, p.b.id], ...plan, types: plan.rounds.map((r) => r.type), pool: pool.length, grave, twiceToday };
      }
    }
  }
  return { air: false, reason: 'no pairing and three round types fit the archive', tried, grave };
}

/** The history record an aired edition leaves (the writer persists it): who played, what was asked. */
export const historyOf = (plan) => ({ at: plan.at, pair: plan.pair, types: plan.types, asked: plan.asked });

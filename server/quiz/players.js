// PAY ATTENTION's players (docs/programmes/pay-attention.md §4.2): a seeded model of each contestant, deterministic per
// edition. An accuracy by the question's desk (a base of 55–70 %, more on their own subjects), a speed (how early they
// lock in or buzz), and a spread for guessing figures. The game is scripted entertainment between the channel's
// characters (§3.4); the model only decides who answers what, never a fact: every fact on screen comes from the plan.
//
//   playEdition(plan, rnd)   → { questions: [{ round, q, plays: { [id]: { answer, right, points, … } } }], scores, … }

import { parseFigure, formatFigure, niceNumber, nextNice } from './desk.js';

export { parseFigure, formatFigure };

// Each player is strong on two desks, one of them outside their own programme (they are never asked about their own
// programme's stories, so a strength only inside it would never show): measured over simulated weeks, no player's
// win rate falls outside 35–65 %
export const SKILL = Object.freeze({
  paco: { base: 0.65, strong: ['world', 'business'], speed: 0.45, spread: 0.35 },
  lola: { base: 0.63, strong: ['world', 'science'], speed: 0.6, spread: 0.4 },
  max: { base: 0.62, strong: ['tech', 'science'], speed: 0.8, spread: 0.45 },
  ada: { base: 0.66, strong: ['tech', 'business'], speed: 0.4, spread: 0.25 },
  nova: { base: 0.63, strong: ['science', 'world'], speed: 0.5, spread: 0.3 },
  unit8: { base: 0.64, strong: ['science', 'tech'], speed: 0.55, spread: 0.2 },
  penny: { base: 0.64, strong: ['business', 'world'], speed: 0.5, spread: 0.3 },
  sam: { base: 0.6, strong: ['world', 'tech'], speed: 0.6, spread: 0.4 },
  kai: { base: 0.62, strong: ['sport', 'world'], speed: 0.7, spread: 0.4 },
  rosa: { base: 0.64, strong: ['sport', 'business'], speed: 0.5, spread: 0.3 },
});

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function accuracy(id, desk) {
  const s = SKILL[id] || { base: 0.6, strong: [] };
  return clamp(s.base + (s.strong.includes(desk) ? 0.3 : 0), 0.35, 0.92);
}
// How a player's accuracy plays out in a question: the differences between players widened two and a half times around 60 %, so skill shows
// over a dozen questions (with the raw accuracies a clear favourite lost 40 % of simulated editions)
const chance = (id, desk) => clamp(0.6 + (accuracy(id, desk) - 0.6) * 2.5, 0.2, 0.95);

const normal = (rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/** PICTURE THIS: each player locks in at a step (2–4) or guesses at the last; a wrong lock-in is out. */
export function playPicture(q, ids, rnd) {
  const desk = q.options.find((o) => o.letter === q.answer)?.desk;
  const plays = {};
  for (const id of ids) {
    const acc = chance(id, desk);
    const u = rnd();
    const knowAt = u < acc * 0.5 ? 2 : u < acc * 0.8 ? 3 : u < acc * 0.98 ? 4 : null;
    if (knowAt) {
      const step = Math.min(4, knowAt + (rnd() > SKILL[id]?.speed ? 1 : 0));
      plays[id] = { answer: q.answer, right: true, step, points: { 2: 3, 3: 2, 4: 1 }[step] };
    } else {
      const lured = rnd() < 0.15; // a confident wrong lock-in before the last step
      const wrong = q.options.filter((o) => o.letter !== q.answer);
      const pick = rnd() < 1 / 3 && !lured ? q.answer : wrong[Math.floor(rnd() * wrong.length)].letter;
      const step = lured ? 2 + Math.floor(rnd() * 2) : 4;
      plays[id] = { answer: pick, right: pick === q.answer, step, points: pick === q.answer ? 1 : 0 };
    }
  }
  return plays;
}

/** LETTER BY LETTER: stages 1–3; the first to buzz says it or stalls (out for the headline). */
export function playLetters(q, ids, rnd) {
  const out = new Set();
  const plays = Object.fromEntries(ids.map((id) => [id, { buzzed: false, right: false, points: 0 }]));
  const know = Object.fromEntries(ids.map((id) => {
    const acc = chance(id, q.desk);
    const u = rnd();
    return [id, u < acc * 0.35 ? 1 : u < acc * 0.7 ? 2 : u < acc * 0.92 ? 3 : null];
  }));
  for (let stage = 1; stage <= 3; stage++) {
    const buzzers = ids.filter((id) => !out.has(id) && (know[id] === stage || (know[id] && know[id] < stage) || rnd() < (SKILL[id]?.speed - 0.4) * 0.12));
    if (!buzzers.length) continue;
    buzzers.sort((a, b) => (SKILL[b]?.speed || 0.5) + rnd() * 0.4 - ((SKILL[a]?.speed || 0.5) + rnd() * 0.4));
    for (const id of buzzers) {
      plays[id].buzzed = true;
      plays[id].stage = stage;
      if (know[id] && know[id] <= stage) {
        plays[id].right = true;
        plays[id].points = 4 - stage;
        return { plays, winner: id, stage };
      }
      plays[id].stall = true;
      out.add(id);
    }
  }
  return { plays, winner: null, stage: null };
}

/** WHERE IN THE WORLD?: two points for the right pin. */
export function playWhere(q, ids, rnd) {
  const desk = q.desk || null;
  const plays = {};
  for (const id of ids) {
    const right = rnd() < chance(id, desk) * 0.85 + 0.1;
    const wrong = q.options.filter((o) => o.letter !== q.answer);
    const pick = right ? q.answer : wrong[Math.floor(rnd() * wrong.length)].letter;
    plays[id] = { answer: pick, place: q.options.find((o) => o.letter === pick).label, right, points: right ? 2 : 0 };
  }
  return plays;
}

/** TODAY OR NOT TODAY?: one point a headline. */
export function playToday(item, ids, rnd) {
  const plays = {};
  for (const id of ids) {
    const right = rnd() < 0.25 + 0.6 * chance(id, item.desk);
    const answer = right ? item.answer : item.answer === 'TODAY' ? 'EARLIER' : 'TODAY';
    plays[id] = { answer, right, points: right ? 1 : 0 };
  }
  return plays;
}

/** HOW MANY?: guesses around the true value; closest two points, exactly right three (only for an unqualified figure). */
export function playHowMany(q, ids, rnd) {
  const fig = parseFigure(q.figure.value);
  const plays = {};
  if (!fig) return null;
  const isPercent = /%|percent/.test(fig.unit);
  for (const id of ids) {
    const spread = SKILL[id]?.spread ?? 0.4;
    let g = niceNumber(fig.n * Math.exp(normal(rnd) * spread));
    if (isPercent) g = Math.min(100, Math.round(g));
    // two players never say the same number: the second goes one nice step up
    if (Object.values(plays).some((p) => p.guess === g)) g = isPercent ? Math.min(100, g + 5) : nextNice(g);
    plays[id] = { guess: g, said: formatFigure(g, fig), off: Math.abs(g - fig.n) };
  }
  const [a, b] = ids;
  const exact = (id) => q.figure.exact && plays[id].guess === fig.n;
  for (const id of ids) plays[id].points = 0;
  if (exact(a) || exact(b)) for (const id of ids) plays[id].points = exact(id) ? 3 : 0;
  else if (plays[a].off !== plays[b].off) plays[plays[a].off < plays[b].off ? a : b].points = 2;
  for (const id of ids) plays[id].right = plays[id].points > 0;
  return plays;
}

/** One question played: the plays, and each player's points. */
export function playQuestion(q, ids, rnd) {
  switch (q.type) {
    case 'picture':
      return { plays: playPicture(q, ids, rnd) };
    case 'letters': {
      const r = playLetters(q, ids, rnd);
      return { plays: r.plays, winner: r.winner, stage: r.stage };
    }
    case 'where':
      return { plays: playWhere(q, ids, rnd) };
    case 'howmany':
      return { plays: playHowMany(q, ids, rnd) };
    case 'today':
      return { items: q.items.map((it) => ({ item: it, plays: playToday(it, ids, rnd) })) };
    default:
      return { plays: {} };
  }
}

export const pointsOf = (played, id) => (played.items ? played.items.reduce((n, x) => n + (x.plays[id]?.points || 0), 0) : played.plays?.[id]?.points || 0);

/**
 * The whole game for a plan: three rounds, the scores at half time, DOUBLE OR NOTHING (the trailing player picks the
 * desk among the offers: their own subject if offered; level, the one with fewer right answers picks, else the seed),
 * then the tie-break if level. Returns { rounds: [{ type, played: [...] }], half, don, tie, scores, winner, loser }.
 */
export function playEdition(plan, rnd) {
  const ids = plan.pair;
  const scores = Object.fromEntries(ids.map((id) => [id, 0]));
  const rights = Object.fromEntries(ids.map((id) => [id, 0]));
  const add = (played, mult = { [ids[0]]: 1, [ids[1]]: 1 }) => {
    for (const id of ids) {
      const p = pointsOf(played, id) * (mult[id] ?? 1);
      scores[id] += p;
      if (pointsOf(played, id) > 0) rights[id]++;
    }
  };
  const rounds = [];
  let half = null;
  plan.rounds.forEach((r, i) => {
    const played = r.questions.map((q) => {
      const p = playQuestion(q, ids, rnd);
      add(p);
      return { q, ...p, after: { ...scores } };
    });
    rounds.push({ type: r.type, played });
    if (i === 1) half = { ...scores };
  });
  // DOUBLE OR NOTHING
  const [a, b] = ids;
  const trailing = scores[a] !== scores[b] ? (scores[a] < scores[b] ? a : b) : rights[a] !== rights[b] ? (rights[a] < rights[b] ? a : b) : rnd() < 0.5 ? a : b;
  const leader = trailing === a ? b : a;
  const offers = plan.don.offers;
  const own = offers.find((o) => (SKILL[trailing]?.strong || []).includes(o.desk));
  const offer = own || offers[Math.floor(rnd() * offers.length)];
  const beforeDon = { ...scores };
  const donPlayed = playQuestion(offer.question, ids, rnd);
  add(donPlayed, { [trailing]: 2, [leader]: 1 });
  const don = { type: plan.don.type, trailing, leader, level: beforeDon[a] === beforeDon[b], offer, offered: offers.map((o) => o.desk), played: { q: offer.question, ...donPlayed, after: { ...scores } }, before: beforeDon };
  // the tie-break: a sudden-death headline; if neither names it, the game is drawn
  let tie = null;
  if (scores[a] === scores[b]) {
    const r = playLetters(plan.tieBreak, ids, rnd);
    tie = { q: plan.tieBreak, plays: r.plays, winner: r.winner, stage: r.stage };
  }
  const winner = scores[a] !== scores[b] ? (scores[a] > scores[b] ? a : b) : tie?.winner || null;
  return { rounds, half, don, tie, scores: { ...scores }, rights, winner, loser: winner ? (winner === a ? b : a) : null };
}

/** Was the edition decided before DOUBLE OR NOTHING (the trailing player could not catch up even at double points)? */
export function decidedBeforeDon(game) {
  const { before, trailing, leader, type } = game.don;
  const maxDon = { picture: 3, letters: 3, where: 2, howmany: 3, today: 3 }[type] * 2;
  return before[leader] - before[trailing] > maxDon;
}

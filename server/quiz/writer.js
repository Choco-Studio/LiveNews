// PAY ATTENTION's writer (docs/programmes/pay-attention.md §4–5; build step 2): the episode from the planner's plan and
// the players' model. Every fact it says comes from the plan: the aired headline verbatim (a hidden place or figure read
// as "blank"), its source, its programme and when it aired. Everything else is a bank line, picked by hash and the
// station's recent-lines memory. A player's wrong answer is a guess in form, and a wrong buzz is a stall, never a wrong
// headline. No laughter, no applause.
//
//   writeEpisode(plan, { channel, now, table, recentLines, nextAt }) → { episode, game }
import { HOST, ANSWERS, PLAYERS, DESKS } from './banks.js';
import { playEdition } from './players.js';
import { ROUND_TITLES, seeded } from './rounds.js';
import { parseFigure } from './desk.js';

export const PROGRAM = Object.freeze({ id: 'pay-attention', title: 'PAY ATTENTION', tagline: "THE WEEK'S NEWS AS A GAME", theme: 'quiz' });
export const SPEECH_CPS = 15; // the voices' characters a second
// the parts of a question that are not speech (seconds): the countdowns, the picture's steps, the letters' stages
export const BEATS = Object.freeze({ picture: 7.5, letters: 10, where: 6.4, today: 3.2, howmany: 4.3, reveal: 1.2 });

const ORDINAL = ['one', 'two', 'three'];
const BEHIND = /\b(?:behind|trail\w*)\b/i; // DOUBLE OR NOTHING's lines for the player behind (never said when level)
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A London clock for `t`: { hour, minute, day } (day: 0 Sunday) and its date key. */
function london(t) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t));
  const get = (k) => parts.find((p) => p.type === k)?.value;
  return { hour: Number(get('hour')), minute: Number(get('minute')), weekday: get('weekday'), date: `${get('year')}-${get('month')}-${get('day')}` };
}

/** "on TECH BYTES this evening", "on yesterday's COSMOS DESK", "on Monday's WORLD NOW". */
export function airedWhen(programmeTitle, at, now) {
  const a = london(at);
  const n = london(now);
  const yesterday = london(now - 86400_000).date;
  // (a story aired at 00:40 is not "this morning" to a viewer at 22:45: the small hours are overnight)
  if (a.date === n.date) return `on ${programmeTitle} ${a.hour < 5 ? 'overnight' : a.hour < 12 ? 'this morning' : a.hour < 17 ? 'this afternoon' : 'this evening'}`;
  if (a.date === yesterday) return `on yesterday's ${programmeTitle}`;
  return `on ${a.weekday}'s ${programmeTitle}`;
}

/** A spoken time: "half past eight tonight", "four o'clock tomorrow afternoon". */
export function spokenTime(t, now) {
  const a = london(t);
  const n = london(now);
  const words = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
  const h = words[a.hour % 12];
  const nextH = words[(a.hour + 1) % 12];
  const MIN = { 5: 'five', 10: 'ten', 20: 'twenty', 25: 'twenty-five' };
  const m = a.minute;
  const clock = m === 0 ? `${h} o'clock` : m === 30 ? `half past ${h}` : m === 15 ? `quarter past ${h}` : m === 45 ? `quarter to ${nextH}` : MIN[m] ? `${MIN[m]} past ${h}` : MIN[60 - m] ? `${MIN[60 - m]} to ${nextH}` : `${h} ${m < 10 ? `oh ${m}` : m}`;
  const part = a.hour < 12 ? 'in the morning' : a.hour < 17 ? 'in the afternoon' : 'in the evening';
  const day = a.date === n.date ? (a.hour >= 17 ? 'tonight' : `this ${part.replace('in the ', '')}`) : a.date === london(now + 86400_000).date ? `tomorrow ${part.replace('in the ', '')}` : `on ${a.weekday}`;
  return `${clock} ${day}`;
}

const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
// a score said straight after a name that ends in a number is one number to the ear ("UNIT-8 9 points" heard as "unit
// eighty-nine"): a comma between them
export const scoreSafe = (line) => String(line).replace(/(\b\p{L}+-\d+)\s+(?=\d)/gu, '$1, ');
// UNIT-8 says the shared answers in full, literal as its bible has it ("Let us say C"); everyone else speaks as people do
const LITERAL = [[/\bI'll\b/g, 'I will'], [/\bI'm\b/g, 'I am'], [/\bI'd\b/g, 'I would'], [/\bLet's\b/g, 'Let us'], [/\blet's\b/g, 'let us'], [/\bThat's\b/g, 'That is'], [/\bIt's\b/g, 'It is'], [/\bisn't\b/g, 'is not'], [/\bdon't\b/g, 'do not'], [/\bDon't\b/g, 'Do not']];
export const literal = (line) => LITERAL.reduce((t, [re, w]) => t.replace(re, w), String(line));
// a hidden name or figure is read as "blank"; a sentence keeps its full stop
const spoken = (words) => String(words).replace(/▮+/g, 'blank');
const stop = (text) => (/[.!?…]['’"”]?$/.test(String(text).trim()) ? String(text).trim() : `${String(text).trim()}.`);
// countries as they are said: "the United States", "Madagascar"
const THE = new Set(['United States', 'United Kingdom', 'United Arab Emirates', 'Netherlands', 'Philippines', 'Czech Republic', 'Dominican Republic', 'Bahamas', 'Gambia', 'Maldives', 'Democratic Republic of the Congo', 'Central African Republic']);
export const placeSaid = (country) => (THE.has(country) ? `the ${country}` : country);
/** The figure as the sentence put it, with the label's words that follow it there: "$1.3 billion", "15 chicks". */
export function figureSaid(q) {
  const s = String(q.sentence || '');
  const masked = String(q.masked || '');
  const i = masked.search(/▮/);
  if (i < 0) return q.figure.value;
  const after = masked.slice(i).replace(/^▮+/, '');
  const value = s.slice(i, s.length - after.length).trim();
  const labelWords = new Set(String(q.figure.label || '').toLowerCase().split(/[^a-z]+/).filter(Boolean));
  // a sum of money takes only a rate after it ("$200 per month"), never what it bought: "The answer: $149 HomePod mini"
  // and "$1.3 billion acquisition" are heard as one name (on air, 13 Oct)
  const money = /[$£€¥]|\b(?:dollars?|pounds?|euros?)\b/i.test(value);
  const follow = [];
  for (const w of after.trim().split(/\s+/)) {
    const bare = w.replace(/[^\p{L}]/gu, '');
    if (!bare || !labelWords.has(bare.toLowerCase()) || follow.length >= 3) break;
    if (money && !follow.length && bare.toLowerCase() !== 'per') break;
    follow.push(w.replace(/[.,;:!?]+$/, ''));
  }
  return [value, ...follow].join(' ');
}

/**
 * The whole episode. `channel` gives the players' names and the programmes' titles; `table` (QuizTable) the week's
 * standings and the pair's last meeting; `recentLines` the station's lines of the last hours (none is used again);
 * `nextAt` the next edition's time (ms), if the station knows it.
 */
export function writeEpisode(plan, { channel, now = plan.at, table = null, recentLines = [], nextAt = null, hostName = 'the host' } = {}) {
  const rnd = seeded(`${plan.at}:${plan.pair.join('+')}:game`);
  const game = playEdition(plan, rnd);
  const [a, b] = plan.pair;
  const anchorOf = { [a]: 'A', [b]: 'B' };
  const all = { ...(channel?.programs || {}), ...(channel?.drafts || {}) };
  const titleOf = (pid) => all[pid]?.title || String(pid || '').toUpperCase();
  const fullName = (id) => channel?.presenters?.[id]?.name || id;
  const first = (id) => (id === 'unit8' ? 'UNIT-8' : fullName(id).replace(/^Dr\s+/, '').split(/\s+/)[0]);
  const homeOf = (id) => Object.entries(all).find(([, p]) => (p.presenters || []).includes(id) && p.kind !== 'weather' && p.kind !== 'weekly')?.[0] || Object.entries(all).find(([, p]) => (p.presenters || []).includes(id))?.[0];
  const recent = new Set(recentLines.map((l) => norm(typeof l === 'string' ? l : l?.line)));
  const used = new Set();
  // a line from a bank: by hash of the edition and the moment, never one aired in the station's recent hours, never
  // twice in an edition (`unique`: rather nothing than a line said again, for the players' reactions)
  const pick = (list, key, vars = {}, { unique = false } = {}) => {
    const n = list.length;
    const start = hash(`${plan.at}:${plan.pair.join('+')}:${key}`) % n;
    for (let i = 0; i < n; i++) {
      const line = list[(start + i) % n];
      const out = fill(line, vars);
      if (recent.has(norm(out)) || used.has(line)) continue;
      used.add(line);
      return out;
    }
    return unique ? null : fill(list[start], vars);
  };
  const segs = [];
  const say = (anchor, part, text, extra = {}) => segs.push({ type: 'quiz', part, anchor, emotion: extra.emotion || 'neutral', text, ...extra });
  const host = (part, text, extra) => say('H', part, text, extra);
  const player = (id, part, text, extra) => say(anchorOf[id], part, id === 'unit8' && part !== 'buzz' ? literal(text) : text, extra);
  const react = (id, kind, key) => {
    const line = pick(PLAYERS[id]?.[kind] || [], `${key}:${id}:${kind}`, {}, { unique: true });
    if (line) player(id, 'react', line, { emotion: kind === 'right' || kind === 'win' || kind === 'ahead' ? 'happy' : 'neutral' });
  };
  // who has it: one name, both, or nobody
  const who = (right, key) => (right.length === 2 ? pick(HOST.both, `${key}:b`) : right.length ? pick(HOST.right, `${key}:r:${right[0]}`, { name: first(right[0]) }) : pick(HOST.nobody, `${key}:n`));
  // where and when a story aired, for the reveal ("From The Verge, on TECH BYTES this evening.")
  const credit = (q, at = q.aired.at) => `${q.aired.source ? `From ${q.aired.source}, ` : 'It aired '}${airedWhen(titleOf(q.aired.programme), at, now)}.`;
  // the source and the airing are always on the screen; the host says them at every third reveal, so the game keeps moving
  let reveals = 0;
  const sayCredit = (q) => (reveals++ % 3 === 0 ? ` ${credit(q)}` : '');

  // the open and the welcome
  segs.push({ type: 'quiz', part: 'open', anchor: 'H', text: '', title: PROGRAM.title });
  host('welcome', pick(HOST.welcome, 'welcome'));
  host('introduce', pick(HOST.introduce, 'introduce', { a: fullName(a), b: fullName(b), progA: titleOf(homeOf(a)), progB: titleOf(homeOf(b)) }), { players: [a, b] });
  const met = table?.lastMeeting(a, b, now);
  if (met) {
    const when = london(met.at).date === london(now - 86400_000).date ? 'yesterday' : `on ${london(met.at).weekday}`;
    host('standing', met.winner ? `They last met ${when}, and ${first(met.winner)} won it, ${met.scores[met.winner]} to ${met.scores[met.pair.find((x) => x !== met.winner)]}.` : `They last met ${when}, and it was drawn.`);
  } else {
    host('standing', pick(['Their first meeting on PAY ATTENTION.', "They've never played each other before.", 'A first meeting, this.'], 'standing'));
  }
  react(a, 'intro', 'intro');
  react(b, 'intro', 'intro');

  // the locks recapped on the clock (the host fills the wait with what the desks show: who chose what)
  const recap = (xa, xb, key, data) => {
    const line = xa === xb ? pick(HOST.recap.same, `${key}:rc`, { x: xa }) : pick(HOST.recap.split, `${key}:rc`, { a: first(a), b: first(b), x: xa, y: xb });
    host('recap', line.replace(/^the/, 'The'), { quiz: { ...data, recap: true } });
  };
  // one question: the frame, the play, the reveal, a reaction
  const playOut = (q, played, key, { double = null, firstOfRound = false } = {}) => {
    const data = { round: q.type, question: q };
    const first1 = firstOfRound;
    if (q.type === 'picture') {
      host('frame', pick(HOST.frame.picture, `${key}:f`), { quiz: data, beats: { steps: q.steps } });
      host('options', fill(pick(HOST.frame.options, `${key}:o`), { A: q.options[0].words, B: q.options[1].words, C: q.options[2].words }), { quiz: data });
      host('countdown', pick(HOST.countdown, `${key}:c`), { quiz: data, countdown: BEATS.picture });
      for (const id of [...plan.pair].sort((x, y) => played.plays[x].step - played.plays[y].step)) {
        player(id, 'lock', pick(ANSWERS.lock, `${key}:${id}:l`, { x: played.plays[id].answer }), { quiz: { ...data, lock: played.plays[id] } });
      }
      recap(played.plays[a].answer, played.plays[b].answer, key, data);
      const right = plan.pair.filter((id) => played.plays[id].right);
      const answer = q.options.find((o) => o.letter === q.answer);
      host('reveal', `It's ${q.answer}. ${who(right, key)}${sayCredit(q)}`, { quiz: { ...data, reveal: true, credit: q.aired ? credit(q) : null, answerWords: answer.words, points: Object.fromEntries(plan.pair.map((id) => [id, played.plays[id].points])) } });
    } else if (q.type === 'letters') {
      host('frame', pick(HOST.frame.letters.filter((l) => !first1 || !/^Next/.test(l)), `${key}:f`, { desk: (DESKS[q.desk] || 'NEWS').toLowerCase() }), { quiz: data, countdown: BEATS.letters });
      for (const id of plan.pair) if (played.plays[id].stall) player(id, 'stall', pick(PLAYERS[id]?.stall || ANSWERS.pass, `${key}:${id}:s`), { quiz: { ...data, buzz: played.plays[id] } });
      if (played.winner) {
        player(played.winner, 'buzz', `${q.words}.`, { quiz: { ...data, buzz: played.plays[played.winner] } });
        host('reveal', `${pick(HOST.right, `${key}:r`, { name: first(played.winner) })}${sayCredit(q)}`, { quiz: { ...data, reveal: true, credit: q.aired ? credit(q) : null, points: Object.fromEntries(plan.pair.map((id) => [id, played.plays[id].points])) } });
      } else {
        host('reveal', `${pick(HOST.nobody, `${key}:n`)} It was: ${stop(spoken(q.words))}${sayCredit(q)}`, { quiz: { ...data, reveal: true, credit: q.aired ? credit(q) : null, points: { [a]: 0, [b]: 0 } } });
      }
    } else if (q.type === 'where') {
      host('frame', fill(pick(HOST.frame.where, `${key}:f`), { words: stop(spoken(q.masked || q.words)) }).replace(/\.\. /, '. ').replace(/\.\?$/, '?'), { quiz: data });
      const said = (o) => placeSaid(o.country);
      host('pins', fill(pick(HOST.frame.pins, `${key}:p`), { A: said(q.options[0]), B: said(q.options[1]), C: said(q.options[2]) }).replace(/^the/, 'The'), { quiz: data, countdown: BEATS.where });
      for (const id of plan.pair) player(id, 'lock', pick(ANSWERS.place, `${key}:${id}:l`, { x: said(q.options.find((o) => o.letter === played.plays[id].answer)) }).replace(/^the/, 'The'), { quiz: { ...data, lock: played.plays[id] } });
      recap(said(q.options.find((o) => o.letter === played.plays[a].answer)), said(q.options.find((o) => o.letter === played.plays[b].answer)), key, data);
      const right = plan.pair.filter((id) => played.plays[id].right);
      const answer = q.options.find((o) => o.letter === q.answer);
      // (the headline stands whole on the board with its place gold: read once in the frame, not again here)
      host('reveal', `It's ${placeSaid(answer.country)}. ${who(right, key)}${sayCredit(q)}`, { quiz: { ...data, reveal: true, credit: q.aired ? credit(q) : null, points: Object.fromEntries(plan.pair.map((id) => [id, played.plays[id].points])) } });
    } else if (q.type === 'howmany') {
      const ask = parseFigure(q.figure.value)?.cur ? 'How much' : 'How many';
      host('frame', fill(pick(HOST.frame.howmany, `${key}:f`), { masked: stop(spoken(q.masked)), ask }), { quiz: data, countdown: BEATS.howmany });
      for (const id of plan.pair) player(id, 'guess', pick(ANSWERS.number, `${key}:${id}:g`, { x: played.plays[id].said }), { quiz: { ...data, guess: played.plays[id] } });
      const winners = plan.pair.filter((id) => played.plays[id].points > 0);
      const figure = `${q.figure.qualifier && !new RegExp(`${q.figure.qualifier}\\s*▮`, 'i').test(q.masked) ? `${q.figure.qualifier.toLowerCase()} ` : ''}${figureSaid(q)}`;
      const exact = winners.find((id) => played.plays[id].points === 3);
      const level = !exact && winners.length === 2; // equally close: two points each
      const close = !level && Math.abs(played.plays[a].off - played.plays[b].off) / Math.max(1, Math.max(played.plays[a].off, played.plays[b].off)) < 0.15 ? ` ${pick(HOST.close, `${key}:cl`, { n: '' }).replace(/\s+\./, '.')}` : '';
      const verdict = exact ? pick(HOST.exact, `${key}:x`, { name: first(exact) }) : level ? pick(HOST.equallyClose, `${key}:e`) : winners.length ? pick(HOST.closest, `${key}:c`, { name: first(winners[0]) }) : pick(HOST.nobody, `${key}:n`);
      host('reveal', `The answer: ${figure}, as reported ${airedWhen(titleOf(q.aired.programme), q.aired.at, now)}${q.aired.source ? `, from ${q.aired.source}` : ''}.${close} ${verdict}`, { quiz: { ...data, reveal: true, credit: q.aired ? credit(q) : null, points: Object.fromEntries(plan.pair.map((id) => [id, played.plays[id].points])) } });
    } else if (q.type === 'today') {
      // quickfire: the players answer on their lamps, the reveal says which and who
      played.items.forEach((x, i) => {
        const it = x.item;
        const frames = HOST.frame.today.filter((l) => (i === 0 ? /^(?:First: )?\{words\}$/.test(l) : !/^First/.test(l)));
        host('frame', fill(pick(frames, `${key}:f${i}`), { words: stop(it.words) }), { quiz: { ...data, item: it, locks: x.plays }, countdown: BEATS.today });
        const right = plan.pair.filter((id) => x.plays[id].right);
        // the lamps show who; the host names a player only when the two differ, or when neither has it
        const said = right.length === 1 ? ` ${first(right[0])} has it.` : right.length ? '' : ' Neither of you.';
        const when = airedWhen(titleOf(it.aired.programme), it.aired.at, now).replace(/^on /, '');
        host('reveal', `${it.answer === 'TODAY' ? 'Today' : 'Earlier'}: ${when}.${said}`, { quiz: { ...data, item: it, reveal: true, points: Object.fromEntries(plan.pair.map((id) => [id, x.plays[id].points])) } });
      });
      if (played.items.length > 3) {
        const tally = (id) => played.items.filter((x) => x.plays[id].right).length;
        host('tally', scoreSafe(pick(HOST.frame.todayTally, `${key}:t`, { a: first(a), b: first(b), sa: tally(a), sb: tally(b) })), { quiz: { ...data, tally: { [a]: tally(a), [b]: tally(b) } } });
      }
    }
    // one reaction: the player the question mattered to (right alone, or wrong alone), else none
    const pts = (id) => (played.items ? played.items.reduce((n, x) => n + x.plays[id].points, 0) : played.plays?.[id]?.points || 0);
    const pa = pts(a) * (double?.[a] || 1);
    const pb = pts(b) * (double?.[b] || 1);
    if ((reactions.get(roundKey(key)) || 0) >= 2) return;
    const before = segs.length;
    // (a miss is regretted by a player who answered: when nobody buzzed LETTER BY LETTER, nobody gave an answer to call
    // overpriced or too fast; on air, 13 Oct: "Nobody has it. It was: …" "Overpriced answer.")
    const answered = (id) => q.type !== 'letters' || !!played.plays?.[id]?.stall;
    const missed = [hash(key) % 4 < 2 ? a : b, hash(key) % 4 < 2 ? b : a].find(answered);
    if (pa !== pb && (hash(key) % 3 !== 0 || pa + pb >= 3)) react(pa > pb ? a : b, 'right', key);
    else if (pa === 0 && pb === 0 && hash(key) % 2 && missed) react(missed, 'wrong', key);
    if (segs.length > before) reactions.set(roundKey(key), (reactions.get(roundKey(key)) || 0) + 1);
  };
  const reactions = new Map();
  const roundKey = (key) => key.replace(/q\d+$/, '');

  game.rounds.forEach((r, i) => {
    host('round', pick(HOST.roundIntro[r.type], `round:${r.type}`, { k: ORDINAL[i] }), { quiz: { round: r.type, title: ROUND_TITLES[r.type], k: i + 1 } });
    r.played.forEach((p, j) => playOut(p.q, p, `r${i}q${j}`, { firstOfRound: j === 0 }));
    if (i === 1) {
      host('scores', scoreSafe(pick(HOST.scores, 'scores', { a: first(a), b: first(b), sa: game.half[a], sb: game.half[b] })), { quiz: { scores: game.half } });
      const lead = game.half[a] === game.half[b] ? null : game.half[a] > game.half[b] ? a : b;
      if (lead) {
        react(lead, 'ahead', 'half');
        react(lead === a ? b : a, 'behind', 'half');
      }
    }
  });

  // DOUBLE OR NOTHING
  const d = game.don;
  const desks = d.offered.map((x) => (DESKS[x] || x).toLowerCase());
  if (d.offered.length > 1) {
    // (level: never a line that calls the player behind)
    host('don', `${d.level ? `We're level, so ${first(d.trailing)} picks. ` : ''}${pick(d.level ? HOST.don.filter((l) => !BEHIND.test(l)) : HOST.don, 'don', { name: first(d.trailing), desks: `${desks[0]} or ${desks[1]}` })}`, { quiz: { round: d.type, title: 'DOUBLE OR NOTHING', offered: d.offered, scores: d.before, trailing: d.trailing } });
    player(d.trailing, 'pick', pick(PLAYERS[d.trailing]?.pick || ['{desk}.'], 'pick', { desk: (DESKS[d.offer.desk] || d.offer.desk).toLowerCase() }).replace(/^./, (c) => c.toUpperCase()), { quiz: { desk: d.offer.desk } });
  } else {
    host('don', `${d.level ? `We're level, so ${first(d.trailing)} plays for double. ` : ''}${pick(d.level ? HOST.donOne.filter((l) => !BEHIND.test(l)) : HOST.donOne, 'don', { name: first(d.trailing), desk: (DESKS[d.offer.desk] || d.offer.desk).toLowerCase() })}`, { quiz: { round: d.type, title: 'DOUBLE OR NOTHING', offered: d.offered, scores: d.before, trailing: d.trailing } });
  }
  playOut(d.played.q, d.played, 'don', { double: { [d.trailing]: 2, [d.leader]: 1 }, firstOfRound: true });

  // the tie-break
  if (game.tie) {
    host('tie', pick(HOST.tie, 'tie'), { quiz: { round: 'letters', title: 'SUDDEN DEATH' } });
    playOut(game.tie.q, { plays: game.tie.plays, winner: game.tie.winner, stage: game.tie.stage }, 'tie', { firstOfRound: true });
  }

  // the result and the table
  const { scores, winner, loser } = game;
  if (winner && game.tie) {
    host('result', pick(HOST.tieWin, 'result', { winner: first(winner), s: scores[winner] }), { quiz: { scores, winner, tieBreak: true } });
    react(winner, 'win', 'end');
    react(loser, 'lose', 'end');
  } else if (winner) {
    host('result', scoreSafe(pick(HOST.result, 'result', { winner: first(winner), loser: first(loser), sw: scores[winner], sl: scores[loser] })), { quiz: { scores, winner } });
    react(winner, 'win', 'end');
    react(loser, 'lose', 'end');
  } else {
    host('result', `Nobody named it, so tonight's game is drawn, ${scores[a]} all.`, { quiz: { scores, winner: null } });
  }
  table?.record({ at: plan.at, pair: plan.pair, scores, winner });
  const standings = table?.standings(now) || [];
  if (standings.length) {
    const [top, next] = standings;
    const wins = (n) => (n === 1 ? 'one win' : `${Number.isInteger(n) ? n : n.toFixed(1)} wins`);
    const line = next && next.wins === top.wins
      ? `In the week's table, ${first(top.id)} and ${first(next.id)} share the lead on ${wins(top.wins)}.`
      : `In the week's table, ${first(top.id)} leads with ${wins(top.wins)} from ${top.played === 1 ? 'one game' : `${top.played} games`}.`;
    host('table', line, { quiz: { standings } });
  }
  host('signoff', nextAt ? pick(HOST.signoff, 'signoff', { next: spokenTime(nextAt, now) }) : pick(['That\'s PAY ATTENTION. Keep watching, and keep paying attention.', 'That\'s PAY ATTENTION. Thank you for playing along.'], 'signoff'));

  // the length: speech at the voices' rate, the countdowns (the lock-ins are said during them), a beat on each reveal
  let estSeconds = 8;
  let countdown = 0;
  for (const s of segs) {
    const talk = s.text.length / SPEECH_CPS + 0.4;
    if (s.part === 'lock' || s.part === 'recap') {
      const inside = Math.min(countdown, talk);
      countdown -= inside;
      estSeconds += talk - inside;
      continue;
    }
    estSeconds += talk + (s.countdown || 0) + (s.part === 'reveal' ? BEATS.reveal : 0);
    countdown = s.countdown || 0;
  }
  estSeconds = Math.round(estSeconds);
  const episode = {
    kind: 'episode',
    program: { ...PROGRAM },
    cast: { H: 'host', A: a, B: b },
    hostName,
    title: `${PROGRAM.title}: ${fullName(a)} v ${fullName(b)}`,
    segments: segs,
    storyIds: [],
    quiz: { pair: plan.pair, types: plan.types, scores, winner, asked: plan.asked, at: plan.at },
    estSeconds,
  };
  return { episode, game };
}

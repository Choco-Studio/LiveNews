// FULL TIME's shape (docs/programmes/full-time.md §4–5): after the writer has told the stories and the validator has
// checked them, the programme takes its form for the day and the hour. MATCHDAY, MIDWEEK or PREVIEW; SCORE CENTRE (the
// results the stories state with certainty, on the stadium's scoreboard); COMING UP (the dated events ahead); the
// greeting for the hour and Rosa's hello; a transition into each sport; the moment of the day; the sign-off; the
// strap's sport tag and the scoreline card on a story whose presenter says its result.
import { isGrave, pointsBack, sentencesIn } from '../facts.js';
import { embedCues, parseCues } from '../../public/js/cues.js';
import { dayIn, withoutJudgement } from './words.js';
import { FOLLOWS_ON_START, leansOnCount, sameEvent } from './prepare.js';
import { resultLine } from './scores.js';
import { shortHeadline } from '../writer.js';

const HOUR = 3600_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** The hour and weekday of a moment in a time zone. */
function clockIn(ms, tz) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour) % 24, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
}

// ---------------------------------------------------------------- the banks (picked fresh: none twice in six hours)

export const BANKS = {
  greeting: {
    morning: ['Good morning, and welcome to {title}. I\'m {A}.', 'Good morning. This is {title}, the day in sport. I\'m {A}.', 'A very good morning to you. I\'m {A}, and this is {title}.'],
    afternoon: ['Good afternoon, and welcome to {title}. I\'m {A}.', 'Good afternoon. This is {title}, the day in sport. I\'m {A}.', 'Hello, and welcome to {title} this afternoon. I\'m {A}.'],
    evening: ['Good evening, and welcome to {title}. I\'m {A}.', 'Good evening. This is {title}, the day in sport. I\'m {A}.', 'Hello and good evening. I\'m {A}, and this is {title}.', 'A very good evening. This is {title}, and I\'m {A}.'],
  },
  hello: ['[nod] Hello. Plenty to get through.', '[nod] Hello, everyone.', '[nod] Good to be here. Let\'s get going.', '[nod] Hello. A busy one today.', '[nod] Hi. Let\'s get to it.', '[nod] Hello again.'],
  results: {
    MATCHDAY: ['[point_screen] Now, the results.', '[point_screen] Let\'s run through the results.', '[point_screen] To the scores.', '[point_screen] Here are the results.'],
    MIDWEEK: ['[point_screen] A look at the latest results.', '[point_screen] The latest scores.', '[point_screen] Some results now.', '[point_screen] Now, the scores.'],
    PREVIEW: ['[point_screen] Before we look ahead, the latest results.', '[point_screen] First, the latest scores.'],
  },
  elsewhere: ['Elsewhere, ', 'Meanwhile, ', 'And elsewhere, '],
  transition: {
    football: ['Football now.', 'To football.', 'Now, football.', 'To the football.', 'In football.', 'Some football.'],
    f1: ['To the track now.', 'Formula One now.', 'To Formula One.', 'Motor racing now.', 'On the track.', 'In Formula One.'],
    tennis: ['Tennis now.', 'To the tennis.', 'On the court now.', 'In tennis.', 'Some tennis.', 'To the courts.'],
    cricket: ['Cricket now.', 'To the cricket.', 'In cricket.', 'Some cricket.', 'On to the cricket.', 'Cricket next.'],
    rugby: ['Rugby now.', 'To the rugby.', 'In rugby.', 'Some rugby.', 'On to the rugby.', 'Rugby next.'],
    'american-football': ['American football now.', 'To the NFL.', 'In American football.', 'Across the Atlantic, to American football.', 'The NFL now.', 'American football next.'],
    basketball: ['Basketball now.', 'To the basketball.', 'On the court.', 'In basketball.', 'Some basketball.', 'Basketball next.'],
    baseball: ['Baseball now.', 'To the baseball.', 'In baseball.', 'Some baseball.', 'Across the Atlantic, to baseball.', 'Baseball next.'],
    boxing: ['To the ring now.', 'Boxing now.', 'In boxing.', 'To the boxing.', 'Some boxing.', 'Boxing next.'],
    cycling: ['Cycling now.', 'To the cycling.', 'In cycling.', 'Some cycling.', 'On two wheels now.', 'Cycling next.'],
    golf: ['Golf now.', 'To the golf.', 'In golf.', 'Some golf.', 'On the course.', 'Golf next.'],
    athletics: ['Athletics now.', 'To the track.', 'In athletics.', 'Some athletics.', 'Athletics next.', 'On the track now.'],
    other: ['Now, something different.', 'Elsewhere in sport.', 'Away from the big leagues.', 'Another story now.', 'Something else now.', 'Elsewhere now.'],
  },
  // a presenter hands the next sport to the other ("Rosa has the rugby.")
  handover: ['{N} has {S}.', 'Over to {N} for {S}.', '{N} now, with {S}.', 'Here\'s {N} with {S}.'],
  // a second story about the same match or the same people, straight after the first
  follow: ['Staying with that story.', 'More on that now.', 'There is more on that one.', 'Staying with that one.', 'And there is more on that.', 'More from that one.'],
  moment: ['Our moment of the day.', 'Now, the moment of the day.', 'Time for the moment of the day.', 'The moment of the day.', 'Here is our moment of the day.', 'And now, the moment of the day.', 'Our moment of the day now.', 'Today\'s moment.'],
  comingUp: {
    'COMING UP': ['[point_screen] Coming up in sport.', '[point_screen] A look at what is coming up.', '[point_screen] What is still to come.', '[point_screen] Some dates for the diary.', '[point_screen] Coming up.', '[point_screen] What to look out for.'],
    'THE WEEKEND AHEAD': ['[point_screen] The weekend ahead.', '[point_screen] A look at the weekend ahead.', '[point_screen] What the weekend holds.', '[point_screen] Coming up this weekend.'],
  },
  signoff: {
    morning: ['That\'s {title}. [nod] From {B} and from me, enjoy your day. Stay with us on {channel}.', 'That\'s {title} for this morning. [nod] Thanks for watching. Stay with us on {channel}.', 'And that\'s {title}. [nod] From {B} and me, have a good day.'],
    afternoon: ['That\'s {title}. [nod] From {B} and from me, thanks for watching. Stay with us on {channel}.', 'That\'s {title} this afternoon. [nod] Thanks for your company.', 'And that\'s {title}. [nod] More sport later on {channel}.'],
    evening: ['That\'s {title}. [nod] From {B} and from me, good night, and stay with us on {channel}.', 'That\'s {title} for this evening. [nod] Thanks for watching.', 'And that\'s {title}. [nod] From {B} and me, thanks for your company tonight.', 'That\'s all from {title}. [nod] More sport around the clock on {channel}.'],
  },
};

/** A line from a bank, the one aired longest ago (never one in `recent`, the station's last six hours), else by seed. */
function pick(list, seed, recent) {
  const bare = (l) => l.replace(/\[[^\]]*\]\s*/g, '').trim();
  const fresh = list.filter((l) => !recent.has(bare(l)));
  const pool = fresh.length ? fresh : list;
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const line = pool[Math.abs(h) % pool.length];
  recent.add(bare(line));
  recent.used?.push(bare(line));
  return line;
}

// a sentence that leans on one before it (a pronoun, "On Tuesday they will…", Guardian 13 Oct)
const LEANS_START_RE = /^(?:On|In|At|By|From|After|Before|Since|Until|Last|This|Next|Earlier|Later)\s+[\p{L}\d ]{1,24}?\s(?:they|he|she|it|his|her|their)\s/u;
const LEANS_START = { test: (t) => pointsBack(t) || LEANS_START_RE.test(String(t || '').trim()) };

// a sport as a hand-over names it
const SPORT_NAME = { football: 'the football', f1: 'the Formula One', rugby: 'the rugby', cricket: 'the cricket', tennis: 'the tennis', 'american-football': 'the NFL', basketball: 'the basketball', baseball: 'the baseball', boxing: 'the boxing', cycling: 'the cycling', golf: 'the golf', athletics: 'the athletics' };
// a toss at the end of a story ("…relegation zone. [look_partner] Rosa?")
const TOSS_END = /\s*(?:\[[^\]]+\]\s*)*\p{Lu}[\p{L}'’-]+\?\s*((?:\[[^\]]+\]\s*)*)$/u;
const ALSO_FIRST_CLAUSE = /^[^,;:.]{0,80}?\s+also\b/i;
// a story's sentences as the outlet wrote them, and where a told sentence sits among them (its first eight words; a
// credit the writer added at its end aside), or -1
const firstWords = (t) => String(t || '').replace(/,\s+(?:according to [^,]+|[\p{Lu}][\p{L}'’ ]+ reports?)\.\s*$/u, '.').toLowerCase().replace(/[^\p{L}\d ]+/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
const sourceCache = new WeakMap();
function sourceIndex(story, sentence) {
  if (!story) return -1;
  if (!sourceCache.has(story)) {
    const list = [];
    for (const t of sentencesIn(`${story.summary || ''} ${story.body || ''}`)) if (!list.includes(firstWords(t))) list.push(firstWords(t));
    sourceCache.set(story, list);
  }
  const key = firstWords(sentence);
  return key.split(' ').length >= 5 ? sourceCache.get(story).indexOf(key) : -1;
}

const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const daypart = (hour) => (hour < 12 && hour >= 4 ? 'morning' : hour < 18 && hour >= 12 ? 'afternoon' : 'evening');

// ---------------------------------------------------------------- results and fixtures

/** SCORE CENTRE's title, from the stories' filing times and the airing time (§4). */
export function resultsTitle(rows, now, tz) {
  const air = clockIn(now, tz);
  const today = dayIn(now, tz).n;
  const days = rows.map((r) => dayIn(r.published, tz).n);
  if (air.weekday === 1 && air.hour < 14 && rows.every((r) => [0, 6].includes(dayIn(r.published, tz).weekday))) return "THE WEEKEND'S RESULTS";
  if (days.every((d) => d === today)) return "TODAY'S RESULTS";
  const lastNight = rows.every((r) => {
    const d = dayIn(r.published, tz);
    const h = clockIn(r.published, tz).hour;
    return (d.n === today - 1 && h >= 17) || (d.n === today && h < 2) || /\blast night\b/i.test(r.sentence || '');
  });
  if (air.hour < 14 && lastNight) return "LAST NIGHT'S RESULTS";
  return 'THE LATEST RESULTS';
}

/** The results SCORE CENTRE may show: from the last 24 hours (on a Monday morning since Saturday 06:00), one per match. */
export function freshResults(candidates, { now = Date.now(), tz = 'Europe/London' } = {}) {
  const air = clockIn(now, tz);
  const since = air.weekday === 1 && air.hour < 14 ? now - (dayIn(now, tz).n - dayIn(now - 2 * 24 * HOUR, tz).n) * 24 * HOUR - 18 * HOUR : now - 24 * HOUR;
  const out = [];
  for (const s of candidates || []) {
    if (!(Number(s.published) >= since) || isGrave(`${s.title}. ${s.summary || ''}`)) continue;
    for (const sl of s.scorelines || []) {
      const pair = [sl.a, sl.b].sort().join('|');
      if (!out.some((o) => [o.a, o.b].sort().join('|') === pair)) out.push({ ...sl, source: s.source });
    }
  }
  return out;
}

const SPORT_ORDER = ['football', 'rugby', 'american-football', 'basketball', 'baseball', 'ice-hockey', 'handball'];

/** The result lines in their groups: a sport's rows together (the most rows first), "Elsewhere" into the next sport. */
function resultText(rows, seed, recent) {
  const groups = new Map();
  for (const r of rows) groups.set(r.sport, [...(groups.get(r.sport) || []), r]);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || SPORT_ORDER.indexOf(a[0]) - SPORT_ORDER.indexOf(b[0]));
  const lines = [];
  const flat = [];
  ordered.forEach(([, list], g) => {
    list.forEach((r, i) => {
      const line = resultLine(r);
      lines.push(g > 0 && i === 0 ? `${pick(BANKS.elsewhere, `${seed}~e${g}`, recent)}${line}` : line);
      flat.push(r);
    });
  });
  return { text: lines.join(' '), rows: flat };
}

const whenPhrase = (f, now, tz) => {
  if (f.date) {
    const [y, m, d] = f.date.split('-').map(Number);
    const left = Math.round(Date.UTC(y, m - 1, d) / (24 * HOUR)) - dayIn(now, tz).n;
    if (left === 0) return 'Today';
    if (left === 1) return 'Tomorrow';
    if (left < 7) return `On ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
    return `On ${d} ${new Date(Date.UTC(y, m - 1, d)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
  }
  return /^(?:NEXT|LATER|IN THE)/.test(f.when) ? f.when[0] + f.when.slice(1).toLowerCase() : `In ${f.when[0]}${f.when.slice(1).toLowerCase()}`;
};
const titleCase = (event) => event.split(/\s+/).map((w) => (w === 'V' ? 'against' : /^(?:THE|OF|AND)$/.test(w) ? w.toLowerCase() : w[0] + w.slice(1).toLowerCase())).join(' ').replace(/^the\b/, 'the');

// ---------------------------------------------------------------- the stage

/**
 * Shape a FULL TIME episode in place (the producer's 'sport' stage). `candidates` are the prepared stories
 * (prepare.js); `recentLines` the station's lines of the last hours. Returns a note for the pipeline.
 */
export function shapeEpisode(episode, { candidates = [], program = {}, presenters = {}, channelName = 'GLOBIT 24', now = Date.now(), tz = 'Europe/London', recentLines = [], seed = '' } = {}) {
  let segs = episode.segments || [];
  const recent = new Set(recentLines.map((l) => String(l).replace(/\[[^\]]*\]\s*/g, '').trim()));
  recent.used = [];
  // a segment's words are edited with its gestures in place ([nod] stays where it was said)
  const edit = (seg, fn) => {
    const parsed = parseCues(fn(embedCues(String(seg.text || ''), seg.cues || [])), { grave: !!seg.heavy });
    seg.text = parsed.text;
    seg.cues = parsed.cues;
  };
  // no judgement of a real person from either writer (§3.4): every sentence of every segment, once more
  for (const seg of segs) if (seg.text) edit(seg, (t) => sentencesIn(t).map((x) => withoutJudgement(x)).filter(Boolean).join(' '));
  // a story told in its time: the lead in at most five sentences, every other story in three (§4's budgets)
  const sentencesMax = (seg, k) => (k === 0 ? 5 : 3);
  const byId = new Map(candidates.map((s) => [s.id, s]));
  // two stories about the same match or the same people are told one after the other, the second with a line that says
  // so ("Staying with that story."), never four stories apart (each story keeps the chats that follow it)
  {
    const first = segs.find((s) => s.type === 'intro');
    const last = segs.find((s) => s.type === 'outro');
    const blocks = [];
    for (const s of segs) {
      if (s === first || s === last) continue;
      if (s.type === 'story' || !blocks.length) blocks.push([s]);
      else blocks[blocks.length - 1].push(s);
    }
    const plain = (b) => b[0]?.type === 'story' && b[0].storyId && !b[0].feature && !b[0].roundup;
    const ordered = [];
    for (const b of blocks) {
      if (ordered.includes(b)) continue;
      ordered.push(b);
      if (!plain(b)) continue;
      for (const o of blocks) {
        if (ordered.includes(o) || !plain(o) || !sameEvent(byId.get(b[0].storyId), byId.get(o[0].storyId))) continue;
        o[0].follows = true;
        ordered.push(o);
      }
    }
    // AROUND THE GROUNDS: the lead's sport first, then each sport's stories together, in the order the writer met them
    // (a bulletin goes to the cricket once, not twice; the features keep their places at the end)
    const sportOf = (b) => (plain(b) ? byId.get(b[0].storyId)?.sport || null : null);
    const seen = [];
    for (const b of ordered) if (sportOf(b) && !seen.includes(sportOf(b))) seen.push(sportOf(b));
    const rank = (b, i) => (i === 0 ? -1 : sportOf(b) ? seen.indexOf(sportOf(b)) : seen.length);
    const grouped = ordered.map((b, i) => ({ b, i, r: rank(b, i) })).sort((x, y) => x.r - y.r || x.i - y.i).map((x) => x.b);
    segs = [first, ...grouped.flat(), last].filter(Boolean);
  }
  const title = program.title || 'FULL TIME';
  const A = presenters.A?.name || 'Kai Sprite';
  const B = String(presenters.B?.name || 'Rosa Rally').split(' ')[0];
  const air = clockIn(now, tz);
  const part = daypart(air.hour);

  // ---- the stories: strap tag, scoreline card where the presenter says the result, transitions, the moment
  const stories = segs.filter((s) => s.type === 'story' && s.storyId);
  const told = new Set();
  let prevSport = null;
  stories.forEach((seg, k) => {
    const story = byId.get(seg.storyId);
    if (!story) return;
    // a pick-up ("Thanks, Kai.") only answers a toss: after a story that did not hand over by name, it goes
    // THE NUMBER is Rosa's (§4): read by the writer's other presenter, it changes hands with its partner's gestures
    if (seg.feature === 'number' && seg.anchor === 'A' && presenters.B) {
      seg.anchor = 'B';
      edit(seg, (t) => t.replace(/\[(A|B):/g, (m, x) => `[${x === 'A' ? 'B' : 'A'}:`));
    }
    // the writer's hand-overs ("…relegation zone. Rosa?" / "Thanks, Rosa.") were made for its own order, which the
    // shape has changed: they go, and the shape hands over where the sport changes (below)
    edit(seg, (t) => t.replace(TOSS_END, ''));
    edit(seg, (t) => t.replace(/^((?:\[[^\]]+\]\s*)*)(?:thanks|thank you)(?: very much)?,?\s+\p{Lu}[\p{L}'’-]*\.\s*/iu, '$1'));
    // the strap's headline fits the programme's line (its words before a colon first)
    const max = program.headlineMax || 45;
    if (String(seg.headline || '').length > max) seg.headline = shortHeadline(String(seg.headline).split(/:\s+/)[0], max);
    edit(seg, (t) => {
      let parts = sentencesIn(t);
      // never a first sentence that leans on one the viewer did not hear ("On Tuesday they will oversee…"), nor a count
      // that points back to a sentence left out ("…in all six")
      const cue = /^((?:\[[^\]]+\]\s*)*)/;
      const bare = (x) => x.replace(cue, '');
      while (parts.length > 1 && LEANS_START.test(bare(parts[0]))) parts = [parts[0].match(cue)[1] + bare(parts[1]), ...parts.slice(2)];
      parts = parts.filter((x, j) => j === 0 || !leansOnCount(bare(x), bare(parts[j - 1])));
      // a sentence that follows on from the one the outlet wrote before it ("In the end, Piastri overtook…", "Brad
      // O'Neill also returns…") is said only after that one; told after another, its connective goes out of the
      // picture: a "but" or an "in the end" drops the sentence, an "also" drops the word
      const at = (x) => sourceIndex(story, bare(x));
      parts = parts.reduce((out, x, j) => {
        if (j === 0 || !out.length) return [...out, x];
        const here = at(x);
        const prev = at(out[out.length - 1]);
        const adjacent = here >= 0 && prev >= 0 && here === prev + 1;
        if (adjacent || here < 0) return [...out, x];
        if (FOLLOWS_ON_START.test(bare(x))) return out;
        if (ALSO_FIRST_CLAUSE.test(bare(x))) return [...out, x.replace(/^([^,;:.]{0,80}?)\s+also\b/i, '$1')];
        return [...out, x];
      }, []);
      return (parts.length > sentencesMax(seg, k) ? parts.slice(0, sentencesMax(seg, k)) : parts).join(' ');
    });
    if (story.sportTag) seg.kicker = story.sportTag;
    seg.sport = story.sport || null;
    const text = String(seg.text || '');
    const sl = (story.scorelines || []).find((r) => text.includes(String(r.a).split(' ').at(-1)) && text.includes(String(r.b).split(' ').at(-1)) && new RegExp(`\\b${r.sa}\\s*[-–]\\s*${r.sb}\\b|\\b${r.sb}\\s*[-–]\\s*${r.sa}\\b`).test(text));
    // (a result said anywhere is told: SCORE CENTRE does not read it again; THE NUMBER keeps its own board)
    if (sl) told.add([sl.a, sl.b].sort().join('|'));
    if (sl && !seg.roundup && seg.feature !== 'number') {
      seg.score = { a: sl.a, b: sl.b, sa: sl.sa, sb: sl.sb, winner: sl.winner, home: sl.home, draw: sl.draw, sport: sl.sport };
      told.add([sl.a, sl.b].sort().join('|'));
      if (k === 0 && !seg.heavy && !isGrave(`${story.title}. ${story.summary || ''}`)) seg.scoreSting = true;
    }
    // a line said first in a story, after a pick-up ("Thanks, Rosa.") when there is one
    const lead = (line) => edit(seg, (t) => {
      const parts = sentencesIn(t);
      const at = parts.length && /^(?:\[[^\]]+\]\s*)*(?:thanks|thank you)\b[^.]*\.$/i.test(parts[0].trim()) ? 1 : 0;
      parts.splice(at, 0, line);
      return parts.join(' ');
    });
    if (seg.feature === 'lighter') {
      // the moment of the day: its own words in place of "And finally"
      edit(seg, (t) => t.replace(/(^|\.\s+)((?:\[[^\]]+\]\s*)*)and finally(?: tonight| today| this evening)?\s*[,:]?\s*(\p{L})/iu, (m, pre, cues, c) => `${pre}${cues}${c.toUpperCase()}`));
      lead(pick(BANKS.moment, `${seed}~m${seg.storyId}`, recent));
      seg.kicker = 'MOMENT OF THE DAY';
    } else if (k > 0 && seg.follows) {
      lead(pick(BANKS.follow, `${seed}~f${seg.storyId}`, recent));
    } else if (k > 0 && seg.feature !== 'number' && story.sport && story.sport !== prevSport) {
      // AROUND THE GROUNDS: a transition when the sport changes
      // a change of presenter with the sport: the one who read the last story hands over by name ("Rosa has the
      // rugby."), which says the sport; else the presenter says it ("Some rugby.")
      const before = segs[segs.indexOf(seg) - 1];
      const to = presenters[seg.anchor]?.name ? String(presenters[seg.anchor].name).split(' ')[0] : null;
      if (before?.type === 'story' && before.anchor !== seg.anchor && to && SPORT_NAME[story.sport] && !before.heavy && !seg.heavy) {
        const line = fill(pick(BANKS.handover, `${seed}~h${seg.storyId}`, recent), { N: to, S: SPORT_NAME[story.sport] });
        edit(before, (t) => `${t} [look_partner] ${line}`);
      } else lead(pick(BANKS.transition[story.sport] || BANKS.transition.other, `${seed}~t${seg.storyId}`, recent));
    }
    if (seg.feature === 'number') seg.kicker = 'THE NUMBER';
    prevSport = story.sport || prevSport;
  });

  // ---- SCORE CENTRE and COMING UP
  const results = freshResults(candidates, { now, tz }).filter((r) => !told.has([r.a, r.b].sort().join('|'))).slice(0, 6);
  const fixtures = [];
  for (const s of candidates) for (const f of s.fixtures || []) if (!fixtures.some((x) => x.event === f.event)) fixtures.push({ ...f, source: s.source });
  fixtures.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  const matchday = (air.weekday === 6 && air.hour >= 15) || air.weekday === 0 || (air.weekday === 1 && air.hour < 10) || results.length >= 4;
  const preview = !matchday && ((air.weekday === 5 && air.hour >= 6) || (air.weekday === 6 && air.hour < 14)) && fixtures.length >= 3 && results.length < 3;
  const shape = matchday ? 'MATCHDAY' : preview ? 'PREVIEW' : 'MIDWEEK';
  const sources = (rows) => {
    const list = [...new Set(rows.map((r) => r.source).filter(Boolean))];
    return list.length && list.length <= 2 ? list.join(' / ') : channelName;
  };
  let scoreCentre = null;
  if (results.length >= 3) {
    const { text, rows } = resultText(results, seed, recent);
    const rTitle = resultsTitle(rows, now, tz);
    const today = dayIn(now, tz).n;
    scoreCentre = {
      type: 'story', anchor: 'A', emotion: 'neutral', storyId: rows[0].storyId, feature: 'scores', kicker: 'SCORE CENTRE',
      headline: rTitle[0] + rTitle.slice(1).toLowerCase().replace(/'s\b/, "'s"), source: sources(rows), hasImage: false, category: 'sport', cues: [],
      text: `${pick(BANKS.results[shape], `${seed}~r`, recent)} ${text}`,
      scores: rows.map((r) => ({ a: r.a, b: r.b, sa: r.sa, sb: r.sb, winner: r.winner, home: r.home, draw: r.draw, sport: r.sport, ...(dayIn(r.published, tz).n !== today ? { day: SHORT_DAY[dayIn(r.published, tz).weekday] } : {}) })),
      scoresTitle: rTitle,
    };
  }
  let comingUp = null;
  const ahead = fixtures.slice(0, 3);
  if (ahead.length >= 2) {
    const weekend = shape === 'PREVIEW' && ahead.every((f) => f.date && [5, 6, 0].includes(new Date(`${f.date}T12:00:00Z`).getUTCDay()));
    const cTitle = weekend ? 'THE WEEKEND AHEAD' : 'COMING UP';
    // read as a calendar is spoken: "Tomorrow, it's Starfield City against Glimmerford. On Thursday, Bitport Comets
    // against Lanternhill Lynx. And on Friday, Harbourside Hawks against Ironvale Giants."
    const lines = ahead.map((f, i) => {
      const when = whenPhrase(f, now, tz);
      const what = titleCase(f.event).replace(/^./, (c) => c.toUpperCase());
      const w = i > 0 && i === ahead.length - 1 ? `And ${when[0].toLowerCase()}${when.slice(1)}` : when;
      return `${w}, ${i === 0 && / against /.test(what) ? "it's " : ''}${what}.`;
    });
    comingUp = {
      type: 'story', anchor: 'A', emotion: 'neutral', storyId: ahead[0].storyId, feature: 'fixtures', kicker: cTitle,
      headline: weekend ? 'The weekend ahead' : 'Coming up', source: sources(ahead), hasImage: false, category: 'sport', cues: [],
      text: `${pick(BANKS.comingUp[cTitle], `${seed}~c`, recent)} ${lines.join(' ')}`,
      fixtures: ahead.map((f) => ({ event: f.event, when: f.when, date: f.date, sport: f.sport })),
    };
  }

  // ---- order by shape: each story keeps the chats that follow it
  const intro = segs.find((s) => s.type === 'intro');
  const outro = segs.find((s) => s.type === 'outro');
  const blocks = [];
  for (const s of segs) {
    if (s === intro || s === outro) continue;
    if (s.type === 'story' || !blocks.length) blocks.push([s]);
    else blocks[blocks.length - 1].push(s);
  }
  // (the lead keeps the stories that follow it on: "More on that now" comes before SCORE CENTRE, never after it)
  let leadEnd = 1;
  while (blocks[leadEnd]?.[0]?.follows) leadEnd++;
  const lead = blocks.slice(0, leadEnd).flat();
  const isFeature = (b, f) => b[0]?.feature === f;
  const middle = blocks.slice(leadEnd).filter((b) => !isFeature(b, 'number') && !isFeature(b, 'lighter'));
  const number = blocks.find((b) => isFeature(b, 'number'));
  const moment = blocks.find((b) => isFeature(b, 'lighter'));
  const order = [];
  if (shape === 'PREVIEW' && comingUp) order.push([comingUp]);
  order.push(lead);
  if (shape === 'MATCHDAY' && scoreCentre) order.push([scoreCentre]);
  order.push(...middle);
  if (shape !== 'MATCHDAY' && scoreCentre) order.push([scoreCentre]);
  if (number && shape === 'MIDWEEK') order.push(number);
  else if (number) order.push(number);
  if (moment) order.push(moment);
  if (shape !== 'PREVIEW' && comingUp) order.push([comingUp]);

  // ---- greeting and hello, sign-off
  const greeting = fill(pick(BANKS.greeting[part], `${seed}~g`, recent), { title, A });
  if (intro) {
    // the headlines stay; the writer's greeting (from its first "Good morning", "Hello", "Welcome", "This is", "I'm" or
    // the programme's name) gives way to the greeting for the hour
    // (and the headlines are three different stories in the shape's order: never the match and its reaction both)
    edit(intro, (t) => {
      const parts = sentencesIn(t);
      const at = parts.findIndex((x) => /\b(?:good (?:morning|afternoon|evening)|hello|welcome|this is|I['’]m)\b/i.test(x) || x.includes(title));
      let heads = at < 0 ? parts : parts.slice(0, at);
      // (the strongest first, as the desk ranked them, whatever the sport order on air)
      const onAir = order.flat().filter((x) => x.type === 'story' && x.storyId && !x.follows && !x.feature && byId.has(x.storyId));
      const rankOf = (x) => candidates.findIndex((c) => c.id === x.storyId);
      const pool = [...onAir].sort((a, b) => rankOf(a) - rankOf(b));
      const chosen = [];
      for (const x of pool) {
        if (chosen.length >= heads.length) break;
        if (!chosen.some((c) => sameEvent(byId.get(c.storyId), byId.get(x.storyId)))) chosen.push(x);
      }
      const words = (w) => new Set(String(w || '').toLowerCase().match(/[\p{L}\d]{4,}/gu) || []);
      if (chosen.length === heads.length) {
        heads = chosen.map((x) => {
          const tw = words(byId.get(x.storyId).title);
          return heads.find((h) => [...words(h)].filter((w) => tw.has(w)).length >= 3) || `${shortHeadline(String(byId.get(x.storyId).title).split(/:\s+/)[0], 60).replace(/[.!?]*$/, '')}.`;
        });
      }
      return `${heads.join(' ')} [nod] ${greeting}`.trim();
    });
  }
  const hello = { type: 'chat', anchor: 'B', emotion: 'neutral', cues: [], text: pick(BANKS.hello, `${seed}~h`, recent) };
  const lastStory = order.flat().filter((s) => s.type === 'story').at(-1);
  const grave = lastStory && byId.get(lastStory.storyId) && isGrave(`${byId.get(lastStory.storyId).title}`);
  if (outro) edit(outro, () => fill(pick(BANKS.signoff[part], `${seed}~s`, recent), { title, B, channel: channelName }).replace(grave ? /\[wave\]/g : /$^/, '[nod]'));
  const hello0 = hello.text;
  edit(hello, () => hello0);
  for (const seg of [scoreCentre, comingUp]) if (seg) edit(seg, (t) => t);

  episode.segments = [intro, hello, ...order.flat(), outro].filter(Boolean);
  // a "Still to come" stands only while what it promises is still to come and not the very next thing on air
  const words = (t) => String(t || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\d ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  episode.segments = episode.segments.filter((c, i, all) => {
    if (c.type !== 'chat' || !/^(?:\[[^\]]*\]\s*)*still to come\b/i.test(String(c.text || ''))) return true;
    const key = words(String(c.text).replace(/^.*?still to come\s*:?\s*/i, '')).split(' ').slice(0, 6).join(' ');
    // (the promise is a story's headline or its words)
    const at = all.findIndex((x) => x.type === 'story' && key && [x.text, x.headline, byId.get(x.storyId)?.title].some((w) => words(w).includes(key)));
    // (and something to wait for: at least two stories before it, never the next but one)
    const between = all.slice(i + 1, at).filter((x) => x.type === 'story').length;
    return at > i && between >= 2;
  });
  episode.storyIds = [...new Set(episode.segments.filter((s) => s.storyId).map((s) => s.storyId))];
  episode.sport = { shape, results: scoreCentre ? scoreCentre.scores.length : 0, fixtures: comingUp ? comingUp.fixtures.length : 0 };
  episode.segments = episode.segments.filter((s) => s.type !== 'story' || String(s.text || '').trim());
  return { shape, results: episode.sport.results, fixtures: episode.sport.fixtures, lines: recent.used };
}

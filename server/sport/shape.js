// FULL TIME's shape (docs/programmes/full-time.md §4–5): after the writer has told the stories and the validator has
// checked them, the programme takes its form for the day and the hour. MATCHDAY, MIDWEEK or PREVIEW; SCORE CENTRE (the
// results the stories state with certainty, on the stadium's scoreboard); COMING UP (the dated events ahead); the
// greeting for the hour and Rosa's hello; a transition into each sport; the moment of the day; the sign-off; the
// strap's sport tag and the scoreline card on a story whose presenter says its result.
import { isGrave, pointsBack, sentencesIn } from '../facts.js';
import { embedCues, parseCues } from '../../public/js/cues.js';
import { dayIn, withoutJudgement } from './words.js';
import { FOLLOWS_ON_START, leansOnCount, sameEvent } from './prepare.js';
import { resultLine, chalkOf } from './scores.js';
import { sportLeans } from './leans.js';
import { hasFiniteVerb, shortHeadline } from '../writer.js';

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
  // (both presenters named, as every two-handed programme on the channel greets: a first-time viewer meets Rosa before
  // she speaks; {R} is her full name)
  greeting: {
    morning: ['Good morning, and welcome to {title}. I\'m {A}, with {R}.', 'Good morning. This is {title}, the day in sport. I\'m {A}, and with me is {R}.', 'A very good morning to you. I\'m {A}, with {R}, and this is {title}.', 'Morning, and welcome to {title}. I\'m {A}, alongside {R}.', 'Good morning. I\'m {A}, with {R}, and here is the day in sport on {title}.', 'Hello, and good morning. This is {title}. I\'m {A}, and {R} is with me.'],
    afternoon: ['Good afternoon, and welcome to {title}. I\'m {A}, with {R}.', 'Good afternoon. This is {title}, the day in sport. I\'m {A}, and with me is {R}.', 'Hello, and welcome to {title} this afternoon. I\'m {A}, alongside {R}.', 'Good afternoon. I\'m {A}, with {R}, and this is {title}.', 'Afternoon, everyone, and welcome to {title}. I\'m {A}, with {R}.', 'Hello. This is {title}. I\'m {A}, and {R} is with me. Good afternoon.'],
    evening: ['Good evening, and welcome to {title}. I\'m {A}, with {R}.', 'Good evening. This is {title}, the day in sport. I\'m {A}, and with me is {R}.', 'Hello and good evening. I\'m {A}, with {R}, and this is {title}.', 'A very good evening. This is {title}. I\'m {A}, and {R} is with me.', 'Evening, everyone, and welcome to {title}. I\'m {A}, alongside {R}.', 'Good evening. I\'m {A}, with {R} and the day in sport on {title}.'],
  },
  // Rosa's hello: to Kai and the viewer, by the hour, never a filler with nothing in it ("Hello. Let's get started.", read as
  // clunky on the first real matchday, 17 Oct); {K} is Kai's first name. A results day has its own (MATCHDAY with SCORE CENTRE).
  hello: {
    morning: ['[nod] Morning, {K}. Morning, everyone.', '[nod] Good morning, {K}. Good morning, all.', '[nod] Morning, {K}. Good to be with you all.', '[nod] Good morning, everyone. Glad you could join us.'],
    afternoon: ['[nod] Afternoon, {K}. Afternoon, everyone.', '[nod] Good afternoon, {K}. Good afternoon, all.', '[nod] Afternoon, {K}. Good to be with you all.', '[nod] Good afternoon, everyone. Glad you could join us.'],
    evening: ['[nod] Evening, {K}. Evening, everyone.', '[nod] Good evening, {K}. Good evening, all.', '[nod] Evening, {K}. Good to be with you all.', '[nod] Good evening, everyone. Glad you could join us.'],
    any: ['[nod] Hello, {K}. Hello, everyone.', '[nod] Hi, {K}. Good to be with you all.', '[nod] Hello, everyone. Plenty to talk about.', '[nod] Hello, {K}. A lot to get through.', '[nod] Hi, everyone. Good to see you.', '[nod] Hello, {K}. Hello to you at home.', '[nod] Hello, all. Plenty to get our teeth into.', '[nod] Hi, {K}. Hello, everyone.'],
    results: ['[nod] Hello, {K}. A lot of results to get through.', '[nod] Hello, everyone. Plenty of scores to come.', '[nod] Hi, {K}. Some results to go through.', '[nod] Hello, all. A full set of scores for you.'],
  },
  results: {
    MATCHDAY: ['[point_screen] Now, the results.', '[point_screen] Let\'s run through the results.', '[point_screen] To the scores.', '[point_screen] Here are the results.', '[point_screen] The results now.', '[point_screen] Let\'s go through the scores.', '[point_screen] Time for the results.', '[point_screen] The scores, then.'],
    MIDWEEK: ['[point_screen] A look at the latest results.', '[point_screen] The latest scores.', '[point_screen] Some results now.', '[point_screen] Now, the scores.', '[point_screen] Here are the latest results.', '[point_screen] The results so far.', '[point_screen] To the latest scores.', '[point_screen] A few results now.'],
    PREVIEW: ['[point_screen] Before we look ahead, the latest results.', '[point_screen] First, the latest scores.', '[point_screen] The latest results first.', '[point_screen] Before the weekend, the scores so far.', '[point_screen] A look back at the latest results first.', '[point_screen] First, some results.'],
  },
  elsewhere: ['Elsewhere, ', 'Meanwhile, ', 'And elsewhere, '],
  // (each a whole spoken line: never a bare "In tennis." that waits for a clause it does not get; never a "Some basketball."
  // or a "Something else now.", read as clunky on the first real matchday, 17 Oct: each names its sport as a presenter would)
  transition: {
    football: ['Football now.', 'To the football.', 'Now to the football.', 'On to the football.', 'Football next.', 'Turning to the football.'],
    f1: ['To the track now.', 'Formula One now.', 'To Formula One.', 'Motor racing now.', 'Now to Formula One.', 'Formula One next.'],
    tennis: ['Tennis now.', 'To the tennis.', 'On the court now.', 'Tennis next.', 'Now to the tennis.', 'To the courts.'],
    cricket: ['Cricket now.', 'To the cricket.', 'Now to the cricket.', 'On to the cricket.', 'Cricket next.', 'Turning to the cricket.'],
    rugby: ['Rugby now.', 'To the rugby.', 'Now to the rugby.', 'On to the rugby.', 'Rugby next.', 'Turning to the rugby.'],
    // (rugby's two codes when the edition has both, or the story's code is league: the viewer hears which game it is)
    'rugby-league': ['Rugby league now.', 'To the rugby league.', 'Now to rugby league.', 'On to the rugby league.', 'Rugby league next.', 'Turning to rugby league.'],
    'rugby-union': ['Rugby union now.', 'To the rugby union.', 'Now to rugby union.', 'On to the rugby union.', 'Rugby union next.', 'Turning to rugby union.'],
    'american-football': ['American football now.', 'To the NFL.', 'The NFL next.', 'Across the Atlantic, to American football.', 'The NFL now.', 'American football next.'],
    basketball: ['Basketball now.', 'To the basketball.', 'On the court now.', 'Now to the basketball.', 'On to the basketball.', 'Basketball next.'],
    baseball: ['Baseball now.', 'To the baseball.', 'Now to the baseball.', 'On to the baseball.', 'Across the Atlantic, to baseball.', 'Baseball next.'],
    boxing: ['To the ring now.', 'Boxing now.', 'Now to the boxing.', 'To the boxing.', 'On to the boxing.', 'Boxing next.'],
    cycling: ['Cycling now.', 'To the cycling.', 'Now to the cycling.', 'On to the cycling.', 'On two wheels now.', 'Cycling next.'],
    golf: ['Golf now.', 'To the golf.', 'Now to the golf.', 'On to the golf.', 'On the course now.', 'Golf next.'],
    athletics: ['Athletics now.', 'To the track.', 'Now to the athletics.', 'On to the athletics.', 'Athletics next.', 'On the track now.'],
    racing: ['Racing now.', 'To the racing.', 'Horse racing now.', 'Now to the racing.', 'On to the racing.', 'To the races now.'],
    darts: ['Darts now.', 'To the darts.', 'Now to the darts.', 'On to the darts.', 'Darts next.', 'To the oche now.'],
    snooker: ['Snooker now.', 'To the snooker.', 'Now to the snooker.', 'On to the snooker.', 'Snooker next.', 'To the baize now.'],
    'ice-hockey': ['Ice hockey now.', 'To the ice hockey.', 'Now to the ice hockey.', 'On to the ice hockey.', 'Ice hockey next.', 'On the ice now.'],
    other: ['Elsewhere in sport.', 'Away from the big leagues.', 'Another sport now.', 'Elsewhere now.', 'To another sport now.', 'And elsewhere in sport.'],
  },
  // Kai asks for one of Rosa's memories when the edition has no moment of the day
  memoryAsk: ['[look_partner] Before we go, {B}, one from your playing days?', '[look_partner] {B}, anything from the old days before we go?', '[lean_in] Any memories for us today, {B}?', '[look_partner] One from your career before we finish, {B}?', '[look_partner] {B}, a story from your playing days to end on?', '[lean_in] Anything from the archive, {B}?', '[look_partner] Before we finish, {B}, how was your week as a player?', '[look_partner] {B}, one for the road?'],
  // a presenter hands the next sport to the other ("Rosa has the rugby.")
  handover: ['{N} has {S}.', 'Over to {N} for {S}.', '{N} now, with {S}.', 'Here\'s {N} with {S}.', '{N} is here with {S}.', 'For {S}, here\'s {N}.', '{N} takes us to {S}.', 'And {N} has {S}.'],
  // a second story about the same match or the same people, straight after the first
  follow: ['Staying with that story.', 'More on that now.', 'There is more on that one.', 'Staying with that one.', 'And there is more on that.', 'More from that one.', 'Still with that one.', 'There is more to that story.', 'Staying there for a moment.'],
  moment: ['Our moment of the day.', 'Now, the moment of the day.', 'Time for the moment of the day.', 'The moment of the day.', 'Here is our moment of the day.', 'And now, the moment of the day.', 'Our moment of the day now.', 'Today\'s moment.'],
  comingUp: {
    'COMING UP': ['[point_screen] Coming up in sport.', '[point_screen] A look at what is coming up.', '[point_screen] What is still to come.', '[point_screen] Some dates for the diary.', '[point_screen] Coming up.', '[point_screen] What to look out for.'],
    'THE WEEKEND AHEAD': ['[point_screen] The weekend ahead.', '[point_screen] A look at the weekend ahead.', '[point_screen] What the weekend holds.', '[point_screen] Coming up this weekend.'],
  },
  signoff: {
    morning: ['That\'s {title}. [nod] From {B} and from me, enjoy your day. Stay with us on {channel}.', 'That\'s {title} for this morning. [nod] Thanks for watching. Stay with us on {channel}.', 'And that\'s {title}. [nod] From {B} and me, have a good day.', 'That\'s all from {title} this morning. [nod] More sport later on {channel}.', 'And that\'s the morning\'s sport. [nod] From {B} and me, see you later on {channel}.', 'That\'s {title}. [nod] Thanks for starting your day with us.'],
    afternoon: ['That\'s {title}. [nod] From {B} and from me, thanks for watching. Stay with us on {channel}.', 'That\'s {title} this afternoon. [nod] Thanks for your company.', 'And that\'s {title}. [nod] More sport later on {channel}.', 'That\'s all from {title} this afternoon. [nod] From {B} and me, see you later.', 'And that\'s the afternoon\'s sport. [nod] Stay with us on {channel}.', 'That\'s {title}. [nod] Thanks for watching, from {B} and from me.'],
    evening: ['That\'s {title}. [nod] From {B} and from me, good night, and stay with us on {channel}.', 'That\'s {title} for this evening. [nod] Thanks for watching.', 'And that\'s {title}. [nod] From {B} and me, thanks for your company tonight.', 'That\'s all from {title}. [nod] More sport around the clock on {channel}.', 'And that\'s the evening\'s sport. [nod] From {B} and me, good night.', 'That\'s {title} tonight. [nod] Stay with us on {channel}.'],
  },
};

// Rosa's (fictional) memories of her playing days and Kai's reply, after the moment of the day, or before the sign-off
// of an edition that has none (Kai asks for one). No real club, match, stadium or player; each once in the station's
// recent lines.
export const ROSA_MEMORIES = [
  // (no figures in them: a chat may say no number its stories do not, so "eleven minutes" would never air)
  ['[shrug] I once missed a penalty in a cup final. Nobody here mentions it.', '[nod] We mention it every week, Rosa.'],
  ['[chin] I scored from the halfway line once. In training. It still counts.', '[shake_head] It does not count.'],
  ['[nod] My first coach said I ran like a filing cabinet. A fast filing cabinet.', '[nod] High praise.'],
  ['[shrug] I played a whole match in odd boots once. We won. I wore them all season.', '[nod] That is science.'],
  ['[nod] I still have the shirt from my debut. It no longer fits. Neither do the shorts.', '[nod] Too much detail, Rosa.'],
  ['[shrug] We trained in the rain every winter. I think I am still drying out.', '[nod] It shows.'],
  ['[chin] My mum came to every game. She mostly watched the other team\'s goalkeeper.', '[nod] Tactical.'],
  ['[nod] I once did a lap of honour after a draw. Nobody joined me.', '[nod] A brave lap.'],
  ['[shrug] I took a corner once that went out for a throw-in. It is on the internet somewhere.', '[nod] I will find it.'],
  ['[chin] I captained my country once. Briefly. The captain was tying his laces.', '[nod] A proud moment.'],
  ['[nod] I scored an own goal on my debut, then scored at the right end. Balance.', '[nod] Very balanced.'],
  ['[shrug] I was the fastest in my team at the start of every season. By October, not so much.', '[nod] Every October, Rosa.'],
];

// Rosa needling Kai about his own (fictional) sporting past, and his reply (the bible's chemistry: never a real club,
// match or player, never a person who exists); in the same slots as her memories
export const ROSA_NEEDLES = [
  ['[look_partner] Kai played in goal once. The ball still has not forgiven him.', '[nod] It was a very fast ball.'],
  ['[shrug] Kai says he was a sprinter at school. His school has no record of it.', '[shake_head] My school has a short memory.'],
  ['[look_partner] Kai still has his medal for taking part. He polishes it.', '[nod] Every Sunday.'],
  ['[shrug] Kai ran a marathon once. Well, the first mile of one.', '[nod] It was a very good mile.'],
  ['[look_partner] Kai tried rowing once. The boat went round in a circle.', '[nod] A perfect circle, Rosa.'],
  ['[shrug] Kai was picked last for football at school. Every week.', '[nod] Consistency is a skill.'],
  ['[look_partner] Kai says he can still do keepy-uppies. I counted. It is three.', '[nod] Three good ones.'],
  ['[shrug] Kai tried to dunk once. The hoop is still waiting.', '[nod] One day.'],
  ['[look_partner] Kai calls cycling to work training. It is downhill.', '[nod] Both ways, somehow.'],
  ['[shrug] Kai played golf once. He found every bunker on the course.', '[nod] I was thorough.'],
  ['[look_partner] Kai bought running shoes in January. They are still in the box.', '[nod] They are resting.'],
  ['[shrug] Kai says he once had a trial at a big club. It was the stadium tour.', '[nod] I signed the visitors\' book.'],
];

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

// a story that is no place for a joke after it: a misconduct charge, a court, a ban, a death, an injury that ends a career
const SERIOUS = /\b(?:sexist|racist|racism|abuse|abused|assault|court|charged|charge|banned|ban|suspended|probe|investigation|inquiry|died|dies|death|funeral|tribute|retire[sd]? (?:through|due to) injury|arrest\w*|convicted|jailed|misconduct|disciplinary|sacked)\b/i;
const bare = (t) => String(t || '').replace(/\[[^\]]*\]\s*/g, '').trim();
// a sport as a hand-over names it
const SPORT_NAME = { football: 'the football', f1: 'the Formula One', rugby: 'the rugby', 'rugby-league': 'the rugby league', 'rugby-union': 'the rugby union', cricket: 'the cricket', tennis: 'the tennis', 'american-football': 'the NFL', basketball: 'the basketball', baseball: 'the baseball', boxing: 'the boxing', cycling: 'the cycling', golf: 'the golf', athletics: 'the athletics', racing: 'the racing', darts: 'the darts', snooker: 'the snooker', 'ice-hockey': 'the ice hockey' };
/**
 * A story's sport as the running order speaks of it: rugby league is its own ("Rugby league now.", "Over to Rosa for the rugby
 * league."), and on an edition that has both codes rugby union says so too; any other sport is itself.
 */
export function sportKey(story, bothCodes = false) {
  if (story?.sport !== 'rugby') return story?.sport || null;
  if (story.code === 'league') return 'rugby-league';
  return story.code === 'union' && bothCodes ? 'rugby-union' : 'rugby';
}
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

// ---- a result story's own result, and the whole names of its people (17 Oct, the first real matchday)

/** The result a story is about: the one the desk read from its headline in words, else one with a team its headline names. */
export function ownResult(story) {
  const sls = story?.scorelines || [];
  const title = String(story?.title || '');
  const named = (n) => new RegExp(`(?<![\\p{L}])${String(n).split(' ').at(-1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(title);
  return sls.find((sl) => sl.paired) || sls.find((sl) => named(sl.a) || named(sl.b)) || null;
}
// the score put into a sentence that says the result in words: "Connacht beat Saracens in…" -> "Connacht beat Saracens 45-36
// in…", "Dundee United drew with St Johnstone" -> "…drew 1-1 with St Johnstone"; null when the sentence has no such phrase
const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WIN_VERB = '(?:beat|beats|defeated|defeat|edged|edge|thrashed|thrash|stunned|stun|overcame|overcome|hammered|hammer|downed|routed|crushed|saw off|see off)';
export function scoreInto(t, sl) {
  const last = (n) => escRe(String(n || '').split(' ').at(-1));
  if (!sl || !t) return null;
  const out = sl.draw
    ? String(t).replace(new RegExp(`(\\b${last(sl.a)}\\b[^.;:]*?\\bdrew)(\\s+(?:with|against)\\s+(?:[\\p{Lu}][\\p{L}'’.-]*\\s+){0,3}?${last(sl.b)})(?![\\p{L}])`, 'u'), `$1 ${sl.sa}-${sl.sb}$2`)
    : String(t).replace(new RegExp(`(\\b${last(sl.winner)}\\b[^.;:]*?\\b${WIN_VERB}\\s+(?:the\\s+)?(?:[\\p{Lu}][\\p{L}'’.-]*\\s+){0,3}?${last(sl.loser)})(?![\\p{L}'’])`, 'u'), `$1 ${Math.max(sl.sa, sl.sb)}-${Math.min(sl.sa, sl.sb)}`);
  return out !== String(t) ? out : null;
}
const WOMEN_SAID = /\b(?:women|women's|womens|woman|female|ladies|girls|WSL|NWSL|WNBA|WXV|Lionesses|Matildas|Red Roses|Black Ferns|Wildcats|she|her)\b/i;
const NAME_ADJUNCT = /^(\p{Lu}\p{Ll}+)\s+(\p{Lu}[\p{L}’'-]+)(\s+(?:double|brace|hat-trick|treble|equaliser|equalizer|winner|goal|strike|header|penalty|stunner|try|own goal)\b)/u;
const saysScore = (t, sl) => !!sl &&new RegExp(`\\b(?:${sl.sa}\\s*[-–]\\s*${sl.sb}|${sl.sb}\\s*[-–]\\s*${sl.sa})\\b`).test(String(t));
const RESULT_WORDS = /\b(?:beat|beats|beaten|won|win|wins|victory|triumph|defeat|defeated|lost|lose|draw|drew|held|point|thrashed|edged|stunned|came from behind|comeback)\b/i;

/**
 * A story's text with each person's first mention said whole, as the outlet gives the name (`people`: { surname: given },
 * prepare.js peopleIn): "Loughnane, 20, has become…" is "Billy Loughnane, 20, has become…". Never inside a quotation, never
 * a name already said whole or after another capitalised word ("Sonay Kartal", "Neil McCann's side").
 */
export function fullNames(text, people) {
  let out = String(text || '');
  for (const [sur, given] of Object.entries(people || {})) {
    const re = new RegExp(`(?<![\\p{L}’'-])${sur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu');
    let first = null;
    for (const m of out.matchAll(re)) {
      // (outside a quotation: an even count of quotation marks before it)
      const before = out.slice(0, m.index);
      if (((before.match(/["“”]/g) || []).length % 2) === 1) continue;
      first = m;
      break;
    }
    if (!first) continue;
    const before = out.slice(0, first.index);
    // (a possessive before it is no first name: "Bills' Allen finally gets over hump" is "Bills' Josh Allen…")
    if ((/\p{Lu}[\p{L}’'-]*\s+$/u.test(before) && !/['’]s?\s+$/u.test(before)) || new RegExp(`${given}\\s+$`).test(before)) continue;
    out = `${before}${given} ${out.slice(first.index)}`;
  }
  return out;
}

// a headline that is only a quotation ("'I let the team down'"): Kai would say it in the first person
const QUOTE_ONLY = /^\s*[‘'“"][^‘'“"]+[’'”"]\s*$/u;
// a title as a strap or a headline says it: the words after a quotation that opens it ("'I let the team down' - Norris
// accepts blame for Piastri collision"), its words before a colon, without an aside between its subject and its verb
// ("Bills' Allen, 0-7 in OT games entering MNF, finally gets over hump in wild win", ESPN 13 Oct)
function strapTitle(title) {
  let t = String(title || '').trim();
  const q = /^[‘'“"][^‘'“"]+[’'”"]\s*[-–—:]\s*(.+)$/u.exec(t);
  if (q) t = q[1];
  t = t.split(/:\s+/)[0];
  return t.replace(/^([^,]{3,40}), [^,]{3,50}, (?=\p{Ll})/u, '$1 ');
}

/**
 * A strap that is the title cut off inside its aside: "Bills' Allen, 0-7 in OT games entering MNF" from "Bills' Allen,
 * 0-7 in OT games entering MNF, finally gets over hump in wild win" (ESPN 13 Oct) names the record the story ends,
 * not the news; the strap is made again from the title without its aside.
 */
export function cutInAside(headline, title) {
  const h = String(headline || '').replace(/[\s.,;:]+$/, '');
  const t = String(title || '');
  if (!h || h.length >= t.length || !t.startsWith(h) || !/^\s*,/.test(t.slice(h.length))) return false;
  return strapTitle(t) !== t && h.includes(',');
}

// where a title may be cut and still say a whole thing: before a comma or a dash, a clause it adds ("as …", "after …"), or a
// phrase of place, time or manner ("in …", "since …"); never inside an infinitive or a verb's object ("… fight | to save
// their World Cup", "… helps Kilmarnock beat | fellow-strugglers Motherwell")
const STRAP_BOUNDARY = /^\s*(?:[,;:–—|-]|(?:as|after|while|when|but|despite|amid|before|because|if|with|without|in|at|for|on|since|from|over|against|by|following|ahead of|during)\b)/i;
const norm = (t) => String(t || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
/**
 * A strap that is its title cut off inside a thought: the title goes on after it with words of the same clause ("McDermott
 * seeks fix as England fight" from "McDermott seeks fix as England fight to save their World Cup", BBC Sport 17 Oct).
 */
export function cutMidThought(strap, title) {
  const h = norm(strap).replace(/[\s.,;:]+$/, '');
  const t = norm(strapTitle(title));
  if (!h || h.length >= t.length || !t.toLowerCase().startsWith(h.toLowerCase())) return false;
  const rest = t.slice(h.length);
  return !/^\s/.test(rest) && !/^[,;:]/.test(rest) ? true : !STRAP_BOUNDARY.test(rest);
}
/** The strap cut back to the end of its last whole clause ("McDermott seeks fix"), else the title whole (two lines). */
export function wholeThought(strap, title) {
  const h = norm(strap).replace(/[\s.,;:]+$/, '');
  const cuts = [...h.matchAll(/(?:\s+[–—-]\s+|[,;:]\s+|\s+(?=(?:as|after|while|when|but|despite|amid|before|because|if|with)\s))/gi)].map((m) => m.index).filter((i) => h.slice(0, i).split(/\s+/).length >= 2);
  return cuts.length ? h.slice(0, cuts.at(-1)).trim() : norm(strapTitle(title));
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
  // (last night's only for results filed late or said so; Saturday's 3pm results reported by 18:40 were yesterday's, never
  // "last night's", on the Sunday morning, 17 Oct)
  const lastNight = rows.every((r) => {
    const d = dayIn(r.published, tz);
    const h = clockIn(r.published, tz).hour;
    return (d.n === today - 1 && h >= 20) || (d.n === today && h < 2) || /\blast night\b/i.test(r.sentence || '');
  });
  if (air.hour < 14 && lastNight) return "LAST NIGHT'S RESULTS";
  if (days.every((d) => d === today - 1)) return "YESTERDAY'S RESULTS";
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

/** The dated events ahead the desk's stories name, one per event, soonest first (today's only in the morning: by the
 * afternoon a game "today" may be on or over, and the channel does not know which). */
export function fixturesAhead(candidates, now = Date.now(), tz = 'Europe/London') {
  const air = clockIn(now, tz);
  const todayN = dayIn(now, tz).n;
  const dayOf = (f) => (f.date ? Math.round(Date.parse(`${f.date}T00:00:00Z`) / (24 * HOUR)) : null);
  const fixtures = [];
  for (const s of candidates || []) for (const f of s.fixtures || []) if (!fixtures.some((x) => x.event === f.event) && !(dayOf(f) === todayN && air.hour >= 12) && !(dayOf(f) !== null && dayOf(f) < todayN)) fixtures.push({ ...f, source: s.source, sport: s.sport || null });
  return fixtures.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

/** The shape for the day and the hour (§4): MATCHDAY, PREVIEW or MIDWEEK, from the air time and the readable results and dates. */
export function dayShape(air, results, fixtures) {
  const matchday = (air.weekday === 6 && air.hour >= 15) || air.weekday === 0 || (air.weekday === 1 && air.hour < 10) || results >= 4;
  const preview = !matchday && ((air.weekday === 5 && air.hour >= 6) || (air.weekday === 6 && air.hour < 14)) && fixtures >= 3 && results < 3;
  return matchday ? 'MATCHDAY' : preview ? 'PREVIEW' : 'MIDWEEK';
}

/** The scoreline a story's words say (both teams and the score in its text), or undefined. */
export function saidScoreline(story, text) {
  const t = String(text || '');
  return (story?.scorelines || []).find((r) => t.includes(String(r.a).split(' ').at(-1)) && t.includes(String(r.b).split(' ').at(-1)) && new RegExp(`\\b${r.sa}\\s*[-–]\\s*${r.sb}\\b|\\b${r.sb}\\s*[-–]\\s*${r.sa}\\b`).test(t));
}

/**
 * Will the edition air as MATCHDAY or PREVIEW, the shapes without THE NUMBER (§4)? Asked before the shape is made,
 * with the results the stories' words already say left out of SCORE CENTRE's count (`told`, pairs "A|B"), as the shape
 * leaves them out: the answer is the shape's unless a story's result sentence is later cut.
 */
export function numberDayless({ candidates = [], now = Date.now(), tz = 'Europe/London', told = new Set() } = {}) {
  const results = freshResults(candidates, { now, tz }).filter((r) => !told.has([r.a, r.b].sort().join('|'))).slice(0, 6);
  return dayShape(clockIn(now, tz), results.length, fixturesAhead(candidates, now, tz).length) !== 'MIDWEEK';
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
  // (rugby's two codes on one edition: each says which it is, "Rugby league now." and "Rugby union now.")
  const rugbyCodes = new Set(segs.filter((x) => x.type === 'story' && x.storyId).map((x) => byId.get(x.storyId)).filter((st) => st?.sport === 'rugby').map((st) => st.code || 'rugby'));
  const bothCodes = rugbyCodes.has('league') && rugbyCodes.size > 1;
  // THE NUMBER is MIDWEEK's (§4: MATCHDAY and PREVIEW have none; on a results day the figures are the scores): on a day
  // that will air as either, its story is told as any other, among its sport's stories, in the outlet's order and with
  // its own result on its board ("Saltmarsh Sirens beat Kestrel Vale Women 31-12…", not "Our number of the day: 6,000").
  // (Judged before the results the stories tell are known, from the calendar, the desk's fresh results and its dates:
  // the shape below can only come out the same or MIDWEEK, which then loses the frame, never the story.)
  const toldBefore = new Set(segs.filter((x) => x.type === 'story' && x.storyId).map((x) => saidScoreline(byId.get(x.storyId), x.text)).filter(Boolean).map((r) => [r.a, r.b].sort().join('|')));
  if (numberDayless({ candidates, now, tz, told: toldBefore })) {
    for (const seg of segs) {
      if (seg.type !== 'story' || seg.feature !== 'number') continue;
      delete seg.feature;
      delete seg.numbers;
      const story = byId.get(seg.storyId);
      edit(seg, (t) => {
        const parts = sentencesIn(t.replace(/^(?:\[[^\]]+\]\s*)*our number of the day:[^.]*\.\s*/i, ''));
        const at = (x) => sourceIndex(story, x.replace(/^(?:\[[^\]]+\]\s*)*/, ''));
        const known = parts.filter((x) => at(x) >= 0).sort((a, b) => at(a) - at(b));
        let k = 0;
        return parts.map((x) => (at(x) >= 0 ? known[k++] : x)).join(' ');
      });
    }
  }
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
    const sportOf = (b) => (plain(b) ? sportKey(byId.get(b[0].storyId), bothCodes) : null);
    const seen = [];
    for (const b of ordered) if (sportOf(b) && !seen.includes(sportOf(b))) seen.push(sportOf(b));
    const rank = (b, i) => (i === 0 ? -1 : sportOf(b) ? seen.indexOf(sportOf(b)) : seen.length);
    const grouped = ordered.map((b, i) => ({ b, i, r: rank(b, i) })).sort((x, y) => x.r - y.r || x.i - y.i).map((x) => x.b);
    segs = [first, ...grouped.flat(), last].filter(Boolean);
  }
  // a "Still to come" stands only while what it promises is still to come and not the very next thing on air (checked
  // here, before the hand-overs are written, and again on the final order)
  const words = (t) => String(t || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').replace(/[^\p{L}\d ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const keepPromises = (list) => list.filter((c, i, all) => {
    if (c.type !== 'chat' || !/^(?:\[[^\]]*\]\s*)*still to come\b/i.test(String(c.text || ''))) return true;
    const promised = words(String(c.text).replace(/^.*?still to come\s*:?\s*/i, '')).split(' ');
    // (the promise is a story's headline or its words; its first name may be the writer's: "Still to come: Jordan Henderson,
    // the Premier League's oldest player…" under "Henderson, the Premier League's oldest player…", 17 Oct)
    const keys = [promised.slice(0, 6).join(' '), promised.length >= 5 ? promised.slice(1, 6).join(' ') : ''].filter(Boolean);
    const at = all.findIndex((x) => x.type === 'story' && [x.text, x.headline, byId.get(x.storyId)?.title].some((w) => keys.some((key) => words(w).includes(key))));
    // (and something to wait for: at least two stories before it, never the next but one)
    const between = all.slice(i + 1, at).filter((x) => x.type === 'story').length;
    return at > i && between >= 2;
  });
  segs = keepPromises(segs);
  const title = program.title || 'FULL TIME';
  const A = presenters.A?.name || 'Kai Sprite';
  const B = String(presenters.B?.name || 'Rosa Rally').split(' ')[0];
  const air = clockIn(now, tz);
  const part = daypart(air.hour);
  // a toss at the end of a story, by a presenter's first name ("…relegation zone. [look_partner] Rosa?", "Over to you,
  // Rosa.")
  const names = [A, B].map((n) => String(n).split(' ')[0]).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const tossEnd = new RegExp(`\\s*(?:\\[[^\\]]+\\]\\s*)*(?:(?:over to you|over to|and now|now)\\s*,?\\s*)?(?:${names})(?:\\?|\\.|,\\s*over to you\\.)\\s*((?:\\[[^\\]]+\\]\\s*)*)$`, 'iu');

  // ---- each story's words (whichever writer wrote them): no toss left from the writer's order, the strap, the sentences that
  // stand, its result and its people's whole names; then a story left with fewer than two sentences is not told (§3.3: the
  // matchday checks of 17 Oct found stories aired as their headline alone, "Jacquet was 'cute and clever'…", and Newcastle's
  // "Jaissle sorry…" since 13 Oct)
  segs.filter((s) => s.type === 'story' && s.storyId).forEach((seg, k) => {
    const story = byId.get(seg.storyId);
    if (!story) return;
    // a pick-up ("Thanks, Kai.") only answers a toss: after a story that did not hand over by name, it goes
    // the writer's hand-overs ("…relegation zone. Rosa?" / "Thanks, Rosa.") were made for its own order, which the
    // shape has changed: they go, and the shape hands over where the sport changes (below)
    edit(seg, (t) => t.replace(tossEnd, ''));
    edit(seg, (t) => t.replace(/^((?:\[[^\]]+\]\s*)*)(?:thanks|thank you)(?: very much)?,?\s+\p{Lu}[\p{L}'’-]*\.\s*/iu, '$1'));
    // the strap's headline fits the programme's line (its words before a colon first)
    // (from the story's own headline, never from a strap the validator already clipped; one that still runs long
    // goes up whole on two lines rather than as a scrap, graphics/strap.js)
    const max = program.headlineMax || 45;
    if (String(seg.headline || '').length > max || /\b(?:will|would|could|can|is|are|was|were|be|has|have|had|to|of|for|and|the|a)$/i.test(String(seg.headline || '')) || QUOTE_ONLY.test(String(seg.headline || '')) || cutInAside(seg.headline, story.title)) seg.headline = shortHeadline(strapTitle(story.title || seg.headline), max);
    // (never a strap cut inside a clause its title goes on with: "McDermott seeks fix as England fight", 17 Oct)
    if (cutMidThought(seg.headline, story.title)) seg.headline = wholeThought(seg.headline, story.title);
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
      // whichever writer wrote it, a sentence that points back to someone or something the story has not told goes ("Both
      // players received treatment…", "Brentford, who later lost…", "The Spaniard was four under…", 17 Oct; leans.js), the
      // first sentence most of all
      // (a story that opens on what leans on its lede gets its lede back: the outlet's first sentence, which says what happened,
      // "Emi Martínez suffered a worrying-looking head injury…" before "Chelsea coach Xabi Alonso told reporters that the
      // Argentina international was conscious", 17 Oct)
      if (parts.length && sportLeans(bare(parts[0]), '', { people: story.people })) {
        const lede = sentencesIn(String(story.summary || ''))[0];
        const key = (x) => String(x).toLowerCase().replace(/[^\p{L}\d ]+/gu, ' ').split(/\s+/).slice(0, 8).join(' ');
        if (lede && !sportLeans(lede, '', { people: story.people }) && !parts.some((x) => key(bare(x)) === key(lede))) parts = [parts[0].match(cue)[1] + lede, bare(parts[0]), ...parts.slice(1)];
      }
      let carry = '';
      parts = parts.reduce((out, x) => {
        const idx = at(x);
        const prevSaid = idx > 0 && out.some((p) => at(p) === idx - 1);
        if (!sportLeans(bare(x), out.map(bare).join(' '), { prevSaid, people: story.people })) return [...out, x];
        // (a first sentence's gestures go on with the next one)
        if (!out.length) carry += x.match(cue)[1];
        return out;
      }, []);
      if (carry && parts.length) parts[0] = (parts[0].match(cue)[1] || carry) + bare(parts[0]);
      // a result story says its score when its source gives one (17 Oct: "Cameron equaliser earns point for Dundee United"
      // never said 1-1): the sentence with the score first, or straight after a first sentence that says the result in words
      const own = ownResult(story);
      if (own && !parts.some((x) => saysScore(x, own))) {
        // (a sentence of the story with the score, else its result line as SCORE CENTRE reads it: "WXV: Canada 24-21 England."
        // heads the Red Roses report and no sentence of it says the score but "The 24-21 scoreline is correct", Guardian 17 Oct)
        const said = sentencesIn(`${story.summary || ''} ${story.body || ''}`).find((x) => saysScore(x, own) && !sportLeans(x, '') && !/^["“‘]/.test(x) && hasFiniteVerb(x.replace(/[.!?]+$/, '')));
        const withScore = said || resultLine(own);
        if (withScore) {
          const words = (x) => new Set(String(x).toLowerCase().match(/[\p{L}\d]{4,}/gu) || []);
          const ws = words(withScore);
          parts = parts.filter((x) => {
            const w = [...words(bare(x))];
            return !w.length || w.filter((y) => ws.has(y)).length / w.length < 0.7;
          });
          const inWords = parts.length && RESULT_WORDS.test(bare(parts[0])) && [own.a, own.b].some((n) => bare(parts[0]).includes(String(n).split(' ').at(-1)));
          // (a first sentence that says "A beat B" takes the score itself, rather than a result line repeating it:
          // "Connacht beat Saracens 45-36 in their opening Champions Cup pool game", the score from the page's headline)
          const withIn = inWords && !said ? scoreInto(parts[0], own) : null;
          if (withIn) parts[0] = withIn;
          else if (inWords) parts.splice(1, 0, withScore);
          else if (parts.length) parts = [parts[0].match(cue)[1] + withScore, bare(parts[0]), ...parts.slice(1)];
          else parts = [withScore];
        }
      }
      parts = parts.length > sentencesMax(seg, k) ? parts.slice(0, sentencesMax(seg, k)) : parts;
      // a person's first mention says their whole name when the outlet gives it ("Loughnane, 20, has become…" for Billy
      // Loughnane, "McDermott's first match" for Brian McDermott, 17 Oct), outside a quotation
      return fullNames(parts.join(' '), story.people);
    });
  });
  {
    const ownCount = (seg) => sentencesIn(String(seg.text || '')).length;
    const short = new Set(segs.filter((x) => x.type === 'story' && x.storyId && !x.feature && !x.roundup && ownCount(x) < 2 && segs.filter((y) => y.type === 'story' && y.storyId).length > 5));
    if (short.size) {
      const kept = [];
      let dropping = false;
      for (const x of segs) {
        if (x.type === 'story') dropping = short.has(x);
        if (!dropping || x.type === 'intro' || x.type === 'outro') kept.push(x);
      }
      segs = keepPromises(kept);
    }
  }
  // who reads what (§4): Kai the lead, Rosa a story that follows it on, then AROUND THE GROUNDS in turn; THE NUMBER and
  // the moment of the day are Rosa's (a story that changes hands takes its partner's gestures with it)
  const flip = (seg, to) => {
    if (!seg || seg.anchor === to || !presenters[to]) return;
    seg.anchor = to;
    edit(seg, (t) => t.replace(/\[(A|B):/g, (m, x) => `[${x === 'A' ? 'B' : 'A'}:`));
  };
  {
    let last = null;
    let leadDone = false;
    for (const seg of segs) {
      if (seg.type !== 'story' || !seg.storyId) continue;
      if (seg.feature === 'number' || seg.feature === 'lighter') flip(seg, 'B');
      else if (seg.roundup) continue;
      else if (!leadDone) {
        flip(seg, 'A');
        leadDone = true;
        last = 'A';
      } else {
        const to = last === 'A' ? 'B' : 'A';
        flip(seg, to);
        last = to;
      }
    }
  }
  // ---- the stories: strap tag, scoreline card where the presenter says the result, transitions, the moment
  const stories = segs.filter((s) => s.type === 'story' && s.storyId);
  const told = new Set();
  const keyOf = (st) => sportKey(st, bothCodes);
  let prevSport = null;
  let handedOver = false; // (the last change of sport was a hand-over by name)
  stories.forEach((seg, k) => {
    const story = byId.get(seg.storyId);
    if (!story) return;
    if (story.sportTag) seg.kicker = story.sportTag;
    seg.sport = story.sport || null;
    const text = String(seg.text || '');
    const sl = saidScoreline(story, text);
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
    // ("And finally" belongs to the moment of the day: a story the writer closed with but which is not one says no
    // such thing)
    if (seg.feature !== 'lighter') edit(seg, (t) => t.replace(/(^|\.\s+)((?:\[[^\]]+\]\s*)*)and finally(?: tonight| today| this evening)?\s*[,:]?\s*(\p{L})/iu, (m, pre, cues, c) => `${pre}${cues}${c.toUpperCase()}`));
    if (seg.feature === 'lighter') {
      // the moment of the day: its own words in place of "And finally"
      edit(seg, (t) => t.replace(/(^|\.\s+)((?:\[[^\]]+\]\s*)*)and finally(?: tonight| today| this evening)?\s*[,:]?\s*(\p{L})/iu, (m, pre, cues, c) => `${pre}${cues}${c.toUpperCase()}`));
      lead(pick(BANKS.moment, `${seed}~m${seg.storyId}`, recent));
      seg.kicker = 'MOMENT OF THE DAY';
      // THE MOMENT ON THE BOARD: the distance of the goal or the kick, when the words on air state one
      const chalk = chalkOf(seg.text, story.sport);
      if (chalk) seg.chalk = chalk;
    } else if (k > 0 && seg.follows) {
      lead(pick(BANKS.follow, `${seed}~f${seg.storyId}`, recent));
    } else if (k > 0 && seg.feature !== 'number' && story.sport && keyOf(story) !== prevSport) {
      // AROUND THE GROUNDS: a transition when the sport changes
      // a change of presenter with the sport: the one who read the last story hands over by name ("Rosa has the
      // rugby."), which says the sport; else the presenter says it ("Some rugby."). Never two hand-overs by name in a
      // row (the step-7 recordings: five in a row made AROUND THE GROUNDS a relay of tosses): after one, the next
      // presenter takes the sport up in their own words. Nor a toss at the end of a story with a scoreline or a chalk
      // board: its last sentences air on that card, and a hand-over is said in vision (the step-7 recording: "Over to
      // Kai for the tennis." over the Hawks' 24-17)
      const before = segs[segs.indexOf(seg) - 1];
      const to = presenters[seg.anchor]?.name ? String(presenters[seg.anchor].name).split(' ')[0] : null;
      if (!handedOver && before?.type === 'story' && before.anchor !== seg.anchor && to && SPORT_NAME[keyOf(story)] && !before.heavy && !seg.heavy && !before.score && !before.chalk) {
        const line = fill(pick(BANKS.handover, `${seed}~h${seg.storyId}`, recent), { N: to, S: SPORT_NAME[keyOf(story)] });
        edit(before, (t) => `${t} [look_partner] ${line}`);
        handedOver = true;
      } else {
        lead(pick(BANKS.transition[keyOf(story)] || BANKS.transition.other, `${seed}~t${seg.storyId}`, recent));
        handedOver = false;
      }
    }
    if (seg.feature === 'number') seg.kicker = 'THE NUMBER';
    // (rugby league is named on air: by its transition or hand-over, else in the story's first words, "In rugby league, …")
    if (keyOf(story) === 'rugby-league' && !/\b(?:rugby league|super league|nrl)\b/i.test(`${seg.text} ${segs[segs.indexOf(seg) - 1]?.text || ''}`.replace(/\[[^\]]*\]/g, ' '))) {
      edit(seg, (t) => {
        const parts = sentencesIn(t);
        const at = parts.findIndex((x) => !/^(?:\[[^\]]+\]\s*)*(?:thanks|thank you)\b[^.]*\.$/i.test(x.trim()) && !BANKS.follow.some((l) => bare(x) === l) && !BANKS.moment.some((l) => bare(x) === l));
        if (at < 0) return t;
        const cue = parts[at].match(/^((?:\[[^\]]+\]\s*)*)/)[1];
        const rest = parts[at].slice(cue.length);
        parts[at] = `${cue}In rugby league, ${/^(?:The|A|An|It|This|That|There|In|On|At|After|Before)\b/.test(rest) ? rest[0].toLowerCase() + rest.slice(1) : rest}`;
        return parts.join(' ');
      });
    }
    // (and the women's game is named: "England have lost a rugby game after four years and 41 games unbeaten" never said it
    // was England's women, the Red Roses, Guardian 17 Oct)
    if (story?.womens && !WOMEN_SAID.test(`${seg.text} ${segs[segs.indexOf(seg) - 1]?.text || ''}`.replace(/\[[^\]]*\]/g, ' '))) {
      const name = String(SPORT_NAME[keyOf(story)] || '').replace(/^the\s+/, '');
      edit(seg, (t) => {
        const parts = sentencesIn(t);
        const at = parts.findIndex((x) => !/^(?:\[[^\]]+\]\s*)*(?:thanks|thank you)\b[^.]*\.$/i.test(x.trim()) && !BANKS.follow.some((l) => bare(x) === l) && !BANKS.moment.some((l) => bare(x) === l) && !Object.values(BANKS.transition).flat().some((l) => bare(x) === l));
        if (at < 0 || !name) return t;
        const cue = parts[at].match(/^((?:\[[^\]]+\]\s*)*)/)[1];
        const rest = parts[at].slice(cue.length);
        parts[at] = `${cue}In women's ${name}, ${/^(?:The|A|An|It|This|That|There|In|On|At|After|Before)\b/.test(rest) ? rest[0].toLowerCase() + rest.slice(1) : rest}`;
        return parts.join(' ');
      });
    }
    prevSport = keyOf(story) || prevSport;
  });

  // ---- SCORE CENTRE and COMING UP
  const results = freshResults(candidates, { now, tz }).filter((r) => !told.has([r.a, r.b].sort().join('|'))).slice(0, 6);
  const fixtures = fixturesAhead(candidates, now, tz);
  const shape = dayShape(air, results.length, fixtures.length);
  const sources = (rows) => {
    const list = [...new Set(rows.map((r) => r.source).filter(Boolean))];
    return list.length && list.length <= 2 ? list.join(' / ') : channelName;
  };
  let scoreCentre = null;
  let centreRows = [];
  if (results.length >= 3) {
    const { text, rows } = resultText(results, seed, recent);
    centreRows = rows;
    const rTitle = resultsTitle(rows, now, tz);
    const today = dayIn(now, tz).n;
    // (a row from another day carries its day, unless the title says the day: "YESTERDAY'S RESULTS" over four rows each
    // marked SAT said it five times, 17 Oct)
    scoreCentre = {
      type: 'story', anchor: 'A', emotion: 'neutral', storyId: rows[0].storyId, feature: 'scores', kicker: 'SCORE CENTRE',
      headline: rTitle[0] + rTitle.slice(1).toLowerCase().replace(/'s\b/, "'s"), source: sources(rows), hasImage: false, category: 'sport', cues: [],
      text: `${pick(BANKS.results[shape], `${seed}~r`, recent)} ${text}`,
      scores: rows.map((r) => ({ a: r.a, b: r.b, sa: r.sa, sb: r.sb, winner: r.winner, home: r.home, draw: r.draw, sport: r.sport, ...(dayIn(r.published, tz).n !== today && !/^(?:YESTERDAY|LAST NIGHT)/.test(rTitle) ? { day: SHORT_DAY[dayIn(r.published, tz).weekday] } : {}) })),
      scoresTitle: rTitle,
    };
  }
  let comingUp = null;
  // (never the dates the last stories before it have just read out, chats included: COMING UP is no echo of the last
  // minute; a date said earlier in the edition may come back as the calendar's recap)
  // (the order on air ends: the last stories, THE NUMBER, the moment of the day, then COMING UP)
  const tailBlocks = [];
  for (const x of segs) {
    if (x.type === 'intro' || x.type === 'outro') continue;
    if (x.type === 'story' || !tailBlocks.length) tailBlocks.push([x]);
    else tailBlocks[tailBlocks.length - 1].push(x);
  }
  const lastFeature = (b) => (b[0]?.feature === 'number' ? 1 : b[0]?.feature === 'lighter' ? 2 : 0);
  const aired = shape === 'PREVIEW' ? [] : tailBlocks.map((b, i) => ({ b, i })).sort((x, y) => lastFeature(x.b) - lastFeature(y.b) || x.i - y.i).flatMap((x) => x.b);
  const lastStories = aired.filter((x) => x.type === 'story' && x.storyId).slice(-3);
  const from = lastStories.length ? aired.indexOf(lastStories[0]) : aired.length;
  const recentText = words(aired.slice(from).map((x) => x.text).join(' '));
  const justSaid = (f) => !!f.sentence && recentText.includes(words(f.sentence).split(' ').slice(0, 5).join(' '));
  const ahead = fixtures.filter((f) => !justSaid(f)).slice(0, 3);
  if (ahead.length >= 2) {
    const weekend = shape === 'PREVIEW' && ahead.every((f) => f.date && [5, 6, 0].includes(new Date(`${f.date}T12:00:00Z`).getUTCDay()));
    const cTitle = weekend ? 'THE WEEKEND AHEAD' : 'COMING UP';
    // read as a calendar is spoken: "Tomorrow, it's Starfield City against Glimmerford. On Thursday, Bitport Comets
    // against Lanternhill Lynx. And on Friday, Harbourside Hawks against Ironvale Giants."
    // (two events the same day in one line: "On Saturday, it's England against Tonga, and Wales against Fiji.")
    const days = [];
    for (const f of ahead) {
      const when = whenPhrase(f, now, tz);
      const day = days.find((d) => d.when === when);
      if (day) day.what.push(titleCase(f.event));
      else days.push({ when, what: [titleCase(f.event)] });
    }
    const lines = days.map((d, i) => {
      const w = i > 0 && i === days.length - 1 ? `And ${d.when[0].toLowerCase()}${d.when.slice(1)}` : d.when;
      const what = d.what.map((x, k) => (k === 0 ? x.replace(/^./, (c) => c.toUpperCase()) : x));
      const list = what.length > 1 ? `${what.slice(0, -1).join(', ')}, and ${what.at(-1)}` : what[0];
      return `${w}, ${i === 0 && / against /.test(what[0]) ? "it's " : ''}${list}.`;
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
  // (THE NUMBER only airs MIDWEEK: on a MATCHDAY or PREVIEW its story was told as any other, above)
  if (number) order.push(number);
  if (moment) order.push(moment);
  // no moment of the day: Rosa's memory still airs before the sign-off, asked for by Kai (the ritual a viewer waits for),
  // never after a grave or a serious story (a misconduct charge, a court case, a death)
  const memoryAired = segs.some((x) => x.type === 'chat' && [...ROSA_MEMORIES, ...ROSA_NEEDLES].some((p) => bare(x.text) === bare(p[0])));
  const endSeg = order.flat().filter((x) => x.type === 'story').at(-1);
  const endStory = endSeg && byId.get(endSeg.storyId);
  const serious = (st) => !st || isGrave(`${st.title}. ${st.summary || ''}`) || SERIOUS.test(`${st.title}. ${st.summary || ''}`);
  if (!moment && !memoryAired && presenters.B && endSeg && !endSeg.heavy && !serious(endStory)) {
    // (one of her memories, which Kai asks for, or one of her needles at Kai, which she starts herself)
    const pairs = [...ROSA_MEMORIES, ...ROSA_NEEDLES];
    const keyed = pairs.map((p) => `${p[0]} ${p[1]}`);
    const both = pick(keyed, `${seed}~mem`, recent);
    const at = Math.max(0, keyed.indexOf(both));
    const pair = pairs[at];
    const ask = at < ROSA_MEMORIES.length ? [{ type: 'chat', anchor: 'A', emotion: 'neutral', cues: [], text: fill(pick(BANKS.memoryAsk, `${seed}~ma`, recent), { B }) }] : [];
    const chats = [
      ...ask,
      { type: 'chat', anchor: 'B', emotion: 'neutral', cues: [], text: pair[0] },
      { type: 'chat', anchor: 'A', emotion: 'neutral', cues: [], text: pair[1] },
    ];
    // (their gestures read out of the words, as the writer's are)
    for (const c of chats) edit(c, (t) => t);
    order.push(chats);
  }
  if (shape !== 'PREVIEW' && comingUp) order.push([comingUp]);

  // ---- greeting and hello, sign-off
  const greeting = fill(pick(BANKS.greeting[part], `${seed}~g`, recent), { title, A, R: presenters.B?.name || 'Rosa Rally' });
  let teases = null;
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
          const own = heads.find((h) => [...words(h)].filter((w) => tw.has(w)).length >= 3 && !QUOTE_ONLY.test(h.replace(/[.!?]+$/, '')));
          // (with its people's first names, as the stories say them: "Renshaw stars as Australia close in…" for Matt
          // Renshaw, 13 Oct, found by the first-name check of 17 Oct)
          return fullNames(own || `${shortHeadline(strapTitle(byId.get(x.storyId).title), 60).replace(/[.!?]*$/, '')}.`, byId.get(x.storyId).people);
        });
        // the montage cuts to the story each headline names (director.js playIntro, the v2 plan's montageCard): the
        // writer's teases named its own three, and the strap under a spoken headline showed another story
        teases = [...chosen.map((x) => x.storyId), ...sentencesIn(greeting).map(() => null)];
      }
      // (a whole name before a headline's noun takes an article: "Kiltie double helps Kilmarnock…" is said "A Greg Kiltie
      // double helps…", never "Greg Kiltie double helps…", 17 Oct)
      // (only a first name a story's people give: never "A Late Lindqvist goal…", the offline desk)
      const known = (given, sur) => [...byId.values()].some((c) => c.people?.[sur] === given);
      heads = heads.map((h) => h.replace(NAME_ADJUNCT, (m, given, sur, rest) => (known(given, sur) ? `${/^[AEIOU]/.test(given) ? 'An' : 'A'} ${given} ${sur}${rest}` : m)));
      return `${heads.join(' ')} [nod] ${greeting}`.trim();
    });
  }
  // (to Kai by name and to the viewer, by the hour; on a results day, the results)
  const helloPool = [...(shape === 'MATCHDAY' && scoreCentre ? BANKS.hello.results : []), ...BANKS.hello[part], ...BANKS.hello.any].map((l) => fill(l, { K: String(A).split(' ')[0] }));
  const hello = { type: 'chat', anchor: 'B', emotion: 'neutral', cues: [], text: pick(helloPool, `${seed}~h`, recent) };
  const lastStory = order.flat().filter((s) => s.type === 'story').at(-1);
  const grave = lastStory && byId.get(lastStory.storyId) && isGrave(`${byId.get(lastStory.storyId).title}`);
  if (outro) edit(outro, () => fill(pick(BANKS.signoff[part], `${seed}~s`, recent), { title, B, channel: channelName }).replace(grave ? /\[wave\]/g : /$^/, '[nod]'));
  const hello0 = hello.text;
  edit(hello, () => hello0);
  for (const seg of [scoreCentre, comingUp]) if (seg) edit(seg, (t) => t);

  episode.segments = [intro, hello, ...order.flat(), outro].filter(Boolean);
  episode.segments = keepPromises(episode.segments);
  if (intro && teases) intro.teases = teases;
  // no maps: a world map under a result says nothing a sport bulletin needs (full-time.md §6: its pictures and its
  // boards); a story without a picture stands on its board or its presenter, a headline frame on its field
  for (const seg of episode.segments) delete seg.location;
  for (const r of episode.rundown || []) delete r.location;
  // where each result and each date is read: the board's row flips in, the calendar's leaf drops, when the voice
  // reaches the sentence that says it (director.js playBoardSegment; char offsets into the final text)
  const sentenceStart = (text, at) => {
    let i = at;
    while (i > 0 && !/[.!?]\s/.test(text.slice(i - 2, i))) i--;
    return i;
  };
  if (scoreCentre) {
    let from = 0;
    scoreCentre.scores.forEach((row, i) => {
      const at = scoreCentre.text.indexOf(resultLine(centreRows[i]), from);
      if (at < 0) return;
      row.char = sentenceStart(scoreCentre.text, at);
      from = at + 1;
    });
  }
  if (comingUp) {
    const lower = comingUp.text.toLowerCase();
    let from = 0;
    let last = -1;
    comingUp.fixtures.forEach((f) => {
      const at = lower.indexOf(titleCase(f.event).toLowerCase(), from);
      if (at < 0) return;
      // the first date of a day comes in with its day ("Tomorrow, it's ..."), a second of the same day with its name
      const start = sentenceStart(comingUp.text, at);
      f.char = start === last ? at : start;
      last = start;
      from = at + 1;
    });
  }
  episode.storyIds = [...new Set(episode.segments.filter((s) => s.storyId).map((s) => s.storyId))];
  // the rundown (the montage's frames and pips, STILL TO COME's tiles) is the stories on air, in their order, with the
  // straps and sport tags they air with (never a story the shape left out, nor the writer's order)
  if (Array.isArray(episode.rundown)) {
    const entry = new Map(episode.rundown.map((r) => [r.storyId, r]));
    const told = episode.segments.filter((s) => s.type === 'story' && s.storyId && s.feature !== 'scores' && s.feature !== 'fixtures' && entry.has(s.storyId));
    const seen = new Set();
    episode.rundown = told.filter((s) => !seen.has(s.storyId) && seen.add(s.storyId)).map((s) => ({ ...entry.get(s.storyId), headline: s.headline, ...(s.kicker ? { kicker: s.kicker } : {}) }));
  }
  episode.sport = { shape, results: scoreCentre ? scoreCentre.scores.length : 0, fixtures: comingUp ? comingUp.fixtures.length : 0 };
  episode.segments = episode.segments.filter((s) => s.type !== 'story' || String(s.text || '').trim());
  return { shape, results: episode.sport.results, fixtures: episode.sport.fixtures, lines: recent.used };
}

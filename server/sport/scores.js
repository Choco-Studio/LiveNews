// Scorelines read with certainty (docs/programmes/full-time.md §3.5): one sentence of the source, a sport with one final
// score, a finished result, both teams named in that sentence, the numbers agreeing with the verb. Anything else is told
// as words, with no board. The forms come from the 55 sentences with "x-y" in the 13 Oct sport feeds and the match reports
// of Saturday 17 Oct; and a story whose headline says the result in words takes its score from the one sentence of its
// copy that gives it (pairedScorelines).
import { lookupPlace } from '../gazetteer.js';

// sports whose result is one final score (cricket's runs and wickets, tennis's sets, a race's places are not)
export const SCORED_SPORTS = new Set(['football', 'rugby', 'american-football', 'basketball', 'ice-hockey', 'baseball', 'handball']);

const NAMEW = "(?:\\p{Lu}[\\p{L}'’.-]*|[0-9]{2,4}ers)"; // a capitalised word ("Saint-Germain", "49ers")
const JOIN = "(?:\\s+(?:&|de|del|of|la|le|du)(?=\\s+\\p{Lu})|\\s+(?=\\p{Lu}))";
const TEAM = `(${NAMEW}(?:${JOIN}${NAMEW}){0,4})`;
// two-word names joined by "and" are one team only when they are a country's own name
const AND_NAMES = /\b(?:Bosnia and Herzegovina|Trinidad and Tobago|Antigua and Barbuda|St Kitts and Nevis|Sao Tome and Principe|Brighton and Hove Albion)\b/;
const AND_NAMES_G = new RegExp(AND_NAMES.source, 'g');
const SCORE = '(\\d{1,3})\\s*[-–]\\s*(\\d{1,3})';
const ADJ = "(?:[\\p{L}-]+\\s+){0,3}?";

// a win's verb as the source writes it -> its past tense on a results line
const WIN_VERBS = {
  beat: 'beat', beats: 'beat', beating: 'beat', defeat: 'beat', defeats: 'beat', defeated: 'beat', defeating: 'beat',
  thrash: 'thrashed', thrashes: 'thrashed', thrashed: 'thrashed', thrashing: 'thrashed',
  stun: 'stunned', stuns: 'stunned', stunned: 'stunned',
  edge: 'edged', edges: 'edged', edged: 'edged',
  crush: 'crushed', crushes: 'crushed', crushed: 'crushed',
  rout: 'routed', routs: 'routed', routed: 'routed',
  hammer: 'hammered', hammers: 'hammered', hammered: 'hammered',
  down: 'downed', downs: 'downed', downed: 'downed',
  topple: 'toppled', topples: 'toppled', toppled: 'toppled',
  overcome: 'overcame', overcomes: 'overcame', overcame: 'overcame',
  thump: 'thumped', thumps: 'thumped', thumped: 'thumped',
  outlast: 'outlasted', outlasts: 'outlasted', outlasted: 'outlasted',
  'see off': 'saw off', 'sees off': 'saw off', 'saw off': 'saw off',
  'ease past': 'eased past', 'eases past': 'eased past', 'eased past': 'eased past',
  'cruise past': 'cruised past', 'cruises past': 'cruised past', 'cruised past': 'cruised past',
  'brush aside': 'brushed aside', 'brushes aside': 'brushed aside', 'brushed aside': 'brushed aside',
};
const WIN = `(${Object.keys(WIN_VERBS).sort((a, b) => b.length - a.length).map((v) => v.replace(' ', '\\s+')).join('|')})`;
const MAN = '(?:(?:10|ten|nine|9)-man\\s+)?';
// a verb whose object is the team that won ("to lift Kilmarnock off the bottom … with a 3-2 victory over Motherwell",
// "earned Dundee United a 1-1 draw at St Johnstone", "saw Sheffield United take all three points from a 1-0 Championship
// victory over Bristol City", Sky Sports 17 Oct)
const HELP_VERB = '(?:lifts?|lifted|lifting|helps?|helped|helping|sends?|sent|sending|fires?|fired|firing|powers?|powered|powering|takes?|took|taking|moves?|moved|moving|carries|carried|carrying|propels?|propelled|steers?|steered|inspires?|inspired|earns?|earned|earning|gives?|gave|giving|hands?|handed|handing|snatch(?:es|ed)?|snatching|secures?|secured|securing|clinch(?:es|ed)?|seals?|sealed|saw|sees)';
// a result's own noun after its score ("a 3-2 victory", "a 0-0 draw", "a 40-21 bonus-point win")
const RESULT_NOUN = '(win|victory|triumph|success|draw)';
// what only a team does ("dropped points", "returned to winning ways", "moved above"), never a player
const TEAM_CLAUSE = '(?:dropped(?:\\s+two)?\\s+points|returned\\s+to\\s+winning\\s+ways|(?:extended|ended|kept|continued|maintained|picked\\s+up|secured|recorded|claimed|registered|earned)\\s+their|moved\\s+(?:up|above|off|clear|into|to|level)|climbed|bounced\\s+back|signed\\s+off|(?:stayed|remained|went)\\s+(?:top|unbeaten|clear|bottom))';

// The forms, most specific first. Each gives the winner's and the loser's spans, the scores, and the line's verb.
const FORMS = [
  // "X leads/guides/fires/powers/lifts A to a 37-34 victory over B" (the team, never the player)
  { re: new RegExp(`\\b(?:leads?|led|leading|guides?|guided|guiding|fires?|fired|firing|powers?|powered|powering|inspires?|inspired|inspiring|helps?|helped|helping|carries|carried|carrying|propels?|propelled|lifts?|lifted|lifting|sends?|sent)\\s+(?:the\\s+)?${TEAM}\\s+to\\s+(?:an?\\s+)?${ADJ}${SCORE}\\s+(?:home\\s+|away\\s+)?(?:overtime\\s+|extra-time\\s+|OT\\s+)?(?:win|victory|triumph)\\s+(?:over|against|at)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[1], l: m[4], sw: m[2], sl: m[3], verb: 'beat', kind: 'win' }) },
  // "A's 5-1 win against B", "Rams' 37-34 overtime loss to the Buffalo Bills"
  { re: new RegExp(`${TEAM}['’]s?\\s+${SCORE}\\s+${ADJ}(home\\s+|away\\s+)?(win|victory|triumph|success|loss|defeat|draw)\\s+(?:to|over|against|at|by|with)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => (/loss|defeat/.test(m[5]) ? { w: m[6], l: m[1], sw: m[2], sl: m[3], verb: 'beat', kind: 'loss', at: m[4] } : /draw/.test(m[5]) ? { a: m[1], b: m[6], sw: m[2], sl: m[3], kind: 'draw' } : { w: m[1], l: m[6], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4] }) },
  // "A come(s) from behind to beat B 2-1", "A fight back to beat B 2-1"
  { re: new RegExp(`${TEAM}\\s+(?:comes?|came|fights?|fought|hits?|hit)\\s+(?:from\\s+behind|back)\\s+to\\s+(beat|defeat|edge|see\\s+off|overcome|down)\\s+${MAN}${TEAM}\\s+${SCORE}\\b`, 'u'), map: (m) => ({ w: m[1], l: m[3], sw: m[4], sl: m[5], verb: `came from behind to ${m[2].replace(/\s+/, ' ')}`, kind: 'win' }) },
  // "A stun B with an emphatic 4-1 victory"
  { re: new RegExp(`${TEAM}\\s+${WIN}\\s+${MAN}${TEAM}\\s+(?:\\S+\\s+){0,3}?with\\s+an?\\s+${ADJ}${SCORE}\\s+(home\\s+|away\\s+)?(?:win|victory|triumph|thrashing|rout)\\b`, 'u'), map: (m) => ({ w: m[1], l: m[3], sw: m[4], sl: m[5], verb: WIN_VERBS[m[2].toLowerCase().replace(/\s+/g, ' ')], kind: 'win', home: m[6] }) },
  // "A beat B 2-1", "A thrash 10-man B 5-1"
  { re: new RegExp(`${TEAM}\\s+${WIN}\\s+${MAN}${TEAM}\\s+${SCORE}\\b`, 'u'), map: (m) => ({ w: m[1], l: m[3], sw: m[4], sl: m[5], verb: WIN_VERBS[m[2].toLowerCase().replace(/\s+/g, ' ')], kind: 'win' }) },
  // "A defeat B in the Nations League (4-1)": the score in brackets at the end of that clause
  { re: new RegExp(`${TEAM}\\s+${WIN}\\s+${MAN}${TEAM}\\s+(?:[^().,;]{0,40}?)\\(${SCORE}\\)`, 'u'), map: (m) => ({ w: m[1], l: m[3], sw: m[4], sl: m[5], verb: WIN_VERBS[m[2].toLowerCase().replace(/\s+/g, ' ')], kind: 'win' }) },
  // "A … by beating B 2-1" (A the sentence's subject)
  { re: new RegExp(`(?:^|,\\s+)${TEAM}\\s+((?:(?!\\b(?:scor\\w*|goals?|netted|struck|hat-trick)\\b)[^,.;]){0,60}?)\\b(?:by|after|in)\\s+(beating|defeating|thrashing|edging)\\s+${MAN}${TEAM}\\s+${SCORE}\\b`, 'u'), map: (m) => ({ w: m[1], l: m[4], sw: m[5], sl: m[6], verb: WIN_VERBS[m[3].toLowerCase()], kind: 'win', subject: true }) },
  // "Italy bounced back in style on Monday, thumping Turkey 4-1" (the participle's subject opens the sentence)
  { re: new RegExp(`(?:^|,\\s+)${TEAM}\\s+(?:(?!\\b(?:scor\\w*|goals?|netted|struck|hat-trick)\\b)[^,.;]){0,60}?,\\s+(thumping|beating|crushing|edging|hammering|routing|thrashing|downing|defeating)\\s+${MAN}${TEAM}\\s+${SCORE}\\b`, 'u'), map: (m) => ({ w: m[1], l: m[3], sw: m[4], sl: m[5], verb: WIN_VERBS[m[2].toLowerCase()] || 'beat', kind: 'win', subject: true }) },
  // "A enjoyed a comfortable 3-0 win against B", "A secured a 1-0 away victory against B", "A made it … with a 4-1 home victory over B"
  // (a team's own verb: never "Haaland scored twice in a 3-0 win over…", whose subject is a player)
  { re: new RegExp(`(?:^|,\\s+)${TEAM}\\s+(?:enjoyed|enjoy|enjoys|secured|secure|secures|earned|earn|earns|claimed|claim|claims|recorded|record|records|sealed|seal|seals|completed|complete|completes|registered|picked\\s+up|pick\\s+up|picks\\s+up|ground\\s+out|made\\s+it\\s+[^,.;]{0,40}?\\s+with|eased\\s+to|cruised\\s+to|romped\\s+to|stormed\\s+to|raced\\s+to|held\\s+on\\s+for|hung\\s+on\\s+for)\\s+an?\\s+${ADJ}${SCORE}\\s+(home\\s+|away\\s+)?(?:win|victory|triumph|success)\\s+(?:over|against|at)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[1], l: m[5], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4], subject: true }) },
  // the winner as a verb's object, then its result: "Greg Kiltie scored twice to lift Kilmarnock off the bottom of the
  // Scottish Premiership with a 3-2 victory over Motherwell", "Lyall Cameron's 79th-minute strike earned Dundee United a
  // 1-1 draw at St Johnstone", "Álex Baena struck in the 89th minute to snatch Atlético Madrid a 1-0 win at Espanyol"
  // (Sky Sports and the Guardian, 17 Oct: the forms of a Saturday's match reports)
  { re: new RegExp(`\\b${HELP_VERB}\\s+(?:the\\s+)?${TEAM}\\s+(?:(?:[^,.;]{0,60}?\\s+)?(?:with|from|to)\\s+)?an?\\s+${ADJ}${SCORE}\\s+${ADJ}(home\\s+|away\\s+)?${RESULT_NOUN}\\s+(over|against|at|with)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => (m[5] === 'draw' ? { a: m[1], b: m[7], sw: m[2], sl: m[3], kind: 'draw' } : { w: m[1], l: m[7], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4], at: m[6] === 'at' }) },
  // the subject on its way: "Ulster run in six tries on their way to a 40-21 bonus-point win over Zebre in Parma" (BBC 17 Oct)
  { re: new RegExp(`^(?:The\\s+)?${TEAM}\\s+[^,.;]{0,60}?\\s+on\\s+their\\s+way\\s+to\\s+an?\\s+${ADJ}${SCORE}\\s+${ADJ}(home\\s+|away\\s+)?(win|victory|triumph|success)\\s+(over|against|at)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[1], l: m[7], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4], at: m[6] === 'at', subject: true }) },
  // the win that moved its subject: "Aberdeen returned to winning ways in the Scottish Premiership as a 3-1 victory over St
  // Mirren moved them above their opponents" (Sky Sports 17 Oct)
  { re: new RegExp(`^(?:The\\s+)?${TEAM}\\s+[^,.;]{0,80}?\\s+as\\s+an?\\s+${ADJ}${SCORE}\\s+${ADJ}(home\\s+|away\\s+)?(win|victory|triumph|success)\\s+(over|against|at)\\s+(?:the\\s+)?${TEAM}\\s+(?:moved|lifted|took|sent|kept|put|left|saw|carried|helped)\\s+them\\b`, 'u'), map: (m) => ({ w: m[1], l: m[7], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4], at: m[6] === 'at', subject: true }) },
  // a team's own clause with its result: "… as Southampton dropped points at home for the first time this season with a 0-0
  // draw against Bolton" (Sky Sports 17 Oct)
  { re: new RegExp(`(?:^|\\bas\\s+)(?:the\\s+)?${TEAM}\\s+${TEAM_CLAUSE}\\b[^,.;]{0,60}?\\s+with\\s+an?\\s+${ADJ}${SCORE}\\s+${ADJ}(home\\s+|away\\s+)?${RESULT_NOUN}\\s+(over|against|at|with)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => (m[5] === 'draw' ? { a: m[1], b: m[7], sw: m[2], sl: m[3], kind: 'draw', subject: true } : { w: m[1], l: m[7], sw: m[2], sl: m[3], verb: 'beat', kind: 'win', home: m[4], at: m[6] === 'at', subject: true }) },
  // "A suffered a heavy 119-66 defeat to B", "A lost 2-1 to B", "A went down 3-1 at B"
  { re: new RegExp(`${TEAM}\\s+(?:suffered|suffer|suffers)\\s+an?\\s+${ADJ}${SCORE}\\s+(?:defeat|loss|thrashing)\\s+(to|at|against|by)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[5], l: m[1], sw: m[2], sl: m[3], verb: 'beat', kind: 'loss', at: m[4] === 'at' ? 'at' : null }) },
  // the sentence's subject, its first verb, then "but suffered": "The London Lions became the first British club to
  // face an NBA team but suffered a heavy 119-66 defeat to the Portland Trail Blazers" (Sky Sports 13 Oct: the bible's
  // own measured form, read only with its subject beside the verb until step 7). One clause, no comma, no second subject
  { re: new RegExp(`^(?:The\\s+)?${TEAM}\\s+(?!(?:said|says|insists?|claims?|believes?|thinks?)\\b)\\p{Ll}[^,.;:"“”]{2,90}?\\s+but\\s+(?:suffered|suffer|suffers)\\s+an?\\s+${ADJ}${SCORE}\\s+(?:defeat|loss|thrashing)\\s+(to|at|against|by)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[5], l: m[1], sw: m[2], sl: m[3], verb: 'beat', kind: 'loss', at: m[4] === 'at' ? 'at' : null }) },
  { re: new RegExp(`${TEAM}\\s+(?:lost|lose|loses|went\\s+down|go\\s+down|goes\\s+down|fell|were\\s+beaten|was\\s+beaten)\\s+${SCORE}\\s+(to|at|against|by)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[5], l: m[1], sw: m[2], sl: m[3], verb: 'beat', kind: 'loss', at: m[4] === 'at' ? 'at' : null }) },
  // draws: "A drew 1-1 with B", "A were held 1-1 by B", "A and B drew 2-2"
  { re: new RegExp(`${TEAM}\\s+(?:drew|draw|draws)\\s+${SCORE}\\s+(?:with|at|against)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ a: m[1], b: m[4], sw: m[2], sl: m[3], kind: 'draw' }) },
  { re: new RegExp(`${TEAM}\\s+(?:were|was)\\s+held\\s+(?:to\\s+an?\\s+)?${SCORE}\\s+(?:draw\\s+)?by\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ a: m[1], b: m[4], sw: m[2], sl: m[3], kind: 'draw' }) },
  { re: new RegExp(`${TEAM}\\s+and\\s+${TEAM}\\s+(?:drew|draw)\\s+${SCORE}\\b`, 'u'), map: (m) => ({ a: m[1], b: m[2], sw: m[3], sl: m[4], kind: 'draw' }) },
  // "Northern Ireland held Hungary to a goalless draw", "A and B played out a goalless draw" (0-0 in words)
  { re: new RegExp(`${TEAM}\\s+held\\s+(?:the\\s+)?${TEAM}\\s+to\\s+a\\s+goalless\\s+draw`, 'u'), map: (m) => ({ a: m[1], b: m[2], sw: '0', sl: '0', kind: 'draw', words: true }) },
  { re: new RegExp(`${TEAM}\\s+and\\s+${TEAM}\\s+(?:played\\s+out\\s+a|shared\\s+a|drew\\s+a)\\s+goalless\\s+draw`, 'u'), map: (m) => ({ a: m[1], b: m[2], sw: '0', sl: '0', kind: 'draw', words: true }) },
  // a summary's first line: "Buffalo Bills 37–34 Los Angeles Rams (OT)", "WXV: Canada 24-21 England." (a competition's label before it,
  // Guardian 17 Oct)
  { re: new RegExp(`^(?:[\\p{Lu}\\d][\\p{L}\\d&'’ -]{1,30}:\\s+)?${TEAM}\\s+${SCORE}\\s+${TEAM}(?=\\s*(?:\\(|$|\\p{Lu}))`, 'u'), map: (m) => (Number(m[2]) === Number(m[3]) ? { a: m[1], b: m[4], sw: m[2], sl: m[3], kind: 'draw' } : Number(m[2]) > Number(m[3]) ? { w: m[1], l: m[4], sw: m[2], sl: m[3], verb: 'beat', kind: 'line' } : { w: m[4], l: m[1], sw: m[3], sl: m[2], verb: 'beat', kind: 'line' }) },
];

// a score that is not a final result: odds, a record, a series, a lead, a season, the half-time score
const NOT_FINAL_AFTER = /^\s*(?:[\p{L}-]+\s+){0,2}?(?:lead|leads|down|up|shot|shots|on\s+aggregate|start|record|in\s+(?:ot|overtime)\s+games|series|aggregate|deficit|advantage|at\s+half|at\s+the\s+break|half-time|in\s+the\s+series)\b/iu;
const NOT_FINAL_BEFORE = /\b(?:a|an|the|their|his|her|its)?\s*(?:early|late|first-half|second-half|half-time|half time|interval)?\s*(?:lead|leading|led|trail|trailing|trailed|down|up)\s+(?:of\s+)?$/i;
const NOT_FINAL_ANYWHERE = /\b(?:half-time|half time|at the break|on aggregate|aggregate score|odds|bookmakers?|predicted|prediction|first-leg lead|take a \d+-\d+ lead)\b/i;
// a score that is wished, needed or imagined: a modal or a need just before it ("would need a 3-0 win")
const NOT_FINAL_MODAL = /\b(?:would|could|might|must|need|needs|needed|hope|hopes|hoping|aim|aims|bid|predict\w*|if)\b[^.;]{0,40}$/i;
// what a team's span may never be
const NOT_TEAM = /^(?:The|A|An|Les|La|Los|Las|El|Il|Le|Die|Der|Premier|League|Champions|Europa|Nations|Ligue|Serie|Bundesliga|LaLiga|World|Cup|FA|EFL|NFL|NBA|WNBA|MLB|NHL|Super|Test|Game|Week|Match|Matchday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|He|She|They|It|His|Her|Their|Its|We|Our|After|Before|With|In|On|At|For|From|Elsewhere|Meanwhile|Speaking|Despite|Following|When|While|As|But|And|Also|Then|Fans|Supporters|Players|Officials|Organisers|Organizers|Critics|Pundits|Owners|Bosses|Coaches|Reports|Sources)$/;
const PERSON_ROLE = /\b(?:manager|coach|boss|head coach|striker|midfielder|defender|goalkeeper|quarterback|captain|pundit|chairman|owner|president|player)\b/i;

/** A team's name as the board writes it: the span trimmed of a possessive and of words that are not part of a name. */
// cities whose names open with an article ("Los Angeles Rams"), unlike a nickname ("Les Bleus", "La Roja")
const ARTICLE_CITY = /^(?:Los Angeles|Las Vegas|Las Palmas|Le Havre|Le Mans|La Spezia|El Salvador|La Paz|Los Alamos)\b/;
function teamName(span) {
  let t = String(span || '').replace(/[.]+$/, '').replace(/['’]s?$/u, '').replace(/\s+/g, ' ').trim().replace(/-and-/g, ' and ');
  t = t.replace(/^(?:The|the)\s+/, '');
  const words = t.split(' ');
  if (!words.length || (NOT_TEAM.test(words[0]) && !ARTICLE_CITY.test(t)) || words.some((w) => NOT_TEAM.test(w) && words.length === 1)) return null;
  if (words.length > 4 || t.length > 28) return null;
  if (/\band\b/.test(t) && !AND_NAMES.test(t)) return null;
  // (a ground is no team: "with a 1-0 triumph at Carrow Road", Sky Sports 17 Oct)
  if (VENUE.test(t)) return null;
  return t;
}
// a ground or a course: the place a match was played, never one of its teams
const VENUE = /(?:^|\s)(?:Road|Park|Stadium|Arena|Ground|Lane|Gate|Field|Bridge|Cottage|Way|Street|Avenue|Dome|Centre|Center|Bowl|Gardens?|Oval|Court|Hall|Meadow|Brewery|Den|Valley|Rise|Moor|Common|Place|Square|Lodge|Racecourse)$|^(?:Anfield|Goodison|Wembley|Hampden|Ibrox|Twickenham|Murrayfield|Tynecastle|Pittodrie|Molineux|Hillsborough|Ascot|Aintree|Cheltenham|Newmarket|Epsom|Goodwood|Headingley|Edgbaston|Emirates|Etihad|Stade [\p{L} -]+)$/u;

/**
 * The scoreline one sentence states with certainty, for a story of `sport`: { winner, loser, home, away, a, b, sa, sb,
 * draw, verb, sentence }, or null. `winner`/`loser` are names (null on a draw); `home` is the home team's name only when
 * the sentence says who was at home ("home win", "loss at Coventry"); `sa`/`sb` are the winner's and loser's scores (a
 * draw: `a` and `b` in the source's order).
 */
export function scorelineFrom(sentence, sport) {
  return scorelinesOf(sentence, sport)[0] || null;
}

/** Every scoreline one sentence states with certainty ("Sweden beat Poland 3-1, Bosnia and Herzegovina overcame Romania 4-2"). */
export function scorelinesOf(sentence, sport) {
  if (!SCORED_SPORTS.has(sport)) return [];
  // a country's own "and" is held together while the sentence is read ("Bosnia and Herzegovina")
  const s = String(sentence || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().replace(AND_NAMES_G, (m) => m.replace(/ and /g, '-and-'));
  if (!(/\d\s*[-–]\s*\d/.test(s) || /\bgoalless draw\b/i.test(s)) || NOT_FINAL_ANYWHERE.test(s)) return [];
  // the whole sentence, then each clause of a list of results, every form's reading of each
  const clauses = s.split(/,\s+(?:and\s+)?|;\s+|\s+and\s+(?=\p{Lu}[^,]*(?:\d\s*[-–]\s*\d|goalless))/u);
  const readings = [];
  for (const c of clauses.length > 1 ? [s, ...clauses] : [s]) for (const r of readClause(c, sport, s)) readings.push(r);
  // one score read two ways (different teams) is no certainty: both go
  const out = [];
  for (const r of readings) {
    const pair = [r.a, r.b].sort().join('|');
    const clash = readings.some((o) => o.scoreAt === r.scoreAt && [o.a, o.b].sort().join('|') !== pair);
    if (!clash && !out.some((o) => [o.a, o.b].sort().join('|') === pair)) out.push(r);
  }
  return out.sort((x, y) => x.scoreAt - y.scoreAt).map(({ scoreAt, ...r }) => r);
}

function readClause(s, sport, sentence) {
  const found = [];
  for (const form of FORMS) {
    const m = form.re.exec(s);
    if (!m) continue;
    const sl = readMatch(form, m, s, sport, sentence);
    if (sl) found.push(sl);
  }
  return found;
}

function readMatch(form, m, s, sport, sentence) {
  {
    const r = form.map(m);
    const x = Number(r.sw);
    const y = Number(r.sl);
    // the score itself: not a season ("2027-28"), not odds or a record (the words around it), the numbers agreeing
    const at = r.words ? m.index + m[0].search(/goalless/i) : m.index + m[0].search(/\d\s*[-–]\s*\d/);
    const after = s.slice(at).replace(/^\d{1,3}\s*[-–]\s*\d{1,3}\)?/, '');
    if ((!r.words && NOT_FINAL_AFTER.test(after)) || NOT_FINAL_BEFORE.test(s.slice(0, at)) || NOT_FINAL_MODAL.test(s.slice(0, at)) || x > 200 || y > 200 || (x >= 1900 && x <= 2100)) return null;
    if (sport === 'football' && (x > 15 || y > 15)) return null;
    if (r.kind === 'draw' ? x !== y : x <= y) return null;
    const one = teamName(r.kind === 'draw' ? r.a : r.w);
    const two = teamName(r.kind === 'draw' ? r.b : r.l);
    if (!one || !two || one === two) return null;
    // a person who led a team ("Allen leads Bills…") is handled by its form; a span that is a person's role is no team
    if (PERSON_ROLE.test(`${one} ${two}`)) return null;
    let home = null;
    if (r.kind === 'win' && /home/i.test(r.home || '')) home = one;
    if (r.kind === 'win' && /away/i.test(r.home || '')) home = two;
    if (r.kind === 'loss' && r.at === 'at') home = one; // "their 4-1 loss at Coventry": Coventry won, at home
    if (r.kind === 'win' && r.at === true && !home) home = two; // "a 1-0 win at Espanyol": Espanyol lost, at home
    const scoreAt = sentence.indexOf(s) + at;
    const subject = r.subject ? { subject: true } : {};
    if (r.kind === 'draw') return { winner: null, loser: null, a: one, b: two, sa: x, sb: y, draw: true, home: null, verb: 'drew with', sentence: sentence.replace(/-and-/g, ' and '), scoreAt, ...subject };
    return { winner: one, loser: two, a: one, b: two, sa: x, sb: y, draw: false, home, verb: r.verb || 'beat', sentence: sentence.replace(/-and-/g, ' and '), scoreAt, ...subject };
  }
}

// a club's nickname is no name for a board ("the Gunners"); a generic short name ("City", "United") is read as the full
// name the story uses ("Manchester City"), or not at all
const NICKNAMES = /^(?:Gunners|Blues|Reds|Toffees|Magpies|Hammers|Cherries|Seagulls|Villans|Canaries|Foxes|Hornets|Eagles|Bees|Saints|Clarets|Owls|Blades|Baggies|Potters|Tigers|Lilywhites|Citizens|Cityzens|Red Devils|Black Cats|Sky Blues|Toon|Spurs|Wolves|Gers|Hoops|Bhoys|Dons|Robins|Swans|Terriers|Royals|Shrimpers|Bluebirds|Railwaymen|Cottagers|Pensioners|Trotters|Latics|Posh|Pompey)$/;
const GENERIC = /^(?:City|United|Town|Rovers|Athletic|County|Albion|Wanderers|Rangers|Villa|Palace|Forest|Hotspur|Argyle|Orient|Wednesday|Rovers)$/;
function fullName(name, context) {
  if (!GENERIC.test(name)) return name;
  const m = new RegExp(`\\b((?:\\p{Lu}[\\p{L}'’.-]*[ \\u00A0]+){1,2})${name}\\b`, 'u').exec(String(context || ''));
  return m && !NOT_TEAM.test(m[1].trim().split(/\s+/)[0]) ? `${m[1].trim()} ${name}` : null;
}

/**
 * Every scoreline a story's sentences state with certainty (one per pair of teams), in order. `context` is the story's
 * whole text, where a generic short name ("City's 3-0 win") finds its full name ("Manchester City").
 */
export function scorelinesIn(sentences, sport, context = '') {
  const out = [];
  for (const sent of sentences || []) {
    for (let sl of scorelinesOf(sent, sport)) {
      if (sport === 'football' && (NICKNAMES.test(sl.a) || NICKNAMES.test(sl.b))) continue;
      // (a sentence's subject read as the winner is a team only when the story never gives it a first name: "Greg Kiltie
      // scored…" is a player, "Ulster run in six tries…" a team)
      if (sl.subject && (personIn(sl.a, context) || personIn(sl.b, context))) continue;
      const a = fullName(sl.a, context);
      const b = fullName(sl.b, context);
      if (!a || !b || a === b) continue;
      const map = (n) => (n === sl.a ? a : n === sl.b ? b : n);
      sl = { ...sl, a, b, winner: sl.winner && map(sl.winner), loser: sl.loser && map(sl.loser), home: sl.home && map(sl.home) };
      if (!out.some((o) => [o.a, o.b].sort().join('|') === [sl.a, sl.b].sort().join('|'))) out.push(sl);
    }
  }
  return out;
}

// a headline's result in words ("Allen has monster day as Bills beat Rams in overtime thriller")
const HEADLINE_RESULT = new RegExp(`${TEAM}\\s+${WIN}\\s+${MAN}${TEAM}`, 'u');
const last = (name) => String(name || '').split(' ').at(-1).toLowerCase();
const escRe = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A one-word name the story gives with a first name before it ("Greg Kiltie" makes "Kiltie" a person, never a team). */
function personIn(name, context) {
  const n = String(name || '');
  if (!n) return false;
  // (a whole name read as a team: "Greg Kiltie … on their way to a 3-0 win" when the story has "Kiltie scored", "Kiltie struck")
  if (/\s/.test(n)) {
    const ws = n.split(/\s+/);
    return ws.length === 2 && !lookupPlace(ws[0]) && !GENERIC.test(ws[1]) && !NOT_TEAM.test(ws[0]) && new RegExp(`(?<![\\p{L}])${escRe(ws[1])}\\s+(?:scored|scores|struck|strikes|netted|nets|said|says|added|told|insisted|admitted|was booked|was sent off)\\b`, 'u').test(String(context || ''));
  }
  const m = new RegExp(`(?<![\\p{L}’'-])(\\p{Lu}\\p{Ll}+)[ \\u00A0]+${escRe(n)}(?![\\p{L}])`, 'u').exec(String(context || ''));
  // (never the first word of a club's own name: "Real Madrid", "Glasgow Warriors")
  return !!m && !NOT_TEAM.test(m[1]) && !lookupPlace(m[1]) && !GENERIC.test(n) && !/^(?:Real|Atletico|Atlético|Sporting|Inter|Racing|Athletic|Dynamo|Dinamo|Lokomotiv|Red|Young|Old|North|South|East|West|New|Saint|St|Port|Fort)$/.test(m[1]);
}

// ---- the result in words with its score from another sentence of the same story (17 Oct: a Saturday's match reports
// say the result in the headline, "Struggling Norwich beaten by Portsmouth", and the score in a sentence with one team,
// "Portsmouth piled on the misery … with a 1-0 triumph at Carrow Road")

const LOWER_ADJ = "(?:\\p{Ll}[\\p{L}-]*\\s+){0,2}";
// the result in words: who won and who lost (or a draw), with no score
const WORD_RESULTS = [
  // "Kiltie double helps Kilmarnock beat fellow-strugglers Motherwell", "Seven-try Connacht beat Saracens in Champions Cup"
  { re: new RegExp(`${TEAM}\\s+${WIN}\\s+${MAN}${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[1], l: m[3] }) },
  // "Struggling Norwich beaten by Portsmouth", "Sorry Derby beaten at home by Stoke"
  { re: new RegExp(`${TEAM}\\s+(?:(?:are|were|is|was)\\s+)?(?:beaten|defeated|downed|thrashed|hammered|edged\\s+out|stunned|toppled|routed|crushed)\\s+(at\\s+home\\s+|away\\s+)?by\\s+${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[3], l: m[1], home: /home/.test(m[2] || '') ? 'l' : /away/.test(m[2] || '') ? 'w' : null }) },
  // "Bitport beaten at Pixelburg": the winner at home
  { re: new RegExp(`${TEAM}\\s+(?:(?:are|were|is|was)\\s+)?(?:beaten|defeated|downed|thrashed|hammered|edged\\s+out|stunned|toppled|routed|crushed)\\s+at\\s+${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[2], l: m[1], home: 'w' }) },
  // "Murrell scores two as Falkirk claim Edinburgh double by beating Hibs"
  { re: new RegExp(`${TEAM}\\s+(?:(?!\\b(?:scor\\w*|goals?|netted|struck)\\b)[^,.;]){0,50}?\\bby\\s+(?:beating|defeating|thrashing|edging|downing|seeing\\s+off)\\s+${MAN}${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[1], l: m[2] }) },
  // "England's Rugby League World Cup defeat by Tonga"
  { re: new RegExp(`${TEAM}['’]s?\\s+(?:[\\p{L}-]+\\s+){0,5}?(?:defeat|loss)\\s+(?:by|to|against)\\s+(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[2], l: m[1] }) },
  // "England lose to Tonga"
  { re: new RegExp(`${TEAM}\\s+(?:lose|loses|lost|fall|falls|fell|go\\s+down|goes\\s+down|went\\s+down)\\s+to\\s+${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ w: m[2], l: m[1] }) },
  // draws: "Cameron equaliser earns a point for Dundee United at St Johnstone", "Arsenal held by Birmingham"
  { re: new RegExp(`\\b(?:point|draw)\\s+for\\s+(?:the\\s+)?${TEAM}\\s+(?:at|against|with)\\s+${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ a: m[1], b: m[2], draw: true }) },
  { re: new RegExp(`${TEAM}\\s+(?:(?:are|were|is|was)\\s+)?(?:held|draw|draws|drew)\\s+(?:by|with)\\s+${LOWER_ADJ}(?:the\\s+)?${TEAM}`, 'u'), map: (m) => ({ a: m[1], b: m[2], draw: true }) },
];

/** The result a headline or a standfirst states in words: { winner, loser, draw, home } (names as written), or null. */
export function resultInWords(text, sport) {
  if (!SCORED_SPORTS.has(sport)) return null;
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (/\?\s*$/.test(t.replace(/\s[-–—]\s.*$/, '')) || /\b(?:preview|ahead of)\b/i.test(t)) return null;
  const found = [];
  for (const f of WORD_RESULTS) {
    const m = f.re.exec(t);
    if (!m) continue;
    const r = f.map(m);
    const one = teamSpan(r.draw ? r.a : r.w);
    const two = teamSpan(r.draw ? r.b : r.l);
    if (!one || !two || one === two || PERSON_ROLE.test(`${one} ${two}`)) continue;
    found.push(r.draw ? { draw: true, a: one, b: two } : { winner: one, loser: two, home: r.home === 'w' ? one : r.home === 'l' ? two : null });
  }
  // (two readings of one headline that disagree are no certainty)
  const key = (r) => (r.draw ? `d|${[r.a, r.b].sort().join('|')}` : `w|${r.winner}|${r.loser}`);
  return found.length && found.every((r) => key(r) === key(found[0])) ? found[0] : null;
}

// a headline's team span: the name, without a word of the headline's own before it ("Struggling Norwich", "Six-try Ulster")
function teamSpan(span) {
  let t = String(span || '').replace(/['’]s?$/u, '').trim();
  const lead = /^(?:\p{Lu}\p{Ll}+(?:-\p{Ll}+)+|Struggling|Sorry|Improved|Battling|Brave|Rampant|Ruthless|Resurgent|Plucky|Ten-man|Nine-man|Unbeaten|Winless|Hapless|Sloppy|Lowly|Leaders|Champions|Holders|Hosts)\s+(?=\p{Lu})/u;
  while (lead.test(t)) t = t.replace(lead, '');
  return teamName(t);
}

// the abbreviations a headline uses for a name its story writes whole ("Sheff Utd", "Man City")
const SHORT_WORDS = { Utd: 'United', Sheff: 'Sheffield', Man: 'Manchester', Nottm: 'Nottingham', Wolves: 'Wolverhampton Wanderers' };

/** A headline's team as its story writes it ("Sheff Utd" -> "Sheffield United", "Bristol" -> "Bristol Bears"), else as given. */
function storyName(name, text) {
  const t = String(text || '');
  const long = name.split(' ').map((w) => SHORT_WORDS[w] || w).join(' ');
  for (const n of [long, name]) {
    // (the longer name the story gives, one or two capitalised words after it: "Bristol Bears"; never into a sentence's next one)
    const m = new RegExp(`(?<![\\p{L}’'-])${escRe(n)}((?:[ \\u00A0]+\\p{Lu}[\\p{L}'’.-]*){0,2})(?![\\p{L}])`, 'u').exec(t);
    if (!m) continue;
    const more = (m[1] || '').trim().split(/\s+/).filter(Boolean);
    const extra = [];
    for (const w of more) {
      if (!/^(?:United|City|Town|Rovers|Athletic|County|Albion|Wanderers|Rangers|Bears|Sharks|Warriors|Tigers|Saints|Chiefs|Falcons|Quins|Harlequins|Bulls|Lions|Stormers|Sharks|Rhinos|Giants|Wolves|Dragons|Knights|Raiders|Rabbitohs|Roosters|Storm|Broncos|Eels|Panthers|Titans|Cowboys|Dolphins|Sea\s?Eagles|Hotspur|Villa|Palace|Forest|Argyle|Orient|Wednesday|Academical|Thistle|Hearts)$/.test(w)) break;
      extra.push(w);
    }
    return teamName([n, ...extra].join(' ')) || n;
  }
  return name;
}

// the score of a result whose teams the headline names: "a 3-2 victory", "their 30-12 victory", "won 1-0", "a 0-0 draw"
const SCORE_NOUN = new RegExp(`\\b(?:an?|their|its|the)\\s+${ADJ}${SCORE}\\s+${ADJ}(?:home\\s+|away\\s+)?(win|victory|triumph|success|draw|defeat|loss)\\b|\\b(won|wins|win|lost|loses|lose|drew|draws)\\s+${SCORE}\\b`, 'u');
// a sentence about another match: an earlier one ("last week's 5-1 victory", "last Sunday in Aberdeen")
const ANOTHER_TIME = /\b(?:last (?:week|weekend|season|month|year|time|Sunday|Saturday|Monday|Tuesday|Wednesday|Thursday|Friday)|previous|earlier (?:this|in the) (?:season|month|week|campaign)|midweek|in (?:January|February|March|April|May|June|July|August|September|November|December))\b/i;

/**
 * The scoreline a story states across two of its own sentences: its headline (or standfirst, `lede`) names both teams
 * and who won in words, and one sentence of its copy gives that result's score beside one of those teams ("Struggling
 * Norwich beaten by Portsmouth" + "Portsmouth piled on the misery … with a 1-0 triumph at Carrow Road": Portsmouth beat
 * Norwich 1-0). Every condition of the one-sentence reading holds: a scored sport, a final result, the numbers agreeing
 * with the words; and the score's sentence names no other team after its result ("a 1-0 win over Hull") nor another
 * time ("last week's 5-1 victory"). [] when nothing is certain.
 */
export function pairedScorelines(heads, sentences, sport) {
  if (!SCORED_SPORTS.has(sport)) return [];
  const text = (sentences || []).join('\n');
  for (const h of heads || []) {
    const r = resultInWords(h, sport);
    if (!r) continue;
    const one = storyName(r.draw ? r.a : r.winner, text);
    const two = storyName(r.draw ? r.b : r.loser, text);
    const names = (n) => [n, n.split(' ').at(-1)].filter((x) => x.length >= 3 && !GENERIC.test(x));
    const named = (s, n) => names(n).some((x) => new RegExp(`(?<![\\p{L}’'-])${escRe(x)}(?![\\p{L}])`, 'u').test(s));
    for (const s0 of (sentences || []).slice(0, 10)) {
      const s = String(s0 || '').replace(/\s+/g, ' ').trim();
      if (NOT_FINAL_ANYWHERE.test(s) || ANOTHER_TIME.test(s.replace(/[“"][^”"]*[”"]/g, ' '))) continue;
      const m = SCORE_NOUN.exec(s);
      if (!m) continue;
      const noun = (m[3] || m[4] || '').toLowerCase();
      const x = Number(m[1] ?? m[5]);
      const y = Number(m[2] ?? m[6]);
      const at = m.index + m[0].search(/\d/);
      if (NOT_FINAL_BEFORE.test(s.slice(0, at)) || NOT_FINAL_MODAL.test(s.slice(0, at)) || NOT_FINAL_AFTER.test(s.slice(at).replace(/^\d{1,3}\s*[-–]\s*\d{1,3}/, ''))) continue;
      if (x > 200 || y > 200 || (sport === 'football' && (x > 15 || y > 15))) continue;
      const drawn = /draw|drew/.test(noun);
      if (drawn !== !!r.draw || (drawn ? x !== y : x === y)) continue;
      // (the sentence is about this match: one of its teams named, and no other team after its result)
      if (!named(s, one) && !named(s, two)) continue;
      const after = /^\s*(?:over|against|to|by|with|at)\s+(?:the\s+)?((?:\p{Lu}[\p{L}'’.-]*)(?:\s+\p{Lu}[\p{L}'’.-]*){0,3})/u.exec(s.slice(m.index + m[0].length));
      if (after) after[1] = after[1].replace(/[.'’]+$/, '');
      if (after && !VENUE.test(after[1]) && !named(after[1], one) && !named(after[1], two) && ![one, two].some((n) => named(n, after[1]))) continue;
      const hi = Math.max(x, y);
      const lo = Math.min(x, y);
      // (a win "at" the loser's ground is the loser's home: "a 2-1 win at Coventry")
      const home = r.draw ? null : r.home || (after && /^\s*at\b/.test(s.slice(m.index + m[0].length)) && named(after[1], two) ? two : null);
      const sentence = s;
      return [r.draw
        ? { winner: null, loser: null, a: one, b: two, sa: x, sb: y, draw: true, home: null, verb: 'drew with', sentence, paired: true }
        : { winner: one, loser: two, a: one, b: two, sa: hi, sb: lo, draw: false, home, verb: 'beat', sentence, paired: true }];
    }
  }
  return [];
}

/**
 * Does a story's copy name another result than its headline? "Bills beat Rams" over "…lifting the Buffalo Bills to a
 * thrilling 37-34 victory over the Los Angeles Chargers" (Sky Sports, 13 Oct: the copy's error) is a story the channel
 * cannot tell: one of the two is wrong, and nothing says which. True when a scoreline of the copy has one of the
 * headline's teams and not the other, or has them the other way round.
 */
export function headlineContradicts(title, scorelines) {
  const m = HEADLINE_RESULT.exec(String(title || '').replace(/\s+/g, ' '));
  if (!m) return false;
  const w = teamName(m[1]);
  const l = teamName(m[3]);
  if (!w || !l) return false;
  for (const sl of scorelines || []) {
    const names = [last(sl.a), last(sl.b)];
    const hasW = names.includes(last(w));
    const hasL = names.includes(last(l));
    if (hasW !== hasL) return true;
    if (hasW && hasL && !sl.draw && last(sl.winner) === last(l)) return true;
  }
  return false;
}

/** The result line SCORE CENTRE reads, in figures (the captions); the voice speaks the score in words (spokenScore). */
export function resultLine(sl) {
  if (!sl) return '';
  if (sl.draw) return `${sl.a} drew ${sl.sa}-${sl.sb} with ${sl.b}.`;
  return `${sl.winner} ${sl.verb} ${sl.loser} ${sl.sa}-${sl.sb}.`;
}

const ONES = ['nil', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n, zero) {
  if (n === 0) return zero;
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${words(rest, 'nil')}` : ''}`;
}

/**
 * A score as a results reader says it: "four one", "one all", "nil-nil", "thirty-seven thirty-four"; zero is "nil" in
 * football and rugby, "nothing" in no sport the channel reads ("zero" for the American sports).
 */
export function spokenScore(x, y, sport = 'football') {
  const zero = sport === 'football' || sport === 'rugby' ? 'nil' : 'zero';
  if (x === y) return x === 0 ? (zero === 'nil' ? 'nil-nil' : 'nothing each') : `${words(x, zero)} all`;
  return `${words(x, zero)} ${words(y, zero)}`;
}

// ---- THE MOMENT ON THE BOARD (docs/programmes/full-time.md §4): the distance of a goal or a kick, as the story says it

const NUMBER_WORD = new Map();
for (let n = 1; n <= 70; n++) NUMBER_WORD.set(words(n, 'nil'), n);
const DIST = `(\\d{1,2}|${[...NUMBER_WORD.keys()].sort((a, b) => b.length - a.length).join('|')})`;
const distNum = (x) => (/^\d+$/.test(x) ? Number(x) : NUMBER_WORD.get(x.toLowerCase()) || 0);
// (a shot or a kick that scored: never a miss, a save, the woodwork; never a run, a pass or a throw)
const MISSED = /\b(?:miss(?:ed|es)?|saved?|blocked|wide|no good|over the bar|hit the (?:post|bar|woodwork|upright)|off the (?:post|bar|upright)|doinked|denied)\b/i;
const NOT_A_KICK = /\b(?:run|ran|runs|rushed|rushing|pass(?:ed|es)?|throw|threw|catch|caught|carry|carried|return(?:ed)?|interception|sprint(?:ed)?)\b/i;
const SHOT_WORD = '(?:strike|shot|effort|volley|half-volley|drive|free[- ]kick|lob|chip|curler|goal|thunderbolt|piledriver|screamer|finish)';
const CHALK_FORMS = {
  football: [
    [new RegExp(`\\bfrom (?:fully |some |around |about |nearly |almost )?${DIST} yards\\b`, 'i'), 'yards'],
    [new RegExp(`\\b${DIST}[- ]yard ${SHOT_WORD}\\b`, 'i'), 'yards'],
  ],
  'american-football': [[new RegExp(`\\b${DIST}[- ]yard field goals?\\b`, 'i'), 'yards']],
  rugby: [
    [new RegExp(`\\b(?:penalty|drop goal|conversion|kick)\\b[^.;]{0,40}?\\bfrom (?:fully |some |around |about |nearly |almost )?${DIST} (?:metres|meters|m)\\b`, 'i'), 'metres'],
    [new RegExp(`\\b${DIST}[- ]?(?:metre|meter|m) (?:penalty|drop goal|kick)\\b`, 'i'), 'metres'],
  ],
};
// a goal or kick sentence: in football a word of scoring must be there ("scored from 30 yards", "a 25-yard strike")
const SCORED_WORD = /\b(?:scor(?:ed|es|ing)|goal|netted|nets|fired|fires|curled|curls|struck|strikes|smashed|lashed|drilled|rifled|volleyed|lobbed|chipped|bent|found the (?:net|corner|top corner)|into the (?:net|top corner|bottom corner))\b/i;

/**
 * The moment's distance, from the sentences said on air: { yards | metres, sport, label? } or null. Football: "scored
 * from 30 yards", "a 25-yard strike", "from the spot" (THE PENALTY SPOT, 12 yards); American football: "a 45-yard
 * field goal"; rugby: "a penalty from 45 metres". Only the three grounds the board draws, only 1 to 70, only a kick
 * that scored, and only when the text gives one distance (two numbers would leave the board to guess).
 */
export function chalkOf(text, sport) {
  const forms = CHALK_FORMS[sport];
  if (!forms) return null;
  const sentences = String(text || '').replace(/\[[^\]]*\]\s*/g, '').split(/(?<=[.!?])\s+/);
  const found = [];
  for (const s of sentences) {
    if (MISSED.test(s)) continue;
    if (sport === 'football' && /\bfrom the (?:penalty )?spot\b/i.test(s)) {
      found.push({ yards: 12, sport, label: 'THE PENALTY SPOT' });
      continue;
    }
    // (every distance in the sentence: "from 20 yards and then from 25 yards" is two, and the board shows one)
    const here = [];
    for (const [re, unit] of forms) {
      for (const m of s.matchAll(new RegExp(re.source, 'gi'))) {
        if (NOT_A_KICK.test(s.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30))) continue;
        if (sport === 'football' && !SCORED_WORD.test(s)) continue;
        here.push({ [unit]: distNum(m[1]), sport });
      }
    }
    found.push(...here.filter((f) => (f.yards ?? f.metres) >= 1 && (f.yards ?? f.metres) <= 70));
    if (here.some((f) => (f.yards ?? f.metres) > 70)) found.push({ tooFar: true });
  }
  // (a distance past the board's 70 makes the moment one it cannot draw: no board rather than the wrong one)
  if (found.some((f) => f.tooFar)) return null;
  const distinct = [...new Map(found.map((f) => [JSON.stringify(f), f])).values()];
  return distinct.length === 1 ? distinct[0] : null;
}

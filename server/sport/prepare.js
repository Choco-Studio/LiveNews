// FULL TIME's stories, made ready before a writer sees them (docs/programmes/full-time.md §3): every sentence said from
// the day it airs and free of the outlets' verdicts on players, so neither writer can read out "tonight" for a game
// already played nor "a brilliant goal"; each story with its sport, its strap tag, its scorelines and fixtures. Then
// the running order's balance: not a Premier League show.
import { isGrave, sentencesIn } from '../facts.js';
import { lookupPlace } from '../gazetteer.js';
import { isFragment, splitClauses } from '../writer.js';
import { isWomensSport, rugbyCode, sportOf, sportTag } from './desk.js';
import { headlineContradicts, pairedScorelines, resultInWords, scorelinesIn } from './scores.js';
import { fixturesIn } from './fixtures.js';
import { retime, withoutJudgement } from './words.js';

// an outlet's own furniture in an article ("The Sky Sports app is better than ever - tap to find out why")
const PROMO = /\b(?:app is better than ever|tap to find out|download the|sign up|subscribe|follow us|click here|watch (?:live|it|the highlights) on|available on (?:sky|bbc|now|the)|listen to|read more|get the latest|newsletter|sky sports app|bbc sport app|live on sky sports|on demand|iplayer|get in touch|email us|let us know|reading on|sky sports scores|scores app|not got sky|got sky|on your phone|stream (?:it|live|every)|get sky sports|contract-free|notifications you want|choose the sky sports|sky sports notifications|download the app)\b/i;
// a clause that lost its main clause ("As Luis Enrique bids to guide PSG to a third successive Champions League triumph.")
const SUBORDINATE = /^(?:As|While|Although|Though|Because|If|When|Since|After|Before|Whereas|Unless|Once|Until)\b(?![^,]*,\s*\p{L})/u;
// a count that points back ("He was named the Finals' Most Valuable Player in all six", BBC Sport 13 Oct, after a
// sentence about his sixth title): it stands only straight after the sentence that gives that number
const COUNT_BACK = /\b(?:in|of|from)\s+(?:all|both|each of the|the other)\s+(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/i;
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
const givesCount = (t, n) => {
  const k = /^\d+$/.test(n) ? Number(n) : NUMBER_WORDS.indexOf(n.toLowerCase());
  return new RegExp(`\\b(?:${k}|${NUMBER_WORDS[k] || k}|${ORDINALS[k] || k})\\b`, 'i').test(t);
};
/** Does a sentence point back to a count ("in all six") that the sentence before it does not give? */
export const leansOnCount = (t, prev) => {
  const back = COUNT_BACK.exec(String(t || ''));
  return !!back && !givesCount(String(prev || ''), back[1]);
};
const BARE_NOUN_START = /^(Tournament|Match|Game|Club|Team|Player|Manager|Coach|Striker|Midfielder|Defender|Goalkeeper|Forward|Winger|Quarterback|Competition|Event|Race|Final|Squad|Side|Champion|Holder|Holders|Skipper|Captain|Referee|Fixture|Season)(?=\s+(?:is|was|has|have|had|will|would|could|can|must|may|might|faces?|returns?|remains?|said|says)\b)/;
// a sentence that follows on from the one before it ("That was despite topping the table since September…", Sky Sports
// 13 Oct, after a sentence that went): it goes when that one went
export const FOLLOWS_ON_START = /^(?:But|And|So|Yet|Still|However|Instead|Meanwhile|Nevertheless|Nonetheless|Then|In the end|In response|As a result|Despite that|Despite this|Even so|By then|Not only that|On top of that|What is more|What's more|That|This|These|Those|Which|He|She|They|It|His|Her|Their|Its)\b/;
// a question the outlet asks its reader ("Watch Scottish Premiership games on your phone Not got Sky?"), never a quotation;
// and one it asks in a statement's clothes ("The question is whether England's World Cup hopes are also over already.", BBC
// Sport 17 Oct: the outlet's speculation, never ours to air)
const READER_QUESTION = (t) => (/\?\s*$/.test(t) && !/["”’]\s*$/.test(t.trim())) || /^(?:And\s+)?the\s+(?:big\s+|real\s+|only\s+|obvious\s+|key\s+)?question\s+(?:now\s+)?(?:is|remains|will be)\b/i.test(t.trim());
// a crosshead the page ran into the next sentence ("Suljovic apologises over incident On Monday afternoon, Suljovic
// subsequently issued an apology", Sky Sports 13 Oct): the sentence starts where the capital says it does
const CROSSHEAD = /^(.{8,80}?[\p{Ll}\d])\s+((?:On|In|At|After|Before|During|But|However|Meanwhile|Speaking|Asked|When|While|The|He|She|They|It)\s+\S.*)$/u;
const unglue = (t) => {
  const m = CROSSHEAD.exec(t);
  // (a crosshead may have its colon, "Carra: Newcastle 'beaten up' again It is the first time since December 2012…")
  return m && !/[,;]/.test(m[1]) && !/\b(?:is|are|was|were|has|have|had|said|says|will)\b/.test(m[1]) ? m[2] : t;
};
// betting's language inside a story (§3.1: never odds, betting or tips): "having entered the game as 36.5-point
// favourites" (Sky Sports 13 Oct, the London Lions in Portland) is a point spread read out as news. The clause goes; a
// sentence that still carries odds goes whole. ("As underdogs", with no price, is the outlet's description and stays.)
// (and a racing price: "who obliged as the 5-4 market leader", Sky Sports 17 Oct)
const ODDS = /\b(?:\d+(?:\.\d+)?-point\s+(?:favou?rites?|underdogs?)|odds(?:-on|-against)?|bookmakers?|bookies|betting|point spread|favou?rites?\s+at\s+\d+\/\d+|\d+\/\d+\s+(?:favou?rites?|shot|outsiders?|chance)|\d+[-/]\d+\s+(?:market\s+leader|(?:joint-|joint\s+|second\s+)?favou?rite|shot|outsider|chance|price)|market\s+leader|evens\s+favou?rite|starting\s+price)\b/i;
const ODDS_CLAUSE = /,\s*(?:(?:having|after)\s+)?(?:entered|started|gone into|come into|went into|came into|begun|began|been)\b(?:[^,.;]|\d\.\d)*?\b(?:favou?rites?|underdogs?)\b[^,.;]*(?=[.;!]?\s*$)|,\s*(?:who|which)\s+(?:obliged|went off|was sent off|started|won|scored)\s+as\s+(?:the\s+)?\d+[-/]\d+\s+[^,.;]*(?=[.;!]?\s*$)/i;
/** A sentence without its betting clause, or null when odds are its point. */
export function withoutOdds(t) {
  const s = String(t || '');
  if (!ODDS.test(s)) return s;
  const left = s.replace(ODDS_CLAUSE, '');
  return ODDS.test(left) ? null : left.replace(/\s+([.;!])$/, '$1');
}
// a page's furniture run into a sentence: a video link's caption and its bar ("Ombudsman strikes Champion Stakes gold | Full
// replay Almeraq proves his class in British Champions Sprint John Gosden said: …", Sky Sports 17 Oct, which once gave John
// Gosden the first names "British Champions Sprint")
const FURNITURE = (t) => /\s\|\s/.test(String(t).replace(/[“"][^”"]*[”"]/g, ' ')) || /\b(?:full replay|watch the highlights|watch highlights|match highlights|free match highlights|report and free)\b/i.test(t);
/**
 * A standfirst's statement without the question the outlet tacks on to it: "Brian McDermott says he can fix the errors that
 * led to England's Rugby League World Cup defeat by Tonga - but is it already too late?" (BBC Sport 17 Oct) says its news
 * before the dash; the question is the outlet's, never ours to ask.
 */
export function withoutAskingTail(t) {
  const s = String(t || '');
  const m = /^(.{30,}?[\p{L}\d’'”"])\s+[-–—]\s+(?:but|so|and|yet)\s+[^.?!]*\?\s*$/iu.exec(s);
  return m && m[1].split(/\s+/).length >= 6 ? `${m[1]}.` : s;
}
// the outlet talking to its reader about its own page: "No, there is nothing wrong with whatever device you are reading this
// on. The 24-21 scoreline is correct. Yes, it finally happened." (Guardian 17 Oct, the Red Roses' first defeat in four years)
const OUTLET_ASIDE = /\b(?:scoreline is (?:correct|right)|is not a (?:typo|misprint)|you read that (?:right|correctly)|nothing wrong with (?:whatever|your) (?:device|screen)|believe it or not)\b|^Yes,\s+(?:it|they|she|he)\s+(?:finally\s+|really\s+)?(?:happened|did)\b/i;
const clean = (sentences, opts) => {
  const out = [];
  let prev = '';
  let lost = false;
  for (const t0 of sentencesIn(sentences)) {
    if (FURNITURE(t0)) {
      prev = '';
      lost = true;
      continue;
    }
    // (an extractor's space before a possessive, "Chelsea 's win", "Haaland 's fitness", ESPN and BBC pages 17 Oct, closed up)
    const t = unglue(withoutAskingTail(t0.replace(/(\p{L}) (['’]s)(?=\s|[,.;:!?]|$)/gu, '$1$2')));
    const kept = !PROMO.test(t) && !OUTLET_ASIDE.test(t) && !READER_QUESTION(t) && !SUBORDINATE.test(t.trim()) && !isFragment(t) && !leansOnCount(t, prev) && !(lost && FOLLOWS_ON_START.test(t.trim()));
    let said = kept ? withoutJudgement(retime(t, opts) ?? '') : null;
    if (said) said = withoutOdds(said);
    // a bullet point's headline-ese gets its article ("Tournament is due to kick off in January…", Guardian 13 Oct)
    if (said) said = said.replace(BARE_NOUN_START, (m, noun) => `The ${noun.toLowerCase()}`);
    // (after a sentence that went, an "also" has nothing to add to: "Brad O'Neill also returns…")
    if (said && lost) said = said.replace(/^([^,;:.]{0,80}?)\s+also\b/i, '$1');
    // (a long sentence that joins two clauses is told as two: "…an unbeaten five-game start across all competitions, but
    // recent results have seen his side fall to 11th…", Sky Sports 13 Oct; each half can then be told or put to Rosa)
    const two = said && said.split(/\s+/).length > 28 ? splitClauses(said, 28, 6) : null;
    if (two) out.push(...two);
    else if (said && said.trim()) out.push(said);
    // (a sentence that went takes its count and its antecedent with it: the next one cannot point back to it)
    prev = said && said.trim() ? said : '';
    lost = !(said && said.trim());
  }
  return out;
};
// a moment of the day (§4): a record, a milestone, an auction, a farewell, a catch; never grave
const MOMENT = /\b(?:record|records|sells? for|sold for|bought for|auction|memorabilia|milestone|youngest|oldest|first ever|first-ever|historic|history made|makes history|viral|mascot|bananas|troll\w*|celebrat\w*|catch|juggling|photo-finish|farewell|last dance|grandmaster|prodigy)\b/i;

/**
 * A copy of a sport story made ready for FULL TIME, or null when nothing fit to air is left: its summary and article
 * re-timed and without verdicts (a sentence that cannot be kept goes), its headline without verdicts (a headline that
 * judges a person outright drops the story), and its sport, tag, women's flag, scorelines and fixtures.
 */
export function prepareStory(story, { now = Date.now(), tz = 'Europe/London' } = {}) {
  if (!story) return null;
  // (when the story was reported: an undated item's time is when the desk first saw it, never the age of the last reading,
  // server/news.js `firstSeen`)
  const when = Number(story.firstSeen) || Number(story.published) || now;
  const opts = { published: when, now, tz };
  const title = withoutJudgement(retime(String(story.title || ''), opts) ?? '');
  if (!title) return null;
  const summary = clean(String(story.summary || ''), opts);
  const body = story.body ? clean(String(story.body), opts) : [];
  if (summary.length + body.length < 2) {
    // (a one-line match report is no story to tell, but its result is a result: "… as Southampton dropped points at home
    // for the first time this season with a 0-0 draw against Bolton", Sky Sports 17 Oct, kept for SCORE CENTRE only)
    const sport = sportOf(story);
    const lines = [title, ...summary];
    const results = scoresOf(story, title, lines, sport);
    if (!results.length || headlineContradicts(title, results) || isGrave(`${title}. ${summary.join(' ')}`)) return null;
    return { ...story, published: when, title, summary: summary.join(' '), sport, sportTag: sportTag(story), womens: isWomensSport(story), resultOnly: true, scorelines: results.map((sl) => ({ ...sl, sport, storyId: story.id, published: when })), fixtures: [] };
  }
  // one person, two first names ("head coach Brian McDermott" in the summary, "head coach Brad McDermott" in the article,
  // Sky Sports 13 Oct): the outlet got one of them wrong, and the channel says the first only
  const firstSeen = new Map();
  const variant = (t) => [...String(t).matchAll(/\b(\p{Lu}\p{Ll}+)\s+(\p{Lu}[\p{L}'’]{2,}(?:-\p{Lu}\p{Ll}+)?)(?![\p{L}])/gu)].some((m) => {
    const known = firstSeen.get(m[2]);
    if (!known) return firstSeen.set(m[2], m[1]) && false;
    return known !== m[1] && !/^(?:Mr|Mrs|Ms|Dr|Sir|Lord|Lady|The|And|But|Head|Coach|Manager|Captain|Boss|Chairman|Striker|Defender|Midfielder|Goalkeeper|Winger|Forward|Prop|Hooker|Scrum|Fly|Full|Centre|Opener|Bowler|Batter|Driver|Rider|Team|Former|Ex|New|Old|Young|Saint|St|Real|Inter|Sporting|Athletic|Atletico|United|City|Town|County|Rovers|Wanderers|Albion|North|South|East|West|Great|Little|Grand|Premier|Super|League|World|Golden|Gold|Coast|Titans|Hull|Leeds|Leigh|London|Manchester|Newcastle)$/.test(m[1]) && !/^(?:Mr|Mrs|Ms|Dr|Sir|Lord|Lady|The|And|But|Head|Coach|Manager|Captain|Boss|Chairman|Former|New|Saint|St)$/.test(known);
  });
  for (const t of [...summary]) variant(t);
  // a sentence about another sport is the article's tangent ("F1 is pressing ahead with plans to run the races in Qatar
  // and Abu Dhabi", in a BBC report of a football match delayed by a missile alert, 13 Oct): out of its article it is
  // a non sequitur
  const own = sportOf(story);
  const tangent = (t) => {
    const other = sportOf({ title: t, summary: '', link: '' });
    return !!own && !!other && other !== own;
  };
  const bodyKept = body.filter((t) => !variant(t) && !tangent(t));
  body.splice(0, body.length, ...bodyKept);
  // a one-line standfirst is filled out from the article's next sentences (three at most): THE NUMBER, the figures and
  // THE BREAKDOWN read a story's summary first, and a sport standfirst rarely carries its figure
  const key = (t) => t.toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();
  for (const t of body) {
    if (summary.length >= 3) break;
    if (!summary.some((x) => key(x) === key(t))) summary.push(t);
  }
  const sport = sportOf(story);
  const all = [title, ...summary, ...body];
  const scorelines = scoresOf(story, title, all, sport);
  // a headline and a copy that name different results: one of them is wrong, and nothing says which
  if (headlineContradicts(title, scorelines)) return null;
  // the result the story is about, as its headline or standfirst says it in words (who won; a result story says it, §4)
  const result = resultInWords(title, sport) || resultInWords(withoutAskingTail(sentencesIn(String(story.summary || ''))[0] || ''), sport);
  return {
    ...story,
    published: when,
    title,
    summary: summary.join(' '),
    ...(story.body ? { body: body.join(' ') } : {}),
    sport,
    ...(sport === 'rugby' && rugbyCode(story) ? { code: rugbyCode(story) } : {}),
    moment: MOMENT.test(title) && !isGrave(`${title}. ${summary.join(' ')}`),
    sportTag: sportTag(story),
    womens: isWomensSport(story),
    ...(result ? { result } : {}),
    people: peopleIn(`${story.title || ''}.\n${story.summary || ''}\n${story.body || ''}`),
    scorelines: scorelines.map((sl) => ({ ...sl, sport, storyId: story.id, published: when })),
    fixtures: fixturesIn(all, opts).map((f) => ({ ...f, sport, storyId: story.id })),
  };
}

// ---- the people a story names: their whole names as the outlet gives them (17 Oct: "Loughnane, 20, has become youngest
// champion jockey" for Billy Loughnane; "Yarmolyuk" for Yehor Yarmolyuk, whose whole name was in a sentence the desk drops)
// (and a sentence's common first word: "Ronaldo scores as Once Al-Nassr win…", the regression of round 3 that the people map
// brought back for one reading, 17 Oct)
const NOT_GIVEN = /^(?:Once|Twice|Only|Even|Yet|Still|Here|There|Today|Tonight|Earlier|Later|Last|Next|First|Second|Third|Finally|Overall|Despite|During|Following|Without|Within|Across|Among|Amid|Beyond|Inside|Outside|Through|Throughout|Unlike|Like|Watch|Read|Report|Reports|Separate|Several|Many|Most|Other|Another|Fellow|Local|Rival|Defending|Reigning|Visiting|Home|Away|Struggling|Sorry|Improved|Battling|Brave|Seven|Six|Five|Four|Three|Two|One|Ten|Nine|Eight|Goalkeeper|Keeper|Striker|Forward|Winger|Defender|Midfielder|Captain|Skipper|Referee|Chairman|President|Director|Owner|Coach|Manager|Boss|Prop|Hooker|Lock|Flanker|Centre|Wing|Replacement|Substitute|Teenager|Youngster|Veteran|Rookie|Quarterback|Opener|Bowler|Batter|Jockey|Trainer|Driver|Rider|Champion|Midfield|The|A|An|And|But|Or|So|In|On|At|For|With|From|By|After|Before|When|While|As|If|Since|Until|Although|Though|Because|Despite|During|Following|Against|Between|Without|Under|Over|Meanwhile|Elsewhere|However|Also|Still|Even|Only|Just|Now|Then|Today|Yesterday|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Lord|Lady|Captain|Coach|Manager|Boss|Head|Chairman|Former|New|Old|Young|Premier|Champions|Champion|League|Cup|World|Super|Grand|Rugby|Formula|European|National|International|Royal|Golden|Real|Atletico|Atlético|Sporting|Inter|Saint|St|Port|Fort|North|South|East|West|Northern|Southern|Eastern|Western|Great|Little|Upper|Lower|City|United|Town|County|Bay|Lake|Mount|River|Sky|Bet|Live|Match|Game|Week|Day|Game|Team|Club|Group|Pool|Round|Race|Stakes|Prix|Open|Test|Series|Final|Finals|Scottish|English|British|Irish|Welsh|French|Spanish|Italian|German|Dutch|Belgian|Portuguese|Brazilian|Argentine|Australian|American|Canadian|Mexican|Japanese|Chinese|Indian|African|Asian|Latvian|Swiss|Swedish|Norwegian|Danish|Polish|Croatian|Serbian|Greek|Turkish|Russian|Ukrainian|Fijian|Samoan|Tongan|Welshman|Scot|Spaniard|Frenchman|Englishman|Irishman|His|Her|Their|Its|Our|Your|My|This|That|These|Those|Every|Each|Both|All|Some|Any|No|Not|Yes|Here|There|Where|What|Who|Why|How|Which|Whose)$/;
const PLACE_GIVEN = /^(?:Jordan|Georgia|Sydney|Chad|Israel|Brooklyn|Florence|Victoria|Austin|Dallas|Lincoln|Madison|Chelsea|Adelaide|Savannah|Phoenix|Denver|Eden|Orlando|Kendal|Carlton|Clifton|Preston|Stanley|Ashley|Bradley|Shelby|Tyrone|Kingsley)$/;
const NOT_SURNAME = /^(?:City|United|Town|Rovers|Athletic|County|Albion|Wanderers|Rangers|Villa|Palace|Forest|Hotspur|Argyle|Orient|Wednesday|Academical|Thistle|Hearts|League|Cup|Open|Championship|Premiership|Series|Prix|Stakes|Park|Stadium|Road|Arena|Ground|Lane|Gate|Field|Bridge|Bears|Sharks|Warriors|Tigers|Saints|Chiefs|Falcons|Harlequins|Bulls|Lions|Stormers|Rhinos|Giants|Wolves|Dragons|Knights|Raiders|Dream|Valkyries|Wizards|Commanders|Giants|Club|Sport|Sports|News|Times|Post|Championships|Games|Olympics|Trophy|Shield|Plate|Masters|Classic|Derby|Guineas|Oaks|Final|Finals|International|Internationals|Nations|Union|Federation|Association|Council|Board|Authority|Committee|Sprint|Roller|Ireland|England|Scotland|Wales|France|Spain|Italy|Germany|Bills|Rams|Chargers|Jets|Eagles|Cowboys|Packers|Vikings|Panthers|Buccaneers|Seahawks|Cardinals|Steelers|Ravens|Browns|Bengals|Texans|Colts|Titans|Jaguars|Broncos|Dolphins|Patriots|Lakers|Celtics|Knicks|Nets|Heat|Clippers|Suns|Spurs|Rockets|Mavericks|Thunder|Nuggets|Jazz|Kings|Pistons|Pacers|Bucks|Hawks|Hornets|Magic|Raptors|Cavaliers|Grizzlies|Pelicans|Timberwolves|Blazers|Yankees|Dodgers|Mets|Cubs|Sox|Astros|Phillies|Mariners|Padres|Braves|Brewers|Guardians|Orioles|Jays|Twins|Rays|Royals|Reds|Pirates|Nationals|Marlins|Rockies|Diamondbacks|Angels|Liberty|Aces|Fever|Lynx|Mercury|Storm|Sparks|Mystics|Oilers|Canucks|Leafs|Canadiens|Bruins|Penguins|Flyers|Capitals|Blackhawks|Avalanche|Islanders|Devils|Sabres|Senators|Flames|Jets|Predators|Kraken)$/;
/**
 * The whole names a story's own text gives its people, from its headline, standfirst and article as the outlet wrote them
 * (before anything went): { surname: given name }, one given name a surname or none (two people of one name, "John and Thady
 * Gosden", are left alone).
 */
export function peopleIn(text) {
  const out = {};
  const clash = new Set();
  const src = String(text || '');
  // (two words alone: never a first name and a middle one, "Goalkeeper Alex Paulsen", "Anis Ben Slimane")
  for (const m of src.matchAll(/(?<![\p{L}’'.-])(?<!\p{Lu}[\p{L}-]*[ \u00A0]+)(\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)?)[ \u00A0]+((?:Mc|Mac|O['’]|De|Di|Van|Von|Le|La)?\p{Lu}[\p{Ll}’'-]+(?:-\p{Lu}\p{Ll}+)?)(?![\p{L}])(?![ \u00A0]+(?:Mc|Mac|O['’]|De|Di|Van|Von|Le|La)?\p{Lu})/gu)) {
    const given = m[1];
    const sur = m[2].replace(/['’]s$/u, '');
    // (a first name that is a place too is one only when it is a common first name: "Jordan Henderson", never "Paris
    // Saint-Germain"; ESPN 17 Oct)
    if (sur.length < 3 || NOT_GIVEN.test(given) || NOT_SURNAME.test(sur) || NOT_GIVEN.test(sur) || (lookupPlace(given) && !PLACE_GIVEN.test(given)) || lookupPlace(sur)) continue;
    // (a common word that opens a sentence is no first name: "Separate Saracens and England cricket nights out had converged…",
    // Sky Sports 13 Oct, once made "Separate Saracens have sacked…"; an adjective's, an adverb's or a participle's ending, at a
    // sentence's start only: inside one, after a lower-case word, "Erling Haaland" is a name)
    const opens = /(?:^|[.!?:;]["”’]?\s+|\n\s*|["“‘(]\s*)$/u.test(src.slice(0, m.index));
    if (opens && given.length > 5 && /(?:ly|ous|ive|ing|ed|ful|less|est|ical|ate|ant|ent|ary|ory)$/.test(given) && !/^(?:Vincent|Laurent|Clement|Florent|Kent|Brent|Grant|Bryant|Erling|Sterling)$/.test(given)) continue;
    // (a sentence's first word the text also writes in lower case is a common word: "Friends Malcolm…")
    if (new RegExp(`(?<![\\p{L}])${given.toLowerCase()}(?![\\p{L}])`, 'u').test(src)) continue;
    if (out[sur] && out[sur] !== given) clash.add(sur);
    else out[sur] = given;
  }
  for (const s of clash) delete out[s];
  return out;
}

/**
 * Every scoreline a story states with certainty: those one sentence states with both teams, then the one its headline
 * (or standfirst) states in words with its score in a sentence of the copy (scores.js pairedScorelines), when that pair
 * of teams has none yet.
 */
function scoresOf(story, title, sentences, sport) {
  const context = sentences.join('\n');
  const out = scorelinesIn(sentences, sport, context);
  const heads = [title, withoutAskingTail(sentencesIn(String(story.summary || ''))[0] || '')];
  for (const sl of pairedScorelines(heads, sentences.slice(1), sport)) {
    const pair = [sl.a, sl.b].sort().join('|');
    const last = (n) => String(n).split(' ').at(-1);
    if (!out.some((o) => [o.a, o.b].sort().join('|') === pair || [last(o.a), last(o.b)].sort().join('|') === [last(sl.a), last(sl.b)].sort().join('|'))) out.push(sl);
  }
  // the article page's own headline, when the feed's headline says the same result in words: "Champions Cup: Connacht
  // 45-36 Saracens - Hosts score seven tries in pool victory" on the page of "Seven-try Connacht beat Saracens in Champions
  // Cup" (BBC Sport 17 Oct); never a live page's, a preview's or one whose winner the words do not name
  const pageTitle = String(story.pageTitle || '');
  const words = pageTitle && !out.length && !/\b(?:live|as it happened|preview|team news|ratings|predictions?|odds)\b/i.test(pageTitle) ? resultInWords(title, sport) : null;
  if (words) {
    const last = (n) => String(n).split(' ').at(-1);
    const line = `${pageTitle.split(/\s+[-–|]\s+/)[0].trim().replace(/[.!]+$/, '')}.`;
    for (const sl of scorelinesIn([line], sport, line)) {
      const winner = sl.sa > sl.sb ? sl.a : sl.sb > sl.sa ? sl.b : null;
      const agrees = words.draw
        ? !winner && [last(sl.a), last(sl.b)].sort().join('|') === [last(words.a), last(words.b)].sort().join('|')
        : !!winner && last(winner) === last(words.winner) && last(winner === sl.a ? sl.b : sl.a) === last(words.loser);
      if (agrees) out.push({ ...sl, fromPage: true });
    }
  }
  return out;
}

/** Every story of the desk's list made ready (those left with nothing fit to air are dropped). */
export function prepareStories(stories, opts = {}) {
  return (stories || []).map((s) => prepareStory(s, opts)).filter(Boolean);
}

// a club, within one sport: a scoreline's teams, or the capitalised names a headline opens with
const clubsOf = (s) => {
  const names = new Set();
  for (const sl of s.scorelines || []) names.add(`${s.sport}|${sl.a}`).add(`${s.sport}|${sl.b}`);
  const m = /^((?:\p{Lu}[\p{L}'’.-]*\s?){1,3})/u.exec(String(s.title || ''));
  if (m) names.add(`${s.sport}|${m[1].trim().replace(/['’]s$/, '')}`);
  return [...names];
};

/**
 * FULL TIME's balance (§3.2), applied to the desk's ranked list before the writer chooses: the list keeps its order (the
 * strongest story leads) but a story that would break a rule waits at the back: football at most half, one club in at
 * most two stories (within a sport), and, when the desk has them, three sports and a women's story with a picture and
 * two sentences of its own among the first `count`. A story that led an edition in the last three hours with nothing
 * new does not lead (`ledLately(id)`). The returned list's `edition` is how many of its first stories the edition may
 * tell; the others are there for SCORE CENTRE and COMING UP.
 */
export function balance(stories, { count = 10, ledLately = () => false, now = Date.now() } = {}) {
  // (a one-line report kept for its result is never told: it waits behind everything, for SCORE CENTRE)
  const resultsOnly = (stories || []).filter((s) => s?.resultOnly);
  const list = [...(stories || [])].filter((s) => !s?.resultOnly);
  if (!list.length) return Object.assign([...resultsOnly], { edition: 0 });
  // the lead: the story most told (a match told by three outlets, or twice by one), among the desk's first eight, never
  // one that led lately; on a tie a result among the desk's first three before team news, then the desk's order
  const coverage = (s) => list.filter((o) => o !== s && sameEvent(o, s)).length;
  // (never a day-and-a-half-old story while a fresher one is there: on Thursday, Monday's match is no lead)
  const stale = (s) => Number.isFinite(Number(s.published)) && now - Number(s.published) > 30 * 3600_000;
  const anyFresh = list.slice(0, 8).some((s) => !stale(s));
  const top = list.slice(0, 8).map((s, i) => ({ s, i, c: ledLately(s.id) || s.moment || (anyFresh && stale(s)) ? -1 : coverage(s), r: i < 3 && s.scorelines?.length ? 1 : 0 }));
  let best = top.sort((a, b) => b.c - a.c || b.r - a.r || a.i - b.i)[0];
  // (of a match told twice, the result leads and the reaction follows: never "Jaissle sorry…" before "Coventry thump…")
  if (best && best.c >= 0 && !best.s.scorelines?.length) {
    const result = list.find((o) => o !== best.s && o.scorelines?.length && sameEvent(o, best.s) && !ledLately(o.id));
    if (result) best = { ...best, s: result };
  }
  if (best && best.c >= 0) list.unshift(...list.splice(list.indexOf(best.s), 1));
  const out = [];
  const waiting = [];
  const clubs = new Map();
  const fits = (s) => {
    const football = out.filter((x) => x.sport === 'football').length;
    if (s.sport === 'football' && football + 1 > Math.ceil(count / 2)) return false;
    // any other sport a quarter of the edition at most (three of twelve or thirteen): four rugby league stories in a row on a
    // World Cup squad day were one story told four times (gate run 3, 13 Oct)
    if (s.sport && s.sport !== 'football' && out.filter((x) => x.sport === s.sport).length + 1 > Math.max(2, Math.floor(count / 4))) return false;
    return clubsOf(s).every((c) => (clubs.get(c) || 0) < 2);
  };
  const take = (s) => {
    out.push(s);
    for (const c of clubsOf(s)) clubs.set(c, (clubs.get(c) || 0) + 1);
  };
  for (const s of list) (out.length < count && fits(s) ? take(s) : waiting.push(s));
  // three sports, when the desk has them: a waiting story of a new sport replaces the last of the most common one
  const sports = () => new Set(out.map((s) => s.sport).filter(Boolean));
  for (const s of waiting) {
    if (sports().size >= 3 || !s.sport || sports().has(s.sport)) continue;
    const counts = {};
    for (const x of out) counts[x.sport] = (counts[x.sport] || 0) + 1;
    const common = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const drop = [...out].reverse().find((x, i) => x.sport === common && i < out.length - 1);
    if (out.length < count) take(s);
    else if (drop) {
      out.splice(out.indexOf(drop), 1, s);
      waiting.push(drop);
    }
  }
  // a women's story when the desk has a real one
  const womens = (s) => s.womens && s.image && sentencesIn(`${s.summary || ''} ${s.body || ''}`).length >= 2;
  if (!out.some(womens)) {
    const w = waiting.find(womens);
    if (w) {
      if (out.length < count) out.push(w);
      else out.splice(out.length - 1, 1, w);
    }
  }
  // (the edition is the first `edition` stories: football at most half of them even when the desk has little else; the
  // rest stay behind it for SCORE CENTRE's results and COMING UP's dates)
  const result = [...together(out), ...waiting.filter((s) => !out.includes(s)), ...resultsOnly];
  result.edition = out.length;
  return result;
}

// the names a story is about: its scoreline's teams and the capitalised names of its headline, without the
// competitions every story shares
const COMPETITIONS = /^(?:Premier League|Champions League|Europa League|Conference League|World Cup|Rugby League World Cup|Rugby World Cup|Super League|Six Nations|Test|Grand Prix|Formula One|NFL|NBA|MLB|NHL|WNBA|NLCS|ALCS|World Series|Ryder Cup|Euro|Euros|Ligue|Serie|Bundesliga|LaLiga|League|Cup|England|Sport)$/;
// (word by word, so "Bitport" in one headline is "Bitport Athletic" in the other; never a club's generic word)
const GENERIC_WORD = /^(?:United|City|Town|Athletic|Rovers|Albion|Wanderers|County|Women|Men|FC|AFC|Club|Real|Sporting|Inter|Saint|St|Giants|Kings|Stars|Lions|Tigers|Eagles|Bears|Bulls|Rams|The|League|Cup|Open|Grand|Prix|World|Premier)$/;
const namesOf = (s) => new Set([
  ...(s.scorelines || []).flatMap((sl) => [sl.a, sl.b]),
  ...(String(s.title || '').match(/\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})*/gu) || []),
].map((n) => n.replace(/['’]s$/, '')).filter((n) => !COMPETITIONS.test(n)).flatMap((n) => n.split(/\s+/)).filter((w) => !GENERIC_WORD.test(w) && !COMPETITIONS.test(w)));

/**
 * Two stories about the same thing: the same sport and the same match (their scorelines' teams), or two names of their
 * headlines in common ("Coventry thump Newcastle…" and "Jaissle sorry for Coventry loss as Carra says Newcastle…"; "Pixelburg
 * United beat Bitport Athletic…" and "Bitport manager Okafor apologises to fans after defeat at Pixelburg").
 */
export function sameEvent(a, b) {
  if (!a || !b || a === b || (a.sport && b.sport && a.sport !== b.sport) || !!a.womens !== !!b.womens) return false;
  const pair = (s) => (s.scorelines || []).map((sl) => [sl.a, sl.b].sort().join('|'));
  if (pair(a).some((p) => pair(b).includes(p))) return true;
  const mine = namesOf(a);
  return [...namesOf(b)].filter((n) => mine.has(n)).length >= 2;
}

/** A running order with the stories about the same thing told one after the other (the first keeps its place). */
export function together(list) {
  const out = [];
  for (const s of list) {
    if (out.includes(s)) continue;
    out.push(s);
    for (const o of list) if (!out.includes(o) && sameEvent(s, o)) out.push(o);
  }
  return out;
}

// FULL TIME's desk (docs/programmes/full-time.md §3.1): a sport story's sport and league, whether it is women's sport,
// and what never airs. The sport comes from the link first (BBC "/sport/football/", Sky "/cricket/news/", ESPN
// "/nfl/story/": every sport feed but the Guardian's and France 24's puts it there, measured 13 Oct), then from the
// story's words.

const PATHS = [
  [/\/(?:sport\/)?(?:football|soccer)\//, 'football'],
  [/\/(?:sport\/)?cricket\//, 'cricket'],
  [/\/(?:sport\/)?rugby(?:-union|-league)?\//, 'rugby'],
  [/\/(?:sport\/)?(?:formula1|formula-1|f1)\//, 'f1'],
  [/\/(?:sport\/)?tennis\//, 'tennis'],
  [/\/(?:sport\/)?golf\//, 'golf'],
  [/\/(?:sport\/)?(?:boxing|mma|ufc)\//, 'boxing'],
  [/\/(?:sport\/)?cycling\//, 'cycling'],
  [/\/(?:sport\/)?athletics\//, 'athletics'],
  [/\/(?:nfl|college-football|american-football)\//, 'american-football'],
  [/\/(?:nba|wnba|basketball|mens-college-basketball|womens-college-basketball)\//, 'basketball'],
  [/\/(?:mlb|baseball)\//, 'baseball'],
  [/\/(?:nhl|ice-hockey)\//, 'ice-hockey'],
  [/\/(?:sport\/)?darts\//, 'darts'],
  [/\/(?:sport\/)?snooker\//, 'snooker'],
  [/\/(?:sport\/)?(?:horse-racing|racing)\//, 'racing'],
];
// A sport's words, each counted in the headline (three times) and the summary (once): the sport with the most wins,
// the earlier on this list on a tie. ("Saracens sack player who sparked Stokes captaincy crisis": rugby by its headline,
// though the summary is about a cricketer; "Brewers two wins from first World Series": baseball, though "innings" is
// cricket's word too.)
const WORDS = [
  ['f1', /\b(?:formula one|formula 1|f1|grand prix|pole position|mclaren|ferrari|red bull racing|verstappen|norris|piastri|hamilton|leclerc|antonelli)\b/gi],
  ['baseball', /\b(?:mlb|baseball|home runs?|pitchers?|world series|nlcs|alcs|dodgers|yankees|brewers|guardians|rays|ohtani)\b/gi],
  ['cricket', /\b(?:cricket|cricketers?|wickets?|bowled|bowlers?|t20|t10|odi|the ashes|test match|(?:first|second|third|fourth|fifth) test|ipl|central contracts)\b/gi],
  ['tennis', /\b(?:tennis|atp|wta|grand slam|wimbledon|roland garros|australian open|zverev|alcaraz|sinner|djokovic|swiatek|sabalenka|gauff|boulter|china open)\b/gi],
  ['rugby', /\b(?:rugby|six nations|super league|nrl|scrum|fly-half|saracens|leinster|munster|wallabies|all blacks|springboks)\b/gi],
  ['american-football', /\b(?:nfl|touchdowns?|quarterbacks?|super bowl|field goals?|monday night football|49ers|niners|bills|rams|chiefs|cowboys|texans|jets|sec|big 12)\b/gi],
  ['basketball', /\b(?:nba|wnba|basketball|three-pointers?|slam dunk|lakers|celtics|warriors|trail blazers|valkyries)\b/gi],
  ['ice-hockey', /\b(?:nhl|ice hockey|stanley cup|hurricanes|flyers)\b/gi],
  ['golf', /\b(?:golf|golfers?|pga|liv golf|ryder cup|dp world tour|the masters|birdie|bogey)\b/gi],
  ['boxing', /\b(?:boxing|boxers?|heavyweight|middleweight|welterweight|title fight|ufc|mma|knockout|fury|joshua)\b/gi],
  ['cycling', /\b(?:cycling|cyclists?|tour de france|giro|vuelta|peloton|monument|lombardia|track cycling)\b/gi],
  ['athletics', /\b(?:athletics|marathon|sprinters?|100m|200m|diamond league)\b/gi],
  ['darts', /\b(?:darts|pdc)\b/gi],
  ['snooker', /\bsnooker\b/gi],
  ['chess', /\b(?:chess|grandmaster)\b/gi],
  ['racing', /\b(?:horse racing|racecourse|jockeys?|flat season|the arc|grand national)\b/gi],
  ['football', /\b(?:football|footballers?|soccer|premier league|champions league|europa league|conference league|ligue 1|la ?liga|serie a|bundesliga|fa cup|carabao cup|efl|nations league|world cup qualif\w*|afcon|asian cup|wsl|nwsl|strikers?|midfielders?|goalkeepers?|penalty|var|head coach|national team|hat-trick|messi|ronaldo|mbapp[eé]|haaland|kane|salah|yamal)\b/gi],
];
const TITLE_WEIGHT = 3;

/** A sport story's sport ('football', 'cricket', 'f1'…), from its link, then its words; null when neither says. */
export function sportOf(story) {
  const link = String(story?.link || '');
  for (const [re, sport] of PATHS) if (re.test(link)) return sport;
  const title = String(story?.title || '');
  const summary = String(story?.summary || '');
  let best = null;
  let top = 0;
  for (const [sport, re] of WORDS) {
    const n = (title.match(re) || []).length * TITLE_WEIGHT + (summary.match(re) || []).length;
    if (n > top) [best, top] = [sport, n];
  }
  return best;
}

const LEAGUES = [[/\/nfl\//, 'NFL'], [/\/wnba\//, 'WNBA'], [/\/nba\//, 'NBA'], [/\/mlb\//, 'MLB'], [/\/nhl\//, 'NHL']];
const TAGS = { football: 'FOOTBALL', cricket: 'CRICKET', rugby: 'RUGBY', f1: 'F1', tennis: 'TENNIS', golf: 'GOLF', boxing: 'BOXING', cycling: 'CYCLING', athletics: 'ATHLETICS', 'american-football': 'AMERICAN FOOTBALL', basketball: 'BASKETBALL', baseball: 'BASEBALL', 'ice-hockey': 'ICE HOCKEY', darts: 'DARTS', snooker: 'SNOOKER', racing: 'RACING', chess: 'CHESS' };

/**
 * The strap's tag: the league only when the link says the league (ESPN's "/nfl/"), otherwise the sport (the London Lions
 * against the Portland Trail Blazers is BASKETBALL, not NBA); 'SPORT' when nothing says.
 */
export function sportTag(story) {
  const link = String(story?.link || '');
  for (const [re, tag] of LEAGUES) if (re.test(link)) return tag;
  return TAGS[sportOf(story)] || 'SPORT';
}

const WOMEN_PATH = /\/(?:wnba|womens-[a-z-]+|women)\//;
const WOMEN_WORDS = /\b(?:women['’]?s|womens|women|woman|female athletes?|wsl|nwsl|wnba|lionesses|matildas|red roses|super falcons|banyana banyana|uswnt)\b/i;
/** Women's sport: by its link, "women's" in the headline or summary, or a women's competition or team by name. */
export function isWomensSport(story) {
  return WOMEN_PATH.test(String(story?.link || '')) || WOMEN_WORDS.test(`${story?.title || ''}. ${story?.summary || ''}`);
}

// What never airs on FULL TIME (§3.1), each with its reason, so the desk's choices can be listed and checked.
const NEVER = [
  ['video page', (s) => /\/(?:videos?|watch\/video|tv-shows|av)\//.test(s.link)],
  ['live page', (s) => /\/live\//.test(s.link) || /\b(?:live text|live updates?|live blog|as it happened|minute-by-minute|scorecard|live scores?|scores and schedule)\b|[-–—|]\s*live\s*$|^\s*live\s*[:|-]/i.test(s.title) || /\b(?:tennis|live) scores:/i.test(s.title)],
  ['gossip or the papers', (s) => /\bgossip\b|^\s*papers?\s*:|\bthe papers\b|\btransfer (?:rumours?|news live|window live)\b|\brumour mill\b/i.test(s.title)],
  ['rumour', (s) => /\b(?:eye|eyes|eyeing|linked with|interested in|monitoring|keen on|weigh up|weighing up|considering a move|plot (?:a |an )?(?:move|bid)|in talks)\b/i.test(s.title) && !/\b(?:confirm(?:s|ed)?|announce[sd]?|official(?:ly)?|statement)\b/i.test(`${s.title} ${s.summary}`)],
  ['quiz or promo', (s) => /\bquiz(?:zes)?\b|\bwho am i\b|\bfive in five\b|\bbrainteaser\b|\bpredict(?:s|ions?|or)?\b|\bfantasy\b|\bsweepstake\b|\bcompetition to win\b/i.test(s.title)],
  ['betting', (s) => /\b(?:odds|betting|bets?|bookmakers?|bookies|accumulator|free bets?|tips?|tipster|paddy power|bet365|william hill|ladbrokes|betfair)\b/i.test(`${s.title} ${s.summary}`)],
  ['column or opinion', (s) => /\s\|\s+\p{Lu}[\p{L}’'.-]*(?:\s+\p{Lu}[\p{L}’'.-]*)*\s*$/u.test(s.title) || /\b(?:comment|opinion|verdict|column|analysis:|the view from|mailbag|letters?)\b/i.test(s.title)],
  ['Q&A, talking points or ratings', (s) => /\bQ&A\b|\btalking points\b|\bteam of the week\b|\bplayer ratings\b|\bmarks out of\b|\bwinners and losers\b|\bfive things\b|\bthings we learned\b|\bwhat we learned\b|\bpower rankings\b/i.test(s.title)],
  ['podcast, gallery or photo essay', (s) => /\bpodcast\b|\bin pictures\b|\bphoto essay\b|\bgallery\b|\bbest (?:plays|photos|pictures)\b|[–—-]\s*video\s*$/i.test(s.title)],
  ['analysis, list or listing', (s) => /\b(?:takeaways|grading|overreacting|power rankings|rankings:|projections|poll reaction|draft risers|stock up|stock down|mock draft|notes off|inside the huddle|catch-up|round-?up|group-by-group|team-by-team|club-by-club|\d+ of the best|can you name|today on sky sports|how to watch|tv channel|live stream)\b/i.test(s.title) || /^\s*(?:sources?|report)\s*:/i.test(s.title) || /(?:^|\?\s+)ranking\b/i.test(s.title) || /:\s*\p{Lu}[\p{L}'’-]+ on (?:an?|the|how|why|what|his|her|their)\b/u.test(s.title)],
  ['a series column', (s) => /^[\p{L}\d ’'.&-]{2,32}\s\|\s/u.test(s.title) || /^david squires on\b/i.test(s.title)],
  // (a headline that asks is an analysis or a pun, never a report: "Can Texas bounce back? … Connelly on an eventful Week 6")
  ['a question', (s) => /\?/.test(s.title.replace(/[‘'“"][^’'”"]*[’'”"]/g, ' '))],
  // (school and college recruits are children or barely adults, and a commitment is not a result)
  ['recruiting', (s) => /\b(?:recruits?|recruiting|commitments?|commits|five-star|four-star|signing day|class of 20\d\d)\b/i.test(s.title)],
  ['not competitive sport', (s) => /\b(?:wwe|wrestlemania|money in the bank|aew)\b/i.test(s.title)],
  ['not a story', (s) => s.title.trim().split(/\s+/).length < 4 || /^\s*(?:find out more|sign up|click here|read more|subscribe)\b/i.test(s.title)],
  ['an old page', (s, now) => {
    const y = /\/((?:19|20)\d\d)\/[a-z]{3}\//.exec(s.link);
    return !!y && Number(y[1]) < new Date(now).getUTCFullYear();
  }],
];

const SPORT_WORDS = /\b(?:sports?|athletes?|olympics?|olympic|paralympics?|championships?|tournament|league|club|coach|race|match|title|medal|cup|season|team)\b/i;

/** Why a sport story never airs on FULL TIME (a short reason), or null when it may. */
export function notSport(story, now = Date.now()) {
  const s = { link: String(story?.link || ''), title: String(story?.title || ''), summary: String(story?.summary || '') };
  for (const [reason, test] of NEVER) if (test(s, now)) return reason;
  // (a sport feed carries the odd story that is not about sport: "Damilola Taylor's shocking murder revisited")
  if (!sportOf(story) && !SPORT_WORDS.test(`${s.title} ${s.summary}`)) return 'not about sport';
  return null;
}

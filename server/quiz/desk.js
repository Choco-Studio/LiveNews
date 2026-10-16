// PAY ATTENTION's question desk, part one: what the quiz may use (docs/programmes/pay-attention.md §3). Only what the
// channel aired, from the archive (server/archive.js), never the raw feeds; an event (a story's airings grouped by the
// news desk's sameStory) is eligible only when every airing passes, so a launch that later failed or a story that later
// turned to a death is out whole. The words on screen are the channel's own: the aired headline verbatim, or the
// source's title when the aired one is a cut that broke; never a sentence the desk wrote.
//
//   quizEvents(archive, { now, days, same })   eligible events of the window: [{ key, ids, words, image, place, figure,
//                                               programmes, first, last, category, source, latest, ... }]
//   excludedKind(text)                         the excluded kind a text falls in ('crime', 'politics'…) or null
//   quizWords(entry)                           the headline the quiz may show, or null
import { isGrave, notForFeatures, sentencesIn } from '../facts.js';
import { findPlaces, lookupPlace, placeSupported } from '../gazetteer.js';

const DAY = 86400_000;

// A country as the actor of a headline's policy verb is its government: "India delays digital payments fee rollout amid
// retailer pushback" (TechCrunch, 13 Oct: a fee the state's payments body postponed), "Japan bans…", "France to tax…".
// A country that launches, finds or builds stays news ("Japan launches a lunar probe").
const STATE_VERBS = /^(?:(?:plans?|agrees?|pledges?|vows?|promises?|threatens?|moves?|seeks?|wants?|aims?) to\b|signs?\b|pledges?\b|vows?\b|threatens?\b|delays?|postpones?|bans?|approves?|orders?|imposes?|blocks?|allows?|proposes?|tightens?|eases?|scraps?|rejects?|lifts?|halts?|suspends?|fines?|taxes|caps?|curbs?|restricts?|limits?|mandates?|requires?|legalises?|legalizes?|outlaws?|regulates?|to (?:ban|tax|fine|cap|curb|restrict|limit|require|impose|delay|scrap|lift|halt|allow|approve|block))\b/i;
function stateActs(text) {
  for (const line of String(text ?? '').split(/(?<=[.!?:])\s+|\n/)) {
    const m = /^\W*(?:the\s+)?((?:\p{Lu}[\p{L}'’.-]*)(?:\s+\p{Lu}[\p{L}'’.-]*){0,3})\s+(.+)$/u.exec(line.trim());
    if (!m || !STATE_VERBS.test(m[2])) continue;
    const e = lookupPlace(m[1]);
    if (e && e.kind === 'country') return true;
  }
  return false;
}

// What is never asked about and never shown as an option (§3.1). Word lists, so step 1's gate checks every question by
// hand; each kind is named for that check. Each list is matched on the title, summary and aired text of every airing.
export const EXCLUDED = [
  ['harm', /\b(?:kill\w*|fatal(?:ly|ity|ities)?|dead|deaths?|die[sd]?|dying|funerals?|injur\w*|hurt|victims?|casualt\w*|missing|rescue[sd]?|rescuers?|evacuat\w*|displac\w*|bod(?:y|ies))\b/i],
  ['disaster', /\b(?:fires?|fired? (?:at|on|upon)|blaze|burn(?:s|ed|t|ing)? down|destroy\w*|flood\w*|storms?|quakes?|earthquakes?|hurricanes?|typhoons?|cyclones?|tornado\w*|wildfires?|tsunamis?|landslides?|avalanches?|droughts?|heatwaves?|crash\w*|collisions?|collid\w*|explo(?:sion|sions|de[sd]?)|blasts?|derail\w*|capsiz\w*|sinks|sank|sunk|wreck\w*|gas leaks?|oil spills?|spills?|contaminat\w*|pollut\w*|water levels?|surg(?:e|es|ed|ing) (?:of )?waters?|waters? surg\w*|high water|overflow\w*|swollen rivers?|deluge|torrential|forced to (?:turn back|return|land|divert|evacuate|stop)|turn(?:s|ed|ing)? back (?:to|after|mid)|emergency (?:landing|stop)|(?:flights?|planes?|jets?|trains?) (?:\w+ )?divert\w*|diverted|mayday|turbulence|grounded|engine (?:failure|fire|fault)|near[- ]miss\w*|mid-air|derailment|stranded)\b/i],
  ['crime', /\b(?:polic(?:e|ing)|officers? (?:said|arrested)|courts?|judges?|trials?|jail\w*|prison\w*|sentenc\w*|charged|charges|arrest\w*|murder\w*|crimes?|criminal\w*|fraud\w*|scam\w*|con(?:s|ned)? (?:homeowners|people|customers|victims)|falsif\w*|forg(?:ed|ery)|evade tax|evasion|dodge tax|launder\w*|bribe\w*|corrupt\w*|scandal\w*|lawsuits?|su(?:e|es|ed|ing)\b|legal action|abuse\w*|assault\w*|raid\w*|detain\w*|detention|investigators?|under investigation|investigat(?:es|ed|ing)? (?:the |a |an )?(?:death|crash|attack|fraud|claims?|allegations?|case|complaints?)|police investigation|criminal investigation|justice department|department of justice|fbi|prosecut\w*|probes? into|exploit(?:ed|ation)|smuggl\w*|thefts?|stolen|steal\w*|robber\w*|hack(?:ed|ers?)|ransomware|cyber-?attacks?|executions?|executed|death row|death penalty|death sentences?|capital punishment|lethal injections?|firing squads?|electric chair|gallows|inmates?)\b/i],
  ['conflict', /\b(?:wars?|warfare|army|armies|armed|military|militar\w*|troops|soldiers?|missiles?|drones? (?:strikes?|attacks?)|(?:air)?strikes? (?:on|against)|attack\w*|terror\w*|bomb\w*|shoot\w*|shots? fired|guns?|gunm[ae]n|weapons?|ceasefire|fightback|offensive|rebels?|militias?|insurgen\w*|houthis?|hamas|hezbollah|taliban|nato|invasion|invad\w*|occupation|hostages?|sanction\w*|defen[cs]e (?:minister|ministry|forces)|frontline|front line|ukraine|russia|gaza|israel\w*|palestin\w*|(?:armed|security|special|government|rebel|federal|allied|enemy|ground|naval|paramilitary|regional) forces|forces (?:enter\w*|captur\w*|seiz\w*|advanc\w*|took|take|withdr\w*|clash\w*|launch\w*|fire[sd]?)|strategic (?:town|city|port|hill)|militants?|jihad\w*|al-shabaab|isis|islamic state|coups?|junta|tigray|darfur|sudan\w*|yemen\w*|syria\w*|somalia\w*|sahel|kashmir|iran\w*|north korea\w*|taiwan strait|south china sea|hormuz|crosshairs|afghan\w*|myanmar|haiti\w*|libya\w*|burkina faso|eritrea\w*|belarus\w*|venezuela\w*)\b/i],
  ['children', /\b(?:child|children|childhood|kids?|boys?|girls?|teen\w*|minors?|pupils?|schools?|schoolchildren|bab(?:y|ies)|toddlers?|infants?|nurser(?:y|ies)|adolescen\w*)\b/i],
  ['politics', { test: (s) => stateActs(s) }, /\b(?:elections?|elect(?:ed|s)?\b|vot(?:e|es|ed|ers?|ing)|ballot\w*|polls?\b|campaign\w*|part(?:y|ies)|ministers?|ministr(?:y|ies)|president\w*|prime minister|premier|chancellor|governments?|governor\w*|parliament\w*|senat\w*|congress\w*|mps?\b|meps?\b|lawmakers?|legislat\w*|politic\w*|mayors?|councils?|councillors?|labour|tor(?:y|ies)|conservatives?|liberal democrats?|democrats?|republicans?|reform uk|snp|white house|downing street|kremlin|eu\b|european union|european commission|brussels|un\b|united nations|g7|g20|summit|diplomat\w*|ambassador\w*|embass(?:y|ies)|treat(?:y|ies)|tariffs?|trade (?:war|deals?|disputes?|tensions?|frictions?|imbalances?|truce|talks|surplus|deficit|barriers?)|rebalanc\w* (?:its |global )?trade|post-brexit|brexit|regulat(?:or|ors|ion|ions)|watchdog|ban(?:s|ned|ning)?\b|policy|policies|foreign polic\w*|(?:approach|policy|stance|strategy|relations|ties|dealings) (?:to|on|towards?|with) (?:china|russia|beijing|moscow|washington|america|the us|the eu|europe|iran|india|taiwan|israel|ukraine)|crackdown\w*|curfews?|martial law|state of emergency|emergency rule|lock(?:ed|s)? down|lockdowns?|protest\w*|demonstrat\w*|strikes? (?:by|over|action)|on strike|labou?r (?:battle|dispute|fight|talks|strife|unrest|war)|lockouts?|collective bargaining|refugees?|migrants?|migration|asylum|deport\w*|immigra\w*|borders?|royal family|the royals|king charles|queen camilla|prince (?:william|harry|andrew)|princess|monarch\w*|pope|vatican|iea|opec|imf|world bank|central banks?|interest rates?|federal reserve|bank of england|ecb|think tank|press secretary|spokesperson for the|censor\w*|press freedom|suspend(?:s|ed|ing)? (?:broadcasts?|transmissions?|services? of)|trump\w*|biden|kamala harris|vance|starmer|sunak|badenoch|farage|reeves|putin|zelensky\w*|netanyahu|xi jinping|modi|macron|merz|meloni|erdogan|burnham|carney|albanese|lula|milei|khamenei|kim jong\w*|orban|le pen|bolsonaro)\b/i, /\b(?:UK|British|the|new|former) PM\b|\bPM (?:says|said|to|vows|warns|has)\b/],
  // a head of state or a party leader named anywhere in the story: the deal they announce is politics, wherever the
  // aired text names them (on air, 14 Oct: "Taiwan plans to buy liquefied natural gas from Alaska pipeline project",
  // a WHERE question; its aired text: "This is what Donald Trump, the U.S. President, said")
  ['politics (a politician named)', /\b(?:trump\w*|biden|kamala harris|starmer|sunak|badenoch|farage|putin|zelensky\w*|netanyahu|xi jinping|modi|macron|merz|meloni|erdogan|carney|albanese|lula|milei|khamenei|kim jong\w*|orban|le pen|bolsonaro|white house|downing street|kremlin|prime minister|(?:u\.?s\.? |us |french |russian |chinese |the )president)\b/i],
  ['health', /\b(?:cancer\w*|tumou?rs?|diseases?|diagnos\w*|hospital\w*|patients?|surger(?:y|ies)|operation on|illness\w*|ill\b|sick\w*|virus\w*|outbreaks?|pandemic|epidemic|dementia|alzheimer\w*|stroke\b|heart attack|overdos\w*|suicid\w*|mental health|nhs|medicines? (?:grow )?scarce|nodule|blood clots?|ruled out (?:for|of|vs\.?|against|with)|sidelined|concussion\w*|hamstring|torn (?:acl|ligament\w*|muscle)|fractur\w*)\b/i],
  ['money of people', /\b(?:salar(?:y|ies)|wages?|pay ?(?:rise|cut|deal)|earn(?:s|ed|ing)?\s+(?:up to\s+|over\s+|more than\s+|about\s+|around\s+)?[£$€]|i earn|income|pensions?|fined|fines?\b|damages|compensation|payouts?|net worth|fortune|wealth\w*|billionaires?|millionaires?|inheritance|inherit\w*|tax(?:es)? (?:bill|affairs))\b/i],
  ['betting', /\b(?:bet(?:s|ting)?|bookmakers?|bookies|odds|tips?\b|tipster\w*|predictions?|predicted line-?ups?|gambl\w*|casino\w*|lotter(?:y|ies)|jackpot|fantasy (?:football|baseball|basketball|hockey|sports?|league)|matchup rankings|start(?:\/| or | and |-)sit|fade)\b/i],
  ['hardship', /\b(?:struggl\w*|shortages?|scarce|scarcity|crisis|cris[ie]s|recession|layoffs?|laid off|lay(?:s|ing)? off|(?:cut|cuts|cutting|slash\w*|axe\w*|shed\w*) (?:up to |more than |about |around |some |nearly )?(?:\d[\d,.]*k? |hundreds of |thousands of |dozens of )?(?:\w+ )?jobs|subscriptions? (?:slow|fall|drop|declin)\w*|job (?:cuts|losses)|redundanc\w*|bankrupt\w*|insolven\w*|administration\b|(?:close[sd]?|closing|shut(?:s|ting)?)\s+(?:its\s+|the\s+|a\s+)?(?:[\w'’-]+\s+){0,3}(?:plant|factory|store|stores|shop|shops|branch|branches|site|mine|offices?|restaurants?|pubs?)|closures?|poverty|homeless\w*|hunger|famine|debt\w*|evict\w*|cost of living|inflation|price rises?|(?:declin\w*|falling|fell|drop(?:s|ped|ping)?|slump\w*|plung\w*|tumbl\w*|shrink\w*|shrank|slid(?:e|es|ing)?)\s+(?:\w+\s+){0,2}(?:revenues?|sales|profits?|earnings|subscribers?|users|membership|demand|shares)|(?:revenues?|sales|profits?|earnings|subscribers?|demand|shares)\s+(?:\w+\s+)?(?:fell|fall|falls|dropped|drops?|declin\w*|slump\w*|plung\w*|tumbl\w*|slow(?:s|ed|ing)?|shrink\w*|shrank|miss(?:es|ed)?)|miss(?:es|ed)?\s+(?:\w+\s+){0,2}(?:forecasts?|estimates|expectations|targets)|profit warnings?|loss-making|price (?:increase|hike|rise)s?|prices? (?:increas|hik|ris|jump|soar|go(?:es)? up)\w*|slumping|winless|losing streak|lonel\w*|social isolation|quitting|losing (?:\d[\d,]* |hundreds of |thousands of |dozens of )?(?:\w+ )?(?:workers|staff|employees|jobs)|(?:staff|workers|employees|drivers|nurses|teachers|posties)\s+(?:are\s+)?(?:quit\w*|leav\w*|walk\w* out)|exodus|efficiency (?:plans?|drives?|savings?|programmes?|cuts?)|cost[- ]cutting|cuts? (?:to|in) (?:staff|jobs|services|deliveries|routes)|under (?:pressure|strain)|overstretched|understaffed|staff shortages?)\b/i],
  ['offensive language', /\b(?:f[\*u]+c?k\w*|f\*+|sh[\*i]t\w*|bollocks|bastard\w*|wank\w*|arse(?:hole)?s?|piss(?:ed|ing)?|bloody hell|crap)\b/i],
  ['promotion', /(?:[–—|-]\s*(?:podcast|video|audio|live|quiz|gallery|in pictures)\s*(?=\.(?:\s|$)|$)|(?:^|\.\s+)(?:podcast|video|watch|listen|quiz)\s*[:|]|\bthe \w+ podcast\b)|\b(?:\d+ (?:hours|days) (?:to|until|left)|job opportunit\w*|vacanc(?:y|ies)|we(?:'re| are) hiring|apply now|careers? at|your final chance|tickets?|ticket savings|discount\w*|promo codes?|deals? of the day|on sale|buy now|sponsored|giveaway|\d+ gets you|gets you .{0,60} for|price drops?|lowest price|bargains?|\d+% off|save \$?\d+)\b/i],
  ['failure of a person', /\b(?:flop(?:s|ped|ping)?|box[- ]office (?:bomb|disaster)|weak start|panned|slammed|mock\w*|ridicul\w*|gaffes?|embarrass\w*|humiliat\w*|backlash|push ?back|pushed back|outrage|rows? (?:over|with|between)|feud|criticis\w*|criticiz\w*|apologi[sz]\w*|resign\w*|sacked|fired\b|ousted|quits?\b|wavered|controvers\w*|accus\w*|allegation\w*|alleged\w*|denies|denied|not returning as|parts? ways|steps? down|stepping down|let go|relieved of|dismiss(?:ed|al|es)|bottom (?:10|ten|five|three)|major fall|fallout|under fire|damaging|suspend(?:s|ed|ing)? \S+(?: \S+)? for|punch\w*|brawl\w*|in (?:the )?face|owns? up|incoherent|shambolic|plagued by|lack of (?:expertise|experience|leadership|transparency|accountability)|critics|angry|anger(?:ed)?|furious|fury|livid|fum(?:e|es|ing)\b|tough (?:loss|defeat|night|day|weekend) for|sent off|sending[- ]offs?|red cards?|second yellow|yellows|booed|boos|jeered|heckl\w*|dumb|stupid|idiot\w*|daft|blunder\w*|howlers?|own goals?|miss(?:es|ed)? (?:a |the )?penalt\w*|penalty miss\w*|yellow cards?|blames?|blamed|dropped from|axed|benched)\b/i],
];

// Reviews and first-person pieces: a verdict is not a fact to quiz on ("Mechanism's first Switch 2 case is as awesome
// as I hoped it would be", "OnePlus 16 is firm's most interesting phone", The Verge 12 Oct)
const FIRST_PERSON = /(?:^|[\s‘'"“])(?:I|I'm|I’m|I've|I’ve|My|my|We|we|We've|we've|Our|our)\s/;
const OPINION = /\b(?:as I hoped|hands-on|review(?:ed)?|first look|verdict|best and worst|most interesting|awesome|we tried|tested:|why (?:you|we|i)\b|in praise of|the case for|deja vu|déjà vu|is alarming|is the best|is the worst)\b/i;

// Kinds matched on the story's subject only (its headline, title and opening sentences): a passing "the government
// says" in a tunnel story's third sentence does not make it politics. Harm, disasters, crime, conflict and betting
// count anywhere in the story.
const SUBJECT_ONLY = new Set(['children', 'politics', 'health', 'money of people', 'hardship', 'promotion', 'failure of a person']);

// Senses that look excluded and are not: deep time and history ("Roman troops", "a 2,000-year-old burial"), cells
// and microbes ("an injection that destroys fat cells"), sky and space ("asteroid collisions"), sport's own words.
const LOOKALIKES = [
  /[^.!?]*\b(?:\d[\d,.]*\s+(?:million|billion)\s+years|(?:million|billion) years ago|prehistoric|dinosaurs?|fossil\w*|ice age|roman|romans|ancient|medieval|viking\w*|iron age|bronze age|stone age|neolithic|pharaoh\w*|emperors?|\d+(?:st|nd|rd|th)[- ]century|centuries[- ]old|[\d,]+[- ]year[- ]old (?:temple|tomb|burial|skeleton|fort|ship|wreck|city|settlement|coins?|remains|mummy|mummies|statue|site))\b[^.!?]*[.!?]?/gi,
  /\b(?:destroy\w*|kill\w*|attack\w*|target\w*)\s+(?:\w+\s+){0,2}(?:cells?|tumou?rs?|bacteria|viruses?|microbes|germs|pathogens|weeds|pests|parasites)\b|\bself-destruct\w*|\b(?:dead|dying)\s+(?:cells?|stars?|galax\w*)\b/gi,
  /\b(?:asteroids?|meteor\w*|comets?|galax\w*|stars?|planets?|particles?|protons?|black holes?|neutron stars?)\s+(?:collisions?|collid\w*|impacts?|crash\w*|explo\w*)\b|\b(?:collisions?|impacts?)\s+(?:of|between|with)\s+(?:\w+\s+)?(?:asteroids?|galax\w*|stars?|planets?|particles?|black holes?)\b|\bstar(?:s)? (?:die|dies|died|explode\w*)\b/gi,
  /\b(?:bets?|betting) (?:big |heavily |everything )?on\b/gi,
  /\bearn(?:s|ed|ing)?\s+(?:a|an|the|their|his|her)\s+(?:draw|point|win|victory|place|spot|call-up|start|recall|replay)\b|\bshootout\b|\bshot[- ]stopp\w*|\boffensive (?:line|coordinator|rebound\w*)\b/gi,
];
const withoutLookalikes = (text) => LOOKALIKES.reduce((t, re) => t.replace(re, ' '), String(text ?? ''));

/**
 * The excluded kind a story falls in, or null: `text` is the whole story, `subject` its headline, title and opening
 * sentences (the kinds in SUBJECT_ONLY look only there; with no subject given, the whole text is the subject).
 */
export function excludedKind(text, subject = text) {
  const t = withoutLookalikes(text);
  const s = withoutLookalikes(subject);
  for (const [kind, ...res] of EXCLUDED) if (res.some((re) => re.test(SUBJECT_ONLY.has(kind) ? s : t))) return kind;
  return null;
}

// A cut that stops where the source's title goes on with a phrase that can drop: a comma, a dash, a colon, or a phrase
// opener. "Carmaker to close Turin plant[, putting 2,400 jobs at risk]" is whole; "Chinese carmakers increasingly
// rely[ on overseas markets…]" is not (12 Oct).
const CLEAN_REST = /^(?:\s*,\s+(?:[a-z]+(?:ing|ed)\b|says?\b|said\b|according\b|as\b|after\b|with\b|while\b|but\b|amid\b|ahead\b|despite\b|reports?\b|study\b|records\b|\p{Lu}[\p{L}]*\s+(?:says?|finds?|reports?|suggests?)\b)|\s*[;:–—|]|\s+[-–—]\s|\s+(?:after|ahead of|amid|at|during|following|for the first time|in (?:the|a|an|its|their|his|her)\b|over|this (?:week|year|month|weekend)|next (?:week|year|month)|as (?:\w+ )?(?:grow|grows|surge|surges|rise|rises|fall|falls|continue|continues)\b|despite|with (?:a|an|the)\b|according to|(?:BBC|study|report|records|data) (?:finds|suggests?|shows?)))/iu;
// A last word no headline ends on: an article, a preposition, a comparison or a figure left open
const OPEN_END = /\b(?:a|an|the|to|of|in|on|at|for|with|by|from|as|than|and|or|but|is|are|was|were|be|its|their|his|her|up to|more|less|most|rely|style|\$\d[\d,.]*)$/i;
export const MAX_WORDS_CHARS = 72;

// A headline says what happened: it has a verb. Picture captions and notices do not ("Transporter-18 SmallSats
// Encapsulation", "Comparing Off-World Rover Driving Distances": NASA's feed, 13 Oct). A word-list judgement: the
// step-1 gate checks every question by hand.
const BARE_VERBS = new Set('is are was were be been has have had will would can could may might must shall should do does did let lets set sets get gets got make makes made take takes took find finds found map maps spot spots reach reaches open opens launch launches win wins won beat beats plan plans unveil unveils build builds test tests show shows reveal reveals return returns start starts begin begins end ends hit hits cut cuts raise raises rise rises fall falls grow grows drop drops land lands join joins leave leaves meet meets say says tell tells warn warns ask asks offer offers buy buys sell sells move moves turn turns bring brings break breaks keep keeps hold holds give gives go goes come comes run runs play plays need needs want wants help helps look looks lights light record records release releases restore restores celebrate celebrates discover discovers capture captures solve solves'.split(' '));
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'by', 'with', 'from', 'as', 'its', 'vs', 'v']);
export function labelLike(words) {
  const tokens = String(words ?? '').replace(/[“”"‘(),.:;!?–—]/g, ' ').replace(/’/g, "'").split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return true;
  if (/^\p{Lu}\p{Ll}+ing$/u.test(tokens[0]) && /^\p{Lu}/u.test(tokens[1] || '')) return true; // "Comparing Off-World…"
  const content = tokens.filter((t) => /\p{L}/u.test(t) && !FUNCTION_WORDS.has(t.toLowerCase()));
  const titleCase = content.every((t) => /^\p{Lu}/u.test(t));
  const verbish = (t, i) => {
    const w = t.toLowerCase();
    if (/^(?:there|it|that|what|who|here|he|she)'s$/.test(w) || BARE_VERBS.has(w)) return true;
    if (i === 0) return false; // a first word ending in -s is a subject ("Scientists map…")
    if (/\p{Lu}/u.test(t.slice(1))) return false; // a name ("SmallSats", "NASA")
    if (!titleCase && /^\p{Lu}/u.test(t)) return false; // a name in a sentence-case headline
    return /(?:ed|en)$/.test(w) || (/s$/.test(w) && !/(?:ss|us|is)$/.test(w) && w.length > 3) || /ing$/.test(w);
  };
  return !tokens.some(verbish);
}

// Where the aired headline stops inside the source's title: the title's words in order, the aired one allowed to have
// dropped its articles ("This tiny jurassic predator helped pave the way for the human brain" aired as "…helped pave
// way", 16 Oct). Returns the title's text after the aired headline's last word, or null when the aired headline is not
// such a cut (a rewrite, or the whole title).
const ARTICLES = new Set(['a', 'an', 'the']);
function cutRest(aired, title) {
  const words = (t) => [...String(t).matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’$£€%.,-]*/gu)].map((m) => ({ w: m[0].toLowerCase().replace(/[.,]+$/, ''), end: m.index + m[0].replace(/[.,]+$/, '').length }));
  const a = words(aired);
  const t = words(title);
  if (!a.length || a.length >= t.length) return null;
  let j = 0;
  for (const { w } of a) {
    while (j < t.length && t[j].w !== w && ARTICLES.has(t[j].w)) j++;
    if (j >= t.length || t[j].w !== w) return null;
    j++;
  }
  const rest = title.slice(t[j - 1].end);
  return /[\p{L}\p{N}]/u.test(rest) ? rest : null;
}

/** The headline the quiz may show for an archive entry: the aired one when whole, else the source's title (≤ 72), else null. */
export function quizWords(e) {
  const aired = String(e?.headline || '').replace(/\s+/g, ' ').trim();
  const title = String(e?.title || '').replace(/\s+/g, ' ').replace(/^(?:BREAKING|LIVE|WATCH|VIDEO|EXCLUSIVE)\s*[:|-]\s*/i, '').trim();
  const titleOk = title && title.length <= MAX_WORDS_CHARS && !OPEN_END.test(title.replace(/[.!?]+$/, ''));
  if (!aired) return titleOk ? title : null;
  const rest = cutRest(aired, title);
  if (rest !== null && !CLEAN_REST.test(rest)) return titleOk ? title : null;
  if (OPEN_END.test(aired.replace(/[.!?]+$/, ''))) return titleOk ? title : null;
  return aired.length <= MAX_WORDS_CHARS ? aired : titleOk ? title : null;
}

// The world in regions, for WHERE IN THE WORLD?'s rule of three options in three regions (coarse on purpose: a pin's
// continent, by its coordinates)
export function regionOf({ lat, lon } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lon < -25) return lat >= 15 ? 'north-america' : 'latin-america';
  if (lon >= 110 && lat < -10) return 'oceania';
  if (lon >= 34 && lon < 63 && lat >= 12 && lat < 42) return 'middle-east';
  if (lat >= 36 && lon < 45) return 'europe';
  if (lon < 52 && lat < 36) return 'africa';
  return 'asia';
}

/** The country entry (gazetteer) of an archived location ("TEXAS, USA" → United States), or null. */
export function countryOf(location) {
  if (!location?.place) return null;
  const parts = String(location.place).split(',').map((p) => p.trim()).filter(Boolean);
  for (const p of [parts.join(', '), ...parts.slice().reverse()]) {
    const e = lookupPlace(p);
    if (!e || e.broad) continue;
    const c = e.kind === 'country' ? e : lookupPlace(e.country || '');
    if (c && c.kind === 'country') return c;
  }
  return null;
}

// Where the story happens, not where a company comes from: a text names the place (or a place in its country) after a
// locative preposition ("In Iceland, a fissure eruption…"), as its owner ("Egypt's Fayoum mummy portraits…") or as a
// dateline ("Norway: …"). "Indian brand CMF…" is no "where" (12 Oct).
const LOCATIVE = /\b(?:in|at|near|off|across|outside|around|over|throughout|inside|on the coast of|the coast of|to western|to eastern|to northern|to southern)\s+(?:the\s+)?$/i;
// "available in the US", "users in Japan", "a new feature in the US" (The Verge, 13 Oct): where a product is sold, not
// where a story happened
const AVAILABILITY = /\b(?:available|availability|users?|customers?|subscribers?|buyers?|shoppers?|owners?|players?|sold|sells?|selling|ships?|shipping|features?|services?|rolls? out|rolling out|rollout|expands?|expanding|expansion|subscriptions?|apps?|launch(?:es|ed|ing)?(?: first)?(?: only)?)\s+(?:only\s+)?(?:in|across|to)\s+(?:the\s+)?$/i;
const insideOf = (e, country, placeEntry) => e === country || e === placeEntry || e.country === country.name;
function happensIn(texts, country, place) {
  const placeEntry = lookupPlace(String(place).split(',')[0]);
  for (const t of texts) {
    const s = String(t ?? '');
    for (const h of findPlaces(s)) {
      if (!insideOf(h.entry, country, placeEntry)) continue;
      const before = s.slice(Math.max(0, h.index - 40), h.index);
      if (LOCATIVE.test(before.slice(-24)) && !AVAILABILITY.test(before)) return true;
      const after = s.slice(h.index + h.text.length, h.index + h.text.length + 3);
      if (/^['’]s\b/.test(after) || (h.index === 0 && /^\s*:/.test(after))) return true;
    }
  }
  return false;
}

export const MASK = '▮▮▮▮▮';
/**
 * The words with the place masked: every name of the place, of a place inside its country and of its people
 * ("Egypt's Fayoum mummy portraits…" → "▮▮▮▮▮'s Fayoum mummy portraits…"); one mask's length for every name, so its
 * length tells nothing. Null when fewer than three words are left to read.
 */
export function maskPlace(words, country, place) {
  const placeEntry = lookupPlace(String(place).split(',')[0]);
  const spans = findPlaces(words).filter((h) => insideOf(h.entry, country, placeEntry)).map((h) => [h.index, h.index + h.text.length]);
  if (country.demonymRe) for (const m of words.matchAll(new RegExp(country.demonymRe.source, 'gu'))) spans.push([m.index, m.index + m[0].length]);
  if (!spans.length) return words;
  spans.sort((a, b) => b[0] - a[0]);
  let out = words;
  let reach = Infinity;
  for (const [a, b] of spans) {
    if (b > reach) continue;
    out = out.slice(0, a) + MASK + out.slice(b);
    reach = a;
  }
  const readable = out.split(/\s+/).filter((w) => !w.includes('▮') && /\p{L}{2,}/u.test(w));
  return readable.length >= 3 ? out : null;
}

/**
 * A usable place (§4.1): the story's place, named in its aired words where the story happens. The words shown never
 * name it, its country or its people: a headline that does gets them masked (`masked`). Returns { country, label, lat,
 * lon, region, masked } or null.
 */
export function usablePlace(e, words) {
  const loc = e?.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  const country = countryOf(loc);
  if (!country) return null;
  const text = `${e.text || ''} ${e.summary || ''}`;
  const named = (x) => placeSupported(loc.place, x) || placeSupported(country.label, x);
  if (!named(text) && !named(words)) return null;
  if (!happensIn([words, e.title, text], country, loc.place)) return null;
  const masked = named(words) ? maskPlace(words, country, loc.place) : words;
  if (!masked || named(masked.replaceAll(MASK, ' '))) return null; // a name the mask could not find stays a give-away
  return { country: country.name, label: country.label, lat: country.lat, lon: country.lon, region: regionOf(country), masked: masked === words ? null : masked };
}

// WHERE's wrong pins: the week's eligible story places first, then these well-known countries, seven regions of them
// (the week's places alone were six countries on 13 Oct, too few for three questions in three regions each). Never a
// country named in a story the week left out: no playful pin on a country in the news for a war or a disaster.
export const NEUTRAL_COUNTRIES = Object.freeze([
  'France', 'Italy', 'Spain', 'Portugal', 'Norway', 'Sweden', 'Finland', 'Iceland', 'Ireland', 'Netherlands', 'Greece', 'Switzerland',
  'Japan', 'South Korea', 'Vietnam', 'Thailand', 'Indonesia', 'Philippines', 'Malaysia', 'Nepal', 'Mongolia', 'India',
  'Australia', 'New Zealand', 'Fiji', 'Canada', 'United States', 'Mexico', 'Cuba', 'Jamaica',
  'Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Ecuador',
  'Kenya', 'Morocco', 'Egypt', 'South Africa', 'Ghana', 'Tanzania', 'Senegal', 'Namibia', 'Madagascar',
  'Jordan', 'Oman', 'United Arab Emirates', 'Qatar',
]);
const pinOf = (c) => ({ country: c.name, label: c.label, lat: c.lat, lon: c.lon, region: regionOf(c) });
/** The neutral countries as pins, without the ones in `avoid` (country names). */
export function neutralPlaces(avoid = new Set()) {
  return NEUTRAL_COUNTRIES.map((n) => lookupPlace(n)).filter((c) => c && c.kind === 'country' && !avoid.has(c.name)).map(pinOf);
}
/** The countries a text names (a city or region counts for its country). */
export function countriesIn(text) {
  const out = new Set();
  for (const h of findPlaces(String(text ?? ''))) {
    const c = h.entry.kind === 'country' ? h.entry : lookupPlace(h.entry.country || '');
    if (c && c.kind === 'country') out.add(c.name);
  }
  return out;
}

/** The country an event happened in, for an option pin (any eligible event's place; no give-away rule for options). */
export function optionPlace(e) {
  const loc = e?.location;
  if (!loc || !Number.isFinite(loc.lat)) return null;
  const country = countryOf(loc);
  return country ? { country: country.name, label: country.label, lat: country.lat, lon: country.lon, region: regionOf(country) } : null;
}

const QUALIFIER = /\b(?:about|around|nearly|almost|roughly|some|up to|more than|over|at least|less than|fewer than|under|approximately|an estimated|estimated|close to)\s*$/i;
const STOP = new Set(['not', 'the', 'and', 'for', 'with', 'more', 'less', 'than', 'from', 'that', 'this', 'per', 'cent', 'percent', 'a', 'an', 'of', 'to', 'in', 'on']);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ');
export const MAX_SENTENCE_CHARS = 150;

/**
 * A usable figure (§4.1): a figure the story aired, found verbatim in a sentence of its aired text whose words also hold
 * its label; not a model name ("Maia 300"), not a year. Returns { value, label, qualifier, exact, sentence, masked } or
 * null. `masked` hides the value and keeps the qualifier ("…can pay up to ▮▮▮ more").
 */
export function usableFigure(e) {
  const nums = Array.isArray(e?.numbers) ? e.numbers : [];
  const sentences = sentencesIn(String(e?.text || ''));
  for (const n of nums) {
    const value = String(n?.value || '').trim();
    if (!/\d/.test(value) || /^(?:19|20)\d\d$/.test(value) || !parseFigure(value)) continue;
    const labelWords = norm(n.label).split(/[^a-z]+/).filter((w) => w.length >= 3 && !STOP.has(w));
    if (!labelWords.length) continue;
    const v = norm(value).replace(/bn$/, 'bn').replace(/m$/, 'm');
    for (const s of sentences) {
      if (s.length > MAX_SENTENCE_CHARS) continue;
      const i = norm(s).indexOf(v);
      if (i < 0) continue;
      const before = s.slice(0, i);
      if (/\p{Lu}[\p{L}\d-]*\s*$/u.test(before) && !QUALIFIER.test(before)) continue; // "Maia 300", "OnePlus 16"
      if (/[\p{L}\d]$/u.test(before) || /^[\p{L}\d]/u.test(s.slice(i + v.length).replace(/^(?:bn|m|k|%)/i, ''))) continue; // inside a longer token
      const ns = norm(s);
      if (!labelWords.some((w) => ns.includes(w.slice(0, Math.max(4, w.length - 2))))) continue;
      const qualifier = (before.match(QUALIFIER)?.[0] || n.qualifier || '').trim();
      const masked = `${s.slice(0, i)}${'▮'.repeat(Math.min(6, Math.max(2, value.length)))}${s.slice(i + value.length)}`;
      return { value, label: String(n.label || '').trim(), qualifier: qualifier.toUpperCase(), exact: !qualifier, sentence: s, masked };
    }
  }
  return null;
}

// A figure as a number and back in its own style: "1.2 million", "15", "40%", "£9bn", "$26M", "120,000"
export function parseFigure(value) {
  const m = String(value).trim().match(/^([£$€]?)\s*([\d,.]+)\s*(%|percent|per cent|bn|billion|m|million|k|thousand)?$/i);
  if (!m) return null;
  const n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const unit = (m[3] || '').toLowerCase();
  const mult = { bn: 1e9, billion: 1e9, m: 1e6, million: 1e6, k: 1e3, thousand: 1e3 }[unit] || 1;
  return { n: n * mult, cur: m[1], unit, mult, raw: m[2] };
}
/**
 * A number as a person says it, in the figure's own style: its currency, a per cent, or millions and billions in words
 * ("£1.4 billion", "860 million", "12,000", "35%").
 */
export function formatFigure(n, like) {
  const { cur, unit } = like;
  if (unit === '%' || unit === 'percent' || unit === 'per cent') return `${cur}${n}%`;
  const one = (x) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10));
  if (n >= 1e9) return `${cur}${one(n / 1e9)} billion`;
  if (n >= 1e6) return `${cur}${one(n / 1e6)} million`;
  return `${cur}${Math.round(n).toLocaleString('en-GB')}`;
}
// The numbers people guess: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9 times a power of ten
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
export function niceNumber(n) {
  if (!(n > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const m = n / p;
  const best = NICE.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  return Math.round(best * p * 1000) / 1000;
}
/** The next nice number up from `n` (two players never say the same guess). */
export function nextNice(n) {
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const m = Math.round((n / p) * 1000) / 1000;
  const i = NICE.findIndex((x) => x > m + 1e-9);
  return Math.round((i >= 0 ? NICE[i] : 12) * p * 1000) / 1000;
}
// Day words: a TODAY OR NOT TODAY headline must not carry its own answer ("TechCrunch Disrupt 2026 starts tomorrow")
export const DAY_WORDS = /\b(?:today|tonight|tomorrow|yesterday|this (?:week|weekend|morning|afternoon|evening|year)|last (?:week|night|year)|next (?:week|year)|weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|january|february|march|april|may|june|july|august|september|october|november|december|(?:19|20)\d\d|\d{1,2}(?:st|nd|rd|th)\b|\d+ hours to|hours away|days? away|days? to go)\b/i;

// A presenter's handoff or link, which opens an aired text without saying the story ("Thanks, Lola.", 14 Oct; "Now to
// Western Norway.")
const HANDOFF = /^\W*(?:thanks|thank you|cheers|over to|back to|now to|now for|next,|and now|time for|staying with|moving on)\b/i;
/** A text's opening sentence: the first that is not a handoff or a link of three words or fewer. */
export function opening(x) {
  const all = sentencesIn(String(x || ''));
  return all.find((t) => !HANDOFF.test(t) && t.split(/\s+/).length > 3) || all[0] || '';
}

/**
 * Why an archive entry cannot be used, or null. Every airing of an event is checked: read grave or serious, grave by
 * text, a bad-news feature subject (closures, job losses), an excluded kind, a review.
 */
export function entryOut(e) {
  if (e?.grave || e?.serious) return 'read grave or serious';
  const text = `${e?.title || ''}. ${e?.headline || ''}. ${e?.summary || ''} ${e?.text || ''}`;
  if (isGrave(text)) return 'grave';
  if (notForFeatures(text)) return 'hardship';
  const kind = excludedKind(text, `${e?.title || ''}. ${e?.headline || ''}. ${opening(e?.summary)} ${opening(e?.text)}`);
  if (kind) return kind;
  const heads = `${e?.title || ''} | ${e?.headline || ''}`;
  if (OPINION.test(heads) || FIRST_PERSON.test(heads)) return 'opinion';
  return null;
}

// Under the game, the LATEST ticker carries nothing the quiz itself would refuse (pay-attention.md §1, §3.3): a story
// grave by its words, a bad-news feature, any excluded kind (harm, disasters, crime, conflict, politics, illness,
// children, people's money, betting, hardship, promotions, a person's failure) or a review. The editions of 12–13 Oct
// scrolled an execution, a murder, a fatal ride and a war under the quiz; those of round 14 a state's emergency rule,
// party politics and an election under it. The station marks such an item with the kind (`quizOut`) and the band leaves
// it out while PAY ATTENTION airs (graphics quizAvoided): fewer items, never one the game would not ask.
/** The reason the quiz would refuse a feed story ({ title, summary }) as a question or an option, or null. */
export function quizRefuses(story) {
  const title = String(story?.title || '');
  const summary = String(story?.summary || '');
  const text = `${title}. ${summary}`;
  if (isGrave(text)) return 'grave';
  if (notForFeatures(text)) return 'hardship';
  const kind = excludedKind(text, `${title}. ${opening(summary)}`);
  if (kind) return kind;
  if (OPINION.test(title) || FIRST_PERSON.test(title)) return 'opinion';
  return null;
}

/** Real stories only: the development runs' fixture stories have no web link, or one on a reserved host. */
export const realEntry = (e) => {
  const m = String(e?.link || '').match(/^https?:\/\/([^/:]+)/i);
  return !!m && !/(?:^localhost$|^127\.|^\[?::1|\.(?:invalid|test|example|localhost)$)/i.test(m[1]);
};

/**
 * The eligible events of the window: every airing in the last `days` (default 7) grouped by event (`same`, the news
 * desk's sameStory, else by id), kept only when every airing of the event passes. Each event carries the words the quiz
 * may show, its picture, its usable place and figure, every programme that aired it, its first and last airing and why
 * the others were left out (`out`, for the gate's report).
 */
// Words that tell two stories apart: the long words of a headline, a story's keywords
const COMMON_WORDS = new Set(['about', 'after', 'again', 'against', 'their', 'there', 'these', 'those', 'which', 'while', 'would', 'could', 'should', 'first', 'years', 'people', 'world', 'says', 'said', 'makes', 'still', 'other', 'under', 'between', 'being', 'where', 'every', 'never', 'today', 'report', 'reports', 'study']);
const storyTokens = (e) => new Set([...(Array.isArray(e.kw) ? e.kw : []), ...String(`${e.title || ''} ${e.headline || ''}`).toLowerCase().split(/[^\p{L}\p{N}]+/u)].map((w) => String(w).toLowerCase()).filter((w) => w.length >= 5 && !COMMON_WORDS.has(w)));

/**
 * The window's airings grouped by event: by id, then joined by the news desk's `same` (sameStory) in one section. Only
 * stories sharing a long word are compared, so a week of archive (thousands of airings) groups in a moment rather than
 * the minutes a comparison of every pair would take. Returns [{ key, ids, entries }], entries oldest first.
 */
// the desk's verdicts on pairs of stories, by their ids, for each judge (a story's words do not change between the
// station's asks)
const PAIRS = new WeakMap();
function sameCached(same, a, b) {
  if (!PAIRS.has(same)) PAIRS.set(same, new Map());
  const memo = PAIRS.get(same);
  const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  if (!memo.has(k)) {
    if (memo.size > 200_000) memo.clear();
    memo.set(k, !!same(a, b));
  }
  return memo.get(k);
}

export function groupEvents(entries, same = null) {
  const byId = new Map();
  for (const e of entries) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }
  const ids = [...byId.keys()];
  const parent = ids.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  if (same) {
    const rep = ids.map((id) => byId.get(id).at(-1));
    const index = new Map();
    rep.forEach((e, i) => {
      for (const t of storyTokens(e)) {
        if (!index.has(t)) index.set(t, []);
        index.get(t).push(i);
      }
    });
    const tried = new Set();
    for (const list of index.values()) {
      if (list.length < 2 || list.length > 80) continue; // a word in every other headline joins nothing
      for (let x = 0; x < list.length; x++) {
        for (let y = x + 1; y < list.length; y++) {
          const [a, b] = [list[x], list[y]];
          const k = `${a}:${b}`;
          if (tried.has(k)) continue;
          tried.add(k);
          if (find(a) === find(b) || rep[a].category !== rep[b].category) continue;
          if (sameCached(same, rep[a], rep[b])) parent[find(a)] = find(b);
        }
      }
    }
  }
  const groups = new Map();
  ids.forEach((id, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { key: id, ids: [], entries: [] });
    const g = groups.get(r);
    g.ids.push(id);
    g.entries.push(...byId.get(id));
  });
  for (const g of groups.values()) g.entries.sort((x, y) => x.at - y.at);
  return [...groups.values()];
}

// An airing never changes once archived: its verdict is kept (the station asks every few minutes; a week of airings
// takes seconds to judge the first time and moments after)
const VERDICTS = new WeakMap();
const outOf = (e) => {
  if (!VERDICTS.has(e)) VERDICTS.set(e, entryOut(e));
  return VERDICTS.get(e);
};

export function quizEvents(archive, { now = Date.now(), days = 7, same = null, real = true } = {}) {
  const since = now - days * DAY;
  const groups = groupEvents(archive.entries.filter((e) => e.at >= since && e.at <= now), same);
  const events = [];
  const out = {};
  const avoid = new Set(); // countries named in the stories left out (never a wrong pin)
  for (const g of groups) {
    const entries = real ? g.entries.filter(realEntry) : g.entries;
    if (!entries.length) continue;
    const why = entries.map(outOf).find(Boolean);
    if (why) {
      out[why] = (out[why] || 0) + 1;
      for (const e of entries) for (const c of countriesIn(`${e.title || ''}. ${e.headline || ''}. ${e.summary || ''}`)) avoid.add(c);
      continue;
    }
    const latest = entries.at(-1);
    const words = quizWords(latest) || entries.map(quizWords).filter(Boolean).at(-1) || null;
    if (!words) {
      out['broken headline'] = (out['broken headline'] || 0) + 1;
      continue;
    }
    if (labelLike(words)) {
      out['not a headline'] = (out['not a headline'] || 0) + 1;
      continue;
    }
    const withImage = [...entries].reverse().find((e) => e.image);
    // corrections: the latest aired figure, and none that aired with two values within an hour
    const figures = entries.map((e) => ({ at: e.at, f: usableFigure(e) })).filter((x) => x.f);
    const figure = figures.length && !figures.some((x) => figures.some((y) => Math.abs(x.at - y.at) < 3600_000 && x.f.value !== y.f.value)) ? figures.at(-1).f : null;
    events.push({
      key: g.key,
      ids: g.ids,
      words,
      image: withImage?.image || null,
      // the airing that carried the picture (the station serves it as /api/img/<imageId>: the director's preload)
      imageId: withImage?.id || null,
      place: usablePlace(latest, words),
      optionPlace: optionPlace(latest),
      figure,
      figureAt: figure ? figures.at(-1).at : null,
      programmes: [...new Set(entries.map((e) => e.programId).filter(Boolean))],
      first: entries[0].at,
      last: latest.at,
      category: latest.category || null,
      source: String(latest.source || '').split(' / ')[0] || null,
      latest,
    });
  }
  return { events, out, avoid, groups: groups.length };
}

// Names in a headline (capitalised words not at its start), to keep two options from being one story told twice
// ("Citroën unveils electric version of its 2CV" / "Citroën's iconic 2CV returns as all-electric model", 12 Oct)
const COMMON = new Set(['the', 'a', 'an', 'new', 'first', 'how', 'why', 'what', 'who', 'its', 'it', 'this', 'that', 'these', 'those', 'just', 'after', 'inside', 'revival', 'former', 'long-lost', 'scientists', 'study']);
export function namesIn(words) {
  const out = new Set();
  const tokens = String(words ?? '').split(/\s+/);
  tokens.forEach((t, i) => {
    const w = t.replace(/^[‘'"“(]+|[’'"”),.:;!?]+$/g, '').replace(/['’]s$/, '');
    if (w.length < 3) return;
    // a headline's first word is capitalised anyway: it counts only when shaped like a name ("OpenAI", "NASA",
    // "Citroën's"), never as a common noun ("Museum opens…", "Startup raises…")
    const nameLike = i > 0 || /\p{Lu}.*\p{Lu}/u.test(w.slice(1)) || /^\p{Lu}{2,}$/u.test(w) || /['’]s$/.test(t.replace(/[),.:;!?]+$/, ''));
    if (/^\p{Lu}/u.test(w) && nameLike && !COMMON.has(w.toLowerCase())) out.add(w.toLowerCase());
    if (/\d/.test(w) && /\p{L}/u.test(w)) out.add(w.toLowerCase()); // "2CV", "M5"
  });
  return out;
}

// A headline's first word, when it could be a name (capitalised, not a common opener): "Facebook will let you…"
function openingName(words) {
  const w = (String(words ?? '').split(/\s+/)[0] || '').replace(/^[‘'"“(]+|[’'"”),.:;!?]+$/g, '').replace(/['’]s$/, '');
  return w.length >= 3 && /^\p{Lu}/u.test(w) && !COMMON.has(w.toLowerCase()) ? w.toLowerCase() : null;
}
// A headline's hyphenated compounds of letters ("vibe-coded", "self-destruct")
const compoundsIn = (words) => new Set((String(words ?? '').toLowerCase().match(/\p{L}+(?:-\p{L}+)+/gu) || []));
// The names in what a story's source opened with: its title and the first sentence of its summary
const leadNames = (ev) => namesIn(`${ev?.latest?.title || ''} ${sentencesIn(String(ev?.latest?.summary || ''))[0] || ''}`);

/**
 * Do two events look like one story (a shared name), even when the desk's grouping kept them apart? Two headlines that
 * open on the same word are one story when their sources' openings share a name besides it: "Facebook will let you
 * customize your feed algorithm using AI" (The Verge) and "Facebook is giving users more control" (TechCrunch), both
 * Meta's "Your Algorithm", were asked in one edition on air (step 7, round 15, 13 Oct).
 */
export const shareName = (a, b) => {
  if ([...namesIn(a.words)].some((n) => namesIn(b.words).has(n))) return true;
  const open = openingName(a.words);
  if (!open || open !== openingName(b.words)) return false;
  // (or a coined compound both headlines use: "Google makes it easier to launch your vibe-coded apps" and "Google wants
  // to host your personal vibe-coded apps", round 15's reading, 13 and 14 Oct)
  const cb = compoundsIn(b.words);
  if ([...compoundsIn(a.words)].some((w) => cb.has(w))) return true;
  const nb = leadNames(b);
  return [...leadNames(a)].some((n) => n !== open && nb.has(n));
};

export const DAY_MS = DAY;

// PRESS START's standards as word lists, for the design's measurement (docs/programmes/press-start.md §4). Each rule is a
// rule the desk will apply (build step 1 turns this file into the server's games desk); here it measures what each one
// removes from, or marks in, a live sample of the games outlets. Word lists, so every match is checked by hand in the
// design's critique (docs/roadmap/critique/press-start-design.md) and again at step 1's gate.
//
//   classify(item) -> { out, kinds, treatment, event }   out: the first rule that keeps this report off the programme,
//                                                         or null; kinds: every rule that matched; treatment: 'news',
//                                                         'serious', 'tribute', 'legal' or 'review'; event: the rules that
//                                                         put the whole event out, whichever outlet's report is told
//   gamesTopic(item)                                      is it about video games at all
//   channelGrave(item)                                    the channel's own grave and excluded-kind verdicts, for the
//                                                         false-positive count (game titles and fiction)
import { isGrave, sentencesIn } from '../../server/facts.js';
import { excludedKind } from '../../server/quiz/desk.js';
import { notNews } from '../../server/news.js';

// Game titles and in-game words that carry a grave or crime word ("Grand Theft Auto", "Gears of War", "Heavy Metal Death
// Can", "Nekome: Nazi Hunter", "Stalker"): masked before any rule about the real world reads a text. A list, so the gate
// adds what the sample shows.
export const TITLE_LOOKALIKES = /\b(?:grand theft auto|gta(?: online| vi{1,3}| \d)?|gears of war|god of war|war thunder|warhammer|warframe|wardogs|battlefield|call of duty|black ops|modern warfare|mortal kombat|killer instinct|kill la kill|killing floor|dead space|dead island|dead by daylight|dead cells|dead rising|deadlock|dying light|death stranding|death(?:loop| can)|heavy metal death can|hitman|assassin['’]s creed|sniper elite|sniper arena|resident evil|silent hill|bloodborne|blood of dawnwalker|vampire(?: life| survivors| the masquerade)?|doom(?: eternal)?|hotline miami|crime boss|payday|thief|prison architect|escape from tarkov|hunt: showdown|stalker|s\.t\.a\.l\.k\.e\.r\.|nazi hunter|wolfenstein|metal gear(?: solid)?|mafia(?: the old country)?|saints row|watch dogs|sleeping dogs|the last of us|the callisto protocol|five nights at freddy['’]s|friday the 13th|crystal lake|jason voorhees|evil within|outlast|manhunt|dementium|horrorvale|russian roulette game|urine trouble|pee v pee|gangs of \w+|ghost of (?:tsushima|yotei)|helldivers|arc raiders|counter-strike|valorant|rainbow six|apex legends|overwatch|fortnite|pubg|splitgate|deathmatch|battle royale|kill ?streaks?|headshots?|boss fights?|bosses|enemies|zombies?|in-game|the game['’]s|police chase|heists?|shoot(?:er|ers|ing gallery)|fps|among us|we happy few|i am bread|my time at \w+|thank you bus driver|it takes two)\b/gi;
// the channel's notNews reads "puzzle" as a newspaper puzzle; in a games headline it is a genre ("Porta Nubi turns the iPhone
// Duo into part of the puzzle")
const gameNoun = (t) => String(t ?? '').replace(/\bpuzzl(?:e|es|er|ers|ing)\b/gi, 'game');
const masked = (t) => String(t ?? '').replace(TITLE_LOOKALIKES, ' ');

const text = (s) => `${s?.title || ''}. ${s?.summary || ''}`;
const head = (s) => String(s?.title || '');
// the subject: the headline and the summary's first sentence (a passing word in a later sentence does not make a story)
const subject = (s) => `${head(s)}. ${sentencesIn(String(s?.summary || ''))[0] || ''}`;
// someone else's words: the rules on the outlet's voice never read inside a quotation (an apostrophe inside it, "It's",
// does not close it)
export const unquoted = (t) =>
  String(t)
    .replace(/[“"][^”"]*[”"]/g, ' ')
    .replace(/(^|[\s:(—–-])['‘](?:[^'’]|['’](?=\p{L}))+['’](?=[\s,.:;!?)—–-]|$)/gu, '$1 ');

// ---------------------------------------------------------------------------------------------------------------------
// Is it about video games? A games outlet's feed is about games unless its headline is about something else: films and
// television (a game's adaptation too: the culture desk's), cards and toys, PC parts and general technology, word
// puzzles, streamers' lives (GamesRadar+ files Marvel and Batman; PC Gamer the Linux kernel; TheGamer Wordle; Siliconera
// a VTuber's hiatus). A mainstream or TECH BYTES feed is read for its games items only: a strong games word in its
// headline.
const OFF_TOPIC = [
  /\b(?:movies?|films?|filming|box office|rotten tomatoes|cinemas?|live-action|tv series|tv show|television|netflix series|on netflix|hbo|disney\+|prime video|apple tv|paramount\+?|showrunner|sitcom|episodes? \d|season \d+ (?:episode|finale|premiere)|post-credits|mcu|marvel studios|dcu|the batman|avengers|x-men|anime series|anime adaptation|documentary|edgerunners|visionquest|wandavision|loki)\b/i,
  /\b(?:mtg|magic: the gathering|commander decks?|trading card game|board games?(?! (?:action|adaptation) to (?:mobile|switch|pc|consoles))|tabletop|dungeons (?:&|and) dragons|lego|funko|statues?|figures? and plush|figurines?|replica|plush\w*|acrylic|magnets|vinyl|steelbooks?|merch(?:andise)?|cosplay|t-shirts?|hoodies?|soundtrack albums?)\b/i,
  /\b(?:linux kernel|windows (?:11|12|settings|update)|graphics cards?|gpus?|cpus?|rtx \d{4}|rtx spark|radeon|geforce|ryzen|intel(?:['’]s)? (?:core|arc|gpus?|response)|x3d|dlss|motherboards?|ssds?|(?:gaming )?monitors?|oled panels?|\d+ ?hz panels?|tvs?\b|mini-led|iphone duo preorders|smartphones?|(?:gaming )?laptops?|e-?readers?|boox|(?:gaming )?mice|mouse|keyboards?|headsets?|speakers?|routers?|ai bubble|stock market debut|tesla|openai|(?:smart|vr|ar) glasses)\b/i,
  /\b(?:wordle|minute cryptic|crossword|sudoku|connections hint)\b/i,
  /\b(?:vtubers?|hololive|nijisanji|streamer['’]?s?|influencers?|youtubers?|tiktokers?)\b/i,
  // (rules v4, from the pages read at 17:22 on 16 Oct: Siliconera files anime, figures, toys and clothing beside its
  // games news: "Dragon Ball Super: Beerus Anime Debut Date", "Xenogears Bring Arts Action Figure Appears in February
  // 2027", "Canon-Accurate Danganronpa 2 Underwear Will Come Out in 2027", "Evangelion Audio Drama Will Appear on
  // Tokaido Shinkansen")
  /\b(?:anime(?! (?:game|rpg|fighter|style|shooter|roguelike|action|stalker))|manga|webtoon|audio drama|light novel|action figures?|scale figures?|figures? (?:and plush|appears?|arrives?|debuts?|follows?|revealed?)|figure (?:follows|appears|arrives|debuts|revealed)|nendoroid|figma|toys?\b|plushies?|apparel|underwear|clothing)\b/i,
  // (rules v5, from 16 Oct: a character brand's tie-in with an airline, "Chiikawa Characters Get Jobs in ANA
  // Collaboration")
  /\bairlines?\b|\b(?:ANA|JAL)(?= [Cc]ollab)/,
  // (rules v7, from held-out set E: the rules above named a figure only by what it did, and Siliconera's merchandise
  // came in other words: "2 Figures of Persona 4 Revival Protagonist Yu Narukami Confirmed", "Xenosaga KOS-MOS Model Kit
  // Returns in May 2027", "Family Computer & Nintendo Entertainment System Photo Book Debuts", "Persona Super Live 2027
  // Concert Will Last 3 Days", "Mall of America Bandai Namco Cross Store and Gundam Base Openings Delayed")
  /\b(?:figures?(?! out\b)|figurines?|model kits?|gunpla|(?:photo|art|picture) ?books?|artbooks?|keychains?|acrylic stands?|collectibles?|concerts?|orchestra (?:tour|concert)|(?:store|shop|caf[eé]) openings?|pop-up (?:store|shop|caf[eé])|gundam base)\b/i,
  // (rules v8, from held-out set F: "Creer Beaute Pon de Couleur Animal Crossing Makeup Gashapon Announced", "Yu-Gi-Oh
  // Crocs and Jibbitz Charms Launch Next Week", "Cospa to Release New NieR Automata Shirts and Jacket")
  /\b(?:gashapon|gachapon|capsule toys?|crocs|jibbitz|charms|shirts?|jackets?|sneakers|shoes|make-?up|cosmetics?|perfumes?|fragrances?|lipsticks?)\b/i,
  // (rules v9, from held-out set G: "SuperGroupies Sells Sega Mega Drive, Saturn, and Dreamcast Watches", "Final Fantasy X
  // Museum Tickets and Goods Revealed", "Kingdom Hearts Art Museum Trading Cards Return", "Kingdom Hearts 25th
  // Anniversary Exhibition Will Open in 2027", "Final Fantasy X 25th Anniversary Cafe Announced", "Suntory Vending
  // Machines Will Sell FFXIV Original Label Sticker Cans", "Hunter x Hunter Takoyaki Collaboration")
  /\b(?:watches|goods|souvenirs?|trading cards|exhibitions?(?! (?:match|matches|mode|games?))|(?:art )?museum (?:tickets|exhibition|opens|opening)|art museum|caf[eé]s?(?= (?:announced|opens?|returns?|collaboration))|themed caf[eé]|vending machines?|takoyaki|theme parks?)\b/i,
];
// (a figure that is a number or a person is not merchandise: "sales figures", "a key figure")
const FIGURE_NOT_MERCH = /\b(?:sales|player|revenue|official|key|public|leading|industry|concurrent|download|viewership) figures?\b|\bfigures? (?:show|suggest|reveal(?:s|ed)? (?:that|how)|from)\b/i;
const STRONG_GAMES = /\b(?:video ?games?|videogames?|gaming|gamers?|consoles?|playstation|ps[2-6]\b|xbox|nintendo|switch 2|steam deck|steam(?=['’]s|\b(?! engine| room| locomotive))|epic games|fortnite|minecraft|roblox|grand theft auto|gta|call of duty|zelda|mario|pok[eé]mon|esports?|game awards|gamescom|bafta games)\b/i;
const CHANNEL_KINDS = new Set(['channel-tech', 'mainstream-general']);
const GAME_HEAD = /\b(?:games?|gaming|gameplay|playable|consoles?|handheld|dlc|patch|update|remaster\w*|remake|sequel|trailer|demo|early access|steam|ps5|ps4|xbox|switch|nintendo|playstation|pc|mobile|ios|android|studios?|developers?|devs?|publisher|rpg|jrpg|mmo|shooter|roguelike|soulslike|expansion|season \d|launch\w*)\b/i;
export function gamesTopic(s) {
  const h = head(s);
  if (OFF_TOPIC.some((re) => re.test(FIGURE_NOT_MERCH.test(h) ? h.replace(FIGURE_NOT_MERCH, ' ') : h))) return false;
  // a headline with no word of games, whose opening sentence is about a film or a part ("Street Fighter review roundup:
  // sorry, folks, but it sounds like a mess", PC Gamer 15 Oct: the film)
  const opening = sentencesIn(String(s?.summary || ''))[0] || '';
  if (!GAME_HEAD.test(h) && OFF_TOPIC.some((re) => re.test(opening))) return false;
  if (CHANNEL_KINDS.has(s?.kind) && !STRONG_GAMES.test(h)) return false;
  return true;
}

// a headline in another language ("Voici tout ce dont vous aurez besoin pour votre premier événement Play! Pokémon",
// GamesRadar+ 16 Oct): the screen is English
const FOREIGN = /\b(?:voici|vous|votre|pour|avec|dans|les|des|une|el|los|para|con|und|der|die|das|mit)\b/gi;
const notEnglish = (t) => (String(t).match(FOREIGN) || []).length >= 2;

// ---------------------------------------------------------------------------------------------------------------------
// The rules.

// guides, codes and service pages: "All Ghost Driver codes (October 2026) and how to redeem them", "Where to find the
// Takashiro region Treasure Hunt", "Modern Warfare 4 release times and early access explained", "Clash Royale tier list",
// "Tales of Eternia Remastered DLC guide", "Complete XBOX Disc-to-Digital Games List"
const GUIDE = /^(?:how to|where to|when (?:is|does|will|can)|what (?:is|are|time)|all (?:the )?\w|every\b|best\b|the best\b|\d+ best|top \d+|\d+ things|guide\b|walkthrough|tips\b|can you\b|roundup:|icymi\b)|\b(?:codes?\s*\((?:\w+ )?\d{4}\)|redeem codes?|free (?:spins|coins|dice|credits|gems)|daily (?:free )?links?|tier list|walkthrough|guide\b|explained|everything (?:you need|to know)|all you need to know|release (?:times?|countdown)|countdown\b|exact (?:date and )?time|where to find|how to (?:get|unlock|beat|solve|find|complete|play|change|redeem|watch)|solutions? and rewards|best (?:players|builds?|loadouts?|spots|weapons|settings|farms?|vehicle upgrades|cards|characters)|easter eggs|list of (?:every|all)|games list|interactive map|can you skip|here['’]s (?:when|where|every|how|what|why)|evening reading|download size|where to watch|tips:|hints? to|beginner['’]s|should you (?:use|buy|play|pick|choose)|everything (?:announced|revealed|shown)|(?:all|every) (?:the )?(?:announcements|reveals)|biggest (?:announcements|reveals)|all the .{0,50}\b(?:reveals|announcements))\b|^should you\b|^here are (?:all )?the\b/i;
// money changing hands, or asked to: deals, preorders, stock, bundles, sales, giveaways, free weekends, gift guides,
// the platforms' own listings ("Alienware's latest 34-inch QD-OLED gaming monitor is $50 off", "Xbox X25 controller
// pre-orders are back in stock", "Battlefield 6 Is Free on Steam, but Not for Long", "Free Play Days")
const COMMERCE = /(?:\$\d[\d,.]*\s+off\b|£\d[\d,.]*\s+off\b|\d+% off\b|\bhalf[- ]off\b|\bhalf price\b)|\b(?:deals? (?:of the day|on|for|at)\b|(?:best|early|top|great|big) deals?\b|save \$?£?€?\d|price drops?|lowest price|bargain\w*|on sale\b|(?:summer|winter|spring|autumn|halloween|franchise|publisher|weekend|flash|steam) sale\b|discount\w*|coupon|promo codes?|pre-?orders?\b|pre-?order bonus\w*|back in stock|in stock|restock\w*|bundle\b|humble (?:bundle|choice)|giveaway|up for the taking|for free this (?:week|weekend)|free this (?:week|weekend)|free (?:on steam|to keep|weekend)|free play days|is free (?:on|for|this)|gifts?\b|gift guide|black friday|prime day|cyber monday|cheapest|where to buy|buy now|share of the week|(?:ps|playstation) plus (?:game catalog|monthly|extra|premium|essential)|game pass (?:wave|additions)|games are out today|games are available today|new games for|reduced by \d+%|available now on google play pass|(?:ps|playstation) plus games? catalog|collector['’]s edition|don['’]t miss (?:out|this)|per month\b)\b|^(?:get|grab|snag|score) (?:a|an|the|this|these)\b.{0,80}[$£€]\d/i;
// the outlet's own voice: columns, polls, talking points, features, interviews, previews and impressions, the reader
// addressed, first person, questions, lists, videos and podcasts, interjections and teasers ("Talking Point: …", "|
// Opinion", "Semifinals: … needs your votes", "Preview: 'Eternal Anima' …", "Whoa, This Minecraft Mod…", "Final Fantasy
// XIII Is Long Overdue for an HD Remaster", "007 First Light On Switch 2 Includes Something No Other Platform Gets, And
// It's Ridiculous")
const OUTLET_VOICE = /\|\s*opinion\b|^opinion:|^(?:talking point|feature|interview|video|podcast|preview|poll|soapbox|editorial|weekly|weekend|the sunday papers|what are we all playing|this week in|review roundup)\b|^(?:whoa|welp|wow|yikes|oof|phew|ugh|ok so|so,|finally:|new fear dropped)\b|^(?:this|these|one of|something|here['’]s our)\b|\b(?:needs your votes|your votes?|vote now|we asked|readers?['’] (?:choice|poll)|you think|in your opinion|hands-on|impressions|preview\b|interview (?:with|:)|podcast\b|retrospective|oral history|recap\b|let['’]s settle this|\w+ vs\.? \w+.{0,40}:|games? (?:you|to) (?:should )?play|should you play|you should play|you need to (?:see|play|add)|need to (?:see|play|know)|must see|reasons? to be (?:hyped|excited)|is long overdue|(?:doesn['’]t|don['’]t) need (?:more|another)|deserves? (?:a|an|better|more)|should (?:be|have|get|make)\b|shouldn['’]t|needs to\b|and it['’]s (?:\w+ )?\w+$|for real$|please don['’]t|all of you|you folks|your wish|you['’]re invited|if you (?:loved|like|liked)|on (?:whether|why|how|what) (?:the|it|he|she|they)\b|(?:director|producer|creator|developers?) on\b|looks like (?:it|they|this|a)\b|seems like|proves (?:that|there|why)|doesn['’]t do .{3,60} justice|put down your|is (?:so )?bad\b|might have paid off|the perfect excuse|takes the trophy|punniest|like an avalanche|(?:what|sure|which) sounds? like|while avoiding|looking back|worthy heir|a look at\b|here['’]s why|the case for|shines? on|however it looks|the internet (?:loves|hates|is)|(?:huge|high|rave) praise\b|from this (?:former|ex|famous|legendary)\b|^cover reveal\b|cover story\b|best places to work|\bbut (?:gets|is|feels|runs|looks) (?:a (?:bit|little) )?(?:buggy|rough|janky|clunky|messy|shaky|flat|disappointing)\b|\b(?:fans|players) (?:aren['’]t|are not) happy|\b(?:fans|players) (?:are )?(?:furious|livid|outraged|fuming|up in arms))|[–—-]\s+how\b|\?\s+why\b/i;
// the reader addressed ("Put Down Your Pitchforks", "knowing your audience is a good start"); a game's feature described is not
// ("…Will Let You Erase Your Mistakes")
const READER = (t) => (/\byour\b/i.test(t) && !/\b(?:lets?|allows?|helps?) (?:you|players)\b/i.test(t)) || /\byou['’]ll\b|\byou will have\b/i.test(t);
// first person (the outlet's "I", "we"; a title's "I Live Next to…" is the measured cost, since title-case outlets
// capitalise every word); "US" the country is not "us"
const FIRST_PERSON = /(?:^|[\s‘"“(])(?:I|I['’]m|I['’]ve|I['’]d|I['’]ll|[Mm]y|[Mm]e|[Ww]e|[Ww]e['’]re|[Ww]e['’]ve|[Ww]e['’]ll|[Oo]ur|[Uu]s)(?=[\s,.!?:;)’'”]|$)/;

// reviews: a verdict, never a fact; they go to THE REVIEWS, attributed, and never into the news ("Penguin Colony review –
// an Antarctic odyssey…", "Asus ROG Xbox Ally X20 Review", "The First Review For Final Fantasy Resonance Is In")
const REVIEW = /\breview(?:ed|s)?\b(?!\s+(?:bomb\w*|embargo|copies|codes?)\b)|\bverdict\b/i;

// leaks: the leak is the story, so the whole event stays off whichever outlet tells it, and a leak's pictures never air
// ("GTA 6 leaker's latest video allegedly shows scenes from the final mission", "Footage from a reportedly cancelled
// Assassin's Creed game set in China has leaked", "Shrek 2 Remastered Microsoft Store page appears")
// (a leak as the event, never leaks as a subject a studio talks about: "Rockstar reveals, in interview tackling crunch,
// delays, and leaks")
const LEAK = /\b(?:leaked|leaker|leakers|leaking|leaks? (?:online|shows?|reveals?|suggests?|points?|claims?|confirms?|appears?)|(?:a|new|latest|massive|huge|alleged|apparent) leak|leak(?:s)? of|datamin\w*|data-?mine\w*|store (?:page|listing) (?:appears|spotted|surfaces)|leaks? via|rating (?:appears|spotted|surfaces))\b/i;
// rumours and guesses: a report not ours, a guess, an analyst's forecast; this report stays off, and the event airs only
// from an outlet that states it as announced ("Ubisoft reportedly look to cut 100 more jobs", "Next Red Dead Launching
// By 2027 Or 2028 'May Not Be Unreasonable,' Bank Says", "GTA 5 Will Be Removed From PS Plus …, It Seems")
const RUMOUR = /\b(?:allegedly|alleged\b(?! (?:by|in) (?:a |the )?(?:lawsuit|court|complaint|filing))|rumou?r\w*|reportedly|report:|per a (?:new )?report|report claims|report says|new report|according to (?:a |one )?(?:report|sources|people familiar)|sources (?:say|said|claim)|(?:an?|industry|known) insiders?|insiders? (?:say|claim|suggest)|unconfirmed|speculat\w*|(?:could|may|might) be (?:coming|announced|revealed|released|in the works)|may never|is it coming|fans think|fan theory|wild theory|theory says|not be unreasonable|analysts? (?:says?|predicts?|expects?|forecasts?)|bank says|predicts?\b|prediction|it seems$|people on reddit|reddit users|apparently|a report suggests|estimated to|estimates suggest|according to (?:former )?(?:employee|staff|developer)s?(?:['’]s?)? (?:posts|social media|linkedin)|employee posts|posts on (?:linkedin|social media))\b/i;
// the outlet's own hedge on its headline's claim ("Destiny 1 project … seemingly gets a nod from Bungie boss", "…, It
// Seems"); in a later sentence it hedges a detail ("upscaling that appears to have been done by AI"), not the story
const HEDGE = /\b(?:seemingly|somehow|appears? to (?:be|have)|looks set to|is said to|might (?:be|appear|arrive|launch|come|return|get)|could be|seems? to (?:have|be))\b|,\s*it seems\.?$/i;

// explicit content in what airs (the headline and the opening sentence): sex and nudity, gore. This report stays off and
// none of its pictures airs; the event may air from a report without it ("GTA 6 launch trailer … a saucy shower scene",
// "Lucia's naked", "it really hopes sex sells")
const EXPLICIT = /\b(?:sex\b|sexy|sexual\w*|sex scenes?|sells? sex|sex sells|nud(?:e|es|ity)|naked|topless|boob\w*|breasts?|nipples?|porn\w*|hentai|erotic\w*|saucy|steamy|raunchy|lewd|nsfw|adults? only|ao rating|shower scene|strip(?:per|pers| club)|fetish\w*|onlyfans|twerk\w*|salacious|dick pic\w*|genital\w*|gore\b|gory|dismember\w*|decapitat\w*|mutilat\w*|disembowel\w*)\b/i;

// harm to real people outside the work of making and selling games: harassment, abuse, threats, crime, child safety and
// self-harm. The news programmes tell these (with their correspondents, experts and balance rules); PRESS START does not,
// and the whole event stays off ("Snapchat and Instagram grooming becoming 'easier'", "Russian man linked to deadly London
// hospitals hack arrested", "Amazon scammer seems to have delidded an $889 AMD chip")
const HARM = /\b(?:harass\w*|abus(?:e|es|ed|er|ers|ive)\b|misconduct|groom(?:ing|ed|er)|predators?|swatt\w*|doxx\w*|death threats?|threat(?:s|en\w*)? (?:against|to kill|of violence)|stalking|stalked|assault\w*|rapes?\b|raped|racis\w*|slurs?\b|bully\w*|child (?:safety|abuse|exploitation|protection)|exploitation|suicid\w*|self-harm|arrest(?:s|ed|ing)?\b|charged with|jailed|prison sentence|sentenced|convicted|pleads? guilty|found guilty|guilty verdict|police (?:say|said|raid\w*|investigat\w*|arrest\w*)|murder(?:ed|er|ers)?\b|terror\w*|mass shooting|shooting at|scam(?:s|mer|mers|med)?\b|fraud\w*|theft|stolen|hackers? (?:stole|steal|leak|breach)|data breach|ransomware)\b/i;
// a person's death: an industry figure's gets the tribute treatment (§4.8); anyone else's is grave news for the news
// programmes ("Duke Nukem 3D level designer Richard "Levelord" Gray dies aged 68")
const DEATH = /\b(?:dies|died|dead at|death of|has died|passed away|passes away|obituar\w*|in memoriam|rest in peace|tributes? (?:paid|pour))\b/i;
// (RIP in capitals only, as the channel's OBITUARY: "Smash Bros creator says original games will be harder for AI to rip off")
const RIP = /(?<![\p{L}])R\.?I\.?P\.?(?![\p{L}])/u;
const died = (t) => DEATH.test(t) || RIP.test(t);
const INDUSTRY_PERSON = /\b(?:designer|developer|creator|co-creator|founder|co-founder|director|producer|composer|artist|writer|programmer|voice actor|voice of|animator|studio head|ceo|veteran|legendary|pioneer|level designer)\b/i;

// politics and conflict: a war, an occupation, a boycott over one, sanctions, parties and elections are the news
// programmes' (their balance rules), and the whole event stays off ("Big Walk developer House House won't release the
// game on Xbox because of a Palestine-led Microsoft boycott")
const CONFLICT = /\b(?:war in|invasion|israel\w*|palestin\w*|gaza|west bank|ukrain\w*|russia(?:n|ns)?\b(?! roulette)|bds\b|boycott\w*|sanction\w*|hamas|hezbollah|genocide|occupation|military|army\b|elections?|electoral|ballot|political party|republicans?|democrats?|labour party|conservative party|trump\w*|biden|putin|zelensky\w*|netanyahu|xi jinping|9\/11)\b/i;

// gambling and its look-alikes: casino and slots, betting, loot boxes, gacha draws offered, free spins and coin links. A
// law or a ruling about loot boxes is legal news (below) and airs
const GAMBLING = /\b(?:gambl\w*|casino\w*|slot machines?|betting|bets?\b|bet (?:cash|money|on)|bookmakers?|odds\b|poker|blackjack|bingo|coin master|monopoly go|free (?:spins|coins|dice|pulls|credits)|loot ?box\w*|gacha\b|summon rates?|skin gambling|case opening|crypto\w*|nfts?\b|play-to-earn)\b/i;
const LAW_WORDS = /\b(?:law|laws|legislation|regulat\w*|regulators?|banned|bans|court|courts|ruling|judge|lawsuits?|sue[sd]|suing|class action|settlement|tribunal|patents?|antitrust|competition (?:authority|watchdog)|ftc|cma|european commission|congress\w*|senat\w*|parliament|government|ministry|notorious market list|age verification|online safety act)\b/i;
// a bill or an act by name ("Power To The Players Act"), never a game's chapter ("Act 1: Kokura") nor a person (Bill)
const LAW_NAMED = /\b(?:[A-Z][\w’']+ )+Act\b(?!\s*\d)|\bbill\b/;
const LAW = { test: (t) => LAW_WORDS.test(t) || LAW_NAMED.test(t) };

// a person's jibe at another, or a firm's at a rival: gossip, not news ("'Little Tim is so obsessed with Gabe': Former
// Valve writer baffled by Epic CEO Tim Sweeney…", "Ex-Valve dev not impressed by … Tim Sweeney's latest dig at Gabe
// Newell", "Epic throws shade at Steam")
const FEUD = /\b(?:obsessed with|baffled by|not impressed|latest dig|digs? at|takes? (?:a )?shots? at|taking shots|throws? shade|calls? out|slams?\b|slammed|aiming shots|mocks?|mocked|feud|spat\b|war of words|trolls?\b(?! (?:aren|are|in|as))|roasts?\b)\b/i;

// hardship in the industry: layoffs, closures, cuts, strikes, administration. Told plainly and fully, never as a joke,
// never on PATCH NOTES (§4.6) ("Fishlabs announces layoffs", "Ubisoft closing Trials developer RedLynx")
const HARDSHIP = /\b(?:lay(?:s|ing)? off|layoffs?|laid off|redundanc\w*|job (?:cuts|losses)|cut(?:s|ting)? (?:over |more than |about |around |nearly )?(?:[\d,]+ )?(?:more )?jobs|(?:studio|developer|team|maker)\b.{0,40}\b(?:is|are) (?:shutting down|closing)\b|collective action|reduce (?:its )?workforce|workforce reduction|voluntary departure|downsiz\w*|clos(?:e|es|ed|ing|ure) (?:of )?(?:\w+ ){0,3}(?:studio|developer|office|team)|closing \w+ developer|studio closure|shut(?:s|ting)? down (?:\w+ ){0,3}(?:studio|developer|team)|shutdown of|enters? administration|administration again|bankrupt\w*|insolven\w*|strike\b|strikes\b|walk-?out|unions?\b|unionised|unionized|union-busting|union busting|crunch\b|unpaid)\b/i;

// unattributed praise or blame in the outlet's own words: the strap and the presenters never carry it (FULL TIME's rule,
// full-time.md §3.4): "Hit indie co-op climbing game Peak", "Excellent French electronic duo Justice", "iconic Xbox 360
// masterpiece", "Gets Slammed", "Insane Miami Marketing Push"
export const EVALUATIVE = /\b(?:hit\b(?= (?:indie|game|co-op|survival|series|rpg|shooter|title|sequel|mmo|sim|simulator|mobile|horror))|beloved|iconic|legendary|masterpiece|masterful|excellent|fantastic|brilliant|stunning|gorgeous|beautiful|polished|stellar|superb|sublime|perfect\b|flawless|incredible|amazing|awesome|terrific|wonderful|must-play|essential|best\b|finest|greatest|coolest|worst\b|worse\b|terrible|awful|dreadful|disastrous|broken\b|mess\b|messy|janky|slop\b|lazy|cash grab|ripped off|savaged|slammed|panned|underwhelming|disappointing|mediocre|bland|boring|ugly|weird|insane|wild\b|crazy|chaotic|ridiculous|on-the-nose|tasty|delightful|charming|quirky|cosy|cozy|cult (?:hit|classic)|viral hit|smash hit|controversial|monumentally|expansive|looks? (?:great|pretty good|amazing|incredible|stunning)|huge praise|massive(?:ly)?|bad\b|generous|smart choices|crazy|stacked)\b/i;

// The order: off-desk first (not news, not games), then what never airs, then how the rest is told.
export const RULES = [
  ['off-topic', (s) => !gamesTopic(s) || notEnglish(head(s))],
  ['guide', (s) => GUIDE.test(head(s))],
  ['commerce', (s) => COMMERCE.test(unquoted(head(s)))],
  ['review', (s) => REVIEW.test(unquoted(head(s)))],
  ['outlet voice', (s) => OUTLET_VOICE.test(unquoted(head(s))) || READER(unquoted(head(s))) || FIRST_PERSON.test(masked(unquoted(head(s)))) || /\?\s*$/.test(unquoted(head(s)).trim()) || notNews({ ...s, title: gameNoun(s.title), category: 'games' })],
  ['leak', (s) => LEAK.test(masked(unquoted(subject(s))))],
  ['rumour', (s) => RUMOUR.test(unquoted(subject(s))) || HEDGE.test(unquoted(head(s)))],
  ['explicit', (s) => EXPLICIT.test(subject(s))],
  ['harm to people', (s) => HARM.test(masked(unquoted(subject(s)))) || (died(masked(subject(s))) && !INDUSTRY_PERSON.test(subject(s)))],
  ['conflict or politics', (s) => CONFLICT.test(subject(s))],
  ['gambling', (s) => GAMBLING.test(subject(s)) && !LAW.test(subject(s))],
  ['feud or gossip', (s) => FEUD.test(unquoted(head(s)))],
  // how the rest is told
  ['death (tribute)', (s) => died(masked(subject(s))) && INDUSTRY_PERSON.test(subject(s))],
  ['hardship (serious)', (s) => HARDSHIP.test(masked(unquoted(subject(s))))],
  ['legal', (s) => LAW.test(unquoted(subject(s)))],
  ['evaluative words', (s) => EVALUATIVE.test(unquoted(head(s)))],
];
// the rules that keep a report off the programme (the others change how it is told); a review goes to THE REVIEWS
export const KEEPS_OFF = new Set(['off-topic', 'guide', 'commerce', 'review', 'outlet voice', 'leak', 'rumour', 'explicit', 'harm to people', 'conflict or politics', 'gambling', 'feud or gossip']);
// the rules that put the whole event off, whichever outlet's report is told: the event itself is a leak, harm to people,
// a conflict, gambling or a rumour. The others judge one outlet's telling, and the event airs from another's. A rule puts
// the event off when at least half of its reports carry it (tools/play/measure.mjs): one report wrongly joined never
// does, and a report that drops the others' "reportedly" does not make a rumour a fact ("Epic Games delays Disney game
// and tells developers to go 'AI first'", GamesIndustry.biz 12 Oct, of Business Insider's report that three outlets hedge)
export const EVENT_RULES = new Set(['leak', 'harm to people', 'conflict or politics', 'gambling', 'rumour']);

// A headline that states an act: a launch, a date, a delay, a deal, a closure, a statement. A feature, a profile or an
// interview states none ("The happiest man in gaming hates generative AI", "'Years of building…' – Why GameDataCore wants
// to find out how players feel", "Kaho Shibuya on her love for turn-based RPGs"); an event only one outlet carries airs
// only with one (tools/play/measure.mjs, the selection)
export const NEWS_VERB = /\b(?:announc\w*|launch\w*|releas\w*|reveal\w*|confirm\w*|delay\w*|postpon\w*|cancel\w*|scrap\w*|axe[sd]?|clos(?:e|es|ed|ing)|shut\w*|lay(?:s|ing)? off|laid off|layoffs|cut(?:s|ting)?|sell(?:s|ing)?|sold|tops?|topped|hit(?:s)?|pass(?:es|ed)|surpass\w*|cross(?:es|ed)|reach(?:es|ed)|set(?:s)? (?:a |for|to)|record|add(?:s|ed|ing)?|gets?|comes? to|coming to|arriv\w*|returns?|returned|debut\w*|opens?|opened|ends?|ended|ending|remov\w*|pull(?:s|ed)|patch\w*|fix(?:es|ed)|updat\w*|rules?|ruled|sues?|sued|wins?|won|joins?|joined|splits?|acquir\w*|buys?|bought|merg\w*|partners?|signs?|signed|hires?|hired|appoint\w*|names?|denies|denied|says?|said|tells?|warns?|insists?|expands?|drops?|dropped|out now|now available|available|dated|is dated|due|rolls? out|brings?|offers?|introduc\w*|unveil\w*|shows?|showcas\w*|plans?|will|to (?:release|launch|close|lay off|cut|add|bring|end|join|sell|buy|acquire|merge)|is coming|are coming|goes|go free|becomes?|became|enters?|entered|raises?|raised|funds?|funded|invests?|files?|filed|approves?|approved|blocks?|blocked|bans?|banned|fines?|fined|wins?|leads?|led)\b/i;
export const hasNewsVerb = (title) => NEWS_VERB.test(masked(unquoted(title)));

export function classify(s) {
  const kinds = RULES.filter(([, test]) => test(s)).map(([id]) => id);
  const out = kinds.find((k) => KEEPS_OFF.has(k)) || null;
  const treatment = out === 'review' ? 'review' : out ? null : kinds.includes('death (tribute)') ? 'tribute' : kinds.includes('hardship (serious)') ? 'serious' : kinds.includes('legal') ? 'legal' : 'news';
  // an event rule counts for the event only when the report is about games (a film's leak is the culture desk's)
  const event = gamesTopic(s) ? kinds.filter((k) => EVENT_RULES.has(k)) : [];
  return { out, kinds, treatment, event };
}

/**
 * The channel's own verdicts on a games item: `isGrave` (server/facts.js) and the quiz's excluded kinds
 * (server/quiz/desk.js). Game titles and fiction set them off ("Heavy Metal Death Can", "Nazi Hunter", "Gears of War"),
 * which is why PRESS START needs rules of its own; the measurement counts how often.
 */
export function channelGrave(s) {
  const t = text(s);
  return { grave: isGrave(t), kind: excludedKind(t, subject(s)) };
}

/** A review's verdict as its outlet wrote it: the headline after "review –" ("Penguin Colony review – an Antarctic odyssey…"). */
export function reviewVerdict(title) {
  // a review in progress is not a verdict ("Call of Duty: Modern Warfare 4 review-in-progress: A campaign you shouldn't
  // skip", PC Gamer 16 Oct)
  if (/\breview[- ]in[- ]progress\b/i.test(String(title || ''))) return null;
  const m = /^(?:review:\s*)?(.{2,80}?)\s+review\s*[-–—:|]\s*(.{8,})$/i.exec(String(title || ''));
  if (m) return { game: m[1].trim(), verdict: m[2].trim() };
  const n = /^review:\s*(.{2,80}?)\s*(?:\([^)]*\))?\s*[-–—]\s*(.{8,})$/i.exec(String(title || ''));
  return n ? { game: n[1].trim(), verdict: n[2].trim() } : null;
}

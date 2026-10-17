// Topics of a story, from its own words: the strap's kicker ("VOLCANO",
// "SPACE") for the offline writer, and a programme's beat for the desk
// (config/channel.json `beat`: COSMOS DESK takes a story from the tech section
// only when it is about space or our planet, never a games console's sales).
// Most specific first, matched on the headline before the summary.

export const TOPICS = [
  // (an execution is a matter of justice, whoever carries it out: "Archbishop of US military condemns Pentagon plans to
  // livestream execution" went out as CONFLICT, Guardian 14 Oct)
  [/\b(?:executions?|death penalty|death row|firing squad)\b/i, 'JUSTICE'],
  // armed conflict first: a "rocket" or "satellite" in a war story is not SPACE, and military "strikes" are not
  // a labour dispute (first live run, 4 Oct: "Yemen's Houthis claim attacks" went out as INDUSTRY)
  [/\b(?:air ?strikes?|airstrikes?|missiles?|drone (?:attacks?|strikes?)|shelling|troops|soldiers|militants?|militias?|rebels?|insurgents?|fighters|(?:heavy|fierce|street|renewed) fighting|fighting (?:in|between|broke out|erupted|continues|raged|around)|clashes|offensive|ceasefire|battlefields?(?! 200)|(?:military|armed|attack|kamikaze|AI-powered) drones|invasion|warplanes?|bombard\w*|front ?line|war\b|military|armed forces|government forces|(?:federal|security|allied|rebel|enemy|ground|special|coalition|paramilitary|[a-z]+(?:ian|ish|ese|i)) forces|houthis?|hezbollah|hamas|taliban|islamic state|al-shabab|boko haram|rapid support forces|struck again|struck by (?:missiles?|drones?|rockets?)|(?:tankers?|ships?|vessels?|convoys?|bases?)\s+(?:\w+\s+)?attacked|\b(?:sea|naval|black sea) strikes|behind (?:the )?(?:\w+ ){0,2}strikes|(?<!heart |panic |cyber[- ]?|asthma |immune |viral |virus |phage |the |this |arson |knife |acid |shark |dog |tiger |bear |sexual |racist |homophobic )attacks?|(?:Russia|Russian|Ukraine|Ukrainian|Israel|Israeli|Iran|Iranian)\w* (?:hits?|strikes?|pounds?|shells?|targets?))\b/i, 'CONFLICT'],
  // a killing is a crime story, whatever else its report mentions (an immigration agent's shooting once went out as
  // CULTURE, a "museum" in its summary, 13 Oct)
  // (and a fire set on purpose or a knife: "Children killed in arson attack named" went out as CONFLICT, 12 Oct)
  [/\bshootings?\b|\barson\b|knife attacks?|shot dead|shot and killed|fatally shot|\b(?:was|were|been|being|got|people|teachers?|pupils?|students?|officers?|men|women|children) shot\b|opened fire|\bgunm[ae]n\b|\bstabb(?:ed|ing|ings)\b|\bmurder(?:ed|s)?\b|manslaughter|homicide|\bsexual (?:assaults?|violence|abuse)\b|\b(?:domestic|family) violence\b/i, 'CRIME'],
  // (an election as the story's time, not its subject: "US inflation rises more than expected ahead of midterm elections" went
  // out as ELECTIONS, BBC 15 Oct)
  [/(?<!\bahead of (?:the )?(?:\w+ )?)\belections?\b|\bvot(?:e|es|ers|ing)\b|\bballots?\b|referendum|polling (?:stations?|day)/i, 'ELECTIONS'],
  [/\bprotests?\b|protesters?|demonstrat(?:ion|ions|ors)\b/i, 'PROTESTS'],
  // a strike is a labour dispute only with its workers, union or pay in the same sentence (ahead of the sector
  // topics: a nurses' or a rail strike is the dispute)
  [/\b(?:workers?|staff|employees|unions?|pay)\b[^.]{0,60}\bstrik(?:e|es|ing)\b|\bstrik(?:e|es|ing)\b[^.]{0,60}\b(?:workers?|staff|employees|unions?|pay)\b|walkouts?|\bwalk(?:s|ed|ing)? out\b|industrial action/i, 'INDUSTRY'],
  // (an eruption on a black hole, a star or the Sun is astronomy: "Astronomers discover a strange universal rule behind black
  // hole eruptions" went out as VOLCANO, ScienceDaily 17 Oct)
  [/volcan|\blava\b|(?<!\b(?:black[- ]holes?|solar|stellar|stars?|sun|sun's|cosmic|galactic|magnetars?|quasars?|plasma)\s)\beruptions?\b/i, 'VOLCANO'],
  [/earthquake|quake|tremor/i, 'EARTHQUAKE'],
  [/wildfire|bushfire|forest fire/i, 'WILDFIRE'],
  [/flood|monsoon|heavy rain|storm|hurricane|typhoon|cyclone|strong winds|heatwave|heat alert|degrees celsius/i, 'WEATHER'],
  // (a rescue is its own story: "Man rescued from cave on Sardinia after being trapped by rockslide" went out as CULTURE,
  // Guardian 13 Oct)
  // (never a company's rescue: "Poundstretcher owner withdraws rescue bid for rival Poundland" went out as RESCUE, 14 Oct)
  [/\brescu(?:ed|ers?|e)\b(?!\s+(?:bids?|deals?|packages?|plans?|talks|offers?|funds?|loans?|financing|takeover))|\btrapped\b|rockslide|landslide|avalanche/i, 'RESCUE'],
  // (whole words: MI5's "operations" were once an opera, CULTURE, BBC 14 Oct)
  [/festival|concert|exhibition|museum|gallery|\boperas?\b|theatre/i, 'CULTURE'],
  // a film is culture, whatever its plot: "Cristian Mungiu's sixth feature, Fjord, concerns a family on trial" (The Verge
  // 10 Oct) went out as JUSTICE
  [/\b(?:films?|movies?|cinema|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|new|latest|debut) feature|feature films?|documentar(?:y|ies)|box office|Oscars?|screenplay|filmmakers?|actors?|actress(?:es)?|Hollywood)\b/i, 'CULTURE'],
  [/\binternet\b|broadband|\b5G\b/i, 'CONNECTIVITY'],
  // (a star of the sky, never a sports or a film star: "Lando Norris has become the latest sports star to join…" went out
  // as ASTRONOMY, Sky News 14 Oct)
  [/telescope|galaxy|galaxies|planet|comet|asteroid|eclipse|black[- ]holes?|(?<!(?:sports?|film|movie|pop|rock|TV|reality|football|tennis|music|rising|former|global|Hollywood|Olympic|Bollywood|YouTube|social media|guest|co-|all-)\s?)\bstars?\b(?!\s+(?:players?|strikers?|signings?|turn|power|athletes?|witness|wars))|\bmoon\b|nebula/i, 'ASTRONOMY'],
  [/rocket|\borbit|astronaut|space station|spacecraft|\bprobe\b|\brover\b|\bmars\b/i, 'SPACE'],
  [/\b(?:tram|train|rail|metro|ferry|ferries|airport|flights?|bus|buses|bicycle|cycling|bike|tunnel)\b/i, 'TRANSPORT'],
  [/deforest|climate|emission|carbon|glacier|ice sheet/i, 'CLIMATE'],
  // (a Roman fort is history, whatever "military manoeuvres" its story recounts: it once went out as CONFLICT, 12 Oct)
  [/archaeolog|temple|ancient|Neanderthals?|prehistoric|ruins|fossil|dinosaur|tomb|footprints|\bRoman\b(?!\s+(?:Abramovich|Polanski|Reigns|Kemp))|medieval|castle|hillfort|\bfort\b|Viking|excavat\w*|Bronze Age|Iron Age|Stone Age|Neolithic|\bemperor\b|pharaoh|pyramid/i, 'HISTORY'],
  // (a university's researchers are not education news: "Cornell scientists identify rare… genetic disorder" in two cats
  // went out as EDUCATION, ScienceDaily 14 Oct)
  [/\bschools?\b|education|students?|universit(?:y|ies) (?:fees|places|admissions|funding|staff|strikes?|campus(?:es)?)|tuition/i, 'EDUCATION'],
  [/clean water|drinking water|water projects|reservoir/i, 'WATER'],
  // (apes too: "Orangutans released back into Borneo forest" went out as RESCUE, BBC 12 Oct)
  [/wildlife|zoo|panda|flying fox(?:es)?|\bbats\b|penguins?|elephants?|orangutans?|gorillas?|chimpanzees?|\bapes\b|monkeys?|tortoises?|leopards?|turtles?|mangroves?|birds?\b|species|\bbees\b|\b(?:honey ?|bumble ?)bees?\b/i, 'WILDLIFE'],
  // a famine and its hunger are their own story, whatever word its report holds ("Conflict, drought increasing risk of famine
  // in Sudan: Monitor" went out as GADGETS, Al Jazeera 14 Oct, round 5)
  [/\bfamines?\b|\bstarv(?:ation|ing|e|ed)\b|malnutrition|malnourished|humanitarian (?:crisis|catastrophe|disaster)|food insecurity|food shortages?/i, 'HUMANITARIAN'],
  [/\btrees\b|city parks?|gardens?\b|green spaces?/i, 'GREEN CITIES'],
  // (whole words: a "social supermarket" is no market, BBC 14 Oct)
  [/\bstocks?\b|\bshares\b|\bindex\b|\bmarkets?\b|\binvestors\b/i, 'MARKETS'],
  // (growth only as the economy's: "surgery to remove growth on lung" once went out as ECONOMY, 13 Oct)
  [/inflation|prices|interest rates?|economy|\b(?:state|national|federal|annual|20\d\d) budgets?\b|\bbudget (?:measures|deficits?|plans?|cuts|will|would|could|must|statement|day|black hole)\b|\bpublic finances\b|\bspending (?:pressures|plans|review|cuts)\b|(?:economic|global|world) growth|growth forecasts?|\bGDP\b|recession/i, 'ECONOMY'],
  // people who flee and a boat that goes down are their own story, whatever port it left ("Children among 139 dead after boat
  // capsizes" went out as TRADE, 14 Oct)
  [/\bmigrants?\b|\brefugees?\b|asylum seekers?|\bICE (?:agents?|officers?|officials?|vehicle|raids?|detention|custody)\b|immigration (?:agents?|officers?|enforcement|raids?)|\bdeport(?:ees?|ations?|ed|ing)\b/i, 'MIGRATION'],
  // (never an ancient wreck: "World's oldest shipwreck found off coast of Turkey" went out as ACCIDENTS, BBC 14 Oct)
  [/\b(?:roof|building|bridge|stadium|mine|dam|wall|balcony|tower|crane|school)s?\s+collaps\w*|capsiz\w*|\bdrown(?:s|ed|ing)?\b|boat (?:sank|sinks|sinking)|(?:plane|train|bus|coach|helicopter) crash\w*|derail\w*/i, 'ACCIDENTS'],
  // (never the slave trade nor a trade union: a church's slavery memorial fund went out as TRADE, Guardian 14 Oct)
  // (nor trade secrets: "Judge orders OpenAI to turn over hiring records" went out as TRADE, TechCrunch 14 Oct)
  [/(?<!slave )\btrade\b(?! unions?| secrets?)|\bexports?\b|\bimports?\b|tariffs?|\bshipping\b|(?<!\b(?:PC|console|Switch|Mac|mobile|iOS|Android|much-needed|new)\s)\bports?\b(?!\s+(?:of|to|for) (?:the )?(?:game|PC|Switch))|\bcanal\b/i, 'TRADE'],
  [/\bjobs\b|unemployment|wages|workers/i, 'JOBS'],
  // a security flaw, a hack or surveillance is the story, whatever the technology (an AI flood of bug reports is
  // SECURITY, a licence-plate camera search PRIVACY: TECH BYTES, 4 Oct)
  [/\b(?:hack(?:ed|ers?|ing)?|breach(?:es|ed)?|cyber[- ]?attacks?|cybersecurity|ransomware|malware|spyware|phishing|bug bount(?:y|ies)|vulnerabilit(?:y|ies)|security flaws?|zero-day|data leaks?)\b/i, 'SECURITY'],
  // (a camera's footage is no privacy story: "Surveillance video shows moment ICE vehicle strikes man", 13 Oct)
  [/\b(?:surveillance(?!\s+(?:video|footage|camera|cameras|images?|stills?))|privacy|data protection|facial recognition|licen[sc]e plate (?:readers?|cameras?)|tracking (?:people|users))\b/i, 'PRIVACY'],
  // (a regulator's move is regulation, whatever it regulates: "Julie Inman Grant may be able to limit Australians seeing a
  // livestreamed US execution" went out as CONFLICT and SOFTWARE, Guardian 12 Oct)
  [/\bregulators?\b|\bwatchdogs?\b|online safety|eSafety/i, 'REGULATION'],
  [/robot/i, 'ROBOTICS'],
  [/\bAI\b|artificial intelligence|chatbot/i, 'AI'],
  [/\bchips?\b|semiconductor|processor/i, 'CHIPS'],
  [/smartphone|\bphones?\b|gadget|headset|wearable|earbuds|headphones|\bspeakers?\b|smartwatch|\bsmart ring|glasses|\biPad|\biPhone|\bKindles?\b|\blaptops?\b|MacBook|Chromebook|\btablets?\b|e-readers?|\bcameras?\b|\bTVs?\b(?!\s+(?:networks?|channels?|stations?|news|presenters?|hosts?|shows?|series|rights|licen[cs]es?|debates?|ads?|adverts?|audiences?|viewers?|interviews?))|\b(?:computer|gaming|desktop|PC|OLED|4K|curved|external|portable|LCD|LED|ultrawide)\s+monitors?\b|\bkeyboards?\b|\brouters?\b/i, 'GADGETS'],
  // (an app's or a system's update, never "an update on" a detention: a Vietnam detention went out as SOFTWARE, 13 Oct)
  [/\bapps?\b|software|\b(?:iOS|Android|Windows|macOS|firmware|security) updates?\b|browser/i, 'SOFTWARE'],
  [/video games?|gaming|console/i, 'GAMING'],
  [/satellite/i, 'SPACE'],
  // (fuel is energy, not motoring: "Trump… Russia diesel deal" went out as MOTORING, Guardian 14 Oct)
  [/solar (?:farm|panels?|plant|power|park)|wind farm|turbines?|tidal power|power grid|energy|electricity|batter(?:y|ies)|geothermal|\bdiesel\b|\bpetrol\b|fuel prices/i, 'ENERGY'],
  // (a hospital, never hospitality: Lando Norris's stake in a ticketing platform went out as HEALTH, Sky News 14 Oct)
  [/vaccine|\bhospitals?\b|health|medicine|disease|patients|nurses|doctors|cancer|tumou?rs?|chemotherapy|clinical trial|therap(?:y|ies)\b|surgery/i, 'HEALTH'],
  [/ocean|whales?|reef|coral|dolphins?|sea turtles?/i, 'OCEANS'],
  [/\b(?:cars?|electric vehicles?|EVs?|motoring|carmakers?)\b/i, 'MOTORING'],
  // (a detention is the story, whatever technology its report mentions: "Australian democracy campaigner detained in Vietnam…"
  // went out as SOFTWARE twice, Guardian 13 Oct)
  [/\bcourts?\b|judges?|ruling|lawsuit|\bsued\b|\bsu(?:es|ing)\b|trial\b|\bjailed\b|\bsentenced\b|\bconvicted\b|pleaded guilty|\bcharged with\b|\bdetained\b|\barrested\b|\bin custody\b|terrorism (?:offences|charges)/i, 'JUSTICE'],
  [/\bparliament|\bminister|\bgovernment\b|\bsenate\b|\bcongress\b|lawmakers|\bprime minister|opposition leader|\bpolicies\b|\bparty leader|\bTories\b|\bLabour\b|\bRepublicans?\b|\bDemocrats?\b|\bEU\b|European Union|Brexit|\bPM\b/i, 'POLITICS'],
];

export const TOPIC_NAMES = [...new Set(TOPICS.map(([, k]) => k))];

// When nothing more specific fits, the desk section names the strap.
const SECTION_TOPICS = { world: 'WORLD', business: 'BUSINESS', tech: 'TECHNOLOGY', science: 'SCIENCE' };

// A kicker is checked against the story's gravity and its section (round 6). A grave story, people killed or dead, a
// famine, takes a topic fit for it, never a playful one: "Missing Australian hiker… found dead in Peru" went out as
// SOFTWARE, "Family of man killed by tiger…" as WILDLIFE, "At least two security officials killed near Iran’s… port" as
// TRADE, "Passenger train derails…, killing at least 5" as TRANSPORT (12-14 Oct). A death in old age or an obituary may
// keep its subject's field (an actor's CULTURE, a physicist's SCIENCE), never a cause's (HEALTH).
const GRAVE = /\b(?:killed|kills|killing|dead|deadly|deaths?|died|dies|dying|famines?|starv\w*|massacres?|genocide|murder\w*|funerals?|mourn\w*|casualt\w*|wounded|fatal\w*|bodies|abused?|rape[ds]?)\b/i;
const OBITUARY = /\bobituary\b|\b(?:dies|died|has died) (?:aged|at) \d/i;
export const GRAVE_TOPICS = new Set(['JUSTICE', 'CONFLICT', 'CRIME', 'ELECTIONS', 'PROTESTS', 'INDUSTRY', 'VOLCANO', 'EARTHQUAKE', 'WILDFIRE', 'WEATHER', 'HUMANITARIAN', 'RESCUE', 'MIGRATION', 'ACCIDENTS', 'SECURITY', 'REGULATION', 'HEALTH', 'POLITICS', 'WORLD']);
const OBITUARY_TOPICS = new Set([...GRAVE_TOPICS, 'CULTURE', 'SCIENCE', 'HISTORY', 'SPACE', 'ASTRONOMY'].filter((k) => k !== 'HEALTH'));
// A technology's topic found only in the summary of a story from another section is a stray word, not the story: "Turkey
// police raid opposition TV station" went out as GADGETS, "IMF forecasts 3.1% global growth" as AI, "More part-time bosses
// and co-CEOs could keep women in leadership" as SOFTWARE (12-14 Oct)
const TECH_TOPICS = new Set(['GADGETS', 'SOFTWARE', 'AI', 'CHIPS', 'ROBOTICS', 'GAMING', 'CONNECTIVITY']);
const BUSINESS_TOPICS = new Set(['ECONOMY', 'MARKETS', 'TRADE', 'JOBS', 'ENERGY', 'INDUSTRY', 'MOTORING', 'REGULATION']);
const STRAY_HARD = new Set(['CONFLICT', 'CRIME', 'PROTESTS', 'MIGRATION', 'ACCIDENTS', 'WILDFIRE', 'EARTHQUAKE', 'VOLCANO', 'WEATHER', 'HUMANITARIAN', 'RESCUE']);
const PEOPLE = /\b(?:people|persons?|man|men|woman|women|child|children|boys?|girls?|babies|baby|famil(?:y|ies)|residents|civilians|villagers|workers|miners|passengers|pupils|students|soldiers|patients|hikers?|tourists?|migrants|refugees|officials|officers|journalists?|mourners|victims|teenagers?|toddlers?|mothers?|fathers?)\b/i;
const ANIMALS = TOPICS.filter(([, k]) => k === 'WILDLIFE' || k === 'OCEANS').map(([re]) => re);
const ANCIENT = TOPICS.find(([, k]) => k === 'HISTORY')[0];
export const isGraveTitle = (title) => GRAVE.test(String(title || ''));

/** The story's topic: the first match in its headline, else in its summary, else its section's name (or null). */
export function topicOf(s, { section = true } = {}) {
  const title = String(s.title || '');
  // (never an animal's death nor an ancient one: "Flying foxes… face mass starvation" stays WILDLIFE, "Neanderthal remains may
  // be earliest human ancestor find killed by a spear" HISTORY)
  const apart = !PEOPLE.test(title) && (ANIMALS.some((re) => re.test(title)) || ANCIENT.test(title));
  const allowed = apart ? null : OBITUARY.test(title) ? OBITUARY_TOPICS : GRAVE.test(title) ? GRAVE_TOPICS : null;
  const fits = (k) => !allowed || allowed.has(k);
  // (a headline that lists its parts before a colon is about what follows it: "Taxes, housing and tuition fees: 2027 budget
  // measures impact family budgets in Portugal" went out as EDUCATION, Euronews 13 Oct)
  const rest = (title.match(/^[^:]{0,80},[^:]*\band\b[^:]*:\s+(.{12,})$/) || [])[1];
  if (rest) for (const [re, k] of TOPICS) if (fits(k) && re.test(rest)) return k;
  for (const [re, k] of TOPICS) if (fits(k) && re.test(title)) return k;
  // (in the summary, the topic of its first words: "Burnham says ‘public will be the boss’…" went out as HEALTH from a word
  // late in its summary, Guardian 12 Oct; the list's order breaks a tie)
  let best = null;
  // (a business story's summary names its business first: "As the war in the Middle East rattles the public finances…" once
  // made the IFS's budget warning CONFLICT, Guardian 12 Oct)
  const trade = s.category === 'business' ? BUSINESS_TOPICS : null;
  for (const [re, k] of TOPICS) {
    if (!fits(k) || (TECH_TOPICS.has(k) && s.category && s.category !== 'tech')) continue;
    // (and never a hard-news topic from a business story's summary alone: "Fewer Britons plan to ringfence money for holidays
    // abroad next year" once went out as CONFLICT, Guardian 13 Oct; its section names it)
    if (trade && STRAY_HARD.has(k) && !allowed) continue;
    const m = re.exec(s.summary || '');
    if (m && (!best || m.index < best.at)) best = { at: m.index, k };
  }
  if (best) return best.k;
  if (!section) return null;
  const own = SECTION_TOPICS[s.category] || null;
  // (a grave story from the technology or the business pages is the world's news on its strap)
  return own && fits(own) ? own : allowed ? (allowed === OBITUARY_TOPICS && own === 'SCIENCE' ? own : 'WORLD') : own;
}

/**
 * Is a story on a programme's beat? `beat` maps a section to the topics a
 * story from it must have ({ tech: ['SPACE', 'ASTRONOMY', ...] }); sections it
 * does not name are always on the beat.
 */
export function onBeat(s, beat) {
  const topics = beat?.[s.category];
  if (!Array.isArray(topics)) return true;
  return topics.includes(topicOf(s, { section: false }));
}

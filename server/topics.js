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
  [/\b(?:air ?strikes?|airstrikes?|missiles?|drone (?:attacks?|strikes?)|shelling|troops|soldiers|militants?|militias?|rebels?|insurgents?|fighters|fighting|clashes|offensive|ceasefire|battlefields?|(?:military|armed|attack|kamikaze|AI-powered) drones|invasion|warplanes?|bombard\w*|front ?line|war\b|military|armed forces|government forces|(?:federal|security|allied|rebel|enemy|ground|special|coalition|paramilitary|[a-z]+(?:ian|ish|ese|i)) forces|houthis?|hezbollah|hamas|taliban|islamic state|al-shabab|boko haram|rapid support forces|struck again|struck by (?:missiles?|drones?|rockets?)|(?<!heart |panic |cyber[- ]?|asthma |immune |viral |virus |phage )attacks?|(?:Russia|Russian|Ukraine|Ukrainian|Israel|Israeli|Iran|Iranian)\w* (?:hits?|strikes?|pounds?|shells?|targets?))\b/i, 'CONFLICT'],
  // a killing is a crime story, whatever else its report mentions (an immigration agent's shooting once went out as
  // CULTURE, a "museum" in its summary, 13 Oct)
  [/\bshootings?\b|shot dead|shot and killed|fatally shot|\b(?:was|were|been|being|got|people|teachers?|pupils?|students?|officers?|men|women|children) shot\b|opened fire|\bgunm[ae]n\b|\bstabb(?:ed|ing|ings)\b|\bmurder(?:ed|s)?\b|manslaughter|homicide|\bsexual (?:assaults?|violence|abuse)\b|\b(?:domestic|family) violence\b/i, 'CRIME'],
  [/\belections?\b|\bvot(?:e|es|ers|ing)\b|\bballots?\b|referendum|polling (?:stations?|day)/i, 'ELECTIONS'],
  [/\bprotests?\b|protesters?|demonstrat(?:ion|ions|ors)\b/i, 'PROTESTS'],
  // a strike is a labour dispute only with its workers, union or pay in the same sentence (ahead of the sector
  // topics: a nurses' or a rail strike is the dispute)
  [/\b(?:workers?|staff|employees|unions?|pay)\b[^.]{0,60}\bstrik(?:e|es|ing)\b|\bstrik(?:e|es|ing)\b[^.]{0,60}\b(?:workers?|staff|employees|unions?|pay)\b|walkouts?|\bwalk(?:s|ed|ing)? out\b|industrial action/i, 'INDUSTRY'],
  [/volcan|eruption|lava/i, 'VOLCANO'],
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
  [/telescope|galaxy|galaxies|planet|comet|asteroid|eclipse|(?<!(?:sports?|film|movie|pop|rock|TV|reality|football|tennis|music|rising|former|global|Hollywood|Olympic|Bollywood|YouTube|social media|guest|co-|all-)\s?)\bstars?\b(?!\s+(?:players?|strikers?|signings?|turn|power|athletes?|witness|wars))|\bmoon\b|nebula/i, 'ASTRONOMY'],
  [/rocket|\borbit|astronaut|space station|spacecraft|\bprobe\b|\brover\b|\bmars\b/i, 'SPACE'],
  [/\b(?:tram|train|rail|metro|ferry|ferries|airport|flights?|bus|buses|bicycle|cycling|bike|tunnel)\b/i, 'TRANSPORT'],
  [/deforest|climate|emission|carbon|glacier|ice sheet/i, 'CLIMATE'],
  // (a Roman fort is history, whatever "military manoeuvres" its story recounts: it once went out as CONFLICT, 12 Oct)
  [/archaeolog|temple|ancient|ruins|fossil|dinosaur|tomb|footprints|\bRoman\b(?!\s+(?:Abramovich|Polanski|Reigns|Kemp))|medieval|castle|hillfort|\bfort\b|Viking|excavat\w*|Bronze Age|Iron Age|Stone Age|Neolithic|\bemperor\b|pharaoh|pyramid/i, 'HISTORY'],
  // (a university's researchers are not education news: "Cornell scientists identify rare… genetic disorder" in two cats
  // went out as EDUCATION, ScienceDaily 14 Oct)
  [/\bschools?\b|education|students?|universit(?:y|ies) (?:fees|places|admissions|funding|staff|strikes?|campus(?:es)?)|tuition/i, 'EDUCATION'],
  [/clean water|drinking water|water projects|reservoir/i, 'WATER'],
  // (apes too: "Orangutans released back into Borneo forest" went out as RESCUE, BBC 12 Oct)
  [/wildlife|zoo|panda|penguins?|elephants?|orangutans?|gorillas?|chimpanzees?|\bapes\b|monkeys?|tortoises?|leopards?|turtles?|mangroves?|birds?\b|species|bees?\b/i, 'WILDLIFE'],
  [/\btrees\b|city parks?|gardens?\b|green spaces?/i, 'GREEN CITIES'],
  // (whole words: a "social supermarket" is no market, BBC 14 Oct)
  [/\bstocks?\b|\bshares\b|\bindex\b|\bmarkets?\b|\binvestors\b/i, 'MARKETS'],
  // (growth only as the economy's: "surgery to remove growth on lung" once went out as ECONOMY, 13 Oct)
  [/inflation|prices|interest rates?|economy|economic growth|\bGDP\b|recession/i, 'ECONOMY'],
  // people who flee and a boat that goes down are their own story, whatever port it left ("Children among 139 dead after boat
  // capsizes" went out as TRADE, 14 Oct)
  [/\bmigrants?\b|\brefugees?\b|asylum seekers?/i, 'MIGRATION'],
  // (never an ancient wreck: "World's oldest shipwreck found off coast of Turkey" went out as ACCIDENTS, BBC 14 Oct)
  [/capsiz\w*|\bdrown(?:s|ed|ing)?\b|boat (?:sank|sinks|sinking)|(?:plane|train|bus|coach|helicopter) crash\w*|derail\w*/i, 'ACCIDENTS'],
  // (never the slave trade nor a trade union: a church's slavery memorial fund went out as TRADE, Guardian 14 Oct)
  // (nor trade secrets: "Judge orders OpenAI to turn over hiring records" went out as TRADE, TechCrunch 14 Oct)
  [/(?<!slave )\btrade\b(?! unions?| secrets?)|\bexports?\b|\bimports?\b|tariffs?|\bshipping\b|\bports?\b|\bcanal\b/i, 'TRADE'],
  [/\bjobs\b|unemployment|wages|workers/i, 'JOBS'],
  // a security flaw, a hack or surveillance is the story, whatever the technology (an AI flood of bug reports is
  // SECURITY, a licence-plate camera search PRIVACY: TECH BYTES, 4 Oct)
  [/\b(?:hack(?:ed|ers?|ing)?|breach(?:es|ed)?|cyber ?attacks?|cybersecurity|ransomware|malware|spyware|phishing|bug bount(?:y|ies)|vulnerabilit(?:y|ies)|security flaws?|zero-day|data leaks?)\b/i, 'SECURITY'],
  [/\b(?:surveillance|privacy|data protection|facial recognition|licen[sc]e plate (?:readers?|cameras?)|tracking (?:people|users))\b/i, 'PRIVACY'],
  // (a regulator's move is regulation, whatever it regulates: "Julie Inman Grant may be able to limit Australians seeing a
  // livestreamed US execution" went out as CONFLICT and SOFTWARE, Guardian 12 Oct)
  [/\bregulators?\b|\bwatchdogs?\b|online safety|eSafety/i, 'REGULATION'],
  [/robot/i, 'ROBOTICS'],
  [/\bAI\b|artificial intelligence|chatbot/i, 'AI'],
  [/\bchips?\b|semiconductor|processor/i, 'CHIPS'],
  [/smartphone|\bphones?\b|gadget|headset|wearable|earbuds|headphones|\bspeakers?\b|smartwatch|\bsmart ring|glasses|\biPad|\biPhone|\bKindles?\b|\blaptops?\b|MacBook|Chromebook|\btablets?\b|e-readers?|\bcameras?\b|\bTVs?\b(?!\s+(?:networks?|channels?|stations?|news|presenters?|hosts?|shows?|series|rights|licen[cs]es?|debates?|ads?|adverts?|audiences?|viewers?|interviews?))|\bmonitors?\b|\bkeyboards?\b|\brouters?\b/i, 'GADGETS'],
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

/** The story's topic: the first match in its headline, else in its summary, else its section's name (or null). */
export function topicOf(s, { section = true } = {}) {
  for (const [re, k] of TOPICS) if (re.test(s.title || '')) return k;
  // (in the summary, the topic of its first words: "Burnham says ‘public will be the boss’…" went out as HEALTH from a word
  // late in its summary, Guardian 12 Oct; the list's order breaks a tie)
  let best = null;
  for (const [re, k] of TOPICS) {
    const m = re.exec(s.summary || '');
    if (m && (!best || m.index < best.at)) best = { at: m.index, k };
  }
  if (best) return best.k;
  return section ? SECTION_TOPICS[s.category] || null : null;
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

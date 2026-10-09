// Topics of a story, from its own words: the strap's kicker ("VOLCANO",
// "SPACE") for the offline writer, and a programme's beat for the desk
// (config/channel.json `beat`: COSMOS DESK takes a story from the tech section
// only when it is about space or our planet, never a games console's sales).
// Most specific first, matched on the headline before the summary.

export const TOPICS = [
  // armed conflict first: a "rocket" or "satellite" in a war story is not SPACE, and military "strikes" are not
  // a labour dispute (first live run, 4 Oct: "Yemen's Houthis claim attacks" went out as INDUSTRY)
  [/\b(?:air ?strikes?|airstrikes?|missiles?|drone (?:attacks?|strikes?)|shelling|troops|soldiers|militants?|militias?|rebels?|insurgents?|fighters|fighting|clashes|offensive|ceasefire|invasion|warplanes?|bombard\w*|front ?line|war\b|military|armed forces|government forces|houthis?|(?<!heart |panic |cyber[- ]?|asthma |immune )attacks?|(?:Russia|Russian|Ukraine|Ukrainian|Israel|Israeli|Iran|Iranian)\w* (?:hits?|strikes?|pounds?|shells?|targets?))\b/i, 'CONFLICT'],
  [/\belections?\b|\bvot(?:e|es|ers|ing)\b|\bballots?\b|referendum|polling (?:stations?|day)/i, 'ELECTIONS'],
  [/\bprotests?\b|protesters?|demonstrat(?:ion|ions|ors)\b/i, 'PROTESTS'],
  // a strike is a labour dispute only with its workers, union or pay in the same sentence (ahead of the sector
  // topics: a nurses' or a rail strike is the dispute)
  [/\b(?:workers?|staff|employees|unions?|pay)\b[^.]{0,60}\bstrik(?:e|es|ing)\b|\bstrik(?:e|es|ing)\b[^.]{0,60}\b(?:workers?|staff|employees|unions?|pay)\b|walkouts?|\bwalk(?:s|ed|ing)? out\b|industrial action/i, 'INDUSTRY'],
  [/volcan|eruption|lava/i, 'VOLCANO'],
  [/earthquake|quake|tremor/i, 'EARTHQUAKE'],
  [/wildfire|bushfire|forest fire/i, 'WILDFIRE'],
  [/flood|monsoon|heavy rain|storm|hurricane|typhoon|cyclone|strong winds|heatwave|heat alert|degrees celsius/i, 'WEATHER'],
  [/festival|concert|exhibition|museum|gallery|opera|theatre/i, 'CULTURE'],
  [/\binternet\b|broadband|\b5G\b/i, 'CONNECTIVITY'],
  [/telescope|galaxy|galaxies|planet|comet|asteroid|eclipse|\bstars?\b|\bmoon\b|nebula/i, 'ASTRONOMY'],
  [/rocket|\borbit|astronaut|space station|spacecraft|\bprobe\b|\brover\b|\bmars\b/i, 'SPACE'],
  [/\b(?:tram|train|rail|metro|ferry|ferries|airport|flights?|bus|buses|bicycle|cycling|bike|tunnel)\b/i, 'TRANSPORT'],
  [/deforest|climate|emission|carbon|glacier|ice sheet/i, 'CLIMATE'],
  [/archaeolog|temple|ancient|ruins|fossil|dinosaur|tomb|footprints/i, 'HISTORY'],
  [/\bschools?\b|education|students?|universit/i, 'EDUCATION'],
  [/clean water|drinking water|water projects|reservoir/i, 'WATER'],
  [/wildlife|zoo|panda|penguins?|elephants?|tortoises?|leopards?|turtles?|mangroves?|birds?\b|species|bees?\b/i, 'WILDLIFE'],
  [/\btrees\b|city parks?|gardens?\b|green spaces?/i, 'GREEN CITIES'],
  [/\bstocks?\b|shares|index|markets?\b|investors/i, 'MARKETS'],
  [/inflation|prices|interest rates?|economy|growth|recession/i, 'ECONOMY'],
  [/\btrade\b|\bexports?\b|\bimports?\b|tariffs?|\bshipping\b|\bports?\b|\bcanal\b/i, 'TRADE'],
  [/\bjobs\b|unemployment|wages|workers/i, 'JOBS'],
  // a security flaw, a hack or surveillance is the story, whatever the technology (an AI flood of bug reports is
  // SECURITY, a licence-plate camera search PRIVACY: TECH BYTES, 4 Oct)
  [/\b(?:hack(?:ed|ers?|ing)?|breach(?:es|ed)?|cyber ?attacks?|cybersecurity|ransomware|malware|spyware|phishing|bug bount(?:y|ies)|vulnerabilit(?:y|ies)|security flaws?|zero-day|data leaks?)\b/i, 'SECURITY'],
  [/\b(?:surveillance|privacy|data protection|facial recognition|licen[sc]e plate (?:readers?|cameras?)|tracking (?:people|users))\b/i, 'PRIVACY'],
  [/robot/i, 'ROBOTICS'],
  [/\bAI\b|artificial intelligence|chatbot/i, 'AI'],
  [/\bchips?\b|semiconductor|processor/i, 'CHIPS'],
  [/smartphone|\bphones?\b|gadget|headset|wearable|earbuds|glasses|\biPad|\biPhone|\bKindles?\b|\blaptops?\b|MacBook|Chromebook|\btablets?\b|e-readers?/i, 'GADGETS'],
  [/\bapps?\b|software|update|browser/i, 'SOFTWARE'],
  [/video games?|gaming|console/i, 'GAMING'],
  [/satellite/i, 'SPACE'],
  [/solar (?:farm|panels?|plant|power|park)|wind farm|turbines?|tidal power|power grid|energy|electricity|batter(?:y|ies)|geothermal/i, 'ENERGY'],
  [/vaccine|hospital|health|medicine|disease|patients|nurses|doctors|cancer|tumou?rs?|chemotherapy|clinical trial|therap(?:y|ies)\b/i, 'HEALTH'],
  [/ocean|whales?|reef|coral|dolphins?|sea turtles?/i, 'OCEANS'],
  [/\b(?:cars?|diesel|petrol|electric vehicles?|EVs?|motoring|carmakers?)\b/i, 'MOTORING'],
  [/\bcourts?\b|judges?|ruling|lawsuit|trial\b/i, 'JUSTICE'],
  [/\bparliament|\bminister|\bgovernment\b|\bsenate\b|\bcongress\b|lawmakers|\bprime minister|opposition leader|\bpolicies\b|\bparty leader|\bTories\b|\bLabour\b|\bRepublicans?\b|\bDemocrats?\b/i, 'POLITICS'],
];

export const TOPIC_NAMES = [...new Set(TOPICS.map(([, k]) => k))];

// When nothing more specific fits, the desk section names the strap.
const SECTION_TOPICS = { world: 'WORLD', business: 'BUSINESS', tech: 'TECHNOLOGY', science: 'SCIENCE' };

/** The story's topic: the first match in its headline, else in its summary, else its section's name (or null). */
export function topicOf(s, { section = true } = {}) {
  for (const [re, k] of TOPICS) if (re.test(s.title || '')) return k;
  for (const [re, k] of TOPICS) if (re.test(s.summary || '')) return k;
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

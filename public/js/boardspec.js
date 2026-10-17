// What a story with neither a cleared picture nor a place shows behind its headline (graphics/topicboard.js draws it):
// the story's own strongest element, never a bare section word (the coordinator's review of round 7: "WORLD" alone in
// an empty ring looked like something failed to load). In order:
//
//   1. its key figure, big: the headline's own ("$1.3BN" ACQUISITION, "139" MIGRANTS, "20" WEEKS), else the writer's
//      stated one (a fact card's numbers, with its qualifier: "AT LEAST 23"), set soberly under a grave story;
//   2. a short quote, attributed: the story's own when its first sentence is short enough to be quoted whole (a quote
//      is never cut), or the headline's ("'It was fake': Indian villagers allege..." -> IT WAS FAKE, INDIAN VILLAGERS);
//   3. the named actor as a wordmark: its name in the channel's type and what it is under it ("REPLIT", "COMPANY AND
//      ONLINE CODING ENVIRONMENT"); no logo, ever (the picture desk names it: server/picturedesk.js boardActor);
//   4. the story's topic as the headline words it (TOPICS: "AI SURVEILLANCE", "BLACK HOLES", "HEATING OIL"), with one
//      of the channel's line glyphs; else the writer's topic label where the story's words bear it out;
//   5. the headline's own key phrase ("CARER'S ALLOWANCE").
//   Under a grave story every board is sober: no glyph, no accent colour, no motion beyond a wipe.
//
//   boardSpec({ headline, kicker, numbers, quote, grave, actor, text }) -> { kind, ..., grave }
//   headlineFigure(headline) -> { value, label, qual } | null
// Shared by the server (server/producer.js puts the spec on each rundown item) and the client (a fallback from the
// headline alone). No DOM here.

// section words that are no topic ("WORLD" alone says nothing about the story)
export const BARE = new Set(['WORLD', 'NEWS', 'UK', 'US', 'BUSINESS', 'TECH', 'TECHNOLOGY', 'SCIENCE', 'MONEY', 'SPORT', 'POLITICS', 'GENERAL', 'AROUND THE WORLD', 'AND FINALLY', 'NUMBER OF THE DAY', 'THE NUMBER', 'LATEST', 'TOP STORIES', 'ECONOMY', 'HEALTH', 'ENVIRONMENT', 'HISTORY', 'CULTURE', 'ENTERTAINMENT', 'LIFESTYLE', 'OPINION', 'IN BRIEF', 'QUICK BYTES', 'SCORE CENTRE', 'MOMENT OF THE DAY', 'BREAKING', 'LIVE', 'INDUSTRY', 'CONFLICT', 'SOFTWARE', 'MARKETS', 'SPACE']);

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
const caps = (s) => String(s ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim().toUpperCase();

// ------------------------------------------------------------------------------------------------------ the figure

const UNIT_NOUNS = /^(?:dead|deaths?|killed|injured|wounded|missing|people|migrants|refugees|children|pupils|students|homes|houses|jobs|workers|employees|cases|patients|weeks?|months?|years?|days?|hours?|minutes?|miles?|km|kilometres?|metres?|tonnes?|tons?|names|votes|seats|ships|boats|flights|crew|passengers|incidents|scams|regions|countries|nations|states|stores|shops|branches|sites|towns|villages|schools|hospitals|planes|drones|missiles|rockets|satellites|times|points|goals|degrees|species|threats|arrests|protesters|troops|soldiers|hostages|prisoners|users|customers|subscribers|households|beds|trees|animals|languages|games|matches|stars|planets|galaxies)$/i;
// a singular noun before a plural one is one label ("19 death threats")
const MODIFIER_NOUNS = /^(?:death|bomb|job|car|home|drone|missile|bird|hate|data)$/i;
const MONEY_NOUNS = /^(?:fine|fines|deal|loan|valuation|takeover|acquisition|merger|buyout|bill|budget|bonus|settlement|contract|fund|funding|investment|tax|profit|loss|losses|revenue|sale|lawsuit|payout|bid|round|stake|package|plan|boost|cut|cuts|debt|grant|award|salary|pay|price|costs?|bailout|subsidy|subsidies|donation|prize|penalty|compensation|damages|bonuses|pledge|aid)$/i;
const MONEY_VERBS = { fined: 'FINE', bought: 'DEAL', buys: 'DEAL', acquired: 'DEAL', acquires: 'DEAL', raises: 'RAISED', raised: 'RAISED', raising: 'RAISED', valued: 'VALUATION', donated: 'DONATED', donates: 'DONATED', spent: 'SPENT', spends: 'SPENT', spending: 'SPENT', costs: 'COST', cost: 'COST', pays: 'PAID', paid: 'PAID', lost: 'LOST', loses: 'LOST', owes: 'OWED', owed: 'OWED', wins: 'WON', won: 'WON', awarded: 'AWARDED', pledges: 'PLEDGED', pledged: 'PLEDGED', invests: 'INVESTED', invested: 'INVESTED' };
const SCALE = { bn: 'BN', billion: 'BN', b: 'BN', m: 'M', mn: 'M', million: 'M', k: 'K', thousand: 'K', tn: 'TN', trillion: 'TN' };
// a stated figure's qualifier is part of it ("at least 8"): kept and drawn with the figure, never dropped
const QUALIFIER = /\b(at least|more than|over|nearly|almost|about|around|up to|some|roughly|close to|fewer than|less than|just over|just under|an estimated)\s+$/i;
const qualOf = (before) => (QUALIFIER.exec(before)?.[1] || '').toUpperCase() || null;
// a count the headline gives last ("..., injuring 19"): its verb says what it counts
const TRAILING = { injuring: 'INJURED', injures: 'INJURED', killing: 'DEAD', kills: 'DEAD', wounding: 'WOUNDED', leaving: null, displacing: 'DISPLACED', stranding: 'STRANDED', evacuating: 'EVACUATED', rescuing: 'RESCUED', rescues: 'RESCUED', arresting: 'ARRESTED', arrests: 'ARRESTED' };

/** The headline's own key figure: a sum, a share or a count with its unit; never a year, an age, an ordinal or a model number. */
export function headlineFigure(headline) {
  const t = String(headline || '').replace(/[’‘]/g, "'");
  // a sum: "$1.3B", "£750,000", "€800,000", "$366m", "£5k" (a bare small sum with nothing to say what it is: none)
  const money = /([$£€])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(bn|billion|tn|trillion|mn|million|m|k|thousand|b)(?![\p{L}\d]))?(?![\d,.]*\d)/iu.exec(t);
  if (money) {
    const scale = money[3] ? SCALE[money[3].toLowerCase()] : '';
    const value = `${money[1]}${money[2]}${scale}`;
    const after = t.slice(money.index + money[0].length).match(/^\s*([\p{L}-]+)/u)?.[1] || '';
    const pre = t.slice(0, money.index);
    const verb = pre.trim().split(/\s+/).slice(-3).map((w) => MONEY_VERBS[w.toLowerCase().replace(/[^a-z]/g, '')]).filter(Boolean).pop();
    const label = MONEY_NOUNS.test(after) ? after.toUpperCase() : verb || null;
    const big = scale || Number(money[2].replace(/,/g, '')) >= 10000;
    if (label || big) return { value, label, qual: qualOf(pre) };
  }
  // a share: "3.7%", "up 570%"
  const share = /(\d+(?:\.\d+)?)\s?(?:%|per ?cent\b)/i.exec(t);
  if (share) {
    const before = t.slice(0, share.index).toLowerCase();
    const topic = /\b(inflation|unemployment|growth|gdp|interest rates?|rates?|turnout|stake|shares?|stocks?|sales|prices?|tariffs?|tax|profits?|revenue)\b[^%]*$/.exec(before)?.[1];
    const dir = /\b(?:up|rises?|rose|jumps?|jumped|surges?|surged|soars?|soared|climbs?|climbed|grows?|grew|increases?|increased|gains?|gained)\s+(?:by\s+)?$/.test(before) ? '+' : /\b(?:down|falls?|fell|drops?|dropped|slumps?|slumped|plunges?|plunged|declines?|declined|shrinks?|shrank)\s+(?:by\s+)?$/.test(before) ? '-' : '';
    return { value: `${dir}${share[1]}%`, label: topic ? topic.toUpperCase() : null, qual: qualOf(t.slice(0, share.index)) };
  }
  // a count with its unit: "139 migrants", "20 weeks", "16 European countries", "130 million names", "1,600 Russians"
  const words = t.split(/\s+/);
  const titleCase = words.filter((x) => /^\p{Lu}/u.test(x)).length > words.length * 0.6;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const raw = w.replace(/[^\d,.]/g, '').replace(/[,.]+$/, '');
    if (!/^\d[\d,]*(?:\.\d+)?$/.test(raw) || /[\p{L}\-:/#]/u.test(w.replace(/[,.;:!?)'"]+$/, '').replace(/^[('"]+/, ''))) continue;
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n) || (n >= 1900 && n <= 2100 && !raw.includes(',')) || n < 2) continue;
    const prev = (words[i - 1] || '').toLowerCase();
    // ("aged 5", "boy, 17,", "top 20", "Pro 12", "Tablet 12": an age, a rank or a model number is never the figure)
    if (/^(?:aged|age|top|no\.?|number|version|series|model|gen|generation|episode|season|chapter|part|day|week|stage|round)$/.test(prev) || /,$/.test(words[i - 1] || '')) continue;
    // (a capitalised word before it names a product: "Tablet 12", "Pixel 9", "Switch 2"; unless the headline is in title case)
    if (!titleCase && i > 0 && /^\p{Lu}/u.test(words[i - 1]) && !/^(?:At|Over|Some|About|Nearly|Almost|Around|Up|More|Fewer|Less|All|Only|Just)$/.test(words[i - 1]) && !/[.!?:]$/.test(words[i - 2] || '.')) continue;
    const qual = qualOf(words.slice(0, i).join(' ') + ' ');
    const clean = (x) => (x || '').replace(/[^\p{L}'-]/gu, '').replace(/^'+|'+$/g, '');
    let value = raw;
    let k = i + 1;
    const scaleWord = clean(words[k]).toLowerCase();
    if (/^(?:million|billion|thousand|m|bn)$/.test(scaleWord)) {
      value = `${raw}${SCALE[scaleWord] || ''}`;
      k++;
    }
    const a = clean(words[k]);
    const b = clean(words[k + 1]);
    const endsHere = /[,.;:!?)]$/.test(words[k - 1] || '');
    if (!endsHere && UNIT_NOUNS.test(a)) {
      if (MODIFIER_NOUNS.test(a) && /^[a-z]{4,}s$/.test(b) && !/[,.;:!?]$/.test(words[k] || '')) return { value, label: `${a} ${b}`.toUpperCase(), qual };
      return { value, label: a.toUpperCase(), qual };
    }
    if (!endsHere && /^(?:more|new|other|extra|additional)$/i.test(a) && UNIT_NOUNS.test(b)) return { value, label: b.toUpperCase(), qual };
    // an anniversary ("KDE turns 30")
    if (/^(?:turns|turned|celebrates)$/.test(prev) && !UNIT_NOUNS.test(a)) return { value, label: 'YEARS', qual };
    // an adjective between the count and its unit ("16 European countries", "539 distinct regions")
    if (!endsHere && a && UNIT_NOUNS.test(b) && !/[,.;:!?]$/.test(words[k] || '') && `${a} ${b}`.length <= 20) return { value, label: `${a} ${b}`.toUpperCase(), qual };
    // people counted by their country ("1,600 Russians")
    if (!endsHere && /^\p{Lu}\p{Ll}+(?:ns|ese|is|s)$/u.test(a) && n >= 10) return { value, label: a.toUpperCase(), qual };
    // "130 million names": a scaled count of something plural
    if (!endsHere && value !== raw && /^[a-z]{3,}s$/.test(a)) return { value, label: a.toUpperCase(), qual };
    // the count ends the headline or its clause: its verb says what ("..., injuring 19")
    if ((endsHere || k >= words.length) && Object.hasOwn(TRAILING, prev.replace(/[^a-z]/g, '')) && TRAILING[prev.replace(/[^a-z]/g, '')]) return { value, label: TRAILING[prev.replace(/[^a-z]/g, '')], qual };
  }
  return null;
}

/** The writer's stated figure (a fact card's numbers[]) when it is a figure with words to say what it counts. */
export function statedFigure(numbers) {
  for (const x of Array.isArray(numbers) ? numbers : []) {
    const v = caps(x?.value);
    if (!/^(?:[$£€¥]\s?)?[+-]?\d/.test(v) || v.length > 9) continue;
    if (/^(?:1[89]|20|21)\d\d$/.test(v)) continue; // a year is no figure
    const label = caps(x?.label);
    // ("2800 | X": a label of a letter or two says nothing)
    if ((label.match(/\p{L}/gu) || []).length < 3 || /^(?:MORE|LESS|FEWER|HIGHER|LOWER)$/.test(label)) continue;
    const qual = caps(x?.qualifier) || null;
    return { value: v, label: label.length > 24 ? label.slice(0, 24).replace(/\s+\S*$/, '') : label, qual };
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------- the quote

const SPEAKERS = /^(.{3,40}?)\s+(?:allege|alleges|say|says|said|claim|claims|warn|warns|tell|tells|told|insist|insists|accuse|accuses|admit|admits|recall|recalls|describe|describes|deny|denies|vow|vows)\b/i;

/** A quote short enough to be quoted whole: its first sentence, at most 96 characters, attributed; else null. */
export function shortQuote(quote) {
  if (!quote?.text || !quote.by) return null;
  const whole = String(quote.text).trim().replace(/^["“‘']+|["”’']+$/g, '').trim();
  const first = whole.split(/(?<=[.!?…])\s+/)[0].replace(/^["“‘']+|["”’']+$/g, '').trim();
  if (first.length < 12 || first.length > 96) return null;
  // a quote the feed cut, or one that starts mid-sentence, is never quoted
  if (!/^[\p{Lu}\d'"“‘]/u.test(first) || /[,;:–—-]$/.test(first)) return null;
  if (!/[.!?…]$/.test(first) && first !== whole) return null;
  const by = String(quote.by).replace(/\s+/g, ' ').trim();
  if (by.length > 28 || by.length < 2) return null;
  return { text: caps(first.replace(/\.{1,3}$/, '')), by: caps(by) };
}

/** The headline's own quote with who said it ("'It was fake': Indian villagers allege..."), or null. */
export function headlineQuote(headline) {
  const h = String(headline || '').trim();
  const m = /^['‘“"]([^'’”"]{6,64}?)['’”"]\s*[:–—-]?\s+(.+)$/u.exec(h);
  if (!m) return null;
  const said = m[1].replace(/[.,]$/, '').trim();
  const rest = m[2];
  const by = SPEAKERS.exec(rest)?.[1] || /^(?:an?\s+|the\s+)?([\p{L}' -]{3,30}?)['’]s\s+(?:take|view|story|account|verdict|warning|plea|message)\b/iu.exec(rest)?.[1] || null;
  if (!by || by.split(/\s+/).length > 4 || /^(?:how|why|what|when|who|where|as|after|the|a|an)$/i.test(by.split(/\s+/)[0])) return null;
  return { text: caps(said), by: caps(/^(?:a|an|the)\s/i.test(by) ? by : by) };
}

// ------------------------------------------------------------------------------------------------------- the topic

// the topic as the headline words it, with its glyph (graphics/topicboard.js GLYPHS; null: the words alone); the most
// specific first, each label either the matched words or the topic's own name
const T = (re, label, glyph, sober = false) => ({ re, label, glyph, sober });
const M = null; // the matched words are the label
export const TOPICS = [
  T(/\bdimming the sun\b/i, 'SOLAR GEOENGINEERING', 'orbit'),
  T(/\b(?:undersea|subsea) (?:cables?|backbone)\b/i, 'UNDERSEA CABLES', 'globe'),
  T(/\bstolen (?:art|artworks?|paintings?|masterpieces?|Renoirs?|Picassos?)\b/i, 'STOLEN ART', null),
  T(/\bcarer['’]s allowance\b/i, "CARER'S ALLOWANCE", null),
  T(/\b(?:AI (?:surveillance|models?|chatbots?|agents?|assistants?|tools?|chips?|regulation|safety|labell?ing|content|music|art|video))\b/, M, 'chip'),
  T(/\b(?:generative AI|gen AI)\b/i, 'GENERATIVE AI', 'chip'),
  T(/\b(?:chatbots?|deepfakes?)\b/i, M, 'chip'),
  T(/\b(?:artificial intelligence|machine learning)\b/i, M, 'chip'),
  T(/\bAI\b/, 'ARTIFICIAL INTELLIGENCE', 'chip'),
  T(/\b(?:humanoid robots?|robots?|robotics)\b/i, M, 'chip'),
  T(/\b(?:semiconductors?|chipmakers?|microchips?|processors?)\b/i, 'CHIPS', 'chip'),
  T(/\b(?:cyber ?attacks?|cyber ?security|cyber defences?|hackers?|hacking|ransomware|malware|spyware|zero-click|0-click|data breach(?:es)?)\b/i, 'CYBERSECURITY', 'shield'),
  T(/\b(?:surveillance|privacy|passwords?|encryption)\b/i, M, 'shield'),
  T(/\b(?:smart glasses|smartphones?|iphones?|ipads?|tablets?|laptops?|smartwatch(?:es)?|earbuds|headphones|wearables?|gadgets?|ipods?)\b/i, M, 'phone'),
  T(/\b(?:video games?|gaming|games? consoles?|consoles?|games? launcher|esports)\b/i, M, 'gamepad'),
  T(/\b(?:GTA|PC port)\b/, 'VIDEO GAMES', 'gamepad'),
  T(/\b(?:the internet|internet|broadband|connectivity)\b/i, 'THE INTERNET', 'globe'),
  T(/\b(?:movie theaters?|movie theatres?|cinemas?)\b/i, 'CINEMA', 'film'),
  T(/\b(?:streaming|podcasts?|films?|movies?|television|documentar(?:y|ies)|comedians?|radio|trailers?|sequels?|box office)\b/i, M, 'film'),
  T(/\bblack holes?\b/i, 'BLACK HOLES', 'orbit'),
  T(/\b(?:astronomers?|astronomy|telescopes?|galax(?:y|ies)|exoplanets?|nebulae?)\b/i, 'ASTRONOMY', 'orbit'),
  T(/\b(?:asteroids?|comets?|meteors?|meteorites?)\b/i, M, 'orbit'),
  T(/\brovers?\b/i, 'ROVERS', 'orbit'),
  T(/\b(?:smallsats?|satellites?)\b/i, 'SATELLITES', 'orbit'),
  T(/\b(?:rockets?|spacecraft|astronauts?|space station|spaceflight|space)\b/i, M, 'orbit'),
  T(/\b(?:Mars|the Moon|lunar|Artemis)\b/, M, 'orbit'),
  T(/\bdinosaurs?\b/i, 'DINOSAURS', 'flask'),
  T(/\bfossils?\b/i, 'FOSSILS', 'flask'),
  T(/\b(?:archaeolog\w*|ancient (?:temples?|cit(?:y|ies)|tombs?))\b/i, 'ARCHAEOLOGY', 'flask'),
  T(/\b(?:brain|neuroscien\w*|neurons?)\b/i, 'THE BRAIN', 'pulse'),
  T(/\b(?:genes?|genetic\w*|genomes?)\b/i, 'GENETICS', 'helix'),
  T(/\bDNA\b/, 'DNA', 'helix'),
  T(/\bquantum\b/i, 'QUANTUM PHYSICS', 'atom'),
  T(/\b(?:physicists?|physics|particles?|photons?)\b/i, 'PHYSICS', 'atom'),
  T(/\bfusion\b/i, 'FUSION POWER', 'atom'),
  T(/\bnuclear (?:power|energy|plants?|reactors?)\b/i, 'NUCLEAR POWER', 'atom'),
  T(/\b(?:chemical reactions?|chemistry|chemists?|molecules?)\b/i, 'CHEMISTRY', 'flask'),
  T(/\benzymes?\b/i, 'ENZYMES', 'flask'),
  T(/\b(?:why life exists|origins? of life)\b/i, 'THE ORIGIN OF LIFE', 'flask'),
  T(/\b(?:mitochondria|powerhouses? of (?:our|the) cells?)\b/i, 'MITOCHONDRIA', 'flask'),
  T(/\b(?:fungus|fungi|fungal|mushrooms?)\b/i, 'FUNGI', 'leaf'),
  T(/\b(?:lung|breast|bowel|prostate|skin|blood) cancer\b/i, M, 'pulse'),
  T(/\bcancer\b/i, 'CANCER', 'pulse'),
  T(/\balzheimer['’]?s\b/i, "ALZHEIMER'S", 'pulse'),
  T(/\bdementia\b/i, 'DEMENTIA', 'pulse'),
  T(/\b(?:avian flu|bird flu)\b/i, 'BIRD FLU', 'pulse'),
  T(/\b(?:long covid|covid(?:-19)?|influenza|flu|ebola|measles|mpox|cholera|malaria|tuberculosis|sepsis|menopause)\b/i, M, 'pulse'),
  T(/\bvaccin\w*\b/i, 'VACCINES', 'pulse'),
  T(/\b(?:retinas?|eyesight|blindness|vision loss|Stargardt disease)\b/i, 'EYESIGHT', 'pulse'),
  T(/\b(?:fat cells|obesity|weight loss|diabetes)\b/i, M, 'pulse'),
  T(/\b(?:workouts?|workout recovery|exercise|fitness)\b/i, 'EXERCISE', 'pulse'),
  T(/\b(?:mental health|sleep|anaesthesia|anesthesia|hospitals?|NHS|patients?|nurses?|doctors?)\b/i, M, 'pulse'),
  T(/\b(?:El Niño|El Nino|La Niña|La Nina)\b/i, M, 'wave'),
  T(/\b(?:climate change|global warming|climate)\b/i, 'CLIMATE CHANGE', 'leaf'),
  T(/\b(?:emissions|carbon (?:dioxide|capture|footprint|tax)|net zero)\b/i, 'EMISSIONS', 'leaf'),
  T(/\bflood(?:s|ing)?\b/i, 'FLOODING', 'wave'),
  T(/\b(?:oceans?|sea levels?|rising seas|coral|reefs?|wetlands?)\b/i, M, 'wave'),
  T(/\brewilding\b/i, 'REWILDING', 'leaf'),
  T(/\b(?:storms?|hurricanes?|typhoons?|heatwaves?|drought|weather)\b/i, M, 'wave'),
  T(/\bfly[- ]?tipp\w*\b/i, 'FLY-TIPPING', null),
  T(/\b(?:contaminated land|contamination|pollution|sewage|plastic waste|microplastics?)\b/i, M, 'leaf'),
  T(/\b(?:recycling|landfill)\b/i, M, 'leaf'),
  T(/\b(?:pollinating insects|pollinators|honey ?bees?|bees|insects?)\b/i, M, 'leaf'),
  T(/\b(?:barn owls|owls?|birds?|seabirds?)\b/i, M, null),
  T(/\b(?:wildlife|turtles?|whales?|belugas?|dolphins?|elephants?|animals?|sharks?|wolves|bears?|goats?|fish|eels|species)\b/i, M, 'paw'),
  T(/\bolive (?:trees?|groves?|harvest)\b/i, M, 'leaf'),
  T(/\b(?:plants?|weeds?|trees?|forests?|gardens?|gardeners?|harvests?|crops?|farmers?|farming)\b/i, M, 'leaf'),
  T(/\b(?:sea ice|ice sheets?|glaciers?|ice shelf|icebergs?)\b/i, M, 'wave'),
  T(/\b(?:food supply|vanilla|chocolate|coffee|diets?)\b/i, M, 'leaf'),
  T(/\b(?:heating oil|oil prices?|diesel prices?|petrol prices?|fuel prices?|energy bills?|gas prices?|energy prices?)\b/i, M, 'bolt'),
  T(/\b(?:energy storage|batter(?:y|ies)|solar (?:farms?|panels?|power)|wind (?:farms?|power)|power grid|electricity|renewables?)\b/i, M, 'bolt'),
  T(/\b(?:diesel|petrol|fuel|energy)\b/i, M, 'bolt'),
  T(/\b(?:the (?:euro|dollar|pound)|euro|dollar|sterling|yen|currenc(?:y|ies)|exchange rates?)\b/i, 'CURRENCIES', 'chart'),
  T(/\b(?:interest rates?|inflation|recession|GDP|cost of living)\b/i, M, 'chart'),
  T(/\brate (?:hikes?|cuts?|rises?)\b/i, 'INTEREST RATES', 'chart'),
  T(/\btax (?:avoidance|evasion|dodging|havens?|cuts?|rises?)\b/i, M, 'chart'),
  T(/\b(?:dodge|dodging|evade|evading) tax\b/i, 'TAX AVOIDANCE', 'chart'),
  T(/\b(?:banks|banking)\b/i, 'BANKING', 'chart'),
  T(/\beconomy\b/i, 'THE ECONOMY', 'chart'),
  T(/\b(?:Social Security|pensions?|benefits)\b/, M, null),
  T(/\b(?:stocks?|shares|IPO|valuations?|investors?|earnings|venture capital|startups?)\b/i, M, 'chart'),
  T(/\b(?:tariffs?|exports?|imports?)\b/i, M, 'globe'),
  T(/\b(?:housing|renters|landlords?|mortgages?|house prices|homelessness)\b/i, M, 'house'),
  T(/\b(?:shoplifting|shoplifters?|anti-shoplifting|retailers?|retail|supermarkets?|charity shops?|high streets?)\b/i, M, 'bag'),
  T(/\bmidterms?\b/i, 'THE MIDTERMS', 'ballot'),
  T(/\b(?:elections?|voters?|voting|ballots?|referendums?|polling)\b/i, M, 'ballot'),
  T(/\binquests?\b/i, 'INQUEST', 'scales', true),
  T(/\b(?:executions?|death row|death penalty|firing squad)\b/i, 'DEATH PENALTY', 'scales', true),
  T(/\b(?:lawsuits?|sued|sues)\b/i, 'LAWSUIT', 'scales'),
  T(/\btrials?\b/i, 'TRIAL', 'scales'),
  T(/\b(?:court|courts|judges?|jury|bail)\b/i, 'THE COURTS', 'scales'),
  T(/\b(?:jailed|sentenced|prison|convicted)\b/i, 'SENTENCING', 'scales', true),
  T(/\bcharged with\b/i, 'THE COURTS', 'scales', true),
  T(/\b(?:family and sexual|family|domestic|sexual) violence\b/i, M, null, true),
  T(/\b(?:investigators?|investigation|inquiry|detectives?)\b/i, 'INVESTIGATION', 'shield'),
  T(/\b(?:police|arrests?|arrested)\b/i, 'POLICING', 'shield'),
  T(/\bracis[mt]\b/i, 'RACISM', null, true),
  T(/\b(?:industrial|factory|warehouse) fires?\b/i, M, null, true),
  T(/\bsecurity\b/i, 'SECURITY', 'shield'),
  T(/\b(?:drones?|missiles?|troops|military|army|navy|defence|defense|ceasefire|war-?gam\w*)\b/i, M, 'shield'),
  T(/\b(?:immigration|migrants?|asylum|deportations?|refugees?|visas?)\b/i, M, 'globe'),
  T(/\b(?:protests?|protesters|demonstrations?)\b/i, 'PROTESTS', null),
  T(/\blearn(?:ing)? a (?:new )?language\b|\blanguages?\b/i, 'LANGUAGE LEARNING', 'book'),
  T(/\beducation\b/i, 'EDUCATION', 'book'),
  T(/\b(?:schools?|universit(?:y|ies)|students?|pupils|teachers?|exams?|classrooms?)\b/i, M, 'book'),
  T(/\b(?:auto show|motor show)\b/i, M, 'wheel'),
  T(/\bcar finance\b/i, 'CAR FINANCE', 'wheel'),
  T(/\b(?:driving tests?|electric vehicles?|EVs?|cars?|motoring|drivers?|road safety)\b/i, M, 'wheel'),
  T(/\b(?:trains?|railways?|rail|trams?|metro|subway|Channel Tunnel)\b/i, M, 'train'),
  T(/\b(?:flights?|airlines?|airports?|planes?|aviation|aircraft)\b/i, M, 'plane'),
  T(/\bNobel (?:Prize|Peace Prize|prize)s?\b/, 'NOBEL PRIZE', 'medal'),
  T(/\b(?:Premier League|Champions League|Europa League|World Cup)\b/, M, 'medal'),
  T(/\b(?:athletes?|Olympics?|Olympians?|football|soccer|tennis|golf|cricket|rugby|Formula One|F1|AFL|NFL|NBA)\b/, M, 'medal'),
  T(/\b(?:music|songs?|singers?|albums?|concerts?|musicians?)\b/i, M, null),
  T(/\b(?:artworks?|paintings?|museums?|galler(?:y|ies)|exhibitions?)\b/i, M, null),
  T(/\b(?:software|open[- ]source|operating systems?|browsers?|Linux|coding)\b/i, M, 'chip'),
  T(/\b(?:Android|Chromebooks?|Googlebooks?|macOS|Windows 1[01])\b/, M, 'phone'),
  T(/\b(?:apps?|smartphones?|phones?|devices?)\b/i, M, 'phone'),
];
// the glyph of a writer's topic label it bears out
const KICKER_GLYPH = { AI: 'chip', ROBOTICS: 'chip', CHIPS: 'chip', GADGETS: 'phone', GAMING: 'gamepad', CONNECTIVITY: 'globe', SECURITY: 'shield', PRIVACY: 'shield', ASTRONOMY: 'orbit', SPACE: 'orbit', HEALTH: 'pulse', CLIMATE: 'leaf', WILDLIFE: 'paw', OCEANS: 'wave', WEATHER: 'wave', ENERGY: 'bolt', TRADE: 'globe', JOBS: null, ELECTIONS: 'ballot', JUSTICE: 'scales', CRIME: null, EDUCATION: 'book', MOTORING: 'wheel', TRANSPORT: 'train', MIGRATION: 'globe', CULTURE: null, 'GREEN CITIES': 'leaf' };

/** The topic the headline words: { label, glyph } (glyph null where none fits), or null. */
export function headlineTopic(headline) {
  const h = String(headline || '');
  let best = null;
  for (const t of TOPICS) {
    const m = t.re.exec(h);
    if (!m) continue;
    // (the first entry that matches wins: the table is ordered from the most specific)
    best = { label: t.label || caps(m[0]), glyph: t.glyph, sober: t.sober };
    break;
  }
  return best;
}

// ------------------------------------------------------------------------------------------------------ the phrase

const LEAD_LABEL = /^(?:[^:]{2,40}):\s+(?=\S)/;
const STORY_NOUNS = 'crisis|scandal|row|inquiry|case|strike|protests?|trial|ban|scheme|bill|plan|deal|cuts?|reforms?|payments?|rules?|diagnosis|operation|surgery|murder|death|policy|review|report|warning|budget|election|campaign|tariffs?|recovery|launch|lineup|line-up';

/** The headline's key phrase when nothing else is left: a possessive phrase or two quoted words; else null. */
export function keyPhrase(headline) {
  const h = String(headline || '').replace(/[’‘]/g, "'");
  const body = h.replace(LEAD_LABEL, '').replace(/\s+[-–|]\s+(?:video|audio|live|podcast|explainer)$/i, '');
  const pos = new RegExp(`\\b((?:[A-Z][\\p{L}-]+\\s)?[\\p{L}-]+'s?\\s+[a-z]+(?:\\s+[a-z]+)?)\\s+(?:${STORY_NOUNS})\\b`, 'u').exec(body);
  // (never the words the headline opens with: the board would only say them again)
  if (pos && pos[1].length <= 30 && pos.index > 0) return caps(pos[1]);
  // two quoted words or more ("'skunk'" alone is a scare quote, never a phrase)
  const quoted = /['"“]([^'"“”]{4,28})['"”]/.exec(body);
  if (quoted && quoted[1].trim().split(/\s+/).length >= 2) return caps(quoted[1]);
  return null;
}

// ------------------------------------------------------------------------------------------------------- the board

/** Whether the story's own words bear out a writer's topic label (a label the story never uses may be another's). */
function bears(kicker, text) {
  const words = fold(kicker).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const t = fold(text).toLowerCase();
  return words.length > 0 && words.every((w) => new RegExp(`\\b${w.slice(0, Math.max(4, w.length - 2)).replace(/[^a-z0-9]/g, '')}`).test(t));
}

/**
 * The board of a story with neither a picture nor a place: { kind: 'figure', value, label, qual, grave } |
 * { kind: 'quote', text, by, grave } | { kind: 'actor', name, about, grave } | { kind: 'topic', label, glyph, grave } |
 * { kind: 'phrase', text, grave } | { kind: 'none', grave } (nothing the story says may stand alone: the field only).
 * `alt`: the outlet's own title (the writer's headline may drop the figure); `text`: the headline and the story's lead
 * (the server's), for a writer's topic label to be borne out; `actor`: { name, about } (server/picturedesk.js
 * boardActorOf).
 */
export function boardSpec({ headline = '', alt = '', kicker = null, numbers = null, quote = null, grave = false, actor = null, text = '' } = {}) {
  const g = !!grave;
  // (the on-screen headline first; the outlet's own title where the writer's shorter one drops what the board needs)
  const fig = headlineFigure(headline) || (alt ? headlineFigure(alt) : null);
  const stated = statedFigure(numbers);
  if (fig && String(fig.value).length <= 9) {
    const same = stated && stated.value.replace(/[^\d.]/g, '') === String(fig.value).replace(/[^\d.]/g, '');
    return { kind: 'figure', value: caps(fig.value), label: fig.label || (same ? stated.label : null), qual: fig.qual || (same ? stated.qual : null), grave: g };
  }
  if (stated) return { kind: 'figure', value: stated.value, label: stated.label, qual: stated.qual, grave: g };
  const q = shortQuote(quote) || headlineQuote(headline) || (alt ? headlineQuote(alt) : null);
  if (q) return { kind: 'quote', ...q, grave: g };
  const topic = headlineTopic(headline) || (alt ? headlineTopic(alt) : null);
  if (actor?.name) {
    // (a name no encyclopaedia describes yet carries the story's topic under it: "LICUBE", "FUSION POWER")
    const about = actor.about ? aboutLine(actor.about) : topic && caps(topic.label) !== caps(actor.name) ? topic.label : null;
    return { kind: 'actor', name: caps(actor.name), about, grave: g };
  }
  // (a topic of harm or of the courts is set soberly whatever the story's other words: no glyph, no accent)
  if (topic) return { kind: 'topic', label: topic.label, glyph: g || topic.sober ? null : topic.glyph, grave: g || !!topic.sober };
  const k = caps(kicker);
  if (k && !BARE.has(k) && bears(k, `${headline} ${text}`)) return { kind: 'topic', label: k, glyph: g ? null : KICKER_GLYPH[k] ?? null, grave: g };
  const phrase = keyPhrase(headline) || (alt ? keyPhrase(alt) : null);
  if (phrase) return { kind: 'phrase', text: phrase, grave: g };
  return { kind: 'none', grave: g };
}

/** What an actor is, in at most 30 characters: its description without dates in brackets, shed from the front. */
export function aboutLine(about) {
  const s0 = caps(fold(about).replace(/\s*\([^)]*\)/g, '').replace(/[.;].*$/, '').replace(/\s+(?:since|from|in|founded|established)\s+\d{4}.*$/i, ''));
  let words = s0.split(' ').filter(Boolean);
  // ("AUTONOMOUS INTERGOVERNMENTAL ORGANISATION" -> "INTERGOVERNMENTAL ORGANISATION": only a leading adjective goes, never
  // a word the rest needs: "HEAD OF THE CATHOLIC CHURCH" keeps its head)
  while (words.length > 2 && words.join(' ').length > 40 && /^(?:AUTONOMOUS|INDEPENDENT|INTERNATIONAL|GLOBAL|MULTINATIONAL|PUBLIC|PRIVATE|LEADING|MAJOR|FORMER|OFFICIAL|NON-PROFIT|NONPROFIT|STATE-OWNED)$/.test(words[0])) words = words.slice(1);
  const s = words.join(' ');
  return s.length > 40 || s.length < 3 ? null : s;
}

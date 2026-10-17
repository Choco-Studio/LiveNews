// The rights-aware picture desk (docs/pictures/RIGHTS.md): finds, for each story, a REAL photo the channel has the
// right to publish, pixelated, on YouTube, TikTok, Instagram, Facebook and X (owner 17 Oct: "hazlo bien pero sin que
// nos quite nada de calidad del canal"; 22:40: "on air only REAL photos, never drawn ones"). An outlet's own photo is
// never cleared: it stays only behind PICTURE_RIGHTS=preview, for a private preview.
//
// Where it looks, in a picture desk's order (each answer carries a rights record, server/rights.js):
//   1. the story's exact subject, resolved to its Wikidata item through the exact English Wikipedia title the story
//      names, and that item's own picture (P18) on Wikimedia Commons:
//        a person      a living adult public figure, named in full, early in the headline, in the role the story gives
//                      (the role words of the story agree with the item's description, offices or occupations, and its
//                      country or its fame confirms it); never on a story of their death or of an accusation;
//        a thing       an organisation's headquarters, a structure, a product, a spacecraft or mission, a body in space;
//        a place       the story's place (server/gazetteer.js), its item confirmed by its coordinates;
//        under a grave story only the public figure it is about, and only a portrait the face reader read as sober
//        (server/faces.js: no smile, one face), from their Wikidata picture, their Commons category and photographs,
//        or an institution's own Flickr picture (server/openverse.js); an obituary likewise;
//   2. NASA's image library for space stories (public domain in the US; no artist's concepts, posters or graphics;
//      only NASA's own credits);
//   3. a FILE picture of the same named actor doing the same kind of thing ("FILE 2023": server/fileevents.js), the
//      seat of government of the country a story about government names, a Commons FILE photo of the place or the
//      structure the story names (server/imagesearch.js);
//   4. nothing: the locator board (its place) or the topic board (its topic) take over (public/js/graphics/locator.js,
//      topicboard.js); never a drawn picture.
// Relevance, as strict as before or stricter: a picture never shows an event (no flood under a flood story, no
// crowd, no victims, no ruins); a grave story gets an official portrait or an institution, never a place's postcard;
// every picture that is not of the event itself is labelled FILE; a picture must be a photograph (no map, flag, logo,
// diagram, painting, render, artist's impression or generated image).
//
// Wikimedia is asked politely (server/wikimedia.js: one queue, a compliant User-Agent, Retry-After obeyed, batches of
// 50 titles or 40 items a request) and every answer is kept on disk, so a 24-hour desk asks a few requests an episode.
//
//   new PictureDesk({ dir, wikimedia, nasa, search, faces, openverse, mode, now }).assign(stories, { budgetMs }) -> stats
//   .decide(stories, { budgetMs })   find (and keep) each story's picture without touching the stories
//   .apply(story)                    put the decision on the story (s.image is then the cleared picture, or none)
//   .failed(story, reason)           the picture would not download: the next cleared one, or none
//   subjectsOf(story), storyFlags(story), roleAgreement(...), pictureProblem(...)   (exported for tests)
import path from 'node:path';
import { locate, findPlaces, degreesApart, lookupPlace } from './gazetteer.js';
import { isGrave, severity } from './facts.js';
import { rightsRecord, outletRecord, operatorRecord, currentRights, pictureMode, licenceOf } from './rights.js';
import { WikimediaClient, PacedJson, KeptAnswers } from './wikimedia.js';
import { fileQuery, fileFromCommons, COMMONS_MEDIA, standardRendition } from './imagesearch.js';
import { storyAction, actorKind, eventFileProblem, eventQuery, fileYear, seatFor } from './fileevents.js';
import { INSTITUTIONS, openverseTrust } from './openverse.js';
import { SOBER } from './faces.js';
export { fileFromCommons };

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// (a decision made while a source did not answer, with a picture found meanwhile, is kept only until it can be asked
// again: the subject it missed may be the better one)
export const TTL = { title: 7 * DAY, entity: 7 * DAY, file: 7 * DAY, search: DAY, nasa: DAY, decided: 12 * HOUR, none: 3 * HOUR, partial: HOUR / 3 };
const ENWIKI = 'https://en.wikipedia.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const WDQS = 'https://query.wikidata.org/sparql';
const NASA = 'https://images-api.nasa.gov/search';
export const MIN_WIDTH = { person: 400, other: 640 };
// the full shot's width in the client (pixelate.js at 416x234): a served picture narrower than it would be upscaled
const FULL_SHOT_W = 416;

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const strip = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// ------------------------------------------------------------------------------------------------ the story

// a story of violence (a grave story that is also about killing, war or an attack): no place, no structure, no thing;
// only a public official in their role
const VIOLENT = /\b(?:kill(?:s|ed|ing|ings)?|shot|shoot(?:s|ing|ings)?|gun(?:man|men|fire)|stabb\w*|attack(?:s|ed|er|ers)?|air ?strikes?|strikes? (?:on|at|in|against|hit)|struck|bomb\w*|shell(?:s|ed|ing)|missiles?|rockets? (?:fire|hit|attack)|drone (?:strike|attack)s?|explosions?|blasts?|terror\w*|hostages?|war|wars|warfare|invasion|massacre|murder\w*|assassinat\w*|executed|execution|raids?|clashes|fighting|offensive|genocide|tortur\w*|rape[sd]?|kidnap\w*|abduct\w*|militants?|insurgents?|casualt\w*|wounded)\b/i;
// a story of armed conflict, whatever its words of harm ("Kyiv hit by Russian ballistic missiles", "Saudi coalition strikes
// fuel depot", "Ukraine repels Russian forces"): no picture of the place or of a thing (an intact postcard under a strike
// misleads), only an official in their role
const DISASTER = /\b(?:fires?|blaze|wildfires?|floods?|flooding|storms?|hurricanes?|typhoons?|cyclones?|tornado(?:es)?|earthquakes?|quakes?|tsunamis?|landslides?|mudslides?|eruptions?|erupts?|explosions?|blasts?|collapses?|derail\w*|crash(?:es)?|ebola|cholera|measles|mpox|outbreaks?|epidemics?|pandemics?|plague|bird flu|avian flu)\b/i;
// unrest in the headline (protests, riots, clashes): the place's postcard (a golden-hour Paris under "France braces for
// the return of the Yellow Vests") is as wrong as under a disaster
const UNREST = /\b(?:protests?|protesters?|protesting|demonstrations?|demonstrators|riots?|rioters|unrest|clashes|uprising|curfew|tear gas)\b/i;
const STATECRAFT = /\b(?:government|govt|ministers?|ministry|pm|premier|president(?:ial)?|parliament(?:ary)?|congress|senate|senators?|lawmakers|mps?|elections?|electoral|midterms?|vote|voters|referendum|polls?|coalition|opposition|cabinet|ambassadors?|envoys?|diplomat\w*|embassy|sanctions?|treaty|summit|white house|kremlin|downing street|whitehall|administration|regime|state department|foreign (?:office|ministry|secretary)|tariffs?|deport\w*|immigration|espionage|spy|spies|budget|politics|political|politicians?|labor|labour|tory|tories|conservatives?|republicans?|democrats?)\b/i;
const STATE_ACT = /^(?:accuses?|arrests?|bans?|seizes?|sanctions?|expels?|summons?|threatens?|warns?|condemns?|demands?|denies|rejects?|accepts?|recognises?|recognizes?|signs?|approves?|orders?|deploys?|imposes?|lifts?|suspends?|recalls?|closes?|reopens?|restores?|joins?|quits?|leaves?|votes?|calls?|urges?|vows?|announces?|blocks?|detains?|charges?|jails?|executes?|extradites?|deports?|hosts?|receives?|welcomes?)$/i;
const ENVIRONMENT = /\b(?:deforestation|rainforests?|climate|emissions|carbon|wildlife|species|drought|glaciers?|pollution|biodiversity|coral|extinct\w*|endangered|habitats?|conservation|ecosystems?|wetlands?|reefs?)\b/i;
// a seat of government: a country's or a capital's picture only under a story about government
const SEAT_OF_GOVERNMENT = /\b(?:white house|kremlin|westminster|houses of parliament|parliament|capitol|downing street|elys[eé]e|reichstag|bundestag|government (?:house|building|palace)|presidential (?:palace|office|residence)|chancell[oe]ry|national assembly|duma|knesset|state house|palacio de la moneda|casa rosada|planalto|zhongnanhai|prime minister'?s office)\b/i;
// a place's picture only when the headline opens on it (the first four words, after a kicker)
const PLACE_EARLY = 3;
const CONFLICT = /\b(?:(?:coalition|military|army|israeli|russian|ukrainian|us|u\.s\.|american|iranian|houthi|drone|missile|air|naval|rocket|artillery|ballistic)\s+(?:strikes?|attacks?|raids?|missiles?|fire|barrage|bombardment|offensive|assault)|missiles?|drones? (?:strike|attack|hit)|airstrikes?|shelling|ceasefire|troops|forces (?:enter|seize|repel|advance|capture|withdraw)|repels?|seized? (?:new )?(?:strategic )?(?:area|town|city|territory)|front ?line|warplanes?|frigates?|warships?|gunfire|clashes|insurgen\w*|rebels?|militia\w*|jihadist\w*|occupation|annex\w*|invasion|escalating conflict|conflict)\b/i;
// a story of a person's death: no portrait of them (the station's identity rule: alive)
const DEATH_OF = /\b(?:dies|died|dead at|death of|has died|passes away|passed away|obituary|funeral|killed|found dead|murdered|assassinated|R\.?I\.?P\.?)\b/i;
// a person in legal jeopardy (suspected, accused, on trial, convicted): no portrait (privacy before charge in the UK,
// presumption of innocence everywhere; a lawyer may relax this, RIGHTS.md)
const ILLNESS = /\b(?:surgery|surgeries|(?:lung|heart|brain|hip|knee|back|eye|emergency|medical|surgical)\s+operations?|hospitali[sz]ed|in hospital|cancer|tumou?r|diagnosis|diagnosed|illness|stroke|heart attack|intensive care|chemotherapy)\b/i;
const JEOPARDY = /\b(?:search(?:es|ed)? (?:\S+ ){0,3}(?:home|house|office|premises)|raid(?:s|ed)?|arrest\w*|charged|charges? (?:against|over|of)|accus\w*|indict\w*|suspect\w*|investigat\w*|probe|alleg\w*|trial|convict\w*|sentenc\w*|guilty|jailed|prison|sued|sues|lawsuit|fraud|corrupt\w*|misconduct|harass\w*|abus\w*|scandal|bribe\w*|extradit\w*|detain\w*|custody)\b/i;

/** What a story is, for the picture rules: grave, violent, a death, legal jeopardy, its category. */
export function storyFlags(story) {
  const title = strip(story?.title || story?.headline || '');
  const summary = strip(story?.summary || '');
  const all = `${title} ${summary}`;
  // (an archived story says how it aired: `grave` for a sad story)
  // (a person's illness or operation is grave for the picture too: "Pope Leo XIV's planned lung operation this week")
  const grave = isGrave(all) || story?.grave === true || ILLNESS.test(title);
  return {
    title,
    summary,
    grave,
    // (armed conflict as the headline says it: a summary that mentions a war in passing does not make every story one)
    violent: (grave && VIOLENT.test(all)) || CONFLICT.test(title),
    // people harmed (deaths, injuries, evacuations: facts.js severity 3), violence, or a story that aired as sad: only an
    // official in their role or an institution; no place, no thing (the map tells it soberly). A grave story with nobody
    // harmed ("crisis", "war" in a political story) may show a person or a thing, never a place (a city's postcard is
    // never sober: a golden-hour Paris under "France braces for nationwide protests")
    harm: (grave && (severity(all) >= 3 || VIOLENT.test(all))) || CONFLICT.test(title) || story?.grave === true,
    // a disaster in the headline (a fire, a flood, a storm, an outbreak) or unrest (protests, riots): the place's
    // postcard under it misleads, the map tells it
    disaster: DISASTER.test(title) || UNREST.test(title) || /\b(?:march(?:es|ed|ing)?|marchers|rall(?:y|ies))\b/.test(title),
    // a story about government (a minister, an election, sanctions; plan() adds a state acting): only such a story may
    // show a seat of government as its place's picture (the White House under an archbishop's words misleads)
    statecraft: STATECRAFT.test(title.replace(/\bpremier league\b/gi, ' ')),
    // a story about nature (deforestation, a species, the climate): a city's postcard is not its picture
    environment: ENVIRONMENT.test(title),
    // a sports story: the club or the player, never the city's postcard (a match is not a place)
    sport: /^sport/.test(String(story?.category || '').toLowerCase()) || /\b(?:premier league|champions league|la liga|serie a|bundesliga|grand prix|grand slam|atp|wta|world cup|fixture|kick-off|semi-final|quarter-final|vs\.?|v\s|stuns|defeats|hat-trick|tennis|golf|cricket|rugby|f1|formula one|nba|nfl|mlb|atp|wta|year-end (?:top )?ranking|title race|relegation|transfer window|sent off|red card|yellow cards?|yellows|referee\w*|penalty shoot-?out|stoppage time|own goal|ballon d.or|wimbledon|roland garros|atp finals)\b/i.test(title),
    // a story about leisure itself (tourism, a festival, a beach) may show leisure
    leisure: /\b(?:touris\w*|holidays?|beach(?:es)?|festivals?|resorts?|travel|carnival|concerts?)\b/i.test(all),
    deathOf: DEATH_OF.test(title),
    jeopardy: JEOPARDY.test(title),
    category: String(story?.category || '').toLowerCase(),
  };
}

// words that are never a name on their own, and words a name span sheds at its start (roles, honorifics, nationalities)
const NOT_A_NAME = new Set(
  `a an the in on at for with from by after before as of to and or but if why how what who whom whose when where which watch live video analysis opinion exclusive breaking update updates explainer review podcast replay fact check news report reports says said new old more most first last next this that these those it its his her their our my your we us they he she i you here there today tonight yesterday tomorrow week weekend year years month monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december mr mrs ms miss dr sir dame lord lady president presidents prime minister ministers pm ceo chancellor secretary senator senators governor mayor king queen prince princess pope general judge officials official police government state states party leader leaders chief head former ex deputy vice acting spokesman spokeswoman spokesperson professor prof boss chair chairman chairwoman founder co-founder star actor actress singer coach manager captain striker player players fans team club league cup world global international national federal royal top big small ai uk us usa eu un is are was were be been has have had will would can could should not no yes all some many few`.split(' ')
);
// a role word at a name's start goes ("Prime Minister Keir Starmer" -> "Keir Starmer"; "US President Donald Trump")
const ROLE_LEAD = /^(?:(?:former|ex|acting|deputy|vice|new|then|incoming|outgoing|us|u\.s\.|uk|eu|un|british|american|french|german|russian|chinese|israeli|iranian|ukrainian|indian|japanese|canadian|australian|italian|spanish|turkish|saudi|egyptian|brazilian|mexican|south\s+african|nigerian|kenyan|pakistani|korean|palestinian|lebanese|syrian|iraqi|irish|scottish|welsh|polish|dutch|belgian|swedish|norwegian|danish|finnish|greek|swiss|austrian|hungarian|czech|venezuelan|argentine|colombian|chilean|peruvian|cuban|thai|vietnamese|indonesian|filipino|malaysian|taiwanese)\s+)*(?:president|prime\s+minister|premier|chancellor|minister|secretary(?:\s+of\s+state)?|foreign\s+(?:minister|secretary)|home\s+secretary|health\s+secretary|defence\s+secretary|defense\s+secretary|senator|sen\.|rep\.|congressman|congresswoman|governor|gov\.|mayor|king|queen|prince|princess|pope|cardinal|archbishop|bishop|sheikh|emir|sultan|general|gen\.|admiral|judge|justice|chief\s+justice|ambassador|envoy|commissioner|speaker|leader|opposition\s+leader|chief\s+executive|ceo|founder|co-founder|chair(?:man|woman)?|boss|coach|manager|captain|striker|star|actor|actress|singer|rapper|director|author|astronaut|professor|prof\.|dr\.?|mr\.?|mrs\.?|ms\.?|sir|dame|lord|lady|president-elect)\s+/i;
const CONNECTOR = new Set(['of', 'de', 'del', 'della', 'di', 'da', 'do', 'dos', 'das', 'du', 'des', 'la', 'le', 'van', 'von', 'der', 'den', 'bin', 'ibn', 'al', 'el', 'y', 'the', 'and']);
const TOKEN = /[\p{L}\p{M}][\p{L}\p{M}\p{N}'’.&-]*|\d[\p{N}.,]*/gu;
const isCap = (t) => /^\p{Lu}/u.test(t) || /^\p{Ll}+\p{Lu}/u.test(t); // "Nvidia", "NASA", "iPhone", "eBay"

/** The capitalised name spans of a text: [{ text, start (word index), words }], possessives and role words shed. */
export function nameSpans(text) {
  const s = String(text ?? '');
  const tokens = [];
  for (const m of s.matchAll(TOKEN)) {
    const raw = m[0];
    const possessive = /['’]s$/u.test(raw);
    let t = raw.replace(/['’]s$/u, '');
    // a trailing stop, quote or dash goes, except in an abbreviation ("U.S.", "Jr.", "St.")
    if (!/^(?:\p{L}\.){2,}$/u.test(t) && !/^(?:Jr|Sr|St|Mt|Dr|Mr|Mrs|Ms)\.$/.test(t)) t = t.replace(/[.'’-]+$/u, '');
    if (t) tokens.push({ t, at: m.index, end: m.index + raw.length, possessive });
  }
  const spans = [];
  let cur = [];
  const close = () => {
    while (cur.length && CONNECTOR.has(cur[cur.length - 1].t.toLowerCase())) cur.pop();
    if (cur.length) spans.push(cur);
    cur = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    const gap = i > 0 ? s.slice(tokens[i - 1].end, tk.at) : '';
    // punctuation between two words, or a possessive before ("Ukraine's Zelensky"), ends a name
    if (cur.length && (!/^\s+$/.test(gap) || tokens[i - 1].possessive)) close();
    if (isCap(tk.t)) cur.push({ ...tk, i });
    else if (cur.length && CONNECTOR.has(tk.t.toLowerCase()) && tokens[i + 1] && isCap(tokens[i + 1].t) && /^\s+$/.test(s.slice(tk.end, tokens[i + 1].at))) cur.push({ ...tk, i });
    else close();
  }
  close();
  const out = [];
  for (const span of spans) {
    let words = span.map((x) => x.t);
    let start = span[0].i;
    // shed a leading role ("Prime Minister", "US President", "Nvidia CEO" keeps Nvidia as its own span below)
    let joined = words.join(' ');
    const lead = ROLE_LEAD.exec(`${joined} `);
    if (lead && lead[0].trim().split(/\s+/).length < words.length) {
      const n = lead[0].trim().split(/\s+/).length;
      // a pope's or a monarch's article often keeps the title ("Pope Leo XIV"): the whole span is asked too
      if (/^(?:pope|king|queen|prince|princess|emperor|sheikh|emir|sultan|cardinal|archbishop|saint)\s/i.test(lead[0].trim().split(/\s+/).slice(-1)[0] + ' ')) out.push({ text: joined, start, words: words.length, titled: true });
      words = words.slice(n);
      start += n;
      joined = words.join(' ');
    }
    // a sentence's first word is capitalised whatever it is ("Is Andy Burnham...", "After Trump..."); "The" stays
    // ("The Hague", "The Pentagon": its parts still give the bare name)
    while (words.length > 1 && words[0] !== 'The' && NOT_A_NAME.has(words[0].toLowerCase())) {
      words = words.slice(1);
      start++;
    }
    // a role word inside a span splits it: "Nvidia CEO Jensen Huang" -> "Nvidia" and "Jensen Huang"
    let piece = [];
    let pieceStart = start;
    const flush = () => {
      while (piece.length && CONNECTOR.has(piece[0].toLowerCase())) {
        piece.shift();
        pieceStart++;
      }
      if (piece.length) out.push({ text: piece.join(' '), start: pieceStart, words: piece.length });
      piece = [];
    };
    words.forEach((w, k) => {
      if (/^(?:CEO|Chief|President|Minister|Secretary|Chancellor|Governor|Mayor|Boss|Chair(?:man|woman)?|Founder|Leader|Coach|Manager|Spokesperson|Spokesman|Spokeswoman)$/.test(w) && piece.length && k < words.length - 1) {
        flush();
        pieceStart = start + k + 1;
        return;
      }
      if (!piece.length) pieceStart = start + k;
      piece.push(w);
    });
    flush();
  }
  return out;
}

// companies and bodies whose short name is an everyday word or another article: the exact title of the one meant
// (only when written exactly so, with its capitals)
export const ALIASES = {
  Apple: 'Apple Inc.', Meta: 'Meta Platforms', Amazon: 'Amazon (company)', Tesla: 'Tesla, Inc.', Shell: 'Shell plc', Visa: 'Visa Inc.', Target: 'Target Corporation', Oracle: 'Oracle Corporation', Ford: 'Ford Motor Company', GM: 'General Motors', Alphabet: 'Alphabet Inc.', Uber: 'Uber', Nvidia: 'Nvidia', OpenAI: 'OpenAI', Anthropic: 'Anthropic', Samsung: 'Samsung Electronics', Sony: 'Sony', Intel: 'Intel', AMD: 'AMD', TSMC: 'TSMC', Netflix: 'Netflix', Microsoft: 'Microsoft', Google: 'Google', SpaceX: 'SpaceX', Boeing: 'Boeing', Airbus: 'Airbus', Huawei: 'Huawei', Xiaomi: 'Xiaomi', Alibaba: 'Alibaba Group', Tencent: 'Tencent', ByteDance: 'ByteDance', TikTok: 'TikTok', Spotify: 'Spotify', Disney: 'The Walt Disney Company', Lufthansa: 'Lufthansa', Ryanair: 'Ryanair', BP: 'BP', Nissan: 'Nissan', Toyota: 'Toyota', Volkswagen: 'Volkswagen', BMW: 'BMW', Stellantis: 'Stellantis', Renault: 'Renault', Ferrari: 'Ferrari', Starbucks: "Starbucks", "McDonald's": "McDonald's", Walmart: 'Walmart', Costco: 'Costco', Pfizer: 'Pfizer', Moderna: 'Moderna', Novartis: 'Novartis', AstraZeneca: 'AstraZeneca', Nestlé: 'Nestlé', Unilever: 'Unilever', HSBC: 'HSBC', Barclays: 'Barclays', Santander: 'Banco Santander', Goldman: 'Goldman Sachs', JPMorgan: 'JPMorgan Chase', Rolls: 'Rolls-Royce Holdings', Siemens: 'Siemens', ASML: 'ASML Holding', Arm: 'Arm Holdings', Qualcomm: 'Qualcomm', Broadcom: 'Broadcom', IBM: 'IBM', Cisco: 'Cisco', Salesforce: 'Salesforce', Adobe: 'Adobe Inc.', Dell: 'Dell Technologies', HP: 'HP Inc.', Lenovo: 'Lenovo', Nintendo: 'Nintendo', Ubisoft: 'Ubisoft', Valve: 'Valve Corporation', Roblox: 'Roblox Corporation', Reddit: 'Reddit', Pinterest: 'Pinterest', Snap: 'Snap Inc.', Discord: 'Discord', Telegram: 'Telegram (software)', Yandex: 'Yandex', Baidu: 'Baidu', BYD: 'BYD Auto', Rivian: 'Rivian', Waymo: 'Waymo', Zoox: 'Zoox (company)', Starlink: 'Starlink', Poundland: 'Poundland', Betfred: 'Betfred',
  'Yellow Vests': 'Yellow vests protests', 'Gilets jaunes': 'Yellow vests protests', BBC: 'BBC', Volvo: 'Volvo Cars',
  Epic: 'Epic Games', Cerebras: 'Cerebras Systems', SNES: 'Super Nintendo Entertainment System', Xbox: 'Xbox', PlayStation: 'PlayStation', IEA: 'International Energy Agency', OECD: 'OECD', ICE: 'U.S. Immigration and Customs Enforcement', Webb: 'James Webb Space Telescope',
  NASA: 'NASA', ESA: 'European Space Agency', ISRO: 'Indian Space Research Organisation', JAXA: 'JAXA', Roscosmos: 'Roscosmos', CNSA: 'China National Space Administration', ISS: 'International Space Station', JWST: 'James Webb Space Telescope', Hubble: 'Hubble Space Telescope', 'Brazilian Amazon': 'Amazon rainforest', WHO: 'World Health Organization', UN: 'United Nations', NATO: 'NATO', IMF: 'International Monetary Fund', ECB: 'European Central Bank', Fed: 'Federal Reserve', BoE: 'Bank of England', NHS: 'National Health Service (England)', FDA: 'Food and Drug Administration', FBI: 'Federal Bureau of Investigation', CIA: 'Central Intelligence Agency', Interpol: 'Interpol', ICC: 'International Criminal Court', ICJ: 'International Court of Justice', WTO: 'World Trade Organization', OPEC: 'OPEC', IAEA: 'International Atomic Energy Agency', Pentagon: 'The Pentagon', Kremlin: 'Moscow Kremlin', Vatican: 'Vatican City', Ofcom: 'Ofcom', Ofgem: 'Ofgem', CERN: 'CERN', WMO: 'World Meteorological Organization', UNESCO: 'UNESCO', UNICEF: 'UNICEF',
};

// short names that are everyday words or other things (the Amazon is a river and a forest; an apple a fruit): their
// company only where the story speaks of a company
const AMBIGUOUS = new Set(['Volvo', 'Apple', 'Amazon', 'Meta', 'Shell', 'Target', 'Visa', 'Oracle', 'Epic', 'Arm', 'Snap', 'Valve', 'Ford', 'Tesla', 'Alphabet', 'Discord', 'Telegram', 'Ramp', 'Plex', 'Webb', 'ESA', 'ICC', 'ECB']);
const COMPANY_TALK = /\b(?:company|companies|firm|shares?|stock|investors?|ceo|chief executive|boss|app|apps|device|devices|gadget|iphone|ipad|mac|store|launch(?:es|ed)?|unveil\w*|product|profit|revenue|sales|employees|staff|jobs|lay(?:s)? off|layoffs|deal|acquisition|platform|users|subscribers|subscription|service|tech|software|smartphone|chip|ai\b|model|startup)\b/i;
const ACRONYM_TALK = {
  ESA: /\b(?:space|satellites?|rockets?|launch\w*|orbit\w*|astronauts?|missions?|probes?|telescopes?|planets?|moon|mars|ariane|copernicus)\b/i,
  ICC: /\b(?:court|tribunal|war crimes?|prosecutors?|judges?|warrants?|hague|genocide|crimes against humanity|sanctions?)\b/i,
  ECB: /\b(?:central bank|interest rates?|rates?|inflation|euro|eurozone|lagarde|monetary|bond|bonds|banking)\b/i,
};
const FOREST_TALK = /\b(?:deforestation|rainforest|forests?|jungle|indigenous|tribes?|basin|river|wildfires?|logging|biodiversity)\b/i;
const SPACE_TALK = /\b(?:telescope|space|cosmic|galaxy|galaxies|universe|star|stars|nebula|infrared|exoplanet|planet|astronom\w*)\b/i;
/** The exact article a short name stands for in this story, or null (an ambiguous one only in its own context). */
export function aliasFor(name, story) {
  const target = ALIASES[name];
  if (!target) return null;
  if (!AMBIGUOUS.has(name)) return target;
  const text = `${story?.title || ''} ${story?.summary || ''}`;
  if (name === 'Webb') return SPACE_TALK.test(text) ? target : null;
  // Volvo is two companies: the cars (Volvo Cars, Geely's) and the trucks and buses (AB Volvo, whose article is "Volvo")
  if (name === 'Volvo') return /\b(?:trucks?|lorr(?:y|ies)|buses|coaches|construction equipment|volvo group|ab volvo)\b/i.test(text) ? 'Volvo' : target;
  if (name === 'Amazon' && FOREST_TALK.test(text)) return 'Amazon rainforest';
  // an acronym that names other bodies too: ESA is also the Entertainment Software Association ("ESA targets Anbernic
  // emulation handhelds", the hand check of 17 Oct), ICC the International Cricket Council, ECB the England and Wales
  // Cricket Board
  if (ACRONYM_TALK[name]) return ACRONYM_TALK[name].test(text) ? target : null;
  return /^(?:tech|business|money)/.test(String(story?.category || '').toLowerCase()) || COMPANY_TALK.test(text) ? target : null;
}

// public figures the news names by their surname alone, each article checked on Wikipedia on 17 Oct 2026: the article
// meant, only where no one else of that surname is named in the story ("Melania Trump", "Francesca Albanese": that is
// why Albanese is not here; "Bolsonaro" is Jair or Flávio, "Medvedev" a politician or a tennis player: never). Every
// person rule still applies (living, adult, early in the headline, never accused, sober under a grave story); the list
// itself stands for the role check, which a headline naming only a surname rarely passes ("Trump faces backlash...")
export const SURNAMES = {
  Trump: 'Donald Trump', Biden: 'Joe Biden', Obama: 'Barack Obama', Vance: 'JD Vance', Rubio: 'Marco Rubio', Hegseth: 'Pete Hegseth', Bessent: 'Scott Bessent', Newsom: 'Gavin Newsom', Mamdani: 'Zohran Mamdani', Pelosi: 'Nancy Pelosi', Schumer: 'Chuck Schumer', 'Ocasio-Cortez': 'Alexandria Ocasio-Cortez',
  Putin: 'Vladimir Putin', Lavrov: 'Sergey Lavrov', Peskov: 'Dmitry Peskov', Zelensky: 'Volodymyr Zelenskyy', Zelenskyy: 'Volodymyr Zelenskyy', Macron: 'Emmanuel Macron', Starmer: 'Keir Starmer', Burnham: 'Andy Burnham', Farage: 'Nigel Farage', Badenoch: 'Kemi Badenoch', Sunak: 'Rishi Sunak',
  Netanyahu: 'Benjamin Netanyahu', Xi: 'Xi Jinping', Modi: 'Narendra Modi', Erdogan: 'Recep Tayyip Erdoğan', 'Erdoğan': 'Recep Tayyip Erdoğan', Lula: 'Luiz Inácio Lula da Silva', Milei: 'Javier Milei', Meloni: 'Giorgia Meloni', Sheinbaum: 'Claudia Sheinbaum', Merz: 'Friedrich Merz', Scholz: 'Olaf Scholz', Tusk: 'Donald Tusk', 'Orbán': 'Viktor Orbán', Orban: 'Viktor Orbán', Fico: 'Robert Fico',
  Khamenei: 'Ali Khamenei', Pezeshkian: 'Masoud Pezeshkian', Guterres: 'António Guterres', Lagarde: 'Christine Lagarde', Rutte: 'Mark Rutte', Kallas: 'Kaja Kallas', Carney: 'Mark Carney', Trudeau: 'Justin Trudeau', Ramaphosa: 'Cyril Ramaphosa', Ruto: 'William Ruto', Tinubu: 'Bola Tinubu', Maduro: 'Nicolás Maduro', Bukele: 'Nayib Bukele', Takaichi: 'Sanae Takaichi', Prabowo: 'Prabowo Subianto', Mitsotakis: 'Kyriakos Mitsotakis', Lukashenko: 'Alexander Lukashenko',
  Musk: 'Elon Musk', Zuckerberg: 'Mark Zuckerberg', Bezos: 'Jeff Bezos', Altman: 'Sam Altman', Nadella: 'Satya Nadella', Pichai: 'Sundar Pichai', 'Pope Leo': 'Pope Leo XIV',
};
const SURNAME_FAMILY = { Musk: 'business', Zuckerberg: 'business', Bezos: 'business', Altman: 'business', Nadella: 'business', Pichai: 'business', 'Pope Leo': 'religion' };
/** The role a curated surname stands for (server SURNAMES): { family, how }. */
export const surnameRole = (surname) => ({ family: SURNAME_FAMILY[surname] || 'politics', how: 'a public figure named by surname' });
// the words that may stand before a surname without naming someone else ("President Trump", "Russia's Putin")
const BEFORE_SURNAME = /^(?:president|presidents|prime|minister|chancellor|premier|pm|leader|secretary|senator|vice|general|pope|mr|mrs|ms|dr|the|us|u\.s\.|uk|eu|un|former|ex|said|says|and|by|to|of|on|with|as|after|before|against|for|from|at|in|but|why|how|what|when|meets|tells|warns|slams|urges|calls|backs|hits|blasts|praises|accuses|sues|trusts|ally|allies|rival|critics)$/i;
/** The article a public figure's bare surname stands for in this story, or null (someone else of that name is named). */
export function surnameFor(name, story) {
  const target = SURNAMES[name];
  if (!target) return null;
  const first = target.split(' ')[0];
  const text = `${story?.title || ''} ${story?.summary || ''}`;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of text.matchAll(new RegExp(`([\\p{L}.'’]+)\\s+${esc}(?![\\p{L}])`, 'gu'))) {
    const w = m[1].replace(/['’]s$/u, '');
    // (a place or its demonym before it is fine: "Russian President Putin", "Brazil's Lula")
    if (w === first || BEFORE_SURNAME.test(w) || !isCap(w) || lookupPlace(w) || findPlaces(w).length) continue;
    return null;
  }
  return target;
}

/** A headline without its "Middle East crisis: ..." or "REPLAY: ..." kicker (a kicker is not the headline's subject). */
export function headlineOf(title) {
  const t = String(title || '');
  const kick = /^[^:]{2,40}:\s+(?=\S)/.exec(t);
  return kick && !/\d:\d/.test(kick[0]) ? t.slice(kick[0].length) : t;
}

/**
 * The names a story's picture could be of: the headline's name spans (and their single words, for one-word names),
 * each expanded to the full form the summary gives ("Starmer" -> "Keir Starmer"); with where in the headline it
 * starts (after a "Kicker:" prefix). A title-cased headline borrows its capitals from the summary.
 */
export function subjectsOf(story) {
  const { title, summary } = storyFlags(story);
  if (!title) return [];
  const head = headlineOf(title);
  const words = head.match(TOKEN) || [];
  const capShare = words.filter((w) => w.length > 3).filter((w) => isCap(w)).length / Math.max(1, words.filter((w) => w.length > 3).length);
  const titleCase = capShare > 0.7 && words.length >= 4;
  const sumSpans = nameSpans(summary);
  const sumNames = new Set(sumSpans.map((x) => x.text));
  const out = [];
  const seen = new Set();
  const add = (text, start, how, written = null) => {
    const t = text.trim();
    if (!t || seen.has(t)) return;
    const lower = t.toLowerCase();
    if (t.split(' ').length === 1 && (NOT_A_NAME.has(lower) || t.length < 2)) return;
    if (/^\d/.test(t)) return;
    seen.add(t);
    // a name followed by what it names ("Prince Charles cinema", "Mandela Bay", "Shakespeare theatre") is that thing
    // (the word after the name as the headline writes it: "Erdogan visits", not after the summary's longer name)
    const span = written || t.split(' ').length;
    const after = headWords[start + span] || '';
    const namedThing = NAMED_THING.test(after);
    // the person quoted ("..., says PSG's Luis Enrique", "... – Trump tells reporters"): a speech verb in the five words
    // before the name, or right after it
    const said = headWords.slice(Math.max(0, start - 5), start).some((w) => SPEECH.test(w)) || SPEECH.test(headWords[start + span] || '');
    out.push({ text: t, start, how, ...(said ? { said: true } : {}), ...(namedThing ? { namedThing: true } : {}) });
  };
  const headWords = head.match(TOKEN) || [];
  for (const span of nameSpans(head)) {
    // a title-cased headline: a span counts only where the summary writes it with capitals too (or an alias)
    if (titleCase && !sumNames.has(span.text) && !ALIASES[span.text] && !summary.includes(span.text)) {
      // the names the summary writes inside the span ("NASA Names Astronaut Christina Koch Acting..." -> "Christina Koch")
      const ws = span.text.split(' ');
      for (let n = Math.min(4, ws.length); n >= 1; n--) {
        for (let k = 0; k + n <= ws.length; k++) {
          const part = ws.slice(k, k + n).join(' ');
          const known = n <= 2 && surnameFor(part, story);
          if (known) {
            add(known, span.start + k, 'surname', n);
            const c = out.find((x) => x.text === known);
            if (c && !c.surname) c.surname = part;
          } else if (n === 1 ? ALIASES[part] || (sumNames.has(part) && !NOT_A_NAME.has(part.toLowerCase())) : sumNames.has(part)) add(aliasFor(part, story) || part, span.start + k, n === 1 ? 'word' : 'span', n);
        }
      }
      continue;
    }
    // the full name the summary gives for this surname or this partial name ("Zelensky" -> "Volodymyr Zelensky")
    const esc = span.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // a surname ("Zelensky" -> "Volodymyr Zelensky"), or a name and its number ("Pope Leo" -> "Pope Leo XIV")
    const fuller = sumSpans.find((x) => x.words > span.words && x.words <= 4 && (new RegExp(`(?:^|\\s)${esc}$`).test(x.text) || new RegExp(`^${esc}\\s+(?:[IVX]+|Jr\\.?|Sr\\.?)$`).test(x.text)));
    if (fuller) add(fuller.text, span.start, 'summary', span.words);
    // (an ambiguous name the story does not speak of as its known body is not asked as written either: "ESA" leads to
    // the space agency on Wikipedia, while "ESA targets Anbernic emulation handhelds" is the games industry's)
    const unmeant = AMBIGUOUS.has(span.text) && ALIASES[span.text] && !aliasFor(span.text, story);
    // a public figure the news names by surname alone ("Trump", "Putin"): their article, the surname kept as written
    // (instead of the bare surname, which would lead to the same article and be refused as "not named in full")
    const known = !fuller && surnameFor(span.text, story);
    if (known) {
      add(known, span.start, 'surname', span.words);
      const c = out.find((x) => x.text === known);
      if (c && !c.surname) c.surname = span.text;
    }
    // (a name whose alias is another article is asked by its alias only: "Volvo" is AB Volvo on Wikipedia, while a car
    // story's Volvo is Volvo Cars)
    const other = aliasFor(span.text, story);
    if (span.words <= 5 && !unmeant && !known && !(other && other !== span.text && AMBIGUOUS.has(span.text))) add(span.text, span.start, 'span');
    if (aliasFor(span.text, story)) add(aliasFor(span.text, story), span.start, 'alias', span.words);
    if (span.words > 1) {
      const ws = span.text.split(' ');
      // a long span's two- and three-word parts ("Greater Manchester Mayor Andy" is rare; "Thames Water sewer" is not),
      // and any single word that names a known body ("Apple TV" -> Apple Inc.); a single word of a longer name is not
      // asked on its own ("Bank of America" is never "Bank")
      for (let n = Math.min(3, ws.length - 1); n >= 1; n--) {
        for (let k = 0; k + n <= ws.length; k++) {
          const part = ws.slice(k, k + n);
          if (CONNECTOR.has(part[0].toLowerCase()) || CONNECTOR.has(part[part.length - 1].toLowerCase())) continue;
          const p = part.join(' ');
          if (n === 1) {
            if (aliasFor(p, story)) add(aliasFor(p, story), span.start + k, 'alias', 1);
          } else if (ws.length >= 3) add(p, span.start + k, 'part');
        }
      }
    }
  }
  const names = out.filter((c) => c.text.length <= 60).slice(0, 8);
  // the topic a headline names in plain words ("Children asked to name Ealing's new beavers", "Little tern colony has
  // worst breeding season"): a living thing or a body in space, asked by its Wikipedia title ("Beaver", "Little tern")
  // and kept only if Wikidata says it is one (options: a topic is never a person, a place or a company)
  const topics = [];
  const natural = /^(?:science|environment|nature)/.test(String(story?.category || '').toLowerCase()) || NATURE_TALK.test(`${title} ${summary}`);
  const ws = natural ? [...head.matchAll(/[\p{L}][\p{L}'’-]*/gu)] : [];
  ws.forEach((m, i) => {
    const w = m[0].replace(/['’]s$/u, '');
    const lower = w.toLowerCase();
    if ((i > 0 && isCap(w)) || lower.length < 3 || TOPIC_STOP.has(lower) || NOT_A_NAME.has(lower) || VERB_FORM.test(lower)) return;
    const one = singular(lower);
    const prev = i > 0 ? ws[i - 1][0].toLowerCase() : null;
    if (prev && prev.length >= 3 && !TOPIC_STOP.has(prev) && !NOT_A_NAME.has(prev) && !VERB_FORM.test(prev)) topics.push({ text: cap1(`${prev} ${one}`), start: i - 1, how: 'topic', two: true });
    // (a single word of three letters is too often something else: "bee" only as "honey bee"; a broad group, "plant",
    // "owl", "fungus", shows another species than the story's; and never the head alone where its two-word name was
    // asked: a grey squirrel under a red squirrel story is wrong)
    const paired = prev && prev.length >= 3 && !TOPIC_STOP.has(prev) && !NOT_A_NAME.has(prev) && !VERB_FORM.test(prev);
    if (lower.length >= 4 && !BROAD_TOPIC.has(one) && !paired) topics.push({ text: cap1(one), start: i, how: 'topic' });
  });
  const seenT = new Set(names.map((c) => c.text));
  // two-word names first ("Little tern" before "Tern"), then the single words, five at most
  const ordered = [...topics.filter((c) => c.two), ...topics.filter((c) => !c.two)].map(({ two, ...c }) => c);
  return [...names, ...ordered.filter((c) => !seenT.has(c.text) && seenT.add(c.text)).slice(0, 6)];
}

const NAMED_THING = /^(?:cinema|theatre|theater|hall|hospital|school|college|university|stadium|arena|park|bridge|street|road|avenue|square|station|airport|museum|gallery|library|centre|center|foundation|trust|award|awards|prize|cup|trophy|building|house|tower|estate|institute|memorial|statue|bay|lake|river|island|mountain|county|city|town|line|act|law|doctrine|effect|syndrome|scheme|fund|show|festival|plan|report)$/i;
const SPEECH = /^(?:says|said|warns|warned|tells|told|claims|claimed|urges|urged|insists|admits|vows|demands|denies|calls|slams|accuses|praises)$/i;
// a word read as a verb or an adverb ("breeding", "tagged", "rarely"), never a topic: only words of five letters or more
// ("red squirrel", "bed bug" keep their first word)
const VERB_FORM = /^\p{L}{3,}(?:ed|ing|ly)$/u;
const NATURE_TALK = /\b(?:wildlife|species|animals?|birds?|insects?|plants?|zoo|conservation|habitat|forest|marine|reef|breeding|nature reserve|rspb|wwt|national trust)\b/i;
const BROAD_TOPIC = new Set('plant tree flower animal bird insect fish mammal reptile amphibian fungus fungi mushroom owl dinosaur bacterium bacteria virus cell species wildlife crop weed rose seed leaf root fruit vegetable meat food water ice rock stone star sky sea ocean river lake mountain forest cloud rain snow wind sun moon light heat fire metal gold oil gas'.split(' '));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** A plural's singular, simply ("beavers" -> "beaver", "species" stays, "colonies" -> "colony", "wolves" -> "wolf"). */
export function singular(w) {
  if (/(?:ss|us|is|species|series|news|sheep|deer|fish|aircraft)$/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return w.replace(/ies$/, 'y');
  if (/(?:ches|shes|xes|zes|sses)$/.test(w)) return w.replace(/es$/, '');
  if (/lves$|rves$/.test(w)) return w.replace(/ves$/, 'f');
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
// words that are never a picture's topic (verbs, adjectives, news words, abstractions)
const TOPIC_STOP = new Set(
  `about above across after again against ahead also among announces announced approves asked asks back bans become becomes been before begins behind being best better between beyond biggest bill billion bring brings call calls cant case cases claims could cuts deal deals despite does down during early ends even ever every expected face faces fall falls fear fears find finds first found from gets give gives good great half have help helps here high higher hits hold holds huge into issues just keep keeps know large last late latest launch launches lead leads least less like likely long look looks lose loses lost made major make makes many might million more most move moves much must near need needs never news next night nothing offer offers only open opens over part past plan plans play plays puts rare real record report reports reveal reveals rise rises rule rules said save says scientists researchers astronomers physicists study studies small some still stop strange surprising take takes than that their them then there these they thing things think this those three through time times today told tops toward under until upon very want wants warns week what when where which while whole will with without world worst would year years young your hidden finally first-ever stunning astonishing mystery secret secrets discovery discover discovers discovered uncover uncovers explain explains could might new old big small name names named season seasons colony breeding worst video videos photo photos picture pictures high-speed reveal reveals help helps people children woman women month lives life deal`.split(/\s+/)
);

// ------------------------------------------------------------------------------------------------ roles

// role families: what a story calls a person, and what their Wikidata item says they are
const ROLE_FAMILIES = [
  { id: 'politics', story: /\b(?:president|prime minister|premier|pm|chancellor|minister|secretary|senator|congress(?:man|woman)|representative|lawmaker|legislator|mp|mep|governor|mayor|leader|speaker|vice president|vp|politician|candidate|ambassador|envoy|diplomat|commissioner|first minister|taoiseach|chief minister|councillor|attorney general|official|spokesperson|regime|government|cabinet|opposition|party|parliament|administration|white house|downing street|kremlin)\b/i, item: /\b(?:president|prime minister|premier|chancellor|minister|secretary|senator|member of|representative|politician|governor|mayor|leader|speaker|ambassador|diplomat|commissioner|first minister|taoiseach|attorney general|statesman|stateswoman|civil servant|official)\b/i },
  { id: 'royalty', story: /\b(?:king|queen|prince|princess|duke|duchess|emperor|empress|monarch|royal|crown prince|emir|sheikh|sultan)\b/i, item: /\b(?:king|queen|prince|princess|duke|duchess|emperor|empress|monarch|royal|emir|sheikh|sultan|sovereign)\b/i },
  { id: 'religion', story: /\b(?:pope|pontiff|vatican|archbishop|bishop|cardinal|imam|rabbi|patriarch|ayatollah|dalai lama|cleric|church)\b/i, item: /\b(?:pope|catholic church|archbishop|bishop|cardinal|imam|rabbi|patriarch|ayatollah|dalai lama|cleric|priest|religious leader|supreme leader)\b/i },
  { id: 'business', story: /\b(?:ceo|chief executive|founder|co-founder|boss|chair(?:man|woman)?|executive|billionaire|businessman|businesswoman|entrepreneur|investor|tycoon|mogul|owner|president of)\b/i, item: /\b(?:businessman|businesswoman|businessperson|business executive|executive|entrepreneur|chief executive|ceo|founder|investor|billionaire|industrialist|chairman|chairperson|banker|engineer|computer scientist)\b/i },
  { id: 'sport', story: /\b(?:footballer|striker|forward|midfielder|defender|goalkeeper|keeper|captain|player|coach|manager|head coach|tennis|golfer|driver|cyclist|athlete|sprinter|runner|swimmer|boxer|fighter|champion|quarterback|pitcher|cricketer|skipper|winger|olympian|world champion|grand slam|formula one|f1)\b/i, item: /\b(?:footballer|football player|association football|soccer|player|coach|manager|tennis|golfer|racing driver|cyclist|athlete|sprinter|runner|swimmer|boxer|mixed martial|fighter|cricketer|basketball|baseball|american football|rugby|ice hockey|sportsperson|olympian)\b/i },
  { id: 'arts', story: /\b(?:actor|actress|star|singer|rapper|musician|band|director|film-?maker|producer|writer|author|novelist|screenwriter|comedian|presenter|host|broadcaster|artist|painter|designer|model|influencer|youtuber|streamer|dj|composer|playwright|poet|film|movie|album|show|series|novel|book)\b/i, item: /\b(?:actor|actress|singer|rapper|musician|songwriter|director|filmmaker|film producer|producer|writer|author|novelist|screenwriter|comedian|presenter|television presenter|host|broadcaster|journalist|artist|painter|designer|model|youtuber|streamer|disc jockey|composer|playwright|poet|record producer|media personality)\b/i },
  { id: 'science', story: /\b(?:scientist|researcher|professor|astronaut|physicist|astronomer|economist|biologist|chemist|engineer|academic|nobel|laureate)\b/i, item: /\b(?:scientist|physicist|astronomer|astronaut|economist|professor|academic|researcher|physician|biologist|chemist|engineer|mathematician|astrophysicist)\b/i },
  { id: 'law', story: /\b(?:judge|justice|chief justice|prosecutor|attorney|lawyer|barrister|solicitor|court)\b/i, item: /\b(?:judge|jurist|justice|lawyer|prosecutor|barrister|solicitor|attorney)\b/i },
  { id: 'press', story: /\b(?:journalist|reporter|editor|anchor|correspondent|columnist|commentator)\b/i, item: /\b(?:journalist|editor|presenter|news anchor|correspondent|columnist|commentator)\b/i },
  { id: 'military', story: /\b(?:general|admiral|commander|chief of staff|army chief|military chief|marshal)\b/i, item: /\b(?:military officer|general|admiral|commander|military personnel|marshal)\b/i },
];
const SPECIFIC = /\b(?:president|prime minister|premier|chancellor|minister|secretary|senator|governor|mayor|speaker|ambassador|commissioner|first minister|taoiseach|attorney general|king|queen|prince|princess|pope|archbishop|bishop|cardinal|emir|sultan|ceo|chief executive|founder|footballer|striker|goalkeeper|tennis|golfer|driver|cyclist|boxer|cricketer|actor|actress|singer|rapper|director|writer|author|novelist|comedian|presenter|journalist|astronaut|physicist|astronomer|economist|judge|general|admiral)\b/gi;

/**
 * Does the story speak of this person in the role their Wikidata item gives? A family of roles must agree (a story's
 * "Prime Minister" and the item's "Prime Minister of the United Kingdom"), and then either the very role word (with
 * the person's country named in the story, or a person known in many languages) or the country confirms it.
 * Returns { family, how } or null.
 */
export function roleAgreement(storyText, facts, { country = null, sport = false } = {}) {
  const st = String(storyText || '');
  const itemText = [facts?.desc, ...(facts?.positions || []), ...(facts?.occupations || [])].filter(Boolean).join(' | ');
  if (!itemText) return null;
  // (a sports story speaks of sport whether or not it says "player": "Olise sent off for two yellows")
  const fams = ROLE_FAMILIES.filter((f) => (f.story.test(st) || (sport && f.id === 'sport')) && f.item.test(itemText));
  if (!fams.length) return null;
  const sitelinks = Number(facts?.sitelinks) || 0;
  const countries = facts?.countries || [];
  const countryNamed = countries.some((c) => countryInText(c, st)) || (country && countries.some((c) => fold(c) === fold(country)));
  const storyRoles = new Set((st.match(SPECIFIC) || []).map((w) => w.toLowerCase()));
  const shared = [...storyRoles].find((w) => new RegExp(`\\b${w}\\b`, 'i').test(itemText));
  for (const f of fams) {
    if (shared && (countryNamed || sitelinks >= 15)) return { family: f.id, how: `role "${shared}"${countryNamed ? ' + country' : ` + ${sitelinks} sitelinks`}` };
    if (countryNamed && sitelinks >= 5) return { family: f.id, how: 'role family + country' };
    // a sports story about a sportsperson known in many languages (a player, a manager: the story names the club, rarely
    // the country)
    if (sport && f.id === 'sport' && sitelinks >= 15) return { family: f.id, how: `sports story + ${sitelinks} sitelinks` };
  }
  return null;
}

const DEMONYM_EXTRA = { 'United States': ['US', 'U.S.', 'American', 'Americans', 'America', 'USA', 'White House', 'Washington'], 'United Kingdom': ['UK', 'U.K.', 'British', 'Britain', 'England', 'English', 'Scotland', 'Scottish', 'Wales', 'Welsh', 'Downing Street', 'London'], "People's Republic of China": ['China', 'Chinese', 'Beijing'], Russia: ['Russian', 'Kremlin', 'Moscow'], Israel: ['Israeli'], Ukraine: ['Ukrainian', 'Kyiv'], Iran: ['Iranian', 'Tehran'] };
function countryInText(country, text) {
  const names = [country, ...(DEMONYM_EXTRA[country] || [])];
  const entry = lookupPlace(country);
  if (entry) names.push(entry.name, ...(entry.aliases || []), ...(entry.demonyms || []));
  return names.filter(Boolean).some((n) => new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text));
}

// ------------------------------------------------------------------------------------------------ what an item is

const TYPE_EVENT = /\b(?:war|battle|conflict|attack|bombing|shooting|massacre|disaster|earthquake|flood|fire|wildfire|hurricane|cyclone|typhoon|storm|tornado|election|referendum|protest|riot|demonstration|strike action|labor strike|accident|crash|incident|explosion|pandemic|epidemic|outbreak|tournament|championship|season|olympic|festival|ceremony|summit|conference|trial|scandal|crisis|invasion|operation|siege|ceasefire|coup|assassination|genocide|murder|occurrence|event|sports event|recurring event|award|edition)\b/i;
const TYPE_GENERIC = /\b(?:type|class|kind|category|genre|concept|field of study|academic discipline|occupation|profession|position|family name|given name|surname|name|disambiguation|wikimedia|taxon|fruit|food|dish|disease|symptom|chemical|substance|drug|medication|color|colour|emotion|ideology|religion|ethnic group|language|currency|unit|website|software|mobile app|application|web service|social network|online service|search engine|operating system|programming language|video game(?! (?:console|developer|publisher|company|studio))|film|television series|book|album|song|literary work|political party|militant|terrorist|armed group|paramilitary|military unit|armed forces|police|law enforcement|military branch|army|navy|air force)\b/i;
const COUNTRY_TYPE = /\b(?:sovereign state|country|island country|constituent country)\b/i;
const NATURAL_PLACE = /\b(?:mountain|massif|volcano|stratovolcano|glacier|lake|river|island|archipelago|waterfall|canyon|desert|national park|reef|bay|fjord|peninsula|summit|peak|forest|tropical forest|rainforest|ecoregion|biome|wetland|nature reserve)\b/i;
const STRONG_ORG = /\b(?:public company|business|enterprise|corporation|for-profit corporation|technology company|software company|conglomerate|space agency|government agency|independent agency|central bank|intergovernmental organi[sz]ation|international organi[sz]ation|non-governmental organi[sz]ation|airline|automobile manufacturer|aerospace manufacturer|launch service provider|bank|university|stock exchange)\b/i;
const NEVER_THING = /\b(?:political party|militant|terrorist|armed group|armed organization|paramilitary|military unit|armed forces|military branch|army|navy|air force|police|law enforcement agency|intelligence agency|secret service|gang|cartel|criminal organization)\b/i;
const TYPE_PLACE = /\b(?:forest|tropical forest|rainforest|ecoregion|biome|wetland|nature reserve|national park|city|town|village|municipality|capital|country|sovereign state|state of|province|region|county|district|island|archipelago|metropolis|megacity|commune|prefecture|oblast|governorate|territory|federal subject|emirate|canton|borough|neighbourhood|neighborhood|quarter|strip|peninsula|mountain|volcano|lake|river|sea|bay|desert|human settlement|administrative|autonomous|federated state|constituent country|dependent territory|state of the united states|county seat)\b/i;
const TYPE_THING = {
  org: /\b(?:company|business|enterprise|corporation|conglomerate|organization|organisation|agency|institution|authority|bank|ministry|department|court|parliament|legislature|assembly|council|university|college|museum|hospital|airline|manufacturer|automaker|car manufacturer|retailer|chain|brand|newspaper|broadcaster|union|federation|association|foundation|charity|non-governmental|intergovernmental|international organization|alliance|stock exchange|startup|subsidiary|holding|public company|space agency|regulator|regulatory|government agency|central bank|tribunal|observatory)\b/i,
  structure: /\b(?:building|skyscraper|tower|bridge|canal|dam|port|seaport|harbour|harbor|airport|railway station|train station|station|stadium|arena|palace|castle|cathedral|church|mosque|temple|synagogue|monument|memorial|landmark|power station|power plant|nuclear power plant|reactor|pipeline|tunnel|railway line|highway|square|park|reservoir|mine|oil field|refinery|factory|plant|facility|headquarters|embassy|prison|spaceport|launch site|launch complex|observatory|telescope|wall|fortress|government building|office building|official residence)\b/i,
  craft: /\b(?:spacecraft|space probe|space telescope|satellite|rover|lander|space station|rocket|launch vehicle|ship|aircraft carrier|cruise ship|vessel|submarine|locomotive|airliner|aircraft family|aircraft model|automobile model|car model|electric vehicle|vehicle model)\b/i,
  mission: /\b(?:space mission|spaceflight|human spaceflight|crewed spaceflight|space program|space programme|robotic space mission|sample-return mission|lunar mission|mars mission)\b/i,
  product: /\b(?:smartphone|mobile phone model|tablet computer|laptop|computer model|video game console|home console|handheld|consumer electronics|wearable|smartwatch|headset|virtual reality headset|microprocessor|processor|graphics processing unit|product model|camera model|drone model|product line|digital media player|streaming media player|set-top box|smart speaker|e-reader|personal computer|tablet|mobile phone|electric car|automobile|car model|sports car|motorcycle|aircraft type|airliner|business jet|electric aircraft|eVTOL|robot|humanoid robot|robot model)\b/i,
  sky: /\b(?:planet|dwarf planet|natural satellite|moon|moon of|planetary moon|asteroid|comet|star|galaxy|nebula|exoplanet|black hole|interstellar object|minor planet|crater|star cluster|supernova remnant)\b/i,
};

/** What a resolved item is: 'person' | 'place' | 'thing:<kind>' | null (an event, a concept, a name, or unknown). */
export function itemKind(facts, page = {}) {
  const types = (facts?.types || []).join(' | ');
  const desc = `${facts?.desc || ''} ${page?.description || ''}`;
  if ((facts?.types || []).some((t) => t === 'human')) return 'person';
  if (!types) return null;
  for (const [kind, re] of Object.entries(TYPE_THING)) if (kind === 'mission' && re.test(types)) return 'thing:mission';
  if (TYPE_EVENT.test(types) && !/\b(?:spaceflight|space mission)\b/i.test(types)) return null;
  // never an armed group, a party or a force (their pictures are people under arms or at rallies)
  if (NEVER_THING.test(types)) return null;
  // a company is a company even when it is also "an online service" or "a mobile app" (Google, Netflix)
  if (STRONG_ORG.test(types)) return 'thing:org';
  // a living thing (a beaver, a barn owl, a fungus): only ever a story's topic (subjectsOf "topic")
  if ((facts?.types || []).some((t) => /^(?:taxon|species|monotypic taxon|clade)$/i.test(t))) return 'thing:taxon';
  if (TYPE_GENERIC.test(types)) return null;
  if (TYPE_PLACE.test(types) && (facts?.coords || page?.coords)) return 'place';
  for (const [kind, re] of Object.entries(TYPE_THING)) if (re.test(types)) return `thing:${kind}`;
  if (/\b(?:company|corporation|agency|organisation|organization)\b/i.test(desc) && !TYPE_GENERIC.test(desc)) return 'thing:org';
  return null;
}

// ------------------------------------------------------------------------------------------------ the picture itself

// not a photograph: a map, a flag, a logo, a diagram, a drawing, a painting, a render, an artist's impression, a
// collage, a generated image (title, description, categories)
const NOT_PHOTO = /\b(?:satellite (?:image|photo|view|picture)|from space|order of|medals?|decorations|maps?|harta|karte|carte|mapa|kaart|mappa|landkarte|locator|location map|flags?|logos?|logotype|wordmark|coat of arms|emblem|seal of|insignia|crest|diagram|chart|graph|infographic|icon|symbol|svg|drawing|drawn|painting|painted|engraving|etching|lithograph|illustration|illustrated|artist'?s? (?:impression|concept|rendering|depiction|conception)|concept art|render(?:ing|ed)?|cgi|computer[- ]generated|3d model|animation|animated|cartoon|caricature|sketch|poster|stamp|banknote|coin|signature|scan of|collage|montage|photomontage|composite image|mosaic of|ai[- ]generated|generated by (?:ai|artificial intelligence)|text-to-image|image generator|screenshot|mock-?up|simulation|visuali[sz]ation|model of|scale model|replica)\b/i;
const CATEGORY_NOT_PHOTO = /^(?:satellite (?:images?|pictures?|photographs?)|images? from space|orders?,? decorations|medals?|(?:location |locator |relief |political |topographic |old )?maps?|flags?|logos?|coats? of arms|emblems?|seals? of|insignia|diagrams?|charts?|graphs?|infographics?|icons?|symbols? of|svg\b|vector (?:images?|graphics)|drawings?|paintings?|engravings?|etchings?|lithographs?|illustrations?|artist'?s? (?:impressions?|concepts?|renderings?)|concept art|renders?|renderings?|computer[- ]generated|3d (?:models?|renders?|renderings?|computer graphics)|cgi\b|animations?|animated|cartoons?|caricatures?|sketches?|posters?|stamps?|banknotes?|coins?|signatures?|collages?|montages?|photomontages?|composite images?|ai-generated|images generated|screenshots?|mock-?ups?|simulations?|visuali[sz]ations?|scale models?|replicas?|paleoart|life restorations?|reconstructions? of|dinosaur reconstructions?|digital art|pixel art|fan art|clip ?art)\b/i;
const NOT_PHOTO_DESCRIPTION = /\b(?:satellite image|seen from space|from the international space station|true-colou?r image|artist'?s? (?:impression|concept|rendering|depiction|conception)|in this illustration|an illustration|illustration of|life restoration|paleoart|reconstruction of|computer[- ]generated|cgi|3d (?:model|render\w*)|render(?:ing|ed) of|digital (?:art|painting)|drawing of|painting (?:of|by)|oil on canvas|watercolou?r|engraving|lithograph|map of|location map|locator map|diagram|infographic|ai-generated|generated by (?:ai|artificial intelligence)|text-to-image|logo of|coat of arms|flag of)\b/i;
// a picture of an event: never under any story (another flood under a flood story would mislead; so would any)
const EVENT_IN_PICTURE = /\b(?:floods?|flooding|flooded|fires?|wildfires?|blaze|burning|smoke|storms?|hurricane|typhoon|cyclone|tornado|earthquake|tsunami|eruption|erupting|lava|protests?|protesters?|demonstrat\w*|riots?|rally|marchers|strike action|picket|crash|wreck(?:age)?|accident|collision|derail\w*|war|battle|combat|attack|bomb\w*|explosion|missile|shelling|airstrike|ruins?|rubble|destroyed|destruction|damaged?|aftermath|collapse\w*|funeral|mourn\w*|vigil|memorial service|victims?|refugees?|casualt\w*|injured|wounded|corpses?|bodies|evacuat\w*|police|soldiers?|troops|military parade|riot police|arrest\w*)\b/i;
// an occasion (a summit, a ceremony): never the picture of a place or a thing (a portrait may be cropped from one)
const OCCASION_IN_PICTURE = /\b(?:summit|ceremony|inauguration|state visit|signing|conference|congress|convention|meeting|rally|campaign)\b/i;
// a crowd or leisure scene: never under a grave story (and never people the story is not about)
// a searched file's title must say it is a view of the city
const SEARCH_VIEW = /\b(?:skyline|panorama|panoramic|cityscape|aerial|view|views|vista|downtown|waterfront|harbou?r|port|old town|city cent(?:re|er)|centro|square|plaza|platz|street|avenue|boulevard|bridge|from the air|skyscrapers|riverside|promenade|seafront|bay)\b/;
const PEOPLE_IN_PICTURE = /\b(?:presidents?|prime ministers?|ministers?|secretar(?:y|ies)|ambassadors?|consuls?|generals?|gen\.|admirals?|senators?|governors?|mayors?|kings?|queens?|princes?|princess(?:es)?|pope|meet|meets|meeting|met with|visits?|delegations?|officials?|chairman|ceo|portrait of|mr\.?|mrs\.?|dr\.)\b/i;
const CROWD_OR_LEISURE = /\b(?:crowds?|people|tourists?|beach|holiday|vacation|festival|carnival|party|parade|celebrat\w*|fireworks|concert|nightlife|wedding|sunbath\w*|bathers|swimm\w*|fans|spectators|audience|children|kids)\b/i;
const PHOTO_MIME = /^image\/(?:jpeg|png|webp)$/i;
// a picture whose title speaks of others (a meeting, a crowd, a family): never a grave story's portrait of one person
// (the biggest face in it may be someone else's)
// how many pictures of one person the face reader may be asked to read for a grave story
const SOBER_CANDIDATES = 30;
// a public figure's portraits rotate (the coordinator's review of round 7: one portrait of Trump aired twenty times):
// up to this many more of their Commons category's portraits are looked at, and up to PORTRAIT_ALTS kept beside the
// first, each read by the face reader as a portrait of them alone
const PORTRAIT_POOL = 10;
const PORTRAIT_ALTS = 5;
const PORTRAIT_SCAN = 14;
// a rotation's portrait is a recent one, framed as a portrait (a face of a fifth of the height or more): never a
// full-length shot from a match, never the person ten years younger
const PORTRAIT_YEARS = 5;
const PORTRAIT_SHARE = 0.2;
// a picture of a sign, a banner, a cartoon or an effigy of a person, or a campaign's poster: never their portrait
const NOT_A_PORTRAIT = /\b(?:v|vs|versus|match|matches|derby|final|semi-final|cup|league|tournament|championship|sculptures?|bust|busts|banners?|signs?|placards?|posters?|billboards?|graffiti|murals?|effigy|masks?|cartoons?|caricatures?|memes?|stickers?|t-shirts?|statues?|wax|figurines?|protests?|protesters?|rally|rallies|kill|impeach\w*|endorsed|enough|vs|versus|parody|impersonat\w*|lookalike|look-alike)\b/i;
const SOBER_NOT_ALONE = /\b(?:and|y|e|et|ed|und|och|og|entre|avec|mit|con|com|with|meets?|meeting|met|greet\w*|visit\w*|crowds?|pilgrims|audience|faithful|delegation|family|wife|husband|children|kids|students|supporters|fans|people|team|group|cabinet|leaders|summit|ceremony|rally|wedding|funeral|vs|receives?|from|between|together)\b|[&+]/i;

/** Why a Commons file must not air for this subject and story (null when it may). */
export function pictureProblem(file, { kind = 'other', flags = {}, minWidth = null } = {}) {
  if (!file) return 'no file';
  // (a Commons picture, or an institution's own Flickr picture found through Openverse, server/openverse.js)
  if (!file.url || !(COMMONS_MEDIA.test(file.url) || (file.openverse && /^https:\/\/live\.staticflickr\.com\//.test(file.url)))) return 'not a Commons picture';
  if (file.mime && !PHOTO_MIME.test(file.mime) && !/\.(?:jpe?g|png|webp)$/i.test(file.url)) return `format ${file.mime}`;
  // (the size asked of the original; the served picture is Commons' standard rendition of it, 960 or 500 px wide, never
  // narrower than the full shot: nothing is upscaled)
  const w = Number(file.width) || 0;
  const h = Number(file.height) || 0;
  const scale = Math.max(1, (Number(file.origWidth) || 0) / Math.max(1, w));
  const need = minWidth ?? (kind === 'person' ? MIN_WIDTH.person : MIN_WIDTH.other);
  if (w * scale < need || h < 120) return `too small (${w}x${h})`;
  const a = w / Math.max(1, h);
  // what the screen keeps of it: the 16:9 crop (a portrait keeps the head, server focusOf); a place or a thing must keep
  // a good share of its picture and enough pixels for the full shot (a tall tower photo is mostly lost, a panorama's
  // middle is a fine wide shot)
  const cw = Math.min(w, (h * 16) / 9);
  const kept = (cw * ((cw * 9) / 16)) / (w * h);
  if (kind === 'person' ? a < 0.5 || a > 2.4 : kept < 0.35 || cw * scale < need || cw < FULL_SHOT_W) return `shape ${a.toFixed(2)}`;
  const words = `${file.title || ''} | ${file.description || ''} | ${file.categories || ''} | ${file.objectName || ''}`;
  if (file.ai || /\bai-generated|images generated by|pd-algorithm\b/i.test(words)) return 'generated image';
  // the title and the object name say what the file is; a category says it only by its head ("Maps of Lisbon", not
  // "Buildings with flags"); a description may say "a symbol of the city", so only the plain giveaways count there
  const cats = String(file.categories || '').split('|').map((c) => c.trim());
  if (NOT_PHOTO.test(`${file.title || ''} | ${file.objectName || ''}`) || cats.some((c) => CATEGORY_NOT_PHOTO.test(c) || /\b(?:in|as) logos?\b|^logos? of\b|\brecord labels?\b/i.test(c)) || NOT_PHOTO_DESCRIPTION.test(file.description || '')) return 'not a photograph';
  // (a portrait's description often says where it was taken, "at a rally", "greeting the crowd": for a person only its
  // title counts)
  // (a FILE picture of the same actor's earlier event shows that event: server/fileevents.js judges what it shows)
  if (kind === 'event') return null;
  if (EVENT_IN_PICTURE.test(kind === 'person' ? `${file.title || ''}` : `${file.title || ''} | ${file.description || ''} | ${file.objectName || ''}`)) return 'shows an event';
  if (kind !== 'person' && /\b(?:portrait|headshot|selfie)\b/i.test(words)) return 'a portrait under a place or a thing';
  if (kind !== 'person' && OCCASION_IN_PICTURE.test(`${file.title || ''} | ${file.objectName || ''}`)) return 'shows an occasion';
  // a place or a thing shows no one (a consul, a general, a delegation) and no old photograph
  if (kind !== 'person' && PEOPLE_IN_PICTURE.test(`${file.title || ''} | ${file.objectName || ''}`)) return 'people in a picture of a place or a thing';
  if (kind !== 'person' && /\b1[0-8]\d\d\b|\b19[0-8]\ds?\b/.test(`${file.title || ''}`)) return 'an old photograph';
  // (the title as words: "WashMonument_WhiteHouse.jpg" is the White House too)
  const asWords = (t) => String(t || '').replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').replace(/[_-]+/g, ' ');
  if (kind === 'place' && !flags.statecraft && SEAT_OF_GOVERNMENT.test(`${asWords(file.title)} | ${asWords(file.objectName)} | ${file.description || ''}`)) return 'a seat of government under a story not about government';
  if (kind === 'place' && !flags.leisure && CROWD_OR_LEISURE.test(`${file.title || ''} | ${file.description || ''}`)) return 'a crowd or leisure scene under news';
  if (kind === 'place' && /\b(?:interior|inside|vault|altar|crucifix|zoo|museum exhibit|exhibit|statue of|sculpture|animals?|geese|birds?|dogs?|cats?|food|dish|menu|restaurant|hotel room)\b/i.test(`${file.title || ''} | ${file.description || ''}`)) return 'not a view of the place';
  if (kind !== 'person' && flags.grave && CROWD_OR_LEISURE.test(`${file.title || ''} | ${file.description || ''}`)) return 'a crowd or leisure scene under a grave story';
  return null;
}

const US_FEDERAL = /^(?:u\.?s\.? (?:navy|army|air force|space force|marine corps|coast guard)|noaa|usgs|fema|department of defense|dod|national park service|nps)$/i;
const THIRD_PARTY = /\b(?:esa|csa|jaxa|spacex|boeing|roscosmos|getty|reuters|ap\b|afp|blue origin|northrop|lockheed|ula|rocket lab|axiom|sierra|university|institute|stsci|aura)\b/i;
/**
 * NASA's own article picture (its feed, its page) when the picture's own credit names NASA: public domain under NASA's
 * guidelines. Only an explicit credit counts (media:credit, JSON-LD): the site's name alone proves nothing (NASA pages
 * carry SpaceX's and ESA's pictures too, credited in their captions).
 */
export function nasaOwnPicture(story, { now = Date.now() } = {}) {
  const pic = story?.outletPicture || (story && !story.imageRights ? story : null);
  const url = pic?.image;
  if (!/^NASA\b/i.test(String(story?.source || '')) || !url || !/^https:\/\/(?:[\w-]+\.)*nasa\.gov\//i.test(url)) return null;
  const own = pic.imageCredits?.[url];
  const credit = own ? (/^(?:media:credit|jsonld|html)$/.test(own[1]) ? own[0] : null) : /^(?:media:credit|jsonld|html)$/.test(pic.imageCreditVia || '') ? pic.imageCredit : null;
  if (!credit) return null;
  const parties = String(credit).split(/\s*[/,;&]\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
  // a US federal agency's own picture on a NASA page (the Navy's divers at an Artemis splashdown) is public domain too
  const federal = parties.length === 1 && US_FEDERAL.test(parties[0]);
  if (!parties.length || (!federal && !(/^nasa\b/i.test(parties[0]) || NASA_CREDIT_OK.test(parties[0]))) || parties.slice(1).some((x) => THIRD_PARTY.test(x))) return null;
  const rights = federal
    ? rightsRecord({ source: 'us-government', via: 'nasa:article', licence: 'PD-USGov', author: credit, title: story.title, page: story.link || null, url, checkedAt: now })
    : rightsRecord({ source: 'nasa', via: 'nasa:article', licence: 'NASA-MUG', author: credit, title: story.title, page: story.link || null, url, checkedAt: now });
  return rights.cleared ? { url, width: Number(pic.imageWidth) || 0, height: 0, tier: 0.5, kind: 'official', subject: { kind: 'nasa', label: 'NASA' }, focus: 0.4, rights } : null;
}

/** NASA image library item -> a candidate (null when it is not a NASA photograph the desk may air). */
const NASA_NOT_PHOTO = /\b(?:poster|graphic|infographic|illustration|illustrated|artist|concept|render(?:ing)?|animation|animated|visuali[sz]ation|logo|patch|insignia|emblem|chart|diagram|map|model|simulation|cgi|computer[- ]generated|mock-?up|drawing|painting|artwork|art\b|collage|montage|composite|graphic novel|comic|screenshot|slide|presentation|template|wallpaper|banner|sticker|decal|badge)\b/i;
const NASA_CREDIT_OK = /^(?:nasa|jpl|jpl-caltech|caltech|goddard|gsfc|kennedy|ksc|johnson|jsc|marshall|msfc|ames|arc|glenn|grc|langley|larc|armstrong|afrc|stennis|ssc|wallops|nasa earth observatory|nasa's [\w ]+)$/i;
export function nasaItem(item, { query = '', storyAt = Date.now() } = {}) {
  const d = item?.data?.[0];
  if (!d || d.media_type !== 'image' || !d.nasa_id) return null;
  const text = `${d.title || ''} | ${d.description || ''} | ${(d.keywords || []).join(', ')}`;
  if (NASA_NOT_PHOTO.test(text)) return null;
  // its credit: the photographer field, then "Credit:" lines; every party named must be NASA's own
  const credit = strip(d.photographer || d.secondary_creator || '');
  const named = [credit, ...[...String(d.description || '').matchAll(/(?:image |photo |video )?credits?:\s*([^.\n]{2,80})/gi)].map((m) => m[1])].filter((x) => x && !/^n\/a$/i.test(x));
  for (const c of named) {
    const parties = c.split(/\s*[/,;&]\s*|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
    // "NASA/Joel Kowsky": NASA, then the photographer's name (a person's name after NASA is NASA's photographer)
    if (!/^nasa\b/i.test(parties[0] || '') && !NASA_CREDIT_OK.test(parties[0] || '')) return null;
    if (parties.slice(1).some((p) => THIRD_PARTY.test(p))) return null;
  }
  const q = fold(query);
  if (q && !fold(`${d.title} ${(d.keywords || []).join(' ')}`).includes(q)) return null;
  const links = item.links || [];
  const large = links.find((l) => /~large\.(?:jpe?g|png)$/i.test(l.href || ''))?.href || links.find((l) => /~medium\.(?:jpe?g|png)$/i.test(l.href || ''))?.href || null;
  if (!large || !/^https:\/\/images-assets\.nasa\.gov\//.test(large.replace(/ /g, '%20'))) return null;
  const created = Date.parse(d.date_created || '') || null;
  // the picture of the event itself: the mission named in its title, taken in the two days before the story
  const event = !!(created && q && fold(d.title).includes(q) && storyAt - created >= -DAY && storyAt - created <= 2 * DAY);
  return {
    url: large.replace(/ /g, '%20'),
    nasaId: d.nasa_id,
    title: strip(d.title),
    description: strip(d.description).slice(0, 300),
    author: credit && !/^n\/a$/i.test(credit) ? credit : 'NASA',
    page: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
    created,
    event,
  };
}

// ------------------------------------------------------------------------------------------------ the desk

const SPACE_WORDS = /\b(?:nasa|space|spacecraft|rocket|launch|orbit|astronaut|moon|lunar|mars|martian|jupiter|saturn|venus|mercury|neptune|uranus|pluto|asteroid|comet|telescope|hubble|webb|iss|space station|rover|probe|artemis|satellite|galaxy|nebula|planet|solar|sun|eclipse|meteor)\b/i;
const FAMILY_OF = (kind) => (kind === 'person' ? 'portrait' : kind === 'place' ? 'place' : 'subject');

export class PictureDesk {
  /**
   * @param o.dir        where answers and decisions are kept (data/pictures)
   * @param o.wikimedia  a WikimediaClient (shared with the image search); o.nasa a PacedJson for NASA's library
   * @param o.search     the Commons FILE-photo search (server/imagesearch.js ImageSearch), optional
   * @param o.mode       'cleared' (default) | 'preview' (outlet photos may stand in, never published)
   */
  constructor({ dir = null, wikimedia = null, nasa = null, search = null, faces = null, openverse = null, mode = 'cleared', enabled = true, now = () => Date.now(), log = console, fetchImpl = globalThis.fetch, contact } = {}) {
    this.now = now;
    this.log = log;
    this.mode = pictureMode(mode);
    this.enabled = !!enabled;
    this.wm = wikimedia || new WikimediaClient({ fetchImpl, now, log, ...(contact ? { contact } : {}) });
    this.nasa = nasa || new PacedJson({ fetchImpl, now });
    this.search = search;
    // the face reader's verdicts (server/faces.js; tools/pictures/faces.mjs writes them): a grave story's portrait airs
    // only once read as sober
    this.faces = faces;
    // Openverse (server/openverse.js): institutions' own Flickr pictures, their accounts and licences checked; its day's
    // count kept with the desk's answers
    this.openverse = openverse;
    this.kept = new KeptAnswers({ file: dir ? path.join(dir, 'answers.json') : null, now, log });
    if (this.openverse && !this.openverse.store) this.openverse.store = this.kept;
    this.busy = Promise.resolve(); // decisions run one at a time
    this.failedUrls = new Map(); // url -> until
    this.warned = new Map(); // a warning's kind -> [last logged, how many since]
    // stories whose lean decision found no usable Wikidata portrait: their person's own category and searches next time
    this.expand = new Set();
    this.titlesOf = new Map(); // a story's key -> the exact titles its decision asks Wikipedia for
  }

  // ---------------------------------------------------------------- the questions (batched, kept)

  /** English Wikipedia pages for these exact titles: { title -> page | null } (null: no article, kept as such). */
  async pages(titles) {
    const out = new Map();
    const ask = [];
    for (const t of new Set(titles)) {
      const k = `t:${t}`;
      if (this.kept.has(k)) out.set(t, this.kept.get(k));
      else ask.push(t);
    }
    for (const part of chunks(ask, 50)) {
      const u = new URL(ENWIKI);
      for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: part.join('|'), prop: 'pageprops|description|coordinates|categories', ppprop: 'wikibase_item|disambiguation', clcategories: 'Category:Living people', cllimit: 'max', colimit: 'max', coprimary: 'primary' })) u.searchParams.set(k, v);
      let data;
      try {
        data = await this.wm.json(u.toString());
      } catch (err) {
        this.warn(`titles: ${err.message}`);
        break;
      }
      const q = data?.query || {};
      const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
      const redir = new Map((q.redirects || []).map((r) => [r.from, r]));
      const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
      for (const t of part) {
        let title = norm.get(t) || t;
        const r = redir.get(title);
        let fragment = null;
        if (r) {
          title = r.to;
          fragment = r.tofragment || null;
        }
        const p = byTitle.get(title);
        const page =
          !p || p.missing || p.invalid
            ? null
            : {
                title: p.title,
                qid: p.pageprops?.wikibase_item || null,
                description: p.description || '',
                disambiguation: p.pageprops ? 'disambiguation' in p.pageprops : false,
                coords: p.coordinates?.[0] ? { lat: p.coordinates[0].lat, lon: p.coordinates[0].lon } : null,
                living: (p.categories || []).some((c) => c.title === 'Category:Living people'),
                redirected: !!r,
                fragment,
              };
        out.set(t, this.kept.set(`t:${t}`, page, TTL.title));
      }
    }
    return out;
  }

  /** Wikidata facts of these items (one SPARQL query per 40): { qid -> facts | null }. */
  async facts(qids) {
    const out = new Map();
    const ask = [];
    for (const id of new Set(qids.filter((x) => /^Q\d+$/.test(x || '')))) {
      const k = `q:${id}`;
      if (this.kept.has(k)) out.set(id, this.kept.get(k));
      else ask.push(id);
    }
    for (const part of chunks(ask, 40)) {
      const query = `SELECT ?item (SAMPLE(?d) AS ?desc) (GROUP_CONCAT(DISTINCT ?instL; separator="|") AS ?inst) (GROUP_CONCAT(DISTINCT STR(?img); separator="|") AS ?imgs) (SAMPLE(?b) AS ?born) (SAMPLE(?dd) AS ?died) (SAMPLE(?links) AS ?sitelinks) (GROUP_CONCAT(DISTINCT ?occL; separator="|") AS ?occ) (GROUP_CONCAT(DISTINCT ?posL; separator="|") AS ?pos) (GROUP_CONCAT(DISTINCT ?ctyL; separator="|") AS ?cty) (SAMPLE(?c) AS ?coord) (GROUP_CONCAT(DISTINCT STR(?logo); separator="|") AS ?logos) (GROUP_CONCAT(DISTINCT STR(?aerial); separator="|") AS ?aerials) (SAMPLE(?cat_) AS ?commonsCat) (GROUP_CONCAT(DISTINCT STR(?cap_); separator="|") AS ?caps) WHERE {
  VALUES ?item { ${part.map((i) => `wd:${i}`).join(' ')} }
  OPTIONAL { ?item schema:description ?d FILTER(LANG(?d) = "en") }
  OPTIONAL { ?item wdt:P31 ?inst_ . ?inst_ rdfs:label ?instL FILTER(LANG(?instL) = "en") }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P569 ?b }
  OPTIONAL { ?item wdt:P570 ?dd }
  OPTIONAL { ?item wikibase:sitelinks ?links }
  OPTIONAL { ?item wdt:P106 ?occ_ . ?occ_ rdfs:label ?occL FILTER(LANG(?occL) = "en") }
  OPTIONAL { ?item wdt:P39 ?pos_ . ?pos_ rdfs:label ?posL FILTER(LANG(?posL) = "en") }
  OPTIONAL { { ?item wdt:P27 ?cty_ } UNION { ?item wdt:P17 ?cty_ } ?cty_ rdfs:label ?ctyL FILTER(LANG(?ctyL) = "en") }
  OPTIONAL { ?item wdt:P625 ?c }
  OPTIONAL { ?item wdt:P154 ?logo }
  OPTIONAL { ?item wdt:P8592 ?aerial }
  OPTIONAL { ?item wdt:P373 ?cat_ }
  OPTIONAL { ?item wdt:P36 ?cap_ }
} GROUP BY ?item`;
      let data;
      try {
        data = await this.wm.json(`${WDQS}?format=json&query=${encodeURIComponent(query)}`, { accept: 'application/sparql-results+json' });
      } catch (err) {
        this.warn(`items: ${err.message}`);
        break;
      }
      const got = new Map();
      for (const b of data?.results?.bindings || []) {
        const id = String(b.item?.value || '').split('/').pop();
        const list = (k) => (b[k]?.value ? b[k].value.split('|').filter(Boolean) : []);
        const files = (k) => list(k).map((u) => `File:${decodeURIComponent(u.split('/Special:FilePath/').pop() || '').replace(/_/g, ' ')}`).filter((f) => f.length > 5);
        const pt = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord?.value || '');
        got.set(id, {
          qid: id,
          desc: b.desc?.value || '',
          types: list('inst'),
          images: files('imgs'),
          logos: files('logos'),
          aerials: files('aerials'),
          born: b.born?.value ? Date.parse(b.born.value) || null : null,
          died: b.died?.value ? Date.parse(b.died.value) || true : null,
          sitelinks: Number(b.sitelinks?.value) || 0,
          occupations: list('occ').slice(0, 30),
          positions: list('pos').slice(0, 40),
          countries: list('cty').slice(0, 6),
          coords: pt ? { lat: Number(pt[2]), lon: Number(pt[1]) } : null,
          // (asked in the same query, round 9: a person's Commons category and a country's capitals cost no request
          // of their own; a record kept before has neither, and commonsCats/capitals ask for it then)
          commonsCat: b.commonsCat?.value || null,
          capitals: list('caps').map((u) => u.split('/').pop()).filter((x) => /^Q\d+$/.test(x)).slice(0, 2),
        });
      }
      for (const id of part) out.set(id, this.kept.set(`q:${id}`, got.get(id) || null, TTL.entity));
    }
    return out;
  }

  /** The Commons categories of these items (P373, one SPARQL query per 40, kept): { qid -> category name }. */
  async commonsCats(qids) {
    const out = new Map();
    const ask = [];
    for (const id of new Set(qids.filter((x) => /^Q\d+$/.test(x || '')))) {
      const f = this.kept.get(`q:${id}`);
      if (this.kept.has(`cc:${id}`)) out.set(id, this.kept.get(`cc:${id}`));
      else if (f && f.commonsCat !== undefined) out.set(id, f.commonsCat);
      else ask.push(id);
    }
    for (const part of chunks(ask, 40)) {
      const query = `SELECT ?item (SAMPLE(?c) AS ?cat) WHERE { VALUES ?item { ${part.map((i) => `wd:${i}`).join(' ')} } OPTIONAL { ?item wdt:P373 ?c } } GROUP BY ?item`;
      let data;
      try {
        data = await this.wm.json(`${WDQS}?format=json&query=${encodeURIComponent(query)}`, { accept: 'application/sparql-results+json' });
      } catch (err) {
        this.warn(`categories: ${err.message}`);
        break;
      }
      const got = new Map((data?.results?.bindings || []).map((b) => [String(b.item?.value || '').split('/').pop(), b.cat?.value || null]));
      for (const id of part) out.set(id, this.kept.set(`cc:${id}`, got.get(id) || null, TTL.entity));
    }
    return out;
  }

  /** The newest files of a Commons category (kept): [file title] | null (could not ask). */
  async categoryFiles(cat) {
    const k = `cf:${cat}`;
    if (this.kept.has(k)) return this.kept.get(k);
    const u = new URL(COMMONS);
    for (const [key, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', list: 'categorymembers', cmtitle: `Category:${cat}`, cmtype: 'file', cmlimit: '50', cmsort: 'timestamp', cmdir: 'desc' })) u.searchParams.set(key, v);
    try {
      const data = await this.wm.json(u.toString());
      const titles = (data?.query?.categorymembers || []).map((m) => m.title).filter((t) => /\.(?:jpe?g|png|webp)$/i.test(t));
      return this.kept.set(k, titles, TTL.entity);
    } catch (err) {
      this.warn(`category files: ${err.message}`);
      return null;
    }
  }

  /** The capitals of these countries (P36, one SPARQL query per 40, kept): { qid -> [capital qid] }. */
  async capitals(qids) {
    const out = new Map();
    const ask = [];
    for (const id of new Set(qids)) {
      const f = this.kept.get(`q:${id}`);
      if (this.kept.has(`c:${id}`)) out.set(id, this.kept.get(`c:${id}`));
      else if (f && Array.isArray(f.capitals)) out.set(id, f.capitals);
      else ask.push(id);
    }
    for (const part of chunks(ask, 40)) {
      const query = `SELECT ?item ?cap WHERE { VALUES ?item { ${part.map((i) => `wd:${i}`).join(' ')} } ?item wdt:P36 ?cap }`;
      let data;
      try {
        data = await this.wm.json(`${WDQS}?format=json&query=${encodeURIComponent(query)}`, { accept: 'application/sparql-results+json' });
      } catch (err) {
        this.warn(`capitals: ${err.message}`);
        break;
      }
      const got = new Map();
      for (const b of data?.results?.bindings || []) {
        const id = String(b.item?.value || '').split('/').pop();
        const cap = String(b.cap?.value || '').split('/').pop();
        if (/^Q\d+$/.test(cap)) got.set(id, [...(got.get(id) || []), cap].slice(0, 2));
      }
      for (const id of part) out.set(id, this.kept.set(`c:${id}`, got.get(id) || [], TTL.entity));
    }
    return out;
  }

  /** Commons metadata of these files (50 a request): { 'File:X' -> file | null }. */
  async files(titles) {
    const out = new Map();
    const ask = [];
    for (const t of new Set(titles)) {
      const k = `f:${t}`;
      // (a record kept before renditions were asked for keeps its original's URL: the standard rendition is used)
      if (this.kept.has(k)) out.set(t, withRendition(this.kept.get(k)));
      else ask.push(t);
    }
    for (const part of chunks(ask, 50)) {
      const u = new URL(COMMONS);
      for (const [k, v] of Object.entries({ action: 'query', format: 'json', formatversion: '2', titles: part.join('|'), prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', iiextmetadatafilter: 'Artist|Credit|LicenseShortName|License|LicenseUrl|UsageTerms|AttributionRequired|Restrictions|Categories|ImageDescription|DateTimeOriginal|ObjectName|NonFree' })) u.searchParams.set(k, v);
      let data;
      try {
        data = await this.wm.json(u.toString());
      } catch (err) {
        this.warn(`files: ${err.message}`);
        break;
      }
      const q = data?.query || {};
      const norm = new Map((q.normalized || []).map((n) => [n.from, n.to]));
      const byTitle = new Map((q.pages || []).map((p) => [p.title, p]));
      for (const t of part) out.set(t, this.kept.set(`f:${t}`, fileFromCommons(byTitle.get(norm.get(t) || t), { now: this.now() }), TTL.file));
    }
    return out;
  }

  /** NASA's image library for a subject (kept a day): the raw items. */
  async nasaSearch(q) {
    const k = `n:${q}`;
    if (this.kept.has(k)) return this.kept.get(k);
    const u = new URL(NASA);
    u.searchParams.set('q', q);
    u.searchParams.set('media_type', 'image');
    u.searchParams.set('page_size', '40');
    try {
      const data = await this.nasa.json(u.toString());
      const items = (data?.collection?.items || []).slice(0, 40).map((it) => ({ data: [it.data?.[0]].filter(Boolean).map((d) => ({ nasa_id: d.nasa_id, title: d.title, description: String(d.description || '').slice(0, 1200), keywords: d.keywords, date_created: d.date_created, media_type: d.media_type, photographer: d.photographer, secondary_creator: d.secondary_creator, center: d.center })), links: (it.links || []).map((l) => ({ href: l.href })) }));
      return this.kept.set(k, items, TTL.nasa);
    } catch (err) {
      this.warn(`nasa: ${err.message}`);
      return null;
    }
  }

  /** The Commons FILE-photo search (place and structure) with each result's rights. */
  async commonsSearch(q, { limit = 12 } = {}) {
    const k = limit === 12 ? `s:${q}` : `s${limit}:${q}`;
    if (this.kept.has(k)) return (this.kept.get(k) || []).map(withRendition);
    if (!this.search?.searchFiles) return null;
    try {
      const list = await this.search.searchFiles(q, { limit });
      if (!list) return null;
      return this.kept.set(k, list, TTL.search).map(withRendition);
    } catch (err) {
      this.warn(`search: ${err.message}`);
      return null;
    }
  }

  // a warning of each kind once in ten minutes, with how many there were since (round 9: five warnings a lifetime left the
  // live station's log silent on why it aired no picture for an hour)
  warn(msg) {
    const kind = String(msg).split(':')[0];
    const t = this.now();
    const [at, since] = this.warned.get(kind) || [-Infinity, 0];
    if (t - at < 10 * 60_000) return void this.warned.set(kind, [at, since + 1]);
    this.warned.set(kind, [t, 0]);
    this.log.warn?.(`[pictures] ${msg}${since ? ` (and ${since} more since)` : ''}`);
  }

  // ---------------------------------------------------------------- the decision

  /** The candidates of a story: its exact subjects and its place, as titles to resolve. */
  plan(story) {
    const flags = storyFlags(story);
    const subjects = subjectsOf(story);
    const loc = locate(flags.title, flags.summary);
    const place = loc?.entry && !loc.entry.broad ? loc.entry : null;
    const placeTitles = place ? placeTitlesOf(place) : [];
    // where the headline names the place (its word, after a kicker): a place's picture only when the headline opens on
    // it ("Jamaica accepts...", "Crowds throng New Delhi"), not for a place met at its end ("...across UAE")
    const head = headlineOf(flags.title);
    const hit = place ? findPlaces(head).find((h) => h.entry === place || h.entry?.name === place.name) : null;
    const placeAt = hit ? (head.slice(0, hit.index).match(TOKEN) || []).length : null;
    // a state acting ("Russia arrests...", "France seizes..."): a story about government, as a minister's would be
    if (hit && placeAt === 0 && STATE_ACT.test((head.slice(hit.index + hit.text.length).match(TOKEN) || [])[0] || '')) flags.statecraft = true;
    return { flags, subjects, place, placeTitles, loc, placeInHeadline: !!hit, placeAt };
  }

  /**
   * Decide the pictures of these stories (kept, so a story is decided once in its lifetime unless a source was down).
   * Returns Map(id -> decision). Never throws; a step that could not be asked leaves its stories undecided. Decisions
   * run one at a time (a second call finds what the first kept and asks nothing twice).
   */
  decide(stories, opts = {}) {
    const job = this.busy.then(() => this.decideNow(stories, opts));
    this.busy = job.catch(() => {});
    return job;
  }

  async decideNow(stories, { budgetMs = 8000, lean = false } = {}) {
    const deadline = this.now() + budgetMs;
    const result = new Map();
    const todo = [];
    // a decision made while a source did not answer is decided again (only what is missing is asked); until then its
    // picture stands
    const standing = new Map();
    for (const s of stories || []) {
      if (!s?.id || s.local) continue;
      const kept = this.kept.get(`d:${keyOf(s)}`);
      if (kept && kept.complete !== false) result.set(s.id, kept);
      else {
        if (kept) standing.set(s.id, kept);
        todo.push(s);
      }
    }
    if (!this.enabled) for (const [id, d] of standing) result.set(id, d);
    if (!todo.length || !this.enabled) return result;
    const plans = new Map(todo.map((s) => [s.id, this.plan(s)]));
    // 1. exact titles -> pages; 2. pages -> Wikidata facts; 3. candidate files -> Commons metadata
    const titles = [...plans.values()].flatMap((p) => [...p.subjects.map((c) => c.text), ...p.placeTitles]);
    const pages = await this.pages(titles);
    const qids = [...pages.values()].filter((p) => p?.qid && !p.disambiguation && !p.fragment).map((p) => p.qid);
    const facts = await this.facts(qids);
    const options = new Map();
    for (const s of todo) options.set(s.id, this.options(s, plans.get(s.id), pages, facts));
    // a country whose own picture may be a map or a satellite view: its capital's picture as the next choice
    const countries = [...options.values()].flat().filter((o) => o.country && o.qid);
    if (countries.length) {
      const caps = await this.capitals(countries.map((o) => o.qid));
      const capFacts = await this.facts([...caps.values()].flat());
      for (const o of countries) {
        for (const cq of caps.get(o.qid) || []) {
          const cf = capFacts.get(cq);
          if (cf) o.files.push(...[...(cf.aerials || []).slice(0, 1), ...(cf.images || []).slice(0, 2)].filter((x) => !(cf.logos || []).includes(x) && !o.files.includes(x)));
        }
      }
    }
    // a portrait that must be sober (a grave story): the person's own Commons category adds candidates after the Wikidata
    // picture (the face reader picks a sober one)
    // (and any public figure the desk may show: a few more from their own Commons category, so their portrait rotates)
    // lean (the ahead queue, server/pictureahead.js; round 9): a public figure's rotation is looked for once they recur
    // (aired in the last day, their uses kept, or twice in this batch). The first story of anyone airs their Wikidata
    // portrait; their category and searches, four requests or more a person and most of a decision's cost, wait until
    // they matter. Never for a sober portrait, a person with no Wikidata picture, or a story whose portrait failed
    const leanSkipped = new Set();
    const seenIn = new Map();
    for (const opts of options.values()) for (const qid of new Set(opts.filter((o) => o.kind === 'person' && o.qid).map((o) => o.qid))) seenIn.set(qid, (seenIn.get(qid) || 0) + 1);
    const expanding = new Set(todo.filter((s) => this.expand.has(keyOf(s))).map((s) => s.id));
    const recurring = (qid) => (seenIn.get(qid) || 0) > 1 || Object.keys(this.kept.get(`u:${qid}`) || {}).length > 0;
    for (const [id, opts] of options) {
      for (const o of opts) if (lean && o.kind === 'person' && !o.refused && o.qid && !o.sober && o.files.length && !recurring(o.qid) && !expanding.has(id)) leanSkipped.add(o);
    }
    const soberOpts = [...options.values()].flat().filter((o) => o.kind === 'person' && !o.refused && o.qid && !leanSkipped.has(o));
    if (soberOpts.length) {
      const cats = await this.commonsCats(soberOpts.map((o) => o.qid));
      for (const o of soberOpts) {
        const cap = o.sober ? SOBER_CANDIDATES : o.files.length + PORTRAIT_POOL;
        const name = o.label.replace(/\s*\([^)]*\)\s*$/, '');
        const surname = fold(name).split(' ').pop();
        // (a picture of one person: never one whose title speaks of others, a crowd or a meeting)
        // (nor one of a sign, a banner or a cartoon of them: "Kill Trump banner", "Haven't We Had Enough of Donald Trump")
        const alone = (t) => fold(t).includes(surname) && !SOBER_NOT_ALONE.test(String(t).replace(/^File:/, '').replace(/[_-]+/g, ' ')) && !NOT_A_PORTRAIT.test(String(t).replace(/^File:/, '').replace(/[_-]+/g, ' '));
        const cat = cats.get(o.qid);
        // (a file found by search, outside their own category, names them in full: "Melania Trump" is not Donald Trump)
        // (a middle initial may stand between: "Donald J. Trump")
        const words = fold(name).split(/\s+/).filter(Boolean);
        const fullName = new RegExp(`\\b${words[0].replace(/[^a-z0-9]/g, '')}\\b(?:\\s+\\S+)?\\s+${words[words.length - 1].replace(/[^a-z0-9]/g, '')}\\b`);
        const named = (t) => (words.length > 1 && fullName.test(fold(t))) || fold(t).includes(fold(name)) || (!!cat && fold(t).includes(fold(cat)));
        const listed = cat ? await this.categoryFiles(cat) : [];
        // (a rotation's portrait from their category names them in full too: a category keeps anything about them)
        for (const t of listed || []) if (alone(t) && (o.sober || named(t)) && !o.files.includes(t) && o.files.length < Math.min(cap, o.sober ? 10 : cap)) o.files.push(t);
        // and the person's photographs on Commons by the category's own name when it differs ("Leo XIV" for Pope Leo
        // XIV, whose files say so) and by name (a category often keeps them in subcategories by year, and its own files
        // may be anything: banners, cartoons); a public figure who smiles in most pictures (the Pope) needs many read
        // before a sober one is found; a rotation needs a few
        const most = o.sober ? SOBER_CANDIDATES : cap;
        // (a rotation wants recent portraits: the most relevant files of a famous name are often years old, so the
        // year and the year before are asked too)
        const year = new Date(this.now()).getUTCFullYear();
        // (a one-word name, "Raye", is searched for a sober portrait only: a rotation never takes a stranger of that name)
        const queries = [...(cat && fold(cat) !== fold(name) ? [`"${cat}"`] : []), ...(o.sober || words.length > 1 ? [`"${name}"`] : []), ...(o.sober || words.length < 2 ? [] : [`"${name}" ${year}`, `"${name}" ${year - 1}`])];
        for (const q of queries) {
          if (o.files.length >= most) break;
          const found = await this.commonsSearch(q, { limit: 30 });
          for (const f of found || []) {
            if (!alone(f.title) || !named(f.title) || o.files.includes(f.title) || o.files.length >= most) continue;
            if (!this.kept.has(`f:${f.title}`)) this.kept.set(`f:${f.title}`, f, TTL.file);
            o.files.push(f.title);
          }
        }
      }
    }
    const wanted = [];
    for (const opts of options.values()) for (const o of opts) wanted.push(...o.files);
    const files = await this.files(wanted);
    // everything the decision needed was answered (a pause or a timeout leaves a story undecided, asked again later)
    const answered = (plan, opts) => {
      const titles = [...plan.subjects.map((c) => c.text), ...plan.placeTitles];
      if (!titles.every((t) => this.kept.has(`t:${t}`))) return false;
      for (const t of titles) {
        const pg = this.kept.get(`t:${t}`);
        if (pg?.qid && !pg.disambiguation && !pg.fragment && !this.kept.has(`q:${pg.qid}`)) return false;
      }
      return opts.every((o) => (!o.country || this.kept.has(`c:${o.qid}`) || Array.isArray(this.kept.get(`q:${o.qid}`)?.capitals)) && o.files.every((f) => this.kept.has(`f:${f}`)));
    };
    for (const s of todo) {
      const plan = plans.get(s.id);
      const opts = options.get(s.id);
      const picks = [];
      // NASA's own article: its own picture, when its credit names NASA (public domain, NASA's guidelines)
      const nasaOwn = nasaOwnPicture(s, { now: this.now() });
      if (nasaOwn) picks.push(nasaOwn);
      let altsPending = false;
      for (const o of opts) {
        o.rejected = [];
        let primary = null;
        let scanned = 0;
        const stems = new Set();
        for (const f of o.files) {
          // (beside a portrait already found: its rotation's other portraits, a few files looked at at most)
          if (primary && ++scanned > PORTRAIT_SCAN) break;
          const file = files.get(f);
          const problem = pictureProblem(file, { kind: o.kind === 'person' ? 'person' : o.kind === 'place' ? 'place' : 'other', flags: plan.flags });
          if (problem) {
            o.rejected.push({ file: f, problem, licence: file?.licence || file?.licenceName || null });
            continue;
          }
          const rights = rightsRecord({ source: 'wikimedia-commons', via: o.via, licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, subject: { kind: o.kind, qid: o.qid, label: o.label }, checkedAt: this.now() });
          if (!rights.cleared) {
            o.rejected.push({ file: f, problem: `rights: ${rights.why}`, licence: file.licence || file.licenceName || null });
            continue;
          }
          if (primary) {
            // (another crop or another frame of the same picture is no other portrait: "Foto oficial de Lula (ombros)")
            const stem = pictureStem(file.title);
            if (stems.has(stem)) {
              o.rejected.push({ file: f, problem: 'the same picture again' });
              continue;
            }
            const when = fileYear(file, this.now());
            if (!when || when.year < new Date(this.now()).getUTCFullYear() - PORTRAIT_YEARS) {
              o.rejected.push({ file: f, problem: when ? `an old portrait (${when.year})` : 'a portrait of no known date' });
              continue;
            }
          }
          // a grave story's portrait: only one the face reader read as sober (one face, big enough, no smile); a
          // portrait for the rotation beside the first: only one it read as a portrait of them alone
          if (o.sober || primary) {
            const v = this.faces?.verdict(file.url) || null;
            if (!v) {
              this.faces?.want(file.url, `${o.sober ? 'sober portrait' : 'portrait'}: ${o.label}`);
              // (a rotation's portrait not read yet holds nothing up: the first one airs meanwhile)
              if (primary) altsPending = true;
              else o.awaiting = (o.awaiting || 0) + 1;
              o.rejected.push({ file: f, problem: 'expression not read yet' });
              continue;
            }
            // (a rotation's portrait: theirs alone, no other face at all: "Lula and Tony Blair" reads as one face too often)
            if ((o.sober && !v.sober) || (primary && (!portraitOf(v, PORTRAIT_SHARE) || v.faces !== 1)) || (!o.sober && !primary && !portraitOf(v))) {
              o.rejected.push({ file: f, problem: o.sober ? `not a sober portrait: ${v.why}` : `not a portrait of one person: ${v.why || 'face too small'}` });
              continue;
            }
          }
          const pick = { url: file.url, width: file.width, height: file.height, tier: o.tier, kind: FAMILY_OF(o.kind), subject: { kind: o.kind, qid: o.qid, label: o.label, how: o.how || null }, focus: focusOf(o.kind, file.width, file.height), rights };
          stems.add(pictureStem(file.title));
          if (!primary) {
            primary = pick;
            picks.push(pick);
            if (o.kind !== 'person') break;
            continue;
          }
          (primary.alts ||= []).push({ url: pick.url, width: pick.width, height: pick.height, focus: pick.focus, rights });
          if (primary.alts.length >= PORTRAIT_ALTS) break;
        }
        if (picks.length >= 3) break;
      }
      // (a portrait waiting for the face reader: decided again once it has read them)
      const waiting = !picks.some((p) => p.tier <= 1) && opts.some((o) => o.awaiting);
      const known = answered(plan, opts);
      // (a lean decision whose person's Wikidata portrait would not do: their category and searches at the next try)
      const skipped = opts.filter((o) => leanSkipped.has(o));
      const short = skipped.length && !picks.some((p) => p.tier <= Math.min(...skipped.map((o) => o.tier)));
      if (short) this.expand.add(keyOf(s));
      else this.expand.delete(keyOf(s));
      if (this.expand.size > 2000) this.expand.delete(this.expand.values().next().value);
      result.set(s.id, { picks, options: opts, plan: { flags: plan.flags, place: plan.place?.label || null, subjects: plan.subjects.map((c) => c.text) }, complete: known && !waiting && !short, awaitingFaces: known && waiting, ...(altsPending ? { altsPending: true } : {}), ...(lean ? { lean: true } : {}) });
    }
    // 3b. a grave story's public figure whose Commons pictures were all read and none is sober: an institution's own
    // Flickr picture of them (Openverse), read by the face reader too
    for (const s of todo) {
      if (!this.openverse || this.now() > deadline) break;
      const d = result.get(s.id);
      if (d.picks.some((p) => p.tier <= 1.2)) continue;
      const o = (options.get(s.id) || []).find((x) => x.sober && !x.awaiting);
      if (!o) continue;
      const pick = await this.openversePortrait(s, o);
      if (pick?.awaiting) {
        if (!d.picks.length) {
          d.awaitingFaces = d.complete;
          d.complete = false;
        }
      } else if (pick) d.picks.unshift(pick);
    }
    // 4. NASA's library for a space story whose subject gave no picture (before the place: the desk's order);
    // 5. the Commons FILE photo of the place or structure, for a story still without any
    for (const s of todo) {
      if (this.now() > deadline) break;
      const d = result.get(s.id);
      const plan = plans.get(s.id);
      if (d.picks.length && d.picks[0].tier <= 2) continue;
      // a company or a product with no usable picture of its own on Wikidata: a Commons FILE photo of it (its
      // headquarters, its shop, the product itself), named so in the file
      const own = await this.subjectSearchPick(s, plan, options.get(s.id));
      if (own === undefined) d.complete = d.awaitingFaces = false;
      else if (own) {
        d.picks.unshift(own);
        continue;
      }
      const nasa = await this.nasaPick(s, plan, options.get(s.id));
      if (nasa === undefined) d.complete = d.awaitingFaces = false;
      else if (nasa) d.picks.unshift(nasa);
      // a FILE picture of the same named actor doing the same kind of thing ("FILE 2023"), before a place's picture
      if (!d.picks.some((p) => p.tier < 3.8)) {
        const ev = await this.fileEventPick(s, plan, pages, facts);
        if (ev === undefined) d.complete = d.awaitingFaces = false;
        else if (ev?.awaiting) {
          if (!d.picks.length) {
            d.awaitingFaces = d.complete;
            d.complete = false;
          }
        } else if (ev) d.picks.unshift(ev);
      }
      // a story about government: the seat of the government or the legislature it names, before its country's
      // capital ("US lawmakers unveil bill": the Capitol, not the White House across the Mall)
      const first = d.picks[0];
      const countryPlace = !!first && first.kind === 'place' && (options.get(s.id) || []).some((o) => o.country && o.qid === first.subject?.qid);
      if (!d.picks.length || countryPlace) {
        const seat = await this.seatPick(s, plan);
        if (seat === undefined) d.complete = d.awaitingFaces = false;
        else if (seat) d.picks.unshift(seat);
      }
      if (d.picks.length || plan.flags.harm) continue;
      const living = await this.topicSearchPick(s, plan, options.get(s.id));
      if (living === undefined) d.complete = d.awaitingFaces = false;
      else if (living) {
        d.picks.push(living);
        continue;
      }
      const found = await this.searchPick(s, plan);
      if (found === undefined) d.complete = d.awaitingFaces = false;
      else if (found) d.picks.push(found);
    }
    for (const s of todo) {
      const d = result.get(s.id);
      if (!d.complete && !d.picks.length) {
        if (standing.has(s.id)) result.set(s.id, standing.get(s.id));
        continue; // asked again next time
      }
      d.at = this.now();
      // (a portrait rotation the face reader has still to read: decided again within the hour, its first portrait airing)
      this.kept.set(`d:${keyOf(s)}`, d, !d.complete ? TTL.partial : d.altsPending && d.picks.length ? HOUR : d.picks.length ? TTL.decided : TTL.none);
    }
    this.kept.save();
    return result;
  }

  /** The story's options in the desk's order: [{ kind, tier, qid, label, files, via, how }]. */
  options(story, plan, pages, facts) {
    const { flags, subjects, place, placeTitles } = plan;
    const text = `${flags.title} ${flags.summary}`;
    const opts = [];
    const seenQ = new Set();
    for (const c of subjects) {
      const page = pages.get(c.text);
      if (!page || page.disambiguation || page.fragment || !page.qid || seenQ.has(page.qid)) continue;
      const f = facts.get(page.qid);
      if (!f) continue;
      const kind = itemKind(f, page);
      if (!kind) continue;
      const images = (f.images || []).filter((x) => !(f.logos || []).includes(x));
      // a topic in plain words: only a living thing or a body in space, early in the headline, never where people
      // were harmed (a shark under a shark-attack story), and the article the very word leads to
      if (c.how === 'topic') {
        if (!/^thing:(?:taxon|sky)$/.test(kind) || flags.harm || c.start > 8) continue;
        if (!fold(page.title).startsWith(fold(c.text).slice(0, 4))) continue;
        seenQ.add(page.qid);
        opts.push({ kind, tier: 3.5, qid: page.qid, label: page.title, files: images.slice(0, 2), via: 'wikidata:P18', how: 'topic' });
        continue;
      }
      if (kind === 'thing:taxon') continue; // a living thing is only ever a story's topic
      seenQ.add(page.qid);
      if (kind === 'person') {
        const obituary = isObituary({ candidate: c, page, facts: f, flags, now: this.now() });
        const why = personProblem({ candidate: c, page, facts: f, flags, text, now: this.now(), obituary });
        if (why) {
          // (a public figure no longer living, named in full as their article: their name may still stand on the board)
          opts.push({ kind, tier: 0, qid: page.qid, label: page.title, files: [], via: 'wikidata:P18', refused: why, about: page.description || null, ...(why === NOT_LIVING && namedAsArticle(c, page, f, text) ? { named: true } : {}) });
          continue;
        }
        const role = roleAgreement(text, f, { sport: flags.sport }) || (c.how === 'surname' && c.surname ? surnameRole(c.surname) : null) || (obituary ? { family: 'obituary', how: 'obituary' } : null);
        // a grave story: a portrait only of the public figure it is about (they speak about it, they lead the response;
        // or the obituary of a public figure), and only a picture the face reader found sober: their usual picture is
        // often a smile (Mamdani grinning under "ICE agents who shot man in New York", the hand check of 17 Oct). Never
        // the accused (personProblem), never a private person, never a victim of violence
        if (flags.harm || flags.grave || obituary) {
          const grave = graveProblem({ facts: f, role, flags, obituary });
          if (grave) {
            opts.push({ kind, tier: 0, qid: page.qid, label: page.title, files: [], via: 'wikidata:P18', refused: grave, about: page.description || null });
            continue;
          }
          opts.push({ kind, tier: 1, qid: page.qid, label: page.title, files: images.slice(0, 2), via: 'wikidata:P18', how: obituary ? 'obituary' : role.how, sober: true, about: page.description || null });
          continue;
        }
        opts.push({ kind, tier: 1, qid: page.qid, label: page.title, files: images.slice(0, 2), via: 'wikidata:P18', how: role.how, about: page.description || null });
      } else if (kind.startsWith('thing:')) {
        const why = thingProblem({ candidate: c, page, facts: f, flags, kind, text });
        if (why) {
          opts.push({ kind, tier: 0, qid: page.qid, label: page.title, files: [], via: 'wikidata:P18', refused: why, about: page.description || null });
          continue;
        }
        opts.push({ kind, tier: 2, qid: page.qid, label: page.title, files: [...images.slice(0, 2), ...(f.aerials || []).slice(0, 1)], via: 'wikidata:P18', about: page.description || null });
      } else if (kind === 'place' && !flags.harm && !flags.grave && !flags.sport && !flags.disaster && c.start <= PLACE_EARLY) {
        // a place the headline opens on (what the story is about: "Jamaica accepts..."), as the gazetteer knows it (or
        // the story's own place), confirmed by the item's coordinates; never a city's postcard under a story about nature
        // (a natural region the gazetteer also knows, the Amazon, the Sahara: by its own article, where the gazetteer puts it)
        const gaz = lookupPlace(c.text);
        const natural = NATURAL_PLACE.test((f.types || []).join(' | ')) && !!(f.coords || page.coords) && (!gaz || (gaz.kind === 'region' && near(gaz, f.coords || page.coords)));
        const entry = natural ? null : gaz || (place && near(place, f.coords || page.coords) ? place : null);
        // (a country's picture is its capital's: never when the headline is about a place within it, "Indonesia's Bali";
        // a city met only in the summary does not count)
        const within = entry && entry.kind === 'country' && plan.placeInHeadline && place && place !== entry && place.kind !== 'country';
        if (entry && !entry.broad && !within && !flags.environment && near(entry, f.coords || page.coords)) opts.push({ kind, tier: 4, qid: page.qid, label: page.title, files: [...(f.aerials || []).slice(0, 1), ...images.slice(0, 2)], via: 'wikidata:P18', ...(COUNTRY_TYPE.test((f.types || []).join(' | ')) ? { country: true } : {}) });
        // a natural landmark named early in the headline ("Mont Blanc loses more than a metre"): its own picture, by its
        // exact article (the gazetteer knows countries and cities, not every mountain)
        else if (natural) opts.push({ kind, tier: 4, qid: page.qid, label: page.title, files: [...(f.aerials || []).slice(0, 1), ...images.slice(0, 2)], via: 'wikidata:P18' });
      }
    }
    // the story's place (gazetteer), confirmed by coordinates: never under a grave story (the map tells it soberly)
    // (only a place the headline names: a place met in the summary is rarely what the story is about)
    if (place && !flags.harm && !flags.grave && !flags.sport && !flags.disaster && !flags.environment && plan.placeInHeadline && plan.placeAt <= PLACE_EARLY) {
      for (const t of placeTitles) {
        const page = pages.get(t);
        if (!page || page.disambiguation || page.fragment || !page.qid || seenQ.has(page.qid)) continue;
        const f = facts.get(page.qid);
        if (!f || itemKind(f, page) !== 'place' || !near(place, f.coords || page.coords)) continue;
        seenQ.add(page.qid);
        opts.push({ kind: 'place', tier: 4, qid: page.qid, label: page.title, files: [...(f.aerials || []).slice(0, 1), ...(f.images || []).slice(0, 2)].filter((x) => !(f.logos || []).includes(x)), via: 'wikidata:P18', ...(COUNTRY_TYPE.test((f.types || []).join(' | ')) ? { country: true } : {}) });
        break;
      }
    }
    // people first (the story is about them), then things, then the place; within a tier, headline order
    // people first (the story is about them), then a specific thing (a product, a craft, a mission, a structure, a body in
    // space) before an organisation (Hubble before NASA, HomePod before Apple), then the place; else headline order
    const rank = (o) => (o.tier || 9) + (o.kind === 'thing:org' ? 0.5 : 0);
    return opts.sort((a, b) => rank(a) - rank(b));
  }

  /** A Commons FILE photo of the story's company or product when Wikidata has none (undefined: could not ask). */
  async subjectSearchPick(story, plan, opts) {
    if (!this.search?.searchFiles || plan.flags.harm) return null;
    const o = (opts || []).find((x) => /^thing:(?:org|product|craft|structure)$/.test(x.kind) && x.tier === 2 && !x.refused);
    if (!o) return null;
    const label = o.label.replace(/\s*\([^)]*\)\s*$/, '').replace(/,? (?:Inc|plc|Ltd|LLC|Corporation|Corp|Group|Holdings|Company)\.?$/i, '').trim();
    if (label.length < 3) return null;
    const q = o.kind === 'thing:org' ? `${label} headquarters` : label;
    const list = await this.commonsSearch(q);
    if (list === null) return undefined;
    const name = fold(label);
    for (const file of list) {
      const words = fold(`${file.title} ${file.description}`);
      if (!words.includes(name)) continue;
      if (!new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(fold(String(file.title || '').replace(/[_-]+/g, ' ')))) continue;
      if (o.kind === 'thing:org' && !/\b(?:headquarters|head office|hq|campus|offices?|building|tower|store|shop|factory|plant|works|centre|center)\b/.test(fold(String(file.title || '')))) continue;
      if (pictureProblem(file, { kind: 'other', flags: plan.flags })) continue;
      const rights = rightsRecord({ source: 'wikimedia-commons', via: 'commons:search', licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, subject: { kind: o.kind, qid: o.qid, label: o.label }, checkedAt: this.now() });
      if (!rights.cleared) continue;
      return { url: file.url, width: file.width, height: file.height, tier: 2.5, kind: 'subject', subject: { kind: o.kind, qid: o.qid, label: o.label, how: 'commons search' }, focus: 0.4, rights };
    }
    return null;
  }

  /**
   * A Commons photograph of a living thing the story is about when its Wikidata picture is not one (a drawing of a fish,
   * a collage of three apes): the file's title names it (undefined: could not ask; null: nothing fits).
   */
  async topicSearchPick(story, plan, opts) {
    if (!this.search?.searchFiles || plan.flags.harm) return null;
    const o = (opts || []).find((x) => x.kind === 'thing:taxon' && x.how === 'topic' && !x.refused);
    if (!o) return null;
    const label = o.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (label.length < 3) return null;
    const list = await this.commonsSearch(label);
    if (list === null) return undefined;
    const name = fold(label);
    const named = new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(?![\\p{L}])`, 'u');
    for (const file of list) {
      if (!named.test(fold(String(file.title || '').replace(/[_-]+/g, ' ')))) continue;
      // a living thing, alive: never a museum's specimen, a skeleton or a fossil
      if (/\b(?:museum|specimen|skeleton|skull|taxiderm\w*|mounted|stuffed|fossil|preserved|collection of)\b/i.test(`${file.title || ''} | ${file.description || ''}`)) continue;
      if (pictureProblem(file, { kind: 'other', flags: plan.flags })) continue;
      const rights = rightsRecord({ source: 'wikimedia-commons', via: 'commons:search', licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, subject: { kind: o.kind, qid: o.qid, label: o.label }, checkedAt: this.now() });
      if (!rights.cleared) continue;
      return { url: file.url, width: file.width, height: file.height, tier: 3.6, kind: 'subject', subject: { kind: o.kind, qid: o.qid, label: o.label, how: 'commons search' }, focus: 0.4, rights };
    }
    return null;
  }

  /**
   * An actor's names (its Wikidata labels in eight languages, its English aliases) and its Commons category (one SPARQL
   * query per 40, kept): { qid -> { names, cat } }; null when Wikidata could not be asked.
   */
  async actorNames(qids) {
    const out = new Map();
    const ask = [];
    for (const id of new Set(qids.filter((x) => /^Q\d+$/.test(x || '')))) {
      if (this.kept.has(`an:${id}`)) out.set(id, this.kept.get(`an:${id}`));
      else ask.push(id);
    }
    for (const part of chunks(ask, 40)) {
      const query = `SELECT ?item (GROUP_CONCAT(DISTINCT ?l; separator="|") AS ?labels) (GROUP_CONCAT(DISTINCT ?a; separator="|") AS ?aliases) (SAMPLE(?c) AS ?cat) WHERE { VALUES ?item { ${part.map((i) => `wd:${i}`).join(' ')} } OPTIONAL { ?item rdfs:label ?l FILTER(LANG(?l) IN ("en","fr","de","es","it","pt","nl","pl")) } OPTIONAL { ?item skos:altLabel ?a FILTER(LANG(?a) = "en") } OPTIONAL { ?item wdt:P373 ?c } } GROUP BY ?item`;
      let data;
      try {
        data = await this.wm.json(`${WDQS}?format=json&query=${encodeURIComponent(query)}`, { accept: 'application/sparql-results+json' });
      } catch (err) {
        this.warn(`actor names: ${err.message}`);
        return null;
      }
      const got = new Map((data?.results?.bindings || []).map((b) => [String(b.item?.value || '').split('/').pop(), { names: [...new Set([...(b.labels?.value || '').split('|'), ...(b.aliases?.value || '').split('|')].filter((x) => x && x.length <= 80))].slice(0, 30), cat: b.cat?.value || null }]));
      for (const id of part) out.set(id, this.kept.set(`an:${id}`, got.get(id) || { names: [], cat: null }, TTL.entity));
    }
    return out;
  }

  /**
   * A FILE picture of the same named actor doing the same kind of thing the headline says it does (server/fileevents.js):
   * a movement or a union protesting, a union on strike, a legislature sitting, a bloc's summit; labelled FILE and its
   * year. undefined: could not ask; { awaiting: true }: under a grave story, a picture the face reader has not read yet.
   */
  async fileEventPick(story, plan, pages, facts) {
    if (!this.search?.searchFiles) return null;
    const action = storyAction(plan.flags);
    if (!action) return null;
    const actors = [];
    for (const c of plan.subjects) {
      if (c.start > 6 || c.how === 'topic') continue;
      const page = pages.get(c.text);
      if (!page?.qid || page.disambiguation || page.fragment || actors.some((a) => a.qid === page.qid)) continue;
      const kind = actorKind(facts.get(page.qid));
      if (kind && action.actors.includes(kind)) actors.push({ qid: page.qid, label: page.title, written: c.text, kind });
    }
    if (!actors.length) return null;
    const known = await this.actorNames(actors.map((a) => a.qid));
    if (!known) return undefined;
    const storyAt = Number(story.published || story.at) || this.now();
    const grave = plan.flags.grave || plan.flags.harm;
    let awaiting = false;
    for (const a of actors.slice(0, 2)) {
      const k = known.get(a.qid) || { names: [] };
      const names = [a.label.replace(/\s*\([^)]*\)\s*$/, ''), a.written, ...k.names, ...(k.cat ? [k.cat] : [])];
      const list = await this.commonsSearch(eventQuery(a.written, action), { limit: 30 });
      if (list === null) return undefined;
      for (const file of list) {
        if (eventFileProblem(file, { names, action, storyAt })) continue;
        if (pictureProblem(file, { kind: 'event', flags: plan.flags })) continue;
        const when = fileYear(file, storyAt);
        const rights = rightsRecord({ source: 'wikimedia-commons', via: `commons:file-${action.id}`, licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, year: when.year, subject: { kind: 'event', qid: a.qid, label: a.label }, checkedAt: this.now() });
        if (!rights.cleared) continue;
        // a grave story: no private person's face in the foreground (the face reader's verdict)
        if (grave) {
          const v = this.faces?.verdict(file.url) || null;
          if (!v) {
            this.faces?.want(file.url, `FILE ${action.id}: ${a.label}`);
            awaiting = true;
            continue;
          }
          if (v.foreground) continue;
        }
        return { url: file.url, width: file.width, height: file.height, tier: 3.8, kind: 'event', subject: { kind: 'event', qid: a.qid, label: a.label, how: `FILE ${action.id} ${when.year}` }, focus: 0.45, rights };
      }
      // an institution's own Flickr pictures of it (Openverse: a parliament's sittings, a government's summit)
      for (const r of (await this.openverseFind(eventQuery(a.written, action).replace(/"/g, ''))) || []) {
        if (!openverseTrust(r, { storyAt }).tier) continue;
        const file = this.openverseFile(r);
        if (eventFileProblem(file, { names, action, storyAt }) || pictureProblem(file, { kind: 'event', flags: plan.flags })) continue;
        const when = fileYear(file, storyAt);
        const rights = rightsRecord({ source: 'flickr', via: `openverse:file-${action.id}`, licence: r.licence, author: r.creator, title: r.title, page: r.page, url: r.url, year: when.year, subject: { kind: 'event', qid: a.qid, label: a.label }, checkedAt: this.now() });
        if (!rights.cleared) continue;
        if (grave) {
          const v = this.faces?.verdict(r.url) || null;
          if (!v) {
            this.faces?.want(r.url, `FILE ${action.id} (Openverse): ${a.label}`);
            awaiting = true;
            continue;
          }
          if (v.foreground) continue;
        }
        return { url: r.url, width: r.width, height: r.height, tier: 3.8, kind: 'event', subject: { kind: 'event', qid: a.qid, label: a.label, how: `FILE ${action.id} ${when.year} (${INSTITUTIONS.get(r.account)})` }, focus: 0.45, rights };
      }
    }
    return awaiting ? { awaiting: true } : null;
  }

  /**
   * The seat of the government or the legislature of the country a story about government names first (its Wikidata
   * picture, FILE): undefined: could not ask; null: no seat for this story.
   */
  async seatPick(story, plan) {
    const seat = seatFor(plan.flags);
    if (!seat) return null;
    const pages = await this.pages([seat.title]);
    const page = pages.get(seat.title);
    if (!page) return this.kept.has(`t:${seat.title}`) ? null : undefined;
    if (!page.qid || page.disambiguation || page.fragment) return null;
    const f = (await this.facts([page.qid])).get(page.qid);
    if (!f) return this.kept.has(`q:${page.qid}`) ? null : undefined;
    const titles = [...(f.images || []).slice(0, 2), ...(f.aerials || []).slice(0, 1)].filter((x) => !(f.logos || []).includes(x));
    const files = await this.files(titles);
    for (const t of titles) {
      const file = files.get(t);
      if (!file && !this.kept.has(`f:${t}`)) return undefined;
      if (pictureProblem(file, { kind: 'place', flags: { ...plan.flags, statecraft: true } })) continue;
      const rights = rightsRecord({ source: 'wikimedia-commons', via: 'wikidata:P18', licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, subject: { kind: 'thing:structure', qid: page.qid, label: page.title }, checkedAt: this.now() });
      if (!rights.cleared) continue;
      return { url: file.url, width: file.width, height: file.height, tier: 4.5, kind: 'institution', subject: { kind: 'thing:structure', qid: page.qid, label: page.title, how: `seat of the ${seat.kind} (${seat.country})` }, focus: 0.4, rights };
    }
    return null;
  }

  /** Openverse's Flickr results for a query, the institutions' only (kept a week): [result] | null (could not ask). */
  async openverseFind(q) {
    if (!this.openverse) return [];
    const k = `ov:${q}`;
    if (this.kept.has(k)) return this.kept.get(k);
    const list = await this.openverse.search(q, { extra: { source: 'flickr' } });
    if (list === null) return null;
    return this.kept.set(k, list.filter((r) => INSTITUTIONS.has(r.account || '')).slice(0, 20), 7 * DAY);
  }

  /** An Openverse result as the desk's file record (for pictureProblem and the face reader). */
  openverseFile(r) {
    return { openverse: true, url: r.url, width: r.width, height: r.height, origWidth: r.width, title: r.title, description: (r.tags || []).join(', '), categories: '', objectName: '', mime: 'image/jpeg' };
  }

  /**
   * A sober portrait of a grave story's public figure from an institution's own Flickr account (Openverse): one person
   * named in the title, read by the face reader (undefined/null: none; { awaiting: true }: not read yet).
   */
  async openversePortrait(story, o) {
    const name = o.label.replace(/\s*\([^)]*\)\s*$/, '');
    const surname = fold(name).split(' ').pop();
    const list = await this.openverseFind(name);
    if (!list) return null;
    const storyAt = Number(story.published || story.at) || this.now();
    let awaiting = false;
    for (const r of list) {
      if (!fold(r.title).includes(surname) || SOBER_NOT_ALONE.test(r.title)) continue;
      const trust = openverseTrust(r, { storyAt });
      if (!trust.tier) continue;
      const file = this.openverseFile(r);
      if (pictureProblem(file, { kind: 'person' })) continue;
      const rights = rightsRecord({ source: 'flickr', via: 'openverse:flickr', licence: r.licence, author: r.creator, title: r.title, page: r.page, url: r.url, subject: { kind: 'person', qid: o.qid, label: o.label }, checkedAt: this.now() });
      if (!rights.cleared) continue;
      const v = this.faces?.verdict(r.url) || null;
      if (!v) {
        this.faces?.want(r.url, `sober portrait (Openverse): ${o.label}`);
        awaiting = true;
        continue;
      }
      if (!v.sober) continue;
      return { url: r.url, width: r.width, height: r.height, tier: 1.2, kind: 'portrait', subject: { kind: 'person', qid: o.qid, label: o.label, how: `${o.how || 'grave story'}; ${trust.why}` }, focus: focusOf('person', r.width, r.height), rights };
    }
    return awaiting ? { awaiting: true } : null;
  }

  /** NASA's library for a space story (undefined: could not ask; null: nothing fits). */
  async nasaPick(story, plan, opts) {
    const { flags } = plan;
    const text = `${flags.title} ${flags.summary}`;
    if (flags.harm || !SPACE_WORDS.test(text)) return null;
    // the query: the subject the story is about (a mission, a craft, a body in space), else nothing
    const subject = (opts || []).find((o) => /^thing:(?:mission|craft|sky)$/.test(o.kind) || (o.kind === 'thing:org' && /\bnasa\b/i.test(o.label || '')));
    const q = subject?.label?.replace(/\s*\([^)]*\)\s*$/, '') || null;
    if (!q || /^NASA$/i.test(q)) return null;
    const items = await this.nasaSearch(q);
    if (items === null) return undefined;
    const storyAt = Number(story.published || story.at) || this.now();
    const ok = items.map((it) => nasaItem(it, { query: q, storyAt })).filter(Boolean);
    // the newest photograph first (a mission's latest), its event pictures before file pictures
    ok.sort((a, b) => Number(b.event) - Number(a.event) || (b.created || 0) - (a.created || 0));
    const best = ok[0];
    if (!best) return null;
    const rights = rightsRecord({ source: 'nasa', via: 'nasa:images', licence: 'NASA-MUG', author: best.author, title: best.title, page: best.page, url: best.url, label: best.event ? 'EVENT' : 'FILE', subject: { kind: subject.kind, qid: subject.qid, label: subject.label }, checkedAt: this.now() });
    if (!rights.cleared) return null;
    return { url: best.url, width: 0, height: 0, tier: 3, kind: 'official', subject: { kind: subject.kind, qid: subject.qid, label: subject.label }, focus: 0.4, rights };
  }

  /** A Commons FILE photo of the story's place or structure (undefined: could not ask; null: nothing fits). */
  /**
   * A Commons FILE photo of the story's city or of the structure it names (undefined: could not ask; null: nothing
   * fits). Strict, after round 1 of the critique (a Japanese city hall for "US", a Buenos Aires metro station for
   * "Florida station", geese at Delhi zoo): a city only (never a country or a region: their own Wikidata picture is
   * curated, a free-text search is not), named in the headline; the file's title names the city with its whole name and
   * says it is a view of it (or names the structure); its country appears in its description or categories; no
   * people, no old photograph, no interior, no leisure scene under news.
   */
  async searchPick(story, plan) {
    if (!this.search?.searchFiles || plan.flags.harm || plan.flags.sport || plan.flags.disaster) return null;
    const place = plan.place;
    if (!place || place.kind !== 'city' || !plan.placeInHeadline || plan.placeAt > PLACE_EARLY || plan.flags.environment || plan.flags.grave) return null;
    const fq = fileQuery(story);
    if (!fq) return null;
    const q = fq.subject ? `${place.name} ${fq.subject}` : place.name;
    const list = await this.commonsSearch(q);
    if (list === null) return undefined;
    const word = (w) => new RegExp(`(?<![\\p{L}])${fold(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u');
    const nameRe = word(place.name);
    const subjectRe = fq.subject ? word(fq.subject) : null;
    const country = place.country ? lookupPlace(place.country) : null;
    const countryNames = country ? [country.name, ...(country.aliases || []), ...(country.demonyms || [])] : [];
    for (const file of list) {
      const title = fold(String(file.title || '').replace(/^File:/, '').replace(/[_-]+/g, ' '));
      if (!nameRe.test(title)) continue;
      if (subjectRe ? !subjectRe.test(title) : !SEARCH_VIEW.test(title)) continue;
      const about = fold(`${file.title} ${file.description} ${file.categories || ''}`);
      if (countryNames.length && !countryNames.some((n) => word(n).test(about))) continue;
      if (pictureProblem(file, { kind: 'place', flags: plan.flags })) continue;
      const rights = rightsRecord({ source: 'wikimedia-commons', via: 'commons:search', licence: file.licence, author: file.author, title: file.title, page: file.page, url: file.url, restrictions: file.restrictions, ai: file.ai, subject: { kind: 'place', label: q }, checkedAt: this.now() });
      if (!rights.cleared) continue;
      return { url: file.url, width: file.width, height: file.height, tier: 5, kind: 'place', subject: { kind: 'place', label: q }, focus: 0.4, rights };
    }
    return null;
  }

  // ---------------------------------------------------------------- the stories

  /** The cleared picture decided for a story now (the first that has not failed), or null. */
  /**
   * The named actor of a story without a picture, for its board's wordmark (public/js/boardspec.js): { name, about }, or
   * null (boardActorOf).
   */
  boardActor(story) {
    const d = story?.id ? this.kept.get(`d:${keyOf(story)}`) : null;
    if (!d) return null;
    return boardActorOf(d, { page: (t) => (this.kept.has(`t:${t}`) ? this.kept.get(`t:${t}`) : undefined), title: story.title, summary: story.summary });
  }

  pickFor(story) {
    const d = story?.id ? this.kept.get(`d:${keyOf(story)}`) : null;
    const t = this.now();
    const pick = d?.picks?.find((p) => !(this.failedUrls.get(p.url) > t)) || null;
    if (!pick?.alts?.length) return pick;
    // a portrait that rotates: the one this story was given (rotate), as long as it may still air
    const chosen = this.kept.get(`p:${keyOf(story)}`);
    const alt = chosen && chosen !== pick.url ? pick.alts.find((a) => a.url === chosen && !(this.failedUrls.get(a.url) > t)) : null;
    return alt ? { ...pick, ...alt, alts: pick.alts, rotated: true } : pick;
  }

  /**
   * The portraits of one public figure rotate across the day: each story of an episode keeps the portrait it was given
   * (what airs never changes under it); a story new to the air is given that person's portrait aired longest ago, never
   * one another story of this episode shows. (The producer still takes off a file that two stories of an episode would
   * both show: server/producer.js.) Called with an episode's stories, in their order, before they are applied.
   */
  rotate(stories) {
    const t = this.now();
    const taken = new Set();
    const fresh = [];
    const aired = [];
    for (const s of stories || []) {
      if (!s?.id || s.local) continue;
      const pick = this.pickFor(s);
      if (!pick) continue;
      if (pick.alts?.length && !this.kept.get(`p:${keyOf(s)}`)) fresh.push([s, pick]);
      else {
        taken.add(pick.url);
        // (a person with one portrait so far is remembered too: once they recur, the lean desk looks for their others)
        if (pick.alts?.length || pick.subject?.kind === 'person') aired.push(pick);
      }
    }
    const used = (who) => {
      const u = this.kept.get(`u:${who}`) || {};
      return Object.fromEntries(Object.entries(u).filter(([, at]) => t - at < DAY));
    };
    const remember = (pick) => {
      const who = pick.subject?.qid || pick.subject?.label || '';
      if (who) this.kept.set(`u:${who}`, { ...used(who), [pick.url]: t }, DAY);
    };
    for (const pick of aired) remember(pick);
    for (const [s, pick] of fresh) {
      const who = pick.subject?.qid || pick.subject?.label || '';
      const u = used(who);
      const pool = [pick, ...pick.alts].filter((p) => !(this.failedUrls.get(p.url) > t));
      const order = new Map(pool.map((p, i) => [p.url, i]));
      const free = pool.filter((p) => !taken.has(p.url));
      const best = (free.length ? free : pool).sort((a, b) => (u[a.url] || 0) - (u[b.url] || 0) || order.get(a.url) - order.get(b.url))[0];
      if (!best) continue;
      taken.add(best.url);
      this.kept.set(`p:${keyOf(s)}`, best.url, TTL.decided);
      remember({ ...pick, url: best.url });
    }
  }

  /**
   * Put the decision on the story: s.image is the cleared picture (with s.imageRights, its credit and its focus), or
   * nothing. The outlet's own photo is kept aside (s.outletPicture) and comes back only in 'preview' mode.
   */
  apply(story) {
    if (!story) return null;
    // a story of the operator's own local feed keeps its own picture (never looked for on the web)
    if (story.local) {
      if (story.image && !currentRights(story)) story.imageRights = operatorRecord(story, { checkedAt: this.now() });
      return null;
    }
    const pick = this.pickFor(story);
    const ours = currentRights(story);
    // no decision kept (an archived story told days ago, a decision past its lifetime): a picture that already carries
    // its own cleared record stays as it is
    if (!pick && ours?.cleared && ours.source !== 'outlet' && !this.kept.has(`d:${keyOf(story)}`) && !(this.failedUrls.get(ours.url) > this.now())) return null;
    // the news desk's own picture (the feed's, the page's, a lender's): kept aside, never aired by default
    if (story.image && !(ours && ours.source !== 'outlet')) {
      story.outletPicture = { image: story.image, ...pick5(story) };
    }
    const clear = () => {
      for (const k of PICTURE_FIELDS) delete story[k];
      story.image = null;
    };
    if (pick) {
      clear();
      story.image = pick.url;
      story.imageWidth = pick.width || 0;
      story.imageVia = `cleared:${pick.rights.via || pick.rights.source}`;
      story.imageKind = pick.rights.label === 'EVENT' ? 'event' : 'file';
      story.imageCredit = pick.rights.credit;
      story.imageCreditVia = 'rights';
      story.imageRights = pick.rights;
      story.imageFocus = pick.focus;
      if (pick.subject?.kind === 'person') story.imageFit = 'portrait';
      story.imageSubject = pick.subject?.label || null;
      return pick;
    }
    if (this.mode === 'preview' && story.outletPicture?.image) {
      clear();
      Object.assign(story, story.outletPicture);
      story.imageRights = outletRecord(story, { checkedAt: this.now() });
      return null;
    }
    clear();
    return null;
  }

  /**
   * Would deciding this story ask Wikipedia (an exact title not kept yet)? After a 429 from Wikipedia, the ahead queue
   * waits the pause out like any other, then decides first the stories that need nothing from it.
   */
  asksWikipedia(story) {
    if (!story?.id || story.local) return false;
    const k = keyOf(story);
    let titles = this.titlesOf.get(k);
    if (!titles) {
      const p = this.plan(story);
      titles = [...p.subjects.map((c) => c.text), ...p.placeTitles];
      this.titlesOf.set(k, titles);
      if (this.titlesOf.size > 4000) this.titlesOf.delete(this.titlesOf.keys().next().value);
    }
    return titles.some((t) => !this.kept.has(`t:${t}`));
  }

  /** Have this story's exact titles been worked out already (asksWikipedia answers at once)? undefined when not. */
  titlesKnown(story) {
    return story?.id && this.titlesOf.has(keyOf(story)) ? true : undefined;
  }

  /** The decision kept for a story (data/pictures/answers.json, with its lifetime), or null. */
  decisionOf(story) {
    return story?.id && !story.local ? this.kept.get(`d:${keyOf(story)}`) || null : null;
  }

  /** May the producer use this story's decision now: one made in full, or one with a picture while a source is asked again? */
  ready(story) {
    const d = this.decisionOf(story);
    return !!d && (d.complete !== false || !!d.picks?.length);
  }

  /** Does this story still want deciding (none kept, or one made while a source did not answer or the face reader had not read)? */
  needs(story) {
    if (!story?.id || story.local) return false;
    const d = this.decisionOf(story);
    return !d || d.complete === false;
  }

  /**
   * Decide (within the budget) and apply: the stories carry only cleared pictures afterwards. With `ready` (the ahead
   * queue decides in the background: server/pictureahead.js), nothing is asked: the decisions already kept are applied.
   */
  async assign(stories, { budgetMs = 6000, ready = false } = {}) {
    const list = (stories || []).filter(Boolean);
    if (!ready) {
      let timer;
      const work = this.decide(list, { budgetMs }).catch((err) => {
        this.warn(`decide: ${err.message}`);
        return null;
      });
      await Promise.race([work, new Promise((r) => (timer = setTimeout(r, budgetMs)))]);
      clearTimeout(timer);
    }
    const stats = { stories: list.length, cleared: 0, portrait: 0, subject: 0, place: 0, official: 0, preview: 0, none: 0 };
    this.rotate(list);
    for (const s of list) {
      const pick = this.apply(s);
      if (pick) {
        stats.cleared++;
        stats[pick.kind] = (stats[pick.kind] || 0) + 1;
      } else if (s.image) stats.preview++;
      else stats.none++;
    }
    return stats;
  }

  /** A cleared picture that would not download: the next one of the story, or none (for half an hour, a day if lasting). */
  failed(story, reason = '') {
    const url = story?.image;
    if (url) this.failedUrls.set(url, this.now() + (/HTTP 4\d\d|too small|too large|shape|unreadable|not a picture|content type|invalid/i.test(String(reason)) ? DAY : HOUR / 2));
    if (this.failedUrls.size > 2000) this.failedUrls.delete(this.failedUrls.keys().next().value);
    return this.apply(story);
  }
}

/** A Commons file record whose URL is its original: the same record with its standard rendition (imagesearch.js). */
function withRendition(f) {
  if (!f) return f;
  // (and its licence read again by the desk's current reading: a licence the desk learnt since, the Free Art License)
  if (!f.licence && f.licenceName) f = { ...f, licence: licenceOf(f.licenceName) };
  // an original's URL (upload.wikimedia.org/…/commons/a/ab/Name.jpg, not /thumb/): its standard rendition, sized from the
  // original's own width (a record may carry the width that was asked, not the original's)
  if (!f.url || !/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/[0-9a-f]\//.test(f.url)) return f;
  const ow = Number(f.origWidth) || Number(f.width) || 0;
  const oh = f.width && f.height ? Math.round((ow * f.height) / f.width) : Number(f.height) || 0;
  const std = standardRendition({ url: f.url, width: ow, height: oh });
  return std ? { ...f, url: std.url, width: std.width, height: std.height } : { ...f, width: ow, height: oh };
}

const PICTURE_FIELDS = ['images', 'imageWidth', 'imageVia', 'imageKind', 'imageCredit', 'imageCreditVia', 'imageCredits', 'imageLender', 'imageFrom', 'imageLicense', 'imagePage', 'imageRights', 'imageFocus', 'imageFit', 'imageSubject'];
function pick5(s) {
  const out = {};
  for (const k of ['images', 'imageWidth', 'imageVia', 'imageCredit', 'imageCreditVia', 'imageCredits', 'imageLender', 'imageFrom']) if (s[k] !== undefined) out[k] = s[k];
  return out;
}

/** A decision is kept per story and headline (a story whose headline changes is decided again). */
function keyOf(s) {
  let h = 0;
  for (const ch of String(s.title || s.headline || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `${s.id}:${(h >>> 0).toString(36)}`;
}

/** Where to pixelate from: a portrait keeps the head (the top of the frame), everything else the usual 40 %. */
/** A file's title without what tells one crop or one frame of a picture from another (brackets, numbers, crop words). */
export function pictureStem(title) {
  return fold(String(title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]{3,4}$/i, ''))
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(?:cropped|crop|close up|closeup|estreita|ombros|head|headshot|portrait|\d+x\d+|\d{1,3})\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A face reading of a portrait of one person: their face sure and big enough, no one else as big beside them. */
export function portraitOf(v, minShare = SOBER.minShare) {
  return !!v && v.faces >= 1 && v.share >= minShare && !/^(?:no face found|face not sure|face too small for a portrait|two people)$/.test(v.why || '');
}

const NOT_LIVING = 'not in Wikipedia\'s living people';
const ACTOR_KINDS = /^(?:person|thing:(?:org|product|craft|mission|structure))$/;

/** A person named as their article: in full, early in the headline, the very title (what personProblem asks after "living"). */
function namedAsArticle(candidate, page, facts, text) {
  const full = page.title.replace(/\s*\([^)]*\)\s*$/, '');
  const written = candidate.text || '';
  if (written.split(/\s+/).length < 2 || candidate.namedThing || candidate.start > 6 || (facts?.sitelinks || 0) < 2) return false;
  if (fold(written) !== fold(full) && !page.redirected) return false;
  return new RegExp(`(?<![\\p{L}])${full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text);
}

/**
 * The named actor of a story without a picture, for its board (public/js/boardspec.js, graphics/topicboard.js): its
 * name and what it is, from the desk's own decision: { name, about } (about: its Wikipedia description), or null.
 *
 * Never a name the desk refused for who it is (an accused, a victim, a private person, someone else of that name, not
 * the story's subject): only a person or a body the desk found and would have shown, or a public figure no longer living
 * named in full as their article, never where people were harmed (an obituary's name; never a victim's). A name no
 * encyclopaedia knows yet (a startup, a gadget: no article at all) stands alone, never under a grave story, only where
 * the headline writes it as a name (and a headline's first word only where the story writes it so too).
 *   decision: the desk's decision ({ options, plan }); page(title): the kept article lookup (null: none, undefined:
 *   never asked).
 */
export function boardActorOf(decision, { page = () => undefined, title = '', summary = '' } = {}) {
  const flags = decision?.plan?.flags || {};
  // (the death of a public figure who was not harmed by anyone: their obituary may carry their name)
  const obituary = !flags.violent && !flags.jeopardy && /\b(?:obituary|dies|died|death of|tributes? to)\b/i.test(String(title || ''));
  const harmed = !!(flags.violent || flags.jeopardy || (flags.harm && !obituary));
  for (const o of decision?.options || []) {
    if (o.how === 'topic' || !ACTOR_KINDS.test(o.kind || '')) continue;
    if (o.refused && !(o.refused === NOT_LIVING && o.named && !harmed)) continue;
    const about = o.about ?? page(o.label)?.description ?? null;
    return { name: o.label.replace(/\s*\([^)]*\)\s*$/, ''), about: about || null };
  }
  if (harmed || flags.harm || flags.grave || flags.deathOf || flags.disaster) return null;
  const head = headlineOf(title);
  for (const text of decision?.plan?.subjects || []) {
    if (!text || text.length > 28 || page(text) !== null || /['’]/.test(text)) continue;
    const words = text.split(/\s+/);
    // every word written as a name ("Sprout Pi", "Cambridge Heavy Industries", "Transporter-18"), never two joined
    // ("SNES and Genesis"), never a word that is never a name on its own
    if (!words.every((w) => isCap(w) || /\d/.test(w)) || (words.length === 1 && NOT_A_NAME.has(text.toLowerCase()))) continue;
    const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const at = new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'u').exec(head);
    if (!at || lookupPlace(text) || findPlaces(text).length) continue;
    // the whole name, not a part of a longer one ("Paris Auto" of "Paris Auto Show", "No Man" of "No Man's Sky")
    const before = head.slice(0, at.index);
    const after = head.slice(at.index + text.length);
    if (/^\s+(?:\p{Lu}|\d)|^['’]s\s+\p{Lu}|^-/u.test(after) || /(?:^|\s)(?!The\s$)\p{Lu}[\p{L}\d-]*\s$/u.test(before)) continue;
    // a headline's first word is capitalised whatever it is ("Thousands of NI workers", "Mysterious brain activity"): a
    // name there only where the story writes it as one mid-sentence ("..., and Licube is preparing")
    const first = /^[\s'‘’"“”(]*$/.test(before);
    if (first && !/\p{Lu}.*\p{Lu}|\d/u.test(text.slice(1)) && !new RegExp(`[\\p{Ll},;]\\s+${esc}(?![\\p{L}])`, 'u').test(`${summary || ''}`)) continue;
    return { name: text, about: null };
  }
  return null;
}

export function focusOf(kind, w, h) {
  if (kind !== 'person') return 0.4;
  const a = (Number(w) || 1) / (Number(h) || 1);
  return a < 0.9 ? 0.16 : a < 1.3 ? 0.24 : 0.32;
}

/** The English Wikipedia titles a gazetteer place may have ("Georgia" is a disambiguation; "Georgia (country)" is it). */
export function placeTitlesOf(entry) {
  const name = entry.name;
  if (entry.kind === 'country') return [name, `${name} (country)`];
  if (entry.kind === 'city') return [name, entry.country ? `${name}, ${entry.country}` : null].filter(Boolean);
  return [name];
}

/** Is an item's point where the gazetteer's place is (a country's middle within ~1500 km, a city within ~60 km)? */
export function near(entry, coords) {
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return false;
  const d = degreesApart({ lat: entry.lat, lon: entry.lon }, coords);
  const r = entry.kind === 'country' ? 14 : entry.kind === 'region' ? 4 : 0.6;
  return d <= r;
}

const YEAR = 365.25 * DAY;
/** Why a person's portrait must not air on this story (null when it may). */
export function personProblem({ candidate, page, facts, flags, text, now = Date.now(), obituary = false }) {
  // (the obituary of a public figure: their death is the story, confirmed on Wikidata or in it)
  if (!obituary && !page.living) return 'not in Wikipedia\'s living people';
  if (!obituary && facts.died) return 'deceased';
  if (!Number.isFinite(facts.born)) return 'no birth date (adult unknown)';
  if (now - facts.born < 18 * YEAR && !obituary) return 'under 18';
  if (flags.deathOf && !obituary) return 'a story of a death';
  if (flags.jeopardy) return 'a story of an accusation or a trial';
  // named in full in the story, the surname in the headline, and early in it (the story is about them)
  const full = page.title.replace(/\s*\([^)]*\)\s*$/, '');
  const inText = (n) => new RegExp(`(?<![\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(text);
  // (a public figure the news names by surname alone, server SURNAMES: the surname as written)
  const bySurname = candidate.how === 'surname' && candidate.surname;
  const written = bySurname ? candidate.surname : candidate.text;
  if (written.split(/\s+/).length < 2 && !inText(full) && !bySurname) return 'not named in full';
  if (!inText(written)) return 'not named in the story';
  if (fold(written) !== fold(full) && !page.redirected && !bySurname) return 'the name differs from the article';
  // every word of the name as written is in the article's title ("Prince Charles" is not "Charles III"; "Zelensky" is in
  // "Volodymyr Zelenskyy", "Erdogan" in "Recep Tayyip Erdoğan")
  const titleFolded = fold(full);
  if (!(fold(written).match(/[a-z]{3,}/g) || []).every((w) => titleFolded.includes(w))) return 'the name is not the article\'s';
  // a place or a thing named after a person is not the person ("Prince Charles cinema", "Nelson Mandela Bay")
  if (candidate.namedThing) return 'a place or a thing named after a person';
  if (candidate.start > 6 && !candidate.said) return 'not the headline\'s subject';
  if ((facts.sitelinks || 0) < 2) return 'no public profile';
  if (!roleAgreement(text, facts, { sport: !!flags.sport }) && !bySurname) return 'the story gives another role';
  return null;
}

/**
 * Is this the obituary of a public figure? Their death is the story (the headline says it, or names an obituary), they
 * open the headline, Wikidata records their death recently or the story says they died, nothing violent (a victim of
 * violence never gets a portrait), and they are known in ten or more languages.
 */
export function isObituary({ candidate, page, facts, flags, now = Date.now() }) {
  if (!flags.deathOf && !/\bobituary\b/i.test(flags.title || '')) return false;
  if (flags.violent || candidate.start > 3) return false;
  if ((facts.sitelinks || 0) < 10) return false;
  const died = Number.isFinite(facts.died) ? facts.died : null;
  if (died !== null && now - died > 400 * DAY) return false; // an anniversary, not an obituary
  return died !== null || !page.living || /\b(?:obituary|dies|died|dead at|has died|passes away|passed away)\b/i.test(flags.title || '');
}

/** Why a grave story may not show this person's (sober) portrait: only public figures, never a victim of violence. */
export function graveProblem({ facts, role, flags, obituary }) {
  if (obituary) return flags.violent ? 'a victim of violence: no portrait' : null;
  if (flags.deathOf) return 'a story of a death';
  // a public figure speaking for an institution, or one known in 25 or more languages
  const official = role && ['politics', 'royalty', 'religion', 'business', 'law', 'military'].includes(role.family);
  if (!official && (facts.sitelinks || 0) < 25) return 'grave story: only a public figure in their role';
  return null;
}

/** Why a thing's picture must not air on this story (null when it may). */
export function thingProblem({ candidate, page, facts, flags, kind, text }) {
  if (candidate.start > 8) return 'not the headline\'s subject';
  // a name that leads to an article about something else ("Ramp" -> "Inclined plane"): not the thing the story means
  if (page.redirected && candidate.how !== 'alias' && !/^[A-Z0-9&.-]{2,8}$/.test(candidate.text) && !fold(page.title).includes(fold(candidate.text))) return 'the name leads to another article';
  if (flags.violent) return 'a story of violence: no picture of a thing';
  if (flags.harm && kind !== 'thing:org') return 'people harmed: only an institution';
  // the item must be the one the story means: its description shares a word with the story, or its kind fits the
  // section (a company in business or technology, a craft or a mission in science)
  const desc = `${facts.desc || ''} ${page.description || ''} ${(facts.types || []).join(' ')}`;
  const words = new Set((fold(text).match(/[a-z]{5,}/g) || []).filter((w) => !STOP5.has(w)));
  const own = new Set(fold(page.title).match(/[a-z]{3,}/g) || []);
  const shares = (fold(desc).match(/[a-z]{5,}/g) || []).some((w) => words.has(w) && !own.has(w) && !STOP5.has(w));
  const fits = (kind === 'thing:org' && /business|tech|money|world|science/.test(flags.category)) || (/thing:(?:craft|mission|sky)/.test(kind) && /science|tech|cosmos/.test(flags.category)) || (kind === 'thing:structure') || (kind === 'thing:product' && /tech|business/.test(flags.category));
  if (!shares && !fits) return 'the item does not fit the story';
  if (candidate.how === 'part' && candidate.text.split(' ').length === 1 && !ALIASES[candidate.text] && !shares) return 'one word of a longer name';
  return null;
}
const STOP5 = new Set('about after again against among announced around because before being between could during every first found following former friday further government group having including large later least might monday month months national never other people percent place said saturday since small sources still sunday their there these thing those three through thursday today tuesday under until wednesday where which while would years world american british international company companies based'.split(' '));

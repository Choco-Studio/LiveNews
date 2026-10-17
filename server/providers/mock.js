// Offline provider: builds an episode straight from the feed text, with no AI.
// Lets the whole channel run (and be demoed) without any account or API key.
// It only ever re-uses the feed's own words: headlines, summary sentences,
// figures and quotations as written. Variety comes from how they are framed
// (openers, attribution, hand-overs, recurring features), and the structure
// of each programme follows its style bible (docs/programmes/*.md) through
// the programme's config: intro shape, where the number of the day and the
// chats go, who reads the round-up. Everything is chosen deterministically
// from the story ids, so the same news always makes the same episode.

import { isTranscriptLine } from '../transcript.js';
import { isBreaking, plainTitle } from '../news.js';
import { ALSO_LEAN, LIGHT, contentWords, extractFigures, fixNameTypos, sentencesIn, harmlessIncident, isGrave, leansOnPrevious, notForFeatures, numbersIn, outletView, quotesIn, severity } from '../facts.js';
export { outletView };
import { locate, lookupPlace, placesIn } from '../gazetteer.js';
import { ROSA_MEMORIES, ROSA_NEEDLES } from '../sport/shape.js';
import { KNOWN_MAX, LINK_GAP, SENTENCE_WORDS, TIMELINE_MAX, compressSentence, hasFiniteVerb, headlineNames, isFragment, shortHeadline, splitClauses, trimClause } from '../writer.js';
import { topicOf } from '../topics.js';
import { untold } from '../coherence.js';
import { nextFrom, shareFrom, whoFrom } from '../boards.js';
import { AHEAD, deskOf } from '../correspondents.js';
import { expertFor, answerFrame } from '../experts.js';

const DEATHS = /\b(?:dead|deaths?|die[sd]|killed|killings?|victims?|mourn\w*|funeral)\b/i;
// Not grave, but not something to smile about either.
// (crime and scandal are hard news, never an "And finally": fraud, tax dodging, arrests, trials, sanctions; a space
// probe, a clinical trial or a charged battery are not crime)
const SOBER = /\b(?:volcan\w*|erupt\w*|storms?|strikes?|protests?|elections?|courts?|police|cancel\w*|closures?|bans?|shortages?|prices|inflation|recession|stocks?|shares|markets?|rates?|alerts?|jobs? at risk|job (?:cuts|losses)|lay-?offs?|redundanc\w*|rulings?|under pressure|flu|waiting lists?|fraud\w*|tax(?:es)?|falsif\w*|corrupt\w*|brib\w*|scandals?|lawsuits?|sued|su(?:es|ing)|arrest\w*|detain\w*|convict\w*|sentenced|prison|jail\w*|sanctions?|accus\w*|allegations?|launder\w*|tax evasion|embezzl\w*|indict\w*|guilty|(?:criminal|police|corruption|fraud) (?:investigation|probe|trial)|under investigation|on trial|blacklist\w*|military|armed forces|army|spy|spies|spying|espionage|surveillance|hack(?:ed|ers?|ing|s)?|cyber\w*|data breach\w*|national security|security (?:risks?|concerns?|threats?)|controvers\w*)\b/i;
// ("‘Super app’ aimed at UK students uses servers owned by Chinese firm on US blacklist", a firm tied to the People's
// Liberation Army, once closed WORLD NOW as "And finally", Guardian 14 Oct: security and the military are never light)
// The best "and finally" material: curiosities, animals, culture, the sky.
const LIGHTER = /\b(?:zoo|pandas?|leopards?|tortoises?|penguins?|whales?|dolphins?|bees|parrots?|birds?|festival|museum|tomatoes|chocolate|coffee|trees|gardens?|reef|coral|footprints|dinosaurs?|fossils?|comet|eclipse|drones|telescope|stars|moon|music|art|mushroom)\b/i;
// A headline told as a spoken sentence, the way a broadcast writer turns one: its present-tense verb becomes the
// present perfect ("The new Fitbit Edge leaks" -> "The new Fitbit Edge has leaked", "..., dies at 94" -> "..., has
// died at 94") and a common-noun subject takes the article the outlet gives it ("Federal judge calls..." -> "A
// federal judge has called...", from "A federal judge ruled..." in its summary). Only when the shape is plain: one
// known headline verb after a subject of up to twelve words, no second verb after a comma ("..., says it..."), no
// quotation or colon opening it, never a plural subject. Otherwise the headline as written.
const HEADLINE_PERFECT = {
  unveils: 'unveiled', launches: 'launched', leaks: 'leaked', dies: 'died', wins: 'won', calls: 'called', responds: 'responded',
  disappears: 'disappeared', resigns: 'resigned', warns: 'warned', raises: 'raised', cuts: 'cut', buys: 'bought', sells: 'sold',
  opens: 'opened', closes: 'closed', bans: 'banned', sues: 'sued', finds: 'found', reveals: 'revealed', announces: 'announced',
  confirms: 'confirmed', approves: 'approved', rejects: 'rejected', blocks: 'blocked', fines: 'fined', delays: 'delayed',
  pauses: 'paused', freezes: 'frozen', ends: 'ended', drops: 'dropped', adds: 'added', hits: 'hit', loses: 'lost',
  // ("Antarctic Sea Ice Grows to Its 2026 Maximum", NASA 12 Oct)
  grows: 'grown', rises: 'risen', jumps: 'jumped', soars: 'soared', slumps: 'slumped', reaches: 'reached', tops: 'topped',
  surges: 'surged', dips: 'dipped', climbs: 'climbed', shrinks: 'shrunk', doubles: 'doubled', halves: 'halved',
  builds: 'built', breaks: 'broken', shuts: 'shut', pulls: 'pulled', removes: 'removed', releases: 'released',
  signs: 'signed', expands: 'expanded', acquires: 'acquired', invests: 'invested', joins: 'joined', leaves: 'left',
  quits: 'quit', hires: 'hired', fires: 'fired', settles: 'settled',
  // ("Fire destroys Marché des Enfants Rouges…", Guardian 12 Oct)
  destroys: 'destroyed', damages: 'damaged', kills: 'killed', injures: 'injured', rescues: 'rescued', evacuates: 'evacuated',
  // (sport: "Zizou Bergs stuns Alcaraz in Shanghai…", Guardian 12 Oct)
  stuns: 'stunned', beats: 'beaten', defeats: 'defeated', thrashes: 'thrashed', routs: 'routed', crushes: 'crushed', overcomes: 'overcome', knocks: 'knocked',
  // (12 Oct: "President Zardari suspends provincial government..." read as a headline; verbs a headline rarely uses as a noun)
  suspends: 'suspended', urges: 'urged', vows: 'vowed', threatens: 'threatened', admits: 'admitted', denies: 'denied',
  accuses: 'accused', detains: 'detained', seeks: 'sought', scraps: 'scrapped', postpones: 'postponed', cancels: 'cancelled',
  extends: 'extended', imposes: 'imposed', overturns: 'overturned', upholds: 'upheld', condemns: 'condemned', welcomes: 'welcomed',
  elects: 'elected', appoints: 'appointed', declares: 'declared', orders: 'ordered',
  // (real news 13-14 Oct: "US Supreme Court agrees to hear…", "Ethiopian forces enter strategic Tigray town…")
  agrees: 'agreed', seizes: 'seized', captures: 'captured', arrests: 'arrested', charges: 'charged', demands: 'demanded',
  enters: 'entered', attacks: 'attacked', marks: 'marked', visits: 'visited', hosts: 'hosted', backs: 'backed',
  sentences: 'sentenced', becomes: 'become', takes: 'taken', protests: 'protested', sanctions: 'sanctioned',
};
// The same verbs after a plural subject ("Americans Hall and Woodford win Nobel Prize in economics", Euronews 12 Oct ->
// "... have won ..."): only after "X and Y" or a plural noun ("Tokyo stocks close..."), and never a verb that is as often
// a noun in a headline's subject ("Price cut hits sales" keeps looking for its verb)
const HEADLINE_PERFECT_PLURAL = {
  unveil: 'unveiled', launch: 'launched', win: 'won', warn: 'warned', raise: 'raised', buy: 'bought', sell: 'sold', ban: 'banned',
  sue: 'sued', find: 'found', reveal: 'revealed', announce: 'announced', confirm: 'confirmed', approve: 'approved', reject: 'rejected',
  block: 'blocked', delay: 'delayed', pause: 'paused', add: 'added', lose: 'lost', build: 'built', sign: 'signed', expand: 'expanded',
  acquire: 'acquired', join: 'joined', leave: 'left', quit: 'quit', hire: 'hired', settle: 'settled', resign: 'resigned', die: 'died',
  open: 'opened', close: 'closed', agree: 'agreed', reach: 'reached', vote: 'voted', deny: 'denied', urge: 'urged', claim: 'claimed',
  enter: 'entered', seize: 'seized', capture: 'captured', arrest: 'arrested', attack: 'attacked', march: 'marched', kill: 'killed',
};
// A headline in Title Case ("NASA’s SSPICY Mission to Demonstrate In-Space Inspection Technologies", NASA 9 Oct) is said
// in sentence case: a word the story itself writes in lower case is a common word; a name keeps its capital.
const TITLE_SMALL = /^(?:A|An|The|To|Of|In|On|At|For|By|And|Or|But|As|With|From|Into|Over|Up)$/;
export function sentenceCase(title, info) {
  const words = String(title || '').split(/\s+/);
  // (words of three letters count: "Antarctic Sea Ice Grows to Its 2026 Maximum", NASA 12 Oct, aired as "…has grown to Its 2026
  // Maximum")
  const long = words.slice(1).filter((w) => /^\p{L}[\p{L}’'-]{2,}/u.test(w) && !TITLE_SMALL.test(w.replace(/[^\p{L}]/gu, '')));
  if (long.length < 3 || long.filter((w) => /^\p{Lu}/u.test(w)).length / long.length < 0.7) return String(title || '');
  const text = `${info?.s?.summary || ''} ${info?.s?.body || ''}`;
  return words
    .map((w, i) => {
      if (i === 0 || !/^\p{Lu}\p{Ll}/u.test(w)) return w; // the first word, an acronym ("NASA’s", "SSPICY")
      if (TITLE_SMALL.test(w)) return w.toLowerCase();
      const core = w.replace(/[^\p{L}-]/gu, '');
      if (/\p{Lu}/u.test(core.slice(1).replace(/-\p{Lu}/gu, ''))) return w; // "McDonald", "SpaceX"
      const stem = core.toLowerCase().slice(0, Math.max(4, Math.min(6, core.length - 1)));
      return new RegExp(`(?<![\\p{L}])${stem}`, 'u').test(text) ? w.toLowerCase() : w; // (a stem is letters and hyphens)
    })
    .join(' ');
}
// A headline that is a label, not a sentence: "BBC on Hurricane Isaias and its expected Gulf Coast landfall" (a video's
// page, BBC 9 Oct), "Watch: ...". A tease says the story's own news instead.
// (and a death notice: "RIP Margaret Hamilton, whose code saved the Apollo 11 Moon landing", Ars Technica 9 Oct)
// (and someone's words: "'Careless use of AI is the real threat'", BBC 9 Oct, said by a presenter, would be ours)
// (a quotation that is the headline's label, "‘Stain on country’: Trump criticises…", not one inside its sentence: "'Tropical
// jungle' of wallabies, porcupines and parrots must move after neighbours complain", BBC 10 Oct)
// A feature's headline: a label and the long read behind it ("…: the fight to kill…", "– how charity shops became…",
// "Inside…", "Meet the…", "Why…?", "The big read")
// (and a podcast's title, "Trump rewards Putin and betrays Ukraine with Russia diesel deal - The Latest", Guardian 14 Oct,
// and a headline's own verdict, "Hegseth’s dubious low-T screening…", Ars Technica 13 Oct: features, after the news;
// and a teaser, "They war-gamed dimming the Sun. It went even worse than you think.", Ars Technica 15 Oct)
// (round 5: a podcast's "This week in science: sea monsters…", NPR; "'Frankly shocking' risk-taking by motorists…", Sky News,
// a quotation with no one saying it; "Ocarina of Time remake feels remarkably modern", a review, The Verge)
// (and an analysis: "Analysis: Trump's global headaches worsen weeks before crucial elections", BBC 12 Oct, once told "it
// looks like Trump is turning overseas for help" in the presenter's voice)
const FEATURE_TITLE = /^["“‘'][^"“”‘’']{8,}["”’']\s*(?:[:,–—-]\s+.*)?$|(?:^|[:–—]\s+|\s[–—-]\s+)(?:the (?:fight|battle|race|rise|fall|story|truth|secret|inside story|making|people|women|men|cost|price|toll|human cost|scale|lives) (?:to|of|behind|who|for)|how (?:\w+\s+){0,6}(?:became|turned|lost|won|changed|built|took|went)|why (?:\w+\s+){1,8}(?:is|are|was|were|has|have|does|do|can|can't|won't)|inside (?:the|a)\b|meet the\b|what (?:it'?s|it is) like)\b|^(?:Inside|Meet|Why|How|What)\b[^:]*\?$|\bthe big read\b|\b(?:long read|analysis|explainer|opinion|comment)\s*:|\b(?:fantasy|fantasies|folly|myth|delusion|sham|farce|madness|nonsense|fiasco|hypocrisy|charade|absurdity)\b|\bbest and worst\b|\bmost interesting\b|\bis the (?:best|worst)\b|\bhands-on\b|\breview:|\bis as (?:awesome|good|great|cool|bad|weird)\b|\s[–—-]\s+(?:can|will|could|should|is|are|does|do|did|why|how|what|who)\s+(?:\w+\s+){0,2}\w+|\s[–—-]\s+The Latest\s*$|\b(?:dubious|shameful|disgraceful|absurd|ridiculous|misguided|cynical)\b|\bthan you (?:think|might think|(?:would|['’]d) (?:expect|think))\b|\bwhat you need to know\b|^this week in\b|^['‘"“][^'’"”]*\b(?:frankly|shocking|appalling|disgraceful|outrageous|disastrous|catastrophic|nightmare|scandalous|chaotic|madness|absurd|ridiculous|terrifying|horrific|heartbreaking|devastating)\b[^'’"”]*['’"”]\s+\p{Ll}|\bfeels (?:remarkably|surprisingly|incredibly|very|so)\b|^(?:Analysis|Comment|Opinion|Explainer|Viewpoint)\s*:/iu;
// An outlet's promotion of its own event, offer or newsletter: no story
// (nor a deals post: "$15 gets you Psychonauts 2…" and "Save 50% on your TechCrunch Disrupt 2026 ticket" aired once a
// headline's "you" no longer made it a column, TECH BYTES 15 Oct)
const PROMO_TITLE = /\b(?:final chance|last chance|save up to|ticket savings|tickets? (?:on sale|go on sale|now available)|register now|early[- ]bird|promo code|discount code|deal of the day|best deals?|sponsored|subscribe (?:now|today)|sign up (?:now|today|for our))\b|\bsave (?:up to )?[$£€]?\d|\b(?:half|\d+%) off\b|\bgets you\b|\bon sale\b|\blowest price\b|\bcheapest (?:price|ever)\b|^Job opportunities\b|\bjob openings?\b|^TB \d{2}-\d{2}\b|\bwe(?:['’]re| are) hiring\b|\bTechCrunch Disrupt\b|\bDisrupt 20\d\d\b|\bStartup Battlefield\b/i;
export const LABEL_TITLE = /^(?:["“‘'][^"“”‘’']{1,120}["”’'](?=\s*(?:[:,–—-]|says\b|said\b|$))|["“][^"“”]{1,160}["”](?=\s*(?:[:,–—-]|says\b|said\b|$))|(?:\p{Lu}[\p{L}’'.&-]*\s+){1,3}on\s+\p{Lu}|(?:Watch|Video|Listen|In pictures|Explained|Analysis|Live)\s*:|R\.?I\.?P\.?\s)/u;
// A headline never said as the presenter's own: one that quotes words without saying whose ("British and Irish
// governments ‘should negotiate paramilitary disbandment’", Guardian 14 Oct: the marks cannot be heard), or one that holds
// the outlet's view of a motive ("Ken Paxton stirs vaccines skepticism to ingratiate himself with Maha movement"). The
// tease and the opener take the article's sentence instead, which says who (round 5).
export const unsignedTitle = (t) =>
  // (words, three or more: a quoted name of two is a label, "‘Super app’ aimed at UK students…", Guardian 13 Oct)
  (/(?<!\p{L})[‘“"](?:[^’”"\s]+\s+){2,}[^’”"]*[’”"]|(?<![\p{L}])'(?:[^'\s]+\s+){2,}[^']*'(?![\p{L}])/u.test(t) && !/^[^‘“"']*\b(?:says?|said|tells?|told|(?:warn|urge|claim|accuse|call|vow|pledge|promise|threaten|insist|admit|demand|condemn|describe|brand|label|dismiss|hail|praise|slam|blast|criticise|criticize|defend|reject|ask|deny|plead|apologise|apologize|announce|predict|confirm|reveal|argue|suggest|hit out|respond|reply|replie)(?:s|d|ed)?|denies|denied)\b/i.test(t) && !/^[^‘“"']{2,40}:/.test(t)) ||
  /\bto ingratiate\b|\bin a bid to (?:distract|deflect|curry favou?r)\b/i.test(t);
// An acronym the outlet writes with "the" more often than without ("the IEA said", "the UK economy"; never "NASA said"):
// a headline made a sentence gives it its article ("IEA has warned…" -> "The IEA has warned…", round 5).
function acronymArticle(line, info) {
  const m = String(line).match(/^(\p{Lu}{2,6})\s+(?:is|are|was|were|has|have|had)\b/u);
  if (!m) return line;
  const text = `${info?.s?.summary || ''} ${info?.s?.body || ''}`;
  const withThe = (text.match(new RegExp(`\\b[Tt]he\\s+${m[1]}\\b`, 'g')) || []).length;
  const all = (text.match(new RegExp(`\\b${m[1]}\\b`, 'g')) || []).length;
  return withThe >= 1 && withThe > all - withThe ? `The ${line}` : line;
}
export function spokenTitle(title, info) {
  const out = spokenTitleOf(title, info);
  return out === sentenceCase(String(title || '').trim(), info).replace(/[.!]+$/, '') ? out : acronymArticle(out, info);
}
function spokenTitleOf(title, info) {
  let t = sentenceCase(String(title || '').trim(), info).replace(/[.!]+$/, '');
  // (a topic label before a colon is the page's, not a sentence: "Fuel prices: Sébastien Lecornu promises €10 cut per
  // fill-up", Euronews 14 Oct, once aired whole; what follows it is the news, when it has a verb of its own)
  // (a topic, never who says it: "IFS: budget will be ‘work of fiction’…" is the IFS's claim, and stays a label; a topic
  // label is common words, "Fuel prices", "Live", "Weather")
  const label = t.match(/^([^:“”"‘’]{2,32}):\s+(\p{Lu}.{12,})$/u);
  const topic = label && /^\p{Lu}?\p{Ll}+(?:\s+\p{Ll}+){0,3}$/u.test(label[1].trim()) && !lookupPlace(label[1].trim());
  if (label && topic && hasFiniteVerb(label[2]) && label[2].split(/\s+/).length >= 4) t = label[2];
  if (!t || /^["“‘']|:|\?$/.test(t)) return t;
  const words = t.split(/\s+/);
  const key = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
  const plural = (k) => HEADLINE_PERFECT_PLURAL[key(words[k])] && (/\band\b/.test(words.slice(0, k).join(' ')) || /[^s]s$/i.test(key(words[k - 1])));
  // (the last word only when no phrase comes before it: "Pope Leo XIV resigns", but "…released back into the wild after
  // Borneo fires" ends on a noun, BBC 12 Oct)
  const inPhrase = (k) => k === words.length - 1 && words.slice(1, k).some((w) => /^(?:in|after|over|from|into|at|on|with|for|by|of|amid|about|across|near|back|to)$/i.test(w));
  const i = words.findIndex((w, k) => k > 0 && !inPhrase(k) && (HEADLINE_PERFECT[key(w)] || plural(k)));
  if (i < 1) return headlineFuture(t, words, info) || headlinePassive(t, words, info) || t;
  if (i > 12) return t;
  // ("French MPs push exit tax on crypto above €800,000 and fines…", Euronews 12 Oct: the verb after "and" is the second of
  // two, the first never found; the headline stays)
  if (/^(?:and|or|but|&)$/i.test(words[i - 1] || '')) return t;
  // (a verb after "to", "as" or "while" belongs to a clause of its own: "UK to strengthen cyber defences as minister calls
  // for…", BBC 14 Oct, once aired as "An UK to strengthen cyber defences as minister has called…")
  if (words.slice(1, i).some((w) => /^(?:to|as|while|after|amid|because|despite|when|if|until|before)$/i.test(w))) return headlineFuture(t, words, info) || t;
  const many = !HEADLINE_PERFECT[key(words[i])];
  const rest = words.slice(i + 1).join(' ');
  // a second verb after a comma ("Amazon responds to data center backlash, says it...") keeps the headline
  const after = [...rest.matchAll(/,\s*([a-z]+)/g)].map((m) => m[1]);
  if (after.some((w) => HEADLINE_PERFECT[w] || HEADLINE_PERFECT_PLURAL[w] || /^(?:says?|said)$/.test(w))) return t;
  let subject = words.slice(0, i).join(' ');
  const verb = many ? `have ${HEADLINE_PERFECT_PLURAL[key(words[i])]}${words[i].match(/[,;]$/)?.[0] || ''}` : `has ${HEADLINE_PERFECT[key(words[i])]}${words[i].match(/[,;]$/)?.[0] || ''}`;
  // (a plural subject needs no article: "Doctors have warned...")
  if (!many && !/^(?:The|A|An|This|Its|His|Her|Their)\b/.test(subject) && !/['’]s$/.test(words[0])) {
    // a name stays as it is; a common noun takes the outlet's own article, else the headline stays
    const text = `${info?.s?.summary || ''} ${info?.s?.body || ''}`;
    const first = words[0].replace(/[^\p{L}-]/gu, '');
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // a name: written with a capital mid-sentence by the outlet, shaped like one ("OpenAI", "NASA"), or a first and
    // a last name ("Milt Windler, ...", "Jack Dorsey’s Bitchat")
    const shaped = /\p{Lu}/u.test(first.slice(1));
    const named = shaped || !!lookupPlace(first) || new RegExp(`[\\p{Ll},;]\\s+${esc(first)}\\b`, 'u').test(text) || (/^\p{Lu}/u.test(words[1] || '') && /^\p{Lu}\p{Ll}/u.test(first));
    // (a place before a common noun is no name: "Saudi minister vows…" -> "A Saudi minister has vowed…", BBC 12 Oct)
    const common = /^\p{Ll}/u.test(words[i - 1] || '') && words.length > 1 && i > 1;
    // (a name or an acronym is never given the text's article: "a US court" once made "A US has detained…", 12 Oct)
    const det = (shaped || named) && !common ? null : articleFor(subject, text, common || !named);
    if (det) subject = `${det} ${shaped || named || DEMONYM.test(first) ? subject : subject[0].toLowerCase() + subject.slice(1)}`;
    else if (!named) return t;
  }
  return `${subject} ${verb}${rest ? ` ${rest}` : ''}`;
}
// A headline's subject: plural when it ends on a common noun in -s or joins two ("Endangered orangutans", "Workers", "Hall
// and Woodford"); a singular common noun takes the outlet's own article ("Man arrested…" -> "A man…"), else the headline
// stays as it is (null). The first word's capital proves nothing: a name is written so by the outlet mid-sentence, is
// shaped like one ("OpenAI") or is a known place.
function headlineSubject(subject, info) {
  const ws = subject.split(/\s+/);
  if (ws.length > 4) return null;
  const text = `${info?.s?.summary || ''} ${info?.s?.body || ''}`;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const named = (w, k) => {
    const core = w.replace(/[^\p{L}-]/gu, '');
    if (!/^\p{Lu}/u.test(core)) return false;
    if (k > 0 || /\p{Lu}/u.test(core.slice(1)) || lookupPlace(core)) return true;
    return new RegExp(`[\\p{Ll},;]\\s+${esc(core)}\\b`, 'u').test(text);
  };
  // (the noun the phrase is about: before its first preposition, "Nobel Prize for economics" is about a prize)
  const prep = ws.findIndex((w, k) => k > 0 && /^(?:for|of|in|on|at|from|with|over|after)$/i.test(w));
  const hk = prep > 0 ? prep - 1 : ws.length - 1;
  const last = ws[hk];
  const plural = (!named(last, hk) && /[^s'’]s$/i.test(last)) || /\band\b/.test(ws.slice(0, hk + 1).join(' '));
  if (plural || /^(?:The|A|An|This|Its|His|Her|Their)$/.test(ws[0]) || named(last, hk)) return { subject, plural };
  const det = articleFor(subject, text, true);
  // (an acronym or a name keeps its capital: "BA flight forced to turn back…" once aired as "A bA flight is forced…", BBC
  // 14 Oct)
  // (and a people's name: "Saudi national charged…" once aired as "A saudi national has been charged…", NEWS IN 60 14 Oct)
  const keepCase = /^\p{Lu}{2,}\b/u.test(subject) || named(ws[0], 0) || DEMONYM.test(ws[0].replace(/[^\p{L}-]/gu, ''));
  return det ? { subject: `${det} ${keepCase ? subject : subject[0].toLowerCase() + subject.slice(1)}`, plural } : null;
}
// A sentence that opens on an earlier time is background, never a story's first line: "Last week, a BA flight bound for
// Chicago spent five hours circling…" once opened "BA flight forced to turn back over cracked window" (BBC 14 Oct), its
// own flight never told, and "Founded in 1615, the Enfants Rouges market…" a fire's story (France 24 12 Oct), round 5.
const BACKGROUND_OPEN = /^(?:Last (?:week|month|year|summer|winter|spring|autumn|weekend)|Earlier this (?:week|month|year)|(?:And )?[Ii]n (?:January|February|March|April|May|June|July|August|September|October|November|December|(?:19|20)\d\d)\b|Previously\b|Founded in\b|Back in\b|Years ago\b|Decades ago\b|Since (?:(?:19|20)\d\d|then)\b|Before that\b)/;
// What a headline says happened, by kind: a sentence that says any word of the kind tells it ("flames ravaging" tells "Fire
// ravages…"). A word of no kind is told by its own stem.
const EVENT_KINDS = [
  /\b(?:fires?|blazes?|flames?|burn\w*|ravag\w*|infernos?|ablaze|gutted)\b/i,
  /\b(?:kill\w*|dead|deaths?|dies|died|dying|fatal\w*|lives)\b/i,
  /\b(?:attack\w*|strikes?|struck|raids?|shell\w*|bomb\w*|drones?|missiles?)\b/i,
  /\b(?:explo\w*|blasts?)\b/i,
  /\b(?:arrest\w*|detain\w*|custody|held)\b/i,
  /\b(?:charg\w*|indict\w*|accus\w*)\b/i,
  /\b(?:jail\w*|prison\w*|sentenc\w*|convict\w*)\b/i,
  /\b(?:shot|shoot\w*|gun\w*|stab\w*)\b/i,
  /\b(?:flood\w*|storms?|hurricanes?|typhoons?|cyclones?|earthquakes?|quakes?|landslides?)\b/i,
  /\b(?:crash\w*|collaps\w*|derail\w*|capsiz\w*|sank|sinks?)\b/i,
  /\b(?:resign\w*|quits?|steps? down|stepped down|sack\w*|ousted|fired)\b/i,
  /\b(?:evacuat\w*|fled|flee\w*)\b/i,
];
const EVENT_WORD = /\b(?:fires?|blazes?|ravag\w*|destroy\w*|kill\w*|dies|died|attack\w*|explo\w*|crash\w*|collaps\w*|flood\w*|earthquake|quake|arrest\w*|charged|jailed|sentenced|convicted|shot|shooting|stabb\w*|resign\w*|sacked|ousted|evacuat\w*|detain\w*)\b/gi;
/** The headline's events no sentence in `told` says, or [] (a headline with no event word says no event). */
function eventsUnsaid(title, told) {
  const words = String(title).match(EVENT_WORD) || [];
  const text = told.join(' ');
  return words.filter((w) => {
    const kind = EVENT_KINDS.find((k) => k.test(w));
    return kind ? !kind.test(text) : !new RegExp(`\\b${w.slice(0, 5)}`, 'i').test(text);
  });
}
// Nouns a headline drops the article of that always count ("Fire destroys…", "Man arrested…", "Saudi minister vows…")
const COUNT_NOUN = /^(?:minister|man|woman|boy|girl|child|teenager|baby|judge|court|firm|company|startup|study|report|survey|fire|blaze|blast|explosion|storm|quake|earthquake|plane|jet|ship|boat|ferry|train|bus|car|lorry|truck|driver|pilot|teacher|doctor|nurse|officer|soldier|student|worker|leader|lawmaker|senator|mayor|councillor|official|spokesperson|spokesman|spokeswoman|group|charity|union|bank|hospital|school|university|museum|zoo|team|club|rocket|probe|satellite|telescope|volcano|tornado|hurricane|cyclone|flood|landslide|bridge|dam|mine|factory|plant|refinery|pipeline|businessman|businesswoman|tycoon|billionaire|fugitive|suspect|activist|journalist|lawyer|politician|executive|soldier|officer|migrant|refugee|priest|archbishop|bishop|singer|actor|actress|rapper|footballer|player|coach|athlete|student|scientist|researcher|campaigner|protester|hitman|gang|boss)$/;
/**
 * The article a headline's common-noun subject takes: the outlet's own ("a fire" before "the fire": a story's first
 * mention), else, when the subject needs one (`needs`) and its noun always counts, "A"/"An"; else null.
 */
function articleFor(subject, text, needs) {
  const esc = subject.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const indef = String(text).match(new RegExp(`\\b(a|an)\\s+${esc}\\b`, 'i'));
  const def = indef ? null : String(text).match(new RegExp(`\\bthe\\s+${esc}\\b`, 'i'));
  if (indef) return indef[1].toLowerCase() === 'an' ? 'An' : 'A';
  if (def) return 'The';
  const head = subject.split(/\s+/).pop().toLowerCase();
  if (!needs || !COUNT_NOUN.test(head)) return null;
  return /^[aeiou]/i.test(subject) ? 'An' : 'A';
}
// a finite verb later in the headline: the "to" or the participle belongs to the subject ("Plans to build a bridge are
// rejected", "Company founded in 1990 closes its doors"); a noun at the very end is no verb ("…after Borneo fires")
const laterVerb = (rest) => rest.slice(0, -1).some((w) => /^(?:is|are|was|were|has|have|had)$/i.test(w) || HEADLINE_PERFECT[w.toLowerCase().replace(/[^a-z]/g, '')]);
const SET_TO = /^(?:set|due|poised|expected|likely|about|going|ready|able|unlikely|forced|told|ordered|allowed)$/;
/** "Thales to open what could be Japan's first…" -> "Thales is to open…"; "Fed set to raise rates" -> "Fed is set to raise rates". */
// (a headline in title case, "NASA Develops Batteries to Power Humanity’s Return to Moon", NASA 14 Oct, once aired as "NASA
// develops batteries are to power…": its verbs cannot be told from its nouns by their case)
const titleCased = (info) => {
  const w = String(info?.s?.title || '').split(/\s+/).filter((x) => /^\p{L}/u.test(x) && x.length > 3);
  return w.length >= 4 && w.filter((x) => /^\p{Lu}/u.test(x)).length / w.length > 0.7;
};
function headlineFuture(t, words, info) {
  if (titleCased(info)) return null;
  const k = words.findIndex((w, j) => j > 0 && j <= 4 && w === 'to' && /^\p{Ll}+$/u.test(words[j + 1] || ''));
  if (k < 1) return null;
  const at = SET_TO.test(words[k - 1]) ? k - 1 : k;
  // (a verb of its own before "to": "US Supreme Court agrees to hear…", Al Jazeera 14 Oct, once aired "…agrees are to hear…")
  // (anywhere before it: "UK asks Interpol to reject…" once aired as "UK asks Interpol is to reject…", Guardian 15 Oct)
  // (and an auxiliary or a question word: "What ice cream has to do with this year's Nobel Prize" once aired as "…has are
  // to do…", NPR 15 Oct)
  if (/^(?:What|How|Why|Who|When|Where|Which)$/i.test(words[0] || '')) return null;
  if (at === k && words.slice(1, k).some((w) => /^(?:has|have|had|is|are|was|were|needs|need|got|gets|used|going|ought|agrees|plans|wants|vows|refuses|threatens|seeks|aims|hopes|votes|moves|decides|promises|pledges|fails|tries|offers|prepares|expects|intends|asks|urges|calls|says|declines|chooses|tells|orders|forces|helps|lets|allows|invites|agreed|planned|voted|vowed|refused|threatened|sought|decided|promised|pledged|failed|tried|offered|asked|urged|told|ordered|forced|helped|allowed|invited)$/i.test(w))) return null;
  // (a verb after "as", "while" or "after" is that clause's own: "UK to strengthen cyber defences as minister calls…")
  const sub = words.findIndex((w, j) => j > k + 1 && /^(?:as|while|after|amid|because|when|until|before)$/i.test(w));
  if (at < 1 || words.slice(0, at).some((w) => /[,:;]$/.test(w)) || laterVerb(words.slice(k + 2, sub > 0 ? sub : undefined))) return null;
  const head = headlineSubject(words.slice(0, at).join(' '), info);
  return head ? `${head.subject} ${head.plural ? 'are' : 'is'} ${words.slice(at).join(' ')}` : null;
}
// A word that can be a first name: capitalised, short, never a place nor a title
const givenNameLike = (w) => /^\p{Lu}\p{Ll}{1,11}$/u.test(String(w)) && !lookupPlace(w) && !/^(?:The|Former|New|Old|Chief|Prime|President|Minister|Coach|Judge|Officer|General|Captain|Senator|Governor|Mayor|Leader|Head|Star|Boss)$/.test(w);
// A participle a headline uses for a passive, and what follows it there ("orangutans released back into the wild", "man
// arrested after…", "hundreds detained in…")
const HEAD_PARTICIPLE = /^(?:[a-z]{3,}ed|sued|held|found|shot|hit|taken|given|seen|sold|built|caught|freed|hurt|struck|stolen|sent|kept|left|told|brought|thrown|beaten|bitten|spent|won|lost|made|paid|sworn)$/;
const AFTER_PARTICIPLE = /^(?:back|after|in|for|over|from|by|as|at|on|to|into|amid|following|near|during|with|without|under|off|out|up|down|across|outside|inside|before|despite)$/;
/** "Endangered orangutans released back into the wild after Borneo fires" -> "… have been released back …". */
function headlinePassive(t, words, info) {
  // (never a headline that has its verb already: "Father was asked for DNA test to get a passport…" once aired as "Father
  // was have been asked…", Guardian 13 Oct)
  if (words.slice(0, 6).some((w) => /^(?:is|are|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|should|shall)$/i.test(w))) return null;
  if (titleCased(info)) return null;
  // (never after a relative pronoun: "The skincare scheme that led to consumer complaints…", NPR 14 Oct, is a label whose
  // verb is the relative's, and once aired as "…that has been led to…")
  if (words.slice(0, 5).some((w) => /^(?:that|which|who|whose|where)$/i.test(w))) return null;
  // (nor one whose predicate is a "not" later on: "Mourners killed by Kenya police at ex-PM's national farewell not part of
  // violence" says the mourners were not part of it, and once aired as "Mourners have been killed by… not part of violence",
  // BBC 12 Oct, round 5)
  if (words.slice(2).some((w) => /^(?:not|no longer|never)$/i.test(w))) return null;
  // (a longer subject that ends on someone's whole name is that person: "Former Irish Olympic swimming coach and child
  // abuser George Gibney jailed for 15 years", RTÉ 14 Oct -> "… George Gibney has been jailed for 15 years")
  const kn = words.findIndex((w, j) => j >= 2 && j <= 12 && HEAD_PARTICIPLE.test(w) && AFTER_PARTICIPLE.test(words[j + 1] || '') && /^\p{Lu}\p{Ll}/u.test(words[j - 1]) && /^\p{Lu}\p{Ll}/u.test(words[j - 2]));
  if (kn > 4 && !words.slice(1, kn).some((w) => HEAD_PARTICIPLE.test(w)) && !words.slice(0, kn).some((w) => /[,:;]$/.test(w)) && !laterVerb(words.slice(kn + 1)) && !lookupPlace(words[kn - 1]) && givenNameLike(words[kn - 2])) return `${words.slice(0, kn).join(' ')} has been ${words.slice(kn).join(' ')}`;
  const k = words.findIndex((w, j) => j > 0 && j <= 4 && HEAD_PARTICIPLE.test(w) && AFTER_PARTICIPLE.test(words[j + 1] || ''));
  if (k < 1 || words.slice(0, k).some((w) => /[,:;]$/.test(w)) || laterVerb(words.slice(k + 1))) return null;
  const head = headlineSubject(words.slice(0, k).join(' '), info);
  if (!head) return null;
  // (a first participle that only describes the subject, a second that is the news: "Cryptocurrency exchange founded by
  // Reform donor Ben Delo sued for £20m", Guardian 14 Oct, once aired as "…has been founded by Reform donor Ben Delo sued
  // for £20m"; but "Man arrested after woman killed in…" keeps its first: the second is the clause after "after")
  const k2 = words.findIndex((w, j) => j > k + 1 && j <= k + 9 && HEAD_PARTICIPLE.test(w) && AFTER_PARTICIPLE.test(words[j + 1] || ''));
  if (k2 > 0 && !words.slice(k + 1, k2).some((w) => /^(?:after|as|when|while|following|amid|before|because|since|until|over|despite|and|or)$/i.test(w) || /[,:;]$/.test(w))) {
    return `${head.subject} ${words.slice(k, k2).join(' ')} ${head.plural ? 'have' : 'has'} been ${words.slice(k2).join(' ')}`;
  }
  return `${head.subject} ${head.plural ? 'have' : 'has'} been ${words.slice(k).join(' ')}`;
}
// The outlet's own voice, outside quotation marks ("We don't know a ton about the Fitbit Edge", The Verge, 4 Oct):
// never our presenters' words.
// (and the reader addressed: "You might not have known that it was Hamilton who...", Ars Technica 9 Oct)
// ("Let’s break down exactly what happened", "Learn more about...": the outlet talking to its reader, TechCrunch 12 Oct)
// (and an advice column's imperative: "Pick a day when there is a good breeze, and heat the house…" once opened a WORLD NOW
// story in the station's voice, Guardian 14 Oct, round 5)
const FIRST_PERSON = /\b(?:[Ww]e|[Ww]e['’](?:re|ve|ll|d)|[Oo]ur|us|I['’](?:m|ve|d|ll)|my|me|[Yy]ou(?:['’](?:re|ve|ll|d))?|[Yy]our|[Ll]et['’]s)\b|(?:^|[^\w.])I (?=[a-z])|^(?:Learn|Find out|Read|Discover|Watch|Subscribe|Sign up|Click|Join us|Don['’]t miss|Check out|Here['’]s)\b|^(?:Imagine|Picture this|Pick|Buy|Try|Check|Make sure|Look (?:out )?for|Consider|Remember|Avoid|Choose|Be sure|Don['’]t forget|Think about)\b(?![-'’])(?!\s+(?:now|of|is|are|was|were|has|have|had|will|would|can|could)\b)/;
export const ownVoice = (t) => FIRST_PERSON.test(String(t).replace(/“[^”]*”|"[^"]*"/g, ' '));
// A headline in a columnist's own voice: "I don’t miss the camera on the Ray-Ban Meta Audio glasses", "We tried…", "Here’s
// why…". A headline that addresses its reader is news told to them ("Google wants to host your personal vibe-coded apps",
// "…an AI app that listens to you in the background"), and a "we" after "says" is the speaker's ("Cerebras CEO says we’re
// nearing…"): TECH BYTES of 14 Oct 00:00 held back seven such stories as columns and aired five. A promotion is PROMO_TITLE's.
export const columnVoice = (title) => {
  const t = String(title).replace(/“[^”]*”|"[^"]*"|‘[^’]*’/g, ' ').replace(/\b(?:says?|said|warns?|claims?|tells?|told)\b[\s\S]*$/i, ' ');
  return /\b(?:[Mm]y|me|[Ww]e|[Ww]e['’](?:re|ve|ll|d)|[Oo]ur|us|I['’](?:m|ve|d|ll))\b|(?:^|[^\w.])I (?=[a-z])|^I\s/.test(t) || /^(?:Learn|Find out|Read|Discover|Watch|Subscribe|Sign up|Click|Join us|Don['’]t miss|Check out|Here['’]s)\b/.test(t);
};
// Any verb at all, a sentence's least: an auxiliary, a past form (regular or a common irregular one), a present in -s
// after the first word
const IRREGULAR_PAST = /^(?:said|told|spoke|won|lost|beat|drew|shot|sank|stole|swore|tore|woke|bled|dealt|lit|sped|split|made|took|gave|came|went|saw|found|kept|became|brought|built|sold|paid|spent|set|put|ran|drew|flew|held|met|led|sent|wrote|fought|caught|thought|sought|stood|chose|froze|got|knew|meant|felt|heard|left|began|rose|fell|grew|hit|cut|shut|spread|hurt|cost|let|quit|struck|stuck|swept|fled|dug|hung|threw|wore|broke|ate|bought|taught|withdrew|arose)$/i;
const anyVerb = (t) => String(t).split(/\s+/).map((x) => x.replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '')).filter(Boolean).some((x, i) => /^(?:is|are|was|were|be|been|being|has|have|had|will|would|can|could|may|might|must|should|shall|does|do|did)$/i.test(x) || /n['’]t$/i.test(x) || IRREGULAR_PAST.test(x) || /^[a-z]{2,}ed$/.test(x) || (i > 0 && /^[a-z]{3,}(?:s|es)$/.test(x) && !/(?:ss|us|is|ics|ness|ings)$/.test(x)));
// A sentence that follows on in time ("He then served...", "The deputy then used...", "Later, ..."): told only
// after the sentence it follows.
// ("Realizing this, Windler...": a "this" before the first comma points back as much; so does "So it resorted to...",
// whose "it" was the sentence before)
const FOLLOWS_ON = /^(?:(?:then|later|afterwards|after that|subsequently),|(?:[\w’'-]+\s+){1,3}then\b|[^,]{0,30}\b(?:this|that)\s*,|(?:so|but|and|yet|still|instead|thus|hence)\s+(?:it|they|he|she|this|that|these|those)\b)/i;
// Names a viewer has heard: a sentence that brings in a product or a person the story never introduced ("The Air
// costs $99.99 and the Watch starts at $399.99", after a story about the Fitbit Edge) cannot answer a question.
const NEW_NAME = /(?<=\S\s+)\p{Lu}[\p{L}’'-]+/gu;
const introduced = (t, info) => (String(t).match(NEW_NAME) || []).every((n) => `${info.s.title} ${info.s.summary || ''}`.includes(n.replace(/['’]s$/u, '')));
/**
 * A sentence that can answer a question after its story: it may lean on the story just told ("The first laptops using
 * it will go on sale in the spring"), never on a sentence the viewer did not hear ("So it...", "This means...", "He
 * then..."), never names someone or something new, and quotes nobody without saying who.
 */
export const answerable = (t, info) =>
  !FOLLOWS_ON.test(t) && !/^(?:This|These|Those|Such|That|But|And|So|Yet|Still|However|Instead|Meanwhile)\b/.test(t) && !asks(t) && !/\(/.test(t) && introduced(t, info) && !(/^["“‘']/.test(t.trim()) && !/\b(?:said|says|told|added|according to|warned|wrote)\b/i.test(t));
// A question in the story's own voice (not inside a quotation): a feature's device, not a report.
const asks = (t) => /\?["”’]?\s*$/.test(String(t).trim()) && !/^["“‘]/.test(String(t).trim());
// News that is bad for someone, whatever the topic: a light topic's story said straight, not smiling.
const DOWNBEAT = /\b(?:slop|broken|backlash|resign\w*|surveillance|lawsuits?|sues?|sued|fined?|fines|breach\w*|hack(?:ed|ers?|s)?|outages?|bans?|banned|scams?|fraud\w*|lay-?offs?|job cuts|froze|frozen|freez\w*|paus\w*|halt\w*|probes?|investigat\w*|warn\w*|risks?|threat\w*|fears?|concerns?|harass\w*|abus\w*|deepfakes?|misinformation|disinformation|overwhelm\w*|shut(?:s|ting)? down|delay\w*|recall\w*|vulnerab\w*|exploit\w*|stolen|theft|disappears|removed|pulled)\b/i;
const CURIOUS = /\b(?:discover\w*|uncover\w*|rare|unexpected|surpris\w*|new species|first time|glowing)\b/i;
// A summary sentence that says what follows from the news (a purpose or a consequence).
const WHY =
  /\b(?:aims? to|so that|to help|in order to|which means|means that|(?:will|would|could|can|should) (?:help|cut|save|reduce|let|allow|make|carry|light|power|create|protect|improve|speed|bring|give|lower|ease|keep|feed|connect|double|halve)|to (?:cut|reduce|protect|improve|cool|save|ease|lower))\b/i;
// The sentence already says who says it: no "X reports" on top.
// (and what figures or a study show: "UK van drivers face extra £2.5bn in diesel costs this year, figures show, Guardian
// Business reports." once aired twice, round 5)
const OWN_ATTRIBUTION = /\b(?:says?|said|according to|reports?|reported|announced|told|officials|estimates?|shows?|showed|shown|found|finds|suggests?|suggested|warns?|warned|claims?|claimed)\b/i;
// Live pages: lines that point at the outlet's own coverage are not news.
// (and a press release's logistics: "The crew members will discuss their science mission during a news conference at
// 3:30 p.m. EDT...", NASA 9 Oct)
// (and the page's furniture read as news: "THIS IS A BREAKING NEWS UPDATE", ABC News; a picture's caption, "Plumes of black
// smoke rise from a Petro Dolphin oil tanker…", "…is seen…"; an outlet's standing policy, "The Associated Press doesn't name
// victims of alleged sexual violence"; a credit, "…contributed to this report"; real news 12-14 Oct)
// (and the page's own pictures: "The maps below show the average concentration of Antarctic sea ice…", NASA 12 Oct)
const LIVE_BOILERPLATE = /\bfollow (?:the day['’]s news|our live|all the latest) live\b|\b(?:maps?|charts?|graphics?|images?|videos?|photos?|tables?|graphs?|pictures?)\s+(?:below|above)\b|\b(?:shown|pictured|seen) (?:below|above)\b|\bsee (?:below|above)\b|\bBREAKING NEWS UPDATE\b|^(?:Photos?|Watch|Video|Listen|Gallery|In pictures)\s*:|\b(?:is|are) seen\b|\bpictured\b|\bin this (?:photo|picture|image|handout|undated)\b|^Plumes? of\b|\bdoes(?:n['’]t| not) (?:name|identify) (?:victims|people|minors)\b|\bcontributed to this report\b|^(?:follow|read|watch|see) (?:the |our |all the )?(?:latest|live|updates)|\blive updates?\b|\bas it happened\b|\bdoes not (?:offer|accept) (?:or accept )?money\b|\bfor coverage or interviews\b|\b(?:news|press) conference\b|\bmedia (?:briefing|teleconference)\b|\bwill (?:air|stream) live\b|\bNASA\+|^Update[sd]?\b[^:]{0,40}:|\b(?:article|story|post) (?:was|has been) updated\b|\b(?:has|have|brings us|with) the (?:latest|details|full story)\.?$|\bcoverage (?:begins|starts|will begin|will start)\b|\bis (?:speaking|talking|giving evidence|addressing [\w ]{2,30}) now\b|^(?:Some )?more (?:[A-Za-z-]+ )?reaction (?:to|from)\b|^(?:This|The|These)\s+(?:[\w-]+\s+){0,3}(?:image|images|photo|photograph|picture|view|map|animation|visuali[sz]ation|mosaic|composite)\b[^.]{0,120}\b(?:shows?|reveals?|captures?|depicts?)\b|^(?:Opaque|Bright|Dark|White|Red|Blue|Yellow|Green|Orange|Purple)\s+(?:white\s+)?(?:areas?|regions?|patches|dots|lines|streaks)\s+(?:indicate|show|represent|mark)\b|\bTechCrunch Disrupt\b|\bStartup Battlefield\b|\bDisrupt 20\d\d\b|\bBattlefield 200\b|\b[\w.+-]+@[\w-]+\.[\w.-]+\b|\bdownload the (?:pdf|full|report|paper)\b/i;

// The strap's kicker is the story's topic (server/topics.js, shared with the desk's programme beats).

// ---------------------------------------------------------------- the presenters' own lines (no facts, no figures)
// A line may carry `needs`: it is only used when the story's own words match
// (a line about "a researcher" never follows a story about rangers). Lines are
// picked by the episode seed, skipping the ones aired recently (24/7: no line
// should come round again within a long rotation).

const RESEARCH = /\b(?:researchers?|scientists?|study|studies|team|university|astronomers?|engineers?|archaeologists?|biologists?)\b/i;
const NATURE = /\b(?:bees?|birds?|animals?|species|tortoises?|leopards?|pandas?|whales?|turtles?|plants?|trees?|forests?|reefs?|corals?|mangroves?|mushrooms?|wildlife)\b/i;
const TRAVEL = /\b(?:trains?|trams?|buses|bus|ferr(?:y|ies)|flights?|airports?|tunnels?|metro|rail)\b/i;

// WORLD NOW, after "And finally" only: Paco's dry line, then Lola's deflation.
const WORLD_PAIRS = {
  HISTORY: [
    ['[nod] Older than this building, I suspect.', 'Older than your jokes, Paco. Just.'],
    ['Patience, it seems, is an archaeological virtue.', '[shrug] So is a very small brush.'],
    ['[nod] Some things are worth the wait.', 'Some of us are still waiting for the coffee machine.'],
  ],
  ASTRONOMY: [
    ['I may look up tonight.', '[shrug] Take a coat.'],
    ['[nod] Puts the commute in perspective.', 'Nothing puts your commute in perspective, Paco.'],
    ['A reminder of how small we are.', '[shrug] Speak for yourself.'],
  ],
  WILDLIFE: [
    ['[nod] Finally, some news nobody will complain about.', 'Give it an hour.'],
    ['[nod] They seem to be managing perfectly well without us.', 'Most things do, Paco.'],
    ['I am told they are camera shy.', '[shrug] Unlike some people at this desk.'],
  ],
  TRANSPORT: [
    ['[nod] On time, apparently. Imagine that.', 'I would rather not get my hopes up.'],
    ['I may take the long way home tonight.', 'You always take the long way home, Paco.'],
  ],
  'GREEN CITIES': [
    ['[nod] Quietly, that is the kind of thing that changes a city.', 'Quietly is how most good things happen.'],
    ['[nod] I approve. From a shaded bench, ideally.', 'We will find you one.'],
  ],
  OCEANS: [['[nod] Good to hear the sea is having a better day than most of us.', 'Low bar. But we will take it.']],
  any: [
    ['[nod] A good note to end on.', 'Rare enough that we should enjoy it.'],
    ['Well. That is the most cheerful thing I have read all day.', '[shrug] It is a low bar, Paco. But yes.'],
    ['I have nothing to add. A first.', 'Let the record show it.'],
    ['[nod] Some stories do not need us at all.', 'Do not tell the management.'],
    ['[nod] I will allow myself a small smile.', 'Steady, Paco. People are watching.'],
    ['Not every headline has to be bad.', 'Write that down. We may need it later.'],
    ['[nod] Quietly encouraging.', 'High praise, by your standards.'],
    ['That one I will be repeating at dinner.', '[shrug] Your guests have my sympathy.'],
    ['[nod] There is hope for us yet.', 'Let us not get carried away.'],
  ],
};
WORLD_PAIRS.SPACE = WORLD_PAIRS.ASTRONOMY;
// Pairs built from the story's own place ({place}), so a re-run of the same "And finally" reads differently.
const WORLD_PLACE_PAIRS = [
  ['[nod] Not the story I expected from {place} today.', 'A welcome one, though.'],
  ['[nod] I may have to visit {place}.', '[shrug] You say that about everywhere, Paco.'],
  ['Good news out of {place}, for once.', 'I will take it. Gladly.'],
  ['[nod] {Place} has improved my evening.', 'It does not take much, Paco.'],
  ['[nod] One more reason to keep an eye on {place}.', 'Noted, and filed.'],
];

/**
 * WHAT WE KNOW (programme "boards": ["known"]): up to three key points from the source's own sentences, their
 * short clauses with the attribution taken off ("X says about 1.2 million homes are without power and 40,000
 * people have gone to shelters" -> two points). Never a quote, a question or a clause that leans on another
 * ("it", "they"). The validator grounds them again, and drops a point whose figure the presenter does not say.
 */
const HARD_NEWS = new Set(['SECURITY', 'PRIVACY', 'BUSINESS', 'CLIMATE', 'CONFLICT', 'CRIME', 'MIGRATION', 'ACCIDENTS', 'EARTHQUAKE', 'ECONOMY', 'ELECTIONS', 'ENERGY', 'HEALTH', 'INDUSTRY', 'JOBS', 'JUSTICE', 'MARKETS', 'POLITICS', 'PROTESTS', 'TRADE', 'TRANSPORT', 'VOLCANO', 'WATER', 'WEATHER', 'WILDFIRE', 'WORLD']);
// a reason, a judgement or a forecast: someone's word, never the channel's
const JUDGEMENT = /\b(?:precaution\w*|necessary|unnecessary|safe|unsafe|aim\w*|intend\w*|designed|because|protect\w*|justif\w*|legitima\w*|threat\w*|priorit\w*|responsib\w*|blam\w*|lies?|unfair|illegal|wrong|best|worst|must|should|needs?|will|would|could|may|might|expect\w*|believe\w*|plans?|planned|likely|fears?|feared|warn\w*|deliberate\w*)\b/i;
export function knownPoints(sentences, max = 3) {
  const out = [];
  for (const raw of sentences) {
    if (out.length >= max) break;
    let t = String(raw).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[“”"?«»]/.test(t)) continue;
    const stripped = t
      .replace(/,\s*(?:according to [^,.]+|(?:the )?[\w’' -]{2,40}? (?:says|said|reports|reported))\.?$/i, '')
      .replace(/^(?:according to [^,]+,\s*)/i, '')
      .replace(/^[^,]{0,60}?\b(?:says|said|reports|reported|confirmed)\s+(?!to\b)(?:that\s+)?/i, '');
    // attribution comes off a count ("the agency says about 1.2 million homes are without power"), never off a
    // claim: "Geffray said the closures were a security precaution" is the minister's word, so it keeps it (or,
    // too long for the board, is left out)
    const attributed = stripped !== t;
    const trailing = attributed && /,\s*(?:according to [^,.]+|(?:the )?[\w’' -]{2,40}? (?:says|said|reports|reported))\.?$/i.test(t);
    // (a range is one figure: "between 50 and 100 editorial redundancies" once made two points, Guardian 10 Oct)
    for (const clause of stripped.split(/,\s*and\s+|;\s*|(?<!\bbetween\s+[\d.,]+(?:\s*(?:%|per cent|percent|million|billion|m|bn|k))?)\s+and\s+(?=(?:about |more than |nearly |some |at least )?\d)/i)) {
      let c = clause.replace(/[.!,;:]+$/, '').trim();
      // (a fact after ", officials said" stands without it: "Nearby roads were closed")
      if (attributed && !/\d/.test(c) && !(trailing && !JUDGEMENT.test(c))) c = stripped.split(/,\s*and\s+|;\s*/).length === 1 ? t.replace(/[.!,;:]+$/, '').trim() : '';
      if (!c || /^(?:that|there|which|who|but|so|also|to|of|for|with|between)\b/i.test(c) || /\b(?:it|its|they|their|them|this|these|those|he|she|his|her)\b/i.test(c)) continue; // a point stands alone
      const words = c.split(' ').length;
      if (words < 3 || words > 9 || c.length > KNOWN_MAX) continue;
      if (/\s[–—-]\s/.test(c) || !hasFiniteVerb(c)) continue; // a statement with a verb of its own, not a noun phrase
      // (and a subject of its own: "Have started preparing / Had started preparing" once filled a WHAT WE KNOW board, the
      // second half of "…say they are worried, and have started preparing", BBC 12 Oct)
      if (/^(?:have|has|had|is|are|was|were|will|would|can|could|may|might|must|should|been|being|did|does|do|[a-z]+ed)\b/i.test(c)) continue;
      c = c[0].toUpperCase() + c.slice(1);
      const core = (x) => x.toLowerCase().replace(/\b(?:have|has|had|is|are|was|were|the|a|an)\b/g, '').replace(/\s+/g, ' ').trim();
      if (!out.some((x) => core(x) === core(c))) out.push(c);
      if (out.length >= max) break;
    }
  }
  return out;
}

/**
 * HOW WE GOT HERE (programme "boards": ["timeline"]): dated steps from the source's own sentences. A sentence that
 * says when something happened ("In 2019 the bridge was declared unsafe", "Repairs began in March 2023") gives a
 * step its year (and month) and its clause, the date and the attribution taken off. A span ("since 2019", "by
 * 2030"), a plan, a forecast, a quote or a clause that leans on another line is no step. Two or three, one a date,
 * in date order (the latest ones when there are more); the validator grounds them again.
 */
const TL_MONTH = '(January|February|March|April|May|June|July|August|September|October|November|December)';
const TL_DATE = new RegExp(`\\b(?:in|during)\\s+(?:(?:early|late|mid-?)\\s*)?(?:${TL_MONTH}\\s+)?((?:19|20)\\d\\d)\\b(?!s)`, 'i');
const TL_DAY = new RegExp(`\\bon\\s+(?:\\d{1,2}\\s+${TL_MONTH}|${TL_MONTH}\\s+\\d{1,2}),?\\s+((?:19|20)\\d\\d)\\b`, 'i');
const TL_NOT_A_STEP = /\b(?:will|would|could|may|might|plans?|planned|expects?|expected|aims?|until|since|before|after|by (?:19|20)\d\d)\b/i;
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
export function timelinePoints(sentences, year = new Date().getUTCFullYear(), max = 3) {
  const steps = [];
  for (const raw of sentences) {
    const t = String(raw).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[“”"?«»]/.test(t) || TL_NOT_A_STEP.test(t)) continue;
    let m = TL_DATE.exec(t);
    let month = null;
    let yr = 0;
    if (m) {
      month = m[1] || null;
      yr = Number(m[2]);
    } else {
      m = TL_DAY.exec(t);
      if (!m) continue;
      month = m[1] || m[2];
      yr = Number(m[3]);
    }
    if (yr > year) continue;
    // the clause without its date: "In 2019, the bridge was declared unsafe" -> "the bridge was declared unsafe"
    let c = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+,/g, ',').replace(/^\s*,\s*/, '').replace(/\s+/g, ' ').trim();
    c = c.replace(/,\s*(?:according to [^,.]+|(?:the )?[\w’' -]{2,40}? (?:says|said|reports|reported))\.?$/i, '').replace(/^(?:according to [^,]+,\s*)/i, '');
    c = c.split(/,\s*(?:and|but|which|while|when|after|as)\s+|;\s*|\s+[–—-]\s+/)[0].replace(/[.!,;:]+$/, '').trim();
    if (!c || /^(?:that|there|which|who|but|so|also|and|then)\b/i.test(c) || /\b(?:it|its|they|their|them|this|these|those|he|she|his|her)\b/i.test(c)) continue;
    const words = c.split(' ').length;
    if (words < 2 || words > 7 || c.length > TIMELINE_MAX || !hasFiniteVerb(c)) continue;
    const key = yr * 12 + (month ? MONTH_NAMES.indexOf(month.toLowerCase()) : 0);
    if (steps.some((x) => x.key === key)) continue;
    steps.push({ key, when: month ? `${month[0].toUpperCase()}${month.slice(1).toLowerCase()} ${yr}` : String(yr), what: c[0].toUpperCase() + c.slice(1) });
  }
  steps.sort((a, b) => a.key - b.key);
  return steps.slice(-max).map(({ when, what }) => ({ when, what }));
}

/**
 * FROM → TO (programme "boards": ["change"]): a figure the story says moved ("raised its main interest rate from
 * 4.5% to 4.75%", "Inflation fell to 2.1% from 2.6%"): the two values as written and what moved, the object of a
 * verb that moves it or the subject of one that moves (at most four words, no pronoun). The validator grounds it.
 */
const MOVE_T = /\b(raised|raises|cut|cuts|lowered|lowers|increased|reduced|lifted|hiked|trimmed|slashed|boosted|doubled|halved)\s+((?:its|their|the|a|his|her)\s+)?([\p{L}’'-]+(?:\s+[\p{L}’'-]+){0,3}?)\s*$/iu;
const MOVE_I = /(?:^|[,;]\s*|\b(?:the|its|their)\s+)([\p{L}’'-]+(?:\s+[\p{L}’'-]+){0,3}?)\s+(?:has\s+|have\s+|had\s+)?(rose|risen|rises|fell|fallen|falls|climbed|climbs|dropped|drops|jumped|jumps|slipped|slips|surged|surges|grew|grown|grows|declined|declines|increased|increases|decreased|decreases|edged\s+(?:up|down)|went\s+(?:up|down))\s*$/iu;
const NOT_LABEL = /^(?:it|they|this|that|these|those|he|she|which|who|there|prices?\s+have)$/i;
export function changeFrom(sentences) {
  for (const raw of sentences) {
    const t = String(raw).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[“”"?«»]/.test(t)) continue;
    const ns = numbersIn(t).filter((n) => !(Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100 && !n.percent && !n.currency));
    for (let i = 0; i < ns.length; i++) {
      for (let j = 0; j < ns.length; j++) {
        if (i === j || ns[i].scaled === ns[j].scaled) continue;
        const a = ns[i], b = ns[j]; // a: from, b: to
        const pre = (n) => t.slice(Math.max(0, n.index - 16), n.index);
        if (!/\bfrom\s+(?:about |around |nearly |almost |roughly |some )?$/i.test(pre(a)) || !/\bto\s+(?:about |around |nearly |almost |roughly |some )?$/i.test(pre(b))) continue;
        const first = Math.min(a.index, b.index);
        const head = t.slice(0, first).replace(/\s*\b(?:from|to)\s+(?:about |around |nearly |almost |roughly |some )?$/i, '').trim();
        const mt = MOVE_T.exec(head);
        const mi = mt ? null : MOVE_I.exec(head);
        let label = mt ? mt[3] : mi ? mi[1] : '';
        label = label.replace(/^(?:the|its|their|a)\s+/i, '').trim();
        if (!label || NOT_LABEL.test(label) || label.length > 24 || /\d/.test(label)) continue;
        const said = (n) => t.slice(n.index, n.end).trim();
        return { from: said(a), to: said(b), label: label.toUpperCase() };
      }
    }
  }
  return null;
}

// WORLD NOW (long programmes): the partner adds one detail the story kept back, soberly (no question marks).
const WORLD_ADD = ['[nod] And one detail worth adding:', '[nod] Worth adding:', '[look_partner] And the context here:', '[nod] One more line from the report:', '[nod] And this matters too:'];

/** PACE: the story the mid-programme "Still to come" rides on: a main story near the middle of the running order. */
function midStory(order, roundup, lighter, number) {
  // the signpost airs as the reader's own short line after the story (a chat segment the validator keeps
  // next to grave news too: it is no banter)
  // (grave news around it is fine: "Still to come" is said soberly; the story it names is never a grave one)
  const ok = (i) => order[i] && !roundup.includes(order[i]) && order[i] !== lighter && order[i] !== number && !order[i].live;
  const mid = Math.floor(order.length / 2) - 1;
  for (let d = 0; d < order.length; d++) for (const i of [mid - d, mid + d]) if (i >= 1 && i < order.length - 2 && ok(i)) return i;
  return -1;
}

// TECH BYTES, THE CATCH: Ada asks what a remaining summary sentence answers; Max answers with it.
// Each question has several phrasings: a 24/7 rotation must not hear the same one every half hour.
const CATCH = [
  // (a price said, not a word: "Open-weight models can be significantly more cost-efficient…" once answered "what will all this
  // cost?", TechCrunch 15 Oct)
  { test: /[$£€]\s?\d|\b\d[\d,.]*\s*(?:dollars|euros|pounds)\b|\bpriced at\b|\bcosts?\s+(?:about\s+|around\s+|just\s+|only\s+)?(?:[$£€]|\d)|\bprice (?:tag|of|is|will)\b|\bfree to (?:try|play|use)\b/i, q: (max) => [`[glasses] ${max}, the question everyone asks. What does it cost?`, '[glasses] And the price tag?', `[chin] ${max}, what will all this cost?`] },
  // (not how long something stops: "paused its bug bounty program until next year" has no launch to wait for, 5 Oct)
  { test: /(?<!\b(?:until|till|through|for the rest of)\s)\b(?:next year|this year|later this year|next month|in the (?:spring|summer|autumn|winter)|on sale|go on sale|launch(?:es)? (?:in|next)|from next|by \d{4})\b/i, q: () => ['[chin] And when does it reach actual people?', '[chin] When can anyone actually use it?', '[glasses] And the timetable?'] },
  // what happens now: a deadline, a plan, an appeal ("The task force will reportedly have 120 days to create a report")
  // (not any "will": "The line will carry 40,000 passengers a day" is the story's figure, not what comes next)
  // (nor an appeal already decided: "…rejected after an appeal by the developer was dismissed" once answered "And from
  // here?", BBC 12 Oct, round 5)
  { test: /\b(?:plans? to|(?:is|are) expected to|(?:is|are) set to|will (?:now|next|then|decide|vote|rule|review|report|consider|appeal)|next (?:week|step|steps)|within \d+ (?:days|weeks|months)|(?:have|has) \d+ (?:days|weeks|months) to|deadline|(?:will|could|may|can|plans? to|intends? to|expected to) (?:\w+ )?appeal|right to appeal|lodge an appeal|appeal hearing)\b/i, q: () => ['[chin] And what happens now?', '[chin] So what comes next?', '[glasses] And from here?'] },
  // who it touches, when the story says who
  // (never answered by money: "Who is this for, exactly?" once had Netflix's revenue and its 325 million subscribers, 15 Oct)
  { test: /^(?!.*\b(?:revenue|income|profits?|earnings|sales)\b)(?!.*[$£€]\s?\d).*\b(?:users|customers|owners|drivers|patients|developers|consumers|subscribers|players|parents|families|small businesses|people who)\b/i, q: () => ['[chin] And who does this actually affect?', '[glasses] Who is this for, exactly?', '[chin] So who notices the difference?'] },
  // where the law stands, when a court, a regulator or a law is in it
  // (a court or a regulator deciding, not a word: "beyond “specific rules or new laws,”" answers nothing)
  { test: /\b(?:ruled|ruling|court|judge|unconstitutional|unlawful|illegal|precedent|warrant|regulators? (?:say|said|ruled|approved|fined|ordered))\b/i, q: () => ['[steeple] And where does the law stand?', '[steeple] And the legal position?', '[chin] So where does that leave the rules?'] },
  { test: /\b(?:using|uses|by (?:using|\w+ing)|works (?:by|without)|without an?)\b/i, q: () => ['[chin] How does it actually work?', '[chin] Walk me through how it works.', '[glasses] And the clever part is?'] },
  // the catch itself, last: a "but" is in most stories
  // (a limit, not any "but": "…costs $179.99 and has a sleek feel like the Fitbit Air but with an OLED display" once
  // answered "So what is the catch?", The Verge 12 Oct)
  { test: /\b(?:however|although|not yet|no longer|limited to|only (?:works|available|in|for|on)|isn['’]t (?:yet|available|clear)|won['’]t|can['’]t|doesn['’]t|but (?:not|no|it|the|there|that|users|critics|some|many|experts|analysts))\b/i, q: () => ['[steeple] So what is the catch?', '[chin] There is always a but. What is it here?', '[steeple] And the small print?'] },
];
// FULL TIME, THE BREAKDOWN (docs/programmes/full-time.md §4): Kai asks the question a story's context answers and Rosa
// answers with that sentence of the story: the record or the wait, the table, what comes next, what they said. Never
// an opinion: the sentences have already lost the outlets' verdicts (server/sport/prepare.js).
// (a run that went wrong is no "moment": "A second loss in three games comes after an unbeaten five-game start" is asked
// about as form, never "How big a moment is that?")
const FORM_DOWN = /\b(?:loss|losses|defeat|defeats|lost|beaten|winless|losing|conceded|sacked|relegat\w*|bottom|slump\w*)\b/i;
const BREAKDOWN = [
  { test: /\b(?:first\s+(?:[\w-]+\s+){0,5}since|for the first time (?:in|since)|in \d+ years|\d+-year wait|(?:end(?:s|ed)?|snap(?:s|ped)?) (?:a|an|their|his|her|its) (?:[\w-]+\s+){0,3}(?:wait|run|drought|streak)|records?|unbeaten|consecutive|in a row|straight (?:wins|defeats|victories)|losing streak|winless run|back-to-back|youngest|oldest)\b/i, q: (rosa, t) => (FORM_DOWN.test(t || '') ? [`[look_partner] Put that in context for us, ${rosa}.`, `[lean_in] How has their form been, ${rosa}?`, `[look_partner] ${rosa}, how had they been going before this?`] : [`[lean_in] ${rosa}, how long has that been coming?`, `[look_partner] Put that in context for us, ${rosa}.`, '[lean_in] How big a moment is that?']) },
  { test: /\b(?:top of the (?:table|league)|bottom of the (?:table|league)|relegation zone|drop zone|points? (?:clear|behind|adrift|ahead|off)|\d+(?:st|nd|rd|th) place|league leaders|title race|play-off (?:places?|spots?)|top four|top half|bottom three|standings|out of the (?:relegation|drop) zone)\b/i, q: (rosa) => [`[look_partner] Where does that leave them, ${rosa}?`, '[lean_in] And what does that do to the table?', `[look_partner] And the table, ${rosa}?`] },
  { test: /\b(?:will (?:face|host|play|meet|travel|visit|take on)|(?:face|host|play|meet|visit) \p{Lu}[\p{L}'’-]+ (?:on|next|in)|second leg|next (?:up|week|game|match|month)|before (?:the|their) (?:next|return))\b/iu, q: (rosa) => [`[look_partner] What's next for them, ${rosa}?`, '[lean_in] And what comes next?', `[look_partner] Where do they go from here, ${rosa}?`] },
  { test: /["“][^"”]{12,}["”]/, q: (rosa) => [`[look_partner] What are they saying, ${rosa}?`, '[lean_in] And the reaction?', `[look_partner] What did they make of it, ${rosa}?`] },
];
// FULL TIME, after the moment of the day: one of Rosa's (fictional) memories of her playing days and Kai's reply
// (server/sport/shape.js, where the edition without a moment has them before its sign-off).

// COSMOS DESK, UNIT-8 ASKS: the robot asks Dr Reyes the literal question a story leaves (how far, how long ago, how
// big, how they know, what comes next, what it means) and she answers with the story's own sentence. Each type
// once a programme; several phrasings for a 24/7 rotation; UNIT-8 is never rude, only exact.
const ASK = [
  { test: /\b\d[\d,.]*\s*(?:million |billion )?(?:light[- ]years?|kilomet(?:re|er)s?|km|miles|astronomical units?)\b/i, q: () => ['[chin] Dr Reyes, how far is that, exactly?', '[chin] And the distance, Dr Reyes?', '[nod] I require the distance, Dr Reyes.'] },
  { test: /\b(?:\d[\d,.]*|a few|several|hundreds of|thousands of|millions of)\s+(?:million |billion |thousand )?years? (?:ago|old|earlier|later)\b/i, q: () => ['[chin] Dr Reyes, how long ago was that?', '[chin] And when, Dr Reyes?', '[nod] I would like the date, Dr Reyes.'] },
  { test: /\b(?:times (?:the size|larger|bigger|heavier|wider|smaller)|diameter|kilomet(?:re|er)s? (?:wide|across|long)|(?:metres|meters) (?:tall|high|long|wide)|the size of)\b/i, q: () => ['[chin] How large, Dr Reyes?', '[nod] I require a sense of size, Dr Reyes.', '[chin] And how big is it?'] },
  // (a method said, not just named: "the study team retained control over the analysis" answers nothing)
  { test: /\b(?:measured|measurements? (?:of|from|show)|observations? (?:of|from|show)|observed|data from|samples? (?:taken|collected|from)|simulations? show|scans? (?:of|show)|using (?:a |the )?(?:telescope|satellite|probe|rover|scanner|microscope|spectrometer|radar|sensors?)|crystals? show|randomi[sz]ed|followed \d[\d,]* (?:people|adults|patients|participants))\b/i, q: () => ['[chin] How do they know, Dr Reyes?', '[chin] Dr Reyes, how was this measured?', '[nod] What is the evidence, Dr Reyes?'] },
  // (a plan as a verb, never someone's plan as a noun: "Locals… have long opposed Trump's plan to redevelop a… golf course"
  // once answered "What happens next, Dr Reyes?", NPR 14 Oct)
  { test: /(?<!(?:['’]s|\bthe|\ba|\bits|\btheir|\bhis|\bher|\bour|\bwhose)\s)\bplans? to\b|\b(?:(?:is|are) expected to|(?:is|are) set to|next (?:year|month|step)|will (?:launch|land|fly|return|begin|start)|the next mission)\b/i, q: () => ['[chin] What happens next, Dr Reyes?', '[nod] And next, Dr Reyes?', '[chin] Dr Reyes, what is the next step?'] },
  { test: /\b(?:could|may|might) (?:help|explain|lead|point|mean|allow|make|change|reveal)\b/i, q: () => ['[chin] What does it mean, Dr Reyes?', '[chin] Dr Reyes, why does it matter?', '[nod] And the significance, Dr Reyes?'] },
];
// The button after "And finally", by what kind of story it was: a thing you can hold, software (an AI, an app, a
// game: nothing to take apart or buy; "I want to take it apart" once followed an AI cheating at StarCraft, 4 Oct),
// or science.
const PRODUCT_KICKERS = new Set(['GADGETS', 'ROBOTICS', 'CHIPS', 'CONNECTIVITY', 'MOTORING']);
const SOFTWARE_KICKERS = new Set(['AI', 'SOFTWARE', 'GAMING']);
const CHEAT = /\b(?:cheat\w*|broke the rules|breaking the rules|rule-breaking|gam(?:ed|ing) the system)\b/i;
const TECH_BUTTONS = {
  software: {
    ada: [
      '[chin] I would like to see the figures from someone who is not selling it.',
      '[chin] Noted. I will be checking its work.',
      '[shrug] Impressive. Also slightly worrying. Mostly impressive.',
      { text: '[chin] Somebody is going to have to write that rule down more carefully.', needs: CHEAT },
    ],
    max: [
      '[nod] Clever. Quietly, properly clever.',
      '[shrug] Software with ambition. What could possibly go wrong.',
      { text: '[raise_hand] For the record, I have never cheated at a game. Recently.', needs: CHEAT },
      { text: '[nod] In fairness, it did find the quickest way to win.', needs: CHEAT },
    ],
  },
  product: {
    ada: [
      '[shrug] We will see how it holds up outside the press release.',
      '[chin] Promising. I will believe it when it survives its first software update.',
      '[chin] I would like to see the figures from someone who is not selling it.',
      '[nod] Fine. Wake me when it ships.',
      '[shrug] The second version is usually the one to buy.',
    ],
    max: [
      '[raise_hand] For the record, I would like one. Purely for research.',
      '[nod] Clever. Quietly, properly clever.',
      '[nod] I want to take it apart. Respectfully.',
      '[shrug] My wallet has already left the building.',
      '[nod] The engineer in me approves. The accountant in me is less sure.',
    ],
  },
  science: {
    ada: ['[nod] No launch event, no price tag. I approve.', '[nod] Fair enough. That one I like.', '[chin] Careful work, done properly. Rarer than it should be.', '[nod] That is what patience buys you.'],
    max: [
      '[nod] I have questions. Most of them start with how.',
      { text: '[look_partner] Somewhere, a researcher is very pleased with themselves. Rightly.', needs: RESEARCH },
      { text: '[nod] Nature, out-engineering us again.', needs: NATURE },
      { text: '[nod] I will be reading the paper tonight. All of it.', needs: RESEARCH },
      '[chin] Not a gadget in sight, and still the best story of the day.',
    ],
  },
};

// COSMOS: UNIT-8's literal line after "And finally".
const UNIT8_LINES = {
  ASTRONOMY: [
    'I will keep one sensor pointed upwards, Dr Reyes. For the record.',
    '[nod] I have adjusted my sense of scale.',
    'I have recalculated how small we are, Dr Reyes. The result is consistent.',
    '[nod] Logged. I find the distances reassuring.',
  ],
  any: [
    '[nod] Logged under good news, Dr Reyes. The file is short. I am glad to add to it.',
    'I have no further data, Dr Reyes. I find I do not mind.',
    '[nod] My circuits remain calm. This is how I express enthusiasm.',
    '[nod] Filed. Cross-referenced. Quietly appreciated.',
    '[nod] A satisfying result. I have saved it twice.',
    'I have flagged that one as hopeful, Dr Reyes. It is a new category.',
  ],
};
UNIT8_LINES.SPACE = UNIT8_LINES.ASTRONOMY;
// UNIT-8 after the lead, when the lead has no figure to repeat.
const UNIT8_NOTED = ['[nod] Logged, Dr Reyes.', '[nod] Filed under remarkable.', '[nod] Recorded. I will be thinking about that one.', '[nod] Understood, Dr Reyes. Logged.', '[nod] Entered in the record. With a small flag.'];
// (nine: a COSMOS told at the depth its length needs asks UNIT-8 more often, and four rotations once heard one twice)
// (the name in the first sentence: "Thank you. Exactly right, UNIT-8." and "Good. Thank you, UNIT-8." aired cut after their comma in
// the replays, "Thank you. Exactly right,"; the cut was not traced, round 5)
const NOVA_THANKS = ['Thank you, UNIT-8.', 'Precise as ever, UNIT-8.', 'Noted, UNIT-8. Thank you.', 'Exactly right, UNIT-8. Thank you.', '[nod] Quite so, UNIT-8.', 'Clear as always, UNIT-8.', '[nod] Thanks, UNIT-8. That helps.', 'Good, UNIT-8. Thank you.', '[nod] Well put, UNIT-8.'];
// The tail of UNIT-8's restatement ("40,000. Logged."): one shape per episode, rotated across episodes.
const UNIT8_RESTATE = ['Logged.', 'Stored, Dr Reyes.', 'I have checked it twice.', 'That is now on file.', 'Confirmed.', 'Recorded, with interest.', 'I will not forget it.'];
// Nova hands the number of the day to UNIT-8 (it is his story), not in the same words every time.
// (no sentence shared with NOVA_THANKS: "Thank you, UNIT-8." from both pools aired twice in four rotations)
const NOVA_TO_NUMBER = [
  '[look_partner] UNIT-8, you have our number of the day.',
  '[look_partner] UNIT-8, our number of the day.',
  '[look_partner] And UNIT-8 has our number of the day.',
  '[look_partner] Over to UNIT-8 for our number of the day.',
];

// Programmes without a chat policy: a short dry reaction after a light story.
const CHATS = {
  paco: ['[nod] Well. Not a sentence I expected to read tonight.', '[nod] File that under good news. We do have some.', '[nod] I shall allow it.'],
  lola: ['[chin] Not what I expected when I came in this morning.', '[nod] Some good news, for once.', '[nod] I will take that.'],
  max: ['[nod] Clever. Quietly, properly clever.', '[look_partner] I did not see that one coming.', '[nod] Engineers, doing engineer things.'],
  ada: ['[nod] Fair enough. That one I like.', '[chin] I will want to see how that plays out.', '[shrug] Cautiously impressed.'],
  nova: ['[chin] Every answer comes with a new question attached. That is the job.', '[steeple] Science at its best: patient, careful and slightly stubborn.', '[nod] Lovely work.'],
  unit8: UNIT8_LINES.any,
  penny: ['[nod] Worth keeping an eye on.', '[nod] One to watch.'],
  sam: ['[nod] Quick one, but worth knowing.', '[nod] Worth a second look.'],
};
const GENERIC_CHATS = ['[nod] Remarkable. Moving on.', '[chin] Something to think about.', '[nod] Well, there we are.', '[nod] Interesting times.'];

// ---------------------------------------------------------------- helpers

// FNV-1a: stable variety from story ids.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const choose = (list, key) => list[hash(key) % list.length];
const lineText = (line) => (typeof line === 'string' ? line : line.text);
const plainLine = (line) => lineText(line).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
// A line's sentences, as the station remembers aired chat lines (one sentence each).
const lineSentences = (line) => plainLine(line).split(/(?<=[.!?])\s+/).filter(Boolean);

/**
 * A presenter line for this story: only lines whose `needs` the story's words
 * meet, the one aired longest ago first (never aired before all others), ties
 * in an order seeded by `key`. `recent` maps a plain sentence to when it last
 * aired (a higher number is more recent), across the station's last hours.
 */
function chooseFresh(list, key, { recent = null, text = '' } = {}) {
  const fits = list.filter((l) => typeof l === 'string' || !l.needs || l.needs.test(text));
  const pool = fits.length ? fits : list.filter((l) => typeof l === 'string');
  if (!pool.length) return null;
  const start = hash(key) % pool.length;
  let best = null;
  let bestAge = Infinity;
  for (let k = 0; k < pool.length; k++) {
    const line = pool[(start + k) % pool.length];
    const age = recent ? Math.max(-1, ...lineSentences(line).map((x) => (recent.has(x) ? recent.get(x) : -1))) : -1;
    if (age < bestAge) {
      best = line;
      bestAge = age;
    }
  }
  return lineText(best);
}
/** Has any sentence of this line aired in the station's memory? */
const airedBefore = (line, recent) => !!recent && lineSentences(line).some((x) => recent.has(x));

// (an acronym in brackets after its name is page furniture: "A team, from Queen's University Belfast (QUB), are
// heading to Florida" is said without it, and can open its story; BBC 5 Oct)
// (so is a one-word gloss: "viruses known as bacteriophages (phages)", ScienceDaily 9 Oct)
// A feed's broken sentence is no sentence: "1 from Vandenberg Space Force Base in California." (NASA 9 Oct: the launch
// date before it was lost with its "Nov."), or one that starts in lower case.
const brokenQuote = (t) => {
  const curlyOpen = (t.match(/“/g) || []).length;
  const curlyClose = (t.match(/”/g) || []).length;
  const straight = (t.match(/"/g) || []).length;
  return curlyOpen !== curlyClose || straight % 2 === 1;
};
const FRAGMENT = /^(?:\d[\d,.]*\s+(?:from|of|to|in|at|on|by|for|and|or|with|than)\b|[a-z][a-z'’-]*[\s,.;:!?])/; // ("iPhone", "eBay" are names)
// (a gallery's caption has no verb: "From a flat in a new urban village in London to a family-sized home in a rural village
// in Norfolk.", Guardian 9 Oct)
const VERBLESS = (t) => /^(?:From|Between|Among|Like|Unlike|Beyond)\b/.test(t) && !hasFiniteVerb(t);
// A text's sentences that stand outside any quotation. A quotation of several sentences: the ones after its first are the
// speaker's words, never the outlet's. '\u201CThat guarantees success. It\u2019s one of the biggest commitments in history for
// anything. It\u2019s one of the biggest deals ever made.\u201D' aired as "It\u2019s one of the biggest commitments in history for
// anything, ABC News reports"; a victim's "My other child was screaming\u2026" and a manager's "We started the second half
// well\u2026" aired in the presenter's own voice (replays of 12-16 Oct). A paragraph starts outside any quotation, and one
// left open past five sentences is a lost mark, not a speech.
const outsideQuotes = (text) => {
  const out = [];
  let curly = 0;
  let straight = false;
  let run = 0;
  let at = 0;
  for (const t of sentencesIn(text)) {
    const i = text.indexOf(t, at);
    if (i < 0 || text.slice(at, i).includes('\n')) curly = 0, straight = false, run = 0;
    if (i >= 0) at = i + t.length;
    if (!(curly > 0 || straight)) out.push(t);
    curly = Math.max(0, curly + (t.match(/\u201C/g) || []).length - (t.match(/\u201D/g) || []).length);
    if ((t.match(/"/g) || []).length % 2) straight = !straight;
    run = curly > 0 || straight ? run + 1 : 0;
    if (run > 5) curly = 0, straight = false, run = 0;
  }
  return out;
};
const sentencesOf = (s) =>
  outsideQuotes(String(s || '').replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, ''))
    .filter(Boolean)
    .map((t) => t.replace(/\s*\((?=[A-Za-z&]*[A-Z][A-Za-z&]*[A-Z])[A-Za-z&]{2,8}\)(?=[\s,.;:!?]|$)/g, '').replace(/\s*\([a-z][a-z-]{2,20}\)(?=[\s,.;:!?]|$)/g, ''))
    // (a blockquote's ">" is page furniture: "> The outputs of this opt-in vulnerability scanner...", The Verge 9 Oct)
    .map((t) => t.replace(/^\s*>+\s*/, ''))
    // (an outlet's label is no news: "Exclusive: Firms made more than £340m...", Guardian 9 Oct; nor is a currency
    // conversion in brackets: "$20 billion (€17.8bn)", Euronews 9 Oct)
    .map((t) => t.replace(/^(?:Exclusive|Revealed|Analysis|Opinion|Explainer|Watch|Live|Update|Breaking)\s*:\s*(?=\p{Lu})/u, '').replace(/\s*\((?:€|£|\$|US\$|A\$|C\$|¥)\s?[\d.,]+\s*(?:bn|m|k|billion|million|trillion|tn)?\)/g, ''))
    // (a quotation cut in two is no sentence: 'Way too close to comfort." Radars and telescopes...', Ars Technica 9 Oct)
    .filter((t) => !FRAGMENT.test(t.trim()) && !brokenQuote(t) && !VERBLESS(t.trim())); // never inside a figure, a title or initials
// (a clause cut after a quote's own comma or at a dash ends clean: 'a factor called "local pH,".' and 'a blow to AISI -.'
// aired, ScienceDaily and the BBC 12 Oct)
const unstop = (t) => String(t).trim().replace(/[,;:]+(["”’)]+)[.!?]?$/, '$1').replace(/[\s.!?:;,–—-]+$/, '');
const asSentence = (t) => (/[.!?…]["”'’)]$/.test(String(t).trim()) ? String(t).trim() : `${unstop(t)}.`); // '…real-time."' is already one
const wordCount = (t) => String(t).replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
const firstName = (p) => String(p?.name || 'my colleague').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];
const lowerArticle = (by) => by.replace(/^(The|A|An) /, (m) => m.toLowerCase());
// A sentence can follow "According to X," only if its first word is not a name.
const COMMON_START = /^(?:A|An|The|This|These|Those|Its|Their|Some|More|Most|Many|Several|Scientists|Researchers|Officials|Astronomers|Archaeologists|Rangers|Volunteers|Engineers|Doctors|Nurses|Experts|Shops|Traders|Policymakers|Curators|Investors|Workers|Students|Residents|Visitors|Users|Strong|Heavy|Rail|Oil|Coffee|Rice|Prices|Sales|Shares|Stocks|Emergency|Local|Firefighters|Organisers|Unions?|Hospitals?|Thousands|Hundreds|Dozens|Ten|Two|Three|Four|Five|Farmers|Fishermen|Families|Passengers|Drivers|Teachers|Judges|Lava|Flights|Ferries|Trains|Schools|Tourists|Police|Temperatures|Firefighters|Rescuers|Hospitals|Airports|Storms|Unions|Commuters|Shoppers|Engineers|Bees|Drones|Rangers|Volunteers|Hotels|Repair|Roads)\b/;
const lcFirst = (s) => (COMMON_START.test(s) ? s[0].toLowerCase() + s.slice(1) : null);

/**
 * A headline as the middle of a spoken sentence ("Also coming up: a startup
 * launches..."): its first word goes lower-case only when it is clearly a
 * common word (on the starter list, or written in lower case elsewhere in the
 * story), never a name or a place.
 */
function lowerFirstWord(text, info) {
  const m = String(text).match(/^([A-Z][a-z'’-]*)(\s|$)/);
  if (!m || m[1] === 'I') return text;
  const word = m[1];
  // (and with its possessive: "Still to come: india's 'Cockroach' protest leaders freed", WORLD NOW 12 Oct)
  const base = word.replace(/['’]s$/, '');
  if (lookupPlace(word) || lookupPlace(base) || /^[A-Z][a-z]+[A-Z]/.test(word) || DEMONYM.test(word) || DEMONYM.test(base)) return text;
  // the headline ends a sentence of its own: "...space station. Astronauts on..." is not a name mid-sentence
  const story = `${String(info.s.title).replace(/[.!?]*$/, '.')} ${info.s.summary || ''} ${info.s.body || ''}`;
  // (in words, not in a link: "…/hurricane-isaias-gulf-coast…" once made "Also coming up: isaias becomes…", 10 Oct)
  // (the word without its possessive: "Rivian’s startup Mind Robotics…" and "Flox's edge devices…" once went out as "rivian’s" and
  // "flox's" after "And finally:", the article writing "Rivian" and "Flox" mid-sentence, round 5)
  const lowers = story.match(new RegExp(`(?<![\\p{L}\\-/#@.])${base.toLowerCase()}(?![\\p{L}\\-/])`, 'gu'))?.length || 0;
  // A name is written with its capital in the middle of a sentence somewhere in the story; a common word is not.
  const mids = story.match(new RegExp(`[\\p{Ll},;:]\\s+${base}(?![\\p{L}])`, 'gu'))?.length || 0;
  const lower = lowers > mids;
  const midSentence = mids > 0;
  // (a first and a last name: "Meredith Whittaker says...", BBC 9 Oct, once went out as "meredith Whittaker")
  const fullName = new RegExp(`^${word}\\s+\\p{Lu}\\p{Ll}+(?:\\s|,|:|['’]s)`, 'u').test(text) && !COMMON_START.test(text) && !lower;
  if (fullName) return text;
  // (a name with its acronym, "Cerebras CEO pushes back…", "Blueprints AI developed software…", went out as "cerebras CEO" and
  // "blueprints AI", TechCrunch 13-15 Oct; and "Faisal Islam: What surprise praise…" as "faisal Islam")
  if (new RegExp(`^${word}\\s+\\p{Lu}{2,5}\\b`, 'u').test(text) && !COMMON_START.test(text)) return text;
  return lower || COMMON_START.test(text) || !midSentence ? word.toLowerCase() + text.slice(word.length) : text;
}
// A person by surname (or first name) alone, never heard in the story: "Scully said the organisation may have to
// accept..." after "A National Trust manager says..." (BBC 5 Oct). Said whole the first time, as the article gives
// it ("Justin Scully said..."); a name the article never gives whole (a company: "Microsoft said") stays as it is.
const NOT_A_NAME = new Set('It He She They We You There This That These Those Which What Who When While After Before If As At In On For With From By The A An And But So Then Yet Its Their His Her Our Each All Both Some Many Most One Officials Police Mr Mrs Ms Dr Prof Professor Sir Dame Lord Lady Chief President Minister Senator Judge Society Chairman Manager Once Since Until Although Though Because Despite During Following Against Between Without Under Over Meanwhile Elsewhere However Also Still Even Only Just Now Today Yesterday Tomorrow Monday Tuesday Wednesday Thursday Friday Saturday Sunday Where How Why Not No Yes Here'.split(' '));
// (and never a possessive: "Uzbekistan's Neftchi" gave "Uzbekistan champions Uzbekistan's Neftchi", nor a sentence's
// first word: "Once Al-Nassr…" gave "Ronaldo scores as Once Al-Nassr win", BBC Sport 13 Oct)
const givenName = (w) => !!w && !NOT_A_NAME.has(w) && !/['’]s$/.test(w) && !lookupPlace(w);
const BARE_NAME = /(?:^|[,;:]\s+|\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)(\p{Lu}[\p{Ll}’'-]+)(?=\s+(?:said|says|told|added|explained|warned|believes|thinks|argued|noted|wrote|hopes|was|is|has|had)\b)/u;
function nameWhole(t, told, info) {
  const m = String(t).match(BARE_NAME);
  const name = m?.[1];
  // (nor a place: "Wales has seen a series of major floods…" once aired as "Resources Wales has seen…", from "Natural
  // Resources Wales" in the article, BBC 12 Oct)
  if (!name || NOT_A_NAME.has(name) || told.includes(name) || info.s.title.includes(name) || lookupPlace(name)) return t;
  const source = `${info.s.summary || ''} ${info.s.body || ''}`;
  const real = (w) => w && !NOT_A_NAME.has(w) && !lookupPlace(w);
  const before = source.match(new RegExp(`(?<![\\p{L}])(\\p{Lu}[\\p{Ll}’'-]+)\\s+${name}(?![\\p{L}])`, 'u'))?.[1];
  const after = real(before) ? null : source.match(new RegExp(`(?<![\\p{L}])${name}\\s+(\\p{Lu}[\\p{Ll}’'-]+)(?![\\p{L}])`, 'u'))?.[1];
  const whole = real(before) ? `${before} ${name}` : real(after) ? `${name} ${after}` : null;
  if (!whole) return t;
  const at = m.index + m[0].length - name.length;
  const lead = m[0].slice(0, m[0].length - name.length).replace(/\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+$/, '');
  return `${t.slice(0, m.index)}${lead}${whole}${t.slice(at + name.length)}`;
}
// People by surname alone that the story never introduced: "The mission was the second for Meir and Fedyaev and the
// first for Hathaway and Adenot" (NASA 9 Oct), "neither Lorenz nor Hamilton" (Ars Technica 9 Oct). A single capitalised
// word mid-sentence, not a place, not after "the", not part of a longer name, not heard and not in the headline; the
// article's whole name for it is said instead when it gives one, else the sentence is left out.
// Faiths, parties and regions' adjectives: capitalised, never a person
const GROUP_WORD = /^(?:Islamic|Catholic|Christian|Muslim|Jewish|Hindu|Buddhist|Sikh|Orthodox|Protestant|Sunni|Shia|Shiite|Republicans?|Democrats?|Democratic|Labour|Conservatives?|Tory|Tories|Liberal|Socialist|Communist|Greens?|Gulf|Arctic|Atlantic|Pacific|Mediterranean|Nordic|Baltic|Balkan|Kurdish|Yemeni|Houthi|Houthis|Taliban|Hamas|Hezbollah|Sámi|Maori|Indigenous|Aboriginal)$/;
const COMMON_PROPER = /^(?:Earth|Moon|Sun|Mars|Venus|Jupiter|Saturn|Mercury|Neptune|Uranus|Pluto|God|Internet|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|English|Christmas|Easter|Covid|COVID)$/;
function strangers(t, told, info) {
  const out = [];
  // (a whole word: "Jack Rudoni" after "Goals from" once gave "Jac", a stranger the article never names, and the sentence
  // went, Sky Sports 13 Oct; a capital inside it, "McDermott", "DeLauter", is still one name)
  for (const m of String(t).matchAll(/(?<=[\p{Ll},;”"]\s+)(\p{Lu}\p{Ll}[\p{L}’'-]+)(?![\p{L}’'-])(?![’']s\b)(?!\s+\p{Lu})/gu)) {
    const name = m[1];
    const before = t.slice(0, m.index);
    if (/\b(?:the|a|an|its|their|his|her|our)\s+$/i.test(before) || /\p{Lu}[\p{L}’'-]*\s+$/u.test(before)) continue;
    // (a people, a faith or a party is no person to introduce: "Ukrainian officials said Russian attacks killed six people…"
    // once went for want of a "Russian"'s first name, Guardian 14 Oct)
    if (COMMON_PROPER.test(name) || NOT_A_NAME.has(name) || DEMONYM.test(name) || GROUP_WORD.test(name) || lookupPlace(name) || told.includes(name) || info.s.title.includes(name)) continue;
    out.push(name);
  }
  // (and a surname with its particle, "al-Jahalin said", Al Jazeera 14 Oct, the community's representative never named)
  for (const m of String(t).matchAll(/(?<![\p{L}-])((?:al|el|ad|ash|as|at|az|ibn|bin|abu|bint)-\p{Lu}[\p{L}’'-]+)/gu)) {
    const name = m[1].replace(/[’']s$/, '');
    if (told.includes(name) || info.s.title.includes(name) || out.includes(name)) continue;
    out.push(name);
  }
  return out;
}
function introduceNames(t, told, info) {
  let out = String(t);
  // (and one that opens the sentence: "Hasan fatally shot 13 unarmed US soldiers...", BBC 9 Oct, is said whole when the
  // article gives the whole name; a sentence that opens on a common word is left as it is)
  const lead = out.match(/^(\p{Lu}\p{Ll}[\p{Ll}’'-]+)\s+\p{Ll}/u)?.[1];
  const source0 = `${info.s.summary || ''} ${info.s.body || ''}`;
  // (a common noun opening a sentence is no name: "Water companies in England..." once became "Yorkshire Water companies...",
  // Guardian 9 Oct; a word the article also writes in lower case is a common word)
  const common = lead && new RegExp(`(?<![\\p{L}])${lead.toLowerCase()}(?![\\p{L}])`, 'u').test(source0);
  // (a strap's whole name is not said: "Goldberg was a regular Al Jazeera contributor…" once opened a story under "Israeli
  // academic and Al Jazeera contributor Ori Goldberg dies", Al Jazeera 12 Oct, round 5)
  const strapWhole = lead && new RegExp(`\\p{Lu}\\p{Ll}+\\s+${lead.replace(/[’']s$/, '')}(?![\\p{L}])`, 'u').test(info.s.title);
  if (lead && !common && !COMMON_START.test(out) && !NOT_A_NAME.has(lead) && !COMMON_PROPER.test(lead) && !lookupPlace(lead) && !told.includes(lead) && (!info.s.title.includes(lead) || strapWhole)) {
    const source = source0;
    // (the possessive too: "Helen Barber" given in the article makes "Barber’s claim…" "Helen Barber’s claim…")
    const bare = lead.replace(/[’']s$/, '');
    const first = [...source.matchAll(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${bare}(?![\\p{L}])`, 'gu'))].map((x) => x[1]).find((x) => givenName(x) && !COMMON_START.test(x));
    if (first) out = `${first} ${out}`;
  }
  // (a person the story knows only by a surname, "Barber’s claim is against HDR Global Trading…", Guardian 14 Oct, opening a
  // sentence or in the possessive: when the article never gives the whole name and calls them "Ms Barber" or "Barber said",
  // the listener cannot know who they are, and the sentence goes)
  for (const m of out.matchAll(/(?:^|(?<=[\p{Ll},;”"]\s+))(\p{Lu}\p{Ll}[\p{Ll}-]+)(?=(?:[’']s)?\s+\p{Ll})/gu)) {
    const name = m[1];
    if (told.includes(name) || info.s.title.includes(name) || NOT_A_NAME.has(name) || COMMON_PROPER.test(name) || DEMONYM.test(name) || GROUP_WORD.test(name) || lookupPlace(name) || COMMON_START.test(name)) continue;
    if (/\p{Lu}[\p{L}’'-]*\s+$/u.test(out.slice(0, m.index))) continue; // the end of a whole name already said
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const person = new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\\.?\\s+${esc}\\b|\\b${esc}\\s+(?:said|says|told|added|wrote)\\b`, 'u').test(source0);
    const whole = [...source0.matchAll(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${esc}(?![\\p{L}])`, 'gu'))].some((x) => givenName(x[1]) && !COMMON_START.test(x[1]));
    if (person && !whole && !out.slice(0, m.index).includes(name)) return null;
  }
  // (and "Ms Barber said she lost money" as the first we hear of her: the whole name when the article gives it, else the
  // sentence goes)
  for (const m of out.matchAll(/\b(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+(\p{Lu}\p{Ll}[\p{Ll}’'-]+)/gu)) {
    const name = m[1].replace(/[’']s$/, '');
    if (told.includes(name) || info.s.title.includes(name) || out.slice(0, m.index).includes(name)) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const given = [...source0.matchAll(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${esc}(?![\\p{L}])`, 'gu'))].map((x) => x[1]).find((x) => givenName(x) && !COMMON_START.test(x));
    if (!given) return null;
    out = out.replace(m[0], `${given} ${m[1]}`);
  }
  for (const name of strangers(out, told, info)) {
    const source = `${info.s.summary || ''} ${info.s.body || ''}`;
    const first = source.match(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${name}(?![\\p{L}])`, 'u'))?.[1];
    if (!givenName(first)) return null;
    out = out.replace(new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, 'u'), `${first} ${name}`);
  }
  return out;
}
// A standfirst without its article: "Intense flash of radio waves is more than 10bn years old..." (Guardian 9 Oct) is said
// "An intense flash of radio waves...".
const BARE_ADJ_START = /^(Intense|Huge|Rare|New|Big|Small|Tiny|Giant|Major|Massive|Mysterious|Strange|Ancient|Powerful|Brief|Vast|Bright|Distant|Deadly|Fresh|Fierce|Severe|Unusual|Surprise|Record)\s+([a-z]+)\s+(?:of|in|from|is|has|was|could|may|will)\b/;
const withArticle = (t) => {
  const m = String(t).match(BARE_ADJ_START);
  if (!m || /s$/.test(m[2])) return t;
  return `${/^[AEIOU]/.test(m[1]) ? 'An' : 'A'} ${m[1].toLowerCase()}${t.slice(m[1].length)}`;
};
// An aside between commas whose words the story has all said goes: "Hurricane Isaias[, the first hurricane of the 2026
// Atlantic season,] is intensifying...", after "...says the first hurricane of the 2026 Atlantic season could bring..."
// (BBC 9 Oct).
function dropToldAside(t, told) {
  const said = new Set(contentWords(told.join(' ')).map(senseStem));
  // (only an apposition or a relative clause: ", bringing dangerous winds, storm surge and heavy rain" is a list's start)
  const out = String(t).replace(/(?<=\p{L}),\s+((?:a|an|the|who|which|whose)\s[^,]{4,90}),\s+/gu, (m, aside, at, whole) => {
    // (never the head of a list the sentence goes on with: "…to restore the site[, which has the world's southernmost Post
    // Office,] museum, and more than 1,000 gentoo penguins" once restored the penguins, BBC 15 Oct)
    const rest = whole.slice(at + m.length);
    if (/^[^,.;]{1,40},\s+(?:and|or)\b|^[^,.;]{1,30}\s+(?:and|or)\s/.test(rest) && !/^(?:the|a|an|it|they|he|she|this|that)\b/.test(rest)) return m;
    const words = contentWords(aside);
    return words.length >= 2 && words.every((w) => said.has(senseStem(w))) ? ' ' : m;
  });
  return out === t || hasFiniteVerb(out) ? out : t;
}
// A "he" or a "she" the story never introduced: "The plan was for her to work until he finished his law degree", once the
// sentence about her husband was left out (Ars Technica 9 Oct). A name before it in the sentence, or the same pronoun
// already heard in the story, gives it someone to be.
const PRONOUN_SETS = [/\b(?:he|him|his|himself)\b/i, /\b(?:she|her|hers|herself)\b/i];
function unheardPronoun(t, told) {
  return PRONOUN_SETS.some((re) => {
    const m = String(t).match(re);
    if (!m) return false;
    // (a name inside the quotation is not who speaks: '"…would make the Budget a work of fiction," she added.', BBC 12 Oct,
    // aired with no woman named before it)
    const before = t.slice(0, m.index).replace(/[“"][^”"]*[”"]/g, ' ');
    return !re.test(told) && !/(?<=\S\s+)\p{Lu}\p{Ll}+/u.test(before);
  });
}
// The figure UNIT-8 echoes: one the story said, the headline's first ("800,000 hours", not the year before's 970,000),
// a duration included (no card shows it).
function echoFigure(text, title) {
  const list = numbersIn(text)
    .map((n) => ({ n, word: text.slice(n.end).match(/^\s*((?:million|billion|bn)\s+)?([a-z]{3,})/)?.[0] }))
    // (a number in a name is no figure: "the Apollo 17 launch" once gave UNIT-8 "17 launch. Logged.", COSMOS 12 Oct)
    .filter(({ n, word }) => word && !(Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100 && !n.unit) && !/^\s*(?:st|nd|rd|th)\b/.test(word) && !/\p{L}[-‐‑]$/u.test(text.slice(0, n.index)) && !(!n.percent && !n.currency && /\p{Lu}[\p{L}’'-]*\s$/u.test(text.slice(0, n.index))));
  const inTitle = list.find(({ n }) => String(title).includes(n.raw));
  const pick = inTitle || list.sort((a, b) => b.n.scaled - a.n.scaled)[0];
  return pick ? `${pick.n.raw}${pick.word.replace(/^\s*/, ' ')}` : null;
}
// Over the length, a relative clause or an apposition after a name goes, when what is left is a sentence of its own:
// "Margaret Hamilton[, who coined the term “software engineering” and led the development of onboard flight software for
// NASA’s Apollo program in the 1960s,] died last week at the age of 90" (Ars Technica 9 Oct).
function dropAside(t, max) {
  const m = String(t).match(/^((?:\p{Lu}[\p{L}’'-]*\s+){0,3}\p{Lu}[\p{L}’'-]*),\s+(?:who|which|whose|a|an|the)\b[^,]{3,160},\s+(?=[a-z])/u);
  if (!m) return null;
  const out = `${m[1]} ${t.slice(m[0].length)}`;
  return wordCount(out) <= max && wordCount(out) >= 6 && hasFiniteVerb(out) ? out : null;
}
// The first two words of a line as said (cues out): two sentences in a row never open the same way ("The findings
// suggest... The findings offer a new look...", ScienceDaily 5 Oct).
// ("Scientists have uncovered... Researchers have uncovered...", ScienceDaily 9 Oct: the same opening in other words)
const openingOf = (t) => {
  const w = String(t).replace(/\[[^\]]*\]/g, ' ').replace(/^\s*(?:And finally:\s*)?/, '').trim().split(/\s+/).slice(0, 2).map((x) => x.toLowerCase().replace(/[^\p{L}]/gu, ''));
  return [SAME_SENSE.get(w[0]) || w[0], w[1]].join(' ');
};
// A people's name keeps its capital mid-sentence: "Coming up: German logistics group Rhenus..." (once "german", 9 Oct)
const DEMONYM = /^(?:American|British|English|Scottish|Welsh|Irish|French|German|Dutch|Belgian|Swiss|Austrian|Italian|Spanish|Portuguese|Greek|Turkish|Russian|Ukrainian|Polish|Czech|Hungarian|Romanian|Swedish|Norwegian|Danish|Finnish|Icelandic|European|African|Asian|Arab|Chinese|Japanese|Korean|Indian|Pakistani|Bangladeshi|Indonesian|Thai|Vietnamese|Filipino|Malaysian|Australian|Canadian|Mexican|Brazilian|Argentine|Chilean|Colombian|Peruvian|Cuban|Israeli|Palestinian|Iranian|Iraqi|Syrian|Saudi|Egyptian|Nigerian|Kenyan|Ethiopian|Ghanaian|Kazakh|Uzbek|Afghan|Sudanese|Libyan|Moroccan|Algerian|Tunisian|Lebanese|Jordanian|Qatari|Emirati|Taiwanese|Mongolian|Nepalese|Sri Lankan|Venezuelan|Haitian|Jamaican|Congolese|Somali|Ugandan|Tanzanian|Zimbabwean|Zambian|Senegalese|Malian|Latin|Western|Eastern|Northern|Southern|Middle|Britons?|Brits?|Saudis?)$/;
// (a pronoun after an opening phrase too: "Once completed, it will house GM’s new Battery Cell Development Center", "Together,
// they offer an unprecedented view...", The Verge 12 Oct, both aired as their stories' first words)
// (and after a short time or place phrase: "On Tuesday they will oversee the club's first home game", Guardian 13 Oct)
// (an opening phrase of at most four words before the comma: "Once completed, it will…"; never a clause with its figure,
// "Opener Ravi Menon made 141, his first century of the season…", whose "his" is its own subject's)
// (and after an opening phrase of up to six words: "Using a hybrid quantum computer, they demonstrated…", ScienceDaily 14 Oct)
const PRONOUN_START = /^(?:It|Its|They|Their|This|These|Those|He|She|His|Her)\b|^(?:Though|Although|While|When|As|After|Before|Because|Since|If|Once|Until)\s+(?:it|they|he|she|its|their|his|her)\b|^(?:[\p{L}’'-]+\s+){0,5}[\p{L}’'-]+,\s+(?:it|its|they|their|he|she|his|her)\b|^(?:On|In|At|By|From|After|Before|Since|Until|Last|This|Next|Earlier|Later)\s+[\p{L}\d ]{1,24}?\s(?:they|he|she|it)\s/u;
/**
 * Can this summary sentence open a story or a round-up item? The summary's first sentence can (unless it
 * opens on a pronoun: "The central bank has kept rates..." is how the outlet itself starts); a later one
 * only when it does not lean on the sentence before it ("The canal authority says...").
 */
// (a quotation never opens with nobody saying it: "“I want to be able to look at a rocket launch...” That’s how...")
const SAID_BY = /\b(?:said|says|told|added|according to|warned|wrote|explained)\b/i;
// (nor one that follows on: "So it’s only natural that Trump’s new task force is named...", TechCrunch 5 Oct)
// (nor a summary that goes on from its headline: "The students will head to Florida...", under "Students blast off to
// US for Nasa robotics competition", BBC 5 Oct; the headline is on the strap, never said. One that tells the headline's
// news itself opens as the outlet wrote it: "The central bank has kept interest rates unchanged at 3.5 percent".)
const leansOnHeadline = (info, t) => {
  // ("The other firms being suspended from the program include...", under "US bars Microsoft, Adobe...", TechCrunch 9 Oct)
  if (/^(?:The\s+)?[Oo]ther\s+[a-z]/.test(String(t).trim())) return true;
  // (a definite description of what the headline names, without the headline's subject: "The facility could be the first in
  // Japan…" under "Thales to open…", "The critically endangered apes were rescued…" under "Endangered orangutans released…",
  // "Both Republican and Democratic lawmakers have criticised the deal…" under "Trump faces growing backlash…", 12 Oct)
  const subject = String(info.s.title || '').replace(/^[\p{L}\s]{1,20}:\s+/u, '').split(/\s+/)[0]?.replace(/[^\p{L}\d-]/gu, '') || '';
  if (/^(?:The|Both)\s+\S/.test(String(t).trim()) && subject.length >= 3 && !new RegExp(`(?<![\\p{L}])${subject.slice(0, Math.max(3, subject.length - 2))}`, 'iu').test(t)) return true;
  // (or whose own noun the headline never says, an adjective they share notwithstanding: "The critically endangered apes
  // were rescued…" under "Endangered orangutans released…", BBC 12 Oct)
  const head = String(t).trim().match(/^(?:The|Both)\s+((?:[\p{L}’'-]+\s+){0,4}?)([a-z][a-z-]{2,})\s+(?:was|were|is|are|has|have|had|will|would|could|can|may|might|must|should|[a-z]{3,}ed|[a-z]{3,}s)\b/u);
  // ("The city of Paris has announced…" names its subject: never an auxiliary for the noun)
  if (head && !/^The\s+(?:[a-z][\w-]*\s+)?of\s+\p{Lu}/u.test(String(t).trim()) && !/^(?:has|have|had|was|were|is|are|will|would|could|can|may|might|must|should|been|being|also|now|still|just|not|and|but|who|which|that)$/.test(head[2]) && !contentWords(info.s.title).some((w) => w.slice(0, 4) === head[2].slice(0, 4))) return true;
  const m = String(t).trim().match(/^The\s+([a-z][a-z-]{2,})\b/);
  if (!!m && contentWords(info.s.title).some((w) => w.slice(0, 5) === m[1].slice(0, 5)) && !restates(t, info.s.title)) return true;
  // ("Philadelphia police said the tip was “flagged as spam”…" under "Rogue Anthropic AI agent gave police fake tip in
  // unsolved murder case", BBC 10 Oct: "the tip" is the headline's, never introduced)
  const early = String(t).trim().split(/\s+/).slice(1, 7).join(' ');
  const the = early.match(/\bthe\s+([a-z][a-z-]{2,})\b/);
  if (!the) return false;
  const before = early.slice(0, the.index);
  return contentWords(info.s.title).some((w) => w.slice(0, 5) === the[1].slice(0, 5)) && !contentWords(before).some((w) => w.slice(0, 5) === the[1].slice(0, 5)) && !restates(t, info.s.title);
};
// (nor a connective: "But Norwich Apex Data Centre has defended the scheme..." once opened a story, BBC 9 Oct; nor a time
// that points back: "She married her first husband, James Cox Hamilton, that same year", Ars Technica 9 Oct)
// A definite noun that names something the sentence before it introduced ("The project…", "The deal…", "The move…")
const BACK_NOUN = /^(?:The|That|This)\s+(pushback|city|town|region|capital|island|village|province|company|firm|project|plan|deal|move|decision|measure|measures|bill|law|scheme|proposal|programme|program|agreement|announcement|report|study|ruling|vote|device|scheme|policy|change|changes|order|request|offer|claim|claims|attack|strike|operation|incident|case|investigation|probe|document|letter|statement|filing|lawsuit|complaint|system|figure|figures|findings|research|survey|poll|move|bank|lender|insurer|retailer|carmaker|airline|agency|regulator|charity|club|union|platform|service|network|chain|brand|supermarket|operator|developer|startup|manufacturer|maker|bid|takeover|loan|fund|payment|budget)\b/;
// (and "The first covers…": one of a list the sentence before gave, Euronews 14 Oct)
// (and "All three are former Apple employees", after the three were named, TechCrunch 14 Oct)
const ONE_OF_LIST = /^The (?:first|second|third|fourth|latter|former|other)\s+(?:is|was|are|were|has|had|will|would|can|could|covers|includes|involves|concerns|applies|said|says|added)\b|^(?:All|Both|Each|Neither|None)\s+(?:two|three|four|five|six|seven|eight|nine|ten|of them|of these|of those)\b/;
// Who said a quotation, as the presenter can name them: a name already heard in the story, a whole name (two words or
// more) as given, else the whole name the story's text gives the surname ("Sydney Kamlager-Dove"); else nobody
const speakerFor = (info, by, heard) => {
  const name = String(by || '').trim();
  if (!name) return '';
  const bare = name.replace(/^the\s+/i, '');
  // (a role says who they are: "As the mayor put it")
  if (/^the\s/i.test(name) || heard.includes(bare) || /\s/.test(bare)) return name;
  const esc = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = `${info.s.title} ${info.sentences.join(' ')} ${info.s.summary || ''} ${String(info.s.body || '').slice(0, 4000)}`;
  // (mid-sentence, never a sentence's first words: "Friends Malcolm Butcher, 82, Jim Tyler, 81…" once gave "As Friends
  // Malcolm put it", BBC 12 Oct)
  const whole = text.match(new RegExp(`(?<=[\\p{Ll}\\d,;:]\\s)(?:\\p{Lu}[\\p{Ll}’'.-]+\\s){1,2}${esc}\\b`, 'u'));
  const w = whole ? whole[0].replace(/^(?:The|A|An|As|But|And|In|On|At|When|After|While|If|Said|Says|According|Mr|Mrs|Ms|Dr|Rep|Sen)\.?\s+/, '').trim() : '';
  return /\s/.test(w) ? w : '';
};
// A sentence that names what the one before it introduced with "that" or "those" ("Omar’s late father filled out that
// paperwork when…", Guardian 12 Oct, after "…concerning her immigration paperwork"): it stands only after it
const echoesBefore = (info, t) => {
  const j = info.sentences.indexOf(t);
  const before = j > 0 ? info.sentences[j - 1] : null;
  if (!before) return false;
  const stems = new Set((before.toLowerCase().match(/[a-z]{4,}/g) || []).map((w) => w.slice(0, 5)));
  for (const m of String(t).matchAll(/(?:^|\s)(\S+)\s+(?:that|those|such)\s+([a-z]{4,})\b/gi)) {
    if (/^(?:said|says|say|told|tells|warned|warns|added|adds|noted|claimed|claims|reported|showed|shows|found|finds|believe[sd]?|think|thinks|thought|argued|argues|insisted|explained|announced|confirmed|suggested|suggests|stated|means|meant|so|such|now|hope[sd]?|fear[sd]?|knew|know|knows|realised|realized|ensure[sd]?|given|than)$/i.test(m[1])) continue;
    if (stems.has(m[2].toLowerCase().slice(0, 5))) return true;
  }
  return false;
};
// A sentence whose speaker is a pronoun: "he said", "“…,” she told reporters"
const PRONOUN_SPEAKER = /^\s*(?:he|she|they|it|we|i)\s+(?:added|said|says|told|wrote|explained|warned)\b|["”’]\s*,?\s*(?:he|she|they|it)\s+(?:said|says|added|told|wrote|explained|warned)\b/i;
const CONNECTIVE_START = /^(?:But|And|So|Yet|Still|However|Instead|Meanwhile|Also|Nevertheless|Nonetheless|Moreover|Besides|Plus|Then)\b/;
const TIME_BACK = /\b(?:at the time\b(?! of)|(?:that|the) same (?:year|day|week|month|time|night|morning)|that (?:year|day|week|month|night|morning)|the following (?:year|day|week|month|morning)|later that (?:year|day|week|month|night))\b/i;
// (nor one that points back with "this" or "these" before its first comma: "CHIME can use this hydrogen signal to trace
// how matter is spread...", ScienceDaily 9 Oct, before the sentence that says what the signal is)
const POINTS_BACK = /^[^,;:]{0,60}?\b(?:this|these|those)\s+(?!(?:week|weekend|month|year|morning|afternoon|evening|summer|winter|spring|autumn|time|season|is|was|are|were)\b)[a-z]|^That\s+(?!(?:is|was|has|had|would|could|will|may|might|said|says|same)\b)[a-z]+\s|^That['’]s\b/i;
// (a later sentence opens no story with a pronoun either: "On Tuesday they will oversee the club’s first home Champions League
// game" opened a FULL TIME story, Guardian 13 Oct)
// (one that adds to words not heard: "Mohsen Rezaei added that Iran is no longer responding…" once opened a WORLD NOW story,
// ABC News 12 Oct)
const ADDED_LEAN = /^[^,;:.]{0,60}\badded\s+(?:that\b|,|:)|,\s+(?:\p{Lu}[\p{L}’'-]+\s+){0,2}\p{Lu}[\p{L}’'-]+\s+added\.?["”]?$/u;
// (one that answers what it names with "the": "Egyptian authorities denied the accusations, while…" before any accusation,
// Al Jazeera 12 Oct)
const ANSWERS_BACK = /\b(?:denied|deny|denies|rejected|rejects|dismissed|dismisses|disputed|disputes|welcomed|welcomes|condemned|condemns)\s+the\s+(?:accusations?|allegations?|claims?|charges?|reports?|criticism|remarks|comments)\b(?!\s+(?:of|that|about|from|by|against|over|made))/i;
// (one whose "their" or "them" has nobody before it: "Laura Mendoza comes downstairs, checks their names against a list…",
// ABC News 12 Oct)
const orphanPlural = (t) => {
  const m = /\b(?:their|them)\b/i.exec(String(t));
  if (!m) return false;
  const before = String(t).slice(0, m.index);
  // (only after one person, named as the subject, and nobody else: "Rail operators in Japan say their…" has them)
  const subject = before.match(/^\s*(\p{Lu}\p{Ll}+\s+\p{Lu}[\p{Ll}’'-]+)\s+\p{Ll}/u);
  if (!subject || lookupPlace(subject[1])) return false;
  return !/\b(?:and|with|both|all|people|police|staff|children|men|women|families|crowds?|teams?|public|groups?|couple|pair|they|others)\b|\b\p{Lu}{2,}s\b/u.test(before);
};
// (and a question about what the sentence before it told: "How many have been killed is unclear, but experts have warned
// the toll is likely to be huge." once opened WORLD NOW's lead on an Indonesian wildfire; the article counted orangutans,
// the viewer heard people, Guardian 14 Oct)
const ASKS_BACK = /^(?:How many|How much|How long|How far|Why|What|Whether|Who|Where|When)\b[^.]{0,60}?\b(?:is|are|was|were|remains?)\s+(?:still\s+)?(?:unclear|unknown|not (?:yet )?(?:known|clear))/i;
const selfStanding = (info, t) => !untold(t, String(info.s.title)) && !ASKS_BACK.test(String(t).trim()) && !ONE_OF_LIST.test(String(t).trim()) && !ADDED_LEAN.test(String(t).trim()) && !ANSWERS_BACK.test(String(t)) && !orphanPlural(t) && !(/^["“‘]/.test(String(t).trim()) && !SAID_BY.test(t)) && !FOLLOWS_ON.test(String(t).trim()) && !CONNECTIVE_START.test(String(t).trim()) && !TIME_BACK.test(t) && !POINTS_BACK.test(String(t).trim()) && !echoesBefore(info, t) && (info.sentences.indexOf(t) === 0 ? !PRONOUN_START.test(t) && !ALSO_LEAN.test(t) && !leansOnHeadline(info, t) : !leansOnPrevious(t) && !PRONOUN_START.test(t));
/**
 * Two sentences that say the same thing in other words: most of the shorter one's content words are in the
 * other ("A UCLA study links faster brain aging to specific gut bacteria" / "A new UCLA study suggests that the
 * pace of brain aging may be connected to bacteria in the gut", ScienceDaily 5 Oct).
 */
// (in the words outlets swap when they say it again: "a surprising second job" / "another unexpected role",
// ScienceDaily 5 Oct, whose standfirst and first paragraph tell the same news)
const SAME_SENSE = new Map(
  Object.entries({
    surpr: 'surprising surprise surprised surprisingly unexpected unexpectedly',
    role: 'role roles job jobs function functions',
    anoth: 'another second additional',
    find: 'found finds discovered discovers discover revealed reveals uncovered showed shows',
    scien: 'scientists researchers',
    link: 'linked links connected tied associated',
    help: 'help helps helping helped',
  }).flatMap(([canon, words]) => words.split(' ').map((w) => [w, canon]))
);
// (a word and its inflections are one: "heading" / "head", "teams" / "team")
const senseStem = (w) => (SAME_SENSE.get(w) || (w.length > 5 ? w.replace(/(?:ing|ed|es|s)$/, '') : w.replace(/s$/, ''))).slice(0, 5);
function sameSense(a, b) {
  const stem = senseStem;
  const wa = new Set(contentWords(a).map(stem));
  const wb = new Set(contentWords(b).map(stem));
  const small = Math.min(wa.size, wb.size);
  if (small < 4) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return (shared >= 4 && shared / small >= 0.6) || (shared >= 5 && shared / small >= 0.55);
}
/**
 * A sentence whose main clause the story has all said already, an aside its only news: "Researchers have found that it
 * also helps epithelial cells, which form continuous sealed layers throughout the body, engulf nearby dead cells", after
 * "...a surprising second job: helping epithelial cells swallow nearby dead cells" and "...cells can dramatically
 * reshape their lower surfaces to engulf cellular debris" (ScienceDaily 5 Oct). `told`: the story's lines so far.
 */
function toldBefore(t, told) {
  const stem = senseStem;
  const said = new Set(told.flatMap((x) => contentWords(x).map(stem)));
  const words = [...new Set(contentWords(String(t).replace(/,\s+(?:which|who|whose|where)\b[^,]*,/g, ' ')).map(stem))];
  const shared = words.filter((w) => said.has(w)).length;
  return words.length >= 5 && shared >= 5 && shared / words.length >= 0.8;
}
// A definition is background, never what a story opens on ("Lunabotics is a university-level competition...", "A green
// lung is an area of fields...", BBC 5 Oct): it follows the news it explains.
const DEFINES = /^(?:(?:An?|The)\s+)?[\p{L}’'-]+(?:\s+[\p{L}’'-]+)?\s+(?:is|are)\s+(?:a|an)\s/u;
// Over the length, a person's role between commas goes when the story has said it ("Justin Scully[, manager of Fountains
// Abbey and Studley Royal,] said extreme heat...", after "A National Trust manager says...", BBC 5 Oct); a role the
// viewer has not heard stays, and the sentence with it.
function dropKnownRole(t, told) {
  const m = String(t).match(/^((?:\p{Lu}[\p{L}’'-]+\s+){0,3}\p{Lu}[\p{L}’'-]+),\s+([^,]{3,70}),\s+(?=(?:said|says|told|added|explained|warned|believes|thinks)\b)/u);
  if (!m) return t;
  // the role's own noun, heard ("manager" of "manager of Fountains Abbey"): not any word of it ("engineering" in
  // "who's studying for a PhD in mechanical engineering" said nothing about Jack Fitzpatrick)
  const head = contentWords(m[2].replace(/^(?:a|an|the)\s+/i, ''))[0];
  const heard = contentWords(told.join(' ')).map((w) => w.slice(0, 5));
  return head && head.length >= 4 && heard.includes(head.slice(0, 5)) ? `${m[1]} ${t.slice(m[0].length)}` : t;
}
/** Content words of `sentence` that `title` does not have (what a restating sentence adds). */
function newWords(sentence, title) {
  const t = contentWords(title);
  return contentWords(sentence).filter((w) => !t.some((x) => x === w || (w.length > 4 && x.slice(0, 5) === w.slice(0, 5)))).length;
}
// Content-word overlap relative to the headline: does this sentence just restate it?
function restates(sentence, title) {
  const t = new Set(contentWords(title));
  if (!t.size) return false;
  const s = new Set(contentWords(sentence));
  let shared = 0;
  for (const w of t) if (s.has(w) || [...s].some((x) => x.slice(0, 5) === w.slice(0, 5) && w.length > 4)) shared++;
  const figuresOf = (x) => numbersIn(x).map((n) => n.scaled);
  const tf = figuresOf(title);
  return shared / t.size >= 0.4 || (tf.length > 0 && tf.every((v) => figuresOf(sentence).includes(v)));
}

/** How a place is said aloud: "the Andes", "the United States", "the Reykjanes peninsula", "Nairobi". */
function spokenPlace(entry) {
  const the = entry.aliases.find((a) => /^the /.test(a));
  if (the) return the;
  if (/^(?:United |Netherlands|Philippines|Czech Republic|Democratic Republic|Dominican Republic|Gambia)/.test(entry.name)) return `the ${entry.name}`;
  if (entry.kind === 'region' && / [a-z]/.test(entry.name)) return `the ${entry.name}`;
  return entry.name;
}

// (FULL TIME: the strap carries the story's sport, server/sport/desk.js sportTag)
const kickerFor = (s) => s.sportTag || topicOf(s);

/** Greeting by the London studio clock, unless the episode might air across a boundary (it is made minutes ahead). */
function timeGreeting(now) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  const mins = h * 60 + m;
  const near = [5 * 60, 12 * 60, 18 * 60].some((b) => b - mins > 0 && b - mins < 30);
  if (near || !Number.isFinite(mins)) return 'Hello';
  if (mins >= 18 * 60 || mins < 5 * 60) return 'Good evening';
  return mins >= 12 * 60 ? 'Good afternoon' : 'Good morning';
}

/** The figure as said in a teaser, with its qualifier: "40,000", "more than 1 million", "21 percent", "about 1,500 dollars". */
function spokenValue(f) {
  const n = numbersIn(f.said)[0];
  if (!n) return f.value.toLowerCase();
  const after = f.said.slice(n.end).match(/^\s*(dollars|pounds|euros|yen|percent|per cent)\b/i);
  return `${f.said.slice(0, n.index)}${n.raw}${after ? ` ${after[1]}` : ''}`;
}

// ---------------------------------------------------------------- what the mock knows about a story

/** A text without the wire datelines that open its paragraphs ("CAIRO -- ", "CEUTA, Spain -- ", "Boston, Massachusetts, United States – "). */
export function undateline(text) {
  return String(text)
    .replace(/(^|[.!?…]["”’)]?\s+|\n\s*)([A-Z][A-Z.'’ -]{2,}(?:,\s+[A-Z][\w.'’ -]{1,30})?\s+(?:--|—|–)\s+)(?=["“‘]?[A-Z])/g, '$1')
    .replace(/(^|[.!?…]["”’)]?\s+|\n\s*)((?:[A-Z][\w.'’-]+(?:\s[A-Z][\w.'’-]+){0,2},\s+){1,3}[A-Z][\w.'’-]+(?:\s[A-Z][\w.'’-]+){0,2}\s+[–—]\s+)(?=[A-Z])/g, '$1');
}
// The words of substance a sentence shares with its story (six-letter stems of words of five letters or more)
const KEY_STOP = /^(?:about|after|again|against|before|being|between|could|every|first|found|their|there|these|those|three|today|under|until|where|which|while|would|should|other|people|years|still|since|later|added|according|reported|including|during|without|another|across|around|another|million|billion|percent|monday|tuesday|wednesday|thursday|friday|saturday|sunday|seven|eight|three|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|hundreds|thousands|months|weeks|times|place|state|world|country|great|large|small|major|number|several|recent|recently|earlier|former|second|third|month)$/;
const keyWords = (x) => (String(x).toLowerCase().match(/[\p{L}\d]{5,}/gu) || []).filter((w) => !KEY_STOP.test(w)).map((w) => w.slice(0, 6));
// A page's HTML entities as the characters they stand for ("A&beta;" is "Aβ", said "A beta")
const GREEK = { alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon', kappa: 'kappa', lambda: 'lambda', mu: 'mu', pi: 'pi', sigma: 'sigma', tau: 'tau', omega: 'omega' };
const NAMED_ENTITY = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', deg: '°', pound: '£', euro: '€' };
export const decodeEntities = (t) =>
  String(t).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (/^#x/i.test(e)) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e[0] === '#') return String.fromCodePoint(Number(e.slice(1)));
    const k = e.toLowerCase();
    if (GREEK[k]) return ` ${GREEK[k]}`;
    return NAMED_ENTITY[k] ?? all;
  }).replace(/\(\s*(\p{Lu})\s+(alpha|beta|gamma|delta)\)/gu, '($1 $2)');
const TITLE_ONLY = /^(?:the\s+)?(?:Dr|Mr|Mrs|Ms|Miss|Prof|Professor|Sir|Dame|Lord|Lady|Rev|Judge|Officer|Sgt|Capt|Gen)\.?$/i;
export function study(story, { cap = 9 } = {}) {
  const title = plainTitle(story.title) || story.title;
  // (the outlet's own title kept: its label, "Analysis:", "Opinion:", says what kind of page it is, round 5)
  const s = { ...story, title, rawTitle: story.title };
  // (an outlet's typo in a headline name is said right: "Woodfood" for Woodford, Guardian 12 Oct)
  // (a wire story's dateline is the page's, never said: "CEUTA, Spain -- Many of the migrants…", "CAIRO -- A projectile…",
  // ABC News 14 Oct; "Boston, Massachusetts, United States – A United States federal court…", Al Jazeera 13 Oct)
  if (s.summary) s.summary = undateline(decodeEntities(s.summary));
  // (a programme's blurb: "In tonight's edition, Joseph Kabila has been named leader… Also, Africa's largest ever IPO… And
  // Formula 1 will return to Africa… in Rwanda." aired whole as the Kabila story, on a map of Rwanda, France 24 14 Oct:
  // its first item is the story, without the programme's words; the rest are other stories)
  for (const k of ['summary', 'body']) {
    const m = String(s[k] || '').match(/^\s*In (?:tonight|today|this week)['’]s (?:edition|programme|program|episode|show|bulletin),?\s+/i);
    if (m) s[k] = (sentencesIn(String(s[k]).slice(m[0].length))[0] || '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  }
  if (s.body) s.body = undateline(decodeEntities(s.body));
  const whole = `${s.summary || ''} ${s.body || ''}`;
  if (s.summary) s.summary = fixNameTypos(s.summary, title, whole);
  if (s.body) s.body = fixNameTypos(s.body, title, whole);
  const text = `${title} ${s.summary || ''}`;
  // Grave by severity, not by a keyword: "fires its CEO" is not, "an earthquake, no damage reported" is sober news.
  const grave = isGrave(text);
  const mild = harmlessIncident(text);
  const loc = locate(title, s.summary || '');
  const precise = loc && !loc.entry.broad ? loc : null;
  // A fact card is a whole beat on screen: only figures worth one ("3 YEARS" is not).
  // (and the headline's own figure, from the article sentence that gives it: "OpenAI’s revenue is reportedly $20 billion
  // less than previously projected" is the story's number, not the summary's earlier $70 billion, TechCrunch 9 Oct)
  const titleNums = numbersIn(title).filter((n) => !(Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100));
  const titleRaws = titleNums.map((n) => n.raw);
  // ("$20bn" in the headline is "$20 billion" in the text: the same figure by its value)
  const sameAsTitle = (f) => numbersIn(f.said).some((n) => titleNums.some((m) => m.scaled === n.scaled));
  const fromBodyFigures = titleNums.length && s.body ? extractFigures(sentencesOf(s.body).filter((x) => numbersIn(x).some((n) => titleNums.some((m) => m.scaled === n.scaled))).slice(0, 2).join(' ')) : [];
  // (preferred only when the summary does not give the headline's figure itself)
  const summaryFigures = extractFigures(sentencesOf(s.summary).join(' '));
  const summaryHasIt = summaryFigures.some(sameAsTitle);
  const figures = [...summaryFigures.map((f) => (!summaryHasIt || !sameAsTitle(f) ? f : { ...f, inTitle: true })), ...(summaryHasIt ? [] : fromBodyFigures.map((f) => (sameAsTitle(f) ? { ...f, inTitle: true } : f)))]
    .filter((f, i, all) => f.fact.length <= 40 && f.score >= 2 && all.findIndex((g) => g.value === f.value) === i);
  // (a short line without a verb is a section header or an aside, never news: "Part time, anyway.", "The A-G-I
  // Chronicles.", a Verge newsletter read on air, 10 Oct)
  // (nor a noun phrase with only a relative clause for a verb, nor a sentence that lost its subject: isFragment)
  // (nor a longer line with no verb at all: "Executive Director of The Burma Human Rights Network, according to Al Jazeera.",
  // a speaker's title cut from its sentence, Al Jazeera 13 Oct; "Gavin Hall, NATO expert and Teaching Fellow in…")
  // (nor a subordinate clause alone: "Because a strong industrial base means more than economic success.", 14 Oct)
  const fragment = (x) => (wordCount(x) <= 6 && !hasFiniteVerb(x.replace(/[.!?…]+$/, ''))) || isFragment(x) || (!anyVerb(x.replace(/“[^”]*”|"[^"]*"/g, ' ')) && !hasFiniteVerb(x.replace(/“[^”]*”|"[^"]*"/g, ' '))) || (/^(?:Because|Although|Though|Whereas|Unless|If|Since|While)\b/.test(x.trim()) && !/,\s/.test(x.replace(/\s[–—]\s[^–—]*\s[–—]\s/g, ' ')));
  // (a sentence the feed cut off is no sentence: "The young man stood stone-faced, until she mentioned", a summary clipped
  // mid-sentence, Guardian 14 Oct, once aired with a quotation glued to it)
  const ended = (x) => /[.!?…]["”’)\]]*$/.test(String(x).trim());
  const fromSummary = sentencesOf(s.summary).filter((x) => ended(x) && !LIVE_BOILERPLATE.test(x) && !isTranscriptLine(x) && !ownVoice(x) && !outletView(x) && !fragment(x) && unstop(x).toLowerCase() !== unstop(title).toLowerCase());
  // the story dossier (wave 3 §3.1): the article's own sentences after the summary's, never one the summary
  // already says, at most `cap` in all: 9, or the whole dossier (14) when a long programme needs its depth (the
  // producer's depth for the fallback writer, never padding)
  // (one sentence in both, its quotes curly in one and straight in the other, is one: "…that’s still in progress" read in
  // the story and again in THE CATCH, The Verge and TechCrunch 12 Oct)
  const sameKey = (x) => unstop(x).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  const seen = new Set(fromSummary.map(sameKey));
  // (the article's first two sentences, its lede, may run to 44 words: the writer shortens them as a broadcast writer would,
  // or leaves them out; "The head of Egypt’s Journalists Syndicate has insisted the organisation will continue to fight…"
  // once went, and the story opened on "Egyptian authorities denied the accusations…", Al Jazeera 12 Oct)
  const bodySentences = s.body ? sentencesOf(s.body) : [];
  const fromBody = bodySentences.filter((x, j) => ended(x) && !LIVE_BOILERPLATE.test(x) && !isTranscriptLine(x) && !ownVoice(x) && !outletView(x) && !fragment(x) && !seen.has(sameKey(x)) && sameKey(x) !== sameKey(title) && wordCount(x) >= 6 && wordCount(x) <= (j < 2 ? 44 : 34));
  // (the article's sentences about its own story: a wire roundup's other news, "Meanwhile, Israel’s former attorney general
  // took the witness stand…" inside "Iran calls US response to proposal insufficient", ABC News 14 Oct, goes; a sentence
  // shares a word of substance with the headline, the summary or a sentence already kept)
  // (a plain sentence with no names, "Engineers began a full survey of the structure on Monday morning.", is the story's
  // own; one with nothing in common and names nobody has mentioned is another story's)
  const bag = new Set(keyWords(`${title} ${s.summary || ''}`));
  const namesIn = (x) => (String(x).match(/(?<![\p{L}’'-])\p{Lu}[\p{Ll}’'-]{2,}/gu) || []).filter((w, i) => !NOT_A_NAME.has(w) && !COMMON_START.test(w) && !(i === 0 && String(x).trim().startsWith(w) && !lookupPlace(w)));
  const known = new Set(namesIn(`${title} ${s.summary || ''}`));
  const ownStory = fromBody.filter((x) => {
    const k = keyWords(x);
    const names = namesIn(x);
    // (a stranger named on the page needs two words of the story with them: "Avichai Mandelblit indicted the prime minister
    // seven years ago…" shared only "accepted" with an Iran story's sentences)
    if (names.length && !names.some((w) => known.has(w)) && k.filter((w) => bag.has(w)).length < 2) return false;
    for (const w of k) bag.add(w);
    for (const w of names) known.add(w);
    return true;
  });
  const sentences = [...fromSummary, ...ownStory].slice(0, Math.max(cap, fromSummary.length));
  // each sentence's predecessor as the outlet wrote it (a sentence that follows on is told only after it)
  const raw = [...sentencesOf(s.summary), ...(s.body ? sentencesOf(s.body) : [])];
  const prevOf = new Map(raw.map((x, i) => [x, raw[i - 1]]));
  // Breaking news is never "light", whatever it is about.
  // (FULL TIME marks its moments of the day itself: a record, a milestone, an auction, a farewell; server/sport/prepare.js)
  const light = !grave && !isBreaking(story.title) && ((LIGHT.test(title) && !SOBER.test(text)) || !!story.moment);
  return {
    s,
    breaking: isBreaking(story.title),
    live: !!story.live,
    grave,
    // hard news that is not grave: money, strikes, courts, rates, closures (it leads before a curiosity); an
    // incident that harmed no one counts here too, a little lower
    hard: !grave && (SOBER.test(text) || mild),
    mild,
    severity: severity(text),
    sad: grave && (DEATHS.test(text) || /(?<![\p{L}])R\.?I\.?P\b/u.test(text)),
    light,
    curious: light && (LIGHTER.test(title) || CURIOUS.test(title) || !!story.moment),
    // a reader's letter, a column or a feature's label: after the news, never its lead (writeEpisode, bestMain)
    column: columnVoice(story.title) || FEATURE_TITLE.test(String(story.title)),
    loc: precise,
    country: precise ? precise.entry.country || precise.entry.name : null,
    places: placesIn(text),
    figures,
    sentences,
    prevOf,
    // (someone's words, whole: never an unattributed fragment like "...we were making history.", Ars Technica 4 Oct)
    // (and the article's, when the summary quotes no one: IN THEIR WORDS needs a named speaker's whole sentence, 12 Oct;
    // never a pronoun for who said it, never a fragment)
    quote:
      // (and a name, never a title alone: "In the words of the Dr" once introduced a quotation, ScienceDaily 13 Oct)
      quotesIn(s.summary || '').find((q) => q.by && !TITLE_ONLY.test(q.by) && q.text.split(/\s+/).length >= 4 && !/^(?:…|\.\.\.)/.test(q.text)) ||
      quotesIn(String(s.body || '').slice(0, 2500)).find((q) => q.by && !TITLE_ONLY.test(q.by) && !/^(?:he|she|they|it|we|i|you)$/i.test(q.by) && q.text.split(/\s+/).length >= 6 && /^["“‘']?[\p{Lu}\d]/u.test(q.text)) ||
      null,
    kicker: kickerFor(s),
    // the names the headline is about: a sentence cut to length keeps them
    keep: headlineNames(title, `${s.summary || ''} ${s.body || ''}`),
    // never the number of the day: a quake that harmed no one, a closure, job losses
    noFeature: notForFeatures(text),
  };
}

// ---------------------------------------------------------------- running order

/**
 * Two outlets' reports of the same news: four names in common in their headlines and first sentences (people, places,
 * bodies: "Andy Burnham", "RAF Fairford", "Iran"), or two and two of the headlines' own words ("Pope", "Leo"; "surgery",
 * "lung"), or one headline saying the other's in other words. Titles are not names ("President", "Minister").
 */
function sameNews(a, b) {
  if (sameSense(a.s.title, b.s.title)) return true;
  const lede = (x) => `${String(x.s.title).replace(/[.!?]*$/, '.')} ${sentencesIn(String(x.s.summary || ''))[0] || ''}`;
  // (a sentence's first word is a name only when it is one by its shape, a place, or written so mid-sentence too: "Iran
  // ‘highly likely’…" yes, "Report on…", "Summary of…" no)
  const midWords = (x) => new Set((lede(x).match(/(?<=[\p{Ll}\d,;:’'"”]\s)\p{Lu}[\p{L}’'-]{2,}/gu) || []).map((w) => w.replace(/['’]s$/u, '')));
  const names = (x) => {
    const midSet = midWords(x);
    return new Set((lede(x).match(/(?<![\p{L}’'-])\p{Lu}[\p{L}’'-]{2,}/gu) || []).map((w) => w.replace(/['’]s$/u, '')).filter((w) => !NOT_A_NAME.has(w) && !/^(?:UK|US|EU|UN|BBC|The|New|First|Prime|Foreign|Defence|Defense|Health|Interior|Finance|Secretary|Government|Ministry|Department|Office|Police|Court|Supreme|National|State|City|Council|Party)$/.test(w) && (midSet.has(w) || /\p{Lu}/u.test(w.slice(1)) || !!lookupPlace(w) || DEMONYM.test(w))));
  };
  const na = names(a);
  const shared = [...names(b)].filter((w) => na.has(w)).length;
  // (the headlines' own words: the ones they write in lower case, never a name again)
  // (never a word with a number in it, whose stem drops the number: "topic1" and "topic2" are no word in common)
  const own = (t) => contentWords(String(t).split(/\s+/).filter((w) => /^[\p{Ll}\d]/u.test(w) && !/\p{L}\d|\d\p{L}/u.test(w)).join(' ')).map(senseStem);
  const wa = new Set(own(a.s.title));
  const common = new Set(own(b.s.title).filter((w) => wa.has(w))).size;
  if (shared >= 4 || (shared >= 2 && common >= 2)) return true;
  // (two names in common, one of them neither a place nor a name in every day's news: "RAF" in "Spy chief says Iran
  // targeting military sites, suspected plot at RAF base…" and "Iran ‘highly likely’ to be behind RAF Fairford incident",
  // one affair, aired twice in one round-up, 14 Oct)
  // (a name mid-sentence, never a headline's or a sentence's first word: "Report on…", "Summary of…")
  const ma = midWords(a);
  const specific = [...midWords(b)].filter((w) => ma.has(w) && !NOT_A_NAME.has(w) && !lookupPlace(w) && !DEMONYM.test(w) && !EVERYDAY_NAME.test(w));
  // (and two more words of what happened in their ledes: never two stories that merely share a town, "Pixelburg")
  const ledeWords = (x) => new Set(own(lede(x)));
  const la = ledeWords(a);
  const commonLede = [...ledeWords(b)].filter((w) => la.has(w)).length;
  if (shared >= 2 && specific.length >= 1 && commonLede >= 2 && a.s.category !== 'sport' && b.s.category !== 'sport') return true;
  // (one company's news from two outlets, its name the headlines' first word: "Netflix is laying off around 1,000 employees"
  // and "Netflix to lay off 1,000 staff"; "Facebook will let you customize your feed algorithm using AI" and "Facebook is giving
  // users more control over its algorithm", The Verge and TechCrunch 15 Oct, aired as two stories of one TECH BYTES)
  const subjectOf = (x) => String(x.s.title).match(/^\p{Lu}[\p{L}’'-]+/u)?.[0];
  const sa = subjectOf(a);
  if (sa && sa === subjectOf(b) && a.s.source !== b.s.source && !NOT_A_NAME.has(sa) && !lookupPlace(sa) && !DEMONYM.test(sa) && !COMMON_START.test(sa) && !EVERYDAY_NAME.test(sa) && a.s.category !== 'sport') {
    const nums = (x) => numbersIn(String(x.s.title)).filter((n) => n.scaled >= 100).map((n) => n.scaled);
    if (nums(a).some((v) => nums(b).includes(v)) || common >= 2 || (common >= 1 && commonLede >= 3)) return true;
  }
  // (the same distinctive figure and a word of what it is about: "…cover UK’s £35bn spending pressures" and "Healey faces £35bn
  // Budget challenge…", Guardian and BBC 12 Oct, aired as two stories of one MONEY MINUTE)
  const figs = (x) => numbersIn(`${x.s.title}`).filter((n) => (n.currency || n.unit || n.percent) && n.scaled >= 1000).map((n) => n.scaled);
  const fa = figs(a);
  if (fa.length && figs(b).some((v) => fa.includes(v)) && common >= 1) return true;
  // (one outlet's two pages on one investigation, "The skincare scheme that led to…" and "The skincare sample is free.
  // What happens next can cost thousands", NPR 14 Oct: a rare word of both headlines, "skincare", and the same phrases in
  // the sentences the writer would read, "mall skincare stores", "NPR investigated…"; never the outlet's boilerplate, which
  // study() has already left out, nor two stories of one outlet that merely share a template)
  const plainWords = (t) => contentWords(String(t).split(/\s+/).filter((w) => /^[\p{Ll}\d]/u.test(w)).join(' ')).map((w) => w.toLowerCase());
  const rare = plainWords(a.s.title).filter((w) => w.length >= 7 && !/(?:ed|ing|s)$/.test(w) && !/^(?:reports?|government|officials?|ministers?|president|millions?|billions?|people|police|country|countries|announces?|announced|warning|warnings|summary|another|between|against|including|despite|because|without|latest|update|updates)$/.test(w) && plainWords(b.s.title).includes(w));
  if (a.s.source && a.s.source === b.s.source && rare.length) {
    const tri = (x) => {
      const w = (x.sentences || []).join(' ').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
      return new Set(w.slice(0, -2).map((_, i) => w.slice(i, i + 3).join(' ')));
    };
    const ta = tri(a);
    const FUNCTION = /^(?:the|a|an|of|in|on|to|and|for|at|by|with|is|was|has|have|it|its|that|this|as|from|or|be|are|were|said|says)$/;
    if ([...tri(b)].filter((g) => ta.has(g) && g.split(' ').filter((w) => !FUNCTION.test(w)).length >= 2).length >= 3) return true;
  }
  return false;
}
// Names in every day's news: two stories that share one of them and a country are not one affair
const EVERYDAY_NAME = /^(?:Trump|Biden|Putin|Zelensky|Zelenskyy|Netanyahu|Musk|Xi|Starmer|Burnham|Macron|Merz|Modi|Erdogan|Lula|Carney|Albanese|Meloni|Sanchez|Vance|Rubio|Hamas|Israel|Israeli|Gaza|Ukraine|Russia|China|NATO|White|House|Kremlin|Downing|Street|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|October|November|September)$/;

/**
 * The running order, by news value (the desk's ranking, which already counts
 * outlets, freshness and pictures): a breaking story leads, then the main
 * stories (a picture or a second outlet lifts a story a little, because it
 * makes better television), the number of the day among them (never first),
 * then a round-up built from the remaining located stories (stories without a
 * picture first: a round-up item is shown on the map only, so a picture is
 * better spent on a main story another time), and an "and finally" last. The
 * number of the day and the "and finally" come from the programme's own beat
 * whenever one qualifies (COSMOS: science, not a games console).
 */
function runningOrder(infos, n, program, featured = new Set(), { deep = false, deepest = false } = {}) {
  const features = program?.features || [];
  const primary = program?.categories?.length > 1 ? program.categories[0] : null;
  const pool = [...infos];
  const take = (pred) => {
    const i = pool.findIndex(pred);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  // A breaking story leads over stories of its own weight or less: a hurricane with homes without power leads
  // before a canal reopening the outlet calls breaking news (which then plays second).
  const breaking = pool.find((i) => i.breaking) || null;
  const graver = breaking ? pool.slice(0, 6).find((i) => !i.breaking && !i.live && i.severity >= 3 && i.severity > breaking.severity) : null;
  // (FULL TIME's desk has already put its lead first: the story most outlets carry, server/sport/prepare.js balance)
  const lead = (graver && take((i) => i === graver)) || take((i) => i.breaking) || (program?.id === 'full-time' ? take((i) => !i.live) : takeLead(pool, program)) || take(() => true);
  if (!lead) return { order: [], roundup: [], lighter: null, number: null };
  let slots = n - 1;
  // A feature that ran lately (the station's memory) gives way to another story when one qualifies: the same
  // "And finally" and the same number of the day do not come round every rotation.
  const fresh = (i) => !featured.has(i.s.id);
  let lighter = null;
  if (features.includes('lighter') && slots >= 1) {
    // (never a war: "Both Russia and Ukraine are using AI-powered drones on the battlefield" closed five WORLD NOW editions of
    // the round-5 replay as "And finally", with "That is the most cheerful thing I have read all day." after it: a
    // curiosity's flag let it through)
    const ok = (i) => !i.breaking && !i.grave && !i.live && i.kicker !== 'CONFLICT';
    const own = (i) => !primary || i.s.category === primary;
    // (FULL TIME: the moment of the day is a story the sport desk marked as one, never a cricket report closing the show)
    // (WORLD NOW's is light by what it is about, not by a technology in it: "Nvidia… donates $250m to UK for AI safety
    // research" once closed it, Guardian 14 Oct)
    // (and of a kind its closing exchange is written for, docs/programmes/world-now.md: history, the sky, wildlife, the sea,
    // green cities, culture, a tram or a train; or a curiosity; never hard news: "Both Russia, Ukraine are using AI-powered
    // drones", "Europe’s satellite sovereignty push faces funding test", "IMF raises forecast…", each once closed it, 12-14 Oct)
    const soft = (i) => program?.id !== 'world-now' || (!i.hard && (!HARD_NEWS.has(i.kicker) || i.kicker === 'TRANSPORT') && (i.curious || ['HISTORY', 'ASTRONOMY', 'SPACE', 'WILDLIFE', 'OCEANS', 'GREEN CITIES', 'CULTURE', 'TRANSPORT'].includes(i.kicker)));
    const tiers = program?.id === 'full-time' ? [(i) => ok(i) && !!i.s.moment] : [(i) => ok(i) && soft(i) && own(i) && i.curious, (i) => ok(i) && own(i) && i.light && soft(i), (i) => ok(i) && soft(i) && i.curious && !BEAT_OF_OTHERS.test(i.s.category), (i) => ok(i) && i.light && soft(i)];
    for (const strict of [true, false]) for (const t of tiers) lighter ||= take((i) => t(i) && (!strict || fresh(i)));
    if (lighter) slots--;
  }
  let number = null;
  if (features.includes('number')) {
    // never grave, never a harmless quake or a closure, never breaking news nor a live page
    // (nor a column's or a feature's: "’How do you explain deletion of 130m names?’" once aired as the number with no number
    // said, BBC 14 Oct)
    // (and one a sentence of the story says: "Our number of the day: £20m." once came with nothing more about it, BBC 12 Oct)
    // (one it can say in a sentence of the programme's length, or shortened keeping the figure: "£9bn" once aired with no
    // sentence at all, its only one 31 words long, Sky News 12 Oct; and never a unit of a ratio, "$1" of "for every $1 a man
    // makes", Guardian 13 Oct)
    const max = SENTENCE_WORDS[program?.id] || 20;
    const sayable = (i) => {
      const f = bestFigure(i);
      const raw = f && (numbersIn(f.said)[0]?.raw || f.value);
      if (!raw) return false;
      const esc = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return i.sentences.some((t) => t.includes(raw) && !new RegExp(`\\b(?:every|each|per)\\s+${esc}`, 'i').test(t) && (wordCount(t) <= max + 2 || (compressSentence(t, max, { keep: [raw], min: 8 }) || []).some((x) => x.includes(raw))));
    };
    const ok = (i) => !i.grave && !i.mild && !i.noFeature && !i.breaking && !i.live && !i.column && i.figures.some((f) => f.score >= 3 && !f.age) && sayable(i);
    const best = (list) => list.filter(ok).sort((a, b) => Number(fresh(b)) - Number(fresh(a)) || bestFigure(b).score - bestFigure(a).score)[0] || null;
    // From the programme's own beat when it has one (COSMOS: a science figure before a gadget's sales).
    number = (primary && best(pool.slice(0, slots + 8).filter((i) => i.s.category === primary))) || best(pool.slice(0, slots + 3));
    if (number) {
      pool.splice(pool.indexOf(number), 1);
      slots--;
    }
  }
  const r = program?.roundup || {};
  const min = r.min || 2;
  let want = 0;
  if (features.includes('roundup')) {
    // WORLD NOW keeps two main stories (the number of the day counting as one), the others one.
    // WORLD NOW keeps three main stories besides the number of the day (its flagship telling); the others one.
    const mainsMin = program?.id === 'world-now' ? (n >= 8 ? 3 : 1) : Math.max(0, 1 - (number ? 1 : 0));
    want = Math.min(r.max || (n >= 6 ? 3 : 4), slots - mainsMin);
    // (the deepest telling of a long programme still short of its length: three map items, never fewer than the
    // programme's floor, and the stories whose articles were read told in full; WORLD NOW once ran six minutes with five
    // read articles said in one sentence each on the map, 12 Oct)
    if (deepest && !r.kind && want > 3) want = Math.max(min, 3);
    if (want < min) want = 0;
  }
  const mains = [];
  // a breaking story that does not lead plays first after the lead
  if (breaking && breaking !== lead && pool.includes(breaking) && slots - want > 0) mains.push(take((i) => i === breaking));
  while (mains.length < slots - want && pool.length) mains.push(bestMain(pool, program, deep));
  let roundup = [];
  if (want) {
    const countries = new Set([lead.country]);
    // QUICK BYTES (TECH BYTES): stories with a picture of their own, each over it, any country, never grave
    const pictures = r.kind === 'pictures';
    // a round-up item is told in one summary sentence: a story with none that fits stays a main story
    // (a picture round-up takes the stories that would be short anyway: one whose article was read keeps its full
    // telling, or the round-up would shorten the programme it was meant to vary: COSMOS once lost three main stories
    // to it, 5 Oct)
    const located = pool.filter((i) => (pictures ? i.s.image && !i.grave && i.sentences.length < 5 : i.loc) && !i.breaking && !i.live && i.roundupFit !== false);
    // One map sentence is for the smaller stories: a picture, a second outlet or people at risk make a story a
    // main one (it gets its photo beat and its full telling); the round-up takes the rest first.
    // (QUICK BYTES: every item has its picture; the one with the most to tell stays a main story)
    // (QUICK BYTES: hard news, a court ruling or a security flaw, keeps its full telling and its board)
    // (a strap that cannot be cut to a tight limit cleanly weighs a little: NEWS IN 60's 36 characters)
    const tight = program?.headlineMax && program.headlineMax < 40 ? program.headlineMax : 0;
    // (a deeper telling keeps a story with an article to read for its full telling: the map takes the thinner ones first)
    const weight = (i) => (tight && shortHeadline(i.s.title, tight).length > tight ? 1.5 : 0) + (i.s.image && program?.pictures !== 'every' && !pictures ? 2 : 0) + ((i.s.outlets || 1) > 1 ? 2 : 0) + (i.grave ? 1.5 : 0) + (pictures ? Math.min(3, i.sentences.length) * 0.3 + (HARD_NEWS.has(i.kicker) || i.hard ? 1.5 : 0) : 0) + (deep && !pictures ? (i.sentences.length >= 8 ? 2 : i.sentences.length >= 5 ? 1 : 0) : 0);
    for (const i of [...located].sort((a, b) => weight(a) - weight(b))) {
      if (roundup.length >= want) break;
      if (!pictures && countries.has(i.country)) continue;
      countries.add(i.country);
      roundup.push(i);
      pool.splice(pool.indexOf(i), 1);
    }
    if (roundup.length < min) {
      pool.push(...roundup);
      roundup = [];
    }
    // A grave item never sits right before "and finally": it opens the round-up instead.
    roundup.sort((a, b) => Number(b.grave) - Number(a.grave));
  }
  // Round-up places nobody filled become main stories.
  while (mains.length + roundup.length < slots && pool.length) mains.push(bestMain(pool, program, deep));
  // The main stories air in order of news value (people at risk before a museum wing), the desk's order breaking ties.
  const rank = new Map(infos.map((x, k) => [x, k]));
  mains.sort((a, b) => Number(b.breaking) - Number(a.breaking) || newsValue(a, rank.get(a)) - newsValue(b, rank.get(b)) || rank.get(a) - rank.get(b));
  // A second report of the same affair airs right after the first, never three stories later ("OpenAI doubles down on
  // decision to fire three AI safety researchers" / "Fired OpenAI safety researchers dispute misconduct claims", The Verge
  // and TechCrunch 9 Oct): the same name and two more words of what happened.
  const related = (a, b) => {
    const wa = new Set(contentWords(a.s.title).map(senseStem));
    const shared = new Set(contentWords(b.s.title).map(senseStem).filter((w) => wa.has(w)));
    const names = (x) => new Set((x.s.title.match(/\p{Lu}[\p{L}’'-]*\p{Lu}[\p{L}’'-]*|(?<=\s)\p{Lu}\p{Ll}+/gu) || []).map((w) => senseStem(w.toLowerCase())));
    const nb = names(b);
    return shared.size >= 3 && [...names(a)].some((n) => nb.has(n) && shared.has(n));
  };
  const chain = [lead, ...mains];
  for (let i = 2; i < chain.length; i++) {
    const j = chain.slice(0, i - 1).findIndex((x) => related(x, chain[i]));
    if (j >= 0 && !related(chain[i - 1], chain[i])) chain.splice(j + 1, 0, chain.splice(i, 1)[0]);
  }
  mains.splice(0, mains.length, ...chain.slice(1));
  // Where the number of the day goes: second, last, or among the main stories (never the lead).
  let middle = [...mains];
  if (number) {
    if (program?.numberSlot === 'last') middle = [...mains];
    else if (program?.numberSlot === 'second') middle = [number, ...mains];
    else middle.splice(Math.min(1, middle.length), 0, number);
  }
  // NEWS IN 60 runs the round-up after its first item; others after the main stories.
  const before = program?.id === 'news-60' ? middle.slice(0, 1) : middle;
  const after = program?.id === 'news-60' ? middle.slice(1) : [];
  const order = [lead, ...before, ...roundup, ...after];
  if (number && program?.numberSlot === 'last') order.push(number);
  if (lighter) order.push(lighter);
  // The number of the day is a light beat: never between grave stories (hurricane, 40,000 tram rides, wildfire).
  if (number && !placeLight(order, number, roundup, lighter)) number = null;
  return { order, roundup, lighter, number };
}

/**
 * Move a light feature in `order` to the nearest slot (never the lead, never inside the round-up, never after
 * "and finally") with no grave story either side. False when there is no such slot: it airs where it is, as
 * an ordinary story.
 */
function placeLight(order, item, roundup, lighter) {
  const at = order.indexOf(item);
  const grave = (x) => !!x?.grave;
  const fits = (list, i) => !grave(list[i - 1]) && !grave(list[i]) && !(roundup.includes(list[i - 1]) && roundup.includes(list[i]));
  if (fits(order.filter((x) => x !== item), at)) return true;
  const rest = order.filter((x) => x !== item);
  const last = rest.length - (lighter && rest.at(-1) === lighter ? 1 : 0);
  for (let d = 1; d <= rest.length; d++) {
    for (const i of [at + d, at - d]) {
      if (i < 1 || i > last || !fits(rest, i)) continue;
      rest.splice(i, 0, item);
      order.splice(0, order.length, ...rest);
      return true;
    }
  }
  return false;
}

/**
 * News value of a story at desk rank `k` (lower is bigger news): the desk's order (close scores make close
 * ranks, so two places count as one point), where hard news (people
 * harmed or at risk, money, strikes, courts, rates) moves a story up and a curiosity moves it down, a second
 * outlet and a picture breaking ties. A record year for punctual trains never leads over a heat alert.
 */
const newsValue = (i, k) =>
  k / 2 - (i.severity >= 3 ? 3 : i.grave ? 2.2 : 0) - (i.hard ? 1 : 0) + (i.mild ? 0.7 : 0) + (i.curious ? 1.2 : i.light ? 0.3 : 0) - ((i.s.outlets || 1) > 1 ? 0.8 : 0) - (i.s.image ? 0.3 : 0);

/** The lead: the biggest news among the first six stories of the desk (never a live page when there is news). */
function takeLead(pool, program = null) {
  let best = -1;
  let bestValue = Infinity;
  const tight = program?.headlineMax && program.headlineMax < 40 ? program.headlineMax : 0;
  // (a long programme's lead is told in three to five sentences, its bible: one of the desk's first six that has them
  // leads over one that has not, "An ex-gang leader has been sentenced…" once led WORLD NOW in one sentence, 14 Oct)
  const words0 = program?.sentenceWords || SENTENCE_WORDS[program?.id] || 24;
  const long = Array.isArray(program?.targetSeconds) && program.targetSeconds[0] >= 240;
  const firstSix = pool.filter((i) => !i.live).slice(0, 6);
  const telling = (i) => i.sentences.filter((t) => wordCount(t) <= words0 + 4).length;
  const enough = long && firstSix.some((i) => telling(i) >= 3);
  for (let k = 0, seen = 0; k < pool.length && seen < 6; k++) {
    if (pool[k].live) continue;
    seen++;
    if (enough && telling(pool[k]) < 3) continue;
    // (NEWS IN 60's strap: a lead whose headline fits its 36 characters, all else equal)
    // (and a lead with something to tell: a one-sentence video caption, "Footage released by the Kharkiv prosecutor’s office
    // captured the moment of the strike", once led WORLD NOW alone, Guardian 14 Oct; NEWS IN 60 tells one or two anyway)
    // (tellable ones: the programme's sentence length or a little over; a dossier of long sentences tells little)
    const words = program?.sentenceWords || SENTENCE_WORDS[program?.id] || 24;
    const tellable = pool[k].sentences.filter((t) => wordCount(t) <= words + 4).length;
    const thin = long ? (tellable < 3 ? 3 : tellable < 5 ? 1.2 : 0) : 0;
    const v = newsValue(pool[k], k) + thin + (pool[k].column ? 4 : 0) + (tight && shortHeadline(pool[k].s.title, tight).length > tight ? 1 : 0);
    if (v < bestValue) {
      bestValue = v;
      best = k;
    }
  }
  return best < 0 ? null : pool.splice(best, 1)[0];
}

// Categories that are another programme's own beat: a light story from them is the last resort for "and finally".
const BEAT_OF_OTHERS = /^(?:science)$/;

/**
 * The next main story: the strongest of the first three left (the desk's
 * order), where a picture, a second outlet or hard news (people harmed or at
 * risk) counts for about one place, and live pages come last.
 */
function bestMain(pool, program = null, deep = false) {
  // (a tight strap, NEWS IN 60's 36 characters: a story whose headline cannot be cut to it cleanly gives way to one that
  // can, all else equal)
  const tight = program?.headlineMax && program.headlineMax < 40 ? program.headlineMax : 0;
  let best = 0;
  let bestScore = Infinity;
  // (a programme told deeper, the producer's depth 2 and 3, looks a little further down the desk's order for a story with
  // an article to tell: a rich dossier left for a one-sentence round-up item while a one-line summary was a main story,
  // "Cholera cases surge in Yemen…" (13 sentences) as an item, real news 14 Oct)
  const rich = (i) => (deep ? (i.sentences.length >= 8 ? 2.5 : i.sentences.length >= 5 ? 1.5 : i.sentences.length < 3 ? -1.5 : 0) : i.sentences.length >= 5 ? 0.8 : 0);
  for (let k = 0; k < Math.min(deep ? 5 : 3, pool.length); k++) {
    const i = pool[k];
    // (a story whose article was read has depth to tell: a one-line summary is the weaker main story)
    const score = k + (i.column ? 3 : 0) + (tight && shortHeadline(i.s.title, tight).length > tight ? 1.5 : 0) - (i.s.image ? 1.2 : 0) - rich(i) - ((i.s.outlets || 1) > 1 ? 1 : 0) - (i.severity >= 3 ? 1.6 : i.grave ? 1.3 : 0) - (i.hard ? 0.5 : 0) + (i.mild ? 0.4 : 0) + (i.curious ? 0.5 : 0) + (i.live ? 9 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return pool.splice(best, 1)[0];
}

// (a person's age is no number of the day; deep time is: "more than 10bn years old", Guardian 9 Oct)
// (never a figure in an aside about who: "Nvidia, worth $5.5tn, donates $250m…" is $250m's news, Guardian 14 Oct)
const asideFigure = (info, f) => {
  const raw = numbersIn(f.said)[0]?.raw || f.value;
  return new RegExp(`\\b(?:worth|valued at|a value of|a market value of|market cap(?:italisation|italization)? of)\\s+${String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(`${info.s.title} ${info.s.summary || ''}`);
};
const bestFigure = (info) => info.figures.filter((f) => !f.age || (numbersIn(f.said)[0]?.scaled || 0) >= 1e6).sort((a, b) => Number(asideFigure(info, a)) - Number(asideFigure(info, b)) || Number(!!b.inTitle) - Number(!!a.inTitle) || b.score - a.score)[0] || info.figures[0];

// ---------------------------------------------------------------- the provider

export function createMockProvider() {
  return {
    name: 'mock',
    // It copies the feed text, so it has nothing to check: it never stands in for the editor.
    reviews: false,
    available: () => true,
    // `depth` (0-3): how much of each story's dossier a long programme tells (the producer asks for more while the
    // programme runs short of its targetSeconds: server/producer.js write); 0 is the everyday telling.
    depths: DEPTHS,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count, now, recent, featured, experts = [], analysisTurn = null, depth = 0, closedSlate = false }) {
      const usage = { input: 0, output: 0, cached: 0 };
      // Asked to review anyway (outside a ProviderChain): return the script untouched and say so.
      if (stage === 'review') return { text: JSON.stringify(script), usage, reviewed: false };
      return { text: JSON.stringify(writeEpisode({ stories, channelName, program, presenters, count, now: now ?? new Date(Date.now()), recent, featured, experts, analysisTurn, depth, closedSlate })), usage };
    },
  };
}

// Attribution is a tail clause ("..., Ledger Line reports."): the striking fact comes first.
const TAILS = [
  { id: 'tail', words: 2, fn: (t, src) => `${unstop(t)}, ${src} reports.` },
  { id: 'according-tail', words: 3, fn: (t, src) => `${unstop(t)}, according to ${src}.` },
];
// Opening forms, now and then, for variety in the magazine programmes (never WORLD NOW or NEWS IN 60).
const OPENERS = [
  { id: 'according', words: 3, fn: (t, src) => (lcFirst(t) ? `According to ${src}, ${unstop(lcFirst(t))}.` : null) },
  { id: 'that', words: 3, fn: (t, src) => (lcFirst(t) ? `${src} reports that ${unstop(lcFirst(t))}.` : null) },
];
// Where the place must come (the longest sentence a programme allows is writer.js SENTENCE_WORDS).
const PLACE_WITHIN = { 'world-now': 6, 'news-60': 3, 'money-minute': 4 };
// The deepest telling the producer may ask for (`depth`), and the most a story segment says (writer.js LIMITS.text).
const DEPTHS = 3;
const STORY_CHARS = 520;

function writeEpisode({ stories, channelName, program, presenters, count, now, recent, featured, experts = [], analysisTurn = null, depth: level = 0, closedSlate = false }) {
  const title = program?.title || channelName;
  const solo = !presenters.B;
  const pid = program?.id || '';
  const quick = pid === 'news-60';
  const maxWords = program?.sentenceWords || SENTENCE_WORDS[pid] || 24;
  const placeWithin = PLACE_WITHIN[pid] ?? Infinity;
  // the most a story segment says: the validator's 520 characters (writer.js), or the programme's own `storyChars` when
  // the producer asks for depth 2 or more (a flagship's main story told at length, over its pictures and boards)
  // (and at depth 3, the deepest, its `storyCharsDeep`: a main story with the article to carry it told further still)
  const deepChars = level >= 3 ? Number(program?.storyCharsDeep) || 0 : 0;
  const storyChars = Math.max(deepChars, level >= 2 && Number(program?.storyChars) > STORY_CHARS ? Number(program.storyChars) : STORY_CHARS);
  // The station's memory of lines aired in the last hours, oldest first: sentence -> when it last aired.
  const aired = new Map();
  (recent || []).forEach((line, at) => lineSentences(line).forEach((x) => aired.set(x, at)));
  let tick = (recent || []).length;
  const markAired = (line) => lineSentences(line).forEach((x) => aired.set(x, tick++));
  // A live page whose only lines point at the outlet's own coverage has nothing to read out.
  // (one event once: a second outlet's report of news the desk's higher story already tells goes, "Pope Leo undergoes
  // surgery to remove growth on lung" / "Pope's surgery to remove lump on lung 'concluded successfully'", "Iran’s
  // Revolutionary Guards ‘almost certainly’ behind RAF Fairford threats, says Burnham" / "UK PM says RAF base incidents
  // ‘likely coordinated’", both pairs once aired in one WORLD NOW, 13 Oct: the desk's clustering had let them through)
  const studied = stories.map((s) => study(s, { cap: level >= 1 ? 14 : 9 }));
  // (of two reports of one event, the one with more to tell stays, the desk's first when they tell as much: "Google makes it
  // easier to launch your vibe-coded apps", The Verge, with nothing to tell, once kept TechCrunch's report of the same news
  // and its expert off TECH BYTES, 13 Oct, round 5)
  const usable = (i) => !i.live || i.sentences.length;
  const found = studied.filter((i, k) => usable(i) && !studied.some((o, j) => j !== k && usable(o) && (j < k ? sameNews(o, i) : sameNews(i, o)) && (o.sentences.length > i.sentences.length || (o.sentences.length === i.sentences.length && j < k))));
  // (a reader's letter or a column, its headline in the first person, "BT charged me for more than a year", Guardian
  // consumer column 14 Oct, is no news report: only when the desk has nothing else)
  // (and a feature's headline, a label and its long read, "Lobbying, lawyers and a media blitz: the fight to kill…", "‘People
  // sell their best stuff on Vinted’ – how charity shops became a dumping ground…", Guardian 14 Oct: no news line to tell)
  const plain = (i) => !columnVoice(i.s.title) && !FEATURE_TITLE.test(i.s.title) && !FEATURE_TITLE.test(i.s.rawTitle || i.s.title);
  // (and an outlet's promotion is no story at all: "TechCrunch Disrupt 2026 starts tomorrow: Your final chance to secure up
  // to $100 ticket savings", TechCrunch 12 Oct, aired as TECH BYTES' eleventh story)
  const news = found.filter((i) => !PROMO_TITLE.test(i.s.title));
  // (and a story with nothing to tell only when there is nothing else: a picture's caption for a title, no verb and no
  // sentence, "Transporter-18 SmallSats Encapsulation", NASA 14 Oct, once aired as a COSMOS story of one line)
  const tellable = (i) => i.sentences.length > 0 || hasFiniteVerb(i.s.title);
  // (and a column, a review or a feature airs only when the programme would otherwise fall short of its fewest stories: a
  // shorter programme before an opinion told as news, "So far, success feels a lot further away than failure", The Verge's
  // "Android is best and worst thing about Googlebooks", TECH BYTES 12 Oct)
  const plainOnes = news.filter((i) => plain(i) && tellable(i));
  const fewest = Math.max(3, Number(program?.timing?.minStories ?? program?.minStories) || 4);
  const all = plainOnes.length >= fewest ? plainOnes : [...plainOnes, ...news.filter((i) => !plain(i) && tellable(i)), ...news.filter((i) => !tellable(i))];
  // Live pages only when there is nothing else.
  // (a live page only to keep a programme at its fewest stories: its paragraphs are someone's speech without quotation
  // marks, "This is a moral outrage, and it is a direct result of decisions made by Tory and Labour governments", read in
  // the presenter's voice in a WORLD NOW on a thin desk, Guardian live 14 Oct)
  const fresh = all.filter((i) => !i.live);
  // (never on NEWS IN 60, whose item is a sentence or two: "That’s 300 people a week, 300 lives destroyed…", a politician's
  // words on a Guardian live page, once aired as its item in the presenter's voice, round 5; the minute runs short instead)
  let pool = quick || fresh.length >= Math.min(all.length, fewest) ? fresh : all;
  // A picture on every item (NEWS IN 60's bible): after the top story, the stories with a picture come first, and
  // among them those whose headline fits the programme's strap; the others only when the desk has no more.
  if (program?.pictures === 'every' && pool.length > 1) {
    const top = pool.find((i) => i.breaking) || pool[0];
    const max = program.headlineMax || 45;
    const rank = (i) => (i.s.image ? 0 : 2) + (shortHeadline(i.s.title, max).length <= max ? 0 : 1);
    pool = [top, ...pool.filter((i) => i !== top).map((i, k) => ({ i, k })).sort((a, b) => rank(a.i) - rank(b.i) || a.k - b.k).map(({ i }) => i)];
    // Fewer items, every one with its picture, rather than a full minute with items the screen cannot show: the
    // stories without one only when there are not enough with one for the programme's floor.
    const pictured = pool.filter((i) => i.s.image);
    const floor = program?.timing?.minStories ?? program?.minStories ?? 5;
    if (pictured.length >= floor) pool = pictured;
    // the running order is built from exactly those stories (the round-up must not reach past them)
    pool = pool.slice(0, Math.max(1, count ?? program?.stories ?? 5));
  }
  // (depth 3, a long programme still short: up to the programme's `moreStories` more, only as many as the desk has
  // stories with an article beyond its own count, the rotation's stock permitting; the producer lets them through)
  const base = count ?? program?.stories ?? 5;
  // (a story with three sentences to tell counts: a main story of two to four sentences is the bible's own)
  const extra = level >= 3 && !program?.timing ? Math.min(Number(program?.moreStories) || 0, Math.max(0, pool.filter((i) => i.sentences.length >= 3 && !i.column).length - base)) : 0;
  const n = Math.min(pool.length, base + extra);
  // Which stories have a summary sentence a round-up item can be (its length, standing on its own)
  const [rMin, rMax] = quick ? [14, 18] : [12, 20];
  for (const i of pool) {
    i.roundupFit = i.sentences.some((t, j) => {
      if (!(j === 0 ? !PRONOUN_START.test(t) : !leansOnPrevious(t))) return false;
      // (the same as the item's own choice below: no quotation leading it, no name it cannot introduce)
      if (/^["“‘]/.test(t.trim()) || !introduced(t, i)) return false;
      if (j > 0 && newWords(i.s.title, t) > contentWords(i.s.title).length - 2) return false;
      const x = wordCount(t) <= rMax ? t : trimClause(t, rMax, rMin - 4, { keep: i.keep });
      return !!x && wordCount(x) >= rMin - 4;
    });
  }
  const deepOrder = level >= 2 && !closedSlate && Array.isArray(program?.targetSeconds) && program.targetSeconds[0] >= 240;
  const { order, roundup, lighter, number } = runningOrder(pool, n, program, new Set(featured || []), { deep: deepOrder, deepest: deepOrder && level >= 3 });
  // A re-run (NewsDesk.recycle) seeds differently: the same stories get other openings, credits and lines.
  const seed = order.map((i) => `${i.s.id}${i.s.recycled ? `#${i.s.recycled}` : ''}`).join('|') + pid;
  const nameOf = (slot) => firstName(presenters[slot]);
  const idOf = (slot) => presenters[slot]?.id;
  const other = (slot) => (slot === 'A' ? 'B' : 'A');
  const pickLine = (list, key, info) => {
    const line = chooseFresh(list, key, { recent: aired, text: info ? `${info.s.title} ${info.s.summary || ''}` : '' });
    if (line) markAired(line);
    return line;
  };

  // Anchors: blocks alternate (the round-up is one block). WORLD NOW: Lola reads the round-up and And finally.
  const reader = program?.roundup?.reader;
  const anchors = [];
  let block = -1;
  order.forEach((info, k) => {
    if (!(roundup.includes(info) && k > 0 && roundup.includes(order[k - 1]))) block++;
    let a = solo || block % 2 === 0 ? 'A' : 'B';
    if (!solo && reader && (roundup.includes(info) || info === lighter)) a = reader;
    if (!solo && pid === 'cosmos' && info === number) a = 'B'; // the number is UNIT-8's moment
    // ...and "And finally" is Nova's, so that UNIT-8's literal reply answers her, not himself
    if (!solo && pid === 'cosmos' && info === lighter) a = presenters.B?.id === 'unit8' ? 'A' : presenters.A?.id === 'unit8' ? 'B' : a;
    anchors.push(a);
  });

  // Correspondent links (server/correspondents.js): the lead and one more main story with a place and an article
  // deep enough for a report (an opener and a detail for the presenter, two or three sentences for the piece, one
  // for the answer), each desk once while another can take one. The validator hands them to the correspondents.
  const links = new Set();
  if (program?.crosses && Array.isArray(program.correspondents) && program.correspondents.length && !solo) {
    const linkable = (info) => !roundup.includes(info) && info !== number && info !== lighter && !!info.loc && !info.live && info.sentences.filter((t) => wordCount(t) <= maxWords + 6).length >= 5;
    const desks = new Set();
    const deskKey = (info) => deskOf({ place: info.loc.place, lat: info.loc.lat, lon: info.loc.lon })?.desk || null;
    for (const pass of [0, 1]) {
      for (const info of order) {
        if (links.size >= program.crosses || links.has(info) || !linkable(info)) continue;
        // spread out as the validator wants them (LINK_GAP stories apart)
        if ([...links].some((x) => Math.abs(order.indexOf(x) - order.indexOf(info)) < LINK_GAP)) continue;
        // (a second pass lets a desk take a second link only for the first two: a third never gives one correspondent two
        // links in one edition, "Rhea Raster, at our Europe desk, has the detail." twice in a WORLD NOW, 12-14 Oct)
        if (desks.has(deskKey(info)) && (pass === 0 || links.size >= 2)) continue;
        links.add(info);
        desks.add(deskKey(info));
      }
    }
  }

  // The experts' analyses (server/experts.js): a main story of one expert's field, with sentences enough for the
  // presenter's opener and a detail and two answers (three and a follow-up's with an article) (never a link, a feature or
  // breaking news; a grave story too, soberly: decision 3), the strongest match first. The validator puts them to the expert.
  const analysed = new Map();
  if (program?.analyses && experts.length) {
    const fits = (info) => !roundup.includes(info) && info !== number && info !== lighter && !links.has(info) && !info.breaking && !info.live && info.sentences.filter((t) => wordCount(t) <= maxWords + 6).length >= 4;
    const scored = order
      .filter(fits)
      .map((info) => ({ info, m: expertFor({ title: info.s.title, summary: info.s.summary, category: info.s.category, kicker: info.kicker }, experts) }))
      .filter((x) => x.m)
      .sort((a, b) => b.m.score - a.m.score || order.indexOf(a.info) - order.indexOf(b.info));
    for (const { info, m } of scored) {
      if (analysed.size >= program.analyses) break;
      if ([...analysed.values()].some((e) => e.id === m.expert.id)) continue;
      analysed.set(info, m.expert);
    }
  }

  const segments = [];
  const tease = [];
  // ---- intro
  const top = order[0];
  const names = solo ? presenters.A.name : `${presenters.A.name}, with ${presenters.B.name}`;
  const grave0 = top?.grave;
  const shape = program?.intro || 'teaser';
  const featureTease = (info) => (info === number ? 'our number of the day' : null);
  // Spoken headlines run over a montage: the outlet's own headline, articles and all, when it is short
  // enough to say in one breath (about a dozen words); otherwise its clean short form.
  // a tease says the headline in sentence case; a label ("BBC on Hurricane Isaias...") says the story's news instead, which
  // its story then does not read again
  const teaseSentence = (info) => {
    for (const t of info.sentences) {
      // (who says it opens a quotation's tease; anything else opens on its news, not on who said it)
      const quoted = /^["“‘']/.test(info.s.title);
      // (nor one that points back at what the viewer has not heard: "On Tuesday, a report detailing the results of that
      // investigation was published", a WORLD NOW headline, 14 Oct)
      // (nor one that names someone the viewer has not met: "…, al-Jahalin said, …" once teased WORLD NOW, round 5)
      if (!selfStanding(info, t) || strangers(t, '', info).length || /\b(?:that|this|these|those|such)\s+(?!is\b|was\b|are\b|were\b)[a-z]+/i.test(t.split(/[,;]/).slice(0, 2).join(' ')) || /\balso\b/.test(t) || (!quoted && /^[^,]{0,40}\b(?:says|said|told)\b/.test(t)) || asks(t) || DEFINES.test(t)) continue;
      const short = wordCount(t) <= 16 ? t : dropAside(t, 16) || trimClause(t, 16, 6, { keep: info.keep });
      if (short) return { t, short };
    }
    return null;
  };
  const said = (info) => {
    if (LABEL_TITLE.test(info.s.title) || unsignedTitle(info.s.title)) {
      const pick = info.teased ? { short: info.teased } : teaseSentence(info);
      if (pick) {
        info.teased = pick.short;
        if (pick.t) info.teasedFrom = pick.t;
        return unstop(pick.short);
      }
    }
    // (a column's or a topic's label is the page's, never read: "Starwatch: Mars signposts the beautiful Beehive cluster"
    // once opened COSMOS, Guardian 12 Oct)
    const label = String(info.s.title).match(/^([^:“”"‘’]{2,32}):\s+(\p{Lu}.{12,})$/u);
    const bare = label && /^\p{Lu}?\p{Ll}+(?:\s+\p{Ll}+){0,3}$/u.test(label[1].trim()) && !lookupPlace(label[1].trim()) && label[2].split(/\s+/).length >= 4 ? label[2] : info.s.title;
    const title = sentenceCase(bare, info);
    return wordCount(title) <= 12 ? unstop(title) : unstop(shortHeadline(title, program?.headlineMax, { spoken: true }));
  };
  const introParts = [];
  if (shape === 'frame') {
    introParts.push(`[nod] This is ${title}. I'm ${names}.`);
  } else if (shape === 'headlines') {
    order.slice(0, 3).forEach((info, k) => {
      introParts.push(`${k === 0 && info.grave ? '[serious] ' : ''}${asSentence(said(info))}`);
      tease.push(info.s.id);
    });
    introParts.push(`${timeGreeting(now)}, and welcome to ${title}. [nod] I'm ${names}.${solo ? '' : ' [B:nod]'}`);
  } else {
    if (top) {
      introParts.push(`${grave0 ? '[serious] ' : ''}${top.breaking ? 'Breaking news: ' : ''}${asSentence(said(top))}`);
      tease.push(top.s.id);
    }
    const second = order[1];
    const third = order[2];
    const also = choose(['Also coming up:', 'Coming up:', 'Also ahead:'], `${seed}~also`);
    // (a long programme says "Still to come" once, mid-programme: its intro says "Later")
    const longIntro = Array.isArray(program?.targetSeconds) && program.targetSeconds[0] >= 240 && order.length >= 6;
    const later = choose(longIntro ? ['Later in the programme:', 'Later:'] : ['Later in the programme:', 'Later:', 'Still to come:'], `${seed}~later`);
    if (second) {
      introParts.push(`[point_camera] ${also} ${featureTease(second) || lowerFirstWord(said(second), second)}.`);
      tease.push(second.s.id);
    }
    if (third) {
      introParts.push(third === number ? 'And later, our number of the day.' : third === lighter ? `And later: ${asSentence(lowerFirstWord(said(third), third))}` : `${later} ${asSentence(lowerFirstWord(said(third), third))}`);
      tease.push(third.s.id);
    }
    const greet = solo ? `This is ${title}. [nod] I'm ${names}.` : `This is ${title}. [nod] I'm ${names}. [B:nod]`;
    introParts.push(greet);
  }
  segments.push({ type: 'intro', anchor: 'A', emotion: grave0 ? 'serious' : 'neutral', text: introParts.join(' '), teases: tease });
  const introSaidHeadline = shape !== 'frame';

  // ---- stories
  let chats = 0;
  // (a solo presenter has no exchanges; her only line between stories is the mid-programme signpost, where her
  // programme's chat policy allows one: MONEY MINUTE's format round, 9 Oct)
  const maxChats = solo ? (program?.chats ? Math.min(1, program?.maxChats ?? 0) : 0) : program?.maxChats ?? 3;
  // PACE: long programmes (config targetSeconds = pace.js length.target, 4 minutes or more) get analysis
  // exchanges after the lead and main stories (only where a summary has a sentence to spare) and one
  // mid-programme "Still to come" signpost
  const longForm = Array.isArray(program?.targetSeconds) && program.targetSeconds[0] >= 240;
  let exchanges = 0;
  let unitRestates = 0; // COSMOS: UNIT-8's restatements so far, and the shapes they took
  const unitShapes = new Set();
  const asked = new Set();
  const midIndex = longForm && order.length >= 6 ? midStory(order, roundup, lighter, number) : -1;
  let thanked = 0;
  let tossed = false;
  let tosses = 0;
  let lastTail = null;
  let lastOpener = -9;
  const named = new Map(); // outlet -> times attributed
  const policy = program?.chats || null;

  /** Where a sentence first names the story's place (word index), or -1. */
  const placeAt = (sentence, info) => {
    if (!info.loc) return -1;
    const e = info.loc.entry;
    const country = e.country ? lookupPlace(e.country) : null;
    const names = [e.name, ...e.aliases, ...(country ? [country.name, ...country.aliases, ...country.demonyms] : e.demonyms || [])].map((x) => x.replace(/^the /i, '')).filter((x) => x.length > 2);
    let at = -1;
    for (const name of names) {
      const m = new RegExp(`(?<![\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').exec(sentence);
      if (m) {
        const idx = sentence.slice(0, m.index).split(/\s+/).filter(Boolean).length;
        if (at < 0 || idx < at) at = idx;
      }
    }
    return at;
  };

  /**
   * The place within the programme's first words ("In Kenya, a solar farm..."):
   * the place the story is pinned at, or its country when the sentence already
   * names the city further on. Only when the sentence can take "In X," cleanly.
   */
  const placeFirst = (sentence, info, limit = placeWithin) => {
    if (!info.loc || !Number.isFinite(limit)) return sentence;
    const at = placeAt(sentence, info);
    if (at >= 0 && at < limit) return sentence;
    const lc = lcFirst(sentence);
    if (!lc || wordCount(sentence) + 2 > maxWords) return sentence;
    const e = info.loc.entry;
    let where = spokenPlace(e);
    // (a place put in front is where the story happens: one the headline names, or the sentence; never one the article
    // mentions on the way, "In Iran, the IMF has raised its 2026 global growth forecast…" for "the Iran war" in an IMF
    // report, France 24 14 Oct)
    const esc = (n) => String(n).replace(/^the /i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const named = (x) => [e.name, ...(e.aliases || []), ...(e.country ? [e.country] : [])].some((n) => n && new RegExp(`(?<![\\p{L}])${esc(n)}(?![\\p{L}])`, 'u').test(x));
    if (at < 0 && !named(info.s.title)) return sentence;
    if (at >= 0) {
      // The sentence names the place further on: its own "in <place>" phrase moves to the front ("In Wales,
      // storms have uncovered footprints...").
      const moved = movePlaceFront(sentence, info);
      if (moved && wordCount(moved) <= maxWords) return moved;
      if (e.kind === 'country' || !e.country) return sentence;
      const country = lookupPlace(e.country);
      // the country's own name already there: nothing to add ("Greek islands" is not "Greece": "In Greece, ...")
      const namesCountry = country && [country.name, ...country.aliases].some((n) => new RegExp(`(?<![\\p{L}])${n.replace(/^the /i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(sentence));
      if (!country || namesCountry) return sentence;
      // A parent country the story never names is not said on air ("In the United Kingdom," for a beach in Wales).
      const story = `${info.s.title} ${info.s.summary || ''}`;
      if (![country.name, ...country.aliases].some((n) => new RegExp(`(?<![\\p{L}])${n.replace(/^the /i, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').test(story))) return sentence;
      where = spokenPlace(country);
    }
    // "On the Reykjanes peninsula", "On Crete": islands and peninsulas take "on"
    const on = /\b(?:peninsula|island|isle)\b/i.test(where) || (e.kind === 'region' && /^(?:Crete|Sicily|Sardinia|Corsica|Cyprus|Bali|Java|Borneo|Tasmania|Hokkaido|Greenland)$/.test(e.name));
    return `${on ? 'On' : 'In'} ${where}, ${lc}`;
  };

  /**
   * "A recycling plant in Sweden has started recovering gold." -> "In Sweden, a recycling plant has started
   * recovering gold.": the sentence's own "in <place>" phrase moved to the front, only where taking it out
   * leaves a whole sentence (the phrase sits before a verb or at the end, not inside "Wellington, New Zealand,").
   * Null when the sentence has no such phrase or cannot start with "In X,".
   */
  const movePlaceFront = (sentence, info) => {
    if (!info.loc) return null;
    const e = info.loc.entry;
    const country = e.country ? lookupPlace(e.country) : null;
    const names = [e.name, ...e.aliases, ...(country ? [country.name, ...country.aliases] : [])].filter((x) => x.length > 2);
    for (const name of names.sort((a, b) => b.length - a.length)) {
      const bare = name.replace(/^the /i, '');
      const re = new RegExp(`\\s(?:in|across) ((?:the )?${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?!\\s+(?:and|or|nor)\\b)(?=\\s+[a-z]|,\\s+[a-z]|[.!?]?$)`, 'u');
      const m = re.exec(sentence);
      if (!m) continue;
      const rest = (sentence.slice(0, m.index) + sentence.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      const lc = lcFirst(rest);
      if (!lc || wordCount(rest) < 4) return null;
      return `In ${m[1]}, ${lc}`;
    }
    return null;
  };

  /**
   * Credit the outlet once, as a tail clause on the story's shortest sentence
   * that can take it without going over the programme's sentence length (NEWS
   * IN 60: on the second sentence, as its bible asks). A sentence that names
   * its own source ("officials say") takes none. An outlet already named twice
   * in the episode is sometimes left implicit. No sentence fits: no credit.
   */
  const attribute = (parts, info, key, { allowOpener = false, from = 0, prefer = null } = {}) => {
    const src = info.s.source;
    const times = named.get(src) || 0;
    if (times > 1 && hash(key) % 2 === 0) return;
    const fits = (t, extra) => wordCount(t) + extra + wordCount(src) <= maxWords;
    const eligible = [];
    parts.forEach((p, i) => {
      if (i < from) return;
      const plain = p.replace(/\[[^\]]*\]/g, ' ').trim();
      if (!plain || OWN_ATTRIBUTION.test(plain) || /[“”"]/.test(plain) || /:\s*$/.test(plain) || PICKUP_LINE.test(plain)) return;
      eligible.push({ i, plain, words: wordCount(plain) });
    });
    if (!eligible.length) return;
    const offset = hash(seed + key);
    // Now and then (magazine programmes only, never twice running) the credit opens the first sentence instead.
    if (allowOpener && offset % 3 === 0 && segments.length - lastOpener > 2 && eligible[0].i === from) {
      const o = OPENERS[offset % OPENERS.length];
      const out = fits(eligible[0].plain, o.words) ? o.fn(parts[eligible[0].i], src) : null;
      if (out) {
        parts[eligible[0].i] = out;
        lastOpener = segments.length;
        named.set(src, times + 1);
        return;
      }
    }
    const order = prefer === 'last' ? [...eligible].reverse() : [...eligible].sort((a, b) => a.words - b.words || a.i - b.i);
    // (a story that already says "according to" once is not given a second: "...dies at 94, according to Ars
    // Technica. Windler died on Thursday, ..., according to a brief notice posted online.")
    const saysAccording = parts.some((p) => /\baccording to\b/i.test(p));
    for (let j = 0; j < TAILS.length; j++) {
      const t = TAILS[(offset + segments.length + j) % TAILS.length];
      if (t.id === lastTail && TAILS.length > 1 && j === 0 && !saysAccording) continue;
      if (t.id === 'according-tail' && saysAccording) continue;
      const target = order.find((e) => fits(e.plain, t.words));
      if (!target) continue;
      // Cues ride at the end of a sentence: keep them after the credit.
      const cues = (parts[target.i].match(/(?:\s*\[[^\]]*\])+\s*$/) || [''])[0];
      parts[target.i] = `${t.fn(parts[target.i].slice(0, parts[target.i].length - cues.length), src)}${cues}`;
      lastTail = t.id;
      named.set(src, times + 1);
      return;
    }
  };

  let roundupOpened = false; // (the round-up's title line goes with its first item that airs)
  order.forEach((info, k) => {
    const s = info.s;
    const anchor = anchors[k];
    const partner = other(anchor);
    const key = `${seed}#${s.id}`;
    const inRoundup = roundup.includes(info);
    const isNumber = info === number;
    const isLighter = info === lighter;
    const parts = [];
    const afterChat = segments.at(-1)?.type === 'chat';
    const prev = order[k - 1];
    const pickup =
      !solo && k > 0 && anchors[k - 1] !== anchor && !tossed && !afterChat && !prev.grave && !info.grave && thanked < 1 && !(inRoundup && roundup.indexOf(info) > 0) && hash(key) % 2 === 0;
    if (pickup) {
      parts.push(`Thanks, ${nameOf(anchors[k - 1])}.`);
      thanked++;
    }
    tossed = false;
    // (the lead does not read again the sentence the intro said for its label headline; a later story tells it in full)
    const used = new Set(k === 0 && info.teasedFrom ? [info.teasedFrom] : []);
    const pickSentence = (pred) => {
      const x = info.sentences.find((t) => !used.has(t) && pred(t));
      if (x) used.add(x);
      return x || null;
    };

    if (inRoundup) {
      // One sentence per item (12 to 20 words; NEWS IN 60 14 to 18), the place in its first words, credited
      // only if the credit fits. The summary's words are preferred to the headline, which is already on the strap.
      const idx = roundup.indexOf(info);
      const pictureItems = program?.roundup?.kind === 'pictures';
      const [minW, maxW] = quick ? [14, 18] : [12, 20];
      // The place within the item's first words (NEWS IN 60: three, its bible; the others: five).
      const limit = quick ? 3 : 5;
      const early = (t) => {
        const at = placeAt(t, info);
        return at >= 0 && at < limit;
      };
      // The item must say the news: the summary's first sentence, or one that shares two words with the
      // headline; never a sentence that leans on another ("In Sweden, the company wants to process..."), nor
      // a later detail ("In Paris, the city says shade can make streets cooler"). The place comes first as
      // written, moved to the front ("In Sweden, a recycling plant has started...") or put there.
      // (a later sentence tells it only with most of the headline's words, never with its names alone: "Les Enfants Rouges
      // reopened as a food court in 2000" under "Fire destroys Marché des Enfants Rouges…", Guardian 12 Oct)
      const shared = (t) => contentWords(t).filter((w) => contentWords(s.title).some((x) => x.slice(0, 5) === w.slice(0, 5))).length;
      // (the summary's first sentence too only when it speaks of the headline's news: "In France, pump prices are among the
      // highest in the European Union" told "Sébastien Lecornu promises €10 cut per fill-up" without its news, 14 Oct)
      // (and its key words: "Yemen has reported 8,034 suspected cases…" under "Cholera cases surge in Yemen…" never said
      // what of, WHO 14 Oct: three of the headline's words, or all of a short one's)
      // (the headline's first word of substance, never its people's or its place's adjective: "Dutch house prices edge up" is
      // about house prices, "Cholera cases surge in Yemen" about cholera)
      const headWord = contentWords(s.title).find((w) => !DEMONYM.test(w[0].toUpperCase() + w.slice(1)) && !lookupPlace(w)) || '';
      const saysHead = (t) => !headWord || contentWords(t).some((w) => w.slice(0, 5) === headWord.slice(0, 5));
      const tells = (t, j) => (j === 0 && (saysHead(t) || shared(t) >= 3)) || (newWords(s.title, t) <= contentWords(s.title).length - 2 && shared(t) >= 3);
      // A sentence a little over the item's length loses a trailing clause (", a record", "where the species..."),
      // never its subject or verb.
      const sized = (t) => (wordCount(t) <= maxW ? t : trimClause(t, maxW, minW - 4, { keep: info.keep }));
      let line = null;
      let fromHeadline = false;
      for (const pass of [0, 1]) {
        for (const [j, t0] of info.sentences.entries()) {
          if (line || used.has(t0) || !selfStanding(info, t0) || !tells(t0, j)) continue;
          // (an item is the news in our words: never a quotation leading it, never a name the item cannot
          // introduce: "“This is a type of indiscriminate mass surveillance,” Hill wrote.")
          if (/^["“‘]/.test(t0.trim()) || !introduced(t0, info)) continue;
          const t = sized(t0);
          if (!t) continue;
          // pass 0: the place within the first words, as written, moved to the front or put there;
          // pass 1: the sentence as written, its place named by the lead-in ("Now to Brazil.")
          // (QUICK BYTES: no place to name, the sentence as written over its picture)
          const forms = pictureItems ? [t] : pass === 0 ? [early(t) ? t : null, movePlaceFront(t, info), placeFirst(t, info, limit)] : [t];
          const form = forms.find((f) => f && (pass === 1 || pictureItems || early(f)) && wordCount(f) <= maxW && wordCount(f) >= minW - 4);
          if (form) {
            used.add(t0);
            line = form;
          }
        }
      }
      if (!line) {
        // Only when the summary has no sentence to tell it with: the headline, never with "In X," put in front of a
        // subject that is not there ("In Brazil, coffee futures reach...") nor a "Now to X." before it.
        fromHeadline = true;
        // (told as a sentence too: "Endangered orangutans have been released back into the wild after Borneo fires")
        const said = spokenTitle(s.title, info);
        line = pictureItems ? said : early(said) ? said : movePlaceFront(said, info) || said;
        // (a headline that is no sentence, a feature's label, "Death threats and isolation - the cost of fighting sexual
        // violence in Iraq", BBC 14 Oct, is no item: the round-up goes on without it)
        if (!hasFiniteVerb(said) || FEATURE_TITLE.test(s.title) || /^["“‘']/.test(said) || /:\s/.test(said)) line = null;
      }
      if (!line) return;
      const opens = !roundupOpened;
      roundupOpened = true;
      const lead = opens ? program?.roundup?.opener || 'Now, around the world in 30 seconds.' : '';
      const where = pictureItems || early(line) || fromHeadline ? '' : `${opens ? 'First, ' : 'Now to '}${spokenPlace(info.loc.entry)}.`;
      const item = [asSentence(line)];
      if (wordCount(line) + 2 + wordCount(s.source) <= maxW) attribute(item, info, key);
      parts.push(...[`${opens ? '[point_screen] ' : ''}${lead}`.trim(), where].filter(Boolean), ...item);
    } else {
      // Openers: the summary's first sentence when it says the headline better; the lead never re-reads the
      // intro's line about it (it goes on with the next fact).
      const first = info.sentences[0];
      const leadAfterIntro = k === 0 && introSaidHeadline;
      // TECH BYTES: the lead keeps one summary sentence back for THE CATCH (chosen first, so the opener cannot take it).
      // PACE (long programmes): main stories may keep one back too, for a short analysis exchange after them
      // (TECH BYTES: another CATCH question, never the same one twice; WORLD NOW: the partner adds it).
      const linked = links.has(info) || analysed.has(info);
      const deep = !linked && longForm && !isNumber && !isLighter && !info.grave && !info.breaking && !info.live && exchanges < 3 && info.sentences.length >= 3; // the lead too with 3 (critic: no analysis exchange aired)
      // (an answer is one spoken sentence of the programme's length: the validator trims stories, not chats)
      // (FULL TIME: Rosa's answer is the story's context, never its news: not the first sentence, nor one with the
      // story's own scoreline, which the presenter reads)
      // (nor an answer that starts on a connective, "But recent results…", nor a quotation with nobody saying it)
      // (and in every programme, never a speaker nobody has named: "So what is the catch?" was once answered "“We have taught
      // machines to be brilliant…,” she said.", TechCrunch 14 Oct)
      const fits = (c, t) => c.test.test(t) && answerable(t, info) && wordCount(t) <= maxWords + 2 && !PRONOUN_SPEAKER.test(t) && (pid !== 'full-time' || (t !== info.sentences[0] && !PRONOUN_START.test(t) && !CONNECTIVE_START.test(t.trim()) && (c !== BREAKDOWN[3] || /\b(?:said|says|added|told|admitted|insisted|explained|according to)\b/i.test(t)) && !(info.s.scorelines || []).some((sl) => t.includes(`${sl.sa}-${sl.sb}`))));
      // (never before a grave story: no chat follows a story there, and the kept-back sentence would be lost)
      const quietAfter = !!order[k + 1]?.grave;
      const catchList = pid === 'tech-bytes' ? CATCH : pid === 'full-time' ? BREAKDOWN : null;
      // (FULL TIME: THE BREAKDOWN after the lead and after one more main story at most, docs/programmes/full-time.md §4)
      const catchFor = catchList && (k === 0 || deep) && !info.grave && !quietAfter && (pid !== 'full-time' || exchanges < 2) ? catchList.find((c) => !asked.has(c) && info.sentences.some((t) => fits(c, t))) : null;
      // COSMOS: UNIT-8 asks when Dr Reyes read the story (never after the lead, which has his restatement)
      const unitSlot = idOf('B') === 'unit8' ? 'B' : idOf('A') === 'unit8' ? 'A' : null;
      const askFor = pid === 'cosmos' && unitSlot && k > 0 && deep && !quietAfter && anchor !== unitSlot ? ASK.find((c) => !asked.has(c) && info.sentences.some((t) => fits(c, t))) : null;
      let reserved = catchFor ? info.sentences.find((t) => fits(catchFor, t)) : askFor ? info.sentences.find((t) => fits(askFor, t)) : null;
      // (a sentence short enough to take Lola's "Worth adding:" in one breath, and never a view nobody holds)
      if (!reserved && pid === 'world-now' && deep && !quietAfter) reserved = [...info.sentences].reverse().find((t, j) => j < info.sentences.length - 1 && !PRONOUN_START.test(t) && !PRONOUN_SPEAKER.test(t) && answerable(t, info) && wordCount(t) >= 6 && wordCount(t) <= maxWords - 2 && !outletView(t)) || null;
      if (reserved) used.add(reserved);
      // After the intro has read its headline, the lead goes on with the next fact: a sentence that only
      // restates the headline (fewer than three words of its own) is never its opener, nor read later.
      // A sentence the next one leans on ("It runs along the river.") stays: it holds the antecedent.
      // ("The canal authority says...", "Astronomers say the shadow will cross..." lean on it just the same).
      const leansOn = (t) => leansOnPrevious(info.sentences[info.sentences.indexOf(t) + 1] || '');
      const echoes = (t) => leadAfterIntro && restates(t, s.title) && newWords(t, s.title) < 3 && !leansOn(t);
      // The headline is on the strap: a story is told in sentences, so it opens with the summary's first one
      // whenever that stands on its own ("Researchers at a battery firm say..."), not with headline-ese
      // ("Smartphone battery breakthrough promises a week of use."). The headline opens only when the summary
      // cannot ("It says the service...").
      // (but a summary that never names who the headline is about is background: "The economics prize is the only Nobel
      // not among the original five...", under "Americans Hall and Woodford win Nobel Prize in economics", Euronews 12 Oct,
      // aired without the winners: the headline, said as a sentence, opens)
      const unsaid = (info.keep || []).filter((n) => !info.sentences.some((t) => t.includes(n)));
      // (nor one that never says what the headline says happened: "Founded in 1615, the Enfants Rouges market is the oldest
      // covered food market in Paris." once told "Fire ravages oldest covered food market in Paris" on NEWS IN 60, the one
      // sentence with the flames too long for its minute, France 24 12 Oct, round 5)
      const tellable = info.sentences.filter((t) => wordCount(t) <= maxWords + 2 || !!dropAside(t, maxWords) || !!trimClause(t, maxWords, 6, { keep: info.keep }));
      // (only when the sentence that says it cannot be told: the outlet's lede is trusted to say its news in its own words)
      const eventUnsaid = !isNumber && !isLighter && info.sentences.length > 0 && !tellable.includes(info.sentences[0]) && hasFiniteVerb(spokenTitle(s.title, info)) && eventsUnsaid(s.title, tellable).length > 0 && eventsUnsaid(s.title, info.sentences).length === 0;
      const namesUnsaid = (!isNumber && unsaid.length >= 2 && unsaid.length * 2 >= (info.keep || []).length) || eventUnsaid;
      // (never on someone's words with nothing yet said about them: "“This is virtue signalling,” said Nigel Biggar." once
      // opened a story on a memorial's planning fight, Guardian 14 Oct)
      const quoteFirst = (t) => /^["“‘]/.test(String(t).trim());
      // (nor one that shares no word with the headline: "Coconut crabs, also known as Robber crabs, emerge at night…" once
      // told "Crew searching for Amelia Earhart arrives" on NEWS IN 60, its news never said, round 5)
      const sharesTitle = (t) => contentWords(t).some((w) => contentWords(s.title).some((x) => x.slice(0, 5) === w.slice(0, 5)));
      const skipHeadline = first && !namesUnsaid && !BACKGROUND_OPEN.test(first) && (leadAfterIntro || restates(first, s.title) || sharesTitle(first)) && (leadAfterIntro || restates(first, s.title) || (selfStanding(info, first) && !quoteFirst(first) && wordCount(first) >= 6));
      let opener = spokenTitle(s.title, info);
      // the summary's first sentence cannot open ("It is hoped the prospective sale..."): a later one that tells the
      // news and stands on its own opens instead of the headline ("Conservationists have said they are planning to
      // buy a field to extend a "green lung"...", BBC 5 Oct); the one that leans follows it
      // (and when the first sentence says a detail and a later one the news: "The Shropshire Astronomical Society plans to
      // install the dome at Rodington village hall" before "A group of amateur astronomers have been given permission to
      // set up a mini-observatory", BBC 5 Oct)
      let chosen = false;
      const titleShare = (t) => contentWords(t).filter((w) => contentWords(s.title).some((x) => x.slice(0, 5) === w.slice(0, 5))).length;
      // (or three words more of it: "Ethiopian Airlines resumed flights to Tigray's capital" once opened "Ethiopian forces enter
      // strategic Tigray town of Adwa", the article's "Ethiopian government forces have entered the town of Adwa…" never
      // said, Al Jazeera 12 Oct)
      const detailFirst = !isNumber && !isLighter && first && info.sentences.slice(1, 4).some((t) => titleShare(t) >= Math.max(3, titleShare(first) + 3) && selfStanding(info, t));
      if (!namesUnsaid && ((!skipHeadline && first && !selfStanding(info, first)) || detailFirst)) {
        // the sentence that tells most of the headline's news (its names first), never a bracketed aside ("Each flight
        // director chose a team name (at first colors)" once opened an obituary)
        const names = info.keep || [];
        const score = (t) => titleShare(t) + names.filter((n) => t.includes(n)).length;
        // (a lede that ends on who said it reads whole: "..., experts have said.")
        const fitsOpener = (t) => wordCount(t) <= maxWords + 2 || (!quick && wordCount(t) <= maxWords + 5 && /,\s+(?:[\w’'-]+\s+){0,3}(?:said|says|say|have said|has said|warned|added)\.?$/.test(t)) || !!dropAside(t, maxWords + 1) || !!trimClause(t, maxWords + 1, 8, { keep: info.keep });
        const tellsNews = (t) => selfStanding(info, t) && !BACKGROUND_OPEN.test(t) && !echoes(t) && !asks(t) && !DEFINES.test(t) && !/\(/.test(t) && wordCount(t) >= 8 && fitsOpener(t) && titleShare(t) >= 2;
        const best = !isNumber && !isLighter ? info.sentences.filter((t) => !used.has(t) && tellsNews(t)).sort((a, b) => score(b) - score(a) || info.sentences.indexOf(a) - info.sentences.indexOf(b))[0] : null;
        // (the sentence that tells the news, a little long, before a background one that fits: "The Trump administration is
        // suspending Microsoft, Adobe, and several other technology companies from a program..." over "H-1B visas are
        // designed for highly skilled positions...", TechCrunch 9 Oct)
        // (never in NEWS IN 60, whose sentences keep to its word budget)
        const strongest = !isNumber && !isLighter && !quick ? info.sentences.filter((t) => !used.has(t) && selfStanding(info, t) && !BACKGROUND_OPEN.test(t) && !echoes(t) && !asks(t) && !DEFINES.test(t) && !/\(/.test(t) && wordCount(t) >= 8 && titleShare(t) >= 2).sort((a, b) => score(b) - score(a) || info.sentences.indexOf(a) - info.sentences.indexOf(b))[0] : null;
        const long = strongest && strongest !== best && score(strongest) >= (best ? score(best) + 2 : 3) ? (wordCount(strongest) <= maxWords + 6 ? strongest : trimClause(strongest, maxWords + 6, 8, { keep: info.keep })) : null;
        const alt = long ? pickSentence((t) => t === strongest) && long : best ? pickSentence((t) => t === best) : null;
        if (alt) opener = alt;
        chosen = !!alt;
      }
      if (skipHeadline && !chosen) {
        // Never a pronoun as the first word of a story: the opener must say who or what.
        opener = (leadAfterIntro && (pickSentence((t) => !echoes(t) && selfStanding(info, t) && !BACKGROUND_OPEN.test(t)))) || null;
        // (the lead only: any other story opens on its first standing sentence below, and keeps its exchange; this
        // once freed the kept-back sentence of every story that could open on its summary, so THE CATCH, UNIT-8 ASKS
        // and WORLD NOW's added detail aired only where a headline opened)
        if (leadAfterIntro && !opener && reserved) {
          // Nothing else to open with: the catch's sentence opens the story, and there is no catch.
          used.delete(reserved);
          reserved = null;
          opener = pickSentence((t) => !echoes(t));
        }
        // (one that speaks of the headline's news: "Germany introduced a temporary fuel duty cut…" once opened a story on
        // France's, its own news never told, Euronews 14 Oct; a story whose sentences never touch its headline opens on it)
        // (and never one that leans: "Inside those buildings, which total half a million square feet…" once opened a story on
        // GM's factory, TechCrunch 12 Oct)
        opener ||= pickSentence((t) => selfStanding(info, t) && !BACKGROUND_OPEN.test(t) && !quoteFirst(t) && titleShare(t) >= 1) || spokenTitle(s.title, info);
      }
      const cue = isNumber ? '[count] ' : info.grave ? '[lean_in] ' : s.image ? '[point_screen] ' : choose(['[raise_hand] ', '[lean_in] ', ''], key);
      let figureLine = null;
      let numberRaw = null;
      if (isNumber) {
        const f = bestFigure(info);
        // "Our number of the day: 40,000." Then the story in the summary's order, so "It"/"Its" keep their
        // subject, with the sentence that gives the figure straight after the opener; the headline is not read.
        const raw = numbersIn(f.said)[0]?.raw || f.value;
        numberRaw = raw;
        if (!skipHeadline && info.sentences.length) opener = pickSentence(() => true);
        if (!opener.includes(raw)) figureLine = pickSentence((t) => t.includes(raw));
        // (the figure's own sentence first when it stands alone: "Tom Cruise's latest film Digger is expected to lose around
        // $245m" before "The film dropped by around 60%…", BBC 12 Oct, aired the other way round)
        // (nor one that names its person by a role the story has not yet tied to a name: "The Brighton chairman completed a
        // near £10m investment…" before "Tony Bloom has reiterated…", Sky Sports 13 Oct)
        const byRole = /^The\s+(?:\p{Lu}[\p{L}'’-]*\s+)+(?:chairman|chairwoman|owner|manager|boss|coach|captain|striker|midfielder|defender|goalkeeper|winger|forward|player|president|chief|driver|rider|club|side|team|champion|champions)\b/u;
        if (figureLine && !PRONOUN_START.test(figureLine) && !leansOnPrevious(figureLine) && !CONNECTIVE_START.test(figureLine) && !byRole.test(figureLine)) [opener, figureLine] = [figureLine, opener];
        parts.push(`${cue}Our number of the day: ${spokenValue(f)}.`);
      }
      const body = [];
      // (shortened as a broadcast writer would, writer.js compressSentence: the news first, who says it kept; NEWS IN 60 by a cut only)
      // (the opener's room leaves space for what goes before it: "And finally:", "A developing story:"; a sentence that will
      // not shorten cleanly to one breath gives way to the headline said as a sentence)
      const openMax = maxWords + 1 - (isLighter ? 2 : info.live ? 3 : 0);
      // (a lede that ends on who said it may run a little long, read in one breath to its attribution: "A huge data centre
      // planned in a village near a nature reserve would generate “very high noise levels” without extensive measures to
      // block it, experts have said.", BBC 9 Oct; its condition is never cut to fit)
      const saidLede = (t) => !quick && wordCount(t) <= openMax + 6 && /,\s+(?:[\w’'-]+\s+){0,3}(?:said|says|say|have said|has said|warned|added)\.?["”]?$/.test(String(t).trim());
      // (the number of the day's figure is kept in its sentence when it is cut to one breath)
      const keepOpen = numberRaw ? [...(info.keep || []), numberRaw] : info.keep;
      const asideOff = (t) => (numberRaw && t.includes(numberRaw) ? null : dropAside(t, openMax));
      if (opener && wordCount(opener) > openMax && !saidLede(opener)) opener = asideOff(opener) || (!quick && compressSentence(opener, openMax, { keep: keepOpen, min: 8 })?.join(' ')) || trimClause(opener, openMax, 8, { keep: keepOpen }) || (quick ? null : wordCount(opener) <= openMax + 2 ? opener : trimClause(opener, openMax + 2, 8, { keep: keepOpen })) || (wordCount(opener) <= openMax + 2 ? opener : spokenTitle(s.title, info));
      let headlineOpened = false; // (a headline opening keeps its own words: no "In Yemen," before a Saudi minister)
      // NEWS IN 60: one or two sentences an item, so its first must be the news. When it names no one the headline is about
      // ("US economists developed models that help central bankers…" under "Nobel Prize for economics awarded to Hall and
      // Woodford…", the lede too long for the minute, Guardian 12 Oct), the headline said as a sentence opens
      // (and, as BBC Three's 60 Seconds read it, a headline that becomes a clean sentence opens the item unless the summary's
      // sentence already says it: "The Houthis said they launched the attacks…" under "Saudi minister vows 'serious response'
      // to Houthi attacks on airports", BBC 12 Oct, told the reply before the news)
      // (only when the summary's sentence names no one the headline is about, or speaks of another subject: "Germany's
      // labour minister…, Bärbel Bas, has quit both posts" stays before "A German minister has quit after…")
      if (quick && !isNumber && !isLighter && opener && !restates(opener, s.title)) {
        const said = spokenTitle(s.title, info);
        const namesNone = (info.keep || []).length && !info.keep.some((n) => opener.includes(n));
        const tw = String(s.title).split(/\s+/);
        const vi = tw.findIndex((w, k) => k > 0 && (HEADLINE_PERFECT[w.toLowerCase().replace(/[^a-z]/g, '')] || w === 'to' || HEAD_PARTICIPLE.test(w)));
        const subj = vi > 0 ? contentWords(tw.slice(0, vi).join(' ')) : [];
        const lead = contentWords(String(opener).split(/\s+/).slice(0, 5).join(' '));
        const otherSubject = subj.length && !subj.some((w) => lead.some((x) => x.slice(0, 5) === w.slice(0, 5)));
        // (a first clause in the past perfect is the backstory: "Bergs had lost their only previous meeting, falling to
        // Alcaraz…", Guardian 12 Oct, before the result)
        const backstory = /^[^,;]{0,60}?\bhad\s+(?:not\s+|never\s+|already\s+)?(?:been\s+)?[a-z]+\b/.test(String(opener));
        if ((namesNone || otherSubject || backstory) && said !== s.title && !LABEL_TITLE.test(s.title) && wordCount(said) <= maxWords + 4) {
          used.delete(opener);
          opener = said;
          headlineOpened = true;
        }
      }
      // (a headline that is no sentence never opens a story when the article has one that stands: a label, "The skincare
      // scheme that led to consumer complaints, lawsuits and a federal investigation", NPR 14 Oct; someone's words with
      // nobody saying them, "'It's definitely tight trying to budget on maternity leave'", BBC 14 Oct; a page's label
      // before a colon)
      // (the number of the day's too: "Our number of the day: £20m. Campaigners have claimed minister attempting to…", BBC 12 Oct)
      if (opener && opener === spokenTitle(s.title, info) && (unsignedTitle(s.title) || /^(?:The|A|An)\s+[^,.;]{2,60}?\s(?:that|which|who)\s/.test(opener) || /^["“‘']/.test(opener) || /:\s/.test(opener) || !hasFiniteVerb(opener) || /\b(?:have|has) (?:claimed|said|warned)\s+(?:the\s+)?\p{Ll}+\s+\p{Ll}+ing\b/u.test(opener))) {
        // (nor one whose reported clause lost its verb: "Campaigners have claimed minister attempting to undermine 'Holiday
        // Hunger Bill'", BBC 12 Oct)
        // (one that fits the opener's breath: the IFS story once opened on a 49-word sentence this way, Guardian 12 Oct)
        // (and that speaks of the headline: "Last week, the governor of the Bank of England… said fiscal policy…" once opened
        // the IFS story, its news never said, MONEY MINUTE 12 Oct)
        const standing = pickSentence((t) => selfStanding(info, t) && !quoteFirst(t) && wordCount(t) >= 6 && titleShare(t) >= 1 && (wordCount(t) <= openMax + 2 || saidLede(t)));
        // (a speaker's label, "IFS: budget will be ‘work of fiction’ without…": its claim, said as theirs)
        const said = String(s.title).match(/^((?:\p{Lu}[\p{L}’'.&-]*\s?){1,3}):\s+(.{12,})$/u);
        if (standing) opener = standing;
        else if (said && !/["“‘']/.test(said[1]) && wordCount(said[2]) + wordCount(said[1]) + 2 <= openMax + 4) opener = `${said[2][0].toUpperCase()}${said[2].slice(1)}, according to ${said[1].trim()}`;
      }
      if (opener && opener === spokenTitle(s.title, info)) headlineOpened = true;
      let line = asSentence(isNumber || isLighter || headlineOpened ? opener : placeFirst(opener, info));
      line = withArticle(nameWhole(line, parts.join(' ').replace(/\[[^\]]*\]/g, ' '), info));
      line = introduceNames(line, parts.join(' ').replace(/\[[^\]]*\]/g, ' '), info) || line;
      if (info.breaking && k === 0) line = `Breaking news. ${line}`;
      else if (info.live) line = `A developing story: ${line}`;
      if (isLighter) line = `And finally: ${lowerFirstWord(line, info)}`;
      body.push(`${isNumber || isLighter ? '' : cue}${line}`);
      if (figureLine) body.push(figureLine);
      // (and said: a sentence cut to its breath may have lost it, "around €11.7 billion" once announced ASML's story and
      // never came again, Euronews 15 Oct)
      if (numberRaw && !body.join(' ').includes(numberRaw)) {
        const withIt = info.sentences.find((t) => t.includes(numberRaw) && !body.includes(t));
        const short = withIt && (wordCount(withIt) <= maxWords + 2 ? withIt : compressSentence(withIt, maxWords, { keep: [...(info.keep || []), numberRaw], min: 8 })?.join(' ') || (wordCount(withIt) <= 30 ? withIt : null));
        if (short && short.includes(numberRaw)) {
          body.push(short);
          figureLine = short;
          used.add(withIt);
        }
      }
      // Details. Enough sentences for the story's pictures: the director gives each sentence one shot
      // (presenter, then map, then picture, then fact card), so a story with a place AND a picture needs
      // three sentences for both to reach the screen. NEWS IN 60 keeps to its word budget; the TECH BYTES
      // lead keeps one sentence back for THE CATCH.
      const visuals = (info.loc ? 1 : 0) + (s.image ? 1 : 0) + (info.figures.length ? 1 : 0);
      // the story dossier (owner: programmes up to 10 minutes, with depth, never padding): in a long programme a
      // story whose article was read (more sentences than a feed summary gives) tells more of it: the lead five
      // details, a main story four (MONEY MINUTE three)
      // (grave news too: real bulletins give their biggest, gravest story the most time; its tone stays sober)
      // (deeper when the programme still runs short: one detail more at depth 2, two at 3, as far as the story's own
      // words and the story's characters go)
      const deepRead = longForm && info.sentences.length >= 5;
      const more = deepRead && level >= 2 ? (level >= 3 ? (deepChars ? 4 : 2) : 1) : 0;
      const cap = (pid === 'money-minute' ? (deepRead ? 3 : 2) : deepRead ? (k === 0 ? 5 : 4) : 3) + more;
      // NEWS IN 60 counts the credit ("..., Ledger Line reports.") inside its word budget.
      const budget = quick ? (k === 0 ? 41 : 31) - (wordCount(s.source) + 1) : Infinity;
      const depth = deepRead ? cap : longForm ? 2 : 0;
      // a linked story: the presenter's introduction is the opener and one detail; the correspondent tells the rest
      const maxDetails = linked ? 1 : quick ? 2 : isNumber ? (figureLine ? 0 : 1) : Math.min(cap, Math.max(k === 0 ? 2 : 1, visuals, depth));
      let details = 0;
      // People at risk: the warning and the advice come before the colour ("a red alert... asked people to avoid
      // going out" before "some schools have moved lessons").
      const ADVICE = /\b(?:alerts?|warn\w*|advis\w*|asked (?:people|residents)|urged|told (?:people|residents)|stay indoors|avoid|evacuat\w*|shelters?)\b/i;
      const detailOrder = info.grave || info.hard ? [...info.sentences].sort((a, b) => Number(ADVICE.test(b)) - Number(ADVICE.test(a))) : info.sentences;
      /**
       * A sentence of the story as it can be told after `told` (the lines already said, cues out), or null: never a
       * quotation with nobody saying it, the same news again in other words, a figure told again, a question or the
       * line that answers one, a line that follows on from or points back at a sentence not said, brackets, a pronoun or
       * a name the viewer has not heard. Over the programme's sentence length, a role already said goes, else it is told
       * as two whole sentences, else a trailing clause goes, else it is left out. { t, lines } (lines: one or two).
       * `against`: what the story's own telling has said (toldBefore: an aside its only news).
       */
      const tellLine = (t0, told, { against = told, heard = null } = {}) => {
        // (a sentence kept back for the exchange after the story is not yet said: "…,” he told reporters Sunday." once aired
        // before "Das, a spokesperson for the movement, urged supporters…", kept for "One more detail", ABC News 12 Oct)
        const said = (x) => (used.has(x) && x !== reserved) || !!heard?.has(x);
        if (t0 === reserved || said(t0) || echoes(t0)) return null;
        // (a quotation alone, with nobody saying it: "“It is absolutely unforgivable.”")
        if (/^["“‘']/.test(t0.trim()) && !/\b(?:said|says|told|added|according to|warned|wrote)\b/i.test(t0)) return null;
        // (a sentence that tells again what an aired one said: most of its words, little new)
        // (and as the source sentence a told line came from: a line told shorter, its aside dropped, still told that news,
        // "…E-cadherin, a protein best known as the “glue”…, has a surprising second job" / "A protein best known for
        // helping cells… has another unexpected role", ScienceDaily 5 Oct)
        const toldSrc = info.sentences.filter((x) => x !== t0 && used.has(x));
        if ([...told, ...toldSrc].some((x) => (restates(t0, x) && newWords(t0, x) < 4) || sameSense(t0, x))) return null;
        // (nor its figure again in other words: "…and wounding at least 14. At least 14 people were wounded in the
        // attack", ABC News 10 Oct)
        const toldText = told.join(' ');
        const figs = numbersIn(t0).map((n) => n.scaled);
        if (figs.length && figs.every((v) => numbersIn(toldText).some((n) => n.scaled === v)) && newWords(t0, toldText) < 3) return null;
        if (/^(?:It|They|This|These)\b/.test(t0) && WHY.test(t0)) return null; // "It says..." with no subject reads as a label
        // (a feature's rhetorical question, and the sentence that answers it: "What’s the best way to manage a
        // forest? Australians have argued about this for decades." ScienceDaily, 4 Oct)
        const at = info.sentences.indexOf(t0);
        if (asks(t0) || (at > 0 && asks(info.sentences[at - 1]))) return null;
        if (FOLLOWS_ON.test(t0) && !said(info.prevOf.get(t0))) return null;
        // (a connective answers the sentence before it in the article: "Still, witnesses in the city said lines of cars
        // formed…" after a sentence it never answered, ABC News 14 Oct)
        if (CONNECTIVE_START.test(t0.trim()) && !/^(?:Also|Meanwhile)\b/.test(t0.trim()) && !said(info.prevOf.get(t0))) return null;
        // (spoken words have no brackets: "Each flight director chose a team name (at first colors)")
        if (/\([^)]*\s[^)]*\)/.test(t0)) return null;
        if (toldBefore(t0, against)) return null;
        if (TIME_BACK.test(t0) && !said(info.prevOf.get(t0))) return null;
        if (!said(info.prevOf.get(t0)) && unheardPronoun(t0, toldText)) return null;
        // (a sentence that leans on the one before it in the source, a pronoun or "those officials" first, is told only after
        // it: "They were released on police bail a day later…" once aired without the arrests it follows, "The EU considers
        // those officials…" without the officials, real news 12-13 Oct)
        // ("Over 300 other people were wounded…" after the dead it was counting from, never told, ABC News 14 Oct)
        const leansBack = PRONOUN_START.test(t0) || POINTS_BACK.test(t0) || /^(?:[^,]{0,40}\s)?(?:those|these|such)\s+(?!(?:days|years|months|weeks|times)\b)[a-z]/i.test(t0.split(',')[0]) || /^[^,;]{0,30}\b(?:other|another|the remaining|the rest of the|the remainder)\s+(?:\d|[a-z]+)/i.test(t0) || /\b(?:something|anything) similar\b|\bthe same (?:thing|way|move|approach)\b|^Similarly\b/i.test(t0) || ANSWERS_BACK.test(t0) || ONE_OF_LIST.test(t0) || ASKS_BACK.test(t0.trim());
        if (leansBack && !said(info.prevOf.get(t0))) return null;
        // (the coherence gate, server/coherence.js: "those questions", "the temporary shutdown", "a second attack", "also",
        // a reporter's "here", "the witness" with nothing said before them: real news 12-16 Oct, round 5)
        if (untold(t0, `${toldText} ${s.title}`, { prevSaid: said(info.prevOf.get(t0)) })) return null;
        // (and "the project", "the deal", "the move" with no project, deal or move yet said: "The project is intended to open
        // new markets…" once followed a sentence about Alberta's premier, its pipeline never told, ABC News 14 Oct)
        // (a picture or a post the page shows: "…says the chart is actually measuring requests…", The Verge 12 Oct)
        const thing = t0.match(BACK_NOUN)?.[1] || t0.slice(0, 80).match(/\b(?:the|that|this)\s+(chart|graph|image|video|photo|post|thread|map|footage|picture|tweet|clip)\b/i)?.[1];
        if (thing && !said(info.prevOf.get(t0)) && !new RegExp(`\\b${thing.slice(0, Math.max(4, thing.length - 2))}`, 'i').test(`${toldText} ${s.title}`)) return null;
        const t0b = dropToldAside(t0, told);
        const t1 = wordCount(t0b) > maxWords ? dropKnownRole(t0b, told) : t0b;
        // over the length: told as a broadcast writer shortens it (writer.js compressSentence: split at a joint, a frame
        // or an aside dropped, a trailing clause cut, never who says it); NEWS IN 60's word budget takes no second sentence
        // (a whole sentence of the source may run to the validator's own ceiling, two words over the bible's, when the
        // programme needs its depth: a shortened one keeps to the bible's)
        const whole = !quick && level >= 1 ? maxWords + 2 : maxWords;
        const short = wordCount(t1) <= whole ? [t1] : quick ? [trimClause(t1, maxWords, 8, { keep: info.keep })].filter(Boolean) : compressSentence(t1, maxWords, { keep: info.keep, min: 8 }) || [];
        if (!short.length) return null;
        const t = short.join(' ');
        const lines = short.map((x) => introduceNames(nameWhole(x, toldText, info), toldText, info));
        // (naming someone in full, "US Secretary of State Marco Rubio", may take a line past a breath: then another sentence)
        if (lines.some((x) => x === null || wordCount(x) > whole + 3)) return null;
        return { t, lines };
      };
      /**
       * A correspondent's or an expert's lines after the presenter's (`told`): the story's sentences in `pool` order
       * as tellLine lets them follow, each told once (and then heard: a sentence that follows on from it may come
       * next), the first standing on its own (never a pronoun or a connective first), at most `max` lines.
       * { lines, src } (src: the story's sentences they tell, marked used by the caller only if it keeps them).
       */
      const followLines = (pool, told, max) => {
        const lines = [];
        const src = new Set();
        const heard = [...told];
        for (const t0 of pool) {
          if (lines.length >= max) break;
          // (never one that answers something else: "Instead, the American leader announced…" after "what happens next?",
          // ABC News 10 Oct; nor a first line that leans on the presenter's: "It says…")
          if (CONNECTIVE_START.test(t0.trim()) || (!lines.length && PRONOUN_START.test(t0))) continue;
          const fit = tellLine(t0, heard, { heard: src });
          if (!fit || lines.length + fit.lines.length > max) continue;
          lines.push(...fit.lines.map(asSentence));
          heard.push(...fit.lines);
          src.add(t0);
        }
        return { lines, src };
      };
      const toldSoFar = () => [...parts, ...body].map((x) => x.replace(/\[[^\]]*\]/g, ' '));
      const tellDetails = (max) => {
        for (const t0 of detailOrder) {
          if (details >= max) continue;
          const fit = tellLine(t0, toldSoFar(), { against: body });
          if (!fit) continue;
          const { t } = fit;
          if (wordCount([...parts, ...body].join(' ')) + wordCount(t) > budget) continue;
          // (a deeper telling stops before the story's characters run out, the credit's room kept: the validator would
          // cut whole sentences off its end, and a shorter detail further on may still fit)
          if (level >= 1 && [...parts, ...body, t].join(' ').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().length + 30 > storyChars) continue;
          if (body.some((b) => openingOf(b) === openingOf(t))) continue;
          body.push(...fit.lines);
          used.add(t0);
          details += fit.lines.length;
        }
      };
      tellDetails(maxDetails);
      // The correspondent's lines, or the expert's answers: the story's other sentences in its own order, what comes next
      // last (the answer to "what happens next?"), the first that stands on its own first (it follows the hand-over:
      // never "It says..."). A story whose sources cannot carry the link or the analysis is told in full instead.
      let fullTelling = !linked;
      if (linked) {
        const told = toldSoFar();
        const pool = info.sentences.filter((t) => !used.has(t)).sort((a, b) => Number(AHEAD.test(a)) - Number(AHEAD.test(b)));
        const firstOk = pool.find((t) => !CONNECTIVE_START.test(t.trim()) && !PRONOUN_START.test(t) && tellLine(t, told));
        const ordered = firstOk ? [firstOk, ...pool.filter((t) => t !== firstOk)] : [];
        if (analysed.has(info)) {
          // the expert's answers: two at least; a third, and the follow-up's two, when the article has them
          const { lines, src } = followLines(ordered, told, 5);
          const nAnswer = lines.length >= 5 ? 3 : 2;
          if (lines.length >= 2) {
            // a short spoken frame on some answers, the station's turn walking through them (none on others)
            const frame0 = answerFrame(key, Number.isFinite(analysisTurn) ? analysisTurn + [...analysed.keys()].indexOf(info) : undefined, { grave: !!info.grave });
            // (no frame on an answer it would take past one breath)
            const frame = frame0 && wordCount(frame0) + wordCount(lines[0]) <= maxWords + 4 ? frame0 : null;
            const answer = lines.slice(0, nAnswer);
            // after the colon the sentence runs on in lower case ("Here is what matters: the rise..."), a name or a
            // place keeping its capital (never "iceland's")
            if (frame) answer[0] = `${frame} ${/^\S*['’]s\b/.test(answer[0]) ? answer[0] : lowerFirstWord(answer[0], info)}`;
            info.analysis = { expert: analysed.get(info).id, question: null, answer: answer.join(' '), follow: null, answer2: lines.slice(nAnswer, nAnswer + 2).join(' ') };
            for (const t of src) used.add(t);
          } else analysed.delete(info);
        } else {
          // the correspondent's piece (three lines; four when the dossier is deep), one prompt and its answer (one or
          // two lines), and in a long programme that needs its depth a second prompt and answer (what comes next)
          const { lines, src } = followLines(ordered, told, level >= 1 ? 8 : 6);
          const nPiece = Math.min(level >= 1 && lines.length >= 7 ? 4 : 3, lines.length - 1);
          if (nPiece >= 2) {
            const nAnswer = level >= 1 ? 2 : lines.length >= 6 ? 2 : 1;
            const answer = lines.slice(nPiece, nPiece + nAnswer);
            const answer2 = level >= 1 && answer.length === 2 ? lines.slice(nPiece + 2, nPiece + 4) : [];
            info.cross = { piece: lines.slice(0, nPiece).join(' '), ask: null, answer: answer.join(' '), ...(answer2.length ? { follow: null, answer2: answer2.join(' ') } : {}) };
          } else if (lines.length === 2) info.cross = { piece: lines.join(' '), ask: null, answer: '' };
          if (info.cross) for (const t of src) used.add(t);
          else links.delete(info);
        }
        if (!info.cross && !info.analysis) {
          fullTelling = true;
          tellDetails(Math.min(cap, Math.max(k === 0 ? 2 : 1, visuals, depth)));
        }
      }
      const quoteFits = fullTelling && info.quote?.by && !quick && ![...used].some((l) => l.includes(info.quote.text.slice(0, 20)));
      // (a quotation the presenter reads is one sentence, a few words over the bible's for its "As … put it:": a longer one
      // stays on the quote card, IN THEIR WORDS)
      // (and by a name the viewer has heard, or the speaker's whole name from the story: "As Kamlager-Dove put it" once
      // followed a story that never named the congresswoman, Guardian 12 Oct; a speaker the story never names whole is
      // left to the quote card)
      const speaker = info.quote?.by ? speakerFor(info, lowerArticle(info.quote.by), [...parts, ...body].join(' ')) : '';
      const quoteLine = speaker ? `As ${speaker} put it: “${unstop(info.quote.text)}.”` : '';
      if (quoteFits && [...parts, ...body].join(' ').length + info.quote.text.length < Math.max(420, storyChars - 100) && wordCount(quoteLine) <= maxWords + 4) body.push(quoteLine);
      attribute(body, info, key, { allowOpener: !isNumber && !isLighter && !info.breaking && !info.live && ['tech-bytes', 'cosmos', 'money-minute'].includes(pid) && !(pickup && k === 0), prefer: quick ? 'last' : null });
      // The co-presenter reacts on the first detail (or on the opener when there is none).
      if (!solo && !info.grave) {
        const at = body.length > 1 ? 1 : 0;
        body[at] += ` [${partner}:${choose(['nod', 'nod', 'look_partner'], key)}]`;
      }
      parts.push(...body);
      // PACE: a mid-programme signpost on the story at the middle of a long programme (a later story by its
      // short headline, never one with figures in it: those belong to their own story)
      if (k === midIndex) {
        // (never the very next story: it is on air a breath later, nothing to come)
        const later = order.slice(k + 2).filter((x) => !roundup.includes(x) && !x.grave && !/\d/.test(said(x)));
        // the "And finally" first, then the others: the first whose signpost has not aired lately
        for (const pickL of [...later.filter((x) => x === lighter), ...later.filter((x) => x !== lighter)]) {
          const tail = number && order.indexOf(number) > k + 1 && pickL !== number ? ', and our number of the day' : '';
          const line = `Still to come: ${lowerFirstWord(pickL === number ? 'our number of the day' : said(pickL), pickL)}${tail}.`;
          if (airedBefore(line, aired)) continue;
          info.signpost = line;
          markAired(line);
          break;
        }
      }
      // (the kept-back line is told after the story: it may lean only on what the story said, "One more line from the
      // report: the department did not directly answer those questions." once followed a story that asked none, 14 Oct)
      if (reserved && untold(reserved, `${[...parts].join(' ')} ${s.title}`, { prevSaid: used.has(info.prevOf.get(reserved)) && [...parts].join(' ').includes(String(info.prevOf.get(reserved)).slice(0, 30)) })) reserved = null;
      if (reserved && catchFor) {
        info.catchAnswer = { line: reserved, q: catchFor.q };
        asked.add(catchFor);
      } else if (reserved && askFor) {
        info.askAnswer = { line: reserved, q: askFor.q };
        asked.add(askFor);
      } else if (reserved) info.addLine = reserved;
      if (reserved) exchanges++;
    }

    // ---- chats that follow this story
    const next = order[k + 1];
    const slot = k === 0 ? 'lead' : isLighter ? 'lighter' : 'story';
    const chatOk = !solo && !info.grave && !(next && next.grave) && chats < maxChats && !(inRoundup && next && roundup.includes(next)) && !info.cross && !info.analysis;
    const planned = [];
    if (chatOk) {
      if (policy) {
        if (policy.after?.includes(slot)) {
          if (pid === 'world-now' && slot === 'lighter') {
            // the topic's pairs, pairs built from the story's own place, then the general ones: the pair aired
            // longest ago wins, judged on both lines
            const place = info.loc ? spokenPlace(info.loc.entry) : null;
            const fill = (t) => t.replace('{Place}', place ? place[0].toUpperCase() + place.slice(1) : '').replace('{place}', place || '');
            const pairs = [...(WORLD_PAIRS[info.kicker] || []), ...(place ? WORLD_PLACE_PAIRS.map((p) => p.map(fill)) : []), ...WORLD_PAIRS.any];
            const keyed = pairs.map((p) => ({ text: `${p[0]} ${p[1]}`, pair: p }));
            const both = pickLine(keyed, `${key}~pair`, info);
            const pair = keyed.find((x) => x.text === both)?.pair || pairs[0];
            planned.push({ anchor: 'A', text: pair[0] }, { anchor: 'B', text: pair[1] });
          } else if (pid === 'world-now' && slot !== 'lighter' && info.addLine) {
            // PACE: the analysis exchange of a long WORLD NOW: the partner adds the detail the story kept back
            // (the lead-in and the detail one sentence a listener can follow: a long detail takes a short lead-in)
            const room = WORLD_ADD.filter((x) => wordCount(x) + wordCount(info.addLine) <= maxWords + 3);
            planned.push({ anchor: partner, text: `${pickLine(room.length ? room : ['[nod] Worth adding:'], `${key}~add`, info)} ${lowerFirstWord(info.addLine, info)}` });
          } else if (pid === 'tech-bytes' && (slot === 'lead' || slot === 'story') && info.catchAnswer) {
            const askB = idOf('B') === 'ada' || idOf('A') !== 'ada' ? 'B' : 'A';
            planned.push({ anchor: askB, text: pickLine(info.catchAnswer.q(nameOf(other(askB))), `${key}~catch`, info) }, { anchor: other(askB), text: `[lean_in] ${info.catchAnswer.line}` });
          } else if (pid === 'full-time' && (slot === 'lead' || slot === 'story') && info.catchAnswer) {
            // THE BREAKDOWN: Kai asks, Rosa answers with the story's own sentence
            const rosa = idOf('B') === 'rosa' ? 'B' : idOf('A') === 'rosa' ? 'A' : 'B';
            planned.push({ anchor: other(rosa), text: pickLine(info.catchAnswer.q(nameOf(rosa), info.catchAnswer.line), `${key}~bd`, info) }, { anchor: rosa, text: `[nod] ${info.catchAnswer.line}` });
          } else if (pid === 'full-time' && slot === 'lighter') {
            const rosa = idOf('B') === 'rosa' ? 'B' : idOf('A') === 'rosa' ? 'A' : 'B';
            const keyed = [...ROSA_MEMORIES, ...ROSA_NEEDLES].map((p) => ({ text: `${p[0]} ${p[1]}`, pair: p }));
            const both = pickLine(keyed, `${key}~rosa`, info);
            const pair = keyed.find((x) => x.text === both)?.pair || ROSA_MEMORIES[0];
            planned.push({ anchor: rosa, text: pair[0] }, { anchor: other(rosa), text: pair[1] });
          } else if (pid === 'tech-bytes' && slot === 'lighter') {
            const sp = partner;
            // (a story the section names, TECHNOLOGY, is a thing more often than a discovery: "Not a gadget in sight" once
            // followed CMF's wireless speakers, The Verge 12 Oct)
            const kind = PRODUCT_KICKERS.has(info.kicker) || info.kicker === 'TECHNOLOGY' ? 'product' : SOFTWARE_KICKERS.has(info.kicker) ? 'software' : 'science';
            planned.push({ anchor: sp, text: pickLine(TECH_BUTTONS[kind][idOf(sp)] || GENERIC_CHATS, `${key}~btn`, info) });
          } else if (pid === 'cosmos' && slot === 'story' && info.askAnswer) {
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            planned.push({ anchor: unit, text: pickLine(info.askAnswer.q(), `${key}~ask`, info) }, { anchor: other(unit), text: `[nod] ${info.askAnswer.line}` });
          } else if (pid === 'cosmos' && anchor !== (idOf('B') === 'unit8' ? 'B' : partner) && (slot === 'lead' || (slot === 'story' && longForm && !isNumber && unitRestates < 2 && (info.figures.length || info.loc)))) {
            // UNIT-8's restatement: after the lead, and after one more story at most (a robot repeating every
            // figure is a tic, not a character); each time in a different shape.
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            // (the figures of what aired, not only the summary's: "800,000 hours" came from the article, and "Wales."
            // was restated instead, 9 Oct)
            const f = [...info.figures, ...extractFigures(parts.join(' ').replace(/\[[^\]]*\]/g, ' '))].find((x) => parts.join(' ').includes(numbersIn(x.said)[0]?.raw || x.value) && !x.age);
            // UNIT-8 repeats the exact figure, else the place: only what was just said, and not what he said lately
            // (a re-run's figure or place comes round again; then he only notes it).
            const echoed = !f ? echoFigure(parts.join(' ').replace(/\[[^\]]*\]/g, ' '), s.title) : null;
            const options = [
              echoed ? echoed.replace(/^\w/, (c) => c.toUpperCase()) : null,
              f ? f.said.replace(/^(?:about|around|nearly|almost|some|more than|over|up to|at least) /i, '').replace(/^\w/, (c) => c.toUpperCase()) : null,
              info.loc ? spokenPlace(info.loc.entry).replace(/^\w/, (ch) => ch.toUpperCase()) : null,
              // (a figure with a unit, never one that ends on a joining word or stands bare: "16 when." aired, from "was 16 when
              // Nasa picked him", BBC 12 Oct)
            ].filter((o) => o && !/\b(?:when|as|and|or|after|before|while|but|than|to|of|in|on|at|for|with|by|from|that|which|who|if|so)$/i.test(o) && !/^[\d.,]+$/.test(o));
            const restated = options.find((o) => !airedBefore(`${o}.`, aired)) || null;
            // (after any story but the lead, nothing to restate is no exchange: "100 years. Recorded, with interest." / "Thanks,
            // UNIT-8. That helps." is the bible's restatement, a note with nothing to restate only filler, COSMOS 12 Oct, round 5;
            // after the lead the bible's exchange stays, a flat acknowledgement)
            if (restated || slot === 'lead') {
              const shapes = UNIT8_RESTATE.filter((x) => !unitShapes.has(x));
              const shape = shapes.length ? pickLine(shapes, `${key}~u8n`, info) : UNIT8_RESTATE[0];
              unitShapes.add(shape);
              unitRestates++;
              planned.push({ anchor: unit, text: restated ? `[nod] ${restated}. ${shape}` : pickLine(UNIT8_NOTED, `${key}~u8`, info) });
              planned.push({ anchor: other(unit), text: next === number ? pickLine(NOVA_TO_NUMBER, `${key}~nn`, info) : pickLine(NOVA_THANKS, `${key}~nt`, info) });
            }
          } else if (pid === 'cosmos' && slot === 'lighter' && anchor !== (idOf('B') === 'unit8' ? 'B' : partner)) {
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            planned.push({ anchor: unit, text: pickLine(UNIT8_LINES[info.kicker] || UNIT8_LINES.any, `${key}~u8`, info) });
          }
        }
      } else if (info.light && next && !inRoundup) {
        planned.push({ anchor: partner, text: pickLine(CHATS[idOf(partner)] || GENERIC_CHATS, `${key}~chat`, info) });
      }
    }
    // PACE: the mid-programme signpost, read by the story's own presenter to camera (a block boundary follows)
    // after the story's own chat lines (the reaction belongs to the story; the signpost closes the block)
    // (a signpost is no banter: the reader's own sober line, after grave news too, never inside a round-up or a link)
    const signOk = chats < maxChats && !inRoundup && !info.cross && !info.analysis;
    const signpost = info.signpost && signOk && policy?.after?.includes(slot) && maxChats - chats > 0 ? { anchor, text: info.grave || (next && next.grave) ? info.signpost : `[nod] ${info.signpost}` } : null;
    const chatsHere = [...planned.slice(0, maxChats - chats - (signpost ? 1 : 0)), ...(signpost ? [signpost] : [])];

    // ---- hand-over: a toss to the partner who reads next, sometimes (never next to grave news).
    const nextAnchor = anchors[k + 1];
    const tossOk = !solo && !pickup && next && nextAnchor !== anchor && !chatsHere.length && !info.grave && !next.grave && pid !== 'tech-bytes' && !(inRoundup && roundup.includes(next)) && !info.cross && !info.analysis;
    if (tossOk && tosses < 2 && !segments.at(-1)?.text?.includes('[look_partner] ') && hash(`${key}>`) % 3 === 0) {
      tosses++;
      const toss = program?.toss ? program.toss.replace('{name}', nameOf(nextAnchor)) : choose([`${nameOf(nextAnchor)}?`, `Over to you, ${nameOf(nextAnchor)}.`], key);
      parts.push(`[look_partner] ${toss}`);
      tossed = true;
    }

    const story = {
      type: 'story',
      storyId: s.id,
      anchor,
      // (a light topic is not good news in itself: "AI slop overwhelms bug bounty programmes" is said straight)
      emotion: info.sad ? 'sad' : info.grave ? 'serious' : isLighter ? (info.curious && CURIOUS.test(s.title) ? 'surprised' : 'happy') : info.light && !DOWNBEAT.test(`${s.title} ${s.summary || ''}`) ? 'happy' : 'neutral',
      // (a label is no strap: "BBC on Hurricane Isaias and its expected Gulf Coast landfall" went up over its own story, 9 Oct;
      // the story's own news does, cut like any headline)
      headline: shortHeadline(/^(?:\p{Lu}[\p{L}’'.&-]*\s+){1,3}on\s+\p{Lu}/u.test(s.title) ? unstop(teaseSentence(info)?.short || s.title) : s.title, program?.headlineMax),
      text: parts.join(' '),
      // A place opens on the map, and the picture follows it; a picture alone is shown full screen.
      shot: info.loc ? 'map' : s.image ? 'full' : solo ? 'close' : 'wide',
      breaking: info.breaking,
      location: info.loc ? { place: info.loc.place, lat: info.loc.lat, lon: info.loc.lon, ...(info.loc.entry?.kind === 'country' ? { scope: 'country' } : {}) } : null,
      fact: inRoundup ? null : info.figures[0]?.fact || null,
      kicker: info.kicker,
    };
    if (isNumber) story.fact = bestFigure(info).fact;
    // (a person's age is no card: "28 YEAR-OLD MAN", NPR 9 Oct; deep time is)
    const cards = info.figures.filter((f) => !f.age || (numbersIn(f.said)[0]?.scaled || 0) >= 1000);
    // (the number of the day's card shows the figure said: "$20 billion", not the story's "1.25%", Euronews 9 Oct)
    if (isNumber) cards.sort((a, b) => Number(b === bestFigure(info)) - Number(a === bestFigure(info)));
    if (!inRoundup && cards.length) story.numbers = cards.map(({ value, label, qualifier }) => ({ value, label, ...(qualifier ? { qualifier } : {}) }));
    if (!inRoundup && info.quote) story.quote = { text: info.quote.text, by: info.quote.by };
    if (!inRoundup && info.places.length >= 2) story.map = info.places.map(({ place, lat, lon }) => ({ place, lat, lon }));
    if (info.cross) story.cross = info.cross;
    if (info.analysis) story.analysis = info.analysis;
    // (news, not features: the lead, a grave or breaking story, or a hard-news topic; never history, culture,
    // wildlife or a light one; on TECH BYTES every story is "light" by topic, so a security flaw or a court ruling
    // there gets its board too)
    if (program?.boards?.includes('known') && !inRoundup && !isNumber && !isLighter && !quick && (k === 0 || info.grave || info.breaking || (HARD_NEWS.has(info.kicker) && !info.curious && (!info.light || pid === 'tech-bytes')))) {
      // (a point that leans on one not on the board never goes up: "The last stint was in 2018 / The two were unharmed in
      // the incident", 14 Oct)
      const known = knownPoints(info.sentences.filter((x) => !['sequel', 'here', 'person'].includes(untold(x, `${s.title} ${info.sentences.join(' ')}`))));
      // (never a story's plot as what we know: "War reduced Japan to zero / Two years have passed since then" went up for a
      // TV series' trailer, Ars Technica 12 Oct)
      const fiction = /\b(?:trailer|season|series|episode|film|movie|novel|sequel|remake|prequel|showrunner|premiere)\b/i.test(s.title) || ['CULTURE', 'GAMING'].includes(info.kicker);
      if (known.length >= 2 && !fiction) story.known = known;
    }
    // FROM → TO: a figure the story itself says moved (it airs only if the presenter says both values)
    if (program?.boards?.includes('change') && !inRoundup && !isNumber) {
      const change = changeFrom(info.sentences);
      if (change) story.change = change;
    }
    // HOW WE GOT HERE: a main story whose source dates its earlier steps (the whole article: history sits deep in it)
    if (program?.boards?.includes('timeline') && !story.known && !inRoundup && !isNumber && !isLighter && !quick) {
      const steps = timelinePoints([...info.prevOf.keys()]);
      if (steps.length >= 2) story.timeline = steps;
    }
    // SHARE: a part of a whole the story states ("65 percent of Gaza"); WHAT HAPPENS NEXT: a dated step still to come
    // (the article's own sentences: a schedule often sits deep in it); WHO'S WHO: the people it names with their
    // public roles. Each airs only if the presenter says the share, the date or the names (the validator checks).
    if (program?.boards?.includes('share') && !inRoundup && !isNumber) {
      const share = shareFrom(info.sentences);
      if (share) story.share = share;
    }
    if (program?.boards?.includes('next') && !inRoundup && !isNumber && !isLighter && !quick) {
      const at = now instanceof Date ? now.getTime() : Date.now();
      const next = nextFrom(info.sentences, { published: s.published || at, now: at });
      if (next) story.next = next;
    }
    if (program?.boards?.includes('who') && !inRoundup && !isNumber && !isLighter && !quick) {
      const who = whoFrom(`${s.summary || ''} ${s.body || ''}`);
      if (who) story.who = who;
    }
    if (inRoundup) story.feature = 'roundup';
    else if (isNumber) story.feature = 'number';
    else if (isLighter) story.feature = 'lighter';
    segments.push(story);

    for (const c of chatsHere) {
      chats++;
      segments.push({ type: 'chat', anchor: solo ? 'A' : c.anchor, emotion: isLighter && pid !== 'cosmos' ? 'happy' : 'neutral', text: c.text });
    }
  });

  // ---- sign-off
  const last = order.at(-1);
  const outroAnchor = solo ? 'A' : program?.outroAnchor || 'B';
  const partnerName = presenters[other(outroAnchor)]?.name;
  const closers = {
    'world-now': () => `That's ${title}. [nod] From ${partnerName} and from me, thank you for watching. Stay with us on ${channelName}.`,
    'tech-bytes': () => `That's ${title}. [nod] From ${partnerName} and from me, thanks for watching. More news around the clock on ${channelName}.`,
    cosmos: () => `That's ${title}. [nod] From ${partnerName} and from me, thank you for watching. Stay with us on ${channelName}.`,
    'money-minute': () => `That's your ${title}. I'm ${presenters.A.name}. Stay with us on ${channelName}. [papers]`,
    'news-60': () => `That's the minute. Stay with us on ${channelName}. [papers]`,
  };
  const generic = solo
    ? choose([`That's ${title}. [wave] Stay with us here on ${channelName}.`, `And that's ${title}. [wave] Thanks for watching, and stay with us on ${channelName}.`], seed)
    : choose(
        [`That's ${title}. [wave] From ${partnerName} and from me, thanks for watching. Stay with us here on ${channelName}.`, `And that's ${title}. [wave] Thanks for your company. There's more news around the clock here on ${channelName}.`],
        seed
      );
  const closer = closers[pid] ? closers[pid]() : generic;
  segments.push({
    type: 'outro',
    anchor: outroAnchor,
    emotion: last?.grave ? 'neutral' : closers[pid] ? 'neutral' : 'happy',
    text: last?.grave ? closer.replace('[wave]', '[nod]') : closer,
  });
  return { title: `${title} (demo)`, segments };
}

const PICKUP_LINE = /^(?:thanks|thank you)(?: very much)?,? [A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?\.$/i;


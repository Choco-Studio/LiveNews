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
import { ALSO_LEAN, LIGHT, contentWords, extractFigures, sentencesIn, harmlessIncident, isGrave, leansOnPrevious, notForFeatures, numbersIn, quotesIn, severity } from '../facts.js';
import { locate, lookupPlace, placesIn } from '../gazetteer.js';
import { KNOWN_MAX, LINK_GAP, SENTENCE_WORDS, hasFiniteVerb, headlineNames, shortHeadline, splitClauses, trimClause } from '../writer.js';
import { topicOf } from '../topics.js';
import { AHEAD, deskOf } from '../correspondents.js';

const DEATHS = /\b(?:dead|deaths?|die[sd]|killed|killings?|victims?|mourn\w*|funeral)\b/i;
// Not grave, but not something to smile about either.
const SOBER = /\b(?:volcan\w*|erupt\w*|storms?|strikes?|protests?|elections?|courts?|police|cancel\w*|closures?|bans?|shortages?|prices|inflation|recession|stocks?|shares|markets?|rates?|alerts?|jobs? at risk|job (?:cuts|losses)|lay-?offs?|redundanc\w*|rulings?|under pressure|flu|waiting lists?)\b/i;
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
  builds: 'built', breaks: 'broken', shuts: 'shut', pulls: 'pulled', removes: 'removed', releases: 'released',
  signs: 'signed', expands: 'expanded', acquires: 'acquired', invests: 'invested', joins: 'joined', leaves: 'left',
  quits: 'quit', hires: 'hired', fires: 'fired', settles: 'settled',
};
// A headline in Title Case ("NASA’s SSPICY Mission to Demonstrate In-Space Inspection Technologies", NASA 9 Oct) is said
// in sentence case: a word the story itself writes in lower case is a common word; a name keeps its capital.
const TITLE_SMALL = /^(?:A|An|The|To|Of|In|On|At|For|By|And|Or|But|As|With|From|Into|Over|Up)$/;
export function sentenceCase(title, info) {
  const words = String(title || '').split(/\s+/);
  const long = words.slice(1).filter((w) => /^\p{L}[\p{L}’'-]{3,}/u.test(w));
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
export const LABEL_TITLE = /^(?:["“‘']|(?:\p{Lu}[\p{L}’'.&-]*\s+){1,3}on\s+\p{Lu}|(?:Watch|Video|Listen|In pictures|Explained|Analysis|Live)\s*:|R\.?I\.?P\.?\s)/u;
export function spokenTitle(title, info) {
  const t = sentenceCase(String(title || '').trim(), info).replace(/[.!]+$/, '');
  if (!t || /^["“‘']|:|\?$/.test(t)) return t;
  const words = t.split(/\s+/);
  const key = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
  const i = words.findIndex((w, k) => k > 0 && HEADLINE_PERFECT[key(w)]);
  if (i < 1 || i > 12) return t;
  const rest = words.slice(i + 1).join(' ');
  // a second verb after a comma ("Amazon responds to data center backlash, says it...") keeps the headline
  const after = [...rest.matchAll(/,\s*([a-z]+)/g)].map((m) => m[1]);
  if (after.some((w) => HEADLINE_PERFECT[w] || /^(?:says?|said)$/.test(w))) return t;
  let subject = words.slice(0, i).join(' ');
  const verb = `has ${HEADLINE_PERFECT[key(words[i])]}${words[i].match(/[,;]$/)?.[0] || ''}`;
  if (!/^(?:The|A|An|This|Its|His|Her|Their)\b/.test(subject) && !/['’]s$/.test(words[0])) {
    // a name stays as it is; a common noun takes the outlet's own article, else the headline stays
    const text = `${info?.s?.summary || ''} ${info?.s?.body || ''}`;
    const first = words[0].replace(/[^\p{L}-]/gu, '');
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const det = text.match(new RegExp(`\\b(a|an|the)\\s+${esc(subject.toLowerCase())}\\b`, 'i'));
    // a name: written with a capital mid-sentence by the outlet, shaped like one ("OpenAI", "NASA"), or a first and
    // a last name ("Milt Windler, ...", "Jack Dorsey’s Bitchat")
    const shaped = /\p{Lu}/u.test(first.slice(1));
    const named = shaped || !!lookupPlace(first) || new RegExp(`[\\p{Ll},;]\\s+${esc(first)}\\b`, 'u').test(text) || (/^\p{Lu}/u.test(words[1] || '') && /^\p{Lu}\p{Ll}/u.test(first));
    if (det) subject = `${det[1][0].toUpperCase()}${det[1].slice(1).toLowerCase()} ${shaped || named ? subject : subject[0].toLowerCase() + subject.slice(1)}`;
    else if (!named) return t;
  }
  return `${subject} ${verb}${rest ? ` ${rest}` : ''}`;
}
// The outlet's own voice, outside quotation marks ("We don't know a ton about the Fitbit Edge", The Verge, 4 Oct):
// never our presenters' words.
// (and the reader addressed: "You might not have known that it was Hamilton who...", Ars Technica 9 Oct)
const FIRST_PERSON = /\b(?:[Ww]e|[Ww]e['’](?:re|ve|ll|d)|[Oo]ur|us|I['’](?:m|ve|d|ll)|my|me|[Yy]ou(?:['’](?:re|ve|ll|d))?|[Yy]our)\b|(?:^|[^\w.])I (?=[a-z])/;
export const ownVoice = (t) => FIRST_PERSON.test(String(t).replace(/“[^”]*”|"[^"]*"/g, ' '));
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
const OWN_ATTRIBUTION = /\b(?:says?|said|according to|reports?|reported|announced|told|officials|estimates?)\b/i;
// Live pages: lines that point at the outlet's own coverage are not news.
// (and a press release's logistics: "The crew members will discuss their science mission during a news conference at
// 3:30 p.m. EDT...", NASA 9 Oct)
const LIVE_BOILERPLATE = /^(?:follow|read|watch|see) (?:the |our |all the )?(?:latest|live|updates)|\blive updates?\b|\bas it happened\b|\bdoes not (?:offer|accept) (?:or accept )?money\b|\bfor coverage or interviews\b|\b(?:news|press) conference\b|\bmedia (?:briefing|teleconference)\b|\bwill (?:air|stream) live\b|\bNASA\+|^Update[sd]?\b[^:]{0,40}:|\b(?:article|story|post) (?:was|has been) updated\b/i;

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
const HARD_NEWS = new Set(['SECURITY', 'PRIVACY', 'BUSINESS', 'CLIMATE', 'CONFLICT', 'EARTHQUAKE', 'ECONOMY', 'ELECTIONS', 'ENERGY', 'HEALTH', 'INDUSTRY', 'JOBS', 'JUSTICE', 'MARKETS', 'POLITICS', 'PROTESTS', 'TRADE', 'TRANSPORT', 'VOLCANO', 'WATER', 'WEATHER', 'WILDFIRE', 'WORLD']);
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
      .replace(/^[^,]{0,60}?\b(?:says|said|reports|reported|confirmed)\s+(?:that\s+)?/i, '');
    // attribution comes off a count ("the agency says about 1.2 million homes are without power"), never off a
    // claim: "Geffray said the closures were a security precaution" is the minister's word, so it keeps it (or,
    // too long for the board, is left out)
    const attributed = stripped !== t;
    const trailing = attributed && /,\s*(?:according to [^,.]+|(?:the )?[\w’' -]{2,40}? (?:says|said|reports|reported))\.?$/i.test(t);
    for (const clause of stripped.split(/,\s*and\s+|;\s*|\s+and\s+(?=(?:about |more than |nearly |some |at least )?\d)/i)) {
      let c = clause.replace(/[.!,;:]+$/, '').trim();
      // (a fact after ", officials said" stands without it: "Nearby roads were closed")
      if (attributed && !/\d/.test(c) && !(trailing && !JUDGEMENT.test(c))) c = stripped.split(/,\s*and\s+|;\s*/).length === 1 ? t.replace(/[.!,;:]+$/, '').trim() : '';
      if (!c || /^(?:that|there|which|who|but|so|also)\b/i.test(c) || /\b(?:it|its|they|their|them|this|these|those|he|she|his|her)\b/i.test(c)) continue; // a point stands alone
      const words = c.split(' ').length;
      if (words < 3 || words > 9 || c.length > KNOWN_MAX) continue;
      if (/\s[–—-]\s/.test(c) || !hasFiniteVerb(c)) continue; // a statement with a verb of its own, not a noun phrase
      c = c[0].toUpperCase() + c.slice(1);
      if (!out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c);
      if (out.length >= max) break;
    }
  }
  return out;
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
  { test: /\b(?:cost|price|priced|dollars|euros|pounds|\$|£|€)/i, q: (max) => [`[glasses] ${max}, the question everyone asks. What does it cost?`, '[glasses] And the price tag?', `[chin] ${max}, what will all this cost?`] },
  // (not how long something stops: "paused its bug bounty program until next year" has no launch to wait for, 5 Oct)
  { test: /(?<!\b(?:until|till|through|for the rest of)\s)\b(?:next year|this year|later this year|next month|in the (?:spring|summer|autumn|winter)|on sale|go on sale|launch(?:es)? (?:in|next)|from next|by \d{4})\b/i, q: () => ['[chin] And when does it reach actual people?', '[chin] When can anyone actually use it?', '[glasses] And the timetable?'] },
  // what happens now: a deadline, a plan, an appeal ("The task force will reportedly have 120 days to create a report")
  // (not any "will": "The line will carry 40,000 passengers a day" is the story's figure, not what comes next)
  { test: /\b(?:plans? to|(?:is|are) expected to|(?:is|are) set to|will (?:now|next|then|decide|vote|rule|review|report|consider|appeal)|next (?:week|step|steps)|within \d+ (?:days|weeks|months)|(?:have|has) \d+ (?:days|weeks|months) to|deadline|appeal\w*)\b/i, q: () => ['[chin] And what happens now?', '[chin] So what comes next?', '[glasses] And from here?'] },
  // who it touches, when the story says who
  { test: /\b(?:users|customers|owners|drivers|patients|developers|consumers|subscribers|players|parents|families|small businesses|people who)\b/i, q: () => ['[chin] And who does this actually affect?', '[glasses] Who is this for, exactly?', '[chin] So who notices the difference?'] },
  // where the law stands, when a court, a regulator or a law is in it
  // (a court or a regulator deciding, not a word: "beyond “specific rules or new laws,”" answers nothing)
  { test: /\b(?:ruled|ruling|court|judge|unconstitutional|unlawful|illegal|precedent|warrant|regulators? (?:say|said|ruled|approved|fined|ordered))\b/i, q: () => ['[steeple] And where does the law stand?', '[steeple] And the legal position?', '[chin] So where does that leave the rules?'] },
  { test: /\b(?:using|uses|by (?:using|\w+ing)|works (?:by|without)|without an?)\b/i, q: () => ['[chin] How does it actually work?', '[chin] Walk me through how it works.', '[glasses] And the clever part is?'] },
  // the catch itself, last: a "but" is in most stories
  { test: /\b(?:but|however|only|not yet|still|although)\b/i, q: () => ['[steeple] So what is the catch?', '[chin] There is always a but. What is it here?', '[steeple] And the small print?'] },
];
// COSMOS DESK, UNIT-8 ASKS: the robot asks Dr Reyes the literal question a story leaves (how far, how long ago, how
// big, how they know, what comes next, what it means) and she answers with the story's own sentence. Each type
// once a programme; several phrasings for a 24/7 rotation; UNIT-8 is never rude, only exact.
const ASK = [
  { test: /\b\d[\d,.]*\s*(?:million |billion )?(?:light[- ]years?|kilomet(?:re|er)s?|km|miles|astronomical units?)\b/i, q: () => ['[chin] Dr Reyes, how far is that, exactly?', '[chin] And the distance, Dr Reyes?', '[nod] I require the distance, Dr Reyes.'] },
  { test: /\b(?:\d[\d,.]*|a few|several|hundreds of|thousands of|millions of)\s+(?:million |billion |thousand )?years? (?:ago|old|earlier|later)\b/i, q: () => ['[chin] Dr Reyes, how long ago was that?', '[chin] And when, Dr Reyes?', '[nod] I would like the date, Dr Reyes.'] },
  { test: /\b(?:times (?:the size|larger|bigger|heavier|wider|smaller)|diameter|kilomet(?:re|er)s? (?:wide|across|long)|(?:metres|meters) (?:tall|high|long|wide)|the size of)\b/i, q: () => ['[chin] How large, Dr Reyes?', '[nod] I require a sense of size, Dr Reyes.', '[chin] And how big is it?'] },
  // (a method said, not just named: "the study team retained control over the analysis" answers nothing)
  { test: /\b(?:measured|measurements? (?:of|from|show)|observations? (?:of|from|show)|observed|data from|samples? (?:taken|collected|from)|simulations? show|scans? (?:of|show)|using (?:a |the )?(?:telescope|satellite|probe|rover|scanner|microscope|spectrometer|radar|sensors?)|crystals? show|randomi[sz]ed|followed \d[\d,]* (?:people|adults|patients|participants))\b/i, q: () => ['[chin] How do they know, Dr Reyes?', '[chin] Dr Reyes, how was this measured?', '[nod] What is the evidence, Dr Reyes?'] },
  { test: /\b(?:plans? to|(?:is|are) expected to|(?:is|are) set to|next (?:year|month|step)|will (?:launch|land|fly|return|begin|start)|the next mission)\b/i, q: () => ['[chin] What happens next, Dr Reyes?', '[nod] And next, Dr Reyes?', '[chin] Dr Reyes, what is the next step?'] },
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
const NOVA_THANKS = ['Thank you, UNIT-8.', 'Precise as ever, UNIT-8.', 'Noted, UNIT-8. Thank you.', 'Thank you. Exactly right, UNIT-8.', '[nod] Quite so, UNIT-8.'];
// The tail of UNIT-8's restatement ("40,000. Logged."): one shape per episode, rotated across episodes.
const UNIT8_RESTATE = ['Logged.', 'Stored, Dr Reyes.', 'I have checked it twice.', 'That is now on file.', 'Confirmed.', 'Recorded, with interest.', 'I will not forget it.'];
// Nova hands the number of the day to UNIT-8 (it is his story), not in the same words every time.
const NOVA_TO_NUMBER = [
  '[look_partner] Thank you, UNIT-8. You have our number of the day.',
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
const sentencesOf = (s) =>
  sentencesIn(String(s || '').replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, ''))
    .filter(Boolean)
    .map((t) => t.replace(/\s*\((?=[A-Za-z&]*[A-Z][A-Za-z&]*[A-Z])[A-Za-z&]{2,8}\)(?=[\s,.;:!?]|$)/g, '').replace(/\s*\([a-z][a-z-]{2,20}\)(?=[\s,.;:!?]|$)/g, ''))
    // (a blockquote's ">" is page furniture: "> The outputs of this opt-in vulnerability scanner...", The Verge 9 Oct)
    .map((t) => t.replace(/^\s*>+\s*/, ''))
    // (an outlet's label is no news: "Exclusive: Firms made more than £340m...", Guardian 9 Oct; nor is a currency
    // conversion in brackets: "$20 billion (€17.8bn)", Euronews 9 Oct)
    .map((t) => t.replace(/^(?:Exclusive|Revealed|Analysis|Opinion|Explainer|Watch|Live|Update|Breaking)\s*:\s*(?=\p{Lu})/u, '').replace(/\s*\((?:€|£|\$|US\$|A\$|C\$|¥)\s?[\d.,]+\s*(?:bn|m|k|billion|million|trillion|tn)?\)/g, ''))
    // (a quotation cut in two is no sentence: 'Way too close to comfort." Radars and telescopes...', Ars Technica 9 Oct)
    .filter((t) => !FRAGMENT.test(t.trim()) && !brokenQuote(t) && !VERBLESS(t.trim())); // never inside a figure, a title or initials
const unstop = (t) => String(t).trim().replace(/[\s.!?:;,]+$/, '');
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
  if (lookupPlace(word) || /^[A-Z][a-z]+[A-Z]/.test(word)) return text;
  // the headline ends a sentence of its own: "...space station. Astronauts on..." is not a name mid-sentence
  const story = `${String(info.s.title).replace(/[.!?]*$/, '.')} ${info.s.summary || ''} ${info.s.body || ''}`;
  const lower = new RegExp(`(?<![\\p{L}])${word.toLowerCase()}(?![\\p{L}])`, 'u').test(story);
  // A name is written with its capital in the middle of a sentence somewhere in the story; a common word is not.
  const midSentence = new RegExp(`[\\p{Ll},;:]\\s+${word}(?![\\p{L}])`, 'u').test(story);
  // (a first and a last name: "Meredith Whittaker says...", BBC 9 Oct, once went out as "meredith Whittaker")
  const fullName = new RegExp(`^${word}\\s+\\p{Lu}\\p{Ll}+(?:\\s|,|['’]s)`, 'u').test(text) && !COMMON_START.test(text) && !lower;
  if (fullName) return text;
  return lower || COMMON_START.test(text) || !midSentence ? word.toLowerCase() + text.slice(word.length) : text;
}
// A person by surname (or first name) alone, never heard in the story: "Scully said the organisation may have to
// accept..." after "A National Trust manager says..." (BBC 5 Oct). Said whole the first time, as the article gives
// it ("Justin Scully said..."); a name the article never gives whole (a company: "Microsoft said") stays as it is.
const NOT_A_NAME = new Set('It He She They We You There This That These Those Which What Who When While After Before If As At In On For With From By The A An And But So Then Yet Its Their His Her Our Each All Both Some Many Most One Officials Police Mr Mrs Ms Dr Prof Professor Sir Dame Lord Lady Chief President Minister Senator Judge Society Chairman Manager'.split(' '));
const BARE_NAME = /(?:^|[,;:]\s+|\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)(\p{Lu}[\p{Ll}’'-]+)(?=\s+(?:said|says|told|added|explained|warned|believes|thinks|argued|noted|wrote|hopes|was|is|has|had)\b)/u;
function nameWhole(t, told, info) {
  const m = String(t).match(BARE_NAME);
  const name = m?.[1];
  if (!name || NOT_A_NAME.has(name) || told.includes(name) || info.s.title.includes(name)) return t;
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
const COMMON_PROPER = /^(?:Earth|Moon|Sun|Mars|Venus|Jupiter|Saturn|Mercury|Neptune|Uranus|Pluto|God|Internet|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|English|Christmas|Easter|Covid|COVID)$/;
function strangers(t, told, info) {
  const out = [];
  for (const m of String(t).matchAll(/(?<=[\p{Ll},;”"]\s+)(\p{Lu}\p{Ll}[\p{Ll}’'-]+)(?![’']s\b)(?!\s+\p{Lu})/gu)) {
    const name = m[1];
    const before = t.slice(0, m.index);
    if (/\b(?:the|a|an|its|their|his|her|our)\s+$/i.test(before) || /\p{Lu}[\p{L}’'-]*\s+$/u.test(before)) continue;
    if (COMMON_PROPER.test(name) || NOT_A_NAME.has(name) || lookupPlace(name) || told.includes(name) || info.s.title.includes(name)) continue;
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
  if (lead && !common && !COMMON_START.test(out) && !NOT_A_NAME.has(lead) && !COMMON_PROPER.test(lead) && !lookupPlace(lead) && !told.includes(lead) && !info.s.title.includes(lead)) {
    const source = source0;
    const first = source.match(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${lead}(?![\\p{L}])`, 'u'))?.[1];
    if (first && !NOT_A_NAME.has(first) && !lookupPlace(first) && !COMMON_START.test(first)) out = `${first} ${out}`;
  }
  for (const name of strangers(out, told, info)) {
    const source = `${info.s.summary || ''} ${info.s.body || ''}`;
    const first = source.match(new RegExp(`(?<![\\p{L}])(\\p{Lu}\\p{Ll}[\\p{Ll}’'-]*)\\s+${name}(?![\\p{L}])`, 'u'))?.[1];
    if (!first || NOT_A_NAME.has(first) || lookupPlace(first)) return null;
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
  const out = String(t).replace(/(?<=\p{L}),\s+((?:a|an|the|who|which|whose)\s[^,]{4,90}),\s+/gu, (m, aside) => {
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
    const before = t.slice(0, m.index);
    return !re.test(told) && !/(?<=\S\s+)\p{Lu}\p{Ll}+/u.test(before);
  });
}
// The figure UNIT-8 echoes: one the story said, the headline's first ("800,000 hours", not the year before's 970,000),
// a duration included (no card shows it).
function echoFigure(text, title) {
  const list = numbersIn(text)
    .map((n) => ({ n, word: text.slice(n.end).match(/^\s*((?:million|billion|bn)\s+)?([a-z]{3,})/)?.[0] }))
    .filter(({ n, word }) => word && !(Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100 && !n.unit) && !/^\s*(?:st|nd|rd|th)\b/.test(word) && !/\p{L}[-‐‑]$/u.test(text.slice(0, n.index)));
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
const PRONOUN_START = /^(?:It|Its|They|Their|This|These|Those|He|She|His|Her)\b/;
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
  const m = String(t).trim().match(/^The\s+([a-z][a-z-]{2,})\b/);
  return !!m && contentWords(info.s.title).some((w) => w.slice(0, 5) === m[1].slice(0, 5)) && !restates(t, info.s.title);
};
// (nor a connective: "But Norwich Apex Data Centre has defended the scheme..." once opened a story, BBC 9 Oct; nor a time
// that points back: "She married her first husband, James Cox Hamilton, that same year", Ars Technica 9 Oct)
const CONNECTIVE_START = /^(?:But|And|So|Yet|Still|However|Instead|Meanwhile|Also|Nevertheless|Nonetheless|Moreover|Besides|Plus|Then)\b/;
const TIME_BACK = /\b(?:at the time\b(?! of)|(?:that|the) same (?:year|day|week|month|time|night|morning)|that (?:year|day|week|month|night|morning)|the following (?:year|day|week|month|morning)|later that (?:year|day|week|month|night))\b/i;
// (nor one that points back with "this" or "these" before its first comma: "CHIME can use this hydrogen signal to trace
// how matter is spread...", ScienceDaily 9 Oct, before the sentence that says what the signal is)
const POINTS_BACK = /^[^,;:]{0,60}?\b(?:this|these|those)\s+(?!(?:week|weekend|month|year|morning|afternoon|evening|summer|winter|spring|autumn|time|season|is|was|are|were)\b)[a-z]/i;
const selfStanding = (info, t) => !(/^["“‘]/.test(String(t).trim()) && !SAID_BY.test(t)) && !FOLLOWS_ON.test(String(t).trim()) && !CONNECTIVE_START.test(String(t).trim()) && !TIME_BACK.test(t) && !POINTS_BACK.test(String(t).trim()) && (info.sentences.indexOf(t) === 0 ? !PRONOUN_START.test(t) && !ALSO_LEAN.test(t) && !leansOnHeadline(info, t) : !leansOnPrevious(t));
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

const kickerFor = (s) => topicOf(s);

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

function study(story) {
  const title = plainTitle(story.title) || story.title;
  const s = { ...story, title };
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
  const fromSummary = sentencesOf(s.summary).filter((x) => !LIVE_BOILERPLATE.test(x) && !isTranscriptLine(x) && !ownVoice(x) && unstop(x).toLowerCase() !== unstop(title).toLowerCase());
  // the story dossier (wave 3 §3.1): the article's own sentences after the summary's, never one the summary
  // already says, at most 9 in all (depth for programmes of 8-10 minutes, never padding)
  const seen = new Set(fromSummary.map((x) => unstop(x).toLowerCase()));
  const fromBody = s.body ? sentencesOf(s.body).filter((x) => !LIVE_BOILERPLATE.test(x) && !isTranscriptLine(x) && !ownVoice(x) && !seen.has(unstop(x).toLowerCase()) && unstop(x).toLowerCase() !== unstop(title).toLowerCase() && wordCount(x) >= 6 && wordCount(x) <= 34) : [];
  const sentences = [...fromSummary, ...fromBody].slice(0, Math.max(9, fromSummary.length));
  // each sentence's predecessor as the outlet wrote it (a sentence that follows on is told only after it)
  const raw = [...sentencesOf(s.summary), ...(s.body ? sentencesOf(s.body) : [])];
  const prevOf = new Map(raw.map((x, i) => [x, raw[i - 1]]));
  // Breaking news is never "light", whatever it is about.
  const light = !grave && !isBreaking(story.title) && LIGHT.test(title) && !SOBER.test(text);
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
    curious: light && (LIGHTER.test(title) || CURIOUS.test(title)),
    loc: precise,
    country: precise ? precise.entry.country || precise.entry.name : null,
    places: placesIn(text),
    figures,
    sentences,
    prevOf,
    // (someone's words, whole: never an unattributed fragment like "...we were making history.", Ars Technica 4 Oct)
    quote: quotesIn(s.summary || '').find((q) => q.by && q.text.split(/\s+/).length >= 4 && !/^(?:…|\.\.\.)/.test(q.text)) || null,
    kicker: kickerFor(s),
    // the names the headline is about: a sentence cut to length keeps them
    keep: headlineNames(title, `${s.summary || ''} ${s.body || ''}`),
    // never the number of the day: a quake that harmed no one, a closure, job losses
    noFeature: notForFeatures(text),
  };
}

// ---------------------------------------------------------------- running order

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
function runningOrder(infos, n, program, featured = new Set()) {
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
  const lead = (graver && take((i) => i === graver)) || take((i) => i.breaking) || takeLead(pool, program) || take(() => true);
  if (!lead) return { order: [], roundup: [], lighter: null, number: null };
  let slots = n - 1;
  // A feature that ran lately (the station's memory) gives way to another story when one qualifies: the same
  // "And finally" and the same number of the day do not come round every rotation.
  const fresh = (i) => !featured.has(i.s.id);
  let lighter = null;
  if (features.includes('lighter') && slots >= 1) {
    const ok = (i) => !i.breaking && !i.grave && !i.live;
    const own = (i) => !primary || i.s.category === primary;
    const tiers = [(i) => ok(i) && own(i) && i.curious, (i) => ok(i) && own(i) && i.light, (i) => ok(i) && i.curious && !BEAT_OF_OTHERS.test(i.s.category), (i) => ok(i) && i.light];
    for (const strict of [true, false]) for (const t of tiers) lighter ||= take((i) => t(i) && (!strict || fresh(i)));
    if (lighter) slots--;
  }
  let number = null;
  if (features.includes('number')) {
    // never grave, never a harmless quake or a closure, never breaking news nor a live page
    const ok = (i) => !i.grave && !i.mild && !i.noFeature && !i.breaking && !i.live && i.figures.some((f) => f.score >= 3 && !f.age);
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
    if (want < min) want = 0;
  }
  const mains = [];
  // a breaking story that does not lead plays first after the lead
  if (breaking && breaking !== lead && pool.includes(breaking) && slots - want > 0) mains.push(take((i) => i === breaking));
  while (mains.length < slots - want && pool.length) mains.push(bestMain(pool, program));
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
    const weight = (i) => (tight && shortHeadline(i.s.title, tight).length > tight ? 1.5 : 0) + (i.s.image && program?.pictures !== 'every' && !pictures ? 2 : 0) + ((i.s.outlets || 1) > 1 ? 2 : 0) + (i.grave ? 1.5 : 0) + (pictures ? Math.min(3, i.sentences.length) * 0.3 + (HARD_NEWS.has(i.kicker) || i.hard ? 1.5 : 0) : 0);
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
  while (mains.length + roundup.length < slots && pool.length) mains.push(bestMain(pool, program));
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
  for (let k = 0, seen = 0; k < pool.length && seen < 6; k++) {
    if (pool[k].live) continue;
    seen++;
    // (NEWS IN 60's strap: a lead whose headline fits its 36 characters, all else equal)
    const v = newsValue(pool[k], k) + (tight && shortHeadline(pool[k].s.title, tight).length > tight ? 1 : 0);
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
function bestMain(pool, program = null) {
  // (a tight strap, NEWS IN 60's 36 characters: a story whose headline cannot be cut to it cleanly gives way to one that
  // can, all else equal)
  const tight = program?.headlineMax && program.headlineMax < 40 ? program.headlineMax : 0;
  let best = 0;
  let bestScore = Infinity;
  for (let k = 0; k < Math.min(3, pool.length); k++) {
    const i = pool[k];
    // (a story whose article was read has depth to tell: a one-line summary is the weaker main story)
    const score = k + (tight && shortHeadline(i.s.title, tight).length > tight ? 1.5 : 0) - (i.s.image ? 1.2 : 0) - (i.sentences.length >= 5 ? 0.8 : 0) - ((i.s.outlets || 1) > 1 ? 1 : 0) - (i.severity >= 3 ? 1.6 : i.grave ? 1.3 : 0) - (i.hard ? 0.5 : 0) + (i.mild ? 0.4 : 0) + (i.curious ? 0.5 : 0) + (i.live ? 9 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return pool.splice(best, 1)[0];
}

// (a person's age is no number of the day; deep time is: "more than 10bn years old", Guardian 9 Oct)
const bestFigure = (info) => info.figures.filter((f) => !f.age || (numbersIn(f.said)[0]?.scaled || 0) >= 1e6).sort((a, b) => Number(!!b.inTitle) - Number(!!a.inTitle) || b.score - a.score)[0] || info.figures[0];

// ---------------------------------------------------------------- the provider

export function createMockProvider() {
  return {
    name: 'mock',
    // It copies the feed text, so it has nothing to check: it never stands in for the editor.
    reviews: false,
    available: () => true,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count, now, recent, featured }) {
      const usage = { input: 0, output: 0, cached: 0 };
      // Asked to review anyway (outside a ProviderChain): return the script untouched and say so.
      if (stage === 'review') return { text: JSON.stringify(script), usage, reviewed: false };
      return { text: JSON.stringify(writeEpisode({ stories, channelName, program, presenters, count, now: now ?? new Date(), recent, featured })), usage };
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

function writeEpisode({ stories, channelName, program, presenters, count, now, recent, featured }) {
  const title = program?.title || channelName;
  const solo = !presenters.B;
  const pid = program?.id || '';
  const quick = pid === 'news-60';
  const maxWords = program?.sentenceWords || SENTENCE_WORDS[pid] || 24;
  const placeWithin = PLACE_WITHIN[pid] ?? Infinity;
  // The station's memory of lines aired in the last hours, oldest first: sentence -> when it last aired.
  const aired = new Map();
  (recent || []).forEach((line, at) => lineSentences(line).forEach((x) => aired.set(x, at)));
  let tick = (recent || []).length;
  const markAired = (line) => lineSentences(line).forEach((x) => aired.set(x, tick++));
  // A live page whose only lines point at the outlet's own coverage has nothing to read out.
  const all = stories.map(study).filter((i) => !i.live || i.sentences.length);
  // Live pages only when there is nothing else.
  const fresh = all.filter((i) => !i.live);
  let pool = fresh.length >= Math.min(all.length, count ?? program?.stories ?? 5) ? fresh : all;
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
  const n = Math.min(pool.length, count ?? program?.stories ?? 5);
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
  const { order, roundup, lighter, number } = runningOrder(pool, n, program, new Set(featured || []));
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
        if (pass === 0 && desks.has(deskKey(info))) continue;
        links.add(info);
        desks.add(deskKey(info));
      }
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
      if (!selfStanding(info, t) || (!quoted && /^[^,]{0,40}\b(?:says|said|told)\b/.test(t)) || asks(t) || DEFINES.test(t)) continue;
      const short = wordCount(t) <= 16 ? t : dropAside(t, 16) || trimClause(t, 16, 6, { keep: info.keep });
      if (short) return { t, short };
    }
    return null;
  };
  const said = (info) => {
    if (LABEL_TITLE.test(info.s.title)) {
      const pick = info.teased ? { short: info.teased } : teaseSentence(info);
      if (pick) {
        info.teased = pick.short;
        if (pick.t) info.teasedFrom = pick.t;
        return unstop(pick.short);
      }
    }
    const title = sentenceCase(info.s.title, info);
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
      const tells = (t, j) => j === 0 || newWords(s.title, t) <= contentWords(s.title).length - 2;
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
        line = pictureItems ? spokenTitle(s.title, info) : early(s.title) ? s.title : movePlaceFront(s.title, info) || s.title;
      }
      const lead = idx === 0 ? program?.roundup?.opener || 'Now, around the world in 30 seconds.' : '';
      const where = pictureItems || early(line) || fromHeadline ? '' : `${idx === 0 ? 'First, ' : 'Now to '}${spokenPlace(info.loc.entry)}.`;
      const item = [asSentence(line)];
      if (wordCount(line) + 2 + wordCount(s.source) <= maxW) attribute(item, info, key);
      parts.push(...[`${idx === 0 ? '[point_screen] ' : ''}${lead}`.trim(), where].filter(Boolean), ...item);
    } else {
      // Openers: the summary's first sentence when it says the headline better; the lead never re-reads the
      // intro's line about it (it goes on with the next fact).
      const first = info.sentences[0];
      const leadAfterIntro = k === 0 && introSaidHeadline;
      // TECH BYTES: the lead keeps one summary sentence back for THE CATCH (chosen first, so the opener cannot take it).
      // PACE (long programmes): main stories may keep one back too, for a short analysis exchange after them
      // (TECH BYTES: another CATCH question, never the same one twice; WORLD NOW: the partner adds it).
      const linked = links.has(info);
      const deep = !linked && longForm && !isNumber && !isLighter && !info.grave && !info.breaking && !info.live && exchanges < 3 && info.sentences.length >= 3; // the lead too with 3 (critic: no analysis exchange aired)
      // (an answer is one spoken sentence of the programme's length: the validator trims stories, not chats)
      const fits = (c, t) => c.test.test(t) && answerable(t, info) && wordCount(t) <= maxWords + 2;
      // (never before a grave story: no chat follows a story there, and the kept-back sentence would be lost)
      const quietAfter = !!order[k + 1]?.grave;
      const catchFor = pid === 'tech-bytes' && (k === 0 || deep) && !info.grave && !quietAfter ? CATCH.find((c) => !asked.has(c) && info.sentences.some((t) => fits(c, t))) : null;
      // COSMOS: UNIT-8 asks when Dr Reyes read the story (never after the lead, which has his restatement)
      const unitSlot = idOf('B') === 'unit8' ? 'B' : idOf('A') === 'unit8' ? 'A' : null;
      const askFor = pid === 'cosmos' && unitSlot && k > 0 && deep && !quietAfter && anchor !== unitSlot ? ASK.find((c) => !asked.has(c) && info.sentences.some((t) => fits(c, t))) : null;
      let reserved = catchFor ? info.sentences.find((t) => fits(catchFor, t)) : askFor ? info.sentences.find((t) => fits(askFor, t)) : null;
      if (!reserved && pid === 'world-now' && deep && !quietAfter) reserved = [...info.sentences].reverse().find((t, j) => j < info.sentences.length - 1 && !PRONOUN_START.test(t) && answerable(t, info) && wordCount(t) >= 6) || null;
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
      const skipHeadline = first && (leadAfterIntro || restates(first, s.title) || (selfStanding(info, first) && wordCount(first) >= 6));
      let opener = spokenTitle(s.title, info);
      // the summary's first sentence cannot open ("It is hoped the prospective sale..."): a later one that tells the
      // news and stands on its own opens instead of the headline ("Conservationists have said they are planning to
      // buy a field to extend a "green lung"...", BBC 5 Oct); the one that leans follows it
      // (and when the first sentence says a detail and a later one the news: "The Shropshire Astronomical Society plans to
      // install the dome at Rodington village hall" before "A group of amateur astronomers have been given permission to
      // set up a mini-observatory", BBC 5 Oct)
      let chosen = false;
      const titleShare = (t) => contentWords(t).filter((w) => contentWords(s.title).some((x) => x.slice(0, 5) === w.slice(0, 5))).length;
      const detailFirst = !isNumber && !isLighter && first && titleShare(first) <= 1 && info.sentences.slice(1, 3).some((t) => titleShare(t) >= 3 && selfStanding(info, t));
      if ((!skipHeadline && first && !selfStanding(info, first)) || detailFirst) {
        // the sentence that tells most of the headline's news (its names first), never a bracketed aside ("Each flight
        // director chose a team name (at first colors)" once opened an obituary)
        const names = info.keep || [];
        const score = (t) => titleShare(t) + names.filter((n) => t.includes(n)).length;
        // (a lede that ends on who said it reads whole: "..., experts have said.")
        const fitsOpener = (t) => wordCount(t) <= maxWords + 2 || (!quick && wordCount(t) <= maxWords + 5 && /,\s+(?:[\w’'-]+\s+){0,3}(?:said|says|say|have said|has said|warned|added)\.?$/.test(t)) || !!dropAside(t, maxWords + 1) || !!trimClause(t, maxWords + 1, 8, { keep: info.keep });
        const tellsNews = (t) => selfStanding(info, t) && !echoes(t) && !asks(t) && !DEFINES.test(t) && !/\(/.test(t) && wordCount(t) >= 8 && fitsOpener(t) && titleShare(t) >= 2;
        const best = !isNumber && !isLighter ? info.sentences.filter((t) => !used.has(t) && tellsNews(t)).sort((a, b) => score(b) - score(a) || info.sentences.indexOf(a) - info.sentences.indexOf(b))[0] : null;
        // (the sentence that tells the news, a little long, before a background one that fits: "The Trump administration is
        // suspending Microsoft, Adobe, and several other technology companies from a program..." over "H-1B visas are
        // designed for highly skilled positions...", TechCrunch 9 Oct)
        // (never in NEWS IN 60, whose sentences keep to its word budget)
        const strongest = !isNumber && !isLighter && !quick ? info.sentences.filter((t) => !used.has(t) && selfStanding(info, t) && !echoes(t) && !asks(t) && !DEFINES.test(t) && !/\(/.test(t) && wordCount(t) >= 8 && titleShare(t) >= 2).sort((a, b) => score(b) - score(a) || info.sentences.indexOf(a) - info.sentences.indexOf(b))[0] : null;
        const long = strongest && strongest !== best && score(strongest) >= (best ? score(best) + 2 : 3) ? (wordCount(strongest) <= maxWords + 6 ? strongest : trimClause(strongest, maxWords + 6, 8, { keep: info.keep })) : null;
        const alt = long ? pickSentence((t) => t === strongest) && long : best ? pickSentence((t) => t === best) : null;
        if (alt) opener = alt;
        chosen = !!alt;
      }
      if (skipHeadline && !chosen) {
        // Never a pronoun as the first word of a story: the opener must say who or what.
        opener = (leadAfterIntro && (pickSentence((t) => !echoes(t) && selfStanding(info, t)))) || null;
        // (the lead only: any other story opens on its first standing sentence below, and keeps its exchange; this
        // once freed the kept-back sentence of every story that could open on its summary, so THE CATCH, UNIT-8 ASKS
        // and WORLD NOW's added detail aired only where a headline opened)
        if (leadAfterIntro && !opener && reserved) {
          // Nothing else to open with: the catch's sentence opens the story, and there is no catch.
          used.delete(reserved);
          reserved = null;
          opener = pickSentence((t) => !echoes(t));
        }
        opener ||= pickSentence((t) => selfStanding(info, t)) || pickSentence(() => true) || spokenTitle(s.title, info);
      }
      const cue = isNumber ? '[count] ' : info.grave ? '[lean_in] ' : s.image ? '[point_screen] ' : choose(['[raise_hand] ', '[lean_in] ', ''], key);
      let figureLine = null;
      if (isNumber) {
        const f = bestFigure(info);
        // "Our number of the day: 40,000." Then the story in the summary's order, so "It"/"Its" keep their
        // subject, with the sentence that gives the figure straight after the opener; the headline is not read.
        const raw = numbersIn(f.said)[0]?.raw || f.value;
        if (!skipHeadline && info.sentences.length) opener = pickSentence(() => true);
        if (!opener.includes(raw)) figureLine = pickSentence((t) => t.includes(raw));
        parts.push(`${cue}Our number of the day: ${spokenValue(f)}.`);
      }
      const body = [];
      if (opener && wordCount(opener) > maxWords + 1) opener = dropAside(opener, maxWords + 1) || trimClause(opener, maxWords + 1, 8, { keep: info.keep }) || (quick ? null : wordCount(opener) <= maxWords + 6 ? opener : trimClause(opener, maxWords + 6, 8, { keep: info.keep })) || opener;
      let line = asSentence(isNumber || isLighter ? opener : placeFirst(opener, info));
      line = withArticle(nameWhole(line, parts.join(' ').replace(/\[[^\]]*\]/g, ' '), info));
      line = introduceNames(line, parts.join(' ').replace(/\[[^\]]*\]/g, ' '), info) || line;
      if (info.breaking && k === 0) line = `Breaking news. ${line}`;
      else if (info.live) line = `A developing story: ${line}`;
      if (isLighter) line = `And finally: ${lowerFirstWord(line, info)}`;
      body.push(`${isNumber || isLighter ? '' : cue}${line}`);
      if (figureLine) body.push(figureLine);
      // Details. Enough sentences for the story's pictures: the director gives each sentence one shot
      // (presenter, then map, then picture, then fact card), so a story with a place AND a picture needs
      // three sentences for both to reach the screen. NEWS IN 60 keeps to its word budget; the TECH BYTES
      // lead keeps one sentence back for THE CATCH.
      const visuals = (info.loc ? 1 : 0) + (s.image ? 1 : 0) + (info.figures.length ? 1 : 0);
      // the story dossier (owner: programmes up to 10 minutes, with depth, never padding): in a long programme a
      // story whose article was read (more sentences than a feed summary gives) tells more of it: the lead five
      // details, a main story four (MONEY MINUTE three)
      // (grave news too: real bulletins give their biggest, gravest story the most time; its tone stays sober)
      const deepRead = longForm && info.sentences.length >= 5;
      const cap = pid === 'money-minute' ? (deepRead ? 3 : 2) : deepRead ? (k === 0 ? 5 : 4) : 3;
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
      const toldSoFar = () => [...parts, ...body].map((x) => x.replace(/\[[^\]]*\]/g, ' '));
      for (const t0 of detailOrder) {
        if (details >= maxDetails || used.has(t0) || echoes(t0)) continue;
        // (a quotation alone, with nobody saying it: "“It is absolutely unforgivable.”")
        if (/^["“‘']/.test(t0.trim()) && !/\b(?:said|says|told|added|according to|warned|wrote)\b/i.test(t0)) continue;
        // (a sentence that tells again what an aired one said: most of its words, little new)
        if (toldSoFar().some((x) => (restates(t0, x) && newWords(t0, x) < 4) || sameSense(t0, x))) continue;
        if (/^(?:It|They|This|These)\b/.test(t0) && WHY.test(t0)) continue; // "It says..." with no subject reads as a label
        // (a feature's rhetorical question, and the sentence that answers it: "What’s the best way to manage a
        // forest? Australians have argued about this for decades." ScienceDaily, 4 Oct)
        const at = info.sentences.indexOf(t0);
        if (asks(t0) || (at > 0 && asks(info.sentences[at - 1]))) continue;
        if (FOLLOWS_ON.test(t0) && !used.has(info.prevOf.get(t0))) continue;
        // (spoken words have no brackets: "Each flight director chose a team name (at first colors)")
        if (/\([^)]*\s[^)]*\)/.test(t0)) continue;
        if (toldBefore(t0, body)) continue;
        if (TIME_BACK.test(t0) && !used.has(info.prevOf.get(t0))) continue;
        if (!used.has(info.prevOf.get(t0)) && unheardPronoun(t0, toldSoFar().join(' '))) continue;
        // over the programme's sentence length: a role the story has said goes ("Justin Scully, manager of..., said"),
        // else told as two whole sentences when it joins two clauses, else a trailing clause goes, else it is left out
        const t0b = dropToldAside(t0, toldSoFar());
        const t1 = wordCount(t0b) > maxWords ? dropKnownRole(t0b, toldSoFar()) : t0b;
        const two = wordCount(t1) > maxWords && !quick ? splitClauses(t1, maxWords) : null;
        const t = two ? two.join(' ') : wordCount(t1) <= maxWords ? t1 : trimClause(t1, maxWords, 8, { keep: info.keep });
        if (!t) continue;
        if (wordCount([...parts, ...body].join(' ')) + wordCount(t) > budget) continue;
        if (body.some((b) => openingOf(b) === openingOf(t))) continue;
        const named = (two || [t]).map((x) => introduceNames(nameWhole(x, toldSoFar().join(' '), info), toldSoFar().join(' '), info));
        if (named.some((x) => x === null)) continue;
        body.push(...named);
        used.add(t0);
        details += two ? 2 : 1;
      }
      const quoteFits = !linked && info.quote?.by && !quick && ![...used].some((l) => l.includes(info.quote.text.slice(0, 20)));
      if (quoteFits && [...parts, ...body].join(' ').length + info.quote.text.length < 420) body.push(`As ${lowerArticle(info.quote.by)} put it: “${unstop(info.quote.text)}.”`);
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
      if (linked) {
        // the correspondent's lines: the story's remaining sentences in order, the first standing on its own (it
        // follows the hand-over, so never "It says..."), each within the programme's sentence length
        const rest = info.sentences
          .filter((t) => !used.has(t) && !echoes(t))
          .map((t) => (wordCount(t) <= maxWords ? t : trimClause(t, maxWords, 8, { keep: info.keep })))
          .filter(Boolean);
        // what comes next goes last (the answer to "what happens next?"), the rest in the story's order
        rest.sort((a, b) => Number(AHEAD.test(a)) - Number(AHEAD.test(b)));
        const lead = rest.findIndex((t) => !PRONOUN_START.test(t));
        if (lead > 0) rest.unshift(...rest.splice(lead, 1));
        const nPiece = Math.min(3, rest.length - 1);
        if (nPiece >= 2 && lead >= 0) info.cross = { piece: rest.slice(0, nPiece).map(asSentence).join(' '), ask: null, answer: rest.slice(nPiece, nPiece + (rest.length >= 6 ? 2 : 1)).map(asSentence).join(' ') };
        else if (rest.length === 2 && lead >= 0) info.cross = { piece: rest.map(asSentence).join(' '), ask: null, answer: '' };
      }
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
    const chatOk = !solo && !info.grave && !(next && next.grave) && chats < maxChats && !(inRoundup && next && roundup.includes(next)) && !info.cross;
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
            planned.push({ anchor: partner, text: `${pickLine(WORLD_ADD, `${key}~add`, info)} ${lowerFirstWord(info.addLine, info)}` });
          } else if (pid === 'tech-bytes' && (slot === 'lead' || slot === 'story') && info.catchAnswer) {
            const askB = idOf('B') === 'ada' || idOf('A') !== 'ada' ? 'B' : 'A';
            planned.push({ anchor: askB, text: pickLine(info.catchAnswer.q(nameOf(other(askB))), `${key}~catch`, info) }, { anchor: other(askB), text: `[lean_in] ${info.catchAnswer.line}` });
          } else if (pid === 'tech-bytes' && slot === 'lighter') {
            const sp = partner;
            const kind = PRODUCT_KICKERS.has(info.kicker) ? 'product' : SOFTWARE_KICKERS.has(info.kicker) ? 'software' : 'science';
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
            ].filter(Boolean);
            const restated = options.find((o) => !airedBefore(`${o}.`, aired)) || null;
            const shapes = UNIT8_RESTATE.filter((x) => !unitShapes.has(x));
            const shape = shapes.length ? pickLine(shapes, `${key}~u8n`, info) : UNIT8_RESTATE[0];
            unitShapes.add(shape);
            unitRestates++;
            planned.push({ anchor: unit, text: restated ? `[nod] ${restated}. ${shape}` : pickLine(UNIT8_NOTED, `${key}~u8`, info) });
            planned.push({ anchor: other(unit), text: next === number ? pickLine(NOVA_TO_NUMBER, `${key}~nn`, info) : pickLine(NOVA_THANKS, `${key}~nt`, info) });
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
    const signOk = chats < maxChats && !inRoundup && !info.cross;
    const signpost = info.signpost && signOk && policy?.after?.includes(slot) && maxChats - chats > 0 ? { anchor, text: info.grave || (next && next.grave) ? info.signpost : `[nod] ${info.signpost}` } : null;
    const chatsHere = [...planned.slice(0, maxChats - chats - (signpost ? 1 : 0)), ...(signpost ? [signpost] : [])];

    // ---- hand-over: a toss to the partner who reads next, sometimes (never next to grave news).
    const nextAnchor = anchors[k + 1];
    const tossOk = !solo && !pickup && next && nextAnchor !== anchor && !chatsHere.length && !info.grave && !next.grave && pid !== 'tech-bytes' && !(inRoundup && roundup.includes(next)) && !info.cross;
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
      headline: shortHeadline(s.title, program?.headlineMax),
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
    // (news, not features: the lead, a grave or breaking story, or a hard-news topic; never history, culture,
    // wildlife or a light one; on TECH BYTES every story is "light" by topic, so a security flaw or a court ruling
    // there gets its board too)
    if (program?.boards?.includes('known') && !inRoundup && !isNumber && !isLighter && !quick && (k === 0 || info.grave || info.breaking || (HARD_NEWS.has(info.kicker) && !info.curious && (!info.light || pid === 'tech-bytes')))) {
      const known = knownPoints(info.sentences);
      if (known.length >= 2) story.known = known;
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


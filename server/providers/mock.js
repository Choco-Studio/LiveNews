// Offline provider: builds an episode straight from the feed text, with no AI.
// Lets the whole channel run (and be demoed) without any account or API key.
// It only ever re-uses the feed's own words: headlines, summary sentences,
// figures and quotations as written. Variety comes from how they are framed
// (openers, attribution, hand-overs, recurring features), and the structure
// of each programme follows its style bible (docs/programmes/*.md) through
// the programme's config: intro shape, where the number of the day and the
// chats go, who reads the round-up. Everything is chosen deterministically
// from the story ids, so the same news always makes the same episode.

import { isBreaking, plainTitle } from '../news.js';
import { LIGHT, contentWords, extractFigures, harmlessIncident, isGrave, leansOnPrevious, numbersIn, quotesIn, severity } from '../facts.js';
import { locate, lookupPlace, placesIn } from '../gazetteer.js';
import { SENTENCE_WORDS, shortHeadline, trimClause } from '../writer.js';
import { topicOf } from '../topics.js';

const DEATHS = /\b(?:dead|deaths?|die[sd]|killed|killings?|victims?|mourn\w*|funeral)\b/i;
// Not grave, but not something to smile about either.
const SOBER = /\b(?:volcan\w*|erupt\w*|storms?|strikes?|protests?|elections?|courts?|police|cancel\w*|closures?|bans?|shortages?|prices|inflation|recession|stocks?|shares|markets?|rates?|alerts?|jobs? at risk|job (?:cuts|losses)|lay-?offs?|redundanc\w*|rulings?|under pressure|flu|waiting lists?)\b/i;
// The best "and finally" material: curiosities, animals, culture, the sky.
const LIGHTER = /\b(?:zoo|pandas?|leopards?|tortoises?|penguins?|whales?|dolphins?|bees|parrots?|birds?|festival|museum|tomatoes|chocolate|coffee|trees|gardens?|reef|coral|footprints|dinosaurs?|fossils?|comet|eclipse|drones|telescope|stars|moon|music|art|mushroom)\b/i;
const CURIOUS = /\b(?:discover\w*|uncover\w*|rare|unexpected|surpris\w*|new species|first time|glowing)\b/i;
// A summary sentence that says what follows from the news (a purpose or a consequence).
const WHY =
  /\b(?:aims? to|so that|to help|in order to|which means|means that|(?:will|would|could|can|should) (?:help|cut|save|reduce|let|allow|make|carry|light|power|create|protect|improve|speed|bring|give|lower|ease|keep|feed|connect|double|halve)|to (?:cut|reduce|protect|improve|cool|save|ease|lower))\b/i;
// The sentence already says who says it: no "X reports" on top.
const OWN_ATTRIBUTION = /\b(?:says?|said|according to|reports?|reported|announced|told|officials|estimates?)\b/i;
// Live pages: lines that point at the outlet's own coverage are not news.
const LIVE_BOILERPLATE = /^(?:follow|read|watch|see) (?:the |our |all the )?(?:latest|live|updates)|\blive updates?\b|\bas it happened\b/i;

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
    ['[nod] I approve. From a shaded bench, ideally.', 'Noted. We will find you one.'],
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

// WORLD NOW (long programmes): the partner adds one detail the story kept back, soberly (no question marks).
const WORLD_ADD = ['[nod] And one detail worth adding:', '[nod] Worth adding:', '[look_partner] And the context here:', '[nod] One more line from the report:', '[nod] And this matters too:'];

/** PACE: the story the mid-programme "Still to come" rides on: a main story near the middle of the running order. */
function midStory(order, roundup, lighter, number) {
  // the signpost airs as the reader's own short line after the story (a chat segment: the validator keeps
  // chats, which may name any story of the episode, only away from grave news)
  const ok = (i) => order[i] && !roundup.includes(order[i]) && order[i] !== lighter && order[i] !== number && !order[i].live && !order[i].grave && !order[i + 1]?.grave;
  const mid = Math.floor(order.length / 2) - 1;
  for (let d = 0; d < order.length; d++) for (const i of [mid - d, mid + d]) if (i >= 1 && i < order.length - 2 && ok(i)) return i;
  return -1;
}

// TECH BYTES, THE CATCH: Ada asks what a remaining summary sentence answers; Max answers with it.
const CATCH = [
  { test: /\b(?:cost|price|priced|dollars|euros|pounds|\$|£|€)/i, q: (max) => `[glasses] ${max}, the question everyone asks. What does it cost?` },
  { test: /\b(?:next year|this year|later this year|next month|in the (?:spring|summer|autumn|winter)|on sale|go on sale|launch(?:es)? (?:in|next)|from next|by \d{4})\b/i, q: () => '[chin] And when does it reach actual people?' },
  { test: /\b(?:but|however|only|not yet|still|although)\b/i, q: () => '[steeple] So what is the catch?' },
  { test: /\b(?:using|uses|by (?:using|\w+ing)|works (?:by|without)|without an?)\b/i, q: () => '[chin] How does it actually work?' },
];
// The button after "And finally", by what kind of story it was: a product, or science.
const PRODUCT_KICKERS = new Set(['GADGETS', 'ROBOTICS', 'CHIPS', 'GAMING', 'SOFTWARE', 'AI', 'CONNECTIVITY', 'MOTORING']);
const TECH_BUTTONS = {
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
    '[nod] Noted. I have adjusted my sense of scale.',
    'I have recalculated how small we are, Dr Reyes. The result is consistent.',
    '[nod] Logged. I find the distances reassuring.',
  ],
  any: [
    '[nod] Logged under good news, Dr Reyes. The file is short. I am glad to add to it.',
    'I have no further data, Dr Reyes. I find I do not mind.',
    '[nod] Noted. My circuits remain calm. This is how I express enthusiasm.',
    '[nod] Filed. Cross-referenced. Quietly appreciated.',
    '[nod] A satisfying result. I have saved it twice.',
    'I have flagged that one as hopeful, Dr Reyes. It is a new category.',
  ],
};
UNIT8_LINES.SPACE = UNIT8_LINES.ASTRONOMY;
// UNIT-8 after the lead, when the lead has no figure to repeat.
const UNIT8_NOTED = ['[nod] Logged, Dr Reyes.', '[nod] Noted. Filed under remarkable.', '[nod] Recorded. I will be thinking about that one.', '[nod] Understood, Dr Reyes. Logged.'];
const NOVA_THANKS = ['Thank you, UNIT-8.', 'Precise as ever, UNIT-8.', 'Noted, UNIT-8. Thank you.', 'Thank you. Exactly right, UNIT-8.', '[nod] Quite so, UNIT-8.'];
// The tail of UNIT-8's restatement ("40,000. Logged."): one shape per episode, rotated across episodes.
const UNIT8_RESTATE = ['Logged.', 'Stored, Dr Reyes.', 'I have checked it twice.', 'That is now on file.', 'Confirmed.', 'Recorded, with interest.', 'Noted. I will not forget it.'];
// Nova hands the number of the day to UNIT-8 (it is his story), not in the same words every time.
const NOVA_TO_NUMBER = [
  '[look_partner] Thank you, UNIT-8. Our number of the day is yours.',
  '[look_partner] UNIT-8, our number of the day.',
  '[look_partner] And UNIT-8 has our number of the day.',
  '[look_partner] Over to UNIT-8 for our number of the day.',
];

// Programmes without a chat policy: a short dry reaction after a light story.
const CHATS = {
  paco: ['[nod] Well. Not a sentence I expected to read tonight.', '[nod] File that under good news. We do have some.', '[nod] I shall allow it.'],
  lola: ['[chin] Not what I expected when I came in this morning.', '[nod] Some good news, for once.', '[nod] I will take that.'],
  max: ['[nod] Clever. Quietly, properly clever.', '[look_partner] I did not see that one coming.', '[nod] Engineers, doing engineer things.'],
  ada: ['[nod] Fair enough. That one I like.', '[chin] Noted. I will want to see how that plays out.', '[shrug] Cautiously impressed.'],
  nova: ['[chin] Every answer comes with a new question attached. That is the job.', '[steeple] Science at its best: patient, careful and slightly stubborn.', '[nod] Lovely work.'],
  unit8: UNIT8_LINES.any,
  penny: ['[nod] Worth keeping an eye on.', '[nod] One to watch.'],
  sam: ['[nod] Quick one, but worth knowing.', '[nod] Noted.'],
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
 * meet, in an order seeded by `key`, skipping lines aired recently (`recent`:
 * plain texts of the last lines on air). Every line recent: the seeded one.
 */
function chooseFresh(list, key, { recent = null, text = '' } = {}) {
  const fits = list.filter((l) => typeof l === 'string' || !l.needs || l.needs.test(text));
  const pool = fits.length ? fits : list.filter((l) => typeof l === 'string');
  if (!pool.length) return null;
  const start = hash(key) % pool.length;
  for (let k = 0; k < pool.length; k++) {
    const line = pool[(start + k) % pool.length];
    if (!recent || !lineSentences(line).some((x) => recent.has(x))) return lineText(line);
  }
  return lineText(pool[start]);
}

const sentencesOf = (s) =>
  String(s || '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'])/)
    .map((x) => x.trim())
    .filter(Boolean);
const unstop = (t) => String(t).trim().replace(/[\s.!?:;,]+$/, '');
const asSentence = (t) => `${unstop(t)}.`;
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
  const story = `${String(info.s.title).replace(/[.!?]*$/, '.')} ${info.s.summary || ''}`;
  const lower = new RegExp(`(?<![\\p{L}])${word.toLowerCase()}(?![\\p{L}])`, 'u').test(story);
  // A name is written with its capital in the middle of a sentence somewhere in the story; a common word is not.
  const midSentence = new RegExp(`[\\p{Ll},;:]\\s+${word}(?![\\p{L}])`, 'u').test(story);
  return lower || COMMON_START.test(text) || !midSentence ? word.toLowerCase() + text.slice(word.length) : text;
}
const PRONOUN_START = /^(?:It|Its|They|Their|This|These|Those|He|She|His|Her)\b/;
/**
 * Can this summary sentence open a story or a round-up item? The summary's first sentence can (unless it
 * opens on a pronoun: "The central bank has kept rates..." is how the outlet itself starts); a later one
 * only when it does not lean on the sentence before it ("The canal authority says...").
 */
const selfStanding = (info, t) => (info.sentences.indexOf(t) === 0 ? !PRONOUN_START.test(t) : !leansOnPrevious(t));
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
  const figures = extractFigures(s.summary || '').filter((f) => f.fact.length <= 40 && f.score >= 2);
  const sentences = sentencesOf(s.summary).filter((x) => !LIVE_BOILERPLATE.test(x) && unstop(x).toLowerCase() !== unstop(title).toLowerCase());
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
    sad: grave && DEATHS.test(text),
    light,
    curious: light && (LIGHTER.test(title) || CURIOUS.test(title)),
    loc: precise,
    country: precise ? precise.entry.country || precise.entry.name : null,
    places: placesIn(text),
    figures,
    sentences,
    quote: quotesIn(s.summary || '').find((q) => q.text.split(/\s+/).length >= 4) || null,
    kicker: kickerFor(s),
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
function runningOrder(infos, n, program) {
  const features = program?.features || [];
  const primary = program?.categories?.length > 1 ? program.categories[0] : null;
  const pool = [...infos];
  const take = (pred) => {
    const i = pool.findIndex(pred);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const lead = take((i) => i.breaking) || takeLead(pool) || take(() => true);
  if (!lead) return { order: [], roundup: [], lighter: null, number: null };
  let slots = n - 1;
  let lighter = null;
  if (features.includes('lighter') && slots >= 1) {
    const ok = (i) => !i.breaking && !i.grave && !i.live;
    const own = (i) => !primary || i.s.category === primary;
    lighter = take((i) => ok(i) && own(i) && i.curious) || take((i) => ok(i) && own(i) && i.light) || take((i) => ok(i) && i.curious && !BEAT_OF_OTHERS.test(i.s.category)) || take((i) => ok(i) && i.light);
    if (lighter) slots--;
  }
  let number = null;
  if (features.includes('number')) {
    const ok = (i) => !i.grave && !i.breaking && !i.live && i.figures.some((f) => f.score >= 3 && !f.age);
    const best = (list) => list.filter(ok).sort((a, b) => bestFigure(b).score - bestFigure(a).score)[0] || null;
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
  while (mains.length < slots - want && pool.length) mains.push(bestMain(pool));
  let roundup = [];
  if (want) {
    const countries = new Set([lead.country]);
    // a round-up item is told in one summary sentence: a story with none that fits stays a main story
    const located = pool.filter((i) => i.loc && !i.breaking && !i.live && i.roundupFit !== false);
    // One map sentence is for the smaller stories: a picture, a second outlet or people at risk make a story a
    // main one (it gets its photo beat and its full telling); the round-up takes the rest first.
    const weight = (i) => (i.s.image && program?.pictures !== 'every' ? 2 : 0) + ((i.s.outlets || 1) > 1 ? 2 : 0) + (i.grave ? 1.5 : 0);
    for (const i of [...located].sort((a, b) => weight(a) - weight(b))) {
      if (roundup.length >= want) break;
      if (countries.has(i.country)) continue;
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
  while (mains.length + roundup.length < slots && pool.length) mains.push(bestMain(pool));
  // The main stories air in order of news value (people at risk before a museum wing), the desk's order breaking ties.
  const rank = new Map(infos.map((x, k) => [x, k]));
  mains.sort((a, b) => newsValue(a, rank.get(a)) - newsValue(b, rank.get(b)) || rank.get(a) - rank.get(b));
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
function takeLead(pool) {
  let best = -1;
  let bestValue = Infinity;
  for (let k = 0, seen = 0; k < pool.length && seen < 6; k++) {
    if (pool[k].live) continue;
    seen++;
    const v = newsValue(pool[k], k);
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
function bestMain(pool) {
  let best = 0;
  let bestScore = Infinity;
  for (let k = 0; k < Math.min(3, pool.length); k++) {
    const i = pool[k];
    const score = k - (i.s.image ? 1.2 : 0) - ((i.s.outlets || 1) > 1 ? 1 : 0) - (i.severity >= 3 ? 1.6 : i.grave ? 1.3 : 0) - (i.hard ? 0.5 : 0) + (i.mild ? 0.4 : 0) + (i.curious ? 0.5 : 0) + (i.live ? 9 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return pool.splice(best, 1)[0];
}

const bestFigure = (info) => info.figures.filter((f) => !f.age).sort((a, b) => b.score - a.score)[0] || info.figures[0];

// ---------------------------------------------------------------- the provider

export function createMockProvider() {
  return {
    name: 'mock',
    // It copies the feed text, so it has nothing to check: it never stands in for the editor.
    reviews: false,
    available: () => true,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count, now, recent }) {
      const usage = { input: 0, output: 0, cached: 0 };
      // Asked to review anyway (outside a ProviderChain): return the script untouched and say so.
      if (stage === 'review') return { text: JSON.stringify(script), usage, reviewed: false };
      return { text: JSON.stringify(writeEpisode({ stories, channelName, program, presenters, count, now: now ?? new Date(), recent })), usage };
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

function writeEpisode({ stories, channelName, program, presenters, count, now, recent }) {
  const title = program?.title || channelName;
  const solo = !presenters.B;
  const pid = program?.id || '';
  const quick = pid === 'news-60';
  const maxWords = program?.sentenceWords || SENTENCE_WORDS[pid] || 24;
  const placeWithin = PLACE_WITHIN[pid] ?? Infinity;
  const aired = new Set((recent || []).flatMap(lineSentences));
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
    // the running order is built from exactly those stories (the round-up must not reach past them)
    pool = pool.slice(0, Math.max(1, count ?? program?.stories ?? 5));
  }
  const n = Math.min(pool.length, count ?? program?.stories ?? 5);
  // Which stories have a summary sentence a round-up item can be (its length, standing on its own)
  const [rMin, rMax] = quick ? [14, 18] : [12, 20];
  for (const i of pool) {
    i.roundupFit = i.sentences.some((t, j) => {
      if (!(j === 0 ? !PRONOUN_START.test(t) : !leansOnPrevious(t))) return false;
      if (j > 0 && newWords(i.s.title, t) > contentWords(i.s.title).length - 2) return false;
      const x = wordCount(t) <= rMax ? t : trimClause(t, rMax, rMin - 4);
      return !!x && wordCount(x) >= rMin - 4;
    });
  }
  const { order, roundup, lighter, number } = runningOrder(pool, n, program);
  const seed = order.map((i) => i.s.id).join('|') + pid;
  const nameOf = (slot) => firstName(presenters[slot]);
  const idOf = (slot) => presenters[slot]?.id;
  const other = (slot) => (slot === 'A' ? 'B' : 'A');
  const pickLine = (list, key, info) => {
    const line = chooseFresh(list, key, { recent: aired, text: info ? `${info.s.title} ${info.s.summary || ''}` : '' });
    if (line) for (const x of lineSentences(line)) aired.add(x);
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
  const said = (info) => (wordCount(info.s.title) <= 12 ? unstop(info.s.title) : unstop(shortHeadline(info.s.title, program?.headlineMax, { spoken: true })));
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
    if (second) {
      introParts.push(`[point_camera] Also coming up: ${featureTease(second) || lowerFirstWord(said(second), second)}.`);
      tease.push(second.s.id);
    }
    if (third) {
      introParts.push(third === number ? 'And later, our number of the day.' : third === lighter ? `And later: ${asSentence(lowerFirstWord(said(third), third))}` : `Later in the programme: ${asSentence(lowerFirstWord(said(third), third))}`);
      tease.push(third.s.id);
    }
    const greet = solo ? `This is ${title}. [nod] I'm ${names}.` : `This is ${title}. [nod] I'm ${names}. [B:nod]`;
    introParts.push(greet);
  }
  segments.push({ type: 'intro', anchor: 'A', emotion: grave0 ? 'serious' : 'neutral', text: introParts.join(' '), teases: tease });
  const introSaidHeadline = shape !== 'frame';

  // ---- stories
  let chats = 0;
  const maxChats = solo ? 0 : program?.maxChats ?? 3;
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
    for (let j = 0; j < TAILS.length; j++) {
      const t = TAILS[(offset + segments.length + j) % TAILS.length];
      if (t.id === lastTail && TAILS.length > 1 && j === 0) continue;
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
    const used = new Set();
    const pickSentence = (pred) => {
      const x = info.sentences.find((t) => !used.has(t) && pred(t));
      if (x) used.add(x);
      return x || null;
    };

    if (inRoundup) {
      // One sentence per item (12 to 20 words; NEWS IN 60 14 to 18), the place in its first words, credited
      // only if the credit fits. The summary's words are preferred to the headline, which is already on the strap.
      const idx = roundup.indexOf(info);
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
      const sized = (t) => (wordCount(t) <= maxW ? t : trimClause(t, maxW, minW - 4));
      let line = null;
      let fromHeadline = false;
      for (const pass of [0, 1]) {
        for (const [j, t0] of info.sentences.entries()) {
          if (line || used.has(t0) || !selfStanding(info, t0) || !tells(t0, j)) continue;
          const t = sized(t0);
          if (!t) continue;
          // pass 0: the place within the first words, as written, moved to the front or put there;
          // pass 1: the sentence as written, its place named by the lead-in ("Now to Brazil.")
          const forms = pass === 0 ? [early(t) ? t : null, movePlaceFront(t, info), placeFirst(t, info, limit)] : [t];
          const form = forms.find((f) => f && (pass === 1 || early(f)) && wordCount(f) <= maxW && wordCount(f) >= minW - 4);
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
        line = early(s.title) ? s.title : movePlaceFront(s.title, info) || s.title;
      }
      const lead = idx === 0 ? program?.roundup?.opener || 'Now, around the world in 30 seconds.' : '';
      const where = early(line) || fromHeadline ? '' : `${idx === 0 ? 'First, ' : 'Now to '}${spokenPlace(info.loc.entry)}.`;
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
      const deep = longForm && !isNumber && !isLighter && !info.grave && !info.breaking && !info.live && exchanges < 3 && info.sentences.length >= 3; // the lead too with 3 (critic: no analysis exchange aired)
      const catchFor = pid === 'tech-bytes' && (k === 0 || deep) && !info.grave ? CATCH.find((c) => !asked.has(c) && info.sentences.some((t) => c.test.test(t))) : null;
      let reserved = catchFor ? info.sentences.find((t) => catchFor.test.test(t)) : null;
      if (!reserved && pid === 'world-now' && deep) reserved = [...info.sentences].reverse().find((t, j) => j < info.sentences.length - 1 && !PRONOUN_START.test(t) && !/[“”"]/.test(t) && wordCount(t) >= 6) || null;
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
      let opener = s.title;
      if (skipHeadline) {
        // Never a pronoun as the first word of a story: the opener must say who or what.
        opener = (leadAfterIntro && (pickSentence((t) => !echoes(t) && selfStanding(info, t)))) || null;
        if (!opener && reserved) {
          // Nothing else to open with: the catch's sentence opens the story, and there is no catch.
          used.delete(reserved);
          reserved = null;
          opener = pickSentence((t) => !echoes(t));
        }
        opener ||= pickSentence((t) => selfStanding(info, t)) || pickSentence(() => true) || s.title;
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
      if (opener && wordCount(opener) > maxWords + 1) opener = trimClause(opener, maxWords + 1, 8) || opener;
      let line = asSentence(isNumber || isLighter ? opener : placeFirst(opener, info));
      if (info.breaking) line = `Breaking news. ${line}`;
      else if (info.live) line = `A developing story: ${line}`;
      if (isLighter) line = `And finally: ${lowerFirstWord(line, info)}`;
      body.push(`${isNumber || isLighter ? '' : cue}${line}`);
      if (figureLine) body.push(figureLine);
      // Details. Enough sentences for the story's pictures: the director gives each sentence one shot
      // (presenter, then map, then picture, then fact card), so a story with a place AND a picture needs
      // three sentences for both to reach the screen. NEWS IN 60 keeps to its word budget; the TECH BYTES
      // lead keeps one sentence back for THE CATCH.
      const visuals = (info.loc ? 1 : 0) + (s.image ? 1 : 0) + (info.figures.length ? 1 : 0);
      const cap = pid === 'money-minute' ? 2 : 3;
      // NEWS IN 60 counts the credit ("..., Ledger Line reports.") inside its word budget.
      const budget = quick ? (k === 0 ? 41 : 31) - (wordCount(s.source) + 1) : Infinity;
      const maxDetails = quick ? 2 : isNumber ? (figureLine ? 0 : 1) : Math.min(cap, Math.max(k === 0 ? 2 : 1, visuals, longForm ? 2 : 0));
      let details = 0;
      // People at risk: the warning and the advice come before the colour ("a red alert... asked people to avoid
      // going out" before "some schools have moved lessons").
      const ADVICE = /\b(?:alerts?|warn\w*|advis\w*|asked (?:people|residents)|urged|told (?:people|residents)|stay indoors|avoid|evacuat\w*|shelters?)\b/i;
      const detailOrder = info.grave || info.hard ? [...info.sentences].sort((a, b) => Number(ADVICE.test(b)) - Number(ADVICE.test(a))) : info.sentences;
      for (const t0 of detailOrder) {
        if (details >= maxDetails || used.has(t0) || echoes(t0)) continue;
        if (/^(?:It|They|This|These)\b/.test(t0) && WHY.test(t0)) continue; // "It says..." with no subject reads as a label
        // over the programme's sentence length: a trailing clause goes, or the sentence is left out
        const t = wordCount(t0) <= maxWords ? t0 : trimClause(t0, maxWords, 8);
        if (!t) continue;
        if (wordCount([...parts, ...body].join(' ')) + wordCount(t) > budget) continue;
        body.push(t);
        used.add(t0);
        details++;
      }
      const quoteFits = info.quote?.by && !quick && ![...used].some((l) => l.includes(info.quote.text.slice(0, 20)));
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
        const later = order.slice(k + 1).filter((x) => !roundup.includes(x) && !x.grave && !/\d/.test(said(x)));
        const pickL = later.find((x) => x === lighter) || later[0];
        const tail = number && order.indexOf(number) > k && pickL !== number ? ', and our number of the day' : '';
        if (pickL) info.signpost = `Still to come: ${lowerFirstWord(pickL === number ? 'our number of the day' : said(pickL), pickL)}${tail}.`;
      }
      if (reserved && catchFor) {
        info.catchAnswer = { line: reserved, q: catchFor.q };
        asked.add(catchFor);
      } else if (reserved) info.addLine = reserved;
      if (reserved) exchanges++;
    }

    // ---- chats that follow this story
    const next = order[k + 1];
    const slot = k === 0 ? 'lead' : isLighter ? 'lighter' : 'story';
    const chatOk = !solo && !info.grave && !(next && next.grave) && chats < maxChats && !(inRoundup && next && roundup.includes(next));
    const planned = [];
    if (chatOk) {
      if (policy) {
        if (policy.after?.includes(slot)) {
          if (pid === 'world-now' && slot === 'lighter') {
            const pairs = WORLD_PAIRS[info.kicker] || WORLD_PAIRS.any;
            const keyed = pairs.map((p) => ({ text: p[0], pair: p }));
            const firstLine = pickLine(keyed, `${key}~pair`, info);
            const pair = pairs.find((p) => p[0] === firstLine) || pairs[0];
            for (const x of lineSentences(pair[1])) aired.add(x);
            planned.push({ anchor: 'A', text: pair[0] }, { anchor: 'B', text: pair[1] });
          } else if (pid === 'world-now' && slot !== 'lighter' && info.addLine) {
            // PACE: the analysis exchange of a long WORLD NOW: the partner adds the detail the story kept back
            planned.push({ anchor: partner, text: `${pickLine(WORLD_ADD, `${key}~add`, info)} ${lowerFirstWord(info.addLine, info)}` });
          } else if (pid === 'tech-bytes' && (slot === 'lead' || slot === 'story') && info.catchAnswer) {
            const askB = idOf('B') === 'ada' || idOf('A') !== 'ada' ? 'B' : 'A';
            planned.push({ anchor: askB, text: info.catchAnswer.q(nameOf(other(askB))) }, { anchor: other(askB), text: `[lean_in] ${info.catchAnswer.line}` });
          } else if (pid === 'tech-bytes' && slot === 'lighter') {
            const sp = partner;
            const kind = PRODUCT_KICKERS.has(info.kicker) ? 'product' : 'science';
            planned.push({ anchor: sp, text: pickLine(TECH_BUTTONS[kind][idOf(sp)] || GENERIC_CHATS, `${key}~btn`, info) });
          } else if (pid === 'cosmos' && anchor !== (idOf('B') === 'unit8' ? 'B' : partner) && (slot === 'lead' || (slot === 'story' && longForm && !isNumber && unitRestates < 2 && (info.figures.length || info.loc)))) {
            // UNIT-8's restatement: after the lead, and after one more story at most (a robot repeating every
            // figure is a tic, not a character); each time in a different shape.
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            const f = info.figures.find((x) => parts.join(' ').includes(numbersIn(x.said)[0]?.raw || x.value) && !x.age);
            // UNIT-8 repeats the exact figure, else the place: only what was just said.
            const restated = f ? f.said.replace(/^(?:about|around|nearly|almost|some|more than|over|up to|at least) /i, '').replace(/^\w/, (c) => c.toUpperCase()) : info.loc ? spokenPlace(info.loc.entry).replace(/^\w/, (ch) => ch.toUpperCase()) : null;
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
    const signpost = info.signpost && chatOk && policy?.after?.includes(slot) && maxChats - chats > 0 ? { anchor, text: `[nod] ${info.signpost}` } : null;
    const chatsHere = [...planned.slice(0, maxChats - chats - (signpost ? 1 : 0)), ...(signpost ? [signpost] : [])];

    // ---- hand-over: a toss to the partner who reads next, sometimes (never next to grave news).
    const nextAnchor = anchors[k + 1];
    const tossOk = !solo && !pickup && next && nextAnchor !== anchor && !chatsHere.length && !info.grave && !next.grave && pid !== 'tech-bytes' && !(inRoundup && roundup.includes(next));
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
      emotion: info.sad ? 'sad' : info.grave ? 'serious' : isLighter ? (info.curious && CURIOUS.test(s.title) ? 'surprised' : 'happy') : info.light ? 'happy' : 'neutral',
      headline: shortHeadline(s.title, program?.headlineMax),
      text: parts.join(' '),
      // A place opens on the map, and the picture follows it; a picture alone is shown full screen.
      shot: info.loc ? 'map' : s.image ? 'full' : solo ? 'close' : 'wide',
      breaking: info.breaking,
      location: info.loc ? { place: info.loc.place, lat: info.loc.lat, lon: info.loc.lon } : null,
      fact: inRoundup ? null : info.figures[0]?.fact || null,
      kicker: info.kicker,
    };
    if (isNumber) story.fact = bestFigure(info).fact;
    if (!inRoundup && info.figures.length) story.numbers = info.figures.map(({ value, label, qualifier }) => ({ value, label, ...(qualifier ? { qualifier } : {}) }));
    if (!inRoundup && info.quote) story.quote = { text: info.quote.text, by: info.quote.by };
    if (!inRoundup && info.places.length >= 2) story.map = info.places.map(({ place, lat, lon }) => ({ place, lat, lon }));
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


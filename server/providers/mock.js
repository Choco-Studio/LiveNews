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
import { GRAVE, LIGHT, contentWords, extractFigures, numbersIn, quotesIn } from '../facts.js';
import { locate, placesIn } from '../gazetteer.js';
import { shortHeadline } from '../writer.js';

const DEATHS = /\b(?:dead|deaths?|die[sd]|killed|killings?|victims?|mourn\w*|funeral)\b/i;
// Not grave, but not something to smile about either.
const SOBER = /\b(?:volcan\w*|erupt\w*|storms?|strikes?|protests?|elections?|courts?|police|cancel\w*|closures?|bans?|shortages?|prices|inflation|recession|stocks?|shares|markets?|rates?)\b/i;
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

// Most specific first, matched on the headline before the summary.
const KICKERS = [
  [/volcan|eruption|lava/i, 'VOLCANO'],
  [/earthquake|quake|tremor/i, 'EARTHQUAKE'],
  [/flood|monsoon|heavy rain|storm|hurricane|typhoon|cyclone|strong winds|heatwave/i, 'WEATHER'],
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
  [/\btrade\b|exports?|imports?|tariffs?|shipping|port\b|canal/i, 'TRADE'],
  [/\bjobs\b|unemployment|wages|workers/i, 'JOBS'],
  [/robot/i, 'ROBOTICS'],
  [/\bAI\b|artificial intelligence|chatbot/i, 'AI'],
  [/\bchips?\b|semiconductor|processor/i, 'CHIPS'],
  [/smartphone|\bphones?\b|gadget|headset|wearable|earbuds|glasses/i, 'GADGETS'],
  [/\bapps?\b|software|update|browser/i, 'SOFTWARE'],
  [/video games?|gaming|console/i, 'GAMING'],
  [/satellite/i, 'SPACE'],
  [/solar (?:farm|panels?|plant|power|park)|wind farm|turbines?|tidal power|power grid|energy|electricity|batter(?:y|ies)|geothermal/i, 'ENERGY'],
  [/vaccine|hospital|health|medicine|disease|patients/i, 'HEALTH'],
  [/ocean|whales?|reef|coral|dolphins?|sea turtles?/i, 'OCEANS'],
];

// ---------------------------------------------------------------- the presenters' own lines (no facts, no figures)

// WORLD NOW, after "And finally" only: Paco's dry line, then Lola's deflation.
const WORLD_PAIRS = {
  HISTORY: [['[nod] Older than this building, I suspect.', 'Older than your jokes, Paco. Just.']],
  ASTRONOMY: [['I may look up tonight.', '[shrug] Take a coat.']],
  SPACE: [['I may look up tonight.', '[shrug] Take a coat.']],
  WILDLIFE: [['[nod] Finally, some news nobody will complain about.', 'Give it an hour.']],
  any: [
    ['[nod] A good note to end on.', 'Rare enough that we should enjoy it.'],
    ['Well. That is the most cheerful thing I have read all day.', '[shrug] It is a low bar, Paco. But yes.'],
    ['I have nothing to add. A first.', 'Let the record show it.'],
    ['[nod] Some stories do not need us at all.', 'Do not tell the management.'],
  ],
};

// TECH BYTES, THE CATCH: Ada asks what a remaining summary sentence answers; Max answers with it.
const CATCH = [
  { test: /\b(?:cost|price|priced|dollars|euros|pounds|\$|£|€)/i, q: (max) => `[glasses] ${max}, the question everyone asks. What does it cost?` },
  { test: /\b(?:next year|this year|later this year|next month|in the (?:spring|summer|autumn|winter)|on sale|go on sale|launch(?:es)? (?:in|next)|from next|by \d{4})\b/i, q: () => '[chin] And when does it reach actual people?' },
  { test: /\b(?:but|however|only|not yet|still|although)\b/i, q: () => '[steeple] So what is the catch?' },
  { test: /\b(?:using|uses|by (?:using|\w+ing)|works (?:by|without)|without an?)\b/i, q: () => '[chin] How does it actually work?' },
];
// The button after "And finally", by what kind of story it was: a product, or science.
const PRODUCT_KICKERS = new Set(['GADGETS', 'ROBOTICS', 'CHIPS', 'GAMING', 'SOFTWARE', 'AI', 'CONNECTIVITY']);
const TECH_BUTTONS = {
  product: {
    ada: ['[shrug] We will see how it holds up outside the press release.', '[chin] Promising. I will believe it when it survives its first software update.'],
    max: ['[raise_hand] For the record, I would like one. Purely for research.', '[nod] Clever. Quietly, properly clever.'],
  },
  science: {
    ada: ['[nod] No launch event, no price tag. I approve.', '[nod] Fair enough. That one I like.'],
    max: ['[nod] I have questions. Most of them start with how.', '[look_partner] Somewhere, a researcher is very pleased with themselves. Rightly.'],
  },
};

// COSMOS: UNIT-8's literal line after "And finally".
const UNIT8_LINES = {
  ASTRONOMY: ['I will keep one sensor pointed upwards, Dr Reyes. For the record.'],
  SPACE: ['I will keep one sensor pointed upwards, Dr Reyes. For the record.'],
  any: ['[nod] Logged under good news, Dr Reyes. The file is short. I am glad to add to it.', 'I have no further data, Dr Reyes. I find I do not mind.', '[nod] Noted. My circuits remain calm. This is how I express enthusiasm.'],
};

// Programmes without a chat policy: a short dry reaction after a light story.
const CHATS = {
  paco: ['[nod] Well. Not a sentence I expected to read tonight.', '[nod] File that under good news. We do have some.'],
  lola: ['[chin] Not what I expected when I came in this morning.', '[nod] Some good news, for once.'],
  max: ['[nod] Clever. Quietly, properly clever.', '[look_partner] I did not see that one coming.'],
  ada: ['[nod] Fair enough. That one I like.', '[chin] Noted. I will want to see how that plays out.'],
  nova: ['[chin] Every answer comes with a new question attached. That is the job.', '[steeple] Science at its best: patient, careful and slightly stubborn.'],
  unit8: UNIT8_LINES.any,
  penny: ['[nod] Worth keeping an eye on.'],
  sam: ['[nod] Quick one, but worth knowing.'],
};
const GENERIC_CHATS = ['[nod] Remarkable. Moving on.', '[chin] Something to think about.', '[nod] Well, there we are.'];

// ---------------------------------------------------------------- helpers

// FNV-1a: stable variety from story ids.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const choose = (list, key) => list[hash(key) % list.length];

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
const COMMON_START = /^(?:A|An|The|This|These|Those|Its|Their|Some|More|Most|Many|Several|Scientists|Researchers|Officials|Astronomers|Archaeologists|Rangers|Volunteers|Engineers|Doctors|Experts|Shops|Traders|Policymakers|Curators|Investors|Workers|Students|Residents|Visitors|Users|Strong|Heavy|Rail|Oil|Coffee|Rice|Prices|Sales|Shares|Stocks)\b/;
const lcFirst = (s) => (COMMON_START.test(s) ? s[0].toLowerCase() + s.slice(1) : null);
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

function kickerFor(s) {
  for (const [re, k] of KICKERS) if (re.test(s.title)) return k;
  for (const [re, k] of KICKERS) if (re.test(s.summary || '')) return k;
  return null;
}

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
  const grave = GRAVE.test(text);
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
 * The running order, by the programme's rules: a breaking story leads; then
 * the main stories (the number of the day among them, never first), a round-up
 * of located stories in different countries, and an "and finally" last.
 */
function runningOrder(infos, n, program) {
  const features = program?.features || [];
  const pool = [...infos];
  const take = (pred) => {
    const i = pool.findIndex(pred);
    return i < 0 ? null : pool.splice(i, 1)[0];
  };
  const lead = take((i) => i.breaking) || take((i) => !i.live) || take(() => true);
  if (!lead) return { order: [], roundup: [], lighter: null, number: null };
  let slots = n - 1;
  let lighter = null;
  if (features.includes('lighter') && slots >= 1) {
    lighter = take((i) => i.curious && !i.breaking) || take((i) => i.light && !i.breaking);
    if (lighter) slots--;
  }
  // The number of the day first (it is one of the main stories), then the round-up from what is left.
  let number = null;
  if (features.includes('number')) {
    const ok = (i) => !i.grave && !i.breaking && !i.live && i.figures.some((f) => f.score >= 3 && !f.age);
    const best = (list) => list.filter(ok).sort((a, b) => bestFigure(b).score - bestFigure(a).score)[0] || null;
    // From the programme's own beat when it has one (COSMOS: a science figure before a gadget's sales).
    const primary = program?.categories?.length > 1 ? program.categories[0] : null;
    const near = pool.slice(0, slots + 3);
    number = (primary && best(near.filter((i) => i.s.category === primary))) || best(near);
    if (number) {
      pool.splice(pool.indexOf(number), 1);
      slots--;
    }
  }
  let roundup = [];
  const r = program?.roundup || {};
  if (features.includes('roundup') && slots >= 2) {
    const min = r.min || 2;
    // Room for the main stories first (WORLD NOW keeps two, the number of the day counting as one).
    const mainsNeeded = Math.max(0, (program?.id === 'world-now' ? 2 : 1) - (number ? 1 : 0));
    const want = Math.min(r.max || (n >= 6 ? 3 : 4), slots - mainsNeeded);
    const countries = new Set([lead.country]);
    for (const i of [...pool]) {
      if (roundup.length >= want) break;
      if (!i.loc || i.breaking || i.live || countries.has(i.country)) continue;
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
    slots -= roundup.length;
  }
  const mains = [];
  while (slots > 0 && pool.length) {
    mains.push(take((i) => !i.live) || pool.shift());
    slots--;
  }
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
  return { order, roundup, lighter, number };
}

const bestFigure = (info) => info.figures.filter((f) => !f.age).sort((a, b) => b.score - a.score)[0] || info.figures[0];

// ---------------------------------------------------------------- the provider

export function createMockProvider() {
  return {
    name: 'mock',
    // It copies the feed text, so it has nothing to check: it never stands in for the editor.
    reviews: false,
    available: () => true,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count, now }) {
      const usage = { input: 0, output: 0, cached: 0 };
      // Asked to review anyway (outside a ProviderChain): return the script untouched and say so.
      if (stage === 'review') return { text: JSON.stringify(script), usage, reviewed: false };
      return { text: JSON.stringify(writeEpisode({ stories, channelName, program, presenters, count, now: now ?? new Date() })), usage };
    },
  };
}

// Attribution templates; each takes the sentence and the outlet. Rotated, never twice in a row.
const ATTRIBUTIONS = [
  { id: 'tail', fn: (t, src) => `${unstop(t)}, ${src} reports.` },
  { id: 'according', fn: (t, src) => (lcFirst(t) ? `According to ${src}, ${unstop(lcFirst(t))}.` : null) },
  { id: 'that', fn: (t, src) => (lcFirst(t) ? `${src} reports that ${unstop(lcFirst(t))}.` : null) },
  { id: 'colon', fn: (t, src) => `From ${src}: ${asSentence(t)}` },
];

function writeEpisode({ stories, channelName, program, presenters, count, now }) {
  const title = program?.title || channelName;
  const solo = !presenters.B;
  const pid = program?.id || '';
  const quick = pid === 'news-60';
  // A live page whose only lines point at the outlet's own coverage has nothing to read out.
  const all = stories.map(study).filter((i) => !i.live || i.sentences.length);
  // Live pages only when there is nothing else.
  const fresh = all.filter((i) => !i.live);
  const pool = fresh.length >= Math.min(all.length, count ?? program?.stories ?? 5) ? fresh : all;
  const n = Math.min(pool.length, count ?? program?.stories ?? 5);
  const { order, roundup, lighter, number } = runningOrder(pool, n, program);
  const seed = order.map((i) => i.s.id).join('|') + pid;
  const nameOf = (slot) => firstName(presenters[slot]);
  const idOf = (slot) => presenters[slot]?.id;
  const other = (slot) => (slot === 'A' ? 'B' : 'A');

  // Anchors: blocks alternate (the round-up is one block). WORLD NOW: Lola reads the round-up and And finally.
  const reader = program?.roundup?.reader;
  const anchors = [];
  let block = -1;
  order.forEach((info, k) => {
    if (!(roundup.includes(info) && k > 0 && roundup.includes(order[k - 1]))) block++;
    let a = solo || block % 2 === 0 ? 'A' : 'B';
    if (!solo && reader && (roundup.includes(info) || info === lighter)) a = reader;
    if (!solo && pid === 'cosmos' && info === number) a = 'B'; // the number is UNIT-8's moment
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
  const introParts = [];
  if (shape === 'frame') {
    introParts.push(`[nod] This is ${title}. I'm ${names}.`);
  } else if (shape === 'headlines') {
    order.slice(0, 3).forEach((info, k) => {
      introParts.push(`${k === 0 && info.grave ? '[serious] ' : ''}${asSentence(info.s.title)}`);
      tease.push(info.s.id);
    });
    introParts.push(`${timeGreeting(now)}, and welcome to ${title}. [nod] I'm ${names}.${solo ? '' : ' [B:nod]'}`);
  } else {
    if (top) {
      introParts.push(`${grave0 ? '[serious] ' : ''}${top.breaking ? 'Breaking news: ' : ''}${asSentence(top.s.title)}`);
      tease.push(top.s.id);
    }
    const second = order[1];
    const third = order[2];
    if (second) {
      introParts.push(`[point_camera] Also coming up: ${featureTease(second) || unstop(second.s.title)}.`);
      tease.push(second.s.id);
    }
    if (third) {
      introParts.push(third === number ? 'And later, our number of the day.' : third === lighter ? `And later: ${asSentence(third.s.title)}` : `Later in the programme: ${asSentence(third.s.title)}`);
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
  let thanked = 0;
  let tossed = false;
  let tosses = 0;
  let lastTemplate = null;
  const named = new Map(); // outlet -> times attributed
  const policy = program?.chats || null;

  const attribute = (sentence, info, key, only = null) => {
    const src = info.s.source;
    const times = named.get(src) || 0;
    named.set(src, times + 1);
    // A sentence that names its own source ("officials said") gets no second "X reports" on top:
    // the outlet is named up front the first time ("From Bitport Herald: ..."), then not at all.
    if (OWN_ATTRIBUTION.test(sentence) && (times > 0 || (only && !only.includes('colon')))) return asSentence(sentence);
    if (times > 1 && hash(key) % 2 === 0) return asSentence(sentence);
    const offset = hash(seed) % ATTRIBUTIONS.length;
    for (let j = 0; j < ATTRIBUTIONS.length; j++) {
      const t = ATTRIBUTIONS[(offset + segments.length + j) % ATTRIBUTIONS.length];
      if (t.id === lastTemplate || (only && !only.includes(t.id))) continue;
      if (OWN_ATTRIBUTION.test(sentence) && t.id !== 'colon') continue;
      const out = t.fn(sentence, src);
      if (out) {
        lastTemplate = t.id;
        return out;
      }
    }
    // Nothing fits without repeating the last opening: a sentence with its own source stands as it is.
    return OWN_ATTRIBUTION.test(sentence) ? asSentence(sentence) : `${unstop(sentence)}, ${src} reports.`;
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
      // One sentence per item, its place named early, attributed.
      const idx = roundup.indexOf(info);
      const max = quick ? 18 : 20;
      const placeWords = [info.loc.entry.name, ...info.loc.entry.aliases, info.country].filter(Boolean);
      const namesPlace = (t) => placeWords.some((p) => t.includes(p.replace(/^the /, '')));
      // A sentence that names the place and fits, else the headline (it says what happened), never a stray detail.
      const line = pickSentence((t) => namesPlace(t) && wordCount(t) + 2 <= max) || (wordCount(s.title) + 2 <= max ? s.title : null) || pickSentence((t) => namesPlace(t)) || s.title;
      const lead = idx === 0 ? program?.roundup?.opener || 'Now, around the world in 30 seconds.' : '';
      const where = namesPlace(line) ? '' : `${idx === 0 ? 'First, ' : 'Now to '}${spokenPlace(info.loc.entry)}.`;
      parts.push(...[`${idx === 0 ? '[point_screen] ' : ''}${lead}`.trim(), where].filter(Boolean), attribute(line, info, key, ['tail']));
    } else {
      // Openers: the summary's first sentence when it says the headline better (or the intro already read the headline).
      const first = info.sentences[0];
      const skipHeadline = first && ((k === 0 && introSaidHeadline) || restates(first, s.title));
      let opener = skipHeadline ? pickSentence(() => true) : s.title;
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
      let line = attribute(opener, info, key, isLighter ? ['tail', 'according', 'that'] : null);
      if (info.breaking) line = `Breaking news. ${line}`;
      else if (info.live) line = `A developing story: ${line}`;
      if (isLighter) line = `And finally: ${line}`;
      parts.push(`${isNumber || isLighter ? '' : cue}${line}`);
      if (figureLine) parts.push(figureLine);
      // Details: news-60 keeps to its word budget; the TECH BYTES lead keeps one sentence back for THE CATCH.
      const budget = quick ? (k === 0 ? 38 : 28) : Infinity;
      const maxDetails = quick ? 2 : isNumber ? (figureLine ? 0 : 1) : k === 0 ? 2 : 1;
      const catchFor = pid === 'tech-bytes' && k === 0 && !info.grave ? CATCH.find((c) => info.sentences.some((t) => !used.has(t) && c.test.test(t))) : null;
      const reserved = catchFor ? info.sentences.find((t) => !used.has(t) && catchFor.test.test(t)) : null;
      if (reserved) used.add(reserved);
      let details = 0;
      for (const t of info.sentences) {
        if (details >= maxDetails || used.has(t)) continue;
        if (/^(?:It|They|This|These)\b/.test(t) && WHY.test(t)) continue; // "It says..." with no subject reads as a label
        if (wordCount(parts.join(' ')) + wordCount(t) > budget) continue;
        let text = t;
        if (details === 0 && !solo && !info.grave) text += ` [${partner}:${choose(['nod', 'nod', 'look_partner'], key)}]`;
        parts.push(text);
        used.add(t);
        details++;
      }
      if (!details && !solo && !info.grave) parts[parts.length - 1] += ` [${partner}:nod]`;
      const quoteFits = info.quote?.by && !quick && !inRoundup && ![...used].some((l) => l.includes(info.quote.text.slice(0, 20)));
      if (quoteFits && parts.join(' ').length + info.quote.text.length < 420) parts.push(`As ${lowerArticle(info.quote.by)} put it: “${unstop(info.quote.text)}.”`);
      if (reserved) info.catchAnswer = { line: reserved, q: catchFor.q };
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
            const pair = choose(WORLD_PAIRS[info.kicker] || WORLD_PAIRS.any, `${key}~pair`);
            planned.push({ anchor: 'A', text: pair[0] }, { anchor: 'B', text: pair[1] });
          } else if (pid === 'tech-bytes' && slot === 'lead' && info.catchAnswer) {
            const askB = idOf('B') === 'ada' || idOf('A') !== 'ada' ? 'B' : 'A';
            planned.push({ anchor: askB, text: info.catchAnswer.q(nameOf(other(askB))) }, { anchor: other(askB), text: `[lean_in] ${info.catchAnswer.line}` });
          } else if (pid === 'tech-bytes' && slot === 'lighter') {
            const sp = partner;
            const kind = PRODUCT_KICKERS.has(info.kicker) ? 'product' : 'science';
            planned.push({ anchor: sp, text: choose(TECH_BUTTONS[kind][idOf(sp)] || GENERIC_CHATS, `${key}~btn`) });
          } else if (pid === 'cosmos' && slot === 'lead') {
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            const f = info.figures.find((x) => parts.join(' ').includes(numbersIn(x.said)[0]?.raw || x.value) && !x.age);
            planned.push({ anchor: unit, text: f ? `[nod] ${f.said.replace(/^(?:about|around|nearly|almost|some|more than|over|up to|at least) /i, '').replace(/^\w/, (c) => c.toUpperCase())}. Noted.` : '[nod] Logged, Dr Reyes.' });
            planned.push({ anchor: other(unit), text: next === number ? `[look_partner] Thank you, UNIT-8. Our number of the day is yours.` : 'Thank you, UNIT-8.' });
          } else if (pid === 'cosmos' && slot === 'lighter') {
            const unit = idOf('B') === 'unit8' ? 'B' : partner;
            planned.push({ anchor: unit, text: choose(UNIT8_LINES[info.kicker] || UNIT8_LINES.any, `${key}~u8`) });
          }
        }
      } else if (info.light && next && !inRoundup) {
        planned.push({ anchor: partner, text: choose(CHATS[idOf(partner)] || GENERIC_CHATS, `${key}~chat`) });
      }
    }
    const chatsHere = planned.slice(0, maxChats - chats);

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
      shot: info.loc ? 'map' : s.image ? (k % 3 === 1 ? 'full' : 'close') : solo ? 'close' : 'wide',
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

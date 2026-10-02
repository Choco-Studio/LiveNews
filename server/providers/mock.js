// Offline provider: builds an episode straight from the feed text, with no AI.
// Lets the whole channel run (and be demoed) without any account or API key.
// It only ever re-uses the feed's own words: headlines, summary sentences,
// figures and quotations as written. Variety comes from how they are framed
// (openers, hand-overs, recurring features), chosen deterministically from the
// story ids so the same news always makes the same episode.

import { isBreaking } from '../news.js';
import { GRAVE, LIGHT, extractFigures, quotesIn, wordsGrounded } from '../facts.js';
import { locate, placesIn } from '../gazetteer.js';

const DEATHS = /\b(?:dead|deaths?|die[sd]|killed|killings?|victims?|mourn\w*|funeral)\b/i;
const SURPRISE = /\b(?:first|largest|biggest|record|discover\w*|uncover\w*|rare|unexpected|surpris\w*)\b/i;
// A summary sentence that says what follows from the news (a purpose or a consequence).
const WHY =
  /\b(?:aims? to|so that|to help|in order to|which means|means that|(?:will|would|could|can|should) (?:help|cut|save|reduce|let|allow|make|carry|light|power|create|protect|improve|speed|bring|give|lower|ease|keep|feed|connect|double|halve)|to (?:cut|reduce|protect|improve|cool|save|ease|lower))\b/i;

const KICKERS = [
  [/volcan|eruption|lava/i, 'VOLCANO'],
  [/earthquake|quake|tremor/i, 'EARTHQUAKE'],
  [/flood|monsoon|heavy rain|storm|hurricane|typhoon|cyclone|strong winds|heatwave/i, 'WEATHER'],
  [/\b(?:tram|train|rail|metro|ferry|ferries|airport|flights?|bus|buses|bicycle|cycling|bike)\b/i, 'TRANSPORT'],
  [/deforest|forest|climate|emission|carbon|glacier|ice sheet/i, 'CLIMATE'],
  [/archaeolog|temple|ancient|ruins|fossil|dinosaur|tomb/i, 'HISTORY'],
  [/\bschools?\b|education|students?|universit/i, 'EDUCATION'],
  [/clean water|drinking water|water projects|reservoir/i, 'WATER'],
  [/\btrees?\b|parks?\b|gardens?\b|green spaces?/i, 'GREEN CITIES'],
  [/\bstocks?\b|shares|index|markets?\b|investors/i, 'MARKETS'],
  [/inflation|prices|interest rates?|economy|growth|recession/i, 'ECONOMY'],
  [/\btrade\b|exports?|imports?|tariffs?|shipping|port\b/i, 'TRADE'],
  [/\bjobs\b|unemployment|wages|workers/i, 'JOBS'],
  [/robot/i, 'ROBOTICS'],
  [/\bAI\b|artificial intelligence|chatbot/i, 'AI'],
  [/\bchips?\b|semiconductor|processor/i, 'CHIPS'],
  [/smartphone|\bphones?\b|gadget|headset|wearable/i, 'GADGETS'],
  [/\bapps?\b|software|update|browser/i, 'SOFTWARE'],
  [/video games?|gaming|console/i, 'GAMING'],
  [/rocket|launch|orbit|satellite|astronaut|space station|spacecraft|probe/i, 'SPACE'],
  [/telescope|galaxy|galaxies|planet|comet|asteroid|eclipse|\bstars?\b|\bmoon\b|nebula/i, 'ASTRONOMY'],
  [/solar (?:farm|panels?|plant|power|park)|wind farm|turbines?|tidal power|power grid|energy|electricity|batter(?:y|ies)/i, 'ENERGY'],
  [/vaccine|hospital|health|medicine|disease|patients/i, 'HEALTH'],
  [/ocean|whales?|reef|coral|dolphins?|sea turtles?/i, 'OCEANS'],
  [/wildlife|zoo|panda|penguins?|elephants?|birds?\b|species|bees?\b/i, 'WILDLIFE'],
];

const OPENERS = [
  (t, src) => `${t}, ${src} reports.`,
  (t, src) => `${src} reports: ${t}.`,
  (t, src) => `This from ${src}: ${t}.`,
  (t, src) => `${t}. That's according to ${src}.`,
  (t, src) => `From ${src} now: ${t}.`,
];
const GRAVE_OPENERS = [0, 1, 3];

const WHY_LEADS = ['Why does it matter?', 'Why it matters:', 'What it means:'];
const GREETINGS = [
  (title, channel) => `Hello [wave] and welcome to ${title} on ${channel}.`,
  (title) => `Good to have you with us. [wave] This is ${title}.`,
  (title, channel) => `Welcome [wave] to ${title}, here on ${channel}.`,
];
const SIGNOFFS_DUO = [
  (title, channel, partner) => `That's ${title} for now. [wave] From ${partner} and from me, thanks for watching. Stay with us here on ${channel}.`,
  (title, channel) => `And that's ${title}. [wave] Thanks for your company. There's more news around the clock here on ${channel}.`,
];
const SIGNOFFS_SOLO = [
  (title, channel) => `That's ${title} for now. [wave] Stay with us here on ${channel}.`,
  (title, channel) => `And that's ${title}. [wave] Thanks for watching, and stay with us on ${channel}.`,
];

// Reactions in a chat: personality first, dry and grown-up, no facts, never next to grave news.
const CHATS = {
  paco: ['[nod] Well. Not a sentence I expected to read tonight. [papers]', '[chin] Remarkable. [papers] Moving on.', '[nod] File that under good news. We do have some. [look_partner]'],
  lola: ['[laugh] I will admit, that one made my evening. [look_partner]', '[chin] I would love to know how that conversation started. [papers]', '[nod] Some good news, for once. [papers]'],
  max: ['[raise_hand] For the record, I would like one. Purely for research. [look_partner]', '[nod] Clever. Quietly, properly clever. [papers]', '[laugh] My bank manager will want a word before I go near that. [papers]'],
  ada: ['[chin] Promising. I will believe it when it survives its first software update. [look_partner]', '[shrug] We will see how it holds up outside the press release. [papers]', '[nod] Fair enough. That one I like. [papers]'],
  nova: ['[chin] Every answer comes with a new question attached. That is the job. [look_partner]', '[nod] Worth looking up tonight, if the clouds allow. [papers]', '[steeple] Science at its best: patient, careful and slightly stubborn. [papers]'],
  unit8: ['[nod] Data logged. I have filed it under remarkable, subsection humans.', '[shake_head] You say over the moon. I checked. Nobody is over the moon. [papers]', '[nod] Noted. My circuits remain calm. This is how I express enthusiasm. [papers]'],
  penny: ['[nod] Worth keeping an eye on. [papers]'],
  sam: ['[nod] Quick one, but worth knowing. [papers]'],
};
const GENERIC_CHATS = ['[nod] Remarkable. [papers] Moving on.', '[chin] Something to think about. [papers]', '[nod] Well, there we are. [papers]'];

const PICKUPS = (name) => [`Thanks, ${name}.`, `Thank you, ${name}.`];
const TOSSES = (name) => [`[look_partner] ${name}?`, `[point_partner] Over to you, ${name}.`];

// FNV-1a: stable variety from story ids.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const choose = (list, key) => list[hash(key) % list.length];

// Markers that belong to the strap, not to the spoken headline: "BREAKING: …", "… – live".
const plainTitle = (t) =>
  String(t)
    .replace(/^\s*breaking(?: news)?\s*[:|–—-]\s*/i, '')
    .replace(/\s*(?:,|\s[|–—-])\s*breaking\s*$/i, '')
    .replace(/\s*[-–—]\s*live(?: updates)?\s*$/i, '')
    .trim();

const sentencesOf = (s) =>
  String(s || '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“‘'])/)
    .map((x) => x.trim())
    .filter(Boolean);
const asSentence = (t) => `${String(t).trim().replace(/[\s.!?:;,]+$/, '')}.`;
const unstop = (t) => String(t).trim().replace(/[\s.!?:;,]+$/, '');
const firstName = (p) => String(p?.name || 'my colleague').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];
const lowerArticle = (by) => by.replace(/^(The|A|An) /, (m) => m.toLowerCase());

/** How a place is said aloud: "the Andes", "the United States", "the Reykjanes peninsula", "Nairobi". */
function spokenPlace(entry) {
  const the = entry.aliases.find((a) => /^the /.test(a));
  if (the) return the;
  if (/^(?:United |Netherlands|Philippines|Czech Republic|Democratic Republic|Dominican Republic|Gambia)/.test(entry.name)) return `the ${entry.name}`;
  if (entry.kind === 'region' && / [a-z]/.test(entry.name)) return `the ${entry.name}`; // "Greek islands", "Reykjanes peninsula"
  return entry.name;
}

/** Up to 44 characters for the strap, cutting a trailing phrase rather than a word. */
function caption(title) {
  const t = unstop(title);
  if (t.length <= 44) return t;
  const cut = t.match(/^(.{20,44}?)\s+(?:in|on|at|for|near|after|with|as|to|amid|over|across)\s+\S/);
  if (cut) return cut[1];
  return t;
}

function kickerFor(s) {
  for (const [re, k] of KICKERS) if (re.test(s.title)) return k;
  for (const [re, k] of KICKERS) if (re.test(s.summary || '')) return k;
  return null;
}

/** What the mock knows about a story, from its own text only. */
function study(story) {
  const s = { ...story, title: plainTitle(story.title) || story.title, breaking: isBreaking(story.title) };
  const text = `${s.title} ${s.summary || ''}`;
  const grave = GRAVE.test(text);
  const loc = locate(s.title, s.summary || '');
  const precise = loc && !loc.entry.broad ? loc : null;
  const figures = extractFigures(s.summary || '').filter((f) => f.fact.length <= 40);
  return {
    s,
    grave,
    sad: grave && DEATHS.test(text),
    light: !grave && LIGHT.test(text),
    surprising: SURPRISE.test(s.title),
    loc: precise,
    places: placesIn(text),
    figures,
    quote: quotesIn(s.summary || '').find((q) => q.text.split(/\s+/).length >= 4) || null,
    kicker: kickerFor(s),
  };
}

/** Body sentences of the summary: skips a first sentence that just repeats the headline (unless asked to keep it). */
function body(info, max, { keepFirst = false } = {}) {
  const all = sentencesOf(info.s.summary);
  if (!keepFirst && all.length > 1 && wordsGrounded(all[0], info.s.title) >= 0.7) all.shift();
  if (!all.length) return [];
  return all.slice(0, max).filter((x) => unstop(x).toLowerCase() !== unstop(info.s.title).toLowerCase());
}

/**
 * The running order: the top stories as ranked, then a round-up of stories
 * with a clear place (if the programme has one), then the rest, and a
 * lighter story last (if the programme has an "and finally").
 */
function runningOrder(infos, n, features) {
  const pool = infos.slice(0, n + 3);
  let picked = pool.slice(0, n);
  let lighter = null;
  if (features.includes('lighter')) {
    lighter = [...picked].reverse().find((i) => i.light && i !== picked[0]) || pool.slice(n).find((i) => i.light) || null;
    if (lighter && !picked.includes(lighter)) picked = [...picked.slice(0, n - 1), lighter];
    if (lighter) picked = [...picked.filter((i) => i !== lighter), lighter];
  }
  let roundup = [];
  if (features.includes('roundup') && n >= 3) {
    // NEWS IN 60 can run almost entirely on the map; a flagship keeps two lead stories first.
    const lead = n >= 6 ? 2 : 1;
    const max = n >= 6 ? 3 : 4;
    roundup = picked.slice(lead).filter((i) => i.loc && i !== lighter).slice(0, max);
    if (roundup.length < 2) roundup = [];
  }
  const rest = picked.filter((i) => !roundup.includes(i) && i !== lighter);
  const lead = rest.slice(0, roundup.length ? (n >= 6 ? 2 : 1) : rest.length);
  const after = rest.slice(lead.length);
  return { order: [...lead, ...roundup, ...after, ...(lighter ? [lighter] : [])], roundup, lighter };
}

export function createMockProvider() {
  return {
    name: 'mock',
    // It copies the feed text, so it has nothing to check: it never stands in for the editor.
    reviews: false,
    available: () => true,
    async generate({ stage = 'write', script, stories, channelName, program, presenters = { A: { name: 'the presenter' } }, count }) {
      const usage = { input: 0, output: 0, cached: 0 };
      // Asked to review anyway (outside a ProviderChain): return the script untouched and say so.
      if (stage === 'review') return { text: JSON.stringify(script), usage, reviewed: false };
      return { text: JSON.stringify(writeEpisode({ stories, channelName, program, presenters, count })), usage };
    },
  };
}

function writeEpisode({ stories, channelName, program, presenters, count }) {
  const title = program?.title || channelName;
  const solo = !presenters.B;
  const quick = program?.id === 'news-60';
  const features = program?.features || [];
  const n = Math.min(stories.length, count ?? program?.stories ?? 5);
  const infos = stories.map(study);
  const { order, roundup, lighter } = runningOrder(infos, n, features);
  const seed = order.map((i) => i.s.id).join('|') + (program?.id || '');

  // Number of the day: the most striking stated figure of a story that is not grave, a round-up item or the closer.
  const numberStory = features.includes('number')
    ? order
        .filter((i) => !i.grave && !roundup.includes(i) && i !== lighter && i.figures[0]?.score >= 3)
        .sort((a, b) => b.figures[0].score - a.figures[0].score)[0] || null
    : null;

  // Anchors: each lead story, the whole round-up and the closer are one "block" each.
  const anchors = [];
  let block = -1;
  order.forEach((info, k) => {
    if (!(roundup.includes(info) && k > 0 && roundup.includes(order[k - 1]))) block++;
    anchors.push(solo || block % 2 === 0 ? 'A' : 'B');
  });
  const other = (slot) => (slot === 'A' ? 'B' : 'A');
  const nameOf = (slot) => firstName(presenters[slot]);

  const segments = [];
  // Cold open: the top story's headline, the greeting, a teaser.
  const top = order[0];
  const second = order[1];
  const greet = choose(GREETINGS, seed)(title, channelName);
  const sober = top?.grave || second?.grave; // no waving at the viewer while teasing grave news
  const intro = [
    top ? `${top.grave ? '[serious] ' : ''}${asSentence(top.s.title)}` : '',
    sober ? greet.replace('[wave]', '[nod]') : greet,
    `I'm ${presenters.A.name}${solo ? '' : `, here with ${presenters.B.name}. [B:nod]`}${solo ? '.' : ''}`,
    second ? `[point_camera] Also coming up: ${unstop(second.s.title)}${numberStory && numberStory !== second ? ', and our number of the day' : ''}.` : '',
  ];
  segments.push({ type: 'intro', anchor: 'A', emotion: top?.grave ? 'serious' : sober ? 'neutral' : 'happy', text: intro.filter(Boolean).join(' ').replace(/\.\./g, '.') });

  let chats = 0;
  let whyCount = 0;
  let tossed = false;
  order.forEach((info, k) => {
    const s = info.s;
    const anchor = anchors[k];
    const partner = other(anchor);
    const key = `${seed}#${s.id}`;
    const inRoundup = roundup.includes(info);
    const isNumber = info === numberStory;
    const isLighter = info === lighter;
    const parts = [];
    const afterChat = segments.at(-1)?.type === 'chat';
    const pickedUp = !solo && k > 0 && anchors[k - 1] !== anchor && !tossed && !afterChat && !order[k - 1].grave && !info.grave && hash(key) % 2 === 0;
    if (pickedUp) parts.push(choose(PICKUPS(nameOf(anchors[k - 1])), key));
    tossed = false;

    if (inRoundup) {
      // One sentence per item, place first, attributed.
      const idx = roundup.indexOf(info);
      const line = unstop(body(info, 1, { keepFirst: true })[0] || s.title);
      // Lead with the place, or with its country when the sentence names the region itself ("the Reykjanes peninsula").
      const { entry } = info.loc;
      const country = entry.kind !== 'country' && entry.country ? placesIn(entry.country)[0]?.entry : null;
      const place = entry.kind === 'region' && country && line.includes(entry.name) ? spokenPlace(country) : spokenPlace(entry);
      const lead = idx === 0 ? `[point_screen] Now, around the world in 30 seconds. First, ${place}.` : idx === roundup.length - 1 ? `And lastly, ${place}.` : choose([`To ${place} next.`, `Now ${place}.`, `Over to ${place}.`], key);
      parts.push(lead, `${line}, ${s.source} reports.`);
    } else {
      const opener = info.grave ? OPENERS[GRAVE_OPENERS[hash(key) % GRAVE_OPENERS.length]] : choose(OPENERS, key);
      const cue = isNumber ? '[count] ' : info.grave ? '[lean_in] ' : s.image ? '[point_screen] ' : choose(['[raise_hand] ', '[point_camera] ', ''], key);
      if (isNumber) parts.push(`${cue}Our number of the day: ${unstop(info.figures[0].said)}.`);
      if (isLighter) parts.push(`${isNumber ? '' : cue}And finally: ${unstop(s.title)}, ${s.source} reports.`);
      else parts.push(`${isNumber ? '' : cue}${opener(unstop(s.title), s.source)}`);
      const lines = body(info, quick ? 1 : 2);
      if (s.breaking) parts[parts.length - 1] = `Breaking news. ${parts.at(-1)}`;
      // With nothing more to say, the co-presenter reacts to the headline itself.
      if (!lines.length && !solo && !info.grave) parts[parts.length - 1] += ` [${partner}:nod]`;
      lines.forEach((line, j) => {
        let text = line;
        if (j > 0 && !quick && !info.grave && whyCount < 2 && WHY.test(line)) {
          text = `${choose(WHY_LEADS, key)} ${line}`;
          whyCount++;
        }
        // The co-presenter reacts after the first fact (never at a grave story).
        if (j === 0 && !solo && !info.grave) text += ` [${partner}:${choose(['nod', 'nod', 'chin'], key)}]`;
        parts.push(text);
      });
      const quoteFits = info.quote?.by && !quick && !lines.some((l) => l.includes(info.quote.text.slice(0, 20)));
      if (quoteFits && parts.join(' ').length + info.quote.text.length < 420) parts.push(`As ${lowerArticle(info.quote.by)} put it: “${unstop(info.quote.text)}.”`);
    }

    // Hand-over: toss to the partner who reads the next block, sometimes.
    const next = order[k + 1];
    const nextAnchor = anchors[k + 1];
    const chatNext = !solo && info.light && !info.grave && next && !next.grave && !inRoundup && chats < (program?.maxChats ?? 3);
    if (!solo && next && nextAnchor !== anchor && !chatNext && !info.grave && !next.grave && hash(`${key}>`) % 3 === 0) {
      parts.push(choose(TOSSES(nameOf(nextAnchor)), key));
      tossed = true;
    }

    const story = {
      type: 'story',
      storyId: s.id,
      anchor,
      emotion: info.sad ? 'sad' : info.grave ? 'serious' : isLighter || info.light ? 'happy' : info.surprising ? 'surprised' : 'neutral',
      headline: caption(s.title),
      text: parts.join(' '),
      shot: info.loc ? 'map' : s.image ? (k % 3 === 1 ? 'full' : 'close') : solo ? 'close' : 'wide',
      breaking: s.breaking,
      location: info.loc ? { place: info.loc.place, lat: info.loc.lat, lon: info.loc.lon } : null,
      fact: info.figures[0]?.fact || null,
      kicker: info.kicker,
    };
    if (info.figures.length) story.numbers = info.figures.map(({ value, label }) => ({ value, label }));
    if (info.quote) story.quote = { text: info.quote.text, by: info.quote.by };
    if (info.places.length >= 2) story.map = info.places.map(({ place, lat, lon }) => ({ place, lat, lon }));
    if (inRoundup) story.feature = 'roundup';
    else if (isNumber) story.feature = 'number';
    else if (isLighter) story.feature = 'lighter';
    segments.push(story);

    if (chatNext) {
      chats++;
      const speaker = partner;
      const lines = CHATS[presenters[speaker]?.id] || GENERIC_CHATS;
      segments.push({ type: 'chat', anchor: speaker, emotion: info.surprising ? 'surprised' : 'happy', text: choose(lines, `${key}~chat`) });
    }
  });

  const last = order.at(-1);
  const closer = solo ? choose(SIGNOFFS_SOLO, seed)(title, channelName) : choose(SIGNOFFS_DUO, seed)(title, channelName, presenters.A.name);
  segments.push({
    type: 'outro',
    anchor: solo ? 'A' : 'B',
    emotion: last?.grave ? 'neutral' : 'happy',
    text: last?.grave ? closer.replace('[wave]', '[nod]') : closer,
  });
  return { title: `${title} (demo)`, segments };
}

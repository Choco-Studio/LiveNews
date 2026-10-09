// The channel's experts (owner 23:05: "Don't forget the EXPERTS. That brings the programme to life"; owner 9 Oct:
// "termina lo de los expertos"). Eight recurring analysts of the channel's own, all fictional, each with a desk:
// a story of their field is put to them after the presenter reads it. The presenter introduces them and asks one
// question; they answer from the story's facts, are asked one more, and are thanked. They join from their own
// studio (a backdrop of their desk), like the correspondents, never from the scene and never as a live witness.
//
// What an expert may say: what the source says, explained (the key detail, the context, what comes next), every
// sentence grounded in the story's source like the presenter's own. Never "I was there", "I've seen", "told me",
// "sources tell" (server/correspondents.js presenceClaim), never a prediction the source does not make.
//
//   EXPERT_DESKS                 the desks: strap title, short label, what they cover
//   expertsOf(program, roster)   the programme's experts: [{ id, name, first, desk, role, backdrop }]
//   expertFor(story, experts)    the expert whose desk a story belongs to (or null), with the match's strength
//   introLine / questionLine / followLine / thanksLine   the presenter's lines, varied by a seed
import { AHEAD } from './correspondents.js';

/**
 * The desks. `words` are the story words of the desk (headline, summary and kicker are searched; a whole word or
 * its stem), `categories` the feed categories that lean that way. A story goes to the desk with the most hits;
 * two hits at least.
 */
export const EXPERT_DESKS = {
  economics: {
    covers: 'the economy, prices and wages, interest rates, markets, trade, budgets and business results',
    label: 'ECONOMICS',
    categories: ['business'],
    words: /\b(?:econom\w*|inflation|interest rates?|rates? (?:rise|cut|hold)|central bank\w*|bank of england|federal reserve|the fed|ecb|recession|gdp|growth|prices?|wages?|pay|jobs?|unemployment|employment|markets?|shares?|stocks?|bonds?|currency|currencies|pound|dollar|euro|yen|tariffs?|trade|exports?|imports?|budget|taxe?s?|deficit|debt|borrowing|mortgages?|energy bills?|cost of living|retail|sales|profits?|earnings|investors?)\b/gi,
    ask: ['what does this tell us about the economy?', 'how significant is this?', 'what is behind it?', 'what should we make of it?'],
  },
  diplomacy: {
    covers: 'talks, summits, sanctions, alliances and relations between countries',
    label: 'DIPLOMACY',
    categories: ['world'],
    words: /\b(?:diploma\w*|talks|summit|ceasefire|truce|negotiat\w*|treaty|accord|sanctions?|foreign minist\w*|foreign secretary|secretary of state|ambassadors?|embass\w*|envoy|united nations|\bun\b|security council|nato|g7|g20|european union|\beu\b|alliance|allies|bilateral|peace (?:deal|plan|talks)|state visit|prime minister|president|foreign policy|border|refugees?|conflict|war)\b/gi,
    ask: ['what is behind this?', 'what does each side want?', 'how significant is this?', 'what should we make of it?'],
  },
  climate: {
    covers: 'climate, weather extremes, the environment, energy and wildlife',
    label: 'CLIMATE',
    categories: ['science'],
    words: /\b(?:climate|warming|emissions?|carbon|co2|greenhouse|heatwave|heat|drought|wildfires?|floods?|flooding|storms?|hurricane|typhoon|cyclone|rainfall|temperatures?|glaciers?|ice sheet|sea ice|sea levels?|oceans?|coral|species|wildlife|biodiversity|forests?|deforestation|renewables?|solar|wind farms?|wind power|environment\w*|pollution|plastic|conservation|weather)\b/gi,
    ask: ['what is the bigger picture?', 'how unusual is this?', 'what does this tell us?', 'what should we make of it?'],
  },
  planetary: {
    covers: 'space missions, planets, moons, comets and what telescopes find',
    label: 'SPACE',
    categories: ['science'],
    words: /\b(?:planets?|planetary|moons?|lunar|mars|martian|venus|jupiter|saturn|mercury|neptune|uranus|pluto|asteroids?|comets?|meteors?|meteorites?|telescopes?|hubble|webb|nasa|esa|space ?x|spacecraft|probe|rover|orbit\w*|launch\w*|rocket|astronaut\w*|space station|galax\w*|stars?|solar system|sun|eclipse|exoplanets?|black holes?|universe|cosmic|astronom\w*)\b/gi,
    ask: ['what makes this special?', 'how big a deal is this?', 'what does it tell us?', 'what should we make of it?'],
  },
  tech: {
    covers: 'security flaws and attacks, chips and devices, AI systems, apps and platforms',
    label: 'TECHNOLOGY',
    categories: ['tech'],
    words: /\b(?:cyber\w*|hack\w*|breach\w*|ransomware|malware|phishing|vulnerabilit\w*|flaw|exploit|passwords?|encryption|privacy|data|chips?|semiconductors?|processors?|gpus?|hardware|devices?|smartphones?|phones?|laptops?|batter(?:y|ies)|artificial intelligence|\bai\b|models?|chatbots?|algorithms?|software|apps?|platforms?|cloud|servers?|robots?|robotics)\b/gi,
    ask: ['what does this actually do?', 'how worried should people be?', 'what is really new here?', 'what should we make of it?'],
  },
  health: {
    covers: 'medicine, hospitals, diseases, vaccines and treatments',
    label: 'HEALTH',
    categories: ['science'],
    words: /\b(?:health|hospitals?|nhs|doctors?|nurses?|patients?|vaccin\w*|virus\w*|viral|infections?|disease\w*|outbreaks?|pandemic|epidemic|cancer|diabetes|heart disease|dementia|obesity|drugs?|medicines?|medical|treatments?|trials?|therapy|surgery|world health organization|mental health|screening|antibiotics?|bird flu|flu|measles|covid)\b/gi,
    ask: ['what does this mean for patients?', 'how worried should people be?', 'how significant is this?', 'what should we make of it?'],
  },
  culture: {
    covers: 'films, music, books, art, museums, festivals and heritage',
    label: 'CULTURE',
    categories: [],
    words: /\b(?:films?|movies?|cinema|box office|music|albums?|songs?|concerts?|tour|festivals?|art|artists?|paintings?|exhibitions?|museums?|galler(?:y|ies)|theatre|theater|books?|novels?|authors?|awards?|oscars?|prize|archaeolog\w*|heritage|historic|statue|fashion|video games?|television|tv series|streaming|actors?|actress|singers?|bands?)\b/gi,
    ask: ['why does this matter to people?', 'what makes this special?', 'what is the story behind it?', 'what should we make of it?'],
  },
  legal: {
    covers: 'courts, rulings, trials, laws and regulators',
    label: 'LEGAL',
    categories: [],
    words: /\b(?:courts?|judges?|judgment|ruling|ruled|rules?|trial|verdict|convicted|acquitted|sentenced?|appeal\w*|lawsuit|sued|legal|lawyers?|law|laws|legislation|supreme court|high court|prosecutors?|charges?|charged|regulators?|watchdog|fined?|antitrust|competition authority|inquiry|injunction|constitution\w*)\b/gi,
    ask: ['what did the court actually decide?', 'what happens now?', 'how significant is this ruling?', 'what should we make of it?'],
  },
};

const firstName = (name) => String(name || '').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];

/** The programme's experts (config `experts`, roster entries with a known `expert.desk`). */
export function expertsOf(program, roster) {
  const ids = Array.isArray(program?.experts) ? program.experts : [];
  return ids
    .map((id) => ({ id, p: roster?.[id] }))
    .filter(({ p }) => p && EXPERT_DESKS[p.expert?.desk])
    .map(({ id, p }) => ({ id, name: p.name, first: firstName(p.name), desk: p.expert.desk, role: p.role || '', backdrop: p.expert.backdrop || 'neutral' }));
}

/**
 * The expert whose desk a story belongs to: { expert, desk, hits } or null. Hits are counted on the story's
 * headline, summary and kicker; a desk needs two (a feed category that leans its way breaks a tie). Ties go to
 * the programme's order of experts (its own speciality first).
 */
export function expertFor(story, experts) {
  if (!story || !experts?.length) return null;
  const text = [story.title || story.headline || '', story.summary || '', story.kicker || ''].join(' ');
  let best = null;
  for (const e of experts) {
    const d = EXPERT_DESKS[e.desk];
    // distinct words by their stem ("storm" and "Storms", "robot" and "robotics" are one word of the field)
    const hits = new Set((text.match(d.words) || []).map((w) => w.toLowerCase().replace(/(?:ies|es|s)$/, '').slice(0, 5))).size;
    const leans = d.categories.includes(story.category);
    if (hits < 2) continue;
    const score = hits + (leans ? 1 : 0);
    if (!best || score > best.score) best = { expert: e, desk: e.desk, hits, score };
  }
  return best;
}

function hash(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}
const choose = (list, key) => list[hash(key) % list.length];

/** The presenter's introduction of the expert, after the story (one sentence). */
export function introLine(e, seed) {
  const role = e.role || 'expert';
  return choose(
    [
      `Our ${role}, ${e.name}, is with us.`,
      `${e.name}, our ${role}, joins us.`,
      `With us is our ${role}, ${e.name}.`,
      `Let's bring in our ${role}, ${e.name}.`,
    ],
    `${seed}~intro`
  );
}

/** The presenter's first question, addressed by first name (one sentence, a question). */
export function questionLine(e, seed, question = null) {
  const q = question || choose(EXPERT_DESKS[e.desk]?.ask || ['what should we make of it?'], `${seed}~ask`);
  return `${e.first}, ${q}`;
}

/** The presenter's follow-up, fitted to what the answer says: what comes next, else what else matters. */
export function followLine(e, seed, answer = '') {
  const list = AHEAD.test(answer)
    ? [`And ${e.first}, what happens next?`, `${e.first}, what comes next?`, `What should we watch for, ${e.first}?`]
    : [`${e.first}, what else should people know?`, `And what else stands out, ${e.first}?`, `${e.first}, anything else we should know?`];
  return choose(list, `${seed}~follow`);
}

/** The presenter's thanks. */
export function thanksLine(e, seed) {
  return choose([`${e.name}, thank you.`, `${e.first}, thank you.`, `Thank you, ${e.first}.`], `${seed}~thanks`);
}

/** The strap's kicker for an expert: their title in capitals (the name is the strap's headline). */
export const expertKicker = (e) => String(e.role || 'Analyst').toUpperCase();

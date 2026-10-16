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
//   restedExperts(program, experts, recent, now)   those who may be booked now (an expert once in REST_HOURS
//                                a programme, its resident excepted), the one seen longest ago first
//   expertFor(story, experts)    the expert whose desk a story belongs to (or null), with the match's strength
//   introLine / questionLine / followLine / thanksLine / answerFrame   the lines, varied: with a turn (the station's
//                                count of analyses) each kind cycles through all its forms before one comes back
import { AHEAD } from './correspondents.js';

/**
 * The desks. `words` are the story words of the desk (headline, summary and kicker are searched; a whole word or
 * its stem), `categories` the feed categories that lean that way. A story goes to the desk with the most hits;
 * two hits at least.
 */
// (the first question is one any of the story's sentences answers: "how rare is this?" and "how worried should people be?"
// were answered with what the satellite measures and what a flaw affects, COSMOS and TECH BYTES 13-14 Oct; a question that
// promises a size, a cause or a future is the follow-up's, fitted to the answer, followLine)
export const EXPERT_DESKS = {
  economics: {
    covers: 'the economy, prices and wages, interest rates, markets, trade, budgets and business results',
    label: 'ECONOMICS',
    categories: ['business'],
    words: /\b(?:econom\w*|inflation|interest rates?|rates? (?:rise|cut|hold)|central bank\w*|bank of england|federal reserve|the fed|ecb|recession|gdp|growth|prices?|wages?|pay|jobs?|unemployment|employment|markets?|shares?|stocks?|bonds?|currency|currencies|pound|dollar|euro|yen|tariffs?|trade|exports?|imports?|budget|taxe?s?|deficit|debt|borrowing|mortgages?|energy bills?|cost of living|retail|sales|profits?|earnings|investors?)\b/gi,
    ask: ['what does this tell us about the economy?', 'what is behind it?', 'what should we make of it?', 'what is the bigger picture?', 'what stands out to you?', 'what should people know about this?'],
  },
  diplomacy: {
    covers: 'talks, summits, sanctions, alliances and relations between countries',
    label: 'DIPLOMACY',
    categories: ['world'],
    words: /\b(?:diploma\w*|talks|summit|ceasefire|truce|negotiat\w*|treaty|accord|sanctions?|foreign minist\w*|foreign secretary|secretary of state|ambassadors?|embass\w*|envoy|united nations|\bun\b|security council|nato|g7|g20|european union|\beu\b|alliance|allies|bilateral|peace (?:deal|plan|talks)|state visit|prime minister|president|foreign policy|border|refugees?|conflict|war)\b/gi,
    ask: ['what is behind this?', 'what should we make of it?', 'what is the background here?', 'what is the bigger picture?', 'what stands out to you?', 'what should people know about this?'],
  },
  climate: {
    covers: 'climate, weather extremes, the environment, energy and wildlife',
    label: 'CLIMATE',
    categories: ['science'],
    words: /\b(?:climate|warming|emissions?|carbon|co2|greenhouse|heatwave|heat|drought|wildfires?|floods?|flooding|storms?|hurricane|typhoon|cyclone|rainfall|temperatures?|glaciers?|ice sheet|sea ice|sea levels?|oceans?|coral|species|wildlife|biodiversity|forests?|deforestation|renewables?|solar|wind farms?|wind power|environment\w*|pollution|plastic|conservation|weather)\b/gi,
    ask: ['what is the bigger picture?', 'what does this tell us?', 'what should we make of it?', 'what is behind it?', 'what stands out to you?', 'what should people know about this?'],
  },
  planetary: {
    covers: 'space missions, planets, moons, comets and what telescopes find',
    label: 'SPACE',
    categories: ['science'],
    words: /\b(?:planets?|planetary|moons?|lunar|mars|martian|venus|jupiter|saturn|mercury|neptune|uranus|pluto|asteroids?|comets?|meteors?|meteorites?|telescopes?|hubble|webb|nasa|esa|space ?x|spacecraft|probe|rover|orbit\w*|launch\w*|rocket|astronaut\w*|space station|galax\w*|stars?|solar system|sun|eclipse|exoplanets?|black holes?|universe|cosmic|astronom\w*)\b/gi,
    ask: ['what does it tell us?', 'what should we make of it?', 'what is the bigger picture?', 'what is the story behind it?', 'what stands out to you?', 'what should people know about this?'],
  },
  tech: {
    covers: 'security flaws and attacks, chips and devices, AI systems, apps and platforms',
    label: 'TECHNOLOGY',
    categories: ['tech'],
    words: /\b(?:cyber\w*|hack\w*|breach\w*|ransomware|malware|phishing|vulnerabilit\w*|flaw|exploit|passwords?|encryption|privacy|data|chips?|semiconductors?|processors?|gpus?|hardware|devices?|smartphones?|phones?|laptops?|batter(?:y|ies)|artificial intelligence|\bai\b|models?|chatbots?|algorithms?|software|apps?|platforms?|cloud|servers?|robots?|robotics)\b/gi,
    ask: ['what is going on here?', 'what should we make of it?', 'what is behind it?', 'what is the bigger picture?', 'what stands out to you?', 'what should people know about this?'],
  },
  health: {
    covers: 'medicine, hospitals, diseases, vaccines and treatments',
    label: 'HEALTH',
    categories: ['science'],
    words: /\b(?:health|hospitals?|nhs|doctors?|nurses?|patients?|vaccin\w*|virus\w*|viral|infections?|disease\w*|outbreaks?|pandemic|epidemic|cancer|diabetes|heart disease|dementia|obesity|drugs?|medicines?|medical|treatments?|trials?|therapy|surgery|world health organization|mental health|screening|antibiotics?|bird flu|flu|measles|covid)\b/gi,
    ask: ['what is behind it?', 'what should we make of it?', 'what does this tell us?', 'what is the bigger picture?', 'what stands out to you?', 'what should people know about this?'],
  },
  culture: {
    covers: 'films, music, books, art, museums, festivals and heritage',
    label: 'CULTURE',
    categories: [],
    words: /\b(?:films?|movies?|cinema|box office|music|albums?|songs?|concerts?|tour|festivals?|art|artists?|paintings?|exhibitions?|museums?|galler(?:y|ies)|theatre|theater|books?|novels?|authors?|awards?|oscars?|prize|archaeolog\w*|heritage|historic|statue|fashion|video games?|television|tv series|streaming|actors?|actress|singers?|bands?)\b/gi,
    ask: ['what is the story behind it?', 'what should we make of it?', 'what is the background here?', 'what stands out to you?', 'what does it tell us?', 'what should people know about this?'],
  },
  legal: {
    covers: 'courts, rulings, trials, laws and regulators',
    label: 'LEGAL',
    categories: [],
    words: /\b(?:courts?|judges?|judgment|ruling|ruled|rules?|trial|verdict|convicted|acquitted|sentenced?|appeal\w*|lawsuit|sued|legal|lawyers?|law|laws|legislation|supreme court|high court|prosecutors?|charges?|charged|regulators?|watchdog|fined?|antitrust|competition authority|inquiry|injunction|constitution\w*)\b/gi,
    ask: ['what is the background to this case?', 'what should we make of it?', 'what is behind it?', 'what is the bigger picture?', 'what stands out to you?', 'what should people know about this?'],
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

/** Hours before an expert is booked again on the same programme (WAVE3 §11: once per 2 h, the speciality aside). */
export const REST_HOURS = 2;

/**
 * The experts who may be booked now: an expert seen on this programme in the last REST_HOURS waits, unless they
 * are its resident (config `resident`: MONEY MINUTE's economist, TECH BYTES' analyst, COSMOS DESK's scientist,
 * who are part of the format). The resident stays first; the others go the one seen longest ago first (on any
 * programme), so the bookings spread across the roster. recent = [{ id, programId, at }] (ms).
 */
export function restedExperts(program, experts, recent = [], now = Date.now()) {
  const rest = REST_HOURS * 3600_000;
  const lastOn = (id, pid) => Math.max(-Infinity, ...recent.filter((r) => r.id === id && (!pid || r.programId === pid)).map((r) => r.at));
  const resident = program?.resident || null;
  const free = experts.filter((e) => e.id === resident || now - lastOn(e.id, program?.id) >= rest);
  const order = new Map(experts.map((e, i) => [e.id, i]));
  return free.sort((a, b) => (b.id === resident) - (a.id === resident) || lastOn(a.id) - lastOn(b.id) || order.get(a.id) - order.get(b.id));
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
/**
 * One of `list`: with a turn (a number), the forms in order from a fixed start per kind (`kind`), so that the
 * station's successive analyses walk through them all before one repeats; without, by the seed's hash.
 */
const choose = (list, seed, turn, kind) => list[(Number.isFinite(turn) ? turn + hash(kind) : hash(`${seed}~${kind}`)) % list.length];

/** The presenter's introduction of the expert, after the story (one sentence). */
export function introLine(e, seed, turn) {
  const role = e.role || 'expert';
  return choose(
    [
      `Our ${role}, ${e.name}, is with us.`,
      `${e.name}, our ${role}, joins us.`,
      `With us is our ${role}, ${e.name}.`,
      `Let's bring in our ${role}, ${e.name}.`,
      `Our ${role}, ${e.name}, joins us now.`,
      `We're joined by our ${role}, ${e.name}.`,
      `Let's hear from our ${role}, ${e.name}.`,
      `Joining us is our ${role}, ${e.name}.`,
      `I'm joined by our ${role}, ${e.name}.`,
      `Our ${role}, ${e.name}, has been following this.`,
    ],
    seed,
    turn,
    'intro'
  );
}

// A grave story's questions (decision 3, owner 12 Oct: grave news "se presenta con respeto pero bien"): the background
// and what happens now, never "how big a deal", never a guess at causes or blame
export const GRAVE_ASK = ['what is the background to this?', 'what do we know so far?', 'what more do we know?', 'what is the picture so far?', 'what else do we know at this stage?'];

/** The presenter's first question, addressed by first name (one sentence, a question); a grave story's are sober. */
export function questionLine(e, seed, question = null, turn, { grave = false } = {}) {
  const q = question || choose(grave ? GRAVE_ASK : EXPERT_DESKS[e.desk]?.ask || ['what should we make of it?'], seed, turn, grave ? 'grave-ask' : 'ask');
  return `${e.first}, ${q}`;
}

/** The presenter's follow-up, fitted to what the answer says: what comes next, else what else matters. */
export function followLine(e, seed, answer = '', turn) {
  const list = AHEAD.test(answer)
    ? [`And ${e.first}, what happens next?`, `${e.first}, what comes next?`, `What should we watch for, ${e.first}?`, `And what comes after that, ${e.first}?`, `${e.first}, when will we know more?`, `So what happens now, ${e.first}?`]
    : [`${e.first}, what else should people know?`, `And what else stands out, ${e.first}?`, `${e.first}, anything else we should know?`, `What else is worth knowing, ${e.first}?`, `And ${e.first}, what else is in the detail?`, `${e.first}, is there more to it?`];
  return choose(list, seed, turn, AHEAD.test(answer) ? 'ahead' : 'more');
}

/** The presenter's thanks. */
export function thanksLine(e, seed, turn) {
  return choose([`${e.name}, thank you.`, `${e.first}, thank you.`, `Thank you, ${e.first}.`, `${e.first}, thanks for joining us.`, `Thanks very much, ${e.first}.`, `${e.name}, thanks for that.`], seed, turn, 'thanks');
}

/**
 * A short spoken frame before an expert's first answer, when the offline writer builds it from the source ("The key
 * detail is this:"); null for no frame at all (one turn in four or so: a frame on every answer would be a tic).
 */
export function answerFrame(seed, turn, { grave = false } = {}) {
  // a grave story's answer starts plainly, or on what is known (never "what stands out")
  if (grave) return choose(['What we know is this:', null, null, 'The background is this:', null], seed, turn, 'grave-frame');
  return choose(['The key detail is this:', 'What stands out is this:', null, 'Here is what matters:', 'The thing to note is this:', null, 'Put simply:', 'The important part is this:', null], seed, turn, 'frame');
}

/** The strap's kicker for an expert: their title in capitals (the name is the strap's headline). */
export const expertKicker = (e) => String(e.role || 'Analyst').toUpperCase();

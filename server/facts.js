// Fact helpers shared by the bulletin validator and the offline writer: finds
// the figures, quotations and tone of a story in its feed text, and checks
// that what a writer puts on screen or says (a number, a quote, a label) is
// really in the source. Everything here is deliberately conservative: when in
// doubt, a graphic or a sentence is dropped rather than aired with something
// the source never said.

import { findPlaces, lookupPlace, placeSupported } from './gazetteer.js';

// Grave news: no jokes, no light gestures, no "and finally" slot.
// Natural disasters and accidents count as much as violence: a hurricane landfall is never the number of the day.
export const GRAVE =
  /\b(?:dead|deaths?|die[sd]?|dying|killed|killings?|kills?|war|wars|attacks?|victims?|murder\w*|shootings?|earthquakes?|fires?|wildfires?|blaze|crash\w*|violen\w*|injur\w*|bomb\w*|strikes? on|crisis|floods?|flooded|flooding|hostages?|famine|casualt\w*|missing|evacuat\w*|disaster\w*|tragedy|mourn\w*|funeral|cancer|outbreak|epidemic|pandemic|hurricanes?|typhoons?|cyclones?|tornado(?:es|s)?|tsunamis?|landslides?|mudslides?|avalanches?|droughts?|heatwaves?|heat waves?|collaps\w*|derail\w*|capsiz\w*|sinks|sank|sunk|sinking|drown\w*|cholera|landfall|life-threatening|storm surge|explosions?|blasts?|refugees?|displaced|shipwreck\w*|starvation|massacre\w*|genocide|ceasefire|airstrikes?|shelling|rescuers?|red alert|heat alert|extreme heat|state of emergency)\b/i;
// Lighter material: technology, science, curiosities.
export const LIGHT =
  /\bAI\b|robot|\bchips?\b|phone|\bapps?\b|software|\bspace\b|nasa|planet|science|scientist|discover|study finds|telescope|\bgames?\b|record|festival|zoo|panda|penguin|dinosaur|fossil|museum|trees?\b|garden|bicycle|bike|tram|train|music|chocolate|coffee|parrot|whale|dolphin|stars?\b|comet|moon|reef|coral|tortoises?|leopards?|mangroves?|tomatoes|drones/i;

// Words that look grave but are not, in these senses: a startup "fires its CEO", a manager "was fired", a
// "fire drill", a government or a deal that "collapses".
const NOT_GRAVE_SENSES = [
  /\bfire[sd]?\s+(?:its|his|her|their|the|a|an|two|three|several|hundreds of|thousands of)\s+(?:[\w-]+\s+){0,2}(?:ceo|chief\w*|boss|coach|manager|staff|workers|employees|director|head|executive|minister|adviser|advisor|founder|chairman|chairwoman|editor|players?)\b/gi,
  /\b(?:was|were|been|be|is|are|got|get|gets|getting)\s+fired\b/gi,
  /\bfire\s+(?:drills?|alarm tests?|exercises?|safety)\b/gi,
  /\b(?:government|coalition|talks|deal|negotiations|prices?|shares|stocks?|market|currency|company|firm|bank|league|plan|bid)\s+collaps\w*/gi,
];
// What says a grave-sounding event harmed no one ("Moderate earthquake shakes northern Chile, no damage reported").
const HARM_NEGATED = /\b(?:no (?:reports? of )?(?:damage|injuries|injured|casualties|deaths|victims)(?:\s+(?:or|and|nor)\s+(?:damage|injuries|injured|casualties|deaths|victims))?|no one (?:was )?(?:hurt|injured|killed)|nobody (?:was )?(?:hurt|injured|killed)|without (?:injuries|casualties)|false alarm|(?:a|the) drill\b)/gi;
// What says people were harmed or are at risk: it raises the severity of grave news.
const HARM = /\b(?:dead|deaths?|died|die|killed|kills|injur\w*|hurt|evacuat\w*|displaced|missing|homeless|without (?:power|electricity|water)|(?:cuts?|knocks? out|cut) (?:power|electricity)|blackouts?|casualt\w*|victims?|life-threatening|red alert|state of emergency|shelters?|relief camps?)\b/i;
const withoutLookalikes = (text) => NOT_GRAVE_SENSES.reduce((t, re) => t.replace(re, ' '), String(text ?? ''));

/**
 * Grave news? A grave word in its grave sense ("Startup fires its CEO" is
 * not), unless the opening says nobody was harmed and nothing says anyone
 * was ("...earthquake shakes northern Chile, no damage reported").
 */
export function isGrave(text) {
  const t = withoutLookalikes(text);
  if (!GRAVE.test(t)) return false;
  const opening = t.slice(0, 320);
  HARM_NEGATED.lastIndex = 0;
  if (HARM_NEGATED.test(opening) && !HARM.test(t.replace(HARM_NEGATED, ' '))) return false;
  return true;
}

/**
 * How grave a story is, for the running order and the tone: 0 not grave,
 * 2 grave, 3 grave with people harmed or at risk (deaths, injuries,
 * evacuations, homes without power, a red alert, a state of emergency).
 */
export function severity(text) {
  if (!isGrave(text)) return 0;
  return HARM.test(withoutLookalikes(text).replace(HARM_NEGATED, ' ')) ? 3 : 2;
}

/** A grave-sounding story whose opening says nobody was harmed: sober news, never grave, never light. */
export const harmlessIncident = (text) => GRAVE.test(withoutLookalikes(text)) && !isGrave(text);

// A sentence that leans on the one before it: a pronoun ("It runs along the river."), or a definite common
// noun that points back ("The canal authority says...", "Astronomers say the shadow will cross..."). Such a
// sentence never opens a story or a round-up item, and the sentence it leans on is never dropped before it.
const PRONOUN_OPENING = /^(?:It|Its|They|Their|Them|This|These|Those|He|She|His|Her|Such)\b/;
const DEFINITE_OPENING = /^The (?!(?:[a-z][\w-]*\s+)?of\s+\p{Lu})[a-z][\w-]*/u;
const SAYS_THE = /^(?:[\p{L}'’-]+\s+){1,4}(?:say|says|said|believe|believes|expect|expects|think|thinks|warn|warns)\s+(?:that\s+)?(?:the|its|their)\s+[a-z]/u;
// "Adults and children walked there together": a "there" that points at a place said before (not the
// existential "there is/are/were...").
const THERE_DEIXIS = /(?<![\p{L}])(?<!\b(?:hello|hi|hey|out|over|up|down|in|from|here and|you)\s)there(?![\p{L}])(?!\s+(?:is|are|was|were|will|would|has|have|had|could|can|may|might|must|should|seems?|seemed|appears?|appeared|remains?|remained|used|isn['’]t|aren['’]t|wasn['’]t|weren['’]t)\b)(?!['’]s\b)/iu;
/** Narrower: a sentence that points back at something said before (a pronoun opening, a "there"): it can never open a story. */
export const pointsBack = (sentence) => {
  const t = String(sentence ?? '').replace(/^(?:\s*\[[^\]]*\])+\s*/, '').trim();
  return PRONOUN_OPENING.test(t) || THERE_DEIXIS.test(t.replace(/^There\b/, ''));
};
export const leansOnPrevious = (sentence) => {
  const t = String(sentence ?? '').replace(/^(?:\s*\[[^\]]*\])+\s*/, '').trim();
  return PRONOUN_OPENING.test(t) || DEFINITE_OPENING.test(t) || SAYS_THE.test(t) || THERE_DEIXIS.test(t.replace(/^There\b/, ''));
};

const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[’‘‚‛`]/g, "'")
    .replace(/[–—]/g, '-')
    .toLowerCase();

const SCALE = { thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };
const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD_NUMBERS = { ...UNITS, ...TENS, hundred: 100, dozen: 12 };
const WORD_SCALE = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
// "Hundreds of people": a count the source must give in the same words.
const QUANTIFIERS = /\b(?:dozens|scores|hundreds|thousands|tens of thousands|hundreds of thousands|millions|billions)\b/g;

// Currencies, by family: "$" and "dollars" agree, "£" and "dollars" do not.
const SYMBOL_CURRENCY = { $: 'dollar', '£': 'pound', '€': 'euro', '¥': 'yen' };
const CURRENCY_WORD_RE =
  /^\s*(?:(?:US|U\.S\.|American|Australian|Canadian|Hong Kong|New Zealand|Singapore)\s+)?(dollars?|pounds?(?: sterling)?|euros?|yen|yuan|renminbi|rupees?|pesos?|francs?|reais|rand|naira|shillings?|won|baht|rupiah|lira|kroner|kronor|krona|zloty|dirhams?|riyals?)\b/i;
const currencyFamily = (word) => {
  const w = String(word).toLowerCase();
  if (w.startsWith('dollar')) return 'dollar';
  if (w.startsWith('pound')) return 'pound';
  if (w.startsWith('euro')) return 'euro';
  if (w === 'yuan' || w === 'renminbi') return 'yuan';
  return w.replace(/s$/, '');
};
const sameCurrency = (a, b) => a === b || (a === 'yen' && b === 'yuan') || (a === 'yuan' && b === 'yen');

// A figure as written in news copy: "$2.5bn", "40,000", "7.1", "30 percent", "3,000-year-old", "1.2 million".
// One-letter scales only count when glued to the figure ("£3m", "5k"): "6 m" is six metres.
const NUMBER_RE =
  /(?<![\w.,:])([$£€¥]\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(?:\s|-)?(%|per ?cent\b))?(?:(?:\s|-)?(thousand|million|billion|trillion|bn|mn|tn)\b|(k|m|b)\b)?/gi;

/**
 * Every number in a text as { raw, value, scaled, index, end, percent,
 * currency ('dollar' | 'pound' | ... | null), unit (scale word) }.
 */
export function numbersIn(text) {
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(NUMBER_RE)) {
    const value = Number((m[2] + (m[3] || '')).replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    // "£3m" is three million; "a depth of 2m" is two metres: a glued one-letter scale needs a currency symbol.
    const unit = (m[5] || (m[1] ? m[6] : '') || '').toLowerCase();
    const end = m.index + m[0].length;
    const after = s.slice(end, end + 40).match(CURRENCY_WORD_RE);
    const currency = m[1] ? SYMBOL_CURRENCY[m[1].trim()] : after ? currencyFamily(after[1]) : null;
    const ordinal = /^(?:st|nd|rd|th)\b/i.test(s.slice(end, end + 3));
    out.push({ raw: m[0].trim(), value, scaled: SCALE[unit] ? value * SCALE[unit] : value, index: m.index, end, percent: !!m[4], currency, unit, ...(ordinal ? { ordinal: true } : {}) });
  }
  return out;
}

const WORD_TOKEN_RE = /[a-z]+(?:-[a-z]+)?/g;

/**
 * Numbers written as words: "two", "twenty-five", "a dozen", "two thousand",
 * "half a million". "one" on its own is skipped (it is usually a pronoun: "one
 * of", "no one"). Returns the same shape as numbersIn, plus `words: true`.
 */
export function numberWordsIn(text, { skipOne = true } = {}) {
  const s = fold(text);
  const toks = [...s.matchAll(WORD_TOKEN_RE)].map((m) => ({ w: m[0], index: m.index, end: m.index + m[0].length }));
  const out = [];
  let i = 0;
  while (i < toks.length) {
    const start = i;
    let value = null;
    let scale = 1;
    let j = i;
    const t = toks[j].w;
    const parts = t.split('-');
    if (t === 'half' && toks[j + 1]?.w === 'a' && WORD_SCALE[toks[j + 2]?.w] >= 1e3) {
      value = 0.5;
      scale = WORD_SCALE[toks[j + 2].w];
      j += 3;
    } else if ((t === 'a' || t === 'an') && (toks[j + 1]?.w === 'dozen' || WORD_SCALE[toks[j + 1]?.w]) && !/\d/.test(s.slice(toks[j].end, toks[j + 1].index))) {
      value = toks[j + 1].w === 'dozen' ? 12 : 1;
      scale = toks[j + 1].w === 'dozen' ? 1 : WORD_SCALE[toks[j + 1].w];
      j += 2;
    } else if (parts.length === 2 && TENS[parts[0]] && UNITS[parts[1]] && UNITS[parts[1]] < 10) {
      value = TENS[parts[0]] + UNITS[parts[1]]; // "twenty-five"
      j += 1;
    } else if (t in WORD_NUMBERS && t !== 'hundred') {
      value = WORD_NUMBERS[t];
      j += 1;
      if (TENS[t] && UNITS[toks[j]?.w] && UNITS[toks[j].w] < 10 && toks[j].index === toks[j - 1].end + 1) {
        value += UNITS[toks[j].w]; // "twenty five"
        j += 1;
      }
    } else if (parts.length === 2 && parts[0] in WORD_NUMBERS && !/^(?:half|halves|thirds?|quarters?|fifths?|tenths?)$/.test(parts[1])) {
      value = WORD_NUMBERS[parts[0]]; // "ten-year" (not a fraction: "two-thirds")
      j += 1;
    }
    if (value === null) {
      i++;
      continue;
    }
    // "two hundred", "three thousand", "two hundred thousand"
    while (WORD_SCALE[toks[j]?.w]) {
      if (toks[j].w === 'hundred') value *= 100;
      else scale = WORD_SCALE[toks[j].w];
      j += 1;
    }
    const raw = s.slice(toks[start].index, toks[j - 1].end);
    const single = j - start === 1;
    if (!(skipOne && single && /^(?:one|zero)(?:-[a-z]+)?$/.test(raw))) {
      out.push({ raw, value, scaled: value * scale, index: toks[start].index, end: toks[j - 1].end, percent: /^\s*(?:%|per ?cent)/.test(s.slice(toks[j - 1].end, toks[j - 1].end + 9)), currency: null, unit: scale > 1 ? 'word' : '', words: true });
    }
    i = j;
  }
  return out;
}

// Words that are not the "thing counted" after a figure.
const NOUN_SKIP = new Set(
  'a an the of more than new extra additional other some about around nearly almost over under up to per cent percent and or in on at for from by with as its their his her this that these those million billion thousand trillion hundred bn mn tn year-old'.split(' ')
);
// A verb right after a figure means the figure counts nothing named after it: "magnitude 6.1 has hit",
// "6.1 struck", "3 percent rose" (the house tense on air is the present perfect: "has hit", "was felt").
const VERB_AFTER_FIGURE = new Set(
  ('is are was were be been being has have had will would could can may might must should shall did does do ' +
    'hit hits struck strikes rose rises fell falls won wins lost loses reached reaches topped tops passed passes crossed ' +
    'crosses shook shakes rocked rocks jolted jolts came comes went goes made makes took takes remained remains stood ' +
    'stands left leaves fell felt hit rattled rattles followed follows occurred occurs happened happens').split(' ')
);
// Words that name the same counted thing in different terms ("a 6.1 quake" for "an earthquake of magnitude 6.1").
const SYNONYMS = [['quake', 'earthquake', 'tremor', 'magnitude'], ['people', 'persons', 'residents', 'inhabitants']];
const synonyms = (a, b) => SYNONYMS.some((set) => set.includes(a) && set.includes(b));
const wordsAround = (s, index, end, before, after) => {
  const head = fold(s.slice(Math.max(0, index - 60), index)).match(/[a-z][a-z'-]*/g) || [];
  const tail = fold(s.slice(end, end + 80)).match(/[a-z][a-z'-]*/g) || [];
  return { before: head.slice(-before), after: tail.slice(0, after) };
};
/** The thing a figure counts ("120 people" -> "people"), from the next few words of the same phrase. */
function countedNoun(s, n) {
  // "an earthquake of magnitude 6.1": the scale is named before the figure.
  const before = fold(s.slice(Math.max(0, n.index - 24), n.index)).match(/\b(magnitude|index|score|rate)\s+(?:of\s+)?$/);
  if (before) return before[1];
  const phrase = s.slice(n.end, n.end + 80).replace(/^(?:st|nd|rd|th)\b/i, '').split(/[,;:.!?()“”"]/)[0];
  const after = (fold(phrase).match(/[a-z][a-z'-]*/g) || []).slice(0, 4);
  for (const w of after) {
    const word = w.replace(/^-+/, '');
    if (!word || NOUN_SKIP.has(word) || CURRENCY_WORD_RE.test(word)) continue;
    if (VERB_AFTER_FIGURE.has(word)) return null;
    return word;
  }
  return null;
}

// Crude stemming: "passengers" ~ "passenger", "evacuated" ~ "evacuation", "homes" ~ "home".
const stemMatch = (a, b) => {
  if (a.length < 4 || b.length < 4) return false;
  const k = Math.max(4, Math.min(a.length, b.length) - 3);
  return a.slice(0, k) === b.slice(0, k);
};
export const sameWord = (a, b) => a === b || stemMatch(a.replace(/-.*$/, ''), b.replace(/-.*$/, '')) || stemMatch(a, b);

const ORDINAL_WORDS = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30, fiftieth: 50, hundredth: 100,
};
const ORDINAL_RE = new RegExp(`\\b(?:${Object.keys(ORDINAL_WORDS).join('|')})\\b`, 'g');

/** Numbers a source states: digits, number words and ordinal words ("third" for a "3rd"), each with its position. */
function sourceNumbers(source) {
  const s = String(source ?? '');
  const ordinals = [...fold(s).matchAll(ORDINAL_RE)].map((m) => ({ raw: m[0], value: ORDINAL_WORDS[m[0]], scaled: ORDINAL_WORDS[m[0]], index: m.index, end: m.index + m[0].length, percent: false, currency: null, unit: '', ordinal: true, words: true }));
  return [...numbersIn(s), ...numberWordsIn(s, { skipOne: false }), ...ordinals];
}

const close = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

/**
 * Does source number `s` support claimed number `c`? Scale, percent and
 * currency must agree ("12 million" is not "12 billion", "40%" is not "40
 * people", "£12" is not "$12"); a plain figure may match the source's figure
 * or its scaled value. When the claim names what it counts ("120 people"),
 * the source must say it next to the figure too ("120 relief camps" does not).
 */
function supports(c, s, claimText, sourceText) {
  if (c.percent !== s.percent) return false;
  // "3rd" is grounded by "third" or "3rd", never by a plain 3 (and a plain 3 never by "third").
  if (!!c.ordinal !== !!s.ordinal) return false;
  if (c.currency && (!s.currency || !sameCurrency(c.currency, s.currency))) return false;
  if (c.unit) {
    if (!close(c.scaled, s.scaled)) return false;
  } else if (!(close(c.value, s.value) || close(c.value, s.scaled))) return false;
  const noun = countedNoun(claimText, c);
  if (!noun) return true;
  // The source must count something else for this to be a mismatch: "three injured" supports
  // "three people were injured", "120 relief camps" does not support "120 people".
  const counted = countedNoun(sourceText, s);
  if (!counted || /(?:ed|ing)$/.test(counted)) return true;
  if (sameWord(noun, counted) || synonyms(noun, counted)) return true;
  // Otherwise the noun must sit in the figure's own clause ("120 relief camps for 3,000 people": no; "120 villages
  // and 5 people died": the people belong to the 5, not to the 120).
  const { before, after } = clauseAround(sourceText, s.index, s.end, 3, 5);
  return [...before, ...after].some((w) => sameWord(noun, w) || synonyms(noun, w));
}

const CLAUSE_BREAK = /[,;:.!?()]|\b(?:and|but|while|whereas|as|or|after|before|when|with)\b/;
/** Words around a figure that belong to its clause: cut at punctuation and conjunctions on both sides. */
function clauseAround(s, index, end, before, after) {
  const headText = fold(s.slice(Math.max(0, index - 60), index));
  const breakAt = Math.max(...[...headText.matchAll(new RegExp(CLAUSE_BREAK.source, 'g'))].map((m) => m.index + m[0].length), 0);
  const head = headText.slice(breakAt).match(/[a-z][a-z'-]*/g) || [];
  const tailText = fold(s.slice(end, end + 80));
  const stop = tailText.search(CLAUSE_BREAK);
  const tail = (stop >= 0 ? tailText.slice(0, stop) : tailText).match(/[a-z][a-z'-]*/g) || [];
  return { before: head.slice(-before), after: tail.slice(0, after) };
}

/**
 * True when every number in `text` is stated in `source`, with the same scale,
 * percent sign, currency and counted thing. With `words: true` (spoken text,
 * headlines) numbers written as words are checked too ("Seven people were
 * hurt" needs a seven in the source), and "hundreds"/"thousands"/... need the
 * same word in the source.
 */
export function numbersGrounded(text, source, { words = false } = {}) {
  const t = String(text ?? '');
  const claims = [...numbersIn(t), ...(words ? numberWordsIn(t) : [])];
  const quantifiers = words ? fold(t).match(QUANTIFIERS) || [] : [];
  if (!claims.length && !quantifiers.length) return true;
  const src = String(source ?? '');
  const nums = sourceNumbers(src);
  const foldedSource = fold(src);
  if (!quantifiers.every((q) => foldedSource.includes(q))) return false;
  return claims.every((c) => nums.some((s) => supports(c, s, t, src)));
}

const STOP = new Set(
  'the a an and or of to in on at for from by with as is are was were be been has have had will would can could may might its it this that these those than then into over under after before about more most new says said say also just very their them they there here what when where which who whom how why not no per day days year years week weeks month months'.split(
    ' '
  )
);

/** Content words of a text: 3+ letters, no stop words, folded to lower case. */
export function contentWords(text) {
  return (fold(text).match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => !STOP.has(w));
}

// "DOWN 2%" on a card is grounded by "dropped 2 percent" in the copy. A bare
// "up"/"down" only counts right before a figure ("up 3 percent"), not in "up to".
const DIRECTIONS = {
  down: /\b(?:fell|fallen|falls?|falling|dropped|drops?|declined?|declining|decreased?|slid|slides?|sank|slipped|eased|shrank|shrunk|shrinks?|slumped|plunged|lost|lower)\b|\bdown (?:by )?\d|\bcut (?:by )?\d/,
  up: /\b(?:rose|rises?|rising|risen|grew|grown|grows?|jumped|increased?|higher|climbed|soared|gained|surged|added)\b|\bup (?:by )?\d/,
};

// Irregular past forms, so "rose" in a headline is grounded by "rises" in the copy.
const IRREGULAR = {
  rose: 'rise', risen: 'rise', fell: 'fall', fallen: 'fall', grew: 'grow', grown: 'grow', won: 'win', lost: 'lose', sold: 'sell', bought: 'buy',
  took: 'take', taken: 'take', made: 'make', struck: 'strike', shook: 'shake', built: 'build', began: 'begin', begun: 'begin', ran: 'run',
  flew: 'fly', flown: 'fly', drew: 'draw', drawn: 'draw', saw: 'see', seen: 'see', gave: 'give', given: 'give', went: 'go', gone: 'go', came: 'come',
  kept: 'keep', left: 'leave', brought: 'bring', paid: 'pay', spent: 'spend', told: 'tell', found: 'find', held: 'hold', met: 'meet',
  led: 'lead', sent: 'send', sank: 'sink', sunk: 'sink', froze: 'freeze', broke: 'break', broken: 'break', chose: 'choose', wrote: 'write',
  written: 'write', fought: 'fight', caught: 'catch', taught: 'teach', thought: 'think', sought: 'seek', swept: 'sweep', slid: 'slide', burnt: 'burn',
};
const base = (w) => IRREGULAR[w] || w;

/**
 * Is every content word of a short claim (a headline) in the source, allowing
 * inflections ("reopens"/"reopened") and irregular verbs ("rose"/"rises")? A
 * headline may rephrase the order, never add a cause, an actor or a qualifier.
 */
export function allWordsGrounded(text, source, { ignore = [] } = {}) {
  const skip = new Set(ignore.flatMap((n) => contentWords(n)));
  const words = contentWords(text).filter((w) => !skip.has(w) && !DIRECTIONS[w]);
  const pool = contentWords(source).map(base);
  return words.every((w) => pool.some((p) => sameWord(base(w), p)));
}

// Time spans a headline may not invent ("for a week" when the source says a day).
const TIME_WORDS = /^(?:hours?|days?|weeks?|months?|years?|decades?|centur(?:y|ies)|minutes?)$/;

/**
 * A writer's headline is grounded when every content word is in the source
 * (inflections and irregular verbs allowed), time spans included, and its
 * numbers are the source's: it may rephrase the order, never add a cause, an
 * actor, a qualifier or a duration.
 */
export function headlineGrounded(text, source, { ignore = [] } = {}) {
  if (!numbersGrounded(text, source, { words: true }) || !allWordsGrounded(text, source, { ignore })) return false;
  const times = (fold(text).match(/[a-z]+/g) || []).filter((w) => TIME_WORDS.test(w));
  const pool = (fold(source).match(/[a-z]+/g) || []).filter((w) => TIME_WORDS.test(w));
  return times.every((w) => pool.some((p) => p.replace(/s$/, '') === w.replace(/s$/, '') || (w.startsWith('centur') && p.startsWith('centur'))));
}

const QUALIFIER_WORDS = /\b(about|around|roughly|approximately|some|nearly|almost|more than|over|at least|up to|less than|fewer than|under)\s+$/i;
const QUALIFIER_CLASS = { about: 'approx', around: 'approx', roughly: 'approx', approximately: 'approx', some: 'approx', nearly: 'below', almost: 'below', 'up to': 'below', 'less than': 'below', 'fewer than': 'below', under: 'below', 'more than': 'above', over: 'above', 'at least': 'above' };
const qualifierAt = (s, index) => s.slice(Math.max(0, index - 24), index).match(QUALIFIER_WORDS)?.[1]?.toLowerCase() || null;

/**
 * Does `text` put a figure in a different bracket than its source ("more than
 * 30 ships" for "about 30 ships", or "more than" where the source gives an
 * exact count)? Softening an exact figure to "about" is allowed.
 */
export function qualifierConflict(text, source) {
  const t = String(text ?? '');
  const src = String(source ?? '');
  const nums = numbersIn(src);
  for (const n of numbersIn(t)) {
    const q = qualifierAt(t, n.index);
    if (!q) continue;
    const same = nums.filter((s) => close(s.scaled, n.scaled) || close(s.value, n.value));
    if (!same.length) continue;
    const want = QUALIFIER_CLASS[q];
    const ok = same.some((s) => {
      const sq = qualifierAt(src, s.index);
      return sq ? QUALIFIER_CLASS[sq] === want : want === 'approx';
    });
    if (!ok) return true;
  }
  return false;
}

/** The qualifier the source gives a figure ("ABOUT" for "about 1.2 million"), as a card label, or null. */
export function sourceQualifier(value, source) {
  const want = numbersIn(value)[0];
  if (!want) return null;
  const src = String(source ?? '');
  for (const s of numbersIn(src)) {
    if (!(close(s.scaled, want.scaled) || close(s.value, want.value))) continue;
    const q = qualifierAt(src, s.index);
    if (q) return QUALIFIER_LABEL[q] || q.toUpperCase();
  }
  return null;
}

/** Share (0..1) of the content words of `text` that also appear in `source`. */
export function wordsGrounded(text, source) {
  const folded = fold(text);
  const words = contentWords(folded).filter((w) => !DIRECTIONS[w]);
  const directions = Object.keys(DIRECTIONS).filter((d) => new RegExp(`\\b${d}\\b`).test(folded));
  if (!words.length && !directions.length) return 1;
  const pool = contentWords(source);
  const foldedSource = fold(source);
  const hits = words.filter((w) => pool.some((p) => sameWord(w, p)));
  const dirHits = directions.filter((d) => DIRECTIONS[d].test(foldedSource));
  return (hits.length + dirHits.length) / (words.length + directions.length);
}

/**
 * A short on-screen claim (a fact, a figure label, a headline) is grounded
 * when its numbers are in the source and at least `minShare` of its words are too.
 */
export function claimGrounded(text, source, minShare = 0.5) {
  return numbersGrounded(text, source, { words: true }) && wordsGrounded(text, source) >= minShare;
}

// Quotations inside the source: “…”, "…" or ‘…’ with at least three words.
const QUOTE_RES = [/“([^”]{8,400})”/g, /"([^"]{8,400})"/g, /‘([^’]{8,300})’(?![a-z])/g];

/** Literal quotations in a text, with the speaker when the sentence names one. */
export function quotesIn(text) {
  const s = String(text ?? '');
  const out = [];
  for (const re of QUOTE_RES) {
    for (const m of s.matchAll(re)) {
      const quote = m[1].trim().replace(/[,;:]+$/, '');
      if (quote.split(/\s+/).length < 3) continue;
      if (out.some((q) => q.text === quote)) continue;
      out.push({ text: quote, by: speakerOf(s, m.index, m.index + m[0].length), index: m.index });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// "…,” the mayor said." / "…,” said Ana Silva." / "The minister said: “…”"
function speakerOf(s, start, end) {
  const after = s.slice(end, end + 80);
  const before = s.slice(Math.max(0, start - 80), start);
  const NAME = "((?:[Tt]he|[Aa]n?) [a-z][a-z' -]{2,40}?|[A-Z][\\w'’.-]+(?: [A-Z][\\w'’.-]+){0,3})";
  const a1 = after.match(new RegExp(`^\\s*,?\\s*(?:said|says|added|told reporters)\\s+${NAME}(?=[.,;]|$)`));
  if (a1) return a1[1].trim();
  const a2 = after.match(new RegExp(`^\\s*,?\\s*${NAME}\\s+(?:said|says|added)\\b`));
  if (a2) return a2[1].trim();
  const b1 = before.match(new RegExp(`${NAME}\\s+(?:said|says|added|told [a-z ]+?)[:,]?\\s*$`));
  if (b1) return b1[1].trim();
  return null;
}

const squash = (s) =>
  fold(s)
    .replace(/["']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Validate a quote a writer wants on screen: it must be (part of) a quotation
 * that is literally in the source, at least 4 words, and `by` is kept only
 * when it is the speaker the source gives for that very quotation (not just
 * any name or place the summary mentions). Returns { text, by } or null.
 */
export function groundQuote(quote, source) {
  const text = String(quote?.text ?? quote ?? '').replace(/^[\s"“”'‘’«»]+|[\s"“”'‘’«»]+$/g, '').replace(/\s+/g, ' ');
  if (!text || text.split(' ').length < 4) return null;
  const want = squash(text);
  const match = quotesIn(source).find((q) => squash(q.text).includes(want));
  if (!match) return null;
  const by = squash(quote?.by ?? '');
  const speaker = squash(match.by ?? '');
  const sameSpeaker = by && speaker && (by === speaker || by.replace(/^(?:the|a|an) /, '') === speaker.replace(/^(?:the|a|an) /, ''));
  return { text, by: sameSpeaker ? String(quote.by).trim() : null };
}

/**
 * A spoken sentence may quote only what the source quotes: every span in
 * quotation marks of three words or more must be found, word for word, in it.
 */
export function quotationsGrounded(text, source) {
  const s = String(text ?? '');
  const spans = [...s.matchAll(/“([^”]+)”|"([^"]+)"|‘([^’]+)’(?![a-z])/g)].map((m) => m[1] || m[2] || m[3]);
  // Straight single quotes too: 'a complete disaster' (opened after a space or bracket, closed before a
  // space or punctuation, so a contraction such as "it's" or "the workers' union" is never a quotation).
  for (const m of s.matchAll(/(?:^|[\s([{“"—–-])'([^'\n]{6,300}?)'(?=[\s.,;:!?)\]}”"—–-]|$)/g)) spans.push(m[1]);
  const src = squash(source);
  return spans.every((q) => squash(q).split(' ').length < 3 || src.includes(squash(q)));
}

// ---------------------------------------------------------------- figures for the offline writer

const LABEL_STOP = new Set(
  'and or but of to by in on at for from with than that which who whom is are was were will would has have had said says say over past since during into after before while as its their his her this these those the about around nearly almost some when where if because until unless so yet once then there here now again also only even just still can could may might should must across through between against last next every each off away below above beneath'.split(
    ' '
  )
);
const MONTHS = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;
const IRREGULAR_PAST = new Set('shook rose fell grew took made hit struck began won lost left came went gave saw found kept became brought built sold paid spent set put ran drew flew'.split(' '));
const QUALIFIER_RE = /\b(about|around|nearly|almost|roughly|approximately|some|more than|over|up to|at least|less than|fewer than|under)\s+$/i;
const QUALIFIER_LABEL = { some: 'ABOUT', roughly: 'ABOUT', approximately: 'ABOUT', around: 'ABOUT', over: 'MORE THAN', 'fewer than': 'LESS THAN', under: 'LESS THAN' };
const DOWN_BEFORE = /\b(?:fell|fallen|falls?|dropped|drops?|down|cut|decreased|declined|slid|slipped|eased|lost|shed|shrank|shrunk|shrinks?|slumped|plunged|sank|fall of|drop of|decline of)\s+(?:by\s+)?$/;
const UP_BEFORE = /\b(?:rose|risen|rises?|(?<!made )up|grew|grown|grows?|jumped|increased|climbed|gained|surged|soared|added|rise of|increase of|jump of)\s+(?:by\s+)?$/;
const AUX = new Set('has have had is are was were be been will would could can may might should did does do'.split(' '));
const SUBJECT_SKIP = new Set('the a an its their his her this that these those our your new large small big main major global total average annual overall national local key it they he she we you'.split(' '));

/**
 * The noun phrase a percentage is about: "The index has gained 21 percent" ->
 * "INDEX"; "Oil prices fell 2 percent" -> "OIL PRICES"; "the cost of shipping
 * ... has fallen by 20 percent" -> "COST". Null when it is not clear.
 */
function subjectBefore(s, index) {
  const clauseStart = Math.max(
    s.lastIndexOf('. ', index),
    s.lastIndexOf(', ', index),
    s.lastIndexOf('; ', index),
    ...[...s.slice(0, index).matchAll(/\b(?:says?|said|found|finds|shows?|showed|reports?|reported|that)\s+/g)].map((m) => m.index + m[0].length - 2)
  );
  const clause = s.slice(clauseStart + 1, index).trim();
  const words = clause.split(/\s+/).filter(Boolean);
  const out = [];
  for (const [k, raw] of words.entries()) {
    const w = raw.replace(/[^A-Za-z'’-]/g, '');
    const lw = w.toLowerCase().replace(/['’]s$/, '');
    if (!w) break;
    if (SUBJECT_SKIP.has(lw)) continue;
    if (lw === 'of' && out.length === 1) {
      // "the cost of shipping" -> SHIPPING COST: the noun after "of" says what the head is the cost of
      const next = (words[k + 1] || '').replace(/[^A-Za-z-]/g, '').toLowerCase();
      if (next && !SUBJECT_SKIP.has(next) && !LABEL_STOP.has(next) && !AUX.has(next) && next.length > 2) out.unshift(next);
      break;
    }
    if (AUX.has(lw) || LABEL_STOP.has(lw) || /ed$/.test(lw) || IRREGULAR_PAST.has(lw) || DOWN_BEFORE.test(`${lw} `) || UP_BEFORE.test(`${lw} `)) break;
    out.push(lw.replace(/['’]s$/, ''));
    if (out.length >= 2) break;
  }
  // "Tokyo's main stock index" -> keep the head noun, not the owner
  return out.length ? out.join(' ').toUpperCase() : null;
}

// A label that is only a counting word says nothing ("2 MILLION UNITS"): the thing counted and its verb do.
const COUNT_ONLY = /^(?:UNITS?|ITEMS?|COPIES|PIECES|TIMES|PIECES)$/;
const COUNT_VERB = /\b(sold|shipped|delivered|made|built|produced|downloaded|registered|bought|ordered|installed|streamed)\s+(?:about\s+|nearly\s+|more than\s+|over\s+|some\s+|almost\s+)?$/i;
// A figure that is a finding ("2 degrees cooler") beats the size of a sample ("a study of 90 cities").
const COMPARATIVE = /\b(?:cooler|warmer|hotter|colder|higher|lower|faster|slower|cheaper|dearer|bigger|smaller|longer|shorter|fewer|less|more)\b/i;
const SAMPLE_BEFORE = /\b(?:study|survey|analysis|sample|review|poll|census) of\s+(?:about\s+|nearly\s+|more than\s+|some\s+)?$/i;
const plural = (w) => (/(?:s|x|ch|sh)$/.test(w) ? w : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

/** "A new games console sold 2 million units" -> "CONSOLES SOLD"; null when the counted thing is not clear. */
function countedLabel(s, index) {
  const before = s.slice(Math.max(0, index - 80), index);
  const verb = before.match(COUNT_VERB);
  if (!verb) return null;
  // the noun right before the verb is what was counted ("a new handheld games console sold" -> console)
  const noun = (before.slice(0, verb.index).trim().split(/\s+/).pop() || '').replace(/[^A-Za-z-]/g, '').toLowerCase();
  if (!noun || noun.length < 3 || LABEL_STOP.has(noun) || SUBJECT_SKIP.has(noun) || AUX.has(noun)) return null;
  return `${plural(noun)} ${verb[1]}`.toUpperCase();
}

const TIME_UNIT = /^(?:DAYS?|HOURS?|MINUTES?|SECONDS?|WEEKS?|MONTHS?|YEARS?|DECADES?)$/;
// Labels that are only a unit of measure or of time.
const UNIT_ONLY = /^(?:KM|KMS|KILOMETRES?|KILOMETERS?|MILES?|MPH|KPH|KM\/H|KMH|METRES?|METERS?|M|CM|MM|FEET|FOOT|FT|INCH(?:ES)?|C|F|°C|°F|DEGREES?(?: CELSIUS| FAHRENHEIT)?|CELSIUS|KG|KILOGRAMS?|TONNES?|TONS?|LITRES?|DAYS?|HOURS?|MINUTES?|SECONDS?|WEEKS?|MONTHS?|YEARS?|DECADES?|KNOTS?|HECTARES?|ACRES?)$/;
const MEASURE_SKIP = new Set('a an the of at to up by about around nearly almost some over under reached reaching hit hitting topped topping rose fell rising falling with was were is are has had have more than less just only its their his her this that which'.split(' '));
/** The noun a measurement belongs to, from the few words before the figure ("winds of" -> WINDS), or null. */
function measuredBefore(s, index) {
  const words = s.slice(Math.max(0, index - 50), index).split(/[,;:.!?()]/).pop().trim().split(/\s+/).filter(Boolean);
  let of = false;
  for (let i = words.length - 1; i >= Math.max(0, words.length - 4); i--) {
    const w = words[i].replace(/[^A-Za-z-]/g, '').toLowerCase();
    if (w === 'of') of = true;
    if (!w || MEASURE_SKIP.has(w)) continue;
    // Only "<noun> of <figure>" names what is measured ("winds of 130 mph"); "will take 3 years" does not.
    if (!of || w.length < 4 || /(?:ed|ly|ing)$/.test(w)) return null;
    return w.toUpperCase();
  }
  return null;
}

/**
 * Figures stated in a text, best first, for a fact card: each is
 * { value: "40,000", label: "PASSENGERS A DAY", fact: "40,000 PASSENGERS A DAY",
 *   said: "40,000 passengers a day" (as written, for speech), score,
 *   qualifier?: "ABOUT", age?: true }.
 * The label is the words around the figure in the source, so nothing is
 * paraphrased. Bare years, dates, times, ordinals and bare numbers are skipped;
 * a percentage needs a direction or the thing it measures.
 */
export function extractFigures(text, max = 3) {
  const s = String(text ?? '');
  const figures = [];
  for (const n of numbersIn(s)) {
    const isYear = !n.currency && !n.percent && !n.unit && Number.isInteger(n.value) && n.value >= 1900 && n.value <= 2100 && !/,/.test(n.raw);
    if (isYear) continue;
    const rest = s.slice(n.end);
    if (/^(?:st|nd|rd|th)\b/i.test(rest) || /^:\d/.test(rest)) continue; // ordinals, clock times
    const glued = /^-[A-Za-z]/.test(rest); // "3,000-year-old temple"
    const tokens = (rest.match(/^[\s-]*([^.;:!?()]*)/)?.[1] || '').split(/\s+/).filter(Boolean);
    if (tokens[0] && MONTHS.test(tokens[0]) && n.value <= 31) continue; // "12 March"
    const label = [];
    for (let i = 0; i < tokens.length; i++) {
      const w = tokens[i];
      const word = w.replace(/[^A-Za-z'-]/g, '');
      if (!word) break;
      const lw = word.toLowerCase();
      const next = (tokens[i + 1] || '').replace(/[^A-Za-z]/g, '').toLowerCase();
      if ((lw === 'a' || lw === 'per') && label.length && /^(?:hour|day|week|month|year)$/.test(next)) {
        label.push(lw, next); // "40,000 passengers a day"
        break;
      }
      if (n.percent && !label.length && lw === 'of' && next && !LABEL_STOP.has(next)) {
        // "62 percent of traders", "17 percent of new cars"
        const third = (tokens[i + 2] || '').replace(/[^A-Za-z]/g, '').toLowerCase();
        const ends = /[,.;:!?]$/.test(tokens[i + 1] || '');
        const describes = /^(?:new|all|young|older|small|large|local|rural|urban|adult|online|first-time)$/.test(next);
        label.push('of', next, ...(describes && third && !ends && !LABEL_STOP.has(third) ? [third] : []));
        break;
      }
      if (LABEL_STOP.has(lw)) break;
      if (label.length && (/[a-z]ed$/.test(lw) || IRREGULAR_PAST.has(lw))) break; // "160 million passengers used the network": stop at the verb
      label.push(word);
      if (label.length >= 3 || /[,]$/.test(w)) break;
    }
    const value = n.raw.replace(/\s?per ?cent$/i, '%').replace(/\s+/g, ' ').toUpperCase();
    const before = s.slice(Math.max(0, n.index - 40), n.index);
    const lowBefore = before.toLowerCase();
    // "a magnitude 5.8 earthquake": the scale is named before the figure
    if (/\bmagnitude\s*$/i.test(before)) {
      figures.push({ value, label: 'MAGNITUDE', fact: `MAGNITUDE ${value}`, said: `magnitude ${n.raw}`, score: 4, index: n.index });
      continue;
    }
    const q = before.match(QUALIFIER_RE)?.[1]?.toLowerCase();
    const qualifier = q ? QUALIFIER_LABEL[q] || q.toUpperCase() : '';
    const direction = DOWN_BEFORE.test(lowBefore) ? 'DOWN' : UP_BEFORE.test(lowBefore) ? 'UP' : '';
    let labelText = label.join(' ').toUpperCase();
    let core;
    if (n.percent && !labelText) {
      // A bare percentage says nothing: name what moved ("INDEX UP 21%"), or drop it.
      // Without a direction the subject may not be what the figure measures ("the central bank ... at 3.5 percent").
      const subject = direction ? subjectBefore(s, n.index) : null;
      if (!direction) continue;
      labelText = [subject && subject.length <= 16 ? subject : '', direction].filter(Boolean).join(' ');
      core = `${labelText} ${value}`;
    } else {
      if (!labelText && !n.percent && !n.currency && !n.unit) continue; // a bare number says nothing
      core = [direction, `${value}${labelText ? (glued ? '-' : ' ') + labelText : ''}`].filter(Boolean).join(' ');
      labelText = [direction, labelText].filter(Boolean).join(' ');
    }
    // A unit is not a subject: "30 KM" or "130 MPH" says nothing on a card. Name what is measured from the words
    // just before the figure ("a depth of 30 km" -> DEPTH 30 KM, "winds of 130 mph" -> WINDS 130 MPH), or skip it.
    if (!n.percent && !n.currency && UNIT_ONLY.test(labelText)) {
      // A duration is not a card ("3 YEARS").
      if (TIME_UNIT.test(labelText)) continue;
      const subject = measuredBefore(s, n.index);
      if (!subject) continue;
      figures.push({ value: `${value} ${labelText}`.slice(0, 12), label: subject, fact: [subject, qualifier, value, labelText].filter(Boolean).join(' '), said: `${q ? `${q} ` : ''}${n.raw}${label.length ? ` ${label.join(' ')}` : ''}`, score: 2, index: n.index, ...(qualifier ? { qualifier } : {}) });
      continue;
    }
    // "2 MILLION UNITS": the counted thing and its verb instead ("2 MILLION CONSOLES SOLD"), or no card
    if (!n.percent && !n.currency && COUNT_ONLY.test(labelText)) {
      const counted = countedLabel(s, n.index);
      if (!counted) continue;
      labelText = counted;
      core = [direction, `${value} ${counted}`].filter(Boolean).join(' ');
    }
    const fact = [qualifier, core].filter(Boolean).join(' ');
    let score = 1;
    if (COMPARATIVE.test(labelText)) score += 2.5;
    if (SAMPLE_BEFORE.test(lowBefore)) score -= 1.5;
    if (n.value >= 1000 || n.unit) score += 2;
    if (n.percent || n.currency) score += 1.5;
    if (label.length || (n.percent && labelText)) score += 1;
    if (n.value < 10 && !n.percent && !n.currency && !n.unit) score -= 1;
    const age = /^(?:-?YEARS? (?:AGO|OLD)|-?YEAR-OLD)/.test(labelText) || /^-year-old/i.test(rest);
    const said = `${q ? `${q} ` : ''}${n.raw}${label.length ? (glued ? '-' : ' ') + label.join(' ') : ''}`;
    figures.push({ value, label: labelText, fact, said, score, index: n.index, ...(qualifier ? { qualifier } : {}), ...(age ? { age: true } : {}) });
  }
  const seen = new Set();
  return figures
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((f) => (seen.has(f.value) ? false : seen.add(f.value)))
    .slice(0, max)
    .map(({ index, ...f }) => f);
}

// ---------------------------------------------------------------- invented actors and causes

// Words that frame a sentence rather than carry its facts.
const FRAME_WORDS = new Set(
  ('reports reported report reporting says said say saying according told tells officials announced announces confirmed confirms added adds stated meanwhile however also still now today tonight yesterday here there such other another latest news story stories update updates developing breaking finally first next number thanks thank put ' +
    // figures and their qualifiers are checked by numbersGrounded and qualifierConflict
    'some about around nearly almost roughly approximately least less fewer than over under hundred hundreds thousand thousands million millions billion billions trillion dozen dozens percent per cent half').split(' ')
);
// A title that names a person or office ("President X", "Minister Y").
const TITLE_RE = /\b(?:President|Prime Minister|Minister|Chancellor|Governor|Mayor|Senator|General|King|Queen|Prince|Princess|Pope|Judge|Justice|Secretary|Ambassador|Commissioner|Chief Executive|Chairman|Chairwoman|Director|Professor|Dr|Sheikh|Sultan|Emperor|Premier)\.?\s+(?=\p{Lu})/u;
// "..., the mayor said" / "Ana Silva says" / "according to the ministry".
// Speaker verbs, singular and plural ("the mayor says", "police say", "engineers warn", "officials believe").
const SAY_VERB = '(?:said|says|say|told|tells|tell|added|adds|warned|warns|warn|insisted|insists|insist|confirmed|confirms|confirm|explained|explains|explain|believe|believes|believed|expect|expects|expected|claim|claims|claimed|blame|blames|blamed|estimate|estimates|estimated|announced|announces|announce|reported|reports|report)';
const SPEAKER_RES = [
  new RegExp(`(?:^|[,;]\\s*)((?:the |an? )?[a-z][a-z' -]{2,40}?|\\p{Lu}[\\p{L}'’.-]+(?: \\p{Lu}[\\p{L}'’.-]+){0,3})\\s+${SAY_VERB}\\b`, 'u'),
  /\b(?:said|says|added|warned)\s+((?:the |an? )[a-z][a-z' -]{2,30}?|\p{Lu}[\p{L}'’.-]+(?: \p{Lu}[\p{L}'’.-]+){0,3})(?=[.,;]|$)/u,
  /\baccording to\s+((?:the |an? )?[\p{L}][\p{L}' -]{2,40}?)(?=[.,;]|$)/u,
];
// What a sentence blames: "caused by X", "after an X", "due to X", "blamed on X", "because X".
const CAUSE_RE = /\b(?:caused by|because of|because|due to|blamed (?:on|for)|blames?|triggered by|sparked by|following|after|amid)\s+(?:an?\s+|the\s+|a\s+series of\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/gi;
// "Engineers blamed sabotage for the closure": the thing blamed is a cause too.
const BLAMED_RE = /\bblam(?:e|es|ed|ing)\s+(?:an?\s+|the\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+for\b/gi;
// "A cyberattack caused the outage": the subject of a causing verb is a cause.
const CAUSED_RE = /(?:^|[,;]\s*|\b(?:an?|the)\s+)([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+(?:caused|causes|triggered|triggers|sparked|sparks|set off|led to)\b/gi;
// Time and duration a sentence asserts ("for weeks", "next week", "again", "tomorrow"): the source must say
// it too, as it must say a figure. Each entry: the phrase, and the word(s) the source must contain.
const TIME_RES = [
  [/\b(?:for|over|in|within|after)\s+(?:the\s+)?(?:past\s+|last\s+|next\s+|coming\s+)?(?:several\s+|many\s+|a\s+few\s+|few\s+|an?\s+|one\s+|two\s+|three\s+|\d+\s+)?(hours?|days?|weeks?|months?|years?|decades?)\b/gi, (m) => m[1].replace(/s$/, '')],
  [/\b(next|last|this|coming)\s+(week|weekend|month|year|spring|summer|autumn|winter|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, (m) => `${m[1]} ${m[2]}`],
  [/\b(again|tomorrow|tonight|yesterday|permanently|temporarily|for good|indefinitely|soon)\b/gi, (m) => m[1]],
];
// Judgements a source must make itself: a writer never declares a place safe or an act deliberate.
const ASSESSMENT = new Set('safe unsafe dangerous secure stable unstable contained resolved deliberate deliberately accidental accidentally intentional intentionally sabotage unprecedented historic catastrophic devastating'.split(' '));

const inSource = (word, pool) => pool.some((p) => sameWord(base(word), p));

/**
 * Does a spoken story sentence add an actor, a cause, a speaker or a name
 * that its source never mentions? Returns a short reason, or null when the
 * sentence stays within the source. `ignore` lists names that may appear
 * freely (the outlet, the channel, the presenters, the programme).
 * - mostly new content: 3+ content words of its own, fewer than half of them
 *   in the source (attribution and framing words do not count);
 * - a cause the source does not give ("after a cyberattack", "caused by a strike");
 * - a speaker the source does not name ("..., the mayor said");
 * - a person's or an organisation's name, or a title + name, not in the source.
 */
export function inventedClaim(sentence, source, { ignore = [] } = {}) {
  let s = String(sentence ?? '');
  for (const name of ignore.filter(Boolean)) s = s.replace(new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  s = s.replace(/[“”"‘’][^“”"‘’]*[“”"‘’]/g, ' '); // quotations are checked word for word elsewhere
  const src = String(source ?? '');
  const pool = contentWords(src).map(base);
  const foldedSource = fold(src);
  const words = contentWords(s).filter((w) => !FRAME_WORDS.has(w) && !/^\d/.test(w));
  const fresh = words.filter((w) => !inSource(w, pool));
  // Half or more of its words are new: it says something else than the source.
  if (words.length >= 3 && fresh.length >= 2 && (words.length - fresh.length) / words.length <= 0.5) return 'not in the source';
  const judged = fresh.find((w) => ASSESSMENT.has(w));
  if (judged) return `assessment "${judged}"`;
  for (const re of [CAUSE_RE, BLAMED_RE, CAUSED_RE]) {
    for (const m of s.matchAll(re)) {
      const cause = contentWords(m[1]).filter((w) => !FRAME_WORDS.has(w));
      if (cause.length && !cause.every((w) => inSource(w, pool))) return `cause "${m[1]}"`;
    }
  }
  for (const [re, key] of TIME_RES) {
    for (const m of s.matchAll(re)) {
      const want = key(m).toLowerCase();
      if (!new RegExp(`\\b${want.replace(/\s+/g, '\\s+')}`, 'i').test(foldedSource)) return `time "${m[0]}"`;
    }
  }
  for (const re of SPEAKER_RES) {
    const m = s.match(re);
    if (!m) continue;
    const who = contentWords(m[1]).filter((w) => !FRAME_WORDS.has(w));
    if (who.length && !who.every((w) => inSource(w, pool))) return `speaker "${m[1].trim()}"`;
  }
  // Places: a known place the source does not name (nor contain: "Wales" holds the United Kingdom) is a wrong
  // place on air ("In France, storms have uncovered footprints" for a beach in Wales).
  for (const h of findPlaces(s)) if (!placeSupported(h.text, src)) return `place "${h.text}"`;
  // Names: a title before a capitalised word, or two capitalised words in a row past the first word.
  const titled = s.match(TITLE_RE);
  if (titled && !foldedSource.includes(fold(titled[0]).trim().replace(/\.$/, ''))) return `title "${titled[0].trim()}"`;
  const body = s.replace(/^\s*(?:\[[^\]]*\]\s*)*\S+/, ' ');
  for (const m of body.matchAll(/(?<![\p{L}.])(\p{Lu}[\p{Ll}'’-]+(?:\s+(?:of|the|de|du|von|van|al|bin)?\s*\p{Lu}[\p{Ll}'’-]+)+)/gu)) {
    const name = fold(m[1]).replace(/\s+/g, ' ');
    if (foldedSource.includes(name)) continue;
    // a known place the source names (or a country of it) is not a new actor
    if (contentWords(name).every((w) => inSource(w, pool))) continue;
    // "In the United Kingdom, ..." for a story the source places in Wales: the country of a place it names
    const place = lookupPlace(m[1]);
    if (place?.kind === 'country' && findPlaces(src).some((h) => h.entry === place || h.entry.country === place.name)) continue;
    return `name "${m[1]}"`;
  }
  return null;
}

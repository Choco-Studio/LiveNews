// Fact helpers shared by the bulletin validator and the offline writer: finds
// the figures, quotations and tone of a story in its feed text, and checks
// that what a writer puts on screen or says (a number, a quote, a label) is
// really in the source. Everything here is deliberately conservative: when in
// doubt, a graphic or a sentence is dropped rather than aired with something
// the source never said.

// Grave news: no jokes, no light gestures, no "and finally" slot.
// Natural disasters and accidents count as much as violence: a hurricane landfall is never the number of the day.
export const GRAVE =
  /\b(?:dead|deaths?|die[sd]?|dying|killed|killings?|kills?|war|wars|attacks?|victims?|murder\w*|shootings?|earthquakes?|fires?|wildfires?|blaze|crash\w*|violen\w*|injur\w*|bomb\w*|strikes? on|crisis|floods?|flooded|flooding|hostages?|famine|casualt\w*|missing|evacuat\w*|disaster\w*|tragedy|mourn\w*|funeral|cancer|outbreak|epidemic|pandemic|hurricanes?|typhoons?|cyclones?|tornado(?:es|s)?|tsunamis?|landslides?|mudslides?|avalanches?|droughts?|heatwaves?|heat waves?|collaps\w*|derail\w*|capsiz\w*|sinks|sank|sunk|sinking|drown\w*|cholera|landfall|life-threatening|storm surge|explosions?|blasts?|refugees?|displaced|shipwreck\w*|starvation|massacre\w*|genocide|ceasefire|airstrikes?|shelling|rescuers?)\b/i;
// Lighter material: technology, science, curiosities.
export const LIGHT =
  /\bAI\b|robot|\bchips?\b|phone|\bapps?\b|software|\bspace\b|nasa|planet|science|scientist|discover|study finds|telescope|\bgames?\b|record|festival|zoo|panda|penguin|dinosaur|fossil|museum|trees?\b|garden|bicycle|bike|tram|train|music|chocolate|coffee|parrot|whale|dolphin|stars?\b|comet|moon|reef|coral|tortoises?|leopards?|mangroves?|tomatoes|drones/i;

export const isGrave = (text) => GRAVE.test(String(text ?? ''));

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
const wordsAround = (s, index, end, before, after) => {
  const head = fold(s.slice(Math.max(0, index - 60), index)).match(/[a-z][a-z'-]*/g) || [];
  const tail = fold(s.slice(end, end + 80)).match(/[a-z][a-z'-]*/g) || [];
  return { before: head.slice(-before), after: tail.slice(0, after) };
};
/** The thing a figure counts ("120 people" -> "people"), from the next few words of the same phrase. */
function countedNoun(s, n) {
  const phrase = s.slice(n.end, n.end + 80).replace(/^(?:st|nd|rd|th)\b/i, '').split(/[,;:.!?()“”"]/)[0];
  const after = (fold(phrase).match(/[a-z][a-z'-]*/g) || []).slice(0, 4);
  for (const w of after) {
    const word = w.replace(/^-+/, '');
    if (!word || NOUN_SKIP.has(word) || CURRENCY_WORD_RE.test(word)) continue;
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
  if (sameWord(noun, counted)) return true;
  // Otherwise the noun must sit in the figure's own clause ("120 relief camps for 3,000 people": no; "120 villages
  // and 5 people died": the people belong to the 5, not to the 120).
  const { before, after } = clauseAround(sourceText, s.index, s.end, 3, 5);
  return [...before, ...after].some((w) => sameWord(noun, w));
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
  for (const raw of words) {
    const w = raw.replace(/[^A-Za-z'’-]/g, '');
    const lw = w.toLowerCase().replace(/['’]s$/, '');
    if (!w) break;
    if (SUBJECT_SKIP.has(lw)) continue;
    if (AUX.has(lw) || LABEL_STOP.has(lw) || /ed$/.test(lw) || IRREGULAR_PAST.has(lw) || DOWN_BEFORE.test(`${lw} `) || UP_BEFORE.test(`${lw} `)) break;
    out.push(lw.replace(/['’]s$/, ''));
    if (out.length >= 2) break;
  }
  // "Tokyo's main stock index" -> keep the head noun, not the owner
  return out.length ? out.join(' ').toUpperCase() : null;
}

// Labels that are only a unit of measure or of time.
const UNIT_ONLY = /^(?:KM|KMS|KILOMETRES?|KILOMETERS?|MILES?|MPH|KPH|KM\/H|KMH|METRES?|METERS?|M|CM|MM|FEET|FOOT|FT|INCH(?:ES)?|C|F|°C|°F|DEGREES?(?: CELSIUS| FAHRENHEIT)?|CELSIUS|KG|KILOGRAMS?|TONNES?|TONS?|LITRES?|DAYS?|HOURS?|MINUTES?|SECONDS?|WEEKS?|MONTHS?|YEARS?|DECADES?|KNOTS?|HECTARES?|ACRES?)$/;
const MEASURE_SKIP = new Set('a an the of at to up by about around nearly almost some over under reached reaching hit hitting topped topping rose fell rising falling with was were is are has had have more than less just only its their his her this that which'.split(' '));
/** The noun a measurement belongs to, from the few words before the figure ("winds of" -> WINDS), or null. */
function measuredBefore(s, index) {
  const words = s.slice(Math.max(0, index - 50), index).split(/[,;:.!?()]/).pop().trim().split(/\s+/).filter(Boolean);
  for (let i = words.length - 1; i >= Math.max(0, words.length - 4); i--) {
    const w = words[i].replace(/[^A-Za-z-]/g, '').toLowerCase();
    if (!w || MEASURE_SKIP.has(w)) continue;
    if (w.length < 4 || /(?:ed|ly)$/.test(w)) return null;
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
      const subject = measuredBefore(s, n.index);
      if (!subject) continue;
      figures.push({ value: `${value} ${labelText}`.slice(0, 12), label: subject, fact: [qualifier, subject, value, labelText].filter(Boolean).join(' '), said: `${q ? `${q} ` : ''}${n.raw}${label.length ? ` ${label.join(' ')}` : ''}`, score: 2, index: n.index, ...(qualifier ? { qualifier } : {}) });
      continue;
    }
    const fact = [qualifier, core].filter(Boolean).join(' ');
    let score = 1;
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

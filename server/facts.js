// Fact helpers shared by the bulletin validator and the offline writer: finds
// the figures, quotations and tone of a story in its feed text, and checks
// that what a writer puts on screen (a number, a quote, a label) is really in
// the source. Everything here is deliberately conservative: when in doubt, a
// graphic is dropped rather than shown with something the source never said.

// Grave news: no jokes, no light gestures, no "and finally" slot.
export const GRAVE =
  /\b(?:dead|deaths?|die[sd]?|dying|killed|killings?|kills?|war|wars|attacks?|victims?|murder\w*|shootings?|earthquakes?|fires?|wildfires?|blaze|crash\w*|violen\w*|injur\w*|bomb\w*|strikes? on|crisis|floods?|flooded|flooding|hostages?|famine|casualt\w*|missing|evacuat\w*|disaster\w*|tragedy|mourn\w*|funeral|cancer|outbreak|epidemic|pandemic)\b/i;
// Lighter material: technology, science, curiosities.
export const LIGHT =
  /\bAI\b|robot|\bchips?\b|phone|\bapps?\b|software|\bspace\b|nasa|planet|science|scientist|discover|study finds|telescope|\bgames?\b|record|festival|zoo|panda|penguin|dinosaur|fossil|museum|trees?\b|garden|bicycle|bike|tram|train|music|chocolate|coffee|parrot|whale|dolphin|stars?\b|comet|moon/i;

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
const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, dozen: 12,
};

// A figure as written in news copy: "$2.5bn", "40,000", "7.1", "30 percent", "3,000-year-old", "1.2 million".
const NUMBER_RE =
  /(?<![\w.,:])([$£€¥]\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:(?:\s|-)?(%|per ?cent\b))?(?:(?:\s|-)?(thousand|million|billion|trillion|bn|mn|tn|k|m|b)\b)?/gi;

/** Every number in a text as { raw, value, scaled, index, end }. */
export function numbersIn(text) {
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(NUMBER_RE)) {
    const value = Number((m[2] + (m[3] || '')).replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const unit = (m[5] || '').toLowerCase();
    out.push({ raw: m[0].trim(), value, scaled: SCALE[unit] ? value * SCALE[unit] : value, index: m.index, end: m.index + m[0].length, percent: !!m[4], currency: !!m[1], unit });
  }
  return out;
}

/** The set of values a source states, in digits or as simple number words. */
function sourceValues(source) {
  const set = new Set();
  for (const n of numbersIn(source)) {
    set.add(n.value);
    set.add(n.scaled);
  }
  for (const w of fold(source).match(/[a-z]+/g) || []) if (WORD_NUMBERS[w]) set.add(WORD_NUMBERS[w]);
  return set;
}

const close = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

/** True when every number in `text` is stated in `source` (in digits, with a scale such as "bn", or as a word). */
export function numbersGrounded(text, source) {
  const nums = numbersIn(text);
  if (!nums.length) return true;
  const values = [...sourceValues(source)];
  return nums.every((n) => values.some((v) => close(n.value, v) || close(n.scaled, v)));
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

// Crude stemming: "passengers" ~ "passenger", "evacuated" ~ "evacuation", "homes" ~ "home".
const stemMatch = (a, b) => {
  if (a.length < 4 || b.length < 4) return false;
  const k = Math.max(4, Math.min(a.length, b.length) - 3);
  return a.slice(0, k) === b.slice(0, k);
};

// "DOWN 2%" on a card is grounded by "dropped 2 percent" in the copy.
const DIRECTIONS = {
  down: /\b(?:down|fell|falls?|falling|dropped|drops?|declined?|declining|decreased?|cut|lower|slid|slides?|sank)\b/,
  up: /\b(?:up|rose|rises?|rising|risen|grew|grows?|jumped|increased?|higher|climbed|soared)\b/,
};

/** Share (0..1) of the content words of `text` that also appear in `source`. */
export function wordsGrounded(text, source) {
  const folded = fold(text);
  const words = contentWords(folded).filter((w) => !DIRECTIONS[w]);
  const directions = Object.keys(DIRECTIONS).filter((d) => new RegExp(`\\b${d}\\b`).test(folded));
  if (!words.length && !directions.length) return 1;
  const pool = contentWords(source);
  const foldedSource = fold(source);
  const hits = words.filter((w) => pool.some((p) => p === w || stemMatch(w, p)));
  const dirHits = directions.filter((d) => DIRECTIONS[d].test(foldedSource));
  return (hits.length + dirHits.length) / (words.length + directions.length);
}

/**
 * A short on-screen claim (a fact, a figure label) is grounded when its numbers
 * are in the source and at least half of its words are too.
 */
export function claimGrounded(text, source, minShare = 0.5) {
  return numbersGrounded(text, source) && wordsGrounded(text, source) >= minShare;
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
 * that is literally in the source, at least 4 words, and the speaker must be
 * named in the source. Returns { text, by } or null.
 */
export function groundQuote(quote, source) {
  const text = String(quote?.text ?? quote ?? '').replace(/^[\s"“”'‘’«»]+|[\s"“”'‘’«»]+$/g, '').replace(/\s+/g, ' ');
  if (!text || text.split(' ').length < 4) return null;
  const want = squash(text);
  const match = quotesIn(source).find((q) => squash(q.text).includes(want));
  if (!match) return null;
  const by = String(quote?.by ?? '').trim();
  const byOk = by && squash(source).includes(squash(by)) ? by : null;
  return { text, by: byOk };
}

// ---------------------------------------------------------------- figures for the offline writer

const LABEL_STOP = new Set(
  'and or but to by in on at for from with than that which who whom is are was were will would has have had said says say over past since during into after before while as its their his her this these those the about around nearly almost some when where if because until unless so yet once then there here now again also only even just still can could may might should must across through between against'.split(
    ' '
  )
);
const MONTHS = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i;

/**
 * Figures stated in a text, best first, for a fact card: each is
 * { value: "40,000", label: "PASSENGERS A DAY", fact: "40,000 PASSENGERS A DAY",
 *   said: "40,000 passengers a day" (as written, for speech), score }.
 * The label is the words that follow the figure in the source, so nothing is
 * paraphrased. Bare years, dates, times and ordinals are skipped.
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
      if (LABEL_STOP.has(lw)) break;
      if (label.length && /[a-z]ed$/.test(lw)) break; // "160 million passengers used the network": stop at the verb
      label.push(word);
      if (label.length >= 3 || /[,]$/.test(w)) break;
    }
    if (!label.length && !n.percent && !n.currency && !n.unit) continue; // a bare number says nothing
    const value = n.raw.replace(/\s?per ?cent$/i, '%').replace(/\s+/g, ' ').toUpperCase();
    const before = s.slice(Math.max(0, n.index - 24), n.index).toLowerCase();
    const direction = /\b(?:fell|dropped|down|cut|decreased|declined|fall of|drop of)\s+(?:by\s+)?$/.test(before)
      ? 'DOWN'
      : /\b(?:rose|risen|up|grew|jumped|increased|rise of|increase of)\s+(?:by\s+)?$/.test(before)
        ? 'UP'
        : '';
    const labelText = label.join(' ').toUpperCase();
    const fact = [direction, `${value}${labelText ? (glued ? '-' : ' ') + labelText : ''}`].filter(Boolean).join(' ');
    let score = 1;
    if (n.value >= 1000 || n.unit) score += 2;
    if (n.percent || n.currency) score += 1.5;
    if (label.length) score += 1;
    if (n.value < 10 && !n.percent && !n.currency && !n.unit) score -= 1;
    const said = `${n.raw}${label.length ? (glued ? '-' : ' ') + label.join(' ') : ''}`;
    figures.push({ value, label: [direction, labelText].filter(Boolean).join(' '), fact, said, score, index: n.index });
  }
  const seen = new Set();
  return figures
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((f) => (seen.has(f.value) ? false : seen.add(f.value)))
    .slice(0, max)
    .map(({ value, label, fact, said, score }) => ({ value, label, fact, said, score }));
}

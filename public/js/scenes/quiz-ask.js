// PAY ATTENTION's HOW MANY? question in plain words (docs/publishing/shorts-v2.md A3): what the vertical board asks in
// big type from its first frame, and what a clip's title and caption ask, from the question's figure (server/quiz/desk.js
// usableFigure: { value, label, qualifier, exact }). The value says how to ask (a sum of money: HOW MUCH?, a share:
// WHAT PERCENTAGE?) and the label what is counted (HOW MANY PONIES?). Never the value itself: the words are the label's
// alone, and a label that is no plain plural (STEAM, from "the $789 Steam Deck"; MAGNITUDE; -YEAR-OLD) gives the
// round's own HOW MANY?. No canvas and no DOM: the board (clip/vquiz.js) and the clip's words (server/publish/moments.js
// quizWords) ask alike.
import { measureText, wrapText } from '../font.js';

// plurals without an S, and words in S that are no plural
const PLURAL = new Set('PEOPLE CHILDREN MEN WOMEN SHEEP FISH DEER CATTLE MICE GEESE TEETH FEET POLICE STAFF AIRCRAFT SPECIES SERIES'.split(' '));
const NOT_PLURAL = new Set('NEWS BUS GAS LENS STATUS VIRUS BONUS CENSUS CAMPUS FOCUS'.split(' '));
const plural = (w) => PLURAL.has(w) || (/S$/.test(w) && !/SS$/.test(w) && !NOT_PLURAL.has(w));
// a word of the label: capitals, a hyphen or an apostrophe inside (LIGHT-YEARS), A in "PASSENGERS A DAY"
const WORD = /^\p{Lu}(?:[\p{Lu}’'-]*\p{Lu})?$/u;

/**
 * The question a HOW MANY? figure asks and its answer: `ask` the question (HOW MANY PONIES?, HOW MUCH?, WHAT
 * PERCENTAGE?), `short` the same in the fewest words (HOW MANY?, HOW MUCH?, WHAT PERCENT?), `answer` the figure with
 * what it counts (ABOUT 100 PONIES), `value` the figure alone (ABOUT 100), `counted` the label the ask names (PONIES)
 * or null. Null for no figure.
 */
export function askOf(figure) {
  const v = String(figure?.value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (!/\d/.test(v)) return null;
  const qualifier = String(figure.qualifier || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const value = [qualifier, v].filter(Boolean).join(' ');
  if (/^[£$€¥]/.test(v)) return { ask: 'HOW MUCH?', short: 'HOW MUCH?', answer: value, value, counted: null };
  if (/(?:%|PER ?CENT)$/.test(v)) return { ask: 'WHAT PERCENTAGE?', short: 'WHAT PERCENT?', answer: value, value, counted: null };
  const label = String(figure.label || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const words = label ? label.split(' ') : [];
  // (its plural first or last: PASSENGERS A DAY, YEARS AGO, RED SQUIRRELS)
  const counted = words.length >= 1 && words.length <= 3 && words.every((w) => WORD.test(w)) && (plural(words[0]) || plural(words[words.length - 1])) ? label : null;
  return { ask: counted ? `HOW MANY ${counted}?` : 'HOW MANY?', short: 'HOW MANY?', answer: counted ? `${value} ${counted}` : value, value, counted };
}

/** Words in lines of `scale`x type no wider than `width`, at most `max` lines, every word whole; else null. */
export function askLines(text, width, scale = 2, max = 2) {
  const lines = wrapText(String(text || ''), width, scale);
  return lines.length >= 1 && lines.length <= max && lines.every((l) => measureText(l, scale) <= width) ? lines : null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The ask as a sentence for a title or a caption: "How many light-years?", "How much?"; the counted words as the
 * question's sentence writes them right after its figure or its mask ("▮▮ light-years", "20 Steam games"), else in
 * lower case.
 */
export function askSentence(a, text = '') {
  if (!a) return '';
  if (!a.counted) return a.ask.charAt(0) + a.ask.slice(1).toLowerCase();
  const phrase = a.counted.split(' ').map(escape).join('\\s+');
  const m = new RegExp(`(?:▮|\\d)\\s*(${phrase})(?![\\p{L}\\d])`, 'iu').exec(String(text));
  return `How many ${m ? m[1].replace(/\s+/g, ' ') : a.counted.toLowerCase()}?`;
}

// who said or reported it is no topic ("…, according to BBC Science", "…, BBC Science reports.")
const NAMES = String.raw`\p{Lu}[\p{L}\d’'&.-]*(?:\s+\p{Lu}[\p{L}\d’'&.-]*)*`;
const SAID_BY = new RegExp(String.raw`,?\s*\b(?:according to|reported by)\s+(?:the\s+)?${NAMES}|,\s*${NAMES}\s+reports?\.?\s*$`, 'gu');

// words in capitals that name no topic on their own
const NOT_A_TOPIC = /^(?:AI|I|OK|TV|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|The|A|An|In|On|At|And|But|Or|So|It|Its|This|That|These|Those|Here|There|New|Now)$/;

/**
 * What a quiz question is about, from the words its board shows (its blank masked, so never its answer): the first
 * name they give (Elon Musk, NASA’s Webb, Exmoor Pony Herd, TAP Air Portugal, TSMC), never the outlet that reported
 * it, a day or a month, or ''. A sentence's own first word is a name only when the next is one too and a word in lower
 * case follows; a headline in title case capitalises every word, so only an acronym in it is a name.
 */
export function quizTopic(text = '') {
  const t = String(text || '').replace(SAID_BY, '');
  const words = t.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const long = words.filter((w) => w.replace(/[^\p{L}]/gu, '').length >= 4);
  if (words.length >= 4 && long.length && long.filter((w) => /^[^\p{L}]*\p{Lu}/u.test(w)).length / long.length >= 0.8) return (t.match(/\b(?!AI\b)[\p{Lu}\d]{2,6}\b/u) || [''])[0];
  // (two or three names at the start and a word in lower case after them: never the start of a longer name)
  const lead = words.length >= 4 ? t.match(/^(?!(?:The|A|An|In|On|At|And|But|After|Before|How|What|Why|When|Where|Who|This|That|These|Those|It|Its|Here|There|New|Now|More|Most)\b)\p{Lu}[\p{L}\d’'&-]*(?:\s+\p{Lu}[\p{L}\d’'&-]+){1,2}(?=\s+\p{Ll})/u) : null;
  if (lead) return lead[0].replace(/[’']s$/, '');
  // else the first name after the sentence's first word: one to three words in capitals (a lone letter is none)
  for (const m of t.matchAll(/(?<=\S\s+)\p{Lu}[\p{L}\d’'&-]+(?:\s+\p{Lu}[\p{L}\d’'&-]+){0,2}/gu)) {
    const name = m[0].replace(/[’']s$/, '');
    if (!NOT_A_TOPIC.test(name)) return name;
  }
  return '';
}

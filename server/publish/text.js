// What a clip says, read before it is cut (docs/publishing/clips.md §2): does it make sense on its own, does it start
// and end on whole sentences, does it keep every quote whole, is it grave. A clip is watched by someone who saw
// nothing before it: a first sentence that leans on what came earlier ("It also said…", "Thanks, Paco.", "That
// second attack…") loses them in the first second. These checks are deterministic text rules, the same for every
// programme; the moment detector (moments.js) uses them to choose where a clip starts and to score it.
import { splitSentences } from '../../public/js/audio/sentences.js';

export { splitSentences };

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// a sentence that opens on one of these leans on something said before it
const DANGLING_OPENERS = /^(?:it|its|it's|they|their|theirs|them|these|those|this|that|he|she|his|her|him|also|meanwhile|but|and|or|so|however|still|instead|yet|then|thus|therefore|besides|moreover|furthermore|likewise|similarly|otherwise|later|earlier|afterwards|there|which|whose|whom|both|neither|either|such|another|the other|the latter|the former|the same|again|too|as well|in turn|in response|in addition|on top of that|by contrast|on the other hand)\b/i;
// hand-overs and thanks: a presenter talking to a colleague the viewer has not met
const HANDOVER = /^(?:thanks|thank you|cheers|over to you|back to you|right(?:,|\.)|okay(?:,|\.)|ok(?:,|\.)|well(?:,|\.)|now(?:,)|and now|next(?:,|:)|still to come|coming up|after the break)\b/i;
// words that point back at earlier segments of the programme
const BACKREF = /\b(?:as (?:we|i) (?:said|heard|reported|mentioned|saw|told you)|earlier (?:in|on) (?:the|this) (?:programme|show|bulletin|hour)|we (?:told you|reported) earlier|that story|this story|the story we|as mentioned|the (?:second|third|other) (?:story|attack|case|one)|more on that|as you heard|you heard)\b/i;
// a salutation that is no content of its own
const GREETING = /^(?:good (?:morning|afternoon|evening|night)|hello|hi|welcome)\b/i;

/** Does this sentence lean on what came before it (an opening pronoun, a hand-over, a back reference)? */
export function dangling(sentence) {
  const s = norm(sentence).replace(/^["“‘'(]+/, '');
  if (!s) return true;
  if (HANDOVER.test(s)) return true;
  // presenting what is on screen stands on its own ("This is PAY ATTENTION.", "Here's a technology headline.")
  if (/^(?:this is|here's|here is|here are)\b/i.test(s)) return false;
  // the programme's own formula for its last story ("And finally: NASA names...") introduces, it does not lean back
  if (/^and finally\b/i.test(s)) return false;
  if (DANGLING_OPENERS.test(s)) return true;
  return false;
}

/** Does the text point back at an earlier part of the programme? */
export function backReference(text) {
  return BACKREF.test(norm(text));
}

/** A tease of what comes later in the programme ("Still to come: ...", "Coming up: ..."): never part of a clip. */
export function teaseText(sentence) {
  return /^(?:still to come|coming up|later in the (?:programme|show)|after the break|stay with us|next on)\b/i.test(norm(sentence).replace(/^["“‘'(]+/, ''));
}

/** A hand-over to the co-host with nothing else in it ("Over to you, Nova.", "Back to you, Dr Reyes."): never a clip's end. */
export function handoverOnly(sentence) {
  const t = norm(sentence).replace(/^["“‘'(]+/, '');
  return t.split(' ').length <= 8 && /\b(?:over to you|back to you|handing (?:you )?(?:over|back)|i'll hand (?:you )?(?:over|back))\b/i.test(t);
}

/** A greeting or sign-off line with nothing else in it. */
export function greetingOnly(sentence) {
  const s = norm(sentence);
  return GREETING.test(s) && s.split(/\s+/).length <= 12 && !/\d/.test(s);
}

/** Does the text end on a whole sentence (a stop, a question or exclamation mark, a closing quote after one)? */
export function endsClean(text) {
  return /[.!?…]["'’”»)\]]*$/.test(norm(text));
}

/**
 * Quotes in a run of text: every opening mark closed again, nothing cut inside one. Straight double quotes pair up;
 * curly quotes must balance; a single curly quote counts only as a pair (an apostrophe is never a quote).
 */
export function quotesBalanced(text) {
  const s = norm(text);
  const straight = (s.match(/"/g) || []).length;
  if (straight % 2) return false;
  const open = (s.match(/“/g) || []).length;
  const close = (s.match(/”/g) || []).length;
  if (open !== close) return false;
  // single curly quotes used as quote marks: ‘ opens, ’ closes only when it follows a word end and is not mid-word
  const singleOpen = (s.match(/(^|[\s(])‘/g) || []).length;
  const singleClose = (s.match(/’(?=[\s.,;:!?)]|$)/g) || []).length;
  return singleOpen <= singleClose;
}

/** The sentences a quote spans across `texts` (segment texts in order) when it opens in one and closes later. */
export function quoteSpans(sentences) {
  const spans = [];
  let open = -1;
  sentences.forEach((s, i) => {
    const q = (String(s).match(/["“”]/g) || []).length;
    if (open < 0 && q % 2 === 1) open = i;
    else if (open >= 0 && q % 2 === 1) {
      spans.push([open, i]);
      open = -1;
    }
  });
  if (open >= 0) spans.push([open, sentences.length - 1]);
  return spans;
}

// grave subjects: a clip about them is never light, never gets a lit word or an emoji, never airs in a light slot
const GRAVE = /\b(?:killed|kills|killing|dead|deaths?|died|dies|dying|murder\w*|shot dead|shooting|stabb\w*|massacre|genocide|war crimes?|bomb\w*|missile|airstrikes?|strikes? on|attack(?:s|ed)?|terror\w*|hostages?|rape\w*|abuse\w*|assault\w*|suicide|overdose|famine|starv\w*|flood(?:s|ing)? (?:kill|destroy)|earthquake|tsunami|crash(?:ed|es)? (?:kill|leav)|wounded|injured|casualt\w*|refugees? drown\w*|executed|execution|torture\w*|child(?:ren)? (?:died|killed)|pogroms?|settler attacks?|invasion|shelling|drone strikes?)\b/i;

/** Is a text about something grave (deaths, violence, disaster)? */
export function graveText(text) {
  return GRAVE.test(norm(text));
}

/** The words of a text, lower-case, for overlap checks. */
export function wordsOf(text) {
  return norm(text).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').split(/\s+/).filter(Boolean);
}

const STOP = new Set('a an the of to in on at by for from with and or but is are was were be been has have had it its this that as into than then so not no'.split(' '));
/** Content words (no stop words), for "is the subject named" checks. */
export function contentWords(text) {
  return wordsOf(text).filter((w) => !STOP.has(w) && w.length > 2);
}

/** Interest cues in a line: a figure, a superlative or first, a question, a name of a place. Returns 0..1. */
export function interestCues(text) {
  const s = norm(text);
  let score = 0;
  if (/\d/.test(s)) score += 0.3;
  if (/\b(?:first|record|biggest|largest|smallest|fastest|oldest|youngest|highest|lowest|never|ever|only|rare|unusual|surprise|surprising|discovered|found|new)\b/i.test(s)) score += 0.3;
  if (/\?/.test(s)) score += 0.15;
  if (/\b(?:space|planet|moon|mars|comet|robot|ai|telescope|animal|species|ancient|world)\b/i.test(s)) score += 0.15;
  return Math.min(1, score);
}

/**
 * Where a clip may start in a run of sentences: the first one that stands on its own (no lean on an earlier one, no
 * greeting alone). -1 when none does.
 */
export function cleanStart(sentences) {
  for (let i = 0; i < sentences.length; i++) {
    if (!dangling(sentences[i]) && !greetingOnly(sentences[i])) return i;
  }
  return -1;
}

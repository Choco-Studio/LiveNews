// FULL TIME's words (docs/programmes/full-time.md §3.3, §3.4): a sentence's time words re-anchored from the day the story
// was published to the day it airs, and the outlets' praise and blame of players taken out (the channel never judges a
// real person). Both return null for a sentence that cannot be kept cleanly: it is dropped, never guessed.

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A moment's calendar day in a time zone, as a day number (days since 1970-01-01) and its weekday. */
export function dayIn(ms, tz = 'Europe/London') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const n = Math.round(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY);
  return { n, weekday: new Date(n * DAY).getUTCDay() };
}

// a sentence about what is still to come (its time words then name a day ahead, which may have passed by airtime)
const AHEAD = /\b(?:will|'ll|shall|is set to|are set to|is due|are due|is scheduled|are scheduled|is expected to|are expected to|going to|faces?|hosts?|meets?|plays?|takes? on|travels? to|visits?|kicks? off|starts?|begins?|gets? under way|ahead of|before|aims? to|bids? to|looks? to|hopes? to|preview)\b/i;
const QUOTED = /[“"][^”"]*[”"]/g;

/**
 * A sentence with its time words said from the day it airs: "tonight" in a story published on Monday and read on
 * Tuesday is "on Monday night". Returns the sentence unchanged on its own day, the re-anchored sentence otherwise, or
 * null when it must go: a step ahead whose day has passed ("Wales host Albania on Tuesday", read on Wednesday), a time
 * word that cannot be moved cleanly ("later today"), or a story more than six days old.
 */
export function retime(sentence, { published, now = Date.now(), tz = 'Europe/London' } = {}) {
  const s = String(sentence || '');
  if (!Number.isFinite(published)) return s;
  const pub = dayIn(published, tz);
  const air = dayIn(now, tz);
  const gap = air.n - pub.n;
  if (gap <= 0) return s;
  const bare = s.replace(QUOTED, ' ');
  const ahead = AHEAD.test(bare);
  const wd = (n) => WEEKDAYS[(((pub.weekday + n) % 7) + 7) % 7];
  // a day named in the copy, from the publication day: "on Tuesday" (ahead or past), its day number
  const named = /\b(?:on|this|next|last)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i.exec(bare);
  if (gap > 6 && /\b(?:tonight|today|yesterday|tomorrow|this (?:morning|afternoon|evening|weekend)|last night|on (?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b/i.test(bare)) return null;
  if (/\b(?:later|earlier) (?:today|tonight|this (?:morning|afternoon|evening))\b/i.test(bare) && ahead) return null;
  if (/\btomorrow\b/i.test(bare) && gap > 1) return null; // the step ahead has come and gone
  if (named && ahead) {
    const target = WEEKDAYS.findIndex((d) => d.toLowerCase() === named[1].toLowerCase());
    let diff = (target - pub.weekday + 7) % 7;
    if (/^next\b/i.test(named[0]) && diff === 0) diff = 7;
    if (diff < gap) return null; // that day has passed: the channel does not know the result
  }
  if (/\b(?:this|next) weekend\b/i.test(bare) && ahead && gap >= 2 + ((6 - pub.weekday) % 7)) return null;
  const swap = (text, re, by) => text.replace(re, (m, ...rest) => {
    const out = typeof by === 'function' ? by(m, ...rest) : by;
    return /^\p{Lu}/u.test(m) ? out[0].toUpperCase() + out.slice(1) : out;
  });
  let t = s;
  // possessives first ("tonight's game" -> "Monday night's game"), then the words
  t = swap(t, /\btonight['’]s\b/gi, `${wd(0)} night's`);
  t = swap(t, /\bthis evening['’]s\b/gi, `${wd(0)} evening's`);
  t = swap(t, /\btoday['’]s\b/gi, gap === 0 ? "today's" : `${wd(0)}'s`);
  t = swap(t, /\blast night['’]s\b/gi, `${wd(-1)} night's`);
  t = swap(t, /\byesterday['’]s\b/gi, `${wd(-1)}'s`);
  t = swap(t, /\btomorrow['’]s\b/gi, gap === 1 ? "today's" : `${wd(1)}'s`);
  t = swap(t, /\btonight\b/gi, `on ${wd(0)} night`);
  t = swap(t, /\bthis evening\b/gi, `on ${wd(0)} evening`);
  t = swap(t, /\bthis afternoon\b/gi, `on ${wd(0)} afternoon`);
  t = swap(t, /\bthis morning\b/gi, `on ${wd(0)} morning`);
  t = swap(t, /\bearlier today\b/gi, `earlier on ${wd(0)}`);
  t = swap(t, /\btoday\b/gi, `on ${wd(0)}`);
  t = swap(t, /\blast night\b/gi, `on ${wd(-1)} night`);
  t = swap(t, /\byesterday\b/gi, `on ${wd(-1)}`);
  t = swap(t, /\btomorrow\b/gi, 'today');
  // a named day ahead that is now today or tomorrow is said so ("on Tuesday" read on Tuesday: "today")
  if (named && ahead) {
    const target = WEEKDAYS.findIndex((d) => d.toLowerCase() === named[1].toLowerCase());
    const left = ((target - pub.weekday + 7) % 7 || (/^next\b/i.test(named[0]) ? 7 : 0)) - gap;
    if (left === 0) t = swap(t, new RegExp(`\\b${named[0]}\\b`, 'i'), 'today');
    else if (left === 1) t = swap(t, new RegExp(`\\b${named[0]}\\b`, 'i'), 'tomorrow');
  }
  // "on Monday night" at the start of a sentence reads "On Monday night"; "the on Monday" never happens
  return t.replace(/\b(the|a|an)\s+on\s+/gi, '$1 ');
}

// the outlets' verdicts on a sporting act: an evaluative word before a sporting noun
const EVAL = 'brilliant|stunning|superb|sublime|sensational|magnificent|majestic|wonderful|fantastic|dazzling|outstanding|world-class|clinical|woeful|dismal|abject|shambolic|awful|dreadful|poor|sloppy|lacklustre|lackluster|embarrassing|pivotal|incredible|amazing|spectacular|stellar|masterful|imperious|horrendous|terrible|appalling|calamitous|exquisite|glorious|fabulous|majestic|wondrous|breathtaking|jaw-dropping|stupendous|scintillating|spineless|inept|hapless|toothless|insipid|abysmal|disgraceful';
// an act ("a brilliant goal"): the verdict goes and the act stays; a state ("a woeful start", "a poor season"): the
// verdict is all the phrase says, so the sentence goes
const ACT = 'goals?|strikes?|finish(?:es)?|headers?|saves?|catch(?:es)?|efforts?|wins?|victor(?:y|ies)|defeats?|comebacks?|innings|knocks?|laps?|drives?|shots?|pass(?:es)?|tackles?|volleys?|free-kicks?|penalt(?:y|ies)|tries|try|touchdowns?|dunks?|serves?|aces?|one-twos?';
const STATE = 'displays?|performances?|runs?|shows?|spells?|debut|half|start|season|form|night|afternoon|evening|outing|game|match|figure|player|character|manager|coach|side|team|defending|finishing';
const EVAL_BEFORE = new RegExp(`\\b(an?\\s+|the\\s+|his\\s+|her\\s+|their\\s+|its\\s+)?((?:(?:${EVAL})(?:\\s*,\\s*|\\s+and\\s+|\\s+))+)((?:[\\p{L}\\d-]+\\s+)?(?:${ACT}))\\b`, 'giu');
const EVAL_STATE = new RegExp(`\\b(?:${EVAL}|divisive|polarising|polarizing|maverick|flawed)\\s+(?:[\\p{L}\\d-]+\\s+)?(?:${STATE})\\b`, 'iu');
// a verdict on a person outright ("Caicedo was outstanding", "the referee got it wrong", "they deserved it")
const VERDICT = new RegExp(`\\b(?:was|were|is|are|looked|looks|been|being)\\s+(?:simply\\s+|absolutely\\s+|truly\\s+|utterly\\s+|so\\s+|quite\\s+)?(?:${EVAL})\\b|\\b(?:got it wrong|deserved|deserves|should have|shouldn['’]t have|ought to have|a disgrace|let (?:themselves|himself|herself) down|no excuse)\\b`, 'iu');

/**
 * A sentence without the outlets' praise or blame of a sporting act ("A brilliant goal from Bruno Guimaraes helps
 * Arsenal…" -> "A goal from Bruno Guimaraes helps Arsenal…"), or null when it judges a person outright ("Caicedo was
 * outstanding"). Words inside a quotation are that speaker's and stay; words about a result alone stay ("an emphatic
 * 4-1 win", "a thumping 4-1 home victory": "emphatic" and "thumping" are not on the list).
 */
export function withoutJudgement(sentence) {
  const s = String(sentence || '');
  const parts = s.split(/([“"][^”"]*[”"]|‘[^’]*’(?=[\s,.;:!?)]|$))/u);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    if (i % 2 === 1) {
      out.push(p); // a quotation, attributed by its sentence
      continue;
    }
    if (VERDICT.test(p) || EVAL_STATE.test(p)) return null;
    p = p.replace(EVAL_BEFORE, (m, det, evals, noun) => {
      // "an outstanding goal" -> "a goal"; "a brilliant one-two" keeps its article
      let d = det || '';
      if (/^an\s+$/i.test(d) && /^[^aeiou]/i.test(noun)) d = d.replace(/n(\s+)$/i, '$1');
      if (/^a\s+$/i.test(d) && /^[aeiou]/i.test(noun)) d = d.replace(/a(\s+)$/i, 'an$1');
      return `${d}${noun}`;
    });
    out.push(p);
  }
  return out.join('').replace(/\s{2,}/g, ' ').replace(/^\s*(\p{Ll})/u, (m, c) => c.toUpperCase());
}

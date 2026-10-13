// Three boards a story can earn from its own text, and the checks every writer's boards pass:
//   SHARE              a part of a whole, as the story says it ("57% of players", "one in seven properties")
//   WHAT HAPPENS NEXT  a dated step ahead ("The Budget will take place on 28 October")
//   WHO'S WHO          the people a story names, each with the public role the story gives them
// The fallback writer takes them from the source with shareFrom / nextFrom / whoFrom; the validator passes the
// writer's (any writer's) through normalizeShare / normalizeNext / normalizeWho, which ground every word again.
// A board never says more than the story: no figure, date, name or role the source does not write.

import { claimGrounded, sentencesIn } from './facts.js';
import { hasFiniteVerb } from './writer.js';

const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim() : '');
const plain = (raw) => String(raw ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const words = (s) => str(s).split(' ').filter(Boolean).length;
const PRONOUN = /\b(?:it|its|they|their|them|this|these|those|he|she|his|her|him|we|our|us|you|your)\b/i;
// ("US" is a country, not a pronoun: "the US vice-president")
const hasPronoun = (s) => PRONOUN.test(String(s).replace(/\bU\.?S\.?(?=\s|$|[,;:])/g, ' '));
const QUOTED = /[“”"?«»]/;
const JOIN_END = /\b(?:a|an|the|and|or|but|of|to|in|on|at|for|from|with|by|as|than|that|which|who|its|their)$/i;

// ---------------------------------------------------------------- SHARE

export const SHARE_LIMITS = { lead: 28, label: 60, leadWords: 5, labelWords: 10 };
const SMALL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20 };
const SMALL_WORD = Object.fromEntries(Object.entries(SMALL).map(([w, n]) => [n, w]));
const WORD_FRACTIONS = {
  half: [1, 2, 'HALF'], 'a third': [1, 3, 'A THIRD'], 'one third': [1, 3, 'A THIRD'], 'a quarter': [1, 4, 'A QUARTER'], 'one quarter': [1, 4, 'A QUARTER'],
  'two-thirds': [2, 3, 'TWO-THIRDS'], 'two thirds': [2, 3, 'TWO-THIRDS'], 'three-quarters': [3, 4, 'THREE-QUARTERS'], 'three quarters': [3, 4, 'THREE-QUARTERS'],
  'a fifth': [1, 5, 'A FIFTH'], 'one fifth': [1, 5, 'A FIFTH'], 'a tenth': [1, 10, 'A TENTH'], 'one tenth': [1, 10, 'A TENTH'],
};
const QUAL = '(?:about|around|nearly|almost|roughly|some|more than|over|under|less than|fewer than|at least|just over|just under|close to|up to)';
const SMALL_ALT = Object.keys(SMALL).join('|');
const SHARE_CORE = `(\\d{1,3}(?:\\.\\d+)?)\\s*(?:%|per ?cent)|(${SMALL_ALT}|\\d{1,2})\\s+(?:in|out of)\\s+(?:every\\s+)?(${SMALL_ALT}|\\d{1,3})|(${Object.keys(WORD_FRACTIONS).map(esc).join('|')})`;
const SHARE_RE = new RegExp(`\\b(?:(${QUAL})\\s+)?(?:${SHARE_CORE})(?![\\d.])(\\s+of\\b)?`, 'gi');
// a percentage that is a movement, not a part of a whole ("rose by 5% of...", "a rise of 3%")
const MOVED_BEFORE = /\b(?:by|up|down|rose|fell|climbed|dropped|jumped|slipped|increase|rise|fall|drop|growth|gain|loss|cut|cuts|raise|hike|tariff|tax|rate|discount)\s+(?:of\s+)?$/i;
const SAID_END = /\b(?:says?|said|found|finds|show(?:s|ed)?|suggests?|suggested|estimates?|estimated|according to|that|reports?|reported|believes?|thinks?|told)\s*$/i;
// a lead that is only an adverb is the share's qualifier ("only 26% of...")
const LEAD_QUALIFIER = /^(?:only|just|barely|almost|nearly|roughly|about|around|some|over|under|still|now)$/i;
// a label never stops on a verb still waiting for its complement ("of the population identifies [as Muslim]")
const LABEL_HANGS = /\b(?:is|are|was|were|be|been|being|has|have|had|will|identif\w+|class\w+|describ\w+|consider\w+|regard\w+|seen|known|called|named|made|said|says|expected|likely|set|due|such|including)$/i;
// the label's own verb: the board states something ("of Gaza is behind the line", "properties are at risk")
const LABEL_VERB = /\b(?:is|are|was|were|has|have|had|will|can|remain|remains|remained|live|lives|lived|own|owns|owned|use|uses|used|earn|earns|earned|face|faces|faced|lack|lacks|lacked|want|wants|wanted|need|needs|support|supports|supported|oppose|opposes|opposed|believe|believes|say|says|said|come|comes|came|go|goes|went|get|gets|got|make|makes|made|take|takes|took|hold|holds|held|run|runs|ran|work|works|worked|vote|votes|voted|back|backs|backed)\b|\b\p{Ll}{3,}ed\b/u;

const count = (w) => (/^\d+$/.test(w) ? Number(w) : SMALL[String(w).toLowerCase()] || 0);

/** The share a text writes ("57%", "about 65 per cent", "one in seven", "two-thirds"): its board value and fraction. */
export function parseShare(value) {
  const t = str(value).toLowerCase();
  const m = new RegExp(`^(?:${QUAL}\\s+)?(?:${SHARE_CORE})$`, 'i').exec(t);
  if (!m) return null;
  if (m[1]) {
    const p = Number(m[1]);
    return p > 0 && p <= 100 ? { value: `${m[1]}%`, fraction: p / 100 } : null;
  }
  if (m[2]) {
    const n = count(m[2]);
    const d = count(m[3]);
    return n > 0 && d > n && d <= 100 ? { value: `${n} IN ${d}`, fraction: n / d } : null;
  }
  const f = WORD_FRACTIONS[m[4].toLowerCase()];
  return f ? { value: f[2], fraction: f[0] / f[1] } : null;
}

/** The source's own words for a share value: "57%" as "57 percent of", "1 IN 7" as "one in seven". */
function shareInSource(value, source) {
  const v = str(value).toUpperCase();
  const src = String(source || '');
  let m = /^(\d{1,3}(?:\.\d+)?)%$/.exec(v);
  if (m) return new RegExp(`(?<![\\d.])${esc(m[1])}\\s*(?:%|per ?cent)\\s+of\\b`, 'i').test(src);
  m = /^(\d+) IN (\d+)$/.exec(v);
  if (m) {
    const alt = (n) => (SMALL_WORD[n] ? `(?:${n}|${SMALL_WORD[n]})` : String(n));
    return new RegExp(`\\b${alt(Number(m[1]))}\\s+(?:in|out of)\\s+(?:every\\s+)?${alt(Number(m[2]))}\\b`, 'i').test(src);
  }
  const words = Object.entries(WORD_FRACTIONS).filter(([, f]) => f[2] === v).map(([w]) => esc(w));
  return words.length > 0 && new RegExp(`\\b(?:${words.join('|')})\\s+of\\b`, 'i').test(src);
}

/** Does a script say the share the board shows ("65 percent of", "six in 10")? */
export function saysShare(text, value) {
  return shareInSource(value, text);
}

function shareQualifier(value, source) {
  const v = str(value).toUpperCase();
  const m = /^(\d{1,3}(?:\.\d+)?)%$/.exec(v);
  const core = m ? `${esc(m[1])}\\s*(?:%|per ?cent)` : null;
  if (!core) return null;
  const q = new RegExp(`\\b(${QUAL})\\s+${core}`, 'i').exec(String(source || ''));
  return q ? q[1].toUpperCase() : null;
}

/** A board's lead and label stand on their own: no pronoun, no digit, no quotation, never ending on a joining word. */
function shareTextOk(lead, label) {
  if (!label || hasPronoun(`${lead} ${label}`) || /\d/.test(`${lead} ${label}`) || QUOTED.test(`${lead} ${label}`)) return false;
  if (JOIN_END.test(label) || LABEL_HANGS.test(label)) return false;
  // (a lead may end on its preposition, the share follows it: "ISRAEL RESTRICTS ACCESS TO | 65% | OF GAZA"; never on an
  // article or a conjunction, and never a relative clause: "which affects just | 0.19% | of dogs")
  if (lead && (/\b(?:a|an|the|and|or|but|that|which|who)$/i.test(lead) || /^(?:which|who|whom|whose|that|where|when)\b/i.test(lead))) return false;
  if (label.length > SHARE_LIMITS.label || words(label) > SHARE_LIMITS.labelWords || words(label) < 1) return false;
  if (lead && (lead.length > SHARE_LIMITS.lead || words(lead) > SHARE_LIMITS.leadWords)) return false;
  // a statement: the verb is in the lead ("Women make up | 57% | of players") or in the label ("65% | of Gaza is behind
  // the line")
  return lead ? hasFiniteVerb(lead) || hasFiniteVerb(`x ${lead}`) : LABEL_VERB.test(label.replace(/^of\s+/i, '').split(' ').slice(1).join(' '));
}

/**
 * SHARE: the first part of a whole a story's sentences state as a statement of their own, { value, fraction, lead,
 * label, qualifier? }: "Women make up 57% of players" -> { value: '57%', lead: 'WOMEN MAKE UP', label: 'OF PLAYERS' };
 * "One in seven properties are at risk of flooding" -> { value: '1 IN 7', lead: '', label: 'PROPERTIES ARE AT RISK
 * OF FLOODING' }. Never a movement ("rose by 5%"), a quotation, a question, or a clause that leans on another line.
 */
export function shareFrom(sentences) {
  for (const raw of sentences || []) {
    const t = plain(raw).replace(/[.!]+$/, '');
    if (QUOTED.test(t)) continue;
    for (const m of t.matchAll(SHARE_RE)) {
      const [whole, qual, pct, , , word, of] = m;
      if ((pct || word) && !of) continue; // "57% of", "two-thirds of": a part of a whole
      if (pct && MOVED_BEFORE.test(t.slice(Math.max(0, m.index - 24), m.index))) continue;
      const parsed = parseShare(whole.replace(/\s+of$/i, ''));
      if (!parsed) continue;
      const before = t.slice(0, m.index);
      const start = Math.max(before.lastIndexOf(', '), before.lastIndexOf('; '), before.lastIndexOf(': '), before.search(/\s[–—]\s(?!.*\s[–—]\s)/)) + 1;
      let lead = before.slice(start).replace(/^[\s,;:–—]+/, '').trim();
      const after = t.slice(m.index + whole.length);
      // (the clause ends at a comma, a conjunction, or an "and" that starts a verb of its own: "65 percent of Gaza
      // and crams 2.1 million people into the rest")
      const end = after.search(/[,;:()–—]|\s(?:but|while|whereas|because|although|though|after|before|when|since|amid|despite|according to)\s|\sand\s+\p{Ll}+(?:s|ed)\b/iu);
      const label = `${of ? 'of ' : ''}${(end < 0 ? after : after.slice(0, end)).trim()}`.trim();
      if (SAID_END.test(lead) || words(lead) > SHARE_LIMITS.leadWords) lead = '';
      lead = lead.replace(/^(?:and|but|so|while)\s+/i, '');
      let q = qual || null;
      if (LEAD_QUALIFIER.test(lead)) [q, lead] = [lead, ''];
      if (!shareTextOk(lead, label)) continue;
      const qualifier = q ? q.toUpperCase() : null;
      return { value: parsed.value, fraction: parsed.fraction, lead: lead.toUpperCase(), label: label.toUpperCase(), ...(qualifier ? { qualifier } : {}) };
    }
  }
  return null;
}

/** The validator's SHARE: the source writes the share, and the lead and label are its words. */
export function normalizeShare(s, source) {
  if (!s || typeof s !== 'object') return null;
  const parsed = parseShare(s.value);
  if (!parsed || !shareInSource(parsed.value, source)) return null;
  const lead = str(s.lead).replace(/[.!,;:]+$/, '');
  const label = str(s.label).replace(/[.!,;:]+$/, '');
  if (!shareTextOk(lead, label) || !claimGrounded(`${lead} ${label}`, source, 0.8)) return null;
  const qualifier = shareQualifier(parsed.value, source);
  return { value: parsed.value, fraction: Math.round(parsed.fraction * 1000) / 1000, lead: lead.toUpperCase(), label: label.toUpperCase(), ...(qualifier ? { qualifier } : {}) };
}

// ---------------------------------------------------------------- WHAT HAPPENS NEXT

export const NEXT_LIMITS = { what: 52, words: 10 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WD = '(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)';
const MO = '(January|February|March|April|May|June|July|August|September|October|November|December)';
const WHEN_RE = new RegExp(
  `\\b(?:on\\s+(?:${WD.replace('(', '(?:')}\\s*,?\\s+)?(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+${MO}|${MO}\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:,?\\s+(20\\d\\d))?|(?:on|this|next)\\s+${WD}|(next\\s+(?:week|month))|(later\\s+this\\s+(?:week|month))|(in\\s+the\\s+coming\\s+(?:days|weeks))|(tomorrow))\\b`,
  'i'
);
const FUTURE = /\b(?:will|(?:is|are)\s+(?:due|expected|scheduled|set|slated)\s+to|(?:is|are)\s+to)\b/i;
const UNSURE = /\b(?:if|unless|could|may|might|would|should|possibly|perhaps|not|never|no longer|cannot|can't|won't)\b/i;
// a person's day in court is no board: crime and the courts are told in full, never pinned up as a date
const COURT = /\b(?:court|sentenc\w*|charged|trial|tried|extradit\w*|plead\w*|hearing|bail|custody|funeral|burial|inquest|vigil)\b/i;
const DAY = 86_400_000;
const utcDay = (ms) => Math.floor(ms / DAY) * DAY;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** When a WHEN_RE match falls, from the day the story was published: { when, date } or null (passed, or stale). */
function whenOf(m, published, now) {
  const pub = utcDay(published);
  const today = utcDay(now);
  const ageDays = (today - pub) / DAY;
  if (m[2] || m[3]) {
    const day = Number(m[1] || m[4]);
    const month = MONTHS.indexOf(String(m[2] || m[3]).toLowerCase());
    let year = m[5] ? Number(m[5]) : new Date(pub).getUTCFullYear();
    let at = Date.UTC(year, month, day);
    if (!m[5] && at < pub) at = Date.UTC(++year, month, day);
    if (new Date(at).getUTCDate() !== day || at < today || at > today + 366 * DAY) return null;
    return { when: `${day} ${MONTHS[month].toUpperCase()}`, date: iso(at) };
  }
  if (m[6] || m[10]) {
    if (ageDays > 6) return null; // a weekday in an old story could be any week
    const at = m[10] ? pub + DAY : pub + ((WEEKDAYS.indexOf(m[6].toLowerCase()) - new Date(pub).getUTCDay() + 7) % 7) * DAY;
    if (at < today) return null;
    return { when: WEEKDAYS[new Date(at).getUTCDay()].toUpperCase(), date: iso(at) };
  }
  if (ageDays > 2) return null; // "next week" ages fast
  return { when: String(m[7] || m[8] || m[9]).replace(/\s+/g, ' ').toUpperCase(), date: null };
}

/** The step a sentence says comes next, without its date: a subject, a future verb, what happens. */
function nextClause(t, m) {
  const before = t.slice(0, m.index).trim();
  let after = t.slice(m.index + m[0].length);
  const end = after.search(/[,;:()–—]|\s(?:but|while|whereas|because|although|after|before|when|amid|as|and)\s/i);
  after = (end < 0 ? after : after.slice(0, end)).trim();
  if (/,/.test(before)) return null; // the subject sits in a clause of its own: not ours to cut
  let what = `${before.replace(/^[^,]{0,60}?\b(?:says|said|announced|confirmed)\s+(?:that\s+)?/i, '')} ${after}`.replace(/\s+/g, ' ').replace(/[.!,;:]+$/, '').trim();
  what = what.replace(/^(?:and|but|so|meanwhile|now)\s+/i, '');
  return what;
}

function nextOk(what) {
  if (!what || !/^\p{Lu}/u.test(what) || QUOTED.test(what) || hasPronoun(what) || /\d/.test(what)) return false;
  if (!FUTURE.test(what) || UNSURE.test(what) || COURT.test(what) || JOIN_END.test(what)) return false;
  if (FUTURE.exec(what).index === 0) return false; // no subject
  const n = words(what);
  return n >= 3 && n <= NEXT_LIMITS.words && what.length <= NEXT_LIMITS.what;
}

/** Every dated step ahead a story's sentences state: [{ when, date, what }], in the order the story gives them. */
export function nextSteps(sentences, { published = Date.now(), now = Date.now() } = {}) {
  const out = [];
  for (const raw of sentences || []) {
    const t = plain(raw).replace(/[.!]+$/, '');
    if (QUOTED.test(t)) continue;
    const m = WHEN_RE.exec(t);
    if (!m) continue;
    const when = whenOf(m, published, now);
    if (!when) continue;
    const what = nextClause(t, m);
    if (!nextOk(what)) continue;
    out.push({ ...when, what: what[0].toUpperCase() + what.slice(1) });
  }
  return out;
}

/** WHAT HAPPENS NEXT: the first dated step ahead the story states ("The Budget will take place" on 28 OCTOBER). */
export function nextFrom(sentences, opts = {}) {
  return nextSteps(sentences, opts)[0] || null;
}

/** The validator's WHAT HAPPENS NEXT: its date is one the source writes for a step ahead, its words the source's. */
export function normalizeNext(n, source, sentences, opts = {}) {
  if (!n || typeof n !== 'object') return null;
  const when = str(n.when).toUpperCase();
  const what = str(n.what).replace(/[.!,;:]+$/, '');
  if (!when || !nextOk(what) || !claimGrounded(what, source, 0.8)) return null;
  const step = nextSteps(sentences, opts).find((s) => s.when === when);
  return step ? { when: step.when, date: step.date, what: what[0].toUpperCase() + what.slice(1) } : null;
}

/** Does a script say the date the board shows ("on Tuesday", "28 October" or "October 28", "next week")? */
export function saysWhen(text, when) {
  const w = str(when).toLowerCase();
  const t = String(text || '');
  const dm = /^(\d{1,2}) ([a-z]+)$/.exec(w);
  if (dm) return new RegExp(`\\b${dm[1]}(?:st|nd|rd|th)?\\s+${dm[2]}\\b|\\b${dm[2]}\\s+${dm[1]}(?:st|nd|rd|th)?\\b`, 'i').test(t);
  return !!w && new RegExp(`\\b${esc(w).replace(/ /g, '\\s+')}\\b`, 'i').test(t);
}

// ---------------------------------------------------------------- WHO'S WHO

export const WHO_LIMITS = { role: 28, people: 3 };
// public roles only: a person a story names for what they do in public life
const ROLE_CORE = 'president|vice[- ]president|prime minister|premier|chancellor|minister|secretary[- ]general|secretary of state|secretary|senator|governor|mayor|pope|king|queen|prince|princess|speaker|chief executive|ceo|founder|co-founder|chair(?:man|woman|person)?|director[- ]general|director|ambassador|envoy|commissioner|spokes(?:man|woman|person)|general|admiral|commander|opposition leader|leader|professor|attorney general|chief justice|archbishop|cardinal|bishop|coach|manager|chief scientist|astronaut|administrator';
const ROLE_END = new RegExp(`(?:^|\\s)(${ROLE_CORE})$`, 'i');
const ROYAL = /^(?:pope|king|queen|prince|princess)$/i;
// words a portfolio or a rank adds to a role, lower or title case ("foreign minister", "Deputy Prime Minister")
const PORTFOLIO = /^(?:foreign|finance|defence|defense|interior|home|health|deputy|prime|economy|economic|energy|trade|justice|education|culture|environment|transport|labour|labor|agriculture|chief|vice|supreme|executive|managing|national|security|election|army|navy|air|force|military|police|state|federal|regional|provincial|opposition|party|central|bank|first|grand|lead|senior|acting|interim|outgoing|incoming|former|technology|financial|operating|allied)$/i;
const KEEP_MOD = /^(?:former|acting|interim|outgoing|incoming|deputy|vice)$/i;
// a portfolio that says what the role is for (a "chief election commissioner", a "government spokesperson"); "chief",
// "deputy" or "executive" alone do not
const SPECIFIC = /^(?:foreign|finance|defence|defense|interior|home|health|economy|economic|energy|trade|justice|education|culture|environment|transport|labour|labor|agriculture|national|security|election|army|navy|air|force|military|police|government|opposition|technology|central|allied)$/i;
// roles that say who someone is on their own ("President Lee Jae Myung", "Interior Minister ..."); the rest ("leader",
// "director", "spokesperson", "chief executive") need the body they serve ("Vatican spokesperson", "Nvidia CEO")
const STANDS_ALONE = /^(?:president|vice[- ]president|prime minister|premier|chancellor|secretary of state|senator|governor|mayor|pope|king|queen|prince|princess|speaker|attorney general|chief justice|archbishop|cardinal|bishop|opposition leader)$/i;
const STOP_MOD = /^(?:when|while|as|after|before|but|and|or|so|the|a|an|in|on|at|for|from|with|then|now|meanwhile|also|last|this|that|earlier|later|today|yesterday|by|of|under|since|if|his|her|their|its|our|new|said|says|told|to|into|between|among|including|like|against|about|over|than|which|who|whom|whose|where|what|via|alongside|both|either|neither|is|was|are|were|has|have|had|will|be|been|not)$/i;
// what follows a name that is really a place or a thing named after someone ("King Khalid International Airport")
const NAMED_AFTER = /^(?:Airport|International|University|College|School|Hospital|Street|Road|Avenue|Square|Bridge|Stadium|Arena|Mosque|Church|Cathedral|Foundation|Institute|Centre|Center|Prize|Award|Medal|Park|Station|Port|Dam|Canal|Highway|Hall|Library|Museum|Trophy|Cup)$/;
const NAME_TOKEN = /^(?:[A-Z][\p{Ll}’'.-]*\p{Ll}|Mc[A-Z]\p{Ll}+|Mac[A-Z]\p{Ll}+|O[’'][A-Z]\p{Ll}+|[A-Z]\.|[IVX]{1,4})$/u;
const PARTICLE = /^(?:de|da|del|della|di|du|dos|das|van|von|der|den|bin|ibn|al|el|la|le)$/;
const NOT_NAME = /^(?:Airport|International|Party|Cabinet|Government|Ministry|Council|House|Street|Authority|Bank|University|Company|Group|Inc|Ltd|Corp|Republic|Kingdom|States|Union|Army|Force|Forces|Police|Court|Office|Department|News|Times|Post|Agency|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Today|The|And|But|Of|In|On|At|For|With|After|Before|When|Some|All|This|That|It|He|She|They|Mr|Mrs|Ms|Dr|Sir|Lord|Lady|Minister|President|Chancellor|Secretary|Senator|Governor|Mayor)$/;
// never a person to pin up, whatever their title (the restage rule, WAVE3 §6.5)
const NEVER_WHO = /\b(?:victim|survivor|relative|widow|mother|father|parent|son|daughter|brother|sister|husband|wife|family|witness|resident|neighbou?r|passenger|bystander|pupil|student|suspect|accused|defendant|prisoner|detainee|hostage|patient|child|teenager|boy|girl)\b/i;

const tokensOf = (s) => s.split(/\s+/).filter(Boolean);
const bare = (w) => w.replace(/^[^\p{L}]+|[^\p{L}.]+$/gu, '');

/** A name read forward from a token index: 1-3 capitalised tokens (particles between), cut at a possessive. */
function nameAt(toks, i, royal) {
  const out = [];
  for (let k = i; k < toks.length && out.length < 4; k++) {
    const raw = toks[k];
    const poss = /[’']s[^\p{L}]*$/u.test(raw);
    let w = bare(raw.replace(/[’']s([^\p{L}]*)$/u, '$1'));
    if (!/^[A-Z]\.$/.test(w)) w = w.replace(/\.+$/, ''); // a full stop ends the sentence, not the name ("Jensen Huang.")
    if (PARTICLE.test(w) && out.length && k + 1 < toks.length) {
      out.push(w);
      continue;
    }
    if (NAMED_AFTER.test(w)) return null;
    // (two capitals open a name as its initials, "JD Vance", never a body: "US", "UN")
    const initials = !out.length && /^[A-Z]{2}$/.test(w) && !/^(?:US|UK|EU|UN|AI|TV|IT|PM|MP|DC|NY|LA|OK|ID)$/.test(w) && NAME_TOKEN.test(bare(toks[k + 1] || '').replace(/\.+$/, ''));
    if (!initials && (!NAME_TOKEN.test(w) || NOT_NAME.test(w) || w.length > 18)) break;
    out.push(w);
    if (poss || /[,;:.!?)]$/.test(raw.replace(/\.$/, (d) => (/^[A-Z]\.$/.test(w) ? '' : d)))) break;
  }
  while (out.length && PARTICLE.test(out.at(-1))) out.pop();
  const real = out.filter((w) => !PARTICLE.test(w) && !/^[IVX]{1,4}$/.test(w));
  if (!real.length || real.length > 3 || (real.length < 2 && !royal)) return null;
  if (real.every((w) => /^[A-Z]\.$/.test(w))) return null;
  return out.join(' ');
}

/** "Interior Minister Laurent Nuñez", "Nvidia chief executive Jensen Huang", "former Prime Minister Imran Khan". */
function titled(sentence) {
  const toks = tokensOf(sentence);
  const out = [];
  for (let j = 0; j < toks.length; j++) {
    // the longest role ending at token j ("prime minister", "chief executive")
    for (const span of [3, 2, 1]) {
      if (j - span + 1 < 0) continue;
      const roleWords = toks.slice(j - span + 1, j + 1).map(bare);
      if (/[,;:.!?)]$/.test(toks[j]) || toks.slice(j - span + 1, j).some((x) => /[,;:.!?)]$/.test(x))) continue;
      const role = roleWords.join(' ');
      if (!new RegExp(`^(?:${ROLE_CORE})$`, 'i').test(role)) continue;
      const name = nameAt(toks, j + 1, ROYAL.test(role));
      if (!name) break;
      // modifiers to the left: portfolio words (any case), then proper ones (title case, acronyms, possessives)
      const mods = [];
      let proper = false;
      let k = j - span;
      while (k >= 0 && mods.length < 4) {
        const raw = toks[k];
        if (/[,;:.!?()]["”’']*$/.test(raw) && !/^(?:[A-Z]\.){2,}$/.test(raw)) break;
        const w = bare(raw.replace(/[’']s$/u, ''));
        if (STOP_MOD.test(w)) break;
        if (PORTFOLIO.test(w) || SPECIFIC.test(w) || /^\p{Lu}/u.test(w)) {
          mods.unshift(/[’']s$/u.test(raw) ? `${w}’S` : w);
          // (a portfolio word proves nothing, capital or not: "Party founder Abhijeet Dipke")
          if ((/^\p{Lu}/u.test(w) && !PORTFOLIO.test(w)) || SPECIFIC.test(w) || /^\p{Lu}{2,}$/u.test(w.replace(/\./g, ''))) proper = true;
          k--;
          continue;
        }
        break;
      }
      // a role that is not theirs now is said as the story says it, or not at all
      const prev = k >= 0 ? bare(toks[k]).toLowerCase() : '';
      if (/^(?:late|then|would-be|deposed|ousted|jailed|exiled|disgraced|self-styled|so-called|ex)$/.test(prev)) break;
      // a role cut short is a different role: "departmental council president Martine Vassal" is no PRESIDENT (a word the
      // modifiers stopped at that is no verb and no joining word belongs to the role)
      if (k >= 0 && !/[,;:.!?()]["”’']*$/.test(toks[k]) && /^\p{Ll}/u.test(toks[k]) && !STOP_MOD.test(prev) && !looksLikeVerb(prev)) break;
      if (!proper && !STANDS_ALONE.test(role) && !mods.some((m) => SPECIFIC.test(m))) break;
      if (/^minister$|^secretary$/i.test(role) && !mods.length) break;
      const full = [...mods, role].join(' ');
      out.push({ name, role: full, at: j });
      break;
    }
  }
  return out;
}

/** "Gyanesh Kumar, the chief election commissioner," "Patrice Caine, chief executive of Thales," */
function apposed(sentence) {
  const out = [];
  const re = /(\p{Lu}[\p{L}’'.-]+(?:\s+(?:\p{Lu}[\p{L}’'.-]+|de|da|del|van|von|der|bin|al|el|la|le)){1,3}),\s+(?:(?:the|a|an)\s+)?([^,;:()“”"]{3,60}?)(?=[,;.]|$)/gu;
  for (const m of sentence.matchAll(re)) {
    const name = nameAt(tokensOf(m[1]), 0, false);
    if (!name || name.split(' ').length !== tokensOf(m[1]).length) continue;
    const phrase = m[2].trim();
    if (words(phrase) > 7 || /\d/.test(phrase) || hasPronoun(phrase) || /\b(?:who|which|that|said|says|told|is|was|has|had|and)\b/i.test(phrase)) continue;
    // (a role that leans on a noun said before is no board's: "the movement's legal director")
    if (/^\p{Ll}[\p{L}-]*[’']s\b/u.test(phrase)) continue;
    // the role is the phrase's head ("chief election commissioner") or its head with an "of" ("chief executive of Thales")
    const head = phrase.replace(/\s+(?:of|at|for)\s+(?:the\s+)?\p{Lu}[\p{L}’'-]*(?:\s+\p{Lu}[\p{L}’'-]*){0,2}$/u, '');
    const core = ROLE_END.exec(head);
    if (!core) continue;
    const mods = tokensOf(head.slice(0, core.index));
    const served = head !== phrase || mods.some((w) => SPECIFIC.test(w) || (/^\p{Lu}/u.test(w) && !PORTFOLIO.test(w)));
    if (!STANDS_ALONE.test(core[1]) && !served) continue;
    if (/^(?:late|then|would-be|deposed|ousted|jailed|exiled|disgraced|self-styled|so-called)\b/i.test(phrase)) continue;
    out.push({ name, role: phrase, at: m.index });
  }
  return out;
}

const surname = (name) => name.split(' ').filter((w) => !PARTICLE.test(w) && !/^[IVX]{1,4}$/.test(w)).at(-1)?.toLowerCase() || '';

/** A role as the board writes it: upper case, at most WHO_LIMITS.role characters. Only a country's possessive or its
 * adjective may go to make it fit ("JAPAN’S DEPUTY DEFENSE MINISTER" -> "DEPUTY DEFENSE MINISTER"), never part of
 * a body's name ("Cockroach Janata Party founder" is not cut to "JANATA PARTY FOUNDER"). */
function boardRole(role) {
  let toks = tokensOf(role);
  const fits = () => toks.join(' ').length <= WHO_LIMITS.role;
  if (!fits() && toks.length > 2 && (/[’']S$/i.test(toks[0]) || /^(?:\p{Lu}\p{Ll}+(?:an|ian|ese|ish|i|ic)|US|UK|EU|UN|U\.S\.|U\.K\.)$/u.test(toks[0])) && !KEEP_MOD.test(toks[0])) toks = toks.slice(1);
  return fits() ? toks.join(' ').toUpperCase() : null;
}

const VERB_LIKE = /^(?:met|said|told|called|urged|warned|accused|praised|criticised|criticized|thanked|named|appointed|replaced|succeeded|visited|joined|hosted|backed|blamed|asked|invited|sacked|fired|elected|endorsed|congratulated|welcomed|condemned|according)$/;
/** A lowercase word that reads as a verb ("met", "urges", "warned"), not as part of a role ("council", "regional"). */
function looksLikeVerb(w) {
  return VERB_LIKE.test(w) || /^[a-z]{3,}ed$/.test(w) || (/^[a-z]{3,}s$/.test(w) && !/(?:ss|us|is|al|ics)$/.test(w));
}

/** Every person a text names with a public role, in the order it first names them: [{ name, role }]. */
export function peopleWithRoles(text) {
  const found = new Map();
  for (const raw of sentencesIn(text || '')) {
    const s = plain(raw);
    for (const p of [...titled(s), ...apposed(s)].sort((a, b) => a.at - b.at)) {
      const key = surname(p.name);
      if (!key || found.has(key) || NEVER_WHO.test(p.role)) continue;
      const role = boardRole(p.role);
      if (role) found.set(key, { name: p.name, role });
    }
  }
  return [...found.values()];
}

/** WHO'S WHO: two or three people a story names with their public roles; null when it names fewer. */
export function whoFrom(text, max = WHO_LIMITS.people) {
  const people = peopleWithRoles(text).slice(0, max);
  return people.length >= 2 ? people : null;
}

/**
 * The validator's WHO'S WHO: each person is one the source names with that role (the source's role wins over the
 * writer's wording), two or three of them.
 */
export function normalizeWho(list, source) {
  if (!Array.isArray(list)) return null;
  const known = new Map(peopleWithRoles(source).map((p) => [surname(p.name), p]));
  const out = [];
  for (const item of list) {
    const name = str(item?.name);
    const p = known.get(surname(name));
    if (!p || !new RegExp(`\\b${esc(name)}\\b`).test(String(source)) || out.some((o) => o.name === p.name)) continue;
    out.push({ name: p.name, role: p.role });
    if (out.length >= WHO_LIMITS.people) break;
  }
  return out.length >= 2 ? out : null;
}

/** Does a script say a person (their surname, or their royal name)? */
export function saysPerson(text, name) {
  const key = surname(name);
  return !!key && new RegExp(`\\b${esc(key)}\\b`, 'i').test(String(text || ''));
}

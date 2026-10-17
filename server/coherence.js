// The coherence gate: a sentence lifted from a source leans on what the programme never said. Read in an article, "the
// department did not directly answer those questions" follows the questions; told on air after a story that never asked
// them, it points at nothing. The fallback writer (server/providers/mock.js tellLine, selfStanding, the kept-back line of
// an exchange) asks `untold` of every sentence it lifts, and the length gate's lint (tools/lengths/lint.mjs) counts what
// still airs. Real cases from the replays of 12-16 Oct (docs/roadmap/critique/fallback-lengths.md, round 5):
//   "One more line from the report: the department did not directly answer those questions."   (demonstrative)
//   "The temporary shutdown disrupted oil exports and increased risks for the energy markets."  (definite)
//   "In a second attack on Sunday, the militia killed another civilian and injured 11 others."  (sequel)
//   "In early September, drones also severely damaged the Saudi East-West oil pipeline."        (also)
//   "Many residents here raise sheep and goats beside homes made from corrugated metal."        (here)
//   "The two were unharmed in the incident." / "The last stint was in 2018."                    (sequel)
//   "Two days later, Trump was back on his social media website…"                              (sequel)
//   "…the witness added." / "…the girl's body…"                                                  (person)

// "those questions", "these measures", "such attacks", "this approach": the noun must have been said (after its adjectives:
// "this new AI-powered era" once lost a TECH BYTES line for want of a "new", round 5)
const DEMONSTRATIVE = /\b(?:those|these|such|this)\s+(?:(?:new|latest|recent|current|growing|ongoing|so-called|particular|whole|entire|same|other|very|first|last|next|big|major|small)\s+)*(?!(?:week|weekend|month|year|morning|afternoon|evening|night|time|times|season|summer|winter|spring|autumn|fall|day|days|years|months|weeks|decade|century|is|was|are|were|will|would|has|had|have|can|could|may|might|must|should|means?|meant|includes?|included|comes?|came|happens?|happened|one|ones|kind|sort|type|story|report|article|programme|edition|show|summer's|year's|week's|month's|stage|point|moment|period|era|case|regard|respect|way|time's)\b)(?!(?<=\bthose\s)(?:[a-z]+ing|who|whom|with|in|on|at|from|affected|involved|responsible|arrested|aged|over|under|of|that|which|than|killed|injured|wounded|detained|held|named|accused|charged|seeking|still)\b)([a-z][a-z-]{2,})/i;
// "the shutdown", "the temporary closure", "the move": an event the programme must have told
const DEFINITE = /\b[Tt]he\s+(?:(?:temporary|latest|recent|new|initial|planned|proposed|reported|alleged|sudden|apparent|brief|partial|full|two-day|three-day|week-long|month-long)\s+)?(shutdown|closure|suspension|outage|move|decision|ban|ruling|announcement|incident|crackdown|deal|agreement|cuts|delay|switchover|blockade|halt|pause|disruption|blackout|explosion|blast|collapse|leak|breach|restrictions|measures|changes|accusations?|allegations?|questions|claims|revelations|findings|problem|issue|situation)\b(?!\s+(?:of|that|to|by|over|against|on|in)\b)/;
// a person the story speaks of as already met: "the witness added", "the girl's body", "the couple"
const PERSON = /\b[Tt]he\s+(witness|girl|boy|man|men|woman|women|child|teenager|victim|suspect|couple|pair|driver|pilot|passenger|mother|father|son|daughter|husband|wife|officer|gunman|attacker)(?:['’]s)?\b(?!\s+(?:who|whose|that|of|from|in|at|on|accused|charged|arrested|killed|found|named|identified|aged))/;
// a sequel to something told before: "a second attack", "another civilian", "the last stint", "the two were…"
// (never a count that carries its own first: "for a second consecutive day", "for the third time")
const SEQUEL = /(?<!\bfor\s(?:only\s|just\s|merely\s)?)\b(?:a|the)\s+(?:second|third|fourth|fifth|further|subsequent|separate)\s+(?!(?:consecutive|straight|successive|running|year)\b)(?:[a-z-]+\s+)?(?:attacks?|strikes?|raids?|blasts?|explosions?|incidents?|cases?|deaths?|victims?|shootings?|stabbings?|arrests?|waves?|rounds?|days?|nights?|times?|votes?|tests?|launch(?:es)?|flights?|ships?|vessels?|drones?|missiles?|earthquakes?|quakes?|fires?|storms?|floods?|outbreaks?|bod(?:y|ies)|sailors?|crew)\b|\banother\s+(?:\d+\s+)?(?:civilians?|persons?|people|man|men|woman|women|child|children|boy|girl|soldiers?|officers?|victims?|attacks?|strikes?|incidents?|cases?|deaths?|ships?|vessels?|drones?|missiles?|bod(?:y|ies)|one)\b|\b[Tt]he\s+(?:last|latest|previous)\s+(?:stint|bout|time|one|round|episode|attempt|occasion)\b|^The\s+(?:two|three|four|pair|couple)\s+(?:were|are|was|is|have|had|will|would|said|say)\b|^(?:Two|Three|Four|Five|Several|Many|Some|The)\s+others\b|^(?:Most|Many|Some|Few|None|Half|All)\s+(?:of them\s+)?(?:were|are|was|had|have|did)\b|^(?:(?:Two|Three|Four|Five|Six|Seven|Ten|Several|A few|\d+)\s+(?:days?|weeks?|months?|years?|hours?|minutes?)|A (?:day|week|month|year)|Days|Weeks|Months|Years|Hours|Moments|Minutes)\s+later\b|^The (?:next|following) (?:day|week|month|morning|year)\b|\b(?:subsequently|afterwards|thereafter)\b/;
// "also", "again", "too" at the end: told after what it adds to
const ALSO = /\b(?:also|again)\b|,?\s+too\.?$/i;
// a connective that answers the sentence before: "As for “The Social Reckoning,” …", "Nor is Honeyjar trying…", "Or maybe
// the real audience…", "However, in reality, that might not be the case" (TechCrunch 12 Oct, round 5)
const CONNECTIVE = /^(?:As for\b|Nor\b|Or (?:maybe|perhaps)\b|Later(?: came\b|,)|Even so\b|Instead\b|By contrast\b|In contrast\b|However\b|But\b|Yet\b|Still,|Besides\b|Likewise\b|Similarly\b|That said\b)/;
// a reporter's "here" (the presenter is in the studio): never "here is", "here's", "here are"
const HERE = /(?<!\b(?:getting|get|gets|got|finally|now|arrived|is|it['’]s|be)\s)\b[Hh]ere\b(?!\s+(?:is|are|was|were|comes?|we)\b)(?!['’]s)(?![^.?!]*\?)/;

// The noun's stem is in what was said ("questions" after "asked… questions", "shutdown" after "shut down").
const said = (noun, told) => {
  const stem = String(noun).toLowerCase().replace(/(?:ies|es|s)$/, '').slice(0, Math.max(4, noun.length - 3));
  return new RegExp(`\\b${stem.replace(/[-]/g, '[- ]?')}`, 'i').test(String(told).replace(/shut\s+down/gi, 'shutdown'));
};

// "that question" (never "that" joining a clause: only before a noun a story points back at), "something similar", "since then"
const THAT_NOUN = /\bthat\s+(question|claim|plan|decision|move|deal|idea|problem|issue|approach|effort|project|proposal|change|request|figure|number|policy|scheme|law|bill|ruling|report|incident|attack|footage|video|image|post)\b/i;
const SIMILAR = /\b(?:something|anything) similar\b|\bthe same (?:thing|way|move|approach|fate)\b|\bsince then\b|\bby then\b|\bafter that\b/i;

export const COHERENCE_RULES = ['demonstrative', 'definite', 'person', 'sequel', 'also', 'here'];

/**
 * The first rule a lifted sentence breaks, or null. `told`: what the programme has said of the story before it (its
 * headline included). `prevSaid`: the sentence before it in the source was said, so it reads in its own order and may
 * lean on it (never "here": a reporter's place is never the studio).
 */
export function untold(sentence, told = '', { prevSaid = false } = {}) {
  // (LENGTHS_NO_GATE=1: the replay without the gate, to measure what it costs; tools/lengths/replay.mjs)
  if (process.env.LENGTHS_NO_GATE === '1') return null;
  const t = String(sentence || '').replace(/“[^”]*”|"[^"]*"/g, ' ');
  if (HERE.test(t)) return 'here';
  if (prevSaid) return null;
  const d = t.match(DEMONSTRATIVE) || t.match(THAT_NOUN);
  if (d && !said(d[1], told)) return 'demonstrative';
  if (SIMILAR.test(t)) return 'sequel';
  const e = t.match(DEFINITE);
  if (e && !said(e[1], told)) return 'definite';
  const p = t.match(PERSON);
  if (p && !said(p[1], told)) return 'person';
  if (SEQUEL.test(t)) return 'sequel';
  if (CONNECTIVE.test(t.trim())) return 'also';
  const a = t.match(ALSO);
  if (a) {
    // (what it speaks of: the words before "also"/"again", or the sentence's first words for a closing "too")
    const head = (a.index > 0 ? t.slice(0, a.index) : t).split(/\s+/).slice(-5);
    const words = head.map((w) => w.replace(/[^\p{L}-]/gu, '')).filter((w) => w.length >= 4 && !/^(?:that|this|they|their|there|with|from|have|were|will|would|could|said|says|which|when|where|also|again|once|then|some|many|more|most|other|after|before|while|early|late|last|first|year|month|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|september|october)$/i.test(w));
    if (!words.some((w) => said(w, told))) return 'also';
  }
  return null;
}

// IN PLAIN ENGLISH (TECH BYTES): the jargon a story used, translated flatly by Ada right after it, with a card on
// screen (tech-bytes.md §3.2: "Jargon that the summary quotes may be quoted once. Ada then translates it flatly").
// The definitions are ours, general knowledge and never a claim about the story, so they are a fixed list the
// model never writes: one line each, a noun phrase that reads after "means" and on a card.
//
//   explainTerms(segments, { program, presenters, recent, max }) -> the segments with up to `max` term lines
//   termsIn(text) -> the glossary entries a text uses, first mention first

export const GLOSSARY = [
  { term: 'bug bounty', a: 'a', match: /\bbug[- ]bount(?:y|ies)\b/i, plain: 'a reward for reporting security flaws' },
  { term: 'open source', match: /\bopen[- ]source\b/i, plain: 'software whose code anyone can read, change and share' },
  { term: 'zero-day', a: 'a', match: /\bzero[- ]days?\b/i, plain: 'a flaw attackers use before its maker can fix it' },
  { term: 'ransomware', match: /\bransomware\b/i, plain: 'malware that locks your files until you pay' },
  { term: 'phishing', match: /\bphishing\b/i, plain: 'a fake message built to steal your details' },
  { term: 'malware', match: /\bmalware\b/i, plain: 'software made to do harm' },
  { term: 'spyware', match: /\bspyware\b/i, plain: 'software that secretly watches what you do' },
  { term: 'botnet', a: 'a', match: /\bbotnets?\b/i, plain: 'hijacked computers run together by an attacker' },
  { term: 'two-factor authentication', match: /\b(?:two-factor authentication|2FA|multi-factor authentication)\b/i, plain: 'a second check, like a code, when you log in' },
  { term: 'end-to-end encryption', match: /\bend-to-end encrypt(?:ion|ed)\b/i, plain: 'a lock only the sender and the receiver can open' },
  { term: 'deepfake', a: 'a', match: /\bdeepfakes?\b/i, plain: 'a fake video or voice made with AI' },
  { term: 'large language model', a: 'a', match: /\b(?:large language models?|LLMs?)\b/, plain: 'an AI trained on vast amounts of text to write like a person' },
  { term: 'AI agent', a: 'an', match: /\bAI agents?\b/, plain: 'an AI that carries out tasks for you, not just answers' },
  { term: 'AI slop', match: /\bAI slop\b/i, plain: 'low-quality material churned out by AI' },
  { term: 'hallucination', a: 'a', match: /\bhallucinat(?:es|ed|ing|ions?)\b/i, plain: 'an AI stating something false as fact' },
  { term: 'open-weight model', a: 'an', match: /\bopen[- ]weights?(?: models?)?\b/i, plain: 'an AI model anyone can download and run' },
  { term: 'GPU', a: 'a', match: /\bGPUs?\b/, plain: 'a chip built for graphics, now the workhorse of AI' },
  { term: 'semiconductor', a: 'a', match: /\bsemiconductors?\b/i, plain: 'the material computer chips are made from' },
  { term: 'data center', a: 'a', match: /\bdata cent(?:er|re)s?\b/i, plain: 'a building full of computers that run online services' },
  { term: 'cloud computing', match: /\bcloud computing\b/i, plain: 'renting computers over the internet' },
  { term: 'API', a: 'an', match: /\bAPIs?\b/, plain: 'a way for one program to talk to another' },
  { term: 'firmware', match: /\bfirmware\b/i, plain: 'the software built into a device' },
  { term: 'lidar', match: /\blidar\b/i, plain: 'a laser sensor that maps its surroundings in 3D' },
  { term: 'robotaxi', a: 'a', match: /\brobotaxis?\b/i, plain: 'a taxi with no human driver' },
  { term: 'autonomous vehicle', a: 'an', match: /\b(?:autonomous vehicles?|AVs)\b/, plain: 'a vehicle that drives itself' },
  { term: 'solid-state battery', a: 'a', match: /\bsolid[- ]state batter(?:y|ies)\b/i, plain: 'a battery with a solid core instead of a liquid one' },
  { term: 'quantum computer', a: 'a', match: /\bquantum comput(?:er|ers|ing)\b/i, plain: 'a computer that uses quantum physics to calculate' },
  { term: 'altimeter', a: 'an', match: /\baltimeters?\b/i, plain: 'a sensor that measures height' },
  { term: 'antitrust', match: /\bantitrust\b/i, plain: 'the law against monopolies' },
  { term: 'NDA', a: 'an', match: /\b(?:NDAs?|non-disclosure agreements?)\b/, plain: 'a contract to keep something secret' },
  { term: 'VPN', a: 'a', match: /\bVPNs?\b/, plain: 'a service that hides where your connection comes from' },
  { term: 'licence plate reader', a: 'a', match: /\b(?:automated )?licen[sc]e plate readers?\b/i, plain: 'a camera that logs every number plate it sees' },
  { term: 'Fourth Amendment', a: 'the', match: /\bFourth Amendment\b/, plain: 'the US rule against unreasonable searches' },
  { term: 'executive order', a: 'an', match: /\bexecutive orders?\b/i, plain: 'a directive signed by the US president' },
];

/** The glossary entries a text uses, in order of first mention. */
export function termsIn(text) {
  const t = String(text ?? '');
  return GLOSSARY.map((g) => ({ g, at: t.search(g.match) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.g);
}

// Ada's line, several phrasings for a 24/7 rotation; flat, never a joke (tech-bytes.md: she translates it flatly).
// `a` is the article a countable term takes in a sentence ("a bug bounty is...", "the Fourth Amendment is...").
const named = (g) => (g.a ? `${g.a} ${g.term}` : g.term);
// [gesture, line]: the gesture rides as the segment's cue at its first word, as the writer's own chats carry theirs
const PHRASES = [
  (g) => ['glasses', `${cap(g.term)}, in plain English: ${g.plain}.`],
  (g) => ['chin', `For anyone wondering, ${named(g)} is ${g.plain}.`],
  (g) => ['glasses', `Translation, for the rest of us: ${named(g)} is ${g.plain}.`],
  (g) => ['nod', `${cap(g.term)}, for the record: ${g.plain}.`],
];
const cap = (s) => (/^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s);
const spoken = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, ' ');

/** A story's opening pick-up ("Thanks, Max. ...") removed, its cues moved with the text. */
function dropPickup(seg) {
  const m = String(seg.text || '').match(/^Thanks,\s+[\p{Lu}][\p{L}-]*\.\s+(?=\S)/u);
  if (!m) return;
  const n = m[0].length;
  seg.text = seg.text.slice(n);
  if (Array.isArray(seg.cues)) seg.cues = seg.cues.filter((c) => c.char >= n).map((c) => ({ ...c, char: c.char - n }));
}

/**
 * Up to `max` IN PLAIN ENGLISH lines, each right after the story whose text uses the term: a main story (never
 * the "And finally", the number of the day, a grave or breaking story, nor one a chat already follows), each term
 * once, never one explained in the recent lines (a 24/7 rotation hears a definition once in a while, not every
 * half hour), within the programme's chat budget. The speaker is the programme's explainer (TECH BYTES: Ada).
 */
export function explainTerms(segments, { program, presenters = {}, recent = [], max = 2 } = {}) {
  if (!program?.terms || !Array.isArray(segments)) return { segments, terms: 0 };
  const explainer = Object.entries(presenters).find(([, p]) => p?.id === program.terms.explainer)?.[0];
  if (!explainer) return { segments, terms: 0 };
  const chats = segments.filter((s) => s.type === 'chat').length;
  const room = Math.max(0, Math.min(max, (program.maxChats ?? Infinity) - chats));
  const heard = recent.map((l) => spoken(l).toLowerCase()).join('\n');
  const used = new Set();
  const out = [];
  let added = 0;
  const seed = [...segments.map((x) => x.storyId || '').join('|')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  segments.forEach((seg, i) => {
    out.push(seg);
    if (added >= room || seg.type !== 'story' || seg.feature || seg.grave || seg.breaking || seg.emotion === 'serious' || seg.emotion === 'sad') return;
    const next = segments[i + 1];
    if (!next || next.type !== 'story') return; // a chat already follows, or the programme ends
    const term = termsIn(spoken(seg.text)).find((g) => !used.has(g.term) && !heard.includes(g.plain.toLowerCase()));
    if (!term) return;
    used.add(term.term);
    // (two lines in one programme never share a phrasing; the episode's stories pick where the rotation starts)
    const [action, line] = PHRASES[(seed + added) % PHRASES.length](term);
    // the explainer keeps the floor into her own next story: its "Thanks, Max." goes (she has just spoken)
    if (next.anchor === explainer) dropPickup(next);
    out.push({ type: 'chat', anchor: explainer, emotion: 'neutral', text: line, cues: [{ char: 0, slot: null, action }], storyId: seg.storyId, term: { term: term.term.toUpperCase(), plain: cap(term.plain) } });
    added++;
  });
  return { segments: out, terms: added };
}

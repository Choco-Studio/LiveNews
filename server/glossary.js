// IN PLAIN ENGLISH (TECH BYTES): the jargon a story used, translated flatly by Ada right after it, with a card on
// screen (tech-bytes.md §3.2: "Jargon that the summary quotes may be quoted once. Ada then translates it flatly").
// The definitions are ours, general knowledge and never a claim about the story, so they are a fixed list the
// model never writes: one line each, a noun phrase that reads after "means" and on a card.
//
// Three sets: "tech" (TECH BYTES, Ada), "science" (COSMOS DESK, UNIT-8, who reads a definition the way he reads a
// figure: literally) and "money" (MONEY MINUTE, Penny, alone at the desk). A programme names its set and its explainer: "terms": { "explainer": "ada", "set": "tech" }.
//
//   explainTerms(segments, { program, presenters, recent, max }) -> the segments with up to `max` term lines
//   termsIn(text, set) -> the glossary entries of a set a text uses, first mention first

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
  { term: 'quantum computer', in: ['tech', 'science'], a: 'a', match: /\bquantum comput(?:er|ers|ing)\b/i, plain: 'a computer that uses quantum physics to calculate' },
  { term: 'altimeter', a: 'an', match: /\baltimeters?\b/i, plain: 'a sensor that measures height' },
  { term: 'antitrust', match: /\bantitrust\b/i, plain: 'the law against monopolies' },
  { term: 'NDA', a: 'an', match: /\b(?:NDAs?|non-disclosure agreements?)\b/, plain: 'a contract to keep something secret' },
  { term: 'VPN', a: 'a', match: /\bVPNs?\b/, plain: 'a service that hides where your connection comes from' },
  { term: 'licence plate reader', a: 'a', match: /\b(?:automated )?licen[sc]e plate readers?\b/i, plain: 'a camera that logs every number plate it sees' },
  { term: 'Fourth Amendment', a: 'the', match: /\bFourth Amendment\b/, plain: 'the US rule against unreasonable searches' },
  { term: 'executive order', a: 'an', match: /\bexecutive orders?\b/i, plain: 'a directive signed by the US president' },
  // science (COSMOS DESK): no figure in a definition, the set never shows one the channel did not report
  { term: 'exoplanet', in: ['science'], a: 'an', match: /\bexoplanets?\b/i, plain: 'a planet that orbits a star other than the Sun' },
  { term: 'light year', in: ['science'], a: 'a', match: /\blight[- ]years?\b/i, plain: 'the distance light travels in a year' },
  { term: 'black hole', in: ['science'], a: 'a', match: /\bblack holes?\b/i, plain: 'a region where gravity is so strong that not even light escapes' },
  { term: 'supernova', in: ['science'], a: 'a', match: /\bsupernova(?:e|s)?\b/i, plain: 'the explosion of a dying star' },
  { term: 'neutron star', in: ['science'], a: 'a', match: /\bneutron stars?\b/i, plain: 'the collapsed core a giant star leaves behind' },
  { term: 'nebula', in: ['science'], a: 'a', match: /\bnebula[es]?\b/i, plain: 'a cloud of gas and dust in space' },
  { term: 'dark matter', in: ['science'], match: /\bdark matter\b/i, plain: 'unseen matter known only through its gravity' },
  { term: 'dark energy', in: ['science'], match: /\bdark energy\b/i, plain: 'the unknown force speeding up the universe’s expansion' },
  { term: 'Hubble tension', in: ['science'], a: 'the', match: /\bHubble tension\b/i, plain: 'the clash between two measures of how fast the universe expands' },
  { term: 'meteorite', in: ['science'], a: 'a', match: /\bmeteorites?\b/i, plain: 'a piece of space rock that reaches the ground' },
  { term: 'solar flare', in: ['science'], a: 'a', match: /\bsolar flares?\b/i, plain: 'a sudden burst of energy from the Sun’s surface' },
  { term: 'coronal mass ejection', in: ['science'], a: 'a', match: /\bcoronal mass ejections?\b/i, plain: 'a vast cloud of charged gas thrown out by the Sun' },
  { term: 'aurora', in: ['science'], a: 'an', match: /\baurora(?:e|s)?\b/i, plain: 'light in the sky made by particles from the Sun meeting the air' },
  { term: 'magnetosphere', in: ['science'], a: 'a', match: /\bmagnetospheres?\b/i, plain: 'the magnetic bubble that shields a planet' },
  { term: 'rover', in: ['science'], a: 'a', match: /\brovers?\b/i, plain: 'a robot vehicle that drives across another world' },
  { term: 'lander', in: ['science'], a: 'a', match: /\blanders?\b/i, plain: 'a spacecraft that sets down on a surface and stays there' },
  { term: 'zircon', in: ['science'], match: /\bzircons?\b/i, plain: 'a tough mineral whose crystals keep a record of their age' },
  { term: 'mass extinction', in: ['science'], a: 'a', match: /\bmass extinctions?\b/i, plain: 'the loss of a large share of Earth’s species in a short time' },
  { term: 'catalyst', in: ['science'], a: 'a', match: /\bcatalysts?\b/i, plain: 'a substance that speeds up a reaction without being used up' },
  { term: 'enzyme', in: ['science'], a: 'an', match: /\benzymes?\b/i, plain: 'a protein that speeds up a chemical reaction in the body' },
  { term: 'mitochondria', in: ['science'], match: /\bmitochondri(?:a|on|al)\b/i, plain: 'the parts of a cell that make its energy' },
  { term: 'microbiome', in: ['science'], a: 'the', match: /\bmicrobiomes?\b/i, plain: 'the community of microbes living in and on the body' },
  { term: 'clinical trial', in: ['science'], a: 'a', match: /\bclinical trials?\b/i, plain: 'a study that tests a treatment on volunteers' },
  { term: 'CRISPR', in: ['science'], match: /\bCRISPR\b/, plain: 'a tool for editing the genes of living things' },
  { term: 'stem cells', in: ['science'], match: /\bstem cells?\b/i, plain: 'cells that can become many other kinds of cell' },
  { term: 'antibodies', in: ['science'], match: /\bantibod(?:y|ies)\b/i, plain: 'proteins the immune system makes to fight infection' },
  { term: 'permafrost', in: ['science'], match: /\bpermafrost\b/i, plain: 'ground that stays frozen all year round' },
  { term: 'El Niño', in: ['science'], match: /\bEl Ni[ñn]o\b/, plain: 'a warming of the Pacific that shifts weather around the world' },
  { term: 'La Niña', in: ['science'], match: /\bLa Ni[ñn]a\b/, plain: 'a cooling of the Pacific that shifts weather around the world' },
  { term: 'ozone layer', in: ['science'], a: 'the', match: /\bozone layer\b/i, plain: 'the band of gas high above Earth that blocks harmful sunlight' },
  { term: 'greenhouse gas', in: ['science'], a: 'a', match: /\bgreenhouse gas(?:es)?\b/i, plain: 'a gas that traps heat in the atmosphere' },
  { term: 'carbon capture', in: ['science'], match: /\bcarbon capture\b/i, plain: 'trapping carbon dioxide before it reaches the air' },
  { term: 'tectonic plates', in: ['science'], match: /\btectonic plates?\b/i, plain: 'the giant slabs of rock that make up Earth’s surface' },
  { term: 'magma', in: ['science'], match: /\bmagma\b/i, plain: 'melted rock beneath the ground' },
  { term: 'photosynthesis', in: ['science'], match: /\bphotosynthesis\b/i, plain: 'how plants turn sunlight into food' },
  { term: 'biodiversity', in: ['science'], match: /\bbiodiversity\b/i, plain: 'the variety of living things in a place' },
  { term: 'radiocarbon dating', in: ['science'], match: /\bradiocarbon dat(?:ing|ed)\b/i, plain: 'working out an object’s age from its carbon' },
  // MONEY MINUTE (Penny): the words of a markets page, said plainly; no figure in a definition (the set never shows one
  // the channel did not report), never advice
  { term: 'core inflation', in: ['money'], match: /\bcore inflation\b/i, plain: 'price rises leaving out food and energy' },
  { term: 'inflation', in: ['money'], match: /\binflation\b/i, plain: 'the pace at which prices rise over time' },
  { term: 'stagflation', in: ['money'], match: /\bstagflation\b/i, plain: 'high inflation while the economy stalls' },
  { term: 'interest rate', in: ['money'], a: 'an', match: /\binterest rates?\b/i, plain: 'the price of borrowing money' },
  { term: 'base rate', in: ['money'], a: 'the', match: /\bbase rate\b/i, plain: 'the Bank of England’s main interest rate' },
  { term: 'central bank', in: ['money'], a: 'a', match: /\bcentral banks?\b/i, plain: 'the body that sets a country’s interest rates' },
  { term: 'mortgage rate', in: ['money'], a: 'a', match: /\bmortgage rates?\b/i, plain: 'the interest charged on a home loan' },
  { term: 'bond yield', in: ['money'], a: 'a', match: /\b(?:bond|gilt|treasury|Treasury) yields?\b/, plain: 'the return investors get for lending to a government or firm' },
  { term: 'gilts', in: ['money'], match: /\bgilts\b/i, plain: 'bonds the UK government sells to borrow money' },
  { term: 'recession', in: ['money'], a: 'a', match: /\brecessions?\b/i, plain: 'a spell in which the whole economy shrinks' },
  { term: 'GDP', in: ['money'], match: /\bGDP\b/, plain: 'the total value of everything an economy produces' },
  { term: 'budget deficit', in: ['money'], a: 'a', match: /\bbudget deficits?\b/i, plain: 'a government spending more than it takes in' },
  { term: 'trade deficit', in: ['money'], a: 'a', match: /\btrade deficits?\b/i, plain: 'a country buying more from abroad than it sells' },
  { term: 'national debt', in: ['money'], a: 'the', match: /\bnational debt\b/i, plain: 'everything a government owes' },
  { term: 'unemployment rate', in: ['money'], a: 'the', match: /\bunemployment rate\b/i, plain: 'the share of people who want work but have none' },
  { term: 'cost of living', in: ['money'], a: 'the', match: /\bcost[- ]of[- ]living\b/i, plain: 'what people pay for everyday essentials' },
  { term: 'bull market', in: ['money'], a: 'a', match: /\bbull(?:ish)? markets?\b|\bbull runs?\b/i, plain: 'a long stretch of rising share prices' },
  { term: 'bear market', in: ['money'], a: 'a', match: /\bbear markets?\b/i, plain: 'a long, deep slide in share prices' },
  { term: 'market rally', in: ['money'], a: 'a', match: /\b(?:stock|share|market|stock-market) rall(?:y|ies)\b/i, plain: 'a run of rising prices after a fall or a pause' },
  { term: 'IPO', in: ['money'], a: 'an', match: /\bIPOs?\b|\binitial public offerings?\b/i, plain: 'a company selling its shares to the public for the first time' },
  { term: 'dividend', in: ['money'], a: 'a', match: /\bdividends?\b/i, plain: 'a share of a company’s profits paid to its shareholders' },
  { term: 'market value', in: ['money'], a: 'the', match: /\bmarket (?:cap|capitali[sz]ation|value|valuation)\b/i, plain: 'what all of a company’s shares are worth together' },
  { term: 'valuation', in: ['money'], a: 'a', match: /\bvaluations?\b/i, plain: 'what investors think a company is worth' },
  { term: 'annualised revenue', in: ['money'], match: /\bannuali[sz]ed revenue\b|\brun[- ]rate\b/i, plain: 'a year’s sales, estimated from the latest months' },
  { term: 'earnings season', in: ['money'], match: /\bearnings (?:season|reports?)\b/i, plain: 'the weeks when big companies report their profits' },
  { term: 'tariff', in: ['money'], a: 'a', match: /\btariffs?\b/i, plain: 'a tax on goods brought in from abroad' },
  { term: 'sanctions', in: ['money'], match: /\bsanctions\b/i, plain: 'penalties that limit trade with a country or a person' },
  { term: 'supply chain', in: ['money'], a: 'a', match: /\bsupply chains?\b/i, plain: 'the network of firms that make and move a product' },
  { term: 'quantitative easing', in: ['money'], match: /\bquantitative easing\b/i, plain: 'a central bank creating money to buy bonds' },
  { term: 'short selling', in: ['money'], match: /\bshort[- ]sell(?:ing|ers?)\b/i, plain: 'betting that a share price will fall' },
  { term: 'hedge fund', in: ['money'], a: 'a', match: /\bhedge funds?\b/i, plain: 'an investment fund that uses riskier strategies' },
  { term: 'private equity', in: ['money'], match: /\bprivate equity\b/i, plain: 'investors who buy companies to rework and sell them' },
  { term: 'venture capital', in: ['money'], match: /\bventure capital(?:ists?)?\b/i, plain: 'money invested in young companies for a stake in them' },
  { term: 'windfall tax', in: ['money'], a: 'a', match: /\bwindfall tax(?:es)?\b/i, plain: 'a one-off tax on unexpectedly large profits' },
  { term: 'levy', in: ['money'], a: 'a', match: /\blev(?:y|ies)\b/i, plain: 'a charge collected for a particular purpose' },
  { term: 'credit rating', in: ['money'], a: 'a', match: /\bcredit ratings?\b/i, plain: 'a verdict on how likely a borrower is to pay back' },
  { term: 'liquidity', in: ['money'], match: /\bliquidity\b/i, plain: 'how easily something can be turned into cash' },
  { term: 'antitrust', in: ['money'], match: /\banti-?trust\b/i, plain: 'the rules that stop companies growing too powerful' },
];
/** The set an entry belongs to (untagged entries are the first set, TECH BYTES' "tech"). */
const setsOf = (g) => g.in || ['tech'];

/** The glossary entries of `set` a text uses, in order of first mention. */
export function termsIn(text, set = 'tech') {
  const t = String(text ?? '');
  return GLOSSARY.filter((g) => setsOf(g).includes(set))
    .map((g) => ({ g, at: t.search(g.match) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.g);
}

// Ada's line, several phrasings for a 24/7 rotation; flat, never a joke (tech-bytes.md: she translates it flatly).
// `a` is the article a countable term takes in a sentence ("a bug bounty is...", "the Fourth Amendment is...").
const named = (g) => (g.a ? `${g.a} ${g.term}` : g.term);
// [gesture, line]: the gesture rides as the segment's cue at its first word, as the writer's own chats carry theirs
// UNIT-8 (COSMOS DESK) reads a definition as he reads a figure: logged, exact, to Dr Reyes.
const PHRASES = {
  default: [
    (g) => ['glasses', `${cap(g.term)}, in plain English: ${g.plain}.`],
    (g) => ['chin', `For anyone wondering, ${named(g)} is ${g.plain}.`],
    (g) => ['glasses', `Translation, for the rest of us: ${named(g)} is ${g.plain}.`],
    (g) => ['nod', `${cap(g.term)}, for the record: ${g.plain}.`],
  ],
  // Penny (MONEY MINUTE, alone at the desk): to camera, calm, the term then its meaning; never a joke, never advice
  penny: [
    (g) => ['nod', `${cap(g.term)}, in plain English: ${g.plain}.`],
    (g) => ['steeple', `A quick translation: ${named(g)} is ${g.plain}.`],
    (g) => ['nod', `If the term is new to you, ${named(g)} is ${g.plain}.`],
    (g) => ['steeple', `The jargon, briefly: ${named(g)} is ${g.plain}.`],
  ],
  unit8: [
    (g) => ['nod', `Term logged: ${g.term}. Meaning: ${g.plain}.`],
    (g) => ['nod', `For the record, Dr Reyes: ${named(g)} is ${g.plain}.`],
    (g) => ['nod', `I have looked it up. ${cap(named(g))} is ${g.plain}.`],
    (g) => ['nod', `Definition filed: ${named(g)} is ${g.plain}.`],
  ],
};
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
  const set = program.terms.set || 'tech';
  const phrases = PHRASES[program.terms.explainer] || PHRASES.default;
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
    const term = termsIn(spoken(seg.text), set).find((g) => !used.has(g.term) && !heard.includes(g.plain.toLowerCase()));
    if (!term) return;
    used.add(term.term);
    // (two lines in one programme never share a phrasing; the episode's stories pick where the rotation starts)
    const [action, line] = phrases[(seed + added) % phrases.length](term);
    // the explainer keeps the floor into her own next story: its "Thanks, Max." goes (she has just spoken)
    if (next.anchor === explainer) dropPickup(next);
    out.push({ type: 'chat', anchor: explainer, emotion: 'neutral', text: line, cues: [{ char: 0, slot: null, action }], storyId: seg.storyId, term: { term: term.term.toUpperCase(), plain: cap(term.plain) } });
    added++;
  });
  return { segments: out, terms: added };
}

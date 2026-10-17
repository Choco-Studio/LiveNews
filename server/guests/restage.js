// IN THEIR WORDS, re-staged (owner 12 Oct: "Esto necesitamos llevarlo a un nivel superior. Si decimos las palabras
// como las dijo la persona que representa no debería de haber problema y además es un contenido extra que mejora los
// programas"; decision 4, 5 Oct: politicians and heads of state too, with the balance rule). A person a story quotes
// appears in a press room and says their own words: a RECREATION, labelled as one, in a generic synthetic voice that
// never imitates theirs, with a respectful pixel look (never a mocking one). The rules (docs/roadmap/WAVE3.md §6):
//   - the words are a quotation the story's source attributes to that very speaker, copied whole (never trimmed inside
//     a clause, never two quotes spliced): the validator's grounded `quote` (server/facts.js groundQuote)
//   - a person in a public role: politicians and heads of state, officials and spokespeople, executives, scientists.
//     Never victims, relatives, witnesses, children, private people, the accused or a company speaking as a company
//   - a grave story (deaths, violence, disaster, illness): only officials and politicians speaking in their role (a
//     minister on a disaster), staged soberly (owner, decision 3, 12 Oct: "se presentan con respeto pero bien");
//     never anyone else in it
//   - balance: a story naming two or more political sides needs re-staged words from two sides; with one quote it
//     keeps the quote card
//   - a person named and checked (server/guests/identity.js: an adult, alive, with a public profile) gets their own
//     look kept for 30 days; an unnamed one ("the mayor") a generic look, labelled by role
//
//   speakerProfile(by, source)            who said it: { name, role, org, kind, presentation }
//   politicalSides(text)                  the political sides a story names (balance rule)
//   restageCheck({ quote, source, story, grave })   { ok, reasons, speaker }
//   bookGuest(speaker, { outlet, identity })        the booking: { id, kind: 'restaged', name, role, label, look, voice, likeness }
//   provenanceLine(booking, seed)         the presenter's line that hands over to the recreation
//   restageHold({ speaker, identity, story, now })  the compliance holds once the identity is known (an election
//                                         period, a person who asked not to be re-staged): [reasons] (compliance.md §5)
//   configureRestage({ calendar, blocked })         the server's election calendar and opt-out register
import crypto from 'node:crypto';
import { isGrave } from '../facts.js';
import { electionHold } from '../compliance/elections.js';

// The compliance context (docs/publishing/compliance.md §5): the server hands over its election calendar (a
// function: the newest calendar) and its register of people who asked not to be re-staged (server/index.js). Unset
// (a test, a tool), nothing is held here; the publish-time check (server/compliance/clips.js) applies both again.
const context = { calendar: null, blocked: null };
export function configureRestage({ calendar = null, blocked = null } = {}) {
  context.calendar = typeof calendar === 'function' ? calendar : calendar ? () => calendar : null;
  context.blocked = typeof blocked === 'function' ? blocked : null;
}

/**
 * The holds that need the person's identity (Wikidata, after restageCheck): an election period for a politician of
 * a country about to vote, a named candidate, and anyone who asked not to be re-staged. `calendar` and `blocked`
 * default to the server's (configureRestage). -> [reasons] (empty: no hold)
 */
export function restageHold({ speaker, identity = null, story = null, now = Date.now(), calendar = undefined, blocked = undefined } = {}) {
  const reasons = [];
  if (!speaker) return reasons;
  const isBlocked = blocked === undefined ? context.blocked : blocked;
  if (isBlocked) {
    try {
      const b = isBlocked({ name: speaker.name, role: speaker.role, qid: identity?.qid || null });
      if (b) reasons.push(`asked not to be re-staged (${typeof b === 'string' ? b : 'register'}): the quote card stays`);
    } catch { /* the register is read again next time */ }
  }
  const cal = calendar === undefined ? context.calendar?.() : calendar;
  if (cal) reasons.push(...electionHold({ speaker, story, identity, now, calendar: cal }).reasons);
  return reasons;
}

// Public roles (title words, a name may follow or precede them). A role names the kind; the order matters: the first
// match wins ("former prime minister" is a politician, "health minister" too).
const ROLES = [
  ['politician', /\b(?:president|vice[- ]president|prime minister|premier|chancellor|minister|pope|secretary of state|foreign secretary|home secretary|senator|congress(?:wo)?man|representative|mp|member of parliament|lawmaker|governor|mayor|leader of the opposition|opposition leader|party leader|king|queen|emir|sultan|monarch|head of state|first minister|deputy prime minister)\b/i],
  ['official', /\b(?:spokes(?:wo)?man|spokesperson|official|commissioner|archbishop|cardinal|bishop|chief rabbi|grand mufti|secretary[- ]general|director[- ]general|director|ambassador|envoy|police chief|chief constable|commander|general|admiral|regulator|chair(?:wo)?man of the (?:federal reserve|central bank)|central bank governor|head of the [a-z ]+(?:agency|authority|bank|service|organisation|organization)|chief medical officer|attorney general|prosecutor)\b/i],
  ['executive', /\b(?:chief executive|ceo|chief financial officer|cfo|chief technology officer|cto|founder|co-founder|chair(?:wo)?man|chairperson|managing director|executive|boss)\b/i],
  ['scientist', /\b(?:scientist|researcher|astronomer|physicist|biologist|ecologist|climatologist|professor|lead author|lead researcher|study author|engineer|doctor|dr)\b/i],
];
// Never re-staged (WAVE3 §6.5): whatever else they are, these words in the speaker's description rule them out
const NEVER = /\b(?:victim|victims|survivor|relative|relatives|widow|widower|mother|father|parent|son|daughter|brother|sister|husband|wife|family|witness|eyewitness|resident|neighbou?r|passenger|bystander|pupil|student|schoolgirl|schoolboy|child|boy|girl|teen(?:ager)?|minor|fan|customer|shopper|worker|patient|suspect|accused|defendant|detainee|prisoner|inmate|gunman|attacker)\b/i;
// a company, a government or a body speaking as one is not a person to put on screen
const BODIES = /^(?:the |a |an )?(?:company|firm|group|agency|ministry|department|government|council|police|army|military|organi[sz]ation|association|union|club|team|court|bank|airline|carrier|report|statement|study|website|platform|startup|manufacturer|maker|operator|authority|authorities|service|office|board|committee|charity|foundation|campaigners?|activists?|officials|sources?|experts|analysts|researchers|scientists)$/i;
// The political sides a story can name: parties, blocs and the usual "opposition" pairs (balance rule)
const SIDES = [
  /\b(?:democrats?|democratic party)\b/i, /\b(?:republicans?|republican party|gop)\b/i, /\blabour\b/i, /\b(?:conservatives?|tor(?:y|ies))\b/i,
  /\b(?:liberal democrats?|lib dems?)\b/i, /\breform uk\b/i, /\bsnp\b/i, /\b(?:social democrats?|spd)\b/i, /\b(?:christian democrats?|cdu)\b/i,
  /\b(?:greens?|green party)\b/i, /\b(?:afd)\b/i, /\b(?:psoe|socialists?)\b/i, /\b(?:partido popular|pp)\b/i, /\bvox\b/i, /\b(?:bjp)\b/i, /\b(?:congress party)\b/i,
  /\b(?:opposition)\b/i, /\b(?:ruling (?:party|coalition))\b/i, /\b(?:rebels?)\b/i, /\b(?:hamas)\b/i, /\b(?:israel(?:i)? government)\b/i,
  /\b(?:PTI|Tehreek-e-Insaf)\b/, /\b(?:PML-?N|Muslim League)\b/, /\b(?:PPP|Pakistan Peoples Party)\b/, /\b(?:Rassemblement National|National Rally)\b/i, /\b(?:Fidesz|Law and Justice|PiS)\b/,
];
const PRONOUN_SHE = /\b(?:she|her|hers|herself|Mrs|Ms|Miss|Madam)\b/;
const PRONOUN_HE = /\b(?:he|him|his|himself|Mr|Sir)\b/;

const squash = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isName = (s) => /^[A-Z][\p{L}'’.-]+(?: (?:[A-Z][\p{L}'’.-]+|de|da|del|van|von|der|bin|al|el|la|le))*(?: [A-Z][\p{L}'’.-]+)$/u.test(String(s || '').trim());
const kindOf = (text) => ROLES.find(([, re]) => re.test(text))?.[0] || null;
/** The kind of a public role ("health minister" -> 'politician'), for checks made after the booking (clips.js). */
export const roleKind = (text) => (NEVER.test(String(text || '')) ? 'private' : kindOf(String(text || '')));

/**
 * Who said it: `by` is the validator's speaker for that very quotation (a name, "the mayor", "a spokesperson"),
 * `source` the story's text. A name takes its role from an apposition or a title in the source ("Ana Silva, the
 * mayor of Lisbon", "Lisbon mayor Ana Silva", "Prime Minister Mark Carney"); the presentation from the pronouns or
 * the title the source uses for them ('neutral' when it never says).
 */
export function speakerProfile(by, source = '') {
  let said = String(by ?? '').trim().replace(/[.,;:]+$/, '');
  // (a pronoun is no one the source names: "He", "She", "They")
  if (!said || /^(?:he|she|they|it|we|i|you|him|her|them)$/i.test(said)) return null;
  const src = String(source ?? '');
  // a surname alone ("Zelenskyy", "Bas", "Leo": how outlets attribute after the first mention) is the full name the
  // source gives it ("Volodymyr Zelenskyy", "Bärbel Bas", "Pope Leo XIV" keeps "Leo" with its title)
  if (/^\p{Lu}[\p{L}'’-]{1,}$/u.test(said) && !kindOf(said) && !BODIES.test(said)) {
    const esc1 = said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const full = new RegExp(`((?:\\p{Lu}[\\p{L}'’.-]+ ){1,3})${esc1}(?![\\p{L}])`, 'u').exec(src);
    // (a title before the name is the role, not the name: "President Volodymyr Zelenskyy", "Pope Leo XIV")
    const first = full ? full[1].trim().split(/\s+/).filter((w) => !kindOf(w) && !/^(?:Mr|Mrs|Ms|Dr|Sir|Dame|Prof|Pope|Saint|St)\.?$/.test(w)) : [];
    const lastTitle = full ? full[1].trim().split(/\s+/).findLastIndex((w) => kindOf(w) || /^(?:Pope)$/.test(w)) : -1;
    const keep = lastTitle >= 0 ? full[1].trim().split(/\s+/).slice(lastTitle + 1) : first;
    if (keep.length && isName(`${keep.join(' ')} ${said}`)) said = `${keep.join(' ')} ${said}`;
  }
  // (a surname the source gives no first name keeps its title for its role: "Pope Leo")
  const single = /^\p{Lu}[\p{L}'’-]+$/u.test(said) && !kindOf(said) && !BODIES.test(said);
  // (a courtesy title and a surname is a name, never a role: "Dr Hausfather" once went on air as "the Dr Hausfather", BBC
  // 13 Oct)
  const titled = /^(?:Dr|Prof|Professor|Mr|Mrs|Ms|Miss|Sir|Dame)\.?\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?$/u.test(said);
  const named = ((isName(said) || single) && !kindOf(said)) || titled;
  let role = named ? null : said.replace(/^(?:the|a|an)\s+/i, '');
  let org = null;
  if (named) {
    const esc = said.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "Ana Silva, the mayor of Lisbon," / "Ana Silva, Lisbon's mayor," / "Lisbon mayor Ana Silva" / "Prime Minister Ana Silva"
    const after = new RegExp(`${esc},\\s+((?:the |a |an )?[^,.;]{3,60}?)(?:,|\\.|;| said| told)`).exec(src);
    // (two capitals may lead the title: "Air Force General Alexus Grynkewich" once gave "the Force General", 13 Oct)
    // (three, "UC Santa Cruz professor Jevgenij Raskatov" once gave "the Cruz professor", 14 Oct)
    const before = new RegExp(`((?:[A-Z][\\w'’.-]+ ){0,3}(?:[a-z][\\w'’-]+ ){0,3}(?:[A-Z][a-z]+ )?)${esc}`).exec(src);
    // ("Germany’s labour minister and co-leader of the Social Democrats, Bärbel Bas, has quit": the role before, by comma)
    const lead = new RegExp(`([^.;:,]{3,90}),\\s+${esc},`).exec(src);
    // ("Ukrainian President Volodymyr Zelenskyy said": a title of two or three words right before the name)
    const title = new RegExp(`((?:\\p{Lu}[\\p{L}'’-]+ ){0,2}(?:[A-Z][a-z]+|[a-z]+) )${esc}`, 'u').exec(src);
    if (after && kindOf(after[1])) role = after[1].replace(/^(?:the|a|an)\s+/i, '');
    else if (before && kindOf(before[1])) role = before[1].trim();
    else if (lead && kindOf(lead[1])) role = lead[1].trim().replace(/^(?:the|a|an)\s+/i, '');
    else if (title && kindOf(title[1])) role = title[1].trim();
    // (never the words of the sentence before the title: "According to vice-president Stella Li" gave "the According to
    // vice-president", "…to secretary general Mark Rutte" "the to secretary general", Euronews and BBC 13-14 Oct)
    if (role) {
      role = role.replace(/^(?:(?:according to|said|says|told|to|of|by|as|and|with|for|from|in|on|at|the|a|an)\s+)+/i, '').trim();
      if (!role || !kindOf(role)) role = null;
    }
    const of = role && /\bof (?:the )?([A-Z][\w'’ -]{2,40})$/.exec(role);
    if (of) org = of[1].trim();
  }
  const kind = NEVER.test(said) || (role && NEVER.test(role)) ? 'private' : BODIES.test(said) ? 'body' : kindOf(role || '') || (titled ? kindOf(said) : null) || (named ? 'named' : 'unknown');
  // the pronoun the source uses near the speaker's words (the 160 characters after the name, else anywhere once)
  let presentation = 'neutral';
  const at = named ? src.indexOf(said) : -1;
  const near = at >= 0 ? src.slice(at, at + 220) : '';
  const she = PRONOUN_SHE.test(near), he = PRONOUN_HE.test(near);
  if (she !== he) presentation = she ? 'woman' : 'man';
  return { name: named ? said : null, role: role ? role.replace(/\s+/g, ' ').trim() : null, org, kind, presentation };
}

/** The political sides a story names (the balance rule needs two sides' words when there are two). */
export function politicalSides(text) {
  const t = String(text ?? '');
  return SIDES.filter((re) => re.test(t)).length;
}

/**
 * May this quote be re-staged? `quote` is the validator's grounded quote ({ text, by }), `source` the story's text
 * (summary + article), `story` the story (title for the grave check), `grave` the writer's grave flag.
 * -> { ok, reasons: [why not], speaker }
 */
export function restageCheck({ quote, source = '', story = null, grave = false }) {
  const reasons = [];
  const words = String(quote?.text ?? '').split(/\s+/).filter(Boolean).length;
  if (!quote?.text) reasons.push('no quote');
  else if (words < 5) reasons.push('too short to stand alone');
  else if (words > 60) reasons.push('longer than a re-staged line (60 words)');
  // (a whole sentence of theirs: never a fragment the outlet quotes inside its own, "apparently caused the perpetrators to
  // panic", ABC 12 Oct)
  if (quote?.text && !/^["“‘']?[\p{Lu}\d]/u.test(String(quote.text).trim())) reasons.push('a fragment of a sentence, not their whole words');
  if (/(?:…|\.\.\.)["”’]?$/.test(String(quote?.text ?? '').trim())) reasons.push('cut short (…): not their whole words');
  // (words that answer something we do not hear: "I agree, that was by design.", "This is an unadulterated abuse of
  // power." with its "this" never said, real news 13-14 Oct)
  if (/^["“‘']?(?:I agree\b|I disagree\b|Yes\b|No\b|Exactly\b|Absolutely\b|Right,|Well,|And\b|But\b|So\b|That(?:'s|’s| is| was)\b|This (?:is|was)\b|It(?:'s|’s| is| was) (?:a|an|the|not|very|really|just|so|what|why|how)\b)/i.test(String(quote?.text ?? '').trim())) reasons.push('answers words we do not hear: not their whole thought');
  // (a person's own family or grief is never re-staged, whoever they are: "After my stepdaughter’s death, I realised…",
  // a minister resigning, Guardian 12 Oct; their role is not what they speak in)
  if (/\b(?:my|our) (?:late |own )?(?:son|daughter|stepdaughter|stepson|step-daughter|step-son|wife|husband|mother|father|mum|dad|child|children|kids|family|brother|sister|partner|grandson|granddaughter|baby)\b/i.test(String(quote?.text ?? ''))) reasons.push('personal words (family, grief): never re-staged');
  const speaker = speakerProfile(quote?.by, source);
  if (!speaker) reasons.push('no speaker the source names for these words');
  else if (speaker.kind === 'private') reasons.push('a private person, a victim, a witness or someone accused: never re-staged');
  else if (speaker.kind === 'body') reasons.push('an organisation, not a person');
  else if (speaker.kind === 'unknown' || (speaker.kind === 'named' && !speaker.role)) reasons.push('no public role in the source');
  const text = `${story?.title || ''} ${source}`;
  const sombre = grave || isGrave(`${story?.title || ''}. ${story?.summary || ''}`);
  if (sombre && speaker && !['politician', 'official'].includes(speaker.kind)) reasons.push('a grave story: only officials speaking in their role');
  // (a partisan voice, a politician or someone's or a party's spokesperson, in a story naming any political side is one
  // side's case: "Khan’s spokesperson, Zulfiquar Bukhari, condemned the suspension…", ABC 12 Oct)
  const partisan = speaker && (speaker.kind === 'politician' || /\b(?:party|campaign)\b/i.test(speaker.role || '') || /\p{Lu}[\p{L}'’-]+['’]s spokes/u.test(speaker.role || ''));
  const sides = politicalSides(text);
  if (partisan && sides >= 2) reasons.push('two political sides and one side\'s words: the quote card stays (balance)');
  else if (partisan && sides === 1 && speaker.kind !== 'politician') reasons.push('a partisan voice on a political story: the quote card stays (balance)');
  // (a politician's words about another side are one side's case: "…the AfD are clearly linked to Russia…", ABC 12 Oct)
  else if ((speaker?.kind === 'politician' || (speaker?.role && politicalSides(speaker.role))) && politicalSides(String(quote?.text ?? '')) >= 1) reasons.push('a politician on another side: the quote card stays (balance)');
  // the election period and the opt-out register, as far as the source tells (the identity, after this, may add)
  if (speaker && !reasons.length) reasons.push(...restageHold({ speaker, story: { title: story?.title, summary: `${story?.summary || ''} ${source}`.slice(0, 2000), location: story?.location } }));
  return { ok: !reasons.length, reasons, speaker, grave: sombre };
}

// ------------------------------------------------------------------------------------------------ the booking

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);
function seeded(seed) {
  let a = parseInt(hash(seed).slice(0, 8), 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickFrom = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Generic synthetic voices for re-staged people: new blends of the engine's voices, none of them a presenter's,
// an expert's or a correspondent's blend (server/voice/casting.json), never an imitation of anyone's real voice.
// Measured with the cast (tools/voice/audit.py, test/voice-casting.test.js; voices round of 16 Oct): none leads with
// a character's lead voice, each is 40 or more in timbre from everyone on the programmes that re-stage guests, and
// natural and native English on the listening-score and accent measures. Before, four of the six sat on a character's
// lead or near one (bm_george, 40 from Paco; fenrir and lewis, 29 from Max; bf_emma, 33 from Rhea; af_alloy, Amara's)
// and one led with af_nicole, a breathy voice that scored lowest.
export const GUEST_VOICES = {
  man: [{ voice: 'bm_daniel:0.5+am_adam:0.5', speed: 0.97, lang: 'en-gb' }, { voice: 'am_eric:0.6+am_onyx:0.4', speed: 0.97, lang: 'en-us' }, { voice: 'am_onyx:0.6+am_liam:0.4', speed: 0.97, lang: 'en-us' }],
  woman: [{ voice: 'bf_lily:0.6+af_sky:0.4', speed: 0.98, lang: 'en-gb' }, { voice: 'af_sky:0.55+af_jessica:0.45', speed: 0.98, lang: 'en-us' }, { voice: 'bf_alice:0.55+af_river:0.45', speed: 0.98, lang: 'en-gb' }],
};
GUEST_VOICES.neutral = [GUEST_VOICES.woman[2], GUEST_VOICES.man[2]];

const AGES = ['adult', 'middle', 'senior'];
const HAIR = {
  man: ['short-side', 'crop', 'short-textured', 'quiff', 'bald', 'curly-short', 'coily-short'],
  woman: ['bob', 'long-straight', 'long-wavy', 'bun', 'ponytail', 'crop', 'braids'],
  neutral: ['crop', 'short-side', 'bob', 'curly-short'],
};
const COLOURS = { adult: ['black', 'dark-brown', 'brown', 'auburn', 'blonde'], middle: ['dark-brown', 'brown', 'salt-pepper', 'black', 'grey'], senior: ['grey', 'white', 'salt-pepper'] };
const SKINS = ['porcelain', 'light', 'medium', 'tan', 'brown', 'deep'];
const SUITS = ['navy', 'charcoal', 'slate', 'brown', 'plum'];

/**
 * A look for a re-staged person (WAVE3 §3.6 LookSpec v1): the identity's own facts where it has them (presentation,
 * age), the rest seeded from the person's id so they look the same every time. A generic look (likeness 'none'):
 * a recreation, never a portrait, and never anything mocking.
 */
export function guestLook(id, { presentation = 'neutral', age = null } = {}) {
  const rand = seeded(`look|${id}`);
  const p = presentation === 'woman' || presentation === 'man' ? presentation : 'neutral';
  const a = AGES.includes(age) ? age : pickFrom(rand, ['adult', 'middle', 'middle', 'senior']);
  const style = pickFrom(rand, HAIR[p]);
  return {
    v: 1,
    presentation: p,
    age: a,
    build: pickFrom(rand, ['slight', 'average', 'average', 'broad']),
    skin: pickFrom(rand, SKINS),
    hair: { style, colour: style === 'bald' ? 'none' : pickFrom(rand, COLOURS[a]), parting: pickFrom(rand, ['left', 'right', 'none']), receding: a === 'senior' && p !== 'woman' ? Math.round(rand() * 60) / 100 : 0 },
    facialHair: p === 'man' ? { style: pickFrom(rand, ['none', 'none', 'none', 'stubble', 'short-beard', 'moustache']) } : { style: 'none' },
    glasses: pickFrom(rand, ['none', 'none', 'rect', 'round']),
    wear: { outfit: pickFrom(rand, p === 'woman' ? ['suit', 'blazer', 'blazer'] : ['suit', 'suit', 'blazer']), main: pickFrom(rand, SUITS), tie: p === 'man' ? pickFrom(rand, ['plain', 'plain', 'none']) : 'none' },
    accessories: [],
  };
}

/** The guest's voice: a generic blend by presentation, the same for the same person. */
export function guestVoice(id, presentation = 'neutral') {
  const list = GUEST_VOICES[presentation] || GUEST_VOICES.neutral;
  return { ...list[parseInt(hash(`voice|${id}`).slice(0, 6), 16) % list.length] };
}

const upper = (s) => String(s ?? '').toUpperCase();

/**
 * The booking of a re-staged speaker. `identity` (server/guests/identity.js) may confirm a named person and give
 * their presentation and age; without one the source's own words decide. -> { id, kind: 'restaged', name, role,
 * org, label: { line, credit }, look, voice, likeness, backdrop: 'press' }
 */
export function bookGuest(speaker, { outlet = '', identity = null, said = null } = {}) {
  const key = speaker.name ? `${squash(speaker.name)}|${squash(speaker.org || '')}` : `${squash(speaker.role)}|${squash(outlet)}`;
  const id = `rp_${hash(key)}`;
  const presentation = identity?.presentation || speaker.presentation || 'neutral';
  const role = speaker.role || identity?.role || null;
  return {
    id,
    kind: 'restaged',
    name: speaker.name || null,
    role,
    org: speaker.org || null,
    // the strap: the name and the role (or the role alone, as the source gives it)
    strap: { name: upper(speaker.name || role || 'SPEAKER'), role: speaker.name && role ? upper(role) : '' },
    label: { line: 'RECREATION — WORDS FROM PUBLIC STATEMENTS', credit: `SOURCE: ${upper(outlet)}${said ? ` · ${upper(said)}` : ''}`.trim() },
    look: guestLook(id, { presentation, age: identity?.age || null }),
    voice: guestVoice(id, presentation),
    likeness: 'none',
    backdrop: 'press',
    presentation,
    ...(identity?.qid ? { qid: identity.qid } : {}),
    // (their citizenship, for the election rule at publish time: server/compliance/clips.js)
    ...(identity?.citizenship?.length ? { citizenship: identity.citizenship.slice(0, 4) } : {}),
  };
}

// `mid` is the speaker as said mid-sentence (an apposition keeps both its commas), `end` before a comma or a colon
const PROVENANCE = [
  (mid, end, outlet) => `In ${outlet}'s report, here is how ${mid} put it.`,
  (mid, end, outlet) => `${capFirst(end)}, in words reported by ${outlet}:`,
  (mid, end, outlet) => `This is what ${mid} said, as reported by ${outlet}.`,
  (mid, end, outlet) => `In the words of ${end}, as reported by ${outlet}:`,
];
function capFirst(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The presenter's hand-over to the recreation, stating where the words come from (WAVE3 §6.3). */
export function provenanceLine(booking, outlet, seed = '') {
  // (a role that opened its sentence keeps no capital: "Computer scientist Raphael Wimmer" once aired as "Raphael Wimmer, the
  // Computer scientist", The Verge 12 Oct, round 5; a people's name keeps it, "Ukrainian president")
  const role = String(booking.role || 'speaker')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/^(\p{Lu})(\p{Ll}+)(?=\s+\p{Ll})/u, (w, a, b) => (/(?:an|ese|ish|i|ch)$/.test(b) ? w : a.toLowerCase() + b));
  // (a role that has its own determiner keeps it: "Elgin’s President", "Ukrainian President" takes "the")
  const det = /^[\p{L}.-]+['’]s\s/u.test(role) ? '' : 'the ';
  const end = booking.name ? (booking.role ? `${booking.name}, ${det}${role}` : booking.name) : `${det}${role}`;
  const mid = booking.name && booking.role ? `${end},` : end;
  const f = PROVENANCE[parseInt(hash(`prov|${seed}|${booking.id}`).slice(0, 6), 16) % PROVENANCE.length];
  return f(mid, end, outlet || 'the source');
}

// Builds the prompt for the news writer and turns the model's JSON reply into
// a safe, validated bulletin for the renderer. The validator is the last line
// of defence for accuracy and for the programme's editorial rules: anything on
// screen or in the spoken text that the source headline/summary does not
// support (a number, a quote, a place) is dropped here, and the running order
// is put right (a breaking story leads, the number of the day is never the
// lead, no banter next to grave news...), whatever the writer was.
import { parseCues, embedCues, describeActions, ACTIONS } from '../public/js/cues.js';
import { isBreaking, plainTitle } from './news.js';
import { claimGrounded, contentWords, groundQuote, isGrave, numbersGrounded, numbersIn, numberWordsIn, quotationsGrounded } from './facts.js';
import { lookupPlace, placeSupported, snapLocation } from './gazetteer.js';

export const EMOTIONS = ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking'];
export const SHOTS = ['wide', 'close', 'full', 'map'];
const TYPES = ['intro', 'story', 'chat', 'outro'];

/** Recurring programme features a story segment may be part of (see CONTRACTS.md). */
export const FEATURES = ['number', 'roundup', 'lighter'];
export const FEATURE_KICKERS = { number: 'NUMBER OF THE DAY', roundup: 'AROUND THE WORLD', lighter: 'AND FINALLY' };

/** On-screen headline length the bibles and ART_DIRECTION ask for (a programme may set its own `headlineMax`). */
export const HEADLINE_MAX = 45;
const LIMITS = { text: 520, headline: 56, title: 80, place: 32, fact: 48, kicker: 18, value: 12, label: 24, quote: 140, by: 32 };
const MAX_NUMBERS = 3;
const MAX_MAP = 4;
const MAX_ROUNDUP = 4;
const ROUNDUP_OPENER = 'Now, around the world in 30 seconds.';

const firstName = (p) => String(p?.name || '').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];

// ---------------------------------------------------------------- prompt

function featureRules(program) {
  const r = program.roundup || {};
  const opener = r.opener || ROUNDUP_OPENER;
  const slot =
    program.numberSlot === 'last'
      ? 'Put it last in the running order.'
      : program.numberSlot === 'second'
        ? 'Make it the second story.'
        : 'Make it the second or third story.';
  return {
    number: `"number" (NUMBER OF THE DAY): one story whose summary states a striking figure. Open with the figure ("Our number of the day: 40,000.") and explain it in the words of the summary. Fill "numbers" for it. Only one per episode, never the lead story, never a grave or breaking story, never an age or a date. ${slot}`,
    roundup: `"roundup" (AROUND THE WORLD): ${r.min || 2} to ${r.max || MAX_ROUNDUP} brief items, exactly one sentence each${r.words ? ` of ${r.words} words` : ''}, for stories that happen in a place named in their candidate, each in a different country. Write them as consecutive story segments with "feature": "roundup", "shot": "map" and a "location", all read by the same presenter. The first item opens the round-up ("${opener}"); each item names its place within its first words ("In Kenya, ..."). No chat inside it, no fact cards.`,
    lighter: '"lighter" (AND FINALLY): the last story is a lighter, human or curious one, introduced with "And finally". Never a grave story, and never straight after one.',
  };
}

function introRule(program, solo, names) {
  const greeting = solo ? `"${program.title}. I'm ${names}."` : `both presenters named ("I'm ${names}.")`;
  if (program.intro === 'frame') {
    return `- The intro is only the greeting: "This is ${program.title}. I'm ${names}." No teaser, no cold open.`;
  }
  if (program.intro === 'headlines') {
    return `- The intro reads the headlines of the first three stories, in running order, one sentence each (7 to 10 words, present tense, the place named where there is one), then the greeting with ${greeting}. The headlines play over pictures of those three stories, so keep that order.`;
  }
  return `- Cold open: the intro starts with one gripping line built from the lead story's headline, then a teaser naming the second and then the third story in running order ("Also coming up: ..."), then the greeting with ${greeting}. The lines play over pictures of those stories, so keep that order.`;
}

function chatRule(program, solo) {
  if (solo || !program.maxChats) return '- No "chat" segments.';
  const after = program.chats?.after;
  const where = after
    ? after
        .map((a) => (a === 'lead' ? 'directly after the lead story' : a === 'lighter' ? 'directly after the "And finally" story' : 'after another non-grave story'))
        .join(', or ')
    : 'between stories';
  return `- At most ${program.maxChats} "chat" segments in total, only ${where}; never right before or after a grave story.`;
}

function allowedActions(program) {
  const g = program.gestures;
  if (!g) return null;
  const names = new Set();
  const add = (list) => (Array.isArray(list) ? list : Object.values(list || {}).flat()).forEach((n) => ACTIONS[n] && names.add(n));
  if (g.allow) add(g.allow);
  else Object.keys(ACTIONS).filter((n) => !(g.deny || []).includes(n)).forEach((n) => names.add(n));
  add(g.listener);
  return [...names];
}

const SEGMENT_SCHEMA = (slots, headlineMax) => `{
  "title": "short episode title",
  "segments": [
    {"type": "intro", "anchor": "A", "emotion": "neutral", "text": "the intro (see MAKE IT WORTH WATCHING)"},
    {"type": "story", "storyId": "<candidate id>", "anchor": ${slots}, "emotion": "neutral|happy|serious|surprised|sad|thinking",
     "headline": "on-screen caption, max ${headlineMax} characters", "text": "<story text>",
     "shot": "wide|close|full|map", "breaking": false,
     "location": {"place": "CITY, COUNTRY", "lat": 0.0, "lon": 0.0} | null,
     "fact": "KEY FIGURE FROM THE SUMMARY, max 40 characters" | null,
     "kicker": "TOPIC LABEL" | null,
     "numbers": [{"value": "40,000", "label": "PASSENGERS A DAY"}] | null,
     "quote": {"text": "exact words quoted in the summary", "by": "speaker named in the summary" | null} | null,
     "map": [{"place": "COUNTRY", "lat": 0.0, "lon": 0.0}] | null,
     "feature": "number|roundup|lighter" | null},
    {"type": "chat", "anchor": ${slots}, "emotion": "...", "text": "one or two sentence reaction or hand-over"},
    {"type": "outro", "anchor": "A", "emotion": "neutral", "text": "brief sign-off"}
  ]
}`;

const ACCURACY = `ACCURACY RULES (mandatory)
- Use ONLY facts present in each candidate's "headline" and "summary". Never invent numbers, names, quotes, dates, causes or consequences.
- If a summary is thin, say less; never fill gaps with assumptions.
- Attribute naturally ("the BBC reports", "according to Al Jazeera"), but only once per story.
- Quotation marks only around words the summary itself quotes, copied exactly.
- No political opinions and no judgements about real people.`;

/**
 * @param program     programme definition from config/channel.json
 * @param presenters  { A: presenter, B?: presenter } with name + personality
 */
export function buildPrompt({ channelName, program, presenters, stories, count, now = new Date() }) {
  const when = now.toLocaleString('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const n = count ?? program.stories;
  const solo = !presenters.B;
  const features = (program.features || []).filter((f) => FEATURES.includes(f));
  const headlineMax = program.headlineMax || HEADLINE_MAX;
  const input = stories.map((s) => ({
    id: s.id,
    outlet: s.source,
    section: s.category,
    outletsCovering: s.outlets || 1,
    headline: s.title,
    summary: s.summary.slice(0, 700),
    ...(isBreaking(s.title) ? { breaking: true } : {}),
    ...(s.live ? { liveBlog: true } : {}),
  }));
  const cast = Object.entries(presenters)
    .map(([slot, p]) => `- ${slot}: ${p.name}${p.role ? ` (${p.role})` : ''}, ${p.personality}.`)
    .join('\n');
  const [a, b] = [firstName(presenters.A), firstName(presenters.B)];
  const names = solo ? presenters.A.name : `${presenters.A.name}, with ${presenters.B.name}`;
  const chemistry = solo ? '' : `\n${program.chemistry ? `Chemistry: ${program.chemistry}` : `Chemistry: ${a} and ${b} are a team who like each other; let their personalities show in small touches, never at the expense of the facts.`}`;
  const primary = program.categories?.length > 1 ? ` This programme's own beat is the "${program.categories[0]}" section: prefer it for the lead and the features.` : '';
  const toss = program.toss ? program.toss.replace('{name}', b) : `${b}?`;
  const actions = allowedActions(program);
  const rules = featureRules(program);

  return `You are the editorial team of "${channelName}", a 24-hour English-language news channel with a retro pixel-art look. You are writing an episode of the programme "${program.title}" (${program.tagline}).
Programme style: ${program.style}
Current time: ${when} UTC.

PRESENTERS
${cast}${chemistry}

TASK
1. From the CANDIDATES below, select the ${n} stories of greatest interest and impact for an international audience that fit this programme.${primary} Prefer stories many outlets are covering ("outletsCovering" > 1). Avoid purely local or niche items, celebrity gossip, shopping deals, product reviews, sports minutiae, opinion pieces and live blogs with no clear news line ("liveBlog": true marks rolling coverage: call it a developing story, never breaking news, and never read its "follow the latest" line). Keep some variety.
2. Order them like a real newsroom: the biggest story first; a breaking story ("breaking": true) always leads${features.includes('lighter') ? '; a lighter one last' : ''}.
3. Write the script in English, to be read aloud by a synthetic voice.

${ACCURACY}
- A "why it matters" line is welcome only when the summary itself says what follows from the news (a purpose, a consequence, who is affected); say it in the summary's terms with a clear subject ("The city says the line will cut traffic."), never as a label such as "Why it matters:". Otherwise leave it out.

TONE
- This is a channel for adults: credible, calm and confident, like a good public broadcaster. Humour is dry and understated (deadpan, a raised eyebrow, the odd wry aside), never childish, gushing or cute. No exclamation marks, no puns for the sake of it, no "wow".
- Grave stories (deaths, war, disasters, violence, illness): sober tone, emotion "serious" or "sad", no jokes or light banter before or after them.
- Lighter stories: engaging and a little witty, true to each presenter's personality.
- No emojis, no markdown, spell out unusual abbreviations.${program.noQuestions ? '\n- No question marks in headlines, story text, tosses, the greeting or the sign-off; a chat line may hold one question per episode.' : ''}

MAKE IT WORTH WATCHING
${introRule(program, solo, names)}
- The lead story must not repeat the intro's line about it: continue from it with the next fact.
- Each story opens with its most striking fact, then attribution, then one or two details. Vary the openings and the attribution; never start two stories the same way. Never say the same sentence or the same figure twice in a row.
- Rhythm for the voice: one idea per sentence; mix short and medium sentences, with the odd three-to-five-word sentence for punch. No parentheses, no strings of numbers, no stacked clauses. Write figures as digits with their unit ("40,000 passengers") and say "percent".${
    solo
      ? ''
      : `
- Hand-overs: when the next story is read by the other presenter, sometimes end with a natural toss using their first name ("${toss}"), or let them pick it up ("Thanks, ${a}."). Vary it, say "Thanks" at most once per episode, and never toss after a grave story.
- Chat segments are short exchanges that sound like these two people: react to what was just said, add no new facts or figures, and lead into what comes next.`
  }
${
  features.length
    ? `
RECURRING FEATURES (only when the candidates support them; otherwise skip them)
${features.map((f) => `- ${rules[f]}`).join('\n')}
`
    : ''
}
GRAPHICS FIELDS (optional: null or left out when the source does not support them)
- "kicker": a 1 to 3 word topic label for the strap, max 18 characters, in capitals (e.g. "VOLCANO", "TRANSPORT"). Never "BREAKING" or "LIVE", never alarm words the summary does not use.
- "numbers": up to ${MAX_NUMBERS} figures the summary states and the story text says, each {"value": "40,000", "label": "PASSENGERS A DAY"}, copied exactly, label in the summary's words (never empty).
- "quote": only if the summary literally contains a quotation in quotation marks: copy those words exactly; "by" only if the summary names who said them.
- "map": when a story names two to ${MAX_MAP} places (e.g. two countries signing a deal), one entry per place.

STAGE DIRECTIONS (make the presenters move naturally)
- Inside any "text" you may place cues in square brackets exactly where the movement should happen; they are not read aloud.
- "[action]" is performed by the presenter speaking${solo ? '' : '; "[A:action]" or "[B:action]" makes a specific presenter do it (e.g. the co-presenter reacting with "[B:nod]" while A speaks, or "[A:nod]" while B speaks)'}.
- Actions: ${actions ? `${actions.map((n) => `${n} (${ACTIONS[n].desc})`).join(', ')} (only these in this programme)` : describeActions()}.
- An emotion name in brackets (e.g. "[surprised]") changes the speaker's expression from that point.
- This is a professional studio: gestures are sparing and natural, at most two per segment. Prefer nod, lean_in, steeple and look_partner; point_screen only when a picture or map follows.
- ${program.gestures?.defaults?.intro ? `Greet and sign off with a "${program.gestures.defaults.intro}", never a wave.` : 'A wave only when greeting or signing off.'} Use count when listing, lean_in for important points, shrug for uncertainty${solo ? '' : ', look_partner or point_partner on hand-overs'}.
- Never use wave, thumbs_up, fist_pump, facepalm, laugh or wow in grave stories.

OUTPUT FORMAT
Reply with ONLY a valid JSON object, no text before or after, shaped like this:
${SEGMENT_SCHEMA(solo ? '"A"' : '"A" | "B"', headlineMax)}
- Story "text": ${program.storyLength}.
- Exactly one "story" segment per selected story, using the candidate ids exactly; do not include unselected candidates.
${solo ? '- There is a single presenter: always use "anchor": "A".' : '- Alternate presenters between stories (a round-up counts as one block).'}
- "headline": a complete phrase of at most ${headlineMax} characters (drop "a", "an", "the" rather than cut a word); never end on a preposition or cut a figure from its unit.
- "shot": "map" when the story happens in a specific place, "full" when it is very visual, "close" for important stories, "wide" otherwise.
- "location": only when the story clearly happens in a specific city, region or country named in the candidate; give approximate coordinates of that place. Otherwise null.
- "fact": only when the summary states a concrete figure that the story text also says (e.g. "40,000 EVACUATED", "$2BN DEAL", "7.1 MAGNITUDE"); copy it faithfully, with its scale and currency. Otherwise null.
- "breaking": true only if the candidate's headline explicitly says it is breaking news.
${chatRule(program, solo)}

CANDIDATES
${JSON.stringify(input, null, 2)}`;
}

/** Second pass: an editor checks the script against the sources and fixes it. */
export function buildReviewPrompt({ channelName, program, script, stories }) {
  const sources = stories.map((s) => ({ id: s.id, outlet: s.source, headline: s.title, summary: s.summary.slice(0, 700) }));
  return `You are the standards editor of "${channelName}", checking a script for the programme "${program.title}" before it goes on air.

Check every story segment against its SOURCE (matched by storyId):
- Remove or correct any claim, number, name, quote, place or cause that is not supported by the source headline/summary. A figure must keep its scale, unit and currency (12 billion is not 12 million; 40 percent is not 40 people).
- Make sure the "fact" field (if any) appears in the source and in the story text, otherwise set it to null.
- Make sure every "numbers" value is stated in the source, a "quote" is copied word for word from a quotation in the source, and every "map" place is named in the source; otherwise remove them.
- Make sure "location" matches a place named in the source, otherwise set it to null.
- A "why it matters" line must follow from the source itself; remove it otherwise.
- Headlines: a complete phrase of at most ${program.headlineMax || HEADLINE_MAX} characters; rewrite any that is cut mid-phrase.
- Fix tone problems (no jokes near grave stories) and anything hard to read aloud. A breaking story leads; the number of the day is never the lead.
- Keep the bracketed stage directions such as [nod] or [B:nod] (they are not read aloud); remove only ones that are inappropriate for the tone.
- Keep the same JSON structure (including "kicker" and "feature"), segment order, presenters and storyIds. Do not add new stories.

${ACCURACY}

Reply with ONLY the corrected JSON object, nothing else.

SCRIPT
${JSON.stringify(script, null, 2)}

SOURCES
${JSON.stringify(sources, null, 2)}`;
}

/** Extract the first top-level JSON object from a model reply. */
export function extractJson(raw) {
  const s = String(raw).replace(/```(?:json)?/gi, '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('reply contains no JSON');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error('incomplete JSON in reply');
}

// ---------------------------------------------------------------- text helpers

const clean = (v, max) =>
  String(v ?? '')
    .replace(/[*#`]/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1') // markdown underscores, not snake_case words
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const textLike = (v) => typeof v === 'string' || typeof v === 'number';

function clip(textValue, max) {
  const t = clean(textValue, 2000);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastStop > max * 0.5) return cut.slice(0, lastStop + 1);
  const words = cut.slice(0, max - 1);
  return (/\s/.test(words) ? words.replace(/\s+\S*$/, '') : words) + '…';
}

// Shorten at a word boundary, without ellipsis (for short labels).
function clipWords(value, max) {
  const t = clean(value, 400);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const words = /\s/.test(cut) ? cut.replace(/\s+\S*$/, '') : cut.slice(0, max);
  return words.replace(/[\s,.:;|\-–—]+$/, '');
}

const PREPOSITIONS = 'in on at for of by per to from with into onto across over under near after before during since until about around through against between among within without along beside behind beyond below above past towards toward inside outside off upon via amid despite'.split(' ');
const STOP_END = new RegExp(`\\b(?:a|an|the|and|or|but|nor|as|than|that|its|their|his|her|this|these|amid|while|says|said|${PREPOSITIONS.join('|')})$`, 'i');
// Clause boundaries a headline may be cut at: what comes before is a complete headline ("Oil prices slide").
const CLAUSE_CUTS = /,\s+|\s+[–—-]\s+|\s+(?:as|after|amid|while|despite|following|ahead of|but|because|led by|driven by)\s+/gi;
// "a week of use", "in a month": the article belongs to a quantity and stays.
const KEEP_ARTICLE_BEFORE = /^(?:week|day|month|year|decade|century|hour|minute|second|third|half|quarter|dozen|few|lot|number|time)\b/i;

/** A headline that ends in a stop word or a dangling figure was cut mid-phrase. */
export const danglingHeadline = (h) => {
  const t = String(h).trim();
  return STOP_END.test(t) || (/\b(?:by|of|to|up|down|at|in|from) \d[\d,.]*$/.test(t) && !/\b(?:19|20)\d\d$/.test(t));
};

/**
 * One phrase-aware shortener for on-screen headlines (validator and offline
 * writer alike): strips the outlet's BREAKING / live markers, then, only if
 * the headline is too long, drops articles ("a", "an", "the" — not in fixed
 * phrases such as "in a month") and cuts at a clause boundary (a comma, a dash,
 * "as", "after", "amid"...). It never cuts after a preposition or between a
 * figure and its unit: when no clean cut exists the full headline is kept and
 * the graphics wrap or page it.
 */
export function shortHeadline(title, max = HEADLINE_MAX) {
  const t = clean(plainTitle(title), 200).replace(/[\s.!?;:,]+$/, '');
  if (t.length <= max) return t;
  const compactOf = (text) => {
    const words = text.split(' ');
    return words
      .filter((w, i) => {
        if (!/^(?:a|an|the)$/i.test(w)) return true;
        if (i === 0) return false;
        return PREPOSITIONS.includes(words[i - 1].toLowerCase()) || KEEP_ARTICLE_BEFORE.test(words[i + 1] || '');
      })
      .join(' ')
      .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  };
  const compact = compactOf(t);
  if (compact.length <= max) return compact;
  // Cut points are found in the full headline: "as" starts a clause ("as demand cools"), not a
  // comparison ("use the sun as a compass"); and what is kept must still carry the story.
  const all = contentWords(t).length;
  const cuts = [];
  for (const m of t.matchAll(CLAUSE_CUTS)) {
    if (/^\s*as\s/i.test(m[0]) && /^(?:a|an|the|its|their|his|her|one|part|well|much|many|long|soon|usual)\b/i.test(t.slice(m.index + m[0].length))) continue;
    const head = compactOf(t.slice(0, m.index).trim());
    const kept = contentWords(head).length;
    if (kept >= 3 && kept / all >= 0.4 && !danglingHeadline(head)) cuts.push(head);
  }
  const fit = cuts.filter((c) => c.length <= max).pop();
  if (fit) return fit;
  // No clean cut that fits: the shortest clean cut under the hard limit, else the whole (compacted) headline.
  return cuts.filter((c) => c.length <= LIMITS.headline).sort((a, b) => a.length - b.length)[0] || compact;
}

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

function normalizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const num = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);
  const lat = num(loc.lat);
  const lon = num(loc.lon);
  const place = clipWords(loc.place, LIMITS.place);
  if (!place || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { place, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}

/**
 * A location must name a place the story names. A known place (city, region
 * or country) whose coordinates are clearly off is put back where it is.
 */
function groundedLocation(loc, source) {
  const l = normalizeLocation(loc);
  if (!l || !placeSupported(l.place, source)) return null;
  return snapLocation(l);
}

function normalizeMap(list, source) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    const l = groundedLocation(item, source);
    if (l && !out.some((o) => o.place.toLowerCase() === l.place.toLowerCase())) out.push(l);
    if (out.length >= MAX_MAP) break;
  }
  return out.length >= 2 ? out : null;
}

const QUALIFIERS = ['ABOUT', 'NEARLY', 'ALMOST', 'MORE THAN', 'UP TO', 'AT LEAST', 'LESS THAN', 'OVER', 'UNDER'];

function normalizeNumbers(list, source) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !textLike(item.value)) continue;
    const value = clean(item.value, LIMITS.value + 8).toUpperCase();
    if (!/\d/.test(value) || value.length > LIMITS.value || !numbersGrounded(value, source)) continue;
    const label = textLike(item.label) ? clipWords(item.label, LIMITS.label).toUpperCase() : '';
    // A figure with no label says nothing on a card ("3%" alone).
    if (!label || !claimGrounded(`${value} ${label}`, source)) continue;
    if (out.some((o) => o.value === value)) continue;
    const qualifier = textLike(item.qualifier) ? String(item.qualifier).toUpperCase().trim() : '';
    out.push({ value, label, ...(QUALIFIERS.includes(qualifier) ? { qualifier } : {}) });
    if (out.length >= MAX_NUMBERS) break;
  }
  return out.length ? out : null;
}

const BANNED_KICKER = /\b(?:BREAKING|LIVE|EXCLUSIVE|URGENT|JUST IN|ALERT)\b/;
// Alarm words go on the strap only when the outlet itself uses them.
const ALARM = /\b(?:DEAD|DEATHS?|DIES?|KILL\w*|SCANDAL|TERROR\w*|CRISIS|CHAOS|HORROR|SHOCK\w*|CARNAGE|MASSACRE|DISASTER|PANIC|OUTRAGE|FURY|CATASTROPH\w*|DEVASTAT\w*|TRAGEDY|SLAUGHTER|BLOODBATH|MAYHEM)\b/g;

function normalizeKicker(value, source) {
  if (!textLike(value)) return null;
  const k = clipWords(String(value).replace(/[^\p{L}\p{N} &'’-]/gu, ' '), LIMITS.kicker).toUpperCase();
  if (!k || BANNED_KICKER.test(k) || !numbersGrounded(k, source)) return null;
  const upperSource = String(source).toUpperCase();
  for (const word of k.match(ALARM) || []) if (!new RegExp(`\\b${word.slice(0, Math.max(4, word.length - 2))}`).test(upperSource)) return null;
  return k;
}

// Sentences of a script text (cue tags may sit anywhere). Decimals such as
// "7.1" do not split: a sentence ends at punctuation followed by a space.
const sentencesOf = (text) => String(text).split(/(?<=[.!?…])\s+(?=[\["“'A-Z0-9])/).filter((x) => x.trim());
const stripTags = (s) => String(s).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Numbers that belong to the format, not to the news. In stories only the
// round-up's own title counts; intro, chat and outro may also name the clock.
const FORMAT_IN_STORY = [/\baround the world in (?:30|60) seconds\b/gi, /\baround the clock\b/gi];
const FORMAT_ELSEWHERE = [...FORMAT_IN_STORY, /\b(?:in|under) (?:30|60|90) seconds\b/gi, /\b24 hours\b/gi, /\b24\/7\b/g];

/**
 * Drop every sentence that states a number the sources do not (digits or
 * words, with scale, unit and currency), or quotes words the sources do not
 * quote. Numbers inside our own names (the channel "GLOBIT 24", "NEWS IN 60",
 * "UNIT-8") and format phrases do not count.
 */
function groundedText(text, source, ownNames, type) {
  const own = ownNames.filter(Boolean).map((n) => new RegExp(escapeRe(String(n)), 'gi'));
  const format = type === 'story' ? FORMAT_IN_STORY : FORMAT_ELSEWHERE;
  const kept = sentencesOf(text).filter((sentence) => {
    let t = stripTags(sentence);
    for (const re of [...own, ...format]) t = t.replace(re, ' ');
    return numbersGrounded(t, source, { words: true }) && quotationsGrounded(t, source);
  });
  return kept.join(' ');
}

// Words that only attribute ("..., Ledger Line reports") do not make a sentence new.
const ATTRIBUTION_WORDS = new Set(['reports', 'reported', 'report', 'says', 'said', 'according', 'told', 'officials', 'announced']);
/**
 * Does `a` merely repeat `b`? Most of its content words are in `b` and it adds
 * at most two of its own (attribution and the outlet's name do not count).
 */
function repeats(a, b, ignore) {
  const wa = new Set(contentWords(a).filter((w) => !ATTRIBUTION_WORDS.has(w) && !ignore.has(w)));
  const wb = new Set(contentWords(b));
  if (wa.size < 3 || wb.size < 3) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size) >= 0.85 && wa.size - shared <= 2;
}

// A pick-up such as "Thanks, Paco." / "Thank you, Lola."
const PICKUP = /^(?:thanks|thank you)(?: very much)?,? [A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?\.$/i;
// A one-word toss such as "Lola?" (WORLD NOW tosses with a full stop).
const NAME_TOSS = /^([A-Z][\w'’-]*(?: [A-Z][\w'’-]*)?)\?$/;

/**
 * Insert a feature lead-in after a leading pick-up ("Thanks, Paco."), so it
 * comes first in the story itself: as a sentence of its own ("Our number of
 * the day: 40,000.") or glued to the next one ("And finally: ...").
 */
function prependLine(tagged, prefix, { glue = false } = {}) {
  const parts = sentencesOf(tagged);
  const at = parts.length && PICKUP.test(stripTags(parts[0])) ? 1 : 0;
  if (glue && parts[at]) parts[at] = `${prefix} ${parts[at]}`;
  else parts.splice(at, 0, prefix);
  return parts.join(' ');
}

const mentionsValue = (text, value) => {
  const want = numbersIn(value)[0];
  if (!want) return false;
  return [...numbersIn(text), ...numberWordsIn(text)].some((n) => Math.abs(n.scaled - want.scaled) < 1e-9 * Math.max(1, want.scaled) || Math.abs(n.value - want.value) < 1e-9);
};

// ---------------------------------------------------------------- gestures

const LIGHT_ACTIONS = Object.keys(ACTIONS).filter((n) => ACTIONS[n].light);

/**
 * Apply a programme's gesture policy (config/channel.json `gestures`) to the
 * cues of one segment: allowed actions (per presenter id when given), listener
 * reactions, a grave subset, remaps (e.g. count -> steeple), "only" rules
 * (lean_in only in the lead...) and per-segment caps. Emotion cues are kept.
 */
function applyGestures(cues, policy, ctx) {
  if (!policy) return cues;
  const { speakerId, listenerId, grave, where, budget } = ctx;
  const listOf = (v, id) => (Array.isArray(v) ? v : v && typeof v === 'object' ? v[id] || [] : null);
  const allowFor = (id) => {
    const list = listOf(policy.allow, id);
    if (list) return list;
    return Object.keys(ACTIONS).filter((n) => !(policy.deny || []).includes(n));
  };
  const capFor = (id) => (typeof policy.perSegment === 'number' ? policy.perSegment : policy.perSegment?.[id] ?? 2);
  const out = [];
  let speakerCount = 0;
  const listenerSeen = new Set();
  for (const c of cues) {
    if (!c.action) {
      out.push(c);
      continue;
    }
    const action = policy.map?.[c.action] || c.action;
    if (grave && !(policy.grave || ['nod', 'steeple']).includes(action)) continue;
    const only = policy.only?.[action];
    if (only && !(Array.isArray(only) ? only : [only]).includes(where)) continue;
    if (c.slot) {
      const list = listOf(policy.listener, listenerId) || ['nod', 'look_partner'];
      if (!list.includes(action) || listenerSeen.has(action)) continue;
      listenerSeen.add(action);
    } else {
      if (!allowFor(speakerId).includes(action) || speakerCount >= capFor(speakerId)) continue;
      if (budget && budget.left <= 0) continue;
      speakerCount++;
      if (budget) budget.left--;
    }
    out.push({ ...c, action });
  }
  return out;
}

// ---------------------------------------------------------------- the validator

/**
 * Validate and normalize a model bulletin. Unknown story ids are dropped,
 * fields are clamped, and intro/outro are guaranteed. Optional graphics
 * fields (kicker, numbers, quote, map, feature, roundup) appear on a story
 * segment only when they are valid and supported by its source. With
 * `program` (the programme config) its editorial rules are applied too:
 * headline length, chat placement, emotions, gestures, question marks, the
 * slot of the number of the day.
 */
export function normalizeBulletin(
  raw,
  stories,
  { channelName = 'LIVENEWS', maxStories = Infinity, maxChats = 3, solo = false, features = FEATURES, ownNames = [], program = null, presenters = null } = {}
) {
  const names = [channelName, ...ownNames];
  const byId = new Map(stories.map((s) => [s.id, s]));
  const allowed = FEATURES.filter((f) => features.includes(f));
  const sourceOf = (story) => `${story.title}. ${story.summary || ''}`;
  // Intro, chats and outro may only mention figures from the stories offered.
  const allSources = stories.map(sourceOf).join(' ');
  const headlineMax = program?.headlineMax || HEADLINE_MAX;
  const used = new Set();

  // Phase 1: each segment on its own, text still carrying its [cues].
  const drafts = [];
  for (const seg of Array.isArray(raw?.segments) ? raw.segments : []) {
    const type = pick(seg?.type, TYPES, null);
    if (!type) continue;
    const story = type === 'story' ? byId.get(seg.storyId) : null;
    if (type === 'story' && (!story || used.has(story.id) || used.size >= maxStories)) continue;
    const source = story ? sourceOf(story) : allSources;
    const emotion = pick(seg.emotion, EMOTIONS, 'neutral');
    const withCues = Array.isArray(seg.cues) && seg.cues.length ? embedCues(String(seg.text ?? ''), seg.cues) : seg.text;
    const tagged = groundedText(clean(withCues, 2000), source, names, type);
    if (!stripTags(tagged)) continue;
    const anchor = seg.anchor === 'B' && !solo ? 'B' : 'A';
    const d = { type, anchor, emotion, tagged, seg, story, source };
    if (type === 'story') {
      used.add(story.id);
      d.heavy = emotion === 'serious' || emotion === 'sad' || isGrave(source);
      d.breaking = seg.breaking === true && (isBreaking(story.title) || /\bbreaking news\b/i.test(story.summary || ''));
      d.location = groundedLocation(seg.location, source);
      d.numbers = normalizeNumbers(seg.numbers, source);
      let fact = clipWords(seg.fact, LIMITS.fact) || null;
      if (fact && !claimGrounded(fact, source)) fact = null;
      d.fact = fact;
      const quote = seg.quote ?? seg.quoteFromSummary;
      d.quote = quote ? groundQuote(quote, story.summary) : null;
      d.map = normalizeMap(seg.map, source);
      d.kicker = normalizeKicker(seg.kicker, source);
      let feature = pick(seg.feature, allowed, null);
      // Breaking news is never a feature; grave news can be a round-up item, never the number or the lighter.
      if (feature && (d.breaking || (d.heavy && feature !== 'roundup'))) feature = null;
      if (feature === 'roundup' && !d.location) feature = null;
      d.feature = feature;
      // The headline: the writer's, if it is a complete, grounded phrase; else the outlet's own, shortened cleanly.
      const own = shortHeadline(story.title, headlineMax);
      const proposed = textLike(seg.headline) ? shortHeadline(seg.headline, headlineMax) : '';
      d.headline = proposed && !danglingHeadline(proposed) && claimGrounded(proposed, source, 0.6) ? proposed : own;
    }
    drafts.push(d);
  }
  if (!used.size) throw new Error('bulletin has no valid stories');

  const intro = drafts.find((d) => d.type === 'intro') || null;
  const outro = drafts.find((d) => d.type === 'outro') || null;

  // Phase 2: the running order. A story carries the chats that react to it.
  const units = [];
  for (const d of drafts) {
    if (d.type === 'story') units.push({ story: d, chats: [] });
    else if (d.type === 'chat' && units.length) units.at(-1).chats.push(d);
  }
  // A breaking story always leads (stable among themselves).
  units.sort((x, y) => Number(y.story.breaking) - Number(x.story.breaking));
  // The number of the day is never the lead; some programmes air it last.
  if (units[0]?.story.feature === 'number') units[0].story.feature = null;
  if (program?.numberSlot === 'last') {
    const i = units.findIndex((u) => u.story.feature === 'number');
    if (i >= 0 && i < units.length - 1) {
      const [u] = units.splice(i, 1);
      const lighterLast = units.at(-1)?.story.feature === 'lighter';
      units.splice(lighterLast ? units.length - 1 : units.length, 0, u);
    }
  }
  const storyList = units.map((u) => u.story);
  // One number of the day, spoken; "and finally" only last and never straight after grave news.
  let numberSeen = false;
  storyList.forEach((s, i) => {
    if (s.feature === 'number') {
      const value = s.numbers?.[0]?.value || (s.fact && numbersIn(s.fact)[0]?.raw) || null;
      if (numberSeen || !value || !mentionsValue(stripTags(s.tagged), value)) s.feature = null;
      else {
        numberSeen = true;
        if (!/\bnumber of the day\b/i.test(s.tagged)) s.tagged = prependLine(s.tagged, `Our number of the day: ${value.toLowerCase()}.`);
      }
    }
    if (s.feature === 'lighter') {
      if (i !== storyList.length - 1 || storyList[i - 1]?.heavy) s.feature = null;
      else if (!/\band finally\b/i.test(s.tagged)) s.tagged = prependLine(s.tagged, 'And finally:', { glue: true });
    }
  });

  // Chats: never next to grave news, only where the programme wants them, trimmed by priority.
  const policy = program?.chats || null;
  const chatSlots = [];
  units.forEach((u, i) => {
    const next = units[i + 1]?.story;
    const slot = i === 0 ? 'lead' : u.story.feature === 'lighter' ? 'lighter' : 'story';
    u.chats = u.chats.filter((c) => !u.story.heavy && !(next && next.heavy) && (!policy?.after || policy.after.includes(slot)));
    const perSlot = policy?.max?.[slot];
    if (Number.isInteger(perSlot)) u.chats = u.chats.slice(0, perSlot);
    u.chats.forEach((c) => chatSlots.push({ c, u, slot }));
  });
  const priority = policy?.after || null;
  let total = chatSlots.length;
  if (total > maxChats) {
    if (priority) {
      for (const slot of [...priority].reverse()) {
        for (const entry of chatSlots.filter((e) => e.slot === slot).reverse()) {
          if (total <= maxChats) break;
          entry.u.chats = entry.u.chats.filter((c) => c !== entry.c);
          total--;
        }
      }
    } else {
      let kept = 0;
      for (const u of units) u.chats = u.chats.filter(() => kept++ < maxChats);
    }
  }
  const body = units.flatMap((u) => [u.story, ...u.chats]);
  applyRoundup(body, program);
  for (const s of storyList) if (s.feature) s.kicker = FEATURE_KICKERS[s.feature];

  // Phase 3: text rules across the episode.
  const all = [intro, ...body, outro].filter(Boolean);
  const introSentences = intro ? sentencesOf(intro.tagged).map(stripTags) : [];
  let thanks = 0;
  let questions = 0;
  for (const d of all) {
    const out = [];
    let spoken = 0;
    for (const sentence of sentencesOf(d.tagged)) {
      const plain = stripTags(sentence);
      let s = sentence;
      // Stage directions on their own ride with the sentence before them.
      if (!plain) {
        if (out.length) out[out.length - 1] += ` ${sentence}`;
        else out.push(sentence);
        continue;
      }
      if (PICKUP.test(plain)) {
        if (program?.thanksMax !== undefined && thanks >= program.thanksMax) continue;
        thanks++;
      }
      if (program?.noQuestions && /\?/.test(plain)) {
        if (NAME_TOSS.test(plain) && d.type !== 'chat') s = s.replace(/\?(\s*(?:\[[^\]]*\]\s*)*)$/, '.$1');
        else if (d.type !== 'chat' || questions >= 1) continue;
        else questions++;
      }
      // No sentence twice: within a segment, nor the lead repeating the intro's line about it.
      const againstIntro = d === storyList[0] ? introSentences : [];
      const outlet = new Set(contentWords(d.story?.source || ''));
      if ([...out.map(stripTags), ...againstIntro].some((o) => repeats(plain, o, outlet))) continue;
      out.push(s);
      spoken++;
    }
    // Never empty a segment: when every sentence would go, it stays as written.
    if (spoken) d.tagged = out.join(' ');
  }

  // Phase 4: finalize every segment.
  const happyOnly = program?.happyOnly || null;
  const lastStory = storyList.at(-1);
  const roleOf = (d) => (d.type !== 'story' ? d.type : d.feature === 'lighter' ? 'lighter' : d === lastStory ? 'last' : d === storyList[0] ? 'lead' : 'story');
  const budget = Number.isInteger(program?.gestures?.perEpisode) ? { left: program.gestures.perEpisode } : null;
  const finalize = (d, prevHeavy) => {
    const grave = d.type === 'story' ? d.heavy : prevHeavy;
    const parsed = parseCues(d.tagged, { grave: grave || prevHeavy });
    const text = clip(parsed.text, LIMITS.text);
    if (!text) return null;
    const speaker = d.anchor;
    const where = d.type === 'story' && d === storyList[0] ? 'lead' : d.type;
    const cues = applyGestures(
      parsed.cues.filter((c) => c.char <= text.length && (!c.slot || (c.slot === 'B' ? !solo : true))).map((c) => ({ ...c, slot: c.slot === speaker ? null : c.slot })),
      program?.gestures,
      { speakerId: presenters?.[speaker]?.id, listenerId: presenters?.[speaker === 'A' ? 'B' : 'A']?.id, grave: d.type === 'story' && d.heavy, where, budget }
    );
    let emotion = d.emotion;
    if (emotion === 'happy' && happyOnly && !happyOnly.some((r) => r === roleOf(d) || (r === 'last' && d === lastStory))) emotion = 'neutral';
    const base = { type: d.type, anchor: d.anchor, emotion, text, cues };
    if (d.type !== 'story') return base;
    const s = d.story;
    const inRoundup = d.feature === 'roundup' && d.roundup;
    // A figure goes on a card only if the presenter says it.
    const spoken = (v) => v && mentionsValue(text, v);
    const numbers = !inRoundup && d.numbers ? d.numbers.filter((n) => spoken(n.value)) : null;
    let fact = !inRoundup && d.fact && (!/\d/.test(d.fact) || spoken(d.fact)) ? d.fact : null;
    if (!fact && !inRoundup && numbers?.length) fact = clipWords([numbers[0].qualifier, numbers[0].value, numbers[0].label].filter(Boolean).join(' '), LIMITS.fact);
    const shot = inRoundup ? 'map' : pick(d.seg.shot, SHOTS, 'wide');
    const out = {
      ...base,
      storyId: s.id,
      headline: d.headline,
      shot: shot === 'map' && !d.location ? 'close' : shot,
      // Only what the outlet itself calls breaking news goes out as breaking.
      breaking: d.breaking,
      location: d.location,
      fact,
      source: s.source,
      category: s.category,
      hasImage: !!s.image,
    };
    if (d.kicker) out.kicker = d.kicker;
    if (numbers?.length) out.numbers = numbers;
    if (d.quote && !inRoundup) out.quote = { text: clip(d.quote.text, LIMITS.quote), by: d.quote.by ? clipWords(d.quote.by, LIMITS.by) : null };
    if (d.map && !inRoundup) out.map = d.map;
    if (d.feature) out.feature = d.feature;
    if (inRoundup) out.roundup = d.roundup;
    return out;
  };

  const gestureDefault = (kind) => program?.gestures?.defaults?.[kind] || 'wave';
  const introSeg = (intro && finalize(intro, false)) || {
    type: 'intro',
    anchor: 'A',
    emotion: program?.gestures ? 'neutral' : 'happy',
    text: `Hello and welcome to ${channelName}. Here are the headlines.`,
    cues: [{ char: 0, slot: null, action: gestureDefault('intro') }],
  };
  const finalBody = [];
  let prevHeavy = false;
  for (const d of body) {
    const out = finalize(d, prevHeavy);
    if (out) finalBody.push(out);
    if (d.type === 'story') prevHeavy = d.heavy;
    else prevHeavy = false;
  }
  const outroSeg = (outro && finalize(outro, lastStory?.heavy)) || {
    type: 'outro',
    anchor: solo ? 'A' : program?.outroAnchor || 'B',
    emotion: program?.gestures ? 'neutral' : 'happy',
    text: `That's all for now. Stay with us, ${channelName} is live around the clock.`,
    cues: [{ char: 0, slot: null, action: gestureDefault('outro') }],
  };
  while (finalBody.length && finalBody[0].type === 'chat') finalBody.shift();

  const rundown = finalBody
    .filter((s) => s.type === 'story')
    .map((s) => ({ storyId: s.storyId, headline: s.headline, source: s.source, category: s.category, hasImage: s.hasImage, ...(s.kicker ? { kicker: s.kicker } : {}) }));
  // Which rundown story each intro sentence is about, so the montage can cut on it.
  const teases = Array.isArray(raw?.segments?.find?.((x) => x?.type === 'intro')?.teases) ? raw.segments.find((x) => x?.type === 'intro').teases : null;
  if (teases && intro && introSeg.type === 'intro') {
    const ids = new Set(rundown.map((r) => r.storyId));
    const list = teases.slice(0, sentencesOf(introSeg.text).length).map((id) => (ids.has(id) ? id : null));
    if (list.some(Boolean)) introSeg.teases = list;
  }

  return {
    title: clean(raw?.title, LIMITS.title) || 'News bulletin',
    segments: [introSeg, ...finalBody, outroSeg],
    rundown,
    storyIds: finalBody.filter((s) => s.type === 'story').map((s) => s.storyId),
  };
}

/**
 * The round-up: one run of 2-4 consecutive located stories (a chat breaks the
 * run), each in a different country, one sentence each, marked with its
 * position. Its title loses "in 30 seconds" when the run is short or the
 * programme (NEWS IN 60) is itself a minute long.
 */
function applyRoundup(body, program) {
  const max = program?.roundup?.max || MAX_ROUNDUP;
  const drop = (s) => (s.feature = null);
  const countryOf = (s) => {
    const e = lookupPlace(s.location?.place || '');
    return e ? e.country || e.name : s.location?.place;
  };
  let run = [];
  let kept = false;
  const close = () => {
    const items = [];
    for (const s of run) {
      if (items.length >= max || (items.length && countryOf(items.at(-1)) === countryOf(s))) drop(s);
      else items.push(s);
    }
    if (items.length >= 2 && !kept) {
      kept = true;
      const timed = program?.roundup?.timed !== false && items.length >= 3;
      items.forEach((s, index) => {
        s.roundup = { index, count: items.length };
        s.shot = 'map';
        // One sentence per item: the title line (first item) plus the item itself.
        const parts = sentencesOf(s.tagged);
        const isTitle = (p) => /\baround the world\b/i.test(stripTags(p)) && stripTags(p).split(' ').length <= 9;
        const isLead = (p) => isTitle(p) || PICKUP.test(stripTags(p)) || (/^(?:First|Next|Now|To|Over to|And to finish)\b[^.]*\.$/.test(stripTags(p)) && stripTags(p).split(' ').length <= 6);
        const lead = parts.filter((p, i) => i < 3 && isLead(p));
        const rest = parts.filter((p) => !lead.includes(p));
        s.tagged = [...lead, ...rest.slice(0, 1)].join(' ') || s.tagged;
        if (!timed) s.tagged = s.tagged.replace(/\baround the world in (?:30|60) seconds\b/gi, 'around the world');
      });
    } else items.forEach(drop);
    run = [];
  };
  for (const s of body) {
    if (s.type === 'story' && s.feature === 'roundup') run.push(s);
    else close();
  }
  close();
}

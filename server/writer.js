// Builds the prompt for the news writer and turns the model's JSON reply into
// a safe, validated bulletin for the renderer. The validator is the last line
// of defence for accuracy: anything on screen or in the spoken text that the
// source headline/summary does not support (a number, a quote, a place) is
// dropped here, whatever the writer was.
import { parseCues, embedCues, describeActions } from '../public/js/cues.js';
import { isBreaking } from './news.js';
import { claimGrounded, groundQuote, isGrave, numbersGrounded } from './facts.js';
import { degreesApart, lookupPlace, placeSupported } from './gazetteer.js';

export const EMOTIONS = ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking'];
export const SHOTS = ['wide', 'close', 'full', 'map'];
const TYPES = ['intro', 'story', 'chat', 'outro'];

/** Recurring programme features a story segment may be part of (see CONTRACTS.md). */
export const FEATURES = ['number', 'roundup', 'lighter'];
export const FEATURE_KICKERS = { number: 'NUMBER OF THE DAY', roundup: 'AROUND THE WORLD', lighter: 'AND FINALLY' };

const LIMITS = { text: 520, headline: 56, title: 80, place: 32, fact: 48, kicker: 18, value: 12, label: 24, quote: 140, by: 32 };
const MAX_NUMBERS = 3;
const MAX_MAP = 4;
const MAX_ROUNDUP = 4;

const FEATURE_RULES = {
  number:
    '"number" (NUMBER OF THE DAY): one story whose summary states a striking figure. Open with the figure ("Our number of the day: 40,000.") and explain it in the words of the summary. Fill "numbers" for it. Only one per episode, never for a grave story.',
  roundup:
    '"roundup" (AROUND THE WORLD IN 30 SECONDS): two to four brief items, one sentence each, for stories that happen in a place named in their candidate. Write them as consecutive story segments with "feature": "roundup", "shot": "map" and a "location". The first item opens the round-up ("Now, around the world in 30 seconds."); each item names its place early ("In Kenya, ..."). No chat inside it.',
  lighter:
    '"lighter" (AND FINALLY): the last story is a lighter, human or curious one, introduced with "And finally". Never a grave story.',
};

const SEGMENT_SCHEMA = (slots) => `{
  "title": "short episode title",
  "segments": [
    {"type": "intro", "anchor": ${slots}, "emotion": "happy", "text": "cold open line, greeting and teaser (max 3 sentences)"},
    {"type": "story", "storyId": "<candidate id>", "anchor": ${slots}, "emotion": "neutral|happy|serious|surprised|sad|thinking",
     "headline": "on-screen caption, max 48 characters", "text": "<story text>",
     "shot": "wide|close|full|map", "breaking": false,
     "location": {"place": "CITY, COUNTRY", "lat": 0.0, "lon": 0.0} | null,
     "fact": "KEY FIGURE FROM THE SUMMARY, max 40 characters" | null,
     "kicker": "TOPIC LABEL" | null,
     "numbers": [{"value": "40,000", "label": "PASSENGERS A DAY"}] | null,
     "quote": {"text": "exact words quoted in the summary", "by": "speaker named in the summary" | null} | null,
     "map": [{"place": "COUNTRY", "lat": 0.0, "lon": 0.0}] | null,
     "feature": "number|roundup|lighter" | null},
    {"type": "chat", "anchor": ${slots}, "emotion": "...", "text": "one or two sentence reaction or hand-over"},
    {"type": "outro", "anchor": ${slots}, "emotion": "happy", "text": "brief sign-off"}
  ]
}`;

const ACCURACY = `ACCURACY RULES (mandatory)
- Use ONLY facts present in each candidate's "headline" and "summary". Never invent numbers, names, quotes, dates, causes or consequences.
- If a summary is thin, say less; never fill gaps with assumptions.
- Attribute naturally ("the BBC reports", "according to Al Jazeera").
- No political opinions and no judgements about real people.`;

const firstName = (p) => String(p?.name || '').replace(/^(?:Dr|Mr|Ms|Mrs|Prof)\.?\s+/i, '').split(/\s+/)[0];

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
  const input = stories.map((s) => ({
    id: s.id,
    outlet: s.source,
    section: s.category,
    outletsCovering: s.outlets || 1,
    headline: s.title,
    summary: s.summary.slice(0, 700),
    ...(s.live ? { liveBlog: true } : {}),
  }));
  const cast = Object.entries(presenters)
    .map(([slot, p]) => `- ${slot}: ${p.name}, ${p.personality}.`)
    .join('\n');
  const [a, b] = [firstName(presenters.A), firstName(presenters.B)];
  const chemistry = solo ? '' : `\n${program.chemistry ? `Chemistry: ${program.chemistry}` : `Chemistry: ${a} and ${b} are a team who like each other; let their personalities show in small touches, never at the expense of the facts.`}`;

  return `You are the editorial team of "${channelName}", a 24-hour English-language news channel with a retro pixel-art look. You are writing an episode of the programme "${program.title}" (${program.tagline}).
Programme style: ${program.style}
Current time: ${when} UTC.

PRESENTERS
${cast}${chemistry}

TASK
1. From the CANDIDATES below, select the ${n} stories of greatest interest and impact for an international audience that fit this programme. Prefer stories many outlets are covering ("outletsCovering" > 1). Avoid purely local or niche items, celebrity gossip, shopping deals, product reviews, sports minutiae, opinion pieces and live blogs with no clear news line ("liveBlog": true marks rolling coverage: call it a developing story, never breaking news). Keep some variety.
2. Order them like a real newsroom: the biggest story first${features.includes('lighter') ? ', a lighter one last' : ''}.
3. Write the script in English, to be read aloud by a synthetic voice.

${ACCURACY}
- A "why it matters" line is welcome only when the summary itself says what follows from the news (a purpose, a consequence, who is affected); say it in the summary's terms, attributed if needed. Otherwise leave it out.

TONE
- Grave stories (deaths, war, disasters, violence, illness): sober tone, emotion "serious" or "sad", no jokes or light banter before or after them.
- Lighter stories: engaging and a little witty, true to each presenter's personality.
- No emojis, no markdown, spell out unusual abbreviations.

MAKE IT WORTH WATCHING
- Cold open: the intro starts with one gripping line built from the top story's headline, then the greeting${solo ? '' : ' (both presenters may be named)'}, then a teaser of one or two more stories ("Also coming up: ...").
- Each story opens with its most striking fact, then attribution, then one or two details. Vary the openings and the attribution; never start two stories the same way.
- Rhythm for the voice: one idea per sentence; mix short and medium sentences, with the odd three-to-five-word sentence for punch. No parentheses, no strings of numbers, no stacked clauses. Write figures as digits with their unit ("40,000 passengers") and say "percent".${
    solo
      ? ''
      : `
- Hand-overs: when the next story is read by the other presenter, sometimes end with a natural toss using their first name ("${b}?" or "Over to you, ${b}."), or let them pick it up ("Thanks, ${a}."). Vary it, and not after grave stories.
- Chat segments are short exchanges that sound like these two people: react to what was just said, add no new facts, and lead into what comes next.`
  }
${
  features.length
    ? `
RECURRING FEATURES (only when the candidates support them; otherwise skip them)
${features.map((f) => `- ${FEATURE_RULES[f]}`).join('\n')}
`
    : ''
}
GRAPHICS FIELDS (optional: null or left out when the source does not support them)
- "kicker": a 1 to 3 word topic label for the strap, max 18 characters, in capitals (e.g. "VOLCANO", "TRANSPORT"). Never "BREAKING" or "LIVE".
- "numbers": up to ${MAX_NUMBERS} figures the summary states, each {"value": "40,000", "label": "PASSENGERS A DAY"}, copied exactly, label in the summary's words.
- "quote": only if the summary literally contains a quotation in quotation marks: copy those words exactly; "by" only if the summary names the speaker.
- "map": when a story names two to ${MAX_MAP} places (e.g. two countries signing a deal), one entry per place.

STAGE DIRECTIONS (make the presenters move naturally)
- Inside any "text" you may place cues in square brackets exactly where the movement should happen; they are not read aloud.
- "[action]" is performed by the presenter speaking${solo ? '' : '; "[A:action]" or "[B:action]" makes a specific presenter do it (e.g. the co-presenter reacting with "[B:nod]" while A speaks, or "[A:nod]" while B speaks)'}.
- Actions: ${describeActions()}.
- An emotion name in brackets (e.g. "[surprised]") changes the speaker's expression from that point.
- Use 1 to 3 cues per segment, varied and motivated by what is said: wave when greeting or signing off, point_screen when introducing pictures, count when listing, lean_in for important points, shrug for uncertainty${solo ? '' : ', look_partner or point_partner on hand-overs'}.
- Never use wave, thumbs_up, fist_pump, facepalm, laugh or wow in grave stories.

OUTPUT FORMAT
Reply with ONLY a valid JSON object, no text before or after, shaped like this:
${SEGMENT_SCHEMA(solo ? '"A"' : '"A" | "B"')}
- Story "text": ${program.storyLength}.
- Exactly one "story" segment per selected story, using the candidate ids exactly; do not include unselected candidates.
${solo ? '- There is a single presenter: always use "anchor": "A".' : '- Alternate presenters between stories.'}
- "shot": "map" when the story happens in a specific place, "full" when it is very visual, "close" for important stories, "wide" otherwise.
- "location": only when the story clearly happens in a specific city, region or country named in the candidate; give approximate coordinates of that place. Otherwise null.
- "fact": only when the summary states a concrete figure (e.g. "40,000 EVACUATED", "$2BN DEAL", "7.1 MAGNITUDE"); copy it faithfully. Otherwise null.
- "breaking": true only if the candidate's headline explicitly says it is breaking news.
- ${program.maxChats ? `At most ${program.maxChats} "chat" segments in total.` : 'No "chat" segments.'}

CANDIDATES
${JSON.stringify(input, null, 2)}`;
}

/** Second pass: an editor checks the script against the sources and fixes it. */
export function buildReviewPrompt({ channelName, program, script, stories }) {
  const sources = stories.map((s) => ({ id: s.id, outlet: s.source, headline: s.title, summary: s.summary.slice(0, 700) }));
  return `You are the standards editor of "${channelName}", checking a script for the programme "${program.title}" before it goes on air.

Check every story segment against its SOURCE (matched by storyId):
- Remove or correct any claim, number, name, quote, place or cause that is not supported by the source headline/summary.
- Make sure the "fact" field (if any) appears in the source, otherwise set it to null.
- Make sure every "numbers" value is stated in the source, a "quote" is copied word for word from a quotation in the source, and every "map" place is named in the source; otherwise remove them.
- Make sure "location" matches a place named in the source, otherwise set it to null.
- A "why it matters" line must follow from the source itself; remove it otherwise.
- Fix tone problems (no jokes near grave stories) and anything hard to read aloud.
- Keep the bracketed stage directions such as [wave] or [B:nod] (they are not read aloud); remove only ones that are inappropriate for the tone.
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

// Shorten at a word boundary, without ellipsis (for on-screen captions).
function clipWords(value, max) {
  const t = clean(value, 400);
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const words = /\s/.test(cut) ? cut.replace(/\s+\S*$/, '') : cut.slice(0, max);
  return words.replace(/[\s,.:;|\-–—]+$/, '');
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
 * A location must name a place the story names. A well-known city whose
 * coordinates are clearly off (more than 3 degrees) is put back where it is.
 */
function groundedLocation(loc, source) {
  const l = normalizeLocation(loc);
  if (!l || !placeSupported(l.place, source)) return null;
  const known = lookupPlace(l.place);
  if (known?.kind === 'city' && degreesApart(l, known) > 3) return { ...l, lat: known.lat, lon: known.lon };
  return l;
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

function normalizeNumbers(list, source) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || !textLike(item.value)) continue;
    const value = clean(item.value, LIMITS.value + 8);
    if (!/\d/.test(value) || value.length > LIMITS.value || !numbersGrounded(value, source)) continue;
    const label = textLike(item.label) ? clipWords(item.label, LIMITS.label).toUpperCase() : '';
    if (label && !claimGrounded(label, source)) continue;
    if (out.some((o) => o.value === value)) continue;
    out.push({ value, label });
    if (out.length >= MAX_NUMBERS) break;
  }
  return out.length ? out : null;
}

const BANNED_KICKER = /\b(?:BREAKING|LIVE|EXCLUSIVE|URGENT|JUST IN|ALERT)\b/;

function normalizeKicker(value, source) {
  if (!textLike(value)) return null;
  const k = clipWords(String(value).replace(/[^\p{L}\p{N} &'’-]/gu, ' '), LIMITS.kicker).toUpperCase();
  if (!k || BANNED_KICKER.test(k) || !numbersGrounded(k, source)) return null;
  return k;
}

// Sentences of a script text (cue tags may sit anywhere). Decimals such as
// "7.1" do not split: a sentence ends at punctuation followed by a space.
const sentencesOf = (text) => String(text).split(/(?<=[.!?…])\s+(?=[\["“'A-Z0-9])/);
const stripTags = (s) => s.replace(/\[[^\]]*\]/g, ' ');

/** Drop every sentence that states a number the sources do not. */
function groundedText(text, source) {
  const kept = sentencesOf(text).filter((s) => numbersGrounded(stripTags(s), source));
  return kept.join(' ');
}

/**
 * Validate and normalize a model bulletin. Unknown story ids are dropped,
 * fields are clamped, and intro/outro are guaranteed. Optional graphics
 * fields (kicker, numbers, quote, map, feature, roundup) appear on a story
 * segment only when they are valid and supported by its source.
 */
export function normalizeBulletin(
  raw,
  stories,
  { channelName = 'LIVENEWS', maxStories = Infinity, maxChats = 3, solo = false, features = FEATURES } = {}
) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const allowed = FEATURES.filter((f) => features.includes(f));
  const sourceOf = (story) => `${story.title}. ${story.summary || ''}`;
  // Intro, chats and outro may only mention figures from the stories offered.
  const allSources = stories.map(sourceOf).join(' ');
  const used = new Set();
  const segments = [];
  let chats = 0;
  for (const seg of Array.isArray(raw?.segments) ? raw.segments : []) {
    const type = pick(seg?.type, TYPES, null);
    if (!type) continue;
    const story = type === 'story' ? byId.get(seg.storyId) : null;
    if (type === 'story' && (!story || used.has(story.id) || used.size >= maxStories)) continue;
    const source = story ? sourceOf(story) : allSources;
    const emotion = pick(seg.emotion, EMOTIONS, 'neutral');
    const grave = emotion === 'serious' || emotion === 'sad';
    const withCues = Array.isArray(seg.cues) && seg.cues.length ? embedCues(String(seg.text ?? ''), seg.cues) : seg.text;
    const parsed = parseCues(groundedText(clean(withCues, 2000), source), { grave });
    const text = clip(parsed.text, LIMITS.text);
    if (!text) continue;
    const anchor = seg.anchor === 'B' && !solo ? 'B' : 'A';
    const cues = parsed.cues
      .filter((c) => c.char <= text.length && (!c.slot || (c.slot === 'B' ? !solo : true)))
      .map((c) => ({ ...c, slot: c.slot === anchor ? null : c.slot }));
    const base = { type, anchor, emotion, text, cues };
    if (type === 'story') {
      used.add(story.id);
      const location = groundedLocation(seg.location, source);
      const shot = pick(seg.shot, SHOTS, 'wide');
      const numbers = normalizeNumbers(seg.numbers, source);
      let fact = clipWords(seg.fact, LIMITS.fact) || null;
      if (fact && !claimGrounded(fact, source)) fact = null;
      if (!fact && numbers) fact = clipWords([numbers[0].value, numbers[0].label].filter(Boolean).join(' '), LIMITS.fact);
      const quote = seg.quote ?? seg.quoteFromSummary;
      const grounded = quote ? groundQuote(quote, story.summary) : null;
      const map = normalizeMap(seg.map, source);
      const heavy = grave || isGrave(source);
      let feature = pick(seg.feature, allowed, null);
      if (feature === 'number' && (heavy || !(numbers || (fact && /\d/.test(fact))))) feature = null;
      if (feature === 'lighter' && heavy) feature = null;
      if (feature === 'roundup' && !location) feature = null;
      const headline = clipWords(seg.headline, LIMITS.headline);
      const out = {
        ...base,
        storyId: story.id,
        headline: headline && numbersGrounded(headline, source) ? headline : clipWords(story.title, LIMITS.headline),
        shot: shot === 'map' && !location ? 'close' : shot,
        // Only what the outlet itself calls breaking news goes out as breaking.
        breaking: seg.breaking === true && (isBreaking(story.title) || /\bbreaking news\b/i.test(story.summary || '')),
        location,
        fact,
        source: story.source,
        category: story.category,
        hasImage: !!story.image,
      };
      const kicker = normalizeKicker(seg.kicker, source);
      if (kicker) out.kicker = kicker;
      if (numbers) out.numbers = numbers;
      if (grounded) out.quote = { text: clip(grounded.text, LIMITS.quote), by: grounded.by ? clipWords(grounded.by, LIMITS.by) : null };
      if (map) out.map = map;
      if (feature) out.feature = feature;
      segments.push(out);
    } else if (type === 'chat') {
      if (chats >= maxChats) continue;
      chats++;
      segments.push(base);
    } else {
      segments.push(base);
    }
  }

  if (!used.size) throw new Error('bulletin has no valid stories');

  // Intro first, outro last, at most one of each.
  const intro = segments.find((s) => s.type === 'intro') || {
    type: 'intro',
    anchor: 'A',
    emotion: 'happy',
    text: `Hello and welcome to ${channelName}. Here are the headlines.`,
    cues: [{ char: 0, slot: null, action: 'wave' }],
  };
  const outro = segments.find((s) => s.type === 'outro') || {
    type: 'outro',
    anchor: solo ? 'A' : 'B',
    emotion: 'happy',
    text: `That's all for now. Stay with us, ${channelName} is live around the clock.`,
    cues: [{ char: 0, slot: null, action: 'wave' }],
  };
  const body = segments.filter((s) => s.type === 'story' || s.type === 'chat');
  while (body.length && body[0].type === 'chat') body.shift();
  applyFeatures(body);

  const rundown = body
    .filter((s) => s.type === 'story')
    .map((s) => ({ storyId: s.storyId, headline: s.headline, source: s.source, category: s.category, hasImage: s.hasImage }));

  return {
    title: clean(raw?.title, LIMITS.title) || 'News bulletin',
    segments: [intro, ...body, outro],
    rundown,
    storyIds: [...used],
  };
}

/**
 * Episode-level rules for the recurring features: one number of the day, an
 * "and finally" only as the last story, and one round-up of 2-4 consecutive
 * stories (each marked with its position). A story whose feature is dropped
 * becomes an ordinary story. Features that survive get their kicker.
 */
function applyFeatures(body) {
  const storiesOnly = body.filter((s) => s.type === 'story');
  const drop = (s) => delete s.feature;
  let numberSeen = false;
  for (const s of storiesOnly) {
    if (s.feature !== 'number') continue;
    if (numberSeen) drop(s);
    numberSeen = true;
  }
  for (const s of storiesOnly) if (s.feature === 'lighter' && s !== storiesOnly.at(-1)) drop(s);
  // Round-up runs: consecutive story segments (a chat breaks the run).
  let run = [];
  let kept = false;
  const close = () => {
    if (run.length >= 2 && !kept) {
      kept = true;
      run.slice(MAX_ROUNDUP).forEach(drop);
      const items = run.slice(0, MAX_ROUNDUP);
      items.forEach((s, index) => {
        s.roundup = { index, count: items.length };
        s.shot = 'map';
      });
    } else run.forEach(drop);
    run = [];
  };
  for (const s of body) {
    if (s.type === 'story' && s.feature === 'roundup') run.push(s);
    else close();
  }
  close();
  for (const s of storiesOnly) if (s.feature && !s.kicker) s.kicker = FEATURE_KICKERS[s.feature];
}

// Builds the prompt for the news writer and turns the model's JSON reply into
// a safe, validated bulletin for the renderer.
import { parseCues, embedCues, describeActions } from '../public/js/cues.js';

export const EMOTIONS = ['neutral', 'happy', 'serious', 'surprised', 'sad', 'thinking'];
export const SHOTS = ['wide', 'close', 'full', 'map'];
const TYPES = ['intro', 'story', 'chat', 'outro'];

const LIMITS = { text: 520, headline: 56, title: 80, place: 32, fact: 48 };

const SEGMENT_SCHEMA = (slots) => `{
  "title": "short episode title",
  "segments": [
    {"type": "intro", "anchor": ${slots}, "emotion": "happy", "text": "greeting plus a teaser of the top stories (max 3 sentences)"},
    {"type": "story", "storyId": "<candidate id>", "anchor": ${slots}, "emotion": "neutral|happy|serious|surprised|sad|thinking",
     "headline": "on-screen caption, max 48 characters", "text": "<story text>",
     "shot": "wide|close|full|map", "breaking": false,
     "location": {"place": "CITY, COUNTRY", "lat": 0.0, "lon": 0.0} | null,
     "fact": "KEY FIGURE FROM THE SUMMARY, max 40 characters" | null},
    {"type": "chat", "anchor": ${slots}, "emotion": "...", "text": "one-sentence reaction or hand-over"},
    {"type": "outro", "anchor": ${slots}, "emotion": "happy", "text": "brief sign-off"}
  ]
}`;

const ACCURACY = `ACCURACY RULES (mandatory)
- Use ONLY facts present in each candidate's "headline" and "summary". Never invent numbers, names, quotes, dates, causes or consequences.
- If a summary is thin, say less; never fill gaps with assumptions.
- Attribute naturally ("the BBC reports", "according to Al Jazeera").
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
  const input = stories.map((s) => ({
    id: s.id,
    outlet: s.source,
    section: s.category,
    outletsCovering: s.outlets || 1,
    headline: s.title,
    summary: s.summary.slice(0, 700),
  }));
  const cast = Object.entries(presenters)
    .map(([slot, p]) => `- ${slot}: ${p.name}, ${p.personality}.`)
    .join('\n');
  return `You are the editorial team of "${channelName}", a 24-hour English-language news channel with a retro pixel-art look. You are writing an episode of the programme "${program.title}" (${program.tagline}).
Programme style: ${program.style}
Current time: ${when} UTC.

PRESENTERS
${cast}

TASK
1. From the CANDIDATES below, select the ${n} stories of greatest interest and impact for an international audience that fit this programme. Prefer stories many outlets are covering ("outletsCovering" > 1). Avoid purely local or niche items, celebrity gossip, shopping deals, product reviews, sports minutiae, opinion pieces and live blogs with no clear news line. Keep some variety.
2. Order them like a real newsroom: the biggest story first.
3. Write the script in English, to be read aloud.

${ACCURACY}

TONE
- Grave stories (deaths, war, disasters, violence, illness): sober tone, emotion "serious" or "sad", no jokes or light banter before or after them.
- Lighter stories: engaging and a little witty, true to each presenter's personality.
- Short sentences that are easy to say aloud. No emojis, no markdown, spell out unusual abbreviations.

STAGE DIRECTIONS (make the presenters move naturally)
- Inside any "text" you may place cues in square brackets exactly where the movement should happen; they are not read aloud.
- "[action]" is performed by the presenter speaking${solo ? '' : '; "[A:action]" or "[B:action]" makes a specific presenter do it (e.g. the co-presenter reacting with "[B:nod]")'}.
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
- "breaking": true only if the candidate clearly says it is breaking news.
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
- Make sure "location" matches a place named in the source, otherwise set it to null.
- Fix tone problems (no jokes near grave stories) and anything hard to read aloud.
- Keep the bracketed stage directions such as [wave] or [B:nod] (they are not read aloud); remove only ones that are inappropriate for the tone.
- Keep the same JSON structure, segment order, presenters and storyIds. Do not add new stories.

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
 * Validate and normalize a model bulletin. Unknown story ids are dropped,
 * fields are clamped, and intro/outro are guaranteed.
 */
export function normalizeBulletin(raw, stories, { channelName = 'LIVENEWS', maxStories = Infinity, maxChats = 3, solo = false } = {}) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const used = new Set();
  const segments = [];
  let chats = 0;
  for (const seg of Array.isArray(raw?.segments) ? raw.segments : []) {
    const type = pick(seg?.type, TYPES, null);
    if (!type) continue;
    const emotion = pick(seg.emotion, EMOTIONS, 'neutral');
    const grave = emotion === 'serious' || emotion === 'sad';
    const raw = Array.isArray(seg.cues) && seg.cues.length ? embedCues(String(seg.text ?? ''), seg.cues) : seg.text;
    const parsed = parseCues(clean(raw, 2000), { grave });
    const text = clip(parsed.text, LIMITS.text);
    if (!text) continue;
    const cues = parsed.cues
      .filter((c) => c.char <= text.length && (!c.slot || (c.slot === 'B' ? !solo : true)))
      .map((c) => ({ ...c, slot: c.slot === (seg.anchor === 'B' && !solo ? 'B' : 'A') ? null : c.slot }));
    const base = {
      type,
      anchor: seg.anchor === 'B' && !solo ? 'B' : 'A',
      emotion,
      text,
      cues,
    };
    if (type === 'story') {
      const story = byId.get(seg.storyId);
      if (!story || used.has(story.id) || used.size >= maxStories) continue;
      used.add(story.id);
      const location = normalizeLocation(seg.location);
      const shot = pick(seg.shot, SHOTS, 'wide');
      segments.push({
        ...base,
        storyId: story.id,
        headline: clipWords(seg.headline, LIMITS.headline) || clipWords(story.title, LIMITS.headline),
        shot: shot === 'map' && !location ? 'close' : shot,
        breaking: seg.breaking === true,
        location,
        fact: clipWords(seg.fact, LIMITS.fact) || null,
        source: story.source,
        category: story.category,
        hasImage: !!story.image,
      });
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
